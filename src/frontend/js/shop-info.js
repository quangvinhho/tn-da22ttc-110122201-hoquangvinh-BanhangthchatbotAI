/* ============================================
   SHOP-INFO.JS - QuangHưng Mobile
   Data + helper trung tâm cho "cửa hàng thực tế":
     - Hệ thống chi nhánh
     - Giờ mở/đóng real-time
     - Live counter "đang xem / vừa mua"
     - Mock tracking đơn (GHN/GHTK)
   Dữ liệu tĩnh, không cần bảng DB mới.
   ============================================ */
(function () {
  'use strict';

  // ===== THÔNG TIN DOANH NGHIỆP =====
  const COMPANY = {
    name: 'CÔNG TY TNHH QuangHưng Mobile',
    shortName: 'QuangHưng Mobile',
    tagline: 'Uy tín - Chất lượng - Giá tốt',
    taxCode: '0312345678',          // MST (demo)
    businessLicense: '41A8123456 - Sở KH&ĐT TP.HCM cấp ngày 15/03/2018',
    hotline: '0355 745 120',
    hotlineSale: '0355 745 120',
    hotlineWarranty: '0355 745 120',
    email: 'cskh@quanghungmobile.vn',
    website: 'quanghungmobile.vn',
    facebook: 'https://facebook.com/quanghungmobile',
    youtube: 'https://youtube.com/@quanghungmobile',
    zalo: 'https://zalo.me/quanghungmobile',
    tiktok: 'https://tiktok.com/@quanghungmobile'
  };

  // ===== HỆ THỐNG CHI NHÁNH =====
  // Mỗi chi nhánh có giờ làm việc tuần (0=CN, 1-6=T2..T7)
  const BRANCHES = [
    {
      id: 'cn-tphcm',
      name: 'Chi nhánh TP. Hồ Chí Minh (Trụ sở)',
      address: '123 Nguyễn Văn Cừ, P. Cầu Kho, Q.1, TP.HCM',
      phone: '028 3838 1234',
      email: 'hcm@quanghungmobile.vn',
      lat: 10.7626, lng: 106.6907,
      mapEmbed: 'https://www.google.com/maps?q=Nguyen+Van+Cu+Quan+1+TPHCM&output=embed',
      hours: { 1: [8, 21], 2: [8, 21], 3: [8, 21], 4: [8, 21], 5: [8, 21], 6: [8, 21], 0: [8, 20] },
      services: ['Bán hàng', 'Bảo hành', 'Đổi cũ lấy mới', 'Trả góp']
    },
    {
      id: 'cn-hanoi',
      name: 'Chi nhánh Hà Nội',
      address: '456 Cầu Giấy, Q. Cầu Giấy, Hà Nội',
      phone: '024 3939 5678',
      email: 'hn@quanghungmobile.vn',
      lat: 21.0285, lng: 105.8542,
      mapEmbed: 'https://www.google.com/maps?q=Cau+Giay+Ha+Noi&output=embed',
      hours: { 1: [8, 21], 2: [8, 21], 3: [8, 21], 4: [8, 21], 5: [8, 21], 6: [8, 21], 0: [8, 20] },
      services: ['Bán hàng', 'Bảo hành', 'Trả góp']
    },
    {
      id: 'cn-dnang',
      name: 'Chi nhánh Đà Nẵng',
      address: '78 Nguyễn Văn Linh, Q. Hải Châu, Đà Nẵng',
      phone: '0236 3737 4567',
      email: 'dn@quanghungmobile.vn',
      lat: 16.0544, lng: 108.2022,
      mapEmbed: 'https://www.google.com/maps?q=Nguyen+Van+Linh+Da+Nang&output=embed',
      hours: { 1: [8, 21], 2: [8, 21], 3: [8, 21], 4: [8, 21], 5: [8, 21], 6: [8, 21], 0: [8, 20] },
      services: ['Bán hàng', 'Bảo hành']
    }
  ];

  // ===== HELPERS =====

  // Trả {open: boolean, openAt: string|null, closeAt: string|null}
  function getStoreStatus(branch, now) {
    now = now || new Date();
    const dow = now.getDay();
    const h = now.getHours() + now.getMinutes() / 60;
    const today = branch.hours[dow];
    if (!today) return { open: false, openAt: null, closeAt: null };
    const [start, end] = today;
    if (h >= start && h < end) {
      return { open: true, openAt: `${start}:00`, closeAt: `${end}:00` };
    }
    return { open: false, openAt: `${start}:00`, closeAt: `${end}:00` };
  }

  // Trạng thái chuỗi (mở ít nhất 1 chi nhánh)
  function getChainStatus() {
    const statuses = BRANCHES.map(b => getStoreStatus(b));
    const anyOpen = statuses.some(s => s.open);
    return {
      open: anyOpen,
      label: anyOpen ? 'Đang mở cửa' : 'Đã đóng cửa',
      // giờ mở cửa "phổ biến" để hiển thị nhanh
      hoursLabel: '08:00 - 21:00 (T2-T7), 08:00 - 20:00 (CN)'
    };
  }

  // Tồn kho theo chi nhánh — mock dựa product.id để ổn định giữa các reload
  function getStockByBranch(productId, baseStock) {
    productId = Number(productId) || 0;
    baseStock = Math.max(0, Number(baseStock) || 0);
    if (baseStock === 0) {
      return BRANCHES.map(b => ({ branchId: b.id, name: b.name, stock: 0 }));
    }
    // Phân bổ ổn định bằng hash đơn giản
    const seeds = [
      (productId * 7 + 3) % 11,
      (productId * 11 + 5) % 9,
      (productId * 5 + 7) % 7
    ];
    const sum = seeds.reduce((a, b) => a + b, 0) || 1;
    const portions = seeds.map(s => Math.max(1, Math.floor(baseStock * s / sum)));
    // Đảm bảo tổng <= baseStock
    let remaining = baseStock;
    return BRANCHES.map((b, i) => {
      const s = Math.min(portions[i], remaining);
      remaining -= s;
      return { branchId: b.id, name: b.name, stock: s };
    });
  }

  // Live counter "X người đang xem" — giả lập ổn định trong phiên
  function getViewerCount(productId, min, max) {
    min = min || 8;
    max = max || 47;
    const key = `viewers_${productId}_${new Date().toISOString().slice(0, 13)}`;
    let count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (!count) {
      const seed = ((Number(productId) || 1) * 9973) % (max - min);
      count = min + seed + Math.floor(Math.random() * 5);
      sessionStorage.setItem(key, String(count));
    }
    return count;
  }

  // "Vừa mua" — số đơn giả lập trong 7 ngày dựa product id
  function getRecentSoldCount(productId) {
    const seed = ((Number(productId) || 1) * 1543) % 80;
    return 12 + seed;
  }

  // Mã vận đơn giả lập GHN
  function generateTrackingCode(orderId) {
    const ts = Date.now().toString(36).toUpperCase();
    const oid = String(orderId || 'X').padStart(6, '0');
    return `GHN${oid}${ts.slice(-4)}`;
  }

  // Ước tính ngày giao
  function estimateDelivery(daysAhead) {
    daysAhead = daysAhead || 3;
    const d = new Date(Date.now() + daysAhead * 86400000);
    return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Format VND
  function vnd(n) {
    n = Number(n) || 0;
    return n.toLocaleString('vi-VN') + 'đ';
  }

  // ===== ESTIMATE TRADE-IN VALUE (đổi cũ lấy mới) =====
  // brand, ageYears, condition: 'tot' / 'kha' / 'xau'
  function estimateTradeInValue(originalPrice, ageYears, condition) {
    originalPrice = Math.max(0, Number(originalPrice) || 0);
    ageYears = Math.max(0, Number(ageYears) || 0);
    const depreciation = Math.min(0.7, ageYears * 0.18); // tối đa 70%
    const condFactor = condition === 'tot' ? 1 : condition === 'kha' ? 0.85 : 0.6;
    const value = Math.round(originalPrice * (1 - depreciation) * condFactor / 100000) * 100000;
    return Math.max(value, 200000); // tối thiểu 200k để khuyến khích
  }

  // ===== INSTALLMENT (trả góp) =====
  // Tính số tiền trả mỗi tháng — lãi suất giả định
  function calcInstallment(price, months, downPaymentRate) {
    price = Math.max(0, Number(price) || 0);
    months = Math.max(1, Number(months) || 12);
    downPaymentRate = downPaymentRate == null ? 0.3 : downPaymentRate;
    const down = Math.round(price * downPaymentRate);
    const principal = price - down;
    const rate = 0.012; // 1.2% / tháng
    const monthly = Math.round(principal * (rate + 1 / months));
    return { downPayment: down, monthly, totalInterest: monthly * months - principal, months };
  }

  // ===== MEMBERSHIP TIER =====
  // Dựa tổng chi tiêu (đọc từ localStorage / có thể tính từ orders)
  const MEMBERSHIP_TIERS = [
    { code: 'standard', name: 'Thành viên', minSpend: 0, discount: 0, color: '#9ca3af', icon: 'fa-id-card' },
    { code: 'silver', name: 'Bạc', minSpend: 10_000_000, discount: 2, color: '#94a3b8', icon: 'fa-medal' },
    { code: 'gold', name: 'Vàng', minSpend: 30_000_000, discount: 4, color: '#eab308', icon: 'fa-medal' },
    { code: 'platinum', name: 'Bạch kim', minSpend: 80_000_000, discount: 6, color: '#0ea5e9', icon: 'fa-crown' },
    { code: 'vip', name: 'Kim cương', minSpend: 200_000_000, discount: 8, color: '#a855f7', icon: 'fa-gem' }
  ];

  function getMembershipTier(totalSpend) {
    totalSpend = Number(totalSpend) || 0;
    let tier = MEMBERSHIP_TIERS[0];
    for (const t of MEMBERSHIP_TIERS) {
      if (totalSpend >= t.minSpend) tier = t;
    }
    return tier;
  }

  // ===== EXPORT =====
  window.SHOP_INFO = {
    COMPANY,
    BRANCHES,
    MEMBERSHIP_TIERS,
    getStoreStatus,
    getChainStatus,
    getStockByBranch,
    getViewerCount,
    getRecentSoldCount,
    generateTrackingCode,
    estimateDelivery,
    estimateTradeInValue,
    calcInstallment,
    getMembershipTier,
    vnd
  };
})();
