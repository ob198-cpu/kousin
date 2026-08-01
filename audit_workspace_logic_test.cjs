const assert = require("node:assert/strict");
const fs = require("node:fs");
const acorn = require("acorn");
const cheerio = require("cheerio");

const auditSource = fs.readFileSync("AuditWorkspace.js", "utf8");
const editorSource = fs.readFileSync("AuditWorkspaceEditor.js", "utf8");
const pdfSource = fs.readFileSync("PdfExports.js", "utf8");
const personSource = fs.readFileSync("PersonWorkbook.js", "utf8");
const artifactsSource = fs.readFileSync("Artifacts.js", "utf8");
const html = fs.readFileSync("Index.html", "utf8");
const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);

assert(scriptMatch, "Index.htmlのscript要素がありません");
[auditSource, editorSource, pdfSource, personSource, artifactsSource, scriptMatch[1]].forEach((source) => {
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
});

const $ = cheerio.load(html);
const nav = $(".app-header .tabs > button").map((_, node) => $(node).text().trim()).get();
assert.deepEqual(nav, ["ホーム", "監査", "集計", "設定"],
  "監査ボタンはホームの直後に配置してください");
assert.equal($("#auditScreen").length, 1, "監査画面がありません");
assert.equal($("#createOrUpdateAuditWorkspace").length, 1,
  "全体監査資料の作成・更新ボタンがありません");
assert.equal($("[data-audit-edit]").length, 4,
  "監査画面には4資料それぞれの編集ボタンが必要です");
assert.equal($("#auditEditorModal").length, 1,
  "監査資料の編集画面がありません");
assert.equal($("#auditEditorReason").length, 1,
  "監査資料の変更理由入力がありません");
assert.equal($("#courseVenue").is("select"), true,
  "講習会場はプルダウンにしてください");
assert.equal($("#artifactCourseVenues").length, 1,
  "設定画面に講習会場候補の編集欄がありません");
assert.equal($("#artifactPdfOutputFolderId").val(), "1mEa7LjNYge-Nesu02-zoyycwEpaEh_qZ",
  "PDF保存先が指定フォルダと一致しません");

[
  "02_別添04_実施計画書",
  "03_別添05_実施状況報告書",
  "04_別添13_発行台帳",
  "08_講習料金収納記録"
].forEach((name) => assert(auditSource.includes('name: "' + name + '"'),
  "全体監査資料の固定シートがありません: " + name));

assert(auditSource.includes("storeListRecords_({ includeDeleted: false })") &&
  auditSource.includes("financeStoreGetState_()"),
  "全体資料は共有正本と正式会計台帳から集計してください");
assert(auditSource.includes('"audit-workspace:" + fiscalYear') &&
  auditSource.includes("renewalPdfExportAndSave_("),
  "全体監査資料の同一年度更新とPDF保存が必要です");
assert(editorSource.includes("function apiGetAuditWorkspaceEditor") &&
  editorSource.includes("function apiSaveAuditWorkspaceDocument") &&
  editorSource.includes("function apiResetAuditWorkspaceDocument"),
  "監査資料の読込・補正保存・自動集計復帰APIが必要です");
assert(editorSource.includes("expectedManualVersion") &&
  editorSource.includes("別の担当者が先に監査資料を変更しました"),
  "監査資料の同時更新は版競合で停止してください");
assert(editorSource.includes("reason.length < 2") &&
  editorSource.includes("AUDIT_WORKSPACE_MANUAL_SAVE") &&
  editorSource.includes("AUDIT_WORKSPACE_MANUAL_RESET"),
  "補正の変更理由とサーバー監査を必須にしてください");
assert(editorSource.includes('SHEET: "__MANUAL_INPUT"') &&
  editorSource.includes("auditWorkspaceManualWrite_") &&
  auditSource.includes('name === RENEWAL_AUDIT_MANUAL.SHEET'),
  "補正データは生成シートと分離して保持してください");
assert(editorSource.includes("renewalPdfExportAndSave_(") &&
  auditSource.includes("auditWorkspaceSelectRows_"),
  "補正保存後は同じ監査シートとPDFへ反映してください");
assert(personSource.includes('"person-workbook:" + record.recordId') &&
  personSource.includes("pdfUrl: pdf.url"),
  "個人資料ブックもPDFへ自動保存してください");
assert(pdfSource.includes('OUTPUT_FOLDER_ID: "1mEa7LjNYge-Nesu02-zoyycwEpaEh_qZ"') &&
  pdfSource.includes("Drive.Files.export") &&
  pdfSource.includes("artifactUpdateBlobFileContent_"),
  "指定フォルダへのPDF変換・同一ファイル更新が必要です");
assert(artifactsSource.includes('courseVenues: ["CDP北海道校"]') &&
  artifactsSource.includes("artifactNormalizeCourseVenues_"),
  "会場候補を共有設定として正規化・保存してください");

console.log("audit workspace logic tests passed");
