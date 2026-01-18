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
  state: string;
}

interface IssueModalProps {
  issue: Issue;
  onClose: () => void;
}

export function IssueModal({ issue, onClose }: IssueModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [handleEscape]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="issue-number">#{issue.number}</span>
            <h2 className="modal-title">{issue.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-meta">
          <span className={`state-badge ${issue.state === 'open' ? 'state-open' : 'state-closed'}`}>
            {issue.state === 'open' ? 'Open' : 'Closed'}
          </span>
          
          {issue.labels.length > 0 && (
            <div className="modal-labels">
              {issue.labels.map(label => (
                <span
                  key={label.name}
                  className="label"
                  style={{ backgroundColor: `#${label.color}20`, borderColor: `#${label.color}` }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}
          
          <span className="modal-updated">
            Updated {formatDate(issue.updated_at)}
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
            className="github-link"
          >
            Open in GitHub &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
