// ===== CHECKOUT PAGE LOGIC =====
// QuangHưng Mobile - Modern E-commerce 2025

// ===== GLOBAL VARIABLES =====
// API_URL ưu tiên window.API_BASE_URL (đặt trong main.js), fallback localhost cho dev
const API_URL = window.API_BASE_URL || 'http://localhost:3000/api';
const SHIPPING_COST = { standard: 0, express: 30000 };
let cart = [];
let subtotal = 0;
let shippingFee = 0;
let discount = 0;
let freeshipDiscount = 0; // Giảm phí ship
let percentDiscount = 0;  // Giảm theo % hoặc số tiền cố định
let selectedShipping = 'standard';
let selectedPayment = 'cod';
let addressesLoaded = false;
let isPlacingOrder = false;

// Helper escape (fallback nếu main.js chưa load)
const _esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

// Voucher đã áp dụng
let appliedFreeshipVoucher = null;
let appliedDiscountVoucher = null;

// Danh sách tất cả voucher
let allAvailableVouchers = [];
let userSavedVouchers = []; // Voucher đã lưu của user
let currentVoucherFilter = 'all';

// ===== UTILITY FUNCTIONS =====
function formatPrice(price) {
  return price.toLocaleString('vi-VN') + 'đ';
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed top-24 right-6 z-50 px-6 py-4 rounded-lg shadow-xl text-white font-semibold animate-slide-in ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`;
  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
  toast.innerHTML = `<i class="fas fa-${iconName} mr-2"></i>${_esc(message)}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
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

// ===== KIỂM TRA ĐĂNG NHẬP =====
function checkLoginRequired() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  
  if (!isLoggedIn || !user || !user.ma_kh) {
    // Hiển thị thông báo và chuyển về trang đăng nhập
    showToast('Vui lòng đăng nhập để thanh toán!', 'error');
    setTimeout(() => {
      window.location.href = 'login.html?redirect=checkout';
    }, 1500);
    return false;
  }
  return true;
}

// ===== LOAD CART DATA =====
async function loadCart() {
  // Kiểm tra đăng nhập trước
  if (!checkLoginRequired()) {
    return;
  }
  
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  
  // ƯU TIÊN 1: Lấy sản phẩm được chọn từ trang giỏ hàng (checkout_items)
  const checkoutItems = localStorage.getItem('checkout_items');
  if (checkoutItems) {
    const parsedCheckoutItems = JSON.parse(checkoutItems);
    if (parsedCheckoutItems && parsedCheckoutItems.length > 0) {
      cart = parsedCheckoutItems;
      // Xóa checkout_items sau khi đã load để tránh dùng lại lần sau
      // localStorage.removeItem('checkout_items'); // Giữ lại để reload trang vẫn có
      renderCart();
      calculateTotal();
      return;
    }
  }
  
  // ƯU TIÊN 2: Nếu user đã đăng nhập, thử load từ database
  if (user && user.ma_kh) {
    try {
      const response = await fetch(`${API_URL}/cart/${user.ma_kh}`);
      const data = await response.json();
      
      if (data.success && data.data && data.data.length > 0) {
        cart = data.data;
        renderCart();
        calculateTotal();
        return;
      }
    } catch (error) {
      console.log('Fallback to localStorage:', error.message);
    }
  }
  
  // ƯU TIÊN 3: Fallback - Get cart from localStorage theo user
  const cartKey = getCartKey();
  const savedCart = localStorage.getItem(cartKey);
  
  if (savedCart) {
    const parsedCart = JSON.parse(savedCart);
    // Chỉ dùng nếu cart có sản phẩm
    if (parsedCart && parsedCart.length > 0) {
      cart = parsedCart;
    } else {
      cart = [];
    }
  } else {
    // Không có giỏ hàng - để trống, không dùng demo data
    cart = [];
  }
  
  // Nếu giỏ hàng trống, hiển thị thông báo và redirect
  if (cart.length === 0) {
    showToast('Giỏ hàng trống! Đang chuyển về trang sản phẩm...', 'error');
    setTimeout(() => {
      window.location.href = 'products.html';
    }, 2000);
    return;
  }
  
  renderCart();
  calculateTotal();
}

