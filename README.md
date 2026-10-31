# Werwolf-Online

Digitale Umsetzung des Kartenspiels Werwolf: eine modulare, getestete Spiel-Engine (TypeScript, ohne UI-Abhängigkeit), Offline-Bots mit Chat und eine spielbare Hot-Seat-Oberfläche mit Grafik-Platzhaltern.

## Schnellstart

```bash
npm install
npm run dev        # Oberfläche unter http://localhost:5173 (mit ?debug: Debug-Protokoll)
npm test           # automatisierte Tests
npm run build      # Typprüfung + Produktionsbuild nach dist/
```

Benötigt Node.js 22.12 oder neuer.

## Aufbau

| Bereich | Datei(en) | Aufgabe |
| --- | --- | --- |
| Game Engine | `src/engine/game.ts`, `phases.ts` | Partie, Befehle (`dispatch`), Zustandsautomat |
| Game Configuration | `src/engine/config.ts`, `distribution.ts` | Regeln, Validierung, Kartenstapel, Rollenverteilung |
| Role Registry | `src/engine/registry.ts`, `definitions.ts` | Katalog aller Rollen, Fähigkeiten, Teams, Regeln |
| Action Resolver | `src/engine/actions.ts`, `night.ts` | Fähigkeiten prüfen und ausführen, Nachtauflösung |
| Death Resolver | `src/engine/deaths.ts` | Todesfälle, Kettenreaktionen, Todesfähigkeiten |
| Voting System | `src/engine/voting.ts` | Abstimmung, Enthaltung, Gleichstand, Stichwahl |
| Win Condition Evaluator | `src/engine/win.ts` | alle Siegbedingungen zentral, nach Priorität |
| Ansichten | `src/engine/views.ts` | pro Spieler nur erlaubte Informationen |
| Rollen | `src/roles/*.ts` | je Rolle eine Datei, Katalog in `src/roles/index.ts` |
| Sonderregeln | `src/rules/*.ts` | z.B. gemischtes Liebespaar |
| Chat | `src/engine/chat.ts` | Tagesgespräch als Befehl `CHAT` |
| Bots | `src/bots/*` | Bot-Spieler: Verdacht, Fähigkeiten, Abstimmung, Chat ([docs/bots.md](docs/bots.md)) |
| Übersetzer | `src/translation/*` | Spracherkennung und Übersetzung für den Chat |
| UI Layer | `src/ui/*` | Hot-Seat-Oberfläche, keine eigenen Spielregeln |

Prinzipien:

- Der Spielzustand ist reines JSON. Partien lassen sich speichern (`snapshot()`), übertragen und fortsetzen (`Game.restore()`).
- Jede Eingabe ist ein Befehl (`START_GAME`, `ADVANCE`, `USE_ABILITY`, `VOTE`, `CHAT`, `TIMEOUT`, `ABORT`). Er wird auf einer Kopie ausgeführt und nur bei Erfolg übernommen. Ungültige Befehle liefern einen Fehlercode und eine deutsche Meldung, der Zustand bleibt unverändert.
- Zufall ist deterministisch (Seed im Zustand): Tests und Wiederholungen sind reproduzierbar.
- Die Engine misst keine Zeit. Server oder Oberfläche senden bei Ablauf `TIMEOUT`, die Engine wendet die Ersatzregel jeder offenen Entscheidung an. So kann keine Partie dauerhaft hängen.
- `viewFor(spielerId)` liefert nur, was dieser Spieler sehen darf, `publicView()` nur Öffentliches. Ein späterer Online-Server verschickt genau diese Objekte.

## Ablauf (Zustandsautomat)

```
SETUP -> ROLE_DISTRIBUTION -> NIGHT_START -> NIGHT_ACTIONS -> NIGHT_RESOLUTION
      -> DEATH_RESOLUTION -> WIN_CHECK -> DAY_ANNOUNCEMENT -> DAY_DISCUSSION -> DAY_VOTING
      -> VOTE_RESOLUTION -> (Stichwahl: DAY_VOTING) -> DEATH_RESOLUTION -> WIN_CHECK -> NIGHT_START ...
```

Wartende Phasen brauchen Eingaben. `NIGHT_START`, `NIGHT_RESOLUTION`, `VOTE_RESOLUTION` und `WIN_CHECK` laufen automatisch durch. `DEATH_RESOLUTION` wartet nur, solange eine Todesentscheidung offen ist (Jäger). Erlaubte Befehle und Übergänge je Phase stehen zentral in `PHASE_SPECS` (`src/engine/phases.ts`).

Nachts werden Schritte in Weckreihenfolge aufgerufen (Standard: Dieb 10, Amor 20, Verliebte 30, Seherin 40, Werwölfe 50, Hexe 60; über `nightOrder` änderbar). Entscheidungen werden gesammelt und erst in `NIGHT_RESOLUTION` nach Auflösungspriorität verrechnet. Angriffe und Schutzeffekte werden am Ende gegeneinander geprüft, daher spielt die Eingangsreihenfolge keine Rolle.

## Rollen

Grundspiel ("Die Werwölfe von Düsterwald"):

