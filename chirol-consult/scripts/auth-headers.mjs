#!/usr/bin/env node
// 相談窓口の MCP 接続に付けるヘッダを作る（MCP の headersHelper から呼ばれる）。依存なしの1ファイル。
// 鍵はプラグインに入れない。相手の手元の設定ファイル（hook と同じ ~/.config/consult-mcp/config.json）から読む。
// 出力: {"Authorization": "Bearer cm_…"} を標準出力に1行。設定が無ければ理由を標準エラーに出して exit 1（接続は失敗扱い）。

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG = process.env.CONSULT_MCP_CONFIG ?? join(homedir(), ".config", "consult-mcp", "config.json");

let cfg;
try {
  cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch {
  process.stderr.write(`チロル相談窓口: 設定ファイルが読めません（${CONFIG}）。セットアップ手順の「鍵を置く」を見てください\n`);
  process.exit(1);
}
if (typeof cfg?.key !== "string" || !cfg.key.startsWith("cm_")) {
  process.stderr.write(`チロル相談窓口: 設定ファイルに鍵（cm_ で始まる文字列）がありません（${CONFIG}）\n`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ Authorization: `Bearer ${cfg.key}` }) + "\n");
