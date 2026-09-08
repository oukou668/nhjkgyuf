// Data and pure-renderer regression checks; not a browser/layout test.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/dashboard_data_v7.json')));
const html = fs.readFileSync(path.join(__dirname, 'scores.html'), 'utf8');
const matrix = JSON.parse(html.match(/<script id="sourceData" type="application\/json">([\s\S]*?)<\/script>/)[1]).v7;
assert.equal(data.models.length, 288);
assert.equal(data.benchmarks.length, 106);
assert.equal(data.ranking_metadata.observed_cell_count, 5527);
for (const [i,m] of data.models.entries()) {
  const mean = m.estimated_capability.reduce((a,b)=>a+b,0)/m.estimated_capability.length;
  assert.equal(m.capability_mean, mean);
  if(i) assert(data.models[i-1].capability_mean >= mean);
  assert.equal(matrix.models[i].name,m.model);
  assert.equal(matrix.models[i].points,mean);
  assert.equal(matrix.models[i].rank,m.rank);
  assert.equal(data.timeline[i].capability_mean,mean);
}
assert(data.models.at(-1).capability_mean < 0);
const bundle = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'data/dashboard_data_v7.js'),'utf8'),{window:bundle});
assert.equal(JSON.stringify(bundle.META_EVAL_DATA),JSON.stringify(data));
const context = vm.createContext({document:{querySelector:()=>({classList:{add(){},remove(){}}}),querySelectorAll:()=>[]},data,assert});
const source = fs.readFileSync(path.join(__dirname,'app.js'),'utf8').split('\ninit().catch(')[0];
vm.runInContext(source,context);
vm.runInContext(`
  state.data=data;
  const points=timelineData();
  assert(points.length>0);
  for(const p of points) assert.equal(p.capability_sum,data.models.find(m=>m.model===p.model).capability_mean);
  const scored=attachTimelineDisplayScores(points);
  assert.equal(scored.find(p=>p.rank===1).timelinePercentileScore,100);
  assert.equal(rankMapForSort([{model:'a',timeline_rank:1},{model:'b',timeline_rank:1}], 'timeline_rank','estimated_capability','model').get('b'),1);
  els.modelSearch.value='';els.modelSort.value='timeline_rank';els.modelLimit.value=40;
  renderModels();
  assert(els.modelTable.innerHTML.includes('1.833'));
  assert(els.modelTable.innerHTML.includes(data.models[0].model));
`,context);
console.log('PASS: mean scores, ranks, matrix alignment, local bundle, timeline mapping, ties and model table.');
