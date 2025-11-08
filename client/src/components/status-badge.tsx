import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, PlayCircle, Loader2 } from "lucide-react";

type TaskStatus = "planning" | "executing" | "completed" | "failed" | "queued";

interface StatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

const statusConfig = {
  planning: {
    label: "Planning",
    icon: Loader2,
    variant: "secondary" as const,
    iconClass: "animate-spin",
  },
  executing: {
    label: "Executing",
    icon: PlayCircle,
    variant: "default" as const,
    iconClass: "animate-pulse",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    variant: "secondary" as const,
    iconClass: "text-chart-2",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    variant: "destructive" as const,
    iconClass: "",
  },
  queued: {
    label: "Queued",
    icon: Clock,
    variant: "outline" as const,
    iconClass: "text-muted-foreground",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={className} data-testid={`badge-status-${status}`}>
      <Icon className={`h-3 w-3 mr-1 ${config.iconClass}`} />
      {config.label}
    </Badge>
  );
}
