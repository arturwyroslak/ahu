import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { File } from "lucide-react";

interface DiffLine {
  lineNumber: number;
  type: "add" | "remove" | "context";
  content: string;
}

interface FileDiff {
  path: string;
  lines: DiffLine[];
}

interface DiffViewerProps {
  files: FileDiff[];
}

export function DiffViewer({ files }: DiffViewerProps) {
  return (
    <Card data-testid="card-diff-viewer">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <File className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-medium">Code Changes</h3>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-testid="button-approve-changes">
              Approve
            </Button>
            <Button variant="ghost" size="sm" data-testid="button-request-changes">
              Request Changes
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <Tabs defaultValue="0" className="w-full">
          <div className="border-b border-border px-6">
            <TabsList className="h-auto p-0 bg-transparent">
              {files.map((file, index) => (
                <TabsTrigger
                  key={index}
                  value={index.toString()}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                  data-testid={`tab-file-${index}`}
                >
                  <span className="text-xs font-mono">{file.path}</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {file.lines.filter(l => l.type !== 'context').length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {files.map((file, fileIndex) => (
            <TabsContent key={fileIndex} value={fileIndex.toString()} className="m-0">
              <div className="font-mono text-xs" data-testid={`diff-content-${fileIndex}`}>
                {file.lines.map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={`flex ${
                      line.type === "add"
                        ? "bg-chart-2/10"
                        : line.type === "remove"
                        ? "bg-destructive/10"
                        : ""
                    }`}
                    data-testid={`diff-line-${lineIndex}`}
                  >
                    <span className="text-muted-foreground w-12 flex-shrink-0 text-right px-3 py-1 select-none">
                      {line.lineNumber}
                    </span>
                    <span
                      className={`w-4 flex-shrink-0 text-center ${
                        line.type === "add"
                          ? "text-chart-2"
                          : line.type === "remove"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                    </span>
                    <span className="flex-1 px-3 py-1">{line.content}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
