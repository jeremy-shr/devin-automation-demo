'use client';

import { useState, useCallback, useEffect } from 'react';
import { SessionStatus } from './SessionStatus';
import { IssueModal } from './IssueModal';

interface Issue {
  number: number;
  title: string;
  body: string | null;
  body_snippet: string | null;
  html_url: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  state: string;
}

interface SessionInfo {
  sessionId: string;
  type: 'scope' | 'execute';
}

interface IssueRowProps {
  issue: Issue;
}

// Storage key for persisting session IDs
const getStorageKey = (issueNumber: number, type: 'scope' | 'execute') => 
  `devin-session-${issueNumber}-${type}`;

export function IssueRow({ issue }: IssueRowProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState<'scope' | 'execute' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scopeOutput, setScopeOutput] = useState<Record<string, unknown> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load persisted sessions on mount
  useEffect(() => {
    const loadedSessions: SessionInfo[] = [];
    
    const scopeId = localStorage.getItem(getStorageKey(issue.number, 'scope'));
    if (scopeId) {
      loadedSessions.push({ sessionId: scopeId, type: 'scope' });
    }
    
    const executeId = localStorage.getItem(getStorageKey(issue.number, 'execute'));
    if (executeId) {
      loadedSessions.push({ sessionId: executeId, type: 'execute' });
    }
    
    if (loadedSessions.length > 0) {
      setSessions(loadedSessions);
      setIsExpanded(true);
    }
  }, [issue.number]);

  const handleScope = useCallback(async () => {
    setIsLoading('scope');
    setError(null);
    
    try {
      const response = await fetch(`/api/issues/${issue.number}/scope`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create scope session');
      }
      
      // Persist session ID
      localStorage.setItem(getStorageKey(issue.number, 'scope'), data.session_id);
      
      setSessions(prev => {
        const filtered = prev.filter(s => s.type !== 'scope');
        return [...filtered, { sessionId: data.session_id, type: 'scope' }];
      });
      setIsExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scope issue');
    } finally {
      setIsLoading(null);
    }
  }, [issue.number]);

  const handleExecute = useCallback(async () => {
    const scopeSession = sessions.find(s => s.type === 'scope');
    
    if (!scopeSession) {
      setError('Please scope the issue first');
      return;
    }
    
    setIsLoading('execute');
    setError(null);
    
    try {
      const response = await fetch(`/api/issues/${issue.number}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopeSessionId: scopeSession.sessionId }),
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create execute session');
      }
      
      // Persist session ID
      localStorage.setItem(getStorageKey(issue.number, 'execute'), data.session_id);
      
      setSessions(prev => {
        const filtered = prev.filter(s => s.type !== 'execute');
        return [...filtered, { sessionId: data.session_id, type: 'execute' }];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute plan');
    } finally {
      setIsLoading(null);
    }
  }, [issue.number, sessions]);

  const handleScopeOutput = useCallback((output: Record<string, unknown> | null) => {
    setScopeOutput(output);
  }, []);

  const hasScopeSession = sessions.some(s => s.type === 'scope');
  const hasExecuteSession = sessions.some(s => s.type === 'execute');
  const isReadyToExecute = scopeOutput && 
    ('ready_to_execute' in scopeOutput ? scopeOutput.ready_to_execute : true);

  return (
    <div className="issue-row">
      <div className="issue-main">
        <div className="issue-info">
          <div className="issue-header">
            <span className="issue-number">#{issue.number}</span>
            {issue.state === 'closed' && (
              <span className="state-badge state-closed">Closed</span>
            )}
            <a 
              href={issue.html_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className={`issue-title ${issue.state === 'closed' ? 'issue-title-closed' : ''}`}
            >
              {issue.title}
            </a>
          </div>
          
          <div className="issue-labels">
            {issue.labels.map(label => (
              <span 
                key={label.name}
                className="label"
                style={{ backgroundColor: `#${label.color}20`, borderColor: `#${label.color}` }}
              >
                {label.name}
              </span>
            ))}
          </div>
          
          {issue.body_snippet && (
            <p className="issue-snippet">{issue.body_snippet}</p>
          )}
          
          <div className="issue-meta">
            Updated {new Date(issue.updated_at).toLocaleDateString()}
          </div>
        </div>
        
                <div className="issue-actions">
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="action-button view-button"
                  >
                    View
                  </button>
          
                  <button
                    onClick={handleScope}
                    disabled={isLoading !== null}
                    className="action-button scope-button"
                  >
                    {isLoading === 'scope' ? 'Scoping...' : hasScopeSession ? 'Re-scope' : '🔍 Scope'}
                  </button>
          
                  <button
                    onClick={handleExecute}
                    disabled={isLoading !== null || !hasScopeSession}
                    className={`action-button execute-button ${!hasScopeSession ? 'disabled' : ''}`}
                    title={!hasScopeSession ? 'Scope the issue first' : isReadyToExecute ? 'Execute the action plan' : 'Waiting for scope to complete'}
                  >
                    {isLoading === 'execute' ? 'Starting...' : hasExecuteSession ? 'Re-execute' : '🚀 Execute'}
                  </button>
          
                  {sessions.length > 0 && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="toggle-button"
                    >
                      {isExpanded ? '▲ Hide' : '▼ Show'} Sessions
                    </button>
                  )}
                </div>
      </div>
      
      {error && (
        <div className="issue-error">
          ⚠️ {error}
          <button onClick={() => setError(null)} className="dismiss-error">×</button>
        </div>
      )}
      
      {isExpanded && sessions.length > 0 && (
        <div className="sessions-panel">
          {sessions.map(session => (
            <SessionStatus
              key={session.sessionId}
              sessionId={session.sessionId}
              type={session.type}
              onOutput={session.type === 'scope' ? handleScopeOutput : undefined}
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <IssueModal issue={issue} onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}
