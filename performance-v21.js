/* Neural Art V21 — Scenographie immersive pour performance DJ et video.
 * Son charge depuis l'appareil : aucune transmission du fichier a un service.
 * MediaRecorder/Fullscreen sont des ameliorations facultatives.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const bridge = () => window.NeuralArtStage;
  const audio = $('stage-audio');
  const fileInput = $('stage-audio-file');
  const trackLabel = $('stage-track-label');
  const sceneStatus = $('stage-status');
  let active = false, audioURL = null, clipURL = null;
  let context = null, source = null, analyser = null, destination = null;
  let spectrum = null, energy = 0, frame = 0, recorder = null, recordStream = null;
  let videoChunks = [], recordTimer = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function tell(message) {
    if (sceneStatus) sceneStatus.textContent = message;
    const log = $('chat-log');
    if (log) log.textContent = '> ' + message;
  }
  function updatePlayLabels() {
    const label = audio && !audio.paused ? 'Pause musique' : 'Lire musique';
    for (const id of ['stage-play', 'stage-settings-play']) {
      if ($(id)) $(id).textContent = label;
    }
  }
  function updateRecording() {
    const label = recorder && recorder.state !== 'inactive' ? 'Arrêter vidéo' : 'Enregistrer vidéo';
    if ($('stage-record')) $('stage-record').textContent = label;
    if ($('stage-settings-record')) $('stage-settings-record').textContent = label;
  }
  function chooseFile() { if (fileInput) fileInput.click(); }

  function loadAudio(file) {
    if (!file) return;
    if (!(file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name))) {
      tell('Choisis un fichier audio MP3, WAV, M4A ou OGG.');
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      tell('Fichier audio trop lourd pour ce mode mobile (250 Mo maximum).');
      return;
    }
    audio.pause();
    if (audioURL) URL.revokeObjectURL(audioURL);
    audioURL = URL.createObjectURL(file);
    audio.src = audioURL;
    audio.loop = true;
    audio.load();
    trackLabel.textContent = file.name;
    updatePlayLabels();
    tell('Musique chargée localement : ' + file.name + '. Appuie sur Lire musique.');
  }

  function ensureAudioGraph() {
    if (analyser) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    context = new AudioCtx();
    source = context.createMediaElementSource(audio);
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = .78;
    spectrum = new Uint8Array(analyser.frequencyBinCount);
    destination = context.createMediaStreamDestination();
    source.connect(analyser);
    analyser.connect(context.destination);
    analyser.connect(destination);
    return true;
  }

  async function togglePlay() {
    if (!audio.src) { chooseFile(); tell('Sélectionne d’abord une musique locale.'); return; }
    if (!audio.paused) { audio.pause(); updatePlayLabels(); tell('Musique en pause.'); return; }
    try {
      const reactive = ensureAudioGraph();
      const resume = reactive && context.state === 'suspended' ? context.resume() : Promise.resolve();
      // play() est invoqué pendant le geste utilisateur, indispensable sur iOS.
      const play = audio.play();
      await Promise.all([resume, play]);
      updatePlayLabels();
      tell(reactive ? 'Musique en lecture : les formes réagissent au rythme.' :
        'Musique en lecture, sans analyse fréquentielle sur ce navigateur.');
    } catch (error) {
      audio.pause();
      updatePlayLabels();
      tell('Lecture impossible : ' + (error.message || 'format audio non pris en charge'));
    }
  }

  function tick() {
    frame = 0;
    if (!active || document.hidden) return;
    let raw = 0;
    if (analyser && !audio.paused && !audio.ended) {
      analyser.getByteFrequencyData(spectrum);
      const from = 2, to = Math.min(100, spectrum.length);
      let sum = 0;
      for (let i=from;i<to;i++) sum += spectrum[i] * (i < 24 ? 1.45 : .55);
      raw = clamp((sum / (to-from) / 165) * Number($('stage-gain').value), 0, 1);
    }
    energy = energy * .8 + raw * .2;
    if (bridge()) bridge().setEnergy(energy);
    frame = requestAnimationFrame(tick);
  }
  function runLoop() {
    if (frame || !active) return;
    frame = requestAnimationFrame(tick);
  }
  function setImmersive(enabled) {
    active=Boolean(enabled);
    document.body.classList.toggle('stage-immersive',active);
    if (bridge()) { bridge().enable(active); bridge().setOrbit($('stage-orbit').checked); }
    if (active) runLoop();
    else {
      if (frame) cancelAnimationFrame(frame);
      frame=0;energy=0;
      if (bridge()) bridge().setEnergy(0);
    }
    window.dispatchEvent(new Event('resize'));
    const main=$('stage-entry');
    if (main) main.setAttribute('aria-expanded',String(active));
  }
  async function enter() {
    if (!bridge() || !bridge().ready()) { tell('Moteur WebGL non disponible. Vérifie la connexion puis recharge.'); return; }
    setImmersive(true);
    // Safari iPhone ne propose souvent pas de Fullscreen API sur les pages classiques.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen({navigationUI:'hide'}); }
      catch (error) { tell('Mode immersif actif. Le navigateur garde éventuellement ses barres de navigation.'); }
    } else tell('Mode performance : interface masquée, commandes de scène disponibles.');
  }
  async function exit() {
    stopRecord();
    setImmersive(false);
    audio.pause();
    updatePlayLabels();
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch (_) { /* Retour CSS déjà appliqué. */ }
    }
  }
  function makePreset(kind) {
    try {
      if (!bridge() || !bridge().ready()) throw new Error('Moteur 3D indisponible.');
      const count = bridge().create(kind);
      tell(count + ' tracés 3D « ' + kind + ' » créés. Dessine par-dessus ou exporte.');
    } catch (error) { tell('Création impossible : ' + error.message); }
  }
  function snapshot() {
    try {
      if (!bridge() || !bridge().ready()) throw new Error('Moteur 3D indisponible.');
      bridge().snapshot();
    } catch(error) { tell('Capture impossible : '+error.message); }
  }
  function saveVideo() {
    const type = recorder && recorder.mimeType ? recorder.mimeType : 'video/webm';
    const blob = new Blob(videoChunks, {type});
    videoChunks = [];
    if (!blob.size) { tell('L’enregistrement ne contient aucune image exploitable.'); return; }
    if (clipURL) URL.revokeObjectURL(clipURL);
    clipURL = URL.createObjectURL(blob);
    const extension = type.includes('mp4') ? 'mp4' : 'webm';
    const filename = 'Neural-Art-Performance-' + Date.now() + '.' + extension;
    for (const id of ['stage-video-download','stage-settings-download']) {
      const link = $(id);
      if (!link) continue;
      link.href = clipURL;
      link.download = filename;
      link.hidden = false;
      link.textContent = 'Télécharger le clip ' + extension.toUpperCase();
    }
    tell('Clip prêt : utilise « Télécharger le clip ». Le son est inclus si l’enregistreur le prend en charge.');
  }
  function stopRecord() {
    if (recordTimer) clearTimeout(recordTimer);
    recordTimer = 0;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    updateRecording();
  }
  function finishRecording() {
    if (recordStream) recordStream.getTracks().forEach(track => track.stop());
    recordStream = null;
    updateRecording();
    saveVideo();
  }
  function chooseRecorderType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }
  function toggleRecord() {
    if (recorder && recorder.state !== 'inactive') { stopRecord(); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      tell('La capture vidéo n’est pas prise en charge ici. Utilise Image PNG ou l’enregistrement d’écran de ton appareil.');
      return;
    }
    const canvas=$('neural-canvas');
    if (!canvas) { tell('Aucune scène 3D à enregistrer.'); return; }
    try {
      recordStream=canvas.captureStream(30);
      if (destination && !audio.paused) {
        const track = destination.stream.getAudioTracks()[0];
        if (track) recordStream.addTrack(track.clone());
      }
      videoChunks=[];
      const type=chooseRecorderType();
      recorder = new MediaRecorder(recordStream, type ? {mimeType:type,videoBitsPerSecond:4500000} : {videoBitsPerSecond:4500000});
      recorder.ondataavailable = event => { if (event.data && event.data.size) videoChunks.push(event.data); };
      recorder.onstop = finishRecording;
      recorder.onerror = () => tell('Erreur du codec vidéo. La capture peut être incompatible avec ce navigateur.');
      recorder.start(1500);
      recordTimer=setTimeout(stopRecord,120000);
      updateRecording();
      if ($('stage-video-download')) $('stage-video-download').hidden=true;
      tell('Capture vidéo de la scène démarrée (maximum 2 minutes).');
    } catch(error) {
      if (recordStream) recordStream.getTracks().forEach(track => track.stop());
      recordStream=null;recorder=null;
      tell('Vidéo impossible : ' + error.message);
    }
  }

  function init() {
    if (!audio || !fileInput || !bridge()) return;
    for(const id of ['stage-entry','stage-settings-enter']) $(id)?.addEventListener('click',enter);
    $('stage-exit')?.addEventListener('click',exit);
    for(const id of ['stage-play','stage-settings-play']) $(id)?.addEventListener('click',togglePlay);
    for(const id of ['stage-audio-load','stage-dock-file']) $(id)?.addEventListener('click',chooseFile);
    for(const id of ['stage-record','stage-settings-record']) $(id)?.addEventListener('click',toggleRecord);
    for(const id of ['stage-snapshot','stage-settings-snapshot']) $(id)?.addEventListener('click',snapshot);
    $('stage-undo')?.addEventListener('click',() => bridge()?.undo());
    $('stage-orbit')?.addEventListener('change',e => bridge()?.setOrbit(e.target.checked));
    fileInput.addEventListener('change',e => loadAudio(e.target.files[0]));
    audio.addEventListener('pause',updatePlayLabels);
    audio.addEventListener('play',updatePlayLabels);
    audio.addEventListener('error',() => tell('Ce fichier audio ne peut pas être lu par ton navigateur.'));
    document.querySelectorAll('[data-stage-preset]').forEach(button =>
      button.addEventListener('click',()=>makePreset(button.dataset.stagePreset)));
    document.addEventListener('fullscreenchange',() => {
      if (active && !document.fullscreenElement) {
        // Une sortie via Escape quitte également la scène immersive.
        exit();
      }
    });
    document.addEventListener('keydown',event => { if(event.key==='Escape' && active) exit(); });
    document.addEventListener('visibilitychange',()=> {
      if (document.hidden) { if(frame) cancelAnimationFrame(frame); frame=0; }
      else runLoop();
    });
    window.addEventListener('pagehide',()=> {
      stopRecord();audio.pause();
      if (audioURL) URL.revokeObjectURL(audioURL);
      if (clipURL) URL.revokeObjectURL(clipURL);
      if (context) context.close().catch(()=>{});
    });
    const supported=!!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
    for(const id of ['stage-record','stage-settings-record'])
      if ($(id) && !supported) $(id).title='Non disponible : utilise une capture d’écran vidéo de ton appareil.';
    updatePlayLabels();updateRecording();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
