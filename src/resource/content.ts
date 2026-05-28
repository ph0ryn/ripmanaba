import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl, openUrl } from "../open.ts";
import {
  extractIdFromUrl,
  optionalText,
  parseAttachmentLinks,
  parseCourseHeaderSummary,
  parseDateTime,
  resolveUrl,
  type ElementSelection,
  textOf,
} from "./helpers.ts";

import type {
  AttachmentInfo,
  ContentInfoJson,
  ContentListItemJson,
  ContentPageInfo,
  ContentPageSummary,
  CourseSummary,
} from "./types.ts";
import type { CheerioAPI } from "cheerio";

const contentListPath = (courseId: string) => `/ct/course_${courseId}_page`;
const contentPathPattern = /\/ct\/page_([^_/?#]+)/;
const contentPagePathPattern = /\/ct\/page_[^_/?#]+_([^_/?#]+)/;

function extractContentId(url: string): string | undefined {
  return extractIdFromUrl(url, contentPathPattern);
}

function extractContentPageId(url: string): string | undefined {
  return extractIdFromUrl(url, contentPagePathPattern);
}

function parsePageCount(text: string): number | undefined {
  const match = /全\s*(\d+)\s*ページ/.exec(text);
  const rawPageCount = match?.[1];

  if (rawPageCount === undefined) {
    return undefined;
  }

  return Number.parseInt(rawPageCount, 10);
}

function parsePublishedRange(text: string): {
  publishedFrom?: string;
  publishedUntil?: string;
} {
  const match =
    /公開期間[：:]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\s*[~～]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/.exec(
      text,
    );

  return {
    publishedFrom: match?.[1],
    publishedUntil: match?.[2],
  };
}

function parseUpdatedAt(text: string): string | undefined {
  const match =
    /更新日時\s*[:：]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/.exec(text);

  return match?.[1] ?? parseDateTime(text);
}

function findContentAnchor(
  $: CheerioAPI,
  row: ElementSelection,
  baseUrl: string,
): ElementSelection | undefined {
  return row
    .find("a[href]")
    .toArray()
    .map((anchor) => $(anchor))
    .find((anchor) => {
      const href = anchor.attr("href");

      return href !== undefined && extractContentId(resolveUrl(href, baseUrl)) !== undefined;
    });
}

interface ParseContentListRowInput {
  $: CheerioAPI;
  baseUrl: string;
  course: CourseSummary;
  row: ElementSelection;
}

function parseContentListRow(input: ParseContentListRowInput): ContentListItemJson | undefined {
  const contentAnchor =
    findContentAnchor(input.$, input.row, input.baseUrl) ??
    input.row
      .find("a[href*='page_']")
      .toArray()
      .map((anchor) => input.$(anchor))
      .at(0);
  const href = contentAnchor?.attr("href");
  let title: string | undefined = undefined;

  if (contentAnchor !== undefined) {
    title = optionalText(contentAnchor.text());
  }

  if (href === undefined || title === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, input.baseUrl);
  const id = extractContentId(url);

  if (id === undefined) {
    return undefined;
  }

  const rowText = textOf(input.row);

  return {
    course: input.course,
    id,
    pageCount: parsePageCount(rowText),
    title,
    updatedAt: parseDateTime(rowText),
    url,
  };
}

export async function listContents(courseId: string): Promise<ContentListItemJson[]> {
  const origin = await getManabaOrigin();
  const listUrl = manabaPathToUrl(contentListPath(courseId), origin);
  const html = await fetchManabaText(listUrl);
  const $ = cheerio.load(html);
  const fallbackCourse: CourseSummary = {
    id: courseId,
    name: "",
    url: manabaPathToUrl(`/ct/course_${courseId}`, origin),
  };
  const course = parseCourseHeaderSummary($, fallbackCourse, { useHeaderNameFallback: true });
  const items: ContentListItemJson[] = [];

  $("table.contentslist")
    .first()
    .find("tr")
    .slice(1)
    .each((rowIndex, row) => {
      void rowIndex;
      const item = parseContentListRow({
        $,
        baseUrl: listUrl,
        course,
        row: $(row),
      });

      if (item !== undefined) {
        items.push(item);
      }
    });

  return items;
}

function parseContentTitle($: CheerioAPI): string | undefined {
  const selectors = [".contents-title", ".page-title", "h1", "h2"];

  for (const selector of selectors) {
    const title = optionalText($(selector).first().text());

    if (title !== undefined) {
      return title;
    }
  }

  return undefined;
}

function parsePages($: CheerioAPI, baseUrl: string): ContentPageSummary[] {
  const pages: ContentPageSummary[] = [];
  const seenUrls = new Set<string>();

  $("table.stdlist.contentspagelist a[href], table.contentspagelist a[href]").each(
    (anchorIndex, anchor) => {
      void anchorIndex;
      const selection = $(anchor);
      const href = selection.attr("href");
      const title = optionalText(selection.text());

      if (href === undefined || title === undefined) {
        return;
      }

      const url = resolveUrl(href, baseUrl);

      if (seenUrls.has(url)) {
        return;
      }

      seenUrls.add(url);

      pages.push({
        id: extractContentPageId(url),
        title,
        url,
      });
    },
  );

  return pages;
}

function parseContentAttachments($: CheerioAPI, baseUrl: string): AttachmentInfo[] {
  return parseAttachmentLinks($, {
    baseUrl,
    isAttachmentHref: (href) => href.includes("view=full"),
    parseUploadedAt: parseDateTime,
    source: $("body"),
    transformName: (name) => name.replace(/\s*-?\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}.*$/, ""),
  });
}

function parseCurrentPage(
  $: CheerioAPI,
  baseUrl: string,
  contentTitle: string,
): ContentPageInfo | undefined {
  const pageTitle =
    optionalText($(".contents-page-title, .page-title, h2").first().text()) ?? contentTitle;
  const attachments = parseContentAttachments($, baseUrl);
  const pageUrl = baseUrl;
  const page: ContentPageInfo = {
    attachments,
    id: extractContentPageId(pageUrl),
    title: pageTitle,
    url: pageUrl,
  };
  const documentText = textOf($("body"));
  const range = parsePublishedRange(documentText);

  page.publishedFrom = range.publishedFrom;
  page.publishedUntil = range.publishedUntil;
  page.updatedAt = parseUpdatedAt(documentText);
  page.versionLabel = /(\d+(?:\.\d+)?版)/.exec(documentText)?.[1];

  const updatedByMatch = /更新者\s*[:：]\s*(\S+)/.exec(documentText);

  page.updatedBy = updatedByMatch?.[1];

  if (attachments.length === 0 && page.id === undefined && pageTitle === contentTitle) {
    return undefined;
  }

  return page;
}

export async function getContentInfo(id: string): Promise<ContentInfoJson> {
  const origin = await getManabaOrigin();
  const url = manabaPathToUrl(`page_${id}`, origin);
  const html = await fetchManabaText(url);
  const $ = cheerio.load(html);
  const documentText = textOf($("body"));
  const title = parseContentTitle($) ?? id;
  const range = parsePublishedRange(documentText);

  return {
    course: parseCourseHeaderSummary($, { id: "", name: "", url }, { useHeaderNameFallback: true }),
    currentPage: parseCurrentPage($, url, title),
    id,
    pages: parsePages($, url),
    publishedFrom: range.publishedFrom,
    publishedUntil: range.publishedUntil,
    resource: "content",
    title,
    updatedAt: parseUpdatedAt(documentText),
    url,
  };
}

export async function openContent(id: string): Promise<void> {
  const origin = await getManabaOrigin();

  await openUrl(manabaPathToUrl(`page_${id}`, origin));
}
