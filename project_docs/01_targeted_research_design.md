# 01 - Targeted Research & Batch Realization 设计文档

## 1. 功能概述
目前研究流程（Research V2）主要基于大趋势进行“被动发现”。本项目旨在引入“目标导向型调研”（Targeted Research），允许用户输入特定需求锚点，系统围绕该锚点进行多维度调研并产出具有关联标签的 Idea 集合，支持后续的批量化实现。

## 2. 核心架构

### 2.1 输入层 (Input Anchor)
- **需求锚点**：用户在 Hub UI 输入一段具体描述（例如：“针对独立摄影师的后期资产维护工具”）。
- **参数控制**：
  - `Topic`: 核心主题。
  - `Creative Level`: 交叉创新的程度（0.0 - 1.0）。
  - `Batch Count`: 希望生成的 Idea 数量（默认 6 个）。

### 2.2 逻辑层 (Targeted Crawler & Ideation)
- **精准 Query 生成**：
  - 调用 LLM 将 Topic 拆解为 4-6 个搜索指令。
  - 指令涵盖：[技术现状]、[竞品痛点]、[跨界交互灵感]、[垂直领域边缘 Case]。
- **上下文打标 (Tagging)**：
  - 为该批次所有产出的 Idea 注入唯一的 `campaign_id` 或 `topic_tag`。
  - Idea 格式中增加 `context_anchor` 字段，记录原始需求。

### 2.3 展现层 (Hub UI Enhancement)
- **分组视图**：在 Backlog 页面支持按 `Topic Tag` 分组浏览。
- **批量操作**：
  - 勾选同一分组下的多个 Idea。
  - “一键导出/批量构建”：将 Idea 批量发送至 Aider 任务队列。

## 3. 脚本改造细节 (`planner_research.mjs`)
- **新增模式**：`Mode: TARGETED`。
- **Prompts 调整**：
  - `phaseBroaden`: 停止使用随机组合分类，改为围绕 `Topic` 生成深度 Query。
  - `phaseIdeate`: 强化“锚点约束”，确保所有 Idea 解决的是同一个核心问题，但提供不同的交互视角（例如：一个偏视觉，一个偏效率，一个偏自动化）。

## 4. 数据结构变更
在 `idea_backlog.json` 中，每个 Idea 将增加以下字段：
```json
{
  ...
  "topicTag": "photographer-asset-2026",
  "isTargeted": true,
  "originalAnchor": "针对独立摄影师的资产维护工具"
}
```

## 5. 开发路线图
1. [ ] 先做“纯函数模块”与契约（tag/slug、入参校验、idea 打标）。
2. [ ] 在脚本侧支持 `--topic "..."` / `--creative` / `--count` 等参数，并能落盘到 backlog（带标签）。
3. [ ] 将网络/LLM/FS 依赖做成可注入的 provider，以便单测与离线回放。
4. [ ] Hub 后端增加 `/api/idea/research/targeted` 接口（返回 campaignId + ideas 预览）。
5. [ ] Hub 前端增加“深度调研”入口：输入 Topic + 选项，支持按标签分组与批量选择。
6. [ ] 批量实现：将选中的 ideas 发送到生成/构建队列（可先做“导出 JSON/生成任务清单”作为 MVP）。

## 6. 模块化拆分（建议的代码边界）
目标：把“目标导向 Research”做成可组合的 pipeline，每一步都能被单独测试/替换（尤其是网络与 LLM）。

### 6.1 目录与模块建议
建议在 `packages/engine/core/modules/` 下引入独立子模块（示例名）：

- `targeted_research/`
  - `index.mjs`：组装 pipeline（脚本入口可复用现有 `planner_research.mjs` 的主流程）
  - `config.mjs`：解析 CLI 参数与默认值（topic/creative/count/lang）
  - `campaign.mjs`：campaignId/topicTag 生成（slugify + 时间戳），以及元数据结构
  - `query_planner.mjs`：把 topic 拆解为多维 query（含语言混合策略）
  - `search_provider.mjs`：Brave Search 适配层（纯接口 + 具体实现）
  - `source_selector.mjs`：候选结果筛选（LLM 选择 + 失败回退规则）
  - `page_fetcher.mjs`：抓取与文本抽取（timeout、html strip、长度裁剪）
  - `context_builder.mjs`：把 sources + page content 拼成 researchContext（可控上限）
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

- `llm.complete(prompt, opts)`
- `search.web(query)`
- `fetcher.readText(url)`
- `store.readJson(path)` / `store.writeJson(path, data)` / `store.writeText(path, text)`
- `clock.now()`
- `rng.id()`（或统一由 `campaignId`+序号派生，减少随机性）

这样做的直接收益：
- 单测无需真实网络/真实 Key。
- 可以做“离线回放”（把某次跑出来的 sources/context 保存为 fixture，后续只跑 ideate/reflect）。

## 7. TDD 策略（基于当前仓库工具链）
当前仓库没有引入测试框架（根 `package.json` 仅有 lint/husky；`@openclaw/engine` 也只有 eslint）。因此建议优先使用 **Node 内置测试运行器**（`node:test`），避免先引入额外依赖导致工作量膨胀。

### 7.1 测试金字塔
1. **单元测试（优先）**：覆盖纯函数与失败回退逻辑。
2. **契约测试（中）**：对 provider 的输入输出约定（例如 search 返回结构、source_selector 的 JSON 解析规则）。
3. **集成测试（少量）**：用 mock provider 跑完整 pipeline，验证落盘结构与打标。

### 7.2 建议的首批测试用例（先写测试再写实现）
#### A. campaign/tag 纯函数
- `slugify("独立摄影师 资产维护") -> "du-li-she-ying-shi-zi-chan-wei-hu"`（或至少保证：全小写、无空格、仅 `[a-z0-9-]`，并对中文有稳定策略）
- `buildTopicTag(topic, clock)` 输出稳定且可预测（测试可固定时间）

#### B. 入参解析与默认值
- 无 topic：应抛错/返回可读错误
- creative/count 边界：creative clamp 到 [0,1]，count clamp 到 [3,12]

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

## 8. 迭代切片（按可交付的 MVP 分阶段）
为避免一次性改动过大，建议按以下顺序交付：

1. **MVP-0：纯函数 + 测试先行**
  - 完成 `campaign/tagging/parseArgs` 与对应单测
2. **MVP-1：脚本可用（本地手动跑）**
  - `node planner_research.mjs --mode targeted --topic "..."`
  - 能写入 backlog，并带 topicTag/campaignId
3. **MVP-2：Hub API + 前端输入**
  - 提供手动触发入口（不做批量构建，只做生成与分组展示）
4. **MVP-3：批量实现工作流**
  - “导出任务清单/队列”优先于直接并发生成，避免资源争用与失败重试复杂度

## 9. 超时与稳定性（与 Research V2 共存）
Targeted Research 的典型耗时更长（topic 更深，context 更大）。建议：

- 单次 LLM：保留较宽松 timeout（例如 120s），并在日志中记录每次调用耗时
- 总流程：保持 10 分钟级别的 runner 超时，并提供阶段性进度输出（便于 Hub 展示）
- 失败策略：
  - 抓取失败：降级为使用 description/摘要
  - 反思失败：回退 draft ideas
