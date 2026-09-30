# CLIコマンド設計

## 方針

コマンドは、manabaの画面階層ではなくユーザーが扱いたいresourceを基準にす
る。コース内のコンテンツも `content` をtop-level resourceとして扱い、深い
コマンド列にはしない。

各resourceは次の操作を持つ。

- `list`: 一覧をJSONで表示する
- `show <id>`: 詳細をJSONで表示する
- `open <id>`: `show <id>` と同じURL算出でmanaba画面を既定ブラウザで開く

すべてのコマンドは共通optionとして `--config <path>` を受け付ける。設定を
省略した場合の既定pathは `$XDG_CONFIG_HOME/ripmanaba/config.json`（未設定時は
`~/.config/ripmanaba/config.json`）である。

## 認証コマンド

```sh
ripmanaba auth <url> [--browser chrome|chromium|edge|firefox|safari] [--profile <profile>]
```

- `--browser` の既定値は `chrome`。
- `chromium` の Cookie 読み取りは macOS と Linux に対応する。
- `--profile` を省略した場合は指定ブラウザの既定profileを使う。
- `safari` では `--profile` を指定できない。
- `<url>` は `https://*.manaba.jp` のHTTPS URLに限る。
- 専用ブラウザや専用profileは起動しない。指定したブラウザの現在のCookieを読み、
  `/ct/home` とログアウトmarkerを検証する。
- 検証に成功した場合だけ、`version`、`origin`、`browser`、任意の`profile`を
  mode `600`の設定ファイルへatomicに保存する。Cookie、Keychainの鍵、storage
  stateは保存しない。

通常のresource commandも実行時に現在のブラウザCookieを読み取る。ログイン画面へ
redirectされた場合はCookieを転送せず、再取得retryも行わずにブラウザでのログインを
案内してfail fastする。

## コマンド一覧

```sh
ripmanaba updates

ripmanaba course list
ripmanaba course show <course-id>
ripmanaba course open <course-id>

ripmanaba task list
ripmanaba task show <course-id>_<report|query|survey>_<task-id>
ripmanaba task open <course-id>_<report|query|survey>_<task-id>

ripmanaba content list <course-id>
ripmanaba content show <content-id>
ripmanaba content show <content-id>_<page-id>
ripmanaba content open <content-id>
ripmanaba content open <content-id>_<page-id>

ripmanaba notice list
ripmanaba notice show <notice-id>
ripmanaba notice open <notice-id>

ripmanaba submission list
ripmanaba submission show <submission-id>
ripmanaba submission open <submission-id>
```

`updates` は `/ct/home` のコース別未読・未処理ステータスを返すresource外のコマンド
である。

## Resourceごとの規則

| resource     | 操作                                     | 引数と意味                                           |
| ------------ | ---------------------------------------- | ---------------------------------------------------- |
| `course`     | `list`                                   | コース一覧を取得する                                 |
| `course`     | `show/open <course-id>`                  | コースIDから詳細画面を取得または開く                 |
| `task`       | `list`                                   | `/ct/home_library_query` の課題一覧1ページを取得する |
| `task`       | `show/open <course-id>_<type>_<task-id>` | IDから詳細URLを直接組み立てる                        |
| `content`    | `list <course-id>`                       | 指定コースのコンテンツ一覧1ページを取得する          |
| `content`    | `show/open <content-id>[_<page-id>]`     | コンテンツまたはページを取得または開く               |
| `notice`     | `list`                                   | ホームのお知らせ一覧を取得する                       |
| `notice`     | `show/open <notice-id>`                  | お知らせ詳細を取得または開く                         |
| `submission` | `list`                                   | 提出記録一覧の現在表示されている1ページを取得する    |
| `submission` | `show/open <submission-id>`              | 現在の提出記録一覧にあるIDを取得または開く           |

`content list` はコース内の一覧であるため、`<course-id>` を必須にする。一覧と詳細
が返すcontent IDは、そのまま `content show` または `content open` に渡せる。
コンテンツ全体は `<content-id>`、ページは `<content-id>_<page-id>` として扱う。
content IDは安全なASCII英数字またはハイフンを各部分に使い、アンダースコアは最大
1個まで許可する。入力全体は `^[A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)?$` に一致させる。

課題IDの `<type>` は `report`、`query`、`survey` のいずれかで、例えば
`2766776_report_3008513` のように表す。`task show` と `task open` は現在の未提出
課題一覧からIDを解決せず、複合IDから詳細pathを直接算出する。提出済みまたは一覧に
ない課題も、manabaの閲覧権限と認証範囲で閲覧できる限り対象にする。アンケートの
詳細画面はquery系DOM解析で扱う。現物のsurvey詳細DOMはまだ確認していないため、
実DOMとの相違はfixtureとselectorの更新で吸収する。

`submission show` と `submission open` は、実行時に取得した提出記録一覧の現在の
1ページに存在する提出IDだけを対象にする。ページをまたいだ検索や追加取得は行わな
い。

各 `list` は入口画面の1ページだけを対象にする。行が0件なら空配列を返し、必須の
table、見出し、または行に必要なリンクが欠損している場合は解析エラーにする。

`list` と `show` が返すJSONには、情報源となるmanaba画面の絶対URLを `url` として
含める。originを除いた `path` は返却JSONに含めない。`open` は同じURL算出ロジック
で既定ブラウザを起動し、起動できない場合や起動直後（1秒以内）の失敗を検出して
エラーを返す。長く動く起動プロセスの終了は待たない。

## Resourceごとの情報源

| resource     | 主な画面                     | 主なpath                                                            |
| ------------ | ---------------------------- | ------------------------------------------------------------------- |
| `course`     | コース一覧、コース詳細       | `/ct/home_course`, `/ct/course_<course-id>`                         |
| `task`       | 課題一覧、課題詳細           | `/ct/home_library_query`, `/ct/course_<course-id>_<type>_<task-id>` |
| `content`    | コース詳細、コースコンテンツ | `/ct/course_<course-id>_page`, `/ct/page_<content-id>`              |
| `notice`     | ホーム、お知らせ詳細         | `/ct/home`, `/ct/home_campusnews_<notice-id>`                       |
| `submission` | 提出記録                     | `/ct/home_submitlog`                                                |
| `updates`    | ホーム                       | `/ct/home`                                                          |

## IDの扱い

ユーザーに渡すIDは、manabaのURL pathから抽出できる値を基本にする。

- `course_<course-id>` から `course-id` を取得する。
- `course_<course-id>_<type>_<task-id>` を課題ID
  `<course-id>_<type>_<task-id>` として扱う。
- `page_<content-id>` から `<content-id>` を取得する。
- `page_<content-id>_<page-id>` は `<content-id>_<page-id>` というページ指定の
  content IDとして扱う。

resourceごとのIDを混同しないよう、taskの種別は複合IDに含める。URLは保存した値を
再利用せず、設定されたoriginとIDから毎回算出する。
