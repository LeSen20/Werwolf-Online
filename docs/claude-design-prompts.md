# Prompts für Claude Design

Stand: 31.10.2026. Claude Design (claude.ai/design, Anthropic Labs) entwirft Oberflächen, Prototypen und Folien im Gespräch. Laut Hilfeseiten und Testberichten exportiert es ZIP, PDF, PPTX, eigenständiges HTML, nach Canva und als Übergabe an Claude Code. Ein PNG-Export ist nicht dokumentiert, bitte vor dem Start selbst prüfen.

Daraus folgt:

| Aufgabe | Werkzeug | Prompt |
| --- | --- | --- |
| Design-System aus dem Repo | Claude Design | 1 |
| Bildschirme verbessern, dann an Claude Code übergeben | Claude Design | 2 |
| Hintergründe, Avatare, Symbole, Logo | Claude Design, als HTML-Seite mit PNG-Download (Umweg, nicht getestet) | 3 |
| Rollenkarten (20) | derselbe Weg wie bei der Seherin, nicht Claude Design | 4 |

Die Rollenkarten brauchen deinen Python-Generator, ein PNG-Sprite-Sheet und Aseprite-JSON. Das liefert Claude Design laut Exportliste nicht.

---

## Prompt 1: Design-System (einmal)

Repo `lesen20/werwolf-online` verbinden, Branch `claude/werwolf-grundlogik`. Dazu die Kartenbilder `werewolf.png`, `seer.png`, `witch.png`, `villager.png` und `back.png` aus `public/assets/cards` hochladen.

```text
Lege ein Design-System für mein Browserspiel "Werwolf" an. Quelle ist das verbundene Repo,
vor allem src/ui/styles.css, src/ui/components.ts und die Kartenbilder in public/assets/cards.

Stil: Retro-Pixelgrafik wie die Rollenkarten. Pergament im dunklen Holzrahmen mit Goldeinlage,
Nachthimmel, Blutrot. Eckige Formen, harte Schatten (4 px versetzt, ohne Unschärfe), keine
Rundungen, keine Verläufe, keine halbtransparenten Kanten.

Farben, exakt übernehmen:
- Pergament #e3d3aa, Pergament dunkel #d3bf93, Eingabefeld #f2f0e6
- Holz #261912, Holz hell #5a3f28, Gold #a88b45, Rand #a28a61
- Blutrot #961f1e (Akzent, Knöpfe), Text #150e0b, Text gedämpft #5a3f28
- Nachtblau #0f142b, Dorf #35426e
- Seitengrund je Phase: Vorbereitung #261912, Tag #5a3f28, Nacht #0c0e20, Spielende #07070c

Schriften:
- Logo und kurze Überschriften: Righteous in der Pixelfassung mit Umlauten
  (src/ui/fonts/Righteous-umlaute.ttf), nur 16, 24 oder 32 px, erster Buchstabe rot.
- Fließtext, Fragen, Knöpfe, Chat: Pixelify Sans 400 und 700.

Bausteine: Panel (Pergament, 2 px Holzrand, innen 2 px Gold, harter Schatten), Knopf primär
(Blutrot, heller Text, 2 px Rand, harter Schatten, beim Drücken 2 px eingedrückt), Knopf
sekundär (Pergament dunkel), Auswahlknopf (gewählt: Holz mit Goldrand), Schild/Tag,
Fortschrittsbalken, Stimmenbalken, Spielerkachel mit Avatar, Chatzeile, Menü,
Rollenkarte 192 x 288 px (fertiges Bild, nie nachzeichnen).

Regeln: Pixelgrafik nur ganzzahlig skalieren (1x, 2x) mit image-rendering: pixelated.
Tippflächen mindestens 44 px hoch. Kontrast nach WCAG AA.
```

---

## Prompt 2: Bildschirme (Prototyp und Übergabe an Claude Code)

Dazu aktuelle Screenshots hochladen (Handy und Desktop) oder die laufende Seite mit dem Web-Capture erfassen.

