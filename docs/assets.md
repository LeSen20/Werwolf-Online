# Asset-Liste

36 Dateien, alle optional: Fehlt eine Datei, zeigt die Oberfläche einen Platzhalter bzw. spielt keinen Ton. Empfohlene Reihenfolge: Karten, Hintergründe, Avatare, Logo, Symbole, Töne.

Einbau: Datei unter dem angegebenen Namen nach `public/assets/` legen und den Pfad in `src/ui/assets.ts` eintragen (oder mir die Dateien schicken):

```ts
export const ASSETS: AssetConfig = {
  cards: { werewolf: 'assets/cards/werewolf.webp', seer: 'assets/cards/seer.webp' },
  cardBack: 'assets/cards/back.webp',
  backgrounds: { setup: 'assets/backgrounds/setup.webp', night: null, day: null, gameOver: null },
  // ...
};
```

Allgemein:

- Bilder als WebP (PNG geht auch), Logo und Symbole am besten als SVG, Töne als MP3. Alle Formate laufen in aktuellen Browsern.
- Dateinamen klein und ohne Leerzeichen, genau wie unten.
- Kein Text in Bildern (außer im Logo). Namen und Beschriftungen zeichnet die Oberfläche, so bleiben die Bilder sprachunabhängig.

## 1. Rollenkarten (8)

| Datei | Schlüssel | Rolle | Rahmenfarbe |
| --- | --- | --- | --- |
| `cards/werewolf.webp` | `cards.werewolf` | Werwolf | rot (Werwölfe) |
| `cards/villager.webp` | `cards.villager` | Dorfbewohner | grün (Dorf) |
| `cards/seer.webp` | `cards.seer` | Seherin | grün |
| `cards/witch.webp` | `cards.witch` | Hexe | grün |
| `cards/hunter.webp` | `cards.hunter` | Jäger | grün |
| `cards/cupid.webp` | `cards.cupid` | Amor | grün |
| `cards/thief.webp` | `cards.thief` | Dieb | grün |
| `cards/back.webp` | `cardBack` | Rückseite | neutral |

- Hochformat 2:3, 750 x 1125 px (mindestens 500 x 750).
- Angezeigt 200 px breit (Rolle ansehen) und 84 px breit (Übersicht am Spielende). Das Motiv muss auch klein erkennbar sein.
- Ohne Rahmen und ohne Namen: Die Oberfläche zeichnet einen Rahmen in Fraktionsfarbe und unten einen Namensbalken. Dafür wird das Bild oben und unten um je etwa 5 % (groß) bis 10 % (klein) beschnitten, also keine wichtigen Details an diese Ränder.
- Die Rückseite wird ohne Namensbalken vollständig gezeigt.
- Neue Rollen brauchen später je eine weitere Karte mit ihrer Rollen-ID als Namen.

## 2. Hintergründe (4)

| Datei | Schlüssel | Wann | Helligkeit |
| --- | --- | --- | --- |
| `backgrounds/setup.webp` | `backgrounds.setup` | Vorbereitung | hell |
| `backgrounds/night.webp` | `backgrounds.night` | Rollen ansehen, Nacht | dunkel |
| `backgrounds/day.webp` | `backgrounds.day` | Tag, Diskussion, Abstimmung | hell |
| `backgrounds/game-over.webp` | `backgrounds.gameOver` | Spielende | dunkel |

- 1920 x 1080 px, höchstens etwa 400 KB je Datei.
- Das Bild füllt immer das ganze Fenster und wird dafür beschnitten. Auf einem Handy im Hochformat (z.B. 390 x 844) bleibt nur etwa das mittlere Viertel der Bildbreite sichtbar: Hauptmotiv in die Mitte. Hochformat-Varianten kann ich bei Bedarf zusätzlich einbauen.
- Ruhig und kontrastarm. Spielinhalte liegen auf eigenen Flächen, aber Logo und Phasenanzeige stehen direkt auf dem Bild. Ihre Schrift ist bei hellen Phasen dunkel und bei dunklen Phasen hell, deshalb die Helligkeit aus der Tabelle einhalten.

