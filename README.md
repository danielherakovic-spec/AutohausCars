# AutoValue Pro – ein gemeinsames Zugangs-Passwort

Diese Ausgabe ersetzt persönliche E-Mail-/Passwort-Konten und Einladungs-Codes durch **ein gemeinsames Zugangs-Passwort**. Wer dieses Passwort kennt, öffnet denselben Fahrzeugbestand. Fahrzeuge, Aufgaben und Änderungen bleiben in Supabase gespeichert und werden per Realtime auf allen geöffneten Geräten aktualisiert. Fotos bleiben privat in Supabase Storage.

## Wichtig zur Sicherheit

Ein Passwort, das nur in JavaScript, HTML, GitHub Pages oder `config.js` geprüft wird, ist **nicht sicher**: Jede Person kann diese Dateien ansehen und die Prüfung umgehen. Deshalb enthält dieses Repository weder das gemeinsame Passwort noch einen Service-Role-/Secret-Key.

Stattdessen passiert Folgendes:

1. Der Browser erstellt nur eine anonyme, technische Supabase-Sitzung. Es gibt keine E-Mail-Adresse und kein persönliches Passwort.
2. Das eingegebene gemeinsame Passwort wird über HTTPS an die Supabase Edge Function `enter-shared-workspace` gesendet.
3. Die Funktion prüft es serverseitig gegen einen bcrypt-Hash in der privaten Supabase-Datenbank und gibt nur dann dieser Sitzung Zugriff auf den einen gemeinsamen Bereich.
4. RLS schützt Tabellen und Fotos weiterhin; der im Browser sichtbare Publishable/Anon Key ist dafür vorgesehen und kein Geheimnis.

Wer ein geöffneteres Gerät, dessen Browser-Sitzung oder das gemeinsame Passwort kompromittiert, kann den gemeinsamen Bereich nutzen. Das ist die unvermeidliche Eigenschaft eines einzigen geteilten Passworts. Nutze daher ein langes, einzigartiges Passwort und ändere es bei Bedarf sofort wie unten beschrieben.

## Was in diesem Ordner liegt

- `index.html`, `app.js`, `config.js`: statische GitHub-Pages-App.
- `supabase/shared-password-migration.sql`: **für das bestehende Projekt ausführen**; erhält den vorhandenen Bestand und entfernt die alten Beitrittswege.
- `supabase/functions/enter-shared-workspace/index.ts`: serverseitige Passwortprüfung.
- `supabase/schema.sql`: ursprüngliches Basisschema. Bei einem ganz neuen Projekt zuerst dieses und anschließend immer die Migration ausführen.
- `supabase/functions/import-listing/`: unveränderte optionale Inserat-Import-Funktion.

## Bestehendes Supabase-Projekt umstellen

Führe die Schritte in dieser Reihenfolge aus. Die Migration wählt bei mehreren alten Bereichen den Bereich mit den meisten Mitgliedern; bei der bisherigen App ist das normalerweise der einzige Bereich und dessen Daten/Fotos bleiben erhalten.

