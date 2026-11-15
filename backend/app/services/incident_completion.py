from __future__ import annotations

import os
from decimal import Decimal

from sqlalchemy import select

from app.models import (
    Invoice,
    Transaction,
    WalletTransaction,
)
from app.services import incident_finance as finance
from app.services import incidents as core
from app.services import operations as ops


ZERO = Decimal("0.00")


def fail(code, message):
    ops.fail(409, code, message)


def require_approved(incident):
    if (
        incident.compensation_assessed_amount is None
        or incident.compensation_approved_at is None
        or incident.agreement_status
        not in {"AGREED", "AUTHORITY_DECISION", "NOT_REQUIRED"}
    ):
        fail(
            "COMPENSATION_NOT_APPROVED",
            "Nghĩa vụ bồi thường chưa được ghi nhận hợp lệ.",
        )


def cash_enabled(context):
    if os.getenv("DEMO_PAYMENTS_ENABLED", "").strip().lower() not in {
        "1", "true", "yes",
    }:
        ops.fail(
            503,
            "FEATURE_NOT_ENABLED",
            "Thanh toán mô phỏng chưa được bật.",
        )

    wallet = context["wallet"]

    if wallet is None or wallet.status != "ACTIVE":
        fail("WALLET_UNAVAILABLE", "Ví phải ở trạng thái ACTIVE.")

    finance.checked_money(wallet.balance, "wallet_balance")


