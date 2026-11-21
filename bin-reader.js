/* Neural Art Multi-format Reader v20.4 — traitement local, sans upload */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LIMIT = 32 * 1024 * 1024;       // avoid mobile memory pressure
  const MAX_NATIVE_JSON = 8 * 1024 * 1024;
  const PREVIEW_BYTES = 512;
  const MAX_POINTS = 15000;
  let activeBuffer = null, activeName = '', activeNative = null, activeGLTF = false, selectionSequence = 0;
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8',{fatal:false});
  const formats = {
    f32le:{bytes:4,read:(v,p)=>v.getFloat32(p,true)},
    f32be:{bytes:4,read:(v,p)=>v.getFloat32(p,false)},
    f64le:{bytes:8,read:(v,p)=>v.getFloat64(p,true)},
    i16le:{bytes:2,read:(v,p)=>v.getInt16(p,true)},
    u16le:{bytes:2,read:(v,p)=>v.getUint16(p,true)},
    u8:{bytes:1,read:(v,p)=>v.getUint8(p)}
  };
  function message(text,isError=false) {
    const el=$('bin-message');
    if (el) { el.textContent=text; el.style.color=isError?'#ff9ca9':'#86f6c3'; }
  }
  function humanBytes(n) {
    return n < 1024 ? n+' octets' : n < 1048576 ? (n/1024).toFixed(1)+' Ko' : (n/1048576).toFixed(2)+' Mo';
  }
  function magic(bytes) {
    const ascii = Array.from(bytes.subarray(0,Math.min(bytes.length,12)),v => v>=32&&v<127?String.fromCharCode(v):'.').join('');
    const head = dec.decode(bytes.subarray(0,Math.min(bytes.length,8)));
    if (head === 'NARTBIN1') return 'Neural Art BIN v1 (œuvre 3D réimportable)';
    if (ascii.startsWith('glTF')) return 'GLB : scène 3D glTF binaire';
    if (bytes.length>24 && bytes[0]===123) {
      try {
        const lead=dec.decode(bytes.subarray(0,Math.min(bytes.length,4096)));
        if (/["']?asset["']?\s*:\s*\{/.test(lead) && /"version"\s*:\s*"2\.0"/.test(lead))
          return 'GLTF 2.0 : scène 3D JSON';
      } catch(_) { /* données non textuelles */ }
    }
    if (ascii.startsWith('PK')) return 'ZIP ou archive compatible ZIP';
    if (ascii.startsWith('RIFF')) return 'Conteneur RIFF (ex. WAV ou AVI)';
    if (ascii.startsWith('%PDF')) return 'Document PDF';
    if (bytes.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'Image PNG';
    if (bytes.length>=3 && bytes[0]===255&&bytes[1]===216&&bytes[2]===255) return 'Image JPEG';
    if (bytes.length>=4 && bytes[0]===0&&bytes[1]===0&&bytes[2]===0&&bytes[3]===0) return 'Données binaires non identifiées (en-tête nul)';
    return 'Binaire générique : structure inconnue';
  }
  function hexDump(bytes) {
    const lines=[];
    for(let pos=0;pos<bytes.length;pos+=16) {
      const segment=bytes.subarray(pos,pos+16);
      const hex=Array.from(segment,b=>b.toString(16).padStart(2,'0')).join(' ');
      const chars=Array.from(segment,b=>(b>=32&&b<=126)?String.fromCharCode(b):'.').join('');
      lines.push(pos.toString(16).padStart(8,'0')+'  '+hex.padEnd(47,' ')+'  |'+chars+'|');
    }
    return lines.join('\n') || '(fichier vide)';
  }
  function parseNative(buffer) {
    if (buffer.byteLength < 12) throw new Error('En-tête BIN Neural Art tronqué.');
    const view=new DataView(buffer);
    const len=view.getUint32(8,true);
    if (len===0 || len>MAX_NATIVE_JSON || len !== buffer.byteLength-12)
      throw new Error('Taille de l’œuvre incorrecte : fichier corrompu ou incompatible.');
    const payload=JSON.parse(dec.decode(new Uint8Array(buffer,12,len)));
    if (!payload || payload.format!=='neural-art-binary' || payload.version!==1 || !Array.isArray(payload.strokes))
      throw new Error('Structure BIN Neural Art invalide.');
    return payload;
  }
  async function loadFile(file) {
    const seq=++selectionSequence;
    activeBuffer=null;activeNative=null;activeGLTF=false;activeName='';
    $('bin-load-scene').disabled=true;
    $('bin-points').disabled=true;
    if ($('bin-load-gltf')) $('bin-load-gltf').disabled=true;
    $('bin-report').textContent='Lecture du fichier…';
    $('bin-hex').textContent='…';
    if (!file) { $('bin-report').textContent='Aucun fichier sélectionné.'; return; }
    if (file.size > LIMIT) {
      $('bin-report').textContent='Taille : '+humanBytes(file.size);
      message('Fichier trop volumineux : limite de 32 Mo pour protéger la mémoire du téléphone.',true);
      return;
    }
    if (file.size===0) {
      $('bin-report').textContent='Fichier vide.';
      message('Fichier vide.',true);
      return;
    }
    try {
      const buffer=await file.arrayBuffer();
      if (seq!==selectionSequence) return;
      activeBuffer=buffer;activeName=file.name;
      const bytes=new Uint8Array(buffer);
      let kind=magic(bytes);
      if (/\.gltf$/i.test(file.name) && kind.startsWith('Binaire générique')) {
        try {
          const data=JSON.parse(dec.decode(bytes));
          if (data?.asset?.version==='2.0') kind='GLTF 2.0 : scène 3D JSON';
        } catch(e) { /* fichier invalide identifié dans l'import */ }
      }
      const preview=bytes.subarray(0,PREVIEW_BYTES);
      $('bin-hex').textContent=hexDump(preview);
      const printable=bytes.subarray(0,Math.min(bytes.length,4096)).filter(b=>b>=32&&b<=126).length;
      const ratio=Math.round(printable/Math.min(bytes.length,4096)*100);
      const lines=[
        'Fichier : '+file.name,
        'Taille : '+humanBytes(file.size)+' ('+file.size+' octets)',
        'Format détecté : '+kind,
        'Octets texte ASCII imprimables : '+ratio+' % (échantillon)',
        'Aperçu : '+Math.min(file.size,PREVIEW_BYTES)+' octets / '+file.size
      ];
      if (kind.startsWith('GLTF') || kind.startsWith('GLB')) {
        activeGLTF=true;
        if ($('bin-load-gltf')) $('bin-load-gltf').disabled=false;
        message('Fichier 3D reconnu. Chargement du modèle dans la scène…');
      } else if (kind.startsWith('Neural Art')) {
        try {
          activeNative=parseNative(buffer);
          $('bin-load-scene').disabled=false;
          lines.push('Œuvre : '+activeNative.strokes.length+' tracés enregistrés');
          message('Œuvre Neural Art reconnue : utilise « Restaurer œuvre BIN ».');
        } catch(e) {
          message('Œuvre BIN endommagée : '+e.message,true);
          lines.push('Erreur : '+e.message);
        }
      } else {
        if (file.size >= 3 && !/\.(gltf|glb)$/i.test(file.name)) $('bin-points').disabled=false;
        message('Fichier lu. Aperçu hexadécimal prêt. Pour les données XYZ, choisis le type, l’offset et le stride.');
      }
      $('bin-report').textContent=lines.join('\n');
      if (activeGLTF && seq===selectionSequence) await importGLTF(seq,true);
    } catch(e) {
      activeBuffer=null;
      $('bin-report').textContent='Échec de lecture.';
      message('Impossible de lire le fichier : '+e.message,true);
    }
  }
  async function importGLTF(seq=selectionSequence, auto=false) {
    try {
      if (!activeGLTF || !activeBuffer) throw new Error('Choisis un fichier .gltf ou .glb valide.');
      if (!window.NeuralArtBIN || !window.NeuralArtBIN.importGLTF)
        throw new Error('Moteur 3D indisponible. Actualise la page.');
      message('Import du modèle 3D en cours…');
      const info=await window.NeuralArtBIN.importGLTF(activeBuffer,activeName);
      if (seq!==selectionSequence) return;
      message('Modèle 3D affiché : '+info.name+' · dimensions '+info.dimensions.join(' × ')+'.');
      if ($('mode-status')) $('mode-status').textContent='MODE: MODELE 3D';
      // Fermer uniquement le panneau et laisser l’artiste voir l’œuvre importée.
      if (auto && $('tools-open')) $('tools-open').checked=false;
      const binPanel=$('bin-reader'); if (auto && binPanel) binPanel.open=false;
    } catch(e) {
      if (seq===selectionSequence) message('Import 3D impossible : '+e.message,true);
    }
  }
  function saveBuffer(bytes,name) {
    const blob=new Blob([bytes],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  function exportNative() {
    try {
      if (!window.NeuralArtBIN) throw new Error('Moteur Neural Art absent.');
      const payload=window.NeuralArtBIN.exportScene();
      const bytes=enc.encode(JSON.stringify(payload));
      if (bytes.byteLength>MAX_NATIVE_JSON) throw new Error('Œuvre trop grande pour le format BIN.');
      const out=new Uint8Array(12+bytes.byteLength);
      out.set(enc.encode('NARTBIN1'),0);
      new DataView(out.buffer).setUint32(8,bytes.byteLength,true);
      out.set(bytes,12);
      saveBuffer(out,'Neural-Art-'+Date.now()+'.bin');
      message('Œuvre exportée au format BIN Neural Art ('+humanBytes(out.byteLength)+').');
    } catch(e) { message('Export impossible : '+e.message,true); }
  }
  function importNative() {
    try {
      if (!activeNative) throw new Error('Ouvre d’abord un fichier BIN Neural Art valide.');
      if (!window.NeuralArtBIN) throw new Error('Moteur Neural Art absent.');
      const count=window.NeuralArtBIN.importScene(activeNative);
      message('Œuvre restaurée : '+count+' tracés 3D.');
      const checkbox=$('tools-open'); if (checkbox) checkbox.checked=false;
    } catch(e) { message('Import impossible : '+e.message,true); }
  }
  function readXYZ() {
    if (!activeBuffer) throw new Error('Ouvre d’abord un fichier binaire.');
    const config=formats[$('bin-format').value];
    if (!config) throw new Error('Type numérique non reconnu.');
    const offset=Number($('bin-offset').value);
    const stride=Number($('bin-stride').value);
    const triplet=3*config.bytes;
    if (!Number.isSafeInteger(offset)||offset<0||offset>activeBuffer.byteLength-triplet)
      throw new Error('Offset hors fichier pour un triplet XYZ.');
    if (!Number.isSafeInteger(stride)||stride<triplet||stride>65536)
      throw new Error('Stride invalide : minimum '+triplet+' octets, maximum 65536.');
    const available=1+Math.floor((activeBuffer.byteLength-triplet-offset)/stride);
    const count=Math.min(MAX_POINTS,available);
    if (!count) throw new Error('Pas assez de données pour des coordonnées XYZ.');
    const view=new DataView(activeBuffer),coords=[];
    let invalid=0;
    for (let i=0;i<count;i++) {
      const p=offset+i*stride;
      const v=[0,1,2].map(k=>config.read(view,p+k*config.bytes));
      if (v.every(n=>Number.isFinite(n) && Math.abs(n)<=1e12)) coords.push(v);
      else invalid++;
    }
    if (!coords.length) throw new Error('Aucune coordonnée XYZ numérique valide trouvée.');
    return {coords,available,invalid};
  }
  function showPoints() {
    try {
      if (!window.NeuralArtBIN) throw new Error('Moteur 3D absent.');
      const out=readXYZ();
      const count=window.NeuralArtBIN.showXYZ(out.coords);
      message(count+' points visibles en 3D. '+(out.available>MAX_POINTS?'Aperçu limité aux 15 000 premiers triplets. ':'')+(out.invalid?'Triplets invalides ignorés : '+out.invalid+'.':''));
      const checkbox=$('tools-open'); if (checkbox) checkbox.checked=false;
    } catch(e) { message('Nuage 3D impossible : '+e.message,true); }
  }
  function initialize() {
    const file=$('bin-file');
    if (!file) return;
    window.NeuralArtReaderReady=true;
    message('Lecteur prêt : ouvre un GLTF, GLB ou BIN. Les modèles GLTF compatibles s’affichent automatiquement.');
    file.addEventListener('click',()=>{file.value='';});
    file.addEventListener('change',()=>{const details=$('bin-reader'); if(details) details.open=true;loadFile(file.files&&file.files[0]);});
    $('bin-format').addEventListener('change',()=>{
      $('bin-stride').value=3*formats[$('bin-format').value].bytes;
    });
    const openPicker=()=>{
      const checkbox=$('tools-open'); if (checkbox) checkbox.checked=true;
      const details=$('bin-reader'); if(details) details.open=true;
      file.click();
    };
    for (const id of ['bin-open-quick','bin-open-mobile']) {
      const button=$(id);
      if(button) button.addEventListener('click',openPicker);
    }
    if ($('bin-load-gltf')) $('bin-load-gltf').addEventListener('click',()=>importGLTF());
    if ($('bin-remove-gltf')) $('bin-remove-gltf').addEventListener('click',()=>{
      if (window.NeuralArtBIN?.removeGLTF) {
        window.NeuralArtBIN.removeGLTF();
        message('Modèle GLTF retiré de la scène.');
      } else message('Moteur 3D indisponible.',true);
    });
    $('bin-export').addEventListener('click',exportNative);
    $('bin-load-scene').addEventListener('click',importNative);
    $('bin-points').addEventListener('click',showPoints);
    $('bin-remove').addEventListener('click',()=>{
      try {
        if (!window.NeuralArtBIN) throw new Error('Moteur 3D absent.');
        window.NeuralArtBIN.removeXYZ();
        message('Nuage XYZ retiré.');
      } catch(e) { message('Impossible de retirer le nuage : '+e.message,true); }
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();