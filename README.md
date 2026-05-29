# ripmanaba

A minimal CLI app which accesses manaba and returns JSON

## Installation

```sh
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

ホーム画面の未読通知

```sh
ripmanaba new
```

コース

```sh
ripmanaba course|crs
  ls
  info <course-id>
  open <course-id>
```

未提出課題

```sh
ripmanaba task
  ls
  info <task-id>
  open <task-id>
```

コースコンテンツ

```sh
ripmanaba content
  ls <course-id>
  info <content-id>
  open <content-id>
```

全体お知らせ

```sh
ripmanaba notice
  ls
  info <notice-id>
  open <notice-id>
```

提出記録

```sh
ripmanaba submission
  ls
  info <submission-id>
  open <submission-id>
```

## Requirements

- Bun: for runtime