// ===== RENDER CART ITEMS =====
function renderCart() {
  const cartItemsContainer = document.getElementById('cartItems');
  
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="text-center py-8">
        <i class="fas fa-shopping-cart text-4xl text-gray-300 mb-3"></i>
        <p class="text-gray-600">Giỏ hàng trống</p>
        <a href="products.html" class="text-red-600 hover:underline text-sm mt-2 inline-block">
          Tiếp tục mua sắm
        </a>
      </div>
    `;
    return;
  }
  
  cartItemsContainer.innerHTML = cart.map(item => {
    // Xử lý đường dẫn ảnh
    let itemImage = item.image || item.anh_dai_dien || '';
    if (!itemImage) {
      itemImage = 'images/15-256.avif';
    } else if (!itemImage.startsWith('http') && !itemImage.startsWith('images/')) {
      itemImage = `images/${itemImage}`;
    }
    itemImage = itemImage.replace('images/images/', 'images/');
    
    // Xử lý màu sắc - parse JSON nếu cần
    let itemColor = '';
    if (item.color) {
      if (typeof item.color === 'string' && (item.color.startsWith('{') || item.color.startsWith('['))) {
        try {
          const colorData = JSON.parse(item.color);
          if (colorData.colorNames && colorData.colorNames.length > 0) {
            itemColor = colorData.colorNames[0];
          }
        } catch (e) {
          itemColor = item.color;
        }
      } else {
        itemColor = item.color;
      }
    }
    
    const safeName = _esc(item.name);
    const safeColor = _esc(itemColor);
    const safeStorage = _esc(item.storage);
    const safeImg = _esc(itemImage);
    return `
    <div class="flex gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
      <img src="${safeImg}" alt="${safeName}" class="w-16 h-16 object-contain rounded-lg border border-gray-200" onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='images/15-256.avif';}">
      <div class="flex-1">
        <h4 class="font-semibold text-sm text-gray-900 line-clamp-2 mb-1">${safeName}</h4>
        ${itemColor ? `<p class="text-xs text-gray-600">Màu: ${safeColor}</p>` : ''}
        ${item.storage ? `<p class="text-xs text-gray-600">Dung lượng: ${safeStorage}</p>` : ''}
        <div class="flex items-center justify-between mt-2">
          <span class="text-xs text-gray-600">SL: ${Number(item.quantity) || 0}</span>
          <span class="font-bold text-red-600 text-sm">${formatPrice(item.price * item.quantity)}</span>
        </div>
      </div>
    </div>
  `;}).join('');
}

// ===== CALCULATE TOTAL =====
function calculateTotal() {
  subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Tính lại giảm giá nếu có voucher đã áp dụng
  if (appliedDiscountVoucher) {
    if (appliedDiscountVoucher.discountType === 'percent') {
      percentDiscount = Math.round(subtotal * appliedDiscountVoucher.discountValue / 100);
    } else {
      percentDiscount = appliedDiscountVoucher.discountValue;
    }
  }
  
  // Tính freeship discount
  if (appliedFreeshipVoucher) {
    freeshipDiscount = Math.min(appliedFreeshipVoucher.discountValue, shippingFee);
  }
  
  // Tổng giảm giá
  discount = freeshipDiscount + percentDiscount;
  
  // Update UI
  document.getElementById('subtotal').textContent = formatPrice(subtotal);
  
  // Hiển thị phí ship (đã trừ freeship nếu có)
  const actualShippingFee = shippingFee - freeshipDiscount;
  if (actualShippingFee <= 0) {
    document.getElementById('shippingFee').textContent = 'Miễn phí';
    document.getElementById('shippingFee').classList.add('text-green-600');
  } else {
    document.getElementById('shippingFee').textContent = formatPrice(actualShippingFee);
    document.getElementById('shippingFee').classList.remove('text-green-600');
  }
  
  // Hiển thị giảm giá (chỉ hiện phần giảm giá sản phẩm, không tính freeship)
  if (percentDiscount > 0) {
    document.getElementById('discountRow').classList.remove('hidden');
    document.getElementById('discount').textContent = '-' + formatPrice(percentDiscount);
  } else {
    document.getElementById('discountRow').classList.add('hidden');
  }
  
  const total = Math.max(0, subtotal + shippingFee - discount);
  document.getElementById('total').textContent = formatPrice(total);
  
  // Cập nhật badge nếu có
  if (appliedFreeshipVoucher) {
    document.getElementById('appliedFreeshipCode').textContent = 
      `${appliedFreeshipVoucher.code} (-${formatPrice(freeshipDiscount)} ship)`;
  }
  if (appliedDiscountVoucher) {
    document.getElementById('appliedDiscountCode').textContent = 
      `${appliedDiscountVoucher.code} (-${formatPrice(percentDiscount)})`;
  }
}

// ===== SHIPPING METHOD SELECTION =====
function selectShipping(element, method) {
  // Remove selected class from all
  document.querySelectorAll('.shipping-method').forEach(el => {
    el.classList.remove('selected');
  });
  
  // Add selected class to clicked element
  element.classList.add('selected');
  
  // Update radio button
  element.querySelector('input[type="radio"]').checked = true;
  
  // Update shipping fee
  selectedShipping = method;
  if (method === 'express') {
    shippingFee = 30000;
  } else if (method === 'pickup') {
    shippingFee = 0;
  } else {
    shippingFee = 0;
  }
  
  // Hiển thị thông báo đặt cọc 50% nếu chọn pickup và có từ 3 sản phẩm trở lên
  updatePickupDepositNotice();
  
  calculateTotal();
}

// Cập nhật thông báo đặt cọc khi mua số lượng lớn hoặc tổng tiền cao
function updatePickupDepositNotice() {
  const notice = document.getElementById('pickupDepositNotice');
  if (!notice) return;
  
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const currentTotal = subtotal + shippingFee - discount;
  
  // Ngưỡng yêu cầu đặt cọc
  const DEPOSIT_THRESHOLD_QUANTITY = 3;
  const DEPOSIT_THRESHOLD_AMOUNT = 20000000; // 20 triệu
  
  // Kiểm tra điều kiện đặt cọc
  const requiresDeposit = (totalItems >= DEPOSIT_THRESHOLD_QUANTITY || currentTotal >= DEPOSIT_THRESHOLD_AMOUNT);
  
  if (requiresDeposit) {
    notice.classList.remove('hidden');
    
    // Xác định lý do
    let reason = '';
    if (totalItems >= DEPOSIT_THRESHOLD_QUANTITY && currentTotal >= DEPOSIT_THRESHOLD_AMOUNT) {
      reason = `Đơn hàng có ${totalItems} sản phẩm và tổng tiền ${formatPrice(currentTotal)}`;
    } else if (totalItems >= DEPOSIT_THRESHOLD_QUANTITY) {
      reason = `Đơn hàng có ${totalItems} sản phẩm (từ ${DEPOSIT_THRESHOLD_QUANTITY} sản phẩm trở lên)`;
    } else {
      reason = `Tổng tiền ${formatPrice(currentTotal)} (từ ${formatPrice(DEPOSIT_THRESHOLD_AMOUNT)} trở lên)`;
    }
    
    const depositAmount = Math.ceil(currentTotal / 2);
    
    notice.innerHTML = `
      <div class="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <i class="fas fa-exclamation-triangle text-yellow-600 mt-0.5"></i>
        <div class="text-sm">
          <p class="font-semibold text-yellow-800">⚠️ Yêu cầu đặt cọc 50%</p>
          <p class="text-yellow-700 mb-1">${reason}</p>
          <p class="text-yellow-700">Cần đặt cọc <strong class="text-red-600">${formatPrice(depositAmount)}</strong> qua chuyển khoản trước khi xử lý.</p>
          <p class="text-xs text-yellow-600 mt-1">💰 Còn lại ${formatPrice(currentTotal - depositAmount)} sẽ thanh toán khi nhận hàng.</p>
        </div>
      </div>
    `;
  } else {
    notice.classList.add('hidden');
  }
}

// ===== PAYMENT METHOD SELECTION =====
function selectPayment(element, method) {
  // Remove selected class from all
  document.querySelectorAll('.payment-method').forEach(el => {
    el.classList.remove('selected');
  });
  
  // Add selected class to clicked element
  element.classList.add('selected');
  
  // Update radio button
  const radio = element.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
  
  selectedPayment = method;
}

// ===== TOGGLE MOMO OPTIONS =====
function toggleMoMoOptions() {
  const options = document.getElementById('momoOptions');
  const arrow = document.getElementById('momoArrow');
  
  if (options.classList.contains('hidden')) {
    options.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    options.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
  }
}

// ===== GET SELECTED PAYMENT METHOD =====
function getSelectedPayment() {
  const selected = document.querySelector('input[name="payment"]:checked');
  return selected ? selected.value : 'cod';
}

// ===== GET MOMO PAYMENT TYPE =====
function getMoMoPaymentType(paymentMethod) {
  const typeMap = {
    'momo_qr': 'qr',
    'momo_wallet': 'wallet',
    'momo_atm': 'atm',
    'momo_credit': 'credit',
    'momo': 'qr' // default
  };
  return typeMap[paymentMethod] || 'qr';
}

// ===== VOUCHER SYSTEM - NEW LOGIC =====

// Toggle hiển thị tất cả voucher
function toggleAllVouchers() {
  const section = document.getElementById('allVouchersSection');
  const toggleText = document.getElementById('voucherToggleText');
  
  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    toggleText.textContent = 'Ẩn bớt';
    loadAllVouchers();
  } else {
    section.classList.add('hidden');
    toggleText.textContent = 'Xem tất cả mã';
  }
}

// Load tất cả voucher từ API
async function loadAllVouchers() {
  const loadingEl = document.getElementById('vouchersLoading');
  const listEl = document.getElementById('allVouchersList');
  const emptyEl = document.getElementById('vouchersEmpty');
  
  loadingEl.classList.remove('hidden');
  listEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    
    // Load voucher có sẵn từ hệ thống
    const availableRes = await fetch(`${API_URL}/promotions/vouchers/available`);
    const availableData = await availableRes.json();
    
    if (availableData.success) {
      allAvailableVouchers = availableData.data || [];
    }
    
    // Load voucher đã lưu của user (nếu đã đăng nhập)
    if (user && user.ma_kh) {
      const savedRes = await fetch(`${API_URL}/promotions/user/${user.ma_kh}/saved-vouchers`);
      const savedData = await savedRes.json();
      
      if (savedData.success) {
        userSavedVouchers = savedData.data || [];
      }
    }
    
    // Cũng load từ localStorage
    const localSaved = JSON.parse(localStorage.getItem('savedVouchers') || '[]');
    
    // Merge voucher đã lưu từ localStorage vào userSavedVouchers
    localSaved.forEach(lv => {
      if (!userSavedVouchers.find(uv => uv.code === lv.code)) {
        userSavedVouchers.push(lv);
      }
    });
    
    loadingEl.classList.add('hidden');
    
    if (allAvailableVouchers.length === 0 && userSavedVouchers.length === 0) {
      emptyEl.classList.remove('hidden');
    } else {
      listEl.classList.remove('hidden');
      renderVouchersList();
    }
  } catch (error) {
    console.error('Error loading vouchers:', error);
    loadingEl.classList.add('hidden');
    
    // Fallback: dùng voucher demo
    allAvailableVouchers = getDemoVouchers();
    listEl.classList.remove('hidden');
    renderVouchersList();
  }
}

// Voucher demo khi không có API
function getDemoVouchers() {
  return [
    { id: 1, code: 'FREESHIP', type: 'freeship', discountType: 'fixed', discountValue: 30000, description: 'Miễn phí vận chuyển', minOrder: 0 },
    { id: 2, code: 'FREESHIP50', type: 'freeship', discountType: 'fixed', discountValue: 50000, description: 'Giảm 50K phí ship', minOrder: 500000 },
    { id: 3, code: 'GIAM10', type: 'discount', discountType: 'percent', discountValue: 10, description: 'Giảm 10% đơn hàng', minOrder: 1000000 },
    { id: 4, code: 'GIAM15', type: 'discount', discountType: 'percent', discountValue: 15, description: 'Giảm 15% đơn hàng', minOrder: 2000000 },
    { id: 5, code: 'GIAM20', type: 'discount', discountType: 'percent', discountValue: 20, description: 'Giảm 20% đơn hàng', minOrder: 5000000 },
    { id: 6, code: 'GIAM50K', type: 'discount', discountType: 'fixed', discountValue: 50000, description: 'Giảm 50.000đ', minOrder: 500000 },
    { id: 7, code: 'GIAM100K', type: 'discount', discountType: 'fixed', discountValue: 100000, description: 'Giảm 100.000đ', minOrder: 1000000 },
    { id: 8, code: 'GIAM500K', type: 'discount', discountType: 'fixed', discountValue: 500000, description: 'Giảm 500.000đ', minOrder: 5000000 },
    { id: 9, code: 'PHONE10', type: 'phone', discountType: 'percent', discountValue: 10, description: 'Giảm 10% cho điện thoại (cần lưu mã)', minOrder: 0, requireSaved: true },
    { id: 10, code: 'PHONE200K', type: 'phone', discountType: 'fixed', discountValue: 200000, description: 'Giảm 200K cho điện thoại (cần lưu mã)', minOrder: 3000000, requireSaved: true }
  ];
}

// Phân loại voucher
function getVoucherCategory(voucher) {
  const code = voucher.code?.toUpperCase() || '';
  const type = voucher.type?.toLowerCase() || '';
  
  if (type === 'freeship' || code.includes('FREESHIP') || code.includes('SHIP')) {
    return 'freeship';
  }
  if (type === 'phone' || code.includes('PHONE') || code.includes('DT')) {
    return 'phone';
  }
  return 'discount';
}

// Filter voucher theo loại
function filterVouchersByType(type) {
  currentVoucherFilter = type;
  
  // Update tab active
  document.querySelectorAll('.voucher-tab').forEach(tab => {
    if (tab.dataset.type === type) {
      tab.classList.remove('bg-gray-200', 'text-gray-700');
      tab.classList.add('bg-red-600', 'text-white');
    } else {
      tab.classList.remove('bg-red-600', 'text-white');
      tab.classList.add('bg-gray-200', 'text-gray-700');
    }
  });
  
  renderVouchersList();
}

// Đếm số mã đã lưu
function getSavedVouchersCount() {
  return userSavedVouchers.length;
}

// Cập nhật badge số mã đã lưu trên tab
function updateSavedVouchersBadge() {
  const savedTab = document.querySelector('.voucher-tab[data-type="saved"]');
  if (savedTab) {
    const count = getSavedVouchersCount();
    if (count > 0) {
      savedTab.innerHTML = `<i class="fas fa-bookmark mr-1 text-yellow-500"></i>Đã lưu (${count})`;
    } else {
      savedTab.innerHTML = `<i class="fas fa-bookmark mr-1 text-yellow-500"></i>Đã lưu`;
    }
  }
}

// Render danh sách voucher
function renderVouchersList() {
  const container = document.getElementById('allVouchersList');
  const emptyEl = document.getElementById('vouchersEmpty');
  if (!container) return;
  
  // Gộp tất cả voucher
  let allVouchers = [...allAvailableVouchers];
  
  // Thêm voucher đã lưu (nếu chưa có trong danh sách)
  userSavedVouchers.forEach(sv => {
    if (!allVouchers.find(v => v.code === sv.code)) {
      sv.isSaved = true;
      allVouchers.push(sv);
    } else {
      // Đánh dấu voucher đã lưu
      const existing = allVouchers.find(v => v.code === sv.code);
      if (existing) existing.isSaved = true;
    }
  });
  
  // Filter theo loại
  let filteredVouchers = allVouchers;
  if (currentVoucherFilter === 'saved') {
    // Chỉ hiện mã đã lưu
    filteredVouchers = allVouchers.filter(v => v.isSaved || userSavedVouchers.some(sv => sv.code === v.code));
  } else if (currentVoucherFilter !== 'all') {
    filteredVouchers = allVouchers.filter(v => getVoucherCategory(v) === currentVoucherFilter);
  }
  
  // Cập nhật badge số mã đã lưu trên tab
  updateSavedVouchersBadge();
  
  if (filteredVouchers.length === 0) {
    container.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    
    let emptyMessage = 'Không có mã khuyến mãi nào';
    if (currentVoucherFilter === 'saved') {
      emptyMessage = 'Bạn chưa lưu mã nào. Nhấn "Lưu để dùng" để lưu mã!';
    } else if (currentVoucherFilter === 'freeship') {
      emptyMessage = 'Không có mã freeship nào';
    } else if (currentVoucherFilter === 'discount') {
      emptyMessage = 'Không có mã giảm giá nào';
    }
    
    emptyEl.innerHTML = `
      <i class="fas fa-${currentVoucherFilter === 'saved' ? 'bookmark' : 'inbox'} text-2xl mb-2 block opacity-50"></i>
      <p>${emptyMessage}</p>
    `;
    return;
  }
  
  container.classList.remove('hidden');
  emptyEl.classList.add('hidden');
  
  container.innerHTML = filteredVouchers.map(voucher => {
    const category = getVoucherCategory(voucher);
    const isFreeship = category === 'freeship';
    const isPhone = category === 'phone';
    const isSaved = voucher.isSaved || userSavedVouchers.some(sv => sv.code === voucher.code);
    
    // Kiểm tra điều kiện áp dụng
    const minOrder = voucher.minOrder || 0;
    const canApply = subtotal >= minOrder;
    
    // Kiểm tra mã điện thoại phải được lưu
    const requireSaved = isPhone || voucher.requireSaved;
    const canUsePhoneVoucher = !requireSaved || isSaved;
    
    // Kiểm tra đã áp dụng chưa
    const isAppliedFreeship = appliedFreeshipVoucher?.code === voucher.code;
    const isAppliedDiscount = appliedDiscountVoucher?.code === voucher.code;
    const isApplied = isAppliedFreeship || isAppliedDiscount;
    
    // Tính giá trị giảm
    let discountText = '';
    if (voucher.discountType === 'percent') {
      discountText = `Giảm ${voucher.discountValue}%`;
    } else {
      discountText = `Giảm ${formatPrice(voucher.discountValue)}`;
    }
    
    // Icon và màu theo loại
    let iconClass = 'fa-percent';
    let bgColor = 'bg-green-100';
    let iconColor = 'text-green-600';
    let borderColor = 'border-green-200';
    
    if (isFreeship) {
      iconClass = 'fa-shipping-fast';
      bgColor = 'bg-blue-100';
      iconColor = 'text-blue-600';
      borderColor = 'border-blue-200';
    } else if (isPhone) {
      iconClass = 'fa-mobile-alt';
      bgColor = 'bg-purple-100';
      iconColor = 'text-purple-600';
      borderColor = 'border-purple-200';
    }
    
    // Trạng thái button
    let buttonHtml = '';
    
    // Kiểm tra xem có mã cùng loại đã được áp dụng chưa (để hiện nút "Thay đổi")
    const hasSameTypeApplied = isFreeship ? appliedFreeshipVoucher : appliedDiscountVoucher;
    const canSwitch = hasSameTypeApplied && !isApplied && canApply && canUsePhoneVoucher;
    
    if (isApplied) {
      buttonHtml = `<span class="text-xs text-green-600 font-semibold"><i class="fas fa-check mr-1"></i>Đang dùng</span>`;
    } else if (!canApply) {
      buttonHtml = `<span class="text-xs text-gray-400">Đơn từ ${formatPrice(minOrder)}</span>`;
    } else if (!canUsePhoneVoucher) {
      buttonHtml = `
        <button onclick="saveVoucherToUse('${voucher.code}', ${JSON.stringify(voucher).replace(/"/g, '&quot;')})" 
                class="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-full transition">
          <i class="fas fa-bookmark mr-1"></i>Lưu để dùng
        </button>
      `;
    } else if (canSwitch) {
      // Có mã cùng loại đã áp dụng -> hiện nút "Đổi mã"
      buttonHtml = `
        <button onclick="applyVoucherFromList('${voucher.code}', '${category}')" 
                class="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded-full transition">
          <i class="fas fa-exchange-alt mr-1"></i>Đổi mã
        </button>
      `;
    } else {
      buttonHtml = `
        <button onclick="applyVoucherFromList('${voucher.code}', '${category}')" 
                class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-full transition">
          Áp dụng
        </button>
      `;
    }
    
    return `
      <div class="flex items-center gap-2 p-2 bg-white border ${isApplied ? 'border-green-400 bg-green-50' : borderColor} rounded-lg transition ${canApply && canUsePhoneVoucher && !isApplied ? 'hover:shadow-md' : 'opacity-75'}">
        <div class="w-10 h-10 ${bgColor} rounded flex items-center justify-center flex-shrink-0">
          <i class="fas ${iconClass} ${iconColor} text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1">
            <p class="font-bold text-gray-800 text-xs">${voucher.code}</p>
            ${isSaved ? '<i class="fas fa-bookmark text-yellow-500 text-xs" title="Đã lưu"></i>' : ''}
            ${isPhone ? '<span class="text-xs bg-purple-100 text-purple-600 px-1 rounded">Điện thoại</span>' : ''}
          </div>
          <p class="text-xs text-gray-600">${discountText}</p>
          <p class="text-xs text-gray-400 truncate">${voucher.description || ''}</p>
        </div>
        <div class="flex-shrink-0">
          ${buttonHtml}
        </div>
      </div>
    `;
  }).join('');
}

// Lưu voucher để sử dụng (cho mã điện thoại)
function saveVoucherToUse(code, voucherData) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  
  // Lưu vào localStorage
  let savedVouchers = JSON.parse(localStorage.getItem('savedVouchers') || '[]');
  if (!savedVouchers.find(v => v.code === code)) {
    savedVouchers.push({
      code: code,
      ...voucherData,
      savedAt: new Date().toISOString()
    });
    localStorage.setItem('savedVouchers', JSON.stringify(savedVouchers));
  }
  
  // Cập nhật userSavedVouchers
  if (!userSavedVouchers.find(v => v.code === code)) {
    userSavedVouchers.push({ code, ...voucherData, isSaved: true });
  }
  
  // Nếu đã đăng nhập, lưu vào database
  if (user && user.ma_kh && voucherData.id) {
    fetch(`${API_URL}/promotions/vouchers/${voucherData.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.ma_kh })
    }).catch(err => console.log('Save voucher to DB error:', err));
  }
  
  showToast(`Đã lưu mã ${code}! Bây giờ bạn có thể áp dụng.`, 'success');
  renderVouchersList();
}

// Áp dụng voucher từ danh sách
function applyVoucherFromList(code, category) {
  const voucher = allAvailableVouchers.find(v => v.code === code) || 
                  userSavedVouchers.find(v => v.code === code) ||
                  getDemoVouchers().find(v => v.code === code);
  
  if (!voucher) {
    showToast('Không tìm thấy mã khuyến mãi!', 'error');
    return;
  }
  
  // Kiểm tra điều kiện tối thiểu
  if (voucher.minOrder && subtotal < voucher.minOrder) {
    showToast(`Đơn hàng cần tối thiểu ${formatPrice(voucher.minOrder)} để áp dụng mã này!`, 'error');
    return;
  }
  
  // Kiểm tra mã điện thoại phải được lưu
  const isPhone = category === 'phone' || voucher.requireSaved;
  const isSaved = userSavedVouchers.some(sv => sv.code === code);
  
  if (isPhone && !isSaved) {
    showToast('Mã này cần được lưu trước khi sử dụng!', 'error');
    return;
  }
  
  // Áp dụng theo loại - TỰ ĐỘNG THAY THẾ MÃ CŨ
  if (category === 'freeship') {
    const oldCode = appliedFreeshipVoucher?.code;
    
    // Tự động thay thế mã freeship cũ
    appliedFreeshipVoucher = voucher;
    freeshipDiscount = Math.min(voucher.discountValue, shippingFee);
    
    // Hiển thị badge
    document.getElementById('appliedFreeshipBadge').classList.remove('hidden');
    document.getElementById('appliedFreeshipCode').textContent = `${code} (-${formatPrice(freeshipDiscount)} ship)`;
    
    if (oldCode && oldCode !== code) {
      showToast(`Đã thay mã ${oldCode} bằng ${code}! Giảm ${formatPrice(freeshipDiscount)} phí ship`, 'success');
    } else {
      showToast(`Áp dụng mã freeship thành công! Giảm ${formatPrice(freeshipDiscount)} phí ship`, 'success');
    }
  } else {
    // Mã giảm giá (percent/fixed/phone)
    const oldCode = appliedDiscountVoucher?.code;
    
    // Tự động thay thế mã giảm giá cũ
    appliedDiscountVoucher = voucher;
    
    if (voucher.discountType === 'percent') {
      percentDiscount = Math.round(subtotal * voucher.discountValue / 100);
    } else {
      percentDiscount = voucher.discountValue;
    }
    
    // Hiển thị badge
    document.getElementById('appliedDiscountBadge').classList.remove('hidden');
    document.getElementById('appliedDiscountCode').textContent = `${code} (-${formatPrice(percentDiscount)})`;
    
    if (oldCode && oldCode !== code) {
      showToast(`Đã thay mã ${oldCode} bằng ${code}! Giảm ${formatPrice(percentDiscount)}`, 'success');
    } else {
      showToast(`Áp dụng mã giảm giá thành công! Giảm ${formatPrice(percentDiscount)}`, 'success');
    }
  }
  
  // Tính lại tổng
  discount = freeshipDiscount + percentDiscount;
  calculateTotal();
  renderVouchersList();
}

