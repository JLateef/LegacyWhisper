import React from 'react';
import { PHASES } from '../data/questions.js';

const VIEW_TABS = [
  { id: 'interview', label: 'Interview' },
  { id: 'connections', label: 'People & Links' },
  { id: 'documents', label: 'Documents' },
  { id: 'summary', label: 'Knowledge Brief' },
];

export default function Header({ interviewee, phaseIdx, phase, activeView, setActiveView, connectionCount, onReset }) {
  const progress = phase === 'complete' ? 100 : Math.round(((phaseIdx) / PHASES.length) * 100);

  return (
    <header className="bg-slate-900 text-white flex-shrink-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
        {/* Brand — click to return to home */}
        <button
          onClick={() => {
            if (window.confirm('Return to the home screen? Your current session will be lost.')) {
              onReset();
            }
          }}
          className="flex items-center gap-3 hover:opacity-75 transition-opacity"
        >
          <div className="w-7 h-7 bg-amber-400 rounded-lg flex items-center justify-center text-slate-900 font-bold text-sm">L</div>
          <span className="font-semibold text-sm tracking-tight">Legacy Whisperer</span>
        </button>

        {/* Interviewee info */}
        {interviewee && (
          <div className="flex items-center gap-3 text-sm">
            <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center text-white font-medium text-xs">
              {interviewee.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium text-white text-xs">{interviewee.name}</div>
              <div className="text-slate-400 text-xs">{interviewee.title} · {interviewee.system}</div>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center gap-3">
          {phase === 'complete' ? (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">Interview Complete</span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-slate-400 text-xs">{progress}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Nav tabs */}
      <div className="flex px-5 gap-1">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeView === tab.id
                ? 'border-amber-400 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
            {tab.id === 'connections' && connectionCount > 0 && (
              <span className="ml-1.5 bg-indigo-500 text-white rounded-full px-1.5 py-0.5 text-xs">{connectionCount}</span>
            )}
          </button>
        ))}
      </div>
    </header>
  );
}
