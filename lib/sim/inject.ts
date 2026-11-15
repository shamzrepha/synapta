/** The sandbox policy and host bridge added to every simulation. Pure strings: safe to import from client code. */

export const SIM_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/** Runs inside the sandbox; the parent only listens to messages from this exact iframe. */
export const SIM_BRIDGE_SCRIPT = `<script>
(function () {
  function send(type, detail) {
    try { parent.postMessage({ source: "sunroot-sim", type: type, detail: detail || null }, "*"); } catch (e) {}
    try { parent.postMessage({ source: "synapta-sim", type: type, detail: detail || null }, "*"); } catch (e) {}
  }
  var bridge = {
    complete: function (detail) { send("goal_complete", detail); },
    progress: function (detail) { send("progress", detail); },
    /** the tutor speaks: say("Nice! Now double the mass.", { tone: "praise" | "hint" | "ask" | "warn" }) */
    say: function (text, opts) { send("tutor_say", { text: String(text || "").slice(0, 400), tone: (opts && opts.tone) || "hint" }); },
    /** a reward the learner just earned: award({ stars: 1, xp: 10, label: "Perfect launch" }) */
    award: function (detail) { send("award", detail); }
  };
  window.sunroot = bridge;
  window.synapta = bridge;
  window.addEventListener("error", function (e) { send("runtime_error", { message: String((e && e.message) || "Script error") }); });
  // Sandboxed (opaque-origin) frames throw on storage access; give generated code a harmless stand-in.
  try { window.localStorage.getItem("x"); } catch (e) {
    var mem = {};
    var fake = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; }, clear: function () { mem = {}; } };
    try { Object.defineProperty(window, "localStorage", { value: fake }); Object.defineProperty(window, "sessionStorage", { value: fake }); } catch (e2) {}
  }
  window.alert = function (m) { send("progress", { message: String(m) }); };
  window.confirm = function () { return true; };
  window.prompt = function () { return null; };
})();
</script>`;

/** Everything we add to the model's document. Kept as one exact string so edits can remove it again. */
export const SIM_HEAD_INJECT = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SIM_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1">${SIM_BRIDGE_SCRIPT}`;

/**
 * Shown-time patch for EVERY lab, including ones generated long ago: makes the page fit the device and turns raw LaTeX
 * or Markdown in the lab's own text into readable symbols. ES5 on purpose (runs inside the sandboxed frame).
 * Kept in sync with lib/text/readable.ts by a test.
 */
