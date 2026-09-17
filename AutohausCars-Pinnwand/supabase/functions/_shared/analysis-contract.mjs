export const MAX_VEHICLES = 50;
export const MAX_BODY_BYTES = 1024 * 1024;
export const CONTACT = ['priorisiert_kontaktieren', 'erst_klaeren', 'nicht_priorisieren', 'nicht_ankaufbar'];
const string = { type: 'string' };
const strings = { type: 'array', items: string };
export const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'limitations', 'vehicles'],
  properties: {
    summary: string, limitations: strings,
    vehicles: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['vehicleKey', 'rank', 'stars', 'contactPriority', 'confidence', 'factors', 'rationale', 'questions'],
      properties: {
        vehicleKey: string, rank: { type: 'integer' }, stars: { type: 'integer', minimum: 1, maximum: 5 },
        contactPriority: { type: 'string', enum: CONTACT }, confidence: { type: 'string', enum: ['niedrig', 'mittel', 'hoch'] },
        factors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'impact', 'evidence'], properties: { label: string, impact: { type: 'string', enum: ['positiv', 'negativ', 'unklar'] }, evidence: string } } },
        rationale: string, questions: strings,
      },
    } },
  },
};

// A deliberately small JSON-Schema validator covering every keyword used above.
// Both the server and UI validate; strict model output is not the trust boundary.
export function validateSchema(value, schema) {
  if (schema.type === 'object') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Ungültiges Analyseobjekt.');
    if (schema.required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw new Error('Ungültige Analysefelder.');
    for (const [key, field] of Object.entries(schema.properties)) validateSchema(value[key], field);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error('Ungültige Analyseliste.');
    value.forEach(item => validateSchema(item, schema.items));
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new Error('Ungültige Bewertungszahl.');
  } else if (typeof value !== 'string' || !value.trim() || value.length > 16000) throw new Error('Ungültiger Analysetext.');
  if (schema.enum && !schema.enum.includes(value)) throw new Error('Ungültige Bewertungskategorie.');
}

export function validateAnalysis(value, dataset) {
  validateSchema(value, ANALYSIS_SCHEMA);
  const keys = new Set(dataset.vehicles.map(item => item.key));
  const records = new Map(dataset.vehicles.map(item => [item.key, item.record]));
  const ranks = new Set();
  if (value.vehicles.length !== keys.size) throw new Error('Die Analyse enthält nicht alle Fahrzeugakten.');
  for (const item of value.vehicles) {
    if (!keys.delete(item.vehicleKey) || ranks.has(item.rank) || item.rank < 1 || item.rank > dataset.vehicles.length) throw new Error('Die Analyse enthält doppelte oder fremde Fahrzeuge/Ränge.');
    ranks.add(item.rank);
    if (item.rationale.length < 400 || item.factors.length < 3 || item.factors.length > 10 || item.questions.length > 8) throw new Error('Die Fahrzeugbegründung ist unvollständig.');
    if (item.contactPriority === 'nicht_ankaufbar' && item.stars !== 1) throw new Error('Widersprüchliche Kontaktbewertung.');
    const status = String(records.get(item.vehicleKey).status || '').trim().toLowerCase();
    if (['gekauft', 'in aufbereitung', 'inseriert', 'verkauft', 'archiviert', 'übernommen', 'abgelehnt'].includes(status) && item.contactPriority !== 'nicht_ankaufbar') throw new Error('Nicht verfügbare Akte wurde als Ankaufkontakt bewertet.');
  }
  const sorted = [...value.vehicles].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].stars > sorted[i - 1].stars) throw new Error('Rang und Sterne widersprechen sich.');
  return { ...value, vehicles: sorted };
}

export function validateDataset(dataset) {
  if (!dataset || dataset.schemaVersion !== 1 || dataset.currency !== 'EUR' || typeof dataset.exportedAt !== 'string' || !Number.isFinite(Date.parse(dataset.exportedAt)) || !Array.isArray(dataset.vehicles)) throw new Error('Ungültiger Fahrzeugexport.');
  const keys = new Set();
  for (const item of dataset.vehicles) {
    if (!item || !['vehicles', 'candidates', 'imports'].includes(item.collection) || typeof item.record?.id !== 'string' || !item.record.id || item.key !== `${item.collection}:${item.record.id}` || keys.has(item.key) || !item.related || Array.isArray(item.related) || typeof item.related !== 'object') throw new Error('Ungültige Fahrzeugakte im Export.');
    keys.add(item.key);
  }
  return dataset;
}
