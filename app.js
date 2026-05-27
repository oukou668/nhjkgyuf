const state = {
  data: null,
  selectedModel: null,
  selectedBenchmark: null,
  selectedRunTag: null,
  selectedFamily: "All",
  timelineViewMode: "combined",
  benchmarkTimelineMetric: "difficulty_score",
  timelinePoints: [],
  timelinePreviousFamily: "All",
  timelineAnimation: null,
  timelineIntroPlayed: false,
};

const FIXED_RUN_TAG = "extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3";
const TIMELINE_START_DATE = "2023-01-01";
const TIMELINE_START_MS = new Date(`${TIMELINE_START_DATE}T00:00:00`).getTime();
const BENCHMARK_DIFFICULTY_METRICS = {
  difficulty_score: { label: "Predicted difficulty", shortLabel: "predicted difficulty" },
  difficulty_sum: { label: "Difficulty sum", shortLabel: "difficulty sum" },
  difficulty_mean: { label: "Difficulty mean", shortLabel: "difficulty mean" },
  difficulty_l2: { label: "Difficulty L2", shortLabel: "difficulty L2" },
};
const TIMELINE_VIEW_MODES = {
  combined: "Model + benchmark",
  models: "Models only",
  benchmarkTags: "Benchmarks by tag",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  runSource: $("#runSource"),
  trainingRun: $("#trainingRun"),
  runConfigMeta: $("#runConfigMeta"),
  modelCount: $("#modelCount"),
  benchmarkCount: $("#benchmarkCount"),
  dimensionCount: $("#dimensionCount"),
  tagCount: $("#tagCount"),
  fitMse: $("#fitMse"),
  modelSearch: $("#modelSearch"),
  modelSort: $("#modelSort"),
  modelLimit: $("#modelLimit"),
  modelTable: $("#modelTable"),
  modelResultCount: $("#modelResultCount"),
  modelDetailTitle: $("#modelDetailTitle"),
  modelDetailScore: $("#modelDetailScore"),
  modelBars: $("#modelBars"),
  benchmarkSearch: $("#benchmarkSearch"),
  benchmarkSort: $("#benchmarkSort"),
  tagFilter: $("#tagFilter"),
  benchmarkTable: $("#benchmarkTable"),
  benchmarkResultCount: $("#benchmarkResultCount"),
  benchmarkDetailTitle: $("#benchmarkDetailTitle"),
  benchmarkDetailScore: $("#benchmarkDetailScore"),
  benchmarkTags: $("#benchmarkTags"),
  benchmarkBars: $("#benchmarkBars"),
  weightBars: $("#weightBars"),
  heatmapType: $("#heatmapType"),
  heatmapLimit: $("#heatmapLimit"),
  heatmapTitle: $("#heatmapTitle"),
  heatmap: $("#heatmap"),
  tagCards: $("#tagCards"),
  canvasFamilyLegend: $("#canvasFamilyLegend"),
  timelineSummary: $("#timelineSummary"),
  timelineViewMode: $("#timelineViewMode"),
  benchmarkTimelineMetric: $("#benchmarkTimelineMetric"),
  timelineCanvas: $("#timelineCanvas"),
  timelineHitLayer: $("#timelineHitLayer"),
  timelineTooltip: $("#timelineTooltip"),
  fitSummary: $("#fitSummary"),
  fitCanvas: $("#fitCanvas"),
  fitTable: $("#fitTable"),
  fitImage: $("#fitImage"),
  fitImageSource: $("#fitImageSource"),
};

