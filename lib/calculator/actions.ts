import {
  type ConstName, type EditorState, type FnName, backspace, closeParen, emptyState, insertChar, insertNode,
  insertPowerFixed, insertTemplate, moveDown, moveLeft, moveRight, moveUp, countNodes,
} from "./model";

export type Action =
  | { k: "ch"; v: string }
  | { k: "const"; v: ConstName }
  | { k: "open" } | { k: "close" }
  | { k: "frac" } | { k: "sqrt" } | { k: "root" }
  | { k: "pow" } | { k: "square" } | { k: "inv" } | { k: "pow10" } | { k: "powe" }
  | { k: "fn"; name: FnName } | { k: "logb" }
  | { k: "del" } | { k: "clear" }
  | { k: "left" } | { k: "right" } | { k: "up" } | { k: "down" };

export const MAX_NODES = 400;
const CHARS = /^[0-9.+\-×÷!%CP]$/;

export function applyAction(st: EditorState, a: Action): EditorState {
  if (a.k !== "del" && a.k !== "clear" && a.k !== "left" && a.k !== "right" && a.k !== "up" && a.k !== "down" && a.k !== "close") {
    if (countNodes(st.root) >= MAX_NODES) return st;
  }
  switch (a.k) {
    case "ch": return CHARS.test(a.v) ? insertChar(st, a.v) : st;
    case "const": return insertNode(st, { t: "const", v: a.v });
    case "open": return insertTemplate(st, { t: "paren", body: [] });
    case "close": return closeParen(st);
    case "frac": return insertTemplate(st, { t: "frac", num: [], den: [] });
    case "sqrt": return insertTemplate(st, { t: "sqrt", body: [], index: null });
    case "root": return insertTemplate(st, { t: "sqrt", body: [], index: [] });
    case "pow": return insertTemplate(st, { t: "pow", exp: [] });
    case "square": return insertPowerFixed(st, [{ t: "ch", v: "2" }]);
    case "inv": return insertPowerFixed(st, [{ t: "ch", v: "-" }, { t: "ch", v: "1" }]);
    case "pow10": return insertTemplate(insertChar(insertChar(st, "1"), "0"), { t: "pow", exp: [] });
    case "powe": return insertTemplate(insertNode(st, { t: "const", v: "e" }), { t: "pow", exp: [] });
    case "fn": return insertTemplate(st, { t: "fn", name: a.name, body: [] });
    case "logb": return insertTemplate(st, { t: "logb", base: [], body: [] });
    case "del": return backspace(st);
    case "clear": return emptyState();
    case "left": return moveLeft(st);
    case "right": return moveRight(st);
    case "up": return moveUp(st);
    case "down": return moveDown(st);
  }
}

const OPERATORS = new Set(["+", "-", "×", "÷", "!", "%", "C", "P"]);

/**
 * After "=" a result is on screen: an operator keeps working with Ans, anything that inserts starts afresh,
 * and editing keys (move, delete) just edit the shown expression.
 */
export function prepareAfterResult(st: EditorState, a: Action): EditorState {
  if (a.k === "left" || a.k === "right" || a.k === "up" || a.k === "down" || a.k === "del" || a.k === "clear" || a.k === "close") return st;
  const fresh = emptyState();
  if ((a.k === "ch" && OPERATORS.has(a.v)) || a.k === "pow" || a.k === "square" || a.k === "inv") {
    return insertNode(fresh, { t: "const", v: "ans" });
  }
  return fresh;
}

/** Physical keyboard mapping; null means "not ours, leave the event alone". */
export function actionForKey(key: string): Action | null {
  if (/^[0-9.]$/.test(key)) return { k: "ch", v: key };
  switch (key) {
    case "+": return { k: "ch", v: "+" };
    case "-": return { k: "ch", v: "-" };
    case "*": case "x": return { k: "ch", v: "×" };
    case "/": return { k: "frac" };
    case "^": return { k: "pow" };
    case "(": return { k: "open" };
    case ")": return { k: "close" };
    case "!": return { k: "ch", v: "!" };
    case "%": return { k: "ch", v: "%" };
    case "Backspace": return { k: "del" };
    case "Delete": return { k: "clear" };
    case "ArrowLeft": return { k: "left" };
    case "ArrowRight": return { k: "right" };
    case "ArrowUp": return { k: "up" };
    case "ArrowDown": return { k: "down" };
    default: return null;
  }
}
