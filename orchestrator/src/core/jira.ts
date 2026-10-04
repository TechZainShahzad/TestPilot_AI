/**
 * Thin Jira Cloud REST API client for pulling a story's requirements —
 * same reasoning as `github.ts`: no SDK dependency for a couple of `fetch`
 * calls. Jira Cloud authenticates with HTTP Basic (`email:apiToken`), not
 * a Bearer token like GitHub — a real, easy-to-get-wrong difference.
 *
 * A Jira description comes back as Atlassian Document Format (ADF), a JSON
 * tree, not plain text or Markdown. `adfToPlainText` is a minimal walker
 * over the handful of node types a typical story actually uses
 * (paragraph/text/bulletList/orderedList/listItem/heading/hardBreak) —
 * deliberately not a full ADF renderer, since the only consumer here is an
 * LLM prompt, not a faithful re-rendering of the document.
 */
import { z } from 'zod';

export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

const jiraIssueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    description: z.unknown().nullable(),
    status: z.object({ name: z.string() }),
    labels: z.array(z.string()),
  }),
});

export interface JiraIssue {
  key: string;
  summary: string;
  /** Plain-text rendering of the ADF description, already converted. */
  description: string;
  status: string;
  labels: string[];
  url: string;
}

function authHeader(credentials: JiraCredentials): string {
  const encoded = Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

export async function fetchIssue(key: string, credentials: JiraCredentials): Promise<JiraIssue> {
  const baseUrl = credentials.baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/rest/api/3/issue/${key}`, {
    headers: {
      Authorization: authHeader(credentials),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new JiraApiError(
      `Jira refused to fetch issue "${key}" (${String(response.status)}): ${detail}`,
      response.status
    );
  }

  const data = jiraIssueSchema.parse(await response.json());

  return {
    key: data.key,
    summary: data.fields.summary,
    description: adfToPlainText(data.fields.description),
    status: data.fields.status.name,
    labels: data.fields.labels,
    url: `${baseUrl}/browse/${data.key}`,
  };
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: unknown[];
}

function isAdfNode(value: unknown): value is AdfNode {
  return typeof value === 'object' && value !== null;
}

/** Converts an ADF document (or any sub-node) to plain text, indenting list
 * items with "- " and separating block-level nodes with blank lines. */
export function adfToPlainText(doc: unknown): string {
  if (!isAdfNode(doc)) return '';

  const lines: string[] = [];

  const walk = (node: unknown, listPrefix: string): string => {
    if (!isAdfNode(node)) return '';

    if (node.type === 'text') {
      return node.text ?? '';
    }
    if (node.type === 'hardBreak') {
      return '\n';
    }

    const children = Array.isArray(node.content) ? node.content : [];
    const childText = children.map((child) => walk(child, listPrefix)).join('');

    if (node.type === 'listItem') {
      return `${listPrefix}${childText.trim()}\n`;
    }
    return childText;
  };

  const children = Array.isArray(doc.content) ? doc.content : [];
  for (const block of children) {
    if (!isAdfNode(block)) continue;

    if (block.type === 'bulletList' || block.type === 'orderedList') {
      const items = Array.isArray(block.content) ? block.content : [];
      const rendered = items.map((item) => walk(item, '- ').trimEnd()).join('\n');
      if (rendered.length > 0) lines.push(rendered);
    } else {
      const text = walk(block, '').trim();
      if (text.length > 0) lines.push(text);
    }
  }

  return lines.join('\n\n');
}
