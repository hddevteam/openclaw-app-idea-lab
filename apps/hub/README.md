# Daily App Hub 🚀

The central **Cockpit** for the Daily App Lab ecosystem. This dashboard manages the entire lifecycle of daily experiments, providing the UI and API orchestration for the [Daily Idea Lab Engine](../../packages/engine).

## 🌟 Key Features

### 1. Operations Control
- **Implement Now (Force)**: A one-click physical trigger to bypass idle schedules and immediately generate a specific idea from the backlog.
- **Build Progress (HUD)**: Real-time monitoring of active project generation directly on the dashboard.

### 2. Project Hub
- **Visual Grid**: Browse all daily projects with elegant interactive cards.
- **Smart Routing**: Seamlessly open and navigate generated projects via dedicated output paths.
- **Feedback Loop**: Rate and archive notes on daily experiments for model reinforcement.

### 3. Lab Management (Integrated)
- **AI Idea Planner**: Trigger high-quality brainstorming with context-aware similarity filtering.
- **Dynamic Backlog**: Organize, prioritize, or delete potential projects.
- **Auto-Sync**: Synchronizes state with the Idea Lab's JSON storage and output filesystem.

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
