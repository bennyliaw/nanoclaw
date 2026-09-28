# /claude-usage

When the user sends `/claude-usage`, show their personal Claude Pro subscription usage.

The data lives at `/workspace/agent/.claude-usage.json`, written every ~30 s by the host machine's Claude Code statusLine hook. Read it with `cat /workspace/agent/.claude-usage.json` and check freshness with `stat -c %Y /workspace/agent/.claude-usage.json 2>/dev/null || stat -f %m /workspace/agent/.claude-usage.json 2>/dev/null` (prints epoch seconds).

**If the file doesn't exist or can't be read:**
Reply: "No Claude Code usage data yet — open a Claude Code session on your Mac and it will populate within 30 s."

**Parsing the JSON:**
- `rate_limits.five_hour.used_percentage` — 0-100 float; how much of the 5h window is consumed
- `rate_limits.five_hour.resets_at` — Unix timestamp (possibly float) when window resets
- `rate_limits.seven_day.used_percentage` — same for 7d
- `rate_limits.seven_day.resets_at`
- If `rate_limits` is null or both windows are null: reply "Rate limit data unavailable (Claude Code may not have made any API calls yet)."

**Building the bar (16 chars wide):**
`filled = round(pct * 16 / 100)` then `"█" * filled + "░" * (16 - filled)`.

**Countdown from resets_at:**
`remaining = resets_at_int - now_unix`. Format:
- ≥ 86400 s → "Xd Yh" (e.g. "5d 14h")
- ≥ 3600 s → "Xh Ym" (e.g. "2h 18m")
- ≥ 60 s → "Xm" (e.g. "43m")
- < 60 s → "Xs"

**File age:** `age = now_unix - file_mtime`. Show "Updated Xs ago" / "Xm ago" / "Xh ago". If age > 10 min, add "⚠️" — Claude Code session may not be active.

**Output format (send as a code block so bars render monospace):**

```
Claude Usage (personal Pro)
Updated Xs ago

5h  ████████░░░░░░░░  52%
    resets in 2h 18m

7d  ███░░░░░░░░░░░░░  19%
    resets in 5d 14h
```

If token counts (`rate_limits.five_hour.used` and `.limit`) are present in the JSON, add them on the second line: `42k / 80k tokens · resets in 2h 18m`. Otherwise omit the token line.
