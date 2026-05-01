import React, { useEffect, useState } from 'react';

function dl(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

export default function CompletionView({ messages, interviewee, projectName = 'Project', onReset }) {
  const [status, setStatus] = useState('preparing');
  const [report, setReport] = useState(null);
  const slug = projectName.toLowerCase().replace(/\s+/g, '-');

  useEffect(() => {
    fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: messages, projectName }),
    })
      .then(r => r.json())
      .then(data => { setReport(data); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);

  const openHtml = () => {
    const blob = new Blob([report.html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md w-full px-6">

        {/* Icon */}
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 text-2xl mx-auto mb-6">
          ✓
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">Interview Complete</h2>
        <p className="text-slate-500 text-sm mb-8">
          {interviewee?.name ? `Thank you, ${interviewee.name.split(' ')[0]}.` : 'Thank you.'}
          {' '}Your handoff document is being prepared.
        </p>

        {status === 'preparing' && (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <svg className="animate-spin w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Extracting knowledge items from your interview...
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-3">
            <button
              onClick={openHtml}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl text-sm transition-colors"
            >
              Open Handoff Report
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => dl(report.html, `${slug}.html`, 'text/html')}
                className="flex-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                ↓ Download HTML
              </button>
              <button
                onClick={() => dl(JSON.stringify(report.items, null, 2), `${slug}.json`, 'application/json')}
                className="flex-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                ↓ Download JSON
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <p className="text-rose-500 text-sm">
            Could not generate report. Make sure <code className="bg-rose-50 px-1 rounded">python server.py</code> is running.
          </p>
        )}

        <button
          onClick={onReset}
          className="mt-8 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Start a new interview
        </button>

      </div>
    </div>
  );
}
