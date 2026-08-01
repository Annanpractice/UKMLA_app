import fs from 'node:fs/promises';
import path from 'node:path';

const API='https://openi.nlm.nih.gov/api/search';
const ALLOWED=[/\bcc\s*0\b/i,/\bcc\s*by\s*4(?:\.0)?\b/i,/creative commons attribution 4(?:\.0)?/i];
const BLOCKED_COLLECTIONS=[/medpix/i,/indiana.*chest/i,/iu chest/i];
const seedPath=process.argv[2]||'scripts/image-search-seeds.json';
const outputPath=process.argv[3]||'artifacts/openi-image-candidates.json';
const maxPerTerm=Math.max(1,Math.min(20,Number(process.env.OPENI_RESULTS_PER_TERM)||8));

function clean(value){return String(value??'').replace(/\s+/g,' ').trim();}
function absolute(value){const text=clean(value);if(!text)return'';return /^https?:\/\//i.test(text)?text:`https://openi.nlm.nih.gov${text.startsWith('/')?'':'/'}${text}`;}
function allowedLicence(value){return ALLOWED.some(pattern=>pattern.test(clean(value)));}
function blockedCollection(value){return BLOCKED_COLLECTIONS.some(pattern=>pattern.test(clean(value)));}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function request(term,attempt=1){
  const url=new URL(API);
  url.searchParams.set('query',term);
  url.searchParams.set('m',String(maxPerTerm));
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'UKMLA-image-candidate-review/1.0'}});
  if((response.status===429||response.status>=500)&&attempt<4){await sleep(750*2**attempt);return request(term,attempt+1);}
  if(!response.ok)throw new Error(`${term}: Open-i returned ${response.status}`);
  return response.json();
}

function candidate(term,item,index){
  const collection=clean(item.collection||item.source||item.subset);
  const licence=clean(item.license||item.licence||item.copyright);
  const imageUrl=absolute(item.imgLarge||item.imgGrid||item.imgThumb||item.imageUrl);
  const imageKey=clean(item.imgId||item.imageId||item.uid||item.id||`${term}-${index+1}`);
  const detailUrl=absolute(item.link||item.detailUrl||item.url)||`https://openi.nlm.nih.gov/detailedresult?img=${encodeURIComponent(imageKey)}`;
  const reasons=[];
  if(!imageUrl)reasons.push('missing-image-url');
  if(blockedCollection(collection))reasons.push('blocked-collection');
  if(!allowedLicence(licence))reasons.push('licence-not-explicitly-allowed');
  return{
    candidateId:`openi-${imageKey}`,
    searchTerm:term,
    title:clean(item.title||item.name),
    caption:clean(item.abstract||item.caption||item.findings),
    modality:clean(item.modality||item.imageType),
    collection,
    imageUrl,
    thumbnailUrl:absolute(item.imgThumb||item.imgGrid),
    sourcePage:detailUrl,
    licence,
    meshTerms:Array.isArray(item.MeSH)?item.MeSH:Array.isArray(item.mesh)?item.mesh:[],
    reviewStatus:reasons.length?'rejected-by-policy':'pending-human-review',
    policyReasons:reasons,
    mayPublish:false
  };
}

async function main(){
  const seeds=JSON.parse(await fs.readFile(seedPath,'utf8'));
  const terms=[...new Set((seeds.terms||seeds).map(clean).filter(Boolean))];
  const rows=[];
  const failures=[];
  for(const term of terms){
    try{
      const data=await request(term);
      (data?.list||[]).forEach((item,index)=>rows.push(candidate(term,item,index)));
    }catch(error){failures.push({term,error:String(error.message||error)});}
    await sleep(300);
  }
  const unique=[...new Map(rows.map(row=>[row.imageUrl||row.candidateId,row])).values()];
  const result={
    schemaVersion:'ukmla-openi-candidates-v1',
    generatedAt:new Date().toISOString(),
    source:'NLM Open-i API',
    publicationRule:'Candidates are never published automatically. Only explicit CC0 or CC BY 4.0 results outside blocked collections reach human review.',
    terms,
    totals:{retrieved:unique.length,pendingHumanReview:unique.filter(row=>row.reviewStatus==='pending-human-review').length,rejected:unique.filter(row=>row.reviewStatus!=='pending-human-review').length,failures:failures.length},
    failures,
    candidates:unique
  };
  await fs.mkdir(path.dirname(outputPath),{recursive:true});
  await fs.writeFile(outputPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.totals));
  if(failures.length===terms.length)process.exitCode=1;
}

main().catch(error=>{console.error(error);process.exitCode=1;});
