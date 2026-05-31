import { readFile } from "node:fs/promises";

import { refreshAuthenticatedSession } from "./auth.ts";
import { requireSessionConfig, type SessionConfig } from "./session.ts";

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
}

interface StorageState {
  cookies: StorageStateCookie[];
}

function domainMatches(hostname: string, cookieDomain: string): boolean {
  const normalizedDomain = cookieDomain.replace(/^\./, "");

  if (hostname === normalizedDomain) {
    return true;
  }

  return hostname.endsWith(`.${normalizedDomain}`);
}

async function readStorageState(config: SessionConfig): Promise<StorageState> {
  return JSON.parse(await readFile(config.storageStateFile, "utf8")) as StorageState;
}

async function buildCookieHeader(config: SessionConfig): Promise<string> {
  const state = await readStorageState(config);
  const hostname = new URL(config.origin).hostname;

  return state.cookies
    .filter((cookie) => domainMatches(hostname, cookie.domain))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export async function fetchManabaText(pathOrUrl: string): Promise<string> {
  const config = await requireSessionConfig();
  const url = new URL(pathOrUrl, config.origin);
  let response = await fetchWithSession(url, config);

  if (new URL(response.url).origin !== config.origin) {
    await refreshAuthenticatedSession(config);
    response = await fetchWithSession(url, config);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url.toString()}: ${response.status}`);
  }

  if (new URL(response.url).origin !== config.origin) {
    throw new Error("Saved session is not authenticated. Run ripmanaba auth again.");
  }

  return response.text();
}

export async function getManabaOrigin(): Promise<string> {
  return (await requireSessionConfig()).origin;
}

async function fetchWithSession(url: URL, config: SessionConfig): Promise<Response> {
  const cookie = await buildCookieHeader(config);

  return fetch(url, { headers: { cookie } });
}
