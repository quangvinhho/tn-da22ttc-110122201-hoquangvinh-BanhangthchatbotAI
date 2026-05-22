/**
 * Admin Auto-Save & Offline Support
 * Xử lý lưu nháp dữ liệu form vào LocalStorage và hiển thị cảnh báo khi mất mạng.
 */

const adminAutoSave = {
    prefix: 'adminDraft_',
    isOffline: !navigator.onLine,
    
    init: function() {
        // Lắng nghe sự kiện input/change trên các form có data-autosave-id
        document.addEventListener('input', this.handleInput.bind(this));
        document.addEventListener('change', this.handleInput.bind(this));
        
        // Lắng nghe mạng
        window.addEventListener('online', this.handleNetworkChange.bind(this));
        window.addEventListener('offline', this.handleNetworkChange.bind(this));
        
        // Tạo DOM Banner Mất Mạng nếu chưa có
        this.createOfflineBanner();
        this.handleNetworkChange(); // check initial state
        
        // Khôi phục trạng thái giao diện (tab, modal)
        this.patchUIState();
    },
    
    patchUIState: function() {
        // 1. Lưu và khôi phục tab (section)
        if (typeof window.showSection === 'function') {
            const origShowSection = window.showSection;
            window.showSection = function(sectionId) {
                sessionStorage.setItem('adminActiveSection', sectionId);
                origShowSection(sectionId);
            };
        }
        
        // 2. Lưu và khôi phục modal
        const modals = ['Product', 'Brand', 'Promotion', 'News'];
        modals.forEach(name => {
            const showFn = 'showAdd' + name + 'Modal';
            const editFn = 'edit' + name;
            const closeFn = 'close' + name + 'Modal';
            
            // Hàm mở thêm mới
            if (typeof window[showFn] === 'function') {
                const origShow = window[showFn];
                window[showFn] = function() {
                    sessionStorage.setItem('adminActiveModal', showFn);
                    sessionStorage.removeItem('adminActiveEditId');
                    origShow();
                };
            }
            
            // Hàm mở sửa
            if (typeof window[editFn] === 'function') {
                const origEdit = window[editFn];
                window[editFn] = function(id) {
                    sessionStorage.setItem('adminActiveModal', editFn);
                    sessionStorage.setItem('adminActiveEditId', id);
                    origEdit(id);
                };
            }
            
            // Hàm đóng
            if (typeof window[closeFn] === 'function') {
                const origClose = window[closeFn];
                window[closeFn] = function() {
                    sessionStorage.removeItem('adminActiveModal');
                    sessionStorage.removeItem('adminActiveEditId');
                    origClose();
                };
            }
        });
        
        // 3. Thực hiện khôi phục khi trang vừa tải xong
        setTimeout(() => {
            // Khôi phục tab
            const activeSection = sessionStorage.getItem('adminActiveSection');
            if (activeSection && typeof window.showSection === 'function') {
                window.showSection(activeSection);
            }
            
            // Khôi phục modal
            setTimeout(() => {
                const activeModal = sessionStorage.getItem('adminActiveModal');
                const editId = sessionStorage.getItem('adminActiveEditId');
                
                if (activeModal && typeof window[activeModal] === 'function') {
                    if (editId) {
                        window[activeModal](editId); // Mở dạng sửa
                    } else {
                        window[activeModal](); // Mở dạng thêm mới
                    }
                }
            }, 500); // Đợi tab load dữ liệu xong mới mở modal
        }, 100);
    },
    
    // Lấy ID form dựa trên target (nếu có nằm trong form có data-autosave-id)
    getFormElement: function(target) {
        return target.closest('form[data-autosave-id]');
    },
    
    handleInput: function(e) {
        const form = this.getFormElement(e.target);
        if (!form) return;
        
        const formId = form.getAttribute('data-autosave-id');
        this.saveDraft(formId, form);
    },
    
    saveDraft: function(formId, form) {
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            // Bỏ qua file inputs (không lưu được object File vào localStorage)
            const inputElement = form.querySelector(`[name="${key}"], [id="${key}"]`);
            if (inputElement && inputElement.type === 'file') continue;
            
            // Xử lý các trường hợp mảng (như checkbox/select multiple)
            if (data[key]) {
                if (!Array.isArray(data[key])) {
                    data[key] = [data[key]];
                }
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }
        
        // Thêm các trường đặc biệt không có thuộc tính name nhưng có id (thường dùng trong form cũ)
        const inputs = form.querySelectorAll('input:not([type="file"]), textarea, select');
        inputs.forEach(input => {
            const id = input.id;
            if (id && !input.name) {
                // Chỉ lấy các giá trị thực tế
                if (input.type === 'checkbox' || input.type === 'radio') {
                    data[id] = input.checked;
                } else {
                    data[id] = input.value;
                }
            }
        });
        
        data._timestamp = new Date().getTime();
        localStorage.setItem(this.prefix + formId, JSON.stringify(data));
        console.log(`Đã lưu nháp cho form: ${formId}`);
    },
    
    restoreDraft: function(formId, formElement) {
        const draftJSON = localStorage.getItem(this.prefix + formId);
        if (!draftJSON) return false;
        
        try {
            const data = JSON.parse(draftJSON);
            
            const inputs = formElement.querySelectorAll('input:not([type="file"]), textarea, select');
            inputs.forEach(input => {
                const key = input.name || input.id;
                if (data[key] !== undefined) {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = data[key];
                    } else {
                        input.value = data[key];
                    }
                }
            });
            
            // Trigger change event for elements that might rely on it
            inputs.forEach(input => {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            console.log(`Đã phục hồi nháp cho form: ${formId}`);
            return true;
        } catch (e) {
            console.error('Lỗi khi khôi phục bản nháp:', e);
            return false;
        }
    },
    
    clearDraft: function(formId) {
        localStorage.removeItem(this.prefix + formId);
        console.log(`Đã xóa bản nháp cho form: ${formId}`);
    },
    
    checkDraftExists: function(formId) {
        return localStorage.getItem(this.prefix + formId) !== null;
    },
    
    // Gắn vào hàm showModal của ứng dụng để hiển thị gợi ý khôi phục
    promptRestore: function(formId, formElement, containerElement) {
        if (!this.checkDraftExists(formId)) {
            // Xóa prompt cũ nếu có
            const oldPrompt = containerElement.querySelector('.draft-prompt-banner');
            if (oldPrompt) oldPrompt.remove();
            return;
        }
        
        const draft = JSON.parse(localStorage.getItem(this.prefix + formId));
        const timeStr = new Date(draft._timestamp).toLocaleTimeString('vi-VN');
        
        // Tạo prompt UI
        let promptEl = containerElement.querySelector('.draft-prompt-banner');
        if (!promptEl) {
            promptEl = document.createElement('div');
            promptEl.className = 'draft-prompt-banner mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between';
            formElement.parentNode.insertBefore(promptEl, formElement);
        }
        
        promptEl.innerHTML = `
            <div class="flex items-center gap-2 text-blue-700 text-sm">
                <i class="fas fa-info-circle"></i>
                <span>Bạn có một bản nháp được lưu lúc <b>${timeStr}</b>.</span>
            </div>
            <div class="flex gap-2">
                <button type="button" class="px-3 py-1 bg-white border border-blue-300 text-blue-600 rounded text-xs hover:bg-blue-50 transition-colors btn-restore-draft">Khôi phục</button>
                <button type="button" class="px-3 py-1 bg-white border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-50 transition-colors btn-clear-draft">Xóa nháp</button>
            </div>
        `;
        
        promptEl.querySelector('.btn-restore-draft').addEventListener('click', () => {
            this.restoreDraft(formId, formElement);
            promptEl.remove();
        });
        
        promptEl.querySelector('.btn-clear-draft').addEventListener('click', () => {
            this.clearDraft(formId);
            promptEl.remove();
        });
    },
    
    // Xử lý mạng
    createOfflineBanner: function() {
        if (document.getElementById('offline-banner')) return;
        
        const banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.className = 'fixed top-0 left-0 w-full z-[9999] py-2 px-4 text-center font-medium transition-transform duration-300 transform -translate-y-full';
        banner.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        document.body.appendChild(banner);
    },
    
    handleNetworkChange: function() {
        this.isOffline = !navigator.onLine;
        const banner = document.getElementById('offline-banner');
        
        if (this.isOffline) {
            banner.innerHTML = '<i class="fas fa-wifi-slash mr-2"></i> Mất kết nối Internet! Hệ thống đang lưu nháp tạm thời, vui lòng không tải lại trang.';
            banner.className = 'fixed top-0 left-0 w-full z-[9999] py-2 px-4 text-center font-medium transition-transform duration-300 transform translate-y-0 bg-red-500 text-white';
            this.disableSubmitButtons(true);
        } else {
            banner.innerHTML = '<i class="fas fa-wifi mr-2"></i> Đã kết nối lại Internet. Bạn có thể tiếp tục công việc.';
            banner.className = 'fixed top-0 left-0 w-full z-[9999] py-2 px-4 text-center font-medium transition-transform duration-300 transform translate-y-0 bg-emerald-500 text-white';
            this.disableSubmitButtons(false);
            
            // Ẩn banner xanh sau 3 giây
            setTimeout(() => {
                if (!this.isOffline) {
                    banner.classList.remove('translate-y-0');
                    banner.classList.add('-translate-y-full');
                }
            }, 3000);
        }
    },
    
    disableSubmitButtons: function(disable) {
        // Tìm tất cả các button có chức năng lưu/submit trong modal
        const buttons = document.querySelectorAll('button[type="submit"], [onclick^="save"], [onclick^="update"]');
        buttons.forEach(btn => {
            // Không vô hiệu hóa nút hủy/đóng
            if (btn.innerText.toLowerCase().includes('đóng') || btn.innerText.toLowerCase().includes('hủy')) return;
            
            if (disable) {
                if (!btn.hasAttribute('data-original-text')) {
                    btn.setAttribute('data-original-text', btn.innerHTML);
                }
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Đang chờ mạng...';
            } else {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                if (btn.hasAttribute('data-original-text')) {
                    btn.innerHTML = btn.getAttribute('data-original-text');
                }
            }
        });
    }
};

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    adminAutoSave.init();
});
