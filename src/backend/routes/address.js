const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// ===== LẤY ĐỊA CHỈ MẶC ĐỊNH (Phải đặt TRƯỚC route /:maKh) =====
router.get('/:maKh/default', async (req, res) => {
  try {
    const { maKh } = req.params;
    
    const [rows] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang 
       WHERE ma_kh = ? AND mac_dinh = 1 
       LIMIT 1`,
      [maKh]
    );
    
    if (rows.length === 0) {
      // Nếu không có địa chỉ mặc định, lấy địa chỉ đầu tiên
      const [firstAddr] = await pool.query(
        `SELECT * FROM dia_chi_nhan_hang 
         WHERE ma_kh = ? 
         ORDER BY ngay_tao DESC 
         LIMIT 1`,
        [maKh]
      );
      
      res.json({
        success: true,
        data: firstAddr[0] || null
      });
      return;
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Error getting default address:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy địa chỉ mặc định'
    });
  }
});

// ===== LẤY DANH SÁCH ĐỊA CHỈ CỦA KHÁCH HÀNG =====
router.get('/:maKh', async (req, res) => {
  try {
    const { maKh } = req.params;
    
    const [rows] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang 
       WHERE ma_kh = ? 
       ORDER BY mac_dinh DESC, ngay_tao DESC`,
      [maKh]
    );
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Error getting addresses:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách địa chỉ'
    });
  }
});

// ===== THÊM ĐỊA CHỈ MỚI =====
router.post('/', async (req, res) => {
  try {
    const {
      ma_kh,
      ho_ten_nguoi_nhan,
      so_dien_thoai,
      tinh_thanh,
      quan_huyen,
      phuong_xa,
      dia_chi_cu_the,
      loai_dia_chi = 'nha_rieng',
      mac_dinh = 0
    } = req.body;
    
    // Validate required fields
    if (!ma_kh || !ho_ten_nguoi_nhan || !so_dien_thoai || !tinh_thanh || !quan_huyen || !phuong_xa || !dia_chi_cu_the) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin'
      });
    }
    
    // Nếu là địa chỉ mặc định, bỏ mặc định của các địa chỉ khác
    if (mac_dinh) {
      await pool.query(
        `UPDATE dia_chi_nhan_hang SET mac_dinh = 0 WHERE ma_kh = ?`,
        [ma_kh]
      );
    }
    
    // Kiểm tra nếu đây là địa chỉ đầu tiên, tự động set mặc định
    const [existingAddresses] = await pool.query(
      `SELECT COUNT(*) as count FROM dia_chi_nhan_hang WHERE ma_kh = ?`,
      [ma_kh]
    );
    
    const isFirstAddress = existingAddresses[0].count === 0;
    const finalMacDinh = isFirstAddress ? 1 : mac_dinh;
    
    // Insert địa chỉ mới
    const [result] = await pool.query(
      `INSERT INTO dia_chi_nhan_hang 
       (ma_kh, ho_ten_nguoi_nhan, so_dien_thoai, tinh_thanh, quan_huyen, phuong_xa, dia_chi_cu_the, loai_dia_chi, mac_dinh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ma_kh, ho_ten_nguoi_nhan, so_dien_thoai, tinh_thanh, quan_huyen, phuong_xa, dia_chi_cu_the, loai_dia_chi, finalMacDinh]
    );
    
    // Lấy địa chỉ vừa tạo
    const [newAddress] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang WHERE ma_dia_chi = ?`,
      [result.insertId]
    );
    
    res.json({
      success: true,
      message: 'Thêm địa chỉ thành công',
      data: newAddress[0]
    });
  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm địa chỉ'
    });
  }
});

