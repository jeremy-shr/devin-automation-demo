const DEVIN_API_BASE = 'https://api.devin.ai/v1';

function getApiKey(): string {
  const key = process.env.DEVIN_API_KEY;
  if (!key) {
    throw new Error('DEVIN_API_KEY environment variable is required');
  }
  return key;
}

export interface SessionSecret {
  key: string;
  value: string;
  sensitive?: boolean;
}

export interface CreateSessionParams {
  prompt: string;
  tags?: string[];
  title?: string;
  unlisted?: boolean;
  session_secrets?: SessionSecret[];
}

export interface DevinSession {
  session_id: string;
  url: string;
  status_enum: 'pending' | 'running' | 'blocked' | 'paused' | 'finished' | 'failed' | 'cancelled' | 'expired';
  structured_output: Record<string, unknown> | null;
  pull_request?: {
    url: string;
  };
  updated_at: string;
  messages_count?: number;
  title?: string;
}

export async function createSession(params: CreateSessionParams): Promise<DevinSession> {
  const apiKey = getApiKey();
  
  const response = await fetch(`${DEVIN_API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: params.prompt,
      tags: params.tags || [],
      title: params.title,
      unlisted: params.unlisted ?? true,
      session_secrets: params.session_secrets || [],
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Devin API error (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  
  return {
    session_id: data.session_id,
    url: data.url,
    status_enum: data.status_enum || 'pending',
    structured_output: data.structured_output || null,
    pull_request: data.pull_request,
    updated_at: data.updated_at || new Date().toISOString(),
  };
}

export async function getSession(sessionId: string): Promise<DevinSession> {
  const apiKey = getApiKey();
  
  const response = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Devin API error (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  
  return {
    session_id: data.session_id,
    url: data.url,
    status_enum: data.status_enum,
    structured_output: data.structured_output || null,
    pull_request: data.pull_request,
    updated_at: data.updated_at,
    messages_count: data.messages?.length,
    title: data.title,
  };
}