// Xóa voucher đã áp dụng
function removeAppliedVoucher(type) {
  console.log('removeAppliedVoucher called with type:', type);
  
  try {
    if (type === 'freeship') {
      const removedCode = appliedFreeshipVoucher?.code;
      appliedFreeshipVoucher = null;
      freeshipDiscount = 0;
      
      const badge = document.getElementById('appliedFreeshipBadge');
      if (badge) badge.classList.add('hidden');
      
      showToast(`Đã xóa mã ${removedCode || 'freeship'}`, 'info');
    } else {
      const removedCode = appliedDiscountVoucher?.code;
      appliedDiscountVoucher = null;
      percentDiscount = 0;
      
      const badge = document.getElementById('appliedDiscountBadge');
      if (badge) badge.classList.add('hidden');
      
      showToast(`Đã xóa mã ${removedCode || 'giảm giá'}`, 'info');
    }
    
    // Tính lại tổng giảm giá
    discount = freeshipDiscount + percentDiscount;
    
    // Tính lại tổng tiền
    calculateTotal();
    
    // Cập nhật lại danh sách voucher nếu đang mở
    const section = document.getElementById('allVouchersSection');
    if (section && !section.classList.contains('hidden')) {
      renderVouchersList();
    }
    
    console.log('Voucher removed successfully. Current state:', {
      appliedFreeshipVoucher,
      appliedDiscountVoucher,
      freeshipDiscount,
      percentDiscount,
      discount
    });
  } catch (error) {
    console.error('Error removing voucher:', error);
    showToast('Có lỗi khi xóa mã!', 'error');
  }
}

// Hiển thị danh sách voucher để đổi mã
function showChangeVoucherOptions(type) {
  // Mở section voucher nếu đang đóng
  const section = document.getElementById('allVouchersSection');
  const toggleText = document.getElementById('voucherToggleText');
  
  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    toggleText.textContent = 'Ẩn bớt';
    loadAllVouchers().then(() => {
      // Filter theo loại voucher cần đổi
      filterVouchersByType(type);
      showToast(`Chọn mã ${type === 'freeship' ? 'freeship' : 'giảm giá'} mới để thay thế`, 'info');
    });
  } else {
    // Đã mở rồi, chỉ cần filter
    filterVouchersByType(type);
    showToast(`Chọn mã ${type === 'freeship' ? 'freeship' : 'giảm giá'} mới để thay thế`, 'info');
  }
  
  // Scroll đến phần voucher
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Áp dụng mã nhập thủ công
function applyManualVoucher() {
  const code = document.getElementById('voucherCode').value.trim().toUpperCase();
  
  if (!code) {
    showToast('Vui lòng nhập mã khuyến mãi!', 'error');
    return;
  }
  
  // Tìm voucher trong danh sách
  let voucher = allAvailableVouchers.find(v => v.code === code) || 
                userSavedVouchers.find(v => v.code === code) ||
                getDemoVouchers().find(v => v.code === code);
  
  if (!voucher) {
    showToast('Mã khuyến mãi không hợp lệ!', 'error');
    return;
  }
  
  const category = getVoucherCategory(voucher);
  applyVoucherFromList(code, category);
  
  // Clear input
  document.getElementById('voucherCode').value = '';
}

// Legacy function - giữ lại để tương thích
function applyVoucher() {
  applyManualVoucher();
}

// ===== VALIDATE FORM =====
function validateForm() {
  const directForm = document.getElementById('direct-address-form');
  const isDirectMode = directForm && !directForm.classList.contains('hidden');
  
  if (isDirectMode) {
    const dFullName = document.getElementById('direct-fullName').value.trim();
    const dPhone = document.getElementById('direct-phone').value.trim();
    const dProvinceSelect = document.getElementById('direct-province');
    const dDistrictSelect = document.getElementById('direct-district');
    const dWardSelect = document.getElementById('direct-ward');
    const dAddress = document.getElementById('direct-address').value.trim();
    
    if (!dFullName || !dPhone || dProvinceSelect.value === "" || dDistrictSelect.value === "" || dWardSelect.value === "" || !dAddress) {
      showToast('Vui lòng điền đầy đủ thông tin địa chỉ nhận hàng trực tiếp!', 'error');
      return false;
    }
    
    const phoneRegex = /^(0|\+84)[0-9]{9}$/;
    if (!phoneRegex.test(dPhone.replace(/\s/g, ''))) {
      showToast('Số điện thoại không hợp lệ!', 'error');
      return false;
    }
    
    // Copy to hidden inputs
    document.getElementById('fullName').value = dFullName;
    document.getElementById('phone').value = dPhone;
    document.getElementById('province').value = dProvinceSelect.value;
    document.getElementById('district').value = dDistrictSelect.value;
    document.getElementById('ward').value = dWardSelect.value;
    document.getElementById('address').value = dAddress;
    
    // Set text elements so fullAddress logic works
    let provTextEl = document.getElementById('province-text');
    if (!provTextEl) {
      provTextEl = document.createElement('span');
      provTextEl.id = 'province-text';
      provTextEl.style.display = 'none';
      document.body.appendChild(provTextEl);
    }
    provTextEl.textContent = dProvinceSelect.options[dProvinceSelect.selectedIndex].text;
    
    let distTextEl = document.getElementById('district-text');
    if (!distTextEl) {
      distTextEl = document.createElement('span');
      distTextEl.id = 'district-text';
      distTextEl.style.display = 'none';
      document.body.appendChild(distTextEl);
    }
    distTextEl.textContent = dDistrictSelect.options[dDistrictSelect.selectedIndex].text;
    
    let wardTextEl = document.getElementById('ward-text');
    if (!wardTextEl) {
      wardTextEl = document.createElement('span');
      wardTextEl.id = 'ward-text';
      wardTextEl.style.display = 'none';
      document.body.appendChild(wardTextEl);
    }
    wardTextEl.textContent = dWardSelect.options[dWardSelect.selectedIndex].text;
    
    // Optionally: if the checkbox is checked, save this address to user profile
    const saveCheckbox = document.getElementById('direct-save-checkbox');
    if (saveCheckbox && saveCheckbox.checked) {
      saveDirectAddressToProfile(dFullName, dPhone, dProvinceSelect.options[dProvinceSelect.selectedIndex].text, dDistrictSelect.options[dDistrictSelect.selectedIndex].text, dWardSelect.options[dWardSelect.selectedIndex].text, dAddress);
    }
    
    return true;
  }

  const fullName = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const province = document.getElementById('province').value;
  const district = document.getElementById('district').value;
  const ward = document.getElementById('ward').value;
  const address = document.getElementById('address').value.trim();
  
  // Kiểm tra đã chọn địa chỉ chưa
  if (!fullName || !phone || !province || !district || !ward || !address) {
    showToast('Vui lòng chọn địa chỉ nhận hàng!', 'error');
    showDirectAddressForm();
    return false;
  }
  
  // Validate phone number (Vietnamese format)
  const phoneRegex = /^(0|\+84)[0-9]{9}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    showToast('Số điện thoại không hợp lệ! Vui lòng chọn địa chỉ khác.', 'error');
    return false;
  }
  
  return true;
}

// ===== QR CODE PAYMENT VARIABLES =====
let qrCountdownInterval = null;
let qrTimeRemaining = 30 * 60; // 30 minutes in seconds
let currentOrderId = null;

// ===== PLACE ORDER =====
function placeOrder() {
  // Validate form
  // Chống duplicate submit — bấm 2 lần / tạo 2 đơn
  if (isPlacingOrder) {
    showToast('Đang xử lý đơn hàng, vui lòng đợi...', 'info');
    return;
  }
  isPlacingOrder = true;
  const submitBtn = document.querySelector('[data-place-order-btn], #placeOrderBtn, .btn-place-order, #place-order-btn');
  if (submitBtn) submitBtn.disabled = true;
  // Đảm bảo unlock khi xử lý xong / lỗi (timeout 30s phòng hờ)
  setTimeout(() => { isPlacingOrder = false; if (submitBtn) submitBtn.disabled = false; }, 30000);

  if (!validateForm()) {
    isPlacingOrder = false;
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  if (cart.length === 0) {
    showToast('Giỏ hàng trống! Vui lòng thêm sản phẩm.', 'error');
    isPlacingOrder = false;
    if (submitBtn) submitBtn.disabled = false;
    return;
  }
  
  // Generate order ID
  const orderId = 'DH' + Date.now();
  currentOrderId = orderId;
  
  // Tính tổng số lượng sản phẩm
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = subtotal + shippingFee - discount;
  
  // Collect order data
  const orderData = {
    customer: {
      fullName: document.getElementById('fullName').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim(),
    },
    address: {
      province: document.getElementById('province').value,
      district: document.getElementById('district').value,
      ward: document.getElementById('ward').value,
      detail: document.getElementById('address').value.trim(),
      note: document.getElementById('note').value.trim()
    },
    shipping: {
      method: selectedShipping,
      fee: shippingFee
    },
    payment: {
      method: getSelectedPayment()
    },
    items: cart,
    pricing: {
      subtotal: subtotal,
      shippingFee: shippingFee,
      discount: discount,
      total: total
    },
    orderDate: new Date().toISOString(),
    orderId: orderId,
    status: 'pending' // Tất cả đơn hàng mới đều ở trạng thái "Chờ xử lý", chờ admin xác nhận
  };
  
  const paymentMethod = getSelectedPayment();
  
  // ===== LOGIC ĐẶT CỌC 50% CHO ĐƠN HÀNG LỚN =====
  // Điều kiện yêu cầu đặt cọc:
  // 1. Số lượng sản phẩm >= 3
  // 2. Hoặc tổng tiền >= 20,000,000đ
  const DEPOSIT_THRESHOLD_QUANTITY = 3;
  const DEPOSIT_THRESHOLD_AMOUNT = 20000000; // 20 triệu
  
  const requiresDeposit = (totalItems >= DEPOSIT_THRESHOLD_QUANTITY || total >= DEPOSIT_THRESHOLD_AMOUNT);
  
  // Chỉ yêu cầu đặt cọc khi chọn COD (thanh toán khi nhận hàng)
  if (requiresDeposit && paymentMethod === 'cod') {
    // Xác định lý do yêu cầu đặt cọc để hiển thị
    let depositReason = '';
    if (totalItems >= DEPOSIT_THRESHOLD_QUANTITY && total >= DEPOSIT_THRESHOLD_AMOUNT) {
      depositReason = `Đơn hàng có ${totalItems} sản phẩm và tổng tiền ${formatPrice(total)}`;
    } else if (totalItems >= DEPOSIT_THRESHOLD_QUANTITY) {
      depositReason = `Đơn hàng có ${totalItems} sản phẩm (từ ${DEPOSIT_THRESHOLD_QUANTITY} sản phẩm trở lên)`;
    } else {
      depositReason = `Tổng tiền ${formatPrice(total)} (từ ${formatPrice(DEPOSIT_THRESHOLD_AMOUNT)} trở lên)`;
    }
    orderData.depositReason = depositReason;
    
    showBankDepositModal(orderData);
    return;
  }
  
  // Check if payment method is MoMo (any type)
  if (paymentMethod.startsWith('momo')) {
    const momoType = getMoMoPaymentType(paymentMethod);
    showMoMoPaymentModal(orderData, momoType);
    return;
  }
  
  // For COD with small orders, proceed directly
  completeOrder(orderData);
}

// ===== BANK DEPOSIT MODAL (50% đặt cọc) =====
function showBankDepositModal(orderData) {
  const modal = document.getElementById('bankDepositModal');
  const total = orderData.pricing.total;
  const depositAmount = Math.ceil(total / 2); // 50% làm tròn lên
  const remainingAmount = total - depositAmount; // 50% còn lại
  
  // Cập nhật thông tin
  document.getElementById('bankOrderId').textContent = orderData.orderId;
  document.getElementById('bankDepositAmount').textContent = formatPrice(depositAmount);
  document.getElementById('bankTransferContent').textContent = `DATCOC ${orderData.orderId}`;
  
  // Hiển thị lý do yêu cầu đặt cọc (nếu có)
  const reasonEl = document.getElementById('depositReasonText');
  if (reasonEl && orderData.depositReason) {
    reasonEl.textContent = orderData.depositReason;
    reasonEl.parentElement.classList.remove('hidden');
  }
  
  // Hiển thị số tiền còn lại phải trả
  const remainingEl = document.getElementById('bankRemainingAmount');
  if (remainingEl) {
    remainingEl.textContent = formatPrice(remainingAmount);
  }
  
  // Cập nhật QR code với số tiền và nội dung chuyển khoản
  const qrImage = document.getElementById('bankQRImage');
  const transferContent = encodeURIComponent(`DATCOC ${orderData.orderId}`);
  qrImage.src = `https://img.vietqr.io/image/agribank-8888355745120-compact2.png?amount=${depositAmount}&addInfo=${transferContent}&accountName=HO%20QUANG%20VINH`;
  
  // Lưu order data để xử lý sau
  orderData.depositAmount = depositAmount;
  orderData.remainingAmount = remainingAmount;
  orderData.depositRequired = true;
  orderData.depositStatus = 'pending'; // pending, confirmed
  orderData.isDeposit = true; // Đánh dấu là đơn đặt cọc
  localStorage.setItem('pendingDepositOrder', JSON.stringify(orderData));
  
  // Hiển thị modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeBankDepositModal() {
  const modal = document.getElementById('bankDepositModal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function copyBankNumber() {
  navigator.clipboard.writeText('8888355745120').then(() => {
    showToast('Đã sao chép số tài khoản!', 'success');
  }).catch(() => {
    showToast('Không thể sao chép, vui lòng copy thủ công', 'error');
  });
}

function copyTransferContent() {
  const content = document.getElementById('bankTransferContent').textContent;
  navigator.clipboard.writeText(content).then(() => {
    showToast('Đã sao chép nội dung chuyển khoản!', 'success');
  }).catch(() => {
    showToast('Không thể sao chép, vui lòng copy thủ công', 'error');
  });
}

async function confirmBankDeposit() {
  const pendingOrder = JSON.parse(localStorage.getItem('pendingDepositOrder') || 'null');
  
  if (!pendingOrder) {
    showToast('Không tìm thấy thông tin đơn hàng!', 'error');
    return;
  }
  
  // Vì đây là thanh toán ảo (demo), lập tức ghi nhận đặt cọc thành công
  pendingOrder.depositStatus = 'paid'; // Đã thanh toán đặt cọc
  pendingOrder.status = 'pending'; // Đơn hàng chờ xử lý (đã cọc)
  pendingOrder.payment.method = 'bank_deposit'; // Phương thức thanh toán: đặt cọc ngân hàng
  pendingOrder.depositPaid = true; // Đánh dấu đã thanh toán cọc
  pendingOrder.depositPaidAt = new Date().toISOString(); // Thời gian thanh toán cọc
  
  // Đóng modal
  closeBankDepositModal();
  
  // Hiển thị thông báo thanh toán cọc thành công
  showToast(`Đặt cọc thành công! Số tiền: ${formatPrice(pendingOrder.depositAmount)}`, 'success');
  
  // Hoàn tất đơn hàng với trạng thái đã cọc
  completeOrder(pendingOrder);
  
  // Xóa pending order
  localStorage.removeItem('pendingDepositOrder');
}

// ===== MOMO PAYMENT VARIABLES =====
let currentMoMoPayUrl = null;
let currentMoMoDeeplink = null;
let momoCheckInterval = null;

// ===== DEMO MODE - Không cần API MoMo thật =====
const DEMO_MODE = true;

// ===== MOMO PAYMENT TYPE LABELS =====
const MOMO_TYPE_LABELS = {
  qr: { icon: 'fa-qrcode', name: 'Quét mã QR', desc: 'Quét mã bằng app MoMo' },
  wallet: { icon: 'fa-wallet', name: 'Ví MoMo', desc: 'Thanh toán từ ví MoMo' },
  atm: { icon: 'fa-credit-card', name: 'Thẻ ATM', desc: 'Thẻ ngân hàng nội địa' },
  credit: { icon: 'fa-cc-visa', name: 'Thẻ quốc tế', desc: 'Visa, Mastercard, JCB' }
};

// ===== SHOW MOMO PAYMENT MODAL (ĐA PHƯƠNG THỨC) =====
async function showMoMoPaymentModal(orderData, paymentType = 'qr') {
  const modal = document.getElementById('qrPaymentModal');
  const total = orderData.pricing.total;
  const typeInfo = MOMO_TYPE_LABELS[paymentType] || MOMO_TYPE_LABELS.qr;
  
  // Update modal info
  document.getElementById('qrOrderId').textContent = orderData.orderId;
  document.getElementById('qrAmount').textContent = formatPrice(total);
  document.getElementById('qrPaymentMethod').textContent = 'QUANG HUNG MOBILE';
  
  // Show loading state
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = `
    <div class="w-52 h-52 flex flex-col items-center justify-center">
      <i class="fas fa-spinner fa-spin text-4xl text-pink-600 mb-3"></i>
      <p class="text-sm text-gray-600">Đang tạo thanh toán ${typeInfo.name}...</p>
    </div>
  `;
  
  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  // Save pending order with payment type
  orderData.momoPaymentType = paymentType;
  localStorage.setItem('pendingOrder', JSON.stringify(orderData));
  
  // DEMO MODE: Tạo demo ngay lập tức
  if (DEMO_MODE) {
    setTimeout(() => {
      generateDemoPayment(orderData, paymentType);
      qrTimeRemaining = 5 * 60;
      startQRCountdown();
    }, 800);
    return;
  }
  
  // PRODUCTION MODE: Gọi API MoMo thật
  try {
    // 1. Tạo đơn hàng trong DB trước để lấy dbOrderId thực tế
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const provinceText = document.getElementById('province-text')?.textContent || '';
    const districtText = document.getElementById('district-text')?.textContent || '';
    const wardText = document.getElementById('ward-text')?.textContent || '';
    const fullAddress = `${orderData.address.detail}, ${wardText}, ${districtText}, ${provinceText}`;
    
    const freeshipVoucherData = appliedFreeshipVoucher ? {
      code: appliedFreeshipVoucher.code,
      id: appliedFreeshipVoucher.id,
      discountValue: freeshipDiscount,
      type: 'freeship'
    } : null;
    
    const discountVoucherData = appliedDiscountVoucher ? {
      code: appliedDiscountVoucher.code,
      id: appliedDiscountVoucher.id,
      discountValue: percentDiscount,
      type: appliedDiscountVoucher.discountType || 'fixed'
    } : null;

    const orderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: user?.ma_kh || null,
        customerName: orderData.customer.fullName,
        phone: orderData.customer.phone,
        address: fullAddress,
        items: orderData.items,
        subtotal: orderData.pricing.subtotal,
        shippingFee: orderData.pricing.shippingFee,
        discount: orderData.pricing.discount,
        total: orderData.pricing.total,
        paymentMethod: orderData.payment.method,
        freeshipVoucher: freeshipVoucherData,
        discountVoucher: discountVoucherData,
        voucherCode: discountVoucherData?.code || freeshipVoucherData?.code || null,
        isDeposit: false,
        depositAmount: 0,
        depositPercent: 0,
        remainingAmount: 0
      })
    });

    const orderResult = await orderRes.json();
    if (!orderRes.ok || !orderResult.success) {
      showQRError(orderResult.message || 'Lỗi tạo đơn hàng');
      return;
    }

    const dbOrderId = orderResult.data.orderId;
    orderData.dbOrderId = dbOrderId;
    localStorage.setItem('pendingOrder', JSON.stringify(orderData));

    // 2. Gọi API MoMo thật với dbOrderId dạng số
    const response = await fetch(`${API_URL}/payment/momo/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: dbOrderId,
        amount: total,
        paymentType: paymentType,
        orderInfo: `Thanh toán đơn hàng #${dbOrderId} - QuangHưng Mobile`,
        items: orderData.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }))
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      currentMoMoPayUrl = result.data.payUrl;
      currentMoMoDeeplink = result.data.deeplink;
      
      // Với QR thì generate QR, với các loại khác thì redirect
      if (paymentType === 'qr') {
        generateMoMoQR(result.data);
      } else {
        // Redirect đến trang thanh toán MoMo
        showRedirectPayment(result.data, paymentType);
      }
      
      qrTimeRemaining = 30 * 60;
      startQRCountdown();
      startMoMoStatusCheck(dbOrderId);
    } else {
      showQRError(result.message);
    }
  } catch (error) {
    console.error('MoMo Payment Error:', error);
    showQRError('Lỗi kết nối');
  }
}

