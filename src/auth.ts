import { createManabaClient, type ManabaClient } from "./http.ts";
import {
  normalizeManabaOrigin,
  parseBrowser,
  type SessionConfig,
  validateSessionConfig,
  writeSessionConfig,
} from "./session.ts";

export interface AuthOptions {
  browser: string;
  config?: string;
  profile?: string;
}

export async function authenticate(
  url: string,
  options: AuthOptions,
  createClient: (config: SessionConfig) => Promise<ManabaClient> = createManabaClient,
): Promise<SessionConfig> {
  const selection: SessionConfig = {
    browser: parseBrowser(options.browser),
    origin: normalizeManabaOrigin(url),
    version: 1,
  };

  if (options.profile !== undefined) {
    selection.profile = options.profile;
  }

  const config = validateSessionConfig(selection);
  const client = await createClient(config);

  await client.getText("/ct/home");
  await writeSessionConfig(config, options.config);

  return config;
}
