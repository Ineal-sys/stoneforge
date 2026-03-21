---
"@stoneforge/smithy": minor
---

Add push enforcement to task completion flow. `completeTask()` now auto-pushes the task branch to origin before transitioning to REVIEW status, preventing silent commit loss when workers skip or fail to push.
