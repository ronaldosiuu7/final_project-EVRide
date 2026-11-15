# EVRide – Hệ thống quản lý cho thuê xe máy điện

EVRide là website quản lý dịch vụ cho thuê xe máy điện theo mô hình trạm. Khách hàng tìm xe đang có sẵn, đặt và giữ xe trong 30 phút, nhận xe tại một trạm và trả tại bất kỳ trạm nào còn chỗ trống.

Phạm vi hệ thống gồm quản lý phương tiện, trạm xe, khách hàng, nhân viên, thanh toán, ví điện tử, khuyến mãi và xử lý sự cố. Công nghệ định hướng: React, FastAPI và PostgreSQL.

## Mô hình hoạt động

1. Chọn trạm nhận xe, xem danh sách trạm và số xe đang có sẵn.
2. Chọn một chiếc xe cụ thể; hệ thống giữ xe trong 30 phút.
3. Đến trạm A; nhân viên xác nhận, bàn giao và bắt đầu chuyến thuê.
4. Sử dụng xe, theo dõi thời gian thuê và vị trí GPS.
5. Chọn trạm B bất kỳ còn chỗ; nhân viên nhận xe và hoàn tất thanh toán.

**Phiên bản hiện tại không hỗ trợ đặt trước nhiều ngày.** Khách chỉ đặt xe đang có sẵn và phải đến nhận trong 30 phút.

## Trạng thái dự án

Mốc lịch sử 20/10/2026: repo khi đó ở giai đoạn thiết kế và chuẩn bị triển khai. Mô tả này không còn đại diện cho toàn bộ trạng thái mã nguồn hiện tại.

Cập nhật backend ngày 30/10/2026: đã khởi tạo FastAPI với `GET /api/v1/health` và Swagger tại `/docs`. Xem [hướng dẫn cài đặt và chạy backend](backend/README.md).

Cập nhật xác thực backend ngày 06/11/2026: đã triển khai cơ chế **Rolling Session và Refresh Token Rotation** phía backend (`POST /api/v1/auth/login`, `/auth/refresh`, `/auth/logout`, `/users/me/change-password`, thu hồi phiên khi khóa tài khoản, kiểm thử tự động trên PostgreSQL 16). Xem chi tiết tại [backend/README.md](backend/README.md), [docs/api-contract.md](docs/api-contract.md).
Xem [quy tắc nghiệp vụ](docs/requirements.md).

Cập nhật backend 13/11/2026: đã hoàn thiện các luồng thuê/trả thường, ví demo,
khuyến mãi, ticket/ảnh, bảo trì, GPS mô phỏng, review, 12 FAQ có nguồn, 3 API báo
cáo doanh thu/tài chính (`/api/v1/analytics/*`), danh sách cần kiểm tra 24 giờ
(`/api/v1/rental-check-ins`) và phân hệ sự cố/bồi thường ngoài hệ thống thu gọn
(`POST /compensation/external-settlement`, quyết toán thuê/cọc tách biệt, dùng chung
`/maintenance-orders`). Xem [hợp đồng API](docs/api-contract.md) và [kiến trúc hệ thống](docs/architecture.md).


## Cấu trúc dự án

Thư mục repository hiện tại là thư mục gốc của EVRide; không cần tạo thêm thư mục `evride/` lồng bên trong.

Cây dưới là định hướng tổ chức ban đầu. Code backend thực tế hiện dùng
`app/api/v1/`, `app/schemas/`, `app/services/`, `app/models.py` và
`app/database.py`; migration/seed/query nằm trong `backend/database/`.
Không tạo nguồn migration thứ hai ở thư mục database ngoài backend.

```text
evride/
├── backend/
│   ├── app/
│   │   ├── api/v1/             # Tập hợp các router API
│   │   ├── core/               # Cấu hình, bảo mật, logging
│   │   ├── db/                 # Kết nối và session PostgreSQL
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── stations/
│   │   │   ├── vehicles/
│   │   │   ├── bookings/
│   │   │   ├── trips/
│   │   │   ├── wallets/
│   │   │   ├── maintenance/
│   │   │   └── analytics/
│   │   └── shared/
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── .env.example
│   └── README.md
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── stations/
│   │   │   ├── vehicles/
│   │   │   ├── bookings/
│   │   │   ├── trips/
│   │   │   ├── wallets/
│   │   │   └── admin/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── styles/
│   │   └── utils/
│   ├── tests/
│   ├── .env.example
│   └── README.md
├── database/
│   ├── migrations/
│   ├── seeds/
│   ├── queries/
│   └── README.md
├── deploy/
│   ├── docker/
│   ├── nginx/
│   ├── scripts/
│   └── README.md
├── docs/
│   ├── README.md
│   ├── requirements.md
│   ├── v1-decisions.md
│   ├── architecture.md
│   ├── api-contract.md
│   ├── database.md
│   ├── ER_diagram.pdf
│   ├── dac_ta_quan_tri_bao_cao.md
│   ├── ke_hoach_kiem_thu.md
│   └── ke_hoach_ha_tang.md
├── README.md
├── AI_USAGE.md
├── .editorconfig
└── .gitignore
```

Các thư mục chưa có mã nguồn được để trống. Git chỉ lưu các thư mục khi bên trong có file được theo dõi.

## Bắt đầu phát triển

1. Đọc [phạm vi chức năng](docs/requirements.md) và [kiến trúc dự kiến](docs/architecture.md).
2. Chạy FastAPI theo [backend/README.md](backend/README.md); phát triển frontend theo hướng dẫn trong `frontend/`.
3. Dùng SQLAlchemy/PostgreSQL và Alembic hiện có; lịch sử schema ở `backend/database/migrations/`. Kiểm tra heads/current trước khi chuẩn bị revision mới.
4. Cấu hình môi trường, sau đó triển khai từng luồng nghiệp vụ và kiểm thử tương ứng.


## Tài liệu theo từng phần

| Phần | Tài liệu |
| --- | --- |
| Backend và các module nghiệp vụ | [backend/README.md](backend/README.md) |
| Frontend và các feature | [frontend/README.md](frontend/README.md) |
| Migration, dữ liệu mẫu và truy vấn | [backend/database/README.md](backend/database/README.md) |
| Cấu hình triển khai | [deploy/README.md](deploy/README.md) |
| Kiến trúc, chức năng và API | [docs/README.md](docs/README.md) |
| Ghi nhận hỗ trợ từ AI | [AI_USAGE.md](AI_USAGE.md) |
