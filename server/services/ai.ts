import type { AISettings, Task } from "@shared/schema";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

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

export class AIService {
  private settings: AISettings;

  constructor(settings: AISettings) {
    this.settings = settings;
  }

  updateSettings(settings: AISettings) {
    this.settings = settings;
  }

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

  async explainReasoning(
    step: string,
    context: string
  ): Promise<{ description: string; confidence: number }> {
    const systemPrompt = `You are explaining your reasoning process as an AI development agent. Be concise but clear.

Respond in JSON format:
{
  "description": "Brief explanation of this step",
  "confidence": 85  // 0-100 confidence score
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
}
