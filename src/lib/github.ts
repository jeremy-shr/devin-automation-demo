import { Octokit } from 'octokit';

// Initialize Octokit client
function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  return new Octokit({ auth: token });
}

function getRepoConfig() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  
  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
  }
  
  return { owner, repo };
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  labels: Array<{
    name: string;
    color: string;
  }>;
  state: string;
}

export async function listIssues(): Promise<GitHubIssue[]> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoConfig();
  
  const response = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    per_page: 50,
    sort: 'updated',
    direction: 'desc',
  });
  
  // Filter out pull requests (GitHub API returns PRs as issues)
  return response.data
    .filter(issue => !issue.pull_request)
    .map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? null,
      html_url: issue.html_url,
      updated_at: issue.updated_at,
      labels: issue.labels
        .filter((label): label is { name: string; color: string } => 
          typeof label === 'object' && label !== null && 'name' in label
        )
        .map(label => ({
          name: label.name,
          color: label.color || 'gray',
        })),
      state: issue.state,
    }));
}

export async function getIssue(issueNumber: number): Promise<GitHubIssue> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoConfig();
  
  const response = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  
  const issue = response.data;
  
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    html_url: issue.html_url,
    updated_at: issue.updated_at,
    labels: issue.labels
      .filter((label): label is { name: string; color: string } => 
        typeof label === 'object' && label !== null && 'name' in label
      )
      .map(label => ({
        name: label.name,
        color: label.color || 'gray',
      })),
    state: issue.state,
  };
}

export function getRepoInfo() {
  return getRepoConfig();
}
