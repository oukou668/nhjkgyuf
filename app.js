const state = {
  data: null,
  itemExamples: null,
  itemExamplesError: false,
  selectedModel: null,
  selectedBenchmark: null,
  selectedRunTag: null,
  selectedFamily: "All",
  timelineViewMode: "models",
  benchmarkTimelineMetric: "difficulty_b",
  timelinePoints: [],
  timelineSearchSelection: null,
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

const FIT_IMAGE_FALLBACK_RUN_TAG = "extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3";
const TIMELINE_START_DATE = "2023-01-01";
const TIMELINE_START_MS = new Date(`${TIMELINE_START_DATE}T00:00:00`).getTime();
const TIMELINE_RIGHT_PADDING_MS = 70 * 24 * 60 * 60 * 1000;
const TIMELINE_CAPABILITY_LABEL = "Mean latent ability";
const TIMELINE_DISPLAY_LABEL = "Mean latent ability";
const TIMELINE_AXIS_LABEL = "Mean latent ability";
const TIMELINE_PERCENTILE_LABEL = "Ability percentile";
const TIMELINE_SCORE_DIGITS = 3;
const BENCHMARK_DIFFICULTY_METRICS = {
  difficulty_b: { label: "Difficulty b", shortLabel: "b" },
  difficulty_score: { label: "Predicted difficulty", shortLabel: "1 - mean predicted score" },
  difficulty_weight: { label: "Difficulty weight", shortLabel: "ranking weight" },
};
const TIMELINE_VIEW_MODES = {
  combined: "Model + benchmark linked",
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
  observedRate: $("#observedRate"),
  coverageCells: $("#coverageCells"),
  observedCoverage: $("#observedCoverage"),
  imputedCoverage: $("#imputedCoverage"),
  observedCoverageBar: $("#observedCoverageBar"),
  activeRunLabel: $("#activeRunLabel"),
  activeRunSource: $("#activeRunSource"),
  fitAvailability: $("#fitAvailability"),
  bridgeReliability: $("#bridgeReliability"),
  bridgeSummary: $("#bridgeSummary"),
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
  timelineSearchToggle: $("#timelineSearchToggle"),
  timelineSearchPanel: $("#timelineSearchPanel"),
  timelineSearchInput: $("#timelineSearchInput"),
  timelineSearchClear: $("#timelineSearchClear"),
  timelineSearchStatus: $("#timelineSearchStatus"),
  timelineSearchResults: $("#timelineSearchResults"),
  benchmarkMetricField: $("#benchmarkMetricField"),
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

function themeColor(token, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

function syncDocumentThemeColor() {
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", themeColor("--bg", "#f5f9ff"));
}

function compactAxisNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const absolute = Math.abs(number);
  const units = [
    { threshold: 1e9, divisor: 1e9, suffix: "B" },
    { threshold: 1e6, divisor: 1e6, suffix: "M" },
    { threshold: 1e3, divisor: 1e3, suffix: "k" },
  ];
  const unit = units.find((item) => absolute >= item.threshold);
  if (!unit) return fmt(number, digits);
  const scaled = number / unit.divisor;
  const precision = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toFixed(precision).replace(/\.0+$|(?<=\.[0-9])0+$/, "")}${unit.suffix}`;
}

function timelineDateTicks(minX, maxX) {
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = (maxX - minX) / dayMs;
  const stepMonths = spanDays <= 240 ? 1 : spanDays <= 620 ? 3 : spanDays <= 1180 ? 6 : 12;
  const start = new Date(minX);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();

  if (stepMonths === 12) {
    if (month > 0) year += 1;
    month = 0;
  } else {
    month = Math.ceil(month / stepMonths) * stepMonths;
    if (month >= 12) {
      year += 1;
      month -= 12;
    }
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ticks = [];
  let cursor = new Date(Date.UTC(year, month, 1));
  while (cursor.getTime() <= maxX) {
    const tickYear = cursor.getUTCFullYear();
    const tickMonth = cursor.getUTCMonth();
    const label = stepMonths === 12
      ? String(tickYear)
      : stepMonths === 3
      ? `Q${Math.floor(tickMonth / 3) + 1} ’${String(tickYear).slice(-2)}`
      : `${monthNames[tickMonth]} ’${String(tickYear).slice(-2)}`;
    ticks.push({ value: cursor.getTime(), label });
    cursor = new Date(Date.UTC(tickYear, tickMonth + stepMonths, 1));
  }
  return ticks;
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
    [248, 245, 238],
    [238, 222, 190],
    [217, 157, 91],
    [193, 95, 60],
    [119, 56, 39],
  ];
  const negativeStops = [
    [248, 245, 238],
    [216, 229, 223],
    [130, 170, 163],
    [74, 116, 128],
    [32, 63, 74],
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
    const low = quantile(values, 0.08);
    const high = quantile(values, 0.92);
    const mid = quantile(values, 0.5);
    return { low, mid, high };
  });
}

function columnRelativeHeatColor(value, stats) {
  if (!Number.isFinite(Number(value)) || !stats || stats.high === stats.low) return "rgb(248, 245, 238)";
  if (value >= stats.mid) {
    const t = clamp((value - stats.mid) / Math.max(stats.high - stats.mid, 0.0001), 0, 1);
    return signedHeatColor(1, Math.pow(t, 0.62));
  }
  const t = clamp((stats.mid - value) / Math.max(stats.mid - stats.low, 0.0001), 0, 1);
  return signedHeatColor(-1, Math.pow(t, 0.62));
}

const FAMILY_COLORS = {
  GPT: "#476f79",
  Claude: "#c15f3c",
  Gemini: "#64806a",
  DeepSeek: "#a64d3e",
  Qwen: "#8f7b9e",
  GLM: "#8b6e52",
  Llama: "#b96f84",
  Kimi: "#4f8a87",
  Benchmark: "#8f8678",
  Others: "#aaa49a",
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
  const benchmarkSort = els.benchmarkSort.value || "difficulty_b";
  els.modelSort.innerHTML = `
    <option value="timeline_rank">Rank</option>
    ${dimOptions}
  `;
  els.benchmarkSort.innerHTML = `
    <option value="difficulty_b">Difficulty b</option>
    <option value="difficulty_score">Predicted difficulty</option>
    <option value="difficulty_weight">Difficulty weight</option>
    ${dimOptions}
  `;
  els.modelSort.value = [...els.modelSort.options].some((option) => option.value === modelSort) ? modelSort : "timeline_rank";
  els.benchmarkSort.value = [...els.benchmarkSort.options].some((option) => option.value === benchmarkSort)
    ? benchmarkSort
    : "difficulty_b";
}

function renderHeatmapSortOptions() {
  const tags = state.data.tag_bridge?.tags?.length ? state.data.tag_bridge.tags : state.data.tags;
  const current = els.heatmapSortTag.value || "";
  els.heatmapSortTag.innerHTML = `<option value="">Mean latent ability</option>${tags
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
  const pageMeta = state.data.metadata || meta;
  const ranking = state.data.ranking_metadata || state.data.timeline_metadata || {};
  const completeCells = Number(ranking.complete_cell_count) || 0;
  const observedCells = Number(ranking.observed_cell_count) || 0;
  const imputedCells = Number(ranking.imputed_cell_count) || 0;
  const observedRate = completeCells ? (observedCells / completeCells) * 100 : 0;
  const imputedRate = completeCells ? (imputedCells / completeCells) * 100 : 0;
  const runConfig = meta.loss
    ? `${meta.method} · ${meta.loss}${Number.isFinite(Number(meta.seed)) ? ` · seed ${meta.seed}` : ""}`
    : `${meta.method} · R=${meta.r}`;
  els.runSource.textContent = meta.source_label;
  els.runConfigMeta.textContent = runConfig;
  els.modelCount.textContent = meta.model_count;
  els.benchmarkCount.textContent = meta.benchmark_count;
  els.dimensionCount.textContent = meta.dimension_count;
  els.tagCount.textContent = meta.tag_count ?? state.data.tags.length;
  els.observedRate.textContent = completeCells ? `${fmt(observedRate, 1)}%` : "--";
  els.coverageCells.textContent = completeCells
    ? `${observedCells.toLocaleString()} observed / ${completeCells.toLocaleString()} cells`
    : "Coverage unavailable";
  els.observedCoverage.textContent = completeCells
    ? `${observedCells.toLocaleString()} · ${fmt(observedRate, 1)}%`
    : "--";
  els.imputedCoverage.textContent = completeCells
    ? `${imputedCells.toLocaleString()} · ${fmt(imputedRate, 1)}%`
    : "--";
  els.observedCoverageBar.style.width = `${clamp(observedRate, 0, 100)}%`;
  els.activeRunLabel.textContent = `${meta.dimension_count} latent dimensions · validation MSE ${fmt(meta.validation_mse, 4)}`;
  els.activeRunSource.textContent = `${pageMeta.source_label || meta.source_label || "Current dashboard data"}. ${pageMeta.selection_reason || meta.selection_reason || ""}`.trim();
  els.fitAvailability.textContent = state.data.fit?.available
    ? `Raw fit diagnostics available · MSE ${fmt(state.data.fit.mse, 4)}`
    : state.data.fit?.reason || "Raw fit diagnostics are not included in this freeze.";
  els.modelLimit.max = meta.model_count;
}

function renderBridgeReliability() {
  const rows = (state.data.tag_bridge?.fit || [])
    .map((row) => ({ ...row, spearman: Number(row.spearman_CV) }))
    .filter((row) => Number.isFinite(row.spearman))
    .sort((a, b) => b.spearman - a.spearman);

  if (!rows.length) {
    els.bridgeReliability.innerHTML = `<p class="muted">Bridge reliability data unavailable.</p>`;
    els.bridgeSummary.textContent = "No held-out diagnostics";
    return;
  }

  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.spearman)), 0.01);
  const positiveRows = rows.filter((row) => row.spearman > 0);
  const median = positiveRows.length
    ? quantile(positiveRows.map((row) => row.spearman), 0.5)
    : 0;
  const overlap = Number(state.data.tag_bridge?.benchmark_overlap);
  els.bridgeSummary.textContent = `${rows.length} constructs · median ρ ${fmt(median, 2)}${Number.isFinite(overlap) ? ` · ${overlap} annotated benchmarks` : ""}`;
  els.bridgeReliability.innerHTML = rows
    .map((row, index) => {
      const width = Math.max(2, (Math.abs(row.spearman) / maxAbs) * 100);
      return `
        <button class="bridge-row" type="button" data-bridge-tag="${escapeHtml(row.tag)}" title="Sort the model heatmap by ${escapeHtml(row.tag)}">
          <span class="bridge-rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="bridge-name">${escapeHtml(row.tag)}</span>
          <span class="bridge-track"><i class="${row.spearman >= 0 ? "positive" : "negative"}" style="width:${width}%"></i></span>
          <strong>${fmt(row.spearman, 2)}</strong>
        </button>`;
    })
    .join("");

  els.bridgeReliability.querySelectorAll("[data-bridge-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      els.heatmapType.value = "modelTags";
      els.heatmapSortTag.value = button.dataset.bridgeTag;
      renderHeatmap();
      document.querySelector(".heatmap-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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
  if (sortKey === "timeline_rank") return new Map(items.map((item) => [item[idKey], item.timeline_rank]));
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
    timeline_rank: model.rank ?? timelineRanks.get(model.model) ?? Infinity,
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
        <td>${fmt(model.capability_mean, 3)}</td>
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
    els.modelDetailTitle.textContent = "Select a model";
    els.modelDetailScore.textContent = "--";
    els.modelBars.innerHTML = `<p class="muted">No model selected.</p>`;
    return;
  }
  const timelineRank = model.rank ?? timelineRankMap().get(model.model);
  const bridgeScores = modelBridgeTagScores(model.model);
  els.modelDetailTitle.textContent = model.model;
  els.modelDetailScore.textContent = `rank ${fmt(timelineRank, 0)} · mean ${fmt(model.capability_mean, 3)}`;
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
    els.benchmarkDetailTitle.textContent = "Select a benchmark";
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
        capability_sum: model.capability_mean ?? 0,
        tag_score_sum: model.tag_score_sum ?? 0,
        bridge_rank_score: model.bridge_rank_score ?? null,
      }))
      .sort((a, b) => {
        if (sortTagIndex >= 0) {
          const tagDelta = (b.tag_values[sortTagIndex] ?? 0) - (a.tag_values[sortTagIndex] ?? 0);
          if (Math.abs(tagDelta) > 1e-12) return tagDelta;
        }
        return b.capability_sum - a.capability_sum;
      })
      .slice(0, limit);
    vectorKey = "tag_values";
    labelKey = "model";
    title = "Models × semantic constructs";
    yAxisLabel = "Model";
  } else {
    const isModel = type === "models";
    columns = run.dimensions;
    rows = (isModel ? run.models : run.benchmarks)
      .slice()
      .sort((a, b) =>
        isModel ? b.capability_mean - a.capability_mean : (b.difficulty_score ?? b.difficulty_sum) - (a.difficulty_score ?? a.difficulty_sum)
      )
      .slice(0, limit);
    vectorKey = isModel ? "estimated_capability" : "estimated_difficulty";
    labelKey = isModel ? "model" : "benchmark_name";
    title = isModel ? "Models × latent dimensions" : "Benchmarks × latent dimensions";
    yAxisLabel = isModel ? "Model" : "Benchmark";
  }
  const columnStats = buildColumnStats(rows, vectorKey, columns.length);

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
            const background = columnRelativeHeatColor(value, columnStats[index]);
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

