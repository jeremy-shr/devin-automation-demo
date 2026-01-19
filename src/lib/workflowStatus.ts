/**
 * Workflow Status Utility
 * 
 * Derives human-readable workflow states from raw Devin session status_enum values.
 * This resolves confusion where scope sessions report "blocked" when actually awaiting
 * execution approval.
 */

export type WorkflowKind = 'pending' | 'active' | 'success' | 'warning' | 'error';

export interface WorkflowStatus {
  /** Human-readable status label */
  label: string;
  /** Status category for styling */
  kind: WorkflowKind;
  /** Optional context message */
  detail?: string;
  /** Whether polling should stop */
  isTerminal: boolean;
  /** Show attention indicator (e.g., for errors or needs input) */
  needsAttention: boolean;
}

/**
 * Derives a workflow status from session data.
 * 
 * Key mappings:
 * - Scope blocked + structured_output → "Awaiting approval" (not "Blocked")
 * - Execute blocked → "Needs input" (true blocked state)
 */
export function deriveWorkflowStatus(
  type: 'scope' | 'execute',
  statusEnum: string | null,
  structuredOutput: Record<string, unknown> | null,
  pullRequestUrl?: string | null
): WorkflowStatus {
  // No session exists
  if (!statusEnum) {
    return {
      label: 'Not started',
      kind: 'pending',
      isTerminal: true,
      needsAttention: false,
    };
  }

  // Handle scope sessions
  if (type === 'scope') {
    return deriveScopeStatus(statusEnum, structuredOutput);
  }

  // Handle execute sessions
  return deriveExecuteStatus(statusEnum, structuredOutput, pullRequestUrl);
}

function deriveScopeStatus(
  statusEnum: string,
  structuredOutput: Record<string, unknown> | null
): WorkflowStatus {
  switch (statusEnum) {
    case 'queued':
    case 'pending':
      return {
        label: 'Queued',
        kind: 'pending',
        isTerminal: false,
        needsAttention: false,
      };
    
    case 'running':
      return {
        label: 'Scoping…',
        kind: 'active',
        isTerminal: false,
        needsAttention: false,
      };
    
    case 'blocked':
      // Key insight: scope sessions go to "blocked" when done outputting
      // but actually awaiting user to trigger execute
      if (structuredOutput) {
        return {
          label: 'Awaiting approval',
          kind: 'success',
          detail: 'Scope complete — ready to execute',
          isTerminal: true,
          needsAttention: false,
        };
      }
      // Blocked without output - likely still working
      return {
        label: 'Processing…',
        kind: 'active',
        isTerminal: false,
        needsAttention: false,
      };
    
    case 'paused':
      return {
        label: 'Paused',
        kind: 'warning',
        isTerminal: false,
        needsAttention: true,
      };
    
    case 'finished':
      return {
        label: 'Scoped',
        kind: 'success',
        isTerminal: true,
        needsAttention: false,
      };
    
    case 'failed':
      return {
        label: 'Scope failed',
        kind: 'error',
        isTerminal: true,
        needsAttention: true,
      };
    
    case 'cancelled':
      return {
        label: 'Cancelled',
        kind: 'error',
        isTerminal: true,
        needsAttention: false,
      };
    
    case 'expired':
      return {
        label: 'Expired',
        kind: 'error',
        isTerminal: true,
        needsAttention: false,
      };
    
    default:
      return {
        label: statusEnum,
        kind: 'pending',
        isTerminal: false,
        needsAttention: false,
      };
  }
}

function deriveExecuteStatus(
  statusEnum: string,
  structuredOutput: Record<string, unknown> | null,
  pullRequestUrl?: string | null
): WorkflowStatus {
  switch (statusEnum) {
    case 'queued':
    case 'pending':
      return {
        label: 'Queued',
        kind: 'pending',
        isTerminal: false,
        needsAttention: false,
      };
    
    case 'running':
      return {
        label: 'Executing…',
        kind: 'active',
        isTerminal: false,
        needsAttention: false,
      };
    
    case 'blocked':
      // Execute blocked is true blocked - needs user input
      const blockingReason = getBlockingReason(structuredOutput);
      return {
        label: 'Needs input',
        kind: 'warning',
        detail: blockingReason || 'Waiting for user input',
        isTerminal: false,
        needsAttention: true,
      };
    
    case 'paused':
      return {
        label: 'Paused',
        kind: 'warning',
        isTerminal: false,
        needsAttention: true,
      };
    
    case 'finished':
      if (pullRequestUrl) {
        return {
          label: 'PR ready',
          kind: 'success',
          detail: 'Pull request created',
          isTerminal: true,
          needsAttention: false,
        };
      }
      return {
        label: 'Completed',
        kind: 'success',
        isTerminal: true,
        needsAttention: false,
      };
    
    case 'failed':
      return {
        label: 'Execute failed',
        kind: 'error',
        isTerminal: true,
        needsAttention: true,
      };
    
    case 'cancelled':
      return {
        label: 'Cancelled',
        kind: 'error',
        isTerminal: true,
        needsAttention: false,
      };
    
    case 'expired':
      return {
        label: 'Expired',
        kind: 'error',
        isTerminal: true,
        needsAttention: false,
      };
    
    default:
      return {
        label: statusEnum,
        kind: 'pending',
        isTerminal: false,
        needsAttention: false,
      };
  }
}

/**
 * Extracts a human-readable blocking reason from structured output.
 */
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

/**
 * Returns CSS class suffix for the workflow kind.
 */
export function getWorkflowKindClass(kind: WorkflowKind): string {
  switch (kind) {
    case 'pending': return 'pending';
    case 'active': return 'active';
    case 'success': return 'success';
    case 'warning': return 'warning';
    case 'error': return 'error';
    default: return 'pending';
  }
}
