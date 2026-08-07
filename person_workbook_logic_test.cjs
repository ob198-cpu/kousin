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
assert.equal($("#exportCertificatePdf").length, 1,
  "編集画面に06_修了証明書PDF出力ボタンが必要です");
assert.equal($("#certificatePdfResult").length, 1,
  "06_修了証明書PDFの処理結果表示欄が必要です");
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
  "apiCreateOrUpdatePersonCertificatePdf",
  "apiGetPersonWorkbookLink",
  "personWorkbookResolve_",
  "personWorkbookUpdate_",
  "personWorkbookAssertAdminOnlyAcl_"
].forEach((name) => {
  assert(source.includes("function " + name + "("), name + "がありません");
});

const expectedSheets = [
  "00_概要",
  "01_別添03_講習記録簿",
  "05_申込・証憑保管",
  "06_修了証明書",
  "07_DIPS CSV"
];
expectedSheets.forEach((name) => {
  assert(source.includes('name: "' + name + '"'), name + "が固定シートにありません");
});
assert(source.includes('{ key: "evidence", name: "05_申込・証憑保管", pdfLandscape: true }') &&
  source.includes('{ key: "dips", name: "07_DIPS CSV", pdfLandscape: true }'),
  "05_申込・証憑保管と07_DIPS CSVは横向きPDF指定が必要です");
[
  "00_概要",
  "01_別添03_講習記録簿",
  "06_修了証明書"
].forEach((name) => {
  assert(source.includes('name: "' + name + '", pdfLandscape: false'),
    name + "は縦向きPDF指定を維持する必要があります");
});
assert(source.includes("renewalPdfExportPersonWorkbookAndSave_(") &&
  source.includes("pdfFiles: pdf.files"),
  "対象者資料は固定5シートをシート別PDFとして保存・返却する必要があります");
const certificatePdfApi = source.slice(
  source.indexOf("function apiCreateOrUpdatePersonCertificatePdf("),
  source.indexOf("function apiGetPersonWorkbookLink(")
);
assert(certificatePdfApi.includes("__personWorkbookCertificatePdfOnly") &&
  source.includes("certificatePdfOnly ? [certificateSpec]") &&
  source.includes('personWorkbookCertificateSpec_()'),
  "証明書PDF専用APIは06シートだけを縦向きPDFへ保存する必要があります");
assert(source.includes("hasCompleteWorkbook") &&
  source.includes("RENEWAL_PERSON_WORKBOOK.SHEETS.every"),
  "初回・不完全ブックでは固定5シートを安全に復元する必要があります");

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

const openApi = source.slice(
  source.indexOf("function apiGetPersonWorkbookLink("),
  source.indexOf("function personWorkbookLinkNotFoundResult_(")
);
assert(openApi.includes("artifactLoadCanonicalArtifactRequest_") &&
  openApi.includes("personWorkbookExistingFile_") &&
  openApi.includes("personWorkbookAssertAdminOnlyAcl_"),
  "保存済みファイル取得APIは共有正本の版・対象者・権限を照合する必要があります");
assert(!openApi.includes("personWorkbookResolve_(") &&
  !openApi.includes("artifactEnsureAutoRoot_(") &&
  !openApi.includes("artifactEnsureRecordFolder_(") &&
  !openApi.includes("complianceEnsureSampleFolder_(") &&
  !openApi.includes("setProperty("),
  "ファイルを開く操作でフォルダ・ファイル・登録IDを作成または更新してはいけません");
const existingFileReader = source.slice(
  source.indexOf("function personWorkbookExistingFile_("),
  source.indexOf("function personWorkbookBatchSpecs_(")
);
assert(existingFileReader.includes("personWorkbookAssertFile_") &&
  existingFileReader.includes("getFilesByType(MimeType.GOOGLE_SHEETS)") &&
  !existingFileReader.includes("setProperty(") &&
  !existingFileReader.includes("artifactCreateSpreadsheetInFolder_("),
  "保存済みファイルは識別情報を検査し、読取専用で一意に解決する必要があります");
const ledgerRenderer = source.slice(
  source.indexOf("function personWorkbookRenderLedger_("),
  source.indexOf("function personWorkbookRenderEvidence_(")
);
[
  "更新講習修了証明書番号",
  "受講者氏名",
  "修了証明書種別",
  "講習日",
  "修了証明書の交付の有無",
  "修了証明書の交付年月日",
  "講習修了証明書の有効年月日",
  "備考"
].forEach((header) => {
  assert(
    fs.readFileSync("Artifacts.js", "utf8").includes('"' + header + '"'),
    "発行台帳の見出しがありません: " + header
  );
});
assert(ledgerRenderer.includes("artifactLedgerOutputFields_(context.record)"),
  "対象者資料ブックの発行台帳は共通転記規則を使用する必要があります");
