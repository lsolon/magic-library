import { safeAvatar } from '../lib/avatars';
import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRightLeft, Handshake, Sparkles, X, Star, 
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
import { useChatUnread, markChatSeen } from '../lib/chatUnread';
import { acceptLoan, declineLoan, cancelLoan, completeLoan, linkAcceptedLoans, ExchangeStatus } from '../lib/loans';
import { CHAT_PRESETS, CHAT_PRESET_BY_ID, CHAT_PRESET_GROUPS, systemMessageText, ChatPreset } from '../lib/chatPresets';

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
  status: ExchangeStatus;
  borrowerLinked?: boolean;
  parentApproval?: 'none' | 'waiting' | 'approved' | 'denied';
  createdAt?: any;
}

interface ChatMessage {
  id: string;
  senderId: string;
  presetId?: string;       // mensagem pronta escolhida pelo aluno
  systemKind?: string;     // mensagem automática do sistema
  text?: string;           // legado: mensagens antigas de texto livre
  senderName?: string;     // legado
  senderAvatar?: string;   // legado
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
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [openGroup, setOpenGroup] = useState<ChatPreset['group']>('combinar');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadIds = useChatUnread(user?.uid).ids;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Aluno: liga empréstimos aprovados à própria estante
  useEffect(() => {
    if (user) linkAcceptedLoans(user.uid).catch(err => console.error('link loans', err));
  }, [user]);

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
      // Conversa aberta e aba visível: tudo o que chegou conta como visto
      if (user && fetched.length && document.visibilityState === 'visible') {
        const last: any = fetched[fetched.length - 1];
        markChatSeen(user.uid, selectedExchange.id, last.createdAt?.toMillis ? last.createdAt.toMillis() : Date.now());
      }
      setTimeout(scrollToBottom, 100);
    }, (err) => {
      console.error('Error fetching chat messages:', err);
    });

    return () => unsubscribe();
  }, [selectedExchange]);

  // Envia uma mensagem pronta (o chat não aceita texto livre)
  const handleSendPreset = async (preset: ChatPreset) => {
    if (!user || !selectedExchange || isSending) return;
    setIsSending(true);

    try {
      const messagesRef = collection(db, 'exchanges', selectedExchange.id, 'messages');
      await addDoc(messagesRef, {
        senderId: user.uid,
        presetId: preset.id,
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

  // Quem enviou, com nome/avatar vindos da troca (não da mensagem)
  const senderInfo = (msg: ChatMessage) => {
    if (!selectedExchange) return { name: msg.senderName || '', avatar: msg.senderAvatar || '' };
    const isInitiator = msg.senderId === selectedExchange.initiatorId;
    return {
      name: isInitiator ? selectedExchange.initiatorName : selectedExchange.receiverName,
      avatar: (isInitiator ? selectedExchange.initiatorAvatar : selectedExchange.receiverAvatar) || ''
    };
  };

  const messageText = (msg: ChatMessage): string => {
    if (msg.presetId) return CHAT_PRESET_BY_ID[msg.presetId]?.text || '';
    if (msg.systemKind && selectedExchange) return systemMessageText(msg.systemKind, selectedExchange);
    return msg.text || ''; // mensagens antigas
  };

  const isOwner = !!user && !!selectedExchange && selectedExchange.receiverId === user.uid;
  const isBorrower = !!user && !!selectedExchange && selectedExchange.initiatorId === user.uid;
  const [isActing, setIsActing] = useState(false);

  const setStatusLocal = (status: ExchangeStatus) =>
    setSelectedExchange(prev => prev ? { ...prev, status } : null);

  const runAction = async (fn: () => Promise<void>, next: ExchangeStatus, okMsg?: string) => {
    if (isActing) return;
    setIsActing(true);
    try {
      await fn();
      setStatusLocal(next);
      if (okMsg) alert(okMsg);
    } catch (err: any) {
      console.error('Loan action error:', err);
      alert(err?.message === 'BOOK_UNAVAILABLE'
        ? 'Este livro não está mais disponível. Recuse o pedido.'
        : 'Não foi possível concluir a ação. Tente novamente.');
    } finally {
      setIsActing(false);
    }
  };

  const handleAccept = () => selectedExchange && user &&
    runAction(() => acceptLoan(selectedExchange, selectedExchange.initiatorName), 'accepted', 'Pedido aceito! O livro agora está emprestado. 📖');
  const handleDecline = () => selectedExchange &&
    window.confirm('Recusar este pedido?') && runAction(() => declineLoan(selectedExchange), 'declined');
  const handleCancel = () => selectedExchange &&
    window.confirm('Cancelar o seu pedido?') && runAction(() => cancelLoan(selectedExchange), 'cancelled');
  const handleCompleteExchange = () => selectedExchange && user &&
    window.confirm(`Confirmar que "${selectedExchange.bookTitle}" voltou para você?`) &&
    runAction(() => completeLoan(selectedExchange, user.displayName || 'Explorador(a) de Mundos'), 'completed', 'Empréstimo concluído! 🎉');

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
                        <img src={safeAvatar(otherAvatar)} alt={otherName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-5 h-5 m-2 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-on-surface truncate flex items-center gap-1.5">
                          {unreadIds.has(ex.id) && <span className="w-2.5 h-2.5 rounded-full bg-error shrink-0" aria-label="Mensagem nova" />}
                          @{otherName}
                        </span>
                        {ex.status === 'completed' && (
                          <span className="text-[10px] bg-tertiary-container text-on-tertiary-container px-1.5 py-0.5 rounded font-bold">Concluído</span>
                        )}
                        {ex.status === 'pending' && (
                          <span className="text-[10px] bg-secondary-container text-on-secondary-container px-1.5 py-0.5 rounded font-bold">
                            {ex.receiverId === user?.uid ? 'Responder' : 'Aguardando'}
                          </span>
                        )}
                        {(ex.status === 'declined' || ex.status === 'cancelled') && (
                          <span className="text-[10px] bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded font-bold">Encerrado</span>
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
                      <img src={safeAvatar(otherParticipantAvatar)} alt={otherParticipantName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

                {selectedExchange.status === 'accepted' && isOwner && (
                  <button
                    onClick={handleCompleteExchange}
                    disabled={isActing}
                    className="flex items-center gap-1.5 bg-tertiary-container text-on-tertiary-container font-label-lg px-3 py-1.5 rounded-xl text-xs font-bold hover:scale-105 transition-transform shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Handshake className="w-4 h-4" />
                    <span className="hidden sm:inline">Livro devolvido</span>
                  </button>
                )}
              </div>

              {selectedExchange.status === 'pending' && (
                <div className="bg-secondary-container/60 border-b border-outline-variant/30 px-4 py-3">
                  <div className="max-w-[800px] mx-auto flex flex-wrap items-center gap-3 justify-between">
                    <p className="text-xs font-bold text-on-secondary-container">
                      {selectedExchange.parentApproval === 'waiting'
                        ? (isOwner
                          ? `@${selectedExchange.initiatorName} quer pegar "${selectedExchange.bookTitle}". Os pais dele(a) ainda vão autorizar o pedido.`
                          : 'Pedido enviado. Seus responsáveis precisam autorizar antes de o dono responder.')
                        : (isOwner ? `@${selectedExchange.initiatorName} quer pegar "${selectedExchange.bookTitle}" emprestado.` : 'Pedido enviado. Aguardando o dono do livro responder.')}
                    </p>
                    <div className="flex gap-2">
                      {isOwner && (
                        <>
                          <button onClick={handleAccept} disabled={isActing || selectedExchange.parentApproval === 'waiting'} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer disabled:opacity-50">Aceitar</button>
                          <button onClick={handleDecline} disabled={isActing} className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-xs font-bold cursor-pointer disabled:opacity-50">Recusar</button>
                        </>
                      )}
                      {isBorrower && (
                        <button onClick={handleCancel} disabled={isActing} className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface-variant text-xs font-bold cursor-pointer disabled:opacity-50">Cancelar pedido</button>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                      Escolha uma mensagem pronta abaixo para falar com @{otherParticipantName}! 👋✨
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === user?.uid;
                    const isSystem = msg.senderId === 'system';
                    const sender = senderInfo(msg);
                    const text = messageText(msg);
                    if (!text) return null;
                    if (isSystem) {
                      return (
                        <div key={msg.id} className="text-center">
                          <p className="text-xs text-on-surface-variant bg-surface-container/60 px-4 py-2 rounded-2xl inline-block">{text}</p>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                        {!isMe && (
                          <div className="w-7 h-7 rounded-full bg-primary-container shrink-0 overflow-hidden border border-surface">
                            {sender.avatar ? (
                              <img src={safeAvatar(sender.avatar)} alt={sender.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                            <span className="block text-[10px] font-bold text-secondary mb-0.5">@{sender.name}</span>
                          )}
                          <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Mensagens prontas (sem texto livre) */}
              {!['declined', 'cancelled', 'completed'].includes(selectedExchange.status) && (
              <div className="bg-surface-container/90 backdrop-blur-md border-t border-outline-variant/30">
                <div className="max-w-[800px] mx-auto p-3 space-y-2">
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Tipos de mensagem">
                    {(Object.keys(CHAT_PRESET_GROUPS) as ChatPreset['group'][]).map(g => (
                      <button
                        key={g}
                        type="button"
                        role="tab"
                        aria-selected={openGroup === g}
                        onClick={() => setOpenGroup(g)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                          openGroup === g
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-container-high text-on-surface-variant hover:text-primary'
                        }`}
                      >
                        {CHAT_PRESET_GROUPS[g]}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CHAT_PRESETS.filter(p => p.group === openGroup).map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSendPreset(preset)}
                        className="px-4 py-2.5 rounded-2xl bg-primary text-on-primary text-xs sm:text-sm shadow-sm hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50 cursor-pointer text-left"
                      >
                        {preset.text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              )}
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
