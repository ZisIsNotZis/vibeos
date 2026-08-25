(function(){
  'use strict';
  const svg = document.getElementById('diagram');
  const world = document.getElementById('world');
  const nodesLayer = document.getElementById('nodes');
  const edgesLayer = document.getElementById('edges');
  const wrap = document.getElementById('canvasWrap');
  const $ = (id) => document.getElementById(id);
  const shapes = {
    process:{label:'Process',w:158,h:72,fill:'#E8F1FF',stroke:'#4B73B8'},
    decision:{label:'Decision',w:148,h:92,fill:'#FFF3D9',stroke:'#B6812F'},
    data:{label:'Data',w:158,h:72,fill:'#E7F7EF',stroke:'#3B8D68'},
    terminator:{label:'Start / end',w:158,h:62,fill:'#F4E9FF',stroke:'#8254A8'},
    note:{label:'Note',w:160,h:82,fill:'#FFF8C9',stroke:'#A78A22'}
  };
  const starter = {nodes:[
    {id:'start',type:'terminator',x:110,y:160,label:'Start',w:158,h:62,fill:'#F4E9FF'},
    {id:'capture',type:'process',x:350,y:155,label:'Capture request',w:168,h:72,fill:'#E8F1FF'},
    {id:'decide',type:'decision',x:610,y:145,label:'Clear enough?',w:148,h:92,fill:'#FFF3D9'},
    {id:'finish',type:'terminator',x:870,y:160,label:'Ship result',w:158,h:62,fill:'#F4E9FF'}
  ],edges:[
    {id:'e1',from:'start',to:'capture'}, {id:'e2',from:'capture',to:'decide'}, {id:'e3',from:'decide',to:'finish',label:'yes'}
  ],view:{x:20,y:40,zoom:.86}};
  let state = structuredClone(starter), revision = 0, selectedId = null, drag = null, pan = null, link = null, history = [], future = [], saveTimer = null, toastTimer = null;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const notify = (message, level='info') => { const t=$('toast'); t.textContent=message; t.className='toast show'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className='toast',2200); if(window.vibeOS?.notify) window.vibeOS.notify(message,{level,timeoutMs:2200}).catch(()=>{}); };
  function snapshot(){return {nodes:clone(state.nodes),edges:clone(state.edges),view:clone(state.view)};}
  function commit(next, message){history.push(snapshot()); if(history.length>45)history.shift(); future=[]; state=next; selectedId=selectedId && state.nodes.some(n=>n.id===selectedId)?selectedId:null; render(); scheduleSave(message);}
  function scheduleSave(message='Editing diagram'){ $('statusText').textContent=message||'Saving changes…'; clearTimeout(saveTimer); saveTimer=setTimeout(saveState,500); }
  async function saveState(){ try{ if(window.vibeOS?.state){const result=await window.vibeOS.state.write({nodes:state.nodes,edges:state.edges,view:state.view},revision); revision=result?.revision??revision+1;} else if(window.localStorage) localStorage.setItem('drawio-flowboard',JSON.stringify(state)); $('statusText').textContent='All changes saved'; }catch(e){$('statusText').textContent='Could not save'; notify('Could not save this board','error');} }
  async function boot(){
    try{ if(window.vibeOS?.state){const saved=await window.vibeOS.state.read(); if(saved?.state?.nodes) {state={...clone(starter),...saved.state,view:{...starter.view,...(saved.state.view||{})}}; revision=saved.revision||0;}} else if(window.localStorage){const raw=localStorage.getItem('drawio-flowboard'); if(raw) state={...state,...JSON.parse(raw)};} }catch(e){}
    render();
    if(window.vibeOS?.state) window.vibeOS.state.subscribe((incoming)=>{if(incoming?.revision>revision&&incoming.state?.nodes){state={...state,...incoming.state};revision=incoming.revision;render();}});
    try{window.vibeOS?.commands?.setContext(()=>({selectedShape:selectedId?state.nodes.find(n=>n.id===selectedId)?.label:null,objects:state.nodes.length}));}catch(e){}
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function shapeMarkup(n){
    const s=shapes[n.type]||shapes.process, w=n.w||s.w,h=n.h||s.h, fill=n.fill||s.fill, stroke=s.stroke;
    let body='';
    if(n.type==='decision') body=`<polygon class="node-body" points="${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    else if(n.type==='data') body=`<polygon class="node-body" points="14,0 ${w},0 ${w-14},${h} 0,${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    else if(n.type==='terminator') body=`<rect class="node-body" x="0" y="0" width="${w}" height="${h}" rx="${h/2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    else if(n.type==='note') body=`<path class="node-body" d="M0 0h${w-22}l22 22v${h-22}H0Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/><path d="M${w-22} 0v22h22" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
    else body=`<rect class="node-body" x="0" y="0" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    const lines=String(n.label||'').split('\n'), lineH=18, start=(h/2)-((lines.length-1)*lineH/2)+5;
    const label=lines.map((l,i)=>`<text class="node-label" x="${w/2}" y="${start+i*lineH}" text-anchor="middle">${esc(l)}</text>`).join('');
    return `<g class="node-shape${selectedId===n.id?' selected':''}" data-id="${n.id}" transform="translate(${n.x} ${n.y})">${body}${label}<circle class="port port-top" data-port="top" cx="${w/2}" cy="0" r="5"/><circle class="port port-right" data-port="right" cx="${w}" cy="${h/2}" r="5"/><circle class="port port-bottom" data-port="bottom" cx="${w/2}" cy="${h}" r="5"/><circle class="port port-left" data-port="left" cx="0" cy="${h/2}" r="5"/></g>`;
  }
  function pointFor(n, side){const w=n.w||shapes[n.type].w,h=n.h||shapes[n.type].h; return {x:n.x+(side==='left'?0:side==='right'?w:w/2),y:n.y+(side==='top'?0:side==='bottom'?h:h/2)};}
  function edgePath(a,b){const bend=Math.max(35,Math.min(120,Math.abs(b.x-a.x)*.45)),dir=b.x>=a.x?1:-1; return `M ${a.x} ${a.y} C ${a.x+dir*bend} ${a.y}, ${b.x-dir*bend} ${b.y}, ${b.x} ${b.y}`;}
  function render(){
    world.setAttribute('transform',`translate(${state.view.x} ${state.view.y}) scale(${state.view.zoom})`); $('zoomLabel').textContent=Math.round(state.view.zoom*100)+'%';
    edgesLayer.innerHTML=state.edges.map(e=>{const a=state.nodes.find(n=>n.id===e.from),b=state.nodes.find(n=>n.id===e.to);if(!a||!b)return '';const ap=pointFor(a,'right'),bp=pointFor(b,'left'),mid=(ap.x+bp.x)/2;return `<g class="edge" data-id="${e.id}"><path class="edge-line" d="${edgePath(ap,bp)}"/><text class="edge-label" x="${mid}" y="${(ap.y+bp.y)/2-8}" text-anchor="middle">${esc(e.label||'')}</text></g>`;}).join('');
    nodesLayer.innerHTML=state.nodes.map(shapeMarkup).join(''); $('selectionCount').textContent=state.nodes.length+' object'+(state.nodes.length===1?'':'s'); $('undoBtn').disabled=!history.length; $('redoBtn').disabled=!future.length; updateInspector();
  }
  function clientPoint(ev){const r=svg.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function worldPoint(ev){const p=clientPoint(ev);return{x:(p.x-state.view.x)/state.view.zoom,y:(p.y-state.view.y)/state.view.zoom};}
  function select(id){selectedId=id;render();}
  function updateInspector(){const n=state.nodes.find(x=>x.id===selectedId); $('inspectorEmpty').hidden=!!n; $('inspector').hidden=!n; if(!n)return; const s=shapes[n.type]||shapes.process; $('inspectorType').textContent=n.type.toUpperCase(); $('labelInput').value=n.label||''; $('widthInput').value=n.w||s.w; $('heightInput').value=n.h||s.h; $('fillInput').value=n.fill||s.fill; $('fillValue').textContent=(n.fill||s.fill).toUpperCase();}
  function updateSelected(mutator,message='Updated shape'){const n=state.nodes.find(x=>x.id===selectedId);if(!n)return;const next=clone(state);mutator(next.nodes.find(x=>x.id===selectedId));commit(next,message);}
  function addShape(type,x,y){const s=shapes[type], id=type+'-'+Date.now().toString(36);const next=clone(state);next.nodes.push({id,type,x:Math.round(x-s.w/2),y:Math.round(y-s.h/2),label:s.label,w:s.w,h:s.h,fill:s.fill});commit(next,'Shape added');select(id);notify(`${s.label} added`,'success');$('canvasHint').style.display='none';}
  function undo(){if(!history.length)return;future.push(snapshot());state=history.pop();selectedId=null;render();scheduleSave('Undo applied');}
  function redo(){if(!future.length)return;history.push(snapshot());state=future.pop();render();scheduleSave('Redo applied');}
  function deleteSelected(){if(!selectedId)return;const removed=state.nodes.find(n=>n.id===selectedId);const next=clone(state);next.nodes=next.nodes.filter(n=>n.id!==selectedId);next.edges=next.edges.filter(e=>e.from!==selectedId&&e.to!==selectedId);commit(next,'Shape deleted');selectedId=null;render();notify(`${removed?.label||'Shape'} deleted`);}
  function fit(){if(!state.nodes.length)return;const r=wrap.getBoundingClientRect(), minX=Math.min(...state.nodes.map(n=>n.x)), minY=Math.min(...state.nodes.map(n=>n.y)),maxX=Math.max(...state.nodes.map(n=>n.x+(n.w||160))),maxY=Math.max(...state.nodes.map(n=>n.y+(n.h||70)));const z=Math.max(.35,Math.min(1.2,Math.min((r.width-90)/(maxX-minX),(r.height-90)/(maxY-minY))));const next=clone(state);next.view={zoom:z,x:(r.width-(maxX-minX)*z)/2-minX*z,y:(r.height-(maxY-minY)*z)/2-minY*z};commit(next,'View adjusted');}
  function newBoard(){if(state.nodes.length&& !confirm('Start a new empty diagram?'))return;history.push(snapshot());future=[];state={nodes:[],edges:[],view:{x:wrap.clientWidth/2,y:wrap.clientHeight/2,zoom:1}};selectedId=null;render();scheduleSave('New diagram');notify('New diagram ready','success');}
  function exportBoard(){const out=clone(state);const blob=new Blob([JSON.stringify({format:'draw.io-flowboard',version:1,...out},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flowboard.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notify('Flowboard exported','success');}
  document.querySelectorAll('.shape-tool').forEach(btn=>btn.addEventListener('click',()=>{const r=wrap.getBoundingClientRect();addShape(btn.dataset.shape,(r.width/2-state.view.x)/state.view.zoom,(r.height/2-state.view.y)/state.view.zoom);}));
  $('shapeSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.shape-tool').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(q));});
  $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('newBtn').onclick=newBoard;$('addTab').onclick=newBoard;$('saveBtn').onclick=async()=>{await saveState();notify('All changes saved','success');};$('exportBtn').onclick=exportBoard;$('fitBtn').onclick=fit;$('dismissHint').onclick=()=>{$('canvasHint').style.display='none';};$('collapsePalette').onclick=()=>document.body.classList.toggle('palette-collapsed');$('closeInspector').onclick=()=>document.body.classList.add('inspector-closed');$('inspectorToggle').onclick=()=>document.body.classList.remove('inspector-closed');
  $('zoomIn').onclick=()=>zoomAt(1.15);$('zoomOut').onclick=()=>zoomAt(1/1.15);
  function zoomAt(factor){const next=clone(state),r=wrap.getBoundingClientRect(),center={x:r.width/2,y:r.height/2},old=next.view.zoom;next.view.zoom=Math.max(.25,Math.min(2.5,old*factor));next.view.x=center.x-(center.x-next.view.x)*(next.view.zoom/old);next.view.y=center.y-(center.y-next.view.y)*(next.view.zoom/old);commit(next,'View adjusted');}
  svg.addEventListener('pointerdown',e=>{const node=e.target.closest('.node-shape');const port=e.target.closest('.port');if(port&&node){const n=state.nodes.find(x=>x.id===node.dataset.id);link={from:n.id,start:worldPoint(e)};svg.setPointerCapture(e.pointerId);return;}if(node){select(node.dataset.id);const p=worldPoint(e),n=state.nodes.find(x=>x.id===node.dataset.id);drag={id:n.id,dx:p.x-n.x,dy:p.y-n.y,before:snapshot()};svg.setPointerCapture(e.pointerId);return;}if(e.target.closest('.edge'))return;pan={x:e.clientX,y:e.clientY,ox:state.view.x,oy:state.view.y};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(drag){const p=worldPoint(e),next=clone(state),n=next.nodes.find(x=>x.id===drag.id);n.x=Math.round(p.x-drag.dx);n.y=Math.round(p.y-drag.dy);state=next;render();}else if(pan){const next=clone(state);next.view.x=pan.ox+e.clientX-pan.x;next.view.y=pan.oy+e.clientY-pan.y;state=next;render();}else if(link){render();}});
  svg.addEventListener('pointerup',e=>{if(drag){history.push(drag.before);if(history.length>45)history.shift();future=[];drag=null;scheduleSave('Shape moved');}else if(pan){pan=null;scheduleSave('View adjusted');}else if(link){const target=e.target.closest('.node-shape');if(target&&target.dataset.id!==link.from){const next=clone(state);if(!next.edges.some(x=>(x.from===link.from&&x.to===target.dataset.id)||(x.from===target.dataset.id&&x.to===link.from)))next.edges.push({id:'e-'+Date.now().toString(36),from:link.from,to:target.dataset.id});commit(next,'Connection added');notify('Shapes connected','success');}link=null;render();}});
  svg.addEventListener('wheel',e=>{e.preventDefault();const p=clientPoint(e),factor=e.deltaY<0?1.1:.9,next=clone(state),old=next.view.zoom;next.view.zoom=Math.max(.25,Math.min(2.5,old*factor));next.view.x=p.x-(p.x-next.view.x)*(next.view.zoom/old);next.view.y=p.y-(p.y-next.view.y)*(next.view.zoom/old);state=next;render();clearTimeout(saveTimer);saveTimer=setTimeout(saveState,500);},{passive:false});
  $('labelInput').addEventListener('input',e=>updateSelected(n=>n.label=e.target.value,'Label edited'));$('widthInput').addEventListener('change',e=>updateSelected(n=>n.w=Math.max(60,Math.min(500,+e.target.value||60)),'Size updated'));$('heightInput').addEventListener('change',e=>updateSelected(n=>n.h=Math.max(40,Math.min(300,+e.target.value||40)),'Size updated'));$('fillInput').addEventListener('input',e=>{ $('fillValue').textContent=e.target.value.toUpperCase();updateSelected(n=>n.fill=e.target.value,'Fill updated');});$('deleteBtn').onclick=deleteSelected;
  document.querySelectorAll('[data-align]').forEach(btn=>btn.addEventListener('click',()=>{const n=state.nodes.find(x=>x.id===selectedId);if(!n)return;const next=clone(state),targets=next.nodes.filter(x=>x.id!==selectedId);if(!targets.length)return;const align=btn.dataset.align;if(align==='left')n.x=Math.min(...targets.map(x=>x.x));if(align==='center')n.x=Math.round(targets.reduce((sum,x)=>sum+x.x+x.w/2,0)/targets.length-n.w/2);if(align==='right')n.x=Math.max(...targets.map(x=>x.x+x.w))-n.w;if(align==='top')n.y=Math.min(...targets.map(x=>x.y));if(align==='middle')n.y=Math.round(targets.reduce((sum,x)=>sum+x.y+x.h/2,0)/targets.length-n.h/2);if(align==='bottom')n.y=Math.max(...targets.map(x=>x.y+x.h))-n.h;commit(next,'Shape aligned');}));
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if((e.key==='Delete'||e.key==='Backspace')&&document.activeElement.tagName!=='TEXTAREA'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();deleteSelected();}if(e.key==='Escape'){selectedId=null;render();}if(e.code==='Space'&&!e.repeat&&document.activeElement===svg){svg.style.cursor='grab';}});document.addEventListener('keyup',e=>{if(e.code==='Space')svg.style.cursor='default';});
  window.addEventListener('resize',()=>render());
  boot();
})();
