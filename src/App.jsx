import React, { useState } from 'react';
import SetupScreen from './components/SetupScreen.jsx';
import Header from './components/Header.jsx';
import PhaseNav from './components/PhaseNav.jsx';
import ChatInterface from './components/ChatInterface.jsx';
import ConnectionsPanel from './components/ConnectionsPanel.jsx';
import ConnectionsView from './components/ConnectionsView.jsx';
import DocumentsView from './components/DocumentsView.jsx';
import SummaryView from './components/SummaryView.jsx';
import { useInterview } from './hooks/useInterview.js';

export default function App() {
  const {
    phase,
    interviewee,
    messages,
    phaseIdx,
    questionIdx,
    isTyping,
    connections,
    suggestedPeople,
    documents,
    knowledgeBase,
    activeView,
    currentPhase,
    currentQuestion,
    startInterview,
    resetInterview,
    sendMessage,
    acceptSuggestedPerson,
    dismissSuggestedPerson,
    updateConnection,
    addConnectionManually,
    addDocument,
    setActiveView,
  } = useInterview();

  const [deletedDocs, setDeletedDocs] = useState([]);
  const [docTags, setDocTags] = useState({});

  const visibleDocuments = documents.filter(d => !deletedDocs.includes(d.id)).map(d => ({
    ...d,
    tag: docTags[d.id] || d.tag,
  }));

  const handleDeleteDoc = (id) => setDeletedDocs(prev => [...prev, id]);
  const handleTagDoc = (id, tag) => setDocTags(prev => ({ ...prev, [id]: tag }));

  if (phase === 'setup') {
    return <SetupScreen onStart={startInterview} />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header
        interviewee={interviewee}
        phaseIdx={phaseIdx}
        phase={phase}
        activeView={activeView}
        setActiveView={setActiveView}
        connectionCount={connections.length}
        onReset={resetInterview}
      />

      <div className="flex flex-1 min-h-0">
        {/* Interview view: phase nav + chat + connections sidebar */}
        {activeView === 'interview' && (
          <>
            <PhaseNav phaseIdx={phaseIdx} phase={phase} />

            <div className="flex-1 flex min-w-0 min-h-0">
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
            </div>

            {/* Right: compact connections panel */}
            <div className="w-72 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
              <ConnectionsPanel
                connections={connections}
                onUpdate={updateConnection}
                onAddManual={addConnectionManually}
                knowledgeBase={knowledgeBase}
              />
            </div>
          </>
        )}

        {/* Full connections view */}
        {activeView === 'connections' && (
          <ConnectionsView
            connections={connections}
            onUpdate={updateConnection}
            onDelete={(id) => {}} // soft delete not implemented; connections are immutable once added
            onAddManual={addConnectionManually}
            knowledgeBase={knowledgeBase}
          />
        )}

        {/* Documents view */}
        {activeView === 'documents' && (
          <DocumentsView
            documents={visibleDocuments}
            onAdd={addDocument}
            onDelete={handleDeleteDoc}
            onTagDocument={handleTagDoc}
          />
        )}

        {/* Summary view */}
        {activeView === 'summary' && (
          <SummaryView
            interviewee={interviewee}
            knowledgeBase={knowledgeBase}
            connections={connections}
            documents={visibleDocuments}
            phase={phase}
          />
        )}
      </div>
    </div>
  );
}
