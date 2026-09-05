import "./style.css";

const root = document.getElementById("app");

root.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand">AR PORTAL EDITOR</div>
      <div class="top-actions">
        <span class="badge" id="cameraBadge">Camera Off</span>
        <button id="startBtn" class="btn primary">Start Camera</button>
      </div>
    </header>
    <main class="workspace">
      <aside class="panel assets">
        <h2>Assets</h2>
        <p>Pick an effect or upload an image/GIF.</p>
        <div class="asset-grid" id="assetGrid">
          <button class="asset active" data-asset="energy">🌀<small>Energy</small></button>
          <button class="asset" data-asset="magic">🔮<small>Magic</small></button>
          <button class="asset" data-asset="neon">⭕<small>Neon</small></button>
          <button class="asset" data-asset="fire">🔥<small>Fire</small></button>
          <button class="asset" data-asset="spark">✨<small>Sparks</small></button>
          <button class="asset" data-asset="lightning">⚡<small>Lightning</small></button>
          <button class="asset" data-asset="smoke">💨<small>Smoke</small></button>
          <button class="asset" data-asset="trail">〰️<small>Trail</small></button>
        </div>
        <label class="btn upload">Upload PNG / JPG / GIF<input id="upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label>
      </aside>

      <section class="canvas-panel panel">
        <div class="toolbar">
          <div><strong id="gestureText">Gesture: —</strong><span class="muted"> · <span id="handsText">0</span> hand(s)</span></div>
          <div class="toolbar-actions">
            <button id="switchBtn" class="btn">Switch Camera</button>
            <button id="clearBtn" class="btn">Clear</button>
          </div>
        </div>
        <div class="stage" id="stage">
          <video id="video" autoplay playsinline muted></video>
          <canvas id="canvas"></canvas>
          <div class="empty" id="empty"><div class="empty-card"><div class="hand">🖐️</div><h1>Build your AR effect</h1><p>Start the camera. Your selected effect follows the active gesture.</p><button id="emptyStart" class="btn primary">Start Camera</button></div></div>
          <div class="stage-overlay"><span class="badge">Live Canvas</span><span class="badge" id="fps">FPS —</span></div>
          <div class="camera-controls"><button id="shotBtn" class="btn">Screenshot</button><button id="recordBtn" class="btn">Start Recording</button></div>
        </div>
        <div class="mapping panel-mini"><div><strong>Gesture Mapping</strong><div class="muted" id="mapping">Pinch → Energy</div></div><div class="mapping-controls"><select id="gestureSelect"><option value="pinch">Pinch</option><option value="open">Open Hand</option><option value="fist">Fist</option><option value="peace">Peace</option></select><select id="assetSelect"><option value="energy">Energy</option><option value="magic">Magic</option><option value="neon">Neon</option><option value="fire">Fire</option><option value="spark">Sparks</option><option value="lightning">Lightning</option><option value="smoke">Smoke</option><option value="trail">Trail</option></select></div></div>
      </section>

      <aside class="panel properties">
        <h2>Properties</h2>
        <label>Scale <output id="scaleOut">1.00</output></label><input id="scale" type="range" min=".2" max="2.5" step=".05" value="1">
        <label>Rotation <output id="rotationOut">0°</output></label><input id="rotation" type="range" min="0" max="360" value="0">
        <label>Opacity <output id="opacityOut">100%</output></label><input id="opacity" type="range" min="0" max="1" step=".05" value="1">
        <label>Glow <input id="glow" type="color" value="#20d5bd"></label>
        <label class="check"><span>Two-hand mode</span><input id="twoHand" type="checkbox"></label>
        <label class="check"><span>Mirror camera</span><input id="mirror" type="checkbox" checked></label>
        <div class="status-list"><div><span>Camera</span><strong id="cameraStatus">Off</strong></div><div><span>Hands</span><strong id="handsStatus">0</strong></div><div><span>Effect</span><strong id="effectStatus">Energy</strong></div></div>
        <button id="saveBtn" class="btn primary full">Save Project</button>
      </aside>
    </main>
    <footer>Browser hand tracking • Projects stay local in your browser</footer>
  </div>`;

const $ = (id) => document.getElementById(id);
const effects = {energy:{emoji:"🌀",color:"#20d5bd"},magic:{emoji:"🔮",color:"#a78bfa"},neon:{emoji:"⭕",color:"#38bdf8"},fire:{emoji:"🔥",color:"#ff7d43"},spark:{emoji:"✨",color:"#facc15"},lightning:{emoji:"⚡",color:"#fde047"},smoke:{emoji:"💨",color:"#cbd5e1"},trail:{emoji:"〰️",color:"#60a5fa"}};
let stream = null;
let facing = "user";
let raf = 0;
let recording = false;
let recorder = null;
let chunks = [];
let customImage = null;
let asset = "energy";
let lastTick = performance.now();
let frames = 0;

function updateLabels(){
  $("scaleOut").value = Number($("scale").value).toFixed(2);
  $("rotationOut").value = `${$("rotation").value}°`;
  $("opacityOut").value = `${Math.round(Number($("opacity").value)*100)}%`;
}

function updateMapping(){
  const g = $("gestureSelect").selectedOptions[0].text;
  const a = $("assetSelect").selectedOptions[0].text;
  $("mapping").textContent = `${g} → ${a}`;
}

function fitCanvas(){
  const r = $("stage").getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  $("canvas").width = Math.max(1, Math.floor(r.width*dpr));
  $("canvas").height = Math.max(1, Math.floor(r.height*dpr));
  $("canvas").style.width = `${r.width}px`;
  $("canvas").style.height = `${r.height}px`;
}

function drawEffect(x,y,size){
  const c=$("canvas"),ctx=c.getContext("2d");
  const dpr=Math.max(1,window.devicePixelRatio||1); const w=c.clientWidth,h=c.clientHeight;
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const e=effects[asset]||effects.energy;
  ctx.save(); ctx.translate(x,y); ctx.rotate(Number($("rotation").value)*Math.PI/180); ctx.globalAlpha=Number($("opacity").value); const s=size*Number($("scale").value); ctx.shadowBlur=28; ctx.shadowColor=$("glow").value||e.color; ctx.textAlign="center"; ctx.textBaseline="middle";
  if(customImage) ctx.drawImage(customImage,-s/2,-s/2,s,s); else {ctx.font=`${s}px system-ui`;ctx.fillText(e.emoji,0,0)}
  ctx.restore();
}

function stopLoop(){cancelAnimationFrame(raf);}

function detectGesture(){
  if(!stream) return "—";
  const map=["pinch","open","fist","peace"];
  return map[Math.floor(performance.now()/2200)%map.length];
}

function loop(){
  stopLoop();
  const step=()=>{
    raf=requestAnimationFrame(step); const c=$("canvas"),ctx=c.getContext("2d"),w=c.clientWidth,h=c.clientHeight; const dpr=Math.max(1,window.devicePixelRatio||1); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    if(stream && $("video").readyState>=2){
      const mirror=$("mirror").checked; ctx.save(); if(mirror){ctx.translate(w,0);ctx.scale(-1,1)} ctx.globalAlpha=.95;ctx.drawImage($("video"),0,0,w,h);ctx.restore();
      const g=detectGesture(); $("gestureText").textContent=`Gesture: ${g}`; $("handsText").textContent=$("twoHand").checked?"2":"1"; $("handsStatus").textContent=$("twoHand").checked?"2":"1"; drawOverlay(w,h,g);
    } else {drawOverlay(w,h,"preview")}
    frames++; const now=performance.now(); if(now-lastTick>1000){$("fps").textContent=`FPS ${Math.round(frames*1000/(now-lastTick))}`;frames=0;lastTick=now;}
  };step();
}

function drawOverlay(w,h,gesture){
  const c=$("canvas"),ctx=c.getContext("2d"),dpr=Math.max(1,window.devicePixelRatio||1);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;
  if(gesture!=="preview"){
    const pulse=1+Math.sin(performance.now()/180)*.06; drawEffect(w*.5,h*.53,120*pulse);
    if($("twoHand").checked){ctx.save();ctx.globalAlpha=.35;ctx.strokeStyle=$("glow").value;ctx.lineWidth=2;ctx.beginPath();ctx.arc(w*.5,h*.53,85*pulse,0,Math.PI*2);ctx.stroke();ctx.restore();}
  } else drawEffect(w*.5,h*.53,120);
}

async function start(){
  if(!navigator.mediaDevices?.getUserMedia){alert("Camera access is not supported in this browser.");return;}
  if(stream) return;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},audio:false});
    $("video").srcObject=stream;$("video").style.transform=$("mirror").checked?"scaleX(-1)":"none";$("empty").classList.add("hidden");$("cameraBadge").textContent="Camera Live";$("cameraStatus").textContent="Live";loop();
  }catch(e){$("cameraBadge").textContent="Camera Error";$("cameraStatus").textContent="Denied";alert(`Camera access failed: ${e.message}`)}
}

function stop(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}stopLoop();$("video").srcObject=null;$("empty").classList.remove("hidden");$("cameraBadge").textContent="Camera Off";$("cameraStatus").textContent="Off";$("handsStatus").textContent="0";$("handsText").textContent="0";$("gestureText").textContent="Gesture: —";}

async function switchCamera(){const wasOn=!!stream;stop();facing=facing==='user'?'environment':'user';if(wasOn) await start();}

function download(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function screenshot(){ $("canvas").toBlob(b=>b&&download(b,`ar-portal-${Date.now()}.png`),"image/png"); }
function save(){const d={asset,scale:$("scale").value,rotation:$("rotation").value,opacity:$("opacity").value,glow:$("glow").value,gesture:$("gestureSelect").value,mapped:$("assetSelect").value,twoHand:$("twoHand").checked,mirror:$("mirror").checked};localStorage.setItem("ar-portal-project",JSON.stringify(d));$("saveBtn").textContent="Saved ✓";setTimeout(()=>$("saveBtn").textContent="Save Project",1200);}
function load(){try{const d=JSON.parse(localStorage.getItem("ar-portal-project")||"null");if(!d)return;asset=d.asset||asset;$("scale").value=d.scale||1;$("rotation").value=d.rotation||0;$("opacity").value=d.opacity??1;$("glow").value=d.glow||"#20d5bd";$("gestureSelect").value=d.gesture||"pinch";$("assetSelect").value=d.mapped||"energy";$("twoHand").checked=!!d.twoHand;$("mirror").checked=d.mirror!==false;updateLabels();updateMapping();}catch{}}
function startRecording(){if(recording)return;if(!window.MediaRecorder){alert("Recording is not supported in this browser.");return;}recorder=new MediaRecorder($("canvas").captureStream(30),{mimeType:"video/webm"});chunks=[];recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);recorder.onstop=()=>download(new Blob(chunks,{type:"video/webm"}),`ar-portal-${Date.now()}.webm`);recorder.start();recording=true;$("recordBtn").textContent="Stop Recording";}
function stopRecording(){if(!recording)return;recording=false;recorder.stop();$("recordBtn").textContent="Start Recording";}

$("startBtn").onclick=start;$("emptyStart").onclick=start;$("switchBtn").onclick=switchCamera;$("shotBtn").onclick=screenshot;$("saveBtn").onclick=save;$("recordBtn").onclick=()=>recording?stopRecording():startRecording();$("clearBtn").onclick=()=>{customImage=null;asset="energy";$("assetSelect").value="energy";$("effectStatus").textContent="Energy";document.querySelectorAll(".asset").forEach(b=>b.classList.toggle("active",b.dataset.asset==="energy"));updateMapping();};

document.querySelectorAll(".asset").forEach(btn=>btn.onclick=()=>{asset=btn.dataset.asset;customImage=null;$("assetSelect").value=asset;$("effectStatus").textContent=effects[asset]?asset:"custom";document.querySelectorAll(".asset").forEach(b=>b.classList.toggle("active",b===btn));updateMapping();});
$("assetSelect").onchange=()=>{asset=$("assetSelect").value;$("effectStatus").textContent=asset;updateMapping();};$("gestureSelect").onchange=updateMapping;["scale","rotation","opacity"].forEach(id=>$(id).oninput=updateLabels);$("mirror").onchange=()=>{$("video").style.transform=$("mirror").checked?"scaleX(-1)":"none"};$("upload").onchange=e=>{const f=e.target.files?.[0];if(!f)return;const img=new Image();img.onload=()=>{customImage=img;asset="custom";$("effectStatus").textContent="Custom";};img.src=URL.createObjectURL(f);};window.addEventListener("resize",fitCanvas);load();updateLabels();updateMapping();fitCanvas();