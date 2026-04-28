import React, { useState, useEffect, useCallback } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Deterministic circular layout — stable across re-renders
function computeLayout(nodes, width, height) {
  if (!nodes.length) return {};
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.38;
  const positions = {};
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    positions[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  return positions;
}

function GraphCanvas({ nodes, edges, selectedId, onSelect }) {
  const W = 640, H = 500;
  const positions = computeLayout(nodes, W, H);

  const connectedTo = selectedId
    ? new Set(
        edges
          .filter(e => e.source === selectedId || e.target === selectedId)
          .flatMap(e => [e.source, e.target])
      )
    : null;

  const nodeColor = (id) => {
    if (!selectedId) return '#6366f1';
    if (id === selectedId) return '#f59e0b';
    if (connectedTo?.has(id)) return '#10b981';
    return '#cbd5e1';
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Edges */}
      {edges.map((edge, i) => {
        const s = positions[edge.source];
        const t = positions[edge.target];
        if (!s || !t) return null;
        const dimmed = selectedId && !connectedTo?.has(edge.source) && !connectedTo?.has(edge.target);
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        return (
          <g key={i} opacity={dimmed ? 0.15 : 0.7}>
            <line
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="#94a3b8" strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            {edge.label && (
              <text x={mx} y={my - 4} textAnchor="middle" fontSize="9" fill="#64748b"
                className="pointer-events-none select-none">
                {edge.label.length > 22 ? edge.label.slice(0, 22) + '…' : edge.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const p = positions[node.id];
        if (!p) return null;
        const dimmed = selectedId && !connectedTo?.has(node.id) && node.id !== selectedId;
        const label = node.label.length > 28 ? node.label.slice(0, 28) + '…' : node.label;
        return (
          <g key={node.id} onClick={() => onSelect(node.id === selectedId ? null : node.id)}
            className="cursor-pointer" opacity={dimmed ? 0.2 : 1}>
            <circle cx={p.x} cy={p.y} r={18} fill={nodeColor(node.id)}
              stroke="white" strokeWidth="2" />
            <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize="10" fill="#334155"
              className="pointer-events-none select-none">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function KnowledgeGraphView() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [queryText, setQueryText] = useState('');
  const [queryResults, setQueryResults] = useState([]);
  const [queryLoading, setQueryLoading] = useState(false);

  const fetchGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError('');
    try {
      const res = await fetch(`${BACKEND}/api/graph`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGraphData(data);
    } catch (e) {
      setGraphError(e.message);
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  const handleQuery = async (e) => {
    e.preventDefault();
    if (!queryText.trim()) return;
    setQueryLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_text: queryText,
          search_type: 'GRAPH_COMPLETION',
          dataset_name: 'legacy_interview',
          top_k: 5,
        }),
      });
      const data = await res.json();
      setQueryResults(data.results || []);
    } catch (e) {
      setQueryResults([`Error: ${e.message}`]);
    } finally {
      setQueryLoading(false);
    }
  };

  const selectedNode = graphData.nodes.find(n => n.id === selectedId);
  const connectedEdges = selectedId
    ? graphData.edges.filter(e => e.source === selectedId || e.target === selectedId)
    : [];

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Left panel — query + node detail */}
      <div className="w-96 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Knowledge Graph</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </p>
        </div>

        {/* Query box */}
        <div className="px-4 py-4 border-b border-slate-100">
          <form onSubmit={handleQuery} className="flex gap-2">
            <input
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
              placeholder="Ask about the documents…"
              className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={queryLoading || !queryText.trim()}
              className="text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 font-medium"
            >
              {queryLoading ? '…' : 'Ask'}
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Query results */}
          {queryResults.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Answer</p>
              {queryResults.map((r, i) => (
                <div key={i} className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 text-xs text-slate-700 leading-relaxed mb-2">
                  {r}
                </div>
              ))}
            </div>
          )}

          {/* Selected node detail */}
          {selectedNode ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Selected entity</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
                <p className="text-sm font-semibold text-slate-800 mb-1">{selectedNode.label}</p>
                {selectedNode.description && (
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">{selectedNode.description}</p>
                )}
                {connectedEdges.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1">Connections</p>
                    <div className="space-y-1">
                      {connectedEdges.map((e, i) => {
                        const otherId = e.source === selectedId ? e.target : e.source;
                        const other = graphData.nodes.find(n => n.id === otherId);
                        const dir = e.source === selectedId ? '→' : '←';
                        return (
                          <div key={i} className="text-xs text-slate-600 flex items-center gap-1">
                            <span className="text-indigo-500 font-mono">{dir}</span>
                            <span className="text-slate-400">[{e.label}]</span>
                            <button
                              onClick={() => setSelectedId(otherId)}
                              className="text-indigo-600 hover:underline truncate"
                            >
                              {other?.label || otherId}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            !queryResults.length && (
              <div className="text-center py-6 text-slate-400">
                <div className="text-3xl mb-2">⬡</div>
                <p className="text-xs">Click a node to see details<br />or ask a question above.</p>
                {graphData.nodes.length === 0 && !graphLoading && (
                  <p className="text-xs text-amber-500 mt-2">
                    No graph data yet.<br />Upload documents and click "Build Knowledge Graph".
                  </p>
                )}
              </div>
            )
          )}
        </div>

        {/* Refresh button */}
        <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3">
          <button
            onClick={fetchGraph}
            disabled={graphLoading}
            className="w-full text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-2 transition-colors font-medium disabled:opacity-50"
          >
            {graphLoading ? 'Loading graph…' : '↻ Refresh graph'}
          </button>
          {graphError && <p className="text-xs text-rose-500 mt-1 text-center">{graphError}</p>}
        </div>
      </div>

      {/* Right panel — SVG graph */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-4 min-w-0">
        {graphLoading ? (
          <div className="text-center text-slate-400">
            <svg className="animate-spin w-8 h-8 mx-auto mb-2 text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
            <p className="text-sm">Fetching knowledge graph…</p>
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="text-center text-slate-400 max-w-xs">
            <div className="text-6xl mb-4 opacity-30">⬡</div>
            <p className="text-sm font-medium text-slate-500 mb-1">Graph is empty</p>
            <p className="text-xs">Go to Documents, upload files, and click<br />"Build Knowledge Graph" to populate this view.</p>
          </div>
        ) : (
          <div className="w-full h-full">
            <GraphCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
