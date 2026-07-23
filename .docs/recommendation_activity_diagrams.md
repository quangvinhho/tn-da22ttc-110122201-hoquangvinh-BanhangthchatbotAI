# TRỌN BỘ CÁC SƠ ĐỒ HOẠT ĐỘNG (ACTIVITY DIAGRAMS) HỆ THỐNG QUANG HƯNG MOBILE

> **Tài liệu tham khảo & Hướng dẫn xuất sơ đồ cho Báo cáo / Đồ án tốt nghiệp**
> **Tên đề tài:** Xây dựng website bán hàng Quang Hưng Mobile tích hợp Chatbot AI hỗ trợ tư vấn và gợi ý sản phẩm.

---

## 📂 FILE HTML XUẤT ẢNH NÉT CĂNG NẰM TẠI:
👉 **[activity_diagrams.html](file:///d:/GDDA/.docs/activity_diagrams.html)** *(Đường dẫn: `d:\GDDA\.docs\activity_diagrams.html`)*

---

## 📌 DANH SÁCH TOÀN BỘ 9 SƠ ĐỒ HOẠT ĐỘNG TRONG FILE HTML

### PHẦN 1: CÁC SƠ ĐỒ HOẠT ĐỘNG CHỨC NĂNG HỆ THỐNG CƠ BẢN

1. **Hình 3.6 Sơ đồ hoạt động Đăng ký và Đăng nhập:**
   - Luồng xác thực OTP qua Email khi đăng ký $\rightarrow$ Mã hóa Bcrypt $\rightarrow$ Đăng nhập OAuth / JWT $\rightarrow$ Thanh hợp nhất `❚ Join Bar` $\rightarrow$ Chấm kết thúc `◉ End`.
2. **Hình 3.7 Sơ đồ hoạt động Tìm kiếm và Lọc sản phẩm:**
   - Nhập từ khóa / Lọc đa tiêu chí (Hãng, Giá, RAM, Chip) $\rightarrow$ Server tạo SQL động truy vấn `sanpham` & `chitietsanpham` $\rightarrow$ Rẽ nhánh kết quả $\rightarrow$ Thanh hợp nhất `❚ Join Bar` $\rightarrow$ Chấm kết thúc `◉ End`.
3. **Hình 3.8 Sơ đồ hoạt động Quản lý giỏ hàng:**
   - Xem máy $\rightarrow$ Rẽ nhánh thao tác (Thêm / Đổi số lượng / Xóa SP) $\rightarrow$ Thanh hợp nhất 1 `❚` $\rightarrow$ Đồng bộ CSDL `giohang` & `chitietgiohang` $\rightarrow$ Tính lại Tổng tiền $\rightarrow$ Thanh hợp nhất 2 `❚` $\rightarrow$ Chấm kết thúc `◉ End`.
4. **Hình 3.9 Sơ đồ hoạt động Thanh toán đơn hàng:**
   - Nhập địa chỉ & SĐT $\rightarrow$ Rẽ nhánh hình thức PTTT (COD Tiền mặt / Quét mã QR chuyển khoản) $\rightarrow$ Thanh hợp nhất 1 `❚` $\rightarrow$ Tạo bản ghi `donhang` & `chitietdonhang` $\rightarrow$ Trừ tồn kho $\rightarrow$ Xóa giỏ hàng $\rightarrow$ Thanh hợp nhất 2 `❚` $\rightarrow$ Chấm kết thúc `◉ End`.
5. **Hình 3.10 Sơ đồ hoạt động Quản lý tài khoản và Theo dõi đơn hàng:**
   - Mở trang cá nhân $\rightarrow$ Rẽ nhánh (Cập nhật SĐT/Địa chỉ HOẶC Xem lịch sử đơn) $\rightarrow$ Kiểm tra trạng thái (Xử lý / Giao / Hoàn thành) $\rightarrow$ Thanh hợp nhất `❚ Join Bar` $\rightarrow$ Chấm kết thúc `◉ End`.

---

### PHẦN 2: CÁC SƠ ĐỒ HOẠT ĐỘNG THUẬT TOÁN GỢI Ý SẢN PHẨM (AI)

6. **Hình 3.17-A Gợi Ý Sản Phẩm Kèm (Apriori Association Rules):**
   - Lấy SP giỏ hàng $\rightarrow$ Nhóm đơn hàng $\rightarrow$ Mã hóa đơn hàng $\rightarrow$ Apriori (Tập phổ biến) $\rightarrow$ Sinh luật kết hợp Confidence & Lift $\rightarrow$ Tra cứu quy tắc $\rightarrow$ Trích xuất Top phụ kiện $\rightarrow$ Rẽ nhánh `<Mua kèm?>` $\rightarrow$ Thanh hợp nhất `❚ Join Bar` $\rightarrow$ Chấm kết thúc `◉ End`.
7. **Hình 3.17-B Gợi Ý Theo Người Dùng Tương Đồng (KNN Collaborative Filtering):**
   - Tiếp nhận MaKH $\rightarrow$ Truy xuất `lich_su_xem_san_pham` & `donhang` $\rightarrow$ User-Item Matrix $\rightarrow$ Cosine Similarity $\rightarrow$ K-neighbors $\rightarrow$ Trích SP lân cận $\rightarrow$ Tính Score_KNN $\rightarrow$ Hiển thị Top K $\rightarrow$ Thanh hợp nhất `❚ Join Bar` $\rightarrow$ Chấm kết thúc `◉ End`.
8. **Hình 3.17-C Gợi Ý Theo Sở Thích Cá Nhân (Content-Based Filtering):**
   - Trích xuất profile `so_thich_khach_hang` $\rightarrow$ Truy xuất `chitietsanpham` $\rightarrow$ Mã hóa Vector $\rightarrow$ So khớp $\rightarrow$ Score_Content $\rightarrow$ Lọc nhu cầu $\rightarrow$ Hiển thị Top N $\rightarrow$ Thanh hợp nhất `❚ Join Bar` $\rightarrow$ Chấm kết thúc `◉ End`.
9. **Hình 3.17-D Động Cơ Gợi Ý Lai Tổng Hợp & Các Bộ Lọc (Hybrid Recommendation Engine):**
   - Nhận yêu cầu $\rightarrow$ Rẽ nhánh `<Đã có dữ liệu?>`:
     - *Không (Cold-Start):* Popularity Score $\rightarrow$ Top SP phổ biến $\rightarrow$ Trỏ Join Bar 2.
     - *Có:* Phân nhánh song song `❚` 3 thuật toán (Content-Based x 0.5, KNN CF x 0.3, Apriori x 0.2) $\rightarrow$ Join Bar 1 $\rightarrow$ Total Score $\rightarrow$ Trỏ Join Bar 2.
   - Thanh hợp nhất `❚ Join Bar 2` $\rightarrow$ **Bộ lọc 1** (Loại SP đã mua) $\rightarrow$ **Bộ lọc 2** (Phân tách Điện thoại vs Phụ kiện) $\rightarrow$ **Bộ lọc 3** (Round-Robin Đa dạng thương hiệu) $\rightarrow$ Hiển thị Top N $\rightarrow$ Thanh hợp nhất `❚ Join Bar 3` $\rightarrow$ Chấm kết thúc `◉ End`.
