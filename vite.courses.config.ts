import { assertCourseProduction, courseHostingAssets } from './scripts/courses/release-config.mjs';
import { defineConfig, loadEnv } from 'vite';
import { resolveLessonDiagrams, type DiagramMap } from './scripts/courses/resolve-diagrams.mjs';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const courseIds = new Set(['computation-structures', 'maths-ai', 'embedded-firmware', 'intro-to-robotics', 'robot-actuators', 'pic-microcontrollers', 'manual-lathe', 'manual-milling', 'ai-in-robotics']);
const generated = path.resolve(process.env.COURSES_PREVIEW_PACKAGE || 'course-generated');

export default defineConfig(({ command, mode }) => {
  const production = mode === 'courses-production';
  const member = mode === 'member' || production;
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (production) assertCourseProduction(env);
  if (member && (!env.VITE_COURSES_SUPABASE_URL || !env.VITE_COURSES_SUPABASE_PUBLISHABLE_KEY)) throw new Error('Configure the course Supabase URL and publishable key before running member mode.');
  if (member) {
    const backend = new URL(env.VITE_COURSES_SUPABASE_URL);
    if (backend.protocol !== 'https:' && !(backend.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname))) throw new Error('Course backend must use HTTPS or loopback HTTP.');
    const key = env.VITE_COURSES_SUPABASE_PUBLISHABLE_KEY;
    if (key.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a secret key.');
    if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error('Use the anon JWT key, never a privileged key.');
  }
  return ({
  envDir: process.cwd(),
  cacheDir: '.cache/courses-vite',
  root: 'course-app',
  publicDir: false,
  plugins: [react(), {
    name: 'local-course-preview',
    async generateBundle() {
      if (!member) return;
      for (const [fileName, source] of Object.entries(courseHostingAssets(env.VITE_COURSES_SUPABASE_URL))) this.emitFile({ type: 'asset', fileName, source });
      for (const name of ['editable/lockup-light.svg', 'editable/lockup-dark.svg', 'fonts/SpaceMono-Regular.ttf', 'fonts/SpaceMono-Bold.ttf']) {
        this.emitFile({ type: 'asset', fileName: `brand/editorial-2026-09/${name}`, source: await readFile(path.resolve('public/brand/editorial-2026-09', name)) });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        if (url.pathname.startsWith('/__courses/')) {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          if (member || !local || req.method !== 'GET') { res.statusCode = 403; res.end('Local preview only'); return; }
          try {
            let data: unknown;
            if (url.pathname === '/__courses/catalog') {
              const catalog = JSON.parse(await readFile(path.join(generated, 'catalog.json'), 'utf8'));
              data = await Promise.all(catalog.map(async (course: { id: string }) => {
                if (!courseIds.has(course.id)) throw new Error('Unexpected course');
                const content = JSON.parse(await readFile(path.join(generated, 'courses', course.id, 'content.json'), 'utf8'));
                return { ...course, moduleCount: content.modules.length, lessonCount: content.modules.reduce((n: number, m: { subItems: string[] }) => n + m.subItems.length, 0) };
              }));
            } else {
              const id = url.pathname.slice('/__courses/content/'.length);
              if (!url.pathname.startsWith('/__courses/content/') || !courseIds.has(id)) { res.statusCode = 404; res.end('Not found'); return; }
              const content = JSON.parse(await readFile(path.join(generated, 'courses', id, 'content.json'), 'utf8'));
              const diagramMap = JSON.parse(await readFile(path.resolve(process.env.COURSES_PREVIEW_DIAGRAMS || 'output/courses-private-diagrams.json'), 'utf8')) as DiagramMap;
              const resolved = resolveLessonDiagrams(content, diagramMap, id);
              data = req.headers['x-course-preview-access'] === 'verified' ? resolved : { modules: resolved.modules.map((module: { subItems: string[]; lessonContent: Record<string, unknown> }, index: number) => ({ ...module, lessonContent: index === 0 ? Object.fromEntries(module.subItems.slice(0, ['pic-microcontrollers', 'manual-lathe', 'manual-milling'].includes(id) ? 2 : 1).map(title => [title, module.lessonContent[title]])) : {} })) };
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch { res.statusCode = 503; res.end('Prepare the selected course package first.'); }
          return;
        }
        if (url.pathname.startsWith('/brand/editorial-2026-09/')) {
          const relative = url.pathname.slice('/brand/editorial-2026-09/'.length);
          const allowed = ['editable/lockup-light.svg', 'editable/lockup-dark.svg', 'fonts/SpaceMono-Regular.ttf', 'fonts/SpaceMono-Bold.ttf'];
          if (!allowed.includes(relative)) { res.statusCode = 404; res.end(); return; }
          const mime = relative.endsWith('.svg') ? 'image/svg+xml' : 'font/ttf';
          res.setHeader('Content-Type', mime);
          res.end(await readFile(path.resolve('public/brand/editorial-2026-09', relative)));
          return;
        }
        next();
      });
    }
  }],
  server: {
    host: '127.0.0.1', port: member ? 4190 : 4189, strictPort: true,
    fs: { allow: [process.cwd()], deny: ['**/.env*', '**/.git/**', '**/private-assessments/**', '**/course-content/**', `${path.resolve('output')}/**`, '**/course-generated/courses/**', '**/course-generated/catalog.json', '**/course-generated/diagrams/**', `${generated}/**`] }
  },
  build: { outDir: member ? '../dist-courses-member' : '../dist-courses', emptyOutDir: true },
  define: { __COURSES_LOCAL_PREVIEW__: JSON.stringify(command === 'serve' && !member), __COURSES_MEMBER_APP__: JSON.stringify(member) }
});
});
