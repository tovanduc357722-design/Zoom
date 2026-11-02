# Tình trạng triển khai

Bản phát triển ngày 02/11/2026. Không phải production readiness hoặc chứng nhận pháp lý.

- PostgreSQL 17 và Redis 7 khởi động khỏe qua Docker Compose.
- Migration và seed chạy lặp hai lần thành công, không ghi đè tài khoản.
- Script cài đặt đầy đủ (npm ci → codegen → DB → lint → typecheck → 12 tests → build API/web) đã chạy lại thành công. Sau đó khởi động lại dev và health qua API/web cùng Socket.IO polling đều thành công.
- API/realtime: 12 test thực thi trên PostgreSQL riêng, bao gồm auth, từ chối role injection, logout, tenant isolation, offline/busy, concurrency, duplicate accept, IDOR/join authorization, reject/cancel/timeout, mock failure, stale heartbeat, Socket auth/events/disconnect, khởi động lại application và giữ call state.
- UI tối thiểu có đăng ký/đăng nhập, tìm/lọc bác sĩ, trạng thái availability, gửi/nhận cuộc gọi, DEMO join, kết thúc và lịch sử. Browser E2E: 2/2 ca qua, gồm hai phiên bệnh nhân/bác sĩ hoàn tất realtime DEMO và viewport mobile không tràn ngang.
- Zoom thật, SDK signature/webhook chưa được triển khai và chưa test. Không có claim về API Zoom hoặc host licensing.
- Không có medical records, schedules, appointments hoặc dashboard quản trị. Những phase này chưa hoàn thành.

Các vấn đề môi trường đã xử lý: native Prisma download bị chặn → official version-pinned npm WASM generator/pg adapter; Turbopack worker không chạy được → Webpack; Socket.IO trailing slash bị Next redirect → addTrailingSlash=false ở client/server.

Đã lưu install_script, start_skill; bỏ domain binaries.prisma.sh vì giải pháp WASM không cần domain này. Cấu hình draft và publication là hai bước khác nhau. Setup hiện tại chưa chứng minh snapshot phục hồi trong task mới. User publish qua Environment settings sau khi review.
