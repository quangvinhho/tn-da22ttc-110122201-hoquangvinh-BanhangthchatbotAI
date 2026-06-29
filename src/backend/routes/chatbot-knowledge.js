const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

const RAG_BASE = 'http://127.0.0.1:8000';

function ragHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_TOKEN) {
    headers['X-Admin-Token'] = process.env.ADMIN_TOKEN;
  }
  return headers;
}

// Gọi sang RAG Service để xóa RAM cache knowledge (nhanh, không rebuild Chroma)
// Dùng cho mọi CRUD knowledge → response tiếp theo lấy nội dung mới ngay.
async function invalidateRAGKnowledgeCache() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${RAG_BASE}/api/cache/invalidate-knowledge`, {
      method: 'POST',
      headers: ragHeaders(),
      signal: controller.signal
    }).finally(() => clearTimeout(t));
    if (response && response.ok && process.env.NODE_ENV !== 'production') {
      console.log('[KB] RAM cache invalidated.');
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[KB] RAG cache invalidate skip (service offline):', e.message);
    }
  }
}

// Đồng bộ vectorstore - nặng (vài giây) → chạy background, không block response
// Có retry 1 lần để bù khi RAG service đang khởi động.
async function syncRAGVectorstore() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15000); // vectorstore rebuild có thể lâu
      const response = await fetch(`${RAG_BASE}/api/reload-vectorstore`, {
        method: 'POST',
        headers: ragHeaders(),
        signal: controller.signal
      }).finally(() => clearTimeout(t));
      if (response && response.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[KB] Vectorstore reloaded (attempt ${attempt}).`);
        }
        return;
      }
    } catch (e) {
      if (attempt === 2 && process.env.NODE_ENV !== 'production') {
        console.log('[KB] Vectorstore reload failed after retry:', e.message);
      }
    }
    if (attempt === 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// Hook chạy sau mỗi CRUD knowledge.
// 1) Cache invalidate (nhanh, đảm bảo data mới có hiệu lực ngay với matcher trong chatbot.js)
// 2) Vectorstore reload (background, để semantic search RAG cũng có dữ liệu mới)
function postKnowledgeChange() {
  invalidateRAGKnowledgeCache();
  syncRAGVectorstore();
}

// Middleware kiểm tra admin
const checkAdmin = (req, res, next) => {
  if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin mới có quyền truy cập' });
  }
  next();
};

// Lấy tất cả knowledge base
router.get('/', checkAdmin, async (req, res) => {
  try {
    const { type, search, is_active } = req.query;

    let query = 'SELECT * FROM chatbot_knowledge WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (search) {
      query += ' AND (title LIKE ? OR content LIKE ? OR keywords LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active);
    }

    query += ' ORDER BY updated_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error getting knowledge:', error);
    res.status(500).json({ error: 'Lỗi lấy dữ liệu' });
  }
});

// Lấy một knowledge item
router.get('/:id', checkAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM chatbot_knowledge WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error getting knowledge item:', error);
    res.status(500).json({ error: 'Lỗi lấy dữ liệu' });
  }
});

// Tạo knowledge mới
router.post('/', checkAdmin, async (req, res) => {
  try {
    const { title, content, type, is_active, keywords } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Nếu admin không nhập keywords, dùng title làm fallback để matcher vẫn hoạt động
    const kw = (keywords && keywords.trim()) ? keywords.trim() : title.trim();

    const [result] = await pool.query(
      'INSERT INTO chatbot_knowledge (title, content, type, is_active, keywords) VALUES (?, ?, ?, ?, ?)',
      [title, content, type || 'faq', is_active !== undefined ? is_active : 1, kw]
    );

    postKnowledgeChange();

    res.json({
      message: 'Thêm thành công',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error creating knowledge:', error);
    res.status(500).json({ error: 'Lỗi thêm dữ liệu' });
  }
});

// Cập nhật knowledge
router.put('/:id', checkAdmin, async (req, res) => {
  try {
    const { title, content, type, is_active, keywords } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }

    const kw = (keywords && keywords.trim()) ? keywords.trim() : title.trim();

    await pool.query(
      'UPDATE chatbot_knowledge SET title = ?, content = ?, type = ?, is_active = ?, keywords = ? WHERE id = ?',
      [title, content, type || 'faq', is_active !== undefined ? is_active : 1, kw, req.params.id]
    );

    postKnowledgeChange();

    res.json({ message: 'Cập nhật thành công' });
  } catch (error) {
    console.error('Error updating knowledge:', error);
    res.status(500).json({ error: 'Lỗi cập nhật dữ liệu' });
  }
});

// Xóa knowledge
router.delete('/:id', checkAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM chatbot_knowledge WHERE id = ?', [req.params.id]);
    postKnowledgeChange();
    res.json({ message: 'Xóa thành công' });
  } catch (error) {
    console.error('Error deleting knowledge:', error);
    res.status(500).json({ error: 'Lỗi xóa dữ liệu' });
  }
});

// Bật/tắt knowledge
router.patch('/:id/toggle', checkAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE chatbot_knowledge SET is_active = NOT is_active WHERE id = ?',
      [req.params.id]
    );
    postKnowledgeChange();
    res.json({ message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    console.error('Error toggling knowledge:', error);
    res.status(500).json({ error: 'Lỗi cập nhật trạng thái' });
  }
});

// Thống kê
router.get('/stats/summary', checkAdmin, async (req, res) => {
  try {
    const [total] = await pool.query('SELECT COUNT(*) as count FROM chatbot_knowledge');
    const [active] = await pool.query('SELECT COUNT(*) as count FROM chatbot_knowledge WHERE is_active = 1');
    const [byType] = await pool.query('SELECT type, COUNT(*) as count FROM chatbot_knowledge GROUP BY type');

    res.json({
      total: total[0].count,
      active: active[0].count,
      inactive: total[0].count - active[0].count,
      byType: byType
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Lỗi lấy thống kê' });
  }
});

// Reload RAG vectorstore thủ công (cho UI admin có nút "Đồng bộ thủ công")
router.post('/reload-vectorstore', checkAdmin, async (req, res) => {
  try {
    const response = await fetch(`${RAG_BASE}/api/reload-vectorstore`, {
      method: 'POST',
      headers: ragHeaders()
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ message: 'Đã reload vectorstore thành công', data });
    } else {
      res.status(502).json({ error: 'Python RAG service phản hồi lỗi.' });
    }
  } catch (error) {
    console.error('Error reloading vectorstore:', error && error.message);
    res.status(502).json({ error: 'Lỗi kết nối Python RAG service. Đảm bảo service đang chạy.' });
  }
});

module.exports = router;
