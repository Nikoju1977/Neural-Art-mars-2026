/* Neural Art — Studio Cordes V22 : instrument tactile et gestuel à deux mains.
 * Synthèse par corde pincée (Karplus–Strong), Web Audio local, sans téléversement.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const layer=$('strings-layer'),canvas=$('strings-canvas');
  if(!layer||!canvas)return;
  const g=canvas.getContext('2d');
  if(!g)return;
  const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
  const names=['Do','Do♯','Ré','Ré♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
  const colors=['#52efff','#ff6cbe','#ffda71','#7dffba','#b8a1ff','#ff9772','#83d1ff','#ffd1f1'];
  const pointerStates=new Map(), handStates=[{last:null,holding:null},{last:null,holding:null}];
  const strings=[];
  const MAX=18;
  let tool='create',visible=false,ctx=null,master=null,recDest=null,noiseBuffer=null;
  let w=1,h=1,scale=1,raf=0,audioNodes=[],statusAt=0;
  const px=p=>({x:p.x*w,y:p.y*h});
  const norm=(x,y)=>({x:clamp(x/w,0,1),y:clamp(y/h,0,1)});
  function status(message) {
    const label=$('strings-status');if(label)label.textContent=message;
    const now=performance.now();
    if(now-statusAt>500){const log=$('chat-log');if(log)log.textContent='> '+message;statusAt=now;}
  }
  function resize(){
    const rect=layer.getBoundingClientRect();
    w=Math.max(1,rect.width);h=Math.max(1,rect.height);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    g.setTransform(dpr,0,0,dpr,0,0);
  }
  function length(s) {
    return Math.hypot((s.b.x-s.a.x)*w,(s.b.y-s.a.y)*h)/Math.max(1,Math.min(w,h));
  }
  function frequency(s) {
    // Pour une densité et une tension fixées, f = (1/2L) sqrt(T/mu).
    const ratio=Math.max(.09,length(s));
    return clamp(220*.48/ratio*Math.sqrt(Number($('strings-tension')?.value||1)),75,1800);
  }
  function note(f){
    const midi=Math.round(69+12*Math.log2(f/440));
    return names[(midi+1200)%12]+(Math.floor(midi/12)-1);
  }
  function updateLabels(){
    const title=$('strings-count');
    if(title)title.textContent=strings.length+' / '+MAX+' cordes';
  }
  function ensureAudio(){
    if(ctx)return ctx;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw Error('Web Audio n’est pas pris en charge par ce navigateur.');
    ctx=new Audio();
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=-17;limiter.knee.value=22;limiter.ratio.value=5;
    limiter.attack.value=.004;limiter.release.value=.2;
    master=ctx.createGain();master.gain.value=.55;
    master.connect(limiter);limiter.connect(ctx.destination);
    return ctx;
  }
  function pluck(s,strength=.7){
    try {
      ensureAudio();
      if(ctx.state==='suspended')ctx.resume().catch(()=>{});
      const f=frequency(s),fs=ctx.sampleRate;
      const length=Math.max(20,Math.round(fs/f));
      const duration=2.9, n=Math.round(fs*duration);
      const buffer=ctx.createBuffer(1,n,fs),data=buffer.getChannelData(0);
      const damping=$('strings-timbre')?.value==='metal'?.9992:
        $('strings-timbre')?.value==='soft'?.994:.9972;
      for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*.8;
      for(let i=length;i<n;i++)
        data[i]=(data[i-length]+data[i-length+1])*0.5*damping;
      const source=ctx.createBufferSource(),amp=ctx.createGain(),filter=ctx.createBiquadFilter();
      source.buffer=buffer;
      filter.type='lowpass';
      filter.frequency.value=$('strings-timbre')?.value==='soft'?2400:7500;
      amp.gain.value=clamp(strength,0.2,1)*Number($('strings-volume')?.value||55)/100;
      source.connect(filter);filter.connect(amp);amp.connect(master);
      source.onended=()=>{source.disconnect();filter.disconnect();amp.disconnect();};
      source.start();
      s.strum=performance.now();s.intensity=clamp(strength,.1,1);
      const label=$('strings-note');if(label)label.textContent=note(f)+' · '+Math.round(f)+' Hz';
      if(navigator.vibrate && strength>.55)navigator.vibrate(8);
    }catch(e){status('Son indisponible : '+e.message);}
  }
  function distSegment(p,a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/Math.max(1,dx*dx+dy*dy),0,1);
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
  function intersect(a,b,c,d) {
    const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,det=ux*vy-uy*vx;
    if(Math.abs(det)<1e-5)return false;
    const wx=c.x-a.x,wy=c.y-a.y;
    const t=(wx*vy-wy*vx)/det,u=(wx*uy-wy*ux)/det;
    return t>=0&&t<=1&&u>=.03&&u<=.97;
  }
  function nearestString(p,limit=28) {
    let target=null,d=limit;
    for(let i=strings.length-1;i>=0;i--){
      const s=strings[i],distance=distSegment(p,px(s.a),px(s.b));
      if(distance<d){target=s;d=distance;}
    }
    return target;
  }
  function nearestEnd(p,limit=31) {
    let item=null,d=limit;
    for(const s of strings)for(const side of ['a','b']){
      const q=px(s[side]),distance=Math.hypot(p.x-q.x,p.y-q.y);
      if(distance<d){d=distance;item={s,side};}
    }
    return item;
  }
  function sweep(a,b) {
    for(const s of strings){
      const now=performance.now();
      if(now-(s.strum||0)<85)continue;
      if(intersect(a,b,px(s.a),px(s.b)))pluck(s,clamp(Math.hypot(b.x-a.x,b.y-a.y)/65,.28,1));
    }
  }
  function addString(a,b) {
    const distance=Math.hypot((b.x-a.x)*w,(b.y-a.y)*h);
    if(distance<48){status('Tends la corde sur au moins 48 pixels.');return;}
    if(strings.length>=MAX){status('18 cordes maximum : retire une corde pour continuer.');return;}
    const s={a:{...a},b:{...b},color:colors[strings.length%colors.length],strum:0,intensity:0};
    strings.push(s);updateLabels();
    status('Corde '+strings.length+' : '+note(frequency(s))+' ('+Math.round(frequency(s))+' Hz). Passe le doigt dessus pour jouer.');
    pluck(s,.5);
  }
  function pointerMode(p){
    if(tool==='erase'){const s=nearestString(p);if(s){
      strings.splice(strings.indexOf(s),1);updateLabels();status('Corde effacée.');
    }return {type:'erase',last:p};}
    const end=nearestEnd(p);
    if(end&&(tool==='edit'||tool==='create'))return {type:'move',target:end,last:p};
    if(tool==='edit')return {type:'play',last:p};
    if(tool==='create'){
      // Un deuxième doigt peut jouer pendant que le premier tend la corde.
      const creating=[...pointerStates.values()].some(s=>s.type==='create');
      if(!creating)return {type:'create',start:norm(p.x,p.y),last:p};
    }
    const on=nearestString(p,20);
    if(on)pluck(on,.55);
    return {type:'play',last:p};
  }
  function down(e){
    e.preventDefault();
    try{ensureAudio().resume().catch(()=>{});}catch(err){status(err.message);}
    const p=position(e);
    pointerStates.set(e.pointerId,pointerMode(p));
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    redraw();
  }
  function position(e){
    const rect=layer.getBoundingClientRect();
    return {x:clamp(e.clientX-rect.left,0,w),y:clamp(e.clientY-rect.top,0,h)};
  }
  function move(e){
    const state=pointerStates.get(e.pointerId);
    if(!state)return;
    e.preventDefault();
    const p=position(e);
    if(state.type==='move') {
      state.target.s[state.target.side]=norm(p.x,p.y);
      const s=state.target.s;const f=frequency(s);
      $('strings-note').textContent=note(f)+' · '+Math.round(f)+' Hz';
    } else if(state.type==='play'){
      sweep(state.last,p);
    } else if(state.type==='erase'){
      const s=nearestString(p,16);if(s){strings.splice(strings.indexOf(s),1);updateLabels();}
    }
    state.last=p;redraw();
  }
  function up(e){
    const state=pointerStates.get(e.pointerId);if(!state)return;
    const p=position(e);
    if(state.type==='create')addString(state.start,norm(p.x,p.y));
    if(state.type==='move')pluck(state.target.s,.5);
    pointerStates.delete(e.pointerId);
    redraw();
  }
  function mode(next) {
    if(!['create','play','edit','erase'].includes(next))return;
    tool=next;
    pointerStates.clear();
    for(const button of document.querySelectorAll('[data-string-tool]'))
      button.setAttribute('aria-pressed',String(button.dataset.stringTool===tool));
    status(({create:'Tends une corde du premier point au second.',play:'Gratte les cordes avec un ou plusieurs doigts.',
      edit:'Déplace une extrémité pour accorder la corde.',erase:'Touche une corde pour la supprimer.'})[tool]);
    redraw();
  }
  function setVisible(value) {
    visible=Boolean(value);layer.hidden=!visible;
    document.body.classList.toggle('strings-active',visible);
    pointerStates.clear();
    if(visible){resize();redraw();status('Instrument actif : tends une corde et pince-la. Deux mains acceptées.');}
    else {if(raf)cancelAnimationFrame(raf);raf=0;status('Instrument fermé : retour à la peinture 3D.');}
    for(const button of document.querySelectorAll('[data-strings-toggle]')){
      button.setAttribute('aria-pressed',String(visible));
      if(button.id==='studio-strings')button.textContent=visible?'Retour dessin':'Cordes';
    }
  }
  function drawLine(s,elapsed) {
    const a=px(s.a),b=px(s.b),dx=b.x-a.x,dy=b.y-a.y;
    const len=Math.hypot(dx,dy),nx=-dy/Math.max(1,len),ny=dx/Math.max(1,len);
    const amp=Math.max(0,14*Math.exp(-elapsed/640)*(s.intensity||0));
    g.beginPath();g.moveTo(a.x,a.y);
    for(let i=1;i<=25;i++){
      const t=i/25,osc=Math.sin(t*Math.PI)*Math.sin(t*14*Math.PI-elapsed*.044)*amp;
      g.lineTo(a.x+dx*t+nx*osc,a.y+dy*t+ny*osc);
    }
    g.strokeStyle=s.color;g.lineWidth=3;g.shadowColor=s.color;g.shadowBlur=16;g.stroke();
    g.shadowBlur=0;
    for(const p of [a,b]){
      g.beginPath();g.arc(p.x,p.y,7,0,2*Math.PI);
      g.fillStyle='#031923';g.fill();g.strokeStyle=s.color;g.lineWidth=2;g.stroke();
    }
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    g.fillStyle='#e7f9ff';g.font='12px system-ui';g.textAlign='center';
    g.fillText(note(frequency(s)),mid.x+nx*22,mid.y+ny*22);
  }
  function redraw(){
    if(!visible)return;
    if(raf)return;
    raf=requestAnimationFrame(t=>{
      raf=0;g.clearRect(0,0,w,h);
      // Le canevas reste transparent pour conserver les sculptures Three.js visibles.
      let animating=false;
      for(const s of strings){
        const elapsed=t-(s.strum||0);
        drawLine(s,Math.max(0,elapsed));
        if(elapsed<1800)animating=true;
      }
      for(const state of pointerStates.values())if(state.type==='create'){
        const p=px(state.start);g.setLineDash([7,5]);g.strokeStyle='#fff';g.lineWidth=2;
        g.beginPath();g.moveTo(p.x,p.y);g.lineTo(state.last.x,state.last.y);g.stroke();g.setLineDash([]);
      }
      if(animating || pointerStates.size)redraw();
    });
  }
  function clearStrings() {
    if(!strings.length){status('Aucune corde à effacer.');return;}
    if(!window.confirm('Supprimer toutes les cordes de cet instrument ?'))return;
    strings.length=0;updateLabels();redraw();status('Toutes les cordes ont été retirées.');
  }
  function demo() {
    strings.length=0;
    for(let i=0;i<6;i++){
      const y=.24+i*.09;
      strings.push({a:{x:.13,y},b:{x:.80-i*.055,y:y+.035},strum:0,intensity:0,color:colors[i]});
    }
    updateLabels();redraw();status('Harpe à 6 cordes créée. Traverse les cordes avec deux doigts.');
  }
  function onHands(landmarks,mirror){
    if(!visible)return;
    const now=performance.now();
    for(let i=0;i<2;i++){
      const hand=landmarks?.[i],state=handStates[i];
      if(!hand){state.last=null;state.holding=null;continue;}
      const index=hand[8],thumb=hand[4];
      if(!index||!thumb)continue;
      const x=(mirror?1-index.x:index.x)*w,y=index.y*h;
      const p={x,y};
      const pinched=Math.hypot(index.x-thumb.x,index.y-thumb.y)<.065;
      if(tool==='edit'&&pinched) {
        if(!state.holding)state.holding=nearestEnd(p,36);
        if(state.holding)state.holding.s[state.holding.side]=norm(x,y);
      }else{
        state.holding=null;
        if(state.last && (tool==='play'||tool==='create'||tool==='edit'))sweep(state.last,p);
      }
      state.last=p;
    }
    redraw();
  }
  function init(){
    resize();
    layer.hidden=true;
    window.addEventListener('resize',()=>{resize();redraw();},{passive:true});
    if(window.ResizeObserver)new ResizeObserver(()=>{resize();redraw();}).observe(layer);
    canvas.addEventListener('pointerdown',down,{passive:false});
    canvas.addEventListener('pointermove',move,{passive:false});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,up);
    document.querySelectorAll('[data-string-tool]').forEach(button=>
      button.addEventListener('click',()=>mode(button.dataset.stringTool)));
    document.querySelectorAll('[data-strings-toggle]').forEach(button=>
      button.addEventListener('click',()=>setVisible(!visible)));
    $('strings-demo')?.addEventListener('click',demo);
    $('strings-clear')?.addEventListener('click',clearStrings);
    $('strings-tension')?.addEventListener('input',()=>{
      if(strings.length){const s=strings[strings.length-1],f=frequency(s);$('strings-note').textContent=note(f)+' · '+Math.round(f)+' Hz';}
      redraw();
    });
    $('strings-volume')?.addEventListener('input',()=>{$('strings-volume-value').textContent=$('strings-volume').value+' %';});
    mode('create');updateLabels();
  }
  window.NeuralArtStrings=Object.freeze({
    active:()=>visible,show:setVisible,hands:onHands,mode,play:()=>mode('play'),create:()=>mode('create'),
    clear:clearStrings,count:()=>strings.length
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();