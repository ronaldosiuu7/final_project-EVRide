import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

TEST_DB_ENV = os.getenv("TEST_DATABASE_URL")
if not TEST_DB_ENV:
    pytest.skip(
        "Cần biến môi trường TEST_DATABASE_URL trỏ tới database *_test",
        allow_module_level=True,
    )

url = make_url(TEST_DB_ENV)
if not (url.database or "").endswith("_test"):
    raise RuntimeError("Cần database riêng có hậu tố _test")

from app.core.dependencies import get_current_user  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AuditLog,
    Base,
    MaintenanceOrder,
    Rental,
    RentalIncident,
    Station,
    SupportTicket,
    User,
    UserDocument,
    Vehicle,
    Wallet,
)
from app.schemas.incident_finance import (  # noqa: E402
    ExpectedAmountAction,
    ExternalCompensationSettlement,
    FinancialEvidence,
    IncidentRentSettlement,
)
from app.schemas.incident_recovery import (  # noqa: E402
    IncidentArrivalCreate,
    IncidentRecoveryCreate,
    IncidentVehicleRelease,
)
from app.schemas.incidents import IncidentIntake, IncidentVerify  # noqa: E402
from app.schemas.operations import (  # noqa: E402
    MaintenanceComplete,
    MaintenanceCreate,
    MaintenanceStart,
)
from app.schemas.rental_check_ins import RentalCheckInAction  # noqa: E402
from app.services import incident_completion as completion  # noqa: E402
from app.services import incident_finance as finance  # noqa: E402
from app.services import incident_recovery as recovery  # noqa: E402
from app.services import incident_rent_settlement as rent_settlement  # noqa: E402
from app.services import incidents  # noqa: E402
from app.services import operations as ops  # noqa: E402
from app.services import rental_check_ins as check_ins  # noqa: E402
from app.services.errors import ServiceError  # noqa: E402
from app.services.idempotency import (  # noqa: E402
    begin_idempotent_request,
    complete_idempotent_request,
)
from app.services.rentals import create_rental, pickup_rental  # noqa: E402


