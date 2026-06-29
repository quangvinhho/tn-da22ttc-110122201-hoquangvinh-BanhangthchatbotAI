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

def remove_diacritics(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').replace('đ', 'd').replace('Đ', 'D')

def sanitize_ai_response(text: str) -> str:
    if not text:
        return text
    import re
    cleaned = text
    cleaned = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', cleaned)
    cleaned = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', cleaned)
    cleaned = re.sub(r'^\s*[-*]\s+', r'<br>• ', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^#+\s*(.+)$', r'<strong>\1</strong>', cleaned, flags=re.MULTILINE)
    cleaned = cleaned.replace('\n', '<br>')
    cleaned = re.sub(r'(<br>\s*){3,}', r'<br><br>', cleaned)
    return cleaned

def detect_brand_from_text(text: str) -> str:
    if not text:
        return None
    if is_accessory(text):
        return None
    import re
    t = remove_diacritics(text.lower())
    
    # 1. Apple/iPhone: ip16, ip 16, ip15pm, ip xs, ipx, ipxs, iphone, apple
    if re.search(r'\bip(?:\s*\d+|\s*(?:x|xr|xs|pro|max|plus|pm))+\b', t) or re.search(r'\bip\b', t) or 'iphone' in t or 'apple' in t:
        return 'Apple'
        
    # 2. Samsung: ss, ss24, ss s24, s24u, samsung, galaxy
    if re.search(r'\bss(?:\s*s?\d+|\s*ultra|\s*u)?\b', t) or re.search(r'\bss\b', t) or 'samsung' in t or 'galaxy' in t:
        return 'Samsung'
        
    # 3. Xiaomi: mi, mi13, mi14, mi 13, xiaomi, redmi, poco
    if re.search(r'\bmi(?:\s*\d+)?\b', t) or re.search(r'\bmi\b', t) or 'xiaomi' in t or 'redmi' in t or 'poco' in t:
        return 'Xiaomi'
        
    # 4. Oppo: oppo, op (only if not accessory op lung/op magsafe etc)
    if 'oppo' in t:
        return 'Oppo'
    if re.search(r'\bop\b', t):
        if not is_accessory(text):
            return 'Oppo'
            
    # 5. Other brands
    other_brands = {
        'vivo': 'Vivo',
        'realme': 'Realme',
        'sony': 'Sony',
        'xperia': 'Sony',
        'google': 'Google',
        'pixel': 'Google',
        'asus': 'Asus',
        'rog': 'Asus',
        'tecno': 'Tecno',
        'nokia': 'Nokia',
        'huawei': 'Huawei',
        'honor': 'Honor'
    }
    for kw, brand in other_brands.items():
        if kw in t:
            return brand
            
    return None

def is_accessory(name: str) -> bool:
    if not name:
        return False
    n = remove_diacritics(name.lower())
    keywords = [
        'op lung', 'op luong', 'op magsafe', 'cap sac', 'cu sac', 'sac nhanh', 
        'tai nghe', 'cuong luc', 'bao da', 'dan man hinh', 'the nho', 
        'pin du phong', 'sac du phong', 'case', 'kinh cuong luc',
        'day sac', 'day cap', 'coc sac', 'adapter'
    ]
    if any(kw in n for kw in keywords):
        return True
    import re
    if re.search(r'\b(sac|cap)\b', n):
        return True
    if re.search(r'\bop\b(?!po)', n):
        return True
    return False

def safe_parse_float(s: str) -> float:
    s = s.replace(',', '.')
    if '.' in s:
        parts = s.split('.')
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            s = ''.join(parts)
        elif len(parts) == 2 and len(parts[1]) in (1, 2):
            s = parts[0] + '.' + parts[1]
    return float(s)

def parse_price_constraint(question: str):
    import re
    if not question:
        return None
        
    q = remove_diacritics(question.lower())
    # Normalize spaces: remove all spaces to make matching easier and contiguous
    q_no_space = re.sub(r'\s+', '', q)
    
    # 1. Check comparison direction: max (dưới, <=, trở xuống, đổ lại, tầm, khoảng) vs min (trên, >=, trở lên, hơn)
    is_max = False
    is_min = False
    
    max_keywords = ['duoi', '<=', 'troxuong', 'dolai', 'tam', 'khoang', 'max', 'ngansach']
    min_keywords = ['tren', '>=', 'trolen', 'hon', 'min']
    
    # Check if max or min keywords are in the question (unspaced)
    for kw in max_keywords:
        if kw in q_no_space:
            is_max = True
            break
            
    for kw in min_keywords:
        if kw in q_no_space:
            is_min = True
            break
            
    # Default to max if no direction is specified (e.g. "iPhone 5tr" -> max budget 5tr)
    if not is_max and not is_min:
        is_max = True
        
    # 2. Extract values using precise regexes on q_no_space
    # Pattern A: (\d+)(?:trieu|tr|t)(\d+) -> e.g. 5tr5, 15t800
    match_a = re.search(r'(\d+)(?:trieu|tr|t)(\d+)', q_no_space)
    if match_a:
        try:
            mil = int(match_a.group(1))
            frac_str = match_a.group(2)
            val = (mil + float("0." + frac_str)) * 1000000
            return ("max" if is_max else "min", val)
        except ValueError:
            pass
            
    # Pattern B: (\d+[\.,]\d+)(?:trieu|tr|t) -> e.g. 5.5tr, 5,5tr
    match_b = re.search(r'(\d+[\.,]\d+)(?:trieu|tr|t)', q_no_space)
    if match_b:
        try:
            val = float(match_b.group(1).replace(',', '.')) * 1000000
            return ("max" if is_max else "min", val)
        except ValueError:
            pass
            
    # Pattern C: (\d+)(?:trieu|tr|t)\b -> e.g. 5tr, 15trieu
    match_c = re.search(r'(\d+)(?:trieu|tr|t)\b', q_no_space)
    if match_c:
        try:
            val = int(match_c.group(1)) * 1000000
            return ("max" if is_max else "min", val)
        except ValueError:
            pass
            
    # Pattern D: (\d+)k\b -> e.g. 500k
    match_d = re.search(r'(\d+)k\b', q_no_space)
    if match_d:
        try:
            val = int(match_d.group(1)) * 100
            # Wait! Let's check: 500k is 500 * 1000 = 500000. Wait, in my replacement code here I typed `int(match_d.group(1)) * 100` instead of `* 1000`. Good catch! Let's correct it to `* 1000`.
            val = int(match_d.group(1)) * 1000
            return ("max" if is_max else "min", val)
        except ValueError:
            pass
            
    # Pattern E: (\d{7,}) -> e.g. 5000000
    match_e = re.search(r'(\d{7,})', q_no_space)
    if match_e:
        try:
            val = int(match_e.group(1))
            return ("max" if is_max else "min", val)
        except ValueError:
            pass
            
    # Pattern F: (\d{1,3}(?:[.,]\d{3})+) -> e.g. 5.000.000
    match_f = re.search(r'(\d{1,3}(?:[.,]\d{3})+(?:\s*(?:d|vnd|dong))?)', q)
    if match_f:
        try:
            digits = re.sub(r'[^\d]', '', match_f.group(1))
            if digits:
                val = int(digits)
                return ("max" if is_max else "min", val)
        except ValueError:
            pass
            
    return None



_IS_PROD = os.getenv("NODE_ENV") == "production" or os.getenv("ENV") == "production"
# Fallback DB_PASSWORD (chuẩn) → DB_PASS (legacy)
_DB_PASS_RAW = os.getenv("DB_PASSWORD") or os.getenv("DB_PASS")
if _IS_PROD and not _DB_PASS_RAW:
    raise SystemExit("FATAL: DB_PASSWORD chưa set ở production (rag_engine).")
if not _DB_PASS_RAW:
    print("WARN: DB_PASSWORD chưa set — rag_engine dùng default dev.")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = _DB_PASS_RAW or "Vinh123456789@"
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
        # Giảm TTL 300 → 60s để cập nhật FAQ nhanh hơn nhưng vẫn cache để tránh DB hit mỗi câu hỏi
        self._KNOWLEDGE_CACHE_TTL = 60

        # 5. Vectorstore freshness: so checksum DB vs Chroma định kỳ → auto rebuild khi lệch
        # Tránh trường hợp admin xoá/sửa SP nhưng vectorstore vẫn giữ data cũ → LLM "bịa" SP
        self._last_freshness_check = 0
        self._FRESHNESS_CHECK_TTL = 300  # 5 phút giữa các lần so checksum
        
        # Try to load existing vector store or create a new one
        if os.path.exists(self.vector_dir):
            self.vectorstore = Chroma(persist_directory=self.vector_dir, embedding_function=self.embeddings)
        else:
            self.vectorstore = self._initialize_vector_store()
            
    def normalize_query(self, text: str) -> str:
        if not text:
            return text
        import re
        t = text.lower()
        
        t = re.sub(r'\bss\b', 'samsung', t)
        t = re.sub(r'\bip\b', 'iphone', t)
        
        synonyms = {
            r'\bop\s+luong\b': 'ốp lưng',
            r'\bop\s+lung\b': 'ốp lưng',
            r'\bcase\b': 'ốp lưng',
            r'\bop\s+chong\s+soc\b': 'ốp lưng chống sốc',
            r'\bop\s+lung\s+chong\s+soc\b': 'ốp lưng chống sốc',
            r'\bcap\s+sac\b': 'cáp sạc',
            r'\bcu\s+sac\b': 'củ sạc',
            r'\bsac\s+nhanh\b': 'sạc nhanh',
            r'\btai\s+nghe\b': 'tai nghe',
            r'\bcuong\s+luc\b': 'kính cường lực',
            r'\bdan\s+man\s+hinh\b': 'miếng dán màn hình',
            r'\bthe\s+nho\b': 'thẻ nhớ',
            r'\bpin\s+du\s+phong\b': 'pin dự phòng',
            r'\bsac\s+du\s+phong\b': 'sạc dự phòng'
        }
        
        for pattern, repl in synonyms.items():
            t = re.sub(pattern, repl, t)
            
        t = re.sub(r'\bop\b(?!po)', 'ốp lưng', t)
        t = re.sub(r'\bốp\b(?!po)', 'ốp lưng', t)
        t = re.sub(r'\bhong\b', 'không', t)
        t = re.sub(r'\bhông\b', 'không', t)
        
        return t
            
    def _load_documents_from_db(self):
        print("Loading documents from MySQL DB...")
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
            
            # Phân loại sản phẩm (Phụ kiện vs Điện thoại)
            category_name = "Phụ kiện" if is_accessory(p['ten_sp']) else "Điện thoại"
            
            # Tạo nội dung text để nhúng (embedding)
            content = f"Sản phẩm: {p['ten_sp']}. Hãng sản xuất: {p.get('ten_hang') or 'Khác'}. Loại sản phẩm (Danh mục): {category_name}. Giá bán: {p['gia']} VNĐ. Bộ nhớ: {p.get('bo_nho') or 'N/A'}. ID sản phẩm (ma_sp): {p['ma_sp']}. Ảnh đại diện (anh_dai_dien): {p['anh_dai_dien']}. "
            if mo_ta:
                content += f"Mô tả: {mo_ta}. "
            if p['ram']:
                content += f"Cấu hình: RAM {p['ram']}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}."
            
            doc = Document(
                page_content=content,
                metadata={"type": "product", "ma_sp": p['ma_sp'], "ten_sp": p['ten_sp'], "gia": float(p['gia']), "anh_dai_dien": p['anh_dai_dien'], "ten_loai": category_name, "ten_hang": p.get('ten_hang') or 'Khác'}
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
        return documents

    def _initialize_vector_store(self):
        print("Initializing Vector Store from DB...")
        documents = self._load_documents_from_db()
        if documents:
            vectorstore = Chroma.from_documents(
                documents=documents, 
                embedding=self.embeddings, 
                persist_directory=self.vector_dir
            )
            if hasattr(vectorstore, 'persist'):
                vectorstore.persist()
            return vectorstore
        return None

    def reload_vectorstore(self):
        """Xóa vector store cũ và khởi tạo lại để cập nhật dữ liệu mới"""
        print("Reloading Vector Store...")

        # Xóa RAM cache knowledge để lấy dữ liệu mới
        self._knowledge_cache = None
        self._knowledge_cache_time = 0

        # Nếu đã có vectorstore, xóa toàn bộ tài liệu cũ thông qua API để tránh lock file trên Windows
        if self.vectorstore:
            try:
                collection = self.vectorstore._collection
                results = collection.get()
                ids = results.get('ids', [])
                if ids:
                    collection.delete(ids=ids)
                    print(f"Cleared {len(ids)} existing documents from Chroma DB via API.")
            except Exception as e:
                print(f"Error clearing vector store via API: {str(e)}")
                # Nếu lỗi, giải phóng vectorstore để chuẩn bị xóa thư mục
                self.vectorstore = None
                import gc
                gc.collect()

        # Nếu không có hoặc bị lỗi giải phóng ở bước trước, xóa thư mục cũ
        if not self.vectorstore and os.path.exists(self.vector_dir):
            import shutil
            try:
                shutil.rmtree(self.vector_dir)
            except Exception as e:
                print(f"Error deleting old vector store directory: {str(e)}")

        # Load tài liệu mới từ DB
        documents = self._load_documents_from_db()
        if documents:
            if self.vectorstore:
                self.vectorstore.add_documents(documents)
                if hasattr(self.vectorstore, 'persist'):
                    self.vectorstore.persist()
                print("Vector Store updated successfully with new documents!")
            else:
                self.vectorstore = Chroma.from_documents(
                    documents=documents,
                    embedding=self.embeddings,
                    persist_directory=self.vector_dir
                )
                if hasattr(self.vectorstore, 'persist'):
                    self.vectorstore.persist()
                print("Vector Store recreated successfully!")
        else:
            print("No documents found in DB to reload.")
        return True

    def invalidate_knowledge_cache(self):
        """Chỉ xóa RAM cache knowledge (nhanh, không reload vectorstore).
        Dùng khi admin update content nhỏ → response tiếp theo lấy knowledge mới ngay
        mà không phải chờ rebuild Chroma (vài giây)."""
        self._knowledge_cache = None
        self._knowledge_cache_time = 0
        print("[RAG] Knowledge RAM cache invalidated.")
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
            # Tokenize trên \W để chặn bypass kiểu DROP/**/TABLE hay DROP\nTABLE
            forbidden_keywords = {"DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT", "REVOKE", "REPLACE", "CREATE", "RENAME"}
            tokens = set(re.split(r'\W+', sql_query.upper()))
            if tokens & forbidden_keywords:
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

        # Định dạng lịch sử trò chuyện (dọn dẹp mã HTML thừa để tiết kiệm token)
        chat_history = ""
        if history:
            import re
            for msg in history[-4:]:  # Chỉ lấy 4 tin nhắn gần nhất để giữ context gọn gàng
                role = "Khách hàng" if msg.get("role") == "user" else "Chatbot"
                content = str(msg.get('content', ''))
                
                # Nếu là Chatbot, loại bỏ các thẻ HTML dài dòng của sản phẩm để tiết kiệm token
                if role == "Chatbot":
                    # Thay thế các thẻ div sản phẩm bằng tên sản phẩm ngắn gọn
                    content = re.sub(r'<div[^>]*>.*?</div>', '', content, flags=re.DOTALL)
                    # Loại bỏ tất cả các thẻ HTML còn lại
                    content = re.sub(r'<[^>]+>', ' ', content)
                    # Thu gọn khoảng trắng
                    content = re.sub(r'\s+', ' ', content).strip()
                    # Tránh tin nhắn quá dài trong history
                    content = content[:300] + "..." if len(content) > 300 else content
                
                # Escape '{' '}' trong nội dung user/bot cũ để PromptTemplate không hiểu nhầm là placeholder
                content_safe = content.replace("{", "{{").replace("}", "}}")
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
        
        4. XỬ LÝ KHI THÔNG TIN KHÔNG CÓ TRONG CONTEXT (TUYỆT ĐỐI KHÔNG BỊA ĐẶT):
           - BẮT BUỘC KHẲNG ĐỊNH KHÔNG CÓ TRƯỚC: Nếu khách hàng hỏi về một dòng máy/hãng cụ thể trong tầm giá mà Context không có sản phẩm nào thỏa mãn (Ví dụ: khách hỏi "iPhone dưới 4 triệu" nhưng Context không có chiếc iPhone nào dưới 4 triệu), bạn BẮT BUỘC phải bắt đầu câu trả lời bằng cách khẳng định rõ ràng, lịch sự và trực tiếp là cửa hàng không có hoặc đang tạm hết dòng sản phẩm đó trong tầm giá yêu cầu (Ví dụ: "Dạ, hiện tại dòng iPhone có giá dưới 4 triệu đồng bên em đang tạm hết hàng ạ" hoặc "Dạ, hiện tại cửa hàng bên em không có mẫu iPhone nào ở phân khúc dưới 4 triệu đồng ạ").
           - GỢI Ý THAY THẾ LỊCH SỰ: Sau khi khẳng định rõ ràng là không có, bạn mới được chủ động gợi ý giới thiệu các dòng sản phẩm của hãng KHÁC đang có sẵn trong Context thỏa mãn tầm giá đó để khách tham khảo (Ví dụ: "Tuy nhiên, trong tầm giá dưới 4 triệu, anh/chị có thể tham khảo một số mẫu điện thoại Android đang có sẵn hàng tại cửa hàng như...").
           - TUYỆT ĐỐI NGHIÊM CẤM TỰ BỊA (HALLUCINATE) sản phẩm không có trong Context RAG dưới đây (như tự chế ra iPhone 8, iPhone 11, iPhone 13 có giá dưới 4 triệu).
           - LƯU Ý THUẬT NGỮ: Từ viết tắt "ip" hoặc "IP" trong câu hỏi của khách hàng luôn có nghĩa là "iPhone" (điện thoại của hãng Apple). Tuyệt đối KHÔNG được hiểu nhầm "ip" thành "IP rating" hay tiêu chuẩn kháng nước bụi (như IP53, IP52) để tự bịa ra các dòng điện thoại Android giá rẻ có chuẩn kháng nước đó.
           - Nếu khách hàng hỏi về thông tin chính sách (bảo hành, đổi trả, ship hàng, trả góp...), thông tin liên hệ hoặc các thắc mắc chung về cửa hàng KHÔNG có trong Context RAG bên dưới, tuyệt đối KHÔNG phản hồi "sản phẩm tạm hết hàng". Thay vào đó, hãy lịch sự giải đáp dựa trên các kiến thức chung hiện có và hướng dẫn khách hàng liên hệ trực tiếp với Hotline hoặc Zalo CSKH của QuangHưng Mobile để được nhân viên hỗ trợ chi tiết nhanh nhất.
        
        5. ĐỊNH DẠNG BẮT BUỘC (TUYỆT ĐỐI TUÂN THỦ):
           - Bạn BẮT BUỘC phải sử dụng thẻ HTML cho tất cả định dạng văn bản.
           - TUYỆT ĐỐI NGHIÊM CẤM sử dụng bất kỳ ký hiệu Markdown nào, bao gồm: dấu sao đôi (`**`), dấu sao đơn (`*`), dấu gạch đầu dòng (`-` hoặc `*`), dấu thăng (`#`), hay các ký tự markdown định dạng khối mã (` ``` `). Mọi định dạng in đậm phải dùng thẻ `<strong>` hoặc `<b>`. Xuống dòng dùng `<br>`. Dùng thẻ danh sách HTML (`<ul>` và `<li>`) nếu cần tạo danh sách. Bất kỳ sự rò rỉ ký tự markdown nào đều bị coi là lỗi nghiêm trọng.
           - Mỗi sản phẩm bạn gợi ý BẮT BUỘC phải được chèn vào khung HTML này (thay thế các biến [[...]] bằng dữ liệu thật):
              <div class="ai-product-card">
                <img src="[[Anh]]" alt="[[Ten_san_pham]]" class="ai-product-image">
                <div class="ai-product-info">
                  <strong class="ai-product-name">[[Ten_san_pham]]</strong>
                  <div class="ai-product-price-row">Giá: <span class="ai-product-price">[[Gia]]</span></div>
                  <div class="ai-product-config">[[Cau_hinh]]</div>
                  <div class="ai-product-actions">
                    <a href="product-detail.html?id=[[ID]]" class="ai-product-btn-detail">Xem chi tiết</a>
                    <button class="chatbot-add-cart-btn ai-product-btn-cart" data-pid="[[ID]]" data-pname="[[Ten_san_pham]]" data-pprice="[[Gia]]" data-pimage="[[Anh]]"><i class="fas fa-cart-plus"></i> Thêm</button>
                  </div>
                </div>
              </div>
             (Thay thế [[Anh]], [[Ten_san_pham]], [[Gia]], [[ID]] bằng thông tin thật. Trong đó, [[Anh]] BẮT BUỘC phải SAO CHÉP NGUYÊN VĂN 100% đường dẫn ảnh từ trường "Ảnh đại diện (anh_dai_dien)" được cung cấp trong thông tin sản phẩm (Ví dụ: "images/products/product-1766371394101-525441573.jpg" - BẮT BUỘC copy nguyên cả đường dẫn bao gồm "images/products/...", KHÔNG tự chế tên file, KHÔNG bỏ đuôi .webp/.jpg/.png/.avif, KHÔNG bỏ phần "images/products/" ở đầu). Riêng phần [[Cau_hinh]] bạn tự tổng hợp ngắn gọn các thông số như RAM, Chip, Pin, Màn hình, Camera thành 1 câu giống trong ảnh).

        6. KHỚP ẢNH CHÍNH XÁC & PHÂN LOẠI DANH MỤC SẢN PHẨM (BẮT BUỘC):
           - Hãy xem kỹ "Loại sản phẩm (Danh mục)" của từng mặt hàng được cung cấp trong Context.
           - Nếu khách hỏi mua "ĐIỆN THOẠI", chỉ tư vấn các dòng máy có loại sản phẩm là "Điện thoại" (như Redmi Note 11, Redmi Note 12, Xiaomi 13 Pro). Tuyệt đối không được lấy mẫu "Phụ kiện" (như Sạc nhanh Xiaomi 33W) để giới thiệu làm điện thoại!
           - Khi ghép thẻ HTML sản phẩm, bắt buộc phải đối chiếu khớp đúng 100% giữa Tên sản phẩm và Ảnh đại diện (anh_dai_dien) của chính sản phẩm đó. Tuyệt đối không lấy ảnh của cục sạc gán cho điện thoại và ngược lại! BẮT BUỘC sao chép chính xác 100% đường dẫn ảnh trong ngữ cảnh bao gồm cả tiền tố "images/products/" (Ví dụ: "images/products/product-1766470093003-131484230.webp", không tự sáng tạo ra tên khác). Khi thay thế biến [[Anh]], [[Ten_san_pham]], [[Gia]], [[ID]], [[Cau_hinh]] trong HTML template, hãy thay bằng dữ liệu thật từ Context.

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

        # [FIX HALLUCINATION] Thay RetrievalQA bằng manual similarity_search + context filtering
        # Lý do: RetrievalQA trả về các document Chroma gần nhất theo embedding,
        # nhưng không lọc theo giá/brand → LLM nhận iPhone 30tr cùng Redmi 3.9tr
        # → nhầm giá Redmi gán cho iPhone → hallucination.
        try:
            import re as _re
            # Lấy nhiều docs hơn (k=6) để có pool rộng hơn cho filtering
            # Lấy sản phẩm và tri thức riêng lẻ từ vector store để tránh tình trạng tri thức lấn át sản phẩm
            try:
                product_docs = self.vectorstore.similarity_search(standalone_question, k=4, filter={"type": "product"})
            except Exception as e_p:
                print(f"[RAG SEARCH] Product search error: {e_p}")
                product_docs = []
                
            try:
                knowledge_docs = self.vectorstore.similarity_search(standalone_question, k=3, filter={"type": "knowledge"})
            except Exception as e_k:
                print(f"[RAG SEARCH] Knowledge search error: {e_k}")
                knowledge_docs = []
                
            raw_docs = product_docs + knowledge_docs
            if not raw_docs:
                raw_docs = self.vectorstore.similarity_search(standalone_question, k=6)
            
            # Phân tích brand và price constraint từ câu hỏi gốc
            price_constraint = parse_price_constraint(question)
            
            # Detect brand từ câu hỏi
            detected_brand = detect_brand_from_text(question)
            
            # Lọc context: loại bỏ sản phẩm không phù hợp
            user_asked_for_accessory = is_accessory(question)
            filtered_docs = []
            for doc in raw_docs:
                meta = doc.metadata or {}
                doc_type = meta.get('type', '')
                
                # Giữ nguyên tất cả knowledge docs (chính sách, FAQ)
                if doc_type == 'knowledge':
                    filtered_docs.append(doc)
                    continue
                
                # Với product docs: lọc theo category và price constraint nếu có
                if doc_type == 'product':
                    is_acc = (meta.get('ten_loai') == 'Phụ kiện') or is_accessory(meta.get('ten_sp') or '')
                    if not user_asked_for_accessory and is_acc:
                        print(f"[RAG FILTER] Loại bỏ phụ kiện '{meta.get('ten_sp', '?')}' vì khách không hỏi phụ kiện")
                        continue
                    if user_asked_for_accessory and not is_acc:
                        print(f"[RAG FILTER] Loại bỏ điện thoại '{meta.get('ten_sp', '?')}' vì khách hỏi phụ kiện")
                        continue
                        
                    doc_price = meta.get('gia', 0)
                    if price_constraint:
                        op, limit_val = price_constraint
                        if op == 'max' and doc_price > limit_val:
                            # Sản phẩm vượt ngân sách → loại bỏ
                            print(f"[RAG FILTER] Loại bỏ '{meta.get('ten_sp', '?')}' giá {doc_price} > budget {limit_val}")
                            continue
                        elif op == 'min' and doc_price < limit_val:
                            print(f"[RAG FILTER] Loại bỏ '{meta.get('ten_sp', '?')}' giá {doc_price} < min {limit_val}")
                            continue
                
                filtered_docs.append(doc)
            
            # Nếu lọc xong không còn product nào → giữ tất cả để LLM tự trả lời "không có"
            has_product = any((d.metadata or {}).get('type') == 'product' for d in filtered_docs)
            if not has_product:
                # Giữ knowledge docs + thêm lại tối đa 2 product rẻ nhất từ raw_docs (khác brand nếu có)
                filtered_raw_products = [
                    d for d in raw_docs 
                    if (d.metadata or {}).get('type') == 'product' 
                    and (user_asked_for_accessory == ((d.metadata or {}).get('ten_loai') == 'Phụ kiện' or is_accessory((d.metadata or {}).get('ten_sp') or '')))
                ]
                product_docs_sorted = sorted(
                    filtered_raw_products,
                    key=lambda d: (d.metadata or {}).get('gia', float('inf'))
                )
                if detected_brand:
                    # Fetch same brand alts
                    same_brand_alts = []
                    try:
                        import mysql.connector
                        conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
                        cursor = conn.cursor(dictionary=True)
                        cursor.execute("""
                            SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                                   ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                            FROM san_pham sp
                            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                            WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) = %s
                            ORDER BY sp.gia ASC
                        """, (detected_brand.lower(),))
                        rows = cursor.fetchall()
                        cursor.close()
                        conn.close()
                        for r in rows:
                            is_acc = is_accessory(r['ten_sp'])
                            if user_asked_for_accessory == is_acc:
                                same_brand_alts.append(r)
                                if len(same_brand_alts) >= 2:
                                    break
                    except Exception as e:
                        print(f"[RAG Alt Same Brand] DB error: {e}")
                        
                    for r in same_brand_alts:
                        r_price = int(r['gia']) if r['gia'] else 0
                        content_text = f"Sản phẩm: {r['ten_sp']}. Hãng sản xuất: {r['ten_hang'] or 'Khác'}. Loại sản phẩm (Danh mục): {'Phụ kiện' if user_asked_for_accessory else 'Điện thoại'}. Giá bán: {r_price} VNĐ. Bộ nhớ: {r['bo_nho'] or 'N/A'}. ID sản phẩm (ma_sp): {r['ma_sp']}. Ảnh đại diện (anh_dai_dien): {r['anh_dai_dien'] or ''}. "
                        if r.get('ram'):
                            content_text += f"Cấu hình: RAM {r['ram']}, Chip {r['chip']}, Pin {r['pin']}, Màn hình {r['man_hinh']}, Camera {r['camera']}."
                        from langchain_core.documents import Document
                        doc = Document(
                            page_content=content_text,
                            metadata={"type": "product", "ten_sp": r['ten_sp'], "gia": r_price, "ten_hang": r['ten_hang'], "ma_sp": r['ma_sp'], "ten_loai": 'Phụ kiện' if user_asked_for_accessory else 'Điện thoại'}
                        )
                        filtered_docs.append(doc)
                        print(f"[RAG ALT SAME BRAND] Thêm sản phẩm cùng hãng từ MySQL: {r['ten_sp']} ({r_price}đ)")
                        
                    cheapest_price = same_brand_alts[0]['gia'] if same_brand_alts else float('inf')
                    limit_val = price_constraint[1] if price_constraint else 5000000
                    need_other_brands = not same_brand_alts or (price_constraint and cheapest_price > limit_val * 2)
                    
                    if need_other_brands:
                        try:
                            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
                            cursor = conn.cursor(dictionary=True)
                            query_cond = ""
                            params = [detected_brand.lower()]
                            if price_constraint:
                                op, limit_val = price_constraint
                                if op == 'max':
                                    query_cond = "AND sp.gia <= %s"
                                    params.append(limit_val)
                            else:
                                query_cond = "AND sp.gia <= 5000000"
                            cursor.execute(f"""
                                SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                                       ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                                FROM san_pham sp
                                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                                LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                                WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) != %s {query_cond}
                                ORDER BY sp.gia ASC LIMIT 20
                            """, tuple(params))
                            rows = cursor.fetchall()
                            cursor.close()
                            conn.close()
                            
                            added_count = 0
                            for r in rows:
                                if added_count >= 2:
                                    break
                                is_acc = is_accessory(r['ten_sp'])
                                if user_asked_for_accessory != is_acc:
                                    continue
                                price_fmt = f"{int(r['gia']):,}".replace(",", ".") + "đ" if r['gia'] else "N/A"
                                r_price = int(r['gia']) if r['gia'] else 0
                                content_text = f"Sản phẩm: {r['ten_sp']}. Hãng sản xuất: {r['ten_hang'] or 'Khác'}. Loại sản phẩm (Danh mục): {'Phụ kiện' if is_acc else 'Điện thoại'}. Giá bán: {r_price} VNĐ. Bộ nhớ: {r['bo_nho'] or 'N/A'}. ID sản phẩm (ma_sp): {r['ma_sp']}. Ảnh đại diện (anh_dai_dien): {r['anh_dai_dien'] or ''}. "
                                if r.get('ram'):
                                    content_text += f"Cấu hình: RAM {r['ram']}, Chip {r['chip']}, Pin {r['pin']}, Màn hình {r['man_hinh']}, Camera {r['camera']}."
                                from langchain_core.documents import Document
                                doc = Document(
                                    page_content=content_text,
                                    metadata={"type": "product", "ten_sp": r['ten_sp'], "gia": r_price, "ten_hang": r['ten_hang'], "ma_sp": r['ma_sp'], "ten_loai": 'Phụ kiện' if is_acc else 'Điện thoại'}
                                )
                                filtered_docs.append(doc)
                                added_count += 1
                                print(f"[RAG ALT OTHER BRAND] Thêm sản phẩm hãng khác: {r['ten_sp']} ({price_fmt})")
                        except Exception as ex_db:
                            print(f"[RAG ALT OTHER BRAND] DB query error: {ex_db}")
                else:
                    filtered_docs.extend(product_docs_sorted[:2])
            
            price_note = ""
            if detected_brand:
                if not has_product:
                    price_note = f"\n\n⚠️ THÔNG BÁO QUAN TRỌNG: Cửa hàng HIỆN KHÔNG CÓ bất kỳ sản phẩm nào của hãng {detected_brand} trong tầm giá/ngân sách phù hợp yêu cầu. Bạn BẮT BUỘC phải bắt đầu câu trả lời bằng việc khẳng định rõ ràng và lịch sự điều này (Ví dụ: 'Dạ, hiện tại dòng máy của hãng {detected_brand} trong tầm giá này bên em đang tạm hết hàng ạ'). Sau đó, giới thiệu sản phẩm thay thế của chính hãng {detected_brand} (nếu có) hoặc hãng khác có sẵn dưới đây để khách tham khảo. TUYỆT ĐỐI KHÔNG TỰ BỊA ĐẶT sản phẩm {detected_brand} có giá thấp hơn giá niêm yết thực tế."
            
            # Ghép context text từ filtered docs
            context_text = "\n\n".join(doc.page_content for doc in filtered_docs) + price_note
            
            # Gọi LLM với context đã lọc
            final_prompt = prompt.format(context=context_text, question=question)
            result = self.llm.invoke(final_prompt)
            return self._validate_response_product_ids(result.content)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return f"Xin lỗi, tôi gặp chút khó khăn trong việc tổng hợp thông tin: {str(e)}"

    def _get_general_knowledge(self) -> str:
        """Lấy kiến thức chung từ bảng chatbot_knowledge - có RAM cache 5 phút"""
        import time
        now = time.time()
        
        # Trả về cache nếu còn hiệu lực
        if self._knowledge_cache is not None and (now - self._knowledge_cache_time) < self._KNOWLEDGE_CACHE_TTL:
            print("[CACHE HIT] Returning knowledge from RAM cache")
            return self._knowledge_cache
        
        # Cache hết hạn hoặc chưa có -> query MySQL
        print("[CACHE MISS] Query MySQL chatbot_knowledge...")
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor(dictionary=True)
            # Chỉ lấy các thông tin cốt lõi bắt buộc đưa vào Prompt hệ thống. Các chính sách chi tiết khác sẽ được lấy qua RAG ChromaDB khi cần thiết.
            cursor.execute("SELECT title, content FROM chatbot_knowledge WHERE is_active = 1 AND title IN ('Địa chỉ cửa hàng', 'Giờ làm việc', 'Hotline liên hệ', 'Giới thiệu cửa hàng')")
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

    def _get_db_product_signature(self):
        """Trả về set (ma_sp, ten_sp, gia, anh_dai_dien) — checksum SP đang bán trong MySQL."""
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor()
            cursor.execute("SELECT ma_sp, ten_sp, gia, anh_dai_dien FROM san_pham WHERE so_luong_ton > 0")
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return {(str(r[0]), str(r[1] or ""), float(r[2] or 0), str(r[3] or "")) for r in rows}
        except Exception as e:
            print(f"[Freshness] Error reading DB signature: {e}")
            return None

    def _get_vectorstore_product_signature(self):
        """Trả về set (ma_sp, ten_sp, gia, anh_dai_dien) trong Chroma."""
        try:
            if not self.vectorstore:
                return set()
            collection = self.vectorstore._collection
            results = collection.get(where={"type": "product"})
            metadatas = results.get("metadatas", []) or []
            return {
                (
                    str(m.get("ma_sp")),
                    str(m.get("ten_sp") or ""),
                    float(m.get("gia") or 0.0),
                    str(m.get("anh_dai_dien") or "")
                )
                for m in metadatas if m.get("ma_sp") is not None
            }
        except Exception as e:
            print(f"[Freshness] Error reading vectorstore signature: {e}")
            return None

    def _ensure_vectorstore_fresh(self):
        """Auto rebuild vectorstore nếu dữ liệu sản phẩm trong Chroma khác DB.
        Chạy tối đa 1 lần / _FRESHNESS_CHECK_TTL giây để không cản chat realtime."""
        import time
        now = time.time()
        if (now - self._last_freshness_check) < self._FRESHNESS_CHECK_TTL:
            return
        self._last_freshness_check = now

        db_sig = self._get_db_product_signature()
        if db_sig is None:
            return  # DB lỗi → bỏ qua, lần sau thử lại
        vec_sig = self._get_vectorstore_product_signature()
        if vec_sig is None:
            return

        if db_sig != vec_sig:
            print(f"[Freshness] Vectorstore lệch DB về sản phẩm hoặc chi tiết sản phẩm → rebuild")
            try:
                self.reload_vectorstore()
            except Exception as e:
                print(f"[Freshness] reload_vectorstore lỗi: {e}")

    def _get_valid_product_ids(self):
        """ID các SP đang còn bán (so_luong_ton > 0) — dùng cross-check response LLM."""
        sig = self._get_db_product_signature()
        if sig is None:
            return None  # signal: DB lỗi, không lọc
        return {r[0] for r in sig}

    def _validate_response_product_ids(self, response_text: str) -> str:
        """Quét product-detail.html?id=<ID> trong response. Nếu ID không có trong DB,
        đã hết hàng, bị LLM đổi tên sai lệch, hoặc bị LLM bịa giá khác DB,
        thay khối <div> bao quanh SP đó bằng câu xin lỗi để tránh 'bịa SP'."""
        if not response_text:
            return response_text
        import re
        
        # Lấy danh sách tên + giá sản phẩm trong DB để cross-check
        db_products = {}  # {id_str: {'ten_sp': ..., 'gia': ..., 'ten_hang': ...}}
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT sp.ma_sp, sp.ten_sp, sp.gia, hsx.ten_hang, sp.anh_dai_dien 
                FROM san_pham sp 
                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang 
                WHERE sp.so_luong_ton > 0
            """)
            for r in cursor.fetchall():
                db_products[str(r[0])] = {
                    'ten_sp': str(r[1]), 
                    'gia': float(r[2]) if r[2] else 0,
                    'ten_hang': str(r[3]) if r[3] else '',
                    'anh_dai_dien': str(r[4]) if r[4] else ''
                }
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"[Validate] DB connect error: {e}")
            return response_text  # DB lỗi -> trả về nguyên bản (fail-open)

        id_pattern = re.compile(r'product-detail\.html\?id=([^"\'\s&<>]+)', re.IGNORECASE)
        mentioned_ids = set(id_pattern.findall(response_text))

        # Helper: trích xuất từ khóa lõi từ tên sản phẩm để so sánh
        def get_core_words(s):
            import unicodedata
            s = s.lower()
            s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
            s = s.replace('đ', 'd').replace('Đ', 'd')
            words = set(re.findall(r'\b\w+\b', s))
            common = {'gb', 'ram', 'tb', '5g', '4g', 'lte', 'pro', 'max', 'plus', 'cu', 'moi', 'chinh', 'hang', 'viet', 'nam', 'mau', 'sac'}
            filtered_words = set()
            for w in words:
                if w in common:
                    continue
                if re.search(r'\d+gb', w):
                    continue
                filtered_words.add(w)
            return filtered_words

        def check_name_match(db_name, rendered_name):
            db_core = get_core_words(db_name)
            rendered_core = get_core_words(rendered_name)
            
            brands = {'iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'sony', 'xperia', 'google', 'pixel', 'vsmart', 'asus', 'rog', 'tecno', 'nokia'}
            
            db_strict = db_core - brands
            rendered_strict = rendered_core - brands
            
            if db_strict and rendered_strict:
                return bool(db_strict.intersection(rendered_strict))
            else:
                return bool(db_core.intersection(rendered_core))

        # Helper: tìm khối block HTML tương ứng của 1 ID bằng cách đếm số thẻ div mở/đóng lồng nhau
        def find_html_block_for_id(text: str, mid_str: str):
            esc = re.escape(mid_str)
            link_pattern = re.compile(r'product-detail\.html\?id=' + esc + r'\b', re.IGNORECASE)
            match_link = link_pattern.search(text)
            if not match_link:
                return None
            link_pos = match_link.start()
            
            # Tìm thẻ mở <div class="ai-product-card"> hoặc style display:flex trước link_pos
            card_pattern = re.compile(r'<div\b[^>]*(?:class="[^"]*ai-product-card[^"]*"|style="[^"]*display:\s*flex[^"]*")[^>]*>', re.IGNORECASE)
            card_starts = [m.start() for m in card_pattern.finditer(text)]
            valid_starts = [start for start in card_starts if start < link_pos]
            
            if not valid_starts:
                # Fallback: tìm div mở gần nhất
                div_pattern = re.compile(r'<div\b[^>]*>', re.IGNORECASE)
                div_starts = [m.start() for m in div_pattern.finditer(text)]
                valid_starts = [start for start in div_starts if start < link_pos]
                if not valid_starts:
                    # Fallback cuối cùng: lấy 150-char window xung quanh link
                    start_pos = max(0, link_pos - 75)
                    end_pos = min(len(text), link_pos + 75)
                    return text[start_pos:end_pos], start_pos, end_pos
                    
            card_start = max(valid_starts)
            pos = card_start
            open_divs = 0
            text_len = len(text)
            while pos < text_len:
                if text[pos:pos+4].lower() == '<div':
                    open_divs += 1
                    pos += 4
                elif text[pos:pos+6].lower() == '</div>':
                    open_divs -= 1
                    pos += 6
                    if open_divs <= 0:
                        return text[card_start:pos], card_start, pos
                else:
                    pos += 1
            return text[card_start:], card_start, text_len

        # Helper: trích xuất tất cả mức giá bằng số được liệt kê trong block
        def extract_prices_from_block(block_content):
            prices = []
            # 1. Tìm span giá đặc thù
            span_match = re.search(r'class="ai-product-price"[^>]*>([^<]+)</span>', block_content, re.IGNORECASE)
            if span_match:
                digits = re.sub(r'[^\d]', '', span_match.group(1))
                if digits:
                    prices.append(int(digits))
            # 2. Tìm các chuỗi số dạng phân tách hàng nghìn
            raw_patterns = re.findall(r'\b\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|VNĐ|vnđ|dong|đồng))?\b', block_content)
            for rp in raw_patterns:
                digits = re.sub(r'[^\d]', '', rp)
                if digits:
                    prices.append(int(digits))
            # 3. Tìm các chuỗi giá triệu (ví dụ: 3.9 triệu, 4tr)
            text_clean = remove_diacritics(block_content.lower())
            million_matches = re.finditer(r'(\d+(?:[.,]\d+)?)\s*(?:trieu|tr)\b', text_clean)
            for m in million_matches:
                try:
                    val = safe_parse_float(m.group(1))
                    if val < 1000:
                        prices.append(int(val * 1000000))
                except ValueError:
                    pass
            return list(set(prices))

        invalid_ranges = []
        for mid in mentioned_ids:
            mid_str = str(mid)
            if mid_str not in db_products:
                print(f"[Validate] Phát hiện ID {mid_str} không tồn tại trong DB (BỊA SẢN PHẨM)")
                block_info = find_html_block_for_id(response_text, mid_str)
                if block_info:
                    _, start, end = block_info
                    invalid_ranges.append((start, end))
                continue
            
            db_info = db_products[mid_str]
            db_name = db_info['ten_sp']
            db_price = db_info['gia']
            
            block_info = find_html_block_for_id(response_text, mid_str)
            if block_info:
                block_content, start, end = block_info
                
                # --- Kiểm tra TÊN sản phẩm ---
                rendered_name = None
                name_match = re.search(r'class="ai-product-name"[^>]*>([^<]+)</strong>', block_content, re.IGNORECASE)
                if not name_match:
                    name_match = re.search(r'<strong[^>]*>([^<]+)</strong>', block_content, re.IGNORECASE)
                if name_match:
                    rendered_name = name_match.group(1).strip()
                else:
                    md_match = re.search(r'\[([^\]]+)\]\(product-detail\.html\?id=' + re.escape(mid_str) + r'\)', block_content, re.IGNORECASE)
                    if md_match:
                        rendered_name = md_match.group(1).strip()
                        
                is_invalid = False
                if rendered_name:
                    if not check_name_match(db_name, rendered_name):
                        print(f"[Validate] Phát hiện lệch tên sản phẩm cho ID {mid_str}: DB là '{db_name}' nhưng LLM in ra '{rendered_name}' -> Đánh dấu không hợp lệ")
                        is_invalid = True
                else:
                    db_core = get_core_words(db_name)
                    brands = {'iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'sony', 'xperia', 'google', 'pixel', 'vsmart', 'asus', 'rog', 'tecno', 'nokia'}
                    db_strict = db_core - brands
                    words_to_check = db_strict if db_strict else db_core
                    block_words = get_core_words(block_content)
                    if not words_to_check.intersection(block_words):
                        print(f"[Validate] Không tìm thấy từ khóa tên sản phẩm cho ID {mid_str} trong block: DB '{db_name}' -> Đánh dấu không hợp lệ")
                        is_invalid = True
                
                # --- Kiểm tra GIÁ sản phẩm (CHỐNG BỊA GIÁ) ---
                if not is_invalid and db_price > 0:
                    prices = extract_prices_from_block(block_content)
                    if prices:
                        price_matched = False
                        for p in prices:
                            deviation = abs(p - db_price) / db_price
                            if deviation <= 0.01:
                                price_matched = True
                                break
                        if not price_matched:
                            print(f"[Validate] Phát hiện BỊA GIÁ cho ID {mid_str} ('{db_name}'): DB giá={int(db_price)}, LLM in ra={prices} -> Đánh dấu không hợp lệ")
                            is_invalid = True
                    else:
                        if "ai-product-card" in block_content or "display:flex" in block_content:
                            print(f"[Validate] Thiếu giá cho ID {mid_str} trong product card -> Đánh dấu không hợp lệ")
                            is_invalid = True

                # --- Kiểm tra ẢNH sản phẩm ---
                rendered_img = None
                img_match = re.search(r'<img[^>]*src="([^"]+)"', block_content, re.IGNORECASE)
                if not img_match:
                    img_match = re.search(r"<img[^>]*src='([^']+)'", block_content, re.IGNORECASE)
                if img_match:
                    rendered_img = img_match.group(1).strip()
                
                if not is_invalid and rendered_img and db_info.get('anh_dai_dien'):
                    def normalize_path(p):
                        return p.lower().replace('\\', '/').strip('/')
                    norm_rendered = normalize_path(rendered_img)
                    norm_db = normalize_path(db_info['anh_dai_dien'])
                    if norm_rendered != norm_db and not norm_rendered.endswith(norm_db) and not norm_db.endswith(norm_rendered):
                        print(f"[Validate] Phát hiện lệch ảnh sản phẩm cho ID {mid_str}: DB là '{db_info['anh_dai_dien']}' nhưng LLM in ra '{rendered_img}' -> Đánh dấu không hợp lệ")
                        is_invalid = True
                
                if is_invalid:
                    invalid_ranges.append((start, end))

        cleaned = response_text
        if invalid_ranges:
            # Gộp các khoảng trùng lặp và sắp xếp giảm dần theo chỉ số bắt đầu
            invalid_ranges.sort(key=lambda x: x[0])
            merged_ranges = []
            for r in invalid_ranges:
                if not merged_ranges:
                    merged_ranges.append(r)
                else:
                    prev_start, prev_end = merged_ranges[-1]
                    curr_start, curr_end = r
                    if curr_start < prev_end:
                        merged_ranges[-1] = (prev_start, max(prev_end, curr_end))
                    else:
                        merged_ranges.append(r)

            print(f"[Validate] Có {len(merged_ranges)} khối sản phẩm không hợp lệ cần loại bỏ khỏi response")
            for start, end in reversed(merged_ranges):
                cleaned = cleaned[:start] + cleaned[end:]

        # --- Kiểm tra Text-based Product Hallucination (Quét các dòng text tự bịa sản phẩm) ---
        def validate_text_products(text: str) -> str:
            if not text:
                return text
                
            # 1. Trích xuất các product cards để tránh validate nhầm nội dung card
            cards = []
            temp = text
            import re
            card_pattern = re.compile(r'<div\b[^>]*(?:class="[^"]*ai-product-card[^"]*"|style="[^"]*display:\s*flex[^"]*")[^>]*>', re.IGNORECASE)
            
            index = 0
            while True:
                match = card_pattern.search(temp)
                if not match:
                    break
                
                start = match.start()
                pos = start
                open_divs = 0
                text_len = len(temp)
                end = -1
                
                while pos < text_len:
                    if temp[pos:pos+4].lower() == '<div':
                        open_divs += 1
                        pos += 4
                    elif temp[pos:pos+6].lower() == '</div>':
                        open_divs -= 1
                        pos += 6
                        if open_divs <= 0:
                            end = pos
                            break
                    else:
                        pos += 1
                        
                if end != -1:
                    card_content = temp[start:end]
                    placeholder = f"<!-- CARD_PLACEHOLDER_{index} -->"
                    cards.append((placeholder, card_content))
                    temp = temp[:start] + placeholder + temp[end:]
                    index += 1
                else:
                    break

            lines = temp.split('\n')
            brands = {'iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'sony', 'xperia', 'google', 'pixel', 'vsmart', 'asus', 'rog', 'tecno', 'nokia', 'honor', 'infinix', 'motorola'}
            refusal_keywords = {
                'khong co', 'khong ban', 'tam het', 'chua kinh doanh', 'chua co', 'khong tim thay', 
                'khong ho tro', 'het hang', 'chua ve hang', 'ngung ban', 'cao hon', 'vuot qua', 
                'ngan sach', 'tam gia', 'tieu chi', 'khong co hang', 'chua co hang', 'chua ho tro',
                'so voi', 'gia thuong', 'kho tim', 'khong tim thay mau', 'khong co chiec', 
                'dong dien thoai cua hang', 'khong co san pham'
            }
            
            non_model_words = {
                'camera', 'mp', 'sony', 'sensor', 'lens', 'man', 'hinh', 'amoled', 'ips', 'lcd', 'pin', 'mah', 
                'charger', 'sac', 'cap', 'tai', 'nghe', 'chip', 'snapdragon', 'helio', 'dimensity', 'ram', 'rom', 
                'gb', 'tb', 'chup', 'anh', 'dep', 'tot', 'quay', 'phim', 'sac', 'nhanh', 'muot', 'ma', 'choi', 
                'game', 'lien', 'quan', 'pubg', 'fps', 'nong', 'may', 'hieu', 'nang', 'cau', 'hinh', 'pin', 'trau', 
                'dung', 'luong', 'lon', 'mong', 'nhe', 'thoi', 'trang', 'gia', 're', 'tiet', 'kiem', 'hoc', 'sinh', 
                'sinh', 'vien', 'chinh', 'hang', 'viet', 'nam', 'mau', 'sac', 'cu', 'moi', 'ban', 'co', 'nay', 
                'no', 'kia', 'do', 'cua', 'hang', 'ben', 'em', 'tin', 'nhan', 'ho', 'tro', 'tu', 'van', 'dien', 'thoai'
            }

            db_model_words = set()
            for pid, p in db_products.items():
                p_name = p.get('ten_sp') or ''
                p_core = get_core_words(p_name)
                db_model_words.update(p_core - brands)

            cleaned_lines = []
            price_regex = re.compile(
                r'\b\d+(?:[.,]\d+)*\s*(?:trieu|tr|d|vnd|dong|k|%|cai|chiec|thang|tuoi)\b|\b\d+(?:[.,]\d+)+\b', 
                re.IGNORECASE
            )

            for line in lines:
                line_lower_no_dia = remove_diacritics(line.lower())
                
                # Check if line contains a refusal keyword
                is_refusal = any(bool(re.search(r'\b' + re.escape(kw) + r'\b', line_lower_no_dia)) for kw in refusal_keywords)
                if is_refusal:
                    cleaned_lines.append(line)
                    continue

                line_for_words = price_regex.sub(' ', line_lower_no_dia)
                words = re.findall(r'[a-z0-9]+', line_for_words)
                mentioned_brands_indices = []
                for idx, w in enumerate(words):
                    if w in brands:
                        mentioned_brands_indices.append({'brand': w, 'idx': idx})

                if not mentioned_brands_indices:
                    cleaned_lines.append(line)
                    continue

                # Bỏ qua dòng giới thiệu chung nếu nhắc từ 2 hãng trở lên và không chứa chữ số
                has_digits = bool(re.search(r'\d', line))
                unique_brands = {m['brand'] for m in mentioned_brands_indices}
                if len(unique_brands) >= 2 and not has_digits:
                    cleaned_lines.append(line)
                    continue

                claimed_indices = set()
                unmatched_brands = []

                for m in mentioned_brands_indices:
                    b = m['brand']
                    brand_has_match = False
                    matched_indices_for_this_product = []

                    for pid, p in db_products.items():
                        p_brand = (p.get('ten_hang') or '').lower()
                        p_name = p.get('ten_sp') or ''
                        brand_match = b in p_brand or b in remove_diacritics(p_name.lower())
                        if not brand_match:
                            continue

                        p_core = get_core_words(p_name)
                        p_strict = p_core - brands
                        words_to_check = p_strict if p_strict else p_core

                        is_subset = True
                        temp_matched_indices = []
                        for w in words_to_check:
                            try:
                                word_idx = words.index(w)
                                temp_matched_indices.append(word_idx)
                            except ValueError:
                                is_subset = False
                                break

                        if words_to_check and is_subset:
                            db_price = p.get('gia') or 0
                            if db_price > 0:
                                line_prices = extract_prices_from_block(line)
                                if line_prices:
                                    price_matched = False
                                    for lp in line_prices:
                                        deviation = abs(lp - db_price) / db_price
                                        if deviation <= 0.01:
                                            price_matched = True
                                            break
                                    if not price_matched:
                                        continue
                            brand_has_match = True
                            temp_matched_indices.append(m['idx'])
                            matched_indices_for_this_product = temp_matched_indices
                            break

                    if brand_has_match:
                        claimed_indices.update(matched_indices_for_this_product)
                    else:
                        unmatched_brands.append(m)

                line_is_valid = True
                if unmatched_brands:
                    for m in unmatched_brands:
                        start_idx = max(0, m['idx'] - 3)
                        end_idx = min(len(words) - 1, m['idx'] + 3)

                        has_unclaimed_spec = False
                        for i in range(start_idx, end_idx + 1):
                            if i == m['idx'] or i in claimed_indices:
                                continue

                            w = words[i]
                            if w in brands or w in non_model_words:
                                continue
                            if w.endswith('mp') or w.endswith('gb') or w.endswith('tb') or w.endswith('mah') or w.endswith('hz') or w.endswith('vnd') or w.endswith('k') or w.endswith('tr'):
                                continue

                            is_potential_spec = bool(re.search(r'\d', w)) or (w in db_model_words)
                            if is_potential_spec:
                                has_unclaimed_spec = True
                                break

                        if has_unclaimed_spec:
                            line_is_valid = False
                            break

                if line_is_valid:
                    cleaned_lines.append(line)
                else:
                    print(f"[TextValidate] Stripping line: {repr(line)} (Unrecognized brand/model recommendation for unmatched brands)")

            cleaned = "\n".join(cleaned_lines)
            for placeholder, content in cards:
                cleaned = cleaned.replace(placeholder, content)
            return cleaned

        cleaned = validate_text_products(cleaned)

        # Nếu sau khi cắt response trống/ngắn -> trả thông báo lịch sự
        plain = re.sub(r'<[^>]+>', '', cleaned).strip()
        if len(plain) < 30:
            return ('Dạ, hiện tại cửa hàng bên em không có mẫu sản phẩm nào như anh/chị vừa hỏi ạ. '
                    'Anh/chị cho em biết thêm về tầm giá hoặc nhu cầu sử dụng (chơi game, chụp ảnh, pin trâu...) '
                    'để em tư vấn các mẫu đang có sẵn phù hợp nhất nhé!')
        return cleaned

    def query_brand_products(self, brand: str, question: str, history: List[Dict] = None, interests: List[str] = None) -> str:
        """Truy vấn SQL trực tiếp theo hãng sản phẩm"""
        try:
            conn = mysql.connector.connect(
                host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME
            )
            cursor = conn.cursor(dictionary=True)
            
            # Phân tích ràng buộc giá từ câu hỏi
            price_constraint = parse_price_constraint(question)
            query_cond = ""
            params = [f"%{brand.lower()}%"]
            if price_constraint:
                op, limit_val = price_constraint
                if op == "max":
                    query_cond = "AND sp.gia <= %s"
                    params.append(limit_val)
                elif op == "min":
                    query_cond = "AND sp.gia >= %s"
                    params.append(limit_val)
            
            query = f"""
                SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho,
                       hsx.ten_hang,
                       ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                FROM san_pham sp
                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) LIKE %s {query_cond}
                ORDER BY sp.gia ASC
                LIMIT 40
            """
            cursor.execute(query, tuple(params))
            products = cursor.fetchall()
            cursor.close()
            conn.close()
            
            if not products:
                return None  # Return None to fallback to semantic search
            
            # Lọc bỏ phụ kiện nếu người dùng không hỏi về phụ kiện, và lọc bỏ điện thoại nếu người dùng hỏi phụ kiện
            user_asked_for_accessory = is_accessory(question)
            filtered_products = []
            for p in products:
                is_acc = is_accessory(p['ten_sp'])
                if not user_asked_for_accessory and is_acc:
                    continue
                if user_asked_for_accessory and not is_acc:
                    continue
                filtered_products.append(p)
            
            # Slice lấy 8 sản phẩm phù hợp nhất
            products = filtered_products[:8]
            
            if not products:
                return None  # Fallback to semantic search if filtered all out
            
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
     <div class="ai-product-card">
       <img src="[[Anh]]" alt="[[Ten_san_pham]]" class="ai-product-image">
       <div class="ai-product-info">
         <strong class="ai-product-name">[[Ten_san_pham]]</strong>
         <div class="ai-product-price-row">Giá: <span class="ai-product-price">[[Gia]]</span></div>
         <div class="ai-product-config">[[Cau_hinh]]</div>
         <div class="ai-product-actions">
           <a href="product-detail.html?id=[[ID]]" class="ai-product-btn-detail">Xem chi tiết</a>
           <button class="chatbot-add-cart-btn ai-product-btn-cart" data-pid="[[ID]]" data-pname="[[Ten_san_pham]]" data-pprice="[[Gia]]" data-pimage="[[Anh]]"><i class="fas fa-cart-plus"></i> Thêm</button>
         </div>
       </div>
     </div>
    (Trong đó, [[Anh]] BẮT BUỘC phải SAO CHÉP NGUYÊN VĂN 100% đường dẫn ảnh từ trường "Ảnh" được cung cấp trong danh sách sản phẩm bên trên (Ví dụ: "images/products/product-1766383708166-283137270.webp" - BẮT BUỘC copy nguyên cả đường dẫn bao gồm "images/products/...", KHÔNG tự chế tên file, KHÔNG bỏ đuôi .webp/.jpg/.png/.avif, KHÔNG bỏ phần "images/products/" ở đầu). Thay thế [[Ten_san_pham]], [[Gia]], [[ID]] bằng thông tin tương ứng. [[Cau_hinh]] là chuỗi tóm tắt thông số cấu hình như RAM, Chip, Pin, Màn hình, Camera).
 4. TUYỆT ĐỐI NGHIÊM CẤM sử dụng bất kỳ ký hiệu Markdown nào (như `**`, `*`, `-`, `#`, ` ``` `). Chỉ sử dụng HTML cơ bản như `<br>`, `<strong>`, `<b>`, `<ul>`, `<li>` và các thẻ `<div>` để dựng khung sản phẩm. Bất kỳ ký tự markdown nào rò rỉ đều bị coi là lỗi nghiêm trọng.
 5. Xưng hô lịch sự: "Dạ", "em", "anh/chị".
 6. So sánh ưu/nhược điểm nếu có nhiều sản phẩm.
 7. Cuối câu trả lời, đưa ra gợi ý tiếp theo.
 8. GUARDRAILS: CHỈ TƯ VẤN về CÔNG NGHỆ, ĐIỆN THOẠI, LAPTOP, PHỤ KIỆN, và DỊCH VỤ CỦA CỬA HÀNG. TỪ CHỐI LỊCH SỰ nếu hỏi ngoài lề. Nếu câu hỏi về chính sách chung nằm ngoài danh sách sản phẩm, hãy hỗ trợ dựa trên kiến thức chung hiện có và hướng dẫn khách hàng liên hệ trực tiếp Hotline/Zalo của QuangHưng Mobile thay vì báo hết hàng.
 9. XỬ LÝ KHI GIÁ KHÔNG PHÙ HỢP: Nếu khách hàng hỏi về phân khúc giá rẻ hoặc có ngân sách thấp mà các sản phẩm của hãng {brand} này đều có giá cao vượt quá ngân sách của họ, bạn cần phải thông báo lịch sự là dòng máy này của hãng {brand} hiện tại không có phân khúc giá rẻ đó. Hướng dẫn khách hàng tham khảo các hãng khác (như Samsung, Xiaomi) có phân khúc giá rẻ tốt hơn và khuyên họ liên hệ Hotline 0355745120 hoặc Zalo để được nhân viên hỗ trợ.
 
 Lịch sử trò chuyện:
 {chat_history}
 
 Câu hỏi của khách hàng: {question}
 
 Hãy đưa ra câu trả lời thuyết phục, thông minh và đậm chất tư vấn bán hàng chuyên nghiệp:"""
            
            response = self.llm.invoke(system_prompt)
            return self._validate_response_product_ids(response.content)
        except Exception as e:
            import traceback
            traceback.print_exc()
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

    def classify_intent(self, question: str, history_str: str) -> str:
        import re
        q_lower = remove_diacritics(question.lower().strip())
        
        # Quick check for link queries
        if any(kw in q_lower for kw in ["link dau", "gui link", "cho xin link", "xin link", "link sp", "link san pham", "soure link", "source link"]):
            return "PRODUCT_LINK"
            
        # Quick check for installment queries
        if any(kw in q_lower for kw in ["tra gop", "lai suat", "home credit", "fe credit", "gop bao nhieu", "gop sao"]):
            return "INSTALLMENT_QUERY"
            
        prompt_text = f"""Phân loại ý định của câu hỏi khách hàng sau đây sang một trong các loại:
1. PRODUCT_LINK: Khi khách hỏi xin đường dẫn link sản phẩm, hỏi "link đâu", "gửi link".
2. INSTALLMENT_QUERY: Hỏi về chính sách, thủ tục, lãi suất mua trả góp.
3. COMPARE_PRODUCTS: So sánh cấu hình, giá cả của hai hoặc nhiều mẫu điện thoại cụ thể.
4. PRODUCT_DETAIL: Hỏi chi tiết thông số kỹ thuật, cấu hình của một điện thoại cụ thể.
5. PRICE_QUERY: Hỏi giá bán của một điện thoại cụ thể.
6. COLOR_QUERY: Hỏi về màu sắc có sẵn của điện thoại cụ thể.
7. STORAGE_QUERY: Hỏi về phiên bản bộ nhớ của điện thoại cụ thể.
8. PRODUCT_SEARCH: Tìm kiếm sản phẩm phù hợp ngân sách, nhu cầu (ví dụ: "điện thoại 5 triệu", "tư vấn máy chơi game", "dưới 5tr mua máy gì").
9. GENERAL_FAQ: Hỏi địa chỉ, giờ mở cửa, chính sách bảo hành, đổi trả, ship hàng, hoặc chào hỏi thông thường.

Lịch sử trò chuyện gần nhất:
{history_str}

Câu hỏi khách hàng: "{question}"

Chỉ trả về TÊN LOẠI ý định duy nhất (ví dụ: PRODUCT_SEARCH), không giải thích gì thêm."""
        try:
            res = self.llm.invoke(prompt_text)
            intent = res.content.strip().upper()
            valid_intents = {"PRODUCT_LINK", "INSTALLMENT_QUERY", "COMPARE_PRODUCTS", "PRODUCT_DETAIL", "PRICE_QUERY", "COLOR_QUERY", "STORAGE_QUERY", "PRODUCT_SEARCH", "GENERAL_FAQ"}
            for vi in valid_intents:
                if vi in intent:
                    return vi
        except Exception as e:
            print(f"[IntentClassifier] Error: {e}")
        return "PRODUCT_SEARCH"

    def extract_entities(self, question: str, context_state: dict):
        q_lower = remove_diacritics(question.lower())
        
        # 1. Determine and maintain product_type
        if is_accessory(question):
            context_state["product_type"] = "accessory"
        elif detect_brand_from_text(question) or any(kw in q_lower for kw in ["dien thoai", "may", "smartphone", "dt", "ram", "rom", "storage", "gb", "tb", "camera", "man hinh", "pin"]):
            context_state["product_type"] = "phone"
        elif "product_type" not in context_state:
            context_state["product_type"] = "phone"

        # 2. Extract brand
        brand = detect_brand_from_text(question)
        if brand:
            context_state["brand"] = brand
        elif any(kw in q_lower for kw in ["hang khac", "may khac", "dt khac", "hang nao khac"]):
            context_state.pop("brand", None)
            
        # 3. Extract price limit
        price_const = parse_price_constraint(question)
        if price_const:
            context_state["price_constraint"] = {
                "op": price_const[0],
                "val": price_const[1]
            }
            
        # 4. Extract color
        colors = ["den", "trang", "xanh", "do", "vang", "xam", "bac", "tim", "hong"]
        for c in colors:
            if f"mau {c}" in q_lower or (f" {c} " in f" {q_lower} " and c not in ["do", "vang"]):
                color_map = {"den": "Đen", "trang": "Trắng", "xanh": "Xanh", "do": "Đỏ", "vang": "Vàng", "xam": "Xám", "bac": "Bạc", "tim": "Tím", "hong": "Hồng"}
                context_state["color"] = color_map[c]
                break
                
        # 5. Extract storage (GB/TB)
        import re
        storage_match = re.search(r'\b(64|128|256|512)\s*(?:gb|gigabyte)\b', q_lower)
        if storage_match:
            context_state["storage"] = storage_match.group(1) + "GB"
        else:
            tb_match = re.search(r'\b1\s*(?:tb|terabyte)\b', q_lower)
            if tb_match:
                context_state["storage"] = "1TB"

        # 6. Extract RAM
        ram_match = re.search(r'\b(4|6|8|12|16|24)\s*(?:gb|g)\s*ram\b', q_lower)
        if not ram_match:
            ram_match = re.search(r'\bram\s*(4|6|8|12|16|24)\s*(?:gb|g)?\b', q_lower)
        if not ram_match:
            match = re.search(r'\b(4|6|8|12|16|24)\s*(?:gb|g)\b', q_lower)
            if match and not storage_match:
                ram_match = match
        if ram_match:
            context_state["ram"] = ram_match.group(1) + "GB"
                
        # 7. Extract confirmation intent
        if q_lower in ["dung", "dung vay", "chinh xac", "vang", "yes", "yep", "dung roi", "phai", "chuan"]:
            context_state["confirmed"] = True
        else:
            context_state["confirmed"] = False

    def db_product_search(self, context_state: dict, user_asked_for_accessory: bool) -> list:
        brand = context_state.get("brand")
        price_const = context_state.get("price_constraint")
        
        def run_query(b_val):
            query_cond = []
            params = []
            if b_val:
                query_cond.append("LOWER(hsx.ten_hang) = %s")
                params.append(b_val.lower())
            if price_const:
                op = price_const.get("op")
                val = price_const.get("val")
                if op == "max":
                    query_cond.append("sp.gia <= %s")
                    params.append(val)
                elif op == "min":
                    query_cond.append("sp.gia >= %s")
                    params.append(val)
            query_cond.append("sp.so_luong_ton > 0")
            where_clause = " AND ".join(query_cond) if query_cond else "1=1"
            
            query = f"""
                SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho,
                       hsx.ten_hang,
                       ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera, sp.so_luong_ton
                FROM san_pham sp
                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                WHERE {where_clause}
                ORDER BY sp.gia ASC
            """
            try:
                conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
                cursor = conn.cursor(dictionary=True)
                cursor.execute(query, tuple(params))
                res = cursor.fetchall()
                cursor.close()
                conn.close()
                return res
            except Exception as e:
                print(f"[DB Search Internal] Error: {e}")
                return []
                
        # 1. Search with brand constraint
        products = run_query(brand)
        filtered = []
        for p in products:
            is_acc = is_accessory(p['ten_sp'])
            if not user_asked_for_accessory and is_acc:
                continue
            if user_asked_for_accessory and not is_acc:
                continue
            filtered.append(p)
            
        # 2. If no accessories found and we had a brand constraint, try relaxing brand constraint
        if not filtered and brand and user_asked_for_accessory:
            print(f"[DB Search] No accessories found for brand {brand}. Relaxing brand constraint...")
            products_relaxed = run_query(None)
            for p in products_relaxed:
                if is_accessory(p['ten_sp']):
                    filtered.append(p)
                    
        return filtered

    def handle_product_link_intent(self, context_state: dict) -> str:
        last_ids = context_state.get("last_recommended_ids", [])
        if not last_ids:
            return "Dạ, hiện tại em chưa có thông tin sản phẩm nào vừa thảo luận để gửi link ạ. Anh/chị cần em tư vấn mẫu máy nào để em tìm và gửi link cho mình nhé!"
            
        products = []
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor(dictionary=True)
            format_strings = ','.join(['%s'] * len(last_ids))
            query = f"""
                SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                       ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                FROM san_pham sp
                LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                WHERE sp.ma_sp IN ({format_strings}) AND sp.so_luong_ton > 0
            """
            cursor.execute(query, tuple(last_ids))
            products = cursor.fetchall()
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"[Link Intent] DB error: {e}")
            
        if not products:
            return "Dạ, hiện tại em chưa tìm thấy link sản phẩm phù hợp. Anh/chị cho em xin tên máy cụ thể để em gửi link nhé!"
            
        response = "Dạ, đây là link sản phẩm mà anh/chị đang quan tâm ạ:<br><br>"
        for p in products:
            price_fmt = f"{int(p['gia']):,}".replace(",", ".") + "đ" if p['gia'] else "N/A"
            img_path = p['anh_dai_dien'] or ''
            if img_path and not img_path.startswith('images/') and not img_path.startswith('http'):
                img_path = f"images/products/{img_path}"
                
            response += f"""<div class="ai-product-card">
  <img src="{img_path}" alt="{p['ten_sp']}" class="ai-product-image">
  <div class="ai-product-info">
    <strong class="ai-product-name">{p['ten_sp']}</strong>
    <div class="ai-product-price-row">Giá: <span class="ai-product-price">{price_fmt}</span></div>
    <div class="ai-product-actions">
      <a href="product-detail.html?id={p['ma_sp']}" class="ai-product-btn-detail">Xem chi tiết</a>
      <button class="chatbot-add-cart-btn ai-product-btn-cart" data-pid="{p['ma_sp']}" data-pname="{p['ten_sp']}" data-pprice="{p['gia']}" data-pimage="{img_path}"><i class="fas fa-cart-plus"></i> Thêm</button>
    </div>
  </div>
</div><br>"""
        return response

    def get_core_words_text(self, s):
        import unicodedata, re
        s = s.lower()
        s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
        s = s.replace('đ', 'd').replace('Đ', 'd')
        words = set(re.findall(r'\b\w+\b', s))
        common = {'gb', 'ram', 'tb', '5g', '4g', 'lte', 'pro', 'max', 'plus', 'cu', 'moi', 'chinh', 'hang', 'viet', 'nam', 'mau', 'sac'}
        filtered_words = set()
        for w in words:
            if w in common:
                continue
            if re.search(r'\d+gb', w):
                continue
            filtered_words.add(w)
        return filtered_words

    def check_names_match(self, db_name, rendered_name):
        db_core = self.get_core_words_text(db_name)
        rendered_core = self.get_core_words_text(rendered_name)
        brands = {'iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'sony', 'xperia', 'google', 'pixel', 'vsmart', 'asus', 'rog', 'tecno', 'nokia'}
        db_strict = db_core - brands
        rendered_strict = rendered_core - brands
        if db_strict and rendered_strict:
            return bool(db_strict.intersection(rendered_strict))
        else:
            return bool(db_core.intersection(rendered_core))

    def find_html_block_for_id_in_text(self, text: str, mid_str: str):
        import re
        esc = re.escape(mid_str)
        link_pattern = re.compile(r'product-detail\.html\?id=' + esc + r'\b', re.IGNORECASE)
        match_link = link_pattern.search(text)
        if not match_link:
            return None
        link_pos = match_link.start()
        
        card_pattern = re.compile(r'<div\b[^>]*(?:class="[^"]*ai-product-card[^"]*"|style="[^"]*display:\s*flex[^"]*")[^>]*>', re.IGNORECASE)
        card_starts = [m.start() for m in card_pattern.finditer(text)]
        valid_starts = [start for start in card_starts if start < link_pos]
        
        if not valid_starts:
            div_pattern = re.compile(r'<div\b[^>]*>', re.IGNORECASE)
            div_starts = [m.start() for m in div_pattern.finditer(text)]
            valid_starts = [start for start in div_starts if start < link_pos]
            if not valid_starts:
                start_pos = max(0, link_pos - 75)
                end_pos = min(len(text), link_pos + 75)
                return text[start_pos:end_pos], start_pos, end_pos
                
        card_start = max(valid_starts)
        pos = card_start
        open_divs = 0
        text_len = len(text)
        while pos < text_len:
            if text[pos:pos+4].lower() == '<div':
                open_divs += 1
                pos += 4
            elif text[pos:pos+6].lower() == '</div>':
                open_divs -= 1
                pos += 6
                if open_divs <= 0:
                    return text[card_start:pos], card_start, pos
            else:
                pos += 1
        return text[card_start:], card_start, text_len

    def extract_prices_from_text_block(self, block_content):
        import re
        prices = []
        span_match = re.search(r'class="ai-product-price"[^>]*>([^<]+)</span>', block_content, re.IGNORECASE)
        if span_match:
            digits = re.sub(r'[^\d]', '', span_match.group(1))
            if digits:
                prices.append(int(digits))
        raw_patterns = re.findall(r'\b\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|VNĐ|vnđ|dong|đồng))?\b', block_content)
        for rp in raw_patterns:
            digits = re.sub(r'[^\d]', '', rp)
            if digits:
                prices.append(int(digits))
        text_clean = remove_diacritics(block_content.lower())
        million_matches = re.finditer(r'(\d+(?:[.,]\d+)?)\s*(?:trieu|tr)\b', text_clean)
        for m in million_matches:
            try:
                val = safe_parse_float(m.group(1))
                if val < 1000:
                    prices.append(int(val * 1000000))
            except ValueError:
                pass
        return list(set(prices))

    def verify_draft_response(self, draft: str, db_products: dict) -> tuple:
        import re
        if not draft:
            return True, ""
            
        # 1. Check product cards
        id_pattern = re.compile(r'product-detail\.html\?id=([^"\'\s&<>]+)', re.IGNORECASE)
        mentioned_ids = set(id_pattern.findall(draft))
        
        for mid in mentioned_ids:
            mid_str = str(mid)
            if mid_str not in db_products:
                return False, f"Mã sản phẩm (ID) {mid_str} không tồn tại trong cơ sở dữ liệu."
                
            db_info = db_products[mid_str]
            db_name = db_info['ten_sp']
            db_price = db_info['gia']
            db_image = db_info['anh_dai_dien']
            
            block_info = self.find_html_block_for_id_in_text(draft, mid_str)
            if block_info:
                block_content = block_info[0]
                
                # Check Name match
                rendered_name = None
                name_match = re.search(r'class="ai-product-name"[^>]*>([^<]+)</strong>', block_content, re.IGNORECASE)
                if not name_match:
                    name_match = re.search(r'<strong[^>]*>([^<]+)</strong>', block_content, re.IGNORECASE)
                if name_match:
                    rendered_name = name_match.group(1).strip()
                    
                if rendered_name:
                    if not self.check_names_match(db_name, rendered_name):
                        return False, f"Tên sản phẩm hiển thị '{rendered_name}' cho ID {mid_str} không khớp với tên chuẩn trong DB '{db_name}'."
                        
                # Check Price match
                prices = self.extract_prices_from_text_block(block_content)
                if prices and db_price > 0:
                    price_matched = False
                    for p in prices:
                        deviation = abs(p - db_price) / db_price
                        if deviation <= 0.01:
                            price_matched = True
                            break
                    if not price_matched:
                        return False, f"Giá bán hiển thị trong card cho ID {mid_str} ('{db_name}') không khớp với DB. DB giá là {int(db_price)}đ nhưng trong card viết khác."
                elif db_price > 0 and ("ai-product-card" in block_content or "display:flex" in block_content):
                    return False, f"Thiếu giá bán hiển thị trong card của ID {mid_str} ('{db_name}')."
                    
                # Check Image match
                rendered_img = None
                img_match = re.search(r'<img[^>]*src="([^"]+)"', block_content, re.IGNORECASE)
                if not img_match:
                    img_match = re.search(r"<img[^>]*src='([^']+)'", block_content, re.IGNORECASE)
                if img_match:
                    rendered_img = img_match.group(1).strip()
                    
                if rendered_img and db_image:
                    norm_rendered = rendered_img.lower().replace('\\', '/').strip('/')
                    norm_db = db_image.lower().replace('\\', '/').strip('/')
                    if norm_rendered != norm_db and not norm_rendered.endswith(norm_db) and not norm_db.endswith(norm_rendered):
                        return False, f"Đường dẫn ảnh '{rendered_img}' trong card của ID {mid_str} ('{db_name}') không khớp với ảnh chuẩn trong DB '{db_image}'."
                        
        # 2. Check text-based hallucination
        lines = draft.split('\n')
        brands = {'iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'sony', 'xperia', 'google', 'pixel', 'vsmart', 'asus', 'rog', 'tecno', 'nokia', 'honor', 'infinix', 'motorola'}
        refusal_keywords = {
            'khong co', 'khong ban', 'tam het', 'chua kinh doanh', 'chua co', 'khong tim thay', 
            'khong ho tro', 'het hang', 'chua ve hang', 'ngung ban', 'cao hon', 'vuot qua', 
            'ngan sach', 'tam gia', 'tieu chi', 'khong co hang', 'chua co hang', 'chua ho tro',
            'so voi', 'gia thuong', 'kho tim', 'khong tim thay mau', 'khong co chiec', 
            'dong dien thoai cua hang', 'khong co san pham'
        }
        
        db_model_words = set()
        for pid, p in db_products.items():
            db_model_words.update(self.get_core_words_text(p.get('ten_sp') or '') - brands)
            
        price_regex = re.compile(
            r'\b\d+(?:[.,]\d+)*\s*(?:trieu|tr|d|vnd|dong|k|%|cai|chiec|thang|tuoi)\b|\b\d+(?:[.,]\d+)+\b', 
            re.IGNORECASE
        )
            
        for line in lines:
            line_lower = remove_diacritics(line.lower())
            is_refusal = any(kw in line_lower for kw in refusal_keywords)
            if is_refusal:
                continue
                
            line_for_words = price_regex.sub(' ', line_lower)
            words = set(re.findall(r'[a-z0-9]+', line_for_words))
            mentioned_brands = words.intersection(brands)
            if not mentioned_brands:
                continue
                
            has_digits = bool(re.search(r'\d', line))
            if len(mentioned_brands) >= 2 and not has_digits:
                continue
                
            has_match = False
            for pid, p in db_products.items():
                p_brand = (p.get('ten_hang') or '').lower()
                p_name = remove_diacritics((p.get('ten_sp') or '').lower())
                
                if any(b in p_brand or b in p_name for b in mentioned_brands):
                    p_core = self.get_core_words_text(p.get('ten_sp') or '')
                    if p_core and p_core.issubset(words):
                        db_price = p.get('gia') or 0
                        if db_price > 0:
                            line_prices = self.extract_prices_from_text_block(line)
                            if line_prices:
                                price_matched = any(abs(lp - db_price) / db_price <= 0.01 for lp in line_prices)
                                if not price_matched:
                                    continue
                        has_match = True
                        break
                        
            if not has_match:
                unclaimed_words = words - brands
                has_spec_or_model = any(w in db_model_words or any(c.isdigit() for c in w) for w in unclaimed_words)
                if has_spec_or_model:
                    return False, f"Dòng văn bản sau đây đề xuất sản phẩm không có thực hoặc sai cấu hình/giá trong DB: \"{line.strip()}\""
                    
        return True, ""

    def query_semantic_state(self, question: str, history: List[Dict] = None, interests: List[str] = None, context_state: Dict[str, Any] = None) -> tuple:
        if context_state is None:
            context_state = {}
            
        # Format history string
        history_str = ""
        if history:
            for msg in history[-4:]:
                role = "User" if msg.get("role") == "user" else "Assistant"
                import re
                content = str(msg.get('content', ''))
                content = re.sub(r'<div[^>]*>.*?</div>', '', content, flags=re.DOTALL)
                content = re.sub(r'<[^>]+>', ' ', content)
                content = re.sub(r'\s+', ' ', content).strip()
                content = content[:300]
                history_str += f"{role}: {content}\n"
                
        # 1. Intent Classification
        intent = self.classify_intent(question, history_str)
        print(f"[RAG ROUTER] Detected Intent: {intent}")
        context_state["last_intent"] = intent
        
        # 2. Extract Entities and update Memory
        self.extract_entities(question, context_state)
        print(f"[RAG MEMORY] Updated Context State: {context_state}")
        
        user_asked_for_accessory = is_accessory(question.lower())
        
        # 3. Process according to intent
        if intent == "PRODUCT_LINK":
            response = self.handle_product_link_intent(context_state)
            return response, context_state
            
        elif intent == "INSTALLMENT_QUERY":
            kb_docs = self.vectorstore.similarity_search("trả góp", k=2, filter={"type": "knowledge"})
            kb_context = "\n\n".join(doc.page_content for doc in kb_docs) if kb_docs else ""
            
            system_prompt = f"""Bạn là trợ lý AI của QuangHưng Mobile. Hãy tư vấn chi tiết về chính sách TRẢ GÓP của cửa hàng.
Cửa hàng hỗ trợ trả góp 0% lãi suất qua thẻ tín dụng hoặc các công ty tài chính (Home Credit, FE Credit). Khách cần CCCD + 1 giấy tờ phụ.

Tri thức chính thức:
{kb_context}

Trả lời lịch sự, thân thiện bằng tiếng Việt (HTML thuần, KHÔNG dùng markdown):"""
            res = self.llm.invoke(system_prompt)
            return sanitize_ai_response(res.content), context_state
            
        # For product searches or other product-related queries, do DB search first
        db_products = self.db_product_search(context_state, user_asked_for_accessory)
        
        if db_products:
            context_state["last_recommended_ids"] = [int(p['ma_sp']) for p in db_products[:5]]
            
        # Build strict context
        context_text = ""
        if db_products:
            for p in db_products[:8]:
                price_formatted = f"{int(p['gia']):,}".replace(",", ".") + "đ" if p['gia'] else "N/A"
                price_raw = int(p['gia']) if p['gia'] else 0
                context_text += f"""\nSản phẩm: {p['ten_sp']}
  Hãng: {p['ten_hang'] or 'N/A'}
  Danh mục: {'Phụ kiện' if is_accessory(p['ten_sp']) else 'Điện thoại'}
  Giá: {price_formatted}
  Giá số: {price_raw}
  Bộ nhớ: {p['bo_nho'] or 'N/A'}
  ID: {p['ma_sp']}
  Ảnh: {p['anh_dai_dien'] or ''}"""
                if p.get('ram'):
                    context_text += f"\n  Cấu hình: RAM {p['ram']}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}"
                    
        price_note = ""
        brand = context_state.get("brand")
        
        if not db_products and brand:
            product_type_label = "phụ kiện" if user_asked_for_accessory else "điện thoại"
            price_note = f"\n\n⚠️ THÔNG BÁO QUAN TRỌNG: Cửa hàng HIỆN KHÔNG CÓ bất kỳ sản phẩm {product_type_label} nào của hãng {brand} trong tầm giá/ngân sách phù hợp yêu cầu. Bạn BẮT BUỘC phải bắt đầu câu trả lời bằng cách khẳng định rõ ràng và lịch sự là cửa hàng không có sản phẩm {brand} trong phân khúc này (Ví dụ: 'Dạ, hiện tại dòng {product_type_label} của hãng {brand} ở tầm giá này bên em đang tạm hết hàng ạ'). Sau đó, giới thiệu sản phẩm thay thế của chính hãng {brand} (nếu có) hoặc hãng khác có sẵn như bên dưới để khách tham khảo. TUYỆT ĐỐI KHÔNG TỰ BỊA SẢN PHẨM."
            
            # Fetch same brand alts
            same_brand_alts = []
            try:
                conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
                cursor = conn.cursor(dictionary=True)
                cursor.execute("""
                    SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                           ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                    FROM san_pham sp
                    LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                    LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                    WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) = %s
                    ORDER BY sp.gia ASC
                """, (brand.lower(),))
                rows = cursor.fetchall()
                cursor.close()
                conn.close()
                for r in rows:
                    is_acc = is_accessory(r['ten_sp'])
                    if user_asked_for_accessory == is_acc:
                        same_brand_alts.append(r)
                        if len(same_brand_alts) >= 2:
                            break
            except Exception as e:
                print(f"[RAG Memory Alt Same Brand] DB error: {e}")
                
            price_const = context_state.get("price_constraint")
            cheapest_price = same_brand_alts[0]['gia'] if same_brand_alts else float('inf')
            limit_val = price_const.get('val', 0) if price_const else 5000000
            need_other_brands = not same_brand_alts or (price_const and cheapest_price > limit_val * 2)
            
            other_brand_alts = []
            if need_other_brands:
                try:
                    conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
                    cursor = conn.cursor(dictionary=True)
                    query_cond = ""
                    params = [brand.lower()]
                    if price_const:
                        query_cond = "AND sp.gia <= %s"
                        params.append(price_const['val'])
                    else:
                        query_cond = "AND sp.gia <= 5000000"
                    cursor.execute(f"""
                        SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.bo_nho, hsx.ten_hang,
                               ch.ram, ch.chip, ch.pin, ch.man_hinh, ch.camera
                        FROM san_pham sp
                        LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                        LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
                        WHERE sp.so_luong_ton > 0 AND LOWER(hsx.ten_hang) != %s {query_cond}
                        ORDER BY sp.gia ASC LIMIT 20
                    """, tuple(params))
                    rows = cursor.fetchall()
                    cursor.close()
                    conn.close()
                    for r in rows:
                        is_acc = is_accessory(r['ten_sp'])
                        if user_asked_for_accessory == is_acc:
                            other_brand_alts.append(r)
                            if len(other_brand_alts) >= 2:
                                break
                except Exception as e:
                    print(f"[RAG Memory Alt Other Brands] DB error: {e}")
            
            db_products = same_brand_alts + other_brand_alts
            
            # Since we have loaded some products for context, last_recommended_ids should still be updated
            if db_products:
                context_state["last_recommended_ids"] = [int(p['ma_sp']) for p in db_products[:5]]
                
            for p in db_products:
                price_formatted = f"{int(p['gia']):,}".replace(",", ".") + "đ" if p['gia'] else "N/A"
                price_raw = int(p['gia']) if p['gia'] else 0
                context_text += f"""\nSản phẩm: {p['ten_sp']}
  Hãng: {p['ten_hang'] or 'N/A'}
  Danh mục: {'Phụ kiện' if is_accessory(p['ten_sp']) else 'Điện thoại'}
  Giá: {price_formatted}
  Giá số: {price_raw}
  Bộ nhớ: {p['bo_nho'] or 'N/A'}
  ID: {p['ma_sp']}
  Ảnh: {p['anh_dai_dien'] or ''}"""
                if p.get('ram'):
                    context_text += f"\n  Cấu hình: RAM {p['ram']}, Chip {p['chip']}, Pin {p['pin']}, Màn hình {p['man_hinh']}, Camera {p['camera']}"

        kb_docs = self.vectorstore.similarity_search(question, k=2, filter={"type": "knowledge"})
        kb_context = "\n\n".join(doc.page_content for doc in kb_docs) if kb_docs else ""
        
        interests_instruction = ""
        if interests:
            interests_instruction = f"LƯU Ý CÁ NHÂN HÓA: Khách hàng này có sở thích: {', '.join(interests)}. Hãy ưu tiên tư vấn khía cạnh liên quan."
            
        system_template = f"""Bạn là Chuyên gia Tư vấn Công nghệ kiêm Đại sứ Thương hiệu của QuangHưng Mobile.
Mục tiêu của bạn là tư vấn nhiệt tình, chuyên nghiệp và thuyết phục khách hàng mua các sản phẩm có sẵn tại cửa hàng.

QUY TẮC BẮT BUỘC:
1. CHỈ ĐƯỢC tư vấn sản phẩm có trong danh sách CSDL dưới đây. Tuyệt đối không tự tạo tên sản phẩm (ví dụ: POCO C71 là sản phẩm không tồn tại nếu không có trong danh sách), không tự đặt giá khác với dữ liệu cung cấp.
2. Nếu không tìm thấy sản phẩm nào trong dữ liệu, hãy phản hồi: "Dạ, hiện em chưa tìm thấy sản phẩm phù hợp trong hệ thống cửa hàng ạ. Anh/chị có thể cho em xin thêm thông tin để em tìm mẫu khác nhé!" hoặc nếu khách hỏi dòng máy cụ thể mà hết hàng thì khẳng định rõ ràng là cửa hàng không có dòng máy/hãng đó trong tầm giá này.
3. Khi giới thiệu sản phẩm cụ thể, bắt buộc dùng mẫu HTML sau để hiển thị card sản phẩm:
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
(BẮT BUỘC thay [[Anh]] bằng chính xác trường "Ảnh" của sản phẩm đó, bao gồm cả "images/products/..." ở đầu. BẮT BUỘC thay thế các biến khác bằng dữ liệu chuẩn).
4. TUYỆT ĐỐI KHÔNG dùng bất kỳ ký hiệu Markdown nào (như `**`, `*`, `-`, `#`, ` ``` `). Chỉ dùng HTML cơ bản như `<br>`, `<strong>`, `<b>`.

{interests_instruction}
{price_note}

<Lịch sử trò chuyện>
{history_str}
</Lịch sử trò chuyện>

<Dữ liệu sản phẩm CSDL chuẩn>
{context_text}
</Dữ liệu sản phẩm CSDL chuẩn>

<Tri thức cửa hàng bổ sung>
{kb_context}
</Tri thức cửa hàng bổ sung>

Câu hỏi của khách: {question}

Hãy đưa ra câu trả lời thuyết phục bằng tiếng Việt:"""

        error_details = ""
        final_response = ""
        
        db_products_all = {}
        try:
            conn = mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)
            cursor = conn.cursor()
            cursor.execute("SELECT sp.ma_sp, sp.ten_sp, sp.gia, hsx.ten_hang, sp.anh_dai_dien FROM san_pham sp LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang WHERE sp.so_luong_ton > 0")
            for r in cursor.fetchall():
                db_products_all[str(r[0])] = {
                    'ten_sp': str(r[1]),
                    'gia': float(r[2]),
                    'ten_hang': str(r[3]) if r[3] else '',
                    'anh_dai_dien': str(r[4]) if r[4] else ''
                }
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"[Verifier DB] Error: {e}")
            
        for attempt in range(3):
            if attempt == 0:
                prompt_input = system_template
            else:
                prompt_input = f"""{system_template}

⚠️ CẢNH BÁO QUAN TRỌNG: Bạn đã sinh câu trả lời ở lượt trước nhưng bị từ chối do PHÁT HIỆN LỖI SAO CHÉP HOẶC BỊA ĐẶT THÔNG TIN.
Chi tiết lỗi ở lượt trước: {error_details}
Yêu cầu: Hãy tạo lại câu trả lời và KHÔNG ĐƯỢC lặp lại lỗi trên. Hãy bám sát 100% dữ liệu chuẩn và tuân thủ các quy tắc đã nêu ở trên."""
                
            try:
                res = self.llm.invoke(prompt_input)
                draft = res.content
                
                is_valid, err_msg = self.verify_draft_response(draft, db_products_all)
                if is_valid:
                    final_response = draft
                    break
                else:
                    error_details = err_msg
                    print(f"[Verifier Attempt {attempt+1}] Rejected: {err_msg}")
                    final_response = draft
            except Exception as e:
                print(f"[LLM Generation Exception] {e}")
                break
                
        final_response = self._validate_response_product_ids(final_response)
        final_response = sanitize_ai_response(final_response)
        
        return final_response, context_state

    def rewrite_query(self, current_input: str, history: List[Dict] = None) -> str:
        if not history or len(history) == 0:
            return current_input
            
        history_str = ""
        # Get up to 4 last messages for context
        for msg in history[-4:]:
            role = "Khách hàng" if msg.get("role") == "user" else "Chatbot"
            content = str(msg.get('content', ''))
            # strip HTML cards for simplicity
            import re
            content = re.sub(r'<div[^>]*>.*?</div>', '', content, flags=re.DOTALL)
            content = re.sub(r'<[^>]+>', ' ', content)
            content = re.sub(r'\s+', ' ', content).strip()
            content = content[:150]
            history_str += f"{role}: {content}\n"
            
        prompt_text = f"""Dựa vào lịch sử hội thoại dưới đây, hãy viết lại câu hỏi cuối cùng của người dùng thành một câu hỏi hoặc yêu cầu đầy đủ ý nghĩa và ngữ cảnh (bao gồm tên hãng, dòng điện thoại/phụ kiện, khoảng giá, màu sắc, cấu hình, v.v. được đề cập trước đó).
Yêu cầu:
1. KHÔNG được thay đổi ý định của người dùng.
2. KHÔNG thêm bất kỳ lời dẫn giải nào, chỉ trả về câu hỏi/yêu cầu đã được viết lại.
3. Nếu câu hỏi cuối cùng đã đầy đủ nghĩa và không cần viết lại, hãy giữ nguyên.

Lịch sử hội thoại:
{history_str}

Câu hỏi cuối cùng của người dùng: "{current_input}"

Câu hỏi viết lại đầy đủ nghĩa:"""
        try:
            res = self.llm.invoke(prompt_text)
            rewritten = res.content.strip().replace('"', '')
            print(f"[Query Rewriter] Original: '{current_input}' -> Rewritten: '{rewritten}'")
            
            # Check for safety refusals or canned refusal responses
            refusal_indicators = ["không thể", "xin lỗi", "tiếc", "cannot", "sorry", "hại", "bất hợp pháp", "thương mại"]
            if any(indicator in rewritten.lower() for indicator in refusal_indicators) and len(rewritten) > len(current_input) * 3:
                print(f"[Query Rewriter] Refusal detected! Falling back to original: '{current_input}'")
                return current_input
                
            return rewritten
        except Exception as e:
            print(f"[Query Rewriter] Error: {e}")
            return current_input

    def process_chat(self, message: str, history: List[Dict] = None, is_admin: bool = False, user_id: Any = None, interests: List[str] = None, context_state: Dict[str, Any] = None) -> tuple:
        if context_state is None:
            context_state = {}
            
        message = self.normalize_query(message)
            
        try:
            self._ensure_vectorstore_fresh()
        except Exception as e:
            print(f"[Freshness] Check failed: {e}")
            
        if is_admin:
            msg_lower = message.lower()
            is_bi_query = any(kw in msg_lower for kw in [
                'doanh thu', 'bán được', 'đơn hàng', 'doanh số', 'tồn kho', 'hết hàng',
                'sắp hết', 'thống kê', 'báo cáo', 'bán chạy', 'đánh giá', 'kpi', 'thu nhập'
            ])
            if is_bi_query:
                print("=> Routing to KPI/SQL engine for Admin")
                return self.query_kpi(message), context_state
                
        # Call Query Rewriter
        rewritten_message = self.rewrite_query(message, history)
        
        ans, updated_state = self.query_semantic_state(rewritten_message, history, interests, context_state)
        return ans, updated_state

# Khởi tạo singleton instance
rag_engine = None

def get_rag_engine():
    global rag_engine
    if rag_engine is None:
        rag_engine = RAGEngine()
    return rag_engine