function renderTagExamples(tag) {
  if (state.itemExamplesError) return `<p class="tag-note">Item examples could not be loaded. <button class="tag-examples-retry" type="button">Retry</button></p>`;
  if (!state.itemExamples) return `<p class="tag-note">Loading item examples…</p>`;
  const summary = state.itemExamples.tags[tag];
  const items = (summary?.top_items || []).map((id) => state.itemExamples.items[id]).filter(Boolean);
  const renderItems = (rows) => rows.map((item) => {
      const annotation = item.annotations[tag];
      const preview = item.question.replace(/\s+/g, " ");
      const url = `./item.html?id=${encodeURIComponent(item.id)}&tag=${encodeURIComponent(tag)}`;
      return `<li>
        <div class="tag-example-heading"><span>${escapeHtml(item.dataset)}</span><strong>${fmt(annotation.score, 0)} / 5</strong></div>
        <p class="tag-example-preview" dir="auto">${escapeHtml(preview.slice(0, 220))}${preview.length > 220 ? "…" : ""}</p>
        <p class="tag-example-rationale" dir="auto">${escapeHtml(annotation.rationale || "No rationale recorded.")}</p>
        <a class="tag-example-link" href="${url}" target="_blank" rel="noopener">View full item ↗<span class="sr-only"> (opens in a new tab)</span></a>
      </li>`;
    }).join("");
  return `<section class="tag-examples" aria-label="Highest-scoring items">
    <h4>Highest-scoring items</h4>
    <p class="tag-example-meta">${summary?.annotated_items || 0} annotated items · tag demand / 5</p>
    ${items.length ? `<ol>${renderItems(items.slice(0, 3))}</ol>
      ${items.length > 3 ? `<details class="tag-more-items"><summary>Show ${items.length - 3} more items (${items.length} total)</summary><ol start="4">${renderItems(items.slice(3))}</ol></details>` : ""}` : `<p class="tag-note">${summary?.annotated_items ? "No positive-score items in the available annotations." : "No item annotations available for this tag in the local snapshot."}</p>`}
  </section>`;
}

