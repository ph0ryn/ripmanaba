import { getCookies, type Cookie } from "@steipete/sweet-cookie";
import { load } from "cheerio";

import { normalizeManabaOrigin, type SessionConfig } from "./session.ts";

export interface ManabaClient {
  readonly origin: string;
  getText(pathOrUrl: string): Promise<string>;
}

interface HttpOptions {
  fetch?: (url: string, options?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

interface BrowserCookieOptions {
  readCookies?: typeof getCookies;
  warn?: (message: string) => void;
}

function sessionError(): Error {
  return new Error(
    "Browser session is not authenticated. Log in to manaba in the selected browser, then retry.",
  );
}

function requestUrl(pathOrUrl: string, origin: string): URL {
  const url = new URL(pathOrUrl, origin);

  if (url.origin !== origin || url.username !== "" || url.password !== "") {
    throw new Error("Refusing to send browser cookies outside the configured manaba origin.");
  }

  if (
    !/^\/ct\/(?:home(?:_course|_library_query|_submitlog|_campusnews_\d+)?|course_\d+(?:_page|_(?:report|query|survey)_\d+)?|page_[a-zA-Z0-9-]+(?:_[a-zA-Z0-9-]+)?)$/.test(
      url.pathname,
    )
  ) {
    throw new Error("Unsupported manaba resource path.");
  }

  return url;
}

function cookieMatches(cookie: Cookie, url: URL): boolean {
  let domain = cookie.domain?.replace(/^\./, "");

  if (domain === undefined && cookie.url !== undefined) {
    domain = new URL(cookie.url).hostname;
  }

  if (domain === undefined || domain === "") {
    return false;
  }

  let hostMatches = url.hostname === domain;

  if (cookie.hostOnly !== true && cookie.domain !== undefined) {
    hostMatches ||= url.hostname.endsWith(`.${domain}`);
  }

  const path = cookie.path ?? "/";
  const pathMatches =
    url.pathname === path ||
    (url.pathname.startsWith(path) && (path.endsWith("/") || url.pathname[path.length] === "/"));
  const unexpired =
    cookie.expires === undefined || cookie.expires <= 0 || cookie.expires > Date.now() / 1000;

  return hostMatches && pathMatches && (!cookie.secure || url.protocol === "https:") && unexpired;
}

function cookieHeader(cookies: Cookie[], url: URL): string {
  const matched = cookies
    .filter((cookie) => cookieMatches(cookie, url))
    .sort((a, b) => (b.path ?? "/").length - (a.path ?? "/").length);

  if (matched.length === 0) {
    throw new Error(
      "No usable browser cookies. Log in to manaba in the selected browser, then retry.",
    );
  }

  for (const cookie of matched) {
    if (
      !/^[!#$%&'*+.^_`|~\w-]+$/.test(cookie.name) ||
      !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(cookie.value)
    ) {
      throw new Error("Invalid browser cookie. Its value has been omitted.");
    }
  }

  return matched.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function networkError(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) {
    throw new Error("Manaba request timed out.");
  }

  throw new Error("Unable to connect to manaba.", { cause: error });
}

function assertAuthenticatedHtml(html: string, url: URL): void {
  const $ = load(html);
  const logout = $("a[href]")
    .toArray()
    .some((anchor) => {
      const href = $(anchor).attr("href");

      if (href === undefined || !URL.canParse(href, url.toString())) {
        return false;
      }

      const link = new URL(href, url);

      return link.origin === url.origin && link.pathname === "/ct/logout";
    });

  if (!logout || $("input[type=password]").length > 0) {
    throw sessionError();
  }
}

export function createHttpClient(
  origin: string,
  cookies: Cookie[],
  options: HttpOptions = {},
): ManabaClient {
  const verifiedOrigin = normalizeManabaOrigin(origin);
  const transport = options.fetch ?? fetch;

  return {
    async getText(pathOrUrl: string): Promise<string> {
      let url = requestUrl(pathOrUrl, verifiedOrigin);
      const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);

      for (let redirects = 0; redirects <= 5; redirects += 1) {
        const headers = { accept: "text/html", cookie: cookieHeader(cookies, url) };
        const response = await transport(url.toString(), {
          headers,
          redirect: "manual",
          signal,
        }).catch((error: unknown) => networkError(error, signal));

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");

          await response.body?.cancel();

          if (location === null || !URL.canParse(location, url.toString())) {
            throw new Error("Manaba returned an invalid redirect location.");
          }

          const target = new URL(location, url);

          if (
            target.origin !== verifiedOrigin ||
            /\/(?:login|sso|shibboleth)(?:\/|$)/i.test(target.pathname)
          ) {
            throw sessionError();
          }

          url = requestUrl(target.toString(), verifiedOrigin);
        } else {
          if (!response.ok) {
            await response.body?.cancel();

            if (response.status === 401 || response.status === 403) {
              throw sessionError();
            }

            throw new Error(`Manaba request failed: HTTP ${response.status}.`);
          }

          if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
            await response.body?.cancel();

            throw new Error("Manaba returned a non-HTML response.");
          }

          const html = await response.text().catch((error: unknown) => networkError(error, signal));

          assertAuthenticatedHtml(html, url);

          return html;
        }
      }

      throw new Error("Manaba returned too many redirects.");
    },
    origin: verifiedOrigin,
  };
}

export async function createManabaClient(
  config: SessionConfig,
  options: BrowserCookieOptions = {},
): Promise<ManabaClient> {
  const origin = normalizeManabaOrigin(config.origin);

  if (
    config.browser === "chromium" &&
    process.platform !== "darwin" &&
    process.platform !== "linux"
  ) {
    throw new Error("Chromium cookie extraction is supported on macOS and Linux only.");
  }

  const readCookies = options.readCookies ?? getCookies;
  const warn =
    options.warn ??
    ((message: string) => {
      console.error(`Warning: ${message}`);
    });
  let browser = config.browser;
  let chromiumBrowser: "chrome" | "chromium" = "chrome";

  if (browser === "chromium") {
    browser = "chrome";
    chromiumBrowser = "chromium";
  }

  const { cookies, warnings } = await readCookies({
    browsers: [browser],
    chromeProfile: config.profile,
    chromiumBrowser,
    edgeProfile: config.profile,
    firefoxProfile: config.profile,
    mode: "first",
    timeoutMs: 30_000,
    url: `${origin}/ct/`,
  });

  if (cookies.length === 0) {
    throw new Error(
      [
        "No usable browser cookies. Check --browser and --profile, and make sure the selected profile is accessible from this CLI.",
        ...warnings,
      ].join("\n"),
    );
  }

  for (const warning of warnings) {
    warn(warning);
  }

  return createHttpClient(origin, cookies);
}
