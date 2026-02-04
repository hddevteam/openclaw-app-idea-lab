# Daily Idea Lab Engine 🧠

The **Core Engine** and data repository for the Daily App Lab ecosystem. This is a headless repository that handles project generation, automation, and project storage.

## 🏗 Role & Function

- **Engine Mode**: No independent UI. It provides the scripts and logic used by [Daily App Hub](../daily-app-hub).
- **Data Repository**: Acts as the single source of truth for all `outputs/` and persistent `runtime/data/` (JSON).
- **Automation Host**: Runs background idle tasks via `launchd` and system scripts.

## 🏗 Project Structure

- **`core/`**: The "brain" of the engine.
  - `scripts/`: Production scripts for idle checking (`idle_gate.sh`) and scheduled runs (`run_idle_job.sh`).
  - `modules/`: Internal logic for backlog selection and status marking.
- **`outputs/`**: The actual generated Vite projects.
- **`runtime/`**: Logs and JSON databases (`idea_backlog.json`, etc.).

## ⚙️ Workflows

### 1. Manual/Forced Execution
Bypasses idle gates and daily limits to generate the next item (or priority item):
```bash
./core/scripts/run_idle_job.sh --force
```

### 2. Background Automation
Operates as a macOS LaunchAgent (`ai.dailyweblab.idle`). It periodically scans for system idle time to generate new experiments without user intervention.

### 3. Smart Counting
Daily limits are now calculated based on **actually existing directories** in `outputs/`. Deleting a project automatically recovers your daily generation quota.

## 🛠 Spec Compliance (DAILY_SPEC)
All generated projects follow the `DAILY_SPEC.md`, ensuring:
- **Self-Healing**: Error boundaries and watchdogs in every project.
- **Scenarios**: Practical, goal-oriented application logic.
- **Adaptive**: Built-in responsiveness for touch and mouse.

---
*The engine behind the experiments.*
