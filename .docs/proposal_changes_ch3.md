# PHẦN NỘI DUNG SỬA ĐỔI VÀ BỔ SUNG CHO CHƯƠNG 3

Dưới đây là chi tiết các đoạn văn, bảng dữ liệu và phần sửa lỗi chính tả được soạn thảo sẵn. Bạn có thể copy trực tiếp các phần này để dán vào file Word báo cáo của mình.

---

## 1. SỬA CÁC LỖI CHÍNH TẢ & ĐỊNH DẠNG HỆ THỐNG

### Lỗi 1: Trùng lặp công thức tính điểm gợi ý (Mục 3.5)
*   **Vị trí:** Trong mục *Thiết kế mô hình tính điểm gợi ý sản phẩm*.
*   **Nội dung sửa lại:** Thay thế dòng bị lặp bằng công thức rõ ràng:
    > "Để kết hợp 3 thuật toán trên, hệ thống thực hiện chấm điểm cho từng sản phẩm theo công thức sau:
    > 
    > Tổng điểm (Score) = 0.5 × Điểm sở thích + 0.3 × Điểm lịch sử xem + 0.2 × Điểm mua kèm
    > 
    > Trong đó:
    > *   **Điểm sở thích (Tối đa 5.0 điểm):** Cộng điểm nếu sản phẩm khớp thương hiệu hoặc thuộc nhóm nhu cầu của khách hàng (Gaming, Camera...).
    > *   **Điểm lịch sử xem (Tối đa 3.0 điểm):** Cộng điểm dựa trên tần suất xem sản phẩm tương tự của khách hàng.
    > *   **Điểm mua kèm (Tối đa 2.0 điểm):** Cộng điểm nếu sản phẩm thường được mua chung với sản phẩm đang có trong giỏ hàng."

### Lỗi 2: Rác văn bản ở cuối mục API AI (Cuối mục 3.3.F)
*   **Vị trí:** Cuối đoạn mô tả `F. Nhóm API cho Trí tuệ nhân tạo (Chatbot & AI)`.
*   **Nội dung sửa lại:** Xóa cụm từ vô nghĩa `Quản gia. Điệu thoại trực tuyến của khách.` và chỉnh lại thành:
    > "...luồng dữ liệu đoạn chat của khách sẽ được API này hứng lấy, ném sang dịch vụ RAG viết bằng Python, chờ bot sinh câu trả lời bằng ngôn ngữ tự nhiên từ dữ liệu tri thức nội bộ, sau đó vác kết quả trả về hiển thị tại khung cửa sổ chat cho khách hàng."

### Lỗi 3: Các lỗi chính tả nhỏ
*   **Dòng 860:** Sửa `Hình 3.4 Sơ đồ User` thành `Hình 3.4 Sơ đồ Usecase hệ thống`.
*   **Dòng 864:** Sửa `nhần giảm nhẹ lượng công việc` thành `nhằm giảm nhẹ lượng công việc`.
*   **Dòng 872:** Sửa `giỏ hàng cửa người dùng` thành `giỏ hàng của người dùng`.
*   **Dòng 880:** Sửa `Sẽ Thêm sản phẩm mới` thành `Sẽ thêm sản phẩm mới`.
*   **Dòng 884:** Sửa `tin tức và khuyến mãi mới nhât` thành `tin tức và khuyến mãi mới nhất`.
*   **Dòng 962:** Sửa `giá rẻ (dưới 88 triệu đồng)` thành `giá rẻ (dưới 8 triệu đồng)`.

---

## 2. BỔ SUNG MỤC: THIẾT KẾ CƠ SỞ DỮ LIỆU CHI TIẾT
*(Bạn hãy tạo thêm một mục là **3.4. Thiết kế cơ sở dữ liệu chi tiết** nằm sau mục Thiết kế dữ liệu API hiện tại)*

### 3.4. Thiết kế cơ sở dữ liệu chi tiết
Dưới đây là cấu trúc chi tiết của các bảng dữ liệu cốt lõi trong hệ thống quản lý website bán hàng và gợi ý sản phẩm:

