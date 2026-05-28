import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl, openUrl } from "../open.ts";

import type {
  AttachmentInfo,
  CourseSummary,
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
const courseIdPattern = /\/ct\/course_([^_/?#]+)/;
const taskPathPattern = /\/ct\/course_[^_]+_(report|query|survey)_([^/?#]+)/;

type ElementSelection = ReturnType<CheerioAPI>;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function optionalText(text: string): string | undefined {
  const normalized = normalizeText(text);

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function textOf(element: ElementSelection): string {
  return normalizeText(element.text());
}

function resolveUrl(rawHref: string, baseUrl: string): string {
  return new URL(rawHref, baseUrl).toString();
}

function pathFromUrl(url: string): string {
  const parsed = new URL(url);

  return `${parsed.pathname}${parsed.search}`;
}

function extractCourseId(url: string): string | undefined {
  return courseIdPattern.exec(pathFromUrl(url))?.[1];
}

function parseTaskPath(url: string): { id: string; kind: TaskKind } | undefined {
  const match = taskPathPattern.exec(pathFromUrl(url));

  if (match === null) {
    return undefined;
  }

  const rawKind = match[1];
  const id = match[2];

  if (id === undefined) {
    return undefined;
  }

  if (rawKind === "report") {
    return { id, kind: "report" };
  }

  if (rawKind === "query") {
    return { id, kind: "quiz" };
  }

  if (rawKind === "survey") {
    return { id, kind: "survey" };
  }

  return undefined;
}

function findTaskDetailAnchor($: CheerioAPI, row: ElementSelection): ElementSelection | undefined {
  const anchors = row.find("a").toArray();

  for (const anchor of anchors) {
    const selection = $(anchor);
    const href = selection.attr("href");

    if (href !== undefined && /course_[^_]+_(report|query|survey)_[^/?#]+/.test(href)) {
      return selection;
    }
  }

  return undefined;
}

function parseCourseSummary(anchor: ElementSelection, baseUrl: string): CourseSummary | undefined {
  const href = anchor.attr("href");

  if (href === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, baseUrl);
  const id = extractCourseId(url);

  if (id === undefined) {
    return undefined;
  }

  return {
    id,
    name: textOf(anchor),
    url,
  };
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

  const detailAnchor = findTaskDetailAnchor($, row);

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

export async function listTasks(): Promise<TaskListItemJson[]> {
  const origin = await getManabaOrigin();
  const listUrl = manabaPathToUrl(taskListPath, origin);
  const html = await fetchManabaText(listUrl);
  const $ = cheerio.load(html);
  const items: TaskListItemJson[] = [];

  $("table.stdlist")
    .first()
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

async function findTaskListItem(id: string): Promise<TaskListItemJson> {
  const items = await listTasks();
  const item = items.find((candidate) => candidate.id === id);

  if (item === undefined) {
    throw new Error(`Task ${id} was not found in the unsubmitted task list.`);
  }

  return item;
}

function parseCourseHeader($: CheerioAPI, fallbackCourse: CourseSummary): CourseSummary {
  const header = $(".pageheader-course").first();
  const nameAnchor = header.find(".pageheader-course-coursename a").first();
  const href = nameAnchor.attr("href");

  if (href === undefined) {
    return fallbackCourse;
  }

  const url = resolveUrl(href, fallbackCourse.url);
  const id = extractCourseId(url);

  if (id === undefined) {
    return fallbackCourse;
  }

  return {
    id,
    name: textOf(nameAnchor),
    url,
  };
}

function parseDetailRows(
  $: CheerioAPI,
  table: ElementSelection,
): { title: string; fields: Map<string, ElementSelection> } {
  const rows = table.find("tr");
  const title = textOf(rows.first());
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

  const attachments: AttachmentInfo[] = [];
  const seenUrls = new Set<string>();

  field.find("a[href]").each((anchorIndex, anchor) => {
    void anchorIndex;
    const selection = $(anchor);
    const href = selection.attr("href");
    const name = optionalText(selection.text());

    if (href === undefined || name === undefined) {
      return;
    }

    const url = resolveUrl(href, baseUrl);

    if (seenUrls.has(url)) {
      return;
    }

    seenUrls.add(url);
    attachments.push({ name, url });
  });

  return attachments;
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
  listItem: TaskListItemJson;
  title: string;
}

function createTaskBase(input: CreateTaskBaseInput): TaskBaseInfoJson {
  const statusLabel = firstFieldText(input.fields, ["状態"]);

  return {
    attachments: parseAttachments(input.$, input.fields.get("添付ファイル"), input.listItem.url),
    course: parseCourseHeader(input.$, input.listItem.course),
    description: firstFieldText(input.fields, ["課題に関する説明"]),
    endsAt: firstFieldText(input.fields, ["受付終了日時"]),
    id: input.listItem.id,
    kind: input.listItem.kind,
    resource: "task",
    startsAt: firstFieldText(input.fields, ["受付開始日時"]),
    status: parseStatus(statusLabel),
    submission: parseSubmission(statusLabel),
    title: input.title,
    url: input.listItem.url,
  };
}

export async function getTaskInfo(id: string): Promise<TaskInfoJson> {
  const listItem = await findTaskListItem(id);
  const html = await fetchManabaText(listItem.url);
  const $ = cheerio.load(html);
  const table = $("table.stdlist-report, table.stdlist-query").first();

  if (table.length === 0) {
    throw new Error(`Task ${id} detail table was not found.`);
  }

  const { fields, title } = parseDetailRows($, table);
  const base = createTaskBase({ $, fields, listItem, title });

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

export async function openTask(id: string): Promise<void> {
  const item = await findTaskListItem(id);

  await openUrl(item.url);
}
