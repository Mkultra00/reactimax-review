import { createServerFn } from "@tanstack/react-start";

// Mints a short-lived, FastH3-only, single-session token. The rk_ key never leaves the server.
export const getReactorToken = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env['REACTOR_API_KEY'];
  if (!apiKey) throw new Error("Live feed is not configured");
  const res = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: { "Reactor-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: 900,
      authorization_details: [
        { type: "session", resources: { models: { match: ["reactor/fast-h3"] } }, constraints: { max_sessions: 1 } },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const { jwt } = (await res.json()) as { jwt: string };
  return { jwt };
});
