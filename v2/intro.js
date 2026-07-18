(function(){
'use strict';

const SESSION_KEY='ukmlaIntroPlayedV1';
const FADE_SECONDS=.5;
const MEDIA_TIMEOUT_MS=9000;
let finished=false;
let objectUrl='';
let playbackStarted=false;

function removeOverlay(overlay){
  if(objectUrl){
    URL.revokeObjectURL(objectUrl);
    objectUrl='';
  }
  if(overlay?.isConnected)overlay.remove();
}

function configureMuted(video){
  video.defaultMuted=true;
  video.muted=true;
  video.setAttribute('muted','');
  video.setAttribute('autoplay','');
  video.setAttribute('playsinline','');
}

async function preferCachedSource(video){
  if(!('caches'in window))return false;
  const original=video.getAttribute('src');
  if(!original)return false;
  try{
    const absolute=new URL(original,location.href).href;
    const cached=await caches.match(absolute,{ignoreSearch:true});
    if(!cached?.ok)return false;
    const blob=await cached.blob();
    if(!blob.size)return false;
    objectUrl=URL.createObjectURL(blob);
    video.src=objectUrl;
    video.load();
    return true;
  }catch(_){
    return false;
  }
}

function initialise(){
  const overlay=document.getElementById('app-intro');
  const poster=document.getElementById('app-intro-poster');
  const video=document.getElementById('app-intro-video');
  const playButton=document.getElementById('app-intro-play');
  const skipButton=document.getElementById('app-intro-skip');
  if(!overlay||!video)return;

  if(sessionStorage.getItem(SESSION_KEY)==='1'){
    removeOverlay(overlay);
    return;
  }

  const showButton=label=>{
    if(!playButton)return;
    playButton.textContent=label;
    playButton.hidden=false;
  };

  const hideButton=()=>{
    if(playButton)playButton.hidden=true;
  };

  const finish=(immediate=false)=>{
    if(finished)return;
    finished=true;
    try{sessionStorage.setItem(SESSION_KEY,'1');}catch(_){/* Optional. */}
    overlay.classList.add('is-fading');
    video.volume=0;
    setTimeout(()=>removeOverlay(overlay),immediate?100:540);
  };

  const markPlaying=()=>{
    playbackStarted=true;
    overlay.classList.add('is-playing');
    poster?.classList.add('is-hidden');
    if(video.muted)showButton('Tap for sound');
    else hideButton();
  };

  const playMuted=async()=>{
    configureMuted(video);
    try{
      await video.play();
      markPlaying();
      return true;
    }catch(_){
      showButton('Tap to play intro');
      return false;
    }
  };

  const playWithSound=async()=>{
    hideButton();
    overlay.classList.remove('is-fading');
    try{
      video.currentTime=0;
      video.defaultMuted=false;
      video.muted=false;
      video.removeAttribute('muted');
      video.volume=1;
      await video.play();
      markPlaying();
      return true;
    }catch(_){
      const mutedWorked=await playMuted();
      if(!mutedWorked)finish(false);
      return mutedWorked;
    }
  };

  video.addEventListener('playing',markPlaying);
  video.addEventListener('timeupdate',()=>{
    if(!Number.isFinite(video.duration)||!video.duration)return;
    const remaining=video.duration-video.currentTime;
    if(remaining<=FADE_SECONDS){
      overlay.classList.add('is-fading');
      if(!video.muted)video.volume=Math.max(0,Math.min(1,remaining/FADE_SECONDS));
    }
  });
  video.addEventListener('waiting',()=>{
    if(!playbackStarted)showButton('Tap to play intro');
  });
  video.addEventListener('stalled',()=>{
    if(!playbackStarted)showButton('Tap to play intro');
  });
  video.addEventListener('ended',()=>finish(false),{once:true});
  video.addEventListener('error',()=>finish(false),{once:true});
  playButton?.addEventListener('click',()=>void playWithSound());
  skipButton?.addEventListener('click',()=>finish(false));

  configureMuted(video);
  setTimeout(()=>{
    if(!finished&&!playbackStarted)showButton('Tap to play intro');
  },1200);
  setTimeout(()=>{
    if(!finished)finish(false);
  },MEDIA_TIMEOUT_MS);

  void (async()=>{
    await preferCachedSource(video);
    if(!finished)await playMuted();
  })();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();
