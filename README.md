# CarsAutoHaus – gemeinsamer Bestand, vollständiger Export und KI-Analyse

## Neu in v16: KI-Fahrzeugranking als Hauptbereich

In der festen Hauptnavigation steht **KI-Fahrzeugranking** direkt neben Autosuche, Vergleich und Statistik. Der Bereich öffnet die vollständige Ranking-Arbeitsfläche unmittelbar; ein vorheriger Klick auf Export ist nicht mehr nötig. Beim ersten Öffnen wird aus dem aktuellen gemeinsamen Bestand automatisch derselbe vollständige, nicht gelöschte Fahrzeugdatenstand vorbereitet. Ohne Fahrzeugakten erscheint ein eigener Leerzustand. Ändert sich der Bestand, wird ein noch offenes Ergebnis verworfen beziehungsweise beim erneuten Öffnen aktualisiert – alte Ergebnisse werden nicht still weiterverwendet.

Consent, Serverauthentifizierung, Abgleich mit dem autorisierten Workspace, Mengen-/Kostenlimits, Laden, Abbruch, Wiederholung, Konfigurations- und Providerfehler sowie die vollständige Ergebnisvalidierung bleiben unverändert. Rang, Sterne, Faktoren, lange Begründung und Kontaktfragen erscheinen direkt auf dieser Seite. JSON, CSV und der Ergebnis-Download bleiben dort verfügbar. **Schnellzugriff → Export & KI** sowie **Profil → CSV exportieren** funktionieren weiter: Sie laden sofort das vollständige CSV herunter und öffnen anschließend dieselbe Ranking-Seite. Die Hauptnavigation selbst startet keinen Download und keine KI-Anfrage.

## Neu in v15: vollständiger Export & serverseitige KI

**Schnellzugriff → Export & KI** (oder **Profil → CSV exportieren**) lädt weiterhin ein CSV herunter und öffnet die neue Auswertungsansicht. **Vollständiges JSON** liefert zusätzlich das verlustfreie Format. Alle nicht gelöschten Fahrzeugakten aus Bestand, Ankaufkandidaten und Import-Hub werden exportiert, unabhängig von Filtern, Favoriten und Status. Verkaufte/archivierte Akten bleiben als Referenzen enthalten. Bereits übernommene Inserate können als separate Quellakten erscheinen; jede hat eine eindeutige Export-ID.

Jedes `record` enthält sämtliche gespeicherten Felder unverändert: Preise, technische Daten, Ausstattung, Zustand, Mängel, Beschreibung, Quelle, eigene Bewertungen, Foto-Referenz und vollständige Notizverläufe sowie unbekannte zukünftige Felder. `related` enthält per `vehicleId` zugeordnete Aufgaben und Betriebsdatensätze (Buchungen einschließlich gespeicherter Belegdaten, Rechnungen, Dokumente usw.) sowie den zugeordneten Showroom. Nicht zugeordneter Chat, allgemeine Notizen, Integrationsdaten und Zugangsdaten gehören nicht zum Fahrzeugexport. Externe Dateien/private Storage-Objekte bleiben Referenzen und werden nicht heruntergeladen oder visuell analysiert. JSON ist ein Fahrzeugdatenexport, **kein vollständiges Workspace-Backup und nicht für den bisherigen Backup-Importer**.

CSV behält die bisherigen elf Übersichtsspalten und ergänzt die Vereinigung aller gespeicherten Felder (`Feld.*`) und Verknüpfungen (`Verknuepft.*`); Listen/Objekte werden als JSON-Zellen geschrieben. Texte mit möglichen Tabellenformeln erhalten einen Schutzpräfix. Für exakte Rohwerte oder lange Dokumenttexte JSON verwenden: Tabellenprogramme haben eigene Zellgrößenlimits. Der lokale Export hat keine künstliche Fahrzeugbegrenzung.

