/**
 * Typed shapes for every artifact an agent writes to the run folder. Zod
 * schemas double as the JSON Schema fed to the "submit" tool each agent
 * calls to end its turn — see `core/agent-loop.ts` for why a dedicated
 * terminal tool call, not free-text JSON, is how structured output leaves
 * an agent.
 */
import { z } from 'zod';

// ----------------------------------------------------------------- Analyst --

export const requirementsBriefSchema = z.object({
  understanding: z
    .string()
    .describe('Plain-language restatement of what this ticket actually asks for, in 1-3 sentences'),
  acceptanceCriteria: z
    .array(z.string())
    .describe(
      'Each acceptance criterion from the ticket, extracted as its own entry, as close to the original wording as possible — never merged or invented'
    ),
  explorationHints: z
    .array(z.string())
    .describe(
      'Concrete guidance for the Explorer: which pages, UI states, or flows to look for to exercise each criterion'
    ),
  openQuestions: z
    .array(z.string())
    .describe('Anything genuinely ambiguous or unverifiable from the ticket text alone'),
});
export type RequirementsBrief = z.infer<typeof requirementsBriefSchema>;

// ---------------------------------------------------------------- Explorer --

export const elementCandidateSchema = z.object({
  page: z.string().describe('URL or path of the page this element was found on'),
  role: z.string().describe('ARIA role, e.g. "button", "textbox", "link"'),
  name: z.string().describe('Accessible name — the visible label or text'),
  locatorHint: z
    .string()
    .describe(
      'Playwright locator expression a page object could use, preferring ' +
        'getByRole/getByLabel/getByTestId over CSS, e.g. ' +
        "getByRole('button', { name: 'Send Payment' })"
    ),
  purpose: z.string().describe('What this element does in the flow'),
});
export type ElementCandidate = z.infer<typeof elementCandidateSchema>;

export const pageRecordSchema = z.object({
  url: z.string(),
  title: z.string(),
  purpose: z.string().describe('What this screen is for, in one sentence'),
});
export type PageRecord = z.infer<typeof pageRecordSchema>;

export const flowRecordSchema = z.object({
  name: z.string().describe('Short name for this user flow, e.g. "Happy path payment"'),
  steps: z.array(z.string()).describe('Ordered, human-readable steps the Explorer actually took'),
});
export type FlowRecord = z.infer<typeof flowRecordSchema>;

export const explorationResultSchema = z.object({
  feature: z.string(),
  targetUrl: z.string(),
  pages: z.array(pageRecordSchema),
  elements: z.array(elementCandidateSchema),
  flows: z.array(flowRecordSchema),
  notes: z.string().describe('Anything surprising, ambiguous, or worth the Planner knowing'),
});
export type ExplorationResult = z.infer<typeof explorationResultSchema>;

// ----------------------------------------------------------------- Planner --

export const testCaseTypeSchema = z.enum(['positive', 'negative', 'boundary']);
export type TestCaseType = z.infer<typeof testCaseTypeSchema>;

export const testCasePrioritySchema = z.enum(['P0', 'P1', 'P2']);
export type TestCasePriority = z.infer<typeof testCasePrioritySchema>;

export const testCaseSchema = z.object({
  id: z.string().describe('Short stable id, e.g. "TC-01"'),
  title: z.string(),
  type: testCaseTypeSchema,
  priority: testCasePrioritySchema,
  preconditions: z.array(z.string()),
  steps: z.array(z.string()),
  expected: z.string().describe('The single observable outcome that makes this case pass or fail'),
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const requirementCoverageSchema = z.object({
  criterion: z
    .string()
    .describe('One acceptance criterion from the ticket, verbatim or lightly paraphrased'),
  caseIds: z
    .array(z.string())
    .describe('IDs of every test case in this plan that verifies this criterion'),
});
export type RequirementCoverage = z.infer<typeof requirementCoverageSchema>;

export const testPlanSchema = z.object({
  feature: z.string(),
  summary: z.string(),
  /** One entry per acceptance criterion in the source ticket, mapped to the
   * case(s) that verify it — a visible traceability record of what the
   * Planner understood from the requirements, not just the cases it
   * produced. Empty when no requirements were given (a plain --feature
   * run has no acceptance criteria to map). */
  requirementsCoverage: z.array(requirementCoverageSchema).default([]),
  cases: z.array(testCaseSchema),
});
export type TestPlan = z.infer<typeof testPlanSchema>;

// ---------------------------------------------------------------- Generator --

export const generatedFileSchema = z.object({
  path: z.string().describe('File path relative to framework/, e.g. "tests/ui/bill-pay.spec.ts"'),
  reason: z.string().describe('Why this file was created or changed'),
});
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const generationResultSchema = z.object({
  summary: z.string(),
  filesWritten: z.array(generatedFileSchema),
  reusedPageObjects: z
    .array(z.string())
    .describe('Existing page objects/fixtures reused rather than duplicated'),
});
export type GenerationResult = z.infer<typeof generationResultSchema>;

// ----------------------------------------------------------------- Executor --

export const testStatusSchema = z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
export type TestStatus = z.infer<typeof testStatusSchema>;

export const testResultSchema = z.object({
  file: z.string(),
  title: z.string(),
  status: testStatusSchema,
  durationMs: z.number(),
  error: z.string().optional(),
});
export type TestResult = z.infer<typeof testResultSchema>;

export const executionResultSchema = z.object({
  attempt: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  tests: z.array(testResultSchema),
});
export type ExecutionResult = z.infer<typeof executionResultSchema>;

// ------------------------------------------------------------------- Healer --

export const healingVerdictSchema = z.object({
  test: z.string().describe("The failing test's title"),
  verdict: z.enum(['fixed', 'suspected_app_bug', 'could_not_diagnose']),
  explanation: z.string(),
});
export type HealingVerdict = z.infer<typeof healingVerdictSchema>;

export const healingResultSchema = z.object({
  attempt: z.number(),
  verdicts: z.array(healingVerdictSchema),
});
export type HealingResult = z.infer<typeof healingResultSchema>;

// ------------------------------------------------------------------ Reviewer --

export const reviewFindingSchema = z.object({
  file: z.string(),
  issue: z.string(),
  severity: z.enum(['blocking', 'advisory']),
});
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const reviewResultSchema = z.object({
  round: z.number(),
  verdict: z.enum(['approved', 'rejected']),
  lintPassed: z.boolean(),
  typecheckPassed: z.boolean(),
  findings: z.array(reviewFindingSchema),
  summary: z.string(),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;
