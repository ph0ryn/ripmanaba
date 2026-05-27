# AGENTS.md

ripmanabaリポジトリ

[README.md](./README.md): 完成系のREADME
[docs/](docs/): ドキュメント
[src/](src/): ソース、しばらくはノータッチ
[poc/](poc/): 調べたスクレイピングメソッドが有効かどうか試す、最終的には消す

## 前提

manabaはAPIを提供していないので、サイトに直接アクセスしてスクレイピングを行う

## 開発フロー

1. ブランチを切ってスクレイパーのPoCを作る
   1. @Computer Use でchromeを開きサイトの構造を把握し、docsに書く
   2. @chrome_devtools_mcp を使用し、各ページのデータをどう取得するかdocsに1とは別のファイルに書く
   3. poc/に各目的ごとのpocを作成する
2. 確定したスクレイピングメソッド整理し、mainにdocsのみマージ
3. ここから初めてメイン開発に着手
4. CLI基盤を作成する
5. `ripmanaba auth`のセッション永続化を実装
6. その他コマンドを実装