function fmt(value, digits = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "--";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function valueColor(value, maxAbs) {
  const t = maxAbs ? clamp(Math.abs(value) / maxAbs, 0, 1) : 0;
  const alpha = 0.15 + t * 0.75;
  if (value >= 0) return `rgba(187, 74, 74, ${alpha})`;
  return `rgba(47, 111, 159, ${alpha})`;
}

function interpolateColor(a, b, t) {
  const mix = a.map((value, index) => Math.round(value + (b[index] - value) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function buildColumnStats(rows, vectorKey, columnCount) {
  return Array.from({ length: columnCount }, (_, index) => {
    const values = rows
      .map((row) => Number(row[vectorKey][index]))
      .filter(Number.isFinite);
    const low = quantile(values, 0.05);
    const high = quantile(values, 0.95);
    const mid = quantile(values, 0.5);
    return { low, mid, high };
  });
}

function tagValueColor(value, stats) {
  const blue = [47, 111, 159];
  const neutral = [248, 246, 238];
  const red = [187, 74, 74];
  if (!stats || stats.high === stats.low) return "rgb(248, 246, 238)";
  if (value >= stats.mid) {
    const t = clamp((value - stats.mid) / Math.max(stats.high - stats.mid, 0.0001), 0, 1);
    return interpolateColor(neutral, red, Math.pow(t, 0.72));
  }
  const t = clamp((stats.mid - value) / Math.max(stats.mid - stats.low, 0.0001), 0, 1);
  return interpolateColor(neutral, blue, Math.pow(t, 0.72));
}

const FAMILY_COLORS = {
  GPT: "#2f80c0",
  Claude: "#e58a2a",
  Gemini: "#3fa45b",
  DeepSeek: "#d84545",
  Qwen: "#cdb9e8",
  GLM: "#8e5a43",
  Llama: "#d86db0",
  Kimi: "#22aeb3",
  Benchmark: "#9fb8c9",
  Others: "#b8b8b8",
};

function trainingRuns() {
  if (state.data.training_runs?.length) return state.data.training_runs;
  return [
    {
      metadata: state.data.metadata,
      dimensions: state.data.dimensions,
      models: state.data.models,
      benchmarks: state.data.benchmarks,
      tag_projection: state.data.tag_projection,
    },
  ];
}

function activeRun() {
  const runs = trainingRuns();
  return runs.find((run) => run.metadata.run_tag === state.selectedRunTag) || runs[0];
}

function runOptionLabel(run) {
  const meta = run.metadata;
  return `${meta.run_tag} (${meta.dimension_count}d, ${meta.model_count} models, ${meta.benchmark_count} benches)`;
}

function renderSortOptions() {
  const run = activeRun();
  const dimOptions = run.dimensions
    .map((dim, index) => `<option value="dim:${index}">${dim}</option>`)
    .join("");
  const modelSort = els.modelSort.value || "capability_sum";
  const benchmarkSort = els.benchmarkSort.value || "difficulty_score";
  els.modelSort.innerHTML = `
    <option value="capability_sum">Capability sum</option>
    <option value="capability_mean">Capability mean</option>
    <option value="capability_l2">Capability L2</option>
    ${dimOptions}
  `;
  els.benchmarkSort.innerHTML = `
    <option value="difficulty_score">Predicted difficulty</option>
    <option value="difficulty_sum">Difficulty sum</option>
    <option value="difficulty_mean">Difficulty mean</option>
    <option value="difficulty_l2">Difficulty L2</option>
    ${dimOptions}
  `;
  els.modelSort.value = [...els.modelSort.options].some((option) => option.value === modelSort) ? modelSort : "capability_sum";
  els.benchmarkSort.value = [...els.benchmarkSort.options].some((option) => option.value === benchmarkSort)
    ? benchmarkSort
    : "difficulty_score";
}

function populateControls() {
  const runs = trainingRuns();
  state.selectedRunTag = runs.some((run) => run.metadata.run_tag === FIXED_RUN_TAG)
    ? FIXED_RUN_TAG
    : state.data.metadata.run_tag || runs[0].metadata.run_tag;
  els.trainingRun.innerHTML = runs
    .map((run) => `<option value="${escapeHtml(run.metadata.run_tag)}">${escapeHtml(runOptionLabel(run))}</option>`)
    .join("");
  els.trainingRun.value = state.selectedRunTag;
  renderSortOptions();
  els.tagFilter.innerHTML = `<option value="">All tags</option>${state.data.tags
    .map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    .join("")}`;
  els.heatmapType.value = "modelTags";
}

function hydrateStats() {
  const run = activeRun();
  const meta = run.metadata;
  els.runSource.textContent = meta.source_label;
  els.runConfigMeta.textContent = `${meta.method} · R=${meta.r}`;
  els.modelCount.textContent = meta.model_count;
  els.benchmarkCount.textContent = meta.benchmark_count;
  els.dimensionCount.textContent = meta.dimension_count;
  els.tagCount.textContent = meta.tag_count ?? state.data.tags.length;
  els.fitMse.textContent =
    state.data.fit?.available && meta.run_tag === state.data.metadata.run_tag ? fmt(state.data.fit.mse, 4) : "--";
  els.modelLimit.max = meta.model_count;
}

function getSortValue(item, sortKey, vectorKey) {
  if (sortKey.startsWith("dim:")) {
    return item[vectorKey][Number(sortKey.split(":")[1])] ?? -Infinity;
  }
  return item[sortKey] ?? -Infinity;
}

function renderModels() {
  const run = activeRun();
  const query = els.modelSearch.value.trim().toLowerCase();
  const sortKey = els.modelSort.value;
  const limit = Number(els.modelLimit.value) || 40;
  const rows = run.models
    .filter((model) => model.model.toLowerCase().includes(query))
    .sort((a, b) => getSortValue(b, sortKey, "estimated_capability") - getSortValue(a, sortKey, "estimated_capability"));

  els.modelResultCount.textContent = `${rows.length} models`;
  els.modelTable.innerHTML = rows
    .slice(0, limit)
    .map(
      (model, index) => `
      <tr class="selectable ${state.selectedModel?.model === model.model ? "active" : ""}" data-model="${escapeHtml(model.model)}">
        <td>${index + 1}</td>
        <td class="name-cell">${escapeHtml(model.model)}</td>
        <td>${fmt(model.capability_sum)}</td>
        <td>${fmt(model.capability_mean)}</td>
        <td>${fmt(model.capability_l2)}</td>
      </tr>`
    )
    .join("");

  $$("[data-model]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedModel = run.models.find((model) => model.model === row.dataset.model);
      renderModels();
      renderModelDetail();
    });
  });

  if (state.selectedModel && !run.models.some((model) => model.model === state.selectedModel.model)) {
    state.selectedModel = null;
  }
  if (!state.selectedModel && rows.length) {
    state.selectedModel = rows[0];
    renderModelDetail();
  }
}

function renderVectorBars(container, values, options = {}) {
  container.classList.remove("tag-bars");
  if (!values?.length) {
    container.innerHTML = `<p class="muted">No vector data.</p>`;
    return;
  }
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 0.0001);
  container.innerHTML = values
    .map((value, index) => {
      const normalized = Math.abs(value) / maxAbs;
      const width = Math.max(2, normalized * 50);
      const left = value >= 0 ? 50 : 50 - width;
      return `
        <div class="bar-row">
          <span>${options.prefix || "dim"}_${index}</span>
          <div class="bar-track" title="${fmt(value, 5)}">
            <span class="bar-zero" style="left: 50%"></span>
            <span class="bar-fill ${value >= 0 ? "positive" : "negative"}" style="left: ${left}%; width: ${width}%"></span>
          </div>
          <strong>${fmt(value)}</strong>
        </div>`;
    })
    .join("");
}

function renderTagBars(container, tagScores, options = {}) {
  container.classList.add("tag-bars");
  const entries = Object.entries(tagScores || {})
    .map(([tag, value]) => [tag, Number(value)])
    .filter(([, value]) => Number.isFinite(value));
  const visibleEntries = options.hideZero
    ? entries.filter(([, value]) => Math.abs(value) > 1e-12)
    : entries;
  const rows = (visibleEntries.length ? visibleEntries : entries)
    .sort((a, b) => b[1] - a[1]);

  if (!rows.length) {
    container.innerHTML = `<p class="muted">No tag data.</p>`;
    return;
  }

  const max = Math.max(...rows.map(([, value]) => Math.abs(value)), 0.0001);
  container.innerHTML = rows
    .map(([tag, value]) => {
      const width = Math.max(2, (Math.abs(value) / max) * 100);
      return `
        <div class="bar-row">
          <span title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>
          <div class="bar-track" title="${fmt(value, 5)}">
            <span class="bar-fill ${value >= 0 ? "positive" : "negative"}" style="left: 0; width: ${width}%"></span>
          </div>
          <strong>${fmt(value)}</strong>
        </div>`;
    })
    .join("");
}

