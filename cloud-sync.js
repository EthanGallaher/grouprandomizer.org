// Balanced Group Randomizer: opt-in, end-to-end encrypted, Google-authenticated sync BETA.
// Google confirms identity; it is NEVER used as encryption key material.
// Device-held AES key encrypts all classroom payloads before Firestore receives them.
// New devices require explicit approval by an already-unlocked device.
// TEST WITH FICTIONAL CLASSROOM DATA ONLY. This is not production- or FERPA-approved.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore, doc, collection, getDocFromServer, getDocs, onSnapshot, runTransaction, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {generateVaultKey,encryptVault,decryptVault,newEphemeral,pairingSecrets,wrapVaultKey,unwrapVaultKey,getDeviceKey,storeDeviceKey,forgetDeviceKey,freshId} from './e2ee-core.js';

const $=id=>document.getElementById(id);
const bridge=window.BGRSyncBridge;
const cfg=window.BGR_FIREBASE_CONFIG||{};
const configured=Boolean(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId&&!cfg.apiKey.startsWith('PASTE_'));
const STATE_PREFIX='bgr.cloud.syncState.';
const BOUND_KEY='bgr.cloud.boundAccount';
const DEMO_NAME=/^(fictional|imaginary|demo|test)[\s_-]/i;
const PAIR_LIFETIME_MS=10*60*1000;
// Browser timers may pause when devices sleep. The Firestore listener is the
// fast path; an independent server check runs every two minutes while visible.
const AUTO_CHECK_MS=2*60*1000;
const FICTIONAL_ACK_PREFIX='bgr.cloud.fictionalTesting.';
const tabId=freshId();
let auth, firestore, user=null, key=null;
let state={enabled:false,rev:0,dirty:false};
let active=false,busy=false,conflict=false,lastServer=null;
let unlisten=null,unlistenPairs=null,unlistenJoin=null;
let debounce=null,retry=null,autoTimer=null,checking=false,receiving=false,skipLocalSave=false,epoch=0;
let pendingPairRequests=[],pairHost=null,pairJoin=null;
const ui=(message,error=false)=>{
  $('cloudModeHelp').textContent=message;
  $('cloudModeHelp').style.color=error?'#ad2638':'';
};
const title=text=>{$('cloudModeLabel').textContent=text;};
function isTestDataset(data){return Boolean($('cloudFictionalConfirm')?.checked)&&Array.isArray(data.classes);}
function canUploadTestDataset(data){return isDemoDataset(data)||isTestDataset(data);}
function isDemoDataset(data){
  return Array.isArray(data.classes) && data.classes.every(c=>
    Array.isArray(c.students)&&c.students.every(s=>
      typeof s.name==='string'&&DEMO_NAME.test(s.name)&&
      (!s.sourceFullName||DEMO_NAME.test(s.sourceFullName))));
}
function view(mode){
  $('cloudSetupActions').hidden=mode!=='setup';
  $('cloudActiveActions').hidden=mode!=='active';
  $('cloudConflictActions').hidden=mode!=='conflict';
  $('cloudPairActions').hidden=mode!=='pair';
  $('cloudDeleteBtn').hidden=!user;
  if(mode==='setup'){
    $('cloudUseRemoteBtn').hidden=!lastServer;
    const bound=localStorage.getItem(BOUND_KEY);
    $('cloudUseThisBtn').hidden=!!(bound&&bound!==user?.uid);
    $('cloudUseThisBtn').textContent=lastServer?'Replace encrypted cloud with this device':'Enable encrypted sync with this device';
  }
}
function showPairHost(){
  const panel=$('cloudPairHostPanel');
  if(!user||!key||(!pairHost&&!pendingPairRequests.length)){panel.hidden=true;return;}
  panel.hidden=false;
  const latest=pendingPairRequests[0];
  $('cloudPairReviewBtn').hidden=!!pairHost||!latest;
  $('cloudPairApproveBtn').hidden=!pairHost;
  $('cloudPairRejectBtn').hidden=!pairHost;
  $('cloudPairHostCode').textContent=pairHost?pairHost.secrets.code:'—';
  $('cloudPairHostHelp').textContent=pairHost
    ?'Compare this 8-digit number with the new device. Only approve if BOTH screens match and you initiated the pairing.'
    :`New device asking for access: ${latest?.requester||'Unidentified device'}. Verify it belongs to you before proceeding.`;
}
async function localFingerprint(){
  const bytes=new TextEncoder().encode(JSON.stringify(bridge.read()));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function metaKey(){return STATE_PREFIX+user.uid;}
function readState(){try{return {...{enabled:false,rev:0,dirty:false},...JSON.parse(localStorage.getItem(metaKey())||'{}')};}catch(_){return {enabled:false,rev:0,dirty:false};}}
function restoreFictionalAcknowledgement(){
  // This is a test-only consent on this browser/account. It is NOT PII detection.
  const checkbox=$('cloudFictionalConfirm');
  if(checkbox)checkbox.checked=!!user&&localStorage.getItem(FICTIONAL_ACK_PREFIX+user.uid)==='true';
}
function beginAutoChecks(){
  if(!autoTimer&&active)autoTimer=setInterval(()=>void automaticCheck(),AUTO_CHECK_MS);
}
function stopAutoChecks(){
  if(autoTimer){clearInterval(autoTimer);autoTimer=null;}
}
function persist(){if(user)localStorage.setItem(metaKey(),JSON.stringify(state));}
function bindAccount(){localStorage.setItem(BOUND_KEY,user.uid);}
function safelyStop(){
  active=false;conflict=false;clearTimeout(debounce);clearTimeout(retry);stopAutoChecks();
  if(unlisten){unlisten();unlisten=null;}
}
function stopPairing(){
  if(unlistenPairs){unlistenPairs();unlistenPairs=null;}
  if(unlistenJoin){unlistenJoin();unlistenJoin=null;}
  pendingPairRequests=[];pairHost=null;pairJoin=null;
  showPairHost();
}
function ref(){return doc(firestore,'teacherCloud',user.uid);}
function requestRef(uid,id){return doc(firestore,'teacherCloud',uid,'pairRequests',id);}
function pairCollection(uid){return collection(firestore,'teacherCloud',uid,'pairRequests');}
function cloudData(snap){
  if(!snap.exists())return null;
  const data=snap.data();
  if(data.payload!==undefined)throw Error('This is a legacy, unencrypted cloud backup. It cannot be used with encrypted sync. Export or delete that TEST backup using the previous beta before enabling this version. No data has been overwritten.');
  if(data.schema!=='bgr-e2ee-v1'||!Number.isSafeInteger(data.revision)||data.revision<1||
     typeof data.iv!=='string'||typeof data.ciphertext!=='string')throw Error('Cloud vault is not in the expected encrypted format.');
  return data;
}
async function parseRemote(remote){
  if(!key)throw Error('This device does not yet have the classroom encryption key. Pair it with your existing device.');
  return decryptVault(key,remote,user.uid);
}
async function downloadRemoteBackup(remote,label){
  const data=await parseRemote(remote);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const link=document.createElement('a'),url=URL.createObjectURL(blob);
  link.href=url;link.download=label+'-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function applyRemote(remote,backup=true,guard=null){
  const parsed=await parseRemote(remote);
  // Another local edit may happen while decryption is running. Never lose it.
  if(guard&&(!active||!user||user.uid!==guard.owner||epoch!==guard.epoch||
     state.dirty||state.rev!==guard.rev||(await localFingerprint())!==guard.fingerprint)){
    throw Error('Local classroom data changed while downloading cloud updates.');
  }
  if(backup)bridge.backup('bgr-local-before-encrypted-cloud-restore');
  skipLocalSave=true;
  try {bridge.apply(parsed);}finally{skipLocalSave=false;}
  state.rev=remote.revision;state.dirty=false;state.fingerprint=await localFingerprint();persist();
}
function markConflict(message){
  conflict=true;active=false;clearTimeout(debounce);stopAutoChecks();
  $('googleSyncStatus').textContent='Encrypted sync paused: resolve the conflict.';
  title('Two devices changed classrooms');
  ui(message||'Choose which copy to keep; nothing has been overwritten.',true);
  view('conflict');
}
function showActive(){
  $('googleSyncStatus').textContent='Encrypted auto-sync ON · updates upload as you edit · cloud checked every 2 minutes while the app is visible.';
  beginAutoChecks();
  title(state.dirty?'Encrypted sync — saving changes':'End-to-end encrypted sync is on');
  ui(state.dirty?'Changes are saved on this device; encrypted cloud upload is pending.':'Automatic sync is running: updates arrive as they are saved, with a cloud check every two minutes while the app is visible. Resuming the app checks immediately. Firebase receives encrypted data only.');
  view('active');
}
function schedulePush(delay=1200){
  if(!active||!user||!key||conflict)return;
  clearTimeout(debounce);
  debounce=setTimeout(()=>void push().catch(e=>ui('Encrypted sync error: '+e.message,true)),delay);
}
async function push(){
  if(!active||!user||!key||conflict||busy||!state.dirty)return;
  if(!navigator.onLine){title('Offline — saved locally');ui('The app will retry encrypted upload when the network returns.');return;}
  const owner=user.uid,guardEpoch=epoch;
  const classroom=bridge.read();
  if(!canUploadTestDataset(classroom)){
    title('Testing safeguard — fictional students only');
    ui('This unapproved beta will not upload real or unmarked student names, even though payloads are encrypted. Use the fictional-data testing checkbox to confirm that all records are invented, or prefix every name with Fictional, Imaginary, Demo, or Test.',true);
    active=false;state.dirty=true;persist();view('none');return;
  }
  const before=JSON.stringify(classroom),expected=state.rev;
  busy=true;title('Encrypting and uploading…');ui('Unencrypted classroom content never enters the Firestore write.');
  let succeeded=false;
  try{
    const encrypted=await encryptVault(key,classroom,owner,expected+1);
    await runTransaction(firestore,async tx=>{
      const snapshot=await tx.get(doc(firestore,'teacherCloud',owner));
      const actual=snapshot.exists()?snapshot.data().revision:0;
      if(actual!==expected)throw Error('REVISION_CONFLICT');
      if(snapshot.exists()&&snapshot.data().schema!=='bgr-e2ee-v1')throw Error('Unencrypted legacy cloud data must be removed before E2EE upload.');
      tx.set(doc(firestore,'teacherCloud',owner),{
        schema:encrypted.schema,iv:encrypted.iv,ciphertext:encrypted.ciphertext,
        revision:expected+1,writer:tabId,updatedAt:serverTimestamp()
      });
    });
    if(!user||user.uid!==owner||guardEpoch!==epoch)return;
    succeeded=true;state.rev=expected+1;state.dirty=JSON.stringify(bridge.read())!==before;
    if(!state.dirty)state.fingerprint=await localFingerprint();
    persist();showActive();
  }catch(err){
    if(!user||user.uid!==owner||guardEpoch!==epoch)return;
    state.dirty=true;persist();
    if(err.message==='REVISION_CONFLICT'){
      try{lastServer=cloudData(await getDocFromServer(ref()));markConflict('A different device saved an encrypted revision before this one. Nothing was overwritten.');}
      catch(e){title('Sync stopped');ui(e.message,true);safelyStop();}
    }else{
      title('Cloud unavailable — local classes saved');
      ui('Encrypted upload failed: '+(err.message||'Unknown error'),true);
      clearTimeout(retry);retry=setTimeout(()=>schedulePush(200),12000);
    }
  }finally{busy=false;if(succeeded&&active&&state.dirty&&!conflict)schedulePush(300);}
}
async function received(remote){
  if(receiving||!active||!user||!key||!remote||remote.revision<=state.rev)return;
  const owner=user.uid,guardEpoch=epoch;
  if(remote.writer===tabId){if(busy)return;state.rev=remote.revision;persist();return;}
  receiving=true;
  try{
    lastServer=remote;
    if(state.dirty||busy){markConflict('Encrypted updates arrived while this device had local unsynced edits.');return;}
    const fingerprint=await localFingerprint();
    if(state.fingerprint&&fingerprint!==state.fingerprint){
      state.dirty=true;persist();
      markConflict('Local classes changed since the last upload; the cloud version was not allowed to overwrite them.');return;
    }
    const guard={owner,epoch:guardEpoch,rev:state.rev,fingerprint};
    await applyRemote(remote,true,guard);
    if(active&&user?.uid===owner&&epoch===guardEpoch)showActive();
  }catch(err){
    if(user?.uid===owner&&epoch===guardEpoch)markConflict('Cannot safely restore this cloud revision: '+err.message);
  }finally{receiving=false;}
}
function listen(){
  if(unlisten)unlisten();
  const owner=user.uid;
  unlisten=onSnapshot(doc(firestore,'teacherCloud',owner),snap=>{
    if(!user||user.uid!==owner||!active)return;
    try{
      const remote=cloudData(snap);
      if(!remote){if(state.rev>0)markConflict('Encrypted cloud backup was deleted. Local data is safe.');return;}
      void received(remote);
    }catch(err){safelyStop();title('Encrypted sync disabled');ui(err.message,true);view('none');}
  },err=>{
    // An active visible device can recover using the periodic server check.
    unlisten=null;
    ui('Live updates temporarily disconnected; automatic cloud checks will keep retrying. '+err.message,true);
  });
}
async function automaticCheck(){
  if(checking||receiving||!active||!user||!key||conflict||busy||
     document.visibilityState==='hidden'||!navigator.onLine)return;
  checking=true;
  const owner=user.uid,guardEpoch=epoch;
  try{
    if(state.fingerprint&&!state.dirty&&(await localFingerprint())!==state.fingerprint){
      state.dirty=true;persist();
    }
    const remote=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',owner)));
    if(!active||!user||user.uid!==owner||epoch!==guardEpoch||conflict)return;
    lastServer=remote;
    if(!remote){
      if(state.rev>0){markConflict('Encrypted cloud version was removed. Local data is safe.');return;}
    }else if(remote.revision>state.rev){
      await received(remote);
    }else if(remote.revision<state.rev){
      markConflict('Cloud revision moved backwards; automatic sync paused to protect your newer local data.');return;
    }
    if(active&&!conflict){
      if(!unlisten)listen();
      if(state.dirty)schedulePush(300);
    }
  }catch(err){
    if(active&&user?.uid===owner&&epoch===guardEpoch){
      ui('Automatic sync check could not reach the cloud. Your classes remain saved here; it will retry. '+err.message,true);
    }
  }finally{checking=false;}
}
function checkIfVisible(){if(active&&document.visibilityState!=='hidden')void automaticCheck();}

function pairReadyView(){
  $('googleSyncStatus').textContent='Google connected; encrypted cloud data needs authorization from an existing device.';
  title('Authorize this device once');
  ui('Sign in with the SAME Google account on your existing authorized device. Request pairing here, then compare the 8-digit number on both screens. No additional password is required.');
  view('pair');
  $('cloudPairRequestBtn').disabled=!!pairJoin;
  $('cloudPairCancelBtn').hidden=!pairJoin;
  $('cloudPairConfirmBtn').hidden=!pairJoin?.secrets||!!pairJoin?.confirmed;
  $('cloudPairCode').textContent=pairJoin?.secrets?.code||'—';
  $('cloudPairStatus').textContent=pairJoin?.secrets
    ?'Verify that both device screens display exactly this number before confirming.'
    :pairJoin?'Waiting for the existing device to review the request…':'The classroom key never comes from the Google OAuth token.';
}
async function loadAccount(){
  if(!user)return;
  safelyStop();stopPairing();key=null;state=readState();
  const owner=user.uid,guardEpoch=epoch;
  title('Checking encrypted cloud vault…');ui('No classroom information will upload without explicit opt-in.');view('none');
  try{
    const loadedKey=await getDeviceKey(owner);
    const remote=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',owner)));
    if(!user||user.uid!==owner||guardEpoch!==epoch)return;
    key=loadedKey;lastServer=remote;
    if(remote&&!key){pairReadyView();return;}
    if(remote&&key)await parseRemote(remote); // Fail closed if the local key is wrong.
    if(key)watchPairRequests(owner);
    const bound=localStorage.getItem(BOUND_KEY);
    if(bound&&bound!==owner){
      state.enabled=false;persist();title('Different Google account');
      ui('This browser belongs to a different teacher account. Export its data first or restore this Google account’s encrypted copy. Existing local data will not upload across accounts.',true);
      view('setup');return;
    }
    if(state.enabled&&bound===owner&&key){
      active=true;
      // A teacher may have edited local classes while signed out. Never silently replace those edits.
      if(!state.dirty&&state.fingerprint&&state.fingerprint!==await localFingerprint()){
        state.dirty=true;persist();
      }
      if(state.dirty){
        if((remote?.revision||0)!==state.rev){markConflict('This device has unsynced edits and the cloud revision is different.');return;}
        showActive();listen();schedulePush(200);return;
      }
      if(remote){
        // Reconnect to the latest cloud revision on every Google sign-in.
        // A local backup is saved if the cloud revision differs from this device's last revision.
        await applyRemote(remote,remote.revision!==state.rev);
        showActive();listen();return;
      }
      if(state.rev>0){markConflict('Encrypted cloud copy has disappeared. Automatic upload is paused.');return;}
      state.dirty=true;persist();showActive();listen();schedulePush(300);return;
    }
    title(remote?'Encrypted cloud vault found':'Encrypted cloud sync is off');
    ui(remote?'This device has its classroom key. Choose whether to restore the encrypted cloud copy or replace it with this device.':'Click Enable to create this browser’s private classroom key and upload an encrypted copy of your fictional classes.');
    view('setup');
  }catch(err){
    safelyStop();title('Cloud vault unavailable');ui(err.message||String(err),true);view('none');
  }
}
async function beginFromLocal(){
  if(!user||busy)return;
  if(!canUploadTestDataset(bridge.read())){title('Fictional students only');ui('Confirm all names are fictional using the testing checkbox, or prefix every name with Fictional, Imaginary, Demo, or Test. Test in a separate browser profile.',true);return;}
  const bound=localStorage.getItem(BOUND_KEY);
  if(bound&&bound!==user.uid){ui('A different teacher’s local data is present. Cannot upload it to this account.',true);return;}
  const owner=user.uid;
  if(lastServer&&!key){pairReadyView();return;}
  if(lastServer){
    if(!confirm('Replace the existing ENCRYPTED cloud classrooms with this device? A readable backup of the previous cloud copy downloads to this device first.'))return;
    await downloadRemoteBackup(lastServer,'bgr-decrypted-cloud-before-overwrite');
  }else if(!confirm('Enable end-to-end encrypted synchronization for FICTIONAL test classes? This browser will create the classroom key, kept locally and shared only when you approve another device. Losing ALL authorized devices loses access to the encrypted cloud copy.'))return;
  if(!key){key=await generateVaultKey();await storeDeviceKey(owner,key);watchPairRequests(owner);}
  state={enabled:true,rev:lastServer?.revision||0,dirty:true};bindAccount();persist();
  active=true;conflict=false;listen();showActive();await push();
}
async function beginFromCloud(){
  if(!user||busy)return;
  if(!key){pairReadyView();return;}
  const remote=cloudData(await getDocFromServer(ref()));
  if(!remote){ui('There is no encrypted cloud copy.',true);return;}
  await parseRemote(remote);
  if(!confirm('Replace local classes on THIS device with your decrypted cloud version? Your local classes will be downloaded as a safety backup first.'))return;
  lastServer=remote;state={enabled:true,rev:remote.revision,dirty:false};bindAccount();
  await applyRemote(remote,true);persist();active=true;conflict=false;listen();showActive();
}
async function resolveKeepCloud(){
  if(!user||busy||!key)return;
  const remote=cloudData(await getDocFromServer(ref()));
  if(!remote){ui('No cloud copy available.',true);return;}
  await parseRemote(remote);
  if(!confirm('Discard local unsynced edits and use the decrypted cloud copy? A local safety backup downloads first.'))return;
  lastServer=remote;await applyRemote(remote,true);state.enabled=true;bindAccount();persist();
  conflict=false;active=true;listen();showActive();
}
async function resolveKeepLocal(){
  if(!user||busy||!key)return;
  const remote=cloudData(await getDocFromServer(ref()));
  if(!confirm('Overwrite the ENCRYPTED cloud version with this device’s current classes? Other devices’ changes will be replaced.'))return;
  if(remote)await downloadRemoteBackup(remote,'bgr-decrypted-before-conflict-overwrite');
  lastServer=remote;state.rev=remote?.revision||0;state.enabled=true;state.dirty=true;bindAccount();persist();
  conflict=false;active=true;listen();showActive();await push();
}
function watchPairRequests(owner){
  if(unlistenPairs){unlistenPairs();unlistenPairs=null;}
  if(!key)return;
  unlistenPairs=onSnapshot(pairCollection(owner),snapshot=>{
    if(!user||user.uid!==owner||!key)return;
    const all=snapshot.docs.map(d=>({id:d.id,ref:d.ref,...d.data()}));
    pendingPairRequests=all
      .filter(r=>r.status==='pending'&&r.createdAt?.toMillis&&Date.now()-r.createdAt.toMillis()<PAIR_LIFETIME_MS)
      .sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
    // Best-effort clean-up, never shorten a new device's 10-minute approval window.
    for(const item of all){
      if(item.createdAt?.toMillis &&
         ((Date.now()-item.createdAt.toMillis()>PAIR_LIFETIME_MS+5*60*1000)||item.status==='complete')){
        void deleteDoc(item.ref).catch(()=>{});
      }
    }
    showPairHost();
  },err=>{$('cloudPairHostHelp').textContent='Cannot list pending devices: '+err.message;});
}
async function startJoin(){
  if(!user||key||pairJoin)return;
  const owner=user.uid;
  const remote=cloudData(await getDocFromServer(ref()));
  if(!remote){ui('No encrypted vault exists yet. Set it up on your first device.',true);return;}
  const ephemeral=await newEphemeral();
  const id=freshId();
  const label=(navigator.userAgent.includes('iPad')?'iPad':navigator.userAgent.includes('Mac')?'Mac':'Browser')+' • New device';
  pairJoin={id,owner,ephemeral,secrets:null,confirmed:false,complete:false,hostPublicKey:null};
  pairReadyView();
  try{
    await setDoc(requestRef(owner,id),{
      schema:1,status:'pending',requestPublicKey:ephemeral.publicKey,
      requester:label.slice(0,64),createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    if(!user||user.uid!==owner)return;
    unlistenJoin=onSnapshot(requestRef(owner,id),snap=>{
      if(!user||user.uid!==owner||!pairJoin||pairJoin.id!==id)return;
      if(!snap.exists()){ui('Pairing request was cancelled or expired.',true);void cancelJoin(false);return;}
      void incomingPairUpdate(snap.data()).catch(e=>{ui('Pairing failed: '+e.message,true);void cancelJoin(false);});
    },err=>ui('Pairing listener failed: '+err.message,true));
  }catch(err){pairJoin=null;pairReadyView();throw err;}
}
async function incomingPairUpdate(request){
  const session=pairJoin;if(!session||session.complete)return;
  if(request.createdAt?.toMillis && Date.now()-request.createdAt.toMillis()>PAIR_LIFETIME_MS){ui('Pairing expired. Create a new request.',true);await cancelJoin(false);return;}
  if(request.requestPublicKey!==session.ephemeral.publicKey)throw Error('Pairing request changed unexpectedly.');
  if(request.status==='challenge'||request.status==='ready'){
    if(!request.hostPublicKey)throw Error('Pairing host public key missing.');
    if(session.hostPublicKey&&request.hostPublicKey!==session.hostPublicKey)throw Error('Existing device key changed during pairing.');
    if(!session.secrets){
      session.hostPublicKey=request.hostPublicKey;
      session.secrets=await pairingSecrets(session.ephemeral.privateKey,session.ephemeral.publicKey,
        request.hostPublicKey,session.owner,session.id,session.ephemeral.publicKey,request.hostPublicKey);
      pairReadyView();
    }
    if(request.status==='ready'&&session.confirmed&&!session.complete){
      session.complete=true;
      const imported=await unwrapVaultKey(request.envelope,session.secrets);
      // Verify the received key can decrypt the authentic vault BEFORE installing it locally.
      const remote=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',session.owner)));
      if(!remote)throw Error('Encrypted vault vanished during pairing.');
      await decryptVault(imported,remote,session.owner);
      await storeDeviceKey(session.owner,imported);
      key=imported;lastServer=remote;
      await updateDoc(requestRef(session.owner,session.id),{status:'complete',updatedAt:serverTimestamp()});
      if(unlistenJoin){unlistenJoin();unlistenJoin=null;}
      pairJoin=null;watchPairRequests(session.owner);
      // Pairing approval authorizes this device. Restore the newest encrypted version immediately.
      // Never silently discard existing local content: download a backup before replacement.
      const latest=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',session.owner)));
      if(!latest)throw Error('Encrypted vault vanished before automatic restore.');
      lastServer=latest;
      state={enabled:true,rev:latest.revision,dirty:false};bindAccount();
      await applyRemote(latest,true);
      active=true;conflict=false;listen();showActive();
      ui('Device authorized. Latest encrypted classroom data restored automatically. Future Google sign-ins load the newest cloud version.');
    }
  }
}
async function confirmJoin(){
  if(!pairJoin?.secrets||pairJoin.confirmed)return;
  if(!confirm('Do BOTH screens show the identical 8-digit verification number? Only continue when you can compare the number on your own existing device.'))return;
  pairJoin.confirmed=true;
  $('cloudPairConfirmBtn').hidden=true;
  $('cloudPairStatus').textContent='Verified on this device. Waiting for the existing device to approve key transfer…';
  const snap=await getDocFromServer(requestRef(pairJoin.owner,pairJoin.id));
  if(snap.exists())await incomingPairUpdate(snap.data());
}
async function cancelJoin(remove=true){
  const session=pairJoin;
  if(unlistenJoin){unlistenJoin();unlistenJoin=null;}
  pairJoin=null;
  if(remove&&session){try{await deleteDoc(requestRef(session.owner,session.id));}catch(_){}}
  if(user&&!key)pairReadyView();
}
async function reviewJoin(){
  if(!user||!key||pairHost)return;
  const req=pendingPairRequests[0];if(!req)return;
  const owner=user.uid;
  const snap=await getDocFromServer(requestRef(owner,req.id));
  if(!snap.exists()||snap.data().status!=='pending')throw Error('Request is no longer pending.');
  const request=snap.data();
  if(!request.createdAt?.toMillis||Date.now()-request.createdAt.toMillis()>PAIR_LIFETIME_MS)throw Error('Pairing request expired.');
  const ephemeral=await newEphemeral();
  const secrets=await pairingSecrets(ephemeral.privateKey,ephemeral.publicKey,
    request.requestPublicKey,owner,req.id,request.requestPublicKey,ephemeral.publicKey);
  pairHost={id:req.id,owner,requesterPublicKey:request.requestPublicKey,ephemeral,secrets};
  // A new device sees this public key and independently computes its verification number.
  await updateDoc(requestRef(owner,req.id),{status:'challenge',hostPublicKey:ephemeral.publicKey,updatedAt:serverTimestamp()});
  showPairHost();
}
async function approveHost(){
  if(!user||!key||!pairHost)return;
  if(!confirm('Confirm the same 8-digit number is visible on BOTH of your devices. Share this classroom encryption key with the requesting device?'))return;
  const session=pairHost;
  const snap=await getDocFromServer(requestRef(session.owner,session.id));
  if(!snap.exists()||snap.data().status!=='challenge'||
     snap.data().hostPublicKey!==session.ephemeral.publicKey||
     snap.data().requestPublicKey!==session.requesterPublicKey)throw Error('The pairing session changed. Start a new request.');
  const envelope=await wrapVaultKey(key,session.secrets);
  await updateDoc(requestRef(session.owner,session.id),{status:'ready',envelope,updatedAt:serverTimestamp()});
  pairHost=null;showPairHost();
  ui('Encrypted device key shared. Complete verification on the new device.');
}
async function rejectHost(){
  const session=pairHost;if(!session)return;
  pairHost=null;showPairHost();
  await deleteDoc(requestRef(session.owner,session.id));
}
function pauseForLocalErase(){
  safelyStop();
  if(user){state.enabled=false;state.dirty=false;persist();}
  title('Local classroom data cleared; encrypted sync disabled');
  ui('Encrypted cloud copy remains. You can restore it with this device’s existing key.');view('none');
}
async function disconnect(){
  ++epoch;safelyStop();stopPairing();key=null;
  if(auth)await signOut(auth);
  user=null;view('none');title('Encrypted sync is off');ui('Google disconnected. Local class data and the device key remain on this browser.');
}
async function deleteCloud(){
  if(!user)return;
  if(!confirm('Permanently delete your encrypted cloud classroom backup? Local class data will remain. Other devices may still contain copies.'))return;
  if(!confirm('Final confirmation: DELETE the cloud classroom vault and pending device requests?'))return;
  const owner=user.uid;safelyStop();stopPairing();
  try{
    const requests=await getDocs(pairCollection(owner));
    await Promise.all(requests.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(firestore,'teacherCloud',owner));
    state={enabled:false,rev:0,dirty:false};persist();
    await forgetDeviceKey(owner);key=null;lastServer=null;
    title('Encrypted cloud backup deleted');
    ui('Cloud vault and this device’s key were deleted. Local classes remain. Other devices may retain their old key until cleared.');view('setup');
  }catch(err){title('Cloud deletion incomplete');ui('Check cloud deletion manually: '+err.message,true);}
}
function stopSync(){
  if(!confirm('Turn off encrypted syncing on this device? Local data and cloud vault remain.'))return;
  safelyStop();state.enabled=false;persist();
  title('Encrypted sync paused');ui('This device saves locally. Its encryption key remains available for future restores and pairing.');view('setup');
}
async function manuallySync(){
  if(!active||!user||!key)return;
  try{
    const remote=cloudData(await getDocFromServer(ref()));lastServer=remote;
    if((remote?.revision||0)>state.rev){
      if(state.dirty)markConflict('Other device saved a newer encrypted revision.');
      else await received(remote);
    }
    if(active&&state.dirty)await push();
    if(active&&!state.dirty)showActive();
  }catch(err){ui('Encrypted sync failed: '+err.message,true);}
}

window.BGRSync={configured,get signedIn(){return !!user;},
  signInWithGoogle:async ()=>{
    if(!configured)throw Error('Firebase is not configured.');
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    const result=await signInWithPopup(auth,provider);
    return result.user.email;
  },disconnect,pauseForLocalErase};
$('cloudUseThisBtn').addEventListener('click',()=>void beginFromLocal().catch(e=>ui(e.message,true)));
$('cloudUseRemoteBtn').addEventListener('click',()=>void beginFromCloud().catch(e=>ui(e.message,true)));
$('cloudConflictRemoteBtn').addEventListener('click',()=>void resolveKeepCloud().catch(e=>ui(e.message,true)));
$('cloudConflictLocalBtn').addEventListener('click',()=>void resolveKeepLocal().catch(e=>ui(e.message,true)));
$('cloudSyncNowBtn').addEventListener('click',()=>void automaticCheck());
$('cloudStopBtn').addEventListener('click',stopSync);
$('cloudDeleteBtn').addEventListener('click',()=>void deleteCloud().catch(e=>ui(e.message,true)));
$('cloudPairRequestBtn').addEventListener('click',()=>void startJoin().catch(e=>ui('Pairing request failed: '+e.message,true)));
$('cloudPairConfirmBtn').addEventListener('click',()=>void confirmJoin().catch(e=>ui('Pairing failed: '+e.message,true)));
$('cloudPairCancelBtn').addEventListener('click',()=>void cancelJoin());
$('cloudPairReviewBtn').addEventListener('click',()=>void reviewJoin().catch(e=>ui('Could not review new device: '+e.message,true)));
$('cloudPairApproveBtn').addEventListener('click',()=>void approveHost().catch(e=>ui('Device approval failed: '+e.message,true)));
$('cloudPairRejectBtn').addEventListener('click',()=>void rejectHost().catch(e=>ui('Could not reject pairing: '+e.message,true)));
$('cloudFictionalConfirm')?.addEventListener('change',()=>{
  if(user)localStorage.setItem(FICTIONAL_ACK_PREFIX+user.uid,String($('cloudFictionalConfirm').checked));
  if(active&&state.dirty&&$('cloudFictionalConfirm').checked)schedulePush(200);
});
document.addEventListener('bgr:local-save',()=>{
  if(skipLocalSave||!user||!active||conflict)return;
  state.dirty=true;persist();schedulePush();
});
window.addEventListener('online',checkIfVisible);
window.addEventListener('focus',checkIfVisible);
document.addEventListener('visibilitychange',checkIfVisible);

if(configured&&bridge){
  try{
    if(!globalThis.isSecureContext||!crypto.subtle||!globalThis.indexedDB)throw Error('Encrypted sync requires HTTPS and browser IndexedDB.');
    const app=initializeApp(cfg);auth=getAuth(app);firestore=getFirestore(app);
    onAuthStateChanged(auth,next=>{
      const previous=user?.uid;user=next;
      if(previous!==next?.uid){
        ++epoch;safelyStop();stopPairing();key=null;
        if(next){
          restoreFictionalAcknowledgement();
          document.dispatchEvent(new CustomEvent('bgr:cloud-auth',{detail:{email:next.email,uid:next.uid}}));
          void loadAccount();
        }else{
          restoreFictionalAcknowledgement();
          title('Sign in with Google to unlock this device’s encrypted classrooms');
          ui('Your locally saved classes remain accessible.');view('none');
          document.dispatchEvent(new CustomEvent('bgr:cloud-auth',{detail:{email:null,uid:null}}));
        }
      }
    });
    title('Encrypted sync is ready');ui('Connect your Google account. Cloud uploads require your consent and a locally held encryption key.');
    document.dispatchEvent(new CustomEvent('bgr:cloud-ready'));
  }catch(err){title('Encrypted sync configuration error');ui(err.message,true);}
}else{
  title('Encrypted sync is not configured');
  ui('Add your Firebase web configuration to firebase-config.js. Until then, local classroom saving and manual backups still work.');
  view('none');
}
