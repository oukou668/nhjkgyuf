#!/usr/bin/env python3
"""Build browser-friendly JSON for the Meta Eval dashboard."""

from __future__ import annotations

import contextlib
import io
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REMOTE_SOURCE_ROOT = ROOT / "meta-eval-dashboard" / "source_data" / "remote_bettercode"
LOCAL_OUTPUTS_ROOT = ROOT / "outputs"
OUT_JSON = ROOT / "meta-eval-dashboard" / "data" / "dashboard_data.json"
EXCLUDED_RUN_TAG_PREFIXES = {
    "extend4085_",
}


def discover_run_candidates() -> list[dict[str, Any]]:
    roots = [
        {
            "name": "remote_bettercode",
            "label": "Remote bettercode snapshot",
            "root": REMOTE_SOURCE_ROOT,
            "outputs": REMOTE_SOURCE_ROOT / "outputs",
            "tags": REMOTE_SOURCE_ROOT / "data_added" / "benchmarks_tags.csv",
            "priority": 0,
            "fit_source": "remote snapshot only; raw score rows were not copied",
        },
        {
            "name": "local_outputs",
            "label": "Local outputs",
            "root": ROOT,
            "outputs": LOCAL_OUTPUTS_ROOT,
            "tags": ROOT / "data_added" / "benchmarks_tags.csv",
            "priority": 1,
            "fit_source": "local data_loader.scores_df",
        },
    ]
    candidates = []
    for source in roots:
        outputs = source["outputs"]
        if not outputs.exists():
            continue
        for model_csv in outputs.glob("model_params_*.csv"):
            run_tag = model_csv.name.removeprefix("model_params_").removesuffix(".csv")
            if any(run_tag.startswith(prefix) for prefix in EXCLUDED_RUN_TAG_PREFIXES):
                continue
            bench_csv = outputs / f"bench_params_{run_tag}.csv"
            if not bench_csv.exists():
                continue
            candidates.append(
                {
                    **source,
                    "run_tag": run_tag,
                    "model_csv": model_csv,
                    "bench_csv": bench_csv,
                    "mtime": max(model_csv.stat().st_mtime, bench_csv.stat().st_mtime),
                }
            )
    return sorted(candidates, key=lambda c: (c["priority"], -c["mtime"]))


def discover_latest_run() -> dict[str, Any]:
    candidates = discover_run_candidates()
    if not candidates:
        raise FileNotFoundError("No model_params_*.csv + bench_params_*.csv pair found.")
    return candidates[0]


RUN = discover_latest_run()
RUN_TAG = RUN["run_tag"]
MODEL_CSV = RUN["model_csv"]
BENCH_CSV = RUN["bench_csv"]
TAGS_CSV = RUN["tags"] if RUN["tags"].exists() else ROOT / "data_added" / "benchmarks_tags.csv"
TAG_SCORES_CSV = REMOTE_SOURCE_ROOT / "data_added" / "benchmarks_tags_rubric_coarse_scores.csv"
TAG_ACTIVITY_CSV = REMOTE_SOURCE_ROOT / "tag_activity_stats.csv"
TAG_STATS_JSON = REMOTE_SOURCE_ROOT / "tagging_benchmark_tag_stats.json"
RUBRICS_JSON = REMOTE_SOURCE_ROOT / "rubrics.json"
BENCHMARK_OPTIM_CSV = ROOT / "data" / "benchmark_optim.csv"
BENCHMARK_RELEASE_DATES_EXTRA_CSV = ROOT / "meta-eval-dashboard" / "source_data" / "benchmark_release_dates_extra.csv"
REMOTE_BENCHMARK_RELEASE_DATES_CSV = (
    REMOTE_SOURCE_ROOT / "data_added" / "benchmark_release_dates.csv"
)
MODEL_VERSION_FILES = [
    REMOTE_SOURCE_ROOT / "data" / "model_versions.csv",
    ROOT / "data" / "model_versions.csv",
    REMOTE_SOURCE_ROOT / "data_added" / "model_versions_added.csv",
    ROOT / "data_added" / "model_versions_added.csv",
]
BENCHMARK_SOURCE_ALIASES = {
    "livecodebench/code_generation_lite_v1": "LiveCodeBench v1",
    "livecodebench/code_generation_lite_v4": "LiveCodeBench v4",
    "livecodebench/code_generation_lite_v5": "LiveCodeBench v5",
}
METHOD = RUN_TAG.split("_vd=")[0]
R_MATCH = re.search(r"(?:^|_)R=([0-9.]+)", RUN_TAG)
R_VALUE = float(R_MATCH.group(1)) if R_MATCH else 0.1
OUT_JSON = ROOT / "meta-eval-dashboard" / "data" / "dashboard_data.json"


