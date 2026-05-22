// ===== PRODUCT DETAIL PAGE - QuangHưng Mobile 2025 =====

// Global Variables
let PRODUCTS = [];
let currentProduct = null;
let selectedRating = 0;
let reviewImages = []; // Lưu base64 của ảnh đánh giá
let shopSettings = { hideStockFromCustomer: false }; // Cài đặt shop
let currentStock = 0; // Lưu số lượng tồn kho thực tế
const API_URL = 'http://localhost:3000/api';

// Brand logos fallback
const BRAND_LOGOS = {
  iphone: 'images/logo_iphone_ngang_eac93ff477.webp',
  samsung: 'images/logo_samsung_ngang_1624d75bd8.webp',
  oppo: 'images/logo_oppo_ngang_68d31fcd73.webp',
  xiaomi: 'images/logo_xiaomi_ngang_0faf267234.webp',
  sony: 'images/sony-xperia-1-vi.webp',
  pixel: 'images/pixel-9-pro.avif'
};

// Load cài đặt shop từ API
async function loadShopSettings() {
  try {
    const response = await fetch(`${API_URL}/admin/settings/public`);
    const data = await response.json();
    if (data.success) {
      shopSettings = data.data;
    }
  } catch (error) {
    console.log('Using default settings');
  }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = parseInt(urlParams.get('id')) || 1;
  
  try {
    // Load cài đặt shop trước
    await loadShopSettings();
    // Load chi tiết sản phẩm từ API (ưu tiên) hoặc từ danh sách
    await loadProductDetail(productId);
    
    // Ghi nhận lượt click sản phẩm để cập nhật sở thích động (Shopee/TikTok Shop style)
    trackProductClick(productId);
    
    // Tải hệ thống gợi ý ML mà không chặn luồng chính
    loadRecommendations(productId);
  } catch (error) {
    console.error('Error loading product:', error);
  } finally {
    // Đảm bảo ẩn loader dù có lỗi hay không
    hidePageLoader();
  }
  
  setupScrollListener();
});

// Hàm ghi nhận lượt click sản phẩm để cập nhật sở thích động
async function trackProductClick(productId) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (!isLoggedIn || !user || !user.ma_kh) return;

    await fetch(`${API_URL}/interests/track-click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.ma_kh,
        productId: productId
      })
    });
  } catch (error) {
    console.error('Lỗi khi ghi nhận lượt click sản phẩm:', error);
  }
}

// Hàm ẩn page loader
function hidePageLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }
}

// Load chi tiết sản phẩm từ API - lấy đầy đủ thông số từ admin
async function loadProductDetail(productId) {
  // Tạo AbortController để timeout request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 giây timeout
  
  try {
    // Gọi API chi tiết sản phẩm - sẽ trả về đầy đủ thông số từ bảng cau_hinh
    const response = await fetch(`${API_URL}/products/${productId}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const product = await response.json();
      if (product && product.id) {
        currentProduct = product;
        PRODUCTS = [product]; // Lưu vào mảng để các hàm khác sử dụng
        renderProductDetail(productId);
        
        // Load thêm tất cả sản phẩm và render lại phần liên quan
        await loadRelatedProducts();
        // Render lại sản phẩm liên quan sau khi đã load xong
        renderRelatedProducts(currentProduct);
        return;
      }
    }
    throw new Error('API không khả dụng');
  } catch (error) {
    console.log('Fallback to product list:', error.message);
    // Fallback: Load từ danh sách sản phẩm
    await loadProductData();
    renderProductDetail(productId);
  }
}

// Load tất cả sản phẩm để thuật toán tính điểm có thể quét toàn bộ
async function loadRelatedProducts() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 giây timeout
  
  try {
    const response = await fetch(`${API_URL}/products`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const allProducts = await response.json();
      if (allProducts.length > 0) {
        PRODUCTS = allProducts; // Lưu tất cả sản phẩm vào bộ nhớ để lọc
      }
    }
  } catch (error) {
    console.log('Error loading related products:', error);
  }
}

// Load product data from API or JSON
async function loadProductData() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 giây timeout
  
  try {
    // Thử lấy từ API trước
    const apiResponse = await fetch(`${API_URL}/products`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (apiResponse.ok) {
      const apiData = await apiResponse.json();
      if (apiData && apiData.length > 0) {
        PRODUCTS = apiData;
        return;
      }
    }
    throw new Error('API không khả dụng');
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('Fallback to product-data.json:', error.message);
    // Fallback: Lấy từ file JSON
    try {
      const response = await fetch('product-data.json');
      const data = await response.json();
      PRODUCTS = data.products || [];
    } catch (jsonError) {
      console.error('Error loading products:', jsonError);
      PRODUCTS = getFallbackData();
    }
  }
}

// Fallback data
function getFallbackData() {
  return [
    {id:1,name:'Samsung Galaxy A36 5G',brand:'samsung',category:'dienthoai',price:8490000,oldPrice:9490000,discount:10,ram:8,storage:128,screen:'6.6" Super AMOLED',camera:'50MP',battery:'5000 mAh',os:'Android 14',features:['tragop','freeship'],colors:['#e8f5e9','#000000'],image:'images/samsung_galaxy_a36_5g.avif',rating:4.5,reviews:152},
    {id:5,name:'iPhone 15 Pro Max 256GB',brand:'iphone',category:'dienthoai',price:28990000,oldPrice:34990000,discount:17,ram:8,storage:256,screen:'6.7" Super Retina XDR',camera:'48MP',battery:'4422 mAh',os:'iOS 17',features:['tragop','freeship'],colors:['#4a4a4a','#e8e8e8','#ffd700'],image:'images/15-256.avif',rating:4.9,reviews:512},
    {id:9,name:'Samsung Galaxy S25 Ultra',brand:'samsung',category:'dienthoai',price:31990000,oldPrice:35990000,discount:11,ram:12,storage:256,screen:'6.8" Dynamic AMOLED 2X',camera:'200MP',battery:'5000 mAh',os:'Android 15',features:['tragop','freeship'],colors:['#9e9e9e','#000000'],image:'images/samsung.webp',rating:4.8,reviews:687}
  ];
}

// ===== UTILITY FUNCTIONS =====
function formatPrice(price) {
  return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
}

function generateStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
  if (half) html += '<i class="fas fa-star-half-alt"></i>';
  for (let i = full + (half ? 1 : 0); i < 5; i++) html += '<i class="far fa-star"></i>';
  return html;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast-notification ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle text-green-500' : 'exclamation-circle text-red-500'} text-xl"></i>
    <span class="font-medium text-gray-800">${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== RENDER PRODUCT DETAIL =====
function renderProductDetail(productId) {
  // Sử dụng currentProduct nếu đã có (từ API), hoặc tìm trong PRODUCTS với so sánh lỏng
  const product = currentProduct || PRODUCTS.find(p => p.id == productId);
  currentProduct = product;
  
  if (!product) {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.innerHTML = `
        <div class="text-center py-20">
          <i class="fas fa-exclamation-triangle text-6xl text-gray-300 mb-4"></i>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Không tìm thấy sản phẩm</h2>
          <p class="text-gray-600 mb-6">Sản phẩm bạn tìm kiếm không tồn tại.</p>
          <a href="products.html" class="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition">
            <i class="fas fa-arrow-left"></i> Quay lại
          </a>
        </div>
      `;
    }
    return;
  }

  // Update page info
  document.title = `${product.name} - QuangHưng Mobile`;
  const breadcrumbEl = document.getElementById('breadcrumbProduct');
  if (breadcrumbEl) breadcrumbEl.textContent = product.name;
  
  // Calculate stats
  const rating = product.rating || 4.5;
  const reviews = product.reviews || Math.floor(Math.random() * 200) + 50;
  const sold = Math.floor(Math.random() * 500) + 100;
  const stock = product.stock || Math.floor(Math.random() * 50) + 10;

  // Đảm bảo đường dẫn ảnh đúng
  let mainImage = product.image;
  if (mainImage && !mainImage.startsWith('http') && !mainImage.startsWith('images/')) {
    mainImage = `images/${mainImage}`;
  }
  
  // Update main image
  const mainImgEl = document.getElementById('mainProductImage');
  if (mainImgEl) {
    mainImgEl.src = mainImage;
    mainImgEl.alt = product.name;
    mainImgEl.onerror = function() { this.src = 'images/iphone.jpg'; };
  }
  
  // Update discount badge
  const discountBadge = document.getElementById('discountBadge');
  const discountPercent = document.getElementById('discountPercent');
  if (product.discount && discountBadge && discountPercent) {
    discountBadge.classList.remove('hidden');
    discountPercent.textContent = product.discount;
  }
  const brandBadge = document.getElementById('brandBadge');
  if (brandBadge) brandBadge.classList.remove('hidden');
  
  // Update thumbnails
  renderThumbnails(product);
  
  // Update product info
  const productTitle = document.getElementById('productTitle');
  const ratingStars = document.getElementById('ratingStars');
  const ratingValue = document.getElementById('ratingValue');
  const reviewCountEl = document.getElementById('reviewCount');
  const soldCountEl = document.getElementById('soldCount');
  
  if (productTitle) productTitle.textContent = product.name;
  if (ratingStars) ratingStars.innerHTML = generateStars(rating);
  if (ratingValue) ratingValue.textContent = rating.toFixed(1);
  if (reviewCountEl) reviewCountEl.textContent = reviews;
  if (soldCountEl) soldCountEl.textContent = sold;
  
  // Update prices
  const currentPriceEl = document.getElementById('currentPrice');
  if (currentPriceEl) currentPriceEl.textContent = formatPrice(product.price);
  
  if (product.oldPrice) {
    const oldPriceEl = document.getElementById('oldPrice');
    if (oldPriceEl) oldPriceEl.textContent = formatPrice(product.oldPrice);
    const oldPriceBox = document.getElementById('oldPriceBox');
    if (oldPriceBox) oldPriceBox.classList.remove('hidden');
    const savingBadge = document.getElementById('savingBadge');
    const savingAmount = document.getElementById('savingAmount');
    if (savingBadge) savingBadge.classList.remove('hidden');
    if (savingAmount) savingAmount.textContent = formatPrice(product.oldPrice - product.price);
  }
  
  // Update stock
  const stockCountEl = document.getElementById('stockCount');
  const stockContainer = stockCountEl ? stockCountEl.closest('span') : null;
  const quantityEl = document.getElementById('quantity');
  
  // Lưu số lượng tồn kho thực tế để kiểm tra
  currentStock = stock;
  
  // Kiểm tra cài đặt ẩn tồn kho
  if (shopSettings.hideStockFromCustomer) {
    // Ẩn phần hiển thị số lượng tồn kho
    if (stockContainer) {
      stockContainer.innerHTML = stock > 0 
        ? '<i class="fas fa-check-circle text-green-500 mr-1"></i><span class="text-green-600 font-medium">Còn hàng</span>'
        : '<i class="fas fa-times-circle text-red-500 mr-1"></i><span class="text-red-600 font-medium">Hết hàng</span>';
    }
  } else {
    // Hiển thị số lượng tồn kho bình thường
    if (stockCountEl) stockCountEl.textContent = stock;
  }
  
  if (quantityEl) quantityEl.max = stock;
  
  // Cập nhật giao diện nút mua hàng khi hết hàng
  updateBuyButtonsState(stock);
  
  // Render storage options first (Phiên bản)
  const storageSection = document.getElementById('storageSection');
  if (product.category === 'dienthoai' && product.storage && storageSection) {
    storageSection.classList.remove('hidden');
    renderStorageOptions(product.storage);
  }
  
  // Render color options với colorNames từ API
  const colorSection = document.getElementById('colorSection');
  if (product.colors && product.colors.length > 0 && colorSection) {
    colorSection.classList.remove('hidden');
    renderColorOptions(product.colors, product.colorNames);
  }
  
  // Update sticky bar
  const stickyImage = document.getElementById('stickyImage');
  const stickyName = document.getElementById('stickyName');
  const stickyPrice = document.getElementById('stickyPrice');
  if (stickyImage) stickyImage.src = product.image;
  if (stickyName) stickyName.textContent = product.name;
  if (stickyPrice) stickyPrice.textContent = formatPrice(product.price);
  
  // Update tabs
  const tabReviewCount = document.getElementById('tabReviewCount');
  if (tabReviewCount) tabReviewCount.textContent = reviews;
  
  // Load initial tab content
  loadDescription();
  
  // Load related products
  renderRelatedProducts(product);
  
  // Load reviews từ API (sẽ cập nhật cả thống kê)
  loadReviews();
  
  // Load rating stats từ API để cập nhật phần header
  loadProductRatingStats(product.id);
}

// Load thống kê rating từ API để cập nhật phần header sản phẩm
async function loadProductRatingStats(productId) {
  try {
    const response = await fetch(`${API_URL}/reviews/product/${productId}/stats`);
    if (response.ok) {
      const stats = await response.json();
      
      // Cập nhật rating ở phần header sản phẩm
      const avgRating = parseFloat(stats.avgRating) || 0;
      document.getElementById('ratingStars').innerHTML = generateStars(avgRating);
      document.getElementById('ratingValue').textContent = avgRating.toFixed(1);
      document.getElementById('reviewCount').textContent = stats.totalReviews || 0;
      
      // Cập nhật tab count
      document.getElementById('tabReviewCount').textContent = stats.totalReviews || 0;
    }
  } catch (error) {
    console.error('Lỗi tải thống kê rating:', error);
  }
}

