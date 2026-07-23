import os
import re
import json
import time
import mysql.connector
from dotenv import load_dotenv
from typing import List, Dict, Any, Tuple

load_dotenv(dotenv_path="../backend/.env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASSWORD", "Vinh123456789@")
DB_NAME = os.getenv("DB_NAME", "QHUNG")

def remove_diacritics(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').replace('đ', 'd').replace('Đ', 'D')

def is_accessory(name: str) -> bool:
    if not name:
        return False
    n = remove_diacritics(name.lower())
    
    # Check if a phone keyword or brand is explicitly present to avoid false positive accessories
    phone_indicators = ['dien thoai', 'may', 'smartphone', 'dt', 'iphone', 'samsung', 'xiaomi', 'oppo', 'vivo', 'realme', 'rog', 'tecno', 'nokia']
    has_phone_indicator = any(p_ind in n for p_ind in phone_indicators)
    
    keywords = [
        'op lung', 'op luong', 'op magsafe', 'cap sac', 'cu sac', 'sac nhanh', 
        'tai nghe', 'cuong luc', 'bao da', 'dan man hinh', 'the nho', 
        'pin du phong', 'sac du phong', 'case', 'kinh cuong luc',
        'day sac', 'day cap', 'coc sac', 'adapter', 'daysac', 'daycap',
        'capsac', 'cusac', 'oplung', 'opluong'
    ]
    
    is_acc_kw = any(kw in n for kw in keywords)
    if not is_acc_kw:
        import re
        if re.search(r'\b(sac|cap)\b', n):
            is_acc_kw = True
        if re.search(r'\bop\b(?!po)', n):
            is_acc_kw = True
            
    if is_acc_kw:
        # Exempt charging/cable keywords if a phone indicator is present (e.g. "Samsung sạc nhanh")
        # BUT only if it is NOT a dedicated accessory (does not contain charger/cable nouns)
        if has_phone_indicator:
            # Check if it has accessory-specific nouns
            is_real_accessory = any(w in n.split() for w in ['cap', 'cu', 'day', 'coc', 'adapter', 'op']) or any(term in n for term in ['tai nghe', 'cuong luc', 'bao da', 'du phong'])
            if not is_real_accessory:
                return False
        return True
    return False

def sanitize_budget(budget_val: Any) -> int:
    if not budget_val:
        return None
    try:
        if isinstance(budget_val, (int, float)):
            if budget_val < 100:
                return int(budget_val * 1000000)
            return int(budget_val)
        
        s = str(budget_val).lower().strip()
        s = remove_diacritics(s)
        s = s.replace(',', '.')
        
        match = re.search(r'\b(\d+(?:\.\d+)?)\b', s)
        if not match:
            digits = "".join(c for c in s if c.isdigit())
            if not digits:
                return None
            val = float(digits)
        else:
            val = float(match.group(1))
            
        if "trieu" in s or "tr" in s:
            val = val * 1000000
        elif "k" in s:
            val = val * 1000
        elif val < 100:
            val = val * 1000000
        elif val < 10000:
            val = val * 1000
            
        return int(val)
    except Exception:
        return None

def parse_budget_range(budget_val: Any) -> Tuple[Any, Any]:
    from typing import Optional
    if not budget_val:
        return None, None
        
    if isinstance(budget_val, (int, float)):
        return None, int(budget_val)
        
    s = remove_diacritics(str(budget_val).lower().strip())
    
    # 1. "duoi 5 trieu", "duoi 5tr", "< 5tr"
    if "duoi" in s or "<" in s:
        val = sanitize_budget(budget_val)
        return None, val
        
    # 2. "tren 8 trieu", "tren 8tr", "> 8tr"
    if "tren" in s or ">" in s:
        val = sanitize_budget(budget_val)
        return val, None
        
    # 3. "tam 5 - 8 trieu", "5-8 trieu", "5 den 8"
    range_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:-|den|va)\s*(\d+(?:\.\d+)?)\b', s)
    if range_match:
        num1 = float(range_match.group(1))
        num2 = float(range_match.group(2))
        
        if "trieu" in s or "tr" in s or (num1 < 100 and num2 < 100):
            val1 = int(num1 * 1000000)
            val2 = int(num2 * 1000000)
        elif "k" in s:
            val1 = int(num1 * 1000)
            val2 = int(num2 * 1000)
        else:
            val1 = int(num1)
            val2 = int(num2)
        return val1, val2
        
    # Default fallback
    val = sanitize_budget(budget_val)
    return None, val

def get_target_budget(budget_val: Any) -> Any:
    from typing import Optional
    if not budget_val:
        return None
    min_price, max_price = parse_budget_range(budget_val)
    if min_price is not None and max_price is not None:
        return (min_price + max_price) // 2
    if min_price is not None:
        return min_price
    if max_price is not None:
        return max_price
    return sanitize_budget(budget_val)

def extract_budget_text(user_message: str) -> Any:
    m_clean = remove_diacritics(user_message.lower().strip())
    
    # Check if there is a number in the message
    num_match = re.search(r'\b\d+(?:\.\d+)?\b', m_clean)
    if not num_match:
        return None
        
    # Check if there are budget keywords in the message
    budget_indicators = ["trieu", "tr", "k", "tram", "t", "cu", "đ", "vnd", "dong", "budget", "ngan sach", "gia", "tien"]
    has_indicator = any(kw in m_clean for kw in budget_indicators)
    
    # Or if the number is naturally large (like 5000000)
    val_raw = float(num_match.group(0))
    if val_raw >= 100000 or has_indicator:
        # Check for range patterns: "5-8 trieu", "5 den 8 tr"
        if re.search(r'\b\d+(?:\.\d+)?\s*(?:-|den|va)\s*\d+(?:\.\d+)?\s*(?:trieu|tr|k)?\b', m_clean):
            return user_message
            
        # Check for comparative patterns: "tren", "duoi", "hon", "<", ">"
        if re.search(r'\b(tren|duoi|hon)\b|[<>]', m_clean):
            return user_message
            
        # Fallback to normal sanitize_budget
        return sanitize_budget(user_message)
        
    return None

