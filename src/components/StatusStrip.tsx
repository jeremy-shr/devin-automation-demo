'use client';

import { useState, useEffect, useCallback } from 'react';

interface SessionStatusData {
  session_id: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
  updated_at: string;
}

interface StatusStripProps {
  issueNumber: number;
  scopeSessionId: string | null;
  executeSessionId: string | null;
}

const TERMINAL_STATUSES = ['finished', 'failed', 'cancelled', 'expired'];
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

function getBlockingReason(output: Record<string, unknown> | null): string | null {
  if (!output) return null;
  
  if (typeof output.blocking_issue === 'string' && output.blocking_issue) {
    return output.blocking_issue;
  }
  if (typeof output.needs_input === 'string' && output.needs_input) {
    return output.needs_input;
  }
  if (typeof output.current_task === 'string' && output.needs_human_input === true) {
    return output.current_task;
  }
  return null;
}

interface SessionPollerResult {
  data: SessionStatusData | null;
  isPolling: boolean;
}

function SessionPoller({ sessionId }: { sessionId: string }): SessionPollerResult {
  const [data, setData] = useState<SessionStatusData | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) return;
      const result = await response.json();
      setData(result);
      if (TERMINAL_STATUSES.includes(result.status_enum)) {
        setIsPolling(false);
      }
    } catch {
      // Silently fail on fetch errors
    }
  }, [sessionId]);

  useEffect(() => {
    // Initial fetch
    fetchSession();

    // Set up polling
    if (isPolling) {
      const interval = setInterval(fetchSession, POLL_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [fetchSession, isPolling]);

  return { data, isPolling };
}

function SessionStatusDisplay({ 
  sessionId, 
  type,
  onDataChange 
}: { 
  sessionId: string; 
  type: 'Scope' | 'Execute';
  onDataChange: (data: SessionStatusData | null) => void;
}) {
  const { data, isPolling } = SessionPoller({ sessionId });
  
  useEffect(() => {
    onDataChange(data);
  }, [data, onDataChange]);
  
  return (
    <StatusPill 
      type={type} 
      status={data?.status_enum || 'loading'} 
      isPolling={isPolling && !TERMINAL_STATUSES.includes(data?.status_enum || '')}
    />
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

  const isBlocked = scopeData?.status_enum === 'blocked' || executeData?.status_enum === 'blocked';
  const scopeBlockReason = scopeData?.status_enum === 'blocked' 
    ? getBlockingReason(scopeData.structured_output) 
    : null;
  const executeBlockReason = executeData?.status_enum === 'blocked' 
    ? getBlockingReason(executeData.structured_output) 
    : null;
  const blockReason = scopeBlockReason || executeBlockReason;

  const latestUpdate = [scopeData?.updated_at, executeData?.updated_at]
    .filter(Boolean)
    .sort()
    .reverse()[0];

  return (
    <div className="status-strip" data-issue={issueNumber}>
      <div className="status-strip-pills">
        {scopeSessionId && (
          <SessionStatusDisplay 
            key={scopeSessionId}
            sessionId={scopeSessionId}
            type="Scope"
            onDataChange={handleScopeDataChange}
          />
        )}
        {executeSessionId && (
          <SessionStatusDisplay 
            key={executeSessionId}
            sessionId={executeSessionId}
            type="Execute"
            onDataChange={handleExecuteDataChange}
          />
        )}
      </div>
      
      {isBlocked && (
        <div className="status-strip-blocked">
          <span className="blocked-icon">!</span>
          <span className="blocked-text">Blocked</span>
          {blockReason && (
            <span className="blocked-reason" title={blockReason}>
              {blockReason.length > 50 ? blockReason.substring(0, 50) + '...' : blockReason}
            </span>
          )}
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

interface StatusPillProps {
  type: 'Scope' | 'Execute';
  status: string;
  isPolling: boolean;
}

function StatusPill({ type, status, isPolling }: StatusPillProps) {
  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'queued':
      case 'pending':
        return 'status-pill-queued';
      case 'running':
        return 'status-pill-running';
      case 'finished':
        return 'status-pill-finished';
      case 'blocked':
      case 'paused':
        return 'status-pill-blocked';
      case 'failed':
      case 'cancelled':
      case 'expired':
        return 'status-pill-failed';
      case 'loading':
        return 'status-pill-loading';
      default:
        return 'status-pill-unknown';
    }
  };

  const displayStatus = status === 'loading' ? '...' : status;

  return (
    <span className={`status-pill ${getStatusClass(status)}`}>
      {isPolling && status === 'running' && (
        <span className="status-pill-spinner" />
      )}
      <span className="status-pill-type">{type}:</span>
      <span className="status-pill-status">{displayStatus}</span>
    </span>
  );
}
