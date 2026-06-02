import pandas as pd
from sklearn.neighbors import NearestNeighbors
from mlxtend.frequent_patterns import apriori, association_rules
import random
import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv(dotenv_path="../backend/.env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASSWORD", "Vinh123456789@")
DB_NAME = os.getenv("DB_NAME", "QHUNG")

def train_knn_model(user_item_matrix):
    """
    Huấn luyện mô hình Collaborative Filtering dựa trên KNN.
    user_item_matrix: DataFrame có index là user_id, columns là product_id, value là số lượng/ratings
    """
    if user_item_matrix is None or user_item_matrix.empty:
        return None
    
    # KNN với cosine similarity cho recommendation
    model = NearestNeighbors(metric='cosine', algorithm='brute')
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
    
    # Tìm k users giống nhất (cộng luôn user hiện tại -> k+1)
    distances, indices = model.kneighbors(user_vector, n_neighbors=n_recommendations+1)
    
    # Lấy các users tương đồng ngoài bản thân
    similar_users = indices.flatten()[1:]
    
    recommended_items = set()
    for similar_user_idx in similar_users:
        similar_user_id = matrix.index[similar_user_idx]
        user_items = matrix.loc[similar_user_id]
        # Các sản phẩm user tương đồng đã mua (value > 0)
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
        
        # 1. User-Item Data for KNN
        query_knn = """
            SELECT dh.ma_kh, ct.ma_sp, SUM(ct.so_luong) as total_qty 
            FROM don_hang dh 
            JOIN chi_tiet_don_hang ct ON dh.ma_don = ct.ma_don 
            WHERE dh.ma_kh IS NOT NULL 
            GROUP BY dh.ma_kh, ct.ma_sp
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

def init_models_from_db():
    print("Loading data for training AI Recommendation from DB...")
    df_knn, df_apriori = fetch_data_from_db()
    
    knn_data = None
    apriori_rules = None
    
    # Process KNN
    if df_knn is not None and not df_knn.empty:
        user_item_matrix = pd.pivot_table(df_knn, values='total_qty', index='ma_kh', columns='ma_sp', fill_value=0)
        knn_data = train_knn_model(user_item_matrix)
        print("Training KNN (Collaborative Filtering) successful!")
        
    # Process Apriori
    if df_apriori is not None and not df_apriori.empty:
        # Create one-hot encoding
        basket = df_apriori.groupby(['ma_don', 'ma_sp'])['ma_sp'].count().unstack().reset_index().fillna(0).set_index('ma_don')
        basket_bool = basket.map(lambda x: 1 if x > 0 else 0).astype(bool)
        apriori_rules = train_apriori_model(basket_bool, min_support=0.01, min_threshold=0.5)
        print("Training Apriori (Association Rules) successful!")
        
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
    """Lấy {pid: ten_hang} cho list product_id — dùng để diversity round-robin."""
    if not pids:
        return {}
    try:
        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
        cursor = conn.cursor(dictionary=True)
        # Lọc chỉ pid integer (Apriori có thể trả string dummy)
        int_pids = [p for p in pids if isinstance(p, int)]
        if not int_pids:
            cursor.close(); conn.close()
            return {}
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
        return {r['ma_sp']: (r['ten_hang'] or 'unknown') for r in rows}
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
