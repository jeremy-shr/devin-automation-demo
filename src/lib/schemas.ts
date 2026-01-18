import { z } from 'zod';

// Scope session structured output schema
export const ScopeOutputSchema = z.object({
  issue_number: z.number(),
  title: z.string(),
  confidence_score: z.number().min(0).max(100),
  confidence_rationale: z.string(),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string()),
  risks: z.array(z.string()),
  action_plan: z.array(z.object({
    step: z.number(),
    title: z.string(),
    details: z.string(),
  })),
  ready_to_execute: z.boolean(),
});

export type ScopeOutput = z.infer<typeof ScopeOutputSchema>;

// Execute session structured output schema
export const ExecuteOutputSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'failed']),
  current_task: z.string(),
  completed_tasks: z.array(z.string()),
  next_task: z.string(),
  files_changed: z.array(z.string()),
  tests_run: z.object({
    ran: z.boolean(),
    summary: z.string(),
  }),
  needs_human_input: z.boolean(),
  blocking_issue: z.string(),
});

export type ExecuteOutput = z.infer<typeof ExecuteOutputSchema>;

// JSON schema strings for including in prompts
export const SCOPE_OUTPUT_JSON_SCHEMA = `{
  "issue_number": 123,
  "title": "Fix failing auth redirect",
  "confidence_score": 72,
  "confidence_rationale": "Score based on clarity of repro steps + existing tests; reduced due to unclear acceptance criteria.",
  "assumptions": ["The auth redirect bug is related to the OAuth callback handler", "Tests exist for the auth flow"],
  "unknowns": ["Are there any edge cases with different OAuth providers?"],
  "risks": ["Changes to auth flow may affect other login methods"],
  "action_plan": [
    {"step": 1, "title": "Reproduce bug", "details": "Set up a test environment and reproduce the failing auth redirect"},
    {"step": 2, "title": "Implement fix", "details": "Update the OAuth callback handler to correctly redirect"},
    {"step": 3, "title": "Add/adjust tests", "details": "Add test cases for the redirect behavior"}
  ],
  "ready_to_execute": true
}`;

export const EXECUTE_OUTPUT_JSON_SCHEMA = `{
  "status": "in_progress",
  "current_task": "Implementing fix in auth callback",
  "completed_tasks": ["Reproduced bug locally", "Identified root cause"],
  "next_task": "Add tests for redirect behaviour",
  "files_changed": ["src/auth/callback.ts", "src/auth/oauth.ts"],
  "tests_run": {"ran": false, "summary": ""},
  "needs_human_input": false,
  "blocking_issue": ""
}`;
