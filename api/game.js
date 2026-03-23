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
        return await startRound(supabase, game_id, res)
      case 'play-card':
        return await playCard(supabase, game_id, player_id, data.card_id, res)
      case 'place-bid':
        return await placeBid(supabase, game_id, player_id, data.bid, res)
      case 'add-bot':
        return await addBot(supabase, game_id, res)
      default:
        return res.status(400).json({ error: 'Invalid action' })
    }
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error.message })
  }
}

async function startRound(supabase, game_id, res) {
  // 1. Get game and players
  const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
  const { data: players } = await supabase.from('players').select('*').eq('game_id', game_id).order('order_index')

  if (!game || players.length < 2) {
    throw new Error('Game not found or not enough players')
  }

  // 2. Prepare deck (Spanish 40 cards)
  const suits = ['oros', 'copas', 'espadas', 'bastos']
  const values = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
  let deck = []
  suits.forEach(suit => {
    values.forEach(value => {
      deck.push({ suit, value })
    })
  })

  // Shuffle
  deck = deck.sort(() => Math.random() - 0.5)

  // 3. Deal cards based on current round (5 -> 1)
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

  // Delete old cards and insert new ones
  await supabase.from('cards').delete().eq('game_id', game_id)
  await supabase.from('cards').insert(dealtCards)
  
  // Update game status to bidding
  await supabase.from('games').update({ status: 'bidding', turn_index: 0 }).eq('id', game_id)
  // Reset players bid and tricks
  await supabase.from('players').update({ current_bid: null, tricks_won: 0 }).eq('game_id', game_id)

  return res.status(200).json({ success: true })
}

async function placeBid(supabase, game_id, player_id, bid, res) {
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
    const { data: players } = await supabase.from('players').select('*').eq('game_id', game_id).order('order_index')
    
    const currentPlayer = players[game.turn_index]
    if (currentPlayer.id !== player_id) throw new Error('Not your turn')

    // Rule 3: Last bidder constraint
    const isLastBidder = game.turn_index === players.length - 1
    if (isLastBidder) {
        const totalPreviousBids = players.reduce((sum, p) => sum + (p.current_bid || 0), 0)
        if (totalPreviousBids + bid === game.current_round) {
            throw new Error(`Invalid bid: total bids cannot equal ${game.current_round}`)
        }
    }

    // Update player bid
    await supabase.from('players').update({ current_bid: bid }).eq('id', player_id)

    // Move to next turn or start playing
    if (game.turn_index === players.length - 1) {
        await supabase.from('games').update({ status: 'playing', turn_index: 0 }).eq('id', game_id)
    } else {
        await supabase.from('games').update({ turn_index: game.turn_index + 1 }).eq('id', game_id)
    }

    return res.status(200).json({ success: true })
}

async function playCard(supabase, game_id, player_id, card_id, res) {
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()
    const { data: players } = await supabase.from('players').select('*').eq('game_id', game_id).order('order_index')
    
    if (players[game.turn_index].id !== player_id) throw new Error('Not your turn')

    // Play card
    await supabase.from('cards').update({ is_played: true, played_at: new Date() }).eq('id', card_id)

    // Check if trick is full
    const { data: playedCards } = await supabase.from('cards')
        .select('*')
        .eq('game_id', game_id)
        .eq('is_played', true)
        .is('trick_id', null)

    if (playedCards.length === players.length) {
        // Evaluate trick winner
        // Rule 4: Hierarchy 1,2,..,7,10,11,12. "Mayor numero" wins.
        const winnerCard = playedCards.reduce((prev, curr) => (curr.value > prev.value ? curr : prev))
        const winnerId = winnerCard.player_id

        // Create trick record
        const { data: trick } = await supabase.from('tricks').insert({
            game_id,
            winner_id: winnerId,
            round_number: game.current_round
        }).select().single()

        // Link cards to trick
        await supabase.from('cards').update({ trick_id: trick.id }).in('id', playedCards.map(c => c.id))

        // Update tricks won
        const { data: winnerPlayer } = await supabase.from('players').select('tricks_won').eq('id', winnerId).single()
        await supabase.from('players').update({ tricks_won: (winnerPlayer.tricks_won || 0) + 1 }).eq('id', winnerId)

        // Set next turn to winner
        const winnerIndex = players.findIndex(p => p.id === winnerId)
        
        // Check if hand is over
        const { count: remainingCards } = await supabase.from('cards')
            .select('*', { count: 'exact', head: true })
            .eq('game_id', game_id)
            .eq('is_played', false)

        if (remainingCards === 0) {
            // End of round: Calculate lives
            await resolveRound(supabase, game_id, players)
        } else {
            await supabase.from('games').update({ turn_index: winnerIndex }).eq('id', game_id)
        }
    } else {
        // Next player
        await supabase.from('games').update({ turn_index: (game.turn_index + 1) % players.length }).eq('id', game_id)
    }

    return res.status(200).json({ success: true })
}

async function resolveRound(supabase, game_id, players) {
    const { data: updatedPlayers } = await supabase.from('players').select('*').eq('game_id', game_id)
    const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single()

    // Rule 5: Calculate lives based on abs difference
    const playerUpdates = updatedPlayers.map(p => {
        const diff = Math.abs(p.current_bid - p.tricks_won)
        const newLives = Math.max(0, p.lives - diff)
        return supabase.from('players').update({ lives: newLives }).eq('id', p.id)
    })

    await Promise.all(playerUpdates)

    // Check game over or next round
    const alivePlayers = updatedPlayers.filter(p => p.lives > 0)
    if (alivePlayers.length <= 1 || game.current_round === 1) {
        await supabase.from('games').update({ status: 'ended', winner_id: alivePlayers[0]?.id }).eq('id', game_id)
    } else {
        await supabase.from('games').update({ 
            status: 'waiting', 
            current_round: game.current_round - 1,
            turn_index: 0 
        }).eq('id', game_id)
    }
}

async function addBot(supabase, game_id, res) {
    const { data: players } = await supabase.from('players').select('*').eq('game_id', game_id);
    const botId = crypto.randomUUID();
    await supabase.from('players').insert({
        game_id,
        user_id: botId,
        name: `Bot ${players.length + 1}`,
        order_index: players.length,
        lives: 5
    });
    return res.status(200).json({ success: true });
}

// Simple AI logic could be triggered by a cron or manually for testing
async function handleBotTurn(supabase, game_id) {
    // This could be implemented to auto-play when it's a bot's turn
}
