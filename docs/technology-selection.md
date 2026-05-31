# 技術選定

## ステータス

ripmanaba の初期技術選定。

この文書には、すでに決めた方針と、スクレイピング調査後も未決定の項目を記
録する。

現時点では、manabaの主要画面がserver-rendered HTMLとして取得できる前提で
実装に進む。DOM構造、URL/path、返却JSON型は `docs/` に整理済みであり、追加の
PoC実装は行わない。実装中に不確実な画面やclient-side rendering依存が見つ
かった場合のみ、目的を絞ったPoCを作る。

## 決定事項

### ランタイム

- 対象ランタイムは Bun のみ。
- CLI は Node.js 互換性を主目的にしない。
- 実装言語は TypeScript のままにする。
- 既存の pnpm ベースの開発環境は当面維持する。

### CLI フレームワーク

- `cac` を使う。
- 理由:
  - API の表面積が小さい。
  - サブコマンド、alias、option、help、version 出力に対応している。
  - `ripmanaba course|crs ls` のようなコマンドに合う。

### CLI 形状

- top-level resource と共通 operation の組み合わせにする。
- 標準 operation は `ls`, `info <id>`, `open <id>`。
- `ripmanaba course content open <id>` のような深いコマンド列は避ける。
- 代わりに `ripmanaba content open <content-id>` を使う。
- 単数形と複数形のコマンド名で operation を区別しない。

See [CLIコマンド設計](./cli-command-design.md).

### ブラウザ自動化

- Playwright Chromium はログインと追加調査が必要な場合だけ使う。
- セッション永続化には Playwright の persistent browser context を使う。
- ブラウザ状態は ripmanaba 専用 profile directory に保存する。
- ユーザーの default Chrome profile は自動操作しない。
- 認証後の通常コマンドではブラウザ自動化を使わない。ただし、直接 HTTP
  request が認証画面へ redirect された場合に限り、session refresh のため
  headless Chromium を1回だけ使う。

想定 profile location:

```text
~/.ripmanaba/browser-profile
```

### スクレイピング方針

- `ripmanaba auth` はブラウザ自動化を使ってよい。ログインには SSO、MFA、
  手動操作が絡む可能性があるため。
- それ以外のコマンドは manaba のページを直接 fetch し、返ってきた HTML を
  parse する。
- 対象ページが client-side rendering を必要とすると後から判明しない限り、
  通常の認証済みスクレイピングでは Playwright、Chromium、その他のブラウザ
  自動化を使わない。
- スクレイピングしたリンクは、取得元ページのURLを基準に正規化する。
- 返却JSONにはoriginを除いたpathを含めず、情報源となるmanaba画面の絶対URL
  を `url` として含める。
- ブラウザ自動化は調査用ツールとして残すが、runtime の標準スクレイピング
  手段にはしない。

### 認証フロー

- `ripmanaba auth` は Playwright Chromium を開く。
- ユーザーは manaba に手動ログインする。
- 認証済みブラウザ状態は専用 profile directory に保持する。
- 以後のコマンドは、認証済みセッション情報を直接 HTTP request に再利用す
  る。
- 通常コマンドの HTTP request が認証画面へ redirect された場合は、専用
  profile directory を使って headless Chromium で `/ct/home` を開き、
  storage state を保存し直す。
- session refresh 後は、最初に要求された HTTP request を1回だけ再実行する。
- session refresh 後も認証画面へ redirect された場合は、ユーザーに
  `ripmanaba auth` の再実行を求める。

## 未決定事項

### HTML Parser

具体的な HTML parser はまだ選ばない。必要なのは
`docs/scraping-methods.md` に書いた selector で server-rendered HTML を辿
れることだけ。

## 調査結果

1. スクレイピング調査用の専用 branch で manaba のページ構造を調べた。
2. ページ構造、URL/path、selector、ID抽出方法を `docs/` に記録した。
3. 対象 workflow の返却JSON型を `docs/return-types.md` に定義した。
4. 通常コマンドはfetch + HTML parseで進める方針に決定した。
5. PoC実装は作らず、実装中に未確認箇所が見つかった場合だけ追加調査する。

調査済み workflow:

- `course`
- `task`
- `content`
- `notice`
- `submission`
