# Phòng thi ĐGNL HCM V-ACT 2026 – bản text chuẩn hóa

Repo web tĩnh để triển khai bằng GitHub Pages hoặc chạy local bằng file HTML.

## Cách chạy local

Cách nhanh nhất: giải nén repo, mở trực tiếp `index.html` bằng Chrome/Edge/Firefox. Không cần cài server vì dữ liệu đề đã được nạp qua `data/exam-data.js`.

Nếu muốn chạy qua server cục bộ:

```bash
python -m http.server 8000
```

Sau đó mở `http://localhost:8000`.

## Cách deploy GitHub Pages

1. Tạo repository mới trên GitHub.
2. Upload toàn bộ thư mục này lên repo.
3. Vào Settings → Pages → chọn GitHub Actions.
4. Workflow `.github/workflows/pages.yml` sẽ tự build và publish.

## Tính năng

- 120 câu dạng text, không nhúng PDF.
- Hỗ trợ LaTeX bằng MathJax.
- Timer, đánh dấu câu, lọc câu chưa làm/đánh dấu.
- Các chế độ xem đề: làm bài từng câu, đọc đề theo phần/toàn văn, đề giấy A4 một cột để in/lưu PDF.
- Ghi nhớ chế độ xem, phần đang đọc và trạng thái bài làm trong trình duyệt.
- Lời giải và đáp án đúng bị khóa trước khi nộp bài.
- Sau khi nộp bài mới hiện điểm thô, đáp án, giải thích.
- `data/exam_only.txt`: bản đề không đáp án.
- `data/full_text_with_solutions.txt`: bản đầy đủ kèm lời giải để kiểm tra dữ liệu.
- `data/validation.json`: báo cáo kiểm tra dữ liệu.

## Chuẩn hóa dữ liệu

Sau khi chỉnh dữ liệu trong `data/exam.json`, chạy:

```bash
python tools/normalize_exam_data.py
```

Script sẽ chuẩn hóa khoảng trắng/xuống dòng an toàn và sinh lại `data/exam-data.js`, các bản `.txt`, `data/validation.json`, và `index-local.html`.

## Lưu ý

Điểm hiển thị sau khi nộp là số câu đúng/120, không phải điểm IRT.
