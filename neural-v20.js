/* Neural Art V20.5 — Studio Niko — moteur de peinture gestuelle 3D.
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
  let touchTool='draw';
  const multiStroke=new Map(), history=[];
  const handMotion=[0,1].map(()=>({x:.5,y:.5,initialized:false,lastTs:0,pinched:false,pinchFrames:0,releaseFrames:0,missed:0,palmX:null,palmY:null}));
  let mistralKey = '', strokes = [], rafCamera = 0;
  const maxStrokes = 160, maxPointsPerStroke = 140;
  const motion = { x: 0.5, y: 0.5, lastX: 0.5, lastY: 0.5, lastTs: 0,
    initialized: false, pinched: false, pinchFrames: 0, releaseFrames: 0,
    missedFrames: 0, palmX: null, palmY: null, lastInference: 0 };
  let mirrorCamera = true, trackingSensitivity = 1, motionSmoothing = 0.53;
  let gestureRotate = false, cameraStarting = false, cameraErrors = 0;
  let binCloud = null, importedModel = null, downloadURL = null;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let lastFrameTime = 0;
  // Le rendu de performance complète le dessin ; aucune génération n'est présentée comme IA.
  const stage = { enabled: false, energy: 0, orbit: true, lastTime: 0 };
  let handAssetsBase = '';
  const HAND_SOURCES = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/',
    'https://unpkg.com/@mediapipe/hands@0.4.1675469240/'
  ];
  async function ensureHandsLibrary() {
    if (typeof Hands === 'function' && handAssetsBase) return true;
    for (const base of HAND_SOURCES) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          let done = false;
          const complete = (err) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (err) { script.remove(); reject(err); }
            else resolve();
          };
          const timer = setTimeout(() => complete(new Error('chargement trop long')), 10000);
          script.async = true;
          script.src = base + 'hands.js';
          script.onload = () => typeof Hands === 'function'
            ? complete() : complete(new Error('moteur MediaPipe absent'));
          script.onerror = () => complete(new Error('CDN inaccessible'));
          document.head.appendChild(script);
        });
        handAssetsBase = base;
        return true;
      } catch (e) { console.warn('MediaPipe indisponible :', base, e.message); }
    }
    return false;
  }
  function drawPreviewLandmarks(allHands) {
    const canvas=$('preview-landmarks');if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const hands=Array.isArray(allHands) ?
      (allHands.length===21 && !Array.isArray(allHands[0])?[allHands]:allHands) : [];
    const chains=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],
      [9,13,14,15,16],[13,17,18,19,20],[0,17]];
    hands.slice(0,2).forEach((points,handIndex)=>{
      if(!Array.isArray(points))return;
      ctx.strokeStyle=handIndex?'#ffd16d':'#00efff';
      ctx.lineWidth=3;ctx.lineCap='round';
      for(const chain of chains){
        ctx.beginPath();
        chain.forEach((i,j)=>{
          const p=points[i];if(!p)return;
          if(j===0)ctx.moveTo(p.x*w,p.y*h);
          else ctx.lineTo(p.x*w,p.y*h);
        });
        ctx.stroke();
      }
      for(let i=0;i<points.length;i++){
        const p=points[i];if(!p)continue;
        ctx.beginPath();ctx.arc(p.x*w,p.y*h,(i===4||i===8)?6:3.2,0,2*Math.PI);
        ctx.fillStyle=i===4||i===8?(handIndex?'#ffe69a':'#ff4ccf'):'#f7ffff';
        ctx.fill();
      }
    });
  }
  function describeGesture(message) {
    const el = $('gesture-indicator');
    if (el && el.textContent !== message) el.textContent = message;
    const caption = $('preview-caption');
    if (caption && caption.textContent !== message) caption.textContent = message;
  }
  function hslToHex(h,s,l) {
    const f = (n) => {
      const k = (n + h/30) % 12;
      const a = s * Math.min(l, 1-l);
      return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');
    };
    return '#' + f(0) + f(8) + f(4);
  }
  const groups = [
    { name:'Néon', colors:Array.from({length:48}, (_,i) => hslToHex((i%24)*15, 1, i<24 ? .55 : .68)) },
    { name:'Spectre', colors:Array.from({length:72}, (_,i) => hslToHex((i%24)*15, .92, [.38,.54,.70][Math.floor(i/24)])) },
    { name:'Pastel', colors:Array.from({length:48}, (_,i) => hslToHex((i%24)*15, .68, i<24 ? .78 : .88)) },
    { name:'Nature', colors:Array.from({length:48}, (_,i) => hslToHex((i%24)*15, i<24 ? .42 : .62, i<24 ? .34 : .56)) },
    { name:'Métal', colors:['#fff4ba','#ffe27a','#ffca3a','#c99b39','#8c691f','#f9f1dd',
      '#dedfe4','#babfc9','#818b99','#606874','#f7c9a1','#e6a574',
      '#c57b49','#854d32','#b97b71','#8b5558','#d5dbe1','#a1b4ba',
      '#779eae','#526776','#b8a6d4','#86749c','#cfddbb','#91a978'] },
    { name:'Gris', colors:Array.from({length:24}, (_,i) => {
      const v=Math.round(i*255/23).toString(16).padStart(2,'0');return '#'+v+v+v;
    }) },
    { name:'Peau', colors:['#fff2e3','#fbe2c7','#f9d4ae','#efd1b8','#eac5a5','#dcb08a',
      '#c69a75','#bb8865','#a97550','#956946','#875638','#6e4329','#55331f',
      '#472713','#d7a18c','#c68c77','#b16e55','#91523e','#774633','#583222'] }
  ];
  function createColorChip(color, label) {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'color-chip';
    chip.style.setProperty('--swatch', color);
    chip.dataset.color = color.toLowerCase();
    chip.title = label + ' : ' + color.toUpperCase();
    chip.setAttribute('aria-label', chip.title);
    chip.addEventListener('click', () => updateColor(color));
    return chip;
  }
  function renderColorGroup(group) {
    const parent=$('palette-swatches'), tabs=$('palette-tabs');
    if (!parent || !tabs) return;
    parent.replaceChildren();
    group.colors.forEach((color,i) => parent.append(createColorChip(color, group.name + ' ' + (i+1))));
    for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.group === group.name));
    syncColorChips();
  }
  function syncColorChips() {
    for (const chip of document.querySelectorAll('.color-chip')) {
      chip.classList.toggle('active', chip.dataset.color === brushColor.toLowerCase());
    }
  }
  function setupPalette() {
    const tabs=$('palette-tabs'), quick=$('quick-palette');
    if (!tabs || !quick) return;
    for (const group of groups) {
      const button=document.createElement('button');
      button.type='button'; button.textContent=group.name; button.dataset.group=group.name;
      button.setAttribute('aria-pressed','false');
      button.addEventListener('click', () => renderColorGroup(group));
      tabs.append(button);
    }
    const quickColors = ['#00f2ff','#ff3ad8','#ff0000','#ff9b43','#ffe066',
      '#56ff68','#ffffff','#0f56ff','#a86bff','#ffbdde','#8f643d','#141414'];
    quickColors.forEach((color,i)=>quick.append(createColorChip(color,'Rapide '+(i+1))));
    renderColorGroup(groups[0]);
  }
  function drawDemo() {
    if (!painting) { ui('Le moteur 3D est indisponible.'); return; }
    endStroke();
    const previous=brushColor, previousMode=brushMode, previousSize=brushSize;
    brushMode='neon';brushSize=.8;
    updateColor('#00f2ff');
    const N=122;
    for (let i=0;i<N;i++) {
      const t=i/(N-1), a=t*Math.PI*5.5, radius=.04+t*.23;
      const x=.5+Math.cos(a)*radius, y=.51+Math.sin(a)*radius*.77;
      if (i===0) startStroke(x,y); else moveStroke(x,y);
    }
    endStroke();
    updateColor('#ff3ad8');
    for (let i=0;i<=75;i++) {
      const t=i/75*Math.PI*2;
      const r=(i%2===0 ? .11 : .105);
      const x=.5+Math.cos(t)*r, y=.51+Math.sin(t)*r;
      if (i===0) startStroke(x,y); else moveStroke(x,y);
    }
    endStroke();
    brushMode=previousMode;brushSize=previousSize;updateColor(previous);
    ui('Test réussi : formes 3D créées. Déplace ton doigt sur la zone libre pour dessiner.');
  }
  function resetMotion() {
    motion.initialized = false; motion.pinched = false;
    motion.pinchFrames = 0; motion.releaseFrames = 0;
    motion.missedFrames = 0; motion.lastTs = 0;
    motion.palmX = null; motion.palmY = null;
    for(const index of [0,1]){
      const state=handMotion[index];
      Object.assign(state,{x:.5,y:.5,initialized:false,lastTs:0,pinched:false,pinchFrames:0,releaseFrames:0,missed:0,palmX:null,palmY:null});
      useStroke('hand-'+index,'end');
      const cursor=$(index ? 'hand-cursor-2' : 'hand-cursor');
      if(cursor)cursor.hidden=true;
    }
  }
  function showHandCursor(x, y, drawing, index=0) {
    const cursor = $(index ? 'hand-cursor-2' : 'hand-cursor');
    if (!cursor) return;
    cursor.hidden = false;
    cursor.style.left = (x * 100) + '%';
    cursor.style.top = (y * 100) + '%';
    cursor.classList.toggle('drawing', drawing);
  }

  function setStatusHands(text) { if ($('hand-status')) $('hand-status').textContent = 'HANDS: ' + text; }
  function updateCount() {
    if ($('stroke-count')) $('stroke-count').textContent = 'STROKES: ' + strokes.length;
    document.body.classList.toggle('has-art', strokes.length > 0);
  }
  function updateColor(color) {
    brushColor = color;
    if ($('brush-color-text')) { $('brush-color-text').textContent = color.toUpperCase(); $('brush-color-text').style.color = color; }
    if ($('brush-color-dot')) { $('brush-color-dot').style.backgroundColor = color; $('brush-color-dot').style.color = color; }
    if ($('brush-color')) $('brush-color').value = color;
    syncColorChips();
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
    const world = new THREE.Vector3((clamp(x, 0, 1) - .5) * height * camera.aspect,
      (.5 - clamp(y, 0, 1)) * height, 0);
    // Convert screen-space input to sculpture-local coordinates even when the
    // user has rotated the artwork; subsequent strokes still follow the finger.
    painting.updateMatrixWorld(true);
    return painting.worldToLocal(world);
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
    history.push({type:'draw',stroke:drawing});
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
  function useStroke(key,action,x,y) {
    const saved=drawing;
    drawing=multiStroke.get(key)||null;
    if(action==='end')endStroke();
    else if(!drawing)startStroke(x,y);
    else moveStroke(x,y);
    if(drawing)multiStroke.set(key,drawing);
    else multiStroke.delete(key);
    drawing=saved;
  }
  function finishAllStrokes(){
    for(const key of [...multiStroke.keys()])useStroke(key,'end');
    endStroke();
  }
  function undo() {
    finishAllStrokes();
    const action=history.pop();
    if(action?.type==='draw') {
      const index=strokes.indexOf(action.stroke);
      if(index>=0){strokes.splice(index,1);painting.remove(action.stroke.mesh);safeDispose(action.stroke.mesh);}
    }else if(action?.type==='erase'){
      if(!strokes.includes(action.stroke)){
        strokes.splice(Math.min(action.index,strokes.length),0,action.stroke);
        painting.add(action.stroke.mesh);
      }
    }else if(strokes.length){
      const stroke=strokes.pop();painting.remove(stroke.mesh);safeDispose(stroke.mesh);
    }
    updateCount();
    ui(action?'Action annulée.':'Aucune action à annuler.');
  }
  function pointToSegment(x,y,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/Math.max(1e-9,dx*dx+dy*dy),0,1);
    return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy));
  }
  function eraseNearestStroke(x,y){
    if(!renderer||!camera||!painting||!strokes.length)return false;
    painting.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const tmp=new THREE.Vector3(),a={x:0,y:0},b={x:0,y:0};
    let closest=null,best=Math.max(18,brushSize*10),index=-1;
    const width=Math.max(1,innerWidth),height=Math.max(1,innerHeight);
    for(let k=0;k<strokes.length;k++){
      const stroke=strokes[k];let previous=null;
      const step=Math.max(1,Math.floor(stroke.points.length/80));
      for(let i=0;i<stroke.points.length;i+=step){
        tmp.copy(stroke.points[i]).applyMatrix4(painting.matrixWorld).project(camera);
        b.x=(tmp.x+1)*.5;b.y=(1-tmp.y)*.5;
        const dist=previous?pointToSegment(x,y,previous,b):Math.hypot(x-b.x,y-b.y);
        const pixelDistance=dist*Math.min(width,height);
        if(pixelDistance<best){best=pixelDistance;closest=stroke;index=k;}
        previous={x:b.x,y:b.y};
      }
    }
    if(!closest)return false;
    finishAllStrokes();
    painting.remove(closest.mesh);
    strokes.splice(index,1);
    // Garde le maillage en mémoire jusqu’à Annuler ; il est libéré à l’effacement complet.
    history.push({type:'erase',stroke:closest,index});
    updateCount();
    ui('Trait effacé. Appuie sur Annuler pour le restaurer.');
    return true;
  }
  function setTouchTool(value){
    if(!['draw','erase'].includes(value))return;
    finishAllStrokes();
    touchTool=value;
    if(window.NeuralArtStrings?.active())window.NeuralArtStrings.show(false);
    document.body.classList.toggle('eraser-active',value==='erase');
    for(const button of document.querySelectorAll('[data-studio-tool]')){
      const selected=button.dataset.studioTool===value;
      button.setAttribute('aria-pressed',String(selected));
    }
    if($('mode-status'))$('mode-status').textContent=value==='erase'?'MODE: GOMME':'MODE: DESSIN';
    ui(value==='erase'?'Gomme active : touche un trait pour le retirer. Annuler le restaure.':'Pinceau actif : dessine au doigt.');
  }
  function clear() {
    removeBinCloud();
    removeImportedModel();
    finishAllStrokes();
    const disposed=new Set();
    for(const entry of history)if(entry.type==='erase' && !disposed.has(entry.stroke)){
      safeDispose(entry.stroke.mesh);disposed.add(entry.stroke);
    }
    history.length=0;
    for (const stroke of strokes) {
      painting.remove(stroke.mesh);
      if(!disposed.has(stroke)){safeDispose(stroke.mesh);disposed.add(stroke);}
    }
    strokes = [];
    updateCount();
    ui('Atelier effacé.');
  }
  function saveBlob(blob, filename) {
    if (!blob) { ui('Export impossible.'); return; }
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = URL.createObjectURL(blob);
    const permanentLink = $('download-link');
    if (permanentLink) {
      permanentLink.href = downloadURL;
      permanentLink.download = filename;
      permanentLink.textContent = 'Enregistrer : ' + filename;
      permanentLink.classList.add('visible');
    }
    const a = document.createElement('a');
    a.href = downloadURL; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    ui(isIOS ? 'Export prêt : appuie sur « Enregistrer » pour sauvegarder depuis Safari.' :
      'Export prêt. Si le téléchargement ne démarre pas, utilise le lien Enregistrer.');
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
  async function ensureGLTFExporter() {
    if (typeof THREE !== 'undefined' && THREE.GLTFExporter) return;
    for(const url of [
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js',
      'https://unpkg.com/three@0.128.0/examples/js/exporters/GLTFExporter.js'
    ]) {
      try {
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          const timer=setTimeout(()=>reject(new Error('délai dépassé')),8500);
          script.onload=()=>{clearTimeout(timer);THREE.GLTFExporter?resolve():reject(new Error('module absent'));};
          script.onerror=()=>{clearTimeout(timer);reject(new Error('réseau inaccessible'));};
          script.src=url;script.async=true;document.head.append(script);
        });
        if(THREE.GLTFExporter) return;
      }catch(e){console.warn('Export GLTF : module indisponible',url,e.message);}
    }
    throw new Error('Chargeur d’export 3D inaccessible. Connecte-toi à Internet et réessaie.');
  }
  async function exportGLTF() {
    endStroke();
    if (!strokes.length) { ui('Dessine avant de lancer un export 3D.'); return; }
    try {
      await ensureGLTFExporter();
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
    if (!renderer || !scene || !camera) return;
    // Safari iPhone : rendu 3D à 30 i/s maximum pour limiter température et batterie.
    if (isIOS && !renderer.xr.isPresenting && time-lastFrameTime<32) return;
    lastFrameTime=time;
    if (background) {
      background.rotation.y = Math.sin(time * .00007) * .22;
      background.material.opacity = stage.enabled ? Math.min(.9, .45 + stage.energy * .35) : .45;
      background.material.size = stage.enabled ? .19 + stage.energy * .2 : .19;
    }
    if (stage.enabled && stage.orbit && !pointerDown && !drawing && !renderer.xr.isPresenting) {
      const dt = Math.min(60, Math.max(0, time - (stage.lastTime || time)));
      painting.rotation.y += dt * .00016 * (1 + stage.energy * 1.8);
    }
    stage.lastTime = time;
    if (renderer.xr.isPresenting) {
      painting.scale.setScalar(.012);
      painting.position.set(0, 0, -1.3);
      background.visible = false;
    } else {
      painting.scale.setScalar(stage.enabled ? 1 + stage.energy * .07 : 1);
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
      renderer = new THREE.WebGLRenderer({
        antialias: !isIOS, preserveDrawingBuffer: true,
        powerPreference: isIOS ? 'default' : 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isIOS ? 1.25 : 1.6));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.domElement.id = 'neural-canvas';
      renderer.domElement.setAttribute('aria-label', 'Espace de dessin 3D');
      document.body.insertBefore(renderer.domElement, $('app'));
      const positions = new Float32Array((isIOS ? 800 : 2100) * 3);
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
          button.style.position = 'static';
          button.style.display = 'block';
          button.style.margin = '8px 0';
          $('ar-container').appendChild(button);
        }
      } catch (e) { console.warn('AR non disponible', e); }
      return true;
    } catch (e) {
      status('WEBGL ERROR'); ui('WebGL indisponible : ' + e.message);
      return false;
    }
  }
  // Adaptive hysteresis + speed-dependent temporal smoothing. Distance relative
  // to palm width avoids a fixed pixel threshold across near/far hands.
  // Deux mains suivies indépendamment ; chaque pincement crée un tracé séparé.
  function onHandResults(result) {
    const raw=result.multiHandLandmarks||[];
    const handedness=result.multiHandedness||[];
    const found=[null,null];
    raw.slice(0,2).forEach((points,index)=>{
      const handLabel=String(handedness[index]?.label||'').toLowerCase();
      let slot=handLabel==='left'?0:handLabel==='right'?1:-1;
      if(slot<0||found[slot])slot=found[0]?1:0;
      found[slot]=points;
    });
    drawPreviewLandmarks(found);
    if(!cameraEnabled || renderer.xr.isPresenting || pointerDown) {
      for(let i=0;i<2;i++)useStroke('hand-'+i,'end');
      return;
    }
    if(window.NeuralArtStrings?.active()) {
      for(let i=0;i<2;i++)useStroke('hand-'+i,'end');
      window.NeuralArtStrings.hands(found,mirrorCamera);
      setStatusHands(found.filter(Boolean).length+' MAIN(S) · CORDES');
      return;
    }
    const now=performance.now();
    let detected=0,pinchedCount=0;
    for(let i=0;i<2;i++){
      const hand=found[i],state=handMotion[i],cursor=$(i?'hand-cursor-2':'hand-cursor');
      if(!hand) {
        state.missed++;
        if(state.missed>=3) {
          useStroke('hand-'+i,'end');state.pinched=false;state.initialized=false;
          state.pinchFrames=0;state.releaseFrames=0;
          if(cursor)cursor.hidden=true;
        }
        continue;
      }
      const tip=hand[8],thumb=hand[4],base=hand[5],outer=hand[17];
      if(![tip,thumb,base,outer].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))continue;
      detected++;state.missed=0;
      const palmWidth=Math.max(.045,Math.hypot(base.x-outer.x,base.y-outer.y));
      const ratio=Math.hypot(tip.x-thumb.x,tip.y-thumb.y)/palmWidth;
      if(!state.pinched){
        state.pinchFrames=ratio < .38*trackingSensitivity ? state.pinchFrames+1 : 0;
        if(state.pinchFrames>=2){state.pinched=true;state.releaseFrames=0;}
      }else{
        state.releaseFrames=ratio > .57*trackingSensitivity ? state.releaseFrames+1 : 0;
        if(state.releaseFrames>=2){state.pinched=false;state.pinchFrames=0;useStroke('hand-'+i,'end');}
      }
      const rawX=clamp(mirrorCamera?1-tip.x:tip.x,0,1),rawY=clamp(tip.y,0,1);
      const dt=clamp(now-(state.lastTs||now-33),10,100);
      const speed=Math.hypot(rawX-state.x,rawY-state.y)/(dt/1000);
      const alpha=state.initialized?clamp(motionSmoothing*.52+speed*.075,.14,.85):1;
      state.x+=alpha*(rawX-state.x);state.y+=alpha*(rawY-state.y);
      state.lastTs=now;state.initialized=true;
      showHandCursor(state.x,state.y,state.pinched,i);
      if(state.pinched){
        pinchedCount++;
        if(touchTool==='erase')eraseNearestStroke(state.x,state.y);
        else useStroke('hand-'+i,'move',state.x,state.y);
        state.palmX=null;state.palmY=null;
      }else{
        useStroke('hand-'+i,'end');
        if(i===0&&gestureRotate&&!pointerDown&&touchTool==='draw'){
          const palm=hand[9],px=mirrorCamera?1-palm.x:palm.x,py=palm.y;
          if(state.palmX!==null&&state.palmY!==null){
            painting.rotation.y+=clamp(px-state.palmX,-.1,.1)*3;
            painting.rotation.x+=clamp(py-state.palmY,-.1,.1)*3;
          }
          state.palmX=px;state.palmY=py;
        }
      }
    }
    setStatusHands(detected+' MAIN(S)'+(pinchedCount?' · '+pinchedCount+' PINCEMENT(S)':''));
    if($('mode-status'))$('mode-status').textContent=pinchedCount?
      (touchTool==='erase'?'MODE: GOMME':'MODE: DESSIN À '+pinchedCount+' MAIN(S)'):
      (detected?'MODE: SUIVI DES MAINS':'MODE: RECHERCHE DES MAINS');
    describeGesture(detected ? 'Mains suivies : '+detected+' · pinçages actifs : '+pinchedCount : 'Montre tes mains à la caméra');
  }
  async function trackCamera() {
    if (!cameraEnabled || processing || !hands || !video) return;
    if (video.readyState < 2) { rafCamera = requestAnimationFrame(trackCamera); return; }
    // Cap inference to ~25 fps on mobile and let requestAnimationFrame render
    // fluidly between tracked frames; avoid overlapping inference requests.
    const now = performance.now();
    if (now - motion.lastInference < (isIOS ? 68 : 40)) {
      rafCamera = requestAnimationFrame(trackCamera);
      return;
    }
    motion.lastInference = now;
    processing = true;
    try { await hands.send({ image: video }); }
    catch (e) {
      console.warn('MediaPipe error', e);
      cameraErrors += 1;
      setStatusHands('ERROR');
      if (cameraErrors>=3) {
        stopCamera();
        ui('Erreur pendant le suivi des mains. Recharge la page, vérifie ta connexion puis réessaie.');
      }
    }
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
    endStroke(); tracking = false; resetMotion();
    setStatusHands('OFFLINE');
    if ($('mode-status')) $('mode-status').textContent='MODE: TACTILE';
    document.body.classList.remove('camera-active');
    drawPreviewLandmarks(null);
    describeGesture('Caméra inactive · dessin tactile disponible');
    $('camera-btn').textContent = 'Activer la caméra';
    if ($('camera-quick')) $('camera-quick').textContent='Caméra';
    status('READY (CAMERA OFF)');
  }
  async function toggleCamera() {
    if (cameraEnabled) { stopCamera(); ui('Caméra arrêtée.'); return; }
    if (cameraStarting) return;
    if (!window.isSecureContext) {
      ui('La caméra nécessite une page HTTPS ouverte directement dans Safari.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      ui('Caméra non accessible dans ce navigateur. Ouvre directement le lien dans Safari.');
      return;
    }
    cameraStarting=true;
    try {
      status('DEMANDE CAMÉRA');
      ui('Autorise la caméra quand Safari te le demande…');
      video=document.querySelector('.input_video');
      if (!video) throw new Error('Élément vidéo introuvable.');
      video.muted=true;
      video.playsInline=true;
      video.autoplay=true;
      for (const attr of ['playsinline','webkit-playsinline','muted','autoplay']) video.setAttribute(attr,'');
      // Demander l'autorisation directement au clic, AVANT les chargements externes.
      try {
        cameraStream=await navigator.mediaDevices.getUserMedia({
          audio:false,
          video:{
            facingMode:'user',
            width:{ideal:isIOS?480:640},
            height:{ideal:480},
            frameRate:{ideal:isIOS?20:25,max:30}
          }
        });
      } catch(e) {
        if (['OverconstrainedError','NotFoundError','ConstraintNotSatisfiedError'].includes(e.name))
          cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});
        else throw e;
      }
      video.srcObject=cameraStream;
      try { await video.play(); }
      catch(e) { if (e.name!=='AbortError') throw e; }
      cameraEnabled=true;tracking=false;cameraErrors=0;resetMotion();
      document.body.classList.add('camera-active');
      if ($('camera-preview')) $('camera-preview').classList.toggle('mirror',mirrorCamera);
      $('camera-btn').textContent='Arrêter la caméra';
      if ($('camera-quick')) $('camera-quick').textContent='Stop caméra';
      if ($('mode-status')) $('mode-status').textContent='MODE: CHARGEMENT GESTES';
      describeGesture('Vidéo active · chargement du suivi de mains');
      status('CHARGEMENT DES GESTES');
      if (!(await ensureHandsLibrary())) {
        stopCamera();
        setStatusHands('LIBRARY ERROR');
        ui('Le flux vidéo était accessible, mais MediaPipe est inaccessible. Vérifie ta connexion et désactive les bloqueurs de scripts, puis réessaie.');
        return;
      }
      if (!hands) {
        hands=new Hands({locateFile:file=>handAssetsBase+file});
        hands.setOptions({
          maxNumHands:2,modelComplexity:0,
          minDetectionConfidence:.55,minTrackingConfidence:.55
        });
        hands.onResults(onHandResults);
      }
      if (!cameraEnabled) return;
      setStatusHands('SEARCHING');
      if ($('mode-status')) $('mode-status').textContent='MODE: RECHERCHE MAIN';
      describeGesture('Caméra active · montre ta main');
      status('CAMERA READY');
      ui('Caméra prête. Montre ta main, puis pince pouce-index pour dessiner.');
      trackCamera();
    } catch(e) {
      stopCamera();
      let detail=e.message||e.name||'Erreur inconnue';
      if (e.name==='NotAllowedError'||e.name==='PermissionDeniedError')
        detail='accès refusé : dans Safari, autorise la caméra pour ce site';
      else if(e.name==='NotReadableError')
        detail='caméra occupée (FaceTime, appel vidéo ou autre application)';
      else if(e.name==='NotFoundError') detail='caméra introuvable';
      ui('Caméra indisponible : '+detail);
    } finally {
      cameraStarting=false;
    }
  }
  function installPointer() {
    const layer=$('interaction-layer');if(!layer)return;
    const pointers=new Map(),cursor=$('touch-cursor');
    const coords=e=>{
      const rect=layer.getBoundingClientRect();
      return [clamp((e.clientX-rect.left)/Math.max(rect.width,1),0,1),
        clamp((e.clientY-rect.top)/Math.max(rect.height,1),0,1)];
    };
    const touchCursor=e=>{
      if(!cursor)return;
      cursor.style.display='block';cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';
    };
    const finish=e=>{
      const id=e?.pointerId;
      if(id===undefined){
        for(const key of pointers.keys())useStroke('touch-'+key,'end');
        pointers.clear();
      }else if(pointers.has(id)){
        useStroke('touch-'+id,'end');pointers.delete(id);
      }
      pointerDown=pointers.size>0;
      if(!pointerDown&&cursor)cursor.style.display='none';
      if(!pointerDown&&$('mode-status'))$('mode-status').textContent=touchTool==='erase'?'MODE: GOMME':'MODE: DESSIN';
    };
    layer.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      if(pointers.has(e.pointerId))return;
      e.preventDefault();
      pointers.set(e.pointerId,{lastErase:0});
      pointerDown=true;
      try{layer.setPointerCapture(e.pointerId);}catch(_){}
      const [x,y]=coords(e);
      if(touchTool==='erase')eraseNearestStroke(x,y);
      else useStroke('touch-'+e.pointerId,'start',x,y);
      touchCursor(e);
      if($('mode-status'))$('mode-status').textContent=touchTool==='erase'?'MODE: GOMME':'MODE: DESSIN MULTITOUCH';
    },{passive:false});
    layer.addEventListener('pointermove',e=>{
      const state=pointers.get(e.pointerId);if(!state)return;
      e.preventDefault();
      const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[e];
      for(const item of (events.length?events.slice(-15):[e])){
        const [x,y]=coords(item);
        if(touchTool==='erase'){
          const now=performance.now();
          if(now-state.lastErase>65){eraseNearestStroke(x,y);state.lastErase=now;}
        }else useStroke('touch-'+e.pointerId,'move',x,y);
      }
      touchCursor(e);
    },{passive:false});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])
      layer.addEventListener(type,finish);
    window.addEventListener('blur',()=>finish(null));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(null);});
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
  function removeImportedModel() {
    if (!importedModel || !painting) return;
    painting.remove(importedModel);
    importedModel.traverse(node => {
      if (node.isMesh || node.isPoints || node.isLine) safeDispose(node);
    });
    importedModel=null;
  }
  async function ensureGLTFLoader() {
    if (typeof THREE === 'undefined') throw new Error('Three.js non chargé.');
    if (typeof THREE.GLTFLoader === 'function') return;
    const urls=[
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
      'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js'
    ];
    for (const url of urls) {
      try {
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          let finished=false;
          const finish=(error)=>{
            if (finished) return;
            finished=true;clearTimeout(timeout);
            if (error) {script.remove();reject(error);} else resolve();
          };
          const timeout=setTimeout(()=>finish(new Error('Chargement trop long')),9000);
          script.src=url;script.async=true;
          script.onload=()=>THREE.GLTFLoader ? finish() : finish(new Error('GLTFLoader absent'));
          script.onerror=()=>finish(new Error('Ressource inaccessible'));
          document.head.append(script);
        });
        if (THREE.GLTFLoader) return;
      }catch(e){ console.warn('Chargeur GLTF indisponible',url,e.message); }
    }
    throw new Error('Le module glTF est inaccessible. Vérifie la connexion puis réessaie.');
  }
  async function importGLTF3D(arrayBuffer,filename='modele.gltf',resources={}) {
    if (!painting || !renderer || typeof THREE === 'undefined') throw new Error('Moteur WebGL non prêt.');
    if (!(arrayBuffer instanceof ArrayBuffer) || !arrayBuffer.byteLength) throw new Error('Fichier vide ou non lisible.');
    if (arrayBuffer.byteLength>32*1024*1024) throw new Error('Limite : 32 Mo par modèle pour préserver la mémoire.');
    await ensureGLTFLoader();
    const isGLB=arrayBuffer.byteLength>=4 && new DataView(arrayBuffer).getUint32(0,true)===0x46546c67;
    const contents=isGLB ? arrayBuffer : new TextDecoder().decode(new Uint8Array(arrayBuffer));
    const resourceURLs=[];
    const manager=new THREE.LoadingManager();
    const getResource=(path)=>{
      const clean=decodeURIComponent(path.split(/[?#]/)[0]).replace(/^\.\//,'');
      const basename=clean.split('/').pop().toLowerCase();
      const file=resources[clean.toLowerCase()]||resources[basename];
      if (!file) throw new Error('Fichier annexe manquant : '+clean+' (sélectionne GLTF + BIN/textures ensemble).');
      return file;
    };
    if (!isGLB) {
      let json;
      try{json=JSON.parse(contents);}catch(e){throw new Error('Fichier GLTF JSON invalide.');}
      if (json.asset?.version !== '2.0') throw new Error('Ce lecteur prend en charge glTF 2.0.');
      const external=[...(json.buffers||[]),...(json.images||[])]
        .map(x=>x.uri).filter(x=>x&&!x.startsWith('data:'));
      external.forEach(getResource);
      manager.setURLModifier(url=>{
        if (url.startsWith('blob:') || url.startsWith('data:')) return url;
        const file=getResource(url);
        const objectURL=URL.createObjectURL(file);
        resourceURLs.push(objectURL);
        return objectURL;
      });
    }
    let asset;
    try {
      asset=await new Promise((resolve,reject)=>{
        try { new THREE.GLTFLoader(manager).parse(contents,'',resolve,reject); }
        catch(e){reject(e);}
      });
    } finally {
      // Safari WebKit : conserver les blobs pendant le chargement asynchrone uniquement.
      resourceURLs.forEach(url=>URL.revokeObjectURL(url));
    }
    const group=asset && asset.scene;
    if (!group) throw new Error('Le fichier ne contient aucune scène glTF.');
    group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) throw new Error('Le modèle ne contient pas de géométrie visible.');
    const center=bounds.getCenter(new THREE.Vector3());
    const extent=bounds.getSize(new THREE.Vector3());
    const maxDim=Math.max(extent.x,extent.y,extent.z,0.0001);
    const factor=Math.min(100000,27/maxDim);
    // Groupe externe, sans modifier les données originales.
    const container=new THREE.Group();
    container.name='Import GLTF : '+filename;
    container.add(group);
    group.position.sub(center);
    group.scale.setScalar(factor);
    removeImportedModel();
    importedModel=container;
    painting.add(container);
    if ($('stage-guide')) $('stage-guide').hidden=true;
    ui('Modèle glTF importé : '+filename+'. Affiché au centre de la scène 3D.');
    return {name:filename,dimensions:extent.toArray().map(x=>Number(x.toFixed(3))),scale:factor};
  }
  function removeBinCloud() {
    if (binCloud && painting) {
      painting.remove(binCloud);
      safeDispose(binCloud);
      binCloud = null;
    }
  }
  function getBinScene() {
    if (!painting) throw new Error('Moteur 3D non démarré.');
    endStroke();
    if (!strokes.length) throw new Error('Dessine une œuvre avant de l’exporter au format BIN.');
    return {
      format: 'neural-art-binary', version: 1,
      rotation: painting.rotation.toArray().slice(0, 3),
      strokes: strokes.map(s => ({
        mode: s.mode,
        size: s.size,
        color: '#' + s.mesh.material.color.getHexString(),
        points: s.points.map(p => [p.x,p.y,p.z])
      }))
    };
  }
  function loadBinScene(payload) {
    if (!painting || typeof THREE === 'undefined') throw new Error('Moteur 3D indisponible : réessaie après rechargement.');
    if (!payload || payload.format !== 'neural-art-binary' || payload.version !== 1)
      throw new Error('Fichier non compatible avec les œuvres Neural Art BIN v1.');
    if (!Array.isArray(payload.strokes) || !payload.strokes.length || payload.strokes.length > maxStrokes)
      throw new Error('Nombre de tracés invalide (maximum ' + maxStrokes + ').');
    const validated = payload.strokes.map((s,i) => {
      if (!['neon','filament','sculpture'].includes(s.mode)) throw new Error('Type de pinceau invalide (tracé ' + i + ').');
      if (!/^#[a-fA-F0-9]{6}$/.test(s.color)) throw new Error('Couleur invalide (tracé ' + i + ').');
      const size = Number(s.size);
      if (!Number.isFinite(size) || size < .1 || size > 2.5) throw new Error('Épaisseur invalide (tracé ' + i + ').');
      if (!Array.isArray(s.points) || !s.points.length || s.points.length > maxPointsPerStroke)
        throw new Error('Nombre de points invalide (tracé ' + i + ').');
      const pts=s.points.map((p) => {
        if (!Array.isArray(p) || p.length !== 3 || !p.every(v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<1e6))
          throw new Error('Coordonnées 3D invalides (tracé ' + i + ').');
        return new THREE.Vector3(p[0],p[1],p[2]);
      });
      return {mode:s.mode,size,color:s.color,pts};
    });
    const rotation=Array.isArray(payload.rotation)&&payload.rotation.length===3&&payload.rotation.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1000)?payload.rotation:[0,0,0];
    clear();
    for (const item of validated) {
      const material=makeMaterial(item.mode,item.color);
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(Math.max(.06,item.size*.28),8,6),material);
      mesh.position.copy(item.pts[0]);
      painting.add(mesh);
      const stroke={mesh,points:item.pts,mode:item.mode,size:item.size,lastRender:0};
      strokes.push(stroke);
      refreshStroke(stroke);
    }
    painting.rotation.set(...rotation);
    updateCount();
    ui('Œuvre BIN restaurée : '+strokes.length+' tracés.');
    return strokes.length;
  }
  function showBinXYZ(coordinates) {
    if (!painting || typeof THREE === 'undefined') throw new Error('Moteur 3D indisponible.');
    if (!Array.isArray(coordinates) || coordinates.length < 1 || coordinates.length > 15000)
      throw new Error('Le nuage doit contenir entre 1 et 15 000 points.');
    const sums=[0,0,0],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
    for (const p of coordinates) {
      if (!Array.isArray(p) || p.length!==3 || p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12)) throw new Error('Coordonnées 3D invalides.');
      for (let i=0;i<3;i++) { mins[i]=Math.min(mins[i],p[i]);maxs[i]=Math.max(maxs[i],p[i]); }
    }
    const center=mins.map((v,i)=>(v+maxs[i])/2);
    const largest=Math.max(...mins.map((v,i)=>maxs[i]-v),1e-10);
    const scale=26/largest;
    const pos=new Float32Array(coordinates.length*3);
    for (let j=0;j<coordinates.length;j++)for(let i=0;i<3;i++)pos[j*3+i]=(coordinates[j][i]-center[i])*scale;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const material=new THREE.PointsMaterial({color:brushColor,size:.42,transparent:true,opacity:.96,sizeAttenuation:true,depthWrite:false});
    removeBinCloud();
    binCloud=new THREE.Points(geometry,material);
    binCloud.name='NeuralArt-BIN-XYZ';
    painting.add(binCloud);
    updateCount();
    ui(coordinates.length+' points BIN affichés en 3D (normalisés et centrés).');
    return coordinates.length;
  }
  // Pont public pour la performance : le reste du moteur garde son encapsulation.
  function makeStageArtwork(kind) {
    if (!painting || !renderer) throw new Error('Le moteur 3D n’est pas disponible.');
    if (!['vortex','fleur','orbites','spirale','galaxie','onde','coeur','rosace'].includes(kind))
      throw new Error('Composition inconnue.');
    endStroke();
    const oldColor = brushColor, oldMode = brushMode, oldSize = brushSize;
    const colors = ['#00f2ff','#f95bca','#ffe066','#57ffbc','#aa87ff','#ff8d47'];
    const layers = ({orbites:7,fleur:6,vortex:4,spirale:4,galaxie:5,onde:5,coeur:4,rosace:6})[kind];
    const toCreate = Math.min(layers, Math.max(0, maxStrokes-strokes.length));
    if (!toCreate) throw new Error('Limite de tracés atteinte. Annule ou efface des traits.');
    let created = 0;
    try {
      brushMode='neon'; brushSize=.38;
      for (let k=0;k<toCreate;k++) {
        updateColor(colors[k%colors.length]);
        const count=kind==='fleur'||kind==='coeur'?100:kind==='vortex'||kind==='galaxie'?112:94;
        let createdStroke=null;
        for(let i=0;i<count;i++) {
          const t=i/(count-1), a=t*Math.PI*2;
          let x,y;
          if(kind==='vortex'||kind==='spirale'||kind==='galaxie'){
            const turns=kind==='spirale'?8:kind==='galaxie'?5:5.5;
            const angle=t*Math.PI*(turns+k*.25)+k*(kind==='galaxie'?1.25:.65);
            const rad=.025+.34*t;
            x=.5+Math.cos(angle)*rad; y=.5+Math.sin(angle)*rad*.77;
          } else if(kind==='fleur'||kind==='rosace'){
            const lobes=kind==='rosace'?9:6;
            const rad=.19+.1*Math.cos(lobes*a+k*.62);
            x=.5+Math.cos(a)*rad;
            y=.5+Math.sin(a)*rad*.82;
          } else if(kind==='onde'){
            x=.12+.76*t;
            y=.5+(k-2)*.055+Math.sin(t*Math.PI*(4+k*.5))*.075;
          } else if(kind==='coeur'){
            const hx=Math.pow(Math.sin(a),3);
            const hy=(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/17;
            x=.5+hx*(.16+k*.015);
            y=.48-hy*(.18+k*.01);
          } else {
            const rad=.09+k*.035;
            x=.5+Math.cos(a)*rad;
            y=.5+Math.sin(a)*rad*.85;
          }
          if(i===0) { startStroke(x,y); createdStroke=drawing; }
          else moveStroke(x,y);
        }
        endStroke();
        if(createdStroke) {
          createdStroke.points.forEach((p,i) => {
            const t=i/Math.max(1,createdStroke.points.length-1);
            p.z = ['vortex','spirale','galaxie'].includes(kind) ? -3+k*1.5+t*4.5 :
              ['fleur','rosace','coeur'].includes(kind) ?
              (k-layers/2)*1.3+Math.sin(t*Math.PI*6)*1.1 : (k-2)*2;
          });
          refreshStroke(createdStroke);
          created++;
        }
      }
      updateCount();
      ui('Composition « '+kind+' » créée : '+created+' tracés. Exporte-la en PNG, GLTF ou BIN.');
      return created;
    } finally {
      brushMode=oldMode; brushSize=oldSize; updateColor(oldColor);
    }
  }
  window.NeuralArtStage = Object.freeze({
    ready: () => Boolean(renderer && painting),
    enable: (value) => { stage.enabled=Boolean(value); stage.lastTime=0; },
    setEnergy: (value) => { stage.energy=Number.isFinite(value)?clamp(value,0,1):0; },
    setOrbit: (value) => { stage.orbit=Boolean(value); },
    create: makeStageArtwork,
    undo: undo,
    clear: clear,
    setTool: setTouchTool,
    getTool: () => touchTool,
    snapshot: exportPNG
  });
  window.NeuralArtBIN = Object.freeze({
    exportScene:getBinScene,
    importScene:loadBinScene,
    showXYZ:showBinXYZ,
    removeXYZ:removeBinCloud,
    importGLTF:importGLTF3D,
    removeGLTF:removeImportedModel
  });
  function bindUI() {
    $('camera-btn').addEventListener('click', toggleCamera);
    if ($('camera-quick')) $('camera-quick').addEventListener('click', toggleCamera);
    if ($('test-btn')) $('test-btn').addEventListener('click', drawDemo);
    if ($('test-quick')) $('test-quick').addEventListener('click', drawDemo);
    $('mirror-toggle').addEventListener('change', (e) => {
      mirrorCamera = e.target.checked; resetMotion();
      if ($('camera-preview')) $('camera-preview').classList.toggle('mirror', mirrorCamera);
      ui(mirrorCamera ? 'Caméra en miroir.' : 'Caméra sans miroir.');
    });
    $('gesture-rotate').addEventListener('change', (e) => {
      gestureRotate = e.target.checked; motion.palmX = null; motion.palmY = null;
    });
    $('tracking-sensitivity').addEventListener('input', (e) => {
      trackingSensitivity = clamp(Number(e.target.value), .7, 1.5);
      $('sensitivity-value').textContent = trackingSensitivity.toFixed(2);
    });
    $('motion-smoothing').addEventListener('input', (e) => {
      motionSmoothing = clamp(Number(e.target.value), .25, 1);
      $('smoothing-value').textContent = motionSmoothing.toFixed(2);
    });
    $('reset-view').addEventListener('click', () => {
      if (!painting) { ui('Moteur 3D indisponible.'); return; }
      painting.rotation.set(0, 0, 0); ui('Rotation 3D réinitialisée.');
    });
    $('clear-paint-btn').addEventListener('click',()=>{if(window.confirm('Effacer toute la création 3D ?'))clear();});
    for(const button of document.querySelectorAll('[data-studio-tool]')){
      button.addEventListener('click',()=>setTouchTool(button.dataset.studioTool));
    }
    for(const button of document.querySelectorAll('[data-studio-clear]')){
      button.addEventListener('click',()=>{if(window.confirm('Effacer toute la création 3D ?'))clear();});
    }
    $('undo-btn').addEventListener('click', undo);
    for(const button of document.querySelectorAll('[data-studio-undo]'))
      button.addEventListener('click', undo);
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
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        onResize();
        status('READY (RETOUR SAFARI)');
        ui('Atelier réactivé. Relance la caméra si Safari l’a interrompue.');
      }
    });
    document.addEventListener('visibilitychange',()=>{
      if (document.hidden && cameraEnabled) {
        stopCamera();
        ui('Caméra arrêtée lorsque Safari est passé en arrière-plan. Appuie pour relancer.');
      }
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize',onResize,{passive:true});
    if ($('compat-test-btn')) $('compat-test-btn').addEventListener('click',()=>{
      let gl=false;
      try {
        const canvas=document.createElement('canvas');
        gl=!!(canvas.getContext('webgl2')||canvas.getContext('webgl'));
      } catch(e){}
      const checks=[
        'Appareil : '+(isIOS?'iPhone / iPad (WebKit)':'Android / ordinateur'),
        'Moteur 3D WebGL : '+(gl?'DISPONIBLE':'INDISPONIBLE'),
        'Rendu Neural Art : '+(renderer?'PRÊT':'EN ERREUR'),
        'Sélection de fichiers : '+(typeof FileReader!=='undefined'?'DISPONIBLE':'INDISPONIBLE'),
        'Lecteur GLTF / BIN : '+(window.NeuralArtReaderReady?'CHARGÉ':'NON INITIALISÉ'),
        'Caméra : '+(navigator.mediaDevices?.getUserMedia?'API DISPONIBLE':'API ABSENTE'),
        'Suivi de mains : '+(typeof Hands==='function'?'MÉDIAPIPE CHARGÉ':'MÉDIAPIPE À CHARGER'),
        'Mode voix : '+(recognition?'DISPONIBLE':'NON PRIS EN CHARGE'),
        'HTTPS : '+(window.isSecureContext?'OUI':'NON')
      ];
      $('compat-info').textContent=checks.join('\\n');
      ui('Diagnostic terminé. La permission caméra est vérifiée lors de l’activation.');
    });
    // Synchronise les valeurs natives, y compris si le navigateur restaure les champs.
    brushMode=$('brush-mode').value;
    brushSize=clamp(Number($('brush-size').value)||.7,.1,2.5);
    $('size-value').textContent=brushSize.toFixed(1);
    updateColor($('brush-color').value || brushColor);
    setupPalette();
    updateCount();
    setupVoice();
    installPointer();
  }
  function init() {
    const engineReady=setupThree();
    bindUI();
    if (!engineReady)
      ui('Moteur 3D indisponible. Lance « Diagnostic iPhone / Android » pour voir les fonctions disponibles.');
    else
      ui('Atelier prêt : dessin tactile, import 3D et camera disponibles selon autorisations.');
    try { localStorage.removeItem('niko_mistral_key'); } catch (_) { /* pas de stockage */ }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js')
      .catch((e) => console.warn('Service worker indisponible', e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();