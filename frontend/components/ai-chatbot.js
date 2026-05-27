// AI Chatbot - Với lịch sử cuộc hội thoại giống ChatGPT
(function() {
  const API_URL = 'http://localhost:3000/api';
  let currentUserId = null;
  let currentConversationId = null;
  let conversations = [];
  let historyLoaded = false;
  let sidebarOpen = false;
  let currentImageBase64 = null;
  // Lấy userId từ localStorage
  function getUserId() {
    try {
      const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      if (isLoggedIn && user && user.ma_kh) {
        return user.ma_kh;
      }
      return null;
    } catch (e) {
      console.error('Error getting user:', e);
      return null;
    }
  }
  
  // Kiểm tra user đã thay đổi chưa
  function checkUserChanged() {
    const newUserId = getUserId();
    if (newUserId !== currentUserId) {
      currentUserId = newUserId;
      currentConversationId = null;
      conversations = [];
      historyLoaded = false;
      return true;
    }
    return false;
  }
  
  // Format thời gian
  function formatTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Hôm nay';
    if (days === 1) return 'Hôm qua';
    if (days < 7) return `${days} ngày trước`;
    if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
    return date.toLocaleDateString('vi-VN');
  }
  
  // Create chatbot HTML
  function createChatbotHTML() {
    const chatbotHTML = `
      <!-- Chatbot Button -->
      <button class="ai-chatbot-btn" id="ai-chatbot-btn" title="Chat với AI">
        <img src="images/reindeer-avatar.svg" alt="AI Assistant">
      </button>
      
      <!-- Chat Window -->
      <div class="ai-chat-window" id="ai-chat-window">
        <!-- Sidebar lịch sử -->
        <div class="ai-chat-sidebar" id="ai-chat-sidebar">
          <div class="ai-sidebar-header">
            <h4>Lịch sử chat</h4>
            <button class="ai-sidebar-close" id="ai-sidebar-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <button class="ai-new-chat-btn" id="ai-new-chat-btn">
            <i class="fas fa-plus"></i> Cuộc hội thoại mới
          </button>
          <div class="ai-conversations-list" id="ai-conversations-list">
            <!-- Danh sách cuộc hội thoại -->
          </div>
          <div class="ai-sidebar-footer">
            <button class="ai-clear-all-btn" id="ai-clear-all-btn">
              <i class="fas fa-trash"></i> Xóa tất cả
            </button>
          </div>
        </div>
        
        <!-- Main chat area -->
        <div class="ai-chat-main">
          <div class="ai-chat-header">
            <button class="ai-menu-btn" id="ai-menu-btn" title="Lịch sử chat">
              <i class="fas fa-bars"></i>
            </button>
            <div class="ai-chat-avatar">
              <img src="images/reindeer-avatar.svg" alt="AI Assistant">
            </div>
            <div class="ai-chat-info">
              <h3 class="ai-chat-title">AI Tư vấn</h3>
              <div class="ai-chat-status">Trực tuyến</div>
            </div>
            <div class="ai-chat-actions">
              <button class="ai-chat-close" id="ai-chat-close">&times;</button>
            </div>
          </div>
          
          <div class="ai-chat-messages" id="ai-chat-messages">
            <!-- Messages will be added here -->
          </div>
          
          <!-- Suggestion Chips Container -->
          <div class="ai-chat-suggestions" id="ai-chat-suggestions" style="display: none;"></div>
          
          <div class="ai-chat-input-area">
            <div class="ai-chat-input-wrapper">
              <input type="text" class="ai-chat-input" id="ai-chat-input" placeholder="Nhập câu hỏi của bạn..." autocomplete="off" spellcheck="false">
              <button class="ai-chat-voice" id="ai-chat-voice" title="Nói với AI" style="background: none; border: none; color: #666; cursor: pointer; padding: 8px; font-size: 16px; margin-right: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                <i class="fas fa-microphone"></i>
              </button>
              <button class="ai-chat-send" id="ai-chat-send">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const container = document.createElement('div');
    container.id = 'ai-chatbot-container';
    container.innerHTML = chatbotHTML;
    document.body.appendChild(container);
  }
  
  // Default Suggestion Prompts
  const DEFAULT_SUGGESTIONS = [
    { text: '📱 Tư vấn điện thoại', icon: 'fa-mobile-alt' },
    { text: '💰 Trả góp 0%', icon: 'fa-percentage' },
    { text: '📍 Địa chỉ cửa hàng', icon: 'fa-map-marker-alt' },
    { text: '🎁 Khuyến mãi mới nhất', icon: 'fa-gift' }
  ];

  // Hiển thị Suggestion Chips
  function renderSuggestions(suggestionsList) {
    const container = document.getElementById('ai-chat-suggestions');
    if (!container) return;

    if (!suggestionsList || suggestionsList.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    let html = '';
    suggestionsList.forEach(s => {
      const text = typeof s === 'string' ? s : s.text;
      const icon = typeof s === 'string' ? 'fa-lightbulb' : (s.icon || 'fa-lightbulb');
      html += `
        <button class="ai-suggestion-chip" data-text="${escapeHtml(text)}">
          <i class="fas ${icon}"></i>
          <span>${escapeHtml(text)}</span>
        </button>
      `;
    });

    container.innerHTML = html;
    container.style.display = 'flex';

    // Bắt sự kiện click vào Chip
    container.querySelectorAll('.ai-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.text;
        sendMessage(text);
      });
    });
  }

  // Tự động phát hiện gợi ý dựa trên tin nhắn phản hồi của Bot (Client-side fallback)
  function autoDetectSuggestions(botResponse) {
    if (!botResponse) {
      renderSuggestions(DEFAULT_SUGGESTIONS);
      return;
    }
    const lowerText = botResponse.toLowerCase();

    // 1. Nhập nhằng địa chỉ
    if (lowerText.includes('địa chỉ các chi nhánh') || lowerText.includes('địa chỉ cửa hàng') || lowerText.includes('địa chỉ giao hàng') || lowerText.includes('địa chỉ nhận hàng')) {
      renderSuggestions([
        { text: '📍 Địa chỉ cửa hàng', icon: 'fa-map-marker-alt' },
        { text: '📦 Địa chỉ giao hàng của tôi', icon: 'fa-shipping-fast' }
      ]);
    }
    // 2. Hỏi tư vấn chung chung
    else if (lowerText.includes('tầm tài chính') || lowerText.includes('hãng điện thoại') || lowerText.includes('nhu cầu chính') || lowerText.includes('tư vấn dòng điện thoại')) {
      renderSuggestions([
        { text: 'Dưới 5 triệu', icon: 'fa-money-bill-wave' },
        { text: 'Từ 5 - 10 triệu', icon: 'fa-money-bill-wave' },
        { text: 'iPhone', icon: 'fa-mobile-alt' },
        { text: 'Samsung', icon: 'fa-mobile-alt' },
        { text: 'Chơi game', icon: 'fa-gamepad' },
        { text: 'Chụp ảnh đẹp', icon: 'fa-camera' }
      ]);
    }
    // 3. Mặc định khác
    else {
      renderSuggestions(DEFAULT_SUGGESTIONS);
    }
  }

  // Load danh sách cuộc hội thoại
  async function loadConversations() {
    const userId = getUserId();
    if (!userId) {
      conversations = [];
      renderConversationsList();
      return;
    }
    
    try {
      console.log('Loading conversations for user:', userId);
      const response = await fetch(`${API_URL}/chatbot/conversations?userId=${userId}`);
      if (response.ok) {
        conversations = await response.json();
        console.log('Loaded conversations:', conversations);
        renderConversationsList();
      } else {
        console.error('Failed to load conversations:', response.status);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }
  
  // Render danh sách cuộc hội thoại
  function renderConversationsList() {
    const listContainer = document.getElementById('ai-conversations-list');
    const userId = getUserId();
    
    if (!userId) {
      listContainer.innerHTML = `
        <div class="ai-no-history">
          <i class="fas fa-sign-in-alt"></i>
          <p>Đăng nhập để lưu lịch sử chat</p>
        </div>
      `;
      return;
    }
    
    if (conversations.length === 0) {
      listContainer.innerHTML = `
        <div class="ai-no-history">
          <i class="fas fa-comments"></i>
          <p>Chưa có cuộc hội thoại nào</p>
        </div>
      `;
      return;
    }
    
    // Nhóm theo thời gian
    const today = [];
    const yesterday = [];
    const thisWeek = [];
    const older = [];
    
    const now = new Date();
    conversations.forEach(conv => {
      const date = new Date(conv.updatedAt);
      const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      if (diff === 0) today.push(conv);
      else if (diff === 1) yesterday.push(conv);
      else if (diff < 7) thisWeek.push(conv);
      else older.push(conv);
    });
    
    let html = '';
    
    if (today.length > 0) {
      html += `<div class="ai-conv-group"><div class="ai-conv-group-title">Hôm nay</div>`;
      today.forEach(conv => { html += renderConversationItem(conv); });
      html += `</div>`;
    }
    
    if (yesterday.length > 0) {
      html += `<div class="ai-conv-group"><div class="ai-conv-group-title">Hôm qua</div>`;
      yesterday.forEach(conv => { html += renderConversationItem(conv); });
      html += `</div>`;
    }
    
    if (thisWeek.length > 0) {
      html += `<div class="ai-conv-group"><div class="ai-conv-group-title">Tuần này</div>`;
      thisWeek.forEach(conv => { html += renderConversationItem(conv); });
      html += `</div>`;
    }
    
    if (older.length > 0) {
      html += `<div class="ai-conv-group"><div class="ai-conv-group-title">Trước đó</div>`;
      older.forEach(conv => { html += renderConversationItem(conv); });
      html += `</div>`;
    }
    
    listContainer.innerHTML = html;
    
    // Bind events
    listContainer.querySelectorAll('.ai-conv-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.ai-conv-delete')) {
          const convId = item.dataset.id;
          loadConversation(convId);
        }
      });
    });
    
    listContainer.querySelectorAll('.ai-conv-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const convId = btn.dataset.id;
        deleteConversation(convId);
      });
    });
  }
  
  // Render một item cuộc hội thoại
  function renderConversationItem(conv) {
    const isActive = conv.id == currentConversationId ? 'active' : '';
    return `
      <div class="ai-conv-item ${isActive}" data-id="${conv.id}">
        <i class="fas fa-comment-alt"></i>
        <span class="ai-conv-title">${escapeHtml(conv.title)}</span>
        <button class="ai-conv-delete" data-id="${conv.id}" title="Xóa">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
  }
  
  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Load một cuộc hội thoại cụ thể
  async function loadConversation(conversationId) {
    currentConversationId = conversationId;
    const messagesContainer = document.getElementById('ai-chat-messages');
    messagesContainer.innerHTML = '';
    
    try {
      console.log('Loading messages for conversation:', conversationId);
      const response = await fetch(`${API_URL}/chatbot/messages/${conversationId}`);
      if (response.ok) {
        const messages = await response.json();
        console.log('Loaded messages:', messages);
        messages.forEach(msg => {
          if (msg.role === 'user') {
            addUserMessage(msg.content);
          } else {
            addBotMessage(msg.content, true);
          }
        });
      } else {
        console.error('Failed to load messages:', response.status);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
      addBotMessage('Không thể tải cuộc hội thoại. Vui lòng thử lại.');
    }
    
    // Cập nhật UI
    renderConversationsList();
    closeSidebar();
  }

  
  // Bắt đầu cuộc hội thoại mới
  function startNewConversation() {
    currentConversationId = null;
    const messagesContainer = document.getElementById('ai-chat-messages');
    messagesContainer.innerHTML = '';
    
    const userId = getUserId();
    if (userId) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userName = user.ho_ten || 'bạn';
      addBotMessage(`Xin chào ${userName}! 👋\n\nTôi là trợ lý AI của QuangHưng Mobile. Bạn cần hỗ trợ gì?`);
    } else {
      addBotMessage('Xin chào! Tôi là trợ lý AI của QuangHưng Mobile. 🎄\n\nTôi có thể giúp bạn tư vấn điện thoại, thông tin khuyến mãi, bảo hành và nhiều hơn nữa.\n\n💡 Đăng nhập để lưu lịch sử chat của bạn!');
    }
    
    renderConversationsList();
    closeSidebar();
    
    // Hiển thị gợi ý mặc định ban đầu
    renderSuggestions(DEFAULT_SUGGESTIONS);
  }
  
  // Xóa một cuộc hội thoại
  async function deleteConversation(conversationId) {
    if (!confirm('Bạn có chắc muốn xóa cuộc hội thoại này?')) return;
    
    try {
      await fetch(`${API_URL}/chatbot/conversations/${conversationId}`, {
        method: 'DELETE'
      });
      
      // Nếu đang xem cuộc hội thoại này, bắt đầu mới
      if (conversationId == currentConversationId) {
        startNewConversation();
      }
      
      // Reload danh sách
      await loadConversations();
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }
  
  // Xóa tất cả cuộc hội thoại
  async function clearAllConversations() {
    const userId = getUserId();
    if (!userId) return;
    
    if (!confirm('Bạn có chắc muốn xóa TẤT CẢ lịch sử chat?')) return;
    
    try {
      await fetch(`${API_URL}/chatbot/conversations-all?userId=${userId}`, {
        method: 'DELETE'
      });
      
      conversations = [];
      currentConversationId = null;
      startNewConversation();
    } catch (error) {
      console.error('Error clearing all conversations:', error);
    }
  }
  
  // Toggle sidebar
  function toggleSidebar() {
    const sidebar = document.getElementById('ai-chat-sidebar');
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('open', sidebarOpen);
  }
  
  function closeSidebar() {
    const sidebar = document.getElementById('ai-chat-sidebar');
    sidebarOpen = false;
    sidebar.classList.remove('open');
  }
  
  // Load lịch sử chat ban đầu
  async function loadInitialChat() {
    const userId = getUserId();
    const messagesContainer = document.getElementById('ai-chat-messages');
    messagesContainer.innerHTML = '';
    
    if (!userId) {
      addBotMessage('Xin chào! Tôi là trợ lý AI của QuangHưng Mobile. 🎄\n\nTôi có thể giúp bạn tư vấn điện thoại, thông tin khuyến mãi, bảo hành và nhiều hơn nữa.\n\n💡 Đăng nhập để lưu lịch sử chat của bạn!');
      renderSuggestions(DEFAULT_SUGGESTIONS);
      return;
    }
    
    // Load danh sách cuộc hội thoại
    await loadConversations();
    
    // Nếu có cuộc hội thoại, load cuộc hội thoại gần nhất
    if (conversations.length > 0) {
      await loadConversation(conversations[0].id);
    } else {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userName = user.ho_ten || 'bạn';
      addBotMessage(`Xin chào ${userName}! 👋\n\nTôi là trợ lý AI của QuangHưng Mobile. Lịch sử chat của bạn sẽ được lưu lại.\n\nBạn cần hỗ trợ gì?`);
      renderSuggestions(DEFAULT_SUGGESTIONS);
    }
  }
  
  // Add bot message
  function addBotMessage(text, isHTML = false) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ai-message bot';
    
    let contentHtml = isHTML ? text : text.replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
      <div class="ai-msg-content">${contentHtml}</div>
      <div class="ai-msg-actions" style="margin-top: 8px; display: flex; justify-content: flex-end; opacity: 0.6; transition: opacity 0.2s;">
        <button class="ai-msg-speak" style="background: none; border: none; padding: 2px 6px; cursor: pointer; color: #1e3c72; font-size: 12px; display: flex; align-items: center; gap: 4px;" title="Nghe đọc tin nhắn">
          <i class="fas fa-volume-up"></i> <span>Nghe</span>
        </button>
      </div>
    `;
    
    // Bind speak event
    const speakBtn = messageDiv.querySelector('.ai-msg-speak');
    speakBtn.addEventListener('click', () => {
      // Extract text content only (strip HTML tags)
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = contentHtml;
      
      // Remove any button text or detail links from text to read
      tempDiv.querySelectorAll('button, a, style, script').forEach(el => el.remove());
      
      const cleanText = tempDiv.innerText || tempDiv.textContent;
      speakText(cleanText, speakBtn);
    });
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  let currentUtterance = null;
  let speechQueue = [];
  let speechQueueIndex = 0;
  let currentSpeechButton = null;

  // Split text into safe chunks under maxLength to prevent browser TTS cutoff
  function splitTextIntoChunks(text, maxLength = 160) {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length <= maxLength) return [cleanText];

    const chunks = [];
    let remaining = cleanText;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitIndex = -1;
      const punctuationMarks = ['.', '?', '!', ';', ',', ':', '-'];
      
      for (let i = maxLength - 1; i >= Math.floor(maxLength / 2); i--) {
        if (punctuationMarks.includes(remaining[i])) {
          splitIndex = i + 1;
          break;
        }
      }

      if (splitIndex === -1) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }

      if (splitIndex <= 0) {
        splitIndex = maxLength;
      }

      const chunk = remaining.slice(0, splitIndex).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      remaining = remaining.slice(splitIndex).trim();
    }

    return chunks;
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechQueue = [];
    speechQueueIndex = 0;
    if (currentSpeechButton) {
      currentSpeechButton.querySelector('i').className = 'fas fa-volume-up';
      currentSpeechButton.querySelector('span').textContent = 'Nghe';
      currentSpeechButton.classList.remove('speaking');
      currentSpeechButton = null;
    }
    currentUtterance = null;
  }

  function playNextChunk() {
    if (speechQueueIndex >= speechQueue.length) {
      // Completed all chunks successfully
      stopSpeaking();
      return;
    }

    const chunk = speechQueue[speechQueueIndex];
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = 'vi-VN';

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      let viVoice = voices.find(v => {
        const l = v.lang.toLowerCase().replace('_', '-');
        return l === 'vi-vn';
      });
      if (!viVoice) {
        viVoice = voices.find(v => {
          const l = v.lang.toLowerCase().replace('_', '-');
          return l.startsWith('vi');
        });
      }
      if (viVoice) {
        utterance.voice = viVoice;
      }
    }

    utterance.rate = 0.95; // Premium, natural voice pace for Vietnamese
    currentUtterance = utterance;

    utterance.onend = () => {
      if (speechQueue.length === 0) return;
      speechQueueIndex++;
      playNextChunk();
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      if (speechQueue.length === 0) return;
      speechQueueIndex++;
      playNextChunk();
    };

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.speak(utterance);
    }
  }

  function speakText(text, button) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('Speech synthesis not supported in this browser.');
      return;
    }

    if (window.speechSynthesis.speaking || speechQueue.length > 0) {
      const wasSameButton = (currentSpeechButton === button);
      stopSpeaking();
      if (wasSameButton) {
        return;
      }
    }

    const chunks = splitTextIntoChunks(text, 160);
    if (chunks.length === 0) return;

    speechQueue = chunks;
    speechQueueIndex = 0;
    currentSpeechButton = button;

    // UI feedback for speaking active state
    button.querySelector('i').className = 'fas fa-volume-mute';
    button.querySelector('span').textContent = 'Dừng';
    button.classList.add('speaking');

    playNextChunk();
  }

  let recognition = null;
  let isListening = false;
  
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser.');
      const micBtn = document.getElementById('ai-chat-voice');
      if (micBtn) micBtn.style.display = 'none';
      return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'vi-VN';
    
    const micBtn = document.getElementById('ai-chat-voice');
    const input = document.getElementById('ai-chat-input');
    
    micBtn.addEventListener('click', () => {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
    
    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add('listening');
      micBtn.querySelector('i').className = 'fas fa-microphone-slash';
      input.placeholder = 'Đang nghe...';
    };
    
    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove('listening');
      micBtn.querySelector('i').className = 'fas fa-microphone';
      input.placeholder = 'Nhập câu hỏi của bạn...';
    };
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      sendMessage();
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };
  }
  
  // Add user message
  function addUserMessage(text, isHTML = false) {
    const messagesContainer = document.getElementById('ai-chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'ai-message user';
    if(isHTML) {
      messageDiv.innerHTML = text;
    } else {
      messageDiv.textContent = text;
    }
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Show typing indicator
  function showTyping() {
    const messagesContainer = document.getElementById('ai-chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-typing';
    typingDiv.id = 'ai-typing';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  // Hide typing indicator
  function hideTyping() {
    const typingDiv = document.getElementById('ai-typing');
    if (typingDiv) typingDiv.remove();
  }
  
  // Call AI API
  async function callAI(message, imageBase64 = null) {
    const userId = getUserId();

    try {
      const response = await fetch(`${API_URL}/chatbot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: message,
          image: imageBase64,
          userId: userId,
          conversationId: currentConversationId
        })
      });

      if (response.status === 401) {
        console.warn('Session expired or unauthorized. Clearing conversation ID and retrying as guest...');
        currentConversationId = null;
        const retryResponse = await fetch(`${API_URL}/chatbot/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: message,
            image: imageBase64,
            userId: null,
            conversationId: null
          })
        });
        if (!retryResponse.ok) {
          throw new Error('API error on retry');
        }
        const retryData = await retryResponse.json();
        if (retryData.suggestions && Array.isArray(retryData.suggestions)) {
          renderSuggestions(retryData.suggestions);
        } else {
          autoDetectSuggestions(retryData.response);
        }
        return retryData.response + '<br><br><small style="color:#d32f2f;"><i>(Chú ý: Phiên đăng nhập của bạn đã hết hạn, tin nhắn được gửi dưới dạng khách vãng lai và không lưu lịch sử)</i></small>';
      }

      if (!response.ok) {
        throw new Error('API error');
      }

      const data = await response.json();
      
      // Cập nhật conversationId nếu là cuộc hội thoại mới
      if (data.isNewConversation && data.conversationId) {
        currentConversationId = data.conversationId;
        // Reload danh sách cuộc hội thoại
        await loadConversations();
      }
      
      // Hiển thị gợi ý nhận từ Backend hoặc phát hiện tự động
      if (data.suggestions && Array.isArray(data.suggestions)) {
        renderSuggestions(data.suggestions);
      } else {
        autoDetectSuggestions(data.response);
      }
      
      return data.response;
    } catch (error) {
      console.error('AI API error:', error);
      return 'Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau hoặc liên hệ hotline 1900.xxxx để được hỗ trợ.';
    }
  }
  
  // Send message
  async function sendMessage(customMessage = null) {
    const input = document.getElementById('ai-chat-input');
    const message = (typeof customMessage === 'string') ? customMessage.trim() : input.value.trim();

    if (!message && !currentImageBase64) return;

    // Show user message with or without image
    if (currentImageBase64) {
      addUserMessage(message ? message + '<br><img src="'+currentImageBase64+'" style="max-width:100px; max-height:100px; border-radius:4px; margin-top:5px;">' : '<img src="'+currentImageBase64+'" style="max-width:100px; max-height:100px; border-radius:4px;">', true);
    } else {
      addUserMessage(message);
    }

    const payloadMessage = message;
    const payloadImage = currentImageBase64;

    if (!customMessage) {
      input.value = '';
    }
    removePreviewImage();
    input.disabled = true;

    // Ẩn các gợi ý cũ khi đang chờ kết quả từ AI
    renderSuggestions([]);
    showTyping();

    const response = await callAI(payloadMessage, payloadImage);

    hideTyping();
    input.disabled = false;
    input.focus();

    addBotMessage(response, true);
  }

  function removePreviewImage() {
    currentImageBase64 = null;
  }

  // Initialize chatbot
  function initChatbot() {
    createChatbotHTML();
    
    const chatBtn = document.getElementById('ai-chatbot-btn');
    const chatWindow = document.getElementById('ai-chat-window');
    const closeBtn = document.getElementById('ai-chat-close');
    const menuBtn = document.getElementById('ai-menu-btn');
    const sidebarCloseBtn = document.getElementById('ai-sidebar-close');
    const newChatBtn = document.getElementById('ai-new-chat-btn');
    const clearAllBtn = document.getElementById('ai-clear-all-btn');
    const sendBtn = document.getElementById('ai-chat-send');
    const input = document.getElementById('ai-chat-input');

    // Mở/đóng chat window

      currentUserId = getUserId();

      chatBtn.addEventListener('click', async () => {
        chatWindow.classList.toggle('active');

        if (chatWindow.classList.contains('active')) {
          window.dispatchEvent(new CustomEvent('chatbot-opened'));

          const userChanged = checkUserChanged();

          if (!historyLoaded || userChanged) {
          await loadInitialChat();
          historyLoaded = true;
        }
        input.focus();
      } else {
        // Phát sự kiện để hiện floating share
        window.dispatchEvent(new CustomEvent('chatbot-closed'));
      }
    });
    
    // Close chat
    closeBtn.addEventListener('click', () => {
      chatWindow.classList.remove('active');
      closeSidebar();
      // Phát sự kiện để hiện floating share
      window.dispatchEvent(new CustomEvent('chatbot-closed'));
    });
    
    // Toggle sidebar
    menuBtn.addEventListener('click', () => {
      toggleSidebar();
    });
    
    // Close sidebar
    sidebarCloseBtn.addEventListener('click', () => {
      closeSidebar();
    });
    
    // New chat
    newChatBtn.addEventListener('click', () => {
      startNewConversation();
    });
    
    // Clear all
    clearAllBtn.addEventListener('click', () => {
      clearAllConversations();
    });
    
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    
    // Enter key
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    // Lắng nghe sự kiện storage
    window.addEventListener('storage', (e) => {
      if (e.key === 'user' || e.key === 'isLoggedIn') {
        historyLoaded = false;
      }
    });
    
    // Khởi tạo Speech Recognition
    initSpeechRecognition();

    // Pre-load / warm up voices for browsers that load them asynchronously
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }
  
  // Load when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
