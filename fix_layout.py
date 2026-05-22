import os

file_path = r"d:\GDDA\frontend\admin.html"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Find bounds of section-employees
start_idx = -1
end_idx = -1
main_end_idx = -1

for i, line in enumerate(lines):
    if "<!-- ==================== EMPLOYEES SECTION ==================== -->" in line:
        start_idx = i
    if start_idx != -1 and i > start_idx and '<div id="employee-modal"' in line:
        # The section ends before the modal comment
        # Let's find the closing div of section-employees
        for j in range(i-1, start_idx, -1):
            if "<!-- Modal Nhân Viên -->" in lines[j]:
                end_idx = j - 1
                break
        if end_idx == -1:
            end_idx = i - 2
        break

for i, line in enumerate(lines):
    if "</main>" in line:
        main_end_idx = i
        break

if start_idx != -1 and end_idx != -1 and main_end_idx != -1:
    print(f"Found section at {start_idx} to {end_idx}")
    print(f"Found </main> at {main_end_idx}")
    
    # Extract block
    block = lines[start_idx:end_idx+1]
    
    # Remove block from original location
    # Note: we must remove backwards to not mess up indices if main_end_idx > start_idx (which it's not)
    # Actually main_end_idx is ~1583 and start_idx is ~2134
    
    new_lines = lines[:main_end_idx] + block + lines[main_end_idx:start_idx] + lines[end_idx+1:]
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("Fixed layout successfully.")
else:
    print(f"Failed to find indices: start={start_idx}, end={end_idx}, main={main_end_idx}")
