import type { Message, SnapshotFileDiff } from "@opencode-ai/sdk/v2"

export type TurnFileDiff = SnapshotFileDiff & { file: string }

function fileDiff(item: SnapshotFileDiff): item is TurnFileDiff {
  return item.file !== undefined
}

export function turnDiffs(input: {
  messages: Message[] | undefined
  revertMessageID?: string
}) {
  const last = (input.messages ?? []).findLast(
    (item) => item.role === "user" && (!input.revertMessageID || item.id < input.revertMessageID),
  )
  if (last?.role !== "user") return [] as TurnFileDiff[]
  return (last.summary?.diffs ?? []).filter(fileDiff)
}
