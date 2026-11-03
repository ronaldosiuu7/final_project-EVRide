from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('CUSTOMER', 'STAFF', 'MANAGER')", name="ck_users_role"
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'BLACKLISTED')",
            name="ck_users_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class StoredFile(Base):
    __tablename__ = "stored_files"
    __table_args__ = (
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name="ck_stored_files_content_type",
        ),
        CheckConstraint(
            "size_bytes BETWEEN 1 AND 10485760",
            name="ck_stored_files_size_range",
        ),
        CheckConstraint(
            "char_length(sha256) = 64", name="ck_stored_files_sha256_length"
        ),
        CheckConstraint(
            "status IN ('PENDING', 'READY', 'REJECTED')",
            name="ck_stored_files_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'PENDING'")
    )
    uploaded_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserDocument(Base):
    __tablename__ = "user_documents"
    __table_args__ = (
        CheckConstraint(
            "document_type IN ('CCCD', 'PASSPORT', 'DRIVER_LICENSE')",
            name="ck_user_documents_document_type",
        ),
        CheckConstraint(
            "verified_status IN ('PENDING', 'VERIFIED', 'REJECTED')",
            name="ck_user_documents_verified_status",
        ),
        CheckConstraint(
            "verified_status <> 'VERIFIED' OR "
            "(verified_by IS NOT NULL AND verified_at IS NOT NULL AND "
            "(document_type <> 'CCCD' OR "
            "(verified_birth_date IS NOT NULL AND expires_on IS NOT NULL)))",
            name="ck_user_documents_verified_details",
        ),
        CheckConstraint(
            "revoked_at IS NULL OR verified_at IS NULL OR revoked_at >= verified_at",
            name="ck_user_documents_revocation_time_order",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    document_type: Mapped[str] = mapped_column(String(30), nullable=False)
    document_number: Mapped[str] = mapped_column(String(50), nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date)
    expires_on: Mapped[date | None] = mapped_column(Date)
    verified_birth_date: Mapped[date | None] = mapped_column(Date)
    verified_status: Mapped[str] = mapped_column(String(20), nullable=False)
    verified_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("balance >= 0", name="ck_wallets_balance_nonnegative"),
        CheckConstraint(
            "status IN ('ACTIVE', 'FROZEN', 'LOCKED')", name="ck_wallets_status"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default=text("0.00")
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Station(Base):
    __tablename__ = "stations"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_stations_capacity_positive"),
        CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE')", name="ck_stations_status"
        ),
        CheckConstraint(
            "(opens_at IS NULL AND closes_at IS NULL) OR "
            "(opens_at IS NOT NULL AND closes_at IS NOT NULL "
            "AND opens_at <> closes_at)",
            name="ck_stations_opening_hours_pair",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    opens_at: Mapped[time | None] = mapped_column(Time)
    closes_at: Mapped[time | None] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), nullable=False)


class Vehicle(Base):
    __tablename__ = "vehicles"
    __table_args__ = (
        CheckConstraint(
            "battery_percent BETWEEN 0 AND 100",
            name="ck_vehicles_battery_percent_range",
        ),
        CheckConstraint(
            "first_30_minutes_price >= 0",
            name="ck_vehicles_first_30_minutes_price_nonnegative",
        ),
        CheckConstraint(
            "extra_minute_price >= 0",
            name="ck_vehicles_extra_minute_price_nonnegative",
        ),
        CheckConstraint(
            "deposit_amount >= 0", name="ck_vehicles_deposit_amount_nonnegative"
        ),
        CheckConstraint(
            "status IN ('AVAILABLE', 'RESERVED', 'RENTED', 'RETURN_PENDING', "
            "'MAINTENANCE', "
            "'SUSPECTED_STOLEN', 'STOLEN')",
            name="ck_vehicles_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    current_station_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("stations.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    battery_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    first_30_minutes_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    extra_minute_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Rental(Base):
    __tablename__ = "rentals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('RESERVED', 'IN_RENT', 'RETURN_PENDING', 'STOLEN', "
            "'COMPLETED', 'CANCELLED', 'EXPIRED')",
            name="ck_rentals_status",
        ),
        CheckConstraint(
            "total_price >= 0", name="ck_rentals_total_price_nonnegative"
        ),
        CheckConstraint(
            "actual_end_time IS NULL OR actual_start_time IS NULL OR "
            "actual_end_time >= actual_start_time",
            name="ck_rentals_time_order",
        ),
        CheckConstraint(
            "return_initiated_at IS NULL OR "
            "(actual_start_time IS NOT NULL AND "
            "return_initiated_at >= actual_start_time AND "
            "(actual_end_time IS NULL OR actual_end_time = return_initiated_at))",
            name="ck_rentals_return_time_order",
        ),
        CheckConstraint(
            "settled_at IS NULL OR "
            "(return_initiated_at IS NOT NULL AND settled_at >= return_initiated_at)",
            name="ck_rentals_settlement_time_order",
        ),
        CheckConstraint(
            "cancelled_at IS NULL OR cancelled_at >= created_at",
            name="ck_rentals_cancellation_time_order",
        ),
        CheckConstraint(
            "deposit_held >= 0", name="ck_rentals_deposit_held_nonnegative"
        ),
        Index("idx_rentals_status_expires_at", "status", "expires_at"),
        Index("idx_rentals_customer_created_at", "customer_id", "created_at"),
        Index("idx_rentals_vehicle_id", "vehicle_id"),
        Index(
            "uq_active_vehicle_rental",
            "vehicle_id",
            unique=True,
            postgresql_where=text(
                "status IN ('RESERVED', 'IN_RENT', 'RETURN_PENDING', 'STOLEN')"
            ),
        ),
        Index(
            "uq_active_customer_rental",
            "customer_id",
            unique=True,
            postgresql_where=text(
                "status IN ('RESERVED', 'IN_RENT', 'RETURN_PENDING', 'STOLEN')"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id"), nullable=False
    )
    pickup_station_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stations.id"), nullable=False
    )
    actual_return_station_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("stations.id")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actual_start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    return_initiated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(String(100))
    cancellation_limit_exempt: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    cancelled_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id")
    )
    deposit_held: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default=text("0.00")
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'RESERVED'")
    )
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    pricing_snapshot: Mapped[RentalPricingSnapshot | None] = relationship(
        back_populates="rental", uselist=False
    )
    return_quotes: Mapped[list[RentalReturnQuote]] = relationship(
        back_populates="rental"
    )


