import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

const externalPackages = ['katex', 'react', 'react-dom', 'slate', 'slate-dom', 'slate-history', 'slate-react', 'lucide-react', 'prismjs', '@antv/x6', 'yjs', 'y-protocols', 'y-indexeddb']

export default defineConfig({
  plugins: [react(), dts({ include: ['src'], exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'] })],
  build: {
    lib: { entry: { index: 'src/index.ts', headless: 'src/headless.ts', codec: 'src/codec.ts', conversion: 'src/conversion/index.ts', yjs: 'src/yjs.ts', languages: 'src/languages.ts', katex: 'src/katex.ts' }, formats: ['es', 'cjs'], fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`, cssFileName: 'style' },
    rollupOptions: {
      external: id => id.startsWith('katex/') || !id.endsWith('.css') && (externalPackages.some(name => id === name || id.startsWith(`${name}/`)) || id.startsWith('@antv/x6-plugin-')),
    },
    cssCodeSplit: false,
  },
})
