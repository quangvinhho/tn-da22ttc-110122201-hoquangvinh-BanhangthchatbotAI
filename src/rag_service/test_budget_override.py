import sys
sys.stdout.reconfigure(encoding='utf-8')
from recommend_flow import extract_flow_entities, get_target_budget

class DummyLLM:
    def invoke(self, prompt):
        # A mock LLM returning basic JSON
        class DummyContent:
            content = '{"student_year": null, "need_long_term": null, "budget": null, "priority": null}'
        return DummyContent()

llm = DummyLLM()

print("==================================================")
print("TESTING BUDGET OVERRIDE IN CONTEXT STATE")
print("==================================================")

# Turn 1: Initial budget input with comparative "dưới" (keeps raw string for later parsing)
state = {"student_year": None, "need_long_term": None, "budget": None, "priority": None}
msg1 = "Tôi muốn tìm máy dưới 5 triệu"
state = extract_flow_entities("student", msg1, state, "Chào bạn, bạn cần tư vấn dòng điện thoại nào?", llm)
print(f"Message 1: '{msg1}'")
print(f"  -> State after turn 1: {state}")
target_budget_1 = get_target_budget(state["budget"])
print(f"  -> Target Budget 1: {target_budget_1}")
assert target_budget_1 == 5000000, f"Expected target budget to be 5000000, got {target_budget_1}"
print("  ✅ Turn 1 Passed!")

# Turn 2: User changes their mind and overrides the budget (plain number)
msg2 = "Không, cho tôi xem máy tầm 10 triệu đi"
state = extract_flow_entities("student", msg2, state, "Dạ bạn muốn máy dưới 5 triệu, vậy mình chọn pin trâu hay chụp ảnh?", llm)
print(f"Message 2: '{msg2}'")
print(f"  -> State after turn 2: {state}")
target_budget_2 = get_target_budget(state["budget"])
print(f"  -> Target Budget 2: {target_budget_2}")
assert target_budget_2 == 10000000, f"Expected target budget to be 10000000, got {target_budget_2}"
print("  ✅ Turn 2 Passed!")

# Turn 3: User says something unrelated to budget (should preserve the 10M budget)
msg3 = "Học tập mượt và pin trâu nhé"
state = extract_flow_entities("student", msg3, state, "Dạ máy tầm 10 triệu, bạn cần ưu tiên gì ạ?", llm)
print(f"Message 3: '{msg3}'")
print(f"  -> State after turn 3: {state}")
target_budget_3 = get_target_budget(state["budget"])
print(f"  -> Target Budget 3: {target_budget_3}")
assert target_budget_3 == 10000000, f"Expected target budget to be preserved as 10000000, got {target_budget_3}"
print("  ✅ Turn 3 Passed!")

print("==================================================")
print("ALL BUDGET OVERRIDE TESTS PASSED!")
sys.exit(0)
