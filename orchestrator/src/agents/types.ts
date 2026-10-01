/**
 * Typed shapes for every artifact an agent writes to the run folder. Zod
 * schemas double as the JSON Schema fed to the "submit" tool each agent
 * calls to end its turn — see `core/agent-loop.ts` for why a dedicated
 * terminal tool call, not free-text JSON, is how structured output leaves
 * an agent.
 */
import { z } from 'zod';

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

export const testPlanSchema = z.object({
  feature: z.string(),
  summary: z.string(),
  cases: z.array(testCaseSchema),
});
export type TestPlan = z.infer<typeof testPlanSchema>;
