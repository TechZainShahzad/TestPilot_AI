/**
 * Browser tools exposed to the Explorer agent, backed by a real Playwright
 * `Page` — not Playwright MCP, not a mocked DOM. `snapshot`'s `mode: 'ai'`
 * ARIA tree is the core of this: it gives the model `[ref=e13]`-style
 * element references it can act on directly via `aria-ref=` locators,
 * which is also how Playwright's own MCP server represents a page to an
 * LLM. The model never sees a screenshot or raw HTML — just role, name,
 * and ref, which is exactly what a role/label-based Playwright locator
 * needs.
 */
import type { Page } from 'playwright';
import { z } from 'zod';

import type { ToolImplementation } from '../core/agent-loop.js';
import { zodToToolParameters } from '../core/schema.js';

const MAX_SNAPSHOT_CHARS = 12_000;

const navigateArgs = z.object({
  url: z.string().describe('Absolute URL, or a path relative to the current page'),
});

const refArg = z.string().describe('An element ref from the most recent snapshot, e.g. "e13"');

const clickArgs = z.object({ ref: refArg });

const fillArgs = z.object({
  ref: refArg,
  value: z.string().describe('Text to type into the field'),
});

const selectOptionArgs = z.object({
  ref: refArg,
  value: z.string().describe('The option value or visible label to select'),
});

/** Builds the Explorer's tool set against one live page. */
export function createBrowserTools(page: Page): ToolImplementation[] {
  const snapshot = async (): Promise<unknown> => {
    const aria = await page.ariaSnapshot({ mode: 'ai' });
    const truncated = aria.length > MAX_SNAPSHOT_CHARS;
    return {
      url: page.url(),
      title: await page.title(),
      snapshot: truncated ? `${aria.slice(0, MAX_SNAPSHOT_CHARS)}\n… (truncated)` : aria,
    };
  };

  return [
    {
      definition: {
        name: 'navigate',
        description: 'Navigate the browser to a URL and return the resulting page’s ARIA snapshot.',
        parameters: zodToToolParameters(navigateArgs),
      },
      execute: async (args) => {
        const { url } = navigateArgs.parse(args);
        await page.goto(url, { waitUntil: 'networkidle' });
        return snapshot();
      },
    },
    {
      definition: {
        name: 'snapshot',
        description:
          'Re-read the current page’s ARIA accessibility tree. Call this after any action ' +
          'that might change the page, or whenever element refs from an earlier snapshot may be stale.',
        parameters: zodToToolParameters(z.object({})),
      },
      execute: async () => snapshot(),
    },
    {
      definition: {
        name: 'click',
        description: 'Click the element with the given ref from the most recent snapshot.',
        parameters: zodToToolParameters(clickArgs),
      },
      execute: async (args) => {
        const { ref } = clickArgs.parse(args);
        await page.locator(`aria-ref=${ref}`).click();
        await page.waitForLoadState('networkidle').catch(() => undefined);
        return snapshot();
      },
    },
    {
      definition: {
        name: 'fill',
        description: 'Type text into the input/textarea with the given ref.',
        parameters: zodToToolParameters(fillArgs),
      },
      execute: async (args) => {
        const { ref, value } = fillArgs.parse(args);
        await page.locator(`aria-ref=${ref}`).fill(value);
        return snapshot();
      },
    },
    {
      definition: {
        name: 'select_option',
        description: 'Choose an option in the <select> element with the given ref.',
        parameters: zodToToolParameters(selectOptionArgs),
      },
      execute: async (args) => {
        const { ref, value } = selectOptionArgs.parse(args);
        await page.locator(`aria-ref=${ref}`).selectOption(value);
        return snapshot();
      },
    },
    {
      definition: {
        name: 'go_back',
        description: 'Navigate back to the previous page in browser history.',
        parameters: zodToToolParameters(z.object({})),
      },
      execute: async () => {
        await page.goBack({ waitUntil: 'networkidle' });
        return snapshot();
      },
    },
  ];
}
