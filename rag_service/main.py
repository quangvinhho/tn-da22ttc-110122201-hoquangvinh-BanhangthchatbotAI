from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import uvicorn

from rag_engine import get_rag_engine, GROQ_API_KEY
from recommend_engine import mock_get_recommendation

app = FastAPI(title="QuangHung Mobile - RAG AI Service")

class ChatRequest(BaseModel):
    message: str
    userId: Optional[Any] = None
    conversationId: Optional[Any] = None
    history: Optional[List[Dict]] = []

class ChatResponse(BaseModel):
    response: str
    intent: Optional[str] = None

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        if not request.message:
            raise HTTPException(status_code=400, detail="Message is required")
            
        # Kiểm tra nếu API key chưa cấu hình hoặc là placeholder
        if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
            return ChatResponse(
                response="Xin lỗi quý khách, hệ thống AI Chatbot hiện tại chưa được cấu hình khóa API (API Key) hợp lệ. Vui lòng cập nhật GROQ_API_KEY trong tệp cấu hình backend/.env.",
                intent="ERROR"
            )

        engine = get_rag_engine()
        answer = engine.process_chat(request.message, request.history)
        
        return ChatResponse(response=answer)
    except Exception as e:
        error_msg = str(e)
        print(f"Error in chat endpoint: {error_msg}")
        if "API_KEY_INVALID" in error_msg or "API key not valid" in error_msg or "400" in error_msg:
            return ChatResponse(
                response="Hệ thống ghi nhận lỗi khóa API (API Key) không hợp lệ từ máy chủ Groq. Vui lòng kiểm tra lại cấu hình GROQ_API_KEY trong tệp backend/.env.",
                intent="ERROR"
            )
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/reload-vectorstore")
async def reload_vectorstore():
    try:
        engine = get_rag_engine()
        engine.reload_vectorstore()
        return {"status": "success", "message": "Đã đồng bộ lại dữ liệu RAG thành công"}
    except Exception as e:
        print(f"Error reloading vectorstore: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "RAG AI Service is running"}

class RecommendRequest(BaseModel):
    userId: Optional[Any] = None
    cartItems: Optional[List[str]] = []

@app.post("/api/recommend")
async def recommend(request: RecommendRequest):
    try:
        # Ép kiểu chuỗi an toàn cho userId nhận được từ request
        user_id_str = str(request.userId) if request.userId is not None else None
        # Gọi recommend_engine, lấy danh sách product ID
        recs = mock_get_recommendation(user_id_str, request.cartItems)
        return {"status": "success", "recommendations": recs}
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
