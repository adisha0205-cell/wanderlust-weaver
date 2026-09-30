import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  location: z
    .string()
    .trim()
    .min(1, "location required")
    .max(100)
    .regex(/^[\p{L}\p{N}\s,.\-'()&/]+$/u, "invalid characters in location"),
  dates: z
    .string()
    .trim()
    .min(1, "dates required")
    .max(50)
    .regex(/^[\p{L}\p{N}\s,.\-/:]+$/u, "invalid characters in dates"),
  travelType: z.enum(["Solo", "Couple", "Friends", "Family"]),
});

// Basic prompt-injection guard
const INJECTION_PATTERNS = [
  /ignore (all |the )?(previous|prior|above) (instructions|prompts)/i,
  /system prompt/i,
  /</,
  />/,
  /```/,
];

function looksLikeInjection(s: string) {
  return INJECTION_PATTERNS.some((re) => re.test(s));
}

// Simple in-memory rate limit per IP (best-effort)
const RATE: Map<string, { count: number; reset: number }> = new Map();
const LIMIT = 5;
const WINDOW_MS = 60_000;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE.get(ip);
  if (!entry || entry.reset < now) {
    RATE.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count += 1;
  return true;
}

function cleanItinerary(value: unknown): string {
  if (typeof value !== "string") return "";

  const text = value.trim();
  if (!text) return "";

  try {
    const nested: unknown = JSON.parse(text);
    if (nested && typeof nested === "object") {
      const record = nested as Record<string, unknown>;
      const extracted = cleanItinerary(
        record.itinerary ?? record.output ?? record.message ?? record.text ?? record.data,
      );
      if (extracted) return extracted;
    }
  } catch {
    // Some n8n responses resemble JSON but contain unquoted markdown content.
  }

  return text
    .replace(
      /^\s*\{\s*["']?success["']?\s*:\s*true\s*,\s*["']?itinerary["']?\s*:\s*/i,
      "",
    )
    .replace(/\s*\}\s*$/, "")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  if (!webhookUrl) {
    return new Response(
      JSON.stringify({ error: "Server is not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const { location, dates, travelType } = parsed.data;

  if (looksLikeInjection(location) || looksLikeInjection(dates)) {
    return new Response(
      JSON.stringify({ error: "Input rejected by safety filter" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, dates, travelType }),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: "Upstream request failed" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const ct = upstream.headers.get("content-type") || "";
    let raw: unknown;
    if (ct.includes("application/json")) {
      raw = await upstream.json();
    } else {
      const t = await upstream.text();
      try {
        raw = JSON.parse(t);
      } catch {
        raw = t;
      }
    }
    if (Array.isArray(raw)) raw = raw[0];

    let itinerary = "";
    if (typeof raw === "string") {
      itinerary = cleanItinerary(raw);
    } else if (raw && typeof raw === "object") {
      const record = raw as Record<string, unknown>;
      itinerary = cleanItinerary(
        record.itinerary ?? record.output ?? record.message ?? record.text ?? record.data,
      );
    }

    if (!itinerary) {
      return new Response(JSON.stringify({ error: "No itinerary returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ itinerary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
