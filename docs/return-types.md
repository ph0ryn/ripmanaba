# JSON Type Definitions

## 方針

`ripmanaba <resource> info <id>` と `ripmanaba <resource> ls` が返す
JSONのTypeScript型を定義する。

ここでは、原則として対象resourceの詳細画面または対象resourceの一覧画面1ペー
ジから取得できる情報だけを含める。別ページへの追加アクセスが必要な集計値や派
生情報は含めない。

`info` は対象resourceの詳細を返す。`ls` は `info` を実行するためのIDと、一覧
画面に表示されている最小限の補助情報を返す。複数ページを横断して集約しない。

対象resourceは、`docs/cli-command-design.md` でCLI実装対象として扱うものに絞
る。

## 共通型

```ts
export type ManabaPath = `/ct/${string}`;

export type DateTimeString = string;

export type AttachmentInfo = {
  name: string;
  path: ManabaPath | string;
  uploadedAt?: DateTimeString;
};

export type CourseSummary = {
  id: string;
  name: string;
  path: ManabaPath;
};
```

## ls共通

`ls` は一覧画面1ページから取得できる行をそのまま薄く正規化する。
返り値はラップしない配列とする。該当行がない場合は空配列を返す。

## course ls

`course ls` はコース一覧画面のリスト表示から取得できる情報を返す。

```ts
export type CourseListItemJson = CourseSummary & {
  year?: string;
  term?: string;
  schedule?: string;
  instructors: string[];
  favorite?: boolean;
};
```

例:

```json
[
  {
    "id": "2766689",
    "name": "EEISS321環境の経済学1",
    "path": "/ct/course_2766689",
    "year": "2026",
    "term": "春学期",
    "schedule": "水2",
    "instructors": ["ｵﾙｶﾞ"]
  }
]
```

## task ls

`task ls` は未提出課題一覧画面から取得できる情報を返す。詳細画面は開かないた
め、課題本文、提出状態、添付ファイルなどは含めない。

```ts
export type TaskListItemJson = {
  id: string;
  kind: TaskKind;
  title: string;
  path: ManabaPath;
  course: CourseSummary;
  startsAt?: DateTimeString;
  endsAt?: DateTimeString;
  periodLabel?: string;
};
```

例:

```json
[
  {
    "id": "3004447",
    "kind": "quiz",
    "title": "環境の経済学I（小テスト）",
    "path": "/ct/course_2766689_query_3004447",
    "course": {
      "id": "2766689",
      "name": "EEISS321環境の経済学1",
      "path": "/ct/course_2766689"
    },
    "startsAt": "2026-05-22 23:55",
    "endsAt": "2026-05-31 23:55",
    "periodLabel": "2026-05-22 23:55 ～ 2026-05-31 23:55"
  }
]
```

## content ls

`content ls` はコース内のコンテンツ一覧画面1ページから取得できる情報を返す。
コースを横断してコンテンツを集約しない。

```ts
export type ContentListItemJson = {
  id: string;
  title: string;
  path: ManabaPath;
  course: CourseSummary;
  pageCount?: number;
  updatedAt?: DateTimeString;
};
```

例:

```json
[
  {
    "id": "2940479c2766689",
    "title": "環境の経済学１",
    "path": "/ct/page_2940479c2766689",
    "course": {
      "id": "2766689",
      "name": "EEISS321環境の経済学1",
      "path": "/ct/course_2766689"
    },
    "pageCount": 7,
    "updatedAt": "2026-05-26 23:53"
  }
]
```

## notice ls

`notice ls` はホーム画面のお知らせ欄から取得できる全体お知らせの情報を返す。
コースニュースは含めない。

```ts
export type NoticeListItemJson = {
  id: string;
  title: string;
  path: ManabaPath;
  publishedAt?: DateTimeString;
};
```

例:

```json
[
  {
    "id": "2590422",
    "title": "【重要】manaba および 教務Web のログイン仕様変更（多要素認証開始のご案内）",
    "path": "/ct/home_campusnews_2590422",
    "publishedAt": "2025-05-14"
  }
]
```

## submission ls

`submission ls` は提出記録画面の現在表示されている1ページから取得できる情報を
返す。前後ページや期間違いのページを横断して集約しない。

```ts
export type SubmissionListItemJson = {
  id: string;
  kind: SubmissionKind;
  title: string;
  path?: ManabaPath;
  course: CourseSummary;
  submittedAt: DateTimeString;
  statusLabel?: string;
};
```

例:

```json
[]
```

