import "reflect-metadata";

export { AppDataSource } from "./data-source.ts";
export * from "./enums.ts";
export * from "./entities/index.ts";
export * from "./eco/eco-catalogue.ts";

import { AppDataSource } from "./data-source.ts";

let initPromise: Promise<void> | null = null;

/**
 * Ensure AppDataSource is initialized exactly once.
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export function ensureDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) return Promise.resolve();
  if (!initPromise) {
    initPromise = AppDataSource.initialize().then(() => {
      console.log("[database] connected");
    });
  }
  return initPromise;
}