function renderWeightBars(container, weights) {
  container.classList.remove("tag-bars");
  const max = Math.max(...weights, 0.0001);
  container.innerHTML = weights
    .map(
      (value, index) => `
      <div class="bar-row">
        <span>w_${index}</span>
        <div class="bar-track" title="${fmt(value, 5)}">
          <span class="bar-fill positive" style="left: 0; width: ${(value / max) * 100}%"></span>
        </div>
        <strong>${fmt(value, 2)}</strong>
      </div>`
    )
    .join("");
}

function renderModelDetail() {
  const model = state.selectedModel;
  if (!model) return;
  els.modelDetailTitle.textContent = model.model;
  els.modelDetailScore.textContent = `sum ${fmt(model.capability_sum)} · L2 ${fmt(model.capability_l2)}`;
  renderTagBars(els.modelBars, model.tag_scores);
}

function renderBenchmarks() {
  const run = activeRun();
  const query = els.benchmarkSearch.value.trim().toLowerCase();
  const sortKey = els.benchmarkSort.value;
  const tag = els.tagFilter.value;
  const rows = run.benchmarks
    .filter((bench) => bench.benchmark_name.toLowerCase().includes(query))
    .filter((bench) => !tag || bench.tags.includes(tag))
    .sort((a, b) => getSortValue(b, sortKey, "estimated_difficulty") - getSortValue(a, sortKey, "estimated_difficulty"));

  els.benchmarkResultCount.textContent = `${rows.length} benchmarks`;
  els.benchmarkTable.innerHTML = rows
    .map(
      (bench, index) => `
      <tr class="selectable ${state.selectedBenchmark?.benchmark_name === bench.benchmark_name ? "active" : ""}" data-benchmark="${escapeHtml(bench.benchmark_name)}">
        <td>${index + 1}</td>
        <td class="name-cell">${escapeHtml(bench.benchmark_name)}</td>
        <td>${fmt(bench.difficulty_score ?? bench.difficulty_sum)}</td>
        <td>${escapeHtml(bench.tags[0] || "--")}</td>
      </tr>`
    )
    .join("");

  $$("[data-benchmark]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedBenchmark = run.benchmarks.find((bench) => bench.benchmark_name === row.dataset.benchmark);
      renderBenchmarks();
      renderBenchmarkDetail();
    });
  });

  if (state.selectedBenchmark && !run.benchmarks.some((bench) => bench.benchmark_name === state.selectedBenchmark.benchmark_name)) {
    state.selectedBenchmark = null;
  }
  if (!state.selectedBenchmark && rows.length) {
    state.selectedBenchmark = rows[0];
    renderBenchmarkDetail();
  }
}

function renderBenchmarkDetail() {
  const bench = state.selectedBenchmark;
  if (!bench) return;
  els.benchmarkDetailTitle.textContent = bench.benchmark_name;
  els.benchmarkDetailScore.textContent = `difficulty ${fmt(bench.difficulty_score ?? bench.difficulty_sum)} · pass ${fmt(bench.predicted_pass_mean, 3)} · raw sum ${fmt(bench.difficulty_sum)}`;
  els.benchmarkTags.innerHTML = bench.tags.length
    ? bench.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")
    : `<span class="pill">untagged</span>`;
  renderTagBars(els.benchmarkBars, bench.tag_scores, { hideZero: true });
}

function renderHeatmap() {
  const run = activeRun();
  const type = els.heatmapType.value;
  const limit = Number(els.heatmapLimit.value) || 60;
  let rows;
  let vectorKey;
  let labelKey;
  let title;
  let columns;
  let yAxisLabel;
  if (type === "modelTags") {
    columns = state.data.tags;
    const modelTagRows = run.models.some((model) => model.tag_scores) ? run.models : state.data.models;
    rows = modelTagRows
      .map((model) => ({
        model: model.model,
        tag_values: columns.map((tag) => model.tag_scores?.[tag] ?? 0),
        capability_sum: model.capability_sum ?? 0,
        tag_score_sum: model.tag_score_sum ?? 0,
      }))
      .sort((a, b) => b.capability_sum - a.capability_sum)
      .slice(0, limit);
    vectorKey = "tag_values";
    labelKey = "model";
    title = "Model × semantic tag heatmap";
    yAxisLabel = "Model";
  } else {
    const isModel = type === "models";
    columns = run.dimensions;
    rows = (isModel ? run.models : run.benchmarks)
      .slice()
      .sort((a, b) =>
        isModel ? b.capability_sum - a.capability_sum : (b.difficulty_score ?? b.difficulty_sum) - (a.difficulty_score ?? a.difficulty_sum)
      )
      .slice(0, limit);
    vectorKey = isModel ? "estimated_capability" : "estimated_difficulty";
    labelKey = isModel ? "model" : "benchmark_name";
    title = isModel ? "Model capability heatmap" : "Benchmark difficulty heatmap";
    yAxisLabel = isModel ? "Model" : "Benchmark";
  }
  const maxAbs = Math.max(...rows.flatMap((row) => row[vectorKey].map((value) => Math.abs(value))), 0.0001);
  const columnStats = type === "modelTags" ? buildColumnStats(rows, vectorKey, columns.length) : [];

  els.heatmapTitle.textContent = title;
  els.heatmap.style.setProperty("--dim-count", columns.length);
  els.heatmap.classList.toggle("tag-heatmap", type === "modelTags");
  const columnLabels = columns
    .map((column, index) => {
      const label = type === "modelTags" ? column : `dim_${index}`;
      return `<div class="heat-col-label" title="${escapeHtml(column)}"><span>${escapeHtml(label)}</span></div>`;
    })
    .join("");
  const headerRow = `
      <div class="heat-row heat-header-row">
        <div class="heat-label heat-axis-label">${escapeHtml(yAxisLabel)} ↓ / ${type === "modelTags" ? "Tag" : "Dimension"} →</div>
        ${columnLabels}
      </div>`;
  const bodyRows = rows
    .map(
      (row) => `
      <div class="heat-row">
        <div class="heat-label" title="${escapeHtml(row[labelKey])}">${escapeHtml(row[labelKey])}</div>
        ${row[vectorKey]
          .map((value, index) => {
            const background = type === "modelTags"
              ? tagValueColor(value, columnStats[index])
              : valueColor(value, maxAbs);
            return `<div class="heat-cell" title="${escapeHtml(columns[index])}: ${fmt(value, 4)}" style="background: ${background}"></div>`;
          })
          .join("")}
      </div>`
    )
    .join("");
  const footerRow = `
      <div class="heat-row heat-footer-row">
        <div class="heat-label heat-axis-label">${escapeHtml(yAxisLabel)} ↓ / Tag →</div>
        ${columnLabels}
      </div>`;
  els.heatmap.innerHTML = type === "modelTags"
    ? `<div class="heat-scroll">${bodyRows}</div><div class="heat-footer-scroll">${footerRow}</div>`
    : headerRow + bodyRows;

  if (type === "modelTags") {
    const scroll = els.heatmap.querySelector(".heat-scroll");
    const footer = els.heatmap.querySelector(".heat-footer-scroll");
    scroll.addEventListener("scroll", () => {
      footer.scrollLeft = scroll.scrollLeft;
    });
  }
}

