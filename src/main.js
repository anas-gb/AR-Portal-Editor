import "./style.css";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const root = document.getElementById("app");
root.innerHTML = `<div class="shell"><header class="topbar"><div class="brand">AR PORTAL EDITOR</div><div class="top-actions"><span class="badge" id="cameraBadge">Camera Off</span><button id="startBtn" class="btn primary">Start Camera</button><button id="helpBtn" class="btn">?</button></div></header><main class="workspace"><aside class="panel assets"><h2>Assets</h2><p>Choose an effect or upload your own visual.</p><div class="asset-grid" id="assetGrid"><button class="asset active" data-asset="energy">🌀<small>Energy</small></button><button class="asset" data-asset="magic">🔮<small>Magic</small></button><button class="asset" data-asset="neon">⭕<small>Neon</small></button><button class="asset" data-asset="fire">🔥<small>Fire</small></button><button class="asset" data-asset="spark">✨<small>Sparks</small></button><button class="asset" data-asset="lightning">⚡<small>Lightning</small></button><button class="asset" data-asset="smoke">💨<small>Smoke</small></button><button class="asset" data-asset="trail">〰️<small>Trail</small></button></div><label class="btn upload">Upload PNG / JPG / GIF<input id="upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label></aside><section class="canvas-panel panel"><div class="toolbar"><div><strong id="gestureText">Gesture: —</strong><span class="muted"> · <span id="handsText">0</span> hand(s)</span></div><div class="toolbar-actions"><button id="switchBtn" class="btn">Switch Camera</button><button id="clearBtn" class="btn">Clear</button></div></div><div class="stage" id="stage"><video id="video" autoplay playsinline muted></video><canvas id="canvas"></canvas><div class="empty" id="empty"><div class="empty-card"><div class="hand">🖐️</div><h1>Build your AR effect</h1><p>Start the camera to track your hands. Your selected effect follows the recognized gesture.</p><button id="emptyStart" class="btn primary">Start Camera</button></div></div><div class="stage-overlay"><span class="badge">Live Canvas</span><span class="badge" id="fps">FPS —</span></div><div class="camera-controls"><button id="shotBtn" class="btn">Screenshot</button><button id="recordBtn" class="btn">Start Recording</button></div></div><div class="mapping panel-mini"><div><strong>Gesture Mapping</strong><div class="muted" id="mapping">Pinch → Energy</div></div><div class="mapping-controls"><select id="gestureSelect"><option value="pinch">Pinch</option><option value="open">Open Hand</option><option value="fist">Fist</option><option value="peace">Peace</option></select><select id="assetSelect"><option value="energy">Energy</option><option value="magic">Magic</option><option value="neon">Neon</option><option value="fire">Fire</option><option value="spark">Sparks</option><option value="lightning">Lightning</option><option value="smoke">Smoke</option><option value="trail">Trail</option></select></div></div></section><aside class="panel properties"><h2>Properties</h2><label>Scale <output id="scaleOut">1.00</output></label><input id="scale" type="range" min=".2" max="2.5" step=".05" value="1"><label>Rotation <output id="rotationOut">0°</output></label><input id="rotation" type="range" min="0" max="360" value="0"><label>Opacity <output id="opacityOut">100%</output></label><input id="opacity" type="range" min="0" max="1" step=".05" value="1"><label>Glow</label><input id="glow" type="color" value="#20d5bd"><label class="check"><span>Two-hand mode</span><input id="twoHand" type="checkbox"></label><label class="check"><span>Mirror camera</span><input id="mirror" type="checkbox" checked></label><div class="status-list"><div><span>Camera</span><strong id="cameraStatus">Off</strong></div><div><span>Hands</span><strong id="handsStatus">0</strong></div><div><span>Effect</span><strong id="effectStatus">Energy</strong></div></div><button id="saveBtn" class="btn primary full">Save Project</button></aside></main><footer>MediaPipe hand tracking • Effects rendered locally in your browser</footer></div>`;