## course

`course info` はコース詳細画面から取得できる情報を返す。

```ts
export type CourseInfoJson = {
  resource: "course";
  id: string;
  path: ManabaPath;
  courseCode?: string;
  name: string;
  instructors: string[];
  year?: string;
  term?: string;
  schedule?: string;
  syllabusUrl?: string;
  news: {
    items: CourseNewsSummary[];
    empty: boolean;
  };
  recentTopics: TopicSummary[];
  recentContents: ContentSummary[];
};

export type CourseNewsSummary = {
  id?: string;
  title: string;
  publishedAt?: DateTimeString;
  path?: ManabaPath;
};

export type TopicSummary = {
  id: string;
  title: string;
  path: ManabaPath;
  updatedAt?: DateTimeString;
};

export type ContentSummary = {
  id: string;
  title: string;
  path: ManabaPath;
  updatedAt?: DateTimeString;
  pageCount?: number;
};
```

例:

```json
{
  "resource": "course",
  "id": "2766689",
  "path": "/ct/course_2766689",
  "courseCode": "1FC0110000",
  "name": "EEISS321環境の経済学1",
  "instructors": ["ｵﾙｶﾞ"],
  "year": "2026",
  "term": "春学期",
  "schedule": "水2",
  "syllabusUrl": "https://askyomu.meijigakuin.ac.jp/unias/UnSSOLoginControlFree?REQ_ACTION_DO=/AGA030PVI01Action.do?LSN_CD=1FC0110000&LSN_OPC_FCY=2026",
  "news": {
    "items": [],
    "empty": true
  },
  "recentTopics": [
    {
      "id": "6",
      "title": "小テストについて",
      "path": "/ct/course_2766689_topics_6_tflat"
    }
  ],
  "recentContents": [
    {
      "id": "2940479c2766689",
      "title": "環境の経済学１",
      "path": "/ct/page_2940479c2766689",
      "updatedAt": "2026-05-26 23:53"
    }
  ]
}
```

## task

`task info` はレポート、小テスト、アンケートなどの課題詳細画面から取得できる情
報を返す。課題種別ごとに表示項目が異なるため、共通部分と種別別の差分に分ける。

```ts
export type TaskInfoJson =
  | ReportTaskInfoJson
  | QuizTaskInfoJson
  | SurveyTaskInfoJson;

export type TaskKind = "report" | "quiz" | "survey";

export type TaskStatus = "notStarted" | "open" | "closed" | "submitted" | "unknown";

export type TaskBaseInfoJson = {
  resource: "task";
  id: string;
  kind: TaskKind;
  path: ManabaPath;
  title: string;
  course: CourseSummary;
  description?: string;
  startsAt?: DateTimeString;
  endsAt?: DateTimeString;
  status: TaskStatus;
  submission: {
    submitted: boolean;
    message?: string;
    submittedAt?: DateTimeString;
  };
  attachments: AttachmentInfo[];
};

export type ReportTaskInfoJson = TaskBaseInfoJson & {
  kind: "report";
  prompt?: string;
  portfolioSetting?: string;
  resubmissionAllowed?: boolean;
  upload: {
    enabled: boolean;
    maxFileSizeLabel?: string;
    selectedFileLabel?: string;
  };
};

export type QuizTaskInfoJson = TaskBaseInfoJson & {
  kind: "quiz";
  timeLimitLabel?: string;
  canAnswerAfterTimeLimit?: boolean;
  portfolioSetting?: string;
  gradingResultAndCorrectAnswerDisclosure?: string;
};

export type SurveyTaskInfoJson = TaskBaseInfoJson & {
  kind: "survey";
  portfolioSetting?: string;
};
```

レポート例:

```json
{
  "resource": "task",
  "id": "3008513",
  "kind": "report",
  "path": "/ct/course_2766776_report_3008513",
  "title": "第５回(5月２８日授業関連)",
  "course": {
    "id": "2766776",
    "name": "EEISS201経済の先端的問題1",
    "path": "/ct/course_2766776"
  },
  "prompt": "第１章でヒュームの議論として①「医者がもとで死亡する」、②「自然死」、③「暴力死」、の三つのシナリオを紹介している。第１章の冒頭に出てくるギリシャ危機は、この三つのうちのどれにあてはまるか？三つのいずれにもあてはまらない可能性や、複数のシナリオにあてはまる可能性も考慮して、理由をつけて、答えよ。",
  "startsAt": "2026-05-23 07:00",
  "endsAt": "2026-05-29 12:00",
  "status": "open",
  "submission": {
    "submitted": false,
    "message": "まだ提出していません"
  },
  "attachments": [],
  "portfolioSetting": "ポートフォリオに追加しない / 回収のみ行なう・コメント不可",
  "resubmissionAllowed": false,
  "upload": {
    "enabled": true,
    "maxFileSizeLabel": "１ファイルにつき 50Mバイトまで",
    "selectedFileLabel": "アップロードファイルが指定されていません。"
  }
}
```

