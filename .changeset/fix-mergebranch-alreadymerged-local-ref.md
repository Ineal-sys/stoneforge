---
"@stoneforge/smithy": patch
---

Fix mergeBranch() alreadyMerged check to use local source ref instead of remote, preventing unpushed commits from being skipped