function renderTags() {
  const activity = state.data.tag_reference?.activity || [];
  if (activity.length) {
    els.tagCards.innerHTML = activity
      .map((tag) => `
        <article class="tag-card">
          <div class="tag-card-head">
            <h3>${escapeHtml(tag.zh || tag.tag)}</h3>
            <span>${escapeHtml(tag.head_description || tag.head || "标签")}</span>
          </div>
          <strong>原始标签：${escapeHtml(tag.tag)}</strong>
          <p>${escapeHtml(tag.definition || "No rubric definition available.")}</p>
          <div class="tag-meter" aria-label="active benchmark ratio">
            <span style="width:${clamp((tag.active_ratio || 0) * 100, 0, 100)}%"></span>
          </div>
          <dl class="tag-stats">
            <div><dt>活跃覆盖</dt><dd>${tag.n_active_benchmarks}/${tag.n_total_benchmarks}</dd></div>
            <div><dt>筛选均值</dt><dd>${fmt(tag.score_mean, 2)}</dd></div>
            <div><dt>全量均值</dt><dd>${fmt(tag.score_mean_all, 2)}</dd></div>
            <div><dt title="outstandingC 活跃阈值：score > tau 即视为该 benchmark 激活此 tag">Tau 阈值</dt><dd>${fmt(tag.tau, 2)}</dd></div>
          </dl>
          <details class="tag-active-list">
            <summary>查看激活 benchmark（${tag.active_benchmarks?.length || 0}）</summary>
            <ul>
              ${(tag.active_benchmarks || [])
                .map((bench) => `
                  <li>
                    <span title="${escapeHtml(bench.source)}">${escapeHtml(bench.benchmark)}</span>
                    <strong>${fmt(bench.score, 2)}</strong>
                  </li>`)
                .join("")}
            </ul>
          </details>
        </article>`)
      .join("");
    return;
  }

  const benchesByTag = new Map(state.data.tags.map((tag) => [tag, []]));
  activeRun().benchmarks.forEach((bench) => {
    bench.tags.forEach((tag) => {
      if (!benchesByTag.has(tag)) benchesByTag.set(tag, []);
      benchesByTag.get(tag).push(bench);
    });
  });

  const cards = [...benchesByTag.entries()].sort((a, b) => b[1].length - a[1].length);
  els.tagCards.innerHTML = cards
    .map(([tag, benches]) => {
      const top = benches
        .slice()
        .sort((a, b) => (b.difficulty_score ?? b.difficulty_sum) - (a.difficulty_score ?? a.difficulty_sum))
        .slice(0, 5)
        .map((bench) => bench.benchmark_name)
        .join(", ");
      return `
        <article class="tag-card">
          <h3>${escapeHtml(tag)}</h3>
          <strong>${benches.length} benchmarks</strong>
          <p>${escapeHtml(top || "No benchmark tagged.")}</p>
        </article>`;
    })
    .join("");
}

function timelineFamilies() {
  const counts = familyCounts();
  return ["All", ...Object.keys(counts).sort((a, b) => {
    if (a === "Others") return 1;
    if (b === "Others") return -1;
    return a.localeCompare(b);
  })];
}

function timelineData() {
  return activeRun().models
    .filter((model) => model.release_date)
    .map((model) => ({
      pointType: "model",
      model: model.model,
      family: model.family,
      release_date: model.release_date,
      capability_sum: model.capability_sum,
    }));
}

function benchmarkTimelineData() {
  return activeRun().benchmarks
    .filter((bench) => bench.release_date)
    .map((bench) => ({
      pointType: "benchmark",
      model: bench.benchmark_name,
      family: "Benchmark",
      release_date: bench.release_date,
      difficulty_sum: bench.difficulty_sum,
      difficulty_mean: bench.difficulty_mean,
      difficulty_l2: bench.difficulty_l2,
      difficulty_score: bench.difficulty_score,
      predicted_pass_mean: bench.predicted_pass_mean,
      tags: bench.tags || [],
      tag_scores: bench.tag_scores || {},
    }));
}

function benchmarkTimelineMetric() {
  const key = state.benchmarkTimelineMetric;
  return BENCHMARK_DIFFICULTY_METRICS[key] ? key : "difficulty_score";
}

function benchmarkTimelineMetricLabel() {
  return BENCHMARK_DIFFICULTY_METRICS[benchmarkTimelineMetric()].shortLabel;
}

function timelineViewMode() {
  return TIMELINE_VIEW_MODES[state.timelineViewMode] ? state.timelineViewMode : "combined";
}

