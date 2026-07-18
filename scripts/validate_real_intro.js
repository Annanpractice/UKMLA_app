const fs=require('fs');
function assert(condition,message){if(!condition)throw new Error(message);}
const html=fs.readFileSync('v2/app.html','utf8');
const css=fs.readFileSync('v2/intro.css','utf8');
const js=fs.readFileSync('v2/intro.js','utf8');
const worker=fs.readFileSync('service-worker.js','utf8');
const videoPath='assets/ukmla-intro.mp4';
const posterPath='assets/ukmla-intro-first-frame.jpg';
assert(fs.existsSync(videoPath),'Real intro MP4 is missing.');
assert(fs.existsSync(posterPath),'Genuine first frame from the intro is missing.');
assert(fs.statSync(videoPath).size<1500000,'Mobile intro MP4 is still too large for reliable startup.');
assert(fs.statSync(posterPath).size>1000,'Genuine intro poster is empty or invalid.');
assert(html.includes('assets/ukmla-intro.mp4?v=3'),'Optimised real intro MP4 is not referenced.');
assert(html.includes('poster="./assets/ukmla-intro-first-frame.jpg?v=1"'),'Genuine intro frame is not used as the video poster.');
assert(!html.includes('app-intro-poster'),'Invented intro poster markup must not return.');
assert(!css.includes('app-intro-emblem'),'Invented intro emblem CSS must not return.');
assert(css.includes('object-fit:cover'),'Intro must crop without distortion.');
assert(css.includes('opacity:1'),'Genuine poster must remain visible before playback starts.');
assert(!js.includes('preferCachedSource'),'Cached blob source replacement must remain removed.');
assert(!worker.includes('rangedVideoResponse'),'Service worker must not rebuild MP4 range responses.');
assert(worker.includes('ukmla-cards-v20-optimised-real-intro'),'Service-worker release marker was not advanced.');
console.log(JSON.stringify({
  realUploadedClipOnly:true,
  genuineFrameWhileLoading:true,
  substituteArtworkForbidden:true,
  directBrowserStreaming:true,
  videoBytes:fs.statSync(videoPath).size,
  posterBytes:fs.statSync(posterPath).size
},null,2));
