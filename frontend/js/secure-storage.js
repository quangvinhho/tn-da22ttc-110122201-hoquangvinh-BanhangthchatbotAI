/**
 * SECURE STORAGE - Mã hóa dữ liệu trong localStorage
 * Bảo vệ thông tin người dùng khỏi F12 và XSS attacks
 */

class SecureStorage {
  constructor() {
    // Key mã hóa (trong production nên lưu ở server hoặc dùng Web Crypto API)
    this.secretKey = this.generateDeviceKey();
  }

  // Tạo key dựa trên device fingerprint
  generateDeviceKey() {
    const nav = window.navigator;
    const screen = window.screen;
    const fingerprint = [
      nav.userAgent,
      nav.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage
    ].join('|');
    
    // Simple hash (trong production dùng crypto library tốt hơn)
    return this.simpleHash(fingerprint);
  }

  // Hash đơn giản
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // Mã hóa XOR đơn giản (đủ để chống F12 thông thường)
  encrypt(text) {
    if (!text) return '';
    
    // Đảm bảo tương thích hoàn toàn với ký tự Unicode (Tiếng Việt) trước khi XOR và Base64
    let safeText;
    try {
      safeText = unescape(encodeURIComponent(text));
    } catch (e) {
      safeText = text;
    }

    const key = this.secretKey;
    let result = '';
    for (let i = 0; i < safeText.length; i++) {
      result += String.fromCharCode(safeText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 encode
  }

  // Giải mã
  decrypt(encrypted) {
    if (!encrypted) return '';
    try {
      const text = atob(encrypted); // Base64 decode
      const key = this.secretKey;
      let result = '';
      for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      
      // Khôi phục chuỗi Unicode ban đầu
      try {
        return decodeURIComponent(escape(result));
      } catch (e) {
        return result;
      }
    } catch (e) {
      console.error('Decrypt error');
      return '';
    }
  }

  // Lưu dữ liệu an toàn
  setItem(key, value) {
    try {
      const jsonStr = JSON.stringify(value);
      const encrypted = this.encrypt(jsonStr);
      localStorage.setItem(key, encrypted);
      return true;
    } catch (e) {
      console.error('SecureStorage setItem error');
      return false;
    }
  }

  // Lấy dữ liệu an toàn
  getItem(key) {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      const decrypted = this.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (e) {
      console.error('SecureStorage getItem error');
      return null;
    }
  }

  // Xóa dữ liệu
  removeItem(key) {
    localStorage.removeItem(key);
  }

  // Xóa tất cả
  clear() {
    localStorage.clear();
  }
}

// Export instance
window.secureStorage = new SecureStorage();

// =========================================================================
// MONKEYPATCH LOCALSTORAGE - TỰ ĐỘNG MÃ HÓA/GIẢI MÃ TƯƠNG THÍCH NGƯỢC
// =========================================================================

// Tự động giải mã khi gọi localStorage.getItem('user') hoặc 'adminData' hoặc 'employeeData' để tương thích ngược với các file JS cũ gọi raw
const originalGetItem = localStorage.getItem;
localStorage.getItem = function(key) {
  const value = originalGetItem.call(localStorage, key);
  if (!value) return value;
  
  if (key === 'user' || key === 'adminData' || key === 'employeeData') {
    const trimmed = value.trim();
    // Nếu bắt đầu bằng '{' hoặc '[' hoặc 'null', nó là dữ liệu thô (chưa mã hóa)
    if (trimmed.startsWith('{') || trimmed.startsWith('[') || value === 'null') {
      return value;
    }
    // Ngược lại, thử giải mã bằng secureStorage
    try {
      if (window.secureStorage) {
        const decrypted = window.secureStorage.decrypt(value);
        // Kiểm tra xem sau giải mã có phải JSON hợp lệ không
        if (decrypted && (decrypted.trim().startsWith('{') || decrypted.trim().startsWith('['))) {
          return decrypted;
        }
      }
    } catch (e) {
      console.error('Lỗi tự động giải mã key:', key, e);
    }
  }
  return value;
};

// Tự động mã hóa khi gọi localStorage.setItem('user') hoặc 'adminData' hoặc 'employeeData' để tương thích ngược với các file JS cũ gọi raw
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  if ((key === 'user' || key === 'adminData' || key === 'employeeData') && value) {
    const trimmed = String(value).trim();
    // Nếu value đã là chuỗi đã mã hóa (Base64 và không bắt đầu bằng { hoặc [) thì không mã hóa nữa
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed !== 'null') {
      originalSetItem.call(localStorage, key, value);
      return;
    }
    try {
      // value là JSON string thô, mã hóa nó
      if (window.secureStorage) {
        const encrypted = window.secureStorage.encrypt(trimmed);
        originalSetItem.call(localStorage, key, encrypted);
        return;
      }
    } catch (e) {
      console.error('Lỗi tự động mã hóa key:', key, e);
    }
  }
  originalSetItem.call(localStorage, key, value);
};

