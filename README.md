# CarsAutoHaus – Update v20

Basis: GitHub-Stand `98d8cdc85dfc308ba80ed6cb800438f4fb77d555`.

## Was sich ändert

- Die digitale Garage enthält **206 einzeln auswählbare Bauteile und Baugruppen**. Dazu gehören Motorinnenteile, Kühlsystem, Antrieb, Bremsen, Radaufhängungen, Elektrik, Innenraum, Rohbau und Varianten für Elektro/Hybrid. Notizen und Kosten bleiben je Fahrzeug und Bauteil getrennt. Gruppenfilter und „Innenleben freilegen“ machen verdeckte Teile erreichbar.
- Das Fahrzeug heißt in den Ansichten beispielsweise **VW Polo 2014 · Rinteln**. Bestehende Standortdaten werden automatisch genutzt, ohne das Modellfeld zu verändern. Fehlt der Ort, steht dort „Standort offen“. Eine vorhandene Showroom-Zuordnung dient als Ersatz.
- In der Garage kannst du deinen Namen eintragen und **Arbeit beginnen / Arbeit beenden** wählen. Andere sehen den Arbeitsstatus samt Personensymbol. Ein verwaister Status läuft nach 90 Sekunden ohne Aktualisierung aus; spätestens beim nächsten Anzeigeintervall verschwindet er. Das Öffnen der Garage allein gilt nicht als Arbeiten.
- **Archivierte Fahrzeuge** stehen direkt neben **Alle Fahrzeuge** im Schnellzugriff. Das Archivsymbol neben dem Favoritenstern verschiebt ein Auto ins Archiv; dort holt der Zurück-Pfeil es zurück. Die Akte und ihre Garagen-/Kalenderverknüpfungen bleiben erhalten. Schon als „Archiviert“ markierte Autos erscheinen automatisch im Archiv.
- **Offene Aufgaben** lassen sich abhaken, löschen und anpinnen. Angeheftete Aufgaben erscheinen als Notizkarten auf der Startseite und auf der gemeinsamen Pinwand. Dort kannst du sie ebenfalls erledigen und löschen. Das × oben an der Karte löst nur die Anheftung. Alte angeheftete Chat-Notizen werden einmalig als Aufgaben übernommen.
- Pinwandkarten haben links und rechts Verbindungspunkte. Die Hintergrundfarbe stellst du oben bei **Hintergrund** ein. Farbe, Kartenpositionen und Fäden werden gemeinsam gespeichert; Zoom bleibt persönlich. Frei wählbare Kartenfarben und der Taschenrechner bleiben erhalten.
- Chat, Team-Notizen, Ankauf, Buchhaltung, Integrationen, KI-Fahrzeugranking und Dokumente sind aus der Oberfläche entfernt. Bereits gespeicherte Inhalte werden nicht aus der Datenbank gelöscht.
- Profil und Zugang findest du über **⚙ Einstellungen**, nicht mehr in der unteren Navigation.
- Das Design verwendet Graphit, Silber und zurückhaltendes Blau. Kalender, Vergleich, Import, Diktation und Showrooms bleiben verfügbar.
- Mehrfaches Speichern verwendet dieselbe Fahrzeug-ID und wird während einer laufenden Speicherung gesperrt. FIN und Fahrzeugnummer werden zusätzlich auf Duplikate geprüft, auch serverseitig. Ähnliche Autos ohne eindeutige Kennung werden nicht automatisch zusammengelegt. Bereits vorhandene separate Akten werden nicht ungefragt gelöscht.

Die 3D-Darstellung ist ein detailliertes, illustratives Fahrzeugmodell. Sie enthält Varianten und ist kein maßstabsgetreuer Original-Zwilling oder vollständiger Ersatzteilkatalog des ausgewählten Modells. Bauteilkosten sind eure Eingaben, keine automatisch ermittelten Werkstattpreise.

