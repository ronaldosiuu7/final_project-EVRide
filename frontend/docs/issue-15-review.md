# Review issue #15 — nhiệm vụ 9

Ngày 25/11/2026. Nhánh FE: `codex/fe-customer-integration`; đích tích hợp: `develop`.

**Chưa nghiệm thu hoàn tất issue #15.** Đã đọc checklist issue trên GitHub và kiểm tra code thay vì chỉ dựa vào file tiến độ. Người dùng chọn tự test demo; không tạo giao dịch/khách hàng/giấy tờ giả để báo thành công. Không merge PR backend, không chỉnh `backend/` hoặc `frontend-private/`.

## Sửa lỗi trong review

1. AuthProvider remount cây UI khi session/user/role thay đổi: xóa state form, dữ liệu query, modal, toast và blob ảnh cũ. Refresh token cùng phiên vẫn giữ state. Test component chứng minh chuyển hai CUSTOMER không giữ bản nháp riêng tư.
2. Hồ sơ gọi nhầm `updateCurrentUser` không tồn tại, khiến PATCH thành công nhưng UI báo lỗi. Đã dùng `updateSessionUser` và test luồng submit component.
3. Ví không nhận được APPROVED nếu đang lọc PENDING vì bản ghi biến mất. Đã tách việc tải số dư khỏi suy luận chuyển trạng thái danh sách: poll số dư/giao dịch/danh sách hiện tại mỗi 12 giây khi visible. Không cộng tiền ở client; không khẳng định số dư đã cập nhật trước khi GET hoàn tất. Poll bỏ qua query đang chạy, dừng khi unmount/ẩn tab.
4. Service nạp tiền mặc định cho gọi POST khi bỏ cờ compatibility. Đã đổi thành mặc định chặn, yêu cầu `=== true`, kiểm tra id/status/payment_mode của response.
5. Countdown quote giữ nguyên server_time của lần trả lời nên không giảm. Đã dùng đồng hồ bù offset đang chạy; thay mã/chuyến/trạng thái sẽ xóa quote cũ, version request chặn response trễ ghi đè quote mới.
6. Query lỗi đồng bộ hoặc AbortError còn active có thể treo loading. Đã đưa vào Promise catch và kết thúc loading; response của call cũ vẫn bị loại bằng callId.
7. API client không giới hạn origin của URL tuyệt đối. Đã chặn origin ngoài API và URL có credentials trước khi gửi bearer/cookie.
8. Modal dùng chung bổ sung giữ Tab/Shift+Tab trong hộp thoại và trả focus về phần tử mở hộp thoại khi đóng.
9. Chi tiết chuyến poll cả RESERVED/IN_RENT/RETURN_PENDING để theo dõi nhân viên bàn giao/tiếp nhận ngay khi khách vẫn mở tab. Không thay trạng thái nghiệp vụ bằng timer client.
10. Hồ sơ nhiều trang: không kết luận thiếu CCCD hợp lệ chỉ dựa trên trang đang xem; hiển thị cần kiểm tra thêm.
11. Đổi tiêu đề tab dùng chung thành tên dịch vụ khách hàng; thông báo dịch vụ nạp không khả dụng không còn nhắc cập nhật backend trên UI.

## Đối chiếu từng checklist issue

Quy ước: **Code/test** = đã kiểm tra implementation và test liên quan, còn cần nghiệm thu demo; **chưa kiểm chứng** = chưa có bằng chứng thực tế đầy đủ. Không đánh dấu Code/test thành hoàn tất nghiệp vụ.

