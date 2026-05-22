/* ============================================
   MAIN.JS - QuangHưng Mobile
   Global utilities and functions
   
   NOTE: Cấu trúc mới đã được tạo trong js/app.js
   File này được giữ lại để tương thích với các trang cũ.
   ============================================ */

// ============================================
// PAGE LOADER - Hiệu ứng loading trang
// CHỈ HIỂN THỊ KHI ĐĂNG NHẬP THÀNH CÔNG
// ============================================
(function() {
  // Tạo loader HTML
  function createPageLoader() {
    if (document.getElementById('page-loader')) return;
    
    const loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.innerHTML = `
      <div class="loader-logo">
        <img src="images/logo.png" alt="QuangHưng Mobile" onerror="this.style.display='none'">
      </div>
      <div class="loader-spinner"></div>
      <div class="loader-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="loader-text">
        <span>Đ</span><span>a</span><span>n</span><span>g</span><span>&nbsp;</span><span>t</span><span>ả</span><span>i</span><span>.</span><span>.</span><span>.</span>
      </div>
      <div class="loader-progress">
        <div class="loader-progress-bar"></div>
      </div>
    `;
    
    document.body.insertBefore(loader, document.body.firstChild);
  }
  
  // Ẩn loader
  function hidePageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.classList.add('hidden');
      document.body.classList.add('page-transition');
      setTimeout(() => {
        loader.remove();
      }, 500);
    }
  }
  
  // Hiển thị loader (chỉ dùng khi đăng nhập thành công)
  function showPageLoader() {
    createPageLoader();
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.classList.remove('hidden');
    }
  }
  
  // Kiểm tra và ẩn loader nếu có sẵn trong HTML (từ trang login)
  window.addEventListener('load', function() {
    const existingLoader = document.getElementById('page-loader');
    if (existingLoader) {
      setTimeout(hidePageLoader, 300);
    }
  });
  
  // Export functions
  window.showPageLoader = showPageLoader;
  window.hidePageLoader = hidePageLoader;
})();

// Format price to Vietnamese currency
function formatPrice(price) {
  if (price === undefined || price === null || isNaN(price)) {
    return '0₫';
  }
  return Number(price).toLocaleString('vi-VN') + '₫';
}

// Parse price from string
function parsePrice(priceStr) {
  return parseInt(priceStr.replace(/[^\d]/g, '')) || 0;
}

// Debounce function for search
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

// Show toast notification
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
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Lấy cart key theo user (mỗi user có giỏ hàng riêng)
function getCartKey() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (user && user.ma_kh) {
    return `cart_user_${user.ma_kh}`;
  }
  return 'cart_guest';
}

// Update cart badge
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

// Đồng bộ giỏ hàng từ database về localStorage
// LUÔN ƯU TIÊN DATABASE - không fallback localStorage
async function syncCartFromDB() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.ma_kh) return;
  
  const API_URL = 'http://localhost:3000/api';
  
  try {
    const response = await fetch(`${API_URL}/cart/${user.ma_kh}`);
    
    if (response.status === 401) {
      console.warn('Session expired. Logging out user...');
      localStorage.removeItem('user');
      localStorage.removeItem('isLoggedIn');
      showToast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'warning');
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

// Kiểm tra đăng nhập
function isLoggedIn() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  return user && user.ma_kh;
}

// Modal yêu cầu đăng nhập
function showLoginRequiredModal() {
  // Kiểm tra xem modal đã tồn tại chưa
  if (document.getElementById('login-required-modal')) return;
  
  const modal = document.createElement('div');
  modal.id = 'login-required-modal';
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 text-center shadow-xl">
      <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <i class="fas fa-user-lock text-3xl text-red-600"></i>
      </div>
      <h3 class="text-xl font-bold text-gray-900 mb-2">Yêu cầu đăng nhập</h3>
      <p class="text-gray-600 mb-6">Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng</p>
      <div class="flex gap-3">
        <button onclick="closeLoginModal()" class="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">Đóng</button>
        <a href="login.html" class="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-center font-medium">Đăng nhập</a>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeLoginModal();
  });
}

function closeLoginModal() {
  const modal = document.getElementById('login-required-modal');
  if (modal) modal.remove();
}

// Add to cart - gọi API backend
async function addToCart(product) {
  // Kiểm tra đăng nhập trước
  if (!isLoggedIn()) {
    showLoginRequiredModal();
    return;
  }
  
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const API_URL = 'http://localhost:3000/api';
  
  // Validate product data
  if (!product || !product.id) {
    showToast('Thông tin sản phẩm không hợp lệ', 'error');
    return;
  }
  
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

// Initialize scroll reveal
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async function() {
  // Đồng bộ giỏ hàng từ database trước khi cập nhật badge
  await syncCartFromDB();
  updateCartBadge();
  initScrollReveal();
  
  // Listen for storage changes
  window.addEventListener('storage', function(e) {
    if (e.key === 'cart') {
      updateCartBadge();
    }
  });
});

// Export for use in other files
if (typeof window !== 'undefined') {
  window.formatPrice = formatPrice;
  window.parsePrice = parsePrice;
  window.showToast = showToast;
  window.debounce = debounce;
  window.updateCartBadge = updateCartBadge;
  window.syncCartFromDB = syncCartFromDB;
  window.addToCart = addToCart;
}

