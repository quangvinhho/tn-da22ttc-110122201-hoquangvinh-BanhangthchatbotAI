// Header JavaScript - Mobile Menu & Search Functionality

const API_BASE_URL = 'http://localhost:3000/api';

function initHeader() {
  // ===== USER AUTHENTICATION =====
  function checkUserLogin() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const dropdownUserName = document.getElementById('dropdown-user-name');
    
    if (isLoggedIn && user) {
      // Ẩn nút đăng nhập, hiện thông tin user
      if (loginBtn) { loginBtn.classList.add('hidden'); loginBtn.style.setProperty('display', 'none', 'important'); }
      if (userInfo) { userInfo.classList.remove('hidden'); userInfo.style.setProperty('display', 'block', 'important'); }
      
      // Lưu userInfo vào localStorage cho notification bell
      localStorage.setItem('userInfo', JSON.stringify({
        ma_kh: user.ma_kh,
        id: user.ma_kh,
        email: user.email,
        ho_ten: user.ho_ten
      }));
      
      // Khởi tạo notification bell nếu chưa có
      // (Đã thay thế bằng dropdown badge)
      
      // Load số thông báo chưa đọc cho dropdown menu
      loadDropdownNotificationCount(user.ma_kh);
      
      // Cập nhật tên user
      if (userName) userName.textContent = user.ho_ten || 'Người dùng';
      if (dropdownUserName) dropdownUserName.textContent = user.ho_ten || 'Người dùng';
      
      // Cập nhật avatar
      if (userAvatar) {
        if (user.avt) {
          userAvatar.src = user.avt;
        } else {
          // Avatar mặc định với chữ cái đầu
          userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.ho_ten || 'U')}&background=dc2626&color=fff&size=128`;
        }
        userAvatar.onerror = function() {
          this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.ho_ten || 'U')}&background=dc2626&color=fff&size=128`;
        };
      }
    } else {
      // Hiện nút đăng nhập, ẩn thông tin user
      if (loginBtn) { loginBtn.classList.remove('hidden'); loginBtn.style.removeProperty('display'); }
      if (userInfo) { userInfo.classList.add('hidden'); userInfo.style.setProperty('display', 'none', 'important'); }
      
      // Xóa userInfo
      localStorage.removeItem('userInfo');
    }
  }
  
  // Kiểm tra đăng nhập khi load trang
  checkUserLogin();
  
  // Lắng nghe thay đổi localStorage (đăng nhập/đăng xuất từ tab khác)
  window.addEventListener('storage', function(e) {
    if (e.key === 'user' || e.key === 'isLoggedIn') {
      checkUserLogin();
    }
  });

  // Tự động hiển thị popup khảo sát sở thích nếu là khách hàng đăng nhập mà chưa chọn sở thích
  function triggerInterestsCheck() {
    const user = getCurrentUser();
    if (user && user.ma_kh) {
      if (localStorage.getItem('forceOnboarding') === '1') {
        localStorage.removeItem('forceOnboarding');
        checkAndShowInterestsPopup(user, { force: true });
      } else {
        setTimeout(() => {
          const u = getCurrentUser();
          if (u) checkAndShowInterestsPopup(u);
        }, 1500);
      }
    }
  }

  // Chạy kiểm tra sau khi header được khởi tạo
  triggerInterestsCheck();
  // Mobile Menu Toggle
  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");

  // Toggle mobile menu
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener("click", function () {
      const isHidden = mobileMenu.classList.contains("hidden");
      if (isHidden) {
        mobileMenu.classList.remove("hidden");
        mobileMenuBtn
          .querySelector("i")
          .classList.replace("fa-bars", "fa-times");
      } else {
        mobileMenu.classList.add("hidden");
        mobileMenuBtn
          .querySelector("i")
          .classList.replace("fa-times", "fa-bars");
      }
    });
  }

  // Mobile Search Toggle
  const mobileSearchBtn = document.getElementById("mobile-search-btn");
  const mobileSearchBar = document.getElementById("mobile-search-bar");

  if (mobileSearchBtn && mobileSearchBar) {
    mobileSearchBtn.addEventListener("click", function () {
      mobileSearchBar.classList.toggle("hidden");
    });
  }

  // ===== SEARCH FUNCTIONALITY WITH DATABASE =====
  
  // Lấy thông tin user hiện tại
  function getCurrentUser() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    return (isLoggedIn && user) ? user : null;
  }

  // Lưu từ khóa tìm kiếm vào database
  async function saveSearchKeyword(keyword) {
    const user = getCurrentUser();
    try {
      await fetch(`${API_BASE_URL}/search/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tu_khoa: keyword,
          ma_kh: user ? user.ma_kh : null
        })
      });
    } catch (error) {
      console.error('Lỗi lưu từ khóa tìm kiếm:', error);
    }
  }

  // Lấy gợi ý tìm kiếm từ database
  async function fetchSearchSuggestions(query) {
    const user = getCurrentUser();
    try {
      const params = new URLSearchParams({
        q: query || '',
        limit: 8
      });
      if (user) {
        params.append('ma_kh', user.ma_kh);
      }
      
      const response = await fetch(`${API_BASE_URL}/search/suggest?${params}`);
      const data = await response.json();
      
      if (data.success) {
        return data.data;
      }
      return [];
    } catch (error) {
      console.error('Lỗi lấy gợi ý tìm kiếm:', error);
      return [];
    }
  }

  // Xóa một từ khóa khỏi lịch sử
  async function deleteSearchHistory(keyword) {
    const user = getCurrentUser();
    if (!user) return;
    
    try {
      await fetch(`${API_BASE_URL}/search/history`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tu_khoa: keyword,
          ma_kh: user.ma_kh
        })
      });
    } catch (error) {
      console.error('Lỗi xóa lịch sử tìm kiếm:', error);
    }
  }

  // Tạo dropdown gợi ý tìm kiếm - YOUTUBE STYLE
  function createSuggestionDropdown(inputElement) {
    // Kiểm tra xem dropdown đã tồn tại chưa
    let existingDropdown = inputElement.parentElement.querySelector('.search-suggestions');
    if (existingDropdown) {
      return existingDropdown;
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'search-suggestions absolute top-full left-0 right-0 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[480px] overflow-y-auto z-[100] hidden';
    dropdown.style.marginTop = '8px';
    dropdown.style.animation = 'slideDown 0.2s ease-out';
    
    // Thêm CSS animation
    if (!document.getElementById('search-dropdown-styles')) {
      const style = document.createElement('style');
      style.id = 'search-dropdown-styles';
      style.textContent = `
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .search-suggestions::-webkit-scrollbar { width: 6px; }
        .search-suggestions::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
        .search-suggestions::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        .search-suggestions::-webkit-scrollbar-thumb:hover { background: #999; }
        .suggestion-item.selected { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); }
        .voice-listening { animation: pulse 1.5s infinite; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Thêm CSS cho container input
    inputElement.parentElement.style.position = 'relative';
    inputElement.parentElement.style.overflow = 'visible';
    inputElement.parentElement.classList.remove('overflow-hidden');
    inputElement.parentElement.appendChild(dropdown);
    
    return dropdown;
  }

  // Hiển thị gợi ý tìm kiếm - YOUTUBE STYLE
  function renderSuggestions(dropdown, suggestions, inputElement) {
    if (!suggestions || suggestions.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    const user = getCurrentUser();
    const query = inputElement.value.trim();
    
    let html = '';
    
    // Phân loại suggestions
    const historyItems = suggestions.filter(s => s.type === 'history');
    const trendingItems = suggestions.filter(s => s.type === 'trending');
    const autocompleteItems = suggestions.filter(s => s.type === 'autocomplete');
    const productItems = suggestions.filter(s => s.type === 'product' || s.type === 'hot' || s.type === 'product_suggest');
    
    // ========== SECTION: Lịch sử tìm kiếm ==========
    if (historyItems.length > 0 && user) {
      html += `
        <div class="flex justify-between items-center px-4 py-2.5 bg-gradient-to-r from-gray-50 to-white border-b sticky top-0 z-10">
          <span class="text-sm text-gray-600 font-semibold flex items-center gap-2">
            <i class="fas fa-history text-gray-400"></i>Tìm kiếm gần đây
          </span>
          <button onclick="clearAllSearchHistory()" class="text-xs text-red-500 hover:text-red-700 font-medium hover:underline">
            Xóa tất cả
          </button>
        </div>
      `;
      
      historyItems.forEach((item, index) => {
        html += renderHistoryItem(item, index, inputElement.value);
      });
    }
    
    // ========== SECTION: Trending ==========
    if (trendingItems.length > 0 && query === '') {
      html += `
        <div class="flex items-center px-4 py-2.5 bg-gradient-to-r from-orange-50 to-yellow-50 border-b">
          <span class="text-sm text-orange-600 font-semibold flex items-center gap-2">
            <i class="fas fa-fire text-orange-500"></i>Xu hướng tìm kiếm
          </span>
        </div>
      `;
      
      trendingItems.forEach((item, index) => {
        html += `
          <div class="suggestion-item flex items-center gap-3 px-4 py-3 hover:bg-orange-50 cursor-pointer transition-all duration-200 border-b border-gray-50" 
               data-text="${escapeHtml(item.text)}" data-index="${historyItems.length + index}"
               onclick="selectSuggestion('${escapeJs(item.text)}', null)">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">
              ${index + 1}
            </div>
            <span class="text-gray-800 font-medium flex-1">${escapeHtml(item.text)}</span>
            <i class="fas fa-trending-up text-orange-400 text-sm"></i>
          </div>
        `;
      });
    }
    
    // ========== SECTION: Autocomplete ==========
    if (autocompleteItems.length > 0) {
      autocompleteItems.forEach((item, index) => {
        html += `
          <div class="suggestion-item flex items-center gap-3 px-4 py-3 hover:bg-red-50 cursor-pointer transition-all duration-200 border-b border-gray-50" 
               data-text="${escapeHtml(item.text)}" data-index="${historyItems.length + trendingItems.length + index}"
               onclick="selectSuggestion('${escapeJs(item.text)}', null)">
            <i class="fas fa-search text-gray-400 text-sm w-8 text-center"></i>
            <span class="text-gray-800">${highlightMatch(item.text, query)}</span>
            <i class="fas fa-arrow-up-left text-gray-300 text-xs ml-auto" title="Điền vào ô tìm kiếm"></i>
          </div>
        `;
      });
    }
    
    // ========== SECTION: Sản phẩm gợi ý ==========
    if (productItems.length > 0) {
      const sectionTitle = query ? 'Sản phẩm phù hợp' : 'Sản phẩm nổi bật';
      const sectionIcon = query ? 'fa-mobile-alt' : 'fa-star';
      const sectionColor = query ? 'blue' : 'yellow';
      
      html += `
        <div class="flex items-center px-4 py-2.5 bg-gradient-to-r from-${sectionColor}-50 to-white border-b">
          <span class="text-sm text-${sectionColor === 'yellow' ? 'amber' : sectionColor}-600 font-semibold flex items-center gap-2">
            <i class="fas ${sectionIcon} text-${sectionColor === 'yellow' ? 'amber' : sectionColor}-500"></i>${sectionTitle}
          </span>
        </div>
      `;
      
      productItems.forEach((item, index) => {
        html += renderProductItem(item, historyItems.length + trendingItems.length + autocompleteItems.length + index, query);
      });
    }

    // ========== FOOTER: Xem tất cả kết quả ==========
    if (query !== '' && (productItems.length > 0 || autocompleteItems.length > 0)) {
      html += `
        <div class="px-4 py-3 bg-gradient-to-r from-red-50 to-pink-50 border-t text-center sticky bottom-0">
          <button onclick="searchAllProducts('${escapeJs(query)}')" 
                  class="text-red-600 hover:text-red-700 font-semibold text-sm flex items-center justify-center gap-2 w-full py-1 hover:underline">
            <i class="fas fa-search"></i>
            Xem tất cả kết quả cho "${escapeHtml(query)}"
            <i class="fas fa-arrow-right text-xs"></i>
          </button>
        </div>
      `;
    }

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  }

  // Render item lịch sử
  function renderHistoryItem(item, index, query) {
    return `
      <div class="suggestion-item flex items-center justify-between px-4 py-3 hover:bg-red-50 cursor-pointer transition-all duration-200 border-b border-gray-50" 
           data-text="${escapeHtml(item.text)}" data-index="${index}">
        <div class="flex items-center gap-3 flex-1" onclick="selectSuggestion('${escapeJs(item.text)}', null)">
          <i class="fas fa-history text-gray-400 text-sm w-8 text-center"></i>
          <span class="text-gray-800">${highlightMatch(item.text, query)}</span>
        </div>
        <button onclick="event.stopPropagation(); removeSearchHistoryItem('${escapeJs(item.text)}', this)" 
                class="text-gray-300 hover:text-red-500 p-2 transition-colors rounded-full hover:bg-red-100">
          <i class="fas fa-times text-xs"></i>
        </button>
      </div>
    `;
  }

  // Render item sản phẩm
  function renderProductItem(item, index, query) {
    const formattedPrice = item.gia ? new Intl.NumberFormat('vi-VN').format(item.gia) + '₫' : '';
    const productImage = item.anh_dai_dien || 'images/default-phone.png';
    const isHot = item.type === 'hot';
    
    return `
      <div class="suggestion-item product-suggestion flex items-center gap-3 px-4 py-3 hover:bg-red-50 cursor-pointer transition-all duration-200 border-b border-gray-50" 
           data-text="${escapeHtml(item.text)}" data-index="${index}" data-ma-sp="${item.ma_sp}"
           onclick="goToProductDetail(${item.ma_sp}, '${escapeJs(item.text)}')">
        <div class="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 p-1 shadow-sm">
          <img src="${productImage}" alt="${escapeHtml(item.text)}" class="w-full h-full object-contain"
               onerror="this.src='https://via.placeholder.com/56x56?text=📱'">
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-gray-800 font-medium truncate text-sm">${highlightMatch(item.text, query)}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-red-600 text-sm font-bold">${formattedPrice}</span>
            ${isHot ? '<span class="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-bold">HOT</span>' : ''}
          </div>
        </div>
        <i class="fas fa-chevron-right text-gray-300 text-sm"></i>
      </div>
    `;
  }

  // Escape HTML để tránh XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Escape JS string
  function escapeJs(text) {
    return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // Highlight từ khóa khớp
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapeHtml(text).replace(regex, '<strong class="text-red-600 font-bold">$1</strong>');
  }

  // ========== VOICE SEARCH - Tìm kiếm bằng giọng nói ==========
  function initVoiceSearch() {
    const voiceBtn = document.getElementById('voice-search-btn');
    const mobileVoiceBtn = document.getElementById('mobile-voice-search-btn');
    
    // Kiểm tra trình duyệt có hỗ trợ Speech Recognition không
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      // Ẩn nút voice search nếu không hỗ trợ
      if (voiceBtn) voiceBtn.style.display = 'none';
      if (mobileVoiceBtn) mobileVoiceBtn.style.display = 'none';
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;
    
    let isListening = false;
    let currentInput = null;
    
    function startListening(inputElement, button) {
      if (isListening) {
        recognition.stop();
        return;
      }
      
      currentInput = inputElement;
      isListening = true;
      
      // UI feedback
      button.classList.add('voice-listening');
      button.innerHTML = '<i class="fas fa-microphone text-red-500 text-lg"></i>';
      inputElement.placeholder = '🎤 Đang nghe...';
      inputElement.classList.add('bg-red-50');
      
      // Hiển thị modal voice
      showVoiceModal();
      
      recognition.start();
    }
    
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      
      if (currentInput) {
        currentInput.value = transcript;
        updateVoiceModalText(transcript);
        
        // Trigger search suggestions
        const inputEvent = new Event('input', { bubbles: true });
        currentInput.dispatchEvent(inputEvent);
      }
    };
    
    recognition.onend = () => {
      isListening = false;
      
      // Reset UI
      [voiceBtn, mobileVoiceBtn].forEach(btn => {
        if (btn) {
          btn.classList.remove('voice-listening');
          btn.innerHTML = '<i class="fas fa-microphone text-lg"></i>';
        }
      });
      
      if (currentInput) {
        currentInput.placeholder = 'Tìm kiếm điện thoại, phụ kiện...';
        currentInput.classList.remove('bg-red-50');
        
        // Tự động tìm kiếm nếu có kết quả
        if (currentInput.value.trim()) {
          setTimeout(() => {
            hideVoiceModal();
            handleSearch(currentInput);
          }, 500);
        } else {
          hideVoiceModal();
        }
      }
    };
    
    recognition.onerror = (event) => {
      console.log('Voice recognition error:', event.error);
      isListening = false;
      hideVoiceModal();
      
      if (event.error === 'not-allowed') {
        alert('Vui lòng cho phép truy cập microphone để sử dụng tính năng tìm kiếm bằng giọng nói.');
      }
    };
    
    // Event listeners
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        const input = document.getElementById('header-search-input');
        startListening(input, voiceBtn);
      });
    }
    
    if (mobileVoiceBtn) {
      mobileVoiceBtn.addEventListener('click', () => {
        const input = document.getElementById('mobile-search-input');
        startListening(input, mobileVoiceBtn);
      });
    }
  }
  
  // Voice Modal UI
  function showVoiceModal() {
    let modal = document.getElementById('voice-search-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voice-search-modal';
      modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[200]';
      modal.innerHTML = `
        <div class="bg-white rounded-3xl p-8 max-w-sm mx-4 text-center shadow-2xl">
          <div class="w-20 h-20 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 voice-listening">
            <i class="fas fa-microphone text-white text-3xl"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-800 mb-2">Đang nghe...</h3>
          <p id="voice-transcript" class="text-gray-600 min-h-[24px]">Hãy nói tên sản phẩm bạn muốn tìm</p>
          <button onclick="hideVoiceModal()" class="mt-4 text-gray-500 hover:text-red-500 text-sm">
            <i class="fas fa-times mr-1"></i>Hủy
          </button>
        </div>
      `;
      document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
  }
  
  function hideVoiceModal() {
    const modal = document.getElementById('voice-search-modal');
    if (modal) modal.classList.add('hidden');
  }
  
  function updateVoiceModalText(text) {
    const transcript = document.getElementById('voice-transcript');
    if (transcript) {
      transcript.textContent = text || 'Hãy nói tên sản phẩm bạn muốn tìm';
      transcript.classList.add('text-red-600', 'font-semibold');
    }
  }
  
  // Khởi tạo Voice Search
  initVoiceSearch();

  // Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Xử lý tìm kiếm chính
  async function handleSearch(inputElement) {
    const searchTerm = inputElement.value.trim();
    if (searchTerm) {
      // Lưu từ khóa vào database
      await saveSearchKeyword(searchTerm);
      
      // Chuyển đến trang sản phẩm
      window.location.href = `products.html?search=${encodeURIComponent(searchTerm)}`;
    }
  }

  // Khởi tạo search với suggestions
  function initSearchWithSuggestions(inputElement) {
    if (!inputElement) return;

    const dropdown = createSuggestionDropdown(inputElement);
    let selectedIndex = -1;

    // Fetch và hiển thị gợi ý khi gõ
    const debouncedFetch = debounce(async () => {
      const query = inputElement.value.trim();
      const suggestions = await fetchSearchSuggestions(query);
      renderSuggestions(dropdown, suggestions, inputElement);
      selectedIndex = -1;
    }, 300);

    // Sự kiện input
    inputElement.addEventListener('input', debouncedFetch);

    // Hiển thị lịch sử khi focus vào ô tìm kiếm
    inputElement.addEventListener('focus', async () => {
      const query = inputElement.value.trim();
      const suggestions = await fetchSearchSuggestions(query);
      renderSuggestions(dropdown, suggestions, inputElement);
    });

    // Ẩn dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
      if (!inputElement.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    // Xử lý phím điều hướng
    inputElement.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.suggestion-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelectedItem(items, selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelectedItem(items, selectedIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          const text = items[selectedIndex].dataset.text;
          inputElement.value = text;
          dropdown.classList.add('hidden');
          handleSearch(inputElement);
        } else {
          handleSearch(inputElement);
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        selectedIndex = -1;
      }
    });
  }

  // Cập nhật item được chọn - với animation
  function updateSelectedItem(items, index) {
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('selected', 'bg-red-50');
        // Scroll item vào view nếu cần
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('selected', 'bg-red-50');
      }
    });
  }

  // Desktop search
  const headerSearchInput = document.getElementById("header-search-input");
  const headerSearchBtn = document.getElementById("header-search-btn");

  if (headerSearchInput) {
    initSearchWithSuggestions(headerSearchInput);
    
    headerSearchInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        handleSearch(headerSearchInput);
      }
    });
  }

  if (headerSearchBtn) {
    headerSearchBtn.addEventListener("click", function () {
      handleSearch(headerSearchInput);
    });
  }

  // Mobile search input
  const mobileSearchInput = document.getElementById("mobile-search-input");
    const mobileHeaderSearchBtn = document.getElementById("mobile-header-search-btn");

    if (mobileSearchInput) {
      initSearchWithSuggestions(mobileSearchInput);

      mobileSearchInput.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
          handleSearch(mobileSearchInput);
        }
      });
    }

    if (mobileHeaderSearchBtn) {
      mobileHeaderSearchBtn.addEventListener("click", function () {
        handleSearch(mobileSearchInput);
      });
    }

  // Lấy cart key theo user (mỗi user có giỏ hàng riêng)
  function getCartKey() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user && user.ma_kh) {
      return `cart_user_${user.ma_kh}`;
    }
    return 'cart_guest';
  }

  // Update cart badge from localStorage
  function updateCartBadge() {
    // Tất cả các badge giỏ hàng
    const headerCartCount = document.getElementById('header-cart-count');
    const navCartBadge = document.getElementById('nav-cart-badge');
    const mobileCartBadge = document.getElementById('mobile-cart-badge');
    const cartCount = document.querySelector(".cart-count");

    // Lấy giỏ hàng theo user
    const cartKey = getCartKey();
    const cart = JSON.parse(localStorage.getItem(cartKey) || "[]");
    const totalItems = cart.reduce(
      (sum, item) => sum + (item.quantity || 1),
      0
    );

    // Cập nhật tất cả badges
    [headerCartCount, navCartBadge, mobileCartBadge].forEach((badge) => {
      if (badge) {
        badge.textContent = totalItems;
        if (totalItems > 0) {
          badge.classList.remove('hidden');
          badge.style.display = 'flex';
        } else {
          badge.classList.add('hidden');
          badge.style.display = 'none';
        }
      }
    });

    if (cartCount) {
      cartCount.textContent =
        totalItems > 0 ? `${totalItems} sản phẩm` : "0 sản phẩm";
    }
  }

  // Update cart badge on page load
  updateCartBadge();

  // Listen for cart updates
  window.addEventListener("storage", function (e) {
    if (e.key === "cart") {
      updateCartBadge();
    }
  });

  // Custom event for cart updates on same page
  window.addEventListener("cartUpdated", updateCartBadge);

  // Highlight active menu item
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const currentSearch = window.location.search;
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach((link) => {
    const linkHref = link.getAttribute("href");
    const linkPath = linkHref.split("?")[0];
    const linkSearch = linkHref.includes("?") ? "?" + linkHref.split("?")[1] : "";

    // Check if both path and query string match
    if (linkPath === currentPath && linkSearch === currentSearch) {
      link.classList.add("active");
    } else if (currentPath === "index.html" && linkHref === "index.html") {
      link.classList.add("active");
    }
  });

  // Fixed header on scroll with effects
  const header = document.querySelector(".header-wrapper");

  window.addEventListener("scroll", function () {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
      // Tăng shadow khi cuộn
      if (header) {
        header.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.2)";
      }
    } else {
      // Shadow nhẹ hơn
      if (header) {
        header.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
      }
    }
  });
}