```text
Entwirf mit dem Design-System "Werwolf" alle Bildschirme als klickbaren Prototyp, einmal für
Handy (390 x 844) und einmal für Desktop (1280 x 800). Halte dich eng an die bestehende
Oberfläche und verbessere Hierarchie, Abstände und Lesbarkeit. Keine neuen Spielregeln,
keine neuen Funktionen, keine Texte erfinden, die eine Regel anders beschreiben.

Das Spiel ist Hot-Seat: Ein Gerät wird herumgereicht, Bots spielen mit.
1. Vorbereitung: Spielerliste (Name, Bot ja/nein, entfernen), Sonderrollen gruppiert nach
   Grundspiel, Neumond und Charaktere, Kartenstapel als Schilder, Regeln und Sprachen
   aufklappbar, Startleiste unten fest mit Status und "Spiel starten".
2. Gerät weitergeben: "Gib das Gerät an [Name]", Name groß, Kartenrückseite, Knopf "Ich bin [Name]".
3. Rolle ansehen: große Rollenkarte, Beschreibung, "Das weißt du" (z.B. Mitwerwölfe),
   Knopf "Karte verdecken und weitergeben".
4. Nacht reihum: "Alle Augen sind zu", je Spieler Weitergeben, eigener Zug mit kleiner Karte,
   Frage, Spielerauswahl, "Bestätigen" und "Nicht einsetzen"; Tarnaufgabe für Spieler ohne
   Aktion; Ergebnis hervorgehoben (z.B. Seherin); "Augen schließen und Gerät weitergeben";
   Wartebildschirm.
5. Tag: Morgenmeldung, Spielerliste mit Toten und Hauptmann-Abzeichen, Diskussion mit
   Restzeit, Chat mit Bots (Avatar, Name, Text, "tippt ..."). Desktop: Chat rechts daneben.
6. Abstimmung und Hauptmannswahl: Weitergeben mit Stimmenfortschritt, geheime Stimme,
   "Abstimmung vorzeitig beenden" klein und abgesetzt.
7. Ergebnis: Stimmen als Balken, Verbannung und Tode hervorgehoben.
8. Spielende: Siegerbanner ("Sieger: Dorf"), alle Karten klein mit Name, Bot, lebt/tot,
   Sieger markiert, "Neue Partie".
9. Kopfzeile: Logo, Phase als Schild, Menü mit "Protokoll anzeigen" und "Partie abbrechen".

Pflicht für Hot-Seat:
- Jeder Weitergeben-Bildschirm und jeder Nachtzug sieht für alle Rollen gleich aus und
  ist gleich lang. Farbe, Länge, Animation oder Ton dürfen keine Rolle verraten.
- Während der Nacht bleibt alles nachtdunkel, auch wenn das Spiel intern schon beim Tag ist.
- Lange Fragen in Pixelify Sans, nur kurze Titel in Righteous.

Liefere den Prototyp und eine Übergabe an Claude Code für das Repo lesen20/werwolf-online.
Die Engine (src/engine) bleibt unverändert. Die Oberfläche liegt in src/ui (app.ts,
components.ts, setup.ts, styles.css). Bestehende Bausteine weiterverwenden: panel, handoff,
whoAmI, promptForm, playerList, chatLog, progress, tallyBars, roleCard.
```

---

## Prompt 3: Hintergründe, Avatare, Symbole, Logo

Umweg, weil kein PNG-Export dokumentiert ist: Claude Design baut eine HTML-Seite, die die Grafiken zeichnet. Du exportierst sie als HTML, öffnest sie im Browser und lädst die PNGs dort herunter. Das Ergebnis vor dem Einbau prüfen, das macht die Seite am Ende selbst.

```text
Erstelle eine einzelne HTML-Seite, die meine fehlenden Pixelgrafiken auf <canvas> zeichnet und
jede als PNG in Originalgröße zum Herunterladen anbietet (ein Knopf je Grafik, canvas.toBlob,
Dateiname wie unten). Zeichne Pixel für Pixel aus Pixelrastern, imageSmoothingEnabled = false,
ohne Kantenglättung und ohne Verläufe. Transparenz nur 0 oder 100 Prozent. Zeige daneben eine
Vorschau in 4x.

Palette: #e3d3aa #d3bf93 #f2f0e6 #261912 #5a3f28 #a88b45 #a28a61 #961f1e #d33427 #0f142b
#0c0e20 #35426e #150e0b, dazu höchstens 8 Zwischentöne. Licht immer von links.

1. Hintergründe 320 x 180, ruhig und kontrastarm, Hauptmotiv in der Mitte, oberes Viertel
   dunkel und ruhig (dort stehen Logo und Phase in heller Schrift, deshalb nichts Helles):
   - backgrounds/setup.png: Dorfplatz in der Abenddämmerung, dunkles Holz
   - backgrounds/night.png: Dorf unter dem Vollmond, Nachtblau
   - backgrounds/day.png: Dorfplatz am Tag in warmem, gedämpftem Licht, höchstens mittelhell
   - backgrounds/game-over.png: Dorf im Morgennebel, sehr dunkel
   Zusätzlich dieselben vier im Hochformat 180 x 320 (Dateinamen mit -portrait).
2. Avatare 16 x 16, Kopf und Schultern, transparent, nichts Wölfisches:
   greta (direkt, selbstbewusst), jonas (ruhig, analytisch), mila (freundlich, neugierig),
   theo (nervös), lina (locker, humorvoll), felix (misstrauisch), paula (vorsichtig),
   noah (ungeduldig), emma (empathisch), leon (trocken, wortkarg), sofia (dramatisch),
   max (logisch), human (neutral, für menschliche Spieler). Dateien avatars/<name>.png.
3. Symbole 8 x 8, transparent, kräftige Farbe mit dunklem Umriss: icons/dead.png (Totenkopf),
   icons/lover.png (Herz), icons/pack.png (Wolfspfote), icons/bot.png (Zahnrad).
4. Logo 96 x 24, transparent: Schriftzug "Werwolf" im Stil des Kartentitels, rotes W,
   dunkle Kontur, auf hellem und dunklem Grund lesbar. Datei logo.png.

Prüfe am Ende jede Grafik automatisch und zeige das Ergebnis an: exakte Größe, nur
Palettenfarben, keine halbtransparenten Pixel.
```

