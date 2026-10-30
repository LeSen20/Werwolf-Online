# Bots und Übersetzer

Die Bots laufen komplett offline: kein KI-Dienst, kein API-Schlüssel, keine Limits. Ein Bot sieht nur, was ein Mensch mit seiner Karte sehen würde (`viewFor`), dazu den öffentlichen Chat.

| Datei | Aufgabe |
| --- | --- |
| `src/bots/brain.ts` | Verdachtsmodell: wer ist wie verdächtig und warum |
| `src/bots/strategy.ts` | Nachtfähigkeiten, Abstimmung, was ein Bot sagen will |
| `src/bots/claims.ts` | versteht Chatnachrichten (Deutsch und Englisch) |
| `src/bots/language.ts` | formuliert Nachrichten aus Vorlagen, Stil je Persönlichkeit |
| `src/bots/personas.ts` | 12 Persönlichkeiten (Name, Stil, Avatar) |
| `src/bots/controller.ts` | steuert alle Bots einer Partie, Pausen, Tippanzeige, Übersetzung |
| `src/translation/` | separater Übersetzer, unabhängig von den Bots |

## Wie die Bots denken

Jeder Bot bewertet jeden Mitspieler mit einem Verdachtswert. Ausgangspunkt ist der Anteil der Werwölfe, dazu kommen Gründe:

- eigenes Wissen: Prüfungen der Seherin, Rudel, Liebespartner
- Rollenbehauptungen im Chat, Gegenbehauptungen (zwei Seherinnen), Behauptungen, die zu einer aufgedeckten Rolle nicht passen
- Prüfergebnisse anderer, abgeglichen mit den beim Tod aufgedeckten Rollen
- wer einen später aufgedeckten Werwolf verteidigt oder beschuldigt hat
- Abstimmungsverhalten, wer mich beschuldigt, wer schweigt, wer nur mitläuft

Die Gründe sind maschinenlesbar (`ReasonCode`) und werden im Chat als Begründung genannt, z.B. "Ben hat Clara verteidigt, und Clara war ein Werwolf."

Verhalten nach Karte:

- Seherin: prüft die verdächtigsten ungeprüften Spieler. Sie deckt sich auf, wenn sie einen lebenden Werwolf kennt, wenn jemand anderes fälschlich Seherin behauptet oder wenn sie selbst stark beschuldigt wird.
- Werwölfe: argumentieren nur mit öffentlichen Informationen, beschuldigen und wählen nie ihr Rudel oder ihren Partner. Nachts töten sie bevorzugt die (behauptete) Seherin oder Hexe, wer das Rudel beschuldigt und wem das Dorf vertraut; den Jäger meiden sie. Tagsüber schwimmen sie mit der Mehrheit, manchmal behaupten sie fälschlich, Seherin zu sein.
- Hexe: heilt sich selbst, Verbündete und behauptete Seherinnen, sonst je nach Verdacht. Gift nur bei (fast) sicherem Werwolf, im Endspiel auch bei starkem Verdacht.
- Jäger: nimmt den Verdächtigsten mit, nie jemanden, den er für gut hält.
- Amor: verliebt zwei Mitspieler, manchmal sich selbst.
- Dieb: nimmt eine Sonderrolle, wenn möglich, selten einen Werwolf.
- Dorfbewohner: stimmen für den Verdächtigsten, bei unklarer Lage mit der Mehrheit.

Im Chat eröffnen Bots den Tag (Reaktion auf die Toten, Verdacht mit Begründung oder eine Frage an stille Spieler), beantworten Fragen nach Rolle, Verdacht, Begründung und Stimme, verteidigen sich mit Gegenargumenten und kündigen ihre Stimme an. Pro Tag und Bot gibt es eine Obergrenze an Nachrichten, dazu Tippanzeige und Pausen wie bei Menschen.

In einem gemischten Rudel folgen Bot-Werwölfe der Wahl des Menschen, damit die Einigkeit zustande kommt.

## Grenzen

