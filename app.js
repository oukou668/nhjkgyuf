const state = {
  data: null,
  selectedModel: null,
  selectedBenchmark: null,
  selectedRunTag: null,
  selectedFamily: "All",
  timelineViewMode: "combined",
  benchmarkTimelineMetric: "difficulty_b_scaled",
  timelinePoints: [],
  timelinePreviousFamily: "All",
  timelineAnimation: null,
  timelineIntroPlayed: false,
  timelineZoom: null,
  timelineDrag: null,
  timelinePlot: null,
  heroActive: true,
  heroReadyAt: 0,
  dashboardRendered: false,
};

const FIXED_RUN_TAG = "extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3";
const FIT_IMAGE_FALLBACK_RUN_TAG = FIXED_RUN_TAG;
const TIMELINE_START_DATE = "2023-01-01";
const TIMELINE_START_MS = new Date(`${TIMELINE_START_DATE}T00:00:00`).getTime();
const TIMELINE_RIGHT_PADDING_MS = 70 * 24 * 60 * 60 * 1000;
const TIMELINE_CAPABILITY_LABEL = "Difficulty-weighted imputed score";
const TIMELINE_DISPLAY_LABEL = "Model score";
const TIMELINE_PERCENTILE_LABEL = "Capability percentile";
const BENCHMARK_DIFFICULTY_METRICS = {
  difficulty_b_scaled: { label: "Difficulty × scale", shortLabel: "b × scale" },
  difficulty_b: { label: "Difficulty b", shortLabel: "b" },
  difficulty_score: { label: "Predicted difficulty", shortLabel: "1 - mean predicted score" },
  difficulty_weight: { label: "Difficulty weight", shortLabel: "ranking weight" },
};
const TIMELINE_VIEW_MODES = {
  combined: "Model + benchmark",
  models: "Models only",
  benchmarks: "Benchmarks only",
};
const HERO_EXIT_ARM_DELAY = 700;

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
  heatmapSortTag: $("#heatmapSortTag"),
  heatmapLimit: $("#heatmapLimit"),
  heatmapTitle: $("#heatmapTitle"),
  heatmap: $("#heatmap"),
  tagCards: $("#tagCards"),
  canvasFamilyLegend: $("#canvasFamilyLegend"),
  timelineSummary: $("#timelineSummary"),
  timelineViewMode: $("#timelineViewMode"),
  benchmarkTimelineMetric: $("#benchmarkTimelineMetric"),
  resetTimelineZoom: $("#resetTimelineZoom"),
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
  const t = maxAbs ? Math.pow(clamp(Math.abs(value) / maxAbs, 0, 1), 0.42) : 0;
  return signedHeatColor(value, t);
}

function heatCellTextColor(background) {
  const match = String(background).match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return "#132033";
  const [, rRaw, gRaw, bRaw] = match;
  const r = Number(rRaw);
  const g = Number(gRaw);
  const b = Number(bRaw);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.58 ? "#132033" : "#ffffff";
}

