import os
import sys
import io
import requests
import mysql.connector
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import uvicorn

# Khắc phục lỗi UnicodeEncodeError trên Windows Terminal bằng cách buộc sử dụng UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

app = FastAPI(title="Rasa Mock Server & Dialogue Gateway")

# Store session states in memory: {sender_id: {"state": "...", "phone_brand": "...", "budget_range": "...", "main_usage": "..."}}
sessions = {}

RAG_SERVICE_URL = "http://127.0.0.1:8000/api/chat"

# Load backend environment variables for MySQL connection
env_paths = ["../backend/.env", "../../backend/.env", "./backend/.env"]
for path in env_paths:
    if os.path.exists(path):
        load_dotenv(dotenv_path=path)
        break

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "Vinh123456789@")
DB_NAME = os.getenv("DB_NAME", "QHUNG")

def get_delivery_address(user_id: str) -> str:
    if not user_id or user_id == "anonymous_user":
        return "Dạ, bạn vui lòng <b>Đăng nhập</b> để em kiểm tra và hiển thị địa chỉ giao hàng được lưu trong tài khoản của riêng bạn nhé! 😊"
    
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASS,
            database=DB_NAME,
            connect_timeout=3
        )
        cursor = conn.cursor(dictionary=True)
        query = "SELECT dia_chi_nhan FROM don_hang WHERE ma_kh = %s AND dia_chi_nhan IS NOT NULL ORDER BY thoi_gian DESC LIMIT 1"
        cursor.execute(query, (user_id,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            return f"Dạ, địa chỉ giao hàng gần nhất của bạn được lưu trong hệ thống là: <strong>{row['dia_chi_nhan']}</strong>.<br><br>Bạn có thể thay đổi địa chỉ nhận hàng này khi tiến hành thanh toán giỏ hàng ạ!"
        else:
            return "Dạ, tài khoản của bạn hiện tại chưa có đơn hàng nào nên chưa có địa chỉ giao hàng được lưu. Khi bạn tiến hành đặt mua sản phẩm, địa chỉ giao hàng sẽ được lưu tại đây để tiện sử dụng cho lần sau ạ!"
    except Exception as e:
        print(f"Error in mock delivery address connection: {e}")
        return "Dạ, em gặp chút lỗi khi truy cập địa chỉ giao hàng của bạn. Bạn vui lòng kiểm tra lại trong Hồ sơ cá nhân nhé!"

def _detect_brand(message: str):
    """Phát hiện tên hãng từ tin nhắn người dùng"""
    msg_lower = message.lower()
    brand_map = {
        'vivo': 'Vivo', 'samsung': 'Samsung', 'galaxy': 'Samsung',
        'iphone': 'Apple', 'apple': 'Apple', 'xiaomi': 'Xiaomi',
        'redmi': 'Xiaomi', 'poco': 'Xiaomi', 'oppo': 'Oppo',
        'realme': 'Realme', 'sony': 'Sony', 'xperia': 'Sony',
        'google': 'Google', 'pixel': 'Google', 'asus': 'Asus',
        'rog': 'Asus', 'tecno': 'Tecno', 'nokia': 'Nokia',
        'huawei': 'Huawei', 'honor': 'Honor'
    }
    for keyword, brand in brand_map.items():
        if keyword in msg_lower:
            return brand
    return None

def call_groq_fallback(message: str) -> str:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if not GROQ_API_KEY:
        return "Dạ, hệ thống AI hiện chưa được cấu hình khóa API hợp lệ. Quý khách vui lòng thử lại sau."
        
    try:
        # Phát hiện brand từ tin nhắn
        detected_brand = _detect_brand(message)
        
        # Lấy danh sách sản phẩm từ DB (lọc theo brand nếu có)
        products = []
        try:
            conn = mysql.connector.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASS,
                database=DB_NAME,
                connect_timeout=3
            )
            cursor = conn.cursor(dictionary=True)
            
            if detected_brand:
                query = """
                    SELECT sp.ma_sp as id, sp.ten_sp as name, hsx.ten_hang as brand, 
                           sp.gia as price, sp.bo_nho as storage, sp.anh_dai_dien as image
                    FROM san_pham sp
                    LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                    WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) LIKE %s
                    ORDER BY sp.gia ASC
                """
                cursor.execute(query, (f"%{detected_brand.lower()}%",))
            else:
                query = """
                    SELECT sp.ma_sp as id, sp.ten_sp as name, hsx.ten_hang as brand, 
                           sp.gia as price, sp.bo_nho as storage, sp.anh_dai_dien as image
                    FROM san_pham sp
                    LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                    WHERE sp.so_luong_ton > 0
                    ORDER BY sp.gia ASC
                """
                cursor.execute(query)
            
            products = cursor.fetchall()
            cursor.close()
            conn.close()
        except Exception as db_err:
            print(f"Error querying products in Rasa Groq Fallback: {db_err}")

        # Format product list
        product_list_str = ""
        for p in products:
            price_formatted = f"{int(p['price']):,}".replace(",", ".") + "đ" if p['price'] else "N/A"
            product_list_str += f"- {p['name']} | Hãng: {p['brand'] or 'N/A'} | Giá: {price_formatted} | Bộ nhớ: {p['storage'] or 'N/A'} | ID: {p['id']} | Ảnh: {p['image'] or ''}\n"

        total_count = len(products)
        brand_note = f"Hiện có CHÍNH XÁC {total_count} sản phẩm {detected_brand} tại cửa hàng." if detected_brand else f"Cửa hàng hiện có tổng cộng {total_count} sản phẩm."

        system_prompt = f"""Bạn là trợ lý AI của QuangHưng Mobile - cửa hàng điện thoại uy tín. Hãy tư vấn khách hàng nhiệt tình, thân thiện, chuyên nghiệp.

{brand_note}

DANH SÁCH SẢN PHẨM CHÍNH XÁC TỪ CƠ SỞ DỮ LIỆU:
{product_list_str}

QUY TẮC BẮT BUỘC:
1. CHỈ ĐƯỢC tư vấn sản phẩm có trong danh sách trên. KHÔNG ĐƯỢC bịa đặt sản phẩm không tồn tại.
2. Khi khách hỏi "có mấy" hoặc "bao nhiêu" sản phẩm, trả lời SỐ LƯỢNG CHÍNH XÁC: {total_count} sản phẩm.
3. Dùng TÊN SẢN PHẨM THỰC TẾ (ví dụ: "Vivo V25", "iPhone 16 Pro Max"). TUYỆT ĐỐI KHÔNG dùng tiêu đề khuyến mãi/quảng cáo làm tên sản phẩm.
4. Khi nhắc đến sản phẩm, BẮT BUỘC sử dụng mẫu HTML sau:
<div style="display:flex; align-items:center; margin-top:10px; margin-bottom:10px; gap:15px; border: 1px solid #ddd; padding: 10px; border-radius: 8px;">
  <img src="{{Anh}}" alt="{{Ten_san_pham}}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;">
  <div>
    <strong>{{Ten_san_pham}}</strong><br>
    Giá: <span style="color:#e53935; font-weight:bold;">{{Gia}}</span><br>
    <a href="product-detail.html?id={{ID}}" style="display:inline-block; margin-top:5px; padding:5px 10px; background-color:#1976d2; color:#fff; text-decoration:none; border-radius:4px; font-size:12px;">Xem chi tiết</a>
  </div>
</div>
5. Trả lời CHỈ dùng thẻ HTML (<br>, <strong>, <div>). KHÔNG dùng Markdown (*, **, -).
6. Xưng hô lịch sự: "Dạ", "em", "anh/chị".
7. So sánh ưu/nhược điểm nếu có nhiều sản phẩm cùng hãng.
8. Cuối câu trả lời, đưa ra gợi ý tiếp theo để dẫn dắt hội thoại.
"""
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                "temperature": 0.5,
                "max_tokens": 1500
            },
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            timeout=15.0
        )
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        return "Dạ, em gặp sự cố khi tải dữ liệu tư vấn sản phẩm. Bạn vui lòng liên hệ hotline nhé."
    except Exception as e:
        print(f"Error in call_groq_fallback: {e}")
        return "Dạ, hệ thống gặp sự cố kết nối AI. Bạn vui lòng thử lại sau."