export const LAB_CLEAN_TEXT_JS = `function sunrootClean(t){
  if(!t||!/[\\\\$_^*\`#]/.test(t))return t;
  var SYM={times:"×",cdot:"·",div:"÷",pm:"±",mp:"∓",leq:"≤",le:"≤",geq:"≥",ge:"≥",neq:"≠",ne:"≠",approx:"≈",sim:"∼",equiv:"≡",propto:"∝",infty:"∞",partial:"∂",nabla:"∇",sum:"Σ",prod:"Π",int:"∫",degree:"°",circ:"°",rightarrow:"→",to:"→",leftarrow:"←",Rightarrow:"⇒",Leftarrow:"⇐",leftrightarrow:"↔",Leftrightarrow:"⇔",alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",varepsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",pi:"π",rho:"ρ",sigma:"σ",tau:"τ",phi:"φ",varphi:"φ",chi:"χ",psi:"ψ",omega:"ω",Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Pi:"Π",Sigma:"Σ",Phi:"Φ",Psi:"Ψ",Omega:"Ω","in":"∈",notin:"∉",subset:"⊂",cup:"∪",cap:"∩",forall:"∀",exists:"∃",neg:"¬",land:"∧",lor:"∨",ldots:"…",dots:"…",cdots:"⋯",angle:"∠",perp:"⊥",parallel:"∥",hbar:"ħ",ell:"ℓ",prime:"′",quad:" ",qquad:"  ",",":" ",";":" ","!":""," ":" "};
  var SUP={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻",n:"ⁿ",i:"ⁱ"};
  var SUB={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋",n:"ₙ",i:"ᵢ",x:"ₓ"};
  function sc(b,m,k){var o="",ok=true;for(var i=0;i<b.length;i++){var c=m[b.charAt(i)];if(!c){ok=false;break}o+=c}if(ok)return o;return /^[A-Za-z0-9]+$/.test(b)?k+b:k+"("+b+")"}
  function tex(s){
    s=s.replace(/\\\\(?:text|mathrm|mathbf|mathit|textbf|operatorname|mathcal|boldsymbol)\\s*\\{([^{}]*)\\}/g,"$1");
    s=s.replace(/\\^\\s*\\{([^{}]*)\\}/g,function(m,a){return sc(a,SUP,"^")});
    s=s.replace(/_\\s*\\{([^{}]*)\\}/g,function(m,a){return sc(a,SUB,"_")});
    for(var i=0;i<3;i++){
      s=s.replace(/\\\\[dt]?frac\\s*\\{([^{}]*)\\}\\s*\\{([^{}]*)\\}/g,function(m,a,b){return"("+a+")/("+b+")"});
      s=s.replace(/\\\\sqrt\\s*\\[([^\\]]*)\\]\\s*\\{([^{}]*)\\}/g,function(m,n,a){return n+"√("+a+")"});
      s=s.replace(/\\\\sqrt\\s*\\{([^{}]*)\\}/g,function(m,a){return"√("+a+")"});
      s=s.replace(/\\\\(?:overline|bar|vec|hat)\\s*\\{([^{}]*)\\}/g,"$1");
    }
    s=s.replace(/\\^([0-9n+-])/g,function(m,a){return SUP[a]||"^"+a});
    s=s.replace(/\\\\left\\s*([([|])/g,"$1").replace(/\\\\right\\s*([)\\]|])/g,"$1");
    s=s.replace(/\\\\([A-Za-z]+|[,;! ])/g,function(m,n){return SYM.hasOwnProperty(n)?SYM[n]:n});
    s=s.replace(/\\\\([{}%&#_$])/g,"$1");
    return s.replace(/[{}]/g,"").replace(/ {2,}/g," ");
  }
  t=t.replace(/\\$\\$([\\s\\S]+?)\\$\\$|\\$([^\\s$0-9][^$\\n]*?)\\$/g,function(m,a,b){return tex(a||b||"")});
  t=tex(t);
  return t.replace(/(\\*\\*|__)(.+?)\\1/g,"$2").replace(/\`([^\`]+)\`/g,"$1");
}`;

/**
 * Look around any 2D lab like in Tinkercad: zoom in and out, move the view, fit it back. Many generated labs draw a circuit or diagram that is
 * bigger than a phone screen and stop the page from scrolling, so the bottom (a probe, a switch) cannot be reached. The biggest picture (SVG
 * or canvas) is put in a box that scrolls, and zooming changes its size on the page (not a transform), so the lab's own taps and drags still
 * land in the right place. + and - zoom, Fit resets, Move turns dragging into moving the view, two fingers pinch, the wheel zooms.
 * ES5 on purpose (runs inside the sandboxed frame).
 */
