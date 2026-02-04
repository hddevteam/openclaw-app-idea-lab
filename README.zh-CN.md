# 🧪 OpenClaw App Idea Lab
### *AI 原生工具的进化引擎*

[![Status](https://img.shields.io/badge/Status-Active%20R%26D-blueviolet)](#)
[![License](https://img.shields.io/badge/License-MIT-green)](#)
[![Engine](https://img.shields.io/badge/Powered%20By-OpenClaw-orange)](https://github.com/openclaw)

[English](./README.md) | **简体中文**

**OpenClaw App Idea Lab** 是一个自动化的研发实验室，旨在弥合“抽象的 AI 潜力”与“具象的用户工具”之间的鸿沟。它不仅是“思考”工具，更是直接“制造”工具。

---

## 🌟 为什么需要 Idea Lab？

在 LLM 时代，瓶颈不再是代码生成，而是**有意义的创意构思**和**工作流工程**。App Idea Lab 通过自动化工具的整个生命周期来解决这一问题：

1.  **洞察研究**：扫描数字化趋势和潜在用户需求。
2.  **组合式构思**：将系统能力与人类需求融合，创造出具有“爽感”的交互方式。
3.  **自主原型构建**：在几分钟内生成生产就绪、可运行的 Web 应用。

---

## 🔗 OpenClaw 协同效应：集体智慧

当 **App Idea Lab** 遇到 **OpenClaw** Agent 生态系统时，奇迹便会发生：

-   **生产力孵化器**（Empowering Productivity）：每一个生成的应用都是一次对繁琐流程的重构。Idea Lab 不仅仅是在制造工具，它更是**解放生产力的创意源泉**。它将碎片化的创意转化为直观、高效的数字化武器，让用户从重复性劳动中解脱出来。
-   **从灵感到现实**：不再仅仅是“你问我答”。实验室制造出的界面是 Agent 与人之间的桥梁，将复杂的后端逻辑转化为触手可及的操控台，实现真正意义上的“AI 指挥，人机共构”。
-   **持续进化的创意库**：Idea Lab 是一个永不停歇的灵感工厂。It 不断探索 AI 原生应用的可能性，为用户提供源源不断的工具选择，让每个人的工作流都能根据实时需求快速进化。
-   **OpenClaw 模型中立**：虽然本项目默认基于 Aider 和 Azure OpenAI 开发，但通过 **OpenClaw** 的集成，你可以灵活配置并使用**任何主流或私有模型**。
-   **空闲自动化生成**：你可以将生成脚本配置为 OpenClaw 的后台服务（例如 `daily-app-lab-idle-generate`）。这使得你的终端能在系统空闲时自动消耗积压的创意，持续将其转化为可运行的 App Demo。
    -   **核心机制**：该功能由 [`run_idle_job.sh`](./packages/engine/core/scripts/run_idle_job.sh) 协调。它会自动检测 Mac 是否已空闲超过 10 分钟（通过 `idle_gate.sh`），检查每日生成上限，并通过 `backlog_pick_pm.mjs` 从积压库中挑选最高优先级的创意触发构建。

---

## 🚀 核心特性

-   **“原型即洞察”**（Demo-First Insight）：我们的目的不是交付完美的软件产品，而是让用户**立刻看到开箱即用的功能演示**。通过高保真的交互原型，用户可以直观地发掘哪些创意具有真正的实战意义，而非在抽象的文字中推测。
-   **Token 效率革命**：在 R&D 阶段，反复迭代去完善一个未经验证的工具是极度浪费的。Idea Lab 通过一次性生成带模拟数据的实体 App，帮助用户**节省宝贵的 Token**。看到即所得，让决策和筛选变得廉价且高效。
-   **创意滤网**：作为创意的试验场，它帮助你快速淘汰平庸想法，发力于真正能产生变革的杀手级工具。

---

## 🏗️ 项目架构

-   **`apps/hub/`**：指挥中心。一个精致的仪表盘，用于管理想法积压、审阅 AI 研究趋势并触发实时构建。
-   **`packages/engine/`**：动力核心。驱动自主研究（`planner_research`）以及通过 Aider 实现的高保真代码工程。

---

## 🛠️ 快速开始

### 1. 安装
安装 Monorepo 的所有依赖：
```bash
npm install
```

### 2. 配置
复制模板并配置你的密钥：
```bash
cp .env.example .env
```
确保配置了 `AZURE_OPENAI_API_KEY` 和 `BRAVE_API_KEY`。

### 3. 启动 Hub
启动本地服务器并开始进化：
```bash
npm run serve:hub
```
访问：`http://localhost:41777`

---

## 📜 许可证
MIT © OpenClaw Team