// Tự động chạy initHeader khi DOM đã sẵn sàng (cho các trang có header inline)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    // Chỉ chạy nếu header đã có trong DOM
    if (document.getElementById('login-btn') || document.getElementById('user-info')) {
      initHeader();
    }
  });
} else {
  // DOM đã sẵn sàng
  if (document.getElementById('login-btn') || document.getElementById('user-info')) {
    initHeader();
  }
}

// ===== GLOBAL FUNCTIONS FOR SEARCH SUGGESTIONS =====

// Hide voice modal (global)
window.hideVoiceModal = function() {
  const modal = document.getElementById('voice-search-modal');
  if (modal) modal.classList.add('hidden');
};

// Chuyển đến trang chi tiết sản phẩm
function goToProductDetail(maSp, productName) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  // Ẩn dropdown
  document.querySelectorAll('.search-suggestions').forEach(dropdown => {
    dropdown.classList.add('hidden');
  });
  
  // Lưu từ khóa vào database
  fetch('http://localhost:3000/api/search/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tu_khoa: productName,
      ma_kh: (isLoggedIn && user) ? user.ma_kh : null
    })
  }).catch(err => console.log('Lỗi lưu tìm kiếm:', err));
  
  // Chuyển đến trang chi tiết sản phẩm
  window.location.href = `product-detail.html?id=${maSp}`;
}

