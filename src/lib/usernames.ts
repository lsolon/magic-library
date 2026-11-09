import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Registro público mínimo de apelidos: usernames/{chave} -> { uid, displayName }.
 * Serve para (1) garantir apelido único e (2) achar um colega pelo apelido exato,
 * sem expor e-mail, nome real nem listar usuários (a coleção 'users' é privada).
 */
export const usernameKey = (name: string) => 'u_' + encodeURIComponent(name.trim().toLowerCase());

export async function findUserByUsername(name: string): Promise<{ uid: string; displayName: string } | null> {
  const snap = await getDoc(doc(db, 'usernames', usernameKey(name)));
  return snap.exists() ? (snap.data() as { uid: string; displayName: string }) : null;
}

/** Reserva o apelido (sem diferenciar maiúsculas). Lança 'USERNAME_TAKEN' se outro usuário já usa. */
export async function claimUsername(uid: string, name: string): Promise<void> {
  const existing = await findUserByUsername(name);
  if (existing) {
    if (existing.uid === uid) return;
    throw new Error('USERNAME_TAKEN');
  }
  try {
    await setDoc(doc(db, 'usernames', usernameKey(name)), { uid, displayName: name.trim() });
  } catch (err: any) {
    // As regras só permitem criar se o registro ainda não existe (corrida entre dois cadastros)
    if (err?.code === 'permission-denied') throw new Error('USERNAME_TAKEN');
    throw err;
  }
}
