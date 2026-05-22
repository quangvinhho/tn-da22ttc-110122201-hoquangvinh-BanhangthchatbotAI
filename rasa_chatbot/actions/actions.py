from typing import Any, Text, Dict, List
import requests
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet

RAG_SERVICE_URL = "http://127.0.0.1:8000/api/chat"

class ActionCallRAG(Action):
    def name(self) -> Text:
        return "action_call_rag"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        user_message = tracker.latest_message.get("text")
        user_id = tracker.sender_id

        # Lấy lịch sử hội thoại ngắn từ Tracker để giữ ngữ cảnh cho RAG
        history = []
        for event in tracker.events[-15:]:
            if event.get("event") == "user":
                history.append({"role": "user", "content": event.get("text")})
            elif event.get("event") == "bot" and event.get("text"):
                history.append({"role": "assistant", "content": event.get("text")})
        
        try:
            # Gọi sang FastAPI RAG Engine kèm thông tin userId và lịch sử
            response = requests.post(
                RAG_SERVICE_URL,
                json={
                    "message": user_message,
                    "userId": user_id,
                    "history": history
                },
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
            
            if response.status_code == 200:
                data = response.json()
                rag_response = data.get("response", "Dạ, em chưa nhận diện được yêu cầu này.")
                dispatcher.utter_message(text=rag_response)
            else:
                dispatcher.utter_message(text="Dạ, dịch vụ tư vấn sản phẩm đang gặp sự cố. Bạn vui lòng thử lại sau ít phút nhé.")
        except Exception as e:
            print(f"Error calling RAG service from Rasa actions: {e}")
            dispatcher.utter_message(text="Dạ, em gặp sự cố kết nối với hệ thống dữ liệu. Vui lòng thử lại sau.")

        return []


class ActionClarifyAddress(Action):
    def name(self) -> Text:
        return "action_clarify_address"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        # Gợi ý làm rõ địa chỉ
        response_text = "Dạ, bạn đang cần xem <strong>Địa chỉ các chi nhánh cửa hàng</strong> của QuangHưng Mobile hay muốn xem/cập nhật <strong>Địa chỉ giao hàng</strong> trong tài khoản cá nhân của bạn ạ?"
        
        # Đính kèm custom suggestions trong buttons payload của Rasa
        dispatcher.utter_message(
            text=response_text,
            buttons=[
                {"title": "📍 Địa chỉ cửa hàng", "payload": "/ask_address_store"},
                {"title": "📦 Địa chỉ giao hàng của tôi", "payload": "/ask_address_delivery"}
            ]
        )
        return []


class ActionGetStoreAddress(Action):
    def name(self) -> Text:
        return "action_get_store_address"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        store_address_html = (
            "Dạ, QuangHưng Mobile hiện có các chi nhánh cửa hàng mở cửa từ 8:00 đến 21:30 hàng ngày:<br>"
            "📍 <b>Chi nhánh 1:</b> 123 Đường Ba Tháng Hai, Phường 11, Quận 10, TP. Hồ Chí Minh.<br>"
            "📍 <b>Chi nhánh 2:</b> 456 Cách Mạng Tháng Tám, Phường 15, Quận 10, TP. Hồ Chí Minh.<br><br>"
            "Rất hân hạnh được chào đón bạn ghé thăm trải nghiệm máy ạ! 🤝"
        )
        dispatcher.utter_message(text=store_address_html)
        return []


class ActionGetDeliveryAddress(Action):
    def name(self) -> Text:
        return "action_get_delivery_address"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        user_id = tracker.sender_id
        
        if not user_id or user_id == "anonymous_user":
            dispatcher.utter_message(
                text="Dạ, bạn vui lòng <b>Đăng nhập</b> để em kiểm tra và hiển thị địa chỉ giao hàng được lưu trong tài khoản của riêng bạn nhé! 😊"
            )
            return []
            
        # Kết nối MySQL và lấy địa chỉ giao hàng gần nhất
        import os
        import mysql.connector
        from dotenv import load_dotenv
        
        # Thử tìm file .env tại nhiều đường dẫn tương đối an toàn
        env_paths = ["../backend/.env", "../../backend/.env", "./backend/.env"]
        for path in env_paths:
            if os.path.exists(path):
                load_dotenv(dotenv_path=path)
                break
                
        db_host = os.getenv("DB_HOST", "localhost")
        db_user = os.getenv("DB_USER", "root")
        db_pass = os.getenv("DB_PASS", "Vinh123456789@")
        db_name = os.getenv("DB_NAME", "QHUNG")
        
        try:
            conn = mysql.connector.connect(
                host=db_host,
                user=db_user,
                password=db_pass,
                database=db_name,
                connect_timeout=3
            )
            cursor = conn.cursor(dictionary=True)
            
            # Lấy địa chỉ giao hàng từ đơn hàng gần nhất của khách hàng
            query = "SELECT dia_chi_nhan FROM don_hang WHERE ma_kh = %s AND dia_chi_nhan IS NOT NULL ORDER BY thoi_gian DESC LIMIT 1"
            cursor.execute(query, (user_id,))
            row = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            if row:
                address = row["dia_chi_nhan"]
                dispatcher.utter_message(
                    text=f"Dạ, địa chỉ giao hàng gần nhất của bạn được lưu trong hệ thống là: <strong>{address}</strong>.<br><br>Bạn có thể thay đổi địa chỉ nhận hàng này khi tiến hành thanh toán giỏ hàng ạ!"
                )
            else:
                dispatcher.utter_message(
                    text="Dạ, tài khoản của bạn hiện tại chưa có đơn hàng nào nên chưa có địa chỉ giao hàng được lưu. Khi bạn tiến hành đặt mua sản phẩm, địa chỉ giao hàng sẽ được lưu tại đây để tiện sử dụng cho lần sau ạ!"
                )
        except Exception as e:
            print(f"Error querying delivery address in Rasa action: {e}")
            dispatcher.utter_message(
                text="Dạ, em gặp chút lỗi khi truy cập địa chỉ giao hàng của bạn. Bạn vui lòng kiểm tra lại trong Hồ sơ cá nhân nhé!"
            )
            
        return []


class ActionSubmitPhoneConsultation(Action):
    def name(self) -> Text:
        return "action_submit_phone_consultation"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:
        
        # Thu thập các slot được điền qua Form
        phone_brand = tracker.get_slot("phone_brand")
        budget_range = tracker.get_slot("budget_range")
        main_usage = tracker.get_slot("main_usage")
        user_id = tracker.sender_id
        
        # Tạo prompt tối ưu để gửi sang RAG FastAPI
        consult_query = f"Tư vấn điện thoại hãng {phone_brand} tầm giá {budget_range} phục vụ nhu cầu {main_usage}"
        
        try:
            dispatcher.utter_message(text=f"Dạ, em đã nhận được yêu cầu: Hãng <b>{phone_brand}</b>, tài chính <b>{budget_range}</b>, nhu cầu <b>{main_usage}</b>. Đang tìm kiếm sản phẩm phù hợp...")
            
            response = requests.post(
                RAG_SERVICE_URL,
                json={
                    "message": consult_query,
                    "userId": user_id,
                    "history": []
                },
                headers={"Content-Type": "application/json"},
                timeout=5.0
            )
            
            if response.status_code == 200:
                data = response.json()
                rag_response = data.get("response")
                dispatcher.utter_message(text=rag_response)
            else:
                dispatcher.utter_message(text="Dạ, em không tìm thấy dòng sản phẩm nào khớp hoàn toàn với mô tả của bạn. Bạn có muốn thử lại với tiêu chí khác không ạ?")
        except Exception as e:
            print(f"Error calling RAG for phone consultation: {e}")
            dispatcher.utter_message(text="Xin lỗi, em gặp lỗi khi kết nối với kho sản phẩm. Vui lòng thử lại sau.")
            
        # Reset các slot để phục vụ cho lượt tư vấn tiếp theo
        return [
            SlotSet("phone_brand", None),
            SlotSet("budget_range", None),
            SlotSet("main_usage", None)
        ]
