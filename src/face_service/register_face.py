"""
Script Đăng ký khuôn mặt nhân viên + FaceNet Embedding + YuNet Alignment
========================================================================
Pipeline:
  1. Ảnh nhân viên → YuNet detect & align → U-Net segment (optional) → FaceNet embedding
  2. Lưu embedding vào MySQL (bảng face_embeddings)
"""

import os
import sys
import argparse
import numpy as np
import cv2
import torch
import mysql.connector
from dotenv import load_dotenv
from PIL import Image

# FaceNet từ thư viện facenet-pytorch
from facenet_pytorch import InceptionResnetV1

from model_unet import UNet, segment_face_with_unet

load_dotenv()

# ==================== CONFIG ====================

DB_CONFIG = {
    'host':     os.getenv('DB_HOST', 'localhost'),
    'user':     os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'quanghungmobile'),
    'charset':  'utf8mb4'
}

UNET_WEIGHTS = os.getenv('UNET_WEIGHTS', './weights/unet_face_best.pth')
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
YUNET_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'weights/face_detection_yunet_2023mar.onnx')


# ==================== MODEL LOADING ====================

def load_unet(weights_path, device):
    """Load U-Net đã huấn luyện"""
    model = UNet(n_channels=3, n_classes=1, bilinear=True).to(device)
    if os.path.exists(weights_path):
        checkpoint = torch.load(weights_path, map_location=device)
        model.load_state_dict(checkpoint.get('model_state', checkpoint))
        model.eval()
        print(f"✅ U-Net loaded từ: {weights_path}")
    else:
        print(f"⚠️  Không tìm thấy U-Net weights tại {weights_path}")
        print("   Sẽ dùng U-Net chưa train (chỉ để test pipeline).")
        model.eval()
    return model


def load_facenet(device):
    """
    Load FaceNet (InceptionResnetV1) pretrained trên VGGFace2.
    Output: embedding vector 512-dim.
    """
    model = InceptionResnetV1(pretrained='vggface2').eval().to(device)
    print("✅ FaceNet (InceptionResnetV1 / VGGFace2) loaded.")
    return model


def load_yunet():
    """Load YuNet face detector model và tự động tải nếu thiếu"""
    if not os.path.exists(YUNET_MODEL_PATH):
        os.makedirs(os.path.dirname(YUNET_MODEL_PATH), exist_ok=True)
        print(f"📥 Đang tải YuNet model weights về: {YUNET_MODEL_PATH}...")
        import urllib.request
        url = "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx"
        urllib.request.urlretrieve(url, YUNET_MODEL_PATH)
        print("✅ Đã tải xong YuNet model.")
    
    detector = cv2.FaceDetectorYN.create(
        model=YUNET_MODEL_PATH,
        config="",
        input_size=(320, 320),
        score_threshold=0.8,
        nms_threshold=0.3,
        top_k=5000
    )
    print("✅ YuNet face detector loaded.")
    return detector


# ==================== FACE EMBEDDING ====================

