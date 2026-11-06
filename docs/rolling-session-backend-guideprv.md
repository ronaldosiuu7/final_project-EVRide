# EVRide: hướng dẫn backend Rolling Session và Refresh Token Rotation

Ngày soạn: 06/11/2026. Đây là **hướng dẫn để tự áp dụng**, không phải thông báo mã nguồn đã được sửa hoặc nhóm đã review/phê duyệt. Không có thay đổi chính sách giá thuê, tiền cọc, quyền STAFF, giấy tờ hay thanh toán trong hướng dẫn này.

Phạm vi: backend, migration, kiểm thử PostgreSQL, contract bàn giao frontend và HTTPS trên ba VM Azure đã được người dùng xác định. Không triển khai frontend hoặc mobile. Các khối code có tên đường dẫn là nội dung để bạn tự thêm/thay thế; chúng chưa được chép vào ứng dụng.

1. Hiện trạng và thiết kế
2. Nội dung cập nhật tài liệu
3. Model và migration
4. Cấu hình, security và dependency
5. Service và endpoint
6. Contract bàn giao frontend
7. Kiểm thử
8. Azure, HTTPS, localhost, chuyển đổi và rollback

## 1. Hiện trạng và quyết định thiết kế

Backend hiện dùng Session SQLAlchemy đồng bộ, psycopg và prefix `/api/v1`. `security.py` cấp JWT HS256 30 phút với sub/role/iat/exp; `dependencies.py` kiểm tra tài khoản ACTIVE nhưng chưa có phiên. `auth.py` có register/login; `users.py` có đổi mật khẩu và cập nhật trạng thái tài khoản, chưa thu hồi JWT. `main.py` chỉ chuẩn hóa lỗi validation và đang dùng CORS `*` với credentials. Frontend mới là React/Vite với dữ liệu mock.

Tài liệu thực tế là `docs/v1-decisions.md`, `docs/api-contract.md`. Không thấy thời hạn phiên riêng theo CUSTOMER/STAFF/MANAGER trong hai tài liệu này. Chính sách dưới đây áp dụng chung ba vai trò; quyền nghiệp vụ vẫn đọc từ User hiện tại, không tin role cũ trong JWT.

Model có 24 bảng; thêm hai bảng thành **26**, không tính bảng `alembic_version`. Đây là số model, chưa xác nhận database đang chạy có đầy đủ các bảng. Head migration trong repo là `888ad91e139e`.

**Một vấn đề migration có sẵn:** `1fc518e856f5_initial_tables_migration.py` có `upgrade(): pass`. Do đó không được khẳng định `alembic upgrade head` dựng được database trống. Database mới trên VM3 cần một baseline schema đã kiểm tra, hoặc phục hồi bản backup schema/data hợp lệ rồi tiếp tục migration. Không chạy `backend/database/stored_database/database.sql` vào database có dữ liệu: script này có lệnh DROP bảng. Không tự sửa migration cũ đã dùng hoặc dùng `stamp head` để che thiếu schema.

### 1.1. Giải thích ngắn

Access token là vé dùng API trong 30 phút. Session là bản ghi quyết định vé đó còn được chấp nhận không. Refresh token là bí mật để đổi vé mới. Mỗi lần đổi thành công, bí mật cũ được đánh dấu đã dùng, bí mật mới và phiên cùng có hạn `now + 30 ngày`. Không có hạn tuyệt đối; mỗi phiên hoạt động lâu có thể tích lũy nhiều lịch sử token.

Mỗi login thành công tạo phiên mới. Mở tab/reload chỉ phục hồi phiên, không login lại. Logout thu hồi một phiên; đổi mật khẩu và chuyển trạng thái tài khoản khỏi ACTIVE thu hồi tất cả phiên của tài khoản. Mở khóa tài khoản không hồi sinh phiên đã thu hồi. Đổi role giữ phiên nhưng quyền được đọc lại từ database.

Grace mặc định 15 giây, tính từ `used_at` đầu tiên. Retry không đổi `used_at`, không gia hạn phiên và không sinh token thứ ba. Ngoài grace, token đã dùng làm thu hồi **phiên của token đó**, không khóa cả tài khoản. Một token giống nhau không cho biết chắc ai là kẻ gian; grace là đánh đổi giữa khả năng phục hồi và thời gian kẻ giữ token cũ có thể nhận lại kết quả. IP/User-Agent chỉ là metadata, không dùng làm bằng chứng xác thực.

### 1.2. Response cũ và cookie

Chỉ dùng một cookie tên cố định cộng với kiểm tra generation trong JavaScript không giải quyết được response cũ: trình duyệt xử lý Set-Cookie ngoài sự kiểm soát của mã đọc response. Abort fetch cũng không chứng minh server chưa commit.

Thiết kế hướng dẫn này dùng **cookie có tên riêng cho từng phiên và generation**:

```text
evr_rt_<session UUID bỏ dấu gạch>_<generation>
```

Giá trị cookie vẫn là refresh token ngẫu nhiên, HttpOnly. Backend chỉ chọn token có hash đúng, thuộc phiên được chọn và generation lớn nhất trong các cookie đã gửi. Cookie cũ đến muộn không ghi đè cookie mới vì tên khác nhau. Cookie cũ còn trong trình duyệt cùng token mới không bị xem là một cuộc tấn công reuse; nếu chỉ token cũ được gửi thì áp dụng grace/reuse bình thường. Điều này không phát hiện được mọi hành vi của kẻ đã có cả token mới lẫn token cũ.

Login trả `session_id` và `generation` trong JSON. Frontend được lưu **chỉ session_id và mốc trạng thái không bí mật** trong localStorage để mọi tab chọn cùng phiên; access token chỉ trong bộ nhớ, refresh token chỉ trong cookie. Refresh/logout gửi `X-Session-ID`. Mã phiên không phải credential: có mã phiên mà không có cookie token không refresh/logout được. Nếu người dùng xóa localStorage nhưng còn cookie, yêu cầu login lại; không tự chọn nhầm một tài khoản từ cookie còn sót.

Mỗi refresh thành công dọn các cookie cùng phiên có generation thấp hơn kết quả. Logout dọn tất cả cookie của phiên trong request. Response refresh đến muộn sau logout có thể đặt lại cookie cũ, nhưng session đã bị thu hồi nên cookie đó không khôi phục quyền truy cập. Login mới dùng UUID khác nên không bị cookie phiên trước ghi đè. Cookie có hạn tuyệt đối `Expires` khớp hạn token; replay không đặt lại thời gian 30 ngày từ lúc retry.

Frontend vẫn bắt buộc dùng một khóa liên tab cho login/refresh/logout/đổi mật khẩu, vì cookie có version không thay thế việc kiểm soát số request và thứ tự trạng thái UI. Các tab phải cùng frontend origin; triển khai redirect `www` sang domain chính để tránh hai vùng Web Locks/localStorage khác nhau.

### 1.3. Transaction, khóa và lưu trữ

Thứ tự khóa thao tác auth: `users theo id tăng dần → user_sessions theo id tăng dần → refresh_tokens`. Một user row lock làm login, refresh, logout, đổi mật khẩu và khóa tài khoản của người đó tuần tự. Service tự mở Session/transaction riêng; không gọi `db.begin()` trên Session mà dependency đã SELECT và autobegin.

Đối với PATCH quản trị tài khoản: advisory transaction lock riêng cho cập nhật quản trị, rồi actor/target users theo id, rồi sessions. Nhờ đó hai manager không đồng thời tự hạ quyền và bỏ qua quy tắc manager cuối cùng. Không lấy advisory lock này sau khi đã khóa user. Auth không lấy station/wallet/vehicle/rental; dependency xác thực chỉ đọc, không giữ row lock rồi đi vào luồng thuê xe. Giữ nguyên thứ tự khóa nghiệp vụ `station → customer → wallet → vehicle → rental`.