function dominantBenchmarkTag(point) {
  const scores = point.tag_scores || {};
  const scoredTag = Object.entries(scores)
    .filter(([, score]) => Number(score) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  if (scoredTag) return scoredTag[0];
  return (point.tags || [])[0] || "untagged";
}

function metricColor(value, min, max) {
  const t = max === min ? 0.5 : clamp((value - min) / (max - min), 0, 1);
  const low = [87, 132, 165];
  const mid = [236, 225, 203];
  const high = [188, 82, 79];
  const [a, b, mix] = t < 0.5
    ? [low, mid, t / 0.5]
    : [mid, high, (t - 0.5) / 0.5];
  const rgb = a.map((channel, index) => Math.round(channel + (b[index] - channel) * mix));
  return `rgb(${rgb.join(",")})`;
}

function familyCounts() {
  return [...timelineData(), ...benchmarkTimelineData()]
    .map((point) => ({ ...point, dateMs: new Date(`${point.release_date}T00:00:00`).getTime() }))
    .filter((point) => Number.isFinite(point.dateMs) && point.dateMs >= TIMELINE_START_MS)
    .reduce((counts, point) => {
      counts[point.family] = (counts[point.family] || 0) + 1;
      return counts;
    }, {});
}

function renderCanvasFamilyLegend() {
  const families = timelineFamilies();
  const counts = familyCounts();
  els.canvasFamilyLegend.innerHTML = families
    .map((family) => {
      const count = family === "All"
        ? Object.values(counts).reduce((sum, value) => sum + value, 0)
        : counts[family];
      const color = family === "All" ? "#1d2528" : FAMILY_COLORS[family] || FAMILY_COLORS.Others;
      return `
        <button class="legend-button ${state.selectedFamily === family ? "active" : ""}" type="button" data-family="${escapeHtml(family)}">
          <span class="legend-dot" style="background:${color}"></span>
          ${escapeHtml(family)} <small>${count}</small>
        </button>`;
    })
    .join("");
  $$("[data-family]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.selectedFamily === button.dataset.family) return;
      state.timelinePreviousFamily = state.selectedFamily;
      state.selectedFamily = button.dataset.family;
      renderCanvasFamilyLegend();
      animateTimelineTransition();
    });
  });
}

function timelineVisibleFor(point, family) {
  return family === "All" || point.family === family;
}

function timelineDisplayFor(point, family) {
  const focused = timelineVisibleFor(point, family);
  return {
    focused,
    color: focused ? FAMILY_COLORS[point.family] || FAMILY_COLORS.Others : "#aeb4b4",
    alpha: focused ? (point.family === "Others" ? 0.65 : 0.9) : 0.28,
  };
}

function compactTimelineLabel(modelName) {
  const name = String(modelName);
  if (/^Kimi-K2-Instruct/i.test(name)) return "Kimi-K2";
  if (/^Claude Mythos Preview$/i.test(name)) return "Mythos";
  if (/^claude-opus-4-7/i.test(name)) return "Opus 4.7";
  if (/^claude-opus-4-6/i.test(name)) return "Opus 4.6";
  if (/^gpt-5\.5/i.test(name)) return "GPT-5.5";
  return name
    .replace(/[-_]?20\d{2}[-_]\d{2}[-_]\d{2}/g, "")
    .replace(/[-_]?20\d{6}/g, "")
    .replace(/[-_]?0?[\d]{3,4}(?=$|[-_])/g, "")
    .replace(/([-_](medium|high|low|adaptive|max))+$/gi, "")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 24);
}

function timelineLabelFor(point, family) {
  const name = String(point.model);
  if (/^Yi-1\.5-34B$/i.test(name)) return "";
  const isRightTopLabel = /^Claude Mythos Preview$/i.test(name)
    || /^claude-opus-4-7/i.test(name)
    || /^claude-opus-4-6_adaptive/i.test(name)
    || /^gpt-5\.5/i.test(name);
  if (family !== "All" && isRightTopLabel) return "";
  const recentLabelStart = new Date("2025-12-01T00:00:00").getTime();
  if (!isRightTopLabel && point.dateMs >= recentLabelStart) return "";
  if (!point.isTopLayer && !isRightTopLabel) return "";
  return compactTimelineLabel(name);
}

function smoothTimelineEase(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function animateTimelineTransition() {
  if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
  const fromFamily = state.timelinePreviousFamily;
  const toFamily = state.selectedFamily;
  const startedAt = performance.now();
  const duration = 760;
  hideTimelineTooltip();

  const step = (now) => {
    const progress = smoothTimelineEase(clamp((now - startedAt) / duration, 0, 1));
    renderTimeline({ fromFamily, toFamily, progress, animating: progress < 1 });
    if (progress < 1) {
      state.timelineAnimation = requestAnimationFrame(step);
    } else {
      state.timelineAnimation = null;
      state.timelinePreviousFamily = state.selectedFamily;
      renderTimeline();
    }
  };
  state.timelineAnimation = requestAnimationFrame(step);
}

function animateTimelineIntro() {
  if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
  hideTimelineTooltip();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.timelineIntroPlayed = true;
    renderTimeline();
    return;
  }

  const startedAt = performance.now();
  const duration = 1350;

  const step = (now) => {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    renderTimeline({ kind: "intro", progress, animating: progress < 1 });
    if (progress < 1) {
      state.timelineAnimation = requestAnimationFrame(step);
    } else {
      state.timelineAnimation = null;
      state.timelineIntroPlayed = true;
      renderTimeline();
    }
  };

  state.timelineAnimation = requestAnimationFrame(step);
}

