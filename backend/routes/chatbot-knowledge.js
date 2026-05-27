const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Gọi sang RAG Service để đồng bộ dữ liệu auto
async function syncRAGKnowledge() {
    try {
        const response = await fetch('http://127.0.0.1:8000/api/reload-vectorstore', { method: 'POST' });
        if (response.ok) {
            console.log('Đã tự động đồng bộ RAG Vectorstore');
        }
    } catch (error) {
        console.log('RAG service hiện không chạy, bỏ qua đồng bộ tự động.');
    }
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
      query += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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
    const { title, content, type, is_active } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO chatbot_knowledge (title, content, type, is_active) VALUES (?, ?, ?, ?)',
      [title, content, type || 'faq', is_active !== undefined ? is_active : 1]
    );
    
    syncRAGKnowledge(); // Tự động đồng bộ
    
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
    const { title, content, type, is_active } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    
    await pool.query(
      'UPDATE chatbot_knowledge SET title = ?, content = ?, type = ?, is_active = ? WHERE id = ?',
      [title, content, type || 'faq', is_active !== undefined ? is_active : 1, req.params.id]
    );
    
    syncRAGKnowledge(); // Tự động đồng bộ
    
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
    syncRAGKnowledge(); // Tự động đồng bộ
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
    syncRAGKnowledge(); // Tự động đồng bộ
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

// Reload RAG vectorstore
router.post('/reload-vectorstore', checkAdmin, async (req, res) => {
  try {
    // Gọi Python RAG service để reload vectorstore
    const response = await fetch('http://127.0.0.1:8000/api/reload-vectorstore', {
      method: 'POST'
    });
    
    if (response.ok) {
      const data = await response.json();
      res.json({ message: 'Đã reload vectorstore thành công', data });
    } else {
      res.status(500).json({ error: 'Python RAG service không phản hồi' });
    }
  } catch (error) {
    console.error('Error reloading vectorstore:', error);
    res.status(500).json({ error: 'Lỗi kết nối Python RAG service. Đảm bảo service đang chạy.' });
  }
});

module.exports = router;
