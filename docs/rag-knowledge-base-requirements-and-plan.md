# AI 员工分层知识系统：需求分析与实施计划

> 范围：为 NocoBase AI 员工构建**分层知识系统**，而非单一的"RAG 知识库"。综合考虑 2026 年企业 AI 知识管理的技术版图（向量 RAG / Markdown-Skills / Agent Memory），按知识形态分层落地，优先低成本高价值层。
>
> 涵盖：
> - **Layer 1（静态规则知识）**：Markdown / Skills 形式，直接注入 system prompt —— 覆盖 SOP/规则/字段语义等高频场景（**新增，优先级最高**）。
> - **Layer 2（文档检索知识）**：实现 `plugin-ai` 中已定义但未实现的 RAG EE Feature 契约，提供 pgvector 参考实现。
> - **Layer 3 / Layer 4**：Contextual Retrieval 增强、Agent Memory —— 列出方向，不在本期实现。
>
> 本文档不替代 EE 商业产品，而是给出可独立运行的实现路径，方便内部测试、二次开发与对接。
>
> 最后更新：2026-07-05（v2：引入分层知识框架；详见附录 A 的技术评估）

---

## 一、背景与现状

NocoBase 开源仓库中 RAG / 知识库采用**"开源抽象 + 企业实现"** 模式：

- 抽象层（开源，已就绪）：
  - `packages/plugins/@nocobase/plugin-ai/src/server/features/`：四个 Feature 接口
  - `packages/plugins/@nocobase/plugin-ai/src/server/types/knowledge-base.type.ts`：共享类型
  - `packages/plugins/@nocobase/plugin-ai/src/server/manager/ai-feature-manager.ts`：FeatureManager 实现 + `EEFeatures` 枚举
  - `packages/plugins/@nocobase/plugin-ai/src/server/ai-employees/ai-knowledge-base.ts`：`KnowledgeBaseManager` 检索入口
  - `packages/plugins/@nocobase/plugin-ai/src/ai/tools/knowledge-base-retrieve.ts`：AI 工具入口
  - `packages/plugins/@nocobase/plugin-ai/src/server/document-loader/`：文档解析（PDF/DOCX/XLSX/...）
- 实现层（**仓库内缺失**）：
  - 无任何 `enableFeatures()` 调用
  - 无 `implements KnowledgeBaseFeature` / `implements VectorStoreProvider` 类
  - 无 chunking / embedding / 向量库写入代码

**结论**：上层调用链全部就绪，缺口只在"实现 + 注册"四个 Feature。

---

## 二、目标与非目标

### 设计原则（v2 新增）
> 知识形态决定接入方式。不应把所有知识都塞进向量库，也不应只用 Markdown。详见 **附录 A** 的技术评估。

| 知识形态 | 例子 | 适合的层 |
|----------|------|----------|
| 规则 / SOP / 字段语义 / 操作手册 | "请假审批流"、"什么情况走二级审批"、"客户状态字段含义" | **Layer 1**（Markdown 注入） |
| 大量非结构化文档 | 合同 PDF、产品手册、内部 wiki 长文 | **Layer 2**（向量 RAG） |
| 个性化 / 历史决策 / 用户偏好 | "这个用户上次拒绝过方案 A" | Layer 4（Agent Memory，本期不做） |

### 目标
1. **【Layer 1，最高优先级】** 让 AI 员工支持 Markdown/规则类知识注入，覆盖高频"规则/SOP"场景。
2. **【Layer 2】** 实现四个 RAG Feature 接口，使 `plugin-ai` 的知识库开关 `isKnowledgeBaseEnabled` 返回 `true`。
3. **【Layer 2】** 支持 LOCAL 类型知识库：上传文档 → 切块 → 向量化 → 入库 → 相似度检索。
4. **【Layer 2】** 提供 pgvector 后端作为参考实现（NocoBase 默认即 PostgreSQL）。
5. **【Layer 2】** 通过 LangChain 标准接入多种 Embedding 模型（OpenAI / 本地模型）。
6. **【Layer 2】** 提供管理 API：知识库 CRUD、文档上传/删除、向量库连接测试。
7. 集成验证：AI 员工开启 Layer 1 / Layer 2 后，提问能正确得到知识增强。

### 非目标
- 不重写已就绪的上层调用链（`KnowledgeBaseManager.retrievePrompt` / `knowledge-base-retrieve` 工具 / 系统提示词模板渲染）。
- 不在本期实现 READONLY / EXTERNAL 类型知识库（接口预留，实现先留 stub）。
- **不实现 Contextual Retrieval / Rerank**（Layer 3）—— 待 Layer 2 跑通且有真实数据后再触发，避免过度工程。
- **不实现 Agent Memory**（Layer 4）—— 场景错配，作为独立特性单独立项。
- 不实现细粒度权限控制（沿用插件级 RBAC）。

---

## 三、需要实现的接口契约（来自源码，逐字引用）