| Mục gốc | Kết quả review / bằng chứng | Nghiệm thu còn lại |
| --- | --- | --- |
| 1.1 Base URL, service, envelope, pagination, ID/tiền/time | Code/test: apiClient, format, validation, service adapters | Payload DB demo |
| 1.2 Bearer, lỗi, timeout/abort, submit/idempotency | Code/test: apiClient, useApiQuery, useIdempotentMutation; retry giữ key/body | Mất mạng đúng lúc backend commit |
| 1.3 Register/login/logout/reload/password/guard/403/404 | Code/test: authSession/authBridge/App; browser login reload/admin redirect pass | Cookie thật, đổi mật khẩu, khóa account |
| 1.4 Token RAM, refresh HttpOnly, metadata | Code/test: authSession; metadata chỉ session_id/epoch/logging_out | Storage/cookie trong browser sau thao tác thật |
| 1.5 Credentials/CSRF/session/Locks/BroadcastChannel | Test auth nhiều manager với transport mô phỏng pass | Hai tab thật cạnh tranh refresh/login/logout |
| 1.6 Refresh/retry một lần, phiên thu hồi, password logout | Test 401 đúng failedToken và không logout nhầm phiên mới | Backend thật revoke/disable/reuse |
| 1.7 Bàn giao chung #16 | Hoàn thành tài liệu interface bên dưới; admin dùng cùng provider/client | Chưa tạo PR nền tảng trong nhiệm vụ này |
| 2.1 Hồ sơ, nộp/nộp lại, lý do/hạn giấy tờ | Code/test; sửa lỗi lưu tên qua auth context | Upload/duyệt/nộp lại thật |
| 2.2 Multipart, download JPEG/PNG/WebP ≤10 MiB | Code/test: fileBridge, ImageUploadField | Upload file thật và quyền download |
| 2.3 file_id, nội dung nhạy cảm, không cache dài hạn | Code/test; modal/Blob URL cleanup, boundary đổi account | Hai account truy cập file/giấy tờ khác chủ |
| 2.4 CCCD/tuổi, không coi PENDING là VERIFIED | Code/test: documentEligibility, hồ sơ và lỗi reserve | Các hồ sơ demo đủ/thiếu điều kiện; không kết luận thiếu điều kiện từ một trang giấy tờ, backend là quyết định cuối |
| 3.1 Layout, trạm/xe, lọc/phân trang, giờ/chỗ | Code/test: fleet pages/helpers; browser home hiển thị lỗi mạng hữu hạn | Dữ liệu nhiều trang và trạm mở qua đêm |
| 3.2 Pin/model/giá 30 phút/phút thêm/cọc | Code/test: fleetDisplay và detail, không suy giá ngày | Đối chiếu bảng giá demo |
| 3.3 Giữ xe cụ thể, điều kiện, snapshot/countdown | Code/test: ReserveVehicleModal/rentalHelpers | Hai khách cùng giữ xe, snapshot DB |
| 3.4 Hủy và xung đột/tiền/pin/hồ sơ/trạm/chuyến cũ | Code/test: error mapping, cancellation, retry | Các lỗi nghiệp vụ thật |
| 3.5 Tiến trình thuê/trả/kết thúc/sự cố | Code/test; poll trạng thái active, khách không bàn giao | Thao tác nhân viên #16 |
| 3.6 Thời gian/cước ước tính/GPS stale | Code/test: CustomerGpsSection, rentalHelpers | GPS demo, cập nhật cũ/mất dữ liệu |
| 3.7 Trạm trả/quote/quyết toán theo quyền | Code/test: ReturnQuoteSection; khách chỉ xem quote | Check-in/settle bởi STAFF/MANAGER |
| 4.1 Ví, nạp chờ duyệt, giao dịch phân trang | Code/test; test mounted filter PENDING → mất bản ghi vẫn GET ví | Tạo → duyệt/từ chối thật; migration #40 |
| 4.2 Ưu đãi/claim/mã của tôi/điều kiện | Code/test: CustomerPromotionsPage, promotionFinanceHelpers | Mã hết lượt/hết hạn/không phù hợp |
| 4.3 Quote 10 phút, cọc/thu thêm/hoàn dư | Code/test; mounted countdown 10:00 → 08:59 và đổi mã xóa quote | Hết hạn/quote stale khi nhân viên settle |
| 4.4 Lịch sử/hóa đơn/thanh toán từ backend | Code/test: RentalFinanceSection, invoice 404 vs 500/null vs 0 | Hóa đơn sau quyết toán thật |
| 5.1 Ticket/ảnh/tiến độ | Code/test: customer tickets/services | Tạo/upload/attach/nhân viên xử lý thật |
| 5.2 Sự cố/mốc dừng cước/chưa xác minh | Code/test: IncidentSummarySection/finance-summary | Intake/verify bởi nhân viên |
| 5.3 Tiền thuê/cọc/bồi thường/null vs 0 | Code/test: supportHelpers và finance sections | Số liệu DB sau xử lý sự cố |
| 5.4 Chuyến chưa giải quyết chặn thuê mới, vẫn hỗ trợ/nạp | Code/test: backend error mapping; route ví/hồ sơ/hỗ trợ không khóa theo trạng thái rental | Account/wallet/chuyến ở từng trạng thái |
| 5.5 Review một lần COMPLETED, không CLOSED_INCIDENT | Code/test: CustomerReviewSection, lỗi ALREADY_REVIEWED | Hai tab cùng submit review |
| 5.6 FAQ/chatbot/nguồn/no-match/lỗi nguồn | Code/test: FAQ, source text, service | Nguồn và chatbot backend thật |
| 6.1 UI chung/responsive/keyboard/labels/states | Desktop login screenshot + Tab focus pass; modal focus trap đã sửa | Responsive mobile và keyboard tất cả màn hình chưa kiểm chứng |
| 6.2 Test auth đa tab/reload/expired/logout/password/locked/retry | Test tự động pass; browser route reload pass | Nhiều tab/cookie/backend thật chưa kiểm chứng |
| 6.3 E2E với backend/demo và #16 | **Chưa kiểm chứng**: localhost:8000 từ chối kết nối | Người dùng tự chạy checklist dưới đây |
| 6.4 README/config/build/demo/giới hạn | Hoàn thành cập nhật README, API map, tiến độ và báo cáo này | Ghi kết quả nghiệm thu demo sau khi chạy |

