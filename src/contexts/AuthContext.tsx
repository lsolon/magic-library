import { defaultAvatarFor, safeAvatar } from '../lib/avatars';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, addDoc } from 'firebase/firestore';
import { claimUsername } from '../lib/usernames';

interface AuthContextType {
  user: User | null;
  userAvatar: string;
  loading: boolean;
  needsProfileSetup: boolean;
  isTrialExpired: boolean;
  trialDaysLeft: number;
  isSubscribed: boolean;
  signInWithGoogle: () => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string, realName: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeProfile: (name: string, realName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userAvatar, setUserAvatar] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(30);
  const [isSubscribed, setIsSubscribed] = useState(false);


  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined = undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = undefined;
      }

      if (currentUser) {
        // Record access log
        if (!sessionStorage.getItem('access_recorded_' + currentUser.uid)) {
          sessionStorage.setItem('access_recorded_' + currentUser.uid, 'true');
          addDoc(collection(db, 'access_logs'), {
            userId: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            accessedAt: serverTimestamp(),
            userAgent: navigator.userAgent
          }).catch(err => console.error("Error logging access", err));
        }

        const userRef = doc(db, 'users', currentUser.uid);
        unsubscribeDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setNeedsProfileSetup(false);
            const data = docSnap.data();

            // Usuários antigos: garante o registro do apelido (melhor esforço, uma vez por sessão)
            if (data.displayName && !sessionStorage.getItem('username_claimed_' + currentUser.uid)) {
              sessionStorage.setItem('username_claimed_' + currentUser.uid, 'true');
              claimUsername(currentUser.uid, data.displayName).catch(() => {});
            }
            
            // Check subscription and trial
            const subscribed = !!data.isSubscribed;
            setIsSubscribed(subscribed);
            
            if (data.createdAt && !subscribed) {
              const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt.seconds * 1000);
              const now = new Date();
              const diffTime = Math.abs(now.getTime() - createdDate.getTime());
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              const daysLeft = Math.max(0, 30 - diffDays);
              
              setTrialDaysLeft(daysLeft);
              setIsTrialExpired(daysLeft === 0);
            } else if (subscribed) {
              setTrialDaysLeft(30);
              setIsTrialExpired(false);
            } else {
               // Fallback if no createdAt
              setTrialDaysLeft(30);
              setIsTrialExpired(false);
            }

            if (data.avatarUrl) {
              setUserAvatar(safeAvatar(data.avatarUrl, currentUser.uid));
            } else {
              setUserAvatar(defaultAvatarFor(currentUser.uid));
            }
          } else {
            setNeedsProfileSetup(true);
            setIsTrialExpired(false);
            setIsSubscribed(false);
            setTrialDaysLeft(30);
            setUserAvatar(defaultAvatarFor(currentUser.uid));
          }
          setLoading(false);
        }, (err) => {
          console.error("Error watching user doc:", err);
          setUserAvatar(defaultAvatarFor(currentUser.uid));
          setLoading(false);
        });
      } else {
        setNeedsProfileSetup(false);
        setUserAvatar('');
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  const createUserDocument = async (user: User, displayName?: string | null, realName?: string | null) => {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      const defaultAvatar = defaultAvatarFor(user.uid);
      await setDoc(userRef, {
        displayName: displayName || user.displayName || 'Novo(a) Explorador(a) de Mundos',
        realName: realName || user.displayName || 'Explorador(a) de Mundos',
        avatarUrl: defaultAvatar,
        level: 1,
        xp: 0,
        stars: 0,
        createdAt: serverTimestamp()
      });
      setUserAvatar(defaultAvatar);
      setNeedsProfileSetup(false);
    }
  };

  const completeProfile = async (name: string, realName: string) => {
    if (!user) throw new Error("Usuário não autenticado");
    
    const trimmedName = name.trim();
    const trimmedRealName = realName.trim();

    if (!trimmedName) throw new Error('O nome de exibição é obrigatório.');
    if (!trimmedRealName) throw new Error('O nome real é obrigatório.');

    try {
      await claimUsername(user.uid, trimmedName);
    } catch (err: any) {
      if (err?.message === 'USERNAME_TAKEN') {
        throw new Error('Este nome de exibição já está em uso por outro explorador. Escolha outro nome.');
      }
      throw err;
    }

    await updateProfile(user, { displayName: trimmedName });
    await createUserDocument(user, trimmedName, trimmedRealName);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const registerWithEmail = async (email: string, password: string, name: string, realName: string) => {
    const trimmedName = name.trim();
    const trimmedRealName = realName.trim();
    if (!trimmedName) {
      throw new Error('O nome de exibição é obrigatório.');
    }
    if (!trimmedRealName) {
      throw new Error('O nome real é obrigatório.');
    }

    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Reserva o apelido já autenticado (a coleção 'users' não é mais pública).
    // Se já estiver em uso, desfaz a conta recém-criada.
    try {
      await claimUsername(result.user.uid, trimmedName);
    } catch (err: any) {
      await result.user.delete().catch(() => {});
      if (err?.message === 'USERNAME_TAKEN') {
        throw new Error('Este nome de exibição já está em uso por outro explorador. Escolha outro nome.');
      }
      throw err;
    }
    await updateProfile(result.user, { displayName: trimmedName });
    await createUserDocument(result.user, trimmedName, trimmedRealName);
  };

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userAvatar, loading, needsProfileSetup, isTrialExpired, trialDaysLeft, isSubscribed, signInWithGoogle, registerWithEmail, loginWithEmail, logout, completeProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
