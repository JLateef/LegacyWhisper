import React, { useState, useRef, useEffect } from 'react';

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">W</div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot" />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot" />
          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot" />
        </div>
      </div>
    </div>
  );
}

function AIMessage({ content, phaseId }) {
  const parts = content.split('— ');
  return (
    <div className="flex items-end gap-2 animate-slide-up">
      <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">W</div>
      <div className="max-w-[80%]">
        <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm">
          {content.includes('— ') && content.split('— ').length > 1 ? (
            <>
              <p className="prose-response text-slate-700 text-sm">{content.split('\n\n— ')[0]}</p>
              {content.includes('\n\n— ') && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-2">
                    {content.split('\n\n— ')[1]?.split(' —\n\n')[0]}
                  </p>
                  <p className="prose-response text-slate-700 text-sm">
                    {content.split(' —\n\n')[1]}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="prose-response text-slate-700 text-sm">{content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ content }) {
  return (
    <div className="flex justify-end animate-slide-up">
      <div className="max-w-[78%] bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3.5 shadow-sm">
        <p className="prose-response text-sm">{content}</p>
      </div>
    </div>
  );
}

export default function ChatInterface({ messages, isTyping, onSend, phase, suggestedPeople, onAcceptPerson, onDismissPerson }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim() || isTyping || phase !== 'interview') return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scroll px-6 py-5 space-y-5">
        {messages.map(msg => (
          msg.role === 'ai'
            ? <AIMessage key={msg.id} content={msg.content} phaseId={msg.phaseId} />
            : <UserMessage key={msg.id} content={msg.content} />
        ))}
        {isTyping && <TypingIndicator />}

        {/* Name suggestions */}
        {suggestedPeople.length > 0 && !isTyping && (
          <div className="animate-fade-in">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-medium text-amber-700 mb-2">
                People detected — add as connections?
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedPeople.map(name => (
                  <div key={name} className="flex items-center gap-1 bg-white border border-amber-200 rounded-lg px-2 py-1">
                    <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                      {name.charAt(0)}
                    </div>
                    <span className="text-xs text-slate-700 font-medium">{name}</span>
                    <button
                      onClick={() => onAcceptPerson(name)}
                      className="ml-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >Add</button>
                    <button
                      onClick={() => onDismissPerson(name)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'complete' && (
          <div className="text-center py-4 animate-fade-in">
            <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-700 font-medium">
              Interview complete · View the Knowledge Brief above
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white px-5 py-4">
        {phase === 'complete' ? (
          <div className="text-center text-sm text-slate-400 py-2">
            This session is complete. Navigate to <strong>People & Links</strong> or <strong>Knowledge Brief</strong> to review outputs.
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={isTyping ? 'Whisperer is thinking...' : 'Share your response... (Enter to send, Shift+Enter for new line)'}
              disabled={isTyping}
              rows={1}
              className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400 max-h-36"
            />
            <button
              onClick={handleSend}
              disabled={isTyping || !input.trim()}
              className="flex-shrink-0 w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl flex items-center justify-center transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