Các tiêu chí nghiệm thu cuối issue:

- Build: pass. Route login reload và redirect admin khi anonymous: browser pass. Không đủ bằng chứng browser để chứng nhận toàn bộ storage/log sau đăng nhập.
- Luồng API thật và lỗi/chặn trùng: còn chờ demo, không kết luận từ mock.
- Countdown/tiền/xung đột: test pass; chờ đối chiếu số liệu backend thật.
- Bằng chứng: test tự động và kiểm tra browser cơ bản bên dưới; chưa có video/log E2E.
- API/auth/upload chung: admin/customer import cùng module; không sửa route admin trong review này. Chưa kiểm chứng vận hành #16 sau đăng nhập thật.

## Kiểm tra đã thực hiện

- `npm test`: **49/49 pass**, gồm 43 test trước review và 6 test mới (1 API security, 5 component lifecycle). Thêm trường hợp thiếu cờ compatibility vào test ví hiện có.
- `npm run build`: **PASS** sau các sửa lỗi review.
- Browser qua CUA tại `http://127.0.0.1:5173`: trang chủ lên và hiện lỗi kết nối thân thiện khi backend tắt; `/login` và reload lên form có nhãn; `/admin` khi anonymous chuyển `/login`; Tab focus hiển thị. Không giả login hoặc trả response thành công.
- Lần mở Vite trong sandbox timeout; chạy Vite ngoài sandbox truy cập được. Backend `localhost:8000/openapi.json` từ chối kết nối. Người dùng yêu cầu tự test nên không khởi động DB/backend hoặc tạo giao dịch.
- Test renderer không có layout browser và dùng fetch mock; auth unit dùng Locks/BroadcastChannel mô phỏng. Chưa nghiệm thu responsive/mobile, cookie thật, upload thật, toàn chu trình nhiều vai trò.

## Backend nạp tiền

