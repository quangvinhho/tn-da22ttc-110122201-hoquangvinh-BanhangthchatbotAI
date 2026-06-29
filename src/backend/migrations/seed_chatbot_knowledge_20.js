/**
 * Migration: seed 20 mục tri thức chatbot mẫu cho QuangHưng Mobile.
 * - SĐT chính thức: 0355745120
 * - Mỗi mục có: title (hiển thị), content (HTML giàu nội dung), keywords (đa dạng có/không dấu).
 * - Idempotent: check theo title trước khi INSERT, không trùng.
 * - Sau khi insert: KHÔNG tự gọi reload-vectorstore vì RAG service có thể chưa khởi động.
 *   Admin nên vào trang chatbot-knowledge nhấn "🔄 Đồng bộ RAG" sau khi server chạy.
 */
const { pool } = require('../config/database');

const PHONE = '0355745120';

const KNOWLEDGE_SEED = [
  // ============ STORE INFO (5) ============
  {
    title: 'Địa chỉ cửa hàng',
    type: 'store_info',
    keywords: 'địa chỉ cửa hàng, dia chi cua hang, shop ở đâu, shop o dau, cửa hàng ở đâu, cua hang o dau, vị trí cửa hàng, vi tri cua hang, chi nhánh, chi nhanh',
    content: 'Dạ, cửa hàng <strong>QuangHưng Mobile</strong> tọa lạc tại số <strong>123 Đường Nguyễn Văn Cừ, Phường An Khánh, Quận Ninh Kiều, TP. Cần Thơ</strong>. Cửa hàng có bãi giữ xe miễn phí, nằm ngay mặt tiền đường lớn, dễ tìm.<br><br>📞 Hotline tư vấn: <strong>' + PHONE + '</strong><br>🗺️ <a href="contact.html" target="_blank">Xem chỉ đường trên bản đồ</a>'
  },
  {
    title: 'Giờ làm việc',
    type: 'store_info',
    keywords: 'giờ làm việc, gio lam viec, mở cửa, mo cua, đóng cửa, dong cua, mấy giờ mở, may gio mo, mấy giờ đóng, may gio dong, có làm chủ nhật không, lam chu nhat',
    content: 'Dạ, cửa hàng QuangHưng Mobile <strong>mở cửa tất cả các ngày trong tuần</strong> (kể cả Thứ Bảy, Chủ Nhật và lễ Tết) từ <strong>8:00 sáng đến 22:00 tối</strong>.<br><br>⏰ Khung giờ vắng khách (dễ tư vấn kỹ): 9h-11h sáng & 14h-17h chiều.'
  },
  {
    title: 'Hotline liên hệ',
    type: 'store_info',
    keywords: 'hotline, số điện thoại, so dien thoai, sđt, sdt, liên hệ, lien he, gọi shop, goi shop, số gọi, số tư vấn',
    content: 'Dạ, anh/chị có thể liên hệ tổng đài QuangHưng Mobile qua số <strong>' + PHONE + '</strong> để được tư vấn miễn phí 24/7. Khi gọi vui lòng cung cấp tên + nhu cầu để được hỗ trợ nhanh nhất ạ!<br><br>📞 <strong>' + PHONE + '</strong> (Zalo / Viber / điện thoại đều được)'
  },
  {
    title: 'Email & mạng xã hội',
    type: 'store_info',
    keywords: 'email, mail, fanpage, facebook, zalo, instagram, tiktok, mạng xã hội, mang xa hoi, kết nối, ket noi',
    content: 'Dạ, anh/chị có thể kết nối với QuangHưng Mobile qua các kênh sau:<br>📧 Email: <strong>support@quanghungmobile.com</strong><br>📱 Zalo / Hotline: <strong>' + PHONE + '</strong><br>💬 Fanpage: <strong>facebook.com/quanghungmobile</strong><br>🎵 TikTok: <strong>@quanghungmobile_official</strong>'
  },
  {
    title: 'Giới thiệu cửa hàng',
    type: 'store_info',
    keywords: 'giới thiệu, gioi thieu, shop là gì, shop la gi, về cửa hàng, ve cua hang, lịch sử, lich su, uy tín, uy tin, thành lập, thanh lap',
    content: 'Dạ, <strong>QuangHưng Mobile</strong> là hệ thống bán lẻ điện thoại di động chính hãng được thành lập từ năm 2018 tại Cần Thơ. Hiện chúng em là một trong những đối tác ủy quyền chính thức của Apple, Samsung, Xiaomi, OPPO, Vivo... với hơn <strong>50.000+ khách hàng thân thiết</strong> và 5 năm liên tiếp đạt giải "Cửa hàng tin cậy" do người tiêu dùng bình chọn.'
  },

  // ============ POLICY (7) ============
  {
    title: 'Chính sách bảo hành',
    type: 'policy',
    keywords: 'bảo hành, bao hanh, hết hạn bảo hành, het han bao hanh, sửa chữa, sua chua, hỏng máy, hong may, lỗi nhà sản xuất, loi nha san xuat, bảo hành bao lâu, bao hanh bao lau',
    content: 'Dạ, chính sách bảo hành chính hãng tại QuangHưng Mobile như sau:<br>🛡️ <strong>Điện thoại</strong>: bảo hành chính hãng <strong>12-24 tháng</strong> tại trung tâm bảo hành ủy quyền của hãng (Apple, Samsung, Xiaomi...).<br>🔌 <strong>Phụ kiện</strong>: bảo hành <strong>6-12 tháng</strong>, 1 đổi 1 trong 7 ngày đầu nếu lỗi NSX.<br>🔍 Tra cứu tình trạng bảo hành: <a href="tra-cuu-bao-hanh.html">Tra cứu bảo hành điện tử</a>.<br>📞 Hỗ trợ kỹ thuật: <strong>' + PHONE + '</strong>'
  },
  {
    title: 'Chính sách đổi trả',
    type: 'policy',
    keywords: 'đổi trả, doi tra, hoàn tiền, hoan tien, trả lại, tra lai, đổi máy, doi may, không vừa ý, khong vua y, hủy đơn, huy don, hoàn trả, hoan tra',
    content: 'Dạ, chính sách đổi trả tại QuangHưng Mobile:<br>🔁 <strong>1 đổi 1 trong 30 ngày</strong> nếu máy gặp lỗi kỹ thuật từ nhà sản xuất.<br>💵 <strong>Hoàn tiền 100%</strong> trong 7 ngày đầu nếu không vừa ý (máy còn nguyên hộp, đầy đủ phụ kiện, hoá đơn).<br>⚠️ Lưu ý: máy đã kích hoạt, có dấu hiệu va đập rơi vỡ, vào nước thì không thuộc diện đổi trả.<br>📋 Chi tiết: <a href="chinh-sach-bao-hanh.html">Chính sách bảo hành & đổi trả</a>'
  },
  {
    title: 'Chính sách vận chuyển - giao hàng',
    type: 'policy',
    keywords: 'vận chuyển, van chuyen, giao hàng, giao hang, ship, phí ship, phi ship, miễn phí giao hàng, mien phi giao hang, ship cod, thời gian giao, thoi gian giao, giao hàng tận nơi',
    content: 'Dạ, chính sách giao hàng của QuangHưng Mobile:<br>🚚 <strong>Miễn phí giao hàng toàn quốc</strong> cho mọi đơn hàng từ 500.000đ.<br>⚡ Giao nhanh <strong>2-4h</strong> trong nội thành Cần Thơ (giờ hành chính).<br>📦 Giao hàng <strong>1-3 ngày</strong> các tỉnh khác qua đối tác Giao Hàng Nhanh / Viettel Post.<br>💰 Hỗ trợ <strong>thanh toán khi nhận hàng (COD)</strong>, được kiểm tra máy trước khi nhận.<br>📞 Tra cứu vận đơn: gọi <strong>' + PHONE + '</strong>'
  },
  {
    title: 'Chính sách trả góp',
    type: 'policy',
    keywords: 'trả góp, tra gop, lãi suất 0%, lai suat 0, mua trả góp, mua tra gop, góp 0 đồng, gop 0 dong, hồ sơ trả góp, ho so tra gop, giấy tờ trả góp, giay to tra gop, Home Credit, FE Credit, HD Saison',
    content: 'Dạ, mua trả góp tại QuangHưng Mobile cực dễ:<br>💳 <strong>Trả góp 0% lãi suất</strong> qua thẻ tín dụng (VISA / MasterCard) các kỳ hạn 3, 6, 9, 12 tháng.<br>🏦 Trả góp qua công ty tài chính: <strong>Home Credit, FE Credit, HD Saison, Mirae Asset</strong>.<br>📄 Giấy tờ cần: <strong>CCCD/CMND</strong> + 1 giấy tờ phụ (Bằng lái / Hộ khẩu / Sổ tài khoản ngân hàng).<br>⚡ Duyệt nhanh trong <strong>15 phút</strong>, trả trước từ 0đ.<br>📞 Tư vấn trả góp: <strong>' + PHONE + '</strong>'
  },
  {
    title: 'Hình thức thanh toán',
    type: 'policy',
    keywords: 'thanh toán, thanh toan, chuyển khoản, chuyen khoan, momo, vnpay, zalopay, cod, tiền mặt, tien mat, quẹt thẻ, quet the, thanh toán qr, qr code, thẻ tín dụng',
    content: 'Dạ, QuangHưng Mobile chấp nhận đa dạng hình thức thanh toán:<br>💵 <strong>Tiền mặt</strong> tại cửa hàng hoặc COD khi nhận hàng.<br>💳 <strong>Quẹt thẻ</strong> ATM nội địa / VISA / MasterCard / JCB.<br>📱 <strong>Ví điện tử</strong>: MoMo, ZaloPay, VNPay, ShopeePay.<br>🏦 <strong>Chuyển khoản ngân hàng</strong>: Vietcombank, Techcombank, MB Bank, ACB.<br>📲 Quét mã <strong>QR VietQR</strong> liên ngân hàng (24/7, miễn phí).'
  },
  {
    title: 'Chính sách bảo mật thông tin',
    type: 'policy',
    keywords: 'bảo mật, bao mat, thông tin cá nhân, thong tin ca nhan, riêng tư, rieng tu, dữ liệu, du lieu, privacy, GDPR, lộ thông tin',
    content: 'Dạ, QuangHưng Mobile cam kết <strong>bảo mật tuyệt đối thông tin cá nhân</strong> của khách hàng:<br>🔐 Mã hoá mật khẩu bằng bcrypt theo chuẩn ngân hàng.<br>🚫 Không chia sẻ, mua bán thông tin với bên thứ 3 vì mục đích thương mại.<br>📋 Chỉ sử dụng dữ liệu cho mục đích: xử lý đơn hàng, bảo hành, chăm sóc khách hàng.<br>🗑️ Khách hàng có quyền yêu cầu xoá tài khoản và dữ liệu cá nhân bất cứ lúc nào.<br>📞 Khiếu nại bảo mật: <strong>' + PHONE + '</strong>'
  },
  {
    title: 'Chính sách giá - cam kết',
    type: 'policy',
    keywords: 'giá tốt nhất, gia tot nhat, cam kết giá, cam ket gia, giá rẻ hơn, gia re hon, hoàn tiền chênh lệch, hoan tien chenh lech, giá niêm yết, gia niem yet, có mặc cả không, mac ca',
    content: 'Dạ, QuangHưng Mobile <strong>cam kết giá tốt nhất thị trường</strong>:<br>💯 Giá niêm yết = giá thanh toán, không có phí ẩn.<br>🎁 Nếu anh/chị tìm được nơi khác bán <strong>rẻ hơn cùng model + chính hãng + còn bảo hành</strong>, shop hoàn tiền 100% chênh lệch trong 7 ngày.<br>🛒 Giá đã bao gồm VAT, không phụ thu thẻ.<br>📞 Phản ánh giá: <strong>' + PHONE + '</strong>'
  },

  // ============ FAQ (8) ============
  {
    title: 'Khuyến mãi - voucher',
    type: 'faq',
    keywords: 'khuyến mãi, khuyen mai, voucher, mã giảm giá, ma giam gia, ưu đãi, uu dai, giảm giá, giam gia, sale, flash sale, deal, coupon, săn voucher, san voucher',
    content: 'Dạ, để săn voucher và xem khuyến mãi mới nhất của QuangHưng Mobile, anh/chị vui lòng:<br>🎁 Vào trang <a href="promotions.html">Trang Khuyến Mãi</a> để xem voucher còn hạn sử dụng.<br>📧 Đăng ký nhận tin qua email để được gửi voucher độc quyền hàng tuần.<br>💬 Theo dõi Fanpage <strong>facebook.com/quanghungmobile</strong> để cập nhật flash sale.<br>⚡ Thành viên hạng <strong>Vàng / Kim Cương</strong> được tặng voucher sinh nhật trị giá 500K - 2 triệu.'
  },
  {
    title: 'Thu cũ đổi mới - lên đời',
    type: 'faq',
    keywords: 'thu cũ, thu cu, đổi mới, doi moi, lên đời, len doi, trade in, trade-in, đổi máy cũ, doi may cu, định giá máy, dinh gia may, máy cũ giá bao nhiêu',
    content: 'Dạ, chương trình <strong>Thu Cũ Đổi Mới (Trade-in)</strong> của QuangHưng Mobile:<br>📱 Định giá máy cũ <strong>MIỄN PHÍ</strong> trong 10 phút tại cửa hàng.<br>💰 Trợ giá thêm <strong>500K - 3 triệu</strong> tuỳ dòng máy mới.<br>✅ Nhận thu mọi hãng: iPhone, Samsung, Xiaomi, OPPO, Vivo, Realme... kể cả máy nứt màn, hư cảm biến (giá điều chỉnh).<br>📋 Mang theo: máy + hộp (nếu còn) + CCCD.<br>📞 Báo giá nhanh qua Zalo: <strong>' + PHONE + '</strong>'
  },
  {
    title: 'Hướng dẫn đặt hàng online',
    type: 'faq',
    keywords: 'đặt hàng online, dat hang online, mua online, mua hàng, mua hang, cách đặt hàng, cach dat hang, hướng dẫn mua, huong dan mua, mua như thế nào, mua nhu the nao, order',
    content: 'Dạ, cách đặt hàng online tại QuangHưng Mobile rất đơn giản:<br>1️⃣ Chọn sản phẩm trên website → bấm <strong>Thêm vào giỏ hàng</strong>.<br>2️⃣ Vào giỏ hàng → <strong>Thanh toán</strong> → điền địa chỉ giao hàng.<br>3️⃣ Chọn hình thức thanh toán (COD / Chuyển khoản / Thẻ).<br>4️⃣ Xác nhận đơn → nhận tin nhắn xác nhận từ shop.<br>5️⃣ Chờ giao hàng 2-4h (nội thành) hoặc 1-3 ngày (tỉnh khác).<br>📞 Hỗ trợ đặt hàng: <strong>' + PHONE + '</strong>'
  },
  {
    title: 'Kiểm tra đơn hàng',
    type: 'faq',
    keywords: 'kiểm tra đơn hàng, kiem tra don hang, tra cứu đơn, tra cuu don, đơn hàng của tôi, don hang cua toi, trạng thái đơn, trang thai don, đơn đến đâu, don den dau, mã đơn hàng',
    content: 'Dạ, để kiểm tra trạng thái đơn hàng, anh/chị có 3 cách:<br>👤 <strong>Đăng nhập tài khoản</strong> → vào <a href="profile.html">Hồ sơ của tôi</a> → mục "Đơn hàng của tôi".<br>📧 Kiểm tra <strong>email xác nhận</strong> có link tra cứu đơn.<br>📞 Gọi hotline <strong>' + PHONE + '</strong> cung cấp mã đơn hoặc SĐT để được tra cứu nhanh.<br><br>Trạng thái đơn gồm: Chờ xác nhận → Đã xác nhận → Đang giao → Đã giao → Hoàn tất.'
  },
  {
    title: 'Hủy đơn - thay đổi đơn hàng',
    type: 'faq',
    keywords: 'hủy đơn, huy don, hủy đơn hàng, huy don hang, thay đổi đơn, thay doi don, sửa đơn hàng, sua don hang, đổi địa chỉ, doi dia chi, không muốn mua nữa',
    content: 'Dạ, chính sách hủy / thay đổi đơn hàng:<br>✅ Hủy đơn <strong>miễn phí</strong> trong vòng <strong>30 phút</strong> sau khi đặt (đơn chưa giao đến đơn vị vận chuyển).<br>⚠️ Đơn đã giao cho shipper: liên hệ shipper từ chối nhận, sẽ hoàn về shop.<br>📝 Thay đổi địa chỉ / SĐT / SP: gọi ngay hotline <strong>' + PHONE + '</strong> trong vòng 30 phút.<br>💡 Đơn đã hoàn thành (đã nhận): áp dụng chính sách đổi trả 30 ngày.'
  },
  {
    title: 'Tư vấn chọn mua điện thoại',
    type: 'faq',
    keywords: 'tư vấn, tu van, gợi ý điện thoại, goi y dien thoai, nên mua máy nào, nen mua may nao, máy phù hợp, may phu hop, chọn điện thoại, chon dien thoai, máy chơi game, may choi game, máy chụp ảnh đẹp, may chup anh dep',
    content: 'Dạ, để em tư vấn chính xác nhất, anh/chị vui lòng cho em biết:<br>💰 <strong>Ngân sách</strong>: dưới 5tr / 5-10tr / 10-15tr / trên 15tr?<br>🎯 <strong>Nhu cầu chính</strong>: chơi game / chụp ảnh / sử dụng cơ bản / quay vlog?<br>🏷️ <strong>Hãng yêu thích</strong> (nếu có): Apple / Samsung / Xiaomi / OPPO / Vivo?<br>📱 <strong>Kích thước</strong>: máy nhỏ gọn cầm 1 tay hay màn hình lớn 6.5" trở lên?<br><br>Có thông tin trên em sẽ gợi ý 2-3 mẫu phù hợp nhất ngay ạ!'
  },
  {
    title: 'Phụ kiện đi kèm khi mua máy',
    type: 'faq',
    keywords: 'phụ kiện, phu kien, có tặng gì không, co tang gi khong, ốp lưng, op lung, cường lực, cuong luc, sạc, cáp, tai nghe, quà tặng, qua tang, khuyến mãi kèm theo',
    content: 'Dạ, khi mua điện thoại tại QuangHưng Mobile, anh/chị được tặng kèm:<br>🎁 <strong>Ốp lưng silicon</strong> chống va đập (trị giá 150K).<br>🛡️ Dán <strong>cường lực 9H</strong> chống xước miễn phí.<br>🧴 Khăn lau màn hình + giấy ướt vệ sinh máy.<br>📱 Hộp + sạc + cáp + tai nghe (theo hãng - đầy đủ).<br>🎟️ Voucher giảm 200K cho lần mua phụ kiện kế tiếp.<br><br>⚡ Một số dòng cao cấp tặng thêm Pin dự phòng / Loa Bluetooth (theo chương trình)!'
  },
  {
    title: 'Tài khoản thành viên - tích điểm',
    type: 'faq',
    keywords: 'tài khoản, tai khoan, thành viên, thanh vien, tích điểm, tich diem, hạng thành viên, hang thanh vien, vàng kim cương, vang kim cuong, đăng ký, dang ky, member, loyalty',
    content: 'Dạ, chương trình <strong>Thành viên QuangHưng</strong> miễn phí đăng ký:<br>🥉 <strong>Đồng</strong> (mới đăng ký): tích 1% giá trị đơn hàng.<br>🥈 <strong>Bạc</strong> (chi tiêu 5tr+): tích 2% + voucher sinh nhật 100K.<br>🥇 <strong>Vàng</strong> (chi tiêu 20tr+): tích 3% + voucher SN 500K + ưu tiên giao hàng.<br>💎 <strong>Kim Cương</strong> (chi tiêu 50tr+): tích 5% + voucher SN 2 triệu + hotline VIP riêng.<br><br>👉 Đăng ký ngay tại <a href="register.html">trang Đăng Ký</a> để nhận voucher chào mừng 200K!'
  }
];