// Render thumbnails with multiple images
function renderThumbnails(product) {
  const container = document.getElementById('thumbnailsContainer');
  const wrapper = document.getElementById('thumbnailsWrapper');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Chỉ hiển thị ảnh từ API (admin thêm), không tạo ảnh giả
  let images = [];
  
  if (product.images && product.images.length > 0) {
    images = [...product.images];
  } else if (product.image) {
    // Chỉ dùng ảnh chính duy nhất
    images = [product.image];
  }
  
  // Lọc bỏ các ảnh không hợp lệ và ảnh banner
  images = images.filter(img => {
    if (!img || img.trim() === '') return false;
    
    const imgLower = img.toLowerCase().trim();
    
    if (imgLower === 'images/' || imgLower === 'images') return false;
    
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];
    const hasValidExtension = validExtensions.some(ext => imgLower.includes(ext));
    if (!hasValidExtension && !imgLower.startsWith('http')) return false;
    
    // Loại bỏ ảnh banner
    if (imgLower.includes('h1_1440x242')) return false;
    if (imgLower.includes('banner')) return false;
    if (imgLower.includes('1440x242')) return false;
    if (imgLower.includes('promo')) return false;
    if (imgLower.includes('khuyen-mai')) return false;
    if (imgLower.includes('khuyenmai')) return false;
    if (imgLower.includes('sale')) return false;
    if (imgLower.includes('_ad')) return false;
    if (/\d{3,4}x\d{2,3}/.test(imgLower)) return false;
    
    return true;
  });
  
  // Đảm bảo đường dẫn ảnh đúng và loại bỏ trùng lặp
  images = [...new Set(images.map(img => {
    if (!img) return null;
    if (img.startsWith('http')) return img;
    return img.startsWith('images/') ? img : `images/${img}`;
  }).filter(img => img !== null))];
  
  // ẨN HOÀN TOÀN phần thumbnails nếu chỉ có 0 hoặc 1 ảnh
  if (images.length <= 1) {
    if (wrapper) wrapper.style.display = 'none';
    return;
  }
  
  // Hiển thị thumbnails nếu có nhiều ảnh
  if (wrapper) wrapper.style.display = 'block';
  
  // Render thumbnails liền kề - style CellphoneS
  images.forEach((img, i) => {
    const isFirst = i === 0;
    const thumb = document.createElement('div');
    thumb.className = `thumb-item flex-shrink-0 cursor-pointer border-2 rounded-xl overflow-hidden transition-all ${isFirst ? 'border-red-500' : 'border-gray-200 hover:border-red-300'}`;
    thumb.style.cssText = 'width: 90px; height: 90px; padding: 6px; background: white;';
    thumb.setAttribute('data-index', i);
    thumb.onclick = () => selectThumbnail(i, img);
    
    // Thêm badge "Tính năng nổi bật" cho ảnh đầu tiên
    if (isFirst) {
      thumb.innerHTML = `
        <div class="relative w-full h-full">
          <img src="${img}" alt="Ảnh ${i + 1}" class="w-full h-full object-contain" onerror="this.parentElement.parentElement.style.display='none'" />
          <div class="absolute -top-1 -left-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
            <i class="fas fa-star text-white text-xs"></i>
          </div>
        </div>
      `;
    } else {
      thumb.innerHTML = `<img src="${img}" alt="Ảnh ${i + 1}" class="w-full h-full object-contain" onerror="this.parentElement.style.display='none'" />`;
    }
    
    container.appendChild(thumb);
  });
  
  // Cập nhật hiển thị nút scroll
  updateScrollButtons();
}

// Cập nhật hiển thị nút scroll thumbnails
function updateScrollButtons() {
  const scroll = document.getElementById('thumbnailsScroll');
  const prevBtn = document.getElementById('thumbPrevBtn');
  const nextBtn = document.getElementById('thumbNextBtn');
  
  if (!scroll || !prevBtn || !nextBtn) return;
  
  const canScrollLeft = scroll.scrollLeft > 0;
  const canScrollRight = scroll.scrollLeft < scroll.scrollWidth - scroll.clientWidth - 5;
  
  prevBtn.style.display = canScrollLeft ? 'flex' : 'none';
  nextBtn.style.display = canScrollRight ? 'flex' : 'none';
}

// Scroll thumbnails
function scrollThumbnails(direction) {
  const scroll = document.getElementById('thumbnailsScroll');
  if (!scroll) return;
  
  const scrollAmount = 150;
  scroll.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
  
  setTimeout(updateScrollButtons, 300);
}

// Initialize thumbnail swiper
function initThumbnailSwiper() {
  new Swiper('.thumbSwiper', {
    spaceBetween: 10,
    slidesPerView: 4,
    freeMode: true,
    watchSlidesProgress: true,
  });
}

// Select thumbnail - cập nhật ảnh chính
function selectThumbnail(index, imageSrc) {
  // Cập nhật active state cho thumbnails - style mới
  document.querySelectorAll('.thumb-item').forEach((item, i) => {
    if (i === index) {
      item.classList.remove('border-gray-200', 'hover:border-red-300');
      item.classList.add('border-red-500');
    } else {
      item.classList.remove('border-red-500');
      item.classList.add('border-gray-200', 'hover:border-red-300');
    }
  });
  
  // Cập nhật ảnh chính với hiệu ứng fade
  const mainImage = document.getElementById('mainProductImage');
  mainImage.style.opacity = '0';
  
  setTimeout(() => {
    mainImage.src = imageSrc;
    mainImage.style.opacity = '1';
  }, 150);
}

// Render color options - hiển thị nhiều màu với tên từ API
function renderColorOptions(colors, colorNames = null) {
  const container = document.getElementById('colorOptions');
  
  // Fallback tên màu tiếng Việt nếu API không trả về
  const defaultColorNames = {
    '#000000': 'Đen',
    '#1c1c1c': 'Titan Đen',
    '#1f2937': 'Đen Graphite',
    '#4a4a4a': 'Titan Đen',
    '#6b7280': 'Xám',
    '#808080': 'Xám Titan',
    '#9e9e9e': 'Xám Bạc',
    '#c0c0c0': 'Bạc',
    '#e5e4e2': 'Titan Xám',
    '#e8e8e8': 'Trắng',
    '#f5f5f5': 'Trắng Ngọc Trai',
    '#f5f5dc': 'Titan Trắng',
    '#ffffff': 'Trắng',
    '#ffd700': 'Vàng',
    '#ffff00': 'Vàng Amber',
    '#ffa500': 'Cam',
    '#f5deb3': 'Titan Sa Mạc',
    '#c4a77d': 'Titan Tự Nhiên',
    '#a0522d': 'Nâu Đồng',
    '#ff6b6b': 'Đỏ Hồng',
    '#ffc0cb': 'Hồng',
    '#dda0dd': 'Tím Lavender',
    '#e6e6fa': 'Tím Nhạt',
    '#4b0082': 'Tím Aurora',
    '#483d8b': 'Tím Cobalt',
    '#000080': 'Xanh Navy',
    '#4169e1': 'Xanh Dương',
    '#0000ff': 'Xanh Dương',
    '#87ceeb': 'Xanh Băng',
    '#00ced1': 'Xanh Cyan',
    '#4ecdc4': 'Xanh Mòng Két',
    '#3b4b59': 'Titan Xanh',
    '#228b22': 'Xanh Lục',
    '#00ff00': 'Xanh Lá',
    '#90ee90': 'Xanh Mint',
    '#e8f5e9': 'Xanh Lá Nhạt',
    '#f7dc6f': 'Vàng Chanh'
  };
  
  // Sử dụng colorNames từ API nếu có, không thì dùng default
  const names = colorNames || currentProduct.colorNames || [];
  
  container.innerHTML = colors.map((color, i) => {
    // Ưu tiên tên từ API, sau đó mới dùng default
    const colorName = names[i] || defaultColorNames[color.toLowerCase()] || `Màu ${i + 1}`;
    return `
      <button class="color-option-card ${i === 0 ? 'active' : ''}" onclick="selectColorCard(this, '${color}', '${colorName}')" data-color="${color}" data-name="${colorName}">
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-lg border-2 border-gray-200 flex-shrink-0 shadow-sm" style="background-color: ${color};"></div>
          <div class="text-left flex-1">
            <div class="font-semibold text-gray-900 text-sm">${colorName}</div>
            <div class="text-xs text-red-600 font-medium">${formatPrice(currentProduct.price)}</div>
          </div>
        </div>
      </button>
    `;
  }).join('');
}