def extract_embedding_from_img(img_bgr, unet_model, facenet_model, detector_yn, device,
                                use_unet=True):
    """
    Pipeline hoàn chỉnh: ảnh BGR → YuNet detect & align → U-Net segment (optional) → FaceNet embedding
    """
    h, w, _ = img_bgr.shape
    
    # 1. Phát hiện khuôn mặt bằng YuNet
    detector_yn.setInputSize((w, h))
    _, faces = detector_yn.detect(img_bgr)
    
    face_img = None
    if faces is not None and len(faces) > 0:
        face = faces[0]
        
        # Căn chỉnh khuôn mặt (Face Alignment) dựa trên mắt
        right_eye = (float(face[4]), float(face[5]))
        left_eye = (float(face[6]), float(face[7]))
        
        dY = left_eye[1] - right_eye[1]
        dX = left_eye[0] - right_eye[0]
        angle = np.degrees(np.arctan2(dY, dX))
        
        eye_center = (float((right_eye[0] + left_eye[0]) / 2), float((right_eye[1] + left_eye[1]) / 2))
        
        # Phép xoay Affine
        M = cv2.getRotationMatrix2D(eye_center, angle, scale=1.0)
        rotated = cv2.warpAffine(img_bgr, M, (w, h))
        
        # Phát hiện lại trên ảnh đã xoay để lấy bounding box thẳng đứng
        detector_yn.setInputSize((w, h))
        _, rotated_faces = detector_yn.detect(rotated)
        
        if rotated_faces is not None and len(rotated_faces) > 0:
            x, y, fw, fh = map(int, rotated_faces[0][0:4])
            # Thêm padding để lấy trọn vẹn khuôn mặt
            pad_w = int(fw * 0.15)
            pad_h = int(fh * 0.15)
            x = max(0, x - pad_w)
            y = max(0, y - pad_h)
            fw = min(w - x, fw + 2 * pad_w)
            fh = min(h - y, fh + 2 * pad_h)
            face_img = rotated[y:y+fh, x:x+fw]
        else:
            # Fallback: crop theo bounding box ban đầu trên rotated
            x, y, fw, fh = map(int, face[0:4])
            x = max(0, x)
            y = max(0, y)
            fw = min(w - x, fw)
            fh = min(h - y, fh)
            face_img = rotated[y:y+fh, x:x+fw]
    else:
        # Fallback nếu không phát hiện được mặt
        face_img = img_bgr

    # Bước U-Net segmentation nếu cần
    if use_unet and unet_model is not None and face_img is not None:
        try:
            face_img = segment_face_with_unet(unet_model, face_img, device,
                                             input_size=256, output_size=None)
        except Exception as e:
            print(f"  ⚠️ U-Net segment error: {e}")

    # Đưa về kích thước 160x160 cho FaceNet
    face_resized = cv2.resize(face_img, (160, 160))
    face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB)
    
    # Chuẩn hóa ảnh về [-1, 1]
    img_norm = (face_rgb.astype(np.float32) / 127.5) - 1.0
    face_tensor = torch.from_numpy(img_norm.transpose(2, 0, 1)).float().to(device)
    
    # Trích xuất embedding bằng FaceNet
    face_tensor = face_tensor.unsqueeze(0)  # (1, 3, 160, 160)
    with torch.no_grad():
        embedding = facenet_model(face_tensor)  # (1, 512)
        
    emb_np = embedding.squeeze().cpu().numpy()
    emb_np = emb_np / (np.linalg.norm(emb_np) + 1e-8)
    return emb_np


def compute_embeddings_from_dir(img_dir, unet_model, facenet_model, detector_yn, device):
    """
    Xử lý nhiều ảnh từ 1 thư mục, lấy embedding trung bình (mean embedding).
    """
    exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    img_files = [f for f in os.listdir(img_dir)
                 if os.path.splitext(f)[1].lower() in exts]

    if not img_files:
        print(f"  ❌ Không tìm thấy ảnh trong: {img_dir}")
        return None

    embeddings = []
    for fname in img_files:
        img_path = os.path.join(img_dir, fname)
        img = cv2.imread(img_path)
        if img is None:
            continue
        try:
            emb = extract_embedding_from_img(img, unet_model, facenet_model, detector_yn, device)
            embeddings.append(emb)
            print(f"  ✓ {fname}")
        except Exception as e:
            print(f"  ✗ {fname}: {e}")

    if not embeddings:
        return None

    # Lấy mean embedding và normalize lại
    mean_emb = np.mean(embeddings, axis=0)
    mean_emb = mean_emb / (np.linalg.norm(mean_emb) + 1e-8)
    print(f"  → {len(embeddings)} ảnh, embedding trung bình đã tính.")
    return mean_emb


# ==================== DATABASE ====================

def ensure_table(cursor):
    """Tạo bảng face_embeddings nếu chưa có"""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS face_embeddings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ma_tai_khoan INT NOT NULL UNIQUE,
            embedding MEDIUMBLOB NOT NULL,
            n_samples INT DEFAULT 1,
            ngay_cap_nhat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (ma_tai_khoan) REFERENCES nhan_vien(ma_nv) ON DELETE CASCADE
        )
    """)


def save_embedding_to_db(ma_tai_khoan, embedding, n_samples=1):
    """Lưu hoặc cập nhật embedding vào MySQL"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        ensure_table(cursor)

        # Serialize embedding thành bytes
        emb_bytes = embedding.astype(np.float32).tobytes()

        cursor.execute("""
            INSERT INTO face_embeddings (ma_tai_khoan, embedding, n_samples)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                embedding = VALUES(embedding),
                n_samples = VALUES(n_samples),
                ngay_cap_nhat = NOW()
        """, (ma_tai_khoan, emb_bytes, n_samples))

        conn.commit()
        cursor.close()
        conn.close()
        print(f"  💾 Đã lưu embedding vào DB — NV ID: {ma_tai_khoan}")
        return True
    except Exception as e:
        print(f"  ❌ Lỗi DB: {e}")
        return False


