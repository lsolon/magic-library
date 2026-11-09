import { doc, getDoc, deleteDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Removes a book from the user's active library view while PRESERVING all historical data
 * (exchanges, chat messages, and reading logs).
 */
export async function removeBookKeepHistory(userId: string, bookId: string, userBookDocId?: string) {
  if (!bookId || !userId) return;

  try {
    // 1. Remove from user_books for this user
    if (userBookDocId) {
      await deleteDoc(doc(db, 'user_books', userBookDocId)).catch(err => console.warn(err));
    } else {
      const ubQuery = query(collection(db, 'user_books'), where('userId', '==', userId), where('bookId', '==', bookId));
      const ubSnap = await getDocs(ubQuery);
      const ubPromises = ubSnap.docs.map(d => deleteDoc(doc(db, 'user_books', d.id)));
      await Promise.all(ubPromises);
    }

    // 2. Mark book as unshared/archived in 'books' collection
    // Keeping the book doc, exchanges, and messages intact ensures full history is preserved.
    // Só o dono arquiva o livro; quem apenas lia (emprestado) só tira da própria estante.
    const bookRef = doc(db, 'books', bookId);
    const bookSnap = await getDoc(bookRef);
    if (!bookSnap.exists() || bookSnap.data().ownerId !== userId) return;
    await updateDoc(bookRef, {
      status: 'archived',
      currentReaderId: null,
      currentReaderName: null
    }).catch(err => {
      console.warn('Note updating book status:', err);
    });

  } catch (err) {
    console.error('Error executing removeBookKeepHistory:', err);
    throw err;
  }
}
