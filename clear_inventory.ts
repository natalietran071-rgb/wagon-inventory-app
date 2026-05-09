import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearInventory() {
  console.log('Clearing inventory...');
  const { error } = await supabase.from('inventory').delete().neq('erp', 'THIS_WILL_NEVER_EXIST_123');
  
  if (error) {
    console.error('Error clearing inventory:', error);
  } else {
    console.log('Successfully cleared inventory table.');
  }
  process.exit();
}

clearInventory();
