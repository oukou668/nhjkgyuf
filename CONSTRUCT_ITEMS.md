# Construct dictionary item examples

The dictionary displays only tags in `data/dashboard_data_20260616.json` → `tags`
(18 in this snapshot), retaining the existing rubric order. The 13 unused rubric
entries are excluded from the UI; original rubric and model data are preserved.

Rebuild the example bundle from the repository root:

```sh
python3 meta-eval-dashboard/build_tag_examples.py
```

To use a complete local annotation directory instead of the nine cached datasets:

```sh
python3 meta-eval-dashboard/build_tag_examples.py --source-root /path/to/tagging_outputs
```

The input layout is `DATASET/tagging_records.jsonl`. Records are merged by dataset
and item ID (content hash fallback). Each item/tag uses its latest successful,
valid 0–5 annotation. Ranking is score descending, confidence descending, then
dataset and item ID for deterministic ties. Only positive-score items are shown,
up to ten per tag. The first three appear immediately; the remaining items are expandable. Missing annotation coverage and all-zero coverage have
separate empty states. These are item-level demand scores, not model scores.

The initial local cache covers 1,146 unique items in 9 datasets. Visual has no
annotations; Game-Environment has no positive scores; Coding_v1.1 has only two
positive-score items. The UI explicitly describes its local coverage, so these
examples should not be interpreted as the highest scores across all benchmarks.

`data/tag_item_examples.json` contains coverage counts and only the selected full
items. Cards show question excerpts and annotation rationales. `item.html` opens
the complete question, source record, and expandable original fields and other
tag annotations. Source content is escaped and rendered as text. Multi-IF prompt
turns are decoded and preserved in order. Original fields may include reference
answers or textual references to media; external media are not fetched.

Preview locally:

```sh
cd meta-eval-dashboard
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/#tagsView`.
