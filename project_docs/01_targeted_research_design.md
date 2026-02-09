# 01 - Targeted Research & Batch Realization 设计文档

> **Last Updated**: 2026-02-09
> **Status**: Draft → Review Incorporated

## 1. 功能概述
目前研究流程（Research V2）主要基于大趋势进行"被动发现"。本项目旨在引入"目标导向型调研"（Targeted Research），允许用户输入特定需求锚点，系统围绕该锚点进行多维度调研并产出具有关联标签的 Idea 集合，支持后续的批量化实现。

### 1.1 与 Research V2 的关系
Targeted Research 与现有 Research V2 共享大部分 pipeline 骨架（search → fetch → ideate → critique），差异仅在 query 生成策略和打标逻辑。为避免重复代码，应从现有 `planner_research.mjs` 抽取 **`research_pipeline.mjs` 基础流程层**，两种模式分别提供差异化的 query planner 和 tagger（详见 §6.3）。

## 2. 核心架构

### 2.1 输入层 (Input Anchor)
- **需求锚点**：用户在 Hub UI 输入一段具体描述（例如：“针对独立摄影师的后期资产维护工具”）。
- **参数控制**：
  - `Topic`: 核心主题。
  - `Creative Level`: 交叉创新的程度（0.0 - 1.0）。
  - `Batch Count`: 希望生成的 Idea 数量（默认 6 个）。
### 2.1.1 通过生成多样性实现需求精炼 (Refinement by Selection)

> **核心洞察**：用户输入的 topic 往往是模糊的、过大的、或带有未经验证的假设。但增加一轮"对话精炼"会引入摩擦，且用户未必能提前回答好那些问题。**更好的方式是：让生成的 ideas 本身就覆盖不同假设、不同切入点、不同范围粒度，让用户通过"选择什么、不选什么"自然完成精炼。**

#### 设计原则：筛选即精炼
- 用户不需要事先回答"你确定独立摄影师是主要群体吗？"——系统直接生成一个面向婚庆摄影师的 idea、一个面向商业摄影师的、一个面向业余爱好者的。用户选了哪个，答案就出来了。
- 用户不需要事先区分 must-have 和 add-later——系统生成的 ideas 有的只做元数据编辑（小切口），有的做全流程平台（大范围）。用户的选择自然揭示了他们想要的范围。

#### 多视角生成策略 (Perspective-Diverse Ideation)
在 `phaseIdeate` 中，不再生成 N 个"同质化的变体"，而是**按预设维度强制分散**：

| 维度 | 说明 | 示例（摄影师资产维护） |
|------|------|----------------------|
| **范围梯度** | 小切口 MVP → 中型产品 → 全平台 | "批量 EXIF 编辑器" → "项目级资产管理" → "摄影工作室全流程平台" |
| **用户假设** | 挑战原始 topic 的隐含假设 | "面向婚庆摄影师" / "面向产品摄影师" / "面向 UGC 内容创作者" |
| **交互模式** | 偏视觉 / 偏效率 / 偏自动化 | "可视化看板管理" / "CLI 批处理工具" / "AI 自动归档助手" |
| **商业模式** | 免费工具 / SaaS / 一次付费 | 影响功能边界和目标用户 |

生成 prompt 中注入 **Perspective Slots**（视角槽位），要求 LLM 在 N 个 idea 中至少覆盖 3 种维度的差异：

```
你需要生成 {count} 个 idea，它们必须在以下维度上体现差异：
- 至少 2 个不同的范围粒度（一个小切口 MVP，一个更完整的产品）
- 至少 2 个不同的用户假设（挑战原始 topic 的隐含假设）
- 至少 2 个不同的交互模式

每个 idea 标注其 perspective_tags：["scope:mvp", "user:wedding-photographer", "interaction:visual"]
```

#### Idea 级别新增字段

每个 idea 增加 `perspectiveTags` 字段，标注该 idea 在多视角维度中的位置：

