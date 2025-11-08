import type { GithubSettings } from "@shared/schema";

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
}

interface GitHubRepository {
  name: string;
  full_name: string;
  description: string;
  default_branch: string;
}

export class GitHubService {
  private settings: GithubSettings;
  private baseURL = "https://api.github.com";

  constructor(settings: GithubSettings) {
    this.settings = settings;
  }

  updateSettings(settings: GithubSettings) {
    this.settings = settings;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const response = await this.request(`/repos/${owner}/${repo}`);
    return response;
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<string> {
    const url = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`;
    const response = await this.request(url);

    if (response.content) {
      // GitHub returns base64 encoded content
      return Buffer.from(response.content, "base64").toString("utf-8");
    }

    throw new Error("File content not available");
  }

  async listFiles(
    owner: string,
    repo: string,
    path: string = "",
    ref?: string
  ): Promise<GitHubFile[]> {
    const url = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`;
    const response = await this.request(url);
    return Array.isArray(response) ? response : [response];
  }

  async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async createPullRequestComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
    path?: string,
    position?: number
  ): Promise<void> {
    const comment: any = { body };
    
    if (path && position) {
      comment.path = path;
      comment.position = position;
      await this.request(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify(comment),
        }
      );
    } else {
      await this.createComment(owner, repo, pullNumber, body);
    }
  }

  async getBranch(owner: string, repo: string, branch: string) {
    return this.request(`/repos/${owner}/${repo}/branches/${branch}`);
  }

  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromBranch: string = "main"
  ): Promise<void> {
    const baseBranch = await this.getBranch(owner, repo, fromBranch);
    const sha = baseBranch.commit.sha;

    await this.request(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha,
      }),
    });
  }

  async verifyWebhook(payload: string, signature: string): Promise<boolean> {
    if (!this.settings.webhookSecret) {
      return true; // No secret configured, accept all
    }

    const crypto = await import("crypto");
    const hmac = crypto.createHmac("sha256", this.settings.webhookSecret);
    const digest = "sha256=" + hmac.update(payload).digest("hex");
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseURL}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.settings.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.statusText}`);
    }

    return response.json();
  }
}
