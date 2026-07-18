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

  const start=async()=>{
    if(playButton)playButton.hidden=true;
    try{
      video.muted=false;
      video.volume=1;
      await video.play();
      overlay.classList.add('is-playing');
    }catch(_){
      if(playButton){
        playButton.hidden=false;
        playButton.focus({preventScroll:true});
      }
    }
  };

  video.addEventListener('timeupdate',()=>{
    if(!Number.isFinite(video.duration)||!video.duration)return;
    const remaining=video.duration-video.currentTime;
    if(remaining<=FADE_SECONDS){
      overlay.classList.add('is-fading');
      video.volume=Math.max(0,Math.min(1,remaining/FADE_SECONDS));
    }
  });
  video.addEventListener('ended',()=>finish(false),{once:true});
  video.addEventListener('error',()=>finish(true),{once:true});
  playButton?.addEventListener('click',start);
  skipButton?.addEventListener('click',()=>finish(false));

  setTimeout(()=>{if(!finished&&video.paused&&playButton)playButton.hidden=false;},700);
  setTimeout(()=>{if(!finished)finish(false);},15000);
  void start();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();
