# API Phase 1

Base `/api/v1`; Swagger `/api/docs`. Cookie `hc_session` nhận từ login/register. Mọi mutation gửi `Content-Type: application/json` và `X-Requested-With: HealthConnect`; browser Origin phải bằng WEB_ORIGIN. Không lưu token trong localStorage.

| Method | Path                  | Payload / quyền                                                                  |
| ------ | --------------------- | -------------------------------------------------------------------------------- |
| GET    | /health               | Kiểm tra DB và chế độ DEMO                                                       |
| GET    | /facilities           | ID và tên cơ sở cho đăng ký; tối đa 100                                          |
| POST   | /auth/register        | email, password (12–128 ký tự), name, facilityId; luôn PATIENT                   |
| POST   | /auth/login           | email, password                                                                  |
| GET    | /auth/me              | Profile công khai của session                                                    |
| POST   | /auth/logout          | Thu hồi session                                                                  |
| GET    | /doctors              | Bác sĩ cùng tenant/facility; tối đa 50; không contact riêng                      |
| POST   | /doctors/availability | status: ONLINE/OFFLINE/BREAK; DOCTOR                                             |
| POST   | /doctors/heartbeat    | DOCTOR                                                                           |
| GET    | /calls                | Tối đa 50 call của người đăng nhập, mới nhất trước                               |
| POST   | /calls                | doctorId; PATIENT; bắt buộc header Idempotency-Key 8–100 ký tự chữ/số/gạch ngang |
| GET    | /calls/:id            | UUID; hai người tham gia                                                         |
| POST   | /calls/:id/accept     | Bác sĩ được chỉ định                                                             |
| POST   | /calls/:id/reject     | Bác sĩ được chỉ định                                                             |
| POST   | /calls/:id/cancel     | Bệnh nhân được chỉ định                                                          |
| POST   | /calls/:id/join       | Hai người tham gia, chỉ trạng thái cho phép                                      |
| POST   | /calls/:id/complete   | Bác sĩ được chỉ định                                                             |

HTTP 400 payload sai; 401 session sai/hết hạn; 403 role/CSRF sai; 404 resource không có quyền thấy; 409 state/unavailable; 429 quá số yêu cầu. Error không chứa stack trace hoặc lỗi provider gốc. POST thành công trả 201.

Socket path `/socket.io`, xác thực cùng cookie; frontend dùng polling transport qua Next proxy, server cũng hỗ trợ websocket. Events: `call:incoming`, `call:meeting_ready`, `call:started`, `call:rejected`, `call:cancelled`, `call:timeout`, `call:completed`, `call:failed`; payload chỉ `{id,state}`. Client lấy chi tiết qua REST sau event. `doctor:heartbeat` có acknowledgement. Session bị thu hồi bị disconnect; delivery kiểm tra lại session.
