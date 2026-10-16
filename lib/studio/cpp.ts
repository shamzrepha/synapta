/**
 * Arduino C++ → the ES5 the sandboxed runtime executes. Students write (or upload) a normal sketch —
 * `int led = 9; void setup() { … } void loop() { … }` — and it runs on the same engine as blocks and
 * JavaScript. Line numbers are preserved 1:1 so error messages point at the right line.
 *
 * It covers the beginner subset a Tinkercad-style lab uses: typed variables and arrays, #define,
 * functions with typed parameters, casts, integer assignment, Servo, F("…"). Classes, structs,
 * pointers and templates are reported by `cppProblems` instead of being guessed at.
 */

const BASE =
  "long\\s+long|long|int|short|char|byte|word|float|double|bool|boolean|String|size_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|void|auto|Servo|unsigned|signed";
const MODS = "(?:(?:const|static|volatile|register|extern|unsigned|signed)\\s+)*";
const TYPE = `${MODS}(?:${BASE})`;
const INTY = /\b(long|int|short|char|byte|word|size_t|u?int(?:8|16|32|64)_t|unsigned|signed)\b/;

const MARKER = new RegExp(`(^|[;{}\\n(])\\s*(?:${TYPE})\\s+[A-Za-z_]|^\\s*#`, "m");

/** true when the text looks like a C/C++ sketch rather than the older JavaScript style */
export function looksLikeCpp(code: string): boolean {
  return MARKER.test(code);
}

