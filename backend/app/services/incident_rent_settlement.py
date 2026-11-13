from __future__ import annotations

import os

from sqlalchemy import select

from app.models import Invoice, Transaction, WalletTransaction
from app.services import incident_finance as finance
from app.services import incidents as core
from app.services import operations as ops


def deposit_sources(db, context):
    """
    Tiền thuê là khoản được quyết toán trước.

    Đối chiếu cọc với giao dịch thu gốc và biến động ví.
    Không suy nguồn tiền từ riêng rental.deposit_held.
    """
    rental = context["rental"]
    incident = context["incident"]
    wallet = context["wallet"]

    rows = db.scalars(
        select(Transaction)
        .where(Transaction.rental_id == rental.id)
        .order_by(Transaction.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    ).all()

    sources = []

    for row in rows:
        if row.status == "FAILED":
            continue

        if row.status != "SUCCESS":
            ops.fail(
                409,
                "PENDING_FINANCIAL_TRANSACTION",
                "Chuyến còn giao dịch tài chính chưa hoàn tất.",
            )

        if (
            row.kind == "ADJUSTMENT"
            and row.incident_id == incident.id
        ):
            continue

        if (
            row.kind != "DEPOSIT"
            or row.incident_id is not None
            or row.invoice_id is not None
        ):
            ops.fail(
                409,
                "EXISTING_FINANCIAL_HISTORY",
                "Đã có lịch sử thu/hoàn cần đối chiếu riêng; "
                "không tự quyết toán lại tiền thuê.",
            )

        finance.checked_money(row.amount, "deposit_transaction")

        if row.amount <= finance.ZERO:
            ops.fail(
                409,
                "INVALID_DEPOSIT_TRANSACTION",
                "Giao dịch cọc gốc phải lớn hơn 0.",
            )

        wallet_entry = db.scalar(
            select(WalletTransaction)
            .where(WalletTransaction.transaction_id == row.id)
            .with_for_update()
        )

        if (
            wallet_entry is None
            or wallet_entry.wallet_id != wallet.id
            or wallet_entry.rental_id != rental.id
            or wallet_entry.type != "RENTAL_DEPOSIT"
            or wallet_entry.status != "SUCCESS"
            or wallet_entry.amount != row.amount
        ):
            ops.fail(
                409,
                "DEPOSIT_SOURCE_MISMATCH",
                "Khoản cọc không khớp giao dịch trừ ví gốc.",
            )

        finance.checked_money(
            wallet_entry.balance_before,
            "deposit_balance_before",
        )
        finance.checked_money(
            wallet_entry.balance_after,
            "deposit_balance_after",
        )

        if (
            wallet_entry.balance_before
            - wallet_entry.balance_after
            != row.amount
        ):
            ops.fail(
                409,
                "DEPOSIT_SOURCE_MISMATCH",
                "Số dư trước/sau không khớp khoản cọc.",
            )

        sources.append(row)

    collected = sum(
        (row.amount for row in sources),
        finance.ZERO,
    )

    if collected != rental.deposit_held:
        ops.fail(
            409,
            "DEPOSIT_HELD_MISMATCH",
            "Cọc đang giữ không khớp tổng khoản cọc đã thu.",
        )

    return sources


def settle_rent(db, context, actor, body, idempotency_record):
    finance.require_manager(actor)
    finance.require_case(context)

    if os.getenv("DEMO_PAYMENTS_ENABLED", "").strip().lower() not in {
        "1", "true", "yes",
    }:
        ops.fail(
            503,
            "FEATURE_NOT_ENABLED",
            "Thanh toán mô phỏng chưa được bật.",
        )

    rental = context["rental"]
    incident = context["incident"]
    wallet = context["wallet"]

    if incident.rent_settled_at is not None:
        ops.fail(
            409,
            "RENT_ALREADY_SETTLED",
            "Tiền thuê đã được quyết toán.",
        )

    if incident.status != "CONFIRMED":
        ops.fail(
            409,
            "INVALID_INCIDENT_STATE",
            "Không thu tiền thuê mới trên hồ sơ đã đóng.",
        )

    if incident.billing_cutoff_at is None:
        ops.fail(
            409,
            "BILLING_CUTOFF_REQUIRED",
            "Chưa có mốc dừng cước để quyết toán.",
        )

    if wallet is None or wallet.status != "ACTIVE":
        ops.fail(
            409,
            "WALLET_UNAVAILABLE",
            "Ví khách không ở trạng thái ACTIVE.",
        )

    finance.checked_money(wallet.balance, "wallet_balance")

    existing_invoice = db.scalar(
        select(Invoice.id)
        .where(Invoice.rental_id == rental.id)
        .limit(1)
    )

    if existing_invoice is not None:
        ops.fail(
            409,
            "INVOICE_ALREADY_EXISTS",
            "Chuyến đã có hóa đơn; không tạo hoặc sửa đè.",
        )

    now = core.server_now(db)
    ticket = finance.evidence(context, now)
    values, _ = finance.calculate_rent(db, context, now)

    total = values["total_amount"]
    applied = values["deposit_applied"]
    additional = values["additional_payment"]

    if body.expected_rent_amount != total:
        ops.fail(
            409,
            "RENT_AMOUNT_CHANGED",
            "Số tiền không khớp kết quả tính hiện tại.",
        )

    sources = deposit_sources(db, context)

    if wallet.balance < additional:
        ops.fail(
            409,
            "INSUFFICIENT_BALANCE",
            "Số dư không đủ thanh toán toàn bộ tiền thuê.",
        )

    before = finance.financial_snapshot(incident)
    deposit_before = rental.deposit_held

    invoice = Invoice(
        rental_id=rental.id,
        total_amount=total,
        status="PAID",
        created_at=now,
    )

    db.add(invoice)
    db.flush()

    record_id = (
        idempotency_record.id
        if idempotency_record is not None
        else None
    )

    postings = []
    remaining_to_apply = applied

    for source in sources:
        amount = min(source.amount, remaining_to_apply)

        if amount <= finance.ZERO:
            continue

        posting = Transaction(
            rental_id=rental.id,
            incident_id=incident.id,
            invoice_id=invoice.id,
            actor_id=actor.id,
            idempotency_record_id=record_id,
            kind="PAYMENT",
            status="SUCCESS",
            amount=amount,
            obligation_type="RENTAL_FEE",
            funding_source="DEPOSIT",
            source_transaction_id=source.id,
            business_operation_key="RENT_SETTLEMENT",
            posting_key=f"DEPOSIT:{source.id}",
            decision_ticket_id=ticket.id,
            created_at=now,
        )

        db.add(posting)
        postings.append(posting)
        remaining_to_apply -= amount

    if remaining_to_apply != finance.ZERO:
        ops.fail(
            409,
            "DEPOSIT_ALLOCATION_FAILED",
            "Không phân bổ đủ cọc từ các khoản thu gốc.",
        )

    if additional > finance.ZERO:
        wallet_payment = Transaction(
            rental_id=rental.id,
            incident_id=incident.id,
            invoice_id=invoice.id,
            actor_id=actor.id,
            idempotency_record_id=record_id,
            kind="PAYMENT",
            status="SUCCESS",
            amount=additional,
            obligation_type="RENTAL_FEE",
            funding_source="WALLET",
            business_operation_key="RENT_SETTLEMENT",
            posting_key="WALLET",
            decision_ticket_id=ticket.id,
            created_at=now,
        )

        db.add(wallet_payment)
        postings.append(wallet_payment)
        db.flush()

        balance_before = wallet.balance
        wallet.balance -= additional
        wallet.updated_at = now

        db.add(
            WalletTransaction(
                wallet_id=wallet.id,
                rental_id=rental.id,
                transaction_id=wallet_payment.id,
                idempotency_record_id=record_id,
                amount=additional,
                type="RENTAL_PAYMENT",
                balance_before=balance_before,
                balance_after=wallet.balance,
                status="SUCCESS",
                created_at=now,
            )
        )

    rental.deposit_held = deposit_before - applied
    rental.total_price = total

    incident.rent_settled_at = now
    incident.updated_at = now

    db.flush()

    finance.emit(
        db,
        context,
        actor,
        "RENTAL_INCIDENT_RENT_SETTLED",
        now,
        ticket,
        before=before,
        extra={
            "invoice_id": str(invoice.id),
            "rent_amount": finance.money(total),
            "deposit_applied": finance.money(applied),
            "additional_wallet_payment": finance.money(additional),
            "deposit_remaining_held": finance.money(rental.deposit_held),
            "transaction_ids": [str(row.id) for row in postings],
            "reason": body.reason,
        },
    )

    # Không đổi xe, trạng thái rental, thời điểm trả xe,
    # khuyến mãi hoặc dấu quyết toán bồi thường.
    return {
        "incident_id": str(incident.id),
        "invoice_id": str(invoice.id),
        "rent_amount": finance.money(total),
        "deposit_applied": finance.money(applied),
        "additional_wallet_payment": finance.money(additional),
        "deposit_remaining_held": finance.money(rental.deposit_held),
        "wallet_balance": finance.money(wallet.balance),
        "rent_settled_at": now.isoformat(),
        "transaction_ids": [str(row.id) for row in postings],
    }
