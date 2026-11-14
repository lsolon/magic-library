import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Código de versão exibido no app: versão do package.json + commit + data do build.
// O commit muda a cada deploy (GitHub Actions fornece GITHUB_SHA), então cada
// atualização publicada tem um código diferente. Suba o "version" do package.json
// quando quiser marcar uma versão nova (ex.: 1.2.0).
function getBuildInfo() {
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
  let commit = (process.env.GITHUB_SHA || '').slice(0, 7);
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'dev';
    }
  }
  const date = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return { version: pkg.version as string, commit, date, label: `v${pkg.version} · ${commit} · ${date}` };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = env.VITE_BASE_PATH || '/';
  const build = getBuildInfo();
  // Build de demonstração: troca o Firebase por um banco/login de mentira (src/demo/*).
  // Build da escola (/escola/): demonstração com dados fictícios + painel do professor.
  const school = env.VITE_SCHOOL === 'true';
  const demo = env.VITE_DEMO === 'true' || school;
  const demoAlias = demo ? [
    { find: /^firebase\/firestore$/, replacement: path.resolve(__dirname, 'src/demo/fakeFirestore.ts') },
    { find: /^firebase\/auth$/, replacement: path.resolve(__dirname, 'src/demo/fakeAuth.ts') },
    { find: /^firebase\/app$/, replacement: path.resolve(__dirname, 'src/demo/fakeApp.ts') },
  ] : [];
  
  return {
    base: basePath,
    define: {
      __APP_VERSION__: JSON.stringify(build.label),
      __DEMO__: JSON.stringify(demo),
      __SCHOOL__: JSON.stringify(school),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        // Gera version.json no build, para conferir o que está no ar:
        // https://approutinetech.com.br/magic-library/version.json
        name: 'emit-version-json',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build, null, 2) });
        },
      },
    ],
    resolve: {
      alias: [
        ...demoAlias,
        { find: '@', replacement: path.resolve(__dirname, '.') },
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});