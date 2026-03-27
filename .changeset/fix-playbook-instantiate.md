---
"@stoneforge/ui": patch
---

Fix useCreateFromPlaybook hook to call the playbook instantiate endpoint instead of the bare workflow creation endpoint, so that workflows created from playbooks include tasks, dependencies, and full setup.
