// Balanced Group Randomizer encryption primitives. Never derive keys from OAuth tokens.
// This module intentionally has no Firebase or browser-UI dependency.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const PREFIX = 'bgr-e2ee-v1';

export function toB64(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text=''; for (let i=0;i<array.length;i+=8192) text+=String.fromCharCode(...array.subarray(i,i+8192));
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function fromB64(text) {
  if (typeof text!=='string' || !/^[a-zA-Z0-9_-]+$/.test(text) || text.length>1000000) throw Error('Invalid encoded bytes.');
  const input=text.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(input.padEnd(Math.ceil(input.length/4)*4,'='));
  return Uint8Array.from(raw,character=>character.charCodeAt(0));
}
export function freshId(){ return toB64(crypto.getRandomValues(new Uint8Array(18))); }
export async function generateVaultKey(){
  return crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
}
function vaultAAD(uid, revision){
  if(typeof uid!=='string'||!uid||!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid vault context.');
  return encoder.encode(`${PREFIX}|vault|${uid}|${revision}`);
}
export async function encryptVault(key, data, uid, revision){
  const plaintext=encoder.encode(JSON.stringify(data));
  if(plaintext.length>500000)throw Error('Classroom database exceeds the encrypted backup size limit (500 KB).');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:vaultAAD(uid,revision)},key,plaintext);
  return {schema:PREFIX,iv:toB64(iv),ciphertext:toB64(ciphertext)};
}
export async function decryptVault(key, remote, uid){
  if(!remote||remote.schema!==PREFIX||!Number.isSafeInteger(remote.revision)||remote.revision<1)throw Error('Encrypted vault format is unsupported.');
  const iv=fromB64(remote.iv); if(iv.length!==12)throw Error('Invalid vault IV.');
  const ciphertext=fromB64(remote.ciphertext);
  if(ciphertext.length>680000)throw Error('Encrypted vault exceeds the size limit.');
  try {
    const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:vaultAAD(uid,remote.revision)},key,ciphertext);
    const obj=JSON.parse(decoder.decode(bytes));
    if(!obj || !Array.isArray(obj.classes))throw Error('Invalid classroom structure.');
    return obj;
  } catch(_) {throw Error('Could not decrypt cloud classes. This device may have a different key, or the cloud record may be damaged.');}
}
export async function newEphemeral(){
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  return {privateKey:pair.privateKey,publicKey:toB64(pub)};
}
export async function pairingSecrets(privateKey, ownPublic, peerPublic, uid, requestId, requesterPublic, hostPublic){
  if(typeof uid!=='string'||!uid||typeof requestId!=='string'||!requestId)throw Error('Invalid pairing context.');
  const peer=await crypto.subtle.importKey('raw',fromB64(peerPublic),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},privateKey,256));
  const context=`${PREFIX}|pair|${uid}|${requestId}|${requesterPublic}|${hostPublic}`;
  if(ownPublic!==requesterPublic && ownPublic!==hostPublic)throw Error('Pairing public keys do not match.');
  const keyMaterial=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey']);
  const salt=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(`${context}|salt`)));
  const wrappingKey=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:encoder.encode(`${PREFIX}|wrap-key`)},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const transcript=new Uint8Array([...encoder.encode(`${context}|verify|`),...secret]);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',transcript));
  const number=(((hash[0]*16777216)+(hash[1]<<16)+(hash[2]<<8)+hash[3])>>>0)%100000000;
  return {code:String(number).padStart(8,'0'),wrappingKey,context};
}
export async function wrapVaultKey(vaultKey, secrets){
  if(!vaultKey)throw Error('Vault key is missing.');
  const raw=await crypto.subtle.exportKey('raw',vaultKey);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(secrets.context)},secrets.wrappingKey,raw);
  return {iv:toB64(iv),ciphertext:toB64(cipher)};
}
export async function unwrapVaultKey(envelope,secrets){
  const iv=fromB64(envelope.iv); const encrypted=fromB64(envelope.ciphertext);
  if(iv.length!==12||encrypted.length!==48)throw Error('Invalid device key envelope.');
  try{
    const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(secrets.context)},secrets.wrappingKey,encrypted);
    return await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},true,['encrypt','decrypt']);
  }catch(_){throw Error('Device pairing failed cryptographic verification.');}
}
// The classroom key is stored locally, not in Firebase. Browsers can purge IndexedDB;
// sign-in on another device needs the existing device to approve a new pairing.
const DB_NAME='bgr-e2ee-keys-v1';
function openDB(){
  return new Promise((resolve,reject)=>{
    if(!indexedDB) return reject(Error('Secure local key storage is unavailable.'));
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('keys'))req.result.createObjectStore('keys');};
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||Error('Could not open local key storage.'));
  });
}
async function operateKey(uid,mode,key){
  const db=await openDB();
  try {return await new Promise((resolve,reject)=>{
    const tx=db.transaction('keys',mode==='get'?'readonly':'readwrite');
    const store=tx.objectStore('keys');
    const req=mode==='get'?store.get(uid):mode==='set'?store.put(key,uid):store.delete(uid);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('Could not access local key.'));
    tx.onerror=()=>reject(tx.error||Error('Could not save local key.'));
  });} finally {db.close();}
}
export async function getDeviceKey(uid){return (await operateKey(uid,'get'))||null;}
export async function storeDeviceKey(uid,key){await operateKey(uid,'set',key);}
export async function forgetDeviceKey(uid){await operateKey(uid,'delete');}
