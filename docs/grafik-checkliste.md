# Grafik-Checkliste

Stand: 5 von 47 Grafiken fertig, dazu 4 optionale. Alles ist Pixelgrafik: PNG in Originalgröße (1x), harte Kanten, Farben der Werwolf-Karte. Details stehen in [assets.md](assets.md).

Das Spiel läuft auch ohne die offenen Grafiken. Bis dahin zeigt es Platzhalter.

## Fertig

- [x] `cards/werewolf.png`: Werwolf (animiert)
- [x] `cards/villager.png`: Dorfbewohner (animiert)
- [x] `cards/witch.png`: Hexe (animiert)
- [x] `cards/seer.png`: Seherin (animiert)
- [x] `cards/back.png`: Kartenrückseite

## 1. Rollenkarten (20)

Im Spiel sind das zurzeit Platzhalter aus dem Kartengenerator: gleicher Rahmen, gleiche Nachtszene, eigener Titel und Text. Du ersetzt nur das Motiv.

- **Am einfachsten:** Nur das Bildfeld malen, **162 x 146 Pixel** (`meta.artWindow`: x 15, y 31). Rahmen, Text und Animation erzeugt dein Kartengenerator.
- **Oder komplett:** Die ganze Karte in **192 x 288 Pixel** mit Rahmen, Titel und Text malen. Für die Animation kommt optional ein Sprite-Sheet dazu (`<rolle>-sheet.png` und `.json`, Aseprite-Format wie bei der Werwolf-Karte).
- **Medaillon:** Dorf-Rollen zeigen das Haus, Werwolf-Rollen den Wolf.

Grundspiel:

- [ ] `cards/hunter.png`: Jäger
- [ ] `cards/cupid.png`: Amor
- [ ] `cards/thief.png`: Dieb

Neumond:

- [ ] `cards/healer.png`: Heiler
- [ ] `cards/elder.png`: Der Alte
- [ ] `cards/idiot.png`: Dorfdepp
- [ ] `cards/scapegoat.png`: Sündenbock
- [ ] `cards/piper.png`: Flötenspieler

Charaktere:

- [ ] `cards/sister.png`: Schwester
- [ ] `cards/brother.png`: Bruder
- [ ] `cards/wolfhound.png`: Wolfshund
- [ ] `cards/wild-child.png`: Wildes Kind
- [ ] `cards/fox.png`: Fuchs
- [ ] `cards/bear-tamer.png`: Bärenführer
- [ ] `cards/knight.png`: Ritter mit dem rostigen Schwert
- [ ] `cards/judge.png`: Stotternder Richter
- [ ] `cards/angel.png`: Engel
- [ ] `cards/urwolf.png`: Urwolf (Medaillon: Wolf)
- [ ] `cards/big-bad-wolf.png`: Großer böser Wolf (Medaillon: Wolf)
- [ ] `cards/white-werewolf.png`: Weißer Werwolf (Medaillon: Wolf)

## 2. Hintergründe (4, dazu 4 optional)

Querformat **320 x 180 Pixel**. Ruhig und kontrastarm, Hauptmotiv in die Mitte.

- [ ] `backgrounds/setup.png`: Vorbereitung (hell)
- [ ] `backgrounds/night.png`: Rollen ansehen und Nacht (dunkel)
- [ ] `backgrounds/day.png`: Tag, Diskussion, Abstimmung (hell)
- [ ] `backgrounds/game-over.png`: Spielende (dunkel)

Optional, für Handys empfohlen, im Hochformat **180 x 320 Pixel**:

- [ ] `backgrounds/setup-portrait.png`
- [ ] `backgrounds/night-portrait.png`
- [ ] `backgrounds/day-portrait.png`
- [ ] `backgrounds/game-over-portrait.png`

## 3. Avatare (13)

**16 x 16 Pixel** (oder 32 x 32), quadratisch, Figur mittig. Avatare gehören zur Persönlichkeit, nicht zum Namen, und dürfen keine Rolle andeuten.

- [ ] `avatars/greta.png`: direkt und selbstbewusst
- [ ] `avatars/jonas.png`: ruhig und analytisch
- [ ] `avatars/mila.png`: freundlich, neugierig
- [ ] `avatars/theo.png`: nervös
- [ ] `avatars/lina.png`: locker und humorvoll
- [ ] `avatars/felix.png`: misstrauisch
- [ ] `avatars/paula.png`: vorsichtig, zurückhaltend
- [ ] `avatars/noah.png`: ungeduldig
- [ ] `avatars/emma.png`: empathisch
- [ ] `avatars/leon.png`: trocken und wortkarg
- [ ] `avatars/sofia.png`: dramatisch und emotional
- [ ] `avatars/max.png`: logisch, faktenorientiert
- [ ] `avatars/human.png`: alle menschlichen Spieler (neutral)

## 4. Symbole (4)

**8 x 8 Pixel** (oder 16 x 16), transparenter Hintergrund, kräftige Farbe mit dunklem Umriss.

- [ ] `icons/dead.png`: tot
- [ ] `icons/lover.png`: verliebt
- [ ] `icons/pack.png`: Rudelmitglied
- [ ] `icons/bot.png`: Bot

## 5. Logo (1)

- [ ] `logo.png`: **24 Pixel hoch**, bis 120 Pixel breit, transparenter Hintergrund. Muss auf hellem und dunklem Hintergrund lesbar sein. Ohne Logo zeigt das Spiel "Werwolf" in der Righteous-Schrift.

## Abgeben

Fertige Dateien schickst du mir, oder du legst sie unter `public/assets/` ab (Pfade wie oben). Ich trage sie dann in `src/ui/assets.ts` ein und prüfe, ob sie scharf dargestellt werden.

Töne sind keine Grafiken, stehen aber ebenfalls noch aus. Es sind 6 Chiptune-Effekte, siehe [assets.md](assets.md).
