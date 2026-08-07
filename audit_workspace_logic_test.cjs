const assert = require("node:assert/strict");
const fs = require("node:fs");
const acorn = require("acorn");
const cheerio = require("cheerio");
const vm = require("node:vm");

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
assert.equal($("#testAuditWorkspaceSample").length, 1,
  "正式資料と分離したサンプル監査資料のテストボタンがありません");
assert.equal($("[data-audit-edit]").length, 4,
  "監査画面には4資料それぞれの編集ボタンが必要です");
assert.equal($("#auditEditorModal").length, 1,
  "監査資料の編集画面がありません");
assert.equal($("#auditEditorReason").length, 1,
  "監査資料の変更理由入力がありません");
assert.equal($("#courseVenue").is("select"), true,
  "講習会場はプルダウンにしてください");
for (let index = 1; index <= 4; index += 1) {
  assert.equal($("#scheduleVenue" + index).is("select"), true,
    "更新講習案内の日程" + index + "の会場も共通プルダウンにしてください");
}
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
assert(auditSource.includes("function apiCreateOrUpdateAuditWorkspaceSample") &&
  auditSource.includes("complianceEnsureSampleFolder_") &&
  auditSource.includes('"サンプル_正式使用禁止_"'),
  "サンプル監査資料は正式資料と別のAPI・フォルダ・ファイル名で作成してください");
assert(auditSource.indexOf("if (!sampleMode && records.length === 0)") <
  auditSource.indexOf("artifactEnsureAutoRoot_(outputFolderId, allowedEmails)"),
  "正式対象者0件ではDriveの作成・更新前に停止してください");
assert(auditSource.includes("auditWorkspaceVerifyOutput_") &&
  auditSource.includes("AUDIT_WORKSPACE_SAMPLE_CREATE") &&
  auditSource.includes("AUDIT_WORKSPACE_SAMPLE_UPDATE"),
  "サンプル出力は4シートの読戻し検査と専用監査ログが必要です");
assert(auditSource.includes("合成サンプル請求・入金（正式会計台帳は不使用）"),
  "サンプル収納記録の注記は正式会計明細と誤認しない表現にしてください");
assert(scriptMatch[1].includes('serverCall(sampleMode ? "apiCreateOrUpdateAuditWorkspaceSample"') &&
  scriptMatch[1].includes("読戻し検査: 4シート合格"),
  "画面からサンプルAPIを呼び、4シートの検査件数を表示してください");
assert(auditSource.includes('"audit-workspace:") + fiscalYear') &&
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
  pdfSource.includes('Drive.Files.export(id, "application/pdf", { alt: "media" })') &&
  pdfSource.includes("DriveApp.getFileById(id).getAs(MimeType.PDF)") &&
  pdfSource.includes("artifactUpdateBlobFileContent_"),
  "alt=media付きPDF変換・標準変換フォールバック・同一ファイル更新が必要です");
assert(artifactsSource.includes('courseVenues: ["CDP北海道校"]') &&
  artifactsSource.includes("artifactNormalizeCourseVenues_"),
  "会場候補を共有設定として正規化・保存してください");
assert(scriptMatch[1].includes("function configuredCourseVenues(") &&
  scriptMatch[1].includes("function renderCourseVenueSelect(") &&
  scriptMatch[1].includes('document.getElementById("scheduleVenue" + index)') &&
  scriptMatch[1].includes('.schedule-table input, .schedule-table select'),
  "登録画面と案内日程マスタは同じ共有会場候補を使用する必要があります");

const sandbox = {
  artifactText_: (value) => String(value == null ? "" : value).trim(),
  artifactValidIsoDateOrBlank_: (value) => /^20\d{2}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "",
  artifactRecordName_: (record) => String(record.targetName || record.name || record.studentName || ""),
  auditWorkspaceSelectRows_: (_key, rows) => rows,
  console
};
vm.createContext(sandbox);
vm.runInContext(auditSource, sandbox);
const sampleRecords = sandbox.auditWorkspaceBuildSampleRecords_("2026");
assert.equal(sampleRecords.length, 2, "一等・二等の2件の固定サンプルが必要です");
const sampleContext = {
  fiscalYear: "2026",
  records: sampleRecords,
  finance: null,
  sampleMode: true,
  manualState: { version: 0, documents: {} }
};
const sampleCounts = sandbox.auditWorkspaceValidateRows_(sampleContext, true);
assert.deepEqual(JSON.parse(JSON.stringify(sampleCounts)), {
  plan: 2,
  status: 2,
  ledger: 2,
  payment: 4
}, "サンプルは4資料すべてに明細を作成してください");
const paymentRows = sandbox.auditWorkspaceSamplePaymentRows_(sampleContext);
assert.equal(paymentRows.filter((row) => row[0] === "請求").length, 2,
  "サンプル収納記録には請求を作成してください");
assert.equal(paymentRows.filter((row) => row[0] === "入出金").length, 2,
  "サンプル収納記録には入金を作成してください");
assert(paymentRows.every((row) => String(row[11]).startsWith("SAMPLE-")),
  "サンプル会計行は正本IDでも識別できる必要があります");

console.log("audit workspace logic tests passed");
