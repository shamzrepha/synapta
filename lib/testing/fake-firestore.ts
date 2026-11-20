/**
 * Tiny in-memory Firestore stand-in for route tests: nested collections, get/set(merge)/update/add/delete,
 * where(==)/limit queries, batches and (serial) transactions. Not a full emulator.
 */
export type Store = Map<string, Record<string, unknown>>;

type Obj = Record<string, unknown>;
const isPlain = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v) && !("toMillis" in (v as object)) && !("__inc" in (v as object));

const merge = (a: Obj, b: Obj): Obj => {
  const out: Obj = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (isPlain(v)) out[k] = merge(isPlain(out[k]) ? (out[k] as Obj) : {}, v);
    else if (v && typeof v === "object" && "__inc" in (v as object)) out[k] = ((out[k] as number) || 0) + (v as { __inc: number }).__inc;
    else out[k] = v;
  }
  return out;
};

let autoId = 0;

export function makeFakeDb(store: Store) {
  const snap = (path: string) => ({
    id: path.split("/").pop() as string,
    exists: store.has(path),
    data: () => store.get(path),
    ref: docRef(path),
  });
  function docRef(path: string): Obj {
    return {
      id: path.split("/").pop(),
      path,
      get: async () => snap(path),
      set: async (v: Obj, opts?: { merge?: boolean }) => {
        store.set(path, opts?.merge ? merge(store.get(path) || {}, v) : v);
      },
      update: async (v: Obj) => {
        store.set(path, merge(store.get(path) || {}, v));
      },
      delete: async () => void store.delete(path),
      collection: (name: string) => colRef(`${path}/${name}`),
    };
  }
  function query(path: string, filters: Array<[string, unknown]>, max: number): Obj {
    return {
      where: (f: string, op: string, v: unknown) => query(path, [...filters, [op === "array-contains" ? `${f}[]` : f, v]], max),
      orderBy: () => query(path, filters, max),
      limit: (n: number) => query(path, filters, n),
      get: async () => {
        const depth = path.split("/").length + 1;
        const group = path.startsWith("@group:") ? path.slice(7) : "";
        const pick = (o: Obj | undefined, f: string): unknown => f.split(".").reduce<unknown>((a, key) => (a as Obj | undefined)?.[key], o);
        const docs = [...store.keys()]
          .filter((k) => (group ? k.split("/").length % 2 === 0 && k.split("/").at(-2) === group : k.startsWith(`${path}/`) && k.split("/").length === depth))
          .filter((k) =>
            filters.every(([f, v]) => {
              const got = pick(store.get(k), f.replace(/\[\]$/, ""));
              return f.endsWith("[]") ? Array.isArray(got) && got.includes(v) : got === v;
            })
          )
          .slice(0, max)
          .map(snap);
        return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) };
      },
    };
  }
  function colRef(path: string): Obj {
    return {
      ...query(path, [], 1000),
      doc: (id?: string) => docRef(`${path}/${id || `auto${++autoId}`}`),
      add: async (v: Obj) => {
        const id = `auto${++autoId}`;
        store.set(`${path}/${id}`, v);
        return { id };
      },
    };
  }
  const writer = (sink: Array<() => void>) => ({
    set: (ref: { path: string }, v: Obj, opts?: { merge?: boolean }) =>
      void sink.push(() => store.set(ref.path, opts?.merge ? merge(store.get(ref.path) || {}, v) : v)),
    update: (ref: { path: string }, v: Obj) => void sink.push(() => store.set(ref.path, merge(store.get(ref.path) || {}, v))),
    delete: (ref: { path: string }) => void sink.push(() => void store.delete(ref.path)),
  });
  return {
    collection: (name: string) => colRef(name),
    collectionGroup: (name: string) => query(`@group:${name}`, [], 1000),
    batch: () => {
      const ops: Array<() => void> = [];
      return { ...writer(ops), commit: async () => void ops.forEach((f) => f()) };
    },
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const ops: Array<() => void> = [];
      const r = await fn({ ...writer(ops), get: async (ref: { path: string }) => snap(ref.path) });
      ops.forEach((f) => f());
      return r;
    },
  };
}

export const fakeFieldValue = { increment: (n: number) => ({ __inc: n }) };
export const fakeTimestamp = {
  now: () => ({ toMillis: () => Date.now() }),
  fromMillis: (ms: number) => ({ toMillis: () => ms }),
  fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
};
