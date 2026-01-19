'use client';

import { useState, useCallback } from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';
import { ScopeSummary } from './ScopeSummary';
import { RawJsonPanel } from './RawJsonPanel';
import { deriveWorkflowStatus, getWorkflowKindClass } from '@/lib/workflowStatus';
import { usePollingWithBackoff } from '@/lib/usePollingWithBackoff';

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

  const fetchFn = useCallback(() => {
    return fetch(`/api/sessions/${sessionId}`);
  }, [sessionId]);

  const handleSuccess = useCallback((data: SessionStatusData) => {
    setSession(data);
    setError(null);
    
    if (onOutput && data.structured_output) {
      onOutput(data.structured_output);
    }
  }, [onOutput]);

  const handlePermanentError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const isTerminal = useCallback((data: SessionStatusData) => {
    return TERMINAL_STATUSES.includes(data.status_enum);
  }, []);

  const { pollingState, isPolling, retry } = usePollingWithBackoff<SessionStatusData>({
    fetchFn,
    onSuccess: handleSuccess,
    onPermanentError: handlePermanentError,
    isTerminal,
    normalInterval: POLL_INTERVAL,
    maxFailures: 5,
  });

  if (error || pollingState.isFailed) {
    return (
      <div className="session-status error">
        <div className="error-badge">Error</div>
        <p className="error-message">
          {error || 'Unable to refresh session status. Please retry.'}
        </p>
        <button onClick={retry} className="retry-button">
          Retry now
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="session-status loading">
        <div className="loading-spinner" />
        <span>
          {pollingState.isReconnecting 
            ? `Reconnecting... (retrying in ${pollingState.nextRetryIn}s)`
            : 'Loading session...'}
        </span>
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
      
      {pollingState.isReconnecting && (
        <div className="session-reconnecting">
          Reconnecting... (retrying in {pollingState.nextRetryIn}s)
        </div>
      )}
      
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
