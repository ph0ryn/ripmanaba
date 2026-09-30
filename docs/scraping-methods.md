# Scraping Methods

## 目的

`docs/return-types.md` で定義したJSONを、manabaのどの画面からどう取得するか
を整理する。

このメモは `chrome-devtools-mcp` で確認したDOMとpathをもとにする。PoC実装
は作らず、このメモを初期実装のスクレイピング仕様として扱う。実装では、
`ripmanaba auth <url>` で保存したoriginに、このメモのpathを結合してアクセス
する。

## 共通方針

originはユーザーのmanaba環境ごとに異なるため、設定に保存したoriginを使う。
JSONへ返すリンクは、保存済みoriginを含めた絶対URLとして `url` に入れる。origin
を除いたpathはID抽出とURL算出の内部表現としてだけ使い、返却JSONには含めない。

HTTP requestを作る前に、毎回 `@steipete/sweet-cookie@0.4.4` から設定済みブラウザ
の現在のCookieを取得する。Cookieは対象URLに限定し、CLIのファイルやログには保存
しない。Cookieの再取得retryは行わない。

入力URLはHTTPSかつ `*.manaba.jp` のhostに限る。HTTP responseがログイン画面へ
redirectされた場合はCookieを別のhostへ転送せず、fail fastでブラウザからmanabaへ
ログインするよう案内する。macOSではKeychainの許可を求められる可能性があり、
WindowsではChromeのApp-Bound Encryptionで復号できないCookieがあり得る。

各一覧は入口画面の1ページだけを取得する。必須tableやリンクがない場合はHTML欠損
エラーとし、tableが存在して行がない場合の空一覧とは区別する。

```ts
const path = new URL(anchor.href).pathname + new URL(anchor.href).search;
const url = new URL(path, config.origin).toString();
```

実DOMの `href` 属性は `course_2766689` や `page_2940479c2766689` のような
相対値で入ることが多い。selectorは `/ct/` 始まりだけに限定せず、取得後に
`anchor.href` または `new URL(rawHref, document.baseURI)` で正規化する。

IDは原則としてpathから抽出する。

content IDは安全なASCII英数字またはハイフンを各部分に使い、アンダースコアを最大
1個まで許可する。`^[A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)?$` に一致する値だけを受け付
け、数字と `c` の組み合わせには限定しない。rootのcontent IDは `<content-id>`、
ページのcontent IDは `<content-id>_<page-id>` とし、bareな `<page-id>` は返さない。

| resource     | path pattern                              | id                             |
| ------------ | ----------------------------------------- | ------------------------------ |
| course       | `/ct/course_<course-id>`                  | `<course-id>`                  |
| report task  | `/ct/course_<course-id>_report_<task-id>` | `<course-id>_report_<task-id>` |
| quiz task    | `/ct/course_<course-id>_query_<task-id>`  | `<course-id>_query_<task-id>`  |
| survey task  | `/ct/course_<course-id>_survey_<task-id>` | `<course-id>_survey_<task-id>` |
| content      | `/ct/page_<content-id>`                   | `<content-id>`                 |
| content page | `/ct/page_<content-id>_<page-id>`         | `<content-id>_<page-id>`       |
| notice       | `/ct/home_campusnews_<notice-id>`         | `<notice-id>`                  |

`kind` はpath内のresource segmentから正規化する。

| path segment | kind      |
| ------------ | --------- |
| `_report_`   | `report`  |
| `_query_`    | `quiz`    |
| `_survey_`   | `survey`  |
| `_project_`  | `project` |

## course list

入口path:

```text
/ct/home
/ct/home_course
```

ホーム画面でもコース一覧画面でも、リスト表示では
`table.stdlist.courselist` を読む。行はヘッダーを除いて次の列になる。

| 列       | JSON field          |
| -------- | ------------------- |
| コース名 | `name`, `url`, `id` |
| 年度     | `year`              |
| 開講情報 | `term`, `schedule`  |
| 担当教員 | `instructors`       |

コース名セルのコースリンクから `url` と `id` を取得する。実DOMでは同じ
セル内にお気に入りリンクが先に出るため、`href` 正規化後のpathが
`/ct/course_<course-id>` に一致するリンクを選ぶ。
開講情報は `春学期 水2` のような文字列なので、先頭tokenを `term`、残りを
`schedule` として扱う。

お気に入り状態は、同じ行内の
`/ct/home_favoritecourse_<course-id>_set___` または画像altから推定できる。
ただし初期実装では任意項目に留める。

