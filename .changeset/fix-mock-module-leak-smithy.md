---
"@stoneforge/smithy": patch
---

Fix mock.module leak: replace global mock.module for ensureTargetBranchExists with dependency injection via DispatchDaemonConfig to prevent test interference across files
