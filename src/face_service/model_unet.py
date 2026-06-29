"""
U-Net Architecture cho phân vùng khuôn mặt (Face Segmentation)
Pipeline: Input Image → U-Net → Face Mask → Preprocessed Face

U-Net gồm:
  - Encoder: 4 block down-sampling (double conv + max pool)
  - Bottleneck: double conv
  - Decoder: 4 block up-sampling (upsample + skip connection + double conv)
  - Output: 1-channel mask (0=background, 1=face)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2


class DoubleConv(nn.Module):
    """
    Hai lớp Conv2d + BatchNorm + ReLU liên tiếp.
    Đây là building block cơ bản của U-Net.
    """
    def __init__(self, in_channels, out_channels, mid_channels=None):
        super().__init__()
        if mid_channels is None:
            mid_channels = out_channels
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(mid_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.double_conv(x)


class Down(nn.Module):
    """Encoder block: MaxPool2d → DoubleConv"""
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels)
        )

    def forward(self, x):
        return self.maxpool_conv(x)


class Up(nn.Module):
    """
    Decoder block: Upsample → concat với skip connection → DoubleConv
    bilinear=True để tránh CheckerBoard artifacts
    """
    def __init__(self, in_channels, out_channels, bilinear=True):
        super().__init__()
        if bilinear:
            self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
            self.conv = DoubleConv(in_channels, out_channels, in_channels // 2)
        else:
            self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
            self.conv = DoubleConv(in_channels, out_channels)

    def forward(self, x1, x2):
        x1 = self.up(x1)
        # Pad nếu kích thước không khớp (do số lẻ)
        diffY = x2.size()[2] - x1.size()[2]
        diffX = x2.size()[3] - x1.size()[3]
        x1 = F.pad(x1, [diffX // 2, diffX - diffX // 2,
                         diffY // 2, diffY - diffY // 2])
        x = torch.cat([x2, x1], dim=1)  # Skip connection
        return self.conv(x)


class OutConv(nn.Module):
    """Output layer: 1x1 Conv để mapping về số class"""
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x):
        return self.conv(x)


class UNet(nn.Module):
    """
    U-Net đầy đủ cho Face Segmentation.

    Architecture:
      Input (3, 256, 256)
        ↓ inc       → x1: (64, 256, 256)
        ↓ down1     → x2: (128, 128, 128)
        ↓ down2     → x3: (256, 64, 64)
        ↓ down3     → x4: (512, 32, 32)
        ↓ down4     → x5: (1024→512, 16, 16)  [bottleneck]
        ↑ up1(x5,x4) → (256, 32, 32)
        ↑ up2(x5,x3) → (128, 64, 64)
        ↑ up3(x5,x2) → (64, 128, 128)
        ↑ up4(x5,x1) → (64, 256, 256)
        → outc       → (n_classes, 256, 256)
    """
    def __init__(self, n_channels=3, n_classes=1, bilinear=False):
        super(UNet, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes
        self.bilinear = bilinear

        self.inc   = DoubleConv(n_channels, 64)
        self.down1 = Down(64, 128)
        self.down2 = Down(128, 256)
        self.down3 = Down(256, 512)
        factor = 2 if bilinear else 1
        self.down4 = Down(512, 1024 // factor)  # Bottleneck

        self.up1 = Up(1024, 512 // factor, bilinear)
        self.up2 = Up(512, 256 // factor, bilinear)
        self.up3 = Up(256, 128 // factor, bilinear)
        self.up4 = Up(128, 64, bilinear)
        self.outc = OutConv(64, n_classes)

    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)
        x  = self.up1(x5, x4)
        x  = self.up2(x, x3)
        x  = self.up3(x, x2)
        x  = self.up4(x, x1)
        logits = self.outc(x)
        return logits  # shape: (B, 1, H, W)


# ==================== PREPROCESSING UTILS ====================

def preprocess_for_unet(img_bgr, target_size=256):
    """
    Chuẩn hóa ảnh BGR từ OpenCV để đưa vào U-Net.
    Returns: tensor shape (1, 3, H, W), giá trị trong [-1, 1]
    """
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (target_size, target_size))
    img_float = img_resized.astype(np.float32) / 255.0
    # Normalize với ImageNet mean/std
    mean = np.array([0.485, 0.456, 0.406])
    std  = np.array([0.229, 0.224, 0.225])
    img_norm = (img_float - mean) / std
    tensor = torch.from_numpy(img_norm.transpose(2, 0, 1)).unsqueeze(0)  # (1,3,H,W)
    return tensor.float()


def apply_unet_mask(img_bgr, mask_tensor, threshold=0.5, target_size=None):
    """
    Áp dụng mask từ U-Net lên ảnh gốc để lấy vùng khuôn mặt.
    Args:
        img_bgr: ảnh gốc OpenCV
        mask_tensor: output của U-Net, shape (1,1,H,W)
        threshold: ngưỡng phân ngưỡng mask
        target_size: kích thước output
    Returns:
        face_img: ảnh chỉ giữ lại vùng mặt
        mask_np: mask dạng numpy
    """
    h, w = img_bgr.shape[:2]
    # Sigmoid + threshold
    mask = torch.sigmoid(mask_tensor).squeeze().cpu().numpy()  # (H, W)
    mask_bin = (mask > threshold).astype(np.uint8) * 255

    # Resize mask về kích thước ảnh gốc
    mask_resized = cv2.resize(mask_bin, (w, h))

    # Morphological operations để làm mịn mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_clean = cv2.morphologyEx(mask_resized, cv2.MORPH_CLOSE, kernel)
    mask_clean = cv2.morphologyEx(mask_clean, cv2.MORPH_OPEN, kernel)

    # Áp dụng mask lên ảnh gốc
    mask_3ch = cv2.merge([mask_clean, mask_clean, mask_clean])
    face_img = cv2.bitwise_and(img_bgr, mask_3ch)

    if target_size:
        face_img = cv2.resize(face_img, (target_size, target_size))

    return face_img, mask_resized


def segment_face_with_unet(model, img_bgr, device, input_size=256, output_size=160):
    """
    Pipeline hoàn chỉnh: ảnh → U-Net → vùng mặt đã segment.
    Args:
        model: UNet đã load weights
        img_bgr: ảnh BGR từ OpenCV
        device: 'cuda' hoặc 'cpu'
        input_size: kích thước input U-Net
        output_size: kích thước output cho FaceNet (mặc định 160x160)
    Returns:
        face_segmented: ảnh mặt đã phân vùng, kích thước (output_size, output_size)
    """
    model.eval()
    with torch.no_grad():
        tensor = preprocess_for_unet(img_bgr, input_size).to(device)
        mask_pred = model(tensor)
    face_img, _ = apply_unet_mask(img_bgr, mask_pred, target_size=output_size)
    return face_img
