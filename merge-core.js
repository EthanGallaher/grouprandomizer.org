// BGR V47: deterministic merge of two classroom snapshots against a verified
// common ancestor. Never guesses when two edits overlap.
const MISSING = Symbol('missing');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a,b) => a === MISSING ? b === MISSING : b !== MISSING && JSON.stringify(a) === JSON.stringify(b);
const keyed = arr => Array.isArray(arr) && arr.every(x => plain(x) && typeof x.id === 'string') && new Set(arr.map(x=>x.id)).size === arr.length;
function mergeValue(base,local,remote,path,conflicts){
  if(same(local,remote))return local;
  if(same(local,base))return remote;
  if(same(remote,base))return local;
  if(plain(base)&&plain(local)&&plain(remote)){
    const result={};
    for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      const val=mergeValue(Object.hasOwn(base,k)?base[k]:MISSING,Object.hasOwn(local,k)?local[k]:MISSING,Object.hasOwn(remote,k)?remote[k]:MISSING,`${path}.${k}`,conflicts);
      if(val!==MISSING)result[k]=val;
    }
    return result;
  }
  if(keyed(base)&&keyed(local)&&keyed(remote)){
    const bm=new Map(base.map(x=>[x.id,x])),lm=new Map(local.map(x=>[x.id,x])),rm=new Map(remote.map(x=>[x.id,x]));
    const merged=new Map();
    for(const id of new Set([...bm.keys(),...lm.keys(),...rm.keys()])){
      const val=mergeValue(bm.has(id)?bm.get(id):MISSING,lm.has(id)?lm.get(id):MISSING,rm.has(id)?rm.get(id):MISSING,`${path}[${id}]`,conflicts);
      if(val!==MISSING)merged.set(id,val);
    }
    // Reorders may affect group priority; don't silently choose competing orders.
    const baseOrder=base.map(x=>x.id).filter(id=>merged.has(id));
    const localOrder=local.map(x=>x.id).filter(id=>bm.has(id)&&merged.has(id));
    const remoteOrder=remote.map(x=>x.id).filter(id=>bm.has(id)&&merged.has(id));
    const baseExisting=baseOrder.filter(id=>lm.has(id)&&rm.has(id));
    const lo=localOrder.filter(id=>rm.has(id)),ro=remoteOrder.filter(id=>lm.has(id));
    const lChanged=JSON.stringify(lo)!==JSON.stringify(baseExisting);
    const rChanged=JSON.stringify(ro)!==JSON.stringify(baseExisting);
    if(lChanged&&rChanged&&JSON.stringify(lo)!==JSON.stringify(ro))conflicts.push(`${path} (order)`);
    const preferred=(lChanged&&!rChanged?local:remote).map(x=>x.id);
    return [...new Set([...preferred,...local.map(x=>x.id),...remote.map(x=>x.id)])].filter(id=>merged.has(id)).map(id=>merged.get(id));
  }
  conflicts.push(path);
  return local;
}
export function mergeThreeWay(base,local,remote){
  if(!base||!local||!remote||!Array.isArray(base.classes))return {merged:null,conflicts:['No verified common revision']};
  const conflicts=[];
  const b={...base},l={...local},r={...remote};
  delete b.activeId;delete l.activeId;delete r.activeId;
  const merged=mergeValue(b,l,r,'classroom',conflicts);
  merged.activeId=local.activeId;
  return {merged:conflicts.length?null:merged,conflicts};
}
const clone=x=>JSON.parse(JSON.stringify(x));
function withoutDomains(snapshot){
  const c=clone(snapshot);
  delete c.activeId;delete c.activeSeatingTemplateId;delete c.seatingTemplates;delete c.sharedSeating;
  for(const cl of c.classes){
    for(const field of Object.keys(cl))if(field.toLowerCase().includes('seating'))delete cl[field];
    for(const stu of cl.students)delete stu.tier;
  }
  return c;
}
// For conflicts created by older V46 clients without a stored ancestor, require
// the teacher to select which device owns each changed domain. Other differences
// must be identical, or the merge is refused rather than guessing.
export function mergeLegacyDomains(local,remote,tierSource,seatingSource){
  if(!['local','cloud'].includes(tierSource)||!['local','cloud'].includes(seatingSource))throw Error('Choose a source for each changed setting.');
  if(JSON.stringify(withoutDomains(local))!==JSON.stringify(withoutDomains(remote)))throw Error('Other settings differ too. An automatic combination would be unsafe; preserve both backups and resolve those differences first.');
  const result=clone(remote),tier=tierSource==='local'?local:remote,seat=seatingSource==='local'?local:remote;
  const tiers=new Map(tier.classes.map(c=>[c.id,new Map(c.students.map(s=>[s.id,s.tier]))]));
  const seats=new Map(seat.classes.map(c=>[c.id,c]));
  for(const cl of result.classes){
    const t=tiers.get(cl.id),s=seats.get(cl.id);
    if(!t||!s||cl.students.some(st=>!t.has(st.id)))throw Error('Roster IDs differ. Cannot safely combine these copies.');
    cl.students.forEach(st=>{st.tier=t.get(st.id);});
    for(const field of Object.keys(cl))if(field.toLowerCase().includes('seating'))delete cl[field];
    for(const [field,value] of Object.entries(s))if(field.toLowerCase().includes('seating'))cl[field]=clone(value);
  }
  for(const field of ['activeSeatingTemplateId','seatingTemplates','sharedSeating']){
    if(Object.hasOwn(result,field))delete result[field];
    if(Object.hasOwn(seat,field))result[field]=clone(seat[field]);
  }
  result.activeId=local.activeId;
  return result;
}