小テスト例:

```json
{
  "resource": "task",
  "id": "3004447",
  "kind": "quiz",
  "path": "/ct/course_2766689_query_3004447",
  "title": "環境の経済学I（小テスト）",
  "course": {
    "id": "2766689",
    "name": "EEISS321環境の経済学1",
    "path": "/ct/course_2766689"
  },
  "description": "講義ノートや参考書を確認しながら、自分で考えて解いてください。\nこの小テストでは、答えが正しいかどうかだけでなく、自分なりに考えて解答しているかを重視します。（受付終了日時に注意してください）",
  "startsAt": "2026-05-22 23:55:00",
  "endsAt": "2026-05-31 23:55:00",
  "status": "open",
  "submission": {
    "submitted": false,
    "message": "まだ提出していません。"
  },
  "attachments": [],
  "timeLimitLabel": "30分間",
  "canAnswerAfterTimeLimit": true,
  "portfolioSetting": "回答を提出者のポートフォリオに追加しない",
  "gradingResultAndCorrectAnswerDisclosure": "受付終了時に正解のみ公開"
}
```

## content

`content info` はコースコンテンツ詳細画面から取得できる情報を返す。

```ts
export type ContentInfoJson = {
  resource: "content";
  id: string;
  path: ManabaPath;
  title: string;
  course: CourseSummary;
  publishedFrom?: DateTimeString;
  publishedUntil?: DateTimeString;
  updatedAt?: DateTimeString;
  currentPage?: ContentPageInfo;
  pages: ContentPageSummary[];
};

export type ContentPageInfo = {
  id?: string;
  title: string;
  path: ManabaPath;
  publishedFrom?: DateTimeString;
  publishedUntil?: DateTimeString;
  // manaba content pages use a custom rich text implementation, so body text is
  // intentionally not exposed until a stable extraction method is found.
  attachments: AttachmentInfo[];
  updatedAt?: DateTimeString;
  updatedBy?: string;
  versionLabel?: string;
};

export type ContentPageSummary = {
  id?: string;
  title: string;
  path: ManabaPath;
};
```

例:

```json
{
  "resource": "content",
  "id": "2940479c2766689",
  "path": "/ct/page_2940479c2766689",
  "title": "環境の経済学１",
  "course": {
    "id": "2766689",
    "name": "EEISS321環境の経済学1",
    "path": "/ct/course_2766689"
  },
  "publishedFrom": "2026-04-07 16:10",
  "publishedUntil": "2026-07-29 16:10",
  "updatedAt": "2026-05-26 23:53",
  "currentPage": {
    "id": "3222717961",
    "title": "環境の経済学第一回目の講義スライド",
    "path": "/ct/page_2940479c2766689_3222717961",
    "publishedFrom": "2026-04-07 16:10:00",
    "publishedUntil": "2026-07-29 16:10:00",
    "attachments": [
      {
        "name": "環境経済学第1回（2026）.pdf",
        "path": "/ct/page_2940479c2766689_3222717961_2940503/%E7%92%B0%E5%A2%83%E7%B5%8C%E6%B8%88%E5%AD%A6%E7%AC%AC1%E5%9B%9E%EF%BC%882026%EF%BC%89.pdf?view=full",
        "uploadedAt": "2026-04-07 16:19:51"
      }
    ],
    "updatedAt": "2026-05-26 23:55",
    "updatedBy": "ｵﾙｶﾞ",
    "versionLabel": "1.3版"
  },
  "pages": [
    {
      "id": "538409077",
      "title": "環境の経済学第７回（不確実性と政策選択）",
      "path": "/ct/page_2940479c2766689_538409077"
    },
    {
      "id": "269961513",
      "title": "環境の経済学第６回（排出量取引）",
      "path": "/ct/page_2940479c2766689_269961513"
    },
    {
      "id": "1612135122",
      "title": "環境の経済学第5回目講義（コースの定理）",
      "path": "/ct/page_2940479c2766689_1612135122"
    },
    {
      "id": "2685868069",
      "title": "環境の経済学第４回目講義スライド",
      "path": "/ct/page_2940479c2766689_2685868069"
    },
    {
      "id": "2965621",
      "title": "環境の経済学第３回講義スライド",
      "path": "/ct/page_2940479c2766689_2965621"
    },
    {
      "id": "2148979199",
      "title": "環境の経済学第２回目講義スライド",
      "path": "/ct/page_2940479c2766689_2148979199"
    },
    {
      "id": "3222717961",
      "title": "環境の経済学第一回目の講義スライド",
      "path": "/ct/page_2940479c2766689_3222717961"
    }
  ]
}
```