### 3.1 `KnowledgeBaseFeature`
```ts
// features/knowledge-base.ts
export interface KnowledgeBaseFeature {
  getKnowledgeBase(knowledgeBaseKeys: string[]): Promise<KnowledgeBase[]>;
  getKnowledgeBaseGroup(knowledgeBaseKeys: string[]): Promise<KnowledgeBaseGroup[]>;
  search(options: SearchOptions): Promise<DocumentSegmentedWithScore[]>;
}
```

### 3.2 `VectorStoreProviderFeature`
```ts
// features/vector-store-provider.ts
export interface VectorStoreProviderFeature {
  register(vsp: VectorStoreProvider): void;
  providerNames: string[];
  createVectorStoreService(providerName: string, vectorStoreProps?: VectorStoreProp[]): Promise<VectorStoreService>;
}
export interface VectorStoreProvider {
  providerName: string;
  createVectorStoreService(vectorStoreProps?: VectorStoreProp[]): Promise<VectorStoreService>;
}
export interface VectorStoreService<VS = any> {
  getVectorStore(): Promise<VS>;
  search(query: string, options?: VectorStoreSearchOptions): Promise<DocumentSegmentedWithScore[]>;
}
export type VectorStoreSearchOptions = { topK?: number; score?: string; filter?: any };
```

### 3.3 `VectorDatabaseProviderFeature`
```ts
// features/vector-database-provider.ts
import { EmbeddingsInterface } from '@langchain/core/embeddings';
export interface VectorDatabaseProviderFeature {
  register<T, R>(providerInfo: VectorDatabaseProviderInfo<T, R>): void;
  validateConnectParams<T>(providerName: string, connectParams: T): void;
  testConnection<T>(providerName: string, connectParams: T): Promise<{ success: boolean; error?: string }>;
  beforeCreate<T>(providerName: string, connectParams: T, options?: any): Promise<{ status: number; message?: string }>;
  createVectorStore<T, R>(providerName: string, embeddings: EmbeddingsInterface, connectParams: T): Promise<R>;
  listProviders(): VectorDatabaseProviderInfo<unknown, unknown>[];
}
export type VectorDatabaseProvider<T, R> = {
  validateConnectParams(connectParams: T): void;
  testConnection(connectParams: T): Promise<{ success: boolean; error?: string }>;
  beforeCreate(connectParams: T, options?: any): Promise<{ status: number; message?: string }>;
  createVectorStore(embeddings: EmbeddingsInterface, connectParams: T): Promise<R>;
};
```

### 3.4 `VectorDatabaseFeature`
```ts
// features/vector-database.ts
export type VectorDatabaseInfo = {
  id: string; name: string; databaseSpec: string;
  provider: string; connectProps: unknown; enabled: boolean;
};
export interface VectorDatabaseFeature {
  getVectorDatabaseInfo(id: string): Promise<VectorDatabaseInfo>;
  listVectorDatabasesInfo(): Promise<VectorDatabaseInfo[]>;
}
```

### 3.5 共享类型 (`types/knowledge-base.type.ts`)
```ts
export type KnowledgeBaseType = 'LOCAL' | 'READONLY' | 'EXTERNAL';
export type VectorStoreProp = { name?: string; key: string; value: any };
export type KnowledgeBase = {
  knowledgeBaseType: KnowledgeBaseType;
  knowledgeBaseOuterId: string;
  key: string; name: string; description: string;
  vectorStoreProvider: string;
  vectorStoreConfigKey?: string;
  vectorStoreProps?: VectorStoreProp[];
  enabled: boolean;
};
export type VectorStoreConfig = { vectorStoreProvider: string; vectorStoreConfigKey?: string };
export type KnowledgeBaseGroup = { vectorStoreConfig: VectorStoreConfig; knowledgeBaseType: KnowledgeBaseType; knowledgeBaseList: KnowledgeBase[] };
export type DocumentSegmented = { content: string; metadata: Record<string, any>; id?: string };
export type DocumentSegmentedWithScore = DocumentSegmented & { score: number };
export type SearchOptions = { knowledgeBaseKeys: string[]; query: string; topK?: number; score?: string };
```

### 3.6 上层调用契约（不可破坏）
`KnowledgeBaseManager.retrievePrompt` (`ai-knowledge-base.ts:47`) 调用：
```ts
const docs = await this.plugin.features.knowledgeBase.search({ knowledgeBaseKeys, query, topK, score });
```
- `topK`、`score` 来自 AI 员工的 `knowledgeBase` jsonb 字段（默认 `topK: 3`、`score: '0.6'`，类型均为 string/number 混用，实现时需容错）。
- 返回的 `DocumentSegmentedWithScore` 的 `content` 会拼成 `{knowledgeBaseData}` 注入 `employee.knowledgeBasePrompt`（默认模板 `{knowledgeBaseData}`）。
- `metadata.matchedQuestions`（字符串数组）若存在，会以 `Related questions:` 形式拼接在 content 前 —— 实现时可在 metadata 中填充 Q&A 对的关联问题以提升效果。

---

