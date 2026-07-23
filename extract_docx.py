import zipfile
import xml.etree.ElementTree as ET
import os

def extract_docx_text(docx_path, output_txt_path):
    namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    
    if not os.path.exists(docx_path):
        print(f"Error: File {docx_path} does not exist.")
        return False
        
    try:
        with zipfile.ZipFile(docx_path) as docx:
            tree = ET.parse(docx.open('word/document.xml'))
            root = tree.getroot()
            paragraphs = []
            for paragraph in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                p_text = []
                for run in paragraph.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r'):
                    for t in run.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                        if t.text:
                            p_text.append(t.text)
                paragraphs.append("".join(p_text))
            
            full_text = "\n".join(paragraphs)
            with open(output_txt_path, "w", encoding="utf-8") as f:
                f.write(full_text)
            print(f"Successfully extracted text to {output_txt_path}")
            return True
    except Exception as e:
        print(f"An error occurred: {e}")
        return False

if __name__ == "__main__":
    docx_file = r"d:\GDDA\.docs\110122201_HQV_KLTN (3).docx"
    output_file = r"d:\GDDA\.docs\extracted_thesis.txt"
    extract_docx_text(docx_file, output_file)
