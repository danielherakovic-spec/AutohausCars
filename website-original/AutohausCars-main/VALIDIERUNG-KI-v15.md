# Validierung – Export & KI v15

Stand: 28.08.2026. Hauptordner: `carsautohaus-betriebszentrale`.

## Lokal geprüft

- `node --test tests/vehicle-analysis.test.mjs`: **39 Tests bestanden**, keine Fehler.
- `node --check`: **14 JavaScript-/ES-Modul-/TypeScript-Dateien** syntaktisch geprüft (einschließlich bestehender App, Chat, Vergleich, Diktation und neuer Serverdateien).
- Export aller nicht gelöschten Fahrzeug-, Kandidaten- und Importakten; vollständige Rohwerte, Preise, Listen, Notizverläufe, zugeordnete Betriebsdaten; keine Filter-/Favoritenbegrenzung.
- CSV-Zellen mit Umlauten, Zeilenumbrüchen, Anführungszeichen und Formelpräfixen; JSON erhält Rohwerte exakt.
- Authentifizierung, Workspace-Mitgliedschaft, Datenstandabgleich, Consent, Herkunftsprüfung, Kontingentfehler, Größenlimits, fehlende Konfiguration, Providerfehler, Abbruch und Zeitlimits mit kontrollierten HTTP-Testantworten.
- Antwortschema und vollständige, eindeutige Fahrzeug-/Rangzuordnung auf Server und Client; keine Teilrankings.
- UI-Anfragelogik, wiederholter Versuch, Doppelclick-Schutz, Abbruch, verspätete Antworten, ungültige Antwort, geänderte Datenstände und Escaping getestet. Statische DOM-ID-/Dateiverweisprüfung bestanden.
- Service Worker beschränkt auf deklarierte eigene App-Dateien; kein API-Response-Caching. `.nojekyll` für GitHub-Pages-Veröffentlichung der Shared-Module vorhanden.
- `config.js`, `schema.sql`, `password-rpc-migration.sql` und `operations-state-rpc-migration.sql` per SHA-256 gegen die vorherige v14-ZIP verglichen: unverändert.

## Noch nach Einrichtung zu prüfen

Kein OpenAI-Schlüssel, kein Supabase-Deploymentzugang, kein Deno-/Supabase-CLI- oder Postgres-Testsystem vorhanden. Deshalb wurden **keine echten Fahrzeugdaten übertragen**, keine Datenbankmigration ausgeführt, keine Function veröffentlicht und keine echten KI-Ergebnisse erzeugt. Es wurde kein angemeldeter Browser-End-to-End-Test durchgeführt.

Vor produktiver Nutzung: additive SQL-Migration im Testprojekt ausführen, Function deployen, Server-Secrets/Origin einrichten, mit Testdaten echte Modellantwort und komplette ID-Abdeckung prüfen. Danach im angemeldeten Browser Export, Ranking, Datensatzwechsel sowie eine nicht berechtigte zweite Sitzung prüfen. Preis-/Kontaktpriorisierung fachlich gegenprüfen. Details und Fehlercodes stehen im README.

Die synchrone Analyse ist ausdrücklich auf 50 Akten/1 MiB begrenzt; der Export bleibt vollständig. Für größere Bestände ist eine separate asynchrone Erweiterung erforderlich. Foto-/Dateireferenzen werden mit exportiert, aber nicht visuell analysiert. Es ist keine externe Marktpreisabfrage enthalten.