```json
{
  "id": "...",
  "title": "婚庆摄影师 EXIF 批量编辑器",
  "perspectiveTags": ["scope:mvp", "user:wedding-photographer", "interaction:cli"],
  "challengesOriginal": "原始 topic 假设'资产维护'是核心痛点，但婚庆摄影师更大的痛点可能是交付效率"
}
```

- `perspectiveTags`：结构化标签，标识该 idea 的视角定位（前端可用于分组展示/筛选）
- `challengesOriginal`：该 idea 对原始 topic 的隐含挑战（展示在 idea 卡片上，帮助用户反思）

#### 用户筛选行为的反馈闭环
用户在同一 campaign 下的选择行为（选中哪些 idea、过滤掉哪些）本身就是高价值信号。可用于：

1. **即时价值**：被选中的 ideas 进入批量构建队列。
2. **中期价值**：如果用户在同一 topic 上发起第二轮 Research（"追加调研"），可以把上一轮的筛选结果作为上下文注入——"用户偏好小切口 MVP + CLI 交互模式，请在这个方向上深挖"。
3. **长期价值**：跨 campaign 的选择偏好（如用户总是选 `scope:mvp`）可以调整默认的 `Creative Level` 和范围分布。

> **MVP 范围**：MVP 阶段只做 ①（生成多视角 ideas，带 perspectiveTags）。② 和 ③ 作为后续迭代，无需在首版实现。
### 2.2 逻辑层 (Targeted Crawler & Ideation)
- **精准 Query 生成**：
  - 调用 LLM 将 Topic 拆解为 4-6 个搜索指令。
  - 指令涵盖：[技术现状]、[竞品痛点]、[跨界交互灵感]、[垂直领域边缘 Case]。
  - **多语言搜索策略**：中文 topic 同时生成中文 + 英文 query（英文搜索结果通常质量更高、覆盖面更广）。通过 `config.searchLangs`（默认 `['zh-CN', 'en']`）控制。
- **上下文组装 (Context Building)**：
  - 设定总 context token 预算（默认 8000 tokens）。
  - 按 source 数量平均分配，超长文本做截断（保留开头 + 结尾，中间常是广告/导航）。
- **上下文打标 (Tagging)**：
  - 为该批次所有产出的 Idea 注入唯一的 `campaignId` 和 `topicTag`。
  - Idea 格式中增加 `originalAnchor` 字段，记录原始需求。

### 2.3 展现层 (Hub UI Enhancement)
- **分组视图**：在 Backlog 页面支持按 `Topic Tag` 分组浏览。
- **批量操作**：
  - 勾选同一分组下的多个 Idea。
  - “一键导出/批量构建”：将 Idea 批量发送至 Aider 任务队列。

## 3. 脚本改造细节 (`planner_research.mjs`)
- **新增模式**：`Mode: TARGETED`。
- **Prompts 调整**：
  - `phaseBroaden`: 停止使用随机组合分类，改为围绕 `Topic` 生成深度 Query。
  - `phaseIdeate`: 强化**多视角分散生成**（Perspective-Diverse Ideation）：
    - 在 prompt 中注入 **Perspective Slots**，要求 LLM 在 N 个 idea 中覆盖至少 3 种维度差异（范围梯度、用户假设、交互模式）。
    - 每个 idea 必须附带 `perspectiveTags` 和 `challengesOriginal` 字段。
    - 明确禁止生成"同一个 idea 的微调变体"——要求每个 idea 在至少一个维度上有本质差异。
  - `phaseCritique`: 在打分维度中新增 **diversity_score**，惩罚与同 campaign 中已有 idea 过于相似的候选。

## 4. 数据结构变更
为了让“集合”在 Idea 列表与 AppHub 项目列表中都能成为第一等公民，建议引入 **Campaign（集合/专题/批次）**。

### 4.1 Idea 级字段（用于分组/过滤/状态）
在 `idea_backlog.json`（以及 `idea_filtered.json`）中，每个 Idea 增加字段：

```json
{
  "id": "...",
  "title": "...",

  "campaignId": "camp_20260206T1200_a3f2",
  "topicTag": "摄影师资产维护",
  "isTargeted": true,
  "originalAnchor": "针对独立摄影师的资产维护工具",

  "status": "new",
  "build": {
    "projectId": null,
    "lastError": null,
    "queuedAt": null,
    "startedAt": null,
    "finishedAt": null
  }
}
```

