import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { Task } from "@shared/schema";

export interface ContainerConfig {
  image: string;
  repository: string;
  branch: string;
  command?: string[];
  env?: Record<string, string>;
  workDir?: string;
  memoryLimit?: string;
  cpuLimit?: string;
  networkMode?: "none" | "bridge" | "host";
  timeoutMs?: number;
}

export interface ContainerStats {
  containerId: string;
  cpuUsage: number;
  memoryUsage: number;
  networkRx: number;
  networkTx: number;
  timestamp: number;
}

export interface ContainerLogEntry {
  timestamp: number;
  stream: "stdout" | "stderr";
  message: string;
  level?: "info" | "warn" | "error" | "debug";
}

export interface ContainerArtifact {
  type: "log" | "screenshot" | "test-report" | "diff" | "build-output";
  path: string;
  content?: string; // Base64 encoded for binary data, plain text otherwise
  contentEncoding?: "base64" | "utf-8" | "none";
  metadata?: Record<string, any>;
}

export interface ContainerResult {
  exitCode: number;
  duration: number;
  logs: ContainerLogEntry[];
  artifacts: ContainerArtifact[];
  stats: ContainerStats[];
  error?: string;
}

export type ContainerStatus = 
  | "creating" 
  | "pulling" 
  | "starting" 
  | "running" 
  | "stopping" 
  | "stopped" 
  | "failed" 
  | "timeout";

export interface ContainerRunner {
  id: string;
  taskId: string;
  containerId?: string;
  config: ContainerConfig;
  status: ContainerStatus;
  startedAt?: number;
  stoppedAt?: number;
  logs: ContainerLogEntry[];
  artifacts: ContainerArtifact[];
  stats: ContainerStats[];
  process?: ChildProcess;
}

export class ContainerRunnerService extends EventEmitter {
  private runners: Map<string, ContainerRunner> = new Map();
  private statsIntervals: Map<string, NodeJS.Timeout> = new Map();

  // Maximum resource limits enforced for all containers
  private readonly MAX_MEMORY_MB = 512;
  private readonly MAX_CPU_COUNT = 1;

  constructor() {
    super();
  }

  /**
   * Validate and enforce memory limit (max 512MB)
   */
  private validateMemoryLimit(limit: string): string {
    const match = limit.match(/^(\d+)([kmg]?)$/i);
    if (!match) {
      console.warn(`Invalid memory limit '${limit}', using default 512m`);
      return "512m";
    }

    const value = parseInt(match[1]);
    const unit = (match[2] || "m").toLowerCase();

    // Convert to MB for comparison
    let memoryMB: number;
    switch (unit) {
      case "k":
        memoryMB = value / 1024;
        break;
      case "g":
        memoryMB = value * 1024;
        break;
      case "m":
      default:
        memoryMB = value;
    }

    // Enforce maximum
    if (memoryMB > this.MAX_MEMORY_MB) {
      console.warn(`Memory limit ${limit} exceeds maximum ${this.MAX_MEMORY_MB}MB, capping to 512m`);
      return "512m";
    }

    return limit;
  }

  /**
   * Validate and enforce CPU limit (max 1 core)
   */
  private validateCpuLimit(limit: string): string {
    const cpuCount = parseFloat(limit);
    
    if (isNaN(cpuCount) || cpuCount <= 0) {
      console.warn(`Invalid CPU limit '${limit}', using default 1`);
      return "1";
    }

    // Enforce maximum
    if (cpuCount > this.MAX_CPU_COUNT) {
      console.warn(`CPU limit ${limit} exceeds maximum ${this.MAX_CPU_COUNT}, capping to 1`);
      return "1";
    }

    return limit;
  }

