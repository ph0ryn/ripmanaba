import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getContentInfo, listContents } from "../src/resource/content.ts";
import { getCourseInfo, listCourses } from "../src/resource/course.ts";
import { getNoticeInfo, listNotices } from "../src/resource/notice.ts";
import { getSubmissionInfo, listSubmissions } from "../src/resource/submission.ts";
import { getTaskInfo, listTasks } from "../src/resource/task.ts";
import { listCourseUpdates } from "../src/resource/updates.ts";

import type { ManabaClient } from "../src/http.ts";

class FixtureClient implements ManabaClient {
  readonly origin = "https://mgu.example";
  private readonly fixtures: Record<string, string>;

  constructor(fixtures: Record<string, string>) {
    this.fixtures = fixtures;
  }

  async getText(pathOrUrl: string): Promise<string> {
    const url = new URL(pathOrUrl, this.origin);
    const key = `${url.pathname}${url.search}`;
    const fixture = this.fixtures[key];

    if (fixture === undefined) {
      throw new Error(`Missing fixture: ${key}`);
    }

    return fixture;
  }
}

async function fixture(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

test("course ls returns the observed course list JSON", async () => {
  const client = new FixtureClient({
    "/ct/home_course": await fixture("course-list.html"),
  });

  assert.deepEqual(await listCourses(client), [
    {
      id: "2766689",
      instructors: ["ｵﾙｶﾞ"],
      name: "EEISS321環境の経済学1",
      schedule: "水2",
      term: "春学期",
      url: "https://mgu.example/ct/course_2766689",
      year: "2026",
    },
  ]);
});

test("course info rejects a page without a course header", async () => {
  const client = new FixtureClient({ "/ct/course_2766689": "<html><body>login</body></html>" });

  await assert.rejects(() => getCourseInfo(client, "2766689"), /course header was not found/);
});

test("course info preserves the page-level course data", async () => {
  const client = new FixtureClient({
    "/ct/course_2766689": await fixture("course-info.html"),
  });

  assert.deepEqual(await getCourseInfo(client, "2766689"), {
    courseCode: "1FC0110000",
    id: "2766689",
    instructors: ["ｵﾙｶﾞ"],
    name: "EEISS321環境の経済学1",
    news: { empty: true, items: [] },
    recentContents: [
      {
        id: "2940479c2766689",
        title: "環境の経済学１",
        url: "https://mgu.example/ct/page_2940479c2766689",
      },
    ],
    recentTopics: [
      {
        id: "6",
        title: "小テストについて",
        url: "https://mgu.example/ct/course_2766689_topics_6_tflat",
      },
    ],
    resource: "course",
    schedule: "水2",
    term: "春学期",
    url: "https://mgu.example/ct/course_2766689",
    year: "2026",
  });
});

test("task ls and task info use the injected client", async () => {
  const listClient = new FixtureClient({
    "/ct/home_library_query": await fixture("task-list.html"),
  });

  const items = await listTasks(listClient);
  const [item] = items;

  assert.ok(item);

  assert.equal(item.id, "2766776_report_3008513");
  assert.equal(item.kind, "report");
  assert.equal(item.course.id, "2766776");

  const detailClient = new FixtureClient({
    "/ct/course_2766776_report_3008513": await fixture("task-report.html"),
  });

  assert.equal((await getTaskInfo(detailClient, "2766776_report_3008513")).status, "open");
});

test("task info shows a task that is absent from the unsubmitted list", async () => {
  const client = new FixtureClient({
    "/ct/course_2766776_report_3008513": (await fixture("task-report.html")).replace(
      "受付中",
      "提出済み",
    ),
  });

  const info = await getTaskInfo(client, "2766776_report_3008513");

  assert.equal(info.id, "2766776_report_3008513");
  assert.equal(info.kind, "report");
  assert.equal(info.status, "submitted");
});

test("task info rejects the legacy bare task id", async () => {
  const client = new FixtureClient({});

  await assert.rejects(
    () => getTaskInfo(client, "3008513"),
    /Task id must be <course-id>_<report\|query\|survey>_<task-id>/,
  );
});

test("survey details retain the query table parser", async () => {
  const client = new FixtureClient({
    "/ct/course_2766776_survey_3008514": await fixture("task-survey.html"),
  });

  const info = await getTaskInfo(client, "2766776_survey_3008514");

  assert.equal(info.id, "2766776_survey_3008514");
  assert.equal(info.kind, "survey");
  assert.equal(info.status, "open");
});

test("content info accepts a content/page composite id", async () => {
  const client = new FixtureClient({
    "/ct/page_2940479c2766689": await fixture("content-root.html"),
    "/ct/page_2940479c2766689_3222717961": await fixture("content-page.html"),
  });

  const root = await getContentInfo(client, "2940479c2766689");
  const page = await getContentInfo(client, "2940479c2766689_3222717961");
  const currentPage = page.currentPage;

  assert.ok(currentPage);

  assert.equal(root.pages[0]?.id, "2940479c2766689_3222717961");
  const [attachment] = currentPage.attachments;

  assert.ok(attachment);

  assert.equal(root.currentPage, undefined);
  assert.equal(page.id, "2940479c2766689_3222717961");
  assert.equal(currentPage.id, "2940479c2766689_3222717961");
  assert.equal(attachment.name, "file.pdf");
  assert.equal(attachment.uploadedAt, "2026-04-07 16:19:51");
});

test("content ls returns the course content rows", async () => {
  const client = new FixtureClient({
    "/ct/course_2766689_page": await fixture("content-list.html"),
  });
  const items = await listContents(client, "2766689");

  assert.deepEqual(items, [
    {
      course: {
        id: "2766689",
        name: "EEISS321環境の経済学1",
        url: "https://mgu.example/ct/course_2766689",
      },
      id: "2940479c2766689",
      pageCount: 7,
      title: "環境の経済学１",
      updatedAt: "2026-05-26 23:53",
      url: "https://mgu.example/ct/page_2940479c2766689",
    },
  ]);
});

test("content ls requires the observed list table", async () => {
  const client = new FixtureClient({
    "/ct/course_2766689_page": "<html><body><div class='pageheader-course'></div></body></html>",
  });

  await assert.rejects(() => listContents(client, "2766689"), /content list table was not found/);
});

test("notice list and info parse the observed home and detail frames", async () => {
  const client = new FixtureClient({
    "/ct/home": await fixture("notice-home.html"),
    "/ct/home_campusnews_2590422": await fixture("notice-detail.html"),
  });

  assert.equal((await listNotices(client))[0]?.id, "2590422");
  const info = await getNoticeInfo(client, "2590422");

  assert.equal(info.title, "重要なお知らせ");
  assert.match(info.bodyText, /本文です。/);
  assert.match(info.bodyText, /次の行です。/);
});

test("submission query paths and quiz labels produce quiz records", async () => {
  const client = new FixtureClient({ "/ct/home_submitlog": await fixture("submission-list.html") });
  const items = await listSubmissions(client);
  const [first, second] = items;

  assert.ok(first);
  assert.ok(second);

  assert.equal(items.length, 2);
  assert.equal(first.kind, "quiz");
  assert.equal(first.id, "2766977-query-2935448-2026-04-12-01-56");
  assert.equal(second.kind, "quiz");
  assert.equal(second.submittedAt, "2026-04-12 02:10");
  assert.equal((await getSubmissionInfo(client, first.id)).resource, "submission");
});

test("new merges active statuses from duplicate course rows", async () => {
  const client = new FixtureClient({ "/ct/home": await fixture("new-home.html") });
  const items = await listCourseUpdates(client);

  assert.deepEqual(items, [
    {
      course: {
        id: "2766689",
        name: "環境の経済学1",
        url: "https://mgu.example/ct/course_2766689",
      },
      kinds: ["news", "deadline"],
    },
  ]);
});
