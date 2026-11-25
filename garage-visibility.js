export const LEVELS = [
  ['all','Alle Teile gleichzeitig'],
  ['shell','Stufe 1 · Außenhülle'],
  ['cabin','Stufe 2 · Ohne Außenhülle'],
  ['structure','Stufe 3 · Rohbau und Technik'],
  ['mechanics','Stufe 4 · Nur Technik'],
  ['interior','Nur Innenraum'],
  ['chassis','Nur Fahrwerk und Bremsen']
];
const shell=['Karosserie','Verglasung','Anbauteile','Beleuchtung'];
const cabin=['Innenraum','Sicherheit','Klima'];
export function partVisible(part,level='all'){
  const group=part?.group;
  if(level==='all')return true;
  if(level==='shell')return shell.includes(group);
  if(level==='cabin')return !shell.includes(group);
  if(level==='structure')return ![...shell,...cabin].includes(group);
  if(level==='mechanics')return ![...shell,...cabin,'Rohbau'].includes(group);
  if(level==='interior')return cabin.includes(group);
  if(level==='chassis')return ['Fahrwerk','Radaufhängung','Bremsanlage','Lenkung'].includes(group);
  return group===level;
}
