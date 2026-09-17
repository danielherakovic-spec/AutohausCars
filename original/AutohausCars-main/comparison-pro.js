(() => {
  'use strict';

  let api;
  let selectedLeft = '';
  let selectedRight = '';
  const number = value => Number(value || 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const money = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(number(value));
  const integer = value => number(value).toLocaleString('de-DE', { maximumFractionDigits: 0 });
  const vehicleName = vehicle => [vehicle?.brand, vehicle?.model, vehicle?.series].filter(Boolean).join(' ') || 'Unbekanntes Fahrzeug';
  const round50 = value => Math.max(0, Math.round(number(value) / 50) * 50);
  const median = values => {
    const sorted = values.map(number).filter(value => value > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  const defectCosts = [
    [/motor|motorschaden|steuerkette|zylinderkopf/i, 'Motor / Steuertrieb', 2500],
    [/getriebe|dsg|automatik/i, 'Getriebe', 1800],
    [/kupplung|zweimassen/i, 'Kupplung / Zweimassenschwungrad', 950],
    [/turbo|turbolader/i, 'Turbolader', 1200],
    [/hu|tüv|hauptuntersuchung/i, 'HU / TÜV', 250],
    [/reifen|bereifung|profil/i, 'Reifen', 520],
    [/bremse|bremsen|scheiben/i, 'Bremsanlage', 580],
    [/kratzer|lack|lackierung/i, 'Lackarbeiten', 500],
    [/delle|beule|hagel/i, 'Dellen / Karosserie', 350],
    [/stoßfänger|stossfänger|stoßstange|stossstange/i, 'Stoßfänger', 450],
    [/klima|klimaanlage|kompressor/i, 'Klimaanlage', 480],
    [/service|inspektion|wartung/i, 'Service / Inspektion', 380],
    [/scheibe|windschutzscheibe|steinschlag/i, 'Verglasung', 600],
    [/batterie|akku/i, 'Batterie', 210],
    [/scheinwerfer|leuchte|licht/i, 'Beleuchtung', 260],
    [/innenraum|polster|sitz|geruch/i, 'Innenraumaufbereitung', 220],
    [/stoßdämpfer|stossdämpfer|fahrwerk|feder|querlenker/i, 'Fahrwerk', 700],
    [/rost|korrosion/i, 'Korrosion', 800],
    [/unfall|rahmen|struktur/i, 'Unfall- / Strukturrisiko', 2000],
    [/elektronik|steuergerät|display|sensor/i, 'Elektronik', 450],
  ];

  function defectLines(vehicle) {
    const explicit = String(vehicle?.defects || '').split(/\n|,|;/).map(value => value.trim()).filter(Boolean);
    const narrative = [vehicle?.notes, vehicle?.description]
      .filter(Boolean)
      .flatMap(value => String(value).split(/\n|[.;]/))
      .map(value => value.trim())
      .filter(Boolean)
      .filter(value => !/\b(?:kein|keine|keinen|ohne|mängelfrei|unfallfrei|neu)\b/i.test(value))
      .filter(value => defectCosts.some(([pattern]) => pattern.test(value)) || /mangel|defekt|schaden|reparatur|prüfen|erneuern|fehlt|verschlissen|funktioniert nicht/i.test(value));
    const seen = new Set();
    return explicit.concat(narrative).filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function refurbishment(vehicle) {
    const lines = defectLines(vehicle);
    const items = [];
    const used = new Set();
    lines.forEach(line => {
      const match = defectCosts.find(([pattern, label]) => pattern.test(line) && !used.has(label));
      if (match) {
        used.add(match[1]);
        items.push({ label: match[1], amount: match[2], source: line });
      } else {
        items.push({ label: 'Nicht näher bezifferter Hinweis', amount: 300, source: line });
      }
    });
    const conditions = [
      ['Gesamtzustand reparaturbedürftig', vehicle?.conditionOverall === 'Reparaturbedürftig', 900],
      ['Karosserie / Lack mit Schäden', vehicle?.bodyCondition === 'Schäden vorhanden', 750],
      ['Karosserie mit Gebrauchsspuren', vehicle?.bodyCondition === 'Gebrauchsspuren', 250],
      ['Innenraumaufbereitung', vehicle?.interiorCondition === 'Aufbereitung nötig', 220],
      ['Technische Reparaturreserve', vehicle?.technicalCondition === 'Reparatur einplanen', 900],
      ['Nicht fahrbereit', vehicle?.technicalCondition === 'Nicht fahrbereit', 1800],
      ['Reifen bald erneuern', vehicle?.tiresCondition === 'Bald erneuern', 300],
      ['Reifen erneuern', vehicle?.tiresCondition === 'Erneuern', 520],
    ];
    conditions.forEach(([label, active, amount]) => { if (active && !used.has(label)) items.push({ label, amount, source: 'Zustandsfeld' }); });
    const calculated = items.reduce((sum, item) => sum + item.amount, 0);
    const manual = number(vehicle?.repairCost);
    if (manual > calculated) items.push({ label: 'Manuell hinterlegte Reparaturkosten', amount: manual - calculated, source: 'Preisdaten' });
    const total = Math.max(calculated, manual);
    return { total: round50(total), items, lines };
  }

  function comparableVehicles(vehicle, vehicles) {
    const exact = vehicles.filter(item => item.id !== vehicle.id && String(item.brand || '').toLowerCase() === String(vehicle.brand || '').toLowerCase() && String(item.model || '').toLowerCase() === String(vehicle.model || '').toLowerCase());
    if (exact.length) return exact;
    const sameBrand = vehicles.filter(item => item.id !== vehicle.id && String(item.brand || '').toLowerCase() === String(vehicle.brand || '').toLowerCase());
    return sameBrand.length ? sameBrand : vehicles.filter(item => item.id !== vehicle.id);
  }

  function analyze(vehicle, vehicles) {
    const peers = comparableVehicles(vehicle, vehicles);
    const peerPrices = peers.map(item => number(item.soldPrice) || number(item.desiredSalePrice) || number(item.askingPrice)).filter(Boolean);
    const peerYears = peers.map(item => number(item.year)).filter(Boolean);
    const peerMileages = peers.map(item => number(item.mileage)).filter(Boolean);
    const peerEquipment = peers.map(item => (item.equipment || []).length);
    const internalMedian = median(peerPrices);
    const ownAnchor = number(vehicle.soldPrice) || number(vehicle.desiredSalePrice) || number(vehicle.askingPrice) || number(vehicle.purchasePrice) * 1.2;
    const basis = internalMedian || ownAnchor;
    const yearAdjustment = peerYears.length ? clamp((number(vehicle.year) - median(peerYears)) * 250, -2500, 2500) : 0;
    const mileageAdjustment = peerMileages.length ? clamp((median(peerMileages) - number(vehicle.mileage)) / 10000 * 160, -2800, 2800) : 0;
    const equipmentAdjustment = peerEquipment.length ? clamp(((vehicle.equipment || []).length - median(peerEquipment)) * 90, -1000, 1400) : Math.min(900, (vehicle.equipment || []).length * 40);
    const descriptionAdjustment = vehicle.description && String(vehicle.description).trim().length >= 80 ? 250 : 0;
    const refurb = refurbishment(vehicle);
    const optimalSale = round50(basis + yearAdjustment + mileageAdjustment + equipmentAdjustment + descriptionAdjustment);
    const operationalCosts = ['transportCost', 'registrationCost', 'cleaningCost', 'listingCost', 'otherCost', 'taxes'].reduce((sum, key) => sum + number(vehicle[key]), 0);
    const targetMargin = round50(Math.max(1500, optimalSale * 0.15));
    const optimalPurchase = round50(optimalSale - refurb.total - operationalCosts - targetMargin);
    const offer = number(vehicle.askingPrice) || number(vehicle.targetPrice) || number(vehicle.purchasePrice);
    const expectedMargin = optimalSale - (offer || optimalPurchase) - refurb.total - operationalCosts;
    const purchaseRatio = optimalPurchase > 0 && offer > 0 ? offer / optimalPurchase : 1;
    const position = !offer ? 'Preis offen' : purchaseRatio <= 1 ? 'Attraktiv' : purchaseRatio <= 1.08 ? 'Verhandelbar' : 'Zu hoch';
    const positionTone = !offer ? 'neutral' : purchaseRatio <= 1 ? 'good' : purchaseRatio <= 1.08 ? 'medium' : 'bad';

    const pricePoints = !offer || !optimalPurchase ? 15 : Math.round(clamp(30 - Math.max(0, purchaseRatio - 0.85) * 80, 0, 30));
    const marginRatio = optimalSale > 0 ? expectedMargin / optimalSale : 0;
    const marginPoints = Math.round(clamp(marginRatio * 125, 0, 25));
    const conditionPoints = Math.round(clamp(20 - (optimalSale ? refurb.total / optimalSale * 100 : 10), 0, 20));
    const equipmentPoints = Math.round(clamp((vehicle.equipment || []).length * .65, 0, 10));
    const documentationPoints = [vehicle.description, vehicle.notes, vehicle.sourceUrl, vehicle.vehicleNumber].filter(value => String(value || '').trim()).length * 1.25;
    const ageMileagePoints = Math.round(clamp(10 - Math.max(0, number(vehicle.mileage) - 100000) / 25000 - Math.max(0, new Date().getFullYear() - number(vehicle.year) - 10) * .6, 0, 10));
    const components = [
      { label: 'Preisposition', points: pricePoints, max: 30, reason: offer ? 'Angebot ' + money(offer) + ' gegenüber optimalem Ankauf ' + money(optimalPurchase) + '.' : 'Kein Angebotspreis hinterlegt; neutrale Zwischenwertung.' },
      { label: 'Erwartete Marge', points: marginPoints, max: 25, reason: 'Interne Marge nach Aufbereitung und Nebenkosten: ' + money(expectedMargin) + '.' },
      { label: 'Zustand & Mängel', points: conditionPoints, max: 20, reason: 'Geschätzte Aufbereitung: ' + money(refurb.total) + ' aus ' + (refurb.items.length || 'keinen') + ' erkannten Positionen.' },
      { label: 'Ausstattung', points: equipmentPoints, max: 10, reason: (vehicle.equipment || []).length + ' erfasste Ausstattungsmerkmale.' },
      { label: 'Dokumentation', points: documentationPoints, max: 5, reason: 'Beschreibung, Notizen, Quelle und Fahrzeugnummer werden auf Vollständigkeit geprüft.' },
      { label: 'Alter & Laufleistung', points: ageMileagePoints, max: 10, reason: integer(vehicle.mileage) + ' km und Baujahr ' + (vehicle.year || 'offen') + '.' },
    ];
    const score = Math.round(clamp(components.reduce((sum, item) => sum + item.points, 0), 0, 100));
    const rating = score >= 80 ? 'Sehr stark' : score >= 65 ? 'Stark' : score >= 50 ? 'Solide' : score >= 35 ? 'Prüfen' : 'Kritisch';
    const priceReasons = [
      peerPrices.length ? 'Interner Vergleichsmedian aus ' + peerPrices.length + ' passenden gespeicherten Fahrzeugen: ' + money(internalMedian) + '.' : 'Keine passende externe Marktquelle verbunden; Grundlage sind die eigenen hinterlegten Preise: ' + money(ownAnchor) + '.',
      'Baujahrkorrektur: ' + money(yearAdjustment) + '; Laufleistungskorrektur: ' + money(mileageAdjustment) + '.',
      'Ausstattungskorrektur: ' + money(equipmentAdjustment) + '; vollständige Beschreibung: ' + money(descriptionAdjustment) + '.',
      'Optimaler Verkauf nach interner Datenlage: ' + money(optimalSale) + '.',
      'Davon abgezogen: ' + money(refurb.total) + ' Aufbereitung, ' + money(operationalCosts) + ' Nebenkosten und ' + money(targetMargin) + ' Zielmarge.',
      'Daraus ergibt sich ein optimaler Ankauf von ' + money(optimalPurchase) + (offer ? '; das aktuelle Angebot liegt ' + money(Math.abs(offer - optimalPurchase)) + (offer <= optimalPurchase ? ' darunter.' : ' darüber.') : '.'),
    ];
    return { peers, internalMedian, yearAdjustment, mileageAdjustment, equipmentAdjustment, descriptionAdjustment, refurb, operationalCosts, targetMargin, optimalSale, optimalPurchase, offer, expectedMargin, position, positionTone, components, score, rating, priceReasons };
  }

  function optionList(vehicles, selected) {
    return '<option value="">Fahrzeug wählen</option>' + vehicles.map(vehicle => '<option value="' + esc(vehicle.id) + '"' + (vehicle.id === selected ? ' selected' : '') + '>' + esc(vehicleName(vehicle)) + ' · ' + esc(vehicle.year || 'Baujahr offen') + '</option>').join('');
  }

  function notesText(vehicle) {
    const history = (vehicle.noteHistory || []).slice(-3).map(note => note.text).filter(Boolean);
    return [vehicle.notes].concat(history).filter(Boolean).join(' · ') || 'Keine Notizen hinterlegt.';
  }

  function analysisCard(vehicle, analysis, side) {
    const scoreClass = analysis.score >= 65 ? 'good' : analysis.score < 40 ? 'bad' : '';
    const refurbRows = analysis.refurb.items.length ? analysis.refurb.items.map(item => '<li><span>' + esc(item.label) + '<small>' + esc(item.source) + '</small></span><b>' + money(item.amount) + '</b></li>').join('') : '<li><span>Keine Mängelposition erkannt</span><b>' + money(0) + '</b></li>';
    return '<article class="card compare-pro-card" data-side="' + side + '">' +
      '<div class="compare-pro-heading"><div><span class="ops-eyebrow">Fahrzeug ' + (side === 'left' ? 'A' : 'B') + '</span><h2>' + esc(vehicleName(vehicle)) + '</h2><p class="muted">' + esc(vehicle.year || 'Baujahr offen') + ' · ' + integer(vehicle.mileage) + ' km · ' + esc(vehicle.status || 'Status offen') + '</p></div><span class="ops-score ' + scoreClass + '">' + analysis.score + '/100</span></div>' +
      '<div class="compare-pro-prices"><div><span>Optimaler Ankauf</span><b>' + money(analysis.optimalPurchase) + '</b></div><div><span>Optimaler Verkauf</span><b>' + money(analysis.optimalSale) + '</b></div><div><span>Aufbereitung</span><b>' + money(analysis.refurb.total) + '</b></div></div>' +
      '<div class="compare-pro-badges"><span class="position ' + analysis.positionTone + '">' + esc(analysis.position) + '</span><span>' + esc(analysis.rating) + '</span></div>' +
      '<details class="calculation"><summary>Warum diese Preisposition?</summary><ol>' + analysis.priceReasons.map(reason => '<li>' + esc(reason) + '</li>').join('') + '</ol></details>' +
      '<details class="calculation"><summary>Warum dieses Rating?</summary><div class="score-breakdown">' + analysis.components.map(item => '<div><span><b>' + esc(item.label) + '</b><small>' + esc(item.reason) + '</small></span><strong>' + integer(item.points) + '/' + item.max + '</strong></div>').join('') + '</div></details>' +
      '<details class="calculation"><summary>Aufbereitungskosten im Detail</summary><ul class="cost-lines">' + refurbRows + '</ul></details>' +
    '</article>';
  }

  function betterClass(left, right, preference) {
    if (!left || !right || left === right) return '';
    const leftWins = preference === 'low' ? left < right : left > right;
    return leftWins ? 'is-better' : 'is-weaker';
  }

  function tableRow(label, left, right, classes = ['', '']) {
    return '<tr><th>' + esc(label) + '</th><td class="' + classes[0] + '">' + left + '</td><td class="' + classes[1] + '">' + right + '</td></tr>';
  }

  function comparisonTable(left, right, leftAnalysis, rightAnalysis) {
    const priceClasses = [betterClass(leftAnalysis.optimalPurchase, rightAnalysis.optimalPurchase, 'low'), betterClass(rightAnalysis.optimalPurchase, leftAnalysis.optimalPurchase, 'low')];
    const saleClasses = [betterClass(leftAnalysis.optimalSale, rightAnalysis.optimalSale, 'high'), betterClass(rightAnalysis.optimalSale, leftAnalysis.optimalSale, 'high')];
    const prepClasses = [betterClass(leftAnalysis.refurb.total, rightAnalysis.refurb.total, 'low'), betterClass(rightAnalysis.refurb.total, leftAnalysis.refurb.total, 'low')];
    const scoreClasses = [betterClass(leftAnalysis.score, rightAnalysis.score, 'high'), betterClass(rightAnalysis.score, leftAnalysis.score, 'high')];
    const mileageClasses = [betterClass(number(left.mileage), number(right.mileage), 'low'), betterClass(number(right.mileage), number(left.mileage), 'low')];
    return '<section class="section"><div class="section-heading"><div><h2>Direkter Vergleich</h2><p class="muted">Grün markiert den rechnerisch günstigeren Wert innerhalb dieser beiden Fahrzeugakten.</p></div></div><div class="comparison-table-wrap"><table class="comparison-table compare-pro-table"><thead><tr><th>Kriterium</th><th>' + esc(vehicleName(left)) + '</th><th>' + esc(vehicleName(right)) + '</th></tr></thead><tbody>' +
      tableRow('Optimaler Ankauf', money(leftAnalysis.optimalPurchase), money(rightAnalysis.optimalPurchase), priceClasses) +
      tableRow('Optimaler Verkauf', money(leftAnalysis.optimalSale), money(rightAnalysis.optimalSale), saleClasses) +
      tableRow('Aufbereitung', money(leftAnalysis.refurb.total), money(rightAnalysis.refurb.total), prepClasses) +
      tableRow('Aktueller Angebotspreis', money(left.askingPrice), money(right.askingPrice)) +
      tableRow('Hinterlegter Einkauf', money(left.purchasePrice), money(right.purchasePrice)) +
      tableRow('Verhandlung / Zielpreis', money(left.targetPrice), money(right.targetPrice)) +
      tableRow('Gewünschter Verkauf', money(left.desiredSalePrice), money(right.desiredSalePrice)) +
      tableRow('Weitere Nebenkosten', money(leftAnalysis.operationalCosts), money(rightAnalysis.operationalCosts), [betterClass(leftAnalysis.operationalCosts, rightAnalysis.operationalCosts, 'low'), betterClass(rightAnalysis.operationalCosts, leftAnalysis.operationalCosts, 'low')]) +
      tableRow('Rating', leftAnalysis.score + '/100 · ' + esc(leftAnalysis.rating), rightAnalysis.score + '/100 · ' + esc(rightAnalysis.rating), scoreClasses) +
      tableRow('Preisposition', esc(leftAnalysis.position), esc(rightAnalysis.position)) +
      tableRow('Baureihe / Generation', esc([left.series, left.generation].filter(Boolean).join(' · ') || '–'), esc([right.series, right.generation].filter(Boolean).join(' · ') || '–')) +
      tableRow('Erstzulassung', esc(left.registration || '–'), esc(right.registration || '–')) +
      tableRow('Baujahr', esc(left.year || '–'), esc(right.year || '–')) +
      tableRow('Kilometer', integer(left.mileage) + ' km', integer(right.mileage) + ' km', mileageClasses) +
      tableRow('Leistung', esc([left.kw ? left.kw + ' kW' : '', left.ps ? left.ps + ' PS' : ''].filter(Boolean).join(' / ') || '–'), esc([right.kw ? right.kw + ' kW' : '', right.ps ? right.ps + ' PS' : ''].filter(Boolean).join(' / ') || '–')) +
      tableRow('Motor', esc([left.displacement ? integer(left.displacement) + ' cm³' : '', left.cylinders ? left.cylinders + ' Zylinder' : '', left.engineCode || ''].filter(Boolean).join(' · ') || '–'), esc([right.displacement ? integer(right.displacement) + ' cm³' : '', right.cylinders ? right.cylinders + ' Zylinder' : '', right.engineCode || ''].filter(Boolean).join(' · ') || '–')) +
      tableRow('Kraftstoff', esc(left.fuel || '–'), esc(right.fuel || '–')) +
      tableRow('Getriebe', esc(left.gearbox || '–'), esc(right.gearbox || '–')) +
      tableRow('Antrieb', esc(left.drive || '–'), esc(right.drive || '–')) +
      tableRow('Karosserie', esc(left.body || '–'), esc(right.body || '–')) +
      tableRow('Farbe', esc([left.color, left.manufacturerColor].filter(Boolean).join(' · ') || '–'), esc([right.color, right.manufacturerColor].filter(Boolean).join(' · ') || '–')) +
      tableRow('Innenausstattung', esc(left.interior || '–'), esc(right.interior || '–')) +
      tableRow('Sitze / Türen', esc([left.seats ? left.seats + ' Sitze' : '', left.doors ? left.doors + ' Türen' : ''].filter(Boolean).join(' · ') || '–'), esc([right.seats ? right.seats + ' Sitze' : '', right.doors ? right.doors + ' Türen' : ''].filter(Boolean).join(' · ') || '–')) +
      tableRow('Halter / Herkunft', esc([left.owners ? left.owners + ' Halter' : '', left.origin || ''].filter(Boolean).join(' · ') || '–'), esc([right.owners ? right.owners + ' Halter' : '', right.origin || ''].filter(Boolean).join(' · ') || '–')) +
      tableRow('Euro-Norm / Umwelt', esc([left.euroNorm, left.environmentalBadge].filter(Boolean).join(' · ') || '–'), esc([right.euroNorm, right.environmentalBadge].filter(Boolean).join(' · ') || '–')) +
      tableRow('HU / TÜV', esc([left.inspection, left.inspectionStatus].filter(Boolean).join(' · ') || '–'), esc([right.inspection, right.inspectionStatus].filter(Boolean).join(' · ') || '–')) +
      tableRow('Verfügbarkeit / Ort', esc([left.availability, left.location].filter(Boolean).join(' · ') || '–'), esc([right.availability, right.location].filter(Boolean).join(' · ') || '–')) +
      tableRow('Zustand', esc([left.conditionOverall, left.bodyCondition, left.interiorCondition, left.technicalCondition, left.tiresCondition].filter(Boolean).join(' · ') || '–'), esc([right.conditionOverall, right.bodyCondition, right.interiorCondition, right.technicalCondition, right.tiresCondition].filter(Boolean).join(' · ') || '–')) +
      tableRow('Nachweise', esc([left.accidentFree ? 'Unfallfrei' : '', left.serviceBook ? 'Scheckheft' : '', left.nonSmoker ? 'Nichtraucher' : '', left.keyCount ? left.keyCount + ' Schlüssel' : ''].filter(Boolean).join(' · ') || '–'), esc([right.accidentFree ? 'Unfallfrei' : '', right.serviceBook ? 'Scheckheft' : '', right.nonSmoker ? 'Nichtraucher' : '', right.keyCount ? right.keyCount + ' Schlüssel' : ''].filter(Boolean).join(' · ') || '–')) +
      tableRow('Ausstattung', esc((left.equipment || []).join(', ') || 'Keine erfasst'), esc((right.equipment || []).join(', ') || 'Keine erfasst')) +
      tableRow('Mängel', esc(defectLines(left).join(' · ') || 'Keine erfasst'), esc(defectLines(right).join(' · ') || 'Keine erfasst')) +
      tableRow('Fahrzeugbeschreibung', esc(left.description || 'Keine Beschreibung hinterlegt.'), esc(right.description || 'Keine Beschreibung hinterlegt.')) +
      tableRow('Notizen & Verlauf', esc(notesText(left)), esc(notesText(right))) +
      tableRow('Inseratquelle', esc([left.listingSource, left.sourceUrl].filter(Boolean).join(' · ') || '–'), esc([right.listingSource, right.sourceUrl].filter(Boolean).join(' · ') || '–')) +
      tableRow('Fahrzeugnummer', esc(left.vehicleNumber || '–'), esc(right.vehicleNumber || '–')) +
    '</tbody></table></div></section>';
  }

  function render() {
    const container = document.getElementById('compare-pro-content');
    if (!container || !api) return;
    const vehicles = api.vehicles();
    if (!vehicles.some(vehicle => vehicle.id === selectedLeft)) selectedLeft = vehicles[0]?.id || '';
    if (!vehicles.some(vehicle => vehicle.id === selectedRight) || selectedRight === selectedLeft) selectedRight = vehicles.find(vehicle => vehicle.id !== selectedLeft)?.id || '';
    const left = vehicles.find(vehicle => vehicle.id === selectedLeft);
    const right = vehicles.find(vehicle => vehicle.id === selectedRight);
    const selector = '<div class="card form-card compare-pro-selector"><div class="section-heading"><div><h2>Zwei Fahrzeuge auswählen</h2><p class="muted">Die Werte werden sofort neu berechnet. Es wird nichts automatisch gespeichert.</p></div><span class="ops-chip">Interne Entscheidungshilfe</span></div><div class="form-grid"><label>Fahrzeug A<select id="compare-pro-left">' + optionList(vehicles, selectedLeft) + '</select></label><label>Fahrzeug B<select id="compare-pro-right">' + optionList(vehicles, selectedRight) + '</select></label></div></div>';
    if (vehicles.length < 2) {
      container.innerHTML = selector + '<div class="card ops-empty compare-pro-empty"><h2>Mindestens zwei Fahrzeuge benötigt</h2><p>Füge ein weiteres Fahrzeug hinzu, damit CarsAutoHaus beide Akten nebeneinander vergleichen kann.</p><button class="primary" data-go="form">Fahrzeug hinzufügen</button></div>';
      return;
    }
    const leftAnalysis = analyze(left, vehicles);
    const rightAnalysis = analyze(right, vehicles);
    container.innerHTML = selector + '<div class="compare-pro-grid">' + analysisCard(left, leftAnalysis, 'left') + analysisCard(right, rightAnalysis, 'right') + '</div>' + comparisonTable(left, right, leftAnalysis, rightAnalysis) + '<div class="ops-alert compare-pro-disclaimer">Die Preis- und Ratingwerte beruhen ausschließlich auf deinen gespeicherten Fahrzeugdaten und festen internen Reserven. Ohne offizielle Portal- oder Marktdaten sind sie eine nachvollziehbare Kalkulationshilfe, keine Marktwertgarantie. Technische Prüfung, Historie und Unterlagen bleiben erforderlich.</div>';
  }

  function inject() {
    const app = document.querySelector('.app');
    if (!app || document.getElementById('compare-pro-view')) return;
    app.insertAdjacentHTML('beforeend', '<section id="compare-pro-view" class="view"><div class="hero"><div><span class="hero-kicker">Entscheidungszentrale</span><h1>Vergleich Pro</h1><p class="subtitle">Zwei Fahrzeuge vollständig nebeneinander – mit Preislogik, Mängeln, Aufbereitung, Beschreibung und Notizen.</p></div><button class="secondary" data-ops-go="procurement">Zum Ankauf</button></div><div id="compare-pro-content"></div></section>');
  }

  function openComparison() {
    api.go('compare-pro');
    render();
  }

  function bind() {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-compare-go]');
      if (!trigger) return;
      event.preventDefault();
      openComparison();
    });
    document.addEventListener('change', event => {
      if (event.target.id === 'compare-pro-left') { selectedLeft = event.target.value; if (selectedLeft === selectedRight) selectedRight = ''; render(); }
      if (event.target.id === 'compare-pro-right') { selectedRight = event.target.value; if (selectedRight === selectedLeft) selectedLeft = ''; render(); }
    });
    document.addEventListener('autovalue:view-changed', event => { if (event.detail?.view === 'compare-pro') render(); });
    document.addEventListener('carsautohaus:operations-updated', () => { if (document.getElementById('compare-pro-view')?.classList.contains('active')) render(); });
  }

  function start() {
    api = window.CarsAutoHaus;
    if (!api) return;
    inject();
    bind();
  }

  if (window.CarsAutoHaus) start();
  else document.addEventListener('carsautohaus:ready', start, { once: true });
})();