assert(!ledgerRenderer.includes("artifactAssertLedgerTemplateClean_") &&
  ledgerRenderer.includes("personWorkbookCopyPinnedGrid_(") &&
  !ledgerRenderer.includes("SpreadsheetApp.openById") &&
  ledgerRenderer.includes("artifactApplyLedgerOutputHeaders_"),
  "対象者資料ブックの発行台帳はSpreadsheetサービスで原本全体を開かず必要範囲だけを複製する必要があります");
assert(!ledgerRenderer.includes("deleteColumns(") &&
  ledgerRenderer.includes("sheet.getRange(3, 2, 1, values.length)") &&
  ledgerRenderer.includes("personWorkbookSetValuesWithRetry_"),
  "発行台帳は原本のB:I列へ正式8項目を転記する必要があります");
assert(!ledgerRenderer.includes("certificateDeliveredDate") && !ledgerRenderer.includes("record.recordId"),
  "発行台帳の可視列へ実交付日や内部recordIdを混在させてはいけません");
assert(ledgerRenderer.includes("personWorkbookMarkCopiedSample_(sheet)") &&
  !ledgerRenderer.includes('"A24:I24"'),
  "発行台帳のサンプル表示で承認済み原本の行・結合・見た目を変えてはいけません");

const personWorkbookPreflight = source.slice(
  source.indexOf("function apiPreflightPersonWorkbook("),
  source.indexOf("function apiCreateOrUpdatePersonWorkbook(")
);
assert(!personWorkbookPreflight.includes("artifactAssertLedgerTemplateClean_"),
  "作成前検査でDrive原本の完全検査を重複実行してはいけません");
assert(personWorkbookPreflight.includes("別添04・別添05・発行台帳・講習料金収納記録は個人資料へ重複作成せず"),
  "全体資料4種類を個人資料から分離する説明が必要です");
assert(!personWorkbookPreflight.includes("complianceRequireTemplatesReady_();"),
  "個人資料作成を全体資料用原本の準備状態で停止させてはいけません");

const planRenderer = source.slice(
  source.indexOf("function personWorkbookRenderPlan_("),
  source.indexOf("function personWorkbookRenderStatus_(")
);
const trainingRenderer = source.slice(
  source.indexOf("function personWorkbookRenderTraining_("),
  source.indexOf("function personWorkbookRenderPlan_(")
);
assert(trainingRenderer.includes("personWorkbookMarkCopiedSample_(sheet)") &&
  !trainingRenderer.includes("insertRowAfter(32)"),
  "講習記録簿のサンプル表示で承認済み原本の行・結合・見た目を変えてはいけません");
assert(trainingRenderer.includes('classValue === 1') &&
  trainingRenderer.includes('"一等無人航空機操縦士"') &&
  trainingRenderer.includes('"二等無人航空機操縦士"') &&
  trainingRenderer.includes("source.getSheetByName(sourceName)"),
  "資格区分に応じて一等・二等の該当原本シートだけを選択する必要があります");
assert(trainingRenderer.includes(
  "講習記録簿原本のシート名と資格区分が一致しないため作成を停止しました。"
) && trainingRenderer.includes(
  "作成した講習記録簿の資格区分または列構成が一致しないため保存を停止しました。"
), "講習記録簿は原本選択前と作成後の双方で資格区分を再検査する必要があります");
assert(planRenderer.includes("sourceSheet.copyTo(spreadsheet)") &&
  planRenderer.includes("personWorkbookAssertCopiedLayout_") &&
  planRenderer.includes('"B4:C5"') &&
  planRenderer.includes("getRange(2, 4, 1, 31)") &&
  planRenderer.includes("personWorkbookMarkCopiedSample_(sheet)") &&
  !planRenderer.includes('"A10:AK10"') &&
  !planRenderer.includes("setColumnWidths("),
  "別添04は承認済み専用原本を複製し、月・曜日・人数だけ更新する必要があります");

const statusRenderer = source.slice(
  source.indexOf("function personWorkbookRenderStatus_("),
  source.indexOf("function personWorkbookRenderLedger_(")
);
assert(statusRenderer.includes("登録更新講習機関実施状況報告書") &&
  statusRenderer.includes("国土交通大臣　殿") &&
  statusRenderer.includes("添付資料：講習修了者一覧") &&
  statusRenderer.includes('"A12:L23"'),
  "別添05は公式様式の見出し・宛名・12行相当の表構造を再現する必要があります");

