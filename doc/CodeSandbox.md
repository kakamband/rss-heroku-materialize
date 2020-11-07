# CodeSandbox

[CodeSandbox](https://codesandbox.io)

## Container Environment の Sandbox を作る方法

[[参考 - Convert Client Environment to Container Environment](https://github.com/codesandbox/codesandbox-client/issues/2111)

GitHib リポジトリで下記内容の sandbox.config.json をプロジェクトルートに作成

```
{
  "template": "node"
}
```

上記リポジトリを CodeSandbox で import
