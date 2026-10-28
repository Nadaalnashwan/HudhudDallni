import "server-only";

const KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export const groqEnabled = () => Boolean(KEY);

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function call(messages: Msg[], json: boolean, temperature = 0.2): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function groqJson<T>(system: string, user: string): Promise<T> {
  const text = await call(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    true,
  );
  return JSON.parse(text) as T;
}

export async function groqText(system: string, user: string): Promise<string> {
  return (
    await call(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      false,
      0.6,
    )
  ).trim();
}
