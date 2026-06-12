import { isLockFile } from "./git-context"

export function partitionLockFiles(files: string[]) {
  const locks: string[] = []
  const nonLocks: string[] = []
  for (const file of files) {
    if (isLockFile(file)) locks.push(file)
    else nonLocks.push(file)
  }
  return { locks, nonLocks }
}

export function briefLockMessage(files: string[], template?: string) {
  if (files.length === 1) {
    const name = files[0]!.split("/").pop() ?? files[0]!
    if (template) return template.replaceAll("{file}", name)
    return `chore(deps): 更新 ${name}`
  }
  if (template) return template.replaceAll("{file}", "依赖锁文件")
  return "chore(deps): 更新依赖锁文件"
}

export function attachLockFiles<T extends { files: string[] }>(intents: T[], locks: string[]) {
  if (locks.length === 0) return intents
  const next = intents.map((intent) => ({ ...intent, files: [...intent.files] }))
  for (const lock of locks) {
    if (next.some((intent) => intent.files.includes(lock))) continue
    const dir = lock.includes("/") ? lock.slice(0, lock.lastIndexOf("/")) : ""
    const match = next.find((intent) =>
      intent.files.some((file) => {
        if (isLockFile(file)) return false
        if (!dir) return !file.includes("/")
        return file === dir || file.startsWith(`${dir}/`)
      }),
    )
    if (match) {
      match.files.push(lock)
      continue
    }
    if (next.length > 0) {
      next[next.length - 1]!.files.push(lock)
      continue
    }
    next.push({ files: [lock] } as T)
  }
  return next
}
