/**
 * Firestore de mentira (só no build de demonstração, via alias do Vite).
 * Implementa o subconjunto da API que o app usa, em memória + localStorage.
 * NÃO aplica firestore.rules: serve para ver o app funcionando, não para testar regras.
 */
import { buildSeed } from './seed';

const STORE_KEY = __SCHOOL__ ? 'ml-school-db-v1' : 'ml-demo-db-v2';
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export class Timestamp {
  constructor(public seconds: number, public nanoseconds = 0) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  toDate() { return new Date(this.toMillis()); }
}

type Data = Record<string, any>;
let docs: Map<string, Data> = new Map();
const listeners = new Set<() => void>();

// ---- persistência ----
const encode = (v: any): any => {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};
const decode = (v: any): any => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  if (Array.isArray(v)) return v.map(decode);
  return v;
};
const persist = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...docs.entries()].map(([k, v]) => [k, encode(v)]))); } catch { /* ignora */ }
};
export function resetDemoDb() {
  docs = new Map(Object.entries(buildSeed(Timestamp)));
  persist();
}
(function init() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      docs = new Map((JSON.parse(raw) as [string, Data][]).map(([k, v]) => [k, decode(v)]));
      // Escola: os dados são datados em relação a "hoje"; se o dia mudou, recria para o painel ficar atual.
      if (__SCHOOL__ && docs.get('meta/seed')?.day !== todayStr()) resetDemoDb();
      return;
    }
  } catch { /* ignora */ }
  resetDemoDb();
})();

// ---- referências ----
export const getFirestore = (..._a: any[]) => ({ __db: true });
const autoId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const isDb = (x: any) => x && x.__db;

export function collection(base: any, ...segs: string[]) {
  const path = isDb(base) ? segs.join('/') : [base.path, ...segs].join('/');
  return { type: 'collection', path, id: path.split('/').pop()! };
}
export function doc(base: any, ...segs: string[]) {
  let path: string;
  if (isDb(base)) path = segs.join('/');
  else if (base.type === 'collection') path = [base.path, segs.length ? segs.join('/') : autoId()].join('/');
  else path = [base.path, ...segs].join('/');
  return { type: 'doc', path, id: path.split('/').pop()! };
}

// ---- valores especiais ----
export const serverTimestamp = () => ({ __sentinel: 'ts' });
export const arrayUnion = (...els: any[]) => ({ __sentinel: 'union', els });
export const arrayRemove = (...els: any[]) => ({ __sentinel: 'remove', els });
export const increment = (n: number) => ({ __sentinel: 'inc', n });
export const deleteField = () => ({ __sentinel: 'del' });

const same = (a: any, b: any) => JSON.stringify(encode(a)) === JSON.stringify(encode(b));
function resolve(prev: any, v: any): any {
  if (v && typeof v === 'object' && v.__sentinel) {
    switch (v.__sentinel) {
      case 'ts': return Timestamp.now();
      case 'union': { const arr = Array.isArray(prev) ? [...prev] : []; v.els.forEach((e: any) => { if (!arr.some(x => same(x, e))) arr.push(e); }); return arr; }
      case 'remove': return (Array.isArray(prev) ? prev : []).filter((x: any) => !v.els.some((e: any) => same(x, e)));
      case 'inc': return (typeof prev === 'number' ? prev : 0) + v.n;
      case 'del': return undefined;
    }
  }
  if (Array.isArray(v)) return v.map(x => resolve(undefined, x));
  if (v instanceof Timestamp || v instanceof Date) return v;
  if (v && typeof v === 'object') return resolveMap(prevObj(prev), v, false);
  return v;
}
const prevObj = (p: any) => (p && typeof p === 'object' && !Array.isArray(p) ? p : {});
function resolveMap(prev: Data, next: Data, merge: boolean): Data {
  const out: Data = merge ? { ...prev } : {};
  for (const [k, v] of Object.entries(next)) {
    const r = resolve(prev[k], v);
    if (r === undefined) delete out[k]; else out[k] = r;
  }
  return out;
}

// ---- escrita ----
const notify = () => { persist(); queueMicrotask(() => listeners.forEach(l => l())); };
const notFound = () => Object.assign(new Error('No document to update'), { code: 'not-found' });

