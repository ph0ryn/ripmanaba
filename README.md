# ripmanaba

ブラウザでログイン済みの manaba を使って、コース、課題、お知らせ、提出記録を
JSON で取得する CLI です。manaba の公式 API は使わず、認証済み画面を直接取得
します。

## Installation

```sh
pnpm add -g ripmanaba
# または
bun add -g ripmanaba
```

## Authentication

通常の Chrome などで manaba にログインした状態で、manaba の URL を指定します。
CLI は専用ブラウザを起動せず、指定したブラウザの現在の Cookie を読み取ります。

```sh
ripmanaba auth https://example.manaba.jp/ct/home --browser chrome --profile protocol
```

入力 URL は `https://*.manaba.jp` の HTTPS URL に限ります。`--browser` の既定値
は `chrome` です。`--profile` を省略すると、指定したブラウザの既定プロファイル
を使います。複数のプロファイルを使っている場合は、ブラウザに表示されるプロ
ファイル名を明示してください。Safari では `--profile` を指定できません。

初回の `auth` では `/ct/home` を取得し、ログアウト操作を示す画面マーカーがある
ことを確認してから設定を保存します。保存先は既定では
`$XDG_CONFIG_HOME/ripmanaba/config.json`（未設定時は
`~/.config/ripmanaba/config.json`）です。保存するのは CLI の設定だけで、Cookie、
Keychain の鍵、ブラウザの専用プロファイルは保存しません。

macOS では初回の Cookie 読み取り時に Keychain の許可を求められることがあります。
Windows では Chrome の App-Bound Encryption により Cookie を読み取れない場合が
あります。同じブラウザで再ログインしても解決しないことがあるため、利用できる別の
対応ブラウザを `--browser` で選択してください。Cookie を端末へ貼り付ける方法は
使いません。

## Usage

`--config <path>` は `auth` を含むすべてのコマンドで使えます。

ホーム画面の未読・未処理状態:

```sh
ripmanaba updates
```

コース:

```sh
ripmanaba course list
ripmanaba course show <course-id>
ripmanaba course open <course-id>
```

課題:

```sh
ripmanaba task list
ripmanaba task show <course-id>_<report|query|survey>_<task-id>
ripmanaba task open <course-id>_<report|query|survey>_<task-id>
```

課題IDは、例えば `2766776_report_3008513` の形式です。`task show` と
`task open` は未提出課題一覧を参照せず、IDから詳細URLを組み立てます。そのため、
提出済みや一覧にない課題も、manabaで閲覧権限があり認証範囲に含まれていれば対象に
できます。アンケートの詳細はquery系DOM解析で扱います。現物のsurvey詳細DOMはまだ
確認していません。

コースコンテンツ:

```sh
ripmanaba content list <course-id>
ripmanaba content show <content-id>
ripmanaba content show <content-id>_<page-id>
ripmanaba content open <content-id>
ripmanaba content open <content-id>_<page-id>
```

`content list` と `content show` が返すIDは、そのまま `content show` または
`content open` に渡せます。コンテンツ全体のIDは `<content-id>`、ページのIDは
`<content-id>_<page-id>` です。

全体お知らせ:

```sh
ripmanaba notice list
ripmanaba notice show <notice-id>
ripmanaba notice open <notice-id>
```

提出記録:

```sh
ripmanaba submission list
ripmanaba submission show <submission-id>
ripmanaba submission open <submission-id>
```

`list` と `show` は JSON を標準出力へ出します。`open` は対応する manaba の URL を
既定ブラウザで開き、起動できない場合や起動直後（1秒以内）に失敗した場合をエラー
として返します。長く動く起動プロセスの終了は待ちません。通常のコマンドは実行する
たびにブラウザの現在の Cookie を読み取ります。ログイン画面へリダイレクトされた
場合は Cookie を転送せず、ブラウザで manaba にログインするよう案内して終了します。

`submission show` と `submission open` は、実行時に取得する提出記録一覧の現在の
1ページにある提出IDだけを対象にします。ページをまたいだ提出記録の検索は行いま
せん。

## Requirements

- Bun >= 1.3.13
- Chrome、Edge、Firefox、または Safari
- ログイン済みの manaba ブラウザセッション

## Development

```sh
pnpm install --frozen-lockfile
pnpm dev --help
pnpm check
```
