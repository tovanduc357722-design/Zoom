# HealthConnect

Nền tảng khám bệnh trực tuyến — **bản phát triển DEMO**, chưa dùng cho bệnh nhân thật. Repo được tạo từ trống theo ưu tiên trong tài liệu yêu cầu: Foundation và lõi Realtime Calling trước; giao diện bệnh nhân/bác sĩ tối thiểu để kiểm chứng luồng. Chưa có Zoom thật, audio/video, clinical records, appointments hoặc admin dashboard.

## Chạy phát triển

Yêu cầu Node >=22 (đã kiểm tra Node 24), npm, Docker Compose. Dùng checkout hiện có; cloud task đã cách ly, không cần Git worktree.

```sh
# Tại /workspace/Zoom
[ -f .env ] || cp .env.example .env
npm ci
npm run db:generate
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Web ở cổng 3000, API 4000. Kiểm tra nội bộ `curl -fsS http://localhost:3000/api/v1/health` phải trả `status: ok`, `video: DEMO`. Swagger tại đường dẫn `/api/docs` của API (qua web cũng truy cập được). Biến WEB_ORIGIN mặc định `http://localhost:3000`; nếu truy cập từ origin khác phải cấu hình đúng và khởi động lại API.

`.env.example` chỉ chứa mật khẩu local development, không chứa Zoom credentials. Không dùng các giá trị này ở production. Các biến DATABASE_URL, PORT, WEB_ORIGIN, CALL_TIMEOUT_SECONDS, PRESENCE_TIMEOUT_SECONDS, ZOOM_PROVIDER được đọc ở backend. `.env` không được commit; cấu hình process có ưu tiên cao hơn file.

Prisma 7 + official pg adapter không cần native query engine. `db:generate` gọi generator WASM từ các package Prisma được pin cùng phiên bản; đây là API nội bộ, phải kiểm tra lại helper khi nâng cấp Prisma. `db:migrate` áp dụng SQL trong transaction với advisory lock và checksum, ghi `_healthconnect_migrations`. **Không trộn `prisma migrate deploy` vào database này** vì dùng ledger riêng. File SQL đầu tiên do Prisma WASM sinh, bổ sung unique partial indexes chống trùng active calls. Không sửa migration đã áp dụng; thêm migration mới.

Redis chạy để chuẩn bị hạ tầng; lõi hiện tại chỉ dùng PostgreSQL và Socket.IO một instance. Không cần Zoom credentials để chạy DEMO.

## Thử luồng gọi

| Vai trò | Email | Mật khẩu local DEMO |
|---|---|---|
| Bệnh nhân | patient@demo.vn | DemoHealth@2026 |
| Bác sĩ | doctor@demo.vn | DemoHealth@2026 |
| Admin cơ sở (chưa có dashboard admin) | admin@demo.vn | DemoHealth@2026 |

Mở hai hồ sơ trình duyệt/phiên riêng: đăng nhập bác sĩ và bật Online; ở bệnh nhân chọn Gọi bác sĩ. Bác sĩ nhận yêu cầu và chấp nhận/từ chối; bệnh nhân có thể hủy. Timeout mặc định 30 giây. Sau accept, hai bên vào phòng **DEMO không có video/audio**. Bác sĩ kết thúc và tự bật Online lại. Ngắt kết nối không cho phép nhận thêm cuộc khi đã BUSY.

Seed có hai tenant, mỗi tenant một facility và bác sĩ/bệnh nhân riêng để test isolation. Các tài khoản hậu tố `1` thuộc tenant thứ hai. Mọi tên bệnh viện, bác sĩ và bệnh nhân là dữ liệu giả, không phải thông tin nghề nghiệp đã xác minh. Seed lặp lại không ghi đè user đã có.

## Kiểm tra

```sh
npm run lint
npm run typecheck
npm test
npm run build
# Cần npm run dev đang chạy ở terminal khác:
npm run test:e2e
```

API tests tự tạo database riêng `healthconnect_test` trên cùng PostgreSQL; user DB local cần quyền CREATEDB. Không trỏ tests vào server chứa dữ liệu thật. Suite dùng tài khoản seed và reset active calls trong database test. Browser tests thao tác các tài khoản DEMO của app đang chạy; không chạy trên deployment thật. Chromium Linux headless đóng gói qua npm (`@sparticuz/chromium`) được dùng để tránh phụ thuộc browser download domain; tắt single-process trong test để context thực sự tách cookies. Cần môi trường cho phép spawn Chromium. Playwright screenshots/results ở `test-results/` và được ignore.

## Cấu trúc

- `apps/api/src`: auth, quyền truy cập, call state machine, REST và Socket.IO.
- `apps/web`: giao diện tiếng Việt responsive, Tailwind và Button kiểu shadcn.
- `prisma`: schema, SQL migration và seed idempotent.
- `scripts`: codegen, migration và runner test DB riêng.
- `tests`: API/DB/realtime và browser E2E.
- [Kiến trúc, phạm vi và giới hạn](docs/ARCHITECTURE.md).
- [Sơ đồ trạng thái cuộc gọi](docs/CALL_STATES.md).
- [API và events](docs/API.md).
- [Điều kiện tích hợp Zoom thật](docs/ZOOM_INTEGRATION.md).
- [Backup / restore local](BACKUP.md).
- [Trạng thái kiểm chứng](docs/STATUS.md).

Không có production deployment trong giai đoạn này. Chưa đánh giá bảo mật/pháp lý cho dữ liệu sức khỏe, chưa có TLS deployment, file storage, outbox, multi-instance adapter hoặc giám sát production.
