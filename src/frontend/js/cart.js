/* ============================================
   CART PAGE JS - QuangHưng Mobile
   ============================================ */

// Sample cart data (in real app, this comes from localStorage)
const sampleCartItems = [
  {
    id: 1,
    name: 'iPhone 15 Pro Max 256GB',
    color: 'Titan Đen',
    colorCode: '#1f2937',
    storage: '256GB',
    price: 29990000,
    originalPrice: 34990000,
    image: 'images/15-256.avif',
    quantity: 1,
    inStock: true,
    badge: '-14%'
  },
  {
    id: 2,
    name: 'Samsung Galaxy S24 FE 5G 256GB',
    color: 'Xám Titan',
    colorCode: '#6b7280',
    storage: '256GB',
    price: 14990000,
    originalPrice: 14990000,
    image: 'images/samsung_galaxy_s24_fe_5g.avif',
    quantity: 1,
    inStock: true,
    badge: 'HOT'
  },
  {
    id: 3,
    name: 'Xiaomi 14 Pro 256GB',
    color: 'Đen Titan',
    colorCode: '#000000',
    storage: '256GB',
    price: 19990000,
    originalPrice: 24990000,
    image: 'images/Xiaomi.avif',
    quantity: 1,
    inStock: true,
    stockCount: 3,
    badge: '-20%'
  }
];

// Suggested products
const suggestedProducts = [
  {
    id: 4,
    name: 'OPPO Find X9 Pro 512GB',
    price: 25990000,
    originalPrice: 29990000,
    image: 'images/oppx9.avif',
    rating: 4.5,
    reviews: 128,
    badge: '-15%',
    badgeColor: 'red'
  },
  {
    id: 5,
    name: 'Google Pixel 9 Pro 256GB',
    price: 28990000,
    originalPrice: null,
    image: 'images/pixel-9-pro.avif',
    rating: 5,
    reviews: 89,
    badge: 'HOT',
    badgeColor: 'orange'
  },
  {
    id: 6,
    name: 'OPPO Reno 13F 4G 256GB',
    price: 8990000,
    originalPrice: 10990000,
    image: 'images/oppo_reno_13_f_4g_256gb.avif',
    rating: 4,
    reviews: 45,
    badge: 'NEW',
    badgeColor: 'green'
  },
  {
    id: 7,
    name: 'Samsung Galaxy A36 5G 128GB',
    price: 7490000,
    originalPrice: 8290000,
    image: 'images/samsung_galaxy_a36_5g.avif',
    rating: 4.5,
    reviews: 156,
    badge: '-10%',
    badgeColor: 'purple'
  }
];

// State
let cartItems = [];
const API_URL = 'http://localhost:3000/api';

// Lấy thông tin user
function getUser() {
  return JSON.parse(localStorage.getItem('user') || 'null');
}

// Lấy cart key theo user (cho localStorage backup)
function getCartKey() {
  const user = getUser();
  if (user && user.ma_kh) {
    return `cart_user_${user.ma_kh}`;
  }
  return 'cart_guest';
}

// Initialize cart
document.addEventListener('DOMContentLoaded', function() {
  // Đánh dấu đây là trang cart để app.js không sync lại
  window.isCartPage = true;
  setTimeout(initCart, 100);
});

async function initCart() {
  const user = getUser();
  
  if (user && user.ma_kh) {
    // User đã đăng nhập - LUÔN lấy giỏ hàng từ database (nguồn dữ liệu chính xác nhất)
    // Xóa localStorage trước để tránh hiển thị dữ liệu cũ
    const cartKey = getCartKey();
    const oldCart = localStorage.getItem(cartKey);
    
    // Load từ database
    await loadCartFromDB(user.ma_kh);
  } else {
    // Khách - dùng localStorage
    const cartKey = getCartKey();
    const savedCart = localStorage.getItem(cartKey);
    cartItems = savedCart ? JSON.parse(savedCart) : [];
  }
  
  renderCart();
  renderSuggestedProducts();
  initEventListeners();
}

