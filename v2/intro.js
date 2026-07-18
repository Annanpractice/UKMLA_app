(function(){
'use strict';

const SESSION_KEY='ukmlaIntroPlayedV1';
const FADE_SECONDS=.5;
let finished=false;

function removeOverlay(overlay){
  if(!overlay?.isConnected)return;
  overlay.remove();
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

  const finish=(immediate=false)=>{
    if(finished)return;
    finished=true;
    try{sessionStorage.setItem(SESSION_KEY,'1');}catch(_){/* optional */}
    overlay.classList.add('is-fading');
    video.volume=0;
    setTimeout(()=>removeOverlay(overlay),immediate?80:540);
  };

  const showPlayButton=label=>{
    if(!playButton)return;
    playButton.textContent=label;
    playButton.hidden=false;
  };

  const playMuted=async()=>{
    try{
      video.muted=true;
      video.volume=1;
      await video.play();
      overlay.classList.add('is-playing');
      showPlayButton('Tap for sound');
    }catch(_){
      showPlayButton('Tap to play intro');
      playButton?.focus({preventScroll:true});
    }
  };

  const playWithSound=async(restart=true)=>{
    if(playButton)playButton.hidden=true;
    overlay.classList.remove('is-fading');
    try{
      if(restart)video.currentTime=0;
      video.muted=false;
      video.volume=1;
      await video.play();
      overlay.classList.add('is-playing');
    }catch(_){
      await playMuted();
    }
  };

  video.addEventListener('timeupdate',()=>{
    if(!Number.isFinite(video.duration)||!video.duration)return;
    const remaining=video.duration-video.currentTime;
    if(remaining<=FADE_SECONDS){
      overlay.classList.add('is-fading');
      if(!video.muted)video.volume=Math.max(0,Math.min(1,remaining/FADE_SECONDS));
    }
  });
  video.addEventListener('ended',()=>finish(false),{once:true});
  video.addEventListener('error',()=>finish(true),{once:true});
  playButton?.addEventListener('click',()=>void playWithSound(true));
  skipButton?.addEventListener('click',()=>finish(false));

  setTimeout(()=>{if(!finished&&video.paused)void playMuted();},700);
  setTimeout(()=>{if(!finished)finish(false);},15000);
  void playWithSound(false);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();