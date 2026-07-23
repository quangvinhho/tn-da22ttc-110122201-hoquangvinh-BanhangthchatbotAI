# THUYẾT MINH MÔ TẢ TRỌN BỘ CÁC SƠ ĐỒ HOẠT ĐỘNG (BÁO CÁO KLTN)
*(Tài liệu mô tả ngắn gọn, súc tích bằng văn xuôi cho tất cả các Sơ đồ hoạt động trong Báo cáo Khóa luận)*

---

## PHẦN 1: THUYẾT MINH CÁC SƠ ĐỒ HOẠT ĐỘNG CHỨC NĂNG HỆ THỐNG & CHATBOT AI

### 3.4.1. Thuyết minh Hình 3.6: Sơ đồ hoạt động Đăng ký và Đăng nhập
Sơ đồ mô tả quy trình xác thực người dùng khi truy cập hệ thống. Khi đăng ký, khách hàng nhập email và mật khẩu, hệ thống gửi mã OTP xác thực qua email trước khi mã hóa mật khẩu bằng thư viện Bcrypt và lưu tài khoản vào cơ sở dữ liệu. Khi đăng nhập, hệ thống so khớp mật khẩu nhập vào (hoặc xác thực qua Google OAuth) và sinh mã JSON Web Token (JWT) để duy trì phiên làm việc cho người dùng.

### 3.4.2. Thuyết minh Hình 3.7: Sơ đồ hoạt động Tìm kiếm và Lọc sản phẩm
Sơ đồ mô tả quy trình tìm kiếm sản phẩm theo từ khóa và lọc đa tiêu chí (như thương hiệu, phân khúc giá, cấu hình RAM, ROM, chip). Server Node.js tiếp nhận các tham số lọc từ người dùng, chuyển hóa thành câu truy vấn SQL động để truy xuất dữ liệu từ bảng sản phẩm và chi tiết sản phẩm, sau đó trả về hiển thị danh sách các máy khớp yêu cầu lên giao diện.

### 3.4.3. Thuyết minh Hình 3.8: Sơ đồ hoạt động Quản lý giỏ hàng
Sơ đồ mô tả quy trình tương tác của người dùng với giỏ hàng trực tuyến. Khi người dùng thực hiện thêm sản phẩm mới, tăng/giảm số lượng hoặc xóa sản phẩm khỏi giỏ, thông tin được tự động đồng bộ xuống cơ sở dữ liệu (bảng `giohang` và `chitietgiohang`). Hệ thống đồng thời tính toán lại tổng tiền đơn hàng và cập nhật giao diện giỏ hàng real-time.

### 3.4.4. Thuyết minh Hình 3.9: Sơ đồ hoạt động Thanh toán đơn hàng
Sơ đồ mô tả quy trình đặt hàng và thanh toán hỗ trợ hai hình thức là COD (tiền mặt khi nhận hàng) và quét mã QR chuyển khoản. Sau khi người dùng chọn hình thức thanh toán, server khởi tạo đơn hàng, cập nhật CSDL (bảng `donhang` và `chitietdonhang`), tự động trừ số lượng tồn kho của sản phẩm và xóa sạch giỏ hàng tạm thời trước khi hiển thị thông báo đặt hàng thành công.

### 3.4.5. Thuyết minh Hình 3.10: Sơ đồ hoạt động Quản lý tài khoản và Theo dõi đơn hàng
Sơ đồ mô tả quy trình cập nhật thông tin cá nhân và kiểm tra tiến độ đơn hàng sau khi đăng nhập. Người dùng có thể chỉnh sửa số điện thoại, danh sách địa chỉ giao hàng và lưu trực tiếp vào CSDL, hoặc xem danh sách đơn hàng đã đặt cùng trạng thái xử lý (Đang xử lý, Đang giao, Hoàn thành, Đã hủy) để chủ động theo dõi hành trình đơn hàng.

