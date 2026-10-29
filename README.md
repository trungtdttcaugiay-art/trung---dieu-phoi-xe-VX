# Việt Xô Transfer

Website điều phối xe đưa đón (4 xe 16 chỗ) của Phòng khám nha khoa quốc tế Việt Xô, Nha Trang. Node.js + Express + MySQL. Giao diện RU / VI / EN.

- Trang khách: `/` — giới thiệu, form đặt lịch đón khách (khách sạn → phòng khám) hoặc đưa khách về (phòng khám → khách sạn), có gợi ý khách sạn (bệnh nhân / ngoài trung tâm / vãng lai)
- Trang điều phối: `/admin/` — xem đơn, gán xe (chặn trùng lịch 2 giờ), đổi trạng thái, ghi phụ phí, quản lý xe & tài xế
- Thông báo đơn mới: Telegram, Zalo OA, Email (kênh nào có biến môi trường thì chạy)

## Chạy thử local

```bash
npm install
cp .env.example .env   # đặt ADMIN_PASSWORD, SESSION_SECRET
npm start              # http://localhost:3000
```

Nếu `DB_HOST` để trống, dữ liệu lưu tạm trong `data/store.json` (chỉ để thử). Production dùng MySQL.

## Danh sách khách sạn gợi ý

Sửa `public/js/hotels.js` (hai nhóm: trung tâm Nha Trang và Cam Ranh). Khách vẫn gõ tự do nếu khách sạn không có trong danh sách.

## Bản đồ và danh sách xe

Trang khách có Google Maps nhúng (không cần API key) cho phòng khám và các khách sạn gợi ý. Đặt địa chỉ phòng khám thật trong biến `CLINIC_MAP_QUERY`. Danh sách xe (biển số, tài xế, SĐT) nhập ở `/admin/` tab Xe & tài xế và hiện công khai trên trang khách; xe nào để trống biển số và tài xế thì không hiện. Trang admin có nút chỉ đường Google Maps cho từng đơn.

## Lịch trình đưa đón

Tab **Lịch trình đưa đón** ở `/admin/`: chọn ngày, hệ thống gom đơn cùng khu vực (trung tâm / Cam Ranh) lệch tối đa 30 phút vào một xe (tối đa 16 khách), xếp 7 xe không trùng giờ, rồi tạo link lộ trình Google Maps (phòng khám → các điểm đón → phòng khám). Đặt `GOOGLE_MAPS_API_KEY` (bật Directions API) để Google tự sắp thứ tự đón ngắn nhất và báo thời gian, quãng đường.

## Mã ID khách

Mỗi đơn có mã ID khách dạng `KHxxxxxx`, tạo từ số điện thoại nên khách quay lại giữ nguyên ID. Mã hiện ở thông báo, trang admin và màn hình xác nhận.

## Push lên GitHub

```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<tai-khoan>/viet-xo-transfer.git
git push -u origin main
```

## Deploy lên Hostinger (Business / Cloud — Node.js Web App)

1. hPanel → **Websites → Add website → Node.js Apps → Import Git Repository**, kết nối GitHub và chọn repo.
2. Framework: Express; Node version ≥ 18; Entry file `server.js`; lệnh start `npm start`.
3. hPanel → **Databases → MySQL**: tạo database + user, ghi lại tên/host/mật khẩu.
4. Trong cài đặt app → **Environment variables**: nhập các biến trong `.env.example` (`ADMIN_PASSWORD`, `SESSION_SECRET`, `DB_*`, `TELEGRAM_*`, ...). Không commit `.env`.
5. Deploy. Bảng MySQL tự được tạo ở lần chạy đầu. Bật SSL cho tên miền, truy cập `/admin/` để đăng nhập.
6. Mỗi lần `git push` lên `main`, bật auto-deploy (webhook) để Hostinger tự cập nhật.

## Telegram

Tạo bot với @BotFather → lấy token → thêm bot vào nhóm điều phối → lấy `chat_id` (gửi tin vào nhóm rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates`).