## updates

入口path:

```text
/ct/home
```

ホーム画面のコース一覧に表示される赤い未読・未処理アイコンを読む。確認時点
では、曜日表示の `.courselistweekly-c` とリスト表示の `tr.courselist-c` の
どちらにも同じ状態アイコン群が出る。実装では両方を候補にし、course IDで重
複排除する。

コースリンクは対象要素内の `a[href]` から、正規化後pathが
`/ct/course_<course-id>` に一致するものを選ぶ。

状態アイコンは次のcontainer内の `img` を読む。

- 曜日表示: `.coursestatus img`
- リスト表示: `.course-card-status img`

`src` が `-on.png` または `_on.png` で終わるものをactiveとして扱う。active
でないiconは返却JSONに含めない。activeなiconから `kind` だけを返し、
`alt` や `title` の文言は返却JSONに含めない。

確認できたiconと `kind` の対応:

- `icon_coursenews`: `news`
- `icon-coursedeadline`: `deadline`
- `icon-coursegrad`: `grade`
- `icon_coursethread`: `thread`
- `icon_collist_individual`: `individual`

取得例の疑似コード:

```ts
const roots = document.querySelectorAll(".courselistweekly-c, tr.courselist-c");

const items = [...roots]
  .map((root) => {
    const courseAnchor = [...root.querySelectorAll("a[href]")].find((anchor) =>
      new URL(anchor.getAttribute("href") ?? "", document.baseURI).pathname.match(
        /\/ct\/course_(\d+)$/,
      ),
    );

    const kinds = [...root.querySelectorAll(".coursestatus img, .course-card-status img")]
      .filter((img) => /(?:-|_)on\.png$/.test(img.getAttribute("src") ?? ""))
      .map((img) => statusKindFromIcon(img.getAttribute("src") ?? ""));

    return { courseAnchor, kinds };
  })
  .filter((item) => item.courseAnchor && item.kinds.length > 0);
```

`/ct/home` のnetworkは通常のdocument取得と画像・CSS・JS assetが中心で、赤
アイコン状態はHTML内に描画済みだった。現時点では追加のXHRやfetchを前提に
しない。

## task list

入口path:

```text
/ct/home_library_query
```

未提出課題一覧は `table.stdlist` を読む。ヘッダーは次の通り。

```text
タイプ / タイトル / コース / 受付開始日時 / 受付終了日時 / 受付期間
```

行ごとの取得方法:

| JSON field    | source                                   |
| ------------- | ---------------------------------------- |
| `kind`        | タイプ列のリンクpath、または表示テキスト |
| `title`       | タイトル列のリンクテキスト               |
| `url`         | タイトル列のリンクURL                    |
| `id`          | タイトル列のpath                         |
| `course.name` | コース列のリンクテキスト                 |
| `course.url`  | コース列のリンクURL                      |
| `course.id`   | コース列のpath                           |
| `startsAt`    | 受付開始日時列                           |
| `endsAt`      | 受付終了日時列                           |
| `periodLabel` | 受付期間列                               |

タイプ列のリンクは `/ct/course_<course-id>_report` のような一覧pathで、タ
イトル列のリンクは `/ct/course_<course-id>_report_<task-id>` のような詳細
pathになる。JSONの `id` は `course-id`、種別、課題IDを結合した
`<course-id>_<report|query|survey>_<task-id>` とし、`url` には詳細URLを使う。

## course show

詳細path:

```text
/ct/course_<course-id>
```

コース概要は `.pageheader-course` 配下を読む。

| JSON field                 | source                                            |
| -------------------------- | ------------------------------------------------- |
| `id`                       | current path                                      |
| `url`                      | current URL                                       |
| `courseCode`               | `.coursecode`                                     |
| `name`                     | `.pageheader-course-coursename` のコースリンク    |
| `instructors`              | `.pageheader-course-courseteacher` の `担当教員:` |
| `year`, `term`, `schedule` | `.pageheader-course-courseteacher` の年度行       |
| `syllabusUrl`              | `シラバス` リンクがある場合のhref                 |

コースニュースは `.info-list-card` のうち、headerが `コースニュース` のカー
ドを読む。本文が `ニュースはありません。` の場合は `items: []` と
`empty: true` にする。

最近のスレッドは、headerが `スレッド（更新順）` の `.info-list-card` 内の
`a[href*="_topics_"]` を読む。pathは
`/ct/course_<course-id>_topics_<topic-id>_tflat` になる。

