/**
 * @author eLeet Coderz (Team 3)
 * @description Tells TypeScript about Vite's import.meta.env variables (optional VITE_API_URL).
 * @traces SE-NFR-04
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
