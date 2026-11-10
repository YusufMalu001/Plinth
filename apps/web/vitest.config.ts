import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    testTimeout: 20000,
    maxWorkers: 2,
    include: ['tests/components/**/*.test.tsx', 'src/**/*.test.tsx', 'tests/features/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});

