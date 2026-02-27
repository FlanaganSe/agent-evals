---
name: plan
description: Generates an implementation plan from PRD and research. Use after research is complete.
disable-model-invocation: true
---
Read:
- `.claude/plans/prd.md` (requirements)
- `.claude/plans/research.md` (investigation findings)

Then read the relevant source files to understand current state.

Write to `.claude/plans/plan.md`:

1. **Summary** — One paragraph on the approach
2. **Files to change** — Each file with what changes and why
3. **Files to create** — Each new file with its purpose
4. **Steps** — Numbered, ordered, each with:
- Step N: [description]
- Files: [which files]
- Verify: [command to confirm — test, typecheck, etc.]
   
5. **Risks** — What could go wrong
6. **Open questions** — Anything needing human input

Do NOT implement. Write the plan and stop. Wait for human review.

$ARGUMENTS