// ===== CẬP NHẬT ĐỊA CHỈ =====
router.put('/:maDiaChi', async (req, res) => {
  try {
    const { maDiaChi } = req.params;
    const {
      ho_ten_nguoi_nhan,
      so_dien_thoai,
      tinh_thanh,
      quan_huyen,
      phuong_xa,
      dia_chi_cu_the,
      loai_dia_chi,
      mac_dinh
    } = req.body;
    
    // Lấy thông tin địa chỉ hiện tại
    const [currentAddr] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang WHERE ma_dia_chi = ?`,
      [maDiaChi]
    );
    
    if (currentAddr.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ'
      });
    }
    
    // Nếu set mặc định, bỏ mặc định của các địa chỉ khác
    if (mac_dinh) {
      await pool.query(
        `UPDATE dia_chi_nhan_hang SET mac_dinh = 0 WHERE ma_kh = ?`,
        [currentAddr[0].ma_kh]
      );
    }
    
    // Update địa chỉ
    await pool.query(
      `UPDATE dia_chi_nhan_hang SET
        ho_ten_nguoi_nhan = ?,
        so_dien_thoai = ?,
        tinh_thanh = ?,
        quan_huyen = ?,
        phuong_xa = ?,
        dia_chi_cu_the = ?,
        loai_dia_chi = ?,
        mac_dinh = ?
       WHERE ma_dia_chi = ?`,
      [ho_ten_nguoi_nhan, so_dien_thoai, tinh_thanh, quan_huyen, phuong_xa, dia_chi_cu_the, loai_dia_chi, mac_dinh ? 1 : 0, maDiaChi]
    );
    
    // Lấy địa chỉ đã update
    const [updatedAddress] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang WHERE ma_dia_chi = ?`,
      [maDiaChi]
    );
    
    res.json({
      success: true,
      message: 'Cập nhật địa chỉ thành công',
      data: updatedAddress[0]
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật địa chỉ'
    });
  }
});

// ===== XÓA ĐỊA CHỈ =====
router.delete('/:maDiaChi', async (req, res) => {
  try {
    const { maDiaChi } = req.params;
    
    // Lấy thông tin địa chỉ trước khi xóa
    const [address] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang WHERE ma_dia_chi = ?`,
      [maDiaChi]
    );
    
    if (address.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ'
      });
    }
    
    const wasDefault = address[0].mac_dinh === 1;
    const maKh = address[0].ma_kh;
    
    // Xóa địa chỉ
    await pool.query(
      `DELETE FROM dia_chi_nhan_hang WHERE ma_dia_chi = ?`,
      [maDiaChi]
    );
    
    // Nếu địa chỉ bị xóa là mặc định, set địa chỉ đầu tiên còn lại làm mặc định
    if (wasDefault) {
      await pool.query(
        `UPDATE dia_chi_nhan_hang 
         SET mac_dinh = 1 
         WHERE ma_kh = ? 
         ORDER BY ngay_tao DESC 
         LIMIT 1`,
        [maKh]
      );
    }
    
    res.json({
      success: true,
      message: 'Xóa địa chỉ thành công'
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa địa chỉ'
    });
  }
});

// ===== SET ĐỊA CHỈ MẶC ĐỊNH =====
router.put('/:maDiaChi/set-default', async (req, res) => {
  try {
    const { maDiaChi } = req.params;
    
    // Lấy thông tin địa chỉ
    const [address] = await pool.query(
      `SELECT * FROM dia_chi_nhan_hang WHERE ma_dia_chi = ?`,
      [maDiaChi]
    );
    
    if (address.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa chỉ'
      });
    }
    
    // Bỏ mặc định của tất cả địa chỉ khác
    await pool.query(
      `UPDATE dia_chi_nhan_hang SET mac_dinh = 0 WHERE ma_kh = ?`,
      [address[0].ma_kh]
    );
    
    // Set địa chỉ này làm mặc định
    await pool.query(
      `UPDATE dia_chi_nhan_hang SET mac_dinh = 1 WHERE ma_dia_chi = ?`,
      [maDiaChi]
    );
    
    res.json({
      success: true,
      message: 'Đã đặt làm địa chỉ mặc định'
    });
  } catch (error) {
    console.error('Error setting default address:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi đặt địa chỉ mặc định'
    });
  }
});

module.exports = router;
