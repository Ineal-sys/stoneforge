---
"@stoneforge/smithy": patch
---

Fix sf task merge CLI command to read targetBranch from orchestrator metadata and pass it to mergeBranch(), instead of always merging to the auto-detected default branch