# Định nghĩa cấu trúc của 7 luồng tư vấn
FLOWS = {
    "student": {
        "name": "Sinh viên",
        "description": "Tư vấn mua điện thoại cho đối tượng học sinh, sinh viên học tập lâu dài.",
        "fields": {
            "student_year": "Năm học hiện tại (năm nhất, năm hai, năm 3 & 4, hoặc lớp 9, lớp 10, lớp 11, lớp 12...)",
            "need_long_term": "Có cần dùng điện thoại lâu dài suốt các năm học (cấp 3 hoặc Đại học) không (Đúng vậy / Không cần)",
            "budget": "Mức ngân sách tối đa dành cho điện thoại (ví dụ: 8 triệu)",
            "priority": "Ưu tiên chính (chọn các giá trị: pin, hoc tap, chup anh, choi game)"
        },
        "order": ["student_year", "need_long_term", "budget", "priority"],
        "chips": {
            "student_year": [
                {"text": "Năm nhất", "icon": "fa-graduation-cap"},
                {"text": "Năm hai", "icon": "fa-user-graduate"},
                {"text": "Năm 3 & 4", "icon": "fa-user-tie"}
            ],
            "need_long_term": [
                {"text": "Dùng lâu dài", "icon": "fa-check"},
                {"text": "Không cần dùng lâu", "icon": "fa-times"}
            ],
            "budget": [
                {"text": "Dưới 5 triệu", "icon": "fa-money-bill-wave"},
                {"text": "Tầm 5 - 8 triệu", "icon": "fa-wallet"},
                {"text": "Trên 8 triệu", "icon": "fa-credit-card"}
            ],
            "priority": [
                {"text": "Học tập & Pin trâu", "icon": "fa-book-reader"},
                {"text": "Chơi game mượt", "icon": "fa-gamepad"},
                {"text": "Chụp ảnh đẹp", "icon": "fa-camera"}
            ]
        }
    },
    "worker": {
        "name": "Người đi làm",
        "description": "Tư vấn điện thoại cho người đi làm văn phòng hoặc di chuyển ngoài trời nhiều.",
        "fields": {
            "work_type": "Tính chất công việc (lam van phong / di chuyen nhieu)",
            "purpose": "Mục đích sử dụng chính (cong viec, goi khach hang, email, giai tri)",
            "duration": "Thời gian dự kiến sử dụng điện thoại (ví dụ: 2 năm, 3-4 năm)",
            "budget": "Mức ngân sách tối đa dành cho điện thoại (ví dụ: 15 triệu)"
        },
        "order": ["work_type", "purpose", "duration", "budget"],
        "chips": {
            "work_type": [
                {"text": "Làm văn phòng", "icon": "fa-briefcase"},
                {"text": "Di chuyển ngoài trời nhiều", "icon": "fa-motorcycle"}
            ],
            "purpose": [
                {"text": "Công việc & Email", "icon": "fa-envelope-open-text"},
                {"text": "Gọi khách hàng liên tục", "icon": "fa-phone-volume"},
                {"text": "Xem phim & Giải trí", "icon": "fa-film"}
            ],
            "duration": [
                {"text": "Dùng 2 năm", "icon": "fa-history"},
                {"text": "Dùng 3-4 năm", "icon": "fa-hourglass-half"},
                {"text": "Trên 4 năm", "icon": "fa-calendar-alt"}
            ],
            "budget": [
                {"text": "Tầm 5 - 10 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 10 - 15 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 15 triệu", "icon": "fa-gem"}
            ]
        }
    },
    "gamer": {
        "name": "Game thủ",
        "description": "Tư vấn mua điện thoại chuyên chơi game, hiệu năng cao.",
        "fields": {
            "game_name": "Tên tựa game thường chơi nhất (ví dụ: PUBG, Liên Quân, Genshin Impact...)",
            "game_hours": "Thời gian chơi game trung bình mỗi ngày (ví dụ: dưới 2h, 2-4h, trên 4h)",
            "priority": "Yêu cầu ưu tiên khi chơi game (fps, pin, tan nhiet)",
            "budget": "Mức ngân sách tối đa dành cho điện thoại (ví dụ: 10 triệu)"
        },
        "order": ["game_name", "game_hours", "priority", "budget"],
        "chips": {
            "game_name": [
                {"text": "Liên Quân / Tốc Chiến", "icon": "fa-sword"},
                {"text": "PUBG Mobile", "icon": "fa-crosshairs"},
                {"text": "Genshin Impact (Nặng)", "icon": "fa-fire"}
            ],
            "game_hours": [
                {"text": "Dưới 2 tiếng/ngày", "icon": "fa-clock"},
                {"text": "Từ 2-4 tiếng/ngày", "icon": "fa-hourglass-start"},
                {"text": "Trên 4 tiếng/ngày", "icon": "fa-gamepad"}
            ],
            "priority": [
                {"text": "FPS mượt mà ổn định", "icon": "fa-tachometer-alt"},
                {"text": "Pin trâu chơi lâu", "icon": "fa-battery-full"},
                {"text": "Tản nhiệt mát mẻ", "icon": "fa-snowflake"}
            ],
            "budget": [
                {"text": "Dưới 8 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 8 - 12 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 12 triệu", "icon": "fa-gem"}
            ]
        }
    },
    "photographer": {
        "name": "Chụp ảnh & Quay video",
        "description": "Tư vấn điện thoại camera đẹp, thích hợp chụp hình selfie, phong cảnh hay quay video.",
        "fields": {
            "camera_focus": "Thể loại chụp/quay chính (selfie, phong canh, quay video, chup gia dinh)",
            "tiktok_reels": "Có hay quay TikTok, Reels hay đăng bài mạng xã hội không (Có / Không)",
            "budget": "Mức ngân sách dành cho điện thoại (ví dụ: 12 triệu)"
        },
        "order": ["camera_focus", "tiktok_reels", "budget"],
        "chips": {
            "camera_focus": [
                {"text": "Chụp Selfie", "icon": "fa-smile-beam"},
                {"text": "Chụp phong cảnh/du lịch", "icon": "fa-mountain"},
                {"text": "Quay video gia đình/bạn bè", "icon": "fa-users"}
            ],
            "tiktok_reels": [
                {"text": "Có quay TikTok/Reels", "icon": "fa-video"},
                {"text": "Không, chỉ chụp ảnh thường", "icon": "fa-camera"}
            ],
            "budget": [
                {"text": "Dưới 10 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 10 - 15 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 15 triệu", "icon": "fa-gem"}
            ]
        }
    },
    "parent": {
        "name": "Phụ huynh mua cho con",
        "description": "Tư vấn điện thoại cho học sinh từ tiểu học đến trung học, ưu tiên học tập và pin liên lạc.",
        "fields": {
            "grade": "Cấp học của con (Cấp 1, Cấp 2, Cấp 3 hoặc lớp học)",
            "purpose": "Mục đích sử dụng chính (hoc online, lien lac, giai tri)",
            "budget": "Mức ngân sách của phụ huynh (ví dụ: 6 triệu)",
            "need_long_battery": "Có cần dung lượng pin điện thoại thật trâu để liên lạc lâu dài không (Cần pin lâu / Không quan trọng)"
        },
        "order": ["grade", "purpose", "budget", "need_long_battery"],
        "chips": {
            "grade": [
                {"text": "Cấp 1 (Lớp 1-5)", "icon": "fa-child"},
                {"text": "Cấp 2 (Lớp 6-9)", "icon": "fa-school"},
                {"text": "Cấp 3 (Lớp 10-12)", "icon": "fa-graduation-cap"}
            ],
            "purpose": [
                {"text": "Chủ yếu học tập online", "icon": "fa-book"},
                {"text": "Chỉ nghe gọi liên lạc", "icon": "fa-phone"},
                {"text": "Giải trí & Chơi game nhẹ", "icon": "fa-gamepad"}
            ],
            "budget": [
                {"text": "Dưới 4 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 4 - 7 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 7 triệu", "icon": "fa-gem"}
            ],
            "need_long_battery": [
                {"text": "Cần pin thật trâu", "icon": "fa-battery-three-quarters"},
                {"text": "Pin bình thường là được", "icon": "fa-battery-half"}
            ]
        }
    },
    "switcher": {
        "name": "Đổi điện thoại nâng cấp",
        "description": "Tư vấn nâng cấp điện thoại từ dòng cũ lên dòng mới vượt trội hơn.",
        "fields": {
            "old_phone": "Tên dòng điện thoại đang sử dụng hiện tại (ví dụ: Samsung A32)",
            "dislike_reason": "Điểm chưa hài lòng ở điện thoại cũ (chay cham, pin yeu, chup anh xau, bo nho day)",
            "budget": "Mức ngân sách dự kiến nâng cấp (ví dụ: 10 triệu)"
        },
        "order": ["old_phone", "dislike_reason", "budget"],
        "chips": {
            "dislike_reason": [
                {"text": "Chạy chậm, lag", "icon": "fa-spinner"},
                {"text": "Pin yếu nhanh hết", "icon": "fa-battery-empty"},
                {"text": "Chụp ảnh chưa đẹp", "icon": "fa-camera-flash"},
                {"text": "Bộ nhớ nhanh đầy", "icon": "fa-hdd"}
            ],
            "budget": [
                {"text": "Dưới 8 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 8 - 15 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 15 triệu", "icon": "fa-gem"}
            ]
        }
    },
    "undecided": {
        "name": "Tư vấn chung",
        "description": "Tư vấn mua điện thoại khi khách hàng chưa biết mua gì.",
        "fields": {
            "target_user": "Người sử dụng máy chính (ban than, nguoi than, con cai)",
            "purpose": "Mục đích sử dụng nhiều nhất (hoc tap, choi game, chup anh, giai tri)",
            "budget": "Mức ngân sách dự kiến (ví dụ: 7 triệu)",
            "brand_preference": "Thương hiệu điện thoại yêu thích (Samsung, Apple, Xiaomi, thương hiệu khác...)"
        },
        "order": ["target_user", "purpose", "budget", "brand_preference"],
        "chips": {
            "target_user": [
                {"text": "Mua cho bản thân", "icon": "fa-user"},
                {"text": "Mua cho bố mẹ/người thân", "icon": "fa-user-friends"},
                {"text": "Mua cho con học tập", "icon": "fa-child"}
            ],
            "purpose": [
                {"text": "Học tập & Giải trí", "icon": "fa-book-reader"},
                {"text": "Chơi game hiệu năng cao", "icon": "fa-gamepad"},
                {"text": "Chụp ảnh đẹp, sắc nét", "icon": "fa-camera"},
                {"text": "Dùng nghe gọi cơ bản", "icon": "fa-phone"}
            ],
            "budget": [
                {"text": "Dưới 5 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 5 - 10 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 10 triệu", "icon": "fa-gem"}
            ],
            "brand_preference": [
                {"text": "Samsung", "icon": "fa-mobile-alt"},
                {"text": "Apple (iPhone)", "icon": "fa-apple"},
                {"text": "Xiaomi", "icon": "fa-android"},
                {"text": "Thương hiệu nào cũng được", "icon": "fa-ellipsis-h"}
            ]
        }
    },
    "elderly": {
        "name": "Người lớn tuổi",
        "description": "Tư vấn mua điện thoại cho người lớn tuổi (bố mẹ, ông bà), ưu tiên chữ to, loa lớn, pin bền và dễ sử dụng.",
        "fields": {
            "user_age": "Độ tuổi người dùng (ví dụ: trên 60 tuổi, tầm 50-65 tuổi)",
            "need_loud_sound": "Có cần màn hình hiển thị chữ to và loa nghe gọi thật lớn không (Cần chữ & loa to / Chỉ cần nghe gọi tốt)",
            "budget": "Mức ngân sách tối đa dành cho máy (ví dụ: 4 triệu)"
        },
        "order": ["user_age", "need_loud_sound", "budget"],
        "chips": {
            "user_age": [
                {"text": "Từ 50 - 65 tuổi", "icon": "fa-user-clock"},
                {"text": "Trên 65 tuổi", "icon": "fa-blind"}
            ],
            "need_loud_sound": [
                {"text": "Cần chữ to & Loa lớn", "icon": "fa-volume-up"},
                {"text": "Nghe gọi rõ là được", "icon": "fa-phone-alt"}
            ],
            "budget": [
                {"text": "Dưới 3 triệu", "icon": "fa-wallet"},
                {"text": "Tầm 3 - 6 triệu", "icon": "fa-credit-card"},
                {"text": "Trên 6 triệu", "icon": "fa-gem"}
            ]
        }
    },
    "business": {
        "name": "Doanh nhân & Doanh nghiệp",
        "description": "Tư vấn điện thoại cao cấp, sang trọng dành cho doanh nhân, phục vụ công việc và khẳng định vị thế.",
        "fields": {
            "brand_preference": "Thương hiệu cao cấp yêu thích (Apple, Samsung Ultra/Fold...)",
            "storage_need": "Nhu cầu dung lượng lưu trữ (Tầm trung 128GB/256GB / Lưu trữ lớn 512GB - 1TB)",
            "budget": "Mức ngân sách dự kiến (ví dụ: trên 20 triệu)"
        },
        "order": ["brand_preference", "storage_need", "budget"],
        "chips": {
            "brand_preference": [
                {"text": "Apple (iPhone Pro Max)", "icon": "fa-apple"},
                {"text": "Samsung (Ultra/Fold)", "icon": "fa-mobile-alt"},
                {"text": "Hãng nào sang trọng là được", "icon": "fa-gem"}
            ],
            "storage_need": [
                {"text": "Tầm 128GB - 256GB", "icon": "fa-database"},
                {"text": "Siêu lớn 512GB - 1TB", "icon": "fa-hdd"}
            ],
            "budget": [
                {"text": "Từ 15 - 25 triệu", "icon": "fa-wallet"},
                {"text": "Trên 25 triệu (VIP)", "icon": "fa-crown"}
            ]
        }
    }
}