// Tìm kiếm tất cả sản phẩm theo từ khóa
function searchAllProducts(keyword) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  // Ẩn dropdown
  document.querySelectorAll('.search-suggestions').forEach(dropdown => {
    dropdown.classList.add('hidden');
  });
  
  // Lưu từ khóa vào database
  fetch('http://localhost:3000/api/search/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tu_khoa: keyword,
      ma_kh: (isLoggedIn && user) ? user.ma_kh : null
    })
  }).catch(err => console.log('Lỗi lưu tìm kiếm:', err));
  
  // Chuyển đến trang sản phẩm với từ khóa
  window.location.href = `products.html?search=${encodeURIComponent(keyword)}`;
}

// Chọn gợi ý tìm kiếm (lịch sử)
function selectSuggestion(text, maSp) {
  const headerInput = document.getElementById("header-search-input");
  const mobileInput = document.getElementById("mobile-search-input");
  
  // Xác định input đang active
  const activeInput = document.activeElement === mobileInput ? mobileInput : headerInput;
  
  if (activeInput) {
    activeInput.value = text;
    
    // Ẩn dropdown
    const dropdown = activeInput.parentElement.querySelector('.search-suggestions');
    if (dropdown) dropdown.classList.add('hidden');
    
    // Thực hiện tìm kiếm
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    
    // Lưu từ khóa vào database
    fetch('http://localhost:3000/api/search/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tu_khoa: text,
        ma_kh: (isLoggedIn && user) ? user.ma_kh : null
      })
    }).then(() => {
      // Nếu có mã sản phẩm thì chuyển đến chi tiết, không thì tìm kiếm
      if (maSp) {
        window.location.href = `product-detail.html?id=${maSp}`;
      } else {
        window.location.href = `products.html?search=${encodeURIComponent(text)}`;
      }
    }).catch(() => {
      window.location.href = `products.html?search=${encodeURIComponent(text)}`;
    });
  }
}

