// Shared by the browser and Edge Function. No credentials or browser dependencies.
const active = items => (Array.isArray(items) ? items : []).filter(item => item && !item.deletedAt);
const clone = value => JSON.parse(JSON.stringify(value));

export function buildVehicleExport(state, exportedAt = new Date().toISOString()) {
  const ops = state.operations || {};
  const collections = [['vehicles', active(state.vehicles)], ['candidates', active(ops.candidates)], ['imports', active(ops.imports)]];
  const records = collections.flatMap(([collection, items]) => items.map(record => {
    if (typeof record.id !== 'string' || !record.id) throw new Error('Eine Fahrzeugakte hat keine gültige ID. Bitte zuerst korrigieren.');
    const related = {};
    if (collection === 'vehicles') {
      const tasks = active(state.tasks).filter(item => item.vehicleId === record.id);
      if (tasks.length) related.tasks = tasks;
      for (const [name, items] of Object.entries(ops)) {
        if (!Array.isArray(items)) continue;
        const linked = active(items).filter(item => item.vehicleId === record.id || (name === 'showrooms' && item.id === record.showroomId));
        if (linked.length) related[name] = linked;
      }
    }
    return { key: `${collection}:${record.id}`, collection, record: clone(record), related: clone(related) };
  }));
  if (new Set(records.map(item => item.key)).size !== records.length) throw new Error('Doppelte Fahrzeug-IDs verhindern einen eindeutigen Export.');
  return { schemaVersion: 1, exportedAt, currency: 'EUR', vehicles: records };
}

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

export function datasetSignature(dataset) {
  return canonical({ schemaVersion: dataset.schemaVersion, currency: dataset.currency, vehicles: [...dataset.vehicles].sort((a, b) => a.key.localeCompare(b.key)) });
}

export function exportCsv(dataset) {
  const legacy = ['Marke', 'Modell', 'Baujahr', 'Kilometer', 'Einkaufspreis', 'Gesamtkosten', 'Verkaufspreis', 'Nettogewinn', 'Marge %', 'Status', 'Score'];
  const stock = dataset.vehicles.filter(item => item.collection === 'vehicles').map(item => item.record);
  const num = value => Number(value || 0);
  const legacyScore = (v, net) => {
    const peers = stock.filter(other => other.id !== v.id && other.brand?.toLowerCase() === v.brand?.toLowerCase() && other.model?.toLowerCase() === v.model?.toLowerCase());
    const reference = peers.length ? peers.reduce((sum, other) => sum + (num(other.askingPrice) || num(other.desiredSalePrice)), 0) / peers.length : num(v.askingPrice) || num(v.desiredSalePrice);
    const price = num(v.purchasePrice) || num(v.askingPrice);
    const pricePoints = reference && price ? Math.max(0, Math.min(35, 18 + ((reference - price) / reference) * 100)) : 18;
    const mileagePoints = num(v.mileage) ? Math.max(0, Math.min(18, 18 - num(v.mileage) / 25000)) : 8;
    const agePoints = v.year ? Math.max(3, Math.min(14, 14 - (new Date().getFullYear() - num(v.year)) * .45)) : 7;
    return Math.round(Math.max(0, Math.min(100, pricePoints + mileagePoints + agePoints + Math.min(15, (v.equipment?.length || 0) * 1.8) + Math.max(0, Math.min(18, 8 + net / 100)))));
  };
  const rows = dataset.vehicles.map(item => {
    const v = item.record;
    const costs = ['purchasePrice', 'transportCost', 'registrationCost', 'repairCost', 'cleaningCost', 'listingCost', 'otherCost'].reduce((sum, key) => sum + (Number(v[key]) || 0), 0);
    const sale = Number(v.soldPrice) || Number(v.desiredSalePrice) || 0;
    const net = sale - costs - (Number(v.taxes) || 0);
    return { Marke: v.brand, Modell: v.model, Baujahr: v.year, Kilometer: v.mileage, Einkaufspreis: v.purchasePrice, Gesamtkosten: costs, Verkaufspreis: sale, Nettogewinn: net, 'Marge %': costs ? (net / costs * 100).toFixed(2) : 0, Status: v.status, Score: item.collection === 'vehicles' ? legacyScore(v, net) : v.analysis?.score, Export_ID: item.key, Sammlung: item.collection, ...Object.fromEntries(Object.entries(v).map(([key, value]) => ['Feld.' + key, value])), ...Object.fromEntries(Object.entries(item.related).map(([key, value]) => ['Verknuepft.' + key, value])) };
  });
  const headers = [...legacy, ...[...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => !legacy.includes(key)).sort()];
  const cell = value => {
    let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
    // Quoting alone does not prevent spreadsheet formula injection.
    if (typeof value === 'string' && /^[\s\u0000-\u0020\uFEFF]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [headers.map(cell).join(';'), ...rows.map(row => headers.map(key => cell(row[key])).join(';'))].join('\r\n');
}

export function vehicleLabel(item) {
  const v = item.record;
  return [v.brand, v.model, v.series, v.year].filter(Boolean).join(' · ') || item.key;
}