// ===== GENERATE DEMO PAYMENT (ĐA PHƯƠNG THỨC) =====
function generateDemoPayment(orderData, paymentType) {
  const container = document.getElementById('qrCodeContainer');
  const wrapper = document.getElementById('qrCodeWrapper');
  const total = orderData.pricing.total;
  const typeInfo = MOMO_TYPE_LABELS[paymentType] || MOMO_TYPE_LABELS.qr;
  
  // Reset container và wrapper
  container.innerHTML = '';
  if (wrapper) {
    wrapper.className = 'flex justify-center w-full';
  }
  
  // Xóa các button cũ nếu có
  const oldBtns = document.querySelectorAll('.demo-btn-container');
  oldBtns?.forEach(btn => btn.remove());
  
  if (paymentType === 'qr') {
    // Generate QR Code
    container.className = 'bg-white p-3 rounded-xl border-2 border-pink-200 shadow-lg';
    if (typeof QRCode !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.className = 'rounded-lg';
      container.appendChild(canvas);
      
      const demoContent = `MOMO-DEMO|${orderData.orderId}|${total}|QuangHungMobile`;
      QRCode.toCanvas(canvas, demoContent, {
        width: 180,
        margin: 1,
        color: { dark: '#ae2070', light: '#ffffff' }
      });
    }
    addDemoButtons(container, paymentType);
  } else if (paymentType === 'wallet') {
    // Ví MoMo - hiển thị hướng dẫn
    container.className = 'w-44 h-44 flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl border-2 border-pink-200';
    container.innerHTML = `
      <i class="fas fa-wallet text-4xl text-pink-600 mb-3"></i>
      <p class="font-bold text-gray-800 text-sm">Ví MoMo</p>
      <p class="text-xs text-gray-600 text-center mt-1 px-2">Mở app MoMo để thanh toán</p>
    `;
    addDemoButtons(container, paymentType);
  } else {
    // ATM / Credit - hiển thị form nhập thẻ
    container.className = 'w-full max-w-xs bg-white p-4 rounded-xl border border-gray-200';
    showCardInputForm(container, paymentType, orderData);
  }
}

// ===== ADD DEMO BUTTONS =====
function addDemoButtons(container, paymentType) {
  const wrapper = document.getElementById('qrCodeWrapper');
  const parent = wrapper?.parentElement;
  
  if (!parent) return;
  
  // Thêm animation scan line cho QR
  if (paymentType === 'qr') {
    const scanLine = document.createElement('div');
    scanLine.className = 'qr-scan-line';
    scanLine.style.cssText = `
      position: absolute;
      top: 0;
      left: 10%;
      right: 10%;
      height: 3px;
      background: linear-gradient(90deg, transparent, #e91e63, transparent);
      animation: qrScan 2s ease-in-out infinite;
      border-radius: 2px;
      box-shadow: 0 0 10px #e91e63;
    `;
    container.style.position = 'relative';
    container.appendChild(scanLine);
    
    // Thêm style animation
    if (!document.getElementById('qrScanStyle')) {
      const style = document.createElement('style');
      style.id = 'qrScanStyle';
      style.textContent = `
        @keyframes qrScan {
          0%, 100% { top: 0; opacity: 1; }
          50% { top: calc(100% - 3px); opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  const btnContainer = document.createElement('div');
  btnContainer.className = 'demo-btn-container mt-3 flex flex-col items-center gap-2';
  btnContainer.innerHTML = `
    <p class="text-xs text-gray-500 text-center">
      <i class="fas fa-info-circle text-pink-500 mr-1"></i>
      Đây là chế độ Demo - Nhấn nút bên dưới để giả lập thanh toán
    </p>
    <button onclick="simulateScanQR()" class="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition flex items-center gap-2">
      <i class="fas fa-qrcode"></i> Quét QR (Demo)
    </button>
  `;
  parent.appendChild(btnContainer);
}

// ===== SIMULATE SCAN QR =====
function simulateScanQR() {
  const container = document.getElementById('qrCodeContainer');
  const btnContainer = document.querySelector('.demo-btn-container');
  
  // Hiển thị animation đang quét
  if (btnContainer) {
    btnContainer.innerHTML = `
      <div class="flex flex-col items-center gap-2">
        <div class="flex items-center gap-2 text-pink-600">
          <i class="fas fa-spinner fa-spin text-lg"></i>
          <span class="text-sm font-semibold">Đang quét mã QR...</span>
        </div>
        <div class="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-pink-500 to-pink-600 rounded-full animate-pulse" style="width: 0%; animation: scanProgress 2s ease-out forwards;"></div>
        </div>
      </div>
    `;
    
    // Thêm animation progress bar
    if (!document.getElementById('scanProgressStyle')) {
      const style = document.createElement('style');
      style.id = 'scanProgressStyle';
      style.textContent = `
        @keyframes scanProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Thêm hiệu ứng flash cho QR
  if (container) {
    container.style.transition = 'all 0.3s ease';
    container.style.boxShadow = '0 0 20px rgba(233, 30, 99, 0.5)';
    container.style.transform = 'scale(1.02)';
  }
  
  // Sau 2 giây, hiển thị kết quả quét thành công
  setTimeout(() => {
    if (btnContainer) {
      btnContainer.innerHTML = `
        <div class="flex flex-col items-center gap-2">
          <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-1">
            <i class="fas fa-check text-green-600 text-xl"></i>
          </div>
          <p class="text-sm font-semibold text-green-600">Quét mã thành công!</p>
          <p class="text-xs text-gray-500">Đang xử lý thanh toán...</p>
        </div>
      `;
    }
    
    if (container) {
      container.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.5)';
    }
    
    // Sau 1.5 giây nữa, xác nhận thanh toán
    setTimeout(() => {
      confirmDemoPayment();
    }, 1500);
  }, 2000);
}

// ===== SHOW CARD INPUT FORM =====
function showCardInputForm(container, paymentType, orderData) {
  const isCredit = paymentType === 'credit';
  const title = isCredit ? 'Thẻ quốc tế' : 'Thẻ ATM';
  const banks = isCredit 
    ? ['Visa', 'Master', 'JCB'] 
    : ['VCB', 'BIDV', 'TCB', 'VPB', 'MB', 'ACB'];
  
  container.innerHTML = `
    <div class="w-full">
      <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2 justify-center text-sm">
        <i class="fas ${isCredit ? 'fa-cc-visa text-blue-600' : 'fa-credit-card text-green-600'}"></i>
        ${title}
      </h4>
      
      <!-- Chọn ngân hàng/loại thẻ -->
      <div class="mb-3">
        <div class="grid grid-cols-3 gap-1.5">
          ${banks.map((bank, i) => `
            <button type="button" onclick="selectBank(this, '${bank}')" class="bank-option py-1.5 px-2 border ${i === 0 ? 'border-pink-500 bg-pink-50' : 'border-gray-200'} rounded text-xs font-medium hover:border-pink-400 transition">
              ${bank}
            </button>
          `).join('')}
        </div>
      </div>
      
      <!-- Số thẻ -->
      <div class="mb-2">
        <input type="text" id="cardNumber" placeholder="Số thẻ" 
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none"
          maxlength="19" oninput="formatCardNumber(this)">
      </div>
      
      <!-- Tên chủ thẻ -->
      <div class="mb-2">
        <input type="text" id="cardName" placeholder="Tên chủ thẻ" 
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:border-pink-500 focus:outline-none">
      </div>
      
      <!-- Ngày hết hạn & CVV -->
      <div class="grid grid-cols-2 gap-2 mb-3">
        <input type="text" id="cardExpiry" placeholder="MM/YY" 
          class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none"
          maxlength="5" oninput="formatExpiry(this)">
        <input type="text" id="cardCvv" placeholder="${isCredit ? 'CVV' : 'OTP'}" 
          class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none"
          maxlength="${isCredit ? 4 : 6}">
      </div>
      
      <!-- Nút thanh toán -->
      <button onclick="processCardPayment('${paymentType}')" 
        class="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white py-2.5 rounded-lg font-semibold transition text-sm">
        <i class="fas fa-lock mr-1"></i> Thanh toán
      </button>
      
      <p class="text-xs text-gray-400 text-center mt-2">
        <i class="fas fa-shield-alt text-green-500"></i> Bảo mật bởi MoMo
      </p>
    </div>
  `;
}

// ===== SELECT BANK =====
function selectBank(btn, bankName) {
  document.querySelectorAll('.bank-option').forEach(b => {
    b.classList.remove('border-pink-500', 'bg-pink-50');
    b.classList.add('border-gray-200');
  });
  btn.classList.remove('border-gray-200');
  btn.classList.add('border-pink-500', 'bg-pink-50');
}

// ===== FORMAT CARD NUMBER =====
function formatCardNumber(input) {
  let value = input.value.replace(/\s/g, '').replace(/\D/g, '');
  let formatted = value.match(/.{1,4}/g)?.join(' ') || value;
  input.value = formatted;
}

// ===== FORMAT EXPIRY =====
function formatExpiry(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length >= 2) {
    value = value.substring(0, 2) + '/' + value.substring(2);
  }
  input.value = value;
}

// ===== PROCESS CARD PAYMENT =====
function processCardPayment(paymentType) {
  const cardNumber = document.getElementById('cardNumber')?.value;
  const cardName = document.getElementById('cardName')?.value;
  const cardExpiry = document.getElementById('cardExpiry')?.value;
  const cardCvv = document.getElementById('cardCvv')?.value;
  
  // Validate
  if (!cardNumber || cardNumber.replace(/\s/g, '').length < 16) {
    showToast('Vui lòng nhập số thẻ hợp lệ!', 'error');
    return;
  }
  if (!cardName) {
    showToast('Vui lòng nhập tên chủ thẻ!', 'error');
    return;
  }
  if (!cardExpiry || cardExpiry.length < 5) {
    showToast('Vui lòng nhập ngày hết hạn!', 'error');
    return;
  }
  if (!cardCvv) {
    showToast('Vui lòng nhập mã CVV/OTP!', 'error');
    return;
  }
  
  // Demo: Xử lý thanh toán
  showToast('Đang xử lý thanh toán...', 'info');
  
  // Hiển thị loading
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = `
    <div class="w-full flex flex-col items-center justify-center py-8">
      <i class="fas fa-spinner fa-spin text-4xl text-pink-600 mb-4"></i>
      <p class="text-gray-600">Đang xác thực thẻ...</p>
    </div>
  `;
  
  setTimeout(() => {
    confirmDemoPayment();
  }, 2000);
}

