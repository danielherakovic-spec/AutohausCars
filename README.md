# CarsAutoHaus – gemeinsames Passwort ohne Edge Function

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

## Enthaltene Dateien

- `index.html`, `app.js`, `config.js`: statische Browser-App ohne Edge-Function-Aufrufe.
- `supabase/password-rpc-migration.sql`: kurze Reparaturmigration für das bereits umgestellte Projekt.
- `supabase/schema.sql`: vollständiges Schema für ein neues Projekt, ebenfalls mit RPC statt Edge Function.

## Nie veröffentlichen

- das gemeinsame Passwort;
- einen Service-Role-/Secret-Key;
- eine SQL-Datei, in die ein echtes Passwort eingesetzt wurde.
