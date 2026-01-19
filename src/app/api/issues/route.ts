import { NextRequest, NextResponse } from 'next/server';
import { listIssues, IssueState } from '@/lib/github';

const VALID_STATES: IssueState[] = ['open', 'closed', 'all'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stateParam = searchParams.get('state');
    const state: IssueState = stateParam && VALID_STATES.includes(stateParam as IssueState)
      ? (stateParam as IssueState)
      : 'open';
    
    const issues = await listIssues(state);
    
    // Return issues with body snippet
    const issuesWithSnippet = issues.map(issue => ({
      ...issue,
      body_snippet: issue.body 
        ? issue.body.substring(0, 200) + (issue.body.length > 200 ? '...' : '')
        : null,
    }));
    
    return NextResponse.json({ issues: issuesWithSnippet });
  } catch (error) {
    console.error('Error fetching issues:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('environment variable')) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
      
      // Handle GitHub API rate limiting
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: 'GitHub API rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    );
  }
}
