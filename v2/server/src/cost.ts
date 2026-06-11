import type { CostLog } from './types.js';

/**
 * Published Groq pricing (USD), kept here so the per-session log shows a
 * realistic estimate. Update if Groq changes pricing.
 */
const PRICING = {
  sttPerHour: 0.04, // whisper-large-v3-turbo
  fastInputPerM: 0.05, // llama-3.1-8b-instant
  fastOutputPerM: 0.08,
  smartInputPerM: 0.59, // llama-3.3-70b-versatile
  smartOutputPerM: 0.79,
};

export function emptyCost(): CostLog {
  return {
    sttSeconds: 0,
    fastInputTokens: 0,
    fastOutputTokens: 0,
    smartInputTokens: 0,
    smartOutputTokens: 0,
  };
}

export function estimateUsd(cost: CostLog): number {
  const usd =
    (cost.sttSeconds / 3600) * PRICING.sttPerHour +
    (cost.fastInputTokens / 1e6) * PRICING.fastInputPerM +
    (cost.fastOutputTokens / 1e6) * PRICING.fastOutputPerM +
    (cost.smartInputTokens / 1e6) * PRICING.smartInputPerM +
    (cost.smartOutputTokens / 1e6) * PRICING.smartOutputPerM;
  return Math.round(usd * 1e6) / 1e6;
}

export function logSessionCost(sessionId: string, cost: CostLog): number {
  const usd = estimateUsd(cost);
  console.log(
    `[cost] session=${sessionId} stt=${cost.sttSeconds.toFixed(1)}s ` +
      `fast=${cost.fastInputTokens}in/${cost.fastOutputTokens}out ` +
      `smart=${cost.smartInputTokens}in/${cost.smartOutputTokens}out ` +
      `estimate=$${usd.toFixed(6)}`,
  );
  return usd;
}
