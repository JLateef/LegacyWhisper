import React, { useState } from 'react';

export default function SetupScreen({ onStart }) {
  const [form, setForm] = useState({ name: '', title: '', property: '', years: '', email: '', department: '' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.title.trim()) e.title = 'Required';
    if (!form.property.trim()) e.property = 'Required';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    onStart(form);
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
            A structured transitional interview — capturing the institutional knowledge that can't be found in any document.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Before we begin</h2>
          <p className="text-slate-500 text-sm mb-6">Tell us about the person we're interviewing today.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {field('name', 'Full Name', 'e.g. Kenji Yamamoto', true)}
            {field('title', 'Role / Title', 'e.g. Senior Facility Manager', true)}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Property / Building<span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  value={form.property}
                  onChange={e => { setForm(p => ({ ...p, property: e.target.value })); setErrors(p => ({ ...p, property: '' })); }}
                  placeholder="e.g. Shibuya Hikarie"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${errors.property ? 'border-rose-400' : 'border-slate-200'}`}
                />
                {errors.property && <p className="text-rose-500 text-xs mt-1">{errors.property}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Years in Role</label>
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

            {field('department', 'Department / Division', 'e.g. Commercial Properties')}
            {field('email', 'Email (for sharing outputs)', 'e.g. k.yamamoto@tokyuland.co.jp')}

            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl text-sm transition-colors"
              >
                Begin Knowledge Interview
              </button>
              <p className="text-center text-xs text-slate-400 mt-3">
                Estimated session: 60–90 minutes · Confidential
              </p>
            </div>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Built for Tokyu Land · Facility Knowledge Preservation
        </p>
      </div>
    </div>
  );
}
