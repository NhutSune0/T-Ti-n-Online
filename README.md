# ⚔ TU TIÊN ONLINE — Game online thật (multiplayer thời gian thực)

Game tu tiên 2D **online thật**: nhiều người cùng chơi chung một thế giới,
nhìn thấy nhau di chuyển, đánh quái, dùng kỹ năng và chat theo thời gian thực.
Đồ họa sprite AI phong cách hắc ám huyền huyễn.

## Cách chơi
| Phím | Hành động |
|---|---|
| WASD / mũi tên | Di chuyển |
| Chuột trái / J | Đánh thường (theo hướng chuột) |
| 1 / 2 / 3 | Kỹ năng: Kiếm Khí · Lôi Kích · Kim Chung Hộ Thể |
| Q / E | Uống Hồi Huyết Đan / Hồi Linh Đan |
| I / C / B / T | Túi đồ · Nhân vật · Cửa hàng · Bảng xếp hạng |
| Enter | Chat kênh thế giới |

## Hệ thống game
- **6 bản đồ** từ tân thủ đến cao cấp: Tân Thủ Thôn → Rừng Sói Bóng Đêm →
  Hang Ác Ma Sừng → Chiến Trường Xương Khô → Động Cửu Vĩ → Núi Golem Dung Nham,
  qua lại bằng **cổng dịch chuyển** (phím F), map cao yêu cầu cấp tối thiểu
- **Cốt truyện**: phim mở đầu khi tạo nhân vật mới + lời thoại NPC dẫn dắt
  hành trình phong ấn Ma Đế
- **Nhiệm vụ**: 5 nhiệm vụ chính theo chuỗi (Sói Hoang → Hang Động → Xương Trắng →
  Cửu Vĩ Yêu Hồ → Golem Cổ Đại, thưởng cả trang bị đặc biệt) + 1 nhiệm vụ săn
  quái lặp lại; bấm E gần NPC (có dấu ! vàng) để nhận/trả
- **Thuộc tính nhân vật**: mỗi cấp +5 điểm, cộng vào Lực (công), Thể (máu),
  Mẫn (chí mạng/né), Linh (linh lực/sát thương skill) — phím C
- **Boss có kỹ năng**: Hồ Ly Chín Đuôi dùng "Hồ Vĩ Quét", Golem Dung Nham dùng
  "Dung Nham Bùng Nổ" — vòng đỏ cảnh báo trước, né ra ngoài để tránh sát thương lớn
- **Rớt đồ & trang bị**: quái rớt vũ khí/áo giáp 4 độ hiếm (Thường → Huyền Thoại),
  bấm vào đồ trong túi để mặc, bán lấy linh thạch
- **Cửa hàng**: mua Hồi Huyết Đan / Hồi Linh Đan bằng linh thạch
- **Lưu nhân vật**: cấp độ, bản đồ, đồ đạc, linh thạch được lưu lại — thoát ra vào lại
  vẫn còn (kể cả khi tắt server)
- **Bảng xếp hạng**: top 10 cao thủ theo cấp độ
- **Âm thanh**: hiệu ứng tổng hợp theo hành động (có nút tắt/mở 🔊)
- **Minimap**: xem vị trí người chơi, quái và boss

Đánh quái lên cấp (Lv), quái mạnh dần theo khu vực: Sói Bóng Đêm → Ác Ma Sừng →
Chiến Binh Xương Khô → Boss Hồ Ly Chín Đuôi / Golem Dung Nham.

## Chạy thử trên máy (localhost)
```bash
cd game-online
npm install
npm start
# Mở trình duyệt: http://localhost:3000
# Mở 2 tab để thấy 2 nhân vật cùng chơi với nhau
```

## Deploy lên mạng (miễn phí, có link cho nhiều người chơi)

### Cách 1: Render.com (khuyên dùng)
1. Đẩy thư mục `game-online` lên GitHub (tạo repo mới, upload toàn bộ file).
2. Vào [render.com](https://render.com) → đăng nhập bằng GitHub → **New +** → **Web Service**.
3. Chọn repo vừa đẩy. Thiết lập:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Gói **Free** là đủ.
4. Bấm **Create Web Service**, đợi 2–3 phút → nhận link dạng
   `https://tu-tien-online.onrender.com` → gửi bạn bè vào chơi chung!

> Lưu ý gói free: server "ngủ" sau 15 phút không ai chơi, người đầu tiên vào
> sẽ phải đợi ~30 giây để nó tỉnh dậy.

### Cách 2: Railway.app
1. Vào [railway.app](https://railway.app) → New Project → Deploy from GitHub repo.
2. Railway tự nhận `npm start`. Nhận link public → chơi.

### Cách 3: VPS riêng (mạnh nhất, online 24/7)
```bash
# Trên VPS Ubuntu:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
git clone <repo-cua-ban> && cd game-online
npm install
# Chạy nền bằng pm2:
sudo npm i -g pm2 && pm2 start server.js --name tu-tien && pm2 save
```

## Cấu trúc code
```
game-online/
├── server.js          # Server: WebSocket, AI quái, combat, chat, chống hack tốc độ
├── package.json
└── public/
    ├── index.html     # Giao diện: login, HUD, bảng skill, chat
    ├── style.css
    ├── game.js        # Client: canvas, sprite AI (tách nền), hiệu ứng donghua
    └── sprites/       # 4 sprite sheet AI (nhân vật đi/đánh, quái, boss)
```

## Mở rộng tiếp (gợi ý)
- Thêm bản đồ mới, quái mới: thêm sprite vào `public/sprites/`, khai báo trong `server.js` (`MONSTER_TYPES`, `SPAWNS`)
- Thêm kỹ năng: khai báo trong `SKILLS` (server) + hiệu ứng vẽ trong `game.js`
- Lưu nhân vật lâu dài: gắn thêm database (MongoDB/SQLite) thay vì RAM hiện tại
