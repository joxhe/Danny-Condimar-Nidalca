/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del Apps Script. Ver .env.example. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Vite convierte `import x from './a.png?inline'` en un data URI. */
declare module '*.png?inline' {
  const dataUri: string;
  export default dataUri;
}
