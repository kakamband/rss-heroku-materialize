# CloudShell

[CloudShell](https://ssh.cloud.google.com/cloudshell/editor)

## エディターの設定

タブサイズ変更

```
"editor.tabSize": 2,
```

ミニマップ非表示

```
"editor.minimap.enabled": false,
```

オートフォーマット

```
"editor.formatOnPaste": false,
"editor.formatOnType": true,
```

.vue や.svelte を html ファイルとして扱う

```
"files.associations": {
    "*.vue": "html",
    "*.svelte": "html"
}
```
