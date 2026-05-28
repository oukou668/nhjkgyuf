# Tag Trend Analysis

- Run tag: `extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3`
- Date filter: `2023-01-01` onward
- Models analyzed: 266
- Date range: 2023-02-24 to 2026-05-05
- Eligible families: Claude, DeepSeek, GPT, Gemini, Llama, Others, Qwen
- Skipped families below threshold: GLM (3), Kimi (6)

## Overall Fastest-Rising Tags

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.001659 | 0.485 | 0.007021 | 266 |
| 2 | Search-Load | 0.001610 | 0.485 | 0.006815 | 266 |
| 3 | Logical-Control | 0.001598 | 0.485 | 0.006766 | 266 |
| 4 | Verbal-Language | 0.001598 | 0.485 | 0.006766 | 266 |
| 5 | Abstraction-Learning | 0.001514 | 0.469 | 0.006593 | 266 |
| 6 | Science | 0.000769 | 0.398 | 0.004598 | 266 |
| 7 | Instruction-Constrained | 0.000713 | 0.402 | 0.004193 | 266 |
| 8 | Multilingual_v1.1 | 0.000590 | 0.342 | 0.003665 | 266 |
| 9 | Format-Familiarity | 0.000589 | 0.391 | 0.003482 | 266 |
| 10 | Social-Humanities | 0.000574 | 0.343 | 0.003565 | 266 |

## Event Jump Analysis

This section compares the event model cohort against same-family models released in the pre-event window. It is designed for questions like `DeepSeek R1 -> reasoning tags` or `Opus 4.6 -> Coding`.

### DeepSeek R1

- Family: DeepSeek
- Event date: 2025-01-20
- Pre-window: 180 days, 2 baseline models
- Event cohort: 1 model(s)

| Rank | Tag | Jump | Event mean | Pre mean | Z | Event models |
|---:|---|---:|---:|---:|---:|---|
| 1 | Quantitative-Formal | 0.000247 | 0.004495 | 0.004248 | 1.42 | DeepSeek-R1 |
| 2 | Search-Load | 0.000230 | 0.004424 | 0.004194 | 1.33 | DeepSeek-R1 |
| 3 | Logical-Control | 0.000223 | 0.004451 | 0.004228 | 1.23 | DeepSeek-R1 |
| 4 | Verbal-Language | 0.000223 | 0.004451 | 0.004228 | 1.23 | DeepSeek-R1 |
| 5 | Abstraction-Learning | 0.000213 | 0.004425 | 0.004212 | 1.10 | DeepSeek-R1 |
| 6 | Coding | 0.000000 | 0.000000 | 0.000000 | 0.00 | DeepSeek-R1 |
| 7 | Multilingual_v1.1 | -0.000172 | 0.001626 | 0.001799 | -5.16 | DeepSeek-R1 |
| 8 | Game-Environment | -0.000182 | 0.001210 | 0.001392 | -10.55 | DeepSeek-R1 |

### Claude Opus 4.6

- Family: Claude
- Event date: 2026-02-05
- Pre-window: 180 days, 4 baseline models
- Event cohort: 2 model(s)

| Rank | Tag | Jump | Event mean | Pre mean | Z | Event models |
|---:|---|---:|---:|---:|---:|---|
| 1 | Quantitative-Formal | 0.005525 | 0.012224 | 0.006699 | 2.03 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 2 | Search-Load | 0.005355 | 0.011930 | 0.006574 | 2.03 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 3 | Abstraction-Learning | 0.005343 | 0.011736 | 0.006393 | 1.99 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 4 | Logical-Control | 0.005319 | 0.011897 | 0.006578 | 2.03 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 5 | Verbal-Language | 0.005319 | 0.011897 | 0.006578 | 2.03 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 6 | Game-Environment | 0.002546 | 0.004617 | 0.002071 | 5.22 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 7 | Science | 0.002516 | 0.007150 | 0.004634 | 5.90 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 8 | Safety | 0.002415 | 0.005087 | 0.002672 | 4.85 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |

## Tag Frontier Lines

For selected tags, this takes the strongest model-tag score available at each release date and connects those frontier values over time.

| Tag | Final frontier | Current best model | Last frontier refresh | Refresh count |
|---|---:|---|---|---:|
| Quantitative-Formal | 0.026853 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 9 |
| Logical-Control | 0.025916 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 9 |
| Abstraction-Learning | 0.025439 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 9 |
| Search-Load | 0.026110 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 9 |
| Coding | 0.000000 | LLaMA-13B | 2023-02-24 · LLaMA-13B | 1 |
| Science | 0.018554 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 10 |

