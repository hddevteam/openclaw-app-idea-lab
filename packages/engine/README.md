# OpenClaw Lab Engine 🧠

The **Core Runtime** and generation factory for the OpenClaw App Idea Lab. This is the headless layer that handles research, project generation, and storage.

## 🏗 Role & Function

- **Engine Mode**: Provides the logic used by the [Idea Hub](../hub).
- **Research Module**: Uses Azure OpenAI and Brave Search to synthesize market trends into actionable app ideas.
- **Build Module**: Orchestrates `aider` to turn markdown specs into functional Vite/React codebases.
- **Data Repository**: The single source of truth for all `outputs/` and persistent `runtime/data/` (JSON).

## 🏗 Project Structure

- **`core/`**: The "brain" of the engine.
  - `generators/`: Logic for ideation and spec drafting.
  - `modules/`: Internal logic for backlog selection, status tracking, and metadata extraction.
- **`outputs/`**: The generated web applications.
- **`runtime/`**: Logs and JSON databases (`idea_backlog.json`, `rag_index.json`).

## ⚙️ Workflows

### 1. Research & Ideation
The engine scans for "Product Gaps" and "User Friction" to generate high-value ideas that would assist an agent like OpenClaw.

### 2. Autonomous Build
Once an idea is selected, the engine generates a technical spec and delegates the implementation to an AI coder (Aider).

### 3. Spec Compliance (DAILY_SPEC)
All generated projects follow the `DAILY_SPEC.md` quality standard, ensuring:
- **Self-Healing**: Error boundaries and watchdogs.
- **Sim-Data**: High-fidelity mock data for immediate utility.
- **Agent-Ready**: Clean structures that an AI agent can easily interact with.

---
*The engine behind the experiments.*
