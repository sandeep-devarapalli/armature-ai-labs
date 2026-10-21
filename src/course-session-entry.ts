import { createClient } from '@supabase/supabase-js';
import { installCourseSessionBridge } from './lib/courseSessionBridge';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (window.location.origin === 'https://armatureailabs.com' && window.parent !== window &&
    url === 'https://uxfhdfagrmaeyuaipaar.supabase.co' && key && import.meta.env.VITE_DEMO_MODE !== 'true') {
  installCourseSessionBridge(createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
  }));
}
