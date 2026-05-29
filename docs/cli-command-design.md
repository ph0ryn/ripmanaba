# CLIコマンド設計

## 方針

コマンドは、manabaの画面階層ではなくユーザーが扱いたいresourceを基準にす
る。

例えば、コース内のコンテンツを開く場合でも
`ripmanaba course content open <id>` のように深い階層にはしない。`content`
をtop-level resourceとして扱う。

各resourceは原則として同じoperationを持つ。

- `ls`: 一覧を表示する
- `info <id>`: 詳細をJSONで表示する
- `open <id>`: `info <id>` が返す `url` と同じ算出でmanaba画面をブラウザで
  開く

複数形と単数形の違いでoperationを表現しない。

## 初期コマンド

READMEに記載する最低要件。

```sh
ripmanaba course ls
ripmanaba course info <course-id>
ripmanaba course open <course-id>

ripmanaba task ls
ripmanaba task info <task-id>
ripmanaba task open <task-id>
```

`course` には `crs` aliasを用意する。

```sh
ripmanaba crs ls
ripmanaba crs info <course-id>
ripmanaba crs open <course-id>
```

## 追加コマンド

```sh
ripmanaba <resource> <operation> [id]
```

追加resource:

- `content`
- `notice`
- `submission`

追加operation:

- `new`: ホーム画面のコース一覧に出る未読・未処理ステータスを返す

## Resource一覧

実装予定なしのものも含め、manaba側の意味的なresourceとCLI上の扱いを整理す
る。

| resource         | CLI名           | 状態     | 備考                                      |
| ---------------- | --------------- | -------- | ----------------------------------------- |
| コース           | `course`        | 初期実装 | `crs` aliasを用意する                     |
| 未提出課題       | `task`          | 初期実装 | 複数コース横断の課題配列として扱う        |
| コースコンテンツ | `content`       | 実装済み | `course content` にはしない               |
| 全体お知らせ     | `notice`        | 実装済み | コースニュースとは別resource              |
| 提出記録         | `submission`    | 実装済み | 複数コース横断の提出配列として扱う        |
| 未読・未処理     | `new`           | 追加候補 | homeのコース赤アイコンを横断配列にする    |
| コースニュース   | 未定            | 追加候補 | `notice` に含めるか別resourceにするか未定 |
| 小テスト         | `task` に含める | 初期実装 | 未提出課題では課題種別として扱う          |
| アンケート       | `task` に含める | 初期実装 | 未提出課題では課題種別として扱う          |
| レポート         | `task` に含める | 初期実装 | 未提出課題では課題種別として扱う          |
| 成績             | 未定            | 追加候補 | 個人情報性が高いため後で判断する          |
| シラバス         | なし            | 後回し   | コース配下には存在するが初期対象外        |
| プロジェクト     | `task` に含める | 後回し   | 横断一覧には出るが機能単体は後回し        |
| 掲示板           | なし            | 後回し   | スレッドを含む                            |
| グループニュース | なし            | 後回し   | 初期対象外                                |
| 個別指導         | なし            | 後回し   | 初期対象外                                |
| ピアレビュー     | なし            | 後回し   | 初期対象外                                |
| ユーザー         | なし            | 対象外   | CLI対象にしない                           |
| ポートフォリオ   | なし            | 対象外   | CLI対象にしない                           |

## コマンドツリー

初期実装と追加resourceまで含めたCLI構造。

```text
ripmanaba
├── auth
├── new
├── <resource>
│   └── <operation> [id]
└── <alias>
    └── <operation> [id]
```

初期resource:

- `course`
- `task`

追加resource:

- `content`
- `notice`
- `submission`

alias:

- `crs`: `course`

operation:

- `ls`
- `info <id>`
- `open <id>`

`ls` と `info` が返すJSONには、各resourceの情報源となるmanaba画面の絶対URL
を `url` として必ず含める。originを除いた `path` は返却JSONに含めない。
`open` は `info` の `url` を保存して使うのではなく、同じURL算出ロジックで
対象画面を開く。

`content ls` はコース内のコンテンツ一覧を対象にするため、`id` に
`course-id` を渡す。

`ripmanaba new` はresource配下のoperationではなく、homeに出るコース別の未
読・未処理ステータスを横断して返すショートカットとして扱う。対象は
`/ct/home` のコース一覧に表示される赤アイコンで、初期実装ではコースニュー
スと未提出課題を主対象にする。

## Resourceごとの情報源

| resource     | 主な画面                     | 主なpath                                                            |
| ------------ | ---------------------------- | ------------------------------------------------------------------- |
| `course`     | コース一覧、コース詳細       | `/ct/home_course`, `/ct/course_<course-id>`                         |
| `task`       | 未提出課題一覧、課題詳細     | `/ct/home_library_query`, `/ct/course_<course-id>_<type>_<task-id>` |
| `content`    | コース詳細、コースコンテンツ | `/ct/course_<course-id>_page`, `/ct/page_<content-id>`              |
| `notice`     | ホーム、お知らせ詳細         | `/ct/home`, `/ct/home_campusnews_<notice-id>`                       |
| `submission` | 提出記録                     | `/ct/home_submitlog`                                                |
| `new`        | ホーム                       | `/ct/home`                                                          |

## IDの扱い

ユーザーに渡すIDは、manabaのURL pathから抽出できるIDを基本にする。

例:

- `course_<course-id>` から `course-id` を取得する
- `course_<course-id>_report_<report-id>` から `report-id` を取得する
- `course_<course-id>_query_<query-id>` から `query-id` を取得する

ただし、resourceごとにIDが衝突する可能性があるため、内部的にはresource
typeとIDを組み合わせて扱う。

## 未決事項

- `task` にレポート、小テスト、アンケートなどをまとめるか
- `submission` の短いaliasを用意するか
- `content` や `notice` を初期実装に含めるか
