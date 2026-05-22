/* ============================================
   APP.JS - QuangHưng Mobile
   Main application JavaScript
   ============================================ */

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format price to Vietnamese currency
 */
function formatPrice(price) {
  return price.toLocaleString('vi-VN') + '₫';
}

/**
 * Parse price from string
 */
function parsePrice(priceStr) {
  return parseInt(priceStr.replace(/[^\d]/g, '')) || 0;
}

/**
 * Debounce function
 */
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

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  // Remove existing toasts
  document.querySelectorAll('.toast-notification').forEach(t => t.remove());
  
  const toast = document.createElement('div');
  toast.className = `toast-notification fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all transform ${
    type === 'success' ? 'bg-green-500 text-white' : 
    type === 'error' ? 'bg-red-500 text-white' : 
    type === 'warning' ? 'bg-yellow-500 text-white' :
    'bg-gray-800 text-white'
  }`;
  
  toast.innerHTML = `
    <div class="flex items-center gap-3">
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  
  // Remove after delay
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// COMPONENT LOADER
// ============================================

/**
 * Load HTML component into placeholder
 */
async function loadComponent(elementId, componentPath) {
  try {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const html = await response.text();
    element.innerHTML = html;
    
    // Initialize component-specific scripts
    if (elementId === 'header-placeholder') {
      initHeader();
    }
    
    return true;
  } catch (error) {
    console.error(`Error loading component ${componentPath}:`, error);
    return false;
  }
}

/**
 * Load all page components
 */
async function loadAllComponents() {
  const components = [
    { id: 'header-placeholder', path: 'components/header.html' },
    { id: 'footer-placeholder', path: 'components/footer.html' },
    { id: 'profile-sidebar', path: 'components/profile-sidebar.html' }
  ];
  
  for (const comp of components) {
    if (document.getElementById(comp.id)) {
      await loadComponent(comp.id, comp.path);
    }
  }
}

// ============================================
// HEADER FUNCTIONALITY
// ============================================

// Kiểm tra và hiển thị thông tin user đăng nhập
function checkUserLogin() {
  // Ưu tiên đọc từ secureStorage (đã mã hóa)
  let user = null;
  if (window.secureStorage) {
    user = window.secureStorage.getItem('user');
  } else {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  }
  
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const dropdownUserName = document.getElementById('dropdown-user-name');
  
  if (isLoggedIn && user) {
    // Ẩn nút đăng nhập, hiện thông tin user
    if (loginBtn) loginBtn.classList.add('hidden');
    if (userInfo) userInfo.classList.remove('hidden');
    
    // Cập nhật tên user
    if (userName) userName.textContent = user.ho_ten || 'Người dùng';
    if (dropdownUserName) dropdownUserName.textContent = user.ho_ten || 'Người dùng';
    
    // Cập nhật avatar
    if (userAvatar) {
      if (user.avt) {
        userAvatar.src = user.avt;
      } else {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.ho_ten || 'U')}&background=dc2626&color=fff&size=128`;
      }
      userAvatar.onerror = function() {
        this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.ho_ten || 'U')}&background=dc2626&color=fff&size=128`;
      };
    }
  } else {
    // Hiện nút đăng nhập, ẩn thông tin user
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (userInfo) userInfo.classList.add('hidden');
  }
}

function initHeader() {
  // ===== USER AUTHENTICATION =====
  checkUserLogin();
  
  // Kiểm tra popup sở thích sau khi load trang (nếu đã đăng nhập)
  setTimeout(() => {
      let user = null;
      if (window.secureStorage) {
        user = window.secureStorage.getItem('user');
      } else {
        user = JSON.parse(localStorage.getItem('user') || 'null');
      }
      if (user && user.ma_kh) {
          checkAndShowInterestsPopup(user);
      }
  }, 1500); // Đợi trang load xong
  
  // Lắng nghe thay đổi localStorage
  window.addEventListener('storage', function(e) {
    if (e.key === 'user' || e.key === 'isLoggedIn') {
      checkUserLogin();
    }
  });

  // Mobile Menu Toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', function() {
      const isHidden = mobileMenu.classList.contains('hidden');
      if (isHidden) {
        mobileMenu.classList.remove('hidden');
        mobileMenuBtn.querySelector('i').classList.replace('fa-bars', 'fa-times');
      } else {
        mobileMenu.classList.add('hidden');
        mobileMenuBtn.querySelector('i').classList.replace('fa-times', 'fa-bars');
      }
    });
  }
  
  // Mobile Search Toggle
  const mobileSearchBtn = document.getElementById('mobile-search-btn');
  const mobileSearchBar = document.getElementById('mobile-search-bar');
  
  if (mobileSearchBtn && mobileSearchBar) {
    mobileSearchBtn.addEventListener('click', function() {
      mobileSearchBar.classList.toggle('hidden');
    });
  }
  
  // Search functionality
  function handleSearch(inputElement) {
    const searchTerm = inputElement.value.trim();
    if (searchTerm) {
      window.location.href = `products.html?search=${encodeURIComponent(searchTerm)}`;
    }
  }
  
  // Desktop search
  const headerSearchInput = document.getElementById('header-search-input');
  const headerSearchBtn = document.getElementById('header-search-btn');
  
  if (headerSearchInput) {
    headerSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') handleSearch(headerSearchInput);
    });
  }
  
  if (headerSearchBtn) {
    headerSearchBtn.addEventListener('click', function() {
      handleSearch(headerSearchInput);
    });
  }
  
  // Mobile search
  const mobileSearchInput = document.getElementById('mobile-search-input');
  if (mobileSearchInput) {
    mobileSearchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') handleSearch(mobileSearchInput);
    });
  }
  
  // Update cart badge
  updateCartBadge();
  
  // Highlight active menu
  highlightActiveMenu();
  
  // Header scroll effect
  initHeaderScroll();
}

/**
 * Lấy cart key theo user (mỗi user có giỏ hàng riêng)
 */
function getCartKey() {
  // Ưu tiên đọc từ secureStorage
  let user = null;
  if (window.secureStorage) {
    user = window.secureStorage.getItem('user');
  } else {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  }
  if (user && user.ma_kh) {
    return `cart_user_${user.ma_kh}`;
  }
  return 'cart_guest';
}

/**
 * Update cart badge count
 */
function updateCartBadge() {
  const cartBadges = document.querySelectorAll('.cart-badge, .mobile-cart-badge');
  const cartKey = getCartKey();
  const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
  const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  
  cartBadges.forEach(badge => {
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? 'flex' : 'none';
  });
}

/**
 * Đồng bộ giỏ hàng từ database về localStorage
 * Gọi khi load trang để đảm bảo dữ liệu chính xác
 * LUÔN ƯU TIÊN DATABASE - không fallback localStorage
 */
async function syncCartFromDB() {
  // Ưu tiên đọc từ secureStorage
  let user = null;
  if (window.secureStorage) {
    user = window.secureStorage.getItem('user');
  } else {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  }
  if (!user || !user.ma_kh) return;
  
  const API_URL = 'http://localhost:3000/api';
  
  try {
    const response = await fetch(`${API_URL}/cart/${user.ma_kh}`);
    
    if (response.status === 401) {
      console.warn('Session expired. Logging out user...');
      localStorage.removeItem('user');
      localStorage.removeItem('isLoggedIn');
      if (window.secureStorage) {
        window.secureStorage.removeItem('user');
      }
      if (typeof showToast === 'function') {
        showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'warning');
      }
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      return;
    }

    const data = await response.json();
    
    if (data.success) {
      // Database là nguồn dữ liệu DUY NHẤT
      const cartKey = getCartKey();
      localStorage.setItem(cartKey, JSON.stringify(data.data || []));
      updateCartBadge();
    } else {
      // API lỗi - xóa localStorage để tránh dữ liệu cũ
      const cartKey = getCartKey();
      localStorage.setItem(cartKey, JSON.stringify([]));
      updateCartBadge();
    }
  } catch (error) {
    console.error('Lỗi đồng bộ giỏ hàng:', error);
    // Lỗi kết nối - xóa localStorage để tránh dữ liệu cũ
    const cartKey = getCartKey();
    localStorage.setItem(cartKey, JSON.stringify([]));
    updateCartBadge();
  }
}

/**
 * Highlight active menu item
 */
function highlightActiveMenu() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-link');
  
  navLinks.forEach(link => {
    const linkHref = link.getAttribute('href');
    if (!linkHref) return;
    
    const linkPath = linkHref.split('?')[0];
    
    if (linkPath === currentPath || 
        (currentPath === '' && linkPath === 'index.html') ||
        (currentPath === 'index.html' && linkPath === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/**
 * Header scroll effect
 */
function initHeaderScroll() {
  const header = document.querySelector('.header-wrapper');
  if (!header) return;
  
  window.addEventListener('scroll', function() {
    if (window.pageYOffset > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

/**
 * Toggle mobile submenu
 */
function toggleMobileSubmenu() {
  const submenu = document.getElementById('mobile-submenu');
  const icon = document.getElementById('submenu-icon');
  
  if (submenu && icon) {
    submenu.classList.toggle('show');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
  }
}

// ============================================
// CART FUNCTIONALITY
// ============================================

/**
 * Kiểm tra user đã đăng nhập chưa
 */
function isLoggedIn() {
  // Ưu tiên đọc từ secureStorage
  let user = null;
  if (window.secureStorage) {
    user = window.secureStorage.getItem('user');
  } else {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  }
  const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
  return loggedIn && user && user.ma_kh;
}

/**
 * Hiển thị modal yêu cầu đăng nhập
 */
function showLoginRequiredModal() {
  // Xóa modal cũ nếu có
  const existingModal = document.getElementById('login-required-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'login-required-modal';
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
      <div class="text-center">
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-user-lock text-red-500 text-2xl"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 mb-2">Yêu cầu đăng nhập</h3>
        <p class="text-gray-600 mb-6">Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng và mua hàng.</p>
        <div class="flex gap-3">
          <button onclick="closeLoginModal()" class="flex-1 px-4 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition">
            Để sau
          </button>
          <a href="login.html" class="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition text-center">
            Đăng nhập
          </a>
        </div>
        <p class="text-sm text-gray-500 mt-4">
          Chưa có tài khoản? <a href="register.html" class="text-red-600 font-semibold hover:underline">Đăng ký ngay</a>
        </p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Click outside to close
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeLoginModal();
  });
}

/**
 * Đóng modal yêu cầu đăng nhập
 */
function closeLoginModal() {
  const modal = document.getElementById('login-required-modal');
  if (modal) modal.remove();
}

/**
 * Add item to cart - YÊU CẦU ĐĂNG NHẬP - SYNC VỚI DATABASE
 */
async function addToCart(product) {
  // Kiểm tra đăng nhập trước
  if (!isLoggedIn()) {
    showLoginRequiredModal();
    return;
  }
  
  // Ưu tiên đọc từ secureStorage
  let user = null;
  if (window.secureStorage) {
    user = window.secureStorage.getItem('user');
  } else {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  }
  const API_URL = 'http://localhost:3000/api';
  
  // Gọi API để thêm vào database
  try {
    const response = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.ma_kh,
        productId: product.id,
        quantity: 1,
        productInfo: {
          name: product.name,
          price: product.price,
          image: product.image,
          color: product.color || 'Mặc định',
          storage: product.storage || '128GB'
        }
      })
    });
    const data = await response.json();
    
    if (data.success) {
      // Đồng bộ lại từ database để có cartItemId chính xác
      await syncCartFromDB();
      showToast('Đã thêm vào giỏ hàng!', 'success');
    } else {
      showToast(data.message || 'Lỗi thêm giỏ hàng', 'error');
    }
  } catch (error) {
    console.error('Lỗi thêm giỏ hàng:', error);
    showToast('Lỗi kết nối, vui lòng thử lại', 'error');
  }
}

/**
 * Remove item from cart - SYNC VỚI DATABASE
 */
async function removeFromCart(index, cartItemId = null) {
  // Ưu tiên đọc từ secureStorage
  let user = null;
  if (window.secureStorage) {
    user = window.secureStorage.getItem('user');
  } else {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  }
  const API_URL = 'http://localhost:3000/api';
  
  // Xóa từ database nếu đã đăng nhập và có cartItemId
  if (user && user.ma_kh && cartItemId) {
    try {
      const response = await fetch(`${API_URL}/cart/remove/${cartItemId}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        // Đồng bộ lại từ database
        await syncCartFromDB();
        return;
      } else {
        console.error('Lỗi xóa từ database:', data.message);
      }
    } catch (error) {
      console.error('Lỗi xóa giỏ hàng:', error);
    }
  }
  
  // Fallback: Xóa từ localStorage nếu không có cartItemId hoặc API lỗi
  const cartKey = getCartKey();
  const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
  cart.splice(index, 1);
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cartUpdated'));
}