const certificateRenderer = source.slice(
  source.indexOf("function personWorkbookRenderCertificate_("),
  source.indexOf("function personWorkbookRenderDips_(")
);
assert(certificateRenderer.includes("航空法第132条の51") &&
  certificateRenderer.includes('"B15:K22"') &&
  certificateRenderer.includes("限定解除") === false &&
  certificateRenderer.includes('"限 定\\n解 除\\n事 項"'),
  "修了証明書は原本の法令文と区分・限定解除事項の表構造を再現する必要があります");

const titleRenderer = source.slice(
  source.indexOf("function personWorkbookTitle_("),
  source.indexOf("function personWorkbookApplyDocumentStyle_(")
);
assert(!titleRenderer.includes("#0b4f8a") &&
  titleRenderer.includes('.setBackground("#ffffff")'),
  "帳票見出しをアプリ風の濃紺帯にしてはいけません");

const layoutHelper = source.slice(
  source.indexOf("function personWorkbookReadGridSnapshotById_("),
  source.indexOf("function personWorkbookRenderOverview_(")
);
[
  "Sheets.Spreadsheets.get",
  "userEnteredFormat",
  "rowMetadata(pixelSize,hiddenByUser)",
  "columnMetadata(pixelSize,hiddenByUser)",
  "frozenRowCount",
  "frozenColumnCount",
  "hideGridlines",
  "merges",
  "Sheets.Spreadsheets.batchUpdate",
  "updateDimensionProperties",
  "mergeCells"
].forEach((token) => {
  assert(layoutHelper.includes(token),
    "原本コピー後のレイアウト検査が不足しています: " + token);
});
assert(!layoutHelper.includes("getColumnWidth") &&
  !layoutHelper.includes("getRowHeight") &&
  !layoutHelper.includes("getBackgrounds"),
  "原本照合でGoogle Sheetsへ多数の小分け取得を実行してはいけません");
const manifest = JSON.parse(fs.readFileSync("appsscript.json", "utf8"));
assert((manifest.dependencies &&
  manifest.dependencies.enabledAdvancedServices || []).some((service) =>
  service.userSymbol === "Sheets" &&
  service.serviceId === "sheets" &&
  service.version === "v4"
), "原本レイアウトの一括検査用にAdvanced Sheets API v4が必要です");
assert(manifest.oauthScopes.includes(
  "https://www.googleapis.com/auth/script.external_request"
), "シート別PDF取得に外部リクエスト権限が必要です");
assert(source.includes('LAYOUT_VERSION: "OFFICIAL_FORMS_V3_PERSON_ONLY"'),
  "対象者資料ブックの帳票レイアウト版がありません");

const dipsRenderer = source.slice(
  source.indexOf("function personWorkbookRenderDips_("),
  source.indexOf("function personWorkbookRenderPayment_(")
);
assert(dipsRenderer.includes("personWorkbookApplyDocumentStyle_(sheet, 2, 11)") &&
  dipsRenderer.includes("sheet.getRange(1, 1, 1, 11)") &&
  dipsRenderer.includes("sheet.getRange(2, 1, 1, 11)") &&
  dipsRenderer.includes('sheet.getRange("A1").setNote(note)') &&
  !dipsRenderer.includes("personWorkbookTitle_"),
  "DIPSシートはCSV出力可能な1行目ヘッダー・2行目データだけにする必要があります");

const updateStart = source.indexOf("function personWorkbookUpdate_(");
const updateEnd = source.indexOf("function personWorkbookEnsureSystemSheet_(");
const updateSource = source.slice(updateStart, updateEnd);
assert(updateSource.includes("artifactAssertDedicatedTemplatePin_") &&
  updateSource.indexOf("artifactAssertDedicatedTemplatePin_") <
    updateSource.indexOf("spreadsheet.setSpreadsheetTimeZone"),
  "個人資料の専用原本は対象者ブックへ書き込む前に固定本文版を照合する必要があります");
assert(updateSource.includes('"certificate", context.settings.certificateTemplateId') &&
  updateSource.includes("complianceAssertPlanTemplateClean_") &&
  updateSource.includes("complianceAssertStatusTemplateClean_") &&
  updateSource.includes('artifactAssertPinnedReferenceSource_("implementationPlanSource")') &&
  updateSource.includes('artifactAssertPinnedReferenceSource_("implementationStatusSource")'),
  "別添04・05・修了証明書の専用原本も書込み前に固定版を検査する必要があります");
