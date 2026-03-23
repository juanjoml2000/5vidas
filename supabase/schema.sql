-- 5 Vidas Game Schema

-- 1. Tables

-- Games table: current status of each game
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('waiting', 'bidding', 'playing', 'ended')),
  current_round INTEGER DEFAULT 5, -- 5, 4, 3, 2, 1
  turn_index INTEGER DEFAULT 0,
  dealer_id UUID, -- Who deals this round
  winner_id UUID,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  host_id UUID, -- The user who created the room
  name TEXT -- Custom room name
);

-- Players table: participants in each game
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID, -- For authentication (optional, can use session IDs)
  name TEXT NOT NULL,
  lives INTEGER DEFAULT 5,
  current_bid INTEGER,
  tricks_won INTEGER DEFAULT 0,
  order_index INTEGER, -- Turn order
  is_ready BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, order_index)
);

-- Hands table: cards currently held by players or played
-- We use a single table for simplicity, but could split
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  suit TEXT NOT NULL, -- e.g., 'oros', 'copas', 'espadas', 'bastos'
  value INTEGER NOT NULL, -- 1, 2, 3, 4, 5, 6, 7, 10, 11, 12
  is_played BOOLEAN DEFAULT FALSE,
  played_at TIMESTAMP WITH TIME ZONE,
  trick_id UUID -- Track which trick it belongs to
);

-- Tricks table: to track history of plays in the current round
CREATE TABLE tricks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER,
  trick_number INTEGER,
  winner_id UUID REFERENCES players(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Realtime Enablement
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE cards;
ALTER PUBLICATION supabase_realtime ADD TABLE tricks;

-- 3. Row Level Security (RLS)
-- For a game, we want everyone to be able to read, but only authorized users to write
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tricks ENABLE ROW LEVEL SECURITY;

-- Allow public read for now (as requested for simplicity/multiplayer)
CREATE POLICY "Public Read" ON games FOR SELECT USING (true);
CREATE POLICY "Public Write" ON games FOR ALL USING (true);
CREATE POLICY "Public Read" ON players FOR SELECT USING (true);
CREATE POLICY "Public Write" ON players FOR ALL USING (true);
CREATE POLICY "Public Read" ON cards FOR SELECT USING (true);
CREATE POLICY "Public Write" ON cards FOR ALL USING (true);
CREATE POLICY "Public Read" ON tricks FOR SELECT USING (true);
CREATE POLICY "Public Write" ON tricks FOR ALL USING (true);

-- Functions
-- Function to handle deck creation and dealing
-- (To be called from the server/edge function)