// Load giỏ hàng từ database - LUÔN ƯU TIÊN DATABASE
async function loadCartFromDB(userId) {
  try {
    console.log('Loading cart from DB for user:', userId);
    const response = await fetch(`${API_URL}/cart/${userId}`);
    const data = await response.json();
    console.log('Cart API response:', data);
    
    if (data.success) {
      // Database là nguồn dữ liệu DUY NHẤT - luôn dùng dữ liệu từ DB
      cartItems = data.data || [];
      console.log('Cart items from DB:', cartItems.length);
      // Đồng bộ localStorage với database
      const cartKey = getCartKey();
      localStorage.setItem(cartKey, JSON.stringify(cartItems));
      window.dispatchEvent(new Event('cartUpdated'));
      if (typeof updateCartBadge === 'function') {
        updateCartBadge();
      }
    } else {
      // API trả về lỗi - hiển thị giỏ hàng trống
      console.error('API trả về lỗi:', data.message);
      cartItems = [];
    }
  } catch (error) {
    console.error('Lỗi load giỏ hàng:', error);
    // Lỗi kết nối - hiển thị giỏ hàng trống, KHÔNG fallback localStorage
    // Vì localStorage có thể chứa dữ liệu cũ không chính xác
    cartItems = [];
  }
}

// Save cart to localStorage (backup)
function saveCartLocal() {
  const cartKey = getCartKey();
  localStorage.setItem(cartKey, JSON.stringify(cartItems));
  window.dispatchEvent(new Event('cartUpdated'));
  if (typeof updateCartBadge === 'function') {
    updateCartBadge();
  }
}

// Save cart - sync với database nếu đã đăng nhập
async function saveCart() {
  saveCartLocal();
  // Database sync được xử lý trong các hàm add/update/remove riêng
}

