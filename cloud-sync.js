// Balanced Group Randomizer: opt-in, end-to-end encrypted, Google-authenticated sync BETA.
// Google confirms identity; it is NEVER used as encryption key material.
// Device-held AES key encrypts all classroom payloads before Firestore receives them.
// New devices require explicit approval by an already-unlocked device.
// TEST WITH FICTIONAL CLASSROOM DATA ONLY. This is not production- or FERPA-approved.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getFirestore, doc, collection, getDocFromServer, getDocs, onSnapshot, runTransaction, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';
import {mergeThreeWay,mergeLegacyDomains} from './merge-core.js';
import {generateVaultKey,encryptVault,decryptVault,newEphemeral,pairingSecrets,wrapVaultKey,unwrapVaultKey,getDeviceKey,storeDeviceKey,forgetDeviceKey,freshId} from './e2ee-core.js';

const $=id=>document.getElementById(id);
const bridge=window.BGRSyncBridge;
const startupGate=window.BGRStartupGate;
function gateMessage(message,offline=false){startupGate?.show(message,offline);}
function gateRelease(){startupGate?.release();}
const cfg=window.BGR_FIREBASE_CONFIG||{};
const configured=Boolean(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId&&!cfg.apiKey.startsWith('PASTE_'));
const STATE_PREFIX='bgr.cloud.syncState.';
const BASE_PREFIX='bgr.cloud.verifiedBase.';
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
let active=false,busy=false,conflict=false,lastServer=null,merging=false;
let unlisten=null,unlistenPairs=null,unlistenJoin=null;
let debounce=null,retry=null,autoTimer=null,checking=false,receiving=false,skipLocalSave=false,epoch=0;
let pendingPairRequests=[],pairHost=null,pairJoin=null;
const ui=(message,error=false)=>{
  $('cloudModeHelp').textContent=message;
  $('cloudModeHelp').style.color=error?'#ad2638':'';
};
const title=text=>{$('cloudModeLabel').textContent=text;};
function syncNotice(kind,message){
  document.dispatchEvent(new CustomEvent('bgr:sync-status', {detail:{kind,message}}));
}

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
  if(mode==='conflict')$('bgrMergeHint').textContent=readVerifiedBase()?'This device has a verified merge baseline. Try the safe three-way merge.':'This older sync revision has no shared baseline. To combine only rankings and seating, choose the source for each below.';
  $('cloudPairActions').hidden=mode!=='pair';
  $('cloudDeleteBtn').hidden=!user;
  if(mode==='setup'){
    $('cloudUseRemoteBtn').hidden=!lastServer;
    const bound=localStorage.getItem(BOUND_KEY);
    $('cloudUseThisBtn').hidden=!!(bound&&bound!==user?.uid);
    $('cloudUseThisBtn').textContent=lastServer?'Replace encrypted cloud with this device':'Enable encrypted sync with this device';
  }
  if(mode==='pair'||mode==='conflict'||(mode==='setup'&&user)) {
    document.dispatchEvent(new CustomEvent('bgr:cloud-attention',{detail:{kind:mode}}));
  } else if(mode==='active') {
    document.dispatchEvent(new CustomEvent('bgr:cloud-attention',{detail:{kind:'active'}}));
  }
}
function showPairHost(){
  const panel=$('cloudPairHostPanel');
  if(!user||!key||(!pairHost&&!pendingPairRequests.length)){panel.hidden=true;return;}
  panel.hidden=false;
  document.dispatchEvent(new CustomEvent('bgr:cloud-attention',{detail:{kind:'pair-request'}}));
  const latest=pendingPairRequests[0];
  $('cloudPairReviewBtn').hidden=!!pairHost||!latest;
  $('cloudPairApproveBtn').hidden=!pairHost;
  $('cloudPairRejectBtn').hidden=!pairHost;
  $('cloudPairHostCode').textContent=pairHost?pairHost.secrets.code:'—';
  $('cloudPairHostHelp').textContent=pairHost
    ?'Compare this 8-digit number with the new device. Only approve if BOTH screens match and you initiated the pairing.'
    :`New device asking for access: ${latest?.requester||'Unidentified device'}. Verify it belongs to you before proceeding.`;
}
// Content comparisons exclude the local-only selected-class preference.
function contentSignature(snapshot){
  const copy={...snapshot};
  delete copy.activeId;
  return JSON.stringify(copy);
}
async function fingerprintFor(snapshot, includeSelection=false){
  const stable={...snapshot};
  if(!includeSelection)delete stable.activeId;
  const bytes=new TextEncoder().encode(JSON.stringify(stable));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function localFingerprint(){return fingerprintFor(bridge.read());}
async function migrateLegacyFingerprint(){
  if(!state.fingerprint||state.fingerprintFormat==='content-v2')return;
  const snapshot=bridge.read();
  // v42 hashed activeId. Check every existing class as the previous selection;
  // if one matches exactly, only navigation changed and there are no unsynced edits.
  const selections=[snapshot.activeId,null,...snapshot.classes.map(c=>c.id)];
  for(const selected of new Set(selections)){
    if(await fingerprintFor({...snapshot,activeId:selected},true)===state.fingerprint){
      state.fingerprint=await fingerprintFor(snapshot);
      state.fingerprintFormat='content-v2';
      state.dirty=false;
      persist();
      return;
    }
  }
  // Unknown differences must continue to be treated as unsynced edits.
}
function readVerifiedBase(){
  if(!user)return null;
  try {const v=JSON.parse(localStorage.getItem(BASE_PREFIX+user.uid)||'null');
    return v && v.rev===state.rev && Array.isArray(v.snapshot?.classes)?v.snapshot:null;
  }catch(_){return null;}
}
function saveVerifiedBase(snapshot,revision){
  if(!user)return;
  try {localStorage.setItem(BASE_PREFIX+user.uid,JSON.stringify({rev:revision,snapshot}));}
  catch(err){console.warn('Verified merge baseline could not be stored; future conflicts require manual resolution.',err);}
}
// Encrypted, device-local rollback journal. No downloads or teacher decisions occur
// for routine non-overlapping merges. Keep a few encrypted pre-merge snapshots.
const MERGE_JOURNAL_DB='bgr-v48-merge-recovery';
let mergeJournalOpen=null;
function recoveryDatabase(){
  if(!mergeJournalOpen){
    mergeJournalOpen=new Promise((resolve,reject)=>{
      const req=indexedDB.open(MERGE_JOURNAL_DB,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('snapshots'))
          req.result.createObjectStore('snapshots',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Cannot create encrypted merge recovery storage.'));
      req.onblocked=()=>reject(Error('Encrypted merge recovery storage is blocked.'));
    }).catch(error=>{mergeJournalOpen=null;throw error;});
  }
  return mergeJournalOpen;
}
async function storeMergeRecovery(owner,baseRevision,remoteRevision,localSnapshot,cloudSnapshot){
  // Encryption uses the same device-held classroom key and authenticated UID.
  // If storage fails, refuse the automatic cloud write rather than losing a copy.
  const local={...await encryptVault(key,localSnapshot,owner,baseRevision),revision:baseRevision};
  const cloud={...await encryptVault(key,cloudSnapshot,owner,remoteRevision),revision:remoteRevision};
  const database=await recoveryDatabase();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('snapshots','readwrite');
    const store=tx.objectStore('snapshots');
    const record={id:owner+':'+Date.now()+':'+freshId(),owner,at:Date.now(),local,cloud};
    const get=store.getAll();
    get.onsuccess=()=>{
      const existing=(get.result||[]).filter(item=>item.owner===owner)
        .sort((a,b)=>b.at-a.at);
      store.put(record);
      // Limit storage growth to this teacher's five newest recovery entries.
      for(const old of existing.slice(4))store.delete(old.id);
    };
    tx.oncomplete=()=>resolve(record.id);
    tx.onerror=()=>reject(tx.error||Error('Cannot save encrypted recovery copy.'));
    tx.onabort=()=>reject(tx.error||Error('Encrypted recovery storage was cancelled.'));
  });
}
async function downloadLatestMergeRecovery(){
  if(!user||!key)return;
  const owner=user.uid,db=await recoveryDatabase();
  const rows=await new Promise((resolve,reject)=>{
    const tx=db.transaction('snapshots','readonly');
    const request=tx.objectStore('snapshots').getAll();
    request.onsuccess=()=>resolve(request.result||[]);
    request.onerror=()=>reject(request.error||Error('Cannot read encrypted recovery history.'));
  });
  const latest=rows.filter(x=>x.owner===owner).sort((a,b)=>b.at-a.at)[0];
  if(!latest){ui('No automatic merge recovery copy exists on this device yet.');return;}
  const local=await decryptVault(key,latest.local,owner);
  const cloud=await decryptVault(key,latest.cloud,owner);
  downloadMergeSafety(local,cloud);
  ui('Encrypted recovery copies were decrypted into the JSON file you requested. Store this file securely.');
}
function downloadMergeSafety(localCopy,cloudCopy){
  const payload={format:'BGR V48 pre-merge safety archive',savedAt:new Date().toISOString(),
    note:'Contains UNENCRYPTED fictional classroom data; store securely. Extract local/cloud under copies.',
    local:localCopy,cloud:cloudCopy};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;
  a.download='bgr-before-merge-both-versions-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function mergeAndPublish(legacy=false){
  if(merging||busy||!user||!key)return;
  merging=true;
  const owner=user.uid,guardEpoch=epoch;
  try {
    const local=bridge.read(),rev=state.rev;
    const remoteDoc=cloudData(await getDocFromServer(ref()));
    if(!remoteDoc)throw Error('Cloud vault is unavailable. No changes were made.');
    const cloud=await parseRemote(remoteDoc);
    if(!user||user.uid!==owner||epoch!==guardEpoch)throw Error('Google account changed.');
    let merged;
    if(legacy){
      const tier=$('bgrMergeTierSource').value;
      const seating=$('bgrMergeSeatingSource').value;
      merged=mergeLegacyDomains(local,cloud,tier,seating);
    }else{
      const base=readVerifiedBase();
      if(!base)throw Error('This device has no verified common ancestor for this revision. Use the guided merge if only rankings and seating differ.');
      const attempt=mergeThreeWay(base,local,cloud);
      if(attempt.conflicts.length)throw Error('Both devices changed the same setting: '+attempt.conflicts.slice(0,5).join('; ')+'. Choose versions manually.');
      merged=attempt.merged;
    }
    if(bridge.validate)merged=bridge.validate(merged);
    if(!canUploadTestDataset(merged))throw Error('Fictional-data upload restriction is active.');
    if(!confirm('Confirm the selected sources carefully: '+(legacy?'rankings from '+$('bgrMergeTierSource').selectedOptions[0].text+', seating from '+$('bgrMergeSeatingSource').selectedOptions[0].text+'. ':'non-overlapping edits from both versions. ')+'The app will request a JSON safety download containing BOTH originals before uploading. Browsers may block downloads: keep your separately exported backups. Proceed?'))return;
    if(contentSignature(bridge.read())!==contentSignature(local))throw Error('Local changes occurred during merge review. Retry.');
    // Require a working safety download before the cloud write. Browsers can still
    // restrict multiple downloads; this is a single archive.
    downloadMergeSafety(local,cloud);
    const encrypted=await encryptVault(key,merged,owner,remoteDoc.revision+1);
    await runTransaction(firestore,async tx=>{
      const snapshot=await tx.get(ref());
      if(!snapshot.exists()||snapshot.data().revision!==remoteDoc.revision)throw Error('REVISION_CONFLICT');
      tx.set(ref(),{schema:encrypted.schema,iv:encrypted.iv,ciphertext:encrypted.ciphertext,
        revision:remoteDoc.revision+1,writer:tabId,updatedAt:serverTimestamp()});
    });
    // An edit during the cloud transaction must not be overwritten locally.
    if(!user||user.uid!==owner||epoch!==guardEpoch)return;
    if(contentSignature(bridge.read())!==contentSignature(local)){
      state.rev=remoteDoc.revision+1;state.dirty=true;persist();
      markConflict('Combined cloud version saved, but this device changed again during upload. Local edits were preserved.');return;
    }
    skipLocalSave=true;
    try {bridge.apply(merged);}finally{skipLocalSave=false;}
    state.rev=remoteDoc.revision+1;state.enabled=true;state.dirty=false;
    state.fingerprint=await localFingerprint();state.fingerprintFormat='content-v2';
    saveVerifiedBase(merged,state.rev);bindAccount();rememberVerifiedTransfer('upload');persist();
    conflict=false;active=true;lastServer=null;listen();showActive();
    ui('Both changes were combined, encrypted, and saved to the cloud. Other devices can now retrieve the merged version.');
  }catch(err){
    if(!conflict)markConflict('Merge could not safely complete. Both local and cloud versions are preserved.');
    if(err.message==='REVISION_CONFLICT')ui('Another device saved during the merge. No merge was applied; retry against the latest cloud copy.',true);
    else ui('Merge was not applied: '+(err.message||err),true);
  }finally{merging=false;}
}
// V48 automatic reconciliation: client-side three-way merge over the existing
// E2EE vault format. The cloud never sees plaintext and Firestore rules stay
// compatible. If there is no verified base, or edits overlap, stop for review.
async function reconcileAutomatically(remote){
  if(!active||!user||!key||busy||merging||conflict||!remote)return false;
  const owner=user.uid,guardEpoch=epoch,startingRevision=state.rev;
  if(remote.revision<=startingRevision)return false;
  const base=readVerifiedBase();
  if(!base){markConflict('Both devices have saved changes, but this device has no verified shared starting version. To protect both copies, a one-time review is required.');return false;}
  merging=true;
  syncNotice('pending','Combining compatible changes securely…');
  try{
    let latest=remote;
    for(let attempt=0;attempt<3;attempt++){
      if(!active||!user||user.uid!==owner||epoch!==guardEpoch||state.rev!==startingRevision)
        throw Error('SYNC_CONTEXT_CHANGED');
      const local=bridge.read(),localSignature=contentSignature(local);
      const cloud=await parseRemote(latest);
      if(!active||!user||user.uid!==owner||epoch!==guardEpoch||state.rev!==startingRevision)
        throw Error('SYNC_CONTEXT_CHANGED');
      const candidate=mergeThreeWay(base,local,cloud);
      if(candidate.conflicts.length){
        markConflict('The same setting changed on both devices ('+candidate.conflicts.slice(0,3).join(', ')+'). Both versions are preserved. Review only this conflict.');
        return false;
      }
      if(contentSignature(bridge.read())!==localSignature){
        // Do not spin indefinitely while a teacher is editing rapidly.
        scheduleCloudRefresh(600);return false;
      }
      const merged=bridge.validate?bridge.validate(candidate.merged):candidate.merged;
      if(!canUploadTestDataset(merged)){
        markConflict('Enable fictional-data testing before publishing a combined test classroom. No cloud changes were made.');return false;
      }
      // Local edits may have been reverted: in that case the latest cloud copy
      // already contains the entire merge, so no new cloud revision is needed.
      if(contentSignature(merged)===contentSignature(cloud)){
        if(contentSignature(bridge.read())!==localSignature){scheduleCloudRefresh(600);return false;}
        // applyRemote refuses to overwrite dirty data; here we've established
        // that every local change is already represented by the merged cloud.
        if(!active||!user||user.uid!==owner||epoch!==guardEpoch||state.rev!==startingRevision)throw Error('SYNC_CONTEXT_CHANGED');
        skipLocalSave=true;
        try {bridge.apply(merged);} finally {skipLocalSave=false;}
        state.rev=latest.revision;state.dirty=false;
        state.fingerprint=await localFingerprint();state.fingerprintFormat='content-v2';
        if(contentSignature(bridge.read())!==contentSignature(merged))state.dirty=true;
        saveVerifiedBase(cloud,latest.revision);rememberVerifiedTransfer('download');persist();
        showActive();if(state.dirty)schedulePush(350);return true;
      }
      // Preserve both originals without triggering an iPad JSON download.
      // The journal is encrypted, bounded, and accessible only to an
      // already-authorized device holding this teacher's key.
      if(contentSignature(bridge.read())!==localSignature){scheduleCloudRefresh(600);return false;}
      await storeMergeRecovery(owner,startingRevision,latest.revision,local,cloud);
      if(contentSignature(bridge.read())!==localSignature){scheduleCloudRefresh(600);return false;}
      const newRevision=latest.revision+1;
      const encrypted=await encryptVault(key,merged,owner,newRevision);
      if(contentSignature(bridge.read())!==localSignature){scheduleCloudRefresh(600);return false;}
      try{
        await runTransaction(firestore,async tx=>{
          const snapshot=await tx.get(doc(firestore,'teacherCloud',owner));
          if(!snapshot.exists()||snapshot.data().schema!=='bgr-e2ee-v1'||snapshot.data().revision!==latest.revision)
            throw Error('REVISION_CONFLICT');
          tx.set(doc(firestore,'teacherCloud',owner),{
            schema:encrypted.schema,iv:encrypted.iv,ciphertext:encrypted.ciphertext,
            revision:newRevision,writer:tabId,updatedAt:serverTimestamp()
          });
        });
      }catch(err){
        if(err.message==='REVISION_CONFLICT'){
          const next=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',owner)));
          if(!next||next.revision<=latest.revision)throw Error('Cloud was reset during automatic reconciliation.');
          latest=next;lastServer=next;continue;
        }
        throw err;
      }
      if(!user||user.uid!==owner||epoch!==guardEpoch)return true;
      // The cloud now has the merged version. Edits made while the transaction
      // was running must be rebased onto that version, never overwritten.
      const newestLocal=bridge.read();
      const extra=mergeThreeWay(local,newestLocal,merged);
      state.rev=newRevision;
      saveVerifiedBase(merged,newRevision);
      if(extra.conflicts.length){
        state.dirty=true;persist();
        markConflict('Both copies were merged in the cloud, but a new local edit overlaps that merge. Local changes remain intact for review.');
        return true;
      }
      skipLocalSave=true;
      try {bridge.apply(extra.merged);}
      catch(err){
        state.dirty=true;persist();
        markConflict('The combined cloud data was saved, but the local screen could not be updated. Both versions are retained. '+err.message);
        return true;
      } finally {skipLocalSave=false;}
      const expectedSignature=contentSignature(extra.merged);
      const installedSignature=contentSignature(bridge.read());
      state.dirty=installedSignature!==contentSignature(merged);
      state.fingerprintFormat='content-v2';
      // Do not mark this state clean if rendering or another edit changed it.
      const fingerprint=await localFingerprint();
      if(contentSignature(bridge.read())!==installedSignature)state.dirty=true;
      if(!state.dirty)state.fingerprint=fingerprint;
      rememberVerifiedTransfer('upload');persist();
      showActive();
      if(state.dirty)schedulePush(350);
      return true;
    }
    // Revisions changing faster than we can commit must be retried after a
    // short delay; never attempt a blind last-write-wins overwrite.
    syncNotice('pending','Other devices are still saving; retrying the encrypted merge.');
    scheduleCloudRefresh(800);
    return false;
  }catch(err){
    if(user?.uid!==owner||epoch!==guardEpoch)return false;
    if(err.message==='SYNC_CONTEXT_CHANGED')return false;
    if(err.message==='REVISION_CONFLICT'){
      scheduleCloudRefresh(800);return false;
    }
    // Transient network failure should not create a permanent data conflict.
    // A journal failure is different: no automatic write should proceed.
    if(/recovery|storage|IndexedDB/i.test(err.message||'')){
      markConflict('Unable to save encrypted rollback copies on this device. Automatic merge was stopped to protect both versions. '+err.message);
    }else{
      syncNotice('pending','Encrypted merge has not completed. Local changes are safe; retrying when connected.');
      ui('Automatic merge temporarily unavailable: '+(err.message||String(err)),true);
      scheduleCloudRefresh(3000);
    }
    return false;
  }finally{
    merging=false;
  }
}
let cloudRefreshTimer=null;
function scheduleCloudRefresh(delay=400){
  if(!active||conflict||!user)return;
  clearTimeout(cloudRefreshTimer);
  cloudRefreshTimer=setTimeout(()=>{
    cloudRefreshTimer=null;
    if(active&&!busy&&!receiving&&!merging)void automaticCheck();
    else if(active&&!conflict)scheduleCloudRefresh(900);
  },delay);
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
function renderVerifiedTransfer(){
  const target=$('cloudLastSuccess');
  if(!target)return;
  if(!user){target.textContent='Sign in to see the last verified encrypted cloud transfer for this device.';return;}
  const when=Number(state.lastVerifiedTransferAt||0);
  if(!when){target.textContent='No verified encrypted cloud transfer on this device yet.';return;}
  const operation=state.lastVerifiedTransferKind==='upload'?'uploaded to':'restored from';
  target.textContent=`Last verified encrypted transfer: ${operation} cloud on ${new Date(when).toLocaleString()}. This timestamp records an actual completed transfer, not merely a local save.`;
}
function rememberVerifiedTransfer(kind){
  state.lastVerifiedTransferAt=Date.now();
  state.lastVerifiedTransferKind=kind;
  persist();
  renderVerifiedTransfer();
}
function persist(){if(user)localStorage.setItem(metaKey(),JSON.stringify(state));}
function bindAccount(){localStorage.setItem(BOUND_KEY,user.uid);}
function safelyStop(){
  active=false;conflict=false;clearTimeout(debounce);clearTimeout(retry);clearTimeout(cloudRefreshTimer);stopAutoChecks();
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
// Treat a fresh browser's generated empty "My Class" as a placeholder, not
// a classroom backup worth downloading during normal cloud onboarding.
// Any substantive local classes, rules, seating, or custom roles must be
// preserved through the explicit backup-before-replace flow instead.
function hasMeaningfulLocalData(){
  const snapshot=bridge.read();
  const classes=Array.isArray(snapshot?.classes)?snapshot.classes:[];
  if(classes.length===0)return false;
  if(classes.length!==1)return true;
  const c=classes[0];
  if(c.name!=='My Class'||(c.students||[]).length)return true;
  if((c.avoidPairs||[]).length||(c.avoidGroups||[]).length||(c.togetherGroups||[]).length)return true;
  if((c.seating||[]).length||(c.groupHistory||[]).length)return true;
  if(c.groupingStrategy&&c.groupingStrategy!=='balanced')return true;
  if((snapshot.sharedRoles||[]).length && JSON.stringify(snapshot.sharedRoles)!==JSON.stringify(['Facilitator','Recorder','Reporter']))return true;
  // Template state and extra settings beyond defaults are not safely
  // distinguishable from real edits, so conservatively preserve them.
  if((c.seatingTemplates||[]).length||(c.templates||[]).length)return true;
  if((snapshot.sharedSeating||[]).length)return true;
  if((snapshot.seatingTemplates||[]).some(t=>t.name!=='Default Layout'||(t.layout||[]).length))return true;
  if((snapshot.seatingTemplates||[]).length>1)return true;
  if(Object.values(c.seatingAssignmentsByTemplate||{}).some(assignments=>
      Object.values(assignments||{}).some(seats=>Array.isArray(seats)&&seats.length)))return true;
  return false;
}
async function applyRemote(remote,backup=true,guard=null){
  if(!remote||!Number.isSafeInteger(remote.revision))throw Error('Invalid cloud revision.');
  if(guard&&remote.revision<guard.rev)throw Error('Cloud revision moved backwards; local data was preserved.');
  const parsed=await parseRemote(remote);
  // Another local edit may happen while decryption is running. Never lose it.
  if(guard&&(!active||!user||user.uid!==guard.owner||epoch!==guard.epoch||
     state.dirty||state.rev!==guard.rev||(await localFingerprint())!==guard.fingerprint)){
    throw Error('Local classroom data changed while downloading cloud updates.');
  }
  if(backup)bridge.backup('bgr-local-before-encrypted-cloud-restore');
  skipLocalSave=true;
  try {bridge.apply(parsed);}finally{skipLocalSave=false;}
  state.rev=remote.revision;state.dirty=false;state.fingerprint=await localFingerprint();state.fingerprintFormat='content-v2';
  saveVerifiedBase(parsed,remote.revision);
  rememberVerifiedTransfer('download');persist();
}
function markConflict(message){
  if(!startupGate?.bound||startupGate.bound===user?.uid)gateRelease();
  conflict=true;active=false;clearTimeout(debounce);stopAutoChecks();
  $('googleSyncStatus').textContent='Encrypted sync paused: resolve the conflict.';
  syncNotice('conflict',message||'Two devices changed the same setting. Review required; both versions retained.');
  title('Two devices changed classrooms');
  ui(message||'Choose which copy to keep; nothing has been overwritten.',true);
  view('conflict');
}
function showActive(){
  if(!startupGate?.bound||startupGate.bound===user?.uid)gateRelease();
  renderVerifiedTransfer();
  syncNotice(state.dirty?'pending':'clean',state.dirty?'Changes saved locally; encrypted upload pending.':'All changes saved to the encrypted cloud.');
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
  if(!active||!user||!key||conflict||busy||receiving||merging||!state.dirty)return;
  if(!navigator.onLine){title('Offline — saved locally');ui('The app will retry encrypted upload when the network returns.');syncNotice('offline','Offline: classroom changes saved only on this device. They are not yet in the cloud.');return;}
  const owner=user.uid,guardEpoch=epoch;
  const classroom=bridge.read();
  if(!canUploadTestDataset(classroom)){
    title('Testing safeguard — fictional students only');
    ui('This unapproved beta will not upload real or unmarked student names, even though payloads are encrypted. Use the fictional-data testing checkbox to confirm that all records are invented, or prefix every name with Fictional, Imaginary, Demo, or Test.',true);
    active=false;state.dirty=true;persist();view('none');return;
  }
  const before=contentSignature(classroom),expected=state.rev;
  busy=true;syncNotice('pending','Uploading encrypted classroom changes to the cloud…');title('Encrypting and uploading…');ui('Unencrypted classroom content never enters the Firestore write.');
  let succeeded=false,needsMerge=null;
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
    succeeded=true;state.rev=expected+1;state.dirty=contentSignature(bridge.read())!==before;
    saveVerifiedBase(classroom,expected+1);
    if(!state.dirty){state.fingerprint=await localFingerprint();state.fingerprintFormat='content-v2';}
    rememberVerifiedTransfer('upload');
    persist();showActive();
  }catch(err){
    if(!user||user.uid!==owner||guardEpoch!==epoch)return;
    state.dirty=true;persist();
    if(err.message==='REVISION_CONFLICT'){
      try {
        lastServer=cloudData(await getDocFromServer(ref()));
        needsMerge=lastServer;
        syncNotice('pending','Another device saved first. Automatically checking whether both edits can be combined…');
      } catch(e){
        syncNotice('pending','Cannot check the latest cloud revision yet; local data is safe.');
        scheduleCloudRefresh(3000);
      }
    }else{
      syncNotice('pending','Cloud upload failed. Classes remain saved locally and will be retried.');
      title('Cloud unavailable — local classes saved');
      ui('Encrypted upload failed: '+(err.message||'Unknown error'),true);
      clearTimeout(retry);retry=setTimeout(()=>schedulePush(200),12000);
    }
  }finally{
    busy=false;
    if(needsMerge&&active&&!conflict)void received(needsMerge);
    else if(queuedRemote&&active&&!conflict){const latest=queuedRemote;queuedRemote=null;void received(latest);}
    if(succeeded&&active&&state.dirty&&!conflict)schedulePush(300);
  }
}
let queuedRemote=null;
async function received(remote){
  if(!active||!user||!key||!remote||remote.revision<=state.rev)return;
  if(receiving){
    if(!queuedRemote||remote.revision>queuedRemote.revision)queuedRemote=remote;
    return;
  }
  const owner=user.uid,guardEpoch=epoch;
  if(remote.writer===tabId&&busy)return;
  receiving=true;
  try{
    lastServer=remote;
    if(busy||merging){
      queuedRemote=remote;
      scheduleCloudRefresh(500);
      return;
    }
    const fingerprint=await localFingerprint();
    if(!state.dirty&&state.fingerprint&&fingerprint!==state.fingerprint){
      state.dirty=true;persist();
    }
    if(state.dirty){
      await reconcileAutomatically(remote);
      return;
    }
    const guard={owner,epoch:guardEpoch,rev:state.rev,fingerprint};
    await applyRemote(remote,false,guard);
    if(active&&user?.uid===owner&&epoch===guardEpoch)showActive();
  }catch(err){
    if(user?.uid===owner&&epoch===guardEpoch){
      if(/Local classroom data changed/.test(err.message||'')){
        state.dirty=true;persist();scheduleCloudRefresh(500);
      }else if(/network|unavailable|offline|timeout/i.test(err.message||'')){
        syncNotice('pending','Cloud temporarily unreachable; changes are safely stored locally.');
        scheduleCloudRefresh(3000);
      }else markConflict('Cannot safely synchronize the cloud revision: '+err.message);
    }
  }finally{
    receiving=false;
    if(queuedRemote&&active&&!conflict&&!busy&&!merging){
      const next=queuedRemote;queuedRemote=null;
      if(next.revision>state.rev)Promise.resolve().then(()=>received(next));
    }
  }
}
function listen(){
  if(unlisten)unlisten();
  const owner=user.uid;
  unlisten=onSnapshot(doc(firestore,'teacherCloud',owner),snap=>{
    if(!user||user.uid!==owner||!active)return;
    try{
      if(snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
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
      else syncNotice('clean','All changes saved to the encrypted cloud.');
    }
  }catch(err){
    if(active&&user?.uid===owner&&epoch===guardEpoch){
      ui('Automatic sync check could not reach the cloud. Your classes remain saved here; it will retry. '+err.message,true);
    }
  }finally{checking=false;}
}
function checkIfVisible(){
  if(conflict){syncNotice('conflict','Sync is paused because changes on two devices conflict. Review both backups before choosing a version.');return;}
  if(active&&document.visibilityState!=='hidden'){
    if(!navigator.onLine){
      if(state.dirty)syncNotice('offline','Offline: changes are stored on this device and have not been uploaded.');
      return;
    }
    if(state.dirty)syncNotice('pending','Connection restored. Checking the encrypted cloud revision before uploading local changes…');
    void automaticCheck();
  }
}

function pairReadyView(){
  if(!startupGate?.bound||startupGate.bound===user?.uid)gateRelease();
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
let verifyAttempt=0;
async function loadAccount(){
  if(!user)return;
  const attempt=++verifyAttempt;
  safelyStop();stopPairing();key=null;state=readState();renderVerifiedTransfer();
  const owner=user.uid,guardEpoch=epoch;
  if(startupGate?.bound===owner) startupGate.identityVerified=true;
  gateMessage('Google account recognized. Checking the encrypted cloud vault and device key…');
  title('Checking encrypted cloud vault…');ui('No classroom information will upload without explicit opt-in.');view('none');
  try{
    const loadedKey=await getDeviceKey(owner);
    const remote=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',owner)));
    if(!user||user.uid!==owner||guardEpoch!==epoch||attempt!==verifyAttempt)return;
    key=loadedKey;lastServer=remote;
    await migrateLegacyFingerprint();
    if(remote&&!key){pairReadyView();return;}
    if(remote&&key)await parseRemote(remote); // Fail closed if the local key is wrong.
    if(key)watchPairRequests(owner);
    const bound=localStorage.getItem(BOUND_KEY);
    if(bound&&bound!==owner){
      state.enabled=false;persist();title('Different Google account');
      ui('This browser belongs to a different teacher account. Export its data first or restore this Google account’s encrypted copy. Existing local data will not upload across accounts.',true);
      gateMessage('This browser contains a different teacher’s classroom cache. Sign in with its original Google account or export a local backup. Nothing will be uploaded.');
      view('setup');return;
    }
    if(state.enabled&&bound===owner&&key){
      active=true;
      // A teacher may have edited local classes while signed out. Never silently replace those edits.
      if(!state.dirty&&state.fingerprint&&state.fingerprint!==await localFingerprint()){
        state.dirty=true;persist();
      }
      if(state.dirty){
        if((remote?.revision||0)<state.rev){markConflict('The cloud revision is missing or older than this device. Local changes were preserved.');return;}
        showActive();listen();
        if((remote?.revision||0)>state.rev){
          // The verified ancestor is needed only for true offline divergence.
          // Non-overlapping edits are merged without a teacher-facing prompt.
          void received(remote);
        }else schedulePush(200);
        return;
      }
      if(remote){
        // Legacy sync state may lack a trusted content fingerprint. Compare the
        // decrypted cloud copy directly rather than silently replacing local data.
        if(!state.fingerprint){
          const remoteContent=contentSignature(await parseRemote(remote));
          if(remoteContent!==contentSignature(bridge.read())){
            state.dirty=true;persist();
            markConflict('This device has local classroom data without a verified sync fingerprint. Choose which copy to keep; neither was overwritten.');
            return;
          }
          state.fingerprint=await localFingerprint();state.fingerprintFormat='content-v2';persist();
        }
        // Reconnect to the latest cloud revision on every Google sign-in.
        // No downloadable plaintext backup is needed for a verified clean auto-refresh.
        const startupGuard={owner,epoch:guardEpoch,rev:state.rev,fingerprint:await localFingerprint()};
        await applyRemote(remote,false,startupGuard);
        showActive();listen();return;
      }
      if(state.rev>0){markConflict('Encrypted cloud copy has disappeared. Automatic upload is paused.');return;}
      state.dirty=true;persist();showActive();listen();schedulePush(300);return;
    }
    title(remote?'Encrypted cloud vault found':'Encrypted cloud sync is off');
    ui(remote?'This device has its classroom key. Choose whether to restore the encrypted cloud copy or replace it with this device.':'Click Enable to create this browser’s private classroom key and upload an encrypted copy of your fictional classes.');
    gateRelease();view('setup');
  }catch(err){
    if(!user||user.uid!==owner||guardEpoch!==epoch||attempt!==verifyAttempt)return;
    if((err.message||'').includes('Local classroom data changed while downloading')){
      state.dirty=true;persist();markConflict('Local edits occurred while cloud data was loading. Neither copy was overwritten.');return;
    }
    safelyStop();title('Cloud vault unavailable');ui(err.message||String(err),true);view('none');
    gateMessage('Google sign-in succeeded, but the cloud check failed: '+(err.code||err.message||String(err))+'. Your local classes were not overwritten. You can retry sign-in, or use the saved copy on this device with cloud sync paused.', startupGate?.bound===owner);
    if(startupGate?.bound===owner) $('bgrGateOffline').textContent='Open saved classes (sync paused)';
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
  const preserveLocal=hasMeaningfulLocalData();
  if(!confirm(preserveLocal
    ? 'Replace local classes on THIS device with your decrypted cloud version? Your local classes will be downloaded as a safety backup first.'
    : 'Restore your encrypted cloud classes to this device?'))return;
  lastServer=remote;state={enabled:true,rev:remote.revision,dirty:false};bindAccount();
  await applyRemote(remote,preserveLocal);persist();active=true;conflict=false;listen();showActive();
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
      // Pairing approval authorizes this device. A new/blank browser can load
      // cloud data silently, without triggering iPad Safari's "Download JSON".
      // If substantive local work exists, DO NOT overwrite it automatically:
      // require the teacher to choose a cloud restore with a safety backup.
      const latest=cloudData(await getDocFromServer(doc(firestore,'teacherCloud',session.owner)));
      if(!latest)throw Error('Encrypted vault vanished before automatic restore.');
      lastServer=latest;
      if(hasMeaningfulLocalData()){
        state={enabled:false,rev:0,dirty:false};persist();
        title('Device paired — local classes preserved');
        ui('This device already has local classroom data. Select the encrypted cloud copy to restore it; a safety backup will download only if you choose to replace the local data.');
        gateRelease();view('setup');return;
      }
      state={enabled:true,rev:latest.revision,dirty:false};bindAccount();
      await applyRemote(latest,false);
      active=true;conflict=false;listen();showActive();
      ui('Device authorized. Latest encrypted classroom data restored automatically without a JSON download. Future Google sign-ins load the newest cloud version.');
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
  user=null;if(startupGate?.bound)gateMessage('Sign in again using the original Google account to access this classroom cache.');view('none');title('Encrypted sync is off');ui('Google disconnected. Local class data and the device key remain on this browser.');
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
      await received(remote);
    }
    if(active&&state.dirty)await push();
    if(active&&!state.dirty)showActive();
  }catch(err){ui('Encrypted sync failed: '+err.message,true);}
}

window.BGRSync={configured,get signedIn(){return !!user;},get uid(){return user?.uid||null;},
  signInWithGoogle:async ()=>{
    if(!configured||!auth)throw Error('Firebase is not ready. Reload and try again.');
    const previousUid=user?.uid;
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    try {
      const result=await signInWithPopup(auth,provider);
      // Firebase onAuthStateChanged fires when the account CHANGES, not when an
      // already-signed-in teacher chooses that same account again. A prior
      // server failure could otherwise strand the startup gate indefinitely.
      // For an actual account switch the auth observer handles loadAccount().
      // The popup result is authoritative even when onAuthStateChanged does not
      // fire again (same UID) or is delayed. Do not rely solely on the observer.
      // Always complete a verification attempt when the startup gate is visible.
      if(user?.uid !== result.user.uid){
        user=result.user;
        ++epoch;
        safelyStop();stopPairing();key=null;
        restoreFictionalAcknowledgement();
        document.dispatchEvent(new CustomEvent('bgr:cloud-auth',
          {detail:{email:result.user.email,uid:result.user.uid}}));
      }
      if(startupGate?.bound){
        const expected=startupGate.bound;
        if(expected!==result.user.uid){
          gateMessage('Google signed in, but this is not the original account for this browser. Select the original Google account or export a backup.');
        } else if(!active && !conflict){
          await loadAccount();
        } else if(active || conflict){
          gateRelease();
        }
      }
      return result.user.email;
    } catch(err){
      if(startupGate?.bound){
        gateMessage('Google sign-in could not be completed: '+(err.message||String(err))+
          '. Retry with the original account. Your saved classes have not been erased.',!navigator.onLine);
      }
      throw err;
    }
  },disconnect,pauseForLocalErase};
$('cloudUseThisBtn').addEventListener('click',()=>void beginFromLocal().catch(e=>ui(e.message,true)));
$('cloudUseRemoteBtn').addEventListener('click',()=>void beginFromCloud().catch(e=>ui(e.message,true)));
$('bgrMergeBtn').addEventListener('click',()=>void mergeAndPublish(false));
$('bgrDownloadMergeRecovery').addEventListener('click',()=>void downloadLatestMergeRecovery().catch(e=>ui('Recovery export failed: '+e.message,true)));
$('bgrMergeLegacyBtn').addEventListener('click',()=>void mergeAndPublish(true));
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
  state.dirty=true;persist();
  syncNotice(navigator.onLine?'pending':'offline',navigator.onLine?'Saved locally; encrypted cloud upload pending.':'Offline: change saved on this device, not yet in cloud.');
  schedulePush();
});
window.addEventListener('online',checkIfVisible);
window.addEventListener('focus',checkIfVisible);
document.addEventListener('visibilitychange',checkIfVisible);

if(configured&&bridge){
  try{
    if(!globalThis.isSecureContext||!crypto.subtle||!globalThis.indexedDB)throw Error('Encrypted sync requires HTTPS and browser IndexedDB.');
    const app=initializeApp(cfg);auth=getAuth(app);firestore=getFirestore(app);
    onAuthStateChanged(auth,next=>{
      const previous=user?.uid;user=next;renderVerifiedTransfer();
      if(previous!==next?.uid){
        ++epoch;safelyStop();stopPairing();key=null;
        if(next){
          restoreFictionalAcknowledgement();
          document.dispatchEvent(new CustomEvent('bgr:cloud-auth',{detail:{email:next.email,uid:next.uid}}));
          void loadAccount();
        }else{
          restoreFictionalAcknowledgement();
          title('Sign in with Google to unlock this device’s encrypted classrooms');
          ui('Cloud-bound classroom data requires its original Google account.');view('none');
          if(startupGate?.bound)gateMessage('Connect the original Google account to unlock this browser’s classroom cache.',!navigator.onLine);
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
  if(startupGate?.bound)gateMessage('Cloud sign-in is unavailable because Firebase configuration is missing. Your local classroom data is preserved.');
  view('none');
}
