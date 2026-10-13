/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute API origin baked into a packaged (Capacitor) build, e.g.
   * "http://192.168.1.20:4000". Left empty for the regular web build, which
   * talks to the same origin it was served from.
   */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
