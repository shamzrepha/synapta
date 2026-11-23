/**
 * Older saved solutions were written before the model was told to use LaTeX, so they hold plain text like "O(n^2)" or
 * "n^(log_2 2)". This wraps those pieces in $...$ so they render as maths. Text that is already between $ signs, or in
 * code, is left alone. It only wraps patterns that clearly are maths (a power or a subscript, or an O/Theta/Omega call).
 */
const SKIP = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|`[^`\n]+`)/g;

const BIG_O = String.raw`[OΘΩ]\((?:[^()\n]|\([^()\n]*\))*\)`;
const POWER = String.raw`[A-Za-z0-9]+(?:\^(?:\([^()\n]*\)|\{[^{}\n]*\}|-?[A-Za-z0-9]+)|_(?:\([^()\n]*\)|\{[^{}\n]*\}|[A-Za-z0-9]+))+`;
const TOKEN = new RegExp(`(${BIG_O})|(${POWER})`, "g");

function latex(piece: string): string {
  return piece
    .replace(/Θ/g, "\\Theta ")
    .replace(/Ω/g, "\\Omega ")
    .replace(/\^\(([^()\n]*)\)/g, "^{$1}")
    .replace(/_\(([^()\n]*)\)/g, "_{$1}")
    .replace(/\^(-?[A-Za-z0-9]{2,})/g, "^{$1}")
    .replace(/\blog\b/g, "\\log");
}

export function plainMathToLatex(text: string): string {
  if (!text || !/[\^_OΘΩ]/.test(text)) return text;
  return text
    .split(SKIP)
    .map((part, i) => {
      // odd entries are the protected segments the split captured
      if (i % 2 === 1) return part;
      return part.replace(TOKEN, (m, bigO: string | undefined, power: string | undefined, offset: number, whole: string) => {
        // a snake_case word or a file name is not maths
        if (power && /^[A-Za-z]+_[A-Za-z]+$/.test(power)) return m;
        // part of a longer word or identifier
        if (power && /[A-Za-z0-9_]/.test(whole[offset - 1] || "")) return m;
        return "$" + latex(bigO ?? (power as string)) + "$";
      });
    })
    .join("");
}
