"""
Flask API Server cho Face Recognition Service (YuNet version)
=============================================================
Endpoint:
  POST /recognize  → nhận base64 ảnh, trả về nhân viên nhận diện được
  POST /register   → nhận base64 ảnh + emp_id, lưu embedding vào DB
  GET  /health     → kiểm tra service
"""

import os
import sys
import io
import base64
import logging
import numpy as np
import cv2
import torch
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from dotenv import load_dotenv

from model_unet import UNet, segment_face_with_unet
from register_face import (
    load_unet, load_facenet, load_yunet,
    extract_embedding_from_img,
    save_embedding_to_db, load_all_embeddings,
    recognize_face
)

load_dotenv()

# ==================== FLASK APP ====================

app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'http://127.0.0.1:3000'])

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s [%(levelname)s] %(message)s',
                    datefmt='%H:%M:%S')
log = logging.getLogger(__name__)

# ==================== MODEL GLOBALS ====================

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
UNET_WEIGHTS = os.getenv('UNET_WEIGHTS', './weights/unet_face_best.pth')
RECOGNIZE_THRESHOLD = float(os.getenv('RECOGNIZE_THRESHOLD', '0.60'))

unet_model    = None
facenet_model = None
yunet_detector = None


def load_models():
    global unet_model, facenet_model, yunet_detector
    log.info(f"🖥️  Thiết bị: {DEVICE}")
    unet_model    = load_unet(UNET_WEIGHTS, DEVICE)
    facenet_model = load_facenet(DEVICE)
    yunet_detector = load_yunet()
    log.info("✅ Tất cả models (U-Net, FaceNet, YuNet) đã load xong.")


# ==================== UTILS ====================

def decode_base64_image(b64_str):
    """Giải mã base64 thành ảnh OpenCV BGR"""
    if ',' in b64_str:
        b64_str = b64_str.split(',')[1]
    img_bytes = base64.b64decode(b64_str)
    img_arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
    return img


def encode_image_base64(img_bgr):
    """Mã hóa ảnh OpenCV về base64 PNG"""
    _, buffer = cv2.imencode('.png', img_bgr)
    return base64.b64encode(buffer).decode('utf-8')


# ==================== ROUTES ====================

@app.route('/health', methods=['GET'])
def health():
    """Kiểm tra service còn sống"""
    return jsonify({
        'status': 'ok',
        'device': str(DEVICE),
        'unet_loaded': unet_model is not None,
        'facenet_loaded': facenet_model is not None,
        'yunet_loaded': yunet_detector is not None,
        'threshold': RECOGNIZE_THRESHOLD
    })