  /**
   * Create and start a new ephemeral container runner for a task
   */
  async createRunner(taskId: string, config: ContainerConfig): Promise<string> {
    const runnerId = randomUUID();
    
    // Enforce resource limits with defaults that match orchestration requirements
    const memoryLimit = config.memoryLimit || "512m";
    const cpuLimit = config.cpuLimit || "1";
    
    // Validate and enforce maximum resource limits
    const validatedMemory = this.validateMemoryLimit(memoryLimit);
    const validatedCpu = this.validateCpuLimit(cpuLimit);
    
    const runner: ContainerRunner = {
      id: runnerId,
      taskId,
      config: {
        ...config,
        memoryLimit: validatedMemory,
        cpuLimit: validatedCpu,
        networkMode: config.networkMode || "bridge",
        timeoutMs: config.timeoutMs || 300000, // 5 minutes default
      },
      status: "creating",
      logs: [],
      artifacts: [],
      stats: [],
    };

    this.runners.set(runnerId, runner);
    this.emit("runner:created", { runnerId, taskId });

    // Start the container asynchronously
    this.startContainer(runnerId).catch((error) => {
      this.handleRunnerError(runnerId, error);
    });

    return runnerId;
  }

  /**
   * Start the Docker container with full lifecycle management
   */
  private async startContainer(runnerId: string): Promise<void> {
    const runner = this.runners.get(runnerId);
    if (!runner) {
      throw new Error(`Runner ${runnerId} not found`);
    }

    try {
      // Update status to pulling
      runner.status = "pulling";
      this.emit("runner:status", { runnerId, status: "pulling" });

      // Pull the Docker image
      await this.pullImage(runner.config.image);

      // Generate unique container name
      const containerName = `ai-agent-${runner.taskId}-${runnerId.slice(0, 8)}`;
      
      // Build Docker run command
      const dockerArgs = this.buildDockerArgs(containerName, runner.config);

      // Update status to starting
      runner.status = "starting";
      this.emit("runner:status", { runnerId, status: "starting" });

      // Spawn Docker container
      const process = spawn("docker", dockerArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      runner.process = process;
      runner.containerId = containerName;
      runner.startedAt = Date.now();
      runner.status = "running";
      this.emit("runner:status", { runnerId, status: "running" });

      // Setup log streaming
      this.setupLogStreaming(runnerId, process);

      // Setup stats collection
      this.startStatsCollection(runnerId);

      // Setup timeout
      if (runner.config.timeoutMs) {
        setTimeout(() => {
          if (runner.status === "running") {
            this.stopRunner(runnerId, "timeout");
          }
        }, runner.config.timeoutMs);
      }

      // Handle process exit
      process.on("exit", (code) => {
        this.handleProcessExit(runnerId, code || 0);
      });

      process.on("error", (error) => {
        this.handleRunnerError(runnerId, error);
      });

    } catch (error) {
      this.handleRunnerError(runnerId, error as Error);
    }
  }

  /**
   * Pull Docker image if not exists locally
   */
  private async pullImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const pullProcess = spawn("docker", ["pull", image], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      pullProcess.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to pull image ${image}`));
        }
      });

      pullProcess.on("error", reject);
    });
  }

  /**
   * Build Docker run arguments with security and resource constraints
   */
  private buildDockerArgs(containerName: string, config: ContainerConfig): string[] {
    const args = [
      "run",
      "--rm", // Remove container on exit
      "--name", containerName,
      
      // Resource limits
      "--memory", config.memoryLimit!,
      "--cpus", config.cpuLimit!,
      
      // Network configuration
      "--network", config.networkMode!,
      
      // Security: Read-only root filesystem (except working directory)
      "--read-only",
      
      // Temporary filesystem for work
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=512m",
      
      // No privileged mode
      "--security-opt", "no-new-privileges",
      
      // Drop all capabilities
      "--cap-drop", "ALL",
    ];

    // Add environment variables
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Add working directory
    if (config.workDir) {
      args.push("-w", config.workDir);
      // Mount working directory as writable
      args.push("--tmpfs", `${config.workDir}:rw,exec,size=1g`);
    }

    // Add repository clone command
    args.push(
      "--entrypoint", "/bin/sh",
      config.image,
      "-c",
      this.buildRunCommand(config)
    );

    return args;
  }

  /**
   * Build the command to run inside the container
   */
  private buildRunCommand(config: ContainerConfig): string {
    const commands: string[] = [];

    // Clone repository
    commands.push(`git clone --depth 1 --branch ${config.branch} https://github.com/${config.repository}.git /workspace`);
    commands.push("cd /workspace");

    // Run custom command or default build/test
    if (config.command && config.command.length > 0) {
      commands.push(config.command.join(" "));
    } else {
      // Default: try to detect and run tests
      commands.push(`
        if [ -f package.json ]; then
          npm install && npm test
        elif [ -f requirements.txt ]; then
          pip install -r requirements.txt && pytest
        elif [ -f Cargo.toml ]; then
          cargo build && cargo test
        elif [ -f go.mod ]; then
          go build && go test ./...
        else
          echo "No recognized build system found"
        fi
      `);
    }

    return commands.join(" && ");
  }

  /**
   * Setup real-time log streaming from container
   */
  private setupLogStreaming(runnerId: string, process: ChildProcess): void {
    const runner = this.runners.get(runnerId);
    if (!runner) return;

    // Stream stdout
    process.stdout?.on("data", (data: Buffer) => {
      const message = data.toString();
      const logEntry: ContainerLogEntry = {
        timestamp: Date.now(),
        stream: "stdout",
        message,
        level: this.detectLogLevel(message),
      };

      runner.logs.push(logEntry);
      this.emit("runner:log", { runnerId, log: logEntry });
    });

    // Stream stderr
    process.stderr?.on("data", (data: Buffer) => {
      const message = data.toString();
      const logEntry: ContainerLogEntry = {
        timestamp: Date.now(),
        stream: "stderr",
        message,
        level: "error",
      };

      runner.logs.push(logEntry);
      this.emit("runner:log", { runnerId, log: logEntry });
    });
  }

  /**
   * Detect log level from message content
   */
  private detectLogLevel(message: string): "info" | "warn" | "error" | "debug" {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("error") || lowerMessage.includes("fail")) {
      return "error";
    } else if (lowerMessage.includes("warn")) {
      return "warn";
    } else if (lowerMessage.includes("debug")) {
      return "debug";
    }
    
    return "info";
  }