assert(source.includes("personWorkbookArchiveFormerGlobalSheets_") &&
  source.includes("__旧_全体資料移行_"),
  "旧個人ブックの全体資料は削除せず非表示履歴へ移行する必要があります");
const systemVerifyPosition = updateSource.indexOf(
  "personWorkbookAssertSystemSheet_("
);
const targetVerifyPosition = updateSource.indexOf(
  "更新後シートの名前・内容を確認できません"
);
const backupDeletePosition = updateSource.indexOf(
  "spreadsheet.deleteSheet(backups[deleteIndex].sheet)"
);
assert(systemVerifyPosition >= 0 &&
  targetVerifyPosition >= 0 &&
  backupDeletePosition > systemVerifyPosition &&
  backupDeletePosition > targetVerifyPosition,
  "旧シート削除は新シートと最終管理情報の検証完了後でなければなりません");
assert(updateSource.includes("systemBefore") &&
  updateSource.includes("systemRollbackError"),
  "更新失敗時は管理シートも元に戻す必要があります");
assert(updateSource.includes('var temporarySheetPrefix = "__準備_" + runTag + "_"') &&
  updateSource.includes("remainingPreparedName.indexOf(temporarySheetPrefix) === 0") &&
  updateSource.includes("spreadsheet.deleteSheet(currentSheets[preparedIndex])"),
  "更新途中で例外になった場合は、その実行で作った準備シートだけを削除する必要があります");
assert(updateSource.includes("cleanupWarnings"),
  "更新確定後の旧シート削除失敗は新シートを破壊せず警告にする必要があります");
assert(updateSource.includes("personWorkbookFlushWithRetry_()") &&
  updateSource.indexOf("personWorkbookFlushWithRetry_()") <
    updateSource.indexOf("prepared.push({"),
  "各シートは次の帳票へ進む前に変更を確定する必要があります");
assert(updateSource.match(/personWorkbookHasReadableContent_/g).length >= 2 &&
  source.includes("function personWorkbookHasReadableContent_(") &&
  !updateSource.includes('getRange("A1").getDisplayValue()'),
  "帳票の読戻し検査はA1固定ではなく、様式内の表示内容全体を確認する必要があります");
assert(updateSource.includes("personWorkbookQuarantineName_") &&
  updateSource.includes("__中断_") &&
  updateSource.includes("削除せず"),
  "前回中断の準備シートは削除せず非表示の中断シートへ退避する必要があります");
assert(!updateSource.includes("前回の更新途中シート") ||
  !updateSource.includes("throw new Error(\\n        \"前回の更新途中シート"),
  "前回中断の準備シートだけを理由に再作成を停止してはいけません");

assert(/serverCall\(\r?\n\s*"apiPreflightPersonWorkbook"/.test(scriptMatch[1]),
  "画面は資料一式の作成前検査APIを呼ぶ必要があります");
assert(scriptMatch[1].includes('"apiCreateOrUpdatePersonWorkbookBatch"') &&
  scriptMatch[1].includes("batchIndex < batchCount") &&
  scriptMatch[1].includes("preflight.summary") &&
  source.includes("RENEWAL_PERSON_WORKBOOK.SHEETS.slice(index, index + 1)") &&
  source.includes("batchIndex >= RENEWAL_PERSON_WORKBOOK.SHEETS.length") &&
  source.includes("finalize: batchIndex === RENEWAL_PERSON_WORKBOOK.SHEETS.length - 1"),
  "画面は個人資料5帳票を1シートずつ分けて作成・更新する必要があります");
assert(scriptMatch[1].includes("google.script.url.getLocation") &&
  scriptMatch[1].includes('get("resumeBatch")') &&
  scriptMatch[1].includes("isSyntheticSampleRecord(currentRecord)") &&
  scriptMatch[1].includes("let batchIndex = startBatchIndex"),
  "合成サンプルだけは確認済みの途中段階から安全に再開できる必要があります");
assert(scriptMatch[1].includes("Googleの一時エラーを検出しました") &&
  scriptMatch[1].includes("preservationRequired !== true") &&
  scriptMatch[1].includes("attempt < 2"),
  "Google Sheetsの一時エラーだけを同じシートで1回再試行する必要があります");
assert(/openArtifactModal\(record\);\r?\n\s*runPersonWorkbook\(record\);/.test(scriptMatch[1]),
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