def contains_keyword(m_clean: str, keywords: List[str]) -> bool:
    for k in keywords:
        k_clean = k.strip()
        # Enforce word boundaries for short keywords or common Vietnamese terms
        if len(k_clean) <= 3 or k_clean in ["to", "lon", "co", "goi", "nghe", "yeu", "xau", "ro", "choi", "game", "lop", "cha", "me", "bo", "con", "hoc", "sv"]:
            pattern = r'\b' + re.escape(k_clean) + r'\b'
            if re.search(pattern, m_clean):
                return True
        else:
            if k_clean in m_clean:
                return True
    return False

def any_in(keywords: List[str], text: str) -> bool:
    return contains_keyword(text, keywords)

def detect_recommendation_flow(message: str) -> str:
    """Xác định xem tin nhắn của người dùng có kích hoạt luồng tư vấn nào không."""
    msg_clean = remove_diacritics(message.lower().strip())
    
    # 1. Phụ huynh mua cho con
    if contains_keyword(msg_clean, ["mua cho con", "mua cho chau", "cho con hoc", "con di hoc", "con hoc", "mua cho con trai", "mua cho con gai", "mua cho be"]):
        return "parent"
    # 2. Đổi điện thoại
    if contains_keyword(msg_clean, ["doi dien thoai", "doi may", "nang cap", "nang cap may", "doi may moi", "doi iphone", "doi samsung"]):
        return "switcher"
    # 3. Sinh viên / Học sinh
    if contains_keyword(msg_clean, ["sinh vien", "sv", "di hoc", "hoc sinh", "nam nhat", "nam hai", "nam ba", "nam tu", "dai hoc", "truong hoc", "lop 10", "lop 11", "lop 12"]):
        return "student"
    # 4. Người lớn tuổi (Bố mẹ/Ông bà)
    if contains_keyword(msg_clean, ["nguoi lon tuoi", "nguoi gia", "bo me", "cha me", "ong ba", "lon tuoi", "cho me", "cho bo", "cho ba", "cho ong"]):
        return "elderly"
    # 5. Doanh nhân / VIP / Cao cấp
    if contains_keyword(msg_clean, ["doanh nhan", "doanh nghiep", "vip", "cao cap", "sang trong", "fold", "flagship", "tang sep", "bieu sep"]):
        return "business"
    # 6. Người đi làm / Công nhân / Tài xế
    if any(kw in msg_clean for kw in ["di lam", "van phong", "cong viec", "lam viec", "nguoi di lam", "cong nhan", "lao dong", "tai xe", "shipper", "grab", "giao hang", "kinh doanh", "buon ban", "ban hang"]):
        return "worker"
    # 7. Chơi game
    if any(kw in msg_clean for kw in ["choi game", "gaming", "chien game", "game thu", "lien quan", "pubg", "genshin", "free fire", "ff", "toc chien"]):
        return "gamer"
    # 8. Chụp ảnh
    if any(kw in msg_clean for kw in ["chup anh", "chup hinh", "quay phim", "quay video", "selfie", "tiktok", "reels", "chup anh dep", "camera dep"]):
        return "photographer"
    # 9. Tư vấn chung
    if any(kw in msg_clean for kw in ["tu van", "tu van mua", "chua biet mua", "mua may gi", "mua dt gi", "tim dt", "mua dien thoai", "dien thoai nao tot", "mua dt nao"]):
        return "undecided"
        
    return None

