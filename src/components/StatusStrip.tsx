'use client';

import { useState, useEffect, useCallback } from 'react';
import { deriveWorkflowStatus, getWorkflowKindClass } from '@/lib/workflowStatus';
import { usePollingWithBackoff, PollingState } from '@/lib/usePollingWithBackoff';

interface SessionStatusData {
  session_id: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
  pull_request_url?: string | null;
  updated_at: string;
}

interface StatusStripProps {
  issueNumber: number;
  scopeSessionId: string | null;
  executeSessionId: string | null;
}

const TERMINAL_STATUSES = ['finished', 'failed', 'cancelled', 'expired', 'blocked'];

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Custom error class to carry HTTP status
class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'FetchError';
  }
}

interface SessionPollerResult {
  data: SessionStatusData | null;
  isPolling: boolean;
  pollingState: PollingState;
  retryInSeconds: number | null;
  retry: () => void;
}

function useSessionPoller(sessionId: string): SessionPollerResult {
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
    data,
    pollingState,
    isPolling,
    retryInSeconds,
    retry,
  } = usePollingWithBackoff<SessionStatusData>(fetchSession, shouldStopPolling);

  return { data, isPolling, pollingState, retryInSeconds, retry };
}

interface WorkflowStatusPillProps {
  sessionId: string;
  type: 'scope' | 'execute';
  onDataChange: (data: SessionStatusData | null) => void;
  onPollingStateChange?: (state: PollingState, retryInSeconds: number | null) => void;
}

function WorkflowStatusPill({ 
  sessionId, 
  type,
  onDataChange,
  onPollingStateChange,
}: WorkflowStatusPillProps) {
  const { data, isPolling, pollingState, retryInSeconds } = useSessionPoller(sessionId);
  
  useEffect(() => {
    onDataChange(data);
  }, [data, onDataChange]);

  useEffect(() => {
    if (onPollingStateChange) {
      onPollingStateChange(pollingState, retryInSeconds);
    }
  }, [pollingState, retryInSeconds, onPollingStateChange]);

  // Derive workflow status from raw data
  const workflowStatus = deriveWorkflowStatus(
    type,
    data?.status_enum || null,
    data?.structured_output || null,
    data?.pull_request_url
  );

  const isActive = workflowStatus.kind === 'active' && isPolling && pollingState === 'normal';
  const isDegraded = pollingState === 'degraded';
  const isFailed = pollingState === 'failed';
  const typeLabel = type === 'scope' ? 'Scope' : 'Execute';

  // Add degraded/failed class modifier for styling
  const pillClassName = [
    'status-pill',
    `status-pill-${getWorkflowKindClass(workflowStatus.kind)}`,
    isDegraded && 'status-pill-degraded',
    isFailed && 'status-pill-failed',
  ].filter(Boolean).join(' ');

  return (
    <span className={pillClassName}>
      {isActive && (
        <span className="status-pill-spinner" />
      )}
      {isDegraded && (
        <span className="status-pill-warning" title={`Reconnecting… (retrying in ${retryInSeconds}s)`}>⟳</span>
      )}
      {isFailed && (
        <span className="status-pill-error" title="Connection lost">!</span>
      )}
      <span className="status-pill-type">{typeLabel}:</span>
      <span className="status-pill-status">{workflowStatus.label}</span>
      {workflowStatus.needsAttention && !isDegraded && !isFailed && (
        <span className="status-pill-attention" title={workflowStatus.detail}>⚠</span>
      )}
    </span>
  );
}

export function StatusStrip({ 
  issueNumber, 
  scopeSessionId, 
  executeSessionId,
}: StatusStripProps) {
  const [scopeData, setScopeData] = useState<SessionStatusData | null>(null);
  const [executeData, setExecuteData] = useState<SessionStatusData | null>(null);

  const handleScopeDataChange = useCallback((data: SessionStatusData | null) => {
    setScopeData(data);
  }, []);

  const handleExecuteDataChange = useCallback((data: SessionStatusData | null) => {
    setExecuteData(data);
  }, []);

  const hasAnySessions = scopeSessionId || executeSessionId;
  if (!hasAnySessions) return null;

  // Derive workflow statuses for context-aware messaging
  const scopeWorkflow = scopeSessionId ? deriveWorkflowStatus(
    'scope',
    scopeData?.status_enum || null,
    scopeData?.structured_output || null
  ) : null;

  const executeWorkflow = executeSessionId ? deriveWorkflowStatus(
    'execute',
    executeData?.status_enum || null,
    executeData?.structured_output || null,
    executeData?.pull_request_url
  ) : null;

  // Determine if we need to show attention message
  const needsAttentionWorkflow = executeWorkflow?.needsAttention ? executeWorkflow : 
    (scopeWorkflow?.needsAttention ? scopeWorkflow : null);

  const latestUpdate = [scopeData?.updated_at, executeData?.updated_at]
    .filter(Boolean)
    .sort()
    .reverse()[0];

  return (
    <div className="status-strip" data-issue={issueNumber}>
      <div className="status-strip-pills">
        {scopeSessionId && (
          <WorkflowStatusPill 
            key={scopeSessionId}
            sessionId={scopeSessionId}
            type="scope"
            onDataChange={handleScopeDataChange}
          />
        )}
        {executeSessionId && (
          <WorkflowStatusPill 
            key={executeSessionId}
            sessionId={executeSessionId}
            type="execute"
            onDataChange={handleExecuteDataChange}
          />
        )}
      </div>
      
      {needsAttentionWorkflow && needsAttentionWorkflow.detail && (
        <div className="status-strip-attention">
          <span className="attention-icon">⚠</span>
          <span className="attention-text">{needsAttentionWorkflow.label}</span>
          <span className="attention-detail" title={needsAttentionWorkflow.detail}>
            {needsAttentionWorkflow.detail.length > 50 
              ? needsAttentionWorkflow.detail.substring(0, 50) + '...' 
              : needsAttentionWorkflow.detail}
          </span>
        </div>
      )}
      
      {latestUpdate && (
        <span className="status-strip-updated">
          Updated {getRelativeTime(latestUpdate)}
        </span>
      )}
    </div>
  );
}