// Xóa một từ khóa khỏi lịch sử
async function removeSearchHistoryItem(keyword, buttonElement) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  if (!isLoggedIn || !user) return;
  
  try {
    await fetch('http://localhost:3000/api/search/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tu_khoa: keyword,
        ma_kh: user.ma_kh
      })
    });
    
    // Xóa item khỏi DOM
    const item = buttonElement.closest('.suggestion-item');
    if (item) {
      item.remove();
    }
    
    // Kiểm tra nếu không còn item nào
    const dropdown = buttonElement.closest('.search-suggestions');
    if (dropdown && dropdown.querySelectorAll('.suggestion-item').length === 0) {
      dropdown.classList.add('hidden');
    }
  } catch (error) {
    console.error('Lỗi xóa lịch sử:', error);
  }
}

// Xóa tất cả lịch sử tìm kiếm
async function clearAllSearchHistory() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  if (!isLoggedIn || !user) return;
  
  if (!confirm('Bạn có chắc muốn xóa tất cả lịch sử tìm kiếm?')) return;
  
  try {
    await fetch(`http://localhost:3000/api/search/history/all/${user.ma_kh}`, {
      method: 'DELETE'
    });
    
    // Ẩn tất cả dropdown
    document.querySelectorAll('.search-suggestions').forEach(dropdown => {
      dropdown.classList.add('hidden');
    });
    
    alert('Đã xóa tất cả lịch sử tìm kiếm!');
  } catch (error) {
    console.error('Lỗi xóa tất cả lịch sử:', error);
  }
}