字段说明：
- `campaignId`：**技术标识符**，格式 `camp_{timestamp}_{shortHash}`（如 `camp_20260206T1200_a3f2`），由 `originalAnchor` 文本的 hash 前 4 位 + 时间戳组成。不做 pinyin slugify，避免引入额外依赖和多音字不稳定问题。
- `topicTag`：**人类可读的过滤标签**（直接使用中文或用户自定义短标签，如"摄影师资产维护"），用于搜索与跨集合聚合。
- `status`：用于批量生成进度展示（`new | queued | running | built | failed | skipped`）。
- `build.projectId`：生成成功后写入，用于从 Idea 跳转到 AppHub 项目。

#### 4.1.1 Status 状态机
Idea 的 `status` 字段遵循以下状态转换规则（非法转换应被拒绝）：

```
new → queued → running → built
                       → failed → queued (retry)
new → skipped
```

- **防御性校验**：在 `json_contract.mjs` 中增加 `normalizeIdeaStatus(currentStatus, targetStatus)` 验证函数，与现有 `normalizeIdea` 模式一致。
- **retry 场景**：`failed → queued` 是唯一允许"回退"的路径，触发时应重置 `build.lastError` 记录但保留历史。

### 4.2 Campaign 元数据（用于集合卡片展示）
新增：**`packages/engine/runtime/data/campaigns.json`**（与 `idea_backlog.json` 同目录）。选择 engine runtime 而非 hub labRuntime 的理由：engine 是数据的生产者，campaign 在 research pipeline 中创建；hub 作为消费者通过 API 读取即可，避免两处维护的同步问题。

```json
{
  "updatedAt": "...",
  "campaigns": [
    {
      "campaignId": "camp_...",
      "topicTag": "摄影师资产维护",
      "title": "摄影师资产维护",
      "originalAnchor": "...",
      "createdAt": "...",
      "options": { "creative": 0.6, "count": 6, "lang": "zh-CN" },
      "stats": { "total": 6, "built": 0, "failed": 0, "running": 0 },
      "perspectiveConfig": {
        "dimensions": ["scope", "user", "interaction"],
        "selectionSignals": []
      }
    }
  ]
}
```

说明：
- 仅靠 Idea 级字段也能分组，但 Campaign 元数据可以让 UI 更“像一个集合”（有标题、参数、统计）。
- `stats` 可由后端按 backlog 动态汇总，也可在写入时顺便维护（推荐动态汇总以避免状态漂移）。

### 4.3 AppHub 项目侧的关联（让产物也能按集合显示）
要在 AppHub（项目/卡片列表）中按集合呈现，必须把 `campaignId/topicTag` 传播到“项目元数据”。建议：

- 在项目生成时，将 `campaignId/topicTag/originalAnchor/ideaId` 写入项目的 `README.md`（前置 metadata 区块）或写入项目的 `manifest.json`（如果项目侧有）。
- Hub 在构建/索引 `manifest.json` 时，将这些字段带入条目中（至少 `campaignId` 和 `topicTag`）。

这样 AppHub 才能做到：
- 项目卡片显示 `topicTag` badge
- 侧边栏/顶部提供 “Collections (Campaigns)” 过滤
- 点击某 campaign 展示该 campaign 下所有已构建项目

## 5. 开发路线图
1. [ ] 先做"纯函数模块"与契约（tag/hash、入参校验、idea 打标、perspective slots 定义）。
2. [ ] **从 `planner_research.mjs` 抽取 `research_pipeline.mjs` 复用层**（确保 V2 不 break）。
3. [ ] 在脚本侧支持 `--topic "..."` / `--creative` / `--count` 等参数，并能落盘到 backlog（带标签 + perspectiveTags）。
4. [ ] 将网络/LLM/FS 依赖做成可注入的 provider，以便单测与离线回放。
5. [ ] Hub 后端增加 `/api/idea/research/targeted` 接口（返回 campaignId + ideas 预览）。
6. [ ] Hub 前端增加"深度调研"入口：输入 Topic + 选项，支持按标签/视角分组与批量选择。
7. [ ] 批量实现：将选中的 ideas 发送到生成/构建队列（可先做"导出 JSON/生成任务清单"作为 MVP）。