## 四、整体架构

```
┌──────────────────────────────────────────────────────────────┐
│  plugin-ai (开源，已就绪)                                       │
│  - KnowledgeBaseManager.retrievePrompt                        │
│  - knowledge-base-retrieve tool                               │
│  - features.enableFeatures(...)  ◀── 注册入口                  │
│  - DocumentLoader (PDF/DOCX/...)                              │
└───────────────────────────────┬──────────────────────────────┘
                                │ 通过 enableFeatures 注入
┌───────────────────────────────▼──────────────────────────────┐
│  plugin-ai-rag-pgvector (本期新增 Pro 插件)                    │
│                                                                │
│  ┌─────────────────────┐   ┌──────────────────────────────┐   │
│  │  KnowledgeBase      │   │  VectorStoreProvider         │   │
│  │  Feature impl       │   │  - PGVectorStoreProvider     │   │
│  │  - search()         │   │  - createVectorStoreService  │   │
│  │  - getKnowledgeBase │   └──────────────────────────────┘   │
│  └─────────┬───────────┘   ┌──────────────────────────────┐   │
│            │                 │  VectorDatabaseProvider      │   │
│            ▼                 │  - PGVectorDBProvider        │   │
│  ┌─────────────────────┐    │  - testConnection            │   │
│  │ Ingestion Pipeline  │    │  - createVectorStore         │   │
│  │ - chunk             │    └──────────────────────────────┘   │
│  │ - embed             │    ┌──────────────────────────────┐   │
│  │ - write             │    │  VectorDatabase Feature      │   │
│  └─────────────────────┘    │  - list/info (查询已配置库)   │   │
│                              └──────────────────────────────┘   │
│  Collections: knowledgeBases, knowledgeBaseDocuments,           │
│               knowledgeBaseSegments, vectorDatabases            │
└──────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    PostgreSQL + pgvector 扩展
```

---

## 五、功能需求清单

### 5.1 Layer 1：静态规则知识（Markdown / Skills）—— v2 新增

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| L1-FR-1 | `aiEmployees` 扩展 `markdownKnowledge` 字段（text），支持多段 markdown | P0 | 字段可保存；迁移幂等 |
| L1-FR-2 | AI 员工对话时，将 `markdownKnowledge` 拼入 system prompt（带 `<markdownKnowledge>` 标签包裹） | P0 | 提问规则类问题能正确依据该文本作答 |
| L1-FR-3 | 管理端 UI 提供 markdown 编辑器（复用 vditor / monaco），支持预览 | P0 | 编辑后保存生效 |
| L1-FR-4 | 支持环境变量 / 文件外挂（可选）：从 `process.env.NOCOBASE_AI_KB_DIR` 加载目录下 `*.md` | P2 | 改文件即生效，无需入库 |
| L1-FR-5 | Token 预算控制：超出阈值时告警/截断（避免撑爆上下文） | P1 | 大文本不会破坏对话 |

> Layer 1 与 Layer 2 **正交**：可同时开启；二者各自走独立的拼接路径，最终都汇入 system prompt。

### 5.2 Layer 2：文档检索知识（向量 RAG）

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| L2-FR-1 | 向量数据库管理：注册 pgvector Provider，支持连接测试 | P0 | `testConnection` 返回 success；UI 可创建并保存连接 |
| L2-FR-2 | Embedding 模型管理：支持 OpenAI / 可配置 baseurl 的兼容接口 | P0 | 给定文本可返回向量；维度可配置 |
| L2-FR-3 | 知识库 CRUD（LOCAL 类型） | P0 | 可创建/编辑/删除知识库，绑定一个向量库连接 |
| L2-FR-4 | 文档上传：复用 `DocumentLoader` 解析 → 切块 → 向量化 → 入库 | P0 | 上传 PDF/DOCX/MD/TXT 后可在库中检索到内容 |
| L2-FR-5 | 切块策略：可配置 chunkSize / chunkOverlap | P1 | 配置变化后重新索引生效 |
| L2-FR-6 | 检索：`search()` 按 topK + score 阈值返回 | P0 | 召回内容相关，score 过滤正确 |
| L2-FR-7 | 文档删除：连同向量数据一并删除 | P1 | 删除后检索不再命中 |
| L2-FR-8 | 重新索引：文档或切块策略变更后可触发 | P1 | 重新索引后内容更新 |
| L2-FR-9 | Feature 注册：插件 load 时调用 `enableFeatures` | P0 | `isKnowledgeBaseEnabled` 返回 true |
| L2-FR-10 | 端到端集成：AI 员工开启知识库后自动检索注入 | P0 | 提问能命中已上传文档 |
| L2-FR-11 | metadata.matchedQuestions 支持（Q&A 库场景） | P2 | 系统提示词中出现 "Related questions:" |

---

## 六、数据模型（Pro 插件 Collections）

