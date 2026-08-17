import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function projectApiKey() {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || ''; } catch { return ''; }
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ').trim();
}

function textOnly(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

function isPrivateAddress(address: string) {
  const value = String(address).toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isPrivateAddress(mappedIpv4[1]);
  const ipv4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [first, second] = ipv4.slice(1).map(Number);
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19));
  }
  return value === '::1' || value === '::' || value.startsWith('fe80:') ||
    value.startsWith('fc') || value.startsWith('fd') || value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.');
}

async function validatePublicUrl(rawUrl: unknown) {
  let url: URL;
  try { url = new URL(String(rawUrl || '').trim()); } catch { throw new Error('Bitte eine vollständige Inserat-URL eingeben.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Erlaubt sind nur öffentliche HTTPS-Inserat-Links.');
  }
  const hostname = url.hostname.toLowerCase();
  if (['localhost', 'localhost.localdomain'].includes(hostname) || isPrivateAddress(hostname)) {
    throw new Error('Lokale oder private Netzwerkadressen können nicht importiert werden.');
  }
  let foundAddress = false;
  for (const type of ['A', 'AAAA'] as const) {
    try {
      const addresses = await Deno.resolveDns(hostname, type);
      if (addresses.length) foundAddress = true;
      if (addresses.some((address) => isPrivateAddress(address))) {
        throw new Error('Diese Adresse ist nicht öffentlich erreichbar.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('nicht öffentlich')) throw error;
      // Hosts without an IPv4 or IPv6 record are valid if the other family resolves.
    }
  }
  if (!foundAddress) throw new Error('Die Inserat-Adresse konnte nicht sicher aufgelöst werden.');
  return url;
}

async function readPublicListing(startUrl: URL) {
  let currentUrl = startUrl;
  for (let redirects = 0; redirects < 5; redirects += 1) {
    await validatePublicUrl(currentUrl.toString());
    const source = await fetch(currentUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': 'AutoValuePro/1.0 (+vehicle listing import)', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(12_000),
    });
    if ([301, 302, 303, 307, 308].includes(source.status)) {
      const location = source.headers.get('location');
      if (!location) throw new Error('Die Inserat-Seite enthält eine ungültige Weiterleitung.');
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!source.ok) throw new Error(`Die Inserat-Seite antwortet mit Fehler ${source.status}.`);
    if (!String(source.headers.get('content-type') || '').includes('html')) throw new Error('Der Link verweist nicht auf eine lesbare HTML-Inseratseite.');
    if (Number(source.headers.get('content-length') || 0) > 3 * 1024 * 1024) throw new Error('Die Inserat-Seite ist zu groß für den automatischen Import.');
    const reader = source.body?.getReader();
    if (!reader) throw new Error('Die Inserat-Seite konnte nicht gelesen werden.');
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 3 * 1024 * 1024) { await reader.cancel(); throw new Error('Die Inserat-Seite ist zu groß für den automatischen Import.'); }
      chunks.push(value);
    }
    const content = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
    return { html: new TextDecoder().decode(content), url: currentUrl.toString() };
  }
  throw new Error('Zu viele Weiterleitungen beim Öffnen des Inserats.');
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return attributes;
}

function metadataFromHtml(html: string) {
  const metadata: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = String(attributes.property || attributes.name || '').toLowerCase();
    if (key && attributes.content && !metadata[key]) metadata[key] = decodeHtml(attributes.content);
  }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) metadata.title = textOnly(title);
  return metadata;
}

function jsonObjects(html: string) {
  const objects: Record<string, unknown>[] = [];
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    objects.push(value as Record<string, unknown>);
    Object.values(value).forEach(collect);
  };
  for (const match of html.matchAll(/<script\b[^>]*(?:type\s*=\s*(?:"application\/(?:ld\+)?json"|'application\/(?:ld\+)?json'|application\/(?:ld\+)?json)|id\s*=\s*(?:"__NEXT_DATA__"|'__NEXT_DATA__'|__NEXT_DATA__))[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collect(JSON.parse(match[1].trim().replace(/^<!--|-->$/g, ''))); } catch { /* Ignore unrelated or malformed JSON. */ }
  }
  return objects;
}

function firstValue(...values: unknown[]): unknown {
  for (const value of values.flat(Infinity)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'object' && value && 'value' in value) return firstValue((value as { value: unknown }).value);
    if (typeof value === 'object' && value && 'name' in value) return firstValue((value as { name: unknown }).name);
    return value;
  }
  return '';
}

