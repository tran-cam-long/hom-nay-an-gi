# Cách tiếp cận dữ liệu và kiến trúc nguồn dữ liệu cho ứng dụng

Dưới đây là cách tiếp cận dữ liệu (data acquisition) và kiến trúc nguồn dữ liệu cho ứng dụng của anh, tập trung vào thực tế Sài Gòn, tránh quán "tourist trap", và xây được hệ thống điểm uy tín riêng thay vì phụ thuộc API bên thứ ba.

Tôi sẽ đi theo logic từ nguồn → thu thập → chuẩn hóa → kiểm soát chất lượng, chưa bàn sâu UI hay ML ở giai đoạn này.

## 1. Nguyên tắc nền tảng về dữ liệu (rất quan trọng)

Trước khi nói "lấy dữ liệu thế nào", cần thống nhất triết lý dữ liệu:

- **Ứng dụng sở hữu dữ liệu quán ăn**: Không phụ thuộc runtime vào Google / Foody / API bên ngoài. Bên thứ ba chỉ là nguồn seed + tín hiệu.
- **Dữ liệu được phân tầng**:
  - Core data: quán, địa chỉ, quận, món chính, tầm giá.
  - Signals: comment, bài đăng, lượt nhắc đến, sentiment, độ đa dạng.
  - Derived scores: điểm uy tín, điểm phù hợp người dùng.
- **Chấp nhận dữ liệu "không hoàn hảo" ban đầu**: Quan trọng là cơ chế làm sạch + cập nhật + tự hiệu chỉnh.

## 2. Các nguồn dữ liệu khả thi (theo mức độ "địa phương")

### 2.1 Google Maps – nguồn seed ban đầu (KHÔNG phải nguồn quyết định)

- **Dùng để làm gì**:
  - Lấy: Tên quán, Địa chỉ, Toạ độ, Loại hình (restaurant, food stall, street food).
  - Làm khung xương dữ liệu địa lý.
- **Cách dùng hợp lý**:
  - Crawl theo: Bounding box từng quận.
  - Query tiếng Việt: "quán cơm", "bún bò", "hủ tiếu", "quán ăn".
  - Không dùng rating Google làm điểm uy tín chính.
- **Lý do**:
  - Google Maps: Nhiều quán bị seeding review, Dễ bị bias bởi khách nước ngoài. Nhưng địa chỉ & tọa độ khá chính xác.
- **👉 Kết luận**: Google Maps = danh bạ thô.

### 2.2 Diễn đàn nội địa (voz, tinhte, reddit VN) – nguồn "chất"

- **Ví dụ nguồn**:
  - voz.vn (box ăn uống, chuyện đời sống).
  - Reddit: r/VietNam, r/saigon.
  - Group Facebook công khai (chỉ đọc).
- **Giá trị**:
  - Ngôn ngữ tự nhiên, nhiều opinion thật.
  - Có tranh luận, phản biện.
  - Ít quảng cáo trá hình hơn TikTok.
- **Dữ liệu có thể trích**:
  - Tên quán được nhắc.
  - Ngữ cảnh nhắc (khen / chê / trung lập).
  - Món ăn được đề cập.
  - Mức giá (từ ngữ như: rẻ, mắc, sinh viên, hơi chát).
- **Cách triển khai**:
  - Crawl thread.
  - NLP tiếng Việt: NER: nhận diện tên quán, Context window: sentiment quanh tên quán.
  - Map về quán trong DB bằng fuzzy matching.
- **👉 Đây là nguồn cộng điểm uy tín cực tốt**.

### 2.3 TikTok – nguồn tín hiệu xã hội (KHÔNG phải nguồn sự thật)

TikTok không dùng để "tin", mà dùng để phát hiện bất thường.

- **Lấy gì từ TikTok**:
  - Video review quán.
  - Comment: Độ đa dạng người comment, Comment hỏi địa chỉ, giá, Reply của chủ quán.
- **Các chỉ số anh đã nêu rất hợp lý**:
  - Nhiều video quảng cáo + comment giống nhau → trừ điểm.
  - Quán được hỏi nhiều trong comment → cộng điểm.
  - Reply tích cực, cụ thể → cộng nhẹ.
  - Comment "PR lộ liễu" → trừ mạnh.
- **Kỹ thuật**:
  - Crawl metadata (không cần video).
  - Phân tích: Entropy của comment, Repetition rate, Account age / pattern.
- **👉 TikTok = tín hiệu nhiễu, nhưng rất giá trị nếu xử lý đúng**.

### 2.4 Dữ liệu do người dùng tạo (UGC) – nguồn sống lâu dài

Ngay từ đầu cần thiết kế để người dùng bổ sung dữ liệu.

Không phải review kiểu sao mà là:

- "Ăn món gì".
- "Giá khoảng bao nhiêu".
- "Quay lại hay không".
- "Ăn lúc nào (sáng/trưa/tối/khuya)".

**Điểm quan trọng**: Người dùng không thấy điểm uy tín. Điểm uy tín là hệ thống nội bộ, tránh bị thao túng.

## 3. Chuẩn hóa & quản lý quán ăn trong hệ thống

### 3.1 Định danh quán (Restaurant Identity)

Mỗi quán cần:

- restaurant_id nội bộ.
- Tên chuẩn hóa + alias.
- Địa chỉ text.
- Quận (theo quận cũ trước sáp nhập).
- Toạ độ.

Quận nên là enum nội bộ: Q1, Q3, Q5, Bình Thạnh, Phú Nhuận… Không phụ thuộc dữ liệu hành chính nhà nước realtime.

### 3.2 Mô hình dữ liệu quán (đề xuất)

```
Restaurant
- id
- name
- aliases[]
- district
- lat, lng
- price_range (min, max)
- cuisine_tags[]
- ambiance_tags[]
- credibility_score (float)
- data_sources {google, voz, tiktok, user}
- last_updated
```

## 4. Xây dựng "điểm uy tín" (credibility score)

Điểm này không lấy từ 1 nguồn, mà là hàm tổng hợp.

Ví dụ khung tính:

```
credibility =
  w1 * forum_sentiment_score
+ w2 * comment_diversity_score
+ w3 * user_return_rate
+ w4 * owner_interaction_quality
- w5 * advertising_signal
```

Quan trọng:

- Không bao giờ để điểm = 0 hoặc 100 tuyệt đối.
- Có decay theo thời gian.

## 5. Lộ trình thu thập dữ liệu thực tế (khuyến nghị)

### Giai đoạn 1 – Seed (1–2 tuần)
- Crawl Google Maps theo quận.
- Lấy ~5.000–10.000 quán.
- Chuẩn hóa địa chỉ.

### Giai đoạn 2 – Enrich (1 tháng)
- Crawl voz + reddit.
- Map mention → quán.
- Gán sentiment.

### Giai đoạn 3 – Signal noise (song song)
- Crawl TikTok metadata.
- Chỉ tính signal, không tin nội dung.

### Giai đoạn 4 – User feedback
- Ra bản MVP.
- Thu dữ liệu hành vi.

## 6. Kết luận ngắn gọn

Dữ liệu ban đầu nên lấy như sau:

- Google Maps → xương sống địa lý.
- Diễn đàn nội địa → chất lượng & uy tín.
- TikTok → phát hiện PR & độ phổ biến.
- Người dùng → cá nhân hóa & điều chỉnh điểm.

Nếu anh muốn, bước tiếp theo tôi có thể:

- Thiết kế schema DB chi tiết.
- Viết pseudo-code thuật toán xếp hạng.
- Hoặc đề xuất kiến trúc crawler + NLP tiếng Việt cho bài toán này.
