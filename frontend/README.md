# EVRide Frontend

Giao diện người dùng của hệ thống cho thuê ô tô điện theo trạm **EVRide**, được xây dựng bằng React và Vite.

## 1. Công nghệ sử dụng

- **React:** Xây dựng giao diện người dùng.
- **Vite:** Khởi chạy máy chủ phát triển và đóng gói ứng dụng.
- **npm:** Quản lý và cài đặt các thư viện cần thiết.

## 2. Yêu cầu trước khi chạy

Đảm bảo máy tính đã cài đặt:

- [Node.js](https://nodejs.org/) (nên sử dụng phiên bản LTS).
- npm (được cài đặt kèm theo Node.js).
- Git (nếu dự án được tải về từ Git repository).

Kiểm tra phiên bản bằng lệnh:

```bash
node -v
npm -v
```

## 3. Hướng dẫn chạy giao diện trên Localhost

### Bước 1: Mở Terminal

Di chuyển vào thư mục `frontend` từ thư mục gốc của dự án:

```bash
cd frontend
```

### Bước 2: Cài đặt thư viện

Chạy lệnh sau để cài đặt các thư viện được khai báo trong dự án:

```bash
npm install
```

### Bước 3: Khởi chạy ứng dụng

Chạy máy chủ phát triển bằng lệnh:

```bash
npm run dev
```

Sau khi khởi chạy thành công, mở trình duyệt và truy cập:

**http://localhost:5173**

Nếu Terminal hiển thị một địa chỉ khác, hãy sử dụng địa chỉ được Vite cung cấp.

## 4. Các trang chức năng

Sau khi ứng dụng khởi chạy, có thể truy cập các trang quản trị sau:

| Chức năng | Đường dẫn |
|---|---|
| Tổng quan Admin/Staff | [http://localhost:5173/admin](http://localhost:5173/admin) |
| Danh sách ô tô điện | [http://localhost:5173/admin/vehicles](http://localhost:5173/admin/vehicles) |
| Danh sách trạm | [http://localhost:5173/admin/stations](http://localhost:5173/admin/stations) |

Lưu ý: Các đường dẫn trên cần tương ứng với cấu hình routing thực tế của dự án.

## 5. Kiểm tra và xây dựng dự án

Sau khi cài đặt thư viện, thực hiện kiểm tra khả năng build của ứng dụng.

Nếu đang ở thư mục `frontend`, chạy:

```bash
npm run build
```

Nếu quá trình hoàn tất thành công, Vite sẽ tạo thư mục `dist` chứa các tệp đã được đóng gói để triển khai.

Tiếp theo, chạy lại giao diện trong môi trường phát triển:

```bash
npm run dev
```

Mở trang quản trị tại:

http://localhost:5173/admin

### Danh sách kiểm tra

- [ ] Trang tổng quan Admin/Staff hiển thị bình thường.
- [ ] Chuyển sang mục danh sách ô tô điện trên Sidebar.
- [ ] Chuyển sang mục danh sách trạm trên Sidebar.
- [ ] Các đường dẫn điều hướng hoạt động đúng.
- [ ] Mở Developer Tools bằng phím `F12`, kiểm tra tab **Console** để phát hiện lỗi JavaScript.
- [ ] Kiểm tra giao diện và dữ liệu hiển thị trên từng trang.

Lưu ý: Nếu các trang cần dữ liệu từ Backend, hãy đảm bảo Backend đã được khởi chạy và cấu hình API phù hợp.

## 6. Dừng máy chủ và dọn dẹp

Khi hoàn tất kiểm tra, quay lại Terminal đang chạy Vite và nhấn:

```text
Ctrl + C
```

Để xóa thư mục build `dist` nếu không còn cần sử dụng, chạy từ thư mục `frontend`:

```bash
rm -rf dist
```

Nếu muốn quay lại thư mục gốc của dự án, chạy:

```bash
cd ..
```

**Lưu ý:** Lệnh `rm -rf dist` dành cho Linux/macOS hoặc môi trường Git Bash. Trên Windows PowerShell, có thể sử dụng:

```powershell
Remove-Item -Recurse -Force dist
```

Chỉ xóa thư mục `dist` khi đã xác nhận không cần giữ lại bản build hiện tại.

## 7. Một số lỗi thường gặp

### Lỗi `npm: command not found` hoặc không nhận diện được npm

Cài đặt Node.js từ trang chính thức: https://nodejs.org/

Sau khi cài đặt, mở lại Terminal và kiểm tra phiên bản Node.js, npm.

### Lỗi thiếu thư viện

Đảm bảo đã di chuyển vào đúng thư mục `frontend`, sau đó chạy:

```bash
npm install
```

### Lỗi cổng 5173 đã được sử dụng

Vite có thể tự động chọn một cổng khác. Hãy kiểm tra địa chỉ được hiển thị trong Terminal.

### Lỗi khi chạy `npm run build`

Đọc thông báo lỗi trong Terminal để xác định tệp hoặc thành phần gây lỗi, sau đó sửa và chạy lại:

```bash
npm run build
```

---

**EVRide Frontend** — Giao diện quản lý hệ thống cho thuê ô tô điện theo trạm.