function applySet(ref: any, data: Data, merge?: boolean) {
  const prev = docs.get(ref.path) || {};
  docs.set(ref.path, resolveMap(prev, data, !!merge));
}
function applyUpdate(ref: any, data: Data) {
  if (!docs.has(ref.path)) throw notFound();
  docs.set(ref.path, resolveMap(docs.get(ref.path)!, data, true));
}
export async function setDoc(ref: any, data: Data, opts?: { merge?: boolean }) { applySet(ref, data, opts?.merge); notify(); }
export async function updateDoc(ref: any, data: Data) { applyUpdate(ref, data); notify(); }
export async function deleteDoc(ref: any) { docs.delete(ref.path); notify(); }
export async function addDoc(coll: any, data: Data) {
  const ref = doc(coll); applySet(ref, data); notify(); return ref;
}
export function writeBatch(_db?: any) {
  const ops: (() => void)[] = [];
  const b = {
    set(ref: any, data: Data, opts?: { merge?: boolean }) { ops.push(() => applySet(ref, data, opts?.merge)); return b; },
    update(ref: any, data: Data) { ops.push(() => applyUpdate(ref, data)); return b; },
    delete(ref: any) { ops.push(() => { docs.delete(ref.path); }); return b; },
    async commit() { ops.forEach(o => o()); notify(); }
  };
  return b;
}

// ---- consulta ----
export const where = (field: string, op: string, value: any) => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc') => ({ kind: 'order', field, dir });
export const limit = (n: number) => ({ kind: 'limit', n });
export const query = (coll: any, ...constraints: any[]) => ({ type: 'query', path: coll.path, constraints });

const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const num = (v: any) => (v instanceof Timestamp ? v.toMillis() : v);
function match(d: Data, c: any): boolean {
  const v = d[c.field]; const x = c.value;
  switch (c.op) {
    case '==': return same(v, x);
    case '!=': return !same(v, x);
    case '<': return num(v) < num(x);
    case '<=': return num(v) <= num(x);
    case '>': return num(v) > num(x);
    case '>=': return num(v) >= num(x);
    case 'in': return Array.isArray(x) && x.some(e => same(v, e));
    case 'not-in': return Array.isArray(x) && !x.some(e => same(v, e));
    case 'array-contains': return Array.isArray(v) && v.some(e => same(e, x));
    case 'array-contains-any': return Array.isArray(v) && x.some((e: any) => v.some((y: any) => same(y, e)));
    default: return false;
  }
}
function runQuery(q: any) {
  const path = q.path;
  let rows = [...docs.entries()].filter(([p]) => parentOf(p) === path).map(([p, d]) => ({ path: p, d }));
  for (const c of q.constraints) if (c.kind === 'where') rows = rows.filter(r => match(r.d, c));
  const ord = q.constraints.filter((c: any) => c.kind === 'order');
  ord.reverse().forEach((o: any) => rows.sort((a, b) => {
    const x = num(a.d[o.field]); const y = num(b.d[o.field]);
    return (x < y ? -1 : x > y ? 1 : 0) * (o.dir === 'desc' ? -1 : 1);
  }));
  const lim = q.constraints.find((c: any) => c.kind === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  return rows;
}

// ---- leitura ----
const docSnap = (path: string) => {
  const d = docs.get(path);
  return { id: path.split('/').pop()!, ref: { type: 'doc', path, id: path.split('/').pop()! }, exists: () => d !== undefined, data: () => (d ? decode(encode(d)) : undefined) };
};
const querySnap = (q: any) => {
  const list = runQuery(q).map(r => docSnap(r.path));
  return { docs: list, empty: list.length === 0, size: list.length, forEach: (f: (d: any) => void) => list.forEach(f) };
};
export async function getDoc(ref: any) { return docSnap(ref.path); }
export async function getDocs(q: any) { return querySnap(q.type === 'collection' ? { path: q.path, constraints: [] } : q); }
export function onSnapshot(target: any, cb: (s: any) => void, _err?: (e: any) => void) {
  const emit = () => cb(target.type === 'doc' ? docSnap(target.path) : querySnap(target.type === 'collection' ? { path: target.path, constraints: [] } : target));
  listeners.add(emit);
  queueMicrotask(emit);
  return () => { listeners.delete(emit); };
}
