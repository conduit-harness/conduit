#!/bin/sh
set -eu

: "${OLLAMA_MODEL:=qwen2.5-coder:0.5b}"
: "${OLLAMA_BASE:=http://ollama:11434}"

echo "[harness] waiting for ollama at ${OLLAMA_BASE}..."
until curl -fsS "${OLLAMA_BASE}/api/tags" >/dev/null 2>&1; do sleep 1; done

echo "[harness] ensuring model ${OLLAMA_MODEL} is available..."
curl -fsS -X POST "${OLLAMA_BASE}/api/pull" \
  -H "content-type: application/json" \
  -d "{\"name\":\"${OLLAMA_MODEL}\",\"stream\":false}" \
  >/dev/null

if [ ! -d /repo/.git ]; then
    echo "[harness] initializing /repo as git repo..."
    git -C /repo init -q -b main
    git -C /repo config user.email "harness@conduit.local"
    git -C /repo config user.name "harness"
    echo "# scratch repo" > /repo/README.md
    git -C /repo add README.md
    git -C /repo commit -q -m "init"
fi

echo "[harness] running conduit once..."
exec conduit once \
    --repo /repo \
    --workflow /app/WORKFLOW.md \
    --log-level debug
