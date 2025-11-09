import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Database, Container, Cpu, HardDrive, Network, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface SystemStatus {
  mcpServers: Array<{
    name: string;
    status: "connected" | "disconnected" | "error";
    toolsCount: number;
  }>;
  containerRunner: {
    available: boolean;
    activeContainers: number;
    totalCapacity: number;
  };
  memory: {
    used: number;
    total: number;
    unit: string;
  };
  sessions: {
    active: number;
    cached: number;
  };
}

export function SystemStatus() {
  const { data: status, isLoading, error } = useQuery<SystemStatus>({
    queryKey: ["/api/system/status"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load system status. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "disconnected":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "error":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* MCP Servers Status */}
      <Card data-testid="card-mcp-status">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              MCP Servers
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {status?.mcpServers?.length || 0} Configured
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {status?.mcpServers && status.mcpServers.length > 0 ? (
            status.mcpServers.map((server) => (
              <div
                key={server.name}
                className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                data-testid={`mcp-server-${server.name}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${
                    server.status === "connected" ? "bg-green-500" : "bg-gray-400"
                  }`} />
                  <span className="text-sm font-medium">{server.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {server.toolsCount} tools
                  </span>
                  <Badge variant="outline" className={`text-xs ${getStatusColor(server.status)}`}>
                    {server.status}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No MCP servers configured
            </div>
          )}
        </CardContent>
      </Card>

      {/* Container Runner Status */}
      <Card data-testid="card-container-status">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Container className="h-4 w-4" />
              Container Runner
            </CardTitle>
            <Badge
              variant="outline"
              className={`text-xs ${
                status?.containerRunner?.available
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-red-500/10 text-red-500 border-red-500/20"
              }`}
            >
              {status?.containerRunner?.available ? "Available" : "Unavailable"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Active Containers</span>
            </div>
            <span className="text-sm font-medium">
              {status?.containerRunner?.activeContainers || 0} / {status?.containerRunner?.totalCapacity || 10}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Resource Limits</span>
            </div>
            <span className="text-xs text-muted-foreground">512MB / 1 CPU</span>
          </div>
          {status?.containerRunner?.available && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Ephemeral execution environments ready
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Memory & Sessions */}
      <Card data-testid="card-memory-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            Memory Manager
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Storage Type</span>
            <Badge variant="outline" className="text-xs">In-Memory</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active Sessions</span>
            <span className="text-sm font-medium">{status?.sessions?.active || 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cached Contexts</span>
            <span className="text-sm font-medium">{status?.sessions?.cached || 0}</span>
          </div>
        </CardContent>
      </Card>

      {/* Network & Connectivity */}
      <Card data-testid="card-network-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Network className="h-4 w-4" />
            Connectivity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">GitHub API</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Connected</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">OpenAI API</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">WebSocket</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
