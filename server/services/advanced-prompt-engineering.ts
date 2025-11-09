import type { Task, ReasoningStep, FileDiff, AISettings } from "@shared/schema";
import type { AIService, TaskType } from "./ai";
import type { MemoryManager, SemanticContext } from "./memory-manager";
import type { MCPClientManager } from "./mcp-client";
import type { ChatMessage } from "./ai-provider-manager";

export interface EnhancedPromptContext {
  taskId: string;
  taskType: TaskType;
  complexity: number; // 0-1 scale
  repository: string;
  branch?: string;
  summary: string;
  code?: string;
  filePath?: string;
  semanticContext?: SemanticContext;
  historicalReasoning: ReasoningStep[];
  relatedTasks: Task[];
  mcpTools?: string[];
  constraints?: string[];
  userPreferences?: Record<string, any>;
}

export interface PromptGenerationStrategy {
  includeArchitecture: boolean;
  includeDependencies: boolean;
  includeHistoricalContext: boolean;
  includeCodeContext: boolean;
  includeMCPTools: boolean;
  reasoningDepth: "shallow" | "medium" | "deep";
  temperature: number;
  maxTokens: number;
}

export class AdvancedPromptEngineer {
  private memoryManager?: MemoryManager;
  private mcpClientManager?: MCPClientManager;

  constructor(
    memoryManager?: MemoryManager,
    mcpClientManager?: MCPClientManager
  ) {
    this.memoryManager = memoryManager;
    this.mcpClientManager = mcpClientManager;
  }

