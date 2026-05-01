import React, { useState, useRef } from 'react';

const LOADING_STEPS = [
  'Reading codebase structure...',
  'Scanning commit history...',
  'Analyzing tickets...',
  'Identifying knowledge gaps...',
  'Generating contextual questions...',
];

function FileRow({ label, hint, file, inputRef, onChange }) {
  return (
    <label className="flex items-center gap-3 px-3 py-2.5 border border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-700">{label}</div>
        <div className="text-xs text-slate-400 truncate mt-0.5">{file ? file.name : hint}</div>
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${file ? 'text-emerald-600' : 'text-indigo-500'}`}>
        {file ? '✓ Ready' : 'Choose'}
      </span>
      <input ref={inputRef} type="file" className="hidden" onChange={onChange} />
    </label>
  );
}

export default function SetupScreen({ onStart }) {
  const [form, setForm] = useState({ name: '', title: '', system: '', years: '', email: '', team: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [codebaseFile, setCodebaseFile] = useState(null);
  const [commitsFile, setCommitsFile]   = useState(null);
  const [ticketsFile, setTicketsFile]   = useState(null);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.title.trim()) e.title = 'Required';
    if (!form.system.trim()) e.system = 'Required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);

    // Cycle through loading steps while Machine 1 runs (~60s)
    let step = 0;
    const interval = setInterval(() => {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      setLoadingStep(step);
    }, 14000);

    try {
      const body = new FormData();
      if (codebaseFile) body.append('codebase', codebaseFile);
      if (commitsFile)  body.append('commits',  commitsFile);
      if (ticketsFile)  body.append('tickets',  ticketsFile);

      const res = await fetch('/api/questions', { method: 'POST', body });
      const questions = await res.json();
      clearInterval(interval);
      onStart(form, questions);
    } catch {
      clearInterval(interval);
      onStart(form, null);
    }
  };

  const field = (key, label, placeholder, required = false) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-rose-500 ml-1">*</span>}
      </label>
      <input
        value={form[key]}
        onChange={e => { setForm(p => ({ ...p, [key]: e.target.value })); setErrors(p => ({ ...p, [key]: '' })); }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors[key] ? 'border-rose-400' : 'border-slate-200'}`}
      />
      {errors[key] && <p className="text-rose-500 text-xs mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center text-slate-900 font-bold text-lg">L</div>
            <span className="text-white text-2xl font-semibold tracking-tight">Legacy Whisperer</span>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
            A structured knowledge transfer interview — capturing the institutional memory that can't be found by reading the code.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Before we begin</h2>
          <p className="text-slate-500 text-sm mb-6">Tell us about the engineer we're interviewing today.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {field('name', 'Full Name', 'e.g. Kenji Yamamoto', true)}
            {field('title', 'Role / Title', 'e.g. Senior Backend Engineer', true)}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  System / Codebase<span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  value={form.system}
                  onChange={e => { setForm(p => ({ ...p, system: e.target.value })); setErrors(p => ({ ...p, system: '' })); }}
                  placeholder="e.g. Billing Service"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors.system ? 'border-rose-400' : 'border-slate-200'}`}
                />
                {errors.system && <p className="text-rose-500 text-xs mt-1">{errors.system}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Years on This System</label>
                <input
                  type="number"
                  min="0"
                  value={form.years}
                  onChange={e => setForm(p => ({ ...p, years: e.target.value }))}
                  placeholder="e.g. 7"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            </div>

            {field('team', 'Team / Department', 'e.g. Platform Engineering')}
            {field('email', 'Email (for sharing outputs)', 'e.g. k.yamamoto@example.co.jp')}

            {/* Codebase upload */}
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-700">Codebase Files</p>
                <span className="text-xs text-slate-400">optional</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Upload your code so the AI asks specific questions about it.
                Skip to use the demo codebase.
              </p>
              <div className="space-y-2">
                <FileRow
                  label="Codebase ZIP"
                  hint="ZIP your source directory"
                  file={codebaseFile}
                  onChange={e => setCodebaseFile(e.target.files[0] || null)}
                />
                <FileRow
                  label="Git Log"
                  hint="git log --all --stat --format=fuller > log.txt"
                  file={commitsFile}
                  onChange={e => setCommitsFile(e.target.files[0] || null)}
                />
                <FileRow
                  label="Tickets CSV"
                  hint="id, title, description, resolution, reopen_count"
                  file={ticketsFile}
                  onChange={e => setTicketsFile(e.target.files[0] || null)}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl text-sm transition-colors"
              >
                {loading ? 'Preparing your interview...' : 'Begin Knowledge Interview'}
              </button>

              {loading ? (
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <svg className="animate-spin w-3 h-3 text-indigo-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    {LOADING_STEPS[loadingStep]}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">This takes about 60 seconds</p>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-400 mt-3">
                  Estimated session: 30–40 minutes · Confidential
                </p>
              )}
            </div>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Legacy Codebase Knowledge Preservation
        </p>
      </div>
    </div>
  );
}
