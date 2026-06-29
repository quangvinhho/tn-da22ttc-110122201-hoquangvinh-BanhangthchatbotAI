import os

def search_text(directory, target):
    results = []
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in root or 'venv' in root or '.git' in root or 'chroma_db' in root:
            continue
        for file in files:
            if file.endswith(('.js', '.html', '.py', '.json', '.md', '.sql', '.css')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        for line_num, line in enumerate(f, 1):
                            if target.lower() in line.lower():
                                results.append(f"{path}:{line_num}: {line.strip()}")
                except Exception as e:
                    pass
    return results

def main():
    print("Searching for 'Redmi 10'...")
    res = search_text("D:/GDDA", "Redmi 10")
    for r in res[:50]:
        print(r)
    print("Done!")

if __name__ == '__main__':
    main()
