# v7 ranking

Default source: `data/dashboard_data_v7.json` (HTTP), or the identical
`data/dashboard_data_v7.js` bundle for direct file opening.

Selected run: `capability-structure-validation-v7__finetune__fixdiff__vd5__f01__ps303__a1p2__fs401__base`.
This is the representative K=5 run used by the existing v7 construct heatmap,
not a claim that K=5 is the globally best run. It contains 288 models and 106 benchmarks.

## Model score

`capability_mean = sum(estimated_capability) / 5`.
Sort descending on unrounded raw values. Preserve negative values. Exact ties share
competition rank (1, 1, 3), with alphabetical order for display. No absolute values,
L2 norms, benchmark rank points, tag percentiles, imputation, or rescaling enter this score.
It is a scalar summary of this fitted latent space, not a percentage or a guarantee
of predictive accuracy. Scores from separately fitted runs are not automatically comparable.

Timeline, model profiles, default heatmap ordering, and the v7 score-matrix view use
this definition. Filtering does not recompute the global ranks. Timeline only plots
models with known release dates from 2023 onward; all models remain in the ranking.
30 model release dates are unavailable in the matched legacy metadata.

## Other v7 data

Benchmark predictions follow the training parameterization:
`p_ij = sigmoid(softplus(raw_scale_j) * dot(entmax_1.2(mask_j), theta_i) - diff_j)`.
`difficulty_b = diff / softplus(raw_scale)`, `difficulty_b_scaled = diff`;
predicted difficulty is `1 - mean_i(p_ij)`. The optional normalized difficulty
weight remains available as a descriptive benchmark metric, but does not weight model ranks.

Semantic profiles are `zscore(theta) @ R`, using the published v7 signed per-tag
bridge and population-standard-deviation normalization. They reconcile to the
existing v7 raw C_tag heatmap. Annotation activity is recomputed from v7 tag_targets;
unannotated benchmarks have no tag scores. Static rubric definitions and exact-name
release dates are retained from the prior snapshot, not used to estimate scores.
The older Science definition is not relabelled as Science_v1.1.

## Rebuild

This GitHub repository is the deployable dashboard snapshot. The rebuild commands
below require the full local `Meta_Eval_Analysis-main` analysis repository and its
source datasets; they are not standalone commands for this snapshot repository.
To validate this snapshot alone, run `node test_v7_ranking.cjs`.

From the full analysis repository root:

```sh
python3 meta-eval-dashboard/build_v7_data.py
python3 score-matrix-site/build_data.py
node meta-eval-dashboard/test_v7_ranking.cjs
```

Builders validate counts and reconcile saved predictions to within 1e-6 and
published tag profiles to within 1e-10. The old `dashboard_data_20260616.json`
is untouched; the score-matrix selector retains explicitly labelled legacy views.
