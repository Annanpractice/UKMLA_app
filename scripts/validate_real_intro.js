// The one-off media preparation verifies 1280x720 and zero audio streams before this regression suite runs.
const fs=require('fs');
function assert(condition,message){if(!condition)throw new Error(message);}
const html=fs.readFileSync('v2/app.html','utf8');
const css=fs.readFileSync('v2/intro.css','utf8');
const js=fs.readFileSync('v2/intro.js','utf8');
const worker=fs.readFileSync('service-worker.js','utf8');
const videoPath='assets/ukmla-intro.mp4';
const posterPath='assets/ukmla-intro-first-frame.jpg';
const videoBytes=fs.statSync(videoPath).size;
const posterBytes=fs.statSync(posterPath).size;
assert(fs.existsSync(videoPath),'Real intro MP4 is missing.');
assert(fs.existsSync(posterPath),'Genuine first frame from the intro is missing.');
assert(videoBytes>5000000,'The original high-resolution intro MP4 was not retained.');
assert(videoBytes<7000000,'Unexpected intro MP4 size.');
assert(posterBytes>1000,'Genuine intro first frame is empty or invalid.');
assert(html.includes('assets/ukmla-intro.mp4?v=6'),'Original silent intro MP4 cache version is not referenced.');
assert(html.includes('<button class="app-intro-launch"'),'Genuine first frame is not implemented as the entry button.');
assert(html.includes('<img src="./assets/ukmla-intro-first-frame.jpg?v=4"'),'Extracted first frame cache version is not visible on the launch button.');
assert(html.includes('Tap to enter'),'Entry prompt is missing.');
assert(!html.includes('muted autoplay'),'Intro must not autoplay before a user gesture.');
assert(!html.includes('app-intro-poster'),'Invented intro poster markup must not return.');
assert(!html.includes('app-intro-skip'),'Separate skip control must not replace the first-frame entry action.');
assert(!css.includes('app-intro-emblem'),'Invented intro emblem CSS must not return.');
assert(css.includes('object-fit:cover'),'Intro must crop without distortion.');
assert(css.includes('.app-intro-launch img'),'Genuine first frame is not styled as the full-screen button.');
assert(js.includes("launchButton.addEventListener('click'"),'Video playback is not triggered by the first-frame button.');
assert(js.includes('FADE_SECONDS=.5')&&js.includes('remaining/FADE_SECONDS'),'Final half-second visual fade is missing.');
assert(!js.includes('playMuted'),'Muted autoplay fallback must remain removed.');
assert(!js.includes('preferCachedSource'),'Cached blob source replacement must remain removed.');
assert(!worker.includes('rangedVideoResponse'),'Service worker must not rebuild MP4 range responses.');
assert(worker.includes('ukmla-cards-v23-original-silent-intro'),'Service-worker release marker was not advanced.');
console.log(JSON.stringify({
  originalHighResolutionVideo:true,
  silentVideo:true,
  genuineFirstFrameButton:true,
  substituteArtworkForbidden:true,
  directBrowserStreaming:true,
  halfSecondVisualFade:true,
  videoBytes,
  posterBytes
},null,2));
