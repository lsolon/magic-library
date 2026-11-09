/** Login de mentira (build de demonstração): 3 alunos, troca pelo seletor da tela. */
import { DEMO_USERS } from './seed';

const USER_KEY = 'ml-demo-user';
type Listener = (u: any) => void;
const listeners = new Set<Listener>();

const mk = (id: string | null) => {
  const u = DEMO_USERS.find(x => x.uid === id);
  if (!u) return null;
  return {
    uid: u.uid, displayName: u.displayName, email: u.email, photoURL: null, emailVerified: false,
    getIdToken: async () => 'demo-token'
  };
};
let current: any = (() => { try { return mk(localStorage.getItem(USER_KEY) ?? 'ana'); } catch { return mk('ana'); } })();

export const auth: any = { get currentUser() { return current; } };
export const getAuth = (..._a: any[]) => auth;
export function onAuthStateChanged(_auth: any, cb: Listener) {
  listeners.add(cb);
  queueMicrotask(() => cb(current));
  return () => { listeners.delete(cb); };
}
const setUser = (id: string | null) => {
  current = mk(id);
  try { id ? localStorage.setItem(USER_KEY, id) : localStorage.removeItem(USER_KEY); } catch { /* ignora */ }
  listeners.forEach(l => l(current));
};
export const demoCurrentId = () => current?.uid ?? null;
export const demoSwitchUser = (id: string) => setUser(id);

export class GoogleAuthProvider {}
export const signInWithPopup = async () => setUser(localStorage.getItem(USER_KEY) || 'ana');
export const signInWithEmailAndPassword = async () => setUser('ana');
export const createUserWithEmailAndPassword = async () => { setUser('ana'); return { user: current }; };
export const signOut = async () => setUser(null);
export const updateProfile = async () => {};
