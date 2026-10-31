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

Cập nhật ngày 20/10/2026: repo đang ở giai đoạn thiết kế và chuẩn bị triển khai. Đã có tài liệu nghiệp vụ, thiết kế CSDL, kế hoạch kiểm thử và hạ tầng; chưa có mã ứng dụng backend/frontend, migration thực thi, kiểm thử tự động hay workflow CI/CD. Các chức năng nêu trên là phạm vi cần triển khai, chưa phải tính năng đã chạy được.

Cập nhật backend ngày 30/10/2026: đã khởi tạo FastAPI với `GET /api/v1/health` và Swagger tại `/docs`. Xem [hướng dẫn cài đặt và chạy backend](backend/README.md). Chưa triển khai đăng nhập hoặc nghiệp vụ thuê xe.

Xem [quy tắc nghiệp vụ](docs/requirements.md).


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
2. Chạy FastAPI theo [backend/README.md](backend/README.md); phát triển frontend theo hướng dẫn trong `frontend/`.
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