| Rolle | Fraktion | Fähigkeit |
| --- | --- | --- |
| Dorfbewohner | Dorf | keine |
| Werwolf | Werwölfe | wählt nachts gemeinsam mit dem Rudel ein Opfer, Rudel kennt sich |
| Seherin | Dorf | sieht nachts die Karte eines Spielers: genaue Rolle (Originalregel, Standard in der Oberfläche) oder nur Werwolf ja/nein (Standard der Engine) |
| Hexe | Dorf | Heiltrank (rettet das Werwolfopfer) und Gifttrank, je einmal |
| Jäger | Dorf | nimmt beim Tod einen Spieler mit |
| Amor | Dorf | verliebt in Nacht 1 zwei Spieler, die gemeinsam sterben |
| Dieb | Dorf | tauscht in Nacht 1 mit einer von zwei Zusatzkarten |
| Hauptmann (Regel) | – | wird am ersten Tag gewählt, Stimme zählt doppelt, entscheidet Gleichstände, bestimmt beim Tod seinen Nachfolger |

Erweiterung Neumond:

| Rolle | Fraktion | Fähigkeit |
| --- | --- | --- |
| Heiler | Dorf | schützt nachts einen Spieler vor den Werwölfen, nie zweimal hintereinander denselben |
| Der Alte | Dorf | übersteht den ersten Werwolfangriff; tötet ihn das Dorf (Abstimmung, Hexe, Jäger), verlieren alle Dorfbewohner ihre Fähigkeiten |
| Dorfdepp | Dorf | wird bei der Verbannung verschont, darf danach nicht mehr abstimmen |
| Sündenbock | Dorf | stirbt bei Gleichstand statt der anderen und bestimmt, wer am nächsten Tag abstimmen darf |
| Flötenspieler | allein | verzaubert jede Nacht zwei Spieler, gewinnt, wenn alle anderen Lebenden verzaubert sind |

Erweiterung Charaktere:

| Rolle | Fraktion | Fähigkeit |
| --- | --- | --- |
| Zwei Schwestern / Drei Brüder | Dorf | kennen sich (nur zu zweit bzw. zu dritt im Spiel) |
| Wolfshund | Dorf | entscheidet in Nacht 1, ob er Werwolf wird |
| Wildes Kind | Dorf | wählt in Nacht 1 ein Vorbild; stirbt es, wird das Kind ein Werwolf |
| Fuchs | Dorf | prüft nachts einen Spieler und seine zwei Sitznachbarn auf Werwölfe, ohne Fund verliert er die Fähigkeit |
| Bärenführer | Dorf | morgens brummt der Bär, wenn ein Sitznachbar ein Werwolf ist |
| Ritter mit dem rostigen Schwert | Dorf | fressen ihn die Werwölfe, stirbt der nächste Werwolf links von ihm in der folgenden Nacht |
| Stotternder Richter | Dorf | verlangt einmal pro Partie heimlich eine zweite Abstimmung am selben Tag |
| Engel | allein | gewinnt, wenn er bei der ersten Abstimmung verbannt wird, danach Dorfbewohner |
| Urwolf | Werwölfe | kann einmal das Opfer anstecken statt es zu fressen: es wird heimlich ein Werwolf |
| Großer böser Wolf | Werwölfe | frisst ein zweites Opfer, solange noch kein Werwolf gestorben ist |
| Weißer Werwolf | allein | jagt mit dem Rudel, tötet in jeder zweiten Nacht einen Werwolf, gewinnt nur als letzter Überlebender |

Nicht umgesetzt, weil sie im Kartenspiel auf körperlichen Handlungen beruhen oder Regeln mitten im Aufdecken ändern: das Mädchen (blinzelt bei den Werwölfen), die Ergebene Magd (übernimmt die Rolle eines Verbannten vor dem Aufdecken) und der Gaukler/Schauspieler (wechselt jede Nacht zwischen offen ausgelegten Rollen).

Sitzordnung: Die Reihenfolge der Spielerliste gilt als Sitzkreis, "links" ist der nächste Spieler in der Liste.

## Standardregeln und Entscheidungen

Wo die Vorgaben offen oder widersprüchlich waren, gilt (alles konfigurierbar):

