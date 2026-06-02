const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Middleware kiểm tra phân quyền sở hữu dữ liệu chatbot (gia cố bảo mật)
const checkChatbotAccess = async (req, res, next) => {
  const sessionUser = req.session ? req.session.user : null;
  let conversationId = req.params.conversationId || req.body.conversationId;
  
  // Chuẩn hóa conversationId
  if (conversationId === 'null' || conversationId === 'undefined' || !conversationId) {
    conversationId = null;
  }

  if (!sessionUser) {
    // Khách vãng lai được phép sử dụng chatbot nhưng không được xem/sửa cuộc hội thoại của DB
    if (conversationId) {
      return res.status(401).json({ error: 'Bạn cần đăng nhập để thao tác cuộc hội thoại.' });
    }
    return next();
  }
  
  const isAdmin = sessionUser.vai_tro === 'admin';
  if (isAdmin) return next();
  
  // 1. Kiểm tra theo userId (nếu có)
  const userId = req.query.userId || req.body.userId || req.params.userId;
  if (userId && sessionUser.ma_kh != userId) {
    return res.status(403).json({ error: 'Bạn không có quyền truy cập dữ liệu chatbot của người dùng khác.' });
  }
  
  // 2. Kiểm tra theo conversationId (nếu có)
  if (conversationId) {
    try {
      const [conv] = await pool.query('SELECT ma_kh FROM cuoc_hoi_thoai WHERE ma_cuoc_hoi_thoai = ?', [conversationId]);
      if (conv.length > 0 && conv[0].ma_kh != sessionUser.ma_kh) {
        return res.status(403).json({ error: 'Bạn không có quyền truy cập cuộc hội thoại này.' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  
  next();
};

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Lấy danh sách sản phẩm từ database
async function getProductsFromDB() {
  try {
    const [rows] = await pool.query(`
      SELECT 
        sp.ma_sp as id,
        sp.ten_sp as name,
        hsx.ten_hang as brand,
        sp.gia as price,
        sp.bo_nho as storage,
        sp.so_luong_ton as stock,
        sp.anh_dai_dien as image
      FROM san_pham sp
      LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
      WHERE sp.so_luong_ton > 0
      ORDER BY sp.gia ASC
    `);
    return rows;
  } catch (error) {
    console.error('Error getting products:', error);
    return [];
  }
}

// Format giá tiền VND
function formatPrice(price) {
  return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
}

// Tạo danh sách sản phẩm cho AI context
function createProductContext(products) {
  if (!products || products.length === 0) return '';
  
  const productList = products.map(p => {
    // Chuẩn hóa đường dẫn ảnh: thêm images/ nếu chưa có
    let imagePath = p.image || '';
    if (imagePath && !imagePath.startsWith('images/') && !imagePath.startsWith('http')) {
      imagePath = `images/${imagePath}`;
    }
    
    return `- ${p.name} | Hãng: ${p.brand || 'N/A'} | Giá: ${formatPrice(p.price)} | Giá số: ${p.price} | Bộ nhớ: ${p.storage || 'N/A'} | ID: ${p.id} | Ảnh: ${imagePath}`;
  }).join('\n');
  
  return `\n\n📱 DANH SÁCH SẢN PHẨM HIỆN CÓ TẠI CỬA HÀNG:\n${productList}`;
}

// System prompt cho chatbot
const BASE_SYSTEM_PROMPT = `Bạn là trợ lý AI của QuangHưng Mobile - cửa hàng điện thoại di động uy tín.

Thông tin về cửa hàng:
- Tên: QuangHưng Mobile
- Chuyên bán: Điện thoại di động chính hãng (iPhone, Samsung, Xiaomi, OPPO, Vivo, Realme, Sony)
- Dịch vụ: Bán lẻ, trả góp 0%, bảo hành chính hãng, thu cũ đổi mới
- Hotline: 1900.xxxx
- Website: quanghungmobile.com

Chính sách:
- Bảo hành: 12-24 tháng chính hãng
- Đổi trả: 30 ngày nếu lỗi nhà sản xuất
- Trả góp: 0% lãi suất qua thẻ tín dụng
- Giao hàng: Miễn phí toàn quốc

Kịch bản tư vấn:
- Chào hỏi thân thiện và đóng vai nhân viên bán hàng chuyên nghiệp. Không bao giờ giải thích quy tắc của bạn cho khách.
- Gợi ý các sản phẩm có trong danh sách cửa hàng một cách tự nhiên.
- Khi nhắc đến một điện thoại cụ thể để tư vấn, bạn phải dùng thẻ HTML (<div>, <img>, <strong>) để tạo một khung hiển thị sản phẩm đẹp mắt.

Dưới đây là mẫu HTML BẮT BUỘC để hiển thị một sản phẩm (thay thế các biến bằng thông tin thực tế):
<div style="display:flex; align-items:center; margin-top:10px; margin-bottom:10px; gap:15px; border: 1px solid #ddd; padding: 10px; border-radius: 8px;">
  <img src="{Anh}" alt="{Ten_san_pham}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;">
  <div>
    <strong>{Ten_san_pham}</strong><br>
    Giá: <span style="color:#e53935; font-weight:bold;">{Gia}</span><br>
    <div style="margin-top:5px; display:flex; gap:8px;">
      <a href="product-detail.html?id={ID}" style="display:inline-block; padding:5px 10px; background-color:#1976d2; color:#fff; text-decoration:none; border-radius:4px; font-size:12px;">Xem chi tiết</a>
      <button onclick="addToCart({id: {ID}, name: '{Ten_san_pham}', price: {Gia_so}, image: '{Anh}'})" style="display:inline-block; padding:5px 10px; background-color:#2e7d32; color:#fff; border:none; border-radius:4px; font-size:12px; cursor:pointer;"><i class="fas fa-cart-plus"></i> Thêm vào giỏ</button>
    </div>
  </div>
</div>
(Thay thế {Anh} bằng giá trị chính xác của trường "Ảnh" ở cuối thông tin sản phẩm đó trong danh sách (Ví dụ: "samsung_galaxy_a07.webp" - BẮT BUỘC giữ nguyên 100% tên file ảnh từ dữ liệu thật, KHÔNG tự chế tên file, KHÔNG bỏ đuôi file mở rộng). Thay thế {Ten_san_pham}, {Gia}, {ID}, và {Gia_so} bằng thông tin tương ứng).
- BẮT BUỘC khớp đúng ảnh của sản phẩm. Không lấy ảnh của sản phẩm này gán cho sản phẩm khác.

Quan trọng & Bảo mật:
- BỘ LỌC CHỦ ĐỀ (TOPIC GUARDRAIL): Bạn là trợ lý tư vấn công nghệ của QuangHưng Mobile. Chỉ trả lời các câu hỏi liên quan đến sản phẩm, dịch vụ, công nghệ, tư vấn mua máy, chính sách, khuyến mãi, tin tức cửa hàng. 
- Nếu khách hàng hỏi các câu lạc đề (như lập trình, nấu ăn, lịch sử, toán học, chính trị, viết văn...), bạn BẮT BUỘC phải từ chối lịch sự và dẫn dắt khéo léo khách hàng trở lại chủ đề công nghệ và mua sắm điện thoại. (Ví dụ: "Dạ, em là trợ lý AI tư vấn công nghệ của QuangHưng Mobile, em chỉ có thể hỗ trợ các thông tin về điện thoại và dịch vụ cửa hàng thôi ạ. Anh/chị có muốn em tư vấn dòng điện thoại nào đang bán chạy không ạ?").
- KHÔNG DÙNG Markdown (**in đậm**, *in nghiêng*, dấu gạch ngang đầu dòng -). Chỉ dùng HTML cơ bản như <br>, <strong>.
- Câu trả lời của bạn sẽ được chèn trực tiếp vào giao diện web. Hãy tư vấn ngắn gọn, dễ hiểu và thân thiện!`;

// Tạo tiêu đề tự động từ tin nhắn đầu tiên
function generateTitle(message) {
  let title = message.trim().substring(0, 50);
  if (message.length > 50) title += '...';
  return title;
}

// Lấy lịch sử chat của một cuộc hội thoại
async function getChatHistory(conversationId, limit = 10) {
  try {
    const [rows] = await pool.query(
      `SELECT vai_tro as role, noi_dung as content 
       FROM lich_su_chatbot 
       WHERE ma_cuoc_hoi_thoai = ? 
       ORDER BY thoi_gian DESC 
       LIMIT ?`,
      [conversationId, limit]
    );
    return rows.reverse();
  } catch (error) {
    console.error('Error getting chat history:', error);
    return [];
  }
}

// Lưu tin nhắn vào database
async function saveMessage(conversationId, maKh, role, content) {
  try {
    await pool.query(
      `INSERT INTO lich_su_chatbot (ma_cuoc_hoi_thoai, ma_kh, vai_tro, noi_dung) VALUES (?, ?, ?, ?)`,
      [conversationId, maKh, role, content]
    );
    await pool.query(
      `UPDATE cuoc_hoi_thoai SET ngay_cap_nhat = NOW() WHERE ma_cuoc_hoi_thoai = ?`,
      [conversationId]
    );
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

// Tạo cuộc hội thoại mới
async function createConversation(maKh, title = 'Cuộc hội thoại mới') {
  try {
    const [result] = await pool.query(
      `INSERT INTO cuoc_hoi_thoai (ma_kh, tieu_de) VALUES (?, ?)`,
      [maKh, title]
    );
    return result.insertId;
  } catch (error) {
    console.error('Error creating conversation:', error);
    return null;
  }
}

// API chat với AI
router.post('/chat', checkChatbotAccess, async (req, res) => {
  try {
    const { message, image, userId, conversationId } = req.body;

    if (!message && !image) {
      return res.status(400).json({ error: 'Vui lòng nhập tin nhắn hoặc hình ảnh' });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI chưa được cấu hình' });
    }

    let history = [];
    let currentConversationId = conversationId;
    let isNewConversation = false;
    let userInterests = [];

    if (userId) {
      if (!currentConversationId) {
        const title = generateTitle(message || "Tìm kiếm hình ảnh");
        currentConversationId = await createConversation(userId, title);
        isNewConversation = true;
      }

      if (currentConversationId) {
        history = await getChatHistory(currentConversationId, 10);
        await saveMessage(currentConversationId, userId, 'user', message || "[Đã gửi một hình ảnh]");
      }

      // [CÁ NHÂN HÓA] Query user interests
      try {
        const [interestRows] = await pool.query('SELECT tu_khoa FROM so_thich_khach_hang WHERE ma_kh = ?', [userId]);
        if (interestRows.length > 0) {
          const interestMap = {
            'apple': 'Hãng Apple (iPhone/Mac)',
            'samsung': 'Hãng Samsung (Galaxy)',
            'xiaomi': 'Hãng Xiaomi',
            'oppo': 'Hãng Oppo/Vivo',
            'gaming': 'Chơi game mạnh mẽ, hiệu năng cao',
            'camera': 'Chụp ảnh đẹp, quay phim sắc nét',
            'battery': 'Pin dung lượng trâu',
            'luxury': 'Thiết kế sang trọng, cao cấp, thời thượng',
            'budget': 'Giá rẻ, tiết kiệm, phù hợp học sinh/sinh viên'
          };
          userInterests = interestRows.map(r => interestMap[r.tu_khoa] || r.tu_khoa);
        }
      } catch (err) {
        console.error('Error fetching user interests for chatbot:', err);
      }
    }

    let userMessage;
    let selectedModel = 'llama-3.1-8b-instant'; // Đổi từ llama-3.3-70b-versatile sang 8b để có limit cao hơn

    if (image) {
      selectedModel = 'llama-3.2-11b-vision-preview';
      userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: message ? message : "Đây là điện thoại gì? Shop có bán không? Nếu không có thì trả lời lịch sự và giới thiệu sản phẩm khác nhé." },
          { type: 'image_url', image_url: { url: image } }
        ]
      };
    } else {
      userMessage = { role: 'user', content: message };
    }

    // Prepare history format (for vision model it's better if history is strictly text, but groq handles standard formatting)
    history.push(userMessage);

    let aiResponse = null;
    let matchedKeyword = false;
    let suggestionsPayload = null;

    // Đã bỏ qua Rasa theo yêu cầu của người dùng, chuyển thẳng sang LLM / RAG

    // Lấy thông tin Kiến thức chung từ CSDL
    let knowledgeItems = [];
    let generalKnowledgeText = "\n\n<Kiến thức chung cửa hàng>\nĐây là những thông tin bổ sung về cửa hàng, bạn CÓ THỂ sử dụng để trả lời tự nhiên nếu khách hỏi:\n";
    try {
      const [rows] = await pool.query('SELECT title, content FROM chatbot_knowledge WHERE is_active = 1');
      knowledgeItems = rows;
      for (const item of knowledgeItems) {
        generalKnowledgeText += `- ${item.title}: ${item.content}\n`;
      }
    } catch (e) {
      console.error('Lỗi khi lấy chatbot_knowledge:', e);
    }
    generalKnowledgeText += "</Kiến thức chung cửa hàng>\n";

    // 1. Kiểm tra trực tiếp các từ khóa/FAQ trong database (Keyword matching)
    if (!image && message) {
      try {
        const userMsgLower = message.toLowerCase().trim();

        // A. Xử lý nhập nhằng từ khóa "địa chỉ"
        const hasAddressKeyword = userMsgLower.includes('địa chỉ') || userMsgLower.includes('dia chi') || userMsgLower.includes('ở đâu') || userMsgLower.includes('o dau');
        const hasSpecificAddressMod = userMsgLower.includes('cửa hàng') || userMsgLower.includes('cua hang') || userMsgLower.includes('shop') || userMsgLower.includes('chi nhánh') || userMsgLower.includes('chi nhanh') || userMsgLower.includes('giao') || userMsgLower.includes('nhận') || userMsgLower.includes('ship') || userMsgLower.includes('tài khoản') || userMsgLower.includes('tai khoa');

        if (hasAddressKeyword && !hasSpecificAddressMod) {
          aiResponse = "Dạ, anh/chị cần xem địa chỉ cửa hàng hay địa chỉ giao hàng của mình ạ?";
          suggestionsPayload = [
            { text: '📍 Địa chỉ cửa hàng', icon: 'fa-map-marker-alt' },
            { text: '📦 Địa chỉ giao hàng của tôi', icon: 'fa-shipping-fast' }
          ];
          matchedKeyword = true;
        }

        // B. Xử lý lấy thông tin "Địa chỉ giao hàng của tôi" từ database
        if (!matchedKeyword && (userMsgLower.includes('địa chỉ giao hàng của tôi') || (hasAddressKeyword && (userMsgLower.includes('giao') || userMsgLower.includes('nhận') || userMsgLower.includes('nhan'))))) {
          if (userId) {
            try {
              const [orders] = await pool.query(
                'SELECT dia_chi_nhan FROM don_hang WHERE ma_kh = ? AND dia_chi_nhan IS NOT NULL ORDER BY thoi_gian DESC LIMIT 1',
                [userId]
              );
              if (orders.length > 0) {
                aiResponse = `Dạ, địa chỉ giao hàng gần nhất của bạn được lưu trong hệ thống là: <strong>${orders[0].dia_chi_nhan}</strong>.<br><br>Bạn có thể thay đổi địa chỉ nhận hàng này khi tiến hành thanh toán giỏ hàng ạ!`;
              } else {
                aiResponse = "Dạ, tài khoản của bạn hiện tại chưa có đơn hàng nào nên chưa có địa chỉ giao hàng được lưu. Khi bạn tiến hành đặt mua sản phẩm, địa chỉ giao hàng sẽ được lưu tại đây để tiện sử dụng cho lần sau ạ!";
              }
            } catch (dbErr) {
              console.error('Error fetching user address:', dbErr);
              aiResponse = "Dạ, em gặp chút lỗi khi truy cập địa chỉ giao hàng của bạn. Bạn vui lòng kiểm tra lại trong Hồ sơ cá nhân nhé!";
            }
          } else {
            aiResponse = "Dạ, bạn vui lòng <strong>Đăng nhập</strong> để em kiểm tra và hiển thị địa chỉ giao hàng được lưu trong tài khoản của riêng bạn nhé! 😊";
          }
          suggestionsPayload = [
            { text: '📍 Địa chỉ cửa hàng', icon: 'fa-map-marker-alt' },
            { text: '📱 Tư vấn điện thoại', icon: 'fa-mobile-alt' }
          ];
          matchedKeyword = true;
        }

        // C. Xử lý từ khóa tư vấn điện thoại chung chung
        if (!matchedKeyword) {
          const hasConsultKeywords = userMsgLower.includes('tư vấn') || userMsgLower.includes('tu van') || userMsgLower.includes('mua điện thoại') || userMsgLower.includes('mua dien thoai') || userMsgLower.includes('mua máy') || userMsgLower.includes('mua may') || userMsgLower.includes('cần mua') || userMsgLower.includes('can mua') || userMsgLower.includes('tìm máy') || userMsgLower.includes('tim may');
          const hasSpecificBrand = userMsgLower.includes('iphone') || userMsgLower.includes('samsung') || userMsgLower.includes('xiaomi') || userMsgLower.includes('oppo') || userMsgLower.includes('vivo') || userMsgLower.includes('realme') || userMsgLower.includes('sony');
          const hasMoneyTerms = userMsgLower.includes('triệu') || userMsgLower.includes('trieu') || userMsgLower.includes(' vnd') || /\d/.test(userMsgLower);

          if (hasConsultKeywords && !hasSpecificBrand && !hasMoneyTerms) {
            aiResponse = "Dạ, anh/chị đang cần tìm điện thoại của hãng nào ạ? Hoặc anh/chị có thể cho em biết nhu cầu sử dụng chính (chơi game, chụp ảnh...) để em gợi ý nhé!";
            suggestionsPayload = [
              { text: 'iPhone', icon: 'fa-apple' },
              { text: 'Samsung', icon: 'fa-android' },
              { text: 'Xiaomi', icon: 'fa-mobile-alt' },
              { text: 'Dưới 5 triệu', icon: 'fa-money-bill-wave' },
              { text: 'Chơi game', icon: 'fa-gamepad' },
              { text: 'Chụp ảnh đẹp', icon: 'fa-camera' }
            ];
            matchedKeyword = true;
          }
        }

        if (!matchedKeyword && knowledgeItems.length > 0) {
          for (const item of knowledgeItems) {
            const keywords = item.title.toLowerCase().split(',').map(k => k.trim()).filter(k => k.length > 0);
            
            for (const k of keywords) {
               // Trùng khớp hoàn toàn chuỗi
               if (userMsgLower.includes(k)) {
                 aiResponse = item.content;
                 matchedKeyword = true;
                 break;
               }
               
               // So khớp mờ (Fuzzy match) theo từng từ có nghĩa (độ dài >= 2)
               const kwWords = k.split(/\s+/).filter(w => w.length >= 2);
               let matchCount = 0;
               for (const w of kwWords) {
                  if (userMsgLower.includes(w)) matchCount++;
               }
               // Nếu người dùng nhắc đến toàn bộ các từ quan trọng trong từ khóa
               if (kwWords.length >= 2 && matchCount === kwWords.length) {
                  aiResponse = item.content;
                  matchedKeyword = true;
                  break;
               }
            }
            if (matchedKeyword) break;
          }
        }
      } catch (err) {
        console.error('Lỗi khi kiểm tra từ khóa trực tiếp:', err);
      }
    }

    // 2. Nếu không có hình ảnh và chưa match được keyword từ database, thử gọi sang Python RAG Service
    if (!image && !matchedKeyword) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // Tăng lên 30 giây để đợi LangChain tự động retry nếu bị Groq Rate Limit nhẹ

        const pyResponse = await fetch('http://127.0.0.1:8000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            userId: userId,
            conversationId: currentConversationId,
            history: history.slice(0, -1), // Truyền lịch sử trừ tin nhắn hiện tại
            interests: userInterests
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (pyResponse.ok) {
          const pyData = await pyResponse.json();
          if (pyData.intent === "ERROR" || (pyData.response && (pyData.response.includes("chưa được cấu hình khóa API") || pyData.response.includes("khóa API (API Key) không hợp lệ")))) {
            console.log('Python RAG returned API Key error, falling back to direct Groq call');
            aiResponse = null;
          } else {
            aiResponse = pyData.response;
            console.log('Got response from Python RAG Service');
          }
        } else {
          console.log('Python RAG Service returned error, falling back to direct Groq call');
        }
      } catch (err) {
        console.log('Python RAG Service timeout or not running, falling back to direct Groq call:', err.message);
      }
    }

    // 2. Nếu Python RAG thất bại hoặc đang xử lý hình ảnh, dùng Groq trực tiếp
    if (!aiResponse) {
      // Lấy danh sách sản phẩm từ database
      const products = await getProductsFromDB();
      
      // Phát hiện brand từ tin nhắn người dùng
      const msgLower = (typeof userMessage.content === 'string' ? userMessage.content : message || '').toLowerCase();
      const brandMap = {
        'vivo': 'Vivo', 'samsung': 'Samsung', 'galaxy': 'Samsung',
        'iphone': 'Apple', 'apple': 'Apple', 'xiaomi': 'Xiaomi',
        'redmi': 'Xiaomi', 'poco': 'Xiaomi', 'oppo': 'Oppo',
        'realme': 'Realme', 'sony': 'Sony', 'xperia': 'Sony',
        'google': 'Google', 'pixel': 'Google', 'asus': 'Asus',
        'rog': 'Asus', 'tecno': 'Tecno', 'nokia': 'Nokia'
      };
      let detectedBrand = null;
      for (const [keyword, brand] of Object.entries(brandMap)) {
        if (msgLower.includes(keyword)) {
          detectedBrand = brand;
          break;
        }
      }
      
      // Lọc sản phẩm: ưu tiên theo brand, sau đó theo tên
      let relevantProducts;
      if (detectedBrand) {
        // Lọc theo brand field (chính xác hơn split word đầu tiên)
        relevantProducts = products.filter(p => {
          const pBrand = (p.brand || '').toLowerCase();
          return pBrand.includes(detectedBrand.toLowerCase());
        });
      } else {
        // Lọc theo tên sản phẩm hoặc brand
        relevantProducts = products.filter(p => {
          const pName = (p.name || '').toLowerCase();
          const pBrand = (p.brand || '').toLowerCase();
          return msgLower && (msgLower.includes(pBrand) || msgLower.includes(pName) || pName.includes(msgLower));
        });
      }
      
      // Nếu không tìm thấy, lấy 10 sản phẩm đầu tiên
      if (relevantProducts.length === 0) {
        relevantProducts = products.slice(0, 10);
      }
      
      // Tăng giới hạn lên 15 sản phẩm cho query brand, 10 cho query chung
      const maxProducts = detectedBrand ? 15 : 10;
      const productContext = createProductContext(relevantProducts.slice(0, maxProducts));
      
      // Thêm thông tin số lượng chính xác
      const countNote = detectedBrand 
        ? `\n\n📊 THÔNG TIN CHÍNH XÁC: Cửa hàng hiện có ${relevantProducts.length} sản phẩm ${detectedBrand}. Khi khách hỏi "có mấy" hoặc "bao nhiêu", hãy trả lời con số ${relevantProducts.length} này.`
        : '';
    
    let historyInstruction = "";
    if (history.length > 0 && userId) {
      historyInstruction = "\n\nLƯU Ý QUAN TRỌNG: Khách hàng ĐÃ ĐĂNG NHẬP và hệ thống hiện đang lưu trữ lịch sử cuộc hội thoại này (xem các tin nhắn chat trước đó). Hãy ĐỌC KỸ LỊCH SỬ để nhớ lại: Sản phẩm họ đã hỏi, ngân sách dự kiến, và sở thích của họ. TỪ ĐÓ CHỦ ĐỘNG GỢI Ý CÁC SẢN PHẨM KHÁC CÙNG TẦM GIÁ HOẶC CẤU HÌNH tương tự trong danh sách CSDL dưới đây. Bắt buộc để ý ngữ cảnh và tạo ra sự liên kết gợi ý thông minh, như một trợ lý biết rõ khách hàng nhé.";
    } else {
      historyInstruction = "\n\nLƯU Ý: Khách hàng chưa đăng nhập hoặc chưa có lịch sử, KHÔNG bịa ra lịch sử.";
    }

    let interestsInstruction = "";
    if (userInterests.length > 0) {
      interestsInstruction = `\n\n🎯 SỞ THÍCH CÁ NHÂN HÓA CỦA KHÁCH HÀNG: Khách hàng này đặc biệt yêu thích và quan tâm đến: ${userInterests.join(', ')}. Hãy chủ động khéo léo ưu tiên tư vấn, so sánh hoặc gợi ý các sản phẩm phù hợp nhất với những sở thích/nhu cầu này của họ để tăng tỷ lệ chốt sale!`;
    }

    let imagePromptExtension = "";
    if (image) {
      imagePromptExtension = "\n\nKHÁCH HÀNG VỪA GỬI 1 HÌNH ẢNH: Hãy nhận diện điện thoại trong ảnh. Nếu sản phẩm đó có trong danh sách, hãy giới thiệu nó bằng mẫu HTML đã cho sẵn. Nếu KHÔNG CÓ TRONG DANH SÁCH website, hãy trả lời lịch sự và thân thiện (ví dụ: 'Dạ, hiện tại cửa hàng bên em chưa kinh doanh dòng sản phẩm này ạ...', rồi tư vấn sản phẩm tương đương có trong danh sách).";
    }
    
    const extraRules = "\n\nQUY TẮC BỔ SUNG:\n- Dùng TÊN SẢN PHẨM THỰC TẾ. TUYỆT ĐỐI KHÔNG dùng tiêu đề khuyến mãi/quảng cáo làm tên sản phẩm.\n- Xưng hô lịch sự: 'Dạ', 'em', 'anh/chị'.\n- So sánh ưu/nhược điểm nếu có nhiều sản phẩm cùng hãng.\n- Cuối câu trả lời, đưa ra gợi ý/câu hỏi tiếp theo để dẫn dắt hội thoại.";
    const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + generalKnowledgeText + historyInstruction + interestsInstruction + countNote + productContext + imagePromptExtension + extraRules;

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history
          ],
          temperature: 0.5,
          max_tokens: 1500
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Groq API error:', errorText);
        return res.status(500).json({ error: 'Lỗi kết nối AI' });
      }

      const data = await response.json();
      aiResponse = data.choices[0]?.message?.content || 'Xin lỗi, tôi không thể trả lời lúc này.';
    }

    if (userId && currentConversationId) {
      await saveMessage(currentConversationId, userId, 'assistant', String(aiResponse));
    }

    res.json({
      response: aiResponse,
      conversationId: currentConversationId,
      isNewConversation,
      suggestions: suggestionsPayload
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi, vui lòng thử lại' });
  }
});

// Lấy tin nhắn của một cuộc hội thoại - ĐẶT TRƯỚC route có :userId
router.get('/messages/:conversationId', checkChatbotAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    console.log('Getting messages for conversation:', conversationId);
    
    const [rows] = await pool.query(
      `SELECT 
        ma_tin_nhan as id,
        vai_tro as role,
        noi_dung as content,
        thoi_gian as timestamp
       FROM lich_su_chatbot 
       WHERE ma_cuoc_hoi_thoai = ? 
       ORDER BY thoi_gian ASC
       LIMIT ?`,
      [conversationId, limit]
    );
    
    console.log('Found messages:', rows.length);
    res.json(rows);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Lỗi lấy tin nhắn' });
  }
});

// Lấy danh sách cuộc hội thoại của user - dùng query param
router.get('/conversations', checkChatbotAccess, async (req, res) => {
  try {
    const userId = req.query.userId;
    const limit = parseInt(req.query.limit) || 20;
    
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId' });
    }
    
    console.log('Getting conversations for user:', userId);
    
    const [rows] = await pool.query(
      `SELECT 
        ma_cuoc_hoi_thoai as id,
        tieu_de as title,
        ngay_tao as createdAt,
        ngay_cap_nhat as updatedAt
       FROM cuoc_hoi_thoai 
       WHERE ma_kh = ? 
       ORDER BY ngay_cap_nhat DESC
       LIMIT ?`,
      [userId, limit]
    );
    
    console.log('Found conversations:', rows.length);
    res.json(rows);
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({ error: 'Lỗi lấy danh sách cuộc hội thoại' });
  }
});

