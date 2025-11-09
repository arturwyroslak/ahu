import type { IStorage } from "../storage";
import type { RepositoryContext, Task } from "@shared/schema";
import type { GitHubService } from "./github";
import type { AIService } from "./ai";

export interface DependencyNode {
  id: string;
  name: string;
  version?: string;
  type: "dependency" | "devDependency" | "peerDependency";
  children: string[]; // IDs of dependent packages
  dependents: string[]; // IDs of packages that depend on this
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Array<{ from: string; to: string; type: string }>;
  cycles: string[][];
}

export interface FileNode {
  path: string;
  language?: string;
  size: number;
  lastModified: string;
  imports: string[];
  exports: string[];
  dependencies: string[];
}

export interface ArchitectureLayer {
  name: string;
  description: string;
  files: string[];
  patterns: string[];
  responsibilities: string[];
}

export interface CodePattern {
  pattern: string;
  description: string;
  occurrences: Array<{ file: string; line: number }>;
  category: "design-pattern" | "anti-pattern" | "idiom" | "convention";
}

export interface SemanticContext {
  repository: string;
  summary: string;
  architecture: {
    type?: string; // monorepo, microservices, monolith, etc.
    layers: ArchitectureLayer[];
    patterns: CodePattern[];
  };
  dependencyGraph: DependencyGraph;
  fileMap: Map<string, FileNode>;
  technicalDebt: {
    totalScore: number;
    issues: Array<{
      type: string;
      severity: "critical" | "high" | "medium" | "low";
      description: string;
      files: string[];
    }>;
  };
  knowledgeGraph: Map<string, {
    concept: string;
    related: string[];
    confidence: number;
  }>;
}

export interface HistoricalAnalysis {
  frequentlyModifiedFiles: Array<{ path: string; changeCount: number }>;
  buggyFiles: Array<{ path: string; bugFixCount: number }>;
  authorExpertise: Map<string, { files: string[]; domains: string[] }>;
  changePatterns: {
    averageCommitSize: number;
    peakActivityHours: number[];
    refactoringRatio: number;
  };
}

export class MemoryManager {
  private storage: IStorage;
  private githubService?: GitHubService;
  private aiService?: AIService;
  private contextCache: Map<string, SemanticContext> = new Map();
  private analysisCache: Map<string, HistoricalAnalysis> = new Map();

  constructor(
    storage: IStorage,
    githubService?: GitHubService,
    aiService?: AIService
  ) {
    this.storage = storage;
    this.githubService = githubService;
    this.aiService = aiService;
  }

  /**
   * Build or retrieve semantic context for a repository
   */
  async getSemanticContext(repository: string, forceRefresh = false): Promise<SemanticContext> {
    // Check cache
    if (!forceRefresh && this.contextCache.has(repository)) {
      return this.contextCache.get(repository)!;
    }

    // Try to load from storage
    const stored = await this.storage.getRepositoryContext(repository);
    if (stored && !forceRefresh) {
      return this.deserializeContext(stored);
    }

    // Build new context
    const context = await this.buildSemanticContext(repository);
    this.contextCache.set(repository, context);

    // Save to storage
    await this.saveSemanticContext(repository, context);

    return context;
  }

  /**
   * Build semantic context from repository analysis
   */
  private async buildSemanticContext(repository: string): Promise<SemanticContext> {
    const context: SemanticContext = {
      repository,
      summary: "",
      architecture: {
        layers: [],
        patterns: [],
      },
      dependencyGraph: {
        nodes: new Map(),
        edges: [],
        cycles: [],
      },
      fileMap: new Map(),
      technicalDebt: {
        totalScore: 0,
        issues: [],
      },
      knowledgeGraph: new Map(),
    };

    if (!this.githubService) {
      return context;
    }

    try {
      // Analyze file structure
      const fileStructure = await this.analyzeFileStructure(repository);
      context.fileMap = fileStructure;

      // Build dependency graph
      const depGraph = await this.buildDependencyGraph(repository, fileStructure);
      context.dependencyGraph = depGraph;

      // Detect architectural layers
      const layers = this.detectArchitecturalLayers(fileStructure);
      context.architecture.layers = layers;

      // Identify code patterns
      const patterns = await this.identifyCodePatterns(repository, fileStructure);
      context.architecture.patterns = patterns;

      // Analyze technical debt
      const debt = this.analyzeTechnicalDebt(fileStructure, patterns);
      context.technicalDebt = debt;

      // Generate semantic summary using AI
      if (this.aiService) {
        context.summary = await this.generateSemanticSummary(context);
      }

      // Build knowledge graph
      context.knowledgeGraph = this.buildKnowledgeGraph(context);

    } catch (error) {
      console.error(`Error building semantic context for ${repository}:`, error);
    }

    return context;
  }

