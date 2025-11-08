import type { FileDiff, DiffLine } from "@shared/schema";

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface DiffChange {
  type: "add" | "remove" | "context";
  lineNumber: number;
  content: string;
  reasoning?: string;
  confidence?: number;
}

export class DiffService {
  private contextLines: number = 3;

  constructor(contextLines: number = 3) {
    this.contextLines = contextLines;
  }

  generateDiff(
    original: string,
    modified: string,
    filePath: string,
    reasoning?: Map<number, { reason: string; confidence: number }>
  ): FileDiff {
    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");
    
    const changes = this.computeDiff(originalLines, modifiedLines);
    const diffLines = this.createUnifiedDiff(changes, originalLines, modifiedLines, reasoning);

    return {
      path: filePath,
      lines: diffLines,
    };
  }

  applyPatch(
    original: string,
    patch: DiffLine[],
    filePath: string
  ): { success: boolean; result?: string; error?: string } {
    const validation = this.validatePatch(original, patch);
    
    if (!validation.valid) {
      return {
        success: false,
        error: `Patch validation failed: ${validation.errors.join(", ")}`,
      };
    }

    try {
      const originalLines = original.split("\n");
      const result: string[] = [];
      let originalIndex = 0;
      let patchIndex = 0;

      while (patchIndex < patch.length) {
        const diffLine = patch[patchIndex];

        if (diffLine.type === "context") {
          if (originalIndex < originalLines.length) {
            result.push(originalLines[originalIndex]);
            originalIndex++;
          }
          patchIndex++;
        } else if (diffLine.type === "remove") {
          originalIndex++;
          patchIndex++;
        } else if (diffLine.type === "add") {
          result.push(diffLine.content);
          patchIndex++;
        }
      }

      while (originalIndex < originalLines.length) {
        result.push(originalLines[originalIndex]);
        originalIndex++;
      }

      return {
        success: true,
        result: result.join("\n"),
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to apply patch: ${error.message}`,
      };
    }
  }

  validatePatch(original: string, patch: DiffLine[]): ValidationResult {
    const errors: string[] = [];
    const originalLines = original.split("\n");

    let originalIndex = 0;

    for (let i = 0; i < patch.length; i++) {
      const diffLine = patch[i];

      if (diffLine.type === "context" || diffLine.type === "remove") {
        if (originalIndex >= originalLines.length) {
          errors.push(
            `Line ${i + 1}: Expected line at index ${originalIndex}, but original file has only ${originalLines.length} lines`
          );
          continue;
        }

        const originalLine = originalLines[originalIndex];
        if (diffLine.type === "context" && diffLine.content !== originalLine) {
          errors.push(
            `Line ${i + 1}: Context mismatch. Expected "${originalLine}", got "${diffLine.content}"`
          );
        } else if (diffLine.type === "remove" && diffLine.content !== originalLine) {
          errors.push(
            `Line ${i + 1}: Remove mismatch. Expected "${originalLine}", got "${diffLine.content}"`
          );
        }

        originalIndex++;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  formatDiffForDisplay(diff: FileDiff): string {
    const lines: string[] = [];
    lines.push(`--- a/${diff.path}`);
    lines.push(`+++ b/${diff.path}`);

    let currentHunk: DiffLine[] = [];
    let hunkStartOriginal = 0;
    let hunkStartModified = 0;

    const flushHunk = () => {
      if (currentHunk.length === 0) return;

      let originalCount = 0;
      let modifiedCount = 0;

      for (const line of currentHunk) {
        if (line.type === "context" || line.type === "remove") {
          originalCount++;
        }
        if (line.type === "context" || line.type === "add") {
          modifiedCount++;
        }
      }

      lines.push(
        `@@ -${hunkStartOriginal + 1},${originalCount} +${hunkStartModified + 1},${modifiedCount} @@`
      );

      for (const line of currentHunk) {
        const prefix =
          line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
        lines.push(`${prefix}${line.content}`);
      }

      currentHunk = [];
    };

    let originalLine = 0;
    let modifiedLine = 0;

    for (const diffLine of diff.lines) {
      if (currentHunk.length === 0) {
        hunkStartOriginal = originalLine;
        hunkStartModified = modifiedLine;
      }

      currentHunk.push(diffLine);

      if (diffLine.type === "context" || diffLine.type === "remove") {
        originalLine++;
      }
      if (diffLine.type === "context" || diffLine.type === "add") {
        modifiedLine++;
      }
    }

    flushHunk();

    return lines.join("\n");
  }

  parseDiffString(diffString: string): FileDiff[] {
    const lines = diffString.split("\n");
    const diffs: FileDiff[] = [];
    let currentDiff: FileDiff | null = null;
    let currentLines: DiffLine[] = [];
    let lineNumber = 0;

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        if (currentDiff && currentLines.length > 0) {
          currentDiff.lines = currentLines;
          diffs.push(currentDiff);
        }
        currentLines = [];
        lineNumber = 0;
      } else if (line.startsWith("+++ ")) {
        const match = line.match(/^\+\+\+ [ab]\/(.+)$/);
        if (match) {
          currentDiff = {
            path: match[1],
            lines: [],
          };
        }
      } else if (line.startsWith("@@ ")) {
        const match = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          lineNumber = parseInt(match[1], 10) - 1;
        }
      } else if (line.startsWith("+")) {
        currentLines.push({
          lineNumber: lineNumber++,
          type: "add",
          content: line.substring(1),
        });
      } else if (line.startsWith("-")) {
        currentLines.push({
          lineNumber: lineNumber++,
          type: "remove",
          content: line.substring(1),
        });
      } else if (line.startsWith(" ")) {
        currentLines.push({
          lineNumber: lineNumber++,
          type: "context",
          content: line.substring(1),
        });
      }
    }

    if (currentDiff && currentLines.length > 0) {
      currentDiff.lines = currentLines;
      diffs.push(currentDiff);
    }

    return diffs;
  }

  reverseDiff(diff: FileDiff): FileDiff {
    const reversedLines: DiffLine[] = diff.lines.map((line) => ({
      ...line,
      type:
        line.type === "add"
          ? "remove"
          : line.type === "remove"
          ? "add"
          : "context",
    }));

    return {
      path: diff.path,
      lines: reversedLines,
    };
  }

  private computeDiff(
    originalLines: string[],
    modifiedLines: string[]
  ): DiffChange[] {
    const changes: DiffChange[] = [];
    
    const lcs = this.longestCommonSubsequence(originalLines, modifiedLines);
    
    let i = 0;
    let j = 0;
    let lineNumber = 0;

    for (const [origIdx, modIdx] of lcs) {
      while (i < origIdx) {
        changes.push({
          type: "remove",
          lineNumber: lineNumber++,
          content: originalLines[i],
        });
        i++;
      }

      while (j < modIdx) {
        changes.push({
          type: "add",
          lineNumber: lineNumber++,
          content: modifiedLines[j],
        });
        j++;
      }

      changes.push({
        type: "context",
        lineNumber: lineNumber++,
        content: originalLines[i],
      });
      i++;
      j++;
    }

    while (i < originalLines.length) {
      changes.push({
        type: "remove",
        lineNumber: lineNumber++,
        content: originalLines[i],
      });
      i++;
    }

    while (j < modifiedLines.length) {
      changes.push({
        type: "add",
        lineNumber: lineNumber++,
        content: modifiedLines[j],
      });
      j++;
    }

    return changes;
  }

  private longestCommonSubsequence(
    a: string[],
    b: string[]
  ): Array<[number, number]> {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0)
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const result: Array<[number, number]> = [];
    let i = m;
    let j = n;

    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift([i - 1, j - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }

  private createUnifiedDiff(
    changes: DiffChange[],
    originalLines: string[],
    modifiedLines: string[],
    reasoning?: Map<number, { reason: string; confidence: number }>
  ): DiffLine[] {
    const diffLines: DiffLine[] = [];
    
    for (const change of changes) {
      diffLines.push({
        lineNumber: change.lineNumber,
        type: change.type,
        content: change.content,
      });
    }

    return diffLines;
  }

  mergeSequentialDiffs(diffs: FileDiff[]): FileDiff[] {
    const merged = new Map<string, FileDiff>();

    for (const diff of diffs) {
      if (merged.has(diff.path)) {
        const existing = merged.get(diff.path)!;
        existing.lines.push(...diff.lines);
      } else {
        merged.set(diff.path, { ...diff });
      }
    }

    return Array.from(merged.values());
  }

  getDiffStatistics(diff: FileDiff): {
    additions: number;
    deletions: number;
    changes: number;
  } {
    let additions = 0;
    let deletions = 0;

    for (const line of diff.lines) {
      if (line.type === "add") additions++;
      if (line.type === "remove") deletions++;
    }

    return {
      additions,
      deletions,
      changes: additions + deletions,
    };
  }
}