### 6.0 Layer 1 字段（追加到 `plugin-ai` 的 `aiEmployees` 集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| `markdownKnowledge` | text | 多段 markdown，规则/SOP/字段语义等静态知识；按 `<markdownKnowledge>` 块拼入 system prompt |
| `markdownKnowledgeEnabled` | boolean | 是否启用 Layer 1 注入 |

> 改动落在 `plugin-ai/src/collections/ai-employees.ts`。新增列自动 sync（AGENTS.md），无需手写迁移。
> 该字段与现有 `knowledgeBasePrompt`（Layer 2 模板）正交，二者独立工作。

### 6.1 `vectorDatabases` —— 向量库连接
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer PK | |
| name | string | 显示名 |
| databaseSpec | string | provider + 版本标识 |
| provider | string | `pgvector` |
| connectProps | jsonb | 连接参数（schema/table/dimension 等） |
| enabled | boolean | |

### 6.2 `knowledgeBases` —— 知识库
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer PK | |
| key | string unique | 业务 key（`KnowledgeBase.key`） |
| name | string | |
| description | text | |
| knowledgeBaseType | string | `LOCAL` / `READONLY` / `EXTERNAL` |
| vectorDatabaseId | fk → vectorDatabases | |
| vectorStoreProvider | string | 固定 `pgvector`（满足 `KnowledgeBase.vectorStoreProvider`） |
| vectorStoreConfigKey | string | 可选，沿用接口字段 |
| vectorStoreProps | jsonb | 沿用 `VectorStoreProp[]` |
| embeddingConfig | jsonb | `{ provider, model, baseUrl, apiKeyEnv, dimensions }` |
| chunkConfig | jsonb | `{ chunkSize, chunkOverlap, separator }` |
| enabled | boolean | |

> 说明：`KnowledgeBase.knowledgeBaseOuterId` 存本表 `key`，便于跨 `vectorStoreConfigKey` 路由。

### 6.3 `knowledgeBaseDocuments` —— 文档
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer PK | |
| knowledgeBaseId | fk | |
| fileKey | string | 关联 file-manager |
| fileName | string | |
| status | string | `pending/parsing/indexed/failed` |
| segmentsCount | integer | |
| error | text | |
| createdAt | date | |

### 6.4 `knowledgeBaseSegments` —— 切块元数据（可选，便于删除/重建）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer PK | |
| documentId | fk | |
| knowledgeBaseId | fk | |
| chunkIndex | integer | |
| content | text | 切块原文（便于排查） |
| vectorId | string | pgvector 表中的对应 id |
| metadata | jsonb | 含 `matchedQuestions` 等 |

> pgvector 实际向量数据存放在 pgvector 自己的 table（由 LangChain `PGVector` 创建/指定），`vectorId` 做映射。也可选择把向量存进本表（自建 schema），二选一，MVP 采用 LangChain PGVector 默认表。

> 数据库变更需走 `src/server/migrations/`（AGENTS.md 要求）。新增 collection（表/列/索引）在 `yarn nocobase upgrade` 时自动 sync，无需手写迁移。

---

## 七、实施计划（分阶段、按层）

> 落地顺序遵循"**低成本高价值优先**"：Layer 1 先行（覆盖 SOP/规则类高频场景，1–2 人日即可见效），Layer 2 随后（覆盖海量文档场景）。两层正交、可独立验收。

### Layer 1：静态规则知识（Markdown / Skills）—— 优先实施

#### 阶段 L1-1：数据模型 + 注入逻辑（1 天）
- [ ] 在 `plugin-ai/src/collections/ai-employees.ts` 增加 `markdownKnowledge: text` 与 `markdownKnowledgeEnabled: boolean`
- [ ] 在 `ai-employee.ts` 的 system prompt 拼装处（与 `knowledgeBase` 注入并列）增加 Layer 1 拼接：
  ```ts
  if (employee.markdownKnowledgeEnabled && employee.markdownKnowledge) {
    systemPrompt += `\n<markdownKnowledge>\n${employee.markdownKnowledge}\n</markdownKnowledge>`;
  }
  ```
- [ ] Token 预算：超阈值（默认 8k tokens）截断 + 告警，避免污染主对话

#### 阶段 L1-2：管理端 UI（1 天）
- [ ] v1 (`src/client/`)：在 AI 员工编辑页加 markdown 编辑器（复用项目已有的 vditor，与 `plugin-field-markdown-vditor` 一致），含预览
- [ ] v2 (`src/client-v2/`)：同上，按 v2 组件规范
- [ ] i18n：`en-US` / `zh-CN` 双语；主题色来自 `theme.useToken()`
- [ ] 验收：填入规则文本 → 提问规则类问题 → 模型严格依据文本作答

#### 阶段 L1-3（可选 P2）：文件外挂
- [ ] 从 `process.env.NOCOBASE_AI_KB_DIR` 加载 `*.md`，热加载（重启或定时同步）
- [ ] 用例：运维改 nginx 配置文档即生效，无需进数据库

**Layer 1 工期：约 2 人日**（P2 文件外挂另计 0.5 人日）

---

### Layer 2：文档检索知识（pgvector RAG）