最近のコンテンツは `.top-contents-list` 内のページリンクと、その近くの更
新日時を読む。リンクは相対 `page_<content-id>` で入る場合があるため、正規
化後のpathで `/ct/page_` を判定する。

## task show

詳細path:

```text
/ct/course_<course-id>_report_<task-id>
/ct/course_<course-id>_query_<task-id>
/ct/course_<course-id>_survey_<task-id>
```

CLIには `<course-id>_<report|query|survey>_<task-id>` 形式の複合IDが渡るため、
`task show` と `task open` は未提出課題一覧を先に取得せず、IDから詳細pathを直接
組み立てる。提出済みまたは一覧にない課題も、manabaの閲覧権限と認証範囲に含まれ
ていれば対象にする。

共通のコース概要は `course show` と同じ `.pageheader-course` から取る。
課題詳細本体は種別ごとに主要tableが異なる。

| kind     | selector                                                                   |
| -------- | -------------------------------------------------------------------------- |
| `report` | `table.stdlist-report`                                                     |
| `quiz`   | `table.stdlist-query`                                                      |
| `survey` | `table.stdlist-query`（query系DOM解析を継続。現物のsurvey詳細DOMは未確認） |

tableは1行目がタイトル、以降が見出しセルと値セルの組になっている。見出し
テキストでフィールドへ対応させる。

| label                     | JSON field                                             |
| ------------------------- | ------------------------------------------------------ |
| 問題                      | `prompt`                                               |
| 課題に関する説明          | `description`                                          |
| 受付開始日時              | `startsAt`                                             |
| 受付終了日時              | `endsAt`                                               |
| ポートフォリオ / 閲覧設定 | `portfolioSetting`                                     |
| ポートフォリオ            | `portfolioSetting`                                     |
| 学生による再提出の許可    | `resubmissionAllowed`                                  |
| 添付ファイル              | `attachments`                                          |
| 状態                      | `status`, `submission.message`, `submission.submitted` |
| 制限時間                  | `timeLimitLabel`                                       |
| 採点結果と正解の公開      | `gradingResultAndCorrectAnswerDisclosure`              |

レポートのアップロード状態は `.report-form` または `input[name=RptSubmitFile]`
から取得する。`input[type=submit][name=action_ReportStudent_submitdone]` が
存在すれば `upload.enabled: true` とみなす。最大ファイルサイズや未選択表示
などの固定UI文言は返却JSONには含めない。

小テストは `input[name=action_QueryStudent_querystart]` があれば開始可能状
態とみなせる。`制限時間を超えて回答可` の文があれば
`canAnswerAfterTimeLimit: true` にする。

添付ファイルは `添付ファイル` 行のリンクを読む。リンクpathが `/ct/` 配下で
あれば保存済みoriginで絶対URL化し、外部URLならそのまま保持する。

## content list

入口path:

```text
/ct/course_<course-id>_page
```

コンテンツ一覧は `table.contentslist` を読む。

| JSON field  | source                       |
| ----------- | ---------------------------- |
| `id`        | タイトルリンクpath           |
| `title`     | タイトルリンクテキスト       |
| `url`       | タイトルリンクURL            |
| `course`    | `.pageheader-course`         |
| `pageCount` | `全 7 ページ` の数値         |
| `updatedAt` | ページ数表示と同じセルの日時 |

タイトルリンクは `/ct/page_<content-id>` になる。返却するrootの `id` は
`<content-id>` であり、そのまま `content show/open` に渡せる。

## content show

詳細path:

```text
/ct/page_<content-id>
/ct/page_<content-id>_<page-id>
```

CLIの引数が `<content-id>_<page-id>` の場合はページを指定した詳細pathとして扱う。
`<content-id>` だけの場合はコンテンツ全体を取得する。`content open` も同じ引数
規則とURL算出を使う。ページ指定時の返却JSONのトップレベル `id` は複合IDにする。

コンテンツ詳細では、コース概要は `.pageheader-course`、ページセット概要は
本文上部、ページ一覧は `table.stdlist.contentspagelist` から読む。

| JSON field                        | source                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `id`                              | rootは `<content-id>`、ページ指定時は `<content-id>_<page-id>` |
| `url`                             | current URL                                                    |
| `title`                           | ページセットタイトル                                           |
| `course`                          | `.pageheader-course`                                           |
| `publishedFrom`, `publishedUntil` | `公開期間：...～...`                                           |
| `updatedAt`                       | `更新日時 : ...`                                               |
| `pages`                           | `table.stdlist.contentspagelist` のページリンク                |

