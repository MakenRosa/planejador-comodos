import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { casaSync } from './tools/casa-sync'

export default defineConfig({
  // BASE_PATH: publicação num subcaminho (GitHub Pages: /planejador-comodos/)
  base: process.env.BASE_PATH || '/',
  // casaSync: o projeto aberto no navegador é gravado na pasta casa/ (fora do repositório do app)
  plugins: [react(), casaSync()],
  // Evita que caminhos virtualizados (pasta AppData de apps empacotados) sejam trocados pelo realpath
  resolve: { preserveSymlinks: true },
  server: { port: 5173 },
  // three.js sozinho passa de 500 kB; o app é carregado de uma vez de propósito
  build: { chunkSizeWarningLimit: 1600 },
})