// Toggle mobile submenu function
function toggleMobileSubmenu() {
  const submenu = document.getElementById("mobile-submenu");
  const icon = document.getElementById("submenu-icon");

  if (submenu && icon) {
    if (submenu.classList.contains("show")) {
      submenu.classList.remove("show");
      // Switch icon to bars when closed
      icon.classList.remove("fa-times");
      icon.classList.add("fa-bars");
    } else {
      submenu.classList.add("show");
      // Switch icon to close (X) when open
      icon.classList.remove("fa-bars");
      icon.classList.add("fa-times");
    }
  }
}

// Hàm đăng xuất
function handleLogout() {
  // Xóa thông tin user khỏi localStorage
  localStorage.removeItem('user');
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('isAdmin');
  
  // Thông báo
  alert('Đăng xuất thành công!');
  
  // Chuyển về trang chủ
  window.location.href = 'index.html';
}

// ===== NOTIFICATION COUNT FOR DROPDOWN =====
// Load số thông báo chưa đọc và hiển thị trong dropdown menu
async function loadDropdownNotificationCount(userId) {
  if (!userId) return;
  
  try {
    const res = await fetch(`http://localhost:3000/api/notifications/count/${userId}`);
    const data = await res.json();
    
    if (data.success) {
      updateDropdownNotificationBadge(data.count || 0);
    }
  } catch (error) {
    console.log('Error loading notification count:', error);
  }
}