1. Sichere zur Vorsicht die aktuellen Daten: Öffne die alte App und wähle **Profil & Einstellungen → CSV exportieren**. Falls vorhanden, bewahre auch die alte JSON-Sicherung auf.
2. Öffne dein [Supabase Dashboard](https://supabase.com/dashboard), wähle das bisherige AutoValue-Projekt und öffne links **SQL Editor → New query**.
3. Öffne lokal [`supabase/shared-password-migration.sql`](supabase/shared-password-migration.sql), kopiere den vollständigen Inhalt in den SQL Editor und wähle **Run**. Dabei bleiben Tabellen, vorhandener Datenbestand, Realtime und der Foto-Bucket erhalten; alte Einladungsfunktionen/-codes und die alten E-Mail-Mitgliedschaften werden entfernt. Die bisher angemeldeten Geräte verlieren dadurch absichtlich ihren Zugriff und müssen sich nach der Veröffentlichung einmal mit dem neuen gemeinsamen Passwort öffnen.
4. Bleibe im SQL Editor. Erstelle eine zweite neue Query, kopiere dieses Muster hinein, ersetze ausschließlich den Text zwischen den einfachen Anführungszeichen durch ein langes, neues Passwort (empfohlen: mindestens 16 Zeichen) und wähle **Run**:

```sql
update private.av_shared_access_config
set password_hash = extensions.crypt('HIER_DEIN_NEUES_LANGES_PASSWORT_EINFUEGEN', extensions.gen_salt('bf', 12)),
    configured_at = now()
where singleton = true;
```

   Diese Query nicht speichern, nicht in GitHub einfügen und nicht als Screenshot teilen. Supabase speichert nur den bcrypt-Hash.
5. Öffne **Authentication → Providers → Anonymous** und aktiviere **Enable Anonymous Sign-Ins**. Die genaue Beschriftung kann je nach Dashboard-Version leicht abweichen. Der E-Mail-Provider wird von dieser Ausgabe nicht benutzt und kann nach erfolgreichem Test deaktiviert werden.
6. Stelle die neue Edge Function bereit. Am einfachsten lokal mit der Supabase CLI im Stamm dieses Ordners:

```powershell
npx supabase login
npx supabase link --project-ref DEIN_PROJECT_REF
npx supabase functions deploy enter-shared-workspace
```

   Für diese Function bleibt die eingebaute JWT-Prüfung von Supabase aktiv. Zusätzlich prüft der Code den eingeloggten anonymen Nutzer selbst mit `auth.getUser()` und verwendet einen serverseitig vorhandenen privilegierten Key ausschließlich innerhalb der Function. Dieser Key wird nicht angelegt, kopiert oder im Browser veröffentlicht.
7. Öffne **Settings → API Keys**. Kopiere die **Project URL** und den **Publishable key** (ein alter `anon`-Key geht ebenfalls). Öffne [`config.js`](config.js) und ersetze nur `YOUR_PROJECT_REF` sowie `YOUR_PUBLISHABLE_OR_ANON_KEY`. `sharedAccessFunction` bleibt `enter-shared-workspace`.
8. Lade den Inhalt dieses Ordners in dein bestehendes GitHub-Pages-Repository hoch: `index.html`, `app.js`, `config.js`, `supabase/` usw. gehören direkt in den Repository-Stamm. Der GitHub-Pages-Workflow muss nicht geändert werden. Warte, bis GitHub Pages den neuen Commit veröffentlicht hat.
9. Öffne die Pages-URL in einem privaten Browserfenster. Es darf ausschließlich ein Feld für das gemeinsame Zugangs-Passwort erscheinen. Gib das Passwort aus Schritt 4 ein und prüfe, ob der bestehende Fahrzeugbestand erscheint.
10. Öffne dieselbe URL auf einem zweiten Gerät oder in einem zweiten privaten Fenster. Melde dich mit demselben Passwort an, ändere dort ein Fahrzeug und prüfe, ob die Änderung im ersten Fenster automatisch erscheint. Teste auch den Upload eines Fotos.

Nach erfolgreichem Test kannst du alte E-Mail-Konten unter **Authentication → Users** manuell entfernen, falls sie ausschließlich für die alte App angelegt wurden. Lösche dabei keine anonymen Benutzer, die aktuell auf einem Gerät verwendet werden; sie sind die technischen RLS-Sitzungen für das jeweilige Gerät.

## Neues Supabase-Projekt einrichten

Bei einem völlig neuen Projekt brauchst du keine Migration: Führe den gesamten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) im SQL Editor aus. Führe danach die Passwort-Query aus Schritt 4 oben aus, aktiviere Anonymous Sign-Ins (Schritt 5), stelle die Edge Function bereit (Schritt 6), trage Projekt-URL und Publishable Key in `config.js` ein und veröffentliche die statischen Dateien (Schritte 7–10). Beim ersten korrekten Passwortzugriff entsteht der eine gemeinsame Bereich automatisch.

## Passwort ändern oder Zugang entziehen

Zum Ändern wiederhole nur die SQL-Query aus Schritt 4 mit einem neuen Passwort. Neue Geräte brauchen danach das neue Passwort. Bereits berechtigte Browser-Sitzungen bleiben technisch noch Mitglied, bis sie ablaufen oder gelöscht werden. Für einen vollständigen, sofortigen Entzug entferne zusätzlich im Supabase Dashboard unter **Authentication → Users** die betreffenden anonymen Nutzer; sie müssen sich danach erneut mit dem neuen Passwort anmelden.

## Optional: Inserat-Import

Der Link-Import bleibt optional. Wenn du ihn nutzen möchtest, stelle auch `import-listing` bereit und setze danach in [`config.js`](config.js):

```js
listingImportFunction: 'import-listing',
```

```powershell
npx supabase functions deploy import-listing --no-verify-jwt
```

## Nie veröffentlichen

- das gemeinsame Zugangs-Passwort;
- einen Service-Role-/Secret-Key;
- eine SQL-Datei, in die du dein echtes Passwort eingefügt hast.

`config.js` darf nur Projekt-URL und Publishable/Anon Key enthalten. Beide sind für eine Browser-App vorgesehen; RLS, die serverseitige Passwortprüfung und der private Foto-Bucket schützen die Daten.
