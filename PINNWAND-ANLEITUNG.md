# Pinwand v18: gemeinsam für alle Benutzer + Taschenrechner

Alle Benutzer desselben gemeinsamen Fahrzeugbestands sehen dieselben Karten mit denselben Positionen, Stapelreihenfolgen, Farben, Notizen, Fäden und Rechnungen. Zoom, Bildausschnitt und Vergleichsauswahl bleiben persönlich. Die übrigen Funktionen und das Design bleiben erhalten.

## 1. Einmal in Supabase ausführen

1. Öffne dein bestehendes Projekt unter https://supabase.com/dashboard.
2. Öffne **SQL Editor → New query**.
3. Öffne die mitgelieferte Datei **supabase/pinboard-migration.sql** in einem Texteditor. Kopiere den gesamten Inhalt in die SQL-Abfrage.
4. Klicke **Run**. Die Abfrage legt die gemeinsame Pinwand, Berechtigungen und Speicherfunktionen an und aktiviert die Tabelle in der vorhandenen Realtime-Publication.
5. Keine anderen Setup-/Schema-Dateien erneut ausführen. Fahrzeugdaten, Zugangs-Passwort und vorhandene Konfiguration bleiben erhalten. Neue Schlüssel oder Edge Functions sind nicht nötig.

Die SQL-Datei lässt sich erneut ausführen, ohne Pinwanddaten zu löschen. Die Pinwand gehört zum Workspace: Mitglieder teilen sie; andere Workspaces erhalten keinen Zugriff. Zusätzlich zur Live-Übertragung wird der gemeinsame Stand regelmäßig nachgeladen.

## 2. Website-Dateien auf GitHub aktualisieren

1. Entpacke **AutohausCars-Pinnwand-v18-Update.zip**.
2. Öffne https://github.com/danielherakovic-spec/AutohausCars auf dem Branch **main**.
3. Wähle **Add file → Upload files**.
4. Lade die acht Website-Dateien direkt ins Hauptverzeichnis hoch:
   - index.html
   - app.js
   - comparison-pro.js
   - sw.js
   - pinboard.js
   - pinboard.css
   - pinboard-sync.js
   - pinboard-calculator.js
5. Nicht das ZIP und nicht den übergeordneten Ordner hochladen. Die SQL-Datei wird in Supabase ausgeführt; eine Kopie im Repository ist für den Betrieb nicht erforderlich.
6. Bestätige mit **Commit changes**, etwa mit der Nachricht „Gemeinsame Pinwand und Rechner-Karte“. Bei Branch-Schutz über einen neuen Branch einen Pull Request erstellen und nach main zusammenführen.
7. Warte unter **Actions** auf das erfolgreiche Pages-Deployment.
8. Lade deine Website mit **Strg + F5** neu. Auf dem Handy ggf. die Web-App vollständig schließen und erneut öffnen.
9. Melde dich wie gewohnt an und öffne **Pinwand** in der Navigation.

Die bestehende GitHub-Pages-Konfiguration bleibt unverändert. Das Update-Paket enthält auch die Dateien der ersten Pinwand-Version, falls du diese noch nicht installiert hast. **AutohausCars-Pinnwand-v18-Komplett.zip** enthält zusätzlich den vollständigen vorhandenen Website-Quellcode samt Supabase-Dateien und Tests. Private Fahrzeugdaten und Fotos bleiben in deiner bestehenden Datenbank.

## 3. Eine vorhandene lokale Pinwand übernehmen

Falls du die erste, nur lokal gespeicherte Pinwand bereits benutzt hast: **Vor dem Website-Update dort Export drücken.** Nach Update und Migration auf einem Gerät **Import** wählen und die JSON-Datei laden. Der Import ersetzt die gemeinsame Pinwand für alle und fragt deshalb vorher nach.

Ohne Import startet die gemeinsame Pinwand leer. Die alten lokalen Daten werden nicht gelöscht und nicht automatisch mit den persönlichen Pinwänden anderer Benutzer vermischt. Ein weiteres Gerät überschreibt beim Anmelden nicht die gemeinsame Pinwand mit seinem alten lokalen Stand.

## Taschenrechner

- **+ Rechner** erzeugt eine neue Karte.
- Rechnung direkt eingeben oder die Zahlentasten nutzen. **Enter** bzw. **=** berechnet das Ergebnis.
- Beispiele: `19900 + 850 - 300`, `(100 + 20) / 3`, `100 × 19%`.
- Dezimalkomma, Klammern und negative Zahlen werden unterstützt. Prozent bedeutet „geteilt durch 100“; `100 × 19%` ergibt `19`.
- **C** leert die Rechnung, **⌫** entfernt das letzte Zeichen.
- Rechnung und Ergebnis werden gemeinsam gespeichert. Verschieben, Farbe, Fäden und Löschen funktionieren wie bei den anderen Karten.

## Gemeinsames Arbeiten

Änderungen an unterschiedlichen Karten und unterschiedlichen Feldern derselben Karte werden zusammengeführt. Bei gleichzeitiger Änderung desselben Texts oder derselben Position gilt die zuletzt vom Server angenommene Änderung. Eine gelöschte Karte wird durch eine ältere Bearbeitung nicht wiederhergestellt.

Während du in ein Eingabefeld schreibst oder eine Karte ziehst, wird die Darstellung nicht mitten in der Eingabe neu aufgebaut. Empfangene Änderungen erscheinen anschließend. **Für alle synchronisiert** bestätigt die Übertragung. Verbindungsprobleme werden angezeigt; ausstehende Änderungen werden lokal zwischengespeichert und erneut gesendet. Fehlt die Migration, steht dies in der Fußleiste.

Auto-Karten entfernen löscht keine Fahrzeugakten. Export/Import sichert oder ersetzt die gemeinsame Pinwand, nicht den Fahrzeugbestand. Alle bisherigen Funktionen bleiben: frei bewegliche Karten, Notizen, Farben, Fäden, Vergleich, Löschen/Rückgängig, Zoom und Tastatur-/Touch-Bedienung.

## Prüfung

Die tatsächliche Migration wurde in einer lokalen PostgreSQL-Testlaufzeit ausgeführt: wiederholte Ausführung, Rechte, gemeinsame Daten, Feld-Zusammenführung und Löschungen wurden geprüft. Zwei getrennte Browsersitzungen haben mit dieser Datenbank denselben Stand bearbeitet; Notizen, Rechner-Ergebnisse und Löschungen wurden übertragen. Außerdem wurden die bisherigen Pinwandfunktionen einschließlich Handy-/Touch-Bedienung erneut geprüft.

Dein Live-Supabase-Projekt und die veröffentlichte Website wurden nicht verändert. Nach der Installation einmal auf zwei Geräten eine Testnotiz anlegen, um die Live-Anbindung zu prüfen.

Tests (Node.js; Browserprüfung benötigt Playwright/Microsoft Edge und @electric-sql/pglite):

```
node --test tests/pinboard-sync.test.cjs tests/vehicle-analysis.test.mjs
node tests/pinboard.database.cjs
node tests/pinboard.browser.cjs
```

Offizielle Dokumentation:
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