## 5.1 针对用户的两个关键问题：推荐解决方案

### Q1：如何在 Idea 和 AppHub 中“视觉上显示成一个集合”？
推荐：引入 **Campaign 视图**（集合卡片 + 展开列表）。

**Idea 侧（Backlog/Filtered）**
- 默认按 `campaignId` 分组渲染（可折叠）。
- 每个 campaign 卡片展示：
  - `title/originalAnchor`（标题）
  - `topicTag` badge
  - 统计：`total/built/failed/running`
  - 快捷操作：`批量生成` / `导出` / `重新Research` / `归档`

**AppHub 侧（Projects）**
- 项目卡片显示 `topicTag` badge。
- 新增 “Collections” 过滤维度：选择某 campaign 后，只显示其下项目。
- 从 Idea 行可直接跳转到对应 `projectId` 的项目卡片（前提：build 写回 projectId）。

### Q2：如何在生成时，对这个集合进行批量生成？
推荐：**后端队列化 Batch Job**（可恢复、可观察、可暂停、默认串行）。

核心原则：
- **默认并发=1**（避免同时写 runtime/data、生成多个项目目录导致冲突；稳定后再考虑并发=2）。
- **可恢复**：任何中断（Hub 重启/网络抖动）都能从 job 状态继续。

数据结构建议：新增 `packages/engine/runtime/data/batch_jobs.json`（与 backlog 同目录）：

```json
{
  "updatedAt": "...",
  "jobs": [
    {
      "jobId": "job_...",
      "campaignId": "camp_...",
      "createdAt": "...",
      "concurrency": 1,
      "items": [
        { "ideaId": "...", "status": "queued", "projectId": null, "error": null }
      ],
      "status": "running"
    }
  ]
}
```

> **设计决策：状态驱动而非 cursor 索引**
> 原方案使用 `cursor` 指针追踪进度，但如果 idea 被用户中途删除或状态被外部修改，cursor 会错位。改为**状态驱动**：runner 每次取 `items` 中第一个 `status === 'queued'` 的 item 执行。这天然支持：
> - 用户中途移除某个 item
> - 手动跳过某个 item（设为 `skipped`）
> - 失败重试（把 `failed` 改回 `queued`）

#### Job 级状态机
```
pending → running → done
                  → paused → running (resume)
running → cancelled
```
- **`paused`**：用户可暂停正在运行的 batch job，runner 在每次取下一个 item 前检查 job 状态。
- **`cancelled`**：终止 job，已完成的 item 保留结果。

#### 与现有 `build_status.json` 的关系
Batch runner 本质是"依次触发单次构建"的调度器。每个 item 的构建仍复用现有 `idea_prioritize` → `build_status` 流程，而非另建并行的构建机制。

运行逻辑（概念层）：
1. UI 选择某 campaign（或其下若干 ideas）点击“批量生成”
2. Hub API 创建 job，并把涉及的 idea 标记为 `queued`
3. runner 状态驱动执行：
   - 取第一个 `status === 'queued'` 的 item
   - `queued → running → built/failed`
   - 成功则写回 `idea.build.projectId` + 写入项目 metadata（带 campaignId）
   - 每轮执行前检查 job 级状态（是否 `paused` / `cancelled`）
4. 所有 item 处理完毕后：`job.status = done`，campaign 统计自动体现

### 5.2 Hub UI 性能与实时反馈

#### Campaign 视图渲染性能
随着 campaigns 数量增长（几十个 campaign，每个 6-12 个 idea），需注意渲染性能：
- 默认折叠 campaign 卡片，只展示标题 + 统计摘要
- 当 idea 总量 > 200 时考虑虚拟滚动（如 `react-virtual`）

