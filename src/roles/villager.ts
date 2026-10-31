import { defineRole } from '../engine';

export const villager = defineRole({
  id: 'villager',
  name: 'Dorfbewohner',
  description: 'Hat keine Sonderfähigkeit. Diskutiert, stimmt ab und versucht, die Werwölfe am Verhalten zu entlarven.',
  faction: 'village',
  team: 'village',
});
