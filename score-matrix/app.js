const STORAGE_KEY='meta-eval-v7-edits-e3efa4e3d11d';
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = v => v == null ? '—' : Number((v * 100).toFixed(4)).toString();
let DATA, edits = {}, selected = null, preview = '', dirty = false, saving = false;
const state = {rows: [], cols: [], sort: -1, ascending: false, scope: 'v7'};
const key = (i, j, scope = state.scope) => `${scope}:${i}:${j}`;
const ds = () => DATA[state.scope];
const actual = (i, j) => edits[key(i,j)] ? edits[key(i,j)].value : ds().actual[i][j];
function shown(i,j) {
  const a = actual(i,j), p = ds().predicted?.[i]?.[j] ?? null, mode = $('mode').value;
  return {value: mode === 'predicted' ? p : mode === 'filled' ? a ?? p : a,
    prediction: (mode === 'predicted' || mode === 'filled' && a == null) && p != null};
}
function notify(message, error = false) { $('notice').textContent = message; $('notice').className = error ? 'error' : ''; }
function lineage() { return {name:'v7 K=5 · predictions.csv',path:DATA.sources.find(s=>s.endsWith('/predictions.csv'))}; }
function render() {
  const d = ds(), mq = $('modelSearch').value.trim().toLowerCase(), bq = $('benchSearch').value.trim().toLowerCase();
  const cols = d.benchmarks.map((_,i) => i).filter(j => d.benchmarks[j].name.toLowerCase().includes(bq));
  const missing = i => cols.reduce((n,j) => n + (actual(i,j) == null), 0);
  let rows = d.models.map((_,i) => i).filter(i => d.models[i].name.toLowerCase().includes(mq) && (!$('family').value || d.models[i].family === $('family').value));
  if ($('onlyMissing').checked) rows = rows.filter(i => missing(i) > 0);
  if (state.sort >= 0) rows.sort((a,b) => {
    const av=shown(a,state.sort).value,bv=shown(b,state.sort).value;
    return av==null?(bv==null?a-b:1):bv==null?-1:(state.ascending?av-bv:bv-av)||a-b;
  });
  else if ($('order').value === 'missing') rows.sort((a,b) => missing(b)-missing(a)||a-b);
  state.rows=rows; state.cols=cols;
  let observed=0, predicted=0;
  for (const i of rows) for (const j of cols) {if(actual(i,j)!=null) observed++; if(shown(i,j).prediction) predicted++;}
  const total=rows.length*cols.length, absent=total-observed;
  $('stats').innerHTML = [[rows.length,'当前模型'],[cols.length,'Benchmarks'],[absent.toLocaleString(),'缺失实测','alert'],[total?(observed/total*100).toFixed(1)+'%':'—','实测覆盖率']].map(([v,l,c])=>`<div class="stat ${c||''}"><strong>${v}</strong><span>${l}</span></div>`).join('');
  const head = `<thead><tr><th class="model-head"><strong>模型 / 综合排名</strong></th>${cols.map(j=>`<th scope="col" aria-sort="${state.sort===j?(state.ascending?'ascending':'descending'):'none'}"><button data-sort="${j}" title="${esc(d.benchmarks[j].name)}">${esc(d.benchmarks[j].name)}${state.sort===j?(state.ascending?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead>`;
  const body = rows.map(i=>`<tr><th scope="row"><div class="row-title"><span class="rank">${d.models[i].rank?'#'+d.models[i].rank:'—'}</span><span class="model-name" title="${esc(d.models[i].name)}">${esc(d.models[i].name)}</span><span class="coverage">${cols.length-missing(i)}/${cols.length}</span></div></th>${cols.map(j=>{
    const s=shown(i,j), label=`${d.models[i].name} / ${d.benchmarks[j].name}：${s.prediction?'预测 ':''}${s.value==null?'缺失':fmt(s.value)}${actual(i,j)==null?'，缺失实测':''}`;
    let style='';
    if ($('color').value==='score' && s.value!=null && !s.prediction) { const t=Math.max(0,Math.min(1,s.value)); style=`background-color:rgb(${[220,238,230].map((x,k)=>Math.round(x+([39,112,91][k]-x)*t)).join(',')})`; }
    return `<td role="button" tabindex="${selected?selected.i===i&&selected.j===j?'0':'-1':i===rows[0]&&j===cols[0]?'0':'-1'}" aria-label="${esc(label)}" class="cell ${s.prediction?'prediction':s.value==null?'missing':'observed'} ${edits[key(i,j)]?'edited':''} ${selected?.i===i&&selected?.j===j?'selected':''}" style="${style}" data-row="${i}" data-col="${j}"></td>`;
  }).join('')}</tr>`).join('');
  $('matrix').innerHTML=head+`<tbody>${rows.length&&cols.length?body:'<tr><td class="empty">没有匹配结果，请调整筛选条件。</td></tr>'}</tbody>`;
  $('status').textContent=`${rows.length} 个模型 × ${cols.length} 项测评 · 实测 ${observed.toLocaleString()} · 缺失 ${absent.toLocaleString()}${predicted?' · 当前展示预测 '+predicted.toLocaleString():''} · ${Object.keys(edits).filter(k=>k.startsWith(state.scope+':')).length} 格本地编辑`;
  fitView();
}
function inspect(i,j,pinned=false) {
  if (!pinned && selected) return;
  if(pinned||window.innerWidth>740)$('detail').classList.add('has-detail');
  const k=key(i,j); if (!pinned && preview===k) return; preview=k;
  const d=ds(), a=actual(i,j), original=d.actual[i][j], p=d.predicted?.[i]?.[j]??null, edit=edits[k], source=lineage(state.scope);
  $('inspector').innerHTML=`<span class="pill">${pinned?'已锁定 · 可编辑':'悬停预览 · 点击编辑'}</span><h2>${esc(d.models[i].name)}</h2><button type="button" class="unlock" id="closeDetail">关闭</button><div class="bench-name">${esc(d.benchmarks[j].name)}</div><div class="scores"><div><span>${edit?'本地实测':'实测分数'}</span><strong>${fmt(a)}</strong></div><div><span>MIRT 预测</span><strong>${fmt(p)}</strong></div></div><div class="source-box"><b>${edit?'本地修改来源':'快照来源'}</b>${edit?esc(edit.source||'未填写来源'):a==null?'该格没有实测记录。':esc(source.name)}${edit?.url?`<br><a href="${esc(edit.url)}" target="_blank" rel="noopener noreferrer">打开来源链接 ↗</a>`:''}${edit?.note?`<br>备注：${esc(edit.note)}`:''}<details class="source-path"><summary>查看原始文件与记录</summary>原始快照：${esc(source.path||source.name)}<br>原始分数：${fmt(original)}<br>网页未提供逐格原始报告链接。${edit?'<br>保存于 '+esc(new Date(edit.updated_at).toLocaleString()):''}</details></div>${pinned?`<form id="editForm"><label>实测分数 · 0–100（留空表示缺失）<input id="editValue" type="number" min="0" max="100" step="any" value="${a==null?'':Number((a*100).toPrecision(15))}"></label><label>来源名称<input id="editSource" maxlength="4000" value="${esc(edit?.source||'')}" placeholder="论文、报告或评测平台"></label><label>来源链接<input id="editUrl" type="url" maxlength="4000" value="${esc(edit?.url||'')}" placeholder="https://…"></label><label>备注<textarea id="editNote" maxlength="4000" placeholder="评测设置、版本或修改原因">${esc(edit?.note||'')}</textarea></label><div class="form-actions"><button class="primary" type="submit">保存到此浏览器</button><button id="restore" type="button" ${edit?'':'disabled'}>恢复原值</button></div><button id="discard" type="button" class="unlock">放弃未保存修改 / 解除锁定</button></form>`:''}`;
  $('closeDetail').addEventListener('click',unlock);
  if(pinned) {
    $('editForm').addEventListener('input',()=>{dirty=true;});
    $('editForm').addEventListener('submit',event=>{event.preventDefault();save(false);});
    $('restore').addEventListener('click',()=>save(true));
    $('discard').addEventListener('click',()=>{if(saving)return;dirty=false;unlock();});
  }
}
function canLeave(){if(saving||dirty){notify(saving?'正在保存，请稍候。':'当前有未保存修改，请先保存或点击「放弃未保存修改」。',true);return false;}return true;}
function selectCell(i,j) {
  if(selected?.i===i&&selected?.j===j)return;
  if(!canLeave())return;
  selected={i,j};dirty=false;
  document.querySelectorAll('.cell.selected').forEach(el=>{el.classList.remove('selected');el.tabIndex=-1;});
  const cell=document.querySelector(`[data-row="${i}"][data-col="${j}"]`);if(cell){cell.classList.add('selected');cell.tabIndex=0;}
  inspect(i,j,true);drawOverview();
}
function unlock(){if(!canLeave())return;selected=null;preview='';$('detail').classList.remove('has-detail');document.querySelectorAll('.cell.selected').forEach(el=>el.classList.remove('selected'));$('inspector').innerHTML='';drawOverview();}
async function save(reset){
  if(saving||!selected)return;
  const {i,j}=selected, scope=state.scope;
  const text=$('editValue').value.trim(), value=text===''?null:Number(text)/100;
  if(!reset&&value!=null&&(!Number.isFinite(value)||value<0||value>1))return notify('请输入 0–100 之间的分数。',true);
  const url=$('editUrl').value.trim();
  if(!reset&&url&&!/^https?:\/\//i.test(url))return notify('来源链接须以 http:// 或 https:// 开头。',true);
  const payload={dataset:scope,row:i,col:j,value,source:$('editSource').value.trim(),url,note:$('editNote').value.trim(),reset,previous:edits[key(i,j)]??null};
  saving=true;document.querySelectorAll('#editForm button').forEach(b=>b.disabled=true);
  try {
    const result=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'), k=key(i,j);
    if(JSON.stringify(result[k]??null)!==JSON.stringify(payload.previous))throw new Error('该格已在另一个页面修改，请刷新后重试。');
    if(reset)delete result[k];
    else result[k]={value,source:payload.source,url,note:payload.note,model:ds().models[i].name,benchmark:ds().benchmarks[j].name,original:ds().actual[i][j],updated_at:new Date().toISOString()};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(result));
    edits=result;dirty=false;render();inspect(i,j,true);notify(reset?'已恢复原始值。':'已保存在当前浏览器；不会同步给其他人，可导出 CSV 备份。');
  } catch(error){notify(error.message,true);document.querySelectorAll('#editForm button').forEach(b=>b.disabled=false);}
  finally{saving=false;}
}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCSV(){
  const rows=[['dataset','model','benchmark','performance_0_1','display_score_0_100','score_type','actual_missing','original_actual','source','source_url','note','edited_at']];
  for(const i of state.rows)for(const j of state.cols){const s=shown(i,j),e=edits[key(i,j)],origin=lineage(state.scope);rows.push([state.scope,ds().models[i].name,ds().benchmarks[j].name,s.value,s.value==null?null:s.value*100,s.prediction?'predicted':s.value==null?'missing':e?'edited':'observed',actual(i,j)==null,ds().actual[i][j],s.prediction?'MIRT prediction (snapshot)':e?(e.source||'本地编辑（未填写来源）'):origin.path,s.prediction?'':e?.url||'',s.prediction?'':e?.note||'',e?.updated_at||'']);}
  const quote=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  download('\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),`scores-${state.scope}-${$('mode').value}.csv`,'text/csv;charset=utf-8');
}
async function init(){
  try {
    const d=await fetch('score-matrix/data.json');
    if(!d.ok)throw new Error('数据加载失败，请刷新重试。');
    DATA=await d.json();
    try {edits=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');} catch {edits={};notify('浏览器存储不可用，编辑可能无法保存。',true);} 
    const families=[...new Set(DATA.v7.models.map(m=>m.family))].sort();
    $('family').innerHTML='<option value="">全部家族</option>'+families.map(f=>`<option>${esc(f)}</option>`).join('');
    for(const id of ['family','mode','color','onlyMissing'])$(id).addEventListener('change',render);
    $('order').addEventListener('change',()=>{state.sort=-1;render();});
    for(const id of ['modelSearch','benchSearch']){let timer;$(id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(render,120);});}
    $('size').addEventListener('change',()=>{if($('size').value!=='fit')document.documentElement.style.setProperty('--cell',$('size').value+'px');fitView();});
    $('matrix').addEventListener('mouseover',e=>{const c=e.target.closest('[data-row]');if(c)inspect(+c.dataset.row,+c.dataset.col);});
    $('matrix').addEventListener('focusin',e=>{const c=e.target.closest('[data-row]');if(c)inspect(+c.dataset.row,+c.dataset.col);});
    $('matrix').addEventListener('click',e=>{const sort=e.target.closest('[data-sort]');if(sort){const j=+sort.dataset.sort;state.ascending=state.sort===j?!state.ascending:false;state.sort=j;render();return;}const c=e.target.closest('[data-row]');if(c)selectCell(+c.dataset.row,+c.dataset.col);});
    $('matrix').addEventListener('keydown',e=>{const c=e.target.closest('[data-row]');if(!c)return;let i=+c.dataset.row,j=+c.dataset.col;if(e.key==='Enter'||e.key===' '){e.preventDefault();selectCell(i,j);return;}const delta={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(!delta)return;e.preventDefault();const ri=state.rows.indexOf(i)+delta[0],cj=state.cols.indexOf(j)+delta[1];if(ri<0||cj<0||ri>=state.rows.length||cj>=state.cols.length||!canLeave())return;i=state.rows[ri];j=state.cols[cj];selectCell(i,j);document.querySelector(`[data-row="${i}"][data-col="${j}"]`)?.focus();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')unlock();});
    window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
    $('reset').addEventListener('click',()=>{if(!canLeave())return;unlock();for(const id of ['modelSearch','benchSearch','family'])$(id).value='';$('onlyMissing').checked=false;$('mode').value='actual';$('color').value='coverage';$('order').value='rank';$('size').value='fit';document.documentElement.style.setProperty('--cell','16px');state.sort=-1;render();$('tableWrap').scrollTo(0,0);});
    $('export').addEventListener('click',exportCSV);
    new ResizeObserver(()=>drawOverview()).observe($('tableWrap'));
    setupOverview();render();
  } catch(error){notify(error.message,true);$('inspector').textContent='加载失败，请刷新重试。';}
}
init();

let geometry=null;
function fitView(){
  $('tableWrap').classList.toggle('fit',$('size').value==='fit');
  drawOverview();
}
function drawOverview(){
  if(!DATA||$('size').value!=='fit')return;
  const canvas=$('overview'),w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h)return;
  const ratio=window.devicePixelRatio||1;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  const left=Math.min(118,w*.21),top=70,right=6,bottom=8;
  const width=w-left-right,height=h-top-bottom;
  const rows=state.rows,cols=state.cols;if(!rows.length||!cols.length){geometry=null;return;}
  geometry={left,top,width,height,cw:width/cols.length,rh:height/rows.length};
  const {cw,rh}=geometry;
  rows.forEach((i,r)=>cols.forEach((j,c)=>{
    const s=shown(i,j);ctx.fillStyle=s.prediction?'#a6a0cf':s.value==null?'#f2d6cd':'#438677';
    if($('color').value==='score'&&s.value!=null&&!s.prediction){const t=Math.max(0,Math.min(1,s.value));ctx.fillStyle=`rgb(${[220,238,230].map((x,k)=>Math.round(x+([39,112,91][k]-x)*t)).join(',')})`;}
    const x=left+c*cw,y=top+r*rh;ctx.fillRect(x,y,cw+.2,rh+.2);
    if(edits[key(i,j)]){ctx.fillStyle='#e4a52f';ctx.fillRect(x,y,Math.max(1,cw*.3),rh);}
  }));
  ctx.strokeStyle='#ffffff45';ctx.lineWidth=.5;
  for(let c=0;c<=cols.length;c++){ctx.beginPath();ctx.moveTo(left+c*cw,top);ctx.lineTo(left+c*cw,top+height);ctx.stroke();}
  ctx.fillStyle='#547167';ctx.font='9px sans-serif';
  const stride=Math.max(1,Math.ceil(13/rh));
  rows.forEach((i,r)=>{if(r%stride!==0&&r!==rows.length-1)return;const text=`#${ds().models[i].rank||i+1} ${ds().models[i].name}`;ctx.save();ctx.beginPath();ctx.rect(0,top-6,left-4,height+14);ctx.clip();ctx.fillText(text,4,Math.min(h-3,top+r*rh+5));ctx.restore();});
  const cstride=Math.max(1,Math.ceil(11/cw));cols.forEach((j,c)=>{if(c%cstride)return;ctx.save();ctx.translate(left+(c+.6)*cw,top-4);ctx.rotate(-Math.PI/2);ctx.fillText(ds().benchmarks[j].name.slice(0,22),0,0);ctx.restore();});
  if(selected){const r=rows.indexOf(selected.i),c=cols.indexOf(selected.j);if(r>=0&&c>=0){ctx.strokeStyle='#122c25';ctx.lineWidth=1;ctx.strokeRect(left+c*cw,top+r*rh,Math.max(cw,2),Math.max(rh,2));}}
  canvas.setAttribute('aria-label',`v7 全景矩阵，${rows.length} 个模型 × ${cols.length} 项测评，全部显示。方向键选择，回车编辑。`);
}
function setupOverview(){
  const canvas=$('overview');
  function hit(e){if(!geometry)return null;const box=canvas.getBoundingClientRect(),g=geometry,c=Math.floor((e.clientX-box.left-g.left)/g.cw),r=Math.floor((e.clientY-box.top-g.top)/g.rh);return r>=0&&r<state.rows.length&&c>=0&&c<state.cols.length?{i:state.rows[r],j:state.cols[c]}:null;}
  canvas.addEventListener('mousemove',e=>{const cell=hit(e);if(cell)inspect(cell.i,cell.j);});
  canvas.addEventListener('click',e=>{const cell=hit(e);if(cell)selectCell(cell.i,cell.j);});
  canvas.addEventListener('keydown',e=>{if(!state.rows.length||!state.cols.length)return;const delta={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],Enter:[0,0]}[e.key];if(!delta)return;e.preventDefault();if(!canLeave())return;const r=Math.max(0,Math.min(state.rows.length-1,(selected?state.rows.indexOf(selected.i):0)+delta[0])),c=Math.max(0,Math.min(state.cols.length-1,(selected?state.cols.indexOf(selected.j):0)+delta[1]));selectCell(state.rows[r],state.cols[c]);});
}