---

## Prompt 4: Rollenkarten (Vorlage, nicht für Claude Design)

Dazu das Zip der Seherin anhängen (README, `quelle/`, Sheet, JSON). Platzhalter in eckigen Klammern aus der Tabelle unten ersetzen.

```text
Erstelle die animierte Rollenkarte "[Titel]" für mein Werwolf-Spiel, genau wie die
Seherin-Karte im Anhang. Verwende denselben Generator (frame4.py, base4.py, pfont.py,
Righteous mit Umlauten) und ändere nur Titel, Kartentext, Medaillon und das Bildfeld.

Inhalt:
- Titel: [Titel]
- Kartentext, wörtlich (er beschreibt die Spielregel): "[Kartentext]"
- Medaillon: [Medaillon]
- Bildfeld: [Motiv]
- Sonderclip: [Clip]

Technik, sonst passt die Karte nicht ins Spiel:
- Karte 192 x 288 px, Bildfeld meta.artWindow x 15, y 31, 162 x 146.
- Sprite-Sheet 16 x 10 (3072 x 2880), 160 Frames, 4 Clips à 40 Frames: idle, [Clip],
  runes_a, runes_b. 10 fps. meta.playlist: idle, runes_a, idle, [Clip], idle, runes_b (24 s).
- Standbild = erster Frame von idle. Die Animation beginnt mit idle, ohne eigenen Einstieg
  (alle Karten beginnen gleich).
- Alpha nur 0 oder 255, höchstens 256 Farben, Palette der anderen Karten, Licht von links,
  keine Dither- oder Schachbrettmuster.
- Figur im selben Maßstab wie Hexe und Dorfbewohner, Füße bei y 141 im Bildfeld.
- JSON im Aseprite-Hash-Format wie seherin_karte_sheet.json.
- Lieferung als Zip: Standbild, 3x-Bild, Sheet, JSON, frames/, Vorschau-GIF, quelle/ und
  ein README mit allen Abweichungen.
```

