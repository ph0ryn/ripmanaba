import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeManabaOrigin, readSessionConfig, writeSessionConfig } from "../src/session.ts";

test("only HTTPS manaba origins can receive browser credentials", () => {
  assert.equal(normalizeManabaOrigin("https://mgu.manaba.jp/ct/home"), "https://mgu.manaba.jp");

  for (const url of [
    "http://mgu.manaba.jp",
    "https://manaba.jp.evil.test",
    "https://user:secret@mgu.manaba.jp",
    "https://mgu.manaba.jp:444",
  ]) {
    assert.throws(() => normalizeManabaOrigin(url), /HTTPS manaba/);
  }
});

test("configuration persists metadata only with restrictive permissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ripmanaba-config-"));
  const path = join(directory, "config.json");
  const config = {
    browser: "chrome" as const,
    origin: "https://mgu.manaba.jp",
    profile: "protocol",
    version: 1 as const,
  };

  try {
    assert.equal(await readSessionConfig(path), undefined);
    await writeSessionConfig(config, path);
    assert.deepEqual(await readSessionConfig(path), config);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.doesNotMatch(await readFile(path, "utf8"), /cookie|token|password/i);
    await writeFile(path, JSON.stringify({ ...config, cookies: "secret" }));
    await assert.rejects(readSessionConfig(path), /Invalid configuration\. /);
    await writeFile(path, "{broken JSON and secret}");
    await assert.rejects(readSessionConfig(path), /Invalid configuration JSON\./);
  } finally {
    await rm(directory, { recursive: true });
  }
});
