const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const acorn = require("acorn");
const cheerio = require("cheerio");

const source = fs.readFileSync("PersonWorkbook.js", "utf8");
const html = fs.readFileSync("Index.html", "utf8");
const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);

assert(scriptMatch, "Index.htmlのscript要素がありません");
acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
acorn.parse(scriptMatch[1], { ecmaVersion: "latest", sourceType: "script" });

const $ = cheerio.load(html);
assert.equal($("#createOrUpdatePersonWorkbook").length, 1,
  "資料一式の作成・更新ボタンが必要です");
assert.equal($("#personWorkbookResult").length, 1,
  "資料一式の処理結果表示欄が必要です");
assert($.root().text().includes("同じ対象者はrecordIdで判定"),
  "同一対象者をrecordIdで判定する説明が必要です");
assert($.root().text().includes("未入力項目は空欄"),
  "未入力項目を空欄にする説明が必要です");
assert($.root().text().includes("同じファイルID"),
  "再作成時も同じファイルを更新する説明が必要です");
assert($.root().text().includes("個別ファイル作成（従来方式・必要な場合のみ）"),
  "既存の監査向け個別出力は従来方式として残す必要があります");

[
  "apiPreflightPersonWorkbook",
  "apiCreateOrUpdatePersonWorkbook",
  "personWorkbookResolve_",
  "personWorkbookUpdate_",
  "personWorkbookAssertAdminOnlyAcl_"
].forEach((name) => {
  assert(source.includes("function " + name + "("), name + "がありません");
});

const expectedSheets = [
  "00_概要",
  "01_別添03_講習記録簿",
  "02_別添04_実施計画書",
  "03_別添05_実施状況報告書",
  "04_別添13_発行台帳",
  "05_申込・証憑保管",
  "06_修了証明書",
  "07_DIPS CSV",
  "08_講習料金収納記録"
];
expectedSheets.forEach((name) => {
  assert(source.includes('name: "' + name + '"'), name + "が固定シートにありません");
});

assert(source.includes("PropertiesService.getScriptProperties()"),
  "対象者ブックIDはサーバー側プロパティへ保存する必要があります");
assert(source.includes("context.record.recordId"),
  "対象者ブックの一意判定にはrecordIdが必要です");
assert(source.includes("SpreadsheetApp.openById(storedFile.getId())") ||
  source.includes("artifactOpenSpreadsheetByIdWithRetry_(storedFile.getId())"),
  "再実行時は登録済みファイルを開く必要があります");
assert(source.includes("status: resolved.created ? \"created\" : \"updated\""),
  "新規作成と同一ファイル更新を区別する必要があります");
assert(source.includes("未入力項目は空欄で作成します"),
  "未入力値を推測しない方針が必要です");
assert(source.includes("Google Sheetsはシート別の閲覧権限を設定できない"),
  "会計情報を同居させる場合は管理者限定検査が必要です");
assert(source.includes("complianceEnsureSampleFolder_"),
  "合成サンプルは正式保存先から分離する必要があります");

const updateStart = source.indexOf("function personWorkbookUpdate_(");
const updateEnd = source.indexOf("function personWorkbookEnsureSystemSheet_(");
const updateSource = source.slice(updateStart, updateEnd);
const systemVerifyPosition = updateSource.indexOf(
  "personWorkbookAssertSystemSheet_(systemSheet"
);
const backupDeletePosition = updateSource.indexOf(
  "spreadsheet.deleteSheet(backups[deleteIndex].sheet)"
);
assert(systemVerifyPosition >= 0 && backupDeletePosition > systemVerifyPosition,
  "旧シート削除は新シートと管理情報の検証完了後でなければなりません");
assert(updateSource.includes("systemBefore") &&
  updateSource.includes("systemRollbackError"),
  "更新失敗時は管理シートも元に戻す必要があります");
assert(updateSource.includes("cleanupWarnings"),
  "更新確定後の旧シート削除失敗は新シートを破壊せず警告にする必要があります");

assert(scriptMatch[1].includes('serverCall(\n          "apiPreflightPersonWorkbook"'),
  "画面は資料一式の作成前検査APIを呼ぶ必要があります");
assert(scriptMatch[1].includes('serverCall(\n          "apiCreateOrUpdatePersonWorkbook"'),
  "画面は資料一式の作成・更新APIを呼ぶ必要があります");
assert(scriptMatch[1].includes("openArtifactModal(record);\n          runPersonWorkbook(record);"),
  "詳細画面の資料作成ボタン1回で全資料の作成を開始する必要があります");

function extractFunction(name) {
  const ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script"
  });
  const node = ast.body.find((item) =>
    item.type === "FunctionDeclaration" && item.id.name === name
  );
  assert(node, name + "がありません");
  return source.slice(node.start, node.end);
}

const context = {
  artifactText_: (value) => value == null ? "" : String(value).trim(),
  artifactSafeName_: (value) =>
    String(value == null ? "" : value).replace(/[\\/:*?"<>|]/g, "_"),
  artifactRecordName_: (record) => String((record || {}).targetName || ""),
  complianceIsSyntheticSampleRecord_: (record) =>
    String((record || {}).targetName || "").startsWith("サンプル")
};
vm.createContext(context);
vm.runInContext(extractFunction("personWorkbookFileName_"), context);
vm.runInContext(extractFunction("personWorkbookOptionalIdentifier_"), context);
assert.equal(
  context.personWorkbookFileName_({
    recordId: "record-1",
    personId: "P-001",
    targetName: "山田 太郎"
  }),
  "更新講習_資料一式_P-001_山田 太郎"
);
assert.equal(
  context.personWorkbookFileName_({
    recordId: "sample-1",
    personId: "SAMPLE-001",
    targetName: "サンプル太郎"
  }),
  "サンプル_正式使用禁止_更新講習_資料一式_SAMPLE-001_サンプル太郎"
);
assert.equal(context.personWorkbookOptionalIdentifier_(0), "");
assert.equal(context.personWorkbookOptionalIdentifier_("0000000000"), "");
assert.equal(
  context.personWorkbookOptionalIdentifier_("1234567890"),
  "1234567890"
);

console.log("person workbook logic tests passed");
