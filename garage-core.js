import { EXTRA_PARTS } from './garage-parts.js';
export const PARTS = [
  ['hood','Motorhaube','Karosserie'],['roof','Dach','Karosserie'],['trunk','Heckklappe','Karosserie'],
  ['bumper-front','Stoßfänger vorne','Karosserie'],['bumper-rear','Stoßfänger hinten','Karosserie'],
  ['door-fl','Tür vorne links','Karosserie'],['door-fr','Tür vorne rechts','Karosserie'],['door-rl','Tür hinten links','Karosserie'],['door-rr','Tür hinten rechts','Karosserie'],
  ['fender-fl','Kotflügel vorne links','Karosserie'],['fender-fr','Kotflügel vorne rechts','Karosserie'],['fender-rl','Seitenteil hinten links','Karosserie'],['fender-rr','Seitenteil hinten rechts','Karosserie'],
  ['windshield','Frontscheibe','Verglasung'],['rear-glass','Heckscheibe','Verglasung'],['mirror-left','Spiegel links','Anbauteile'],['mirror-right','Spiegel rechts','Anbauteile'],
  ['light-fl','Scheinwerfer links','Beleuchtung'],['light-fr','Scheinwerfer rechts','Beleuchtung'],['light-rl','Rückleuchte links','Beleuchtung'],['light-rr','Rückleuchte rechts','Beleuchtung'],
  ['wheel-fl','Rad vorne links','Fahrwerk'],['wheel-fr','Rad vorne rechts','Fahrwerk'],['wheel-rl','Rad hinten links','Fahrwerk'],['wheel-rr','Rad hinten rechts','Fahrwerk'],
  ['brake-fl','Bremse vorne links','Fahrwerk'],['brake-fr','Bremse vorne rechts','Fahrwerk'],['brake-rl','Bremse hinten links','Fahrwerk'],['brake-rr','Bremse hinten rechts','Fahrwerk'],
  ['engine','Motor / Antrieb','Technik'],['transmission','Getriebe','Technik'],['battery','Batterie','Technik'],['exhaust','Abgasanlage','Technik'],['suspension-front','Vorderachse','Fahrwerk'],['suspension-rear','Hinterachse','Fahrwerk']
].map(([id,name,group])=>({id,name,group})).concat(EXTRA_PARTS.map(({id,name,group})=>({id,name,group})));
export const BODY_TYPES = {sedan:'Limousine',hatchback:'Kompakt',wagon:'Kombi',suv:'SUV',van:'Van'};
export function bodyType(vehicle, override) {
  if (BODY_TYPES[override]) return override;
  const text=String(vehicle.body||'').toLowerCase();
  if (/suv|gelände|gelande/.test(text)) return 'suv';
  if (/kombi|estate|touring|avant/.test(text)) return 'wagon';
  if (/van|bus|transporter/.test(text)) return 'van';
  if (/klein|kompakt|schräg|schrag|sportback|hatch/.test(text)) return 'hatchback';
  return 'sedan';
}
export function numeric(value) { const n=Number(value); return Number.isFinite(n)&&n>=0?n:0; }
export function partCost(record={}) { return Math.round((numeric(record.materials)+numeric(record.laborHours)*numeric(record.hourlyRate))*100)/100; }
export function finances(vehicle={}, records=[]) {
  const parts=records.filter(record=>PARTS.some(p=>p.id===record.partId));
  const planned=parts.reduce((sum,p)=>sum+partCost(p),0);
  const completed=parts.filter(p=>p.status==='done').reduce((sum,p)=>sum+partCost(p),0);
  const legacy=numeric(vehicle.repairCost);
  // Keep the existing budget as a reserve; note-only records cannot erase it.
  // Itemized repairs and the old lump sum are never added on top of each other.
  const repairs=Math.max(planned,legacy);
  const purchase=numeric(vehicle.purchasePrice);
  const additional=['transportCost','registrationCost','cleaningCost','listingCost','otherCost'].reduce((sum,key)=>sum+numeric(vehicle[key]),0);
  const taxes=numeric(vehicle.taxes);
  const sale=numeric(vehicle.soldPrice)||numeric(vehicle.desiredSalePrice)||numeric(vehicle.targetPrice)||numeric(vehicle.askingPrice);
  const total=purchase+additional+repairs;
  const saleKnown=sale>0,margin=saleKnown?sale-total-taxes:null;
  return {planned,completed,open:planned-completed,repairs,legacy,reserve:Math.max(0,legacy-planned),purchase,additional,taxes,sale,saleKnown,total,margin,marginPercent:saleKnown&&total?margin/total*100:null,partCount:parts.length};
}
export function recordId(vehicleId,partId) { return `${vehicleId}::${partId}`; }
