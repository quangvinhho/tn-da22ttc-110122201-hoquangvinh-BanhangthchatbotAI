import sys
sys.stdout.reconfigure(encoding='utf-8')
from recommend_flow import extract_flow_entities, parse_budget_range

class DummyLLM:
    def invoke(self, prompt):
        # A mock LLM returning JSON with budget normalized to 5000000
        class DummyContent:
            content = '{"student_year": null, "need_long_term": null, "budget": 5000000, "priority": null}'
        return DummyContent()

llm = DummyLLM()

print("==================================================")
print("TESTING COMPARATIVE BUDGET (DƯỚI 5 TRIỆU)")
print("==================================================")

# Turn 1: User says "dưới 5 triệu"
state = {"student_year": None, "need_long_term": None, "budget": None, "priority": None}
msg1 = "Tôi muốn tìm máy dưới 5 triệu"
state = extract_flow_entities("student", msg1, state, "Chào bạn, bạn cần tư vấn dòng điện thoại nào?", llm)
print(f"Message 1: '{msg1}'")
print(f"  -> State after turn 1: {state}")
min_p, max_p = parse_budget_range(state["budget"])
print(f"  -> Parsed range: min={min_p}, max={max_p}")
assert min_p is None, f"Expected min price None, got {min_p}"
assert max_p == 5000000, f"Expected max price 5000000, got {max_p}"
print("  ✅ Turn 1 Passed!")

# Turn 2: User talks about something else
msg2 = "Học tập mượt và chơi game"
state = extract_flow_entities("student", msg2, state, "Dạ bạn muốn máy dưới 5 triệu, vậy mình chọn pin trâu hay chụp ảnh?", llm)
print(f"Message 2: '{msg2}'")
print(f"  -> State after turn 2: {state}")
min_p_2, max_p_2 = parse_budget_range(state["budget"])
print(f"  -> Parsed range after turn 2: min={min_p_2}, max={max_p_2}")
assert min_p_2 is None, f"Expected preserved min price None, got {min_p_2}"
assert max_p_2 == 5000000, f"Expected preserved max price 5000000, got {max_p_2}"
print("  ✅ Turn 2 Passed!")

print("==================================================")
print("ALL DƯỚI 5 TRIỆU TESTS PASSED!")
sys.exit(0)
