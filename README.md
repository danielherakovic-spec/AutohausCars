# AutoValue Pro – Supabase-Edition

Diese Ausgabe braucht keinen Node-Server und keinen persistenten Datenträger mehr. Sie ist für einen kostenlosen statischen Host (GitHub Pages) plus Supabase konzipiert:

- **Supabase Auth**: zwei persönliche E-Mail-/Passwort-Konten.
- **Postgres mit RLS**: nur diese zwei Konten sehen und ändern ihren gemeinsamen Bestand.
- **Realtime**: Änderungen erscheinen auf dem zweiten Gerät ohne Neuladen.
- **Supabase Storage**: Fahrzeugfotos liegen nicht mehr als große Browserdaten im Datensatz.
- **Optional Edge Function**: übernimmt öffentliche HTTPS-Inserate serverseitig.

Der Browser enthält bewusst nur die Projekt-URL und den **Publishable/Anon Key**. Das ist bei aktivierter RLS normal. Einen **Secret**- oder **service_role**-Key darf es in dieser Datei, in GitHub oder im Browser niemals geben.

## Einmalig: Supabase einrichten

1. In Supabase **SQL Editor → New query** öffnen, den vollständigen Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run** wählen. Das erzeugt Tabellen, RLS-Regeln, den privaten Foto-Bucket und die Realtime-Freigabe.
2. Unter **Authentication → Providers → Email** E-Mail/Passwort und **Allow new users to sign up** aktiv lassen. **Confirm Email** bleibt empfohlen aktiviert: dann bestätigen beide Personen ihre eigene E-Mail-Adresse. Die erste Bestätigungs-Mail kann auf dem kostenlosen Standardversand einige Minuten brauchen.
3. In **Settings → API Keys** (oder im Connect-Dialog) Projekt-URL und den **Publishable key** kopieren. Ein alter `anon`-Key funktioniert ebenfalls; nie einen Secret-Key kopieren.
4. In [`config.js`](config.js) `YOUR_PROJECT_REF` und `YOUR_PUBLISHABLE_OR_ANON_KEY` ersetzen. `listingImportFunction` bleibt zunächst leer.

## Kostenlos mit GitHub Pages veröffentlichen

1. Lege ein GitHub-Repository an und lade **den Inhalt dieses Ordners** hoch (also `index.html`, `app.js`, `config.js`, `supabase/` usw. im Repository-Stamm). Ein öffentliches Repository ist für GitHub Pages auf dem Free-Plan üblich; es enthält keine geheimen Schlüssel und die Daten bleiben durch RLS geschützt.
2. In GitHub: **Settings → Pages → Deploy from a branch → main / (root) → Save**. Warte auf die angezeigte URL, z. B. `https://DEIN-NAME.github.io/DEIN-REPO/`.
3. In Supabase: **Authentication → URL Configuration**. Setze diese Pages-URL als **Site URL** und füge dieselbe URL unter **Redirect URLs** hinzu. Das ist für Bestätigungs- und Anmelde-Links erforderlich.
4. Öffne die Pages-URL. Die erste Person wählt **„Gemeinsamen Bereich erstellen“**, registriert sich und bestätigt bei Bedarf ihre E-Mail. Anschließend zeigt die App einen Einladungs-Code. Die zweite Person wählt **„Bestehendem Bereich beitreten“**, erstellt ihr eigenes Konto und verwendet diesen Code. Der Bereich nimmt maximal zwei Personen auf.

## Vorhandene Daten übernehmen

Nach der Anmeldung: **Profil & Einstellungen → Bestehende AutoValue-Sicherung übernehmen** und die bisherige Datei `data/autovalue-pro.json` auswählen. Fahrzeuge und Aufgaben werden anhand ihrer Änderungszeiten mit dem neuen gemeinsamen Bestand zusammengeführt. Die alte Datei vorher unverändert sichern.

## Optional: Inserat-Import wieder einschalten

Ohne diesen Schritt bleibt die Fahrzeugerfassung vollständig nutzbar; nur der automatische Link-Import zeigt einen Hinweis. Die Edge Function ruft ausschließlich öffentliche HTTPS-Seiten ab, prüft die Anmeldung und liest nur Metadaten als Vorschlag aus.

Mit installiertem Node.js einmal im Ordner dieser Ausgabe ausführen:

```powershell
npx supabase login
npx supabase link --project-ref DEIN_PROJECT_REF
npx supabase functions deploy import-listing --no-verify-jwt
```

Danach in [`config.js`](config.js) setzen:

```js
listingImportFunction: 'import-listing',
```

Die Datei [`supabase/config.toml`](supabase/config.toml) dokumentiert, warum die Plattform-Prüfung deaktiviert ist: Browser-CORS-Preflights haben kein JWT; der Funktionscode prüft anschließend selbst den angemeldeten Supabase-Nutzer und dessen Bereich. Es sind dafür keine zusätzlichen Secrets anzulegen.

## Betriebshinweise

- Exportiere regelmäßig CSV aus der App und bewahre die bisherige JSON-Sicherung separat auf.
- Supabase Free enthält derzeit 500 MB Datenbank, 1 GB Storage und 500.000 Edge-Function-Aufrufe monatlich. Für zwei Personen ist das in der Regel mehr als ausreichend.
- Free-Projekte können nach etwa einer Woche geringer Aktivität pausiert werden. Die Daten bleiben erhalten und lassen sich im Supabase-Dashboard mit **Resume project** wieder aktivieren. Eine kostenlose Lösung kann daher keinen ununterbrochenen 24/7-Betrieb garantieren.