def load_ledger(db, context):
    """
    Đối chiếu ledger dưới khóa wallet -> rental -> incident.

    Tiền cọc còn giữ:
        thu cọc
        - cấn tiền thuê
        - cấn bồi thường
        - hoàn cọc dư.

    Hoàn bồi thường không đưa tiền trở lại cọc đang giữ.
    """
    rental = context["rental"]
    incident = context["incident"]
    wallet = context["wallet"]

    finance.checked_money(wallet.balance, "wallet_balance")
    finance.checked_money(rental.deposit_held, "deposit_held")

    all_rows = db.scalars(
        select(Transaction)
        .where(Transaction.rental_id == rental.id)
        .order_by(Transaction.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    ).all()

    if any(row.status == "PENDING" for row in all_rows):
        fail(
            "PENDING_FINANCIAL_TRANSACTION",
            "Chuyến còn giao dịch tài chính chưa hoàn tất.",
        )

    rows = [row for row in all_rows if row.status == "SUCCESS"]
    by_id = {row.id: row for row in rows}

    wallet_rows = db.scalars(
        select(WalletTransaction)
        .where(WalletTransaction.transaction_id.in_(list(by_id)))
        .order_by(WalletTransaction.id)
        .with_for_update()
    ).all()

    wallet_by_transaction = {
        row.transaction_id: row for row in wallet_rows
    }

    deposits = {
        row.id: row for row in rows if row.kind == "DEPOSIT"
    }

    receipts = {
        row.id: row
        for row in rows
        if row.kind == "PAYMENT"
        and row.obligation_type == "COMPENSATION"
    }

    deposit_used = {row_id: ZERO for row_id in deposits}
    refunded_by_receipt = {row_id: ZERO for row_id in receipts}

    rent_paid = ZERO
    compensation_paid = ZERO
    compensation_refunded = ZERO
    adjustment_total = ZERO
    adjustment_count = 0
    rent_postings = []

    for row in rows:
        finance.checked_money(row.amount, "transaction_amount")

        if row.amount <= ZERO:
            fail("INVALID_LEDGER", "Bút toán tiền phải lớn hơn 0.")

        expected_wallet_type = None
        wallet_sign = 0

        if row.kind == "DEPOSIT":
            if (
                row.incident_id is not None
                or row.invoice_id is not None
            ):
                fail("INVALID_DEPOSIT_SOURCE", "Nguồn cọc không hợp lệ.")

            expected_wallet_type = "RENTAL_DEPOSIT"
            wallet_sign = -1

        else:
            if row.incident_id != incident.id:
                fail(
                    "LEGACY_FINANCE_REVIEW_REQUIRED",
                    "Có giao dịch ngoài ledger sự cố cần đối chiếu riêng.",
                )

            if row.kind == "PAYMENT":
                if row.obligation_type not in {
                    "RENTAL_FEE", "COMPENSATION",
                }:
                    fail("INVALID_LEDGER", "Loại khoản thu không hợp lệ.")

                if row.funding_source == "DEPOSIT":
                    source = deposits.get(row.source_transaction_id)

                    if source is None:
                        fail(
                            "INVALID_DEPOSIT_SOURCE",
                            "Khoản cấn cọc thiếu giao dịch thu cọc gốc.",
                        )

                    deposit_used[source.id] += row.amount

                elif row.funding_source == "WALLET":
                    if row.source_transaction_id is not None:
                        fail("INVALID_LEDGER", "Khoản thu ví có nguồn sai.")

                    expected_wallet_type = (
                        "RENTAL_PAYMENT"
                        if row.obligation_type == "RENTAL_FEE"
                        else "COMPENSATION_PAYMENT"
                    )
                    wallet_sign = -1

                else:
                    fail("INVALID_LEDGER", "Nguồn tiền không hợp lệ.")

                if row.obligation_type == "RENTAL_FEE":
                    rent_paid += row.amount
                    rent_postings.append(row)
                else:
                    compensation_paid += row.amount

            elif row.kind == "REFUND":
                if row.obligation_type == "DEPOSIT":
                    source = deposits.get(row.source_transaction_id)

                    if source is None or row.funding_source != "DEPOSIT":
                        fail(
                            "INVALID_DEPOSIT_REFUND",
                            "Khoản hoàn cọc thiếu nguồn cọc hợp lệ.",
                        )

                    deposit_used[source.id] += row.amount
                    expected_wallet_type = "RENTAL_REFUND"

                elif row.obligation_type == "COMPENSATION":
                    source = receipts.get(row.source_transaction_id)

                    if (
                        source is None
                        or source.funding_source != row.funding_source
                    ):
                        fail(
                            "INVALID_COMPENSATION_REFUND",
                            "Khoản hoàn không khớp khoản thu bồi thường gốc.",
                        )

                    refunded_by_receipt[source.id] += row.amount
                    compensation_refunded += row.amount
                    expected_wallet_type = "COMPENSATION_REFUND"

                else:
                    fail("INVALID_LEDGER", "Loại khoản hoàn không hợp lệ.")

                wallet_sign = 1

            elif row.kind == "ADJUSTMENT":
                if (
                    row.obligation_type != "COMPENSATION"
                    or row.funding_source is not None
                    or row.source_transaction_id is not None
                ):
                    fail("INVALID_LEDGER", "Bút toán điều chỉnh không hợp lệ.")

                if row.adjustment_direction == "INCREASE":
                    adjustment_total += row.amount
                elif row.adjustment_direction == "DECREASE":
                    adjustment_total -= row.amount
                else:
                    fail("INVALID_LEDGER", "Chiều điều chỉnh không hợp lệ.")

                adjustment_count += 1

            else:
                fail("INVALID_LEDGER", "Ledger chứa loại giao dịch chưa hỗ trợ.")

        wallet_entry = wallet_by_transaction.get(row.id)

        if expected_wallet_type is None:
            if wallet_entry is not None:
                fail(
                    "UNEXPECTED_WALLET_ENTRY",
                    "Cấn cọc/điều chỉnh nghĩa vụ không được biến động ví.",
                )
        else:
            if (
                wallet_entry is None
                or wallet_entry.wallet_id != wallet.id
                or wallet_entry.rental_id != rental.id
                or wallet_entry.status != "SUCCESS"
                or wallet_entry.type != expected_wallet_type
                or wallet_entry.amount != row.amount
            ):
                fail(
                    "WALLET_LEDGER_MISMATCH",
                    "Giao dịch không khớp bút toán ví.",
                )

            finance.checked_money(
                wallet_entry.balance_before, "balance_before"
            )
            finance.checked_money(
                wallet_entry.balance_after, "balance_after"
            )

            if (
                wallet_entry.balance_after - wallet_entry.balance_before
                != wallet_sign * row.amount
            ):
                fail(
                    "WALLET_LEDGER_MISMATCH",
                    "Biến động số dư không khớp giao dịch.",
                )

    deposit_left = {}

    for row_id, source in deposits.items():
        left = source.amount - deposit_used[row_id]

        if left < ZERO:
            fail(
                "DEPOSIT_OVER_ALLOCATED",
                "Một khoản cọc đã bị cấn/hoàn vượt số tiền thu gốc.",
            )

        deposit_left[row_id] = left

    if sum(deposit_left.values(), ZERO) != rental.deposit_held:
        fail(
            "DEPOSIT_HELD_MISMATCH",
            "Cọc còn giữ không khớp ledger.",
        )

    for row_id, source in receipts.items():
        if refunded_by_receipt[row_id] > source.amount:
            fail(
                "COMPENSATION_OVER_REFUNDED",
                "Khoản thu bồi thường đã bị hoàn vượt số thực thu.",
            )

    invoice = db.scalar(
        select(Invoice)
        .where(Invoice.rental_id == rental.id)
        .with_for_update()
    )

    if incident.rent_settled_at is not None:
        if (
            invoice is None
            or invoice.status != "PAID"
            or invoice.total_amount != rent_paid
            or rental.total_price != invoice.total_amount
            or any(row.invoice_id != invoice.id for row in rent_postings)
        ):
            fail(
                "RENT_LEDGER_MISMATCH",
                "Tiền thuê đã quyết toán không khớp hóa đơn/ledger.",
            )
    elif invoice is not None or rent_postings:
        fail(
            "RENT_LEDGER_MISMATCH",
            "Có hóa đơn/khoản thu nhưng thiếu mốc quyết toán tiền thuê.",
        )

    if (
        compensation_paid > ZERO
        or compensation_refunded > ZERO
        or adjustment_count > 0
    ):
        fail(
            "LEGACY_FINANCE_REVIEW_REQUIRED",
            "Hồ sơ chứa bút toán bồi thường nội bộ không thuộc luồng hiện hành.",
        )

    if incident.compensation_assessed_amount is not None:
        finance.checked_money(
            incident.compensation_assessed_amount,
            "external_compensation_amount",
        )

    return {
        "deposits": list(deposits.values()),
        "deposit_left": deposit_left,
        "rent_paid": rent_paid,
    }


def summary(context, state):
    incident = context["incident"]
    rental = context["rental"]

    external_settled = (
        incident.compensation_assessed_amount is not None
        and incident.compensation_approved_at is not None
        and incident.compensation_settled_at is not None
        and incident.agreement_status
        in {"AGREED", "AUTHORITY_DECISION", "NOT_REQUIRED"}
    )

    can_close = (
        incident.status == "CONFIRMED"
        and incident.rent_settled_at is not None
        and rental.deposit_held == ZERO
        and external_settled
    )

    def amount(value):
        return finance.money(value) if value is not None else None

    return {
        "incident_id": str(incident.id),
        "incident_status": incident.status,
        "rental_status": rental.status,
        "compensation_mode": "EXTERNAL",
        "agreement_status": incident.agreement_status,
        "compensation_amount": amount(
            incident.compensation_assessed_amount
        ),
        "external_compensation_settled": external_settled,
        "compensation_settled": external_settled,
        "rent_settled": incident.rent_settled_at is not None,
        "rent_paid": amount(state["rent_paid"]),
        "deposit_remaining_held": amount(rental.deposit_held),
        "wallet_balance": amount(context["wallet"].balance),
        "can_close": can_close,
        "closed_at": (
            incident.closed_at.isoformat()
            if incident.closed_at is not None
            else None
        ),
    }


def get_summary(db, context):
    finance.require_case(context)
    return summary(context, load_ledger(db, context))


def begin(db, context, actor, body, *, manager=True):
    if manager:
        finance.require_manager(actor)
    else:
        core.require_employee(actor)

    finance.require_case(context)
    require_approved(context["incident"])

    now = core.server_now(db)
    ticket = finance.evidence(context, now)
    state = load_ledger(db, context)
    state["before"] = finance.financial_snapshot(context["incident"])

    return now, ticket, state


def finish(
    db, context, actor, body, now, ticket, state, action, extra=None
):
    context["incident"].updated_at = now

    event = finance.emit(
        db,
        context,
        actor,
        action,
        now,
        ticket,
        before=state["before"],
        extra={
            "reason": body.reason,
            **(extra or {}),
        },
    )

    db.flush()

    return {
        "event_id": str(event.id),
        **summary(context, load_ledger(db, context)),
    }


def post(
    db, context, actor, body, record, now,
    *,
    kind,
    obligation,
    amount,
    operation,
    part,
    source=None,
    funding=None,
    direction=None,
    decision_ticket_id=None,
):
    if amount <= ZERO:
        fail("INVALID_POSTING_AMOUNT", "Không tạo bút toán tiền bằng 0.")

    transaction = Transaction(
        rental_id=context["rental"].id,
        incident_id=context["incident"].id,
        actor_id=actor.id,
        idempotency_record_id=record.id if record is not None else None,
        kind=kind,
        status="SUCCESS",
        amount=amount,
        obligation_type=obligation,
        funding_source=funding,
        source_transaction_id=source.id if source is not None else None,
        business_operation_key=operation,
        posting_key=part,
        adjustment_direction=direction,
        decision_ticket_id=(
            decision_ticket_id or context["ticket"].id
        ),
        created_at=now,
    )

    db.add(transaction)
    db.flush()

    moves_wallet = (
        kind == "REFUND"
        or (kind == "PAYMENT" and funding == "WALLET")
    )

    if moves_wallet:
        wallet = context["wallet"]
        before = wallet.balance
        delta = amount if kind == "REFUND" else -amount
        after = before + delta

        if after < ZERO:
            fail("INSUFFICIENT_BALANCE", "Ví không đủ tiền.")

        if after > finance.MAX_MONEY:
            fail("WALLET_LIMIT_EXCEEDED", "Số dư sau giao dịch vượt giới hạn.")

        if obligation == "COMPENSATION":
            wallet_type = (
                "COMPENSATION_REFUND"
                if kind == "REFUND"
                else "COMPENSATION_PAYMENT"
            )
        else:
            wallet_type = "RENTAL_REFUND"

        wallet.balance = after
        wallet.updated_at = now

        db.add(
            WalletTransaction(
                wallet_id=wallet.id,
                rental_id=context["rental"].id,
                transaction_id=transaction.id,
                idempotency_record_id=(
                    record.id if record is not None else None
                ),
                amount=amount,
                type=wallet_type,
                balance_before=before,
                balance_after=after,
                status="SUCCESS",
                created_at=now,
            )
        )

    return transaction


def refund_deposit(db, context, actor, body, record):
    finance.require_manager(actor)
    finance.require_case(context)

    incident = context["incident"]
    rental = context["rental"]

    now = core.server_now(db)
    ticket = finance.evidence(context, now)
    state = load_ledger(db, context)
    state["before"] = finance.financial_snapshot(incident)

    if incident.rent_settled_at is None:
        fail(
            "RENT_SETTLEMENT_REQUIRED",
            "Phải quyết toán tiền thuê trước khi hoàn cọc dư.",
        )

    amount = rental.deposit_held

    if body.expected_amount != amount:
        fail("AMOUNT_CHANGED", "Số cọc còn giữ đã thay đổi.")

    if amount == ZERO:
        return {"nothing_to_refund": True, **summary(context, state)}

    cash_enabled(context)

    if context["wallet"].balance + amount > finance.MAX_MONEY:
        fail("WALLET_LIMIT_EXCEEDED", "Ví không đủ hạn mức nhận toàn bộ cọc dư.")

    for source in state["deposits"]:
        part = state["deposit_left"][source.id]

        if part <= ZERO:
            continue

        post(
            db, context, actor, body, record, now,
            kind="REFUND",
            obligation="DEPOSIT",
            amount=part,
            operation="DEPOSIT_REFUND",
            part=f"SOURCE:{source.id}",
            source=source,
            funding="DEPOSIT",
        )

    rental.deposit_held = ZERO

    return finish(
        db, context, actor, body, now, ticket, state,
        "RENTAL_INCIDENT_DEPOSIT_REFUNDED",
        {"refunded_amount": finance.money(amount)},
    )


def close_incident(db, context, actor, body, record):
    now, ticket, state = begin(db, context, actor, body)
    incident = context["incident"]
    rental = context["rental"]

    if incident.status == "CLOSED":
        return {"already_closed": True, **summary(context, state)}

    if not summary(context, state)["can_close"]:
        fail(
            "INCIDENT_NOT_READY_TO_CLOSE",
            "Còn tiền thuê, cọc dư hoặc kết quả bồi thường ngoài hệ thống "
            "chưa giải quyết.",
        )

    incident.status = "CLOSED"
    incident.closed_at = now
    incident.closed_by = actor.id
    incident.closure_note = body.reason

    rental.status = "CLOSED_INCIDENT"

    # Không cập nhật Vehicle, actual_end_time, settled_at
    # hoặc hóa đơn đã thanh toán.
    return finish(
        db, context, actor, body, now, ticket, state,
        "RENTAL_INCIDENT_CLOSED",
    )
