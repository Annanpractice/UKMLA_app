const fs=require('fs');
function assert(condition,message){if(!condition)throw new Error(message);}
const html=fs.readFileSync('v2/app.html','utf8');
const css=fs.readFileSync('v2/intro.css','utf8');
const js=fs.readFileSync('v2/intro.js','utf8');
const worker=fs.readFileSync('service-worker.js','utf8');
assert(html.includes('assets/ukmla-intro.mp4'),'Real intro MP4 is not referenced.');
assert(!html.includes('app-intro-poster'),'Invented intro poster markup must not return.');
assert(!css.includes('app-intro-emblem'),'Invented intro emblem CSS must not return.');
assert(!js.includes('preferCachedSource'),'Cached blob source replacement must remain removed.');
assert(!worker.includes('rangedVideoResponse'),'Service worker must not rebuild MP4 range responses.');
assert(css.includes('object-fit:cover'),'Intro must crop without distortion.');
console.log(JSON.stringify({realUploadedClipOnly:true,substituteArtworkForbidden:true,directBrowserStreaming:true},null,2));
