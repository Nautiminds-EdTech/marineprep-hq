import "server-only";

export function githubConfigured() {
  return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

async function github<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function createIssue(title: string, body: string, labels: string[] = []) {
  const issue = await github<{ number: number; html_url: string }>("/issues", {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
  return { number: issue.number, url: issue.html_url };
}

/** "open" or "closed" for each issue number. */
export async function issueStates(numbers: number[]) {
  const states = await Promise.all(
    numbers.map((n) =>
      github<{ state: "open" | "closed" }>(`/issues/${n}`)
        .then((i) => [n, i.state] as const)
        .catch(() => [n, null] as const),
    ),
  );
  return new Map(states);
}