## 3. Logo (1)

| Datei | Schlüssel | Wo |
| --- | --- | --- |
| `logo.svg` (oder `logo.png`) | `logo` | Kopfzeile, in allen Phasen |

- Wird 36 px hoch angezeigt, Breite frei (Querformat, etwa 3:1 bis 5:1). Als PNG mindestens 108 px hoch, transparenter Hintergrund.
- Muss auf hellem und dunklem Hintergrund lesbar sein, z.B. durch eine Kontur.

## 4. Avatare (13)

| Datei | Name | Charakter (für die Gestaltung) |
| --- | --- | --- |
| `avatars/greta.webp` | Greta | direkt und selbstbewusst |
| `avatars/jonas.webp` | Jonas | ruhig und analytisch |
| `avatars/mila.webp` | Mila | freundlich, neugierig |
| `avatars/theo.webp` | Theo | nervös |
| `avatars/lina.webp` | Lina | locker und humorvoll |
| `avatars/felix.webp` | Felix | misstrauisch |
| `avatars/paula.webp` | Paula | vorsichtig, zurückhaltend |
| `avatars/noah.webp` | Noah | ungeduldig |
| `avatars/emma.webp` | Emma | empathisch |
| `avatars/leon.webp` | Leon | trocken und wortkarg |
| `avatars/sofia.webp` | Sofia | dramatisch und emotional |
| `avatars/max.webp` | Max | logisch, faktenorientiert |
| `avatars/human.webp` | alle menschlichen Spieler | neutral, z.B. Silhouette |

- Quadratisch, 256 x 256 px. Im Chat als Kreis mit 34 px Durchmesser angezeigt, die Ecken fallen weg: Gesicht mittig mit etwas Rand.
- Die Avatare dürfen keine Rolle andeuten (nichts Wölfisches), denn jeder Bot kann jede Rolle bekommen.
- Bots mit einem dieser Namen bekommen den passenden Avatar, Bots mit anderen Namen reihum einen freien.

## 5. Symbole (4)

| Datei | Schlüssel | Bedeutung | Sichtbar für |
| --- | --- | --- | --- |
| `icons/dead.svg` | `icons.dead` | tot | alle |
| `icons/lover.svg` | `icons.lover` | verliebt | das Paar und Amor |
| `icons/pack.svg` | `icons.pack` | Rudelmitglied | nur Werwölfe |
| `icons/bot.svg` | `icons.bot` | Bot | alle, in der Endübersicht |

- SVG mit quadratischer viewBox (z.B. 24 x 24) oder PNG 48 x 48, transparenter Hintergrund. Angezeigt 16 px groß neben dem Namen.
- Feste Farbe wählen, die auf hellem und dunklem Hintergrund funktioniert: Als Bild eingebundene SVGs übernehmen die Schriftfarbe nicht (`currentColor` wirkt hier nicht).

## 6. Töne (6)

| Datei | Schlüssel | Wann |
| --- | --- | --- |
| `sounds/day-start.mp3` | `sounds.dayStart` | Tag beginnt |
| `sounds/death.mp3` | `sounds.death` | jemand stirbt |
| `sounds/vote.mp3` | `sounds.vote` | Abstimmung beginnt |
| `sounds/night-start.mp3` | `sounds.nightStart` | Nacht beginnt |
| `sounds/game-over.mp3` | `sounds.gameOver` | Spielende |
| `sounds/chat.mp3` | `sounds.chat` | neue Chatnachricht |

- MP3, je höchstens etwa 3 s und 100 KB, ohne Stille am Anfang, alle ungefähr gleich laut.
- Fallen mehrere Ereignisse zusammen, spielen die Töne in der Reihenfolge der Tabelle im Abstand von 1,5 s (z.B. Tag beginnt, dann Tod).
- `chat.mp3` sehr kurz und leise (unter 0,5 s): Die Bots schreiben viel, der Ton kommt bei jeder Nachricht.
- Browser spielen Töne erst nach der ersten Interaktion mit der Seite ab. Auf iPhones ist die Tonausgabe noch nicht getestet.
