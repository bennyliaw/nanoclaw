# Running Agents on Local Ollama

NanoClaw agents can be routed to a local [Ollama](https://ollama.com) instance instead of the Anthropic API. This cuts API costs to zero and keeps all inference on your hardware.

## How It Works

Ollama exposes an Anthropic-compatible `/v1/messages` endpoint. The Claude Code CLI (which runs inside agent containers) uses the Anthropic SDK, which reads `ANTHROPIC_BASE_URL` to find the API host. Pointing that variable at Ollama is all that's needed — no new provider code, no changes to the agent runtime.

```
┌─────────────────────────────┐
│  Agent container            │
│                             │
│  Claude Code CLI            │
│    ↓ ANTHROPIC_BASE_URL     │
│    http://host.docker.      │      ┌──────────────────┐
│    internal:11434    ───────┼─────▶│  Ollama :11434   │
│                             │      │  gemma4:latest   │
└─────────────────────────────┘      └──────────────────┘
```

`host.docker.internal` is Docker's magic hostname that resolves to the host machine from inside a container — so Ollama running on your Mac or Linux box is reachable at that address.

## The OneCLI Complication

NanoClaw normally runs API calls through an OneCLI HTTPS proxy that injects real credentials in place of a placeholder key. When redirecting to Ollama you need to bypass that proxy so requests go direct. Two env vars handle this:

- `NO_PROXY=host.docker.internal` — tells the Anthropic SDK's HTTP client to skip the proxy for that hostname
- `no_proxy=host.docker.internal` — lowercase variant for tools that check the lowercase form

Both are set in the agent group's `container.json` alongside `ANTHROPIC_BASE_URL`.

## Network Isolation

Setting `ANTHROPIC_BASE_URL` redirects requests but doesn't prevent a misconfigured agent from accidentally reaching `api.anthropic.com` directly. The `blockedHosts` field in `container.json` adds a Docker `--add-host` flag that resolves the domain to `0.0.0.0`, making it physically unreachable from inside the container:

```json
"blockedHosts": ["api.anthropic.com"]
```

With this in place, even if the model setting drifts back to a Claude model name, the API call will fail immediately rather than silently billing your account.

## Model Selection

The Claude Code CLI reads its model from `~/.claude/settings.json` inside the container, which NanoClaw bind-mounts from `data/v2-sessions/<agent-group-id>/.claude-shared/settings.json`. Set `"model": "gemma4:latest"` (or whatever Ollama model you've pulled) there. Use the exact name from `ollama list`.

Model selection considerations for Apple Silicon:

| Model | Size | Best For | Released | Knowledge Cutoff | Cold¹ | Warm simple² | Warm medium³ | Thinking | tps on MBA M5 32GB |
|-------|------|----------|----------|-----------------|-------|-------------|--------------|----------|---|
| `gemma4:12b-mlx` | 10 GB | General chat, vision, quick tasks | Apr 2026 | Jan 2025⁴ | 3.9s | 3.7s | 4.9s | Visible inline | 14 tps |
| `gemma4:12b-mlx-bf16` | 23 GB | Same as above, higher output quality | Apr 2026 | Jan 2025 | 30.2s | 8.6s | 16.2s | Visible inline | 5 tps |
| `gemma4:26b` | 17 GB | General tasks needing more reasoning depth | Apr 2026 | Jan 2025⁴ | 7.6s | 3.0s | 2.8s | *Visible inline | 42 tps |
| `qwen3:8b` | 5.2 GB | Fast chat, coding, multilingual, low RAM | Apr 2025 | Oct 2024 | 5.9s | 5.5s | 7.6s | *Visible inline | 24 tps |
| `qwen3.5:35b-a3b` | 23 GB | Multimodal (vision), long context (262K), agentic/coding | Feb 2026 | Oct 2024 | 11.6s | 6.0s | 26.2s | *Visible inline | 42 tps |
| `deepseek-r1:32b` | 19 GB | Math, reasoning, chain-of-thought problems | Jan 2025 | Jul 2024 | 196.8s | >600s⁵ | n/a | *Visible inline | 6 tps |
¹ Cold: model not pre-loaded, simple prompt, Apple M5 32GB.
² Warm simple: model in memory, single-token prompt ("Reply with just ok"), avg of 3 runs.
³ Warm medium: model in memory, short code prompt ("Write a Python hello world program"), avg of 3 runs.
⁴ Model self-reported "early 2024" — HuggingFace model card and the bf16 variant both confirm Jan 2025.
⁵ deepseek-r1 generates extensive reasoning tokens before responding — timed out after 600s on a trivial warm prompt. Only suitable for complex tasks where long wait times are acceptable.

**MLX variants** (`-mlx`, `-mlx-bf16`) run natively on Apple Silicon via the MLX framework — use these over the plain variants on M-series Macs. The `bf16` variant is full precision and noticeably higher quality; the standard `mlx` is ~2× smaller and better when RAM is tight.

The agent uses tool calls extensively (read/write files, shell commands). Models that support tool use reliably work best. All models in the table above handle structured tool calls well except `deepseek-r1` which is a reasoning/thinking model not optimised for tool use.

## What Changes at the Code Level

Three files need to support this feature. See `/add-ollama-provider` for the exact changes.

**`src/container-config.ts`** — `ContainerConfig` interface needs `env` and `blockedHosts` fields so the per-group JSON can carry them.

**`src/container-runner.ts`** — At container spawn time, `env` entries become `-e KEY=VAL` Docker flags (applied after OneCLI's injected vars so they win), and `blockedHosts` entries become `--add-host HOST:0.0.0.0` flags.

**`container/Dockerfile`** — The container runs as the host user's uid (e.g. 501 on macOS), not as the `node` user (uid 1000). The home directory must be `chmod 777` so any uid can write `~/.claude.json` and `~/.claude/settings.json`.

## Tradeoffs

| | Ollama (local) | Anthropic API |
|---|---|---|
| Cost | Free | Pay-per-token |
| Privacy | Fully local | Data sent to Anthropic |
| Model quality | Good (open-weight) | Excellent (Claude) |
| Cold start | 5–30s (model load) | ~1s |
| Context window | Varies by model | 200k tokens (Sonnet) |
| Tool use reliability | Good (large models) | Excellent |
| Hardware req. | 16GB+ RAM | None |

For personal automation on capable hardware, the tradeoff favors local. For complex multi-step tasks requiring large context or high reliability, Claude is still ahead.

## Reverting to Claude

Remove the `env` and `blockedHosts` keys from `groups/<folder>/container.json`, remove `"model"` from the shared settings file, and restart the service. No rebuild needed.

## See Also

- `/add-ollama-provider` — step-by-step skill to configure any agent group for Ollama
- [Ollama Anthropic compatibility docs](https://ollama.com/blog/openai-compatibility) — upstream docs on the API bridge
- `docs/architecture.md` — how the container spawn and env injection pipeline works

## Misc

Just some sample prompt for benchmarking:

draft a simple to medium level puzzle for LLM like you to solve that takes around 20 seconds to solve.

    *   *Idea 1 (Truth Tellers):* Three people, one lies, two tell truth. A says "B lies." B says "C lies." C says "A and B lie." Identify who is lying. (Might be too easy/common).
    *   *Idea 2 (Relative Position):* Alice, Bob, Charlie, Dave are in a line. Alice is not next to Dave. Bob is between Alice and Charlie. Charlie is to the right of Bob. Who is at 
the far left? (Good, but very quick for an LLM).
    *   *Idea 3 (Sequence with a twist):* A sequence of numbers where each step involves two operations. "1, 4, 9, 16... no too easy." "2, 5, 10, 17... still easy.

I speak without a mouth and hear without ears. I have no body, but I come alive 
with wind. What am I?