class Handover(Base):
    __tablename__ = "handovers"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('PICKUP', 'RETURN')", name="ck_handovers_kind"
        ),
        CheckConstraint("time <= created_at", name="ck_handovers_time_order"),
        CheckConstraint(
            "battery_percent BETWEEN 0 AND 100",
            name="ck_handovers_battery_percent_range",
        ),
        CheckConstraint(
            "vehicle_condition IS NULL OR "
            "vehicle_condition IN ('OK', 'NEEDS_MAINTENANCE')",
            name="ck_handovers_vehicle_condition",
        ),
        Index("uq_handovers_rental_kind", "rental_id", "kind", unique=True),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False
    )
    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    battery_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    vehicle_condition: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class RentalReview(Base):
    __tablename__ = "rental_reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_rental_reviews_rating_range"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("rentals.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_invoices_total_amount_nonnegative"),
        CheckConstraint(
            "status IN ('UNPAID', 'PAID', 'CANCELLED')", name="ck_invoices_status"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id"), unique=True, nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_transactions_amount_nonnegative"),
        CheckConstraint(
            "status IN ('PENDING', 'SUCCESS', 'FAILED')",
            name="ck_transactions_status",
        ),
        CheckConstraint(
            "kind IN ('PAYMENT', 'DEPOSIT', 'REFUND', 'FEE')",
            name="ck_transactions_kind",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id"), nullable=False
    )
    invoice_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("invoices.id"))
    actor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    idempotency_record_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("idempotency_records.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    idempotency_record: Mapped[IdempotencyRecord | None] = relationship(
        back_populates="transactions"
    )
    wallet_transaction: Mapped[WalletTransaction | None] = relationship(
        back_populates="transaction", uselist=False
    )


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('TOPUP', 'WITHDRAW', 'RENTAL_PAYMENT', 'RENTAL_DEPOSIT', "
            "'RENTAL_REFUND')",
            name="ck_wallet_transactions_type",
        ),
        CheckConstraint(
            "balance_before >= 0",
            name="ck_wallet_transactions_balance_before_nonnegative",
        ),
        CheckConstraint(
            "balance_after >= 0",
            name="ck_wallet_transactions_balance_after_nonnegative",
        ),
        CheckConstraint("amount >= 0", name="ck_wallet_transactions_amount_nonnegative"),
        CheckConstraint(
            "status IN ('PENDING', 'SUCCESS', 'FAILED')",
            name="ck_wallet_transactions_status",
        ),
        UniqueConstraint("transaction_id", name="uq_wallet_transactions_transaction"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("wallets.id"), nullable=False
    )
    rental_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("rentals.id"))
    transaction_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("transactions.id", ondelete="RESTRICT")
    )
    idempotency_record_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("idempotency_records.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    balance_before: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    transaction: Mapped[Transaction | None] = relationship(
        back_populates="wallet_transaction"
    )
    idempotency_record: Mapped[IdempotencyRecord | None] = relationship(
        back_populates="wallet_transactions"
    )


