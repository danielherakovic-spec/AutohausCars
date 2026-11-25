/* The retained location manager, without the retired operations modules. */
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function start(){
    const api=window.CarsAutoHaus;if(!api)return;
    const root=document.createElement('section');root.id='showrooms-view';root.className='view';document.querySelector('.app').append(root);
    const locations=()=>api.getState().operations?.showrooms||[];
    function render(){
      root.innerHTML=`<div class="hero"><div><h1>Showrooms & Standorte</h1><p class="subtitle">Verkaufsflächen und Stellplätze im Überblick.</p></div></div><div class="split"><form id="location-form" class="card form-card"><h2>Standort anlegen</h2><label>Name<input name="name" required maxlength="120" /></label><label>Kapazität<input name="capacity" type="number" min="0" /></label><label>Adresse / Hinweis<textarea name="address" maxlength="1000"></textarea></label><button class="primary" type="submit">Standort speichern</button></form><form id="location-assign" class="card form-card"><h2>Fahrzeug zuordnen</h2><label>Fahrzeug<select name="vehicle" required><option value="">Auswählen</option>${api.vehicles().map(v=>`<option value="${esc(v.id)}">${esc(api.vehicleName(v))}</option>`).join('')}</select></label><label>Standort<select name="location"><option value="">Zuordnung lösen</option>${locations().map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></label><p class="muted">Bei einer Zuordnung wird auch der Fahrzeugstandort aktualisiert.</p><button class="primary" type="submit">Zuordnen</button></form></div><div class="section vehicle-grid">${locations().map(l=>{const cars=api.vehicles().filter(v=>v.showroomId===l.id);return `<article class="card form-card"><h2>${esc(l.name)}</h2><p>${esc(l.address)}</p><p class="muted">${cars.length} Fahrzeuge · ${esc(l.capacity||'—')} Plätze</p>${cars.map(v=>`<p>${esc(api.vehicleName(v))}</p>`).join('')}</article>`;}).join('')}</div>`;
      root.querySelector('#location-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));api.update(state=>{state.operations??={};state.operations.showrooms??=[];state.operations.showrooms.push({...data,id:'showroom-'+crypto.randomUUID(),status:'Aktiv',createdAt:new Date().toISOString()});});render();};
      root.querySelector('#location-assign').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),location=locations().find(l=>l.id===data.location);api.update(state=>{const v=state.vehicles.find(v=>v.id===data.vehicle);if(v){v.showroomId=data.location;if(location)v.location=location.name;v.updatedAt=new Date().toISOString();}});render();};
    }
    document.addEventListener('autovalue:view-changed',e=>{if(e.detail.view==='showrooms')render();});
    document.addEventListener('carsautohaus:operations-updated',()=>{if(root.classList.contains('active')&&!root.contains(document.activeElement))render();});
  }
  if(window.CarsAutoHaus)start();else document.addEventListener('carsautohaus:ready',start,{once:true});
})();
