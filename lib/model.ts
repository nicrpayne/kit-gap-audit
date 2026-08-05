import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

export const AUDIT_MODEL = process.env.AUDIT_MODEL || "claude-sonnet-4-6";

export interface JsonCompletionOptions {
  prompt: string;
  maxTokens?: number;
}

// Single wrapper for every Anthropic call: model + token config in one
// place, plus defensive JSON parsing so callers just get typed data back.
export async function completeJson<T = unknown>(options: JsonCompletionOptions): Promise<T> {
  const client = getClient();
  const response = await client.messages.create({
    model: AUDIT_MODEL,
    max_tokens: options.maxTokens ?? 8000,
    messages: [{ role: "user", content: options.prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // A truncated response can't be parsed as JSON no matter how loose the
  // parser is -- catching this before parsing gives a clear, actionable
  // error ("input was too large") instead of a confusing mid-string
  // "Unexpected end of JSON input" dump of the cut-off output.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Model output was cut off before it finished (hit the response length limit) -- the input was " +
        "likely too large for one pass. Try a shorter paste, or split it into smaller chunks."
    );
  }

  return parseJsonLoose<T>(text);
}

// Strips code fences, trims preamble/postamble, and tolerates trailing
// commas -- models reliably almost-but-not-quite emit clean JSON.
function parseJsonLoose<T>(raw: string): T {
  let text = raw.trim();

  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const firstBracket = text.search(/[[{]/);
  if (firstBracket > 0) text = text.slice(firstBracket);

  const lastBracket = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (lastBracket !== -1 && lastBracket < text.length - 1) {
    text = text.slice(0, lastBracket + 1);
  }

  text = text.replace(/,(\s*[\]}])/g, "$1");

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Model did not return parseable JSON (${message}): ${text.slice(0, 2000)}`);
  }
}