## notice

`notice info` は全体お知らせ詳細画面から取得できる情報を返す。コースニュースは
この型には含めない。

```ts
export type NoticeInfoJson = {
  resource: "notice";
  id: string;
  path: ManabaPath;
  title: string;
  publishedAt?: DateTimeString;
  bodyText: string;
  updatedAt?: DateTimeString;
};
```

例:

```json
{
  "resource": "notice",
  "id": "2590422",
  "path": "/ct/home_campusnews_2590422",
  "title": "【重要】manaba および 教務Web のログイン仕様変更（多要素認証開始のご案内）",
  "publishedAt": "2025-05-14 18:00",
  "bodyText": "皆様\n\n情報センターより、manaba および 教務Web のログイン仕様変更（多要素認証の導入）について、改めてご案内申し上げます。\nこの度、セキュリティ強化のため、下記の通り manaba および 教務Web への多要素認証の適用を開始いたします。\n\n！！既に認証方法をご登録いただいている方につきましては、追加のお手続きは不要です。！！\n\n■多要素認証開始スケジュール\n・manaba (LMS / 学習管理システム)：2025年5月19日（月）より適用開始\n・教務Web　　　　　　　　　　　　：2025年7月1日（火）より適用開始\n\n※多要素認証の認証方法をご登録いただいていない方は、お手数をおかけいたしますが、以下のオンラインガイドをご参照いただき、ご自身でご登録をお願いいたします。\n\n■多要素認証 オンラインガイド（登録手順を含む）\nhttps://tr.mguolg.info/i00/mfa\n\n設定方法にご不明な点がある場合や、サポートが必要な場合は、情報センター窓口までお気軽にご相談ください。\n\n■情報センター窓口\n白金キャンパス: 本館 B1階\n横浜キャンパス: 5号館 2F\nメールアドレス: joho@cc.meijigakuin.ac.jp\n\n皆様にはご不便をおかけいたしますが、ご理解とご協力のほどよろしくお願い申し上げます。\n\n▼▲▼▲▼多要素認証に関する詳細▼▲▼▲▼\n\n■導入スケジュールおよび適用サービス\n・2025年4月1日より適用開始済みのサービス\n- Microsoft365関連サービス (Exchange Online(MGメール), OneDrive, Teams, Stream, Word, Excel, PowerPoint) EZProxy (図書館サービス)\n- MGU-VPN\n- AVD (仮想PC実習室)\n\n・2025年5月19日より適用開始するサービス\n- manaba（LMS／学習管理システム）\n\n・2025年7月1日より適用開始するサービス\n- 教務Web\n\n▼▲▼▲▼▼▲▼▲▼▼▲▼▲▼▼▲▼▲▼▼\n明治学院大学 情報センター",
  "updatedAt": "2025-05-14 17:03"
}
```

## submission

`submission info` は提出記録画面の提出行から取得できる情報を返す。提出記録は横
断一覧として扱い、提出物の元課題詳細ページを追加で開かない。

```ts
export type SubmissionInfoJson = {
  resource: "submission";
  id: string;
  path?: ManabaPath;
  kind: SubmissionKind;
  title: string;
  course: CourseSummary;
  submittedAt: DateTimeString;
  statusLabel?: string;
  detailText?: string;
};

export type SubmissionKind =
  | "quiz"
  | "survey"
  | "drill"
  | "report"
  | "project"
  | "unknown";
```

例:

```json
{
  "resource": "submission",
  "id": "2766977-query-2935448-2026-04-12-01-56",
  "path": "/ct/course_2766977_query_2935448",
  "kind": "quiz",
  "title": "02.5 DataFrame 条件による行選択 p.25",
  "course": {
    "id": "2766977",
    "name": "EESEM301演習A1",
    "path": "/ct/course_2766977"
  },
  "submittedAt": "2026-04-12 01:56",
  "statusLabel": "[小テスト]"
}
```
