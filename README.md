# ripmanaba

学習管理サービスmanabaにアクセスするCLI

## Installation

```sh
npm i -g ripmanaba
pnpm add -g ripmanaba
bun i -g ripmanaba
```

## Usage

ブラウザが立ち上がる。ユーザーがURLを入力してmanabaに移動し、ログインでき
たらterminalに戻ってEnterを押す。

```sh
ripmanaba auth
```

認証済みブラウザ状態は `~/.ripmanaba/browser-profile` に保存される。通常の
HTTP requestで再利用するstorage stateは `~/.ripmanaba/storage-state.json`
に保存される。

コース(履修科目)関連

```sh
ripmanaba course|crs [op]
  ls                # list
  info [course ID]  # return JSON
  open [course ID]  # open the URL in the browser
```

未提出課題関連

```sh
ripmanaba task [op]
  ls
  info [task ID]
  open [task ID]
```

## Requirements

- Bun: for runtime
