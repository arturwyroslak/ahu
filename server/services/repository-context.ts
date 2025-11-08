import type { IStorage } from "../storage";
import type { RepositoryContext, InsertRepositoryContext } from "@shared/schema";
import { GitHubService } from "./github";
import { AIService } from "./ai";

interface FileInfo {
  path: string;
  type: string;
  size: number;
  sha: string;
}

interface ArchitectureInfo {
  framework?: string;
  language?: string;
  buildSystem?: string;
  testFramework?: string;
  directories: Record<string, string>;
  patterns: string[];
}

interface DependencyInfo {
  name: string;
  version: string;
  type: "production" | "development" | "peer";
}

interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

interface IssueInfo {
  number: number;
  title: string;
  state: string;
  labels: string[];
}

export class RepositoryContextService {
  private storage: IStorage;
  private githubService: GitHubService;
  private aiService: AIService | null;

  constructor(storage: IStorage, githubService: GitHubService, aiService?: AIService) {
    this.storage = storage;
    this.githubService = githubService;
    this.aiService = aiService || null;
  }

  async getOrCreateContext(repository: string): Promise<RepositoryContext> {
    let context = await this.storage.getRepositoryContext(repository);
    
    if (!context) {
      const insertContext: InsertRepositoryContext = {
        repository,
      };
      context = await this.storage.createRepositoryContext(insertContext);
    }

    return context;
  }

  async updateArchitecture(repository: string, files: FileInfo[]): Promise<void> {
    const architecture = await this.analyzeArchitecture(files);
    await this.storage.updateRepositoryContext(repository, { architecture });
  }

  async updateDependencies(repository: string, owner: string, repo: string): Promise<void> {
    const dependencies = await this.analyzeDependencies(owner, repo);
    await this.storage.updateRepositoryContext(repository, { dependencies });
  }

  async addCommit(repository: string, commit: CommitInfo): Promise<void> {
    const context = await this.getOrCreateContext(repository);
    const recentCommits = context.recentCommits || [];
    
    const updated = [commit, ...recentCommits.slice(0, 49)];
    await this.storage.updateRepositoryContext(repository, { 
      recentCommits: updated as Array<Record<string, any>>
    });
  }

  async refreshContext(repository: string): Promise<RepositoryContext> {
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository format. Expected 'owner/repo'");
    }

    const context = await this.getOrCreateContext(repository);