Sau khi lấy khóa phải đọc lại (`populate_existing`) và tính thời gian thực tế sau khi chờ khóa. Không dùng thời gian bắt đầu transaction để quyết định grace sau khi đã chờ lâu. PostgreSQL giữ khóa tới hết transaction; SQLAlchemy có identity map nên không được coi đối tượng đã load trước đó là dữ liệu mới. Tham khảo [PostgreSQL 16](https://www.postgresql.org/docs/16/explicit-locking.html), [SQLAlchemy populate_existing](https://docs.sqlalchemy.org/en/20/orm/queryguide/api.html#populate-existing).

Kết quả replay mã hóa bằng Fernet, nằm trong cùng row token cũ và cùng transaction với rotation. Khóa ở biến môi trường/secret trên VM2, không ở database. SHA-256 dùng cho token ngẫu nhiên 256 bit, không thay cho thuật toán hash password. Hash giảm rủi ro lộ database nhưng không bảo vệ khi cả application secret hoặc runtime đã bị chiếm; bản backup có ciphertext vẫn cần bảo vệ.

## 2. Cập nhật tài liệu trước khi áp dụng code

Trong `docs/v1-decisions.md`, thay dòng thời hạn access token tại bảng mục 1; thêm mục kỹ thuật xác thực mới, không thay nhãn phê duyệt của các quyết định nghiệp vụ:

> Thiết kế xác thực theo yêu cầu ngày 06/11/2026; chưa xác nhận nhóm đã review hoặc triển khai. Access JWT sống 1.800 giây, bắt buộc sub/sid. Refresh token ngẫu nhiên sống 30 ngày, rolling cùng phiên sau mỗi rotation thành công; không có absolute lifetime. Mỗi login tạo phiên riêng, các tab chia sẻ phiên. Grace 15 giây cấu hình được, replay kết quả mã hóa nếu token kế tiếp còn hiện hành; ngoài grace thu hồi phiên bị reuse. Logout thu hồi phiên hiện tại, đổi mật khẩu/khóa tài khoản thu hồi mọi phiên nguyên tử. Tài khoản phải ACTIVE trên mỗi request. Không hủy được request đã qua xác thực trước lúc thu hồi commit. Giữ lịch sử hash toàn bộ vòng đời phiên. Frontend có trách nhiệm phối hợp liên tab và không lưu access token bền vững.

Trong `docs/api-contract.md`:

- Thay đoạn mục 2.4 nói chưa có refresh/logout bằng chính sách trên và bảng endpoint ở mục 6 của hướng dẫn.
- Thay đoạn sau bảng mục 4 nói JWT cũ không được thu hồi khi đổi mật khẩu.
- Thêm mã lỗi ở mục 6 hướng dẫn, cookie/CSRF/CORS, thông tin session_id UUID (ngoại lệ rõ ràng với quy ước ID bigint dạng chuỗi), generation là integer.
- Thêm `user_sessions`, `refresh_tokens` vào yêu cầu lưu trữ. Chỉnh cách diễn đạt “thiết kế 15 bảng” để phân biệt 15 bảng nghiệp vụ gốc, 24 model hiện tại và 26 sau thay đổi.
- Grace replay nằm trong refresh_tokens có TTL ngắn; **không** lưu raw token vào `idempotency_records`, audit hay response log.

Trong `docs/database.md`, thêm định nghĩa hai bảng đúng mục 3 dưới đây và quan hệ:

```mermaid
erDiagram
    users ||--o{ user_sessions : owns
    user_sessions ||--o{ refresh_tokens : contains
```

`UNIQUE(session_id,generation)` nhận diện token kế tiếp bằng generation+1, nên không cần self-FK replacement_id. Khi xuất lại `docs/ER_diagram.pdf`, lấy từ nguồn thiết kế được nhóm duy trì; repo chưa có file `.dbml` riêng để tôi xác nhận nguồn xuất PDF. Không ghi rằng PDF đã cập nhật chỉ vì đã sửa Markdown.

`docs/architecture.md`: thêm auth service, transaction ownership, lock order nói trên. `docs/ke_hoach_kiem_thu.md`: thêm test mục 7. `docs/ke_hoach_ha_tang.md`: giữ demo VirtualBox thành mục riêng, thêm production Azure/PostgreSQL 16 theo mục 8 (không biến IP demo thành IP production). `README.md`, `backend/README.md`, `deploy/README.md`: thêm biến môi trường, migration/cutover, cleanup, TLS renewal. `frontend/README.md`: bàn giao yêu cầu mục 6, không ghi rằng frontend đã làm xong.

Không tự bật thanh toán thật hay sửa chính sách STAFF khi đưa website ra Internet; đó là thay đổi nghiệp vụ khác cần nhóm xử lý riêng.

## 3. Model và migration

### 3.1. Thêm vào cuối `backend/app/models.py`

Giữ các model hiện có. Thêm hai import này và hai class sau. UUID ở Python cần alias để không trùng kiểu SQLAlchemy; UUID trên wire là chuỗi.

```python
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
```

`last_used_at` nghĩa là lần login/refresh thành công gần nhất, không cập nhật ở mọi API request. Partial unique chỉ dựa trạng thái `used_at`, không đưa NOW() vào index. Khi rotation, flush token cũ đã dùng trước khi insert token hiện hành mới.

### 3.2. Migration mới

Từ `backend/`, sau khi sửa model và cấu hình DB phát triển:

```powershell
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic heads
.\.venv\Scripts\python.exe -m alembic revision --autogenerate -m "add rolling auth sessions"
```

Giữ `revision` do Alembic tạo và `down_revision` thực tế. Với repo đã đọc, down_revision phải là `888ad91e139e`; kiểm tra lại nếu nhóm thêm migration trước bạn. Nội dung upgrade/downgrade cần tương đương dưới đây; không nhập model ứng dụng vào migration để tránh migration thay đổi theo code tương lai.

```python
import sqlalchemy as sa
from alembic import op


def upgrade():
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoke_reason", sa.String(40)),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("ip_address", sa.String(64)),
        sa.CheckConstraint("expires_at > created_at", name="ck_sessions_expiry"),
        sa.CheckConstraint("last_used_at >= created_at", name="ck_sessions_usage"),
    )
    for suffix, column in [("user", "user_id"), ("expiry", "expires_at"), ("revoked", "revoked_at")]:
        op.create_index("ix_sessions_" + suffix, "user_sessions", [column])
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.Uuid(), sa.ForeignKey("user_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("replay_until", sa.DateTime(timezone=True)),
        sa.Column("replay_ciphertext", sa.Text()),
        sa.UniqueConstraint("session_id", "generation", name="uq_refresh_generation"),
        sa.CheckConstraint("generation >= 0", name="ck_refresh_generation"),
        sa.CheckConstraint("char_length(token_hash) = 64", name="ck_refresh_hash"),
        sa.CheckConstraint("expires_at > created_at", name="ck_refresh_expiry"),
        sa.CheckConstraint("used_at IS NULL OR used_at >= created_at", name="ck_refresh_usage"),
        sa.CheckConstraint(
            "(used_at IS NULL AND replay_until IS NULL AND replay_ciphertext IS NULL) OR "
            "(used_at IS NOT NULL AND replay_until IS NOT NULL AND replay_until >= used_at)", name="ck_refresh_replay"
        ),
    )
    op.create_index("uq_refresh_current", "refresh_tokens", ["session_id"],
                    unique=True, postgresql_where=sa.text("used_at IS NULL"))
    op.create_index("ix_refresh_replay_until", "refresh_tokens", ["replay_until"])


def downgrade():
    raise RuntimeError(
        "Auth downgrade would erase session/reuse history. Roll back app with "
        "the new tables retained; use a separately reviewed data migration if needed."
    )
```

Kiểm tra autogenerate: chỉ hai bảng/index/constraint mới, UUID và timestamptz, FK đúng BIGINT users.id, index partial đúng; không DROP bảng nghiệp vụ hoặc đổi giá/default ngoài phạm vi. Review diff rồi chạy trên bản sao DB trước:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic check
```

Nếu `alembic check` phát hiện drift khác, điều tra riêng, không xóa hay đồng bộ mù theo model. SQL review riêng migration mới dùng `alembic upgrade 888ad91e139e:<revision_moi> --sql`; thay `<revision_moi>` bằng ID thật. Không có backfill phiên từ JWT cũ.

## 4. Cấu hình, security, dependency

### 4.1. Dependencies và môi trường

Thêm `cryptography` vào `backend/requirements.txt`. Thêm `pytest` và `httpx` vào `backend/requirements-dev.txt` mới, cùng dòng `-r requirements.txt`. Cài trong virtualenv, chạy test rồi khóa các phiên bản đã kiểm chứng cho bản deploy; không coi range hiện có là lockfile.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
.\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Hai lệnh cuối sinh hai secret **khác nhau**: JWT và khóa replay. Lưu vào `.env` không commit hoặc secret store. Không gửi output cho người khác hay ghi vào README. Mọi worker VM2 phải cùng JWT key và replay key. Khi thay replay key, giữ key cũ trong danh sách giải mã ít nhất hết grace + request đang xử lý; khóa mới đặt đầu danh sách.

Thêm vào `.env.example` các giá trị mẫu sau (JWT và replay để trống có chủ ý; app không khởi động tới khi bạn sinh khóa):

```dotenv
APP_ENV=development
JWT_SECRET_KEY=
JWT_ISSUER=evride-api
JWT_AUDIENCE=evride-web
REFRESH_REPLAY_KEYS=
REFRESH_GRACE_SECONDS=15
AUTH_ORIGINS=http://localhost:5173
AUTH_COOKIE_SECURE=false
```

Production VM2:

```dotenv
APP_ENV=production
JWT_ISSUER=evride-api
JWT_AUDIENCE=evride-web
REFRESH_GRACE_SECONDS=15
AUTH_ORIGINS=https://thuexedien.me
AUTH_COOKIE_SECURE=true
```

JWT_SECRET_KEY/REFRESH_REPLAY_KEYS và DB_* nạp riêng. `DB_HOST` là private IP thật của VM3, không phải localhost hay IP VirtualBox. Development dùng `http://localhost:5173` và `http://localhost:8000`; không trộn localhost với 127.0.0.1 trong URL trình duyệt. Nếu cần origin khác, khai báo chính xác; không `*`, không wildcard subdomain.

### 4.2. Tạo `backend/app/core/auth_config.py`

```python
import os
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, MultiFernet
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

APP_ENV = os.getenv("APP_ENV", "development")
if APP_ENV not in {"development", "test", "production"}:
    raise RuntimeError("APP_ENV không hợp lệ")
JWT_SECRET = os.environ.get("JWT_SECRET_KEY", "")
if len(JWT_SECRET.encode()) < 32 or JWT_SECRET in {
    "your-super-secret-key-change-in-production", "dev-secret-change-me"
}:
    raise RuntimeError("Phải cấu hình JWT_SECRET_KEY ngẫu nhiên riêng")
JWT_ISSUER = os.getenv("JWT_ISSUER", "evride-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "evride-web")
ACCESS_SECONDS = 1800
REFRESH_DAYS = 30
GRACE_SECONDS = int(os.getenv("REFRESH_GRACE_SECONDS", "15"))
if not 1 <= GRACE_SECONDS <= 60:
    raise RuntimeError("Grace phải trong 1..60 giây")
keys = [k.strip() for k in os.getenv("REFRESH_REPLAY_KEYS", "").split(",") if k.strip()]
if not keys:
    raise RuntimeError("Thiếu REFRESH_REPLAY_KEYS")
REPLAY_CIPHER = MultiFernet([Fernet(k.encode()) for k in keys])
ORIGINS = tuple(o.strip() for o in os.getenv("AUTH_ORIGINS", "").split(",") if o.strip())
if not ORIGINS:
    raise RuntimeError("Thiếu AUTH_ORIGINS")
for origin in ORIGINS:
    p = urlsplit(origin)
    if p.scheme not in {"http", "https"} or not p.hostname or p.username or p.password:
        raise RuntimeError("Origin không hợp lệ")
    if p.path or p.query or p.fragment or "*" in origin:
        raise RuntimeError("Origin phải chính xác, không path/wildcard")
    if APP_ENV == "production" and p.scheme != "https":
        raise RuntimeError("Production cần HTTPS origin")
secure = os.getenv("AUTH_COOKIE_SECURE", "true").lower()
if secure not in {"true", "false"}:
    raise RuntimeError("AUTH_COOKIE_SECURE phải true hoặc false")
COOKIE_SECURE = secure == "true"
if APP_ENV == "production" and not COOKIE_SECURE:
    raise RuntimeError("Production bắt buộc cookie Secure")
COOKIE_PATH = "/api/v1/auth"
COOKIE_SAMESITE = "lax"
```

Production frontend và API khác **origin** nhưng cùng **site** (HTTPS + thuexedien.me); dùng SameSite=Lax, cookie host-only api.thuexedien.me, bỏ Domain. Không đặt `.thuexedien.me` vì frontend không cần đọc refresh cookie. Localhost HTTP tắt Secure chỉ trong cấu hình development; môi trường HTTPS thật bật Secure. [MDN về cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

### 4.3. `backend/app/core/security.py`

Giữ nguyên `hash_password`/`verify_password` hiện tại và import bcrypt. Thay phần cấu hình JWT và hai hàm create/decode bằng đoạn dưới. Chữ ký hàm create thay đổi; auth router cũ phải được thay ở mục 5.

```python
from datetime import datetime, timezone
from uuid import UUID, uuid4

import jwt
from app.core.auth_config import ACCESS_SECONDS, JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE


def create_access_token(user_id: int, session_id: UUID, now: datetime) -> tuple[str, int]:
    issued = int(now.timestamp())
    payload = {
        "sub": str(user_id), "sid": str(session_id), "iat": issued,
        "exp": issued + ACCESS_SECONDS, "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE, "typ": "access", "jti": str(uuid4()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256"), ACCESS_SECONDS


def decode_access_token(token: str) -> dict:
    # Xác minh cấu trúc trước khi phân loại hết hạn; không biến JWT thiếu sid thành TOKEN_EXPIRED.
    payload = jwt.decode(
        token, JWT_SECRET, algorithms=["HS256"], issuer=JWT_ISSUER,
        audience=JWT_AUDIENCE,
        options={"require": ["sub", "sid", "iat", "exp", "iss", "aud", "typ", "jti"],
                 "verify_exp": False},
    )
    try:
        uid = payload["sub"]
        if not isinstance(uid, str) or not uid.isascii() or not uid.isdigit():
            raise ValueError()
        if not 0 < int(uid) <= 9223372036854775807:
            raise ValueError()
        if not isinstance(payload["sid"], str) or not isinstance(payload["jti"], str):
            raise ValueError()
        UUID(payload["sid"])
        UUID(payload["jti"])
        if payload["typ"] != "access":
            raise ValueError()
        if type(payload["iat"]) is not int or type(payload["exp"]) is not int:
            raise ValueError()
        if payload["exp"] - payload["iat"] != ACCESS_SECONDS:
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise jwt.InvalidTokenError("Invalid claims") from exc
    # Chỉ đánh dấu expired sau xác minh chữ ký, issuer, audience và cấu trúc.
    payload["expired"] = payload["exp"] <= datetime.now(timezone.utc).timestamp()
    return payload
```

`verify_exp=False` ở bước giải mã không có nghĩa chấp nhận token hết hạn: dependency sau đây bắt buộc từ chối `expired`. Giữ decode helper chỉ dùng trong dependency này. Danh sách algorithm cố định, không đọc algorithm được phép từ token. [PyJWT API](https://pyjwt.readthedocs.io/en/stable/api.html).

Lưu ý lỗi password có sẵn ngoài phạm vi session: schema đang cho 12–128 ký tự nhưng bcrypt có giới hạn 72 byte; cần xử lý riêng bằng kế hoạch đổi password hasher có tương thích hash cũ. Không âm thầm cắt mật khẩu hay đổi chính sách ở đây. Các test dưới đây dùng mật khẩu ASCII dưới giới hạn; không tuyên bố đã kiểm chứng mọi password hiện có.

### 4.4. Thay `backend/app/core/dependencies.py`

```python
from datetime import datetime, timezone
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models import User, UserSession

bearer_scheme = HTTPBearer(auto_error=False)


def problem(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message},
                         headers={"WWW-Authenticate": "Bearer"} if status == 401 else None)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise problem(401, "UNAUTHENTICATED", "Thiếu access token.")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise problem(401, "UNAUTHENTICATED", "Access token không hợp lệ.")
    row = db.execute(
        select(User, UserSession)
        .join(UserSession, UserSession.user_id == User.id)
        .where(User.id == int(payload["sub"]), UserSession.id == UUID(payload["sid"]))
        .execution_options(populate_existing=True)
    ).first()
    if row is None:
        raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
    user, session = row
    if user.status != "ACTIVE":
        raise problem(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động.")
    if session.revoked_at is not None:
        raise problem(401, "SESSION_REVOKED", "Phiên đã thu hồi.")
    if session.expires_at <= datetime.now(timezone.utc):
        raise problem(401, "SESSION_EXPIRED", "Phiên đã hết hạn.")
    if payload["expired"]:
        raise problem(401, "TOKEN_EXPIRED", "Access token đã hết hạn.")
    request.state.auth_sid = session.id
    return user


def require_role(*allowed_roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise problem(403, "FORBIDDEN", "Không đủ quyền.")
        return current_user
    return checker
```

Kiểm tra trạng thái phiên trước lỗi hết hạn access để frontend không tự refresh một phiên đã thu hồi. Với PostgreSQL READ COMMITTED, request xác thực bắt đầu sau commit thu hồi thấy trạng thái mới. Request đã vượt qua kiểm tra trước commit có thể tiếp tục; không tuyên bố hủy được nó.

### 4.5. Tạo `backend/app/core/auth_http.py`

CSRF cho luồng JSON web dùng **Origin allowlist kiểm tra trên server + header tùy biến bắt buộc + chỉ JSON**. Đây là kiểm tra độc lập với CORS; request form từ site khác không vượt qua được. SameSite=Lax chỉ là lớp bổ sung. Không cần cookie CSRF đọc từ frontend khác subdomain. XSS ở frontend được tin cậy vẫn có thể gọi API; cơ chế này không giải quyết XSS.

```python
import re
from datetime import datetime
from uuid import UUID

from fastapi import Request, Response

from app.core.auth_config import COOKIE_PATH, COOKIE_SECURE, COOKIE_SAMESITE, ORIGINS
from app.core.dependencies import problem


def require_web_request(request: Request):
    if request.headers.get("origin") not in ORIGINS:
        raise problem(403, "CSRF_REJECTED", "Origin không được phép.")
    if request.headers.get("x-evride-csrf") != "1":
        raise problem(403, "CSRF_REJECTED", "Thiếu header chống CSRF.")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise problem(415, "UNSUPPORTED_MEDIA_TYPE", "Cần application/json.")


def session_header(request: Request) -> UUID:
    try:
        return UUID(request.headers["x-session-id"])
    except (KeyError, ValueError, AttributeError):
        raise problem(400, "SESSION_SELECTION_REQUIRED", "Cần X-Session-ID hợp lệ.")


def cookie_name(sid: UUID, generation: int) -> str:
    return f"evr_rt_{sid.hex}_{generation}"


def cookie_candidates(request: Request, sid: UUID) -> list[tuple[int, str]]:
    pattern = re.compile(rf"^evr_rt_{sid.hex}_(0|[1-9][0-9]{{0,9}})$")
    result = []
    for name, value in request.cookies.items():
        match = pattern.fullmatch(name)
        if match and re.fullmatch(r"[A-Za-z0-9_-]{43}", value):
            result.append((int(match[1]), value))
    if len(result) > 32:
        raise problem(400, "TOO_MANY_AUTH_COOKIES", "Cần xóa cookie cũ và đăng nhập lại.")
    return result


def no_store(response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def clear_cookie(response: Response, name: str):
    response.delete_cookie(name, path=COOKIE_PATH, domain=None,
                           secure=COOKIE_SECURE, httponly=True, samesite=COOKIE_SAMESITE)


def clear_session_cookies(request: Request, response: Response, sid: UUID):
    prefix = f"evr_rt_{sid.hex}_"
    for name in request.cookies:
        if name.startswith(prefix):
            clear_cookie(response, name)
    no_store(response)


def set_grant_cookie(request: Request, response: Response, grant: dict):
    sid = UUID(grant["data"]["session_id"])
    generation = grant["data"]["generation"]
    prefix = f"evr_rt_{sid.hex}_"
    for name in request.cookies:
        if name.startswith(prefix):
            suffix = name[len(prefix):]
            if suffix.isascii() and suffix.isdigit() and len(suffix) <= 10 and int(suffix) < generation:
                clear_cookie(response, name)
    response.set_cookie(
        cookie_name(sid, generation), grant["refresh_token"],
        expires=datetime.fromisoformat(grant["refresh_expires_at"]),
        path=COOKIE_PATH, domain=None, secure=COOKIE_SECURE,
        httponly=True, samesite=COOKIE_SAMESITE,
    )
    no_store(response)
```

Header `X-EVRide-CSRF: 1` không phải secret; tác dụng là không thể được HTML form đặt và phải qua preflight khi cross-origin. Origin bị thiếu/`null` đều từ chối. curl/Postman/test phải gửi Origin hợp lệ; Origin tự khai bằng curl không bảo vệ trước kẻ đã có refresh token, và CSRF vốn không giải quyết mất credential.

## 5. Service và endpoint

### 5.1. Tạo `backend/app/core/auth_sessions.py`

Service là nơi duy nhất thay đổi phiên. Helper `transaction()` commit trước rồi mới ném lỗi nếu operation trả về HTTPException. Nhánh reuse **trả về** lỗi để commit revocation; các nhánh lỗi không ghi dữ liệu có thể `raise` để rollback.

```python
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from cryptography.fernet import InvalidToken
from fastapi import HTTPException
from sqlalchemy import func, select, text

from app.core.auth_config import REFRESH_DAYS, GRACE_SECONDS, REPLAY_CIPHER
from app.core.dependencies import problem
from app.core.security import create_access_token, hash_password, verify_password
from app.database import SessionLocal
from app.models import User, UserSession, RefreshToken
from app.schemas.user import UserOut


def now():
    return datetime.now(timezone.utc)


def digest(raw: str) -> str:
    return hashlib.sha256(raw.encode("ascii")).hexdigest()


def password_matches(plain, hashed):
    try:
        return verify_password(plain, hashed)
    except (ValueError, TypeError):
        return False


def transaction(operation):
    with SessionLocal.begin() as db:
        result = operation(db)
    # __exit__ ở trên đã commit; không đặt raise reuse bên trong with.
    if isinstance(result, HTTPException):
        raise result
    return result


def lock_users(db, ids):
    rows = db.scalars(
        select(User).where(User.id.in_(sorted(set(ids))))
        .order_by(User.id).with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    return {u.id: u for u in rows}


def lock_sessions(db, user_ids):
    return db.scalars(
        select(UserSession).where(UserSession.user_id.in_(user_ids))
        .order_by(UserSession.id).with_for_update()
        .execution_options(populate_existing=True)
    ).all()


def require_live(user, session, at):
    if user is None or session is None or session.user_id != user.id:
        raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
    if user.status != "ACTIVE":
        raise problem(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động.")
    if session.revoked_at is not None:
        raise problem(401, "SESSION_REVOKED", "Phiên đã thu hồi.")
    if session.expires_at <= at:
        raise problem(401, "SESSION_EXPIRED", "Phiên đã hết hạn.")


def revoke(session, at, reason):
    if session.revoked_at is None:
        session.revoked_at = at
        session.revoke_reason = reason


def grant_for(user, session, generation, raw, at):
    access, seconds = create_access_token(user.id, session.id, at)
    return {
        "data": {
            "access_token": access, "token_type": "bearer", "expires_in": seconds,
            "access_expires_at": datetime.fromtimestamp(int(at.timestamp()) + seconds, timezone.utc).isoformat(),
            "session_id": str(session.id), "generation": generation,
            "session_expires_at": session.expires_at.isoformat(),
            "user": UserOut.from_model(user).model_dump(mode="json"),
        },
        # Chỉ dùng nội bộ để Set-Cookie/mã hóa; router không trả hai field này trong JSON.
        "refresh_token": raw, "refresh_expires_at": session.expires_at.isoformat(),
    }


def login_session(email, password, user_agent=None, ip_address=None):
    def operation(db):
        user = db.scalar(
            select(User).where(User.email == email.strip().lower()).with_for_update()
            .execution_options(populate_existing=True)
        )
        if user is None or not password_matches(password, user.password):
            raise problem(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.")
        if user.status != "ACTIVE":
            raise problem(403, "ACCOUNT_DISABLED", "Tài khoản không hoạt động.")
        at = now()
        session = UserSession(
            id=uuid4(), user_id=user.id, created_at=at, last_used_at=at,
            expires_at=at + timedelta(days=REFRESH_DAYS),
            user_agent=(user_agent or "")[:512], ip_address=(ip_address or "")[:64],
        )
        db.add(session)
        db.flush()
        raw = secrets.token_urlsafe(32)
        db.add(RefreshToken(
            session_id=session.id, generation=0, token_hash=digest(raw),
            created_at=at, expires_at=session.expires_at,
        ))
        return grant_for(user, session, 0, raw, at)
    return transaction(operation)


def locate(db, sid):
    # Chỉ đọc ID để biết phải khóa user nào; không dùng snapshot này để quyết định quyền.
    uid = db.scalar(select(UserSession.user_id).where(UserSession.id == sid))
    if uid is None:
        raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
    user = lock_users(db, [uid]).get(uid)
    session = db.scalar(
        select(UserSession).where(UserSession.id == sid).with_for_update()
        .execution_options(populate_existing=True)
    )
    return user, session


def matching_token(db, sid, candidates):
    if not candidates:
        raise problem(401, "REFRESH_INVALID", "Thiếu refresh cookie hợp lệ.")
    offered = {(generation, digest(raw)) for generation, raw in candidates}
    rows = db.scalars(
        select(RefreshToken)
        .where(RefreshToken.session_id == sid,
               RefreshToken.token_hash.in_([h for _, h in offered]))
        .order_by(RefreshToken.generation).with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    valid = [t for t in rows if (t.generation, t.token_hash) in offered]
    if not valid:
        raise problem(401, "REFRESH_INVALID", "Refresh token không hợp lệ.")
    return valid[-1]


def refresh_session(sid, candidates):
    def operation(db):
        user, session = locate(db, sid)
        require_live(user, session, now())
        old = matching_token(db, sid, candidates)
        at = now()  # sau khi đã lấy mọi khóa cần thiết
        require_live(user, session, at)
        if old.used_at is not None:
            if at >= old.replay_until:
                revoke(session, at, "REFRESH_REUSE")
                return problem(401, "REFRESH_REUSED", "Phát hiện reuse; phiên đã thu hồi.")
            successor = db.scalar(
                select(RefreshToken)
                .where(RefreshToken.session_id == sid,
                       RefreshToken.generation == old.generation + 1)
                .with_for_update().execution_options(populate_existing=True)
            )
            if (successor is None or successor.used_at is not None or
                    successor.expires_at <= at or not old.replay_ciphertext):
                return problem(409, "REFRESH_RETRY_UNAVAILABLE", "Không thể replay kết quả cũ.")
            try:
                grant = json.loads(REPLAY_CIPHER.decrypt(old.replay_ciphertext.encode()))
                if (grant["data"]["session_id"] != str(sid) or
                        grant["data"]["generation"] != successor.generation or
                        digest(grant["refresh_token"]) != successor.token_hash):
                    raise ValueError("Replay mismatch")
            except (InvalidToken, ValueError, TypeError, KeyError, UnicodeError):
                return problem(409, "REFRESH_RETRY_UNAVAILABLE", "Kết quả replay không còn khả dụng.")
            return grant  # không đổi used_at, hạn session/token, generation hoặc ciphertext
        if old.expires_at <= at:
            raise problem(401, "REFRESH_EXPIRED", "Refresh token đã hết hạn.")
        raw = secrets.token_urlsafe(32)
        session.last_used_at = at
        session.expires_at = at + timedelta(days=REFRESH_DAYS)
        old.used_at = at
        old.replay_until = at + timedelta(seconds=GRACE_SECONDS)
        # Giải phóng partial unique trước insert token mới.
        db.flush()
        db.add(RefreshToken(
            session_id=sid, generation=old.generation + 1, token_hash=digest(raw),
            created_at=at, expires_at=session.expires_at,
        ))
        grant = grant_for(user, session, old.generation + 1, raw, at)
        old.replay_ciphertext = REPLAY_CIPHER.encrypt(
            json.dumps(grant, separators=(",", ":")).encode()
        ).decode()
        return grant
    return transaction(operation)


def logout_session(sid, candidates):
    def operation(db):
        user, session = locate(db, sid)
        if session is None or user is None:
            raise problem(401, "SESSION_INVALID", "Phiên không hợp lệ.")
        # Token có hash khớp là bằng chứng sở hữu phiên cho thao tác chỉ thu hồi.
        # Cho phép token đã dùng/hết hạn để logout sau lỗi refresh; không rotation/replay.
        matching_token(db, sid, candidates)
        revoke(session, now(), "LOGOUT")
        return {"logged_out": True}
    return transaction(operation)


def change_session_password(uid, sid, current_password, new_password):
    def operation(db):
        user = lock_users(db, [uid]).get(uid)
        sessions = lock_sessions(db, [uid])
        current = next((s for s in sessions if s.id == sid), None)
        require_live(user, current, now())
        if not password_matches(current_password, user.password):
            raise problem(401, "INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng.")
        user.password = hash_password(new_password)
        at = now()
        for session in sessions:
            revoke(session, at, "PASSWORD_CHANGED")
        return {"changed": True, "reauthenticate": True}
    return transaction(operation)


def update_account(actor_id, actor_sid, target_id, body):
    def operation(db):
        # Một khóa riêng để serialize cập nhật role/status và bảo vệ manager cuối cùng.
        db.execute(text("SELECT pg_advisory_xact_lock(67401, 1)"))
        users = lock_users(db, [actor_id, target_id])
        actor, target = users.get(actor_id), users.get(target_id)
        sessions = lock_sessions(db, sorted(users))
        actor_session = next((s for s in sessions if s.id == actor_sid), None)
        require_live(actor, actor_session, now())
        if actor.role != "MANAGER":
            raise problem(403, "FORBIDDEN", "Không đủ quyền.")
        if target is None:
            raise problem(404, "NOT_FOUND", "Không tìm thấy người dùng.")
        if target.role == "CUSTOMER" and body.role and body.role != "CUSTOMER":
            raise problem(409, "INVALID_STATE_TRANSITION", "Không thể đổi CUSTOMER thành nhân viên.")
        demoting = body.role is not None and body.role != "MANAGER"
        disabling = body.status is not None and body.status != "ACTIVE"
        if target.role == "MANAGER" and (demoting or disabling):
            count = db.scalar(select(func.count()).select_from(User).where(
                User.role == "MANAGER", User.status == "ACTIVE"
            ))
            if count <= 1:
                raise problem(409, "INVALID_STATE_TRANSITION", "Không thể khóa/hạ quyền MANAGER cuối cùng.")
        if body.name is not None:
            target.name = body.name
        if body.role is not None:
            target.role = body.role
        if body.status is not None:
            target.status = body.status
            if body.status != "ACTIVE":
                at = now()
                for session in sessions:
                    if session.user_id == target_id:
                        revoke(session, at, "ACCOUNT_DISABLED")
        return UserOut.from_model(target).model_dump(mode="json")
    return transaction(operation)
```

Không tự retry transaction login vì mỗi lần thành công tạo phiên riêng. Refresh retry HTTP đi qua cơ chế grace, không bọc một vòng retry vô hạn khi có lỗi database. Nếu commit thất bại, không trả token hoặc Set-Cookie. Giữ isolation mặc định PostgreSQL READ COMMITTED; nếu đổi isolation cần test lại serialization failure/retry.

### 5.2. `backend/app/api/v1/auth.py`

Giữ nguyên register và các import mà register dùng. Bỏ import `create_access_token` tại đây; thêm import dưới và **thay toàn bộ hàm login cùng decorator cũ**, rồi thêm refresh/logout. Không thêm router mới, `api/v1/router.py` đã include auth_router.

```python
from fastapi import Request, Response
from pydantic import BaseModel, ConfigDict

from app.core.auth_http import (
    require_web_request, session_header, cookie_candidates,
    set_grant_cookie, clear_session_cookies,
)
from app.core.auth_sessions import login_session, refresh_session, logout_session


class EmptyAuthBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


@router.post("/auth/login", dependencies=[Depends(require_web_request)])
def login(body: LoginRequest, request: Request, response: Response):
    grant = login_session(
        str(body.email), body.password, request.headers.get("user-agent"),
        request.client.host if request.client else None,
    )
    set_grant_cookie(request, response, grant)
    return make_response(grant["data"])


@router.post("/auth/refresh", dependencies=[Depends(require_web_request)])
def refresh(body: EmptyAuthBody, request: Request, response: Response):
    sid = session_header(request)
    grant = refresh_session(sid, cookie_candidates(request, sid))
    set_grant_cookie(request, response, grant)
    return make_response(grant["data"])


@router.post("/auth/logout", dependencies=[Depends(require_web_request)])
def logout(body: EmptyAuthBody, request: Request, response: Response):
    sid = session_header(request)
    result = logout_session(sid, cookie_candidates(request, sid))
    clear_session_cookies(request, response, sid)
    return make_response(result)
```

Trong `backend/app/schemas/auth.py`, thêm import `ConfigDict`, rồi thêm `model_config = ConfigDict(extra="forbid")` vào `LoginRequest` và `ChangePasswordRequest`. Giữ field email/password/current_password/new_password hiện có. Body refresh/logout bắt buộc `{}`, trường lạ bị từ chối 422; không nhận refresh token trong JSON.

### 5.3. `backend/app/api/v1/users.py`

Giữ những endpoint không liên quan. Thêm `Request, Response` vào import FastAPI; thêm các import sau, thay hai hàm cùng decorator cũ:

```python
from app.core.auth_http import require_web_request, clear_session_cookies
from app.core.auth_sessions import change_session_password, update_account


@router.post("/users/me/change-password", dependencies=[Depends(require_web_request)])
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    sid = request.state.auth_sid
    result = change_session_password(
        current_user.id, sid, body.current_password, body.new_password
    )
    # Cookie Path=/api/v1/auth không gửi tới /users/me/change-password.
    # Tất cả phiên đã revoke trong DB; frontend gọi logout sau đó để dọn cookie hiện tại.
    clear_session_cookies(request, response, sid)
    return make_response(result)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    request: Request,
    current_user: User = Depends(require_role("MANAGER")),
):
    data = update_account(current_user.id, request.state.auth_sid, user_id, body)
    return make_response(data)
```

`clear_session_cookies` ở change-password không có cookie auth để liệt kê do Path; không được nói cookie đã được xóa ngay ở response này. Frontend giữ session_id tạm, gọi `/auth/logout` (không cần access) để nhận các Set-Cookie xóa, rồi xóa session_id. Nếu request dọn thất bại, session vẫn đã bị thu hồi, cookie không còn quyền. Khi logout lại sau khi cookie đã xóa, server có thể trả REFRESH_INVALID; client vẫn giữ trạng thái đã logout, không refresh.

### 5.4. `backend/app/main.py`

Thay cấu hình CORS hiện tại bằng:

```python
from app.core.auth_config import ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-EVRide-CSRF", "X-Session-ID", "Idempotency-Key"],
    expose_headers=["Retry-After"],
)
```

Giữ validation handler. Thêm handler và middleware dưới đây sau tạo app, trước include_router. Dùng Starlette HTTPException để bao gồm cả FastAPI HTTPException. Handler này đưa lỗi về contract `{error,meta}`, không trả raw token. Không xóa cookie tự động trong handler lỗi: response lỗi cũ không được phép xóa phiên mới hơn của người dùng.

```python
from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {
        "code": "HTTP_ERROR", "message": str(exc.detail)
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": detail, "meta": make_response(None)["meta"]},
        headers={**(exc.headers or {}), "Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@app.middleware("http")
async def prevent_auth_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/auth/") or request.url.path == "/api/v1/users/me/change-password":
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response
```

Không bật SQL echo hoặc log request headers/body tại auth. Nếu có middleware audit/debug, lọc Authorization, Cookie, Set-Cookie, password, refresh token và replay plaintext. Access token không đưa vào URL. `api/v1/router.py` hiện include files_router hai lần; đó là lỗi sẵn có, không cần đổi prefix auth để xử lý.

### 5.5. Cleanup: tạo `backend/app/cleanup_auth.py`

Chạy mỗi phút để xóa ciphertext hết grace. Quyền replay hết ngay khi `now >= replay_until` dù job chưa chạy. Lịch sử hash giữ **suốt khi phiên còn có thể hoạt động**, rồi giữ thêm 30 ngày từ lúc revoke hoặc session hết hạn, sau đó xóa cả phiên và cascade token. Không xóa token cũ chỉ vì token.expires_at đã qua: phiên rolling có thể vẫn sống và cần nhận diện reuse nhiều thế hệ trước.

```python
from datetime import timedelta
from sqlalchemy import select, update

from app.core.auth_sessions import now, lock_users, lock_sessions
from app.database import SessionLocal
from app.models import UserSession, RefreshToken


def cleanup():
    at = now()
    # Transaction riêng chỉ chạm token; không lấy user/session sau token.
    with SessionLocal.begin() as db:
        db.execute(update(RefreshToken).where(
            RefreshToken.replay_until <= at,
            RefreshToken.replay_ciphertext.is_not(None),
        ).values(replay_ciphertext=None))
    cutoff = at - timedelta(days=30)
    with SessionLocal() as db:
        candidates = db.execute(select(UserSession.id, UserSession.user_id).where(
            (UserSession.revoked_at < cutoff) |
            ((UserSession.revoked_at.is_(None)) & (UserSession.expires_at < cutoff))
        ).order_by(UserSession.id).limit(500)).all()
    for sid, uid in candidates:
        with SessionLocal.begin() as db:
            lock_users(db, [uid])
            sessions = lock_sessions(db, [uid])
            session = next((s for s in sessions if s.id == sid), None)
            if session is None:
                continue
            terminal = session.revoked_at or session.expires_at
            if terminal < cutoff:
                db.delete(session)


if __name__ == "__main__":
    cleanup()
```

Sau khi xóa lịch sử, token cũ chỉ là token không nhận diện được, không còn biết phiên để phát hiện reuse. Vì phiên đã kết thúc và qua retention, đây là đánh đổi được ghi rõ. Backup cũ có thể vẫn giữ hash/ciphertext; retention backup là chính sách riêng. Job cleanup có thể tranh khóa nhưng không khóa ngược; hạn chế batch theo tải thực tế. Trên VM2 có thể chạy `docker compose exec -T api python -m app.cleanup_auth` bằng systemd timer/cron mỗi phút; không chạy một cleanup loop trong từng worker.

## 6. API contract và bàn giao frontend

Tất cả URL bên dưới có prefix `/api/v1`. Production base URL: `https://api.thuexedien.me/api/v1`; localhost: `http://localhost:8000/api/v1`.

| Endpoint | Xác thực và request | HTTP 200: data | Database/cookie |
|---|---|---|---|
| POST /auth/login | JSON `{email,password}`; Origin được phép, X-EVRide-CSRF: 1 | access_token, token_type=bearer, expires_in=1800, access_expires_at, session_id, generation=0, session_expires_at, user | Tạo 1 phiên + token gen0; Set-Cookie HttpOnly; không trả refresh token trong JSON |
| POST /auth/refresh | JSON `{}`; Origin, X-EVRide-CSRF: 1, X-Session-ID; credentials include để gửi cookie | Cùng schema login; rotation thì generation tăng 1 | Khóa/rotate/rolling nguyên tử hoặc replay nguyên data và token trong grace; meta.request_id có thể mới |
| POST /auth/logout | JSON `{}`; cùng header/cookie như refresh; không cần access token còn hạn | `{logged_out:true}` | Revoke một phiên, commit rồi xóa cookie của phiên nhìn thấy trong request; retry với cookie cũ vẫn thành công |
| POST /users/me/change-password | JSON `{current_password,new_password}`; Bearer còn hiệu lực; Origin và X-EVRide-CSRF: 1 | `{changed:true,reauthenticate:true}` | Hash mật khẩu + revoke mọi phiên cùng transaction; FE logout để dọn cookie rồi yêu cầu login |

Ví dụ payload thành công (giá trị access_token chỉ là ký hiệu mô tả, không phải token thật):

```json
{
  "data": {
    "access_token": "JWT_ACCESS_TOKEN",
    "token_type": "bearer",
    "expires_in": 1800,
    "access_expires_at": "2026-11-06T10:30:00+00:00",
    "session_id": "a1348af3-05a0-4a12-8bc8-657bc97703c0",
    "generation": 1,
    "session_expires_at": "2026-12-06T10:00:00+00:00",
    "user": {"id":"1","name":"Demo","email":"demo@example.com","role":"CUSTOMER","status":"ACTIVE","created_at":"2026-11-01T00:00:00Z"}
  },
  "meta": {"request_id":"req_example","server_time":"2026-11-06T10:00:00Z"}
}
```

Thời gian UTC `+00:00` và `Z` đều RFC3339. Refresh token không có trong body. Cookie production có `Path=/api/v1/auth; HttpOnly; Secure; SameSite=Lax`, không Domain. Cache-Control no-store cho cả response lỗi auth; Nginx không cache auth.

| HTTP / error.code | Frontend xử lý |
|---|---|
| 401 TOKEN_EXPIRED | Chỉ lỗi này từ protected API được kích hoạt refresh, rồi retry API gốc tối đa một lần |
| 401 UNAUTHENTICATED / SESSION_INVALID / SESSION_EXPIRED / SESSION_REVOKED | Xóa access khỏi bộ nhớ, đồng bộ trạng thái hết phiên; không vòng refresh |
| 401 REFRESH_INVALID / REFRESH_EXPIRED / REFRESH_REUSED | Kết thúc phiên phía UI; REFRESH_REUSED đã commit revoke; không tự login lại |
| 403 ACCOUNT_DISABLED | Kết thúc trạng thái đăng nhập; không refresh |
| 403 FORBIDDEN | Hiển thị thiếu quyền; không refresh hoặc tự logout một phiên hợp lệ |
| 401 INVALID_CREDENTIALS | Lỗi login/mật khẩu hiện tại; không refresh |
| 409 REFRESH_RETRY_UNAVAILABLE | Chờ request refresh đang chạy qua khóa chung; dùng access/cookie generation mới từ tab khác. Nếu chưa có, thử refresh lại cookie jar hiện tại tối đa một lần trong lần phục hồi này; vẫn thất bại thì logout/login lại |
| 403 CSRF_REJECTED | Lỗi cấu hình/nguồn request; không refresh |
| 400 SESSION_SELECTION_REQUIRED / TOO_MANY_AUTH_COOKIES | Không đoán session, yêu cầu login; hướng dẫn xóa cookie nếu vượt giới hạn |
| 415 UNSUPPORTED_MEDIA_TYPE / 422 VALIDATION_ERROR | Sửa request, không refresh |
| 5xx / lỗi mạng | Không kết luận đã logout hoặc chưa commit; recovery có giới hạn, không retry login/password tự động |

Trường hợp cache replay hết hạn: ngoài grace là reuse → revoke; **trong grace** nhưng ciphertext mất/key không giải mã được hoặc successor đã used thì 409 và không Set-Cookie. Không trả token successor đã mất hiệu lực. Sau 409 không kéo dài grace. Nếu trình duyệt chỉ còn token đã dùng và đã qua grace thì login lại là kết quả chủ ý, không có cách khôi phục token từ hash.

Checklist bắt buộc giao người làm frontend:

1. Access token chỉ nằm trong module/React state. LocalStorage chỉ có `session_id`, epoch ngẫu nhiên và trạng thái đang logout; không access/refresh token. BroadcastChannel chỉ truyền token giữa bộ nhớ các tab cùng origin, không lưu bền vững.
2. Dùng một Promise dùng chung trong mỗi tab và Web Locks (`evride-auth`) chung giữa các tab. Login/refresh/logout/change-password đều đi qua cùng lock. Không fallback sang giả lập lock bằng localStorage read-then-write; thao tác đó không nguyên tử. Kiểm tra hỗ trợ Web Locks và báo rõ nếu browser không hỗ trợ. [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
3. Trong lock, đọc lại session_id/epoch/trạng thái; nếu tab khác vừa logout thì không bootstrap refresh. Dùng token trong bộ nhớ được broadcast hoặc yêu cầu tab khác trả token hiện tại, nếu có; nếu không có thì refresh cookie. Reload không gọi login.
4. Mỗi request ghi nhận session_id/epoch/token ban đầu. Response chỉ cập nhật bộ nhớ nếu session_id và epoch vẫn khớp; generation không thấp hơn bản đang giữ. Chỉ dùng BroadcastChannel không đủ để bảo đảm event đã tới trước khi tab khác giành lock, nên phải đọc lại metadata dưới lock và kiểm tra generation.
5. Logout đánh dấu trạng thái logout và tăng epoch dưới lock trước khi gọi API, broadcast cho các tab xóa access. Giữ session_id để retry logout nếu mạng lỗi; chỉ xóa hoàn toàn khi server xác nhận hoặc đã biết phiên vô hiệu. Không tuyên bố server logout thành công khi chưa nhận được xác nhận. Logout pending chặn refresh và login mới cho tới khi người dùng xử lý/retry.
6. Cookie có version bảo vệ trường hợp response mạng cũ vẫn Set-Cookie sau timeout, đóng tab hoặc nhận sai thứ tự. JavaScript không thể đọc/so sánh Set-Cookie. Không cho response JSON cũ cập nhật session_id mới. Login mới không tự retry khi timeout vì có thể tạo thêm phiên; request login cũ bị bỏ qua chỉ để lại cookie phiên không được chọn, tự hết hạn.
7. `fetch` tới API luôn `credentials: 'include'` khi thao tác auth, header Origin do browser đặt, các header X-EVRide-CSRF và X-Session-ID do app đặt. Body `{}` cho refresh/logout. API nghiệp vụ dùng Authorization Bearer; retry write API chỉ khi lỗi xác thực chứng minh handler chưa chạy; giữ Idempotency-Key của request nghiệp vụ nếu có.
8. Giới hạn: refresh phục hồi lỗi mạng tối đa một lần, thử replay sớm trong grace; access-expired retry request gốc tối đa một lần. Không retry vô hạn khi 401/403/409/5xx. Mất kết quả không chắc server chưa làm; dùng response code và metadata, không suy luận chỉ từ timeout.
9. Token refresh liên tục nhiều thế hệ phải dọn cookie cũ; server chỉ xóa generation thấp hơn kết quả mình trả, không xóa cookie mới hơn. Khi đổi mật khẩu, gọi logout dọn cookie rồi login lại. Không cần sửa màn hình mock nghiệp vụ trong nhiệm vụ backend này.

Khi chủ động chuyển tài khoản trong cùng trình duyệt, hoàn tất logout phiên đang chọn dưới cùng khóa trước login mới. Backend vẫn tạo session riêng cho mỗi login thành công. Điều này giảm cookie phiên bỏ quên; không đặt giới hạn tuyệt đối lên vòng đời một rolling session.

Lưu ý giới hạn browser: các cookie version cũ có thể còn tới khi request tiếp theo dọn; kiểm thử số cookie/header sau nhiều lần lỗi. Giới hạn 32 candidate trong backend chỉ bảo vệ parsing của ứng dụng, không thay thế giới hạn header của Nginx/browser.

## 7. Kiểm thử backend trên PostgreSQL 16

### 7.1. Thêm `backend/tests/test_auth_sessions.py`

Code dưới chạy trên database riêng có tên kết thúc `_test`, tạo schema UUID riêng cho mỗi test và chỉ xóa schema đó ở teardown. Không dùng DB production, SQLite hoặc transaction bao ngoài chung cho các thread. Fixture tạo ba bảng bằng model để kiểm tra hành vi auth; **không** thay thế bài kiểm tra migration trên bản sao schema đầy đủ.

```python
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

url = make_url(os.environ["TEST_DATABASE_URL"])
if url.drivername != "postgresql+psycopg" or not (url.database or "").endswith("_test"):
    raise RuntimeError("Cần PostgreSQL psycopg và database riêng có hậu tố _test")
# Thiết lập trước import app để không dùng secrets/DB production từ .env.
os.environ.update({
    "APP_ENV": "test", "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    "REFRESH_REPLAY_KEYS": Fernet.generate_key().decode(),
    "AUTH_COOKIE_SECURE": "true", "AUTH_ORIGINS": "https://thuexedien.me",
    "REFRESH_GRACE_SECONDS": "15", "JWT_ISSUER": "evride-api", "JWT_AUDIENCE": "evride-web",
    "DB_HOST": url.host or "localhost", "DB_PORT": str(url.port or 5432),
    "DB_NAME": url.database, "DB_USER": url.username or "postgres",
    "DB_PASSWORD": url.password or "",
})

from app.core import auth_sessions as service
from app.core.auth_config import JWT_SECRET, GRACE_SECONDS
from app.core.auth_http import cookie_name
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.main import app
from app.models import Base, User, UserSession, RefreshToken
from app.schemas.user import UpdateUserRequest

PASSWORD = "Test-password-2026"
NEW_PASSWORD = "Another-password-2026"
ORIGIN = "https://thuexedien.me"


@pytest.fixture
def factory(monkeypatch):
    admin = create_engine(url)
    schema = "auth_test_" + uuid4().hex
    with admin.begin() as conn:
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine, tables=[User.__table__, UserSession.__table__, RefreshToken.__table__])
    factory = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(service, "SessionLocal", factory)
    with factory.begin() as db:
        db.add_all([
            User(name="Test", email="customer@example.com", password=hash_password(PASSWORD), role="CUSTOMER", status="ACTIVE"),
            User(name="Manager", email="manager@example.com", password=hash_password(PASSWORD), role="MANAGER", status="ACTIVE"),
        ])
    def override_db():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = override_db
    yield factory
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()
    with admin.begin() as conn:
        conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
    admin.dispose()


@pytest.fixture
def client(factory):
    with TestClient(app, base_url="https://api.thuexedien.me") as c:
        yield c


def login(email="customer@example.com"):
    return service.login_session(email, PASSWORD)


def sid(grant):
    return UUID(grant["data"]["session_id"])


def offered(grant):
    return [(grant["data"]["generation"], grant["refresh_token"])]


def refresh(grant):
    return service.refresh_session(sid(grant), offered(grant))


def code(call):
    try:
        return call()
    except HTTPException as exc:
        return exc.detail["code"]


def get_me(client, grant):
    return client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + grant["data"]["access_token"]})


def headers(grant=None):
    result = {"Origin": ORIGIN, "X-EVRide-CSRF": "1"}
    if grant:
        result["X-Session-ID"] = str(sid(grant))
        result["Cookie"] = cookie_name(sid(grant), grant["data"]["generation"]) + "=" + grant["refresh_token"]
    return result


def test_login_and_rolling(factory, monkeypatch):
    real_now = service.now
    yesterday = real_now() - timedelta(days=1)
    monkeypatch.setattr(service, "now", lambda: yesterday)
    first = login()
    another = login()
    assert sid(first) != sid(another)
    monkeypatch.setattr(service, "now", real_now)
    before = real_now()
    second = refresh(first)
    assert second["data"]["generation"] == 1
    assert second["refresh_token"] != first["refresh_token"]
    with factory() as db:
        session = db.get(UserSession, sid(first))
        assert before + timedelta(days=30) <= session.expires_at <= real_now() + timedelta(days=30)
        rows = db.scalars(select(RefreshToken).where(RefreshToken.session_id == sid(first)).order_by(RefreshToken.generation)).all()
        assert len(rows) == 2 and rows[0].used_at is not None and rows[1].used_at is None
        assert rows[1].expires_at == session.expires_at
        assert rows[0].token_hash == service.digest(first["refresh_token"])
        assert second["refresh_token"] not in rows[0].replay_ciphertext


def test_lost_response_replay_does_not_extend_grace(factory):
    first = login()
    second = refresh(first)  # giả lập response bị mất: client chỉ giữ first
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        original = (old.used_at, old.replay_until)
    assert refresh(first) == second
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        assert (old.used_at, old.replay_until) == original
        assert db.scalar(select(func.count()).select_from(RefreshToken)) == 2


def test_many_generations_and_reuse_committed(factory, monkeypatch, client):
    first = login()
    second = refresh(first)
    third = refresh(second)
    assert code(lambda: refresh(first)) == "REFRESH_RETRY_UNAVAILABLE"
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        boundary = old.replay_until
    monkeypatch.setattr(service, "now", lambda: boundary)
    assert code(lambda: refresh(first)) == "REFRESH_REUSED"
    # Session mới, connection mới: chứng minh revocation không bị rollback bởi HTTPException.
    with factory() as db:
        assert db.get(UserSession, sid(first)).revoke_reason == "REFRESH_REUSE"
    assert get_me(client, third).json()["error"]["code"] == "SESSION_REVOKED"


@pytest.mark.parametrize("kind", ["missing_cache", "bad_cache", "successor_used"])
def test_retry_unavailable(factory, kind):
    first = login()
    second = refresh(first)
    if kind == "successor_used":
        refresh(second)
    else:
        with factory.begin() as db:
            old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
            old.replay_ciphertext = None if kind == "missing_cache" else "broken"
    assert code(lambda: refresh(first)) == "REFRESH_RETRY_UNAVAILABLE"
    with factory() as db:
        assert db.get(UserSession, sid(first)).revoked_at is None


def test_atomic_rollback(factory, monkeypatch):
    first = login()
    def fail(*args):
        raise RuntimeError("injected failure after old token flush")
    monkeypatch.setattr(service, "grant_for", fail)
    with pytest.raises(RuntimeError):
        refresh(first)
    with factory() as db:
        old = db.scalar(select(RefreshToken))
        assert old.used_at is None and old.replay_ciphertext is None
        assert db.scalar(select(func.count()).select_from(RefreshToken)) == 1


def test_password_rollback(factory, monkeypatch):
    first, other = login(), login()
    original_revoke = service.revoke
    def fail_after_revoke(session, at, reason):
        original_revoke(session, at, reason)
        raise RuntimeError("injected failure during password revocation")
    monkeypatch.setattr(service, "revoke", fail_after_revoke)
    uid = int(first["data"]["user"]["id"])
    with pytest.raises(RuntimeError):
        service.change_session_password(uid, sid(first), PASSWORD, NEW_PASSWORD)
    with factory() as db:
        assert verify_password(PASSWORD, db.get(User, uid).password)
        assert all(db.get(UserSession, sid(g)).revoked_at is None for g in [first, other])


def test_refresh_races_account_lock(factory, client):
    customer, manager = login(), login("manager@example.com")
    gate = Barrier(2)
    def a():
        gate.wait(timeout=5)
        return code(lambda: refresh(customer))
    def b():
        gate.wait(timeout=5)
        return service.update_account(
            int(manager["data"]["user"]["id"]), sid(manager),
            int(customer["data"]["user"]["id"]), UpdateUserRequest(status="BLOCKED")
        )
    with ThreadPoolExecutor(max_workers=2) as pool:
        x, y = pool.submit(a), pool.submit(b)
        outcome, _ = x.result(timeout=15), y.result(timeout=15)
    assert isinstance(outcome, dict) or outcome == "ACCOUNT_DISABLED"
    assert get_me(client, customer).status_code == 403
    with factory() as db:
        assert db.get(UserSession, sid(customer)).revoked_at is not None


def test_concurrent_refresh_rotates_once(factory):
    first = login()
    gate = Barrier(2)
    def worker():
        gate.wait(timeout=5)
        return refresh(first)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker) for _ in range(2)]
        a, b = [f.result(timeout=15) for f in futures]
    assert a == b
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(RefreshToken)) == 2


@pytest.mark.parametrize("action", ["logout", "password"])
def test_refresh_races_revocation(factory, client, action):
    first = login()
    other_session = login()
    uid = int(first["data"]["user"]["id"])
    gate = Barrier(2)
    def refresh_worker():
        gate.wait(timeout=5)
        return code(lambda: refresh(first))
    def revoke_worker():
        gate.wait(timeout=5)
        if action == "logout":
            return service.logout_session(sid(first), offered(first))
        return service.change_session_password(uid, sid(first), PASSWORD, NEW_PASSWORD)
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = pool.submit(refresh_worker), pool.submit(revoke_worker)
        outcome, _ = a.result(timeout=15), b.result(timeout=15)
    assert isinstance(outcome, dict) or outcome == "SESSION_REVOKED"
    assert get_me(client, first).status_code == 401
    if isinstance(outcome, dict):
        assert get_me(client, outcome).status_code == 401
    if action == "password":
        assert get_me(client, other_session).status_code == 401
        with factory() as db:
            assert verify_password(NEW_PASSWORD, db.get(User, uid).password)
    else:
        assert get_me(client, other_session).status_code == 200


def test_disable_reenable_does_not_resurrect(factory, client):
    customer = login()
    manager = login("manager@example.com")
    actor = int(manager["data"]["user"]["id"])
    target = int(customer["data"]["user"]["id"])
    service.update_account(actor, sid(manager), target, UpdateUserRequest(status="BLOCKED"))
    assert get_me(client, customer).json()["error"]["code"] == "ACCOUNT_DISABLED"
    assert code(lambda: refresh(customer)) == "ACCOUNT_DISABLED"
    service.update_account(actor, sid(manager), target, UpdateUserRequest(status="ACTIVE"))
    assert get_me(client, customer).json()["error"]["code"] == "SESSION_REVOKED"


@pytest.mark.parametrize("kind", ["session", "refresh"])
def test_expiration(factory, client, kind):
    grant = login()
    with factory.begin() as db:
        obj = db.get(UserSession, sid(grant)) if kind == "session" else db.scalar(select(RefreshToken))
        obj.created_at = service.now() - timedelta(days=31)
        obj.expires_at = service.now() - timedelta(seconds=1)
    assert code(lambda: refresh(grant)) == ("SESSION_EXPIRED" if kind == "session" else "REFRESH_EXPIRED")
    if kind == "session":
        assert get_me(client, grant).status_code == 401


def test_access_expired_and_invalid_claims(factory, client):
    grant = login()
    payload = jwt.decode(grant["data"]["access_token"], options={"verify_signature": False})
    expired = dict(payload, exp=int(datetime.now(timezone.utc).timestamp()) - 1)
    expired["iat"] = expired["exp"] - 1800
    token = jwt.encode(expired, JWT_SECRET, algorithm="HS256")
    r = client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token})
    assert r.json()["error"]["code"] == "TOKEN_EXPIRED"
    for key in ["sid", "sub", "exp", "iat"]:
        broken = dict(payload)
        broken.pop(key)
        token = jwt.encode(broken, JWT_SECRET, algorithm="HS256")
        assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    broken = dict(payload, sub="abc")
    token = jwt.encode(broken, JWT_SECRET, algorithm="HS256")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    token = jwt.encode(payload, secrets.token_urlsafe(48), algorithm="HS256")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS384")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    for changes in [{"aud":"wrong-audience"}, {"iss":"wrong-issuer"}, {"sid":str(uuid4())}, {"typ":"refresh"}]:
        token = jwt.encode(dict(payload, **changes), JWT_SECRET, algorithm="HS256")
        assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401
    token = jwt.encode(dict(payload, sub="9223372036854775807"), JWT_SECRET, algorithm="HS256")
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + token}).status_code == 401


def test_http_cookie_csrf_and_cors(client):
    path = "/api/v1/auth/login"
    body = {"email": "customer@example.com", "password": PASSWORD}
    assert client.post(path, json=body).status_code == 403
    assert client.post(path, json=body, headers={"Origin": "https://evil.example", "X-EVRide-CSRF": "1"}).status_code == 403
    assert client.post(path, json=body, headers={"Origin": ORIGIN}).status_code == 403
    r = client.post(path, json=body, headers=headers())
    assert r.status_code == 200
    assert "refresh_token" not in r.json()["data"]
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=lax" in cookie
    assert "path=/api/v1/auth" in cookie and "domain=" not in cookie
    assert r.headers["cache-control"] == "no-store"
    selected = r.json()["data"]["session_id"]
    refreshed = client.post("/api/v1/auth/refresh", json={}, headers={**headers(), "X-Session-ID": selected})
    assert refreshed.status_code == 200
    out = client.post("/api/v1/auth/logout", json={}, headers={**headers(), "X-Session-ID": selected})
    assert out.status_code == 200 and "max-age=0" in out.headers["set-cookie"].lower()
    for origin, allowed in [(ORIGIN, True), ("https://evil.example", False)]:
        r = client.options("/api/v1/auth/refresh", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-evride-csrf,x-session-id",
        })
        assert (r.headers.get("access-control-allow-origin") == origin) is allowed
    r = client.post("/api/v1/auth/refresh", json={"refresh_token":"forbidden"}, headers={**headers(), "X-Session-ID": selected})
    assert r.status_code == 422


def test_late_cookie_cannot_overwrite_new_generation(factory, client):
    first = login()
    second = refresh(first)
    third = refresh(second)
    assert len({cookie_name(sid(g), g["data"]["generation"]) for g in [first, second, third]}) == 3
    # Cookie cũ xuất hiện lại cùng cookie mới: chọn gen2, không revoke do gen0.
    fourth = service.refresh_session(sid(first), offered(first) + offered(second) + offered(third))
    assert fourth["data"]["generation"] == 3
    service.logout_session(sid(first), offered(first))
    assert code(lambda: refresh(fourth)) == "SESSION_REVOKED"
    assert get_me(client, fourth).status_code == 401


def test_http_reuse_is_committed_without_set_cookie(factory, client, monkeypatch):
    first = login()
    refresh(first)
    with factory() as db:
        old = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == service.digest(first["refresh_token"])))
        expired_grace = old.replay_until
    monkeypatch.setattr(service, "now", lambda: expired_grace)
    r = client.post("/api/v1/auth/refresh", json={}, headers=headers(first))
    assert r.status_code == 401 and r.json()["error"]["code"] == "REFRESH_REUSED"
    assert "set-cookie" not in r.headers
    with factory() as db:
        assert db.get(UserSession, sid(first)).revoked_at is not None
```

Từ `backend/`, tạo database test riêng bằng tài khoản được cấp quyền, đặt URL test trong môi trường rồi chạy (không commit URL có password):

```powershell
$env:TEST_DATABASE_URL = 'postgresql+psycopg://test_user:YOUR_TEST_PASSWORD@localhost:5432/evride_test'
.\.venv\Scripts\python.exe -m pytest tests/test_auth_sessions.py -q
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

`YOUR_TEST_PASSWORD` là chỗ nhập credential test của bạn, không phải mật khẩu mặc định để deploy. Không chạy test concurrency với connection chung hoặc SQLite. Test account phải có quyền tạo/xóa schema trong database test riêng. Nếu test treo, xem `pg_stat_activity`, `pg_locks`, `pg_blocking_pids(pid)`; không tăng timeout để bỏ qua deadlock.

### 7.2. Kiểm tra migration và tích hợp bắt buộc trước deploy

- Backup database phát triển hiện có; restore sang database test riêng có schema đầy đủ. Ghi `alembic current`, đếm users/rentals/invoices trước migration. Chạy migration mới, xác nhận hai bảng mới và các partial index; số lượng và nội dung dữ liệu nghiệp vụ không đổi. `alembic check` không phát sinh diff auth. Không dùng `create_all` trong app production.
- Thử generation chain dài, giả lập thời gian tiến sát/qua grace; xác nhận không kéo dài replay_until. Tắt worker sau commit trước khi trả response rồi retry cookie cũ; đối chiếu với test mô phỏng mất response ở trên.
- Tranh chấp change-password với login (cả hai khóa user): password cũ chỉ login trước transaction đổi password, phiên vừa tạo phải bị revoke; nếu login sau commit thì mật khẩu cũ bị từ chối. Thử tương tự với khóa tài khoản.
- Inject exception trong transaction cập nhật password/revoke: cả password và revoked_at rollback; test_password_rollback đã cung cấp trường hợp này, cần chạy trên PostgreSQL.
- Cleanup: ciphertext hết hạn bị xóa; token cũ của phiên còn sống không bị xóa; session kết thúc chưa đủ 30 ngày giữ nguyên; quá retention xóa cascade; cleanup chờ user lock và kiểm tra lại trước xóa.

### 7.3. Bài kiểm tra browser bàn giao frontend

Backend tests không chứng minh Web Locks/BroadcastChannel hoặc chính sách cookie của trình duyệt. Người làm frontend cần test Playwright/browser thật sau khi tích hợp:

| Kịch bản | Kết quả cần ghi nhận |
|---|---|
| 10 API cùng TOKEN_EXPIRED | Một refresh đang chạy trong tab, API chờ và retry tối đa một lần |
| Hai tab cùng refresh | Cùng khóa liên tab; không rotation đôi vì cùng cookie cũ; tab mới không login tạo phiên mới |
| Reload | Lấy session_id không bí mật, refresh cookie, access chỉ vào memory |
| Logout ở tab A | Tab B xóa access, không bootstrap refresh; API mới dùng access cũ bị từ chối |
| Giữ response gen1 rồi nhận gen2 trước | Thả response gen1: cookie gen2 còn nguyên; UI không nhận token generation thấp |
| Refresh đang bay rồi logout/đổi mật khẩu | Session revoke có hiệu lực; response cũ không hồi sinh UI hoặc quyền server |
| Refresh cũ về sau login tài khoản khác | Cookie khác session không ghi đè; session_id/epoch mới không bị response cũ thay thế |
| Xóa cache replay hoặc successor đã rotated | 409, không Set-Cookie; một lần recovery rồi login nếu không phục hồi được |
| Mất mạng/logout timeout | UI ở logout pending, không nói đã revoke thành công; retry hữu hạn, không tự refresh |
| Origin lạ/subdomain lạ/form POST | 403 dù cookie có thể được browser gửi; không thay đổi DB |
| Production/localhost | Secure bật/tắt đúng môi trường; cookie HttpOnly không xuất hiện trong document.cookie; www redirect trước khi khởi tạo app |
| Reload 100 lần, delayed response | Cookie cũ được dọn, header không phình vượt hạn; không refresh loop |

## 8. Azure, HTTPS, localhost và chuyển đổi

### 8.1. Topology đã được cung cấp, không phải suy đoán VM demo

```text
Browser HTTPS
  thuexedien.me / www.thuexedien.me / api.thuexedien.me
      → Azure VM1: Public IP tĩnh, Nginx Docker, TLS Let's Encrypt
      → Azure VM2: private IP, FastAPI Docker :8000
      → Azure VM3: private IP, PostgreSQL 16 Docker :5432 và file storage
```

Domain do Namecheap đăng ký. DNS **authoritative** do một bên quản lý tại một thời điểm: Namecheap hoặc Cloudflare theo nameserver thực tế. Việc mua domain không tự cấp/chạy Let's Encrypt. Phần dưới thực hiện HTTP-01 trên VM1 và dùng DNS-only; nếu sau này bật Cloudflare proxy, phải review lại real client IP, TLS origin và chỉ tin proxy đã xác định. Không dùng chế độ Flexible.

VNet/subnet/private IP chưa được cung cấp, nên các biến `VM1_PRIVATE_IP`, `VM2_PRIVATE_IP`, `VM3_PRIVATE_IP` dưới đây phải lấy từ NIC thật trong Azure Portal. Đây là tham số triển khai, không phải chỗ bỏ trống logic auth. Không dùng 192.168.56.x. Đặt private IP allocation tĩnh tại Azure NIC, không tự đặt IP tùy ý trong Ubuntu.

DNS:

| Bản ghi | Giá trị |
|---|---|
| A `@` | Public IPv4 tĩnh của VM1 |
| A `api` | Cùng Public IPv4 VM1 |
| CNAME `www` | `thuexedien.me` |

Không tạo AAAA nếu VM1 chưa có IPv6 và rule routing/firewall tương ứng. Chứng chỉ bao gồm cả ba tên; `www` vẫn cần certificate trước khi redirect HTTPS sang apex. Xác minh `dig +short thuexedien.me A`, `dig +short api.thuexedien.me A`, `dig +short www.thuexedien.me`, `dig +short thuexedien.me NS` từ ngoài mạng Azure.

### 8.2. NSG và firewall

| Máy | Allow inbound | Deny cần thêm trước rule mặc định rộng |
|---|---|---|
| VM1 | TCP 80/443 từ Internet; SSH chỉ IP quản trị hoặc Azure Bastion | SSH từ nơi khác; không publish cổng frontend phụ |
| VM2 | TCP 8000 từ private IP VM1/32; SSH từ mạng quản trị | TCP 8000 từ mọi nguồn khác, kể cả VM khác trong VNet |
| VM3 | TCP 5432 từ private IP VM2/32; cổng storage data chỉ VM2 nếu backend proxy file | TCP 5432/storage từ nguồn khác; không công khai cổng quản trị storage |

NSG mặc định có AllowVNetInBound, nên thêm một rule allow nguồn cụ thể rồi rule deny port đó từ mọi nguồn với priority sau allow nhưng trước default. Chỉ một rule allow VM2 không tự loại quyền của toàn VNet. Kiểm tra effective NSG cả subnet lẫn NIC. VM2/VM3 nên không có public IP; quản trị qua Bastion/VPN/jump host được giới hạn. [Azure NSG](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview).

Docker publish port có thể đi vòng qua UFW INPUT; không dựa riêng UFW để bảo vệ container. Bind port vào private IP, áp NSG và luật tương thích firewall backend Docker đang dùng. Với iptables, kiểm tra DOCKER-USER; không chép rule iptables sang máy đang dùng nftables một cách máy móc. [Docker firewall](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

TLS công khai kết thúc ở VM1. Ví dụ này dùng HTTP bên trong VNet cho VM1→VM2; đây không phải mã hóa end-to-end giữa các VM. Nếu mô hình đe dọa yêu cầu mã hóa nội bộ, bổ sung TLS/mTLS giữa proxy/API và PostgreSQL TLS với xác minh certificate; VNet/NSG không thay cho mã hóa.

### 8.3. Backend Docker trên VM2

Thêm `backend/Dockerfile` khi tự áp dụng:

```dockerfile
FROM python:3.12-slim
WORKDIR /srv/evride/backend
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --uid 10001 --create-home evride
COPY app ./app
COPY alembic.ini ./
COPY database/migrations ./database/migrations
RUN mkdir -p uploads && chown -R evride:evride /srv/evride
USER evride
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
```

Thêm `backend/.dockerignore`:

```text
.env
.env.*
.venv
__pycache__
uploads
tests
*.pyc
```

Ví dụ `compose.yaml` ở thư mục deploy VM2, cùng repo nằm tại `./source` (chỉnh build.context theo vị trí clone thật):

```yaml
services:
  api:
    build:
      context: ./source/backend
    restart: unless-stopped
    env_file: ./backend.env
    ports:
      - "${VM2_PRIVATE_IP:?set VM2_PRIVATE_IP}:8000:8000"
    command:
      - uvicorn
      - app.main:app
      - --host
      - 0.0.0.0
      - --port
      - "8000"
      - --workers
      - "1"
      - --proxy-headers
      - --forwarded-allow-ips
      - "${VM1_PRIVATE_IP:?set VM1_PRIVATE_IP}"
      - --no-access-log
    volumes:
      - uploads_compat:/srv/evride/backend/uploads
volumes:
  uploads_compat:
```

`backend.env` là file bí mật trên VM2, quyền 600; chứa cấu hình production mục 4 và DB_* của VM3. `.env` của Compose chứa private IP để interpolate, không nhầm với env_file nạp vào app. Dùng một worker ban đầu cho máy nhỏ; B1s/B1ms chưa được load test ở đây, không coi cấu hình đó đủ tải thực tế. DB connection pool và số worker phải được kiểm tra theo tải/memory.

Volume `uploads_compat` chỉ giữ dữ liệu của implementation file hiện tại: `files.py` đang ghi local `backend/uploads`. **Nó chưa thực hiện yêu cầu lưu file trên VM3.** Người phụ trách storage phải thay implementation sang dịch vụ VM3 hoặc mount storage được quản lý, có kiểm tra quyền truy cập và backup. Hướng dẫn auth này không giả định MinIO hay tự công khai CCCD. Không coi website đã đáp ứng thiết kế storage production chỉ vì auth chạy được.

Build và migrate theo thứ tự, không tự chạy migration trong entrypoint của từng worker:

```bash
docker compose build api
docker compose run --rm api python -m alembic current
docker compose run --rm api python -m alembic upgrade head
docker compose up -d api
```

Chỉ chạy upgrade sau khi schema baseline và migration đã kiểm tra. Nếu deploy đổi private IP/proxy, cập nhật trusted proxy list; không dùng `--forwarded-allow-ips '*'`. Nginx ở mục sau ghi đè X-Forwarded-For thay vì tin giá trị do client gửi. Kiểm tra `request.client.host` thực tế sau Docker NAT; nếu backend thấy một địa chỉ proxy khác, xác định đúng đường đi trước khi thêm nó vào trust list.

### 8.4. PostgreSQL 16 trên VM3

Ví dụ Compose tối thiểu cho DB, chưa bao gồm sản phẩm storage chưa được nhóm chỉ định:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: "${POSTGRES_ADMIN_PASSWORD:?set admin password}"
    ports:
      - "${VM3_PRIVATE_IP:?set VM3_PRIVATE_IP}:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

Không dùng superuser postgres làm DB_USER của FastAPI. Tạo role/database bằng psql tương tác trên VM3:

```bash
docker compose up -d postgres
docker compose exec postgres psql -U postgres
```

Trong psql:

```sql
CREATE ROLE evride_app LOGIN;
\password evride_app
CREATE DATABASE evride OWNER evride_app;
```

Nhập password qua prompt, không ghi literal trong script. Cấu hình `DB_NAME=evride`, `DB_USER=evride_app`, `DB_PASSWORD` bằng secret tương ứng trên VM2. Cấp quyền migration cần thiết cho role sở hữu schema; có thể tách role migration/runtime sau khi đã rà quyền bảng/sequence. Kiểm tra pg_hba dùng xác thực mật khẩu scram phù hợp nguồn private IP; không mở trust mạng rộng.

Backup ví dụ chạy trên VM3:

```bash
mkdir -p backups
chmod 700 backups
umask 077
docker compose exec -T postgres pg_dump -U postgres -Fc evride > "backups/evride-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Đối với script chạy định kỳ, kiểm tra exit code pg_dump và file không rỗng; mã hóa/đưa bản sao ra ngoài VM, quy định retention, backup storage riêng và kiểm tra restore. Thử restore vào database **mới**, không dùng `--clean` vào production:

```bash
docker compose exec postgres createdb -U postgres evride_restore_test
docker compose exec -T postgres pg_restore -U postgres -d evride_restore_test --no-owner --exit-on-error < backups/BACKUP_FILE.dump
```

Thay `BACKUP_FILE.dump` bằng file thật. DB restore test phải được kiểm tra schema/alembic version/dữ liệu; không suy ra thành công chỉ từ việc file backup tồn tại. Không chạy `docker compose down -v` trên DB đang dùng.

### 8.5. Nginx và Let's Encrypt ở VM1

Chuẩn bị `/opt/evride-edge` trên VM1 với `compose.yaml`, thư mục `templates`, `frontend-dist`, `acme`, `letsencrypt`. `frontend-dist` là build do người phụ trách frontend bàn giao. Trước khi có frontend có thể đặt một index.html thông báo bảo trì; không giả định frontend auth đã triển khai.

`compose.yaml`:

```yaml
services:
  nginx:
    image: nginx:stable-alpine
    restart: unless-stopped
    environment:
      VM2_PRIVATE_IP: "${VM2_PRIVATE_IP:?set VM2_PRIVATE_IP}"
      NGINX_ENVSUBST_FILTER: "^VM2_PRIVATE_IP$"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./templates:/etc/nginx/templates:ro
      - ./frontend-dist:/usr/share/nginx/html:ro
      - ./acme:/var/www/certbot:ro
      - ./letsencrypt:/etc/letsencrypt:ro
  certbot:
    image: certbot/certbot:latest
    profiles: [tools]
    volumes:
      - ./acme:/var/www/certbot
      - ./letsencrypt:/etc/letsencrypt
```

Các image tag ở đây là ví dụ kênh phát hành. Sau kiểm thử, ghi lại/pin digest cho release để redeploy có thể lặp lại; vẫn có lịch cập nhật bản vá. Không commit thư mục letsencrypt hoặc private key.

**Bước A — bootstrap HTTP:** lưu `templates/default.conf.template` với nội dung dưới. Chưa tham chiếu certificate chưa tồn tại.

```nginx
server {
    listen 80;
    server_name thuexedien.me www.thuexedien.me api.thuexedien.me;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }
    location / { return 503; }
}
```

Chạy tại `/opt/evride-edge` sau khi DNS và cổng 80 trỏ đúng VM1:

```bash
docker compose up -d nginx
docker compose run --rm certbot certonly --webroot -w /var/www/certbot --cert-name thuexedien.me -d thuexedien.me -d www.thuexedien.me -d api.thuexedien.me --email YOUR_OPERATIONS_EMAIL --agree-tos --non-interactive
```

Thay YOUR_OPERATIONS_EMAIL bằng email vận hành thực tế. HTTP-01 cần Let’s Encrypt truy cập được port 80 từ Internet và lấy file challenge đúng ở cả ba domain. Không dùng certificate tự ký trên production và không hướng dẫn người dùng bỏ qua cảnh báo browser. [Let's Encrypt HTTP-01](https://letsencrypt.org/docs/challenge-types/).

**Bước B — HTTPS:** sau khi cấp thành công, thay toàn bộ `templates/default.conf.template` bằng cấu hình sau. Nginx official image sẽ envsubst **chỉ VM2_PRIVATE_IP**; các biến Nginx `$host`, `$uri`, `$remote_addr` phải được giữ nguyên.

```nginx
log_format evride_safe '$remote_addr $request_method $uri $status $request_time';
access_log /var/log/nginx/access.log evride_safe;

server {
    listen 80 default_server;
    server_name _;
    return 444;
}

server {
    listen 80;
    server_name thuexedien.me www.thuexedien.me api.thuexedien.me;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }
    location / { return 308 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    server_name www.thuexedien.me;
    ssl_certificate /etc/letsencrypt/live/thuexedien.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuexedien.me/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 308 https://thuexedien.me$request_uri;
}

server {
    listen 443 ssl;
    server_name thuexedien.me;
    ssl_certificate /etc/letsencrypt/live/thuexedien.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuexedien.me/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /usr/share/nginx/html;
    location / { try_files $uri $uri/ /index.html; }
    location = /index.html { add_header Cache-Control "no-cache"; }
}

server {
    listen 443 ssl;
    server_name api.thuexedien.me;
    ssl_certificate /etc/letsencrypt/live/thuexedien.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thuexedien.me/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 12m;
    location /api/v1/ {
        proxy_pass http://${VM2_PRIVATE_IP}:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection "";
        proxy_cache off;
        proxy_next_upstream off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
    location / { return 404; }
}
```

`proxy_pass` không có dấu `/` cuối nên giữ nguyên `/api/v1/...`. Không rewrite cookie Domain/Path ở proxy, không hide Set-Cookie. Tắt retry upstream cho tránh tự gửi lại mutation; retry refresh do client điều phối. CORS do FastAPI chịu trách nhiệm, không thêm header CORS trùng tại Nginx. Access log dùng `$uri`, không `$request` chứa query string; vẫn cấm gửi token trong URL và tắt log body/header nhạy cảm. [Nginx proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

Kiểm tra và nạp lại container để entrypoint render template mới:

```bash
docker compose run --rm --no-deps nginx nginx -t
docker compose up -d --force-recreate nginx
curl -I https://thuexedien.me
curl -I https://www.thuexedien.me
curl https://api.thuexedien.me/api/v1/health
```

Không dùng `curl -k` để coi TLS đạt. Domain/chứng chỉ sai phải sửa DNS/chain/server_name. Swagger chưa public trong cấu hình này; dùng SSH tunnel tới backend khi cần, hoặc thêm route tài liệu được bảo vệ riêng. `AUTH_ORIGINS` chỉ apex vì www redirect; nếu nhóm quyết định phục vụ app ở cả hai origin thì phải thêm origin rõ ràng và giải quyết hai vùng lock/storage riêng, không chỉ sửa CORS.

**Bước C — gia hạn tự động:** tạo `/opt/evride-edge/renew-tls.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/evride-edge
docker compose run --rm certbot renew --quiet
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
```

Reload sau lệnh renew thành công kể cả chưa tới kỳ đổi certificate là chấp nhận được; nếu renew thất bại script dừng và systemd báo lỗi. Thử renewal trước:

```bash
docker compose run --rm certbot renew --dry-run
chmod 700 /opt/evride-edge/renew-tls.sh
```

Tạo `/etc/systemd/system/evride-tls-renew.service`:

```ini
[Unit]
Description=Renew EVRide TLS certificates
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/evride-edge/renew-tls.sh
```

Tạo `/etc/systemd/system/evride-tls-renew.timer`:

```ini
[Unit]
Description=Check EVRide TLS renewal twice daily

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
```

Kích hoạt:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now evride-tls-renew.timer
sudo systemctl start evride-tls-renew.service
sudo systemctl status evride-tls-renew.timer
sudo journalctl -u evride-tls-renew.service --no-pager
```

Theo dõi ngày hết hạn, lỗi job và certificate thực tế Nginx phục vụ. Không đoán thời hạn certificate cố định; dùng lịch `certbot renew` kiểm tra thường xuyên. Backup thư mục letsencrypt có kiểm soát truy cập. [Certbot renewal](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

### 8.6. Localhost riêng

Trong `backend/.env`, dùng các biến development mục 4 và DB phát triển của bạn. Chạy:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --env-file .env
```

Gọi bằng URL `http://localhost:8000`; frontend `http://localhost:5173`. Test web auth qua client JSON với Origin `http://localhost:5173`, X-EVRide-CSRF: 1 và cookie jar; Swagger Try it out cùng origin API không tự thỏa Origin frontend/header CSRF. Có thể thêm origin localhost API vào allowlist **development** nếu chủ động hỗ trợ Swagger và gửi đủ header; không thêm vào production.

Development `Secure=false` là ngoại lệ rõ ràng để HTTP local dễ kiểm thử, không dùng cấu hình đó cho IP LAN hoặc Internet. Kiểm thử thuộc tính Secure thực sự phải chạy trên HTTPS ở staging/production hoặc HTTPS local được tin cậy. HTTP trên IP VM demo không thay thế được secure-context test của frontend.

### 8.7. Cutover, JWT cũ và rollback

1. Review diff model/migration/contract; chạy test PostgreSQL và kiểm tra baseline. Backup DB trước deploy; lưu release backend/frontend đang dùng và version secret.
2. Chuẩn bị VM3 schema có dữ liệu, NSG; VM2 secret/JWT/replay key; VM1 DNS/HTTPS. Đồng bộ thời gian NTP trên các VM để quyết định expiry/grace nhất quán.
3. Chọn khoảng bảo trì cho auth: chặn login/refresh cũ, drain request đang chạy. Chạy additive migration trước backend mới. Không xóa user, password, wallet, rental hoặc lịch sử khác.
4. Deploy backend mới rồi frontend đã tích hợp contract tương ứng. Đây là thay đổi breaking với client cũ: JWT không sid bị từ chối, client phải login lại. Không tạo session giả từ JWT cũ. Không chạy đồng thời instance backend cũ bỏ qua session revocation với instance mới.
5. Frontend mới xóa cách lưu token cũ (nếu nhóm đã bổ sung trong thời gian này), bootstrap cookie khi có session_id hoặc chuyển login. Kiểm tra login/refresh/logout/password/lock user qua domain thật, browser thật, hai tab.
6. Chỉ mở auth công khai sau khi backend, frontend và proxy khớp. Chưa có frontend auth thì có thể triển khai backend để kiểm thử có giới hạn, không tuyên bố website hoàn thành rolling session.
7. Rollback ưu tiên sửa tiến hoặc quay về bản **vẫn kiểm tra session** và giữ hai bảng mới. Nếu buộc quay về backend JWT cũ, bật bảo trì, thu hồi phiên/đổi JWT secret và bắt login lại; backend cũ không thực thi semantics revocation nên không thể quảng bá là rollback giữ nguyên bảo mật. Không downgrade xóa lịch sử; không phục hồi backup cũ đè mất giao dịch phát sinh sau cutover.

### 8.8. Những gì chưa được xác minh

Hướng dẫn không chứng minh domain đã trỏ DNS, VM đã tạo, NSG đã cấu hình, certificate đã cấp hay backend đã deploy. Chưa biết private IP thật, authoritative DNS cuối cùng, sản phẩm storage VM3 và nguồn DBML gốc. Các tham số này không ngăn triển khai/test phần auth trên localhost nhưng phải điền/kiểm tra trước production.

Code mới trong hướng dẫn chưa được áp dụng vào app. Kiểm tra cú pháp các khối Python không thay thế chạy chúng. Bộ test auth cần pytest/httpx/cryptography và PostgreSQL 16 riêng; không được ghi “đã pass” khi chưa chạy đủ. Cần kiểm tra thêm tải, rate limit đăng nhập, password hasher, storage/quyền dữ liệu, backup/restore, frontend và vận hành; token mechanism không tự chứng minh toàn hệ thống đạt chuẩn production.

## 9. Danh sách tệp để bạn tự áp dụng

| Tệp | Thao tác |
|---|---|
| backend/app/models.py | Thêm hai class/import, giữ model khác |
| backend/database/migrations/alembic/versions/<revision_moi>_add_rolling_auth_sessions.py | Migration additive, review trước chạy |
| backend/app/core/auth_config.py | Tạo mới cấu hình fail-fast |
| backend/app/core/security.py | Thay phần JWT, giữ password functions hiện tại |
| backend/app/core/dependencies.py | Thay bằng xác thực sub/sid/session/user |
| backend/app/core/auth_http.py | Tạo mới CSRF/cookie utilities |
| backend/app/core/auth_sessions.py | Tạo mới transaction service |
| backend/app/api/v1/auth.py | Giữ register, thay login, thêm refresh/logout |
| backend/app/api/v1/users.py | Thay change_password và update_user |
| backend/app/schemas/auth.py | Cấm extra fields ở hai request schema |
| backend/app/main.py | CORS, HTTPException envelope, no-store |
| backend/app/cleanup_auth.py | Cleanup ciphertext và lịch sử terminal sessions |
| backend/.env.example, backend/requirements.txt, backend/requirements-dev.txt | Biến môi trường, dependency runtime/test |
| backend/tests/test_auth_sessions.py | Test PostgreSQL/HTTP và concurrency |
| backend/Dockerfile, backend/.dockerignore | Build backend image |
| docs/v1-decisions.md, docs/api-contract.md | Cập nhật chính sách/contract đúng file hiện có |
| docs/database.md, docs/ER_diagram.pdf | Bổ sung hai bảng, xuất lại ERD khi có nguồn |
| docs/architecture.md, docs/ke_hoach_kiem_thu.md, docs/ke_hoach_ha_tang.md | Lock order, test, Azure production riêng demo |
| README.md, backend/README.md, deploy/README.md, frontend/README.md | Lệnh chạy, chuyển đổi, bàn giao frontend |
| deploy/docker/, deploy/nginx/, deploy/scripts/ | Lưu template Compose/Nginx/renewal tương ứng, không lưu secrets |

`backend/app/database.py`, `backend/alembic.ini`, `backend/database/migrations/alembic/env.py` không cần đổi cho schema/session cơ bản này: database.py đã cung cấp SessionLocal/get_db; Alembic đã dùng Base.metadata. Không thêm một hệ thống migration khác. Không sửa frontend code trong phạm vi bạn phụ trách.

## 10. Kết quả kiểm tra khi soạn hướng dẫn

Ngày 06/11/2026:

- Đã kiểm tra cú pháp cả 13 khối Python trong hướng dẫn bằng `compile`; không tạo file .pyc.
- Đã nạp model hiện có vào bộ nhớ, thêm hai model từ hướng dẫn: SQLAlchemy nhận 26 bảng; compile PostgreSQL DDL của hai bảng và năm index thành công.
- Đã chạy hàm upgrade từ hướng dẫn qua Alembic offline PostgreSQL: sinh hai CREATE TABLE và không có DROP. Đây không phải việc áp migration lên database thật.
- Đã chạy lại `python -B -m unittest discover -s tests -v`: 5 test demo hiện có đạt. Các test này không kiểm tra auth.
- `python -B -m alembic heads`: một head `888ad91e139e`; không gọi upgrade/current lên DB thật trong lượt soạn.
- Chưa chạy test auth mới, test browser, Docker/Nginx config test, DNS/TLS/renewal hoặc load test. Môi trường Python hiện tại thiếu cryptography/pytest/httpx và chưa được cấp database PostgreSQL test riêng.
- Tệp duy nhất được thêm khi soạn là `docs/rolling-session-backend-guide.md`. Các file backend/frontend, migration và tài liệu chính sách hiện có không bị sửa; những thay đổi chưa commit của bạn đã có từ trước được giữ nguyên.