def extract_flow_entities(flow_name: str, user_message: str, current_flow_data: Dict[str, Any], last_assistant_question: str, llm: Any) -> Dict[str, Any]:
    """Sử dụng LLM phân tích tin nhắn người dùng kết hợp ngữ cảnh câu hỏi trước và flow_data hiện tại để cập nhật."""
    flow = FLOWS[flow_name]
    fields_desc = "\n".join([f"- {k}: {v}" for k, v in flow["fields"].items()])
    
    current_json = json.dumps(current_flow_data, ensure_ascii=False)
    
    prompt = f"""Bạn là một trợ lý AI quản lý thông tin khách hàng cho QuangHưng Mobile.
Chúng ta đang thực hiện luồng tư vấn điện thoại '{flow_name}'.
Dữ liệu đã thu thập được từ trước:
{current_json}

Câu hỏi vừa rồi của nhân viên tư vấn (Assistant): "{last_assistant_question}"
Tin nhắn phản hồi mới nhất của khách hàng (User): "{user_message}"

Nhiệm vụ: Hãy phân tích tin nhắn phản hồi mới nhất của khách hàng để cập nhật hoặc điền thêm các trường thông tin còn thiếu.
Các trường thông tin cần quản lý và cập nhật:
{fields_desc}

Quy tắc trích xuất cực kỳ nghiêm ngặt:
1. KHÔNG ĐƯỢC đoán mò, KHÔNG tự gán giá trị mặc định (ví dụ: tự ý điền budget = 8000000 hoặc need_long_term = true) nếu người dùng CHƯA hề đề cập đến thông tin đó trong tin nhắn mới nhất hoặc lịch sử chat. Bạn BẮT BUỘC phải giữ nguyên giá trị null đối với các trường chưa được cung cấp thông tin.
2. Chỉ cập nhật hoặc sửa đổi dữ liệu khi người dùng cung cấp thông tin mới hoặc muốn thay đổi thông tin cũ trong tin nhắn phản hồi mới nhất.
3. Đối với trường student_year (nếu có), hãy chuẩn hóa:
   - "năm nhất", "năm 1", "1" -> "năm nhất"
   - "năm hai", "năm 2", "2" -> "năm hai"
   - "năm ba", "năm 3", "3" -> "năm ba"
   - "năm tư", "năm 4", "4", "cuối" -> "năm tư"
   - Nếu là học sinh trung học/tiểu học, hãy giữ nguyên số lớp của họ (ví dụ: "lớp 9", "lớp 10", "lớp 11", "lớp 12").
4. Đối với các trường ngân sách (budget), hãy luôn chuẩn hóa thành số nguyên (VND). Ví dụ: "8 triệu", "8tr", "8000k" -> 8000000.
5. Đối với các trường Có/Không (như need_long_term, need_long_battery, tiktok_reels), hãy chuẩn hóa thành true/false nếu tin nhắn thể hiện sự đồng ý hoặc phủ định.
6. Trả về kết quả dưới định dạng JSON duy nhất chứa toàn bộ các trường thông tin (cũ + mới cập nhật). 
7. CHỈ TRẢ VỀ JSON DUY NHẤT. TUYỆT ĐỐI KHÔNG kèm theo lời giải thích hoặc định dạng markdown ```json.
8. BẮT BUỘC phải giữ nguyên và kế thừa tất cả giá trị đã thu thập được từ trước (không phải null) trong dữ liệu cũ, tuyệt đối không được tự ý xóa bỏ hoặc đặt lại thành null trừ khi người dùng yêu cầu thay đổi.

JSON kết quả:"""

    try:
        res = llm.invoke(prompt)
        content = res.content.strip()
        print(f"[Entity Extract LLM Content] {content}")
        
        # Tìm tất cả khối JSON dạng dẹp {} không tham lam (non-greedy)
        import re
        candidates = re.findall(r'(\{.*?\})', content, re.DOTALL)
        data = None
        for cand in candidates:
            try:
                # Chuẩn hóa giá trị kiểu Python nếu LLM nhầm lẫn
                cand_clean = re.sub(r'\bNone\b', 'null', cand)
                cand_clean = re.sub(r'\bTrue\b', 'true', cand_clean)
                cand_clean = re.sub(r'\bFalse\b', 'false', cand_clean)
                data = json.loads(cand_clean)
                if data:
                    break
            except Exception:
                continue
                
        if not data:
            # Fallback nếu không khớp candidates hoặc parse lỗi
            content_cleaned = re.sub(r'^```json\s*', '', content)
            content_cleaned = re.sub(r'\s*```$', '', content_cleaned)
            content_cleaned = re.sub(r'\bNone\b', 'null', content_cleaned)
            content_cleaned = re.sub(r'\bTrue\b', 'true', content_cleaned)
            content_cleaned = re.sub(r'\bFalse\b', 'false', content_cleaned)
            data = json.loads(content_cleaned)
        
        # Đảm bảo budget được chuẩn hóa
        if "budget" in data and data["budget"] is not None:
            val_str = remove_diacritics(str(data["budget"]).lower())
            if not any(kw in val_str for kw in ["duoi", "tren", "den", "-", "va"]):
                data["budget"] = sanitize_budget(data["budget"])
            
        # Kế thừa giá trị cũ nếu LLM trả về null (tránh LLM tự ý xóa thông tin cũ)
        for k, v in current_flow_data.items():
            if v is not None and (k not in data or data[k] is None or data[k] == ""):
                data[k] = v
            
        # Nếu người dùng không nói gì về budget ở lượt chat hiện tại, ta bảo lưu chính xác budget cũ 
        # (tránh việc LLM tự ý chuẩn hóa chuỗi như "trên 5 triệu" thành số nguyên 5000000 ở các lượt sau)
        latest_budget_mentioned = extract_budget_text(user_message)
        if latest_budget_mentioned is None and "budget" in current_flow_data and current_flow_data["budget"] is not None:
            data["budget"] = current_flow_data["budget"]
            
        # Bộ chặn lặp câu hỏi (Loop-Breaker): Tự động trích xuất từ tiếng Việt nếu LLM bỏ sót hoặc lỗi trích xuất
        m_clean = remove_diacritics(user_message.lower().strip())
        last_q_clean = remove_diacritics(last_assistant_question.lower())
        
        # 0. budget (ngân sách - trích xuất trực tiếp)
        # Always check if a budget is explicitly mentioned in the user's latest message to allow overrides
        extracted_budget = extract_budget_text(user_message)
        if extracted_budget is not None:
            data["budget"] = extracted_budget
        
        # 1. need_long_term (cần lâu dài)
        if data.get("need_long_term") is None:
            if any(kw in last_q_clean for kw in ["lau dai", "suot", "nam hoc", "dai hoc", "ra truong", "di lam", "cap 3", "nam tu", "nam 4"]):
                if m_clean.startswith("khong") or any(kw in m_clean for kw in [" ko ", " k ", "chua", "khong can", "ko can", "ko ", "k "]):
                    data["need_long_term"] = False
                elif m_clean.startswith("co") or any(kw in m_clean for kw in ["dung", "dung roi", "chinh xac", "dung vay", "muon", "lau dai", "co lau dai", "can lau dai", "rat can", "yes"]):
                    data["need_long_term"] = True
                    
        # 2. need_long_battery (pin trâu)
        if data.get("need_long_battery") is None:
            if any(kw in last_q_clean for kw in ["pin trau", "pin khoe", "dung luong lon"]):
                if m_clean.startswith("khong") or any(kw in m_clean for kw in [" ko ", " k ", "chua", "khong can", "ko can", "ko ", "k "]):
                    data["need_long_battery"] = False
                elif m_clean.startswith("co") or any(kw in m_clean for kw in ["dung", "dung roi", "chinh xac", "dung vay", "muon", "can pin", "rat can", "pin trau", "yes"]):
                    data["need_long_battery"] = True
                    
        # 3. tiktok_reels (tiktok/reels)
        if data.get("tiktok_reels") is None:
            if any(kw in last_q_clean for kw in ["tiktok", "reels", "quay video", "quay phim"]):
                if m_clean.startswith("khong") or any(kw in m_clean for kw in [" ko ", " k ", "chua", "khong can", "ko can", "ko ", "k "]):
                    data["tiktok_reels"] = False
                elif m_clean.startswith("co") or any(kw in m_clean for kw in ["dung", "dung roi", "chinh xac", "dung vay", "muon", "co quay", "quay lam", "co chu", "yes"]):
                    data["tiktok_reels"] = True

        # 4. student_year (năm học sinh viên)
        if data.get("student_year") is None:
            if "nam nhat" in m_clean or "nam 1" in m_clean or m_clean == "1":
                data["student_year"] = "năm nhất"
            elif "nam hai" in m_clean or "nam 2" in m_clean or m_clean == "2":
                data["student_year"] = "năm hai"
            elif "nam ba" in m_clean or "nam 3" in m_clean or m_clean == "3" or "3 & 4" in m_clean or "3 va 4" in m_clean:
                data["student_year"] = "năm ba"
            elif "nam tu" in m_clean or "nam 4" in m_clean or "cuoi" in m_clean or m_clean == "4":
                data["student_year"] = "năm tư"
            else:
                grade_match = re.search(r'\blop\s*(\d+)\b', m_clean)
                if grade_match:
                    data["student_year"] = f"lớp {grade_match.group(1)}"

        # 5. game_name (tên tựa game)
        if data.get("game_name") is None:
            if contains_keyword(m_clean, ["lien quan", "toc chien", "aov", "lol", "lmht"]):
                data["game_name"] = "Liên Quân / Tốc Chiến"
            elif contains_keyword(m_clean, ["pubg", "free fire", "ff", "ban sung"]):
                data["game_name"] = "PUBG Mobile"
            elif contains_keyword(m_clean, ["genshin", "genshin impact", "honkai"]):
                data["game_name"] = "Genshin Impact (Nặng)"

        # 6. game_hours (thời gian chơi game)
        if data.get("game_hours") is None:
            if contains_keyword(m_clean, ["duoi 2", "1 tieng", "2 tieng", "1h", "2h"]):
                data["game_hours"] = "Dưới 2 tiếng/ngày"
            elif contains_keyword(m_clean, ["2-4", "2 den 4", "3 tieng", "4 tieng", "3h", "4h"]):
                data["game_hours"] = "Từ 2-4 tiếng/ngày"
            elif contains_keyword(m_clean, ["tren 4", "hon 4", "5 tieng", "nhieu", "5h"]):
                data["game_hours"] = "Trên 4 tiếng/ngày"

        # 7. camera_focus (chụp ảnh chính)
        if data.get("camera_focus") is None:
            if contains_keyword(m_clean, ["selfie", "tu suong", "truoc"]):
                data["camera_focus"] = "Chụp Selfie"
            elif contains_keyword(m_clean, ["phong canh", "du lich", "ngoai canh"]):
                data["camera_focus"] = "Chụp phong cảnh/du lịch"
            elif contains_keyword(m_clean, ["quay video", "quay phim", "gia dinh", "ban be"]):
                data["camera_focus"] = "Quay video gia đình/bạn bè"

        # 8. grade (cấp học của con)
        if data.get("grade") is None:
            if contains_keyword(m_clean, ["cap 1", "lop 1", "lop 2", "lop 3", "lop 4", "lop 5", "tieu hoc"]):
                data["grade"] = "Cấp 1 (Lớp 1-5)"
            elif contains_keyword(m_clean, ["cap 2", "lop 6", "lop 7", "lop 8", "lop 9", "thcs"]):
                data["grade"] = "Cấp 2 (Lớp 6-9)"
            elif contains_keyword(m_clean, ["cap 3", "lop 10", "lop 11", "lop 12", "thpt"]):
                data["grade"] = "Cấp 3 (Lớp 10-12)"

        # 9. dislike_reason (lý do không thích máy cũ)
        if data.get("dislike_reason") is None:
            if contains_keyword(m_clean, ["cham", "lag", "do", "yeu"]):
                data["dislike_reason"] = "Chạy chậm, lag"
            elif contains_keyword(m_clean, ["pin yeu", "nhanh het", "pin kem"]):
                data["dislike_reason"] = "Pin yếu nhanh hết"
            elif contains_keyword(m_clean, ["chup anh xau", "camera kem", "xau"]):
                data["dislike_reason"] = "Chụp ảnh chưa đẹp"
            elif contains_keyword(m_clean, ["day bo nho", "rom day", "het dung luong"]):
                data["dislike_reason"] = "Bộ nhớ nhanh đầy"

        # 10. target_user (người dùng máy chính)
        if data.get("target_user") is None:
            if contains_keyword(m_clean, ["ban than", "minh", "em", "to"]):
                data["target_user"] = "Mua cho bản thân"
            elif contains_keyword(m_clean, ["bo me", "phu huynh", "nguoi than", "ong ba", "me", "bo", "cha"]):
                data["target_user"] = "Mua cho bố mẹ/người thân"
            elif contains_keyword(m_clean, ["con", "chau", "hoc sinh"]):
                data["target_user"] = "Mua cho con học tập"

        # 11. brand_preference (thương hiệu yêu thích)
        if data.get("brand_preference") is None:
            if contains_keyword(m_clean, ["samsung", "ss"]):
                data["brand_preference"] = "Samsung"
            elif contains_keyword(m_clean, ["apple", "iphone", "ip"]):
                data["brand_preference"] = "Apple (iPhone)"
            elif contains_keyword(m_clean, ["xiaomi", "redmi", "poco"]):
                data["brand_preference"] = "Xiaomi"
            elif contains_keyword(m_clean, ["oppo"]):
                data["brand_preference"] = "Oppo"
            elif contains_keyword(m_clean, ["sao cung duoc", "nao cung duoc", "thương hiệu nào cũng được", "khong quan trong"]):
                data["brand_preference"] = "Thương hiệu nào cũng được"

        # 12. user_age (tuổi người dùng)
        if data.get("user_age") is None:
            m_no_budget = re.sub(r'\b\d+\s*(?:trieu|tr|k|tram|t)\b', '', m_clean)
            age_match = re.search(r'\b(\d+)\b', m_no_budget)
            if age_match:
                age_val = int(age_match.group(1))
                if 50 <= age_val <= 65:
                    data["user_age"] = "Từ 50 - 65 tuổi"
                elif age_val > 65:
                    data["user_age"] = "Trên 65 tuổi"
            elif "lon tuoi" in m_clean or "ong ba" in m_clean:
                data["user_age"] = "Trên 65 tuổi"
            elif "bo me" in m_clean:
                data["user_age"] = "Từ 50 - 65 tuổi"

        # 13. need_loud_sound (cần chữ & loa to)
        if data.get("need_loud_sound") is None:
            if contains_keyword(m_clean, ["chu to", "loa lon", "to", "lon"]):
                data["need_loud_sound"] = "Cần chữ to & Loa lớn"
            elif contains_keyword(m_clean, ["nghe goi", "ro"]):
                data["need_loud_sound"] = "Nghe gọi rõ là được"

        # 14. storage_need (nhu cầu lưu trữ)
        if data.get("storage_need") is None:
            if contains_keyword(m_clean, ["128", "256"]):
                data["storage_need"] = "Tầm trung 128GB/256GB"
            elif contains_keyword(m_clean, ["512", "1tb", "1 tb", "1024"]):
                data["storage_need"] = "Lưu trữ lớn 512GB - 1TB"

        # 15. work_type (tính chất công việc)
        if data.get("work_type") is None:
            if contains_keyword(m_clean, ["van phong", "lam viec", "cong so", "ngoi mot cho"]):
                data["work_type"] = "lam van phong"
            elif contains_keyword(m_clean, ["di chuyen", "ngoai troi", " grab", "shipper", "xe om"]):
                data["work_type"] = "di chuyen nhieu"

        # 16. purpose (mục đích sử dụng)
        if data.get("purpose") is None:
            if contains_keyword(m_clean, ["hoc online", "zoom", "teams", "hoc tap"]):
                data["purpose"] = "Chủ yếu học tập online"
            elif contains_keyword(m_clean, ["nghe goi", "lien lac", "goi", "nghe"]):
                data["purpose"] = "Chỉ nghe gọi liên lạc"
            elif contains_keyword(m_clean, ["giai tri", "giai chi", "gia tri", "xem phim", "game", "choi"]):
                data["purpose"] = "Giải trí & Chơi game nhẹ"
            elif contains_keyword(m_clean, ["cong viec", "email", "office"]):
                data["purpose"] = "Công việc & Email"

        # 17. duration (thời gian dự định dùng)
        if data.get("duration") is None:
            m_no_budget = re.sub(r'\b\d+\s*(?:trieu|tr|k|tram|t)\b', '', m_clean)
            if "2 nam" in m_no_budget or m_no_budget.strip() == "2":
                data["duration"] = "Dùng 2 năm"
            elif "3 nam" in m_no_budget or "4 nam" in m_no_budget or "3-4" in m_no_budget or m_no_budget.strip() == "3" or m_no_budget.strip() == "4":
                data["duration"] = "Dùng 3-4 năm"
            elif "tren 4" in m_no_budget or "5 nam" in m_no_budget or "lau dai" in m_no_budget or m_no_budget.strip() == "5":
                data["duration"] = "Trên 4 năm"

        # 18. old_phone (điện thoại cũ)
        if data.get("old_phone") is None:
            for b in ["iphone", "samsung", "xiaomi", "redmi", "poco", "oppo", "vivo", "realme", "nokia"]:
                if b in m_clean:
                    match = re.search(r'\b(' + b + r'\s+\w+(?:\s+\w+)?)\b', m_clean)
                    if match:
                        data["old_phone"] = match.group(1).title()
                        break
                    else:
                        data["old_phone"] = b.title()
                        break

        if data.get("priority") is None or data.get("priority") == "":
            detected_priorities = []
            m_lower = remove_diacritics(user_message.lower())
            m_filter = m_lower.replace("hoc sinh", "").replace("hoc vien", "").replace("sinh vien", "")
            if contains_keyword(m_filter, ["pin", "pin trau", "pin lau", "pin khoe"]):
                detected_priorities.append("pin")
            if contains_keyword(m_filter, ["hoc tap", "hoc", "di hoc", "hoc online", "hoc hanh"]):
                detected_priorities.append("hoc tap")
            if contains_keyword(m_filter, ["chup anh", "chup hinh", "selfie", "camera", "quay phim", "quay video"]):
                detected_priorities.append("chup anh")
            if contains_keyword(m_filter, ["choi game", "gaming", "chien game", "game thu", "lien quan", "pubg", "genshin"]):
                detected_priorities.append("choi game")
                
            if detected_priorities:
                data["priority"] = ", ".join(detected_priorities)
            
        return data
    except Exception as e:
        print(f"[Recommend Flow Entity Extract] Lỗi trích xuất: {e}")
        return current_flow_data

