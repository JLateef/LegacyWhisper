import React, { useState } from 'react';
import { KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

const RELATIONSHIP_OPTIONS = [
  'Direct Colleague', 'Team Lead / Manager', 'Direct Report',
  'Key Tenant Contact', 'Trusted Vendor', 'Contractor',
  'Emergency Contact', 'Cross-Department', 'Other',
];

function PersonCard({ conn, onUpdate, onDelete, knowledgeBase }) {
  const [editing, setEditing] = useState(false);

  const relatedEntries = conn.knowledgeTags.flatMap(tag =>
    (knowledgeBase[tag] || []).slice(0, 1)
  );

  const handleShare = () => {
    const link = `${window.location.origin}/profile/${conn.id}`;
    navigator.clipboard.writeText(link).then(
      () => alert(`Profile link copied!\n\n${link}\n\n(In production, this opens ${conn.name}'s shareable knowledge profile)`),
      () => alert(`Share this link with your successor:\n${link}`)
    );
  };

  const handleInvite = () => {
    if (!conn.email) {
      alert(`Add ${conn.name}'s email address to send them an interview invitation.`);
      setEditing(true);
      return;
    }
    const subject = encodeURIComponent("You've been nominated for a Legacy Whisperer session");
    const body = encodeURIComponent(
      `Hi ${conn.name},\n\nYou've been identified as someone with important institutional knowledge that the team would like to preserve.\n\nWe'd love to schedule a Legacy Whisperer session with you — a confidential, structured knowledge interview that takes about 60–90 minutes.\n\nStart here: ${window.location.href}\n\nThank you for everything you contribute to the team.`
    );
    window.open(`mailto:${conn.email}?subject=${subject}&body=${body}`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-5 pt-5 pb-4">
        {/* Avatar + name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
              {conn.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{conn.name}</h3>
              <p className="text-xs text-slate-400">{conn.role || 'Relationship not specified'}</p>
            </div>
          </div>
          <button onClick={() => onDelete(conn.id)} className="text-slate-200 hover:text-rose-400 transition-colors text-lg">✕</button>
        </div>

        {/* Knowledge tags */}
        {conn.knowledgeTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {conn.knowledgeTags.map(tag => (
              <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                {KNOWLEDGE_TAG_LABELS[tag] || tag}
              </span>
            ))}
          </div>
        )}

        {/* Context snippet */}
        {relatedEntries.length > 0 && (
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-xs text-slate-500 italic leading-relaxed line-clamp-3">
              "{relatedEntries[0].substring(0, 160)}{relatedEntries[0].length > 160 ? '...' : ''}"
            </p>
          </div>
        )}

        {/* Editing */}
        {editing && (
          <div className="space-y-2 mb-3 pt-3 border-t border-slate-100">
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1">Relationship type</label>
              <select
                value={conn.role}
                onChange={e => onUpdate(conn.id, { role: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">Select...</option>
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
              <label className="text-xs text-slate-500 font-medium block mb-1">Notes for successor</label>
              <textarea
                value={conn.notes}
                onChange={e => onUpdate(conn.id, { notes: e.target.value })}
                placeholder="What should the next person know about this relationship?"
                rows={2}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
              />
            </div>
            <button onClick={() => setEditing(false)} className="text-xs text-indigo-600 font-medium">Done</button>
          </div>
        )}

        {conn.notes && !editing && (
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">{conn.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-slate-100 px-5 py-3 flex gap-3">
        <button onClick={() => setEditing(!editing)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">
          {editing ? 'Close' : 'Edit'}
        </button>
        <span className="text-slate-200">|</span>
        <button onClick={handleShare} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
          Copy Profile Link
        </button>
        <span className="text-slate-200">|</span>
        <button onClick={handleInvite} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
          Invite to Interview
        </button>
      </div>
    </div>
  );
}

export default function ConnectionsView({ connections, onUpdate, onDelete, onAddManual, knowledgeBase }) {
  const [newName, setNewName] = useState('');
  const [filterRole, setFilterRole] = useState('');

  const filtered = filterRole
    ? connections.filter(c => c.role === filterRole)
    : connections;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAddManual(newName.trim());
    setNewName('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">People & Connections</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {connections.length === 0
                ? 'Names mentioned during the interview appear here automatically.'
                : `${connections.length} connection${connections.length > 1 ? 's' : ''} captured — each one linked to the knowledge context they appeared in.`}
            </p>
          </div>

          {connections.length > 0 && (
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">All relationships</option>
              {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>

        {connections.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">◈</div>
            <p className="text-slate-500 font-medium mb-1">No connections captured yet</p>
            <p className="text-sm text-slate-400">Mention names during your interview — they'll appear here automatically, linked to the context they came up in.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {filtered.map(conn => (
              <PersonCard
                key={conn.id}
                conn={conn}
                onUpdate={onUpdate}
                onDelete={onDelete}
                knowledgeBase={knowledgeBase}
              />
            ))}
          </div>
        )}

        {/* Add manually */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-600 mb-3">Add a connection manually</p>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Full name..."
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="submit"
              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}
