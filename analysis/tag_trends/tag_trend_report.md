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
| 1 | Quantitative-Formal | 0.001589 | 0.482 | 0.006633 | 266 |
| 2 | Search-Load | 0.001556 | 0.482 | 0.006497 | 266 |
| 3 | Logical-Control | 0.001544 | 0.482 | 0.006447 | 266 |
| 4 | Verbal-Language | 0.001544 | 0.482 | 0.006447 | 266 |
| 5 | Abstraction-Learning | 0.001457 | 0.465 | 0.006267 | 266 |
| 6 | Instruction-Constrained | 0.000647 | 0.392 | 0.003810 | 266 |
| 7 | Science | 0.000643 | 0.386 | 0.003845 | 266 |
| 8 | Coding | 0.000541 | 0.346 | 0.003474 | 266 |
| 9 | Multilingual_v1.1 | 0.000540 | 0.346 | 0.003315 | 266 |
| 10 | Format-Familiarity | 0.000532 | 0.382 | 0.003153 | 266 |

## Event Jump Analysis

This section compares the event model cohort against same-family models released in the pre-event window. It is designed for questions like `DeepSeek R1 -> reasoning tags` or `Opus 4.6 -> Coding`.

### DeepSeek R1

- Family: DeepSeek
- Event date: 2025-01-20
- Pre-window: 180 days, 2 baseline models
- Event cohort: 1 model(s)

| Rank | Tag | Jump | Event mean | Pre mean | Z | Event models |
|---:|---|---:|---:|---:|---:|---|
| 1 | Quantitative-Formal | 0.000327 | 0.003886 | 0.003559 | 2.03 | DeepSeek-R1 |
| 2 | Search-Load | 0.000313 | 0.003849 | 0.003536 | 1.96 | DeepSeek-R1 |
| 3 | Logical-Control | 0.000304 | 0.003881 | 0.003577 | 1.81 | DeepSeek-R1 |
| 4 | Verbal-Language | 0.000304 | 0.003881 | 0.003577 | 1.81 | DeepSeek-R1 |
| 5 | Abstraction-Learning | 0.000295 | 0.003849 | 0.003554 | 1.64 | DeepSeek-R1 |
| 6 | Game-Environment | -0.000102 | 0.000488 | 0.000589 | -3.44 | DeepSeek-R1 |
| 7 | Multilingual_v1.1 | -0.000142 | 0.001355 | 0.001497 | -8.23 | DeepSeek-R1 |
| 8 | Social-Humanities | -0.000184 | 0.001474 | 0.001658 | -1.80 | DeepSeek-R1 |

### Claude Opus 4.6

- Family: Claude
- Event date: 2026-02-05
- Pre-window: 180 days, 4 baseline models
- Event cohort: 2 model(s)

| Rank | Tag | Jump | Event mean | Pre mean | Z | Event models |
|---:|---|---:|---:|---:|---:|---|
| 1 | Quantitative-Formal | 0.005294 | 0.011187 | 0.005893 | 1.94 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 2 | Search-Load | 0.005179 | 0.011002 | 0.005822 | 1.94 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 3 | Abstraction-Learning | 0.005167 | 0.010801 | 0.005634 | 1.91 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 4 | Logical-Control | 0.005142 | 0.010975 | 0.005833 | 1.95 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 5 | Verbal-Language | 0.005142 | 0.010975 | 0.005833 | 1.95 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 6 | Game-Environment | 0.002260 | 0.003242 | 0.000983 | 3.87 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 7 | Science | 0.002071 | 0.005758 | 0.003687 | 4.52 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |
| 8 | Coding | 0.002059 | 0.003973 | 0.001914 | 3.72 | claude-opus-4-6_adaptive_max, claude-opus-4-6_max |

## Tag Frontier Lines

For selected tags, this takes the strongest model-tag score available at each release date and connects those frontier values over time.

| Tag | Final frontier | Current best model | Last frontier refresh | Refresh count |
|---|---:|---|---|---:|
| Quantitative-Formal | 0.025713 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 10 |
| Logical-Control | 0.025017 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 10 |
| Abstraction-Learning | 0.024521 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 11 |
| Search-Load | 0.025212 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 10 |
| Coding | 0.015421 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 9 |
| Science | 0.016197 | Claude Mythos Preview | 2026-05-05 · Claude Mythos Preview | 8 |