Nach bewusster Zustimmung startet **Export mit KI analysieren**. Der vollständige Export geht über die neue Supabase Edge Function an OpenAI. Sie prüft zuerst den gültigen Auth-Token und die bestehende Workspace-Mitgliedschaft; eine anonyme Sitzung ohne erfolgreichen Passwortzugang reicht nicht. Über RLS liest sie den autorisierten Bestand erneut und vergleicht ihn vollständig mit dem Export. Bei Abweichungen gibt es einen Konflikthinweis statt einer Teilanalyse. Sie nutzt keinen Service-Role-Key, keine browserseitigen KI-Schlüssel und keine vom Browser vorgegebene Workspace-ID.

Die Antwort enthält für jede Export-ID genau einen lückenlosen Rang, 1–5 Sterne zur **Kontaktpriorität**, eine Empfehlung, Datensicherheit, kurze Faktoren mit Belegen, eine ausführliche deutsche Begründung und Rückfragen für den Anbieter. Bereits gekaufte/verkaufte/archivierte/übernommene Akten werden als nicht ankaufbare Referenzen geprüft. Der Server fordert [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) mit striktem JSON-Schema an; Server **und** Browser validieren zusätzlich IDs, Ränge, Sterne, Vollständigkeit und Mindestlänge der Begründungen. Ungültige oder abgebrochene Antworten werden nicht als Ranking dargestellt. Die Einordnung ist eine KI-Schätzung auf Basis erfasster Angaben, kein Marktgutachten oder automatischer Kaufentscheid.

