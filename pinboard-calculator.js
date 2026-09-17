/* Small arithmetic parser: no eval, Function constructor or executable input. */
(function(scope) {
  'use strict';
  function calculate(input) {
    const text = String(input).replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
    if (!text || text.length > 250) throw new Error('Bitte eine Rechnung eingeben (max. 250 Zeichen).');
    let pos = 0;
    function primary() {
      if (text[pos] === '+' || text[pos] === '-') { const negative = text[pos++] === '-'; return (negative ? -1 : 1) * primary(); }
      let value;
      if (text[pos] === '(') { pos++; value = sum(); if (text[pos++] !== ')') throw new Error('Klammer fehlt.'); }
      else { const match = text.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)/); if (!match) throw new Error('Rechnung prüfen.'); pos += match[0].length; value = Number(match[0]); }
      while (text[pos] === '%') { value /= 100; pos++; }
      return value;
    }
    function product() { let value = primary(); while (text[pos] === '*' || text[pos] === '/') { const op = text[pos++], other = primary(); if (op === '/' && other === 0) throw new Error('Division durch 0 ist nicht möglich.'); value = op === '*' ? value * other : value / other; } return value; }
    function sum() { let value = product(); while (text[pos] === '+' || text[pos] === '-') { const op = text[pos++], other = product(); value = op === '+' ? value + other : value - other; } return value; }
    const value = sum();
    if (pos !== text.length || !Number.isFinite(value)) throw new Error('Rechnung prüfen.');
    return Number(value.toPrecision(12));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { calculate };
  else scope.CarsPinboardCalculator = { calculate };
})(globalThis);
