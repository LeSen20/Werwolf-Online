# Neue Rolle hinzufügen

Eine Rolle ist eine reine Beschreibung (`defineRole`). Die Engine liest diese Beschreibung und kümmert sich um Weckreihenfolge, Zielprüfung, Ressourcen, Auflösung, Todesketten und Siegprüfung. Am Zustandsautomaten wird nichts geändert.

## Ablauf

1. Datei `src/roles/<rolle>.ts` anlegen und die Rolle mit `defineRole({...})` beschreiben (Beispiel unten).
2. In `src/roles/index.ts` importieren und in `BASE_ROLES` eintragen. Ab dann ist sie in der Spielkonfiguration und in der Oberfläche auswählbar.
3. Optional: Kartengrafik in `src/ui/assets.ts` eintragen (sonst Platzhalter, Formate in [assets.md](assets.md)).
4. Optional: Bot-Verhalten mit `registerBotAbility` (siehe [bots.md](bots.md)). Ohne Strategie wählen Bots zufällig unter den gültigen Zielen.
5. Test in `tests/` schreiben. Vorlage: `tests/extensibility.test.ts` (Beschützer und Narr).
6. `npm test` und `npm run typecheck` ausführen.

## Beispiel: Beschützer

```ts
import { defineRole } from '../engine';
import { WEREWOLF_ATTACK } from './werewolf';

const LAST_TARGET = 'protector.lastTarget';

export const protector = defineRole({
  id: 'protector',
  name: 'Beschützer',
  description: 'Schützt jede Nacht einen Spieler vor den Werwölfen, nie zweimal hintereinander denselben.',
  faction: 'village',     // was die Seherin sieht
  team: 'village',        // mit wem die Rolle gewinnt
  unique: true,
  abilities: [
    {
      id: 'protector.protect',
      name: 'Beschützen',
      trigger: 'night',
      step: 'protector',
      stepLabel: 'Der Beschützer',
      order: 45,          // Weckreihenfolge: vor den Werwölfen (50)
      priority: 150,      // Auflösungsreihenfolge in NIGHT_RESOLUTION
      input: { kind: 'players', min: 1, max: 1 },
      candidates: (ctx, actor) =>
        ctx.alivePlayers().filter((p) => p.id !== actor.marks[LAST_TARGET]).map((p) => p.id),
      onSubmit: (_ctx, actor, input) => {
        actor.marks[LAST_TARGET] = input.targets[0];
      },
      resolve: (_ctx, action, night) => night.protect(action.targets[0], [WEREWOLF_ATTACK], action.actorIds[0]),
    },
  ],
});
```

## Bausteine

### Rolle (`RoleDefinition`)

| Feld | Bedeutung |
| --- | --- |
| `id`, `name`, `description` | Kennung und Texte |
| `faction` | Gesinnung: `village`, `werewolves`, `neutral` (z.B. für die Seherin) |
| `team` | Siegteam; eigene Teams über `rules` registrieren |
| `unique` | höchstens einmal im Stapel |
| `tags` | Markierungen, z.B. `werewolf-pack` = wacht und wählt mit den Werwölfen |
| `abilities` | Fähigkeiten (siehe unten) |
| `extraCards` | benötigte Zusatzkarten (Dieb: 2) |
| `defaultOptions` | einstellbare Optionen, im Spiel per `ctx.options('<rollenId>')` |
| `appearsAs` | wie die Rolle bei Untersuchungen erscheint |
| `deathCauses` | Anzeigenamen eigener Todesursachen |
| `rules` | Regelmodule mit globalen Hooks, Teams und Siegbedingungen |

### Fähigkeit (`AbilityDefinition`)

| Feld | Bedeutung |
| --- | --- |
| `trigger` | `night` (Nachtschritt) oder `death` (beim eigenen Tod, z.B. Jäger) |
| `step`, `stepLabel`, `order` | Nachtschritt und Weckreihenfolge |
| `priority` | Reihenfolge der Auflösung (unabhängig von `order`) |
| `nights` | `first`, `all`, `after-first` |
| `maxUses` | Ressource: Einsätze pro Partie (Tränke = 1) |
| `optional` | darf übersprungen werden |
| `group` | Gruppenentscheidung aller lebenden Spieler mit diesem Tag (Einigung nötig) |
| `input` | `players` (min/max Ziele), `choice` (Optionen) oder `confirm` |
| `actors` | wer handelt (Standard: lebende Inhaber der Rolle) |
| `candidates`, `choices` | zulässige Ziele bzw. Optionen |
| `isAvailable` | zusätzliche Bedingung; wird sie mitten im Schritt falsch, verfällt die Entscheidung |
| `validate` | zusätzliche Prüfung, liefert Fehlermeldung oder `null` |
| `onSubmit` | sofortiger Effekt (Information, Rollentausch, Todesschuss) |
| `resolve` | verzögerter Nachteffekt: `night.attack(ziel, ursache)` oder `night.protect(ziel, ursachen)` |
| `onTimeout`, `onGroupTimeout` | Ersatzentscheidung bei Zeitablauf |
| `shouldTrigger` | nur `death`: bei welchen Todesursachen ausgelöst wird |

Faustregel: Alles, was spätere Schritte derselben Nacht wissen müssen (Untersuchungsergebnis, Rollentausch, Verknüpfungen), gehört in `onSubmit`. Alles, was sich gegenseitig beeinflussen kann (Angriffe, Schutz), gehört in `resolve`.

### Regelmodul (`RuleModule`)

Für Mechaniken, die nicht an den handelnden Spieler gebunden sind:

- `onDeath(ctx, toter, tod)`: nach jedem Tod, darf mit `ctx.kill(...)` weitere Tode vormerken (Beispiel: Liebespaar in `src/roles/cupid.ts`).
- `knowledge(ctx, betrachter)`: was ein Spieler über andere weiß (Beispiel: Rudel in `src/roles/werewolf.ts`).
- `teamModifier(ctx, spieler, team)`: Siegteam verändern (Beispiel: `src/rules/mixedLovers.ts`).
- `teams`, `winConditions`: eigene Teams und Siegbedingungen. Kleinere `priority` wird zuerst geprüft. Teams mit `blocksOtherTeams: false` verhindern keine fremden Siege.

Ein Regelmodul kann an eine Rolle gehängt (`rules: [...]`) oder unabhängig in `BASE_RULES` registriert werden.

## Wann doch die Engine geändert werden muss

Nur bei wirklich neuen Spielabschnitten, z.B. Fähigkeiten, die tagsüber während der Diskussion eingesetzt werden (Trigger `day`), oder einer Bürgermeisterwahl. Dann: neuen Trigger in `definitions.ts`, erlaubten Befehl in `PHASE_SPECS` (`phases.ts`) und offene Entscheidungen in `currentPending` (`actions.ts`) ergänzen.
