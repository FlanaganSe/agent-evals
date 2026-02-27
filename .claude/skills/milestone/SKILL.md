---
name: milestone
description: Splits approved plan into milestones and begins execution. Use after plan is reviewed and approved.
disable-model-invocation: true
---
Read the approved plan at `.claude/plans/plan.md`.

Split into milestones. Each must be:
- **Independently verifiable** — concrete "done" check
- **Committable** — codebase is valid after each
- **Small** — 1-5 steps per milestone

Update `.claude/plans/plan.md` with a Milestones section:

## Milestones

### M1: [name]
- [ ] Step 1 — [desc] → verify: [command]
- [ ] Step 2 — [desc] → verify: [command]
Commit: "[type]: [description]"

### M2: [name]
...

Then begin executing M1.

After each milestone:
1. Check off completed steps in plan.md
2. Run verification commands
3. Use the verifier subagent to confirm all checks pass
4. Commit with the specified message
5. Use the reviewer subagent to review the milestone's changes
6. If reviewer finds 🔴 issues, fix them before proceeding
7. Proceed to next milestone

$ARGUMENTS
