-- Migration: Add trang_thai column to khach_hang table
-- This column allows admin to lock/unlock customer accounts

ALTER TABLE khach_hang 
ADD COLUMN trang_thai ENUM('active', 'locked') DEFAULT 'active' AFTER ngay_tao;

-- Update existing customers to have 'active' status
UPDATE khach_hang SET trang_thai = 'active' WHERE trang_thai IS NULL;
