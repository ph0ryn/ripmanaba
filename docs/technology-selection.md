# 技術選定

## ステータス

ブラウザに保存された manaba のログイン状態を使って、server-rendered HTML を
直接取得する設計を確定する。画面構造、URL/path、返却 JSON 型は `docs/` に整理
済みであり、追加の PoC 実装は行わない。実装中に不確実な画面や client-side
rendering 依存が見つかった場合だけ、目的を絞った調査を追加する。

## 決定事項

### ランタイム

- 対象ランタイムは Bun とする。
- 実装言語は TypeScript のままにする。
- 既存の pnpm ベースの開発環境は維持する。

### CLI フレームワーク

- `commander@15.0.0` を使う。
- API の表面積が小さく、サブコマンド、option、help、version 出力に対応して
  いるため、`ripmanaba course list` の形に合う。
- `--config <path>` は全コマンド共通 option とする。

### HTML parser

- `cheerio` を使う。
- manaba の画面は通常の HTTP request で取得し、HTML の selector とリンクを
  Cheerio で解析する。
- `list` は取得した一覧画面の1ページだけを対象にする。
- 欠損した必須要素は解析エラーとして扱い、正常な空一覧とは区別する。

### CLI 形状

- top-level resource と共通 operation の組み合わせにする。
- 標準 operation は `list`, `show <id>`, `open <id>` とする。
- `ripmanaba course content open <id>` のような深いコマンド列は使わず、
  `ripmanaba content open <content-id>` を使う。
- `content show/open` は `<content-id>_<page-id>` のページ指定にも対応する。
- `content list` は `<course-id>` を必須にする。
- content IDは安全なASCII英数字またはハイフンを各部分に使い、アンダースコアを
  最大1個まで許可する。`^[A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)?$` に一致させ、数字と
  `c` の組み合わせには限定しない。

See [CLIコマンド設計](./cli-command-design.md).

### ブラウザ Cookie 認証

- Cookie の取得には `@steipete/sweet-cookie@0.4.4` を使う。
- `getCookies` に対象 URL とブラウザ設定を渡し、各コマンドの実行時に現在の
  ブラウザ Cookie を読み取る。
- Chrome は macOS の Keychain、Windows の DPAPI、Linux の keyring を通じて
  Chromium の暗号化 Cookie を復号する。Cookie DB は一時コピーだけを読む。
- Cookie、復号鍵、storage state、専用ブラウザプロファイルは CLI に永続化しない。
- Cookie 値は HTTP request のメモリ上だけで使い、標準出力やログへ出力しない。
- `sweet-cookie` の警告は原因を失わずに扱う。Cookie が取得できない場合は
  ブラウザで manaba にログインしてから再実行するよう案内する。

`sweet-cookie` は Chrome、Edge、Firefox、Safari に対応する。ただし Safari は
プロファイル名を指定できない。既定の browser は `chrome` とし、profile を省略
した場合は指定ブラウザの既定プロファイルを使う。

| browser   | 対応する profile         | 備考                                      |
| --------- | ------------------------ | ----------------------------------------- |
| `chrome`  | プロファイル名またはパス | 既定値。Chrome の既定プロファイルを使える |
| `edge`    | プロファイル名またはパス | Edge の既定プロファイルを使える           |
| `firefox` | プロファイル名またはパス | Firefox の Cookie DB を使う               |
| `safari`  | 指定不可                 | macOS の Safari Cookie store を使う       |

### manaba URL と設定

- `auth <url>` の URL は HTTPS かつ `*.manaba.jp` の host に限る。
- `auth` は指定 URL の `/ct/home` を取得し、ログアウト操作を示す marker が
  あることを検証する。検証に失敗した場合は設定を保存しない。
- 設定は `$XDG_CONFIG_HOME/ripmanaba/config.json` に保存する。
  `XDG_CONFIG_HOME` が未設定なら `~/.config/ripmanaba/config.json` とする。
- 設定には `version`, `origin`, `browser`, `profile` だけを保存する。
- 設定ファイルは mode `600` で作成し、同じディレクトリ内の一時ファイルから
  atomic rename で置き換える。
- `--config <path>` が指定された場合は、そのファイルだけを使う。親ディレクト
  リの作成、mode `600`、atomic replace の境界は既定 path と同じにする。

設定の論理型は次の通りとする。

```ts
type Config = {
  version: number;
  origin: string;
  browser: "chrome" | "edge" | "firefox" | "safari";
  profile?: string;
};
```

### 認証フロー

- `ripmanaba auth <url> [--browser <browser>] [--profile <profile>]` はブラウザを
  起動せず、指定したブラウザの Cookie で `/ct/home` を取得する。
- `auth` の初回検証が成功した時だけ設定を保存する。
- 通常の各コマンドは設定を読み、同じブラウザから Cookie を取得して request を
  作る。Cookie の再取得 retry は行わない。
- response がログイン画面へ redirect された場合、Cookie を別の host へ転送せず、
  fail fast でブラウザへのログインを案内する。
- macOS では Keychain の許可ダイアログが出る可能性がある。Windows では
  Chrome の App-Bound Encryption により一部の Cookie を復号できない場合がある。
  同じブラウザでの再ログインを暗黙の解決策にせず、利用できる別の対応ブラウザを
  `--browser` で選択するよう案内する。

参考:

- [Sweet Cookie](https://github.com/steipete/sweet-cookie)
- [Chromium security FAQ](https://github.com/chromium/chromium/blob/main/docs/security/faq.md)
- [Chromium macOS Keychain source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/os_crypt/common/keychain_password_mac.h)
- [Chrome remote debugging policy change](https://developer.chrome.com/blog/remote-debugging-port)

### HTTP とスクレイピング

- `auth` 以外のコマンドもブラウザ自動化を使わず、manaba のページを直接 fetch
  して Cheerio で parse する。
- 対象ページが client-side rendering を必要とすると確認できるまでは、ブラウザ
  自動化ツールや Chromium の起動を行わない。
- スクレイピングしたリンクは取得元ページの URL を基準に正規化する。
- 返却 JSON には origin を除いた path を含めず、情報源となる manaba 画面の絶対
  URL を `url` として含める。
- `open` は同じ URL 算出ロジックで既定ブラウザを起動し、起動できない場合や起動直後
  （1秒以内）の失敗を検出してエラーにする。長く動く起動プロセスの終了は待たない。

## 検証

変更時は次の検証を行う。

```sh
pnpm test
pnpm lint
pnpm check
pnpm format
```

認証 Cookie の fixture は実データを使わず、合成 HTML、合成設定、合成 Cookie
だけで検証する。Keychain、実ブラウザプロファイル、実際の Cookie 値をテスト成果
物へ含めない。

## 調査結果

1. manaba のページ構造、URL/path、selector、ID 抽出方法を `docs/` に記録した。
2. 対象 workflow の返却 JSON 型を `docs/return-types.md` に定義した。
3. ブラウザの現在の Cookie を `sweet-cookie` で読み、HTTP request として再利用
   する方針を決定した。
4. 専用ブラウザ profile と storage state の永続化は採用しない。

調査済み workflow:

- `course`
- `task`
- `content`
- `notice`
- `submission`