// ===== SHOW REDIRECT PAYMENT =====
function showRedirectPayment(paymentData, paymentType) {
  const container = document.getElementById('qrCodeContainer');
  const typeInfo = MOMO_TYPE_LABELS[paymentType] || MOMO_TYPE_LABELS.qr;
  
  container.innerHTML = `
    <div class="w-52 h-52 flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl">
      <i class="fas ${typeInfo.icon} text-5xl text-pink-600 mb-4"></i>
      <p class="font-bold text-gray-800">${typeInfo.name}</p>
      <p class="text-sm text-gray-600 text-center mt-2 px-4">Nhấn nút bên dưới để chuyển đến trang thanh toán</p>
    </div>
  `;
  
  // Thêm nút redirect
  const btnContainer = document.createElement('div');
  btnContainer.className = 'mt-4';
  btnContainer.innerHTML = `
    <a href="${paymentData.payUrl}" target="_blank" class="block w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white px-4 py-3 rounded-lg text-sm font-semibold transition text-center">
      <i class="fas fa-external-link-alt mr-2"></i> Thanh toán ngay
    </a>
  `;
  container.parentElement.appendChild(btnContainer);
}

// ===== OPEN MOMO PAYMENT =====
function openMoMoPayment() {
  if (currentMoMoPayUrl) {
    window.open(currentMoMoPayUrl, '_blank');
  } else {
    showToast('Đang tạo link thanh toán...', 'info');
  }
}

// ===== CONFIRM DEMO PAYMENT =====
function confirmDemoPayment() {
  const pendingOrder = JSON.parse(localStorage.getItem('pendingOrder'));
  if (pendingOrder) {
    showToast('Đang xử lý thanh toán...', 'info');
    
    setTimeout(() => {
      pendingOrder.status = 'paid';
      pendingOrder.paidAt = new Date().toISOString();
      pendingOrder.transactionId = 'DEMO_' + Date.now();
      
      closeQRModal();
      completeOrder(pendingOrder);
      showToast('Thanh toán thành công! (Demo)', 'success');
    }, 1500);
  }
}

// ===== LEGACY: SHOW MOMO QR MODAL (backward compatible) =====
async function showMoMoQRModal(orderData) {
  return showMoMoPaymentModal(orderData, 'qr');
}

// ===== GENERATE DEMO QR CODE =====
function generateDemoQR(content, orderData) {
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = '';
  
  if (typeof QRCode !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.className = 'rounded-lg';
    container.appendChild(canvas);
    
    QRCode.toCanvas(canvas, content, {
      width: 200,
      margin: 2,
      color: {
        dark: '#ae2070', // Màu hồng MoMo
        light: '#ffffff'
      }
    }, function(error) {
      if (error) {
        console.error('QR generation error:', error);
        showQRError('Không thể tạo mã QR');
      }
    });
    
    // Thêm nút xác nhận thanh toán demo
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'mt-4 w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white px-4 py-3 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2';
    confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Xác nhận đã thanh toán (Demo)';
    confirmBtn.onclick = () => confirmDemoPayment(orderData);
    container.parentElement.appendChild(confirmBtn);
    
  } else {
    showQRError('Thư viện QR chưa tải');
  }
}

// ===== SHOW QR ERROR =====
function showQRError(message) {
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = `
    <div class="w-52 h-52 flex flex-col items-center justify-center text-red-600">
      <i class="fas fa-exclamation-circle text-4xl mb-3"></i>
      <p class="text-sm font-semibold text-center">${message}</p>
      <button onclick="retryMoMoPayment()" class="mt-3 bg-pink-600 text-white px-4 py-2 rounded-lg text-sm">
        Thử lại
      </button>
    </div>
  `;
}

// ===== GENERATE MOMO QR CODE =====
function generateMoMoQR(paymentData) {
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = '';
  
  // Luôn generate QR từ payUrl vì qrCodeUrl từ MoMo test là deeplink, không phải hình ảnh
  if (paymentData.payUrl) {
    generateQRFromPayUrl(paymentData.payUrl);
  } else {
    container.innerHTML = `
      <div class="w-52 h-52 flex flex-col items-center justify-center text-red-600">
        <i class="fas fa-exclamation-circle text-4xl mb-3"></i>
        <p class="text-sm font-semibold">Không có link thanh toán</p>
      </div>
    `;
    return;
  }
  
  // Thêm nút mở trang thanh toán MoMo
  const payUrlBtn = document.createElement('a');
  payUrlBtn.href = paymentData.payUrl;
  payUrlBtn.target = '_blank';
  payUrlBtn.className = 'mt-3 inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition';
  payUrlBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Mở trang thanh toán';
  container.parentElement.appendChild(payUrlBtn);
  
  // Thêm nút mở app MoMo (cho mobile)
  if (paymentData.deeplink) {
    const deeplinkBtn = document.createElement('a');
    deeplinkBtn.href = paymentData.deeplink;
    deeplinkBtn.className = 'mt-2 inline-flex items-center gap-2 bg-white border-2 border-pink-600 text-pink-600 hover:bg-pink-50 px-4 py-2 rounded-lg text-sm font-semibold transition';
    deeplinkBtn.innerHTML = '<i class="fas fa-mobile-alt"></i> Mở app MoMo';
    container.parentElement.appendChild(deeplinkBtn);
  }
}

// ===== GENERATE QR FROM PAY URL =====
function generateQRFromPayUrl(payUrl) {
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = '';
  
  if (typeof QRCode !== 'undefined') {
    // Tạo canvas element cho QR code
    const canvas = document.createElement('canvas');
    canvas.className = 'rounded-lg';
    container.appendChild(canvas);
    
    // Generate QR code vào canvas
    QRCode.toCanvas(canvas, payUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }, function(error) {
      if (error) {
        console.error('QR Code generation error:', error);
        // Fallback nếu generate lỗi
        container.innerHTML = `
          <div class="w-52 h-52 bg-pink-50 rounded-lg flex flex-col items-center justify-center p-4">
            <i class="fas fa-qrcode text-4xl text-pink-600 mb-3"></i>
            <p class="text-sm text-gray-600 text-center mb-2">Quét mã không khả dụng</p>
            <a href="${payUrl}" target="_blank" class="text-pink-600 font-semibold hover:underline text-sm">
              Nhấn để thanh toán
            </a>
          </div>
        `;
      }
    });
  } else {
    // Fallback - link đến trang thanh toán
    container.innerHTML = `
      <div class="w-52 h-52 bg-pink-50 rounded-lg flex flex-col items-center justify-center p-4">
        <i class="fas fa-qrcode text-4xl text-pink-600 mb-3"></i>
        <p class="text-sm text-gray-600 text-center mb-2">Thư viện QR chưa tải</p>
        <a href="${payUrl}" target="_blank" class="text-pink-600 font-semibold hover:underline text-sm">
          Nhấn để thanh toán
        </a>
      </div>
    `;
  }
}

// ===== RETRY MOMO PAYMENT =====
function retryMoMoPayment() {
  const pendingOrder = JSON.parse(localStorage.getItem('pendingOrder'));
  if (pendingOrder) {
    showMoMoQRModal(pendingOrder);
  }
}

// ===== START MOMO STATUS CHECK =====
function startMoMoStatusCheck(orderId) {
  // Clear existing interval
  if (momoCheckInterval) {
    clearInterval(momoCheckInterval);
  }
  
  // Kiểm tra mỗi 5 giây
  momoCheckInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_URL}/payment/momo/check-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId })
      });
      
      const result = await response.json();
      
      if (result.success && result.data.resultCode === 0) {
        // Thanh toán thành công!
        clearInterval(momoCheckInterval);
        showToast('Thanh toán MoMo thành công!', 'success');
        
        // Hoàn tất đơn hàng
        const pendingOrder = JSON.parse(localStorage.getItem('pendingOrder'));
        if (pendingOrder) {
          pendingOrder.status = 'paid';
          pendingOrder.paidAt = new Date().toISOString();
          pendingOrder.transactionId = result.data.transId;
          completeOrder(pendingOrder);
        }
        closeQRModal();
      }
    } catch (error) {
      console.log('Status check error:', error);
    }
  }, 5000);
}

// ===== OPEN MOMO APP =====
function openMoMoApp() {
  if (currentMoMoDeeplink) {
    window.location.href = currentMoMoDeeplink;
  } else if (currentMoMoPayUrl) {
    window.open(currentMoMoPayUrl, '_blank');
  }
}



// ===== START QR COUNTDOWN =====
function startQRCountdown() {
  // Clear existing interval
  if (qrCountdownInterval) {
    clearInterval(qrCountdownInterval);
  }
  
  updateCountdownDisplay();
  
  qrCountdownInterval = setInterval(() => {
    qrTimeRemaining--;
    updateCountdownDisplay();
    
    if (qrTimeRemaining <= 0) {
      clearInterval(qrCountdownInterval);
      handleQRExpired();
    }
  }, 1000);
}

// ===== UPDATE COUNTDOWN DISPLAY =====
function updateCountdownDisplay() {
  const minutes = Math.floor(qrTimeRemaining / 60);
  const seconds = qrTimeRemaining % 60;
  const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const countdownEl = document.getElementById('qrCountdown');
  if (countdownEl) {
    countdownEl.textContent = display;
    
    // Change color when time is running low
    if (qrTimeRemaining <= 300) { // 5 minutes
      countdownEl.classList.add('text-orange-600');
      countdownEl.classList.remove('text-red-600');
    }
    if (qrTimeRemaining <= 60) { // 1 minute
      countdownEl.classList.add('animate-pulse');
    }
  }
}

// ===== HANDLE QR EXPIRED =====
function handleQRExpired() {
  const container = document.getElementById('qrCodeContainer');
  container.classList.add('qr-expired');
  
  document.getElementById('qrCountdown').textContent = 'Hết hạn';
  document.getElementById('qrCountdown').classList.add('text-gray-500');
  
  // Show expired message
  const expiredMsg = document.createElement('div');
  expiredMsg.className = 'absolute inset-0 bg-white/90 flex flex-col items-center justify-center rounded-xl';
  expiredMsg.innerHTML = `
    <i class="fas fa-clock text-4xl text-gray-400 mb-2"></i>
    <p class="font-bold text-gray-700">Mã QR đã hết hạn</p>
    <button onclick="regenerateQR()" class="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
      <i class="fas fa-redo mr-1"></i> Tạo mã mới
    </button>
  `;
  container.parentElement.style.position = 'relative';
  container.parentElement.appendChild(expiredMsg);
  
  showToast('Mã QR đã hết hạn! Vui lòng tạo mã mới.', 'error');
}

// ===== REGENERATE QR =====
function regenerateQR() {
  const pendingOrder = JSON.parse(localStorage.getItem('pendingOrder'));
  if (pendingOrder) {
    // Generate new order ID
    pendingOrder.orderId = 'DH' + Date.now();
    currentOrderId = pendingOrder.orderId;
    
    // Reset and regenerate
    const container = document.getElementById('qrCodeContainer');
    container.classList.remove('qr-expired');
    
    // Remove expired message
    const expiredMsg = container.parentElement.querySelector('.absolute');
    if (expiredMsg) expiredMsg.remove();
    
    // Update display
    document.getElementById('qrOrderId').textContent = pendingOrder.orderId;
    document.getElementById('bankTransferContent').textContent = pendingOrder.orderId;
    document.getElementById('qrCountdown').classList.remove('text-gray-500', 'text-orange-600', 'animate-pulse');
    document.getElementById('qrCountdown').classList.add('text-red-600');
    
    // Regenerate QR
    generateQRCode(pendingOrder);
    
    // Restart countdown
    qrTimeRemaining = 30 * 60;
    startQRCountdown();
    
    // Update pending order
    localStorage.setItem('pendingOrder', JSON.stringify(pendingOrder));
    
    showToast('Đã tạo mã QR mới!', 'success');
  }
}

