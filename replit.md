# AI GitHub Agent Dashboard

## Overview

This is an **AI-driven GitHub automation agent** that integrates with MCP (Model Context Protocol) GitHub and Playwright servers to autonomously plan, orchestrate, and execute full-stack software development workflows. The system operates both as an autonomous AI developer and as a GitHub App bot that reacts intelligently to repository events (pull requests, issues, comments, pushes, workflow updates).

The application provides a real-time dashboard for monitoring AI reasoning chains, execution logs, code diffs, and task progress. It supports any OpenAI-compatible API endpoint and employs advanced prompt engineering with semantic memory of repository architecture and context across sessions.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Architecture Updates (November 2025)

### UI Enhancement (November 9, 2025)

**Dark-Only Neon Theme:**
- Redesigned entire color scheme to cyberpunk red/orange neon aesthetic (HSL 16-20 degrees)
- Removed light/dark theme toggle for consistent dark-only experience
- Implemented subtle animated background glows using CSS pseudo-elements with radial gradients
- Enhanced keyboard focus states with high-contrast neon outlines for accessibility
- Updated sidebar with toggle-elevate system and rounded accent indicators
- Applied neon utilities (neon-text, neon-border, neon-pulse) throughout the interface
- All components maintain dark-mode compatibility with proper contrast ratios

**Real-Time WebSocket Integration:**
- Singleton WebSocket manager with auto-reconnect and exponential backoff
- React hooks for WebSocket subscriptions integrated with TanStack Query
- Real-time task updates, logs, reasoning steps, and diffs
- Automatic cache invalidation on WebSocket events
- Connection status indicator with neon-pulse animation
- Fallback to polling when WebSocket unavailable

**Enhanced Page Features:**
- Home: Real-time task monitoring, advanced task creation with repository search and branch auto-fill
- TaskDetail: Live log streaming with proper historical/live merge and de-duplication, real-time reasoning chain, diff viewer
- SystemStatus: Already complete with container runner and MCP server monitoring
- Statistics: Already complete with provider metrics and cost tracking
- History: Already complete with GitHub events timeline
- Settings: Already complete with AI provider configuration and GitHub integration

### Advanced Features Implemented

**Container Runner System:**
- Ephemeral lightweight Docker containers for isolated task execution
- Resource limits (memory, CPU) and security constraints
- Network isolation modes (none, bridge, host)
- Real-time log streaming (stdout/stderr) with level detection
- Performance statistics collection (CPU, memory, network I/O)
- Automatic cleanup and timeout handling
- Artifact management (logs, screenshots, test reports, diffs)

**Contextual Memory Manager:**
- Semantic repository representation with dependency graphs
- File structure analysis and architectural layer detection
- Code pattern identification (design patterns, anti-patterns)
- Technical debt analysis and scoring
- Knowledge graph for concept relationships
- Historical analysis (frequently modified files, author expertise)
- Circular dependency detection
- Multi-language support (JavaScript, Python, Rust, Go)

**Advanced Prompt Engineering:**
- Task complexity-based strategy selection
- Dynamic prompt construction with repository context
- Historical reasoning integration
- MCP tools availability awareness
- Multi-depth reasoning modes (shallow, medium, deep)
- Task-type specific templates (refactoring, debugging, architecture, etc.)
- Token optimization and context management
- Confidence scoring and uncertainty identification

**Session Management System:**
- Session lifecycle tracking (initialization → execution → feedback → completion)
- Tool execution history and performance metrics
- AI context tracking (tokens, providers, message count)
- Git context integration (branches, PRs, commits)
- Timeline events for all agent actions
- Iterative feedback loop support (child sessions)
- Session statistics and analytics
- TTL-based automatic cleanup

### GitHub Copilot Integration Features

**Entry Points:**
- GitHub Issues: Assign to `@copilot`
- Pull Request Comments: Mention `@copilot` in comments
- Agents Panel: Direct delegation via UI overlay
- VS Code: GitHub Pull Requests extension integration
- GitHub CLI: `gh agent-task create`
- MCP-enabled tools: Any tool supporting Model Context Protocol

**Execution Flow:**
1. Branch creation: `copilot/{action-type}-{uuid}`
2. Draft PR creation with auto-generated title and plan section
3. GitHub Actions ephemeral environment spinup
4. Repository clone and dependency installation
5. AI-driven task execution with real-time monitoring
6. Iterative feedback handling from PR comments
7. Timeline events tracking all decisions and actions

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

**MCP Servers (Implemented):**
- **MCP GitHub Server** (47 endpoints):
  - Repository operations (clone, read, write, search)
  - Pull request management (create, update, review, merge)
  - Issue manipulation (create, comment, label, assign)
  - Branch operations (create, delete, merge, rebase)
  - Workflow triggering and monitoring
  - Code search and navigation
  - Release management
- **MCP Playwright Server** (47 tools):
  - Browser automation (navigate, click, type, etc.)
  - Visual testing and screenshot capture
  - DOM interaction and element selection
  - E2E test execution and reporting
  - Performance monitoring
  - Accessibility testing
  - Network interception
- **Custom MCP Servers**:
  - Proprietary integrations support
  - External API connections
  - Domain-specific tools

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