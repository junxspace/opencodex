import type { CliStyle } from "../theme"
import { isLockFile } from "@/commit-message/git-context"

export type Status = {
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

const SEP_WIDTH = 44

function separator(style: CliStyle) {
  return `${style.TEXT_DIM}${"─".repeat(SEP_WIDTH)}${style.TEXT_NORMAL}`
}

function fileLine(style: CliStyle, file: string) {
  if (isLockFile(file)) {
    return `${style.TEXT_DIM}  🔒 ${file}${style.TEXT_NORMAL}`
  }
  return `${style.TEXT_NORMAL}  · ${file}`
}

function formatFileList(style: CliStyle, files: string[]) {
  if (files.length === 0) {
    return `${style.TEXT_DIM}  · none${style.TEXT_NORMAL}`
  }
  const limit = 15
  const lines = files.slice(0, limit).map((file) => fileLine(style, file))
  if (files.length > limit) {
    lines.push(`${style.TEXT_DIM}  · … and ${files.length - limit} more${style.TEXT_NORMAL}`)
  }
  return lines.join("\n")
}

export function commitUi(style: CliStyle) {
  const styled = (text: string) => text + style.TEXT_NORMAL

  return {
    styled,
    separator: () => separator(style),
    statusOverview(status: Status) {
      const total = new Set([...status.staged, ...status.unstaged, ...status.untracked]).size
      const sections = [
        { icon: "📦", label: "Staged", files: status.staged, tone: style.TEXT_INFO_BOLD },
        { icon: "📝", label: "Unstaged", files: status.unstaged, tone: style.TEXT_WARNING_BOLD },
        { icon: "✨", label: "Untracked", files: status.untracked, tone: style.TEXT_HIGHLIGHT_BOLD },
      ]

      const lines = [
        "",
        styled(`${style.TEXT_HIGHLIGHT_BOLD}⚡ fast-commit${style.TEXT_NORMAL}`),
        styled(`${style.TEXT_DIM}  ${total} file${total === 1 ? "" : "s"} in working tree${style.TEXT_NORMAL}`),
        separator(style),
        "",
      ]

      for (const [index, section] of sections.entries()) {
        const count = section.files.length
        lines.push(
          styled(`${section.tone}${section.icon} ${section.label}${style.TEXT_NORMAL}`) +
            styled(`${style.TEXT_DIM} (${count})${style.TEXT_NORMAL}`),
        )
        lines.push(formatFileList(style, section.files))
        if (index < sections.length - 1) lines.push("")
      }

      lines.push("", separator(style))
      return lines.join("\n")
    },
    intentPlan(total: number) {
      if (total <= 1) return ""
      return [
        "",
        styled(`${style.TEXT_INFO_BOLD}🧩 ${total} commit intents${style.TEXT_NORMAL}`),
        styled(`${style.TEXT_DIM}  splitting changes into separate commits${style.TEXT_NORMAL}`),
        "",
      ].join("\n")
    },
    intentHeader(index: number, total: number, message: string, files: string[]) {
      const subject = message.trim().split("\n")[0] ?? message
      const bar = `${style.TEXT_DIM}── ${style.TEXT_INFO_BOLD}Commit ${index}/${total}${style.TEXT_DIM} ${"─".repeat(18)}${style.TEXT_NORMAL}`
      return [
        "",
        bar,
        styled(`${style.TEXT_SUCCESS_BOLD}💬 ${subject}${style.TEXT_NORMAL}`),
        styled(`${style.TEXT_DIM}  📁 ${files.length} file${files.length === 1 ? "" : "s"}${style.TEXT_NORMAL}`),
      ].join("\n")
    },
    commitMessageBlock(message: string) {
      const [subject = "", ...body] = message.trim().split("\n")
      return [
        styled(`${style.TEXT_DIM_BOLD}💬 Generated commit message${style.TEXT_NORMAL}`),
        styled(`${style.TEXT_SUCCESS_BOLD}  ${subject}${style.TEXT_NORMAL}`),
        ...body
          .filter((line) => line.trim())
          .map((line) => styled(`${style.TEXT_DIM}  ${line}${style.TEXT_NORMAL}`)),
      ].join("\n")
    },
    gitCommitOutput(text: string) {
      return text
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const commit = line.match(/^\[([^\]]+)\]\s*(.*)$/)
          if (commit) {
            return (
              styled(`${style.TEXT_DIM}  [${commit[1]}]${style.TEXT_NORMAL} `) +
              styled(`${style.TEXT_SUCCESS_BOLD}${commit[2]}${style.TEXT_NORMAL}`)
            )
          }
          if (/^\s*\d+ files? changed/.test(line) || line.includes("insertion") || line.includes("deletion")) {
            return styled(`${style.TEXT_DIM}  📊 ${line.trim()}${style.TEXT_NORMAL}`)
          }
          if (line.startsWith(" rename ") || line.startsWith(" create mode") || line.startsWith(" delete mode")) {
            return styled(`${style.TEXT_DIM}  ${line}${style.TEXT_NORMAL}`)
          }
          return styled(`${style.TEXT_DIM}  ${line}${style.TEXT_NORMAL}`)
        })
        .join("\n")
    },
    gitOutput(text: string) {
      return text
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => styled(`${style.TEXT_DIM}  ${line}${style.TEXT_NORMAL}`))
        .join("\n")
    },
    committed(index: number, total: number) {
      if (total <= 1) return styled(`${style.TEXT_SUCCESS_BOLD}  ✓ Committed${style.TEXT_NORMAL}`)
      return styled(`${style.TEXT_SUCCESS_BOLD}  ✓ Committed ${index}/${total}${style.TEXT_NORMAL}`)
    },
    summary(count: number, pushed: boolean) {
      const lines = [
        "",
        separator(style),
        styled(`${style.TEXT_SUCCESS_BOLD}✓ Created ${count} commit${count === 1 ? "" : "s"}${style.TEXT_NORMAL}`),
      ]
      if (pushed) lines.push(styled(`${style.TEXT_SUCCESS_BOLD}  🚀 Pushed to remote${style.TEXT_NORMAL}`))
      lines.push(separator(style))
      return lines.join("\n")
    },
    success(text: string) {
      return styled(`${style.TEXT_SUCCESS_BOLD}${text}${style.TEXT_NORMAL}`)
    },
    info(text: string) {
      return styled(`${style.TEXT_INFO}ℹ ${text}${style.TEXT_NORMAL}`)
    },
    warn(text: string) {
      return styled(`${style.TEXT_WARNING}⚠ ${text}${style.TEXT_NORMAL}`)
    },
  }
}

export type FastCommitUi = ReturnType<typeof commitUi>
