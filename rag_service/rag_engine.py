import os
import mysql.connector
from dotenv import load_dotenv
from typing import List, Dict, Any

from langchain_classic.chains import create_sql_query_chain
from langchain_community.utilities import SQLDatabase
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_classic.chains import RetrievalQA

load_dotenv(dotenv_path="../backend/.env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "Vinh123456789@")
DB_NAME = os.getenv("DB_NAME", "QHUNG")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

class RAGEngine:
    def __init__(self):
        # 1. Setup LLM
        self.llm = ChatGroq(
            temperature=0, 
            api_key=GROQ_API_KEY, 
            model_name="llama-3.1-8b-instant"
        )
        
        import urllib.parse
        # 2. Setup SQL Database for KPI (Text-to-SQL)
        encoded_pass = urllib.parse.quote_plus(DB_PASS)
        db_uri = f"mysql+mysqlconnector://{DB_USER}:{encoded_pass}@{DB_HOST}/{DB_NAME}"
        self.db = SQLDatabase.from_uri(
            db_uri,
            include_tables=["san_pham", "don_hang", "chi_tiet_don_hang", "danh_gia", "khuyen_mai", "cau_hinh"]
        )
        
        # 3. Setup Vector Store for Semantic Search (RAG)
        self.embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        self.vector_dir = "./chroma_db"
        
        # 4. RAM Cache cho chatbot_knowledge (tránh query MySQL mỗi lần chat)
        self._knowledge_cache = None
        self._knowledge_cache_time = 0
        self._KNOWLEDGE_CACHE_TTL = 300  # 5 phút
        
        # Try to load existing vector store or create a new one
        if os.path.exists(self.vector_dir):
            self.vectorstore = Chroma(persist_directory=self.vector_dir, embedding_function=self.embeddings)
        else:
            self.vectorstore = self._initialize_vector_store()
            
    def _initialize_vector_store(self):
        print("Initializing Vector Store from DB...")
        conn = mysql.connector.connect(
            host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME
        )
        cursor = conn.cursor(dictionary=True)
        
        # Lấy thông tin sản phẩm, hãng sản xuất và cấu hình
        query = """
            SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.mo_ta_ngan, sp.anh_dai_dien, sp.bo_nho,
                   hsx.ten_hang,
                   ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
            WHERE sp.so_luong_ton > 0
        """
        cursor.execute(query)
        products = cursor.fetchall()
        
        documents = []
        for p in products:
            # Lọc bỏ nội dung khuyến mãi/quảng cáo trong mô tả ngắn
            mo_ta = p['mo_ta_ngan'] or ''
            promo_keywords = ['trade-in', 'giảm đến', 'giá chỉ', 'duy nhất', 'khuyến mãi', 'ưu đãi', 'trả góp 0%', 'flash sale']
            if any(kw in mo_ta.lower() for kw in promo_keywords):
                mo_ta = ''  # Bỏ mô tả nếu chỉ là text khuyến mãi
            
            # Tạo nội dung text để nhúng (embedding)
            content = f"Sản phẩm: {p['ten_sp']}. Hãng sản xuất: {p.get('ten_hang') or 'Khác'}. Loại sản phẩm (Danh mục): Điện thoại. Giá bán: {p['gia']} VNĐ. Bộ nhớ: {p.get('bo_nho') or 'N/A'}. ID sản phẩm (ma_sp): {p['ma_sp']}. Ảnh đại diện (anh_dai_dien): {p['anh_dai_dien']}. "
            if mo_ta:
                content += f"Mô tả: {mo_ta}. "
            if p['ram']:
                content += f"Cấu hình: RAM {p['ram']}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}."
            
            doc = Document(
                page_content=content,
                metadata={"type": "product", "ma_sp": p['ma_sp'], "ten_sp": p['ten_sp'], "gia": float(p['gia']), "anh_dai_dien": p['anh_dai_dien'], "ten_loai": "Điện thoại", "ten_hang": p.get('ten_hang') or 'Khác'}
            )
            documents.append(doc)
            
        # Lấy thông tin từ chatbot_knowledge
        cursor.execute("SELECT title, content, type FROM chatbot_knowledge WHERE is_active = 1")
        knowledge_items = cursor.fetchall()
        for k in knowledge_items:
            # Vector hóa dạng Khối tài liệu có Tiêu đề & Nội dung
            content_to_embed = f"Tài liệu tri thức về: {k['title']}\nChi tiết: {k['content']}"
            doc = Document(
                page_content=content_to_embed,
                metadata={"type": "knowledge", "title": k['title'], "category": k['type']}
            )
            documents.append(doc)
            
        cursor.close()
        conn.close()
        
        if documents:
            vectorstore = Chroma.from_documents(
                documents=documents, 
                embedding=self.embeddings, 
                persist_directory=self.vector_dir
            )
            vectorstore.persist()
            return vectorstore
        return None

    def reload_vectorstore(self):
        """Xóa vector store cũ và khởi tạo lại để cập nhật dữ liệu mới"""
        import shutil
        print("Reloading Vector Store...")
        
        # Xóa RAM cache knowledge để lấy dữ liệu mới
        self._knowledge_cache = None
        self._knowledge_cache_time = 0
        
        # Đóng kết nối / xóa vectorstore hiện tại khỏi memory
        self.vectorstore = None
        
        # Xóa thư mục chroma_db cũ
        if os.path.exists(self.vector_dir):
            try:
                shutil.rmtree(self.vector_dir)
            except Exception as e:
                print(f"Error deleting old vector store: {str(e)}")
                
        # Khởi tạo lại
        self.vectorstore = self._initialize_vector_store()
        print("Reloaded Vector Store successfully!")
        return True

    def query_kpi(self, question: str) -> str:
        """Sử dụng Text-to-SQL để truy vấn KPI từ DB"""
        chain = create_sql_query_chain(self.llm, self.db)
        
        try:
            # Sinh ra câu lệnh SQL
            sql_query = chain.invoke({"question": question + " Trả về kết quả bằng tiếng Việt."})
            
            # Làm sạch SQL string nếu LLM trả về markdown hoặc thêm văn bản giải thích
            if "```sql" in sql_query:
                sql_query = sql_query.split("```sql")[1].split("```")[0].strip()
            elif "```" in sql_query:
                sql_query = sql_query.split("```")[1].strip()
                
            # Xóa các tiền tố hội thoại thường gặp từ các mô hình Llama như "SQLQuery:", "Question:"
            import re
            parts = re.split(r'(?:sql\s*query|sqlquery|query|question)\s*:', sql_query, flags=re.IGNORECASE)
            if len(parts) > 1:
                # Lấy phần sau dấu hai chấm cuối cùng nếu có nhiều từ khóa
                sql_query = parts[-1].strip()
                
            # Định vị từ khóa SQL chính (SELECT/SHOW/WITH/DESCRIBE) để cắt bỏ rác phía trước
            match = re.search(r'\b(SELECT|SHOW|WITH|DESCRIBE)\b', sql_query, re.IGNORECASE)
            if match:
                sql_query = sql_query[match.start():].strip()
                
            # Chỉ lấy câu lệnh SQL trước dấu chấm phẩy đầu tiên (nếu có)
            sql_query = sql_query.split(";")[0].strip()
                
            # Kiểm tra an toàn SQL (chống Text-to-SQL Injection / phá hoại DB)
            forbidden_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT", "REVOKE"]
            upper_query = sql_query.upper()
            if any(f" {keyword} " in f" {upper_query} " or upper_query.startswith(f"{keyword} ") for keyword in forbidden_keywords):
                return "Xin lỗi, tôi phát hiện yêu cầu có nguy cơ bảo mật nên đã tự động chặn lại."
                
            # Chạy SQL an toàn
            result = self.db.run(sql_query)
            
            # Diễn dịch kết quả
            prompt = PromptTemplate.from_template(
                "Dựa vào câu hỏi: {question}\n"
                "Và kết quả truy vấn từ cơ sở dữ liệu: {result}\n"
                "Hãy viết một câu trả lời tự nhiên, thân thiện cho khách hàng bằng tiếng Việt."
            )
            answer_chain = prompt | self.llm
            final_answer = answer_chain.invoke({"question": question, "result": result})
            return final_answer.content
        except Exception as e:
            return f"Lỗi khi truy vấn KPI: {str(e)}"

    def query_semantic(self, question: str, history: List[Dict] = None, interests: List[str] = None) -> str:
        """Sử dụng RAG để tìm kiếm thông tin theo ngữ nghĩa và ngữ cảnh trò chuyện"""
        if not self.vectorstore:
            return "Chưa có dữ liệu thông tin linh kiện/sản phẩm để hỗ trợ."

        # Định dạng lịch sử trò chuyện
        chat_history = ""
        if history:
            for msg in history[-5:]:  # Chỉ lấy 5 tin nhắn gần nhất để giữ context
                role = "Khách hàng" if msg.get("role") == "user" else "Chatbot"
                # Escape '{' '}' trong nội dung user/bot cũ để PromptTemplate không hiểu nhầm là placeholder
                content_safe = str(msg.get('content', '')).replace("{", "{{").replace("}", "}}")
                chat_history += f"{role}: {content_safe}\n"

        # [TỐI ƯU] Thay vì gọi LLM contextualize (tốn 2-4s), nối lịch sử vào query để ChromaDB tìm ngữ nghĩa
        standalone_question = question
        if history and len(history) > 0:
            # Trích xuất keywords từ lịch sử gần nhất (chỉ lấy tin user)
            recent_user_msgs = [msg.get('content', '') for msg in history[-3:] if msg.get('role') == 'user']
            if recent_user_msgs:
                history_context = ' '.join(recent_user_msgs)
                standalone_question = f"{history_context} {question}"
                try:
                    print(f"[RAG FAST-CONTEXT] '{question}' -> '{standalone_question}'".encode('utf-8', 'replace').decode('utf-8'))
                except UnicodeEncodeError:
                    print("[RAG FAST-CONTEXT] <unicode error in print>")

        # Tùy chỉnh prompt để AI trả lời theo ngữ cảnh RAG và lịch sử
        history_instruction = ""
        if history and len(history) > 0:
            history_instruction = "LƯU Ý QUAN TRỌNG: Khách hàng ĐÃ ĐĂNG NHẬP và có lịch sử chat bên dưới. Hãy ĐỌC KỸ LỊCH SỬ để nhớ lại sở thích, mức giá, dòng điện thoại khách từng hỏi. Dựa vào đó, hãy CHỦ ĐỘNG ĐƯA RA CÁC GỢI Ý ĐIỆN THOẠI phù hợp với họ. Hãy thể hiện bạn là một trợ lý ảo nhớ rất rõ khách hàng!"
        else:
            history_instruction = "LƯU Ý: Người dùng chưa đăng nhập hoặc đây là phiên chat mới (không có lịch sử). Chỉ tư vấn tập trung vào câu hỏi hiện tại, không tự chế ra lịch sử."

        # Cá nhân hóa dựa trên sở thích
        interests_instruction = ""
        if interests and len(interests) > 0:
            # Escape '{' '}' trong từng sở thích để PromptTemplate không hiểu nhầm là placeholder
            interests_safe = [str(i).replace("{", "{{").replace("}", "}}") for i in interests]
            interests_str = ", ".join(interests_safe)
            interests_instruction = f"LƯU Ý CÁ NHÂN HÓA: Khách hàng này có sở thích đặc biệt quan tâm tới: {interests_str}. Hãy ưu tiên nhấn mạnh các tính năng liên quan đến sở thích này khi tư vấn (Ví dụ nếu thích gaming, hãy nói nhiều về chip, pin, tản nhiệt... Nếu thích chụp ảnh, hãy nói về camera, AI...)."

        # [TỐI ƯU] Lấy Kiến thức chung từ RAM cache (thay vì MySQL mỗi lần)
        general_knowledge = self._get_general_knowledge()

        system_template = f"""
        Bạn là Chuyên gia Tư vấn Công nghệ kiêm Đại sứ Thương hiệu của QuangHưng Mobile.
        Mục tiêu của bạn là thấu hiểu NGỮ NGHĨA, CẢM XÚC và Ý ĐỊNH của khách hàng để tư vấn và chốt sale với tỉ lệ thành công cao nhất.
        
        {history_instruction}
        {interests_instruction}
        {general_knowledge}
        
        🌟 NGUYÊN TẮC ĐỐI ĐÁP THÔNG MINH & THUYẾT PHỤC:
        1. THẤU HIỂU & ĐỒNG CẢM (Active Listening):
           - Trước khi đưa ra gợi ý sản phẩm, hãy LUÔN LUÔN ghi nhận và đồng cảm với nhu cầu của khách bằng 1-2 câu tự nhiên.
           - Ví dụ: Khách cần mua máy chơi game -> "Dạ, để chiến game Liên Quân hay PUBG mượt mà, không lo tụt FPS hay nóng máy thì hiệu năng cấu hình và dung lượng pin là ưu tiên số một đúng không ạ?..."
           - Xưng hô lịch sự, ấm áp: Dùng "Dạ, em", "Anh/Chị", "Bạn".
        
        2. TƯ VẤN CHUYÊN SÂU & SO SÁNH KHÁCH QUAN:
           - Đừng chỉ liệt kê sản phẩm một cách vô hồn. Hãy đóng vai trò là một chuyên gia: phân tích điểm mạnh nổi bật của máy sát với nhu cầu của khách (ví dụ: dung lượng pin bao nhiêu mAh, chip gì, camera chụp đêm thế nào).
           - Nếu có nhiều sản phẩm phù hợp trong Context, hãy so sánh ngắn gọn để khách dễ chọn lựa. (Ví dụ: "Nếu anh/chị thích màn hình đẹp 120Hz mượt mà thì mẫu A rất tốt, còn nếu muốn chụp hình chân thực, quay video mịn màng thì mẫu B sẽ tối ưu hơn").
        
        3. DẪN DẮT HỘI THOẠI & KÊU GỌI HÀNH ĐỘNG (Sales Closing):
           - Cuối câu trả lời, hãy luôn đưa ra một câu hỏi gợi mở để kéo dài cuộc hội thoại và hỗ trợ khách tiếp theo.
           - Ví dụ: "Anh/chị có muốn em tư vấn chi tiết hơn về chương trình Trả góp 0% lãi suất của mẫu máy này không ạ?", "Mẫu này bên em đang có sẵn máy trải nghiệm tại cửa hàng, anh/chị có muốn qua test thử không ạ?".
        
        4. KHÔNG BỊA ĐẶT THÔNG TIN:
           - Chỉ tư vấn và gợi ý những sản phẩm thực tế CÓ TRONG CONTEXT RAG dưới đây.
           - Nếu sản phẩm khách hỏi không có trong Context, hãy lịch sự phản hồi: "Dạ, hiện tại dòng sản phẩm này bên em đang tạm hết hàng hoặc chưa có thông tin chính thức trên hệ thống. Tuy nhiên, cửa hàng đang có những dòng máy cùng tầm giá và cấu hình tương đương rất đáng cân nhắc sau đây..." và giới thiệu sản phẩm có sẵn.
        
        5. ĐỊNH DẠNG BẮT BUỘC (QUAN TRỌNG NHẤT):
           - BẠN BẮT BUỘC PHẢI DÙNG HTML ĐỂ HIỂN THỊ SẢN PHẨM MỖI KHI NHẮC ĐẾN CHÚNG. KHÔNG được chỉ trả lời bằng text thường.
           - TUYỆT ĐỐI KHÔNG DÙNG MARKDOWN (như **in đậm**, *in nghiêng*, list -, list *). Chỉ sử dụng HTML cơ bản như <br>, <strong>.
           - Mỗi sản phẩm bạn gợi ý BẮT BUỘC phải được chèn vào khung HTML này (thay thế các biến {{{{...}}}} bằng dữ liệu thật):
             <div style="display:flex; margin-top:10px; margin-bottom:10px; gap:15px; border: 1px solid #ddd; padding: 15px; border-radius: 8px; background-color: #fff;">
               <div style="flex-shrink: 0;">
                 <img src="images/{{{{Anh}}}}" alt="{{{{Ten_san_pham}}}}" style="width:100px; height:auto; object-fit:contain;">
               </div>
               <div style="flex-grow: 1;">
                 <div style="font-size:16px; font-weight:bold; color:#333; margin-bottom:5px;">{{{{Ten_san_pham}}}}</div>
                 <div style="margin-bottom:5px; color:#333;">Giá: <span style="color:#d32f2f; font-weight:bold;">{{{{Gia}}}}</span></div>
                 <div style="font-size:14px; color:#555; margin-bottom:10px; line-height:1.5;">{{{{Cau_hinh}}}}</div>
                 <div>
                   <a href="product-detail.html?id={{{{ID}}}}" style="display:inline-block; padding:8px 16px; background-color:#1976d2; color:#fff; text-decoration:none; border-radius:4px; font-size:14px; font-weight:500;">Xem chi tiết</a>
                 </div>
               </div>
             </div>
             (Thay thế {{{{Anh}}}}, {{{{Ten_san_pham}}}}, {{{{Gia}}}}, {{{{ID}}}} bằng thông tin thật. Trong đó, {{{{Anh}}}} BẮT BUỘC phải điền chính xác tên file ảnh từ trường "Ảnh đại diện (anh_dai_dien)" được cung cấp trong thông tin sản phẩm (Ví dụ: "samsung_galaxy_a07.webp" - KHÔNG tự chế tên file, KHÔNG bỏ đuôi .webp/.jpg/.png/.avif). Riêng phần {{{{Cau_hinh}}}} bạn tự tổng hợp ngắn gọn các thông số như RAM, Chip, Pin, Màn hình, Camera thành 1 câu giống trong ảnh).

        6. KHỚP ẢNH CHÍNH XÁC & PHÂN LOẠI DANH MỤC SẢN PHẨM (BẮT BUỘC):
           - Hãy xem kỹ "Loại sản phẩm (Danh mục)" của từng mặt hàng được cung cấp trong Context.
           - Nếu khách hỏi mua "ĐIỆN THOẠI", chỉ tư vấn các dòng máy có loại sản phẩm là "Điện thoại" (như Redmi Note 11, Redmi Note 12, Xiaomi 13 Pro). Tuyệt đối không được lấy mẫu "Phụ kiện" (như Sạc nhanh Xiaomi 33W) để giới thiệu làm điện thoại!
           - Khi ghép thẻ HTML sản phẩm, bắt buộc phải đối chiếu khớp đúng 100% giữa Tên sản phẩm và Ảnh đại diện (anh_dai_dien) của chính sản phẩm đó. Tuyệt đối không lấy ảnh của cục sạc gán cho điện thoại và ngược lại! BẮT BUỘC sao chép chính xác 100% tên file ảnh trong ngữ cảnh (Ví dụ: "samsung_galaxy_a07.webp", không tự sáng tạo ra tên khác).

        7. GUARDRAILS (RẤT QUAN TRỌNG):
           - Bạn CHỈ TƯ VẤN về CÔNG NGHỆ, ĐIỆN THOẠI, LAPTOP, PHỤ KIỆN, và DỊCH VỤ CỦA CỬA HÀNG.
           - Nếu khách hàng hỏi những câu hỏi ngoài lề (ví dụ: chính trị, tôn giáo, nấu ăn, thời tiết, giải toán, code...), bạn PHẢI TỪ CHỐI LỊCH SỰ.
           - Câu trả lời mẫu: "Dạ, em là trợ lý AI của QuangHưng Mobile, em chỉ chuyên tư vấn về các sản phẩm công nghệ như điện thoại, phụ kiện thôi ạ. Anh/chị có đang quan tâm đến dòng smartphone nào không, em hỗ trợ mình nhé!"

        <Lịch sử trò chuyện gần nhất>
        {chat_history}
        </Lịch sử trò chuyện gần nhất>

        <Thông tin sản phẩm & Tri thức (RAG Context)>
        {{context}}
        </Thông tin sản phẩm & Tri thức (RAG Context)>
        
        Câu hỏi của khách hàng: {{question}}
        
        Hãy đưa ra câu trả lời thuyết phục, thông minh và đậm chất tư vấn bán hàng chuyên nghiệp:
        """
        prompt = PromptTemplate(
            template=system_template,
            input_variables=["context", "question"]
        )

        qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.vectorstore.as_retriever(search_kwargs={"k": 5}),
            chain_type_kwargs={"prompt": prompt, "document_variable_name": "context"}
        )
        
        try:
            result = qa_chain.invoke({"query": standalone_question})
            return result["result"]
        except Exception as e:
            return f"Xin lỗi, tôi gặp chút khó khăn trong việc tổng hợp thông tin: {str(e)}"

    def _get_general_knowledge(self) -> str:
        """Lấy kiến thức chung từ bảng chatbot_knowledge - có RAM cache 5 phút"""
        import time
        now = time.time()
        
        # Trả về cache nếu còn hiệu lực
        if self._knowledge_cache is not None and (now - self._knowledge_cache_time) < self._KNOWLEDGE_CACHE_TTL:
            print("[CACHE HIT] Trả knowledge từ RAM cache")
            return self._knowledge_cache
        
        # Cache hết hạn hoặc chưa có -> query MySQL
        print("[CACHE MISS] Query MySQL chatbot_knowledge...")
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT title, content FROM chatbot_knowledge WHERE is_active = 1")
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            if rows:
                knowledge = "\n<Kiến thức chung cửa hàng>\nĐây là những thông tin bổ sung về cửa hàng, bạn CÓ THỂ sử dụng để trả lời tự nhiên nếu khách hỏi:\n"
                for r in rows:
                    t = str(r['title']).replace("{", "{{").replace("}", "}}")
                    c = str(r['content']).replace("{", "{{").replace("}", "}}")
                    knowledge += f"- {t}: {c}\n"
                knowledge += "</Kiến thức chung cửa hàng>\n"
                # Lưu vào cache
                self._knowledge_cache = knowledge
                self._knowledge_cache_time = now
                return knowledge
            self._knowledge_cache = ""
            self._knowledge_cache_time = now
            return ""
        except Exception as e:
            print(f"Error fetching knowledge: {e}")
            return self._knowledge_cache or ""

    def query_brand_products(self, brand: str, question: str, history: List[Dict] = None, interests: List[str] = None) -> str:
        """Truy vấn SQL trực tiếp theo hãng sản phẩm"""
        try:
            conn = mysql.connector.connect(
                host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME
            )
            cursor = conn.cursor(dictionary=True)
            query = """
                SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho,
                       hsx.ten_hang,
                       ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                FROM san_pham sp
                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) LIKE %s
                ORDER BY sp.gia ASC
                LIMIT 8
            """
            cursor.execute(query, (f"%{brand.lower()}%",))
            products = cursor.fetchall()
            cursor.close()
            conn.close()
            
            if not products:
                return None  # Return None to fallback to semantic search
            
            # Build product context for LLM
            product_context = ""
            for p in products:
                price_formatted = f"{int(p['gia']):,}".replace(",", ".") + "đ" if p['gia'] else "N/A"
                price_raw = int(p['gia']) if p['gia'] else 0
                product_context += f"""\nSản phẩm: {p['ten_sp']}
  Hãng: {p['ten_hang'] or 'N/A'}
  Danh mục: Điện thoại
  Giá: {price_formatted}
  Giá số: {price_raw}
  Bộ nhớ: {p['bo_nho'] or 'N/A'}
  ID: {p['ma_sp']}
  Ảnh: {p['anh_dai_dien'] or ''}"""
                if p.get('ram'):
                    product_context += f"\n  Cấu hình: RAM {p['ram']}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}"
            
            total_count = len(products)
            
            # Lấy kiến thức chung
            general_knowledge = self._get_general_knowledge()
            
            # Format history
            chat_history = ""
            if history:
                for msg in history[-5:]:
                    role = "Khách hàng" if msg.get("role") == "user" else "Chatbot"
                    chat_history += f"{role}: {msg.get('content')}\n"
            
            # Cá nhân hóa
            interests_instruction = ""
            if interests and len(interests) > 0:
                interests_str = ", ".join(interests)
                interests_instruction = f"LƯU Ý CÁ NHÂN HÓA: Khách hàng này có sở thích: {interests_str}. Hãy ưu tiên phân tích sản phẩm theo góc độ sở thích này."
            
            system_prompt = f"""Bạn là Chuyên gia Tư vấn Công nghệ của QuangHưng Mobile.

DƯỚI ĐÂY LÀ DANH SÁCH CHÍNH XÁC {total_count} SẢN PHẨM CỦA HÃNG {brand.upper()} HIỆN CÓ TẠI CỬA HÀNG:
{product_context}

{general_knowledge}
{interests_instruction}

QUY TẮC BẮT BUỘC:
1. Trả lời CHÍNH XÁC dựa trên danh sách sản phẩm bên trên. Có tổng cộng {total_count} sản phẩm {brand}.
2. KHÔNG BỊA ĐẶT sản phẩm không có trong danh sách.
3. BẠN BẮT BUỘC PHẢI DÙNG HTML ĐỂ HIỂN THỊ SẢN PHẨM. Mỗi khi nói về một sản phẩm, BẮT BUỘC dùng thẻ HTML:
   <div style="display:flex; margin-top:10px; margin-bottom:10px; gap:15px; border: 1px solid #ddd; padding: 15px; border-radius: 8px; background-color: #fff;">
     <div style="flex-shrink: 0;">
       <img src="images/{{{{Anh}}}}" alt="{{{{Ten_san_pham}}}}" style="width:100px; height:auto; object-fit:contain;">
     </div>
     <div style="flex-grow: 1;">
       <div style="font-size:16px; font-weight:bold; color:#333; margin-bottom:5px;">{{{{Ten_san_pham}}}}</div>
       <div style="margin-bottom:5px; color:#333;">Giá: <span style="color:#d32f2f; font-weight:bold;">{{{{Gia}}}}</span></div>
       <div style="font-size:14px; color:#555; margin-bottom:10px; line-height:1.5;">{{{{Cau_hinh}}}}</div>
       <div>
         <a href="product-detail.html?id={{{{ID}}}}" style="display:inline-block; padding:8px 16px; background-color:#1976d2; color:#fff; text-decoration:none; border-radius:4px; font-size:14px; font-weight:500;">Xem chi tiết</a>
       </div>
     </div>
   </div>
   (Trong đó, {{{{Anh}}}} BẮT BUỘC phải điền chính xác 100% tên file ảnh từ trường "Ảnh" được cung cấp trong danh sách sản phẩm bên trên (Ví dụ: "samsung-galaxy-a07-black-1_2.webp" - KHÔNG tự chế tên file, KHÔNG bỏ đuôi .webp/.jpg/.png/.avif). Thay thế {{{{Ten_san_pham}}}}, {{{{Gia}}}}, {{{{ID}}}} bằng thông tin tương ứng. {{{{Cau_hinh}}}} là chuỗi tóm tắt thông số cấu hình như RAM, Chip, Pin, Màn hình, Camera).
4. TUYỆT ĐỐI KHÔNG dùng Markdown (không dùng ** hay *). Chỉ dùng HTML (<br>, <strong>, <div>). Bắt buộc phải render giao diện thẻ sản phẩm như trên.
5. Xưng hô lịch sự: "Dạ", "em", "anh/chị".
6. So sánh ưu/nhược điểm nếu có nhiều sản phẩm.
7. Cuối câu trả lời, đưa ra gợi ý tiếp theo.
8. GUARDRAILS: CHỈ TƯ VẤN về CÔNG NGHỆ, ĐIỆN THOẠI, LAPTOP, PHỤ KIỆN, và DỊCH VỤ CỦA CỬA HÀNG. TỪ CHỐI LỊCH SỰ nếu hỏi ngoài lề.

Lịch sử trò chuyện:
{chat_history}

Câu hỏi của khách hàng: {question}

Hãy đưa ra câu trả lời thuyết phục, thông minh và đậm chất tư vấn bán hàng chuyên nghiệp:"""
            
            response = self.llm.invoke(system_prompt)
            return response.content
        except Exception as e:
            try:
                print(f"Error in query_brand_products: {e}".encode('utf-8', 'replace').decode('utf-8'))
            except UnicodeEncodeError:
                print("Error in query_brand_products: <unicode error>")
            return None

    def query_admin_kpi(self, question: str) -> str:
        """Sử dụng Text-to-SQL báo cáo nâng cao dành cho Admin"""
        chain = create_sql_query_chain(self.llm, self.db)
        
        try:
            # 1. Sinh câu lệnh SQL
            sql_query = chain.invoke({"question": question + " Trả về kết quả bằng tiếng Việt."})
            
            # Làm sạch SQL string
            if "```sql" in sql_query:
                sql_query = sql_query.split("```sql")[1].split("```")[0].strip()
            elif "```" in sql_query:
                sql_query = sql_query.split("```")[1].strip()
                
            import re
            parts = re.split(r'(?:sql\s*query|sqlquery|query|question)\s*:', sql_query, flags=re.IGNORECASE)
            if len(parts) > 1:
                sql_query = parts[-1].strip()
                
            match = re.search(r'\b(SELECT|SHOW|WITH|DESCRIBE)\b', sql_query, re.IGNORECASE)
            if match:
                sql_query = sql_query[match.start():].strip()
                
            sql_query = sql_query.split(";")[0].strip()
                
            # Kiểm tra an toàn SQL
            forbidden_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT", "REVOKE"]
            upper_query = sql_query.upper()
            if any(f" {keyword} " in f" {upper_query} " or upper_query.startswith(f"{keyword} ") for keyword in forbidden_keywords):
                return "Xin lỗi, tôi phát hiện hành động truy vấn nguy hại CSDL nên đã tự động chặn lại để bảo mật."
                
            # 2. Thực thi truy vấn
            result = self.db.run(sql_query)
            
            # 3. Sử dụng Prompt đặc biệt dành cho Admin để render HTML Table báo cáo
            prompt = PromptTemplate.from_template(
                "Bạn là Trợ lý Phân tích Dữ liệu (BI Assistant) cao cấp của QuangHưng Mobile.\n"
                "Nhiệm vụ: báo cáo số liệu chính xác, chuyên nghiệp cho Quản trị viên.\n\n"
                "Câu hỏi quản trị: {question}\n"
                "Kết quả truy vấn CSDL (số liệu chính xác 100%): {result}\n\n"
                "=== QUY TẮC BẮT BUỘC (PHẢI TUÂN THỦ 100%) ===\n"
                "1. TUYỆT ĐỐI CẤM dùng Markdown. KHÔNG dùng ký tự: ** * | --- # > ` ```\n"
                "   Chỉ dùng HTML thuần: <br>, <strong>, <em>, <span>, <div>, <table>, <tr>, <th>, <td>, <thead>, <tbody>.\n"
                "2. Khi có danh sách hoặc số liệu, BẮT BUỘC render HTML Table. Đây là mẫu CHÍNH XÁC phải tuân theo:\n\n"
                '<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:13px; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">\n'
                "  <thead>\n"
                '    <tr style="background:#1e3c72; color:#fff;">\n'
                '      <th style="padding:10px 12px; text-align:left;">Tên sản phẩm</th>\n'
                '      <th style="padding:10px 12px; text-align:center;">Số lượng tồn</th>\n'
                '      <th style="padding:10px 12px; text-align:right;">Giá bán</th>\n'
                "    </tr>\n"
                "  </thead>\n"
                "  <tbody>\n"
                '    <tr style="border-bottom:1px solid #eee;">\n'
                '      <td style="padding:10px 12px;">iPhone 15 Pro Max</td>\n'
                '      <td style="padding:10px 12px; text-align:center; color:#e53935; font-weight:bold;">2</td>\n'
                '      <td style="padding:10px 12px; text-align:right;">29.990.000đ</td>\n'
                "    </tr>\n"
                "  </tbody>\n"
                "</table>\n\n"
                "3. Bảng phải có ĐẦY ĐỦ các cột dữ liệu liên quan (tên SP, số lượng, giá, doanh thu... tuỳ ngữ cảnh). KHÔNG chỉ hiện 1 cột tên.\n"
                "4. Tiêu đề báo cáo dùng <strong> hoặc <span style='font-size:16px; font-weight:bold;'>. KHÔNG dùng **.\n"
                "5. Số tiền định dạng: 29.990.000đ (dùng dấu chấm phân cách hàng nghìn).\n"
                "6. Cuối báo cáo, đưa nhận xét ngắn gọn bằng HTML (dùng <br> xuống dòng).\n"
                "7. Báo cáo bằng tiếng Việt, trang trọng, chuyên nghiệp.\n\n"
                "Báo cáo quản trị:"
            )
            answer_chain = prompt | self.llm
            final_answer = answer_chain.invoke({"question": question, "result": result})
            return final_answer.content
        except Exception as e:
            return f"Lỗi truy vấn báo cáo KPI: {str(e)}"

    def process_admin_chat(self, message: str, history: List[Dict] = None) -> str:
        """Bộ định tuyến dành riêng cho Admin: Định tuyến giữa SQL báo cáo và Semantic FAQ"""
        msg_lower = message.lower()
        is_bi_query = any(kw in msg_lower for kw in [
            'doanh thu', 'bán được', 'đơn hàng', 'doanh số', 'tồn kho', 'hết hàng',
            'sắp hết', 'thống kê', 'báo cáo', 'bán chạy', 'đánh giá', 'kpi', 'thu nhập'
        ])
        
        if is_bi_query:
            print("=> Routing to Admin BI/SQL engine")
            return self.query_admin_kpi(message)
        else:
            print("=> Routing to Semantic/RAG engine for Admin FAQ")
            return self.query_semantic(message, history)

    def process_chat(self, message: str, history: List[Dict] = None, is_admin: bool = False, user_id: Any = None, interests: List[str] = None) -> str:
        """Router: Phân loại câu hỏi để dùng Brand SQL, RAG hay Text-to-SQL"""
        msg_lower = message.lower()
        
        # 1. Detect brand-specific queries
        brand_map = {
            'vivo': 'Vivo', 'samsung': 'Samsung', 'galaxy': 'Samsung',
            'iphone': 'Apple', 'apple': 'Apple', 'xiaomi': 'Xiaomi',
            'redmi': 'Xiaomi', 'poco': 'Xiaomi', 'oppo': 'Oppo',
            'realme': 'Realme', 'sony': 'Sony', 'xperia': 'Sony',
            'google': 'Google', 'pixel': 'Google', 'asus': 'Asus',
            'rog': 'Asus', 'tecno': 'Tecno', 'nokia': 'Nokia',
            'huawei': 'Huawei', 'honor': 'Honor'
        }
        
        detected_brand = None
        for keyword, brand in brand_map.items():
            if keyword in msg_lower:
                detected_brand = brand
                break
        
        # Detect "all products" queries
        is_listing_query = any(kw in msg_lower for kw in [
            'tất cả', 'tat ca', 'tổng hợp', 'tong hop', 'liệt kê', 'liet ke',
            'danh sách', 'danh sach', 'có mấy', 'co may', 'bao nhiêu', 'bao nhieu',
            'những', 'nhung', 'các mẫu', 'cac mau', 'các dòng', 'cac dong',
            'có gì', 'co gi', 'có những', 'cho xem', 'show me'
        ])
        
        # If brand detected and it's a listing/product query, use direct SQL
        if detected_brand and (is_listing_query or any(kw in msg_lower for kw in [
            'điện thoại', 'dien thoai', 'máy', 'may', 'mẫu', 'mau', 'dòng', 'dong',
            'giá', 'gia', 'tư vấn', 'tu van', 'gợi ý', 'goi y', 'nào', 'nao'
        ])):
            print(f"=> Routing to Brand SQL engine for brand: {detected_brand}")
            result = self.query_brand_products(detected_brand, message, history, interests)
            if result:
                return result
            print(f"Brand SQL returned nothing, falling back to Semantic/RAG")
        
        # 2. KPI / thống kê queries (CHỈ CHO PHÉP NẾU LÀ ADMIN)
        if not is_admin:
            print("=> Routing to Semantic/RAG engine (Public user forced)")
            return self.query_semantic(message, history, interests)
            
        router_prompt = PromptTemplate.from_template(
            "Câu hỏi sau đây của người dùng thuộc loại nào?\n"
            "Câu hỏi: {question}\n\n"
            "Chọn 1 trong 2 loại sau và chỉ trả về tên loại, không giải thích:\n"
            "1. KPI (nếu hỏi về số lượng bán, doanh thu, đơn hàng, thống kê, đánh giá)\n"
            "2. SEMANTIC (nếu hỏi về tính năng sản phẩm, cấu hình, tư vấn mua máy, tìm kiếm điện thoại)\n"
            "Loại:"
        )
        
        router_chain = router_prompt | self.llm
        try:
            intent = router_chain.invoke({"question": message}).content.strip().upper()
        except Exception as e:
            print(f"Router chain failed: {e}. Defaulting to SEMANTIC.")
            intent = "SEMANTIC"
        
        if "KPI" in intent:
            print("=> Routing to KPI/SQL engine")
            return self.query_kpi(message)
        else:
            print("=> Routing to Semantic/RAG engine")
            return self.query_semantic(message, history, interests)

# Khởi tạo singleton instance
rag_engine = None

def get_rag_engine():
    global rag_engine
    if rag_engine is None:
        rag_engine = RAGEngine()
    return rag_engine
