import React, { useState } from 'react';
import { KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

const RELATIONSHIP_OPTIONS = [
  'Direct Colleague', 'Team Lead / Manager', 'Direct Report',
  'Architect / Designer', 'Support Provider', 'Consultant',
  'External Vendor', 'Product Owner', 'Other',
];

function ConnectionCard({ conn, onUpdate, knowledgeBase }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const relatedEntries = conn.knowledgeTags.flatMap(tag =>
    (knowledgeBase[tag] || []).slice(0, 1)
  );

  const handleShare = () => {
    const link = `${window.location.origin}/connection/${conn.id}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(`Link copied: ${link}\n\n(In production, this would open ${conn.name}'s knowledge profile)`);
    }).catch(() => {
      alert(`Share link: ${link}`);
    });
  };

  const handleInvite = () => {
    const subject = encodeURIComponent(`Legacy Whisperer — Your turn`);
    const body = encodeURIComponent(`Hi ${conn.name},\n\nYou've been identified as someone with valuable institutional knowledge. We'd like to schedule a Legacy Whisperer session with you.\n\nStart your session here: ${window.location.origin}?invited=true\n\nThis confidential interview will help preserve your expertise for the team.`);
    if (conn.email) {
      window.open(`mailto:${conn.email}?subject=${subject}&body=${body}`);
    } else {
      alert(`To invite ${conn.name}, please add their email address first.`);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
          {conn.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{conn.name}</div>
          <div className="text-xs text-slate-400 truncate">
            {conn.role || 'Role not specified'}
            {conn.knowledgeTags.length > 0 && ` · ${conn.knowledgeTags.length} topic${conn.knowledgeTags.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4">
          {editing ? (
            <div className="pt-3 space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Relationship</label>
                <select
                  value={conn.role}
                  onChange={e => onUpdate(conn.id, { role: e.target.value })}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  <option value="">Select relationship...</option>
                  {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Email</label>
                <input
                  type="email"
                  value={conn.email}
                  onChange={e => onUpdate(conn.id, { email: e.target.value })}
                  placeholder="email@company.com"
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">Notes</label>
                <textarea
                  value={conn.notes}
                  onChange={e => onUpdate(conn.id, { notes: e.target.value })}
                  placeholder="What should their successor know about them?"
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
                />
              </div>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-indigo-600 font-medium"
              >Done editing</button>
            </div>
          ) : (
            <div className="pt-3 space-y-2">
              {conn.role && (
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{conn.role}</span>
                  {conn.email && <span className="text-xs text-slate-400">{conn.email}</span>}
                </div>
              )}

              {conn.knowledgeTags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-1">Mentioned in</p>
                  <div className="flex flex-wrap gap-1">
                    {conn.knowledgeTags.map(tag => (
                      <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                        {KNOWLEDGE_TAG_LABELS[tag] || tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {relatedEntries.length > 0 && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500 italic line-clamp-3">"{relatedEntries[0].substring(0, 120)}..."</p>
                </div>
              )}

              {conn.notes && (
                <p className="text-xs text-slate-600">{conn.notes}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                >Edit</button>
                <span className="text-slate-200">|</span>
                <button
                  onClick={handleShare}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >Copy Link</button>
                <span className="text-slate-200">|</span>
                <button
                  onClick={handleInvite}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >Invite to Interview</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConnectionsPanel({ connections, onUpdate, onAddManual, knowledgeBase }) {
  const [newName, setNewName] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddManual(newName);
    setNewName('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-900">People & Connections</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {connections.length === 0
            ? 'Names mentioned will appear here automatically'
            : `${connections.length} connection${connections.length > 1 ? 's' : ''} captured`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll px-4 py-3 space-y-2">
        {connections.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <div className="text-3xl mb-2">◈</div>
            <p className="text-xs">No connections yet.<br />Mention names during the interview.</p>
          </div>
        ) : (
          connections.map(conn => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              onUpdate={onUpdate}
              knowledgeBase={knowledgeBase}
            />
          ))
        )}
      </div>

      {/* Add manually */}
      <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Add person manually..."
            className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            type="submit"
            className="text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >Add</button>
        </form>
      </div>
    </div>
  );
}