  /**
   * Generate enhanced prompt with full context awareness
   */
  async generateEnhancedPrompt(
    context: EnhancedPromptContext
  ): Promise<{
    messages: ChatMessage[];
    strategy: PromptGenerationStrategy;
  }> {
    // Determine optimal strategy based on task complexity
    const strategy = this.determineStrategy(context);

    // Build system message with role and capabilities
    const systemMessage = this.buildSystemMessage(context, strategy);

    // Build context-aware user message
    const userMessage = await this.buildUserMessage(context, strategy);

    // Add historical reasoning if available
    const conversationHistory = this.buildConversationHistory(context, strategy);

    const messages: ChatMessage[] = [
      { role: "system", content: systemMessage },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    return { messages, strategy };
  }

  /**
   * Determine optimal generation strategy based on complexity and context
   */
  private determineStrategy(context: EnhancedPromptContext): PromptGenerationStrategy {
    const baseStrategy: PromptGenerationStrategy = {
      includeArchitecture: false,
      includeDependencies: false,
      includeHistoricalContext: false,
      includeCodeContext: false,
      includeMCPTools: false,
      reasoningDepth: "medium",
      temperature: 0.7,
      maxTokens: 4096,
    };

    // High complexity tasks need more context
    if (context.complexity > 0.7) {
      baseStrategy.includeArchitecture = true;
      baseStrategy.includeDependencies = true;
      baseStrategy.includeHistoricalContext = true;
      baseStrategy.reasoningDepth = "deep";
      baseStrategy.maxTokens = 8192;
    }

    // Task-specific adjustments
    switch (context.taskType) {
      case "architecture_design":
        baseStrategy.includeArchitecture = true;
        baseStrategy.includeDependencies = true;
        baseStrategy.temperature = 0.8;
        baseStrategy.reasoningDepth = "deep";
        baseStrategy.maxTokens = 10240;
        break;

      case "debugging":
        baseStrategy.includeCodeContext = true;
        baseStrategy.includeHistoricalContext = true;
        baseStrategy.temperature = 0.2;
        baseStrategy.reasoningDepth = "deep";
        break;

      case "refactoring":
        baseStrategy.includeArchitecture = true;
        baseStrategy.includeCodeContext = true;
        baseStrategy.temperature = 0.3;
        baseStrategy.reasoningDepth = "medium";
        break;

      case "feature_creation":
        baseStrategy.includeArchitecture = true;
        baseStrategy.includeDependencies = true;
        baseStrategy.includeCodeContext = true;
        baseStrategy.temperature = 0.7;
        baseStrategy.reasoningDepth = "deep";
        baseStrategy.maxTokens = 8192;
        break;

      case "test_generation":
        baseStrategy.includeCodeContext = true;
        baseStrategy.temperature = 0.4;
        baseStrategy.reasoningDepth = "medium";
        break;

      case "code_review":
        baseStrategy.includeArchitecture = true;
        baseStrategy.includeCodeContext = true;
        baseStrategy.temperature = 0.4;
        baseStrategy.reasoningDepth = "medium";
        break;

      case "security_fix":
        baseStrategy.includeCodeContext = true;
        baseStrategy.includeDependencies = true;
        baseStrategy.temperature = 0.2;
        baseStrategy.reasoningDepth = "deep";
        break;
    }

    // Include MCP tools if available
    if (this.mcpClientManager && context.mcpTools && context.mcpTools.length > 0) {
      baseStrategy.includeMCPTools = true;
    }

    return baseStrategy;
  }

  /**
   * Build comprehensive system message
   */
  private buildSystemMessage(
    context: EnhancedPromptContext,
    strategy: PromptGenerationStrategy
  ): string {
    const sections: string[] = [];

    // Core role definition
    sections.push(this.getRoleDefinition(context.taskType));

    // Reasoning instructions
    sections.push(this.getReasoningInstructions(strategy.reasoningDepth));

    // MCP tools availability
    if (strategy.includeMCPTools && context.mcpTools) {
      sections.push(this.getMCPToolsSection(context.mcpTools));
    }

    // Constraints
    if (context.constraints && context.constraints.length > 0) {
      sections.push("\nConstraints:");
      context.constraints.forEach(constraint => {
        sections.push(`- ${constraint}`);
      });
    }

    // Output format instructions
    sections.push(this.getOutputFormatInstructions(context.taskType));

    return sections.join("\n\n");
  }

  /**
   * Get role definition based on task type
   */
  private getRoleDefinition(taskType: TaskType): string {
    const roles: Record<TaskType, string> = {
      refactoring: "You are a senior software engineer specializing in code refactoring, clean code principles, and design patterns. You have deep expertise in improving code quality while maintaining functionality.",
      
      feature_creation: "You are an expert full-stack developer with strong architectural skills. You excel at designing and implementing new features that are scalable, maintainable, and align with existing codebase patterns.",
      
      debugging: "You are a master debugger with exceptional analytical skills. You can quickly identify root causes of issues by analyzing code, logs, and error patterns. You think systematically and verify your solutions.",
      
      test_generation: "You are a test automation expert who writes comprehensive, maintainable tests. You understand testing pyramids, coverage strategies, and how to write tests that catch real bugs without being brittle.",
      
      ux_validation: "You are a UX/UI expert with deep knowledge of accessibility, usability principles, and modern design patterns. You can identify friction points and suggest improvements that enhance user experience.",
      
      code_review: "You are a senior code reviewer with expertise in software quality, security, and best practices. You provide constructive feedback that helps developers grow while maintaining high code standards.",
      
      architecture_design: "You are a software architect with extensive experience in system design, scalability, and technical decision-making. You create architectures that balance current needs with future flexibility.",
      
      dependency_update: "You are a dependency management expert who understands version compatibility, breaking changes, and migration strategies. You can safely update dependencies while minimizing risk.",
      
      security_fix: "You are a security expert specializing in vulnerability analysis and secure coding practices. You can identify security issues and implement fixes that don't compromise functionality or introduce new vulnerabilities.",
    };

    return roles[taskType] || "You are an expert software development assistant.";
  }

  /**
   * Get reasoning instructions based on depth
   */
  private getReasoningInstructions(depth: "shallow" | "medium" | "deep"): string {
    const instructions = {
      shallow: `Think through the problem step-by-step before providing a solution.`,
      
      medium: `Use systematic reasoning:
1. Analyze the current state and requirements
2. Consider multiple approaches
3. Evaluate trade-offs
4. Choose the best solution
5. Explain your reasoning`,
      
      deep: `Use deep chain-of-thought reasoning:
1. Break down the problem into components
2. Analyze each component thoroughly
3. Consider edge cases and potential issues
4. Evaluate multiple solution paths
5. Reason about long-term implications
6. Synthesize insights into a comprehensive solution
7. Provide confidence levels for key decisions
8. Identify areas of uncertainty

For each major decision, explain:
- Why this approach over alternatives
- What assumptions you're making
- What risks or trade-offs exist
- How confident you are (0-100%)`,
    };

    return instructions[depth];
  }

  /**
   * Get MCP tools section
   */
  private getMCPToolsSection(tools: string[]): string {
    return `Available MCP Tools:
You have access to the following tools to help accomplish this task:
${tools.map(tool => `- ${tool}`).join('\n')}

Use these tools when appropriate to gather information, perform actions, or validate your solutions.`;
  }

  /**
   * Get output format instructions
   */
  private getOutputFormatInstructions(taskType: TaskType): string {
    const formats: Record<TaskType, string> = {
      refactoring: `Output Format:
1. Analysis: Identify code smells and improvement opportunities
2. Refactoring Plan: List specific changes with reasoning
3. Implementation: Provide refactored code
4. Validation: Explain how the refactoring maintains or improves functionality`,
      
      feature_creation: `Output Format:
1. Requirements Analysis: Confirm understanding of the feature
2. Architecture Design: Explain how the feature integrates
3. Implementation Plan: Break down into steps
4. Code Implementation: Provide working code
5. Testing Strategy: Outline how to test the feature`,
      
      debugging: `Output Format:
1. Problem Analysis: What's happening and why
2. Root Cause: The underlying issue
3. Solution: Fix with detailed explanation
4. Verification: How to confirm the fix works
5. Prevention: How to avoid similar issues`,
      
      test_generation: `Output Format:
1. Test Strategy: What to test and why
2. Test Cases: Comprehensive list of scenarios
3. Implementation: Complete test code
4. Coverage Analysis: What's covered and what isn't`,
      
      code_review: `Output Format:
1. Summary: Overall assessment
2. Critical Issues: Security, bugs, breaking changes
3. Suggestions: Improvements for quality and maintainability
4. Praise: What's done well
5. Priority: Critical → High → Medium → Low`,
      
      architecture_design: `Output Format:
1. Requirements: Key constraints and goals
2. Architecture Overview: High-level design
3. Component Design: Detailed specifications
4. Data Flow: How information moves through the system
5. Trade-offs: Design decisions and rationale
6. Implementation Roadmap: Phases and milestones`,
      
      ux_validation: `Output Format:
1. UX Assessment: Current state analysis
2. Issues: Friction points and accessibility concerns
3. Recommendations: Prioritized improvements
4. Rationale: Why each recommendation matters
5. Implementation: How to apply suggestions`,
      
      dependency_update: `Output Format:
1. Update Analysis: What's changing
2. Breaking Changes: Incompatibilities to address
3. Migration Plan: Step-by-step update process
4. Risk Assessment: Potential issues
5. Testing Strategy: How to verify the update`,
      
      security_fix: `Output Format:
1. Vulnerability Analysis: Nature and severity
2. Impact Assessment: What's at risk
3. Fix Implementation: Secure code
4. Verification: How to confirm the fix
5. Additional Recommendations: Related security improvements`,
    };

    return formats[taskType] || "Provide clear, structured output with reasoning.";
  }

  /**
   * Build context-aware user message
   */
  private async buildUserMessage(
    context: EnhancedPromptContext,
    strategy: PromptGenerationStrategy
  ): Promise<string> {
    const sections: string[] = [];

    // Task header
    sections.push(`Task: ${context.summary}`);
    sections.push(`Repository: ${context.repository}`);
    if (context.branch) {
      sections.push(`Branch: ${context.branch}`);
    }

    // Semantic context from Memory Manager
    if (strategy.includeArchitecture && context.semanticContext) {
      sections.push(this.buildArchitectureSection(context.semanticContext));
    }

    if (strategy.includeDependencies && context.semanticContext) {
      sections.push(this.buildDependenciesSection(context.semanticContext));
    }

    // Code context
    if (strategy.includeCodeContext && context.code) {
      sections.push(this.buildCodeSection(context));
    }

    // Historical context
    if (strategy.includeHistoricalContext && context.historicalReasoning.length > 0) {
      sections.push(this.buildHistoricalSection(context.historicalReasoning));
    }

    // Related tasks
    if (context.relatedTasks.length > 0) {
      sections.push(this.buildRelatedTasksSection(context.relatedTasks));
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Build architecture section from semantic context
   */
  private buildArchitectureSection(semanticContext: SemanticContext): string {
    const sections: string[] = ["## Repository Architecture"];

    if (semanticContext.summary) {
      sections.push(`Summary: ${semanticContext.summary}`);
    }

    if (semanticContext.architecture.type) {
      sections.push(`Type: ${semanticContext.architecture.type}`);
    }

    if (semanticContext.architecture.layers.length > 0) {
      sections.push("\nLayers:");
      semanticContext.architecture.layers.forEach(layer => {
        sections.push(`- ${layer.name}: ${layer.description}`);
        sections.push(`  Files: ${layer.files.length}`);
      });
    }

    if (semanticContext.architecture.patterns.length > 0) {
      sections.push("\nDesign Patterns:");
      semanticContext.architecture.patterns.forEach(pattern => {
        sections.push(`- ${pattern.pattern}: ${pattern.description} (${pattern.occurrences.length} occurrences)`);
      });
    }

    if (semanticContext.technicalDebt.totalScore > 0) {
      sections.push(`\nTechnical Debt Score: ${semanticContext.technicalDebt.totalScore}`);
      if (semanticContext.technicalDebt.issues.length > 0) {
        sections.push("Top Issues:");
        semanticContext.technicalDebt.issues.slice(0, 5).forEach(issue => {
          sections.push(`- [${issue.severity}] ${issue.description}`);
        });
      }
    }

    return sections.join("\n");
  }

  /**
   * Build dependencies section
   */
  private buildDependenciesSection(semanticContext: SemanticContext): string {
    const sections: string[] = ["## Dependencies"];

    sections.push(`Total Dependencies: ${semanticContext.dependencyGraph.nodes.size}`);

    if (semanticContext.dependencyGraph.cycles.length > 0) {
      sections.push(`\n⚠️ Circular Dependencies Detected: ${semanticContext.dependencyGraph.cycles.length}`);
    }

    // List top dependencies
    const topDeps = Array.from(semanticContext.dependencyGraph.nodes.values())
      .sort((a, b) => b.dependents.length - a.dependents.length)
      .slice(0, 10);

    if (topDeps.length > 0) {
      sections.push("\nMost Used Dependencies:");
      topDeps.forEach(dep => {
        sections.push(`- ${dep.name}${dep.version ? `@${dep.version}` : ''} (${dep.dependents.length} dependents)`);
      });
    }

    return sections.join("\n");
  }

  /**
   * Build code section
   */
  private buildCodeSection(context: EnhancedPromptContext): string {
    const sections: string[] = ["## Code Context"];

    if (context.filePath) {
      sections.push(`File: ${context.filePath}`);
    }

    if (context.code) {
      const lineCount = context.code.split("\n").length;
      sections.push(`Lines: ${lineCount}`);
      sections.push("\n```");
      sections.push(context.code);
      sections.push("```");
    }

    return sections.join("\n");
  }

  /**
   * Build historical reasoning section
   */
  private buildHistoricalSection(reasoning: ReasoningStep[]): string {
    const sections: string[] = ["## Historical Context"];

    sections.push("Previous reasoning and decisions:");

    const recentReasoning = reasoning.slice(-5); // Last 5 steps
    recentReasoning.forEach((step, index) => {
      const status = step.completed ? "✓" : "○";
      const confidence = step.confidence ? ` (${step.confidence}% confidence)` : "";
      sections.push(`${status} ${step.description}${confidence}`);
    });

    return sections.join("\n");
  }

  /**
   * Build related tasks section
   */
  private buildRelatedTasksSection(tasks: Task[]): string {
    const sections: string[] = ["## Related Tasks"];

    const relevantTasks = tasks.slice(0, 3);
    relevantTasks.forEach(task => {
      sections.push(`- [${task.status}] ${task.title}`);
      if (task.summary) {
        sections.push(`  ${task.summary.substring(0, 100)}...`);
      }
    });

    return sections.join("\n");
  }

  /**
   * Build conversation history from prior reasoning
   */
  private buildConversationHistory(
    context: EnhancedPromptContext,
    strategy: PromptGenerationStrategy
  ): ChatMessage[] {
    if (!strategy.includeHistoricalContext) {
      return [];
    }

    const messages: ChatMessage[] = [];

    // Include significant reasoning steps as conversation
    const significantSteps = context.historicalReasoning
      .filter(step => step.confidence && step.confidence > 70)
      .slice(-3); // Last 3 significant steps

    significantSteps.forEach(step => {
      messages.push({
        role: "assistant",
        content: step.description,
      });
    });

    return messages;
  }

  /**
   * Calculate task complexity score
   */
  calculateComplexity(context: {
    codeSize?: number;
    fileCount?: number;
    dependencyCount?: number;
    issueCount?: number;
    taskType: TaskType;
  }): number {
    let complexity = 0.5; // Base complexity

    // Code size factor
    if (context.codeSize) {
      if (context.codeSize > 1000) complexity += 0.2;
      else if (context.codeSize > 500) complexity += 0.1;
    }

    // File count factor
    if (context.fileCount) {
      if (context.fileCount > 10) complexity += 0.1;
      else if (context.fileCount > 5) complexity += 0.05;
    }

    // Dependency factor
    if (context.dependencyCount) {
      if (context.dependencyCount > 50) complexity += 0.1;
      else if (context.dependencyCount > 20) complexity += 0.05;
    }

    // Task type factor
    const taskComplexity: Record<TaskType, number> = {
      architecture_design: 0.9,
      feature_creation: 0.7,
      debugging: 0.6,
      refactoring: 0.5,
      code_review: 0.5,
      test_generation: 0.4,
      security_fix: 0.7,
      ux_validation: 0.5,
      dependency_update: 0.6,
    };

    complexity = Math.max(complexity, taskComplexity[context.taskType] || 0.5);

    return Math.min(complexity, 1.0); // Cap at 1.0
  }

  /**
   * Optimize prompt for token limits
   */
  optimizePromptForTokens(
    prompt: string,
    maxTokens: number,
    preserveSections: string[] = []
  ): string {
    // Rough estimate: 1 token ≈ 4 characters
    const estimatedTokens = prompt.length / 4;

    if (estimatedTokens <= maxTokens * 0.8) {
      return prompt; // Within limits
    }

    // Need to truncate - preserve important sections
    const sections = prompt.split("---");
    const preserved: string[] = [];
    const optional: string[] = [];

    sections.forEach(section => {
      const shouldPreserve = preserveSections.some(ps => section.includes(ps));
      if (shouldPreserve) {
        preserved.push(section);
      } else {
        optional.push(section);
      }
    });

    // Start with preserved sections
    let optimized = preserved.join("\n---\n");
    let currentTokens = optimized.length / 4;

    // Add optional sections if space allows
    for (const section of optional) {
      const sectionTokens = section.length / 4;
      if (currentTokens + sectionTokens < maxTokens * 0.8) {
        optimized += "\n---\n" + section;
        currentTokens += sectionTokens;
      }
    }

    return optimized;
  }
}