  /**
   * Analyze file structure and create file nodes
   */
  private async analyzeFileStructure(repository: string): Promise<Map<string, FileNode>> {
    const fileMap = new Map<string, FileNode>();

    if (!this.githubService) {
      return fileMap;
    }

    try {
      const [owner, repo] = repository.split("/");
      
      // Get repository tree from GitHub API
      const tree = await this.getRepositoryTree(owner, repo);
      
      // Convert tree items to FileNode objects
      for (const item of tree) {
        if (item.type === "blob") {
          const node: FileNode = {
            path: item.path,
            language: this.detectFileType(item.path),
            size: item.size || 0,
            lastModified: new Date().toISOString(),
            imports: [],
            exports: [],
            dependencies: [],
          };
          fileMap.set(item.path, node);
        }
      }
      
    } catch (error) {
      console.error(`Error analyzing file structure for ${repository}:`, error);
    }

    return fileMap;
  }

  /**
   * Get repository file tree using GitHub API
   */
  private async getRepositoryTree(
    owner: string,
    repo: string,
    recursive: boolean = true
  ): Promise<Array<{
    path: string;
    type: "blob" | "tree";
    sha: string;
    size?: number;
  }>> {
    try {
      // Get repository info to find default branch
      const repoInfo = await this.githubService!.request(`/repos/${owner}/${repo}`);
      const defaultBranch = repoInfo.default_branch || "main";
      
      // Get tree recursively
      const treeUrl = `/repos/${owner}/${repo}/git/trees/${defaultBranch}${recursive ? "?recursive=1" : ""}`;
      const treeData = await this.githubService!.request(treeUrl);
      
      return treeData.tree || [];
    } catch (error) {
      console.error(`Error fetching repository tree for ${owner}/${repo}:`, error);
      return [];
    }
  }

