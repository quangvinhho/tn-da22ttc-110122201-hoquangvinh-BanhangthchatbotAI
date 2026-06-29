"""
Chuẩn bị dữ liệu training U-Net:
  1. Thu thập ảnh khuôn mặt nhân viên từ camera/file
  2. Tự động tạo mask bằng MediaPipe Face Mesh
  3. Lưu vào data/images/ và data/masks/

Usage:
  python prepare_data.py --source camera   # chụp từ webcam
  python prepare_data.py --source dir --input_dir ./raw_photos  # từ thư mục
"""

import os
import sys
import argparse
import cv2
import numpy as np
from tqdm import tqdm

try:
    import mediapipe as mp
    MEDIAPIPE_OK = True
except ImportError:
    MEDIAPIPE_OK = False
    print("⚠️  MediaPipe chưa cài. Cài bằng: pip install mediapipe")


def generate_face_mask_mediapipe(img_bgr):
    """
    Tạo face mask chính xác bằng MediaPipe Face Mesh (468 landmarks).
    Outline khuôn mặt = convex hull của tất cả landmarks.
    Trả về mask uint8 (0=bg, 255=face).
    """
    mp_face_mesh = mp.solutions.face_mesh
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    ) as face_mesh:
        results = face_mesh.process(img_rgb)
        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            points = np.array([[int(lm.x * w), int(lm.y * h)] for lm in landmarks])
            hull = cv2.convexHull(points)
            cv2.fillConvexPoly(mask, hull, 255)

            # Dilation để bao gồm tóc/tai một chút
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            mask = cv2.dilate(mask, kernel, iterations=2)

    return mask


def generate_face_mask_haar(img_bgr):
    """
    Fallback: dùng Haar Cascade để tạo mask hình elip.
    Kém chính xác hơn MediaPipe nhưng không cần cài thêm.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(80, 80))

    for (x, y, fw, fh) in faces:
        # Tạo mask ellipse
        cx, cy = x + fw // 2, y + fh // 2
        rx, ry = int(fw * 0.55), int(fh * 0.65)
        cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)

    return mask


def process_image(img_path, out_img_dir, out_mask_dir, size=256):
    """Xử lý 1 ảnh: resize + tạo mask + lưu cả 2"""
    img = cv2.imread(img_path)
    if img is None:
        return False

    # Resize
    img_resized = cv2.resize(img, (size, size))

    # Tạo mask
    if MEDIAPIPE_OK:
        mask = generate_face_mask_mediapipe(img_resized)
    else:
        mask = generate_face_mask_haar(img_resized)

    # Tên file
    basename = os.path.splitext(os.path.basename(img_path))[0]
    cv2.imwrite(os.path.join(out_img_dir, basename + '.jpg'), img_resized)
    cv2.imwrite(os.path.join(out_mask_dir, basename + '.png'), mask)
    return True


def capture_from_camera(out_img_dir, out_mask_dir, n_samples=30, size=256):
    """
    Chụp ảnh từ webcam và tạo mask tự động.
    Nhấn SPACE để chụp, ESC để thoát.
    """
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Không mở được camera!")
        return

    print(f"📸 Chụp ảnh từ camera (mục tiêu: {n_samples} ảnh)")
    print("   SPACE = chụp | ESC = thoát")

    count = 0
    while count < n_samples:
        ret, frame = cap.read()
        if not ret:
            break

        # Hiển thị frame với hướng dẫn
        display = frame.copy()
        cv2.putText(display, f"Anh: {count}/{n_samples}  SPACE=chup | ESC=thoat",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        # Vẽ khung hướng dẫn vị trí mặt
        h, w = frame.shape[:2]
        cx, cy = w // 2, h // 2
        cv2.ellipse(display, (cx, cy), (120, 150), 0, 0, 360, (0, 255, 255), 2)

        cv2.imshow('Thu thap du lieu - SPACE=chup, ESC=thoat', display)
        key = cv2.waitKey(1) & 0xFF

        if key == 27:  # ESC
            break
        elif key == 32:  # SPACE
            fname = f'capture_{count:04d}.jpg'
            img_path = os.path.join('/tmp', fname)
            cv2.imwrite(img_path, frame)
            if process_image(img_path, out_img_dir, out_mask_dir, size):
                count += 1
                print(f"  ✓ Đã chụp ảnh {count}/{n_samples}")

    cap.release()
    cv2.destroyAllWindows()
    print(f"\n✅ Hoàn thành! Đã tạo {count} ảnh với mask.")


def process_directory(input_dir, out_img_dir, out_mask_dir, size=256):
    """Xử lý hàng loạt ảnh từ thư mục"""
    exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
    img_files = [f for f in os.listdir(input_dir)
                 if os.path.splitext(f)[1].lower() in exts]

    print(f"📂 Xử lý {len(img_files)} ảnh từ: {input_dir}")
    ok = 0
    for fname in tqdm(img_files):
        img_path = os.path.join(input_dir, fname)
        if process_image(img_path, out_img_dir, out_mask_dir, size):
            ok += 1

    print(f"✅ Xong! {ok}/{len(img_files)} ảnh đã xử lý.")
    print(f"   Images: {out_img_dir}")
    print(f"   Masks:  {out_mask_dir}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Chuẩn bị dữ liệu cho U-Net')
    parser.add_argument('--source', choices=['camera', 'dir'], default='dir')
    parser.add_argument('--input_dir',  type=str, default='./raw_photos')
    parser.add_argument('--output_dir', type=str, default='./data')
    parser.add_argument('--size',       type=int, default=256, help='Kích thước ảnh output')
    parser.add_argument('--n_samples',  type=int, default=30, help='Số ảnh chụp từ camera')
    args = parser.parse_args()

    out_img  = os.path.join(args.output_dir, 'images')
    out_mask = os.path.join(args.output_dir, 'masks')
    os.makedirs(out_img,  exist_ok=True)
    os.makedirs(out_mask, exist_ok=True)

    if args.source == 'camera':
        capture_from_camera(out_img, out_mask, args.n_samples, args.size)
    else:
        if not os.path.exists(args.input_dir):
            print(f"❌ Không tìm thấy: {args.input_dir}")
            sys.exit(1)
        process_directory(args.input_dir, out_img, out_mask, args.size)