  /**
   * Start collecting container stats
   */
  private startStatsCollection(runnerId: string): void {
    const runner = this.runners.get(runnerId);
    if (!runner || !runner.containerId) return;

    const interval = setInterval(() => {
      this.collectStats(runnerId);
    }, 2000); // Collect stats every 2 seconds

    this.statsIntervals.set(runnerId, interval);
  }

  /**
   * Collect container statistics
   */
  private async collectStats(runnerId: string): Promise<void> {
    const runner = this.runners.get(runnerId);
    if (!runner || !runner.containerId || runner.status !== "running") return;

    try {
      const statsProcess = spawn("docker", [
        "stats",
        runner.containerId,
        "--no-stream",
        "--format",
        "{{json .}}",
      ]);

      let output = "";
      statsProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      statsProcess.on("exit", (code) => {
        if (code === 0 && output) {
          try {
            const stats = JSON.parse(output);
            const containerStats: ContainerStats = {
              containerId: runner.containerId!,
              cpuUsage: parseFloat(stats.CPUPerc?.replace("%", "") || "0"),
              memoryUsage: this.parseMemoryUsage(stats.MemUsage || "0B / 0B"),
              networkRx: this.parseNetworkIO(stats.NetIO || "0B / 0B").rx,
              networkTx: this.parseNetworkIO(stats.NetIO || "0B / 0B").tx,
              timestamp: Date.now(),
            };

            runner.stats.push(containerStats);
            this.emit("runner:stats", { runnerId, stats: containerStats });
          } catch (error) {
            // Ignore parsing errors
          }
        }
      });
    } catch (error) {
      // Ignore stats collection errors
    }
  }

  /**
   * Parse memory usage from Docker stats format
   */
  private parseMemoryUsage(memUsage: string): number {
    const match = memUsage.match(/^([\d.]+)([KMGT]?B)/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      "B": 1,
      "KB": 1024,
      "MB": 1024 * 1024,
      "GB": 1024 * 1024 * 1024,
      "TB": 1024 * 1024 * 1024 * 1024,
    };

    return value * (multipliers[unit] || 1);
  }

