import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, Wrench, Code2, Globe, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface MCPTool {
  name: string;
  description: string;
  server: string;
  category: "repository" | "code" | "issue" | "pr" | "workflow" | "browser" | "other";
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
}

export function MCPToolsPanel() {
  const [search, setSearch] = useState("");
  
  const { data: tools = [], isLoading, error } = useQuery<MCPTool[]>({
    queryKey: ["/api/mcp/tools"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">MCP Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load MCP tools. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  const filteredTools = tools.filter((tool) =>
    tool.name.toLowerCase().includes(search.toLowerCase()) ||
    tool.description.toLowerCase().includes(search.toLowerCase())
  );

  const groupedTools = filteredTools.reduce((acc, tool) => {
    const category = tool.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(tool);
    return acc;
  }, {} as Record<string, MCPTool[]>);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "repository":
      case "code":
        return <Code2 className="h-3 w-3" />;
      case "browser":
        return <Globe className="h-3 w-3" />;
      default:
        return <Wrench className="h-3 w-3" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "repository":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "code":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      case "issue":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "pr":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "workflow":
        return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
      case "browser":
        return "bg-pink-500/10 text-pink-500 border-pink-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card data-testid="card-mcp-tools">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            MCP Tools
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {tools.length} Available
          </Badge>
        </div>
        <div className="pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-tools"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="all" className="w-full">
          <div className="px-6 pb-3">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all" className="text-xs">
                All ({filteredTools.length})
              </TabsTrigger>
              <TabsTrigger value="github" className="text-xs">
                GitHub ({(groupedTools.repository?.length || 0) + (groupedTools.code?.length || 0) + (groupedTools.issue?.length || 0) + (groupedTools.pr?.length || 0)})
              </TabsTrigger>
              <TabsTrigger value="workflow" className="text-xs">
                Workflow ({groupedTools.workflow?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="browser" className="text-xs">
                Browser ({groupedTools.browser?.length || 0})
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[500px]">
            <TabsContent value="all" className="px-6 pb-6 mt-0">
              {filteredTools.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-12">
                  <Wrench className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>{search ? "No tools match your search" : "No tools available"}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(groupedTools).map(([category, categoryTools]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={`text-xs ${getCategoryColor(category)}`}>
                          {getCategoryIcon(category)}
                          <span className="ml-1 capitalize">{category}</span>
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {categoryTools.length} tools
                        </span>
                      </div>
                      <div className="space-y-2 ml-4">
                        {categoryTools.map((tool) => (
                          <div
                            key={tool.name}
                            className="p-3 rounded-md bg-muted/30 hover-elevate"
                            data-testid={`tool-${tool.name}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <code className="text-xs font-mono text-foreground">
                                    {tool.name}
                                  </code>
                                  <Badge variant="outline" className="text-xs">
                                    {tool.server}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {tool.description}
                                </p>
                                {tool.parameters.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {tool.parameters.slice(0, 3).map((param) => (
                                      <span
                                        key={param.name}
                                        className="text-xs px-1.5 py-0.5 rounded bg-muted"
                                      >
                                        {param.name}
                                        {param.required && "*"}
                                      </span>
                                    ))}
                                    {tool.parameters.length > 3 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{tool.parameters.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="github" className="px-6 pb-6 mt-0">
              <div className="space-y-2">
                {[...((groupedTools.repository || []).concat(
                  groupedTools.code || [],
                  groupedTools.issue || [],
                  groupedTools.pr || []
                ))].map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="workflow" className="px-6 pb-6 mt-0">
              <div className="space-y-2">
                {(groupedTools.workflow || []).map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="browser" className="px-6 pb-6 mt-0">
              <div className="space-y-2">
                {(groupedTools.browser || []).map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ToolCard({ tool }: { tool: MCPTool }) {
  return (
    <div
      className="p-3 rounded-md bg-muted/30 hover-elevate"
      data-testid={`tool-${tool.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <code className="text-xs font-mono text-foreground">
            {tool.name}
          </code>
          <p className="text-xs text-muted-foreground mt-1">
            {tool.description}
          </p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {tool.server}
        </Badge>
      </div>
    </div>
  );
}