class Promotion(Base):
    __tablename__ = "promotions"
    __table_args__ = (
        CheckConstraint(
            "discount_percent BETWEEN 0 AND 100",
            name="ck_promotions_discount_percent_range",
        ),
        CheckConstraint(
            "max_discount_amount >= 0",
            name="ck_promotions_max_discount_amount_nonnegative",
        ),
        CheckConstraint(
            "min_rental_amount >= 0",
            name="ck_promotions_min_rental_amount_nonnegative",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'EXPIRED', 'DISABLED')",
            name="ck_promotions_status",
        ),
        CheckConstraint("end_date > start_date", name="ck_promotions_date_order"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discount_percent: Mapped[int | None] = mapped_column(Integer)
    max_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    min_rental_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class UserPromotion(Base):
    __tablename__ = "user_promotions"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "promotion_id", name="uq_user_promotions_user_promotion"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    promotion_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False
    )
    is_used: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')",
            name="ck_support_tickets_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id"), nullable=False
    )
    created_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    assigned_to: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class MaintenanceOrder(Base):
    __tablename__ = "maintenance_orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')",
            name="ck_maintenance_orders_status",
        ),
        Index(
            "uq_maintenance_orders_active_vehicle",
            "vehicle_id",
            unique=True,
            postgresql_where=text("status IN ('OPEN', 'IN_PROGRESS')"),
        ),
        CheckConstraint(
            "(started_at IS NULL OR started_at >= opened_at) AND "
            "(completed_at IS NULL OR "
            "(started_at IS NOT NULL AND completed_at >= started_at))",
            name="ck_maintenance_orders_time_order",
        ),
        CheckConstraint(
            "(status <> 'IN_PROGRESS' OR started_at IS NOT NULL) AND "
            "(status <> 'COMPLETED' OR completed_at IS NOT NULL)",
            name="ck_maintenance_orders_status_times",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False
    )
    created_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    assigned_to: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class FileAttachment(Base):
    __tablename__ = "file_attachments"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(vehicle_id, maintenance_order_id, handover_id, "
            "user_document_id, support_ticket_id) = 1",
            name="ck_file_attachments_single_owner",
        ),
        CheckConstraint(
            "purpose IN ('VEHICLE_PHOTO', 'MAINTENANCE_BEFORE', "
            "'MAINTENANCE_AFTER', 'HANDOVER_PICKUP', 'HANDOVER_RETURN', "
            "'USER_DOCUMENT_FRONT', 'USER_DOCUMENT_BACK', 'TICKET_EVIDENCE')",
            name="ck_file_attachments_purpose",
        ),
        CheckConstraint(
            "(purpose = 'VEHICLE_PHOTO' AND vehicle_id IS NOT NULL) OR "
            "(purpose IN ('MAINTENANCE_BEFORE', 'MAINTENANCE_AFTER') "
            "AND maintenance_order_id IS NOT NULL) OR "
            "(purpose IN ('HANDOVER_PICKUP', 'HANDOVER_RETURN') "
            "AND handover_id IS NOT NULL) OR "
            "(purpose IN ('USER_DOCUMENT_FRONT', 'USER_DOCUMENT_BACK') "
            "AND user_document_id IS NOT NULL) OR "
            "(purpose = 'TICKET_EVIDENCE' AND support_ticket_id IS NOT NULL)",
            name="ck_file_attachments_purpose_owner",
        ),
        UniqueConstraint("file_id", name="uq_file_attachments_file"),
        Index("idx_file_attachments_vehicle", "vehicle_id"),
        Index("idx_file_attachments_maintenance", "maintenance_order_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    file_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=False
    )
    vehicle_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="RESTRICT")
    )
    maintenance_order_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("maintenance_orders.id", ondelete="RESTRICT")
    )
    handover_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("handovers.id", ondelete="RESTRICT")
    )
    user_document_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("user_documents.id", ondelete="RESTRICT")
    )
    support_ticket_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("support_tickets.id", ondelete="RESTRICT")
    )
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    attached_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class VehicleMoveAudit(Base):
    __tablename__ = "vehicle_move_audits"
    __table_args__ = (
        CheckConstraint(
            "from_station_id <> to_station_id",
            name="ck_vehicle_move_audits_different_stations",
        ),
        UniqueConstraint(
            "idempotency_record_id",
            name="uq_vehicle_move_audits_idempotency_record",
        ),
        Index("idx_vehicle_move_audits_vehicle_time", "vehicle_id", "moved_at"),
        Index("idx_vehicle_move_audits_source_time", "from_station_id", "moved_at"),
        Index("idx_vehicle_move_audits_target_time", "to_station_id", "moved_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False
    )
    from_station_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    to_station_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    actor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_record_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("idempotency_records.id", ondelete="SET NULL"),
    )
    note: Mapped[str | None] = mapped_column(Text)
    moved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class GPSPoint(Base):
    __tablename__ = "gps_points"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False
    )
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        UniqueConstraint(
            "actor_id",
            "http_method",
            "request_path",
            "idempotency_key",
            name="uq_idempotency_scope_key",
        ),
        CheckConstraint(
            "state IN ('PROCESSING', 'COMPLETED')",
            name="ck_idempotency_records_state",
        ),
        CheckConstraint(
            "char_length(idempotency_key) BETWEEN 16 AND 128",
            name="ck_idempotency_records_key_length",
        ),
        CheckConstraint(
            "char_length(request_hash) = 64",
            name="ck_idempotency_records_hash_length",
        ),
        CheckConstraint(
            "(state = 'PROCESSING' AND completed_at IS NULL "
            "AND response_status IS NULL) OR "
            "(state = 'COMPLETED' AND completed_at IS NOT NULL "
            "AND response_status BETWEEN 100 AND 599)",
            name="ck_idempotency_records_completion",
        ),
        CheckConstraint(
            "expires_at >= created_at + INTERVAL '24 hours'",
            name="ck_idempotency_records_minimum_retention",
        ),
        Index("idx_idempotency_records_expiry", "expires_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    actor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    http_method: Mapped[str] = mapped_column(String(10), nullable=False)
    request_path: Mapped[str] = mapped_column(String(500), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'PROCESSING'")
    )
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[Any | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    transactions: Mapped[list[Transaction]] = relationship(
        back_populates="idempotency_record"
    )
    wallet_transactions: Mapped[list[WalletTransaction]] = relationship(
        back_populates="idempotency_record"
    )


class RentalPricingSnapshot(Base):
    __tablename__ = "rental_pricing_snapshots"
    __table_args__ = (
        UniqueConstraint("rental_id", name="uq_rental_pricing_snapshots_rental"),
        CheckConstraint(
            "first_30_minutes_price_snapshot >= 0",
            name="ck_rental_price_first_30_minutes_nonnegative",
        ),
        CheckConstraint(
            "extra_minute_price_snapshot >= 0",
            name="ck_rental_price_extra_minute_nonnegative",
        ),
        CheckConstraint(
            "deposit_amount_snapshot >= 0",
            name="ck_rental_price_deposit_nonnegative",
        ),
        CheckConstraint(
            "discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100",
            name="ck_rental_price_discount_percent",
        ),
        CheckConstraint(
            "max_discount_amount IS NULL OR max_discount_amount >= 0",
            name="ck_rental_price_max_discount_nonnegative",
        ),
        CheckConstraint(
            "discount_amount >= 0", name="ck_rental_price_discount_nonnegative"
        ),
        CheckConstraint(
            "pricing_policy_version <> ''",
            name="ck_rental_price_policy_version_nonempty",
        ),
        CheckConstraint(
            "jsonb_typeof(pricing_policy_snapshot) = 'object'",
            name="ck_rental_price_policy_snapshot_object",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("rentals.id", ondelete="RESTRICT"),
        nullable=False,
    )
    vehicle_name: Mapped[str] = mapped_column(String(100), nullable=False)
    vehicle_type_snapshot: Mapped[str] = mapped_column(String(50), nullable=False)
    first_30_minutes_price_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    extra_minute_price_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    pricing_policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    billing_unit: Mapped[str] = mapped_column(String(64), nullable=False)
    pricing_policy_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False
    )
    deposit_amount_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    promotion_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("promotions.id", ondelete="SET NULL")
    )
    promotion_code: Mapped[str | None] = mapped_column(String(50))
    discount_percent: Mapped[int | None] = mapped_column(Integer)
    max_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default=text("0.00")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    rental: Mapped[Rental] = relationship(back_populates="pricing_snapshot")


class VehiclePricingHistory(Base):
    __tablename__ = "vehicle_pricing_history"
    __table_args__ = (
        UniqueConstraint(
            "vehicle_id", "version_number", name="uq_vehicle_pricing_history_version"
        ),
        CheckConstraint(
            "(old_first_30_minutes_price IS NULL OR old_first_30_minutes_price >= 0) "
            "AND new_first_30_minutes_price >= 0",
            name="ck_vehicle_pricing_history_first_30_nonnegative",
        ),
        CheckConstraint(
            "(old_extra_minute_price IS NULL OR old_extra_minute_price >= 0) "
            "AND new_extra_minute_price >= 0",
            name="ck_vehicle_pricing_history_extra_minute_nonnegative",
        ),
        CheckConstraint(
            "(old_deposit_amount IS NULL OR old_deposit_amount >= 0) "
            "AND new_deposit_amount >= 0",
            name="ck_vehicle_pricing_history_deposit_nonnegative",
        ),
        CheckConstraint("version_number > 0", name="ck_vehicle_pricing_history_version"),
        Index("idx_vehicle_pricing_history_vehicle_created", "vehicle_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False
    )
    changed_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    old_first_30_minutes_price: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2)
    )
    new_first_30_minutes_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    old_extra_minute_price: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2)
    )
    new_extra_minute_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    old_deposit_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    new_deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class RentalReturnQuote(Base):
    __tablename__ = "rental_return_quotes"
    __table_args__ = (
        CheckConstraint(
            "elapsed_seconds >= 0", name="ck_return_quotes_elapsed_nonnegative"
        ),
        CheckConstraint(
            "rental_fee >= 0 AND discount_amount >= 0 AND total_amount >= 0 "
            "AND deposit_held >= 0 AND deposit_applied >= 0 "
            "AND additional_payment >= 0 AND deposit_refund >= 0",
            name="ck_return_quotes_amounts_nonnegative",
        ),
        CheckConstraint(
            "quote_expires_at > quote_created_at",
            name="ck_return_quotes_expiry_after_creation",
        ),
        CheckConstraint(
            "return_initiated_at IS NULL OR "
            "return_initiated_at <= quote_created_at",
            name="ck_return_quotes_return_time_order",
        ),
        CheckConstraint(
            "is_estimate OR return_initiated_at IS NOT NULL",
            name="ck_return_quotes_final_requires_return",
        ),
        UniqueConstraint("quote_token_hash", name="uq_return_quotes_token_hash"),
        Index("idx_return_quotes_rental_created", "rental_id", "quote_created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id", ondelete="RESTRICT"), nullable=False
    )
    return_station_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stations.id", ondelete="RESTRICT"), nullable=False
    )
    is_estimate: Mapped[bool] = mapped_column(Boolean, nullable=False)
    return_initiated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    quote_created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    quote_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    elapsed_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, server_default=text("'VND'")
    )
    pricing_policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    rental_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_held: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_applied: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    additional_payment: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_refund: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    promotion_code: Mapped[str | None] = mapped_column(String(50))
    quote_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    rental: Mapped[Rental] = relationship(back_populates="return_quotes")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_actor_created", "actor_id", "created_at"),
        Index("idx_audit_logs_resource", "resource_type", "resource_id"),
        Index("idx_audit_logs_created", "created_at"),
        Index("idx_audit_logs_request_id", "request_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(100))
    request_id: Mapped[str | None] = mapped_column(String(64))
    before_data: Mapped[Any | None] = mapped_column(JSONB)
    after_data: Mapped[Any | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