// Select color card
function selectColorCard(btn, colorCode, colorName) {
  document.querySelectorAll('.color-option-card').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  // Cập nhật tên màu đã chọn (nếu cần)
  const selectedColorDisplay = document.getElementById('selectedColorName');
  if (selectedColorDisplay) {
    selectedColorDisplay.textContent = colorName;
  }
}

// Render storage options - giống style CellphoneS với giá theo phiên bản
function renderStorageOptions(currentStorage) {
  const container = document.getElementById('storageOptions');
  
  // Tạo các phiên bản dung lượng với giá tương ứng
  const storageVariants = [];
  
  // Nếu là iPhone hoặc Samsung cao cấp, có nhiều phiên bản hơn
  const basePrice = currentProduct.price;
  const isHighEnd = basePrice > 20000000;
  
  if (isHighEnd) {
    if (currentStorage <= 256) storageVariants.push({ size: 256, price: basePrice });
    if (currentStorage <= 512) storageVariants.push({ size: 512, price: basePrice + 3000000 });
    storageVariants.push({ size: 1024, price: basePrice + 6000000 });
  } else {
    storageVariants.push({ size: currentStorage, price: basePrice });
    if (currentStorage < 256) storageVariants.push({ size: 256, price: basePrice + 1500000 });
    if (currentStorage < 512) storageVariants.push({ size: 512, price: basePrice + 3500000 });
  }
  
  container.innerHTML = storageVariants.map((variant, i) => {
    const sizeLabel = variant.size >= 1024 ? '1TB' : `${variant.size}GB`;
    const isActive = variant.size === currentStorage;
    
    return `
      <button class="storage-option-card ${isActive ? 'active' : ''}" onclick="selectStorageCard(this, ${variant.size}, ${variant.price})">
        <div class="storage-size font-bold text-gray-900">${sizeLabel}</div>
      </button>
    `;
  }).join('');
}

// Select storage card
function selectStorageCard(btn, size, price) {
  document.querySelectorAll('.storage-option-card').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  // Cập nhật giá hiển thị
  document.getElementById('currentPrice').textContent = formatPrice(price);
  document.getElementById('stickyPrice').textContent = formatPrice(price);
  
  // Cập nhật tiết kiệm nếu có oldPrice
  if (currentProduct.oldPrice) {
    const saving = currentProduct.oldPrice - price + (price - currentProduct.price);
    document.getElementById('savingAmount').textContent = formatPrice(Math.max(0, currentProduct.oldPrice - price));
  }
}


// ===== QUANTITY FUNCTIONS =====
function changeQuantity(delta) {
  const input = document.getElementById('quantity');
  // Sử dụng currentStock thay vì max attribute để đảm bảo kiểm tra chính xác
  const max = currentStock || parseInt(input.max) || 99;
  let value = parseInt(input.value) || 1;
  const newValue = value + delta;
  
  // Kiểm tra không vượt quá tồn kho
  if (newValue > max) {
    showToast(`Số lượng tối đa có thể mua là ${max} sản phẩm`, 'error');
    return;
  }
  
  value = Math.max(1, Math.min(max, newValue));
  input.value = value;
}

// Kiểm tra khi người dùng nhập trực tiếp số lượng
function validateQuantityInput() {
  const input = document.getElementById('quantity');
  const max = currentStock || parseInt(input.max) || 99;
  let value = parseInt(input.value) || 1;
  
  if (value > max) {
    showToast(`Số lượng tối đa có thể mua là ${max} sản phẩm`, 'error');
    input.value = max;
  } else if (value < 1) {
    input.value = 1;
  }
}

// ===== CART FUNCTIONS =====
// Lấy cart key theo user (mỗi user có giỏ hàng riêng)
function getCartKey() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (user && user.ma_kh) {
    return `cart_user_${user.ma_kh}`;
  }
  return 'cart_guest';
}

// Kiểm tra đăng nhập
function isLoggedIn() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  return user && user.ma_kh;
}

// Hiển thị modal yêu cầu đăng nhập
function showLoginRequiredModal() {
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
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeLoginModal();
  });
}

function closeLoginModal() {
  const modal = document.getElementById('login-required-modal');
  if (modal) modal.remove();
}