#### Bảng 3.1: Bảng Khách Hàng (khachhang)
Bảng này dùng để lưu trữ thông tin tài khoản và thông tin cá nhân của khách hàng đăng ký trên hệ thống.

| Tên trường | Kiểu dữ liệu | Khóa | Mô tả |
| :--- | :--- | :---: | :--- |
| `MaKH` | INT | PK | Mã khách hàng (Tự động tăng) |
| `HoTen` | VARCHAR(100) | | Họ và tên khách hàng |
| `SDT` | VARCHAR(15) | | Số điện thoại liên lạc |
| `Email` | VARCHAR(100) | Unique | Địa chỉ Email đăng nhập |
| `MatKhau` | VARCHAR(255) | | Mật khẩu tài khoản (Đã mã hóa Bcrypt) |
| `DiaChi` | VARCHAR(255) | | Địa chỉ giao hàng mặc định |
| `NgayTao` | DATETIME | | Ngày đăng ký tài khoản |

#### Bảng 3.2: Bảng Sản Phẩm (sanpham)
Lưu trữ thông tin cơ bản của các sản phẩm được bày bán tại cửa hàng.

| Tên trường | Kiểu dữ liệu | Khóa | Mô tả |
| :--- | :--- | :---: | :--- |
| `MaSP` | INT | PK | Mã sản phẩm (Tự động tăng) |
| `TenSP` | VARCHAR(150) | | Tên hiển thị của sản phẩm |
| `MaDM` | INT | FK | Liên kết tới danh mục sản phẩm (`danhmuc`) |
| `MaHang` | INT | FK | Liên kết tới thương hiệu sản xuất (`thuonghieu`) |
| `Gia` | DECIMAL(12,2)| | Giá bán gốc của sản phẩm |
| `GiaGiam` | DECIMAL(12,2)| | Giá khuyến mãi (nếu có) |
| `AnhDaiDien`| VARCHAR(255) | | Đường dẫn ảnh đại diện sản phẩm |
| `SoLuongTon`| INT | | Số lượng máy còn trong kho |
| `MoTa` | TEXT | | Bài viết mô tả thông số và tính năng máy |

#### Bảng 3.3: Bảng Cấu Hình Chi Tiết (chitietsanpham)
Lưu trữ thông số kỹ thuật chi tiết của điện thoại để phục vụ cho chatbot AI tư vấn và RAG.

| Tên trường | Kiểu dữ liệu | Khóa | Mô tả |
| :--- | :--- | :---: | :--- |
| `MaCTSP` | INT | PK | Mã cấu hình chi tiết (Tự động tăng) |
| `MaSP` | INT | FK | Mã sản phẩm liên kết (Quan hệ 1-1 với `sanpham`) |
| `ManHinh` | VARCHAR(100) | | Kích thước và công nghệ màn hình |
| `HeDieuHanh`| VARCHAR(100) | | Hệ điều hành (iOS, Android...) |
| `Camera` | VARCHAR(100) | | Độ phân giải camera trước và sau |
| `ChipXuLy` | VARCHAR(100) | | Chip xử lý của thiết bị |
| `RAM` | VARCHAR(50) | | Dung lượng bộ nhớ RAM |
| `ROM` | VARCHAR(50) | | Dung lượng bộ nhớ trong |
| `Pin` | VARCHAR(50) | | Dung lượng pin và công nghệ sạc |
| `MauSac` | VARCHAR(100) | | Màu sắc của sản phẩm |

#### Bảng 3.4: Bảng Sở Thích Khách Hàng (so_thich_khach_hang)
Lưu trữ các từ khóa sở thích hành vi của khách hàng phục vụ thuật toán gợi ý Content-Based.

