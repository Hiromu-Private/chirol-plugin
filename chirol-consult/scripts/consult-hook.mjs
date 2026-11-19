#!/usr/bin/env node
// 相談窓口の相手側 hook（Claude Code の SessionStart で動かす）。依存なしの1ファイル。プラグイン chirol-consult に同梱。
//
// やること: ① 環境の写しを窓口へ送る（レベルは設定ファイルで本人が決める）
//           ② 折り返しの回答とお知らせを受け取り、セッションに渡す
// 約束:     ・必ず静かに失敗する（窓口が落ちていても、何も出さず exit 0。全体で5秒以内）
//           ・秘密の入ったファイルは読まない。送る文字列は伏せ字を通す
//           ・送った内容は手元の sent.log に全部残す（何を渡したか本人が見られる）
//
// 設定: ~/.config/consult-mcp/config.json（CONSULT_MCP_CONFIG で場所を変えられる）
//   { "url": "https://…", "key": "cm_…", "level": 1 }   level: 0=送らない 1=構成だけ 2=本文も

import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

setTimeout(() => process.exit(0), 5000); // 何があっても5秒で終わる

const CONFIG = process.env.CONSULT_MCP_CONFIG ?? join(homedir(), ".config", "consult-mcp", "config.json");
const TIMEOUT_MS = 4000;

const SECRET_NAME = /(^\.env)|secret|credential|password|token|\.pem$|\.key$|\.p12$|id_rsa|id_ed25519|settings\.local\.json$/i;
const SKIP_DIR = new Set(["node_modules", ".git", "worktrees", "projects", "todos", "shell-snapshots", "statsig", "file-history"]);
const REDACT = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[伏せ字:秘密鍵]"],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[伏せ字:APIキー]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[伏せ字:GitHubトークン]"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, "[伏せ字:Slackトークン]"],
  [/\bshp(?:at|ca|pa|ss)_[A-Fa-f0-9]{24,}\b/g, "[伏せ字:Shopifyトークン]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[伏せ字:AWSキー]"],
  [/\bcm_[a-f0-9]{64}\b/g, "[伏せ字:窓口の鍵]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[伏せ字:JWT]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, "Bearer [伏せ字]"],
  [/((?:api[_-]?key|secret|token|password|passwd|pwd)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, "$1[伏せ字]"],
];
const redact = (t) => REDACT.reduce((s, [re, to]) => s.replace(re, to), t);

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const readText = (p, cap) => {
  try {
    return redact(readFileSync(p, "utf8").slice(0, cap));
  } catch {
    return null;
  }
};
const dirNames = (p) => {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((d) => !d.name.startsWith(".") && !SECRET_NAME.test(d.name)).map((d) => d.name.replace(/\.md$/, "")).sort();
  } catch {
    return [];
  }
};

function tree(root, max = 400) {
  const out = [];
  const walk = (dir, depth) => {
    if (out.length >= max || depth > 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max) return;
      if (SECRET_NAME.test(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIR.has(e.name)) walk(p, depth + 1);
      } else if (e.isFile()) out.push(relative(root, p));
    }
  };
  walk(root, 0);
  return out;
}

function snapshot(cwd, level) {
  const claudeDir = join(cwd, ".claude");
  const md = join(cwd, "CLAUDE.md");
  const settings = readJson(join(claudeDir, "settings.json"));
  const mcp = readJson(join(cwd, ".mcp.json"));
  const snap = {
    project: basename(cwd),
    claudeMd: existsSync(md) ? { exists: true, bytes: statSync(md).size } : { exists: false },
    files: existsSync(claudeDir) ? tree(claudeDir).map((f) => join(".claude", f)) : [],
    skills: dirNames(join(claudeDir, "skills")),
    agents: dirNames(join(claudeDir, "agents")),
    commands: dirNames(join(claudeDir, "commands")),
    // hook はイベント名と matcher だけ。コマンドの中身は送らない（秘密が混ざりうる）
    hooks: Object.entries(settings?.hooks ?? {}).flatMap(([event, list]) =>
      (Array.isArray(list) ? list : []).map((h) => ({ event, matcher: typeof h?.matcher === "string" ? h.matcher : "" })),
    ),
    // MCP はサーバー名だけ。URL・ヘッダ・環境変数は送らない
    mcpServers: Object.keys(mcp?.mcpServers ?? {}).sort(),
  };
  if (level >= 2) {
    snap.claudeMdBody = readText(md, 30_000);
    snap.skillBodies = {};
    let total = 0;
    for (const name of snap.skills) {
      const body = readText(join(claudeDir, "skills", name, "SKILL.md"), 10_000);
      if (!body || total + body.length > 120_000) continue;
      total += body.length;
      snap.skillBodies[name] = body;
    }
  }
  return snap;
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve) => {
    let data = "";
    const done = () => resolve(data);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    setTimeout(done, 300);
  });
}

function log(entry) {
  try {
    appendFileSync(join(dirname(CONFIG), "sent.log"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* 記録できなくても止めない */
  }
}

async function call(cfg, method, path, body) {
  const res = await fetch(cfg.url.replace(/\/$/, "") + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok ? res.json() : null;
}

async function main() {
  const cfg = readJson(CONFIG);
  if (!cfg?.url || !cfg?.key) return;
  const level = Number.isInteger(cfg.level) ? cfg.level : 1;

  let cwd = process.cwd();
  try {
    const input = JSON.parse((await readStdin()) || "{}");
    if (typeof input.cwd === "string" && existsSync(input.cwd)) cwd = input.cwd;
  } catch {
    /* 入力が無くても動く */
  }

  const tasks = [];
  if (level >= 1) {
    const snap = snapshot(cwd, level);
    log({ sent: "status", level, snapshot: snap });
    tasks.push(call(cfg, "POST", "/v1/status", { level, snapshot: snap }).catch(() => null));
  } else {
    tasks.push(Promise.resolve(null));
  }
  tasks.push(call(cfg, "GET", "/v1/updates").catch(() => null));
  const [, upd] = await Promise.all(tasks);
  if (!upd) return;

  const lines = [];
  for (const a of upd.answers ?? []) {
    lines.push(`■ 折り返しの回答（質問 id: ${a.id}）`, `質問: ${a.question}`, `回答: ${a.answer}`, "");
  }
  for (const n of upd.notices ?? []) {
    lines.push(`■ お知らせ［${n.severity === "important" ? "重要" : "推奨"}］${n.title}（id: ${n.id}）`, n.body, "");
  }
  if (lines.length === 0) return;
  log({ received: "updates", answers: (upd.answers ?? []).length, notices: (upd.notices ?? []).map((n) => n.id) });
  process.stdout.write(
    [
      "[チロル相談窓口からの連絡]",
      ...lines,
      "お知らせは、適用するか見送るかを必ず本人に確認してから対応してください（勝手に適用しない）。",
      "結果は report_decision（kind=notice, ref=<お知らせの id>, result=applied か declined, note=理由）で返してください。",
    ].join("\n") + "\n",
  );
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
