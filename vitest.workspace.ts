import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // Frontend tests (jsdom)
  {
    test: {
      name: 'web',
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
  // Shared library tests (node)
  {
    test: {
      name: 'shared',
      globals: true,
      environment: 'node',
      include: ['packages/shared/src/**/*.test.ts'],
    },
  },
  // Server API tests (node) — forks isolate process.env and module singletons
  {
    test: {
      name: 'server',
      globals: true,
      environment: 'node',
      include: ['packages/server/src/__tests__/*.test.ts'],
      testTimeout: 15000,
      pool: 'forks',
      poolOptions: {
        forks: { singleFork: true },
      },
    },
  },
  // MCP package tests (node)
  {
    test: {
      name: 'mcp',
      globals: true,
      environment: 'node',
      include: ['packages/mcp/src/__tests__/*.test.ts'],
    },
  },
])