// Cập nhật trạng thái nút mua hàng khi hết hàng
function updateBuyButtonsState(stock) {
  const isOutOfStock = !stock || stock <= 0;
  
  // Tìm tất cả nút mua hàng và thêm giỏ hàng
  const buyNowBtns = document.querySelectorAll('button[onclick*="buyNow"]');
  const addCartBtns = document.querySelectorAll('button[onclick*="addToCart"]');
  
  if (isOutOfStock) {
    // Vô hiệu hóa và thay đổi giao diện nút MUA NGAY
    buyNowBtns.forEach(btn => {
      btn.disabled = true;
      btn.classList.remove('bg-gradient-to-r', 'from-red-600', 'to-red-500', 'hover:from-red-700', 'hover:to-red-600', 'bg-red-600', 'hover:bg-red-700', 'hover:scale-[1.02]');
      btn.classList.add('bg-gray-400', 'cursor-not-allowed');
      btn.innerHTML = '<i class="fas fa-times-circle"></i> HẾT HÀNG';
    });
    
    // Vô hiệu hóa và thay đổi giao diện nút Thêm vào giỏ hàng
    addCartBtns.forEach(btn => {
      btn.disabled = true;
      btn.classList.remove('border-red-500', 'text-red-600', 'hover:bg-red-50');
      btn.classList.add('border-gray-300', 'text-gray-400', 'bg-gray-100', 'cursor-not-allowed');
      btn.innerHTML = '<i class="fas fa-times-circle"></i> Hết hàng';
    });
    
    // Vô hiệu hóa input số lượng
    const quantityEl = document.getElementById('quantity');
    if (quantityEl) {
      quantityEl.disabled = true;
      quantityEl.value = 0;
    }
    
    // Thêm banner hết hàng
    const productInfoSection = document.querySelector('.space-y-3');
    if (productInfoSection && !document.getElementById('out-of-stock-banner')) {
      const banner = document.createElement('div');
      banner.id = 'out-of-stock-banner';
      banner.className = 'bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4';
      banner.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <i class="fas fa-exclamation-triangle text-red-500 text-xl"></i>
          </div>
          <div>
            <p class="font-bold text-red-700">Sản phẩm tạm hết hàng</p>
            <p class="text-sm text-red-600">Vui lòng quay lại sau hoặc liên hệ hotline để được hỗ trợ.</p>
          </div>
        </div>
      `;
      productInfoSection.parentNode.insertBefore(banner, productInfoSection);
    }
  }
}

async function addToCart() {
  if (!currentProduct) return;
  
  // Kiểm tra sản phẩm hết hàng
  if (currentStock <= 0) {
    showToast('Sản phẩm đã hết hàng. Vui lòng quay lại sau!', 'error');
    return;
  }
  
  // Kiểm tra đăng nhập trước
  if (!isLoggedIn()) {
    showLoginRequiredModal();
    return;
  }
  
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const quantity = parseInt(document.getElementById('quantity').value) || 1;
  
  // Kiểm tra số lượng không vượt quá tồn kho
  const maxStock = currentStock || parseInt(document.getElementById('quantity').max) || 99;
  if (quantity > maxStock) {
    showToast(`Số lượng tối đa có thể mua là ${maxStock} sản phẩm`, 'error');
    document.getElementById('quantity').value = maxStock;
    return;
  }
  
  if (quantity < 1) {
    showToast('Số lượng phải lớn hơn 0', 'error');
    document.getElementById('quantity').value = 1;
    return;
  }
  
  // Lấy màu đang được chọn từ color card
  const selectedColorCard = document.querySelector('.color-option-card.active');
  const selectedStorage = document.querySelector('.storage-option.active .storage-size');
  const colorCode = selectedColorCard ? selectedColorCard.getAttribute('data-color') : (currentProduct.colors?.[0] || '#000000');
  const colorName = selectedColorCard ? selectedColorCard.getAttribute('data-name') : (currentProduct.colorNames?.[0] || 'Mặc định');
  const storage = selectedStorage ? selectedStorage.textContent : (currentProduct.storage ? `${currentProduct.storage}GB` : '128GB');
  
  try {
    // Gọi API thêm vào giỏ hàng
    const response = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.ma_kh,
        productId: currentProduct.id,
        quantity: quantity
      })
    });
    const data = await response.json();
    
    if (data.success) {
      // Sau khi thêm thành công, đồng bộ lại từ database để có cartItemId chính xác
      try {
        const cartResponse = await fetch(`${API_URL}/cart/${user.ma_kh}`);
        const cartData = await cartResponse.json();
        if (cartData.success) {
          const cartKey = getCartKey();
          localStorage.setItem(cartKey, JSON.stringify(cartData.data || []));
        }
      } catch (syncError) {
        console.log('Sync cart error:', syncError);
      }
      
      window.dispatchEvent(new Event('cartUpdated'));
      showToast(`Đã thêm "${currentProduct.name}" vào giỏ hàng!`, 'success');
    } else {
      showToast(data.message || 'Lỗi thêm giỏ hàng', 'error');
    }
  } catch (error) {
    console.error('Lỗi thêm giỏ hàng:', error);
    // Fallback: lưu localStorage nếu API lỗi
    const cartKey = getCartKey();
    let cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
    
    const existingItem = cart.find(item => item.id == currentProduct.id);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({
        id: currentProduct.id,
        name: currentProduct.name,
        price: currentProduct.price,
        originalPrice: currentProduct.oldPrice || currentProduct.price,
        image: currentProduct.image,
        quantity: quantity,
        color: colorName,
        colorCode: colorCode,
        storage: storage,
        inStock: true
      });
    }
    
    localStorage.setItem(cartKey, JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));
    showToast(`Đã thêm "${currentProduct.name}" vào giỏ hàng!`, 'success');
  }
}

async function buyNow() {
  // Kiểm tra sản phẩm hết hàng
  if (currentStock <= 0) {
    showToast('Sản phẩm đã hết hàng. Vui lòng quay lại sau!', 'error');
    return;
  }
  
  // Kiểm tra đăng nhập trước
  if (!isLoggedIn()) {
    showLoginRequiredModal();
    return;
  }
  await addToCart();
  window.location.href = 'checkout.html';
}

function addToWishlist() {
  if (!currentProduct) return;
  showToast(`Đã thêm "${currentProduct.name}" vào danh sách yêu thích!`, 'success');
}

// ===== TAB FUNCTIONS =====
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
  document.getElementById('tab-' + tabName).classList.remove('hidden');
  
  // Load content
  if (tabName === 'description') loadDescription();
  else if (tabName === 'specs') loadSpecs();
  else if (tabName === 'reviews') loadReviews();
}

// Load description
function loadDescription() {
  if (!currentProduct) return;
  
  // Lấy mô tả từ admin (nếu có), nếu không có thì dùng mô tả mặc định
  const customDescription = currentProduct.description || currentProduct.mo_ta || '';
  
  // Nếu admin đã nhập mô tả chi tiết, hiển thị nó
  let descriptionHTML = '';
  if (customDescription && customDescription.trim()) {
    // Chuyển đổi line breaks thành <br> và giữ format
    const formattedDesc = customDescription
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `<p class="text-gray-700 leading-relaxed text-base mb-3">${line}</p>`)
      .join('');
    
    descriptionHTML = `
      <div class="bg-white rounded-xl p-5 border border-gray-200 mb-6">
        <h4 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fas fa-info-circle text-red-600"></i> Mô tả sản phẩm
        </h4>
        <div class="prose max-w-none">
          ${formattedDesc}
        </div>
      </div>
    `;
  } else {
    // Mô tả mặc định nếu admin chưa nhập
    descriptionHTML = `
      <p class="text-gray-700 leading-relaxed text-base mb-6">
        <strong class="text-gray-900">${currentProduct.name}</strong> là sản phẩm cao cấp đến từ thương hiệu 
        <strong class="text-red-600">${currentProduct.brand.toUpperCase()}</strong>, mang đến trải nghiệm tuyệt vời 
        với thiết kế hiện đại và cấu hình mạnh mẽ.
      </p>
    `;
  }
  
  document.getElementById('productDescription').innerHTML = `
    <div class="space-y-6">
      ${descriptionHTML}
      
      <div class="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-5 border border-red-100">
        <h4 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fas fa-star text-yellow-400"></i> Điểm nổi bật
        </h4>
        <ul class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${currentProduct.screen ? `<li class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span>Màn hình ${currentProduct.screen} sắc nét</span></li>` : ''}
          ${currentProduct.camera ? `<li class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span>Camera ${currentProduct.camera} chuyên nghiệp</span></li>` : ''}
          ${currentProduct.ram ? `<li class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span>RAM ${currentProduct.ram} đa nhiệm mượt mà</span></li>` : ''}
          ${currentProduct.battery ? `<li class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span>Pin ${currentProduct.battery} dùng cả ngày</span></li>` : ''}
          <li class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span>Thiết kế sang trọng, cao cấp</span></li>
          <li class="flex items-center gap-3"><i class="fas fa-check-circle text-green-500"></i><span>Hiệu năng mạnh mẽ</span></li>
        </ul>
      </div>
      
      <div class="bg-blue-50 rounded-xl p-5 border border-blue-100">
        <h4 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fas fa-shield-alt text-blue-600"></i> Cam kết từ QuangHưng Mobile
        </h4>
        <ul class="space-y-2">
          <li class="flex items-center gap-3"><i class="fas fa-badge-check text-blue-600"></i><span>100% sản phẩm chính hãng, nguyên seal</span></li>
          <li class="flex items-center gap-3"><i class="fas fa-box text-blue-600"></i><span>Bảo hành chính hãng 12 tháng</span></li>
          <li class="flex items-center gap-3"><i class="fas fa-exchange-alt text-blue-600"></i><span>Đổi trả miễn phí trong 7 ngày</span></li>
          <li class="flex items-center gap-3"><i class="fas fa-shipping-fast text-blue-600"></i><span>Giao hàng nhanh chóng toàn quốc</span></li>
        </ul>
      </div>
    </div>
  `;
}

// Load specifications - Thông số kỹ thuật từ admin/database
function loadSpecs() {
  if (!currentProduct) return;
  
  const specs = [];
  
  // Lấy thông số từ sản phẩm (đã được API trả về từ bảng cau_hinh)
  const p = currentProduct;
  
  // Màn hình
  if (p.screen) {
    specs.push(['<i class="fas fa-mobile-alt text-red-500 mr-2"></i>Màn hình', p.screen]);
  }
  
  // Hệ điều hành
  if (p.os) {
    specs.push(['<i class="fab fa-' + (p.os.toLowerCase().includes('ios') ? 'apple' : 'android') + ' text-red-500 mr-2"></i>Hệ điều hành', p.os]);
  }
  
  // Chip xử lý
  if (p.chip) {
    specs.push(['<i class="fas fa-microchip text-red-500 mr-2"></i>Chip xử lý', p.chip]);
  }
  
  // RAM
  if (p.ram) {
    const ramValue = typeof p.ram === 'number' ? p.ram + 'GB' : p.ram;
    specs.push(['<i class="fas fa-memory text-red-500 mr-2"></i>RAM', ramValue]);
  }
  
  // Bộ nhớ trong
  if (p.storage) {
    const storageValue = typeof p.storage === 'number' ? p.storage + 'GB' : p.storage;
    specs.push(['<i class="fas fa-hdd text-red-500 mr-2"></i>Bộ nhớ trong', storageValue]);
  }
  
  // Camera sau
  if (p.camera) {
    specs.push(['<i class="fas fa-camera text-red-500 mr-2"></i>Camera sau', p.camera]);
  }
  
  // Camera trước
  if (p.frontCamera) {
    specs.push(['<i class="fas fa-camera text-red-500 mr-2"></i>Camera trước', p.frontCamera]);
  }
  
  // Pin
  if (p.battery) {
    specs.push(['<i class="fas fa-battery-full text-red-500 mr-2"></i>Dung lượng pin', p.battery]);
  }
  
  // SIM
  if (p.sim) {
    specs.push(['<i class="fas fa-sim-card text-red-500 mr-2"></i>SIM', p.sim]);
  }
  
  // Kết nối (mặc định dựa trên thời điểm hiện tại)
  const connectivity = p.os && p.os.toLowerCase().includes('ios') 
    ? '5G, Wi-Fi 6E, Bluetooth 5.3, NFC, USB-C' 
    : '5G, Wi-Fi 6, Bluetooth 5.3, NFC, USB-C';
  specs.push(['<i class="fas fa-wifi text-red-500 mr-2"></i>Kết nối', connectivity]);
  
  // Bảo mật
  const security = p.os && p.os.toLowerCase().includes('ios')
    ? 'Face ID, Touch ID (nút nguồn)'
    : 'Vân tay dưới màn hình / Mặt ngang';
  specs.push(['<i class="fas fa-fingerprint text-red-500 mr-2"></i>Bảo mật', security]);
  
  // Chống nước
  specs.push(['<i class="fas fa-tint text-red-500 mr-2"></i>Chống nước', 'IP68 (chống nước và bụi)']);
  
  document.getElementById('productSpecs').innerHTML = `
    <div class="bg-gray-50 rounded-xl overflow-hidden">
      <table class="specs-table w-full">
        <tbody>
          ${specs.map(([label, value]) => `
            <tr>
              <td>${label}</td>
              <td class="text-gray-800">${value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <!-- Thông tin bổ sung -->
    <div class="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
      <h4 class="font-bold text-blue-900 mb-3 flex items-center gap-2">
        <i class="fas fa-info-circle"></i> Thông tin thêm
      </h4>
      <ul class="space-y-2 text-sm text-blue-800">
        <li class="flex items-center gap-2">
          <i class="fas fa-check text-blue-600"></i>
          Sản phẩm chính hãng, nguyên seal, đầy đủ phụ kiện
        </li>
        <li class="flex items-center gap-2">
          <i class="fas fa-check text-blue-600"></i>
          Bảo hành 12 tháng tại trung tâm bảo hành chính hãng
        </li>
      </ul>
    </div>
  `;
}

// Load reviews từ API
async function loadReviews() {
  if (!currentProduct) return;
  
  const reviewsList = document.getElementById('reviewsList');
  
  try {
    // Lấy đánh giá từ API
    const [reviewsRes, statsRes] = await Promise.all([
      fetch(`${API_URL}/reviews/product/${currentProduct.id}`),
      fetch(`${API_URL}/reviews/product/${currentProduct.id}/stats`)
    ]);
    
    if (reviewsRes.ok && statsRes.ok) {
      const reviews = await reviewsRes.json();
      const stats = await statsRes.json();
      
      // Cập nhật thống kê
      updateReviewStats(stats);
      
      // Render danh sách đánh giá
      if (reviews.length === 0) {
        reviewsList.innerHTML = `
          <div class="text-center py-8 text-gray-500">
            <i class="fas fa-comment-slash text-4xl mb-3 text-gray-300"></i>
            <p>Chưa có đánh giá nào cho sản phẩm này.</p>
            <p class="text-sm mt-2">Hãy là người đầu tiên đánh giá!</p>
          </div>
        `;
      } else {
        reviewsList.innerHTML = reviews.map(review => `
          <div class="review-item">
            <div class="flex items-start gap-4">
              <div class="review-avatar">${review.userName.charAt(0).toUpperCase()}</div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold text-gray-900">${review.userName}</span>
                  ${review.verified ? '<span class="review-verified"><i class="fas fa-check mr-1"></i>Đã mua hàng</span>' : ''}
                </div>
                <div class="flex items-center gap-2 mb-2">
                  <div class="review-stars">${generateStars(review.rating)}</div>
                  <span class="text-xs text-gray-500">${formatReviewDate(review.date)}</span>
                </div>
                <p class="text-gray-700 text-sm leading-relaxed">${review.comment}</p>
                ${review.images && review.images.length > 0 ? `
                  <div class="flex gap-2 mt-3">
                    ${review.images.map(img => `
                      <img src="${img}" alt="Ảnh đánh giá" class="w-16 h-16 object-cover rounded-lg border cursor-pointer hover:opacity-80" onclick="viewImage('${img}')" />
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('');
      }
    } else {
      throw new Error('Không thể tải đánh giá');
    }
  } catch (error) {
    console.error('Lỗi tải đánh giá:', error);
    // Fallback: hiển thị thông báo lỗi
    reviewsList.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <i class="fas fa-exclamation-circle text-4xl mb-3 text-red-300"></i>
        <p>Không thể tải đánh giá. Vui lòng thử lại sau.</p>
      </div>
    `;
  }
}

// Cập nhật thống kê đánh giá
function updateReviewStats(stats) {
  // Cập nhật điểm trung bình
  document.getElementById('avgRating').textContent = stats.avgRating || '0';
  document.getElementById('avgStars').innerHTML = generateStars(parseFloat(stats.avgRating) || 0);
  document.getElementById('totalReviewsDisplay').textContent = stats.totalReviews || 0;
  document.getElementById('tabReviewCount').textContent = stats.totalReviews || 0;
  
  // Cập nhật thanh phân bố sao
  const ratingBarsContainer = document.querySelector('.rating-bars-container');
  if (ratingBarsContainer) {
    const dist = stats.distribution;
    ratingBarsContainer.innerHTML = `
      ${[5, 4, 3, 2, 1].map(star => `
        <div class="flex items-center gap-2">
          <span class="text-sm w-8">${star} <i class="fas fa-star text-yellow-400 text-xs"></i></span>
          <div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-yellow-400 rounded-full" style="width: ${dist[`star${star}`]?.percent || 0}%"></div>
          </div>
          <span class="text-xs text-gray-500 w-8">${dist[`star${star}`]?.percent || 0}%</span>
        </div>
      `).join('')}
    `;
  }
}

// Format ngày đánh giá
function formatReviewDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Xem ảnh đánh giá
function viewImage(src) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer';
  modal.onclick = () => modal.remove();
  modal.innerHTML = `<img src="${src}" alt="Ảnh đánh giá" class="max-w-[90%] max-h-[90%] object-contain rounded-lg" />`;
  document.body.appendChild(modal);
}

// ===== REVIEW FORM =====
async function toggleReviewForm() {
  const form = document.getElementById('reviewForm');
  form.classList.toggle('hidden');
  
  // Initialize rating input
  if (!form.classList.contains('hidden')) {
    const ratingInput = document.getElementById('ratingInput');
    ratingInput.innerHTML = [1,2,3,4,5].map(i => `
      <button type="button" onclick="setRating(${i})" class="text-2xl text-gray-300 hover:text-yellow-400 transition">
        <i class="far fa-star" data-rating="${i}"></i>
      </button>
    `).join('');
    
    // Kiểm tra đăng nhập và quyền đánh giá
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const loginMsg = document.getElementById('loginRequiredMsg');
    const submitBtn = form.querySelector('button[onclick="submitReview()"]');
    
    if (loginMsg) {
      if (!user || !user.ma_kh) {
        loginMsg.innerHTML = `<i class="fas fa-info-circle mr-2"></i>Vui lòng <a href="login.html" class="text-red-600 font-semibold hover:underline">đăng nhập</a> để đánh giá sản phẩm.`;
        loginMsg.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;
      } else {
        // Kiểm tra quyền đánh giá (đã mua hàng chưa)
        try {
          const response = await fetch(`${API_URL}/reviews/can-review/${currentProduct.id}/${user.ma_kh}`);
          const data = await response.json();
          
          if (!data.canReview) {
            loginMsg.innerHTML = `<i class="fas fa-info-circle mr-2"></i>${data.message}`;
            loginMsg.className = 'mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800';
            loginMsg.classList.remove('hidden');
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
          } else {
            loginMsg.classList.add('hidden');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
          }
        } catch (error) {
          console.error('Lỗi kiểm tra quyền đánh giá:', error);
          loginMsg.classList.add('hidden');
        }
      }
    }
  }
}

function setRating(rating) {
  selectedRating = rating;
  document.querySelectorAll('#ratingInput i').forEach((star, i) => {
    star.className = i < rating ? 'fas fa-star text-yellow-400' : 'far fa-star text-gray-300';
  });
}

// Preview ảnh đánh giá trước khi upload
function previewReviewImages(input) {
  const files = input.files;
  const previewContainer = document.getElementById('reviewImagePreview');
  
  // Giới hạn 5 ảnh
  if (reviewImages.length + files.length > 5) {
    showToast('Chỉ được upload tối đa 5 ảnh!', 'error');
    return;
  }
  
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) {
      showToast('Chỉ chấp nhận file ảnh!', 'error');
      return;
    }
    
    // Giới hạn kích thước 5MB
    if (file.size > 5 * 1024 * 1024) {
      showToast('Ảnh không được vượt quá 5MB!', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      reviewImages.push(base64);
      
      // Tạo preview
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'relative';
      imgWrapper.innerHTML = `
        <img src="${base64}" alt="Preview" class="w-20 h-20 object-cover rounded-lg border" />
        <button type="button" onclick="removeReviewImage(${reviewImages.length - 1}, this)" class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition">
          <i class="fas fa-times"></i>
        </button>
      `;
      previewContainer.appendChild(imgWrapper);
    };
    reader.readAsDataURL(file);
  });
  
  // Reset input để có thể chọn lại cùng file
  input.value = '';
}

// Xóa ảnh preview
function removeReviewImage(index, btn) {
  reviewImages.splice(index, 1);
  btn.parentElement.remove();
  
  // Cập nhật lại index của các nút xóa
  const previewContainer = document.getElementById('reviewImagePreview');
  const buttons = previewContainer.querySelectorAll('button');
  buttons.forEach((b, i) => {
    b.setAttribute('onclick', `removeReviewImage(${i}, this)`);
  });
}

async function submitReview() {
  const comment = document.getElementById('reviewComment').value.trim();
  
  // Kiểm tra đăng nhập
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.ma_kh) {
    showToast('Vui lòng đăng nhập để đánh giá!', 'error');
    setTimeout(() => {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
    }, 1500);
    return;
  }
  
  if (!comment || selectedRating === 0) {
    showToast('Vui lòng chọn số sao và nhập nhận xét!', 'error');
    return;
  }
  
  if (!currentProduct) {
    showToast('Không tìm thấy sản phẩm!', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productId: currentProduct.id,
        userId: user.ma_kh,
        rating: selectedRating,
        comment: comment,
        images: reviewImages // Gửi mảng ảnh base64
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showToast('Cảm ơn bạn đã đánh giá!', 'success');
      document.getElementById('reviewForm').classList.add('hidden');
      document.getElementById('reviewComment').value = '';
      document.getElementById('reviewImagePreview').innerHTML = '';
      selectedRating = 0;
      reviewImages = []; // Reset mảng ảnh
      
      // Reload đánh giá
      loadReviews();
    } else {
      // Xử lý lỗi cụ thể
      if (data.code === 'NOT_PURCHASED') {
        showToast('Bạn cần mua sản phẩm này trước khi đánh giá!', 'error');
      } else {
        showToast(data.error || 'Không thể gửi đánh giá!', 'error');
      }
    }
  } catch (error) {
    console.error('Lỗi gửi đánh giá:', error);
    showToast('Có lỗi xảy ra, vui lòng thử lại!', 'error');
  }
}

// ===== RELATED PRODUCTS =====
function renderRelatedProducts(product) {
  if (!product) return;
  
  // Thuật toán: Tính điểm tương đồng cho các sản phẩm khác
  const scoredProducts = PRODUCTS.filter(p => p.id != product.id).map(p => {
    let score = 0;
    
    // 1. Điểm về Giá (Price Similarity)
    if (product.price && p.price) {
        const priceDiff = Math.abs(p.price - product.price);
        const priceRatio = priceDiff / product.price;
        
        if (priceRatio <= 0.1) score += 20;      // Chênh lệch giá <= 10%
        else if (priceRatio <= 0.2) score += 10; // Chênh lệch giá <= 20%
        else if (priceRatio <= 0.3) score += 5;  // Chênh lệch giá <= 30%
    }

    // 2. Điểm về Hãng (Brand)
    if (p.brand && product.brand && p.brand === product.brand) {
        score += 15;
    }

    // 3. Điểm về Cấu hình (Specs)
    if (p.ram && product.ram && p.ram.toString().trim() === product.ram.toString().trim()) {
        score += 5; // Cùng dung lượng RAM
    }
    if (p.storage && product.storage && p.storage.toString().trim() === product.storage.toString().trim()) {
        score += 5; // Cùng dung lượng lưu trữ (ROM)
    }
    
    return { ...p, score };
  });

  // Lọc sản phẩm có điểm tương đồng (score > 0), sắp xếp giảm dần, lấy top 5
  let related = scoredProducts
    .filter(p => p.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
    
  // Nếu thuật toán không tìm đủ 5 sản phẩm tương đồng, lấy bù thêm (ưu tiên cùng danh mục hoặc bất kỳ)
  if (related.length < 5) {
      const existingIds = related.map(r => r.id);
      const fallbacks = PRODUCTS
          .filter(p => p.id != product.id && !existingIds.includes(p.id))
          .sort((a, b) => (a.brand === product.brand ? -1 : 1)) // Ưu tiên cùng hãng nếu phải bù thêm
          .slice(0, 5 - related.length);
      related = [...related, ...fallbacks];
  }
  const container = document.getElementById('relatedProducts');
  
  if (!container) return;
  
  if (related.length === 0) {
    container.innerHTML = '<p class="col-span-full text-center text-gray-500 py-8">Không có sản phẩm liên quan</p>';
    return;
  }
  
  container.innerHTML = related.map(p => {
    // Đảm bảo đường dẫn ảnh đúng
    let pImage = p.image;
    if (pImage && !pImage.startsWith('http') && !pImage.startsWith('images/')) {
      pImage = `images/${pImage}`;
    }
    return `
    <a href="product-detail.html?id=${p.id}" class="related-product-card group">
      <div class="aspect-square p-4 bg-gray-50 flex items-center justify-center overflow-hidden">
        <img src="${pImage}" alt="${p.name}" class="max-w-full max-h-full object-contain" loading="lazy" onerror="this.onerror=null; this.src='images/iphone.jpg';" />
      </div>
      <div class="p-3">
        <h3 class="font-semibold text-gray-900 text-sm mb-2 line-clamp-2 group-hover:text-red-600 transition">${p.name}</h3>
        <div class="flex items-baseline gap-2 mb-2">
          <span class="font-bold text-red-600">${formatPrice(p.price)}</span>
          ${p.oldPrice ? `<span class="text-xs text-gray-400 line-through">${formatPrice(p.oldPrice)}</span>` : ''}
        </div>
        ${p.discount ? `<span class="inline-block bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded">-${p.discount}%</span>` : ''}
        <div class="border border-gray-100 rounded p-1.5 mt-2 bg-gray-50 text-[11px] text-gray-600 min-h-[46px] flex flex-col justify-center">
            ${(p.shortDescription || 'Duy nhất 27/4 giá chỉ ' + formatPrice(p.price) + ' | Đổi trả miễn phí 30 ngày').split('|').map(line => {
                let text = line.trim();
                text = text.replace(/(\d+(?:\.\d+)*(?:k|đ| đ| triệu| ngày))/gi, '<span class="text-red-500 font-bold">$1</span>');
                return `<div class="mb-0.5 last:mb-0">${text}</div>`;
            }).join('')}
        </div>
      </div>
    </a>
  `;
  }).join('');
}

// ===== SHARE FUNCTIONS =====
function shareProduct(platform) {
  const url = encodeURIComponent(window.location.href);
  const title = encodeURIComponent(currentProduct?.name || 'Sản phẩm');
  
  const urls = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    messenger: `https://www.facebook.com/dialog/send?link=${url}&app_id=YOUR_APP_ID`,
    twitter: `https://twitter.com/intent/tweet?url=${url}&text=${title}`
  };
  
  if (urls[platform]) {
    window.open(urls[platform], '_blank', 'width=600,height=400');
  }
}

function copyLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast('Đã sao chép link sản phẩm!', 'success');
  });
}

// ===== SCROLL LISTENER =====
function setupScrollListener() {
  const stickyBar = document.getElementById('stickyBuyBar');
  const buySection = document.querySelector('main');
  
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY > 600) {
      stickyBar.classList.add('active');
    } else {
      stickyBar.classList.remove('active');
    }
  });
}

