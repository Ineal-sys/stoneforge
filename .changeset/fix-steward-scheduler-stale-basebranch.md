---
"@stoneforge/smithy": patch
---

Fix steward-scheduler to inform scheduled stewards that tasks may target different branches. Adds a per-task target branch override note to both merge/docs and custom steward prompts, instructing stewards to check each task's targetBranch before reviewing.
