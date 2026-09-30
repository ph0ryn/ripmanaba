import * as cheerio from "cheerio";

import {
  extractIdFromUrl,
  manabaPathToUrl,
  optionalText,
  parseDateTime,
  ResourceParseError,
  resolveUrl,
  type ElementSelection,
  textOf,
} from "./helpers.ts";

import type { ManabaClient } from "../http.ts";
import type { NoticeInfoJson, NoticeListItemJson } from "./types.ts";
import type { CheerioAPI } from "cheerio";

const homePath = "/ct/home";
const noticePathPattern = /\/ct\/home_campusnews_([^/?#]+)/;

function extractNoticeId(url: string): string | undefined {
  return extractIdFromUrl(url, noticePathPattern);
}

function findNoticeTable($: CheerioAPI): ElementSelection | undefined {
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

  const fallback = $("a[href*='home_campusnews_']").first().closest("table");

  if (fallback.length > 0) {
    return fallback;
  }

  return undefined;
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

export async function listNotices(client: ManabaClient): Promise<NoticeListItemJson[]> {
  const origin = client.origin;
  const listUrl = manabaPathToUrl(homePath, origin);
  const html = await client.getText(listUrl);
  const $ = cheerio.load(html);
  const table = findNoticeTable($);

  if (table === undefined) {
    const body = textOf($("body"));

    if (/お知らせ(?:は|が)ありません/.test(body)) {
      return [];
    }

    throw new ResourceParseError("notice", "notice list structure was not found");
  }

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
  const title = optionalText(frame.find(".centernews_title, .news-title, h1, h2").first().text());

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
  clone.find("br").replaceWith("\n");

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

export async function getNoticeInfo(client: ManabaClient, id: string): Promise<NoticeInfoJson> {
  const origin = client.origin;
  const url = manabaPathToUrl(`home_campusnews_${id}`, origin);
  const html = await client.getText(url);
  const $ = cheerio.load(html);
  const frame = $(".centernews_frame.tpanel_frame").first();

  if (frame.length === 0) {
    throw new ResourceParseError("notice", "notice detail frame was not found");
  }

  const text = textOf(frame);
  const title = parseNoticeTitle(frame);

  if (title === undefined) {
    throw new ResourceParseError("notice", "notice title was not found");
  }

  return {
    bodyText: parseBodyText(frame),
    id,
    publishedAt: parseDateTime(text),
    resource: "notice",
    title,
    updatedAt: parseUpdatedAt(text),
    url,
  };
}
