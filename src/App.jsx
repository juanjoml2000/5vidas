import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import Card from './components/Card';
import Auth from './components/Auth';
import { Heart, Trophy, Users, Play, Plus, LogOut, Menu, X, Zap, User, Save, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [newNick, setNewNick] = useState('');
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [trickCards, setTrickCards] = useState([]);
  const [waitingGames, setWaitingGames] = useState([]);
  const [view, setView] = useState('lobby');
  const [loading, setLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [otherCards, setOtherCards] = useState([]);
  const [roomToJoin, setRoomToJoin] = useState(null);

  useEffect(() => {
    // Check for recovery hash directly on mount in case event fires too soon
    if (window.location.hash.includes('type=recovery')) {
      // Recovery handled in Auth.jsx, but we need to stop join logic
      setView('auth');
    } else if (window.location.hash.startsWith('#game=')) {
      const gid = window.location.hash.split('=')[1];
      if (gid) setRoomToJoin(gid);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setView('auth');
      }
      if (session) fetchProfile(session.user.id, session.user.email);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId, email) => {
     let { data: prof, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
     
     if (!prof && !error) {
        // Create default profile
        const defaultName = email.split('@')[0];
        const { data: newProf } = await supabase.from('profiles').insert({ id: userId, display_name: defaultName }).select().single();
        prof = newProf;
     }
     
     if (prof) {
        setProfile(prof);
        setNewNick(prof.display_name);
     }
  };

  const updateProfile = async () => {
    if (!session?.user || !newNick.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('profiles').upsert({ 
      id: session.user.id, 
      display_name: newNick.trim(),
      updated_at: new Date()
    });
    if (error) alert(error.message);
    else fetchProfile(session.user.id, session.user.email);
    setLoading(false);
  };

  const fetchGameState = useCallback(async (gameId, userId) => {
    if (!gameId || !userId) return;

    const { data: gData } = await supabase.from('games').select('*').eq('id', gameId).single();
    if (gData) setGame(gData);

    const { data: pData } = await supabase.from('players').select('*').eq('game_id', gameId).order('created_at', { ascending: true });
    setPlayers(pData || []);

    const me = (pData || []).find(p => p.user_id === userId);
    if (me) {
      const { data: hand } = await supabase.from('cards').select('*').eq('player_id', me.id).eq('is_played', false).order('value');
      setMyCards(hand || []);
    }

    let { data: table } = await supabase.from('cards').select('*, player:players(name)').eq('game_id', gameId).eq('is_played', true).is('trick_id', null).order('played_at');
    if (!table || table.length === 0) {
      const { data: lastTrick } = await supabase.from('tricks').select('id').eq('game_id', gameId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (lastTrick) {
        const { data: lastCards } = await supabase.from('cards').select('*, player:players(name)').eq('trick_id', lastTrick.id).order('played_at');
        table = lastCards;
      }
    }
    setTrickCards(table || []);
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !game?.id) return;
    const channel = supabase.channel(`game_sync:${game.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, () => fetchGameState(game.id, session.user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${game.id}` }, () => fetchGameState(game.id, session.user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `game_id=eq.${game.id}` }, () => fetchGameState(game.id, session.user.id))
      .subscribe();
    fetchGameState(game.id, session.user.id);
    return () => { supabase.removeChannel(channel); };
  }, [game?.id, session?.user?.id, fetchGameState]);

  useEffect(() => {
    const me = players.find(p => p.user_id === session?.user?.id);
    if (!game || !me) return;
    const ping = () => supabase.from('players').update({ last_ping: new Date() }).eq('id', me.id);
    const interval = setInterval(ping, 20000);
    ping();
    return () => clearInterval(interval);
  }, [game?.id, players.length, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchWaitingGames = async () => {
      try { fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup' }) }).catch(() => {}); } catch(e) {}
      const { data } = await supabase.from('games').select('*, players(name, last_ping)').eq('status', 'waiting');
      const now = new Date();
      const activeWaiting = (data || []).filter(g => {
         const alivePlayers = (g.players || []).filter(p => {
            if (!p.last_ping) return false;
            return Math.abs(now - new Date(p.last_ping)) < 45000;
         });
         const hasHuman = alivePlayers.some(p => !p.name.startsWith('Bot'));
         g.activeCount = alivePlayers.length;
         return hasHuman && g.activeCount > 0;
      });
      setWaitingGames(activeWaiting);
    };
    const lobbyChannel = supabase.channel('lobby_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, fetchWaitingGames)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchWaitingGames)
      .subscribe();
    fetchWaitingGames();
    const interval = setInterval(fetchWaitingGames, 30000);
    return () => { supabase.removeChannel(lobbyChannel); clearInterval(interval); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (session && roomToJoin) {
      joinGame(roomToJoin);
      setRoomToJoin(null);
      window.location.hash = ''; // Clear for clean URL
    }
  }, [session, roomToJoin]);

  useEffect(() => {
    if (game?.current_round === 1 && (game.status === 'bidding' || game.status === 'playing')) {
      const fetchOthers = async () => {
        try {
          const res = await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-other-cards', game_id: game.id, player_id: session.user.id }) });
          const d = await res.json();
          setOtherCards(d.cards || []);
        } catch(e) {}
      }
      fetchOthers();
      const interval = setInterval(fetchOthers, 3000);
      return () => clearInterval(interval);
    } else {
      setOtherCards([]);
    }
  }, [game?.id, game?.current_round, game?.status]);

  useEffect(() => {
    if (game?.status === 'bidding') setView('bidding');
    else if (game?.status === 'playing') setView('playing');
    else if (game?.status === 'ended') setView('ended');
    else if (game?.status === 'waiting') setView('lobby');
  }, [game?.status]);

  const createGame = async () => {
    if (!session?.user) return;
    const name = window.prompt('¿Qué nombre quieres para la sala?', 'Mesa de ' + (profile?.display_name || 'Alguien'));
    if (name === null) return;
    setLoading(true);
    const { data, error } = await supabase.from('games').insert({ status: 'waiting', name: name || 'Nueva Mesa', host_id: session.user.id }).select().single();
    if (error) alert(error.message);
    else joinGame(data.id);
    setLoading(false);
  };

  const joinGame = async (gameId) => {
    if (!session?.user) return;
    setLoading(true);
    const { data: existingPlayer } = await supabase.from('players').select('*').eq('game_id', gameId).eq('user_id', session.user.id).maybeSingle();
    if (!existingPlayer) {
      await supabase.from('players').insert({ 
        user_id: session.user.id, 
        game_id: gameId, 
        name: profile?.display_name || session.user.email.split('@')[0], 
        lives: 5,
        created_at: new Date(),
        last_ping: new Date()
      });
    } else {
      await supabase.from('players').update({ last_ping: new Date(), name: profile?.display_name }).eq('id', existingPlayer.id);
    }
    fetchGameState(gameId, session.user.id);
    setLoading(false);
  };

  const logout = async () => { await supabase.auth.signOut(); };
  if (!session?.user || view === 'auth') return <Auth />;

  const me = (players || []).find(p => p.user_id === session.user.id);
  const isHost = game?.host_id === session.user.id;
  const isMyTurn = players[game?.turn_index || 0]?.id === me?.id;
  const everyoneBid = players.length > 0 && players.every(p => p.current_bid !== null);

  const startGame = async () => fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start-round', game_id: game.id }) });
  const placeBid = async (bid) => fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'place-bid', game_id: game.id, player_id: me.id, data: { bid } }) });
  
  const playCard = async (cardId) => {
    // OPTIMISTIC UI: Remove card from hand immediately for instant feel
    setMyCards(prev => prev.filter(c => c.id !== cardId));
    fetch('/api/game', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ action: 'play-card', game_id: game.id, player_id: me.id, data: { card_id: cardId } }) 
    });
  };

  const addBot = async () => fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-bot', game_id: game.id }) });
  
  const copyInvite = () => {
    if (!game) return;
    const url = `${window.location.origin}/#game=${game.id}`;
    navigator.clipboard.writeText(url);
    alert('¡Enlace de invitación copiado! Envíalo a tus amigos para que se unan.');
  };

  const leaveGame = async () => { if (confirm('¿Abandonar partida?')) { await supabase.from('players').delete().eq('id', me.id); setGame(null); setView('lobby'); } };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-red-500/30 overflow-x-hidden pb-10">
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/30 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-50 flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40"><span className="text-xl font-black italic">5</span></div>
          <span className="text-xl font-black tracking-tighter uppercase">5 VIDAS</span>
        </div>
        <div className="flex items-center gap-2">
          {!game && <button onClick={() => setShowRules(true)} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-red-500"><Info className="w-6 h-6" /></button>}
          {game && <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">{isMenuOpen ? <X /> : <Menu />}</button>}
          <div className="h-8 w-px bg-white/10 mx-2" />
          <button onClick={logout} className="flex items-center gap-2 px-4 py-2 text-red-400 font-bold rounded-xl active:scale-95 transition-all"><LogOut className="w-5 h-5" /><span className="hidden sm:inline uppercase">Salir</span></button>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-2xl z-[60] border-l border-white/10 p-8 shadow-2xl shadow-black">
             <div className="flex items-center justify-between mb-12"><h2 className="text-2xl font-black italic uppercase tracking-tighter">OPCIONES</h2><button onClick={() => setIsMenuOpen(false)} className="p-2 bg-white/5 rounded-full"><X /></button></div>
              <div className="space-y-6">
                  <button onClick={() => { setIsMenuOpen(false); copyInvite(); }} className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-2xl border border-white/10 transition-all flex items-center justify-center gap-3 active:scale-95 uppercase tracking-widest text-emerald-400"><Plus className="w-5 h-5" /> INVITAR AMIGOS</button>
                  <button onClick={() => { setIsMenuOpen(false); setShowRules(true); }} className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-2xl border border-white/10 transition-all flex items-center justify-center gap-3 active:scale-95 uppercase tracking-widest"><Info className="w-5 h-5 text-red-500" /> REGLAS DEL JUEGO</button>
                 <button onClick={() => { setIsMenuOpen(false); leaveGame(); }} className="w-full bg-red-600/10 hover:bg-red-600/20 text-red-500 font-black py-4 rounded-2xl border border-red-500/20 transition-all flex items-center justify-center gap-3 active:scale-95 uppercase tracking-widest"><Zap className="w-5 h-5 fill-current" /> SALIR DE LA MESA</button>
              </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 p-4 max-w-5xl mx-auto">
        {!game && view === 'lobby' && (
          <div className="py-8 flex flex-col items-center gap-12">
            <div className="text-center">
              <h1 className="text-7xl md:text-9xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 mb-2 tracking-tighter">5 VIDAS</h1>
              <p className="text-red-500 font-black tracking-[0.5em] text-sm md:text-base uppercase underline underline-offset-8">JUEGO DE MESA</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
              {/* Profile Card */}
              <div className="relative bg-white/5 border border-white/10 p-8 rounded-[3rem] overflow-hidden group">
                   <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><User className="w-24 h-24" /></div>
                   <h2 className="text-xl font-black italic uppercase tracking-tighter mb-6 flex items-center gap-2">Tu Perfil <span className="text-[10px] text-slate-500 italic lowercase">v3.5</span></h2>
                   <div className="space-y-4 relative z-10">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Nickname Público</label>
                        <input 
                           type="text" 
                           value={newNick} 
                           onChange={(e) => setNewNick(e.target.value)}
                           className="bg-black/40 border border-white/10 rounded-2xl px-5 py-4 font-bold text-lg focus:outline-none focus:border-red-500/50 transition-colors"
                           placeholder="Escribe tu nick..."
                        />
                      </div>
                      <button 
                        onClick={updateProfile}
                        disabled={loading || newNick.trim() === profile?.display_name}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Save className="w-5 h-5" /> GUARDAR NICK
                      </button>
                   </div>
              </div>

              {/* Create Room Card */}
              <button onClick={createGame} disabled={loading} className="relative bg-white/5 border border-white/10 p-8 rounded-[3rem] transition-all hover:bg-white/10 active:scale-95 overflow-hidden group">
                 <div className="relative z-10 flex flex-col items-start gap-4">
                    <div className="p-4 bg-red-600 rounded-3xl group-hover:scale-110 transition-transform"><Plus className="w-8 h-8 font-black" /></div>
                    <div className="text-left font-black uppercase text-3xl">Crear Sala</div>
                 </div>
              </button>
              
              {/* Rooms List Card */}
              <div className="bg-white/5 border border-white/10 p-8 rounded-[3rem] flex flex-col gap-6 lg:row-span-1">
                <div className="flex items-center justify-between"><h2 className="text-xl font-black italic uppercase tracking-tighter">Mesas Activas</h2><Users className="text-red-500 w-5 h-5" /></div>
                {waitingGames.length > 0 ? (
                  <div className="space-y-3">
                    {waitingGames.map(g => (
                      <button key={g.id} onClick={() => joinGame(g.id)} className="w-full flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl transition-all group">
                        <div className="text-left">
                           <p className="font-black text-slate-200 line-clamp-1">{g.name || 'Mesa Sin Nombre'}</p>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{g.activeCount || 0} / 4 Jugadores</p>
                        </div>
                        <div className="p-3 bg-red-600/10 text-red-500 rounded-2xl group-hover:bg-red-600 group-hover:text-white transition-all"><Plus className="w-4 h-4" /></div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 text-center py-6 bg-black/20 rounded-[2rem] border border-dashed border-white/5 text-xs font-bold italic">No hay mesas activas.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {game && (
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-3xl">
              <div className="flex items-center gap-3">
                <div className="px-5 py-2 bg-red-600 rounded-2xl font-black text-sm">RONDA {game.current_round}</div>
                <div className="px-5 py-2 bg-black/40 border border-white/10 rounded-2xl font-black text-sm text-slate-400 italic">TURNO: {players[game.turn_index]?.name || '...'}</div>
              </div>
              <div className="flex items-center gap-2">
                {players.map(p => (
                  <div key={p.id} className={`p-2 rounded-2xl border transition-all ${players[game.turn_index]?.id === p.id ? 'bg-red-600 border-red-400 scale-110' : 'bg-white/5 border-white/10 shadow-lg'}`}>
                    <div className="flex flex-col items-center gap-1 relative">
                       <span className="text-[10px] font-black uppercase opacity-60">{p.user_id === session.user.id ? 'TÚ' : p.name.substring(0,8)}</span>
                       <div className="flex items-center gap-1 text-xs font-black">
                          <Heart className={`w-3 h-3 ${players[game.turn_index]?.id === p.id ? 'fill-white' : 'fill-red-500'}`} />
                          <span className={players[game.turn_index]?.id === p.id ? 'text-white' : 'text-slate-300'}>{p.lives}</span>
                       </div>
                       {p.current_bid !== null && <span className="text-[10px] font-black mt-1 bg-black/30 px-2 rounded-full">{p.tricks_won}/{p.current_bid}</span>}
                       {game.current_round === 1 && p.user_id !== session.user.id && (
                         <div className="mt-2 scale-50 -translate-y-2">
                           {otherCards.find(c => c.player_id === p.id) && (
                             <Card card={otherCards.find(c => c.player_id === p.id)} disabled />
                           )}
                         </div>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[45vh] bg-slate-900/50 rounded-[3.5rem] border border-white/5 flex items-center justify-center p-8 overflow-hidden">
               <div className="flex flex-wrap justify-center gap-4 relative z-10">
                <AnimatePresence>
                  {trickCards.map(t => (
                    <motion.div key={t.id} initial={{ scale: 0, y: 50 }} animate={{ scale: 1, y: 0 }} className="relative">
                       <Card card={t} disabled />
                       <div className="absolute -top-3 -right-3 bg-red-600 px-3 py-1 rounded-xl text-[10px] font-black shadow-xl uppercase">{t.player?.name}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {trickCards.length === 0 && (game.status === 'playing' || game.status === 'bidding') && <div className="text-white/5 font-black text-8xl italic select-none">TABLERO</div>}
                
                {view === 'bidding' && isMyTurn && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    className="absolute inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 rounded-[3.5rem]"
                  >
                     <div className="bg-slate-900 border border-white/20 rounded-[2.5rem] p-8 shadow-2xl w-full max-w-lg">
                        <h3 className="text-center text-xl font-black mb-6 italic tracking-tighter uppercase">¿CUÁNTAS BAZAS TE LLEVAS?</h3>
                        <div className="flex flex-wrap justify-center gap-2">
                           {[...Array(game.current_round + 1)].map((_, i) => (
                             <button 
                               key={i} 
                               onClick={() => placeBid(i)} 
                               disabled={loading || me?.current_bid !== null} 
                               className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl border-2 font-black text-lg transition-all ${me?.current_bid === i ? 'bg-red-600 border-red-400 scale-110 shadow-lg' : 'bg-white/5 border-white/20 hover:bg-white/10'}`}
                             >
                               {i}
                             </button>
                           ))}
                        </div>
                        {me?.current_bid !== null && <p className="text-center mt-6 text-amber-500 font-bold animate-pulse text-sm">Esperando al resto...</p>}
                     </div>
                  </motion.div>
                )}
               </div>
               {isMyTurn && view === 'playing' && everyoneBid && <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity }} className="absolute bottom-6 left-1/2 -translate-x-1/2 px-8 py-3 bg-amber-500 text-black font-black text-sm tracking-widest rounded-full shadow-2xl">TU TURNO</motion.div>}
            </div>

            <div className="mt-4">
               {(view === 'bidding' || view === 'playing') && (
                 <div className="flex flex-col items-center gap-8">
                    <div className="flex flex-col items-center gap-4 w-full">
                       <div className="flex flex-wrap justify-center gap-3 p-4 w-full">
                          {myCards.map(c => (
                            <Card 
                              key={c.id} 
                              card={c} 
                              hidden={game.current_round === 1 && game.status !== 'ended'} // Blind Mode
                              onClick={() => playCard(c.id)} 
                              disabled={loading || !isMyTurn || game.status !== 'playing'} 
                              isPlayable={isMyTurn && game.status === 'playing'}
                            />
                          ))}
                       </div>
                    </div>
                 </div>
               )}

               {view === 'lobby' && (
                 <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
                    {isHost && players.length < 4 && <button onClick={addBot} className="bg-white/5 text-white border border-white/10 px-8 py-5 rounded-3xl font-black text-lg active:scale-95 transition-all">AÑADIR BOT</button>}
                    {isHost && players.length >= 2 && <button onClick={startGame} className="bg-green-600 text-white px-12 py-5 rounded-3xl font-black text-xl shadow-xl shadow-green-900/40 active:scale-95 transition-all uppercase italic">¡Comenzar!</button>}
                    <button onClick={() => { setGame(null); setView('lobby'); }} className="bg-white/5 text-slate-500 px-8 py-5 rounded-3xl font-black text-lg active:scale-95 transition-all">VOLVER</button>
                 </div>
               )}
            </div>
          </div>
        )}

        {view === 'ended' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8">
             <Trophy className="w-24 h-24 text-amber-500" />
             <h1 className="text-5xl font-black italic uppercase">Mesa Cerrada</h1>
             <div className="w-full max-w-sm space-y-3">
               {players.sort((a,b) => b.lives - a.lives).map((p, i) => (
                 <div key={p.id} className={`flex items-center justify-between p-6 rounded-[2rem] border ${i === 0 ? 'bg-amber-600/20 border-amber-500/50 scale-105' : 'bg-white/5 border-white/10 opacity-80'}`}>
                    <span className="font-black text-lg">{i+1}. {p.name}</span>
                    <div className="flex items-center gap-2 font-black text-red-500">
                      <Heart className="fill-current w-5 h-5" />
                      <span className="text-2xl">{p.lives}</span>
                    </div>
                 </div>
               ))}
             </div>
             <button onClick={() => { setGame(null); setView('lobby'); }} className="bg-white text-black px-12 py-5 rounded-3xl font-black text-xl hover:scale-105 transition-all uppercase">Menu Principal</button>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showRules && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-white/10 rounded-[3rem] p-8 max-w-2xl w-full shadow-2xl relative"
            >
               <button onClick={() => setShowRules(false)} className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
               
               <div className="flex items-center gap-4 mb-8">
                  <div className="bg-red-600 p-4 rounded-3xl shrink-0"><Info className="w-8 h-8 text-white" /></div>
                  <div>
                     <h2 className="text-3xl font-black italic uppercase tracking-tighter">Cómo Jugar</h2>
                     <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Reglas Oficiales de 5 Vidas</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-sm">
                  <div className="space-y-4">
                     <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h3 className="text-red-400 font-black uppercase text-xs mb-2">1. Las Rondas</h3>
                        <p className="text-slate-300">Empezamos con **5 cartas**. Cada ronda el número de cartas baja: 4, 3, 2 hasta llegar a **1**.</p>
                     </div>
                     <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h3 className="text-red-400 font-black uppercase text-xs mb-2">2. La Apuesta</h3>
                        <p className="text-slate-300">Al ver tus cartas, debes decir cuántas **bazas** (veces que ganarás la carta del centro) te llevarás.</p>
                     </div>
                  </div>
                  <div className="space-y-4">
                     <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h3 className="text-red-400 font-black uppercase text-xs mb-2">3. El Último Postor</h3>
                        <p className="text-slate-300 italic">"Regla de Oro": El último en apostar NO puede decir un número que haga que la suma de apuestas cuadre con las cartas.</p>
                     </div>
                     <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h3 className="text-red-400 font-black uppercase text-xs mb-2">4. Puntuación</h3>
                        <p className="text-slate-300 text-xs">Pierdes vidas según la diferencia: Si pides 2 y te llevas 0, pierdes **2 vidas**. Si aciertas exactamente, ¡no pierdes nada!</p>
                     </div>
                  </div>
               </div>

               <button 
                  onClick={() => setShowRules(false)}
                  className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase hover:scale-[1.02] transition-all"
               >
                  ¡Entendido, a jugar!
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="relative z-10 py-12 flex flex-col items-center gap-6">
        <div className="flex items-center gap-4 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center font-black">5</div>
          <span className="text-sm font-black tracking-widest uppercase italic">v3.5 Final Master Edition</span>
        </div>
        <p className="text-slate-500 text-[10px] font-black tracking-widest uppercase flex flex-col items-center gap-2">
          <span>© 2026 5 VIDAS - Juego de Cartas</span>
          <span className="text-red-600">Creado por Juanjo_xrd</span>
        </p>
      </footer>
    </div>
  );
}