#### 批量生成的实时进度推送
建议 Hub 实现 **SSE（Server-Sent Events）** 推送 batch job 进度（而非轮询），降低服务器压力并提供即时反馈：
- 每个 item 展示：`队列中 → 生成中(spinner) → 完成(绿) / 失败(红+重试按钮)`
- SSE 端点建议：`GET /api/batch/events?jobId=xxx`
- 断线自动重连（EventSource 原生支持）

## 6. 模块化拆分（建议的代码边界）
目标：把“目标导向 Research”做成可组合的 pipeline，每一步都能被单独测试/替换（尤其是网络与 LLM）。

### 6.1 目录与模块建议
建议在 `packages/engine/core/modules/` 下引入独立子模块（示例名）：

- `targeted_research/`
  - `index.mjs`：组装 pipeline（脚本入口可复用现有 `planner_research.mjs` 的主流程）
  - `config.mjs`：解析 CLI 参数与默认值（topic/creative/count/lang）
  - `campaign.mjs`：campaignId 生成（timestamp + shortHash，不依赖 pinyin），topicTag 管理，以及元数据结构
  - `perspective_slots.mjs`：多视角生成的维度定义与 prompt 模板（范围梯度、用户假设、交互模式、商业模式），纯函数
  - `query_planner.mjs`：把 topic 拆解为多维 query（含多语言搜索策略：中文 topic 同时生成 zh-CN + en query）
  - `search_provider.mjs`：Brave Search 适配层（纯接口 + 具体实现）
  - `source_selector.mjs`：候选结果筛选（LLM 选择 + 失败回退规则）
  - `page_fetcher.mjs`：抓取与文本抽取（timeout、html strip、长度裁剪）
  - `context_builder.mjs`：把 sources + page content 拼成 researchContext（token 预算管理：默认 8000 tokens，按 source 数量平均分配，超长文本保留首尾截断中间）
  - `idea_generator.mjs`：根据 researchContext 生成 draft ideas（LLM）
  - `idea_critic.mjs`：反思/过滤（LLM）
  - `tagging.mjs`：为 ideas 注入 `topicTag/isTargeted/originalAnchor/campaignId` 等字段（纯函数）
  - `persistence.mjs`：落盘（trends_report、idea_sources、idea_backlog），封装 fs

> 关键原则：
> - **纯函数优先**（tagging/slugify/parseArgs/mergeBacklog）。
> - **副作用集中**（网络、LLM、写文件集中在 provider/persistence）。
> - **可注入依赖**（测试时替换为 mock provider）。

### 6.2 Provider 接口（为了测试与可替换）
建议把以下依赖抽象成接口对象（通过参数传入 pipeline），避免在深层模块里直接 `fetch/fs/Date.now/Math.random`：

- `llm.complete(prompt, opts)` → 返回 `string`，超时/配额耗尽抛 `LlmError`
- `search.web(query)` → 返回 `{ results: Array<{title, url, description}> }`，网络失败抛 `SearchError`
- `fetcher.readText(url)` → 返回 `string | null`（失败返回 null 降级到 description）
- `store.readJson(path)` / `store.writeJson(path, data)` / `store.writeText(path, text)` → 文件锁失败抛 `StoreError`
- `clock.now()` → 返回 `string`（ISO 格式）
- `rng.id()` → 返回 `string`（或统一由 `campaignId`+序号派生，减少随机性）

> **Provider 错误契约**：每个 provider 应明确定义成功/失败的返回结构和超时行为。建议统一约定：网络类 provider 超时返回 null（由调用方降级处理），LLM 类 provider 超时抛异常（由 `callWithRetry` 处理重试）。

这样做的直接收益：
- 单测无需真实网络/真实 Key。
- 可以做"离线回放"（把某次跑出来的 sources/context 保存为 fixture，后续只跑 ideate/reflect）。

### 6.3 Pipeline 复用层（Targeted Research 与 Research V2 共享）
为避免 Targeted Research 与现有 Research V2 产生大量重复代码（search → fetch → ideate → critique 的骨架完全相同），建议抽取 `research_pipeline.mjs` 作为基础流程层：