| Datei | Titel | Kartentext | Medaillon | Motiv | Clip |
| --- | --- | --- | --- | --- | --- |
| `hunter` | Jäger | Stirbt er, nimmt er sofort einen anderen Spieler mit in den Tod. Er siegt mit dem Dorf. | Haus | Jäger mit Armbrust am Waldrand, Geweih an der Hütte | `aim`: legt an, Bolzen fliegt |
| `cupid` | Amor | In der ersten Nacht verliebt er zwei Spieler. Stirbt einer, stirbt auch der andere. | Haus | Junge Gestalt mit Bogen im Rosengarten | `arrow`: Herzpfeil, zwei Herzen leuchten |
| `thief` | Dieb | In der ersten Nacht darf er seine Karte gegen eine der zwei übrigen tauschen. | Haus | Kapuzengestalt mit Laterne in der Gasse, zwei verdeckte Karten auf einer Kiste | `swap`: tauscht die Karte |
| `healer` | Heiler | Schützt jede Nacht einen Spieler vor den Werwölfen, nie zweimal nacheinander denselben. | Haus | Heiler in der Kräuterkammer mit Mörser | `heal`: schützender Lichtkreis |
| `elder` | Der Alte | Übersteht den ersten Werwolfangriff. Tötet ihn das Dorf, verlieren alle Dorfbewohner ihre Kräfte. | Haus | Alter Mann mit Bart und Stab am Kamin | `resist`: Krallenspur, er bleibt stehen |
| `idiot` | Dorfdepp | Wird er verbannt, verschont ihn das Dorf. Danach darf er nicht mehr abstimmen. | Haus | Fröhlicher Dorfbewohner mit Narrenkappe, jongliert Äpfel | `juggle` |
| `scapegoat` | Sündenbock | Bei Gleichstand stirbt er statt der anderen und bestimmt, wer morgen abstimmen darf. | Haus | Dorfbewohner mit Ziege am Pranger | `blame`: zeigende Schatten, Ziege meckert |
| `piper` | Flötenspieler | Verzaubert jede Nacht zwei Spieler. Sind alle anderen verzaubert, siegt er allein. | Haus oder neu: Stern für Einzelgänger | Bunter Flötenspieler, Noten schweben | `enchant`: Noten kreisen, Lichter in den Häusern |
| `sister` | Schwester | Die zwei Schwestern kennen sich und vertrauen einander. Sie siegen mit dem Dorf. | Haus | Zwei Schwestern bei Kerzenlicht | `bond`: Hände, warmes Licht |
| `brother` | Bruder | Die drei Brüder kennen sich und vertrauen einander. Sie siegen mit dem Dorf. | Haus | Drei Brüder an der Werkbank | `bond` |
| `wolfhound` | Wolfshund | In der ersten Nacht wählt er: Er bleibt beim Dorf oder wird ein Werwolf. | Haus | Großer Hund am Dorftor, halb im Mondlicht | `choose`: Augen wechseln kurz zu Rot |
| `wild-child` | Wildes Kind | Wählt in der ersten Nacht ein Vorbild. Stirbt es, wird das Kind ein Werwolf. | Haus | Kind mit Blättern im Haar auf einem Baumstumpf | `gaze`: Blick, Augen glimmen |
| `fox` | Fuchs | Prüft nachts einen Spieler und seine Nachbarn. Findet er keinen Werwolf, verliert er die Nase. | Haus | Fuchs schnuppert an drei Haustüren | `sniff` |
| `bear-tamer` | Bärenführer | Sitzt morgens ein Werwolf neben ihm, brummt sein Bär, und alle hören es. | Haus | Mann mit Bär an der Kette vor den Häusern | `growl`: Bär brummt |
| `knight` | Ritter | Fressen ihn die Werwölfe, stirbt der nächste Werwolf links in der Nacht darauf. | Haus | Alter Ritter, stützt sich auf ein rostiges Schwert | `strike`: hebt das Schwert, Rost rieselt |
| `judge` | Richter | Einmal pro Partie verlangt er heimlich eine zweite Abstimmung am selben Tag. | Haus | Richter am Pult mit Hammer | `gavel`: schlägt zweimal (stottert) |
| `angel` | Engel | Wird er bei der ersten Abstimmung verbannt, siegt er allein. Sonst spielt er für das Dorf. | Haus oder neu: Stern für Einzelgänger | Engel mit Flügeln auf dem Friedhof im Mondlicht | `glow`: Heiligenschein, Federn |
| `urwolf` | Urwolf | Einmal pro Partie steckt er das Opfer an, statt es zu fressen: Es wird ein Werwolf. | Wolf | Riesiger grauer Leitwolf | `infect`: fahler Atem |
| `big-bad-wolf` | Böser Wolf | Frisst ein zweites Opfer, solange noch kein Werwolf gestorben ist. | Wolf | Großer Wolf mit Zähnen vor einer Haustür | `devour` |
| `white-werewolf` | Weißer Wolf | Tötet jede zweite Nacht heimlich einen Werwolf. Er siegt nur als letzter Überlebender. | Wolf | Weißer Wolf auf verschneitem Hügel | `betray`: dreht den Kopf zu einem anderen Wolf |

- **Kartentexte:** Sie folgen den Regeln im Spiel. Ein abweichender Text widerspricht dem Spiel, wie zuerst bei der Seherin.
- **Titel:** Kurz, damit sie in die Kartusche passen. Fehlt das ß in der Kartenschrift, "Weisser Wolf" schreiben.
- **Stern statt Haus:** Ein neues Medaillon für Einzelgänger ist ein Designvorschlag. Es verrät nichts, weil nur der Besitzer und am Spielende alle die Karte sehen.
