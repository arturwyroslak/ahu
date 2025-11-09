import type { AISettings, Task, ReasoningStep, FileDiff, DiffLine, MCPTool } from "@shared/schema";
import type { IStorage } from "../storage";
import { DiffService } from "./diff";
import { AIProviderManager, type ChatMessage } from "./ai-provider-manager";
import type { MCPClientManager } from "./mcp-client";
import { randomUUID } from "crypto";

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export type TaskType = 
  | "refactoring" 
  | "feature_creation" 
  | "debugging" 
  | "test_generation" 
  | "ux_validation"
  | "code_review"
  | "architecture_design"
  | "dependency_update"
  | "security_fix";

export type ReasoningStrategy = "analytical" | "creative" | "debugging" | "systematic" | "exploratory";

interface RepositoryContext {
  architecture?: string;
  dependencies?: Record<string, string>;
  fileStructure?: string[];
  recentCommits?: string[];
  openIssues?: string[];
}

interface CodeContext {
  filePath: string;
  content: string;
  language?: string;
  relatedFiles?: Array<{ path: string; content: string }>;
}

interface ConversationContext {
  taskId: string;
  messages: ChatMessage[];
  reasoningHistory: ReasoningStep[];
  metadata: Record<string, any>;
}

interface PromptTemplate {
  system: string;
  userTemplate: (context: any) => string;
  temperature: number;
  maxTokens: number;
}

export class AIService {
  private settings: AISettings;
  private storage?: IStorage;
  private promptTemplates: Map<TaskType, PromptTemplate>;
  private conversationContexts: Map<string, ConversationContext>;
  private diffService: DiffService;
  private providerManager?: AIProviderManager;
  private mcpClientManager?: MCPClientManager;

  constructor(settings: AISettings, storage?: IStorage, mcpClientManager?: MCPClientManager) {
    this.settings = settings;
    this.storage = storage;
    this.mcpClientManager = mcpClientManager;
    this.conversationContexts = new Map();
    this.promptTemplates = this.initializePromptTemplates();
    this.diffService = new DiffService();
    
    if (settings.providers && settings.providers.length > 0) {
      this.providerManager = new AIProviderManager(
        settings.providers,
        settings.routing
      );
    }
  }

  updateSettings(settings: AISettings) {
    this.settings = settings;
    
    if (settings.providers && settings.providers.length > 0) {
      this.providerManager = new AIProviderManager(
        settings.providers,
        settings.routing
      );
    }
  }

  getProviderManager(): AIProviderManager | undefined {
    return this.providerManager;
  }

