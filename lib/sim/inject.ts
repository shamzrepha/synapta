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
  var MIN=0.6,MAX=5,zoom=1,box,wrap,bar,stage,base,pan=false,tries=0,done=false,fixedW=false;
  function area(el){var r=el.getBoundingClientRect();return r.width*r.height}
  function pick(){
    if(window.SimKit3D||window.THREE)return null;
    var list=[].slice.call(document.querySelectorAll("svg,canvas")),best=null,ba=0;
    for(var i=0;i<list.length;i++){var el=list[i],r=el.getBoundingClientRect();
      if(r.width<220||r.height<160)continue;
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
    if(build())return;
    // the picture may be drawn a moment after the page loads
    var iv=setInterval(function(){tries++;if(build()||tries>12)clearInterval(iv)},500);
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
