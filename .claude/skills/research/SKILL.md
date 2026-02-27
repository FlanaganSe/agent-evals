---
name: research
description: Triggers researcher subagent for codebase investigation. Use after PRD, before planning.
disable-model-invocation: true
---
Use the researcher subagent to investigate the codebase in context of the PRD.

The PRD is at `.claude/plans/prd.md`. Read it first.

If `.claude/plans/research.md` already exists (from external tools like Codex or Gemini),
read it and instruct the researcher to focus on areas NOT already covered.

The researcher will write its findings to `.claude/plans/research.md`
(appending if the file already exists).

Context: $ARGUMENTS
