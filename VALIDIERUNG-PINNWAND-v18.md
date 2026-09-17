# Pinwand v18: gemeinsame Speicherung und Taschenrechner

Die bestehende Pinwand wurde um gemeinsame Speicherung je Workspace und eine Rechner-Karte ergänzt. Änderungen werden feldweise zusammengeführt. Serverseitige Sperren und Anfrage-IDs verhindern doppelte Wiederholungen; ein lokaler Sendepuffer bewahrt noch nicht übertragene Änderungen. Zoom und Vergleichsauswahl bleiben persönlich.

Prüfergebnisse:

- 42 Node-Tests bestanden: 39 bestehende Fahrzeuganalyse-Tests plus Rechner, Feld-Zusammenführung und Offline-Wiederholung.
- Die tatsächliche SQL-Migration wurde in der PostgreSQL-Testlaufzeit PGlite zweimal ausgeführt. Gemeinsamer Zugriff, Workspacetrennung über RLS, Sperre für Nichtmitglieder/anon/direkte Tabellenänderungen, Feld-Zusammenführung, wiederholte Anfrage-ID, keine Wiederherstellung gelöschter Karten durch alte Updates und Fadenbereinigung wurden bestätigt.
- Zwei unabhängige Edge-Browsersitzungen mit verschiedenen simulierten Benutzer-IDs und gemeinsamer lokaler SQL-Datenbank: Änderungen an Notizen, Rechner-Ausdrücken/Ergebnissen und Löschungen werden übertragen.
- Bisherige Browserfälle bestanden: leerer Start, Notizen, Farben, Maus/Touch, Fäden, Vergleich, Neuladen, Löschen/Rückgängig, Tastatur, Export/Import und mobile Ansicht. Keine JavaScript-Laufzeitfehler im Test.
- Der Rechner unterstützt Grundrechenarten, Punkt-vor-Strich, Klammern, Dezimalkomma, negative Werte und Prozent. Ausführbare Eingaben und Division durch null werden abgefangen; kein eval/Function.

Die Browserprüfung ersetzt nur den Supabase-Netzwerktransport durch einen lokalen Testserver. Die Website und SQL-Migration werden tatsächlich ausgeführt. Keine produktiven Fahrzeugdaten verwendet, keine Live-Migration und kein GitHub-Deployment durchgeführt. Die historische Prüfdatei v17 beschreibt den vorherigen lokalen Stand.
