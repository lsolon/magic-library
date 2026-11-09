import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Ciclo de vida de uma troca (exchanges.status):
 *  chat      -> só conversa (sem pedido de empréstimo)
 *  pending   -> aluno pediu; aguarda o dono
 *  accepted  -> dono aprovou; livro fica "borrowed" com o aluno
 *  declined  -> dono recusou
 *  cancelled -> aluno desistiu antes da resposta
 *  completed -> dono confirmou a devolução
 */
export type ExchangeStatus = 'chat' | 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

export interface LoanExchange {
  id: string;
  initiatorId: string;
  receiverId: string;
  bookId: string;
  status: ExchangeStatus;
  borrowerLinked?: boolean;
}

const sys = (exchangeId: string, systemKind: string) => ({
  ref: doc(collection(db, 'exchanges', exchangeId, 'messages')),
  data: { senderId: 'system', systemKind, createdAt: serverTimestamp() }
});

/** Dono aprova: livro vira emprestado ao aluno; outros pedidos pendentes do mesmo livro são recusados. */
export async function acceptLoan(ex: LoanExchange, borrowerName: string): Promise<void> {
  const bookSnap = await getDoc(doc(db, 'books', ex.bookId));
  if (!bookSnap.exists() || bookSnap.data().status !== 'available') {
    throw new Error('BOOK_UNAVAILABLE');
  }

  const others = await getDocs(query(collection(db, 'exchanges'),
    where('receiverId', '==', ex.receiverId), where('bookId', '==', ex.bookId), where('status', '==', 'pending')));

  const batch = writeBatch(db);
  batch.update(doc(db, 'exchanges', ex.id), { status: 'accepted', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'books', ex.bookId), {
    status: 'borrowed',
    currentReaderId: ex.initiatorId,
    currentReaderName: borrowerName,
    pagesRead: 0
  });
  const m = sys(ex.id, 'loan_accepted');
  batch.set(m.ref, m.data);

  others.docs.filter(d => d.id !== ex.id).forEach(d => {
    batch.update(d.ref, { status: 'declined', updatedAt: serverTimestamp() });
    const dm = sys(d.id, 'loan_declined');
    batch.set(dm.ref, dm.data);
  });
  await batch.commit();
}

export async function declineLoan(ex: LoanExchange): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'exchanges', ex.id), { status: 'declined', updatedAt: serverTimestamp() });
  const m = sys(ex.id, 'loan_declined');
  batch.set(m.ref, m.data);
  await batch.commit();
}

export async function cancelLoan(ex: LoanExchange): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'exchanges', ex.id), { status: 'cancelled', updatedAt: serverTimestamp() });
  const m = sys(ex.id, 'loan_cancelled');
  batch.set(m.ref, m.data);
  await batch.commit();
}

/** Dono confirma a devolução: livro volta para o dono e a troca é concluída. */
export async function completeLoan(ex: LoanExchange, ownerName: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'exchanges', ex.id), { status: 'completed', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'books', ex.bookId), {
    status: 'reading_owner',
    currentReaderId: ex.receiverId,
    currentReaderName: ownerName
  });
  const m = sys(ex.id, 'loan_completed');
  batch.set(m.ref, m.data);
  await batch.commit();
}

/**
 * Lado do aluno: para cada empréstimo aprovado ainda não ligado, cria o registro
 * na própria estante (user_books). Só o aluno pode criar o próprio user_books,
 * por isso isso roda no app dele.
 */
export async function linkAcceptedLoans(uid: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'exchanges'),
    where('initiatorId', '==', uid), where('status', '==', 'accepted')));
  let linked = 0;
  for (const d of snap.docs) {
    const ex = d.data();
    if (ex.borrowerLinked) continue;
    const existing = await getDocs(query(collection(db, 'user_books'),
      where('userId', '==', uid), where('bookId', '==', ex.bookId)));
    if (existing.empty) {
      await addDoc(collection(db, 'user_books'), {
        userId: uid, bookId: ex.bookId, status: 'Lendo', progress: 0, pagesRead: 0,
        addedAt: serverTimestamp()
      });
    }
    await updateDoc(d.ref, { borrowerLinked: true });
    linked++;
  }
  return linked;
}