async function tableExists() {
  const [rows] = await pool.query(
    "SHOW TABLES LIKE 'chatbot_knowledge'"
  );
  return rows.length > 0;
}

async function columnExists(column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM chatbot_knowledge WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function run() {
  try {
    if (!(await tableExists())) {
      console.log('⚠️  Bảng chatbot_knowledge chưa tồn tại, bỏ qua seed.');
      return false;
    }
    // Đảm bảo cột keywords đã có (do migration add_keywords_to_chatbot_knowledge tạo)
    const hasKeywords = await columnExists('keywords');
    if (!hasKeywords) {
      console.log('⚠️  Cột keywords chưa có. Chạy migration add_keywords_to_chatbot_knowledge trước.');
      return false;
    }

    let inserted = 0, skipped = 0;
    for (const item of KNOWLEDGE_SEED) {
      // Idempotent: skip nếu đã có title trùng
      const [exists] = await pool.query(
        'SELECT id FROM chatbot_knowledge WHERE title = ? LIMIT 1',
        [item.title]
      );
      if (exists.length > 0) {
        skipped++;
        continue;
      }
      await pool.query(
        'INSERT INTO chatbot_knowledge (title, content, type, keywords, is_active) VALUES (?, ?, ?, ?, 1)',
        [item.title, item.content, item.type, item.keywords]
      );
      inserted++;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ chatbot_knowledge seed: inserted ${inserted}, skipped ${skipped} (đã có).`);
    }
    return true;
  } catch (e) {
    console.error('❌ Migration seed_chatbot_knowledge_20 failed:', e && e.message);
    return false;
  }
}

module.exports = { run, KNOWLEDGE_SEED, PHONE };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
