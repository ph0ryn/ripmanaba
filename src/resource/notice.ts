import * as cheerio from "cheerio";

import { fetchManabaText, getManabaOrigin } from "../http.ts";
import { manabaPathToUrl, openUrl } from "../open.ts";

import type { NoticeInfoJson, NoticeListItemJson } from "./types.ts";
import type { CheerioAPI } from "cheerio";

const homePath = "/ct/home";
const noticePathPattern = /\/ct\/home_campusnews_([^/?#]+)/;

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

function extractNoticeId(url: string): string | undefined {
  return noticePathPattern.exec(pathFromUrl(url))?.[1];
}

function parseDateTime(text: string): string | undefined {
  return /\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/.exec(text)?.[0];
}

function findNoticeTable($: CheerioAPI): ElementSelection {
  const blocks = $("body *")
    .toArray()
    .map((element) => $(element))
    .filter((element) => textOf(element).startsWith("お知らせ"));

  for (const block of blocks) {
    const table = block.find("table").first();

    if (table.length > 0) {
      return table;
    }
  }

  return $("a[href*='home_campusnews_']").first().closest("table");
}

function parseNoticeListRow(
  $: CheerioAPI,
  row: ElementSelection,
  baseUrl: string,
): NoticeListItemJson | undefined {
  const anchor = row
    .find("a[href]")
    .toArray()
    .map((element) => $(element))
    .find((candidate) => {
      const href = candidate.attr("href");

      return href !== undefined && extractNoticeId(resolveUrl(href, baseUrl)) !== undefined;
    });
  const href = anchor?.attr("href");
  let title: string | undefined = undefined;

  if (anchor !== undefined) {
    title = optionalText(anchor.text());
  }

  if (href === undefined || title === undefined) {
    return undefined;
  }

  const url = resolveUrl(href, baseUrl);
  const id = extractNoticeId(url);

  if (id === undefined) {
    return undefined;
  }

  return {
    id,
    publishedAt: parseDateTime(textOf(row)),
    title,
    url,
  };
}

export async function listNotices(): Promise<NoticeListItemJson[]> {
  const origin = await getManabaOrigin();
  const listUrl = manabaPathToUrl(homePath, origin);
  const html = await fetchManabaText(listUrl);
  const $ = cheerio.load(html);
  const table = findNoticeTable($);
  const items: NoticeListItemJson[] = [];

  table.find("tr").each((rowIndex, row) => {
    void rowIndex;
    const item = parseNoticeListRow($, $(row), listUrl);

    if (item !== undefined) {
      items.push(item);
    }
  });

  return items;
}

function parseNoticeTitle(frame: ElementSelection): string | undefined {
  const title =
    optionalText(frame.find(".centernews_title, .news-title, h1, h2").first().text()) ??
    optionalText(frame.children().first().text());

  if (title === undefined || parseDateTime(title) !== undefined) {
    return undefined;
  }

  return title;
}

function parseUpdatedAt(text: string): string | undefined {
  return /最終更新\s*[:：]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/.exec(
    text,
  )?.[1];
}

function parseBodyText(frame: ElementSelection): string {
  const clone = frame.clone();

  clone.find(".centernews_title, .news-title, h1, h2").first().remove();

  const text = clone
    .text()
    .replace(/^\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*/, "")
    .replace(
      /\s*最終更新[\s\u00a0:：]*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/,
      "",
    );
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.join("\n");
}

export async function getNoticeInfo(id: string): Promise<NoticeInfoJson> {
  const origin = await getManabaOrigin();
  const url = manabaPathToUrl(`home_campusnews_${id}`, origin);
  const html = await fetchManabaText(url);
  const $ = cheerio.load(html);
  const frame = $(".centernews_frame.tpanel_frame").first();
  let source = $("body");

  if (frame.length > 0) {
    source = frame;
  }

  const text = textOf(source);

  return {
    bodyText: parseBodyText(source),
    id,
    publishedAt: parseDateTime(text),
    resource: "notice",
    title: parseNoticeTitle(source) ?? id,
    updatedAt: parseUpdatedAt(text),
    url,
  };
}

export async function openNotice(id: string): Promise<void> {
  const origin = await getManabaOrigin();

  await openUrl(manabaPathToUrl(`home_campusnews_${id}`, origin));
}
