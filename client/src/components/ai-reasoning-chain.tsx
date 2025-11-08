import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle } from "lucide-react";

interface ReasoningStep {
  id: string;
  timestamp: string;
  description: string;
  confidence?: number;
  completed: boolean;
}

interface AIReasoningChainProps {
  steps: ReasoningStep[];
}

export function AIReasoningChain({ steps }: AIReasoningChainProps) {
  return (
    <Card data-testid="card-ai-reasoning">
      <CardHeader>
        <CardTitle className="text-lg font-medium">AI Reasoning Chain</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex gap-3" data-testid={`reasoning-step-${index}`}>
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-background">
                  {step.completed ? (
                    <CheckCircle className="h-4 w-4 text-chart-2" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className="w-0.5 h-full bg-border mt-1" />
                )}
              </div>
              
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">{step.timestamp}</span>
                  {step.confidence && (
                    <Badge variant="secondary" className="text-xs">
                      {step.confidence}% confidence
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
