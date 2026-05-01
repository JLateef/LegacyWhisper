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

import os
import shutil
import sys
import tempfile
import zipfile
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


@app.route("/api/questions", methods=["GET", "POST"])
def api_questions():
    """
    Run Machine 1 to generate interview questions.

    POST with multipart form data to analyze uploaded files:
      codebase  — ZIP of source files (required to use custom codebase)
      commits   — git log text file (optional, improves question quality)
      tickets   — tickets CSV file  (optional, improves question quality)

    GET (or POST with no files) falls back to the built-in sample codebase.
    """
    codebase_file = request.files.get("codebase")
    commits_file  = request.files.get("commits")
    tickets_file  = request.files.get("tickets")

    tmp_dir = None
    try:
        if codebase_file and codebase_file.filename:
            tmp_dir = tempfile.mkdtemp()

            # Extract uploaded ZIP
            zip_path = os.path.join(tmp_dir, "upload.zip")
            codebase_file.save(zip_path)
            code_dir = os.path.join(tmp_dir, "code")
            os.makedirs(code_dir)
            with zipfile.ZipFile(zip_path, "r") as z:
                z.extractall(code_dir)

            commit_log_path = None
            tickets_path = None

            if commits_file and commits_file.filename:
                commit_log_path = os.path.join(tmp_dir, "commits.txt")
                commits_file.save(commit_log_path)

            if tickets_file and tickets_file.filename:
                tickets_path = os.path.join(tmp_dir, "tickets.csv")
                tickets_file.save(tickets_path)

            print(f"\nMachine 1 starting — analyzing uploaded codebase...")
            questions, signals = generate_questions(
                codebase_path=code_dir,
                commit_log_path=commit_log_path,
                tickets_path=tickets_path,
                verbose=True,
            )
        else:
            print("\nMachine 1 starting — analyzing sample_codebase/...")
            questions, signals = generate_questions(
                codebase_path=str(SAMPLE_DIR),
                commit_log_path=str(SAMPLE_DIR / "commit_history.txt"),
                tickets_path=str(SAMPLE_DIR / "tickets.csv"),
                verbose=True,
            )

        print(f"Machine 1 done — {len(questions)} questions from {len(signals)} signals\n")
        return jsonify([asdict(q) for q in questions])

    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


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
