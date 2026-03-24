import { createClient } from '@supabase/supabase-js'

// This function will be deployed as a Vercel Serverless Function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, game_id, player_id, data } = req.body
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for admin tasks
  )

  try {
    switch (action) {
      case 'start-round':
        await startRound(supabase, game_id)
        await processBotTurns(supabase, game_id)
        return res.status(200).json({ success: true })
      case 'play-card':
        await playCard(supabase, game_id, player_id, data.card_id)
        await processBotTurns(supabase, game_id)
        return res.status(200).json({ success: true })
      case 'place-bid':
        await placeBid(supabase, game_id, player_id, data.bid)
        await processBotTurns(supabase, game_id)
        return res.status(200).json({ success: true })
      case 'add-bot':
        await addBot(supabase, game_id)
        return res.status(200).json({ success: true })
      case 'heartbeat':
         await supabase.from('players').update({ last_ping: new Date() }).eq('id', player_id)
         return res.status(200).json({ success: true })
      case 'kick-player': {
         const { data: g } = await supabase.from('games').select('host_id').eq('id', game_id).single();
         const { data: p } = await supabase.from('players').select('user_id').eq('id', player_id).single();
         
         if (!g) return res.status(404).json({ error: 'Mesa no encontrada' });
         if (!p) return res.status(404).json({ error: 'Sesión de host inválida' });
         
         if (g.host_id !== p.user_id) {
            return res.status(403).json({ error: 'No autorizado: Solo el anfitrión puede expulsar' });
         }
         
         // Delete related records first to avoid FK constraint errors
         await supabase.from('tricks').delete().eq('winner_id', data.target_id);
         await supabase.from('cards').delete().eq('player_id', data.target_id);
         await supabase.from('messages').delete().eq('player_id', data.target_id);
         
         const { error: delError } = await supabase.from('players').delete().eq('id', data.target_id);
         if (delError) return res.status(500).json({ error: delError.message });
         
         return res.status(200).json({ success: true })
      }
      case 'get-other-cards':
         const { data: others } = await supabase.from('cards').select('*, player:players(name)').eq('game_id', game_id).neq('player_id', player_id)
         return res.status(200).json({ cards: others })
      case 'cleanup':
         const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
         const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
         
         // 1. Delete dead players (>10 mins)
         await supabase.from('players').delete().lt('last_ping', tenMinsAgo);
         
         // 2. Delete old games (>24 hours) cascade-style (assuming RLS/Foreign Keys handles it if not, manually)
         await supabase.from('games').delete().lt('created_at', oneDayAgo);

         // 3. Delete empty waiting games
         const { data: allWaiting } = await supabase.from('games').select('id, players(id)').eq('status', 'waiting');
         const toDelete = (allWaiting || []).filter(g => !g.players || g.players.length === 0).map(g => g.id);
         if (toDelete.length > 0) {
            await supabase.from('games').delete().in('id', toDelete);
         }
         return res.status(200).json({ success: true, purged: toDelete.length })
      default:
        return res.status(400).json({ error: 'Invalid action' })
    }
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error.message })
  }
}

async function getSortedPlayers(supabase, game_id) {
  const { data: players } = await supabase.from('players')
    .select('*')
    .eq('game_id', game_id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }); // Fallback sorting
  return players || [];
}

async function startRound(supabase, game_id) {
  const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
  const players = (await getSortedPlayers(supabase, game_id)).filter(p => p.lives > 0)

  if (!game || players.length < 2) {
    throw new Error('Game not found or not enough players')
  }

  // DYNAMIC ROUND SCALING: Adjust start round to fit players in the 40-card deck
  let numCards = game.current_round;
  if (game.status === 'waiting') {
    numCards = Math.min(5, Math.floor(40 / players.length));
  }

  const suits = ['oros', 'copas', 'espadas', 'bastos']
  const values = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
  let deck = []
  suits.forEach(suit => values.forEach(value => deck.push({ suit, value })))
  deck = deck.sort(() => Math.random() - 0.5)

  let deckIdx = 0
  const dealtCards = []
  for (const player of players) {
    for (let i = 0; i < numCards; i++) {
        dealtCards.push({
            game_id,
            player_id: player.id,
            suit: deck[deckIdx].suit,
            value: deck[deckIdx].value
        })
        deckIdx++
    }
  }

  await supabase.from('cards').delete().eq('game_id', game_id)
  await supabase.from('cards').insert(dealtCards)
  
  const startIndex = Math.floor(Math.random() * players.length)
  await supabase.from('games').update({ 
    status: 'bidding', 
    current_round: numCards,
    turn_index: startIndex 
  }).eq('id', game_id)
  
  await supabase.from('players').update({ current_bid: null, tricks_won: 0 }).eq('game_id', game_id)
}

async function placeBid(supabase, game_id, player_id, bid) {
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
    const players = (await getSortedPlayers(supabase, game_id)).filter(p => p.lives > 0);
    
    if (players[game.turn_index].id !== player_id) throw new Error('Not your turn')

    const currentIndex = players.findIndex(p => p.id === player_id)

    const numBids = players.filter(p => p.current_bid !== null).length
    const isLastBidder = numBids === players.length - 1

    if (isLastBidder && game.current_round > 1) { // Rule disabled in round 1
        const totalOtherBids = players.reduce((sum, p) => p.id !== player_id ? sum + (p.current_bid || 0) : sum, 0)
        if (totalOtherBids + bid === game.current_round) {
          if (players[currentIndex].name.startsWith('Bot')) {
            bid = (bid === 0) ? 1 : bid - 1
          } else {
            throw new Error(`¡Regla del último! La suma no puede ser ${game.current_round}`)
          }
        }
    }

    await supabase.from('players').update({ current_bid: bid }).eq('id', player_id)

    await supabase.from('players').update({ current_bid: bid }).eq('id', player_id)

    const nextIndex = (currentIndex + 1) % players.length
    if (numBids + 1 === players.length) {
        // All have bid, start playing from the same person who started bidding
        // The current turn_index was the starter of bidding when status was updated to 'bidding'
        // But we need to find who was the FIRST to bid this round. 
        // We can find it by checking who HAS current_bid but is NOT the nextIndex? No.
        // Let's just keep the turn_index moving circularly. The person who started bidding
        // will be the one whose turn it is after the last person bids.
        await supabase.from('games').update({ status: 'playing', turn_index: nextIndex }).eq('id', game_id)
    } else {
        await supabase.from('games').update({ turn_index: nextIndex }).eq('id', game_id)
    }
}

