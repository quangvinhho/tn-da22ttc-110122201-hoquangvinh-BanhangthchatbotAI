import pandas as pd
from sklearn.neighbors import NearestNeighbors
from mlxtend.frequent_patterns import apriori, association_rules
import random
import os
import time
import json
import mysql.connector
from dotenv import load_dotenv

load_dotenv(dotenv_path="../backend/.env")

_IS_PROD = os.getenv("NODE_ENV") == "production" or os.getenv("ENV") == "production"
if _IS_PROD and not os.getenv("DB_PASSWORD"):
    raise SystemExit("FATAL: DB_PASSWORD chưa set ở production (recommend_engine).")
if not os.getenv("DB_PASSWORD"):
    print("WARN: DB_PASSWORD chưa set — recommend_engine dùng default dev. Không an toàn cho production.")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASSWORD", "Vinh123456789@")
DB_NAME = os.getenv("DB_NAME", "QHUNG")

# Cache cho brand map — tránh DB hit mỗi lần recommend
_BRAND_MAP_CACHE = {"data": {}, "ts": 0.0}
_BRAND_MAP_TTL = 300  # 5 phút

# Cấu hình tham số gợi ý
CONFIG_FILE = "recommend_config.json"
DEFAULT_CONFIG = {
    "k_neighbors": 5,
    "min_support": 0.01,
    "min_threshold": 0.5
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config file: {e}")
    return DEFAULT_CONFIG.copy()

def save_config(config_data):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving config file: {e}")
        return False

def train_knn_model(user_item_matrix, k_neighbors=5):
    """
    Huấn luyện mô hình Collaborative Filtering dựa trên KNN.
    user_item_matrix: DataFrame có index là user_id, columns là product_id, value là số lượng/ratings
    """
    if user_item_matrix is None or user_item_matrix.empty:
        return None
    
    # Đảm bảo n_neighbors không vượt quá số lượng user mẫu
    n_neighbors = min(k_neighbors, len(user_item_matrix))
    if n_neighbors < 1:
        n_neighbors = 1
    
    # KNN với cosine similarity cho recommendation
    model = NearestNeighbors(metric='cosine', algorithm='brute', n_neighbors=n_neighbors)
    # Điền NA bằng 0
    matrix_filled = user_item_matrix.fillna(0)
    model.fit(matrix_filled)
    return (model, matrix_filled)

def train_apriori_model(transactions_df, min_support=0.01, min_threshold=0.5):
    """
    Huấn luyện mô hình Khai phá luật kết hợp (Association Rules) - Apriori.
    transactions_df: DataFrame One-Hot Encoding chứa lịch sử mua hàng
                     Mỗi hàng là 1 đơn hàng, mỗi cột là 1 sản phẩm (giá trị True/False hoặc 1/0)
    """
    if transactions_df is None or transactions_df.empty:
        return None
        
    try:
        # 1. Tìm tập phổ biến
        frequent_itemsets = apriori(transactions_df, min_support=min_support, use_colnames=True)
        if frequent_itemsets.empty:
            return None
            
        # 2. Sinh luật kết hợp
        rules = association_rules(frequent_itemsets, metric="lift", min_threshold=min_threshold)
        return rules
    except Exception as e:
        print(f"Error training Apriori: {e}")
        return None

def get_knn_recommendations(model_data, user_id, n_recommendations=5):
    """
    Lấy danh sách product_id gợi ý từ KNN.
    """
    model, matrix = model_data
    if user_id not in matrix.index:
        return []
        
    # Lấy vector của user
    user_vector = matrix.loc[user_id].values.reshape(1, -1)
    
    # Tìm k users giống nhất
    n_neighbors = min(model.n_neighbors, len(matrix))
    if n_neighbors <= 1:
        return []
        
    distances, indices = model.kneighbors(user_vector, n_neighbors=n_neighbors)
    
    # Lấy các users tương đồng ngoài bản thân
    similar_users = indices.flatten()[1:]
    
    recommended_items = set()
    for similar_user_idx in similar_users:
        similar_user_id = matrix.index[similar_user_idx]
        user_items = matrix.loc[similar_user_id]
        # Các sản phẩm user tương đồng đã mua/click (value > 0)
        items_bought = user_items[user_items > 0].index.tolist()
        for item in items_bought:
            recommended_items.add(item)
            if len(recommended_items) >= n_recommendations:
                break
        if len(recommended_items) >= n_recommendations:
            break
            
    return list(recommended_items)

def get_apriori_recommendations(rules, current_cart_items):
    """
    Lấy danh sách các sản phẩm nên gợi ý dựa trên giỏ hàng hiện tại qua luật kết hợp.
    """
    if rules is None or rules.empty or not current_cart_items:
        return []
        
    recommended_items = set()
    cart_set = frozenset(current_cart_items)
    
    # Tìm luật mà 'antecedents' (sản phẩm trong giỏ) là một tập con
    for idx, row in rules.iterrows():
        antecedents = row['antecedents']
        consequents = row['consequents']
        
        # Nếu giỏ hàng chứa hoặc một phần của antecedents
        if antecedents.issubset(cart_set):
            for item in consequents:
                if item not in cart_set:
                    recommended_items.add(item)
                    
    return list(recommended_items)


import sqlalchemy

def fetch_data_from_db():
    try:
        import urllib.parse
        encoded_pass = urllib.parse.quote_plus(DB_PASS)
        engine = sqlalchemy.create_engine(f"mysql+mysqlconnector://{DB_USER}:{encoded_pass}@{DB_HOST}/{DB_NAME}")
        
        # 1. User-Item Data for KNN - Kết hợp lượt xem (weight 1) và đơn hàng (weight 5)
        query_knn = """
            SELECT ma_kh, ma_sp, SUM(score) AS total_qty
            FROM (
                SELECT ma_kh, ma_sp, so_lan_xem * 1 AS score
                FROM lich_su_xem_san_pham
                WHERE ma_kh IS NOT NULL
                UNION ALL
                SELECT dh.ma_kh, ct.ma_sp, ct.so_luong * 5 AS score
                FROM don_hang dh
                JOIN chi_tiet_don_hang ct ON dh.ma_don = ct.ma_don
                WHERE dh.ma_kh IS NOT NULL
            ) combined
            GROUP BY ma_kh, ma_sp
        """
        df_knn = pd.read_sql(query_knn, engine)
        
        # 2. Transaction Data for Apriori
        query_apriori = """
            SELECT ma_don, ma_sp FROM chi_tiet_don_hang
        """
        df_apriori = pd.read_sql(query_apriori, engine)
        
        engine.dispose()
        return df_knn, df_apriori
    except Exception as e:
        print(f"Error fetching data from DB: {e}")
        return None, None

_last_train_time = 0.0
_users_count = 0
_items_count = 0
_rules_count = 0

def init_models_from_db():
    global _last_train_time, _users_count, _items_count, _rules_count
    print("Loading data for training AI Recommendation from DB...")
    df_knn, df_apriori = fetch_data_from_db()
    
    knn_data = None
    apriori_rules = None
    
    # Load parameters from config
    config = load_config()
    k_neighbors = config.get("k_neighbors", 5)
    min_support = config.get("min_support", 0.01)
    min_threshold = config.get("min_threshold", 0.5)
    
    # Process KNN
    if df_knn is not None and not df_knn.empty:
        user_item_matrix = pd.pivot_table(df_knn, values='total_qty', index='ma_kh', columns='ma_sp', fill_value=0)
        _users_count = len(user_item_matrix)
        _items_count = len(user_item_matrix.columns)
        knn_data = train_knn_model(user_item_matrix, k_neighbors=k_neighbors)
        print("Training KNN (Collaborative Filtering) successful!")
    else:
        _users_count = 0
        _items_count = 0
        
    # Process Apriori
    if df_apriori is not None and not df_apriori.empty:
        # Create one-hot encoding
        basket = df_apriori.groupby(['ma_don', 'ma_sp'])['ma_sp'].count().unstack().reset_index().fillna(0).set_index('ma_don')
        basket_bool = basket.map(lambda x: 1 if x > 0 else 0).astype(bool)
        apriori_rules = train_apriori_model(basket_bool, min_support=min_support, min_threshold=min_threshold)
        if apriori_rules is not None:
            _rules_count = len(apriori_rules)
        else:
            _rules_count = 0
        print("Training Apriori (Association Rules) successful!")
    else:
        _rules_count = 0
        
    _last_train_time = time.time()
    return knn_data, apriori_rules

# Khởi tạo instance toàn cục
_knn_store, _apriori_store = init_models_from_db()

# [MỚI] Auto re-train mỗi 6 giờ — đảm bảo model bám theo đơn hàng mới phát sinh
import threading
_RETRAIN_INTERVAL_SEC = 6 * 3600  # 6h

def _scheduled_retrain():
    global _knn_store, _apriori_store
    try:
        print("[Retrain] Re-training KNN + Apriori from DB...")
        new_knn, new_apriori = init_models_from_db()
        if new_knn is not None:
            _knn_store = new_knn
        if new_apriori is not None:
            _apriori_store = new_apriori
        print("[Retrain] Done.")
    except Exception as e:
        print(f"[Retrain] Error: {e}")
    finally:
        t = threading.Timer(_RETRAIN_INTERVAL_SEC, _scheduled_retrain)
        t.daemon = True
        t.start()

_retrain_timer = threading.Timer(_RETRAIN_INTERVAL_SEC, _scheduled_retrain)
_retrain_timer.daemon = True
_retrain_timer.start()
print(f"[Retrain] Scheduled every {_RETRAIN_INTERVAL_SEC // 3600}h.")

def get_interest_recommendations(user_id):
    """
    Lấy danh sách sản phẩm gợi ý dựa trên sở thích lưu trong so_thich_khach_hang.
    """
    if not user_id:
        return []
    
    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        
        # Lấy sở thích của user
        cursor.execute("SELECT tu_khoa FROM so_thich_khach_hang WHERE ma_kh = %s", (user_id,))
        rows = cursor.fetchall()
        interests = [r['tu_khoa'].lower() for r in rows]
        
        if not interests:
            conn.close()
            return []
            
        # Xây dựng các điều kiện truy vấn sản phẩm dựa trên sở thích
        conditions = []
        params = []
        
        for interest in interests:
            # 1. Hãng sản xuất
            if 'apple' in interest:
                conditions.append("(hsx.ten_hang = 'Apple' OR sp.ten_sp LIKE %s)")
                params.append('%iphone%')
            elif 'samsung' in interest:
                conditions.append("(hsx.ten_hang = 'Samsung' OR sp.ten_sp LIKE %s)")
                params.append('%galaxy%')
            elif 'xiaomi' in interest:
                conditions.append("(hsx.ten_hang = 'Xiaomi' OR sp.ten_sp LIKE %s)")
                params.append('%xiaomi%')
            elif 'oppo' in interest or 'vivo' in interest:
                conditions.append("(hsx.ten_hang = 'Oppo' OR hsx.ten_hang = 'Vivo' OR sp.ten_sp LIKE %s OR sp.ten_sp LIKE %s)")
                params.extend(['%oppo%', '%vivo%'])
            
            # 2. Đặc tính kỹ thuật (sử dụng cấu hình ch hoặc filter qua tên nếu cấu hình trống)
            elif 'gaming' in interest or 'chơi game' in interest:
                conditions.append("(ch.ram LIKE %s OR ch.ram LIKE %s OR ch.chip LIKE %s OR ch.chip LIKE %s OR sp.ten_sp LIKE %s OR sp.ten_sp LIKE %s)")
                params.extend(['%8gb%', '%12gb%', '%snapdragon 8%', '%apple a1%', '%pro%', '%ultra%'])
            elif 'camera' in interest or 'chụp ảnh' in interest:
                conditions.append("(ch.camera LIKE %s OR ch.camera LIKE %s OR sp.ten_sp LIKE %s OR sp.ten_sp LIKE %s)")
                params.extend(['%50mp%', '%108mp%', '%pro%', '%ultra%'])
            elif 'battery' in interest or 'pin' in interest:
                conditions.append("(ch.pin LIKE %s OR ch.pin LIKE %s OR sp.ten_sp LIKE %s)")
                params.extend(['%5000%', '%6000%', '%plus%'])
            
            # 3. Phân khúc giá
            elif 'luxury' in interest or 'sang trọng' in interest:
                conditions.append("sp.gia >= 15000000")
            elif 'budget' in interest or 'giá rẻ' in interest or 'sinh viên' in interest:
                conditions.append("sp.gia < 8000000")
                
        if not conditions:
            conn.close()
            return []
            
        # Truy vấn các sản phẩm thỏa mãn ít nhất một trong các điều kiện
        query = f"""
            SELECT sp.ma_sp 
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
            WHERE sp.so_luong_ton > 0 AND ({" OR ".join(conditions)})
            ORDER BY sp.ngay_cap_nhat DESC
            LIMIT 10
        """
        cursor.execute(query, tuple(params))
        products = cursor.fetchall()
        
        conn.close()
        return [p['ma_sp'] for p in products]
    except Exception as e:
        print(f"Error getting interest recommendations: {e}")
        return []

def _normalize_pid(item):
    """Chuẩn hóa product_id sang int nếu có thể, fallback giữ nguyên."""
    try:
        return int(item)
    except (ValueError, TypeError):
        return item

def _fetch_brand_map(pids):
    """Lấy {pid: ten_hang} cho list product_id — dùng để diversity round-robin.
    Có cache 5 phút tránh DB hit mỗi recommend call.
    """
    if not pids:
        return {}
    # Lọc chỉ pid integer
    int_pids = [p for p in pids if isinstance(p, int)]
    if not int_pids:
        return {}

    now = time.time()
    cached = _BRAND_MAP_CACHE["data"]
    fresh = (now - _BRAND_MAP_CACHE["ts"]) < _BRAND_MAP_TTL

    # Nếu cache còn fresh và đủ tất cả pid yêu cầu thì trả luôn
    if fresh and all(p in cached for p in int_pids):
        return {p: cached[p] for p in int_pids}

    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        placeholders = ','.join(['%s'] * len(int_pids))
        cursor.execute(
            f"SELECT sp.ma_sp, hsx.ten_hang FROM san_pham sp "
            f"LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang "
            f"WHERE sp.ma_sp IN ({placeholders})",
            tuple(int_pids)
        )
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        result = {r['ma_sp']: (r['ten_hang'] or 'unknown') for r in rows}
        # Cập nhật cache (merge với data cũ để tăng dần coverage)
        cached.update(result)
        _BRAND_MAP_CACHE["ts"] = now
        return result
    except Exception as e:
        print(f"[Diversity] Lỗi fetch brand map: {e}")
        return {}

def _apply_diversity(sorted_pids, brand_map, max_per_brand=2):
    """
    Round-robin re-arrange để tránh quá max_per_brand SP cùng hãng liên tiếp.
    Giữ nguyên tổng list, chỉ tráo thứ tự.
    """
    if not sorted_pids:
        return []
    result = []
    pool = list(sorted_pids)
    brand_count = {}  # đếm số SP của mỗi brand đã chèn LIÊN TIẾP gần đây

    while pool:
        chosen_idx = None
        for i, pid in enumerate(pool):
            b = brand_map.get(pid, 'unknown')
            # Đếm số brand này đã xuất hiện trong window 2 cuối
            recent_brands = [brand_map.get(p, 'unknown') for p in result[-max_per_brand:]]
            if recent_brands.count(b) < max_per_brand:
                chosen_idx = i
                break
        if chosen_idx is None:
            # Không tìm thấy SP nào "đa dạng" — bắt buộc chọn item đầu
            chosen_idx = 0
        result.append(pool.pop(chosen_idx))
    return result

def mock_get_recommendation(user_id=None, cart_items=None):
    """
    Hybrid recommendation:
      - Content-based (so_thich_khach_hang): trọng số 5
      - Collaborative (KNN cosine): trọng số 3 (decay theo thứ hạng)
      - Association Rules (Apriori): trọng số 2
    Sau scoring → diversity round-robin: tối đa 2 SP cùng hãng trong 2 vị trí liên tiếp.
    Trả về list product_id sắp xếp theo độ ưu tiên.
    """
    scores = {}  # {pid: total_score}

    # --- A. Content-based (sở thích lưu DB) ---
    if user_id:
        try:
            content_recs = get_interest_recommendations(user_id)
            for i, pid in enumerate(content_recs):
                pid = _normalize_pid(pid)
                # Item đầu được +5, giảm dần (tối thiểu +2)
                w = max(5.0 - i * 0.3, 2.0)
                scores[pid] = scores.get(pid, 0) + w
        except Exception as e:
            print(f"[Hybrid] Content-based lỗi: {e}")

    # --- B. Collaborative Filtering KNN ---
    if user_id and _knn_store:
        try:
            knn_recs = get_knn_recommendations(_knn_store, user_id)
            for i, pid in enumerate(knn_recs):
                pid = _normalize_pid(pid)
                # Tối đa +3, giảm dần xuống +1
                w = max(3.0 - i * 0.3, 1.0)
                scores[pid] = scores.get(pid, 0) + w
        except Exception as e:
            print(f"[Hybrid] KNN lỗi: {e}")

    # --- C. Apriori Cross-sell ---
    if cart_items and _apriori_store is not None:
        try:
            apriori_recs = get_apriori_recommendations(_apriori_store, cart_items)
            for i, pid in enumerate(apriori_recs):
                pid = _normalize_pid(pid)
                # Tối đa +2, giảm xuống +0.5
                w = max(2.0 - i * 0.2, 0.5)
                scores[pid] = scores.get(pid, 0) + w
        except Exception as e:
            print(f"[Hybrid] Apriori lỗi: {e}")

    if not scores:
        return []

    # Sort theo score (tie-break: pid lớn = SP mới hơn = ưu tiên)
    sorted_pids = sorted(
        scores.keys(),
        key=lambda p: (-scores[p], -(p if isinstance(p, int) else 0))
    )

    # --- DIVERSITY round-robin theo brand ---
    brand_map = _fetch_brand_map(sorted_pids)
    diversified = _apply_diversity(sorted_pids, brand_map, max_per_brand=2)

    # Log lightweight để debug (giấu chi tiết score)
    top_log = ', '.join([f"#{p}({brand_map.get(p, '?')[:6]}={scores[p]:.1f})" for p in diversified[:5]])
    print(f"[Hybrid] user={user_id} top5: {top_log}")

    return diversified

def extract_interests_from_history(user_id):
    """
    Trích xuất sở thích từ lịch sử tìm kiếm và chat của khách hàng.
    """
    if not user_id:
        return []

    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        
        # 1. Lấy lịch sử tìm kiếm (chỉ lấy 5 lượt gần nhất để bám sát sở thích hiện tại)
        cursor.execute("SELECT tu_khoa FROM du_lieu_tim_kiem WHERE ma_kh = %s ORDER BY thoi_gian DESC LIMIT 5", (user_id,))
        searches = cursor.fetchall()
        
        # 2. Lấy lịch sử chat (chỉ lấy 5 tin nhắn gần nhất)
        cursor.execute("SELECT noi_dung FROM lich_su_chatbot WHERE ma_kh = %s AND vai_tro = 'user' ORDER BY thoi_gian DESC LIMIT 5", (user_id,))
        chats = cursor.fetchall()
        
        conn.close()
        
        all_text = " ".join([s['tu_khoa'] for s in searches]) + " " + " ".join([c['noi_dung'] for c in chats])
        all_text = all_text.lower()
        
        extracted_interests = set()
        
        # Simple mapping logic (Keyword matching)
        if any(word in all_text for word in ['apple', 'iphone', 'macbook', 'ipad', 'ios']):
            extracted_interests.add('apple')
        if any(word in all_text for word in ['samsung', 'galaxy', 'z fold', 'z flip']):
            extracted_interests.add('samsung')
        if any(word in all_text for word in ['xiaomi', 'redmi', 'poco']):
            extracted_interests.add('xiaomi')
        if any(word in all_text for word in ['oppo', 'vivo', 'reno']):
            extracted_interests.add('oppo')
        if any(word in all_text for word in ['game', 'chơi game', 'gaming', 'pubg', 'liên quân']):
            extracted_interests.add('gaming')
        if any(word in all_text for word in ['chụp ảnh', 'camera', 'quay phim', 'đẹp']):
            extracted_interests.add('camera')
        if any(word in all_text for word in ['pin', 'trâu', 'sạc nhanh', 'lâu']):
            extracted_interests.add('battery')
        if any(word in all_text for word in ['sang trọng', 'cao cấp', 'đắt', 'pro max', 'ultra']):
            extracted_interests.add('luxury')
        if any(word in all_text for word in ['giá rẻ', 'rẻ', 'sinh viên', 'dưới', 'vừa túi tiền']):
            extracted_interests.add('budget')
            
        return list(extracted_interests)
    except Exception as e:
        print(f"Error extracting interests: {e}")
        return []

def get_model_status():
    config = load_config()
    return {
        "status": "success",
        "last_train_time": _last_train_time,
        "users_count": _users_count,
        "items_count": _items_count,
        "rules_count": _rules_count,
        "config": config
    }

def trigger_retrain():
    global _knn_store, _apriori_store
    new_knn, new_apriori = init_models_from_db()
    if new_knn is not None:
        _knn_store = new_knn
    if new_apriori is not None:
        _apriori_store = new_apriori
    return get_model_status()

def explain_recommendations(user_id, cart_items=None):
    """
    Sinh gợi ý và trả về chi tiết lý do (explanation) + điểm số cho từng sản phẩm gợi ý
    """
    explanation_map = {} # {pid: { "knn": score, "apriori": score, "content": score, "total": score }}
    
    # Ép kiểu int cho user_id
    try:
        user_id_int = int(user_id) if user_id is not None else None
    except ValueError:
        user_id_int = user_id

    # --- A. Content-based (sở thích lưu DB) ---
    if user_id_int:
        try:
            content_recs = get_interest_recommendations(user_id_int)
            for i, pid in enumerate(content_recs):
                pid = _normalize_pid(pid)
                # Item đầu được +5, giảm dần (tối thiểu +2)
                w = max(5.0 - i * 0.3, 2.0)
                if pid not in explanation_map:
                    explanation_map[pid] = {"knn": 0.0, "apriori": 0.0, "content": 0.0, "total": 0.0}
                explanation_map[pid]["content"] = w
                explanation_map[pid]["total"] += w
        except Exception as e:
            print(f"[Explain] Content-based lỗi: {e}")

    # --- B. Collaborative Filtering KNN ---
    if user_id_int and _knn_store:
        try:
            knn_recs = get_knn_recommendations(_knn_store, user_id_int)
            for i, pid in enumerate(knn_recs):
                pid = _normalize_pid(pid)
                # Tối đa +3, giảm dần xuống +1
                w = max(3.0 - i * 0.3, 1.0)
                if pid not in explanation_map:
                    explanation_map[pid] = {"knn": 0.0, "apriori": 0.0, "content": 0.0, "total": 0.0}
                explanation_map[pid]["knn"] = w
                explanation_map[pid]["total"] += w
        except Exception as e:
            print(f"[Explain] KNN lỗi: {e}")

    # --- C. Apriori Cross-sell ---
    if cart_items and _apriori_store is not None:
        try:
            apriori_recs = get_apriori_recommendations(_apriori_store, cart_items)
            for i, pid in enumerate(apriori_recs):
                pid = _normalize_pid(pid)
                # Tối đa +2, giảm xuống +0.5
                w = max(2.0 - i * 0.2, 0.5)
                if pid not in explanation_map:
                    explanation_map[pid] = {"knn": 0.0, "apriori": 0.0, "content": 0.0, "total": 0.0}
                explanation_map[pid]["apriori"] = w
                explanation_map[pid]["total"] += w
        except Exception as e:
            print(f"[Explain] Apriori lỗi: {e}")

    if not explanation_map:
        return []

    # Sort theo score (tie-break: pid lớn = SP mới hơn = ưu tiên)
    sorted_pids = sorted(
        explanation_map.keys(),
        key=lambda p: (-explanation_map[p]["total"], -(p if isinstance(p, int) else 0))
    )

    # --- DIVERSITY round-robin theo brand ---
    brand_map = _fetch_brand_map(sorted_pids)
    diversified_pids = _apply_diversity(sorted_pids, brand_map, max_per_brand=2)

    # Lấy thông tin chi tiết sản phẩm từ CSDL để hiển thị tên, hãng, giá
    results = []
    if diversified_pids:
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor(dictionary=True)
            int_pids = [p for p in diversified_pids if isinstance(p, int)]
            if int_pids:
                placeholders = ','.join(['%s'] * len(int_pids))
                query = f"""
                    SELECT sp.ma_sp, sp.ten_sp, sp.gia, hsx.ten_hang
                    FROM san_pham sp
                    LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                    WHERE sp.ma_sp IN ({placeholders})
                """
                cursor.execute(query, tuple(int_pids))
                db_products = {p['ma_sp']: p for p in cursor.fetchall()}
            else:
                db_products = {}
            cursor.close()
            conn.close()
            
            for rank, pid in enumerate(diversified_pids, start=1):
                p_info = db_products.get(pid, {"ten_sp": f"Sản phẩm #{pid}", "ten_hang": "N/A", "gia": 0})
                explanation = explanation_map[pid]
                
                # Tạo chuỗi mô tả các nguồn
                sources = []
                if explanation["knn"] > 0:
                    sources.append(f"Lọc cộng tác KNN (+{explanation['knn']:.1f})")
                if explanation["apriori"] > 0:
                    sources.append(f"Luật kết hợp Apriori (+{explanation['apriori']:.1f})")
                if explanation["content"] > 0:
                    sources.append(f"Sở thích cá nhân hóa (+{explanation['content']:.1f})")
                
                results.append({
                    "rank": rank,
                    "ma_sp": pid,
                    "ten_sp": p_info["ten_sp"],
                    "ten_hang": p_info["ten_hang"] or "N/A",
                    "gia": p_info["gia"],
                    "score": round(explanation["total"], 2),
                    "explanation": " + ".join(sources) or "Gợi ý bổ sung"
                })
        except Exception as db_err:
            print(f"[Explain] DB error: {db_err}")
            for rank, pid in enumerate(diversified_pids, start=1):
                explanation = explanation_map[pid]
                results.append({
                    "rank": rank,
                    "ma_sp": pid,
                    "ten_sp": f"Sản phẩm #{pid}",
                    "ten_hang": "N/A",
                    "gia": 0,
                    "score": round(explanation["total"], 2),
                    "explanation": "Gợi ý thuật toán"
                })
                
    return results

def get_similar_customers_overview():
    """
    Tính toán và trả về danh sách tổng quan các khách hàng cùng gu mua sắm.
    Mỗi phần tử chứa:
      - Khách hàng gốc (ma_kh, ho_ten, email, sp_da_mua)
      - Khách hàng có gu giống nhất (ma_kh, ho_ten, email, do_tuong_dong, sp_chung, sp_goi_y)
    """
    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        
        # 1. Lấy thông tin tất cả khách hàng
        cursor.execute("SELECT ma_kh, ho_ten, email FROM khach_hang")
        customers = {c['ma_kh']: c for c in cursor.fetchall()}
        
        # 2. Lấy tất cả lịch sử mua hàng (không tính đơn hủy)
        query = """
            SELECT dh.ma_kh, ct.ma_sp, sp.ten_sp, sp.anh_dai_dien, sp.gia, hsx.ten_hang
            FROM don_hang dh
            JOIN chi_tiet_don_hang ct ON dh.ma_don = ct.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            WHERE dh.ma_kh IS NOT NULL AND dh.trang_thai != 'cancelled'
        """
        cursor.execute(query)
        purchases_raw = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # 3. Phân nhóm sản phẩm đã mua theo khách hàng
        user_purchases = {}
        for row in purchases_raw:
            uid = row['ma_kh']
            pid = row['ma_sp']
            if uid not in user_purchases:
                user_purchases[uid] = {}
            user_purchases[uid][pid] = {
                "ma_sp": pid,
                "ten_sp": row['ten_sp'],
                "anh_dai_dien": row['anh_dai_dien'] or "images/placeholder.svg",
                "gia": row['gia'],
                "ten_hang": row['ten_hang'] or "N/A"
            }
            
        results = []
        
        # 4. Tính toán độ tương đồng Jaccard giữa các khách hàng
        uids = list(user_purchases.keys())
        for u in uids:
            u_info = customers.get(u, {"ho_ten": f"Khách hàng #{u}", "email": "N/A"})
            u_products = user_purchases[u]
            u_pids = set(u_products.keys())
            
            similar_list = []
            
            for v in uids:
                if u == v:
                    continue
                v_products = user_purchases[v]
                v_pids = set(v_products.keys())
                intersection = u_pids.intersection(v_pids)
                union = u_pids.union(v_pids)
                
                if not union:
                    continue
                similarity = len(intersection) / len(union)
                if similarity > 0:
                    similar_list.append((similarity, v))
            
            similar_list.sort(key=lambda x: -x[0])
            top_similar = similar_list[:3]
            
            similar_users_info = []
            for similarity, match_uid in top_similar:
                actual_v_info = customers.get(match_uid, {"ho_ten": f"Khách hàng #{match_uid}", "email": "N/A"})
                v_products = user_purchases[match_uid]
                
                # Sản phẩm chung
                common_products = []
                common_pids = u_pids.intersection(v_products.keys())
                for pid in common_pids:
                    common_products.append(u_products[pid])
                    
                # Sản phẩm v đã mua mà u chưa mua (Gợi ý mua chéo)
                recommended_products = []
                rec_pids = set(v_products.keys()) - u_pids
                for pid in rec_pids:
                    recommended_products.append(v_products[pid])
                
                similar_users_info.append({
                    "ma_kh": match_uid,
                    "ho_ten": actual_v_info['ho_ten'],
                    "email": actual_v_info['email'],
                    "similarity_percent": round(similarity * 100),
                    "common_products": common_products,
                    "recommended_products": recommended_products
                })
            
            results.append({
                "ma_kh": u,
                "ho_ten": u_info['ho_ten'],
                "email": u_info['email'],
                "sp_da_mua": list(u_products.values()),
                "similar_users": similar_users_info
            })
            
        return results
    except Exception as e:
        print(f"Error calculating similar customers overview: {e}")
        return []

def get_association_rules_overview():
    """
    Trích xuất danh sách các luật kết hợp (Apriori) từ _apriori_store,
    sau đó truy vấn CSDL để lấy thông tin chi tiết của từng sản phẩm.
    """
    global _apriori_store
    if _apriori_store is None or _apriori_store.empty:
        return []
        
    try:
        # 1. Thu thập tất cả các ID sản phẩm duy nhất xuất hiện trong các luật
        product_ids = set()
        for idx, row in _apriori_store.iterrows():
            product_ids.update(row['antecedents'])
            product_ids.update(row['consequents'])
            
        # 2. Truy vấn chi tiết sản phẩm từ cơ sở dữ liệu
        product_details = {}
        if product_ids:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor(dictionary=True)
            
            # Đảm bảo ép kiểu các ID sản phẩm sang kiểu số nguyên hợp lệ
            int_pids = []
            for pid in product_ids:
                try:
                    int_pids.append(int(pid))
                except (ValueError, TypeError):
                    continue
                    
            if int_pids:
                placeholders = ','.join(['%s'] * len(int_pids))
                query = f"""
                    SELECT sp.ma_sp, sp.ten_sp, sp.anh_dai_dien, sp.gia, hsx.ten_hang
                    FROM san_pham sp
                    LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                    WHERE sp.ma_sp IN ({placeholders})
                """
                cursor.execute(query, tuple(int_pids))
                for row in cursor.fetchall():
                    product_details[row['ma_sp']] = {
                        "ma_sp": row['ma_sp'],
                        "ten_sp": row['ten_sp'],
                        "anh_dai_dien": row['anh_dai_dien'] or "images/placeholder.svg",
                        "gia": row['gia'],
                        "ten_hang": row['ten_hang'] or "N/A"
                    }
            cursor.close()
            conn.close()
            
        # 3. Định dạng kết quả trả về
        rules_list = []
        for idx, row in _apriori_store.iterrows():
            ant_ids = list(row['antecedents'])
            con_ids = list(row['consequents'])
            
            # Lấy thông tin chi tiết cho các sản phẩm chính (antecedents)
            ant_products = []
            for pid in ant_ids:
                try:
                    pid_key = int(pid)
                except (ValueError, TypeError):
                    pid_key = pid
                p_info = product_details.get(pid_key, {
                    "ma_sp": pid,
                    "ten_sp": f"Sản phẩm #{pid}",
                    "anh_dai_dien": "images/placeholder.svg",
                    "gia": 0,
                    "ten_hang": "N/A"
                })
                ant_products.append(p_info)
                
            # Lấy thông tin chi tiết cho các sản phẩm mua kèm (consequents)
            con_products = []
            for pid in con_ids:
                try:
                    pid_key = int(pid)
                except (ValueError, TypeError):
                    pid_key = pid
                p_info = product_details.get(pid_key, {
                    "ma_sp": pid,
                    "ten_sp": f"Sản phẩm #{pid}",
                    "anh_dai_dien": "images/placeholder.svg",
                    "gia": 0,
                    "ten_hang": "N/A"
                })
                con_products.append(p_info)
                
            rules_list.append({
                "antecedents": ant_products,
                "consequents": con_products,
                "support": float(row['support']),
                "confidence": float(row['confidence']),
                "lift": float(row['lift'])
            })
            
        # Sắp xếp các luật theo chỉ số Lift giảm dần (mức độ hiệu quả gợi ý cao nhất)
        rules_list.sort(key=lambda x: -x['lift'])
        return rules_list
    except Exception as e:
        print(f"Error compiling association rules overview: {e}")
        return []