| Tên trường | Kiểu dữ liệu | Khóa | Mô tả |
| :--- | :--- | :---: | :--- |
| `ma_st_kh` | INT | PK | Mã sở thích (Tự động tăng) |
| `ma_kh` | INT | FK | Liên kết tới khách hàng (`khachhang`) |
| `tu_khoa` | VARCHAR(100) | | Từ khóa sở thích (Ví dụ: 'Apple', 'Gaming') |
| `kieu_tao` | VARCHAR(50) | | Cách tạo sở thích ('manual' - tự chọn, 'auto' - tự rút trích) |
| `ngay_tao` | TIMESTAMP | | Thời điểm ghi nhận sở thích |

---

## 3. BỔ SUNG THUYẾT MINH CHO CÁC SƠ ĐỒ HOẠT ĐỘNG (Mục 3.4 cũ)
*(Bạn hãy dán các đoạn văn này dưới các hình vẽ tương ứng trong báo cáo)*

*   **Dưới Hình 3.6 (Sơ đồ đăng ký và đăng nhập):**
    > *"Sơ đồ mô tả quy trình kiểm tra bảo mật đầu vào. Khi khách hàng đăng ký, hệ thống gửi mã OTP xác thực qua email trước khi tạo tài khoản trong cơ sở dữ liệu. Khi đăng nhập, mật khẩu nhập vào sẽ được mã hóa để so khớp với dữ liệu đã lưu bằng thư viện Bcrypt, sau đó hệ thống sinh mã JSON Web Token (JWT) để duy trì phiên làm việc cho client."*
*   **Dưới Hình 3.7 (Sơ đồ tìm kiếm và lọc sản phẩm):**
    > *"Quy trình tìm kiếm sản phẩm hỗ trợ người dùng lọc dữ liệu đa tiêu chí bao gồm thương hiệu, phân khúc giá, cấu hình RAM/ROM. Server tiếp nhận các tham số lọc dưới dạng Query Parameters, chuyển hóa thành câu truy vấn SQL động để truy xuất nhanh chóng các sản phẩm khớp yêu cầu của khách hàng."*
*   **Dưới Hình 3.8 (Sơ đồ quản lý giỏ hàng):**
    > *"Khi người dùng thực hiện thêm sản phẩm, tăng/giảm số lượng hoặc xóa sản phẩm khỏi giỏ hàng, thông tin được đồng bộ trực tiếp xuống cơ sở dữ liệu (đối với người dùng đã đăng nhập) thông qua API để đảm bảo giỏ hàng không bị mất khi tải lại trang."*
*   **Dưới Hình 3.9 (Sơ đồ thanh toán đơn hàng):**
    > *"Quy trình thanh toán hỗ trợ 2 hình thức: thanh toán COD hoặc quét mã QR. Đối với quét mã QR, server Node.js sẽ khởi tạo một mã giao dịch tạm thời đi kèm thời gian hết hạn (expiration time) nhằm bảo mật giao dịch, tránh gian lận thanh toán trước khi chính thức chuyển đổi trạng thái đơn hàng thành Đã thanh toán."*
*   **Dưới Hình 3.12 (Sơ đồ hoạt động chatbot AI):**
    > *"Quy trình hoạt động của Chatbot AI chia làm ba bước chính. Bước 1: Tiếp nhận câu hỏi của người dùng tại giao diện chat. Bước 2: Node.js chuyển tiếp yêu cầu sang Python FastAPI. Tại đây, hệ thống tìm kiếm thông tin liên quan từ cơ sở dữ liệu Vector ChromaDB và kết hợp nội dung chat lịch sử. Bước 3: Rút trích dữ liệu cấu hình, gửi Prompt hoàn chỉnh sang mô hình ngôn ngữ lớn (LLM) để sinh câu trả lời tự nhiên định dạng HTML kèm card sản phẩm và hiển thị lại cho khách hàng."*

---

## 4. BỔ SUNG THUYẾT MINH CHO CÁC SƠ ĐỒ TUẦN TỰ (Mục 3.5 cũ)