[PR #40](https://github.com/ronaldosiuu7/final_project-EVRide/pull/40) **đã merge develop**, commit `b52ef8fde595129ed95707d1cf70849b7ffe9982`. Đã đối chiếu code router/schema tại commit này, không tự merge PR. Nhánh FE còn nền backend `61b1c9c`; dùng backend develop đã migrate `d7e4b2c9a105` trên DB demo riêng trước khi chạy.

POST topup nhận duy nhất amount string, Idempotency-Key; trả PENDING/DEMO, không ghi tăng ví ngay. STAFF/MANAGER duyệt mới sinh giao dịch và tăng số dư. Không có UI duyệt nạp #16 trong nhánh FE này; có thể dùng API demo có auth đúng vai trò, ghi rõ đó là API kiểm chứng thay UI.

## Bàn giao #16

<a id="ban-giao-16"></a>

- `apiRequest(path, { method, body, query, signal, timeoutMs, idempotencyKey, responseType })` trong `src/integrations/apiClient.js`. Trả `{data, meta, pagination, serverTime}`; lỗi `ApiError` có status/code/details. Không tự retry mutation khi timeout; giữ key và payload của thao tác chưa rõ kết quả. Chỉ auto refresh/retry một lần cho TOKEN_EXPIRED.
- `AuthProvider` duy nhất ở main; `useAuth()` có user/accessToken/sessionId/generation/isAuthenticated/isBootstrapping, login/register/logout/changePassword/refreshSession/**updateSessionUser**/hasRole. Guards `RequireRole`, `RequireAuth`, `GuestOnlyRoute`. Không tự cấu hình thêm client/đăng nhập admin thứ hai. Session boundary mới dọn cả UI #16 khi đổi tài khoản.
- `fileBridge`: `uploadEvidenceFile(file, {signal})` trả file_id READY; `downloadPrivateFileBlob(idOrPath, {signal})` trả blob/objectUrl/revoke. Dùng `ImageUploadField` + `PrivateImage`; không lưu token hoặc ảnh/giấy tờ trong storage. URL tuyệt đối ngoài origin API bị từ chối; dùng path tương đối cho proxy.
- `useApiQuery` abort stale calls, lỗi active kết thúc loading; `useIdempotentMutation` giữ key khi kết quả chưa xác định. `Modal` giữ focus bàn phím và trả focus khi đóng; props cũ giữ nguyên.
- Duyệt nạp: GET `/wallet-topup-requests?status=PENDING&page=1&page_size=20`, GET `/{id}`, POST `/{id}/approve` body `{}` hoặc POST `/{id}/reject` body `{reason}`, các POST có Idempotency-Key. Sau thành công reload yêu cầu/ví/giao dịch; không tự cộng số dư. CUSTOMER không dùng các endpoint vận hành này.
- Tiếp tục dùng route `/admin/*` đang có. Analytics mở rộng #16 vẫn là fixture được README đánh dấu, không tính là API thật đã nghiệm thu của #15.

## Checklist người dùng tự test demo

Chạy từ `frontend/`: `npm ci`, cấu hình `.env` dựa `.env.example` nếu chưa có, `npm test`, `npm run build`, `npm run dev`. Mở `http://localhost:5173/`; vận hành `/admin`. Dùng cùng hostname localhost và Origin/CORS đúng backend. Tài khoản/mật khẩu theo seed/backend của môi trường demo, không lấy mật khẩu production.

Mỗi bước ghi account role, thời gian, ID bản ghi, kết quả mong đợi/thực tế và ảnh lỗi đã che dữ liệu nhạy cảm.

1. Đăng ký/login, reload, sửa tên phải cập nhật header; nộp hai ảnh giấy tờ, nhân viên duyệt, kiểm tra hạn/tuổi và dữ liệu khác chủ bị chặn.
2. Ghi số dư ban đầu; gửi một yêu cầu nạp → Chờ xác nhận, số dư không đổi. Nhân viên dùng UI hoặc API demo approve; ghi rõ cách duyệt, request_id và transaction_id. Khách chờ poll → số dư và giao dịch cập nhật; thử đang lọc PENDING và trang >1. Từ chối yêu cầu khác → có lý do, không tăng ví. Thử bấm kép/mất mạng/retry không sinh giao dịch trùng.
3. Tìm xe → giữ xe → staff pickup → staff initiate-return → khách quote/chọn promotion → staff settle bằng quote hợp lệ. Đối chiếu cọc/tiền thuê/giảm/thu thêm/hoàn dư và ví. Thử xe vừa được người khác giữ, thiếu tiền, trạm đóng cửa, hết giữ chỗ, quote quá 10 phút. Không tự tạo thành công bằng state FE.
4. Xem lịch sử/hóa đơn, review COMPLETED một lần; review lại hoặc CLOSED_INCIDENT bị chặn. Null khác 0 trong sự cố.
5. Ticket và ảnh bằng chứng → staff xử lý → khách xem kết quả; FAQ nguồn/no-match/lỗi nguồn. Báo sự cố không tự dừng cước.
6. Hai tab cùng account: refresh/reload/logout/password/disable. Chuyển A sang B cùng CUSTOMER khi query/modal đang mở: không thấy dữ liệu A, response cũ không logout B. Kiểm tra localStorage chỉ metadata được phép, không có token/giấy tờ.
7. Mobile 360/390px, desktop, bàn phím Tab/Shift+Tab/Escape trong modal, nhãn/lỗi form, loading/empty/retry; đăng nhập STAFF/MANAGER kiểm tra các route #16.

Chỉ đóng issue sau khi bổ sung bằng chứng các mục chưa kiểm chứng và xử lý lỗi phát hiện trong demo.