#### 阶段 L2-0：前置准备（0.5 天）
- [ ] 确认 Postgres 已启用 `pgvector` 扩展（`CREATE EXTENSION vector;`），写入部署文档
- [ ] 依赖确认：`@langchain/community`（PGVectorStore）、`@langchain/textsplitters`、`@nocobase/plugin-ai` 对等版本
- [ ] 在 `packages/plugins/@nocobase/plugin-ai-rag-pgvector/` 用脚手架创建插件

#### 阶段 L2-1：Feature 注册骨架（1 天）
- [ ] 实现 `PgvectorKnowledgeBaseFeature`、`PgvectorVectorStoreProvider`、`PgvectorVectorDatabaseProvider`、`PgvectorVectorDatabaseFeature` 四个类（方法先 throw not impl）
- [ ] 在插件 `load()` 中：
  ```ts
  this.app.plugin('@nocobase/plugin-ai').then((p) => {
    p.features.enableFeatures({
      knowledgeBase: this.kbFeature,
      vectorStoreProvider: this.vspFeature,
      vectorDatabaseProvider: this.vdpFeature,
      vectorDatabase: this.vdFeature,
    });
  });
  ```
- [ ] 验证：`GET /api/aiSettings:isKnowledgeBaseEnabled` 返回 `{ enabled: true }`

#### 阶段 L2-2：Embedding + 向量库 Provider（1 天）
- [ ] 实现 `EmbeddingsFactory`：根据 `embeddingConfig` 构造 LangChain `Embeddings`（OpenAI 兼容）
- [ ] 实现 `PgvectorVectorDatabaseProvider`：
  - `validateConnectParams`：校验 schema/table/dimension
  - `testConnection`：执行 `SELECT 1` + 检查 pgvector 扩展
  - `beforeCreate`：建 schema/table（如不存在）
  - `createVectorStore`：返回 LangChain `PGVectorStore` 实例
- [ ] 实现 `PgvectorVectorStoreProvider.createVectorStoreService`：包装成 `VectorStoreService`（`getVectorStore` + `search`）

#### 阶段 L2-3：知识库 CRUD + 数据模型（1 天）
- [ ] 定义上述 4 个 collection（`src/collections/*.ts`）
- [ ] 实现 `KnowledgeBaseFeature.getKnowledgeBase` / `getKnowledgeBaseGroup`：从 `knowledgeBases` 表读取并映射为 `KnowledgeBase[]`
- [ ] 资源 API：`kb:create`/`list`/`update`/`destroy`，权限沿用 ACL

#### 阶段 L2-4：文档摄入 Pipeline（1.5 天）
- [ ] 定义 `IngestionService.ingest(documentId)`：
  1. 通过 `plugin-ai` 暴露的 `DocumentLoader.load(file)` 取得 `Document[]`
  2. `RecursiveCharacterTextSplitter`（参数来自 `chunkConfig`）切块
  3. 取知识库绑定向量库 → `createVectorStore` → `addDocuments`
  4. 落库 `knowledgeBaseSegments`、更新 `knowledgeBaseDocuments.status`
- [ ] 资源 API：`kbDocuments:upload` / `list` / `destroy`（destroy 同时按 `vectorId` 删向量）
- [ ] 异步执行（事务外、worker / 队列，避免阻塞请求）

#### 阶段 L2-5：检索（0.5 天）
- [ ] 实现 `KnowledgeBaseFeature.search`：
  1. 根据 `knowledgeBaseKeys` 找到知识库 + 向量库
  2. `VectorStoreService.search(query, { topK, score })` → 相似度 + 阈值过滤
  3. 返回 `DocumentSegmentedWithScore[]`，填充 `metadata.matchedQuestions`（如有）
- [ ] 容错：`topK`/`score` 字符串/数字兼容（`Number()` 转）

#### 阶段 L2-6：UI（1.5 天，v1 + v2 双运行时）
- [ ] v1 (`src/client/`)：知识库管理页（列表/创建/编辑/删除）、文档上传、向量库连接配置
- [ ] v2 (`src/client-v2/`)：复用 `client-v2/features/` 中已定义的 `VectorStorePropField` 表单模式
- [ ] i18n：所有 UI 文案走 `t()`，提供 `en-US` / `zh-CN`
- [ ] 主题：颜色全部来自 `theme.useToken()`，禁止硬编码中性色（AGENTS.md）

#### 阶段 L2-7：端到端集成与测试（1 天）
- [ ] 集成测试：上传文档 → AI 员工开启知识库 → 提问验证召回
- [ ] 单测：`EmbeddingsFactory`、切块、score 阈值过滤
- [ ] 文档：部署（pgvector 安装）、配置、API 说明

**Layer 2 工期：约 8 人日**

---

### 工期汇总

