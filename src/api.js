import { auth } from "./auth.js";

const artifactIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeShortId(value) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{22}$/.test(value)) return;
  let number = 0n;
  for (const character of value) number = number * 58n + BigInt(base58.indexOf(character));
  if (number >= 1n << 128n) return;
  const hex = number.toString(16).padStart(32, "0");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function artifactUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === "https://claude.ai" && !url.username && !url.password) return url;
  } catch {}
}

export function artifactId(value) {
  if (artifactIdPattern.test(value)) return value.toLowerCase();
  const shortId = decodeShortId(value);
  if (shortId) return shortId;
  const url = artifactUrl(value);
  const match = url && /^\/(?:code\/)?artifact\/([^/]+)\/?$/.exec(url.pathname);
  const id = match?.[1];
  if (id && artifactIdPattern.test(id)) return id.toLowerCase();
  const decoded = id && decodeShortId(id);
  if (decoded) return decoded;
  throw new Error("Expected a Claude artifact UUID or https://claude.ai/[code/]artifact/<id> URL.");
}

export function artifactReadPath(value, version) {
  const id = artifactId(value);
  const query = new URLSearchParams();
  const key = artifactUrl(value)?.searchParams.get("sk");
  if (key !== null && key !== undefined) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new Error("Invalid artifact share key.");
    query.set("sk", key);
  }
  if (version !== undefined) query.set("ver", version);
  return `/api/frame/${id}${query.size ? `?${query}` : ""}`;
}

function artifactsApiBaseUrl() {
  if (process.env["CLAUDE_CODE_ARTIFACTS_API_BASE_URL"] !== undefined) return process.env["CLAUDE_CODE_ARTIFACTS_API_BASE_URL"].replace(/\/+$/, "");
  return "https://api.anthropic.com";
}

export async function frameRequest(method, path, body, headers = {}) {
  let token = await auth.token();
  const send = () => fetch(`${artifactsApiBaseUrl()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "X-Frame-CP": "go", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000), redirect: "error",
  });
  let response = await send();
  if (response.status === 401) {
    await response.body?.cancel();
    const fresh = await auth.token(token);
    if (fresh === token) throw new Error("Claude login was rejected. Run claude-artifacts auth login, or renew the selected environment/Claude Code login.");
    token = fresh;
    response = await send();
  }
  const safePath = path.replace(/([?&]sk=)[^&]*/g, "$1[redacted]");
  const text = await response.text();
  let responseBody;
  try { responseBody = text === "" ? null : JSON.parse(text); }
  catch { throw new Error(`${method} ${safePath} HTTP ${response.status}: non-JSON response`); }
  if (response.status === 409 && responseBody?.["conflict"] === true) throw new Error(`conflict: live version is ${responseBody["live"]}`);
  if (response.status < 200 || response.status >= 300) throw new Error(`${method} ${safePath} ${response.status}: request rejected`);
  return responseBody;
}