// Cập nhật badge số thông báo trong dropdown
function updateDropdownNotificationBadge(count) {
  const badge = document.getElementById('dropdown-notif-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// Tự động refresh số thông báo mỗi 30 giây
setInterval(() => {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  if (isLoggedIn && user && user.ma_kh) {
    loadDropdownNotificationCount(user.ma_kh);
  }
}, 30000);

// ============================================
// INTERESTS POPUP (AI RECOMMENDATION)
// ============================================

function getInterestsPopupSessionKey(userId) {
    return `interests_popup_shown_${userId}`;
}

async function checkAndShowInterestsPopup(user, options = {}) {
    if (!user || !user.ma_kh) return;
    const sessionKey = getInterestsPopupSessionKey(user.ma_kh);
    
    // Đã hiển thị popup trong phiên này rồi thì thôi
    if (!options.force && sessionStorage.getItem(sessionKey)) return;
    
    try {
        const res = await fetch(`${API_BASE_URL}/interests/check-user/${user.ma_kh}`);
        const data = await res.json();
        
        if (data.success && !data.hasInterests) {
            showInterestsPopup(user.ma_kh);
            sessionStorage.setItem(sessionKey, 'true');
        }
    } catch (error) {
        console.error('Lỗi kiểm tra sở thích:', error);
    }
}

async function showInterestsPopup(userId) {
    // Xóa modal cũ nếu có
    const existingModal = document.getElementById('interests-modal');
    if (existingModal) existingModal.remove();
    
    // Lấy default interests
    let defaultInterests = [];
    try {
        const res = await fetch(`${API_BASE_URL}/interests/default`);
        const data = await res.json();
        if (data.success) {
            defaultInterests = data.data;
        }
    } catch (e) {
        console.error(e);
        return;
    }

    // Icon mapping cho mỗi sở thích
    const iconMap = {
        'apple': '🍎', 'samsung': '📱', 'xiaomi': '🔥',
        'oppo': '✨', 'gaming': '🎮', 'camera': '📸',
        'battery': '🔋', 'luxury': '💎', 'budget': '💰'
    };

    // Inject CSS animation
    if (!document.getElementById('interests-popup-styles')) {
        const style = document.createElement('style');
        style.id = 'interests-popup-styles';
        style.textContent = `
            @keyframes interestModalIn { 
                from { opacity: 0; transform: scale(0.9) translateY(20px); } 
                to { opacity: 1; transform: scale(1) translateY(0); } 
            }
            @keyframes interestBgIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes chipBounce { 0%,100% { transform: scale(1); } 50% { transform: scale(0.95); } }
            .interests-modal-bg { animation: interestBgIn 0.3s ease; }
            .interests-modal-card { animation: interestModalIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .interest-card { 
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
                cursor: pointer; user-select: none; position: relative; overflow: hidden;
            }
            .interest-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px -5px rgba(0,0,0,0.1); }
            .interest-card.selected { 
                border-color: #dc2626 !important; background: linear-gradient(135deg, #fef2f2, #fee2e2) !important;
                box-shadow: 0 4px 15px -3px rgba(220, 38, 38, 0.3);
            }
            .interest-card.selected .interest-check { opacity: 1; transform: scale(1); }
            .interest-card.selected .interest-emoji { transform: scale(1.15); }
            .interest-check { 
                position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; 
                background: #dc2626; border-radius: 50%; display: flex; align-items: center; 
                justify-content: center; opacity: 0; transform: scale(0.5); 
                transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .interest-emoji { font-size: 28px; transition: transform 0.25s ease; display: block; line-height: 1; }
            .interest-progress { 
                height: 4px; background: #f3f4f6; border-radius: 9999px; overflow: hidden; 
            }
            .interest-progress-bar { 
                height: 100%; background: linear-gradient(90deg, #dc2626, #f43f5e); border-radius: 9999px;
                transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
        `;
        document.head.appendChild(style);
    }
    
    const modal = document.createElement('div');
    modal.id = 'interests-modal';
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm interests-modal-bg';
    
    let cardsHtml = defaultInterests.map(interest => `
        <div class="interest-card bg-white border-2 border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-2 min-w-[100px]" data-val="${interest.id}" data-label="${interest.label}">
            <div class="interest-check"><i class="fas fa-check text-white text-xs"></i></div>
            <span class="interest-emoji">${iconMap[interest.id] || '📦'}</span>
            <span class="text-xs font-semibold text-gray-700 text-center leading-tight">${interest.label}</span>
        </div>
    `).join('');
    
    modal.innerHTML = `
      <div class="interests-modal-card bg-white rounded-3xl w-full max-w-xl mx-4 shadow-2xl overflow-hidden">
        <!-- Header gradient -->
        <div class="bg-gradient-to-r from-red-600 via-red-500 to-pink-500 px-8 py-6 text-center relative overflow-hidden">
          <div class="absolute inset-0 opacity-10">
            <div class="absolute -right-8 -top-8 w-32 h-32 bg-white rounded-full"></div>
            <div class="absolute -left-4 -bottom-4 w-24 h-24 bg-white rounded-full"></div>
          </div>
          <div class="relative z-10">
            <div class="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <i class="fas fa-magic text-white text-2xl"></i>
            </div>
            <h3 class="text-2xl font-bold text-white mb-1">Chào mừng bạn! 👋</h3>
            <p class="text-red-100 text-sm">Hãy cho chúng tôi biết sở thích của bạn để nhận gợi ý sản phẩm tốt nhất</p>
          </div>
        </div>
        
        <!-- Body -->
        <div class="px-8 py-6">
          <!-- Progress bar -->
          <div class="mb-5">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-semibold text-gray-700">Đã chọn: <span id="interests-count" class="text-red-600">0</span> sở thích</span>
              <span class="text-xs text-gray-400">Chọn ít nhất 1</span>
            </div>
            <div class="interest-progress">
              <div class="interest-progress-bar" id="interests-progress-bar" style="width: 0%"></div>
            </div>
          </div>
          
          <!-- Interest cards grid -->
          <div class="grid grid-cols-3 gap-3 mb-6" id="interests-container">
            ${cardsHtml}
          </div>
          
          <!-- Action buttons -->
          <div class="flex gap-3">
            <button id="btn-skip-interests" class="flex-1 px-4 py-3.5 border-2 border-gray-200 rounded-2xl font-semibold text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all text-sm flex items-center justify-center gap-2">
              <i class="fas fa-forward text-gray-400"></i>
              Bỏ qua
            </button>
            <button id="btn-save-interests" class="flex-1 px-4 py-3.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-2xl font-semibold hover:from-red-700 hover:to-red-600 transition-all shadow-lg shadow-red-500/25 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none" disabled>
              <i class="fas fa-check-circle"></i>
              Xác nhận
            </button>
          </div>
          
          <p class="text-center text-xs text-gray-400 mt-4">
             Bạn có thể thay đổi sở thích bất cứ lúc nào
          </p>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Xử lý chọn card
    const cards = modal.querySelectorAll('.interest-card');
    const saveBtn = document.getElementById('btn-save-interests');
    const countEl = document.getElementById('interests-count');
    const progressBar = document.getElementById('interests-progress-bar');
    let selectedInterests = [];
    const maxInterests = defaultInterests.length;
    
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const label = card.getAttribute('data-label');
            if (selectedInterests.includes(label)) {
                selectedInterests = selectedInterests.filter(i => i !== label);
                card.classList.remove('selected');
            } else {
                selectedInterests.push(label);
                card.classList.add('selected');
                card.style.animation = 'chipBounce 0.3s ease';
                setTimeout(() => card.style.animation = '', 300);
            }
            countEl.textContent = selectedInterests.length;
            progressBar.style.width = (selectedInterests.length / maxInterests * 100) + '%';
            saveBtn.disabled = selectedInterests.length === 0;
        });
    });
    
    // Lưu sở thích
    saveBtn.addEventListener('click', async () => {
        if (selectedInterests.length === 0) return;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        saveBtn.disabled = true;
        try {
            await fetch(`${API_BASE_URL}/interests/user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, interests: selectedInterests })
            });
            sessionStorage.setItem(getInterestsPopupSessionKey(userId), 'true');
            if (typeof showToast === 'function') {
                showToast('Đã lưu sở thích thành công! 🎉', 'success');
            } else {
                alert('Đã lưu sở thích thành công! 🎉');
            }
            modal.remove();
            if (typeof window.loadRecommendations === 'function') {
                window.loadRecommendations();
            }
        } catch (e) {
            console.error(e);
            if (typeof showToast === 'function') {
                showToast('Lỗi khi lưu sở thích', 'error');
            } else {
                alert('Lỗi khi lưu sở thích');
            }
            saveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Xác nhận';
            saveBtn.disabled = false;
        }
    });
    
    // Bỏ qua (Lần sau chọn)
    const skipBtn = document.getElementById('btn-skip-interests');
    skipBtn.addEventListener('click', () => {
        sessionStorage.setItem(getInterestsPopupSessionKey(userId), 'true');
        if (typeof showToast === 'function') {
            showToast('Bạn có thể chọn lại sở thích ở trang Cá nhân bất kỳ lúc nào! 😊', 'info');
        }
        modal.remove();
    });
}