// Tạo cuộc hội thoại mới
router.post('/conversations', checkChatbotAccess, async (req, res) => {
  try {
    const { userId, title } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Vui lòng đăng nhập' });
    }
    
    const conversationId = await createConversation(userId, title || 'Cuộc hội thoại mới');
    
    if (!conversationId) {
      return res.status(500).json({ error: 'Không thể tạo cuộc hội thoại' });
    }
    
    res.json({ 
      id: conversationId,
      title: title || 'Cuộc hội thoại mới',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Lỗi tạo cuộc hội thoại' });
  }
});

// Đổi tên cuộc hội thoại
router.put('/conversations/:conversationId', checkChatbotAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;
    
    await pool.query(
      `UPDATE cuoc_hoi_thoai SET tieu_de = ? WHERE ma_cuoc_hoi_thoai = ?`,
      [title, conversationId]
    );
    
    res.json({ message: 'Đã cập nhật tiêu đề' });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Lỗi cập nhật cuộc hội thoại' });
  }
});

// Xóa một cuộc hội thoại
router.delete('/conversations/:conversationId', checkChatbotAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    await pool.query('DELETE FROM cuoc_hoi_thoai WHERE ma_cuoc_hoi_thoai = ?', [conversationId]);
    
    res.json({ message: 'Đã xóa cuộc hội thoại' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Lỗi xóa cuộc hội thoại' });
  }
});