async function loadTagExamples() {
  const restoreInitialAnchor = !state.itemExamples && !state.itemExamplesError;
  state.itemExamplesError = false;
  try {
    const response = await fetch("./data/tag_item_examples.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Item examples: ${response.status}`);
    state.itemExamples = await response.json();
    const meta = state.itemExamples.metadata;
    $("#tagExamplesScope").textContent = `Current constructs with up to 10 items by annotation score. The first 3 are shown; expand each tag to see more. Examples cover ${meta.item_count.toLocaleString()} local items across ${meta.dataset_count} datasets. Scores measure tag demand (0–5); ties use annotation confidence. Open an item for its full question and annotation.`;
  } catch (error) {
    state.itemExamplesError = true;
    console.error(error);
  }
  renderTags();
  if (restoreInitialAnchor && (location.hash === "#tagsView" || location.hash.startsWith("#construct-"))) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }
}

function renderTags() {
  const activity = state.data.tag_reference?.activity || [];
  const currentTags = new Set(state.data.tags);
  const rubricTags = (state.data.tag_reference?.rubric_tags || []).filter((tag) => currentTags.has(tag.tag));
  if (rubricTags.length) {
    const activityByTag = new Map(activity.map((tag) => [tag.tag, tag]));
    els.tagCards.innerHTML = rubricTags
      .map((rubricTag) => {
        const tag = { ...rubricTag, ...(activityByTag.get(rubricTag.tag) || {}) };
        const hasActivity = activityByTag.has(rubricTag.tag);
        const anchors = Object.entries(rubricTag.anchors || {}).sort(([a], [b]) => Number(a) - Number(b));
        return `
        <article id="construct-${escapeHtml(tag.tag)}" class="tag-card ${hasActivity ? "" : "tag-card-muted"}">
          <div class="tag-card-head">
            <h3>${escapeHtml(tag.zh || tag.tag)}</h3>
            <span>${escapeHtml(tag.head_description || tag.head || "Construct")}</span>
          </div>
          <strong>Source tag: ${escapeHtml(tag.tag)}</strong>
          <p>${escapeHtml(tag.definition || "No rubric definition available.")}</p>
          ${hasActivity ? `
            <div class="tag-meter" aria-label="active benchmark ratio">
              <span style="width:${clamp((tag.active_ratio || 0) * 100, 0, 100)}%"></span>
            </div>
            <dl class="tag-stats">
              <div><dt>Active coverage</dt><dd>${tag.n_active_benchmarks}/${tag.n_total_benchmarks}</dd></div>
              <div><dt>Filtered mean</dt><dd>${fmt(tag.score_mean, 2)}</dd></div>
              <div><dt>Overall mean</dt><dd>${fmt(tag.score_mean_all, 2)}</dd></div>
              <div><dt title="A benchmark activates this construct when score > tau">Tau threshold</dt><dd>${fmt(tag.tau, 2)}</dd></div>
            </dl>
            <details class="tag-active-list">
              <summary>Active benchmarks (${tag.active_benchmarks?.length || 0})</summary>
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
          ` : `<p class="tag-note">This construct exists in the current rubric; activity statistics are not available in this snapshot.</p>`}
          ${anchors.length ? `
            <details class="tag-active-list">
              <summary>View 0–5 scoring anchors</summary>
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
              <summary>Boundary notes</summary>
              <ul class="tag-note-list">
                ${rubricTag.boundary_notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
              </ul>
            </details>
          ` : ""}
          ${renderTagExamples(tag.tag)}
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
        capability_sum: point.capability_mean,
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
      capability_sum: model.capability_mean,
      rank: model.rank,
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
  const maxRank = state.data.metadata.model_count;
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
  return BENCHMARK_DIFFICULTY_METRICS[key] ? key : "difficulty_b";
}

function benchmarkTimelineMetricLabel() {
  return BENCHMARK_DIFFICULTY_METRICS[benchmarkTimelineMetric()].label;
}

function timelineViewMode() {
  return TIMELINE_VIEW_MODES[state.timelineViewMode] ? state.timelineViewMode : "models";
}

function timelineSearchKey(point) {
  return `${point.pointType}:${point.model}`;
}

function timelineSearchMatches() {
  const normalize = (value) => String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const query = normalize(els.timelineSearchInput.value);
  if (!query) return [];
  const mode = timelineViewMode();
  return [
    ...(mode === "benchmarks" ? [] : timelineData()),
    ...(mode === "models" ? [] : benchmarkTimelineData()),
  ].filter((point) => {
    const date = new Date(`${point.release_date}T00:00:00`).getTime();
    const score = point.pointType === "benchmark" ? point[benchmarkTimelineMetric()] : point.capability_sum;
    return date >= TIMELINE_START_MS && Number.isFinite(score) && normalize(point.model).includes(query);
  }).sort((a, b) => {
    const aName = normalize(a.model);
    const bName = normalize(b.model);
    return Number(bName === query) - Number(aName === query)
      || Number(bName.startsWith(query)) - Number(aName.startsWith(query))
      || a.model.localeCompare(b.model);
  });
}

function renderTimelineSearchResults() {
  const matches = timelineSearchMatches();
  els.timelineSearchInput.placeholder = timelineViewMode() === "benchmarks" ? "AIME, GPQA, MMLU…" : "GPT, Claude, Llama…";
  const hasQuery = els.timelineSearchInput.value.trim();
  els.timelineSearchStatus.textContent = !hasQuery
    ? "Search names in the current view."
    : matches.length ? `${matches.length} results · select to locate` : "No matching points in this view.";
  els.timelineSearchResults.replaceChildren();
  matches.forEach((point) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-search-result";
    const name = document.createElement("span");
    name.textContent = point.model;
    const detail = document.createElement("small");
    detail.textContent = `${point.pointType === "benchmark" ? "Benchmark" : point.family} · ${point.release_date}`;
    button.append(name, detail);
    button.addEventListener("click", () => locateTimelineSearchPoint(point));
    els.timelineSearchResults.append(button);
  });
}

function setTimelineSearchOpen(open) {
  els.timelineSearchPanel.hidden = !open;
  els.timelineSearchToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    renderTimelineSearchResults();
    els.timelineSearchInput.focus();
  }
}

function locateTimelineSearchPoint(point) {
  if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
  state.timelineAnimation = null;
  state.timelineIntroPlayed = true;
  state.timelineSearchSelection = timelineSearchKey(point);
  // Search all families, including points outside the current pan/zoom.
  state.selectedFamily = "All";
  if (!state.timelinePoints.some((item) => timelineSearchKey(item) === state.timelineSearchSelection)) {
    state.timelineZoom = null;
  }
  hideTimelineTooltip();
  renderTimeline();
  renderCanvasFamilyLegend();
  setTimelineSearchOpen(false);
  els.timelineSearchToggle.focus();
  const selected = state.timelinePoints.find((item) => timelineSearchKey(item) === state.timelineSearchSelection);
  if (selected) showTimelineTooltip(selected, selected.canvasX, selected.canvasY);
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
  els.canvasFamilyLegend.innerHTML = families
    .map((family) => {
      const color = family === "All" ? "#14233a" : FAMILY_COLORS[family] || FAMILY_COLORS.Others;
      return `
        <button class="legend-button ${state.selectedFamily === family ? "active" : ""}" type="button" data-family="${escapeHtml(family)}">
          <span class="legend-dot" style="background:${color}"></span>
          ${escapeHtml(family)}
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

function shouldBreakFrontierConnection(previousPoint, currentPoint) {
  if (!previousPoint || !currentPoint) return false;
  const isLlama65B = (point) => /^LLaMA-65B$/i.test(String(point.model));
  const isEarlyGpt4 = (point) => /^gpt-4(?:-|_|$)/i.test(String(point.model));
  return (
    (isLlama65B(previousPoint) && isEarlyGpt4(currentPoint)) ||
    (isEarlyGpt4(previousPoint) && isLlama65B(currentPoint))
  );
}

function smoothTimelineEase(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function drawTimelineLegend(ctx, width, pad, mode, metricLabel) {
  const metricShortLabel = BENCHMARK_DIFFICULTY_METRICS[benchmarkTimelineMetric()]?.shortLabel || metricLabel;
  const items = mode === "benchmarks"
    ? [{ type: "benchmark", label: `Benchmark · ${metricShortLabel}` }]
    : mode === "models"
    ? [{ type: "model", label: "Model capability" }]
    : [
        { type: "model", label: "Model · mean ability" },
        { type: "benchmark", label: `Benchmark · ${metricShortLabel}` },
      ];
  const idealLegendW = mode === "benchmarks" ? 174 : mode === "combined" ? 286 : 152;
  const legendW = Math.min(idealLegendW, width - pad.left - 8);
  const x0 = Math.max(pad.left + 12, width - pad.right - legendW);
  const y0 = pad.top - 46;
  let x = x0 + 12;

  ctx.save();
  ctx.fillStyle = themeColor("--tooltip-bg", "rgba(248, 245, 238, 0.96)");
  ctx.strokeStyle = themeColor("--line", "#cfc8ba");
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
      ctx.fillStyle = themeColor("--accent", "#bb524f");
      ctx.globalAlpha = 0.82;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.globalAlpha = 1;
      x += 16;
    }
    ctx.fillStyle = themeColor("--muted", "#6b675f");
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
  const chartInk = themeColor("--ink", "#14233a");
  const chartMuted = themeColor("--muted", "#5f7088");
  const chartGrid = themeColor("--chart-grid", "rgba(31, 31, 28, 0.11)");
  const chartGridSoft = themeColor("--chart-grid-soft", "rgba(31, 31, 28, 0.09)");
  const chartAccent = themeColor("--accent", "#c15f3c");
  const chartBlue = themeColor("--blue", "#1f68b3");
  const chartInactive = themeColor("--chart-inactive", "#b5c5d6");
  if (els.benchmarkMetricField) els.benchmarkMetricField.hidden = mode === "models";
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
  const xPoints = mode === "models"
    ? modelPoints
    : mode === "benchmarks"
    ? benchmarkPoints
    : [...modelPoints, ...benchmarkPoints];
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
          timelineColor: focusLevel > 0.5 ? toDisplay.color : chartInactive,
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
        timelineColor: focusLevel > 0.5 ? toDisplay.color : chartInactive,
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
  const timelineSource = timelineMeta?.score_label || TIMELINE_CAPABILITY_LABEL;
  els.timelineSummary.textContent = `${TIMELINE_VIEW_MODES[mode]} · ${visibleModels.length} models · ${visibleBenchmarks.length} benchmarks · ${timelineSource}${state.timelineZoom ? " · zoomed" : ""}`;
  if (els.resetTimelineZoom) els.resetTimelineZoom.disabled = !state.timelineZoom;
  const { ctx, width, height } = canvasSetup(els.timelineCanvas);
  ctx.clearRect(0, 0, width, height);

  if ((!visibleModels.length && !visibleBenchmarks.length) || !xPoints.length) {
    ctx.fillStyle = chartMuted;
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No dated points from 2023 onward for this view.", width / 2, height / 2);
    return;
  }

  const pad = {
    left: isHeroMode ? 94 : 70,
    right: isHeroMode ? 64 : 48,
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
  const benchValues = benchmarkPoints.map((point) => point.metricValue).filter(Number.isFinite);
  const hasBenchAxis = benchValues.length > 0;
  const splitCombined = mode === "combined" && hasBenchAxis;
  const benchMinRaw = hasBenchAxis ? Math.min(...benchValues) : 0;
  const benchMaxRaw = hasBenchAxis ? Math.max(...benchValues) : 1;
  const benchPad = Math.max(0.001, (benchMaxRaw - benchMinRaw) * 0.12);
  const rawBenchMin = benchMinRaw - benchPad;
  const rawBenchMax = benchMaxRaw + benchPad;
  let minX = state.timelineZoom?.minX ?? rawMinX;
  let maxX = state.timelineZoom?.maxX ?? rawMaxX;
  let minY = state.timelineZoom?.minY ?? (mode === "benchmarks" ? rawBenchMin : rawModelMin);
  let maxY = state.timelineZoom?.maxY ?? (mode === "benchmarks" ? rawBenchMax : rawModelMax);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  const axisRight = width - pad.right;
  const plotW = axisRight - pad.left;
  const plotH = height - pad.top - pad.bottom;
  const panelGap = splitCombined ? (isHeroMode ? 38 : 32) : 0;
  const modelTop = pad.top;
  const modelBottom = splitCombined
    ? modelTop + Math.floor((plotH - panelGap) * 0.56)
    : height - pad.bottom;
  const modelH = modelBottom - modelTop;
  const benchTop = splitCombined ? modelBottom + panelGap : pad.top;
  const benchBottom = height - pad.bottom;
  const benchH = benchBottom - benchTop;
  const xScale = (value) => pad.left + ((value - minX) / xSpan) * plotW;
  const yScale = (value) => modelTop + (1 - (value - minY) / ySpan) * modelH;

  const benchMin = splitCombined
    ? (state.timelineZoom?.minBenchY ?? rawBenchMin)
    : mode === "benchmarks" ? minY : rawBenchMin;
  const benchMax = splitCombined
    ? (state.timelineZoom?.maxBenchY ?? rawBenchMax)
    : mode === "benchmarks" ? maxY : rawBenchMax;
  const benchSpan = benchMax - benchMin || 1;
  const benchMainYScale = (value) => benchTop + (1 - (value - benchMin) / benchSpan) * benchH;
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
      ? point.metricValue >= benchMin && point.metricValue <= benchMax
      : true);
  const drawModelPointsInView = drawModelPoints.filter(modelInView);
  const drawBenchmarkPointsInView = drawBenchmarkPoints.filter(benchmarkInView);
  state.timelinePlot = {
    axisRight,
    benchMax,
    benchMin,
    eventBottom: splitCombined ? benchBottom : modelBottom,
    eventTop: modelTop,
    maxBenchY: benchMax,
    maxX,
    maxY: mode === "benchmarks" ? benchMax : maxY,
    minBenchY: benchMin,
    minX,
    minY: mode === "benchmarks" ? benchMin : minY,
    mode,
    panelGap,
    benchBottom,
    benchTop,
    modelBottom,
    modelTop,
    padLeft: pad.left,
    plotBottom: splitCombined ? benchBottom : modelBottom,
    plotTop: splitCombined ? modelTop : (mode === "benchmarks" ? benchTop : modelTop),
    rawMaxX,
    rawMaxY: mode === "benchmarks" ? rawBenchMax : rawModelMax,
    rawMaxBenchY: rawBenchMax,
    rawMinX,
    rawMinY: mode === "benchmarks" ? rawBenchMin : rawModelMin,
    rawMinBenchY: rawBenchMin,
  };

  ctx.strokeStyle = chartGrid;
  ctx.lineWidth = 1;
  ctx.fillStyle = chartMuted;
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  const drawYGrid = (minValue, span, scale, top, bottom, labelDigits) => {
    for (let i = 0; i <= 5; i += 1) {
      const value = minValue + (span * i) / 5;
      const y = scale(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(axisRight, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = chartMuted;
      ctx.fillText(mode === "models" ? compactAxisNumber(value, labelDigits) : fmt(value, labelDigits), pad.left - 10, y + 4);
    }
    ctx.strokeStyle = chartInk;
    ctx.beginPath();
    ctx.moveTo(pad.left, top);
    ctx.lineTo(pad.left, bottom);
    ctx.lineTo(axisRight, bottom);
    ctx.stroke();
    ctx.strokeStyle = chartGrid;
  };

  if (mode === "benchmarks" && hasBenchAxis) {
    drawYGrid(benchMin, benchSpan, benchMainYScale, benchTop, benchBottom, 2);
  } else {
    drawYGrid(minY, ySpan, yScale, modelTop, modelBottom, TIMELINE_SCORE_DIGITS);
    if (splitCombined) {
      drawYGrid(benchMin, benchSpan, benchMainYScale, benchTop, benchBottom, 2);
      ctx.strokeStyle = chartInk;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(pad.left, modelBottom);
      ctx.lineTo(pad.left, benchTop);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = chartGrid;
    }
  }

  ctx.textAlign = "center";
  ctx.strokeStyle = chartGridSoft;
  timelineDateTicks(minX, maxX).forEach((tick) => {
    const x = xScale(tick.value);
    if (x < pad.left || x > axisRight) return;
    const verticalSegments = splitCombined
      ? [[modelTop, benchBottom]]
      : [[mode === "benchmarks" ? benchTop : modelTop, mode === "benchmarks" ? benchBottom : modelBottom]];
    verticalSegments.forEach(([segmentTop, segmentBottom]) => {
      ctx.beginPath();
      ctx.moveTo(x, segmentTop);
      ctx.lineTo(x, segmentBottom);
      ctx.stroke();
    });
    ctx.fillStyle = chartMuted;
    ctx.fillText(tick.label, x, height - pad.bottom + 24);
  });

  if (splitCombined) {
    ctx.fillStyle = chartInk;
    ctx.font = "13px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("Models", pad.left + 8, modelTop - 14);
    ctx.fillStyle = chartBlue;
    ctx.fillText("Benchmarks", pad.left + 8, benchTop - 14);
  }

  drawTimelineLegend(ctx, width, pad, mode, metricLabel);

  let bestCapability = -Infinity;
  const sortedByDate = drawModelPointsInView.filter((point) => point.timelineActive).slice().sort((a, b) => a.dateMs - b.dateMs);
  sortedByDate.forEach((point) => {
    if (point.capability_sum > bestCapability) {
      point.isTopLayer = true;
      bestCapability = point.capability_sum;
    }
  });

  const frontierPoints = sortedByDate.filter((point) => point.isTopLayer);
  if (mode !== "benchmarks" && frontierPoints.length > 1) {
    ctx.save();
    ctx.strokeStyle = chartAccent;
    ctx.globalAlpha = state.selectedFamily === "All" ? 0.42 : 0.64;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    frontierPoints.forEach((point, index) => {
      const x = xScale(point.dateMs);
      const y = yScale(point.timelineDisplayScore) + (point.timelineRise || 0);
      if (index === 0 || shouldBreakFrontierConnection(frontierPoints[index - 1], point)) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  if (mode !== "benchmarks") {
    drawModelPointsInView.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = yScale(point.timelineDisplayScore) + (point.timelineRise || 0);
      const baseRadius = point.isTopLayer ? 4.8 : 3.5;
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
        ctx.fillStyle = chartMuted;
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
        : point.timelineColor || chartInactive;
      ctx.globalAlpha = (point.timelineActive ? 0.9 : point.timelineBaseAlpha ?? 0.2) * point.timelineAlpha;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.globalAlpha = 1;

      if (point.timelineActive && point.metricValue >= quantile(benchmarkPoints.map((item) => item.metricValue), 0.82)) {
        ctx.fillStyle = chartMuted;
        ctx.font = "10px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(compactTimelineLabel(point.model), x + 7, y - 6);
      }
    });
  }

  if (mode === "combined" && hasBenchAxis) {
    drawBenchmarkPointsInView.forEach((point) => {
      const x = xScale(point.dateMs);
      const y = benchMainYScale(point.metricValue);
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
        : point.timelineColor || chartInactive;
      const activeAlpha = 0.58 + strength * 0.34;
      ctx.globalAlpha = (point.timelineActive ? activeAlpha : point.timelineBaseAlpha ?? 0.2) * point.timelineAlpha;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  ctx.fillStyle = chartInk;
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Release date", pad.left + plotW / 2, isHeroMode ? height - 58 : height - 12);
  if (splitCombined) {
    ctx.save();
    ctx.translate(20, modelTop + modelH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(TIMELINE_AXIS_LABEL, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = chartBlue;
    ctx.translate(20, benchTop + benchH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Benchmark ${metricLabel}`, 0, 0);
    ctx.restore();
  } else if (mode === "benchmarks") {
    ctx.save();
    ctx.translate(20, benchTop + benchH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Benchmark ${metricLabel}`, 0, 0);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(20, modelTop + modelH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(TIMELINE_AXIS_LABEL, 0, 0);
    ctx.restore();
  }

  const hitPoints = animation?.animating ? [] : [
    ...(mode === "benchmarks" ? [] : drawModelPointsInView.filter((point) => point.timelineActive)),
    ...drawBenchmarkPointsInView,
  ];
  state.timelinePoints = hitPoints;
  const searchPoint = hitPoints.find((point) => timelineSearchKey(point) === state.timelineSearchSelection);
  if (searchPoint) {
    ctx.save();
    ctx.strokeStyle = chartAccent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(searchPoint.canvasX, searchPoint.canvasY, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  renderTimelineHitLayer(hitPoints);
}

function showTimelineTooltip(point, x, y) {
  els.timelineTooltip.hidden = false;
  const detail = point.pointType === "benchmark"
    ? `Benchmark · ${escapeHtml(point.release_date)} · ${benchmarkTimelineMetricLabel()} ${fmt(point.metricValue, 3)}`
    : `${escapeHtml(point.family)} · ${escapeHtml(point.release_date)} · ${TIMELINE_DISPLAY_LABEL} ${fmt(point.timelineDisplayScore, TIMELINE_SCORE_DIGITS)}${Number.isFinite(point.timelinePercentileScore) ? ` · ${TIMELINE_PERCENTILE_LABEL} ${fmt(point.timelinePercentileScore, 1)}` : ""}${Number.isFinite(point.rank) ? ` · rank ${point.rank}` : ""}`;
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
  const clampRange = (min, max, rawMin, rawMax, minimumFraction) => {
    const rawSpan = rawMax - rawMin || 1;
    const span = clamp(max - min, rawSpan * minimumFraction, rawSpan);
    let nextMin = min;
    let nextMax = nextMin + span;
    if (nextMin < rawMin) {
      nextMin = rawMin;
      nextMax = nextMin + span;
    }
    if (nextMax > rawMax) {
      nextMax = rawMax;
      nextMin = nextMax - span;
    }
    return { min: nextMin, max: nextMax };
  };

  const xRange = clampRange(zoom.minX, zoom.maxX, plot.rawMinX, plot.rawMaxX, 1 / 120);
  const yRange = clampRange(zoom.minY, zoom.maxY, plot.rawMinY, plot.rawMaxY, 1 / 80);
  const benchmarkRange = plot.mode === "combined"
    ? clampRange(
        zoom.minBenchY ?? plot.minBenchY,
        zoom.maxBenchY ?? plot.maxBenchY,
        plot.rawMinBenchY,
        plot.rawMaxBenchY,
        1 / 80
      )
    : { min: plot.rawMinBenchY, max: plot.rawMaxBenchY };

  const isFullX = Math.abs(xRange.min - plot.rawMinX) < 1 && Math.abs(xRange.max - plot.rawMaxX) < 1;
  const isFullY = Math.abs(yRange.min - plot.rawMinY) < 0.001 && Math.abs(yRange.max - plot.rawMaxY) < 0.001;
  const isFullBenchmarkY = plot.mode !== "combined" || (
    Math.abs(benchmarkRange.min - plot.rawMinBenchY) < 0.001 &&
    Math.abs(benchmarkRange.max - plot.rawMaxBenchY) < 0.001
  );
  return isFullX && isFullY && isFullBenchmarkY ? null : {
    minX: xRange.min,
    maxX: xRange.max,
    minY: yRange.min,
    maxY: yRange.max,
    minBenchY: benchmarkRange.min,
    maxBenchY: benchmarkRange.max,
  };
}

function timelineZoomSnapshot(plot = state.timelinePlot) {
  if (!plot) return null;
  return {
    minX: plot.minX,
    maxX: plot.maxX,
    minY: plot.minY,
    maxY: plot.maxY,
    minBenchY: plot.minBenchY,
    maxBenchY: plot.maxBenchY,
  };
}

function timelinePanelAtPoint(point, plot = state.timelinePlot) {
  if (!plot || plot.mode !== "combined") return "primary";
  if (point.y >= plot.modelTop && point.y <= plot.modelBottom) return "model";
  if (point.y >= plot.benchTop && point.y <= plot.benchBottom) return "benchmark";
  return "time";
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
  const xRatio = clamp((point.x - plot.padLeft) / plotW, 0, 1);
  const xSpan = plot.maxX - plot.minX || 1;
  const xValue = plot.minX + xRatio * xSpan;
  const scale = clamp(Math.exp(event.deltaY * 0.0012), 0.55, 1.8);
  const nextXSpan = xSpan * scale;
  const nextZoom = {
    minX: xValue - xRatio * nextXSpan,
    maxX: xValue + (1 - xRatio) * nextXSpan,
    minY: plot.minY,
    maxY: plot.maxY,
    minBenchY: plot.minBenchY,
    maxBenchY: plot.maxBenchY,
  };
  const panel = timelinePanelAtPoint(point, plot);
  if (panel === "benchmark") {
    const panelH = plot.benchBottom - plot.benchTop || 1;
    const yRatio = clamp((point.y - plot.benchTop) / panelH, 0, 1);
    const ySpan = plot.maxBenchY - plot.minBenchY || 1;
    const yValue = plot.maxBenchY - yRatio * ySpan;
    const nextYSpan = ySpan * scale;
    nextZoom.minBenchY = yValue - (1 - yRatio) * nextYSpan;
    nextZoom.maxBenchY = yValue + yRatio * nextYSpan;
  } else if (panel === "model" || panel === "primary") {
    const panelTop = panel === "model" ? plot.modelTop : plot.plotTop;
    const panelBottom = panel === "model" ? plot.modelBottom : plot.plotBottom;
    const panelH = panelBottom - panelTop || 1;
    const yRatio = clamp((point.y - panelTop) / panelH, 0, 1);
    const ySpan = plot.maxY - plot.minY || 1;
    const yValue = plot.maxY - yRatio * ySpan;
    const nextYSpan = ySpan * scale;
    nextZoom.minY = yValue - (1 - yRatio) * nextYSpan;
    nextZoom.maxY = yValue + yRatio * nextYSpan;
  }
  state.timelineZoom = clampTimelineZoom(nextZoom, plot);
  renderTimeline();
}

function handleTimelineMouseDown(event) {
  if (event.button !== 0 || state.timelineAnimation || !state.timelineZoom) return;
  const point = timelineEventPoint(event);
  if (!pointInsideTimelinePlot(point)) return;
  state.timelineDrag = {
    active: true,
    start: point,
    panel: timelinePanelAtPoint(point, state.timelinePlot),
    zoomStart: timelineZoomSnapshot(state.timelinePlot),
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
    const xSpan = drag.zoomStart.maxX - drag.zoomStart.minX || 1;
    const dx = x - drag.start.x;
    const dy = y - drag.start.y;
    const nextZoom = {
      minX: drag.zoomStart.minX - (dx / plotW) * xSpan,
      maxX: drag.zoomStart.maxX - (dx / plotW) * xSpan,
      minY: drag.zoomStart.minY,
      maxY: drag.zoomStart.maxY,
      minBenchY: drag.zoomStart.minBenchY,
      maxBenchY: drag.zoomStart.maxBenchY,
    };
    if (drag.panel === "benchmark") {
      const panelH = plot.benchBottom - plot.benchTop || 1;
      const ySpan = drag.zoomStart.maxBenchY - drag.zoomStart.minBenchY || 1;
      nextZoom.minBenchY += (dy / panelH) * ySpan;
      nextZoom.maxBenchY += (dy / panelH) * ySpan;
    } else if (drag.panel === "model" || drag.panel === "primary") {
      const panelH = drag.panel === "model"
        ? plot.modelBottom - plot.modelTop || 1
        : plot.plotBottom - plot.plotTop || 1;
      const ySpan = drag.zoomStart.maxY - drag.zoomStart.minY || 1;
      nextZoom.minY += (dy / panelH) * ySpan;
      nextZoom.maxY += (dy / panelH) * ySpan;
    }
    state.timelineZoom = clampTimelineZoom(nextZoom, plot);
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
  return `./assets/fit_${runTag}.png?v=20260521-remote`;
}

function renderFitImage() {
  const run = activeRun();
  if (["local_finetune", "v7"].includes(run.metadata.source_name)) {
    els.fitImage.hidden = true;
    els.fitImage.removeAttribute("src");
    els.fitImage.alt = "Fit visualization is unavailable for the current data freeze";
    els.fitImageSource.textContent = "The current freeze contains parameters and diagnostics, but no model-fit figure.";
    return;
  }
  const runTag = run.metadata.run_tag?.startsWith("extend") ? run.metadata.run_tag : FIT_IMAGE_FALLBACK_RUN_TAG;
  els.fitImage.hidden = false;
  els.fitImage.src = fitImagePath(runTag);
  els.fitImage.alt = `Fit visualization: ${runTag}`;
  els.fitImageSource.textContent = `Source: outputs/model_fit/train_${runTag}.pdf`;
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
  state.heroActive = false;
  state.dashboardRendered = true;
  hydrateStats();
  renderBridgeReliability();
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
  els.timelineSearchToggle.addEventListener("click", () => setTimelineSearchOpen(els.timelineSearchPanel.hidden));
  els.timelineSearchInput.addEventListener("input", () => {
    if (!els.timelineSearchInput.value.trim() && state.timelineSearchSelection) {
      state.timelineSearchSelection = null;
      hideTimelineTooltip();
      renderTimeline();
    }
    renderTimelineSearchResults();
  });
  els.timelineSearchClear.addEventListener("click", () => {
    els.timelineSearchInput.value = "";
    state.timelineSearchSelection = null;
    hideTimelineTooltip();
    renderTimeline();
    renderTimelineSearchResults();
    els.timelineSearchInput.focus();
  });
  els.timelineSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = timelineSearchMatches()[0];
      if (first) locateTimelineSearchPoint(first);
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      els.timelineSearchResults.querySelector("button")?.focus();
      event.preventDefault();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.timelineSearchPanel.hidden) {
      setTimelineSearchOpen(false);
      els.timelineSearchToggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".timeline-search")) setTimelineSearchOpen(false);
  });
  els.timelineViewMode.addEventListener("input", () => {
    if (state.timelineAnimation) cancelAnimationFrame(state.timelineAnimation);
    state.timelineAnimation = null;
    state.timelineIntroPlayed = true;
    state.timelineViewMode = els.timelineViewMode.value;
    state.timelineSearchSelection = null;
    renderTimelineSearchResults();
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
  syncDocumentThemeColor();
  const dataUrl = new URL("./data/dashboard_data_v7.json", window.location.href);
  dataUrl.searchParams.set("v", "20260909-mean");
  dataUrl.searchParams.set("t", String(Date.now()));
  if (window.location.protocol === "file:") {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./data/dashboard_data_v7.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load the local v7 data bundle"));
      document.head.appendChild(script);
    });
    state.data = window.META_EVAL_DATA;
  } else {
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load ${dataUrl.pathname}: ${response.status}`);
    state.data = await response.json();
  }
  populateControls();
  bindEvents();
  els.tagCards.addEventListener("click", (event) => {
    if (event.target.closest(".tag-examples-retry")) loadTagExamples();
  });
  renderRunDependentViews();
  loadTagExamples();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="shell"><section class="panel"><h1>Dashboard failed to load</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
