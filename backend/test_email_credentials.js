require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  console.log('=== EMAIL CREDENTIAL CHECK ===');
  console.log('EMAIL_USER:', user || '<UNSET>');
  console.log('EMAIL_PASS length:', pass ? pass.length : 0, '(App Password chuẩn = 16 ký tự, KHÔNG có dấu cách)');
  console.log('EMAIL_PASS chứa khoảng trắng:', pass && /\s/.test(pass) ? '⚠️  CÓ — phải xóa!' : 'không (OK)');
  console.log('');

  if (!user || !pass) {
    console.log('❌ Thiếu EMAIL_USER hoặc EMAIL_PASS trong .env');
    process.exit(1);
  }
  if (pass.length !== 16) {
    console.log(`⚠️  EMAIL_PASS dài ${pass.length} ký tự — có khả năng cao không phải App Password.`);
    console.log('   Hãy đảm bảo đã tạo App Password tại https://myaccount.google.com/apppasswords');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  console.log('▶ Đang verify SMTP login...');
  try {
    await transporter.verify();
    console.log('✅ AUTH OK! Có thể gửi email được.');
    console.log('');
    console.log('▶ Đang gửi email test tới chính', user, '...');
    const info = await transporter.sendMail({
      from: `"QuangHưng Test" <${user}>`,
      to: user,
      subject: '🧪 Test SMTP - QuangHưng Mobile',
      html: '<h2>✅ Cấu hình email OK!</h2><p>Nếu bạn nhận được email này, hệ thống đã sẵn sàng gửi email cho khách hàng.</p>'
    });
    console.log('✅ Đã gửi! messageId:', info.messageId);
    console.log('→ Mở Gmail kiểm tra inbox của', user);
  } catch (e) {
    console.log('❌ FAIL:', e.message);
    if (/535|BadCredentials/.test(e.message)) {
      console.log('');
      console.log('Lý do thường gặp:');
      console.log('  1. EMAIL_PASS đang là password Gmail thường, không phải App Password (16 ký tự)');
      console.log('  2. App Password đã hết hạn hoặc bị revoke');
      console.log('  3. EMAIL_USER không khớp với account đã tạo App Password');
      console.log('  4. Tài khoản chưa bật 2-Step Verification');
      console.log('');
      console.log('Hướng dẫn: https://myaccount.google.com/apppasswords');
    }
    process.exit(1);
  }
  process.exit(0);
})();
