import React from 'react';
import SetupScreen from './components/SetupScreen.jsx';
import Header from './components/Header.jsx';
import ChatInterface from './components/ChatInterface.jsx';
import CompletionView from './components/CompletionView.jsx';
import { useInterview } from './hooks/useInterview.js';

export default function App() {
  const {
    phase,
    interviewee,
    messages,
    isTyping,
    currentQuestion,
    totalQuestions,
    currentQuestionNumber,
    suggestedPeople,
    startInterview,
    resetInterview,
    sendMessage,
    acceptSuggestedPerson,
    dismissSuggestedPerson,
  } = useInterview();

  if (phase === 'setup') {
    return <SetupScreen onStart={startInterview} />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header
        interviewee={interviewee}
        phase={phase}
        currentQuestionNumber={currentQuestionNumber}
        totalQuestions={totalQuestions}
        onReset={resetInterview}
      />

      <div className="flex flex-1 min-h-0">
        {phase === 'interview' && (
          <ChatInterface
            messages={messages}
            isTyping={isTyping}
            onSend={sendMessage}
            phase={phase}
            suggestedPeople={suggestedPeople}
            onAcceptPerson={acceptSuggestedPerson}
            onDismissPerson={dismissSuggestedPerson}
            currentQuestion={currentQuestion}
          />
        )}

        {phase === 'complete' && (
          <CompletionView
            messages={messages}
            interviewee={interviewee}
            projectName={interviewee?.system || 'Project'}
          />
        )}
      </div>
    </div>
  );
}
