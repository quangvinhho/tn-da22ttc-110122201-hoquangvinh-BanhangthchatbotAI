// Sử dụng API_URL đã được khai báo ở admin.html (fallback nếu chưa có)
if (typeof API_URL === 'undefined') {
    window.API_URL = 'http://localhost:3000/api';
}

// Show/hide loading overlay
function showLoading() {
    const overlay = document.getElementById('page-loader');
    if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
    const overlay = document.getElementById('page-loader');
    if (overlay) overlay.classList.add('hidden');
}

// Kiểm tra đăng nhập admin
async function checkAdminAuth() {
    showLoading();
    try {
        const response = await fetch(`${API_URL}/auth/check`, {
            credentials: 'include'
        });
        
        console.log('Auth check response status:', response.status);
        
        if (!response.ok) {
            console.error('Auth check failed with status:', response.status);
            hideLoading();
            alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!');
            window.location.href = 'admin-login.html';
            return false;
        }
        
        const data = await response.json();
        console.log('Auth data received:', JSON.stringify(data, null, 2));
        
        if (!data.isAuthenticated) {
            hideLoading();
            alert('Bạn cần đăng nhập để truy cập trang này!');
            window.location.href = 'admin-login.html';
            return false;
        }
        
        if (!data.user) {
            hideLoading();
            alert('Không tìm thấy thông tin người dùng!');
            window.location.href = 'admin-login.html';
            return false;
        }
        
        console.log('User role:', data.user.vai_tro);
        
        if (data.user.vai_tro !== 'admin') {
            hideLoading();
            alert('Chỉ admin mới có quyền truy cập trang này!');
            window.location.href = 'index.html';
            return false;
        }
        
        console.log('Auth check passed! User is admin.');
        hideLoading();
        return true;
    } catch (error) {
        console.error('Error checking auth:', error);
        hideLoading();
        alert('Lỗi kiểm tra đăng nhập: ' + error.message);
        window.location.href = 'admin-login.html';
        return false;
    }
}

// Load thống kê
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/chatbot-knowledge/stats/summary`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        document.getElementById('totalCount').textContent = data.total || 0;
        document.getElementById('activeCount').textContent = data.active || 0;
        document.getElementById('inactiveCount').textContent = data.inactive || 0;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load danh sách knowledge
async function loadKnowledge() {
    try {
        const search = document.getElementById('searchInput').value;
        const type = document.getElementById('typeFilter').value;
        const is_active = document.getElementById('statusFilter').value;
        
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (type) params.append('type', type);
        if (is_active) params.append('is_active', is_active);
        
        const response = await fetch(`${API_URL}/chatbot-knowledge?${params}`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        const grid = document.getElementById('knowledgeList');
        
        if (data.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <svg class="mx-auto h-12 w-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <h3 class="font-bold text-slate-700 mb-1">Chưa có tài liệu tri thức</h3>
                    <p class="text-sm text-slate-500">Hãy thêm khối tài liệu tri thức đầu tiên để chatbot có thể tự động học!</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = data.map(item => {
            const typeLabels = {
                'store_info': 'Thông tin cửa hàng',
                'faq': 'FAQ',
                'policy': 'Chính sách'
            };
            
            const typeBadges = {
                'store_info': 'bg-blue-50 text-blue-700 border border-blue-100',
                'faq': 'bg-emerald-50 text-emerald-700 border border-emerald-100',
                'policy': 'bg-amber-50 text-amber-700 border border-amber-100'
            };
            
            const statusText = item.is_active ? 'Hoạt động' : 'Tạm dừng';
            
            const dateObj = new Date(item.updated_at || item.created_at);
            const formattedDate = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + dateObj.toLocaleDateString('vi-VN');
            
            return `
                <div class="bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100 transition-all flex flex-col p-6 relative overflow-hidden group">
                    <!-- Card Header -->
                    <div class="flex justify-between items-start gap-4 mb-4">
                        <span class="text-xs font-semibold px-2.5 py-1 rounded-lg ${typeBadges[item.type] || 'bg-slate-100 text-slate-700'}">
                            ${typeLabels[item.type] || 'Khác'}
                        </span>
                        <span class="text-xs text-slate-400 font-medium">ID: ${item.id}</span>
                    </div>
                    
                    <!-- Card Title -->
                    <h3 class="font-bold text-slate-800 text-base mb-3 group-hover:text-blue-600 transition-colors line-clamp-2" title="${escapeHtml(item.title)}">
                        ${escapeHtml(item.title)}
                    </h3>
                    
                    <!-- Card Content -->
                    <p class="text-sm text-slate-600 leading-relaxed mb-6 flex-1 line-clamp-4 whitespace-pre-line">
                        ${escapeHtml(item.content)}
                    </p>
                    
                    <!-- Card Footer -->
                    <div class="flex justify-between items-center pt-4 border-t border-slate-50 mt-auto">
                        <div class="flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full ${item.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}"></span>
                            <span class="text-xs font-semibold text-slate-500">${statusText}</span>
                        </div>
                        <div class="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                            <i class="far fa-clock"></i> Cập nhật: ${formattedDate}
                        </div>
                    </div>
                    
                    <!-- Quick Action Overlay/Bar -->
                    <div class="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5 bg-white/95 backdrop-filter backdrop-blur-sm p-1 rounded-xl shadow-lg border border-slate-100">
                        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 transition-colors" onclick="editKnowledge(${item.id})" title="Sửa tài liệu">
                            <i class="fas fa-pencil-alt text-xs"></i>
                        </button>
                        <button class="w-8 h-8 rounded-lg flex items-center justify-center ${item.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'} transition-colors" onclick="toggleKnowledge(${item.id})" title="${item.is_active ? 'Tạm dừng' : 'Kích hoạt'}">
                            <i class="fas ${item.is_active ? 'fa-pause' : 'fa-play'} text-xs"></i>
                        </button>
                        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 transition-colors" onclick="deleteKnowledge(${item.id})" title="Xóa tài liệu">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading knowledge:', error);
        alert('Lỗi tải dữ liệu');
    }
}

