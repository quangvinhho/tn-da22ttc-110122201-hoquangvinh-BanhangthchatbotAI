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
        
        const tbody = document.getElementById('knowledgeList');
        
        if (data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <h3>Chưa có dữ liệu</h3>
                            <p>Hãy thêm knowledge đầu tiên cho chatbot</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = data.map(item => {
            const typeLabels = {
                'store_info': 'Thông tin cửa hàng',
                'faq': 'FAQ',
                'policy': 'Chính sách'
            };
            
            const typeBadge = `badge-${item.type}`;
            const statusBadge = item.is_active ? 'badge-active' : 'badge-inactive';
            const statusText = item.is_active ? 'Hoạt động' : 'Tạm dừng';
            
            return `
                <tr>
                    <td>${item.id}</td>
                    <td><strong>${escapeHtml(item.question)}</strong></td>
                    <td>${escapeHtml(truncate(item.answer, 100))}</td>
                    <td><span class="badge ${typeBadge}">${typeLabels[item.type]}</span></td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                    <td>
                        <div class="actions">
                            <button class="btn btn-primary" onclick="editKnowledge(${item.id})">✏️ Sửa</button>
                            <button class="btn ${item.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleKnowledge(${item.id})">
                                ${item.is_active ? '⏸️' : '▶️'}
                            </button>
                            <button class="btn btn-danger" onclick="deleteKnowledge(${item.id})">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading knowledge:', error);
        alert('Lỗi tải dữ liệu');
    }
}

// Mở modal thêm
function openModal() {
    document.getElementById('modalTitle').textContent = 'Thêm Knowledge';
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
        
        document.getElementById('modalTitle').textContent = 'Sửa Knowledge';
        document.getElementById('knowledgeId').value = data.id;
        document.getElementById('question').value = data.question;
        document.getElementById('answer').value = data.answer;
        document.getElementById('type').value = data.type;
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
    const data = {
        question: document.getElementById('question').value,
        answer: document.getElementById('answer').value,
        type: document.getElementById('type').value,
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
    
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Đang đồng bộ...';
    
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
        btn.disabled = false;
        btn.textContent = '🔄 Đồng bộ RAG';
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

// Tìm kiếm khi nhấn Enter
document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        loadKnowledge();
    }
});