  /**
   * Detect file type from extension
   */
  private detectFileType(path: string): FileNode["type"] {
    const ext = path.split(".").pop()?.toLowerCase();
    
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "yaml":
      case "yml":
        return "yaml";
      default:
        return "unknown";
    }
  }

  /**
   * Build dependency graph from package files
   */
  private async buildDependencyGraph(
    repository: string,
    fileMap: Map<string, FileNode>
  ): Promise<DependencyGraph> {
    const graph: DependencyGraph = {
      nodes: new Map(),
      edges: [],
      cycles: [],
    };

    // Parse package.json, requirements.txt, Cargo.toml, etc.
    for (const [path, file] of Array.from(fileMap.entries())) {
      if (path.endsWith("package.json")) {
        await this.parseNpmDependencies(repository, path, graph);
      } else if (path.endsWith("requirements.txt")) {
        await this.parsePythonDependencies(repository, path, graph);
      } else if (path.endsWith("Cargo.toml")) {
        await this.parseRustDependencies(repository, path, graph);
      }
    }

    // Detect circular dependencies
    graph.cycles = this.detectDependencyCycles(graph);

    return graph;
  }

  /**
   * Parse npm dependencies from package.json
   */
  private async parseNpmDependencies(
    repository: string,
    path: string,
    graph: DependencyGraph
  ): Promise<void> {
    if (!this.githubService) return;

    try {
      const [owner, repo] = repository.split("/");
      const content = await this.githubService.getFileContent(owner, repo, path);
      const packageJson = JSON.parse(content);

      // Add dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          const node: DependencyNode = {
            id: name,
            name,
            version: version as string,
            type: "dependency",
            children: [],
            dependents: [],
          };
          graph.nodes.set(name, node);
        }
      }

      // Add devDependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          const node: DependencyNode = {
            id: name,
            name,
            version: version as string,
            type: "devDependency",
            children: [],
            dependents: [],
          };
          graph.nodes.set(name, node);
        }
      }
    } catch (error) {
      console.error(`Error parsing package.json from ${repository}:`, error);
    }
  }

  /**
   * Parse Python dependencies
   */
  private async parsePythonDependencies(
    repository: string,
    path: string,
    graph: DependencyGraph
  ): Promise<void> {
    // Similar to parseNpmDependencies but for Python
  }

  /**
   * Parse Rust dependencies
   */
  private async parseRustDependencies(
    repository: string,
    path: string,
    graph: DependencyGraph
  ): Promise<void> {
    // Similar to parseNpmDependencies but for Rust
  }

  /**
   * Detect circular dependencies in the graph
   */
  private detectDependencyCycles(graph: DependencyGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = graph.nodes.get(nodeId);
      if (node) {
        for (const childId of node.children) {
          if (!visited.has(childId)) {
            dfs(childId, path);
          } else if (recursionStack.has(childId)) {
            // Found cycle
            const cycleStart = path.indexOf(childId);
            cycles.push(path.slice(cycleStart));
          }
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
    };

    for (const nodeId of Array.from(graph.nodes.keys())) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return cycles;
  }

  /**
   * Detect architectural layers from file structure
   */
  private detectArchitecturalLayers(fileMap: Map<string, FileNode>): ArchitectureLayer[] {
    const layers: ArchitectureLayer[] = [];

    const layerPatterns: Array<{
      name: string;
      patterns: string[];
      description: string;
    }> = [
      {
        name: "Presentation Layer",
        patterns: ["*/components/*", "*/pages/*", "*/views/*", "*/ client/*"],
        description: "UI components and presentation logic",
      },
      {
        name: "Business Logic Layer",
        patterns: ["*/services/*", "*/domain/*", "*/business/*", "*/core/*"],
        description: "Business rules and domain logic",
      },
      {
        name: "Data Access Layer",
        patterns: ["*/repositories/*", "*/database/*", "*/storage/*", "*/models/*"],
        description: "Data persistence and retrieval",
      },
      {
        name: "API Layer",
        patterns: ["*/routes/*", "*/controllers/*", "*/api/*", "*/handlers/*"],
        description: "HTTP endpoints and request handling",
      },
    ];

    for (const layerPattern of layerPatterns) {
      const matchingFiles: string[] = [];
      
      for (const [path] of Array.from(fileMap.entries())) {
        for (const pattern of layerPattern.patterns) {
          const regex = new RegExp(pattern.replace("*", ".*"));
          if (regex.test(path)) {
            matchingFiles.push(path);
            break;
          }
        }
      }

      if (matchingFiles.length > 0) {
        layers.push({
          name: layerPattern.name,
          description: layerPattern.description,
          files: matchingFiles,
          patterns: layerPattern.patterns,
          responsibilities: [],
        });
      }
    }

    return layers;
  }

  /**
   * Identify code patterns and anti-patterns
   */
  private async identifyCodePatterns(
    repository: string,
    fileMap: Map<string, FileNode>
  ): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];

    // Identify common design patterns (singleton, factory, observer, etc.)
    // This would use AST analysis in production

    return patterns;
  }

  /**
   * Analyze technical debt
   */
  private analyzeTechnicalDebt(
    fileMap: Map<string, FileNode>,
    patterns: CodePattern[]
  ): SemanticContext["technicalDebt"] {
    const issues: SemanticContext["technicalDebt"]["issues"] = [];
    let totalScore = 0;

    // Look for anti-patterns
    for (const pattern of patterns) {
      if (pattern.category === "anti-pattern") {
        issues.push({
          type: "anti-pattern",
          severity: "medium",
          description: pattern.description,
          files: pattern.occurrences.map((o) => o.file),
        });
        totalScore += 5 * pattern.occurrences.length;
      }
    }

    // Large file size (>1000 lines)
    for (const [path, file] of Array.from(fileMap.entries())) {
      if (file.size > 1000) {
        issues.push({
          type: "large-file",
          severity: "low",
          description: `File ${path} is too large (${file.size} lines)`,
          files: [path],
        });
        totalScore += 2;
      }
    }

    return {
      totalScore,
      issues,
    };
  }

  /**
   * Generate semantic summary using AI
   */
  private async generateSemanticSummary(context: SemanticContext): Promise<string> {
    if (!this.aiService) {
      return "No summary available";
    }

    const prompt = `Analyze this repository structure and provide a concise semantic summary:

Architecture Layers: ${context.architecture.layers.map((l) => l.name).join(", ")}
Total Files: ${context.fileMap.size}
Dependencies: ${context.dependencyGraph.nodes.size}
Technical Debt Score: ${context.technicalDebt.totalScore}

Provide a 2-3 sentence summary of the repository's purpose, architecture, and key characteristics.`;

    try {
      // This would call the AI service
      return "Repository summary placeholder";
    } catch (error) {
      return "Failed to generate summary";
    }
  }

  /**
   * Build knowledge graph connecting concepts
   */
  private buildKnowledgeGraph(context: SemanticContext): Map<string, {
    concept: string;
    related: string[];
    confidence: number;
  }> {
    const graph = new Map();

    // Extract concepts from architecture layers
    for (const layer of context.architecture.layers) {
      graph.set(layer.name, {
        concept: layer.name,
        related: layer.patterns,
        confidence: 0.9,
      });
    }

    return graph;
  }

  /**
   * Perform historical analysis on repository
   */
  async getHistoricalAnalysis(repository: string): Promise<HistoricalAnalysis> {
    // Check cache
    if (this.analysisCache.has(repository)) {
      return this.analysisCache.get(repository)!;
    }

    const analysis = await this.buildHistoricalAnalysis(repository);
    this.analysisCache.set(repository, analysis);

    return analysis;
  }

  /**
   * Build historical analysis from commits and issues
   */
  private async buildHistoricalAnalysis(repository: string): Promise<HistoricalAnalysis> {
    const analysis: HistoricalAnalysis = {
      frequentlyModifiedFiles: [],
      buggyFiles: [],
      authorExpertise: new Map(),
      changePatterns: {
        averageCommitSize: 0,
        peakActivityHours: [],
        refactoringRatio: 0,
      },
    };

    if (!this.githubService) {
      return analysis;
    }

    // This would analyze commit history via GitHub API
    // For now, return empty analysis

    return analysis;
  }

  /**
   * Update context with new information
   */
  async updateContext(
    repository: string,
    updates: Partial<SemanticContext>
  ): Promise<void> {
    const context = await this.getSemanticContext(repository);
    Object.assign(context, updates);
    
    this.contextCache.set(repository, context);
    await this.saveSemanticContext(repository, context);
  }

  /**
   * Save semantic context to storage
   */
  private async saveSemanticContext(
    repository: string,
    context: SemanticContext
  ): Promise<void> {
    const serialized = this.serializeContext(context);
    
    const existing = await this.storage.getRepositoryContext(repository);
    if (existing) {
      await this.storage.updateRepositoryContext(repository, serialized);
    } else {
      await this.storage.createRepositoryContext({
        repository,
        ...serialized,
      });
    }
  }

  /**
   * Serialize context for storage
   */
  private serializeContext(context: SemanticContext): Partial<RepositoryContext> {
    return {
      repository: context.repository,
      semanticSummary: context.summary,
      architecture: {
        type: context.architecture.type,
        layers: context.architecture.layers,
        patterns: context.architecture.patterns,
      },
      dependencies: {
        graph: Object.fromEntries(context.dependencyGraph.nodes),
        cycles: context.dependencyGraph.cycles,
      },
      fileStructure: Array.from(context.fileMap.keys()),
    };
  }

  /**
   * Deserialize context from storage
   */
  private deserializeContext(stored: RepositoryContext): SemanticContext {
    return {
      repository: stored.repository,
      summary: stored.semanticSummary || "",
      architecture: (stored.architecture as any) || {
        layers: [],
        patterns: [],
      },
      dependencyGraph: {
        nodes: new Map(Object.entries((stored.dependencies as any)?.graph || {})),
        edges: [],
        cycles: (stored.dependencies as any)?.cycles || [],
      },
      fileMap: new Map(),
      technicalDebt: {
        totalScore: 0,
        issues: [],
      },
      knowledgeGraph: new Map(),
    };
  }

  /**
   * Clear caches
   */
  clearCache(repository?: string): void {
    if (repository) {
      this.contextCache.delete(repository);
      this.analysisCache.delete(repository);
    } else {
      this.contextCache.clear();
      this.analysisCache.clear();
    }
  }
}
