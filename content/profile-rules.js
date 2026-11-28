export const audioDefaults = { music: true, effects: false, musicVolume: 35, effectsVolume: 8 };

export const localFindIds = new Set(['01', '02', '03', '04', '05', '06', '23', '24', '25', '28', '29', '30']);

export function collectionFinds(data, { discovered, facts }, personId) {
  const found = Object.keys(discovered);
  const awards = [];
  if ((personId ? [personId] : found).some(id => data.people[id]?.facts.every(factId => facts[factId]))) awards.push('08');
  if (found.length === Object.keys(data.people).length) awards.push('07');
  if (new Set(found.map(id => data.people[id]?.category).filter(Boolean)).size === data.categories.length) awards.push('09');
  return awards;
}

export function balanceFinds({ earned, reputation }) {
  const awards = [];
  if (earned >= 3000) awards.push('22');
  if (reputation >= 100) awards.push('11');
  if (reputation >= 500) awards.push('13');
  return awards;
}