FLOAT_WRAPPER_RE = re.compile(r"\bnp\.float(?:16|32|64)\(([^()]*)\)")


def parse_vector(value: Any) -> list[float]:
    if isinstance(value, str):
        cleaned = FLOAT_WRAPPER_RE.sub(r"\1", value)
        raw = json.loads(cleaned.replace("'", '"'))
    else:
        raw = value
    return [clean_number(item) for item in raw]


def clean_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def softmax(values: list[float]) -> list[float]:
    arr = np.asarray(values, dtype=np.float64)
    arr = arr - np.nanmax(arr)
    exp = np.exp(arr)
    total = exp.sum()
    if not math.isfinite(float(total)) or total == 0:
        return [0.0 for _ in values]
    return [float(x) for x in exp / total]


def softmax_matrix(matrix: np.ndarray, axis: int) -> np.ndarray:
    arr = np.asarray(matrix, dtype=np.float64)
    shifted = arr - np.nanmax(arr, axis=axis, keepdims=True)
    exp = np.exp(shifted)
    total = exp.sum(axis=axis, keepdims=True)
    return np.divide(exp, np.where(total > 0, total, 1.0))


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def predicted_pass_rate(capability: list[float], difficulty: list[float], weights: list[float], r: float) -> float:
    if not capability or not difficulty:
        return 0.0
    if not weights:
        weights = [1.0 / len(difficulty) for _ in difficulty]
    total = 0.0
    for model_value, bench_value, weight in zip(capability, difficulty, weights):
        total += weight * (sigmoid(model_value - bench_value) ** r)
    return clamp_number(total ** (1.0 / r), 0.0, 1.0)


