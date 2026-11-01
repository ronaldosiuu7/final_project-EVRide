from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    document_type: Mapped[str] = mapped_column(String(30), nullable=False)
    document_number: Mapped[str] = mapped_column(String(50), nullable=False)
    image_front_url: Mapped[str] = mapped_column(Text, nullable=False)
    image_back_url: Mapped[str | None] = mapped_column(Text)
    verified_status: Mapped[str] = mapped_column(String(20), nullable=False)
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
        CheckConstraint("daily_price >= 0", name="ck_vehicles_daily_price_nonnegative"),
        CheckConstraint(
            "deposit_amount >= 0", name="ck_vehicles_deposit_amount_nonnegative"
        ),
        CheckConstraint(
            "status IN ('AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', "
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
    daily_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Rental(Base):
    __tablename__ = "rentals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('RESERVED', 'IN_RENT', 'STOLEN', 'COMPLETED', "
            "'CANCELLED', 'EXPIRED')",
            name="ck_rentals_status",
        ),
        CheckConstraint(
            "total_price >= 0", name="ck_rentals_total_price_nonnegative"
        ),
        Index("idx_rentals_status_expires_at", "status", "expires_at"),
        Index("idx_rentals_customer_created_at", "customer_id", "created_at"),
        Index("idx_rentals_vehicle_id", "vehicle_id"),
        Index(
            "uq_active_vehicle_rental",
            "vehicle_id",
            unique=True,
            postgresql_where=text("status IN ('RESERVED', 'IN_RENT', 'STOLEN')"),
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
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'RESERVED'")
    )
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
    )


class Handover(Base):
    __tablename__ = "handovers"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('PICKUP', 'RETURN')", name="ck_handovers_kind"
        ),
        CheckConstraint(
            "battery_percent BETWEEN 0 AND 100",
            name="ck_handovers_battery_percent_range",
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
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
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
        CheckConstraint(
            "status IN ('PENDING', 'SUCCESS', 'FAILED')",
            name="ck_wallet_transactions_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    wallet_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("wallets.id"), nullable=False
    )
    rental_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("rentals.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    balance_before: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.current_timestamp()
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
