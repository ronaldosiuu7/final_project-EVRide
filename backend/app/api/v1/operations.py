from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import AwareDatetime
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.core.responses import make_list_response, make_response
from app.database import get_db
from app.models import (
    FileAttachment,
    GPSPoint,
    MaintenanceOrder,
    Rental,
    RentalReview,
    SupportTicket,
    User,
    Vehicle,
)
from app.schemas.operations import (
    ChatMessage,
    GPSCreate,
    MaintenanceCancel,
    MaintenanceComplete,
    MaintenanceCreate,
    MaintenanceStart,
    ReviewCreate,
    TicketAttachmentCreate,
    TicketCreate,
    TicketUpdate,
)
from app.services import faq
from app.services import operations as service
from app.services.errors import ServiceError
from app.services.idempotency import (
    begin_idempotent_request,
    complete_idempotent_request,
)


router = APIRouter(tags=["Operations"])

DB = Annotated[Session, Depends(get_db)]
Actor = Annotated[User, Depends(get_current_user)]
Staff = Annotated[
    User,
    Depends(require_role("STAFF", "MANAGER")),
]
Customer = Annotated[
    User,
    Depends(require_role("CUSTOMER")),
]
IdempotencyKey = Annotated[
    str | None,
    Header(alias="Idempotency-Key"),
]


def write_response(
    db,
    request,
    actor,
    body,
    prepare,
    execute,
    *,
    status_code=200,
    idempotent=False,
    key=None,
    pass_idempotency_record=False,
):
    """
    prepare: lấy khóa tài nguyên theo thứ tự trước idempotency.
    execute: kiểm tra trạng thái và thực hiện thay đổi.
    """
    try:
        context = prepare()
        record = None

        if idempotent:
            record, replay = begin_idempotent_request(
                db,
                actor_id=actor.id,
                method=request.method,
                path=request.url.path,
                key=key,
                payload=body.model_dump(
                    mode="json",
                    exclude_unset=True,
                ),
            )

            if replay is not None:
                db.rollback()  # Giải phóng các khóa đã lấy.
                return JSONResponse(
                    status_code=replay[0],
                    content=replay[1],
                )

        if pass_idempotency_record:
            result = execute(context, record)
        else:
            result = execute(context)
        db.flush()

        response_body = jsonable_encoder(make_response(result))

        if record is not None:
            complete_idempotent_request(
                record,
                status_code=status_code,
                response_body=response_body,
            )

        db.commit()

        return JSONResponse(
            status_code=status_code,
            content=response_body,
        )

    except IntegrityError as error:
        db.rollback()

        diagnostic = getattr(error.orig, "diag", None)
        constraint = getattr(
            diagnostic, "constraint_name", None
        )

        known_conflicts = {
            "uq_maintenance_orders_active_vehicle": (
                "ACTIVE_MAINTENANCE_ORDER",
                "Xe đã có phiếu bảo trì đang hoạt động.",
            ),
            "uq_file_attachments_file": (
                "FILE_ALREADY_ATTACHED",
                "Ảnh đã được gắn vào tài nguyên.",
            ),
        }

        if constraint in known_conflicts:
            code, message = known_conflicts[constraint]
            raise ServiceError(409, code, message) from error

        raise

    except Exception:
        db.rollback()
        raise


def paginated(db, query, page, page_size):
    rows, total = service.list_page(
        db, query, page, page_size
    )

    return make_list_response(
        rows,
        page=page,
        page_size=page_size,
        total=total,
    )

@router.post(
    "/rentals/{rental_id}/support-tickets",
    status_code=201,
)
def post_ticket(
    rental_id: int,
    body: TicketCreate,
    request: Request,
    db: DB,
    actor: Actor,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.rental_access(
            db, rental_id, actor, lock=True
        ),
        execute=lambda rental: service.create_ticket(
            db, rental, actor, body
        ),
        status_code=201,
    )


