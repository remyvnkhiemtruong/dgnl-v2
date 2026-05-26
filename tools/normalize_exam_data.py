#!/usr/bin/env python3
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def normalize_text(value):
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00a0", " ").replace("\u200b", "")
    lines = []
    for line in text.split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        line = re.sub(r"\s+([,;:!?])", r"\1", line)
        line = re.sub(r",(?=[^\s\d])", ", ", line)
        line = re.sub(r"([;:!?])(?=\S)", r"\1 ", line)
        line = re.sub(r"\s+([.)\]])", r"\1", line)
        line = re.sub(r"([(\[])\s+", r"\1", line)
        lines.append(line)
    text = "\n".join(lines).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def question_text(question, include_solution=False):
    parts = []
    context = question.get("context", "").strip()
    if context:
        parts.append(context)
        parts.append("")
    parts.append(f"Câu {question['id']}: {question.get('prompt', '').strip()}")
    for option in question.get("options", []):
        parts.append(f"{option['key']}. {option.get('text', '').strip()}")
    if include_solution:
        answer = question.get("answer", "").strip()
        explanation = question.get("explanation", "").strip()
        parts.append(f"Đáp án {answer}")
        if explanation:
            parts.append(explanation)
    return normalize_text("\n".join(parts))


def build_text(exam, include_solution=False):
    chunks = []
    questions = exam["questions"]
    for section in exam["metadata"]["sections"]:
        chunks.append(section["name"])
        chunks.append("")
        section_questions = [q for q in questions if q.get("section") == section["name"]]
        last_context = None
        for question in section_questions:
            context = question.get("context", "").strip()
            if context and context != last_context:
                chunks.append(context)
                chunks.append("")
                last_context = context
            elif not context:
                last_context = None

            q_copy = dict(question)
            q_copy["context"] = ""
            chunks.append(question_text(q_copy, include_solution=include_solution))
            chunks.append("")
    return normalize_text("\n".join(chunks)) + "\n"


def validate(exam):
    questions = exam.get("questions", [])
    ids = [q.get("id") for q in questions]
    expected = set(range(1, exam.get("metadata", {}).get("questionCount", len(questions)) + 1))
    seen = set(i for i in ids if isinstance(i, int))

    def has_private_use(text):
        return any(0xE000 <= ord(ch) <= 0xF8FF for ch in text)

    all_text = json.dumps(exam, ensure_ascii=False)
    return {
        "questionCount": len(questions),
        "missingQuestions": sorted(expected - seen),
        "questionsWithoutFourOptions": [q.get("id") for q in questions if len(q.get("options", [])) != 4],
        "questionsWithoutAnswer": [q.get("id") for q in questions if not q.get("answer")],
        "replacementCharacters": all_text.count("\ufffd"),
        "puaRemaining": [q.get("id") for q in questions if has_private_use(json.dumps(q, ensure_ascii=False))],
        "tripleBlankLines": bool(re.search(r"\n{3,}", exam.get("examOnlyText", ""))),
        "lockedSolutionsUntilSubmit": True,
        "localFileMode": "index.html can run through file:// because data/exam-data.js assigns window.EXAM_DATA before app.js."
    }


def rebuild_local_html(exam_json_text):
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "assets" / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
    index = index.replace('  <link rel="stylesheet" href="assets/styles.css" />', f"  <style>\n{css}\n  </style>")
    scripts = '  <script src="data/exam-data.js"></script>\n  <script src="assets/app.js" defer></script>'
    inline = f"  <script>\nwindow.EXAM_DATA = {exam_json_text};\n  </script>\n  <script defer>\n{js}\n  </script>"
    if scripts not in index:
        raise RuntimeError("Could not find external script tags in index.html")
    return index.replace(scripts, inline)


def main():
    exam_path = DATA / "exam.json"
    exam = json.loads(exam_path.read_text(encoding="utf-8"))

    metadata = exam.setdefault("metadata", {})
    for key in ("title", "description", "sourceFile", "extractionNote"):
        if key in metadata:
            metadata[key] = normalize_text(metadata[key])
    metadata.setdefault("generatedAt", datetime.now(timezone.utc).isoformat())

    for section in metadata.get("sections", []):
        section["name"] = normalize_text(section.get("name", ""))

    for question in exam.get("questions", []):
        question["section"] = normalize_text(question.get("section", ""))
        question["context"] = normalize_text(question.get("context", ""))
        question["prompt"] = normalize_text(question.get("prompt", ""))
        question["answer"] = normalize_text(question.get("answer", ""))
        question["explanation"] = normalize_text(question.get("explanation", ""))
        for option in question.get("options", []):
            option["key"] = normalize_text(option.get("key", ""))
            option["text"] = normalize_text(option.get("text", ""))
        question["rawQuestion"] = question_text(question, include_solution=False)

    exam["examOnlyText"] = build_text(exam, include_solution=False)
    exam["fullTextWithSolutions"] = build_text(exam, include_solution=True)

    validation = validate(exam)
    exam_json_text = json.dumps(exam, ensure_ascii=False, indent=2)

    exam_path.write_text(exam_json_text + "\n", encoding="utf-8")
    (DATA / "exam-data.js").write_text(f"window.EXAM_DATA = {exam_json_text};\n", encoding="utf-8")
    (DATA / "exam_only.txt").write_text(exam["examOnlyText"], encoding="utf-8")
    (DATA / "full_text_with_solutions.txt").write_text(exam["fullTextWithSolutions"], encoding="utf-8")
    (DATA / "validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "index-local.html").write_text(rebuild_local_html(exam_json_text), encoding="utf-8")

    print(json.dumps(validation, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
