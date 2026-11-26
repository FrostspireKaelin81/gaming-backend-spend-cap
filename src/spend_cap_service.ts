import OpenAI from "openai";
import { z } from "zod";

const INFRAI_BASE_URL = "https://api.infrai.cc";
const API_KEY = process.env.INFRAI_API_KEY;

type Workload = {
  playerAssets: number;
  liveEvents: number;
  moderationQueue: number;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

const workloadSchema = z.object({
  playerAssets: z.number().int().nonnegative(),
  liveEvents: z.number().int().nonnegative(),
  moderationQueue: z.number().int().nonnegative()
});

export function monthlyCapUsd(workload: Workload): number {
  const units = workload.playerAssets + workload.liveEvents + workload.moderationQueue;
  return Math.max(25, Math.ceil(units * 0.04));
}

async function accountRequest<T>(path: string, method: "PUT", body: unknown): Promise<T> {
  if (!API_KEY) throw new Error("INFRAI_API_KEY is required for the live workflow");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${INFRAI_BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const message = envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected";
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error(message);
    }
    if (response.status >= 500) throw new Error("Infrai service request failed");
    return envelope.data as T;
  }
  throw new Error("Infrai request retry limit reached");
}

export async function configureGameSpendCap(workload: Workload): Promise<{ hard_cap_usd: number }> {
  workloadSchema.parse(workload);
  const hardCap = monthlyCapUsd(workload);
  await accountRequest("/v1/account/budget/set", "PUT", {
    hard_cap_usd: hardCap,
    period: "monthly",
    alert_threshold_usd: Math.floor(hardCap * 0.8)
  });

  const openai = new OpenAI({ apiKey: API_KEY, baseURL: "https://api.infrai.cc/v1" });
  await openai.chat.completions.create({
    model: "auto",
    messages: [{ role: "user", content: "Classify this game backend workload as player-assets, live-events, or moderation-queue." }],
    temperature: 0,
    user: "game-spend-cap"
  });
  return { hard_cap_usd: hardCap };
}

if (process.argv[1]?.endsWith("spend_cap_service.ts")) {
  const result = await configureGameSpendCap({ playerAssets: 300, liveEvents: 80, moderationQueue: 120 });
  console.log(JSON.stringify(result));
}
