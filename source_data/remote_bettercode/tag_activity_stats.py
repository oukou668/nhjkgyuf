"""
统计每个 tag 在多少个 benchmark 中"活跃"（基于 outstandingC 方法），
并计算各 tag 的 weighted_mean 均值与标准差。

outstandingC 判断 benchmark 是否持有 tag 的逻辑：
  tau = clip(mean(scores_t) - lambda * std(scores_t), 0, max_score - eps)
  m   = max((x - tau) / (max_score - tau), 0) ** gamma
  若 m > 0，则视为该 benchmark 持有该 tag。
"""

import json
import numpy as np
import pandas as pd

# ─── 路径 ───────────────────────────────────────────────────────────────────
JSON_PATH = "/datacenter/lianghaiyuan/bench-eval/tagging_outputs/tagging_benchmark_tag_stats.json"

# ─── outstandingC 超参（与 notebook 保持一致） ────────────────────────────────
SCORE_KEY  = "weighted_mean"
MAX_SCORE  = 5.0
GAMMA      = 1.0
_LAMBDA    = 0.3
EPS        = 1e-12
KEEP_ZERO  = False   # score==0 的 tag 不载入


# ─── 加载 tags_map ────────────────────────────────────────────────────────────
def load_tags_map(json_path: str) -> dict[str, dict[str, float]]:
    """
    返回 {benchmark_name: {tag: score, ...}, ...}
    只保留 score > 0 的 tag（KEEP_ZERO=False 时）。
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    by_benchmark = data.get("by_benchmark", {})
    tags_map: dict[str, dict[str, float]] = {}

    for bench_name, tag_info in by_benchmark.items():
        tag_scores: dict[str, float] = {}
        for tag, stats in tag_info.items():
            score_dict = stats.get("score", {})
            score = score_dict.get(SCORE_KEY, score_dict.get("mean", None))
            if score is None:
                continue
            try:
                score = float(score)
            except Exception:
                continue
            if not np.isfinite(score):
                continue
            score = float(np.clip(score, 0.0, MAX_SCORE))
            if KEEP_ZERO or score > 0:
                tag_scores[str(tag)] = score
        if tag_scores:
            tags_map[bench_name] = tag_scores

    return tags_map


# ─── outstandingC 核心：计算每个 tag 的 tau 阈值 ─────────────────────────────
def compute_tau_map(
    tags_map: dict[str, dict[str, float]],
) -> dict[str, float]:
    """
    对所有 benchmark 中出现的每个 tag，计算 outstandingC 阈值：
      tau_t = clip(mean_t - lambda * std_t, 0, max_score - eps)
    其中 mean/std 是该 tag 在所有已标注 benchmark 上的分数分布（缺失 benchmark 计 0）。
    """
    bench_list = list(tags_map.keys())
    all_tags: set[str] = set()
    for scores in tags_map.values():
        all_tags.update(scores.keys())

    tau_map: dict[str, float] = {}
    for t in all_tags:
        arr = np.array([tags_map[b].get(t, 0.0) for b in bench_list], dtype=float)
        mu    = arr.mean()
        sigma = arr.std()
        tau_map[t] = float(np.clip(mu - _LAMBDA * sigma, 0.0, MAX_SCORE - EPS))

    return tau_map


# ─── 判断每个 benchmark 是否"持有"某 tag ─────────────────────────────────────
def is_active(score: float, tau: float) -> bool:
    """
    outstandingC 持有判断：m = max((x-tau)/(max_score-tau), 0)**gamma > 0
    即 score > tau。
    """
    denom = MAX_SCORE - tau
    if denom <= 0:
        return False
    m = max((score - tau) / denom, 0.0) ** GAMMA
    return m > 0


# ─── 主统计函数 ───────────────────────────────────────────────────────────────
def compute_tag_activity_stats(
    tags_map: dict[str, dict[str, float]],
    tau_map: dict[str, float],
) -> pd.DataFrame:
    """
    返回 DataFrame，每行为一个 tag，包含：
      - n_active_benchmarks  : 在多少个 benchmark 中活跃（outstandingC 判定持有）
      - n_total_benchmarks   : 该 tag 在多少个 benchmark 中有非零得分
      - active_ratio         : n_active / n_total
      - score_mean           : 所有有该 tag 的 benchmark 的 weighted_mean 均值
      - score_std            : 对应标准差
      - score_mean_all       : 含缺失（计 0）时跨所有 benchmark 的均值
      - score_std_all        : 含缺失（计 0）时跨所有 benchmark 的标准差
    """
    bench_list = list(tags_map.keys())
    n_all = len(bench_list)

    all_tags = sorted(tau_map.keys())
    rows = []

    for t in all_tags:
        tau = tau_map[t]

        # 仅在有该 tag（score > 0）的 benchmark 上统计
        scores_nonzero = [
            tags_map[b][t]
            for b in bench_list
            if t in tags_map[b]
        ]
        n_total = len(scores_nonzero)

        n_active = sum(
            1 for x in scores_nonzero if is_active(x, tau)
        )

        score_mean = float(np.mean(scores_nonzero)) if scores_nonzero else float("nan")
        score_std  = float(np.std(scores_nonzero, ddof=0)) if len(scores_nonzero) > 1 else 0.0

        # 含缺失（补 0）的全局统计
        scores_all = np.array(
            [tags_map[b].get(t, 0.0) for b in bench_list], dtype=float
        )
        score_mean_all = float(scores_all.mean())
        score_std_all  = float(scores_all.std(ddof=0))

        rows.append(
            {
                "tag": t,
                "n_active_benchmarks": n_active,
                "n_total_benchmarks": n_total,
                "n_all_benchmarks": n_all,
                "active_ratio": n_active / n_total if n_total > 0 else float("nan"),
                "score_mean": score_mean,
                "score_std": score_std,
                "score_mean_all": score_mean_all,
                "score_std_all": score_std_all,
                "tau": tau,
            }
        )

    df = pd.DataFrame(rows).sort_values("n_active_benchmarks", ascending=False)
    df = df.reset_index(drop=True)
    return df


# ─── 入口 ─────────────────────────────────────────────────────────────────────
def main():
    print(f"Loading tags_map from:\n  {JSON_PATH}\n")
    tags_map = load_tags_map(JSON_PATH)
    n_benchmarks = len(tags_map)
    all_tag_set: set[str] = set()
    for v in tags_map.values():
        all_tag_set.update(v.keys())
    print(f"Loaded {n_benchmarks} benchmarks, {len(all_tag_set)} unique tags.\n")

    print("Computing outstandingC tau thresholds...")
    tau_map = compute_tau_map(tags_map)

    print("Computing per-tag activity statistics...\n")
    df = compute_tag_activity_stats(tags_map, tau_map)

    # ─── 打印结果 ───────────────────────────────────────────────────────────
    pd.set_option("display.max_rows", None)
    pd.set_option("display.float_format", "{:.4f}".format)
    pd.set_option("display.width", 120)

    print("=" * 90)
    print(f"Tag activity statistics  (n_all_benchmarks = {n_benchmarks})")
    print(f"  outstandingC params: lambda={_LAMBDA}, gamma={GAMMA}, max_score={MAX_SCORE}")
    print("=" * 90)
    print(
        df.to_string(
            index=True,
            columns=[
                "tag",
                "n_active_benchmarks",
                "n_total_benchmarks",
                "active_ratio",
                "score_mean",
                "score_std",
                "tau",
            ],
        )
    )

    print("\n\nSummary (across all tags):")
    print(f"  Total unique tags   : {len(df)}")
    print(f"  Active count range  : {df['n_active_benchmarks'].min()} – {df['n_active_benchmarks'].max()}")
    print(f"  Mean active count   : {df['n_active_benchmarks'].mean():.2f}")
    print(f"  Median active count : {df['n_active_benchmarks'].median():.1f}")
    print(f"  Score mean (avg)    : {df['score_mean'].mean():.4f}")
    print(f"  Score std  (avg)    : {df['score_std'].mean():.4f}")

    # ─── 可选：保存为 CSV ────────────────────────────────────────────────────
    out_csv = "/datacenter/lianghaiyuan/bench-eval/tag_activity_stats.csv"
    df.to_csv(out_csv, index=False)
    print(f"\nSaved to: {out_csv}")


if __name__ == "__main__":
    main()