- Ohne Sprachmodell versteht ein Bot Nachrichten über Muster: Rollen, Namen, "X ist ein Werwolf", "ich vertraue X", Fragen. Ironie, Andeutungen oder lange Argumentationsketten versteht er nicht.
- Antworten kommen aus Vorlagen mit Varianten. In langen Partien wiederholen sich Formulierungen.
- Muster und Vorlagen gibt es nur auf Deutsch und Englisch. Alle anderen Sprachen laufen über den Übersetzer.

## Übersetzer

Der Übersetzer erkennt die Sprache einer Nachricht, übersetzt sie für die Bots ins Englische und deren Antworten zurück. Spielernamen bleiben dabei erhalten; geht ein Name verloren, schickt der Bot seine Nachricht unübersetzt. Welcher Übersetzer verwendet wird:

1. LibreTranslate, falls in der Vorbereitung eine Adresse eingetragen ist
2. sonst der im Browser eingebaute Übersetzer, falls vorhanden
3. sonst nur Deutsch und Englisch; Nachrichten in anderen Sprachen beantworten die Bots auf Englisch

| Option | Kosten und Limits | Schlüssel nötig | Voraussetzung |
| --- | --- | --- | --- |
| Browser-Übersetzer (Translator API) | keine | nein | Chrome ab Version 138 am Computer. Nicht auf Handys, nicht in Firefox und Safari. Lädt beim ersten Gebrauch ein Sprachpaket herunter. |
| LibreTranslate, selbst betrieben | keine | nein | ein Rechner mit Docker, der während des Spiels läuft |
| ohne Übersetzer | keine | nein | nur Deutsch und Englisch |

Einen öffentlichen Übersetzungsdienst, der ohne Schlüssel und ohne Limit nutzbar ist, gibt es nicht. Kostenlose Dienste begrenzen die Menge (MyMemory ohne Anmeldung z.B. 5.000 Zeichen pro Tag) oder verlangen einen Schlüssel.

LibreTranslate starten:

```bash
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate
```

Dann in der Vorbereitung `http://localhost:5000` eintragen. Beim ersten Start lädt LibreTranslate die Sprachmodelle herunter, das dauert eine Weile. Mit `-e LT_LOAD_ONLY=de,en,fr` lassen sich die Sprachen beschränken. Am zuverlässigsten läuft es, wenn das Spiel ebenfalls lokal läuft (`npm run dev`). Wird das Spiel über HTTPS ausgeliefert, muss auch LibreTranslate über HTTPS erreichbar sein, sonst blockiert der Browser die Anfragen.

## Bot-Verhalten für eine neue Rolle

Ohne eigene Strategie wählen Bots bei neuen Fähigkeiten zufällig unter den gültigen Zielen, die Partie läuft also immer weiter. Für sinnvolles Verhalten in `src/bots/strategy.ts` neben den anderen Strategien eine registrieren (die Rollen selbst bleiben unabhängig von den Bots):

```ts
// Beschützer: schützt den Spieler, dem er am meisten vertraut.
registerBotAbility('guardian.protect', (ctx, prompt) => {
  const ids = prompt.candidates.map((c) => c.id);
  // honestAssessment ist absteigend nach Verdacht sortiert, der Letzte ist der Vertrauenswürdigste.
  const trusted = honestAssessment(ctx).filter((s) => ids.includes(s.playerId)).at(-1);
  return trusted ? { targets: [trusted.playerId] } : { skip: true };
});
```

Die Strategie bekommt die Spieleransicht des Bots, alle Chat-Behauptungen, sein Gedächtnis und einen Zufallsgenerator und liefert Ziele, eine Auswahl oder `skip`. Im Chat erkennen Bots den deutschen Namen einer neuen Rolle automatisch ("ich bin der Beschützer"). Englische Namen und Synonyme in `ROLE_WORDS` (`src/bots/claims.ts`) eintragen, die Formulierung in Bot-Nachrichten in `ROLE_PHRASE` (`src/bots/language.ts`), sonst nennen Bots die Rollen-ID.
