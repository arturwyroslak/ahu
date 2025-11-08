import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitPullRequest, GitCommit, MessageSquare, AlertCircle } from "lucide-react";

type EventType = "pull_request" | "push" | "issue" | "comment";

interface EventLog {
  id: string;
  timestamp: string;
  type: EventType;
  repository: string;
  action: string;
  status: "success" | "pending" | "failed";
}

interface EventLogTableProps {
  events: EventLog[];
}

const eventIcons = {
  pull_request: GitPullRequest,
  push: GitCommit,
  issue: AlertCircle,
  comment: MessageSquare,
};

const statusVariants = {
  success: "secondary" as const,
  pending: "outline" as const,
  failed: "destructive" as const,
};

export function EventLogTable({ events }: EventLogTableProps) {
  return (
    <Card data-testid="card-event-log">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Recent Events</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Time
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Type
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Repository
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Action
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => {
                const Icon = eventIcons[event.type];
                return (
                  <tr
                    key={event.id}
                    className="border-b border-border hover-elevate"
                    data-testid={`event-row-${index}`}
                  >
                    <td className="p-3 text-xs text-muted-foreground">
                      {event.timestamp}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm capitalize">{event.type.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm font-mono">{event.repository}</td>
                    <td className="p-3 text-sm">{event.action}</td>
                    <td className="p-3">
                      <Badge variant={statusVariants[event.status]} className="capitalize">
                        {event.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
