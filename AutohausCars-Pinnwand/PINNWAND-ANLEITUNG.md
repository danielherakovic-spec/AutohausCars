# Pinwand für CarsAutoHaus

Die vorhandene Website wurde um eine helle Pinwand ergänzt. Der Quellcode stammt aus dem öffentlichen Repository `danielherakovic-spec/AutohausCars`, Branch `main`, abgerufen am 17.09.2026. Es wurde nichts auf GitHub veröffentlicht und nichts an deiner Supabase-Datenbank geändert.

## Was enthalten ist

- Eine anfangs leere, bildschirmfüllende Pinwand mit einer schlichten Werkzeugleiste.
- Kleine Autokarten aus deinem vorhandenen Fahrzeugbestand: Foto, Marke/Modell, Preis (Angebotspreis, sonst Einkaufspreis), Baujahr, Kilometer, Kraftstoff und Getriebe.
- Notizkarten mit frei bearbeitbarem Titel und mehrzeiligem Text.
- Freies Verschieben mit Maus, Touch oder Pfeiltasten auf der Kartenleiste.
- Fäden zwischen beliebigen Karten: ziehen oder zwei Verbindungspunkte anklicken.
- Freie Kartenfarben über den Farbwähler, mit angepasster heller/dunkler Schrift.
- Karten und Fäden löschen; die letzte Löschung lässt sich rückgängig machen. Fahrzeugakten werden durch das Entfernen einer Karte nicht gelöscht.
- Zwei Autos markieren und im bestehenden „Vergleich Pro“ öffnen.
- Fläche verschieben, zoomen und alle Karten in die Ansicht einpassen.
- Automatisches Speichern im Browser sowie Export und Import einer Pinwand-Sicherung.

## Am einfachsten: das Update-Paket hochladen

1. Öffne https://github.com/danielherakovic-spec/AutohausCars und wähle den Branch `main`.
2. Erstelle bei Bedarf eine Sicherung des aktuellen Quellcodes: **Code → Download ZIP**.
3. Entpacke `AutohausCars-Pinnwand-Update.zip` auf deinem Computer.
4. Klicke im Repository über der Dateiliste auf **Add file → Upload files**.
5. Ziehe die folgenden sechs Dateien aus dem entpackten Ordner in das Upload-Feld:

   - `index.html`
   - `app.js`
   - `comparison-pro.js`
   - `sw.js`
   - `pinboard.js`
   - `pinboard.css`

   Lade die Dateien direkt hoch, nicht das ZIP und nicht den übergeordneten Ordner. Sie müssen auf derselben Ebene liegen wie deine bisherige `index.html`. Vier Dateien werden aktualisiert, zwei kommen hinzu. Die Anleitung kannst du ebenfalls hochladen, sie ist für die Funktion nicht erforderlich.

6. Schreibe als Commit-Nachricht z. B. **Pinwand mit Autokarten und Notizen hinzufügen**. Für die direkte Aktualisierung wähle das Commit nach `main` und bestätige **Commit changes**. Wenn GitHub wegen deiner Branch-Regeln einen neuen Branch verlangt, erstelle darüber einen Pull Request und führe ihn anschließend nach `main` zusammen.
7. Öffne **Actions** und warte, bis der Pages-Deployment-Lauf erfolgreich abgeschlossen ist.
8. Öffne https://danielherakovic-spec.github.io/AutohausCars/ und lade einmal mit **Strg + F5** neu. Auf dem Handy die Website bzw. installierte Web-App vollständig schließen und neu öffnen, falls noch die alte Version erscheint.
9. Melde dich wie gewohnt an. Auf der Startseite findest du **Pinwand öffnen ↗**, zusätzlich gibt es **Pinwand** in der Navigation.

Die Website ist bereits veröffentlicht. Normalerweise brauchst du deshalb an GitHub Pages nichts zu ändern. Falls kein Deployment startet, prüfe **Settings → Pages**: Bei Veröffentlichung aus einem Branch sollten **Deploy from a branch**, **main** und **/(root)** eingestellt sein. Nutzt dein Repository bereits einen eigenen GitHub-Actions-Workflow, behalte diesen bei.

GitHub-Dokumentation:
- Dateien hochladen: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- Pages-Veröffentlichung: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Komplette Website-Dateien

