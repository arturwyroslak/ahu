import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ProviderConfig,
  ProviderType,
  ProviderMetrics,
  RoutingConfig,
} from "@shared/schema";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

export interface ChatCompletionResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface RequestContext {
  taskComplexity?: number;
  contextSize?: number;
  preferredProvider?: string;
  timeout?: number;
}

interface ProviderInstance {
  config: ProviderConfig;
  client: OpenAI | Anthropic;
  metrics: ProviderMetrics;
  requestQueue: Array<() => Promise<any>>;
  isProcessingQueue: boolean;
}

export class AIProviderManager {
  private providers: Map<string, ProviderInstance> = new Map();
  private routingConfig: RoutingConfig;
  private metricsUpdateCallbacks: Array<(metrics: ProviderMetrics[]) => void> = [];

  constructor(
    providerConfigs: ProviderConfig[],
    routingConfig?: RoutingConfig
  ) {
    this.routingConfig = routingConfig || {
      taskComplexityThreshold: 0.7,
      contextSizeThreshold: 90000,
      rateLimitThreshold: 0.2,
      enableFallback: true,
      userPreference: undefined,
    };

    for (const config of providerConfigs) {
      if (config.enabled) {
        this.initializeProvider(config);
      }
    }
  }

  private initializeProvider(config: ProviderConfig): void {
    let client: OpenAI | Anthropic;

    switch (config.type) {
      case "openai":
        client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.endpoint,
        });
        break;

      case "anthropic":
        client = new Anthropic({
          apiKey: config.apiKey,
        });
        break;

