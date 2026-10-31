/**
 * Sprachvorlagen der Bots (Deutsch und Englisch, ohne Netzwerk). Andere Sprachen
 * entstehen durch den separaten Übersetzer (src/translation) aus dem englischen Text.
 * Abwechslung kommt aus mehreren Varianten je Absicht und dem Sprechstil (Voice).
 */
import type { PlayerId, RoleId } from '../engine';
import { pickRandom, type Random } from './random';
import type { Reason, SpeechIntent, Voice } from './types';

export type TemplateLanguage = 'de' | 'en';

export interface TemplateContext {
  lang: TemplateLanguage;
  name: (id: PlayerId) => string;
  me: PlayerId;
  /** Öffentlich behauptete Rolle des Bots. */
  presentedRole: RoleId;
  random: Random;
  voice?: Voice;
}

const ROLE_PHRASE: Record<TemplateLanguage, Record<string, string>> = {
  de: {
    villager: 'ein einfacher Dorfbewohner',
    werewolf: 'ein Werwolf',
    seer: 'die Seherin',
    witch: 'die Hexe',
    hunter: 'der Jäger',
    cupid: 'Amor',
    thief: 'der Dieb',
    healer: 'der Heiler',
    elder: 'der Alte',
    idiot: 'der Dorfdepp',
    scapegoat: 'der Sündenbock',
    piper: 'der Flötenspieler',
    sister: 'eine der Schwestern',
    brother: 'einer der Brüder',
    wolfhound: 'der Wolfshund',
    'wild-child': 'das wilde Kind',
    fox: 'der Fuchs',
    'bear-tamer': 'der Bärenführer',
    knight: 'der Ritter mit dem rostigen Schwert',
    judge: 'der stotternde Richter',
    angel: 'der Engel',
    urwolf: 'der Urwolf',
    'big-bad-wolf': 'der große böse Wolf',
    'white-werewolf': 'der weiße Werwolf',
  },
  en: {
    villager: 'just a villager',
    werewolf: 'a werewolf',
    seer: 'the seer',
    witch: 'the witch',
    hunter: 'the hunter',
    cupid: 'Cupid',
    thief: 'the thief',
    healer: 'the healer',
    elder: 'the elder',
    idiot: 'the village idiot',
    scapegoat: 'the scapegoat',
    piper: 'the piper',
    sister: 'one of the sisters',
    brother: 'one of the brothers',
    wolfhound: 'the wolfhound',
    'wild-child': 'the wild child',
    fox: 'the fox',
    'bear-tamer': 'the bear tamer',
    knight: 'the knight with the rusty sword',
    judge: 'the stuttering judge',
    angel: 'the angel',
    urwolf: 'the wolf father',
    'big-bad-wolf': 'the big bad wolf',
    'white-werewolf': 'the white werewolf',
  },
};

export function rolePhrase(roleId: RoleId, lang: TemplateLanguage): string {
  return ROLE_PHRASE[lang][roleId] ?? roleId;
}

