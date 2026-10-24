"use client";

// Browser-direct AI calls. The user's key lives in localStorage and is sent
// straight to the provider; it never reaches the Nirdesh server.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type ProviderId = "claude" | "gemini" | "openai" | "groq" | "openrouter";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  keyUrl: string;
  keyLabel: string;
  readsPdf: boolean; // can read scanned PDFs directly
  note: string;
  defaultModels: { id: string; label: string }[];
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  claude: {
    id: "claude",
    label: "Claude (Anthropic)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyLabel: "Anthropic API key",
    readsPdf: true,
    note:
      "Most accurate for reading judgments and quoting exactly. Reads scanned PDFs directly. Paid (pay-as-you-go).",
    defaultModels: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 — most accurate, recommended" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — faster, cheaper" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — fastest, cheapest" },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini (free tier)",
    keyUrl: "https://aistudio.google.com/apikey",
    keyLabel: "Gemini API key",
    readsPdf: true,
    note:
      "Free tier available — easiest for trying Nirdesh. Reads scanned PDFs directly. On the free tier Google may use your inputs to improve its products.",
    defaultModels: [],
  },
  openai: {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    keyUrl: "https://platform.openai.com/api-keys",
    keyLabel: "OpenAI API key",
    readsPdf: false,
    note: "Paid. Works on text PDFs and Word files; for scanned PDFs use Claude or Gemini.",
    defaultModels: [],
  },
  groq: {
    id: "groq",
    label: "Groq (free, open-source model)",
    keyUrl: "https://console.groq.com/keys",
    keyLabel: "Groq API key",
    readsPdf: false,
    note:
      "Free, very fast open-source models. Less accurate on long judgments and weaker in Kannada/Telugu. Text PDFs only — use Claude or Gemini for scanned PDFs.",
    defaultModels: [{ id: "openai/gpt-oss-120b", label: "GPT-OSS 120B — strongest, recommended" }],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (many models, some free)",
    keyUrl: "https://openrouter.ai/keys",
    keyLabel: "OpenRouter API key",
    readsPdf: false,
    note: "One key for many models, including free open-source ones. Text PDFs only.",
    defaultModels: [],
  },
};

export interface AISettings {
  provider: ProviderId;
  keys: Partial<Record<ProviderId, string>>;
  model: Partial<Record<ProviderId, string>>;
}

const STORAGE_KEY = "nirdesh.ai.settings";

export function loadSettings(): AISettings {
  if (typeof window === "undefined") return { provider: "gemini", keys: {}, model: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { provider: "gemini", keys: {}, model: {} };
}

export function saveSettings(s: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("nirdesh-settings"));
}

export function activeConfig(s: AISettings = loadSettings()) {
  const key = s.keys[s.provider]?.trim();
  const model = s.model[s.provider]?.trim() || PROVIDERS[s.provider].defaultModels[0]?.id;
  return { provider: s.provider, key, model, info: PROVIDERS[s.provider] };
}

export function isConfigured(s: AISettings = loadSettings()) {
  const c = activeConfig(s);
  return Boolean(c.key && c.model);
}

/** Fetch the live model list from the provider using the user's key. */
export async function listModels(provider: ProviderId, key: string): Promise<{ id: string; label: string }[]> {
  switch (provider) {
    case "claude": {
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      const out: { id: string; label: string }[] = [];
      for await (const m of client.models.list()) out.push({ id: m.id, label: m.display_name ?? m.id });
      return out;
    }
    case "gemini": {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`Gemini: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return (data.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[]; name: string }) =>
          m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name) &&
          !/(tts|image|audio|live|embedding|robotics|computer-use)/.test(m.name))
        .map((m: { name: string; displayName?: string }) => ({
          id: m.name.replace(/^models\//, ""),
          label: m.displayName ? `${m.displayName} (${m.name.replace(/^models\//, "")})` : m.name,
        }));
    }
    case "openai":
    case "groq":
    case "openrouter": {
      const client = openAICompatible(provider, key);
      const out: { id: string; label: string }[] = [];
      for await (const m of client.models.list()) out.push({ id: m.id, label: m.id });
      return out.sort((a, b) => a.id.localeCompare(b.id));
    }
  }
}

/** A sensible model to pre-select from a live list (stable "flash"-class text model where possible). */
export function recommendedModel(provider: ProviderId, models: { id: string }[]): string | undefined {
  const ids = models.map((m) => m.id);
  if (provider === "gemini") {
    const stable = ids.filter((id) => /^gemini-[\d.]+-flash$/.test(id)).sort().reverse();
    return stable[0] ?? ids.find((id) => /flash/.test(id) && !/lite/.test(id)) ?? ids[0];
  }
  return PROVIDERS[provider].defaultModels[0]?.id ?? ids[0];
}

