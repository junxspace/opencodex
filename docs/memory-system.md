# OpenCodeX 记忆与上下文配置指南

内置记忆 + DCP 为推荐组合。不要与 `opencode-working-memory` 同时默认启用。

## 功能概览与实现状态

| 功能 | 类型 | 触发 | 状态 |
|------|------|------|------|
| `remember` | 内置配置 | 用户说「记住…」/ `/remember` | **已接线** |
| `memory` 工具 | 内置工具 | Agent 搜索 | **已接线**（只读） |
| `/checkpoint` | 内置命令 | 手动 subtask | **已接线** |
| `/dream` | 内置命令 | 手动 subtask | **已接线** |
| `dream.auto` | 内置配置 | loop 结束 + 间隔 | **已接线**（默认 `false`） |
| `/distill` | 内置命令 | 手动 subtask | **已接线** |
| `distill.auto` | 内置配置 | loop 结束 + 间隔 | **已接线**（默认 `false`） |
| `compaction` | 内置配置 | 上下文满窗 | **已接线** |
| `compaction.prune` | 内置配置 | loop 结束 | **已接线**（与 DCP 二选一，建议关） |
| `checkpoint` 自动 85% | 内置配置 | token ≥ 85% | **已接线** |
| `checkpoint.push_caps` | 内置配置 | 每轮 system | **已接线** |
| `checkpoint.memory_search_score_floor` | 内置配置 | memory 搜索 | **已接线** |
| `@tarquinen/opencode-dcp` | 插件 | 每轮请求前 | 插件自带 |
| `opencode-working-memory` | 插件 | compaction hook | **不推荐**与内置并用；启用时 `remember.auto` 自动忽略 |

## 命令职责（何时用哪个）

| 需求 | 用法 | 写入位置 |
|------|------|----------|
| 记一条规则/教训 | `/remember <text>` 或自然语言 + `remember.auto` | 项目 `MEMORY.md`（默认） |
| 仅本 session 笔记 | `/remember --session <text>` | `sessions/<id>/notes.md` |
| 全局笔记 | `/remember --global <text>` | `global/MEMORY.md` |
| 搜已有记忆 | Agent 调用 `memory` 工具 | 只读 |
| 整合理记忆 | `/dream`（手动） | 更新项目 `MEMORY.md` |
| 会话工作状态快照 | `/checkpoint`（subtask） | `sessions/<id>/checkpoint.md` |
| 提取重复工作流 | `/distill`（手动） | `.opencode/skills` 等 |
| 看剪枝/token | `/dcp context`（DCP 插件） | 不改历史 |

> 没有内置 `/memory` 命令。`/memory` 来自 `opencode-working-memory` 插件 UI，与内置体系存储路径不同。

---

## 推荐 `opencode.jsonc`

```jsonc
{
  "compaction": {
    "auto": true,
    "prune": false
  },
  "remember": {
    "auto": true,
    "suggest": true,
    "auto_write": false
  },
  "dream": {
    "auto": false,
    "interval_days": 7
  },
  "distill": {
    "auto": false,
    "interval_days": 30
  },
  "checkpoint": {
    "memory_reconcile_on_search": true,
    "memory_search_score_floor": 0.15,
    "push_caps": {
      "checkpoint": 11000,
      "memory": 10000,
      "notes": 6000,
      "global": 6000
    }
  },
  "plugin": ["@tarquinen/opencode-dcp"]
}
```

`~/.config/opencode/tui.json` 的 `plugin` 应与上表一致，**不要**包含 `opencode-working-memory`。

---

## 1. Compaction（对话压缩）

### 配置（真实 schema）

```json
{
  "compaction": {
    "auto": true,
    "prune": false,
    "tail_turns": 2,
    "preserve_recent_tokens": null,
    "reserved": null
  }
}
```

| 参数 | 默认 | 说明 |
|------|------|------|
| `auto` | `true` | 上下文达到可用上限时触发摘要压缩 |
| `prune` | `false` | 在 DB 中标记旧 tool output；**与 DCP 重叠，建议 `false`** |
| `tail_turns` | `2` | 压缩后保留最近 N 轮用户对话原文 |
| `preserve_recent_tokens` | 自动 | 最近轮次 token 保留预算 |
| `reserved` | 自动 | 为压缩预留的 token buffer |

**不存在**的字段（请勿配置）：`threshold`、`strategy`、`prune_tool_outputs`。

### 与 DCP 的关系

- **compaction.auto**：满窗时整段摘要，改 session 历史
- **DCP**：每轮发请求前剪枝占位，不改历史
- 推荐：**DCP 开 + `compaction.prune: false`**

---

## 2. Remember（自动记忆）

```json
{
  "remember": {
    "auto": true,
    "suggest": true,
    "auto_write": false
  }
}
```

| 参数 | 默认 | 说明 |
|------|------|------|
| `auto` | `true` | 检测「记住」「以后都…」等信号 |
| `suggest` | `true` | 注入 `system-reminder` 提示 `/remember` |
| `auto_write` | `false` | 自动追加 `sessions/<id>/notes.md` |

---

## 3. Checkpoint

手动：`/checkpoint`（subtask，写入 11 节 `checkpoint.md`）。

`checkpoint.*` 配置项中，仅 `memory_reconcile_on_search` 在部分路径可读；`push_caps` 与自动 85% 触发尚未接入运行时。

---

## 4. Dream / Distill

手动：`/dream`、`/distill`。

`dream.auto` / `distill.auto` 默认为 **`false`**。设为 `true` 时目前仅记录日志，不启动 agent（待 R14 实现）。

---

## 5. 插件

### `@tarquinen/opencode-dcp`（推荐）

动态上下文剪枝，与内置 compaction 互补。见 `/dcp` 命令。

### `opencode-working-memory`（不推荐与内置并用）

独立存储路径、compaction 提取、TUI `/memory`。与内置 `remember` 冲突。

启用时 OpenCodeX 会 **warn** 并自动忽略 `remember.auto`，避免双轨记忆捕获。同时启用 DCP 与 `compaction.prune: true` 时也会 **warn**。

---

## 记忆文件路径

```
~/Library/Application Support/opencode/memory/
├── global/MEMORY.md
├── projects/<12位projectID>/MEMORY.md
└── sessions/<sessionID>/
    ├── checkpoint.md
    └── notes.md
```

`projectID` = worktree 路径 SHA256 前 12 位。
