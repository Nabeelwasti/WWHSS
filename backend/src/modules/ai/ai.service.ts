import { prisma } from "../../db/client.js";
import { getStudentEngagementSummary } from "../attendance/attendance.service.js";

export class AiConfigError extends Error {}

// ---------- Multi-provider AI with real automatic fallback AND simple
// task-based tiering ----------
//
// Configured with plain numbered settings in .env — no JSON, no code
// editing required. Up to 10 slots (AI_PROVIDER_1 .. AI_PROVIDER_10):
//
//   AI_PROVIDER_1=gemini
//   AI_PROVIDER_1_KEY=your-first-gemini-key
//   AI_PROVIDER_1_TIER=fast          <- optional: "fast" or "smart"
//
// TIERING (a real, honest version of "auto-select the right model for the
// task" — a simple length/keyword heuristic, not a claim of deep
// understanding): a short, simple-looking question prefers providers
// tagged "fast"; a longer or "explain/analyze/essay"-style question
// prefers ones tagged "smart". If nothing matches that tier, or no tiers
// are set at all, it just tries every configured provider in order — so
// leaving AI_PROVIDER_N_TIER unset is completely fine and behaves exactly
// like before.
type Tier = "fast" | "smart";

export type ProviderConfig =
  | { type: "anthropic"; apiKey: string; model: string; tier?: Tier }
  | { type: "gemini"; apiKey: string; model: string; tier?: Tier }
  | { type: "openai_compatible"; baseUrl: string; apiKey?: string; model: string; tier?: Tier };

function loadConfiguredProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  for (let i = 1; i <= 10; i++) {
    const type = process.env[`AI_PROVIDER_${i}`];
    if (!type) continue;
    const rawTier = process.env[`AI_PROVIDER_${i}_TIER`];
    const tier: Tier | undefined = rawTier === "fast" || rawTier === "smart" ? rawTier : undefined;

    if (type === "anthropic") {
      const apiKey = process.env[`AI_PROVIDER_${i}_KEY`];
      if (!apiKey) continue;
      providers.push({ type: "anthropic", apiKey, model: process.env[`AI_PROVIDER_${i}_MODEL`] || "claude-sonnet-4-6", tier });
    } else if (type === "gemini") {
      const apiKey = process.env[`AI_PROVIDER_${i}_KEY`];
      if (!apiKey) continue;
      providers.push({ type: "gemini", apiKey, model: process.env[`AI_PROVIDER_${i}_MODEL`] || "gemini-2.0-flash", tier });
    } else if (type === "openai_compatible") {
      const baseUrl = process.env[`AI_PROVIDER_${i}_BASE_URL`];
      if (!baseUrl) continue;
      providers.push({
        type: "openai_compatible",
        baseUrl,
        apiKey: process.env[`AI_PROVIDER_${i}_KEY`],
        model: process.env[`AI_PROVIDER_${i}_MODEL`] || "llama3",
        tier,
      });
    }
  }

  if (providers.length === 0) {
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({ type: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6" });
    }
    if (process.env.AI_BASE_URL) {
      providers.push({ type: "openai_compatible", baseUrl: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL || "llama3" });
    }
  }

  return providers;
}

// Deliberately simple and explainable — not a black box. A real ML
// classifier would need training data and hosting we don't have; this
// heuristic is honest about being a heuristic.
export function classifyTask(message: string): Tier {
  const detailedSignals = /explain|analyz|essay|详细|compare|summari[sz]e in detail|step by step|why does|how does/i;
  if (message.length > 220 || detailedSignals.test(message)) return "smart";
  return "fast";
}

export function orderByTier(providers: ProviderConfig[], preferred: Tier): ProviderConfig[] {
  const matching = providers.filter((p) => p.tier === preferred);
  const other = providers.filter((p) => p.tier !== preferred);
  // Preferred tier first, then everything else as a real fallback — so a
  // "fast" preference never means "smart" providers are unreachable, just
  // tried second.
  return [...matching, ...other];
}

