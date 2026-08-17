(function(){
  'use strict';

  const STORAGE='ukmlaManualCardsV1';
  const SCHEMA='ukmla-card-import-v1';
  const PROFILES={
    clinical:{label:'Clinical',fields:[['investigations','Investigations'],['treatment','Treatment'],['escalation','Escalation'],['mimics','Mimics'],['redFlags','Red flags']]},
    pharmacology:{label:'Pharmacology',fields:[['indication','Indication / recognise'],['prescribe','Prescribe'],['checkMonitor','Check / monitor'],['interactionsAvoid','Interactions / avoid'],['toxicityAct','Toxicity / act']]},
    anatomy:{label:'Anatomy',fields:[['exactAnswer','Exact high-yield answer'],['clinicalPattern','Clinical association / deficit'],['localisation','Localisation logic'],['discriminator','Discriminator / trap'],['examUse','Applied exam use']]},
    physiology:{label:'Physiology',fields:[['subsystem','System / subdomain'],['mechanism','Core mechanism'],['clinicalPattern','Clinical pattern'],['discriminator','Discriminator / trap'],['examUse','Applied exam use']]},
    law:{label:'Law / professional practice',fields:[['recognise','Recognise'],['rule','Legal / professional rule'],['act','Act'],['record','Record / escalate'],['avoid','Avoid']]}
  };

  let injected=false;
  let scheduled=false;

  function api(){return window.UKMLA_V2;}
  function clean(v){return String(v??'').replace(/\s+/g,' ').trim();}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function load(){try{const v=JSON.parse(localStorage.getItem(STORAGE)||'null');return v?.schemaVersion===SCHEMA&&Array.isArray(v.cards)?v:{schemaVersion:SCHEMA,cards:[]};}catch(_){return{schemaVersion:SCHEMA,cards:[]};}}
  function save(payload){localStorage.setItem(STORAGE,JSON.stringify(payload));}
  function slug(v,limit=32){return(clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'card').slice(0,limit);}
  function randomId(topic,name){const r=(crypto.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,12);return`manual-${slug(topic,18)}-${slug(name,28)}-${r}`;}
  function topicIdFor(topic){const core=api();const existing=core?.App?.topics?.find(t=>clean(t.name).toLowerCase()===clean(topic).toLowerCase());if(existing)return existing.id;return`topic-${slug(topic,38)}-manual`;}
  function labels(profile){return Object.fromEntries(PROFILES[profile].fields.map(([key,label])=>[key,label]));}
  function normalize(raw,{assignId=true}={}){
    const topic=clean(raw?.topic),name=clean(raw?.name),profile=clean(raw?.profile).toLowerCase();
    if(!topic||!name)throw new Error('Every card needs a topic and name.');
    if(!PROFILES[profile])throw new Error(`${name}: unsupported profile “${profile}”.`);
    if(!raw.fields||typeof raw.fields!=='object'||Array.isArray(raw.fields))throw new Error(`${name}: fields must be an object.`);
    const required=PROFILES[profile].fields.map(([key])=>key);
    const missing=required.filter(key=>!clean(raw.fields[key]));
    const extras=Object.keys(raw.fields).filter(key=>!required.includes(key));
    if(missing.length||extras.length)throw new Error(`${name}: field mismatch${missing.length?`; missing ${missing.join(', ')}`:''}${extras.length?`; unexpected ${extras.join(', ')}`:''}.`);
    let id=clean(raw.id);
    if(!id&&assignId)id=randomId(topic,name);
    if(id&&!/^manual-[a-z0-9-]{8,120}$/.test(id))throw new Error(`${name}: imported IDs must use the manual-* format.`);
    const fields=Object.fromEntries(required.map(key=>[key,clean(raw.fields[key])]));
    return{id,topic,name,profile,fields};
  }
  function validatePayload(value,{assignIds=true}={}){
    if(Array.isArray(value))value={schemaVersion:SCHEMA,cards:value};
    if(value?.schemaVersion!==SCHEMA||!Array.isArray(value.cards))throw new Error(`Expected ${SCHEMA} with a cards array.`);
    if(!value.cards.length)throw new Error('No cards were supplied.');
    const cards=value.cards.map(card=>normalize(card,{assignId:assignIds}));
    const core=api();const existing=[...(core?.App?.conditions||[])];
    const seenIds=new Set(existing.map(x=>x.id));
    const seenNames=new Set(existing.map(x=>`${clean(x.topic).toLowerCase()}|${clean(x.name).toLowerCase()}`));
    for(const card of cards){
      const key=`${card.topic.toLowerCase()}|${card.name.toLowerCase()}`;
      if(seenIds.has(card.id))throw new Error(`${card.name}: duplicate immutable ID.`);
      if(seenNames.has(key))throw new Error(`${card.name}: a card with the same topic and name already exists.`);
      seenIds.add(card.id);seenNames.add(key);
    }
    return{schemaVersion:SCHEMA,cards};
  }
  function runtimeRecord(card){
    const topicId=topicIdFor(card.topic);
    let fields={...card.fields};let mappedLabels=labels(card.profile);
    if(card.profile==='pharmacology'){
      fields={mimics:card.fields.indication,treatment:card.fields.prescribe,investigations:card.fields.checkMonitor,redFlags:card.fields.interactionsAvoid,escalation:card.fields.toxicityAct};
      mappedLabels={mimics:'Indication / recognise',treatment:'Prescribe',investigations:'Check / monitor',redFlags:'Interactions / avoid',escalation:'Toxicity / act'};
    }
    return{id:card.id,topicId,topic:card.topic,name:card.name,profile:card.profile,fields,labels:mappedLabels,manualImport:true,search:clean([card.topic,card.name,...Object.values(fields)].join(' '))};
  }
  function injectLocal(){
    const core=api();if(!core?.App?.loaded||injected)return false;
    const payload=load();if(!payload.cards.length){injected=true;return true;}
    for(const raw of payload.cards){
      let card;try{card=normalize(raw);}catch(e){console.warn('Skipping invalid local card',e);continue;}
      if(core.App.byId.has(card.id))continue;
      const record=runtimeRecord(card);core.App.conditions.push(record);core.App.byId.set(record.id,record);
      let topic=core.App.topics.find(x=>x.id===record.topicId);
      if(!topic){topic={id:record.topicId,name:record.topic,count:0};core.App.topics.push(topic);core.App.byTopic.set(record.topicId,[]);}
      const list=core.App.byTopic.get(record.topicId)||[];list.push(record);core.App.byTopic.set(record.topicId,list);topic.count=list.length;
    }
    core.App.conditions.sort((a,b)=>String(a.topic).localeCompare(String(b.topic))||String(a.name).localeCompare(String(b.name)));
    core.App.topics.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    if(core.App.data){core.App.data.conditionCount=core.App.conditions.length;core.App.data.topicCount=core.App.topics.length;}
    injected=true;return true;
  }
  function download(payload){const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ukmla-card-import.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function copy(payload){await navigator.clipboard.writeText(JSON.stringify(payload,null,2));api()?.toast?.('Card JSON copied.');}
  function formFields(profile){return PROFILES[profile].fields.map(([key,label])=>`<label style="display:grid;gap:6px"><span>${esc(label)}</span><textarea class="input" data-card-field="${key}" rows="3"></textarea></label>`).join('');}
  function overlay(){
    const core=api();const topics=(core?.App?.topics||[]).map(t=>t.name);const node=document.createElement('div');node.id='card-import-overlay';node.style.cssText='position:fixed;inset:0;z-index:300;background:rgba(0,4,12,.82);overflow:auto;padding:18px';
    node.innerHTML=`<section class="panel" style="max-width:780px;margin:20px auto;padding:18px;display:grid;gap:16px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><div class="eyebrow">Safe card importer</div><h2 style="margin:4px 0">Add or import cards</h2></div><button class="btn ghost" data-card-close>Close</button></div><div class="tabs"><button class="tab active" data-card-tab="form">Form</button><button class="tab" data-card-tab="json">Paste JSON</button></div><div data-card-panel="form"><div style="display:grid;gap:12px"><label style="display:grid;gap:6px"><span>Topic</span><input class="input" id="card-topic" list="card-topic-list"><datalist id="card-topic-list">${topics.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist></label><label style="display:grid;gap:6px"><span>Profile</span><select class="select" id="card-profile">${Object.entries(PROFILES).map(([id,p])=>`<option value="${id}">${esc(p.label)}</option>`).join('')}</select></label><label style="display:grid;gap:6px"><span>Card name</span><input class="input" id="card-name"></label><div id="card-fields" style="display:grid;gap:12px">${formFields('clinical')}</div><button class="btn primary" data-card-add>Add card locally</button></div></div><div data-card-panel="json" hidden><div style="display:grid;gap:12px"><textarea class="input" id="card-json" rows="16" placeholder='{"schemaVersion":"ukmla-card-import-v1","cards":[...]}'></textarea><input type="file" id="card-file" accept="application/json,.json"><button class="btn primary" data-card-import>Validate & import locally</button></div></div><div style="border-top:1px solid rgba(255,255,255,.12);padding-top:14px;display:grid;gap:9px"><strong>Portable JSON</strong><span style="opacity:.75">Local imports enter the normal coverage and analytics model immediately. Export the same finalized JSON to make them permanent in GitHub.</span><div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn" data-card-copy>Copy imported JSON</button><button class="btn" data-card-download>Download JSON</button><button class="btn ghost" data-card-github>Open GitHub import portal</button></div></div></section>`;
    document.body.appendChild(node);
    const profile=node.querySelector('#card-profile');profile.onchange=()=>node.querySelector('#card-fields').innerHTML=formFields(profile.value);
    node.querySelectorAll('[data-card-tab]').forEach(btn=>btn.onclick=()=>{node.querySelectorAll('[data-card-tab]').forEach(x=>x.classList.toggle('active',x===btn));node.querySelectorAll('[data-card-panel]').forEach(p=>p.hidden=p.dataset.cardPanel!==btn.dataset.cardTab);});
    node.querySelector('[data-card-close]').onclick=()=>node.remove();
    node.querySelector('#card-file').onchange=async e=>{const f=e.target.files?.[0];if(f)node.querySelector('#card-json').value=await f.text();};
    node.querySelector('[data-card-add]').onclick=()=>{
      try{const fields={};node.querySelectorAll('[data-card-field]').forEach(x=>fields[x.dataset.cardField]=x.value);const payload=validatePayload({schemaVersion:SCHEMA,cards:[{topic:node.querySelector('#card-topic').value,name:node.querySelector('#card-name').value,profile:profile.value,fields}]});commit(payload);}
      catch(e){alert(e.message);}
    };
    node.querySelector('[data-card-import]').onclick=()=>{try{commit(validatePayload(JSON.parse(node.querySelector('#card-json').value)));}catch(e){alert(e.message);}};
    node.querySelector('[data-card-copy]').onclick=()=>copy(load());
    node.querySelector('[data-card-download]').onclick=()=>download(load());
    node.querySelector('[data-card-github]').onclick=()=>window.open('https://github.com/Annanpractice/UKMLA_app/issues/new?template=card-import.yml','_blank','noopener');
  }
  function commit(payload){
    const current=load();current.cards.push(...payload.cards);save(current);injected=false;injectLocal();api()?.toast?.(`${payload.cards.length} card${payload.cards.length===1?'':'s'} imported.`);document.getElementById('card-import-overlay')?.remove();setTimeout(()=>location.reload(),250);
  }
  function installButton(){
    injectLocal();
    const core=api();if(!core?.App?.loaded)return;
    const onCards=(location.hash||'').startsWith('#/conditions');
    document.getElementById('card-import-launch')?.remove();if(!onCards)return;
    const button=document.createElement('button');button.id='card-import-launch';button.className='btn primary';button.textContent='+ Add / import card';button.style.cssText='position:fixed;right:18px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:90;box-shadow:0 10px 30px rgba(0,0,0,.35)';button.onclick=overlay;document.body.appendChild(button);
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;installButton();});}
  function init(){const app=document.getElementById('app');if(!app||!api()){setTimeout(init,100);return;}new MutationObserver(schedule).observe(app,{childList:true,subtree:true});window.addEventListener('hashchange',schedule);schedule();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
