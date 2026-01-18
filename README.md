# Devin Automation

A lightweight integration between GitHub Issues and Devin AI sessions for automated issue scoping and execution.

![Dashboard Preview](./docs/dashboard-preview.png)

## Overview

This application allows you to:

1. **View GitHub Issues** - List all open issues from a configured repository
2. **Scope Issues with Devin** - Trigger a Devin session to analyze an issue and produce:
   - Confidence score (0-100) with rationale
   - Assumptions and unknowns
   - Action plan with concrete steps
3. **Execute Action Plans** - Trigger a second Devin session to implement the plan and create a PR
4. **Monitor Progress** - Poll and display session status, structured output, and PR URLs

## Tech Stack

- **Frontend**: React with TypeScript
- **Backend**: Next.js App Router (API routes)
- **GitHub API**: Octokit for issue management
- **Devin API**: v1 API for session management
- **Styling**: Vanilla CSS with dark theme

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- [Devin API key](https://app.devin.ai/settings/api-keys)
- [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope

### Installation

```bash
# Clone or navigate to the project
cd devin-automation

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your credentials
```

### Configuration

Create a `.env.local` file with the following variables:

```env
# Required
DEVIN_API_KEY=your_devin_api_key
GITHUB_TOKEN=ghp_your_token
GITHUB_OWNER=your-org-or-username
GITHUB_REPO=your-repo-name

# Optional
GITHUB_BASE_BRANCH=main
```

### Running the App

```bash
# Development mode
npm run dev

# Open http://localhost:3000
```

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── issues/
│   │   │   ├── route.ts              # GET /api/issues
│   │   │   └── [number]/
│   │   │       ├── scope/route.ts    # POST /api/issues/:n/scope
│   │   │       └── execute/route.ts  # POST /api/issues/:n/execute
│   │   └── sessions/
│   │       └── [sessionId]/route.ts  # GET /api/sessions/:id
│   ├── page.tsx                      # Main dashboard
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── IssueRow.tsx                  # Issue with actions
│   └── SessionStatus.tsx             # Session polling & display
└── lib/
    ├── github.ts                     # GitHub API client
    ├── devin.ts                      # Devin API client
    └── schemas.ts                    # Zod schemas & prompts
```

## API Routes

### GET /api/issues

Lists open issues from the configured repository.

**Response:**
```json
{
  "issues": [
    {
      "number": 123,
      "title": "Bug: Auth redirect fails",
      "body_snippet": "When logging in...",
      "html_url": "https://github.com/...",
      "labels": [{"name": "bug", "color": "d73a4a"}],
      "updated_at": "2024-01-15T..."
    }
  ]
}
```

### POST /api/issues/:number/scope

Creates a Devin session to scope the issue.

**Response:**
```json
{
  "session_id": "ses_abc123",
  "url": "https://app.devin.ai/sessions/...",
  "issue_number": 123,
  "issue_title": "Bug: Auth redirect fails"
}
```

**Structured Output Schema:**
```json
{
  "issue_number": 123,
  "title": "Bug: Auth redirect fails",
  "confidence_score": 72,
  "confidence_rationale": "Clear repro steps but...",
  "assumptions": ["..."],
  "unknowns": ["..."],
  "risks": ["..."],
  "action_plan": [
    {"step": 1, "title": "...", "details": "..."}
  ],
  "ready_to_execute": true
}
```

### POST /api/issues/:number/execute

Creates a Devin session to execute the action plan and create a PR.

**Request:**
```json
{
  "scopeSessionId": "ses_abc123"
}
```

**Response:**
```json
{
  "session_id": "ses_def456",
  "url": "https://app.devin.ai/sessions/...",
  "scope_session_id": "ses_abc123"
}
```

### GET /api/sessions/:sessionId

Proxies Devin session details (avoids exposing API key to client).

**Response:**
```json
{
  "session_id": "ses_abc123",
  "url": "https://app.devin.ai/sessions/...",
  "status_enum": "running",
  "structured_output": {...},
  "pull_request_url": "https://github.com/.../pull/45",
  "updated_at": "2024-01-15T..."
}
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **15-second polling** | Balances responsiveness with API rate limits (Devin recommends 10-30s) |
| **Full schema in prompts** | Per Devin best practices for reliable structured output |
| **Session secrets for tokens** | Secure token passing; Devin receives as environment variable |
| **Proxy endpoint for sessions** | Avoids exposing DEVIN_API_KEY to browser |
| **localStorage persistence** | Session IDs survive page refresh, keyed by issue number |
| **Unlisted sessions** | Privacy; sessions not visible in Devin workspace |

## Demo Script (for Loom)

Follow these steps to record a demo:

### 1. Setup (30 seconds)
- Show `.env.local` configuration (blur secrets)
- Run `npm run dev`
- Open http://localhost:3000

### 2. List Issues (15 seconds)
- Dashboard loads with open issues from your repo
- Point out issue numbers, titles, labels, and snippets

### 3. Scope an Issue (2-3 minutes)
- Click **"🔍 Scope"** on an issue
- Show the session starting (status badge: `pending` → `running`)
- Wait for structured output to appear:
  - Confidence score with rationale
  - Assumptions, unknowns, risks
  - Action plan steps
- Optionally click through to Devin UI

### 4. Execute the Plan (2-3 minutes)
- Click **"🚀 Execute"** on the same issue
- Show execution session starting
- Observe progress updates in structured output:
  - `status: in_progress`
  - `current_task`, `completed_tasks`
  - `files_changed`
- Wait for PR URL to appear (green link)

### 5. Verify PR (30 seconds)
- Click the PR link
- Show the PR created by Devin
- Note that it references the issue

### Total Demo Time: ~5-6 minutes

## Error Handling

The app handles common error scenarios:

- **Missing env vars**: Clear error message on API calls
- **GitHub rate limits**: 429 response with user-friendly message
- **Devin API errors**: Displayed in UI with retry option
- **Session timeouts**: Polling stops when status is terminal

## Session States

| Status | Description |
|--------|-------------|
| `pending` | Session created, waiting to start |
| `running` | Devin is actively working |
| `blocked` | Needs human input |
| `paused` | User paused the session |
| `finished` | Successfully completed |
| `failed` | Error during execution |
| `cancelled` | User cancelled |
| `expired` | Session timed out |

## Development

```bash
# Run development server
npm run dev

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build for production
npm run build
```

## License

MIT

---

Built for the Cognition take-home project.
