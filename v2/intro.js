(function(){
'use strict';

const SESSION_KEY='ukmlaIntroPlayedV2';
const FADE_SECONDS=.5;
const AUTOPLAY_GRACE_MS=1800;
const MEDIA_TIMEOUT_MS=8000;
let finished=false;
let playbackStarted=false;
let sessionShouldBeMarked=false;

function removeOverlay(overlay){
  if(overlay?.isConnected)overlay.remove();
}

function configureMuted(video){
  video.defaultMuted=true;
  video.muted=true;
  video.setAttribute('muted','');
  video.setAttribute('autoplay','');
  video.setAttribute('playsinline','');
}

function initialise(){
  const overlay=document.getElementById('app-intro');
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

  const finish=(immediate=false,markSession=sessionShouldBeMarked)=>{
    if(finished)return;
    finished=true;
    if(markSession){
      try{sessionStorage.setItem(SESSION_KEY,'1');}catch(_){/* Optional. */}
    }
    overlay.classList.add('is-fading');
    try{video.pause();video.volume=0;}catch(_){/* Optional. */}
    setTimeout(()=>removeOverlay(overlay),immediate?80:540);
  };

  const markPlaying=()=>{
    if(finished)return;
    playbackStarted=true;
    sessionShouldBeMarked=true;
    overlay.classList.add('is-playing');
    if(video.muted)showButton('Tap for sound');
    else hideButton();
  };

  const playMuted=async()=>{
    configureMuted(video);
    try{
      await video.play();
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
      return true;
    }catch(_){
      const mutedWorked=await playMuted();
      if(!mutedWorked)finish(false,false);
      return mutedWorked;
    }
  };

  video.addEventListener('playing',markPlaying);
  video.addEventListener('canplay',()=>{
    if(!finished&&!playbackStarted)void playMuted();
  },{once:true});
  video.addEventListener('timeupdate',()=>{
    if(!Number.isFinite(video.duration)||!video.duration)return;
    const remaining=video.duration-video.currentTime;
    if(remaining<=FADE_SECONDS){
      overlay.classList.add('is-fading');
      if(!video.muted)video.volume=Math.max(0,Math.min(1,remaining/FADE_SECONDS));
    }
  });
  video.addEventListener('ended',()=>finish(false,true),{once:true});
  video.addEventListener('error',()=>finish(true,false),{once:true});
  playButton?.addEventListener('click',()=>void playWithSound());
  skipButton?.addEventListener('click',()=>finish(false,true));

  configureMuted(video);
  video.load();
  setTimeout(()=>{
    if(!finished&&!playbackStarted)showButton('Tap to play intro');
  },AUTOPLAY_GRACE_MS);
  setTimeout(()=>{
    if(!finished&&!playbackStarted)finish(false,false);
  },MEDIA_TIMEOUT_MS);
  void playMuted();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();
