import { LEVELS, partVisible } from './garage-visibility.js';
import { createGarageScene } from './garage-model.js';
import { PARTS, BODY_TYPES, bodyType, numeric, partCost, finances, recordId } from './garage-core.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value||0);
const number=value=>Number(value||0).toLocaleString('de-DE');
let lastLevel='all';
let api,root,scene,store,storeKey,unsubscribe,selectedVehicle='',selectedPart='hood',draftRevision=0,dirty=false,active=false,lastModel='',loading=false;
const $=selector=>root.querySelector(selector);
const vehicles=()=>api.vehicles();
const vehicle=()=>vehicles().find(v=>v.id===selectedVehicle);
const currentRecord=()=>store?.get(recordId(selectedVehicle,selectedPart));
const records=()=>store?store.list().filter(r=>r.vehicleId===selectedVehicle&&PARTS.some(p=>p.id===r.partId)):[];
const label=v=>api.vehicleName(v);
function showMessage(text){$('#garage-editor-message').textContent=text;}
function storageStatus(){if(store)$('#garage-sync').textContent=store.status();}
function protectDraft(){return !dirty||confirm('Ungespeicherte Änderungen an diesem Bauteil verwerfen?');}

async function ensureStore(){
  const key=api.workspaceKey();if(!key||!window.CarsWorkspaceData)return;
  if(storeKey===key&&store)return;
  unsubscribe?.();storeKey=key;store=window.CarsWorkspaceData.open('garage');
  unsubscribe=store.subscribe(()=>{storageStatus();renderMetrics();renderParts();if(!dirty)loadEditor();refreshModel();});
  storageStatus();
  try{await store.ready;storageStatus();renderMetrics();renderParts();loadEditor();refreshModel();}catch(error){$('#garage-sync').textContent=error.message||'Garage konnte nicht geladen werden.';}
}
function refreshVehicleList(){
  const list=vehicles(),select=$('#garage-vehicle'),old=selectedVehicle;
  if(!list.some(v=>v.id===selectedVehicle)){selectedVehicle=list[0]?.id||'';dirty=false;}
  select.innerHTML=list.map(v=>`<option value="${esc(v.id)}">${esc(label(v))}${v.vehicleNumber?' · '+esc(v.vehicleNumber):''}</option>`).join('');select.value=selectedVehicle;
  $('#garage-empty').hidden=!!selectedVehicle;$('#garage-content').hidden=!selectedVehicle;
  if(selectedVehicle){renderVehicleData();renderMetrics();renderParts();refreshModel();if(old!==selectedVehicle||!dirty)loadEditor();}
}
function refreshModel(){
  const v=vehicle();if(!v)return;
  const settings=store?.get(recordId(v.id,'settings')),type=bodyType(v,settings?.bodyType);$('#garage-body').value=type;
  $('#garage-model-name').textContent=label(v);$('#garage-model-meta').textContent=[BODY_TYPES[type],v.year||'Baujahr offen',v.status||'Status offen'].join(' · ');
  if(scene&&type!==lastModel){scene.build(type);lastModel=type;scene.select(selectedPart);}
}
function createScene(){
  if(scene)return;
  try{
    scene=createGarageScene($('#garage-canvas'),{onSelect:selectPart,onHover:(id,event)=>{
      const tooltip=$('#garage-tooltip');tooltip.hidden=!id;if(!id)return;
      const part=PARTS.find(p=>p.id===id),raw=store?.get(recordId(selectedVehicle,id)),record=raw?._deleted?null:raw;
      tooltip.innerHTML=`<b>${esc(part?.name||id)}</b><span>${money(partCost(record))}</span><span>${esc(record?.notes?.slice(0,160)||'Noch keine Notiz. Zum Bearbeiten auswählen.')}</span>`;
      const box=$('.gg-stage').getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(box.width-250,event.clientX-box.left+16))+'px';tooltip.style.top=Math.max(8,Math.min(box.height-130,event.clientY-box.top+16))+'px';
    },onError:text=>{$('#garage-fallback').hidden=false;$('#garage-fallback').textContent=text;}});
    refreshModel();scene.setGroup($('#garage-level').value);scene.setFloor($('#garage-floor').getAttribute('aria-pressed')==='true');scene.setActive(active);
  }catch(error){$('#garage-fallback').hidden=false;$('#garage-fallback').textContent='Die 3D-Ansicht benötigt WebGL. Du kannst alle Bauteile, Notizen und Kosten weiterhin über die Liste unten bearbeiten.';console.warn('Garage WebGL unavailable:',error.message);}
}
function selectPart(id){
  if(!PARTS.some(p=>p.id===id)||!protectDraft())return;
  selectedPart=id;dirty=false;if(!partVisible(PARTS.find(p=>p.id===id),$('#garage-level').value)){$('#garage-level').value='all';lastLevel='all';scene?.setGroup('all');}scene?.select(id);loadEditor();renderParts();
  if(window.innerWidth<800)$('#garage-editor').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function loadEditor(){
  if(dirty||!selectedVehicle)return;
  const part=PARTS.find(p=>p.id===selectedPart),raw=currentRecord(),record=raw?._deleted?null:raw;draftRevision=raw?raw._revision:0;
  $('#garage-part-select').value=selectedPart;$('#garage-part-title').textContent=part.name;$('#garage-part-group').textContent=part.group;
  $('#garage-notes').value=record?.notes||'';$('#garage-materials').value=record?.materials??'';$('#garage-hours').value=record?.laborHours??'';$('#garage-rate').value=record?.hourlyRate??'';$('#garage-repair-status').value=record?.status||'open';
  $('#garage-part-delete').disabled=!record;renderDraftTotal();showMessage('');
}
function readDraft(){return {id:recordId(selectedVehicle,selectedPart),vehicleId:selectedVehicle,partId:selectedPart,notes:$('#garage-notes').value.trim(),materials:numeric($('#garage-materials').value),laborHours:numeric($('#garage-hours').value),hourlyRate:numeric($('#garage-rate').value),status:$('#garage-repair-status').value,_revision:draftRevision};}
function renderDraftTotal(){$('#garage-part-total').textContent=money(partCost(readDraft()));}
function renderMetrics(){
  const v=vehicle();if(!v)return;const totals=finances(v,records());
  $('#garage-metrics').innerHTML=[['Reparaturbudget',money(totals.repairs),totals.partCount?`${totals.partCount} Bauteile erfasst`:'Pauschale aus Fahrzeugakte'],['Gesamteinsatz',money(totals.total),'Ankauf + Nebenkosten + Reparaturen'],['Verkauf / Ziel',totals.saleKnown?money(totals.sale):'Noch offen',v.soldPrice?'Erfasster Verkaufspreis':'Erfasster Ziel- / Angebotspreis'],['Ergebnisprognose',totals.saleKnown?money(totals.margin):'Noch offen',totals.saleKnown?`${totals.marginPercent?.toLocaleString('de-DE',{maximumFractionDigits:1})??'—'} % auf Gesamteinsatz`:'Bitte einen Verkaufspreis hinterlegen']].map(([name,value,hint],i)=>`<div class="gg-metric"><span>${name}</span><strong class="${i===3&&totals.saleKnown?(totals.margin>=0?'gg-positive':'gg-negative'):''}">${value}</strong><small>${hint}</small></div>`).join('');
  $('#garage-cost-note').textContent=`Ankauf ${money(totals.purchase)} · weitere Kosten ${money(totals.additional)} · Steuern/Abzüge ${money(totals.taxes)}. Reparaturbudget = höherer Wert aus Einzelkalkulation (${money(totals.planned)}) und vorhandener Pauschale (${money(totals.legacy)}), ohne Doppelzählung. Reserve: ${money(totals.reserve)}. Erledigte Bauteile: ${money(totals.completed)} · offene Bauteile: ${money(totals.open)}. Die ursprüngliche Fahrzeugakte wird nicht verändert. Prognose auf Basis eurer Eingaben, keine Marktwertbewertung.`;
}
function renderVehicleData(){const v=vehicle();if(!v)return;const fields=[['Baujahr',v.year||'—'],['Laufleistung',v.mileage!=null?number(v.mileage)+' km':'—'],['Leistung',v.ps?number(v.ps)+' PS':v.kw?number(v.kw)+' kW':'—'],['Kraftstoff',v.fuel||'—'],['Getriebe',v.gearbox||'—'],['Status',v.status||'—'],['Fahrzeugnummer',v.vehicleNumber||'—'],['Standort',v.location||'—'],['FIN',v.vin||v.fin||'—'],['Halter',v.owners||'—'],['Erstzulassung',v.firstRegistration||'—'],['Ausstattung',(v.equipment?.length||0)+' Extras']];$('#garage-data').innerHTML=fields.map(([name,value])=>`<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`).join('');}
function renderParts(){
  if(!store||!selectedVehicle)return;const query=$('#garage-part-search').value.trim().toLocaleLowerCase('de');const items=PARTS.filter(p=>partVisible(p,$('#garage-level').value)).filter(p=>(p.name+' '+p.group).toLocaleLowerCase('de').includes(query));
  $('#garage-part-list').innerHTML=items.map(part=>{const raw=store.get(recordId(selectedVehicle,part.id)),record=raw?._deleted?null:raw;return `<button class="gg-part-button" data-garage-part="${part.id}" aria-pressed="${part.id===selectedPart}"><span>${part.name}<small>${record?.status==='done'?'Erledigt':record?.status==='inprogress'?'In Arbeit':record?'Geplant':part.group}</small></span><strong>${record?money(partCost(record)):'+'}</strong></button>`;}).join('')||'<p>Kein Bauteil gefunden.</p>';
}
async function savePart(event){
  event.preventDefault();if(!store||loading||!vehicle())return;const form=$('#garage-part-form');if(!form.reportValidity())return;
  loading=true;$('#garage-part-save').disabled=true;const draft=readDraft();
  try{await store.put(draft);dirty=false;draftRevision=store.get(draft.id)?._revision||0;renderMetrics();renderParts();showMessage('Bauteil für alle Benutzer gespeichert.');$('#garage-part-delete').disabled=false;}
  catch(error){showMessage(error.code===409||error.code==='P0001'?'Dieses Bauteil wurde zwischenzeitlich geändert. Deine Eingabe bleibt erhalten. Mit „Neu laden“ den gemeinsamen Stand laden und Änderungen erneut eintragen.':error.message||'Speichern fehlgeschlagen. Deine Eingabe bleibt erhalten.');}
  finally{loading=false;$('#garage-part-save').disabled=false;storageStatus();}
}
function exportCosts(){const v=vehicle();if(!v)return;const rows=[['Fahrzeug','Bauteil','Notiz','Material EUR','Arbeitsstunden','Stundensatz EUR','Gesamt EUR','Status'],...records().map(r=>[label(v),PARTS.find(p=>p.id===r.partId)?.name||r.partId,r.notes||'',numeric(r.materials),numeric(r.laborHours),numeric(r.hourlyRate),partCost(r),r.status||'open'])];const csv='\ufeff'+rows.map(row=>row.map(value=>{let s=String(value);if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');const link=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.href=url;link.download=`Garage-${String(v.id).replace(/[^a-z0-9_-]/gi,'_')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function start(){
  api=window.CarsAutoHaus;if(!api||document.getElementById('garage-view'))return;
  root=document.createElement('section');root.id='garage-view';root.className='view';root.setAttribute('aria-label','Digitale Garage');
  root.innerHTML=`<header class="gg-header"><div><span class="gg-eyebrow">CarsAutoHaus · Atelier</span><h1>Digitale Garage</h1><span id="garage-sync" class="gg-status" role="status">Gemeinsame Garage wird geladen …</span></div><div class="gg-header-right"><label><span>Fahrzeug aus eurem Bestand</span><select id="garage-vehicle" aria-label="Fahrzeug in der Garage auswählen"></select></label><button id="garage-export" title="Bauteilkalkulation als CSV">Kalkulation exportieren</button></div></header><div id="garage-empty" class="gg-empty" hidden><h2>Deine Garage wartet.</h2><p>Lege ein Fahrzeug im Bestand an. Es steht anschließend automatisch hier zur Auswahl.</p><button data-go="form">Fahrzeug hinzufügen</button></div><div id="garage-content"><div class="gg-display-options"><label for="garage-level">Sichtbare Bauteile<select id="garage-level"><optgroup label="Ansichtsstufen">${LEVELS.map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</optgroup><optgroup label="Einzelne Baugruppe">${[...new Set(PARTS.map(p=>p.group))].map(g=>`<option value="${g}">${g}</option>`).join('')}</optgroup></select></label><button id="garage-floor" type="button" aria-pressed="true">Boden: an</button></div><div class="gg-main"><div class="gg-workspace"><div class="gg-stage"><div id="garage-canvas" class="gg-canvas"></div><div class="gg-stage-label"><strong id="garage-model-name" class="gg-model-name"></strong><span id="garage-model-meta" class="gg-model-meta"></span></div><div class="gg-model-disclaimer">${PARTS.length} anwählbare Bauteile<br>Illustratives Modell · Varianten enthalten</div><div id="garage-tooltip" class="gg-tooltip" hidden></div><div id="garage-fallback" class="gg-fallback" hidden></div><div class="gg-view-tools"><div class="gg-camera-tools"><button data-garage-view="perspective" title="Perspektive zurücksetzen">3D</button><button data-garage-view="front">Front</button><button data-garage-view="side">Seite</button><button data-garage-view="rear">Heck</button><button data-garage-view="top">Oben</button></div><div class="gg-render-tools"><button id="garage-zoom-in" aria-label="Vergrößern">+</button><button id="garage-zoom-out" aria-label="Verkleinern">−</button><button id="garage-rotate" aria-pressed="false">Drehen</button></div></div></div><div id="garage-metrics" class="gg-metrics"></div><section class="gg-vehicle-data"><div class="gg-data-header"><h2>Fahrzeugakte</h2><span>Drehen: ziehen · Zoom: Mausrad / zwei Finger</span></div><dl id="garage-data" class="gg-data-grid"></dl><p id="garage-cost-note" class="gg-cost-note"></p></section></div><aside id="garage-editor" class="gg-sidebar"><span id="garage-part-group" class="gg-eyebrow">Bauteil</span><h2 id="garage-part-title">Motorhaube</h2><p class="gg-editor-subtitle">Ein Bauteil. Alle Details an einem Ort.</p><form id="garage-part-form" class="gg-editor-fields"><label><span>Bauteil auswählen</span><select id="garage-part-select">${PARTS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label><label><span>Notiz / Befund</span><textarea id="garage-notes" maxlength="12000" placeholder="Befund, Ersatzteile, nächste Schritte …"></textarea></label><label><span>Material und Fremdleistungen (€)</span><input id="garage-materials" type="number" min="0" max="10000000" step="0.01" placeholder="0,00" /></label><div class="gg-two"><label><span>Arbeitszeit (h)</span><input id="garage-hours" type="number" min="0" max="100000" step="0.25" placeholder="0" /></label><label><span>Stundensatz (€)</span><input id="garage-rate" type="number" min="0" max="100000" step="0.01" placeholder="0,00" /></label></div><label><span>Bearbeitungsstand</span><select id="garage-repair-status"><option value="open">Geplant</option><option value="inprogress">In Arbeit</option><option value="done">Erledigt</option></select></label><div class="gg-part-total"><span>Bauteil gesamt</span><strong id="garage-part-total">0,00 €</strong></div><div class="gg-editor-actions"><button id="garage-part-save" class="gg-primary" type="submit">Bauteil speichern</button><button id="garage-part-reload" type="button">Neu laden</button><button id="garage-part-delete" type="button" aria-label="Bauteileintrag löschen" title="Bauteileintrag löschen">×</button></div><div id="garage-editor-message" class="gg-editor-message" role="status"></div><label><span>Illustrative Karosserieform</span><select id="garage-body">${Object.entries(BODY_TYPES).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label></form></aside></div><section class="gg-parts"><div class="gg-parts-head"><div><span class="gg-eyebrow">Fahrzeugstruktur</span><h2>Jedes Detail im Blick.</h2><p class="gg-cost-note">${PARTS.length} Bauteile und Baugruppen. Oben wählst du alle Teile, eine Ansichtsstufe oder eine einzelne Baugruppe. Jede weitere Stufe legt tiefer liegende Bauteile frei. Der Boden lässt sich unabhängig davon ausblenden. Varianten für Verbrenner, Elektro und Hybrid sind enthalten; die Darstellung ist kein fahrzeugspezifischer Ersatzteilkatalog.</p></div><input id="garage-part-search" type="search" placeholder="Bauteile suchen …" aria-label="Bauteile suchen" /></div><div id="garage-part-list" class="gg-part-list"></div></section></div>`;
  document.querySelector('.app').append(root);const nav=document.createElement('button');nav.className='nav-button';nav.dataset.go='garage';nav.innerHTML='<span class="nav-icon">◇</span>Garage';document.querySelector('.nav-inner')?.append(nav);
  $('#garage-vehicle').onchange=event=>{if(!protectDraft()){event.target.value=selectedVehicle;return;}selectedVehicle=event.target.value;selectedPart='hood';dirty=false;refreshVehicleList();scene?.select(selectedPart);};
  $('#garage-part-select').onchange=event=>{const old=selectedPart;selectPart(event.target.value);event.target.value=selectedPart||old;};
  $('#garage-part-form').onsubmit=savePart;
  $('#garage-part-form').addEventListener('input',event=>{if(event.target.id==='garage-body'||event.target.id==='garage-part-select')return;dirty=true;renderDraftTotal();showMessage('Ungespeicherte Änderungen');});
  $('#garage-part-reload').onclick=()=>{if(!protectDraft())return;dirty=false;loadEditor();};
  $('#garage-part-delete').onclick=async()=>{if(!store||!confirm('Notiz und Reparaturkosten für dieses Bauteil löschen?'))return;try{await store.remove(recordId(selectedVehicle,selectedPart));dirty=false;loadEditor();renderMetrics();renderParts();}catch(error){showMessage(error.message||'Löschen fehlgeschlagen.');}};
  $('#garage-body').onchange=async event=>{if(!store)return;const old=store.get(recordId(selectedVehicle,'settings'));try{await store.put({...old,id:recordId(selectedVehicle,'settings'),vehicleId:selectedVehicle,partId:'settings',bodyType:event.target.value,_revision:old?old._revision:0});refreshModel();}catch(error){showMessage(error.message||'Karosserieform konnte nicht gespeichert werden.');refreshModel();}};
  $('#garage-part-search').oninput=renderParts;$('#garage-export').onclick=exportCosts;
  root.addEventListener('click',event=>{const part=event.target.closest('[data-garage-part]');if(part)selectPart(part.dataset.garagePart);const view=event.target.closest('[data-garage-view]');if(view)scene?.preset(view.dataset.garageView);});
  $('#garage-floor').onclick=event=>{const button=event.currentTarget,on=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(on));button.textContent=on?'Boden: an':'Boden: aus';scene?.setFloor(on);};
  $('#garage-level').onchange=event=>{if(!protectDraft()){event.target.value=lastLevel;return;}lastLevel=event.target.value;dirty=false;scene?.setGroup(lastLevel);if(!partVisible(PARTS.find(p=>p.id===selectedPart),lastLevel)){selectedPart=PARTS.find(p=>partVisible(p,lastLevel))?.id||'hood';scene?.select(selectedPart);}loadEditor();renderParts();};
  $('#garage-zoom-in').onclick=()=>scene?.zoom(.85);$('#garage-zoom-out').onclick=()=>scene?.zoom(1.15);
  $('#garage-rotate').onclick=event=>{const enabled=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(enabled));scene?.setRotate(enabled);};
  document.addEventListener('autovalue:view-changed',event=>{active=event.detail?.view==='garage';document.body.classList.toggle('garage-open',active);if(active){refreshVehicleList();void ensureStore();requestAnimationFrame(()=>{createScene();scene?.setActive(true);});}else{scene?.setActive(false);}});
  document.addEventListener('carsautohaus:operations-updated',()=>{if(active)refreshVehicleList();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
}
if(window.CarsAutoHaus)start();else document.addEventListener('carsautohaus:ready',start,{once:true});
