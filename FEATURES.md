# AI GitHub Automation Agent - Features Documentation

## Core Features (Always Available)

### 1. Memory Manager
**Status**: ✅ Fully Operational

Provides semantic repository analysis with real GitHub API integration:
- File structure analysis (types, sizes, paths)
- Dependency graph construction from package.json, requirements.txt, Cargo.toml
- Architectural layer detection (presentation, business logic, data access, API)
- Technical debt analysis and scoring
- Knowledge graph generation

**Usage**: Automatically activated when GitHub token is configured.

### 2. Advanced Prompt Engineering
**Status**: ✅ Fully Operational

Dynamic prompt construction with repository context:
- Task complexity-based strategy selection
- Multi-depth reasoning modes (analytical, creative, debugging, systematic, exploratory)
- MCP tool integration for enhanced capabilities
- Token optimization and context management

**Usage**: Integrated into all AI task execution.

### 3. Session Management
**Status**: ✅ Fully Operational

Comprehensive session tracking and management:
- Active session lifecycle with configurable TTL (default 1 hour)
- Tool execution history with timestamps
- Timeline events for all agent actions
- WebSocket broadcasting for real-time UI updates
- Iterative feedback support for PR comments

**Usage**: Automatically tracks all task sessions.

### 4. MCP Integration - GitHub Server
**Status**: ✅ Fully Operational

Model Context Protocol integration with 47 GitHub tools:
- Repository operations (create, fork, clone)
- File operations (read, write, update, push)
- Issue management (create, update, comment, search)
- Pull request operations (create, merge, review)
- Branch and tag management
- Workflow automation (trigger, monitor, cancel)
- Code search and navigation

**Requirements**: GitHub Personal Access Token in environment variables.

## Optional Features (Require Additional Setup)

### 5. Container Runner System
**Status**: ⚠️ Requires Docker

Ephemeral containerized execution environments for task isolation:
- Docker container orchestration
- Resource limits (CPU, memory, timeout)
- Real-time log streaming and stats collection
- Artifact management with base64 encoding
- Security isolation for untrusted code execution

**Requirements**: 
- Docker CLI available in runtime environment
- Sufficient system resources for container execution
- Not available in standard Replit web environment

**Setup**: 
1. Install Docker in your environment
2. Ensure Docker daemon is running
3. Container Runner will automatically detect Docker availability

**Fallback**: When Docker is unavailable, the system will log warnings but continue operation with other features.

### 6. MCP Integration - Playwright Server
**Status**: ⚠️ Requires Package Installation

Browser automation for E2E testing and visual validation:
- 47 Playwright tools for browser control
- Screenshot capture and visual testing
- Form interaction and element manipulation
- Network interception and mocking
- Multi-browser support (Chromium, Firefox, WebKit)

**Requirements**:
- Install `@executeautomation/playwright-mcp-server` package
- Playwright browsers installed
- Sufficient memory for browser instances

**Setup**:
```bash
npm install @executeautomation/playwright-mcp-server
npx playwright install
```

Then enable in `mcp-config.json`:
```json
{
  "name": "playwright-mcp",
  "enabled": true,
  ...
}
```

## Feature Matrix

| Feature | Status | Requirements | Environment Support |
|---------|--------|--------------|---------------------|
| Memory Manager | ✅ Operational | GitHub Token | All |
| Prompt Engineering | ✅ Operational | AI API Keys | All |
| Session Management | ✅ Operational | None | All |
| GitHub MCP Server | ✅ Operational | GitHub Token | All |
| Container Runner | ⚠️ Optional | Docker | Local/Server Only |
| Playwright MCP | ⚠️ Optional | NPM Package | All (with install) |

## Environment Variables

### Required
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - AI provider credentials
- `GITHUB_TOKEN` - GitHub Personal Access Token for MCP and repository operations

### Optional
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint (if using Azure)
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key

## Configuration

All MCP servers are configured in `mcp-config.json`. Each server has an `enabled` flag:

```json
{
  "mcpServers": [
    {
      "name": "github-mcp",
      "enabled": true,  // Enabled by default
      ...
    },
    {
      "name": "playwright-mcp",
      "enabled": false,  // Disabled until package is installed
      ...
    }
  ]
}
```

## Development vs Production

**Development Environment (Replit Web)**:
- ✅ Memory Manager
- ✅ Prompt Engineering
- ✅ Session Management
- ✅ GitHub MCP Server
- ❌ Container Runner (no Docker)
- ⚠️ Playwright MCP (requires package install)

**Production Environment (Server/Local)**:
- ✅ All features available
- Container Runner requires Docker setup
- Playwright MCP requires package installation

## Troubleshooting

### Container Runner Not Working
```
Error: spawn docker ENOENT
```
**Solution**: Docker is not available. Either install Docker or the system will continue without container isolation.

### Playwright MCP Fails to Initialize
```
Error: Cannot find module '@executeautomation/playwright-mcp-server'
```
**Solution**: Install the package with `npm install @executeautomation/playwright-mcp-server` and enable in config.

### GitHub MCP Connection Issues
```
Failed to initialize MCP server github-mcp
```
**Solution**: Ensure `GITHUB_TOKEN` environment variable is set with a valid Personal Access Token.
