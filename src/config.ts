import type { MockendConfig } from "./types";
import { NODE_ENV } from "./env";

let globalConfig: MockendConfig = {
  environment: NODE_ENV,
  cacheEnabled: true,
  generateMode: "auto", // Default: try AI first, fallback to Faker.js
};

// Quota tracking state
interface QuotaState {
  quotaExceeded: boolean;
  lastChecked: number;
  tokensRemaining?: number;
  tokensLimit?: number;
}

const quotaState: Map<string, QuotaState> = new Map();
const QUOTA_CHECK_INTERVAL = 60000; // Re-check quota every 60 seconds

export function configureSymulate(config: MockendConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

export function getConfig(): MockendConfig {
  return globalConfig;
}

export function isDevelopment(): boolean {
  return globalConfig.environment === "development";
}

export function isProduction(): boolean {
  return globalConfig.environment === "production";
}

/**
 * Check if quota is exceeded for the given API key
 * Returns true if quota is exceeded and we should skip AI generation
 */
export function isQuotaExceeded(apiKey: string): boolean {
  const state = quotaState.get(apiKey);
  if (!state) return false;

  // If quota was exceeded less than QUOTA_CHECK_INTERVAL ago, assume still exceeded
  const now = Date.now();
  if (state.quotaExceeded && (now - state.lastChecked) < QUOTA_CHECK_INTERVAL) {
    console.log(`[Symulate] 💡 Quota exceeded (checked ${Math.round((now - state.lastChecked) / 1000)}s ago). Using Faker.js mode.`);
    console.log(`[Symulate] 💡 Will retry AI mode in ${Math.round((QUOTA_CHECK_INTERVAL - (now - state.lastChecked)) / 1000)}s`);
    return true;
  }

  // Quota state expired, allow retry
  return false;
}

/**
 * Mark quota as exceeded for the given API key
 */
export function markQuotaExceeded(apiKey: string, tokensUsed?: number, tokensLimit?: number): void {
  quotaState.set(apiKey, {
    quotaExceeded: true,
    lastChecked: Date.now(),
    tokensRemaining: 0,
    tokensLimit,
  });
  console.log(`[Symulate] ⚠️  Quota exceeded: ${tokensUsed || "?"}/${tokensLimit || "?"} tokens used this month`);
  console.log(`[Symulate] 💡 Automatically switched to Faker.js mode (unlimited, free)`);
  console.log(`[Symulate] 💡 Upgrade at https://platform.symulate.dev/pricing for more AI tokens`);
}

/**
 * Update quota status from successful response headers
 */
export function updateQuotaStatus(apiKey: string, tokensRemaining: number, tokensLimit: number): void {
  const now = Date.now();

  // If tokens remaining is low (< 10% of limit), warn user
  const percentRemaining = (tokensRemaining / tokensLimit) * 100;
  if (percentRemaining < 10 && percentRemaining > 0) {
    console.warn(`[Symulate] ⚠️  Low quota: ${tokensRemaining}/${tokensLimit} tokens remaining (${percentRemaining.toFixed(1)}%)`);
    console.log(`[Symulate] 💡 Upgrade at https://platform.symulate.dev/pricing to avoid hitting limits`);
  }

  quotaState.set(apiKey, {
    quotaExceeded: false,
    lastChecked: now,
    tokensRemaining,
    tokensLimit,
  });
}

/**
 * Clear quota state (useful for testing or manual override)
 */
export function clearQuotaState(apiKey?: string): void {
  if (apiKey) {
    quotaState.delete(apiKey);
    console.log(`[Symulate] ✓ Quota state cleared for API key`);
  } else {
    quotaState.clear();
    console.log(`[Symulate] ✓ All quota state cleared`);
  }
}
