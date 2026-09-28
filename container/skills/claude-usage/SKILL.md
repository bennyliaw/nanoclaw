---
name: claude-usage
description: Check personal Claude Pro subscription usage (5h and 7d windows) from Telegram. Reads from a file written by the host machine's Claude Code statusLine hook.
---

# /claude-usage

Report current Claude Pro subscription rate limit usage. Data is sourced from the host machine's Claude Code statusLine hook (written every 30 s to `~/.claude/claude-usage.json`, mounted read-only into the container).

Shows:
- 5-hour window: % used + time until reset
- 7-day window: % used + time until reset
- Token counts if available in the statusLine JSON
