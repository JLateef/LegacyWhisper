import React from 'react';

export default function Header({ interviewee, phase, currentQuestionNumber, totalQuestions, onReset }) {
  const pct = phase === 'complete' ? 100
    : totalQuestions > 0 ? Math.round((currentQuestionNumber / totalQuestions) * 100)
    : 0;

  return (
    <header className="bg-slate-900 text-white flex-shrink-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
        {/* Brand */}
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

        {/* Interviewee */}
        {interviewee && (
          <div className="flex items-center gap-3 text-sm">
            <div className="w-7 h-7 bg-indigo-500 rounded-full flex items-center justify-center text-white font-medium text-xs">
              {interviewee.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium text-white text-xs">{interviewee.name}</div>
              <div className="text-slate-400 text-xs">{interviewee.title}{interviewee.system ? ` · ${interviewee.system}` : ''}</div>
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          {phase === 'complete' ? (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">
              Interview Complete
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Q{currentQuestionNumber} of {totalQuestions}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-amber-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </header>
  );
}
