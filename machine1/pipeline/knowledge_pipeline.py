"""
Post-interview knowledge extraction pipeline.

Three functions:
  extract_knowledge()      - transcript segments → KnowledgeItem list (Claude)
  link_code_references()   - attach code locations via regex scan (no AST)
  generate_output()        - KnowledgeItem list → (markdown, json_dict)
"""

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import anthropic

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

MIN_CONFIDENCE = 0.6
MAX_CODE_REFS_PER_ITEM = 3
MAX_TOKENS = 2048

CATEGORY_BADGES = {
    "decision": "🏗",
    "gotcha": "⚠️",
    "risk": "🔴",
    "pattern": "📐",
    "context": "📝",
}

TEXT_EXTENSIONS = {
    ".py", ".js", ".ts", ".go", ".rb", ".java",
    ".yaml", ".yml", ".toml", ".json", ".md", ".sh",
}
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv",
    "venv", "dist", "build", ".next",
}


# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class CodeReference:
    file: str
    line_start: int
    line_end: int
    match_type: str  # exact_function | variable_name | file_mention
    excerpt: str     # 1-2 lines of context, truncated


@dataclass
class KnowledgeItem:
    id: str
    category: str    # decision | gotcha | risk | pattern | context
    title: str       # max 10 words
    body: str        # 1-2 paragraphs
    confidence: float
    source_text: str
    code_references: List[CodeReference] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    question_id: Optional[str] = None


# ── 1. Knowledge extraction ────────────────────────────────────────────────────

def extract_knowledge(transcript_segments: List[Dict]) -> List[KnowledgeItem]:
    """
    Convert raw transcript segments into classified KnowledgeItems.

    Filters engineer turns shorter than 10 words and items with
    confidence < MIN_CONFIDENCE. Makes one Claude call per Q&A pair.
    """
    system_prompt = (PROMPTS_DIR / "step2_extract_system.txt").read_text(encoding="utf-8")
    user_template = (PROMPTS_DIR / "step2_extract_user_template.txt").read_text(encoding="utf-8")

    pairs = _group_by_question(transcript_segments)
    client = anthropic.Anthropic()
    items: List[KnowledgeItem] = []

    for question_text, engineer_text, question_id in pairs:
        if not engineer_text.strip() or len(engineer_text.split()) < 10:
            continue

        user_prompt = user_template.format(
            question_text=question_text,
            engineer_text=engineer_text,
        )

        raw = _call_claude(client, system_prompt, user_prompt)
        result = _parse_json_response(raw)

        if not result or not result.get("extracted"):
            continue

        confidence = float(result.get("confidence", 0.0))
        if confidence < MIN_CONFIDENCE:
            continue

        items.append(KnowledgeItem(
            id=str(uuid.uuid4()),
            category=_validate_category(result.get("category", "context")),
            title=_truncate_title(result.get("title", "Untitled")),
            body=result.get("body", ""),
            confidence=confidence,
            source_text=engineer_text[:600],
            tags=result.get("tags") or [],
            question_id=question_id,
        ))

    return items


def _group_by_question(
    segments: List[Dict],
) -> List[Tuple[str, str, Optional[str]]]:
    """
    Returns list of (question_text, engineer_text, question_id).

    Uses question_id grouping when available; falls back to proximity pairing.
    """
    if any(s.get("question_id") for s in segments):
        groups: Dict[str, Dict] = {}
        for seg in segments:
            qid = seg.get("question_id") or "__none__"
            if qid not in groups:
                groups[qid] = {"ai": [], "engineer": []}
            if seg.get("speaker") == "ai":
                groups[qid]["ai"].append(seg.get("text", ""))
            elif seg.get("speaker") == "engineer":
                groups[qid]["engineer"].append(seg.get("text", ""))

        result = []
        for qid, g in groups.items():
            e_text = " ".join(g["engineer"]).strip()
            if e_text:
                result.append((
                    " ".join(g["ai"]).strip(),
                    e_text,
                    qid if qid != "__none__" else None,
                ))
        return result

    # Proximity fallback: each engineer turn paired with the preceding AI turn
    result = []
    last_ai = ""
    for seg in segments:
        if seg.get("speaker") == "ai":
            last_ai = seg.get("text", "")
        elif seg.get("speaker") == "engineer":
            e_text = seg.get("text", "")
            if e_text:
                result.append((last_ai, e_text, seg.get("question_id")))
    return result


