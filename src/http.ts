import { readFile } from "node:fs/promises";

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
  const cookie = await buildCookieHeader(config);
  const response = await fetch(url, { headers: { cookie } });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url.toString()}: ${response.status}`);
  }

  return response.text();
}

export async function getManabaOrigin(): Promise<string> {
  return (await requireSessionConfig()).origin;
}
