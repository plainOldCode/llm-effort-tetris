# LLM Reasoning-Effort Comparison — tetris (React + TypeScript)

**How do reasoning effort levels (low / high / max) differ on the same coding task?** — single prompt, single model, n=1 per condition.

**Original prompt (verbatim)**: `tetris game 을 html 로 구성하고 react 를 이용하고 typescript 를 사용해라.` ("Build a tetris game in HTML using React and TypeScript.") — full protocol in [prompt/PROMPT.md](prompt/PROMPT.md)

> Model: self-hosted open-weights model, single-turn completion (serving alias `dgx-local`, on-prem; network details withheld). Measured 2026-10-09/10.

## Results

| | low | high | max |
| --- | --- | --- | --- |
| **Build (vite)** | ✅ pass | ✅ pass | ✅ pass |
| **tsc --noEmit errors** | 6 | **3** (fewest) | 19 |
| **Feature checklist** | 9/9 | 9/9 | 9/9 |
| **Reasoning tokens** | 25,006 | 24,827 | **39,860** |
| **Total generated tokens** | 37,221 | 34,426 | 51,746 |
| **Total time** | 2,356.7s | 2,530.4s | 2,965.2s |
| **Time to first content** | 1,815.9s | 2,128.6s | 2,693.7s |
| **TTFT** | 0.088s | 0.018s | 0.017s |
| **Answer length** | 34,790 chars | 27,671 chars | 33,184 chars |
| **Code size** | 618 lines | 447 lines | 561 lines |

Feature checklist: controls, rotation, hard drop, soft drop, line clear, score, level, game over, pause — all 9/9 in every condition.

## Findings

1. **Functional completeness is effort-independent** — all three conditions implemented 9/9 features and built cleanly. Higher effort did not buy more functionality.
2. **Code quality peaked at high** — fewest tsc errors (3, all UMD-pattern related) and the only `useReducer` state machine. low had 6, max had 19.
3. **How max fails**: the most ambitious implementation intent, but concentrated in multi-dimensional array type mismatches (TS2345 ×10) — ambition and type correctness were decoupled.
4. **Effort increases reasoning only at max** — 25,006 (low) ≈ 24,827 (high) << 39,860 (max). On this task, raising effort only lengthened reasoning at max.
5. **Time cost scales with effort** — low→max total +26%. TTFT stayed under 0.1s everywhere; streaming was instant regardless.
6. **Size and quality were uncorrelated** — 618 lines (low) > 561 (max) > 447 (high) while quality ranked the opposite way.

## Demo (GitHub Pages)

- [low](https://plainoldcode.github.io/llm-effort-tetris/low/)
- [high](https://plainoldcode.github.io/llm-effort-tetris/high/)
- [max](https://plainoldcode.github.io/llm-effort-tetris/max/)

Same project (`src/main.tsx`) extracted from each response, rebuilt with `--base=./`. Sources under `implementations/`.

## Repository layout

```
prompt/PROMPT.md              original prompt + protocol + max_tokens pilot rationale
implementations/{low,high,max}/  Vite+React+TS projects extracted from responses (src/main.tsx)
raw/{low,high,max}_raw_response.md  full raw model responses (single HTML fence)
results/metrics_main.json     machine-readable run metrics
results/metrics_pilot_cap32k.json  pilot metrics at max_tokens=32768
evidence/{low,high,max}/      tsc/vite outputs + extraction metadata + verification JSON
docs/{low,high,max}/          Pages builds (base=./)
```

## Methodology limits

- **n=1** — one run per condition; an observation record, not a statistical claim.
- Low-noise signal exists though: low's reasoning tokens were exactly 25,006 in both pilot and main runs.
- Conditions differ from an earlier agent-gateway experiment (#1) — absolute numbers are not comparable across the two; this record is for **effort-relative comparison on raw single-turn completions**.
- Shared-GPU environment — wall-clock times may include interference from other workloads.
- Response parsing (HTML fence → main.tsx) is a fixed human-designed procedure, applied identically to all three.

## Reproduce

```bash
cd implementations/high
npm install
npm run build      # dist/
npx tsc --noEmit   # same procedure as evidence/*/tsc_output.txt
```

## Provenance

- Internal tracking: TT card M4GB403A-E4XC ([experiment #2] coding task effort comparison, 2026-10-09/10)
- Raw data: `results/`, `raw/` — every number in this README comes from the machine-readable JSON
