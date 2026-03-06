---
"@stoneforge/smithy": patch
---

Fix false positive rate limit detection from assistant code discussion. Add 200-character length gate to `isRateLimitMessage()` and replace broad catch-all pattern with specific patterns for known provider rate limit formats.
