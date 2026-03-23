import React, { useState, useEffect } from 'react';
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
  const [tricks, setTricks] = useState([]);
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

  // Fetch and Subscribe to Game Data
  useEffect(() => {
    if (!session || !game?.id) return;

    const gameChannel = supabase
      .channel(`game:${game.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, 
        (payload) => setGame(payload.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${game.id}` }, 
        async () => {
          const { data } = await supabase.from('players').select('*').eq('game_id', game.id).order('joined_at');
          setPlayers(data || []);
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `game_id=eq.${game.id}` }, 
        async () => {
          const myPlayer = players.find(p => p.user_id === session.user.id);
          if (myPlayer) {
            const { data } = await supabase.from('cards').select('*').eq('player_id', myPlayer.id).eq('is_played', false);
            setMyCards(data || []);
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tricks', filter: `game_id=eq.${game.id}` }, 
        async () => {
          const { data } = await supabase.from('tricks').select('*, card:cards(*)').eq('game_id', game.id).eq('round_number', game.current_round).order('played_at');
          setTricks(data || []);
        })
      .subscribe();

    return () => {
      supabase.removeChannel(gameChannel);
    };
  }, [game?.id, session, players.length]);

  // Handle Game Logic Transitions
  useEffect(() => {
    if (game?.status === 'bidding') setView('bidding');
    else if (game?.status === 'playing') setView('playing');
    else if (game?.status === 'ended') setView('ended');
    else if (game?.status === 'waiting') setView('lobby');
  }, [game?.status]);

  const createGame = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('games').insert({ status: 'waiting' }).select().single();
      if (error) throw error;
      joinGame(data.id);
    } catch (err) {
      alert('Error al crear partida: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const joinGame = async (gameId) => {
    setLoading(true);
    try {
      const { data: existingPlayer } = await supabase.from('players')
        .select('*')
        .eq('game_id', gameId)
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      if (!existingPlayer) {
        const { error: joinError } = await supabase.from('players').insert({
          user_id: session.user.id,
          game_id: gameId,
          name: session.user.email.split('@')[0],
          lives: 5
        });
        if (joinError) throw joinError;
      }

      const { data: gData } = await supabase.from('games').select('*').eq('id', gameId).single();
      setGame(gData);
      
      const { data: pData } = await supabase.from('players').select('*').eq('game_id', gameId).order('joined_at');
      setPlayers(pData || []);
    } catch (err) {
      alert('Error al unirse: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  if (!session) return <Auth />;

  // These must be after the session check
  const me = players.find(p => p.user_id === session.user.id);
  const isHost = players[0]?.user_id === session.user.id;
  const isMyTurn = game?.current_turn_id === me?.id;
  const everyoneBid = players.every(p => p.current_bid !== null);

  const startGame = async () => {
    await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start-round', game_id: game.id })
    });
  };

  const placeBid = async (bid) => {
    if (!me) return;
    await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'place-bid', game_id: game.id, player_id: me.id, data: { bid } })
    });
  };

  const playCard = async (cardId) => {
    if (!me) return;
    await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'play-card', game_id: game.id, player_id: me.id, data: { card_id: cardId } })
    });
  };

  const leaveGame = async () => {
    if (!me) return;
    if (confirm('¿Seguro que quieres abandonar la partida? Perderás tu progreso.')) {
      setLoading(true);
      await supabase.from('players').delete().eq('id', me.id);
      setGame(null);
      setView('lobby');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-red-500/30 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/30 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-50 flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/40">
            <span className="text-xl font-black italic">5</span>
          </div>
          <span className="text-xl font-black tracking-tighter uppercase hidden sm:block">5 VIDAS</span>
        </div>

        <div className="flex items-center gap-2">
          {game && (
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          )}
          <div className="h-8 w-px bg-white/10 mx-2" />
          <button 
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 text-red-400 font-bold rounded-xl transition-all active:scale-95"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-y-0 right-0 w-80 bg-slate-900/95 backdrop-blur-2xl z-[60] border-l border-white/10 p-8 shadow-2xl shadow-black"
          >
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl font-black tracking-tight">OPCIONES</h2>
              <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">Jugador</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-amber-500 rounded-2xl flex items-center justify-center font-bold text-xl">
                    {me?.name ? me.name[0].toUpperCase() : 'U'}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{me?.name || 'Iniciando...'}</p>
                    <div className="flex items-center gap-1 text-red-500">
                      {[...Array(me?.lives || 0)].map((_, i) => <Heart key={i} className="w-4 h-4 fill-current" />)}
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => { setIsMenuOpen(false); leaveGame(); }}
                className="w-full bg-red-600/10 hover:bg-red-600/20 text-red-500 font-bold py-5 rounded-3xl border border-red-500/20 transition-all flex items-center justify-center gap-3"
              >
                <Zap className="w-6 h-6" />
                Abandonar Partida
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 p-4 max-w-5xl mx-auto">
        {!game && view === 'lobby' && (
          <div className="py-12 flex flex-col items-center gap-12">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 mb-4 drop-shadow-2xl">
                5 VIDAS
              </h1>
              <p className="text-red-400 font-bold tracking-[0.3em] uppercase opacity-80">El Clásico de Cartas</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
              <button
                onClick={createGame}
                disabled={loading}
                className="group relative bg-white/5 hover:bg-white/10 border border-white/10 p-8 rounded-[2.5rem] transition-all active:scale-[0.98] overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 transition-transform group-hover:scale-150 group-hover:rotate-12">
                  <Plus className="w-32 h-32" />
                </div>
                <div className="relative z-10 flex flex-col items-start gap-4">
                  <div className="p-4 bg-red-600 rounded-3xl shadow-lg shadow-red-900/40">
                    <Plus className="w-8 h-8 font-black" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-3xl font-black tracking-tight mb-2">CREAR</h2>
                    <p className="text-slate-400 font-medium">Nueva mesa de juego</p>
                  </div>
                </div>
              </button>

              <div className="bg-white/5 border border-white/10 p-8 rounded-[2.5rem] flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black tracking-tight">SALAS ACTIVAS</h2>
                  <Users className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  <p className="text-slate-500 text-center py-8 bg-black/20 rounded-3xl border border-dashed border-white/10">No hay salas disponibles</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {game && (
          <div className="flex flex-col gap-6 pt-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 backdrop-blur-md border border-white/10 p-4 md:p-6 rounded-3xl shadow-xl">
              <div className="flex items-center gap-4">
                <div className="px-4 py-2 bg-red-600 rounded-2xl font-black shadow-lg shadow-red-950/40">
                  RONDA {game.current_round}
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-2xl border border-white/10 font-bold text-slate-300">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  {tricks.length} Bazas Tiradas
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {players.map(p => (
                  <motion.div 
                    key={p.id}
                    animate={{ scale: game.current_turn_id === p.id ? 1.1 : 1 }}
                    className={`relative p-3 rounded-2xl border transition-all ${game.current_turn_id === p.id ? 'bg-red-600 border-red-400 shadow-lg shadow-red-900/40' : 'bg-white/5 border-white/10'}`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] uppercase font-black tracking-widest opacity-60">
                        {p.user_id === session.user.id ? 'TÚ' : p.name.substring(0, 8)}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {[...Array(p.lives)].map((_, i) => <Heart key={i} className={`w-3 h-3 ${game.current_turn_id === p.id ? 'fill-white' : 'fill-red-500'}`} />)}
                      </div>
                      {p.current_bid !== null && (
                        <span className="text-xs font-bold mt-1 bg-black/20 px-2 py-0.5 rounded-full">
                          {p.tricks_won || 0}/{p.current_bid}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[40vh] md:min-h-[50vh] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black/80 rounded-[3rem] border border-white/5 flex items-center justify-center p-8 overflow-hidden">
               <div className="flex flex-wrap justify-center gap-4 relative z-10">
                <AnimatePresence>
                  {tricks.map(t => (
                    <motion.div 
                      key={t.id}
                      initial={{ scale: 0, rotate: -45, y: 50 }}
                      animate={{ scale: 1, rotate: 0, y: 0 }}
                      className="relative"
                    >
                      <Card card={t.card} disabled />
                      <div className="absolute -top-3 -right-3 px-2 py-1 bg-red-600 rounded-lg text-[10px] font-black uppercase shadow-lg">
                        {players.find(p => p.id === t.player_id)?.name.split('@')[0]}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {tricks.length === 0 && game.status === 'playing' && (
                  <div className="text-slate-700 font-black text-4xl md:text-6xl tracking-tighter opacity-10 select-none">TABLERO</div>
                )}
               </div>

               {isMyTurn && (
                 <motion.div 
                   animate={{ scale: [1, 1.05, 1] }} 
                   transition={{ repeat: Infinity, duration: 2 }}
                   className="absolute top-12 left-1/2 -translate-x-1/2 px-6 py-3 bg-amber-500 rounded-full text-black font-black text-sm tracking-widest shadow-2xl flex items-center gap-2"
                 >
                   <Zap className="w-4 h-4 fill-current" /> ES TU TURNO
                 </motion.div>
               )}
            </div>

            <div className="mt-4 pb-12">
              {view === 'bidding' && (
                <motion.div 
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl"
                >
                  <h3 className="text-center text-3xl font-black tracking-tight mb-8">¿CUÁNTAS BAZAS GANARÁS?</h3>
                  <div className="flex flex-wrap justify-center gap-3 md:gap-4">
                    {[...Array(game.current_round + 1)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => placeBid(i)}
                        disabled={loading || me?.current_bid !== null}
                        className={`
                          w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-3xl border-2 transition-all active:scale-95 font-black text-xl md:text-2xl
                          ${me?.current_bid === i ? 'bg-red-600 border-red-400 text-white shadow-xl shadow-red-900/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}
                          ${me?.current_bid !== null && me?.current_bid !== i ? 'opacity-30' : ''}
                        `}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                  {me?.current_bid !== null && !everyoneBid && (
                    <p className="text-center mt-8 text-amber-500 font-bold animate-pulse tracking-wide italic">Esperando apuestas de los demás...</p>
                  )}
                </motion.div>
              )}

              {view === 'playing' && (
                <div className="flex flex-wrap justify-center gap-2 md:gap-4 px-4 overflow-x-auto pb-4 pt-8 md:pt-12">
                   {myCards.map(c => (
                     <Card 
                       key={c.id} 
                       card={c} 
                       onClick={() => isMyTurn && everyoneBid && playCard(c.id)}
                       disabled={!isMyTurn || !everyoneBid}
                       isBlind={game.current_round === 1}
                     />
                   ))}
                </div>
              )}

              {view === 'lobby' && players.length >= 2 && isHost && (
                <div className="flex justify-center pt-8">
                  <button
                    onClick={startGame}
                    className="bg-green-600 hover:bg-green-500 px-12 py-5 rounded-3xl font-black text-xl shadow-xl shadow-green-900/40 transition-all active:scale-95 flex items-center gap-3"
                  >
                    <Play className="w-8 h-8 fill-current" /> COMENZAR PARTIDA
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'ended' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8">
            <Trophy className="w-32 h-32 text-amber-500 drop-shadow-[0_0_30px_rgba(245,158,11,0.5)]" />
            <div className="text-center">
              <h1 className="text-6xl font-black tracking-tighter mb-2 italic">FIN DEL JUEGO</h1>
              <p className="text-slate-400 font-bold uppercase tracking-widest">¡Partida Finalizada!</p>
            </div>
            
            <div className="grid grid-cols-1 gap-4 w-full max-md">
               {players.sort((a,b) => b.lives - a.lives).map((p, i) => (
                 <div key={p.id} className={`flex items-center justify-between p-6 rounded-3xl border ${i === 0 ? 'bg-amber-600/20 border-amber-500/50' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-4">
                       <span className={`text-2xl font-black ${i === 0 ? 'text-amber-500' : 'text-slate-500'}`}>#{i+1}</span>
                       <span className="font-bold text-xl uppercase tracking-tight">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-red-500">
                      {[...Array(p.lives)].map((_, i) => <Heart key={i} className="w-5 h-5 fill-current" />)}
                    </div>
                 </div>
               ))}
            </div>

            <button
              onClick={() => { setGame(null); setView('lobby'); }}
              className="mt-8 bg-white text-black font-black px-12 py-5 rounded-3xl text-xl hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-2xl"
            >
              VOLVER AL INICIO
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