current pageは、本文中の現在表示ページ見出しと添付ファイルリンクから取る。
`currentPage.id` と `pages[].id` はどちらも `<content-id>_<page-id>` の複合IDにする。
添付ファイルリンクは次の形式になる。

```text
/ct/page_<content-id>_<page-id>_<file-id>/<encoded-filename>?view=full
```

このURLを `AttachmentInfo.url` に保持し、リンクテキスト末尾の日時を
`uploadedAt` にする。
同じ添付ファイルに対して、アイコン用の空テキストリンクとファイル名表示リ
ンクが重複して出る場合がある。正規化後のURLで重複排除し、日時はテキストがあるリ
ンクから取る。

ページ本文は取得対象にしない。manabaのコンテンツ本文は独自のリッチテキス
ト実装で、添付UIや `window.AttachmentFile`、ページ編集用scriptと混在する
ため、安定したテキスト抽出対象として扱わない。

## notice list

入口path:

```text
/ct/home
```

ホーム画面のお知らせ欄は、`お知らせ` 見出しのあるブロック内のtableを読む。
確認時点ではクラスなしtableだったため、見出しテキストが `お知らせ` の周辺
にある最初のtableとして扱う。

| JSON field    | source                 |
| ------------- | ---------------------- |
| `id`          | お知らせリンクpath     |
| `title`       | お知らせリンクテキスト |
| `url`         | お知らせリンクURL      |
| `publishedAt` | 同じ行の日付列         |

詳細リンクは `/ct/home_campusnews_<notice-id>` になる。

## notice show

詳細path:

```text
/ct/home_campusnews_<notice-id>
```

詳細本文は `.centernews_frame.tpanel_frame` を読む。

| JSON field    | source                   |
| ------------- | ------------------------ |
| `id`          | current path             |
| `url`         | current URL              |
| `title`       | `.centernews_frame` 冒頭 |
| `publishedAt` | タイトル直下の日時       |
| `bodyText`    | 本文                     |
| `updatedAt`   | `最終更新` の日時        |

本文中の外部リンクは `/ct/link_iframe_balloon?url=...` に包まれる場合があ
る。`notice show` の型にはリンク配列がないため、本文テキストとして保持す
る。

## submission list

入口path:

```text
/ct/home_submitlog
/ct/home_submitlog?daterange=180&search=
```

初期表示は7日分で、提出がない場合は `.submit-log` に
`この期間の提出記録はありません。` と表示される。期間を広げる場合は
`daterange` queryを使う。

提出行は `table.edit` を読む。行は日付が省略されることがあり、その場合は
直前の非空日付を引き継ぐ。

| 列         | JSON field                               |
| ---------- | ---------------------------------------- |
| 日付       | `submittedAt` の日付部分                 |
| 時刻       | `submittedAt` の時刻部分                 |
| 種別ラベル | `kind`, `statusLabel`                    |
| タイトル   | `title`, `url`, `id`                     |
| コース     | `course.name`, `course.url`, `course.id` |

タイトルリンクがない `(非公開の課題)` の行は、提出記録一覧画面のURLを
`url` に入れ、kindは `unknown` にする。

`id` は提出記録固有のIDがDOMにないため、次の値を結合した安定IDにする候補
がある。

```text
<course-id>-<kind>-<task-id>-<submitted-date>-<submitted-time>
```

例:

```text
2766977-query-2935448-2026-04-12-01-56
```

## submission show

`submission show` は提出記録一覧の1行を正規化したものとして扱う。実行時に取得
する現在の1ページにある提出IDだけを対象にし、ページ送りで検索しない。元課題詳
細ページは追加で開かない。

そのため取得元は `submission list` と同じ `table.edit` の行でよい。

`detailText` は現時点で提出記録一覧に追加本文がないため、基本は未設定にす
る。将来、行内に詳細表示や別パネルが確認できた場合のみ追加する。

## 未確認事項

- `survey` 詳細画面の実DOM。
- 添付ファイルが複数ある課題詳細のDOM。
- `course list` のお気に入りON状態の確定selector。
- 提出記録のページ送り時に、日付引き継ぎがページ境界をまたぐかどうか。

## 検証境界

認証とHTML解析の自動テストは、実ブラウザや実Cookieを使わず、合成Cookie、合成
設定、合成HTML fixtureで行う。Keychainの鍵、実プロファイル、復号済みCookieを
fixtureやログへ含めない。
