import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],cacheDir:'.cache/course-tests',test:{environment:'jsdom',setupFiles:['./tests/frontend/setup.ts'],globals:true,include:['tests/frontend/*course*.test.tsx']}});
