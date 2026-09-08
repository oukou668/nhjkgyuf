const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function loadItem() {
  const params = new URLSearchParams(location.search);
  const response = await fetch("./data/tag_item_examples.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Item data could not be loaded. Please refresh to retry.");
  const data = await response.json();
  const item = data.items[params.get("id")];
  if (!item) throw new Error("This item was not found in the current snapshot. Return to the dictionary to choose an available item.");
  const tag = params.get("tag");
  const annotation = item.annotations[tag];
  if (!annotation) throw new Error("This item has no annotation for the requested tag.");
  document.title = `${tag} · ${item.dataset} · Item`;
  document.querySelector("#backToConstruct").href = `./index.html#construct-${encodeURIComponent(tag)}`;
  const provenance = item.provenance;
  document.querySelector("#itemContent").innerHTML = `
    <header class="item-header">
      <p class="item-eyebrow">${escape(tag)} · Item annotation</p>
      <h1>${escape(item.dataset)}</h1>
      <p class="item-source-id">${escape(item.source_item_id)}</p>
      <div class="item-score"><strong>${escape(annotation.score)} / 5</strong><span>Tag demand${annotation.confidence == null ? "" : ` · Confidence ${(annotation.confidence * 100).toFixed(0)}%`}</span></div>
      <p class="item-rationale" dir="auto">${escape(annotation.rationale || "No rationale recorded.")}</p>
    </header>
    <section class="item-question"><h2>Full question</h2><pre dir="auto">${escape(item.question)}</pre></section>
    <section class="item-provenance"><h2>Source & annotation</h2>
      <dl>
        <div><dt>Config / split</dt><dd>${escape(provenance.config || "—")} / ${escape(provenance.split || "—")}</dd></div>
        <div><dt>Source row</dt><dd>${escape(provenance.row_index ?? "—")}</dd></div>
        <div><dt>Annotation record</dt><dd>${escape(annotation.source_file)} · line ${annotation.source_line}</dd></div>
        <div><dt>Annotated at</dt><dd>${escape(annotation.annotated_at || "Unknown")}</dd></div>
      </dl>
      <p>Scores describe the ability required by the question, not model performance. Rankings cover ${data.metadata.item_count.toLocaleString()} local items across ${data.metadata.dataset_count} datasets.</p>
      <details><summary>Original item fields (including reference answers, where available)</summary><pre dir="auto">${escape(JSON.stringify(item.data_content, null, 2))}</pre></details>
      <details><summary>All available current-tag annotations</summary><div class="item-annotations">${Object.entries(item.annotations).sort((a, b) => b[1].score - a[1].score).map(([name, value]) => `<article><h3>${escape(name)} <span>${value.score} / 5</span></h3><p dir="auto">${escape(value.rationale)}</p></article>`).join("")}</div></details>
    </section>`;
}

loadItem().catch((error) => {
  document.querySelector("#itemContent").innerHTML = `<h1>Item unavailable</h1><p>${escape(error.message)}</p>`;
});
