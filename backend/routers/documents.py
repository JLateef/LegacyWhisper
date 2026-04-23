import uuid
import os
from pathlib import Path
from typing import Annotated

import aiofiles
import cognee
from cognee.modules.search.types import SearchType
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

router = APIRouter(prefix="/api/documents", tags=["documents"])

# In-memory registry: doc_id → {path, name, size_bytes, content_type, status}
_registry: dict[str, dict] = {}

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))


def _upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


class IngestRequest(BaseModel):
    doc_ids: list[str]
    dataset_name: str = "legacy_interview"


@router.post("/upload")
async def upload_documents(files: Annotated[list[UploadFile], File()]):
    results = []
    for file in files:
        doc_id = str(uuid.uuid4())
        safe_name = Path(file.filename).name if file.filename else "unnamed"
        dest = _upload_dir() / f"{doc_id}_{safe_name}"

        content = await file.read()
        async with aiofiles.open(dest, "wb") as f:
            await f.write(content)

        record = {
            "id": doc_id,
            "name": safe_name,
            "path": str(dest),
            "size_bytes": len(content),
            "content_type": file.content_type or "application/octet-stream",
            "status": "uploaded",
        }
        _registry[doc_id] = record
        results.append({k: v for k, v in record.items() if k != "path"})

    return results


@router.post("/ingest")
async def ingest_documents(body: IngestRequest):
    missing = [d for d in body.doc_ids if d not in _registry]
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown doc IDs: {missing}")

    # cognee's ingestion only accepts str, not pathlib.Path — pass absolute path strings.
    # Single cognee.add() call with a list avoids UNIQUE constraint on dataset_database.
    paths = [str(Path(_registry[doc_id]["path"]).resolve()) for doc_id in body.doc_ids]

    # Verify files actually exist before handing off to cognee
    missing_files = [p for p in paths if not Path(p).is_file()]
    if missing_files:
        raise HTTPException(status_code=422, detail=f"Files not found on disk: {missing_files}")

    try:
        await cognee.add(data=paths, dataset_name=body.dataset_name)
        await cognee.cognify(datasets=[body.dataset_name])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cognee ingestion failed: {exc}") from exc

    for doc_id in body.doc_ids:
        _registry[doc_id]["status"] = "ingested"

    return {"status": "ok", "message": "Ingestion complete.", "count": len(body.doc_ids)}


@router.get("")
async def list_documents():
    return [
        {k: v for k, v in rec.items() if k != "path"}
        for rec in _registry.values()
    ]


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    if doc_id not in _registry:
        raise HTTPException(status_code=404, detail="Document not found.")
    record = _registry.pop(doc_id)
    path = Path(record["path"])
    if path.exists():
        path.unlink()
    return {"ok": True}
