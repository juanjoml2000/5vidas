const { createClient } = require('@supabase/supabase-js');
// Fetching directly from env
const VITE_SUPABASE_URL = "https://kgeexoxmsylkypxeylsq.supabase.co"; 
const VITE_SUPABASE_ANON_KEY = "..."; // I'll get it from src/lib/supabase.js if I can't find it.

async function check() {
  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
  const { data: games } = await supabase.from('games').select('*, players(name, last_ping)').eq('status', 'waiting');
  console.log("WAITING GAMES:", (games || []).length);
  
  const now = new Date();
  (games || []).forEach(g => {
    const alive = (g.players || []).filter(p => {
       const pingDate = new Date(p.last_ping || 0);
       const diff = Math.abs(now - pingDate);
       return diff < 60000;
    });
    const hasHuman = alive.some(p => !p.name.startsWith('Bot'));
    console.log(`Game: ${g.name} | Players: ${g.players?.length} | Alive: ${alive.length} | HasHuman: ${hasHuman}`);
  });
}

check();
