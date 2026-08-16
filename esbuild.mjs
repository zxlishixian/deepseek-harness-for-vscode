import * as esbuild from 'esbuild'
import { rm } from 'node:fs/promises'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

if (production) {
  await Promise.all([
    rm('dist/extension.cjs.map', { force: true }),
    rm('dist/webview/chat.js.map', { force: true }),
  ])
}

const contexts = await Promise.all([
  esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node24',
    outfile: 'dist/extension.cjs',
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'info',
  }),
  esbuild.context({
    entryPoints: ['media/chat.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    outfile: 'dist/webview/chat.js',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'info',
  }),
])

if (watch) {
  await Promise.all(contexts.map((context) => context.watch()))
} else {
  await Promise.all(contexts.map((context) => context.rebuild()))
  await Promise.all(contexts.map((context) => context.dispose()))
}
