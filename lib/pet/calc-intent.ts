export const CALC_EVENT = "sunroot:calculator";

export interface CalcEventDetail {
  open?: boolean;
  toggle?: boolean;
  expr?: string;
  label?: string;
  auto?: boolean;
  source?: string;
}

export function dispatchCalculatorEvent(detail: CalcEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CalcEventDetail>(CALC_EVENT, { detail }));
}

export interface CalculatorRequestMatch {
  shouldOpen: boolean;
  /** True when the user asked ONLY to summon/open the calculator (no extra question to ask AI) */
  calculatorOnly: boolean;
  expr: string | null;
}

export interface TutorCalculatorDirective {
  cleanText: string;
  shouldSuggest: boolean;
  autoOpen: boolean;
  expr: string | null;
}

const TOOL_TAG_RE = /\[\[\s*tool\s*:\s*calculator(?:\s*\|\s*([^\]]*))?\s*\]\]/gi;

function sanitizeMathExpr(raw: string): string | null {
  const cleaned = raw
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√([0-9.a-zA-Z]+)/g, "sqrt($1)")
    .replace(/[?,;!.]+$/g, "")
    .trim();

  if (!cleaned || cleaned.length > 100) return null;
  if (/[^0-9a-zA-Z_+\-*/^().,\s]/.test(cleaned)) return null;
  if (!/[0-9]/.test(cleaned) && !/\b(?:sin|cos|tan|sqrt|log|ln|pi)\b/i.test(cleaned)) return null;
  return cleaned;
}

/**
 * Detects when a learner asks Sprout or the Tutor to bring up the overlay calculator
 * or compute a specific numeric/symbolic formula.
 */
export function parseCalculatorRequest(userText: string): CalculatorRequestMatch {
  const text = (userText || "").trim();
  if (!text) return { shouldOpen: false, calculatorOnly: false, expr: null };

  const openVerb =
    /\b(?:open|show|bring|pull\s*up|launch|start|toggle|give\s+me|need|use)\b.*\b(?:calc|calculator|graphing\s+calculator|scientific\s+calculator)\b/i;
  const calcPhrase = /^(?:sprout[,:\s]+)?(?:calculator|calc)(?:\s+please)?[.!?]*$/i;
  const computePrefix = /^(?:sprout[,:\s]+)?(?:calculate|compute|evaluate|solve\s+for\s+value|what\s+is)\s+(.+)$/i;

  // Extract inline formula candidate if any
  const formulaMatch =
    text.match(/`([^`]{2,80})`/) ||
    text.match(/([0-9(√\-][0-9a-zA-Z_+\-*/^().,\s×÷−π√]*[+\-*/^√][0-9a-zA-Z_+\-*/^().,\s×÷−π√]*)/);
  const extracted = formulaMatch?.[1] ? sanitizeMathExpr(formulaMatch[1]) : null;

  if (calcPhrase.test(text)) {
    return { shouldOpen: true, calculatorOnly: true, expr: extracted };
  }

  if (openVerb.test(text)) {
    const stripped = text
      .replace(/\b(?:hey\s+)?sprout\b/gi, "")
      .replace(openVerb, "")
      .replace(/\b(?:please|can\s+you|for\s+me)\b/gi, "")
      .trim();
    const onlyOpen = stripped.length < 4;
    return { shouldOpen: true, calculatorOnly: onlyOpen, expr: extracted };
  }

  const m = computePrefix.exec(text);
  if (m && m[1]) {
    const candidate = sanitizeMathExpr(m[1]);
    if (candidate) {
      return { shouldOpen: true, calculatorOnly: false, expr: candidate };
    }
  }

  // Direct expression like "45 * sin(30)" or "(12+8)^2/5"
  if (/^[0-9(\-√]/.test(text) && !/\b(?:why|how|explain|what|who|when)\b/i.test(text)) {
    const candidate = sanitizeMathExpr(text);
    if (candidate && /[+\-*/^]|\b(?:sin|cos|tan|sqrt|log|ln)\b/i.test(candidate)) {
      return { shouldOpen: true, calculatorOnly: false, expr: candidate };
    }
  }

  return { shouldOpen: false, calculatorOnly: false, expr: null };
}

/**
 * Parses `[[tool:calculator|expr=...|auto=1]]` directives emitted by Sprout/Tutor
 * and cleans all raw tool markers out of learner-visible reply text.
 */
export function extractTutorCalculatorDirective(
  replyText: string,
  userMessage?: string
): TutorCalculatorDirective {
  let raw = String(replyText || "");
  let hasTag = false;
  let autoOpen = false;
  let tagExpr: string | null = null;

  raw = raw.replace(TOOL_TAG_RE, (_full, payload: string | undefined) => {
    hasTag = true;
    const parts = (payload || "").split("|").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const [k, ...rest] = part.split("=");
      const val = rest.join("=").trim();
      const key = (k || "").toLowerCase();
      if (key === "expr" && val) {
        tagExpr = sanitizeMathExpr(val) || val.slice(0, 80);
      } else if (key === "auto" && (val === "1" || val === "true" || !val)) {
        autoOpen = true;
      }
    }
    return "";
  });

  const cleanText = raw.replace(/\n{3,}/g, "\n\n").trim();

  if (hasTag) {
    const userReq = userMessage ? parseCalculatorRequest(userMessage) : null;
    return {
      cleanText,
      shouldSuggest: true,
      autoOpen: autoOpen || Boolean(userReq?.shouldOpen),
      expr: tagExpr || userReq?.expr || null,
    };
  }

  // Fallback heuristic when a model worked out a quantitative calculation without emitting the tag
  const req = userMessage ? parseCalculatorRequest(userMessage) : null;
  const eqMatch = cleanText.match(
    /([0-9(][0-9.\s+\-*/^()×÷−]{2,48})\s*=\s*-?\d+(?:\.\d+)?/
  );
  const candidateExpr = eqMatch?.[1] ? sanitizeMathExpr(eqMatch[1]) : null;
  const quantitativeCue = Boolean(
    candidateExpr ||
      req?.shouldOpen ||
      /\b(?:use\s+(?:a|your|the)\s+calculator|plug\s+in|compute\s+this|calculate\s+this)\b/i.test(cleanText)
  );

  return {
    cleanText,
    shouldSuggest: quantitativeCue,
    autoOpen: Boolean(req?.shouldOpen),
    expr: candidateExpr || req?.expr || null,
  };
}
