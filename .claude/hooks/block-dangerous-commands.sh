#!/bin/bash
# PreToolUse hook: blocks dangerous bash commands

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

  if echo "$CMD" | grep -qE 'rm\s+-rf'; then
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Use trash instead of rm -rf"
      }
    }'
    exit 0
  fi

  if echo "$CMD" | grep -qE 'git\s+push\s+.*(main|master)'; then
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Push to a feature branch, not main"
      }
    }'
    exit 0
  fi
fi

exit 0
