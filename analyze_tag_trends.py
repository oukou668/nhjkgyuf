#!/usr/bin/env python3
"""Analyze model tag-score trends over release time.

This script reads the static dashboard JSON and writes a reproducible trend
analysis for model x semantic-tag scores. It intentionally does not touch the
frontend; outputs are CSV, Markdown, and two dependency-free SVG charts.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from statistics import mean
from typing import Any

import numpy as np
import pandas as pd


DEFAULT_RUN_TAG = "extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3"
DEFAULT_START_DATE = "2023-01-01"
DEFAULT_FAMILY_MIN_N = 10
DEFAULT_OUTPUT_DIR = Path("meta-eval-dashboard") / "analysis" / "tag_trends"
DEFAULT_DATA_JSON = Path("meta-eval-dashboard") / "data" / "dashboard_data.json"
DEFAULT_EVENT_PRE_DAYS = 180
DEFAULT_FRONTIER_TAGS = [
    "Quantitative-Formal",
    "Logical-Control",
    "Abstraction-Learning",
    "Search-Load",
    "Coding",
    "Science",
]


@dataclass(frozen=True)
class EventSpec:
    event_id: str
    label: str
    family: str
    model_pattern: str


DEFAULT_EVENTS = [
    EventSpec("deepseek_r1", "DeepSeek R1", "DeepSeek", r"^DeepSeek-R1$"),
    EventSpec("claude_opus_4_6", "Claude Opus 4.6", "Claude", r"^claude-opus-4-6"),
]


@dataclass(frozen=True)
class TrendResult:
    scope: str
    family: str
    tag: str
    sample_count: int
    first_year: int
    last_year: int
    start_year_mean: float
    end_year_mean: float
    delta: float
    slope_per_year: float
    intercept: float
    correlation: float
    mean_score: float
    min_score: float
    max_score: float


@dataclass(frozen=True)
class EventJumpResult:
    event_id: str
    event_label: str
    family: str
    event_date: str
    tag: str
    pre_days: int
    pre_model_count: int
    event_model_count: int
    pre_mean: float
    event_mean: float
    jump: float
    pct_jump: float
    z_score: float
    pre_std: float
    event_models: str


@dataclass(frozen=True)
class FrontierPoint:
    tag: str
    release_date: str
    frontier_score: float
    best_model: str
    best_family: str
    best_model_release_date: str
    is_new_frontier: bool


def decimal_year(value: str) -> float:
    parsed = date.fromisoformat(value)
    start = date(parsed.year, 1, 1)
    next_start = date(parsed.year + 1, 1, 1)
    return parsed.year + (parsed - start).days / ((next_start - start).days)


def finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def select_run(data: dict[str, Any], run_tag: str) -> dict[str, Any]:
    runs = data.get("training_runs") or []
    for run in runs:
        if (run.get("metadata") or {}).get("run_tag") == run_tag:
            return run
    available = ", ".join((run.get("metadata") or {}).get("run_tag", "<unknown>") for run in runs)
    raise SystemExit(f"Run tag not found: {run_tag}\nAvailable runs: {available}")


def build_model_rows(run: dict[str, Any], tags: list[str], start_date: str) -> list[dict[str, Any]]:
    start = date.fromisoformat(start_date)
    rows: list[dict[str, Any]] = []
    for model in run.get("models") or []:
        release_date = model.get("release_date")
        tag_scores = model.get("tag_scores")
        if not release_date or not isinstance(tag_scores, dict):
            continue
        parsed_date = date.fromisoformat(release_date)
        if parsed_date < start:
            continue
        for tag in tags:
            score = finite_float(tag_scores.get(tag))
            if score is None:
                continue
            rows.append(
                {
                    "model": model.get("model", ""),
                    "family": model.get("family") or "Others",
                    "release_date": release_date,
                    "year": parsed_date.year,
                    "decimal_year": decimal_year(release_date),
                    "tag": tag,
                    "score": score,
                }
            )
    return rows


def build_model_records(run: dict[str, Any], tags: list[str], start_date: str) -> list[dict[str, Any]]:
    start = date.fromisoformat(start_date)
    records: list[dict[str, Any]] = []
    for model in run.get("models") or []:
        release_date = model.get("release_date")
        tag_scores = model.get("tag_scores")
        if not release_date or not isinstance(tag_scores, dict):
            continue
        parsed_date = date.fromisoformat(release_date)
        if parsed_date < start:
            continue
        scores = {}
        for tag in tags:
            score = finite_float(tag_scores.get(tag))
            if score is not None:
                scores[tag] = score
        if not scores:
            continue
        records.append(
            {
                "model": str(model.get("model", "")),
                "family": model.get("family") or "Others",
                "release_date": release_date,
                "date": parsed_date,
                "tag_scores": scores,
            }
        )
    return records


def compute_trend(scope: str, family: str, tag: str, rows: list[dict[str, Any]]) -> TrendResult | None:
    if len(rows) < 2:
        return None
    xs = np.asarray([row["decimal_year"] for row in rows], dtype=np.float64)
    ys = np.asarray([row["score"] for row in rows], dtype=np.float64)
    if len(np.unique(xs)) < 2 or not np.isfinite(xs).all() or not np.isfinite(ys).all():
        return None
    slope, intercept = np.polyfit(xs, ys, 1)
    corr = float(np.corrcoef(xs, ys)[0, 1]) if len(rows) > 2 and np.std(ys) > 0 else 0.0
    yearly: dict[int, list[float]] = defaultdict(list)
    for row in rows:
        yearly[int(row["year"])].append(float(row["score"]))
    first_year = min(yearly)
    last_year = max(yearly)
    start_mean = float(mean(yearly[first_year]))
    end_mean = float(mean(yearly[last_year]))
    return TrendResult(
        scope=scope,
        family=family,
        tag=tag,
        sample_count=len(rows),
        first_year=first_year,
        last_year=last_year,
        start_year_mean=start_mean,
        end_year_mean=end_mean,
        delta=end_mean - start_mean,
        slope_per_year=float(slope),
        intercept=float(intercept),
        correlation=corr,
        mean_score=float(np.mean(ys)),
        min_score=float(np.min(ys)),
        max_score=float(np.max(ys)),
    )


def compute_results(rows: list[dict[str, Any]], tags: list[str], family_min_n: int) -> tuple[list[TrendResult], Counter[str], list[str]]:
    model_by_family = Counter({family: len({row["model"] for row in family_rows}) for family, family_rows in group_by(rows, "family").items()})
    eligible_families = sorted(family for family, count in model_by_family.items() if count >= family_min_n)
    results: list[TrendResult] = []
    for tag in tags:
        tag_rows = [row for row in rows if row["tag"] == tag]
        result = compute_trend("overall", "All", tag, tag_rows)
        if result:
            results.append(result)

    for family in eligible_families:
        family_rows = [row for row in rows if row["family"] == family]
        for tag in tags:
            tag_rows = [row for row in family_rows if row["tag"] == tag]
            result = compute_trend("family", family, tag, tag_rows)
            if result:
                results.append(result)
    return results, model_by_family, eligible_families


def group_by(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row[key])].append(row)
    return dict(grouped)


def write_csv(path: Path, results: list[TrendResult]) -> None:
    fieldnames = list(TrendResult.__dataclass_fields__.keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(result.__dict__)


def write_event_csv(path: Path, results: list[EventJumpResult]) -> None:
    fieldnames = list(EventJumpResult.__dataclass_fields__.keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(result.__dict__)


def write_frontier_csv(path: Path, points: list[FrontierPoint]) -> None:
    fieldnames = list(FrontierPoint.__dataclass_fields__.keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for point in points:
            writer.writerow(point.__dict__)


def compute_event_jumps(
    records: list[dict[str, Any]],
    tags: list[str],
    event_specs: list[EventSpec],
    pre_days: int,
) -> tuple[list[EventJumpResult], list[str]]:
    results: list[EventJumpResult] = []
    notes: list[str] = []
    for event in event_specs:
        pattern = re.compile(event.model_pattern, re.IGNORECASE)
        matching = [
            record
            for record in records
            if record["family"] == event.family and pattern.search(record["model"])
        ]
        if not matching:
            notes.append(f"{event.label}: no matching models for pattern `{event.model_pattern}`.")
            continue

        event_date = min(record["date"] for record in matching)
        cohort = [record for record in matching if record["date"] == event_date]
        pre_start = event_date - timedelta(days=pre_days)
        pre = [
            record
            for record in records
            if record["family"] == event.family and pre_start <= record["date"] < event_date
        ]
        if not pre:
            pre = [
                record
                for record in records
                if record["family"] == event.family and record["date"] < event_date
            ]
            notes.append(f"{event.label}: no same-family models in the {pre_days}-day pre-window; used all prior family models.")
        if not pre:
            notes.append(f"{event.label}: no prior same-family baseline; skipped.")
            continue

        event_model_names = ", ".join(record["model"] for record in sorted(cohort, key=lambda item: item["model"]))
        for tag in tags:
            pre_values = [record["tag_scores"][tag] for record in pre if tag in record["tag_scores"]]
            event_values = [record["tag_scores"][tag] for record in cohort if tag in record["tag_scores"]]
            if not pre_values or not event_values:
                continue
            pre_mean = float(np.mean(pre_values))
            event_mean = float(np.mean(event_values))
            pre_std = float(np.std(pre_values, ddof=1)) if len(pre_values) > 1 else 0.0
            jump = event_mean - pre_mean
            pct_jump = jump / abs(pre_mean) if abs(pre_mean) > 1e-12 else 0.0
            z_score = jump / pre_std if pre_std > 1e-12 else 0.0
            results.append(
                EventJumpResult(
                    event_id=event.event_id,
                    event_label=event.label,
                    family=event.family,
                    event_date=event_date.isoformat(),
                    tag=tag,
                    pre_days=pre_days,
                    pre_model_count=len(pre),
                    event_model_count=len(cohort),
                    pre_mean=pre_mean,
                    event_mean=event_mean,
                    jump=jump,
                    pct_jump=pct_jump,
                    z_score=z_score,
                    pre_std=pre_std,
                    event_models=event_model_names,
                )
            )
    return results, notes


def parse_frontier_tags(value: str, available_tags: list[str]) -> list[str]:
    requested = [tag.strip() for tag in value.split(",") if tag.strip()]
    if not requested:
        return [tag for tag in DEFAULT_FRONTIER_TAGS if tag in available_tags]

    lookup = {tag.lower(): tag for tag in available_tags}
    parsed: list[str] = []
    missing: list[str] = []
    for tag in requested:
        canonical = lookup.get(tag.lower())
        if canonical:
            parsed.append(canonical)
        else:
            missing.append(tag)
    if missing:
        raise SystemExit(f"Unknown frontier tag(s): {', '.join(missing)}")
    return parsed


def compute_frontier_points(records: list[dict[str, Any]], tags: list[str]) -> list[FrontierPoint]:
    by_date: dict[date, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        by_date[record["date"]].append(record)

    seen: list[dict[str, Any]] = []
    current_best: dict[str, tuple[float, dict[str, Any]]] = {}
    points: list[FrontierPoint] = []
    for release_day in sorted(by_date):
        seen.extend(sorted(by_date[release_day], key=lambda record: record["model"]))
        for tag in tags:
            previous = current_best.get(tag)
            best_score = previous[0] if previous else -math.inf
            best_record = previous[1] if previous else None
            is_new = False
            for record in seen:
                score = record["tag_scores"].get(tag)
                if score is None:
                    continue
                if score > best_score + 1e-15:
                    best_score = score
                    best_record = record
                    is_new = True
            if best_record is None or not math.isfinite(best_score):
                continue
            current_best[tag] = (best_score, best_record)
            points.append(
                FrontierPoint(
                    tag=tag,
                    release_date=release_day.isoformat(),
                    frontier_score=float(best_score),
                    best_model=best_record["model"],
                    best_family=best_record["family"],
                    best_model_release_date=best_record["release_date"],
                    is_new_frontier=is_new,
                )
            )
    return points


def fmt(value: float, digits: int = 6) -> str:
    return f"{value:.{digits}f}"


def result_table(results: list[TrendResult], limit: int = 10) -> str:
    lines = ["| Rank | Tag | Slope/year | Corr | Delta | N |", "|---:|---|---:|---:|---:|---:|"]
    for index, result in enumerate(results[:limit], 1):
        lines.append(
            f"| {index} | {result.tag} | {fmt(result.slope_per_year)} | "
            f"{fmt(result.correlation, 3)} | {fmt(result.delta)} | {result.sample_count} |"
        )
    return "\n".join(lines)


def event_table(results: list[EventJumpResult], limit: int = 8) -> str:
    lines = [
        "| Rank | Tag | Jump | Event mean | Pre mean | Z | Event models |",
        "|---:|---|---:|---:|---:|---:|---|",
    ]
    for index, result in enumerate(results[:limit], 1):
        models = result.event_models
        if len(models) > 80:
            models = models[:77] + "..."
        lines.append(
            f"| {index} | {result.tag} | {fmt(result.jump)} | {fmt(result.event_mean)} | "
            f"{fmt(result.pre_mean)} | {fmt(result.z_score, 2)} | {html.escape(models)} |"
        )
    return "\n".join(lines)


def write_report(
    path: Path,
    results: list[TrendResult],
    event_results: list[EventJumpResult],
    event_notes: list[str],
    frontier_points: list[FrontierPoint],
    frontier_tags: list[str],
    family_counts: Counter[str],
    eligible_families: list[str],
    run_tag: str,
    start_date: str,
    rows: list[dict[str, Any]],
) -> None:
    overall = sorted([r for r in results if r.scope == "overall"], key=lambda r: r.slope_per_year, reverse=True)
    family_results = [r for r in results if r.scope == "family"]
    by_family: dict[str, list[TrendResult]] = defaultdict(list)
    for result in family_results:
        by_family[result.family].append(result)
    for family in by_family:
        by_family[family].sort(key=lambda r: r.slope_per_year, reverse=True)

    top_tags_by_family = {family: [r.tag for r in family_rows[:3]] for family, family_rows in by_family.items()}
    shared_counter = Counter(tag for tags in top_tags_by_family.values() for tag in tags)
    shared_tags = [(tag, count) for tag, count in shared_counter.most_common() if count >= 2]
    distinctive: list[tuple[str, str, float]] = []
    for family, family_rows in by_family.items():
        if not family_rows:
            continue
        top = family_rows[0]
        if shared_counter[top.tag] == 1:
            distinctive.append((family, top.tag, top.slope_per_year))

    model_count = len({row["model"] for row in rows})
    date_min = min(row["release_date"] for row in rows)
    date_max = max(row["release_date"] for row in rows)
    skipped = sorted(f"{family} ({count})" for family, count in family_counts.items() if family not in eligible_families)

    parts = [
        "# Tag Trend Analysis",
        "",
        f"- Run tag: `{run_tag}`",
        f"- Date filter: `{start_date}` onward",
        f"- Models analyzed: {model_count}",
        f"- Date range: {date_min} to {date_max}",
        f"- Eligible families: {', '.join(eligible_families)}",
        f"- Skipped families below threshold: {', '.join(skipped) if skipped else 'None'}",
        "",
        "## Overall Fastest-Rising Tags",
        "",
        result_table(overall, 10),
        "",
        "## Event Jump Analysis",
        "",
        (
            "This section compares the event model cohort against same-family models "
            "released in the pre-event window. It is designed for questions like "
            "`DeepSeek R1 -> reasoning tags` or `Opus 4.6 -> Coding`."
        ),
        "",
    ]
    by_event: dict[str, list[EventJumpResult]] = defaultdict(list)
    for result in event_results:
        by_event[result.event_id].append(result)
    for event_id, event_rows in by_event.items():
        event_rows.sort(key=lambda result: result.jump, reverse=True)
        event = event_rows[0]
        parts.extend(
            [
                f"### {event.event_label}",
                "",
                f"- Family: {event.family}",
                f"- Event date: {event.event_date}",
                f"- Pre-window: {event.pre_days} days, {event.pre_model_count} baseline models",
                f"- Event cohort: {event.event_model_count} model(s)",
                "",
                event_table(event_rows, 8),
                "",
            ]
        )
    if event_notes:
        parts.extend(["### Event Notes", ""])
        parts.extend(f"- {note}" for note in event_notes)
        parts.append("")

    parts.extend(
        [
            "## Tag Frontier Lines",
            "",
            (
                "For selected tags, this takes the strongest model-tag score available "
                "at each release date and connects those frontier values over time."
            ),
            "",
        ]
    )
    frontier_by_tag: dict[str, list[FrontierPoint]] = defaultdict(list)
    for point in frontier_points:
        frontier_by_tag[point.tag].append(point)
    parts.append("| Tag | Final frontier | Current best model | Last frontier refresh | Refresh count |")
    parts.append("|---|---:|---|---|---:|")
    for tag in frontier_tags:
        tag_points = frontier_by_tag.get(tag, [])
        if not tag_points:
            continue
        final_point = tag_points[-1]
        refreshes = [point for point in tag_points if point.is_new_frontier]
        last_refresh = refreshes[-1] if refreshes else final_point
        parts.append(
            f"| {tag} | {fmt(final_point.frontier_score)} | {html.escape(final_point.best_model)} | "
            f"{last_refresh.best_model_release_date} · {html.escape(last_refresh.best_model)} | {len(refreshes)} |"
        )
    parts.append("")

    parts.extend(
        [
        "## Family Fastest-Rising Tags",
        "",
        ]
    )
    for family in eligible_families:
        family_rows = by_family.get(family, [])
        parts.extend([f"### {family}", "", result_table(family_rows, 5), ""])

    parts.extend(["## Shared Signals", ""])
    if shared_tags:
        parts.append("| Tag | Families where tag is top-3 |")
        parts.append("|---|---:|")
        for tag, count in shared_tags:
            parts.append(f"| {tag} | {count} |")
    else:
        parts.append("No tag appears in the top-3 fastest-rising set for at least two eligible families.")

    parts.extend(["", "## Family-Specific Signals", ""])
    if distinctive:
        parts.append("| Family | Top distinctive tag | Slope/year |")
        parts.append("|---|---|---:|")
        for family, tag, slope in sorted(distinctive):
            parts.append(f"| {family} | {tag} | {fmt(slope)} |")
    else:
        parts.append("No eligible family has a top tag that is unique among family top-3 sets.")

    parts.extend(
        [
            "",
            "## Caveats",
            "",
            "- This analysis uses projected `model.tag_scores` from the current latent tag projection.",
            "- The trends are not direct evidence of training-data investment, product strategy, or benchmark author intent.",
            "- Family-level slopes are descriptive and can be sensitive to release-date clustering and small sample sizes.",
            "- Event jumps compare model cohorts to a pre-window baseline; they are descriptive, not causal.",
            "- Frontier lines show observed best-so-far projected tag scores; a flat line can mean no newer model exceeded the previous maximum.",
            "- `slope_per_year` is computed on raw projected tag scores, so compare ranks more than absolute magnitudes.",
            "",
        ]
    )
    path.write_text("\n".join(parts), encoding="utf-8")


def color_for(value: float, low: float, high: float) -> str:
    if high <= low:
        t = 0.5
    else:
        t = max(0.0, min(1.0, (value - low) / (high - low)))
    start = (47, 111, 159)
    mid = (248, 246, 238)
    end = (187, 74, 74)
    if t < 0.5:
        a, b, m = start, mid, t / 0.5
    else:
        a, b, m = mid, end, (t - 0.5) / 0.5
    rgb = tuple(round(a[i] + (b[i] - a[i]) * m) for i in range(3))
    return f"rgb({rgb[0]},{rgb[1]},{rgb[2]})"


def write_overall_svg(path: Path, results: list[TrendResult], limit: int = 12) -> None:
    rows = sorted([r for r in results if r.scope == "overall"], key=lambda r: r.slope_per_year, reverse=True)[:limit]
    width = 980
    row_h = 34
    left = 230
    top = 52
    height = top + len(rows) * row_h + 44
    max_slope = max((r.slope_per_year for r in rows), default=1.0)
    scale = (width - left - 130) / max_slope if max_slope > 0 else 1.0
    bars = []
    for index, result in enumerate(rows):
        y = top + index * row_h
        bar_w = max(1, result.slope_per_year * scale)
        bars.append(f'<text x="{left - 12}" y="{y + 20}" text-anchor="end">{html.escape(result.tag)}</text>')
        bars.append(f'<rect x="{left}" y="{y + 5}" width="{bar_w:.1f}" height="20" fill="#bb4a4a" opacity="0.78" />')
        bars.append(f'<text x="{left + bar_w + 8:.1f}" y="{y + 20}">{result.slope_per_year:.6f}</text>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#fbfaf6"/>
  <text x="28" y="28" font-family="system-ui, sans-serif" font-size="18" font-weight="700">Overall fastest-rising model tag scores</text>
  <g font-family="system-ui, sans-serif" font-size="12" fill="#1d2528">
    {''.join(bars)}
  </g>
  <text x="{left}" y="{height - 16}" font-family="system-ui, sans-serif" font-size="12" fill="#697176">slope per year</text>
</svg>
'''
    path.write_text(svg, encoding="utf-8")


def write_family_heatmap_svg(path: Path, results: list[TrendResult], eligible_families: list[str]) -> None:
    family_rows = [r for r in results if r.scope == "family" and r.family in eligible_families]
    tags = sorted({r.tag for r in family_rows})
    lookup = {(r.family, r.tag): r.slope_per_year for r in family_rows}
    cell = 34
    left = 170
    top = 112
    width = left + len(tags) * cell + 30
    height = top + len(eligible_families) * cell + 46
    values = list(lookup.values()) or [0.0]
    low, high = min(values), max(values)
    cells = []
    for row_i, family in enumerate(eligible_families):
        y = top + row_i * cell
        cells.append(f'<text x="{left - 12}" y="{y + 22}" text-anchor="end">{html.escape(family)}</text>')
        for col_i, tag in enumerate(tags):
            x = left + col_i * cell
            value = lookup.get((family, tag), 0.0)
            cells.append(f'<rect x="{x}" y="{y}" width="{cell - 2}" height="{cell - 2}" fill="{color_for(value, low, high)}" />')
    labels = []
    for col_i, tag in enumerate(tags):
        x = left + col_i * cell + 18
        labels.append(
            f'<text x="{x}" y="{top - 8}" transform="rotate(-55 {x} {top - 8})" text-anchor="start">{html.escape(tag)}</text>'
        )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#fbfaf6"/>
  <text x="28" y="28" font-family="system-ui, sans-serif" font-size="18" font-weight="700">Family x tag slope heatmap</text>
  <text x="28" y="50" font-family="system-ui, sans-serif" font-size="12" fill="#697176">Color = slope per year</text>
  <g font-family="system-ui, sans-serif" font-size="11" fill="#1d2528">
    {''.join(labels)}
    {''.join(cells)}
  </g>
</svg>
'''
    path.write_text(svg, encoding="utf-8")


def write_event_jump_svg(path: Path, results: list[EventJumpResult], limit_per_event: int = 8) -> None:
    by_event: dict[str, list[EventJumpResult]] = defaultdict(list)
    for result in results:
        by_event[result.event_id].append(result)
    selected: list[EventJumpResult] = []
    for event_id in sorted(by_event):
        selected.extend(sorted(by_event[event_id], key=lambda item: item.jump, reverse=True)[:limit_per_event])
    if not selected:
        path.write_text("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"120\"></svg>\n", encoding="utf-8")
        return

    row_h = 30
    event_gap = 26
    width = 1060
    left = 260
    top = 54
    height = top + len(selected) * row_h + len(by_event) * event_gap + 46
    max_jump = max(abs(item.jump) for item in selected) or 1.0
    scale = (width - left - 180) / max_jump
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#fbfaf6"/>',
        '<text x="28" y="28" font-family="system-ui, sans-serif" font-size="18" font-weight="700">Event tag jumps</text>',
        f'<line x1="{left}" y1="44" x2="{left}" y2="{height - 30}" stroke="#697176" stroke-width="1"/>',
        '<g font-family="system-ui, sans-serif" font-size="12" fill="#1d2528">',
    ]
    y = top
    for event_id in sorted(by_event):
        event_rows = sorted(by_event[event_id], key=lambda item: item.jump, reverse=True)[:limit_per_event]
        if not event_rows:
            continue
        label = f"{event_rows[0].event_label} ({event_rows[0].event_date})"
        parts.append(f'<text x="28" y="{y + 14}" font-weight="700">{html.escape(label)}</text>')
        y += event_gap
        for item in event_rows:
            bar_w = item.jump * scale
            color = "#bb4a4a" if item.jump >= 0 else "#2f6f9f"
            x = left if bar_w >= 0 else left + bar_w
            parts.append(f'<text x="{left - 12}" y="{y + 19}" text-anchor="end">{html.escape(item.tag)}</text>')
            parts.append(f'<rect x="{x:.1f}" y="{y + 5}" width="{abs(bar_w):.1f}" height="18" fill="{color}" opacity="0.78"/>')
            text_x = left + bar_w + (8 if bar_w >= 0 else -8)
            anchor = "start" if bar_w >= 0 else "end"
            parts.append(f'<text x="{text_x:.1f}" y="{y + 19}" text-anchor="{anchor}">{item.jump:.6f}</text>')
            y += row_h
    parts.extend(["</g>", "</svg>"])
    path.write_text("\n".join(parts) + "\n", encoding="utf-8")


def write_frontier_lines_svg(path: Path, points: list[FrontierPoint], tags: list[str]) -> None:
    selected = [point for point in points if point.tag in tags]
    if not selected:
        path.write_text("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"120\"></svg>\n", encoding="utf-8")
        return

    dates = [date.fromisoformat(point.release_date) for point in selected]
    scores = [point.frontier_score for point in selected]
    min_date = min(dates)
    max_date = max(dates)
    min_score = min(scores)
    max_score = max(scores)
    if max_score <= min_score:
        max_score = min_score + 1.0
    if max_date <= min_date:
        max_date = min_date + timedelta(days=1)

    width = 1160
    height = 620
    left = 82
    right = 245
    top = 58
    bottom = 74
    plot_w = width - left - right
    plot_h = height - top - bottom
    palette = ["#bb4a4a", "#2f6f9f", "#7c6a2f", "#5d7d58", "#8e6ab3", "#c06d37", "#496d8f", "#9b566e"]

    def x_for(value: str) -> float:
        parsed = date.fromisoformat(value)
        return left + ((parsed - min_date).days / ((max_date - min_date).days or 1)) * plot_w

    def y_for(value: float) -> float:
        return top + (1 - (value - min_score) / (max_score - min_score)) * plot_h

    year_lines = []
    for year in range(min_date.year, max_date.year + 1):
        tick_date = date(year, 1, 1)
        if tick_date < min_date or tick_date > max_date:
            continue
        x = x_for(tick_date.isoformat())
        year_lines.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + plot_h}" stroke="#d8d2c5" stroke-width="1"/>')
        year_lines.append(f'<text x="{x:.1f}" y="{height - 36}" text-anchor="middle">{year}</text>')

    score_lines = []
    for i in range(5):
        value = min_score + (max_score - min_score) * i / 4
        y = y_for(value)
        score_lines.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}" stroke="#ece7dc" stroke-width="1"/>')
        score_lines.append(f'<text x="{left - 10}" y="{y + 4:.1f}" text-anchor="end">{value:.3f}</text>')

    lines = []
    markers = []
    legend = []
    for index, tag in enumerate(tags):
        tag_points = [point for point in selected if point.tag == tag]
        if not tag_points:
            continue
        color = palette[index % len(palette)]
        coords = " ".join(f"{x_for(point.release_date):.1f},{y_for(point.frontier_score):.1f}" for point in tag_points)
        lines.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
        refreshes = [point for point in tag_points if point.is_new_frontier]
        for point in refreshes:
            x = x_for(point.release_date)
            y = y_for(point.frontier_score)
            title = f"{point.release_date} · {point.best_model} · {point.frontier_score:.6f}"
            markers.append(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.2" fill="{color}" stroke="#fbfaf6" stroke-width="1.4">'
                f'<title>{html.escape(title)}</title></circle>'
            )
        legend_y = top + index * 26
        final_point = tag_points[-1]
        legend.append(f'<line x1="{width - right + 24}" y1="{legend_y}" x2="{width - right + 48}" y2="{legend_y}" stroke="{color}" stroke-width="3"/>')
        legend.append(f'<text x="{width - right + 56}" y="{legend_y + 4}">{html.escape(tag)}</text>')
        legend.append(f'<text x="{width - right + 56}" y="{legend_y + 18}" font-size="10" fill="#697176">{final_point.frontier_score:.6f} · {html.escape(final_point.best_model[:28])}</text>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#fbfaf6"/>
  <text x="28" y="30" font-family="system-ui, sans-serif" font-size="18" font-weight="700">Selected tag frontier over model release time</text>
  <text x="28" y="50" font-family="system-ui, sans-serif" font-size="12" fill="#697176">Each line is the best-so-far model tag score at each release date. Dots mark new frontier models.</text>
  <g font-family="system-ui, sans-serif" font-size="11" fill="#1d2528">
    {''.join(year_lines)}
    {''.join(score_lines)}
    <line x1="{left}" y1="{top + plot_h}" x2="{left + plot_w}" y2="{top + plot_h}" stroke="#697176" stroke-width="1"/>
    <line x1="{left}" y1="{top}" x2="{left}" y2="{top + plot_h}" stroke="#697176" stroke-width="1"/>
    {''.join(lines)}
    {''.join(markers)}
    {''.join(legend)}
    <text x="{left + plot_w / 2:.1f}" y="{height - 12}" text-anchor="middle">release date</text>
    <text x="18" y="{top + plot_h / 2:.1f}" transform="rotate(-90 18 {top + plot_h / 2:.1f})" text-anchor="middle">frontier tag score</text>
  </g>
</svg>
'''
    path.write_text(svg, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze model tag-score trends over time.")
    parser.add_argument("--data-json", type=Path, default=DEFAULT_DATA_JSON)
    parser.add_argument("--run-tag", default=DEFAULT_RUN_TAG)
    parser.add_argument("--start-date", default=DEFAULT_START_DATE)
    parser.add_argument("--family-min-n", type=int, default=DEFAULT_FAMILY_MIN_N)
    parser.add_argument("--event-pre-days", type=int, default=DEFAULT_EVENT_PRE_DAYS)
    parser.add_argument(
        "--frontier-tags",
        default=",".join(DEFAULT_FRONTIER_TAGS),
        help="Comma-separated tags to draw in the best-so-far frontier line chart.",
    )
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()

    data = json.loads(args.data_json.read_text(encoding="utf-8"))
    run = select_run(data, args.run_tag)
    tags = [str(tag) for tag in data.get("tags") or []]
    if not tags:
        raise SystemExit("No tags found in dashboard data.")

    rows = build_model_rows(run, tags, args.start_date)
    records = build_model_records(run, tags, args.start_date)
    if not rows:
        raise SystemExit("No model rows with release dates and tag scores after filtering.")

    results, family_counts, eligible_families = compute_results(rows, tags, args.family_min_n)
    event_results, event_notes = compute_event_jumps(records, tags, DEFAULT_EVENTS, args.event_pre_days)
    frontier_tags = parse_frontier_tags(args.frontier_tags, tags)
    frontier_points = compute_frontier_points(records, frontier_tags)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    csv_path = args.output_dir / "tag_trend_results.csv"
    event_csv_path = args.output_dir / "event_tag_jump_results.csv"
    report_path = args.output_dir / "tag_trend_report.md"
    overall_svg_path = args.output_dir / "overall_tag_slopes.svg"
    heatmap_svg_path = args.output_dir / "family_tag_slope_heatmap.svg"
    event_svg_path = args.output_dir / "event_tag_jumps.svg"
    frontier_csv_path = args.output_dir / "tag_frontier_timeseries.csv"
    frontier_svg_path = args.output_dir / "tag_frontier_lines.svg"

    write_csv(csv_path, results)
    write_event_csv(event_csv_path, event_results)
    write_frontier_csv(frontier_csv_path, frontier_points)
    write_report(
        report_path,
        results,
        event_results,
        event_notes,
        frontier_points,
        frontier_tags,
        family_counts,
        eligible_families,
        args.run_tag,
        args.start_date,
        rows,
    )
    write_overall_svg(overall_svg_path, results)
    write_family_heatmap_svg(heatmap_svg_path, results, eligible_families)
    write_event_jump_svg(event_svg_path, event_results)
    write_frontier_lines_svg(frontier_svg_path, frontier_points, frontier_tags)

    overall = sorted([r for r in results if r.scope == "overall"], key=lambda r: r.slope_per_year, reverse=True)
    print(f"Wrote {csv_path}")
    print(f"Wrote {event_csv_path}")
    print(f"Wrote {frontier_csv_path}")
    print(f"Wrote {report_path}")
    print(f"Wrote {overall_svg_path}")
    print(f"Wrote {heatmap_svg_path}")
    print(f"Wrote {event_svg_path}")
    print(f"Wrote {frontier_svg_path}")
    print(f"Models analyzed: {len({row['model'] for row in rows})}")
    print(f"Eligible families: {', '.join(eligible_families)}")
    print("Top overall tags:")
    for result in overall[:5]:
        print(f"  {result.tag}: slope={result.slope_per_year:.6f}/year corr={result.correlation:.3f}")
    print("Top event jumps:")
    for result in sorted(event_results, key=lambda item: item.jump, reverse=True)[:5]:
        print(f"  {result.event_label} · {result.tag}: jump={result.jump:.6f}")


if __name__ == "__main__":
    main()
