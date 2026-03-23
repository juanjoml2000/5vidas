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
  const players = await getSortedPlayers(supabase, game_id)

  if (!game || players.length < 2) {
    throw new Error('Game not found or not enough players')
  }

  const suits = ['oros', 'copas', 'espadas', 'bastos']
  const values = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
  let deck = []
  suits.forEach(suit => values.forEach(value => deck.push({ suit, value })))
  deck = deck.sort(() => Math.random() - 0.5)

  const numCards = game.current_round
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
  await supabase.from('games').update({ status: 'bidding', turn_index: 0 }).eq('id', game_id)
  await supabase.from('players').update({ current_bid: null, tricks_won: 0 }).eq('game_id', game_id)
}

async function placeBid(supabase, game_id, player_id, bid) {
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
    const players = await getSortedPlayers(supabase, game_id)
    
    if (players[game.turn_index].id !== player_id) throw new Error('Not your turn')

    const currentIndex = players.findIndex(p => p.id === player_id)

    if (currentIndex === players.length - 1) {
        const totalOtherBids = players.reduce((sum, p) => p.id !== player_id ? sum + (p.current_bid || 0) : sum, 0)
        if (totalOtherBids + bid === game.current_round) {
          if (players[currentIndex].name.startsWith('Bot')) {
            bid = (bid === 0) ? 1 : bid - 1
          } else {
            throw new Error(`Invalid bid: total bids cannot equal ${game.current_round}`)
          }
        }
    }

    await supabase.from('players').update({ current_bid: bid }).eq('id', player_id)

    if (currentIndex === players.length - 1) {
        await supabase.from('games').update({ status: 'playing', turn_index: 0 }).eq('id', game_id)
    } else {
        await supabase.from('games').update({ turn_index: currentIndex + 1 }).eq('id', game_id)
    }
}

async function playCard(supabase, game_id, player_id, card_id) {
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
    const players = await getSortedPlayers(supabase, game_id)
    
    if (players[game.turn_index].id !== player_id) throw new Error('Not your turn')

    const currentIndex = players.findIndex(p => p.id === player_id)

    await supabase.from('cards').update({ is_played: true, played_at: new Date() }).eq('id', card_id)

    const { data: playedCards } = await supabase.from('cards').select('*').eq('game_id', game_id).eq('is_played', true).is('trick_id', null)

    if (playedCards.length === players.length) {
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

    if (alivePlayers.length <= 1 || game.current_round === 1) {
        const winner = alivePlayers.length === 1 ? alivePlayers[0].id : (alivePlayers.length > 1 ? alivePlayers.sort((a,b) => b.lives - a.lives)[0].id : null);
        await supabase.from('games').update({ status: 'ended', winner_id: winner }).eq('id', game_id)
    } else {
        await supabase.from('games').update({ 
            status: 'waiting', 
            current_round: game.current_round - 1,
            turn_index: 0
        }).eq('id', game_id)
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
        created_at: new Date()
    });
}

async function processBotTurns(supabase, game_id) {
    let loop = true
    let safetyCounter = 0
    while (loop && safetyCounter < 10) {
        safetyCounter++
        const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
        if (!game || game.status === 'ended' || game.status === 'waiting') break
        
        const players = await getSortedPlayers(supabase, game_id)
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
