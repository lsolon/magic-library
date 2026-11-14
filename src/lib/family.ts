import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Área do responsável.
 *
 * Dados:
 *  guardians/{uidDoResponsavel}  { childIds: [uid, ...] }          (só admin/escola grava)
 *  family/{uidDoFilho}           { guardianIds, childName, clubIds, requireApproval, pauseSharing,
 *                                  blockedCategories, blockedBookIds }  (responsável altera as 4 configurações)
 *  book_flags/{id}               sinalização de livro (motivo de uma lista, sem texto livre)
 *  exchanges/{id}.parentApproval 'none' | 'waiting' | 'approved' | 'denied'
 *
 * O filho só LÊ as próprias configurações; quem as altera é o responsável.
 */

export interface FamilySettings {
  guardianIds: string[];
  /** Apelido da criança e grupos dela (definidos na vinculação feita pela escola). */
  childName?: string;
  clubIds?: string[];
  requireApproval: boolean;
  pauseSharing: boolean;
  blockedCategories: string[];
  blockedBookIds: string[];
}

export const EMPTY_FAMILY: FamilySettings = {
  guardianIds: [], requireApproval: false, pauseSharing: false, blockedCategories: [], blockedBookIds: []
};

/** Motivos de sinalização (sem texto livre). Mantenha igual a firestore.rules (book_flags). */
export const FLAG_REASONS: Array<{ id: string; label: string }> = [
  { id: 'idade', label: 'Não é para a idade do meu filho' },
  { id: 'violencia', label: 'Tem violência' },
  { id: 'linguagem', label: 'Linguagem inadequada' },
  { id: 'valores', label: 'Não combina com os valores da família' },
  { id: 'outro', label: 'Outro motivo (a escola avalia)' },
];
export const flagReasonLabel = (id: string) => FLAG_REASONS.find(r => r.id === id)?.label || id;

/** Faixa etária indicada (informada por quem cadastra o livro; a professora revisa). */
export const AGE_RATINGS = ['Livre', '8+', '10+', '12+', '14+'] as const;
export type AgeRating = typeof AGE_RATINGS[number];

export async function getFamily(childUid: string): Promise<FamilySettings | null> {
  try {
    const snap = await getDoc(doc(db, 'family', childUid));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<FamilySettings>;
    return {
      guardianIds: d.guardianIds || [],
      childName: d.childName,
      clubIds: d.clubIds || [],
      requireApproval: !!d.requireApproval,
      pauseSharing: !!d.pauseSharing,
      blockedCategories: d.blockedCategories || [],
      blockedBookIds: d.blockedBookIds || []
    };
  } catch {
    return null; // sem permissão ou sem vínculo: sem restrições da família
  }
}

export function isBookBlocked(f: FamilySettings | null, book: { id?: string; category?: string }): boolean {
  if (!f) return false;
  return (!!book.id && f.blockedBookIds.includes(book.id)) || (!!book.category && f.blockedCategories.includes(book.category));
}

export async function sharingPaused(uid: string): Promise<boolean> {
  return !!(await getFamily(uid))?.pauseSharing;
}

/** Crianças vinculadas ao responsável. */
export async function loadChildIds(guardianUid: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'guardians', guardianUid));
    return snap.exists() ? ((snap.data() as any).childIds || []) : [];
  } catch {
    return [];
  }
}

export type FamilyPatch = Partial<Pick<FamilySettings, 'requireApproval' | 'pauseSharing' | 'blockedCategories' | 'blockedBookIds'>>;
export async function updateFamily(childUid: string, patch: FamilyPatch): Promise<void> {
  await updateDoc(doc(db, 'family', childUid), patch as any);
}

export async function flagBook(guardianUid: string, childUid: string,
  book: { id: string; title: string; ownerId: string }, reason: string): Promise<void> {
  await addDoc(collection(db, 'book_flags'), {
    bookId: book.id, bookTitle: book.title, bookOwnerId: book.ownerId,
    flaggedBy: guardianUid, childUid, reason, status: 'open', createdAt: serverTimestamp()
  });
}

/** Responsável aprova ou recusa um pedido de empréstimo do filho. */
export async function parentDecision(exchangeId: string, decision: 'approved' | 'denied'): Promise<void> {
  await updateDoc(doc(db, 'exchanges', exchangeId),
    decision === 'approved'
      ? { parentApproval: 'approved', updatedAt: serverTimestamp() }
      : { parentApproval: 'denied', status: 'declined', updatedAt: serverTimestamp() });
}

/**
 * Roda no app da criança: se a família pausou o compartilhamento, os livros dela
 * voltam a ser privados (só o dono pode alterar o próprio livro). Livros já emprestados não mudam.
 */
export async function enforcePauseSharing(uid: string, name: string): Promise<number> {
  if (!(await sharingPaused(uid))) return 0;
  const snap = await getDocs(query(collection(db, 'books'), where('ownerId', '==', uid), where('status', '==', 'available')));
  for (const d of snap.docs) {
    await updateDoc(d.ref, { status: 'reading_owner', currentReaderId: uid, currentReaderName: name });
  }
  return snap.size;
}
