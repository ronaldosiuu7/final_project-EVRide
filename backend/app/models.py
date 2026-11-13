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
    ForeignKeyConstraint,
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
    model: Mapped[str] = mapped_column(String(100), nullable=False)
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
            "'INCIDENT_PENDING', 'CLOSED_INCIDENT', "
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
                "status IN ('RESERVED', 'IN_RENT', 'RETURN_PENDING', "
                "'STOLEN', 'INCIDENT_PENDING', 'CLOSED_INCIDENT') "
                "AND vehicle_released_at IS NULL"
            ),
        ),

        Index(
            "uq_active_customer_rental",
            "customer_id",
            unique=True,
            postgresql_where=text(
                "status IN ('RESERVED', 'IN_RENT', 'RETURN_PENDING', "
                "'STOLEN', 'INCIDENT_PENDING')"
            ),
        ),
        CheckConstraint(
            "status NOT IN ('STOLEN', 'INCIDENT_PENDING', 'CLOSED_INCIDENT') "
            "OR actual_start_time IS NOT NULL",
            name="ck_rentals_incident_started",
        ),

        CheckConstraint(
            """
            (
                vehicle_released_at IS NULL
                AND vehicle_released_by IS NULL
                AND vehicle_release_note IS NULL
            )
            OR
            (
                vehicle_released_at IS NOT NULL
                AND vehicle_released_by IS NOT NULL
                AND vehicle_release_note IS NOT NULL
                AND length(btrim(vehicle_release_note)) > 0
                AND status IN (
                    'STOLEN', 'INCIDENT_PENDING', 'CLOSED_INCIDENT'
                )
                AND actual_start_time IS NOT NULL
                AND vehicle_released_at >= actual_start_time
            )
            """,
            name="ck_rentals_vehicle_release",
        ),
        Index(
            "ix_rentals_in_rent_check",
            "actual_start_time",
            "next_check_at",
            postgresql_where=text(
                "status = 'IN_RENT' AND actual_start_time IS NOT NULL"
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
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    vehicle_released_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    vehicle_released_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
    )

    vehicle_release_note: Mapped[str | None] = mapped_column(Text)
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
            "kind IN ('PAYMENT', 'DEPOSIT', 'REFUND', 'FEE', 'ADJUSTMENT')",
            name="ck_transactions_kind",
        ),
        UniqueConstraint(
            "id",
            "rental_id",
            name="uq_transactions_id_rental",
        ),
        UniqueConstraint(
            "incident_id",
            "business_operation_key",
            "posting_key",
            name="uq_transactions_incident_operation_posting",
        ),
        ForeignKeyConstraint(
            ["incident_id", "rental_id"],
            ["rental_incidents.id", "rental_incidents.rental_id"],
            name="fk_transactions_incident_rental",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["source_transaction_id", "rental_id"],
            ["transactions.id", "transactions.rental_id"],
            name="fk_transactions_source_rental",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["decision_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_transactions_decision_ticket_rental",
            ondelete="RESTRICT",
        ),
        Index(
            "ix_transactions_source_transaction_id",
            "source_transaction_id",
        ),
        CheckConstraint(
            """
            (
                incident_id IS NULL
                AND obligation_type IS NULL
                AND funding_source IS NULL
                AND source_transaction_id IS NULL
                AND business_operation_key IS NULL
                AND posting_key IS NULL
                AND adjustment_direction IS NULL
                AND decision_ticket_id IS NULL
                AND kind <> 'ADJUSTMENT'
            )
            OR
            (
                incident_id IS NOT NULL
                AND obligation_type IS NOT NULL
                AND obligation_type IN (
                    'RENTAL_FEE',
                    'COMPENSATION',
                    'DEPOSIT'
                )
                AND business_operation_key IS NOT NULL
                AND length(btrim(business_operation_key)) > 0
                AND posting_key IS NOT NULL
                AND length(btrim(posting_key)) > 0
                AND amount > 0
                AND amount <> 'NaN'::numeric
                AND status = 'SUCCESS'
                AND kind IN ('PAYMENT', 'REFUND', 'ADJUSTMENT')
            )
            """,
            name="ck_transactions_incident_metadata",
        ),
        CheckConstraint(
            """
            incident_id IS NULL
            OR
            (
                (
                    kind = 'PAYMENT'
                    AND obligation_type IN (
                        'RENTAL_FEE',
                        'COMPENSATION'
                    )
                    AND adjustment_direction IS NULL
                    AND funding_source IS NOT NULL
                    AND
                    (
                        (
                            funding_source = 'DEPOSIT'
                            AND source_transaction_id IS NOT NULL
                        )
                        OR
                        (
                            funding_source = 'WALLET'
                            AND source_transaction_id IS NULL
                        )
                    )
                )
                OR
                (
                    kind = 'REFUND'
                    AND obligation_type IN (
                        'COMPENSATION',
                        'DEPOSIT'
                    )
                    AND adjustment_direction IS NULL
                    AND funding_source IS NOT NULL
                    AND funding_source IN ('DEPOSIT', 'WALLET')
                    AND source_transaction_id IS NOT NULL
                    AND decision_ticket_id IS NOT NULL
                    AND
                    (
                        obligation_type <> 'DEPOSIT'
                        OR funding_source = 'DEPOSIT'
                    )
                )
                OR
                (
                    kind = 'ADJUSTMENT'
                    AND obligation_type = 'COMPENSATION'
                    AND adjustment_direction IS NOT NULL
                    AND adjustment_direction IN (
                        'INCREASE',
                        'DECREASE'
                    )
                    AND funding_source IS NULL
                    AND source_transaction_id IS NULL
                    AND decision_ticket_id IS NOT NULL
                )
            )
            """,
            name="ck_transactions_incident_flow",
        ),
        CheckConstraint(
            """
            source_transaction_id IS NULL
            OR source_transaction_id <> id
            """,
            name="ck_transactions_source_not_self",
        ),
        CheckConstraint(
            """
            incident_id IS NULL
            OR
            (
                (
                    obligation_type = 'RENTAL_FEE'
                    AND invoice_id IS NOT NULL
                )
                OR
                (
                    obligation_type <> 'RENTAL_FEE'
                    AND invoice_id IS NULL
                )
            )
            """,
            name="ck_transactions_incident_invoice",
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
    incident_id: Mapped[int | None] = mapped_column(BigInteger)

    obligation_type: Mapped[str | None] = mapped_column(String(20))

    funding_source: Mapped[str | None] = mapped_column(String(20))

    source_transaction_id: Mapped[int | None] = mapped_column(BigInteger)

    business_operation_key: Mapped[str | None] = mapped_column(String(100))

    posting_key: Mapped[str | None] = mapped_column(String(100))

    adjustment_direction: Mapped[str | None] = mapped_column(String(10))

    decision_ticket_id: Mapped[int | None] = mapped_column(BigInteger)
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
            "type IN ("
            "'TOPUP', "
            "'WITHDRAW', "
            "'RENTAL_PAYMENT', "
            "'RENTAL_DEPOSIT', "
            "'RENTAL_REFUND', "
            "'COMPENSATION_PAYMENT', "
            "'COMPENSATION_REFUND'"
            ")",
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
            "(discount_type = 'PERCENTAGE' AND discount_value BETWEEN 1 AND 100 "
            "AND discount_value = trunc(discount_value)) OR "
            "(discount_type = 'FIXED_AMOUNT' AND discount_value > 0)",
            name="ck_promotions_discount_value",
        ),
        CheckConstraint(
            "max_discount_amount IS NULL OR "
            "(discount_type = 'PERCENTAGE' AND max_discount_amount >= 0)",
            name="ck_promotions_max_discount_amount_nonnegative",
        ),
        CheckConstraint(
            "min_rental_amount IS NULL OR min_rental_amount >= 0",
            name="ck_promotions_min_rental_amount_nonnegative",
        ),
        CheckConstraint(
            "usage_limit IS NULL OR usage_limit > 0",
            name="ck_promotions_usage_limit_positive",
        ),
        CheckConstraint(
            "used_count >= 0 AND (usage_limit IS NULL OR used_count <= usage_limit)",
            name="ck_promotions_used_count_range",
        ),
        CheckConstraint(
            "vehicle_model IS NULL OR char_length(trim(vehicle_model)) > 0",
            name="ck_promotions_vehicle_model_nonempty",
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
    discount_type: Mapped[str] = mapped_column(String(20), nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    max_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    min_rental_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    vehicle_model: Mapped[str | None] = mapped_column(String(100))
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    used_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
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

class RentalIncident(Base):
    __tablename__ = "rental_incidents"
    __table_args__ = (
        UniqueConstraint(
            "rental_id",
            name="uq_rental_incidents_rental",
        ),
        UniqueConstraint(
            "id",
            "rental_id",
            name="uq_rental_incidents_id_rental",
        ),
        ForeignKeyConstraint(
            ["valid_report_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_rental_incidents_valid_report_rental",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["inspection_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_rental_incidents_inspection_ticket_rental",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["valuation_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_rental_incidents_valuation_ticket_rental",
            ondelete="RESTRICT",
        ),
        Index(
            "ix_rental_incidents_assigned_to",
            "assigned_to",
        ),
        CheckConstraint(
            "status IN "
            "('OPEN', 'INVESTIGATING', 'CONFIRMED', "
            "'DISMISSED', 'CLOSED')",
            name="ck_rental_incidents_status",
        ),
        CheckConstraint(
            """
            (
                status IN ('OPEN', 'INVESTIGATING')
                AND verified_outcome IS NULL
            )
            OR
            (
                status = 'DISMISSED'
                AND verified_outcome IS NOT NULL
                AND verified_outcome = 'FALSE_ALARM'
            )
            OR
            (
                status IN ('CONFIRMED', 'CLOSED')
                AND verified_outcome IS NOT NULL
                AND verified_outcome IN ('LOSS_THEFT', 'ABANDONMENT')
            )
            """,
            name="ck_rental_incidents_verification_state",
        ),
        CheckConstraint(
            """
            (
                verified_outcome IS NULL
                AND verified_by IS NULL
                AND verified_at IS NULL
                AND verification_reason IS NULL
            )
            OR
            (
                verified_outcome IS NOT NULL
                AND verified_by IS NOT NULL
                AND verified_at IS NOT NULL
                AND verification_reason IS NOT NULL
                AND length(btrim(verification_reason)) > 0
            )
            """,
            name="ck_rental_incidents_verification_details",
        ),
        CheckConstraint(
            "verified_at IS NULL OR verified_at >= created_at",
            name="ck_rental_incidents_verification_time",
        ),
        CheckConstraint(
            """
            CASE
                WHEN verified_outcome = 'LOSS_THEFT' THEN
                    valid_report_ticket_id IS NOT NULL
                    AND valid_report_received_at IS NOT NULL
                    AND verified_at IS NOT NULL
                    AND valid_report_received_at <= verified_at
                    AND billing_cutoff_at IS NOT NULL
                    AND billing_cutoff_at = valid_report_received_at
                    AND billing_cutoff_reason IS NOT NULL
                    AND billing_cutoff_reason = 'VALID_REPORT'

                WHEN verified_outcome = 'ABANDONMENT' THEN
                    valid_report_ticket_id IS NULL
                    AND valid_report_received_at IS NULL
                    AND (
                        (
                            status = 'CONFIRMED'
                            AND recovered_at IS NULL
                            AND billing_cutoff_at IS NULL
                            AND billing_cutoff_reason IS NULL
                        )
                        OR
                        (
                            recovered_at IS NOT NULL
                            AND billing_cutoff_at IS NOT NULL
                            AND billing_cutoff_at = recovered_at
                            AND billing_cutoff_reason IS NOT NULL
                            AND billing_cutoff_reason = 'RECOVERY'
                        )
                    )

                ELSE
                    valid_report_ticket_id IS NULL
                    AND valid_report_received_at IS NULL
                    AND billing_cutoff_at IS NULL
                    AND billing_cutoff_reason IS NULL
            END
            """,
            name="ck_rental_incidents_billing_basis",
        ),
        CheckConstraint(
            """
            (
                recovered_at IS NULL
                AND received_by IS NULL
                AND recovery_note IS NULL
            )
            OR
            (
                recovered_at IS NOT NULL
                AND received_by IS NOT NULL
                AND recovery_note IS NOT NULL
                AND length(btrim(recovery_note)) > 0
            )
            """,
            name="ck_rental_incidents_recovery_details",
        ),
        CheckConstraint(
            """
            (
                arrived_station_at IS NULL
                AND received_station_id IS NULL
                AND station_received_by IS NULL
            )
            OR
            (
                arrived_station_at IS NOT NULL
                AND received_station_id IS NOT NULL
                AND station_received_by IS NOT NULL
                AND recovered_at IS NOT NULL
                AND arrived_station_at >= recovered_at
            )
            """,
            name="ck_rental_incidents_station_arrival",
        ),
        CheckConstraint(
            """
            (
                recovery_condition IS NULL
                AND inspected_at IS NULL
                AND inspected_by IS NULL
                AND inspection_note IS NULL
                AND inspection_ticket_id IS NULL
            )
            OR
            (
                recovery_condition IS NOT NULL
                AND recovery_condition IN (
                    'INTACT', 'REPAIRABLE', 'UNREPAIRABLE'
                )
                AND inspected_at IS NOT NULL
                AND inspected_by IS NOT NULL
                AND inspection_note IS NOT NULL
                AND length(btrim(inspection_note)) > 0
                AND inspection_ticket_id IS NOT NULL
                AND recovered_at IS NOT NULL
                AND inspected_at >= recovered_at
            )
            """,
            name="ck_rental_incidents_inspection_details",
        ),
        CheckConstraint(
            """
            (
                vehicle_value_snapshot IS NULL
                AND valuation_basis IS NULL
                AND valuation_by IS NULL
                AND valuation_at IS NULL
                AND valuation_ticket_id IS NULL
            )
            OR
            (
                vehicle_value_snapshot IS NOT NULL
                AND vehicle_value_snapshot >= 0
                AND vehicle_value_snapshot <> 'NaN'::numeric
                AND valuation_basis IS NOT NULL
                AND length(btrim(valuation_basis)) > 0
                AND valuation_by IS NOT NULL
                AND valuation_at IS NOT NULL
                AND valuation_at >= created_at
                AND valuation_ticket_id IS NOT NULL
            )
            """,
            name="ck_rental_incidents_vehicle_valuation",
        ),
        ForeignKeyConstraint(
            ["repair_cost_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_rental_incidents_repair_ticket_rental",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["recovered_asset_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_rental_incidents_asset_ticket_rental",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["compensation_ticket_id", "rental_id"],
            ["support_tickets.id", "support_tickets.rental_id"],
            name="fk_rental_incidents_compensation_ticket_rental",
            ondelete="RESTRICT",
        ),

        CheckConstraint(
            """
            (
                approved_repair_cost IS NULL
                AND repair_cost_basis IS NULL
                AND repair_cost_approved_by IS NULL
                AND repair_cost_approved_at IS NULL
                AND repair_cost_ticket_id IS NULL
            )
            OR
            (
                approved_repair_cost IS NOT NULL
                AND approved_repair_cost >= 0
                AND approved_repair_cost <> 'NaN'::numeric
                AND repair_cost_basis IS NOT NULL
                AND length(btrim(repair_cost_basis)) > 0
                AND repair_cost_approved_by IS NOT NULL
                AND repair_cost_approved_at IS NOT NULL
                AND repair_cost_ticket_id IS NOT NULL
                AND recovery_condition IS NOT NULL
                AND recovery_condition = 'REPAIRABLE'
                AND inspected_at IS NOT NULL
                AND repair_cost_approved_at >= inspected_at
            )
            """,
            name="ck_rental_incidents_repair_cost",
        ),

        CheckConstraint(
            """
            (
                recovered_asset_value IS NULL
                AND recovered_asset_basis IS NULL
                AND recovered_asset_valued_by IS NULL
                AND recovered_asset_valued_at IS NULL
                AND recovered_asset_ticket_id IS NULL
            )
            OR
            (
                recovered_asset_value IS NOT NULL
                AND recovered_asset_value >= 0
                AND recovered_asset_value <> 'NaN'::numeric
                AND recovered_asset_basis IS NOT NULL
                AND length(btrim(recovered_asset_basis)) > 0
                AND recovered_asset_valued_by IS NOT NULL
                AND recovered_asset_valued_at IS NOT NULL
                AND recovered_asset_ticket_id IS NOT NULL
                AND recovery_condition IS NOT NULL
                AND recovery_condition = 'UNREPAIRABLE'
                AND inspected_at IS NOT NULL
                AND recovered_asset_valued_at >= inspected_at
            )
            """,
            name="ck_rental_incidents_recovered_asset",
        ),

        CheckConstraint(
            "agreement_status IN "
            "('PENDING', 'DISPUTED', 'AGREED', "
            "'AUTHORITY_DECISION', 'NOT_REQUIRED')",
            name="ck_rental_incidents_agreement_status",
        ),

        CheckConstraint(
            """
            compensation_proposed_amount IS NULL
            OR (
                compensation_proposed_amount >= 0
                AND compensation_proposed_amount <> 'NaN'::numeric
            )
            """,
            name="ck_rental_incidents_compensation_proposal",
        ),

        CheckConstraint(
            """
            CASE
                WHEN agreement_status IN ('PENDING', 'DISPUTED') THEN
                    compensation_assessed_amount IS NULL
                    AND compensation_basis IS NULL
                    AND compensation_approved_by IS NULL
                    AND compensation_approved_at IS NULL
                    AND compensation_ticket_id IS NULL

                ELSE
                    compensation_assessed_amount IS NOT NULL
                    AND compensation_assessed_amount >= 0
                    AND compensation_assessed_amount <> 'NaN'::numeric
                    AND compensation_basis IS NOT NULL
                    AND length(btrim(compensation_basis)) > 0
                    AND compensation_approved_by IS NOT NULL
                    AND compensation_approved_at IS NOT NULL
                    AND compensation_ticket_id IS NOT NULL
                    AND status IN ('CONFIRMED', 'CLOSED')
                    AND verified_at IS NOT NULL
                    AND compensation_approved_at >= verified_at
                    AND (
                        (
                            agreement_status = 'NOT_REQUIRED'
                            AND compensation_assessed_amount = 0
                        )
                        OR
                        (
                            agreement_status IN (
                                'AGREED', 'AUTHORITY_DECISION'
                            )
                            AND compensation_assessed_amount > 0
                        )
                    )
            END
            """,
            name="ck_rental_incidents_compensation_assessment",
        ),

        CheckConstraint(
            """
            rent_settled_at IS NULL
            OR (
                status IN ('CONFIRMED', 'CLOSED')
                AND billing_cutoff_at IS NOT NULL
                AND rent_settled_at >= billing_cutoff_at
                AND verified_at IS NOT NULL
                AND rent_settled_at >= verified_at
            )
            """,
            name="ck_rental_incidents_rent_settlement",
        ),

        CheckConstraint(
            """
            compensation_settled_at IS NULL
            OR (
                agreement_status IN (
                    'AGREED', 'AUTHORITY_DECISION', 'NOT_REQUIRED'
                )
                AND compensation_assessed_amount IS NOT NULL
                AND compensation_approved_at IS NOT NULL
                AND compensation_settled_at >= compensation_approved_at
            )
            """,
            name="ck_rental_incidents_compensation_settlement",
        ),

        CheckConstraint(
            """
            (
                status <> 'CLOSED'
                AND closed_at IS NULL
                AND closed_by IS NULL
                AND closure_note IS NULL
            )
            OR
            (
                status = 'CLOSED'
                AND closed_at IS NOT NULL
                AND closed_by IS NOT NULL
                AND closure_note IS NOT NULL
                AND length(btrim(closure_note)) > 0
                AND rent_settled_at IS NOT NULL
                AND closed_at >= rent_settled_at
                AND compensation_settled_at IS NOT NULL
                AND closed_at >= compensation_settled_at
            )
            """,
            name="ck_rental_incidents_closure",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    rental_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("rentals.id", ondelete="RESTRICT"),
        nullable=False,
    )

    assigned_to: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default=text("'OPEN'"),
    )

    verified_outcome: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    verification_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    verified_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    valid_report_ticket_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    valid_report_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    billing_cutoff_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    billing_cutoff_reason: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    recovered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    received_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    recovery_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    arrived_station_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    received_station_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("stations.id", ondelete="RESTRICT"),
        nullable=True,
    )

    station_received_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    recovery_condition: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    inspected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    inspected_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    inspection_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    inspection_ticket_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )
    vehicle_value_snapshot: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    valuation_basis: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    valuation_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )

    valuation_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    valuation_ticket_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )
    # Chi phí sửa chữa đã được duyệt
    approved_repair_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    repair_cost_basis: Mapped[str | None] = mapped_column(Text)
    repair_cost_approved_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT")
    )
    repair_cost_approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    repair_cost_ticket_id: Mapped[int | None] = mapped_column(BigInteger)

    # Giá trị tài sản thu hồi khi xe không thể sửa
    recovered_asset_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    recovered_asset_basis: Mapped[str | None] = mapped_column(Text)
    recovered_asset_valued_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT")
    )
    recovered_asset_valued_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    recovered_asset_ticket_id: Mapped[int | None] = mapped_column(BigInteger)

    # Nghĩa vụ bồi thường ban đầu
    compensation_proposed_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2)
    )
    compensation_assessed_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2)
    )
    agreement_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default=text("'PENDING'"),
    )
    compensation_basis: Mapped[str | None] = mapped_column(Text)
    compensation_approved_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT")
    )
    compensation_approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    compensation_ticket_id: Mapped[int | None] = mapped_column(BigInteger)

    # Mốc quyết toán và đóng hồ sơ
    rent_settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    compensation_settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    closed_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT")
    )
    closure_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
    )


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        UniqueConstraint(
            "id",
            "rental_id",
            name="uq_support_tickets_id_rental",
        ),
        CheckConstraint(
            "status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')",
            name="ck_support_tickets_status",
        ),
        CheckConstraint(
            """
            CASE
                WHEN report_source IS NULL THEN
                    received_at IS NULL
                    AND created_by IS NOT NULL

                WHEN report_source IN ('CUSTOMER', 'STAFF') THEN
                    received_at IS NOT NULL
                    AND created_by IS NOT NULL

                WHEN report_source = 'SYSTEM' THEN
                    received_at IS NOT NULL
                    AND created_by IS NULL

                ELSE FALSE
            END
            """,
            name="ck_support_tickets_report_origin",
        ),
        UniqueConstraint(
            "rental_id",
            "check_cycle",
            name="uq_support_tickets_rental_check_cycle",
        ),
        Index(
            "uq_support_tickets_active_rental_alert",
            "rental_id",
            unique=True,
            postgresql_where=text(
                "check_cycle IS NOT NULL "
                "AND status IN ('OPEN', 'IN_PROGRESS')"
            ),
        ),
        Index(
            "ix_support_tickets_alert_queue",
            "received_at",
            "id",
            postgresql_where=text(
                "check_cycle IS NOT NULL "
                "AND status IN ('OPEN', 'IN_PROGRESS')"
            ),
        ),
        Index(
            "ix_support_tickets_next_check",
            "next_check_at",
            "rental_id",
            postgresql_where=text(
                "check_cycle IS NOT NULL "
                "AND alert_outcome = 'CONTINUE_RENTAL' "
                "AND status IN ('RESOLVED', 'CLOSED')"
            ),
        ),
        CheckConstraint(
            """
            CASE
                WHEN check_cycle IS NULL THEN
                    alert_due_at IS NULL
                    AND next_check_at IS NULL
                    AND alert_outcome IS NULL
                    AND alert_resolved_by IS NULL
                ELSE
                    check_cycle > 0
                    AND report_source IS NOT NULL
                    AND report_source = 'SYSTEM'
                    AND created_by IS NULL
                    AND received_at IS NOT NULL
                    AND alert_due_at IS NOT NULL
                    AND received_at >= alert_due_at
            END
            """,
            name="ck_support_tickets_alert_metadata",
        ),
        CheckConstraint(
            """
            check_cycle IS NULL
            OR
            (
                (
                    status IN ('OPEN', 'IN_PROGRESS')
                    AND alert_outcome IS NULL
                    AND next_check_at IS NULL
                    AND alert_resolved_by IS NULL
                    AND resolved_at IS NULL
                    AND resolution_note IS NULL
                    AND
                    (
                        status = 'OPEN'
                        OR assigned_to IS NOT NULL
                    )
                )
                OR
                (
                    status IN ('RESOLVED', 'CLOSED')
                    AND resolved_at IS NOT NULL
                    AND resolved_at >= received_at
                    AND resolution_note IS NOT NULL
                    AND length(btrim(resolution_note)) > 0
                    AND alert_outcome IS NOT NULL
                    AND
                    (
                        (
                            alert_outcome = 'CONTINUE_RENTAL'
                            AND alert_resolved_by IS NOT NULL
                            AND assigned_to IS NOT NULL
                            AND next_check_at IS NOT NULL
                            AND next_check_at > resolved_at
                        )
                        OR
                        (
                            alert_outcome = 'ESCALATED'
                            AND alert_resolved_by IS NOT NULL
                            AND assigned_to IS NOT NULL
                            AND next_check_at IS NULL
                        )
                        OR
                        (
                            alert_outcome = 'NO_LONGER_NEEDED'
                            AND next_check_at IS NULL
                        )
                    )
                )
            )
            """,
            name="ck_support_tickets_alert_resolution",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    rental_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rentals.id"), nullable=False
    )
    created_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    assigned_to: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))

    report_source: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    check_cycle: Mapped[int | None] = mapped_column(Integer)

    alert_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    next_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    alert_outcome: Mapped[str | None] = mapped_column(String(30))

    alert_resolved_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.current_timestamp(),
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
        Index("ix_maintenance_orders_incident", "incident_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False
    )
    incident_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("rental_incidents.id", ondelete="RESTRICT")
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
    __table_args__ = (
        CheckConstraint(
            "latitude BETWEEN -90 AND 90",
            name="ck_gps_points_latitude",
        ),
        CheckConstraint(
            "longitude BETWEEN -180 AND 180",
            name="ck_gps_points_longitude",
        ),
        Index(
            "idx_gps_points_rental_recorded",
            "rental_id",
            "recorded_at",
            "id",
        ),
    )


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
            "(discount_type IS NULL AND discount_value IS NULL) OR "
            "(discount_type = 'PERCENTAGE' AND discount_value BETWEEN 1 AND 100 "
            "AND discount_value = trunc(discount_value)) OR "
            "(discount_type = 'FIXED_AMOUNT' AND discount_value > 0)",
            name="ck_rental_price_discount_snapshot",
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
    vehicle_model_snapshot: Mapped[str] = mapped_column(String(100), nullable=False)
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
    discount_type: Mapped[str | None] = mapped_column(String(20))
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
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