// Render cart items
function renderCart() {
  const container = document.getElementById('cart-items-list');
  const emptyCart = document.getElementById('empty-cart');
  const cartContent = document.getElementById('cart-content');
  
  if (cartItems.length === 0) {
    emptyCart.classList.remove('hidden');
    cartContent.classList.add('hidden');
    return;
  }
  
  emptyCart.classList.add('hidden');
  cartContent.classList.remove('hidden');
  
  container.innerHTML = cartItems.map((item, index) => {
    const itemName = item.name || 'Sản phẩm';
    
    // Xử lý màu sắc - parse JSON nếu cần
    let itemColor = 'Mặc định';
    let itemColorCode = '#000000';
    
    if (item.color) {
      if (typeof item.color === 'string' && (item.color.startsWith('{') || item.color.startsWith('['))) {
        try {
          const colorData = JSON.parse(item.color);
          if (colorData.colorNames && colorData.colorNames.length > 0) {
            itemColor = colorData.colorNames[0];
          }
          if (colorData.colors && colorData.colors.length > 0) {
            itemColorCode = colorData.colors[0];
          }
        } catch (e) {
          itemColor = item.color;
        }
      } else {
        itemColor = item.color;
      }
    }
    
    if (item.colorCode && !item.colorCode.startsWith('{')) {
      itemColorCode = item.colorCode;
    }
    
    const itemStorage = item.storage || '128GB';
    const itemPrice = item.price || 0;
    const itemOriginalPrice = item.originalPrice || itemPrice;
    const itemQuantity = item.quantity || 1;
    
    // Xử lý đường dẫn ảnh - đảm bảo có prefix images/
    let itemImage = item.image || item.anh_dai_dien || '';
    if (!itemImage) {
      itemImage = 'images/15-256.avif';
    } else if (!itemImage.startsWith('http') && !itemImage.startsWith('images/')) {
      itemImage = `images/${itemImage}`;
    }
    // Đảm bảo không có double prefix
    itemImage = itemImage.replace('images/images/', 'images/');
    
    const itemInStock = item.inStock !== false;
    
    return `
    <div class="cart-item p-5 border-b border-gray-100" data-index="${index}">
      <div class="flex gap-4">
        <input type="checkbox" class="item-checkbox w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 mt-8 cursor-pointer" checked data-index="${index}">
        
        <div class="relative">
          <a href="product-detail.html?id=${item.id || item.ma_sp}" class="block">
            <img src="${itemImage}" alt="${itemName}" class="w-24 h-24 md:w-28 md:h-28 object-contain rounded-xl bg-gray-50 p-2 hover:opacity-80 transition" onerror="this.src='images/15-256.avif'">
          </a>
          ${item.badge ? `<span class="absolute -top-1 -left-1 ${getBadgeClass(item.badge)} text-white text-[10px] font-bold px-2 py-0.5 rounded-full">${item.badge}</span>` : ''}
        </div>
        
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start gap-2">
            <div>
              <a href="product-detail.html?id=${item.id || item.ma_sp}" class="block">
                <h3 class="font-bold text-gray-900 text-base md:text-lg line-clamp-2 hover:text-red-600 transition cursor-pointer">
                  ${itemName}
                </h3>
              </a>
              <div class="flex items-center gap-2 mt-1.5">
                <span class="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  <span class="w-3 h-3 rounded-full" style="background-color: ${itemColorCode}"></span> ${itemColor}
                </span>
                <span class="text-xs text-gray-400">|</span>
                <span class="text-xs text-gray-500">${itemStorage}</span>
              </div>
            </div>
            <button class="delete-btn p-2 rounded-lg text-gray-400 transition" onclick="removeItem(${index})">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="flex flex-col sm:flex-row sm:items-end justify-between mt-4 gap-3">
            <div>
              <div class="flex items-baseline gap-2">
                <span class="text-xl md:text-2xl font-black text-red-600">${formatPrice(itemPrice)}</span>
                ${itemOriginalPrice > itemPrice ? `<span class="text-sm text-gray-400 line-through">${formatPrice(itemOriginalPrice)}</span>` : ''}
              </div>
              ${itemInStock ? 
                (item.stockCount ? 
                  `<p class="text-xs text-orange-500 mt-1 flex items-center gap-1"><i class="fas fa-clock"></i> Chỉ còn ${item.stockCount} sản phẩm</p>` :
                  `<p class="text-xs text-green-600 mt-1 flex items-center gap-1"><i class="fas fa-check-circle"></i> Còn hàng - Giao ngay</p>`
                ) :
                `<p class="text-xs text-red-500 mt-1 flex items-center gap-1"><i class="fas fa-times-circle"></i> Hết hàng</p>`
              }
            </div>
            
            <div class="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button class="quantity-btn w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 bg-white shadow-sm" onclick="updateQuantity(${index}, -1)">
                <i class="fas fa-minus text-xs"></i>
              </button>
              <input type="text" value="${itemQuantity}" class="w-12 h-9 text-center font-bold text-gray-800 bg-transparent outline-none" onchange="setQuantity(${index}, this.value)">
              <button class="quantity-btn w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 bg-white shadow-sm" onclick="updateQuantity(${index}, 1)">
                <i class="fas fa-plus text-xs"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;}).join('');
  
  updateSummary();
  updateSelectAllState();
}

// Get badge class based on type
function getBadgeClass(badge) {
  if (badge.includes('%')) return 'bg-red-500';
  if (badge === 'HOT') return 'bg-orange-500';
  if (badge === 'NEW') return 'bg-green-500';
  return 'bg-blue-500';
}

// Format price
function formatPrice(price) {
  if (price === undefined || price === null || isNaN(price)) {
    return '0₫';
  }
  return Number(price).toLocaleString('vi-VN') + '₫';
}

// Update quantity
async function updateQuantity(index, delta) {
  const item = cartItems[index];
  const maxStock = item.stockCount || 99;
  const newQty = item.quantity + delta;
  
  // Kiểm tra không vượt quá tồn kho
  if (newQty > maxStock) {
    showToast(`Số lượng tối đa có thể mua là ${maxStock} sản phẩm`, 'error');
    return;
  }
  
  if (newQty >= 1) {
    cartItems[index].quantity = newQty;
    saveCartLocal();
    renderCart();
    
    // Sync với database nếu đã đăng nhập
    const user = getUser();
    if (user && user.ma_kh && cartItems[index].cartItemId) {
      try {
        const response = await fetch(`${API_URL}/cart/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cartItemId: cartItems[index].cartItemId,
            quantity: newQty
          })
        });
        const data = await response.json();
        if (!data.success) {
          // Rollback nếu backend từ chối
          cartItems[index].quantity = newQty - delta;
          saveCartLocal();
          renderCart();
          showToast(data.message || 'Không thể cập nhật số lượng', 'error');
        }
      } catch (error) {
        console.error('Lỗi sync giỏ hàng:', error);
      }
    }
  }
}

