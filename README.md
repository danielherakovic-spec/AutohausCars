# AutoValue Pro – gemeinsames Passwort ohne Edge Function

Diese Ausgabe öffnet den gemeinsamen Fahrzeugbestand mit einem einzigen Passwort, **ohne Supabase Edge Function**. Der Browser meldet sich dafür nur anonym bei Supabase an und ruft anschließend eine sichere Datenbankfunktion (`av_enter_shared_workspace`) auf. Nach erfolgreicher Passwortprüfung erhält genau diese anonyme Sitzung die bestehende Workspace-Mitgliedschaft.

Fahrzeuge, Aufgaben, Realtime-Updates und private Fotos bleiben in Supabase. Das Passwort steht weder in dieser App noch in GitHub: Supabase speichert ausschließlich seinen bcrypt-Hash im privaten Schema `private`.

## KI-Fahrzeug-Ranking

Unter **KI-Ranking** stehen alle Fahrzeuge untereinander, nach einer Bewertung von 1 bis 100 sortiert. Ein Klick auf ein Fahrzeug öffnet die automatische Begründung sowie eine individuell ausgefüllte Nachrichtenvorlage für den Händler. Die Bewertung wird lokal aus den gespeicherten Preis-, Vergleichs-, Kilometer-, Ausstattungs- und Margendaten berechnet; sie benötigt weder einen KI-Server noch eine Edge Function. Sie ist eine Entscheidungshilfe und ersetzt die Prüfung von Fahrzeug, Historie und Marktpreis nicht.

## Warum diese Variante zuverlässig und sicher ist

1. Der Browser erstellt eine anonyme, authentifizierte Supabase-Sitzung.
2. Er sendet das Passwort über die normale HTTPS-Supabase-API an die RPC `av_enter_shared_workspace`.
3. Die `SECURITY DEFINER`-Funktion verwendet selbst `auth.uid()` und den signierten JWT-Claim `is_anonymous` (keine vom Browser gelieferte Nutzer-ID), akzeptiert nur anonyme Auth-Sitzungen und prüft das Passwort gegen den bcrypt-Hash in `private.av_shared_access_config`.
4. Erst dann legt sie die Mitgliedschaft an und liefert Workspace-ID und Datenbestand zurück. RLS schützt anschließend weiterhin Bestand und Fotos.

Der Publishable/Anon Key in `config.js` ist für Browser vorgesehen und kein Geheimnis. Niemals Passwort, Service-Role-Key oder Secret-Key eintragen oder committen.

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
