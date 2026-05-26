#!/usr/bin/env python3
"""
Script tham khảo để trích text từ PDF nguồn sang text layout.
Cần cài poppler-utils để có lệnh `pdftotext`.

Dùng:
    python tools/extract_exam_from_pdf.py source.pdf output.txt
"""
import subprocess
import sys
from pathlib import Path

if len(sys.argv) != 3:
    print("Usage: python tools/extract_exam_from_pdf.py source.pdf output.txt")
    raise SystemExit(2)
source = Path(sys.argv[1])
out = Path(sys.argv[2])
subprocess.run(["pdftotext", "-layout", str(source), str(out)], check=True)
print(f"Saved {out}")