function numberFrom(value: unknown) {
  const normalized = String(value ?? '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

function matchValue(html: string, expression: RegExp) {
  const match = html.match(expression);
  return match ? decodeHtml(match[1]) : '';
}

function scoreCandidate(candidate: Record<string, unknown>) {
  const keys = Object.keys(candidate).map((key) => key.toLowerCase());
  return (keys.some((key) => ['brand', 'make', 'manufacturer'].includes(key)) ? 3 : 0) +
    (keys.some((key) => ['model', 'modeldescription', 'vehiclemodel'].includes(key)) ? 3 : 0) +
    (keys.some((key) => ['mileage', 'mileagefromodometer', 'kilometerstand'].includes(key)) ? 2 : 0) +
    (keys.some((key) => ['price', 'offers', 'offer'].includes(key)) ? 2 : 0);
}

function property(object: Record<string, unknown>, key: string) { return object[key]; }
function imageFrom(value: unknown): unknown { const candidate = Array.isArray(value) ? value[0] : value; return firstValue((candidate as Record<string, unknown>)?.url, (candidate as Record<string, unknown>)?.src, candidate); }
function psFromPower(value: unknown, unit = '') { const numeric = numberFrom(firstValue(value)); return /kw|kilowatt/i.test(unit) ? Math.round(numeric * 1.35962) : numeric; }

function extractVehicle(html: string, sourceUrl: string) {
  const metadata = metadataFromHtml(html);
  const vehicle = [...jsonObjects(html)].sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0] || {};
  const offers = Array.isArray(vehicle.offers) ? vehicle.offers[0] : (vehicle.offers || {}) as Record<string, unknown>;
  const engine = (vehicle.vehicleEngine || {}) as Record<string, unknown>;
  const name = firstValue(vehicle.name, vehicle.title, vehicle.headline, metadata['og:title'], metadata.title);
  const titleParts = String(name).replace(/\s*[|–-]\s*(mobile\.de|autoscout24|kleinanzeigen|gebrauchtwagen)[^|–-]*$/i, '').trim().split(/\s+/);
  const mileage = firstValue(vehicle.mileageFromOdometer, vehicle.mileage, vehicle.mileageInKm, vehicle.odometer, vehicle.kilometerstand, metadata['vehicle:mileage'], matchValue(html, /(?:Kilometerstand|Laufleistung|Mileage)[^0-9]{0,40}([0-9.\s]{2,12})\s*km/i));
  const power = firstValue(engine.enginePower, vehicle.enginePower, vehicle.power, vehicle.powerInKw, vehicle.leistung, matchValue(html, /(?:Leistung|Power)[^0-9]{0,40}(\d{2,4})\s*PS/i), matchValue(html, /\b(\d{2,4})\s*PS\b/i));
  const powerValue = engine.enginePower as Record<string, unknown> | undefined;
  const powerUnit = String(firstValue(powerValue?.unitCode, powerValue?.unitText, (vehicle.enginePower as Record<string, unknown>)?.unitCode, (vehicle.power as Record<string, unknown>)?.unit, vehicle.powerUnit) || '');
  const price = firstValue(property(offers, 'price'), property(offers, 'amount'), (vehicle.price as Record<string, unknown>)?.amount, (vehicle.price as Record<string, unknown>)?.gross, vehicle.price, vehicle.priceAmount, metadata['product:price:amount'], metadata['og:price:amount'], matchValue(html, /(?:Preis|Price)[^€]{0,45}([0-9.\s]{2,12})\s*(?:€|EUR)/i), matchValue(html, /([0-9.\s]{2,12})\s*(?:€|EUR)/i));
  const production = firstValue(vehicle.productionDate, vehicle.dateVehicleFirstRegistered, vehicle.firstRegistration, vehicle.firstRegistrationDate, vehicle.releaseDate, vehicle.year, matchValue(html, /(?:Erstzulassung|Baujahr|EZ)[^0-9]{0,30}((?:\d{1,2}[.\/-])?\d{4})/i));
  const image = firstValue(imageFrom(vehicle.image), imageFrom(vehicle.images), imageFrom(vehicle.media), metadata['og:image']);
  const equipmentText = firstValue(vehicle.description, metadata.description, metadata['og:description']);
  const result = {
    brand: textOnly(String(firstValue(vehicle.brand, vehicle.make, vehicle.manufacturer, vehicle.manufacturerName, metadata['vehicle:make']) || titleParts[0] || '')),
    model: textOnly(String(firstValue(vehicle.model, vehicle.vehicleModel, vehicle.modelDescription, vehicle.modelName, metadata['vehicle:model']) || titleParts.slice(1, 3).join(' ') || '')),
    year: Number(String(production).match(/(19|20)\d{2}/)?.[0] || 0),
    mileage: numberFrom(mileage), ps: psFromPower(power, powerUnit), askingPrice: numberFrom(price),
    fuel: textOnly(String(firstValue(vehicle.fuelType, vehicle.fuel, engine.fuelType, metadata['vehicle:fuel']) || '')),
    gearbox: textOnly(String(firstValue(vehicle.vehicleTransmission, vehicle.transmission, vehicle.gearbox, vehicle.transmissionType, metadata['vehicle:transmission']) || '')),
    color: textOnly(String(firstValue(vehicle.color, vehicle.exteriorColor, metadata['vehicle:color']) || '')),
    body: textOnly(String(firstValue(vehicle.bodyType, vehicle.body, vehicle.vehicleConfiguration, metadata['vehicle:body']) || '')),
    photo: typeof image === 'string' && /^https:\/\//i.test(image) ? image : '',
    notes: `Aus Inserat importiert${equipmentText ? `: ${textOnly(String(equipmentText)).slice(0, 700)}` : ''}`,
    sourceUrl, importedAt: new Date().toISOString(),
  };
  const warnings: string[] = [];
  if (!result.brand || !result.model) warnings.push('Marke oder Modell konnten nicht sicher erkannt werden. Bitte prüfen.');
  if (!result.askingPrice) warnings.push('Kein Preis gefunden. Bitte manuell ergänzen.');
  if (!result.mileage) warnings.push('Kein Kilometerstand gefunden. Bitte manuell ergänzen.');
  return { vehicle: result, warnings };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Methode nicht erlaubt.' }, 405);
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return response({ error: 'Bitte erneut anmelden.' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', projectApiKey(), {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return response({ error: 'Bitte erneut anmelden.' }, 401);
    const { data: member, error: memberError } = await supabase.from('av_workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle();
    if (memberError || !member) return response({ error: 'Kein gemeinsamer Bereich für dieses Konto gefunden.' }, 403);
    const { url } = await request.json();
    const listing = await readPublicListing(await validatePublicUrl(url));
    return response(extractVehicle(listing.html, listing.url));
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Das Inserat konnte nicht gelesen werden.' }, 400);
  }
});
