declare module "js-interpreter" {
  /** Sandboxed ES5 interpreter (Neil Fraser's JS-Interpreter). Only the parts Studio uses. */
  export default class Interpreter {
    constructor(code: string, init?: (interpreter: Interpreter, globalObject: unknown) => void);
    step(): boolean;
    run(): boolean;
    value: unknown;
    paused_: boolean;
    setProperty(obj: unknown, name: string, value: unknown): void;
    createNativeFunction(fn: (...args: never[]) => unknown): unknown;
    createAsyncFunction(fn: (...args: never[]) => void): unknown;
    nativeToPseudo(value: unknown): unknown;
    pseudoToNative(value: unknown): unknown;
  }
}
