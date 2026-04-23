import React, { useState, useRef } from 'react';
import { KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

const TAGS = Object.entries(KNOWLEDGE_TAG_LABELS).map(([id, label]) => ({ id, label }));
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const BINARY_EXTS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.odt', '.epub', '.eml', '.msg']);

function ext(filename) {
  const m = filename.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : '';
}

function isBinary(filename) {
  return BINARY_EXTS.has(ext(filename));
}

function uploadStatusBadge(status) {
  const cfg = {
    local:      { label: 'local',      cls: 'bg-slate-100 text-slate-500' },
    uploading:  { label: 'uploading…', cls: 'bg-amber-100 text-amber-600' },
    uploaded:   { label: 'uploaded',   cls: 'bg-blue-100 text-blue-600' },
    ingested:   { label: 'in graph',   cls: 'bg-emerald-100 text-emerald-700' },
    failed:     { label: 'upload failed', cls: 'bg-rose-100 text-rose-600' },
  };
  const { label, cls } = cfg[status] || cfg.local;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function extractMentionedNames(text) {
  const pairs = text.match(/\b[A-Z][a-z]{1,20}(?:\s[A-Z][a-z]{1,20})+\b/g) || [];
  return [...new Set(pairs)].slice(0, 10);
}

function DocumentCard({ doc, onDelete, onTag }) {
  const [expanded, setExpanded] = useState(false);
  const names = extractMentionedNames(doc.content || '');

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-3 flex-1 text-left">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
            doc.type === 'email' ? 'bg-blue-100 text-blue-600' :
            doc.type === 'chat' ? 'bg-emerald-100 text-emerald-600' :
            'bg-slate-100 text-slate-600'
          }`}>
            {doc.type === 'email' ? '✉' : doc.type === 'chat' ? '💬' : '📄'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900 truncate">{doc.name}</div>
            <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
              <span>{doc.type?.toUpperCase() || 'FILE'}</span>
              {doc.size && <span>· {doc.size}</span>}
              {doc.tag && <span className="bg-indigo-50 text-indigo-600 px-1.5 rounded">tagged</span>}
              {uploadStatusBadge(doc.uploadStatus || 'local')}
            </div>
          </div>
        </button>
        <button onClick={() => onDelete(doc.id)} className="text-slate-300 hover:text-rose-400 transition-colors ml-2 text-lg">✕</button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1">Tag to knowledge area</label>
            <select
              value={doc.tag || ''}
              onChange={e => onTag(doc.id, e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Untagged</option>
              {TAGS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {names.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">People mentioned</p>
              <div className="flex flex-wrap gap-1">
                {names.map(n => (
                  <span key={n} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{n}</span>
                ))}
              </div>
            </div>
          )}

          {doc.content && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Content preview</p>
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 max-h-40 overflow-y-auto">
                <p className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">{doc.content}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentsView({ documents, onAdd, onDelete, onTagDocument }) {
  const fileRef = useRef(null);
  const dirRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState('email');
  const [showManual, setShowManual] = useState(false);
  const [ingestStatus, setIngestStatus] = useState('idle'); // idle | loading | success | error
  const [ingestMessage, setIngestMessage] = useState('');

  // Upload files to the backend and register them in React state.
  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    // Register each file locally immediately so the UI shows "uploading"
    const placeholders = files.map(f => ({
      id: `placeholder-${Date.now()}-${Math.random()}`,
      name: f.name,
      content: null,
      type: f.name.endsWith('.eml') || f.name.includes('mail') ? 'email'
           : f.name.includes('chat') || f.name.includes('slack') ? 'chat' : 'document',
      size: `${Math.round(f.size / 1024)}KB`,
      uploadStatus: 'uploading',
      backendId: null,
    }));
    placeholders.forEach(p => onAdd(p));

    try {
      const res = await fetch(`${BACKEND}/api/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      const records = await res.json(); // [{id, name, size_bytes, content_type}, ...]

      // For text files, also read them locally so we can show a preview
      await Promise.all(files.map((f, i) => new Promise(resolve => {
        if (isBinary(f.name)) { resolve(); return; }
        const reader = new FileReader();
        reader.onload = e => {
          // We stored a placeholder — the real record ID comes from the backend.
          // We pass the backend id via onAdd with a special marker.
          resolve(e.target.result);
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(f);
      })));

      // Replace placeholders: each onAdd with backendId will let App.jsx update
      records.forEach((rec, i) => {
        onAdd({
          // Overwrite the placeholder by matching on name (best effort)
          _replacePlaceholder: placeholders[i]?.id,
          id: placeholders[i]?.id, // keep same local id so App can match
          name: rec.name,
          content: null,
          type: placeholders[i]?.type,
          size: `${Math.round(rec.size_bytes / 1024)}KB`,
          uploadStatus: 'uploaded',
          backendId: rec.id,
        });
      });
    } catch (err) {
      placeholders.forEach(p => {
        onAdd({ ...p, uploadStatus: 'failed' });
      });
      console.error('Upload error:', err);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    uploadFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  };

  const handleManualAdd = () => {
    if (!manualText.trim()) return;
    onAdd({
      name: manualName || `Pasted ${manualType} ${new Date().toLocaleTimeString()}`,
      content: manualText,
      type: manualType,
      size: `${manualText.length} chars`,
      uploadStatus: 'local',
      backendId: null,
    });
    setManualText('');
    setManualName('');
    setShowManual(false);
  };

  const uploadedIds = documents
    .filter(d => d.uploadStatus === 'uploaded' || d.uploadStatus === 'ingested')
    .map(d => d.backendId)
    .filter(Boolean);

  const handleIngest = async () => {
    if (!uploadedIds.length) return;
    setIngestStatus('loading');
    setIngestMessage('');
    try {
      const res = await fetch(`${BACKEND}/api/documents/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_ids: uploadedIds, dataset_name: 'legacy_interview' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setIngestStatus('success');
      setIngestMessage(`${data.count} document(s) added to the knowledge graph.`);
    } catch (err) {
      setIngestStatus('error');
      setIngestMessage(err.message || 'Ingestion failed.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Supporting Documents</h2>
          <p className="text-sm text-slate-500">
            Upload files (PDF, DOCX, XLSX, etc.) or paste text. Files are sent to the backend for knowledge graph ingestion.
          </p>
        </div>

        {/* Build Knowledge Graph button */}
        {uploadedIds.length > 0 && (
          <div className="flex-shrink-0 text-right">
            <button
              onClick={handleIngest}
              disabled={ingestStatus === 'loading'}
              className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium px-4 py-2 rounded-xl transition-colors"
            >
              {ingestStatus === 'loading' ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                  </svg>
                  Building graph…
                </>
              ) : (
                <>⬡ Build Knowledge Graph ({uploadedIds.length})</>
              )}
            </button>
            {ingestStatus === 'success' && (
              <p className="text-xs text-emerald-600 mt-1 font-medium">✓ {ingestMessage}</p>
            )}
            {ingestStatus === 'error' && (
              <p className="text-xs text-rose-500 mt-1">{ingestMessage}</p>
            )}
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-2 ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50'
        }`}
      >
        <div className="text-3xl mb-2">📎</div>
        <p className="text-sm font-medium text-slate-700">Drop files here or click to browse</p>
        <p className="text-xs text-slate-400 mt-1">.pdf · .docx · .xlsx · .csv · .txt · .eml and more</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.eml,.msg,.pptx,.odt,.rtf"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Directory picker */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => dirRef.current?.click()}
          className="text-xs text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors font-medium"
        >
          📁 Upload entire folder
        </button>
        <input
          ref={dirRef}
          type="file"
          // @ts-ignore
          webkitdirectory="true"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <span className="text-xs text-slate-400">Selects all files in a directory recursively</span>
      </div>

      {/* Paste text */}
      <button
        onClick={() => setShowManual(!showManual)}
        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mb-4 block"
      >
        {showManual ? '▲ Hide' : '▼ Paste text directly (local only)'}
      </button>

      {showManual && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-500 font-medium block mb-1">Document name</label>
              <input
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                placeholder="e.g. Email thread with Tanaka-san"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1">Type</label>
              <select
                value={manualType}
                onChange={e => setManualType(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="email">Email</option>
                <option value="chat">Chat log</option>
                <option value="document">Document</option>
                <option value="notes">Notes</option>
              </select>
            </div>
          </div>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder="Paste email content, chat logs, or notes here..."
            rows={6}
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none font-mono"
          />
          <button
            onClick={handleManualAdd}
            disabled={!manualText.trim()}
            className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors font-medium"
          >
            Add Document
          </button>
        </div>
      )}

      {/* Document list */}
      {documents.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-3">
            {documents.length} document{documents.length > 1 ? 's' : ''} attached
          </p>
          {documents.map(doc => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onDelete={id => onDelete(id)}
              onTag={(id, tag) => onTagDocument(id, tag)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-400 text-sm">
          No documents yet. Upload files or paste text to enrich this knowledge record.
        </div>
      )}
    </div>
  );
}
