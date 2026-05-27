// AI Admin Chatbot - Trợ Lý Quản Trị (BI Assistant)
(function() {
  const API_URL = 'http://localhost:3000/api';
  let adminUserId = null;
  let isOpen = false;

  // Gợi ý nhanh dành riêng cho quản trị
  const ADMIN_SUGGESTIONS = [
    { text: '📊 Doanh thu hôm nay', icon: 'fa-wallet' },
    { text: '🚨 Sản phẩm sắp hết hàng', icon: 'fa-exclamation-triangle' },
    { text: '📦 Đơn hàng mới nhất', icon: 'fa-shopping-bag' },
    { text: '⭐ Đánh giá xấu gần đây', icon: 'fa-star' }
  ];

  // Lấy admin info từ localStorage/secureStorage
  function getAdminUser() {
    try {
      let user = null;
      let adminData = null;
      
      if (window.secureStorage) {
        user = window.secureStorage.getItem('user');
        adminData = window.secureStorage.getItem('adminData');
      } else {
        user = JSON.parse(localStorage.getItem('user') || 'null');
        adminData = JSON.parse(localStorage.getItem('adminData') || 'null');
      }
      
      const activeUser = adminData || user;
      const isAdmin = localStorage.getItem('isAdmin') === 'true' || (activeUser && activeUser.vai_tro === 'admin');
      const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true' || localStorage.getItem('isAdmin') === 'true';

      if (isLoggedIn && isAdmin && activeUser) {
        return activeUser; // Tráº£ vá» thÃ´ng tin admin
      }
      return null;
    } catch (e) {
      console.error('Error getting admin:', e);
      return null;
    }
  }

  // Create Chatbot HTML for Admin
  function createAdminChatbotHTML() {
    // Check if element exists
    if (document.getElementById('admin-chatbot-container')) return;

    const html = `
      <!-- Admin Chat Button -->
      <button class="admin-chatbot-btn" id="admin-chatbot-btn" title="Hỏi Trợ lý AI BI">
        <i class="fas fa-chart-line"></i>
      </button>
      
      <!-- Admin Chat Window -->
      <div class="admin-chat-window" id="admin-chat-window">
        <!-- Header -->
        <div class="admin-chat-header">
          <div class="admin-chat-avatar">
            <i class="fas fa-brain"></i>
          </div>
          <div class="admin-chat-info">
            <h3 class="admin-chat-title">AI Trợ Lý Quản Trị</h3>
            <div class="admin-chat-status">Phân tích kinh doanh</div>
          </div>
          <button class="admin-chat-close" id="admin-chat-close" title="Đóng">&times;</button>
        </div>
        
        <!-- Messages Area -->
        <div class="admin-chat-messages" id="admin-chat-messages">
          <!-- Welcome message -->
        </div>
        
        <!-- Suggestion Chips -->
        <div class="admin-chat-suggestions" id="admin-chat-suggestions"></div>
        
        <!-- Input Area -->
        <div class="admin-chat-input-area">
          <div class="admin-chat-input-wrapper">
            <input type="text" class="admin-chat-input" id="admin-chat-input" placeholder="Hỏi doanh thu, hàng tồn, báo cáo..." autocomplete="off">
            <button class="admin-chat-send" id="admin-chat-send">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.id = 'admin-chatbot-container';
    container.innerHTML = html;
    document.body.appendChild(container);
  }

  // Show user message
  function addUserMessage(text) {
    const container = document.getElementById('admin-chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'admin-message user';
    msgDiv.textContent = text;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  // Show bot message (HTML rendering enabled by default for tables)
  function addBotMessage(text) {
    const container = document.getElementById('admin-chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'admin-message bot';
    msgDiv.innerHTML = text; // AI will output table tags directly
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  // Show typing indicator
  function showTyping() {
    const container = document.getElementById('admin-chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'admin-typing';
    typingDiv.id = 'admin-typing';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById('admin-typing');
    if (typing) typing.remove();
  }

  // Render suggestion chips
  function renderSuggestions() {
    const container = document.getElementById('admin-chat-suggestions');
    if (!container) return;

    container.innerHTML = ADMIN_SUGGESTIONS.map(s => `
      <button class="admin-suggestion-chip" data-text="${s.text}">
        <i class="fas ${s.icon}"></i>
        <span>${s.text.replace('📊 ', '').replace('🚨 ', '').replace('📦 ', '').replace('⭐ ', '')}</span>
      </button>
    `).join('');

    container.querySelectorAll('.admin-suggestion-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.text;
        sendMessage(text);
      });
    });
  }

  // Call API admin-chat secure endpoint
  async function callAdminAI(message) {
    const admin = getAdminUser();
    if (!admin) {
      return 'Lỗi: Phiên đăng nhập Admin đã hết hạn. Vui lòng đăng nhập lại.';
    }

    try {
      const response = await fetch(`${API_URL}/chatbot/admin-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          userId: admin ? (admin.ma_admin || admin.ma_nv || admin.ma_kh || 'admin') : 'admin'
        })
      });

      if (!response.ok) {
        if (response.status === 403) {
          return 'Lỗi: Bạn không có quyền truy cập dữ liệu phân tích quản trị.';
        }
        throw new Error('API Admin error');
      }

      const data = await response.json();
      return data.response;
    } catch (e) {
      console.error(e);
      return 'Xin lỗi sếp, hệ thống phân tích dữ liệu gặp sự cố kết nối. Vui lòng thử lại sau.';
    }
  }

  // Send Message function
  async function sendMessage(customText = null) {
    const input = document.getElementById('admin-chat-input');
    const text = customText ? customText : input.value.trim();

    if (!text) return;

    addUserMessage(text);
    if (!customText) input.value = '';

    input.disabled = true;
    showTyping();

    const response = await callAdminAI(text);

    hideTyping();
    input.disabled = false;
    input.focus();

    addBotMessage(response);
  }

  // Init Admin Chatbot
  function initAdminChatbot() {
    console.log('initAdminChatbot running...');
    const admin = getAdminUser();
    console.log('Admin:', admin);
    if (!admin) {
      console.log('User is not admin. Force enabling Admin AI Assistant for debug.');
    }

    createAdminChatbotHTML();

    const btn = document.getElementById('admin-chatbot-btn');
    const windowDiv = document.getElementById('admin-chat-window');
    const closeBtn = document.getElementById('admin-chat-close');
    const sendBtn = document.getElementById('admin-chat-send');
    const input = document.getElementById('admin-chat-input');

    // Mở đóng
    btn.addEventListener('click', () => {
      isOpen = !isOpen;
      windowDiv.classList.toggle('active', isOpen);
      if (isOpen) {
        // Tải lời chào nếu trống
        const msgs = document.getElementById('admin-chat-messages');
        if (msgs.children.length === 0) {
          const adminName = admin ? (admin.ho_ten || admin.ma_admin || 'Sếp') : 'Quản trị viên';
          addBotMessage(`Xin chào **${adminName}**! 📊<br><br>Tôi là trợ lý AI Phân tích Dữ liệu (BI Assistant) của QuangHưng Mobile.<br><br>Sếp có thể hỏi tôi về báo cáo doanh thu, sản phẩm tồn kho, đơn hàng mới nhất, hoặc các đánh giá gần đây. Tôi sẽ truy vấn CSDL và lập bảng thống kê ngay lập tức!`);
          renderSuggestions();
        }
        input.focus();
      }
    });

    closeBtn.addEventListener('click', () => {
      isOpen = false;
      windowDiv.classList.remove('active');
    });

    sendBtn.addEventListener('click', () => sendMessage());

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }

  // Listen for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminChatbot);
  } else {
    initAdminChatbot();
  }
})();
