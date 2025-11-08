# AI GitHub Agent Dashboard

## Overview

This is an **AI-driven GitHub automation agent** that integrates with MCP (Model Context Protocol) GitHub and Playwright servers to autonomously plan, orchestrate, and execute full-stack software development workflows. The system operates both as an autonomous AI developer and as a GitHub App bot that reacts intelligently to repository events (pull requests, issues, comments, pushes, workflow updates).

The application provides a real-time dashboard for monitoring AI reasoning chains, execution logs, code diffs, and task progress. It supports any OpenAI-compatible API endpoint and employs advanced prompt engineering with semantic memory of repository architecture and context across sessions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React with TypeScript using Vite as the build tool

**UI Component System:** Radix UI primitives with shadcn/ui component library following a "New York" style design system

**Design Philosophy:** Inspired by Linear, GitHub, and VS Code - prioritizing information density, scannable data hierarchy, and functional clarity for technical workflows. Uses Inter for UI typography and JetBrains Mono for code/logs.

**Styling:** Tailwind CSS with custom design tokens for light/dark themes, utilizing CSS variables for dynamic theming

**State Management:** TanStack Query (React Query) for server state management with custom query client configuration

**Routing:** Wouter for client-side routing (lightweight alternative to React Router)

**Key UI Components:**
- Real-time task monitoring dashboard with metrics cards
- AI reasoning chain visualization showing step-by-step decision making with confidence scores
- Execution log panel with auto-scroll and log level filtering
- Diff viewer for code changes with syntax highlighting
- Event log table for GitHub webhook events
- Settings configuration for AI endpoints and GitHub integration

### Backend Architecture

**Runtime:** Node.js with Express.js server

**Language:** TypeScript with ESNext module system

**API Design:** RESTful HTTP endpoints under `/api` namespace with additional Server-Sent Events (SSE) for real-time log streaming

**Server-Side Rendering:** Vite development server integration with custom middleware mode for hot module replacement during development

**Build System:** 
- Vite for client-side bundling
- esbuild for server-side production builds
- Platform-specific bundling with external package handling

**Key Services:**
- `AIService`: Manages connections to OpenAI-compatible endpoints, handles task planning and reasoning generation
- `AIProviderManager`: **NEW** - Multi-provider AI orchestration system that supports OpenAI, Anthropic Claude, and Azure OpenAI with:
  - Smart routing algorithm based on task complexity, context size, rate limits, and user preferences
  - Automatic failover between providers for high availability
  - Comprehensive error handling with exponential backoff retry logic (max 3 attempts, 120s timeout)
  - Rate limiting with request queueing (429 errors)
  - Performance tracking (response times, token usage, success rates, cost tracking)
  - Provider-specific adapters for OpenAI and Anthropic message formats
- `GitHubService`: Integrates with GitHub API for repository operations, file content retrieval, and webhook processing
- `Storage`: In-memory storage implementation (IStorage interface allows for future database backends)

### Data Storage

**Current Implementation:** In-memory storage using Maps for tasks, events, and settings

**Schema Design:** Zod schemas for runtime type validation with TypeScript types derived from schemas

**Data Models:**
- **Tasks:** Track AI agent work with status (planning, executing, completed, failed, queued), logs, reasoning steps, and file diffs
- **GitHub Events:** Store webhook events with repository, action, and processing status
- **Settings:** AI configuration (endpoint, API key, model, tokens, temperature) and GitHub configuration (token, webhook secret, auto-approve)

**Future-Ready:** Storage interface abstraction (`IStorage`) allows seamless migration to PostgreSQL via Drizzle ORM (configuration already present in `drizzle.config.ts`)

### Authentication & Security

**GitHub App Integration:** Webhook endpoint (`/api/webhook`) designed to receive and process GitHub events with signature validation support via webhook secrets

**API Key Management:** Secure storage of sensitive credentials (AI API keys, GitHub tokens) with masked display in settings UI

**Safety Controls:** 
- Human-in-the-loop approval workflow (auto-approve setting)
- Sandboxed container execution mentioned in project requirements
- Audit logging through task log entries

### External Dependencies

**AI Model Integration:**
- **Multi-Provider System** with intelligent routing:
  - **OpenAI**: GPT-4 Turbo (128K context window, 0.3-0.7 temperature)
  - **Anthropic**: Claude 3 Sonnet (200K context window, 1.0 temperature)
  - **Azure OpenAI**: Enterprise-grade deployment support
- Smart provider selection based on:
  - Task complexity (threshold: 0.7 for advanced models)
  - Context size (threshold: 90,000 tokens for large context models)
  - Rate limit remaining (threshold: 20% for fallback triggers)
  - User preference settings
- Automatic failover and load balancing
- Real-time performance metrics and cost tracking
- Configurable model selection, temperature, and max tokens per provider
- Chat completion interface for reasoning and task generation

**GitHub Integration:**
- GitHub REST API for repository operations
- GitHub App webhook system for event-driven automation
- File content retrieval and repository metadata access

**MCP Servers (Planned):**
- MCP GitHub Server for enhanced repository operations
- MCP Playwright Server for browser automation and testing

**UI Component Libraries:**
- Radix UI primitives (accordion, alert-dialog, avatar, checkbox, dialog, dropdown, popover, scroll-area, select, tabs, toast, tooltip, etc.)
- cmdk for command palette functionality
- embla-carousel for carousel components
- date-fns for date formatting and manipulation
- lucide-react for consistent iconography

**Database (Configured but Not Active):**
- Drizzle ORM with PostgreSQL dialect
- Neon Database serverless driver (`@neondatabase/serverless`)
- Migration system configured in `./migrations`

**Development Tools:**
- Replit-specific plugins for runtime error overlay, cartographer, and dev banner
- TypeScript strict mode with ESNext targeting
- PostCSS with Tailwind and Autoprefixer

**Session Management:**
- `connect-pg-simple` for PostgreSQL session store (prepared for future use)
- Express session handling with raw body parsing for webhook validation