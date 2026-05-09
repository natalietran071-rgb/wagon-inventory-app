import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createUser() {
  console.log('Attempting to create user...');
  const { data, error } = await supabase.auth.signUp({
    email: 'admin@hubalpha.com',
    password: 'password123123',
  });

  if (error) {
    console.error('Error creating user:', error.message);
  } else {
    console.log('User created successfully:', data.user?.email);
  }
}

createUser();
