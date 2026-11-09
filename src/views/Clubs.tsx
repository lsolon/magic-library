import React, { useEffect, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { BookCoverCard } from '../components/BookCoverCard';
import { 
  Users, Sparkles, BookOpen, Star, Plus, Copy, Check, Mail, Search, 
  ArrowRight, User, ShieldCheck, Share2, MessageSquare, LogOut, Compass, X, CheckCircle, Archive, Trash2, Handshake 
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  collection, query, where, getDocs, updateDoc, doc, addDoc, 
  serverTimestamp, arrayUnion, getDoc, onSnapshot 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { syncUserGamificationStats } from '../lib/gamification';
import { removeBookKeepHistory } from '../lib/bookUtils';
import { cn } from '../lib/utils';

interface ClubMember {
  uid: string;
  displayName: string;
  realName?: string;
  avatarUrl?: string;
  email?: string;
}

interface Club {
  id: string;
  name: string;
  description: string;
  code: string;
  ownerId: string;
  ownerName: string;
  members: string[];
  memberDetails?: ClubMember[];
  createdAt?: any;
}

interface SharedBook {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  category?: string;
  difficulty?: string;
  ownerId: string;
  ownerName: string;
  currentReaderId: string | null;
  currentReaderName: string | null;
  status: string;
  pagesRead?: number;
  totalPages?: number;
}

interface UserSearchResult {
  uid: string;
  displayName: string;
  realName?: string;
  avatarUrl?: string;
  email?: string;
}

export default function Clubs() {
  const { user, userAvatar } = useAuth();
  const navigate = useNavigate();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [books, setBooks] = useState<SharedBook[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Form states
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search user state for invitation
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'available' | 'unavailable' | 'mine'>('all');

  // Progress modal & owner decision states
  const [selectedBookForProgress, setSelectedBookForProgress] = useState<SharedBook | null>(null);
  const [inputPagesRead, setInputPagesRead] = useState<number>(0);
  const [isUpdatingPages, setIsUpdatingPages] = useState<boolean>(false);

  // Load user's clubs
  const fetchUserClubs = async () => {
    if (!user) return;
    setLoadingClubs(true);
    try {
      const q = query(collection(db, 'clubs'), where('members', 'array-contains', user.uid));
      const querySnap = await getDocs(q);
      const fetchedClubs: Club[] = querySnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Club));

      setClubs(fetchedClubs);

      if (fetchedClubs.length > 0) {
        setSelectedClub(fetchedClubs[0]);
      } else {
        setSelectedClub(null);
      }
    } catch (err) {
      console.error('Error fetching clubs:', err);
    } finally {
      setLoadingClubs(false);
    }
  };

  useEffect(() => {
    fetchUserClubs();
  }, [user]);

  // Load books for selected club's members with real-time updates
  useEffect(() => {
    if (!selectedClub || !selectedClub.members || selectedClub.members.length === 0) {
      setBooks([]);
      return;
    }

    setLoadingBooks(true);
    const memberIds = selectedClub.members.slice(0, 30);
    const q = query(collection(db, 'books'), where('ownerId', 'in', memberIds));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBooks = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as SharedBook));

      // Filter to only include books marked as available or borrowed for group sharing
      const sharedBooks = fetchedBooks.filter(b => b.status === 'available' || b.status === 'borrowed');
      setBooks(sharedBooks);
      setLoadingBooks(false);
    }, (err) => {
      console.error('Error listening to club books:', err);
      setLoadingBooks(false);
    });

    return () => unsubscribe();
  }, [selectedClub]);

  // Handle borrower updating pages read
  const handleSaveProgressModal = async () => {
    if (!user || !selectedBookForProgress) return;
    setIsUpdatingPages(true);

    try {
      const book = selectedBookForProgress;
      const total = book.totalPages || 100;
      const numRead = Math.max(0, Math.min(total, Number(inputPagesRead) || 0));
      const is100 = numRead >= total;

      // 1. Update book in 'books'
      await updateDoc(doc(db, 'books', book.id), {
        pagesRead: numRead,
        totalPages: total
      });

      // 2. Sync borrower's 'user_books'
      const q = query(
        collection(db, 'user_books'),
        where('userId', '==', user.uid),
        where('bookId', '==', book.id)
      );
      const snap = await getDocs(q);
      const progressPct = Math.round((numRead / total) * 100);

      if (!snap.empty) {
        await updateDoc(doc(db, 'user_books', snap.docs[0].id), {
          pagesRead: numRead,
          progress: progressPct,
          status: is100 ? 'Lido' : 'Lendo'
        });
      } else {
        await addDoc(collection(db, 'user_books'), {
          userId: user.uid,
          bookId: book.id,
          pagesRead: numRead,
          progress: progressPct,
          status: is100 ? 'Lido' : 'Lendo',
          addedAt: serverTimestamp()
        });
      }

      await syncUserGamificationStats(user.uid);

      if (is100) {
        alert(`🎉 Sensacional! Você atingiu 100% da leitura do livro "${book.title}". O(A) Guardião(ã) do Saber foi notificado(a) e escolherá o próximo destino do livro!`);
      } else {
        alert('Progresso de leitura atualizado com sucesso!');
      }

      setSelectedBookForProgress(null);
    } catch (err) {
      console.error('Error saving progress:', err);
      alert('Erro ao atualizar progresso de leitura.');
    } finally {
      setIsUpdatingPages(false);
    }
  };

  const [isProcessingDecision, setIsProcessingDecision] = useState<string | null>(null);

  // Owner decision 1: Return book to owner
  const handleOwnerReturnToMe = async (book: SharedBook) => {
    if (!user) {
      alert("Acesso negado: Usuário não autenticado.");
      return;
    }
    
    const confirmReturn = window.confirm(`Confirmar que o livro "${book.title}" voltou para suas mãos? Ele sairá da biblioteca compartilhada do grupo.`);
    if (!confirmReturn) return;

    setIsProcessingDecision(book.id);
    try {
      console.log("Processando devolução do livro:", book.id);
      const bookRef = doc(db, "books", book.id);
      
      await updateDoc(bookRef, {
        status: "reading_owner",
        currentReaderId: user.uid,
        currentReaderName: user.displayName || "Explorador(a) de Mundos",
        pagesRead: 0,
        updatedAt: serverTimestamp()
      });

      // Optimistic UI update: remove from local shared list
      setBooks(prev => prev.filter(b => b.id !== book.id));
      
      alert(`🏠 O livro "${book.title}" retornou para você! Agora ele está disponível apenas na sua Biblioteca pessoal.`);
    } catch (err) {
      console.error("Error returning book:", err);
      alert("Erro ao processar devolução. Por favor, tente novamente.");
    } finally {
      setIsProcessingDecision(null);
    }
  };

  // Owner decision 2: Make book available again for other group members
  const handleOwnerDisponibilizarGrupo = async (book: SharedBook) => {
    if (!user) {
      alert("Acesso negado: Usuário não autenticado.");
      return;
    }

    const confirmShare = window.confirm(`Deseja disponibilizar o livro "${book.title}" para outro(a) Explorador(a) de Mundos do grupo pedir emprestado?`);
    if (!confirmShare) return;

    setIsProcessingDecision(book.id);
    try {
      console.log("Disponibilizando livro para o grupo:", book.id);
      const bookRef = doc(db, "books", book.id);
      
      await updateDoc(bookRef, {
        status: "available",
        currentReaderId: null,
        currentReaderName: null,
        pagesRead: 0,
        updatedAt: serverTimestamp()
      });

      // Update locally for snappiness
      setBooks(prev => prev.map(b => b.id === book.id ? { 
        ...b, 
        status: "available", 
        currentReaderId: null, 
        currentReaderName: null,
        pagesRead: 0 
      } : b));

      alert(`✨ O livro "${book.title}" está disponível novamente na Biblioteca Compartilhada do grupo!`);
    } catch (err) {
      console.error("Error sharing book to group:", err);
      alert("Erro ao disponibilizar livro para o grupo. Por favor, tente novamente.");
    } finally {
      setIsProcessingDecision(null);
    }
  };

  // Owner action: Remove/Archive book from shelf (moves to Indisponíveis while preserving history)
  const handleRemoveBook = async (book: SharedBook) => {
    if (!user) return;
    if (!window.confirm(`Tem certeza que deseja remover o livro "${book.title}"? Ele será movido para a aba "Indisponíveis" e todo o seu histórico de trocas e conversas será mantido.`)) return;

    try {
      await removeBookKeepHistory(user.uid, book.id);
      await syncUserGamificationStats(user.uid);
      alert(`O livro "${book.title}" foi removido da estante e movido para a categoria Indisponíveis!`);
    } catch (err) {
      console.error('Error removing book:', err);
      alert('Erro ao remover o livro. Tente novamente.');
    }
  };

  // Create a new club
  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newClubName.trim()) return;

    setIsSubmitting(true);
    try {
      const generatedCode = 'MEMBER-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const newClubData = {
        name: newClubName.trim(),
        description: newClubDesc.trim() || 'Grupo de compartilhamento de leituras',
        code: generatedCode,
        ownerId: user.uid,
        ownerName: user.displayName || 'Explorador(a) de Mundos',
        members: [user.uid],
        memberDetails: [
          {
            uid: user.uid,
            displayName: user.displayName || 'Explorador(a) de Mundos',
            avatarUrl: userAvatar || '',
            email: user.email || ''
          }
        ],
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'clubs'), newClubData);
      const createdClub: Club = { id: docRef.id, ...newClubData };

      setClubs(prev => [createdClub, ...prev]);
      setSelectedClub(createdClub);
      setShowCreateModal(false);
      setNewClubName('');
      setNewClubDesc('');
      alert(`Grupo "${createdClub.name}" criado com sucesso! Código do grupo: ${generatedCode}`);
    } catch (err) {
      console.error('Error creating club:', err);
      alert('Erro ao criar o grupo. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Join club with code
  const handleJoinClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;

    setIsSubmitting(true);
    try {
      const cleanCode = joinCode.trim().toUpperCase();
      const q = query(collection(db, 'clubs'), where('code', '==', cleanCode));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        alert('Código de grupo não encontrado. Verifique o código e tente novamente.');
        setIsSubmitting(false);
        return;
      }

      const clubDoc = querySnap.docs[0];
      const clubData = clubDoc.data() as Club;

      if (clubData.members && clubData.members.includes(user.uid)) {
        alert('Você já faz parte deste grupo!');
        setSelectedClub({ id: clubDoc.id, ...clubData });
        setShowJoinModal(false);
        setJoinCode('');
        setIsSubmitting(false);
        return;
      }

      const userMemberInfo: ClubMember = {
        uid: user.uid,
        displayName: user.displayName || 'Explorador(a) de Mundos',
        avatarUrl: userAvatar || '',
        email: user.email || ''
      };

      await updateDoc(doc(db, 'clubs', clubDoc.id), {
        members: arrayUnion(user.uid),
        memberDetails: arrayUnion(userMemberInfo)
      });

      const updatedClub: Club = {
        ...clubData,
        id: clubDoc.id,
        members: [...(clubData.members || []), user.uid],
        memberDetails: [...(clubData.memberDetails || []), userMemberInfo]
      };

      setClubs(prev => [updatedClub, ...prev.filter(c => c.id !== updatedClub.id)]);
      setSelectedClub(updatedClub);
      setShowJoinModal(false);
      setJoinCode('');
      alert(`🎉 Parabéns! Você entrou no grupo "${updatedClub.name}".`);
    } catch (err) {
      console.error('Error joining club:', err);
      alert('Erro ao entrar no grupo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Search users by displayName or email for invitation
  const handleSearchUsers = async () => {
    if (!userSearchQuery.trim()) return;
    setIsSearchingUsers(true);
    setSearchResults([]);

    try {
      const term = userSearchQuery.trim();
      const qDisplay = query(collection(db, 'users'), where('displayName', '==', term));
      const qEmail = query(collection(db, 'users'), where('email', '==', term));

      const [snapDisplay, snapEmail] = await Promise.all([getDocs(qDisplay), getDocs(qEmail)]);
      const found: UserSearchResult[] = [];

      snapDisplay.docs.forEach(d => {
        if (d.id !== user?.uid) {
          found.push({ uid: d.id, ...d.data() } as UserSearchResult);
        }
      });

      snapEmail.docs.forEach(d => {
        if (d.id !== user?.uid && !found.some(f => f.uid === d.id)) {
          found.push({ uid: d.id, ...d.data() } as UserSearchResult);
        }
      });

      setSearchResults(found);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  // Add searched user to selected club directly
  const handleAddUserToClub = async (targetUser: UserSearchResult) => {
    if (!selectedClub) return;
    if (selectedClub.members.includes(targetUser.uid)) {
      alert(`${targetUser.displayName} já está neste grupo!`);
      return;
    }

    try {
      const newMember: ClubMember = {
        uid: targetUser.uid,
        displayName: targetUser.displayName,
        realName: targetUser.realName,
        avatarUrl: targetUser.avatarUrl,
        email: targetUser.email
      };

      await updateDoc(doc(db, 'clubs', selectedClub.id), {
        members: arrayUnion(targetUser.uid),
        memberDetails: arrayUnion(newMember)
      });

      const updatedClub: Club = {
        ...selectedClub,
        members: [...selectedClub.members, targetUser.uid],
        memberDetails: [...(selectedClub.memberDetails || []), newMember]
      };

      setSelectedClub(updatedClub);
      setClubs(prev => prev.map(c => c.id === updatedClub.id ? updatedClub : c));
      alert(`🎉 ${targetUser.displayName} foi adicionado ao grupo "${selectedClub.name}"!`);
      setSearchResults(prev => prev.filter(u => u.uid !== targetUser.uid));
    } catch (err) {
      console.error('Error adding user to club:', err);
      alert('Erro ao adicionar participante.');
    }
  };

  // Borrow a book
  const handleBorrow = async (book: SharedBook) => {
    if (!user) return;
    if (book.ownerId === user.uid) {
      alert('Você é o(a) Guardião(ã) deste livro!');
      return;
    }

    try {
      await updateDoc(doc(db, 'books', book.id), {
        status: 'borrowed',
        currentReaderId: user.uid,
        currentReaderName: user.displayName || 'Explorador(a) de Mundos',
        pagesRead: 0
      });

      await addDoc(collection(db, 'user_books'), {
        userId: user.uid,
        bookId: book.id,
        status: 'Lendo',
        progress: 0,
        pagesRead: 0,
        addedAt: serverTimestamp()
      });

      // Create exchange record
      const exRef = await addDoc(collection(db, 'exchanges'), {
        initiatorId: user.uid,
        initiatorName: user.displayName || 'Explorador(a) de Mundos',
        initiatorAvatar: userAvatar || '',
        receiverId: book.ownerId,
        receiverName: book.ownerName,
        bookId: book.id,
        bookTitle: book.title,
        bookCoverUrl: book.coverUrl || '',
        status: 'accepted',
        createdAt: serverTimestamp()
      });

      // Add initial chat system greeting
      await addDoc(collection(db, 'exchanges', exRef.id, 'messages'), {
        senderId: 'system',
        senderName: 'Magic Library',
        text: `✨ @${user.displayName || 'Explorador(a) de Mundos'} solicitou o empréstimo do livro "${book.title}" do(a) Guardião(ã) @${book.ownerName}. Conversem por aqui para alinhar os detalhes da entrega! 📖🤝`,
        createdAt: serverTimestamp()
      });

      // Refresh local book list & Navigate to chat
      setBooks(prev => prev.map(b => b.id === book.id ? { ...b, status: 'borrowed', currentReaderId: user.uid, currentReaderName: user.displayName || 'Explorador(a) de Mundos' } : b));
      navigate(`/chat?exchangeId=${exRef.id}`);
    } catch (err) {
      console.error('Error borrowing book:', err);
      alert('Erro ao pegar livro emprestado.');
    }
  };

  const handleOpenChatForBook = async (book: SharedBook) => {
    if (!user) return;

    try {
      // Procura uma troca deste livro em que o usuário já participa
      const [asInitiator, asReceiver] = await Promise.all([
        getDocs(query(collection(db, 'exchanges'), where('bookId', '==', book.id), where('initiatorId', '==', user.uid))),
        getDocs(query(collection(db, 'exchanges'), where('bookId', '==', book.id), where('receiverId', '==', user.uid)))
      ]);
      const existing = asInitiator.docs[0] || asReceiver.docs[0];

      if (existing) {
        navigate(`/chat?exchangeId=${existing.id}`);
        return;
      }

      // If no exchange exists yet, create a new exchange record!
      const exRef = await addDoc(collection(db, 'exchanges'), {
        initiatorId: user.uid,
        initiatorName: user.displayName || 'Explorador(a) de Mundos',
        initiatorAvatar: userAvatar || '',
        receiverId: book.ownerId,
        receiverName: book.ownerName,
        bookId: book.id,
        bookTitle: book.title,
        bookCoverUrl: book.coverUrl || '',
        status: 'accepted',
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'exchanges', exRef.id, 'messages'), {
        senderId: 'system',
        senderName: 'Magic Library',
        text: `✨ Chat de troca aberto para o livro "${book.title}". Conversem por aqui para alinhar detalhes de leitura ou empréstimo! 📖🤝`,
        createdAt: serverTimestamp()
      });

      navigate(`/chat?exchangeId=${exRef.id}`);
    } catch (err) {
      console.error('Error opening chat for book:', err);
      alert('Erro ao abrir o chat de troca.');
    }
  };

  const copyInviteCode = () => {
    if (!selectedClub) return;
    navigator.clipboard.writeText(selectedClub.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const filteredBooks = books.filter(b => {
    if (activeFilter === 'available') return b.status === 'available';
    if (activeFilter === 'borrowed') return b.status === 'borrowed' && b.currentReaderId === user?.uid;
    if (activeFilter === 'unavailable') return b.status === 'archived' || b.status === 'unavailable';
    if (activeFilter === 'mine') return b.ownerId === user?.uid;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-background text-on-background">
      {/* Decorative Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary-container/20 blur-[80px] float-anim" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-[20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-tertiary-container/15 blur-[100px] float-anim" style={{ animationDuration: '12s', animationDelay: '2s' }}></div>
      </div>

      <TopBar />

      <main className="flex-grow z-10 w-full max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 pb-32">
        
        {/* Header Title */}
        <div className="text-center mb-8 relative">
          <div className="inline-block relative">
            <h2 className="font-headline-xl text-primary relative z-10 flex items-center justify-center gap-3">
              <Users className="w-9 h-9 text-secondary" />
              Biblioteca Compartilhada
            </h2>
            <Sparkles className="text-secondary-container absolute -top-4 -right-6 float-anim w-8 h-8 fill-current" />
          </div>
          <p className="font-body-md text-on-surface-variant mt-2 max-w-lg mx-auto text-sm sm:text-base">
            Compartilhe sua biblioteca com seus colegas da sala de aula e explore novos mundos pegando livros emprestados entre vocês!
          </p>

          {/* Action Buttons: Create or Join Group */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-primary text-on-primary font-label-lg px-5 py-2.5 rounded-full shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Criar Novo Grupo</span>
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 bg-surface-container-high text-on-surface border border-outline-variant font-label-lg px-5 py-2.5 rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Compass className="w-5 h-5 text-secondary" />
              <span>Entrar com Código</span>
            </button>
          </div>
        </div>

        {/* Clubs Tabs / Selector */}
        {clubs.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
            {clubs.map(club => {
              const isSelected = selectedClub?.id === club.id;
              return (
                <button
                  key={club.id}
                  onClick={() => setSelectedClub(club)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full font-label-lg text-xs whitespace-nowrap transition-all cursor-pointer border",
                    isSelected
                      ? "bg-secondary-container text-on-secondary-container border-secondary-container shadow-md font-bold scale-105"
                      : "bg-surface-container-lowest/80 text-on-surface-variant border-outline-variant/40 hover:bg-surface-container-high"
                  )}
                >
                  <Users className="w-4 h-4" />
                  <span>{club.name}</span>
                  <span className="bg-surface/60 text-primary px-2 py-0.5 rounded-full text-[10px]">
                    {club.members?.length || 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Group Header & Members Bar */}
        {selectedClub ? (
          <div className="glass-panel bg-surface-container-lowest/90 rounded-2xl p-5 border-2 border-primary-fixed mb-8 magic-shadow space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-headline-sm font-bold text-primary text-xl">{selectedClub.name}</h3>
                  <span className="bg-tertiary-container text-on-tertiary-container font-label-lg text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                    {selectedClub.members?.length || 1} Participantes
                  </span>
                </div>
                <p className="font-body-sm text-on-surface-variant mt-1 text-xs sm:text-sm">{selectedClub.description}</p>
              </div>

              {/* Group Invite Code & Invite Button */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={copyInviteCode}
                  className="flex items-center gap-1.5 bg-surface-container text-primary border border-primary/20 px-3 py-1.5 rounded-xl font-mono text-xs hover:bg-surface-container-high transition-colors cursor-pointer"
                  title="Copiar código do grupo"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-tertiary" /> : <Copy className="w-4 h-4" />}
                  <span className="font-bold">{selectedClub.code}</span>
                </button>

                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-1.5 bg-secondary-container text-on-secondary-container font-label-lg px-4 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform shadow-sm cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Convidar Colega</span>
                </button>
              </div>
            </div>

            {/* Members Avatars List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-lg text-xs text-outline uppercase tracking-wider font-bold">Colegas no Grupo</span>
                <button 
                  onClick={() => setShowInviteModal(true)}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Amigos
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedClub.memberDetails && selectedClub.memberDetails.length > 0 ? (
                  selectedClub.memberDetails.map((m) => (
                    <div 
                      key={m.uid} 
                      className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/30 text-xs shadow-2xs"
                      title={m.realName ? `${m.displayName} (${m.realName})` : m.displayName}
                    >
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-primary-container shrink-0">
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="w-3.5 h-3.5 m-1 text-primary" />
                        )}
                      </div>
                      <span className="font-bold text-on-surface">@{m.displayName}</span>
                      {m.uid === selectedClub.ownerId && (
                        <ShieldCheck className="w-3.5 h-3.5 text-secondary" title="Criador do Grupo" />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-on-surface-variant italic">Nenhum detalhe de membro encontrado.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          !loadingClubs && (
            <div className="bg-surface-container-lowest rounded-2xl p-8 border-2 border-dashed border-outline-variant text-center my-8 max-w-lg mx-auto shadow-sm">
              <div className="w-16 h-16 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="font-headline-sm font-bold text-on-surface mb-2">Nenhum Grupo de Leitura</h3>
              <p className="font-body-md text-on-surface-variant text-sm mb-6">
                Crie um grupo com seus colegas de classe ou entre em um grupo existente com um código de convite para compartilhar livros!
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-primary text-on-primary font-label-lg px-6 py-2.5 rounded-full shadow-md hover:scale-105 transition-all cursor-pointer text-sm font-bold"
                >
                  Criar Primeiro Grupo
                </button>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="bg-surface-container-high text-on-surface font-label-lg px-6 py-2.5 rounded-full border border-outline-variant shadow-sm hover:scale-105 transition-all cursor-pointer text-sm font-bold"
                >
                  Entrar com Código
                </button>
              </div>
            </div>
          )
        )}

        {/* Filter Tabs for Books */}
        {selectedClub && (
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h3 className="font-headline-sm font-bold text-primary flex items-center gap-2 text-lg">
              <BookOpen className="w-5 h-5 text-secondary" />
              Livros do Grupo ({filteredBooks.length})
            </h3>

            <div className="flex items-center gap-1.5 bg-surface-container-high/60 p-1 rounded-full border border-outline-variant/30 text-xs font-bold overflow-x-auto max-w-full">
              <button
                onClick={() => setActiveFilter('all')}
                className={cn("px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap", activeFilter === 'all' ? "bg-primary text-on-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface")}
              >
                Todos
              </button>
              <button
                onClick={() => setActiveFilter('available')}
                className={cn("px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap", activeFilter === 'available' ? "bg-primary text-on-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface")}
              >
                Disponíveis
              </button>
              <button
                onClick={() => setActiveFilter('borrowed')}
                className={cn("px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap", activeFilter === 'borrowed' ? "bg-primary text-on-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface")}
              >
                Peguei Emprestado 🤝
              </button>
              <button
                onClick={() => setActiveFilter('mine')}
                className={cn("px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap", activeFilter === 'mine' ? "bg-primary text-on-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface")}
              >
                Meus Livros
              </button>
              <button
                onClick={() => setActiveFilter('unavailable')}
                className={cn("px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap", activeFilter === 'unavailable' ? "bg-primary text-on-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface")}
              >
                Indisponíveis
              </button>
            </div>
          </div>
        )}

        {/* Books Grid */}
        {loadingBooks ? (
          <div className="text-center py-12 font-body-lg text-on-surface-variant">
            Buscando livros compartilhados no grupo...
          </div>
        ) : (
          selectedClub && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.map(book => {
                const isOwner = book.ownerId === user?.uid;
                const isReading = book.currentReaderId === user?.uid;
                const isAvailable = book.status === 'available';
                const isBorrowed = book.status === 'borrowed';
                const isArchived = book.status === 'archived' || book.status === 'unavailable';

                return (
                  <div key={book.id} className="glass-panel bg-surface-container-lowest/80 rounded-xl border-2 border-primary-container p-5 relative flex flex-col hover:scale-105 transition-transform duration-300 ease-out magic-shadow group">
                    {isOwner && !isArchived && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBook(book);
                        }}
                        className="absolute top-2 left-2 bg-error/15 hover:bg-error text-error hover:text-on-surface p-2 rounded-full shadow-xs transition-all hover:scale-110 cursor-pointer z-10"
                        title="Remover este livro (mover para Indisponíveis)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isAvailable && (
                      <div className="absolute -top-3 right-4 bg-tertiary-container text-on-tertiary-container font-label-lg px-3 py-0.5 rounded-full border border-surface flex items-center gap-1 text-xs shadow-xs font-bold">
                        <Star className="w-3.5 h-3.5 fill-current" /> Disponível
                      </div>
                    )}
                    {isBorrowed && isReading && (
                      <div className="absolute -top-3 right-4 bg-tertiary text-on-tertiary font-label-lg px-3 py-1 rounded-full border-2 border-primary/50 flex items-center gap-1.5 text-xs shadow-md font-bold">
                        <Handshake className="w-4 h-4 fill-current" /> Você Pegou Emprestado!
                      </div>
                    )}
                    {isBorrowed && !isReading && (
                      <div className="absolute -top-3 right-4 bg-secondary-container text-on-secondary-container font-label-lg px-3 py-0.5 rounded-full border border-surface flex items-center gap-1 text-xs shadow-xs font-bold">
                        <BookOpen className="w-3.5 h-3.5 fill-current" /> Emprestado para @{book.currentReaderName}
                      </div>
                    )}
                    {isArchived && (
                      <div className="absolute -top-3 right-4 bg-surface-container-highest text-on-surface-variant font-label-lg px-3 py-0.5 rounded-full border border-outline-variant flex items-center gap-1 text-xs shadow-xs font-bold">
                        <Archive className="w-3.5 h-3.5 text-outline" /> Indisponível
                      </div>
                    )}

                    <div className="flex gap-4 mb-4">
                      <div className="w-24 h-32 shrink-0">
                        <BookCoverCard
                          coverUrl={book.coverUrl}
                          title={book.title}
                          author={book.author}
                          showUserAvatar={true}
                          ownerName={book.ownerName || user?.displayName}
                          className="w-full h-full"
                        />
                      </div>
                      <div className="flex flex-col justify-center">
                        <h4 className="font-body-lg text-primary font-bold line-clamp-2 leading-tight">{book.title}</h4>
                        <p className="font-body-md text-on-surface-variant text-xs mb-2">{book.author}</p>
                        <div className="mt-auto inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-[11px] font-bold text-on-surface">
                          <User className="w-3 h-3 text-secondary" />
                          <span>Guardião(ã): @{book.ownerName || user?.displayName || 'Explorador(a) de Mundos'}{isOwner ? ' (Você)' : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto pt-2 border-t border-outline-variant/30 space-y-2">
                      {isBorrowed && (() => {
                        const pagesRead = book.pagesRead || 0;
                        const totalPages = book.totalPages || 100;
                        const progressPercent = Math.min(100, Math.round((pagesRead / totalPages) * 100));
                        const is100Percent = progressPercent >= 100;

                        return (
                          <div className="bg-surface-container rounded-xl p-3 border border-outline-variant/30 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-on-surface">
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-primary" />
                                <span>{isReading ? 'Você está lendo' : `@${book.currentReaderName} está lendo`}</span>
                              </span>
                              <span className="text-primary font-mono text-[11px] font-bold">
                                {pagesRead}/{totalPages} pág. ({progressPercent}%)
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 rounded-full ${
                                  is100Percent ? 'bg-tertiary shadow-[0_0_8px_rgba(20,184,166,0.5)]' : 'bg-primary'
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>

                            {/* 100% Completed Owner Decision vs Borrower status */}
                            {is100Percent ? (
                              <div className="relative z-30 p-2.5 bg-tertiary-container/30 border border-tertiary-container/60 rounded-xl space-y-2 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-tertiary">
                                  <Sparkles className="w-4 h-4 shrink-0 fill-tertiary/20" />
                                  <span>Leitura 100% Concluída por @{book.currentReaderName}!</span>
                                </div>

                                {isOwner ? (
                                  <div className="space-y-1.5 pt-1 border-t border-tertiary-container/50 relative z-40">
                                    <p className="text-[11px] font-semibold text-on-surface-variant">
                                     Decisão do(a) Guardião(ã) do Saber:
                                    </p>
                                    <button
                                      type="button"
                                      disabled={isProcessingDecision === book.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOwnerReturnToMe(book);
                                      }}
                                      className="w-full py-2.5 px-4 rounded-xl bg-[#135468] text-on-surface font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#0f4354] active:scale-95 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed relative z-50"
                                    >
                                      {isProcessingDecision === book.id ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                      ) : '🏠 Devolver Livro Para Mim'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isProcessingDecision === book.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOwnerDisponibilizarGrupo(book);
                                      }}
                                      className="w-full py-2.5 px-4 rounded-xl bg-[#FFD700] text-[#135468] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#ffed4a] active:scale-95 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed border border-[#135468]/10 relative z-50"
                                    >
                                      {isProcessingDecision === book.id ? (
                                        <div className="w-4 h-4 border-2 border-[#135468]/30 border-t-[#135468] rounded-full animate-spin" />
                                      ) : '🔄 Disponibilizar para o Grupo'}
                                    </button>
                                  </div>
                                ) : isReading ? (
                                  <p className="text-[11px] text-on-surface-variant italic">
                                    🎉 Parabéns pela leitura! O(A) Guardião(ã) do Saber (@{book.ownerName}) decidirá a devolução ou novo compartilhamento.
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-on-surface-variant italic">
                                    Leitura concluída pelo colega! Aguardando decisão do(a) Guardião(ã) (@{book.ownerName}).
                                  </p>
                                )}
                              </div>
                            ) : (
                              isReading && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBookForProgress(book);
                                    setInputPagesRead(book.pagesRead || 0);
                                  }}
                                  className="w-full py-1.5 px-2.5 rounded-lg bg-secondary-container text-on-secondary-container font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-secondary-container/80 transition-colors cursor-pointer"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>Marcar Páginas Lidas</span>
                                </button>
                              )
                            )}
                          </div>
                        );
                      })()}

                      {isArchived ? (
                        <div className="flex flex-col gap-2">
                          <div className="p-2.5 bg-surface-container rounded-xl text-center border border-outline-variant/30 text-xs">
                            <p className="text-on-surface-variant font-medium text-[11px] leading-tight">
                              Livro removido da estante ativa. Todo o histórico de trocas e conversas está preservado.
                            </p>
                          </div>
                          <button
                            onClick={() => handleOpenChatForBook(book)}
                            className="w-full py-2.5 rounded-xl font-label-lg uppercase flex items-center justify-center gap-1.5 transition-all bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/40 text-xs font-bold cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-primary" />
                            <span>Ver Chat e Histórico</span>
                          </button>
                        </div>
                      ) : isAvailable ? (
                        <div className="flex flex-col gap-2">
                          {isOwner ? (
                            <div className="flex gap-2">
                              <button 
                                disabled
                                className="flex-1 py-2 rounded-xl font-label-lg uppercase bg-surface-container text-on-surface-variant text-[11px] font-bold border border-outline-variant/30 text-center"
                              >
                                Seu Livro
                              </button>
                              <button
                                onClick={() => handleRemoveBook(book)}
                                className="py-2 px-3 rounded-xl bg-error/15 hover:bg-error text-error hover:text-on-surface text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer border border-error/30"
                                title="Remover este livro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remover</span>
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleBorrow(book)}
                              className="w-full py-2.5 rounded-xl font-label-lg uppercase flex items-center justify-center gap-2 transition-all shadow-sm bg-primary text-on-primary text-xs font-bold hover:scale-[1.02] active:scale-95 cursor-pointer"
                            >
                              <span>Pedir Emprestado</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenChatForBook(book)}
                            className="w-full py-2 rounded-xl font-label-lg uppercase flex items-center justify-center gap-1.5 transition-all bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-outline-variant/40 text-[11px] font-bold cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-primary" />
                            <span>Chat de Troca</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenChatForBook(book)}
                          className="w-full py-2.5 rounded-xl font-label-lg uppercase flex items-center justify-center gap-2 transition-all shadow-sm bg-surface-container-high text-on-surface border border-outline-variant text-xs font-bold hover:scale-[1.02] active:scale-95 cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4 text-primary" />
                          <span>Chat de Troca</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredBooks.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center bg-surface-container-lowest/50 rounded-2xl border border-dashed border-outline-variant">
                  <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-3 text-outline">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <h4 className="font-body-lg text-on-surface font-bold mb-1">
                    {activeFilter === 'unavailable' 
                      ? 'Nenhum livro indisponível' 
                      : activeFilter === 'mine' 
                      ? 'Você ainda não compartilhou livros neste grupo' 
                      : activeFilter === 'available'
                      ? 'Nenhum livro disponível no momento'
                      : 'Nenhum livro encontrado'}
                  </h4>
                  <p className="text-xs text-on-surface-variant max-w-sm mb-4">
                    {activeFilter === 'unavailable'
                      ? 'Livros excluídos da estante ou arquivados mantendo histórico de troca aparecerão nesta categoria.'
                      : 'Adicione ou compartilhe livros na sua Biblioteca para disponibilizá-los aos seus colegas de grupo.'}
                  </p>
                  <Link
                    to="/add-book"
                    className="bg-primary text-on-primary font-label-lg px-5 py-2 rounded-full text-xs font-bold hover:scale-105 transition-transform"
                  >
                    + Adicionar Livro
                  </Link>
                </div>
              )}
            </div>
          )
        )}
      </main>

      {/* FAB Invite */}
      {selectedClub && (
        <button 
          onClick={() => setShowInviteModal(true)}
          className="fixed bottom-24 md:bottom-10 right-6 md:right-10 bg-secondary-container text-on-secondary-container rounded-full p-3.5 md:px-5 md:py-3.5 shadow-xl hover:scale-110 active:scale-95 transition-transform cursor-pointer flex items-center justify-center z-40 border-2 border-surface font-bold text-xs"
        >
          <Share2 className="w-5 h-5 md:mr-2" />
          <span className="hidden md:block font-label-lg uppercase tracking-wider">Convidar Colega</span>
        </button>
      )}

      {/* CREATE CLUB MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest max-w-md w-full p-6 rounded-2xl border-2 border-primary-fixed shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm font-bold text-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-secondary" /> Criar Grupo de Leitura
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-on-surface-variant hover:text-on-surface font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateClub} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Nome do Grupo / Sala de Aula *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Sala de Aula - 8º Ano A"
                  value={newClubName}
                  onChange={(e) => setNewClubName(e.target.value)}
                  className="w-full bg-surface-container px-3.5 py-2.5 rounded-xl border border-outline-variant text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Descrição</label>
                <textarea
                  placeholder="Ex: Grupo de troca e empréstimo de livros entre os colegas de turma."
                  value={newClubDesc}
                  onChange={(e) => setNewClubDesc(e.target.value)}
                  className="w-full bg-surface-container px-3.5 py-2 rounded-xl border border-outline-variant text-sm h-20 resize-none focus:outline-none focus:border-primary"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {isSubmitting ? 'Criando...' : 'Criar Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOIN CLUB MODAL */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest max-w-sm w-full p-6 rounded-2xl border-2 border-secondary-container shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm font-bold text-primary flex items-center gap-2">
                <Compass className="w-5 h-5 text-secondary" /> Entrar em um Grupo
              </h3>
              <button onClick={() => setShowJoinModal(false)} className="text-on-surface-variant hover:text-on-surface font-bold">✕</button>
            </div>

            <form onSubmit={handleJoinClub} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-on-surface mb-1">Código do Grupo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: MEMBER-X89A"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full bg-surface-container px-3.5 py-2.5 rounded-xl border border-outline-variant text-sm font-mono uppercase focus:outline-none focus:border-secondary"
                />
                <p className="text-[11px] text-on-surface-variant mt-1">Peça o código para o colega que criou o grupo.</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-secondary-container text-on-secondary-container text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {isSubmitting ? 'Entrando...' : 'Entrar no Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVITE COLLEAGUE MODAL */}
      {showInviteModal && selectedClub && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest max-w-md w-full p-6 rounded-2xl border-2 border-primary-fixed shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <h3 className="font-headline-sm font-bold text-primary flex items-center gap-2 text-base">
                <Share2 className="w-5 h-5 text-secondary" /> Convidar Colegas
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="text-on-surface-variant hover:text-on-surface font-bold">✕</button>
            </div>

            {/* Code Copy Box */}
            <div className="bg-surface-container p-3.5 rounded-xl border border-outline-variant/40 flex items-center justify-between gap-3">
              <div>
                <span className="block text-[10px] font-bold text-outline uppercase tracking-wider">Código de Convite</span>
                <span className="font-mono text-base font-bold text-primary">{selectedClub.code}</span>
              </div>
              <button
                onClick={copyInviteCode}
                className="bg-primary text-on-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:scale-105 transition-transform cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            {/* Email mailto button */}
            <a
              href={`mailto:?subject=${encodeURIComponent(`Convite para o Grupo de Leitura: ${selectedClub.name}`)}&body=${encodeURIComponent(`Oi! Venha participar da minha biblioteca compartilhada no aplicativo Magic Library!\n\nUse o código de acesso do nosso grupo: ${selectedClub.code}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40 p-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all"
            >
              <Mail className="w-4 h-4 text-primary" />
              <span>Enviar Convite por E-mail</span>
            </a>

            {/* Search user by username or email */}
            <div className="space-y-2 pt-2 border-t border-outline-variant/30">
              <label className="block text-xs font-bold text-on-surface">Buscar Colega pelo Nome de Usuário Único (@) ou E-mail</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: Pegasus ou leandro@gmail.com"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchUsers()}
                  className="flex-1 bg-surface-container px-3.5 py-2 rounded-xl border border-outline-variant text-xs focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={handleSearchUsers}
                  disabled={isSearchingUsers}
                  className="bg-primary text-on-primary px-3.5 py-2 rounded-xl text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>

              {/* Search Results */}
              {isSearchingUsers && (
                <p className="text-xs text-on-surface-variant italic py-2 text-center">Buscando colega...</p>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto pt-2">
                  {searchResults.map(res => {
                    const isAlreadyMember = selectedClub.members.includes(res.uid);
                    return (
                      <div key={res.uid} className="flex items-center justify-between bg-surface-container p-2.5 rounded-xl border border-outline-variant/30">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-7 h-7 rounded-full bg-primary-container shrink-0 overflow-hidden">
                            {res.avatarUrl ? (
                              <img src={res.avatarUrl} alt={res.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="w-4 h-4 m-1 text-primary" />
                            )}
                          </div>
                          <div className="truncate">
                            <span className="block text-xs font-bold text-on-surface truncate">@{res.displayName}</span>
                            {res.realName && <span className="block text-[10px] text-on-surface-variant truncate">{res.realName}</span>}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isAlreadyMember}
                          onClick={() => handleAddUserToClub(res)}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                            isAlreadyMember ? "bg-surface-variant text-outline cursor-default" : "bg-tertiary-container text-on-tertiary-container hover:scale-105"
                          )}
                        >
                          {isAlreadyMember ? 'Já no Grupo' : '+ Adicionar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="w-full py-2.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-variant"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPDATE READING PROGRESS MODAL */}
      {selectedBookForProgress && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full border-2 border-primary-container shadow-2xl relative animate-in fade-in zoom-in-95 space-y-4">
            <button
              onClick={() => setSelectedBookForProgress(null)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-container text-on-surface-variant cursor-pointer font-bold"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0 font-bold">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-headline-sm font-bold text-primary text-base">Atualizar Páginas Lidas</h3>
                <p className="text-xs text-on-surface-variant line-clamp-1">{selectedBookForProgress.title}</p>
              </div>
            </div>

            <div className="space-y-4 my-2">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Quantas páginas você já leu? (Total: {selectedBookForProgress.totalPages || 100} pág.)
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedBookForProgress.totalPages || 100}
                  value={inputPagesRead}
                  onChange={(e) => setInputPagesRead(Number(e.target.value))}
                  className="w-full bg-surface-container-highest border-2 border-surface-variant rounded-xl p-3 font-mono font-bold text-lg text-primary focus:outline-none focus:border-primary"
                />
              </div>

              {/* Quick Add Buttons */}
              <div>
                <span className="block text-[10px] font-bold text-outline mb-1.5 uppercase tracking-wider">Atalhos Rápidos:</span>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 25, 50].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => {
                        const max = selectedBookForProgress.totalPages || 100;
                        setInputPagesRead(prev => Math.min(max, (Number(prev) || 0) + inc));
                      }}
                      className="px-3 py-1.5 bg-surface-container rounded-lg text-xs font-bold text-primary hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30"
                    >
                      +{inc} pág.
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setInputPagesRead(selectedBookForProgress.totalPages || 100)}
                    className="px-3 py-1.5 bg-tertiary-container text-on-tertiary-container rounded-lg text-xs font-bold hover:scale-105 transition-transform cursor-pointer"
                  >
                    🎉 Concluir 100%
                  </button>
                </div>
              </div>

              {/* Live Progress Preview */}
              {(() => {
                const tot = selectedBookForProgress.totalPages || 100;
                const pct = Math.min(100, Math.round(((Number(inputPagesRead) || 0) / tot) * 100));
                return (
                  <div className="p-3 bg-surface-container rounded-xl space-y-1">
                    <div className="flex justify-between text-xs font-bold text-on-surface">
                      <span>Progresso Previsto:</span>
                      <span className="text-primary font-mono">{pct}% ({inputPagesRead}/{tot} pág.)</span>
                    </div>
                    <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedBookForProgress(null)}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant font-bold text-xs hover:bg-surface-container cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUpdatingPages}
                onClick={handleSaveProgressModal}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-md hover:scale-102 active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
              >
                {isUpdatingPages ? 'Salvando...' : 'Salvar Progresso'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