// Set quantity directly
async function setQuantity(index, value) {
  const item = cartItems[index];
  const maxStock = item.stockCount || 99;
  let qty = parseInt(value) || 1;
  
  // Kiểm tra không vượt quá tồn kho
  if (qty > maxStock) {
    showToast(`Số lượng tối đa có thể mua là ${maxStock} sản phẩm`, 'error');
    qty = maxStock;
  }
  
  const oldQty = cartItems[index].quantity;
  cartItems[index].quantity = Math.max(1, qty);
  saveCartLocal();
  renderCart();
  
  // Sync với database
  const user = getUser();
  if (user && user.ma_kh && cartItems[index].cartItemId) {
    try {
      const response = await fetch(`${API_URL}/cart/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartItemId: cartItems[index].cartItemId,
          quantity: cartItems[index].quantity
        })
      });
      const data = await response.json();
      if (!data.success) {
        // Rollback nếu backend từ chối
        cartItems[index].quantity = oldQty;
        saveCartLocal();
        renderCart();
        showToast(data.message || 'Không thể cập nhật số lượng', 'error');
      }
    } catch (error) {
      console.error('Lỗi sync giỏ hàng:', error);
    }
  }
}

// Remove item
async function removeItem(index) {
  const item = document.querySelector(`.cart-item[data-index="${index}"]`);
  const cartItemId = cartItems[index].cartItemId;
  const productId = cartItems[index].id;
  const user = getUser();
  
  console.log('Removing item:', { index, cartItemId, productId, userId: user?.ma_kh });
  
  // Lưu backup để rollback nếu cần
  const backupCartItems = [...cartItems];
  const cartKey = getCartKey();
  
  // Xóa từ database TRƯỚC - CHỈ xóa localStorage SAU KHI database xóa thành công
  if (user && user.ma_kh) {
    try {
      let response;
      let deleteSuccess = false;
      
      if (cartItemId) {
        // Xóa theo cartItemId
        console.log('Deleting by cartItemId:', cartItemId);
        response = await fetch(`${API_URL}/cart/remove/${cartItemId}`, { method: 'DELETE' });
      } else if (productId) {
        // Fallback: xóa theo userId và productId
        console.log('Deleting by userId/productId:', user.ma_kh, productId);
        response = await fetch(`${API_URL}/cart/${user.ma_kh}/${productId}`, { method: 'DELETE' });
      }
      
      if (response) {
        const data = await response.json();
        console.log('Delete response:', data);
        
        // Kiểm tra xem có thực sự xóa được không
        if (!data.success) {
          showToast('Lỗi xóa sản phẩm, vui lòng thử lại', 'error');
          return; // KHÔNG xóa localStorage nếu DB fail
        }
        
        deleteSuccess = true;
        
        // Kiểm tra affectedRows - nếu = 0 nghĩa là không xóa được gì
        if (data.affectedRows === 0 && !data.deleted) {
          console.warn('Warning: No rows affected, item may not exist in DB');
        }
      }
      
      // CHỈ xóa localStorage SAU KHI database xóa thành công
      if (deleteSuccess) {
        cartItems.splice(index, 1);
        localStorage.setItem(cartKey, JSON.stringify(cartItems));
        window.dispatchEvent(new Event('cartUpdated'));
        if (typeof updateCartBadge === 'function') {
          updateCartBadge();
        }
        
        // Animation cho UI
        if (item) {
          item.style.opacity = '0';
          item.style.transform = 'translateX(100px)';
          setTimeout(() => {
            renderCart();
            showToast('Đã xóa sản phẩm khỏi giỏ hàng', 'success');
          }, 300);
        } else {
          renderCart();
          showToast('Đã xóa sản phẩm khỏi giỏ hàng', 'success');
        }
      }
    } catch (error) {
      console.error('Lỗi xóa giỏ hàng:', error);
      showToast('Lỗi kết nối, vui lòng thử lại', 'error');
      // KHÔNG xóa localStorage khi có lỗi kết nối
      return;
    }
  } else {
    // Khách (chưa đăng nhập) - chỉ xóa localStorage
    cartItems.splice(index, 1);
    localStorage.setItem(cartKey, JSON.stringify(cartItems));
    window.dispatchEvent(new Event('cartUpdated'));
    if (typeof updateCartBadge === 'function') {
      updateCartBadge();
    }
    
    // Animation cho UI
    if (item) {
      item.style.opacity = '0';
      item.style.transform = 'translateX(100px)';
      setTimeout(() => {
        renderCart();
        showToast('Đã xóa sản phẩm khỏi giỏ hàng', 'success');
      }, 300);
    } else {
      renderCart();
      showToast('Đã xóa sản phẩm khỏi giỏ hàng', 'success');
    }
  }
}

// Update summary
function updateSummary() {
  const checkedItems = getCheckedItems();
  const subtotal = checkedItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
  const originalTotal = checkedItems.reduce((sum, item) => sum + ((item.originalPrice || item.price || 0) * (item.quantity || 1)), 0);
  const savings = originalTotal - subtotal;
  
  const total = subtotal;
  const totalItems = checkedItems.reduce((sum, item) => sum + item.quantity, 0);
  
  // Update UI
  const cartItemCountEl = document.getElementById('cart-item-count');
  if (cartItemCountEl) cartItemCountEl.textContent = `${cartItems.length} sản phẩm`;

  const selectAllCountEl = document.getElementById('select-all-count');
  if (selectAllCountEl) selectAllCountEl.textContent = `(${cartItems.length} sản phẩm)`;

  const summaryCountEl = document.getElementById('summary-count');
  if (summaryCountEl) summaryCountEl.textContent = totalItems;

  const subtotalEl = document.getElementById('subtotal');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

  const totalEl = document.getElementById('total');
  if (totalEl) totalEl.textContent = formatPrice(total);
  
  // Savings badge
  const savingsBadge = document.getElementById('savings-badge');
  if (savings > 0) {
    savingsBadge.classList.remove('hidden');
    document.getElementById('savings-amount').textContent = formatPrice(savings);
  } else {
    savingsBadge.classList.add('hidden');
  }
  
  // Shipping notice
  const shippingNotice = document.getElementById('shipping-notice');
  if (subtotal >= 5000000) {
    shippingNotice.innerHTML = `
      <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
        <i class="fas fa-truck text-green-600 text-xl"></i>
      </div>
      <div>
        <p class="font-semibold text-green-800">Miễn phí giao hàng!</p>
        <p class="text-sm text-green-600">Đơn hàng của bạn đủ điều kiện miễn phí vận chuyển toàn quốc</p>
      </div>
    `;
    shippingNotice.className = 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3';
  } else {
    const remaining = 5000000 - subtotal;
    shippingNotice.innerHTML = `
      <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
        <i class="fas fa-truck text-blue-600 text-xl"></i>
      </div>
      <div>
        <p class="font-semibold text-blue-800">Mua thêm ${formatPrice(remaining)} để được miễn phí giao hàng</p>
        <div class="w-full bg-blue-200 rounded-full h-2 mt-2">
          <div class="bg-blue-600 h-2 rounded-full" style="width: ${(subtotal / 5000000) * 100}%"></div>
        </div>
      </div>
    `;
    shippingNotice.className = 'bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3';
  }
}

// Get checked items
function getCheckedItems() {
  const checkboxes = document.querySelectorAll('.item-checkbox:checked');
  return Array.from(checkboxes).map(cb => cartItems[parseInt(cb.dataset.index)]);
}

// Update select all state
function updateSelectAllState() {
  const selectAll = document.getElementById('select-all');
  const checkboxes = document.querySelectorAll('.item-checkbox');
  const checkedCount = document.querySelectorAll('.item-checkbox:checked').length;
  
  selectAll.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

// Initialize event listeners
function initEventListeners() {
  // Select all
  document.getElementById('select-all').addEventListener('change', function() {
    document.querySelectorAll('.item-checkbox').forEach(cb => {
      cb.checked = this.checked;
    });
    updateSummary();
  });
  
  // Individual checkboxes
  document.getElementById('cart-items-list').addEventListener('change', function(e) {
    if (e.target.classList.contains('item-checkbox')) {
      updateSelectAllState();
      updateSummary();
    }
  });
  
  // Delete selected
  document.getElementById('delete-selected').addEventListener('click', async function() {
    const checkedIndexes = Array.from(document.querySelectorAll('.item-checkbox:checked'))
      .map(cb => parseInt(cb.dataset.index))
      .sort((a, b) => b - a);
    
    if (checkedIndexes.length === 0) {
      showToast('Vui lòng chọn sản phẩm cần xóa', 'warning');
      return;
    }
    
    const user = getUser();
    const deletedCount = checkedIndexes.length;
    const cartKey = getCartKey();
    
    // Lưu backup để rollback nếu cần
    const backupCartItems = [...cartItems];
    
    console.log('Deleting selected items:', checkedIndexes);
    
    // Xóa từ database trước nếu đã đăng nhập
    if (user && user.ma_kh) {
      let allDeleteSuccess = true;
      const successfullyDeletedIndexes = [];
      
      try {
        for (const index of checkedIndexes) {
          const cartItemId = cartItems[index].cartItemId;
          const productId = cartItems[index].id;
          
          let response;
          if (cartItemId) {
            console.log('Deleting by cartItemId:', cartItemId);
            response = await fetch(`${API_URL}/cart/remove/${cartItemId}`, { method: 'DELETE' });
          } else if (productId) {
            console.log('Deleting by userId/productId:', user.ma_kh, productId);
            response = await fetch(`${API_URL}/cart/${user.ma_kh}/${productId}`, { method: 'DELETE' });
          }
          
          if (response) {
            const data = await response.json();
            console.log('Delete response:', data);
            if (data.success) {
              successfullyDeletedIndexes.push(index);
            } else {
              console.error('Lỗi xóa item:', cartItemId || productId, data.message);
              allDeleteSuccess = false;
            }
          }
        }
        
        // CHỈ xóa những item đã xóa thành công từ DB
        if (successfullyDeletedIndexes.length > 0) {
          // Xóa theo thứ tự giảm dần để không ảnh hưởng index
          successfullyDeletedIndexes.sort((a, b) => b - a).forEach(index => {
            cartItems.splice(index, 1);
          });
          
          localStorage.setItem(cartKey, JSON.stringify(cartItems));
          window.dispatchEvent(new Event('cartUpdated'));
          if (typeof updateCartBadge === 'function') {
            updateCartBadge();
          }
          
          renderCart();
          
          if (allDeleteSuccess) {
            showToast(`Đã xóa ${deletedCount} sản phẩm`, 'success');
          } else {
            showToast(`Đã xóa ${successfullyDeletedIndexes.length}/${deletedCount} sản phẩm`, 'warning');
          }
        } else {
          // Không xóa được gì - reload từ DB để đảm bảo đồng bộ
          await loadCartFromDB(user.ma_kh);
          renderCart();
          showToast('Có lỗi xảy ra khi xóa, đã tải lại giỏ hàng', 'error');
        }
      } catch (error) {
        console.error('Lỗi xóa giỏ hàng:', error);
        // Lỗi kết nối - reload từ DB để đảm bảo đồng bộ
        await loadCartFromDB(user.ma_kh);
        renderCart();
        showToast('Lỗi kết nối, đã tải lại giỏ hàng', 'error');
      }
    } else {
      // Khách (chưa đăng nhập) - chỉ xóa localStorage
      checkedIndexes.forEach(index => {
        cartItems.splice(index, 1);
      });
      
      localStorage.setItem(cartKey, JSON.stringify(cartItems));
      window.dispatchEvent(new Event('cartUpdated'));
      if (typeof updateCartBadge === 'function') {
        updateCartBadge();
      }
      
      renderCart();
      showToast(`Đã xóa ${deletedCount} sản phẩm`, 'success');
    }
  });
  
  // Checkout button
  initCheckoutButton();
}

// Render suggested products
function renderSuggestedProducts() {
  const container = document.getElementById('suggested-products');
  
  container.innerHTML = suggestedProducts.map(product => `
    <a href="product-detail.html?id=${product.id}" class="product-suggest bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition duration-300">
      <div class="relative p-4 bg-gradient-to-br from-gray-50 to-white">
        <span class="absolute top-3 left-3 bg-${product.badgeColor}-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">${product.badge}</span>
        <img src="${product.image}" alt="${product.name}" class="w-full h-40 md:h-48 object-contain" onerror="this.src='images/15-256.avif'">
      </div>
      <div class="p-4">
        <h3 class="font-bold text-gray-800 text-sm md:text-base line-clamp-2 mb-2 min-h-[40px]">${product.name}</h3>
        <div class="flex items-center gap-1 mb-2">
          <div class="flex text-yellow-400 text-xs">
            ${renderStars(product.rating)}
          </div>
          <span class="text-xs text-gray-400">(${product.reviews})</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-lg md:text-xl font-black text-red-600">${formatPrice(product.price)}</span>
          ${product.originalPrice ? `<span class="text-xs text-gray-400 line-through">${formatPrice(product.originalPrice)}</span>` : ''}
        </div>
      </div>
    </a>
  `).join('');
}

// Render star rating
function renderStars(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars += '<i class="fas fa-star"></i>';
    } else if (i - 0.5 <= rating) {
      stars += '<i class="fas fa-star-half-alt"></i>';
    } else {
      stars += '<i class="far fa-star"></i>';
    }
  }
  return stars;
}

// Kiểm tra đăng nhập và hiển thị modal yêu cầu đăng nhập
function showLoginRequiredModal() {
  // Tạo modal
  const modal = document.createElement('div');
  modal.id = 'login-required-modal';
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl transform animate-pulse">
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

function closeLoginModal() {
  const modal = document.getElementById('login-required-modal');
  if (modal) modal.remove();
}

// Kiểm tra user đã đăng nhập chưa
function isLoggedIn() {
  const user = getUser();
  return user && user.ma_kh;
}

// Thêm sản phẩm vào giỏ hàng (global function) - YÊU CẦU ĐĂNG NHẬP
window.addToCart = async function(product, quantity = 1) {
  const user = getUser();
  
  // Kiểm tra đăng nhập
  if (!user || !user.ma_kh) {
    showLoginRequiredModal();
    return;
  }
  
  // Đã đăng nhập - thêm vào database
  try {
    const response = await fetch(`${API_URL}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.ma_kh,
        productId: product.id,
        quantity: quantity
      })
    });
    const data = await response.json();
    
    if (data.success) {
      // Đồng bộ lại từ database để có cartItemId chính xác
      await loadCartFromDB(user.ma_kh);
      if (typeof updateCartBadge === 'function') {
        updateCartBadge();
      }
      showToast('Đã thêm vào giỏ hàng!', 'success');
    } else {
      showToast(data.message || 'Lỗi thêm giỏ hàng', 'error');
    }
  } catch (error) {
    console.error('Lỗi:', error);
    showToast('Lỗi kết nối, vui lòng thử lại', 'error');
  }
};

// Show toast (fallback if not defined in app.js)
if (typeof showToast !== 'function') {
  window.showToast = function(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all transform ${
      type === 'success' ? 'bg-green-500 text-white' : 
      type === 'error' ? 'bg-red-500 text-white' : 
      type === 'warning' ? 'bg-yellow-500 text-white' :
      'bg-gray-800 text-white'
    }`;
    toast.innerHTML = `<div class="flex items-center gap-2"><i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>${message}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };
}

// Xử lý checkout - lưu các sản phẩm được chọn vào key riêng, KHÔNG xóa giỏ hàng gốc
function handleCheckout(e) {
  const checkedItems = getCheckedItems();
  
  if (checkedItems.length === 0) {
    e.preventDefault();
    showToast('Vui lòng chọn ít nhất một sản phẩm để thanh toán', 'warning');
    return false;
  }
  
  // Lưu các sản phẩm được chọn vào key RIÊNG để checkout page sử dụng
  // KHÔNG ghi đè giỏ hàng gốc
  localStorage.setItem('checkout_items', JSON.stringify(checkedItems));
  
  return true;
}

// Thêm event listener cho nút checkout (được gọi từ initEventListeners)
function initCheckoutButton() {
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', handleCheckout);
  }
}