const $ = id => document.getElementById(id);
const effects = {
  energy:{emoji:"🌀",color:"#20d5bd"}, magic:{emoji:"🔮",color:"#a78bfa"}, neon:{emoji:"⭕",color:"#38bdf8"}, fire:{emoji:"🔥",color:"#ff7d43"},
  spark:{emoji:"✨",color:"#facc15"}, lightning:{emoji:"⚡",color:"#fde047"}, smoke:{emoji:"💨",color:"#cbd5e1"}, trail:{emoji:"〰️",color:"#60a5fa"}
};
const gestureNames={pinch:"Pinch",open:"Open Hand",fist:"Fist",peace:"Peace"};
const assetNames={energy:"Energy",magic:"Magic",neon:"Neon",fire:"Fire",spark:"Sparks",lightning:"Lightning",smoke:"Smoke",trail:"Trail"};
let stream=null,facing="user",raf=0,recording=false,recorder=null,chunks=[],customImage=null,asset="energy",handLandmarker=null,lastVideoTime=-1,lastTick=performance.now(),frames=0,ready=false;
const state={scale:1,rotation:0,opacity:1,glow:"#20d5bd",gesture:"pinch",mapped:"energy",twoHand:false,mirror:true};

function updateLabels(){state.scale=Number($("scale").value);state.rotation=Number($("rotation").value);state.opacity=Number($("opacity").value);state.glow=$("glow").value;$("scaleOut").value=state.scale.toFixed(2);$("rotationOut").value=`${state.rotation}°`;$("opacityOut").value=`${Math.round(state.opacity*100)}%`;}
function updateMapping(){state.gesture=$("gestureSelect").value;state.mapped=$("assetSelect").value;$("mapping").textContent=`${gestureNames[state.gesture]} → ${assetNames[state.mapped]}`;}
function setAsset(name){asset=name;document.querySelectorAll(".asset").forEach(b=>b.classList.toggle("active",b.dataset.asset===name));$("effectStatus").textContent=assetNames[name]||name;}
function fitCanvas(){const r=$("stage").getBoundingClientRect(),d=Math.max(1,window.devicePixelRatio||1),c=$("canvas");c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;}
function clearCanvas(){const c=$("canvas"),ctx=c.getContext("2d"),d=Math.max(1,window.devicePixelRatio||1);ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,c.clientWidth,c.clientHeight);}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function fingerExtended(l,a,b,c){return distance(l[a],l[0])>distance(l[b],l[0])*1.08 && distance(l[a],l[c])>distance(l[b],l[c])*1.04;}
function classify(l){
  const scale=Math.max(.001,distance(l[0],l[9]));
  const pinch=distance(l[8],l[4])/scale<.42;
  const index=fingerExtended(l,8,6,5), middle=fingerExtended(l,12,10,9), ring=fingerExtended(l,16,14,13), pinky=fingerExtended(l,20,18,17);
  const ext=[index,middle,ring,pinky].filter(Boolean).length;
  const peace=index&&middle&&!ring&&!pinky;
  if(pinch)return "pinch";
  if(peace)return "peace";
  if(ext<=1)return "fist";
  if(ext>=3)return "open";
  return "open";
}
function normalizedPoint(lm){const p=lm[8],w=$("canvas").clientWidth,h=$("canvas").clientHeight;return {x:(state.mirror?1-p.x:p.x)*w,y:p.y*h};}
function effectForGesture(g){return g===state.gesture?state.mapped:null;}
function drawEffect(x,y,size,effectName=asset){const c=$("canvas"),ctx=c.getContext("2d"),d=Math.max(1,window.devicePixelRatio||1),e=effects[effectName]||effects.energy,s=size*state.scale;ctx.save();ctx.setTransform(d,0,0,d,0,0);ctx.translate(x,y);ctx.rotate(state.rotation*Math.PI/180);ctx.globalAlpha=state.opacity;ctx.shadowBlur=30;ctx.shadowColor=state.glow||e.color;ctx.textAlign="center";ctx.textBaseline="middle";if(customImage&&effectName===asset){ctx.drawImage(customImage,-s/2,-s/2,s,s);}else{ctx.font=`${Math.max(28,s)}px system-ui`;ctx.fillText(e.emoji,0,0);}ctx.restore();}
function drawHands(hands){const c=$("canvas"),ctx=c.getContext("2d"),d=Math.max(1,window.devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;ctx.save();ctx.setTransform(d,0,0,d,0,0);ctx.strokeStyle="rgba(32,213,189,.65)";ctx.fillStyle="#20d5bd";ctx.lineWidth=2;for(const lm of hands){for(const [a,b] of [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]){ctx.beginPath();ctx.moveTo((state.mirror?1-lm[a].x:lm[a].x)*w,lm[a].y*h);ctx.lineTo((state.mirror?1-lm[b].x:lm[b].x)*w,lm[b].y*h);ctx.stroke();}for(const p of lm){ctx.beginPath();ctx.arc((state.mirror?1-p.x:p.x)*w,p.y*h,2.6,0,Math.PI*2);ctx.fill();}}ctx.restore();}
async function initTracker(){
  if(handLandmarker)return;
  const vision=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
  try{
    handLandmarker=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"GPU"},runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
  }catch(gpuError){
    handLandmarker=await HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"CPU"},runningMode:"VIDEO",numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55});
  }
}
function render(results){
  clearCanvas();const v=$("video"),c=$("canvas"),ctx=c.getContext("2d"),d=Math.max(1,window.devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;
  if(v.readyState<2||!w||!h)return;
  ctx.save();ctx.setTransform(d,0,0,d,0,0);if(state.mirror){ctx.translate(w,0);ctx.scale(-1,1)}ctx.drawImage(v,0,0,w,h);ctx.restore();
  const hands=results?.landmarks||[];$("handsText").textContent=hands.length;$("handsStatus").textContent=hands.length;
  const gestures=hands.map(classify);const matched=gestures.map((g,i)=>({g,i})).filter(x=>x.g===state.gesture);
  $("gestureText").textContent=`Gesture: ${matched.length?gestureNames[state.gesture]:"none"}`;
  if(state.twoHand&&hands.length>=2){
    const a=normalizedPoint(hands[0]),b=normalizedPoint(hands[1]);
    const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const span=Math.hypot(a.x-b.x,a.y-b.y);
    const bothMatch=gestures[0]===state.gesture&&gestures[1]===state.gesture;
    if(bothMatch)drawEffect(center.x,center.y,clamp(span*.65,70,220),state.mapped);
  }else if(matched.length){
    const {i}=matched[0];const p=normalizedPoint(hands[i]);drawEffect(p.x,p.y,130,state.mapped);
  }
  drawHands(hands);
}
async function start(){
  if(stream)return;
  if(!window.isSecureContext){alert("Camera access requires HTTPS or localhost. Open the deployed HTTPS site.");return;}
  if(!navigator.mediaDevices?.getUserMedia){alert("Camera access is not supported in this browser.");return;}
  try{
    $("cameraBadge").textContent="Loading Tracker";await initTracker();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});
    const v=$("video");v.srcObject=stream;await v.play();ready=true;$("empty").classList.add("hidden");$("cameraBadge").textContent="Camera Live";$("cameraStatus").textContent="Live";fitCanvas();loop();
  }catch(e){stream=null;ready=false;$("cameraBadge").textContent="Camera Error";$("cameraStatus").textContent="Error";alert(`Camera/tracker failed: ${e?.message||e}`);}
}
function stop(){if(recording)stopRecording();if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}ready=false;cancelAnimationFrame(raf);$("video").srcObject=null;$("empty").classList.remove("hidden");$("cameraBadge").textContent="Camera Off";$("cameraStatus").textContent="Off";$("handsText").textContent="0";$("handsStatus").textContent="0";$("gestureText").textContent="Gesture: —";clearCanvas();}
async function switchCamera(){const wasLive=!!stream;stop();facing=facing==="user"?"environment":"user";if(wasLive)await start();}
function loop(){cancelAnimationFrame(raf);const step=()=>{raf=requestAnimationFrame(step);const v=$("video");if(v.readyState>=2&&handLandmarker&&v.currentTime!==lastVideoTime){lastVideoTime=v.currentTime;try{render(handLandmarker.detectForVideo(v,performance.now()));}catch(e){console.warn("Hand tracking frame failed",e);}}frames++;const n=performance.now();if(n-lastTick>=1000){$("fps").textContent=`FPS ${Math.round(frames*1000/(n-lastTick))}`;frames=0;lastTick=n;}};step();}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function screenshot(){const c=$("canvas");c.toBlob(b=>b&&download(b,`ar-portal-${Date.now()}.png`),"image/png");}
function startRecording(){if(recording)return;if(!window.MediaRecorder){alert("Recording is not supported in this browser.");return;}const streamOut=$("canvas").captureStream(30),mimes=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];const mime=mimes.find(m=>MediaRecorder.isTypeSupported?.(m))||"";try{recorder=new MediaRecorder(streamOut,mime?{mimeType:mime}:undefined);}catch(e){alert(`Recording failed: ${e.message}`);return;}chunks=[];recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);recorder.onstop=()=>download(new Blob(chunks,{type:recorder?.mimeType||"video/webm"}),`ar-portal-${Date.now()}.webm`);recorder.start(200);recording=true;$("recordBtn").textContent="Stop Recording";}
function stopRecording(){if(!recording)return;recording=false;recorder?.stop();$("recordBtn").textContent="Start Recording";}
function save(){const data={scale:state.scale,rotation:state.rotation,opacity:state.opacity,glow:state.glow,gesture:state.gesture,mapped:state.mapped,twoHand:state.twoHand,mirror:state.mirror};localStorage.setItem("ar-portal-project",JSON.stringify(data));$("saveBtn").textContent="Saved ✓";setTimeout(()=>$("saveBtn").textContent="Save Project",1200);}
function load(){try{const d=JSON.parse(localStorage.getItem("ar-portal-project")||"null");if(!d)return;Object.assign(state,d);$("scale").value=state.scale;$("rotation").value=state.rotation;$("opacity").value=state.opacity;$("glow").value=state.glow;$("gestureSelect").value=state.gesture;$("assetSelect").value=state.mapped;$("twoHand").checked=!!state.twoHand;$("mirror").checked=state.mirror!==false;setAsset(state.mapped);updateLabels();updateMapping();}catch{}}