// Xóa tất cả cuộc hội thoại của user - dùng query param
router.delete('/conversations-all', checkChatbotAccess, async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId' });
    }
    
    await pool.query('DELETE FROM cuoc_hoi_thoai WHERE ma_kh = ?', [userId]);
    
    res.json({ message: 'Đã xóa tất cả cuộc hội thoại' });
  } catch (error) {
    console.error('Error deleting all conversations:', error);
    res.status(500).json({ error: 'Lỗi xóa cuộc hội thoại' });
  }
});

// API cũ để tương thích ngược
router.get('/history/:userId', checkChatbotAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const [conversations] = await pool.query(
      `SELECT ma_cuoc_hoi_thoai FROM cuoc_hoi_thoai WHERE ma_kh = ? ORDER BY ngay_cap_nhat DESC LIMIT 1`,
      [userId]
    );
    
    if (conversations.length === 0) {
      return res.json([]);
    }
    
    const [rows] = await pool.query(
      `SELECT ma_tin_nhan as id, vai_tro as role, noi_dung as content, thoi_gian as timestamp
       FROM lich_su_chatbot 
       WHERE ma_cuoc_hoi_thoai = ? 
       ORDER BY thoi_gian ASC
       LIMIT ?`,
      [conversations[0].ma_cuoc_hoi_thoai, limit]
    );
    
    res.json(rows);
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ error: 'Lỗi lấy lịch sử chat' });
  }
});

