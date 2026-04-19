
import { createClient } from '@supabase/supabase-js';

//MAIN DATABASE
//const supabaseUrl = 'https://xzjdatstzdaryfmxgmor.supabase.co';
//const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6amRhdHN0emRhcnlmbXhnbW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NDAsImV4cCI6MjA4MzgzNzU0MH0.goynHBdatbvbZQyP_MBLq8DGE8ZkDHEsXohEDfx6Q_Y'; 

//SECONDARY DATABASE
//const supabaseUrl = 'https://susjfezwcwzwqbqmqtgd.supabase.co';
//const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1c2pmZXp3Y3d6d3FicW1xdGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzODc1MjcsImV4cCI6MjA4NDk2MzUyN30.LLuc-kitZ_ac9rAsxguECo-U9jOp7v43a5BI15okOIU";



const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isPlaceholder = (val: string) => !val || val.includes('your-project') || val.includes('your-anon-key');

if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey)) {
  console.error("❌ Supabase credentials missing or using placeholders! The application will not be able to load data.");
  console.warn("Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly in your environment variables.");
} else {
  console.log("📡 Supabase client initialized with URL:", supabaseUrl.substring(0, 20) + "...");
}

// Create client only if URL is provided and not a placeholder to prevent crash
export const supabase = (!isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey)) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;
