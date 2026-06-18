export const SECTIONS = [
  { id: "active-intent", title: "Active intent", description: "User's latest request (verbatim quote)" },
  { id: "next-action", title: "Next concrete action", description: "Next steps to take" },
  { id: "directives", title: "Directives (this session)", description: "Session-level working style and preferences" },
  { id: "task-tree", title: "Task tree", description: "Task structure and progress" },
  { id: "current-work", title: "Current work", description: "Current work in progress" },
  { id: "files", title: "Files and code sections", description: "Active files list" },
  { id: "knowledge", title: "Discovered knowledge", description: "Knowledge discovered across tasks" },
  { id: "errors", title: "Errors and fixes", description: "Errors encountered and their fixes" },
  { id: "resources", title: "Live resources", description: "Runtime state (servers, databases, etc.)" },
  { id: "decisions", title: "Design decisions", description: "Design decisions made" },
  { id: "notes", title: "Open notes", description: "Uncategorized temporary notes" },
] as const

export type SectionId = (typeof SECTIONS)[number]["id"]

export const TEMPLATE = `# Session Checkpoint

## §1 Active intent
> User's original request: "[quote user request]"

## §2 Next concrete action
- [ ] [action 1]
- [ ] [action 2]

## §3 Directives (this session)
- [working style preference 1]
- [working style preference 2]

## §4 Task tree
\`\`\`
[task name]
├── [subtask 1] (status)
├── [subtask 2] (status)
└── [subtask 3] (status)
\`\`\`

## §5 Current work
[description of current work in progress]

## §6 Files and code sections
- \`path/to/file1.ts\` - [brief description]
- \`path/to/file2.ts\` - [brief description]

## §7 Discovered knowledge
- [knowledge 1]
- [knowledge 2]

## §8 Errors and fixes
- **E1**: [error description]
  - Fix: [how it was fixed]

## §9 Live resources
- [resource 1]: [status]
- [resource 2]: [status]

## §10 Design decisions
- [decision 1]: [rationale]

## §11 Open notes
- [note 1]
- [note 2]
`

export const MEMORY_TEMPLATE = `# Project Memory

## Project context
[Project identity and goals]

## Rules
User-specified hard constraints:
- **R1**: [rule 1]
- **R2**: [rule 2]

## Architecture decisions
- **A1** (YYYY-MM-DD): [decision]
  - Rationale: [why this decision was made]
  - Alternatives considered: [other options]

## Discovered durable knowledge
- [knowledge that persists across sessions]

## Patterns
- **P1**: [pattern description]

## Gotchas
- **G1**: [gotcha description]
`

export const MAX_LINES = 200
export const MAX_SIZE = 10240 // 10KB
