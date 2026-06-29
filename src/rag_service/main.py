import sys
import io
import warnings

# Safe stream wrapper to prevent UnicodeEncodeError and OSError [Errno 22] on Windows console/pipes
class SafeStream:
    def __init__(self, original_stream):
        self.stream = original_stream

    def write(self, data):
        if not data:
            return 0
        try:
            return self.stream.write(data)
        except (OSError, UnicodeEncodeError):
            try:
                # Fallback to sanitizing non-mappable/problematic characters
                sanitized = data.encode('utf-8', errors='backslashreplace').decode('utf-8', errors='backslashreplace')
                return self.stream.write(sanitized)
            except Exception:
                # Silence stream write errors completely
                return len(data)

    def flush(self):
        try:
            self.stream.flush()
        except Exception:
            pass

    def __getattr__(self, name):
        return getattr(self.stream, name)

# Configure output streams to use UTF-8 and hook SafeStream wrapper
if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    except Exception:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='backslashreplace')
        except Exception:
            pass
    sys.stdout = SafeStream(sys.stdout)

if sys.stderr is not None:
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='backslashreplace')
    except Exception:
        try:
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='backslashreplace')
        except Exception:
            pass
    sys.stderr = SafeStream(sys.stderr)

# Ẩn các cảnh báo không cần thiết từ thư viện (pandas, websockets, langchain) để làm sạch log
warnings.filterwarnings("ignore")

import os
import time
from collections import deque
from fastapi import FastAPI, HTTPException, Request, Header
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import uvicorn

from rag_engine import get_rag_engine, GROQ_API_KEY
from recommend_engine import mock_get_recommendation

IS_PROD = os.getenv('NODE_ENV') == 'production' or os.getenv('ENV') == 'production'
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN')
if IS_PROD and not ADMIN_TOKEN:
    print('FATAL: ADMIN_TOKEN chưa set ở production.')
    raise SystemExit(1)

app = FastAPI(title="QuangHung Mobile - RAG AI Service")

# Rate limiter trong-bộ-nhớ: { key: deque[timestamps] }
RATE_BUCKET: Dict[str, deque] = {}
def _rate_limit(key: str, max_per_min: int = 30):
    now = time.time()
    bucket = RATE_BUCKET.setdefault(key, deque())
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= max_per_min:
        raise HTTPException(status_code=429, detail='Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.')
    bucket.append(now)

class ChatRequest(BaseModel):
    message: str
    userId: Optional[Any] = None
    conversationId: Optional[Any] = None
    history: Optional[List[Dict]] = []
    interests: Optional[List[str]] = []
    context_state: Optional[Dict[str, Any]] = {}

class ChatResponse(BaseModel):
    response: str
    intent: Optional[str] = None
    context_state: Optional[Dict[str, Any]] = {}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, http_request: Request):
    try:
        if not request.message:
            raise HTTPException(status_code=400, detail="Message is required")

        # Rate limit theo userId nếu có, nếu không thì theo IP
        rate_key = str(request.userId) if request.userId else (http_request.client.host if http_request.client else 'anon')
        _rate_limit(f'chat:{rate_key}', max_per_min=30)
            
        # Kiểm tra nếu API key chưa cấu hình hoặc là placeholder
        if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
            return ChatResponse(
                response="Xin lỗi quý khách, hệ thống AI Chatbot hiện tại chưa được cấu hình khóa API (API Key) hợp lệ. Vui lòng cập nhật GROQ_API_KEY trong tệp cấu hình backend/.env.",
                intent="ERROR",
                context_state=request.context_state
            )

        engine = get_rag_engine()
        answer, updated_state = engine.process_chat(
            request.message, 
            request.history, 
            user_id=request.userId, 
            interests=request.interests,
            context_state=request.context_state
        )
        
        return ChatResponse(response=answer, context_state=updated_state)
    except Exception as e:
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        try:
            with open("error_log.txt", "a", encoding="utf-8") as f:
                f.write(traceback.format_exc() + "\n")
        except:
            pass
        print(f"Error in chat endpoint: {error_msg}")
        if "API_KEY_INVALID" in error_msg or "API key not valid" in error_msg or "400" in error_msg:
            return ChatResponse(
                response="Hệ thống ghi nhận lỗi khóa API (API Key) không hợp lệ từ máy chủ Groq. Vui lòng kiểm tra lại cấu hình GROQ_API_KEY trong tệp backend/.env.",
                intent="ERROR"
            )
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/admin-chat", response_model=ChatResponse)
async def admin_chat(request: ChatRequest):
    try:
        if not request.message:
            raise HTTPException(status_code=400, detail="Message is required")
            
        if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
            return ChatResponse(
                response="AI chưa được cấu hình khóa API.",
                intent="ERROR"
            )

        engine = get_rag_engine()
        answer = engine.process_admin_chat(request.message, request.history)
        return ChatResponse(response=answer)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in admin_chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/reload-vectorstore")