**Datenschutz:** Die Freigabe umfasst auch eventuell personenbezogene Inhalte in Fahrzeugnotizen/Rechnungen/Dokumenten. Vor dem Start prüfen und unnötige personenbezogene Angaben entfernen. Keine Übertragung allein durch den Download; keine automatischen Wiederholungen. Ergebnisse liegen nur im Arbeitsspeicher der geöffneten Seite und lassen sich separat als JSON herunterladen. Keine Speicherung der Analyse im gemeinsamen Chat/Workspace. Die Function schreibt keine Nutzdaten oder Schlüssel in Logs. `store: false` deaktiviert die Responses-Anwendungsspeicherung, ist aber **keine Zusage vollständiger Null-Aufbewahrung**; die [OpenAI-Datenkontrollen](https://developers.openai.com/api/docs/guides/your-data) gelten weiterhin. Der Service Worker speichert nur explizite lokale App-Dateien, keine authentifizierten API-Antworten.

### KI einmalig einrichten

Nur für die neue KI-Funktion ist eine Edge Function nötig. Der bestehende **Passwortzugang bleibt unverändert eine RPC ohne Edge Function**. GitHub Pages kann selbst keine geheimen Server-Schlüssel halten. Es gibt keine vorhandene OpenAI-Konfiguration in dieser Ausgabe; ohne Einrichtung zeigt die neue Ansicht einen Fehler und lässt den Export verfügbar.

1. Bisherige Website sichern. Aktualisierte statische Dateien einschließlich `vehicle-analysis.mjs`, `vehicle-analysis.css`, **`.nojekyll`** und **`supabase/functions/_shared/`** veröffentlichen. Die beiden `_shared`-Module werden auch vom Browser benötigt; `.nojekyll` verhindert, dass GitHub Pages sie wegen des Unterstrichs auslässt. Bestehende `config.js` behalten. Vorhandene Passwort-/Schema-/Chat-Migrationen nicht erneut ausführen.
2. Im bestehenden Supabase-Projekt einmal **nur** [`supabase/vehicle-analysis-migration.sql`](supabase/vehicle-analysis-migration.sql) im SQL Editor ausführen. Diese additive Migration ergänzt eine private, atomare Kontingenttabelle und `av_claim_vehicle_analysis()`. Sie ändert keine Bestandsdaten, Passwort-RPC oder bestehende RLS-Regel.
3. Unter **Edge Functions → Secrets** `OPENAI_API_KEY`, `OPENAI_MODEL` und `ANALYSIS_ALLOWED_ORIGINS` setzen. `OPENAI_MODEL` ist eine explizite, für Ihr API-Projekt freigeschaltete Modell-ID mit Responses-API und Strict-JSON-Schema-Unterstützung; es gibt keinen stillen Modell-Fallback. Das Modell muss den konfigurierten Output-Rahmen von 32.768 Tokens unterstützen. `ANALYSIS_ALLOWED_ORIGINS` ist z. B. `https://IHR-NAME.github.io` – ohne Repository-Pfad/Schrägstrich am Ende, mehrere Origins kommagetrennt. Keine Wildcards. **Den OpenAI-Schlüssel niemals in config.js, GitHub, Chat oder öffentliche Dateien eintragen.** Supabase stellt `SUPABASE_URL` und öffentliche API-Keys als Serverumgebung bereit; unterstützt werden `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_PUBLISHABLE_KEY` und der vorhandene `SUPABASE_ANON_KEY`. Die Function nutzt `Deno.env.get`. Siehe [Supabase-Secrets](https://supabase.com/docs/guides/functions/secrets).
4. Die Function samt beiden Shared-Modulen mit der Supabase CLI aus diesem Ordner deployen. Falls bereits eine eigene `supabase/config.toml` existiert, nur den Abschnitt `[functions.analyze-vehicles]` übernehmen, nicht die übrige Konfiguration ersetzen. In einem Terminal mit installierter Supabase CLI:

   ```sh
   supabase login
   supabase functions deploy analyze-vehicles --project-ref IHR_PROJEKT_REF
   ```

   Die mitgelieferte Function-Konfiguration setzt `verify_jwt = false`, weil die Function Auth-Token ausdrücklich über `/auth/v1/user` prüft und anschließend die Workspace-Mitgliedschaft/RLS erzwingt; der Publishable Key ist kein Benutzer-Token. **Diese Prüfungen nicht entfernen.** Keine Service-Role-/Secret-Keys an den Browser weitergeben. Deployment erfolgt in dasselbe Projekt wie Ihre bestehende `config.js`. Siehe [Supabase-Key-Migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) und [Function-Deployment](https://supabase.com/docs/guides/functions/deploy).
5. Seite neu laden und am gemeinsamen Bestand anmelden. Auf **Export & KI** klicken, CSV und JSON kontrollieren. Danach Datenübertragung bestätigen und eine kleine, nicht vertrauliche Testauswahl im **Testprojekt** analysieren. Im echten Bestand wird immer der gesamte Export ausgewertet, keine versteckte Auswahl. Jede Export-ID muss einmal im Ergebnis vorkommen. Zweite Sitzung ohne Workspace-Mitgliedschaft muss abgewiesen werden.

Für lokale Entwicklung `.env.example` nur als Vorlage verwenden; tatsächliche Secrets außerhalb des Website-Ordners halten und mit `supabase functions serve analyze-vehicles --env-file PFAD_ZUR_PRIVATEN_ENV` laden. Keine echten `.env`-Dateien in ZIPs oder GitHub veröffentlichen. Das beigefügte `.gitignore` ist zusätzlicher Schutz, kein Schutz vor dem Hochladen über eine Weboberfläche.

### Grenzen, Kosten und Fehlerzustände

- Synchroner, vollständiger Analyseaufruf: höchstens **50 Akten und 1 MiB Anfrage**, bis zu 32.768 Output-Tokens, serverseitiges Zeitlimit 110 Sekunden. Größere Exporte werden weiterhin vollständig heruntergeladen; die KI lehnt sie sichtbar ab, statt Felder/Fahrzeuge abzuschneiden. Für größere Bestände ist eine gesonderte asynchrone Job-/Batch-Erweiterung nötig. Auch innerhalb dieser Grenzen können Modellkontext oder Antwortzeit überschritten werden; dann erscheint ein Fehler, kein Teilranking.
- Je Workspace mindestens **zwei Minuten Abstand** und höchstens **zehn gestartete Versuche pro UTC-Tag**, atomar in Postgres. Auch fehlgeschlagene Provider-Aufrufe zählen, um Kosten durch Wiederholungen zu begrenzen. Zusätzlich ein OpenAI-Projektbudget setzen. Ein Abbruch im Browser beendet das Warten, garantiert aber nicht, dass bereits laufende Serverarbeit kostenlos gestoppt wird.
- Fehlende Function/CORS: Server nicht erreichbar. Fehlende Secrets: Einrichtungshinweis. Fehlende Migration: Kontingentfreigabe nicht eingerichtet. `401/403`: Anmeldung/Mitgliedschaft prüfen. `409`: erst vollständig synchronisieren, dann neu exportieren. `413`: Größenlimit. `429`: später erneut versuchen/Kontingent prüfen. `502/504`: Modell-/Providerfehler, ungültige oder unvollständige Antwort bzw. Zeitlimit; kein Teilranking.
- Ändert sich der Bestand während/nach einer Analyse, wird das Ergebnis in der Oberfläche als veraltet verworfen. Neu exportieren und bewusst erneut starten. Keine Hintergrundübertragung.

### Validierung dieser Ausgabe

Automatisierte Tests mit Node.js 22+ (keine zusätzlichen Pakete):

```sh
node --test tests/vehicle-analysis.test.mjs
```

Die Tests decken vollständige/verschachtelte Exportdaten, Preisfelder, CSV-Injection-Schutz, Datenschutzabgrenzung, JWT-/Mitgliedschaftsprüfung, veraltete/zu große Exporte, Schema/IDs/Ränge, Providerfehler, Consent, Abbruch/Timeout/Wiederholung und HTML-Escaping ab. HTTP-Aufrufe werden durch kontrollierte Testantworten ersetzt; das sind **keine echten KI-Ergebnisse**. In dieser Arbeitsumgebung waren weder OpenAI-Key noch Supabase-Deployzugang, Deno oder eine lokale Postgres-Instanz verfügbar. Daher sind Live-Deployment, SQL-Ausführung, echte Modellantworten und ein angemeldeter Browser-End-to-End-Test nach Einrichtung noch erforderlich.

## Bestehender Passwortzugang

Diese Ausgabe öffnet den gemeinsamen Fahrzeugbestand mit einem einzigen Passwort, **ohne Supabase Edge Function**. Der Browser meldet sich dafür nur anonym bei Supabase an und ruft anschließend eine sichere Datenbankfunktion (`av_enter_shared_workspace`) auf. Nach erfolgreicher Passwortprüfung erhält genau diese anonyme Sitzung die bestehende Workspace-Mitgliedschaft.

Fahrzeuge, Aufgaben, Realtime-Updates und private Fotos bleiben in Supabase. Das Passwort steht weder in dieser App noch in GitHub: Supabase speichert ausschließlich seinen bcrypt-Hash im privaten Schema `private`.

## Warum diese Variante zuverlässig und sicher ist

1. Der Browser erstellt eine anonyme, authentifizierte Supabase-Sitzung.
2. Er sendet das Passwort über die normale HTTPS-Supabase-API an die RPC `av_enter_shared_workspace`.
3. Die `SECURITY DEFINER`-Funktion verwendet selbst `auth.uid()` und den signierten JWT-Claim `is_anonymous` (keine vom Browser gelieferte Nutzer-ID), akzeptiert nur anonyme Auth-Sitzungen und prüft das Passwort gegen den bcrypt-Hash in `private.av_shared_access_config`.
4. Erst dann legt sie die Mitgliedschaft an und liefert Workspace-ID und Datenbestand zurück. RLS schützt anschließend weiterhin Bestand und Fotos.

Der Publishable/Anon Key in `config.js` ist für Browser vorgesehen und kein Geheimnis. Niemals Passwort, Service-Role-Key oder Secret-Key eintragen oder committen.

## Freie Fahrzeugdiktation

Öffne **Neues Auto** und wähle im Formular **Freie Fahrzeugdiktation → Start**. CarsAutoHaus hört anschließend fortlaufend zu: Es gibt keine feste Frage-Antwort-Reihenfolge und keine Wartezeit zwischen den Angaben. Sage beliebig viele beschriftete Feldpaare direkt hintereinander, zum Beispiel:

> „Marke Ford, Modell Fiesta, Baureihe MK sieben, Generation zweitausendzwei, Erstzulassung März zweitausendvierzehn, Kilometer hundertzwanzigtausend, Leistung einhundertfünfzig PS, Kraftstoff Benzin, Getriebe Handschaltung, Einkaufspreis viertausendzweihundert, Verkaufspreis sechstausenddreihundert.“

Bereits vollständige Paare werden auch aus Zwischenergebnissen übernommen. Damit reagiert die Erfassung schnell auf lange, flüssig gesprochene Listen und startet nach natürlichen Erkennungspausen automatisch erneut.

- Unterstützte Feldbezeichnungen und Synonyme umfassen **Marke/Hersteller**, **Modell**, **Baureihe/Serie**, **Generation**, **Erstzulassung/EZ**, **Baujahr**, **Kilometer/KM**, **Leistung/PS/KW**, **Kraftstoff**, **Getriebe**, **Antrieb**, **Farbe**, **Halter/Vorhalter**, **Ort/Standort**, **Angebots-/Einkaufs-/Verkaufspreis**, **Status** und **Notiz/Bemerkung**.
- Gesprochene deutsche Zahlen werden für Jahre, Kilometer, Leistung und Preise verarbeitet; PS und kW werden jeweils in beide Leistungsfelder übertragen. Die Erstzulassung übernimmt bei vorhandener Jahresangabe auch das Baujahr.
- **„weiter“** hält die freie Diktation aktiv, **„wiederholen“** gibt die letzte erkannte Eingabe aus, **„lösche [Feld]“** leert ein Feld, und eine erneute Feldangabe korrigiert dessen bisherigen Wert.
- Bei **„fertig“** stoppt CarsAutoHaus zunächst und fragt sichtbar sowie gesprochen **„Bist du fertig?“**. Nur bei **„Ja“** endet die Diktation; bei **„Nein“** wird sofort weiter zugehört. Es gibt zu keinem Zeitpunkt eine automatische Speicherung.
- Die Funktion nutzt ausschließlich die Web Speech API des Browsers und die lokale Sprachsynthese. Es gibt keinen KI-Dienst, keine Kosten und keine Supabase-/RPC-Änderung.
- Erlaube beim Start den Mikrofonzugriff. In Browsern ohne Web-Spracherkennung, bei blockiertem Mikrofon oder ohne HTTPS bleibt das vollständige Formular als manuelle Alternative verfügbar. Für die beste Unterstützung nutze einen aktuellen Chrome- oder Edge-Browser über HTTPS.

## Betriebszentrale: Ankauf, Bestand, Buchhaltung und Standorte

Die Erweiterung ergänzt CarsAutoHaus um einen zusammenhängenden operativen Arbeitsbereich. Alle neuen Daten werden innerhalb des bestehenden gemeinsamen Bestands gespeichert; an Supabase-Konfiguration, Passwort-RPC oder RLS wurde nichts geändert.

- **Ankauf & Marktprüfung:** Ankaufkandidaten aus manuellen Angaben oder der Importwarteschlange mit interner Preisreferenz, Mängelreserve, konservativem Einkaufslimit und nachvollziehbarem Score prüfen. Die Analyse ist eine transparente Vorentscheidung und ersetzt keine technische Prüfung, Probefahrt, Dokumentenprüfung oder externe Marktanalyse.
- **Vergleich Pro:** Zwei gespeicherte Fahrzeuge vollständig nebeneinander anzeigen. Die verdichtete Drei-Spalten-Ansicht benötigt keinen horizontalen Bildlauf und vergleicht optimalen Ankauf und Verkauf, Mängel, geschätzte Aufbereitung, Nebenkosten, Ausstattung, Beschreibung und Notizen. Preisposition und Rating lassen sich aufklappen und zeigen jede verwendete Rechenkomponente. Ohne offizielle Marktdaten bleiben die Werte interne, nachvollziehbare Kalkulationshilfen.
- **Import-Hub:** Inserate von mobile.de, AutoScout24, Händlerlisten oder manuellen Quellen zunächst als kontrollierbaren Vorschlag ablegen und erst danach einzeln in den Bestand übernehmen. Strukturierte JSON- und CSV-Dateien können vorbefüllt werden.
- **Bestand & Beobachtung:** Operative Nachbereitung für aktive Fahrzeugakten, Aufbereitung, Besichtigung und beobachtete Ankaufkandidaten.
- **Buchhaltung:** Kassenbuch mit Einnahmen/Ausgaben, Fahrzeugbezug, Notiz und Belegimport bis 500 KB je Eintrag; Rechnungsentwürfe und ein Kassenbuch-CSV-Export für die weitere Verarbeitung.
- **DATEV-Vorbereitung:** Die Oberfläche dokumentiert den Einrichtungsstatus und bereitet Buchungsdaten/Belege für die Abstimmung vor. Eine Live-Übertragung ist bewusst erst nach offiziellem DATEV-Entwicklerzugang, OAuth, Mandantenfreigabe und Partnerfreigabe vorgesehen. DATEV beschreibt für Beleg- und Buchungsdaten eigene Datenservices, Berechtigungsprüfungen und Freigabevorgaben.
- **Showrooms:** Standorte mit Kapazität, Status und Fahrzeugzuordnung verwalten.
- **Dokumente:** Druckbare Entwürfe für Kaufvertrag, Übergabeprotokoll, Reservierung und Rechnung. Diese sind ausdrücklich **keine zugesicherten rechtssicheren Vorlagen** und müssen vor geschäftlicher Nutzung für den konkreten Fall fachlich und rechtlich geprüft werden.
- **Mobile Verwaltung:** Die responsive PWA kann auf mobilen Geräten genutzt werden; alle berechtigten Geräte arbeiten über den gemeinsamen Bestand. Der Gerätecode ist nur ein organisatorischer Einrichtungsnachweis, kein Login-Token.

### Live-Portal- und Kontoverknüpfungen

Die Anwendung speichert weder Portalpasswörter noch API-Geheimnisse im Browser und führt kein unautorisiertes Scraping durch. Für eine produktive Kontoverknüpfung von mobile.de oder AutoScout24 sind ein offizieller Händler-/Partnerzugang, ein serverseitiger OAuth-Rückruf, verschlüsselte Tokenablage, die jeweiligen Nutzungsbedingungen und ein Sandbox-Test erforderlich. Die Integrationsansicht legt diese Schritte transparent als Vorbereitung ab.

## Bestehendes Projekt reparieren

Diese Schritte gelten, wenn die frühere `shared-password-migration.sql` bereits ausgeführt wurde, Anonymous Sign-Ins aktiviert sind und `enter-shared-workspace` erfolglos bereitgestellt wurde.

1. Öffne das betroffene Projekt im [Supabase Dashboard](https://supabase.com/dashboard) und wähle **SQL Editor → New query**.
2. Öffne [`supabase/password-rpc-migration.sql`](supabase/password-rpc-migration.sql), kopiere den vollständigen Inhalt in den SQL Editor und wähle **Run**. Die Migration behält Workspace, Daten, Foto-Bucket und vorhandene Mitgliedschaften bei. Sie ersetzt nur den alten service-role-only Passwort-Endpunkt durch die browserfähige RPC.
3. Prüfe unter **Authentication → Providers → Anonymous**, dass **Enable Anonymous Sign-Ins** eingeschaltet ist.
4. Öffne [`config.js`](config.js). Trage ausschließlich die **Project URL** und den **Publishable key** (oder den bisherigen Anon Key) aus **Settings → API Keys** ein. Es gibt kein Function-Feld und keinen Function-Deploy-Schritt.
5. Lade den Inhalt dieses Ordners in das Stammverzeichnis deines GitHub-Pages-Repositories hoch und veröffentliche ihn wie bisher. Die Dateien `app.js`, `config.js` und `supabase/` gehören direkt ins Repository-Stammverzeichnis.
6. Öffne die Pages-URL in einem privaten Browserfenster. Gib das gemeinsame Passwort ein und prüfe, dass der vorhandene Bestand erscheint. Wiederhole den Test in einem zweiten privaten Fenster und prüfe eine Änderung sowie einen Foto-Upload.

Die früher bereitgestellte Function `enter-shared-workspace` wird nicht mehr aufgerufen und kann nach dem Test im Supabase Dashboard gelöscht werden. Dafür ist kein Key und kein erneuter Funktions-Deploy nötig.

## Neues Supabase-Projekt einrichten

1. Führe den gesamten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) im **SQL Editor** aus.
2. Führe direkt danach in einer neuen, **nicht gespeicherten** Query diese Vorlage aus und ersetze nur den Text innerhalb der einfachen Anführungszeichen:

```sql
update private.av_shared_access_config
set password_hash = extensions.crypt('HIER_EIN_LANGES_NEUES_PASSWORT_EINFUEGEN', extensions.gen_salt('bf', 12)),
    configured_at = now()
where singleton = true;
```

   Empfohlen sind mindestens 16 zufällige Zeichen. Diese Query nicht in GitHub speichern oder als Screenshot teilen.
3. Aktiviere **Authentication → Providers → Anonymous → Enable Anonymous Sign-Ins**.
4. Trage Project URL und Publishable/Anon Key in [`config.js`](config.js) ein, veröffentliche die statischen Dateien und teste den Zugang in einem privaten Browserfenster.

Beim ersten erfolgreichen Zugriff entsteht der gemeinsame Workspace automatisch.

## Passwort ändern oder Zugang vollständig entziehen

Zum Ändern wiederhole nur die Passwort-Query oben mit einem neuen Passwort. Neue Geräte benötigen danach das neue Passwort. Bereits berechtigte Browser-Sitzungen behalten ihre Mitgliedschaft, bis ihre anonyme Sitzung gelöscht wird oder abläuft.

Für einen sofortigen vollständigen Entzug lösche unter **Authentication → Users** die betreffenden anonymen Benutzer. Sie müssen sich danach mit dem neuen Passwort erneut anmelden. Lösche dabei keine Nutzer, wenn du den Zugriff dieses Geräts behalten möchtest.

## Erweiterung: Ankauf, Zustand und Teamarbeit

- **Premium-Oberfläche:** Einheitliche, verlaufsfreie Farbpalette aus Schwarz, tiefem Navy, dunklem Blau, Royalblau, Türkis, hellem Grau und sehr sparsamem Weiß. Dashboard, Formulare, Vergleich, Chat, Tabellen, Login sowie Desktop- und Mobilnavigation folgen ausschließlich diesen Farben. Alle bestehenden Funktionen und Datenwege bleiben erhalten.

- **Gesamtranking in „Ankauf & Marktprüfung“:** Ordnet vorhandene Fahrzeugakten und offene Ankaufkandidaten anhand der gespeicherten Preis- und Margenannahmen, Laufleistung, Ausstattung, Mängel und Zustandsrisiken. Es ist eine erklärbare Priorisierung, keine automatische Kaufentscheidung oder externe Marktwertermittlung.
- **Erweitertes Fahrzeugformular:** Enthält Inseratquelle und Inserat-Link (z. B. mobile.de oder AutoScout24), eine durchsuchbare Ausstattungsliste mit zusätzlichen Merkmalen sowie getrennte Zustandsfelder für Gesamtzustand, Karosserie, Innenraum, Technik, Reifen und Mängel.
- **Notizen:** Unter „Bestand & Nachbereitung“ führt der Button **Notiz** zu einem datierten Teamverlauf je Fahrzeug. Zusätzlich gibt es in der Betriebszentrale **Teamnotizen** als unabhängigen, dauerhaft gespeicherten Textverlauf für allgemeine Absprachen und Erinnerungen.
- **Inserat-Schnellübernahme:** Im Formular „Neues Auto“ stehen zwei getrennte Einfügefelder bereit. Das erste liest kopierte technische Fahrzeugdaten im üblichen Portalformat aus und füllt die passenden Formularfelder. Das zweite verarbeitet eine zeilenweise Ausstattungsliste, berücksichtigt gebräuchliche Schreibweisen wie „Elektr. Fensterheber“ oder „Start/Stopp-Automatik“ und setzt die passenden Häkchen. Die Übernahme speichert nie automatisch; der Datensatz bleibt bis zum normalen Klick auf **Fahrzeug speichern** ein prüfbarer Formularentwurf.
- **Gemeinsamer Chat:** Der Schnellzugriff **Chat** öffnet einen einfachen, synchronisierten Verlauf für alle berechtigten Nutzer. Nachricht schreiben und mit Enter oder dem Senden-Button abschicken; Umschalt + Enter erzeugt eine neue Zeile. Eine Nachricht lässt sich anklicken und als gemeinsame Notizkarte anheften. Die Karte erscheint dauerhaft auf dem Homescreen, wird zusätzlich im allgemeinen Notizverlauf abgelegt, kann von allen berechtigten Nutzern entfernt und per Ziehen oder Pfeiltasten neu angeordnet werden.

### Chat und Betriebszentrale dauerhaft synchronisieren

Die bisherige Funktion `av_save_workspace_state` speichert absichtlich nur Fahrzeuge und Aufgaben. Damit Chat, Notizen und die weiteren Betriebsdaten ebenfalls geräteübergreifend erhalten bleiben, führe einmalig [`supabase/operations-state-rpc-migration.sql`](supabase/operations-state-rpc-migration.sql) im Supabase SQL Editor aus. Die Migration ersetzt weder die Passwort-RPC noch die Konfiguration; sie ergänzt `av_save_workspace_state_v2` und führt parallele Chatnachrichten anhand ihrer IDs zusammen.

Ohne diese einmalige Migration bewahrt die App den Chat auf dem aktuellen Gerät im Browser-Speicher auf und kennzeichnet ihn sichtbar als **Dauerhaft auf diesem Gerät**. Nach erfolgreicher Migration steht dort **Dauerhaft & gemeinsam**.

Für Ankaufentscheidungen bleiben Besichtigung, Probefahrt, Unterlagen-, Historien- und technische Prüfung unverzichtbar. Die Rangfolge verwendet nur die Daten, die in CarsAutoHaus erfasst wurden.

## Enthaltene Dateien

- `index.html`, `app.js`, `config.js`: statische Browser-App; Passwortzugang weiterhin per RPC, optionale KI per geschützter Edge Function.
- `vehicle-analysis.mjs`, `vehicle-analysis.css`: vollständiger Export, Consent, Lade-/Fehlerzustände und KI-Ergebnisansicht.
- `supabase/functions/_shared/`: Exportmodell und gemeinsames Antwortschema mit Validierung (auch für den Browser erforderlich).
- `supabase/functions/analyze-vehicles/`: serverseitiger OpenAI-Aufruf; Schlüssel ausschließlich in Supabase-Secrets.
- `supabase/vehicle-analysis-migration.sql`, `supabase/config.toml`: additive Kontingentfreigabe und Function-Konfiguration.
- `premium-ui.css`: das responsive CarsAutoHaus-Designsystem.
- `palette-lock.css`: abschließende, verlaufsfreie Royalblau-/Türkis-Palette für jede sichtbare Oberfläche.
- `comparison-pro.js`: Zwei-Fahrzeug-Vergleich mit interner Preis-, Aufbereitungs- und Ratingerklärung.
- `free-dictation.js`, `listing-paste-import.js`: freie Spracheingabe und kopierbare Inseratübernahme.
- `operations-suite.js`: Ankauf, Import, Bestand, Notizen, Chat, Buchhaltung, Showrooms, Dokumente und Integrationsvorbereitung.
- `supabase/operations-state-rpc-migration.sql`: additive Migration für dauerhaft gemeinsame Betriebs-, Notiz- und Chatdaten.
- `supabase/password-rpc-migration.sql`: kurze Reparaturmigration für das bereits umgestellte Projekt.
- `supabase/schema.sql`: vollständiges Schema für ein neues Projekt, ebenfalls mit RPC statt Edge Function.

## Nie veröffentlichen

- das gemeinsame Passwort;
- einen Service-Role-/Secret-Key;
- eine SQL-Datei, in die ein echtes Passwort eingesetzt wurde.