def generate_flow_question(flow_name: str, missing_field: str, history_str: str, llm: Any) -> str:
    """Sử dụng LLM để sinh ra một câu hỏi vô cùng tự nhiên và thân thiện bằng tiếng Việt cho trường thông tin còn thiếu."""
    flow = FLOWS[flow_name]
    field_desc = flow["fields"][missing_field]
    
    student_special_instruction = ""
    if missing_field == "need_long_term":
        student_special_instruction = """\nLƯU Ý ĐẶC BIỆT VỀ HỌC SINH/SINH VIÊN: 
   - Nếu khách hàng là sinh viên đại học (ví dụ: năm nhất, năm hai, năm 3, năm 4, năm cuối), khi hỏi về nhu cầu dùng lâu dài (need_long_term), bạn BẮT BUỘC phải hỏi về việc dùng máy suốt các năm học đại học hoặc dùng tiếp ra trường đi làm (Ví dụ: "Dạ mình học năm tư sắp ra trường rồi, mình có cần máy dùng lâu dài để đi làm luôn không ạ?").
   - Nếu khách hàng là học sinh phổ thông (ví dụ: lớp 9, 10, 11, 12), bạn BẮT BUỘC phải hỏi phù hợp thời gian học cấp 3 còn lại của họ (Ví dụ: "Dạ em học lớp 9, em có cần máy dùng bền bỉ suốt 3 năm học cấp 3 sắp tới không?").
   - TUYỆT ĐỐI KHÔNG hỏi lẫn lộn (ví dụ: không hỏi một sinh viên năm 4 đại học về năm học cấp 3)."""
    
    prompt = f"""Bạn là Nhân viên tư vấn bán hàng vô cùng thân thiện, nhiệt tình của cửa hàng điện thoại QuangHưng Mobile.
Dựa trên lịch sử cuộc hội thoại dưới đây, thông tin tiếp theo bạn cần thu thập từ khách hàng là: "{field_desc}".

Hãy viết một câu hỏi tự nhiên, ngắn gọn và ấm áp bằng tiếng Việt để hỏi khách hàng thông tin này.
Yêu cầu:
1. Hãy xưng hô thân mật, lịch sự (dùng linh hoạt các từ "dạ", "em", "anh/chị/bạn").
2. Viết câu hỏi trôi chảy và tự nhiên như một con người thật đang trò chuyện trực tiếp, tránh máy móc.
3. Tuyệt đối KHÔNG sử dụng ký hiệu markdown (như ** hoặc *). Hãy dùng thẻ HTML cơ bản như <strong> hoặc <br> nhen.
4. CHỈ TRẢ VỀ CÂU HỎI ĐỂ HIỂN THỊ CHO KHÁCH, TUYỆT ĐỐI KHÔNG thêm bất kỳ văn bản giải thích nào khác.
5. TUYỆT ĐỐI KHÔNG giải thích, biện minh, đối thoại lan man hoặc tự đóng vai khách hàng nói về độ tuổi. Hãy đi thẳng vào việc hỏi thông tin một cách lịch sự, tự nhiên.
6. Bạn BẮT BUỘC phải đặt câu hỏi tập trung duy nhất vào việc thu thập thông tin được chỉ định ở trên: "{field_desc}". TUYỆT ĐỐI KHÔNG tự ý chuyển sang hỏi thông tin khác khi chưa được yêu cầu.{student_special_instruction}
7. Hãy hỏi thẳng câu hỏi một cách lịch sự, ngắn gọn, KHÔNG lặp lại nguyên văn hoặc dông dài những thông tin người dùng đã cung cấp ở câu trước (ví dụ: không cần lặp lại "mua điện thoại iPhone dưới 5 triệu" khi đặt câu hỏi).

Lịch sử trò chuyện gần đây:
{history_str}

Hãy viết câu hỏi tư vấn tự nhiên:"""

    try:
        res = llm.invoke(prompt)
        return res.content.strip()
    except Exception as e:
        print(f"[Recommend Flow Question Gen] Lỗi sinh câu hỏi: {e}")
        fallback_questions = {
            "student_year": "Dạ em đang là sinh viên năm mấy rồi ạ?",
            "need_long_term": "Em cần máy dùng tốt và bền bỉ trong suốt 4 năm đại học luôn đúng không?",
            "budget": "Dạ ngân sách tối đa em dự kiến đầu tư khoảng bao nhiêu nè?",
            "priority": "Em ưu tiên nhu cầu nào nhất: pin trâu, chụp ảnh đẹp, học tập hay chơi game?",
            "work_type": "Dạ anh/chị đang làm văn phòng hay công việc hay phải di chuyển bên ngoài ạ?",
            "purpose": "Anh/chị chủ yếu dùng máy cho công việc, gọi khách hàng, email hay giải trí là chính ạ?",
            "duration": "Anh/chị dự định dùng máy này khoảng bao nhiêu năm ạ?",
            "game_name": "Dạ em hay chiến những tựa game gì nhiều nhất nè?",
            "game_hours": "Trung bình em chơi khoảng bao nhiêu tiếng mỗi ngày dợ?",
            "camera_focus": "Dạ mình thích chụp selfie, chụp phong cảnh hay quay video TikTok/Reels nhiều hơn ạ?",
            "tiktok_reels": "Dạ mình có hay quay clip đăng TikTok hay Reels không dợ?",
            "grade": "Dạ bé nhà mình đang học lớp mấy hoặc cấp mấy rồi anh/chị?",
            "need_long_battery": "Anh/chị có cần một chiếc máy có pin thật trâu để hạn chế bé phải sạc nhiều không ạ?",
            "old_phone": "Dạ hiện tại mình đang xài dòng điện thoại nào dợ anh/chị?",
            "dislike_reason": "Dòng máy hiện tại có điểm nào làm mình chưa ưng ý nhất ạ (chạy chậm, pin yếu, chụp ảnh hay bộ nhớ đầy)?",
            "target_user": "Dạ anh/chị đang tìm mua điện thoại cho bản thân, người thân hay cho con nhỏ học tập ạ?",
            "brand_preference": "Dạ anh/chị có ưu tiên thương hiệu nào như Samsung, Apple hay Xiaomi không ạ?",
            "user_age": "Dạ người sử dụng máy năm nay khoảng bao nhiêu tuổi rồi anh/chị?",
            "need_loud_sound": "Dạ anh/chị có cần màn hình hiển thị chữ to và loa nghe gọi thật lớn cho dễ xài không ạ?",
            "storage_need": "Dạ mình có nhu cầu lưu trữ nhiều tài liệu, ảnh hay video không (như 128GB, 256GB hay dung lượng siêu lớn)?"
        }
        return fallback_questions.get(missing_field, "Dạ anh/chị có yêu cầu gì thêm cho chiếc điện thoại này không ạ?")