  /**
   * Parse network I/O from Docker stats format
   */
  private parseNetworkIO(netIO: string): { rx: number; tx: number } {
    const parts = netIO.split(" / ");
    return {
      rx: this.parseMemoryUsage(parts[0] || "0B"),
      tx: this.parseMemoryUsage(parts[1] || "0B"),
    };
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(runnerId: string, exitCode: number): void {
    const runner = this.runners.get(runnerId);
    if (!runner) return;

    runner.stoppedAt = Date.now();
    runner.status = exitCode === 0 ? "stopped" : "failed";

    // Stop stats collection
    const statsInterval = this.statsIntervals.get(runnerId);
    if (statsInterval) {
      clearInterval(statsInterval);
      this.statsIntervals.delete(runnerId);
    }

    this.emit("runner:exit", {
      runnerId,
      exitCode,
      duration: runner.stoppedAt - (runner.startedAt || runner.stoppedAt),
    });

    // Cleanup
    this.cleanupRunner(runnerId);
  }

  /**
   * Handle runner error
   */
  private handleRunnerError(runnerId: string, error: Error): void {
    const runner = this.runners.get(runnerId);
    if (!runner) return;

    runner.status = "failed";
    runner.stoppedAt = Date.now();

    const logEntry: ContainerLogEntry = {
      timestamp: Date.now(),
      stream: "stderr",
      message: error.message,
      level: "error",
    };

    runner.logs.push(logEntry);
    this.emit("runner:error", { runnerId, error: error.message });

    // Stop stats collection
    const statsInterval = this.statsIntervals.get(runnerId);
    if (statsInterval) {
      clearInterval(statsInterval);
      this.statsIntervals.delete(runnerId);
    }

    // Cleanup
    this.cleanupRunner(runnerId);
  }

  /**
   * Stop a running container
   */
  async stopRunner(runnerId: string, reason?: "timeout" | "manual" | "error"): Promise<void> {
    const runner = this.runners.get(runnerId);
    if (!runner) return;

    runner.status = "stopping";
    this.emit("runner:status", { runnerId, status: "stopping", reason });

    // Kill the process
    if (runner.process && !runner.process.killed) {
      runner.process.kill("SIGTERM");
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (runner.process && !runner.process.killed) {
          runner.process.kill("SIGKILL");
        }
      }, 5000);
    }

    // Stop container if it exists
    if (runner.containerId) {
      try {
        await new Promise<void>((resolve) => {
          const stopProcess = spawn("docker", ["stop", runner.containerId!]);
          stopProcess.on("exit", () => resolve());
          stopProcess.on("error", () => resolve());
        });
      } catch (error) {
        // Ignore errors during stop
      }
    }
  }

  /**
   * Get all active runners
   */
  getActiveRunners(): ContainerRunner[] {
    return Array.from(this.runners.values()).filter(
      runner => runner.status === "running" || runner.status === "starting" || runner.status === "pulling"
    );
  }

  /**
   * Get all runners
   */
  getAllRunners(): ContainerRunner[] {
    return Array.from(this.runners.values());
  }

  /**
   * Cleanup runner resources
   */
  private async cleanupRunner(runnerId: string): Promise<void> {
    const runner = this.runners.get(runnerId);
    if (!runner) return;

    // Remove container if it still exists
    if (runner.containerId) {
      try {
        spawn("docker", ["rm", "-f", runner.containerId]);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Keep runner for 1 hour for log retrieval
    setTimeout(() => {
      this.runners.delete(runnerId);
      this.emit("runner:deleted", { runnerId });
    }, 3600000);
  }

  /**
   * Get runner status and details
   */
  getRunner(runnerId: string): ContainerRunner | undefined {
    return this.runners.get(runnerId);
  }

  /**
   * Get all runners for a task
   */
  getTaskRunners(taskId: string): ContainerRunner[] {
    return Array.from(this.runners.values()).filter(
      (runner) => runner.taskId === taskId
    );
  }

  /**
   * Get runner result
   */
  getRunnerResult(runnerId: string): ContainerResult | undefined {
    const runner = this.runners.get(runnerId);
    if (!runner) return undefined;

    return {
      exitCode: runner.status === "stopped" ? 0 : 1,
      duration: (runner.stoppedAt || Date.now()) - (runner.startedAt || 0),
      logs: runner.logs,
      artifacts: runner.artifacts,
      stats: runner.stats,
      error: runner.status === "failed" ? "Container failed" : undefined,
    };
  }

  /**
   * Add artifact to runner
   */
  addArtifact(runnerId: string, artifact: ContainerArtifact): void {
    const runner = this.runners.get(runnerId);
    if (!runner) return;

    runner.artifacts.push(artifact);
    this.emit("runner:artifact", { runnerId, artifact });
  }
}
