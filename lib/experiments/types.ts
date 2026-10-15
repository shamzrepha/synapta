export type Values = Record<string, number>;

export interface Param {
  key: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** a few named choices instead of a slider */
  options?: Array<{ value: number; label: string }>;
}

export interface OutputItem {
  key: string;
  label: string;
  value: number;
  unit?: string;
  digits?: number;
}

export interface Series {
  label: string;
  color: string;
  points: Array<[number, number]>;
  dashed?: boolean;
}

export interface GraphSpec {
  title: string;
  xLabel: string;
  yLabel: string;
  series: Series[];
  /** a fixed marker (the landing point, the current volume …) */
  marker?: [number, number];
  /** a marker that moves with the animation clock (seconds) */
  markerAt?: (t: number) => [number, number] | null;
  xRange?: [number, number];
  yRange?: [number, number];
}

export interface Computed {
  outputs: OutputItem[];
  graphs: GraphSpec[];
  /** experiment-specific data the canvas drawing uses (trajectory, pendulum samples …) */
  data?: unknown;
  /** length of one animation loop in seconds (0 = not animated) */
  duration: number;
}

export interface NumberQuestion {
  kind: "number";
  id: string;
  prompt: string;
  unit?: string;
  /** accepted relative error (0.02 = 2 %) */
  tol: number;
  /** accepted absolute error, used when it is larger than the relative one (pH units, degrees…) */
  absTol?: number;
  expected: (v: Values, c: Computed) => number;
  hint: (v: Values, c: Computed) => string;
}

export interface ChoiceQuestion {
  kind: "choice";
  id: string;
  prompt: string;
  options: string[];
  expected: (v: Values, c: Computed) => string;
  hint: (v: Values, c: Computed) => string;
}

export type Question = NumberQuestion | ChoiceQuestion;

export interface Experiment {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  subject: "Physics" | "Chemistry";
  params: Param[];
  /** keys (parameters and outputs) that become the columns of the data table */
  recordKeys: string[];
  compute: (v: Values) => Computed;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, v: Values, c: Computed, t: number) => void;
  questions: Question[];
  /** one line for the "what to try" box */
  tryThis: string;
}

export interface RecordedRow {
  /** column key → value */
  values: Record<string, number>;
}
