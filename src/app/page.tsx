'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { IssueRow } from '@/components/IssueRow';

type IssueState = 'open' | 'closed' | 'all';

interface Issue {
  number: number;
  title: string;
  body: string | null;
  body_snippet: string | null;
  html_url: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  state: string;
}

interface ConfigStatus {
  hasDevinKey: boolean;
  hasGithubToken: boolean;
  hasGithubOwner: boolean;
  hasGithubRepo: boolean;
  repoName?: string;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const getInitialState = (): IssueState => {
    const stateParam = searchParams.get('state');
    if (stateParam === 'open' || stateParam === 'closed' || stateParam === 'all') {
      return stateParam;
    }
    return 'open';
  };

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configStatus] = useState<ConfigStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [stateFilter, setStateFilter] = useState<IssueState>(getInitialState);

  const uniqueLabels = useMemo(() => {
    const labelSet = new Set<string>();
    issues.forEach(issue => {
      issue.labels.forEach(label => labelSet.add(label.name));
    });
    return Array.from(labelSet).sort();
  }, [issues]);

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      const matchesSearch = searchQuery === '' || 
        issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.number.toString().includes(searchQuery);
      
      const matchesLabel = selectedLabel === '' ||
        issue.labels.some(label => label.name === selectedLabel);
      
      return matchesSearch && matchesLabel;
    });
  }, [issues, searchQuery, selectedLabel]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedLabel('');
  };

  const hasActiveFilters = searchQuery !== '' || selectedLabel !== '';

  const handleStateChange = useCallback((newState: IssueState) => {
    setStateFilter(newState);
    const params = new URLSearchParams(searchParams.toString());
    if (newState === 'open') {
      params.delete('state');
    } else {
      params.set('state', newState);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl);
  }, [searchParams, router]);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/issues?state=${stateFilter}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch issues');
      }
      
      setIssues(data.issues || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, [stateFilter]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const renderConfigWarnings = () => {
    if (!configStatus) return null;
    
    const missing: string[] = [];
    if (!configStatus.hasDevinKey) missing.push('DEVIN_API_KEY');
    if (!configStatus.hasGithubToken) missing.push('GITHUB_TOKEN');
    if (!configStatus.hasGithubOwner) missing.push('GITHUB_OWNER');
    if (!configStatus.hasGithubRepo) missing.push('GITHUB_REPO');
    
    if (missing.length === 0) return null;
    
    return (
      <div className="config-warning">
        <h3>⚠️ Missing Environment Variables</h3>
        <p>The following environment variables are not set:</p>
        <ul>
          {missing.map(v => <li key={v}><code>{v}</code></li>)}
        </ul>
        <p>Check your <code>.env.local</code> file.</p>
      </div>
    );
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <h1>🤖 Devin Automation</h1>
          <p className="subtitle">GitHub Issues → Devin Sessions</p>
        </div>
        <button onClick={fetchIssues} className="refresh-button" disabled={loading}>
          {loading ? '⟳ Loading...' : '⟳ Refresh'}
        </button>
      </header>
      
      {renderConfigWarnings()}
      
      <main className="main">
        {loading && issues.length === 0 && (
          <div className="loading-state">
            <div className="loading-spinner large" />
            <p>Fetching issues...</p>
          </div>
        )}
        
        {error && (
          <div className="error-state">
            <h3>❌ Error</h3>
            <p>{error}</p>
            <button onClick={fetchIssues} className="retry-button">
              Try Again
            </button>
          </div>
        )}
        
        {!loading && !error && issues.length === 0 && (
          <div className="empty-state">
            <h3>📭 No {stateFilter === 'all' ? '' : stateFilter.charAt(0).toUpperCase() + stateFilter.slice(1) + ' '}Issues</h3>
            <p>There are no {stateFilter === 'all' ? '' : stateFilter + ' '}issues in the configured repository.</p>
          </div>
        )}
        
        {issues.length > 0 && (
          <div className="issues-list">
            <div className="issues-header">
              <span className="issues-count">
                {filteredIssues.length} of {issues.length} issue{issues.length !== 1 ? 's' : ''}
              </span>
              <div className="filter-controls">
                <div className="state-toggle">
                  <button
                    className={`state-toggle-button ${stateFilter === 'open' ? 'active' : ''}`}
                    onClick={() => handleStateChange('open')}
                  >
                    Open
                  </button>
                  <button
                    className={`state-toggle-button ${stateFilter === 'closed' ? 'active' : ''}`}
                    onClick={() => handleStateChange('closed')}
                  >
                    Closed
                  </button>
                  <button
                    className={`state-toggle-button ${stateFilter === 'all' ? 'active' : ''}`}
                    onClick={() => handleStateChange('all')}
                  >
                    All
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search by title or #number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <select
                  value={selectedLabel}
                  onChange={(e) => setSelectedLabel(e.target.value)}
                  className="label-select"
                >
                  <option value="">All labels</option>
                  {uniqueLabels.map(label => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="clear-filters-button">
                    Clear filters
                  </button>
                )}
              </div>
            </div>
            {filteredIssues.length === 0 ? (
              <div className="empty-state">
                <h3>No matching issues</h3>
                <p>No issues match your current filters.</p>
                <button onClick={clearFilters} className="retry-button">
                  Clear filters
                </button>
              </div>
            ) : (
              filteredIssues.map(issue => (
                <IssueRow key={issue.number} issue={issue} />
              ))
            )}
          </div>
        )}
      </main>
      
      <footer className="footer">
        <p>
          Powered by{' '}
          <a href="https://devin.ai" target="_blank" rel="noopener noreferrer">
            Devin AI
          </a>
          {' '}•{' '}
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            GitHub API
          </a>
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="container">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