async def reload_vectorstore(x_admin_token: Optional[str] = Header(default=None, alias='X-Admin-Token')):
    # Yêu cầu ADMIN_TOKEN ở mọi môi trường có set; chỉ dev nếu ADMIN_TOKEN trống thì cho qua + warn
    if ADMIN_TOKEN:
        if not x_admin_token or x_admin_token != ADMIN_TOKEN:
            raise HTTPException(status_code=401, detail='Unauthorized')
    elif IS_PROD:
        # Đã chặn ở khởi động, nhưng phòng hờ
        raise HTTPException(status_code=503, detail='Admin token chưa cấu hình.')
    else:
        print('WARN: /api/reload-vectorstore đang mở (ADMIN_TOKEN chưa set, dev mode).')
    try:
        engine = get_rag_engine()
        engine.reload_vectorstore()
        return {"status": "success", "message": "Đã đồng bộ lại dữ liệu RAG thành công"}
    except Exception as e:
        print(f"Error reloading vectorstore: {str(e)}")
        raise HTTPException(status_code=500, detail='Lỗi đồng bộ vector store')

@app.post("/api/cache/invalidate-knowledge")
async def invalidate_knowledge_cache(x_admin_token: Optional[str] = Header(default=None, alias='X-Admin-Token')):
    """Xóa RAM cache knowledge để response tiếp theo lấy dữ liệu mới ngay (nhanh, không rebuild Chroma)."""
    if ADMIN_TOKEN:
        if not x_admin_token or x_admin_token != ADMIN_TOKEN:
            raise HTTPException(status_code=401, detail='Unauthorized')
    elif IS_PROD:
        raise HTTPException(status_code=503, detail='Admin token chưa cấu hình.')
    try:
        engine = get_rag_engine()
        engine.invalidate_knowledge_cache()
        return {"status": "success", "message": "Đã xóa RAM cache knowledge"}
    except Exception as e:
        print(f"Error invalidating knowledge cache: {str(e)}")
        raise HTTPException(status_code=500, detail='Lỗi xóa cache knowledge')

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "RAG AI Service is running"}

class RecommendRequest(BaseModel):
    userId: Optional[Any] = None
    cartItems: Optional[List[str]] = []

@app.post("/api/recommend")
async def recommend(request: RecommendRequest, http_request: Request):
    try:
        # Ép kiểu chuỗi an toàn cho userId nhận được từ request
        user_id_str = str(request.userId) if request.userId is not None else None
        rate_key = user_id_str or (http_request.client.host if http_request.client else 'anon')
        _rate_limit(f'recommend:{rate_key}', max_per_min=60)
        recs = mock_get_recommendation(user_id_str, request.cartItems)
        return {"status": "success", "recommendations": recs}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in recommendation endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

class GenerateInterestsRequest(BaseModel):
    userId: str

from recommend_engine import extract_interests_from_history

@app.post("/api/generate-interests")
async def generate_interests(request: GenerateInterestsRequest):
    try:
        interests = extract_interests_from_history(request.userId)
        return {"status": "success", "interests": interests}
    except Exception as e:
        print(f"Error in generate-interests endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

class RecommendConfigRequest(BaseModel):
    k_neighbors: int
    min_support: float
    min_threshold: float

@app.get("/api/recommend/admin/status")
async def get_recommend_status():
    try:
        from recommend_engine import get_model_status
        return get_model_status()
    except Exception as e:
        print(f"Error in recommend/admin/status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recommend/admin/config")
async def save_recommend_config_route(request: RecommendConfigRequest):
    try:
        from recommend_engine import save_config, trigger_retrain
        config_data = {
            "k_neighbors": request.k_neighbors,
            "min_support": request.min_support,
            "min_threshold": request.min_threshold
        }
        if save_config(config_data):
            status = trigger_retrain()
            return {"status": "success", "message": "Đã lưu cấu hình và huấn luyện lại mô hình thành công", "data": status}
        else:
            raise HTTPException(status_code=500, detail="Không thể ghi cấu hình")
    except Exception as e:
        print(f"Error in recommend/admin/config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recommend/admin/retrain")
async def retrain_recommend_engine():
    try:
        from recommend_engine import trigger_retrain
        status = trigger_retrain()
        return {"status": "success", "message": "Huấn luyện lại mô hình thành công", "data": status}
    except Exception as e:
        print(f"Error in recommend/admin/retrain: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recommend/admin/explain")
async def explain_recommendations_route(userId: str, cartItems: Optional[str] = None):
    try:
        from recommend_engine import explain_recommendations
        cart_list = cartItems.split(",") if cartItems else []
        recs = explain_recommendations(userId, cart_list)
        return {"status": "success", "recommendations": recs}
    except Exception as e:
        print(f"Error in recommend/admin/explain: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recommend/admin/overview-knn")
async def get_similar_customers_overview_route():
    try:
        from recommend_engine import get_similar_customers_overview
        data = get_similar_customers_overview()
        return {"status": "success", "data": data}
    except Exception as e:
        print(f"Error in recommend/admin/overview-knn: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recommend/admin/overview-apriori")
async def get_association_rules_overview_route():
    try:
        from recommend_engine import get_association_rules_overview
        data = get_association_rules_overview()
        return {"status": "success", "data": data}
    except Exception as e:
        print(f"Error in recommend/admin/overview-apriori: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
