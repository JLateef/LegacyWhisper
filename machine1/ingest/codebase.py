"""
Walks a local directory and extracts source file contents with annotated
interesting markers. Does not call any external services.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".next", ".nuxt", "vendor", ".tox", "coverage",
    ".pytest_cache", ".mypy_cache",
}

TEXT_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".rb", ".go", ".rs", ".java",
    ".kt", ".swift", ".c", ".cpp", ".h", ".cs", ".php", ".sh", ".bash",
    ".sql", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env",
    ".md", ".json",
}

MAX_LINES_FULL = 300
MAX_LINES_LARGE = 500  # hard cap — files above this are truncated to first+last 100 lines

_MARKER_PATTERNS: list[tuple[str, str, int]] = [
    # (pattern, marker_type, re_flags)
    (r"#\s*DO NOT TOUCH", "do_not_touch", re.IGNORECASE),
    (r"#\s*TODO|#\s*FIXME|#\s*HACK|#\s*XXX|#\s*BUG", "todo_marker", 0),
    (r"\btime\.sleep\s*\(\s*\d", "sleep_call", 0),
    (r"\bretry\b", "retry_pattern", re.IGNORECASE),
    (r"except\s*:\s*$|except\s+Exception\s*:\s*$|except\s+Exception\s+as\s+\w+\s*:\s*$", "broad_exception", 0),
    (r"temporary|temp fix|workaround|kludge|band.?aid|short.?term", "workaround_comment", re.IGNORECASE),
    (r"#\s*this used to|#\s*formerly|#\s*originally|#\s*used to be", "historical_comment", re.IGNORECASE),
    (r"hardcoded|hard.coded", "hardcoded_mention", re.IGNORECASE),
    (r"\b\d{9,10}\b", "large_number_possible_epoch", 0),  # epoch timestamps
    (r"(LEGACY|DEPRECATED|OLD)_", "legacy_identifier", re.IGNORECASE),
]


@dataclass
class FileMarker:
    line: int
    marker_type: str
    text: str


@dataclass
class SourceFile:
    path: str          # relative to codebase root
    content: str       # full or truncated content with line numbers
    line_count: int
    language: str
    markers: list[FileMarker] = field(default_factory=list)
    truncated: bool = False


def ingest_codebase(codebase_path: str) -> list[SourceFile]:
    """
    Walk a directory and return SourceFile objects for all readable source files.
    Files are sorted: those with markers first, then by path.
    """
    root = Path(codebase_path).resolve()
    files: list[SourceFile] = []

    for file_path in _walk(root):
        source_file = _read_file(file_path, root)
        if source_file is not None:
            files.append(source_file)

    # Sort: files with markers first (more interesting), then alphabetically
    files.sort(key=lambda f: (0 if f.markers else 1, f.path))
    return files


def _walk(root: Path):
    for item in sorted(root.iterdir()):
        if item.is_dir():
            if item.name not in SKIP_DIRS and not item.name.startswith("."):
                yield from _walk(item)
        elif item.is_file() and item.suffix in TEXT_EXTENSIONS:
            yield item


def _read_file(file_path: Path, root: Path) -> SourceFile | None:
    relative_path = str(file_path.relative_to(root)).replace("\\", "/")
    try:
        raw = file_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    lines = raw.splitlines()
    line_count = len(lines)
    language = _detect_language(file_path.suffix)
    markers = _find_markers(lines)

    if line_count <= MAX_LINES_FULL:
        content = _number_lines(lines)
        truncated = False
    elif line_count <= MAX_LINES_LARGE:
        # Include all lines but note the size
        content = _number_lines(lines[:MAX_LINES_FULL]) + f"\n... [{line_count - MAX_LINES_FULL} more lines truncated]"
        truncated = True
    else:
        # Large file: first 100 lines + last 100 lines + any marker windows
        head = lines[:100]
        tail = lines[-100:]
        marker_windows = _extract_marker_windows(lines, markers)
        content = (
            _number_lines(head)
            + f"\n... [{line_count - 200} lines omitted] ...\n"
            + _number_lines(tail, start=line_count - 99)
        )
        if marker_windows:
            content += "\n\n[EXCERPTS AROUND INTERESTING MARKERS]\n" + marker_windows
        truncated = True

    return SourceFile(
        path=relative_path,
        content=content,
        line_count=line_count,
        language=language,
        markers=markers,
        truncated=truncated,
    )


def _find_markers(lines: list[str]) -> list[FileMarker]:
    markers = []
    for lineno, line in enumerate(lines, start=1):
        for pattern, marker_type, flags in _MARKER_PATTERNS:
            if re.search(pattern, line, flags):
                markers.append(FileMarker(line=lineno, marker_type=marker_type, text=line.strip()))
                break  # one marker type per line is enough
    return markers


def _extract_marker_windows(lines: list[str], markers: list[FileMarker], window: int = 10) -> str:
    seen_lines: set[int] = set()
    excerpts: list[str] = []
    for marker in markers:
        start = max(0, marker.line - 1 - window)
        end = min(len(lines), marker.line + window)
        excerpt_lines = list(range(start, end))
        new_lines = [l for l in excerpt_lines if l not in seen_lines]
        if not new_lines:
            continue
        seen_lines.update(excerpt_lines)
        excerpt = _number_lines(lines[start:end], start=start + 1)
        excerpts.append(f"[around line {marker.line}: {marker.marker_type}]\n{excerpt}")
    return "\n\n".join(excerpts)


def _number_lines(lines: list[str], start: int = 1) -> str:
    return "\n".join(f"{start + i:4d} | {line}" for i, line in enumerate(lines))


def _detect_language(suffix: str) -> str:
    mapping = {
        ".py": "python", ".js": "javascript", ".ts": "typescript",
        ".tsx": "typescript", ".jsx": "javascript", ".rb": "ruby",
        ".go": "go", ".rs": "rust", ".java": "java", ".kt": "kotlin",
        ".swift": "swift", ".c": "c", ".cpp": "cpp", ".h": "c",
        ".cs": "csharp", ".php": "php", ".sh": "shell", ".bash": "shell",
        ".sql": "sql", ".yaml": "yaml", ".yml": "yaml",
    }
    return mapping.get(suffix, "text")


def get_file_excerpt(files: list[SourceFile], file_path: str, line: int, window: int = 15) -> str:
    """Return ±window lines around a specific line in a file."""
    for f in files:
        if f.path == file_path:
            raw_lines = [l[7:] for l in f.content.splitlines() if "|" in l]  # strip line numbers
            start = max(0, line - 1 - window)
            end = min(len(raw_lines), line + window)
            return _number_lines(raw_lines[start:end], start=start + 1)
    return f"[File {file_path} not found in ingested codebase]"
