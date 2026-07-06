# RAG / 分层知识系统 — 阶段实施 Goal 索引

> 本目录为 `docs/rag-knowledge-base-requirements-and-plan.md` 各实施阶段的 `/goal` 指令集。每份文档是一个可独立复制、可独立验证的 Codex/Claude Code goal。
>
> 通用约定：
> - 所有阶段都包含**"新建功能分支"硬性前置要求**，违反即终止。
> - 每阶段分支基于上一阶段分支派生（链式），保证依赖顺序。
> - 默认中文执行版 + 英文兼容镜像，语义一致。
> - 工期为粗略估算，不作为完成条件；完成以"验证证据"为准。
>
> 最后更新：2026-07-05

## 依赖图

```
Layer 1 (Markdown 知识注入)
  L1-1 (后端) ──▶ L1-2 (UI) ──▶ L1-3 (文件外挂, P2)

Layer 2 (pgvector RAG)
  L2-0 (前置准备)
     │
     ▼
  L2-1 (Feature 骨架) ──▶ L2-2 (Embedding+VDP) ──▶ L2-3 (KB CRUD)
                                                        │
                                                        ▼
  L2-6 (UI) ◀── L2-5 (检索) ◀── L2-4 (摄入 Pipeline)
     │
     ▼
  L2-7 (端到端集成与测试)
```

## 阶段清单

### Layer 1：静态规则知识（Markdown / Skills）— 优先实施

| 阶段 | 文档 | 工期 | 分支（基于上一阶段派生） |
|------|------|------|--------------------------|
| L1-1 | [01-layer1-backend.md](./01-layer1-backend.md) | ~1 天 | `feat/ai-employee-markdown-kb-backend`（基于 `danai`） |
| L1-2 | [02-layer1-ui.md](./02-layer1-ui.md) | ~1 天 | `feat/ai-employee-markdown-kb-ui`（基于 L1-1） |
| L1-3 (P2) | [03-layer1-file-mount.md](./03-layer1-file-mount.md) | ~0.5 天 | `feat/ai-employee-markdown-kb-filemount`（基于 L1-2） |

### Layer 2：文档检索知识（pgvector RAG）

| 阶段 | 文档 | 工期 | 分支 |
|------|------|------|------|
| L2-0 | [04-layer2-bootstrap.md](./04-layer2-bootstrap.md) | ~0.5 天 | `chore/ai-rag-pgvector-bootstrap`（基于 `danai`） |
| L2-1 | [05-layer2-feature-skeleton.md](./05-layer2-feature-skeleton.md) | ~1 天 | `feat/ai-rag-pgvector-skeleton`（基于 L2-0） |
| L2-2 | [06-layer2-embedding-vdp.md](./06-layer2-embedding-vdp.md) | ~1 天 | `feat/ai-rag-pgvector-embedding`（基于 L2-1） |
| L2-3 | [07-layer2-kb-crud.md](./07-layer2-kb-crud.md) | ~1 天 | `feat/ai-rag-pgvector-kb-crud`（基于 L2-2） |
| L2-4 | [08-layer2-ingestion.md](./08-layer2-ingestion.md) | ~1.5 天 | `feat/ai-rag-pgvector-ingestion`（基于 L2-3） |
| L2-5 | [09-layer2-search.md](./09-layer2-search.md) | ~0.5 天 | `feat/ai-rag-pgvector-search`（基于 L2-4） |
| L2-6 | [10-layer2-ui.md](./10-layer2-ui.md) | ~1.5 天 | `feat/ai-rag-pgvector-ui`（基于 L2-5） |
| L2-7 | [11-layer2-e2e.md](./11-layer2-e2e.md) | ~1 天 | `feat/ai-rag-pgvector-e2e`（基于 L2-6） |

## 使用方式

1. 按依赖图顺序逐个执行；不要跳跃（如 L2-4 依赖 L2-3 的数据模型）。
2. 复制对应阶段文档中的 `/goal ...` 指令块，粘贴给 Codex / Claude Code。
3. 每阶段完成后合并到主开发分支（`danai`），再开下一阶段分支。
4. 任何阶段触发"暂停条件"时停下，等人工决策。