def _call_claude(client: anthropic.Anthropic, system: str, user: str) -> str:
    with client.messages.stream(
        model="claude-opus-4-7",
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        return stream.get_final_text()


def _parse_json_response(raw: str) -> Optional[Dict]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _validate_category(raw: str) -> str:
    valid = {"decision", "gotcha", "risk", "pattern", "context"}
    return raw if raw in valid else "context"


def _truncate_title(title: str, max_words: int = 10) -> str:
    words = title.split()
    return " ".join(words[:max_words]) if len(words) > max_words else title


# ── 2. Code reference linking ──────────────────────────────────────────────────

def link_code_references(
    items: List[KnowledgeItem], codebase_path: str
) -> List[KnowledgeItem]:
    """
    For each item, find code locations it refers to by scanning the codebase
    for identifiers mentioned in the item body and source text.

    Strategy: regex extraction + string matching. No AST, no embeddings.
    Attaches up to MAX_CODE_REFS_PER_ITEM references per item.
    """
    index = _build_file_index(codebase_path)

    for item in items:
        search_text = f"{item.body} {item.source_text}"
        refs = _find_references(search_text, index)
        item.code_references = refs[:MAX_CODE_REFS_PER_ITEM]

    return items


def _build_file_index(codebase_path: str) -> Dict[str, List[Tuple[int, str]]]:
    """Returns {relative_path: [(line_no, line_text), ...]} for all source files."""
    root = Path(codebase_path).resolve()
    index: Dict[str, List[Tuple[int, str]]] = {}

    for file_path in _walk_source_files(root):
        rel = str(file_path.relative_to(root)).replace("\\", "/")
        try:
            lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
            index[rel] = [(i + 1, line) for i, line in enumerate(lines)]
        except OSError:
            pass

    return index


def _walk_source_files(root: Path):
    for item in sorted(root.iterdir()):
        if item.is_dir():
            if item.name not in SKIP_DIRS and not item.name.startswith("."):
                yield from _walk_source_files(item)
        elif item.is_file() and item.suffix in TEXT_EXTENSIONS:
            yield item


def _find_references(
    text: str, index: Dict[str, List[Tuple[int, str]]]
) -> List[CodeReference]:
    """
    Extract identifiers from text, scan index, return deduplicated matches
    ranked: exact_function > variable_name > file_mention.
    """
    refs: List[CodeReference] = []

    # 1. Explicit file path mentions (e.g., "transformers.py", "connectors/warehouse.py")
    for mention in set(re.findall(r'\b([\w./]+\.(?:py|js|ts|go|rb|yaml|yml|json))\b', text)):
        mention = mention.lstrip("./")
        for file_path, lines in index.items():
            if file_path.endswith(mention) or mention in file_path:
                refs.append(CodeReference(
                    file=file_path,
                    line_start=1,
                    line_end=1,
                    match_type="file_mention",
                    excerpt=lines[0][1].strip()[:120] if lines else "",
                ))

    # 2. ALL_CAPS identifiers — constants and config keys (e.g., SYNC_CHUNK_SIZE)
    for ident in set(re.findall(r'\b([A-Z][A-Z_0-9]{2,})\b', text)):
        for file_path, lines in index.items():
            for lineno, line in lines:
                if ident in line:
                    refs.append(CodeReference(
                        file=file_path,
                        line_start=lineno,
                        line_end=lineno,
                        match_type="variable_name",
                        excerpt=line.strip()[:120],
                    ))

    # 3. Function calls with parentheses — e.g., normalize_price()
    for name in set(re.findall(r'\b([a-z_][a-z0-9_]{3,})\s*\(', text)):
        for file_path, lines in index.items():
            for lineno, line in lines:
                if f"def {name}" in line:
                    refs.append(CodeReference(
                        file=file_path,
                        line_start=lineno,
                        line_end=lineno,
                        match_type="exact_function",
                        excerpt=line.strip()[:120],
                    ))

    # 4. Longer snake_case identifiers mentioned in prose (len >= 8)
    # Catches function names like send_to_warehouse_v2 without parentheses
    for name in set(re.findall(r'\b([a-z_][a-z0-9_]{7,})\b', text)):
        for file_path, lines in index.items():
            for lineno, line in lines:
                if f"def {name}" in line:
                    refs.append(CodeReference(
                        file=file_path,
                        line_start=lineno,
                        line_end=lineno,
                        match_type="exact_function",
                        excerpt=line.strip()[:120],
                    ))

    # 5. PascalCase class names (e.g., StorefrontConflictError)
    for name in set(re.findall(r'\b([A-Z][a-z][A-Za-z0-9]{3,})\b', text)):
        for file_path, lines in index.items():
            for lineno, line in lines:
                if f"class {name}" in line or (name in line and "class" not in line):
                    refs.append(CodeReference(
                        file=file_path,
                        line_start=lineno,
                        line_end=lineno,
                        match_type="variable_name",
                        excerpt=line.strip()[:120],
                    ))

    # Deduplicate by (file, line) and rank
    rank = {"exact_function": 0, "variable_name": 1, "file_mention": 2}
    refs.sort(key=lambda r: rank.get(r.match_type, 9))
    seen: set = set()
    deduped: List[CodeReference] = []
    for ref in refs:
        key = (ref.file, ref.line_start)
        if key not in seen:
            seen.add(key)
            deduped.append(ref)

    return deduped


# ── 3. Output generation ───────────────────────────────────────────────────────

CATEGORY_COLORS = {
    "gotcha":   {"border": "#f59e0b", "bg": "#fef3c7", "text": "#92400e"},
    "decision": {"border": "#3b82f6", "bg": "#dbeafe", "text": "#1e40af"},
    "risk":     {"border": "#ef4444", "bg": "#fee2e2", "text": "#991b1b"},
    "pattern":  {"border": "#8b5cf6", "bg": "#f3e8ff", "text": "#6b21a8"},
    "context":  {"border": "#94a3b8", "bg": "#f1f5f9", "text": "#475569"},
}

# Tabs shown in this order; risks and gotchas lead because they're most urgent
TAB_CONFIG = [
    ("all",      "All"),
    ("risk",     "🔴 Risk"),
    ("gotcha",   "⚠️ Gotcha"),
    ("decision", "🏗 Decision"),
    ("pattern",  "📐 Pattern"),
    ("context",  "📝 Context"),
]
CATEGORY_ORDER = {"risk": 0, "gotcha": 1, "decision": 2, "pattern": 3, "context": 4}


def generate_output(
    items: List[KnowledgeItem], project_name: str = "Project"
) -> Tuple[str, str, Dict]:
    """
    Returns (html_string, markdown_string, json_dict).
    Both documents are grouped by primary file reference.
    JSON is a flat list of all items with full metadata.
    """
    return _build_html(items, project_name), _build_markdown(items, project_name), _build_json(items)


def _build_html(items: List[KnowledgeItem], project_name: str) -> str:
    sorted_items = sorted(items, key=lambda i: CATEGORY_ORDER.get(i.category, 99))

    counts: Dict[str, int] = {}
    for item in items:
        counts[item.category] = counts.get(item.category, 0) + 1

    tabs_html = ""
    for cat_id, label in TAB_CONFIG:
        if cat_id != "all" and cat_id not in counts:
            continue
        n = len(items) if cat_id == "all" else counts[cat_id]
        active = " active" if cat_id == "all" else ""
        tabs_html += f'<button class="tab{active}" onclick="filterTab(\'{cat_id}\',this)">{label} <span class="cnt">{n}</span></button>\n'

    items_html = "".join(_render_item_html(i) for i in sorted_items)
    today = date.today().isoformat()

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Handoff Doc — {project_name}</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;line-height:1.5}}
    code{{font-family:'SF Mono','Fira Code','Consolas',monospace}}
    .hdr{{background:#0f172a;color:#fff;padding:20px 40px;display:flex;justify-content:space-between;align-items:flex-end}}
    .hdr-label{{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b;margin-bottom:4px}}
    .hdr-title{{font-size:22px;font-weight:700}}
    .hdr-meta{{font-size:12px;color:#64748b;text-align:right;line-height:1.8}}
    .tabs{{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e2e8f0;padding:0 40px;display:flex;gap:2px;overflow-x:auto}}
    .tab{{padding:12px 14px;font-size:13px;font-weight:500;color:#64748b;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;transition:color .15s,border-color .15s;white-space:nowrap}}
    .tab:hover{{color:#334155}}
    .tab.active{{color:#0f172a;border-bottom-color:#f59e0b}}
    .cnt{{display:inline-block;background:#f1f5f9;color:#64748b;font-size:11px;font-weight:600;padding:1px 7px;border-radius:99px;margin-left:5px}}
    .tab.active .cnt{{background:#fef3c7;color:#92400e}}
    .content{{max-width:860px;margin:0 auto;padding:32px 40px}}
    .item{{background:#fff;border-left:4px solid #e2e8f0;border-radius:0 10px 10px 0;padding:20px 24px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s}}
    .item:hover{{box-shadow:0 4px 14px rgba(0,0,0,.09)}}
    .item-top{{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap}}
    .badge{{font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;letter-spacing:.2px}}
    .refs{{display:flex;gap:6px;flex-wrap:wrap}}
    .ref{{font-size:12px;background:#f1f5f9;color:#475569;padding:3px 8px;border-radius:4px}}
    .item-title{{font-size:16px;font-weight:600;color:#0f172a;margin-bottom:10px;line-height:1.4}}
    .item-body{{font-size:14px;color:#475569;line-height:1.8;margin-bottom:14px}}
    .item-foot{{display:flex;align-items:center;gap:8px;flex-wrap:wrap}}
    .conf{{font-size:12px;color:#94a3b8}}
    .tag{{font-size:11px;background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:99px}}
    .cat-risk    {{border-left-color:#ef4444}} .badge-risk    {{background:#fee2e2;color:#991b1b}}
    .cat-gotcha  {{border-left-color:#f59e0b}} .badge-gotcha  {{background:#fef3c7;color:#92400e}}
    .cat-decision{{border-left-color:#3b82f6}} .badge-decision{{background:#dbeafe;color:#1e40af}}
    .cat-pattern {{border-left-color:#8b5cf6}} .badge-pattern {{background:#f3e8ff;color:#6b21a8}}
    .cat-context {{border-left-color:#94a3b8}} .badge-context {{background:#f1f5f9;color:#475569}}
    .footer{{background:#f1f5f9;border-top:1px solid #e2e8f0;padding:16px 40px;font-size:12px;color:#94a3b8;margin-top:16px}}
  </style>
</head>
<body>

<div class="hdr">
  <div>
    <div class="hdr-label">Legacy Whisperer</div>
    <div class="hdr-title">Handoff Doc — {project_name}</div>
  </div>
  <div class="hdr-meta">{today}<br>{len(items)} knowledge items</div>
</div>

<div class="tabs">{tabs_html}</div>

<div class="content">{items_html}</div>

<div class="footer">Legacy Whisperer · {project_name} · {today}</div>

<script>
  function filterTab(cat, el) {{
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.item').forEach(item => {{
      item.hidden = cat !== 'all' && item.dataset.cat !== cat;
    }});
  }}
</script>
</body>
</html>"""


def _render_item_html(item: KnowledgeItem) -> str:
    badge = CATEGORY_BADGES.get(item.category, "📝")

    refs_html = "".join(
        f'<code class="ref">{r.file}:{r.line_start}</code>'
        for r in item.code_references[:2]
    )

    tags_html = "".join(
        f'<span class="tag">{t}</span>' for t in item.tags
    )

    return f"""
    <div class="item cat-{item.category}" data-cat="{item.category}">
      <div class="item-top">
        <span class="badge badge-{item.category}">{badge} {item.category.upper()}</span>
        <div class="refs">{refs_html}</div>
      </div>
      <h3 class="item-title">{item.title}</h3>
      <p class="item-body">{item.body}</p>
      <div class="item-foot">
        <span class="conf">{item.confidence:.0%} confidence</span>
        {tags_html}
      </div>
    </div>"""


def _build_markdown(items: List[KnowledgeItem], project_name: str) -> str:
    lines = [
        f"# Handoff Doc — {project_name}",
        f"\n_Generated {date.today().isoformat()} · {len(items)} knowledge items extracted from interview_\n",
        "---\n",
    ]

    by_file: Dict[str, List[KnowledgeItem]] = {}
    ungrouped: List[KnowledgeItem] = []

    for item in items:
        if item.code_references:
            key = item.code_references[0].file
            by_file.setdefault(key, []).append(item)
        else:
            ungrouped.append(item)

    for file_path in sorted(by_file.keys()):
        lines.append(f"\n## {file_path}\n")
        for item in by_file[file_path]:
            lines.extend(_render_item(item))

    if ungrouped:
        lines.append("\n## General\n")
        for item in ungrouped:
            lines.extend(_render_item(item))

    return "\n".join(lines)


def _render_item(item: KnowledgeItem) -> List[str]:
    badge = CATEGORY_BADGES.get(item.category, "📝")
    out = []

    out.append(f"### {badge} **{item.category.capitalize()} — {item.title}**\n")

    for ref in item.code_references[:2]:
        out.append(
            f"> [`{ref.file}:{ref.line_start}`]({ref.file}#L{ref.line_start})"
            f"  `{ref.excerpt[:70]}`\n"
        )

    out.append(f"{item.body}\n")

    meta = [f"Confidence: {item.confidence:.0%}"]
    if item.tags:
        meta.append(f"Tags: {', '.join(item.tags)}")
    out.append(f"_{' · '.join(meta)}_\n")
    out.append("---\n")

    return out


def _build_json(items: List[KnowledgeItem]) -> Dict:
    return {
        "generated": date.today().isoformat(),
        "item_count": len(items),
        "items": [
            {
                "id": item.id,
                "category": item.category,
                "title": item.title,
                "body": item.body,
                "confidence": round(item.confidence, 3),
                "source_text": item.source_text,
                "code_references": [
                    {
                        "file": ref.file,
                        "line_start": ref.line_start,
                        "line_end": ref.line_end,
                        "match_type": ref.match_type,
                        "excerpt": ref.excerpt,
                    }
                    for ref in item.code_references
                ],
                "tags": item.tags,
                "question_id": item.question_id,
            }
            for item in items
        ],
    }
