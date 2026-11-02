# Zoom — chưa tích hợp thật

Hiện chỉ có `ZoomProvider` và `MockZoomProvider`. DEMO không tạo Zoom meeting, không có join URL, không sinh SDK signature và không gửi dữ liệu đến Zoom. Cấu hình khác `ZOOM_PROVIDER=mock` sẽ bị API từ chối khởi động để tránh nhầm là tích hợp thật.

Khi chuyển Phase 5, cần xác minh tài liệu Zoom hiện hành cho ứng dụng Server-to-Server OAuth và Meeting SDK Web, quyền/scopes, host user, cơ chế SDK authorization và domain, webhook signature và licensing/concurrency. Chưa xác định scopes hay endpoint trong bản này.

Các tên thông tin dự kiến cần cấu hình an toàn: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET; ZOOM_MEETING_SDK_KEY, ZOOM_MEETING_SDK_SECRET; ZOOM_WEBHOOK_SECRET_TOKEN; ZOOM_DEFAULT_HOST_USER_ID. Không gửi secret qua chat hoặc commit Git. Chỉ khai báo requirements sau khi xác minh loại app và cách sử dụng credential qua proxy; biến proxy placeholder không phải raw signing secret.

Cần tài khoản host và hai tài khoản/phiên test được cho phép. Chỉ bắt đầu viết RealZoomProvider sau khi những prerequisite này có đủ. Không giả định một host có thể chạy nhiều cuộc song song. Bản DEMO chưa cần bất kỳ Zoom credential nào.
