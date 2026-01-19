import { NextRequest, NextResponse } from 'next/server';
import { getIssue, getRepoInfo } from '@/lib/github';
import { createSession, getSession } from '@/lib/devin';
import { EXECUTE_OUTPUT_JSON_SCHEMA, ScopeOutputSchema } from '@/lib/schemas';

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
    
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { scopeSessionId, clarifications } = body;
    
    if (!scopeSessionId) {
      return NextResponse.json(
        { error: 'scopeSessionId is required in request body' },
        { status: 400 }
      );
    }
    
    // Fetch the scope session to get the action plan
    const scopeSession = await getSession(scopeSessionId);
    
    if (!scopeSession.structured_output) {
      return NextResponse.json(
        { error: 'Scope session has no structured output yet. Wait for scoping to complete.' },
        { status: 400 }
      );
    }
    
    // Try to parse the scope output
    const scopeResult = ScopeOutputSchema.safeParse(scopeSession.structured_output);
    let actionPlanText = '';
    
    if (scopeResult.success) {
      const scopeOutput = scopeResult.data;
      actionPlanText = scopeOutput.action_plan
        .map(step => `${step.step}. **${step.title}**: ${step.details}`)
        .join('\n');
    } else {
      // Fall back to raw JSON if validation fails
      actionPlanText = JSON.stringify(scopeSession.structured_output, null, 2);
    }
    
    // Fetch issue details
    const issue = await getIssue(issueNumber);
    const { owner, repo } = getRepoInfo();
    const baseBranch = process.env.GITHUB_BASE_BRANCH || 'main';
    
    // Build clarifications section if provided
    const clarificationsSection = clarifications 
      ? `\n## Additional Constraints/Clarifications\n\n${clarifications}\n`
      : '';
    
    // Construct the execute prompt
    const prompt = `# Task: Execute Action Plan for GitHub Issue #${issueNumber}

## Issue Details
**Repository:** ${owner}/${repo}
**Title:** ${issue.title}
**URL:** ${issue.html_url}

**Description:**
${issue.body || 'No description provided.'}

## Action Plan from Scoping Session

${actionPlanText}
${clarificationsSection}
## Your Task

You are an expert software engineer. Execute the action plan above to resolve this GitHub issue.

### Instructions:

1. **Clone the repository** if needed: \`git clone https://github.com/${owner}/${repo}.git\`
2. **Authenticate to GitHub** using the secret GITHUB_TOKEN provided to this session
3. **Create a feature branch** from \`${baseBranch}\`
4. **Implement the changes** following the action plan
5. **Keep changes small and focused** - one logical change at a time
6. **Add or update tests** as appropriate
7. **Update documentation** if necessary
8. **Create a Pull Request** against \`${baseBranch}\`

### PR Guidelines:
- Use a clear, descriptive title referencing issue #${issueNumber}
- Include a summary of changes in the PR description
- Link to the issue using "Fixes #${issueNumber}" or "Closes #${issueNumber}"

## IMPORTANT: Structured Output

You MUST update the structured_output field with progress. Update it frequently as you work.

\`\`\`json
${EXECUTE_OUTPUT_JSON_SCHEMA}
\`\`\`

**Status values:**
- \`pending\` - Not started yet
- \`in_progress\` - Actively working
- \`completed\` - Successfully finished
- \`blocked\` - Need human input or hit an issue
- \`failed\` - Unable to complete

Update structured_output after each major step.`;

    // Get GITHUB_TOKEN for session secret
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return NextResponse.json(
        { error: 'GITHUB_TOKEN environment variable is required for execution' },
        { status: 500 }
      );
    }
    
    // Create Devin execution session with secrets
    const session = await createSession({
      prompt,
      title: `Execute: ${issue.title.substring(0, 50)}`,
      tags: [
        'cognition-takehome',
        'github-issues',
        'stage:execute',
        `issue:${issueNumber}`,
        `repo:${owner}/${repo}`,
        `scope:${scopeSessionId}`,
      ],
      unlisted: true,
      session_secrets: [
        {
          key: 'GITHUB_TOKEN',
          value: githubToken,
          sensitive: true,
        },
      ],
    });
    
    return NextResponse.json({
      session_id: session.session_id,
      url: session.url,
      issue_number: issueNumber,
      issue_title: issue.title,
      scope_session_id: scopeSessionId,
    });
  } catch (error) {
    console.error('Error creating execute session:', error);
    
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
      { error: 'Failed to create execute session' },
      { status: 500 }
    );
  }
}