@router.get("/support-tickets")
def list_tickets(
    db: DB,
    actor: Actor,
    status_filter: Literal[
        "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"
    ] | None = Query(None, alias="status"),
    rental_id: int | None = None,
    assigned_to: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(SupportTicket).join(
        Rental, Rental.id == SupportTicket.rental_id
    )

    if actor.role not in service.STAFF_ROLES:
        query = query.where(
            Rental.customer_id == actor.id,
            SupportTicket.check_cycle.is_(None),
        )

    if status_filter:
        query = query.where(SupportTicket.status == status_filter)

    if rental_id is not None:
        query = query.where(SupportTicket.rental_id == rental_id)

    if assigned_to is not None:
        if actor.role not in service.STAFF_ROLES:
            service.fail(403, "FORBIDDEN", "Không đủ quyền lọc nhân viên.")
        query = query.where(SupportTicket.assigned_to == assigned_to)

    return paginated(
        db,
        query.order_by(SupportTicket.id.desc()),
        page,
        page_size,
    )


@router.get("/support-tickets/{ticket_id}")
def get_ticket(ticket_id: int, db: DB, actor: Actor):
    ticket = service.ticket_access(db, ticket_id, actor)
    return make_response(service.output(ticket))


@router.patch("/support-tickets/{ticket_id}")
def patch_ticket(
    ticket_id: int,
    body: TicketUpdate,
    request: Request,
    db: DB,
    actor: Staff,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.ticket_access(
            db, ticket_id, actor, lock=True
        ),
        execute=lambda ticket: service.update_ticket(
            db, ticket, actor, body
        ),
    )


@router.post("/files/{file_id}/attachments", status_code=201)
def attach_ticket_photo(
    file_id: int,
    body: TicketAttachmentCreate,
    request: Request,
    db: DB,
    actor: Actor,
    key: IdempotencyKey = None,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.lock_ticket_file(
            db, actor, body.support_ticket_id, file_id
        ),
        execute=lambda context: service.attach_ticket_file(
            db, context, actor
        ),
        status_code=201,
        idempotent=True,
        key=key,
    )


@router.get("/files/attachments")
def list_ticket_photos(
    db: DB,
    actor: Actor,
    owner_type: Literal["SUPPORT_TICKET"],
    owner_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    service.ticket_access(db, owner_id, actor)

    query = (
        select(FileAttachment)
        .where(FileAttachment.support_ticket_id == owner_id)
        .order_by(FileAttachment.id)
    )

    return paginated(db, query, page, page_size)

@router.post("/maintenance-orders", status_code=201)
def post_maintenance(
    body: MaintenanceCreate,
    request: Request,
    db: DB,
    actor: Staff,
    key: IdempotencyKey = None,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.prepare_maintenance_create(
            db, body
        ),
        execute=lambda context: service.create_maintenance(
            db, context, actor, body
        ),
        status_code=201,
        idempotent=True,
        key=key,
    )


@router.get("/maintenance-orders")
def list_maintenance(
    db: DB,
    actor: Staff,
    vehicle_id: int | None = None,
    incident_id: int | None = None,
    status_filter: Literal[
        "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"
    ] | None = Query(None, alias="status"),
    assigned_to: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(MaintenanceOrder)

    if vehicle_id is not None:
        query = query.where(MaintenanceOrder.vehicle_id == vehicle_id)

    if incident_id is not None:
        query = query.where(MaintenanceOrder.incident_id == incident_id)

    if status_filter:
        query = query.where(MaintenanceOrder.status == status_filter)

    if assigned_to is not None:
        query = query.where(MaintenanceOrder.assigned_to == assigned_to)

    return paginated(
        db,
        query.order_by(MaintenanceOrder.id.desc()),
        page,
        page_size,
    )


@router.get("/maintenance-orders/{order_id}")
def get_maintenance(order_id: int, db: DB, actor: Staff):
    order = service.load(db, MaintenanceOrder, order_id)
    return make_response(service.output(order))


@router.post("/maintenance-orders/{order_id}/start")
def start_maintenance(
    order_id: int,
    body: MaintenanceStart,
    request: Request,
    db: DB,
    actor: Staff,
    key: IdempotencyKey = None,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.lock_maintenance(db, order_id),
        execute=lambda context: service.change_maintenance(
            db, context, actor, "start", body
        ),
        idempotent=True,
        key=key,
    )


@router.post("/maintenance-orders/{order_id}/complete")
def complete_maintenance(
    order_id: int,
    body: MaintenanceComplete,
    request: Request,
    db: DB,
    actor: Staff,
    key: IdempotencyKey = None,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.lock_maintenance(db, order_id),
        execute=lambda context: service.change_maintenance(
            db, context, actor, "complete", body
        ),
        idempotent=True,
        key=key,
    )


@router.post("/maintenance-orders/{order_id}/cancel")
def cancel_maintenance(
    order_id: int,
    body: MaintenanceCancel,
    request: Request,
    db: DB,
    actor: Staff,
    key: IdempotencyKey = None,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.lock_maintenance(db, order_id),
        execute=lambda context: service.change_maintenance(
            db, context, actor, "cancel", body
        ),
        idempotent=True,
        key=key,
    )

@router.post("/rentals/{rental_id}/gps", status_code=201)
def post_gps(
    rental_id: int,
    body: GPSCreate,
    request: Request,
    db: DB,
    actor: Staff,
    key: IdempotencyKey = None,
):
    service.require_demo_gps()

    return write_response(
        db, request, actor, body,
        prepare=lambda: service.rental_access(
            db, rental_id, actor, lock=True
        ),
        execute=lambda rental: service.create_gps(
            db, rental, body
        ),
        status_code=201,
        idempotent=True,
        key=key,
    )


@router.get("/rentals/{rental_id}/gps/latest")
def get_latest_gps(rental_id: int, db: DB, actor: Actor):
    rental = service.rental_access(db, rental_id, actor)
    return make_response(service.latest_gps(db, rental))


@router.get("/rentals/{rental_id}/gps")
def get_gps_history(
    rental_id: int,
    db: DB,
    actor: Actor,
    from_time: AwareDatetime | None = Query(None, alias="from"),
    to_time: AwareDatetime | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    service.rental_access(db, rental_id, actor)

    if (
        from_time is not None
        and to_time is not None
        and from_time > to_time
    ):
        service.fail(422, "INVALID_TIME_RANGE", "Khoảng thời gian không hợp lệ.")

    query = select(GPSPoint).where(GPSPoint.rental_id == rental_id)

    if from_time is not None:
        query = query.where(GPSPoint.recorded_at >= from_time)

    if to_time is not None:
        query = query.where(GPSPoint.recorded_at <= to_time)

    return paginated(
        db,
        query.order_by(GPSPoint.recorded_at, GPSPoint.id),
        page,
        page_size,
    )


@router.post("/rentals/{rental_id}/review", status_code=201)
def post_review(
    rental_id: int,
    body: ReviewCreate,
    request: Request,
    db: DB,
    actor: Customer,
):
    return write_response(
        db, request, actor, body,
        prepare=lambda: service.rental_access(
            db, rental_id, actor, lock=True
        ),
        execute=lambda rental: service.create_review(
            db, rental, body
        ),
        status_code=201,
    )


@router.get("/rentals/{rental_id}/review")
def get_review(rental_id: int, db: DB, actor: Actor):
    service.rental_access(db, rental_id, actor)

    review = db.scalar(
        select(RentalReview)
        .where(RentalReview.rental_id == rental_id)
    )

    if review is None:
        service.fail(404, "NOT_FOUND", "Chuyến chưa được đánh giá.")

    return make_response(service.output(review))

@router.get("/faq/sources/{source_id}", name="faq_source")
def get_faq_source(source_id: str):
    return PlainTextResponse(faq.read_source(source_id))


@router.get("/faq")
def get_faqs(request: Request):
    def source_url(source_id):
        return str(
            request.url_for("faq_source", source_id=source_id)
        )

    return make_response([
        faq.public_faq(item, source_url)
        for item in faq.FAQS
    ])


@router.post("/chatbot/messages")
def post_chat_message(
    body: ChatMessage,
    request: Request,
    actor: Customer,
):
    def source_url(source_id):
        return str(
            request.url_for("faq_source", source_id=source_id)
        )

    return make_response(
        faq.answer(body.message, source_url)
    )