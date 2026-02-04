# OpenClaw App Idea Lab

Welcome to the **OpenClaw App Idea Lab**, the single source of truth (SSOT) for our AI-driven application ecosystem. This monorepo consolidates the Hub (dashboard) and the Engine (generator) into a unified development environment.

一个 monorepo，把 **Daily App Hub（控制台）** 和 **Daily Idea Lab Engine（生成引擎）** 集成在同一个仓库里，方便开源与协作。

## 目录结构

- `apps/hub/`：Dashboard + 本地 API Server（原 `daily-app-hub`）
- `packages/engine/`：生成引擎 + runtime 数据 + outputs 产物（原 `daily-idea-lab`）

> 注意：`runtime/` 与 `outputs/` 默认只保留在本地（已在根 `.gitignore` 忽略）。

## 快速开始

1) 安装依赖（会自动安装所有 workspaces 依赖）
- `npm install`

2) 启动 Hub（会自动读取/操作 `packages/engine/runtime` 与 `packages/engine/outputs`）
- `npm run serve:hub`

3) 打开
- `http://localhost:41777`

## 配置

把根目录的 `.env.example` 复制为 `.env` 并按需填写（可选）：
- `DAILY_APP_LAB_USER / DAILY_APP_LAB_PASS`：Hub 的 basic auth
- `DAILY_APP_LAB_PORT`：Hub 端口
- `DAILY_APP_LAB_ROOT`：手动指定 engine 根目录（通常不需要）

