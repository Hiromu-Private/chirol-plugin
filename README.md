# チロル相談窓口 セットアップ手順（相手側）

Claude Code から、担当者の AI（チロル）に「こういう時どうしたらいい？」と質問できるようにする手順です。
所要時間は5分ほど。Mac と Claude Code、Node.js（18 以上）が入っている前提です。

## 入れると何が起きるか

| 向き | 中身 |
|---|---|
| あなた → 窓口 | Claude Code を開いた時に、設定の**構成だけ**を送ります（ファイル名・スキル名・hook のイベント名・MCP の名前）。CLAUDE.md やスキルの本文、鍵、`.env`、案件のファイルの中身は送りません |
| あなた → 窓口 | あなたの AI が `ask_chirol` で質問した文章。**質問には案件名・顧客名・個人情報を書かないでください**（鍵らしい文字列は自動で伏せ字になります） |
| 窓口 → あなた | 質問への回答と、「こういう構成にすると良さそうです」というお知らせ。取り入れるかはあなたが決めます。ファイルが勝手に書き換わることはありません |

送った内容は、あなたの手元の `~/.config/consult-mcp/sent.log` に全部残ります。

## 受け取るもの（担当者から）

- あなた専用の鍵（`cm_` で始まる文字列）。チャットには貼らず、画面で直接お渡しします

## 手順

### 1. 鍵を置く

ターミナルで次を打ちます。`cm_…` は受け取った鍵に置き換えます。

```bash
mkdir -p ~/.config/consult-mcp
cat > ~/.config/consult-mcp/config.json <<'EOF'
{
  "url": "https://consult-mcp.waggy-dev.workers.dev",
  "key": "cm_…",
  "level": 1
}
EOF
chmod 600 ~/.config/consult-mcp/config.json
```

`level` は送る範囲です。あとからいつでも変えられます。

| level | 送るもの |
|---|---|
| 0 | 構成を送らない（質問とお知らせの受け取りだけ） |
| 1 | 構成だけ（既定） |
| 2 | 構成に加えて、CLAUDE.md とスキルの本文（鍵らしい文字列は伏せ字） |

### 2. プラグインを入れる

Claude Code の中で、次の2行を打ちます。

```
/plugin marketplace add Hiromu-Private/chirol-plugin
/plugin install chirol-consult@chirol
```

入れたら Claude Code を開き直します。

### 3. 動いたか確かめる

1. `/mcp` と打ち、`chirol-consult` の `consult` が接続済みになっていることを見る
2. 「チロルに『テストです。届いていますか？』と聞いて」と頼む。答えか「担当者に回しました」のような返事が返れば成功
3. 送った内容を見る

```bash
tail -n 1 ~/.config/consult-mcp/sent.log
```

## 使い方

- 迷った時に「チロルに聞いて」と言うと、AI が質問します
- すぐ答えられない質問は担当者に回ります。回答が届いたら連絡が来るので、「チロルの返事ある？」と聞いてください。次に Claude Code を開いた時にも自動で表示されます
- お知らせが届いたら、AI が「取り入れますか？」と聞いてきます。取り入れた・見送ったの結果だけが窓口に返ります

## 新しい版が出た時

担当者から「新しい版を出しました」と連絡があったら、Claude Code の中で次を打ちます。

```
/plugin marketplace update chirol
```

毎回打つのが面倒なら、`/plugin` → Marketplaces → `chirol` で自動更新をオンにできます。

## うまくいかない時

| 症状 | 見る所 |
|---|---|
| `/mcp` で `consult` が接続失敗になる | `~/.config/consult-mcp/config.json` の鍵の写し間違い・書式（カンマ・引用符） |
| `sent.log` が増えない | `node -v` で Node.js が入っているか |
| プラグインが見つからない | 手順2の1行目（置き場の追加）を打ったか |

窓口が止まっていても、Claude Code の動きを止めることはありません（何も表示せず数秒で終わります）。

## 止め方

| やりたいこと | やること |
|---|---|
| 構成を送るのだけ止める | `config.json` の `level` を `0` にする |
| 全部止める | `/plugin uninstall chirol-consult@chirol` → `rm -r ~/.config/consult-mcp` |

窓口に残っている記録を消したい時は、担当者に言ってください。

## 前の版（zip）から移る人

1. 前に足した hook を消す: プロジェクトの `.claude/settings.local.json` から `consult-hook.mjs` の行を消す
2. 前に足した MCP を消す: `claude mcp remove consult`
3. `~/.config/consult-mcp/config.json` はそのまま使えます。手順2から始めてください