function renderTimeline(animation = null) {
  const metricKey = benchmarkTimelineMetric();
  const metricLabel = benchmarkTimelineMetricLabel();
  const mode = timelineViewMode();
  const modelPoints = timelineData()
    .map((point) => ({ ...point, dateMs: new Date(`${point.release_date}T00:00:00`).getTime() }))
    .filter((point) => Number.isFinite(point.dateMs) && Number.isFinite(point.capability_sum))
    .filter((point) => point.dateMs >= TIMELINE_START_MS)
    .sort((a, b) => a.dateMs - b.dateMs);
  const benchmarkPoints = benchmarkTimelineData()
    .map((point) => ({
      ...point,
      dateMs: new Date(`${point.release_date}T00:00:00`).getTime(),
      metricValue: Number(point[metricKey]),
    }))
    .filter((point) => Number.isFinite(point.dateMs) && Number.isFinite(point.metricValue))
    .filter((point) => point.dateMs >= TIMELINE_START_MS)
    .sort((a, b) => a.dateMs - b.dateMs);
  const visibleModels = mode === "benchmarkTags" ? [] : modelPoints.filter((point) => timelineVisibleFor(point, state.selectedFamily));
  const visibleBenchmarks = mode === "models"
    ? []
    : benchmarkPoints.filter((point) => mode === "benchmarkTags" || timelineVisibleFor(point, state.selectedFamily));
  const xPoints = [...modelPoints, ...benchmarkPoints];
  const isIntroAnimation = animation?.kind === "intro";
  const drawModelPoints = isIntroAnimation
    ? visibleModels.map((point, index) => {
        const stagger = visibleModels.length > 1 ? (index / (visibleModels.length - 1)) * 0.58 : 0;
        const pointProgress = smoothTimelineEase(clamp((animation.progress - stagger) / 0.42, 0, 1));
        const display = timelineDisplayFor(point, state.selectedFamily);
        return {
          ...point,
          timelineAlpha: pointProgress,
          timelineActive: display.focused,
          timelineColor: display.color,
          timelineBaseAlpha: display.alpha,
          timelineRise: (1 - pointProgress) * 18,
        };
      })
    : animation
    ? modelPoints.map((point) => {
        const fromDisplay = timelineDisplayFor(point, animation.fromFamily);
        const toDisplay = timelineDisplayFor(point, animation.toFamily);
        const focusLevel = (fromDisplay.focused ? 1 : 0) + ((toDisplay.focused ? 1 : 0) - (fromDisplay.focused ? 1 : 0)) * animation.progress;
        return {
          ...point,
          timelineAlpha: 1,
          timelineActive: toDisplay.focused,
          timelineColor: focusLevel > 0.5 ? toDisplay.color : "#aeb4b4",
          timelineBaseAlpha: 0.28 + focusLevel * 0.62,
        };
      })
    : modelPoints.map((point) => {
        const display = timelineDisplayFor(point, state.selectedFamily);
        return {
          ...point,
          timelineAlpha: 1,
          timelineActive: display.focused,
          timelineColor: display.color,
          timelineBaseAlpha: display.alpha,
        };
      });
  const drawBenchmarkPoints = visibleBenchmarks.map((point) => ({
    ...point,
    timelineAlpha: isIntroAnimation ? smoothTimelineEase(clamp((animation.progress - 0.2) / 0.6, 0, 1)) : 1,
    timelineActive: true,
    timelineColor: FAMILY_COLORS.Benchmark,
    timelineBaseAlpha: 0.82,
  }));

  els.timelineSummary.textContent = `${TIMELINE_VIEW_MODES[mode]} · ${visibleModels.length} models · ${visibleBenchmarks.length} benchmarks`;
  const { ctx, width, height } = canvasSetup(els.timelineCanvas);
  ctx.clearRect(0, 0, width, height);

  if ((!visibleModels.length && !visibleBenchmarks.length) || !xPoints.length) {
    ctx.fillStyle = "#697176";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No dated points from 2023 onward for this view.", width / 2, height / 2);
    return;
  }

  const pad = { left: 70, right: 38, top: 82, bottom: 58 };
  const minX = TIMELINE_START_MS;
  const maxX = Math.max(...xPoints.map((point) => point.dateMs));
  const modelValueSource = visibleModels.length ? visibleModels : modelPoints;
  const minYRaw = Math.min(...modelValueSource.map((point) => point.capability_sum));
  const maxYRaw = Math.max(...modelValueSource.map((point) => point.capability_sum));
  const yPad = Math.max(1, (maxYRaw - minYRaw) * 0.12);
  const minY = Math.floor(minYRaw - yPad);
  const maxY = Math.ceil(maxYRaw + yPad);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  const axisRight = width - pad.right;
  const plotW = axisRight - pad.left;
  const plotH = height - pad.top - pad.bottom;
  const eventBandHeight = mode === "combined" ? 116 : 0;
  const modelTop = pad.top + 16;
  const modelBottom = mode === "combined" ? height - pad.bottom - eventBandHeight : height - pad.bottom;
  const modelH = modelBottom - modelTop;
  const eventTop = modelBottom + 18;
  const eventBottom = height - pad.bottom;
  const eventH = eventBottom - eventTop;
  const xScale = (value) => pad.left + ((value - minX) / xSpan) * plotW;
  const yScale = (value) => modelTop + (1 - (value - minY) / ySpan) * modelH;

  const benchValues = benchmarkPoints.map((point) => point.metricValue).filter(Number.isFinite);
  const hasBenchAxis = benchValues.length > 0;
  const benchMinRaw = hasBenchAxis ? Math.min(...benchValues) : 0;
  const benchMaxRaw = hasBenchAxis ? Math.max(...benchValues) : 1;
  const benchPad = Math.max(1, (benchMaxRaw - benchMinRaw) * 0.12);
  const benchMin = benchMinRaw - benchPad;
  const benchMax = benchMaxRaw + benchPad;
  const benchSpan = benchMax - benchMin || 1;
  const eventYScale = (value) => eventBottom - ((value - benchMin) / benchSpan) * Math.max(12, eventH - 28);

  ctx.strokeStyle = "#e1dacf";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#697176";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  if (mode !== "benchmarkTags") {
    for (let i = 0; i <= 5; i += 1) {
      const value = minY + (ySpan * i) / 5;
      const y = yScale(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(axisRight, y);
      ctx.stroke();
      ctx.fillText(fmt(value, 1), pad.left - 10, y + 4);
    }
  }

  ctx.textAlign = "center";
  const minYear = new Date(minX).getFullYear();
  const maxYear = new Date(maxX).getFullYear();
  for (let year = minYear; year <= maxYear; year += 1) {
    const x = xScale(new Date(`${year}-01-01T00:00:00`).getTime());
    if (x < pad.left || x > axisRight) continue;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.fillText(String(year), x, height - pad.bottom + 24);
  }

  ctx.strokeStyle = "#1d2528";
  ctx.beginPath();
  ctx.moveTo(pad.left, mode === "benchmarkTags" ? pad.top : modelTop);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(axisRight, height - pad.bottom);
  ctx.stroke();

  if (mode === "combined") {
    ctx.fillStyle = "rgba(159, 184, 201, 0.13)";
    ctx.fillRect(pad.left, eventTop - 10, plotW, eventH + 16);
    ctx.strokeStyle = "#9fb8c9";
    ctx.beginPath();
    ctx.moveTo(pad.left, eventTop - 10);
    ctx.lineTo(axisRight, eventTop - 10);
    ctx.stroke();
    ctx.fillStyle = "#5e7e92";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`Benchmark events · color/height = ${metricLabel}`, pad.left + 8, eventTop + 6);
  }

  let bestCapability = -Infinity;
  const sortedByDate = drawModelPoints.filter((point) => point.timelineActive).slice().sort((a, b) => a.dateMs - b.dateMs);
  sortedByDate.forEach((point) => {
    if (point.capability_sum > bestCapability) {
      point.isTopLayer = true;
      bestCapability = point.capability_sum;
    }
  });

  if (mode !== "benchmarkTags") {
    drawModelPoints.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = yScale(point.capability_sum) + (point.timelineRise || 0);
      const baseRadius = point.isTopLayer ? 4.2 : 3.4;
      const radius = baseRadius * (0.76 + point.timelineAlpha * 0.24);
      point.canvasX = x;
      point.canvasY = y;
      point.canvasRadius = radius;
      ctx.fillStyle = point.timelineColor || FAMILY_COLORS[point.family] || FAMILY_COLORS.Others;
      ctx.globalAlpha = (point.timelineBaseAlpha ?? 0.9) * point.timelineAlpha;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const label = timelineLabelFor(point, state.selectedFamily);
      if (label && point.timelineAlpha > 0.72) {
        ctx.fillStyle = "#697176";
        ctx.globalAlpha = point.timelineAlpha;
        ctx.font = "10px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(label, x + 6, y - 5);
        ctx.globalAlpha = 1;
      }
    });
  }

  if (mode === "combined" && hasBenchAxis) {
    drawBenchmarkPoints.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = eventYScale(point.metricValue);
      const radius = 3.4;
      point.canvasX = x;
      point.canvasY = y;
      point.canvasRadius = 9;
      ctx.strokeStyle = "rgba(95, 126, 146, 0.34)";
      ctx.beginPath();
      ctx.moveTo(x, eventBottom);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = metricColor(point.metricValue, benchMinRaw, benchMaxRaw);
      ctx.globalAlpha = point.timelineBaseAlpha * point.timelineAlpha;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  if (mode === "benchmarkTags" && hasBenchAxis) {
    const laneCounts = new Map();
    drawBenchmarkPoints.forEach((point) => {
      point.timelineTag = dominantBenchmarkTag(point);
      laneCounts.set(point.timelineTag, (laneCounts.get(point.timelineTag) || 0) + 1);
    });
    const lanes = [...laneCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
    const laneSet = new Set(lanes);
    const finalLanes = [...lanes, "Other"];
    const laneTop = pad.top + 18;
    const laneBottom = height - pad.bottom - 8;
    const laneStep = (laneBottom - laneTop) / Math.max(1, finalLanes.length - 1);
    ctx.font = "11px system-ui";
    finalLanes.forEach((tag, index) => {
      const y = laneTop + index * laneStep;
      ctx.strokeStyle = "#e1dacf";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(axisRight, y);
      ctx.stroke();
      ctx.fillStyle = "#697176";
      ctx.textAlign = "right";
      ctx.fillText(tag.slice(0, 20), pad.left - 10, y + 4);
    });
    drawBenchmarkPoints.forEach((point) => {
      const tag = laneSet.has(point.timelineTag) ? point.timelineTag : "Other";
      const laneIndex = finalLanes.indexOf(tag);
      const x = xScale(point.dateMs);
      const y = laneTop + laneIndex * laneStep;
      const radius = 3.8 + clamp((point.metricValue - benchMinRaw) / (benchMaxRaw - benchMinRaw || 1), 0, 1) * 2.2;
      point.canvasX = x;
      point.canvasY = y;
      point.canvasRadius = 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = metricColor(point.metricValue, benchMinRaw, benchMaxRaw);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    });
  }

  ctx.fillStyle = "#1d2528";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Release date", pad.left + plotW / 2, height - 12);
  if (mode !== "benchmarkTags") {
    ctx.save();
    ctx.translate(20, modelTop + modelH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Model capability sum", 0, 0);
    ctx.restore();
  }

  const hitPoints = animation?.animating ? [] : [
    ...(mode === "benchmarkTags" ? [] : drawModelPoints.filter((point) => point.timelineActive)),
    ...drawBenchmarkPoints,
  ];
  state.timelinePoints = hitPoints;
  renderTimelineHitLayer(hitPoints);
}

function showTimelineTooltip(point, x, y) {
  els.timelineTooltip.hidden = false;
  const detail = point.pointType === "benchmark"
    ? `Benchmark · ${escapeHtml(point.release_date)} · ${benchmarkTimelineMetricLabel()} ${fmt(point.metricValue, 3)} · ${escapeHtml(dominantBenchmarkTag(point))}`
    : `${escapeHtml(point.family)} · ${escapeHtml(point.release_date)} · capability ${fmt(point.capability_sum, 3)}`;
  els.timelineTooltip.innerHTML = `
    <strong>${escapeHtml(point.model)}</strong>
    <span>${detail}</span>
  `;
  const frame = els.timelineCanvas.getBoundingClientRect();
  els.timelineTooltip.style.left = `${clamp(x + 14, 10, frame.width - 320)}px`;
  els.timelineTooltip.style.top = `${clamp(y + 14, 10, frame.height - 74)}px`;
}

function hideTimelineTooltip() {
  els.timelineTooltip.hidden = true;
  els.timelineCanvas.style.cursor = "default";
}

function nearestTimelinePoint(x, y) {
  const threshold = 20;
  let nearest = null;
  let nearestDistance = threshold * threshold;

  state.timelinePoints.forEach((point) => {
    if (!Number.isFinite(point.canvasX) || !Number.isFinite(point.canvasY)) return;
    const dx = point.canvasX - x;
    const dy = point.canvasY - y;
    const distance = dx * dx + dy * dy;
    if (distance <= nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function handleTimelinePointerMove(event) {
  const frameRect = els.timelineCanvas.getBoundingClientRect();
  const x = event.clientX - frameRect.left;
  const y = event.clientY - frameRect.top;
  const point = nearestTimelinePoint(x, y);

  if (!point) {
    hideTimelineTooltip();
    return;
  }

  els.timelineCanvas.style.cursor = "crosshair";
  showTimelineTooltip(point, x, y);
}

function renderTimelineHitLayer(points) {
  els.timelineHitLayer.innerHTML = points
    .map((point, index) => `
      <button
        class="timeline-hit"
        type="button"
        data-point-index="${index}"
        aria-label="${escapeHtml(point.model)}"
        title="${escapeHtml(point.model)}"
        style="left:${point.canvasX}px; top:${point.canvasY}px;"
      ></button>`)
    .join("");

  els.timelineHitLayer.querySelectorAll(".timeline-hit").forEach((hit) => {
    const point = points[Number(hit.dataset.pointIndex)];
    hit.addEventListener("mouseenter", (event) => {
      const frameRect = els.timelineCanvas.getBoundingClientRect();
      els.timelineCanvas.style.cursor = "crosshair";
      showTimelineTooltip(point, event.clientX - frameRect.left, event.clientY - frameRect.top);
    });
    hit.addEventListener("mousemove", (event) => {
      const frameRect = els.timelineCanvas.getBoundingClientRect();
      showTimelineTooltip(point, event.clientX - frameRect.left, event.clientY - frameRect.top);
    });
    hit.addEventListener("mouseleave", hideTimelineTooltip);
  });
}

function renderFit() {
  if (activeRun().metadata.run_tag !== state.data.metadata.run_tag) {
    els.fitSummary.textContent = "Fit payload is only available for the default training setting.";
    els.fitTable.innerHTML = "";
    drawEmptyFit();
    return;
  }
  const fit = state.data.fit;
  if (!fit?.available) {
    els.fitSummary.textContent = fit?.reason || "Fit payload unavailable";
    els.fitTable.innerHTML = "";
    drawEmptyFit();
    return;
  }
  els.fitSummary.textContent = `${fit.row_count} rows · MSE ${fmt(fit.mse, 5)} · MAE ${fmt(fit.mae, 5)} · corr ${fmt(fit.correlation, 3)}`;
  els.fitTable.innerHTML = fit.worst_rows
    .slice(0, 40)
    .map(
      (row) => `
      <tr>
        <td class="name-cell">${escapeHtml(row.benchmark)}</td>
        <td class="name-cell">${escapeHtml(row.model)}</td>
        <td>${fmt(row.performance, 3)}</td>
        <td>${fmt(row.predicted, 3)}</td>
        <td>${fmt(row.error, 3)}</td>
      </tr>`
    )
    .join("");
  drawFitScatter(fit.scatter);
}

function fitImagePath(runTag) {
  return `./assets/fit_${runTag}.png?v=20260521-remote`;
}

function renderFitImage() {
  const run = activeRun();
  els.fitImage.src = fitImagePath(run.metadata.run_tag);
  els.fitImage.alt = `拟合可视化：${run.metadata.run_tag}`;
  els.fitImageSource.textContent = `远端 outputs/model_fit/train_${run.metadata.run_tag}.pdf`;
}

function canvasSetup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function drawEmptyFit() {
  const { ctx, width, height } = canvasSetup(els.fitCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#697176";
  ctx.font = "14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Prediction fit data is unavailable.", width / 2, height / 2);
}

function drawFitScatter(rows) {
  const { ctx, width, height } = canvasSetup(els.fitCanvas);
  const pad = 44;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#d8d2c5";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = pad + ((width - pad * 2) * i) / 4;
    const y = pad + ((height - pad * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, height - pad);
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#1d2528";
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, pad);
  ctx.stroke();

  const maxErr = Math.max(...rows.map((row) => row.abs_error), 0.001);
  rows.forEach((row) => {
    const x = pad + clamp(row.performance, 0, 1) * (width - pad * 2);
    const y = height - pad - clamp(row.predicted, 0, 1) * (height - pad * 2);
    const alpha = 0.18 + (row.abs_error / maxErr) * 0.7;
    ctx.fillStyle = `rgba(47, 111, 159, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 3.1, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#697176";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Actual", width / 2, height - 10);
  ctx.save();
  ctx.translate(14, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Predicted", 0, 0);
  ctx.restore();
}

function renderRunDependentViews() {
  hydrateStats();
  renderSortOptions();
  state.selectedModel = null;
  state.selectedBenchmark = null;
  renderModels();
  renderBenchmarks();
  renderCanvasFamilyLegend();
  if (state.timelineIntroPlayed) {
    renderTimeline();
  } else {
    animateTimelineIntro();
  }
  renderTags();
  renderHeatmap();
  renderFit();
  renderFitImage();
}

function bindEvents() {
  els.trainingRun.addEventListener("change", () => {
    state.selectedRunTag = els.trainingRun.value;
    hideTimelineTooltip();
    renderRunDependentViews();
  });
  [els.modelSearch, els.modelSort, els.modelLimit].forEach((el) => el.addEventListener("input", renderModels));
  [els.benchmarkSearch, els.benchmarkSort, els.tagFilter].forEach((el) => el.addEventListener("input", renderBenchmarks));
  [els.heatmapType, els.heatmapLimit].forEach((el) => el.addEventListener("input", renderHeatmap));
  els.timelineViewMode.addEventListener("input", () => {
    if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
    state.timelineAnimation = null;
    state.timelineIntroPlayed = true;
    state.timelineViewMode = els.timelineViewMode.value;
    hideTimelineTooltip();
    renderTimeline();
  });
  els.benchmarkTimelineMetric.addEventListener("input", () => {
    if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
    state.timelineAnimation = null;
    state.timelineIntroPlayed = true;
    state.benchmarkTimelineMetric = els.benchmarkTimelineMetric.value;
    hideTimelineTooltip();
    renderTimeline();
  });
  els.timelineCanvas.addEventListener("mousemove", handleTimelinePointerMove);
  els.timelineCanvas.addEventListener("mouseleave", hideTimelineTooltip);
  window.addEventListener("resize", () => {
    if (state.data) {
      renderTimeline();
      renderFit();
    }
  });
}

async function init() {
  const response = await fetch("./data/dashboard_data.json?v=20260528-remote-benchmark-release-dates");
  if (!response.ok) throw new Error(`Failed to load dashboard_data.json: ${response.status}`);
  state.data = await response.json();
  populateControls();
  hydrateStats();
  bindEvents();
  renderModels();
  renderBenchmarks();
  renderCanvasFamilyLegend();
  animateTimelineIntro();
  renderTags();
  renderHeatmap();
  renderFit();
  renderFitImage();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>Dashboard failed to load</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