// Mở modal thêm
function openModal() {
    document.getElementById('modalTitle').textContent = 'Thêm Tài liệu Tri thức';
    document.getElementById('knowledgeForm').reset();
    document.getElementById('knowledgeId').value = '';
    document.getElementById('isActive').checked = true;
    document.getElementById('knowledgeModal').classList.add('active');
}

// Đóng modal
function closeModal() {
    document.getElementById('knowledgeModal').classList.remove('active');
}

// Sửa knowledge
async function editKnowledge(id) {
    try {
        const response = await fetch(`${API_URL}/chatbot-knowledge/${id}`, {
            credentials: 'include'
        });
        const data = await response.json();

        document.getElementById('modalTitle').textContent = 'Sửa Tài liệu Tri thức';
        document.getElementById('knowledgeId').value = data.id;
        document.getElementById('title').value = data.title;
        document.getElementById('content').value = data.content;
        document.getElementById('type').value = data.type;
        const kwInput = document.getElementById('keywords');
        if (kwInput) kwInput.value = data.keywords || '';
        document.getElementById('isActive').checked = data.is_active === 1;
        document.getElementById('knowledgeModal').classList.add('active');
    } catch (error) {
        console.error('Error loading knowledge:', error);
        alert('Lỗi tải dữ liệu');
    }
}

// Lưu knowledge
async function saveKnowledge(event) {
    event.preventDefault();

    const id = document.getElementById('knowledgeId').value;
    const kwInput = document.getElementById('keywords');
    const data = {
        title: document.getElementById('title').value,
        content: document.getElementById('content').value,
        type: document.getElementById('type').value,
        keywords: kwInput ? kwInput.value : '',
        is_active: document.getElementById('isActive').checked ? 1 : 0
    };

    try {
        const url = id ? `${API_URL}/chatbot-knowledge/${id}` : `${API_URL}/chatbot-knowledge`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.message);
            closeModal();
            loadKnowledge();
            loadStats();
        } else {
            alert(result.error || 'Có lỗi xảy ra');
        }
    } catch (error) {
        console.error('Error saving knowledge:', error);
        alert('Lỗi lưu dữ liệu');
    }
}

// Bật/tắt knowledge
async function toggleKnowledge(id) {
    if (!confirm('Bạn có chắc muốn thay đổi trạng thái?')) return;
    
    try {
        const response = await fetch(`${API_URL}/chatbot-knowledge/${id}/toggle`, {
            method: 'PATCH',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            loadKnowledge();
            loadStats();
        } else {
            alert(result.error || 'Có lỗi xảy ra');
        }
    } catch (error) {
        console.error('Error toggling knowledge:', error);
        alert('Lỗi cập nhật trạng thái');
    }
}

// Xóa knowledge
async function deleteKnowledge(id) {
    if (!confirm('Bạn có chắc muốn xóa knowledge này?')) return;
    
    try {
        const response = await fetch(`${API_URL}/chatbot-knowledge/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            loadKnowledge();
            loadStats();
        } else {
            alert(result.error || 'Có lỗi xảy ra');
        }
    } catch (error) {
        console.error('Error deleting knowledge:', error);
        alert('Lỗi xóa dữ liệu');
    }
}

// Reload vectorstore
async function reloadVectorstore() {
    if (!confirm('Đồng bộ dữ liệu với RAG AI? Quá trình này có thể mất vài giây.')) return;
    
    const btn = document.getElementById('syncRagBtn') || event?.target;
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Đang đồng bộ...';
    }
    
    try {
        const response = await fetch(`${API_URL}/chatbot-knowledge/reload-vectorstore`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('✅ ' + result.message);
        } else {
            alert('❌ ' + (result.error || 'Có lỗi xảy ra'));
        }
    } catch (error) {
        console.error('Error reloading vectorstore:', error);
        alert('❌ Lỗi kết nối. Đảm bảo Python RAG service đang chạy (port 8000)');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Đồng bộ RAG';
        }
    }
}

// Helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, length) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

// Đóng modal khi click bên ngoài
document.getElementById('knowledgeModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// Khởi tạo
function initChatbotKnowledge() {
    loadStats();
    loadKnowledge();
}

// Nếu truy cập trực tiếp trang cũ (fallback)
if (window.location.pathname.includes('chatbot-knowledge.html')) {
    checkAdminAuth().then(isAuth => {
        if (isAuth) {
            initChatbotKnowledge();
        }
    });
}

// Khởi tạo tự động nếu đang ở trang admin và tab chatbot-rag được hiển thị
if (window.location.pathname.includes('admin.html')) {
    const isActive = window.location.hash === '#chatbot-rag' || 
                     document.getElementById('section-chatbot-rag')?.classList.contains('active');
    if (isActive) {
        initChatbotKnowledge();
    }
}

// Tìm kiếm khi nhấn Enter
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loadKnowledge();
        }
    });
}
