-- ============================================================
-- EVRide Database Schema for PostgreSQL
-- Dựa trên tài liệu thiết kế hệ thống EVRide (Cập nhật 21/10/2026)
-- ============================================================

-- Xóa các bảng cũ nếu đã tồn tại (Xóa theo thứ tự ngược phụ thuộc khóa ngoại)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS rental_pricing_snapshots CASCADE;
DROP TABLE IF EXISTS idempotency_records CASCADE;
DROP TABLE IF EXISTS gps_points CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS user_promotions CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS rental_reviews CASCADE;
DROP TABLE IF EXISTS handovers CASCADE;
DROP TABLE IF EXISTS rentals CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS stations CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS user_documents CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- 1. QUẢN LÝ NGƯỜI DÙNG & VÍ (USERS & WALLETS)
-- ============================================================

-- Bảng users: Lưu tài khoản người dùng
CREATE TABLE users (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER', 'STAFF', 'MANAGER')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'BLACKLISTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng user_documents: Lưu giấy tờ xác thực (eKYC, bằng lái)
CREATE TABLE user_documents (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('CCCD', 'PASSPORT', 'DRIVER_LICENSE')),
    document_number VARCHAR(50) NOT NULL,
    image_front_url TEXT NOT NULL,
    image_back_url TEXT,
    verified_status VARCHAR(20) NOT NULL CHECK (verified_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng wallets: Lưu thông tin ví điện tử
CREATE TABLE wallets (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'FROZEN', 'LOCKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. QUẢN LÝ TRẠM & PHƯƠNG TIỆN (STATIONS & VEHICLES)
-- ============================================================

-- Bảng stations: Thông tin trạm xe điện
CREATE TABLE stations (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name VARCHAR(120) NOT NULL,
    address TEXT NOT NULL,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    opens_at TIME,
    closes_at TIME,
    status VARCHAR(20) NOT NULL
);

-- Bảng vehicles: Danh sách phương tiện
CREATE TABLE vehicles (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    current_station_id BIGINT REFERENCES stations(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    battery_percent INT NOT NULL CHECK (battery_percent BETWEEN 0 AND 100),
    status VARCHAR(20) NOT NULL CHECK (status IN ('AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'SUSPECTED_STOLEN', 'STOLEN')),
    daily_price NUMERIC(12, 2) NOT NULL CHECK (daily_price >= 0),
    deposit_amount NUMERIC(12, 2) NOT NULL CHECK (deposit_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. QUẢN LÝ THUÊ XE & BÀN GIAO (RENTALS & HANDOVERS)
-- ============================================================

-- Bảng rentals: Thông tin lượt đặt / thuê xe
CREATE TABLE rentals (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    customer_id BIGINT NOT NULL REFERENCES users(id),
    vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
    pickup_station_id BIGINT NOT NULL REFERENCES stations(id),
    actual_return_station_id BIGINT REFERENCES stations(id),
    expires_at TIMESTAMPTZ NOT NULL,
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
    total_price NUMERIC(12, 2),
    CONSTRAINT ck_rentals_status CHECK (status IN ('RESERVED', 'IN_RENT', 'STOLEN', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_rentals_total_price_nonnegative CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục tối ưu truy vấn
CREATE INDEX idx_rentals_status_expires_at ON rentals (status, expires_at);
CREATE INDEX idx_rentals_customer_created_at ON rentals (customer_id, created_at);
CREATE INDEX idx_rentals_vehicle_id ON rentals (vehicle_id);

-- Partial Unique Index: Đảm bảo 1 xe không có 2 lượt thuê hoạt động cùng lúc
CREATE UNIQUE INDEX uq_active_vehicle_rental ON rentals (vehicle_id) 
WHERE status IN ('RESERVED', 'IN_RENT', 'STOLEN');

-- Bảng handovers: Biên bản giao / nhận xe tại trạm
CREATE TABLE handovers (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES users(id),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('PICKUP', 'RETURN')),
    time TIMESTAMPTZ NOT NULL,
    battery_percent INT NOT NULL CHECK (battery_percent BETWEEN 0 AND 100),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_handovers_rental_kind ON handovers (rental_id, kind);

-- Bảng rental_reviews: Đánh giá chất lượng sau chuyến đi
CREATE TABLE rental_reviews (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT UNIQUE NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. TÀI CHÍNH, THANH TOÁN & KHUYẾN MÃI (FINANCIALS & PROMOTIONS)
-- ============================================================

-- Bảng invoices: Hóa đơn thanh toán
CREATE TABLE invoices (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT UNIQUE NOT NULL REFERENCES rentals(id),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('UNPAID', 'PAID', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu request idempotency và response để replay sau timeout.
CREATE TABLE idempotency_records (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    http_method VARCHAR(10) NOT NULL,
    request_path VARCHAR(500) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    response_status INT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_idempotency_scope_key
        UNIQUE (actor_id, http_method, request_path, idempotency_key),
    CONSTRAINT ck_idempotency_records_state
        CHECK (state IN ('PROCESSING', 'COMPLETED')),
    CONSTRAINT ck_idempotency_records_key_length
        CHECK (char_length(idempotency_key) BETWEEN 16 AND 128),
    CONSTRAINT ck_idempotency_records_hash_length
        CHECK (char_length(request_hash) = 64),
    CONSTRAINT ck_idempotency_records_completion
        CHECK (
            (state = 'PROCESSING' AND completed_at IS NULL AND response_status IS NULL)
            OR (state = 'COMPLETED' AND completed_at IS NOT NULL AND response_status BETWEEN 100 AND 599)
        ),
    CONSTRAINT ck_idempotency_records_minimum_retention
        CHECK (expires_at >= created_at + INTERVAL '24 hours')
);

CREATE INDEX idx_idempotency_records_expiry ON idempotency_records (expires_at);

-- Bảng transactions: Lịch sử giao dịch liên quan đơn thuê
CREATE TABLE transactions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT NOT NULL REFERENCES rentals(id),
    invoice_id BIGINT REFERENCES invoices(id),
    actor_id BIGINT NOT NULL REFERENCES users(id),
    idempotency_record_id BIGINT REFERENCES idempotency_records(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('PAYMENT', 'DEPOSIT', 'REFUND', 'FEE')),
    status VARCHAR(20) NOT NULL,
    CONSTRAINT ck_transactions_status CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng wallet_transactions: Lịch sử biến động số dư ví
CREATE TABLE wallet_transactions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    rental_id BIGINT REFERENCES rentals(id),
    transaction_id BIGINT REFERENCES transactions(id) ON DELETE RESTRICT,
    idempotency_record_id BIGINT REFERENCES idempotency_records(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('TOPUP', 'WITHDRAW', 'RENTAL_PAYMENT', 'RENTAL_DEPOSIT', 'RENTAL_REFUND')),
    balance_before NUMERIC(12, 2) NOT NULL CHECK (balance_before >= 0),
    balance_after NUMERIC(12, 2) NOT NULL CHECK (balance_after >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    CONSTRAINT uq_wallet_transactions_transaction UNIQUE (transaction_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng promotions: Chương trình khuyến mãi
CREATE TABLE promotions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_percent INT CHECK (discount_percent BETWEEN 0 AND 100),
    max_discount_amount NUMERIC(12, 2) CHECK (max_discount_amount >= 0),
    min_rental_amount NUMERIC(12, 2) CHECK (min_rental_amount >= 0),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'DISABLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng user_promotions: Khuyến mãi cá nhân của người dùng
CREATE TABLE user_promotions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    promotion_id BIGINT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    CONSTRAINT uq_user_promotions_user_promotion UNIQUE (user_id, promotion_id)
);

-- Immutable-at-write-time copy of the financial terms used for each rental.
CREATE TABLE rental_pricing_snapshots (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
    vehicle_name VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    daily_price NUMERIC(12, 2) NOT NULL,
    pricing_policy_version VARCHAR(64) NOT NULL,
    pricing_policy_snapshot JSONB NOT NULL,
    deposit_amount NUMERIC(12, 2) NOT NULL,
    promotion_id BIGINT REFERENCES promotions(id) ON DELETE SET NULL,
    promotion_code VARCHAR(50),
    discount_percent INT,
    max_discount_amount NUMERIC(12, 2),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_rental_pricing_snapshots_rental UNIQUE (rental_id),
    CONSTRAINT ck_rental_price_daily_nonnegative CHECK (daily_price >= 0),
    CONSTRAINT ck_rental_price_deposit_nonnegative CHECK (deposit_amount >= 0),
    CONSTRAINT ck_rental_price_discount_percent
        CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
    CONSTRAINT ck_rental_price_max_discount_nonnegative
        CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
    CONSTRAINT ck_rental_price_discount_nonnegative CHECK (discount_amount >= 0),
    CONSTRAINT ck_rental_price_policy_version_nonempty CHECK (pricing_policy_version <> ''),
    CONSTRAINT ck_rental_price_policy_snapshot_object
        CHECK (jsonb_typeof(pricing_policy_snapshot) = 'object')
);

-- ============================================================
-- 5. HỖ TRỢ & GIÁM SÁT (SUPPORT & TRACKING)
-- ============================================================

-- Bảng support_tickets: Yêu cầu hỗ trợ & sự cố
CREATE TABLE support_tickets (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT NOT NULL REFERENCES rentals(id),
    created_by BIGINT NOT NULL REFERENCES users(id),
    assigned_to BIGINT REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bảng gps_points: Tọa độ GPS theo dõi thời gian thực
CREATE TABLE gps_points (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    rental_id BIGINT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit events are append-only by application convention; omit secrets from JSON payloads.
CREATE TABLE audit_logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    request_id VARCHAR(64),
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_actor_created ON audit_logs (actor_id, created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id);