# AI GitHub Agent Dashboard - Design Guidelines

## Design Approach

**Selected Framework:** Design System Approach inspired by **Linear, GitHub, and VS Code**

**Rationale:** Developer productivity tool requiring clarity, information density, and functional excellence. The interface must communicate complex state, logs, and code diffs efficiently while maintaining visual hierarchy across real-time data streams.

**Design Principles:**
- Information density over decoration
- Scannable data with clear visual hierarchy
- Functional clarity for technical workflows
- Spatial consistency for cognitive efficiency

---

## Typography System

**Font Stack:**
- **Primary:** Inter (UI, headings, labels) - Clean, technical aesthetic
- **Monospace:** JetBrains Mono (code, logs, diffs) - High legibility for technical content

**Type Scale:**
- **Page Titles:** text-2xl font-semibold (Dashboard, Task Details)
- **Section Headers:** text-lg font-medium (Active Tasks, Execution Log)
- **Card Titles:** text-base font-medium (Task names, PR titles)
- **Body/Labels:** text-sm (Status labels, metadata, descriptions)
- **Code/Logs:** text-xs font-mono (Log streams, code snippets, diffs)
- **Timestamps/Meta:** text-xs opacity-70 (Relative times, commit SHAs)

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 3, 4, 6, 8, 12** exclusively
- Component padding: p-4 to p-6
- Section spacing: gap-4 to gap-6
- Card spacing: p-4 internally, gap-3 between elements
- Page margins: p-6 to p-8

**Grid Structure:**
- **Sidebar:** Fixed w-64 for navigation and context panel
- **Main Content:** flex-1 with max-w-7xl container
- **Multi-column layouts:** grid-cols-2 for task cards on large screens, single column on mobile

---

## Component Library

### Navigation & Layout

**Sidebar Navigation:**
- Fixed left sidebar (w-64) with vertical navigation stack
- Navigation items: px-3 py-2 with icons (16px) + labels
- Active state: distinct background treatment
- Sections: Dashboard, Active Tasks, History, Settings, GitHub Connection Status

**Top Bar:**
- Full-width header with breadcrumb navigation
- Right-aligned: Refresh status indicator, GitHub account info, settings icon
- Height: h-14 with border-b separator

### Core Components

**Task Cards:**
- Elevated cards with subtle border and rounded corners (rounded-lg)
- Header: Task title + status badge + timestamp in single row
- Body: AI reasoning summary (2-3 lines truncated)
- Footer: Progress indicator + action buttons (View Details, Cancel)
- Status badges: Small pills (px-2 py-1 rounded-full text-xs) showing Planning/Executing/Complete states

**Execution Log Panel:**
- Full-height scrollable container with monospace text
- Line numbers in gutter (w-12)
- Log entries: timestamp + level indicator + message
- Auto-scroll to bottom with scroll lock toggle
- Syntax highlighting for errors (red accent), warnings (amber accent), success (green accent)

**Diff Viewer:**
- Split-pane layout (50/50) for before/after or unified diff view toggle
- Line-by-line comparison with +/- indicators in gutter
- Syntax highlighting for code
- Collapsible unchanged sections
- Header showing file path breadcrumb

**AI Reasoning Chain:**
- Vertical timeline/stepper layout
- Each step: Circle indicator + timestamp + reasoning text + confidence score
- Expandable sections for detailed context
- Visual connection lines between steps

**Repository Context Panel:**
- Tree view of repository structure (collapsible folders)
- File icons indicating type (folders, JS, Python, etc.)
- Active files highlighted
- Metadata panel: Branch name, last commit, open issues count

### Data Display

**Status Indicators:**
- Running: Animated pulse effect on icon
- Success: Checkmark icon
- Failed: X icon with error badge
- Queued: Clock icon
- Badges use consistent sizing: h-6 with icon + label

**Metrics Cards:**
- Grid of 3-4 metric cards (grid-cols-4)
- Large number (text-3xl font-bold)
- Label below (text-sm)
- Icon top-right corner
- Examples: Active Tasks, Success Rate, Avg Execution Time, Webhooks Received

**Event Log Table:**
- Compact rows with alternating subtle background
- Columns: Timestamp | Event Type | Repository | Action | Status
- Sortable headers
- Expandable row detail on click
- Sticky header when scrolling

### Interactive Elements

**Action Buttons:**
- Primary: Solid background, medium weight
- Secondary: Border treatment
- Icon buttons: Square (h-8 w-8) with centered icon
- Button groups for related actions (Approve/Reject, Run/Cancel)

**Input Forms:**
- Repository selector: Searchable dropdown
- Configuration inputs: Single-column form layout with clear labels above inputs
- Spacing: gap-4 between form fields
- Help text: text-xs below inputs

---

## Page Layouts

### Dashboard (Home)
**Structure:**
1. Metrics row (grid-cols-4) - Task statistics
2. Active Tasks section - Grid of task cards (grid-cols-2 lg:grid-cols-3)
3. Recent Events - Table showing last 10 webhook events
4. Quick Actions - Button row for common operations

### Task Detail View
**Two-column split:**
- **Left (60%):** Execution log with live streaming
- **Right (40%):** 
  - Task metadata card
  - AI reasoning chain
  - Repository context panel

### Diff Review
**Full-width layout:**
- File selector tabs at top
- Diff viewer taking full viewport height
- Bottom action bar: Approve/Request Changes/Comment buttons

### Settings
**Single-column form:**
- Grouped sections with clear headings
- GitHub connection status with reconnect button
- OpenAI API configuration
- Webhook endpoint display (read-only with copy button)

---

## Key Interactions

**Live Updates:**
- Real-time log streaming with smooth auto-scroll
- Task status updates without page refresh
- Toast notifications for completed tasks (top-right, auto-dismiss)

**Progressive Disclosure:**
- Expandable sections for detailed logs
- Collapsed code blocks with line count indicator
- Drawer for repository file browser (slides from right)

---

## Accessibility

- Consistent focus states on all interactive elements
- Keyboard navigation through task cards and logs
- ARIA labels for status indicators and icons
- High contrast for code syntax and diff markers