function mask(code: string): { text: string; parts: string[] } {
  const parts: string[] = [];
  let out = "";
  let i = 0;
  const keep = (s: string) => {
    parts.push(s);
    out += `\u0001${parts.length - 1}\u0001`;
  };
  while (i < code.length) {
    const c = code[i];
    if (c === "/" && code[i + 1] === "/") {
      const e = code.indexOf("\n", i);
      const end = e < 0 ? code.length : e;
      keep(code.slice(i, end));
      i = end;
    } else if (c === "/" && code[i + 1] === "*") {
      const e = code.indexOf("*/", i + 2);
      const end = e < 0 ? code.length : e + 2;
      keep(code.slice(i, end));
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
      keep(code.slice(i, j + 1));
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return { text: out, parts };
}

function unmask(text: string, parts: string[]): string {
  return text.replace(/\u0001(\d+)\u0001/g, (_, n) => parts[Number(n)] ?? "");
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** `{1, 2, {3}}` → `[1, 2, [3]]` */
function bracesToArray(s: string): string {
  return s.replace(/\{/g, "[").replace(/\}/g, "]");
}

/** `(int) expr` casts → `__trunc(expr)`; float / double casts just vanish. */
function casts(text: string): string {
  let out = text.replace(/\(\s*(?:float|double)\s*\)\s*/g, "");
  const re = new RegExp(`\\(\\s*(?:${MODS}(?:long\\s+long|long|int|short|char|byte|word|size_t|u?int(?:8|16|32|64)_t|unsigned))\\s*\\)\\s*`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) {
    let j = m.index + m[0].length;
    const start = j;
    if (out[j] === "(") {
      let d = 0;
      for (; j < out.length; j++) {
        if (out[j] === "(") d++;
        else if (out[j] === ")" && --d === 0) {
          j++;
          break;
        }
      }
    } else {
      // an operand: name or number with calls, indexes and members attached
      const op = /^-?[\w.\u0001]+/.exec(out.slice(j));
      if (!op) continue;
      j += op[0].length;
      for (;;) {
        const c = out[j];
        if (c !== "(" && c !== "[") break;
        const close = c === "(" ? ")" : "]";
        let d = 0;
        for (; j < out.length; j++) {
          if (out[j] === c) d++;
          else if (out[j] === close && --d === 0) {
            j++;
            break;
          }
        }
      }
    }
    const operand = out.slice(start, j);
    out = out.slice(0, m.index) + `__trunc(${operand})` + out.slice(j);
    re.lastIndex = m.index + 8;
  }
  return out;
}

function params(list: string): string {
  if (/^\s*(void)?\s*$/.test(list)) return "";
  return splitTop(list)
    .map((p) => {
      const name = p.replace(/\[[^\]]*\]/g, "").replace(/=.*$/, "").match(/([A-Za-z_]\w*)\s*$/);
      return name ? name[1] : "";
    })
    .filter(Boolean)
    .join(", ");
}

export function cppToJs(code: string): string {
  if (!looksLikeCpp(code)) return code;
  const { text: t0, parts } = mask(code);
  let t = t0;

  // preprocessor: #include / #pragma vanish, #define NAME value becomes a variable
  t = t.replace(/^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)[ \t]+([^\n]*)$/gm, (_, n, v) => `var ${n} = ${v.trim()};`);
  t = t.replace(/^[ \t]*#[^\n]*$/gm, "");

  // functions: prototypes disappear, definitions lose their types
  t = t.replace(new RegExp(`(^|[;{}\\n])([ \\t]*)(?:${TYPE})[\\t ]+([A-Za-z_]\\w*)\\s*\\(([^()]*)\\)\\s*(;|(?=\\s*\\{))`, "g"), (_, pre, sp, name, ps, end) =>
    end === ";" ? `${pre}${sp}` : `${pre}${sp}function ${name}(${params(ps)}) `
  );

  // variable declarations (also inside for-headers)
  const ints = new Set<string>();
  t = t.replace(new RegExp(`(^|[;{}\\n(])([ \\t]*)(${TYPE})\\s+((?:[^;{}]|\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\})*?);`, "g"), (all, pre, sp, type, rest) => {
    const isFor = pre === "(";
    const isString = /\bString\b/.test(type);
    const isInt = INTY.test(type) && !/\b(float|double)\b/.test(type);
    const isServo = /\bServo\b/.test(type);
    const decls = splitTop(rest).map((d) => {
      const m = /^\s*[*&]*\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*(?:=\s*([\s\S]*))?$/.exec(d);
      if (!m) return null;
      const [, name, dim, init] = m;
      if (isInt && !dim) ints.add(name);
      if (dim) {
        if (init !== undefined) return `${name} = ${bracesToArray(init.trim())}`;
        const size = dim.slice(1, -1).trim();
        return `${name} = __arr(${size || 0}, ${isString ? '""' : 0})`;
      }
      if (isServo) return `${name} = new Servo()`;
      if (init === undefined || init.trim() === "") return `${name} = ${isString ? '""' : 0}`;
      return isInt && !isFor && !/^\s*[{"'\u0001]/.test(init) ? `${name} = __int(${init.trim()})` : `${name} = ${init.trim()}`;
    });
    if (decls.some((d) => d === null)) return all;
    return `${pre}${sp}var ${decls.join(", ")};`;
  });

  // plain assignments to int variables truncate like C does
  if (ints.size) {
    const names = Array.from(ints).join("|");
    t = t.replace(new RegExp(`(^|[;{}\\n])([ \\t]*)(${names})([ \\t]*)=(?!=)([ \\t]*)([^;{}=]*[^;{}=\\s][^;{}]*?);`, "g"), (all, pre, sp, name, s2, s3, rhs) =>
      /^[{"'\u0001]/.test(rhs.trim()) || /^__int\(/.test(rhs.trim()) ? all : `${pre}${sp}${name}${s2}=${s3}__int(${rhs.trim()});`
    );
  }

  t = casts(t);
  return unmask(t, parts);
}

/** Things the simulator can't run, with the line they are on, so the student knows why. */
export function cppProblems(code: string): Array<{ line: number; message: string }> {
  const { text } = mask(code);
  const out: Array<{ line: number; message: string }> = [];
  text.split("\n").forEach((ln, i) => {
    const line = i + 1;
    if (/^\s*(class|struct|enum|template|namespace|typedef)\b/.test(ln)) out.push({ line, message: "Classes, structs and enums aren't simulated — use plain variables and functions." });
    else if (/->|\bnew\s+\w|\bdelete\b/.test(ln) && !/__/.test(ln)) out.push({ line, message: "Pointers and dynamic memory aren't simulated." });
  });
  for (const m of code.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)) {
    const lib = m[1];
    if (!/^(Servo|Arduino|Wire|Stepper)\.h$/.test(lib)) {
      out.push({ line: code.slice(0, m.index).split("\n").length, message: `The library ${lib} isn't simulated — the sketch will run without it.` });
    }
  }
  return out;
}
