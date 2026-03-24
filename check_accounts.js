// Quick script to list all registered accounts
// Run: node check_accounts.js

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env manually (no dotenv dependency needed)
const envFile = readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) env[key.trim()] = val.join('=').trim();
});

const supabase = createClient(
  env.SUPABASE_URL || env.VITE_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function listAccounts() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }

  const { data: profiles } = await supabase.from('profiles').select('*');
  
  console.log('\n========================================');
  console.log('   CUENTAS REGISTRADAS EN 5 VIDAS');
  console.log('========================================\n');
  
  const realUsers = users.filter(u => !u.is_anonymous);
  const guests = users.filter(u => u.is_anonymous);
  
  console.log(`📧 USUARIOS REGISTRADOS (${realUsers.length}):`);
  console.log('─'.repeat(50));
  realUsers.forEach((u, i) => {
    const prof = (profiles || []).find(p => p.id === u.id);
    console.log(`  ${i+1}. ${u.email}`);
    console.log(`     Nick: ${prof?.display_name || 'Sin nickname'}`);
    console.log(`     Creado: ${new Date(u.created_at).toLocaleString('es-ES')}`);
    console.log(`     Último login: ${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('es-ES') : 'Nunca'}`);
    console.log('');
  });
  
  if (guests.length > 0) {
    console.log(`\n👤 INVITADOS (${guests.length}):`);
    console.log('─'.repeat(50));
    guests.forEach((u, i) => {
      const prof = (profiles || []).find(p => p.id === u.id);
      console.log(`  ${i+1}. ${prof?.display_name || u.user_metadata?.display_name || 'Invitado'} — ${new Date(u.created_at).toLocaleString('es-ES')}`);
    });
  }
  
  console.log(`\n📊 TOTAL: ${users.length} (${realUsers.length} registrados + ${guests.length} invitados)\n`);
}

listAccounts();