function openAICompatible(provider: "openai" | "groq" | "openrouter", key: string) {
  const baseURL =
    provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : undefined;
  return new OpenAI({ apiKey: key, baseURL, dangerouslyAllowBrowser: true });
}

export interface CallArgs {
  system: string;
  user: string;
  pdfBase64?: string; // only for providers with readsPdf
  json?: boolean;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface CallResult {
  text: string;
  provider: ProviderId;
  model: string;
  durationMs: number;
}

/** One call to the user's chosen provider. Throws on error. */
/** Turn provider errors (often raw JSON) into a sentence a user can act on. */
export function friendlyError(e: unknown, label: string, model: string): Error {
  const raw = e instanceof Error ? e.message : String(e);
  let code: number | undefined = (e as { status?: number })?.status;
  let msg = raw;
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{")));
    code = j?.error?.code ?? code;
    msg = j?.error?.message ?? msg;
  } catch {}
  if (!code) code = Number(raw.match(/\b(4\d\d|5\d\d)\b/)?.[1]) || undefined;
  const tail = ` (${label} · ${model})`;
  if (code === 503 || /high demand|overloaded|unavailable/i.test(msg))
    return new Error(`This model is busy right now — the provider says it has high demand. Nirdesh retried automatically. Try again in a minute, or pick a different model in Settings.${tail}`);
  if (code === 429 || /quota|rate limit|resource.?exhausted/i.test(msg))
    return new Error(`Usage limit reached for this key (free tiers allow only a few requests per minute or per day). Wait a minute, or pick a different model in Settings.${tail}`);
  if (code === 401 || code === 403 || /api key|permission|unauthori[sz]ed|invalid.*key/i.test(msg))
    return new Error(`The provider rejected the key. Check that it was copied completely in Settings.${tail}`);
  if (code === 404 || /not found|does not exist|unsupported model/i.test(msg))
    return new Error(`This model is not available for your key. Pick another model in Settings.${tail}`);
  if (/failed to fetch|network/i.test(msg))
    return new Error(`Could not reach the provider. Check your internet connection and try again.${tail}`);
  return new Error(`${msg}${tail}`);
}

export async function callModel(args: CallArgs): Promise<CallResult> {
  const { model, info } = activeConfig();
  try {
    return await callModelRaw(args);
  } catch (e) {
    // Our own messages (no key, cut-off answers, scanned PDF) pass through unchanged.
    if (e instanceof Error && /^(No AI key|The answer was cut off|The model declined|.* cannot read scanned PDFs)/.test(e.message)) throw e;
    throw friendlyError(e, info.label.split(" (")[0], model ?? "?");
  }
}

async function callModelRaw(args: CallArgs): Promise<CallResult> {
  const { provider, key, model, info } = activeConfig();
  if (!key || !model) throw new Error("No AI key set. Open Settings and add a key.");
  if (args.pdfBase64 && !info.readsPdf)
    throw new Error(`${info.label} cannot read scanned PDFs. Switch to Claude or Gemini in Settings.`);
  const t0 = performance.now();
  let text = "";

  if (provider === "claude") {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const content: Anthropic.ContentBlockParam[] = [];
    if (args.pdfBase64)
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: args.pdfBase64 } });
    content.push({ type: "text", text: args.user });
    const stream = client.messages.stream({
      model,
      max_tokens: args.maxTokens ?? 32000,
      system: args.system,
      thinking: { type: "adaptive" },
      output_config: { effort: args.effort ?? "medium" },
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
    text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    if (msg.stop_reason === "max_tokens") throw new Error("The answer was cut off (too long). Try again.");
  } else if (provider === "gemini") {
    // Retry when Google is busy (503) or rate-limiting (429): 4 attempts with growing waits.
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: { retryOptions: { attempts: 4, initialDelay: 2, maxDelay: 20, httpStatusCodes: [408, 429, 500, 502, 503, 504] } },
    });
    const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
    if (args.pdfBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: args.pdfBase64 } });
    parts.push({ text: args.user });
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: args.system,
        maxOutputTokens: args.maxTokens ?? 32000,
        ...(args.json ? { responseMimeType: "application/json" } : {}),
      },
    });
    text = res.text ?? "";
  } else {
    const client = openAICompatible(provider, key);
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: args.maxTokens ?? 16000,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      ...(args.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    text = res.choices[0]?.message?.content ?? "";
    if (res.choices[0]?.finish_reason === "length") throw new Error("The answer was cut off (too long). Try again.");
  }

  return { text, provider, model, durationMs: Math.round(performance.now() - t0) };
}

/** Pull the first JSON object out of a model reply (handles ``` fences and stray prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in the model reply.");
  return JSON.parse(body.slice(start, end + 1));
}