`AutohausCars-Pinnwand-Komplett.zip` enthält die gesamte vorhandene Website samt Änderungen, vorhandenen Supabase-Dateien und Tests. `index.html` liegt direkt im ZIP-Hauptverzeichnis. Das kleine Update-Paket reicht zum Einbau in dein bestehendes Repository aus.

Die vorhandene `config.js` bleibt unverändert. Du musst keine neuen Schlüssel eintragen. Das vollständige Paket enthält Website-Quellcode; private Fahrzeugdaten und Fotos werden wie bisher erst nach Anmeldung aus deinem Supabase-Projekt geladen. Sie sind kein Bestandteil dieses Quellcode-Downloads.

## Supabase: keine Schritte erforderlich

Für diese Version sind **keine SQL-Migration, keine neue Tabelle und keine neue Edge Function erforderlich**. Bitte führe die bereits vorhandenen Setup-Dateien im Paket nicht erneut aus, nur um die Pinwand einzubauen.

Fahrzeuge und Fotos kommen weiterhin aus deiner bestehenden Supabase-Anbindung. Pinwand-Positionen, Notizen, Kartenfarben und Fäden werden **nur im Browser dieses Geräts** gespeichert, getrennt je Workspace. Sie werden nicht automatisch zwischen Geräten oder zwischen verschiedenen Browsern geteilt. Das ist auch in der Pinwand-Hilfe beschrieben.

Mit **Export** lädst du eine JSON-Sicherung herunter; über **Import** kannst du sie auf demselben oder einem anderen Gerät laden. Dort muss derselbe Fahrzeugbestand verfügbar sein, da Autokarten die vorhandenen Fahrzeug-IDs referenzieren. Der Import ersetzt nur die Pinwand, keine Fahrzeugdaten. Die letzte Ersetzung kann über **Rückgängig** widerrufen werden. Das Löschen von Website-/Browserdaten entfernt auch die lokal gespeicherte Pinwand; eine vorher exportierte Sicherung kann wieder importiert werden.

## Bedienung

1. **+ Auto**: Fahrzeug suchen und anklicken. Es erscheint als kleine Karte auf der Pinwand. Ein Fahrzeug kann auch mehrfach angepinnt werden.
2. **+ Notiz**: Titel und Text eingeben. Der Textbereich kann unten rechts größer gezogen werden.
3. **Verschieben**: Obere Kartenleiste ziehen. Mit der Tastatur: Leiste mit Tab fokussieren und Pfeiltasten verwenden; Umschalt bewegt in größeren Schritten.
4. **Verbinden**: Den Punkt rechts an einer Karte auf eine andere Karte ziehen. Alternativ den Punkt an der ersten und dann an der zweiten Karte anklicken. Escape bricht eine begonnene Verbindung ab.
5. **Farbe**: Auf den Farbpunkt oben rechts an der Karte klicken und eine Farbe wählen.
6. **Vergleich**: Bei zwei verschiedenen Autos **Im Vergleich** markieren und oben **Vergleichen (2/2)** drücken. Die beiden Fahrzeug-IDs werden direkt an „Vergleich Pro“ übergeben.
7. **Löschen**: × entfernt die Karte und ihre Fäden. Einen einzelnen Faden anklicken oder fokussieren und Entf drücken. **Rückgängig** stellt die letzte gelöschte Karte bzw. Verbindung wieder her.
8. **Navigieren**: Leere Fläche ziehen oder mit dem Mausrad verschieben. + / − zoomen; Strg + Mausrad zoomt um den Mauszeiger. **Alle** passt die Ansicht an die vorhandenen Karten an. Der Pfeil links oben führt zur Startseite zurück.

## Prüfung

- Vorhandene Tests: `node --test tests/vehicle-analysis.test.mjs`.
- Neue Browserprüfung: `node tests/pinboard.browser.cjs` mit installiertem Playwright und Microsoft Edge.
- Die Browserprüfung verwendet ausschließlich Testfahrzeuge und eine simulierte Supabase-Anbindung. Sie liest oder verändert keine produktiven Daten.
- Getestet werden die leere Ansicht, Notizen, Farben, Maus- und Touch-Bewegung, Fäden, Vergleichsübergabe, Neuladen, Löschen/Rückgängig, Tastatur, Export/Import und die mobile Ansicht.

Die Live-Anmeldung und die privaten Daten deines Supabase-Projekts wurden nicht getestet. Nach dem Hochladen einmal mit zwei eigenen Fahrzeugen einschließlich eines Fahrzeugfotos prüfen.