      case "azure-openai":
        if (!config.azureDeploymentName || !config.azureApiVersion) {
          throw new Error(
            "Azure OpenAI requires deploymentName and apiVersion"
          );
        }
        client = new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.endpoint,
          defaultQuery: { "api-version": config.azureApiVersion },
          defaultHeaders: { "api-key": config.apiKey },
        });
        break;

      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }

    this.providers.set(config.name, {
      config,
      client,
      metrics: {
        providerName: config.name,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokensUsed: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        averageResponseTime: 0,
        totalCost: 0,
        lastUsed: undefined,
        rateLimitRemaining: undefined,
        rateLimitReset: undefined,
        errorCounts: {},
      },
      requestQueue: [],
      isProcessingQueue: false,
    });
  }

  private estimateTokens(messages: ChatMessage[]): number {
    const text = messages.map((m) => m.content).join(" ");
    return Math.ceil(text.length / 4);
  }

  private estimateTaskComplexity(messages: ChatMessage[]): number {
    const text = messages.map((m) => m.content).join(" ");
    const complexity =
      (text.length / 10000) * 0.3 +
      (messages.length / 10) * 0.2 +
      (text.includes("refactor") ||
      text.includes("architecture") ||
      text.includes("design")
        ? 0.3
        : 0) +
      (text.includes("bug") || text.includes("debug") || text.includes("fix")
        ? 0.2
        : 0);

    return Math.min(1, complexity);
  }

  private selectProvider(
    request: ChatCompletionRequest,
    context: RequestContext
  ): string | null {
    const estimatedTokens = this.estimateTokens(request.messages);
    const taskComplexity =
      context.taskComplexity ?? this.estimateTaskComplexity(request.messages);
    const contextSize = context.contextSize ?? estimatedTokens;

    if (context.preferredProvider && this.providers.has(context.preferredProvider)) {
      const provider = this.providers.get(context.preferredProvider)!;
      if (provider.config.enabled && contextSize <= provider.config.contextWindow) {
        return context.preferredProvider;
      }
    }

    const eligibleProviders = Array.from(this.providers.entries())
      .filter(([_, provider]) => {
        if (!provider.config.enabled) return false;
        if (contextSize > provider.config.contextWindow) return false;
        
        const rateLimitUsage =
          provider.metrics.rateLimitRemaining !== undefined
            ? 1 - provider.metrics.rateLimitRemaining
            : 0;
        if (rateLimitUsage > (1 - this.routingConfig.rateLimitThreshold)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const [aName, aProvider] = a;
        const [bName, bProvider] = b;

        let aScore = 0;
        let bScore = 0;

        if (taskComplexity >= this.routingConfig.taskComplexityThreshold) {
          aScore += aProvider.config.contextWindow > 150000 ? 2 : 0;
          bScore += bProvider.config.contextWindow > 150000 ? 2 : 0;
        }

        if (contextSize >= this.routingConfig.contextSizeThreshold) {
          aScore += aProvider.config.contextWindow > 150000 ? 3 : 0;
          bScore += bProvider.config.contextWindow > 150000 ? 3 : 0;
        }

        aScore += aProvider.config.priority;
        bScore += bProvider.config.priority;

        const aSuccessRate =
          aProvider.metrics.totalRequests > 0
            ? aProvider.metrics.successfulRequests / aProvider.metrics.totalRequests
            : 1;
        const bSuccessRate =
          bProvider.metrics.totalRequests > 0
            ? bProvider.metrics.successfulRequests / bProvider.metrics.totalRequests
            : 1;

        aScore += aSuccessRate * 2;
        bScore += bSuccessRate * 2;

        if (aProvider.metrics.averageResponseTime > 0 && bProvider.metrics.averageResponseTime > 0) {
          aScore += (1 / aProvider.metrics.averageResponseTime) * 0.5;
          bScore += (1 / bProvider.metrics.averageResponseTime) * 0.5;
        }

        return bScore - aScore;
      });

    return eligibleProviders.length > 0 ? eligibleProviders[0][0] : null;
  }

  private async executeWithRetry<T>(
    providerName: string,
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error: any) {
        lastError = error;
        const errorCode = error.status || error.code || "unknown";

        if (!provider.metrics.errorCounts[errorCode]) {
          provider.metrics.errorCounts[errorCode] = 0;
        }
        provider.metrics.errorCounts[errorCode]++;

        if (errorCode === 429) {
          const retryAfter = error.headers?.["retry-after"]
            ? parseInt(error.headers["retry-after"]) * 1000
            : baseDelay * Math.pow(2, attempt);

          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
            continue;
          }
        } else if (errorCode === 504 || errorCode === "ETIMEDOUT") {
          if (attempt < maxAttempts - 1) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt), 120000);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        } else if (errorCode === 400) {
          throw error;
        } else if (errorCode === 503 || errorCode === "ECONNREFUSED") {
          if (attempt < maxAttempts - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw error;
      }
    }

    throw lastError || new Error("Max retry attempts reached");
  }

  private async queueRequest(
    providerName: string,
    fn: () => Promise<any>
  ): Promise<any> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    return new Promise((resolve, reject) => {
      provider.requestQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue(providerName);
    });
  }

  private async processQueue(providerName: string): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider || provider.isProcessingQueue) return;

    provider.isProcessingQueue = true;

    while (provider.requestQueue.length > 0) {
      const request = provider.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error(`Queue processing error for ${providerName}:`, error);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    provider.isProcessingQueue = false;
  }

  private updateMetrics(
    providerName: string,
    success: boolean,
    responseTime: number,
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  ): void {
    const provider = this.providers.get(providerName);
    if (!provider) return;

    provider.metrics.totalRequests++;
    if (success) {
      provider.metrics.successfulRequests++;
    } else {
      provider.metrics.failedRequests++;
    }

    if (usage) {
      provider.metrics.totalInputTokens += usage.inputTokens;
      provider.metrics.totalOutputTokens += usage.outputTokens;
      provider.metrics.totalTokensUsed += usage.totalTokens;

      if (provider.config.costPer1kTokens) {
        const inputCost =
          (usage.inputTokens / 1000) * provider.config.costPer1kTokens.input;
        const outputCost =
          (usage.outputTokens / 1000) * provider.config.costPer1kTokens.output;
        provider.metrics.totalCost += inputCost + outputCost;
      }
    }

    const totalResponseTimes =
      provider.metrics.averageResponseTime *
        (provider.metrics.totalRequests - 1) +
      responseTime;
    provider.metrics.averageResponseTime =
      totalResponseTimes / provider.metrics.totalRequests;

    provider.metrics.lastUsed = new Date().toISOString();

    this.notifyMetricsUpdate();
  }

  private notifyMetricsUpdate(): void {
    const allMetrics = Array.from(this.providers.values()).map((p) => p.metrics);
    for (const callback of this.metricsUpdateCallbacks) {
      callback(allMetrics);
    }
  }

  async chat(
    request: ChatCompletionRequest,
    context: RequestContext = {}
  ): Promise<ChatCompletionResponse> {
    const selectedProviderName = this.selectProvider(request, context);

    if (!selectedProviderName) {
      throw new Error("No eligible provider found for this request");
    }

    const attemptWithProvider = async (
      providerName: string
    ): Promise<ChatCompletionResponse> => {
      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }

      const startTime = Date.now();

      try {
        const result = await this.executeWithRetry(
          providerName,
          async () => {
            const timeout = context.timeout || 120000;
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), timeout)
            );

            const chatPromise = this.callProviderAPI(
              provider,
              request,
              context
            );

            return Promise.race([chatPromise, timeoutPromise]);
          },
          3,
          1000
        );

        const responseTime = Date.now() - startTime;

        this.updateMetrics(providerName, true, responseTime, result.usage);

        return {
          ...result,
          provider: providerName,
        };
      } catch (error: any) {
        const responseTime = Date.now() - startTime;
        this.updateMetrics(providerName, false, responseTime);

        if (
          this.routingConfig.enableFallback &&
          this.providers.size > 1
        ) {
          const fallbackProviders = Array.from(this.providers.keys()).filter(
            (name) => name !== providerName && this.providers.get(name)?.config.enabled
          );

          if (fallbackProviders.length > 0) {
            console.warn(
              `Provider ${providerName} failed, attempting fallback to ${fallbackProviders[0]}`
            );
            return attemptWithProvider(fallbackProviders[0]);
          }
        }

        throw error;
      }
    };

    return attemptWithProvider(selectedProviderName);
  }

  private async callProviderAPI(
    provider: ProviderInstance,
    request: ChatCompletionRequest,
    context: RequestContext
  ): Promise<Omit<ChatCompletionResponse, "provider">> {
    const model = request.model || provider.config.model;
    const temperature = request.temperature ?? provider.config.temperature;
    const maxTokens = request.max_tokens ?? provider.config.maxTokens;

    if (provider.config.type === "anthropic") {
      const client = provider.client as Anthropic;

      const systemMessage = request.messages.find((m) => m.role === "system");
      const conversationMessages = request.messages.filter(
        (m) => m.role !== "system"
      );

      const anthropicMessages = conversationMessages.map((msg) => ({
        role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: msg.content,
      }));

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage?.content,
        messages: anthropicMessages,
      });

      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: response.stop_reason || undefined,
      };
    } else {
      const client = provider.client as OpenAI;

      const openaiMessages = request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await client.chat.completions.create({
        model,
        messages: openaiMessages,
        temperature,
        max_tokens: maxTokens,
      });

      return {
        content: response.choices[0].message.content || "",
        model: response.model,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        finishReason: response.choices[0].finish_reason,
      };
    }
  }

  async testProvider(providerName: string): Promise<{
    success: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      await this.chat(
        {
          messages: [
            {
              role: "user",
              content: "Respond with 'OK' if you can read this message.",
            },
          ],
          max_tokens: 50,
        },
        { preferredProvider: providerName, timeout: 10000 }
      );

      return {
        success: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  getProviders(): Array<{
    name: string;
    type: ProviderType;
    model: string;
    enabled: boolean;
    contextWindow: number;
  }> {
    return Array.from(this.providers.entries()).map(([name, provider]) => ({
      name,
      type: provider.config.type,
      model: provider.config.model,
      enabled: provider.config.enabled,
      contextWindow: provider.config.contextWindow,
    }));
  }

  getMetrics(): ProviderMetrics[] {
    return Array.from(this.providers.values()).map((p) => p.metrics);
  }

  getProviderMetrics(providerName: string): ProviderMetrics | null {
    const provider = this.providers.get(providerName);
    return provider ? provider.metrics : null;
  }

  onMetricsUpdate(callback: (metrics: ProviderMetrics[]) => void): void {
    this.metricsUpdateCallbacks.push(callback);
  }

  updateProviderConfig(name: string, updates: Partial<ProviderConfig>): void {
    const provider = this.providers.get(name);
    if (provider) {
      provider.config = { ...provider.config, ...updates };
    }
  }

  updateRoutingConfig(updates: Partial<RoutingConfig>): void {
    this.routingConfig = { ...this.routingConfig, ...updates };
  }
}
