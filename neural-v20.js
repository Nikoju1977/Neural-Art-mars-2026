/* Neural Art V20 — Studio Niko — moteur de peinture gestuelle 3D.
 * Aucune cle IA necessaire pour dessiner. Three.js et MediaPipe sont charges par index.html.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = (msg) => { const el = $('chat-log'); if (el) el.textContent = '> ' + msg; };
  const status = (msg) => { if ($('status')) $('status').textContent = 'STATUS: ' + msg; };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const palette = { cyan: '#00f2ff', rose: '#ff3ad8', rouge: '#ff3b62',
    bleu: '#418dff', vert: '#41ffae', jaune: '#ffe066', violet: '#b27aff',
    orange: '#ff9b43', blanc: '#ffffff', or: '#ffc857', magenta: '#ff00aa' };
  let scene, camera, renderer, background, painting, hands, video;
  let drawing = null, cameraStream = null, cameraEnabled = false, processing = false;
  let brushMode = 'neon', brushColor = palette.cyan, brushSize = 0.7;
  let pointerDown = false, tracking = false, recognition = null, voiceEnabled = false;
  let mistralKey = '', strokes = [], rafCamera = 0;
  const maxStrokes = 160, maxPointsPerStroke = 140;

  function setStatusHands(text) { if ($('hand-status')) $('hand-status').textContent = 'HANDS: ' + text; }
  function updateCount() { if ($('stroke-count')) $('stroke-count').textContent = 'STROKES: ' + strokes.length; }
  function updateColor(color) {
    brushColor = color;
    if ($('brush-color-text')) { $('brush-color-text').textContent = color.toUpperCase(); $('brush-color-text').style.color = color; }
    if ($('brush-color-dot')) { $('brush-color-dot').style.backgroundColor = color; $('brush-color-dot').style.color = color; }
    if ($('brush-color')) $('brush-color').value = color;
  }
  function safeDispose(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
  }
  function makeMaterial(mode, color) {
    if (mode === 'sculpture') return new THREE.MeshStandardMaterial({
      color, metalness: 0.25, roughness: 0.28
    });
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: mode === 'filament' ? 0.9 : 0.96,
      blending: mode === 'neon' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: mode !== 'neon'
    });
  }
  function normalizedPoint(x, y) {
    const height = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return new THREE.Vector3((clamp(x, 0, 1) - .5) * height * camera.aspect,
      (.5 - clamp(y, 0, 1)) * height, 0);
  }
  function startStroke(x, y) {
    if (!painting || strokes.length >= maxStrokes) {
      if (strokes.length >= maxStrokes) ui('Limite de tracés atteinte : exporte, annule ou efface.');
      return;
    }
    const point = normalizedPoint(x, y);
    const material = makeMaterial(brushMode, brushColor);
    const geometry = new THREE.SphereGeometry(Math.max(.06, brushSize * .28), 8, 6);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(point);
    painting.add(mesh);
    drawing = { mesh, points: [point], mode: brushMode, size: brushSize, lastRender: 0 };
    strokes.push(drawing);
    updateCount();
  }
  function refreshStroke(stroke) {
    if (stroke.points.length < 2) return;
    const points = stroke.points;
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const radius = stroke.mode === 'filament' ? stroke.size * .1 :
      stroke.mode === 'sculpture' ? stroke.size * .43 : stroke.size * .27;
    const geo = new THREE.TubeGeometry(curve, clamp(points.length * 2, 6, 280),
      Math.max(.03, radius), stroke.mode === 'sculpture' ? 9 : 6, false);
    stroke.mesh.geometry.dispose();
    stroke.mesh.geometry = geo;
    stroke.mesh.position.set(0, 0, 0);
  }
  function moveStroke(x, y) {
    if (!drawing) { startStroke(x, y); return; }
    const point = normalizedPoint(x, y);
    const old = drawing.points[drawing.points.length - 1];
    const delta = point.distanceTo(old);
    if (delta < Math.max(.13, brushSize * .12)) return;
    if (delta > 18) { endStroke(); startStroke(x, y); return; }
    drawing.points.push(point);
    if (drawing.points.length >= maxPointsPerStroke) {
      refreshStroke(drawing); endStroke(); return;
    }
    const now = performance.now();
    if (now - drawing.lastRender > 25) { refreshStroke(drawing); drawing.lastRender = now; }
  }
  function endStroke() {
    if (!drawing) return;
    refreshStroke(drawing);
    drawing = null;
  }
  function undo() {
    endStroke();
    const stroke = strokes.pop();
    if (stroke) { painting.remove(stroke.mesh); safeDispose(stroke.mesh); }
    updateCount();
    ui(stroke ? 'Dernier tracé annulé.' : 'Aucun tracé à annuler.');
  }
  function clear() {
    endStroke();
    for (const stroke of strokes) { painting.remove(stroke.mesh); safeDispose(stroke.mesh); }
    strokes = [];
    updateCount();
    ui('Atelier effacé.');
  }
  function saveBlob(blob, filename) {
    if (!blob) { ui('Export impossible.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportPNG() {
    try {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((blob) => {
        saveBlob(blob, 'Neural-Art-' + Date.now() + '.png');
        if (blob) ui('Image PNG enregistrée.');
      }, 'image/png');
    } catch (e) { ui('Erreur PNG : ' + e.message); }
  }
  function exportGLTF() {
    endStroke();
    if (!strokes.length) { ui('Dessine avant de lancer un export 3D.'); return; }
    if (!THREE.GLTFExporter) { ui('Module GLTF non chargé : connexion requise.'); return; }
    try {
      const exporter = new THREE.GLTFExporter();
      exporter.parse(painting, (output) => {
        const json = JSON.stringify(output);
        saveBlob(new Blob([json], { type: 'model/gltf+json' }),
          'Neural-Art-' + Date.now() + '.gltf');
        ui('Scène GLTF exportée (' + strokes.length + ' tracés).');
      }, { binary: false });
    } catch (e) { ui('Erreur GLTF : ' + e.message); }
  }
  function onResize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  function renderFrame(time) {
    if (background) background.rotation.y = Math.sin(time * .00007) * .22;
    if (renderer.xr.isPresenting) {
      painting.scale.setScalar(.012);
      painting.position.set(0, 0, -1.3);
      background.visible = false;
    } else {
      painting.scale.setScalar(1);
      painting.position.set(0, 0, 0);
      background.visible = true;
    }
    renderer.render(scene, camera);
  }
  function setupThree() {
    if (typeof THREE === 'undefined') { status('THREE.JS ABSENT'); ui('Impossible de charger Three.js. Vérifie Internet et actualise.'); return false; }
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x01060b);
      camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, .05, 1000);
      camera.position.z = 50;
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.domElement.id = 'neural-canvas';
      renderer.domElement.setAttribute('aria-label', 'Espace de dessin 3D');
      document.body.insertBefore(renderer.domElement, $('app'));
      const positions = new Float32Array(2100 * 3);
      for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - .5) * 180;
      const stars = new THREE.BufferGeometry();
      stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      background = new THREE.Points(stars, new THREE.PointsMaterial({
        color: 0x2f9fae, size: .19, transparent: true, opacity: .45, depthWrite: false
      }));
      scene.add(background);
      scene.add(new THREE.AmbientLight(0xffffff, .8));
      const light = new THREE.DirectionalLight(0xa5f3ff, 1.5);
      light.position.set(4, 8, 12); scene.add(light);
      painting = new THREE.Group(); scene.add(painting);
      renderer.setAnimationLoop(renderFrame);
      window.addEventListener('resize', onResize, { passive: true });
      status('READY');
      try {
        if (typeof ARButton !== 'undefined' && navigator.xr) {
          const button = ARButton.createButton(renderer, {
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
          });
          button.textContent = 'MODE AR';
          $('ar-container').appendChild(button);
        }
      } catch (e) { console.warn('AR non disponible', e); }
      return true;
    } catch (e) {
      status('WEBGL ERROR'); ui('WebGL indisponible : ' + e.message);
      return false;
    }
  }
  function onHandResults(result) {
    if (!cameraEnabled || renderer.xr.isPresenting || pointerDown) return;
    const found = result.multiHandLandmarks && result.multiHandLandmarks[0];
    tracking = Boolean(found);
    setStatusHands(found ? 'ACTIVE' : 'SEARCHING');
    if (!found) { endStroke(); return; }
    const index = found[8], thumb = found[4];
    const distance = Math.hypot(index.x - thumb.x, index.y - thumb.y);
    if (distance < .058) moveStroke(1 - index.x, index.y);
    else endStroke();
  }
  async function trackCamera() {
    if (!cameraEnabled || processing || !hands || !video) return;
    if (video.readyState < 2) { rafCamera = requestAnimationFrame(trackCamera); return; }
    processing = true;
    try { await hands.send({ image: video }); }
    catch (e) { console.warn('MediaPipe error', e); setStatusHands('ERROR'); }
    finally {
      processing = false;
      if (cameraEnabled) rafCamera = requestAnimationFrame(trackCamera);
    }
  }
  function stopCamera() {
    cameraEnabled = false;
    cancelAnimationFrame(rafCamera);
    if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
    if (video) { video.pause(); video.srcObject = null; }
    endStroke(); tracking = false;
    setStatusHands('OFFLINE');
    $('camera-btn').textContent = 'Activer la caméra';
    status('READY (CAMERA OFF)');
  }
  async function toggleCamera() {
    if (cameraEnabled) { stopCamera(); ui('Caméra arrêtée.'); return; }
    if (typeof Hands === 'undefined') { ui('MediaPipe non chargé. Vérifie Internet.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ui('Caméra indisponible sur ce navigateur.'); return; }
    try {
      status('STARTING CAMERA');
      video = document.querySelector('.input_video');
      video.muted = true; video.playsInline = true;
      if (!hands) {
        hands = new Hands({ locateFile: (file) =>
          'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1633559310/' + file });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: .6, minTrackingConfidence: .6 });
        hands.onResults(onHandResults);
      }
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      video.srcObject = cameraStream;
      await video.play();
      cameraEnabled = true; tracking = false;
      $('camera-btn').textContent = 'Arrêter la caméra';
      status('CAMERA READY');
      ui('Rapproche le pouce et l’index pour peindre. Écarte-les pour arrêter le tracé.');
      trackCamera();
    } catch (e) {
      stopCamera();
      ui('Accès caméra impossible : ' + (e.name === 'NotAllowedError' ? 'autorisation refusée' : e.message));
    }
  }
  function installPointer() {
    const layer = $('interaction-layer');
    const coords = (e) => [e.clientX / innerWidth, e.clientY / innerHeight];
    layer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); pointerDown = true;
      layer.setPointerCapture(e.pointerId);
      const [x,y] = coords(e); endStroke(); startStroke(x,y);
    });
    layer.addEventListener('pointermove', (e) => {
      if (!pointerDown) return;
      e.preventDefault(); const [x,y] = coords(e); moveStroke(x,y);
    });
    const finish = () => { pointerDown = false; endStroke(); };
    layer.addEventListener('pointerup', finish);
    layer.addEventListener('pointercancel', finish);
    layer.addEventListener('lostpointercapture', finish);
  }
  async function askMistral(prompt) {
    if (!mistralKey) { ui('La création est gratuite. Pour discuter avec Mistral, saisis ta clé API dans les options.'); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);
    ui('Mistral réfléchit…');
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mistralKey },
        body: JSON.stringify({ model: 'mistral-small-latest', messages: [
          { role: 'system', content: 'Tu accompagnes un artiste dans un atelier de peinture gestuelle en 3D. Réponds en français, brièvement, avec des conseils créatifs concrets.' },
          { role: 'user', content: prompt }
        ] })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json();
      const reply = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
      ui(reply || 'Réponse vide.');
    } catch (e) { ui('Mistral indisponible : ' + e.message); }
    finally { clearTimeout(timeout); }
  }
  function commandVoice(sentence) {
    const text = sentence.toLowerCase();
    for (const name of Object.keys(palette)) {
      if (text.includes(name)) { updateColor(palette[name]); ui('Couleur : ' + name); return; }
    }
    if (text.includes('efface')) { clear(); return; }
    if (text.includes('annule')) { undo(); return; }
    if (text.includes('exporte') || text.includes('export')) { exportGLTF(); return; }
    if (text.includes('photo') || text.includes('capture')) { exportPNG(); return; }
    askMistral(sentence);
  }
  function setupVoice() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      $('voice-btn').disabled = true;
      $('voice-btn').title = 'Reconnaissance vocale non compatible avec ce navigateur';
      return;
    }
    recognition = new Speech(); recognition.lang = 'fr-FR';
    recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (result && result[0]) commandVoice(result[0].transcript);
    };
    recognition.onerror = (e) => { voiceEnabled = false; $('voice-btn').textContent = 'Activer la voix'; ui('Micro : ' + e.error); };
    recognition.onend = () => { voiceEnabled = false; $('voice-btn').textContent = 'Activer la voix'; };
    $('voice-btn').addEventListener('click', () => {
      if (voiceEnabled) { voiceEnabled = false; recognition.stop(); return; }
      try { recognition.start(); voiceEnabled = true; $('voice-btn').textContent = 'Arrêter la voix'; }
      catch (e) { ui('Commande vocale indisponible : ' + e.message); }
    });
  }
  function bindUI() {
    $('camera-btn').addEventListener('click', toggleCamera);
    $('clear-paint-btn').addEventListener('click', clear);
    $('undo-btn').addEventListener('click', undo);
    $('export-btn').addEventListener('click', exportGLTF);
    $('export-png-btn').addEventListener('click', exportPNG);
    $('brush-color').addEventListener('input', (e) => updateColor(e.target.value));
    $('brush-size').addEventListener('input', (e) => {
      brushSize = clamp(Number(e.target.value) || .7, .1, 2.5);
      $('size-value').textContent = brushSize.toFixed(1);
    });
    $('brush-mode').addEventListener('change', (e) => { brushMode = e.target.value; ui('Pinceau : ' + e.target.selectedOptions[0].text); });
    $('save-key-btn').addEventListener('click', () => {
      mistralKey = $('mistral-key').value.trim();
      $('mistral-key').value = '';
      ui(mistralKey ? 'Clé IA activée pour cet onglet uniquement.' : 'Assistant IA désactivé.');
    });
    $('reset-key-btn').addEventListener('click', () => {
      mistralKey = '';
      try { localStorage.removeItem('niko_mistral_key'); } catch (_) { /* pas de stockage */ }
      ui('Clé IA oubliée pour cette session.');
    });
    $('ai-send').addEventListener('click', () => {
      const input = $('ai-prompt');
      if (input.value.trim()) { askMistral(input.value.trim()); input.value = ''; }
    });
    $('ai-prompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('ai-send').click(); } });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        e.preventDefault(); undo();
      }
    });
    window.addEventListener('pagehide', stopCamera);
    updateColor(brushColor);
    updateCount();
    setupVoice();
    installPointer();
  }
  function init() {
    if (!setupThree()) return;
    bindUI();
    try { localStorage.removeItem('niko_mistral_key'); } catch (_) { /* pas de stockage */ }
    ui('Atelier prêt. Dessine au doigt ou à la souris. La caméra et l’IA sont facultatives.');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js')
      .catch((e) => console.warn('Service worker indisponible', e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();