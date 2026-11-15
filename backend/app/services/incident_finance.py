from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select

from app.models import (
    AuditLog,
    Invoice,
    Rental,
    RentalIncident,
    RentalPricingSnapshot,
    SupportTicket,
    Transaction,
    Wallet,
)
from app.services import incidents as core
from app.services import operations as ops
from app.services import rentals as rental_service


ZERO = Decimal("0.00")
MAX_MONEY = Decimal("9999999999.99")


def money(value):
    return format(value, ".2f")


def checked_money(value, name):
    if (
        value is None
        or not value.is_finite()
        or value < ZERO
        or value > MAX_MONEY
    ):
        ops.fail(
            409,
            "INVALID_FINANCIAL_DATA",
            f"Dữ liệu tiền không hợp lệ: {name}.",
        )

    return value


def financial_view(incident):
    result = core.public_incident(incident)

    # Response tài chính giữ tiền dưới dạng chuỗi.
    for column in incident.__table__.columns:
        value = getattr(incident, column.name)

        if isinstance(value, Decimal):
            result[column.name] = money(value)

    return result


def financial_snapshot(incident):
    names = (
        "status",
        "vehicle_value_snapshot",
        "approved_repair_cost",
        "recovered_asset_value",
        "compensation_proposed_amount",
        "compensation_assessed_amount",
        "agreement_status",
        "compensation_approved_by",
        "compensation_approved_at",
        "compensation_ticket_id",
        "rent_settled_at",
        "compensation_settled_at",
    )

    result = {}

    for name in names:
        value = getattr(incident, name)

        if isinstance(value, Decimal):
            value = money(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        elif value is not None and (
            name.endswith("_id") or name.endswith("_by")
        ):
            value = str(value)

        result[name] = value

    return result


def emit(
    db,
    context,
    actor,
    action,
    now,
    ticket,
    *,
    before=None,
    extra=None,
):
    incident = context["incident"]

    event = AuditLog(
        actor_id=actor.id,
        action=action,
        resource_type="rental_incidents",
        resource_id=str(incident.id),
        before_data=before,
        after_data={
            "finance": financial_snapshot(incident),
            "evidence_ticket": core.ticket_snapshot(ticket),
            **(extra or {}),
        },
        created_at=now,
    )

    db.add(event)
    db.flush()
    return event


def lock_context(
    db,
    incident_id,
    evidence_ticket_id=None,
    *,
    with_wallet=False,
):
    """
    Chỉ khóa tài nguyên cần dùng.

    Quyết toán:
        wallet -> rental -> incident -> ticket.

    Không lấy khóa hoặc cập nhật Vehicle.
    """
    preliminary = db.execute(
        select(
            RentalIncident.rental_id,
            Rental.customer_id,
        )
        .join(Rental, Rental.id == RentalIncident.rental_id)
        .where(RentalIncident.id == incident_id)
    ).one_or_none()

    if preliminary is None:
        ops.fail(404, "NOT_FOUND", "Không tìm thấy hồ sơ.")

    wallet = None

    if with_wallet:
        wallet = db.scalar(
            select(Wallet)
            .where(Wallet.user_id == preliminary.customer_id)
            .execution_options(populate_existing=True)
            .with_for_update()
        )

        if wallet is None:
            ops.fail(404, "WALLET_NOT_FOUND", "Không tìm thấy ví khách.")

    rental = ops.load(
        db,
        Rental,
        preliminary.rental_id,
        lock=True,
    )

    incident = ops.load(
        db,
        RentalIncident,
        incident_id,
        lock=True,
    )

    if (
        incident.rental_id != rental.id
        or rental.customer_id != preliminary.customer_id
    ):
        ops.fail(
            409,
            "FINANCIAL_CONTEXT_CHANGED",
            "Thông tin chủ sở hữu hồ sơ đã thay đổi.",
        )

    ticket = None

    if evidence_ticket_id is not None:
        ticket = db.scalar(
            select(SupportTicket)
            .where(
                SupportTicket.id == evidence_ticket_id,
                SupportTicket.rental_id == rental.id,
            )
            .execution_options(populate_existing=True)
            .with_for_update()
        )

        if ticket is None:
            ops.fail(
                404,
                "EVIDENCE_NOT_FOUND",
                "Ticket bằng chứng không thuộc chuyến này.",
            )

    return {
        "rental": rental,
        "incident": incident,
        "wallet": wallet,
        "ticket": ticket,
    }


def require_case(context):
    incident = context["incident"]
    rental = context["rental"]

    if (
        incident.status not in {"CONFIRMED", "CLOSED"}
        or incident.verified_outcome
        not in {"LOSS_THEFT", "ABANDONMENT"}
    ):
        ops.fail(
            409,
            "INCIDENT_NOT_CONFIRMED",
            "Hồ sơ chưa được xác nhận xử lý theo luồng sự cố.",
        )

    expected = (
        "CLOSED_INCIDENT"
        if incident.status == "CLOSED"
        else (
            "STOLEN"
            if incident.verified_outcome == "LOSS_THEFT"
            else "INCIDENT_PENDING"
        )
    )

    if rental.status != expected:
        ops.fail(
            409,
            "INCIDENT_RENTAL_STATE_MISMATCH",
            "Trạng thái chuyến không phù hợp với hồ sơ.",
        )


def require_manager(actor):
    if actor.role != "MANAGER":
        ops.fail(
            403,
            "MANAGER_REQUIRED",
            "Chỉ MANAGER được duyệt nghiệp vụ này.",
        )


def evidence(context, now):
    ticket = context["ticket"]

    if ticket is None:
        ops.fail(422, "EVIDENCE_REQUIRED", "Thiếu ticket bằng chứng.")

    core.require_human_ticket(ticket, context["rental"], now)
    return ticket


def _ensure_no_compensation_ledger(db, incident):
    existing = db.scalar(
        select(Transaction.id)
        .where(
            Transaction.incident_id == incident.id,
            Transaction.obligation_type == "COMPENSATION",
            Transaction.status == "SUCCESS",
        )
        .limit(1)
    )

    if existing is not None:
        ops.fail(
            409,
            "COMPENSATION_LEDGER_EXISTS",
            "Hồ sơ đã có bút toán bồi thường trong hệ thống.",
        )


def settle_external_compensation(db, context, actor, body):
    """
    Ghi nhận một lần kết quả bồi thường cuối đã chốt và thanh toán/giải quyết
    bên ngoài hệ thống. Không thay đổi ví, tiền cọc hoặc doanh thu thuê.
    """
    require_manager(actor)
    require_case(context)

    incident = context["incident"]
    rental = context["rental"]

    if incident.status != "CONFIRMED":
        ops.fail(
            409,
            "INVALID_INCIDENT_STATE",
            "Chỉ ghi nhận kết quả bồi thường khi hồ sơ đang CONFIRMED.",
        )

    if (
        incident.compensation_settled_at is not None
        or incident.compensation_assessed_amount is not None
        or incident.agreement_status != "PENDING"
    ):
        ops.fail(
            409,
            "COMPENSATION_ALREADY_SETTLED",
            "Kết quả bồi thường đã được chốt; không thể sửa âm thầm.",
        )

    _ensure_no_compensation_ledger(db, incident)

    amount = checked_money(body.amount, "compensation_assessed_amount")

    if amount == ZERO:
        if body.agreement_status != "NOT_REQUIRED":
            ops.fail(
                422,
                "INVALID_AGREEMENT_STATUS",
                "Nghĩa vụ bằng 0 phải dùng NOT_REQUIRED.",
            )
        if (
            body.payment_method is not None
            or body.payment_reference is not None
            or body.paid_at is not None
        ):
            ops.fail(
                422,
                "UNEXPECTED_PAYMENT_DETAILS",
                "Nghĩa vụ bằng 0 không được nhập thông tin thanh toán.",
            )
    else:
        if body.agreement_status not in {
            "AGREED",
            "AUTHORITY_DECISION",
        }:
            ops.fail(
                422,
                "AGREEMENT_REQUIRED",
                "Nghĩa vụ dương cần thỏa thuận hoặc quyết định có thẩm quyền.",
            )
        if (
            body.payment_method is None
            or body.payment_reference is None
            or body.paid_at is None
        ):
            ops.fail(
                422,
                "PAYMENT_DETAILS_REQUIRED",
                "Khoản bồi thường dương cần payment_method, payment_reference và paid_at.",
            )

    now = core.server_now(db)
    ticket = evidence(context, now)

    if body.paid_at is not None and not (
        rental.actual_start_time <= body.paid_at <= now
    ):
        ops.fail(
            422,
            "INVALID_PAYMENT_TIME",
            "Thời điểm thanh toán ngoài hệ thống không hợp lệ.",
        )

    before = financial_snapshot(incident)

    incident.compensation_assessed_amount = amount
    incident.agreement_status = body.agreement_status
    incident.compensation_basis = body.reason
    incident.compensation_approved_by = actor.id
    incident.compensation_approved_at = now
    incident.compensation_ticket_id = ticket.id
    incident.compensation_settled_at = now
    incident.updated_at = now

    event = emit(
        db,
        context,
        actor,
        "RENTAL_INCIDENT_EXTERNAL_COMPENSATION_SETTLED",
        now,
        ticket,
        before=before,
        extra={
            "assessed_amount": money(amount),
            "settled_amount": money(amount),
            "agreement_status": body.agreement_status,
            "payment_method": body.payment_method,
            "payment_reference": body.payment_reference,
            "paid_at": (
                body.paid_at.isoformat()
                if body.paid_at is not None
                else None
            ),
            "reason": body.reason,
        },
    )

    return {
        "incident": financial_view(incident),
        "event_id": str(event.id),
    }


def calculate_rent(db, context, now):
    require_case(context)

    rental = context["rental"]
    incident = context["incident"]

    snapshot = db.scalar(
        select(RentalPricingSnapshot)
        .where(RentalPricingSnapshot.rental_id == rental.id)
        .execution_options(populate_existing=True)
        .with_for_update()
    )

    if snapshot is None:
        ops.fail(
            409,
            "PRICING_SNAPSHOT_REQUIRED",
            "Chuyến thiếu snapshot giá.",
        )

    policy = snapshot.pricing_policy_snapshot or {}

    if (
        snapshot.pricing_policy_version
        != rental_service.PRICING_POLICY_VERSION
        or snapshot.billing_unit != rental_service.BILLING_UNIT
        or policy.get("first_block_seconds") != 1800
        or policy.get("extra_minute_rounding") != "CEIL"
        or policy.get("currency") != "VND"
    ):
        ops.fail(
            409,
            "UNSUPPORTED_PRICING_SNAPSHOT",
            "Snapshot thuộc chính sách chưa có bộ tính tương ứng.",
        )

    checked_money(
        snapshot.first_30_minutes_price_snapshot,
        "first_30_minutes_price_snapshot",
    )
    checked_money(
        snapshot.extra_minute_price_snapshot,
        "extra_minute_price_snapshot",
    )
    checked_money(rental.deposit_held, "deposit_held")

    until = incident.billing_cutoff_at or now

    values = rental_service._quote_financials(
        rental=rental,
        snapshot=snapshot,
        return_time=until,
        promotion=None,
        promotion_now=now,
    )

    checked_money(values["total_amount"], "rent_total")

    return values, until


def rent_preview(db, context):
    require_case(context)

    rental = context["rental"]
    incident = context["incident"]

    if incident.rent_settled_at is not None:
        invoice = db.scalar(
            select(Invoice).where(Invoice.rental_id == rental.id)
        )

        if invoice is None or invoice.status != "PAID":
            ops.fail(
                409,
                "RENT_LEDGER_INCONSISTENT",
                "Mốc quyết toán không khớp hóa đơn.",
            )

        return {
            "status": "SETTLED",
            "invoice_id": str(invoice.id),
            "rent_amount": money(invoice.total_amount),
            "rent_settled_at": incident.rent_settled_at.isoformat(),
            "deposit_remaining_held": money(rental.deposit_held),
        }

    now = core.server_now(db)
    values, until = calculate_rent(db, context, now)

    return {
        "status": "UNSETTLED",
        "is_estimate": incident.billing_cutoff_at is None,
        "calculated_until": until.isoformat(),
        "elapsed_seconds": values["elapsed_seconds"],
        "rent_amount": money(values["total_amount"]),
        "discount_amount": "0.00",
        "deposit_held": money(values["deposit_held"]),
        "deposit_to_apply": money(values["deposit_applied"]),
        "additional_wallet_payment": money(values["additional_payment"]),
        "deposit_remaining_held": money(values["deposit_refund"]),
    }