export const LAB_VIEW_JS = `(function(){
  if(window.__sunrootView)return;window.__sunrootView=1;
  var MIN=0.6,MAX=5,zoom=1,box,wrap,bar,stage,base,pan=false,tries=0,done=false,fixedW=false,hadErr=false;
  window.addEventListener("error",function(){hadErr=true});
  function heal2D(){
    if(window.SimKit3D||window.THREE)return;
    var sliders=[].slice.call(document.querySelectorAll('input[type="range"]'));
    function syncOut(inp){
      var v=Number(inp.value),txt=isFinite(v)?(Math.abs(v)>=100||Math.floor(v)===v?String(v):v.toFixed(2).replace(/\\.?0+$/,"")):inp.value;
      var nx=inp.nextElementSibling;
      if(nx&&(nx.tagName==="SPAN"||nx.tagName==="OUTPUT"||nx.tagName==="STRONG"||nx.tagName==="B")){
        var u=(nx.textContent||"").match(/[a-zA-Z°%Ωµ/²³]+$/);nx.textContent=txt+(u?" "+u[0]:"");return;
      }
      if(inp.id){
        var sfx=["-val","-value","_val","_value","Val","Value","-out","-readout"];
        for(var k=0;k<sfx.length;k++){var el=document.getElementById(inp.id+sfx[k]);if(el){el.textContent=txt;return;}}
      }
    }
    for(var s=0;s<sliders.length;s++){
      (function(inp){syncOut(inp);inp.addEventListener("input",function(){syncOut(inp)});inp.addEventListener("change",function(){syncOut(inp)})})(sliders[s]);
    }
    var svg=document.querySelector("svg:not([width='16']):not([width='20']):not([width='24'])");
    if(svg&&svg.querySelectorAll("path,circle,rect,line,polygon,polyline").length>3&&!hadErr)return;
    var cv=document.querySelector("#stage canvas, .stage canvas, main canvas, canvas");
    if(!cv){
      var st=document.querySelector("#stage, #sim-stage, #viewport, #canvas-container, .stage");
      if(st){cv=document.createElement("canvas");st.appendChild(cv);}
    }
    if(!cv||cv.dataset.simkit3d)return;
    var ctx=null;try{ctx=cv.getContext("2d")}catch(e){}
    if(!ctx)return;
    if(cv.width<=300&&cv.height<=150){cv.width=680;cv.height=360;cv.style.width="100%";cv.style.minHeight="320px";}
    var blank=hadErr;
    if(!blank){
      try{
        var d=ctx.getImageData(0,0,Math.min(64,cv.width),Math.min(64,cv.height)).data,diff=0;
        for(var p=0;p<d.length;p+=16){if(Math.abs(d[p]-d[0])+Math.abs(d[p+1]-d[1])+Math.abs(d[p+2]-d[2])+Math.abs(d[p+3]-d[3])>15)diff++;}
        if(diff<=3)blank=true;
      }catch(e){}
    }
    if(!blank)return;
    if(cv.__healed2d)return;cv.__healed2d=1;
    var t0=performance.now();
    function norm(inp,fb){
      if(!inp)return fb;
      var mn=inp.min!==""?Number(inp.min):0,mx=inp.max!==""?Number(inp.max):100,v=Number(inp.value);
      if(!isFinite(mn))mn=0;if(!isFinite(mx)||mx<=mn)mx=mn+100;if(!isFinite(v))v=(mn+mx)/2;
      return Math.max(0,Math.min(1,(v-mn)/(mx-mn)));
    }
    function lbl(inp,i){
      if(!inp)return"P"+(i+1);
      var l=inp.id&&document.querySelector('label[for="'+inp.id+'"]');
      if(!l)l=inp.closest("label")||inp.previousElementSibling;
      var tx=l&&l.textContent?l.textContent.split(":")[0].trim():inp.name||inp.id||("Param "+(i+1));
      return tx.slice(0,18);
    }
    function loop(now){
      requestAnimationFrame(loop);
      var W=cv.width||680,H=cv.height||360,t=(now-t0)/1000;
      var n0=norm(sliders[0],0.55),n1=norm(sliders[1],0.45),n2=norm(sliders[2],0.5);
      ctx.fillStyle="#0f172a";ctx.fillRect(0,0,W,H);
      ctx.strokeStyle="rgba(148,163,184,0.14)";ctx.lineWidth=1;
      for(var gx=40;gx<W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
      for(var gy=40;gy<H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
      var cy=H*0.54,amp=(0.18+n0*0.62)*(H*0.36),freq=1.2+n1*3.8,spd=1.2+n2*3.2;
      ctx.strokeStyle="rgba(148,163,184,0.45)";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(40,cy);ctx.lineTo(W-24,cy);ctx.moveTo(60,28);ctx.lineTo(60,H-28);ctx.stroke();
      ctx.strokeStyle="#38bdf8";ctx.lineWidth=3;ctx.beginPath();
      for(var x=60;x<=W-28;x+=3){
        var u=(x-60)/(W-88);
        var y=cy-Math.sin(u*freq*Math.PI*2-t*spd)*amp*Math.exp(-u*(1-n2)*0.7);
        if(x===60)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
      var px=60+((t*0.22*(0.6+n1))%1)*(W-88),pu=(px-60)/(W-88);
      var py=cy-Math.sin(pu*freq*Math.PI*2-t*spd)*amp*Math.exp(-pu*(1-n2)*0.7);
      ctx.fillStyle="#facc15";ctx.beginPath();ctx.arc(px,py,9,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#22c55e";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+28+n1*35,py-(py-cy)*0.45);ctx.stroke();
      ctx.fillStyle="rgba(15,23,42,0.85)";ctx.fillRect(14,12,Math.min(W-28,440),34);
      ctx.fillStyle="#e2e8f0";ctx.font="600 13px system-ui,sans-serif";
      var hud=[];
      for(var h=0;h<Math.min(3,sliders.length);h++){hud.push(lbl(sliders[h],h)+": "+sliders[h].value);}
      ctx.fillText(hud.length?hud.join("   |   "):"Interactive 2D Simulation Stage",24,33);
    }
    requestAnimationFrame(loop);
  }
  function area(el){var r=el.getBoundingClientRect();return r.width*r.height}
  function pick(){
    if(window.SimKit3D||window.THREE)return null;
    var list=[].slice.call(document.querySelectorAll("svg,canvas")),best=null,ba=0;
    for(var i=0;i<list.length;i++){var el=list[i],r=el.getBoundingClientRect();
      if(r.width<220||r.height<140)continue;
      if(el.closest("button,[role=button],nav,header"))continue;
      var cs=getComputedStyle(el);if(cs.display==="none"||cs.visibility==="hidden")continue;
      var a=r.width*r.height;if(a>ba){ba=a;best=el}}
    return best;
  }
  function measure(){stage.style.width="";stage.style.height="";stage.style.maxWidth="";stage.style.maxHeight="";var r=stage.getBoundingClientRect();base={w:r.width,h:r.height}}
  function apply(){
    if(zoom===1){stage.style.width="";stage.style.height="";stage.style.maxWidth="";stage.style.maxHeight=""}
    else{stage.style.maxWidth="none";stage.style.maxHeight="none";stage.style.width=base.w*zoom+"px";stage.style.height=base.h*zoom+"px"}
    label.textContent=Math.round(zoom*100)+"%";
  }
  function setZoom(z,cx,cy){
    z=Math.max(MIN,Math.min(MAX,z));if(z===zoom)return;
    var r=wrap.getBoundingClientRect(),px=(cx==null?r.width/2:cx-r.left),py=(cy==null?r.height/2:cy-r.top);
    var k=z/zoom,sl=wrap.scrollLeft,st=wrap.scrollTop;zoom=z;apply();
    wrap.scrollLeft=(sl+px)*k-px;wrap.scrollTop=(st+py)*k-py;
  }
  function fit(){zoom=1;apply();wrap.scrollLeft=0;wrap.scrollTop=0}
  var label;
  function btn(text,title,fn){var b=document.createElement("button");b.type="button";b.textContent=text;b.title=title;b.setAttribute("aria-label",title);
    b.style.cssText="all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 10px;border-radius:12px;background:rgba(15,23,42,.88);color:#fff;font:700 18px system-ui,sans-serif;border:1px solid rgba(148,163,184,.5);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent";
    b.addEventListener("click",function(e){e.stopPropagation();fn()});return b}
  var moveBtn,shield;
  function setPan(on){pan=on;moveBtn.style.background=on?"#2563eb":"rgba(15,23,42,.88)";shield.style.display=on?"block":"none"}
  function build(){
    stage=pick();if(!stage||done)return false;done=true;
    var r=stage.getBoundingClientRect(),par=stage.parentNode;
    box=document.createElement("div");box.className="sunroot-viewbox";
    wrap=document.createElement("div");wrap.className="sunroot-view";
    fixedW=r.width<par.getBoundingClientRect().width*0.95;
    box.style.cssText="position:relative;display:block;max-width:100%;"+(fixedW?"width:"+r.width+"px;":"width:100%;")+"height:"+r.height+"px";
    wrap.style.cssText="position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain";
    stage.style.display="block";
    par.insertBefore(box,stage);box.appendChild(wrap);wrap.appendChild(stage);
    shield=document.createElement("div");shield.style.cssText="position:absolute;inset:0;z-index:4;display:none;cursor:grab;touch-action:none";box.appendChild(shield);
    bar=document.createElement("div");bar.className="sunroot-viewbar";
    bar.style.cssText="position:fixed;right:6px;top:50%;transform:translateY(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:6px;align-items:center;opacity:.55;transition:opacity .25s;touch-action:manipulation";
    var fade;function wake(){bar.style.opacity="1";clearTimeout(fade);fade=setTimeout(function(){bar.style.opacity=".55"},2600)}
    bar.addEventListener("pointerdown",wake);
    label=document.createElement("span");label.style.cssText="all:initial;color:#cbd5e1;font:600 12px system-ui,sans-serif;min-width:40px;text-align:center;text-shadow:0 1px 2px #000";
    moveBtn=btn("\\u270B","Move the view",function(){setPan(!pan)});
    bar.appendChild(label);bar.appendChild(btn("\\u2212","Zoom out",function(){setZoom(zoom/1.35)}));bar.appendChild(btn("+","Zoom in",function(){setZoom(zoom*1.35)}));
    bar.appendChild(btn("Fit","Fit to screen",fit));bar.appendChild(moveBtn);document.body.appendChild(bar);
    measure();apply();
    // move: drag the picture
    var ptrs={},drag=null,pinch=null;
    function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
    function down(e){ptrs[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(ptrs);
      if(ids.length===2){var a=ptrs[ids[0]],b=ptrs[ids[1]];pinch={d:dist(a,b),z:zoom};drag=null}
      else if(ids.length===1&&e.currentTarget===shield){drag={x:e.clientX,y:e.clientY,l:wrap.scrollLeft,t:wrap.scrollTop};try{shield.setPointerCapture(e.pointerId)}catch(x){}}}
    function move(e){if(!ptrs[e.pointerId])return;ptrs[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(ptrs);
      if(ids.length===2&&pinch){var a=ptrs[ids[0]],b=ptrs[ids[1]];setZoom(pinch.z*dist(a,b)/pinch.d,(a.x+b.x)/2,(a.y+b.y)/2);e.preventDefault()}
      else if(drag){wrap.scrollLeft=drag.l-(e.clientX-drag.x);wrap.scrollTop=drag.t-(e.clientY-drag.y);e.preventDefault()}}
    function up(e){delete ptrs[e.pointerId];pinch=null;if(Object.keys(ptrs).length<2&&drag&&Object.keys(ptrs).length===0)drag=null;if(!Object.keys(ptrs).length)drag=null}
    shield.addEventListener("pointerdown",down);shield.addEventListener("pointermove",move);shield.addEventListener("pointerup",up);shield.addEventListener("pointercancel",up);
    // two fingers pinch even when the lab is in control of single touches
    wrap.addEventListener("pointerdown",down,true);wrap.addEventListener("pointermove",move,true);wrap.addEventListener("pointerup",up,true);wrap.addEventListener("pointercancel",up,true);
    wrap.addEventListener("wheel",function(e){e.preventDefault();setZoom(zoom*(e.deltaY<0?1.15:1/1.15),e.clientX,e.clientY)},{passive:false});
    var rt;window.addEventListener("resize",function(){clearTimeout(rt);rt=setTimeout(function(){var z=zoom;zoom=1;apply();var rr=box.getBoundingClientRect();measure();box.style.height=base.h+"px";zoom=z;apply()},200)});
    return true;
  }
  function start(){
    heal2D();
    if(build())return;
    // the picture may be drawn a moment after the page loads
    var iv=setInterval(function(){heal2D();tries++;if(build()||tries>12)clearInterval(iv)},500);
  }
  if(document.readyState==="complete")setTimeout(start,300);else window.addEventListener("load",function(){setTimeout(start,300)});
})();`;

