"""
Script Huấn luyện U-Net cho Face Segmentation
==============================================
Dataset cần có:
  data/
    images/      ← ảnh khuôn mặt gốc (jpg/png)
    masks/       ← mask nhị phân tương ứng (0=bg, 255=face)

Hoặc dùng dataset CelebAMask-HQ / LFW với mask sẵn.
Nếu không có mask → dùng MediaPipe/dlib để auto-generate mask.

Usage:
  python train_unet.py --data_dir ./data --epochs 50 --batch_size 8
"""

import os
import sys
import argparse
import numpy as np
import cv2
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import transforms
from PIL import Image
import albumentations as A
from albumentations.pytorch import ToTensorV2
from tqdm import tqdm
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from model_unet import UNet


# ==================== DATASET ====================

class FaceSegDataset(Dataset):
    """
    Dataset cho Face Segmentation.
    Mỗi sample: (image, mask)
    - image: (3, H, W) float32, normalized
    - mask: (1, H, W) float32, giá trị 0.0 hoặc 1.0
    """
    def __init__(self, img_dir, mask_dir, img_size=256, augment=True):
        self.img_dir = img_dir
        self.mask_dir = mask_dir
        self.img_size = img_size
        self.augment = augment

        # Lấy danh sách file
        exts = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
        self.images = [
            f for f in sorted(os.listdir(img_dir))
            if os.path.splitext(f)[1].lower() in exts
        ]
        print(f"📂 Dataset: {len(self.images)} ảnh trong {img_dir}")

        # Augmentation cho training
        self.train_transform = A.Compose([
            A.Resize(img_size, img_size),
            A.HorizontalFlip(p=0.5),
            A.Rotate(limit=15, p=0.3),
            A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.4),
            A.GaussianBlur(blur_limit=(3, 5), p=0.2),
            A.RandomScale(scale_limit=0.1, p=0.3),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2()
        ])

        # Transform cho validation (không augment)
        self.val_transform = A.Compose([
            A.Resize(img_size, img_size),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2()
        ])

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img_name = self.images[idx]
        img_path = os.path.join(self.img_dir, img_name)

        # Load image
        img = cv2.imread(img_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Load mask (tên file giống nhau)
        base = os.path.splitext(img_name)[0]
        mask_path = None
        for ext in ['.png', '.jpg', '.bmp']:
            candidate = os.path.join(self.mask_dir, base + ext)
            if os.path.exists(candidate):
                mask_path = candidate
                break

        if mask_path and os.path.exists(mask_path):
            mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
            mask = (mask > 127).astype(np.uint8)  # Binarize
        else:
            # Auto-generate mask bằng MediaPipe nếu không có
            mask = self._auto_generate_mask(img)

        # Apply transforms
        transform = self.train_transform if self.augment else self.val_transform
        result = transform(image=img, mask=mask)
        image_tensor = result['image']  # (3, H, W)
        mask_tensor = result['mask'].unsqueeze(0).float()  # (1, H, W)

        return image_tensor, mask_tensor

    def _auto_generate_mask(self, img_rgb):
        """
        Tự động tạo face mask bằng MediaPipe Face Detection.
        Trả về mask uint8 (0 hoặc 1).
        """
        try:
            import mediapipe as mp
            mp_face = mp.solutions.face_detection
            with mp_face.FaceDetection(min_detection_confidence=0.5) as det:
                results = det.process(img_rgb)
                h, w = img_rgb.shape[:2]
                mask = np.zeros((h, w), dtype=np.uint8)
                if results.detections:
                    det_data = results.detections[0].location_data.relative_bounding_box
                    x1 = max(0, int(det_data.xmin * w))
                    y1 = max(0, int(det_data.ymin * h))
                    x2 = min(w, int((det_data.xmin + det_data.width) * w))
                    y2 = min(h, int((det_data.ymin + det_data.height) * h))
                    # Tạo ellipse mask cho tự nhiên hơn
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    rx, ry = (x2 - x1) // 2, (y2 - y1) // 2
                    cv2.ellipse(mask, (cx, cy), (rx, ry), 0, 0, 360, 1, -1)
                return mask
        except ImportError:
            # Fallback: tạo mask hình chữ nhật ở trung tâm
            h, w = img_rgb.shape[:2]
            mask = np.zeros((h, w), dtype=np.uint8)
            margin = 0.15
            y1, y2 = int(h * margin), int(h * (1 - margin))
            x1, x2 = int(w * margin), int(w * (1 - margin))
            mask[y1:y2, x1:x2] = 1
            return mask


# ==================== LOSS FUNCTIONS ====================

class DiceLoss(nn.Module):
    """
    Dice Loss — phù hợp cho segmentation mất cân bằng lớp.
    Dice = 2|A∩B| / (|A| + |B|)
    Loss = 1 - Dice
    """
    def __init__(self, smooth=1.0):
        super().__init__()
        self.smooth = smooth

    def forward(self, pred, target):
        pred = torch.sigmoid(pred)
        pred_flat = pred.view(-1)
        target_flat = target.view(-1)
        intersection = (pred_flat * target_flat).sum()
        dice = (2. * intersection + self.smooth) / (pred_flat.sum() + target_flat.sum() + self.smooth)
        return 1 - dice


class CombinedLoss(nn.Module):
    """
    Kết hợp BCE + Dice Loss:
    Loss = 0.5 * BCE + 0.5 * Dice
    Tốt hơn dùng riêng lẻ vì:
    - BCE: pixel-level accuracy
    - Dice: shape overlap accuracy
    """
    def __init__(self, bce_weight=0.5, dice_weight=0.5):
        super().__init__()
        self.bce = nn.BCEWithLogitsLoss()
        self.dice = DiceLoss()
        self.bce_w = bce_weight
        self.dice_w = dice_weight

    def forward(self, pred, target):
        return self.bce_w * self.bce(pred, target) + self.dice_w * self.dice(pred, target)


# ==================== METRICS ====================

def iou_score(pred, target, threshold=0.5):
    """Intersection over Union metric"""
    pred_bin = (torch.sigmoid(pred) > threshold).float()
    intersection = (pred_bin * target).sum()
    union = pred_bin.sum() + target.sum() - intersection
    return (intersection + 1e-8) / (union + 1e-8)


# ==================== TRAINING LOOP ====================

def train_one_epoch(model, loader, optimizer, criterion, device, scaler=None):
    model.train()
    total_loss = 0
    total_iou = 0

    pbar = tqdm(loader, desc='  Train', leave=False)
    for images, masks in pbar:
        images, masks = images.to(device), masks.to(device)
        optimizer.zero_grad()

        if scaler:  # Mixed precision training
            with torch.cuda.amp.autocast():
                preds = model(images)
                loss = criterion(preds, masks)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        else:
            preds = model(images)
            loss = criterion(preds, masks)
            loss.backward()
            optimizer.step()

        with torch.no_grad():
            iou = iou_score(preds, masks)
        total_loss += loss.item()
        total_iou += iou.item()
        pbar.set_postfix({'loss': f'{loss.item():.4f}', 'IoU': f'{iou.item():.4f}'})

    return total_loss / len(loader), total_iou / len(loader)


@torch.no_grad()
def validate(model, loader, criterion, device):
    model.eval()
    total_loss = 0
    total_iou = 0

    pbar = tqdm(loader, desc='  Val  ', leave=False)
    for images, masks in pbar:
        images, masks = images.to(device), masks.to(device)
        preds = model(images)
        loss = criterion(preds, masks)
        iou = iou_score(preds, masks)
        total_loss += loss.item()
        total_iou += iou.item()
        pbar.set_postfix({'loss': f'{loss.item():.4f}', 'IoU': f'{iou.item():.4f}'})

    return total_loss / len(loader), total_iou / len(loader)


# ==================== MAIN TRAINING ====================

def train(args):
    # Thiết bị
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"🖥️  Thiết bị: {device}")
    if torch.cuda.is_available():
        print(f"   GPU: {torch.cuda.get_device_name(0)}")

    # Dataset
    full_dataset = FaceSegDataset(
        img_dir=args.img_dir,
        mask_dir=args.mask_dir,
        img_size=args.img_size,
        augment=True
    )

    # Chia train/val
    n_val = max(1, int(len(full_dataset) * args.val_split))
    n_train = len(full_dataset) - n_val
    train_set, val_set = random_split(full_dataset, [n_train, n_val],
                                       generator=torch.Generator().manual_seed(42))
    val_set.dataset.augment = False  # Không augment cho val

    train_loader = DataLoader(train_set, batch_size=args.batch_size,
                              shuffle=True, num_workers=args.workers, pin_memory=True)
    val_loader   = DataLoader(val_set, batch_size=args.batch_size,
                              shuffle=False, num_workers=args.workers, pin_memory=True)

    print(f"📊 Train: {n_train} | Val: {n_val}")

    # Model
    model = UNet(n_channels=3, n_classes=1, bilinear=True).to(device)
    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"🔧 U-Net parameters: {total_params:,}")

    # Load checkpoint nếu có
    if args.resume and os.path.exists(args.resume):
        checkpoint = torch.load(args.resume, map_location=device)
        model.load_state_dict(checkpoint['model_state'])
        print(f"✅ Tiếp tục từ checkpoint: {args.resume}")

    # Loss + Optimizer + Scheduler
    criterion = CombinedLoss(bce_weight=0.5, dice_weight=0.5)
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    # Mixed precision nếu có GPU
    scaler = torch.cuda.amp.GradScaler() if torch.cuda.is_available() else None

    # Tạo thư mục lưu
    os.makedirs(args.save_dir, exist_ok=True)

    # Training history
    history = {'train_loss': [], 'val_loss': [], 'train_iou': [], 'val_iou': []}
    best_iou = 0.0

    print(f"\n{'='*55}")
    print(f"🚀 Bắt đầu huấn luyện U-Net — {args.epochs} epochs")
    print(f"{'='*55}\n")

    for epoch in range(1, args.epochs + 1):
        print(f"📅 Epoch [{epoch}/{args.epochs}]  LR: {optimizer.param_groups[0]['lr']:.2e}")

        train_loss, train_iou = train_one_epoch(model, train_loader, optimizer, criterion, device, scaler)
        val_loss,   val_iou   = validate(model, val_loader, criterion, device)
        scheduler.step()

        print(f"   Train → Loss: {train_loss:.4f} | IoU: {train_iou:.4f}")
        print(f"   Val   → Loss: {val_loss:.4f}   | IoU: {val_iou:.4f}")

        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        history['train_iou'].append(train_iou)
        history['val_iou'].append(val_iou)

        # Lưu best model
        if val_iou > best_iou:
            best_iou = val_iou
            save_path = os.path.join(args.save_dir, 'unet_face_best.pth')
            torch.save({
                'epoch': epoch,
                'model_state': model.state_dict(),
                'optimizer_state': optimizer.state_dict(),
                'val_iou': val_iou,
                'val_loss': val_loss,
                'img_size': args.img_size
            }, save_path)
            print(f"   💾 Saved best model → IoU: {best_iou:.4f}")

        # Lưu checkpoint mỗi 10 epoch
        if epoch % 10 == 0:
            ckpt_path = os.path.join(args.save_dir, f'unet_epoch_{epoch:03d}.pth')
            torch.save({'epoch': epoch, 'model_state': model.state_dict()}, ckpt_path)

        print()

    # Vẽ biểu đồ training
    plot_history(history, args.save_dir)
    print(f"\n✅ Hoàn thành! Best val IoU = {best_iou:.4f}")
    print(f"   Model lưu tại: {os.path.join(args.save_dir, 'unet_face_best.pth')}")


