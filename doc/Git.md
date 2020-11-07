# Git

[GitHub で ssh 接続する手順~公開鍵・秘密鍵の生成から~](https://qiita.com/shizuma/items/2b2f873a0034839e47ce)

[Git でやりたいこと、ここで見つかる](https://qiita.com/shimotaroo/items/b73d896ace10894fd290)

## issue 管理

[参考 - 【不安解消】未経験が GitHub で issue 管理をしたら、モチベ UP した話。](https://qiita.com/yamken/items/a9db6b07142ca8bfd19e)

### ブランチを切って作業開始

```
git checkout -b [ブランチ名]#[issue番号]
```

### commit 作成

```
git add .
git commit -m "[コミットメッセージ #issue番号]"
```

_コミットメッセージと#issue 番号の間にはスペースが必要。スペースを入れないと commit と issue が紐付かない。_

### 作業終了したらリモート（GitHub）へ push

```
git push origin [ブランチ名]#[issue番号]
```

### プルリク作成（GitHub で作業）

1. Code タブに「Compare & pull request」ボタンが表示されてるので押す。
1. コメントを記入
1. 「Create pull request」ボタンを押す。

### プルリクのマージ（GitHub で作業）

1. Pull requests タブにプルリクができているので選択する。
1. conflicts があれば解消する。
1. conflicts が無くなれば「Merage pull request」ボタンが表示されるので押す。
1. 「Confirm merge」ボタンを押す。

### リモート（GitHub）から master へ pull

```
git checkout master
git pull origin master
```
