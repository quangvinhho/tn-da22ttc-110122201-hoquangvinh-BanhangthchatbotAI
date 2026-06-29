import os
import sys

def main():
    path = r'D:\GDDA\rag_service\result.txt'
    print("File exists:", os.path.exists(path))
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        print("Content length:", len(content))
        sys.stdout.buffer.write(content.encode('utf-8'))
    else:
        print("File not found at", path)

if __name__ == '__main__':
    main()