@pytest.fixture
def pg_factory(monkeypatch):
    monkeypatch.setenv("DEMO_PAYMENTS_ENABLED", "true")
    admin = create_engine(url)
    schema = "incident_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')

    engine = create_engine(
        url,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
        admin.dispose()


def _seed_rental(factory, *, hours_ago=0):
    with factory.begin() as db:
        now = db.scalar(select(func.clock_timestamp()))
        staff = User(
            name="Staff One",
            email="staff1@test.vn",
            password="x",
            role="STAFF",
            status="ACTIVE",
        )
        manager = User(
            name="Manager One",
            email="manager1@test.vn",
            password="x",
            role="MANAGER",
            status="ACTIVE",
        )
        customer = User(
            name="Customer One",
            email="cust1@test.vn",
            password="x",
            role="CUSTOMER",
            status="ACTIVE",
        )
        station = Station(
            name="Trạm Trung Tâm",
            address="HN",
            latitude=Decimal("21.000000"),
            longitude=Decimal("105.000000"),
            capacity=5,
            status="ACTIVE",
        )
        db.add_all([staff, manager, customer, station])
        db.flush()

        db.add(
            UserDocument(
                user_id=customer.id,
                document_type="CCCD",
                document_number="001234567890",
                verified_birth_date=(now - timedelta(days=365 * 25)).date(),
                expires_on=(now + timedelta(days=365)).date(),
                verified_status="VERIFIED",
                verified_by=staff.id,
                verified_at=now,
            )
        )
        wallet = Wallet(
            user_id=customer.id,
            balance=Decimal("500000.00"),
            status="ACTIVE",
        )
        vehicle = Vehicle(
            current_station_id=station.id,
            name="EV Bike 01",
            model="VF-CITY",
            battery_percent=90,
            status="AVAILABLE",
            first_30_minutes_price=Decimal("10000.00"),
            extra_minute_price=Decimal("500.00"),
            deposit_amount=Decimal("100000.00"),
        )
        db.add_all([wallet, vehicle])
        db.flush()

        rental = create_rental(
            db,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
            pickup_station_id=station.id,
        )
        record, _ = begin_idempotent_request(
            db,
            actor_id=staff.id,
            method="POST",
            path=f"/api/v1/rentals/{rental.id}/pickup",
            key="seed-pickup-" + uuid4().hex,
            payload={"station_id": str(station.id), "battery_percent": 90},
        )
        pickup_rental(
            db,
            rental_id=rental.id,
            station_id=station.id,
            battery_percent=90,
            note="Nhận xe tốt",
            staff_id=staff.id,
            idempotency_record_id=record.id,
        )
        complete_idempotent_request(
            record, status_code=200, response_body={"ok": True}
        )
        db.flush()

        if hours_ago:
            from app.models import Handover

            shifted = now - timedelta(hours=hours_ago)
            handover = db.scalar(
                select(Handover).where(
                    Handover.rental_id == rental.id,
                    Handover.kind == "PICKUP",
                )
            )
            if handover is not None:
                handover.time = shifted
            rental.actual_start_time = shifted

        return {
            "staff_id": staff.id,
            "manager_id": manager.id,
            "customer_id": customer.id,
            "station_id": station.id,
            "vehicle_id": vehicle.id,
            "rental_id": rental.id,
        }


def _shift_rental_start(factory, rental_id, hours_ago):
    with factory.begin() as db:
        now = db.scalar(select(func.clock_timestamp()))
        rental = db.get(Rental, rental_id)
        new_start = now - timedelta(hours=hours_ago)
        # Cập nhật handover pickup trước hoặc cùng lúc để giữ check constraints.
        from app.models import Handover

        handover = db.scalar(
            select(Handover).where(
                Handover.rental_id == rental_id,
                Handover.kind == "PICKUP",
            )
        )
        if handover is not None:
            handover.time = new_start
        rental.actual_start_time = new_start


def test_checkin_24h_readonly_no_answer_escalation_and_false_alarm_pg(pg_factory):
    ids = _seed_rental(pg_factory)
    rental_id = ids["rental_id"]

    # 1. Trước 24h: chưa xuất hiện trong danh sách cần kiểm tra
    _shift_rental_start(pg_factory, rental_id, hours_ago=23)
    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 0
        assert rows == []

    # 2. Đủ >= 24h: xuất hiện, GET lặp lại không ghi DB và không làm biến mất chuyến
    _shift_rental_start(pg_factory, rental_id, hours_ago=25)
    with pg_factory.begin() as db:
        audit_before = db.scalar(select(func.count()).select_from(AuditLog))
        rows1, total1 = check_ins.list_due_check_ins(db)
        rows2, total2 = check_ins.list_due_check_ins(db)
        audit_after = db.scalar(select(func.count()).select_from(AuditLog))
        assert total1 == 1 and total2 == 1
        assert rows1[0]["rental_id"] == str(rental_id)
        assert rows2[0]["rental_id"] == str(rental_id)
        assert audit_before == audit_after

    # 3. Khách không nghe máy (NO_ANSWER): ghi nhận lịch thử lại rõ ràng, đến hẹn xuất hiện lại
    with pg_factory.begin() as db:
        now = check_ins.server_now(db)
        staff = db.get(User, ids["staff_id"])
        ctx = check_ins.lock_context(
            db,
            rental_id,
            RentalCheckInAction(
                outcome="NO_ANSWER",
                note="Gọi lần 1 không bắt máy",
                next_check_at=now + timedelta(hours=2),
            ),
        )
        res = check_ins.record_check_in(
            db,
            ctx,
            staff,
            RentalCheckInAction(
                outcome="NO_ANSWER",
                note="Gọi lần 1 không bắt máy",
                next_check_at=now + timedelta(hours=2),
            ),
        )
        assert res["outcome"] == "NO_ANSWER"

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 0

    # Đẩy next_check_at về quá khứ giả lập đã tới giờ gọi lại
    with pg_factory.begin() as db:
        now = check_ins.server_now(db)
        rental = db.get(Rental, rental_id)
        rental.next_check_at = now - timedelta(minutes=1)

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 1
        assert rows[0]["rental_id"] == str(rental_id)

    # 4. Chuyển sang tiếp nhận sự cố thất bại (source_ticket_id không tồn tại):
    # KHÔNG làm ẩn chuyến khỏi danh sách
    with pg_factory.begin() as db:
        staff = db.get(User, ids["staff_id"])
        bad_action = RentalCheckInAction(
            outcome="ESCALATE",
            note="Thử escalate với ticket không tồn tại",
            source_ticket_id="999999",
        )
        with pytest.raises(ServiceError) as exc_bad:
            check_ins.lock_context(db, rental_id, bad_action)
        assert exc_bad.value.code == "TICKET_NOT_FOUND"

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 1

    # 5. Chuyển sang tiếp nhận sự cố thành công -> tạo hồ sơ INVESTIGATING (không cần assigned_to) -> ẩn khỏi check-in
    with pg_factory.begin() as db:
        staff = db.get(User, ids["staff_id"])
        ok_action = RentalCheckInAction(
            outcome="ESCALATE",
            note="Không liên hệ được quá lâu, nghi mất",
        )
        ctx = check_ins.lock_context(db, rental_id, ok_action)
        res_esc = check_ins.record_check_in(db, ctx, staff, ok_action)
        assert res_esc["outcome"] == "ESCALATE"
        inc_id = int(res_esc["incident"]["id"])
        assert res_esc["incident"]["assigned_to"] is None
        assert res_esc["incident"]["status"] == "INVESTIGATING"

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 0

    # 6. Bác báo nhầm (FALSE_ALARM) -> trả xe về RENTED và cập nhật next_check_at nhất quán
    with pg_factory.begin() as db:
        now = incidents.server_now(db)
        manager = db.get(User, ids["manager_id"])
        ev = SupportTicket(
            rental_id=rental_id,
            created_by=manager.id,
            report_source="STAFF",
            received_at=now - timedelta(seconds=10),
            title="Khách gọi lại xác nhận gia hạn",
            description="Đang dùng bình thường",
            status="OPEN",
            created_at=now,
            updated_at=now,
        )
        db.add(ev)
        db.flush()
        next_due = now + timedelta(hours=12)
        ctx = incidents.lock_incident_context(db, inc_id, [ev.id])
        verified = incidents.verify_incident(
            db,
            ctx,
            manager,
            IncidentVerify(
                outcome="FALSE_ALARM",
                evidence_ticket_id=str(ev.id),
                reason="Khách xác nhận tiếp tục thuê",
                next_check_at=next_due,
            ),
        )
        assert verified["status"] == "DISMISSED"
        assert ctx["vehicle"].status == "RENTED"
        assert ctx["rental"].next_check_at == next_due

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 0

    with pg_factory.begin() as db:
        now = check_ins.server_now(db)
        db.get(Rental, rental_id).next_check_at = now - timedelta(seconds=5)

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 1

    # 7. Khi rental kết thúc (không còn IN_RENT), tự động biến mất khỏi danh sách kiểm tra
    with pg_factory.begin() as db:
        now = check_ins.server_now(db)
        rental = db.get(Rental, rental_id)
        rental.status = "RETURN_PENDING"
        rental.return_initiated_at = now
        rental.actual_end_time = now

    with pg_factory.begin() as db:
        rows, total = check_ins.list_due_check_ins(db)
        assert total == 0


def test_incident_full_flow_post_close_recovery_shared_maintenance_and_guards_pg(pg_factory):
    ids = _seed_rental(pg_factory, hours_ago=4)
    _shift_rental_start(pg_factory, ids["rental_id"], hours_ago=4)
    rental_id = ids["rental_id"]

    # 1. Tạo ticket báo mất & intake không cần assigned_to -> verify LOSS_THEFT -> settle rent -> refund deposit -> single external compensation -> close
    with pg_factory.begin() as db:
        now = incidents.server_now(db)
        staff = db.get(User, ids["staff_id"])
        manager = db.get(User, ids["manager_id"])

        report_ticket = SupportTicket(
            rental_id=rental_id,
            created_by=staff.id,
            report_source="STAFF",
            received_at=now - timedelta(hours=1),
            title="Báo mất xe hợp lệ",
            description="GPS tắt + không liên hệ được",
            status="OPEN",
            created_at=now,
            updated_at=now,
        )
        evidence_ticket = SupportTicket(
            rental_id=rental_id,
            created_by=manager.id,
            report_source="STAFF",
            received_at=now - timedelta(minutes=20),
            title="Hồ sơ xác minh và quyết toán",
            description="Đủ bằng chứng xác minh mất xe",
            status="OPEN",
            created_at=now,
            updated_at=now,
        )
        db.add_all([report_ticket, evidence_ticket])
        db.flush()

        ctx_intake = incidents.lock_rental_context(db, rental_id, [report_ticket.id])
        inc_data = incidents.intake_incident(
            db,
            ctx_intake,
            staff,
            IncidentIntake(
                source_ticket_id=str(report_ticket.id),
                note="Tiếp nhận nghi mất xe không cần assign",
            ),
        )
        inc_id = int(inc_data["id"])
        assert inc_data["assigned_to"] is None

        ctx_verify = incidents.lock_incident_context(
            db, inc_id, [evidence_ticket.id, report_ticket.id]
        )
        verified = incidents.verify_incident(
            db,
            ctx_verify,
            manager,
            IncidentVerify(
                outcome="LOSS_THEFT",
                evidence_ticket_id=str(evidence_ticket.id),
                valid_report_ticket_id=str(report_ticket.id),
                reason="Xác nhận mất xe",
            ),
        )
        assert verified["status"] == "CONFIRMED"
        ev_ticket_id = evidence_ticket.id

    # Quyết toán tiền thuê -> hoàn cọc dư -> chốt bồi thường ngoài hệ thống -> đóng hồ sơ khi xe vẫn STOLEN
    with pg_factory.begin() as db:
        manager = db.get(User, ids["manager_id"])
        ctx_fin = finance.lock_context(
            db, inc_id, ev_ticket_id, with_wallet=True
        )
        preview = finance.rent_preview(db, ctx_fin)
        expected_rent = preview["rent_amount"]
        rent_settlement.settle_rent(
            db,
            ctx_fin,
            manager,
            IncidentRentSettlement(
                evidence_ticket_id=str(ev_ticket_id),
                reason="Quyết toán tiền thuê trước khi đóng",
                expected_rent_amount=expected_rent,
            ),
            None,
        )
        deposit_left = ctx_fin["rental"].deposit_held
        completion.refund_deposit(
            db,
            ctx_fin,
            manager,
            ExpectedAmountAction(
                evidence_ticket_id=str(ev_ticket_id),
                reason="Hoàn cọc thuê dư",
                expected_amount=format(deposit_left, ".2f"),
            ),
            None,
        )
        now = incidents.server_now(db)
        finance.settle_external_compensation(
            db,
            ctx_fin,
            manager,
            ExternalCompensationSettlement(
                evidence_ticket_id=str(ev_ticket_id),
                reason="Chốt bồi thường 3tr ngoài hệ thống",
                amount="3000000.00",
                agreement_status="AGREED",
                payment_method="BANK_TRANSFER",
                payment_reference="VCB-FINAL-01",
                paid_at=now,
            ),
        )
        completion.close_incident(
            db,
            ctx_fin,
            manager,
            FinancialEvidence(
                evidence_ticket_id=str(ev_ticket_id),
                reason="Đóng hồ sơ trong khi xe chưa tìm thấy",
            ),
            None,
        )

    # Kiểm tra trước thu hồi: rental CLOSED_INCIDENT, vehicle vẫn STOLEN, total_price cố định
    with pg_factory.begin() as db:
        inc = db.get(RentalIncident, inc_id)
        rental = db.get(Rental, rental_id)
        vehicle = db.get(Vehicle, ids["vehicle_id"])
        assert inc.status == "CLOSED"
        assert rental.status == "CLOSED_INCIDENT"
        assert vehicle.status == "STOLEN"
        locked_total_price = rental.total_price
        locked_cutoff = inc.billing_cutoff_at

    # 2. Thu hồi sau đóng hồ sơ (post-close recovery):
    # - recovery giữ cutoff & total_price, không mở lại rental
    # - arrival gộp condition='INTACT' với arrived_at != recovered_at
    # - INTACT vẫn KHÔNG tự AVAILABLE nếu chưa qua MaintenanceOrder dùng chung + release-vehicle
    with pg_factory.begin() as db:
        now = incidents.server_now(db)
        staff = db.get(User, ids["staff_id"])
        rec_ticket = SupportTicket(
            rental_id=rental_id,
            created_by=staff.id,
            report_source="STAFF",
            received_at=now - timedelta(minutes=1),
            title="Thu hồi & tiếp nhận xe",
            description="Tìm thấy xe tại bãi công an",
            status="OPEN",
            created_at=now,
            updated_at=now,
        )
        db.add(rec_ticket)
        db.flush()

        ctx_rec = recovery.lock_context(db, inc_id, rec_ticket.id)
        recovered_at = now - timedelta(minutes=30)
        recovery.record_recovery(
            db,
            ctx_rec,
            staff,
            IncidentRecoveryCreate(
                evidence_ticket_id=str(rec_ticket.id),
                note="Thu hồi ngoài hiện trường",
                recovered_at=recovered_at,
            ),
        )
        ctx_arr = recovery.lock_context(
            db, inc_id, rec_ticket.id, station_id=ids["station_id"]
        )
        arrived_at = now - timedelta(minutes=5)
        res_arr = recovery.record_arrival(
            db,
            ctx_arr,
            staff,
            IncidentArrivalCreate(
                evidence_ticket_id=str(rec_ticket.id),
                note="Đưa về trạm và kiểm tra ban đầu INTACT",
                station_id=str(ids["station_id"]),
                arrived_at=arrived_at,
                condition="INTACT",
            ),
        )
        assert res_arr["incident"]["recovered_at"] != res_arr["incident"]["arrived_station_at"]
        assert res_arr["incident"]["recovery_condition"] == "INTACT"
        assert res_arr["vehicle"]["status"] == "MAINTENANCE"
        assert res_arr["rental"]["status"] == "CLOSED_INCIDENT"
        assert db.get(Rental, rental_id).total_price == locked_total_price
        assert db.get(RentalIncident, inc_id).billing_cutoff_at == locked_cutoff

    # Thử mở bảo trì chung KHÔNG truyền incident_id -> bị chặn vì xe gắn rental CLOSED_INCIDENT chưa release
    with pg_factory.begin() as db:
        staff = db.get(User, ids["staff_id"])
        bad_maint = MaintenanceCreate(
            vehicle_id=str(ids["vehicle_id"]),
            title="Thử mở không gắn sự cố",
            description="Phải bị chặn",
        )
        ctx_bad = ops.prepare_maintenance_create(db, bad_maint)
        with pytest.raises(ServiceError) as exc_m:
            ops.create_maintenance(db, ctx_bad, staff, bad_maint)
        assert exc_m.value.code == "ACTIVE_RENTAL_EXISTS"

    # Mở phiếu bảo trì dùng chung CÓ incident_id -> start -> complete -> MANAGER release-vehicle
    with pg_factory.begin() as db:
        staff = db.get(User, ids["staff_id"])
        ok_maint = MaintenanceCreate(
            vehicle_id=str(ids["vehicle_id"]),
            title="Kiểm tra an toàn xe INTACT sau thu hồi",
            description="Kiểm tra phanh, pin, khung",
            assigned_to=str(staff.id),
            incident_id=str(inc_id),
        )
        ctx_m = ops.prepare_maintenance_create(db, ok_maint)
        created_order = ops.create_maintenance(db, ctx_m, staff, ok_maint)
        order_id = int(created_order["id"])
        assert created_order["incident_id"] == str(inc_id)

        # Release trước khi phiếu hoàn tất -> bị chặn
        manager = db.get(User, ids["manager_id"])
        rel_ticket = SupportTicket(
            rental_id=rental_id,
            created_by=manager.id,
            report_source="STAFF",
            received_at=incidents.server_now(db),
            title="Ticket nghiệm thu",
            description="Kiểm tra điều kiện giải phóng",
            status="OPEN",
            created_at=incidents.server_now(db),
            updated_at=incidents.server_now(db),
        )
        db.add(rel_ticket)
        db.flush()

        ctx_rel_early = recovery.lock_context(
            db, inc_id, rel_ticket.id, maintenance_order_id=order_id
        )
        with pytest.raises(ServiceError) as exc_early:
            recovery.release_vehicle(
                db,
                ctx_rel_early,
                manager,
                IncidentVehicleRelease(
                    evidence_ticket_id=str(rel_ticket.id),
                    note="Thử giải phóng sớm",
                    maintenance_order_id=str(order_id),
                ),
            )
        assert exc_early.value.code == "MAINTENANCE_NOT_COMPLETED"

        # Hoàn tất phiếu bảo trì
        ops.change_maintenance(
            db,
            ops.lock_maintenance(db, order_id),
            staff,
            "start",
            MaintenanceStart(),
        )
        ops.change_maintenance(
            db,
            ops.lock_maintenance(db, order_id),
            staff,
            "complete",
            MaintenanceComplete(resolution_note="Xe đạt an toàn"),
        )

    # Tạo ticket nghiệm thu mới sau completed_at; STAFF gọi release bị 403; MANAGER giải phóng thành công
    with pg_factory.begin() as db:
        now = incidents.server_now(db)
        staff = db.get(User, ids["staff_id"])
        manager = db.get(User, ids["manager_id"])
        final_ticket = SupportTicket(
            rental_id=rental_id,
            created_by=manager.id,
            report_source="STAFF",
            received_at=now,
            title="Nghiệm thu đưa xe hoạt động lại",
            description="Đã đạt kiểm tra pin & an toàn",
            status="OPEN",
            created_at=now,
            updated_at=now,
        )
        db.add(final_ticket)
        db.flush()

        ctx_rel = recovery.lock_context(
            db, inc_id, final_ticket.id, maintenance_order_id=order_id
        )
        with pytest.raises(ServiceError) as exc_rbac:
            recovery.release_vehicle(
                db,
                ctx_rel,
                staff,
                IncidentVehicleRelease(
                    evidence_ticket_id=str(final_ticket.id),
                    note="Staff thử giải phóng",
                    maintenance_order_id=str(order_id),
                ),
            )
        assert exc_rbac.value.code == "MANAGER_REQUIRED"

        released = recovery.release_vehicle(
            db,
            ctx_rel,
            manager,
            IncidentVehicleRelease(
                evidence_ticket_id=str(final_ticket.id),
                note="MANAGER duyệt giải phóng xe INTACT",
                maintenance_order_id=str(order_id),
            ),
        )
        assert released["vehicle"]["status"] == "AVAILABLE"
        assert released["rental"]["vehicle_released_at"] is not None
        assert released["rental"]["status"] == "CLOSED_INCIDENT"
        assert released["incident"]["status"] == "CLOSED"


def test_http_checkin_endpoints_against_postgres(pg_factory):
    ids = _seed_rental(pg_factory, hours_ago=25)
    _shift_rental_start(pg_factory, ids["rental_id"], hours_ago=25)

    def override_db():
        with pg_factory() as db:
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise

    with pg_factory() as ro_db:
        staff = ro_db.get(User, ids["staff_id"])
        customer = ro_db.get(User, ids["customer_id"])

    actor_holder = {"user": customer}
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: actor_holder["user"]

    try:
        client = TestClient(app)

        # CUSTOMER bị chặn 403
        r_cust = client.get("/api/v1/rental-check-ins")
        assert r_cust.status_code == 403

        # STAFF đọc được danh sách đến lịch kiểm tra
        actor_holder["user"] = staff
        r_list = client.get("/api/v1/rental-check-ins")
        assert r_list.status_code == 200
        assert r_list.json()["meta"]["total"] == 1
        assert r_list.json()["data"][0]["rental_id"] == str(ids["rental_id"])

        # STAFF ghi nhận CONTINUE_RENTAL với Idempotency-Key
        future = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        headers = {"Idempotency-Key": "checkin-continue-key-123456"}
        r_cont = client.post(
            f"/api/v1/rental-check-ins/{ids['rental_id']}",
            json={
                "outcome": "CONTINUE_RENTAL",
                "note": "Khách báo tiếp tục thuê thêm 1 ngày",
                "next_check_at": future,
            },
            headers=headers,
        )
        assert r_cont.status_code == 200
        assert r_cont.json()["data"]["outcome"] == "CONTINUE_RENTAL"

        # Replay với cùng Idempotency-Key trả lại đúng kết quả
        r_replay = client.post(
            f"/api/v1/rental-check-ins/{ids['rental_id']}",
            json={
                "outcome": "CONTINUE_RENTAL",
                "note": "Khách báo tiếp tục thuê thêm 1 ngày",
                "next_check_at": future,
            },
            headers=headers,
        )
        assert r_replay.status_code == 200
        assert r_replay.json() == r_cont.json()

        # Sau khi CONTINUE_RENTAL tới tương lai, danh sách rỗng
        r_after = client.get("/api/v1/rental-check-ins")
        assert r_after.status_code == 200
        assert r_after.json()["meta"]["total"] == 0
    finally:
        app.dependency_overrides.clear()
