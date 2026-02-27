---
name: review
description: Triggers reviewer subagent for fresh-context code review. Use after implementation.
disable-model-invocation: true
---
Use the reviewer subagent to review recent changes.

Context: $ARGUMENTS

If no arguments, review uncommitted changes via `git diff`.
