type ImportMetaEnv = {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_ENV?: string;
  readonly VITE_MULTIPLAYER_DEBUG?: string;
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
export const MULTIPLAYER_DEBUG = import.meta.env.VITE_MULTIPLAYER_DEBUG === "true";

function getBrowserOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

function isAbsoluteUrl(value: string): boolean {
  return /^(https?:|wss?:)\/\//i.test(value);
}

function resolveWsUrl(): string {
  const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (configuredWsUrl) {
    if (isAbsoluteUrl(configuredWsUrl)) {
      return configuredWsUrl;
    }

    return new URL(configuredWsUrl, getBrowserOrigin()).origin;
  }

  if (isAbsoluteUrl(API_BASE_URL)) {
    return new URL(API_BASE_URL).origin;
  }

  return getBrowserOrigin();
}

export const WS_URL = resolveWsUrl();

export default {
  API_BASE_URL,
  ENV,
  MULTIPLAYER_DEBUG,
  WS_URL,
};
