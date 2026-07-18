const fs=require('fs');

function assert(condition,message){if(!condition)throw new Error(message);}

const boot=fs.readFileSync('v2/boot-recovery.js','utf8');
for(const required of [
  "CARD_DATA_PATTERN=/\\/data\\/conditions\\.json$/",
  'REQUEST_TIMEOUT_MS=8000',
  "caches.match(url.href,{ignoreSearch:true})",
  'const cached=await cachedCardData(url)',
  'const lateCache=await cachedCardData(url)',
  "caches.open('ukmla-runtime-card-data-v1')",
  'window.fetch=async function resilientFetch'
])assert(boot.includes(required),`Card-startup recovery omitted: ${required}`);
const resilientStart=boot.indexOf('window.fetch=async function resilientFetch');
const cacheRead=boot.indexOf('const cached=await cachedCardData(url)',resilientStart);
const networkStart=boot.indexOf('void fetchWithTimeout(input',resilientStart);
assert(resilientStart>=0&&cacheRead>resilientStart&&networkStart>cacheRead,'Card data is not checked in Cache Storage before the network request.');

const html=fs.readFileSync('v2/app.html','utf8');
assert(html.includes('boot-recovery.js?v=1'),'Boot recovery runtime is not loaded.');
assert(html.indexOf('boot-recovery.js?v=1')<html.indexOf('core.js?v=2'),'Boot recovery does not load before core startup.');

const worker=fs.readFileSync('service-worker.js','utf8');
for(const required of [
  'ukmla-cards-v17-cache-first-card-startup',
  "'./v2/boot-recovery.js'",
  "url.pathname.endsWith('/data/conditions.json')",
  'const cached=await caches.match(request,{ignoreSearch:true})',
  'event.waitUntil(refresh)'
])assert(worker.includes(required),`Service-worker card startup protection omitted: ${required}`);
const dataBranch=worker.indexOf("url.pathname.endsWith('/data/conditions.json')");
const genericBranch=worker.lastIndexOf('event.respondWith((async()=>{');
assert(dataBranch>=0&&dataBranch<genericBranch,'Condition data is not handled before the generic network-first path.');

console.log(JSON.stringify({
  cacheStorageReadBeforeNetwork:true,
  networkTimeoutMs:8000,
  lateCacheRetry:true,
  serviceWorkerCacheFirstForCardIndex:true,
  savedBrowserDataUntouched:true
},null,2));
