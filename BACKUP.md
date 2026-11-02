# Backup local PostgreSQL

Chỉ dùng cho môi trường phát triển; snapshot của môi trường không thay thế backup database, đặc biệt dữ liệu trong Docker volumes.

Từ root repo, tạo file backup trong thư mục riêng nằm ngoài Git:

```sh
mkdir -p /workspace/healthconnect-backups
docker compose exec -T postgres pg_dump -U healthconnect -Fc healthconnect > /workspace/healthconnect-backups/healthconnect.dump
```

Kiểm tra archive (không ghi đè DB):

```sh
docker compose exec -T postgres pg_restore --list < /workspace/healthconnect-backups/healthconnect.dump
```

Restore vào database mới để tránh ghi đè dữ liệu đang có:

```sh
docker compose exec -T postgres createdb -U healthconnect healthconnect_restore
docker compose exec -T postgres pg_restore -U healthconnect -d healthconnect_restore --exit-on-error < /workspace/healthconnect-backups/healthconnect.dump
```

Đổi DATABASE_URL sang database restore rồi kiểm tra dữ liệu trước khi sử dụng. Không dùng dữ liệu bệnh nhân thật trong DEMO; triển khai thật cần mã hóa, lưu backup an toàn, phân quyền và diễn tập phục hồi định kỳ.
