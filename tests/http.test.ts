import { test } from "bun:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createHttpClient, createManabaClient } from "../src/http.ts";

import type { Cookie } from "@steipete/sweet-cookie";

test("browser cookie warnings do not reject an otherwise usable session", async () => {
  const config = { browser: "chrome" as const, origin, profile: "protocol", version: 1 as const };
  const warnings: string[] = [];
  const client = await createManabaClient(config, {
    readCookies: async (options) => {
      assert.deepEqual(options.browsers, ["chrome"]);
      assert.equal(options.chromeProfile, "protocol");
      assert.equal(options.url, `${origin}/ct/`);

      return { cookies: [sessionCookie], warnings: ["One partitioned cookie excluded"] };
    },
    warn: (message) => {
      warnings.push(message);
    },
  });

  assert.equal(client.origin, origin);
  assert.deepEqual(warnings, ["One partitioned cookie excluded"]);

  await assert.rejects(
    createManabaClient(config, {
      readCookies: async () => ({ cookies: [], warnings: ["Keychain is locked"] }),
      warn: () => {
        throw new Error("Empty cookie failure should carry its diagnostics");
      },
    }),
    /Keychain is locked/,
  );
});

const origin = "https://mgu.manaba.jp";
const authenticatedHtml = '<html><a href="logout">ログアウト</a><p>ok</p></html>';
const sessionCookie: Cookie = {
  domain: "mgu.manaba.jp",
  hostOnly: true,
  name: "sessionid",
  path: "/",
  secure: true,
  value: "synthetic",
};

test("HTTP boundary scopes cookies and validates HTML using a local server", async () => {
  const received: { path: string; cookie?: string }[] = [];
  const server = createServer((request, response) => {
    received.push({ cookie: request.headers.cookie, path: request.url ?? "" });

    if (request.url === "/ct/home_course") {
      response.writeHead(302, { location: "https://login.example.test/" }).end();
    } else if (request.url === "/ct/course_1") {
      response.writeHead(302, { location: "/ct/home" }).end();
    } else if (request.url === "/ct/home_library_query") {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end('<form><input type="password"></form>');
    } else if (request.url === "/ct/home_submitlog") {
      response.writeHead(503).end("unavailable");
    } else {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(authenticatedHtml);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  assert.ok(address && typeof address !== "string");
  const transport = (url: string, options?: RequestInit) =>
    fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}`, options);
  const cookies: Cookie[] = [
    sessionCookie,
    { ...sessionCookie, expires: 1, name: "expired" },
    { ...sessionCookie, name: "otherPath", path: "/account" },
    { ...sessionCookie, domain: "example.test", name: "foreign" },
    { ...sessionCookie, domain: "manaba.jp", name: "parentHostOnly" },
    { ...sessionCookie, name: "specific", path: "/ct" },
  ];
  const client = createHttpClient(origin, cookies, { fetch: transport });

  try {
    assert.equal(await client.getText("/ct/home"), authenticatedHtml);
    assert.equal(received[0]?.cookie, "specific=synthetic; sessionid=synthetic");
    assert.equal(await client.getText("/ct/course_1"), authenticatedHtml);
    await assert.rejects(client.getText("https://evil.test/ct/home"), /outside/);
    await assert.rejects(client.getText("/ct/home_course"), /Browser session|log in/i);
    assert.ok(received.every((request) => request.path.startsWith("/ct/")));
    await assert.rejects(client.getText("/ct/home_library_query"), /Browser session|log in/i);
    await assert.rejects(client.getText("/ct/home_submitlog"), /503/);
    await assert.rejects(client.getText("/ct/logout"), /Unsupported/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});

test("invalid cookie headers fail without echoing their values", async () => {
  const client = createHttpClient(origin, [{ ...sessionCookie, value: "private;bad" }]);

  await assert.rejects(client.getText("/ct/home"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Invalid browser cookie/);
    assert.doesNotMatch(error.message, /private/);

    return true;
  });
});

test("empty browser cookies and request timeout fail explicitly", async () => {
  await assert.rejects(
    createHttpClient(origin, []).getText("/ct/home"),
    /No usable browser cookies/,
  );

  const client = createHttpClient(origin, [sessionCookie], {
    fetch: async (_url, options) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1000);

        options?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });

      return new Response(authenticatedHtml);
    },
    timeoutMs: 5,
  });

  await assert.rejects(client.getText("/ct/home"), /timed out/);
});