## Family Fastest-Rising Tags

### Claude

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.004632 | 0.599 | 0.009592 | 19 |
| 2 | Search-Load | 0.004496 | 0.600 | 0.009307 | 19 |
| 3 | Logical-Control | 0.004458 | 0.600 | 0.009232 | 19 |
| 4 | Verbal-Language | 0.004458 | 0.600 | 0.009232 | 19 |
| 5 | Abstraction-Learning | 0.004319 | 0.586 | 0.009009 | 19 |

### DeepSeek

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Multilingual_v1.1 | 0.002100 | 0.811 | 0.000157 | 12 |
| 2 | Social-Humanities | 0.001908 | 0.799 | 0.000120 | 12 |
| 3 | Science | 0.001171 | 0.597 | -0.000134 | 12 |
| 4 | Quantitative-Formal | 0.001043 | 0.579 | 0.000114 | 12 |
| 5 | Instruction-Constrained | 0.001025 | 0.557 | -0.000193 | 12 |

### GPT

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.002044 | 0.629 | 0.005521 | 37 |
| 2 | Search-Load | 0.001988 | 0.629 | 0.005365 | 37 |
| 3 | Logical-Control | 0.001981 | 0.629 | 0.005329 | 37 |
| 4 | Verbal-Language | 0.001981 | 0.629 | 0.005329 | 37 |
| 5 | Abstraction-Learning | 0.001925 | 0.624 | 0.005232 | 37 |

### Gemini

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.003615 | 0.684 | 0.006155 | 19 |
| 2 | Search-Load | 0.003507 | 0.683 | 0.005973 | 19 |
| 3 | Logical-Control | 0.003479 | 0.682 | 0.005931 | 19 |
| 4 | Verbal-Language | 0.003479 | 0.682 | 0.005931 | 19 |
| 5 | Abstraction-Learning | 0.003404 | 0.675 | 0.005804 | 19 |

### Llama

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Science | 0.000462 | 0.498 | 0.000531 | 25 |
| 2 | Instruction-Constrained | 0.000434 | 0.501 | 0.000522 | 25 |
| 3 | Math | 0.000384 | 0.498 | 0.000456 | 25 |
| 4 | Format-Familiarity | 0.000379 | 0.505 | 0.000440 | 25 |
| 5 | Quantitative-Formal | 0.000284 | 0.409 | 0.000284 | 25 |

### Others

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.000461 | 0.362 | 0.001843 | 62 |
| 2 | Search-Load | 0.000443 | 0.357 | 0.001792 | 62 |
| 3 | Logical-Control | 0.000437 | 0.353 | 0.001787 | 62 |
| 4 | Verbal-Language | 0.000437 | 0.353 | 0.001787 | 62 |
| 5 | Abstraction-Learning | 0.000423 | 0.346 | 0.001652 | 62 |

### Qwen

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.000881 | 0.565 | 0.003967 | 83 |
| 2 | Search-Load | 0.000855 | 0.565 | 0.003844 | 83 |
| 3 | Logical-Control | 0.000849 | 0.565 | 0.003808 | 83 |
| 4 | Verbal-Language | 0.000849 | 0.565 | 0.003808 | 83 |
| 5 | Abstraction-Learning | 0.000764 | 0.531 | 0.003722 | 83 |

## Shared Signals

| Tag | Families where tag is top-3 |
|---|---:|
| Quantitative-Formal | 5 |
| Search-Load | 5 |
| Logical-Control | 5 |
| Science | 2 |

## Family-Specific Signals

| Family | Top distinctive tag | Slope/year |
|---|---|---:|
| DeepSeek | Multilingual_v1.1 | 0.002100 |

## Caveats

- This analysis uses projected `model.tag_scores` from the current latent tag projection.
- The trends are not direct evidence of training-data investment, product strategy, or benchmark author intent.
- Family-level slopes are descriptive and can be sensitive to release-date clustering and small sample sizes.
- Event jumps compare model cohorts to a pre-window baseline; they are descriptive, not causal.
- Frontier lines show observed best-so-far projected tag scores; a flat line can mean no newer model exceeded the previous maximum.
- `slope_per_year` is computed on raw projected tag scores, so compare ranks more than absolute magnitudes.
