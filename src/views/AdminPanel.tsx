import { safeAvatar } from '../lib/avatars';
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { collection, getDocs, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { BANDS, BAND_IDS, parseBand } from '../lib/bands';
import { db } from '../lib/firebase';
import { Shield, Users, Clock, Star, Activity } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [totalAccesses, setTotalAccesses] = useState(0);
  const [bandError, setBandError] = useState('');

  // Define a faixa escolar do aluno (a regra do Firestore só permite ao administrador)
  const changeBand = async (uid: string, band: string) => {
    setBandError('');
    try {
      await updateDoc(doc(db, 'users', uid), { band });
      setUsers(prev => prev.map(u => (u.id === uid ? { ...u, band } : u)));
    } catch (err) {
      console.error(err);
      setBandError('Não foi possível salvar a faixa. Confira se o firestore.rules atualizado foi publicado.');
    }
  };

  useEffect(() => {

    async function fetchAccessLogs() {
      try {
        const logsRef = collection(db, 'access_logs');
        const q = query(logsRef, orderBy('accessedAt', 'desc'), limit(500));
        const snapshot = await getDocs(q);
        const logsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAccessLogs(logsData);
        setTotalAccesses(logsData.length);
      } catch (error) {
        console.error("Error fetching access logs:", error);
      }
    }

    async function fetchUsers() {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('createdAt', 'desc'), limit(100));
        const snapshot = await getDocs(q);
        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(usersData);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    }
    
    if (user?.email === 'leandrosolon@gmail.com') {
      fetchUsers();
      fetchAccessLogs();
    }
  }, [user]);

  if (user?.email !== 'leandrosolon@gmail.com') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-surface pb-24 md:pb-6">
      <TopBar title="Painel de Administração" />
      
      <main className="pt-24 px-6 max-w-4xl mx-auto space-y-6">
        <div className="bg-primary/10 border-2 border-primary/20 p-6 rounded-3xl flex items-center gap-4">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
            <Shield className="w-8 h-8 text-on-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Bem-vindo, Administrador!</h1>
            <p className="text-on-surface-variant font-medium">
              Aqui você pode visualizar os usuários cadastrados na plataforma.
            </p>
          </div>
        </div>

        <div className="bg-surface-container-low border border-surface-variant rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Últimos Usuários Cadastrados
            </h2>
            <div className="bg-primary-container text-on-primary-container px-4 py-1.5 rounded-full font-bold text-sm">
              {users.length} usuários
            </div>
          </div>

          {bandError && <p className="text-error text-sm mb-3">{bandError}</p>}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant bg-surface-container-highest rounded-2xl border border-dashed border-surface-variant">
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((u, index) => (
                <div key={u.id} className="bg-surface-container flex items-center p-4 rounded-2xl border border-surface-variant/50 hover:bg-surface-container-high transition-colors">
                  <div className="font-bold text-on-surface-variant w-8 text-center mr-2 opacity-50">
                    #{index + 1}
                  </div>
                  <img src={safeAvatar(u.avatarUrl, u.id)} alt={u.displayName} className="w-14 h-14 rounded-xl border-2 border-primary/20 bg-surface object-cover mr-4" />
                  <div className="flex-1">
                    <h3 className="font-bold text-on-surface text-lg">{u.displayName}</h3>
                    <div className="text-sm font-medium text-on-surface-variant flex items-center gap-4 mt-1">
                      <span>Nome Real: {u.realName || 'Não informado'}</span>
                      <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-secondary" /> Nível {u.level || 1}</span>
                    </div>
                    <label className="text-xs text-on-surface-variant mt-2 flex items-center gap-2">
                      Faixa escolar
                      <select
                        value={parseBand(u.band)}
                        onChange={e => changeBand(u.id, e.target.value)}
                        className="bg-surface-container-highest border border-outline-variant rounded-lg px-2 py-1 text-on-surface"
                      >
                        {BAND_IDS.map(id => (
                          <option key={id} value={id}>{BANDS[id].label} ({BANDS[id].grades})</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <div className="flex items-center gap-1.5 text-on-surface-variant text-sm font-medium bg-surface-container-highest px-3 py-1 rounded-lg">
                      <Clock className="w-4 h-4" />
                      {u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : 'Data desconhecida'}
                    </div>
                    <span className="text-xs text-on-surface-variant/50 mt-1 font-mono">{u.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-container-low border border-surface-variant rounded-3xl p-6 shadow-sm mt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
              <Activity className="w-6 h-6 text-tertiary" />
              Histórico de Acessos
            </h2>
            <div className="bg-tertiary-container text-on-tertiary-container px-4 py-1.5 rounded-full font-bold text-sm">
              {totalAccesses} acessos registrados
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {accessLogs.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant bg-surface-container-highest rounded-2xl border border-dashed border-surface-variant">
                Nenhum acesso registrado ainda.
              </div>
            ) : (
              accessLogs.map((log) => (
                <div key={log.id} className="bg-surface flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl border border-surface-variant/30 text-sm">
                  <div className="flex flex-col">
                    <span className="font-bold text-on-surface">{log.displayName || 'Usuário Desconhecido'}</span>
                    <span className="text-on-surface-variant/70 text-xs">{log.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-on-surface-variant mt-2 md:mt-0 font-mono bg-surface-container-highest px-3 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5" />
                    {log.accessedAt ? new Date(log.accessedAt.seconds * 1000).toLocaleString('pt-BR') : 'Data desconhecida'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </main>

      <BottomNav />
    </div>
  );
}
