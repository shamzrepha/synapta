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

export const LAB_DISPLAY_PATCH = `<style id="sunroot-fit">*,*::before,*::after{box-sizing:border-box}html,body{max-width:100vw;overflow-x:hidden;-webkit-text-size-adjust:100%}canvas,svg,img,video{max-width:100%}body{overscroll-behavior:contain}button,input,select,[role=button]{min-height:36px}</style><script id="sunroot-clean">(function(){${LAB_CLEAN_TEXT_JS}
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
})();</script>`;

/** Adds the display patch once, right after the host's own head injection. */
export function withDisplayPatch(html: string): string {
  if (html.includes('id="sunroot-fit"')) return html;
  if (html.includes(SIM_HEAD_INJECT)) return html.replace(SIM_HEAD_INJECT, () => SIM_HEAD_INJECT + LAB_DISPLAY_PATCH);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + LAB_DISPLAY_PATCH);
  return LAB_DISPLAY_PATCH + html;
}
