# Kiến trúc và phạm vi

Repo ban đầu chỉ có `.git`, không có commit hoặc thư viện cũ. Monorepo npm workspaces dùng Next.js / React / Tailwind / thành phần Button kiểu shadcn, NestJS REST / Socket.IO, PostgreSQL / Prisma. Node >=22, kiểm chứng trên Node 24. Một API instance, chưa Redis adapter hoặc jobs phân tán. Redis chỉ chuẩn bị hạ tầng cho giai đoạn sau.

## Dữ liệu / quyền

Tenant đại diện Sở Y tế; Facility thuộc Tenant. User có một role trong năm role đã định nghĩa, facility và tenant. `User` hiện chứa thông tin tối thiểu của bác sĩ hoặc bệnh nhân; chưa tách hồ sơ chuyên môn/clinical records. Các khóa ngoại composite chặn liên kết chéo tenant/facility trong Call. `Consultation` và `ZoomMeeting` truy xuất thông qua Call được cấp quyền; không có endpoint liệt kê meeting công khai.

Người dùng chỉ tìm/gọi bác sĩ trong cùng cơ sở (phạm vi bảo thủ của bản đầu). Chỉ PATIENT được tạo call, chỉ DOCTOR được cập nhật availability/accept/reject/complete. Chỉ hai người tham gia đọc/join call. Các role admin chưa có API quản trị hoặc quyền đọc clinical records. Người đăng ký mới luôn là PATIENT; payload role bị từ chối. Chưa có giao diện quản lý role.

Session opaque ngẫu nhiên 256 bit, chỉ lưu SHA-256 trong DB. Cookie HttpOnly, SameSite Strict, Secure trong production; hết hạn sau 8 giờ, logout thu hồi session. Không dùng JWT nên không có refresh-token rotation. Mật khẩu scrypt + salt riêng. Mutation yêu cầu X-Requested-With và kiểm tra Origin. Rate limiting in-memory cho một instance; login/register tối đa 10/phút/IP. Không hỗ trợ triển khai production sau reverse proxy cho đến khi cấu hình trust proxy chính xác.

## Đồng thời và phục hồi

Xem [CALL_STATES.md](CALL_STATES.md). Transaction khóa theo doctor rồi patient, unique partial indexes ngăn trùng active request. Tạo Call dùng Idempotency-Key. Mock meeting tạo một lần trong transaction; không gọi hệ thống ngoài trong transaction ở phase thật (sẽ cần outbox/job idempotent). Một worker kiểm tra DB mỗi giây; expiry không chỉ nằm trong RAM. Active call giữ BUSY khi restart; bác sĩ hoàn tất rồi bật ONLINE thủ công. Một session chưa join vẫn có thể complete để tránh kẹt trong DEMO.

REST là đường mutation duy nhất. Socket gửi event theo user room sau xác thực session; frontend đồng bộ lại qua REST khi reconnect và polling 10 giây dự phòng. Socket không nhận payload status từ client để sửa dữ liệu. Heartbeat từ REST hoặc doctor:heartbeat. Chưa triển khai tất cả tên client socket events trong master prompt.

## Các giai đoạn

- Nền tảng và lõi realtime: triển khai và có integration tests.
- Patient portal / Doctor dashboard: bản tối thiểu để đăng ký, đăng nhập, tìm theo tên/chuyên khoa, lọc Online, nhận/gọi, vào phòng DEMO, kết thúc và xem lịch sử. Chưa có profile chi tiết, lịch làm việc, appointments hoặc clinical records.
- Zoom thật: chưa triển khai. Không SDK signature hoặc fake Zoom URL. Mock chỉ tạo metadata và trạng thái, không truyền video/audio.
- Admin, records, appointments, thông báo đa kênh, S3, production deployment: hoãn theo ưu tiên tài liệu.

Rủi ro còn lại: cần đánh giá bảo mật độc lập, quản lý vòng đời dữ liệu, kiểm chứng pháp lý, TLS/backup/monitoring thật trước khi dùng dữ liệu sức khỏe. Không công nhận bản này đạt chuẩn production hoặc chứng nhận pháp lý.
