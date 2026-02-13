type ImportMetaEnv = {
  readonly VITE_API_URL: string;
  readonly VITE_ENV?: string;
};

declare global {
  interface ImportMeta {
    readonly environment: ImportMetaEnv;
  }
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const ENV = import.meta.env.VITE_ENV ?? import.meta.env.MODE;

export default {
  API_BASE_URL,
  ENV,
};
