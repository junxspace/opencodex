import type { InstanceContext } from "@/project/instance-context"

export interface CommitMessageRequest {
  path: string
  selectedFiles?: string[]
  previousMessage?: string
  prompt?: string
  model?: string
  instance?: InstanceContext
  intent?: {
    files: string[]
    description: string
  }
}

export interface CommitMessageResponse {
  message: string
}

export interface GitContext {
  branch: string
  recentCommits: string[]
  files: FileChange[]
}

export interface FileChange {
  status: "added" | "modified" | "deleted" | "renamed"
  path: string
  diff: string
}
