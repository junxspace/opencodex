# MiMo-Code 记忆系统与 Dream 功能分析报告

> 对比分析 MiMo-Code 和 OpenCode 的记忆系统，评估在 OpenCode 中实现的可行性

## 实现状态

**已实现**: 基础记忆系统、Checkpoint 系统、Dream Agent 基础结构

### 创建的文件

| 包 | 文件路径 | 功能 |
|---|---------|------|
| core | `src/memory/sql.ts` | FTS5 表定义 |
| core | `src/memory/paths.ts` | 路径解析 |
| core | `src/memory/service.ts` | Memory Service |
| core | `src/memory/index.ts` | 模块入口 |
| core | `src/database/migration/20260617000000_memory_fts.ts` | 数据库迁移 |
| core | `src/tool/memory.ts` | memory 工具 |
| core | `src/checkpoint/templates.ts` | Checkpoint 模板 |
| core | `src/checkpoint/paths.ts` | Checkpoint 路径 |
| core | `src/checkpoint/service.ts` | Checkpoint Service |
| core | `src/checkpoint/index.ts` | 模块入口 |
| opencode | `src/agent/prompt/dream.txt` | Dream Agent 提示词 |
| opencode | `src/agent/agent.ts` | 添加 dream agent 配置 |

### 待实现

- 自动触发逻辑 (auto-dream.ts)
- Distill Agent
- 配置项集成

## 目录

