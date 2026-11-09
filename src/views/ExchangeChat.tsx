import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRightLeft, Handshake, Send, Smile, Sparkles, X, Star, 
  MessageSquare, User, BookOpen, CheckCircle, RefreshCw, Clock 
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, getDocs, getDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';

interface Exchange {
  id: string;
  initiatorId: string;
  initiatorName: string;
  initiatorAvatar?: string;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string;
  bookId: string;
  bookTitle: string;
  bookCoverUrl?: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt?: any;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  createdAt?: any;
}

export default function ExchangeChat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, userAvatar } = useAuth();
  const targetExchangeId = searchParams.get('exchangeId');

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Fetch user exchanges
  useEffect(() => {
    if (!user) return;
    setLoadingExchanges(true);

    // If targetExchangeId is provided in URL, try fetching that doc directly
    if (targetExchangeId) {
      getDoc(doc(db, 'exchanges', targetExchangeId)).then((targetSnap) => {
        if (targetSnap.exists()) {
          const exData = { id: targetSnap.id, ...targetSnap.data() } as Exchange;
          setSelectedExchange(exData);
        }
      }).catch(err => console.error('Error fetching target exchange doc:', err));
    }

    // Só baixa as trocas em que o usuário participa (antes baixava as de todos
    // e filtrava no navegador, expondo conversas de outros alunos).
    let initiated: Exchange[] = [];
    let received: Exchange[] = [];

    const publish = () => {
      const byId = new Map<string, Exchange>();
      [...initiated, ...received].forEach(ex => byId.set(ex.id, ex));
      const list = Array.from(byId.values())
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      setExchanges(list);
      setLoadingExchanges(false);

      if (targetExchangeId) {
        const found = list.find(e => e.id === targetExchangeId);
        if (found) {
          setSelectedExchange(found);
          return;
        }
      }

      if (list.length > 0 && !selectedExchange) {
        setSelectedExchange(list[0]);
      }
    };

    const toList = (snapshot: any): Exchange[] =>
      snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Exchange));

    const onError = (err: any) => {
      console.error('Error fetching exchanges:', err);
      setLoadingExchanges(false);
    };

    const unsubInitiated = onSnapshot(
      query(collection(db, 'exchanges'), where('initiatorId', '==', user.uid)),
      (snapshot) => { initiated = toList(snapshot); publish(); },
      onError
    );
    const unsubReceived = onSnapshot(
      query(collection(db, 'exchanges'), where('receiverId', '==', user.uid)),
      (snapshot) => { received = toList(snapshot); publish(); },
      onError
    );

    const unsubscribe = () => { unsubInitiated(); unsubReceived(); };

    return () => unsubscribe();
  }, [user, targetExchangeId]);

  // 2. Listen to messages for selected exchange
  useEffect(() => {
    if (!selectedExchange) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'exchanges', selectedExchange.id, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: ChatMessage[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ChatMessage));

      setMessages(fetched);
      setTimeout(scrollToBottom, 100);
    }, (err) => {
      console.error('Error fetching chat messages:', err);
    });

    return () => unsubscribe();
  }, [selectedExchange]);

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !selectedExchange || !newMessageText.trim()) return;

    const textToSend = newMessageText.trim();
    setNewMessageText('');
    setShowEmojiPicker(false);
    setIsSending(true);

    try {
      const messagesRef = collection(db, 'exchanges', selectedExchange.id, 'messages');
      await addDoc(messagesRef, {
        senderId: user.uid,
        senderName: user.displayName || 'Explorador(a) de Mundos',
        senderAvatar: userAvatar || '',
        text: textToSend,
        createdAt: serverTimestamp()
      });

      // Update exchange last activity
      await updateDoc(doc(db, 'exchanges', selectedExchange.id), {
        updatedAt: serverTimestamp()
      });

      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Erro ao enviar mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  // Add emoji to message input
  const addEmoji = (emoji: string) => {
    setNewMessageText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Conclude exchange / Complete borrow
  const handleCompleteExchange = async () => {
    if (!selectedExchange) return;
    if (!window.confirm(`Deseja confirmar a conclusão do empréstimo de "${selectedExchange.bookTitle}"?`)) return;

    try {
      await updateDoc(doc(db, 'exchanges', selectedExchange.id), {
        status: 'completed',
        completedAt: serverTimestamp()
      });

      setSelectedExchange(prev => prev ? { ...prev, status: 'completed' } : null);
      alert('Empréstimo concluído com sucesso! 🎉');
    } catch (err) {
      console.error('Error completing exchange:', err);
      alert('Erro ao concluir empréstimo.');
    }
  };

  const otherParticipantName = selectedExchange
    ? (selectedExchange.initiatorId === user?.uid ? selectedExchange.receiverName : selectedExchange.initiatorName)
    : 'Colega';

  const otherParticipantAvatar = selectedExchange
    ? (selectedExchange.initiatorId === user?.uid ? selectedExchange.receiverAvatar : selectedExchange.initiatorAvatar)
    : '';

  return (
    <div className="flex flex-col h-screen overflow-hidden antialiased bg-background text-on-background relative">
      <TopBar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1200px] w-full mx-auto overflow-hidden pb-16 md:pb-0">
        
        {/* Sidebar: Exchange Conversations List */}
        <div className="w-full md:w-80 border-r border-outline-variant/30 bg-surface-container-low/80 flex flex-col shrink-0 max-h-48 md:max-h-full overflow-y-auto">
          <div className="p-3 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container">
            <h3 className="font-label-lg font-bold text-primary flex items-center gap-2 text-xs">
              <MessageSquare className="w-4 h-4 text-secondary" /> Conversas de Troca ({exchanges.length})
            </h3>
          </div>

          {loadingExchanges ? (
            <div className="p-4 text-xs text-on-surface-variant text-center">Carregando conversas...</div>
          ) : exchanges.length === 0 ? (
            <div className="p-4 text-center text-xs text-on-surface-variant">
              Nenhuma troca iniciada.
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/20">
              {exchanges.map(ex => {
                const isSelected = selectedExchange?.id === ex.id;
                const otherName = ex.initiatorId === user?.uid ? ex.receiverName : ex.initiatorName;
                const otherAvatar = ex.initiatorId === user?.uid ? ex.receiverAvatar : ex.initiatorAvatar;

                return (
                  <button
                    key={ex.id}
                    onClick={() => {
                      setSelectedExchange(ex);
                      setSearchParams({ exchangeId: ex.id });
                    }}
                    className={`w-full text-left p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                      isSelected ? 'bg-secondary-container/40 border-l-4 border-secondary' : 'hover:bg-surface-container-high'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary-container shrink-0 overflow-hidden border border-surface">
                      {otherAvatar ? (
                        <img src={otherAvatar} alt={otherName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-5 h-5 m-2 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-on-surface truncate">@{otherName}</span>
                        {ex.status === 'completed' && (
                          <span className="text-[10px] bg-tertiary-container text-on-tertiary-container px-1.5 py-0.5 rounded font-bold">Concluído</span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">📖 {ex.bookTitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat Main View */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
          {selectedExchange ? (
            <>
              {/* Contextual Header */}
              <div className="bg-surface-container-low px-4 py-2.5 border-b border-outline-variant/30 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-secondary-container bg-primary-container shrink-0 shadow-xs">
                    {otherParticipantAvatar ? (
                      <img src={otherParticipantAvatar} alt={otherParticipantName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User className="w-5 h-5 m-2.5 text-primary" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
                      <span>@{otherParticipantName}</span>
                      <span className="text-[10px] font-normal bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold">
                        Troca de Livro
                      </span>
                    </h3>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-primary" />
                      <span className="truncate max-w-[200px] font-medium">{selectedExchange.bookTitle}</span>
                    </p>
                  </div>
                </div>

                {selectedExchange.status !== 'completed' && (
                  <button
                    onClick={handleCompleteExchange}
                    className="flex items-center gap-1.5 bg-tertiary-container text-on-tertiary-container font-label-lg px-3 py-1.5 rounded-xl text-xs font-bold hover:scale-105 transition-transform shadow-xs cursor-pointer"
                  >
                    <Handshake className="w-4 h-4" />
                    <span className="hidden sm:inline">Concluir Empréstimo</span>
                  </button>
                )}
              </div>

              {/* Chat Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-[800px] w-full mx-auto">
                {/* Book Summary Card inside chat */}
                <div className="p-3.5 rounded-2xl bg-surface-container-lowest/90 backdrop-blur-md shadow-sm border border-outline-variant/40 flex items-center gap-3">
                  <div className="w-12 h-16 rounded-md bg-surface-variant overflow-hidden shrink-0 shadow-xs">
                    {selectedExchange.bookCoverUrl ? (
                      <img src={selectedExchange.bookCoverUrl} alt={selectedExchange.bookTitle} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="w-6 h-6 m-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-outline block">Livro em Troca</span>
                    <h4 className="font-bold text-sm text-primary truncate">{selectedExchange.bookTitle}</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {selectedExchange.initiatorId === user?.uid 
                        ? `Solicitado de @${selectedExchange.receiverName}`
                        : `Solicitado por @${selectedExchange.initiatorName}`}
                    </p>
                  </div>
                </div>

                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-on-surface-variant bg-surface-container/60 px-4 py-2 rounded-full inline-block">
                      Diga olá para @{otherParticipantName} e combinem os detalhes do empréstimo do livro! 👋✨
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === user?.uid;
                    return (
                      <div key={msg.id} className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                        {!isMe && (
                          <div className="w-7 h-7 rounded-full bg-primary-container shrink-0 overflow-hidden border border-surface">
                            {msg.senderAvatar ? (
                              <img src={msg.senderAvatar} alt={msg.senderName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <User className="w-4 h-4 m-1.5 text-primary" />
                            )}
                          </div>
                        )}

                        <div className={`p-3 rounded-2xl shadow-xs text-xs sm:text-sm ${
                          isMe 
                            ? 'bg-primary text-on-primary rounded-br-xs' 
                            : 'bg-surface-container-high text-on-surface rounded-bl-xs'
                        }`}>
                          {!isMe && (
                            <span className="block text-[10px] font-bold text-secondary mb-0.5">@{msg.senderName}</span>
                          )}
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 bg-surface-container/90 backdrop-blur-md border-t border-outline-variant/30 relative">
                
                {/* Quick Emoji Bar */}
                {showEmojiPicker && (
                  <div className="absolute bottom-16 left-4 bg-surface-container-lowest p-2 rounded-2xl border border-outline-variant shadow-lg flex gap-2 animate-in fade-in slide-in-from-bottom-2 z-50">
                    {['🤩', '✨', '📖', '🤝', '👍', '🎉', '❤️', '📚'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => addEmoji(emoji)}
                        className="text-lg hover:scale-125 transition-transform p-1 cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="max-w-[800px] mx-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 text-primary hover:bg-surface-container-high rounded-full transition-colors cursor-pointer"
                    title="Inserir Emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <input
                    type="text"
                    placeholder={`Enviar mensagem para @${otherParticipantName}...`}
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    className="flex-1 bg-surface px-4 py-2.5 rounded-full border border-outline-variant/50 text-xs sm:text-sm text-on-surface focus:outline-none focus:border-primary shadow-inner"
                  />

                  <button
                    type="submit"
                    disabled={isSending || !newMessageText.trim()}
                    className="w-9 h-9 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div className="w-16 h-16 bg-surface-container rounded-full flex items-center justify-center mb-4 text-outline">
                <MessageSquare className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="font-headline-sm font-bold text-on-surface mb-2">Selecione uma Troca</h3>
              <p className="font-body-md text-on-surface-variant text-xs max-w-sm mb-6">
                Escolha uma conversa na lista lateral ou vá até a aba <strong>Compartilhados</strong> para pedir um livro emprestado aos seus colegas como um(a) Explorador(a) de Mundos!
              </p>
              <Link
                to="/clubs"
                className="bg-primary text-on-primary font-label-lg px-6 py-2.5 rounded-full text-xs font-bold hover:scale-105 transition-transform shadow-sm"
              >
                Ver Livros do Grupo
              </Link>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