def query_matching_products(flow_name: str, flow_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Truy vấn cơ sở dữ liệu để tìm ra các sản phẩm điện thoại phù hợp nhất (loại bỏ hoàn toàn phụ kiện)."""
    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        
        budget = flow_data.get("budget")
        brand_pref = flow_data.get("brand_preference") or flow_data.get("brand")
        
        priority_str = ""
        if flow_name == "student":
            priority_str = str(flow_data.get("priority") or "")
        elif flow_name == "gamer":
            priority_str = str(flow_data.get("priority") or "") + " gaming performance"
        elif flow_name == "photographer":
            priority_str = str(flow_data.get("camera_focus") or "") + " camera photography"
        elif flow_name == "worker":
            priority_str = str(flow_data.get("purpose") or "")
        elif flow_name == "parent":
            priority_str = str(flow_data.get("purpose") or "")
            if flow_data.get("need_long_battery"):
                priority_str += " battery pin"
        elif flow_name == "switcher":
            priority_str = str(flow_data.get("dislike_reason") or "")
        elif flow_name == "undecided":
            priority_str = str(flow_data.get("purpose") or "")
        elif flow_name == "elderly":
            priority_str = "battery screen loud basic " + str(flow_data.get("need_loud_sound") or "")
        elif flow_name == "business":
            priority_str = "premium luxury high storage " + str(flow_data.get("brand_preference") or "")
            
        priority_str = remove_diacritics(priority_str.lower())
        
        where_conds = ["sp.so_luong_ton > 0"]
        params = []
        
        if budget:
            min_price, max_price = parse_budget_range(budget)
            if min_price is not None:
                where_conds.append("sp.gia >= %s")
                params.append(min_price)
            if max_price is not None:
                where_conds.append("sp.gia <= %s")
                params.append(int(max_price * 1.1))
            
        if brand_pref and brand_pref.lower() not in ["thanh vien", "thương hiệu nào cũng được", "thương hiệu khác", "khac", "any"]:
            b_lower = brand_pref.lower()
            detected_brand = None
            if "samsung" in b_lower:
                detected_brand = "Samsung"
            elif "apple" in b_lower or "iphone" in b_lower:
                detected_brand = "Apple"
            elif "xiaomi" in b_lower or "redmi" in b_lower or "poco" in b_lower:
                detected_brand = "Xiaomi"
            elif "oppo" in b_lower:
                detected_brand = "Oppo"
            elif "vivo" in b_lower:
                detected_brand = "Vivo"
                
            if detected_brand:
                where_conds.append("hsx.ten_hang = %s")
                params.append(detected_brand)
        
        sql_query = f"""
            SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                   ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
            WHERE {" AND ".join(where_conds)}
            ORDER BY sp.gia DESC
        """
        
        cursor.execute(sql_query, tuple(params))
        products = cursor.fetchall()
        
        # LỌC BỎ PHỤ KIỆN BẰNG HÀM is_accessory
        phone_products = [p for p in products if not is_accessory(p['ten_sp'])]
        
        # Nếu không tìm thấy điện thoại nào thỏa mãn do ngân sách quá thấp hoặc bộ lọc quá chặt:
        # Lấy danh sách điện thoại rẻ nhất đang có sẵn tại cửa hàng làm gợi ý tối thiểu (Không lấy phụ kiện)
        if not phone_products:
            sql_fallback = """
                SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                       ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                FROM san_pham sp
                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                WHERE sp.so_luong_ton > 0
                ORDER BY sp.gia ASC
            """
            cursor.execute(sql_fallback)
            fallback_products = cursor.fetchall()
            phone_products = [p for p in fallback_products if not is_accessory(p['ten_sp'])][:5]
            
        cursor.close()
        conn.close()
        
        # Chấm điểm và sắp xếp lại
        scored_products = []
        for p in phone_products:
            score = 0
            p_desc = remove_diacritics(f"{p['ten_sp']} {p['ten_hang']} {p['chip']} {p['camera']} {p['pin']}").lower()
            
            if "pin" in priority_str or "battery" in priority_str:
                try:
                    pin_val = int(re.search(r'\d+', str(p['pin'])).group())
                    if pin_val >= 5000:
                        score += 3
                    elif pin_val >= 4500:
                        score += 1
                except:
                    pass
                if "pin" in p_desc or "trâu" in p_desc:
                    score += 1
            
            if "game" in priority_str or "gaming" in priority_str or "fps" in priority_str or "performance" in priority_str:
                chip_lower = str(p['chip']).lower()
                if any(k in chip_lower for k in ["snapdragon 8", "snapdragon 7", "dimensity 8", "dimensity 9", "apple a1", "m1", "m2", "pro", "bionic"]):
                    score += 4
                elif any(k in chip_lower for k in ["helio g99", "snapdragon 6"]):
                    score += 1
                
                try:
                    ram_val = int(re.search(r'\d+', str(p['ram'])).group())
                    if ram_val >= 8:
                        score += 2
                except:
                    pass
            
            if "camera" in priority_str or "chup anh" in priority_str or "selfie" in priority_str or "photo" in priority_str:
                cam_lower = str(p['camera']).lower()
                if any(k in cam_lower for k in ["50mp", "64mp", "108mp", "200mp", "pro", "ultra"]):
                    score += 3
                if "selfie" in priority_str and "truoc" in cam_lower:
                    score += 1
            
            if "hoc" in priority_str or "study" in priority_str or "long term" in priority_str:
                if p['ten_hang'] in ["Samsung", "Apple"]:
                    score += 2
                try:
                    ram_val = int(re.search(r'\d+', str(p['ram'])).group())
                    if ram_val >= 8:
                        score += 1
                except:
                    pass
            
            if budget:
                target_budget = get_target_budget(budget)
                if target_budget:
                    diff = abs(int(p['gia']) - target_budget)
                    if diff <= target_budget * 0.15:
                        score += 2
                    elif p['gia'] <= target_budget:
                        score += 1
                    
            scored_products.append((score, p))
            
        scored_products.sort(key=lambda x: -x[0])
        return [item[1] for item in scored_products[:4]]
    except Exception as e:
        print(f"[Query Matching Products] Lỗi truy vấn: {e}")
        return []

def generate_final_recommendation(flow_name: str, flow_data: Dict[str, Any], products: List[Dict[str, Any]], llm: Any) -> str:
    """Gọi LLM sinh ra lời khuyên tư vấn điện thoại cá nhân hóa kèm theo hiển thị card sản phẩm chuẩn HTML."""
    flow = FLOWS[flow_name]
    
    flow_summary = []
    for k, v in flow_data.items():
        if k in flow["fields"] and v is not None:
            flow_summary.append(f"- {flow['fields'][k]}: {v}")
    flow_summary_text = "\n".join(flow_summary)
    
    products_context = ""
    for p in products:
        price_formatted = f"{int(p['gia']):,}".replace(",", ".") + "đ" if p['gia'] else "N/A"
        price_raw = int(p['gia']) if p['gia'] else 0
        products_context += f"""\nSản phẩm: {p['ten_sp']}
  Hãng: {p['ten_hang'] or 'N/A'}
  Giá: {price_formatted}
  Giá số: {price_raw}
  ID: {p['ma_sp']}
  Ảnh: {p['anh_dai_dien'] or ''}"""
        if p.get('ram'):
            products_context += f"\n  Cấu hình: RAM {p['ram']}, Bộ nhớ trong {p['bo_nho'] or 'N/A'}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}"
            
    prompt = f"""Bạn là Chuyên gia Tư vấn Công nghệ kiêm Đại sứ Thương hiệu của QuangHưng Mobile.
Dựa trên thông tin tư vấn đã thu thập được từ khách hàng:
- Loại đối tượng/Luồng tư vấn: {flow["name"]} ({flow_name})
- Chi tiết khách hàng cung cấp:
{flow_summary_text}

Hãy tạo một bài tư vấn mua điện thoại cá nhân hóa, thuyết phục và vô cùng thân thiện bằng tiếng Việt.
Chúng ta có danh sách các sản phẩm đang có sẵn tại cửa hàng phù hợp nhất với nhu cầu của họ:
{products_context}

QUY TẮC BẮT BUỘC:
1. Hãy phân tích các sản phẩm này một cách thông minh dựa trên ưu tiên của khách hàng (ví dụ: giải thích tại sao máy này có pin tốt, cấu hình mượt cho game họ chơi, hoặc cập nhật hệ điều hành lâu dài cho sinh viên dùng 4 năm).
2. Khi giới thiệu sản phẩm cụ thể, bạn BẮT BUỘC dùng mẫu HTML sau để hiển thị card sản phẩm:
<div class="ai-product-card">
  <img src="[[Anh]]" alt="[[Ten_san_pham]]" class="ai-product-image">
  <div class="ai-product-info">
    <strong class="ai-product-name">[[Ten_san_pham]]</strong>
    <div class="ai-product-price-row">Giá: <span class="ai-product-price">[[Gia]]</span></div>
    <div class="ai-product-config">[[Cau_hinh]]</div>
    <div class="ai-product-actions">
      <a href="product-detail.html?id=[[ID]]" class="ai-product-btn-detail">Xem chi tiết</a>
      <button class="chatbot-add-cart-btn ai-product-btn-cart" data-pid="[[ID]]" data-pname="[[Ten_san_pham]]" data-pprice="[[Gia_so]]" data-pimage="[[Anh]]"><i class="fas fa-cart-plus"></i> Thêm</button>
    </div>
  </div>
</div>
(BẮT BUỘC thay [[Anh]] bằng chính xác trường "Ảnh" của sản phẩm đó, bao gồm cả "images/products/..." ở đầu. BẮT BUỘC thay thế các biến khác bằng dữ liệu chuẩn. Riêng phần [[ID]], bạn BẮT BUỘC phải sử dụng đúng ID được cung cấp cho sản phẩm đó, ví dụ: 2, 3... Tuyệt đối không tự chế ID).
3. Tuyệt đối KHÔNG sử dụng ký hiệu markdown (như ** hoặc *), hãy dùng thẻ HTML cơ bản như <strong>, <br>, <b>, <ul>, <li> nhen.
4. Xưng hô thân mật (dạ, em, anh/chị/bạn) tùy theo đối tượng. Trả lời trôi chảy, ấm áp, thuyết phục mua hàng!
5. THÔNG BÁO HẾT HÀNG / HÀNG KHÔNG KHỚP: Nếu khách hàng yêu cầu cụ thể một hãng điện thoại (ví dụ: Apple/iPhone) hoặc phân khúc giá đặc trưng trong cuộc đối thoại, nhưng trong danh sách sản phẩm đang có sẵn {products_context} không có sản phẩm nào thuộc hãng đó/phân khúc đó (tức là đã hết hàng và phải dùng hãng/mẫu khác thay thế): bạn BẮT BUỘC phải thông báo thật khéo léo, lịch sự và rõ ràng ngay từ đầu câu trả lời là mẫu máy/hãng máy họ muốn hiện đang tạm hết hàng tại cửa hàng (Ví dụ: "Dạ, hiện tại các dòng điện thoại iPhone trong phân khúc dưới 5 triệu bên em đang tạm hết hàng rồi ạ, anh/chị tham khảo thử các dòng máy cấu hình cao pin trâu của Samsung và Xiaomi này nhé..."). Tránh mập mờ gây lãng phí thời gian của khách.

Hãy viết bài tư vấn thuyết phục bằng tiếng Việt:"""

    try:
        res = llm.invoke(prompt)
        cleaned = res.content.strip()
        cleaned = re.sub(r'\|\s*ID\s*\|', '', cleaned) # Chống lộ bảng phụ nếu có
        cleaned = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', cleaned)
        cleaned = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', cleaned)
        cleaned = re.sub(r'^\s*[-*]\s+', r'<br>• ', cleaned, flags=re.MULTILINE)
        
        # Trích xuất và bảo vệ các thẻ HTML card để không bị chèn <br> làm hỏng giao diện
        html_blocks = []
        def save_html(m):
            html_blocks.append(m.group(0))
            return f"___HTML_BLOCK_HOLDER_{len(html_blocks)-1}___"
        
        cleaned = re.sub(r'(<div class="ai-product-card">.*?</div>)', save_html, cleaned, flags=re.DOTALL)
        
        # Thay thế xuống dòng thành <br> cho phần văn bản thường
        cleaned = cleaned.replace('\n', '<br>')
        
        # Khôi phục các thẻ HTML card và dọn dẹp khoảng trắng/xuòng dòng thừa bên trong
        for i, block in enumerate(html_blocks):
            block_clean = re.sub(r'>\s*\n\s*<', '><', block)
            block_clean = block_clean.replace('\n', '').replace('\r', '')
            cleaned = cleaned.replace(f"___HTML_BLOCK_HOLDER_{i}___", block_clean)
            
        cleaned = re.sub(r'(<br>\s*){3,}', r'<br><br>', cleaned)
        return cleaned
    except Exception as e:
        print(f"[Generate Final Rec] Lỗi sinh tư vấn: {e}")
        return "Dạ hiện tại bên em có một vài sản phẩm rất tốt, em đã hiển thị danh sách chi tiết bên dưới để anh/chị tham khảo rồi ạ."
