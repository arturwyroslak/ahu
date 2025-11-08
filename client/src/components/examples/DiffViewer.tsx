import { DiffViewer } from '../diff-viewer';

const mockDiffs = [
  {
    path: "src/middleware/auth.ts",
    lines: [
      { lineNumber: 1, type: "context" as const, content: "import { Request, Response, NextFunction } from 'express';" },
      { lineNumber: 2, type: "context" as const, content: "import jwt from 'jsonwebtoken';" },
      { lineNumber: 3, type: "remove" as const, content: "const SECRET = 'hardcoded-secret-key';" },
      { lineNumber: 3, type: "add" as const, content: "import { getJWTSecret } from '../config/secrets';" },
      { lineNumber: 4, type: "context" as const, content: "" },
      { lineNumber: 5, type: "context" as const, content: "export async function authMiddleware(req: Request, res: Response, next: NextFunction) {" },
    ],
  },
  {
    path: "src/config/secrets.ts",
    lines: [
      { lineNumber: 1, type: "add" as const, content: "export function getJWTSecret(): string {" },
      { lineNumber: 2, type: "add" as const, content: "  return process.env.JWT_SECRET || '';" },
      { lineNumber: 3, type: "add" as const, content: "}" },
    ],
  },
];

export default function DiffViewerExample() {
  return <DiffViewer files={mockDiffs} />;
}