## Family Fastest-Rising Tags

### Claude

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.004496 | 0.593 | 0.009312 | 19 |
| 2 | Search-Load | 0.004402 | 0.593 | 0.009117 | 19 |
| 3 | Logical-Control | 0.004364 | 0.594 | 0.009040 | 19 |
| 4 | Verbal-Language | 0.004364 | 0.594 | 0.009040 | 19 |
| 5 | Abstraction-Learning | 0.004220 | 0.579 | 0.008809 | 19 |

### DeepSeek

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Multilingual_v1.1 | 0.002073 | 0.825 | 0.000198 | 12 |
| 2 | Social-Humanities | 0.001819 | 0.808 | 0.000140 | 12 |
| 3 | Science | 0.001329 | 0.663 | -0.000109 | 12 |
| 4 | Instruction-Constrained | 0.001311 | 0.657 | -0.000112 | 12 |
| 5 | Quantitative-Formal | 0.001261 | 0.665 | 0.000179 | 12 |

### GPT

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.001947 | 0.627 | 0.005026 | 37 |
| 2 | Search-Load | 0.001909 | 0.627 | 0.004926 | 37 |
| 3 | Logical-Control | 0.001903 | 0.627 | 0.004893 | 37 |
| 4 | Verbal-Language | 0.001903 | 0.627 | 0.004893 | 37 |
| 5 | Abstraction-Learning | 0.001844 | 0.623 | 0.004790 | 37 |

### Gemini

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.003529 | 0.687 | 0.005963 | 19 |
| 2 | Search-Load | 0.003455 | 0.686 | 0.005839 | 19 |
| 3 | Logical-Control | 0.003426 | 0.685 | 0.005796 | 19 |
| 4 | Verbal-Language | 0.003426 | 0.685 | 0.005796 | 19 |
| 5 | Abstraction-Learning | 0.003349 | 0.678 | 0.005664 | 19 |

### Llama

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Coding | 0.000373 | 0.709 | 0.000551 | 25 |
| 2 | Science | 0.000373 | 0.441 | 0.000454 | 25 |
| 3 | Instruction-Constrained | 0.000372 | 0.436 | 0.000476 | 25 |
| 4 | Format-Familiarity | 0.000326 | 0.451 | 0.000399 | 25 |
| 5 | Math | 0.000326 | 0.437 | 0.000410 | 25 |

### Others

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.000447 | 0.375 | 0.001904 | 62 |
| 2 | Search-Load | 0.000435 | 0.371 | 0.001867 | 62 |
| 3 | Logical-Control | 0.000428 | 0.367 | 0.001861 | 62 |
| 4 | Verbal-Language | 0.000428 | 0.367 | 0.001861 | 62 |
| 5 | Abstraction-Learning | 0.000414 | 0.359 | 0.001722 | 62 |

### Qwen

| Rank | Tag | Slope/year | Corr | Delta | N |
|---:|---|---:|---:|---:|---:|
| 1 | Quantitative-Formal | 0.000841 | 0.569 | 0.003424 | 83 |
| 2 | Search-Load | 0.000824 | 0.569 | 0.003348 | 83 |
| 3 | Logical-Control | 0.000817 | 0.569 | 0.003316 | 83 |
| 4 | Verbal-Language | 0.000817 | 0.569 | 0.003316 | 83 |
| 5 | Abstraction-Learning | 0.000729 | 0.534 | 0.003222 | 83 |

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
| DeepSeek | Multilingual_v1.1 | 0.002073 |
| Llama | Coding | 0.000373 |

## Caveats

- This analysis uses projected `model.tag_scores` from the current latent tag projection.
- The trends are not direct evidence of training-data investment, product strategy, or benchmark author intent.
- Family-level slopes are descriptive and can be sensitive to release-date clustering and small sample sizes.
- Event jumps compare model cohorts to a pre-window baseline; they are descriptive, not causal.
- Frontier lines show observed best-so-far projected tag scores; a flat line can mean no newer model exceeded the previous maximum.
- `slope_per_year` is computed on raw projected tag scores, so compare ranks more than absolute magnitudes.
