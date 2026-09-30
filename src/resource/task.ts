import * as cheerio from "cheerio";

import {
  optionalText,
  parseAttachmentLinks,
  parseCourseHeaderSummary,
  parseCourseSummary,
  pathFromUrl,
  ResourceParseError,
  resolveUrl,
  type ElementSelection,
  textOf,
} from "./helpers.ts";

import type { ManabaClient } from "../http.ts";
import type {
  AttachmentInfo,
  ReportTaskInfoJson,
  SurveyTaskInfoJson,
  TaskBaseInfoJson,
  TaskInfoJson,
  TaskKind,
  TaskListItemJson,
  TaskStatus,
} from "./types.ts";
import type { CheerioAPI } from "cheerio";

const taskListPath = "/ct/home_library_query";
const taskPathPattern = /\/ct\/course_([^_/?#]+)_(report|query|survey)_([^/?#]+)(?:[?#].*)?$/;
const taskIdPattern = /^([^_]+)_(report|query|survey)_(.+)$/;

interface ParsedTaskPath {
  courseId: string;
  id: string;
  kind: TaskKind;
  taskId: string;
}

function taskKindFromSegment(segment: string): TaskKind | undefined {
  if (segment === "report") {
    return "report";
  }

  if (segment === "query") {
    return "quiz";
  }

  if (segment === "survey") {
    return "survey";
  }

  return undefined;
}

function parseTaskPath(url: string): ParsedTaskPath | undefined {
  const match = taskPathPattern.exec(pathFromUrl(url));

  if (match === null) {
    return undefined;
  }

  const courseId = match[1];
  const rawKind = match[2];
  const taskId = match[3];

  if (courseId === undefined || rawKind === undefined || taskId === undefined) {
    return undefined;
  }

  const kind = taskKindFromSegment(rawKind);

  if (kind === undefined) {
    return undefined;
  }

  return {
    courseId,
    id: `${courseId}_${rawKind}_${taskId}`,
    kind,
    taskId,
  };
}

function parseTaskId(id: string): ParsedTaskPath | undefined {
  const match = taskIdPattern.exec(id);

  if (match === null) {
    return undefined;
  }

  const courseId = match[1];
  const rawKind = match[2];
  const taskId = match[3];

  if (courseId === undefined || rawKind === undefined || taskId === undefined) {
    return undefined;
  }

  const kind = taskKindFromSegment(rawKind);

  if (kind === undefined) {
    return undefined;
  }

  return {
    courseId,
    id,
    kind,
    taskId,
  };
}

function findTaskDetailAnchor(
  $: CheerioAPI,
  row: ElementSelection,
  baseUrl: string,
): ElementSelection | undefined {
  const anchors = row.find("a").toArray();

  for (const anchor of anchors) {
    const selection = $(anchor);
    const href = selection.attr("href");

    if (href !== undefined && parseTaskPath(resolveUrl(href, baseUrl)) !== undefined) {
      return selection;
    }
  }

  return undefined;
}

function parseTaskListRow(
  $: CheerioAPI,
  row: ElementSelection,
  baseUrl: string,
): TaskListItemJson | undefined {
  const cells = row.find("td");

  if (cells.length < 6) {
    return undefined;
  }

  const detailAnchor = findTaskDetailAnchor($, row, baseUrl);

  if (detailAnchor === undefined) {
    return undefined;
  }

  const href = detailAnchor.attr("href");

  if (href === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, baseUrl);
  const parsedTask = parseTaskPath(url);

  if (parsedTask === undefined) {
    return undefined;
  }

  const courseAnchor = cells.eq(2).find("a").first();
  const course = parseCourseSummary(courseAnchor, baseUrl);

  if (course === undefined) {
    return undefined;
  }

  return {
    course,
    endsAt: optionalText(cells.eq(4).text()),
    id: parsedTask.id,
    kind: parsedTask.kind,
    periodLabel: optionalText(cells.eq(5).text()),
    startsAt: optionalText(cells.eq(3).text()),
    title: textOf(detailAnchor),
    url,
  };
}

export async function listTasks(client: ManabaClient): Promise<TaskListItemJson[]> {
  const listUrl = new URL(taskListPath, client.origin).toString();
  const html = await client.getText(listUrl);
  const $ = cheerio.load(html);
  const table = $("table.stdlist").first();

  if (table.length === 0) {
    throw new ResourceParseError("task", "task list table was not found");
  }

  const items: TaskListItemJson[] = [];

  table
    .find("tr")
    .slice(1)
    .each((rowIndex, row) => {
      void rowIndex;
      const item = parseTaskListRow($, $(row), listUrl);

      if (item !== undefined) {
        items.push(item);
      }
    });

  return items;
}

function parseDetailRows(
  $: CheerioAPI,
  table: ElementSelection,
): { title: string; fields: Map<string, ElementSelection> } {
  const rows = table.find("tr");

  if (rows.length === 0) {
    throw new ResourceParseError("task", "task detail table has no rows");
  }

  const title = optionalText(rows.first().text());

  if (title === undefined) {
    throw new ResourceParseError("task", "task detail title is empty");
  }

  const fields = new Map<string, ElementSelection>();

  rows.slice(1).each((rowIndex, row) => {
    void rowIndex;
    const cells = $(row).find("th,td");
    const label = textOf(cells.first());
    const value = cells.eq(1);

    if (label.length > 0 && value.length > 0) {
      fields.set(label, value);
    }
  });

  return { fields, title };
}

function firstFieldText(fields: Map<string, ElementSelection>, labels: string[]) {
  for (const label of labels) {
    const value = fields.get(label);

    if (value !== undefined) {
      return optionalText(value.text());
    }
  }

  return undefined;
}

function parseStatus(statusLabel: string | undefined): TaskStatus {
  if (statusLabel === undefined) {
    return "unknown";
  }

  if (statusLabel.includes("提出済") || statusLabel.includes("提出しました")) {
    return "submitted";
  }

  if (statusLabel.includes("受付中")) {
    return "open";
  }

  if (statusLabel.includes("受付終了")) {
    return "closed";
  }

  if (statusLabel.includes("受付前")) {
    return "notStarted";
  }

  return "unknown";
}

function parseSubmission(statusLabel: string | undefined): TaskBaseInfoJson["submission"] {
  if (statusLabel === undefined) {
    return { submitted: false };
  }

  const submitted = statusLabel.includes("提出済") || statusLabel.includes("提出しました");

  return {
    message: statusLabel,
    submitted,
  };
}

function parseAttachments(
  $: CheerioAPI,
  field: ElementSelection | undefined,
  baseUrl: string,
): AttachmentInfo[] {
  if (field === undefined) {
    return [];
  }

  return parseAttachmentLinks($, {
    baseUrl,
    source: field,
  });
}

function parseReportUpload($: CheerioAPI): ReportTaskInfoJson["upload"] {
  const enabled = $("input[name=action_ReportStudent_submitdone]").length > 0;

  return {
    enabled,
  };
}

function parseResubmissionAllowed(label: string | undefined): boolean | undefined {
  if (label === undefined) {
    return undefined;
  }

  if (label.includes("許可しない")) {
    return false;
  }

  if (label.includes("許可")) {
    return true;
  }

  return undefined;
}

interface CreateTaskBaseInput {
  $: CheerioAPI;
  fields: Map<string, ElementSelection>;
  task: ParsedTaskPath;
  url: string;
  title: string;
}

function createTaskBase(input: CreateTaskBaseInput): TaskBaseInfoJson {
  const statusLabel = firstFieldText(input.fields, ["状態"]);

  return {
    attachments: parseAttachments(input.$, input.fields.get("添付ファイル"), input.url),
    course: parseCourseHeaderSummary(input.$, input.url, "task"),
    description: firstFieldText(input.fields, ["課題に関する説明"]),
    endsAt: firstFieldText(input.fields, ["受付終了日時"]),
    id: input.task.id,
    kind: input.task.kind,
    resource: "task",
    startsAt: firstFieldText(input.fields, ["受付開始日時"]),
    status: parseStatus(statusLabel),
    submission: parseSubmission(statusLabel),
    title: input.title,
    url: input.url,
  };
}

export async function getTaskInfo(client: ManabaClient, id: string): Promise<TaskInfoJson> {
  const task = parseTaskId(id);

  if (task === undefined) {
    throw new Error(`Task id must be <course-id>_<report|query|survey>_<task-id>: ${id}`);
  }

  const url = new URL(`/ct/course_${id}`, client.origin).toString();
  const html = await client.getText(url);
  const $ = cheerio.load(html);
  let table = $("table.stdlist-report").first();

  if (task.kind === "quiz" || task.kind === "survey") {
    table = $("table.stdlist-query").first();
  }

  if (table.length === 0) {
    throw new ResourceParseError("task", `detail table was not found for ${id}`);
  }

  const { fields, title } = parseDetailRows($, table);
  const base = createTaskBase({ $, fields, task, title, url });

  if (base.kind === "report") {
    return {
      ...base,
      kind: "report",
      portfolioSetting: firstFieldText(fields, ["ポートフォリオ / 閲覧設定", "ポートフォリオ"]),
      prompt: firstFieldText(fields, ["問題"]),
      resubmissionAllowed: parseResubmissionAllowed(
        firstFieldText(fields, ["学生による再提出の許可"]),
      ),
      upload: parseReportUpload($),
    };
  }

  if (base.kind === "quiz") {
    const timeLimitLabel = firstFieldText(fields, ["制限時間"]);

    return {
      ...base,
      canAnswerAfterTimeLimit: timeLimitLabel?.includes("制限時間を超えて回答可"),
      gradingResultAndCorrectAnswerDisclosure: firstFieldText(fields, ["採点結果と正解の公開"]),
      kind: "quiz",
      portfolioSetting: firstFieldText(fields, ["ポートフォリオ"]),
      timeLimitLabel,
    };
  }

  const survey: SurveyTaskInfoJson = {
    ...base,
    kind: "survey",
    portfolioSetting: firstFieldText(fields, ["ポートフォリオ"]),
  };

  return survey;
}
