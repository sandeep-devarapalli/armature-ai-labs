export const courseOrigin = 'https://courses.armatureailabs.com';
export const backendOrigin = 'https://uxfhdfagrmaeyuaipaar.supabase.co';

export function assertCourseProduction(env) {
  if (env.VITE_COURSES_SITE_URL !== courseOrigin) throw new Error('Course production origin must be ' + courseOrigin);
  if (env.VITE_COURSES_SUPABASE_URL !== backendOrigin) throw new Error('Course production must use the existing Armature Supabase project.');
  if (env.VITE_COURSES_LOCAL_PASSWORD === 'true' || env.VITE_DEMO_MODE === 'true') throw new Error('Production cannot enable test authentication or demo access.');
  const key = env.VITE_COURSES_SUPABASE_PUBLISHABLE_KEY || '';
  if (key.startsWith('sb_publishable_') && key.length > 25) return;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (key.split('.').length === 3 && payload.role === 'anon' && payload.ref === 'uxfhdfagrmaeyuaipaar' && payload.exp > Date.now() / 1000) return;
  } catch { /* Reject malformed and privileged keys without logging them. */ }
  throw new Error('Production requires an Armature publishable key or unexpired anon key.');
}

export function courseHostingAssets(backend) {
  const origin = new URL(backend).origin;
  return {
    '_headers': `/*
  Cache-Control: private, no-store, no-transform
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://media.armatureailabs.com; font-src 'self' data:; connect-src 'self' ${origin}; frame-src https://armatureailabs.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
`,
    'robots.txt': 'User-agent: *\nDisallow: /\n',
    '404.html': '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not found · Armature AI Labs</title><main><h1>Page not found</h1><p><a href="/">Return to Armature courses</a></p></main></html>\n',
  };
}
