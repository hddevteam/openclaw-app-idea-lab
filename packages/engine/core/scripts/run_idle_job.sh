#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR0="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${DAILY_WEB_LAB_ROOT:-$(cd "$SCRIPT_DIR0/../.." && pwd)}"
SCRIPT_DIR="$PROJECT_ROOT/core/scripts"
cd "$PROJECT_ROOT"

# launchd/non-interactive PATH
export PATH="$HOME/.npm-global/bin:$HOME/Library/Python/3.11/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# env
set -a
[ -f "$PROJECT_ROOT/.env" ] && source "$PROJECT_ROOT/.env" || true
# Also source from monorepo root if exists
MONO_ROOT="$(cd "$PROJECT_ROOT/../.." && pwd)"
[ -f "$MONO_ROOT/.env" ] && source "$MONO_ROOT/.env" || true
set +a

MAX_PER_DAY=${DAILY_WEB_LAB_MAX_PER_DAY:-10}
TODAY=$(date +%F)
LOG_DIR="$PROJECT_ROOT/runtime/logs"
mkdir -p "$LOG_DIR"
TRACE_LOG="$LOG_DIR/${TODAY}-idle-trace.log"

FORCE_RUN=false
if [[ "${1:-}" == "--force" || "${1:-}" == "force" ]]; then
  FORCE_RUN=true
fi

log(){ echo "[$(date '+%F %T')] $*" | tee -a "$TRACE_LOG"; }

SUMMARY=""
finish(){
  local code=$?
  if [ -z "$SUMMARY" ]; then SUMMARY="exit_code=$code"; else SUMMARY="$SUMMARY exit_code=$code"; fi
  log "SUMMARY: $SUMMARY"
}
trap finish EXIT

count_today(){
  # Count only valid projects (with index.html at root or in dist)
  if [ ! -d "$PROJECT_ROOT/outputs" ]; then
    echo 0
    return
  fi
  
  local count=0
  for d in "$PROJECT_ROOT/outputs/${TODAY}"-*; do
    if [ -d "$d" ]; then
      if [ -f "$d/index.html" ] || [ -f "$d/dist/index.html" ]; then
        ((count++))
      fi
    fi
  done
  echo "$count"
}

log "tick start"

if [ "$FORCE_RUN" = true ]; then
  log "force_run=true (skipping checks)"
else
  # skip if aider already running
  if pgrep -f "\baider\b" >/dev/null 2>&1; then
    SUMMARY="skipped reason=aider_running"
    log "skip: aider already running"
    exit 0
  fi

  # idle gate
  if ! "$SCRIPT_DIR/idle_gate.sh"; then
    SUMMARY="skipped reason=not_idle_enough"
    log "idle_gate=fail (not idle enough)"
    exit 0
  fi
  log "idle_gate=pass"

  C=$(count_today)
  log "count_today=$C max_per_day=$MAX_PER_DAY"
  if [ "$C" -ge "$MAX_PER_DAY" ]; then
    SUMMARY="skipped reason=max_per_day count_today=$C max_per_day=$MAX_PER_DAY"
    log "skip: reached max outputs today ($C/$MAX_PER_DAY)"
    exit 0
  fi
fi

# pick from backlog (best-effort)
if [ -f "$PROJECT_ROOT/runtime/data/idea_backlog.json" ]; then
  log "pm_pick_from_backlog=start"
  if ! node "$PROJECT_ROOT/core/modules/backlog_pick_pm.mjs" 2>&1 | tee -a "$TRACE_LOG"; then
    log "WARNING: pm_pick_from_backlog failed"
  else
    log "pm_pick_from_backlog=ok"
  fi
else
  log "pm_pick_from_backlog=skip (no backlog file)"
fi

log "action=generate_extra"
GEN_LOG="$LOG_DIR/$(date +%F)-idle-generate.log"
if ! node "$PROJECT_ROOT/generate.mjs" 2>&1 | tee -a "$GEN_LOG"; then
  SUMMARY="error reason=generate_failed"
  log "ERROR: generate.mjs failed"
  exit 1
fi

log "Index rendering handled by daily-web-lab-hub"
log "Server is managed by daily-web-lab-hub"
SUMMARY="ok action=done"
log "done"