function interpolateColor(a, b, t) {
  const mix = a.map((value, index) => Math.round(value + (b[index] - value) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function interpolateColorStops(stops, t) {
  const clamped = clamp(t, 0, 1);
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  return interpolateColor(stops[index], stops[index + 1], scaled - index);
}

function signedHeatColor(value, t) {
  const positiveStops = [
    [255, 255, 255],
    [255, 238, 168],
    [244, 179, 70],
    [224, 91, 71],
    [166, 38, 103],
  ];
  const negativeStops = [
    [255, 255, 255],
    [195, 234, 230],
    [67, 174, 190],
    [67, 91, 173],
    [84, 38, 139],
  ];
  return interpolateColorStops(value >= 0 ? positiveStops : negativeStops, t);
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
  if (!stats || stats.high === stats.low) return "rgb(255, 255, 255)";
  if (value >= stats.mid) {
    const t = clamp((value - stats.mid) / Math.max(stats.high - stats.mid, 0.0001), 0, 1);
    return signedHeatColor(value, Math.pow(t, 0.44));
  }
  const t = clamp((stats.mid - value) / Math.max(stats.mid - stats.low, 0.0001), 0, 1);
  return signedHeatColor(value, Math.pow(t, 0.44));
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
  const modelSort = els.modelSort.value || "timeline_rank";
  const benchmarkSort = els.benchmarkSort.value || "difficulty_b_scaled";
  els.modelSort.innerHTML = `
    <option value="timeline_rank">Rank</option>
    ${dimOptions}
  `;
  els.benchmarkSort.innerHTML = `
    <option value="difficulty_b_scaled">Difficulty × scale</option>
    <option value="difficulty_b">Difficulty b</option>
    <option value="difficulty_score">Predicted difficulty</option>
    <option value="difficulty_weight">Difficulty weight</option>
    ${dimOptions}
  `;
  els.modelSort.value = [...els.modelSort.options].some((option) => option.value === modelSort) ? modelSort : "timeline_rank";
  els.benchmarkSort.value = [...els.benchmarkSort.options].some((option) => option.value === benchmarkSort)
    ? benchmarkSort
    : "difficulty_b_scaled";
}

function renderHeatmapSortOptions() {
  const tags = state.data.tag_bridge?.tags?.length ? state.data.tag_bridge.tags : state.data.tags;
  const current = els.heatmapSortTag.value || "";
  els.heatmapSortTag.innerHTML = `<option value="">Overall / bridge score</option>${tags
    .map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    .join("")}`;
  els.heatmapSortTag.value = tags.includes(current) ? current : "";
}

function populateControls() {
  const runs = trainingRuns();
  state.selectedRunTag = runs.some((run) => run.metadata.run_tag === state.data.metadata.run_tag)
    ? state.data.metadata.run_tag
    : runs[0].metadata.run_tag;
  els.trainingRun.innerHTML = runs
    .map((run) => `<option value="${escapeHtml(run.metadata.run_tag)}">${escapeHtml(runOptionLabel(run))}</option>`)
    .join("");
  els.trainingRun.value = state.selectedRunTag;
  renderSortOptions();
  els.tagFilter.innerHTML = `<option value="">All tags</option>${state.data.tags
    .map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    .join("")}`;
  renderHeatmapSortOptions();
  els.heatmapType.value = "modelTags";
}

function hydrateStats() {
  const run = activeRun();
  const meta = run.metadata;
  const runConfig = meta.loss
    ? `${meta.method} · ${meta.loss}${Number.isFinite(Number(meta.seed)) ? ` · seed ${meta.seed}` : ""}`
    : `${meta.method} · R=${meta.r}`;
  els.runSource.textContent = meta.source_label;
  els.runConfigMeta.textContent = runConfig;
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

function sortDirection(sortKey) {
  return sortKey === "timeline_rank" ? "asc" : "desc";
}

function sortRowsForKey(rows, sortKey, vectorKey) {
  const direction = sortDirection(sortKey);
  return rows.slice().sort((a, b) => {
    const aValue = getSortValue(a, sortKey, vectorKey);
    const bValue = getSortValue(b, sortKey, vectorKey);
    if (direction === "asc") return aValue - bValue;
    return bValue - aValue;
  });
}

function timelineRankMap() {
  return new Map((state.data.timeline || []).map((point) => [point.model, point.rank]));
}

function modelBridgeTagScores(modelName) {
  const bridgeModel = state.data.tag_bridge?.models?.find((model) => model.model === modelName);
  return bridgeModel?.tag_scores || null;
}

function selectedOptionLabel(selectEl) {
  return selectEl.selectedOptions?.[0]?.textContent || "";
}

function rankMapForSort(items, sortKey, vectorKey, idKey) {
  const sorted = sortRowsForKey(
    items.filter((item) => Number.isFinite(getSortValue(item, sortKey, vectorKey))),
    sortKey,
    vectorKey
  );
  return new Map(sorted.map((item, index) => [item[idKey], index + 1]));
}

function renderModels() {
  const run = activeRun();
  const query = els.modelSearch.value.trim().toLowerCase();
  const sortKey = els.modelSort.value;
  const limit = Number(els.modelLimit.value) || 40;
  const timelineRanks = timelineRankMap();
  const modelRows = run.models.map((model) => ({
    ...model,
    timeline_rank: timelineRanks.get(model.model) ?? Infinity,
  }));
  const ranks = rankMapForSort(modelRows, sortKey, "estimated_capability", "model");
  const rows = sortRowsForKey(
    modelRows
    .filter((model) => model.model.toLowerCase().includes(query))
      .filter((model) => Number.isFinite(getSortValue(model, sortKey, "estimated_capability"))),
    sortKey,
    "estimated_capability"
  );

  els.modelResultCount.textContent = `${rows.length} models · ${run.metadata.dimension_count}d`;
  els.modelTable.innerHTML = rows
    .slice(0, limit)
    .map(
      (model, index) => `
      <tr class="selectable ${state.selectedModel?.model === model.model ? "active" : ""}" data-model="${escapeHtml(model.model)}">
        <td>${ranks.get(model.model) ?? "--"}</td>
        <td class="name-cell">${escapeHtml(model.model)}</td>
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

  if (state.selectedModel && !rows.some((model) => model.model === state.selectedModel.model)) {
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
      const scaledWidth = (Math.abs(value) / max) * (options.centerZero ? 50 : 100);
      const width = Math.max(2, scaledWidth);
      const left = options.centerZero && value < 0 ? 50 - width : options.centerZero ? 50 : 0;
      return `
        <div class="bar-row">
          <span title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>
          <div class="bar-track" title="${fmt(value, 5)}">
            ${options.centerZero ? `<span class="bar-zero" style="left: 50%"></span>` : ""}
            <span class="bar-fill ${value >= 0 ? "positive" : "negative"}" style="left: ${left}%; width: ${width}%"></span>
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
  if (!model) {
    els.modelDetailTitle.textContent = "选择一个模型";
    els.modelDetailScore.textContent = "--";
    els.modelBars.innerHTML = `<p class="muted">No model selected.</p>`;
    return;
  }
  const timelineRank = timelineRankMap().get(model.model);
  const bridgeScores = modelBridgeTagScores(model.model);
  els.modelDetailTitle.textContent = model.model;
  els.modelDetailScore.textContent = `rank ${fmt(timelineRank, 0)} · L2 ${fmt(model.capability_l2)}`;
  renderTagBars(els.modelBars, bridgeScores || model.tag_scores, { centerZero: Boolean(bridgeScores) });
}

function renderBenchmarks() {
  const run = activeRun();
  const query = els.benchmarkSearch.value.trim().toLowerCase();
  const sortKey = els.benchmarkSort.value;
  const metricLabel = selectedOptionLabel(els.benchmarkSort);
  const tag = els.tagFilter.value;
  const ranks = rankMapForSort(run.benchmarks, sortKey, "estimated_difficulty", "benchmark_name");
  const rows = sortRowsForKey(
    run.benchmarks
    .filter((bench) => bench.benchmark_name.toLowerCase().includes(query))
      .filter((bench) => !tag || bench.tags.includes(tag)),
    sortKey,
    "estimated_difficulty"
  );

  els.benchmarkResultCount.textContent = `${rows.length} benchmarks · ${run.metadata.dimension_count}d`;
  els.benchmarkTable.innerHTML = rows
    .map(
      (bench, index) => `
      <tr class="selectable ${state.selectedBenchmark?.benchmark_name === bench.benchmark_name ? "active" : ""}" data-benchmark="${escapeHtml(bench.benchmark_name)}">
        <td>${ranks.get(bench.benchmark_name) ?? "--"}</td>
        <td class="name-cell">${escapeHtml(bench.benchmark_name)}</td>
        <td title="${escapeHtml(metricLabel)}">${fmt(getSortValue(bench, sortKey, "estimated_difficulty"))}</td>
        <td>${fmt(bench.difficulty_score)}</td>
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

  if (state.selectedBenchmark && !rows.some((bench) => bench.benchmark_name === state.selectedBenchmark.benchmark_name)) {
    state.selectedBenchmark = null;
  }
  if (!state.selectedBenchmark && rows.length) {
    state.selectedBenchmark = rows[0];
    renderBenchmarkDetail();
  }
}

function renderBenchmarkDetail() {
  const bench = state.selectedBenchmark;
  if (!bench) {
    els.benchmarkDetailTitle.textContent = "选择一个 benchmark";
    els.benchmarkDetailScore.textContent = "--";
    els.benchmarkTags.innerHTML = "";
    els.benchmarkBars.innerHTML = `<p class="muted">No benchmark selected.</p>`;
    return;
  }
  const sortKey = els.benchmarkSort.value;
  const metricLabel = selectedOptionLabel(els.benchmarkSort);
  els.benchmarkDetailTitle.textContent = bench.benchmark_name;
  els.benchmarkDetailScore.textContent = `${metricLabel} ${fmt(getSortValue(bench, sortKey, "estimated_difficulty"))} · b ${fmt(bench.difficulty_b)} · scale ${fmt(bench.mirt_scale)} · pred diff ${fmt(bench.difficulty_score)}`;
  els.benchmarkTags.innerHTML = bench.tags.length
    ? bench.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")
    : `<span class="pill">untagged</span>`;
  renderTagBars(els.benchmarkBars, bench.tag_scores, { hideZero: true });
}

function renderHeatmap() {
  const run = activeRun();
  const type = els.heatmapType.value;
  const limit = Number(els.heatmapLimit.value) || 60;
  const sortTag = type === "modelTags" ? els.heatmapSortTag.value : "";
  let rows;
  let vectorKey;
  let labelKey;
  let title;
  let columns;
  let yAxisLabel;
  const tagBridge = type === "modelTags" ? state.data.tag_bridge : null;
  if (type === "modelTags") {
    columns = tagBridge?.tags?.length ? tagBridge.tags : state.data.tags;
    const modelTagRows = tagBridge?.models?.length
      ? tagBridge.models
      : (run.models.some((model) => model.tag_scores) ? run.models : state.data.models);
    const sortTagIndex = sortTag ? columns.indexOf(sortTag) : -1;
    rows = modelTagRows
      .map((model) => ({
        model: model.model,
        tag_values: columns.map((tag) => model.tag_scores?.[tag] ?? 0),
        capability_sum: model.capability_sum ?? 0,
        tag_score_sum: model.tag_score_sum ?? 0,
        bridge_rank_score: model.bridge_rank_score ?? null,
      }))
      .sort((a, b) => {
        if (sortTagIndex >= 0) {
          const tagDelta = (b.tag_values[sortTagIndex] ?? 0) - (a.tag_values[sortTagIndex] ?? 0);
          if (Math.abs(tagDelta) > 1e-12) return tagDelta;
        }
        if (tagBridge?.models?.length) return (b.bridge_rank_score ?? 0) - (a.bridge_rank_score ?? 0);
        return b.capability_sum - a.capability_sum;
      })
      .slice(0, limit);
    vectorKey = "tag_values";
    labelKey = "model";
    title = tagBridge?.models?.length
      ? `Model × semantic tag bridge heatmap${tagBridge.source_run_tag ? ` (${tagBridge.source_run_tag.split("_vd=")[0]})` : ""}`
      : "Model × semantic tag heatmap";
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
  const absValues = rows.flatMap((row) => row[vectorKey].map((value) => Math.abs(value))).filter(Number.isFinite);
  const maxAbs = Math.max(quantile(absValues, tagBridge?.models?.length ? 0.94 : 0.9), 0.0001);
  const columnStats = type === "modelTags" ? buildColumnStats(rows, vectorKey, columns.length) : [];

  els.heatmapTitle.textContent = title;
  els.heatmapSortTag.disabled = type !== "modelTags";
  els.heatmap.style.setProperty("--dim-count", columns.length);
  els.heatmap.classList.toggle("tag-heatmap", type === "modelTags");
  const tagFitByName = new Map((tagBridge?.fit || []).map((entry) => [entry.tag, entry]));
  const columnLabels = columns
    .map((column, index) => {
      const fit = tagFitByName.get(column);
      const label = type === "modelTags" ? column : `dim_${index}`;
      const titleText = fit ? `${column} · bridge CV Spearman ${fmt(fit.spearman_CV, 3)}` : column;
      return `<div class="heat-col-label" title="${escapeHtml(titleText)}"><span>${escapeHtml(label)}</span></div>`;
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
              ? (tagBridge?.models?.length ? valueColor(value, maxAbs) : tagValueColor(value, columnStats[index]))
              : valueColor(value, maxAbs);
            const fit = tagFitByName.get(columns[index]);
            const cvText = fit ? ` · CV ${fmt(fit.spearman_CV, 3)}` : "";
            const textColor = heatCellTextColor(background);
            return `<div class="heat-cell" title="${escapeHtml(columns[index])}: ${fmt(value, 4)}${cvText}" style="background: ${background}; color: ${textColor}"><span>${fmt(value, 2)}</span></div>`;
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
  const rubricTags = state.data.tag_reference?.rubric_tags || [];
  if (rubricTags.length) {
    const activityByTag = new Map(activity.map((tag) => [tag.tag, tag]));
    els.tagCards.innerHTML = rubricTags
      .map((rubricTag) => {
        const tag = { ...rubricTag, ...(activityByTag.get(rubricTag.tag) || {}) };
        const hasActivity = activityByTag.has(rubricTag.tag);
        const anchors = Object.entries(rubricTag.anchors || {}).sort(([a], [b]) => Number(a) - Number(b));
        return `
        <article class="tag-card ${hasActivity ? "" : "tag-card-muted"}">
          <div class="tag-card-head">
            <h3>${escapeHtml(tag.zh || tag.tag)}</h3>
            <span>${escapeHtml(tag.head_description || tag.head || "标签")}</span>
          </div>
          <strong>原始标签：${escapeHtml(tag.tag)}</strong>
          <p>${escapeHtml(tag.definition || "No rubric definition available.")}</p>
          ${hasActivity ? `
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
          ` : `<p class="tag-note">新版 rubric 中存在该标签；当前聚合 tag score 暂无 activity 统计。</p>`}
          ${anchors.length ? `
            <details class="tag-active-list">
              <summary>查看 0-5 分锚点</summary>
              <ul class="tag-anchor-list">
                ${anchors.map(([score, text]) => `
                  <li>
                    <strong>${escapeHtml(score)}</strong>
                    <span>${escapeHtml(text)}</span>
                  </li>`)
                  .join("")}
              </ul>
            </details>
          ` : ""}
          ${(rubricTag.boundary_notes || []).length ? `
            <details class="tag-active-list">
              <summary>边界说明</summary>
              <ul class="tag-note-list">
                ${rubricTag.boundary_notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
        </article>`;
      })
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
  const timeline = state.data?.timeline || [];
  if (timeline.length) {
    return timeline
      .filter((point) => point.release_date)
      .map((point) => ({
        pointType: "model",
        model: point.model,
        family: point.family,
        release_date: point.release_date,
        capability_sum: point.capability_sum ?? point.difficulty_weighted_imputed_score,
        rank: point.rank,
      }));
  }
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
      difficulty_weighted: bench.difficulty_weighted,
      difficulty_b: bench.difficulty_b,
      difficulty_b_scaled: bench.difficulty_b_scaled,
      difficulty_weight: bench.difficulty_weight,
      difficulty_mean: bench.difficulty_mean,
      difficulty_l2: bench.difficulty_l2,
      difficulty_score: bench.difficulty_score,
      predicted_pass_mean: bench.predicted_pass_mean,
      tags: bench.tags || [],
      tag_scores: bench.tag_scores || {},
    }));
}

function attachTimelineDisplayScores(points) {
  const rankedPoints = points.filter((point) => Number.isFinite(point.rank));
  const maxRank = rankedPoints.length ? Math.max(...rankedPoints.map((point) => point.rank)) : 0;
  if (maxRank > 1) {
    return points.map((point) => ({
      ...point,
      timelineDisplayScore: point.capability_sum,
      timelinePercentileScore: Number.isFinite(point.rank)
        ? ((maxRank - point.rank) / (maxRank - 1)) * 100
        : null,
    }));
  }

  const sortedScores = points
    .map((point) => point.capability_sum)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const lastIndex = sortedScores.length - 1;
  return points.map((point) => {
    const firstIndex = sortedScores.findIndex((value) => value >= point.capability_sum);
    const percentile = lastIndex > 0 && firstIndex >= 0 ? (firstIndex / lastIndex) * 100 : 50;
    return { ...point, timelineDisplayScore: point.capability_sum, timelinePercentileScore: percentile };
  });
}

function benchmarkTimelineMetric() {
  const key = state.benchmarkTimelineMetric;
  return BENCHMARK_DIFFICULTY_METRICS[key] ? key : "difficulty_b_scaled";
}

function benchmarkTimelineMetricLabel() {
  return BENCHMARK_DIFFICULTY_METRICS[benchmarkTimelineMetric()].label;
}

function timelineViewMode() {
  return TIMELINE_VIEW_MODES[state.timelineViewMode] ? state.timelineViewMode : "combined";
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
  return timelineData()
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
      const color = family === "All" ? "#14233a" : FAMILY_COLORS[family] || FAMILY_COLORS.Others;
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
    color: focused ? FAMILY_COLORS[point.family] || FAMILY_COLORS.Others : "#b5c5d6",
    alpha: focused ? (point.family === "Others" ? 0.65 : 0.9) : 0.28,
  };
}

function benchmarkTimelineDisplayFor(family, mode) {
  const focused = family === "All" || mode === "benchmarks";
  return {
    focused,
    color: focused ? FAMILY_COLORS.Benchmark : "#b5c5d6",
    alpha: focused ? 0.82 : 0.2,
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

function drawTimelineLegend(ctx, width, pad, mode, metricLabel) {
  const items = mode === "benchmarks"
    ? [{ type: "benchmark", label: `Benchmark · ${metricLabel}` }]
    : [
        { type: "model", label: `Model · ${TIMELINE_DISPLAY_LABEL}` },
        { type: "benchmark", label: mode === "combined" ? `Benchmark · ${metricLabel} · right axis` : `Benchmark · ${metricLabel}` },
      ];
  const legendW = mode === "benchmarks" ? 188 : mode === "combined" ? 374 : 296;
  const x0 = Math.max(pad.left + 12, width - pad.right - legendW);
  const y0 = pad.top - 46;
  let x = x0 + 12;

  ctx.save();
  ctx.fillStyle = "rgba(248, 251, 255, 0.96)";
  ctx.strokeStyle = "#cfe0f2";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x0, y0, legendW, 30, 8);
  ctx.fill();
  ctx.stroke();
  ctx.font = "11px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  items.forEach((item) => {
    if (item.type === "model") {
      ctx.fillStyle = FAMILY_COLORS.Claude;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(x + 5, y0 + 15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      x += 16;
    } else {
      ctx.save();
      ctx.translate(x + 5, y0 + 15);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#bb524f";
      ctx.globalAlpha = 0.82;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.globalAlpha = 1;
      x += 16;
    }
    ctx.fillStyle = "#5f7088";
    ctx.fillText(item.label, x, y0 + 15);
    x += ctx.measureText(item.label).width + 22;
  });
  ctx.restore();
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

function removeHeroExitListeners() {
  window.removeEventListener("wheel", handleHeroExit);
  window.removeEventListener("pointermove", handleHeroExit);
  window.removeEventListener("keydown", handleHeroExit);
}

function exitHeroMode() {
  if (!state.heroActive || !document.body.classList.contains("hero-mode")) return;
  state.heroActive = false;
  removeHeroExitListeners();
  document.body.classList.add("hero-exiting");
  hideTimelineTooltip();
  window.setTimeout(() => {
    document.body.classList.remove("hero-mode", "hero-exiting");
    window.scrollTo(0, 0);
    renderDeferredDashboard();
    renderTimeline();
  }, 170);
}

function handleHeroExit(event) {
  if (!state.heroActive || Date.now() < state.heroReadyAt) return;
  if (event.type === "wheel") event.preventDefault();
  exitHeroMode();
}

function enableHeroMode() {
  state.heroActive = true;
  state.heroReadyAt = Date.now() + HERO_EXIT_ARM_DELAY;
  document.body.classList.add("hero-mode");
  window.addEventListener("wheel", handleHeroExit, { passive: false });
  window.addEventListener("pointermove", handleHeroExit);
  window.addEventListener("keydown", handleHeroExit);
}

function renderDeferredDashboard() {
  if (state.dashboardRendered) return;
  state.dashboardRendered = true;
  hydrateStats();
  renderModels();
  renderBenchmarks();
  renderTags();
  renderHeatmap();
  renderFit();
  renderFitImage();
}

function renderTimeline(animation = null) {
  const isHeroMode = document.body.classList.contains("hero-mode");
  const metricKey = benchmarkTimelineMetric();
  const metricLabel = benchmarkTimelineMetricLabel();
  const mode = timelineViewMode();
  const modelPoints = attachTimelineDisplayScores(timelineData()
    .map((point) => ({ ...point, dateMs: new Date(`${point.release_date}T00:00:00`).getTime() }))
    .filter((point) => Number.isFinite(point.dateMs) && Number.isFinite(point.capability_sum))
    .filter((point) => point.dateMs >= TIMELINE_START_MS)
    .sort((a, b) => a.dateMs - b.dateMs));
  const benchmarkPoints = benchmarkTimelineData()
    .map((point) => ({
      ...point,
      dateMs: new Date(`${point.release_date}T00:00:00`).getTime(),
      metricValue: Number(point[metricKey]),
    }))
    .filter((point) => Number.isFinite(point.dateMs) && Number.isFinite(point.metricValue))
    .filter((point) => point.dateMs >= TIMELINE_START_MS)
    .sort((a, b) => a.dateMs - b.dateMs);
  const visibleModels = mode === "benchmarks" ? [] : modelPoints.filter((point) => timelineVisibleFor(point, state.selectedFamily));
  const visibleBenchmarks = mode === "models"
    ? []
    : benchmarkPoints;
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
          timelineColor: focusLevel > 0.5 ? toDisplay.color : "#b5c5d6",
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
  const drawBenchmarkPoints = visibleBenchmarks.map((point) => {
    if (isIntroAnimation) {
      const display = benchmarkTimelineDisplayFor(state.selectedFamily, mode);
      return {
        ...point,
        timelineAlpha: smoothTimelineEase(clamp((animation.progress - 0.2) / 0.6, 0, 1)),
        timelineActive: display.focused,
        timelineColor: display.color,
        timelineBaseAlpha: display.alpha,
      };
    }
    if (animation) {
      const fromDisplay = benchmarkTimelineDisplayFor(animation.fromFamily, mode);
      const toDisplay = benchmarkTimelineDisplayFor(animation.toFamily, mode);
      const focusLevel = (fromDisplay.focused ? 1 : 0) + ((toDisplay.focused ? 1 : 0) - (fromDisplay.focused ? 1 : 0)) * animation.progress;
      return {
        ...point,
        timelineAlpha: 1,
        timelineActive: toDisplay.focused,
        timelineColor: focusLevel > 0.5 ? toDisplay.color : "#b5c5d6",
        timelineBaseAlpha: 0.2 + focusLevel * 0.62,
      };
    }
    const display = benchmarkTimelineDisplayFor(state.selectedFamily, mode);
    return {
      ...point,
      timelineAlpha: 1,
      timelineActive: display.focused,
      timelineColor: display.color,
      timelineBaseAlpha: display.alpha,
    };
  });

  const timelineMeta = state.data?.timeline_metadata;
  const timelineSource = timelineMeta
    ? `masked_agg MIRT k=${timelineMeta.vector_dim} seed${timelineMeta.seed}`
    : "active run capability sum";
  els.timelineSummary.textContent = `${TIMELINE_VIEW_MODES[mode]} · ${visibleModels.length} models · ${visibleBenchmarks.length} benchmarks · ${timelineSource}${state.timelineZoom ? " · zoomed" : ""}`;
  if (els.resetTimelineZoom) els.resetTimelineZoom.disabled = !state.timelineZoom;
  const { ctx, width, height } = canvasSetup(els.timelineCanvas);
  ctx.clearRect(0, 0, width, height);

  if ((!visibleModels.length && !visibleBenchmarks.length) || !xPoints.length) {
    ctx.fillStyle = "#5f7088";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No dated points from 2023 onward for this view.", width / 2, height / 2);
    return;
  }

  const pad = {
    left: isHeroMode ? 94 : 70,
    right: mode === "combined" ? (isHeroMode ? 122 : 102) : (isHeroMode ? 64 : 48),
    top: isHeroMode ? 88 : 82,
    bottom: isHeroMode ? 94 : 58,
  };
  const rawMinX = TIMELINE_START_MS;
  const rawMaxDate = Math.max(...xPoints.map((point) => point.dateMs));
  const rawMaxX = rawMaxDate + Math.max(TIMELINE_RIGHT_PADDING_MS, (rawMaxDate - rawMinX) * 0.045);
  const modelValues = modelPoints.map((point) => point.capability_sum).filter(Number.isFinite);
  const modelMinRaw = modelValues.length ? Math.min(...modelValues) : 0;
  const modelMaxRaw = modelValues.length ? Math.max(...modelValues) : 1;
  const modelPad = Math.max(0.001, (modelMaxRaw - modelMinRaw) * 0.08);
  const rawModelMin = modelMinRaw - modelPad;
  const rawModelMax = modelMaxRaw + modelPad;
  let minX = state.timelineZoom?.minX ?? rawMinX;
  let maxX = state.timelineZoom?.maxX ?? rawMaxX;
  let minY = state.timelineZoom?.minY ?? (mode === "benchmarks" ? 0 : rawModelMin);
  let maxY = state.timelineZoom?.maxY ?? (mode === "benchmarks" ? 100 : rawModelMax);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  const axisRight = width - pad.right;
  const plotW = axisRight - pad.left;
  const plotH = height - pad.top - pad.bottom;
  const modelTop = pad.top;
  const modelBottom = height - pad.bottom;
  const modelH = modelBottom - modelTop;
  const xScale = (value) => pad.left + ((value - minX) / xSpan) * plotW;
  const yScale = (value) => modelTop + (1 - (value - minY) / ySpan) * modelH;

  const benchValues = benchmarkPoints.map((point) => point.metricValue).filter(Number.isFinite);
  const hasBenchAxis = benchValues.length > 0;
  const benchMinRaw = hasBenchAxis ? Math.min(...benchValues) : 0;
  const benchMaxRaw = hasBenchAxis ? Math.max(...benchValues) : 1;
  const benchPad = Math.max(0.001, (benchMaxRaw - benchMinRaw) * 0.12);
  const rawBenchMin = benchMinRaw - benchPad;
  const rawBenchMax = benchMaxRaw + benchPad;
  const benchMin = mode === "benchmarks" && state.timelineZoom ? minY : rawBenchMin;
  const benchMax = mode === "benchmarks" && state.timelineZoom ? maxY : rawBenchMax;
  const benchSpan = benchMax - benchMin || 1;
  const benchMainYScale = (value) => pad.top + (1 - (value - benchMin) / benchSpan) * plotH;
  const benchmarkModelValue = (value) => rawModelMin + ((value - rawBenchMin) / (rawBenchMax - rawBenchMin || 1)) * (rawModelMax - rawModelMin || 1);
  const benchmarkValueFromModelValue = (value) => rawBenchMin + ((value - rawModelMin) / (rawModelMax - rawModelMin || 1)) * (rawBenchMax - rawBenchMin || 1);
  const modelInView = (point) =>
    point.dateMs >= minX &&
    point.dateMs <= maxX &&
    point.timelineDisplayScore >= minY &&
    point.timelineDisplayScore <= maxY;
  const benchmarkInView = (point) =>
    point.dateMs >= minX &&
    point.dateMs <= maxX &&
    (mode === "benchmarks"
      ? point.metricValue >= benchMin && point.metricValue <= benchMax
      : mode === "combined"
      ? benchmarkModelValue(point.metricValue) >= minY && benchmarkModelValue(point.metricValue) <= maxY
      : true);
  const drawModelPointsInView = drawModelPoints.filter(modelInView);
  const drawBenchmarkPointsInView = drawBenchmarkPoints.filter(benchmarkInView);
  state.timelinePlot = {
    axisRight,
    benchMax,
    benchMin,
    eventBottom: modelBottom,
    eventTop: modelTop,
    maxX,
    maxY: mode === "benchmarks" ? benchMax : maxY,
    minX,
    minY: mode === "benchmarks" ? benchMin : minY,
    mode,
    modelBottom,
    modelTop,
    padLeft: pad.left,
    plotBottom: modelBottom,
    plotTop: mode === "benchmarks" ? pad.top : modelTop,
    rawMaxX,
    rawMaxY: mode === "benchmarks" ? rawBenchMax : rawModelMax,
    rawMinX,
    rawMinY: mode === "benchmarks" ? rawBenchMin : rawModelMin,
  };

  ctx.strokeStyle = "#cfe0f2";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5f7088";
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  if (mode === "benchmarks" && hasBenchAxis) {
    for (let i = 0; i <= 5; i += 1) {
      const value = benchMin + (benchSpan * i) / 5;
      const y = benchMainYScale(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(axisRight, y);
      ctx.stroke();
      ctx.fillText(fmt(value, 2), pad.left - 10, y + 4);
    }
  } else {
    for (let i = 0; i <= 5; i += 1) {
      const value = minY + (ySpan * i) / 5;
      const y = yScale(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(axisRight, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(fmt(value, 3), pad.left - 10, y + 4);
      if (mode === "combined" && hasBenchAxis) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#1f68b3";
        ctx.fillText(fmt(benchmarkValueFromModelValue(value), 2), axisRight + 10, y + 4);
        ctx.fillStyle = "#5f7088";
      }
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

  ctx.strokeStyle = "#14233a";
  ctx.beginPath();
  ctx.moveTo(pad.left, mode === "benchmarks" ? pad.top : modelTop);
  ctx.lineTo(pad.left, modelBottom);
  ctx.lineTo(axisRight, modelBottom);
  if (mode === "combined" && hasBenchAxis) {
    ctx.moveTo(axisRight, modelBottom);
    ctx.lineTo(axisRight, modelTop);
  }
  ctx.stroke();

  drawTimelineLegend(ctx, width, pad, mode, metricLabel);

  let bestCapability = -Infinity;
  const sortedByDate = drawModelPointsInView.filter((point) => point.timelineActive).slice().sort((a, b) => a.dateMs - b.dateMs);
  sortedByDate.forEach((point) => {
    if (point.capability_sum > bestCapability) {
      point.isTopLayer = true;
      bestCapability = point.capability_sum;
    }
  });

  if (mode !== "benchmarks") {
    drawModelPointsInView.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = yScale(point.timelineDisplayScore) + (point.timelineRise || 0);
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
        ctx.fillStyle = "#5f7088";
        ctx.globalAlpha = point.timelineAlpha;
        ctx.font = "10px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(label, x + 6, y - 5);
        ctx.globalAlpha = 1;
      }
    });
  }

  if (mode === "benchmarks" && hasBenchAxis) {
    drawBenchmarkPointsInView.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = benchMainYScale(point.metricValue);
      const radius = 4 + clamp((point.metricValue - benchMinRaw) / (benchMaxRaw - benchMinRaw || 1), 0, 1) * 2.4;
      point.canvasX = x;
      point.canvasY = y;
      point.canvasRadius = 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = point.timelineActive
        ? metricColor(point.metricValue, benchMinRaw, benchMaxRaw)
        : point.timelineColor || "#b5c5d6";
      ctx.globalAlpha = (point.timelineActive ? 0.9 : point.timelineBaseAlpha ?? 0.2) * point.timelineAlpha;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.globalAlpha = 1;

      if (point.timelineActive && point.metricValue >= quantile(benchmarkPoints.map((item) => item.metricValue), 0.82)) {
        ctx.fillStyle = "#5f7088";
        ctx.font = "10px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(compactTimelineLabel(point.model), x + 7, y - 6);
      }
    });
  }

  if (mode === "combined" && hasBenchAxis) {
    drawBenchmarkPointsInView.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = yScale(benchmarkModelValue(point.metricValue));
      const strength = clamp((point.metricValue - benchMinRaw) / (benchMaxRaw - benchMinRaw || 1), 0, 1);
      const radius = 3.3 + strength * 1.9;
      point.canvasX = x;
      point.canvasY = y;
      point.canvasRadius = 9;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = point.timelineActive
        ? metricColor(point.metricValue, benchMinRaw, benchMaxRaw)
        : point.timelineColor || "#b5c5d6";
      const activeAlpha = 0.58 + strength * 0.34;
      ctx.globalAlpha = (point.timelineActive ? activeAlpha : point.timelineBaseAlpha ?? 0.2) * point.timelineAlpha;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  ctx.fillStyle = "#14233a";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Release date", pad.left + plotW / 2, isHeroMode ? height - 58 : height - 12);
  if (mode === "benchmarks") {
    ctx.save();
    ctx.translate(20, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Benchmark ${metricLabel}`, 0, 0);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(20, modelTop + modelH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(TIMELINE_DISPLAY_LABEL, 0, 0);
    ctx.restore();
    if (mode === "combined" && hasBenchAxis) {
      ctx.save();
      ctx.fillStyle = "#1f68b3";
      ctx.translate(width - 24, modelTop + modelH / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`Benchmark ${metricLabel}`, 0, 0);
      ctx.restore();
    }
  }

  const hitPoints = animation?.animating ? [] : [
    ...(mode === "benchmarks" ? [] : drawModelPointsInView.filter((point) => point.timelineActive)),
    ...drawBenchmarkPointsInView,
  ];
  state.timelinePoints = hitPoints;
  renderTimelineHitLayer(hitPoints);
}

function showTimelineTooltip(point, x, y) {
  els.timelineTooltip.hidden = false;
  const detail = point.pointType === "benchmark"
    ? `Benchmark · ${escapeHtml(point.release_date)} · ${benchmarkTimelineMetricLabel()} ${fmt(point.metricValue, 3)}`
    : `${escapeHtml(point.family)} · ${escapeHtml(point.release_date)} · ${TIMELINE_DISPLAY_LABEL} ${fmt(point.timelineDisplayScore, 3)}${Number.isFinite(point.timelinePercentileScore) ? ` · ${TIMELINE_PERCENTILE_LABEL} ${fmt(point.timelinePercentileScore, 1)}` : ""}${Number.isFinite(point.rank) ? ` · rank ${point.rank}` : ""}`;
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

function timelineEventPoint(event) {
  const frameRect = els.timelineCanvas.getBoundingClientRect();
  return {
    x: event.clientX - frameRect.left,
    y: event.clientY - frameRect.top,
  };
}

function clampToTimelinePlot(point) {
  const plot = state.timelinePlot;
  if (!plot) return point;
  return {
    x: clamp(point.x, plot.padLeft, plot.axisRight),
    y: clamp(point.y, plot.plotTop, plot.plotBottom),
  };
}

function pointInsideTimelinePlot(point) {
  const plot = state.timelinePlot;
  return Boolean(
    plot &&
      point.x >= plot.padLeft &&
      point.x <= plot.axisRight &&
      point.y >= plot.plotTop &&
      point.y <= plot.plotBottom
  );
}

function clampTimelineZoom(zoom, plot = state.timelinePlot) {
  if (!plot || !zoom) return null;
  const rawXSpan = plot.rawMaxX - plot.rawMinX || 1;
  const rawYSpan = plot.rawMaxY - plot.rawMinY || 1;
  let xSpan = clamp(zoom.maxX - zoom.minX, rawXSpan / 120, rawXSpan);
  let ySpan = clamp(zoom.maxY - zoom.minY, rawYSpan / 80, rawYSpan);
  let minX = zoom.minX;
  let maxX = minX + xSpan;
  let minY = zoom.minY;
  let maxY = minY + ySpan;

  if (minX < plot.rawMinX) {
    minX = plot.rawMinX;
    maxX = minX + xSpan;
  }
  if (maxX > plot.rawMaxX) {
    maxX = plot.rawMaxX;
    minX = maxX - xSpan;
  }
  if (minY < plot.rawMinY) {
    minY = plot.rawMinY;
    maxY = minY + ySpan;
  }
  if (maxY > plot.rawMaxY) {
    maxY = plot.rawMaxY;
    minY = maxY - ySpan;
  }

  const isFullX = Math.abs(minX - plot.rawMinX) < 1 && Math.abs(maxX - plot.rawMaxX) < 1;
  const isFullY = Math.abs(minY - plot.rawMinY) < 0.001 && Math.abs(maxY - plot.rawMaxY) < 0.001;
  return isFullX && isFullY ? null : { minX, maxX, minY, maxY };
}

function resetTimelineZoom() {
  state.timelineZoom = null;
  state.timelineDrag = null;
  hideTimelineTooltip();
  renderTimeline();
}

function handleTimelineWheel(event) {
  if (state.timelineAnimation) return;
  const plot = state.timelinePlot;
  const point = timelineEventPoint(event);
  if (!plot || !pointInsideTimelinePlot(point)) return;
  event.preventDefault();
  hideTimelineTooltip();

  const plotW = plot.axisRight - plot.padLeft || 1;
  const plotH = plot.plotBottom - plot.plotTop || 1;
  const xRatio = clamp((point.x - plot.padLeft) / plotW, 0, 1);
  const yRatio = clamp((point.y - plot.plotTop) / plotH, 0, 1);
  const xSpan = plot.maxX - plot.minX || 1;
  const ySpan = plot.maxY - plot.minY || 1;
  const xValue = plot.minX + xRatio * xSpan;
  const yValue = plot.maxY - yRatio * ySpan;
  const scale = clamp(Math.exp(event.deltaY * 0.0012), 0.55, 1.8);
  const nextXSpan = xSpan * scale;
  const nextYSpan = ySpan * scale;
  state.timelineZoom = clampTimelineZoom({
    minX: xValue - xRatio * nextXSpan,
    maxX: xValue + (1 - xRatio) * nextXSpan,
    minY: yValue - (1 - yRatio) * nextYSpan,
    maxY: yValue + yRatio * nextYSpan,
  }, plot);
  renderTimeline();
}

function handleTimelineMouseDown(event) {
  if (event.button !== 0 || state.timelineAnimation || !state.timelineZoom) return;
  const point = timelineEventPoint(event);
  if (!pointInsideTimelinePlot(point)) return;
  state.timelineDrag = {
    active: true,
    start: point,
    zoomStart: { ...state.timelineZoom },
  };
  hideTimelineTooltip();
  event.preventDefault();
}

function handleTimelineMouseUp() {
  if (!state.timelineDrag?.active) return;
  state.timelineDrag = null;
  els.timelineCanvas.style.cursor = "grab";
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
  const { x, y } = timelineEventPoint(event);
  if (state.timelineDrag?.active) {
    const plot = state.timelinePlot;
    const drag = state.timelineDrag;
    if (!plot || !drag.zoomStart) return;
    const plotW = plot.axisRight - plot.padLeft || 1;
    const plotH = plot.plotBottom - plot.plotTop || 1;
    const xSpan = drag.zoomStart.maxX - drag.zoomStart.minX || 1;
    const ySpan = drag.zoomStart.maxY - drag.zoomStart.minY || 1;
    const dx = x - drag.start.x;
    const dy = y - drag.start.y;
    state.timelineZoom = clampTimelineZoom({
      minX: drag.zoomStart.minX - (dx / plotW) * xSpan,
      maxX: drag.zoomStart.maxX - (dx / plotW) * xSpan,
      minY: drag.zoomStart.minY + (dy / plotH) * ySpan,
      maxY: drag.zoomStart.maxY + (dy / plotH) * ySpan,
    }, plot);
    hideTimelineTooltip();
    els.timelineCanvas.style.cursor = "grabbing";
    renderTimeline();
    return;
  }
  const point = nearestTimelinePoint(x, y);

  if (!point) {
    hideTimelineTooltip();
    if (state.timelineZoom && pointInsideTimelinePlot({ x, y })) {
      els.timelineCanvas.style.cursor = "grab";
    }
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
  return `./assets/fit_${runTag}.png?v=20260618-public`;
}

function renderFitImage() {
  const run = activeRun();
  const runTag = run.metadata.run_tag?.startsWith("extend") ? run.metadata.run_tag : FIT_IMAGE_FALLBACK_RUN_TAG;
  els.fitImage.src = fitImagePath(runTag);
  els.fitImage.alt = `拟合可视化：${runTag}`;
  els.fitImageSource.textContent = `公开拟合摘要图：${runTag}`;
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
  ctx.fillStyle = "#5f7088";
  ctx.font = "14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Prediction fit data is unavailable.", width / 2, height / 2);
}

function drawFitScatter(rows) {
  const { ctx, width, height } = canvasSetup(els.fitCanvas);
  const pad = 44;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#cfe0f2";
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
  ctx.strokeStyle = "#14233a";
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

  ctx.fillStyle = "#5f7088";
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
  [els.modelSearch, els.modelSort, els.modelLimit].forEach((el) => el.addEventListener("input", () => {
    renderModels();
    renderModelDetail();
  }));
  [els.benchmarkSearch, els.benchmarkSort, els.tagFilter].forEach((el) => el.addEventListener("input", () => {
    renderBenchmarks();
    renderBenchmarkDetail();
  }));
  [els.heatmapType, els.heatmapSortTag, els.heatmapLimit].forEach((el) => el.addEventListener("input", renderHeatmap));
  els.timelineViewMode.addEventListener("input", () => {
    if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
    state.timelineAnimation = null;
    state.timelineIntroPlayed = true;
    state.timelineViewMode = els.timelineViewMode.value;
    state.timelineZoom = null;
    hideTimelineTooltip();
    renderTimeline();
  });
  els.benchmarkTimelineMetric.addEventListener("input", () => {
    if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
    state.timelineAnimation = null;
    state.timelineIntroPlayed = true;
    state.benchmarkTimelineMetric = els.benchmarkTimelineMetric.value;
    state.timelineZoom = null;
    hideTimelineTooltip();
    renderTimeline();
  });
  els.resetTimelineZoom?.addEventListener("click", resetTimelineZoom);
  els.timelineCanvas.addEventListener("wheel", handleTimelineWheel, { passive: false });
  els.timelineCanvas.addEventListener("mousedown", handleTimelineMouseDown);
  els.timelineCanvas.addEventListener("mousemove", handleTimelinePointerMove);
  els.timelineCanvas.addEventListener("mouseleave", () => {
    if (!state.timelineDrag?.active) hideTimelineTooltip();
  });
  els.timelineCanvas.addEventListener("dblclick", resetTimelineZoom);
  window.addEventListener("mouseup", handleTimelineMouseUp);
  window.addEventListener("resize", () => {
    if (state.data) {
      renderTimeline();
      if (state.dashboardRendered) renderFit();
    }
  });
}

async function init() {
  const dataUrl = new URL("./data/dashboard_data_20260616.json", window.location.href);
  dataUrl.searchParams.set("v", "20260707-k19-seed30890121-tag-bridge");
  dataUrl.searchParams.set("t", String(Date.now()));
  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${dataUrl.pathname}: ${response.status}`);
  state.data = await response.json();
  populateControls();
  bindEvents();
  enableHeroMode();
  renderCanvasFamilyLegend();
  animateTimelineIntro();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>Dashboard failed to load</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
