import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Copy, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Settings } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [temperature, setTemperature] = useState("0.7");
  const [githubToken, setGithubToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhook`;

  useEffect(() => {
    if (settings) {
      setApiEndpoint(settings.ai.apiEndpoint);
      setApiKey(settings.ai.apiKey === "***" ? "" : settings.ai.apiKey);
      setModel(settings.ai.model);
      setMaxTokens(settings.ai.maxTokens.toString());
      setTemperature(settings.ai.temperature.toString());
      setGithubToken(settings.github.token === "***" ? "" : settings.github.token);
      setWebhookSecret(settings.github.webhookSecret || "");
      setAutoApprove(settings.autoApprove);
    }
  }, [settings]);

  const handleSaveAISettings = async () => {
    try {
      const updatedSettings: Settings = {
        ai: {
          apiEndpoint,
          apiKey: apiKey || settings?.ai.apiKey || "",
          model,
          maxTokens: parseInt(maxTokens),
          temperature: parseFloat(temperature),
        },
        github: settings?.github || { token: "" },
        autoApprove,
      };

      await apiRequest("POST", "/api/settings", updatedSettings);

      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      
      toast({
        title: "Settings saved",
        description: "AI configuration has been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSaveGitHubSettings = async () => {
    try {
      const updatedSettings: Settings = {
        ai: settings?.ai || {
          apiEndpoint: "https://api.openai.com/v1",
          apiKey: "",
          model: "gpt-4",
          maxTokens: 4096,
          temperature: 0.7,
        },
        github: {
          token: githubToken || settings?.github.token || "",
          webhookSecret: webhookSecret || undefined,
        },
        autoApprove,
      };

      await apiRequest("POST", "/api/settings", updatedSettings);

      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      
      toast({
        title: "Settings saved",
        description: "GitHub configuration has been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copied!",
      description: "Webhook URL copied to clipboard",
    });
  };

  const hasGitHubToken = settings?.github.token && settings.github.token !== "";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI models, GitHub integration, and webhook endpoints
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OpenAI-Compatible API Configuration</CardTitle>
          <CardDescription>
            Connect to OpenAI, Anthropic, Mistral, Ollama, or any custom API endpoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-endpoint">API Endpoint URL</Label>
            <Input
              id="api-endpoint"
              type="url"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="https://api.openai.com/v1"
              data-testid="input-api-endpoint"
            />
            <p className="text-xs text-muted-foreground">
              Examples: OpenAI (https://api.openai.com/v1), Ollama (http://localhost:11434/v1), 
              Anthropic (https://api.anthropic.com/v1), Custom endpoint
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKey ? "***" : "sk-..."}
              data-testid="input-api-key"
            />
            <p className="text-xs text-muted-foreground">
              Your API key is stored securely on the server
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model" data-testid="select-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4">GPT-4</SelectItem>
                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
                <SelectItem value="mistral-large">Mistral Large</SelectItem>
                <SelectItem value="llama-3-70b">Llama 3 70B (Ollama)</SelectItem>
                <SelectItem value="custom">Custom Model</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-tokens">Max Tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                data-testid="input-max-tokens"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                data-testid="input-temperature"
              />
            </div>
          </div>

          <Button 
            onClick={handleSaveAISettings}
            data-testid="button-save-ai-settings"
          >
            Save AI Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub Integration</CardTitle>
          <CardDescription>
            Connect your GitHub account to enable repository access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium">Connection Status</div>
              <div className="text-sm text-muted-foreground">
                {hasGitHubToken ? "Connected" : "Not connected"}
              </div>
            </div>
            {hasGitHubToken ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle className="h-3 w-3 text-chart-2" />
                Connected
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Disconnected
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-token">Personal Access Token</Label>
            <Input
              id="github-token"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder={hasGitHubToken ? "***" : "ghp_..."}
              data-testid="input-github-token"
            />
            <p className="text-xs text-muted-foreground">
              Required scopes: repo, workflow, read:org
            </p>
          </div>

          <Button 
            onClick={handleSaveGitHubSettings}
            data-testid="button-save-github-settings"
          >
            Save GitHub Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
          <CardDescription>
            Configure GitHub webhooks to receive repository events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-sm"
                data-testid="input-webhook-url"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyWebhookUrl}
                data-testid="button-copy-webhook"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add this URL to your GitHub repository webhook settings
            </p>
          </div>

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Pull Requests</Badge>
              <Badge variant="secondary">Issues</Badge>
              <Badge variant="secondary">Push</Badge>
              <Badge variant="secondary">Comments</Badge>
              <Badge variant="secondary">Workflow Runs</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-secret">Webhook Secret (Optional)</Label>
            <Input
              id="webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="Enter webhook secret..."
              data-testid="input-webhook-secret"
            />
            <p className="text-xs text-muted-foreground">
              Used to verify webhook payloads from GitHub
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced Settings</CardTitle>
          <CardDescription>
            Configure advanced AI agent behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium">Auto-approve changes</div>
              <div className="text-sm text-muted-foreground">
                Automatically approve and commit AI-generated code changes
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoApprove(!autoApprove)}
              data-testid="button-toggle-auto-approve"
            >
              {autoApprove ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
