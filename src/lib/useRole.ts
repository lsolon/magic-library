import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Papel do usuário logado (users/{uid}.role === 'teacher').
 * No Firebase real, o papel só pode ser definido por um administrador (veja firestore.rules).
 */
export function useIsTeacher(): { isTeacher: boolean; loading: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState({ isTeacher: false, loading: true });

  useEffect(() => {
    let off = false;
    (async () => {
      if (!user) { setState({ isTeacher: false, loading: false }); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!off) setState({ isTeacher: snap.exists() && snap.data().role === 'teacher', loading: false });
      } catch {
        if (!off) setState({ isTeacher: false, loading: false });
      }
    })();
    return () => { off = true; };
  }, [user?.uid]);

  return state;
}

/** Responsável (users/{uid}.role === 'guardian'); definido só pela escola/administrador. */
export function useIsGuardian(): { isGuardian: boolean; loading: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState({ isGuardian: false, loading: true });

  useEffect(() => {
    let off = false;
    (async () => {
      if (!user) { setState({ isGuardian: false, loading: false }); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!off) setState({ isGuardian: snap.exists() && snap.data().role === 'guardian', loading: false });
      } catch {
        if (!off) setState({ isGuardian: false, loading: false });
      }
    })();
    return () => { off = true; };
  }, [user?.uid]);

  return state;
}
