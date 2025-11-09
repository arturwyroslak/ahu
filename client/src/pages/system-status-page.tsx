import { SystemStatus } from "@/components/system-status";
import { SessionTimeline } from "@/components/session-timeline";
import { MCPToolsPanel } from "@/components/mcp-tools-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SystemStatusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          System Status
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor system health, MCP servers, and container runtime
        </p>
      </div>

      <SystemStatus />

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            Activity Timeline
          </TabsTrigger>
          <TabsTrigger value="tools" data-testid="tab-tools">
            MCP Tools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <SessionTimeline limit={50} />
        </TabsContent>

        <TabsContent value="tools">
          <MCPToolsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
