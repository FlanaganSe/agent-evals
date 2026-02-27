---
name: prd
description: Generates a concise PRD from a feature description. Use when starting a new feature or change.
disable-model-invocation: true
---
Generate a PRD for: $ARGUMENTS

Write to `.claude/plans/prd.md`:

1. **Problem** — What pain does this address? (2-3 sentences)
2. **Solution** — What are we building? (1 paragraph)
3. **Requirements** — Numbered must-haves
4. **Non-goals** — What this does NOT include
5. **Technical constraints** — From immutable rules + architecture
6. **Acceptance criteria** — How we know it's done (testable statements)

Under 60 lines. Stop after writing — do not begin implementation.
