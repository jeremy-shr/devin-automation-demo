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
const POLL_INTERVAL = 15000;

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

interface SessionPollerResult {
  data: SessionStatusData | null;
  isPolling: boolean;
  pollingState: PollingState;
  retry: () => void;
}

function useSessionPoller(sessionId: string): SessionPollerResult {
  const [data, setData] = useState<SessionStatusData | null>(null);

  const fetchFn = useCallback(() => {
    return fetch(`/api/sessions/${sessionId}`);
  }, [sessionId]);

  const handleSuccess = useCallback((result: SessionStatusData) => {
    setData(result);
  }, []);

  const isTerminal = useCallback((result: SessionStatusData) => {
    return TERMINAL_STATUSES.includes(result.status_enum);
  }, []);

  const { pollingState, isPolling, retry } = usePollingWithBackoff<SessionStatusData>({
    fetchFn,
    onSuccess: handleSuccess,
    isTerminal,
    normalInterval: POLL_INTERVAL,
    maxFailures: 5,
  });

  return { data, isPolling, pollingState, retry };
}

interface WorkflowStatusPillProps {
  sessionId: string;
  type: 'scope' | 'execute';
  onDataChange: (data: SessionStatusData | null) => void;
  onPollingStateChange: (state: PollingState) => void;
}

function WorkflowStatusPill({ 
  sessionId, 
  type,
  onDataChange,
  onPollingStateChange,
}: WorkflowStatusPillProps) {
  const { data, isPolling, pollingState } = useSessionPoller(sessionId);
  
  useEffect(() => {
    onDataChange(data);
  }, [data, onDataChange]);

  useEffect(() => {
    onPollingStateChange(pollingState);
  }, [pollingState, onPollingStateChange]);

  // Derive workflow status from raw data
  const workflowStatus = deriveWorkflowStatus(
    type,
    data?.status_enum || null,
    data?.structured_output || null,
    data?.pull_request_url
  );

  const isActive = workflowStatus.kind === 'active' && isPolling;
  const typeLabel = type === 'scope' ? 'Scope' : 'Execute';

  return (
    <span className={`status-pill status-pill-${getWorkflowKindClass(workflowStatus.kind)}`}>
      {isActive && (
        <span className="status-pill-spinner" />
      )}
      <span className="status-pill-type">{typeLabel}:</span>
      <span className="status-pill-status">{workflowStatus.label}</span>
      {workflowStatus.needsAttention && (
        <span className="status-pill-attention" title={workflowStatus.detail}>⚠</span>
      )}
    </span>
  );
}

const DEFAULT_POLLING_STATE: PollingState = {
  isReconnecting: false,
  isFailed: false,
  failureCount: 0,
  nextRetryIn: null,
};

export function StatusStrip({ 
  issueNumber, 
  scopeSessionId, 
  executeSessionId,
}: StatusStripProps) {
  const [scopeData, setScopeData] = useState<SessionStatusData | null>(null);
  const [executeData, setExecuteData] = useState<SessionStatusData | null>(null);
  const [scopePollingState, setScopePollingState] = useState<PollingState>(DEFAULT_POLLING_STATE);
  const [executePollingState, setExecutePollingState] = useState<PollingState>(DEFAULT_POLLING_STATE);

  const handleScopeDataChange = useCallback((data: SessionStatusData | null) => {
    setScopeData(data);
  }, []);

  const handleExecuteDataChange = useCallback((data: SessionStatusData | null) => {
    setExecuteData(data);
  }, []);

  const handleScopePollingStateChange = useCallback((state: PollingState) => {
    setScopePollingState(state);
  }, []);

  const handleExecutePollingStateChange = useCallback((state: PollingState) => {
    setExecutePollingState(state);
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
            onPollingStateChange={handleScopePollingStateChange}
          />
        )}
        {executeSessionId && (
          <WorkflowStatusPill 
            key={executeSessionId}
            sessionId={executeSessionId}
            type="execute"
            onDataChange={handleExecuteDataChange}
            onPollingStateChange={handleExecutePollingStateChange}
          />
        )}
      </div>
      
      {(scopePollingState.isReconnecting || executePollingState.isReconnecting) && (
        <div className="status-strip-reconnecting">
          Reconnecting... (retrying in {scopePollingState.nextRetryIn || executePollingState.nextRetryIn}s)
        </div>
      )}
      
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
