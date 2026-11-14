import { collection, query, where, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Clears all library books, user books, and exchanges created by or associated with a specific user.
 * Resets user gamification stats to zero.
 */
export async function clearAllUserData(userId: string) {
  if (!userId) return;

  try {
    // 1. Delete user_books for this user
    const ubQuery = query(collection(db, 'user_books'), where('userId', '==', userId));
    const ubSnap = await getDocs(ubQuery);
    await Promise.all(ubSnap.docs.map(d => deleteDoc(doc(db, 'user_books', d.id))));

    // 1b. Delete reading logs and reading records (XP history) for this user
    for (const col of ['reading_logs', 'reading_records']) {
      try {
        const snap = await getDocs(query(collection(db, col), where('userId', '==', userId)));
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, col, d.id))));
      } catch (err) {
        console.warn(`Note clearing ${col}:`, err);
      }
    }

    // 2. Delete books owned by this user
    const booksQuery = query(collection(db, 'books'), where('ownerId', '==', userId));
    const booksSnap = await getDocs(booksQuery);
    await Promise.all(booksSnap.docs.map(d => deleteDoc(doc(db, 'books', d.id))));

    // 3. Delete exchanges where user is owner or requester
    const exOwnerQuery = query(collection(db, 'exchanges'), where('initiatorId', '==', userId));
    const exReqQuery = query(collection(db, 'exchanges'), where('receiverId', '==', userId));
    
    const [exOwnerSnap, exReqSnap] = await Promise.all([
      getDocs(exOwnerQuery),
      getDocs(exReqQuery)
    ]);

    const exchangeDocsToDelete = new Map();
    exOwnerSnap.docs.forEach(d => exchangeDocsToDelete.set(d.id, d));
    exReqSnap.docs.forEach(d => exchangeDocsToDelete.set(d.id, d));

    await Promise.all(Array.from(exchangeDocsToDelete.values()).map(d => deleteDoc(doc(db, 'exchanges', d.id))));

    // 4. Reset user profile gamification stats
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      xp: 0,
      level: 1,
      stars: 0,
      totalPagesRead: 0,
      booksReadCount: 0,
      updatedAt: new Date()
    }, { merge: true }).catch(err => console.warn("Note updating user stats reset:", err));

  } catch (err) {
    console.error('Error clearing user data:', err);
    throw err;
  }
}