```
research_pipeline.mjs (共享骨架)
├── queryPhase(queryPlanner)    ← 由调用方注入差异化的 query 生成逻辑
├── searchPhase(searchProvider)
├── fetchPhase(fetcher)
├── contextPhase(contextBuilder)
├── ideatePhase(ideaGenerator)  ← Targeted 模式注入 perspective slots，强制多视角分散
├── critiquePhase(ideaCritic)
└── persistPhase(tagger, persistence)  ← 由调用方注入差异化的打标逻辑
```

- `planner_research.mjs`（V2，趋势驱动）：注入随机组合分类的 queryPlanner + 无 campaign 标签的 tagger
- `targeted_research/index.mjs`：注入锚点约束的 queryPlanner + perspective slots 多视角 ideaGenerator + campaign 打标的 tagger

> **实施建议**：在 MVP-0.5 阶段（见 §8），先从现有 `planner_research.mjs` 抽取此基础层，确保 V2 不被 break，再在此基础上叠加 Targeted 模式。

## 7. TDD 策略（基于当前仓库工具链）
当前仓库没有引入测试框架（根 `package.json` 仅有 lint/husky；`@openclaw/engine` 也只有 eslint）。因此建议优先使用 **Node 内置测试运行器**（`node:test` + `node:assert/strict`），避免先引入额外依赖导致工作量膨胀。注意统一使用 `assert/strict` 而非 `assert`，避免 loose equality 的坑。

### 7.1 测试金字塔
1. **单元测试（优先）**：覆盖纯函数与失败回退逻辑。
2. **契约测试（中）**：对 provider 的输入输出约定（例如 search 返回结构、source_selector 的 JSON 解析规则）。
3. **集成测试（少量）**：用 mock provider 跑完整 pipeline，验证落盘结构与打标。

### 7.2 建议的首批测试用例（先写测试再写实现）
#### A. campaign/tag 纯函数
- `buildCampaignId(topic, clock)` → `"camp_20260206T1200_a3f2"`（格式：`camp_{timestamp}_{shortHash}`，hash 由 topic 文本派生，测试可固定 clock）
- `buildTopicTag(topic)` → 人类可读的中文短标签（可选：用户自定义覆盖）

#### B. 入参解析与默认值
- 无 topic：应抛错/返回可读错误
- creative/count 边界：creative clamp 到 [0,1]，count clamp 到 [3,12]

#### B2. perspective_slots 生成与校验
- 给定 count=6，验证 prompt 中注入了至少 3 个维度的 Perspective Slots
- `parsePerspectiveTags(rawTags)` → 归一化标签格式（`dimension:value`），过滤无效标签
- LLM 返回的 ideas 未包含 `perspectiveTags`：回退为空数组（不阻塞流程）
- LLM 返回的 ideas 全部同一视角（如都是 `scope:mvp`）：在 critique 阶段被 diversity_score 惩罚

#### C. source_selector 的鲁棒性
- LLM 返回非法 JSON：回退到 `[0,1]`
- LLM 返回越界索引：过滤掉无效索引

#### D. tagging 与落盘 merge
- 给定 ideas 数组：应注入 `topicTag/isTargeted/originalAnchor/campaignId`
- backlog merge：相同 id 不重复插入；或采用 `campaignId + index` 做 id，保证稳定

#### E. pipeline 集成（全 mock）
- mock search 返回固定 4 个结果，mock fetcher 返回固定文本，mock llm 返回固定 ideas JSON
- 断言：写入 `idea_backlog.json` 中新增 ideas 均带 topicTag；`idea_sources.json` 包含来源；trends report 写入成功

### 7.3 关于网络与 LLM 的测试隔离
建议默认 **不做真实联网测试**（CI/本地都不稳定）。