  private initializePromptTemplates(): Map<TaskType, PromptTemplate> {
    const templates = new Map<TaskType, PromptTemplate>();

    templates.set("refactoring", {
      system: `You are an expert code refactoring specialist with deep knowledge of software design patterns, clean code principles, and best practices.

Your approach:
1. Analyze the existing code structure and identify code smells
2. Consider SOLID principles and design patterns
3. Ensure backward compatibility unless explicitly stated otherwise
4. Maintain or improve performance
5. Add clear documentation for significant changes

Think step-by-step and explain your reasoning for each refactoring decision.`,
      userTemplate: (ctx) => `
Task: Refactor the following code
Context: ${ctx.summary || "Improve code quality and maintainability"}

${ctx.repositoryContext ? `Repository Architecture:
${JSON.stringify(ctx.repositoryContext.architecture, null, 2)}

Dependencies:
${JSON.stringify(ctx.repositoryContext.dependencies, null, 2)}
` : ''}

File: ${ctx.filePath}
Code:
${ctx.code}

${ctx.priorReasoning ? `Previous Analysis:
${ctx.priorReasoning.map((r: ReasoningStep) => `- ${r.description} (confidence: ${r.confidence}%)`).join('\n')}
` : ''}

Provide a detailed refactoring plan with reasoning for each change.`,
      temperature: 0.3,
      maxTokens: 4096,
    });

    templates.set("feature_creation", {
      system: `You are an expert software architect and developer specializing in feature design and implementation.

Your approach:
1. Understand the feature requirements thoroughly
2. Design a scalable and maintainable architecture
3. Consider edge cases and error handling
4. Plan for testing and validation
5. Ensure security best practices
6. Think about user experience and API design

Use chain-of-thought reasoning to break down complex features into manageable components.`,
      userTemplate: (ctx) => `
Task: ${ctx.title || "Implement new feature"}
Requirements: ${ctx.summary}

${ctx.repositoryContext ? `Current Architecture:
${JSON.stringify(ctx.repositoryContext.architecture, null, 2)}

Existing Dependencies:
${JSON.stringify(ctx.repositoryContext.dependencies, null, 2)}

File Structure:
${ctx.repositoryContext.fileStructure?.slice(0, 50).join('\n') || 'Not available'}
` : ''}

${ctx.relatedCode ? `Related Code:
${ctx.relatedCode.map((rc: any) => `File: ${rc.path}\n${rc.content.substring(0, 500)}...`).join('\n\n')}
` : ''}

Design and plan the implementation of this feature with detailed reasoning.`,
      temperature: 0.7,
      maxTokens: 6144,
    });

    templates.set("debugging", {
      system: `You are an expert debugger with exceptional analytical skills for identifying and fixing software bugs.

Your debugging process:
1. Analyze the error message and stack trace
2. Identify the root cause, not just symptoms
3. Consider edge cases and race conditions
4. Check for common pitfalls (null references, off-by-one errors, etc.)
5. Verify the fix doesn't introduce new issues
6. Suggest preventive measures (tests, validation, etc.)

Think systematically and explain each step of your reasoning.`,
      userTemplate: (ctx) => `
Bug Report: ${ctx.title}
Description: ${ctx.summary}

${ctx.errorLog ? `Error Log:
${ctx.errorLog}
` : ''}

${ctx.stackTrace ? `Stack Trace:
${ctx.stackTrace}
` : ''}

File: ${ctx.filePath}
Code:
${ctx.code}

${ctx.reproductionSteps ? `Steps to Reproduce:
${ctx.reproductionSteps}
` : ''}

${ctx.priorAttempts ? `Previous Fix Attempts:
${ctx.priorAttempts}
` : ''}

Diagnose the root cause and provide a comprehensive fix with reasoning.`,
      temperature: 0.2,
      maxTokens: 4096,
    });

    templates.set("test_generation", {
      system: `You are a test automation expert specializing in comprehensive test coverage and quality assurance.

Your testing strategy:
1. Identify all critical paths and edge cases
2. Write tests for both happy paths and error conditions
3. Ensure tests are maintainable and readable
4. Follow testing best practices (AAA pattern, descriptive names, etc.)
5. Consider integration and unit tests appropriately
6. Aim for meaningful coverage, not just high percentages

Think about what could go wrong and how to catch it early.`,
      userTemplate: (ctx) => `
Generate tests for: ${ctx.title}
Context: ${ctx.summary}

Code to Test:
File: ${ctx.filePath}
${ctx.code}

${ctx.dependencies ? `Dependencies:
${JSON.stringify(ctx.dependencies, null, 2)}
` : ''}

${ctx.existingTests ? `Existing Test Patterns:
${ctx.existingTests}
` : ''}

Create comprehensive test cases with clear reasoning for each test scenario.`,
      temperature: 0.4,
      maxTokens: 5120,
    });

    templates.set("ux_validation", {
      system: `You are a UX expert with deep understanding of user experience principles, accessibility, and usability best practices.

Your evaluation criteria:
1. User flow and navigation clarity
2. Accessibility (WCAG compliance)
3. Visual hierarchy and consistency
4. Error prevention and recovery
5. Performance and responsiveness
6. Mobile and cross-platform compatibility

Think from the user's perspective and identify potential friction points.`,
      userTemplate: (ctx) => `
Validate UX for: ${ctx.title}
Feature Description: ${ctx.summary}

${ctx.uiCode ? `UI Implementation:
${ctx.uiCode}
` : ''}

${ctx.userFlows ? `User Flows:
${ctx.userFlows}
` : ''}

${ctx.screenshots ? `Screenshots: ${ctx.screenshots.length} provided` : ''}

Analyze the user experience and provide detailed recommendations with reasoning.`,
      temperature: 0.6,
      maxTokens: 4096,
    });

    templates.set("code_review", {
      system: `You are a senior code reviewer with expertise in software quality, security, and best practices.

Review checklist:
1. Code quality and maintainability
2. Security vulnerabilities
3. Performance implications
4. Error handling and edge cases
5. Test coverage
6. Documentation and comments
7. Adherence to project conventions

Be constructive and prioritize feedback by importance.`,
      userTemplate: (ctx) => `
Review Request: ${ctx.title}
Description: ${ctx.summary}

Changed Files:
${ctx.diffs?.map((d: any) => `${d.path}:\n${d.content}`).join('\n\n')}

${ctx.repositoryContext ? `Project Context:
Architecture: ${JSON.stringify(ctx.repositoryContext.architecture, null, 2)}
` : ''}

Provide a thorough code review with reasoning for each comment.`,
      temperature: 0.4,
      maxTokens: 5120,
    });

    templates.set("architecture_design", {
      system: `You are a software architect specializing in scalable, maintainable system design.

Design principles:
1. Modularity and separation of concerns
2. Scalability and performance
3. Security and data protection
4. Testability and maintainability
5. Technology stack alignment
6. Cost-effectiveness

Think holistically about the system and its future growth.`,
      userTemplate: (ctx) => `
Architecture Design for: ${ctx.title}
Requirements: ${ctx.summary}

${ctx.constraints ? `Constraints:
${ctx.constraints}
` : ''}

${ctx.existingArchitecture ? `Current Architecture:
${ctx.existingArchitecture}
` : ''}

${ctx.scalingRequirements ? `Scaling Requirements:
${ctx.scalingRequirements}
` : ''}

Design a robust architecture with detailed reasoning for each decision.`,
      temperature: 0.7,
      maxTokens: 6144,
    });

    templates.set("dependency_update", {
      system: `You are a dependency management expert focused on keeping projects secure and up-to-date.

Update strategy:
1. Assess breaking changes
2. Check for security vulnerabilities
3. Evaluate performance improvements
4. Review migration guides
5. Plan incremental updates
6. Consider transitive dependencies

Balance stability with staying current.`,
      userTemplate: (ctx) => `
Update Dependencies for: ${ctx.repository}

Current Dependencies:
${JSON.stringify(ctx.currentDependencies, null, 2)}

${ctx.availableUpdates ? `Available Updates:
${JSON.stringify(ctx.availableUpdates, null, 2)}
` : ''}

${ctx.securityIssues ? `Security Issues:
${ctx.securityIssues}
` : ''}

Create an update plan with risk assessment and reasoning.`,
      temperature: 0.3,
      maxTokens: 4096,
    });

    templates.set("security_fix", {
      system: `You are a security expert specializing in identifying and fixing vulnerabilities.

Security assessment:
1. Identify vulnerability type and severity
2. Understand the attack vector
3. Design a secure fix
4. Prevent similar issues
5. Consider defense in depth
6. Validate the fix thoroughly

Prioritize security without breaking functionality.`,
      userTemplate: (ctx) => `
Security Issue: ${ctx.title}
Severity: ${ctx.severity || 'Unknown'}
Description: ${ctx.summary}

${ctx.vulnerabilityDetails ? `Vulnerability Details:
${ctx.vulnerabilityDetails}
` : ''}

Affected Code:
${ctx.code}

${ctx.cveId ? `CVE ID: ${ctx.cveId}` : ''}

Provide a secure fix with comprehensive reasoning and preventive measures.`,
      temperature: 0.2,
      maxTokens: 4096,
    });

    return templates;
  }

