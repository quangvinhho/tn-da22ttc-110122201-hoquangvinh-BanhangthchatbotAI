/**
 * Real-time Notification Popup System
 * Hiển thị popup thông báo mới ngay lập tức như Messenger/Facebook
 */

class NotificationPopup {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || 'http://localhost:3000/api';
    this.userId = null;
    this.lastNotificationId = null;
    this.pollInterval = options.pollInterval || 10000; // 10 giây check 1 lần
    this.pollTimer = null;
    this.shownNotifications = new Set(); // Lưu các thông báo đã hiển thị
    this.soundEnabled = options.soundEnabled !== false;
    
    this.init();
  }

  init() {
    this.loadUserInfo();
    
    if (this.userId) {
      this.createPopupContainer();
      this.createStyles();
      this.loadLastNotificationId();
      this.startPolling();
      
      // Phát âm thanh test khi khởi tạo (optional)
      // this.playSound();
    }
  }

  loadUserInfo() {
    try {
      const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      if (isLoggedIn && user && user.ma_kh) {
        this.userId = user.ma_kh;
      }
    } catch (e) {
      console.log('NotificationPopup: Error loading user', e);
    }
  }

  loadLastNotificationId() {
    const saved = localStorage.getItem(`lastNotifId_${this.userId}`);
    if (saved) {
      this.lastNotificationId = parseInt(saved);
    }
  }

  saveLastNotificationId(id) {
    this.lastNotificationId = id;
    localStorage.setItem(`lastNotifId_${this.userId}`, id.toString());
  }

  createPopupContainer() {
    if (document.getElementById('notification-popup-container')) return;
    
    const container = document.createElement('div');
    container.id = 'notification-popup-container';
    container.className = 'fixed top-24 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none';
    document.body.appendChild(container);
  }

  createStyles() {
    if (document.getElementById('notification-popup-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'notification-popup-styles';
    style.textContent = `
      .notif-popup {
        pointer-events: auto;
        animation: slideInRight 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        transform-origin: right center;
      }
      
      .notif-popup.hiding {
        animation: slideOutRight 0.3s ease forwards;
      }
      
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%) scale(0.8);
        }
        to {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
      
      @keyframes slideOutRight {
        from {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateX(100%) scale(0.8);
        }
      }
      
      .notif-popup-shine {
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        animation: shine 2s ease-in-out infinite;
      }
      
      @keyframes shine {
        0% { left: -100%; }
        50%, 100% { left: 100%; }
      }
      
      .notif-popup-pulse {
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3); }
        50% { box-shadow: 0 4px 30px rgba(220, 38, 38, 0.5); }
      }
    `;
    document.head.appendChild(style);
  }

  async checkNewNotifications() {
    if (!this.userId) return;

    try {
      const res = await fetch(`${this.apiUrl}/notifications/user/${this.userId}?limit=5&unread_only=true`);
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        // Lọc các thông báo mới chưa hiển thị
        const newNotifications = data.data.filter(n => {
          const isNew = !this.shownNotifications.has(n.ma_thong_bao);
          const isNewerThanLast = !this.lastNotificationId || n.ma_thong_bao > this.lastNotificationId;
          return isNew && isNewerThanLast && !n.da_doc;
        });

        // Hiển thị popup cho từng thông báo mới
        for (const notif of newNotifications.reverse()) {
          this.showPopup(notif);
          this.shownNotifications.add(notif.ma_thong_bao);
        }

        // Cập nhật badge số thông báo trong dropdown menu
        if (typeof updateDropdownNotificationBadge === 'function') {
          updateDropdownNotificationBadge(data.unread_count || data.data.length);
        }

        // Cập nhật lastNotificationId
        if (data.data.length > 0) {
          const maxId = Math.max(...data.data.map(n => n.ma_thong_bao));
          if (!this.lastNotificationId || maxId > this.lastNotificationId) {
            this.saveLastNotificationId(maxId);
          }
        }
      }
    } catch (error) {
      console.error('NotificationPopup: Error checking notifications', error);
    }
  }

  showPopup(notification) {
    const container = document.getElementById('notification-popup-container');
    if (!container) return;

    // Phát âm thanh
    if (this.soundEnabled) {
      this.playSound();
    }

    const icon = this.getIcon(notification.loai);
    const iconBg = this.getIconBg(notification.loai);
    
    const popup = document.createElement('div');
    popup.className = 'notif-popup bg-white rounded-2xl shadow-2xl overflow-hidden notif-popup-pulse';
    popup.innerHTML = `
      <div class="notif-popup-shine"></div>
      <div class="bg-gradient-to-r ${this.getGradient(notification.loai)} p-3 text-white relative">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <i class="fas ${icon}"></i>
          </div>
          <span class="font-bold text-sm">Thông báo mới</span>
          <button onclick="this.closest('.notif-popup').remove()" class="ml-auto w-6 h-6 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition text-xs">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="p-4 cursor-pointer hover:bg-gray-50 transition" onclick="notificationPopup.handlePopupClick(${notification.ma_thong_bao}, '${notification.lien_ket || ''}', this)">
        <h4 class="font-bold text-gray-800 mb-1 line-clamp-1">${this.escapeHtml(notification.tieu_de)}</h4>
        <p class="text-gray-600 text-sm line-clamp-2">${this.escapeHtml(notification.noi_dung)}</p>
        <p class="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <i class="far fa-clock"></i> Vừa xong
        </p>
      </div>
      <div class="px-4 pb-3 flex gap-2">
        <button onclick="notificationPopup.handlePopupClick(${notification.ma_thong_bao}, '${notification.lien_ket || ''}', this)" class="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition">
          <i class="fas fa-eye mr-1"></i> Xem ngay
        </button>
        <button onclick="notificationPopup.dismissPopup(this)" class="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
          Để sau
        </button>
      </div>
    `;

    container.appendChild(popup);

    // Tự động ẩn sau 8 giây
    setTimeout(() => {
      if (popup.parentNode) {
        popup.classList.add('hiding');
        setTimeout(() => popup.remove(), 300);
      }
    }, 8000);
  }

  handlePopupClick(id, link, element) {
    // Đánh dấu đã đọc
    fetch(`${this.apiUrl}/notifications/${id}/read`, { method: 'PUT' }).catch(() => {});
    
    // Xóa popup
    const popup = element.closest('.notif-popup');
    if (popup) {
      popup.classList.add('hiding');
      setTimeout(() => popup.remove(), 300);
    }

    // Chuyển trang nếu có link
    if (link) {
      window.location.href = link;
    } else {
      window.location.href = 'profile.html#notifications';
    }
  }

  dismissPopup(element) {
    const popup = element.closest('.notif-popup');
    if (popup) {
      popup.classList.add('hiding');
      setTimeout(() => popup.remove(), 300);
    }
  }

  playSound() {
    try {
      // Tạo âm thanh notification đơn giản bằng Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Tạo oscillator cho âm thanh "ding"
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // Note A5
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // Thêm note thứ 2 cho hiệu ứng "ding dong"
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        
        osc2.frequency.setValueAtTime(1174.66, audioContext.currentTime); // Note D6
        osc2.type = 'sine';
        
        gain2.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.4);
      }, 150);
    } catch (e) {
      console.log('NotificationPopup: Cannot play sound', e);
    }
  }

  getIcon(type) {
    const icons = {
      'contact_response': 'fa-reply',
      'order_update': 'fa-box',
      'promotion': 'fa-gift',
      'system': 'fa-info-circle'
    };
    return icons[type] || 'fa-bell';
  }

  getIconBg(type) {
    const bgs = {
      'contact_response': 'bg-purple-500',
      'order_update': 'bg-green-500',
      'promotion': 'bg-yellow-500',
      'system': 'bg-blue-500'
    };
    return bgs[type] || 'bg-red-500';
  }

  getGradient(type) {
    const gradients = {
      'contact_response': 'from-purple-500 to-purple-600',
      'order_update': 'from-green-500 to-green-600',
      'promotion': 'from-yellow-500 to-orange-500',
      'system': 'from-blue-500 to-blue-600'
    };
    return gradients[type] || 'from-red-500 to-red-600';
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  startPolling() {
    // Check ngay lập tức
    setTimeout(() => this.checkNewNotifications(), 2000);
    
    // Sau đó check định kỳ
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.checkNewNotifications(), this.pollInterval);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // Hiển thị popup thủ công (có thể gọi từ bên ngoài)
  showManualPopup(title, content, type = 'system', link = null) {
    this.showPopup({
      ma_thong_bao: Date.now(),
      tieu_de: title,
      noi_dung: content,
      loai: type,
      lien_ket: link
    });
  }
}

// Global instance
let notificationPopup = null;

// Khởi tạo khi DOM ready
function initNotificationPopup() {
  if (notificationPopup) return;
  
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  
  if (isLoggedIn && user && user.ma_kh) {
    notificationPopup = new NotificationPopup({
      apiUrl: 'http://localhost:3000/api',
      pollInterval: 10000, // Check mỗi 10 giây
      soundEnabled: true
    });
  }
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotificationPopup);
} else {
  initNotificationPopup();
}
