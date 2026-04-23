import React from 'react';
import { PHASES } from '../data/questions.js';

const PHASE_COLORS = {
  indigo: 'bg-indigo-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  purple: 'bg-purple-500',
};

export default function PhaseNav({ phaseIdx, phase }) {
  return (
    <div className="w-52 flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto py-5 px-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-4">Interview Phases</p>
      <div className="space-y-1">
        {PHASES.map((p, idx) => {
          const isComplete = phase === 'complete' || idx < phaseIdx;
          const isCurrent = idx === phaseIdx && phase === 'interview';
          const isFuture = idx > phaseIdx && phase !== 'complete';

          return (
            <div
              key={p.id}
              className={`flex items-center gap-2.5 px-2 py-2.5 rounded-lg ${
                isCurrent ? 'bg-indigo-50 border border-indigo-200' :
                isComplete ? 'opacity-60' : 'opacity-40'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                isComplete ? 'bg-emerald-500 text-white' :
                isCurrent ? `${PHASE_COLORS[p.color] || 'bg-indigo-500'} text-white` :
                'bg-slate-200 text-slate-400'
              }`}>
                {isComplete ? '✓' : p.icon}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-medium truncate ${isCurrent ? 'text-indigo-700' : isComplete ? 'text-slate-600' : 'text-slate-400'}`}>
                  {p.name}
                </div>
                <div className="text-xs text-slate-400 truncate">{p.description}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 px-2">
        <p className="text-xs text-slate-400 leading-relaxed">
          Names you mention will be detected and added as connections automatically.
        </p>
      </div>
    </div>
  );
}
