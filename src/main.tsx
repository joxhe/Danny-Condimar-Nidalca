import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

/**
 * El vendedor trabaja en ruta, con señal intermitente. La configuracion
 * apunta a eso: reintentar con paciencia, no refrescar al volver a la pestaña
 * (gastaria datos sin necesidad) y servir lo cacheado mientras revalida.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (intento) => Math.min(1000 * 2 ** intento, 10_000),
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
    mutations: { retry: 1 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