@app.route('/recognize', methods=['POST'])
def recognize():
    """
    Nhận diện khuôn mặt từ ảnh base64.
    """
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'success': False, 'message': 'Thiếu trường image'}), 400

        # Decode ảnh
        img = decode_base64_image(data['image'])
        if img is None:
            return jsonify({'success': False, 'message': 'Không đọc được ảnh'}), 400

        # Trích xuất embedding (YuNet → FaceNet)
        embedding = extract_embedding_from_img(
            img, unet_model, facenet_model, yunet_detector, DEVICE,
            use_unet=(unet_model is not None)
        )

        # Load danh sách embeddings từ DB
        db_embeddings = load_all_embeddings()
        if not db_embeddings:
            return jsonify({
                'success': False,
                'message': 'Chưa có dữ liệu khuôn mặt trong hệ thống. Vui lòng đăng ký trước.'
            }), 404

        # So sánh embedding bằng Cosine Similarity
        matched, score = recognize_face(embedding, db_embeddings, threshold=RECOGNIZE_THRESHOLD)

        result = {
            'success': True,
            'matched': matched is not None,
            'score': round(float(score), 4),
            'threshold': RECOGNIZE_THRESHOLD
        }

        if matched:
            result.update({
                'ma_tai_khoan': matched['ma_tai_khoan'],
                'ho_ten': matched['ho_ten'],
                'username': matched['username']
            })
            log.info(f"✅ Nhận diện: {matched['ho_ten']} — score={score:.4f}")
        else:
            result['message'] = f'Không nhận diện được (score={score:.4f} < {RECOGNIZE_THRESHOLD})'
            log.warning(f"❓ Không nhận diện được — score={score:.4f}")

        # Debug: trả về ảnh đã segment
        if data.get('return_debug') and unet_model is not None:
            seg_img = segment_face_with_unet(unet_model, img, DEVICE, output_size=256)
            result['debug_image'] = 'data:image/png;base64,' + encode_image_base64(seg_img)

        return jsonify(result)

    except Exception as e:
        log.error(f"❌ /recognize error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/register', methods=['POST'])
def register():
    """
    Đăng ký khuôn mặt nhân viên (upload ảnh → lưu embedding).
    """
    try:
        data = request.get_json()
        if not data or 'image' not in data or 'emp_id' not in data:
            return jsonify({'success': False, 'message': 'Thiếu image hoặc emp_id'}), 400

        emp_id = int(data['emp_id'])
        img = decode_base64_image(data['image'])
        if img is None:
            return jsonify({'success': False, 'message': 'Không đọc được ảnh'}), 400

        # Trích xuất embedding
        embedding = extract_embedding_from_img(
            img, unet_model, facenet_model, yunet_detector, DEVICE,
            use_unet=(unet_model is not None)
        )

        # Lưu vào DB
        ok = save_embedding_to_db(emp_id, embedding)
        if ok:
            log.info(f"✅ Đã đăng ký khuôn mặt NV ID={emp_id}")
            return jsonify({'success': True, 'message': f'Đã đăng ký khuôn mặt NV ID={emp_id}'})
        else:
            return jsonify({'success': False, 'message': 'Lỗi lưu vào database'}), 500

    except Exception as e:
        log.error(f"❌ /register error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/register_multi', methods=['POST'])
def register_multi():
    """
    Đăng ký khuôn mặt nhân viên từ nhiều góc độ ảnh (lấy embedding trung bình).
    """
    try:
        data = request.get_json()
        if not data or 'images' not in data or 'emp_id' not in data:
            return jsonify({'success': False, 'message': 'Thiếu images hoặc emp_id'}), 400

        emp_id = int(data['emp_id'])
        images_data = data['images']
        if not isinstance(images_data, list) or len(images_data) == 0:
            return jsonify({'success': False, 'message': 'images phải là danh sách và không được rỗng'}), 400

        embeddings = []
        for idx, img_b64 in enumerate(images_data):
            img = decode_base64_image(img_b64)
            if img is None:
                continue
            try:
                emb = extract_embedding_from_img(
                    img, unet_model, facenet_model, yunet_detector, DEVICE,
                    use_unet=(unet_model is not None)
                )
                embeddings.append(emb)
            except Exception as emb_err:
                log.warning(f"Failed extracting embedding for image idx {idx}: {emb_err}")

        if not embeddings:
            return jsonify({'success': False, 'message': 'Không thể trích xuất đặc trưng từ bất kỳ ảnh nào. Vui lòng thử lại.'}), 400

        # Lấy embedding trung bình và chuẩn hóa
        mean_emb = np.mean(embeddings, axis=0)
        mean_emb = mean_emb / (np.linalg.norm(mean_emb) + 1e-8)

        # Lưu vào DB
        ok = save_embedding_to_db(emp_id, mean_emb, n_samples=len(embeddings))
        if ok:
            log.info(f"✅ Đã đăng ký khuôn mặt trung bình cho NV ID={emp_id} với {len(embeddings)} mẫu ảnh")
            return jsonify({'success': True, 'message': f'Đăng ký thành công với {len(embeddings)} mẫu ảnh.'})
        else:
            return jsonify({'success': False, 'message': 'Lỗi lưu vào database'}), 500

    except Exception as e:
        log.error(f"❌ /register_multi error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/embeddings', methods=['GET'])
def list_embeddings():
    """Liệt kê tất cả nhân viên đã đăng ký khuôn mặt"""
    try:
        db_embs = load_all_embeddings()
        return jsonify({
            'success': True,
            'count': len(db_embs),
            'employees': [{'ma_tai_khoan': e['ma_tai_khoan'],
                           'ho_ten': e['ho_ten'],
                           'username': e['username']} for e in db_embs]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ==================== ENTRY POINT ====================

if __name__ == '__main__':
    load_models()
    port = int(os.getenv('FACE_SERVICE_PORT', 5001))
    log.info(f"🚀 Face Recognition Service chạy tại http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