def query_rag(message: str, user_id: str) -> str:
    try:
        response = requests.post(
            RAG_SERVICE_URL,
            json={
                "message": message,
                "userId": user_id,
                "history": []
            },
            headers={"Content-Type": "application/json"},
            timeout=8.0
        )
        if response.status_code == 200:
            res_data = response.json()
            if res_data.get("intent") == "ERROR" or "chưa được cấu hình khóa API" in res_data.get("response", "") or "khóa API (API Key) không hợp lệ" in res_data.get("response", ""):
                print("Gemini API Key warning detected. Falling back to Groq inside Rasa Gateway...")
                return call_groq_fallback(message)
            return res_data.get("response", "Dạ, em chưa nhận diện được yêu cầu này.")
        return "Dạ, dịch vụ tư vấn sản phẩm đang gặp sự cố. Bạn vui lòng thử lại sau ít phút nhé."
    except Exception as e:
        print(f"Error querying RAG from Mock Rasa: {e}")
        return call_groq_fallback(message)

@app.post("/webhooks/rest/webhook")
async def rasa_webhook(request: Request):
    data = await request.json()
    sender = data.get("sender", "anonymous_user")
    message = data.get("message", "").strip()
    message_lower = message.lower()
    
    print(f"[Rasa Mock] Received from {sender}: {message}")
    
    # Initialize session if not exists
    if sender not in sessions:
        sessions[sender] = {"state": "idle", "phone_brand": None, "budget_range": None, "main_usage": None}
        
    session = sessions[sender]
    
    # Check if we are in the middle of slot filling
    if session["state"] == "awaiting_brand":
        session["phone_brand"] = message
        session["state"] = "awaiting_budget"
        return JSONResponse([
            {
                "text": "Dạ, tầm ngân sách dự kiến của mình khoảng bao nhiêu ạ? (Ví dụ: Dưới 5 triệu, 5-10 triệu, trên 10 triệu...)",
                "buttons": [
                    {"title": "Dưới 5 triệu", "payload": "Dưới 5 triệu"},
                    {"title": "Từ 5 - 10 triệu", "payload": "Từ 5 - 10 triệu"},
                    {"title": "Trên 10 triệu", "payload": "Trên 10 triệu"}
                ]
            }
        ])
        
    elif session["state"] == "awaiting_budget":
        session["budget_range"] = message
        session["state"] = "awaiting_usage"
        return JSONResponse([
            {
                "text": "Dạ, nhu cầu sử dụng chính hàng ngày của mình là gì ạ? (Ví dụ: Chơi game mượt, chụp ảnh đẹp, pin trâu...)",
                "buttons": [
                    {"title": "Chơi game", "payload": "Chơi game"},
                    {"title": "Chụp ảnh đẹp", "payload": "Chụp ảnh đẹp"},
                    {"title": "Pin trâu", "payload": "Pin trâu"}
                ]
            }
        ])
        
    elif session["state"] == "awaiting_usage":
        session["main_usage"] = message
        brand = session["phone_brand"]
        budget = session["budget_range"]
        usage = session["main_usage"]
        
        # Reset session
        sessions[sender] = {"state": "idle", "phone_brand": None, "budget_range": None, "main_usage": None}
        
        # Call RAG with compiled prompt
        consult_query = f"Tư vấn điện thoại hãng {brand} tầm giá {budget} phục vụ nhu cầu {usage}"
        print(f"[Rasa Mock] Submitting form. Query: {consult_query}")
        
        intro_text = f"Dạ, em đã nhận được yêu cầu: Hãng <b>{brand}</b>, tài chính <b>{budget}</b>, nhu cầu <b>{usage}</b>. Đang tìm kiếm sản phẩm phù hợp..."
        rag_text = query_rag(consult_query, sender)
        
        return JSONResponse([
            {"text": intro_text},
            {"text": rag_text}
        ])
        
    # --- Intent Handling ---
    
    # 1. Greet
    if any(greet in message_lower for greet in ["hi", "hello", "xin chào", "chào", "chao", "alo"]):
        return JSONResponse([
            {
                "text": "Dạ, em chào bạn! Em là trợ lý ảo của cửa hàng điện thoại di động QuangHưng Mobile. Em có thể giúp gì cho mình hôm nay ạ? 😊"
            }
        ])
        
    # 2. Goodbye
    elif any(bye in message_lower for bye in ["tạm biệt", "tam biet", "bye", "hẹn gặp lại", "cảm ơn shop"]):
        return JSONResponse([
            {
                "text": "Dạ, tạm biệt bạn nhé! Rất vui được hỗ trợ bạn. Chúc bạn một ngày tốt lành! 🎄"
            }
        ])
        
    # 3. Ask Address (Ambiguous)
    elif message_lower == "địa chỉ" or message_lower == "dia chi" or message_lower == "ở đâu" or message_lower == "o dau" or message_lower == "cho xin địa chỉ" or message_lower == "cho xin dia chi":
        return JSONResponse([
            {
                "text": "Dạ, bạn đang cần xem <strong>Địa chỉ các chi nhánh cửa hàng</strong> của QuangHưng Mobile hay muốn xem/cập nhật <strong>Địa chỉ giao hàng</strong> trong tài khoản cá nhân của bạn ạ?",
                "buttons": [
                    {"title": "📍 Địa chỉ cửa hàng", "payload": "/ask_address_store"},
                    {"title": "📦 Địa chỉ giao hàng của tôi", "payload": "/ask_address_delivery"}
                ]
            }
        ])
        
    # 4. Ask Store Address (Specific)
    elif message_lower == "/ask_address_store" or "cửa hàng" in message_lower or "showroom" in message_lower or "chi nhánh" in message_lower or "📍 địa chỉ cửa hàng" in message_lower:
        store_address_html = (
            "Dạ, QuangHưng Mobile hiện có các chi nhánh cửa hàng mở cửa từ 8:00 đến 21:30 hàng ngày:<br>"
            "📍 <b>Chi nhánh 1:</b> 123 Đường Ba Tháng Hai, Phường 11, Quận 10, TP. Hồ Chí Minh.<br>"
            "📍 <b>Chi nhánh 2:</b> 456 Cách Mạng Tháng Tám, Phường 15, Quận 10, TP. Hồ Chí Minh.<br><br>"
            "Rất hân hạnh được chào đón bạn ghé thăm trải nghiệm máy ạ! 🤝"
        )
        return JSONResponse([{"text": store_address_html}])
        
    # 5. Ask Delivery Address (Specific)
    elif message_lower == "/ask_address_delivery" or "giao hàng" in message_lower or "của tôi" in message_lower or "📦 địa chỉ giao hàng" in message_lower:
        address_text = get_delivery_address(sender)
        return JSONResponse([{"text": address_text}])
        
    # 6. Ask Consultation (Generic Form Activation)
    elif any(kw in message_lower for kw in ["tư vấn", "tu van", "mua máy", "mua may", "mua điện thoại", "mua dien thoai", "tìm máy", "tim may"]):
        session["state"] = "awaiting_brand"
        return JSONResponse([
            {
                "text": "Dạ, mình đang quan tâm hoặc muốn tìm dòng điện thoại của hãng nào nhất ạ? (Ví dụ: iPhone, Samsung, Xiaomi...)",
                "buttons": [
                    {"title": "iPhone", "payload": "iPhone"},
                    {"title": "Samsung", "payload": "Samsung"},
                    {"title": "Xiaomi", "payload": "Xiaomi"},
                    {"title": "OPPO", "payload": "OPPO"}
                ]
            }
        ])
        
    # 7. Fallback: Call RAG Service directly
    else:
        rag_text = query_rag(message, sender)
        return JSONResponse([{"text": rag_text}])

if __name__ == "__main__":
    uvicorn.run("mock_rasa_server:app", host="127.0.0.1", port=5005, reload=False)
