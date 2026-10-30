# Grafikliste (Pixelgrafik, Retro-Stil)

30 Grafiken (davon fertig: Werwolf-Karte), dazu 4 optionale und 6 Töne. Alles ist optional: Fehlt eine Datei, zeigt das Spiel einen Platzhalter.

Empfohlene Reihenfolge: Rollenkarten, Hintergründe, Avatare, Symbole, Logo.

## Regeln für alle Grafiken

- **Originalgröße:** Jede Grafik in der unten genannten Größe (1x) als PNG speichern, nicht selbst vergrößern. Das Spiel vergrößert immer um ganze Faktoren (2x, 3x, 4x ...) und ohne Weichzeichnen, so bleiben alle Pixel gleich groß und scharf.
- **Harte Kanten:** Keine Kantenglättung, keine weichen Pinsel, keine Verläufe aus Halbtransparenz. Transparenz nur ganz oder gar nicht.
- **Eine Palette:** Die Farben der Werwolf-Karte verwenden (Pergament, Holz, Gold, Nachtblau, Blutrot), damit Karten, Hintergründe und Oberfläche zusammenpassen. Die Oberfläche nutzt dieselben Farben.
- **Kein Text in Bildern** außer im Logo und auf den Rollenkarten (dort gehören Titel und Beschreibung zum Design, sie bleiben dann aber deutsch, auch wenn im Chat übersetzt wird).
- **Werkzeuge:** Aseprite (kostenpflichtig) oder kostenlos LibreSprite, Pixelorama, Piskel (im Browser).
- **Dateinamen:** klein und ohne Leerzeichen, genau wie unten. Ablage in `public/assets/`, Eintrag in `src/ui/assets.ts` (oder mir schicken).

## 1. Rollenkarten (8)

| Datei | Rolle | Stand |
| --- | --- | --- |
| `cards/werewolf.png` | Werwolf | fertig, auch animiert |
| `cards/villager.png` | Dorfbewohner | Platzhalter |
| `cards/seer.png` | Seherin | Platzhalter |
| `cards/witch.png` | Hexe | Platzhalter |
| `cards/hunter.png` | Jäger | Platzhalter |
| `cards/cupid.png` | Amor | Platzhalter |
| `cards/thief.png` | Dieb | Platzhalter |
| `cards/back.png` | Rückseite | Platzhalter |

- **Komplette Karte wie die Werwolf-Karte: 192 x 288 Pixel** (2:3) mit eigenem Rahmen, Titel und Beschreibung. Das Spiel zeichnet keinen zusätzlichen Rahmen. Die abgenutzte Außenkante darf transparent sein.
- Angezeigt 1x auf Handys, 2x (384 x 576) auf großen Bildschirmen, als Vorschau in der Endübersicht verkleinert (0,5x) mit dem Rollennamen darunter.
- **Animation (optional):** Sprite-Sheet mit JSON im Aseprite-Format wie `cards/werewolf-sheet.png` und `.json`: Clips als `frameTags`, Reihenfolge in `meta.playlist`, `meta.fps`. Beim Aufdecken läuft `howl` (falls vorhanden), danach die Playlist. Eintrag unter `cardAnimations`.
- Die Rückseite ist für alle Karten gleich und darf keine Rolle verraten.
- Neue Rollen brauchen später je eine Karte mit ihrer Rollen-ID als Dateiname.

## 2. Hintergründe (4, dazu 4 optional)

| Datei | Wann | Helligkeit |
| --- | --- | --- |
| `backgrounds/setup.png` | Vorbereitung | hell |
| `backgrounds/night.png` | Rollen ansehen, Nacht | dunkel |
| `backgrounds/day.png` | Tag, Diskussion, Abstimmung | hell |
| `backgrounds/game-over.png` | Spielende | dunkel |