  async analyzeCode(
    code: string,
    filePath: string,
    taskType: TaskType = "code_review",
    options: {
      language?: string;
      focusAreas?: string[];
      repositoryContext?: RepositoryContext;
    } = {}
  ): Promise<{
    analysis: string;
    suggestions: Array<{ line?: number; message: string; severity: "info" | "warning" | "error" }>;
    metrics: { complexity?: number; maintainability?: number };
  }> {
    const systemPrompt = `You are an expert code analyzer. Analyze the provided code and return insights in JSON format:
{
  "analysis": "Overall code analysis summary",
  "suggestions": [
    { "line": 10, "message": "Suggestion text", "severity": "warning" }
  ],
  "metrics": {
    "complexity": 5,
    "maintainability": 8
  }
}`;

    const userPrompt = `
Analyze this ${options.language || 'code'} file:
Path: ${filePath}
${options.focusAreas ? `Focus Areas: ${options.focusAreas.join(', ')}` : ''}

Code:
${code}

${options.repositoryContext ? `Repository Context:
${JSON.stringify(options.repositoryContext, null, 2)}
` : ''}

Provide detailed analysis with actionable suggestions.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: this.settings.maxTokens,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      return {
        analysis: parsed.analysis || "Code analysis completed",
        suggestions: parsed.suggestions || [],
        metrics: parsed.metrics || {},
      };
    } catch (error) {
      return {
        analysis: response.choices[0].message.content,
        suggestions: [],
        metrics: {},
      };
    }
  }

  async understandArchitecture(
    repositoryContext: RepositoryContext,
    specificQuestions?: string[]
  ): Promise<{
    overview: string;
    components: Array<{ name: string; purpose: string; dependencies: string[] }>;
    dataFlow: string;
    recommendations: string[];
  }> {
    const systemPrompt = `You are a software architecture expert. Analyze the repository and provide insights in JSON format:
{
  "overview": "High-level architecture overview",
  "components": [
    { "name": "ComponentName", "purpose": "What it does", "dependencies": ["dep1", "dep2"] }
  ],
  "dataFlow": "Description of how data flows through the system",
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

    const userPrompt = `
Analyze this repository architecture:

${repositoryContext.architecture ? `Architecture Documentation:
${repositoryContext.architecture}
` : ''}

File Structure:
${repositoryContext.fileStructure?.slice(0, 100).join('\n') || 'Not available'}

Dependencies:
${JSON.stringify(repositoryContext.dependencies, null, 2)}

${specificQuestions ? `Specific Questions:
${specificQuestions.join('\n')}
` : ''}

Provide a comprehensive architecture analysis.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 6144,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      return {
        overview: parsed.overview || "Architecture overview",
        components: parsed.components || [],
        dataFlow: parsed.dataFlow || "Data flow not analyzed",
        recommendations: parsed.recommendations || [],
      };
    } catch (error) {
      return {
        overview: response.choices[0].message.content,
        components: [],
        dataFlow: "Unable to analyze data flow",
        recommendations: [],
      };
    }
  }

  async mapDependencies(
    code: string,
    filePath: string,
    repositoryContext?: RepositoryContext
  ): Promise<{
    imports: Array<{ module: string; items: string[]; type: "internal" | "external" }>;
    exports: string[];
    usedBy: string[];
    graph: Record<string, string[]>;
  }> {
    const systemPrompt = `You are a dependency analysis expert. Analyze code dependencies and return in JSON format:
{
  "imports": [
    { "module": "@/lib/utils", "items": ["cn", "formatDate"], "type": "internal" }
  ],
  "exports": ["MyComponent", "helper"],
  "usedBy": ["File1.tsx", "File2.tsx"],
  "graph": { "utils": ["date", "string"], "date": [] }
}`;

    const userPrompt = `
Analyze dependencies for:
File: ${filePath}

Code:
${code}

${repositoryContext ? `Repository Context:
File Structure: ${repositoryContext.fileStructure?.slice(0, 50).join(', ')}
Dependencies: ${JSON.stringify(repositoryContext.dependencies, null, 2)}
` : ''}

Map all dependencies and their relationships.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      return {
        imports: parsed.imports || [],
        exports: parsed.exports || [],
        usedBy: parsed.usedBy || [],
        graph: parsed.graph || {},
      };
    } catch (error) {
      return {
        imports: [],
        exports: [],
        usedBy: [],
        graph: {},
      };
    }
  }

