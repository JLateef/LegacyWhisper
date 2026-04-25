import React, { useState } from 'react';
import { KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

const SECTION_ICONS = {
  background: '✦',
  system_overview: '⬡',
  architecture_decisions: '⬡',
  fragile_areas: '⬡',
  key_contacts: '◈',
  expertise_map: '◈',
  external_contacts: '◈',
  onboarding_gotchas: '◎',
  undocumented_behavior: '◎',
  permanent_workarounds: '◎',
  incident_response: '◐',
  process_reality: '◐',
  organizational_dynamics: '◐',
  active_work: '◑',
  pending_decisions: '◑',
  achievements: '✧',
  lessons_learned: '✧',
  additional_knowledge: '✧',
};

const SECTION_COLORS = {
  background: 'indigo',
  system_overview: 'emerald',
  architecture_decisions: 'emerald',
  fragile_areas: 'emerald',
  key_contacts: 'blue',
  expertise_map: 'blue',
  external_contacts: 'blue',
  onboarding_gotchas: 'amber',
  undocumented_behavior: 'amber',
  permanent_workarounds: 'amber',
  incident_response: 'rose',
  process_reality: 'rose',
  organizational_dynamics: 'rose',
  active_work: 'teal',
  pending_decisions: 'teal',
  achievements: 'purple',
  lessons_learned: 'purple',
  additional_knowledge: 'purple',
};

const COLOR_CLASSES = {
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  rose: 'bg-rose-50 border-rose-200 text-rose-700',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
};

function SummarySection({ tag, entries }) {
  const [expanded, setExpanded] = useState(true);
  const label = KNOWLEDGE_TAG_LABELS[tag] || tag;
  const icon = SECTION_ICONS[tag] || '·';
  const colorKey = SECTION_COLORS[tag] || 'indigo';
  const colorClass = COLOR_CLASSES[colorKey];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-lg border flex items-center justify-center text-sm flex-shrink-0 ${colorClass}`}>{icon}</span>
          <span className="text-sm font-semibold text-slate-800">{label}</span>
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{entries.length} response{entries.length > 1 ? 's' : ''}</span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-3 space-y-3">
          {entries.map((entry, i) => (
            <div key={i} className="relative pl-4 border-l-2 border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{entry}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SummaryView({ interviewee, knowledgeBase, connections, documents, phase }) {
  const sections = Object.entries(knowledgeBase).filter(([, entries]) => entries.length > 0);
  const totalResponses = sections.reduce((sum, [, entries]) => sum + entries.length, 0);

  const handleExport = () => {
    const lines = [];
    lines.push('LEGACY WHISPERER — CODEBASE KNOWLEDGE BRIEF');
    lines.push('='.repeat(50));
    if (interviewee) {
      lines.push(`Engineer: ${interviewee.name}`);
      lines.push(`Role: ${interviewee.title}`);
      lines.push(`System / Codebase: ${interviewee.system}`);
      if (interviewee.years) lines.push(`Years on System: ${interviewee.years}`);
      if (interviewee.team) lines.push(`Team: ${interviewee.team}`);
      lines.push(`Interview Date: ${new Date().toLocaleDateString()}`);
    }
    lines.push('');

    sections.forEach(([tag, entries]) => {
      lines.push(KNOWLEDGE_TAG_LABELS[tag] || tag);
      lines.push('-'.repeat(30));
      entries.forEach((e, i) => {
        lines.push(`${i + 1}. ${e}`);
        lines.push('');
      });
      lines.push('');
    });

    if (connections.length > 0) {
      lines.push('CONNECTIONS & PEOPLE');
      lines.push('-'.repeat(30));
      connections.forEach(c => {
        lines.push(`• ${c.name}${c.role ? ` — ${c.role}` : ''}${c.email ? ` (${c.email})` : ''}`);
        if (c.notes) lines.push(`  Notes: ${c.notes}`);
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legacy-brief-${interviewee?.name?.replace(/\s+/g, '-') || 'unnamed'}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isEmpty = sections.length === 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Knowledge Brief</h2>
          {interviewee && (
            <p className="text-sm text-slate-500 mt-0.5">
              {interviewee.name} · {interviewee.title} · {interviewee.system}
              {interviewee.years ? ` · ${interviewee.years} yrs` : ''}
            </p>
          )}
        </div>
        {!isEmpty && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 text-sm bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Brief
          </button>
        )}
      </div>

      {/* Stats row */}
      {!isEmpty && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-center">
            <div className="text-2xl font-bold text-indigo-700">{totalResponses}</div>
            <div className="text-xs text-indigo-500 mt-0.5">Responses captured</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{connections.length}</div>
            <div className="text-xs text-blue-500 mt-0.5">People linked</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-center">
            <div className="text-2xl font-bold text-emerald-700">{documents.length}</div>
            <div className="text-xs text-emerald-500 mt-0.5">Documents attached</div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">✧</div>
          <p className="text-sm font-medium text-slate-500 mb-1">Knowledge brief will build here</p>
          <p className="text-xs">Each response you give in the interview is automatically organized and stored here.</p>
          {phase === 'setup' && <p className="text-xs mt-2 text-indigo-500">Start the interview to begin building your knowledge record.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map(([tag, entries]) => (
            <SummarySection key={tag} tag={tag} entries={entries} />
          ))}

          {/* Connections summary */}
          {connections.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Key People to Brief</h3>
              <div className="space-y-2">
                {connections.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                      {c.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800">{c.name}</span>
                      {c.role && <span className="text-xs text-slate-400 ml-2">— {c.role}</span>}
                    </div>
                    {c.email && <span className="text-xs text-slate-400">{c.email}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents summary */}
          {documents.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Supporting Documents</h3>
              <div className="space-y-1.5">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 text-xs text-slate-600">
                    <span>{doc.type === 'email' ? '✉' : doc.type === 'chat' ? '💬' : '📄'}</span>
                    <span className="font-medium">{doc.name}</span>
                    {doc.tag && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{KNOWLEDGE_TAG_LABELS[doc.tag] || doc.tag}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
