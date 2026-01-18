'use client';

import { useState } from 'react';

interface RawJsonPanelProps {
  data: unknown;
  title?: string;
}

export function RawJsonPanel({ data, title = 'Raw Output' }: RawJsonPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="raw-json-panel">
      <button
        className="raw-json-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
        <span>{title}</span>
      </button>
      {isExpanded && (
        <pre className="raw-json-content">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
