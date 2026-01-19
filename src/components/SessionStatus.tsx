'use client';

import { useEffect } from 'react';
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

// Custom error class to carry HTTP status
class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'FetchError';
  }
}

export function SessionStatus({ sessionId, type, onOutput }: SessionStatusProps) {
  // Fetch function for the polling hook
  const fetchSession = async (): Promise<{ data: SessionStatusData; status: number }> => {
    const response = await fetch(`/api/sessions/${sessionId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new FetchError(data.error || 'Failed to fetch session', response.status);
    }
    
    return { data, status: response.status };
  };

  // Determine if polling should stop (terminal state reached)
  const shouldStopPolling = (data: SessionStatusData | null): boolean => {
    if (!data) return false;
    return TERMINAL_STATUSES.includes(data.status_enum);
  };

  const {
    data: session,
    pollingState,
    isPolling,
    retryInSeconds,
    retry,
  } = usePollingWithBackoff<SessionStatusData>(fetchSession, shouldStopPolling);

  // Notify parent of output changes
  useEffect(() => {
    if (onOutput && session?.structured_output) {
      onOutput(session.structured_output);
    }
  }, [session?.structured_output, onOutput]);

  // Show failed state with retry button when polling has failed completely
  if (pollingState === 'failed' && !session) {
    return (
      <div className="session-status error">
        <div className="error-badge">Error</div>
        <p className="error-message">Unable to refresh session status. Please retry.</p>
        <button onClick={retry} className="retry-button">
          Retry now
        </button>
      </div>
    );
  }

  // Show loading state only on initial load
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
  const isActive = workflowStatus.kind === 'active';

  return (
    <div className="session-status">
      {/* Degraded state warning - reconnecting */}
      {pollingState === 'degraded' && retryInSeconds !== null && (
        <div className="polling-warning">
          <span className="polling-warning-icon">⟳</span>
          <span className="polling-warning-text">
            Reconnecting… (retrying in {retryInSeconds}s)
          </span>
        </div>
      )}
      
      {/* Failed state warning with retry button */}
      {pollingState === 'failed' && session && (
        <div className="polling-error">
          <span className="polling-error-text">
            Unable to refresh session status. Please retry.
          </span>
          <button onClick={retry} className="polling-retry-button">
            Retry now
          </button>
        </div>
      )}

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
        {isPolling && !workflowStatus.isTerminal && pollingState === 'normal' && (
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