    try {
      const [repoInfo, files, branches] = await Promise.all([
        this.githubService.getRepository(owner, repo),
        this.fetchAllFiles(owner, repo),
        this.fetchBranches(owner, repo),
      ]);

      const [architecture, dependencies, commits, issues] = await Promise.all([
        this.analyzeArchitecture(files),
        this.analyzeDependencies(owner, repo),
        this.fetchRecentCommits(owner, repo),
        this.fetchOpenIssues(owner, repo),
      ]);

      const fileStructure = files.map((f) => f.path);

      await this.storage.updateRepositoryContext(repository, {
        architecture,
        dependencies,
        fileStructure,
        branches: branches as Array<Record<string, any>>,
        recentCommits: commits as Array<Record<string, any>>,
        openIssues: issues as Array<Record<string, any>>,
      });

      if (this.aiService) {
        const summary = await this.generateSemanticSummary(repository, {
          architecture,
          dependencies,
          fileStructure,
          recentCommits: commits,
        });
        await this.storage.updateRepositoryContext(repository, { semanticSummary: summary });
      }

      return (await this.storage.getRepositoryContext(repository))!;
    } catch (error) {
      console.error(`Error refreshing context for ${repository}:`, error);
      throw error;
    }
  }

  async getSemanticSummary(repository: string): Promise<string> {
    const context = await this.storage.getRepositoryContext(repository);
    
    if (context?.semanticSummary) {
      return context.semanticSummary;
    }

    if (!this.aiService) {
      return "AI service not configured. Unable to generate semantic summary.";
    }

    const summary = await this.generateSemanticSummary(repository, {
      architecture: context?.architecture,
      dependencies: context?.dependencies,
      fileStructure: context?.fileStructure,
      recentCommits: context?.recentCommits,
    });

    await this.storage.updateRepositoryContext(repository, { semanticSummary: summary });
    return summary;
  }

  private async fetchAllFiles(owner: string, repo: string, path: string = ""): Promise<FileInfo[]> {
    try {
      const items = await this.githubService.listFiles(owner, repo, path);
      const files: FileInfo[] = [];

      for (const item of items) {
        if (item.type === "file") {
          files.push({
            path: item.path,
            type: item.type,
            size: item.size,
            sha: item.sha,
          });
        } else if (item.type === "dir") {
          const subFiles = await this.fetchAllFiles(owner, repo, item.path);
          files.push(...subFiles);
        }
      }

      return files;
    } catch (error) {
      console.error(`Error fetching files for ${owner}/${repo}:`, error);
      return [];
    }
  }

  private async fetchBranches(owner: string, repo: string): Promise<BranchInfo[]> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${(this.githubService as any).settings.token}`,
          },
        }
      );
      
      if (!response.ok) return [];
      
      const branches = await response.json();
      return branches.map((b: any) => ({
        name: b.name,
        sha: b.commit.sha,
        protected: b.protected || false,
      }));
    } catch (error) {
      console.error(`Error fetching branches:`, error);
      return [];
    }
  }

  private async fetchRecentCommits(owner: string, repo: string, limit: number = 50): Promise<CommitInfo[]> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${(this.githubService as any).settings.token}`,
          },
        }
      );
      
      if (!response.ok) return [];
      
      const commits = await response.json();
      return commits.map((c: any) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
      }));
    } catch (error) {
      console.error(`Error fetching commits:`, error);
      return [];
    }
  }

  private async fetchOpenIssues(owner: string, repo: string): Promise<IssueInfo[]> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${(this.githubService as any).settings.token}`,
          },
        }
      );
      
      if (!response.ok) return [];
      
      const issues = await response.json();
      return issues
        .filter((i: any) => !i.pull_request)
        .map((i: any) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          labels: i.labels.map((l: any) => l.name),
        }));
    } catch (error) {
      console.error(`Error fetching issues:`, error);
      return [];
    }
  }

  private async analyzeArchitecture(files: FileInfo[]): Promise<Record<string, any>> {
    const architecture: ArchitectureInfo = {
      directories: {},
      patterns: [],
    };

    const paths = files.map((f) => f.path);
    const directories = new Set<string>();
    
    for (const path of paths) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        directories.add(parts.slice(0, i).join("/"));
      }
    }

    if (paths.some((p) => p.includes("package.json"))) {
      architecture.language = "JavaScript/TypeScript";
      architecture.buildSystem = "npm/yarn";
    }
    if (paths.some((p) => p.includes("requirements.txt") || p.includes("setup.py"))) {
      architecture.language = "Python";
    }
    if (paths.some((p) => p.includes("go.mod"))) {
      architecture.language = "Go";
    }
    if (paths.some((p) => p.includes("Cargo.toml"))) {
      architecture.language = "Rust";
      architecture.buildSystem = "Cargo";
    }

    if (paths.some((p) => p.includes("vite.config"))) {
      architecture.framework = "Vite";
    } else if (paths.some((p) => p.includes("next.config"))) {
      architecture.framework = "Next.js";
    } else if (paths.some((p) => p.includes("nuxt.config"))) {
      architecture.framework = "Nuxt";
    }

    if (paths.some((p) => p.includes("jest.config") || p.includes("vitest.config"))) {
      architecture.testFramework = paths.some((p) => p.includes("vitest")) ? "Vitest" : "Jest";
    }

    for (const dir of Array.from(directories)) {
      const dirName = dir.split("/").pop() || "";
      if (["src", "lib", "app", "pages", "components"].includes(dirName)) {
        architecture.directories[dir] = "Source code";
      } else if (["test", "tests", "__tests__"].includes(dirName)) {
        architecture.directories[dir] = "Tests";
      } else if (["docs", "documentation"].includes(dirName)) {
        architecture.directories[dir] = "Documentation";
      } else if (["config", "configs"].includes(dirName)) {
        architecture.directories[dir] = "Configuration";
      }
    }

    if (paths.some((p) => p.match(/.*\.(test|spec)\.(ts|js|tsx|jsx)$/))) {
      architecture.patterns.push("Unit tests");
    }
    if (paths.some((p) => p.includes("e2e") || p.includes("cypress"))) {
      architecture.patterns.push("E2E tests");
    }
    if (paths.some((p) => p.includes("docker"))) {
      architecture.patterns.push("Docker containerization");
    }
    if (paths.some((p) => p.includes(".github/workflows"))) {
      architecture.patterns.push("GitHub Actions CI/CD");
    }

    return architecture as Record<string, any>;
  }

  private async analyzeDependencies(owner: string, repo: string): Promise<Record<string, any>> {
    const dependencies: Record<string, DependencyInfo[]> = {
      production: [],
      development: [],
    };

    try {
      const packageJson = await this.githubService.getFileContent(owner, repo, "package.json");
      const pkg = JSON.parse(packageJson);

      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          dependencies.production.push({
            name,
            version: version as string,
            type: "production",
          });
        }
      }

      if (pkg.devDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies)) {
          dependencies.development.push({
            name,
            version: version as string,
            type: "development",
          });
        }
      }
    } catch (error) {
    }

    try {
      const requirementsTxt = await this.githubService.getFileContent(owner, repo, "requirements.txt");
      const lines = requirementsTxt.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
      
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)([=<>!]+)?([\d.]+)?/);
        if (match) {
          dependencies.production.push({
            name: match[1],
            version: match[3] || "latest",
            type: "production",
          });
        }
      }
    } catch (error) {
    }

    try {
      const goMod = await this.githubService.getFileContent(owner, repo, "go.mod");
      const lines = goMod.split("\n");
      
      for (const line of lines) {
        const match = line.match(/^\s+([a-zA-Z0-9_.\/-]+)\s+v?([\d.]+)/);
        if (match) {
          dependencies.production.push({
            name: match[1],
            version: match[2],
            type: "production",
          });
        }
      }
    } catch (error) {
    }

    return dependencies;
  }

  private async generateSemanticSummary(
    repository: string,
    context: {
      architecture?: Record<string, any>;
      dependencies?: Record<string, any>;
      fileStructure?: string[];
      recentCommits?: Array<Record<string, any>>;
    }
  ): Promise<string> {
    if (!this.aiService) {
      return "AI service not available";
    }

    const prompt = `Analyze this repository and provide a concise semantic summary:

Repository: ${repository}

Architecture:
${JSON.stringify(context.architecture, null, 2)}

Dependencies:
${JSON.stringify(context.dependencies, null, 2)}

File Structure (first 100 files):
${context.fileStructure?.slice(0, 100).join("\n") || "Not available"}

Recent Commits (first 10):
${context.recentCommits?.slice(0, 10).map((c: any) => `- ${c.message}`).join("\n") || "Not available"}

Provide a summary that includes:
1. Primary purpose of the repository
2. Key technologies and frameworks used
3. Architecture pattern (if identifiable)
4. Recent development focus based on commits
5. Potential areas for improvement

Keep the summary concise (3-5 paragraphs).`;

    try {
      const result = await this.aiService.continueConversation(
        `repo-summary-${repository}`,
        prompt,
        {}
      );

      return result.response;
    } catch (error) {
      console.error("Error generating semantic summary:", error);
      return "Failed to generate semantic summary";
    }
  }
}