1. [MiMo-Code 记忆系统](#mimo-code-记忆系统)
2. [MiMo-Code Dream 功能](#mimo-code-dream-功能)
3. [MiMo-Code Checkpoint 系统](#mimo-code-checkpoint-系统)
4. [OpenCode 现有能力](#opencode-现有能力)
5. [功能对比](#功能对比)
6. [使用场景与示例](#使用场景与示例)
7. [实现可行性评估](#实现可行性评估)
8. [实现路径建议](#实现路径建议)

---

## MiMo-Code 记忆系统

### 核心架构

MiMo-Code 的记忆系统采用**文件 + 索引**双层架构：

```
┌─────────────────────────────────────────────────────────────┐
│                      记忆文件层                              │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ MEMORY.md   │    │ checkpoint.md │    │ notes.md      │  │
│  │ (项目记忆)   │    │ (会话检查点)   │    │ (自由笔记)    │  │
│  └─────────────┘    └──────────────┘    └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   SQLite FTS5 索引层                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ memory_fts 表 (BM25 全文索引)                        │   │
│  │ - path, scope, scope_id, type, body, fingerprint    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 核心文件

| 文件路径 | 功能说明 |
|---------|---------|
| `src/memory/index.ts` | 记忆模块入口，导出 Service 和类型 |
| `src/memory/service.ts` | 核心服务：搜索、索引、同步 |
| `src/memory/fts.sql.ts` | FTS5 数据库表定义 |
| `src/memory/fts-query.ts` | FTS5 查询构建器 |
| `src/memory/paths.ts` | 记忆文件路径解析 |
| `src/memory/reconcile.ts` | 磁盘 ↔ 数据库同步 |
| `src/tool/memory.ts` | 记忆搜索工具 |

### 数据模型

#### FTS5 表结构

```typescript
// packages/opencode/src/memory/fts.sql.ts
const MemoryFtsTable = sqliteTable("memory_fts", {
  id: integer().primaryKey({ autoIncrement: true }),
  path: text().notNull().unique(),           // 文件绝对路径
  scope: text().notNull(),                   // 作用域: global | projects | sessions | cc
  scope_id: text().notNull().default(""),    // 作用域ID (项目ID/会话ID)
  type: text().notNull(),                    // 类型: memory | checkpoint | progress | notes
  body: text().notNull(),                    // 文件全文内容
  fingerprint: text().notNull(),             // 文件指纹 (size-mtimeMs)
  last_indexed_at: integer().notNull(),      // 最后索引时间
})
```

#### 记忆类型 (MemoryType)

```typescript
type MemoryType =
  | "free"       // 自由形式
  | "memory"     // 项目记忆 MEMORY.md
  | "checkpoint" // 会话检查点 checkpoint.md
  | "progress"   // 任务进展 tasks/<id>/progress.md
  | "notes"      // 会话笔记 notes.md
  | "feedback"   // CC 反馈 (Claude Code 导入)
  | "project"    // CC 项目记忆
  | "reference"  // CC 引用
  | "user"       // CC 用户偏好
```

#### 作用域 (Scope)

```typescript
type Scope = "global" | "projects" | "sessions" | "cc"
```

### 记忆文件布局

```
<DATA>/memory/
├── global/
│   └── MEMORY.md                    # 全局用户偏好 (跨项目)
│
├── projects/
│   └── <projectID>/                 # projectID = SHA256(repoPath)[:12]
│       ├── MEMORY.md                # 项目记忆 (持久化知识)
│       └── MEMORY-<topic>.md        # 主题溢出文件
│
└── sessions/
    └── <sessionID>/
        ├── checkpoint.md            # 会话检查点 (单文件)
        ├── checkpoint-<topic>.md    # 检查点溢出
        ├── notes.md                 # 主代理自由笔记
        └── tasks/
            └── <taskID>/
                └── progress.md      # 子代理任务进展
```

### 搜索机制

#### BM25 全文搜索

```typescript
// packages/opencode/src/memory/service.ts
const sql = `
  SELECT memory_fts.path, memory_fts.scope, memory_fts.scope_id, memory_fts.type,
         snippet(memory_fts_idx, 0, '<<', '>>', '...', 32) AS snippet,
         bm25(memory_fts_idx) AS score
  FROM memory_fts_idx
  JOIN memory_fts ON memory_fts.id = memory_fts_idx.rowid
  WHERE memory_fts_idx MATCH ?
  ${whereClause}
  ORDER BY score
  LIMIT ?
`
```

#### 搜索参数

```typescript
interface SearchArgs {
  query: string        // BM25 查询字符串
  scope?: Scope        // 过滤作用域
  scope_id?: string    // 过滤作用域ID
  type?: MemoryType    // 过滤类型
  limit?: number       // 结果数量限制 (默认 10)
}
```

#### 搜索特点

1. **OR 连接词项**: 保证召回率，即使查询包含多个词
2. **BM25 排序**: 稀有词权重更高，相关性更好的结果排在前面
3. **分数底线过滤**: `score_floor_ratio = 0.15`，过滤噪声结果
4. **作用域过滤**: 支持按 scope/scope_id/type 精确过滤
5. **片段高亮**: 返回匹配片段，关键词用 `<<>>` 标记

### 索引同步机制

```typescript
// packages/opencode/src/memory/reconcile.ts
export async function reconcileMemory(roots: { mimo: string; cc?: string }) {
  // 1. 遍历磁盘文件
  const mimoFiles = await walkMemoryDir(roots.mimo)
  const ccFiles = roots.cc ? await walkCcRoot(roots.cc) : []
  
  // 2. 删除数据库中已消失的文件索引
  for (const p of indexed.keys()) {
    if (!diskPaths.has(p)) {
      db.delete(MemoryFtsTable).where(eq(MemoryFtsTable.path, p))
    }
  }
  
  // 3. 索引新文件和变更文件
  for (const p of mimoFiles) {
    await indexFromDisk(p, loc, "mimo", indexed.get(p))
  }
}
```

**同步时机**：
- 每次搜索前自动同步（可配置 `memory_reconcile_on_search`）
- 手动调用 `memory reconcile` 命令

---

## MiMo-Code Dream 功能

### 核心概念

**Dream** 是一个自动运行的后台代理，定期从会话轨迹中提取持久知识，整合到项目记忆中。

```
┌─────────────────────────────────────────────────────────────┐
│                    Dream 工作流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  阶段 0: 定位数据                                            │
│  ├── 使用 memory 工具搜索关键词                               │
│  ├── 检查记忆文件路径                                        │
│  └── 定位 SQLite 数据库                                      │
│                                                              │
│  阶段 1: 定向                                                │
│  ├── 读取当前项目 MEMORY.md                                  │
│  ├── 读取会话 notes.md                                       │
│  ├── Glob 最近 checkpoint.md 文件                            │
│  └── SQLite 查询最近会话                                     │
│                                                              │
│  阶段 2: 从记忆文件收集                                       │
│  ├── checkpoint.md: 发现的知识、错误/修复、设计决策           │
│  ├── tasks/*/progress.md: 任务历史                           │
│  └── notes.md: 未整合的笔记                                  │
│                                                              │
│  阶段 3: 对照原始轨迹验证                                     │
│  ├── session 表: 会话元数据                                  │
│  ├── message 表: 用户/助手轮次                               │
│  ├── part 表: 工具调用和结果                                 │
│  └── 搜索关键词: "always", "never", "rule", "decision"       │
│                                                              │
│  阶段 4: 整合                                                │
│  └── 编辑 MEMORY.md 使用标准章节                             │
│                                                              │
│  阶段 5: 清理和验证                                          │
│  ├── 保持 MEMORY.md < 200 行 / 10KB                          │
│  ├── 移除过时条目                                            │
│  └── 清理已整合的 notes.md                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 核心文件

| 文件路径 | 功能说明 |
|---------|---------|
| `src/session/auto-dream.ts` | 自动触发逻辑 |
| `src/agent/prompt/dream.txt` | Dream 代理提示词 |
| `src/agent/agent.ts` | Dream 代理配置定义 |
| `src/command/index.ts` | `/dream` 命令入口 |

### 配置结构

```typescript
// packages/opencode/src/config/config.ts
dream: Schema.optional(
  Schema.Struct({
    auto: Schema.optional(Schema.Boolean),        // 自动触发，默认 true
    interval_days: Schema.optional(NonNegativeInt), // 最小间隔天数，默认 7
  }),
)
```

### 自动触发逻辑

```typescript
// packages/opencode/src/session/auto-dream.ts
export function shouldAutoDream(cfg: Config.Info) {
  const enabled = cfg.dream?.auto !== false
  const intervalDays = cfg.dream?.interval_days ?? DEFAULT_DREAM_INTERVAL_DAYS // 7天
  return shouldAutoRun({ 
    enabled, 
    intervalDays, 
    title: AUTO_DREAM_TITLE, 
    label: "dream" 
  })
}
```

**触发条件**：
1. `enabled = true`（默认启用）
2. 距上次 Dream 运行 >= `interval_days` 天（默认 7 天）
3. 项目存在时间 >= `interval_days`（首次运行时检查）
4. 防抖: `MIN_SPAWN_GAP_MS = 10秒`

### 代理定义

```typescript
// packages/opencode/src/agent/agent.ts
dream: {
  name: "dream",
  mode: "subagent",
  hidden: true,
  prompt: PROMPT_DREAM,
  permission: Permission.merge(defaults, Permission.fromConfig({
    "*": "deny",
    read: "allow",
    write: "allow",
    edit: "allow",
    glob: "allow",
    grep: "allow",
    memory: "allow",
    bash: "allow",
  })),
  toolAllowlist: ["read", "write", "edit", "glob", "grep", "memory", "bash"],
}
```

### MEMORY.md 标准章节

Dream 整合时使用以下章节结构：

```markdown
# Project Memory

## Project context
项目身份和目标描述

## Rules
用户明确指定的硬性约束

- **R1**: 总是使用 TypeScript 严格模式
- **R2**: 禁止使用 any 类型
- **R3**: 提交前必须运行测试

## Architecture decisions
设计决策 + 理由

- **A1** (2024-01-15): 选择 SQLite 作为本地数据库
  - 理由: 零配置、嵌入式、支持全文搜索
  - 替代方案: 考虑过 LevelDB，但不支持复杂查询

## Discovered durable knowledge
跨会话持久事实

- 项目使用 Bun 作为运行时
- 测试框架是 Vitest
- 构建工具是 tsup

## Patterns
重复问题和解决方案

- **P1**: 类型错误时检查 import 路径
- **P2**: 测试失败时先检查 mock 是否正确

## Gotchas
易错陷阱

- **G1**: Bun.file() 是异步的，需要 await
- **G2**: SQLite 事务需要手动 BEGIN/COMMIT
```

### Distill 功能（与 Dream 配套）

| 功能 | Dream | Distill |
|------|-------|---------|
| 目的 | 记忆整合 | 工作流打包 |
| 间隔 | 7天 | 30天 |
| 输出 | 更新 MEMORY.md | 创建 skills/agents/commands |
| 依据 | 会话轨迹 + 记忆文件 | 重复工作流模式 |

---

## MiMo-Code Checkpoint 系统

### 核心概念

**Checkpoint** 是会话状态的完整快照，用于：
1. 长会话的状态保持
2. 上下文压缩时的信息保留
3. 会话恢复和继续

### 核心文件

| 文件路径 | 功能说明 |
|---------|---------|
| `src/session/checkpoint.ts` | Checkpoint 服务主实现 |
| `src/session/checkpoint-paths.ts` | 路径解析 |
| `src/session/checkpoint-templates.ts` | 模板定义 |
| `src/agent/prompt/checkpoint-writer.txt` | Writer 代理提示词 |

### Checkpoint 结构 (11 章节)

```markdown
# Session Checkpoint

## §1 Active intent
用户最新请求的原文引用

> 用户原话: "实现一个用户认证系统，支持邮箱登录和 OAuth"

## §2 Next concrete action
下一步要执行的具体操作

- [ ] 创建 auth 模块
- [ ] 实现 JWT 生成逻辑
- [ ] 添加 OAuth 集成

## §3 Directives (this session)
本次会话的工作风格和偏好

- 使用 TDD 方式开发
- 每个函数都要有类型注释
- 错误处理使用 Result 模式

## §4 Task tree
任务树结构

```
认证系统
├── 邮箱登录
│   ├── 注册 (完成)
│   ├── 登录 (进行中)
│   └── 密码重置 (待开始)
└── OAuth
    ├── Google (待开始)
    └── GitHub (待开始)
```

## §5 Current work
当前正在处理的具体内容

正在实现登录功能，已完成:
- 密码哈希验证
- JWT 生成
- 待处理: 刷新 token 逻辑

## §6 Files and code sections
活跃文件列表

- `src/auth/index.ts` - 认证模块入口
- `src/auth/jwt.ts` - JWT 工具函数
- `src/auth/oauth.ts` - OAuth 集成 (未创建)

## §7 Discovered knowledge
跨任务发现的知识

- Bun 支持内置 JWT: `Bun.JWT`
- 用户表已有 email_verified 字段

## §8 Errors and fixes
错误和修复记录

- **E1**: JWT 过期时间格式错误
  - 修复: 使用 `Math.floor(Date.now() / 1000)` 而非 `Date.now()`
- **E2**: OAuth 回调 URL 配置错误
  - 修复: 添加 `/api/auth/callback/` 前缀

## §9 Live resources
运行时状态

- 开发服务器: http://localhost:3000
- 数据库: SQLite at `.data/dev.db`
- Redis: 未启动

## §10 Design decisions
设计决策

- 选择 stateless JWT 而非 session
- 密码使用 argon2id 而非 bcrypt

## §11 Open notes
未分类的临时笔记

- 考虑添加 2FA 支持
- 需要处理并发登录限制
```

### 触发条件

Checkpoint 在以下情况触发：
1. **Token 边界越界**: 上下文接近模型限制时
2. **手动触发**: 用户执行 `/checkpoint` 命令
3. **会话压缩前**: 作为压缩前的状态备份

### 配置项

```typescript
checkpoint: {
  memory_reconcile_on_search: true,   // 搜索前自动同步
  memory_search_score_floor: 0.15,    // 搜索分数底线
  push_caps: {
    checkpoint: 11000,                // checkpoint.md token 上限
    memory: 10000,                    // MEMORY.md token 上限
    notes: 6000,                      // notes.md token 上限
    global: 6000,                     // global/MEMORY.md token 上限
  },
  fork: false,                        // Writer fork 模式
}
```

---

## OpenCode 现有能力

### System Context 系统

OpenCode 有一个结构化的上下文管理框架：

```
┌─────────────────────────────────────────────────────────────┐
│                    System Context 架构                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Context Source                        │  │
│  │  - key: 稳定的命名空间标识                              │  │
│  │  - codec: JSON 编解码器                                │  │
│  │  - load: 加载器 (Effect)                               │  │
│  │  - baseline: 基线渲染器                                │  │
│  │  - update: 更新渲染器                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Context Snapshot                      │  │
│  │  - 持久化的上下文快照 (JSON)                            │  │
│  │  - 支持 stale-while-revalidate                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Context Epoch                         │  │
│  │  - 基线系统上下文                                       │  │
│  │  - 快照 + 乐观锁                                       │  │
│  │  - 压缩/切换时创建新纪元                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**核心文件**：
- `packages/core/src/system-context/index.ts`
- `packages/core/src/system-context/registry.ts`
- `packages/core/src/system-context/builtins.ts`

**Source 定义**：

```typescript
interface Source<A> {
  key: Key                              // 稳定的命名空间标识
  codec: Schema.Codec<A>                // JSON编解码器
  load: Effect.Effect<A | Unavailable>  // 加载器
  baseline: (current: A) => string      // 基线渲染器
  update: (previous: A, current: A) => string  // 更新渲染器
  removed?: (previous: A) => string     // 移除渲染器
}
```

### Context Epoch 机制

```typescript
// SessionContextEpochTable
{
  session_id: SessionSchema.ID      // 主键
  baseline: text                    // 基线文本
  agent: AgentV2.ID                 // Agent ID
  snapshot: SystemContext.Snapshot  // 上下文快照 (JSON)
  baseline_seq: integer             // 基线序列号
  replacement_seq: integer          // 替换序列号
  revision: integer                 // 修订版本号
}
```

### Session History 系统

```typescript
// SessionMessageTable
{
  id: SessionMessage.ID
  session_id: SessionSchema.ID
  type: SessionMessage.Type        // user/assistant/system/compaction等
  seq: integer                     // 序列号
  data: SessionMessageData         // 消息内容 (JSON)
  time_created: integer
  time_updated: integer
}
```

### Compaction 机制

OpenCode 有智能压缩机制，生成结构化摘要：

```typescript
interface CompactionSummary {
  goal: string                    // 目标
  constraints_and_preferences: string[]  // 约束和偏好
  progress: string                // 进度
  key_decisions: string[]         // 关键决策
  next_steps: string[]            // 下一步
  critical_context: string        // 关键上下文
  relevant_files: string[]        // 相关文件
}
```

### 记忆文件实现

OpenCode 通过 Agent Prompt 定义了一个简单的记忆机制：

```
记忆存储在 `.github/instructions/memory.instruction.md` 文件中

必须包含 YAML front matter：
---
applyTo: '**'
---
```

---

## 功能对比

### 核心功能对比表

| 功能 | MiMo-Code | OpenCode | 说明 |
|------|-----------|----------|------|
| **记忆存储** | ✅ 多层级文件系统 | ⚠️ 简单指令文件 | MiMo-Code 有完整的三层作用域 |
| **全文搜索** | ✅ BM25 FTS5 | ❌ 无 | MiMo-Code 支持高效搜索 |
| **记忆类型** | ✅ 结构化类型 | ❌ 无 | MiMo-Code 有 9 种类型 |
| **Dream 整合** | ✅ 自动整合 | ❌ 无 | MiMo-Code 定期提取知识 |
| **Checkpoint** | ✅ 11章节结构 | ❌ 无 | MiMo-Code 有完整快照 |
| **会话压缩** | ✅ | ✅ | 两者都有 |
| **Context Epoch** | ❌ 无 | ✅ | OpenCode 有快照机制 |
| **System Context** | ⚠️ 部分 | ✅ 完整框架 | OpenCode 有抽象框架 |
| **Claude Code 兼容** | ✅ 导入 CC 记忆 | ❌ 无 | MiMo-Code 可导入 CC 数据 |

### 架构对比

```
MiMo-Code 架构:
┌─────────────────────────────────────────────────────────────┐
│  文件层 (MEMORY.md, checkpoint.md, notes.md)                │
│                         ↓                                   │
│  索引层 (SQLite FTS5, memory_fts 表)                        │
│                         ↓                                   │
│  工具层 (memory search, memory reconcile)                   │
│                         ↓                                   │
│  Agent 层 (Dream, Checkpoint Writer)                       │
└─────────────────────────────────────────────────────────────┘

OpenCode 架构:
┌─────────────────────────────────────────────────────────────┐
│  Context Source 层 (多种上下文源)                           │
│                         ↓                                   │
│  Snapshot 层 (Context Epoch, JSON 快照)                     │
│                         ↓                                   │
│  Session History 层 (消息持久化)                            │
│                         ↓                                   │
│  Compaction 层 (智能压缩)                                   │
└─────────────────────────────────────────────────────────────┘
```

### 数据模型对比

**MiMo-Code memory_fts 表**:
```sql
CREATE TABLE memory_fts (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,      -- 文件路径
  scope TEXT NOT NULL,            -- 作用域
  scope_id TEXT NOT NULL,         -- 作用域ID
  type TEXT NOT NULL,             -- 类型
  body TEXT NOT NULL,             -- 全文内容
  fingerprint TEXT NOT NULL,      -- 指纹
  last_indexed_at INTEGER NOT NULL
);
```

**OpenCode session_context_epoch 表**:
```sql
CREATE TABLE session_context_epoch (
  session_id TEXT PRIMARY KEY,
  baseline TEXT NOT NULL,         -- 基线文本
  agent TEXT NOT NULL,            -- Agent ID
  snapshot JSON NOT NULL,         -- 快照
  baseline_seq INTEGER NOT NULL,
  replacement_seq INTEGER NOT NULL,
  revision INTEGER NOT NULL
);
```

---

## 使用场景与示例

### 场景 1: 跨会话知识保持

**问题**: 用户在多个会话中反复告诉 AI 相同的项目规则

**MiMo-Code 解决方案**:

```bash
# 第一次会话
用户: 这个项目使用 TypeScript 严格模式，禁止使用 any

# Dream 自动运行后，MEMORY.md 更新:
## Rules
- **R1**: 使用 TypeScript 严格模式
- **R2**: 禁止使用 any 类型

# 第二次会话（一周后）
AI 自动从 MEMORY.md 读取规则，无需用户重复说明
```

**OpenCode 现状**:
- 用户需要手动创建 `.github/instructions/memory.instruction.md`
- 无自动整合机制
- 无搜索功能

### 场景 2: 长会话状态恢复

**问题**: 一个长会话被中断，需要恢复工作状态

**MiMo-Code 解决方案**:

```bash
# Checkpoint 自动保存了会话状态
# 用户可以查看最近的状态:

$ cat ~/.local/share/mimocode/memory/sessions/<sessionID>/checkpoint.md

## §1 Active intent
> 用户原话: "实现用户认证系统"

## §2 Next concrete action
- [ ] 实现 OAuth 集成
- [ ] 添加测试用例

## §5 Current work
正在实现 JWT 刷新逻辑...

## §8 Errors and fixes
- **E1**: JWT 过期时间格式错误
  - 修复: 使用 Math.floor(Date.now() / 1000)
```

**OpenCode 现状**:
- 依赖会话历史记录
- 有 Compaction 摘要，但无结构化检查点
- 无明确的"下一步行动"记录

### 场景 3: 错误修复知识沉淀

**问题**: 同样的错误在多个会话中重复出现

**MiMo-Code 解决方案**:

```bash
# 会话 A 中遇到错误
用户: JWT 验证总是失败
AI: 发现是因为使用了 Date.now() 而非 Math.floor(Date.now() / 1000)

# Dream 运行后，MEMORY.md 更新:
## Gotchas
- **G1**: JWT 时间戳需要秒级，使用 Math.floor(Date.now() / 1000)

# 会话 B 中（另一天）
AI 搜索记忆，发现 Gotcha G1，避免重复错误
```

### 场景 4: 设计决策追溯

**问题**: 团队成员想了解某个技术选型的原因

**MiMo-Code 解决方案**:

```bash
# 搜索设计决策
用户: 为什么选择 SQLite 而不是 LevelDB？

# AI 使用 memory 工具搜索:
$ memory search "SQLite LevelDB decision" --type memory

## 结果:
### Architecture decisions
- **A1** (2024-01-15): 选择 SQLite 作为本地数据库
  - 理由: 零配置、嵌入式、支持全文搜索
  - 替代方案: 考虑过 LevelDB，但不支持复杂查询
```

### 场景 5: 多项目知识隔离

**问题**: 用户同时维护多个项目，需要不同项目的独立记忆

**MiMo-Code 解决方案**:

```bash
# 项目 A (projectID: abc123)
$ cat ~/.local/share/mimocode/memory/projects/abc123/MEMORY.md
## Rules
- **R1**: 使用 React 18
- **R2**: 使用 Tailwind CSS

# 项目 B (projectID: def456)
$ cat ~/.local/share/mimocode/memory/projects/def456/MEMORY.md
## Rules
- **R1**: 使用 Vue 3
- **R2**: 使用 UnoCSS

# AI 自动根据当前项目加载正确的记忆
```

### 场景 6: 全局偏好同步

**问题**: 用户希望某些偏好适用于所有项目

**MiMo-Code 解决方案**:

```bash
# 全局记忆
$ cat ~/.local/share/mimocode/memory/global/MEMORY.md
## Preferences
- 总是使用中文回复
- 代码注释使用英文
- 提交信息使用 Conventional Commits 格式

# 这些偏好会自动应用到所有项目
```

---

## 实现可行性评估

### 完全可行

基于以下理由，在 OpenCode 中实现 MiMo-Code 的记忆系统**完全可行**：

### 架构兼容性

1. **System Context 框架已就绪**
   - OpenCode 已有 `Context Source` 抽象
   - 可直接扩展为 Memory Source
   - 现有的 `baseline`/`update` 渲染机制可用

2. **数据层已就绪**
   - SQLite 数据库已存在
   - 添加 `memory_fts` 表是增量操作
   - 现有 Schema 迁移机制可复用

3. **Agent 框架支持**
   - OpenCode 已有完整的 subagent 模式
   - Dream Agent 可直接实现
   - Checkpoint Writer 可复用现有机制

4. **代码可移植**
   - MiMo-Code 基于 OpenCode 开发
   - 核心逻辑可直接移植适配
   - API 设计相似

### 需要新增的组件

| 组件 | 工作量 | 说明 |
|------|--------|------|
| memory_fts 表定义 | 低 | 添加到 schema，复用 drizzle |
| Memory.Service | 中 | 搜索、索引、同步逻辑 |
| memory 工具 | 中 | 供 Agent 调用的搜索接口 |
| Checkpoint 系统 | 高 | 触发逻辑、模板、Writer Agent |
| Dream Agent | 中 | 提示词、触发调度、整合逻辑 |
| 记忆文件管理 | 中 | 路径解析、读写、溢出处理 |

### 工作量估计

| 阶段 | 代码量 | 时间估计 |
|------|--------|---------|
| Phase 1: 基础记忆系统 | ~800 行 | 2-3 天 |
| Phase 2: Checkpoint 系统 | ~1000 行 | 3-4 天 |
| Phase 3: Dream Agent | ~700 行 | 2-3 天 |
| Phase 4: 集成测试 | ~500 行 | 1-2 天 |
| **总计** | **~3000 行** | **8-12 天** |

---

## 实现路径建议

### Phase 1: 基础记忆系统

**目标**: 实现记忆存储和搜索功能

**步骤**:

1. **添加 Schema**
```typescript
// packages/core/src/memory/sql.ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core"

export const MemoryFtsTable = sqliteTable("memory_fts", {
  id: integer().primaryKey({ autoIncrement: true }),
  path: text().notNull().unique(),
  scope: text().notNull(),
  scope_id: text().notNull().default(""),
  type: text().notNull(),
  body: text().notNull(),
  fingerprint: text().notNull(),
  last_indexed_at: integer().notNull(),
})
```

2. **创建 Memory Service**
```typescript
// packages/core/src/memory/service.ts
export class Service {
  // 搜索记忆
  search(args: SearchArgs): Effect.Effect<SearchResult[]>
  
  // 同步索引
  reconcile(): Effect.Effect<void>
  
  // 获取记忆根路径
  root(): Effect.Effect<string>
}
```

3. **创建 memory 工具**
```typescript
// packages/opencode/src/tool/memory.ts
export const tool = Tool.from({
  name: "memory",
  description: "Search project memory",
  parameters: Schema.Struct({
    query: Schema.String,
    scope: Schema.optional(Schema.String),
    type: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
  execute: (args) => Memory.Service.search(args),
})
```

### Phase 2: Checkpoint 系统

**目标**: 实现会话状态快照

**步骤**:

1. **创建路径解析**
```typescript
// packages/core/src/session/checkpoint-paths.ts
export function checkpointPath(sessionID: string): string
export function notesPath(sessionID: string): string
export function progressPath(sessionID: string, taskID: string): string
```

2. **创建模板**
```typescript
// packages/core/src/session/checkpoint-templates.ts
export const CHECKPOINT_SECTIONS = [
  "Active intent",
  "Next concrete action",
  "Directives",
  "Task tree",
  "Current work",
  "Files and code sections",
  "Discovered knowledge",
  "Errors and fixes",
  "Live resources",
  "Design decisions",
  "Open notes",
]
```

3. **创建 Checkpoint Writer Agent**
```typescript
// packages/opencode/src/agent/agent.ts
checkpointWriter: {
  name: "checkpoint-writer",
  mode: "subagent",
  hidden: true,
  prompt: PROMPT_CHECKPOINT_WRITER,
  toolAllowlist: ["read", "write", "edit", "memory"],
}
```

4. **实现触发逻辑**
```typescript
// packages/opencode/src/session/checkpoint.ts
export function shouldCheckpoint(state: SessionState): boolean
export function triggerCheckpoint(sessionID: string): Effect.Effect<void>
```

### Phase 3: Dream Agent

**目标**: 实现自动记忆整合

**步骤**:

1. **创建 Dream Agent**
```typescript
// packages/opencode/src/agent/agent.ts
dream: {
  name: "dream",
  mode: "subagent",
  hidden: true,
  prompt: PROMPT_DREAM,
  toolAllowlist: ["read", "write", "edit", "glob", "grep", "memory", "bash"],
}
```

2. **实现触发调度**
```typescript
// packages/opencode/src/session/auto-dream.ts
export function shouldAutoDream(cfg: Config.Info): boolean {
  const enabled = cfg.dream?.auto !== false
  const intervalDays = cfg.dream?.interval_days ?? 7
  return shouldAutoRun({ enabled, intervalDays, label: "dream" })
}
```

3. **创建提示词**
```
// packages/opencode/src/agent/prompt/dream.txt
You are the Dream agent, responsible for consolidating session knowledge into persistent memory.

## Your Task

1. Collect knowledge from:
   - checkpoint.md files
   - notes.md files
   - task progress files
   - session history

2. Validate against original trajectories

3. Update MEMORY.md with standard sections:
   - Rules
   - Architecture decisions
   - Discovered durable knowledge
   - Patterns
   - Gotchas

4. Clean up integrated notes
```

### Phase 4: 集成测试

**测试用例**:

```typescript
// packages/opencode/test/memory.test.ts

describe("Memory System", () => {
  it("should index memory files", async () => {
    const service = await Memory.Service.create()
    await service.reconcile()
    const results = await service.search({ query: "test" })
    expect(results.length).toBeGreaterThan(0)
  })
  
  it("should filter by scope", async () => {
    const results = await service.search({ 
      query: "rule", 
      scope: "projects",
      scope_id: projectID,
    })
    expect(results.every(r => r.scope === "projects")).toBe(true)
  })
})

describe("Dream Agent", () => {
  it("should consolidate knowledge", async () => {
    // 创建测试会话
    // 运行 Dream
    // 验证 MEMORY.md 更新
  })
})
```

---

## 附录: 配置参考

### MiMo-Code 完整配置

```json
{
  "checkpoint": {
    "memory_reconcile_on_search": true,
    "memory_search_score_floor": 0.15,
    "push_caps": {
      "checkpoint": 11000,
      "memory": 10000,
      "notes": 6000,
      "global": 6000
    },
    "fork": false
  },
  "dream": {
    "auto": true,
    "interval_days": 7
  },
  "distill": {
    "auto": true,
    "interval_days": 30
  },
  "memory": {
    "cc_index": false
  }
}
```

### 建议的 OpenCode 配置

```json
{
  "memory": {
    "enabled": true,
    "reconcile_on_search": true,
    "search_score_floor": 0.15
  },
  "checkpoint": {
    "enabled": true,
    "auto_trigger": true,
    "token_threshold": 0.8
  },
  "dream": {
    "enabled": true,
    "auto": true,
    "interval_days": 7
  }
}
```

---

## 总结

MiMo-Code 的记忆系统是一个完善的、多层次的知识管理方案，核心价值在于：

1. **自动化知识沉淀**: Dream Agent 定期从会话中提取持久知识
2. **高效检索**: FTS5 全文搜索支持快速查找
3. **结构化存储**: Checkpoint 和 MEMORY.md 提供清晰的知识结构
4. **多作用域隔离**: global/projects/sessions 三层满足不同需求

OpenCode 具备实现这一系统的所有基础设施，建议分阶段实施，优先实现基础记忆系统和 Checkpoint，再添加 Dream 自动整合功能。
