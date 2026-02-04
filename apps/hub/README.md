# OpenClaw Idea Hub 🚀

The central **Cockpit** for the OpenClaw App Idea Lab ecosystem. This dashboard manages the entire lifecycle of AI-generated tools, providing the UI and API orchestration for the [Lab Engine](../../packages/engine).

## 🌟 Key Features

### 1. Operations Control
- **Implement Now (Force)**: A one-click trigger to immediately generate a specific idea from the backlog.
- **Build Progress (HUD)**: Real-time monitoring of active project generation by the Aider agent.

### 2. Project Hub
- **Visual Grid**: Browse all generated apps with elegant interactive cards showcasing project scenarios.
- **Smart Routing**: Seamlessly open and explore projects via dedicated output paths.
- **Feedback Loop**: Rate and archive notes on experiments for model reinforcement.

### 3. Lab Management
- **AI Idea Planner**: Trigger high-quality brainstorming with context-aware similarity filtering.
- **Dynamic Backlog**: Organize, prioritize, or refine potential projects.
- **OpenClaw Bridge**: Prepares tools for integration into the OpenClaw agent ecosystem.

## 🛠 Architecture

- **Role**: Command & Control (UI + API Server).
- **Stack**: React 18, Vite 7, Tailwind 4, Node.js.
- **Connectivity**: Serves as the primary entry point (`0.0.0.0:41777`), orchestrating the engine's scripts.

## 🚀 Usage

1. **Install**: `npm install`
2. **Launch**: `node server/serve.mjs`
3. **Access**: Default at `http://localhost:41777`

---
*The dashboard for the experiments.*
