(() => {
  'use strict';

  const form = document.getElementById('vehicle-form');
  const dataInput = document.getElementById('listing-data-paste');
  const equipmentInput = document.getElementById('equipment-data-paste');
  const status = document.getElementById('paste-import-status');
  if (!form || !dataInput || !equipmentInput || !status) return;

  const labelAliases = new Map(Object.entries({
    'kilometerstand': 'mileage', 'kilometer': 'mileage',
    'leistung': 'power', 'kraftstoffart': 'fuel', 'kraftstoff': 'fuel',
    'getriebe': 'gearbox', 'erstzulassung': 'registration',
    'fahrzeughalter': 'owners', 'anzahl der fahrzeughalter': 'owners', 'anzahl fahrzeughalter': 'owners',
    'fahrzeugzustand': 'condition', 'kategorie': 'body', 'fahrzeugnummer': 'vehicleNumber',
    'verfügbarkeit': 'availability', 'herkunft': 'origin', 'hubraum': 'displacement',
    'antriebsart': 'drive', 'anzahl sitzplätze': 'seats', 'anzahl der sitzplätze': 'seats',
    'anzahl der türen': 'doors', 'anzahl türen': 'doors', 'schadstoffklasse': 'euroNorm',
    'umweltplakette': 'environmentalBadge', 'hu': 'inspectionStatus', 'klimatisierung': 'climate',
    'airbags': 'airbags', 'farbe (hersteller)': 'manufacturerColor', 'farbe hersteller': 'manufacturerColor',
    'farbe': 'color', 'innenausstattung': 'interior', 'zylinder': 'cylinders',
    'marke': 'brand', 'hersteller': 'brand', 'modell': 'model', 'baureihe': 'series',
    'generation': 'generation', 'baujahr': 'year', 'co₂-emissionen': 'co2', 'co2-emissionen': 'co2',
    'verbrauch': 'consumption', 'motorcode': 'engineCode'
  }));

  const clean = value => String(value || '').replace(/^[\s•·▪◦*-]+/, '').trim();
  const key = value => clean(value).toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  const digits = value => {
    const match = String(value || '').match(/\d[\d.\s]*/);
    return match ? Number(match[0].replace(/[.\s]/g, '')) : 0;
  };
  const decimal = value => {
    const match = String(value || '').match(/\d[\d.\s]*(?:,\d+)?/);
    return match ? Number(match[0].replace(/[.\s]/g, '').replace(',', '.')) : 0;
  };

  function setField(name, value) {
    const field = form.elements[name];
    if (!field || value === '' || value === null || value === undefined) return false;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function readBlocks(text) {
    const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    const blocks = {};
    let current = '';
    lines.forEach(line => {
      const mapped = labelAliases.get(key(line));
      if (mapped) { current = mapped; return; }
      if (!current || /^(technische daten|besondere merkmale laut händler|ausstattung)$/i.test(line)) return;
      if (!blocks[current]) blocks[current] = line;
    });
    return blocks;
  }

  function importVehicleData() {
    const values = readBlocks(dataInput.value);
    let count = 0;
    const assign = (name, value) => { if (setField(name, value)) count += 1; };
    ['brand', 'model', 'series', 'generation', 'body', 'fuel', 'vehicleNumber', 'availability', 'origin', 'drive', 'doors', 'euroNorm', 'environmentalBadge', 'inspectionStatus', 'manufacturerColor', 'color', 'interior', 'engineCode'].forEach(name => assign(name, values[name]));
    ['mileage', 'owners', 'displacement', 'seats', 'cylinders', 'co2'].forEach(name => { if (values[name]) assign(name, digits(values[name])); });
    if (values.consumption) assign('consumption', decimal(values.consumption));
    if (values.power) {
      const kw = values.power.match(/(\d+)\s*kW/i);
      const ps = values.power.match(/(\d+)\s*PS/i);
      if (kw) assign('kw', Number(kw[1]));
      if (ps) assign('ps', Number(ps[1]));
    }
    if (values.registration) {
      const match = values.registration.match(/(\d{1,2})[./-](\d{4})/);
      if (match) { assign('registration', match[2] + '-' + match[1].padStart(2, '0')); assign('year', Number(match[2])); }
    } else if (values.year) assign('year', digits(values.year));
    if (values.gearbox) assign('gearbox', /schalt|manuell/i.test(values.gearbox) ? 'Handschaltung' : /dsg/i.test(values.gearbox) ? 'DSG' : /automatik/i.test(values.gearbox) ? 'Automatik' : 'Sonstiges');
    if (values.condition) {
      if (/reparatur/i.test(values.condition)) assign('conditionOverall', 'Reparaturbedürftig');
      else if (/gebraucht/i.test(values.condition)) assign('conditionOverall', 'Gebraucht');
      else if (/sehr gut/i.test(values.condition)) assign('conditionOverall', 'Sehr gut');
      else if (/gut/i.test(values.condition)) assign('conditionOverall', 'Gut');
      if (/unfallfrei/i.test(values.condition) && form.elements.accidentFree) form.elements.accidentFree.checked = true;
    }
    const climate = values.climate || '';
    if (/klimaautomatik/i.test(climate)) checkEquipment('Klimaautomatik');
    else if (/klima/i.test(climate)) checkEquipment('Klima');
    document.dispatchEvent(new CustomEvent('autovalue:form-filled'));
    return count;
  }

  const equipmentAliases = {
    'elektr fensterheber': 'Elektrische Fensterheber', 'elektrische fensterheber': 'Elektrische Fensterheber',
    'elektr seitenspiegel': 'Elektrische Seitenspiegel', 'elektrische seitenspiegel': 'Elektrische Seitenspiegel',
    'geschwindigkeitsbegrenzer': 'Geschwindigkeitsbegrenzer', 'multifunktionslenkrad': 'Multifunktionslenkrad',
    'reifendruckkontrolle': 'Reifendruckkontrolle', 'scheckheftgepflegt': 'Scheckheft',
    'nichtraucher fahrzeug': 'Nichtraucher', 'start stopp automatik': 'Start-Stopp',
    'tuner radio': 'Radio', 'spurhalteassistent': 'Spurhalteassistent', 'isofix': 'Isofix'
  };

  function normaliseEquipment(value) {
    return key(value).replace(/[+&/().]/g, ' ').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function checkEquipment(label) {
    if (label === 'Scheckheft') { form.elements.serviceBook.checked = true; return true; }
    if (label === 'Nichtraucher') { form.elements.nonSmoker.checked = true; return true; }
    const wanted = normaliseEquipment(label);
    const checkbox = [...form.querySelectorAll('input[name="equipment"]')].find(input => normaliseEquipment(input.value) === wanted);
    if (!checkbox) return false;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function importEquipment() {
    const search = document.getElementById('equipment-search');
    if (search?.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    const lines = String(equipmentInput.value || '').split(/\r?\n/).map(clean).filter(line => line && !/^ausstattung$/i.test(line));
    let checked = 0;
    const unknown = [];
    lines.forEach(line => {
      const normalised = normaliseEquipment(line);
      const mapped = equipmentAliases[normalised] || line;
      if (checkEquipment(mapped)) checked += 1;
      else unknown.push(line);
    });
    return { checked, unknown };
  }

  function showResult(fields, equipment) {
    const parts = [];
    if (fields !== null) parts.push(fields + ' Fahrzeugfelder übernommen');
    if (equipment) parts.push(equipment.checked + ' Ausstattungen abgehakt');
    if (equipment?.unknown.length) parts.push(equipment.unknown.length + ' Angaben nicht zugeordnet');
    status.textContent = parts.join(' · ') + '. Bitte Angaben prüfen und erst danach das Fahrzeug speichern.';
  }

  document.getElementById('parse-listing-data').addEventListener('click', () => showResult(importVehicleData(), null));
  document.getElementById('parse-equipment-data').addEventListener('click', () => showResult(null, importEquipment()));
  document.getElementById('parse-all-data').addEventListener('click', () => showResult(importVehicleData(), importEquipment()));
})();