// ===== CLOSE QR MODAL =====
function closeQRModal() {
  const modal = document.getElementById('qrPaymentModal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  
  // Clear countdown
  if (qrCountdownInterval) {
    clearInterval(qrCountdownInterval);
  }
  
  // Clear MoMo status check interval
  if (momoCheckInterval) {
    clearInterval(momoCheckInterval);
  }
  
  // Reset MoMo variables
  currentMoMoPayUrl = null;
  currentMoMoDeeplink = null;
}

// ===== CONFIRM PAYMENT =====
function confirmPayment() {
  const pendingOrder = JSON.parse(localStorage.getItem('pendingOrder'));
  if (pendingOrder) {
    pendingOrder.status = 'paid';
    pendingOrder.paidAt = new Date().toISOString();
    completeOrder(pendingOrder);
  }
  closeQRModal();
}

// ===== COMPLETE ORDER =====
async function completeOrder(orderData) {
  // Nếu đơn hàng đã được tạo trong DB trước đó (ví dụ qua MoMo)
  if (orderData.dbOrderId) {
    try {
      if (orderData.status === 'paid') {
        await fetch(`${API_URL}/orders/${orderData.dbOrderId}/payment`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'success',
            transactionId: orderData.transactionId || null
          })
        });
      }
      clearCart();
      window.location.href = `order-success.html?orderId=${orderData.orderId}`;
    } catch (e) {
      console.error('Error confirming MoMo payment:', e);
      window.location.href = `order-success.html?orderId=${orderData.orderId}`;
    }
    return;
  }

  // Lưu đơn hàng vào database
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    
    // Tạo địa chỉ đầy đủ
    const provinceText = document.getElementById('province-text')?.textContent || '';
    const districtText = document.getElementById('district-text')?.textContent || '';
    const wardText = document.getElementById('ward-text')?.textContent || '';
    const fullAddress = `${orderData.address.detail}, ${wardText}, ${districtText}, ${provinceText}`;
    
    // Chuẩn bị thông tin voucher để gửi lên server
    const freeshipVoucherData = appliedFreeshipVoucher ? {
      code: appliedFreeshipVoucher.code,
      id: appliedFreeshipVoucher.id,
      discountValue: freeshipDiscount,
      type: 'freeship'
    } : null;
    
    const discountVoucherData = appliedDiscountVoucher ? {
      code: appliedDiscountVoucher.code,
      id: appliedDiscountVoucher.id,
      discountValue: percentDiscount,
      type: appliedDiscountVoucher.discountType || 'fixed'
    } : null;
    
    // Chuẩn bị thông tin đặt cọc nếu có
    const isDeposit = orderData.depositRequired || orderData.payment.method === 'bank_deposit';
    const depositAmount = orderData.depositAmount || 0;
    const remainingAmount = isDeposit ? (orderData.pricing.total - depositAmount) : 0;
    
    const response = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: user?.ma_kh || null,
        customerName: orderData.customer.fullName,
        phone: orderData.customer.phone,
        address: fullAddress,
        items: orderData.items,
        subtotal: orderData.pricing.subtotal,
        shippingFee: orderData.pricing.shippingFee,
        discount: orderData.pricing.discount,
        total: orderData.pricing.total,
        paymentMethod: orderData.payment.method,
        // Gửi thông tin voucher
        freeshipVoucher: freeshipVoucherData,
        discountVoucher: discountVoucherData,
        voucherCode: discountVoucherData?.code || freeshipVoucherData?.code || null,
        // Gửi thông tin đặt cọc
        isDeposit: isDeposit,
        depositAmount: depositAmount,
        depositPercent: isDeposit ? 50 : 0,
        remainingAmount: remainingAmount
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = (result && result.message) || 'Đặt hàng không thành công, vui lòng thử lại.';
      showToast(msg, 'error');
      isPlacingOrder = false;
      const btn = document.querySelector('[data-place-order-btn], #placeOrderBtn, .btn-place-order, #place-order-btn');
      if (btn) btn.disabled = false;
      return;
    }

    if (result.success) {
      // Cập nhật orderId từ database
      orderData.dbOrderId = result.data.orderId;

      // [MỚI] Lưu thông tin tri ân + gợi ý từ backend để hiển thị modal + trang order-success
      orderData.thankYouVoucher = result.data.thankYouVoucher || null;
      orderData.estimatedDelivery = result.data.estimatedDelivery || '2-3 ngày làm việc';
      orderData.recommendedProducts = result.data.recommendedProducts || [];

      // Nếu đã thanh toán đặt cọc (demo mode - lập tức thành công)
      if (orderData.depositPaid && isDeposit) {
        await fetch(`${API_URL}/orders/${result.data.orderId}/payment`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'success',
            paymentType: 'deposit', // Chỉ cập nhật phần đặt cọc
            transactionId: `DEP_${Date.now()}`
          })
        });
        console.log(`Deposit payment confirmed: ${depositAmount} for order ${result.data.orderId}`);
      }
      // Nếu đã thanh toán toàn bộ (MoMo, etc.)
      else if (orderData.status === 'paid') {
        await fetch(`${API_URL}/orders/${result.data.orderId}/payment`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'success',
            transactionId: orderData.transactionId || null
          })
        });
      }
    }
  } catch (error) {
    console.error('Lỗi lưu đơn hàng vào DB:', error);
    // Vẫn tiếp tục xử lý dù lỗi DB
  }
  
  // Save order to localStorage theo user
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const ordersKey = user?.ma_kh ? `orders_user_${user.ma_kh}` : 'orders_guest';
  const orders = JSON.parse(localStorage.getItem(ordersKey) || '[]');
  orders.push(orderData);
  localStorage.setItem(ordersKey, JSON.stringify(orders));
  
  // Lưu địa chỉ giao hàng để dùng cho lần sau
  saveShippingAddress();
  
  // Clear checkout_items (sản phẩm đã chọn để thanh toán)
  localStorage.removeItem('checkout_items');
  sessionStorage.removeItem('checkout-form-state');
  
  // Clear cart and pending order - dùng đúng cart key
  const cartKey = getCartKey();
  localStorage.removeItem(cartKey);
  localStorage.removeItem('pendingOrder');
  
  // Xóa giỏ hàng trong database nếu đã đăng nhập
  if (user && user.ma_kh) {
    try {
      await fetch(`${API_URL}/cart/clear/${user.ma_kh}`, { method: 'DELETE' });
    } catch (e) {
      console.log('Clear cart in DB error:', e.message);
    }
  }
  
  // Dispatch event để cập nhật cart badge
  window.dispatchEvent(new Event('cartUpdated'));

  // Toast nhanh rồi redirect sang trang order-success (đã có voucher + recommend products + confetti)
  showToast('Đặt hàng thành công! Đang chuyển hướng...', 'success');
  setTimeout(() => {
    window.location.href = `order-success.html?orderId=${orderData.orderId}`;
  }, 900);
}

// ===== THANK YOU MODAL =====
function showThankYouModal(orderData) {
  const voucher = orderData.thankYouVoucher;
  const recs = orderData.recommendedProducts || [];
  const estimated = orderData.estimatedDelivery || '2-3 ngày làm việc';
  const orderId = orderData.dbOrderId || orderData.orderId;

  const fmtPrice = (n) => {
    const v = parseFloat(n) || 0;
    return v.toLocaleString('vi-VN') + 'đ';
  };

  // Order details lấy từ orderData (set trong placeOrder trước khi gọi modal)
  const items = orderData.items || [];
  const customer = orderData.customer || {};
  const address = orderData.address || {};
  const pricing = orderData.pricing || {};
  const payment = orderData.payment || {};

  const paymentLabels = {
    'cod': 'Thanh toán khi nhận hàng (COD)',
    'bank': 'Chuyển khoản ngân hàng',
    'momo': 'Ví MoMo', 'momo_qr': 'MoMo QR', 'momo_wallet': 'MoMo Ví',
    'momo_atm': 'MoMo ATM', 'momo_credit': 'MoMo Thẻ quốc tế',
    'vnpay': 'VNPay', 'installment': 'Trả góp 0%',
    'bank_deposit': 'Đặt cọc chuyển khoản'
  };

  const fullAddress = [address.detail, address.ward, address.district, address.province].filter(Boolean).join(', ');

  // Items list HTML
  const itemsHtml = items.length > 0 ? items.map(it => `
    <div class="flex gap-3 py-3 border-b border-gray-100 last:border-0">
      <img src="${it.image || it.anh_dai_dien || 'https://placehold.co/60x60?text=SP'}" alt="${it.name || it.ten_sp || ''}" class="w-14 h-14 object-contain rounded border border-gray-200" onerror="this.src='https://placehold.co/60x60?text=SP'">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">${it.name || it.ten_sp || 'Sản phẩm'}</div>
        <div class="text-xs text-gray-500 mt-0.5">SL: ${it.quantity || 1} × ${fmtPrice(it.price || it.gia)}</div>
      </div>
      <div class="text-sm font-bold text-red-600 whitespace-nowrap">${fmtPrice((it.price || it.gia || 0) * (it.quantity || 1))}</div>
    </div>
  `).join('') : '<div class="text-sm text-gray-400 italic py-4 text-center">Không có thông tin sản phẩm</div>';

  const voucherCardHtml = voucher ? `
    <div class="bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-50 border-2 border-dashed border-orange-400 rounded-xl p-4 mb-4 shadow-sm">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-3xl">🎁</span>
        <div>
          <div class="font-bold text-orange-700 text-base">Voucher tri ân -${voucher.percent}%</div>
          <div class="text-xs text-gray-600">Cho lần mua tiếp theo trong ${voucher.expiryDays} ngày</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <code id="ty-voucher-code" class="flex-1 bg-white px-3 py-2 rounded-lg border-2 border-orange-300 font-mono text-sm font-bold text-orange-700 select-all text-center">${voucher.code}</code>
        <button onclick="copyThankYouVoucher('${voucher.code}')" class="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition">
          <i class="fas fa-copy mr-1"></i>Copy
        </button>
      </div>
    </div>
  ` : '';

  const recsHtml = recs.length > 0 ? `
    <div>
      <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
        <i class="fas fa-lightbulb text-yellow-500"></i>
        Có thể bạn cũng thích
      </h4>
      <div class="grid grid-cols-2 gap-3">
        ${recs.slice(0, 4).map(p => `
          <a href="product-detail.html?id=${p.ma_sp}" class="border border-gray-200 rounded-lg p-2 hover:shadow-lg hover:border-red-300 transition block bg-white">
            <img src="${p.anh_dai_dien || 'https://placehold.co/100x100?text=SP'}" alt="${p.ten_sp}" class="w-full h-20 object-contain mb-1.5" onerror="this.src='https://placehold.co/100x100?text=SP'">
            <div class="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight">${p.ten_sp}</div>
            <div class="text-xs font-bold text-red-600 mt-1">${fmtPrice(p.gia_giam || p.gia)}</div>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  const modalHtml = `
    <div id="thank-you-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start md:items-center justify-center z-[9999] p-2 md:p-4 overflow-y-auto">
      <div id="ty-confetti-container" class="fixed inset-0 pointer-events-none z-0"></div>
      <div class="bg-white rounded-2xl shadow-2xl max-w-5xl w-full relative z-10 overflow-hidden animate-slide-in my-4">
        <!-- Header Gradient -->
        <div class="bg-gradient-to-br from-green-500 via-emerald-500 to-emerald-600 px-6 py-5 text-white text-center relative">
          <div class="inline-block mb-2">
            <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-lg">
              <i class="fas fa-check text-4xl text-green-500"></i>
            </div>
          </div>
          <h2 class="text-2xl md:text-3xl font-black mb-1">🎉 Đặt hàng thành công!</h2>
          <p class="text-green-50 text-sm">Cảm ơn bạn đã tin tưởng QuangHưng Mobile</p>
        </div>

        <!-- Body 2-col -->
        <div class="grid md:grid-cols-2 gap-0 max-h-[70vh] overflow-y-auto">
          <!-- LEFT: Order Summary -->
          <div class="p-5 md:border-r border-gray-200 bg-white">
            <!-- Order ID + Estimated -->
            <div class="flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 mb-4">
              <div>
                <div class="text-xs text-gray-500">Mã đơn hàng</div>
                <div class="font-bold text-gray-900 text-lg">#${orderId}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-gray-500">Dự kiến giao</div>
                <div class="font-semibold text-green-700 text-sm">${estimated}</div>
              </div>
            </div>

            <!-- Customer & Address -->
            <div class="bg-blue-50 rounded-lg p-3 mb-4">
              <h4 class="font-bold text-gray-800 mb-2 text-sm flex items-center gap-2">
                <i class="fas fa-truck text-blue-600"></i>Giao đến
              </h4>
              <div class="text-sm text-gray-700 space-y-1">
                <div><span class="font-semibold">${customer.fullName || ''}</span> · ${customer.phone || ''}</div>
                <div class="text-xs text-gray-600">${fullAddress}</div>
              </div>
            </div>

            <!-- Items -->
            <h4 class="font-bold text-gray-800 mb-2 text-sm flex items-center gap-2">
              <i class="fas fa-box text-orange-500"></i>Sản phẩm (${items.length})
            </h4>
            <div class="border border-gray-200 rounded-lg px-3 max-h-52 overflow-y-auto mb-4">
              ${itemsHtml}
            </div>

            <!-- Totals -->
            <div class="bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
              <div class="flex justify-between text-gray-600"><span>Tạm tính:</span><span>${fmtPrice(pricing.subtotal || 0)}</span></div>
              <div class="flex justify-between text-gray-600"><span>Phí vận chuyển:</span><span>${(pricing.shippingFee || 0) > 0 ? fmtPrice(pricing.shippingFee) : '<span class="text-green-600">Miễn phí</span>'}</span></div>
              ${(pricing.discount || 0) > 0 ? `<div class="flex justify-between text-green-600"><span>Giảm giá:</span><span>-${fmtPrice(pricing.discount)}</span></div>` : ''}
              <div class="flex justify-between font-bold text-base text-red-600 pt-2 border-t border-gray-200">
                <span>Tổng cộng:</span><span>${fmtPrice(pricing.total || 0)}</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">Thanh toán: ${paymentLabels[payment.method] || payment.method || 'N/A'}</div>
            </div>
          </div>

          <!-- RIGHT: Voucher + Recommend -->
          <div class="p-5 bg-gradient-to-b from-amber-50/30 to-white">
            ${voucherCardHtml}
            ${recsHtml}
            ${!voucher && !recs.length ? '<div class="text-center text-gray-400 italic py-12"><i class="fas fa-gift text-5xl mb-3"></i><div>Cảm ơn bạn đã mua hàng!</div></div>' : ''}
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="border-t border-gray-200 bg-gray-50 px-5 py-4 flex flex-col md:flex-row gap-3">
          <a href="products.html" class="flex-1 text-center py-3 px-4 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold rounded-lg transition">
            <i class="fas fa-shopping-cart mr-1"></i>Tiếp tục mua sắm
          </a>
          <a href="order-success.html?orderId=${orderData.orderId}" class="flex-1 text-center py-3 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg transition shadow-md">
            <i class="fas fa-receipt mr-1"></i>Xem chi tiết đơn hàng
          </a>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  document.body.style.overflow = 'hidden';

  // Trigger confetti
  createThankYouConfetti();
}

function copyThankYouVoucher(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Đã copy mã ${code}!`, 'success');
  }).catch(() => {
    const el = document.getElementById('ty-voucher-code');
    if (el) {
      const range = document.createRange();
      range.selectNode(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      try { document.execCommand('copy'); showToast(`Đã copy mã ${code}!`, 'success'); } catch {}
    }
  });
}

function createThankYouConfetti() {
  const container = document.getElementById('ty-confetti-container');
  if (!container) return;
  const colors = ['#d91e23', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background-color: ${colors[i % colors.length]};
      top: -10px;
      left: ${Math.random() * 100}%;
      opacity: 1;
      transform: rotate(${Math.random() * 360}deg);
      animation: ty-confetti-fall ${2 + Math.random() * 2}s ease-out ${Math.random() * 0.6}s forwards;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    container.appendChild(piece);
  }
  // Inject keyframes once
  if (!document.getElementById('ty-confetti-style')) {
    const style = document.createElement('style');
    style.id = 'ty-confetti-style';
    style.textContent = `
      @keyframes ty-confetti-fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
      @keyframes ty-slide-in {
        0% { opacity: 0; transform: translateY(20px) scale(0.95); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .animate-slide-in { animation: ty-slide-in 0.4s ease-out forwards; }
    `;
    document.head.appendChild(style);
  }
}

// ===== CUSTOM DROPDOWN FUNCTIONS =====
let activeDropdown = null;

// Toggle dropdown visibility
function toggleDropdown(type) {
  const dropdown = document.getElementById(`${type}-dropdown`);
  const arrow = document.getElementById(`${type}-arrow`);
  const btn = dropdown.previousElementSibling;
  
  // Close other dropdowns
  ['province', 'district', 'ward'].forEach(t => {
    if (t !== type) {
      const otherDropdown = document.getElementById(`${t}-dropdown`);
      const otherArrow = document.getElementById(`${t}-arrow`);
      const otherBtn = otherDropdown?.previousElementSibling;
      if (otherDropdown) otherDropdown.classList.add('hidden');
      if (otherArrow) otherArrow.style.transform = 'rotate(0deg)';
      if (otherBtn) otherBtn.classList.remove('open');
    }
  });
  
  // Toggle current dropdown
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
    btn.classList.add('open');
    activeDropdown = type;
  } else {
    dropdown.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
    btn.classList.remove('open');
    activeDropdown = null;
  }
}