### 3.4.6. Thuyết minh Hình 3.16: Sơ đồ hoạt động Chatbot AI Tương tác và Tư vấn (RAG & Text-to-SQL)
Sơ đồ mô tả quy trình tư vấn thông minh của Chatbot AI. Khi người dùng nhập câu hỏi, server Node.js định tuyến xử lý: câu hỏi tư vấn sẽ qua RAG và LLM sinh câu trả lời gợi ý sản phẩm, trong khi câu hỏi thống kê được dịch thành truy vấn SQL chạy trên MySQL. Kết quả phản hồi sau đó rẽ nhánh: nếu khách đồng ý mua hàng thì sản phẩm tự động đưa vào giỏ hàng thật để thanh toán, nếu không chọn mua sẽ tiếp tục quay lại màn hình hội thoại để hỏi câu khác.

---

## PHẦN 2: THUYẾT MINH CÁC SƠ ĐỒ HOẠT ĐỘNG THUẬT TOÁN GỢI Ý SẢN PHẨM (AI)

### 3.5.1. Thuyết minh Hình 3.17-A: Gợi ý sản phẩm kèm (Apriori Association Rules)
Sơ đồ mô tả quy trình gợi ý phụ kiện mua kèm khi khách hàng xem sản phẩm hoặc thanh toán. Hệ thống trích xuất giỏ hàng hiện tại và quét lịch sử đơn hàng cũ để thuật toán Apriori lọc ra các tập phụ kiện thường được mua chung với tỷ lệ cao. Sau đó, hệ thống tính điểm, hiển thị phụ kiện gợi ý và rẽ nhánh: nếu khách chọn mua kèm thì thêm phụ kiện vào đơn và đặt hàng thành công, nếu không chọn thì tiến hành đặt hàng với sản phẩm gốc ban đầu.

### 3.5.2. Thuyết minh Hình 3.17-B: Gợi ý dựa trên nhóm người dùng tương đồng (KNN Collaborative Filtering)
Sơ đồ mô tả quy trình đề xuất điện thoại dựa trên thói quen mua sắm của nhóm người dùng có sở thích tương tự. Hệ thống truy xuất lịch sử xem và đơn hàng của khách hiện tại, sau đó sử dụng thuật toán KNN để tìm ra nhóm khách hàng lân cận có hành vi giống nhất. Các mẫu máy mà nhóm này đã xem hoặc mua nhưng khách hiện tại chưa xem sẽ được chấm điểm dự đoán và hiển thị tại mục "Dành riêng cho bạn".

### 3.5.3. Thuyết minh Hình 3.17-C: Gợi ý theo sở thích cá nhân (Content-Based Filtering)
Sơ đồ mô tả quy trình đề xuất điện thoại theo nhu cầu sử dụng và thuộc tính kỹ thuật. Hệ thống đối chiếu trực tiếp hồ sơ sở thích của khách hàng (như thương hiệu yêu thích, nhu cầu chơi game, chụp ảnh) với thông số cấu hình của các điện thoại trong kho (RAM, chip, camera, pin, giá). Những máy có thuộc tính phù hợp sẽ được chấm điểm cao, phân loại theo nhu cầu và hiển thị ưu tiên cho khách hàng.

### 3.5.4. Thuyết minh Hình 3.17-D: Động cơ gợi ý lai tổng hợp & Các bộ lọc tối ưu (Hybrid Engine & Post-Filters)
Sơ đồ mô tả quy trình phối hợp cả ba thuật toán gợi ý và xử lý qua các bộ lọc kiểm soát. Đối với người dùng mới (Cold-Start), hệ thống đề xuất ngay các điện thoại bán chạy và được xem nhiều nhất. Đối với người dùng cũ, hệ thống chạy song song cả ba thuật toán để tính điểm tổng hợp, sau đó cho qua bộ lọc loại bỏ sản phẩm đã mua, bộ lọc phân tách phụ kiện và bộ lọc đa dạng hóa thương hiệu trước khi hiển thị kết quả lên website hoặc Chatbot AI.
