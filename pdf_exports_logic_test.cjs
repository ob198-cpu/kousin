const assert = require("node:assert/strict");
const fs = require("node:fs");
const acorn = require("acorn");

const source = fs.readFileSync("PdfExports.js", "utf8");
acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });

assert(source.includes("function renewalPdfExportSheetBlob_("),
  "シート別PDF出力関数が必要です");
assert(source.includes('"gid=" + encodeURIComponent(String(sheet.getSheetId()))'),
  "対象シートのgidを指定する必要があります");
assert(source.includes('"portrait=" + (landscape === true ? "false" : "true")'),
  "シートごとに縦横を指定する必要があります");
[
  "size=A4",
  "fitw=true",
  "sheetnames=false",
  "printtitle=false",
  "gridlines=false",
  "fzr=false"
].forEach((setting) => {
  assert(source.includes('"' + setting + '"'),
    "PDF出力設定が不足しています: " + setting);
});
assert(source.includes("ScriptApp.getOAuthToken()") &&
  source.includes("UrlFetchApp.fetch("),
  "認証済みのシート別PDF取得が必要です");
assert(source.includes("bytes[0] === 37") &&
  source.includes("status !== 200 || !isPdf"),
  "HTTP応答とPDFヘッダーの検査が必要です");
assert(source.includes("function renewalPdfExportPersonWorkbookAndSave_(") &&
  source.includes("sheetSpecs.forEach(function(spec)") &&
  source.includes("orientation = landscape ? \"landscape\" : \"portrait\""),
  "全固定シートを指定方向で個別保存する必要があります");
assert(source.includes("function renewalPdfSavePreparedBlob_("),
  "監査資料と対象者資料で安全な同一ID上書き処理を共有する必要があります");

console.log("pdf exports logic tests passed");
