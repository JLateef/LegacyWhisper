import cognee
from cognee.modules.search.types import SearchType
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["query"])


class QueryRequest(BaseModel):
    query_text: str
    search_type: str = "GRAPH_COMPLETION"
    dataset_name: str = "legacy_interview"
    top_k: int = 10


@router.post("/query")
async def query_knowledge(body: QueryRequest):
    try:
        stype = SearchType[body.search_type]
    except KeyError:
        valid = [s.name for s in SearchType]
        raise HTTPException(status_code=400, detail=f"Invalid search_type. Valid values: {valid}")

    results = await cognee.search(
        query_text=body.query_text,
        query_type=stype,
        datasets=[body.dataset_name],
        top_k=body.top_k,
    )

    # Normalise results to a list of strings for consistent serialisation
    serialised = []
    for r in results:
        if isinstance(r, str):
            serialised.append(r)
        elif hasattr(r, "model_dump"):
            serialised.append(str(r.model_dump()))
        else:
            serialised.append(str(r))

    return {"results": serialised}


@router.get("/datasets")
async def list_datasets():
    # Returns distinct dataset names registered via the document upload flow
    from routers.documents import _registry
    names = {rec.get("dataset_name", "legacy_interview") for rec in _registry.values()}
    return sorted(names) or ["legacy_interview"]