$("startBtn").addEventListener("click",()=>stream?stop():start());$("emptyStart").addEventListener("click",start);$("switchBtn").addEventListener("click",switchCamera);$("clearBtn").addEventListener("click",()=>{customImage=null;asset="energy";setAsset(asset);clearCanvas();});$("shotBtn").addEventListener("click",screenshot);$("recordBtn").addEventListener("click",()=>recording?stopRecording():startRecording());$("saveBtn").addEventListener("click",save);$("gestureSelect").addEventListener("change",updateMapping);$("assetSelect").addEventListener("change",()=>{updateMapping();setAsset($("assetSelect").value);});
["scale","rotation","opacity","glow"].forEach(id=>$(id).addEventListener("input",updateLabels));$("twoHand").addEventListener("change",e=>state.twoHand=e.target.checked);$("mirror").addEventListener("change",e=>state.mirror=e.target.checked);
document.querySelectorAll(".asset").forEach(btn=>btn.addEventListener("click",()=>setAsset(btn.dataset.asset)));
$("upload").addEventListener("change",e=>{const file=e.target.files?.[0];if(!file)return;const img=new Image();img.onload=()=>{customImage=img;asset="custom";document.querySelectorAll(".asset").forEach(b=>b.classList.remove("active"));$("effectStatus").textContent="Custom";};img.src=URL.createObjectURL(file);});
$("helpBtn").addEventListener("click",()=>alert("Shortcuts: C = camera, S = screenshot, R = recording. Pinch, open hand, fist and peace gestures drive the mapped effect. Two-hand mode uses both hands."));
window.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;const k=e.key.toLowerCase();if(k==="c")stream?stop():start();if(k==="s")screenshot();if(k==="r")recording?stopRecording():startRecording();});
window.addEventListener("resize",()=>{if(stream)fitCanvas();});window.addEventListener("pagehide",stop);window.addEventListener("beforeunload",stop);
load();updateLabels();updateMapping();fitCanvas();