export function renderReason(reason: Reason, ctx: Pick<TemplateContext, 'lang' | 'name' | 'me'>): string {
  const s = ctx.name(reason.subjectId);
  const r = reason.relatedId ? ctx.name(reason.relatedId) : '';
  const role = reason.roleId ? rolePhrase(reason.roleId, ctx.lang) : '';
  const aboutMe = reason.relatedId === ctx.me;
  if (ctx.lang === 'en') {
    switch (reason.code) {
      case 'own-check-wolf':
        return `I saw ${s} last night: werewolf`;
      case 'own-check-good':
        return `I checked ${s}, clean`;
      case 'claimed-check-wolf':
        return `${r} says they saw ${s} as a werewolf`;
      case 'claimed-check-good':
        return `${r} says ${s} is clean`;
      case 'wrong-check':
        return `${s} was wrong about ${r}`;
      case 'counter-claim':
        return `${s} and ${r} both claim to be ${role}, one of them is lying`;
      case 'false-claim':
        if (!reason.roleId) return `${s} is lying about me`;
        return aboutMe ? `${s} claims to be ${role}, but that is me` : `${s} claims to be ${role}, but ${role} is already dead`;
      case 'accused-me':
        return `${s} keeps going after me for no reason`;
      case 'defended-wolf':
        return `${s} defended ${r}, and ${r} was a werewolf`;
      case 'accused-wolf':
        return `${s} was right about ${r}`;
      case 'voted-innocent':
        return `${s} voted for ${r}, and ${r} was innocent`;
      case 'voted-wolf':
        return `${s} voted against ${r}`;
      case 'quiet':
        return `${s} barely says anything`;
      case 'bandwagon':
        return `others suspect ${s} too`;
    }
  }
  switch (reason.code) {
    case 'own-check-wolf':
      return `ich habe ${s} in der Nacht gesehen: Werwolf`;
    case 'own-check-good':
      return `ich habe ${s} geprüft, sauber`;
    case 'claimed-check-wolf':
      return `${r} hat ${s} als Werwolf gesehen`;
    case 'claimed-check-good':
      return `${r} sagt, ${s} ist sauber`;
    case 'wrong-check':
      return `${s} lag bei ${r} falsch`;
    case 'counter-claim':
      return `${s} und ${r} behaupten beide, ${role} zu sein, einer lügt`;
    case 'false-claim':
      if (!reason.roleId) return `${s} lügt über mich`;
      return aboutMe ? `${s} behauptet, ${role} zu sein, aber das bin ich` : `${s} behauptet, ${role} zu sein, aber ${role} ist schon tot`;
    case 'accused-me':
      return `${s} hackt ohne Grund auf mir rum`;
    case 'defended-wolf':
      return `${s} hat ${r} verteidigt, und ${r} war ein Werwolf`;
    case 'accused-wolf':
      return `${s} lag bei ${r} richtig`;
    case 'voted-innocent':
      return `${s} hat für ${r} gestimmt, und ${r} war unschuldig`;
    case 'voted-wolf':
      return `${s} hat gegen ${r} gestimmt`;
    case 'quiet':
      return `${s} sagt fast nichts`;
    case 'bandwagon':
      return `andere haben ${s} auch im Verdacht`;
  }
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function reasonsText(reasons: Reason[], ctx: TemplateContext): string {
  // Wortkarge Bots lassen Begründungen öfter weg.
  if (ctx.voice?.terse && ctx.random() < 0.5) return '';
  const parts = reasons
    .filter((r) => r.weight > 0)
    .slice(0, 2)
    .map((r) => renderReason(r, ctx));
  return parts.join(ctx.lang === 'en' ? ' and ' : ' und ');
}

function choose(ctx: TemplateContext, variants: string[]): string {
  return pickRandom(ctx.random, variants) ?? variants[0];
}

export function renderIntent(intent: SpeechIntent, context: TemplateContext): string {
  // Namen bleiben unverändert, auch am Satzanfang ("finn72 ist ein Werwolf", nicht "Finn72").
  const used: string[] = [];
  const ctx: TemplateContext = {
    ...context,
    name: (id) => {
      const value = context.name(id);
      used.push(value);
      return value;
    },
  };
  const upper = (text: string) => (used.some((value) => text.startsWith(value)) ? text : capitalize(text));
  const n = ctx.name;
  const en = ctx.lang === 'en';
  switch (intent.kind) {
    case 'accuse': {
      const t = n(intent.targetId);
      const why = reasonsText(intent.reasons, ctx);
      if (!why) return choose(ctx, en ? [`I have a bad feeling about ${t}.`, `Something about ${t} feels off to me.`] : [`Ich habe bei ${t} ein schlechtes Gefühl.`, `Irgendwas an ${t} stimmt nicht.`]);
      return choose(
        ctx,
        en
          ? [`I suspect ${t}. ${upper(why)}.`, `Honestly, ${t} looks off to me: ${why}.`, `${t} is my top suspect right now, ${why}.`]
          : [`Ich verdächtige ${t}. ${upper(why)}.`, `Ehrlich gesagt finde ich ${t} komisch: ${why}.`, `${t} ist für mich gerade am verdächtigsten, ${why}.`],
      );
    }
    case 'claim': {
      const role = rolePhrase(intent.roleId, ctx.lang);
      const checks = intent.checks
        .map((c) => (en ? `${n(c.targetId)} is ${c.werewolf ? 'a werewolf' : 'clean'}` : `${n(c.targetId)} ist ${c.werewolf ? 'ein Werwolf' : 'sauber'}`))
        .join(', ');
      const why = reasonsText(intent.reasons, ctx);
      let text = en ? `Okay, I'll say it: I am ${role}.` : `Okay, ich sage es jetzt: Ich bin ${role}.`;
      if (checks) text += en ? ` ${upper(checks)}.` : ` ${upper(checks)}.`;
      if (why) text += ` ${upper(why)}.`;
      if (intent.accuseId) text += en ? ` Vote ${n(intent.accuseId)}!` : ` Stimmt für ${n(intent.accuseId)}!`;
      else if (intent.roleId === 'hunter') text += en ? ' If you vote me out, I take someone with me.' : ' Wenn ihr mich verbannt, nehme ich jemanden mit.';
      else if (intent.roleId === 'witch') text += en ? ' Voting me out only helps the wolves.' : ' Wenn ihr mich rauswerft, helft ihr nur den Wölfen.';
      return text;
    }
    case 'defend-self': {
      const accuser = intent.accuserId ? n(intent.accuserId) : null;
      const start = ctx.voice?.nervous
        ? choose(ctx, en ? [`What? No! It's not me...`, `Wait, why me? I'm innocent, really...`] : [`Was? Nein! Ich doch nicht...`, `Moment, warum ich? Ich bin wirklich unschuldig...`])
        : accuser
          ? choose(ctx, en ? [`${accuser}, why me of all people? It's not me.`, `Come on ${accuser}, that makes no sense.`] : [`${accuser}, warum ausgerechnet ich? Ich bin es nicht.`, `Ach komm, ${accuser}, das ergibt doch keinen Sinn.`])
          : choose(ctx, en ? [`It's not me, really.`, `Not me, seriously.`] : [`Ich bin es nicht, ehrlich.`, `Ich war's nicht, wirklich.`]);
      if (!intent.counterId) return start;
      const why = reasonsText(intent.reasons, ctx);
      if (accuser && intent.counterId === intent.accuserId) {
        // Den Ankläger direkt ansprechen; "beschuldigt mich ohne Grund" wird zur Frage an ihn.
        const other = reasonsText(intent.reasons.filter((r) => r.code !== 'accused-me'), ctx);
        return en
          ? `${start} Honestly, ${accuser}, I find you more suspicious. Why are you going after me like that?${other ? ` Also, ${other}.` : ''}`
          : `${start} Ehrlich gesagt finde ich eher dich verdächtig, ${accuser}. Warum gehst du so auf mich los?${other ? ` Außerdem: ${other}.` : ''}`;
      }
      return en
        ? `${start} Look at ${n(intent.counterId)} instead${why ? `, ${why}` : ''}.`
        : `${start} Schaut euch lieber ${n(intent.counterId)} an${why ? `, ${why}` : ''}.`;
    }
    case 'defend':
      return choose(ctx, en ? [`I don't think ${n(intent.targetId)} is a wolf.`, `Leave ${n(intent.targetId)} alone, I trust them.`] : [`Ich glaube nicht, dass ${n(intent.targetId)} ein Werwolf ist.`, `Lasst ${n(intent.targetId)} in Ruhe, ich vertraue ${n(intent.targetId)}.`]);
    case 'agree':
      return choose(
        ctx,
        en
          ? [`I'm with ${n(intent.speakerId)}, ${n(intent.targetId)} seems suspicious to me too.`, `Agreed, ${n(intent.targetId)} is fishy.`]
          : [`Da bin ich bei ${n(intent.speakerId)}, ${n(intent.targetId)} kommt mir auch verdächtig vor.`, `Sehe ich genauso, ${n(intent.targetId)} ist komisch.`],
      );
    case 'react-deaths': {
      const victims = intent.victims.map(n).join(en ? ' and ' : ' und ');
      const follow = intent.suspectId
        ? en
          ? ` I'm keeping an eye on ${n(intent.suspectId)}.`
          : ` Ich habe ${n(intent.suspectId)} im Auge.`
        : ` ${choose(
            ctx,
            en
              ? ['We need to vote smart today.', 'Who had a reason?', 'That was no coincidence.', 'I hope we find the wolves today.']
              : ['Wir müssen heute klug abstimmen.', 'Wer hatte einen Grund dafür?', 'Das war bestimmt kein Zufall.', 'Ich hoffe, wir finden heute die Wölfe.'],
          )}`;
      const opener = choose(
        ctx,
        en
          ? [`Oh no, ${victims}...`, `Not ${victims}...`, `Damn, ${victims} is gone.`, `${victims}, seriously?`]
          : [`Oh nein, ${victims}...`, `Nicht ${victims}...`, `Mist, ${victims} ist weg.`, `${victims}, echt jetzt?`],
      );
      return opener + follow;
    }
    case 'vote':
      return en ? `I'm voting for ${n(intent.targetId)}.` : `Ich stimme für ${n(intent.targetId)}.`;
    case 'answer': {
      const asker = ctx.random() < 0.5 ? `${n(intent.askedById)}, ` : '';
      const role = rolePhrase(ctx.presentedRole, ctx.lang);
      const suspect = intent.suspectId ? n(intent.suspectId) : null;
      const why = reasonsText(intent.reasons, ctx);
      let text: string;
      switch (intent.topic) {
        case 'role':
          text = choose(ctx, en ? [`I'm ${role}, honestly.`, `No, I'm ${role}.`] : [`Ich bin ${role}, ehrlich.`, `Nein, ich bin ${role}.`]);
          break;
        case 'suspect':
          text = suspect
            ? (en ? `My guess is ${suspect}` : `Ich tippe auf ${suspect}`) + (why ? `, ${why}.` : '.')
            : en
              ? `No clear suspect yet, to be honest.`
              : `Ehrlich gesagt habe ich noch keinen klaren Verdacht.`;
          break;
        case 'why':
          text = why ? (en ? `Because ${why}.` : `Weil ${why}.`) : en ? `Mostly a gut feeling.` : `Ist eher ein Bauchgefühl.`;
          break;
        case 'vote':
          text = suspect ? (en ? `Probably ${suspect}.` : `Wahrscheinlich für ${suspect}.`) : en ? `I don't know yet.` : `Weiß ich noch nicht.`;
          break;
        default:
          text = suspect
            ? en
              ? `Good question. I'm still watching ${suspect}.`
              : `Gute Frage. Ich behalte jedenfalls ${suspect} im Auge.`
            : en
              ? `I don't know more than you, sorry.`
              : `Ich weiß auch nicht mehr als du, sorry.`;
      }
      // Nach "Name, " klein weiterschreiben (im Englischen bleibt "I" groß).
      const keepCapital = en && /^I\b/.test(text);
      return asker + (asker && !keepCapital ? text.charAt(0).toLowerCase() + text.slice(1) : text);
    }
    case 'ask': {
      const t = n(intent.targetId);
      if (intent.topic === 'role') {
        return choose(ctx, en ? [`${t}, what's your role actually?`, `${t}, care to tell us your role?`] : [`${t}, was bist du eigentlich?`, `${t}, magst du sagen, welche Rolle du hast?`]);
      }
      return choose(
        ctx,
        en
          ? [`${t}, you've been pretty quiet. Who do you suspect?`, `${t}, what do you think, who was it?`, `What about you, ${t}? Who is suspicious to you?`]
          : [`${t}, du warst bisher ziemlich still. Wen verdächtigst du?`, `${t}, was denkst du, wer war es?`, `Und du, ${t}? Wer ist dir verdächtig?`],
      );
    }
    case 'unsure':
      return choose(
        ctx,
        en
          ? [`Hard to say so far. Who has been quiet?`, `No clear suspicion yet, I'm listening.`, `I really don't know yet. Anyone got something concrete?`, `Nothing solid so far. Let's hear everyone first.`]
          : [`Schwer zu sagen bisher. Wer war denn so still?`, `Ich habe noch keinen klaren Verdacht, ich höre erst mal zu.`, `Keine Ahnung bisher. Hat jemand was Konkretes?`, `Noch nichts Handfestes. Lasst erst mal alle was sagen.`],
      );
  }
}

const FILLERS: Record<TemplateLanguage, string[]> = {
  de: ['hm,', 'also', 'ehrlich gesagt', 'naja,', 'puh,'],
  en: ['hm,', 'honestly', 'well,', 'okay,', 'ugh,'],
};

/** Sprechstil anwenden: Füllwörter, Unsicherheit, lockere Schreibweise. Namen bleiben großgeschrieben. */
export function styleMessage(text: string, voice: Voice, lang: TemplateLanguage, names: readonly string[], random: Random): string {
  const startsWithName = names.some((name) => text.startsWith(name));
  const lowerFirst = (value: string) => (startsWithName ? value : value.charAt(0).toLowerCase() + value.slice(1));
  let result = text;
  if (voice.fillers && random() < 0.35) result = `${pickRandom(random, FILLERS[lang])} ${lowerFirst(result)}`;
  if (voice.nervous && random() < 0.4) result = result.replace(/[.!]$/, '...');
  if (voice.casual) {
    result = lowerFirst(result);
    if (random() < 0.6) result = result.replace(/\.$/, '');
  }
  return result;
}