- 网络抓取：用 `fetcher` 注入，测试用 fixture 文本代替
- LLM：用 `llm` 注入，测试用固定返回（或基于“录制回放”文件）
#### 录制回放（Replay Fixture）方案
为了让集成测试无需真实联网/LLM 调用，建议实现"录制回放"机制：
- 在 `targeted_research/fixtures/` 下保存 JSON fixture 文件
- 每个 fixture 命名为 `{test_case_name}.{provider}.json`（如 `photographer_asset.search.json`）
- 提供一个 `createReplayProvider(fixturePath)` 工厂函数，根据 fixture 文件创建 mock provider
- 开发时可先用真实 provider 跑一次，自动保存结果为 fixture，后续测试直接回放
## 8. 迭代切片（按可交付的 MVP 分阶段）
为避免一次性改动过大，建议按以下顺序交付：

1. **MVP-0：纯函数 + 测试先行**
  - 完成 `campaign/tagging/parseArgs/perspectiveSlots` 与对应单测
  - 使用 `node:test` + `node:assert/strict`
2. **MVP-0.5：Pipeline 复用层抽取**
  - 从现有 `planner_research.mjs` 抽取 `research_pipeline.mjs` 基础流程层
  - 确保 Research V2 在重构后行为不变（回归测试）
  - 将网络/LLM/FS 依赖做成可注入的 provider（见 §6.2）
3. **MVP-1：脚本可用（本地手动跑）**
  - `node planner_research.mjs --mode targeted --topic "..."`
  - 能写入 backlog，并带 topicTag/campaignId + perspectiveTags
4. **MVP-2：Hub API + 前端输入**
  - `/api/idea/research/targeted`：接收 topic + 选项，启动调研
  - 前端 idea 卡片展示 perspectiveTags 标签 + challengesOriginal 提示
  - 支持按视角维度筛选/分组（如"只看 scope:mvp 的 ideas"）
  - 前端分组展示可用最简实现（不做批量构建，只做生成与分组展示）
  - 进度推送采用 **SSE（Server-Sent Events）**（见 §5.2）
5. **MVP-3：批量实现工作流**
  - "导出任务清单/队列"优先于直接并发生成，避免资源争用与失败重试复杂度
  - 实现 batch job 状态驱动 runner（见 §5.1 Q2）

## 9. 超时与稳定性（与 Research V2 共存）
Targeted Research 的典型耗时更长（topic 更深，context 更大）。建议：

- 单次 LLM：保留较宽松 timeout（例如 120s），并在日志中记录每次调用耗时
- 总流程：保持 10 分钟级别的 runner 超时，并提供阶段性进度输出（便于 Hub 展示）
- 失败策略：
  - 抓取失败：降级为使用 description/摘要
  - 反思失败：回退 draft ideas

## 10. 事项与已知遗漏

以下是设计审查中识别出的需要在实施前明确的问题：

### 10.1 Campaign 生命周期管理
- **归档/清理策略**：超过 90 天且所有 idea 已 built/skipped 的 campaign 自动标记为 `archived`，归档后从默认视图中隐藏但保留数据。
- **幂等性**：如果用户对同一 topic 多次执行 targeted research，**建议默认创建新 campaign**（每次调研的时间点和上下文不同），但可在 UI 提供"追加到已有 campaign"选项。

### 10.2 错误通知
- Batch job 中某个 item 失败时，除了状态标记，MVP 阶段仅在 Hub UI 中标红展示，后续可扩展为 Hub 顶部通知条 / 浏览器 Notification。

### 10.3 与 RAG 去重的交互
- Targeted research 生成的 idea 是否也要过 `rag_dedupe.mjs`？
- **仍然过 RAG 去重**，但需考虑同一 topic 下的 idea 天然相似度更高。可能需要：
  - 对同一 campaign 内的 idea 之间适当降低去重阈值（如从 0.72 降到 0.85）
  - 或在 targeted 模式下，仅与 campaign 外的已有 idea 做去重（campaign 内的差异化由 idea_critic 保证）

### 10.4 并发控制的演进
- MVP 阶段 `concurrency = 1`，但需预留并发 > 1 的扩展路径
- 并发 > 1 时需要解决的问题：`build_status.json` 的锁竞争、outputs 目录的命名冲突、LLM API 速率限制
-在 batch job item 级别增加 `workerId` 字段，为未来并发做准备
