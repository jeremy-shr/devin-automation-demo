'use client';

import { useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

interface Issue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  state?: string;
}

interface IssueDetailsModalProps {
  issue: Issue;
  isOpen: boolean;
  onClose: () => void;
}

export function IssueDetailsModal({ issue, isOpen, onClose }: IssueDetailsModalProps) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const stateColor = issue.state === 'open' ? 'var(--accent-green)' : 'var(--accent-purple)';

  return (
    <div 
      className="modal-backdrop" 
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-content" role="document">
        <div className="modal-header">
          <div className="modal-title-section">
            <span className="issue-number">#{issue.number}</span>
            <h2 id="modal-title" className="modal-title">{issue.title}</h2>
          </div>
          <button 
            className="modal-close-button" 
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className="modal-meta">
          <span 
            className="state-badge"
            style={{ 
              backgroundColor: `${stateColor}20`,
              borderColor: stateColor,
              color: stateColor
            }}
          >
            {issue.state || 'open'}
          </span>

          {issue.labels.length > 0 && (
            <div className="modal-labels">
              {issue.labels.map(label => (
                <span 
                  key={label.name}
                  className="label"
                  style={{ 
                    backgroundColor: `#${label.color}20`, 
                    borderColor: `#${label.color}` 
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}

          <span className="modal-updated">
            Updated {new Date(issue.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>

        <div className="modal-body">
          {issue.body ? (
            <div className="markdown-content">
              <ReactMarkdown>{issue.body}</ReactMarkdown>
            </div>
          ) : (
            <p className="no-description">No description provided.</p>
          )}
        </div>

        <div className="modal-footer">
          <a 
            href={issue.html_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="open-github-link"
          >
            Open in GitHub
          </a>
          <button className="modal-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