*   **Dưới Hình 3.13 (Sơ đồ tuần tự quy trình tìm kiếm và xem chi tiết):**
    > *"Sơ đồ tuần tự thể hiện sự tương tác trực tiếp giữa Client, Server Node.js và MySQL Database. Khi người dùng click chọn sản phẩm, Client gửi request `GET /api/products/:id`. Server truy vấn thông số cấu hình của sản phẩm từ bảng `sanpham` và `chitietsanpham`, đồng thời ghi nhận một lượt xem mới vào bảng `lich_su_xem_san_pham` trước khi trả kết quả về hiển thị."*
*   **Dưới Hình 3.14 (Sơ đồ tuần tự quy trình thanh toán):**
    > *"Mô tả tuần tự các bước đặt hàng: Client gửi thông tin giỏ hàng và địa chỉ giao hàng (`POST /api/orders`) -> Server khởi tạo kết nối transaction tới Database, trừ số lượng tồn kho của sản phẩm, thêm bản ghi vào bảng `donhang` và `chitietdonhang` -> Trả về mã đơn hàng thành công và kích hoạt cơ chế xóa sạch giỏ hàng tạm thời."*

---

## 5. BỔ SUNG MỤC: THIẾT KẾ CÁC BỘ LỌC TỐI ƯU HÓA KẾT GUYÊN GỢI Ý
*(Bạn hãy chèn phần này vào cuối chương, trước phần Kết luận của Chương 3)*

### 3.6. Thiết kế các bộ lọc tối ưu hóa kết quả gợi ý
Để cải thiện độ chính xác và nâng cao trải nghiệm người dùng, hệ thống gợi ý của website Quang Hưng Mobile được trang bị ba bộ lọc thông minh tối ưu hóa kết quả đầu ra:

1.  **Bộ lọc loại bỏ sản phẩm đã mua (Purchased Items Exclusion):**
    Trong quá trình tính toán gợi ý bằng thuật toán Collaborative Filtering KNN, hệ thống sẽ xác định các sản phẩm mà khách hàng tương đồng đã mua. Tuy nhiên, trước khi đề xuất cho người dùng hiện tại, hệ thống tiến hành đối chiếu và loại bỏ tất cả các mã sản phẩm đã tồn tại trong lịch sử mua hàng của chính người dùng đó:
    
    Set Gợi Ý = Set sản phẩm của nhóm tương đồng - Set sản phẩm đã mua của User
    
    Cơ chế này giúp hạn chế việc gợi ý liên tục một mẫu điện thoại mà khách hàng vừa mới sở hữu.

2.  **Bộ lọc phân tách thiết bị và phụ kiện (Phones vs. Accessories Filter):**
    Hệ thống sử dụng module phân loại văn bản tự động `is_accessory` để nhận diện các dòng sản phẩm thuộc phụ kiện (như bao da, ốp lưng, củ sạc, tai nghe) thông qua tên sản phẩm.
    *   *Tại luồng tư vấn chatbot:* Chỉ hiển thị các thiết bị điện thoại, tự động loại bỏ các phụ kiện đi kèm để tránh làm nhiễu thông tin tư vấn.
    *   *Tại luồng gợi ý hậu mãi (Cross-selling):* Hệ thống tự động lọc để chỉ hiển thị các phụ kiện tương thích với dòng máy khách hàng vừa mua thành công.

3.  **Bộ lọc giải quyết điểm khởi đầu lạnh (Cold-Start Resolution):**
    Khi khách hàng mới truy cập website và chưa có bất kỳ dữ liệu xem sản phẩm hay sở thích nào trong database, hệ thống sẽ tự động kích hoạt bộ lọc fallback. Bộ lọc này sẽ tính điểm phổ biến của sản phẩm dựa trên số lượng bán ra (S) và lượt xem (V):
    
    Popularity Score = S × 3 + V
    
    Sản phẩm có điểm số cao nhất sẽ được đề xuất tại khu vực "Dành riêng cho bạn" nhằm kích cầu mua sắm ban đầu.