- **320 x 180 Pixel** (Querformat 16:9). Das Spiel vergrößert so weit, dass das Fenster bedeckt ist, z.B. 6x bei 1920 x 1080, und schneidet den Rest ab.
- **Optional, für Handys empfohlen:** dieselben vier Bilder zusätzlich im Hochformat, **180 x 320 Pixel**, als `backgrounds/setup-portrait.png` usw. (Eintrag unter `backgroundsPortrait`). Ohne sie sieht man auf einem Handy im Hochformat nur die mittleren etwa 80 Pixel des Querformats.
- Ruhig und kontrastarm, weil Logo und Phasenanzeige direkt darauf stehen. Deren Schrift ist in hellen Phasen dunkel und in dunklen Phasen hell, deshalb die Helligkeit aus der Tabelle einhalten.

## 3. Avatare (13)

| Datei | Persönlichkeit | Charakter (für die Gestaltung) |
| --- | --- | --- |
| `avatars/greta.png` | Greta | direkt und selbstbewusst |
| `avatars/jonas.png` | Jonas | ruhig und analytisch |
| `avatars/mila.png` | Mila | freundlich, neugierig |
| `avatars/theo.png` | Theo | nervös |
| `avatars/lina.png` | Lina | locker und humorvoll |
| `avatars/felix.png` | Felix | misstrauisch |
| `avatars/paula.png` | Paula | vorsichtig, zurückhaltend |
| `avatars/noah.png` | Noah | ungeduldig |
| `avatars/emma.png` | Emma | empathisch |
| `avatars/leon.png` | Leon | trocken und wortkarg |
| `avatars/sofia.png` | Sofia | dramatisch und emotional |
| `avatars/max.png` | Max | logisch, faktenorientiert |
| `avatars/human.png` | Menschen | neutral, für alle menschlichen Spieler |

- **16 x 16 Pixel** (angezeigt 2x, also 32 x 32 neben jeder Chatnachricht). Mehr Details: 32 x 32 (dann 1x).
- Quadratisch, Gesicht oder Figur mittig. Transparenter Hintergrund ist erlaubt.
- Avatare gehören zur Persönlichkeit, nicht zum Namen: Bots bekommen jede Partie einen neuen Benutzernamen und zufällig eine Persönlichkeit samt Avatar. Kein Avatar darf eine Rolle andeuten (nichts Wölfisches).

## 4. Symbole (4)

| Datei | Bedeutung | Sichtbar für |
| --- | --- | --- |
| `icons/dead.png` | tot | alle |
| `icons/lover.png` | verliebt | das Paar und Amor |
| `icons/pack.png` | Rudelmitglied | nur Werwölfe |
| `icons/bot.png` | Bot | alle, in der Endübersicht |

- **8 x 8 Pixel** (angezeigt 2x, 16 x 16 neben dem Namen). Mehr Details: 16 x 16 (dann 1x).
- Transparenter Hintergrund, eine kräftige Farbe mit dunklem Umriss, damit das Symbol auf hellen und dunklen Flächen lesbar ist.

## 5. Logo (1)

| Datei | Wo |
| --- | --- |
| `logo.png` | Kopfzeile, in allen Phasen |

- **24 Pixel hoch**, Breite frei bis etwa 120 Pixel (z.B. 96 x 24). Angezeigt 2x (48 Pixel hoch).
- Transparenter Hintergrund und eine Kontur, damit es auf hellen und dunklen Hintergründen lesbar ist.

## 6. Töne (6)

| Datei | Wann |
| --- | --- |
| `sounds/day-start.mp3` | Tag beginnt |
| `sounds/death.mp3` | jemand stirbt |
| `sounds/vote.mp3` | Abstimmung beginnt |
| `sounds/night-start.mp3` | Nacht beginnt |
| `sounds/game-over.mp3` | Spielende |
| `sounds/chat.mp3` | neue Chatnachricht |

- Passend zum Retro-Stil als Chiptune-Effekte, z.B. mit den kostenlosen Werkzeugen jsfxr oder ChipTone.
- MP3, je höchstens etwa 3 s, ohne Stille am Anfang, alle ungefähr gleich laut.
- `chat.mp3` sehr kurz und leise (unter 0,5 s), denn die Bots schreiben viel.
- Fallen mehrere Ereignisse zusammen, spielen die Töne in der Reihenfolge der Tabelle im Abstand von 1,5 s.
- Browser spielen Töne erst nach der ersten Interaktion mit der Seite ab. Auf iPhones ist die Tonausgabe noch nicht getestet.
