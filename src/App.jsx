import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import Card from './components/Card';
import Auth from './components/Auth';
import { Heart, Trophy, Users, Play, Plus, LogOut, Menu, X, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [session, setSession] = useState(null);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [trickCards, setTrickCards] = useState([]);
  const [view, setView] = useState('lobby'); // lobby, bidding, playing, ended
  const [loading, setLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchGameState = useCallback(async (gameId, userId) => {
    if (!gameId || !userId) return;

    // 1. Fetch Game
    const { data: gData } = await supabase.from('games').select('*').eq('id', gameId).single();
    if (gData) setGame(gData);

    // 2. Fetch Players
    const { data: pData } = await supabase.from('players').select('*').eq('game_id', gameId).order('id');
    setPlayers(pData || []);

    // 3. Fetch My Cards
    const me = (pData || []).find(p => p.user_id === userId);
    if (me) {
      const { data: hand } = await supabase.from('cards')
        .select('*')
        .eq('player_id', me.id)
        .eq('is_played', false)
        .order('value');
      setMyCards(hand || []);
    }

    // 4. Fetch Table Cards (Current Trick)
    const { data: table } = await supabase.from('cards')
      .select('*, player:players(name)')
      .eq('game_id', gameId)
      .eq('is_played', true)
      .is('trick_id', null)
      .order('played_at');
    setTrickCards(table || []);
  }, []);

  // Sync Subscriptions
  useEffect(() => {
    if (!session?.user?.id || !game?.id) return;

    const channel = supabase
      .channel(`game_sync:${game.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, () => fetchGameState(game.id, session.user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${game.id}` }, () => fetchGameState(game.id, session.user.id))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `game_id=eq.${game.id}` }, () => fetchGameState(game.id, session.user.id))
      .subscribe();

    fetchGameState(game.id, session.user.id);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id, session?.user?.id, fetchGameState]);

  useEffect(() => {
    if (game?.status === 'bidding') setView('bidding');
    else if (game?.status === 'playing') setView('playing');
    else if (game?.status === 'ended') setView('ended');
    else if (game?.status === 'waiting') setView('lobby');
  }, [game?.status]);

  const createGame = async () => {
    if (!session?.user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('games').insert({ status: 'waiting' }).select().single();
      if (error) throw error;
      joinGame(data.id);
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  const joinGame = async (gameId) => {
    if (!session?.user) return;
    setLoading(true);
    try {
      const { data: existingPlayer } = await supabase.from('players').select('*').eq('game_id', gameId).eq('user_id', session.user.id).maybeSingle();
      if (!existingPlayer) {
        await supabase.from('players').insert({ user_id: session.user.id, game_id: gameId, name: session.user.email.split('@')[0], lives: 5 });
      }
      fetchGameState(gameId, session.user.id);
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  const logout = async () => { await supabase.auth.signOut(); };
  if (!session?.user) return <Auth />;

  const me = (players || []).find(p => p.user_id === session.user.id);
  const humanPlayers = (players || []).filter(p => !p.name.startsWith('Bot'));
  const isHost = humanPlayers[0]?.user_id === session.user.id;
  const sortedPlayers = [...(players || [])].sort((a,b) => a.id.localeCompare(b.id));
  const currentPlayer = sortedPlayers[game?.turn_index || 0];
  const isMyTurn = currentPlayer?.id === me?.id;
  const everyoneBid = players.length > 0 && players.every(p => p.current_bid !== null);

  const startGame = async () => {
    if (!game?.id) return;
    await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start-round', game_id: game.id }) });
  };
  const placeBid = async (bid) => {
    if (!me || !game?.id) return;
    await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'place-bid', game_id: game.id, player_id: me.id, data: { bid } }) });
  };
  const playCard = async (cardId) => {
    if (!me || !game?.id) return;
    await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'play-card', game_id: game.id, player_id: me.id, data: { card_id: cardId } }) });
  };
  const addBot = async () => {
    if (!game?.id) return;
    await fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-bot', game_id: game.id }) });
  };
  const backToLobby = () => { setGame(null); setView('lobby'); };
  const leaveGame = async () => {
    if (!me) return;
    if (confirm('¿Abandonar partida?')) {
      await supabase.from('players').delete().eq('id', me.id);
      setGame(null);
      setView('lobby');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-red-500/30 overflow-x-hidden pb-10">
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/30 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-50 flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40">
            <span className="text-xl font-black italic">5</span>
          </div>
          <span className="text-xl font-black tracking-tighter uppercase sm:block">5 VIDAS</span>
        </div>
        <div className="flex items-center gap-2">
          {game && (
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          )}
          <div className="h-8 w-px bg-white/10 mx-2" />
          <button onClick={logout} className="flex items-center gap-2 px-4 py-2 text-red-400 font-bold rounded-xl active:scale-95 transition-all">
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline uppercase">Salir</span>
          </button>
        </div>
      </nav>

      {/* Menu Lateral */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-2xl z-[60] border-l border-white/10 p-8 shadow-2xl shadow-black">
             <div className="flex items-center justify-between mb-12">
               <h2 className="text-2xl font-black italic">MENU</h2>
               <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-white/5 rounded-full"><X /></button>
             </div>
             <div className="space-y-6">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                   <p className="text-[10px] font-black text-red-500 uppercase tracking-tighter mb-4">Jugador</p>
                   <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center font-black text-2xl uppercase shadow-lg shadow-red-900/40">{me?.name?.[0]}</div>
                      <div>
                        <p className="font-bold text-lg">{me?.name}</p>
                        <div className="flex gap-1 text-red-500">
                          {[...Array(me?.lives || 0)].map((_, i) => <Heart key={i} className="w-4 h-4 fill-current" />)}
                        </div>
                      </div>
                   </div>
                </div>
                <button onClick={() => { setIsMenuOpen(false); leaveGame(); }} className="w-full bg-red-600/10 hover:bg-red-600/20 text-red-500 font-bold py-5 rounded-3xl border border-red-500/20 transition-all flex items-center justify-center gap-3">
                  <Zap className="w-5 h-5 fill-current" /> ABANDONAR
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 p-4 max-w-5xl mx-auto">
        {!game && view === 'lobby' && (
          <div className="py-12 flex flex-col items-center gap-12">
            <div className="text-center">
              <h1 className="text-7xl md:text-9xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 mb-2 tracking-tighter">5 VIDAS</h1>
              <p className="text-red-500 font-black tracking-[0.5em] text-sm md:text-base uppercase underline underline-offset-8">Mesa de Juego</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
              <button onClick={createGame} disabled={loading} className="relative bg-white/5 border border-white/10 p-10 rounded-[3rem] transition-all hover:bg-white/10 active:scale-95 overflow-hidden group">
                 <div className="relative z-10 flex flex-col items-start gap-4">
                    <div className="p-4 bg-red-600 rounded-3xl group-hover:scale-110 transition-transform"><Plus className="w-8 h-8 font-black" /></div>
                    <div className="text-left font-black uppercase text-3xl">Crear Sala</div>
                 </div>
              </button>
              <div className="bg-white/5 border border-white/10 p-8 rounded-[3rem] flex flex-col gap-6">
                <div className="flex items-center justify-between"><h2 className="text-2xl font-black italic">SALAS</h2><Users className="text-red-500" /></div>
                <p className="text-slate-600 text-center py-10 bg-black/20 rounded-[2rem] border border-dashed border-white/5 font-bold italic">Buscando mesas...</p>
              </div>
            </div>
          </div>
        )}

        {game && (
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-3xl">
              <div className="flex items-center gap-3">
                <div className="px-5 py-2 bg-red-600 rounded-2xl font-black text-sm shadow-lg shadow-red-950/40">RONDA {game.current_round}</div>
                <div className="px-5 py-2 bg-white/5 border border-white/10 rounded-2xl font-black text-sm text-slate-400 italic">TURNO: {currentPlayer?.name || '...'}</div>
              </div>
              <div className="flex items-center gap-2">
                {players.map(p => (
                  <div key={p.id} className={`p-2 rounded-2xl border transition-all ${currentPlayer?.id === p.id ? 'bg-red-600 border-red-400' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex flex-col items-center gap-1">
                       <span className="text-[8px] font-black uppercase opacity-60 tracking-widest">{p.name === me?.name ? 'TÚ' : p.name.substring(0,8)}</span>
                       <div className="flex gap-0.5">
                         {[...Array(p.lives)].map((_, i) => <Heart key={i} className={`w-2 h-2 ${currentPlayer?.id === p.id ? 'fill-white' : 'fill-red-500'}`} />)}
                       </div>
                       {p.current_bid !== null && <span className="text-[10px] font-black mt-1 bg-black/30 px-2 rounded-full">{p.tricks_won}/{p.current_bid}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[40vh] md:min-h-[50vh] bg-slate-900/50 rounded-[3.5rem] border border-white/5 flex items-center justify-center p-8 overflow-hidden shadow-inner">
               <div className="flex flex-wrap justify-center gap-4 relative z-10">
                 <AnimatePresence>
                   {trickCards.map(t => (
                     <motion.div key={t.id} initial={{ scale: 0, y: 50 }} animate={{ scale: 1, y: 0 }} className="relative">
                        <Card card={t} disabled />
                        <div className="absolute -top-3 -right-3 bg-red-600 px-3 py-1 rounded-xl text-[10px] font-black shadow-xl uppercase">{t.player?.name}</div>
                     </motion.div>
                   ))}
                 </AnimatePresence>
                 {trickCards.length === 0 && (game.status === 'playing' || game.status === 'bidding') && (
                   <div className="text-white/5 font-black text-8xl italic uppercase select-none tracking-tighter">TABLERO</div>
                 )}
               </div>
               {isMyTurn && view === 'playing' && everyoneBid && (
                 <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity }} className="absolute bottom-8 left-1/2 -translate-x-1/2 px-8 py-3 bg-amber-500 text-black font-black text-sm tracking-widest rounded-full shadow-2xl">TU TURNO</motion.div>
               )}
            </div>

            <div className="mt-8">
               {/* UI REFACTOR: Hand ALWAYS visible above bidding buttons */}
               {(view === 'bidding' || view === 'playing') && (
                 <div className="flex flex-col items-center gap-12">
                    <div className="flex flex-col items-center gap-4 w-full">
                       <h3 className="text-red-500 font-black tracking-widest text-xs uppercase underline">Tu Mano</h3>
                       <div className="flex flex-wrap justify-center gap-3 overflow-x-auto p-4 w-full">
                          {myCards.map(c => (
                            <Card 
                              key={c.id} 
                              card={c} 
                              onClick={() => isMyTurn && everyoneBid && view === 'playing' && playCard(c.id)}
                              disabled={!isMyTurn || !everyoneBid || view !== 'playing'}
                              isBlind={false} // User wants to see cards!
                            />
                          ))}
                       </div>
                    </div>

                    {view === 'bidding' && (
                      <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 shadow-2xl w-full max-w-2xl">
                         <h3 className="text-center text-3xl font-black mb-8 italic">¿CUÁNTAS GANAS?</h3>
                         <div className="flex flex-wrap justify-center gap-4">
                            {[...Array(game.current_round + 1)].map((_, i) => (
                              <button key={i} onClick={() => placeBid(i)} disabled={loading || me?.current_bid !== null} className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl border-4 font-black text-2xl transition-all active:scale-90 ${me?.current_bid === i ? 'bg-red-600 border-red-400' : 'bg-white/5 border-white/10'}`}>
                                {i}
                              </button>
                            ))}
                         </div>
                         {me?.current_bid !== null && !everyoneBid && <p className="text-center mt-6 text-amber-500 font-bold animate-pulse italic">Esperando apuestas...</p>}
                      </motion.div>
                    )}
                 </div>
               )}

               {view === 'lobby' && (
                 <div className="flex flex-col sm:flex-row justify-center gap-4">
                    {isHost && players.length < 4 && <button onClick={addBot} className="bg-red-600/20 text-red-500 border border-red-500/20 px-8 py-5 rounded-3xl font-black text-xl active:scale-95 transition-all">AÑADIR BOT</button>}
                    {isHost && players.length >= 2 && <button onClick={startGame} className="bg-green-600 text-white px-12 py-5 rounded-3xl font-black text-xl shadow-xl shadow-green-900/40 active:scale-95 transition-all">COMENZAR</button>}
                    <button onClick={backToLobby} className="bg-white/5 text-white border border-white/10 px-8 py-5 rounded-3xl font-black text-xl active:scale-95 transition-all">VOLVER AL MENU</button>
                 </div>
               )}
            </div>
          </div>
        )}

        {view === 'ended' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8">
             <Trophy className="w-32 h-32 text-amber-500 shadow-2xl shadow-amber-900" />
             <h1 className="text-6xl font-black italic">FIN PARTIDA</h1>
             <div className="w-full max-w-md space-y-4">
               {players.sort((a,b) => b.lives - a.lives).map((p, i) => (
                 <div key={p.id} className={`flex items-center justify-between p-6 rounded-[2rem] border ${i === 0 ? 'bg-amber-600/20 border-amber-500/50' : 'bg-white/5 border-white/10'}`}>
                    <span className="font-black text-xl">{i+1}. {p.name}</span>
                    <div className="flex gap-1 text-red-500">{[...Array(p.lives)].map((_, j) => <Heart key={j} className="fill-current w-4 h-4" />)}</div>
                 </div>
               ))}
             </div>
             <button onClick={() => { setGame(null); setView('lobby'); }} className="bg-white text-black px-12 py-5 rounded-3xl font-black text-xl hover:bg-red-600 hover:text-white transition-all">REINTENTAR</button>
          </div>
        )}
      </main>
    </div>
  );
}