from uuid import UUID as UUIDValue, uuid4
from sqlalchemy import Uuid


class UserSession(Base):
    __tablename__ = "user_sessions"
    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="ck_sessions_expiry"),
        CheckConstraint("last_used_at >= created_at", name="ck_sessions_usage"),
        Index("ix_sessions_user", "user_id"),
        Index("ix_sessions_expiry", "expires_at"),
        Index("ix_sessions_revoked", "revoked_at"),
    )
    id: Mapped[UUIDValue] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(40))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip_address: Mapped[str | None] = mapped_column(String(64))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        UniqueConstraint("session_id", "generation", name="uq_refresh_generation"),
        CheckConstraint("generation >= 0", name="ck_refresh_generation"),
        CheckConstraint("char_length(token_hash) = 64", name="ck_refresh_hash"),
        CheckConstraint("expires_at > created_at", name="ck_refresh_expiry"),
        CheckConstraint("used_at IS NULL OR used_at >= created_at", name="ck_refresh_usage"),
        CheckConstraint(
            "(used_at IS NULL AND replay_until IS NULL AND replay_ciphertext IS NULL) OR "
            "(used_at IS NOT NULL AND replay_until IS NOT NULL AND replay_until >= used_at)",
            name="ck_refresh_replay",
        ),
        Index("uq_refresh_current", "session_id", unique=True,
              postgresql_where=text("used_at IS NULL")),
        Index("ix_refresh_replay_until", "replay_until"),
    )
    id: Mapped[UUIDValue] = mapped_column(Uuid, primary_key=True, default=uuid4)
    session_id: Mapped[UUIDValue] = mapped_column(
        Uuid, ForeignKey("user_sessions.id", ondelete="CASCADE"), nullable=False
    )
    generation: Mapped[int] = mapped_column(Integer, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replay_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    replay_ciphertext: Mapped[str | None] = mapped_column(Text)
