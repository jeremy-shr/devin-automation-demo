'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { ScopeSummary } from './ScopeSummary';
import { RawJsonPanel } from './RawJsonPanel';
import { deriveWorkflowStatus, getWorkflowKindClass } from '@/lib/workflowStatus';

interface SessionStatusData {
  session_id: string;
  url: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
  pull_request_url: string | null;
  updated_at: string;
  messages_count?: number;
  title?: string;
}

interface SessionStatusProps {
  sessionId: string;
  type: 'scope' | 'execute';
  onOutput?: (output: Record<string, unknown> | null) => void;
}

function getConfidenceScore(output: Record<string, unknown> | null): number | null {
  if (!output || typeof output.confidence_score !== 'number') {
    return null;
  }
  return output.confidence_score;
}

const TERMINAL_STATUSES = ['finished', 'failed', 'cancelled', 'expired', 'blocked'];
const POLL_INTERVAL = 15000; // 15 seconds

export function SessionStatus({ sessionId, type, onOutput }: SessionStatusProps) {
  const [session, setSession] = useState<SessionStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch session');
      }
      
      setSession(data);
      setError(null);
      
      if (onOutput && data.structured_output) {
        onOutput(data.structured_output);
      }
      
      // Stop polling if session is in terminal state
      if (TERMINAL_STATUSES.includes(data.status_enum)) {
        setIsPolling(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch session');
    }
  }, [sessionId, onOutput]);

  useEffect(() => {
    // Initial fetch
    fetchSession();
    
    // Set up polling
    if (isPolling) {
      const interval = setInterval(fetchSession, POLL_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [fetchSession, isPolling]);

  if (error) {
    return (
      <div className="session-status error">
        <div className="error-badge">Error</div>
        <p className="error-message">{error}</p>
        <button onClick={fetchSession} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="session-status loading">
        <div className="loading-spinner" />
        <span>Loading session...</span>
      </div>
    );
  }

  // Derive workflow status from raw data
  const workflowStatus = deriveWorkflowStatus(
    type,
    session.status_enum,
    session.structured_output,
    session.pull_request_url
  );

  const confidenceScore = type === 'scope' ? getConfidenceScore(session.structured_output) : null;
  const hasValidUrl = session.url && session.url.trim() !== '';
  const isActive = workflowStatus.kind === 'active';

  return (
    <div className="session-status">
      <div className="session-header">
        <span className={`status-badge status-badge-${getWorkflowKindClass(workflowStatus.kind)}`}>
          {isActive && <span className="status-badge-spinner" />}
          {workflowStatus.label}
          {workflowStatus.needsAttention && <span className="status-badge-attention">⚠</span>}
        </span>
        <span className="session-type">
          {type === 'scope' ? '🔍 Scope' : '🚀 Execute'}
          {confidenceScore !== null && (
            <>
              {' '}
              <ConfidenceBadge score={confidenceScore} size="small" />
            </>
          )}
        </span>
        {isPolling && !workflowStatus.isTerminal && (
          <span className="polling-indicator" title="Auto-refreshing">
            ⟳
          </span>
        )}
      </div>
      
      {workflowStatus.detail && (
        <div className="session-detail">
          {workflowStatus.detail}
        </div>
      )}
      
        <a 
          href={"https://app.devin.ai/sessions"} 
          target="_blank" 
          rel="noopener noreferrer"
          className="session-link"
        >
          View in Devin →
        </a>
      
      {session.pull_request_url && (
        <a 
          href={session.pull_request_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="pr-link"
        >
          🔗 View Pull Request
        </a>
      )}
      
      {session.structured_output && (
        type === 'scope' ? (
          <ScopeSummary data={session.structured_output} />
        ) : (
          <RawJsonPanel data={session.structured_output} title="Execution Output" />
        )
      )}
    </div>
  );
}