def plot_history(history, save_dir):
    """Vẽ và lưu biểu đồ Loss + IoU theo epoch"""
    epochs = range(1, len(history['train_loss']) + 1)
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # Loss
    axes[0].plot(epochs, history['train_loss'], 'b-o', markersize=3, label='Train Loss')
    axes[0].plot(epochs, history['val_loss'], 'r-o', markersize=3, label='Val Loss')
    axes[0].set_title('U-Net Loss (BCE + Dice)')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Loss')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)

    # IoU
    axes[1].plot(epochs, history['train_iou'], 'b-o', markersize=3, label='Train IoU')
    axes[1].plot(epochs, history['val_iou'], 'r-o', markersize=3, label='Val IoU')
    axes[1].set_title('U-Net IoU Score')
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('IoU')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    save_path = os.path.join(save_dir, 'unet_training_history.png')
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"   📊 Biểu đồ: {save_path}")
    plt.close()


# ==================== ENTRY POINT ====================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Huấn luyện U-Net Face Segmentation')

    # Dữ liệu
    parser.add_argument('--img_dir',   type=str, default='./data/images',
                        help='Thư mục chứa ảnh gốc')
    parser.add_argument('--mask_dir',  type=str, default='./data/masks',
                        help='Thư mục chứa mask (tên giống ảnh gốc)')
    parser.add_argument('--img_size',  type=int, default=256,
                        help='Kích thước ảnh đầu vào U-Net (mặc định: 256)')
    parser.add_argument('--val_split', type=float, default=0.15,
                        help='Tỉ lệ validation (mặc định: 0.15)')

    # Training
    parser.add_argument('--epochs',     type=int,   default=50)
    parser.add_argument('--batch_size', type=int,   default=8)
    parser.add_argument('--lr',         type=float, default=1e-4)
    parser.add_argument('--workers',    type=int,   default=4)

    # I/O
    parser.add_argument('--save_dir', type=str, default='./weights',
                        help='Thư mục lưu checkpoint')
    parser.add_argument('--resume',   type=str, default='',
                        help='Tiếp tục training từ checkpoint .pth')

    args = parser.parse_args()

    # Kiểm tra thư mục
    if not os.path.exists(args.img_dir):
        print(f"❌ Không tìm thấy thư mục ảnh: {args.img_dir}")
        print("   Tạo thư mục và đưa ảnh vào, hoặc chạy: python prepare_data.py")
        sys.exit(1)

    if not os.path.exists(args.mask_dir):
        print(f"⚠️  Không tìm thấy thư mục mask: {args.mask_dir}")
        print("   Sẽ tự động tạo mask bằng MediaPipe...")
        os.makedirs(args.mask_dir, exist_ok=True)

    train(args)