def load_all_embeddings():
    """Tải tất cả embeddings từ DB để so sánh nhận diện"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT fe.ma_tai_khoan, fe.embedding, nv.ho_ten, nv.tai_khoan as username
            FROM face_embeddings fe
            JOIN nhan_vien nv ON fe.ma_tai_khoan = nv.ma_nv
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        result = []
        for row in rows:
            emb = np.frombuffer(row['embedding'], dtype=np.float32).copy()
            emb = emb / (np.linalg.norm(emb) + 1e-8)  # Re-normalize
            result.append({
                'ma_tai_khoan': row['ma_tai_khoan'],
                'ho_ten': row['ho_ten'],
                'username': row['username'],
                'embedding': emb
            })
        return result
    except Exception as e:
        print(f"❌ Lỗi tải embeddings từ DB: {e}")
        return []


# ==================== RECOGNITION ====================

def recognize_face(query_embedding, db_embeddings, threshold=0.6):
    """
    Nhận diện khuôn mặt bằng Cosine Similarity.
    """
    if not db_embeddings:
        return None, 0.0

    best_match = None
    best_score = -1.0

    for entry in db_embeddings:
        # Cosine similarity
        score = float(np.dot(query_embedding, entry['embedding']))
        if score > best_score:
            best_score = score
            best_match = entry

    if best_score >= threshold:
        return best_match, best_score
    return None, best_score


# ==================== CLI REGISTRATION ====================

def register_single(emp_id, img_path, unet_model, facenet_model, detector_yn, device):
    print(f"\n👤 Đăng ký NV ID {emp_id} từ ảnh: {img_path}")
    img = cv2.imread(img_path)
    if img is None:
        print(f"  ❌ Không đọc được ảnh: {img_path}")
        return False
    emb = extract_embedding_from_img(img, unet_model, facenet_model, detector_yn, device)
    return save_embedding_to_db(emp_id, emb, n_samples=1)


def register_from_dir(emp_id, img_dir, unet_model, facenet_model, detector_yn, device):
    print(f"\n👤 Đăng ký NV ID {emp_id} từ thư mục: {img_dir}")
    emb = compute_embeddings_from_dir(img_dir, unet_model, facenet_model, detector_yn, device)
    if emb is None:
        return False
    exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    n = len([f for f in os.listdir(img_dir) if os.path.splitext(f)[1].lower() in exts])
    return save_embedding_to_db(emp_id, emb, n_samples=n)


def register_bulk(bulk_dir, unet_model, facenet_model, detector_yn, device):
    print(f"\n📁 Đăng ký hàng loạt từ: {bulk_dir}")
    for folder in sorted(os.listdir(bulk_dir)):
        folder_path = os.path.join(bulk_dir, folder)
        if not os.path.isdir(folder_path):
            continue
        try:
            emp_id = int(folder)
        except ValueError:
            print(f"  ⚠️  Bỏ qua folder '{folder}' (tên không phải số)")
            continue
        register_from_dir(emp_id, folder_path, unet_model, facenet_model, detector_yn, device)


# ==================== ENTRY POINT ====================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Đăng ký khuôn mặt nhân viên')
    parser.add_argument('--emp_id',      type=int,   default=None, help='ID nhân viên (ma_nv)')
    parser.add_argument('--img_path',    type=str,   default=None, help='Đường dẫn tới 1 ảnh')
    parser.add_argument('--img_dir',     type=str,   default=None, help='Thư mục nhiều ảnh của 1 NV')
    parser.add_argument('--bulk_dir',    type=str,   default=None, help='Thư mục chứa nhiều NV (sub-folder = ID)')
    parser.add_argument('--unet_weights',type=str,   default=UNET_WEIGHTS)
    parser.add_argument('--threshold',   type=float, default=0.6,  help='Ngưỡng cosine similarity')
    parser.add_argument('--no_unet',     action='store_true', help='Bỏ qua U-Net preprocessing')
    args = parser.parse_args()

    print(f"🖥️  Thiết bị: {DEVICE}")

    # Load models
    unet  = None if args.no_unet else load_unet(args.unet_weights, DEVICE)
    fnet  = load_facenet(DEVICE)
    dyn   = load_yunet()

    if args.bulk_dir:
        register_bulk(args.bulk_dir, unet, fnet, dyn, DEVICE)
    elif args.emp_id and args.img_dir:
        register_from_dir(args.emp_id, args.img_dir, unet, fnet, dyn, DEVICE)
    elif args.emp_id and args.img_path:
        register_single(args.emp_id, args.img_path, unet, fnet, dyn, DEVICE)
    else:
        print("❌ Thiếu tham số. Ví dụ:")
        print("   python register_face.py --emp_id 1 --img_path ./photo.jpg")
        print("   python register_face.py --emp_id 1 --img_dir ./photos/nv001/")
        print("   python register_face.py --bulk_dir ./photos/")
