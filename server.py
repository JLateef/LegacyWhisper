#!/usr/bin/env python3
"""
Legacy Whisperer — demo server.

Serves the React build and connects Machine 1 + knowledge extraction pipeline.

Usage:
    pip install flask
    npm run build        # only needed once, or when frontend changes
    python server.py
    Open http://localhost:5001
"""

import sys
from dataclasses import asdict
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

# Add machine1 to the import path
MACHINE1_DIR = Path(__file__).parent / "machine1"
sys.path.insert(0, str(MACHINE1_DIR))

from generate_questions import generate_questions
from pipeline.knowledge_pipeline import (
    extract_knowledge,
    generate_output,
    link_code_references,
)

SAMPLE_DIR = MACHINE1_DIR / "sample_codebase"
DIST_DIR = Path(__file__).parent / "dist"

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="")


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/")
def index():
    return send_from_directory(DIST_DIR, "index.html")


@app.route("/api/questions")
def api_questions():
    """Run Machine 1 against the sample codebase. Takes ~60-90 seconds."""
    print("\nMachine 1 starting — analyzing sample_codebase/...")
    questions, signals = generate_questions(
        codebase_path=str(SAMPLE_DIR),
        commit_log_path=str(SAMPLE_DIR / "commit_history.txt"),
        tickets_path=str(SAMPLE_DIR / "tickets.csv"),
        verbose=True,
    )
    print(f"Machine 1 done — {len(questions)} questions from {len(signals)} signals\n")
    return jsonify([asdict(q) for q in questions])


@app.route("/api/extract", methods=["POST"])
def api_extract():
    """Run the knowledge extraction pipeline on the interview transcript."""
    data = request.get_json()
    messages = data.get("transcript", [])
    project_name = data.get("projectName", "Catalog Sync Service")

    # Transform frontend message format → pipeline format
    segments = [
        {
            "speaker": "ai" if m["role"] == "ai" else "engineer",
            "text": m["content"],
            "question_id": m.get("questionTag", ""),
        }
        for m in messages
    ]

    print(f"\nExtracting knowledge from {len(segments)} transcript segments...")
    items = extract_knowledge(segments)
    items = link_code_references(items, str(SAMPLE_DIR))
    html, _, json_data = generate_output(items, project_name)
    print(f"Extraction done — {len(items)} knowledge items\n")

    return jsonify({"html": html, "items": json_data})


if __name__ == "__main__":
    if not DIST_DIR.exists():
        print("ERROR: dist/ not found. Run 'npm run build' first.")
        sys.exit(1)
    if not (SAMPLE_DIR / "commit_history.txt").exists():
        print("ERROR: sample_codebase/commit_history.txt not found.")
        sys.exit(1)
    print("Legacy Whisperer demo server")
    print("Open http://localhost:5001")
    print("ANTHROPIC_API_KEY must be set in your environment.\n")
    app.run(port=5001, debug=False)
