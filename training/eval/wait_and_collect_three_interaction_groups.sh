#!/usr/bin/env bash
# Keep waiting for the locally configured inference service, then persist the
# three comparison groups. This process never treats a connection failure as a
# completed case, so it can safely stay alive through service restarts.
set -u -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/agent-debugger/.env"
OUTPUT_ROOT="${1:-$ROOT/training/eval/results/heldout-v3-generations}"
LOG_DIR="$OUTPUT_ROOT"
RETRY_SECONDS="${VIBE_EVAL_RETRY_SECONDS:-20}"

mkdir -p "$LOG_DIR"

while true; do
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  API_BASE="${VIBE_EVAL_QWEN35_9B_API_BASE:-}"
  if [[ -z "$API_BASE" ]]; then
    printf '%s waiting: VIBE_EVAL_QWEN35_9B_API_BASE is unset\n' "$(date '+%F %T')" | tee -a "$LOG_DIR/collector.log"
  elif curl -fsS --max-time 10 "${API_BASE%/}/models" >/dev/null; then
    printf '%s service ready; collecting pending generations\n' "$(date '+%F %T')" | tee -a "$LOG_DIR/collector.log"
    if bash "$ROOT/training/eval/collect_three_interaction_groups.sh" "$OUTPUT_ROOT" >>"$LOG_DIR/collector.log" 2>&1; then
      printf '%s complete: all three groups are persisted\n' "$(date '+%F %T')" | tee -a "$LOG_DIR/collector.log"
      exit 0
    fi
    printf '%s collection incomplete; retrying pending cases\n' "$(date '+%F %T')" | tee -a "$LOG_DIR/collector.log"
  else
    printf '%s waiting: API is not ready at %s\n' "$(date '+%F %T')" "$API_BASE" | tee -a "$LOG_DIR/collector.log"
  fi
  sleep "$RETRY_SECONDS"
done
