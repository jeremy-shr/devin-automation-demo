import { NextResponse } from 'next/server';
import { listIssues } from '@/lib/github';

export async function GET() {
  try {
    const issues = await listIssues();
    
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
