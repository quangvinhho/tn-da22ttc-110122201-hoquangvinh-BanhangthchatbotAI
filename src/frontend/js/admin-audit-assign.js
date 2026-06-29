/**
 * admin-audit-assign.js
 * Chức năng bổ sung cho Admin Dashboard:
 *   - Audit Logs (Lịch sử hoạt động)
 *   - Order Assignment (Phân công đơn hàng)
 *   - Review Reply & Hide/Show
 *   - Inactivity Timeout (15 phút)
 *   - Employee Permission Hiding
 *   - Last Login Info Display
 */
(function() {
  'use strict';

  const API_URL = window.API_URL || '/api';

  // ==================== 1. INACTIVITY TIMEOUT (15 phút) ====================
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 phút
  let idleTimer = null;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      alert('⏰ Phiên đăng nhập đã hết hạn do không hoạt động trong 15 phút. Vui lòng đăng nhập lại.');
      if (typeof logout === 'function') {
        logout();
      } else {
        window.location.href = 'admin-login.html';
      }
    }, IDLE_TIMEOUT_MS);
  }

  // Track user activity
  ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
    document.addEventListener(event, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();

  // ==================== 2. EMPLOYEE PERMISSION HIDING ====================
  function applyEmployeePermissions() {
    const adminData = window.adminData || JSON.parse(sessionStorage.getItem('adminData') || localStorage.getItem('adminData') || '{}');
    if (!adminData || !adminData.isEmployee) return;

    // Ẩn các menu nhạy cảm cho nhân viên
    const hiddenNavIds = ['nav-employees', 'nav-audit-logs'];
    hiddenNavIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Ẩn nút xóa khách hàng, xem lương
    document.querySelectorAll('[data-superadmin-only]').forEach(el => {
      el.style.display = 'none';
    });

    console.log('[Permission] Employee mode: sensitive menus hidden.');
  }

  // ==================== 3. LAST LOGIN INFO DISPLAY ====================
  function displayLastLoginInfo() {
    const adminData = window.adminData || JSON.parse(sessionStorage.getItem('adminData') || localStorage.getItem('adminData') || '{}');
    if (!adminData) return;

    const infoEl = document.getElementById('last-login-info');
    if (!infoEl) return;

    if (adminData.last_login_at) {
      const loginTime = new Date(adminData.last_login_at).toLocaleString('vi-VN');
      const ip = adminData.last_login_ip || 'N/A';
      infoEl.innerHTML = `<i class="fas fa-clock text-[10px]"></i> ${loginTime}<br><i class="fas fa-globe text-[10px]"></i> IP: ${ip}`;
      infoEl.style.display = 'block';
    }
  }

  // ==================== 4. AUDIT LOGS ====================
  let auditLogPage = 1;

  async function loadAuditLogs(page = 1) {
    auditLogPage = page;
    const tbody = document.getElementById('audit-logs-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải...</td></tr>';

    try {
      const actionFilter = document.getElementById('audit-action-filter')?.value || '';
      const searchFilter = document.getElementById('audit-search-filter')?.value || '';
      const params = new URLSearchParams({ page, limit: 20 });
      if (actionFilter) params.append('action', actionFilter);
      if (searchFilter) params.append('search', searchFilter);

      const res = await fetch(`${API_URL}/admin/audit-logs?${params}`);
      const data = await res.json();
      
      if (data.success) {
        renderAuditLogs(data.data, data.pagination);
      } else {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-red-400">${data.message}</td></tr>`;
      }
    } catch (error) {
      console.error('Error loading audit logs:', error);
      tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-red-400">Lỗi tải dữ liệu</td></tr>';
    }
  }

  function renderAuditLogs(logs, pagination) {
    const tbody = document.getElementById('audit-logs-table-body');
    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400">Chưa có lịch sử hoạt động nào</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const roleColor = log.vai_tro === 'nhanvien' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
      const roleLabel = log.vai_tro === 'nhanvien' ? 'Nhân viên' : 'Admin';
      const time = new Date(log.thoi_gian).toLocaleString('vi-VN');
      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3 text-xs text-slate-400">${log.ma_log}</td>
          <td class="px-4 py-3">
            <div class="font-medium text-sm">${log.ho_ten || 'N/A'}</div>
            <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${roleColor}">${roleLabel}</span>
          </td>
          <td class="px-4 py-3">
            <span class="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">${log.action}</span>
          </td>
          <td class="px-4 py-3 text-sm">${log.doi_tuong || '-'} ${log.doi_tuong_id ? '#' + log.doi_tuong_id : ''}</td>
          <td class="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title="${(log.chi_tiet || '').replace(/"/g, '&quot;')}">${log.chi_tiet || '-'}</td>
          <td class="px-4 py-3 text-xs text-slate-400">${log.ip || '-'}</td>
          <td class="px-4 py-3 text-xs text-slate-500">${time}</td>
        </tr>
      `;
    }).join('');

    // Render pagination
    const paginationEl = document.getElementById('audit-logs-pagination');
    if (paginationEl && pagination) {
      const { page, totalPages } = pagination;
      let paginationHTML = '';
      if (page > 1) {
        paginationHTML += `<button onclick="window._loadAuditLogs(${page - 1})" class="px-3 py-1 border border-slate-200 rounded-lg text-sm hover:bg-slate-100">← Trước</button>`;
      }
      paginationHTML += `<span class="px-3 py-1 text-sm text-slate-500">Trang ${page}/${totalPages} (${pagination.total} bản ghi)</span>`;
      if (page < totalPages) {
        paginationHTML += `<button onclick="window._loadAuditLogs(${page + 1})" class="px-3 py-1 border border-slate-200 rounded-lg text-sm hover:bg-slate-100">Sau →</button>`;
      }
      paginationEl.innerHTML = paginationHTML;
    }
  }

  // ==================== 5. ORDER ASSIGNMENT ====================
  async function assignOrder(orderId) {
    // Fetch danh sách nhân viên
    let employees = [];
    try {
      const res = await fetch(`${API_URL}/admin/employees`);
      const data = await res.json();
      if (data.success) employees = data.data;
    } catch (e) {
      alert('Không thể tải danh sách nhân viên');
      return;
    }

    // Lấy thông tin đơn hàng hiện tại
    const currentOrder = (window.allOrders || []).find(o => o.ma_don == orderId);
    const currentNv = currentOrder?.ma_nv_xu_ly || '';
    const currentNote = currentOrder?.ghi_chu_noi_bo || '';

    const employeeOptions = employees.map(e => 
      `<option value="${e.ma_nv}" ${e.ma_nv == currentNv ? 'selected' : ''}>${e.ho_ten} (${e.tai_khoan})</option>`
    ).join('');

    // Tạo modal động
    const modalHTML = `
      <div id="assign-order-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onclick="if(event.target===this)this.remove()">
        <div class="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden">
          <div class="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
            <h3 class="text-white font-bold text-lg">📋 Phân công Đơn hàng #${orderId}</h3>
          </div>
          <div class="p-6 space-y-4">
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-2">Nhân viên xử lý</label>
              <select id="assign-employee-select" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">-- Không gán --</option>
                ${employeeOptions}
              </select>
            </div>
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-2">Ghi chú nội bộ</label>
              <textarea id="assign-internal-note" rows="3" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Ghi chú cho nhân viên xử lý...">${currentNote}</textarea>
            </div>
            <div class="flex gap-3 justify-end pt-2">
              <button onclick="document.getElementById('assign-order-modal').remove()" class="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Hủy</button>
              <button onclick="window._submitAssignOrder(${orderId})" class="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm">Lưu phân công</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  async function submitAssignOrder(orderId) {
    const ma_nv_xu_ly = document.getElementById('assign-employee-select')?.value || null;
    const ghi_chu_noi_bo = document.getElementById('assign-internal-note')?.value || '';

    try {
      const res = await fetch(`${API_URL}/admin/orders/${orderId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_nv_xu_ly: ma_nv_xu_ly || null, ghi_chu_noi_bo })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(data.message, 'success');
        else alert(data.message);
        document.getElementById('assign-order-modal')?.remove();
        if (typeof loadOrders === 'function') loadOrders();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (e) {
      alert('Lỗi kết nối server');
    }
  }

  // ==================== 6. REVIEW REPLY & HIDE/SHOW ====================
  function showReplyModal(reviewId) {
    const modalHTML = `
      <div id="reply-review-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onclick="if(event.target===this)this.remove()">
        <div class="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[95vw] overflow-hidden">
          <div class="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4">
            <h3 class="text-white font-bold text-lg">💬 Phản hồi đánh giá #${reviewId}</h3>
          </div>
          <div class="p-6">
            <label class="block text-sm font-semibold text-slate-700 mb-2">Nội dung phản hồi</label>
            <textarea id="reply-content" rows="4" class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" placeholder="Nhập phản hồi của cửa hàng..."></textarea>
            <div class="flex gap-3 justify-end mt-4">
              <button onclick="document.getElementById('reply-review-modal').remove()" class="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Hủy</button>
              <button onclick="window._submitReplyReview(${reviewId})" class="px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">Gửi phản hồi</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  async function submitReplyReview(reviewId) {
    const phan_hoi = document.getElementById('reply-content')?.value;
    if (!phan_hoi?.trim()) {
      alert('Vui lòng nhập nội dung phản hồi');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/reviews/${reviewId}/reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phan_hoi: phan_hoi.trim() })
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast('Đã gửi phản hồi thành công!', 'success');
        else alert('Đã gửi phản hồi thành công!');
        document.getElementById('reply-review-modal')?.remove();
        if (typeof loadReviews === 'function') loadReviews();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (e) {
      alert('Lỗi kết nối server');
    }
  }

  async function toggleReviewVisibility(reviewId) {
    try {
      const res = await fetch(`${API_URL}/admin/reviews/${reviewId}/hide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        if (typeof showToast === 'function') showToast(data.message, 'success');
        else alert(data.message);
        if (typeof loadReviews === 'function') loadReviews();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (e) {
      alert('Lỗi kết nối server');
    }
  }

  // ==================== EXPOSE TO GLOBAL SCOPE ====================
  window._loadAuditLogs = loadAuditLogs;
  window._assignOrder = assignOrder;
  window._submitAssignOrder = submitAssignOrder;
  window._showReplyModal = showReplyModal;
  window._submitReplyReview = submitReplyReview;
  window._toggleReviewVisibility = toggleReviewVisibility;

  // ==================== INIT ON PAGE LOAD ====================
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      applyEmployeePermissions();
      displayLastLoginInfo();
    }, 500);
  });

})();
