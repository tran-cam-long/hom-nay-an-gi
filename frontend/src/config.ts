type ImportMetaEnv = {
  readonly VITE_API_URL: string;
  readonly VITE_ENV?: string;
};

declare global {
  interface ImportMeta {
    readonly environment: ImportMetaEnv;
  }
}

export const API_URL = import.meta.environment.VITE_API_URL;
export const ENV = import.meta.environment.VITE_ENV ?? 'local';

export default {
  API_URL,
  ENV,
};