export const LAB_DISPLAY_PATCH = `<style id="sunroot-fit">*,*::before,*::after{box-sizing:border-box}html,body{max-width:100vw;overflow-x:hidden;overflow-y:auto!important;-webkit-text-size-adjust:100%}canvas,svg,img,video{max-width:100%}body{overscroll-behavior:contain}button,input,select,[role=button]{min-height:36px}</style><script id="sunroot-clean">(function(){${LAB_CLEAN_TEXT_JS}
  function walk(root){
    if(!root)return;
    var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),n,list=[];
    while((n=w.nextNode())){var p=n.parentNode&&n.parentNode.nodeName;if(p==="SCRIPT"||p==="STYLE"||p==="TEXTAREA"||p==="NOSCRIPT")continue;list.push(n)}
    for(var i=0;i<list.length;i++){var v=list[i].nodeValue,c=sunrootClean(v);if(c!==v)list[i].nodeValue=c}
  }
  var busy=false;
  function schedule(){if(busy)return;busy=true;(window.requestAnimationFrame||setTimeout)(function(){busy=false;walk(document.body)})}
  function start(){walk(document.body);try{new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true})}catch(e){}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();</script><script id="sunroot-view">${LAB_VIEW_JS}</script>`;

/** Adds the display patch once, right after the host's own head injection. */
export function withDisplayPatch(html: string): string {
  if (html.includes('id="sunroot-fit"')) return html;
  if (html.includes(SIM_HEAD_INJECT)) return html.replace(SIM_HEAD_INJECT, () => SIM_HEAD_INJECT + LAB_DISPLAY_PATCH);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + LAB_DISPLAY_PATCH);
  return LAB_DISPLAY_PATCH + html;
}
