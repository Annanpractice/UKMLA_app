(function(){
  'use strict';

  const DB_NAME='ukmla-spranki-local-pack';
  const DB_VERSION=1;
  const STORE='records';
  const FILE_KEY='spranki-apkg-v1';
  const EXPECTED_BYTES=180422423;
  const EXPECTED_IMAGES=953;
  const ACCEPTED_NAME=/\.apkg$/i;
  const STATUS_EVENT='ukmlaSprankiPackChanged';
  const MAX_EOCD_SCAN=66000;

  let dbPromise=null;
  let statusCache={cached:false,checking:true,error:null,record:null};
  let statusPromise=null;
  let observer=null;
  let scheduled=false;

  function core(){return window.UKMLA_V2;}
  function escapeHtml(value){return core()?.escapeHtml?.(value)??String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function formatBytes(value){
    const bytes=Number(value)||0;
    if(bytes<1024)return`${bytes} B`;
    if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;
    return`${(bytes/1024/1024).toFixed(1)} MB`;
  }
  function normalise(value){return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function read16(view,offset){return view.getUint16(offset,true);}
  function read32(view,offset){return view.getUint32(offset,true);}
  function requestResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB request failed.'));});}
  function transactionDone(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error||new Error('IndexedDB transaction was aborted.'));transaction.onerror=()=>reject(transaction.error||new Error('IndexedDB transaction failed.'));});}

  function openDb(){
    if(dbPromise)return dbPromise;
    if(typeof indexedDB==='undefined')return Promise.reject(new Error('This browser does not provide IndexedDB storage.'));
    dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('The local image-pack database could not be opened.'));
      request.onblocked=()=>reject(new Error('Close another open copy of the app and try again.'));
    });
    return dbPromise;
  }

  async function getRecord(){
    const db=await openDb();
    const tx=db.transaction(STORE,'readonly');
    const done=transactionDone(tx);
    const value=await requestResult(tx.objectStore(STORE).get(FILE_KEY));
    await done;
    return value||null;
  }
  async function putRecord(value){
    const db=await openDb();
    const tx=db.transaction(STORE,'readwrite');
    const done=transactionDone(tx);
    tx.objectStore(STORE).put(value);
    await done;
    return true;
  }
  async function deleteRecord(){
    const db=await openDb();
    const tx=db.transaction(STORE,'readwrite');
    const done=transactionDone(tx);
    tx.objectStore(STORE).delete(FILE_KEY);
    await done;
    return true;
  }

  async function parseZipDirectory(file){
    if(!(file instanceof Blob))throw new Error('No APKG file was supplied.');
    if(file.size!==EXPECTED_BYTES)throw new Error(`This is not the expected Spranki deck. Expected ${formatBytes(EXPECTED_BYTES)}, received ${formatBytes(file.size)}.`);
    const head=new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(head[0]!==0x50||head[1]!==0x4b||head[2]!==0x03||head[3]!==0x04)throw new Error('The selected file is not a valid APKG/ZIP file.');

    const tailStart=Math.max(0,file.size-MAX_EOCD_SCAN);
    const tail=new Uint8Array(await file.slice(tailStart).arrayBuffer());
    let eocd=-1;
    for(let index=tail.length-22;index>=0;index--){
      if(tail[index]===0x50&&tail[index+1]===0x4b&&tail[index+2]===0x05&&tail[index+3]===0x06){eocd=index;break;}
    }
    if(eocd<0)throw new Error('The APKG central directory could not be located.');
    const tailView=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
    const entryCount=read16(tailView,eocd+10);
    const centralSize=read32(tailView,eocd+12);
    const centralOffset=read32(tailView,eocd+16);
    if(entryCount===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error('ZIP64 APKG files are not supported by this local reader.');

    const centralBytes=new Uint8Array(await file.slice(centralOffset,centralOffset+centralSize).arrayBuffer());
    const view=new DataView(centralBytes.buffer,centralBytes.byteOffset,centralBytes.byteLength);
    const decoder=new TextDecoder('utf-8');
    const entries=new Map();
    let offset=0;
    while(offset+46<=centralBytes.length&&entries.size<entryCount){
      if(read32(view,offset)!==0x02014b50)throw new Error('The APKG central directory is malformed.');
      const flags=read16(view,offset+8);
      const method=read16(view,offset+10);
      const crc32=read32(view,offset+16);
      const compressedBytes=read32(view,offset+20);
      const bytes=read32(view,offset+24);
      const nameLength=read16(view,offset+28);
      const extraLength=read16(view,offset+30);
      const commentLength=read16(view,offset+32);
      const localHeaderOffset=read32(view,offset+42);
      const nameBytes=centralBytes.slice(offset+46,offset+46+nameLength);
      const filename=decoder.decode(nameBytes);
      entries.set(filename,{filename,flags,method,crc32,compressedBytes,bytes,localHeaderOffset,nameLength,extraLength});
      offset+=46+nameLength+extraLength+commentLength;
    }
    if(!entries.has('media'))throw new Error('The APKG media map is missing.');

    async function dataOffset(entry){
      const header=new DataView(await file.slice(entry.localHeaderOffset,entry.localHeaderOffset+30).arrayBuffer());
      if(read32(header,0)!==0x04034b50)throw new Error(`Invalid local ZIP header for ${entry.filename}.`);
      return entry.localHeaderOffset+30+read16(header,26)+read16(header,28);
    }
    async function storedBlob(entry,type='application/octet-stream'){
      if(entry.method!==0)throw new Error(`${entry.filename} is compressed and cannot be read by the local stored-media reader.`);
      const start=await dataOffset(entry);
      return file.slice(start,start+entry.compressedBytes,type);
    }

    const mediaEntry=entries.get('media');
    const mediaText=await (await storedBlob(mediaEntry,'application/json')).text();
    let mediaMap;
    try{mediaMap=JSON.parse(mediaText);}catch(_){throw new Error('The APKG media map is not valid JSON.');}
    const rows=[];
    for(const [archiveKey,originalFilename] of Object.entries(mediaMap)){
      const entry=entries.get(String(archiveKey));
      if(!entry)continue;
      if(entry.method!==0)throw new Error(`Media entry ${archiveKey} is unexpectedly compressed.`);
      rows.push({
        archiveKey:String(archiveKey),
        filename:String(originalFilename),
        bytes:entry.bytes,
        compressedBytes:entry.compressedBytes,
        dataOffset:await dataOffset(entry),
        compressionMethod:entry.method,
        crc32:entry.crc32.toString(16).padStart(8,'0')
      });
    }
    rows.sort((a,b)=>Number(a.archiveKey)-Number(b.archiveKey));
    if(rows.length!==EXPECTED_IMAGES)throw new Error(`The selected APKG contains ${rows.length} media files; ${EXPECTED_IMAGES} were expected.`);
    return{
      schemaVersion:'spranki-local-locator-v1',
      sourceName:file.name||'Spranki Clinical.apkg',
      fileBytes:file.size,
      imageCount:rows.length,
      createdAt:new Date().toISOString(),
      images:rows
    };
  }

  function mimeFor(filename){
    const ext=String(filename||'').split('.').pop().toLowerCase();
    return({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff'})[ext]||'application/octet-stream';
  }

  async function cacheFile(file){
    if(!(file instanceof File))throw new Error('Select the original Spranki APKG file.');
    if(!ACCEPTED_NAME.test(file.name))throw new Error('Select an .apkg file.');
    const locator=await parseZipDirectory(file);
    try{await navigator.storage?.persist?.();}catch(_){/* optional */}
    const record={
      key:FILE_KEY,
      blob:file,
      name:file.name,
      size:file.size,
      type:file.type||'application/octet-stream',
      lastModified:file.lastModified||null,
      storedAt:new Date().toISOString(),
      locator
    };
    await putRecord(record);
    const verified=await getRecord();
    if(!verified?.blob||verified.blob.size!==EXPECTED_BYTES||verified.locator?.imageCount!==EXPECTED_IMAGES){
      await deleteRecord();
      throw new Error('The browser did not retain the complete APKG file.');
    }
    statusCache={cached:true,checking:false,error:null,record:verified};
    document.dispatchEvent(new CustomEvent(STATUS_EVENT,{detail:{cached:true,size:verified.size,imageCount:EXPECTED_IMAGES}}));
    renderAll();
    return verified;
  }

  async function removeCachedFile(){
    await deleteRecord();
    statusCache={cached:false,checking:false,error:null,record:null};
    document.dispatchEvent(new CustomEvent(STATUS_EVENT,{detail:{cached:false}}));
    renderAll();
  }

  async function refreshStatus(force=false){
    if(statusPromise&&!force)return statusPromise;
    statusPromise=(async()=>{
      try{
        const record=await getRecord();
        const valid=Boolean(record?.blob&&record.blob.size===EXPECTED_BYTES&&record.locator?.imageCount===EXPECTED_IMAGES);
        statusCache={cached:valid,checking:false,error:valid?null:(record?'Cached file is incomplete.':null),record:valid?record:null};
      }catch(error){statusCache={cached:false,checking:false,error:error.message,record:null};}
      renderAll();
      return statusCache;
    })().finally(()=>{statusPromise=null;});
    return statusPromise;
  }

  async function getImageBlob(query){
    const record=statusCache.cached?statusCache.record:await getRecord();
    if(!record?.blob||!record.locator?.images)throw new Error('The Spranki APKG is not cached in this browser.');
    const needle=normalise(typeof query==='object'?(query.archiveKey||query.filename):query);
    const image=record.locator.images.find(item=>normalise(item.archiveKey)===needle||normalise(item.filename)===needle);
    if(!image)throw new Error('That Spranki image was not found in the cached locator.');
    if(image.compressionMethod!==0)throw new Error('This image is compressed inside the APKG and cannot be read directly.');
    return record.blob.slice(image.dataOffset,image.dataOffset+image.compressedBytes,mimeFor(image.filename));
  }

  async function getImageObjectUrl(query){return URL.createObjectURL(await getImageBlob(query));}
  async function locator(){const record=statusCache.cached?statusCache.record:await getRecord();return record?.locator||null;}

  function injectStyles(){
    if(document.getElementById('spranki-local-pack-style'))return;
    const style=document.createElement('style');
    style.id='spranki-local-pack-style';
    style.textContent=`
      .spranki-cache-panel{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 18px;padding:13px 15px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:var(--shadow)}
      .spranki-cache-state{display:flex;align-items:flex-start;gap:10px;min-width:0}.spranki-cache-copy{min-width:0}.spranki-cache-copy strong{display:block;font-size:.9rem}.spranki-cache-copy span{display:block;margin-top:3px;color:var(--muted);font-size:.76rem;line-height:1.35}
      .spranki-cache-dot,.spranki-nav-dot{display:inline-block;flex:0 0 auto;border-radius:50%;background:#ff667f;box-shadow:0 0 0 3px rgba(255,102,127,.13),0 0 12px rgba(255,102,127,.42)}
      .spranki-cache-dot{width:11px;height:11px;margin-top:4px}.spranki-nav-dot{width:7px;height:7px;margin-left:5px;vertical-align:middle}
      .spranki-ready .spranki-cache-dot,.spranki-nav-dot.spranki-ready{background:#67e3a2;box-shadow:0 0 0 3px rgba(103,227,162,.13),0 0 12px rgba(103,227,162,.42)}
      .spranki-cache-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.spranki-cache-panel input[type=file]{display:none}
      @media(max-width:680px){.spranki-cache-panel{align-items:stretch;flex-direction:column}.spranki-cache-actions{justify-content:stretch}.spranki-cache-actions .btn{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function onCardsRoute(){return(location.hash||'').startsWith('#/conditions');}
  function statusText(){
    if(statusCache.checking)return{title:'Checking Spranki image cache…',detail:'The 953-image locator is built from the APKG and kept in this browser.'};
    if(statusCache.cached){
      const record=statusCache.record;
      return{title:'Spranki image file cached',detail:`${record.locator.imageCount} images · ${formatBytes(record.size)} · stored ${new Date(record.storedAt).toLocaleDateString()}`};
    }
    return{title:'Spranki image file not cached',detail:statusCache.error||'Choose the original 180 MB APKG once. The file and its image locator stay in this browser.'};
  }

  function updateNav(){
    document.querySelectorAll('[data-nav="conditions"]').forEach(button=>{
      let dot=button.querySelector('.spranki-nav-dot');
      if(!dot){dot=document.createElement('span');dot.className='spranki-nav-dot';dot.setAttribute('aria-hidden','true');button.appendChild(dot);}
      dot.classList.toggle('spranki-ready',statusCache.cached);
      button.title=statusCache.cached?'Cards · Spranki image file cached':'Cards · Spranki image file not cached';
    });
  }

  function mountPanel(){
    if(!onCardsRoute())return;
    const app=document.getElementById('app');
    if(!app)return;
    let panel=document.getElementById('spranki-cache-panel');
    if(!panel){
      panel=document.createElement('section');
      panel.id='spranki-cache-panel';
      panel.className='spranki-cache-panel';
      const head=app.querySelector('.page-head');
      if(head?.nextSibling)app.insertBefore(panel,head.nextSibling);else if(head)head.insertAdjacentElement('afterend',panel);else app.prepend(panel);
    }
    const copy=statusText();
    panel.classList.toggle('spranki-ready',statusCache.cached);
    panel.innerHTML=`
      <div class="spranki-cache-state"><span class="spranki-cache-dot" aria-hidden="true"></span><div class="spranki-cache-copy"><strong>${escapeHtml(copy.title)}</strong><span>${escapeHtml(copy.detail)}</span></div></div>
      <div class="spranki-cache-actions"><label class="btn ${statusCache.cached?'ghost':'primary'}" for="spranki-apkg-input">${statusCache.cached?'Replace APKG':'Choose APKG'}</label>${statusCache.cached?'<button class="btn ghost" id="spranki-remove-cache" type="button">Remove</button>':''}</div>
      <input id="spranki-apkg-input" type="file" accept=".apkg,application/zip,application/octet-stream">
    `;
    const input=panel.querySelector('#spranki-apkg-input');
    input.onchange=async()=>{
      const file=input.files?.[0];
      if(!file)return;
      const title=panel.querySelector('.spranki-cache-copy strong');
      const detail=panel.querySelector('.spranki-cache-copy span');
      const actions=panel.querySelectorAll('button,label');
      actions.forEach(node=>node.setAttribute('aria-disabled','true'));
      title.textContent='Caching Spranki image file…';
      detail.textContent='Keep this tab open while the browser stores the APKG and builds the 953-image locator.';
      try{await cacheFile(file);core()?.toast?.('Spranki image file cached');}
      catch(error){statusCache={cached:false,checking:false,error:error.message,record:null};renderAll();core()?.toast?.(error.message);}
    };
    panel.querySelector('#spranki-remove-cache')?.addEventListener('click',async()=>{
      if(!confirm('Remove the cached Spranki APKG from this browser?'))return;
      await removeCachedFile();
      core()?.toast?.('Spranki image cache removed');
    });
  }

  function renderAll(){injectStyles();updateNav();mountPanel();}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;renderAll();});}
  function initialise(){
    injectStyles();
    const app=document.getElementById('app');
    if(!app){setTimeout(initialise,80);return;}
    observer=new MutationObserver(schedule);
    observer.observe(document.getElementById('app-shell')||document.body,{childList:true,subtree:true});
    window.addEventListener('hashchange',schedule);
    window.addEventListener('pageshow',()=>refreshStatus(true));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshStatus(true);});
    refreshStatus();
    schedule();
  }

  window.UKMLA_SPRANKI_LOCAL_PACK={
    DB_NAME,STORE,FILE_KEY,EXPECTED_BYTES,EXPECTED_IMAGES,
    status:()=>({...statusCache}),refreshStatus,cacheFile,removeCachedFile,
    locator,getImageBlob,getImageObjectUrl,parseZipDirectory
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});else initialise();
})();
