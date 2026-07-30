const assert = require("node:assert/strict");
const fs = require("node:fs");
const acorn = require("acorn");

const html = fs.readFileSync("Index.html", "utf8");
const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);

assert(scriptMatch, "Index.htmlのscript要素がありません");
const script = scriptMatch[1];
const ast = acorn.parse(script, {
  ecmaVersion: "latest",
  sourceType: "script"
});

function functionSource(name) {
  const node = ast.body.find((item) =>
    item.type === "FunctionDeclaration" && item.id.name === name
  );
  assert(node, name + "がありません");
  return script.slice(node.start, node.end);
}

const ledger = functionSource("renderLedger");
assert(
  ledger.includes('data-artifacts="') &&
    ledger.includes(">資料一式を作成・更新</button>"),
  "更新記録の操作欄に資料一式を作成・更新ボタンが必要です"
);
assert(
  ledger.includes("canCreateOrUpdatePersonWorkbook(record)") &&
    ledger.includes(" disabled title="),
  "管理者以外または無効化済み記録では資料作成ボタンを無効にする必要があります"
);

const permission = functionSource("canCreateOrUpdatePersonWorkbook");
[
  'AppData.mode === "server"',
  "AppData.configured",
  "!AppData.readOnly",
  'AppData.role === "admin"',
  "!record.archived"
].forEach((condition) => {
  assert(permission.includes(condition), "資料作成権限の条件が不足しています: " + condition);
});

const runner = functionSource("runPersonWorkbook");
assert(
  runner.includes("canCreateOrUpdatePersonWorkbook(currentRecord)"),
  "資料作成処理の入口でも権限検査が必要です"
);
assert(
  runner.includes('"apiPreflightPersonWorkbook"') &&
    runner.includes('"apiCreateOrUpdatePersonWorkbook"'),
  "既存の作成前検査と同一ファイル更新処理を使用する必要があります"
);

const clickHandlerFragment =
  "openArtifactModal(record);\n          runPersonWorkbook(record);";
assert(
  script.includes(clickHandlerFragment),
  "操作欄のボタンは既存の安全な資料一式作成処理へ接続する必要があります"
);
assert(
  functionSource("applyPublicReadOnlyUi").includes("[data-edit], [data-artifacts]"),
  "公開Pages版では資料作成ボタンを無効にする必要があります"
);
assert(
  html.includes(".workbook-action-button { white-space: nowrap; }"),
  "資料一式ボタンの文字を不自然に分断しない指定が必要です"
);

console.log("ledger workbook button tests passed");
