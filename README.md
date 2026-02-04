# 🧪 OpenClaw App Idea Lab
### *The Evolutionary Engine for AI-Native Tools*

[![Status](https://img.shields.io/badge/Status-Active%20R%26D-blueviolet)](#)
[![License](https://img.shields.io/badge/License-MIT-green)](#)
[![Engine](https://img.shields.io/badge/Powered%20By-OpenClaw-orange)](https://github.com/hddevteam/openclaw-app-idea-lab)

**简体中文** [README.zh-CN.md](./README.zh-CN.md) | English

**OpenClaw App Idea Lab** is an automated Research & Development laboratory designed to bridge the gap between "abstract AI potential" and "tangible user utility." It doesn't just think about tools—it builds them.

---

## 🌟 Why Idea Lab?

In the age of LLMs, the bottleneck is no longer *code generation*, but *meaningful ideation* and *workflow engineering*. The App Idea Lab solves this by automating the entire lifecycle of a tool:

1.  **Observational Research**: Scours digital trends and emerging needs.
2.  **Combinatorial Ideation**: Merges system capabilities with human needs into "Juicy" interactions.
3.  **Autonomous Prototyping**: Generates production-ready, interactive web apps in minutes.

---

## 🔗 The OpenClaw Synergy: Collective Intelligence

The magic happens when the **App Idea Lab** meets the **OpenClaw** agent ecosystem. 

- **Productivity Incubator**: Every generated app is a reimagining of inefficient workflows. Idea Lab is more than a tool builder; it is a **fountain of creativity for liberating productivity**, turning ephemeral ideas into high-impact digital tools.
- **From Inspiration to Reality**: Beyond simple chat interfaces, the Lab builds the bridge between human intuition and AI execution. It manifests complex logic as tactile dashboards, enabling a "Co-Creation" model where AI handles the heavy lifting while humans focus on strategy.
- **Ever-Evolving Idea Bank**: The Lab acts as a non-stop inspiration factory. It continuously explores the boundaries of AI-native applications, ensuring your digital arsenal evolves as fast as your needs, providing a constant stream of bespoke solutions.
- **Model Agnostic via OpenClaw**: While the project is optimized for Aider and Azure OpenAI, you can configure it to work with **any model** (Claude, GPT-4, etc.) supported by the OpenClaw ecosystem.
- **Continuous Idle Generation**: You can register the generator as an OpenClaw service (e.g., `daily-app-lab-idle-generate`). This allows your terminal to automatically process your idea backlog and transform creativity into live App Demos whenever your system is idle.
    - **Logic**: The [`run_idle_job.sh`](./packages/engine/core/scripts/run_idle_job.sh) script coordinates the workflow: it checks if the Mac has been idle for 10+ minutes (via `idle_gate.sh`), verifies daily limits, picks a prioritized idea from the backlog via `backlog_pick_pm.mjs`, and triggers the build engine.

---

## 🚀 Key Features

- **"Demo-as-Insight"**: Our goal is not to deliver finished, polished tools, but to provide an **immediate, ready-to-run functional demonstration**. By visualising ideas instantly, users can identify the "killer features" and meaningful concepts without getting bogged down in implementation details.
- **Token Efficiency**: Iterating on unproven tools is expensive. Idea Lab helps you **save precious tokens** by providing a high-fidelity, interactive prototype in a single shot. See it, touch it, and decide its value before committing more resources.
- **Idea Sieve**: Use the Lab as a rapid testing ground to filter out mediocrity and double down on the creative sparks that truly liberate productivity.

---

## 🏗️ Architecture

- **`apps/hub/`**: The Command Center. A sophisticated dashboard to manage the backlog, review AI trends, and trigger implementations.
- **`packages/engine/`**: The Core. Powers the autonomous research (`planner_research`) and the high-fidelity code generation via Aider.

---

## 🛠️ Getting Started

### 1. Installation
Install all dependencies for the monorepo:
```bash
npm install
```

### 2. Configuration
Copy the template and set up your keys:
```bash
cp .env.example .env
```
Ensure your `AZURE_OPENAI_API_KEY` and `BRAVE_API_KEY` are configured for the Research & Build engines.

### 3. Launch the Hub
Start the local server and start evolving:
```bash
npm run serve:hub
```
Visit: `http://localhost:41777`

---

## 📜 License
MIT © OpenClaw Team

