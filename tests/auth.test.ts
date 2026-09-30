import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { authenticate } from "../src/auth.ts";
import { createHttpClient } from "../src/http.ts";
import { readSessionConfig } from "../src/session.ts";

test("auth verifies browser HTML before saving and leaves configuration intact on failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ripmanaba-auth-"));
  const path = join(directory, "config.json");
  let html = '<a href="/ct/logout">Log out</a>';
  const factory = async (config: { origin: string }) =>
    createHttpClient(
      config.origin,
      [
        {
          domain: "mgu.manaba.jp",
          name: "sessionid",
          value: "synthetic",
        },
      ],
      { fetch: async () => new Response(html, { headers: { "content-type": "text/html" } }) },
    );

  try {
    const config = await authenticate(
      "https://mgu.manaba.jp/ct/home",
      { browser: "chrome", config: path, profile: "protocol" },
      factory,
    );

    assert.deepEqual(await readSessionConfig(path), config);
    html = '<form><input type="password"></form>';

    await assert.rejects(
      authenticate("https://mgu.manaba.jp", { browser: "firefox", config: path }, factory),
      /Browser session/,
    );

    assert.deepEqual(await readSessionConfig(path), config);
  } finally {
    await rm(directory, { recursive: true });
  }
});
