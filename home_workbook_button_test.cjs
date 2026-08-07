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

const home = functionSource("renderHome");
assert(
  home.includes('data-artifacts="') &&
    home.includes(">資料一式を作成・更新</button>"),
  "統合ホーム一覧の操作欄に資料一式を作成・更新ボタンが必要です"
);
assert(
  home.includes('data-open-workbook="') &&
    home.includes(">ファイルを開く</button>"),
  "統合ホーム一覧の操作欄に保存済みファイルを開くボタンが必要です"
);
assert(
  !home.includes('data-archive="') && !home.includes(">無効化</button>"),
  "統合ホーム一覧の操作欄に無効化ボタンを表示してはいけません"
);
assert(
  home.includes("canCreateOrUpdatePersonWorkbook(record)") &&
    home.includes(" disabled title="),
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
    runner.includes('"apiCreateOrUpdatePersonWorkbookBatch"') &&
    runner.includes("batchIndex < batchCount") &&
    runner.includes("preflight.summary") &&
    runner.includes("summary.sheetCount"),
  "既存の作成前検査と同一ファイル更新処理を使用する必要があります"
);

assert(
  script.includes("if (target.dataset.artifacts)") &&
    script.includes("openArtifactModal(record);") &&
    script.includes("runPersonWorkbook(record);"),
  "操作欄のボタンは既存の安全な資料一式作成処理へ接続する必要があります"
);
const opener = functionSource("openPersonWorkbook");
const savedSpreadsheetOpener = functionSource("openSavedGoogleSpreadsheet");
assert(
  opener.includes('"apiGetPersonWorkbookLink"') &&
    opener.includes("openSavedGoogleSpreadsheet(") &&
    savedSpreadsheetOpener.includes("serverCall(apiName, request)") &&
    savedSpreadsheetOpener.includes('window.open("about:blank", "_blank")') &&
    savedSpreadsheetOpener.includes("pendingWindow.location.replace(url)") &&
    savedSpreadsheetOpener.includes("pendingWindow.close()"),
  "ファイルを開く処理は保存済みURLを検査して新しいタブへ開く必要があります"
);
assert(
  script.includes("if (target.dataset.openWorkbook)") &&
    script.includes("openPersonWorkbook(record, target)"),
  "ファイルを開くボタンを保存済みファイル取得処理へ接続する必要があります"
);
const publicRedirect = functionSource("redirectPublicPagesToProduction");
assert(
  publicRedirect.includes('window.location.hostname !== "ob198-cpu.github.io"') &&
    publicRedirect.includes("window.location.replace(PRODUCTION_WEB_APP_URL)"),
  "公開Pages版から認証済み本番版へ自動転送する必要があります"
);
assert(
  functionSource("bootstrapApplication").includes("if (redirectPublicPagesToProduction()) return;"),
  "公開Pages版では共有正本の初期化より先に本番版へ転送する必要があります"
);
assert(
  functionSource("applyPublicReadOnlyUi").includes("[data-open-workbook]"),
  "公開Pages版では資料作成ボタンを無効にする必要があります"
);
assert(
  html.includes(".workbook-action-button { white-space: nowrap; }"),
  "資料一式ボタンの文字を不自然に分断しない指定が必要です"
);

console.log("home workbook button tests passed");
