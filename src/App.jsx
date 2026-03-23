import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { Card } from './components/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Heart, Users, MessageSquare, Play, Plus, LogIn, Send } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  const [user, setUser] = useState({ id: crypto.randomUUID(), name: '' });
  const [gameId, setGameId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [myPlayer, setMyPlayer] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [tableCards, setTableCards] = useState([]);
  const [view, setView] = useState('lobby'); // 'lobby', 'bidding', 'playing', 'ended'
  const [loading, setLoading] = useState(false);

  // 1. Session persistence
  useEffect(() => {
    const saved = localStorage.getItem('v5_user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const saveUser = (name) => {
    const newUser = { ...user, name };
    setUser(newUser);
    localStorage.setItem('v5_user', JSON.stringify(newUser));
  };

  // 2. Realtime Subscriptions
  useEffect(() => {
    if (!gameId) return;

    const gameSub = supabase.channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
        setGameState(payload.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, () => {
        fetchPlayers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `game_id=eq.${gameId}` }, () => {
        fetchCards();
      })
      .subscribe();

    return () => { supabase.removeChannel(gameSub); };
  }, [gameId]);

  const fetchGameState = async (id) => {
    const { data } = await supabase.from('games').select('*').eq('id', id).single();
    if (data) setGameState(data);
  };

  const fetchPlayers = async () => {
    const { data } = await supabase.from('players').select('*').eq('game_id', gameId).order('order_index');
    if (data) {
        setPlayers(data);
        const me = data.find(p => p.user_id === user.id);
        setMyPlayer(me);
    }
  };

  const fetchCards = async () => {
    const { data: cards } = await supabase.from('cards').select('*').eq('game_id', gameId);
    if (cards) {
        setMyCards(cards.filter(c => c.player_id === myPlayer?.id && !c.is_played));
        setTableCards(cards.filter(c => c.is_played).sort((a,b) => new Date(a.played_at) - new Date(b.played_at)));
    }
  };

  useEffect(() => {
    if (gameId && myPlayer) {
        fetchCards();
    }
  }, [gameId, myPlayer]);

  // 3. Game Actions
  const createGame = async () => {
    if (!user.name) return alert('Dime tu nombre primero');
    setLoading(true);
    const { data: game, error } = await supabase.from('games').insert({ status: 'waiting' }).select().single();
    if (error) return console.error(error);
    
    await joinGame(game.id);
    setLoading(false);
  };

  const joinGame = async (id) => {
    if (!user.name) return alert('Dime tu nombre primero');
    setGameId(id);
    const { data: existingPlayers } = await supabase.from('players').select('*').eq('game_id', id);
    if (existingPlayers.some(p => p.user_id === user.id)) {
        setView('waiting');
        fetchGameState(id);
        fetchPlayers();
        return;
    }

    const { error } = await supabase.from('players').insert({
        game_id: id,
        user_id: user.id,
        name: user.name,
        order_index: existingPlayers.length,
        lives: 5
    });

    if (error) return alert('Partida llena o error');
    setView('waiting');
    fetchGameState(id);
    fetchPlayers();
  };

  const startGame = async () => {
    await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-round', game_id: gameId })
    });
  };

  const placeBid = async (bid) => {
    await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'place-bid', game_id: gameId, player_id: myPlayer.id, data: { bid } })
    });
  };

  const playCard = async (cardId) => {
    await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play-card', game_id: gameId, player_id: myPlayer.id, data: { card_id: cardId } })
    });
  };

  // 4. Computed State
  const isMyTurn = useMemo(() => {
    if (!gameState || !players.length) return false;
    return players[gameState.turn_index]?.user_id === user.id;
  }, [gameState, players, user.id]);

  // 1 card round logic: players see OTHERS cards but not their own
  const isBlindRound = gameState?.current_round === 1;

  // Renderers
  if (!user.name && view === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[grid]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass p-8 rounded-2xl w-full max-w-md">
            <h1 className="text-4xl font-black mb-2 text-center bg-gradient-to-r from-game-accent to-game-gold bg-clip-text text-transparent">5 VIDAS</h1>
            <p className="text-slate-400 text-center mb-8">El juego de bazas y traición</p>
            <div className="space-y-4">
                <input 
                    type="text" 
                    placeholder="Tu apodo..." 
                    className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-3 outline-none focus:border-game-accent transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && saveUser(e.target.value)}
                    onBlur={(e) => saveUser(e.target.value)}
                />
                <button onClick={() => user.name && setView('lobby')} className="btn-primary w-full">Entrar</button>
            </div>
        </motion.div>
      </div>
    );
  }

  if (view === 'lobby') {
    return (
      <div className="min-h-screen p-8 max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
            <div>
                <h1 className="text-3xl font-black italic">5 VIDAS</h1>
                <p className="opacity-50">Hola, {user.name} 👋</p>
            </div>
            <button onClick={createGame} disabled={loading} className="btn-primary flex items-center gap-2">
                <Plus size={20} /> Crear Partida
            </button>
        </header>

        <section className="grid gap-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Send size={18} /> O únete a una:</h2>
            <div className="grid gap-3">
                <ActiveGames onJoin={joinGame} />
            </div>
        </section>
      </div>
    );
  }

  // GAME VIEW
  return (
    <div className="min-h-screen flex flex-col bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-900 via-game-dark to-black">
      {/* HUD Header */}
      <nav className="p-4 glass sticky top-0 z-50 flex justify-between items-center">
         <div className="flex gap-4">
            {players.map(p => (
                <div key={p.id} className={cn("p-2 rounded-lg transition-all", p.id === players[gameState?.turn_index]?.id ? "bg-game-accent/20 ring-1 ring-game-accent" : "bg-black/20")}>
                    <div className="text-xs font-bold truncate w-20">{p.name} {p.user_id === user.id && '(Tú)'}</div>
                    <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                            <Heart key={i} size={10} fill={i < p.lives ? "#ef4444" : "none"} className={i < p.lives ? "text-danger" : "text-slate-600"} />
                        ))}
                    </div>
                </div>
            ))}
         </div>
         <div className="text-right">
            <div className="text-sm font-bold opacity-50">Ronda de:</div>
            <div className="text-2xl font-black">{gameState?.current_round} cartas</div>
         </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center gap-8 p-4">
        {/* Table Area */}
        <div className="relative w-full max-w-2xl h-64 bg-black/10 rounded-[100px] border border-white/5 flex items-center justify-center">
            <AnimatePresence>
                {tableCards.map((c, i) => (
                    <motion.div 
                        key={c.id} 
                        initial={{ y: 100, opacity: 0, rotate: i * 10 }}
                        animate={{ y: 0, opacity: 1, x: (i - (tableCards.length-1)/2) * 40 }}
                        className="absolute"
                    >
                        <Card suit={c.suit} value={c.value} className="w-24 h-36" />
                        <div className="text-[10px] text-center mt-1 font-bold opacity-50">{players.find(p => p.id === c.player_id)?.name}</div>
                    </motion.div>
                ))}
            </AnimatePresence>
            {tableCards.length === 0 && (
                <div className="text-slate-600 font-medium italic select-none">La mesa espera...</div>
            )}
        </div>

        {/* Action HUD */}
        <AnimatePresence mode="wait">
            {gameState?.status === 'waiting' && myPlayer?.order_index === 0 && (
                <motion.button 
                    initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                    onClick={startGame} className="btn-primary text-xl px-12 py-4"
                >
                    Repartir y Empezar
                </motion.button>
            )}

            {gameState?.status === 'bidding' && isMyTurn && (
                <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="glass p-6 rounded-2xl">
                    <h3 className="text-center font-bold mb-4">¿Cuántas bazas ganarás?</h3>
                    <div className="flex gap-2">
                        {[...Array(gameState.current_round + 1)].map((_, i) => (
                            <button 
                                key={i} onClick={() => placeBid(i)}
                                className="w-12 h-12 rounded-lg bg-game-card hover:bg-game-accent text-xl font-black transition-colors"
                            >
                                {i}
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Score Board */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
            {players.map(p => (
                <div key={p.id} className="glass p-3 rounded-xl flex justify-between items-center">
                    <span className="text-xs font-medium">{p.name}</span>
                    <div className="flex gap-3">
                        <div className="text-center">
                            <div className="text-[10px] uppercase opacity-50">Apuesta</div>
                            <div className="font-black text-game-accent">{p.current_bid ?? '-'}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] uppercase opacity-50">Bazas</div>
                            <div className="font-black text-game-gold">{p.tricks_won}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </main>

      {/* Player Hand */}
      <footer className="p-8 pb-12 flex justify-center items-center gap-4 relative">
         <div className="flex gap-2 isolate">
            {myCards.map((c, i) => (
                <Card 
                    key={c.id} 
                    suit={c.suit} 
                    value={c.value} 
                    disabled={!isMyTurn || gameState.status !== 'playing'}
                    isBlind={isBlindRound}
                    onClick={() => playCard(c.id)}
                    className="hover:-translate-y-8"
                />
            ))}
         </div>
      </footer>
    </div>
  );
}

function ActiveGames({ onJoin }) {
    const [games, setGames] = useState([]);
    useEffect(() => {
        const fetchGames = async () => {
            const { data } = await supabase.from('games').select('*').eq('status', 'waiting').order('created_at', { ascending: false });
            setGames(data || []);
        };
        fetchGames();
        const sub = supabase.channel('lobby').on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, fetchGames).subscribe();
        return () => supabase.removeChannel(sub);
    }, []);

    return games.map(g => (
        <button key={g.id} onClick={() => onJoin(g.id)} className="glass p-4 rounded-xl flex justify-between items-center hover:bg-white/20 transition-all text-left">
            <div>
                <div className="font-bold">Mesa {g.id.slice(0,4)}</div>
                <div className="text-xs opacity-50">En espera...</div>
            </div>
            <LogIn className="text-game-accent" />
        </button>
    ));
}
