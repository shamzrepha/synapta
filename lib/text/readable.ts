/**
 * AI text sometimes arrives with raw LaTeX (\frac{a}{b}, \times, ^{2}) or Markdown (**bold**, `code`) in places that do
 * not render it. These helpers turn that into plain, human-readable text. Anything inside $...$ is left alone for KaTeX.
 */
const SYMBOLS: Record<string, string> = {
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", sim: "∼",
  equiv: "≡", propto: "∝", infty: "∞", partial: "∂", nabla: "∇", sum: "Σ", prod: "Π", int: "∫", degree: "°", circ: "°",
  rightarrow: "→", to: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", lambda: "λ",
  mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  in: "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  ldots: "…", dots: "…", cdots: "⋯", angle: "∠", perp: "⊥", parallel: "∥", hbar: "ħ", ell: "ℓ", prime: "′",
  quad: " ", qquad: "  ", ",": " ", ";": " ", "!": "", " ": " ",
};

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", n: "ₙ", i: "ᵢ", x: "ₓ" };

function script(body: string, map: Record<string, string>, marker: string): string {
  const out = [...body].map((c) => map[c]);
  if (out.every(Boolean)) return out.join("");
  return /^[A-Za-z0-9]+$/.test(body) ? `${marker}${body}` : `${marker}(${body})`;
}

/** LaTeX with no math delimiters → readable Unicode. Handles the common commands; unknown ones lose their backslash. */
export function latexToUnicode(input: string): string {
  let s = input;
  // \text{...}, \mathrm{...}, \mathbf{...} and friends just show their content
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|textbf|operatorname|mathcal|boldsymbol)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_m, a: string) => script(a, SUP, "^"));
  s = s.replace(/_\s*\{([^{}]*)\}/g, (_m, a: string) => script(a, SUB, "_"));
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => `(${a})/(${b})`);
    s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_m, n: string, a: string) => `${n}√(${a})`);
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√(${a})`);
    s = s.replace(/\\(?:overline|bar|vec|hat)\s*\{([^{}]*)\}/g, "$1");
  }
  s = s.replace(/\^([0-9n+-])/g, (_m, a: string) => SUP[a] ?? `^${a}`);
  s = s.replace(/\\left\s*([([|])/g, "$1").replace(/\\right\s*([)\]|])/g, "$1");
  s = s.replace(/\\([A-Za-z]+|[,;! ])/g, (_m, name: string) => (name in SYMBOLS ? SYMBOLS[name] : name));
  s = s.replace(/\\([{}%&#_$])/g, "$1");
  return s.replace(/[{}]/g, "").replace(/ {2,}/g, " ");
}

/** Applies fn only to the parts of the text that are outside $...$ / $$...$$ math spans. */
function outsideMath(text: string, fn: (s: string) => string): string {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return parts.map((p, i) => (i % 2 === 1 ? p : fn(p))).join("");
}

/** For text rendered as Markdown + KaTeX: standardises math delimiters and makes stray LaTeX readable. */
export function normalizeMath(text: string): string {
  if (!text) return text;
  let s = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, a: string) => `$$${a.trim()}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, a: string) => `$${a.trim()}$`);
  s = outsideMath(s, (p) => (/\\[A-Za-z]|[\^_]\{/.test(p) ? latexToUnicode(p) : p));
  return s;
}

/** For text shown with no Markdown at all (labels, chips, tooltips): no markup characters, math as Unicode. */
export function readableText(text: string | undefined | null): string {
  if (!text) return "";
  let s = String(text);
  s = s.replace(/\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g, (_m, a?: string, b?: string) => latexToUnicode(a ?? b ?? ""));
  s = s.replace(/\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g, (_m, a?: string, b?: string) => latexToUnicode(a ?? b ?? ""));
  s = latexToUnicode(s);
  s = s
    .replace(/^\[Page \d+\]\s*/i, "")
    .replace(/\s*\[Page \d+\]/gi, "")
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}
