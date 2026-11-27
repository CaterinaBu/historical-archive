export function createArchiveAudio(files) {
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  const buffers=new Map();
  const effects=new Set();
  let context;
  let musicGain;
  let effectsGain;
  let background;
  let soundtrackStart=0;
  let nextCue=0;
  let options;
  const effectsGainPerPercent=.002;

  function musicLevel(percent) {
    const quietPoint=35;
    const quietGain=quietPoint*.0045;
    const maximumGain=.8;
    if (percent<=quietPoint) return percent*.0045;
    return quietGain+(maximumGain-quietGain)*(percent-quietPoint)/(100-quietPoint);
  }

  function crossfadeLoop(buffer,loop) {
    const start=Math.round(loop.start*buffer.sampleRate);
    const end=Math.round(loop.end*buffer.sampleRate);
    const samples=Math.round(loop.crossfade*buffer.sampleRate);
    // Blend the lead-in to the first beat into the last samples before the wrap.
    for (let channel=0;channel<buffer.numberOfChannels;channel++) {
      const pcm=buffer.getChannelData(channel);
      for (let i=0;i<samples;i++) {
        const mix=.5-.5*Math.cos(Math.PI*i/(samples-1));
        pcm[end-samples+i]=pcm[end-samples+i]*(1-mix)+pcm[start-samples+i]*mix;
      }
    }
  }

  function stopEffects() {
    for (const source of effects) source.stop();
    effects.clear();
    nextCue=0;
  }

  function update(settings=options) {
    options=settings;
    if (!context || !options) return;
    const musicEnabled=options.audioConfigured&&options.music;
    musicGain.gain.setTargetAtTime(musicLevel(options.musicVolume),context.currentTime,.03);
    effectsGain.gain.setTargetAtTime(options.effectsVolume*effectsGainPerPercent,context.currentTime,.02);
    if (!options.effects) stopEffects();
    if (!musicEnabled && background) {
      background.stop();
      background=null;
    }
    if (document.hidden || context.state!=='running' || !musicEnabled || background || !buffers.has('background')) return;
    background=context.createBufferSource();
    background.buffer=buffers.get('background');
    background.loop=true;
    const {start,end}=files.background.loop;
    background.loopStart=Math.round(start*background.buffer.sampleRate)/background.buffer.sampleRate;
    background.loopEnd=Math.round(end*background.buffer.sampleRate)/background.buffer.sampleRate;
    background.connect(musicGain);
    soundtrackStart=context.currentTime;
    background.start(soundtrackStart,background.loopStart);
  }

  function unlock(settings) {
    options=settings;
    if (!AudioContextClass || document.hidden || !options?.audioConfigured || (!options.music && !options.effects)) return;
    if (!context) {
      context=new AudioContextClass();
      musicGain=context.createGain();
      effectsGain=context.createGain();
      musicGain.gain.value=musicLevel(options.musicVolume);
      effectsGain.gain.value=options.effectsVolume*effectsGainPerPercent;
      musicGain.connect(context.destination);
      effectsGain.connect(context.destination);
      for (const [kind,file] of Object.entries(files)) {
        fetch(file.src).then(response=>response.arrayBuffer()).then(bytes=>context.decodeAudioData(bytes))
          .then(buffer=>{
            if (file.loop) crossfadeLoop(buffer,file.loop);
            buffers.set(kind,buffer);
            update();
          }).catch(()=>{});
      }
    }
    if (context.state==='running') update();
    else context.resume().then(()=>update()).catch(()=>{});
  }

  function play(kind) {
    if (!context || context.state!=='running' || document.hidden || !options.audioConfigured || !options.effects || !buffers.has(kind)) return;
    const now=context.currentTime;
    let at=background&&kind==='event'?Math.max(now,nextCue):now;
    if (background) {
      const {cueInterval,cuePhase}=files.background.loop;
      const length=background.loopEnd-background.loopStart;
      const position=(at-soundtrackStart)%length;
      const next=cuePhase+Math.max(0,Math.ceil((position-cuePhase)/cueInterval))*cueInterval;
      at+=next<length?next-position:length-position+cuePhase;
    }
    const source=context.createBufferSource();
    source.buffer=buffers.get(kind);
    source.connect(effectsGain);
    effects.add(source);
    source.onended=()=>effects.delete(source);
    source.start(at);
    nextCue=at+.16;
  }

  function visibility() {
    if (!context) return;
    if (document.hidden) {
      stopEffects();
      context.suspend().catch(()=>{});
    } else {
      unlock(options);
    }
  }

  return {update,unlock,play,visibility};
}
