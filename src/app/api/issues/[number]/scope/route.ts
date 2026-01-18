import { NextRequest, NextResponse } from 'next/server';
import { getIssue, getRepoInfo } from '@/lib/github';
import { createSession } from '@/lib/devin';
import { SCOPE_OUTPUT_JSON_SCHEMA } from '@/lib/schemas';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> }
) {
  try {
    const { number } = await params;
    const issueNumber = parseInt(number, 10);
    
    if (isNaN(issueNumber)) {
      return NextResponse.json(
        { error: 'Invalid issue number' },
        { status: 400 }
      );
    }
    
    // Fetch issue details from GitHub
    const issue = await getIssue(issueNumber);
    const { owner, repo } = getRepoInfo();
    
    // Construct the scope prompt with structured output schema
    const prompt = `# Task: Scope GitHub Issue #${issueNumber}

## Issue Details
**Repository:** ${owner}/${repo}
**Title:** ${issue.title}
**URL:** ${issue.html_url}

**Description:**
${issue.body || 'No description provided.'}

## Your Task

You are an expert software engineer. Analyze this GitHub issue and produce a comprehensive scope assessment.

1. **Read and understand the issue thoroughly**
2. **Summarize root cause hypotheses** if it's a bug, or implementation approaches if it's a feature
3. **Assess the confidence level** (0-100) based on:
   - Clarity of requirements
   - Availability of reproduction steps
   - Existing test coverage
   - Complexity of the codebase area involved
4. **Identify assumptions you're making**
5. **List unknowns** that need clarification
6. **Identify potential risks**
7. **Create a step-by-step action plan**

## IMPORTANT: Structured Output

You MUST update the structured_output field with the following JSON schema. Update it as your analysis progresses.

\`\`\`json
${SCOPE_OUTPUT_JSON_SCHEMA}
\`\`\`

**Guidelines:**
- Set \`issue_number\` to ${issueNumber}
- Set \`title\` to the issue title
- \`confidence_score\` should be 0-100 based on clarity and feasibility
- \`confidence_rationale\` should explain your score
- Include at least 1-3 items in \`assumptions\`, \`unknowns\`, and \`risks\`
- \`action_plan\` should have 2-5 concrete steps
- Set \`ready_to_execute\` to true when you have a complete plan

Keep updating structured_output as your understanding evolves.`;

    // Create Devin session
    const session = await createSession({
      prompt,
      title: `Scope: ${issue.title.substring(0, 50)}`,
      tags: [
        'cognition-takehome',
        'github-issues',
        'stage:scope',
        `issue:${issueNumber}`,
        `repo:${owner}/${repo}`,
      ],
      unlisted: true,
    });
    
    return NextResponse.json({
      session_id: session.session_id,
      url: session.url,
      issue_number: issueNumber,
      issue_title: issue.title,
    });
  } catch (error) {
    console.error('Error creating scope session:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('environment variable')) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
      
      if (error.message.includes('Devin API')) {
        return NextResponse.json(
          { error: error.message },
          { status: 502 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to create scope session' },
      { status: 500 }
    );
  }
}
