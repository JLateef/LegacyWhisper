import hashlib
import re

import cognee
from cognee.modules.search.types import SearchType
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/graph", tags=["graph"])

_NODE_BLOCK = re.compile(
    r"Node: (.+?)\n__node_content_start__\n(.*?)\n__node_content_end__",
    re.DOTALL,
)
_EDGE_LINE = re.compile(r"(.+?) --\[(.+?)\]--> (.+?)(?:\n|$)")


def _node_id(label: str) -> str:
    return hashlib.md5(label.strip().encode()).hexdigest()[:12]


def _parse_context(context_str: str) -> tuple[dict, list]:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    for name, content in _NODE_BLOCK.findall(context_str):
        name = name.strip()
        nid = _node_id(name)
        if nid not in nodes:
            nodes[nid] = {
                "id": nid,
                "label": name,
                "description": content.strip()[:300],
            }

    for source, label, target in _EDGE_LINE.findall(context_str):
        source, label, target = source.strip(), label.strip(), target.strip()
        sid, tid = _node_id(source), _node_id(target)
        for nid, nlabel in ((sid, source), (tid, target)):
            if nid not in nodes:
                nodes[nid] = {"id": nid, "label": nlabel, "description": ""}
        edges.append({"source": sid, "target": tid, "label": label})

    return nodes, edges


@router.get("")
async def get_graph(
    dataset_name: str = Query(default="legacy_interview"),
    query: str = Query(default="all entities and their relationships"),
    top_k: int = Query(default=50),
):
    try:
        results = await cognee.search(
            query_text=query,
            query_type=SearchType.GRAPH_COMPLETION,
            datasets=[dataset_name],
            top_k=top_k,
            only_context=True,
        )
    except Exception as exc:
        return {"nodes": [], "edges": [], "error": str(exc)}

    all_nodes: dict[str, dict] = {}
    all_edges: list[dict] = []

    for result in results:
        context_str = result if isinstance(result, str) else str(result)
        nodes, edges = _parse_context(context_str)
        all_nodes.update(nodes)
        all_edges.extend(edges)

    # Deduplicate edges
    seen_edges: set[tuple] = set()
    unique_edges = []
    for e in all_edges:
        key = (e["source"], e["target"], e["label"])
        if key not in seen_edges:
            seen_edges.add(key)
            unique_edges.append(e)

    return {"nodes": list(all_nodes.values()), "edges": unique_edges}
