import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaskCard } from "@/components/task-card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Play, GitBranch, Loader2, AlertCircle } from "lucide-react";
import type { Task } from "@shared/schema";

interface Repository {
  name: string;
  full_name: string;
  description: string;
  default_branch: string;
}

export default function Home() {
  const { toast } = useToast();
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [description, setDescription] = useState("");

  const { data: repositories = [], isLoading: reposLoading } = useQuery<Repository[]>({
    queryKey: ["/api/github/repositories"],
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks/active"],
    refetchInterval: 3000,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { repository: string; branch: string; description: string }) => {
      const response = await apiRequest("POST", "/api/tasks", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Task Created",
        description: "Your task has been queued for execution.",
      });
      setRepository("");
      setBranch("main");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/active"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!repository || !description) {
      toast({
        title: "Validation Error",
        description: "Repository and description are required",
        variant: "destructive",
      });
      return;
    }

    createTaskMutation.mutate({
      repository,
      branch,
      description,
    });
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Create Task Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Create New Task
          </CardTitle>
          <CardDescription>
            Start an autonomous development task on your GitHub repository
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reposLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
              <p>Loading repositories...</p>
            </div>
          ) : repositories.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">No repositories found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Please configure GitHub settings first
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="repository">Repository*</Label>
                  <Select value={repository} onValueChange={setRepository}>
                    <SelectTrigger id="repository" data-testid="select-repository">
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repo) => (
                        <SelectItem key={repo.full_name} value={repo.full_name}>
                          {repo.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <Select value={branch} onValueChange={setBranch}>
                      <SelectTrigger id="branch" data-testid="select-branch">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main">main</SelectItem>
                        <SelectItem value="master">master</SelectItem>
                        <SelectItem value="develop">develop</SelectItem>
                        <SelectItem value="staging">staging</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Task Description*</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what you want the AI agent to do..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-description"
                  rows={4}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createTaskMutation.isPending}
                data-testid="button-create-task"
              >
                {createTaskMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Task...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Create Task
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Active Tasks List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Tasks</h2>
        {tasksLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
            <p>Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <Play className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No active tasks</p>
              <p className="text-xs mt-1">Create a new task to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                description={task.description}
                status={task.status}
                timestamp={formatTimestamp(task.createdAt)}
                progress={task.progress}
                repository={task.repository}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
