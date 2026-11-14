import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { dayKey } from './gamification';

/** Sentimentos do registro de leitura (lista fixa; sincronizada com firestore.rules). */
export const FEELINGS: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'emocionei', label: 'Me emocionei', emoji: '🥹' },
  { id: 'diverti', label: 'Me diverti', emoji: '😄' },
  { id: 'aprendi', label: 'Aprendi muito', emoji: '💡' },
  { id: 'curioso', label: 'Fiquei curioso(a)', emoji: '🤔' },
  { id: 'tenso', label: 'Prendeu minha atenção', emoji: '😮' },
  { id: 'inspirado', label: 'Me inspirou', emoji: '✨' }
];

export interface ReadingRecordInput {
  rating: number; // 1..5
  feeling: string; // id de FEELINGS
  note: string; // até 140 caracteres, opcional
}

export const NOTE_MAX = 140;

/**
 * Grava no log diário as páginas NOVAS lidas (acima do maior progresso já registrado do livro).
 * Retorna o novo "maior progresso" (para guardar em user_books.maxPagesRead).
 * Voltar a página e avançar de novo não gera páginas novas, então não dá para repetir XP.
 * Se a gravação falhar (ex.: regras ainda não publicadas), o progresso continua sendo salvo.
 */
export async function logReadingProgress(
  userId: string,
  bookId: string,
  newPages: number,
  prevMax: number
): Promise<number> {
  const delta = Math.max(0, Math.floor(newPages) - Math.floor(prevMax));
  if (delta > 0) {
    try {
      await addDoc(collection(db, 'reading_logs'), {
        userId,
        bookId,
        day: dayKey(),
        pages: delta,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Não foi possível gravar o log de leitura:', err);
    }
  }
  return Math.max(prevMax, newPages);
}

export const recordDocId = (userId: string, bookId: string) => `${userId}_${bookId}`;

export async function getReadingRecord(userId: string, bookId: string): Promise<(ReadingRecordInput & { day: string }) | null> {
  try {
    const snap = await getDoc(doc(db, 'reading_records', recordDocId(userId, bookId)));
    return snap.exists() ? (snap.data() as any) : null;
  } catch (err) {
    console.warn('Não foi possível ler o registro de leitura:', err);
    return null;
  }
}

/** Salva (ou atualiza) o registro de leitura. O dia original é mantido ao editar. */
export async function saveReadingRecord(userId: string, bookId: string, input: ReadingRecordInput): Promise<void> {
  const existing = await getReadingRecord(userId, bookId);
  await setDoc(doc(db, 'reading_records', recordDocId(userId, bookId)), {
    userId,
    bookId,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    feeling: input.feeling,
    note: input.note.trim().slice(0, NOTE_MAX),
    day: existing?.day || dayKey(),
    updatedAt: serverTimestamp()
  });
}