// Select option from dropdown
function selectOption(type, value, text) {
  const input = document.getElementById(type);
  const textEl = document.getElementById(`${type}-text`);
  const dropdown = document.getElementById(`${type}-dropdown`);
  const arrow = document.getElementById(`${type}-arrow`);
  const btn = dropdown.previousElementSibling;
  
  // Update value and text
  input.value = value;
  textEl.textContent = text;
  textEl.classList.remove('text-gray-500');
  textEl.classList.add('text-gray-900');
  
  // Close dropdown
  dropdown.classList.add('hidden');
  arrow.style.transform = 'rotate(0deg)';
  btn.classList.remove('open');
  activeDropdown = null;
  
  // Update selected state
  dropdown.querySelectorAll('.custom-dropdown-item').forEach(item => {
    item.classList.remove('selected');
    if (item.dataset.value === value) {
      item.classList.add('selected');
    }
  });
  
  // Trigger change event based on type
  if (type === 'province') {
    onProvinceChange(value);
  } else if (type === 'district') {
    onDistrictChange(value);
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-select-wrapper')) {
    ['province', 'district', 'ward'].forEach(type => {
      const dropdown = document.getElementById(`${type}-dropdown`);
      const arrow = document.getElementById(`${type}-arrow`);
      const btn = dropdown?.previousElementSibling;
      if (dropdown) dropdown.classList.add('hidden');
      if (arrow) arrow.style.transform = 'rotate(0deg)';
      if (btn) btn.classList.remove('open');
    });
    activeDropdown = null;
  }
});

// ===== PROVINCE/DISTRICT/WARD SELECTION =====
// Biến lưu tỉnh/huyện đang chọn
let selectedProvinceKey = '';
let selectedDistrictKey = '';

