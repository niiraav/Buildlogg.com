import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('Missing env vars. URL:', url, 'Key length:', key?.length);
  process.exit(1);
}

const sb = createClient(url, key);

const { data, error } = await sb
  .from('booking_requests')
  .select('id,client_name,status,requested_date,requested_time,merchant_id')
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.log('Error:', error.message);
} else {
  console.log('Found', data.length, 'booking requests:');
  for (const b of data) {
    console.log(`  ${b.client_name} - ${b.status} - ${b.requested_date} at ${b.requested_time} (merchant: ${b.merchant_id?.substring(0, 8)}...)`);
  }
}
