/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  server: {
    /*
     * Puerto propio del proyecto.
     *
     * El 5173 es el que Vite usa por defecto, asi que lo comparten todos los
     * proyectos de la maquina: el localStorage, el IndexedDB y sobre todo los
     * service workers de uno se le aparecen al otro, porque para el navegador
     * es el mismo origen.
     */
    port: 5180,
    // Si el 5180 esta ocupado, falla en vez de saltar a otro puerto en silencio.
    strictPort: true,
    open: true,
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
