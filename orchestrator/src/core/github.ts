/**
 * Thin GitHub REST API client for opening the Reporter's pull request — no
 * `gh` CLI dependency, since it may not be installed, and no octokit
 * dependency, since one `fetch` call doesn't need an SDK.
 */
export interface CreatePullRequestOptions {
  token: string;
  repo: string; // "owner/name"
  title: string;
  body: string;
  head: string; // branch the PR is from
  base: string; // branch the PR merges into
}

export interface CreatePullRequestResult {
  url: string;
  number: number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface ExistingPullRequest {
  url: string;
  number: number;
  state: string;
}

/**
 * Checks whether a PR already referencing `ticketKey` exists, so a
 * `--jira-ticket` run can warn instead of silently duplicating work. Uses
 * GitHub's search API rather than a separate local record of past runs —
 * GitHub itself is the source of truth for "has a PR been raised," and a
 * local record could drift out of sync with reality (a PR closed or
 * merged outside this tool would leave a local record lying).
 */
export async function findExistingPullRequest(
  repo: string,
  token: string | undefined,
  ticketKey: string
): Promise<ExistingPullRequest | undefined> {
  const query = `repo:${repo} type:pr in:title ${ticketKey}`;
  const response = await fetch(
    `https://api.github.com/search/issues?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token !== undefined && { Authorization: `Bearer ${token}` }),
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new GitHubApiError(
      `GitHub search API failed (${String(response.status)}): ${detail}`,
      response.status
    );
  }

  const data = (await response.json()) as {
    items: { html_url: string; number: number; state: string }[];
  };
  const first = data.items[0];
  return first && { url: first.html_url, number: first.number, state: first.state };
}

export async function createPullRequest(
  options: CreatePullRequestOptions
): Promise<CreatePullRequestResult> {
  const { token, repo, title, body, head, base } = options;

  const response = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new GitHubApiError(
      `GitHub API refused to open the pull request (${String(response.status)}): ${detail}`,
      response.status
    );
  }

  const data = (await response.json()) as { html_url: string; number: number };
  return { url: data.html_url, number: data.number };
}
