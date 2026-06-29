# Backend API — GDDA Shop (QuangHưng Mobile)

## Cấu trúc thư mục
```
backend/
├── config/         # database, passport
├── routes/         # API endpoints (auth, products, cart, orders, payment, …)
├── services/       # cronJobs, emailService, warrantyService
├── migrations/     # SQL migrations
├── server.js       # Entry point
└── package.json
```

## Cài đặt
```bash
cd backend
npm install
```

## Chạy server
```bash
npm start          # production-style
npm run dev        # nodemon (dev)
```

## Biến môi trường

Tạo file `backend/.env` (đã được `.gitignore`).

### Bắt buộc khi `NODE_ENV=production`
Thiếu bất kỳ biến nào dưới đây → server từ chối khởi động:

| Biến                | Mục đích                                            |
|---------------------|------------------------------------------------------|
| `DB_PASSWORD`       | Mật khẩu MySQL                                       |
| `JWT_SECRET`        | Bí mật ký session cookie                             |
| `MOMO_SECRET_KEY`   | Khoá ký HMAC cho MoMo Payment Gateway                |
| `MOMO_ACCESS_KEY`   | Access key MoMo                                      |

Khi `NODE_ENV` khác (dev): default sẽ được dùng kèm cảnh báo `WARN` trên console.

### Khuyến nghị (mọi môi trường)

| Biến                  | Default               | Ghi chú                                                            |
|-----------------------|-----------------------|--------------------------------------------------------------------|
| `NODE_ENV`            | (none)                | `production` để bật secure cookie + ẩn debug log                   |
| `DB_HOST`             | `localhost`           |                                                                    |
| `DB_PORT`             | `3306`                |                                                                    |
| `DB_USER`             | `root`                |                                                                    |
| `DB_NAME`             | `QHUNG`               |                                                                    |
| `PORT`                | `3000`                |                                                                    |
| `ALLOWED_ORIGIN`      | (chuỗi rỗng)          | CSV các origin frontend được phép POST/PUT/DELETE                  |
| `ADMIN_TOKEN`         | (none)                | Token gọi `/api/reload-vectorstore` của rag_service                |
| `GOOGLE_CLIENT_ID`    | (none)                | OAuth Google                                                       |
| `GOOGLE_CLIENT_SECRET`| (none)                | OAuth Google                                                       |
| `GOOGLE_CALLBACK_URL` | `http://.../callback` |                                                                    |
| `EMAIL_USER`          | (none)                | Gmail SMTP user                                                    |
| `EMAIL_PASS`          | (none)                | Gmail app password                                                 |
| `GROQ_API_KEY`        | (none)                | LLM Groq (rag_service)                                             |

## Bảo mật đã được gia cố (audit 2026-06)

- Session cookie: `secure: true` khi `NODE_ENV=production`, `httpOnly`, `sameSite: lax`.
- Origin/Referer check ở mọi POST/PUT/PATCH/DELETE `/api/*` (CSRF defense; whitelist `ALLOWED_ORIGIN`).
- `forgot-password` không tiết lộ email tồn tại hay không (chống enumeration).
- OAuth Google: validate `state` query khớp session để chặn CSRF callback.
- Voucher claim dùng `SELECT … FOR UPDATE` + `UPDATE … WHERE so_luong_da_dung < so_luong` để chống race.
- Giảm tồn kho atomic (`WHERE so_luong_ton >= ?`) để chống oversell.
- Reviews: userId lấy từ session, không trust body; vẫn yêu cầu đã mua hàng.
- Multer chỉ nhận MIME ảnh thật (loại bỏ `octet-stream`, SVG); giới hạn 5MB.
- OTP log + raw error message bị gate sau `NODE_ENV !== 'production'`.
- MoMo / DB password fail-fast trong production nếu thiếu env.

## Hiệu năng

- Cart cleanup: gộp query thay vì N+1.
- Recommend cold-start: fallback trending (bestseller × view) thay vì danh sách rỗng.
- Chatbot circuit breaker: 3 lần fail liên tiếp → skip RAG service 30s, dùng Groq trực tiếp.
- RAG knowledge cache TTL 60s (giảm từ 300s).

## Lưu ý vận hành

- File `error_log*.txt`, `output_log*.txt`, `result*.txt`, `server_log.txt`, `test.log` đã được thêm vào `.gitignore`.
- `rag_service/main.py`: `/api/reload-vectorstore` yêu cầu header `X-Admin-Token` nếu `ADMIN_TOKEN` được set.

## Kết nối Frontend

Frontend (thư mục `../frontend`) được phục vụ tĩnh bởi `server.js` và gọi API qua `window.API_BASE_URL`. Mặc định:
- `localhost`/`127.0.0.1` → `http://localhost:3000/api`
- domain khác → `${location.origin}/api`

Khỏi cần đổi code khi deploy.
