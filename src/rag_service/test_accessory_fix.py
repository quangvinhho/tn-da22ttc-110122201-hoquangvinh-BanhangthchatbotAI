import sys
sys.stdout.reconfigure(encoding='utf-8')
from recommend_flow import is_accessory

test_cases = [
    # Dedicated accessories mentioning brands (should be Classified as Accessory -> True)
    ("Cáp sạc nhanh iPhone 15", True),
    ("Củ sạc Samsung Galaxy 25W", True),
    ("Cốc sạc Oppo SuperVOOC", True),
    ("Sạc dự phòng Xiaomi 20000mAh", True),
    ("Ốp lưng MagSafe iPhone 14 Pro Max", True),
    ("Tai nghe Bluetooth Apple AirPods 3", True),
    ("Kính cường lực Samsung Galaxy S23", True),
    
    # Phones supporting fast charging or matching some keywords (should be Classified as Phone -> False)
    ("Samsung Galaxy A05s (Hỗ trợ sạc nhanh 25W)", False),
    ("iPhone 13 Pro Max 256GB sạc pin nhanh", False),
    ("Oppo Reno 10 (Sạc siêu nhanh)", False),
    ("Xiaomi Redmi Note 13 sạc nhanh", False),
]

passed = True
print("==================================================")
print("TESTING IS_ACCESSORY CLASSIFICATION FIX")
print("==================================================")

for name, expected in test_cases:
    result = is_accessory(name)
    status = "✅ PASSED" if result == expected else "❌ FAILED"
    print(f"Product: '{name}'")
    print(f"  -> Classified as Accessory: {result} (Expected: {expected}) | {status}")
    if result != expected:
        passed = False

print("==================================================")
if passed:
    print("ALL CLASSIFICATION TESTS PASSED!")
    sys.exit(0)
else:
    print("SOME CLASSIFICATION TESTS FAILED!")
    sys.exit(1)