  async detectBugs(
    code: string,
    filePath: string,
    options: {
      errorLog?: string;
      stackTrace?: string;
      language?: string;
      testResults?: string;
    } = {}
  ): Promise<{
    bugs: Array<{
      type: string;
      severity: "low" | "medium" | "high" | "critical";
      location: { line: number; column?: number };
      description: string;
      fix: string;
    }>;
    rootCause?: string;
    preventiveMeasures: string[];
  }> {
    const template = this.promptTemplates.get("debugging");
    if (!template) {
      throw new Error("Debugging template not found");
    }

    const context = {
      title: "Bug Detection",
      summary: "Analyze code for potential bugs and issues",
      filePath,
      code,
      errorLog: options.errorLog,
      stackTrace: options.stackTrace,
    };

    const systemPrompt = `${template.system}

Additionally, return results in JSON format:
{
  "bugs": [
    {
      "type": "NullPointerException",
      "severity": "high",
      "location": { "line": 42, "column": 10 },
      "description": "Detailed description",
      "fix": "Suggested fix"
    }
  ],
  "rootCause": "Explanation of the underlying issue",
  "preventiveMeasures": ["Add null checks", "Write tests"]
}`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: template.userTemplate(context) },
      ],
      temperature: template.temperature,
      max_tokens: template.maxTokens,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      return {
        bugs: parsed.bugs || [],
        rootCause: parsed.rootCause,
        preventiveMeasures: parsed.preventiveMeasures || [],
      };
    } catch (error) {
      return {
        bugs: [],
        rootCause: "Unable to determine root cause",
        preventiveMeasures: [],
      };
    }
  }

  async reasonWithChainOfThought(
    taskId: string,
    prompt: string,
    context: {
      taskType?: TaskType;
      strategy?: ReasoningStrategy;
      priorSteps?: ReasoningStep[];
      repositoryContext?: RepositoryContext;
      codeContext?: CodeContext;
    } = {}
  ): Promise<{
    reasoning: ReasoningStep[];
    conclusion: string;
    nextSteps: string[];
  }> {
    const strategy = context.strategy || "analytical";
    const taskType = context.taskType || "code_review";

    const systemPrompt = `You are an AI agent using ${strategy} reasoning to solve problems.

Chain-of-thought process:
1. Break down the problem into smaller sub-problems
2. Reason through each step explicitly
3. Show your work and confidence levels
4. Build upon previous conclusions
5. Arrive at a well-reasoned solution

For each reasoning step, think aloud and explain your logic.

Return results in JSON format:
{
  "reasoning": [
    {
      "id": "step-1",
      "timestamp": "2024-01-01T00:00:00Z",
      "description": "First, I analyze...",
      "confidence": 85,
      "completed": true
    }
  ],
  "conclusion": "Based on the reasoning above...",
  "nextSteps": ["Step 1", "Step 2"]
}`;

    const contextInfo = [];
    if (context.priorSteps && context.priorSteps.length > 0) {
      contextInfo.push(`Prior Reasoning Steps:
${context.priorSteps.map((s, i) => `${i + 1}. ${s.description} (confidence: ${s.confidence}%)`).join('\n')}`);
    }

    if (context.repositoryContext) {
      contextInfo.push(`Repository Architecture:
${JSON.stringify(context.repositoryContext.architecture, null, 2)}`);
    }

    if (context.codeContext) {
      contextInfo.push(`Code Context:
File: ${context.codeContext.filePath}
Language: ${context.codeContext.language || 'unknown'}

Code:
${context.codeContext.content}`);

      if (context.codeContext.relatedFiles) {
        contextInfo.push(`Related Files:
${context.codeContext.relatedFiles.map((f) => `- ${f.path}`).join('\n')}`);
      }
    }

    const userPrompt = `
Task: ${prompt}
Task Type: ${taskType}
Reasoning Strategy: ${strategy}

${contextInfo.join('\n\n')}

Use chain-of-thought reasoning to solve this task. Show each step of your thinking process.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: strategy === "creative" ? 0.8 : strategy === "debugging" ? 0.2 : 0.5,
      max_tokens: 8192,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      const reasoning = parsed.reasoning || [];

      if (this.storage && taskId) {
        for (const step of reasoning) {
          await this.storage.addTaskReasoning(taskId, step);
        }
      }

      return {
        reasoning,
        conclusion: parsed.conclusion || "Reasoning completed",
        nextSteps: parsed.nextSteps || [],
      };
    } catch (error) {
      console.error("Failed to parse chain-of-thought response:", error);
      return {
        reasoning: [],
        conclusion: response.choices[0].message.content,
        nextSteps: [],
      };
    }
  }

  async executeTaskWithReasoning(
    taskId: string,
    taskType: TaskType,
    context: any,
    strategy: ReasoningStrategy = "analytical"
  ): Promise<{
    result: any;
    reasoning: ReasoningStep[];
    confidence: number;
  }> {
    const template = this.promptTemplates.get(taskType);
    if (!template) {
      throw new Error(`Template not found for task type: ${taskType}`);
    }

    const task = this.storage ? await this.storage.getTask(taskId) : undefined;
    const priorReasoning = task?.reasoning || [];

    const enrichedContext = {
      ...context,
      priorReasoning,
      taskType,
      strategy,
    };

    const systemPrompt = `${template.system}

Use ${strategy} reasoning and return detailed results with your reasoning process in JSON format.
Include a "reasoning" array with each step of your thought process.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: template.userTemplate(enrichedContext) },
      ],
      temperature: template.temperature,
      max_tokens: template.maxTokens,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      
      const reasoning: ReasoningStep[] = parsed.reasoning || [];
      if (this.storage && taskId && reasoning.length > 0) {
        for (const step of reasoning) {
          await this.storage.addTaskReasoning(taskId, step);
        }
      }

      return {
        result: parsed,
        reasoning,
        confidence: parsed.confidence || 80,
      };
    } catch (error) {
      console.error("Failed to parse task execution response:", error);
      return {
        result: { content: response.choices[0].message.content },
        reasoning: [],
        confidence: 50,
      };
    }
  }

  async continueConversation(
    taskId: string,
    message: string,
    options: {
      includeContext?: boolean;
      repositoryContext?: RepositoryContext;
      codeContext?: CodeContext;
    } = {}
  ): Promise<{
    response: string;
    reasoning?: ReasoningStep[];
  }> {
    let conversation = this.conversationContexts.get(taskId);
    
    if (!conversation) {
      const task = this.storage ? await this.storage.getTask(taskId) : undefined;
      conversation = {
        taskId,
        messages: [],
        reasoningHistory: task?.reasoning || [],
        metadata: {},
      };
      this.conversationContexts.set(taskId, conversation);
    }

    const contextMessages: ChatMessage[] = [];
    
    if (options.includeContext && conversation.reasoningHistory.length > 0) {
      const contextSummary = `Previous reasoning steps:\n${
        conversation.reasoningHistory
          .slice(-5)
          .map((s) => `- ${s.description}`)
          .join('\n')
      }`;
      contextMessages.push({ role: "assistant", content: contextSummary });
    }

    if (options.repositoryContext) {
      contextMessages.push({
        role: "system",
        content: `Repository context: ${JSON.stringify(options.repositoryContext, null, 2)}`,
      });
    }

    if (options.codeContext) {
      contextMessages.push({
        role: "system",
        content: `Current code context:\nFile: ${options.codeContext.filePath}\n\n${options.codeContext.content}`,
      });
    }

    conversation.messages.push({ role: "user", content: message });

    const allMessages = [
      {
        role: "system" as const,
        content: "You are an expert AI development assistant. Provide clear, actionable responses.",
      },
      ...contextMessages,
      ...conversation.messages.slice(-10),
    ];

    const response = await this.callAPI({
      model: this.settings.model,
      messages: allMessages,
      temperature: 0.6,
      max_tokens: this.settings.maxTokens,
    });

    const assistantMessage = response.choices[0].message.content;
    conversation.messages.push({ role: "assistant", content: assistantMessage });

    return {
      response: assistantMessage,
    };
  }

  clearConversationContext(taskId: string): void {
    this.conversationContexts.delete(taskId);
  }

  // Backward compatible methods

  async generateTaskPlan(
    eventType: string,
    repository: string,
    action: string,
    payload: any
  ): Promise<{
    title: string;
    summary: string;
    steps: string[];
  }> {
    const systemPrompt = `You are an expert AI software development agent. Your role is to analyze GitHub repository events and create detailed, actionable development plans.

When given a repository event, you should:
1. Understand the context and intent
2. Identify what needs to be done
3. Break down the work into clear steps
4. Consider security, best practices, and testing

Respond in JSON format with:
{
  "title": "Brief task title",
  "summary": "2-3 sentence summary of what needs to be done and why",
  "steps": ["step 1", "step 2", ...]
}`;

    const userPrompt = `Repository: ${repository}
Event Type: ${eventType}
Action: ${action}

Event Details:
${JSON.stringify(payload, null, 2)}

Create a development task plan for this GitHub event.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: this.settings.temperature,
      max_tokens: this.settings.maxTokens,
    });

    try {
      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);
      return {
        title: parsed.title || "Untitled Task",
        summary: parsed.summary || "No summary provided",
        steps: parsed.steps || [],
      };
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      return {
        title: `Handle ${eventType} event`,
        summary: `Process ${action} in ${repository}`,
        steps: ["Analyze event", "Plan changes", "Execute modifications"],
      };
    }
  }

  async generateCodeModifications(
    task: Task,
    fileContent: string,
    filePath: string
  ): Promise<string> {
    const systemPrompt = `You are an expert code refactoring assistant. Your role is to analyze code and suggest improvements based on the given task.

Return ONLY the modified code, without any explanations or markdown formatting.`;

    const userPrompt = `Task: ${task.title}
Context: ${task.summary}

File: ${filePath}
Current Code:
${fileContent}

Provide the improved code that addresses this task.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: this.settings.maxTokens,
    });

    return response.choices[0].message.content;
  }

  async generateCodeDiff(
    task: Task,
    fileContent: string,
    filePath: string,
    options: {
      includeReasoning?: boolean;
      repositoryContext?: RepositoryContext;
    } = {}
  ): Promise<FileDiff> {
    const systemPrompt = `You are an expert code modification assistant. Your role is to analyze code and suggest precise improvements.

Return ONLY the modified code, without any explanations or markdown formatting.`;

    const userPrompt = `Task: ${task.title}
Context: ${task.summary}

${options.repositoryContext ? `Repository Context:
Architecture: ${JSON.stringify(options.repositoryContext.architecture, null, 2)}
Dependencies: ${JSON.stringify(options.repositoryContext.dependencies, null, 2)}
` : ''}

File: ${filePath}
Current Code:
${fileContent}

Provide the improved code that addresses this task.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: this.settings.maxTokens,
    });

    const modifiedCode = response.choices[0].message.content;
    const diff = this.diffService.generateDiff(fileContent, modifiedCode, filePath);

    if (this.storage) {
      await this.storage.addTaskDiff(task.id, diff);
    }

    return diff;
  }

  async generateCodeDiffWithReasoning(
    task: Task,
    fileContent: string,
    filePath: string,
    options: {
      repositoryContext?: RepositoryContext;
    } = {}
  ): Promise<{
    diff: FileDiff;
    reasoning: Array<{
      lineNumber: number;
      changeType: "add" | "remove" | "modify";
      reason: string;
      confidence: number;
    }>;
  }> {
    const systemPrompt = `You are an expert code modification assistant. Analyze code and suggest precise improvements with detailed reasoning.

Return your response in JSON format:
{
  "modifiedCode": "The complete modified code",
  "reasoning": [
    {
      "lineNumber": 10,
      "changeType": "add",
      "reason": "Added error handling to prevent crashes",
      "confidence": 95
    }
  ]
}`;

    const userPrompt = `Task: ${task.title}
Context: ${task.summary}

${options.repositoryContext ? `Repository Context:
Architecture: ${JSON.stringify(options.repositoryContext.architecture, null, 2)}
Dependencies: ${JSON.stringify(options.repositoryContext.dependencies, null, 2)}
` : ''}

File: ${filePath}
Current Code:
${fileContent}

Provide the improved code with reasoning for each change.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: this.settings.maxTokens,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      const modifiedCode = parsed.modifiedCode || response.choices[0].message.content;
      const reasoning = parsed.reasoning || [];

      const diff = this.diffService.generateDiff(fileContent, modifiedCode, filePath);

      if (this.storage) {
        await this.storage.addTaskDiff(task.id, diff);

        for (const reason of reasoning) {
          await this.storage.addTaskReasoning(task.id, {
            id: `reasoning-${Date.now()}-${Math.random()}`,
            timestamp: new Date().toISOString(),
            description: `Line ${reason.lineNumber} (${reason.changeType}): ${reason.reason}`,
            confidence: reason.confidence,
            completed: true,
          });
        }
      }

      return {
        diff,
        reasoning,
      };
    } catch (error) {
      const diff = this.diffService.generateDiff(fileContent, response.choices[0].message.content, filePath);
      
      if (this.storage) {
        await this.storage.addTaskDiff(task.id, diff);
      }

      return {
        diff,
        reasoning: [],
      };
    }
  }

  async explainDiff(diff: FileDiff): Promise<{
    summary: string;
    changes: Array<{
      type: "add" | "remove" | "context";
      lineNumber: number;
      explanation: string;
    }>;
  }> {
    const diffString = this.diffService.formatDiffForDisplay(diff);
    const stats = this.diffService.getDiffStatistics(diff);

    const systemPrompt = `You are a code review expert. Analyze the provided diff and explain the changes clearly.

Return in JSON format:
{
  "summary": "Overall summary of changes",
  "changes": [
    {
      "type": "add",
      "lineNumber": 10,
      "explanation": "Added null check for safety"
    }
  ]
}`;

    const userPrompt = `Analyze this code diff:

File: ${diff.path}
Statistics: ${stats.additions} additions, ${stats.deletions} deletions

Diff:
${diffString}

Explain the changes and their purpose.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      return {
        summary: parsed.summary || "Code changes analyzed",
        changes: parsed.changes || [],
      };
    } catch (error) {
      return {
        summary: response.choices[0].message.content,
        changes: [],
      };
    }
  }

  async generateMultiFileDiffs(
    task: Task,
    files: Array<{ path: string; content: string }>,
    options: {
      repositoryContext?: RepositoryContext;
    } = {}
  ): Promise<FileDiff[]> {
    const diffs: FileDiff[] = [];

    for (const file of files) {
      try {
        const diff = await this.generateCodeDiff(task, file.content, file.path, options);
        diffs.push(diff);
      } catch (error) {
        console.error(`Failed to generate diff for ${file.path}:`, error);
      }
    }

    return diffs;
  }

  async validateDiffSafety(
    diff: FileDiff,
    originalContent: string
  ): Promise<{
    safe: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const validation = this.diffService.validatePatch(originalContent, diff.lines);
    
    const systemPrompt = `You are a code safety validator. Analyze code changes for potential issues.

Return in JSON format:
{
  "safe": true,
  "issues": ["Critical issue 1"],
  "warnings": ["Warning 1"]
}`;

    const diffString = this.diffService.formatDiffForDisplay(diff);

    const userPrompt = `Analyze this diff for safety:

File: ${diff.path}
Diff:
${diffString}

Original:
${originalContent}

Check for:
- Breaking changes
- Security vulnerabilities
- Performance issues
- Logic errors`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      
      const issues = [...validation.errors, ...(parsed.issues || [])];
      
      return {
        safe: validation.valid && parsed.safe,
        issues,
        warnings: parsed.warnings || [],
      };
    } catch (error) {
      return {
        safe: validation.valid,
        issues: validation.errors,
        warnings: [],
      };
    }
  }

  async explainReasoning(
    step: string,
    context: string
  ): Promise<{ description: string; confidence: number }> {
    const systemPrompt = `You are explaining your reasoning process as an AI development agent. Be concise but clear.

Respond in JSON format:
{
  "description": "Brief explanation of this step",
  "confidence": 85
}`;

    const userPrompt = `Step: ${step}
Context: ${context}

Explain your reasoning for this step.`;

    const response = await this.callAPI({
      model: this.settings.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 300,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      return {
        description: parsed.description || step,
        confidence: parsed.confidence || 80,
      };
    } catch {
      return {
        description: step,
        confidence: 80,
      };
    }
  }

  private async callAPI(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.providerManager) {
      try {
        const response = await this.providerManager.chat({
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          model: request.model,
        });

        return {
          choices: [
            {
              message: {
                content: response.content,
              },
            },
          ],
        };
      } catch (error) {
        console.error("Provider manager failed, falling back to direct API:", error);
      }
    }

    const endpoint = this.settings.apiEndpoint.endsWith("/chat/completions")
      ? this.settings.apiEndpoint
      : `${this.settings.apiEndpoint}/chat/completions`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`AI API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  setMCPClientManager(mcpClientManager: MCPClientManager): void {
    this.mcpClientManager = mcpClientManager;
  }

  async getAvailableMCPTools(): Promise<Array<{ serverId: string; serverName: string; tools: MCPTool[] }>> {
    if (!this.storage || !this.mcpClientManager) {
      return [];
    }

    const connections = await this.storage.getAllMCPConnections();
    const toolsByServer: Array<{ serverId: string; serverName: string; tools: MCPTool[] }> = [];

    for (const connection of connections) {
      if (connection.status !== "connected") {
        continue;
      }

      const client = this.mcpClientManager.getClient(connection.id);
      if (!client || !client.isInitialized()) {
        continue;
      }

      try {
        const tools = await client.listTools();
        toolsByServer.push({
          serverId: connection.id,
          serverName: connection.name,
          tools,
        });
      } catch (error) {
        console.error(`Error fetching tools from ${connection.name}:`, error);
      }
    }

    return toolsByServer;
  }

  async executeMCPTool(serverId: string, toolName: string, params?: Record<string, any>): Promise<any> {
    if (!this.mcpClientManager) {
      throw new Error("MCP Client Manager not configured");
    }

    const client = this.mcpClientManager.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not found`);
    }

    if (!client.isInitialized()) {
      throw new Error(`MCP server ${serverId} not initialized`);
    }

    const result = await client.callTool(toolName, params);

    if (this.storage) {
      await this.storage.updateMCPConnection(serverId, {
        lastUsed: new Date().toISOString(),
      });
    }

    return result;
  }

  async getMCPToolsDescription(): Promise<string> {
    const toolsByServer = await this.getAvailableMCPTools();

    if (toolsByServer.length === 0) {
      return "No MCP tools available.";
    }

    let description = "Available MCP Tools:\n\n";

    for (const serverTools of toolsByServer) {
      description += `Server: ${serverTools.serverName} (${serverTools.serverId})\n`;
      description += `Tools:\n`;

      for (const tool of serverTools.tools) {
        description += `  - ${tool.name}: ${tool.description}\n`;
        if (tool.inputSchema && Object.keys(tool.inputSchema).length > 0) {
          description += `    Parameters: ${JSON.stringify(tool.inputSchema, null, 2)}\n`;
        }
      }

      description += "\n";
    }

    description += `\nTo execute an MCP tool, use the format:\n`;
    description += `{ "action": "execute_mcp_tool", "serverId": "<server_id>", "toolName": "<tool_name>", "params": { ... } }\n`;

    return description;
  }

  async executeTaskWithMCPTools(
    taskId: string,
    taskDescription: string,
    taskType: TaskType = "feature_creation"
  ): Promise<void> {
    const mcpToolsDescription = await this.getMCPToolsDescription();

    const systemPrompt = `You are an AI assistant with access to MCP (Model Context Protocol) tools.

${mcpToolsDescription}

When you need to use an MCP tool, respond with a JSON object in this format:
{
  "action": "execute_mcp_tool",
  "serverId": "<server_id>",
  "toolName": "<tool_name>",
  "params": { ... },
  "reasoning": "Why you're using this tool"
}

After receiving the tool result, continue with your task using the information provided.`;

    const context = this.conversationContexts.get(taskId) || {
      taskId,
      messages: [],
      reasoningHistory: [],
      metadata: {},
    };

    context.messages.push({
      role: "system",
      content: systemPrompt,
    });

    context.messages.push({
      role: "user",
      content: `Task: ${taskDescription}\n\nPlease analyze this task and determine if you need to use any MCP tools to complete it.`,
    });

    this.conversationContexts.set(taskId, context);

    let maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      const request: ChatCompletionRequest = {
        model: this.settings.model,
        messages: context.messages,
        temperature: 0.7,
        max_tokens: 4096,
      };

      const response = await this.callAPI(request);
      const assistantMessage = response.choices[0].message.content;

      context.messages.push({
        role: "assistant",
        content: assistantMessage,
      });

      try {
        const parsedResponse = JSON.parse(assistantMessage);

        if (parsedResponse.action === "execute_mcp_tool") {
          const { serverId, toolName, params, reasoning } = parsedResponse;

          if (this.storage) {
            await this.storage.addTaskReasoning(taskId, {
              id: randomUUID(),
              timestamp: new Date().toISOString(),
              description: `Executing MCP tool: ${toolName} - ${reasoning}`,
              confidence: 85,
              completed: false,
            });
          }

          const toolResult = await this.executeMCPTool(serverId, toolName, params);

          context.messages.push({
            role: "user",
            content: `Tool execution result:\n${JSON.stringify(toolResult, null, 2)}\n\nPlease continue with the task using this information.`,
          });

          if (this.storage) {
            await this.storage.addTaskLog(taskId, {
              id: randomUUID(),
              timestamp: new Date().toISOString(),
              level: "info",
              message: `MCP tool executed: ${toolName} on ${serverId}`,
            });
          }
        } else if (parsedResponse.action === "complete") {
          break;
        }
      } catch (error) {
        break;
      }
    }

    this.conversationContexts.set(taskId, context);
  }
}