def clamp_number(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def truthy(value: Any) -> bool:
    if pd.isna(value):
        return False
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y"}


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def load_benchmark_name_map() -> dict[str, str]:
    path = REMOTE_SOURCE_ROOT / "data_added" / "benchmarkname.csv"
    name_map = dict(BENCHMARK_SOURCE_ALIASES)
    if not path.exists():
        return name_map
    df = pd.read_csv(path)
    for _, row in df.iterrows():
        if pd.notna(row.get("from")) and pd.notna(row.get("to")):
            name_map[str(row["from"])] = str(row["to"])
    return name_map


def load_tags() -> tuple[dict[str, list[str]], dict[str, dict[str, float]], list[str]]:
    if TAG_ACTIVITY_CSV.exists() and TAG_STATS_JSON.exists():
        activity_df = pd.read_csv(TAG_ACTIVITY_CSV)
        tag_columns = [str(tag) for tag in activity_df["tag"].dropna().tolist()]
        stats = json.loads(TAG_STATS_JSON.read_text(encoding="utf-8"))
        name_map = load_benchmark_name_map()

        tag_lookup: dict[str, list[str]] = {}
        tag_score_lookup: dict[str, dict[str, float]] = {}
        for source_name, tag_stats in (stats.get("by_benchmark") or {}).items():
            display_name = name_map.get(source_name, source_name)
            source_tail = source_name.split("/")[-1]
            tail_display = source_tail.replace("_", " ").replace("-", " ")
            if source_name.startswith("nonhf/") and source_name not in name_map:
                display_name = tail_display
            scores = {}
            for tag in tag_columns:
                score = ((tag_stats.get(tag) or {}).get("score") or {}).get("weighted_mean")
                scores[tag] = clean_number(score) or 0.0
            active_tags = [tag for tag, score in scores.items() if score > 0]
            for alias in {
                source_name,
                display_name,
                source_tail,
                tail_display,
                normalize_name(source_name),
                normalize_name(display_name),
                normalize_name(source_tail),
                normalize_name(tail_display),
            }:
                tag_score_lookup[alias] = scores
                tag_lookup[alias] = active_tags
        return tag_lookup, tag_score_lookup, tag_columns

    tags_df = pd.read_csv(TAGS_CSV)
    tag_columns = [col for col in tags_df.columns if col != "benchmark"]
    tag_lookup: dict[str, list[str]] = {}
    tag_score_lookup: dict[str, dict[str, float]] = {}
    for _, row in tags_df.iterrows():
        tags = [col for col in tag_columns if truthy(row[col])]
        benchmark = str(row["benchmark"])
        tag_lookup[benchmark] = tags
        tag_score_lookup[benchmark] = {tag: 1.0 if tag in tags else 0.0 for tag in tag_columns}
    return tag_lookup, tag_score_lookup, tag_columns


def vector_stats(values: list[float]) -> dict[str, float]:
    arr = np.asarray(values, dtype=np.float64)
    return {
        "sum": float(arr.sum()),
        "mean": float(arr.mean()),
        "min": float(arr.min()),
        "max": float(arr.max()),
        "l2": float(np.linalg.norm(arr)),
    }


def classify_family(model_name: str) -> str:
    name = model_name.lower()
    if any(token in name for token in ["gpt", "o1", "o3", "o4", "chatgpt"]):
        return "GPT"
    if "claude" in name:
        return "Claude"
    if "gemini" in name or "palm" in name:
        return "Gemini"
    if "deepseek" in name:
        return "DeepSeek"
    if "qwen" in name or "qwq" in name:
        return "Qwen"
    if "glm" in name or "chatglm" in name:
        return "GLM"
    if "llama" in name:
        return "Llama"
    if "kimi" in name or "moonshot" in name:
        return "Kimi"
    return "Others"


def load_model_release_dates() -> dict[str, str]:
    release_rows: list[tuple[str, pd.Timestamp]] = []
    for path in MODEL_VERSION_FILES:
        if not path.exists():
            continue
        df = pd.read_csv(path)
        if "Version release date" not in df.columns:
            continue
        name_columns = ["id"] if "id" in df.columns else [
            col for col in ["Model", "Display name", "Unique display name"] if col in df.columns
        ]
        for _, row in df.iterrows():
            date = pd.to_datetime(row.get("Version release date"), errors="coerce")
            if pd.isna(date):
                continue
            for col in name_columns:
                value = row.get(col)
                if pd.notna(value) and str(value).strip():
                    release_rows.append((str(value), date))

    release_dates: dict[str, str] = {}
    for model_name, date in sorted(release_rows, key=lambda item: item[1]):
        release_dates.setdefault(model_name, date.strftime("%Y-%m-%d"))
    return release_dates


def load_benchmark_release_dates() -> dict[str, str]:
    release_dates: dict[str, str] = {}
    if BENCHMARK_OPTIM_CSV.exists():
        df = pd.read_csv(BENCHMARK_OPTIM_CSV)
        if "benchmark" in df.columns and "benchmark_release_date" in df.columns:
            for _, row in df.iterrows():
                name = row.get("benchmark")
                date = pd.to_datetime(row.get("benchmark_release_date"), errors="coerce")
                if pd.isna(name) or pd.isna(date):
                    continue
                text_name = str(name)
                formatted = date.strftime("%Y-%m-%d")
                release_dates.setdefault(text_name, formatted)
                release_dates.setdefault(normalize_name(text_name), formatted)

    if BENCHMARK_RELEASE_DATES_EXTRA_CSV.exists():
        extra_df = pd.read_csv(BENCHMARK_RELEASE_DATES_EXTRA_CSV)
        if "benchmark" in extra_df.columns and "release_date" in extra_df.columns:
            for _, row in extra_df.iterrows():
                name = row.get("benchmark")
                date = pd.to_datetime(row.get("release_date"), errors="coerce")
                if pd.isna(name) or pd.isna(date):
                    continue
                text_name = str(name).strip()
                if not text_name:
                    continue
                formatted = date.strftime("%Y-%m-%d")
                release_dates[text_name] = formatted
                release_dates[normalize_name(text_name)] = formatted

    if REMOTE_BENCHMARK_RELEASE_DATES_CSV.exists():
        remote_df = pd.read_csv(REMOTE_BENCHMARK_RELEASE_DATES_CSV)
        if "benchmark_name" in remote_df.columns and "release_date" in remote_df.columns:
            for _, row in remote_df.iterrows():
                name = row.get("benchmark_name")
                date = pd.to_datetime(row.get("release_date"), errors="coerce")
                if pd.isna(name) or pd.isna(date):
                    continue
                text_name = str(name).strip()
                if not text_name:
                    continue
                formatted = date.strftime("%Y-%m-%d")
                release_dates[text_name] = formatted
                release_dates[normalize_name(text_name)] = formatted

    alias_to_source = {
        "Arc-C": "ARC AI2",
        "GPQA": "GPQA diamond",
        "LiveBench 24-08-31": "LiveBench",
        "LiveBench 24-11-25": "LiveBench",
        "MATH": "MATH level 5",
        "OpenbookQA": "OpenBookQA",
        "SWE-Bench Verified": "SWE-Bench verified",
    }
    for alias, source in alias_to_source.items():
        source_date = release_dates.get(source) or release_dates.get(normalize_name(source))
        if not source_date:
            continue
        release_dates.setdefault(alias, source_date)
        release_dates.setdefault(normalize_name(alias), source_date)
    return release_dates


def build_tag_projection(
    models: list[dict[str, Any]],
    benchmarks: list[dict[str, Any]],
    tag_columns: list[str],
    dim_count: int,
) -> dict[str, Any]:
    valid_benchmarks = [
        bench
        for bench in benchmarks
        if len(bench.get("estimated_difficulty") or []) == dim_count
    ]
    difficulty_matrix = np.asarray(
        [bench["estimated_difficulty"] for bench in valid_benchmarks],
        dtype=np.float64,
    )
    benchmark_tag_matrix = np.zeros((len(valid_benchmarks), len(tag_columns)), dtype=np.float64)
    tag_index = {tag: index for index, tag in enumerate(tag_columns)}
    tag_document_frequency = {tag: 0 for tag in tag_columns}
    active_tags_by_benchmark: list[list[str]] = []
    for bench in valid_benchmarks:
        tag_scores = bench.get("tag_scores") or {tag: 1.0 for tag in bench.get("tags", [])}
        active_tags = [tag for tag, score in tag_scores.items() if tag in tag_index and (clean_number(score) or 0.0) > 0]
        active_tags_by_benchmark.append(active_tags)
        for tag in set(active_tags):
            tag_document_frequency[tag] += 1
    benchmark_count = len(valid_benchmarks)
    idf = {
        tag: math.log((benchmark_count + 1) / (count + 1)) + 1.0
        for tag, count in tag_document_frequency.items()
    }
    for bench_index, bench in enumerate(valid_benchmarks):
        active_tags = active_tags_by_benchmark[bench_index]
        total = sum(idf[tag] for tag in active_tags)
        if total <= 0:
            continue
        for tag in active_tags:
            benchmark_tag_matrix[bench_index, tag_index[tag]] = idf[tag] / total

    masked_dfct = np.zeros_like(difficulty_matrix)
    if len(valid_benchmarks):
        weights_matrix = np.asarray(
            [
                bench.get("weights") if len(bench.get("weights") or []) == dim_count else softmax(bench.get("mask") or [])
                for bench in valid_benchmarks
            ],
            dtype=np.float64,
        )
        shifted_difficulty = difficulty_matrix - difficulty_matrix.min(axis=1, keepdims=True)
        masked_dfct = weights_matrix * shifted_difficulty

    weighted_raw = np.zeros((dim_count, len(tag_columns)), dtype=np.float64)
    for dim_index in range(dim_count):
        values = masked_dfct[:, dim_index] if len(valid_benchmarks) else np.asarray([], dtype=np.float64)
        strengths = np.asarray(softmax(values), dtype=np.float64).reshape(-1, 1) if len(values) else np.zeros((0, 1), dtype=np.float64)
        weighted_raw[dim_index] = (strengths * benchmark_tag_matrix).sum(axis=0)

    model_tag_map = weighted_raw
    capability_matrix = np.asarray([model["estimated_capability"] for model in models], dtype=np.float64)
    normalized_capability = softmax_matrix(capability_matrix, axis=0) if len(models) else capability_matrix
    model_tag_matrix = normalized_capability @ model_tag_map if len(models) else np.zeros((0, len(tag_columns)))
    normalized_tag_vectors = {
        tag: [float(x) for x in model_tag_map[:, index]]
        for index, tag in enumerate(tag_columns)
    }

    model_scores = []
    for model_index, model in enumerate(models):
        scores = model_tag_matrix[model_index]
        score_map = {tag: float(scores[i]) for i, tag in enumerate(tag_columns)}
        model["tag_scores"] = score_map
        model["tag_score_sum"] = float(scores.sum())
        model_scores.append({"model": model["model"], "scores": score_map, "sum": float(scores.sum())})

    return {
        "tag_vectors": normalized_tag_vectors,
        "formula": "softmax_over_models(model_capability) @ notebook_weighted_raw_dim_tag(masked_dfct, idf_weighted_tags)",
        "model_scores": model_scores,
    }


def load_tag_reference() -> dict[str, Any]:
    explanations: dict[str, dict[str, Any]] = {}
    rubric_tags: list[dict[str, Any]] = []
    if RUBRICS_JSON.exists():
        rubrics = json.loads(RUBRICS_JSON.read_text(encoding="utf-8"))
        for head, head_info in (rubrics.get("heads") or {}).items():
            for tag, info in (head_info.get("tags") or {}).items():
                if not isinstance(info, dict):
                    continue
                if not any(info.get(key) for key in ("zh", "definition", "anchors")):
                    continue
                tag_reference = {
                    "tag": tag,
                    "head": head,
                    "head_description": head_info.get("description"),
                    "zh": info.get("zh"),
                    "definition": info.get("definition"),
                    "anchors": info.get("anchors") or {},
                    "boundary_notes": info.get("boundary_notes") or [],
                }
                explanations[tag] = tag_reference
                rubric_tags.append(tag_reference)

    active_by_tag: dict[str, list[dict[str, Any]]] = {}
    if TAG_STATS_JSON.exists():
        stats = json.loads(TAG_STATS_JSON.read_text(encoding="utf-8"))
        name_map = load_benchmark_name_map()
        for source_name, tag_stats in (stats.get("by_benchmark") or {}).items():
            display_name = name_map.get(source_name, source_name)
            for tag, stats_for_tag in tag_stats.items():
                score = ((stats_for_tag or {}).get("score") or {}).get("weighted_mean")
                score = clean_number(score)
                if score is None:
                    continue
                active_by_tag.setdefault(str(tag), []).append(
                    {
                        "benchmark": display_name,
                        "source": source_name,
                        "score": score,
                    }
                )

    activity = []
    if TAG_ACTIVITY_CSV.exists():
        activity_df = pd.read_csv(TAG_ACTIVITY_CSV)
        for _, row in activity_df.iterrows():
            tag = str(row["tag"])
            ref = explanations.get(tag, {})
            tau = clean_number(row.get("tau"))
            active_benchmarks = [
                item for item in active_by_tag.get(tag, [])
                if tau is not None and item["score"] > tau
            ]
            active_benchmarks = sorted(
                active_benchmarks,
                key=lambda item: (-item["score"], item["benchmark"].lower()),
            )
            activity.append(
                {
                    "tag": tag,
                    "head": ref.get("head"),
                    "head_description": ref.get("head_description"),
                    "zh": ref.get("zh"),
                    "definition": ref.get("definition"),
                    "n_active_benchmarks": int(row["n_active_benchmarks"]),
                    "n_total_benchmarks": int(row["n_total_benchmarks"]),
                    "n_all_benchmarks": int(row["n_all_benchmarks"]),
                    "active_ratio": clean_number(row.get("active_ratio")),
                    "score_mean": clean_number(row.get("score_mean")),
                    "score_std": clean_number(row.get("score_std")),
                    "score_mean_all": clean_number(row.get("score_mean_all")),
                    "score_std_all": clean_number(row.get("score_std_all")),
                    "tau": tau,
                    "active_benchmarks": active_benchmarks,
                }
            )

    return {
        "activity": activity,
        "explanations": explanations,
        "rubric_tags": rubric_tags,
        "source_files": {
            "activity": str(TAG_ACTIVITY_CSV.relative_to(ROOT)) if TAG_ACTIVITY_CSV.exists() else None,
            "rubrics": str(RUBRICS_JSON.relative_to(ROOT)) if RUBRICS_JSON.exists() else None,
        },
    }


def build_models_for_run(
    models_df: pd.DataFrame,
    release_dates: dict[str, str],
    tag_columns: list[str],
) -> list[dict[str, Any]]:
    models = []
    for _, row in models_df.iterrows():
        model_name = str(row["model"])
        capability = parse_vector(row["estimated_capability"])
        stats = vector_stats(capability)
        models.append(
            {
                "model_id": row["model_id"],
                "model": model_name,
                "family": classify_family(model_name),
                "release_date": release_dates.get(model_name),
                "estimated_capability": capability,
                "capability_sum": stats["sum"],
                "capability_mean": stats["mean"],
                "capability_l2": stats["l2"],
            }
        )
    return models


def build_benchmarks_for_run(
    benches_df: pd.DataFrame,
    tag_lookup: dict[str, list[str]],
    tag_score_lookup: dict[str, dict[str, float]],
    release_dates: dict[str, str],
) -> list[dict[str, Any]]:
    benchmarks = []
    for _, row in benches_df.iterrows():
        difficulty = parse_vector(row["estimated_difficulty"])
        mask = parse_vector(row["mask"]) if "mask" in row else []
        weights = softmax(mask) if mask else []
        weighted_difficulty = (
            float(np.dot(np.asarray(difficulty, dtype=np.float64), np.asarray(weights, dtype=np.float64)))
            if difficulty and weights and len(difficulty) == len(weights)
            else None
        )
        stats = vector_stats(difficulty)
        name = str(row["benchmark_name"])
        tag_scores = tag_score_lookup.get(name) or tag_score_lookup.get(normalize_name(name)) or {}
        benchmarks.append(
            {
                "benchmark_id": row["benchmark_id"],
                "benchmark_name": name,
                "release_date": release_dates.get(name) or release_dates.get(normalize_name(name)),
                "estimated_difficulty": difficulty,
                "difficulty_weighted": weighted_difficulty,
                "difficulty_sum": stats["sum"],
                "difficulty_mean": stats["mean"],
                "difficulty_l2": stats["l2"],
                "slope": clean_number(row.get("slope")),
                "mask": mask,
                "weights": weights,
                "tags": tag_lookup.get(name) or tag_lookup.get(normalize_name(name), []),
                "tag_scores": tag_scores,
            }
        )
    return benchmarks


def add_predicted_difficulty_scores(
    models: list[dict[str, Any]],
    benchmarks: list[dict[str, Any]],
    r_value: float,
) -> None:
    capabilities = [model["estimated_capability"] for model in models]
    for bench in benchmarks:
        predictions = [
            predicted_pass_rate(capability, bench["estimated_difficulty"], bench["weights"], r_value)
            for capability in capabilities
        ]
        mean_pass = float(np.mean(predictions)) if predictions else None
        if mean_pass is None or not math.isfinite(mean_pass):
            bench["predicted_pass_mean"] = None
            bench["difficulty_score"] = None
            continue
        bench["predicted_pass_mean"] = mean_pass
        bench["difficulty_score"] = 1.0 - mean_pass


def run_metadata(run: dict[str, Any], models: list[dict[str, Any]], benchmarks: list[dict[str, Any]], dim_count: int) -> dict[str, Any]:
    run_tag = run["run_tag"]
    r_match = re.search(r"(?:^|_)R=([0-9.]+)", run_tag)
    return {
        "run_tag": run_tag,
        "method": run_tag.split("_vd=")[0],
        "r": float(r_match.group(1)) if r_match else 0.1,
        "source_name": run["name"],
        "source_label": run["label"],
        "source_mtime": run["mtime"],
        "fit_source": run["fit_source"],
        "model_count": len(models),
        "benchmark_count": len(benchmarks),
        "dimension_count": dim_count,
        "source_files": {
            "models": str(run["model_csv"].relative_to(ROOT)),
            "benchmarks": str(run["bench_csv"].relative_to(ROOT)),
        },
    }


def build_run_payload(run: dict[str, Any], tag_columns: list[str], include_tag_projection: bool) -> dict[str, Any]:
    models_df = pd.read_csv(run["model_csv"])
    benches_df = pd.read_csv(run["bench_csv"])
    tag_lookup, tag_score_lookup, _ = load_tags()
    release_dates = load_model_release_dates()
    benchmark_release_dates = load_benchmark_release_dates()
    models = build_models_for_run(models_df, release_dates, tag_columns)
    benchmarks = build_benchmarks_for_run(benches_df, tag_lookup, tag_score_lookup, benchmark_release_dates)
    run_r_match = re.search(r"(?:^|_)R=([0-9.]+)", run["run_tag"])
    add_predicted_difficulty_scores(models, benchmarks, float(run_r_match.group(1)) if run_r_match else 0.1)

    dim_count = len(models[0]["estimated_capability"]) if models else 0
    payload = {
        "metadata": run_metadata(run, models, benchmarks, dim_count),
        "dimensions": [f"dim_{i}" for i in range(dim_count)],
        "models": models,
        "benchmarks": benchmarks,
    }
    if include_tag_projection:
        payload["tag_projection"] = build_tag_projection(models, benchmarks, tag_columns, dim_count)
    return payload


def build_core_payload() -> dict[str, Any]:
    tag_lookup, tag_score_lookup, tag_columns = load_tags()
    release_dates = load_model_release_dates()
    benchmark_release_dates = load_benchmark_release_dates()
    models_df = pd.read_csv(MODEL_CSV)
    benches_df = pd.read_csv(BENCH_CSV)
    models = build_models_for_run(models_df, release_dates, tag_columns)
    benchmarks = build_benchmarks_for_run(benches_df, tag_lookup, tag_score_lookup, benchmark_release_dates)
    add_predicted_difficulty_scores(models, benchmarks, R_VALUE)

    dim_count = len(models[0]["estimated_capability"]) if models else 0
    tag_counts = {tag: 0 for tag in tag_columns}
    for bench in benchmarks:
        for tag in bench["tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    tag_projection = build_tag_projection(models, benchmarks, tag_columns, dim_count)
    tag_reference = load_tag_reference()
    timeline = [
        {
            "model": model["model"],
            "family": model["family"],
            "release_date": model["release_date"],
            "capability_sum": model["capability_sum"],
        }
        for model in models
        if model.get("release_date")
    ]
    family_counts: dict[str, int] = {}
    for point in timeline:
        family_counts[point["family"]] = family_counts.get(point["family"], 0) + 1

    payload = {
        "metadata": {
            "run_tag": RUN_TAG,
            "method": METHOD,
            "r": R_VALUE,
            "source_name": RUN["name"],
            "source_label": RUN["label"],
            "source_mtime": RUN["mtime"],
            "fit_source": RUN["fit_source"],
            "model_count": len(models),
            "benchmark_count": len(benchmarks),
            "dimension_count": dim_count,
            "tag_count": len(tag_columns),
            "source_files": {
                "models": str(MODEL_CSV.relative_to(ROOT)),
                "benchmarks": str(BENCH_CSV.relative_to(ROOT)),
                "tags": str((TAG_STATS_JSON if TAG_STATS_JSON.exists() else TAGS_CSV).relative_to(ROOT)),
            },
        },
        "dimensions": [f"dim_{i}" for i in range(dim_count)],
        "tags": tag_columns,
        "tag_counts": tag_counts,
        "tag_projection": tag_projection,
        "tag_reference": tag_reference,
        "timeline": timeline,
        "family_counts": family_counts,
        "models": models,
        "benchmarks": benchmarks,
    }

    training_runs = []
    for candidate in discover_run_candidates():
        run_payload = build_run_payload(candidate, tag_columns, include_tag_projection=True)
        training_runs.append(run_payload)
    payload["training_runs"] = training_runs
    return payload


def try_build_fit_payload() -> dict[str, Any]:
    if RUN["name"] != "local_outputs":
        return {
            "available": False,
            "reason": "Latest dashboard uses copied remote parameter CSVs; raw score rows were not copied, so fit scatter is intentionally not rebuilt from stale local data.",
        }
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            import data_loader

        model_df = pd.read_csv(MODEL_CSV)
        bench_df = pd.read_csv(BENCH_CSV)
        model_lookup = {
            str(row["model"]): np.asarray(parse_vector(row["estimated_capability"]), dtype=np.float64)
            for _, row in model_df.iterrows()
        }
        bench_lookup = {
            str(row["benchmark_name"]): {
                "difficulty": np.asarray(parse_vector(row["estimated_difficulty"]), dtype=np.float64),
                "weights": np.asarray(softmax(parse_vector(row["mask"])), dtype=np.float64),
            }
            for _, row in bench_df.iterrows()
        }
        scores_df = data_loader.scores_df.copy()
        rows = []
        for _, row in scores_df.iterrows():
            model_name = str(row["model"])
            benchmark_name = str(row["benchmark"])
            if model_name not in model_lookup or benchmark_name not in bench_lookup:
                continue
            capability = model_lookup[model_name]
            bench = bench_lookup[benchmark_name]
            delta = capability - bench["difficulty"]
            log_w = np.log(bench["weights"] + 1e-12)
            log_p = -np.logaddexp(0, -delta)
            values = log_w + R_VALUE * log_p
            max_value = np.max(values)
            log_sum = max_value + np.log(np.sum(np.exp(values - max_value)))
            pred = float(np.clip(np.exp((1.0 / R_VALUE) * log_sum), 0.0, 1.0))
            rows.append(
                {
                    "benchmark": benchmark_name,
                    "model": model_name,
                    "performance": float(row["performance"]),
                    "is_validation": False,
                    "predicted": pred,
                }
            )
        predicted = pd.DataFrame(rows)
        if predicted.empty:
            return {"available": False, "reason": "No overlapping prediction rows."}

        predicted["error"] = predicted["predicted"] - predicted["performance"]
        predicted["abs_error"] = predicted["error"].abs()
        mse = float(np.mean(np.square(predicted["error"])))
        mae = float(np.mean(predicted["abs_error"]))
        corr = clean_number(predicted[["performance", "predicted"]].corr().iloc[0, 1])

        by_benchmark = (
            predicted.groupby("benchmark")
            .agg(
                n=("error", "size"),
                mse=("error", lambda s: float(np.mean(np.square(s)))),
                mae=("abs_error", "mean"),
                mean_actual=("performance", "mean"),
                mean_predicted=("predicted", "mean"),
            )
            .reset_index()
            .sort_values("mse", ascending=False)
        )
        worst_rows = predicted.sort_values("abs_error", ascending=False).head(80)
        scatter_rows = predicted.sort_values("abs_error", ascending=False).head(1200)

        return {
            "available": True,
            "row_count": int(len(predicted)),
            "mse": mse,
            "mae": mae,
            "correlation": corr,
            "worst_rows": worst_rows[
                ["benchmark", "model", "performance", "predicted", "error", "abs_error"]
            ].round(6).to_dict(orient="records"),
            "benchmark_metrics": by_benchmark.round(6).to_dict(orient="records"),
            "scatter": scatter_rows[
                ["benchmark", "model", "performance", "predicted", "abs_error"]
            ].round(6).to_dict(orient="records"),
        }
    except Exception as exc:  # Dashboard remains useful without fit reconstruction.
        return {"available": False, "reason": f"{type(exc).__name__}: {exc}"}


def main() -> None:
    payload = build_core_payload()
    payload["fit"] = try_build_fit_payload()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        "Wrote "
        f"{OUT_JSON.relative_to(ROOT)} with "
        f"{payload['metadata']['model_count']} models, "
        f"{payload['metadata']['benchmark_count']} benchmarks, "
        f"{payload['metadata']['dimension_count']} dimensions."
    )
    if payload["fit"].get("available"):
        print(f"Fit rows: {payload['fit']['row_count']} | MSE: {payload['fit']['mse']:.6f}")
    else:
        print(f"Fit payload unavailable: {payload['fit'].get('reason')}")


if __name__ == "__main__":
    main()