// ===== MACHINE LEARNING RECOMMENDATIONS (Khai Phá Kết Hợp / KNN) =====
async function loadRecommendations(productId) {
    try {
        // Tạo container nếu chưa có
        let recContainer = document.getElementById('ml-recommendations');
        if (!recContainer) {
            // Tìm nơi chèn (dưới phần đánh giá hoặc dưới thông tin sản phẩm)
            const mainContent = document.querySelector('.container.mx-auto');
            if(!mainContent) return;
            
            recContainer = document.createElement('div');
            recContainer.id = 'ml-recommendations';
            recContainer.className = 'mt-12 bg-white rounded-xl shadow-sm p-6 mb-8';
            recContainer.innerHTML = `<h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center"><i class="fas fa-sparkles text-yellow-500 mr-2"></i> Gợi ý thông minh cho bạn</h2><div id="ml-rec-list" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"></div>`;
            mainContent.appendChild(recContainer);
        }

        const listEl = document.getElementById('ml-rec-list');
        listEl.innerHTML = '<div class="col-span-full text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin mr-2"></i> AI Đang phân tích...</div>';
        
        // Gọi lên backend Node.js (Node.js sẽ gọi sang Python)
        // Lấy userId nếu đã đăng nhập hoặc giỏ hàng hiện tại
        let user = null;
        if (window.secureStorage) {
            user = window.secureStorage.getItem('user');
        } else {
            const userStr = localStorage.getItem('user');
            user = userStr ? JSON.parse(userStr) : null;
        }
        const userId = user ? user.ma_kh : null;
        const cartKey = getCartKey();
        const cartStr = localStorage.getItem(cartKey);
        const cartItems = cartStr ? JSON.parse(cartStr).map(i => 'PROD' + i.id) : [];

        const response = await fetch(`${API_URL}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, cartItems: cartItems })
        });
        
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            listEl.innerHTML = '';
            result.data.forEach(product => {
                const price = product.gia ? product.gia.toLocaleString('vi-VN') + 'đ' : 'Liên hệ';
                const oldPrice = product.gia_cu ? `<del class="text-xs text-gray-400 block">${product.gia_cu.toLocaleString('vi-VN')}đ</del>` : '';
                
                // Mặc định ảnh nếu lỗi
                const imgUrl = product.hinh_anh ? (product.hinh_anh.startsWith('http') ? product.hinh_anh : `../backend/${product.hinh_anh}`) : 'images/default-product.png';

                listEl.innerHTML += `
                    <a href="product-detail.html?id=${product.id}" class="group block border rounded-lg p-3 hover:shadow-lg transition-all duration-300 relative overflow-hidden bg-white">
                        ${result.source === 'ai' ? '<span class="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-full z-10 shadow-sm"><i class="fas fa-magic mr-1"></i>AI Đề xuất</span>' : ''}
                        <div class="h-40 w-full mb-3 overflow-hidden rounded-md flex items-center justify-center bg-gray-50">
                            <img src="${imgUrl}" alt="${product.ten_san_pham}" class="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-500">
                        </div>
                        <h3 class="text-sm font-semibold text-gray-800 line-clamp-2 min-h-[40px] group-hover:text-blue-600 transition-colors">${product.ten_san_pham}</h3>
                        <div class="mt-2">
                            ${oldPrice}
                            <span class="text-red-500 font-bold text-sm">${price}</span>
                        </div>
                    </a>
                `;
            });
        } else {
            recContainer.style.display = 'none'; // Ẩn luôn nếu không có gợi ý
        }
    } catch (error) {
        console.warn("Lỗi khi load ML Recommendations:", error);
        // Lỗi thì im lặng, không ảnh hưởng web
        const recContainer = document.getElementById('ml-recommendations');
        if (recContainer) recContainer.style.display = 'none';
    }
}

