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

def mock_get_recommendation(user_id=None, cart_items=None):
    """
    Hàm gợi ý (recommendation) hỗ trợ ngữ nghĩa chính xác hơn theo tài chính và nhu cầu mua kèm (Cross-sell/Up-sell).
    """
    results = []
    seen = set()

    def add_to_results(items):
        for item in items:
            try:
                val = int(item)
                if val not in seen:
                    seen.add(val)
                    results.append(val)
            except (ValueError, TypeError):
                if item not in seen:
                    seen.add(item)
                    results.append(item)

    # 1. Lấy gợi ý dựa trên sở thích lưu trong so_thich_khach_hang
    if user_id:
        interest_recs = get_interest_recommendations(user_id)
        add_to_results(interest_recs)

    # 2. Sau đó mới đến KNN (Collaborative Filtering)
    if user_id and _knn_store:
        knn_recs = get_knn_recommendations(_knn_store, user_id)
        add_to_results(knn_recs)
        
    # 3. Tiếp theo là Apriori (Association Rules)
    if cart_items and _apriori_store is not None:
        apriori_recs = get_apriori_recommendations(_apriori_store, cart_items)
        add_to_results(apriori_recs)
        
    return results

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