- Werwolf-Sieg: Parität (Werwölfe >= alle lebenden Gegner). Alternative `werewolfWin: 'elimination'`.
- Dorf-Sieg: kein lebender Gegner des Dorfes mehr. Überlebt niemand: Unentschieden.
- Gleichstand: Stichwahl; endet auch die unentschieden, stirbt niemand (`runoffTieBreak`).
- Enthaltung erlaubt, Stimmänderung aus, Einzelstimmen geheim. Fehlende Stimmen bei Abstimmungsende = Enthaltung.
- Beim Tod wird die Rolle aufgedeckt (`revealRoleOnDeath`: Rolle, Fraktion oder nichts).
- Werwölfe: Opfer erst bei Einigkeit aller lebenden Werwölfe. Bei Zeitablauf entscheidet die Mehrheit, bei Gleichstand das Los, ohne Stimmen stirbt niemand.
- Hexe: darf sich selbst heilen und beide Tränke in einer Nacht nutzen. Der Heiltrank schützt nur vor dem Werwolfangriff, nicht vor Gift.
- Jäger: schießt bei jeder Todesursache, darf verzichten; bei Zeitablauf verzichtet er.
- Amor: darf sich selbst wählen. Die Verliebten sterben gemeinsam, behalten aber ihre Fraktion. Sonderregel `mixed-lovers` (aus): gemischtes Paar gewinnt, wenn nur die beiden überleben.
- Dieb: wacht als Erster auf (sonst könnte ein Dieb, der Amor zieht, nicht mehr handeln). Sind beide Karten Werwölfe, muss er einen nehmen. Ohne Tausch oder bei Zeitablauf bleibt er Dieb und spielt als Dorfbewohner. Die Verteilung stellt sicher, dass nie alle Werwölfe bei den Zusatzkarten landen.
- Konfiguration: mindestens 3 Spieler, mindestens ein Werwolf, weniger Werwölfe als die Hälfte der Spieler, Sonderrollen höchstens einmal, mit Dieb 2 Karten mehr als Spieler.

## Hot-Seat-Oberfläche

Ein Gerät ist der Erzähler. Rollen werden reihum geheim angesehen, die Abstimmung läuft geheim reihum.

Nachts geht das Gerät standardmäßig reihum (Regel `nightMode: 'pass'`, in der Vorbereitung abschaltbar): Jeder lebende Mensch bekommt es einmal in Sitzreihenfolge. Wer eine Rolle mit Nachtaktion hat, entscheidet; alle anderen erledigen eine kurze Tarnaufgabe. So verrät weder das Geräusch beim Nehmen des Geräts noch ein liegen bleibendes Gerät (Rolle bei einem Bot), wer welche Rolle hat. Rollen, die auf andere warten (Hexe und Urwolf auf die Werwölfe, Verliebte auf Amor), handeln in einer zweiten Runde. Ob es sie gibt, hängt nur vom Kartenstapel ab, nicht davon, wer welche Rolle hat. Werwölfe stimmen dabei einmal ab und sehen die bisherigen Stimmen ihres Rudels; nach der letzten Stimme entscheidet die Mehrheit. Abgeschaltet ruft das Gerät wie ein Spielleiter die Rollen einzeln auf.

In der Vorbereitung lässt sich jeder Platz als Bot markieren, "Einzelspieler gegen Bots" füllt alle anderen Plätze mit Bots. Bots bekommen jede Partie neue, zufällige Benutzernamen (z.B. `le_na3`, `nachteule7`, `ShadowFox92`). Bots handeln selbstständig, Menschen werden nur für ihre eigenen Schritte aufgerufen. Tagsüber gibt es einen Chat: Bots beschuldigen mit Begründung, verteidigen sich und antworten auf Fragen. Details und Grenzen in [docs/bots.md](docs/bots.md).

## Bots und Sprachen

Die Bots laufen ohne KI-Dienst und ohne API-Schlüssel. Sie verstehen und schreiben Deutsch und Englisch. Andere Sprachen laufen über einen separaten Übersetzer: den in Chrome (ab Version 138, nur am Computer) eingebauten oder einen selbst betriebenen LibreTranslate-Server, dessen Adresse in der Vorbereitung eingetragen wird. Ohne Übersetzer antworten Bots auf Nachrichten in anderen Sprachen auf Englisch.

## Grafiken

Alle Grafiken und Töne laufen über `src/ui/assets.ts`. Dateien in `public/assets/` ablegen und dort eintragen, z.B. `cards: { werewolf: 'assets/cards/werewolf.png' }`. Fehlt ein Eintrag (auch bei neuen Rollen), erscheint automatisch ein Platzhalter. Die Grafiken sind Pixelgrafik im Retro-Stil: PNG in Originalgröße, das Spiel vergrößert ganzzahlig und ohne Weichzeichnen. Die Oberfläche ist passend gestaltet (eckige Formen, harte Schatten) Schriften: für Logo, Überschriften und Kartentitel die Pixelschrift Righteous von [Otter and Bench](https://otter-and-bench.itch.io/righteous) (CC BY 4.0 laut Begleitdatei der Werwolf-Karte; Umlaute und ß ergänzt, Nachweis in `public/licenses/`), für alles andere Pixelify Sans (SIL Open Font License). Beide Schriften werden mit dem Spiel ausgeliefert, nicht von fremden Servern geladen. Das Aussehen (Pergament, Holz, Gold, Nachtblau, Blutrot) folgt der Werwolf-Karte. Die vollständige Liste mit Dateinamen, Pixelmaßen und Hinweisen steht in [docs/assets.md](docs/assets.md).

## Neue Rolle hinzufügen

Siehe [docs/neue-rolle.md](docs/neue-rolle.md). Kurzfassung: Datei in `src/roles/` mit `defineRole(...)` anlegen, in `BASE_ROLES` eintragen, Test schreiben. Phasen, Nacht-, Todes- und Siegsystem bleiben unverändert. Bot-Verhalten für die neue Rolle: `registerBotAbility` (siehe [docs/bots.md](docs/bots.md)).
