// Promotions Page JavaScript
// Kết nối với backend để hiển thị khuyến mãi từ CSDL

const API_BASE = 'http://localhost:3000/api';

// State
let flashSales = [];
let allVouchers = [];
let featuredProducts = [];
let displayedVoucherCount = 6; // Số voucher hiển thị ban đầu
const VOUCHERS_PER_PAGE = 6; // Số voucher mỗi lần load thêm

// ============================================================
// COUNTDOWN TIMER - Đếm ngược Hot Sale (cuối tuần)
// ============================================================
function initCountdownTimer() {
  const daysEl = document.getElementById('days');
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');
  
  if (!hoursEl || !minutesEl || !secondsEl) return;

  // Tính thời gian kết thúc (Chủ nhật cuối tuần)
  const now = new Date();
  const endOfWeek = new Date(now);
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  endOfWeek.setDate(now.getDate() + daysUntilSunday);
  endOfWeek.setHours(23, 59, 59, 999);

  const updateTimer = () => {
    const current = new Date().getTime();
    const end = endOfWeek.getTime();
    const diff = end - current;

    if (diff <= 0) {
      if (daysEl) daysEl.textContent = '00';
      hoursEl.textContent = '00';
      minutesEl.textContent = '00';
      secondsEl.textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (daysEl) daysEl.textContent = days.toString().padStart(2, '0');
    hoursEl.textContent = hours.toString().padStart(2, '0');
    minutesEl.textContent = minutes.toString().padStart(2, '0');
    secondsEl.textContent = seconds.toString().padStart(2, '0');
  };

  updateTimer();
  setInterval(updateTimer, 1000);
}

// ============================================================
// HOT SALE SLIDER & TABS
// ============================================================
let allFlashProducts = [];

function slideHotSale(direction) {
  const slider = document.getElementById('flash-products');
  if (!slider) return;
  
  const scrollAmount = 220; // card width + gap
  slider.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

function filterHotSale(category) {
  // Update active tab
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  // Filter products (for now just reload - can be enhanced with real categories)
  const container = document.getElementById('flash-products');
  if (allFlashProducts.length > 0) {
    renderFlashProducts(allFlashProducts, container);
  }
}

// ============================================================
// LOAD FLASH SALE PRODUCTS - Lấy sản phẩm bán chậm nhất từ DB
// Tự động refresh mỗi 12 tiếng
// ============================================================

// Lưu thông tin cache từ server
let slowMoversCache = {
  lastUpdated: null,
  nextRefresh: null
};

async function loadFlashSaleProducts() {
  const container = document.getElementById('flash-products');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-white/50"></i></div>';

  try {
    // Lấy sản phẩm bán chậm nhất từ API slow-movers
    // Server sẽ tự động cache và refresh mỗi 12 tiếng
    const response = await fetch(`${API_BASE}/promotions/slow-movers`);
    const data = await response.json();

    console.log('Flash Sale - Slow movers data:', data);
    
    // Lưu thông tin cache
    if (data.cache) {
      slowMoversCache.lastUpdated = data.cache.lastUpdated;
      slowMoversCache.nextRefresh = data.cache.nextRefresh;
      console.log(`[Hot Sale] Dữ liệu được cập nhật lúc: ${new Date(data.cache.lastUpdated).toLocaleString('vi-VN')}`);
      console.log(`[Hot Sale] Lần refresh tiếp theo: ${new Date(data.cache.nextRefresh).toLocaleString('vi-VN')}`);
    }

    if (data.success && data.data && data.data.length > 0) {
      // Log chi tiết để debug ảnh
      console.log('[Hot Sale] Products received:');
      data.data.forEach(p => {
        console.log(`  - ID: ${p.id}, Name: ${p.name}, Image: ${p.image}`);
      });
      
      // Chuyển đổi dữ liệu slow-movers thành format hot sale - chỉ lấy 4 sản phẩm
      const discounts = [31, 37, 24, 44];
      const flashProducts = data.data.slice(0, 4).map((p, index) => {
        const discount = discounts[index];
        return {
          productId: p.id,
          name: p.name,
          image: p.image, // Ảnh đã được xử lý từ backend
          originalPrice: p.price,
          flashPrice: p.price * (1 - discount / 100),
          discountPercent: discount,
          rating: p.rating || 4.5,
          hasInstallment: index % 2 === 0
        };
      });
      
      allFlashProducts = flashProducts;
      renderFlashProducts(flashProducts, container);
      
      // Hiển thị thông tin cập nhật (nếu có element)
      updateCacheInfo();
    } else {
      // Fallback nếu API slow-movers không có dữ liệu
      await loadProductsAsFlash(container);
    }
  } catch (error) {
    console.error('Error loading flash sale:', error);
    await loadProductsAsFlash(container);
  }
}

// Hiển thị thông tin thời gian cập nhật (optional)
function updateCacheInfo() {
  const cacheInfoEl = document.getElementById('cache-info');
  if (cacheInfoEl && slowMoversCache.lastUpdated) {
    const lastUpdate = new Date(slowMoversCache.lastUpdated);
    const nextRefresh = new Date(slowMoversCache.nextRefresh);
    cacheInfoEl.innerHTML = `
      <span class="text-xs text-white/70">
        <i class="fas fa-sync-alt mr-1"></i>
        Cập nhật: ${lastUpdate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </span>
    `;
  }
}

async function loadProductsAsFlash(container) {
  try {
    // Fallback: Lấy sản phẩm từ API products - chỉ 4 sản phẩm
    const response = await fetch(`${API_BASE}/products`);
    let products = await response.json();
    
    if (Array.isArray(products) && products.length > 0) {
      const discounts = [31, 37, 24, 44];
      const ratings = [5, 5, 4.9, 4.3];
      products = products.slice(0, 4).map((p, index) => ({
        productId: p.ma_sp || p.id,
        name: p.ten_sp || p.name,
        image: p.image || p.anh_dai_dien,
        originalPrice: parseFloat(p.gia || p.price || 0),
        flashPrice: parseFloat(p.gia || p.price || 0) * (1 - discounts[index] / 100),
        discountPercent: discounts[index],
        rating: ratings[index],
        hasInstallment: index % 2 === 0
      }));
      allFlashProducts = products;
      renderFlashProducts(products, container);
    } else {
      container.innerHTML = '<div class="col-span-4 text-center py-8 text-gray-500">Không có sản phẩm Hot Sale</div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="col-span-4 text-center py-8 text-gray-500">Không thể tải sản phẩm</div>';
  }
}

function renderFlashProducts(products, container) {
  console.log('[renderFlashProducts] Rendering products:', products.length);
  
  container.innerHTML = products.map(product => {
    const imageUrl = normalizeImageUrl(product.image);
    const rating = product.rating || (4 + Math.random()).toFixed(1);
    const hasInstallment = product.hasInstallment !== false;
    
    console.log(`[renderFlashProducts] Product: ${product.name}, Image URL: ${imageUrl}`);
    
    return `
      <a href="product-detail.html?id=${product.productId}" class="flash-product-card block">
        <div class="flash-product-image">
          <img src="${imageUrl}" alt="${product.name}" 
               onerror="console.error('[Image Error] Failed to load:', '${imageUrl}'); this.onerror=null; this.src='images/IPHONE17.avif';">
          <div class="badge-group">
            <span class="badge-discount">Giảm ${product.discountPercent}%</span>
            ${hasInstallment ? '<span class="badge-installment">Trả góp 0%</span>' : ''}
          </div>
        </div>
        <div class="flash-product-info">
          <h3 class="flash-product-name">${product.name}</h3>
          <div class="flash-price-row">
            <span class="flash-price-sale">${formatPriceVND(product.flashPrice)}</span>
            <span class="flash-price-original">${formatPriceVND(product.originalPrice)}</span>
          </div>
          <div class="flash-product-footer">
            <div class="flash-rating">
              <i class="fas fa-star"></i>
              <span>${rating}</span>
            </div>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

// Helper function để chuẩn hóa đường dẫn ảnh
function normalizeImageUrl(imageUrl) {
  const DEFAULT_IMAGE = 'images/IPHONE17.avif';
  
  if (!imageUrl) {
    console.log(`[normalizeImageUrl] Empty image, using default`);
    return DEFAULT_IMAGE;
  }
  
  // Nếu là URL đầy đủ (http/https), giữ nguyên
  if (imageUrl.startsWith('http')) {
    console.log(`[normalizeImageUrl] HTTP URL: ${imageUrl}`);
    return imageUrl;
  }
  
  // Nếu đã có prefix images/ và có extension hợp lệ, giữ nguyên (backend đã xử lý)
  if (imageUrl.startsWith('images/') && 
      (imageUrl.includes('.webp') || imageUrl.includes('.avif') || 
       imageUrl.includes('.jpg') || imageUrl.includes('.png'))) {
    console.log(`[normalizeImageUrl] Already processed: ${imageUrl}`);
    return imageUrl;
  }
  
  // Nếu đã được encode (%20), đảm bảo có prefix images/
  if (imageUrl.includes('%20')) {
    let result = imageUrl;
    if (!imageUrl.startsWith('images/')) {
      result = 'images/' + imageUrl;
    }
    console.log(`[normalizeImageUrl] Encoded URL: ${imageUrl} -> ${result}`);
    return result;
  }
  
  // Loại bỏ prefix images/ nếu bị lặp
  let normalized = imageUrl.replace(/^(images\/)+/, '');
  
  // Encode khoảng trắng trong tên file
  if (normalized.includes(' ')) {
    normalized = normalized.replace(/ /g, '%20');
  }
  
  // Thêm prefix images/ một lần duy nhất
  const result = 'images/' + normalized;
  console.log(`[normalizeImageUrl] ${imageUrl} -> ${result}`);
  return result;
}

// ============================================================
// LOAD VOUCHERS - Mã giảm giá từ CSDL
// ============================================================
async function loadVouchers() {
  const container = document.getElementById('vouchers-container');
  const loadMoreBtn = document.getElementById('voucher-load-more');
  const voucherCountEl = document.getElementById('voucher-count');
  
  if (!container) return;

  // Reset số lượng hiển thị
  displayedVoucherCount = VOUCHERS_PER_PAGE;
  
  // Ẩn nút xem thêm và count khi đang load
  if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
  if (voucherCountEl) voucherCountEl.textContent = '';

  container.innerHTML = '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>';

  try {
    const response = await fetch(`${API_BASE}/promotions/vouchers/available`);
    const data = await response.json();
    
    console.log('Vouchers API response:', data);

    if (!data.success || !data.data || data.data.length === 0) {
      // Thử lấy tất cả voucher để debug
      try {
        const debugRes = await fetch(`${API_BASE}/promotions/vouchers/all`);
        const debugData = await debugRes.json();
        console.log('All vouchers (debug):', debugData);
        
        if (debugData.data && debugData.data.length > 0) {
          // Có voucher nhưng không khả dụng
          const reasons = debugData.data.map(v => `${v.code}: ${v.ly_do}`).join(', ');
          console.log('Voucher status:', reasons);
        }
      } catch(e) { console.log('Debug API not available'); }
      
      container.innerHTML = `
        <div class="col-span-full empty-state">
          <i class="fas fa-ticket-alt"></i>
          <p>Chưa có mã giảm giá khả dụng</p>
          <p class="text-sm text-gray-400 mt-2">Các mã có thể chưa bắt đầu hoặc đã hết hạn</p>
        </div>
      `;
      return;
    }

    allVouchers = data.data;
    renderVouchers(allVouchers);
  } catch (error) {
    console.error('Error loading vouchers:', error);
    container.innerHTML = `
      <div class="col-span-full empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Không thể tải mã giảm giá</p>
        <p class="text-sm text-gray-400 mt-2">Vui lòng thử lại sau</p>
      </div>
    `;
  }
}

function renderVouchers(vouchers, append = false) {
  const container = document.getElementById('vouchers-container');
  const loadMoreBtn = document.getElementById('voucher-load-more');
  const voucherCountEl = document.getElementById('voucher-count');
  const remainingCountEl = document.getElementById('remaining-count');
  
  if (!container) return;

  const savedVouchers = JSON.parse(localStorage.getItem('savedVouchers') || '[]');
  
  // Lấy voucher cần hiển thị
  const vouchersToShow = vouchers.slice(0, displayedVoucherCount);
  const remainingCount = vouchers.length - displayedVoucherCount;
  
  // Cập nhật số lượng hiển thị
  if (voucherCountEl) {
    voucherCountEl.textContent = `Hiển thị ${Math.min(displayedVoucherCount, vouchers.length)}/${vouchers.length} mã`;
  }
  
  // Hiển thị/ẩn nút xem thêm
  if (loadMoreBtn) {
    if (remainingCount > 0) {
      loadMoreBtn.classList.remove('hidden');
      if (remainingCountEl) {
        remainingCountEl.textContent = `+${remainingCount} mã`;
      }
    } else {
      loadMoreBtn.classList.add('hidden');
    }
  }

  const voucherHTML = vouchersToShow.map(voucher => {
    const isSaved = savedVouchers.some(v => v.id === voucher.id || v.code === voucher.code);
    const discountText = voucher.discountType === 'percent' 
      ? `${voucher.discountValue}%` 
      : formatPriceShort(voucher.discountValue);
    const isHot = voucher.daysRemaining <= 3;

    return `
      <div class="voucher-card" 
           data-voucher-id="${voucher.id}"
           data-code="${voucher.code}"
           data-discount-type="${voucher.discountType}"
           data-discount-value="${voucher.discountValue}"
           data-min-order="${voucher.minOrder}"
           data-description="${voucher.description || ''}">
        <div class="voucher-left">
          <div class="voucher-value">${discountText.replace('K', '')}</div>
          <div class="voucher-unit">${voucher.discountType === 'percent' ? 'GIẢM' : 'K'}</div>
        </div>
        <div class="voucher-right">
          <div>
            <div class="voucher-title">${voucher.description || 'Mã giảm giá'}</div>
            <div class="voucher-desc">${voucher.minOrder > 0 ? 'Đơn từ ' + formatPriceShort(voucher.minOrder) : 'Áp dụng mọi đơn hàng'}</div>
            <div class="voucher-code">${voucher.code}</div>
          </div>
          <div class="voucher-footer">
            <span class="voucher-expiry">
              <i class="far fa-clock mr-1"></i>${isHot ? '🔥 Còn ' + voucher.daysRemaining + ' ngày' : 'HSD: ' + voucher.daysRemaining + ' ngày'}
            </span>
            <button 
              class="voucher-btn ${isSaved ? 'saved' : ''}"
              onclick="saveVoucher(${voucher.id}, '${voucher.code}', this)"
              ${isSaved ? 'disabled' : ''}
            >
              ${isSaved ? '✓ Đã lưu' : 'Lưu mã'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = voucherHTML;
}

// Hàm xem thêm voucher
function showMoreVouchers() {
  displayedVoucherCount += VOUCHERS_PER_PAGE;
  renderVouchers(allVouchers);
  
  // Scroll nhẹ xuống để thấy voucher mới
  const container = document.getElementById('vouchers-container');
  if (container) {
    setTimeout(() => {
      container.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}

// Hàm reset về 6 voucher ban đầu (nếu cần)
function resetVoucherDisplay() {
  displayedVoucherCount = VOUCHERS_PER_PAGE;
  renderVouchers(allVouchers);
}

// ============================================================
// LOAD FEATURED PRODUCTS - Sản phẩm nổi bật
// ============================================================
async function loadFeaturedProducts() {
  const container = document.getElementById('featured-products');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i></div>';

  try {
    const response = await fetch(`${API_BASE}/products`);
    let products = await response.json();
    
    if (Array.isArray(products) && products.length > 0) {
      // Lấy 8 sản phẩm ngẫu nhiên
      products = products.sort(() => Math.random() - 0.5).slice(0, 8);
      featuredProducts = products;
      renderFeaturedProducts(products, container);
    } else {
      container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">Không có sản phẩm</div>';
    }
  } catch (error) {
    console.error('Error loading featured products:', error);
    container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">Không thể tải sản phẩm</div>';
  }
}

function renderFeaturedProducts(products, container) {
  container.innerHTML = products.map(p => {
    const price = parseFloat(p.gia || p.price || 0);
    // Sử dụng helper function để chuẩn hóa ảnh
    const image = normalizeImageUrl(p.image || p.anh_dai_dien);
    const name = p.ten_sp || p.name || 'Sản phẩm';
    const id = p.ma_sp || p.id;
    
    return `
      <div class="featured-card" onclick="window.location.href='product-detail.html?id=${id}'">
        <div class="featured-image">
          <img src="${image}" alt="${name}" onerror="this.onerror=null; this.src='images/IPHONE17.avif';">
          <div class="featured-badge">HOT</div>
        </div>
        <div class="featured-info">
          <h3 class="featured-name">${name}</h3>
          <div class="featured-price">${formatPriceVND(price)}</div>
          <div class="featured-rating">
            <i class="fas fa-star"></i>
            <i class="fas fa-star"></i>
            <i class="fas fa-star"></i>
            <i class="fas fa-star"></i>
            <i class="fas fa-star-half-alt"></i>
            <span>(${Math.floor(Math.random() * 100) + 10})</span>
          </div>
          <button class="view-detail-btn" onclick="event.stopPropagation(); window.location.href='product-detail.html?id=${id}'">
            <i class="fas fa-eye mr-2"></i>Xem chi tiết
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// SAVE VOUCHER - Lưu mã giảm giá
// ============================================================
async function saveVoucher(voucherId, code, button) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!user || !user.ma_kh) {
    showToast('Vui lòng đăng nhập để lưu voucher', 'warning');
    setTimeout(() => {
      window.location.href = 'login.html?redirect=promotions';
    }, 1500);
    return;
  }

  try {
    const savedVouchers = JSON.parse(localStorage.getItem('savedVouchers') || '[]');

    if (savedVouchers.some(v => v.id === voucherId || v.code === code)) {
      showToast('Voucher này đã được lưu', 'info');
      return;
    }

    // Lấy thông tin voucher từ data attribute
    const card = button.closest('.voucher-card');
    const voucherInfo = {
      id: voucherId,
      code: code,
      discountType: card?.dataset.discountType || 'fixed',
      discountValue: parseFloat(card?.dataset.discountValue) || 0,
      minOrder: parseFloat(card?.dataset.minOrder) || 0,
      description: card?.dataset.description || '',
      savedAt: new Date().toISOString()
    };

    // Lưu vào localStorage
    savedVouchers.push(voucherInfo);
    localStorage.setItem('savedVouchers', JSON.stringify(savedVouchers));

    // Gọi API để lưu vào server (nếu có)
    try {
      await fetch(`${API_BASE}/promotions/vouchers/${voucherId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.ma_kh })
      });
    } catch (e) {
      console.log('Server save skipped');
    }

    // Update button
    button.textContent = '✓ Đã lưu';
    button.classList.add('saved');
    button.disabled = true;

    showToast('Đã lưu mã giảm giá!', 'success');
  } catch (error) {
    console.error('Error saving voucher:', error);
    showToast('Không thể lưu voucher', 'error');
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function formatPriceVND(price) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(price);
}

function formatPriceShort(price) {
  if (price >= 1000000) {
    return (price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1) + 'tr';
  } else if (price >= 1000) {
    return (price / 1000).toFixed(0) + 'K';
  }
  return price.toString() + 'đ';
}

function showToast(message, type = 'success') {
  // Remove existing toast
  const existingToast = document.querySelector('.promo-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `promo-toast fixed bottom-4 right-4 px-6 py-3 rounded-xl shadow-2xl z-50 transition-all transform ${
    type === 'success' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white' : 
    type === 'error' ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white' : 
    type === 'warning' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' :
    'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
  }`;
  
  const icon = type === 'success' ? 'fa-check-circle' : 
               type === 'error' ? 'fa-times-circle' : 
               type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
  
  toast.innerHTML = `<div class="flex items-center gap-3"><i class="fas ${icon} text-lg"></i><span class="font-medium">${message}</span></div>`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================
// INITIALIZE PAGE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initCountdownTimer();
  loadFlashSaleProducts();
  loadVouchers();
  loadFeaturedProducts();
});