## 1. Supabase aktualisieren

1. Öffne dein **bestehendes** Supabase-Projekt.
2. Öffne **SQL Editor → New query**.
3. Öffne die Datei **supabase/v20-update.sql** aus diesem Paket und kopiere ihren gesamten Inhalt in die Abfrage.
4. Klicke **Run**. Die Abfrage darf erneut ausgeführt werden. Sie ersetzt keine Zugangsdaten und löscht keine Fahrzeuge, Aufgaben, Termine oder Garagennotizen.

Nur diese Update-Datei ausführen. Für dieses Update brauchst du kein neues Projekt, keine neuen Schlüssel und keine neue Edge Function.

## 2. GitHub-Dateien ersetzen

1. Entpacke **CarsAutoHaus-v20-GitHub.zip** vollständig.
2. Öffne deinen lokalen GitHub-Repositoryordner **AutohausCars**. Dort liegen bereits `index.html`, `app.js` und `config.js`.
3. Kopiere den **Inhalt** des entpackten Pakets direkt hinein. Bestätige das Ersetzen gleichnamiger Dateien. Die neuen Dateien dürfen nicht in einem zusätzlichen Unterordner landen.
4. Deine vorhandene `config.js` beibehalten, falls du dort zwischenzeitlich eigene Einstellungen geändert hast. Die mitgelieferte Datei ist unverändert aus dem oben genannten GitHub-Stand übernommen.
5. Öffne GitHub Desktop und wähle das Repository **AutohausCars**.
6. Trage im Feld **Summary** zum Beispiel `Update v20: Garage, Aufgaben und Fahrzeugarchiv` ein. Ohne diese Zusammenfassung ist Commit nicht möglich.
7. Klicke **Commit to main** beziehungsweise den angezeigten Branch und anschließend **Push origin**.
8. Warte, bis GitHub Pages den Build beendet hat. Lade die Website mit **Strg + F5** neu.

Alternativ kannst du über **Add file → Upload files** im GitHub-Repository die entpackten Dateien einschließlich der Unterordner hochladen und unten committen. Nicht die ZIP-Datei selbst hochladen.

`operations-suite.js`, `vehicle-analysis.mjs`, `vehicle-analysis.css` und `palette-lock.css` werden von dieser Version nicht mehr geladen. Wenn sie noch in deinem Repository liegen, kannst du diese vier alten Dateien entfernen. Alte Unterordner mit Website-Kopien gehören nicht zu diesem Paket.

## 3. Kurz selbst prüfen

1. Startseite: Archiv und Offene Aufgaben öffnen; rechts oben Einstellungen öffnen.
2. Ein Auto archivieren und wiederherstellen. Der Ort muss im Fahrzeugnamen stehen.
3. Eine Aufgabe anpinnen, auf der Pinwand abhaken und wieder löschen.
4. Zwei Karten links/rechts verbinden und die Hintergrundfarbe ändern. In einem zweiten angemeldeten Browser den gemeinsamen Stand kontrollieren.
5. Garage: Auto wählen, „Arbeit beginnen“ wählen und ein Bauteil mit Notiz/Kosten speichern. Im zweiten Browser müssen Status und Notiz erscheinen.

## Geprüft

23 automatisierte Fachlogiktests; echte PostgreSQL-Funktionstests mit wiederholter Migration, Benutzerrechten, konkurrierenden Änderungen und Duplikatschutz; Browserablauf mit zwei Sitzungen, WebGL, Archiv/Wiederherstellung, Aufgaben, Pinwand, Kalender und Mehrfachspeicherung. Die Handyansichten wurden bei 390 × 844 Pixeln kontrolliert.

Die Tests verwenden Beispieldaten in einer lokalen Testdatenbank. Dieses Paket ist vorbereitet; es veröffentlicht sich nicht selbst auf GitHub und führt keine Abfrage in deinem echten Supabase-Projekt aus.
