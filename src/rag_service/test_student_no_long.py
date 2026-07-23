import sys
import io

if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    except Exception:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='backslashreplace')
        except Exception:
            pass

from rag_engine import get_rag_engine

def test():
    print("==================================================")
    print("TESTING STUDENT SEQUENCE (NO LONG TERM)")
    print("==================================================")
    
    engine = get_rag_engine()
    
    # Message 1
    history = []
    context_state = {}
    print("\n--- Message 1: 'tôi là sinh viên' ---")
    ans1, state1, chips1 = engine.process_chat("tôi là sinh viên", history, context_state=context_state)
    print(f"AI: {ans1}")
    print(f"Chips: {[c['text'] for c in chips1] if chips1 else None}")
    print(f"State: {state1.get('flow_data')}")
    
    # Message 2
    history.append({"role": "user", "content": "tôi là sinh viên"})
    history.append({"role": "assistant", "content": ans1})
    print("\n--- Message 2: 'Năm nhất' ---")
    ans2, state2, chips2 = engine.process_chat("Năm nhất", history, context_state=state1)
    print(f"AI: {ans2}")
    print(f"Chips: {[c['text'] for c in chips2] if chips2 else None}")
    print(f"State: {state2.get('flow_data')}")
    
    # Message 3
    history.append({"role": "user", "content": "Năm nhất"})
    history.append({"role": "assistant", "content": ans2})
    print("\n--- Message 3: 'Không cần dùng lâu' ---")
    ans3, state3, chips3 = engine.process_chat("Không cần dùng lâu", history, context_state=state2)
    print(f"AI: {ans3}")
    print(f"Chips: {[c['text'] for c in chips3] if chips3 else None}")
    print(f"State: {state3.get('flow_data')}")

    # Message 4
    history.append({"role": "user", "content": "Không cần dùng lâu"})
    history.append({"role": "assistant", "content": ans3})
    print("\n--- Message 4: 'Dưới 5 triệu' ---")
    ans4, state4, chips4 = engine.process_chat("Dưới 5 triệu", history, context_state=state3)
    print(f"AI: {ans4}")
    print(f"Chips: {[c['text'] for c in chips4] if chips4 else None}")
    print(f"State: {state4.get('flow_data')}")

    # Message 5
    history.append({"role": "user", "content": "Dưới 5 triệu"})
    history.append({"role": "assistant", "content": ans4})
    print("\n--- Message 5: 'Học tập & Pin trâu' ---")
    ans5, state5, chips5 = engine.process_chat("Học tập & Pin trâu", history, context_state=state4)
    print(f"AI: {ans5}")
    print(f"Chips: {[c['text'] for c in chips5] if chips5 else None}")
    print(f"State: {state5.get('flow_data') if state5 else None}")

if __name__ == "__main__":
    test()