| 层 | 工期 | 价值 | 建议时序 |
|----|------|------|----------|
| Layer 1（Markdown/Skills） | ~2 人日 | ⭐⭐⭐⭐⭐ 立竿见影覆盖 SOP/规则 | **先做** |
| Layer 2（pgvector RAG） | ~8 人日 | ⭐⭐⭐ 覆盖海量文档，激活既有 Feature 抽象 | **随后** |
| Layer 3（Contextual + Rerank） | ~3 人日 | ⭐⭐ 仅在 L2 召回质量不达标时触发 | 按需 |
| Layer 4（Agent Memory） | 独立项目 | ⭐⭐ 个性化场景 | 单独立项 |

**本期合计：约 10 人日（L1 + L2）。**

---

## 八、关键风险与对策

| 风险 | 对策 |
|------|------|
| pgvector 在目标 PG 版本不可用 | 部署文档列明 PG≥12 + pgvector≥0.5；`testConnection` 提前失败提示 |
| Embedding API key 泄露 | 全部走环境变量（`EnvVariableInput`），不落库明文 |
| 大文档摄入阻塞主流程 | 摄入异步化；status 字段驱动 UI；失败可重试 |
| topK/score 类型在调用侧不统一（string/number） | `search` 入口统一 `Number()` 转换 + 默认值兜底 |
| `enableFeatures` 时序（plugin-ai 未加载完成） | 用 `app.plugin('@nocobase/plugin-ai').then(...)` 等待就绪后再注册 |
| LangChain PGVector 表结构 / 版本差异 | 锁定 `@langchain/community` 版本，封装一层避免泄漏到上层 |
| 双运行时（v1/v2）UI 重复维护 | 共享 schema/类型，UI 分层最小化 |

---

## 九、验收清单（DoD）

### Layer 1
- [ ] AI 员工编辑页存在 `markdownKnowledge` 编辑入口，可保存
- [ ] 开启 Layer 1 后，规则类问题依据注入文本作答（可控测试用例通过）
- [ ] 大段 markdown 超 token 预算时不破坏主对话
- [ ] 双运行时（v1/v2）UI 一致；i18n 双语；无硬编码中性色

### Layer 2
- [ ] `GET /api/aiSettings:isKnowledgeBaseEnabled` → `{ enabled: true }`
- [ ] 可创建 pgvector 向量库连接并 `testConnection` 通过
- [ ] 可创建 LOCAL 知识库并绑定连接 + Embedding 配置
- [ ] 上传 PDF/DOCX/MD/TXT 后状态变更为 `indexed`
- [ ] AI 员工开启知识库后，针对文档内容提问能正确召回并答出
- [ ] `knowledge-base-retrieve` 工具被调用时返回相关内容
- [ ] 删除文档后不再召回
- [ ] 相关单测/集成测试通过

### 通用
- [ ] Layer 1 + Layer 2 可同时开启且互不干扰
- [ ] `yarn eslint --fix` 无报错

---

## 十、接口实现示意（伪代码）

```ts
// plugin.ts (Pro 插件)
export default class PluginAIRagPgvector extends Plugin {
  async load() {
    const ai = await this.app.plugin('@nocobase/plugin-ai');
    ai.features.enableFeatures({
      knowledgeBase: new PgvectorKnowledgeBaseFeature(this),
      vectorStoreProvider: new PgvectorVectorStoreProvider(this),
      vectorDatabaseProvider: new PgvectorVectorDatabaseProvider(this),
      vectorDatabase: new PgvectorVectorDatabaseFeature(this),
    });
    // collections / resources / UI 注册...
  }
}

class PgvectorKnowledgeBaseFeature implements KnowledgeBaseFeature {
  async search(opts: SearchOptions): Promise<DocumentSegmentedWithScore[]> {
    const kb = await this.getKnowledgeBase(opts.knowledgeBaseKeys);
    const service = await this.vsp.createVectorStoreService('pgvector', kb[0].vectorStoreProps);
    const topK = Number(opts.topK ?? 3);
    const score = Number(opts.score ?? 0.6);
    const results = await service.search(opts.query, { topK, score });
    return results; // 已含 score、metadata
  }
}
```

---

## 十一、未来扩展（不在本期）

- **Layer 3**：Contextual Retrieval（每块入库前 LLM 加上下文前缀）+ BM25 混合检索 + Rerank —— 在 Layer 2 召回质量不达标时启用
- **Layer 4**：Agent Memory（Mem0 / Letta 风格）—— 用户偏好、对话历史、个性化，独立立项
- READONLY / EXTERNAL 类型知识库（对接外部已建好的向量库）
- 多模态文档（图片 OCR）
- 增量索引 / 版本化切片

> 各层的现实意义评估见 **附录 A**。

---

## 附录 A：实施意义综合评估（2026 技术版图）

> 本附录记录"是否实施、为何实施、如何取舍"的论证过程，是本文档 v2 改版的依据。最后更新：2026-07-05。

### A.1 技术版图已发生结构性变化

过去 18 个月，"AI 给知识库赋能"领域出现了**四条并行演进的路径**，各自在蚕食传统向量 RAG 的领地：

