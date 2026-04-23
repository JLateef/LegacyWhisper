import React, { useState, useRef } from 'react';
import { KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

const TAGS = Object.entries(KNOWLEDGE_TAG_LABELS).map(([id, label]) => ({ id, label }));

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
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>{doc.type?.toUpperCase() || 'FILE'}</span>
              {doc.size && <span>· {doc.size}</span>}
              {doc.tag && <span className="bg-indigo-50 text-indigo-600 px-1.5 rounded">tagged</span>}
            </div>
          </div>
        </button>
        <button onClick={() => onDelete(doc.id)} className="text-slate-300 hover:text-rose-400 transition-colors ml-2 text-lg">✕</button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* Tag to knowledge area */}
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

          {/* People found */}
          {names.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">People mentioned in document</p>
              <div className="flex flex-wrap gap-1">
                {names.map(n => (
                  <span key={n} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Content preview */}
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
  const [dragging, setDragging] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState('email');
  const [showManual, setShowManual] = useState(false);

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const type = file.name.endsWith('.eml') || file.name.includes('mail') ? 'email' :
                   file.name.includes('chat') || file.name.includes('slack') ? 'chat' : 'document';
      onAdd({
        name: file.name,
        content: e.target.result,
        type,
        size: `${Math.round(file.size / 1024)}KB`,
      });
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  };

  const handleFileInput = (e) => {
    Array.from(e.target.files).forEach(processFile);
    e.target.value = '';
  };

  const handleManualAdd = () => {
    if (!manualText.trim()) return;
    onAdd({
      name: manualName || `Pasted ${manualType} ${new Date().toLocaleTimeString()}`,
      content: manualText,
      type: manualType,
      size: `${manualText.length} chars`,
    });
    setManualText('');
    setManualName('');
    setShowManual(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Supporting Documents</h2>
        <p className="text-sm text-slate-500">
          Upload or paste past emails, chat logs, or notes. They'll be linked to this knowledge record and analyzed for people and topics.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50'
        }`}
      >
        <div className="text-3xl mb-2">📎</div>
        <p className="text-sm font-medium text-slate-700">Drop files here or click to browse</p>
        <p className="text-xs text-slate-400 mt-1">.txt · .eml · .csv · .log · any text file</p>
        <input ref={fileRef} type="file" multiple accept=".txt,.eml,.csv,.log,.md" onChange={handleFileInput} className="hidden" />
      </div>

      {/* Paste text */}
      <button
        onClick={() => setShowManual(!showManual)}
        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mb-4 block"
      >
        {showManual ? '▲ Hide' : '▼ Paste text directly'}
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
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-3">{documents.length} document{documents.length > 1 ? 's' : ''} attached</p>
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
          No documents yet. Upload emails or chat logs to enrich this knowledge record.
        </div>
      )}
    </div>
  );
}