/**
 * Update cart item quantity
 */
function updateCartQuantity(index, quantity) {
  const cartKey = getCartKey();
  const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
  if (quantity <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].quantity = quantity;
  }
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cartUpdated'));
}

/**
 * Get cart total
 */
function getCartTotal() {
  const cartKey = getCartKey();
  const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
  return cart.reduce((total, item) => {
    return total + (parsePrice(item.price) * (item.quantity || 1));
  }, 0);
}

// ============================================
// SCROLL REVEAL
// ============================================

function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  
  if (revealElements.length === 0) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });
  
  revealElements.forEach(el => observer.observe(el));
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
  // Load components
  loadAllComponents();
  
  // Initialize scroll reveal
  initScrollReveal();
  
  // Đồng bộ giỏ hàng từ database khi load trang (nếu đã đăng nhập)
  // KHÔNG sync nếu đang ở trang cart (cart.js sẽ tự xử lý)
  if (!window.isCartPage) {
    await syncCartFromDB();
  }
  
  // Listen for storage changes (cart updates from other tabs)
  window.addEventListener('storage', function(e) {
    if (e.key === 'cart') {
      updateCartBadge();
    }
  });
});

// ============================================
// INTERESTS POPUP (AI RECOMMENDATION)
// ============================================

async function checkAndShowInterestsPopup(user) {
    if (!user || !user.ma_kh) return;
    
    // Đã hiển thị popup trong phiên này rồi thì thôi
    if (sessionStorage.getItem('interests_popup_shown')) return;
    
    try {
        const res = await fetch(`http://localhost:3000/api/interests/check-user/${user.ma_kh}`);
        const data = await res.json();
        
        if (data.success && !data.hasInterests) {
            showInterestsPopup(user.ma_kh);
            sessionStorage.setItem('interests_popup_shown', 'true');
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
        const res = await fetch('http://localhost:3000/api/interests/default');
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
              <i class="fas fa-sparkles text-white text-2xl"></i>
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
          <div class="grid grid-cols-3 sm:grid-cols-3 gap-3 mb-6" id="interests-container">
            ${cardsHtml}
          </div>
          
          <!-- Action buttons -->
          <div class="flex gap-3">
            <button id="btn-skip-interests" class="flex-1 px-4 py-3.5 border-2 border-gray-200 rounded-2xl font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all text-sm flex items-center justify-center gap-2">
              <i class="fas fa-magic text-purple-400"></i>
              Để AI tự đoán
            </button>
            <button id="btn-save-interests" class="flex-1 px-4 py-3.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-2xl font-semibold hover:from-red-700 hover:to-red-600 transition-all shadow-lg shadow-red-500/25 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none" disabled>
              <i class="fas fa-check-circle"></i>
              Xác nhận
            </button>
          </div>
          
          <p class="text-center text-xs text-gray-400 mt-4">
            <i class="fas fa-shield-alt mr-1"></i> Bạn có thể thay đổi sở thích bất cứ lúc nào
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
                // Quick bounce
                card.style.animation = 'chipBounce 0.3s ease';
                setTimeout(() => card.style.animation = '', 300);
            }
            // Update UI
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
            await fetch('http://localhost:3000/api/interests/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, interests: selectedInterests })
            });
            // Lưu cờ sessionStorage để chống lặp popup lập tức ở phiên hiện tại
            sessionStorage.setItem('interests_popup_shown', 'true');
            showToast('Đã lưu sở thích thành công! 🎉', 'success');
            modal.remove();
            if (typeof window.loadRecommendations === 'function') {
                window.loadRecommendations();
            }
        } catch (e) {
            console.error(e);
            showToast('Lỗi khi lưu sở thích', 'error');
            saveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Xác nhận';
            saveBtn.disabled = false;
        }
    });
    
    // Bỏ qua (AI Generate)
    const skipBtn = document.getElementById('btn-skip-interests');
    skipBtn.addEventListener('click', async () => {
        skipBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang phân tích...';
        skipBtn.disabled = true;
        try {
            await fetch('http://localhost:3000/api/interests/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            // Lưu cờ sessionStorage để chống lặp popup lập tức ở phiên hiện tại
            sessionStorage.setItem('interests_popup_shown', 'true');
            showToast('AI đã phân tích sở thích từ lịch sử của bạn! 🤖', 'success');
            modal.remove();
            if (typeof window.loadRecommendations === 'function') {
                window.loadRecommendations();
            }
        } catch (e) {
            console.error(e);
            // Kể cả khi lỗi, lưu cờ sessionStorage và đóng modal để giữ trải nghiệm mượt mà cho người dùng
            sessionStorage.setItem('interests_popup_shown', 'true');
            modal.remove();
        }
    });
}

// ============================================
// EXPORT TO WINDOW
// ============================================

window.formatPrice = formatPrice;
window.parsePrice = parsePrice;
window.showToast = showToast;
window.debounce = debounce;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.getCartTotal = getCartTotal;
window.updateCartBadge = updateCartBadge;
window.syncCartFromDB = syncCartFromDB;
window.toggleMobileSubmenu = toggleMobileSubmenu;
window.isLoggedIn = isLoggedIn;
window.showLoginRequiredModal = showLoginRequiredModal;
window.closeLoginModal = closeLoginModal;
window.checkAndShowInterestsPopup = checkAndShowInterestsPopup;