async function playCard(supabase, game_id, player_id, card_id) {
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
    const players = (await getSortedPlayers(supabase, game_id)).filter(p => p.lives > 0);
    
    if (players[game.turn_index].id !== player_id) throw new Error('Not your turn')

    const currentIndex = players.findIndex(p => p.id === player_id)

    await supabase.from('cards').update({ is_played: true, played_at: new Date() }).eq('id', card_id)

    const { data: playedCards } = await supabase.from('cards').select('*').eq('game_id', game_id).eq('is_played', true).is('trick_id', null)

    if (playedCards.length === players.length) {
        // Wait 1.5s so the frontend can show the last card before resolving
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const winnerCard = playedCards.reduce((prev, curr) => (curr.value > prev.value ? curr : prev))
        const winnerId = winnerCard.player_id

        const { data: trick } = await supabase.from('tricks').insert({
            game_id, winner_id: winnerId, round_number: game.current_round
        }).select().single()

        await supabase.from('cards').update({ trick_id: trick.id }).in('id', playedCards.map(c => c.id))

        const { data: winnerPlayer } = await supabase.from('players').select('tricks_won').eq('id', winnerId).single()
        await supabase.from('players').update({ tricks_won: (winnerPlayer.tricks_won || 0) + 1 }).eq('id', winnerId)

        const { count: remainingCards } = await supabase.from('cards').select('*', { count: 'exact', head: true }).eq('game_id', game_id).eq('is_played', false)

        if (remainingCards === 0) {
            await resolveRound(supabase, game_id)
        } else {
            await supabase.from('games').update({ turn_index: players.findIndex(p => p.id === winnerId) }).eq('id', game_id)
        }
    } else {
        const nextIndex = (currentIndex + 1) % players.length
        await supabase.from('games').update({ turn_index: nextIndex }).eq('id', game_id)
    }
}

async function resolveRound(supabase, game_id) {
    const players = await getSortedPlayers(supabase, game_id)
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()

    const playerUpdates = players.map(p => {
        const diff = Math.abs((p.current_bid || 0) - (p.tricks_won || 0))
        const newLives = Math.max(0, (p.lives || 5) - diff)
        return supabase.from('players').update({ lives: newLives }).eq('id', p.id)
    })
    await Promise.all(playerUpdates)

    const updatedPlayers = await getSortedPlayers(supabase, game_id)
    const alivePlayers = updatedPlayers.filter(p => p.lives > 0)

    if (alivePlayers.length <= 1) {
        const winner = alivePlayers.length === 1 ? alivePlayers[0].id : (alivePlayers.length > 1 ? alivePlayers.sort((a,b) => b.lives - a.lives)[0].id : null);
        await supabase.from('games').update({ status: 'ended', winner_id: winner }).eq('id', game_id)
    } else {
        // Loop: If it was round 1, next is 5.
        const nextRound = game.current_round === 1 ? 5 : (game.current_round - 1);
        await supabase.from('games').update({ 
            status: 'waiting', 
            current_round: nextRound,
            turn_index: 0
        }).eq('id', game_id);
        
        // Short delay to allow clients to see results before dealing? 
        // User wants it direct, so let's just do it.
        await startRound(supabase, game_id);
    }
}

async function addBot(supabase, game_id) {
    const players = await getSortedPlayers(supabase, game_id)
    const botId = `00000000-0000-0000-0000-${Math.floor(Math.random() * 1000000000000).toString(16).padStart(12, '0')}`;
    await supabase.from('players').insert({
        game_id,
        user_id: botId,
        name: `Bot ${players.length + 1}`,
        lives: 5,
        created_at: new Date(),
        last_ping: new Date() 
    });
}

async function processBotTurns(supabase, game_id) {
    let loop = true
    let safetyCounter = 0
    while (loop && safetyCounter < 10) {
        safetyCounter++
        const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
        // If it's bidding or playing, bots act. 
        if (!game || game.status === 'ended' || game.status === 'waiting') break
        
        const players = (await getSortedPlayers(supabase, game_id)).filter(p => p.lives > 0);
        const currentPlayer = players[game.turn_index]
        
        if (!currentPlayer || !currentPlayer.name.startsWith('Bot')) {
            loop = false
            break
        }

        if (game.status === 'bidding') {
            const randomBid = Math.floor(Math.random() * (game.current_round + 1))
            await placeBid(supabase, game_id, currentPlayer.id, randomBid)
        } else if (game.status === 'playing') {
            const { data: botCards } = await supabase.from('cards').select('*').eq('player_id', currentPlayer.id).eq('is_played', false).limit(1)
            if (botCards && botCards.length > 0) {
                await playCard(supabase, game_id, currentPlayer.id, botCards[0].id)
            } else {
                loop = false
            }
        }
    }
}
