import { openManabaPath } from "../open.ts";
import { getTaskInfo, listTasks, openTask } from "./task.ts";

import type { CAC } from "cac";

interface ResourceCommandConfig {
  name: string;
  aliases?: string[];
  infoPath?: (id: string) => string;
}

type ResourceOperation = "ls" | "info" | "open";

function assertResourceOperation(operation: string): asserts operation is ResourceOperation {
  if (operation === "ls" || operation === "info" || operation === "open") {
    return;
  }

  throw new Error(`Unknown operation: ${operation}`);
}

function requireResourceId(operation: ResourceOperation, id: string | undefined): string {
  if (operation === "ls") {
    return "";
  }

  if (id === undefined) {
    throw new Error(`${operation} requires an id.`);
  }

  return id;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, undefined, 2));
}

async function runTaskCommand(operation: string, id: string | undefined): Promise<void> {
  assertResourceOperation(operation);

  if (operation === "ls") {
    printJson(await listTasks());

    return;
  }

  const resourceId = requireResourceId(operation, id);

  if (operation === "info") {
    printJson(await getTaskInfo(resourceId));

    return;
  }

  await openTask(resourceId);
}

async function runPlaceholderResourceCommand(
  config: ResourceCommandConfig,
  operation: string,
  id: string | undefined,
): Promise<void> {
  assertResourceOperation(operation);

  const resourceId = requireResourceId(operation, id);

  if (operation === "ls") {
    throw new Error(`${config.name} ls is not implemented yet.`);
  }

  if (operation === "info") {
    throw new Error(`${config.name} info is not implemented yet.`);
  }

  if (config.infoPath === undefined) {
    throw new Error(`${config.name} open is not implemented yet.`);
  }

  await openManabaPath(config.infoPath(resourceId));
}

function registerResourceCommands(
  cli: CAC,
  config: ResourceCommandConfig,
  action: (operation: string, id: string | undefined) => Promise<void>,
): void {
  for (const commandName of [config.name, ...(config.aliases ?? [])]) {
    cli
      .command(`${commandName} <operation> [id]`, `Run ${config.name} operation`)
      .action(async (operation: string, id: string | undefined) => {
        await action(operation, id);
      });
  }
}

export function registerResourceCli(cli: CAC): void {
  const courseConfig: ResourceCommandConfig = {
    aliases: ["crs"],
    infoPath: (id) => `course_${id}`,
    name: "course",
  };

  registerResourceCommands(cli, courseConfig, async (operation, id) => {
    await runPlaceholderResourceCommand(courseConfig, operation, id);
  });

  registerResourceCommands(cli, { name: "task" }, runTaskCommand);
}
