---
'@stoneforge/smithy': patch
---

Fix hasRecentRateLimitPattern to check recency relative to now, preventing stale rate-limit patterns from blocking recovery after Wake Now