async function callAnthropic(cfg: Extract<ProviderConfig, { type: "anthropic" }>, systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 800, system: systemPrompt, messages: [{ role: "user", content: userMessage }] }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}: ${await response.text().catch(() => "")}`);
  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  return data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
}

async function callGemini(cfg: Extract<ProviderConfig, { type: "gemini" }>, systemPrompt: string, userMessage: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    }),
  });
  if (!response.ok) throw new Error(`Gemini error ${response.status}: ${await response.text().catch(() => "")}`);
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function callOpenAiCompatible(cfg: Extract<ProviderConfig, { type: "openai_compatible" }>, systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI endpoint error ${response.status}: ${await response.text().catch(() => "")}`);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callProvider(cfg: ProviderConfig, systemPrompt: string, userMessage: string): Promise<string> {
  if (cfg.type === "anthropic") return callAnthropic(cfg, systemPrompt, userMessage);
  if (cfg.type === "gemini") return callGemini(cfg, systemPrompt, userMessage);
  return callOpenAiCompatible(cfg, systemPrompt, userMessage);
}

// Builds real, consent-gated personal context. Only ever pulls data this
// exact person is already allowed to see about THEMSELVES — never another
// student's, never bypassing the permission engine used everywhere else in
// the app. Returns nothing extra at all if consent isn't given.
async function buildPersonalContext(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true },
  });
  if (!user?.aiPersonalizationConsent) return "";
  if (!user.studentProfile) return "";

  const engagement = await getStudentEngagementSummary(user.studentProfile.id);
  const recentResults = await prisma.examResult.findMany({
    where: { studentProfileId: user.studentProfile.id },
    include: { subject: true },
    orderBy: { id: "desc" },
    take: 5,
  });

  const parts = [
    `This student has consented to sharing their own real data for a more personal answer.`,
    `Real current attendance streak: ${engagement.currentStreak} day(s); overall attendance rate: ${engagement.attendanceRate ?? "not enough data yet"}.`,
  ];
  if (recentResults.length > 0) {
    const resultLines = recentResults.map((r) => `${r.subject.name}: ${r.marksObtained}/${r.maxMarks}`).join("; ");
    parts.push(`Recent real exam results: ${resultLines}.`);
  }
  parts.push("Use this ONLY to personalize tone and suggestions (e.g. encouragement, what to focus on) — never restate it as if reading it off a report card, and never mention subjects/scores the student didn't ask about.");
  return parts.join(" ");
}

export async function askCampusAI(userId: string, message: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) throw new Error("User not found");

  const roleNames = user.userRoles.map((ur) => ur.role.name).join(", ") || "no assigned role";
  const personalContext = await buildPersonalContext(userId);

  const systemPrompt = [
    `You are the WWHS Digital Campus assistant, speaking with ${user.fullName}, whose role(s) at the school: ${roleNames}.`,
    "You do NOT currently have live access to this school's actual attendance, grades, fees, or timetable records beyond what is explicitly given to you below.",
    "If asked about specific personal school data you were not given below, say plainly that you can't look that up yet and suggest the relevant dashboard section instead. Never invent a plausible-sounding number, name, or date.",
    "For general academic help (explaining a concept, drafting a lesson outline, study tips, encouragement), answer normally and helpfully. Be warm and encouraging, especially with students who seem to be struggling.",
    personalContext,
  ].filter(Boolean).join(" ");

  const providers = loadConfiguredProviders();
  if (providers.length === 0) {
    throw new AiConfigError(
      "No AI provider is configured. Add at least one AI_PROVIDER_1 setting in backend/.env — see the comments there for Gemini, Anthropic, or a free self-hosted option. No offline fallback exists by design."
    );
  }

  const preferredTier = classifyTask(message);
  const ordered = orderByTier(providers, preferredTier);

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/key=[A-Za-z0-9_-]+/gi, "key=[REDACTED]")
    .replace(/x-api-key['"]?\s*:\s*['"]?[A-Za-z0-9_-]+/gi, "x-api-key: [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}

  const failures: string[] = [];
  for (const cfg of ordered) {
    try {
      const reply = await callProvider(cfg, systemPrompt, message);
      if (reply.trim().length > 0) return reply;
      failures.push(`${cfg.type}: returned an empty reply`);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      failures.push(`${cfg.type}: ${sanitizeErrorMessage(rawMsg)}`);
    }
  }

  console.error("All configured AI providers failed:", failures);
  throw new Error("The AI assistant is temporarily unavailable — every configured provider failed. Please try again shortly.");
}

