(function(){
'use strict';

const SESSION_KEY='ukmlaIntroPlayedV3';
const FADE_SECONDS=.5;
const START_TIMEOUT_MS=6000;
const PLAYBACK_FAILSAFE_MS=12000;
let finished=false;
let started=false;
let playbackStarted=false;
let fadeStarted=false;
let mediaFailed=false;
let startTimer=0;
let failsafeTimer=0;

function removeOverlay(overlay){
  if(overlay?.isConnected)overlay.remove();
}

function markSessionPlayed(){
  try{sessionStorage.setItem(SESSION_KEY,'1');}catch(_){/* Optional. */}
}

function initialise(){
  const overlay=document.getElementById('app-intro');
  const launchButton=document.getElementById('app-intro-launch');
  const video=document.getElementById('app-intro-video');
  if(!overlay||!launchButton||!video)return;

  if(sessionStorage.getItem(SESSION_KEY)==='1'){
    removeOverlay(overlay);
    return;
  }

  const clearTimers=()=>{
    if(startTimer)clearTimeout(startTimer);
    if(failsafeTimer)clearTimeout(failsafeTimer);
    startTimer=0;
    failsafeTimer=0;
  };

  const finish=(immediate=false)=>{
    if(finished)return;
    finished=true;
    clearTimers();
    overlay.classList.add('is-fading');
    try{video.pause();video.volume=0;}catch(_){/* Optional. */}
    const delay=immediate||fadeStarted?80:540;
    setTimeout(()=>removeOverlay(overlay),delay);
  };

  const beginPlayback=async()=>{
    if(started||finished)return;
    started=true;
    markSessionPlayed();
    launchButton.disabled=true;
    overlay.classList.add('is-starting');

    if(mediaFailed){
      finish(true);
      return;
    }

    try{
      video.currentTime=0;
      video.defaultMuted=false;
      video.muted=false;
      video.removeAttribute('muted');
      video.volume=1;
    }catch(_){/* Playback attempt below remains authoritative. */}

    startTimer=setTimeout(()=>{
      if(!playbackStarted)finish(true);
    },START_TIMEOUT_MS);
    failsafeTimer=setTimeout(()=>finish(true),PLAYBACK_FAILSAFE_MS);

    try{
      await video.play();
    }catch(_){
      finish(true);
    }
  };

  video.addEventListener('playing',()=>{
    if(finished)return;
    playbackStarted=true;
    if(startTimer)clearTimeout(startTimer);
    startTimer=0;
    overlay.classList.add('is-playing');
  });

  video.addEventListener('timeupdate',()=>{
    if(!Number.isFinite(video.duration)||!video.duration)return;
    const remaining=video.duration-video.currentTime;
    if(remaining<=FADE_SECONDS){
      fadeStarted=true;
      overlay.classList.add('is-fading');
      video.volume=Math.max(0,Math.min(1,remaining/FADE_SECONDS));
    }
  });

  video.addEventListener('ended',()=>finish(false),{once:true});
  video.addEventListener('error',()=>{
    mediaFailed=true;
    if(started)finish(true);
  },{once:true});
  launchButton.addEventListener('click',()=>void beginPlayback());
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();
