type ImportMetaEnv = {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_ENV?: string;
  readonly VITE_WS_URL?: string;
};

declare global {
  interface ImportMeta {
    readonly environment: ImportMetaEnv;
  }
}

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_API_URL ??
  "/api";
export const ENV = import.meta.env.VITE_ENV ?? import.meta.env.MODE;
export const WS_URL = import.meta.env.VITE_WS_URL ?? API_BASE_URL;

export default {
  API_BASE_URL,
  ENV,
  WS_URL,
};
