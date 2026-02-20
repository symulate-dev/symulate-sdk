import { defineConfig } from 'tsup';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local for local testing builds
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Production defaults (fallback if .env.local doesn't have values)
const TEST_PLATFORM_URL = 'http://localhost:3000';
const TEST_SUPABASE_URL = 'https://netmjvmgcqoganmubxrp.supabase.co';
const TEST_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldG1qdm1nY3FvZ2FubXVieHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MjIwMjYsImV4cCI6MjA3NzA5ODAyNn0.psJ-ZFAL5T0SJnjilIlmUZbrgZdDA9xIf-7W5Xw8KQk';

// Get environment variables with proper fallback to production defaults
const getPlatformUrl = () => process.env.SYMULATE_PLATFORM_URL || TEST_PLATFORM_URL;
const getSupabaseUrl = () => process.env.SYMULATE_SUPABASE_URL || TEST_SUPABASE_URL;
const getSupabaseAnonKey = () => process.env.SYMULATE_SUPABASE_ANON_KEY || TEST_SUPABASE_ANON_KEY;

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    'cli/index': 'src/cli/index.ts',
    auth: 'src/auth.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false, // Disable code splitting to avoid chunks
  treeshake: true, // Enable tree-shaking to remove unused imports
  platform: 'neutral', // Build for both Node.js and browser
  // Bundle specific internal modules
  noExternal: [
    /openaiProvider/,
  ],
  external: [
    // External dependencies
    /@faker-js/,
    // Node.js built-ins - mark as external so they're not bundled for browser
    'node:fs',
    'node:path',
    'node:url',
    'node:crypto',
    'node:module',
    'fs',
    'path',
    'url',
    'crypto',
    'os',
    'child_process',
    'util',
    'buffer',
    'readline',
    // External dependencies that may have Node.js dependencies
    /@supabase/,
    /commander/,
    /glob/,
    /open/,
    // Internal Node.js-only modules
    /\/persistence\/filePersistence$/,
    /\/auth$/,
    // Don't bundle tsx and esbuild - they need to be loaded from node_modules
    'tsx',
    'tsx/esm/api',
    'esbuild',
  ],
  // Replace environment variable references with actual values at build time
  define: {
    'process.env.SYMULATE_PLATFORM_URL': JSON.stringify(getPlatformUrl()),
    'process.env.SYMULATE_SUPABASE_URL': JSON.stringify(getSupabaseUrl()),
    'process.env.SYMULATE_SUPABASE_ANON_KEY': JSON.stringify(getSupabaseAnonKey()),
  },
});