| 路径 | 代表 | 核心思想 | 适合的知识形态 |
|------|------|----------|----------------|
| **A. 传统向量 RAG** | pgvector / Pinecone / Weaviate | 切块→向量化→相似度检索 | 大规模非结构化文档 |
| **B. Contextual RAG** | [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) | 入库前用 LLM 给每块加上下文前缀 + BM25 混合检索 + Rerank | A 的"修补版"，召回失败率降 ~67% |
| **C. Markdown / Skills / Wiki** | Anthropic Skills、Karpathy 倡导的 markdown KB、Cursor Rules | 直接把过程性/规则性知识以结构化文本喂入上下文 | 流程、规则、SOP、agent 行为约束 |
| **D. Agent Memory** | [Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)、[Letta/MemGPT](https://vectorize.io/articles/best-ai-agent-memory-systems)、Zep、Cognee | 从对话/操作中动态抽取、沉淀、检索记忆 | 用户偏好、历史决策、个性化上下文 |

业界共识已不再是"哪种赢"，而是 **"按知识形态分层"** —— 见 [Vector Databases Are Not Knowledge Management](https://medium.com/predict/vector-databases-are-not-knowledge-management-c3d5f4b428ff) 与 [Agentic RAG 思潮](https://redis.io/blog/agentic-rag-how-enterprises-are-surmounting-the-limits-of-traditional-rag/)。

### A.2 四类路径的现实取舍

**路径 A：传统向量 RAG（pgvector 路线 = 本文档 Layer 2）**
- ✅ NocoBase 已定义完整 Feature 抽象层，**契约稳定、调用链就绪**，实现成本最低
- ✅ 对**海量非结构化文档**（合同、产品手册、技术 PDF）仍是当前最成熟方案
- ✅ 2026 年仍是企业采购清单主流（[11 家厂商横向评测](https://onyx.app/insights/enterprise-rag-platforms-2026)）
- ❌ 经典切块 + 单纯向量召回的**召回质量天花板较低**
- ❌ 对"规则/操作类"知识是**反模式**，不如直接给 LLM 一段 Markdown
- ❌ 真正生产级质量需要 Contextual Retrieval + Rerank，MVP 不做效果可能让人失望

**路径 B：Contextual RAG（Layer 3）**
- ✅ Anthropic 数据：contextual embeddings + hybrid search + rerank 把检索失败率降低约 [49%–67%](https://www.anthropic.com/engineering/contextual-retrieval)
- ✅ 仍是"向量库"架构，**对路径 A 的实现是渐进升级**而非重写
- ❌ 入库时每块都要调一次 LLM 加上下文，**摄入成本显著上升**
- ❌ MVP 阶段过度工程

**路径 C：Markdown / Skills / Wiki（本文档 Layer 1）—— 最被低估**
- ✅ **对 NocoBase 这种低代码平台尤其契合**：用户知识很多就是"配置规则、SOP、操作手册"
- ✅ 实施成本极低：**无需向量库、无需 embedding、无需切块**
- ✅ 可解释、可审计、可手工编辑（向量库几乎无法人工校对）
- ✅ 已被 Anthropic（Skills）、Cursor（.cursorrules）、Claude Code 全面验证
- ✅ [Karpathy 等公开背书](https://dev.to/imaginex/ai-agent-memory-management-when-markdown-files-are-all-you-need-5ekk)：上下文窗口变大后，很多场景根本不需要 RAG
- ❌ **不适合海量文档**（受 context window 限制）
- ❌ 没有相似度排序，"找相关"靠模型自己扫全文

**路径 D：Agent Memory（Layer 4）**
- ✅ 解决了 RAG **完全覆盖不到的场景**：用户偏好、对话历史、决策记忆
- ✅ [Mem0 在多数 benchmark 上领先](https://mem0.ai/blog/long-term-memory-ai-agents)，架构轻量
- ❌ **完全不同的产品形态**，是"记忆系统"而非"知识库"
- ❌ 与现有 `KnowledgeBaseFeature` 接口不匹配，需新增 `MemoryFeature` 抽象

### A.3 对 NocoBase 本项目的具体评估

**现实意义分级**：

| 实施项 | 现实意义 | 理由 |
|--------|---------|------|
| **Layer 1（Markdown/Skills）** | ⭐⭐⭐⭐⭐ 高 | 成本极低、覆盖 NocoBase 大部分真实场景、立即可用 |
| **Layer 2（pgvector RAG）** | ⭐⭐⭐ 中 | 接口已就绪、价值闭环短，但单独做质量平平 |
| **Layer 3（Contextual RAG 升级）** | ⭐⭐⭐ 中长期 | 是 Layer 2 的"质量补丁"，应在 L2 跑通且有真实数据后再做 |
| **Layer 4（Agent Memory）** | ⭐⭐ 低（本期） | 场景错配，应作为独立"AI 员工记忆"特性单独立项 |

**关键判断**：
> NocoBase 的 `KnowledgeBaseFeature` 接口把"知识库"单一地建模为"向量检索 + 相似度返回"，反映的是 2023–2024 的技术共识；按 2026 视角看，它是路径 A 的专属接口，**覆盖不到 C/D 两类高价值场景**。

**含义**：
1. **只做 Layer 2**：约 8 人日，但只能覆盖企业知识需求的一个子集（粗略 30–50%），且对"如何配置""怎么操作"这类高频问题效果不佳。
2. **更大的价值在 Layer 1**：NocoBase AI 员工的"知识"很大概率是"平台使用规则、业务流程、表单字段含义" —— 正是 Markdown/Skills 模式的甜区。
3. **Layer 2 仍是必需**：企业一定会有"几百份 PDF 合同/产品手册"的场景，没有向量库就是不行。

### A.4 推荐策略：分层知识，而非"RAG or Not"

不应把需求简化成"做不做 RAG"，而应表述为 **"为 AI 员工构建分层知识系统"**：

```
┌──────────────────────────────────────────────┐
│ Layer 1: 静态规则知识（Markdown / Skills）     │  ← 优先做，1-2 人日
│   - 平台规则、SOP、字段语义、操作手册           │
│   - 实现：扩展 aiEmployees 加 markdownKB 字段  │
├──────────────────────────────────────────────┤
│ Layer 2: 文档检索知识（向量 RAG）              │  ← 已有接口，约 8 人日
│   - 大量 PDF / Word / 内部 wiki                │
│   - 实现：plugin-ai-rag-pgvector               │
├──────────────────────────────────────────────┤
│ Layer 3: 检索增强（Contextual + Rerank）       │  ← 长期，按需
│   - 仅在 Layer 2 召回质量不达标时启用           │
├──────────────────────────────────────────────┤
│ Layer 4: Agent Memory（未来）                 │  ← 独立项目
│   - 用户偏好、对话历史、个性化                  │
└──────────────────────────────────────────────┘
```

### A.5 落地顺序

1. **先做 Layer 1（Markdown/Skills 知识）** —— 投入小（1–2 人日）、覆盖 NocoBase 高频场景、立竿见影。
2. **再做 Layer 2（pgvector RAG）** —— 覆盖海量文档场景，让 `KnowledgeBaseFeature` 接口真正活起来。
3. **Layer 3 / Layer 4 视真实使用反馈再决定** —— 避免在没数据时就上 Contextual Retrieval / Memory。

### A.6 结论

**单独实施传统 RAG（Layer 2）的现实意义是"中等且必要，但远不充分"。**

- **必要性**：企业一定有海量非结构化文档场景，接口层已就绪、不做就浪费了已有的抽象。
- **不充分性**：(a) 传统 RAG 召回质量已被 Contextual Retrieval 显著超越；(b) 大量"知识"本质是规则/SOP，更适合 Markdown 直注入；(c) Agent Memory 覆盖了 RAG 触达不到的个性化场景。**只做 Layer 2 会让你拿到一个"看起来能用、但用户很快会发现不够好用"的知识库**。

> **一句话总结**：RAG 不是不要做，而是不该作为"知识库"的唯一形态来做。本文档 v2 已据此把 Layer 1 提到优先位置。

### A.7 参考来源

- [Contextual Retrieval in AI Systems — Anthropic](https://www.anthropic.com/engineering/contextual-retrieval)
- [Agentic RAG: How enterprises are surmounting the limits of traditional RAG — Redis](https://redis.io/blog/agentic-rag-how-enterprises-are-surmounting-the-limits-of-traditional-rag/)
- [RAG vs Markdown for Knowledge Bases (Karpathy) — LinkedIn](https://www.linkedin.com/posts/jake-norcross-6319b012a_andrej-karpathy-has-been-talking-about-using-activity-7449520390974070785-28Xk)
- [AI Agent Memory: When Markdown Files Are All You Need — Dev.to](https://dev.to/imaginex/ai-agent-memory-management-when-markdown-files-are-all-you-need-5ekk)
- [Vector Databases Are Not Knowledge Management — Medium](https://medium.com/predict/vector-databases-are-not-knowledge-management-c3d5f4b428ff)
- [LLM Wiki vs RAG: A Decision Framework — MindStudio](https://www.mindstudio.ai/blog/llm-wiki-vs-rag-knowledge-base)
- [Long-Term Memory for AI Agents — Mem0](https://mem0.ai/blog/long-term-memory-ai-agents)
- [State of AI Agent Memory 2026 — Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Best AI Agent Memory Systems in 2026 — Vectorize](https://vectorize.io/articles/best-ai-agent-memory-systems)
- [Best Enterprise RAG Platforms for 2026 — Onyx](https://onyx.app/insights/enterprise-rag-platforms-2026)
- [Agentic AI is the wrong architecture for enterprise BI — ResearchGate](https://www.researchgate.net/post/Agentic_AI_is_the_wrong_architecture_for_enterprise_BI-and_RAG_is_why)
- [From BM25 to Corrective RAG: Benchmarking Retrieval Strategies — arXiv](https://arxiv.org/html/2604.01733v1)