// Load danh sách tỉnh/thành phố khi trang load
function loadProvinces() {
  const dropdown = document.getElementById('province-dropdown');
  if (!dropdown || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  dropdown.innerHTML = '';
  
  // Sắp xếp theo tên
  const sortedProvinces = Object.entries(VIETNAM_ADDRESS).sort((a, b) => 
    a[1].name.localeCompare(b[1].name, 'vi')
  );
  
  sortedProvinces.forEach(([key, province]) => {
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = key;
    item.textContent = province.name;
    item.onclick = () => selectOption('province', key, province.name);
    dropdown.appendChild(item);
  });
}

// Xử lý khi chọn tỉnh/thành phố
function onProvinceChange(value) {
  const districtDropdown = document.getElementById('district-dropdown');
  const wardDropdown = document.getElementById('ward-dropdown');
  
  // Reset district and ward
  districtDropdown.innerHTML = '';
  wardDropdown.innerHTML = '';
  document.getElementById('district').value = '';
  document.getElementById('district-text').textContent = 'Chọn Quận/Huyện';
  document.getElementById('district-text').classList.add('text-gray-500');
  document.getElementById('district-text').classList.remove('text-gray-900');
  document.getElementById('ward').value = '';
  document.getElementById('ward-text').textContent = 'Chọn Phường/Xã';
  document.getElementById('ward-text').classList.add('text-gray-500');
  document.getElementById('ward-text').classList.remove('text-gray-900');
  
  selectedProvinceKey = value;
  selectedDistrictKey = '';
  
  if (!selectedProvinceKey || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  const province = VIETNAM_ADDRESS[selectedProvinceKey];
  if (!province || !province.districts) return;
  
  // Sắp xếp quận/huyện theo tên
  const sortedDistricts = Object.entries(province.districts).sort((a, b) => 
    a[1].name.localeCompare(b[1].name, 'vi')
  );
  
  sortedDistricts.forEach(([key, district]) => {
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = key;
    item.textContent = district.name;
    item.onclick = () => selectOption('district', key, district.name);
    districtDropdown.appendChild(item);
  });
}

// Xử lý khi chọn quận/huyện
function onDistrictChange(value) {
  const wardDropdown = document.getElementById('ward-dropdown');
  
  // Reset ward
  wardDropdown.innerHTML = '';
  document.getElementById('ward').value = '';
  document.getElementById('ward-text').textContent = 'Chọn Phường/Xã';
  document.getElementById('ward-text').classList.add('text-gray-500');
  document.getElementById('ward-text').classList.remove('text-gray-900');
  
  selectedDistrictKey = value;
  
  if (!selectedProvinceKey || !selectedDistrictKey || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  const province = VIETNAM_ADDRESS[selectedProvinceKey];
  if (!province || !province.districts) return;
  
  const district = province.districts[selectedDistrictKey];
  if (!district || !district.wards) return;
  
  // Sắp xếp phường/xã theo tên
  const sortedWards = [...district.wards].sort((a, b) => a.localeCompare(b, 'vi'));
  
  sortedWards.forEach(ward => {
    const wardValue = ward.toLowerCase().replace(/\s/g, '-');
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = wardValue;
    item.textContent = ward;
    item.onclick = () => selectOption('ward', wardValue, ward);
    wardDropdown.appendChild(item);
  });
}

// ===== AUTO-FILL USER INFO - Load default address from API =====
let allUserAddresses = [];
let selectedAddressData = null;

async function autoFillUserInfo() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.ma_kh) {
    document.getElementById('selected-address-loading').classList.add('hidden');
    document.getElementById('selected-address-empty').classList.add('hidden');
    showDirectAddressForm();
    return;
  }
  
  // Load địa chỉ mặc định từ API
  try {
    const response = await fetch(`${API_URL}/address/${user.ma_kh}/default`);
    const data = await response.json();
    
    document.getElementById('selected-address-loading').classList.add('hidden');
    
    if (data.success && data.data) {
      selectAddress(data.data);
      const btnBack = document.getElementById('btn-back-to-saved-address');
      if (btnBack) btnBack.classList.remove('hidden');
    } else {
      document.getElementById('selected-address-empty').classList.add('hidden');
      showDirectAddressForm();
    }
  } catch (error) {
    console.error('Error loading default address:', error);
    document.getElementById('selected-address-loading').classList.add('hidden');
    document.getElementById('selected-address-empty').classList.add('hidden');
    showDirectAddressForm();
  }
  
  // Điền email từ user profile
  if (user.email) {
    document.getElementById('email').value = user.email;
  }

  // Restore form state preservation if exists
  restoreFormState();
}

// Chọn địa chỉ (set vào form)
function selectAddress(address) {
  selectedAddressData = address;
  
  // Hide direct form when saved address is selected
  const directForm = document.getElementById('direct-address-form');
  if (directForm) directForm.classList.add('hidden');
  
  // Show display container
  const displayContainer = document.getElementById('selected-address-display');
  if (displayContainer) displayContainer.classList.remove('hidden');
  
  // Update hidden inputs
  document.getElementById('selectedAddressId').value = address.ma_dia_chi;
  document.getElementById('fullName').value = address.ho_ten_nguoi_nhan;
  document.getElementById('phone').value = address.so_dien_thoai;
  document.getElementById('province').value = address.tinh_thanh;
  document.getElementById('district').value = address.quan_huyen;
  document.getElementById('ward').value = address.phuong_xa;
  document.getElementById('address').value = address.dia_chi_cu_the;
  
  // Update display
  const contentEl = document.getElementById('selected-address-content');
  const loadingEl = document.getElementById('selected-address-loading');
  const emptyEl = document.getElementById('selected-address-empty');
  
  if (loadingEl) loadingEl.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (contentEl) {
    contentEl.classList.remove('hidden');
    contentEl.innerHTML = `
      <div class="flex items-start gap-3">
        <i class="fas fa-map-marker-alt text-red-600 mt-1 text-lg"></i>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-semibold text-gray-800">${address.ho_ten_nguoi_nhan}</span>
            <span class="text-gray-400">|</span>
            <span class="text-gray-600">${address.so_dien_thoai}</span>
            ${address.mac_dinh ? '<span class="bg-red-600 text-white text-xs px-2 py-0.5 rounded">Mặc định</span>' : ''}
          </div>
          <p class="text-gray-600 text-sm">${address.dia_chi_cu_the}</p>
          <p class="text-gray-500 text-sm">${address.phuong_xa}, ${address.quan_huyen}, ${address.tinh_thanh}</p>
        </div>
      </div>
    `;
  }
  
  saveFormState();
}

// ===== DIRECT ADDRESS FORM FUNCTIONS =====
function showDirectAddressForm() {
  const directForm = document.getElementById('direct-address-form');
  if (directForm) {
    directForm.classList.remove('hidden');
    initDirectAddressDropdowns();
  }
  
  // Hide saved address display container completely
  const displayContainer = document.getElementById('selected-address-display');
  if (displayContainer) displayContainer.classList.add('hidden');
  
  // Hide saved address contents
  document.getElementById('selected-address-content').classList.add('hidden');
  document.getElementById('selected-address-empty').classList.add('hidden');
  
  // If they have saved address, show the toggle back button
  const btnBack = document.getElementById('btn-back-to-saved-address');
  if (btnBack) {
    if (selectedAddressData) {
      btnBack.classList.remove('hidden');
    } else {
      btnBack.classList.add('hidden');
    }
  }
  
  registerFormStateListeners();
  saveFormState();
}

function hideDirectAddressForm() {
  const directForm = document.getElementById('direct-address-form');
  if (directForm) directForm.classList.add('hidden');
  
  // Show display container
  const displayContainer = document.getElementById('selected-address-display');
  if (displayContainer) displayContainer.classList.remove('hidden');
  
  if (selectedAddressData) {
    selectAddress(selectedAddressData);
  } else {
    document.getElementById('selected-address-empty').classList.remove('hidden');
  }
  
  saveFormState();
}

function initDirectAddressDropdowns() {
  const provinceSelect = document.getElementById('direct-province');
  if (!provinceSelect || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  // If already populated, don't repeat
  if (provinceSelect.options.length > 1) return;
  
  provinceSelect.innerHTML = '<option value="">Chọn Tỉnh/Thành phố</option>';
  
  const sortedProvinces = Object.entries(VIETNAM_ADDRESS).sort((a, b) => a[1].name.localeCompare(b[1].name));
  sortedProvinces.forEach(([key, prov]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = prov.name;
    provinceSelect.appendChild(opt);
  });
}

function onDirectProvinceChange(provinceKey) {
  const districtSelect = document.getElementById('direct-district');
  const wardSelect = document.getElementById('direct-ward');
  if (!districtSelect || !wardSelect) return;
  
  districtSelect.innerHTML = '<option value="">Chọn Quận/Huyện</option>';
  wardSelect.innerHTML = '<option value="">Chọn Phường/Xã</option>';
  wardSelect.disabled = true;
  
  if (!provinceKey || typeof VIETNAM_ADDRESS === 'undefined') {
    districtSelect.disabled = true;
    saveFormState();
    return;
  }
  
  const prov = VIETNAM_ADDRESS[provinceKey];
  if (!prov || !prov.districts) {
    districtSelect.disabled = true;
    saveFormState();
    return;
  }
  
  const sortedDistricts = Object.entries(prov.districts).sort((a, b) => a[1].name.localeCompare(b[1].name));
  sortedDistricts.forEach(([key, dist]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = dist.name;
    districtSelect.appendChild(opt);
  });
  
  districtSelect.disabled = false;
  saveFormState();
}

function onDirectDistrictChange(districtKey) {
  const provinceKey = document.getElementById('direct-province').value;
  const wardSelect = document.getElementById('direct-ward');
  if (!wardSelect) return;
  
  wardSelect.innerHTML = '<option value="">Chọn Phường/Xã</option>';
  
  if (!provinceKey || !districtKey || typeof VIETNAM_ADDRESS === 'undefined') {
    wardSelect.disabled = true;
    saveFormState();
    return;
  }
  
  const prov = VIETNAM_ADDRESS[provinceKey];
  if (!prov || !prov.districts) {
    wardSelect.disabled = true;
    saveFormState();
    return;
  }
  
  const dist = prov.districts[districtKey];
  if (!dist || !dist.wards) {
    wardSelect.disabled = true;
    saveFormState();
    return;
  }
  
  const sortedWards = [...dist.wards].sort((a, b) => a.localeCompare(b, 'vi'));
  sortedWards.forEach(ward => {
    const opt = document.createElement('option');
    opt.value = ward;
    opt.textContent = ward;
    wardSelect.appendChild(opt);
  });
  
  wardSelect.disabled = false;
  saveFormState();
}

async function saveDirectAddressToProfile(fullName, phone, provinceName, districtName, wardName, detailAddress) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.ma_kh) return;
  
  try {
    const res = await fetch(`${API_URL}/address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ma_kh: user.ma_kh,
        ho_ten_nguoi_nhan: fullName,
        so_dien_thoai: phone,
        tinh_thanh: provinceName,
        quan_huyen: districtName,
        phuong_xa: wardName,
        dia_chi_cu_the: detailAddress,
        loai_dia_chi: 'nha_rieng',
        mac_dinh: 1
      })
    });
    const data = await res.json();
    if (data.success) {
      console.log('Saved direct address to profile successfully');
    }
  } catch (error) {
    console.error('Error saving direct address to profile:', error);
  }
}

// ===== CHECKOUT FORM STATE PRESERVATION =====
function saveFormState() {
  const fields = {
    'direct-fullName': document.getElementById('direct-fullName')?.value || '',
    'direct-phone': document.getElementById('direct-phone')?.value || '',
    'direct-province': document.getElementById('direct-province')?.value || '',
    'direct-district': document.getElementById('direct-district')?.value || '',
    'direct-ward': document.getElementById('direct-ward')?.value || '',
    'direct-address': document.getElementById('direct-address')?.value || '',
    'note': document.getElementById('note')?.value || '',
    'email': document.getElementById('email')?.value || '',
    'direct-mode-active': document.getElementById('direct-address-form') && !document.getElementById('direct-address-form').classList.contains('hidden') ? 'true' : 'false'
  };
  sessionStorage.setItem('checkout-form-state', JSON.stringify(fields));
}

function restoreFormState() {
  const saved = sessionStorage.getItem('checkout-form-state');
  if (!saved) return;
  
  try {
    const fields = JSON.parse(saved);
    
    if (document.getElementById('note') && fields['note']) document.getElementById('note').value = fields['note'];
    if (document.getElementById('email') && fields['email']) document.getElementById('email').value = fields['email'];
    
    if (fields['direct-mode-active'] === 'true') {
      showDirectAddressForm();
      
      if (document.getElementById('direct-fullName')) document.getElementById('direct-fullName').value = fields['direct-fullName'];
      if (document.getElementById('direct-phone')) document.getElementById('direct-phone').value = fields['direct-phone'];
      
      if (fields['direct-province']) {
        const provinceSelect = document.getElementById('direct-province');
        if (provinceSelect) {
          provinceSelect.value = fields['direct-province'];
          onDirectProvinceChange(fields['direct-province']);
          
          if (fields['direct-district']) {
            const districtSelect = document.getElementById('direct-district');
            if (districtSelect) {
              districtSelect.value = fields['direct-district'];
              onDirectDistrictChange(fields['direct-district']);
              
              if (fields['direct-ward']) {
                const wardSelect = document.getElementById('direct-ward');
                if (wardSelect) {
                  wardSelect.value = fields['direct-ward'];
                }
              }
            }
          }
        }
      }
      
      if (document.getElementById('direct-address')) document.getElementById('direct-address').value = fields['direct-address'];
    }
  } catch (e) {
    console.error('Error restoring form state:', e);
  }
}

function registerFormStateListeners() {
  const ids = [
    'direct-fullName', 'direct-phone', 'direct-province', 
    'direct-district', 'direct-ward', 'direct-address', 
    'note', 'email'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // Remove any existing listener first to prevent duplicates
      el.removeEventListener('input', saveFormState);
      el.removeEventListener('change', saveFormState);
      
      el.addEventListener('input', saveFormState);
      el.addEventListener('change', saveFormState);
    }
  });
}


// Mở modal chọn địa chỉ
async function openSelectAddressModal() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user || !user.ma_kh) {
    showToast('Vui lòng đăng nhập!', 'error');
    return;
  }
  
  document.getElementById('selectAddressModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  // Load danh sách địa chỉ
  try {
    const response = await fetch(`${API_URL}/address/${user.ma_kh}`);
    const data = await response.json();
    
    const loadingEl = document.getElementById('address-modal-loading');
    const emptyEl = document.getElementById('address-modal-empty');
    const listEl = document.getElementById('address-list-modal');
    
    if (loadingEl) loadingEl.classList.add('hidden');
    
    if (data.success && data.data.length > 0) {
      allUserAddresses = data.data;
      if (emptyEl) emptyEl.classList.add('hidden');
      
      // Render danh sách địa chỉ — escape các trường text user-controlled
      listEl.innerHTML = data.data.map(addr => {
        const idNum = Number(addr.ma_dia_chi) || 0;
        const isSel = idNum === Number(selectedAddressData?.ma_dia_chi);
        return `
        <div class="border rounded-lg p-4 hover:shadow-md transition cursor-pointer ${isSel ? 'border-red-500 bg-red-50' : 'bg-gray-50 hover:border-red-300'}"
             onclick="selectAddressFromModal(${idNum})">
          <div class="flex items-start gap-3">
            <div class="mt-1">
              ${isSel
                ? '<i class="fas fa-check-circle text-red-600 text-lg"></i>'
                : '<i class="far fa-circle text-gray-400 text-lg"></i>'}
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="font-semibold text-gray-800">${_esc(addr.ho_ten_nguoi_nhan)}</span>
                <span class="text-gray-400">|</span>
                <span class="text-gray-600">${_esc(addr.so_dien_thoai)}</span>
                ${addr.mac_dinh ? '<span class="bg-red-600 text-white text-xs px-2 py-0.5 rounded">Mặc định</span>' : ''}
              </div>
              <p class="text-gray-600 text-sm">${_esc(addr.dia_chi_cu_the)}</p>
              <p class="text-gray-500 text-sm">${_esc(addr.phuong_xa)}, ${_esc(addr.quan_huyen)}, ${_esc(addr.tinh_thanh)}</p>
            </div>
          </div>
        </div>
      `;}).join('');
      addressesLoaded = true;
    } else {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading addresses:', error);
    document.getElementById('address-modal-loading').classList.add('hidden');
    document.getElementById('address-modal-empty').classList.remove('hidden');
  }
}

// Đóng modal chọn địa chỉ
function closeSelectAddressModal() {
  document.getElementById('selectAddressModal').classList.add('hidden');
  document.body.style.overflow = '';
}

// Chọn địa chỉ từ modal
function selectAddressFromModal(addressId) {
  const address = allUserAddresses.find(a => a.ma_dia_chi === addressId);
  if (address) {
    selectAddress(address);
    closeSelectAddressModal();
    showToast('Đã chọn địa chỉ giao hàng!', 'success');
  }
}

// Parse địa chỉ từ chuỗi và điền vào form
function parseAndFillAddressFromString(addressString) {
  if (!addressString || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  // Chuẩn hóa chuỗi địa chỉ
  const normalizedAddress = addressString.toLowerCase().trim();
  
  // Tìm tỉnh/thành phố
  let foundProvince = null;
  let foundProvinceKey = null;
  
  for (const [key, province] of Object.entries(VIETNAM_ADDRESS)) {
    const provinceName = province.name.toLowerCase();
    // Kiểm tra tên tỉnh có trong địa chỉ không
    if (normalizedAddress.includes(provinceName) || 
        normalizedAddress.includes(provinceName.replace('tỉnh ', '').replace('thành phố ', ''))) {
      foundProvince = province;
      foundProvinceKey = key;
      break;
    }
  }
  
  if (!foundProvince) {
    // Không tìm thấy tỉnh, chỉ điền địa chỉ cụ thể
    document.getElementById('address').value = addressString;
    return;
  }
  
  // Tìm quận/huyện
  let foundDistrict = null;
  let foundDistrictKey = null;
  
  if (foundProvince.districts) {
    for (const [key, district] of Object.entries(foundProvince.districts)) {
      const districtName = district.name.toLowerCase();
      if (normalizedAddress.includes(districtName) ||
          normalizedAddress.includes(districtName.replace('quận ', '').replace('huyện ', '').replace('thị xã ', '').replace('thành phố ', ''))) {
        foundDistrict = district;
        foundDistrictKey = key;
        break;
      }
    }
  }
  
  // Tìm phường/xã
  let foundWard = null;
  let foundWardKey = null;
  
  if (foundDistrict && foundDistrict.wards) {
    for (const ward of foundDistrict.wards) {
      const wardName = ward.toLowerCase();
      if (normalizedAddress.includes(wardName) ||
          normalizedAddress.includes(wardName.replace('phường ', '').replace('xã ', '').replace('thị trấn ', ''))) {
        foundWard = ward;
        foundWardKey = ward.toLowerCase().replace(/\s/g, '-');
        break;
      }
    }
  }
  
  // Điền vào form
  // 1. Điền tỉnh/thành phố
  document.getElementById('province').value = foundProvinceKey;
  document.getElementById('province-text').textContent = foundProvince.name;
  document.getElementById('province-text').classList.remove('text-gray-500');
  document.getElementById('province-text').classList.add('text-gray-900');
  selectedProvinceKey = foundProvinceKey;
  
  // Load quận/huyện
  loadDistrictsForProvince(foundProvinceKey);
  
  // 2. Điền quận/huyện (sau khi load xong)
  setTimeout(() => {
    if (foundDistrictKey) {
      document.getElementById('district').value = foundDistrictKey;
      document.getElementById('district-text').textContent = foundDistrict.name;
      document.getElementById('district-text').classList.remove('text-gray-500');
      document.getElementById('district-text').classList.add('text-gray-900');
      selectedDistrictKey = foundDistrictKey;
      
      // Load phường/xã
      loadWardsForDistrict(foundProvinceKey, foundDistrictKey);
      
      // 3. Điền phường/xã (sau khi load xong)
      setTimeout(() => {
        if (foundWardKey) {
          document.getElementById('ward').value = foundWardKey;
          document.getElementById('ward-text').textContent = foundWard;
          document.getElementById('ward-text').classList.remove('text-gray-500');
          document.getElementById('ward-text').classList.add('text-gray-900');
        }
        
        // Tách phần địa chỉ chi tiết (số nhà, đường...)
        // Loại bỏ tên tỉnh, huyện, xã khỏi địa chỉ để lấy phần chi tiết
        let detailAddress = addressString;
        if (foundProvince) detailAddress = detailAddress.replace(new RegExp(foundProvince.name, 'gi'), '');
        if (foundDistrict) detailAddress = detailAddress.replace(new RegExp(foundDistrict.name, 'gi'), '');
        if (foundWard) detailAddress = detailAddress.replace(new RegExp(foundWard, 'gi'), '');
        detailAddress = detailAddress.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
        
        if (detailAddress) {
          document.getElementById('address').value = detailAddress;
        }
      }, 150);
    }
  }, 150);
}

// Điền địa chỉ từ object
function autoFillAddressFromObject(addressData) {
  if (!addressData) return;
  
  // Điền địa chỉ cụ thể
  if (addressData.detail) {
    document.getElementById('address').value = addressData.detail;
  }
  
  // Điền ghi chú nếu có
  if (addressData.note) {
    document.getElementById('note').value = addressData.note;
  }
  
  // Điền tỉnh/thành phố
  if (addressData.provinceKey && typeof VIETNAM_ADDRESS !== 'undefined') {
    const province = VIETNAM_ADDRESS[addressData.provinceKey];
    if (province) {
      // Set giá trị và hiển thị
      document.getElementById('province').value = addressData.provinceKey;
      document.getElementById('province-text').textContent = province.name;
      document.getElementById('province-text').classList.remove('text-gray-500');
      document.getElementById('province-text').classList.add('text-gray-900');
      
      // Load quận/huyện
      selectedProvinceKey = addressData.provinceKey;
      loadDistrictsForProvince(addressData.provinceKey);
      
      // Sau khi load xong quận/huyện, điền quận/huyện
      setTimeout(() => {
        if (addressData.districtKey && province.districts && province.districts[addressData.districtKey]) {
          const district = province.districts[addressData.districtKey];
          document.getElementById('district').value = addressData.districtKey;
          document.getElementById('district-text').textContent = district.name;
          document.getElementById('district-text').classList.remove('text-gray-500');
          document.getElementById('district-text').classList.add('text-gray-900');
          
          // Load phường/xã
          selectedDistrictKey = addressData.districtKey;
          loadWardsForDistrict(addressData.provinceKey, addressData.districtKey);
          
          // Sau khi load xong phường/xã, điền phường/xã
          setTimeout(() => {
            if (addressData.wardKey) {
              const wardDropdown = document.getElementById('ward-dropdown');
              const wardItem = wardDropdown.querySelector(`[data-value="${addressData.wardKey}"]`);
              if (wardItem) {
                document.getElementById('ward').value = addressData.wardKey;
                document.getElementById('ward-text').textContent = wardItem.textContent;
                document.getElementById('ward-text').classList.remove('text-gray-500');
                document.getElementById('ward-text').classList.add('text-gray-900');
              }
            }
          }, 100);
        }
      }, 100);
    }
  }
}

// Load quận/huyện cho tỉnh (không reset)
function loadDistrictsForProvince(provinceKey) {
  const districtDropdown = document.getElementById('district-dropdown');
  if (!districtDropdown || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  const province = VIETNAM_ADDRESS[provinceKey];
  if (!province || !province.districts) return;
  
  districtDropdown.innerHTML = '';
  
  const sortedDistricts = Object.entries(province.districts).sort((a, b) => 
    a[1].name.localeCompare(b[1].name, 'vi')
  );
  
  sortedDistricts.forEach(([key, district]) => {
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = key;
    item.textContent = district.name;
    item.onclick = () => selectOption('district', key, district.name);
    districtDropdown.appendChild(item);
  });
}

// Load phường/xã cho quận/huyện (không reset)
function loadWardsForDistrict(provinceKey, districtKey) {
  const wardDropdown = document.getElementById('ward-dropdown');
  if (!wardDropdown || typeof VIETNAM_ADDRESS === 'undefined') return;
  
  const province = VIETNAM_ADDRESS[provinceKey];
  if (!province || !province.districts) return;
  
  const district = province.districts[districtKey];
  if (!district || !district.wards) return;
  
  wardDropdown.innerHTML = '';
  
  const sortedWards = [...district.wards].sort((a, b) => a.localeCompare(b, 'vi'));
  
  sortedWards.forEach(ward => {
    const wardValue = ward.toLowerCase().replace(/\s/g, '-');
    const item = document.createElement('div');
    item.className = 'custom-dropdown-item';
    item.dataset.value = wardValue;
    item.textContent = ward;
    item.onclick = () => selectOption('ward', wardValue, ward);
    wardDropdown.appendChild(item);
  });
}

// Lưu địa chỉ giao hàng để dùng cho lần sau
function saveShippingAddress() {
  const addressData = {
    provinceKey: selectedProvinceKey,
    districtKey: selectedDistrictKey,
    wardKey: document.getElementById('ward').value,
    detail: document.getElementById('address').value.trim(),
    note: document.getElementById('note').value.trim()
  };
  
  localStorage.setItem('savedShippingAddress', JSON.stringify(addressData));
}

// ===== SAVED VOUCHERS FUNCTIONS =====

// Toggle hiển thị danh sách voucher đã lưu
function toggleSavedVouchers() {
  const section = document.getElementById('savedVouchersSection');
  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    loadSavedVouchersForCheckout();
  } else {
    section.classList.add('hidden');
  }
}

// Load voucher đã lưu từ localStorage và database
function loadSavedVouchersForCheckout() {
  const container = document.getElementById('savedVouchersList');
  if (!container) return;
  
  // Chỉ dùng localStorage - không cần database
  let savedVouchers = JSON.parse(localStorage.getItem('savedVouchers') || '[]');
  
  if (savedVouchers.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-gray-500 text-xs">
        <i class="fas fa-inbox text-2xl mb-2 block opacity-50"></i>
        <p>Chưa có mã đã lưu</p>
        <a href="promotions-new.html" class="text-red-600 hover:underline mt-1 inline-block">Xem khuyến mãi</a>
      </div>
    `;
    return;
  }
  
  container.innerHTML = savedVouchers.map(voucher => {
    // Xử lý trường hợp voucher chỉ có code (lưu từ trang promotions)
    let discountText = 'Mã giảm giá';
    if (voucher.discountValue !== undefined && voucher.discountValue !== null) {
      discountText = voucher.discountType === 'percent' 
        ? `Giảm ${voucher.discountValue}%` 
        : `Giảm ${formatPrice(voucher.discountValue)}`;
    }
    
    let minOrderText = '';
    if (voucher.minOrder !== undefined && voucher.minOrder !== null && voucher.minOrder > 0) {
      minOrderText = `Đơn từ ${formatPrice(voucher.minOrder)}`;
    }
    
    return `
      <div class="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg hover:border-red-400 cursor-pointer transition" onclick="selectSavedVoucher('${voucher.code}')">
        <div class="w-10 h-10 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
          <i class="fas fa-ticket-alt text-red-600 text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-gray-800 text-xs">${voucher.code}</p>
          <p class="text-xs text-gray-500 truncate">${voucher.description || discountText}</p>
          ${minOrderText ? `<p class="text-xs text-gray-400">${minOrderText}</p>` : ''}
        </div>
        <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
      </div>
    `;
  }).join('');
}

// Chọn voucher đã lưu
function selectSavedVoucher(code) {
  const voucherInput = document.getElementById('voucherCode');
  if (voucherInput) {
    voucherInput.value = code;
  }
  // Ẩn danh sách
  document.getElementById('savedVouchersSection').classList.add('hidden');
  // Tự động áp dụng
  applyVoucher();
}



// ===== PAGE INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  // Scroll về đầu trang ngay khi load
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  
  // Load giỏ hàng
  loadCart();
  
  // Auto-fill thông tin user và load địa chỉ mặc định
  setTimeout(() => {
    autoFillUserInfo();
    
    // Cập nhật thông báo đặt cọc nếu cần
    updatePickupDepositNotice();
    
    // Đảm bảo scroll về đầu sau khi mọi thứ hoàn tất
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 600);
  }, 200);
});