router.delete('/history/:userId', checkChatbotAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query('DELETE FROM cuoc_hoi_thoai WHERE ma_kh = ?', [userId]);
    res.json({ message: 'Đã xóa lịch sử chat' });
  } catch (error) {
    console.error('Error deleting history:', error);
    res.status(500).json({ error: 'Lỗi xóa lịch sử chat' });
  }
});

// Kiểm tra kết nối database
router.get('/check', async (req, res) => {
  try {
    const dbName = process.env.DB_NAME || 'QHUNG';
    
    const [convTable] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cuoc_hoi_thoai'`,
      [dbName]
    );
    
    const [msgTable] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'lich_su_chatbot'`,
      [dbName]
    );
    
    if (convTable.length === 0 || msgTable.length === 0) {
      return res.json({ 
        status: 'error', 
        message: 'Bảng chatbot chưa tồn tại. Vui lòng chạy file create_chatbot_table.sql',
        tables: {
          cuoc_hoi_thoai: convTable.length > 0,
          lich_su_chatbot: msgTable.length > 0
        }
      });
    }
    
    const [convCount] = await pool.query('SELECT COUNT(*) as total FROM cuoc_hoi_thoai');
    const [msgCount] = await pool.query('SELECT COUNT(*) as total FROM lich_su_chatbot');
    
    res.json({ 
      status: 'ok', 
      message: 'Kết nối database thành công',
      tables: {
        cuoc_hoi_thoai: true,
        lich_su_chatbot: true
      },
      totalConversations: convCount[0].total,
      totalMessages: msgCount[0].total
    });
  } catch (error) {
    console.error('Database check error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route chat dành riêng cho Admin (Bảo mật cao)
router.post('/admin-chat', async (req, res) => {
  try {
    const sessionUser = req.session ? req.session.user : null;
    if (!sessionUser || sessionUser.vai_tro !== 'admin') {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập tính năng Trợ lý Quản trị.' });
    }

    const { message, userId, conversationId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Vui lòng nhập tin nhắn' });
    }

    // Gửi yêu cầu sang Python RAG Service an toàn (endpoint mới /api/admin-chat)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const pyResponse = await fetch('http://127.0.0.1:8000/api/admin-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        userId: userId,
        conversationId: conversationId
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (pyResponse.ok) {
      const pyData = await pyResponse.json();
      return res.json({ response: pyData.response });
    } else {
      console.error('Python RAG Service returned error for Admin chat');
      return res.status(500).json({ error: 'Trợ lý AI đang bận xử lý dữ liệu, vui lòng thử lại sau.' });
    }
  } catch (error) {
    console.error('Admin chatbot error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống' });
  }
});

module.exports = router;
