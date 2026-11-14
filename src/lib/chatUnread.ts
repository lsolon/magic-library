import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Aviso de mensagem nova no chat de trocas.
 *
 * Uma única escuta compartilhada (TopBar, BottomNav e lista do chat usam o mesmo estado):
 * para cada troca do usuário, olha a última mensagem. Conta como "não lida" se não foi
 * enviada por ele e é mais nova que a última vez que ele viu a conversa. As mensagens
 * automáticas (novo pedido, aceito, recusado, devolvido) também contam.
 *
 * "Visto" fica só neste navegador (localStorage); não precisa de regra nova no Firestore.
 * Ao abrir o app pela primeira vez, o histórico antigo não vira aviso (marco inicial).
 */

interface Unread { count: number; ids: Set<string> }
let state: Unread = { count: 0, ids: new Set() };
const subs = new Set<(s: Unread) => void>();
let activeUid: string | null = null;
let stop: (() => void) | null = null;
const latest = new Map<string, { sender: string; ms: number }>();

const seenKey = (uid: string) => `ml-chat-seen:${uid}`;
const readSeen = (uid: string): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(seenKey(uid)) || '{}'); } catch { return {}; }
};
const writeSeen = (uid: string, v: Record<string, number>) => {
  try { localStorage.setItem(seenKey(uid), JSON.stringify(v)); } catch { /* ignora */ }
};

function recompute() {
  if (!activeUid) return;
  const seen = readSeen(activeUid);
  const base = seen.__base || 0;
  const ids = new Set<string>();
  latest.forEach((m, id) => {
    if (m.sender !== activeUid && m.ms > Math.max(seen[id] || 0, base)) ids.add(id);
  });
  state = { count: ids.size, ids };
  subs.forEach(f => f(state));
}

/** Marca a conversa como vista até `ms` (padrão: agora). */
export function markChatSeen(uid: string, exchangeId: string, ms: number = Date.now()) {
  const seen = readSeen(uid);
  if ((seen[exchangeId] || 0) >= ms) return;
  seen[exchangeId] = ms;
  writeSeen(uid, seen);
  recompute();
}

function start(uid: string) {
  activeUid = uid;
  const seen = readSeen(uid);
  if (!seen.__base) { seen.__base = Date.now(); writeSeen(uid, seen); }

  const msgUnsubs = new Map<string, () => void>();
  let initiated: string[] = [];
  let received: string[] = [];
  const sync = () => {
    const wanted = new Set([...initiated, ...received]);
    msgUnsubs.forEach((off, id) => {
      if (!wanted.has(id)) { off(); msgUnsubs.delete(id); latest.delete(id); }
    });
    wanted.forEach(id => {
      if (msgUnsubs.has(id)) return;
      const off = onSnapshot(
        query(collection(db, 'exchanges', id, 'messages'), orderBy('createdAt', 'desc'), limit(1)),
        (snap: any) => {
          const d = snap.docs[0]?.data();
          if (d) latest.set(id, { sender: d.senderId, ms: d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now() });
          recompute();
        },
        () => { /* sem permissão ou offline: sem aviso */ }
      );
      msgUnsubs.set(id, off);
    });
    recompute();
  };
  const ids = (snap: any): string[] => snap.docs.map((d: any) => d.id);
  const a = onSnapshot(query(collection(db, 'exchanges'), where('initiatorId', '==', uid)), (s: any) => { initiated = ids(s); sync(); }, () => {});
  const b = onSnapshot(query(collection(db, 'exchanges'), where('receiverId', '==', uid)), (s: any) => { received = ids(s); sync(); }, () => {});

  stop = () => { a(); b(); msgUnsubs.forEach(off => off()); latest.clear(); activeUid = null; state = { count: 0, ids: new Set() }; };
}

const BASE_TITLE = typeof document !== 'undefined' ? document.title : '';

/** Quantidade de conversas com mensagem nova + ids; também põe "(n)" no título da aba. */
export function useChatUnread(uid?: string | null): Unread {
  const [s, setS] = useState<Unread>(state);
  useEffect(() => {
    if (!uid) return;
    if (activeUid && activeUid !== uid) { stop?.(); stop = null; }
    subs.add(setS);
    if (!stop) start(uid);
    setS(state);
    return () => {
      subs.delete(setS);
      if (subs.size === 0) { stop?.(); stop = null; }
    };
  }, [uid]);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = s.count > 0 ? `(${s.count}) ${BASE_TITLE}` : BASE_TITLE;
  }, [s.count]);
  return uid ? s : { count: 0, ids: new Set() };
}
