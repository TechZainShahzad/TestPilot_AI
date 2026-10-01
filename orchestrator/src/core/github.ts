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
