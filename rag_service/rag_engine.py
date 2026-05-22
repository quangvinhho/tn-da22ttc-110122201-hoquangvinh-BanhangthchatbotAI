import os
import mysql.connector
from dotenv import load_dotenv
from typing import List, Dict, Any

from langchain_classic.chains import create_sql_query_chain
from langchain_community.utilities import SQLDatabase
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma
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
        
        # Lấy thông tin sản phẩm và cấu hình
        query = """
            SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.mo_ta_ngan, sp.anh_dai_dien, ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
            FROM san_pham sp
            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
            WHERE sp.so_luong_ton > 0
        """
        cursor.execute(query)
        products = cursor.fetchall()
        
        documents = []
        for p in products:
            # Tạo nội dung text để nhúng (embedding)
            content = f"Sản phẩm: {p['ten_sp']}. Giá: {p['gia']} VNĐ. Mô tả: {p['mo_ta_ngan']}. ID (ma_sp): {p['ma_sp']}. Ảnh (anh_dai_dien): {p['anh_dai_dien']}. "
            if p['ram']:
                content += f"Cấu hình: RAM {p['ram']}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}."
            
            doc = Document(
                page_content=content,
                metadata={"type": "product", "ma_sp": p['ma_sp'], "ten_sp": p['ten_sp'], "gia": float(p['gia']), "anh_dai_dien": p['anh_dai_dien']}
            )
            documents.append(doc)
            
        # Lấy thông tin từ chatbot_knowledge
        cursor.execute("SELECT question, answer, type FROM chatbot_knowledge WHERE is_active = 1")
        knowledge_items = cursor.fetchall()
        for k in knowledge_items:
            content = f"Câu hỏi / Từ khóa: {k['question']}\nTrả lời: {k['answer']}"
            doc = Document(
                page_content=content,
                metadata={"type": "knowledge", "category": k['type']}
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
            
            # Làm sạch SQL string nếu LLM trả về markdown
            if "```sql" in sql_query:
                sql_query = sql_query.split("```sql")[1].split("```")[0].strip()
            elif "```" in sql_query:
                sql_query = sql_query.split("```")[1].strip()
                
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

    def query_semantic(self, question: str, history: List[Dict] = None) -> str:
        """Sử dụng RAG để tìm kiếm thông tin theo ngữ nghĩa và ngữ cảnh trò chuyện"""
        if not self.vectorstore:
            return "Chưa có dữ liệu thông tin linh kiện/sản phẩm để hỗ trợ."

        # Định dạng lịch sử trò chuyện
        chat_history = ""
        if history:
            for msg in history[-5:]:  # Chỉ lấy 5 tin nhắn gần nhất để giữ context
                role = "Khách hàng" if msg.get("role") == "user" else "Chatbot"
                chat_history += f"{role}: {msg.get('content')}\n"

        # Tùy chỉnh prompt để AI trả lời theo ngữ cảnh RAG và lịch sử
        history_instruction = ""
        if history and len(history) > 0:
            history_instruction = "LƯU Ý QUAN TRỌNG: Khách hàng ĐÃ ĐĂNG NHẬP và có lịch sử chat bên dưới. Hãy ĐỌC KỸ LỊCH SỬ để nhớ lại sở thích, mức giá, dòng điện thoại khách từng hỏi. Dựa vào đó, hãy CHỦ ĐỘNG ĐƯA RA CÁC GỢI Ý ĐIỆN THOẠI phù hợp với họ. Hãy thể hiện bạn là một trợ lý ảo nhớ rất rõ khách hàng!"
        else:
            history_instruction = "LƯU Ý: Người dùng chưa đăng nhập hoặc đây là phiên chat mới (không có lịch sử). Chỉ tư vấn tập trung vào câu hỏi hiện tại, không tự chế ra lịch sử."

        system_template = f"""
        Bạn là chuyên viên tư vấn bán hàng của hệ thống điện thoại QuangHung Mobile.
        Mục tiêu của bạn là thấu hiểu NGỮ NGHĨA và Ý ĐỊNH sâu xa của khách hàng để đưa ra GỢI Ý MUA SẮM SIÊU CHÍNH XÁC (không chỉ đơn thuần là tìm kiếm keyword).

        {history_instruction}
        
        NGUYÊN TẮC HOẠT ĐỘNG:
        1. THÂN THIỆN & CHĂM SÓC: Xưng hô "mình/bạn" hoặc "dạ, em/anh chị". Luôn niềm nở, lịch sự.
        2. TƯ VẤN NGỮ NGHĨA (CHÍNH XÁC): 
           - Khi khách hàng mô tả nhu cầu (ví dụ: "chơi game mượt", "chụp ảnh đẹp", "pin trâu", "tài chính 5 triệu"), bạn phải tự suy luận ra cấu hình tương ứng (ví dụ: cần Chip mạnh, Camera xịn, Pin > 5000mAh) rồi tìm trong Context các điện thoại đáp ứng yêu cầu đó để gợi ý.
           - Đưa ra 2-3 sự lựa chọn tốt nhất kèm phân tích RÕ RÀNG ưu/nhược điểm từng dòng máy dựa sát vào tài chính và nhu cầu của khách.
        3. KHÔNG BỊA ĐẶT DỮ LIỆU: Nếu trong Context RAG KHÔNG CÓ dữ liệu về điện thoại/giá cả khách hỏi, hãy nhẹ nhàng nói "Hiện tại QuangHung Mobile tạm hết hàng dòng này hoặc chưa có thông tin cụ thể, nhưng cửa hàng đang có các dòng máy tương đương sau đây..." rồi gợi ý con máy khác có trong bối cảnh.
        4. CHỐT BÁN HÀNG: Luôn kèm một câu Call-to-action (kêu gọi hành động) ở cuối như "Bạn có muốn xem chi tiết cấu hình máy này không ạ?" hoặc "Bạn muốn ghé cửa hàng test thử máy không ạ?".
        5. ĐỊNH DẠNG TRẢ VỀ (QUAN TRỌNG):
           - LUÔN LUÔN TRẢ LỜI CÓ TÂM: Phải có câu chào thân thiện và giới thiệu/tư vấn bằng văn bản tự nhiên TRƯỚC KHI hiển thị thẻ sản phẩm. Đừng chỉ trả về mỗi thẻ HTML trống không.
           - QUY TẮC ĐỊNH DẠNG: Bạn chỉ được dùng chữ thường kết hợp với thẻ HTML cơ bản (như <br>, <strong>). KHÔNG BAO GIỜ DÙNG MARKDOWN NHƯ IN ĐẬM ** **, HAY IN NGHIÊNG * *, HAY LIST -. Bắt buộc dùng HTML để định dạng.
           - CHÚ Ý: KHI GỢI Ý ĐIỆN THOẠI, BẮT BUỘC PHẢI TRẢ VỀ MẪU HTML SAU ĐỂ HIỂN THỊ ẢNH VÀ LINK (Tuyệt đối không dùng markdown):
           <div style="display:flex; align-items:center; margin-top:10px; margin-bottom:10px; gap:15px; border: 1px solid #ddd; padding: 10px; border-radius: 8px;">
             <img src="{{{{Anh}}}}" alt="{{{{Ten_san_pham}}}}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;">
             <div>
               <strong>{{{{Ten_san_pham}}}}</strong><br>
               Giá: <span style="color:#e53935; font-weight:bold;">{{{{Gia}}}}</span><br>
               <a href="product-detail.html?id={{{{ID}}}}" style="display:inline-block; margin-top:5px; padding:5px 10px; background-color:#1976d2; color:#fff; text-decoration:none; border-radius:4px; font-size:12px;">Xem chi tiết</a>
             </div>
           </div>
           (Thay thế {{{{Anh}}}}, {{{{Ten_san_pham}}}}, {{{{Gia}}}}, {{{{ID}}}} bằng dữ liệu anh_dai_dien, ten_sp, gia, ma_sp của sản phẩm trong RAG Context).
        
        <Lịch sử trò chuyện gần nhất>
        {chat_history}
        </Lịch sử trò chuyện gần nhất>

        <Thông tin sản phẩm & Tri thức (RAG Context)>
        {{context}}
        </Thông tin sản phẩm & Tri thức (RAG Context)>
        
        Câu hỏi của khách hàng: {{question}}
        
        Hãy đưa ra câu trả lời chi tiết, chính xác và đúng ngữ nghĩa:
        """
        prompt = PromptTemplate(
            template=system_template,
            input_variables=["context", "question"]
        )

        qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.vectorstore.as_retriever(search_kwargs={"k": 15}),
            chain_type_kwargs={"prompt": prompt, "document_variable_name": "context"}
        )
        
        try:
            result = qa_chain.invoke({"query": question})
            return result["result"]
        except Exception as e:
            return f"Xin lỗi, tôi gặp chút khó khăn trong việc tổng hợp thông tin: {str(e)}"

    def process_chat(self, message: str, history: List[Dict] = None) -> str:
        """Router: Phân loại câu hỏi để dùng RAG hay Text-to-SQL"""
        # Prompt đơn giản để LLM tự quyết định dùng công cụ nào
        router_prompt = PromptTemplate.from_template(
            "Câu hỏi sau đây của người dùng thuộc loại nào?\n"
            "Câu hỏi: {question}\n\n"
            "Chọn 1 trong 2 loại sau và chỉ trả về tên loại, không giải thích:\n"
            "1. KPI (nếu hỏi về số lượng bán, doanh thu, đơn hàng, thống kê, đánh giá)\n"
            "2. SEMANTIC (nếu hỏi về tính năng sản phẩm, cấu hình, tư vấn mua máy, tìm kiếm điện thoại)\n"
            "Loại:"
        )
        
        router_chain = router_prompt | self.llm
        intent = router_chain.invoke({"question": message}).content.strip().upper()
        
        if "KPI" in intent:
            print("=> Routing to KPI/SQL engine")
            return self.query_kpi(message) # Có thể truyền thêm history nếu Text-to-SQL cần ngữ cảnh
        else:
            print("=> Routing to Semantic/RAG engine")
            return self.query_semantic(message, history)

# Khởi tạo singleton instance
rag_engine = None

def get_rag_engine():
    global rag_engine
    if rag_engine is None:
        rag_engine = RAGEngine()
    return rag_engine
