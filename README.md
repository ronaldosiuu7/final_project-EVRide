# EVRide — Website cho thuê xe điện

EVRide là dự án website cho thuê xe điện theo trạm, với ví trả trước, quản lý chuyến đi, bảo trì và thống kê. Công nghệ định hướng: React, FastAPI và PostgreSQL.


## Cấu trúc dự án

Thư mục repository hiện tại là thư mục gốc của EVRide; không cần tạo thêm thư mục `evride/` lồng bên trong.

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
│   ├── architecture.md
│   ├── requirements.md
│   ├── api.md
│   └── README.md
├── README.md
├── AI_USAGE.md
├── .editorconfig
└── .gitignore
```

Các thư mục chưa có mã nguồn được để trống. Git chỉ lưu các thư mục khi bên trong có file được theo dõi.

## Bắt đầu phát triển

1. Đọc [phạm vi chức năng](docs/requirements.md) và [kiến trúc dự kiến](docs/architecture.md).
2. Khởi tạo ứng dụng FastAPI trong `backend/` và React trong `frontend/` theo hướng dẫn cấu trúc của từng phần.
3. Chọn thư viện truy cập PostgreSQL và công cụ migration; đặt lịch sử schema tại `database/migrations/`.
4. Cấu hình môi trường, sau đó triển khai từng luồng nghiệp vụ và kiểm thử tương ứng.


## Tài liệu theo từng phần

| Phần | Tài liệu |
| --- | --- |
| Backend và các module nghiệp vụ | [backend/README.md](backend/README.md) |
| Frontend và các feature | [frontend/README.md](frontend/README.md) |
| Migration, dữ liệu mẫu và truy vấn | [database/README.md](database/README.md) |
| Cấu hình triển khai | [deploy/README.md](deploy/README.md) |
| Kiến trúc, chức năng và API | [docs/README.md](docs/README.md) |
| Ghi nhận hỗ trợ từ AI | [AI_USAGE.md](AI_USAGE.md) |
