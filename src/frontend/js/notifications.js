/**
 * Notifications Page JavaScript
 * Trang thông báo kiểu tin nhắn
 */



let allNotifications = [];
let currentFilter = 'all';
let currentPage = 1;
let hasMore = false;
const ITEMS_PER_PAGE = 20;

// Khởi tạo khi trang load
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadNotifications();
});

// Kiểm tra đăng nhập
function checkAuth() {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  
  if (!isLoggedIn || !user) {
    window.location.href = 'login.html?redirect=notifications.html';
    return false;
  }
  return true;
}

// Lấy thông tin user
function getUser() {
  return JSON.parse(localStorage.getItem('user') || 'null');
}

// Load thông báo từ API
async function loadNotifications(append = false) {
  const user = getUser();
  if (!user || !user.ma_kh) return;
  
  if (!append) {
    showLoading();
  }
  
  try {
    const response = await fetch(`${API_URL}/notifications/user/${user.ma_kh}?limit=100`);
    const data = await response.json();
    
    if (data.success) {
      allNotifications = data.data || [];
      updateUnreadCount(data.unread_count || 0);
      renderNotifications();
    } else {
      showEmpty();
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
    showEmpty();
  }
}

// Hiển thị loading
function showLoading() {
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
}

// Hiển thị empty state
function showEmpty() {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('load-more-container').classList.add('hidden');
}

// Cập nhật số thông báo chưa đọc
function updateUnreadCount(count) {
  const mainBadge = document.getElementById('unread-count');
  if (mainBadge) mainBadge.textContent = count;
  
  const sidebarBadge = document.getElementById('sidebar-notification-badge');
  if (sidebarBadge) {
    sidebarBadge.textContent = count;
    if (count > 0) {
      sidebarBadge.classList.remove('hidden');
    } else {
      sidebarBadge.classList.add('hidden');
    }
  }
}

// Lọc thông báo
function filterNotifications(filter) {
  currentFilter = filter;
  
  // Update active tab
  document.querySelectorAll('.filter-tab').forEach(tab => {
    if (tab.dataset.filter === filter) {
      tab.classList.add('active');
      tab.classList.remove('bg-white', 'border');
    } else {
      tab.classList.remove('active');
      tab.classList.add('bg-white', 'border');
    }
  });
  
  renderNotifications();
}

// Render danh sách thông báo
function renderNotifications() {
  const container = document.getElementById('notifications-list');
  document.getElementById('loading-state').classList.add('hidden');
  
  // Lọc theo filter
  let filtered = allNotifications;
  
  if (currentFilter === 'unread') {
    filtered = allNotifications.filter(n => !n.da_doc);
  } else if (currentFilter !== 'all') {
    filtered = allNotifications.filter(n => n.loai === currentFilter);
  }
  
  if (filtered.length === 0) {
    showEmpty();
    container.innerHTML = '';
    return;
  }
  
  document.getElementById('empty-state').classList.add('hidden');
  
  // Group by date
  const grouped = groupByDate(filtered);
  
  let html = '';
  
  for (const [date, notifications] of Object.entries(grouped)) {
    html += `
      <div class="mb-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="h-px bg-gray-300 flex-1"></div>
          <span class="text-sm text-gray-500 font-medium px-3 py-1 bg-gray-100 rounded-full">${date}</span>
          <div class="h-px bg-gray-300 flex-1"></div>
        </div>
        <div class="space-y-3">
          ${notifications.map((n, i) => renderNotificationItem(n, i)).join('')}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// Group thông báo theo ngày
function groupByDate(notifications) {
  const groups = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  notifications.forEach(n => {
    const date = new Date(n.ngay_tao);
    date.setHours(0, 0, 0, 0);
    
    let key;
    if (date.getTime() === today.getTime()) {
      key = 'Hôm nay';
    } else if (date.getTime() === yesterday.getTime()) {
      key = 'Hôm qua';
    } else {
      key = date.toLocaleDateString('vi-VN', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'numeric',
        year: 'numeric'
      });
    }
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });
  
  return groups;
}

// Render một thông báo
function renderNotificationItem(notification, index) {
  const isUnread = !notification.da_doc;
  const icon = getNotificationIcon(notification.loai);
  const bubbleClass = getBubbleClass(notification.loai);
  const time = formatTime(notification.ngay_tao);
  
  return `
    <div class="notification-item ${isUnread ? 'unread' : 'read'} bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md"
         style="animation-delay: ${index * 0.05}s"
         onclick="openNotification(${notification.ma_thong_bao})">
      <div class="flex gap-4">
        <!-- Avatar/Icon -->
        <div class="flex-shrink-0">
          <div class="w-12 h-12 rounded-full flex items-center justify-center ${icon.bg}">
            <i class="${icon.icon} text-white text-lg"></i>
          </div>
        </div>
        
        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2 mb-1">
            <h4 class="font-semibold text-gray-800 ${isUnread ? '' : 'font-normal'} line-clamp-1">
              ${escapeHtml(notification.tieu_de)}
            </h4>
            ${isUnread ? '<span class="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-2"></span>' : ''}
          </div>
          
          <!-- Message Bubble -->
          <div class="message-bubble ${bubbleClass}">
            <p class="text-gray-600 text-sm line-clamp-2">${escapeHtml(notification.noi_dung)}</p>
          </div>
          
          <!-- Time & Actions -->
          <div class="flex items-center justify-between mt-2">
            <span class="text-xs text-gray-400">
              <i class="far fa-clock mr-1"></i>${time}
            </span>
            <div class="flex items-center gap-2">
              ${notification.lien_ket ? `
                <a href="${notification.lien_ket}" onclick="event.stopPropagation()" class="text-xs text-red-600 hover:underline">
                  <i class="fas fa-external-link-alt mr-1"></i>Xem
                </a>
              ` : ''}
              <button onclick="event.stopPropagation(); deleteNotification(${notification.ma_thong_bao})" 
                      class="text-xs text-gray-400 hover:text-red-500 transition">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Lấy icon theo loại thông báo
function getNotificationIcon(type) {
  const icons = {
    'order_update': { icon: 'fas fa-box', bg: 'bg-green-500' },
    'promotion': { icon: 'fas fa-gift', bg: 'bg-yellow-500' },
    'contact_response': { icon: 'fas fa-reply', bg: 'bg-purple-500' },
    'system': { icon: 'fas fa-info-circle', bg: 'bg-blue-500' }
  };
  return icons[type] || { icon: 'fas fa-bell', bg: 'bg-red-500' };
}

// Lấy class cho bubble theo loại
function getBubbleClass(type) {
  const classes = {
    'order_update': 'order',
    'promotion': 'promo',
    'contact_response': 'contact',
    'system': 'system'
  };
  return classes[type] || '';
}

// Format thời gian
function formatTime(dateStr) {
  if (!dateStr) return '';
  
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (hours < 24) return `${hours} giờ trước`;
  if (days < 7) return `${days} ngày trước`;
  
  return date.toLocaleDateString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit'
  });
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Mở chi tiết thông báo
async function openNotification(id) {
  const notification = allNotifications.find(n => n.ma_thong_bao === id);
  if (!notification) return;
  
  // Đánh dấu đã đọc
  if (!notification.da_doc) {
    await markAsRead(id);
  }
  
  // Hiển thị modal
  const modal = document.getElementById('notification-modal');
  const icon = getNotificationIcon(notification.loai);
  
  document.getElementById('modal-icon').innerHTML = `<i class="${icon.icon}"></i>`;
  document.getElementById('modal-title').textContent = notification.tieu_de;
  document.getElementById('modal-time').textContent = formatTime(notification.ngay_tao);
  document.getElementById('modal-content').innerHTML = `
    <p class="whitespace-pre-wrap">${escapeHtml(notification.noi_dung)}</p>
  `;
  
  const linkBtn = document.getElementById('modal-link');
  if (notification.lien_ket) {
    linkBtn.href = notification.lien_ket;
    linkBtn.classList.remove('hidden');
  } else {
    linkBtn.classList.add('hidden');
  }
  
  modal.classList.remove('hidden');
}

// Đóng modal
function closeNotificationModal() {
  document.getElementById('notification-modal').classList.add('hidden');
}

// Đánh dấu đã đọc
async function markAsRead(id) {
  try {
    await fetch(`${API_URL}/notifications/${id}/read`, { method: 'PUT' });
    
    // Update local data
    const notification = allNotifications.find(n => n.ma_thong_bao === id);
    if (notification && !notification.da_doc) {
      notification.da_doc = 1;
      const currentCount = parseInt(document.getElementById('unread-count').textContent);
      updateUnreadCount(Math.max(0, currentCount - 1));
      renderNotifications();
    }
  } catch (error) {
    console.error('Error marking as read:', error);
  }
}

// Đánh dấu tất cả đã đọc
async function markAllAsRead() {
  const user = getUser();
  if (!user) return;
  
  try {
    await fetch(`${API_URL}/notifications/read-all/${user.ma_kh}`, { method: 'PUT' });
    
    // Update local data
    allNotifications.forEach(n => n.da_doc = 1);
    updateUnreadCount(0);
    renderNotifications();
    
    // Show toast
    showToast('Đã đánh dấu tất cả là đã đọc', 'success');
  } catch (error) {
    console.error('Error marking all as read:', error);
    showToast('Có lỗi xảy ra', 'error');
  }
}

// Xóa thông báo
async function deleteNotification(id) {
  if (!confirm('Bạn có chắc muốn xóa thông báo này?')) return;
  
  try {
    await fetch(`${API_URL}/notifications/${id}`, { method: 'DELETE' });
    
    // Remove from local data
    const index = allNotifications.findIndex(n => n.ma_thong_bao === id);
    if (index > -1) {
      const wasUnread = !allNotifications[index].da_doc;
      allNotifications.splice(index, 1);
      
      if (wasUnread) {
        const currentCount = parseInt(document.getElementById('unread-count').textContent);
        updateUnreadCount(Math.max(0, currentCount - 1));
      }
      
      renderNotifications();
    }
    
    showToast('Đã xóa thông báo', 'success');
  } catch (error) {
    console.error('Error deleting notification:', error);
    showToast('Có lỗi xảy ra', 'error');
  }
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${
    type === 'success' ? 'bg-green-500 text-white' : 
    type === 'error' ? 'bg-red-500 text-white' : 
    'bg-gray-800 text-white'
  }`;
  toast.style.cssText = 'animation: slideUp 0.3s ease; transition: all 0.3s ease;';
  
  const icon = type === 'success' ? 'fa-check-circle' : 
               type === 'error' ? 'fa-exclamation-circle' : 
               'fa-info-circle';
  
  toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  document.body.appendChild(toast);
  
  // Add animation keyframes if not exists
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Load more notifications
function loadMoreNotifications() {
  currentPage++;
  loadNotifications(true);
}

// Close modal on outside click
document.getElementById('notification-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'notification-modal') {
    closeNotificationModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNotificationModal();
  }
});
