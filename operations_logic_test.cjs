const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const acorn = require("acorn");
const cheerio = require("cheerio");
const { Linter } = require("eslint");

const html = fs.readFileSync("Index.html", "utf8");
const codeSource = fs.readFileSync("Code.js", "utf8");
const financeSource = fs.readFileSync("Finance.js", "utf8");
const financeStoreSource = fs.readFileSync("FinanceStore.js", "utf8");
const financeDisasterRestoreSource =
  fs.readFileSync("FinanceDisasterRestore.js", "utf8");
const claspIgnoreSource = fs.readFileSync(".claspignore", "utf8");
const appsScriptManifest = JSON.parse(
  fs.readFileSync("appsscript.json", "utf8")
);
const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert(scriptMatch, "script要素がありません");
acorn.parse(scriptMatch[1], { ecmaVersion: "latest", sourceType: "script" });
const lintMessages = new Linter().verify(scriptMatch[1], {
  env: { browser: true, es6: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "script" },
  globals: { google: "readonly" },
  rules: { "no-undef": "error" }
});
assert.deepEqual(lintMessages.filter((message) => message.fatal || message.ruleId === "no-undef"), [],
  "画面スクリプトに未定義変数があります");

function topLevelFunctionNames(source) {
  return acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script"
  }).body.filter((node) =>
    node.type === "FunctionDeclaration"
  ).map((node) => node.id.name);
}
const financeStoreFunctions = topLevelFunctionNames(financeStoreSource);
const financeDisasterFunctions =
  topLevelFunctionNames(financeDisasterRestoreSource);
assert.deepEqual(
  financeDisasterFunctions.filter((name) =>
    financeStoreFunctions.includes(name)
  ),
  [],
  "FinanceStore and FinanceDisasterRestore must not declare duplicate globals"
);
[
  "financeStorePrepareDisasterRestore_",
  "financeStoreConfirmDisasterRestore_",
  "financeStoreGetOrCreateRestoreStage_",
  "financeStoreEnsurePostRestoreBaselineBackup_"
].forEach((name) => {
  assert.equal(financeDisasterFunctions.includes(name), true,
    name + " must be owned by FinanceDisasterRestore.js");
  assert.equal(financeStoreFunctions.includes(name), false,
    name + " must not remain in FinanceStore.js");
});
assert.equal(
  financeStoreFunctions.filter((name) =>
    name === "financeStoreLoadRegisteredBackup_"
  ).length,
  1,
  "the registered backup loader must have one FinanceStore owner"
);
assert.equal(
  financeDisasterFunctions.includes("financeStoreLoadRegisteredBackup_"),
  false,
  "the DR module must reuse, not duplicate, the registered backup loader"
);
assert.equal(claspIgnoreSource.includes("FinanceDisasterRestore.js"), false);
assert.equal(
  claspIgnoreSource.split(/\r?\n/).some((line) =>
    line.trim() === "*.js" || line.trim() === "**/*.js"
  ),
  false,
  "FinanceDisasterRestore.js must remain in the clasp upload set"
);

const $ = cheerio.load(html);
const ids = $("[id]").map((_, element) => $(element).attr("id")).get();
assert.equal(new Set(ids).size, ids.length, "HTMLに重複IDがあります");

const declarationStart = scriptMatch[1].indexOf("const TRAINING_MODULES");
const declarationEnd = scriptMatch[1].indexOf("const SAMPLE_RECORDS");
const declarationContext = {};
vm.createContext(declarationContext);
vm.runInContext(scriptMatch[1].slice(declarationStart, declarationEnd) +
  "\nthis.schema = { FIELD_IDS, CSV_COLUMNS };", declarationContext);
const formFieldIds = $("#entryForm input[id], #entryForm select[id], #entryForm textarea[id]")
  .map((_, element) => $(element).attr("id")).get().sort();
assert.deepEqual(Array.from(declarationContext.schema.FIELD_IDS).sort(), formFieldIds, "画面項目とFIELD_IDSが一致しません");
assert.deepEqual(Array.from(declarationContext.schema.CSV_COLUMNS, (column) => column[0]).sort(),
  formFieldIds.filter((id) => id !== "recordId"), "画面項目とCSV_COLUMNSが一致しません");

[
  "renewalListNo", "courseAvailableDate", "courseDeadlineDate", "noticeSixMonthDate",
  "noticeSixMonthStatus", "noticeThreeMonthDate", "noticeThreeMonthStatus", "noticeLetter1",
  "noticeLetter2", "courseVenue", "renewalListAmount", "renewalListAmountTaxBasis", "renewalListMemo",
  "practicalVenue", "aircraftType", "eligibilityCheckStatus", "eligibilityCheckedDate", "eligibilityCheckedBy",
  "eligibilityEvidence", "certificateDelivered", "certificateDeliveredDate", "certificateLedgerMemo", "skillsApplicantNo",
  "certificateInstructor", "dipsCompletionLinkedDate", "dipsApplicantId", "suspensionCourse", "fitnessCertificateNo",
  "dipsRecordMode", "billingRecipientName", "billingHonorific", "billingAddress", "quoteNo",
  "quoteDate", "quoteExpiry", "taxExceptionApprovalDate", "taxExceptionApprovedBy", "taxExceptionReason"
].forEach((id) => assert.equal($("#" + id).length, 1, id + "が画面にありません"));

[
  "artifactModal", "artifactPreflight", "artifactCreateResults", "preflightArtifacts", "createArtifacts",
  "saveArtifactSettings", "reloadArtifactSettings", "saveScheduleMaster", "artifactOutputFolderId",
  "artifactAllowedOutputEmails", "artifactCertificateTemplateId", "artifactLedgerTemplateId",
  "artifactDipsAdditionalClosedDates", "artifactDipsCalendarConfirmedDate", "artifactDipsCalendarConfirmedBy",
  "artifactNumberingInitialized", "artifactNumberingCutoverMonth", "artifactCertificateSequenceSeed", "artifactDipsSequenceSeed",
  "paidTotal", "appliedTotal", "outstandingTotal", "overpaymentTotal", "financeAccountingFrom", "financeAccountingTo"
].forEach((id) => assert.equal($("#" + id).length, 1, id + "が画面にありません"));
const pinnedOutputFolderId = "1XmQirjBrQR-uC_GuBVXAyRK5zfqtoQwN";
assert.equal($("#artifactOutputFolderId").is("[readonly]"), true,
  "成果物の固定保存先は利用者が編集できない必要があります");
assert.equal($("#artifactOutputFolderId").val(), pinnedOutputFolderId,
  "成果物の固定保存先表示が承認済み2026年度フォルダと一致しません");
assert(scriptMatch[1].includes('const PINNED_ARTIFACT_OUTPUT_FOLDER_ID = "' + pinnedOutputFolderId + '"'),
  "画面の固定保存先定数が承認済みIDと一致しません");
assert(scriptMatch[1].includes('document.getElementById("artifactOutputFolderId").value = PINNED_ARTIFACT_OUTPUT_FOLDER_ID'),
  "サーバー応答から別IDを受けても画面表示を固定IDへ戻す必要があります");
assert(scriptMatch[1].includes("payload.outputFolderId !== PINNED_ARTIFACT_OUTPUT_FOLDER_ID"),
  "設定保存直前にも固定保存先IDを検査する必要があります");
assert(scriptMatch[1].includes("旧保存先の設定あり（ID: ") &&
  scriptMatch[1].includes("監査済み旧保存先履歴: "),
  "旧保存先の監査付き移行が必要な警告表示がありません");
assert(scriptMatch[1].includes("let artifactSettingsVersion = 0") &&
  scriptMatch[1].includes("artifactSettingsVersion = Number(data.settingsVersion || 0)"),
  "成果物設定の共有版番号を保持する必要があります");
assert(
  /serverCall\("apiSaveArtifactSettings",\s*\{[\s\S]*?schedules:\s*state\.schedules,[\s\S]*?expectedVersion:\s*artifactSettingsVersion,[\s\S]*?idempotencyKey:\s*makeId\("artifact-settings"\)/.test(scriptMatch[1]),
  "案内日程保存にも設定版とidempotencyKeyが必要です"
);
const artifactSettingsSaveBlock = scriptMatch[1].slice(
  scriptMatch[1].indexOf("async function saveArtifactSettings()"),
  scriptMatch[1].indexOf("function selectedArtifactKinds()")
);
assert(artifactSettingsSaveBlock.includes("expectedVersion: artifactSettingsVersion") &&
  artifactSettingsSaveBlock.includes('idempotencyKey: makeId("artifact-settings")'),
  "事業者設定保存に設定版とidempotencyKeyが必要です");
assert.deepEqual($("input[name='artifactKind']").map((_, element) => $(element).val()).get(),
  ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"]);
assert.equal($("#certificateExpiry").is("[readonly]"), true, "修了証明書期限は自動計算欄である必要があります");
assert.deepEqual($("#dipsRecordMode option").map((_, element) => $(element).text()).get(),
  ["新規登録", "既存情報更新", "削除"]);
assert.deepEqual($("#suspensionCourse option").map((_, element) => $(element).text()).get(),
  ["未確認", "なし", "あり"]);
assert(html.includes("二等・6分以上"), "二等マルチローターの実地操縦演習は6分以上と表示する必要があります");
assert(html.includes("DIPS修了者情報を5営業日以内に連携"), "DIPSの5営業日タスクがありません");
assert(html.includes("担当部署に確認が必要"), "DIPS営業日定義の未確認表示がありません");
assert.equal(scriptMatch[1].includes('if (!(raw || {}).invoiceStatus && record.invoiceDate) record.invoiceStatus = "発行済"'), false,
  "請求日だけで発行済へ自動確定してはいけません");
assert.equal(scriptMatch[1].includes('record.certificateDelivered = "有り"'), false,
  "番号・日付だけで証明書交付済へ自動確定してはいけません");
assert.equal(scriptMatch[1].includes("periodExpiryFromDate(data.fitnessCheckedDate, 3)"), false,
  "身体適性資料期限をCDPの確認日から自動計算してはいけません");
assert(scriptMatch[1].includes("講習修了日に未来日は登録できません。"), "講習修了日の未来日検査がありません");
assert(scriptMatch[1].includes("の受講日に未来日は登録できません。"), "講習記録日の未来日検査がありません");
assert(scriptMatch[1].includes("の受講日は講習修了日以前にしてください。"), "講習記録日と修了日の前後関係検査がありません");
assert(scriptMatch[1].includes("講習記録を登録する場合は講習修了日が必要です。"), "講習記録の修了日必須検査がありません");
assert(scriptMatch[1].includes("DIPS更新申請日は修了証明書発行日以後にしてください。"), "DIPS更新申請日と証明書発行日の前後関係検査がありません");
assert(scriptMatch[1].includes("DIPS更新申請日に未来日は登録できません。"), "DIPS更新申請日の未来日検査がありません");
assert(scriptMatch[1].includes("更新完了確認日はDIPS更新申請日以後にしてください。"), "更新完了確認日とDIPS更新申請日の前後関係検査がありません");
assert(scriptMatch[1].includes("更新完了確認日に未来日は登録できません。"), "更新完了確認日の未来日検査がありません");
assert(html.includes("正式成果物の作成履歴がある番号は変更できません。"), "証明書番号の継続性案内がありません");
assert(html.includes("一度成果物へ使った見積書番号・請求書番号は別番号へ変更できません。"), "帳票番号の継続性案内がありません");

const trainingPrefixes = [
  "academicOverview", "academicRules", "academicLawUpdate", "academicAccident", "academicSafety",
  "academicVideo", "academicFirstClass", "academicFirstClassVideo", "practicalExercise1", "practicalDiscussion"
];
trainingPrefixes.forEach((prefix) => {
  ["Date", "Start", "End", "Instructor"].forEach((suffix) => {
    assert.equal($("#" + prefix + suffix).length, 1, prefix + suffix + "が画面にありません");
  });
});

[
  "14bzaYZ_9dz4BMHNVDx7AfpKFN-3pStoWjKdKOMVeiv0",
  "1b2gjUL0I2vfK-XOvbDhg8oXg36EdADajamivX7wfgC4",
  "1lAO89hPt2FRu-EoqfkS_xCFKVkfrglz5o-ms-qD92yE"
].forEach((spreadsheetId) => assert.equal(html.includes(spreadsheetId), false, spreadsheetId + "を公開HTMLへ埋め込んではいけません"));
assert(html.includes("原本リンクは個人情報保護のため公開画面へ表示しません。"), "公開画面の原本リンク非表示方針がありません");
assert(html.includes("公開Pages版：合成サンプルをメモリ上だけで表示する閲覧専用デモです。"),
  "公開Pages版のメモリ専用・閲覧専用表示がありません");
assert(scriptMatch[1].includes('const LEGACY_STORAGE_KEYS = ["cdp-renewal-license-records-v3"]'), "旧版ブラウザ保存データの移行元がありません");
assert.equal(
  /localStorage\.setItem\(\s*(?:STORAGE_KEY|AUDIT_KEY)\b/.test(scriptMatch[1]),
  false,
  "対象者データ・監査履歴をブラウザへ永続保存してはいけません"
);
assert.equal($("#exportLegacyBrowserData").length, 1, "旧ブラウザ保存の明示JSON退避ボタンがありません");
assert.equal($("#purgeLegacyBrowserData").length, 1, "旧ブラウザ保存の明示削除ボタンがありません");
assert(html.includes("一方から他方の保存データを確認・削除することはできません。"),
  "別originの旧データを自動削除できない説明がありません");
assert(scriptMatch[1].includes('confirm: "COMMIT_LOCAL_STORAGE_MIGRATION_BATCH"'),
  "共有正本への一括反映は明示確定語を送る必要があります");
assert(scriptMatch[1].includes('serverCall("apiPreviewBrowserMigration"'),
  "ブラウザ移行・CSV取込にはサーバー側プレビューが必要です");
assert.equal(scriptMatch[1].includes('serverCall("apiImportBrowserCsv"'), false,
  "CSVをサーバー側プレビューなしの一段階APIで確定してはいけません");
assert(codeSource.includes("function apiRecordBrowserStoragePurge(input)") &&
  codeSource.includes("storeRecordBrowserStoragePurge_(input || {})"),
  "旧ブラウザ保存の削除証跡APIが公開されていません");
assert(codeSource.includes("function apiConfirmMutationAudit(input)") &&
  codeSource.includes("storeConfirmAuditedMutation_(input || {})"),
  "保存済み単票更新の監査確定を再照合するAPIが公開されていません");
const mutationAuditConfirmSource = extractFunction(
  scriptMatch[1], "confirmStoreMutationAudit"
);
assert(
  mutationAuditConfirmSource.includes(
    'serverCall("apiConfirmMutationAudit"'
  ) &&
  mutationAuditConfirmSource.includes("confirmation.committed !== true") &&
  mutationAuditConfirmSource.includes("同じ内容を再登録せず"),
  "保存済みデータを二重登録せず監査だけ再照合する必要があります"
);
assert.equal($("#artifactFinanceInvoiceId").length, 1, "請求帳票に使う発行済み正式請求の選択欄がありません");
assert(scriptMatch[1].includes('serverCall("apiPreflightArtifacts", artifactServerRequest(request))'),
  "成果物の作成前検査は正本ID・版・hashだけを送る必要があります");
assert(scriptMatch[1].includes('serverCall("apiCreateArtifacts", artifactServerRequest(preflightRequest))'),
  "成果物作成は検査済みの正本ID・版・hashを送る必要があります");
assert.equal(scriptMatch[1].includes("mergeArtifactRecordUpdates"), false,
  "成果物作成後にブラウザから正本を二重更新してはいけません");
assert(scriptMatch[1].includes("result.canonical"),
  "成果物作成後はサーバーが返した正本を再読込する必要があります");
assert(scriptMatch[1].includes("response.committed === true && response.recoveryNeeded === true"),
  "会計イベント確定後の派生データ復旧待ちを二重登録防止表示する必要があります");
[
  "formalInvoiceSelector", "formalReceiptAllocationBody", "formalUnallocatedReceiptBody",
  "formalAllocationHistoryBody", "requestInvoiceReversal", "requestInvoiceCorrection",
  "formalTransactionReversalTarget", "formalTransactionReversalKind",
  "formalTransactionReversalCustomer", "formalTransactionReversalAmount",
  "formalTransactionReversalDate", "formalTransactionReversalReason",
  "requestFormalTransactionReversal",
  "financeCloseSummary", "financeClosedPeriodsBody"
].forEach((id) => assert.equal($("#" + id).length, 1, id + "が正式会計画面にありません"));
[
  "formalTransactionReversalKind",
  "formalTransactionReversalCustomer",
  "formalTransactionReversalAmount"
].forEach((id) => assert.equal($("#" + id).is("[readonly]"), true,
  id + "はサーバー正本から表示する閲覧専用欄である必要があります"));
assert(scriptMatch[1].includes('type: "REVERSE_ALLOCATION"'),
  "消込訂正は反対取引として承認申請する必要があります");
[
  "REVERSE_RECEIPT", "REVERSE_REFUND", "REVERSE_SETTLEMENT"
].forEach((type) => assert(scriptMatch[1].includes('"' + type + '"'),
  type + "の反対取引導線がありません"));
assert(scriptMatch[1].includes('type: "REVERSE_INVOICE"') &&
  scriptMatch[1].includes('type: "CORRECT_INVOICE"'),
  "発行済請求の取消・訂正版発行コマンドがありません");
assert(scriptMatch[1].includes("financeApprovalHasReviewDetails") &&
  scriptMatch[1].includes("操作内容と照合ハッシュを確認できないため承認できません"),
  "内容・hash未確認の会計承認を停止する必要があります");
assert(scriptMatch[1].includes("formalUnallocatedReceipts") &&
  scriptMatch[1].includes("buildFormalAllocationCommand"),
  "未消込入金を後から複数請求へ割り当てる導線がありません");
assert(scriptMatch[1].includes("FINANCE_PENDING_STORAGE_KEY") &&
  scriptMatch[1].includes("prepareFinanceCommandSubmission") &&
  scriptMatch[1].includes("idempotencyKey: submission.idempotencyKey"),
  "会計操作は同じ内容・同じ再送防止キーで安全再送できる必要があります");
assert(scriptMatch[1].includes("prepareFinanceApprovalExecution") &&
  scriptMatch[1].includes("idempotencyKey: approvalExecution.idempotencyKey"),
  "会計承認の実行にも安定した再送防止キーが必要です");
assert(scriptMatch[1].includes("prepareFinanceApprovalRequestSubmission") &&
  scriptMatch[1].includes('operationKind: "APPROVAL_REQUEST"') &&
  /serverCall\("apiRequestFinanceApproval",\s*\{[\s\S]*?idempotencyKey: submission\.idempotencyKey/.test(scriptMatch[1]),
  "会計承認の申請にも安定した再送防止キーと保留中の安全再送が必要です");
assert.equal($("#checkFinanceHealth").length, 1, "会計台帳の完全検査ボタンがありません");
assert(scriptMatch[1].includes('serverCall("apiCheckFinanceHealth", { forceFullReplay: true })'),
  "会計締め前に全イベント再生による完全検査が必要です");
[
  "sharedBackupRestorePanel", "reloadSharedBackupRestore", "sharedBackupRestoreStatus",
  "sharedBackupTableBody", "sharedRestoreRequestPanel", "sharedRestoreApprover",
  "sharedRestoreReasonCode", "prepareSharedRestore", "sharedPendingRestoreBody"
].forEach((id) => assert.equal($("#" + id).length, 1, id + "が登録済み共有バックアップ画面にありません"));
[
  "apiListSharedBackups", "apiVerifySharedBackup", "apiPrepareSharedRestore",
  "apiListPendingSharedRestores", "apiConfirmSharedRestore", "apiRejectSharedRestore"
].forEach((method) => assert(scriptMatch[1].includes('"' + method + '"'),
  method + "を使う管理者向け復元導線がありません"));
assert(html.includes("正式会計台帳・会計イベント・請求・入金・消込・仕訳は一切復元しません。") &&
  html.includes("正式会計に紐づく対象者レコードの変更が含まれる場合は、サーバーが復元申請と確定を停止します。"),
  "共有バックアップ復元画面に正式会計を復元しない安全範囲の警告がありません");
assert.equal(scriptMatch[1].includes("row.driveFileId"), false,
  "登録済みバックアップ一覧へDriveファイル識別子を表示してはいけません");
assert(scriptMatch[1].includes('if (row.canApprove === true &&') &&
  scriptMatch[1].includes('["AWAITING_APPROVAL", "COMMITTING"].indexOf(row.status) >= 0'),
  "サーバーがcanApproveを返した指定承認者だけに復元確定・却下操作を表示する必要があります");

[
  "financeDisasterRestorePanel", "reloadFinanceDisasterRestore",
  "financeDisasterRestoreStatus", "financeDisasterBackupBody",
  "financeDisasterRequestPanel", "financeDisasterVerificationStatus",
  "financeDisasterApprover", "financeDisasterReasonCode",
  "prepareFinanceDisasterRestore", "financeDisasterRestoreBody"
].forEach((id) => assert.equal($("#" + id).length, 1,
  id + " must exist exactly once in the finance recovery panel"));
assert.equal($("#financeDisasterRestorePanel").is("[hidden]"), true,
  "finance disaster recovery must be hidden by default");
assert(
  String($("#financeDisasterRestorePanel .settings-confirmation").attr("style") || "")
    .includes("border-color:#b42318") &&
  String($("#financeDisasterRestorePanel .settings-confirmation strong").attr("style") || "")
    .includes("color:#b42318"),
  "finance disaster recovery must display a red danger warning"
);
[
  "apiListFinanceBackups", "apiVerifyFinanceBackup",
  "apiPrepareFinanceDisasterRestore", "apiListFinanceDisasterRestores",
  "apiConfirmFinanceDisasterRestore", "apiRejectFinanceDisasterRestore"
].forEach((method) => assert(scriptMatch[1].includes('"' + method + '"'),
  method + " must be called through the server UI"));
assert(scriptMatch[1].includes("FINANCE_RESTORE_UNKNOWN_STORAGE_KEY") &&
  scriptMatch[1].includes("markFinanceRestoreUnknown(requestId)"),
  "unknown finance restore results must block blind retries");

function extractFunction(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, name + "が見つかりません");
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(name + "の終端が見つかりません");
}

function extractParsedFunction(source, name) {
  const node = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script"
  }).body.find((item) =>
    item.type === "FunctionDeclaration" && item.id && item.id.name === name
  );
  assert(node, name + "が見つかりません");
  return source.slice(node.start, node.end);
}

const setupSharedStoreSource = extractFunction(
  scriptMatch[1], "setupSharedStore"
);
assert(
  setupSharedStoreSource.includes("初期設定はWeb画面から実行できません") &&
  !setupSharedStoreSource.includes('serverCall("apiSetupSystem'),
  "初期共有正本セットアップをWeb画面から呼び出してはいけません"
);
assert(
  $("#setupSharedStore").is("[disabled]") &&
  codeSource.includes("function ownerAuthorizeDeployment()") &&
  codeSource.includes("return authorizeDeploymentOwner_();") &&
  codeSource.includes("function ownerSetupWorkspaceSystem()") &&
  codeSource.includes("return setupDedicatedSystemAsOwner_();") &&
  codeSource.includes("function ownerSetupPersonalSingleUserSystem()") &&
  codeSource.includes("return setupDedicatedSingleUserAsOwner_(") &&
  codeSource.includes("function ownerInstallDailyBackupTrigger()") &&
  codeSource.includes("return installDailyBackupTriggerAsOwner_();") &&
  codeSource.includes("function setupDedicatedSystemAsOwner_()") &&
  codeSource.includes(
    "deploymentMode: RENEWAL_STORE.SETUP_MODE_WORKSPACE"
  ) &&
  codeSource.includes("function setupDedicatedSingleUserAsOwner_(confirmText)") &&
  codeSource.includes("RENEWAL_STORE.PERSONAL_SETUP_CONFIRM") &&
  codeSource.includes("function apiSetupSystem_(input)") &&
  !codeSource.includes("function apiSetupSystem(input)"),
  "初期設定関数はWeb非公開にし、Workspaceと明示確認付き個人単独を分離する必要があります"
);
[
  "ownerAuthorizeDeployment",
  "ownerSetupWorkspaceSystem",
  "ownerSetupPersonalSingleUserSystem",
  "ownerInstallDailyBackupTrigger"
].forEach((ownerEntryPoint) => {
  assert(
    !scriptMatch[1].includes(ownerEntryPoint),
    ownerEntryPoint + " must never be called by the browser UI"
  );
});
assert(
  appsScriptManifest.oauthScopes.includes("openid") &&
  appsScriptManifest.webapp.executeAs === "USER_DEPLOYING",
  "署名済みGoogle identityのWorkspace確認とデプロイ所有者実行が必要です"
);

const financeCorrectionSource = extractParsedFunction(
  financeSource, "financeCorrectInvoice_"
);
assert(
  financeCorrectionSource.includes("financeAssertOnlyReversalFields_") &&
  financeCorrectionSource.includes("CORRECTION_NOT_FULL_REVERSAL") &&
  (financeCorrectionSource.match(
    /financeInvoicePosition_\([^)]*originalInvoice\.id\)\.effectiveBilled !== 0/g
  ) || []).length === 2,
  "CORRECT_INVOICE must reject browser cancellation lines and verify the original effective balance is zero before and after replacement issue"
);
const correctionSealSource = extractParsedFunction(
  financeStoreSource, "financeStoreSealCorrectionCommand_"
);
assert(
  correctionSealSource.includes("originalInvoiceAmount") &&
  correctionSealSource.includes("cancellationAmount") &&
  correctionSealSource.includes("replacementAmount") &&
  correctionSealSource.includes('"FULL_ACTIVE_BILLING_BALANCE"'),
  "correction approval sealing must distinguish original gross, actual cancellation, and replacement amounts"
);
const correctionPreparationSource = extractParsedFunction(
  financeStoreSource, "financeStorePrepareCorrectionCommand_"
);
assert(
  correctionPreparationSource.includes(
    "artifactBuildFormalBillingSnapshotForFinance_"
  ) &&
  !correctionPreparationSource.includes("reversal.lines"),
  "normal correction preparation must use the server billing snapshot and never accept cancellation lines"
);
const correctionShapeSource = extractParsedFunction(
  financeStoreSource, "financeStoreValidateCorrectionCommandShape_"
);
assert(
  correctionShapeSource.includes("financeAssertOnlyReversalFields_") &&
  !correctionShapeSource.includes("lines: true"),
  "malicious reversal.lines must not be part of the accepted correction command schema"
);

const webGateState = {
  configuredId: "",
  active: "owner@example.com",
  effective: "owner@example.com",
  anchorOwner: "owner@example.com",
  role: "admin",
  storeFailure: ""
};
function testHtmlOutput(htmlValue) {
  return {
    html: htmlValue,
    title: "",
    setTitle(value) { this.title = value; return this; },
    addMetaTag() { return this; }
  };
}
const webGateContext = {
  WEB_ACCESS_DENIED_MESSAGE:
    "この画面は利用できません。組織のシステム管理者へ連絡してください。",
  RENEWAL_STORE: {
    SPREADSHEET_ID_KEY: "CDP_RENEWAL_DATA_STORE_SPREADSHEET_ID_V1"
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: () => webGateState.configuredId
    })
  },
  Session: {
    getActiveUser: () => ({ getEmail: () => webGateState.active }),
    getEffectiveUser: () => ({ getEmail: () => webGateState.effective })
  },
  storeOpen_: () => {
    if (webGateState.storeFailure) throw new Error(webGateState.storeFailure);
    return { id: "private-store-must-not-leak" };
  },
  storeRequirePermission_: (_spreadsheet, _actor, permission) => {
    assert.equal(permission, "read");
    if (!webGateState.role) throw new Error("ROLE_SECRET_MUST_NOT_LEAK");
    return webGateState.role;
  },
  storeAssertBootstrapOwnershipAnchor_: (actor) => {
    if (String(actor || "") !== webGateState.anchorOwner) {
      throw new Error("BOOTSTRAP_ANCHOR_MISMATCH_MUST_NOT_LEAK");
    }
    return true;
  },
  HtmlService: {
    createTemplateFromFile: () => ({
      evaluate: () => testHtmlOutput("INDEX")
    }),
    createHtmlOutput: (value) => testHtmlOutput(value)
  }
};
vm.createContext(webGateContext);
vm.runInContext([
  "apiError_", "apiNormalizeWebEmail_", "apiAssertWebAccess_",
  "apiAccessDeniedHtml_", "doGet", "apiResult_"
].map((name) => extractFunction(codeSource, name)).join("\n") +
  "\nthis.openPage = doGet; this.callApi = apiResult_;",
  webGateContext);

assert.equal(webGateContext.openPage().html, "INDEX",
  "未設定時はactive/effectiveが一致するデプロイ所有者だけIndexを開ける必要があります");
webGateState.anchorOwner = "different-owner@example.com";
let deniedOutput = webGateContext.openPage();
assert(deniedOutput.html.includes(webGateContext.WEB_ACCESS_DENIED_MESSAGE),
  "未設定時は固定保存先を所有しない利用者へIndexを開いてはいけません");
assert.equal(
  deniedOutput.html.includes("BOOTSTRAP_ANCHOR_MISMATCH_MUST_NOT_LEAK"),
  false
);
webGateState.anchorOwner = "owner@example.com";
webGateState.effective = "other@example.com";
deniedOutput = webGateContext.openPage();
assert(deniedOutput.html.includes(webGateContext.WEB_ACCESS_DENIED_MESSAGE));
[
  "owner@example.com", "other@example.com", "Authorization needed",
  "authorizationUrl", "private-store-must-not-leak"
].forEach((secret) => assert.equal(deniedOutput.html.includes(secret), false,
  "doGet拒否HTMLへ内部情報を出してはいけません: " + secret));

webGateState.configuredId = "configured";
webGateState.active = "";
webGateState.effective = "owner@example.com";
deniedOutput = webGateContext.openPage();
assert(deniedOutput.html.includes(webGateContext.WEB_ACCESS_DENIED_MESSAGE),
  "設定後はeffective userだけでIndexを開いてはいけません");
webGateState.active = "member@example.com";
webGateState.role = "viewer";
assert.equal(webGateContext.openPage().html, "INDEX",
  "設定後はactive userのread権限を検査してIndexを開く必要があります");
webGateState.storeFailure = "STORE_ID_AND_AUTHORIZATION_URL_MUST_NOT_LEAK";
deniedOutput = webGateContext.openPage();
assert.equal(deniedOutput.html.includes(webGateState.storeFailure), false,
  "正本・認可例外をdoGet拒否HTMLへ出してはいけません");
let unauthorizedCallbackRan = false;
const deniedApi = webGateContext.callApi(() => {
  unauthorizedCallbackRan = true;
  return { success: true };
});
assert.equal(unauthorizedCallbackRan, false, "アクセス拒否時にAPI本体を実行してはいけません");
assert.deepEqual(JSON.parse(JSON.stringify(deniedApi)), {
  success: false,
  code: "ACCESS_DENIED",
  error: webGateContext.WEB_ACCESS_DENIED_MESSAGE
});
assert.equal(JSON.stringify(deniedApi).includes(webGateState.storeFailure), false,
  "API拒否応答へ内部例外を出してはいけません");

const publicMemoryContext = {
  AppData: {
    mode: "browser",
    records: [{ id: "sample-memory-only" }],
    audit: [{ action: "synthetic" }]
  },
  showToast: () => {}
};
vm.createContext(publicMemoryContext);
vm.runInContext([
  "loadRecords", "loadAudit", "saveRecords", "appendAudit"
].map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.records = loadRecords; this.audit = loadAudit;" +
  "\nthis.save = saveRecords; this.append = appendAudit;",
  publicMemoryContext);
assert.deepEqual(JSON.parse(JSON.stringify(publicMemoryContext.records())),
  [{ id: "sample-memory-only" }]);
assert.deepEqual(JSON.parse(JSON.stringify(publicMemoryContext.audit())),
  [{ action: "synthetic" }]);
assert.equal(publicMemoryContext.save([], "mutation", null), false,
  "公開Pages版のsaveRecordsは関数レベルでも拒否する必要があります");
assert.equal(publicMemoryContext.append("mutation", null), false,
  "公開Pages版のappendAuditは永続化してはいけません");

const refreshSharedStoreSourceForPublic = extractFunction(
  scriptMatch[1], "refreshSharedStore"
);
assert(
  refreshSharedStoreSourceForPublic.includes("AppData.records = sampleCopy()") &&
  refreshSharedStoreSourceForPublic.includes("AppData.readOnly = true") &&
  !refreshSharedStoreSourceForPublic.includes("readLegacyBrowserRecordsExplicitly"),
  "公開Pages起動は旧保存を読まず合成サンプルだけをメモリ表示する必要があります"
);
const loadScheduleMasterSource = extractFunction(scriptMatch[1], "loadScheduleMaster");
assert(
  loadScheduleMasterSource.includes("applyScheduleMaster([])") &&
    !loadScheduleMasterSource.includes("localStorage") &&
    !loadScheduleMasterSource.includes("readCachedSchedules"),
  "案内日程はserver設定だけを正本とし、起動時にlocalStorageを読んではいけません"
);
assert.equal(
  (scriptMatch[1].match(/localStorage\.setItem\s*\(/g) || []).length,
  0,
  "対象者・監査・案内日程を通常処理でlocalStorageへ保存してはいけません"
);
assert(
  scriptMatch[1].includes("[AUDIT_KEY, SCHEDULE_KEY]"),
  "旧案内日程は明示JSON退避・削除の対象へ含める必要があります"
);
const publicUiSource = extractFunction(scriptMatch[1], "applyPublicReadOnlyUi");
[
  "[data-edit]", "[data-artifacts]", "[data-finance]", "[data-archive]",
  "[data-new-record]"
].forEach((marker) => assert(publicUiSource.includes(marker),
  "公開Pages版で変更導線を無効化する必要があります: " + marker));
["renderHome", "renderLedger", "renderFinance"].forEach((name) => {
  assert(
    extractFunction(scriptMatch[1], name).includes("applyPublicReadOnlyUi()"),
    name + "の再描画後も公開Pages版の変更導線を再無効化する必要があります"
  );
});
const updateSharedStoreUiSource = extractFunction(scriptMatch[1], "updateSharedStoreUi");
assert(updateSharedStoreUiSource.includes('const canEditRecords = AppData.mode === "server"'),
  "対象者フォームはserver mode以外で有効にしてはいけません");
[
  "persistRecord", "confirmImport", "restoreBackup", "toggleArchive", "resetSamples"
].forEach((name) => {
  const source = extractFunction(scriptMatch[1], name);
  assert.equal(
    /localStorage\.setItem\(\s*(?:STORAGE_KEY|AUDIT_KEY)\b/.test(source),
    false,
    name + "から対象者・監査データをブラウザ保存してはいけません"
  );
});
assert(extractFunction(scriptMatch[1], "persistRecord").includes(
  "公開Pages版は閲覧専用です。対象者データは保存していません。"
), "persistRecordは公開Pages版を関数レベルで拒否する必要があります");
assert(extractFunction(scriptMatch[1], "restoreBackup").includes(
  "JSON復元は無効です。"
), "公開Pages版のJSON復元を無効化する必要があります");

const explicitLegacyReadSource = extractFunction(
  scriptMatch[1], "readLegacyBrowserRecordsExplicitly"
);
assert(explicitLegacyReadSource.includes("[STORAGE_KEY].concat(LEGACY_STORAGE_KEYS)") &&
  explicitLegacyReadSource.includes("localStorage.getItem(key)") &&
  explicitLegacyReadSource.includes("JSON.parse(source.raw)") &&
  explicitLegacyReadSource.includes("現行キーと旧版キーの内容が一致しません。"),
  "旧対象者データは明示移行操作でだけ読み取る必要があります");
const bootstrapSource = extractFunction(scriptMatch[1], "bootstrapApplication");
assert.equal(bootstrapSource.includes("readLegacyBrowserRecordsExplicitly"), false,
  "起動時に旧対象者データを読んではいけません");
assert.equal(bootstrapSource.includes("purgeLegacyBrowserData"), false,
  "起動時に旧ブラウザ保存を自動削除してはいけません");
const legacyExportSource = extractFunction(scriptMatch[1], "exportLegacyBrowserData");
assert(legacyExportSource.includes("readBrowserStorageRescueSnapshotExplicitly"),
  "旧データのparseは明示JSON退避操作からだけ開始する必要があります");
const purgeLegacySource = extractFunction(scriptMatch[1], "purgeLegacyBrowserData");
assert(
  purgeLegacySource.indexOf("localStorage.removeItem(key)") >= 0 &&
  purgeLegacySource.indexOf("localStorage.removeItem(key)") <
    purgeLegacySource.indexOf("localStorage.getItem(key) !== null") &&
  purgeLegacySource.indexOf("localStorage.getItem(key) !== null") <
    purgeLegacySource.indexOf('serverCall("apiRecordBrowserStoragePurge"'),
  "旧データ削除は明示操作でremove→不存在検証→証跡APIの順に行う必要があります"
);
assert(purgeLegacySource.includes("AppData.completedBrowserMigration") &&
  purgeLegacySource.includes("migration.batchId") &&
  purgeLegacySource.includes("migration.sourceHash") &&
  purgeLegacySource.includes("共有正本への移行も完了しています。"),
  "削除証跡失敗時も正本移行済みであることを明示する必要があります");

const sharedRestoreContext = {
  AppData: { mode: "browser", configured: true, role: "admin" }
};
vm.createContext(sharedRestoreContext);
vm.runInContext([
  "canUseSharedBackupRestore", "normalizeSharedRestoreReasonCode",
  "sharedRestoreConfirmationPayload", "sharedBackupMetadataFromServer",
  "sharedPendingRestoreMetadataFromServer"
].map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.canUseRestore = canUseSharedBackupRestore;" +
  "\nthis.reasonCode = normalizeSharedRestoreReasonCode;" +
  "\nthis.confirmPayload = sharedRestoreConfirmationPayload;" +
  "\nthis.backupMetadata = sharedBackupMetadataFromServer;" +
  "\nthis.pendingMetadata = sharedPendingRestoreMetadataFromServer;", sharedRestoreContext);
assert.equal(sharedRestoreContext.canUseRestore(), false,
  "公開Pages・デモ版で登録済み共有バックアップ復元APIを有効にしてはいけません");
sharedRestoreContext.AppData.mode = "server";
sharedRestoreContext.AppData.configured = false;
assert.equal(sharedRestoreContext.canUseRestore(), false,
  "共有正本未接続時に復元APIを有効にしてはいけません");
sharedRestoreContext.AppData.configured = true;
sharedRestoreContext.AppData.role = "renewal";
assert.equal(sharedRestoreContext.canUseRestore(), false,
  "更新担当へ管理者用復元APIを開放してはいけません");
sharedRestoreContext.AppData.role = "admin";
assert.equal(sharedRestoreContext.canUseRestore(), true);
assert.equal(sharedRestoreContext.reasonCode(" restore_operator_error "), "RESTORE_OPERATOR_ERROR");
assert.throws(() => sharedRestoreContext.reasonCode("担当者の氏名"));
const restoreConfirmPayload = sharedRestoreContext.confirmPayload(
  { batchId: "restore_batch-001", status: "AWAITING_APPROVAL", canApprove: true },
  "restore_batch-001"
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(restoreConfirmPayload)), {
  confirm: "RESTORE_REGISTERED_RENEWAL_BACKUP",
  batchId: "restore_batch-001",
  confirmBatchId: "restore_batch-001"
});
assert.throws(() => sharedRestoreContext.confirmPayload(
  { batchId: "restore_batch-001", status: "AWAITING_APPROVAL", canApprove: false },
  "restore_batch-001"
));
assert.throws(() => sharedRestoreContext.confirmPayload(
  { batchId: "restore_batch-001", status: "AWAITING_APPROVAL", canApprove: true },
  "restore_batch-001 "
), /完全一致/);
const safeBackupMetadata = sharedRestoreContext.backupMetadata({
  backupId: "backup-1", contentHash: "a".repeat(64), status: "COMPLETE",
  driveFileId: "must-not-leak", body: { records: ["must-not-leak"] }
});
assert.equal(Object.prototype.hasOwnProperty.call(safeBackupMetadata, "driveFileId"), false);
assert.equal(Object.prototype.hasOwnProperty.call(safeBackupMetadata, "body"), false);
const safePendingMetadata = sharedRestoreContext.pendingMetadata({
  batchId: "restore_batch-001", canApprove: true, tokenHash: "must-not-leak",
  baseStoreHash: "must-not-leak", summary: { total: 1 }
});
assert.equal(Object.prototype.hasOwnProperty.call(safePendingMetadata, "tokenHash"), false);
assert.equal(Object.prototype.hasOwnProperty.call(safePendingMetadata, "baseStoreHash"), false);
const committingRestoreConfirmPayload = sharedRestoreContext.confirmPayload(
  { batchId: "restore_batch-001", status: "COMMITTING", canApprove: true },
  "restore_batch-001"
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(committingRestoreConfirmPayload)), {
  confirm: "RESTORE_REGISTERED_RENEWAL_BACKUP",
  batchId: "restore_batch-001",
  confirmBatchId: "restore_batch-001"
});
const sharedRestoreRenderSource = extractFunction(
  scriptMatch[1], "renderSharedPendingRestoreTable"
);
assert(sharedRestoreRenderSource.includes(
  'const expired = row.status === "AWAITING_APPROVAL"'
), "COMMITTING restore must stay resumable after the approval TTL");
assert(sharedRestoreRenderSource.includes("disabled || resuming"),
  "a COMMITTING restore cannot be rejected while its completion is reconciled");

const financeRestoreContext = {
  AppData: {
    mode: "browser",
    configured: true,
    financeConfigured: true,
    role: "admin"
  }
};
vm.createContext(financeRestoreContext);
vm.runInContext([
  "canUseFinanceDisasterRestore",
  "financeDisasterBackupFromServer",
  "financeDisasterRestoreFromServer",
  "financeDisasterRestoreConfirmationPayload"
].map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.canUseFinanceRestore = canUseFinanceDisasterRestore;" +
  "\nthis.backupMetadata = financeDisasterBackupFromServer;" +
  "\nthis.restoreMetadata = financeDisasterRestoreFromServer;" +
  "\nthis.confirmPayload = financeDisasterRestoreConfirmationPayload;",
  financeRestoreContext);
assert.equal(financeRestoreContext.canUseFinanceRestore(), false,
  "Pages/browser mode must never expose finance disaster recovery");
financeRestoreContext.AppData.mode = "server";
financeRestoreContext.AppData.role = "accounting";
assert.equal(financeRestoreContext.canUseFinanceRestore(), false,
  "accounting users cannot operate disaster recovery");
financeRestoreContext.AppData.role = "admin";
assert.equal(financeRestoreContext.canUseFinanceRestore(), true);
const financeCommittingPayload = financeRestoreContext.confirmPayload({
  requestId: "finance_restore_001",
  status: "COMMITTING",
  canApprove: true
}, "finance_restore_001");
assert.deepStrictEqual(JSON.parse(JSON.stringify(financeCommittingPayload)), {
  confirm: "FINANCE_DISASTER_RESTORE_LATEST_BACKUP",
  requestId: "finance_restore_001",
  confirmRequestId: "finance_restore_001"
});
assert.throws(() => financeRestoreContext.confirmPayload({
  requestId: "finance_restore_001",
  status: "AWAITING_APPROVAL",
  canApprove: true
}, "finance_restore_001 "));
const safeFinanceBackup = financeRestoreContext.backupMetadata({
  backupId: "finance_backup_1",
  driveFileId: "must-not-leak",
  fileId: "must-not-leak",
  body: { events: ["must-not-leak"] }
});
assert.equal(Object.prototype.hasOwnProperty.call(safeFinanceBackup, "driveFileId"), false);
assert.equal(Object.prototype.hasOwnProperty.call(safeFinanceBackup, "fileId"), false);
assert.equal(Object.prototype.hasOwnProperty.call(safeFinanceBackup, "body"), false);
const safeFinanceRestore = financeRestoreContext.restoreMetadata({
  requestId: "finance_restore_001",
  expectedRawFingerprint: "must-not-leak",
  resultJson: "must-not-leak"
});
assert.equal(
  Object.prototype.hasOwnProperty.call(safeFinanceRestore, "expectedRawFingerprint"),
  false
);
assert.equal(Object.prototype.hasOwnProperty.call(safeFinanceRestore, "resultJson"), false);

const confirmFinanceRestoreSource = extractFunction(
  scriptMatch[1], "confirmFinanceDisasterRestore"
);
assert(confirmFinanceRestoreSource.includes("markFinanceRestoreUnknown(requestId)") &&
  confirmFinanceRestoreSource.includes("throw transportError") &&
  confirmFinanceRestoreSource.includes("unknownState.requests"),
  "unknown finance restore results must be marked and must not be retried automatically");
const formalRiskSource = extractFunction(
  scriptMatch[1], "requestFormalRiskApproval"
);
const refundStart = formalRiskSource.indexOf('type: "RECORD_REFUND"');
const refundEnd = formalRiskSource.indexOf("} else {", refundStart);
const refundBlock = formalRiskSource.slice(refundStart, refundEnd);
assert(refundBlock.includes("referenceNo: referenceNo"),
  "RECORD_REFUND must submit the server field referenceNo");
assert.equal(/\breference\s*:/.test(refundBlock), false,
  "RECORD_REFUND must not submit the obsolete reference field");
const formalTransactionReversalSource = extractFunction(
  scriptMatch[1], "requestFormalTransactionReversal"
);
const reversalDataStart =
  formalTransactionReversalSource.indexOf("const data = {");
const reversalDataEnd =
  formalTransactionReversalSource.indexOf("const command =", reversalDataStart);
const reversalDataBlock = formalTransactionReversalSource.slice(
  reversalDataStart, reversalDataEnd
);
assert(reversalDataStart >= 0 && reversalDataEnd > reversalDataStart,
  "反対取引の送信本文を確認できません");
assert.equal(
  /\b(amount|customerId|kind|invoiceId|referenceNo|method)\s*:/.test(
    reversalDataBlock
  ),
  false,
  "反対取引の金額・対象者・種別等をブラウザ本文から送信してはいけません"
);
assert(
  reversalDataBlock.includes("data.originalPaymentId = target.originalId") &&
  reversalDataBlock.includes("data.originalSettlementId = target.originalId"),
  "反対取引は選択した元取引IDだけを送信する必要があります"
);
assert(
  formalTransactionReversalSource.includes(
    "requestFormalFinanceApproval("
  ),
  "反対取引は単独実行せず二者承認を申請する必要があります"
);
const refreshSharedStoreSource = extractFunction(
  scriptMatch[1], "refreshSharedStore"
);
assert(refreshSharedStoreSource.includes(
  '["admin", "accounting"].includes(AppData.role)'
) && refreshSharedStoreSource.indexOf(
  '["admin", "accounting"].includes(AppData.role)'
) < refreshSharedStoreSource.indexOf(
  'serverCall("apiGetFinanceLedger")'
), "renewal/viewer UI must not request the full finance ledger");
const sharedBackupApiSource = extractFunction(
  codeSource, "apiCreateSharedBackup"
);
assert.equal(
  (sharedBackupApiSource.match(/storeCreateManualBackup_/g) || []).length,
  1,
  "shared backup API must invoke the unified system backup exactly once"
);
assert.equal(sharedBackupApiSource.includes("financeStoreCreateBackup_"), false,
  "shared backup API must not create a second independent finance backup");
const createSharedBackupSource = extractFunction(
  scriptMatch[1], "createSharedBackup"
);
assert(createSharedBackupSource.includes(
  "getOrCreateSharedBackupPendingAttempt()"
) && createSharedBackupSource.includes(
  "idempotencyKey: backupAttempt.idempotencyKey"
) && createSharedBackupSource.includes(
  "clearSharedBackupPendingAttempt(backupAttempt.idempotencyKey)"
) && createSharedBackupSource.includes(
  "if (!pendingKeyCleared)"
) && createSharedBackupSource.includes(
  "新しいバックアップは作成せず"
), "manual shared backup must persist and reuse one idempotency key until COMPLETE");

const sharedBackupPendingSession = new Map();
let sharedBackupPendingSequence = 0;
const sharedBackupPendingContext = {
  SHARED_BACKUP_PENDING_STORAGE_KEY: "shared-backup-pending-test",
  makeId: () => `shared-backup-${++sharedBackupPendingSequence}-stable`,
  nowIso: () => "2026-07-24T00:00:00.000Z",
  sessionStorage: {
    getItem: (key) => sharedBackupPendingSession.has(key) ?
      sharedBackupPendingSession.get(key) : null,
    setItem: (key, value) => sharedBackupPendingSession.set(key, value),
    removeItem: (key) => sharedBackupPendingSession.delete(key)
  }
};
vm.createContext(sharedBackupPendingContext);
vm.runInContext([
  "readSharedBackupPendingAttempt",
  "getOrCreateSharedBackupPendingAttempt",
  "clearSharedBackupPendingAttempt"
].map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.readPending = readSharedBackupPendingAttempt;" +
  "\nthis.getPending = getOrCreateSharedBackupPendingAttempt;" +
  "\nthis.clearPending = clearSharedBackupPendingAttempt;",
  sharedBackupPendingContext);
const firstSharedBackupAttempt = sharedBackupPendingContext.getPending();
const resumedSharedBackupAttempt = sharedBackupPendingContext.getPending();
assert.equal(
  resumedSharedBackupAttempt.idempotencyKey,
  firstSharedBackupAttempt.idempotencyKey
);
assert.equal(
  sharedBackupPendingContext.clearPending(
    firstSharedBackupAttempt.idempotencyKey
  ),
  true
);
const nextSharedBackupAttempt = sharedBackupPendingContext.getPending();
assert.notEqual(
  nextSharedBackupAttempt.idempotencyKey,
  firstSharedBackupAttempt.idempotencyKey
);
sharedBackupPendingSession.set(
  "shared-backup-pending-test",
  JSON.stringify({ idempotencyKey: "bad key with spaces" })
);
assert.throws(() => sharedBackupPendingContext.readPending(),
  /pending|保留|実行ID/);

const stuckSharedBackupSession = new Map();
let stuckSharedBackupSequence = 0;
const stuckSharedBackupContext = {
  SHARED_BACKUP_PENDING_STORAGE_KEY: "stuck-shared-backup-test",
  makeId: () => `shared-backup-${++stuckSharedBackupSequence}-stable`,
  nowIso: () => "2026-07-24T00:00:00.000Z",
  sessionStorage: {
    getItem: (key) => stuckSharedBackupSession.has(key) ?
      stuckSharedBackupSession.get(key) : null,
    setItem: (key, value) => stuckSharedBackupSession.set(key, value),
    removeItem: () => {}
  }
};
vm.createContext(stuckSharedBackupContext);
vm.runInContext([
  "readSharedBackupPendingAttempt",
  "getOrCreateSharedBackupPendingAttempt",
  "clearSharedBackupPendingAttempt"
].map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.getPending = getOrCreateSharedBackupPendingAttempt;" +
  "\nthis.clearPending = clearSharedBackupPendingAttempt;",
  stuckSharedBackupContext);
const stuckBackupAttempt = stuckSharedBackupContext.getPending();
assert.equal(
  stuckSharedBackupContext.clearPending(stuckBackupAttempt.idempotencyKey),
  false,
  "session key removal failure must be detected after a COMPLETE backup"
);
assert.equal(
  stuckSharedBackupContext.getPending().idempotencyKey,
  stuckBackupAttempt.idempotencyKey,
  "failed session key removal must retain the same key and block a new backup identity"
);

const prepareRestoreSource = extractFunction(scriptMatch[1], "prepareRegisteredSharedRestore");
assert(
  prepareRestoreSource.indexOf('serverCall("apiVerifySharedBackup"') >= 0 &&
  prepareRestoreSource.indexOf('serverCall("apiVerifySharedBackup"') <
    prepareRestoreSource.indexOf('serverCall("apiPrepareSharedRestore"'),
  "復元予行APIの直前に登録済みバックアップを再検証する必要があります"
);
assert.equal(prepareRestoreSource.includes("localStorage"), false,
  "登録済み共有バックアップ復元をブラウザ保存へフォールバックしてはいけません");
const confirmRestoreSource = extractFunction(scriptMatch[1], "confirmRegisteredSharedRestore");
assert(confirmRestoreSource.includes("let restoreCommitted = false") &&
  confirmRestoreSource.indexOf("restoreCommitted = true") <
    confirmRestoreSource.indexOf("await refreshSharedStore") &&
  confirmRestoreSource.includes("復元は確定済みです。後続の画面再読込に失敗しました。"),
  "復元確定後の画面再読込失敗を未実行として扱ってはいけません");
const rejectRestoreSource = extractFunction(scriptMatch[1], "rejectRegisteredSharedRestore");
assert(rejectRestoreSource.includes("let rejectionCommitted = false") &&
  rejectRestoreSource.indexOf("rejectionCommitted = true") <
    rejectRestoreSource.indexOf("await refreshSharedBackupRestoreData") &&
  rejectRestoreSource.includes("復元申請は却下済みです。後続の一覧再読込に失敗しました。"),
  "却下確定後の一覧再読込失敗を未実行として扱ってはいけません");

const pendingSession = new Map();
const pendingContext = {
  FINANCE_PENDING_STORAGE_KEY: "finance-pending-test",
  AppData: { financeRevision: 41 },
  makeId: () => "finance-approval-request-stable-0001",
  nowIso: () => "2026-07-24T00:00:00.000Z",
  window: { confirm: () => true },
  sessionStorage: {
    getItem: (key) => pendingSession.has(key) ? pendingSession.get(key) : null,
    setItem: (key, value) => pendingSession.set(key, value)
  }
};
vm.createContext(pendingContext);
vm.runInContext([
  "readFinancePendingOperations", "writeFinancePendingOperations",
  "assertNoOtherFinancePending", "prepareFinanceApprovalRequestSubmission"
].map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.prepareApprovalRequest = prepareFinanceApprovalRequestSubmission;" +
  "\nthis.readPending = readFinancePendingOperations;", pendingContext);
const firstApprovalSubmission = pendingContext.prepareApprovalRequest(
  "approval-request:invoice-reversal:invoice-1",
  { type: "REVERSE_INVOICE", data: { invoiceId: "invoice-1" } },
  "INVOICE_REVERSAL_REQUEST",
  "申請済み"
);
const retriedApprovalSubmission = pendingContext.prepareApprovalRequest(
  "approval-request:invoice-reversal:invoice-1",
  { type: "REVERSE_INVOICE", data: { invoiceId: "new-command-must-not-be-used" } },
  "CHANGED_REASON_MUST_NOT_BE_USED",
  "変更後"
);
assert.equal(retriedApprovalSubmission.retry, true);
assert.equal(retriedApprovalSubmission.idempotencyKey, firstApprovalSubmission.idempotencyKey);
assert.equal(retriedApprovalSubmission.expectedRevision, 41);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(retriedApprovalSubmission.command)),
  { type: "REVERSE_INVOICE", data: { invoiceId: "invoice-1" } },
  "未確認の承認申請は再生成せず、保存済みの同一commandを再送する"
);
assert.equal(
  pendingContext.readPending()["approval-request:invoice-reversal:invoice-1"].operationKind,
  "APPROVAL_REQUEST"
);

const logicNames = [
  "fiscalYearOf", "toDate", "today", "dateValue", "addMonths", "addDays", "applyDerivedSchedule",
  "periodExpiryFromDate", "certificateExpiryFromIssueDate", "daysUntil", "numberValue", "roundTax", "financeOf",
  "normalizeDateText", "normalizeTimeText", "trainingMinutes", "csvEscape"
];
const context = {};
vm.createContext(context);
vm.runInContext(logicNames.map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nthis.logic = {" + logicNames.join(",") + "};", context);
const logic = context.logic;

assert.equal(logic.fiscalYearOf(new Date(2026, 2, 31)), "2025");
assert.equal(logic.fiscalYearOf(new Date(2026, 3, 1)), "2026");
assert.equal(logic.dateValue(logic.addMonths(logic.toDate("2026-08-31"), -6)), "2026-02-28");
assert.equal(logic.dateValue(logic.addMonths(logic.toDate("2028-08-31"), -6)), "2028-02-29");
assert.equal(logic.toDate("2026-02-30"), null);
assert.equal(logic.normalizeDateText("2026/7/4"), "2026-07-04");
assert.equal(logic.normalizeTimeText("9:05"), "09:05");
assert.equal(logic.certificateExpiryFromIssueDate("2026-01-31"), "2026-04-30");
assert.equal(logic.certificateExpiryFromIssueDate("2028-11-30"), "2029-02-28");
assert.equal(logic.certificateExpiryFromIssueDate("2026-06-10"), "2026-09-09");

const schedule = logic.applyDerivedSchedule({ licenseExpiry: "2026-09-30" });
assert.equal(schedule.courseAvailableDate, "2026-03-30");
assert.equal(schedule.courseDeadlineDate, "2026-08-30");
assert.equal(schedule.noticeThreeMonthDate, "2026-06-30");

const baseFinance = {
  feeExTax: "1001", discountExTax: "0", taxRate: "10", taxRounding: "切捨て",
  paidAmount: "0", paymentDueDate: "2026-08-31", invoiceStatus: "未発行",
  invoiceNo: "INV-UC0157-20260701-1", accountingDate: "2026-07-01", invoiceDate: "2026-07-01",
  taxExceptionApprovalDate: "", taxExceptionApprovedBy: "", taxExceptionReason: ""
};
let finance = logic.financeOf(baseFinance);
assert.equal(finance.tax, 100);
assert.equal(finance.total, 1101);
assert.equal(finance.billed, 0);
assert.equal(finance.received, 0);
assert.equal(finance.outstanding, 0);
assert.equal(finance.status, "未発行");
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "発行済" });
assert.equal(finance.billed, 1101);
assert.equal(finance.outstanding, 1101);
assert.equal(finance.status, "請求済");
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "発行済", paidAmount: "1102", paymentDate: "2026-07-10", paymentMethod: "銀行振込" });
assert.equal(finance.status, "過入金");
assert.equal(finance.paid, 1102);
assert.equal(finance.received, 1102);
assert.equal(finance.applied, 1101);
assert.equal(finance.overpayment, 1);
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "取消" });
assert.equal(finance.billed, 0);
assert.equal(finance.received, 0);
assert.equal(finance.outstanding, 0);
assert.equal(finance.status, "取消");
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "発行済", taxRounding: "不明" });
assert.equal(finance.calculationValid, false);
assert.equal(finance.billed, 0);
assert.equal(finance.status, "計算要確認");
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "取消", paidAmount: "100", paymentDate: "2026-07-10", paymentMethod: "銀行振込" });
assert.equal(finance.received, 0);
assert.equal(finance.paid, 100);
assert.equal(finance.invoiceStateValid, false);
assert.equal(finance.status, "計算要確認");
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "発行済", invoiceDate: "" });
assert.equal(finance.issuanceEvidenceValid, false);
assert.equal(finance.billed, 0);
assert.equal(finance.status, "計算要確認");
finance = logic.financeOf({ ...baseFinance, invoiceStatus: "発行済", taxRate: "8" });
assert.equal(finance.calculationValid, false);
assert.equal(finance.billed, 0);
assert.equal(finance.status, "計算要確認");

assert.equal(logic.trainingMinutes({ xStart: "10:00", xEnd: "10:20" }, "x"), 20);
assert.equal(logic.trainingMinutes({ xStart: "10:20", xEnd: "10:00" }, "x"), -20);
assert.equal(logic.csvEscape("=HYPERLINK(\"https://example.invalid\")"),
  '"\'=HYPERLINK(""https://example.invalid"")"');
assert.equal(logic.csvEscape("\t+1+1"), '"\'\t+1+1"');
assert.equal(logic.csvEscape("通常の値"), '"通常の値"');

const holidayStart = scriptMatch[1].indexOf("const JAPAN_HOLIDAYS");
const trainingStart = scriptMatch[1].indexOf("const TRAINING_MODULES");
const deadlineContext = {};
vm.createContext(deadlineContext);
vm.runInContext(
  scriptMatch[1].slice(holidayStart, trainingStart) + "\n" +
  ["toDate", "today", "dateValue", "addDays", "splitSettingList", "dipsBusinessDeadlineInfo"]
    .map((name) => extractFunction(scriptMatch[1], name)).join("\n") +
  "\nlet artifactRuntimeSettings = {};" +
  "\nthis.setArtifactSettings = function (value) { artifactRuntimeSettings = value; };" +
  "\nthis.deadline = dipsBusinessDeadlineInfo; this.deadlineDateValue = dateValue;",
  deadlineContext
);
deadlineContext.setArtifactSettings({
  dipsCalendarConfirmedDate: "2026-07-01",
  dipsCalendarConfirmedBy: "担当者",
  dipsAdditionalClosedDates: ""
});
assert.equal(deadlineContext.deadlineDateValue(deadlineContext.deadline("2026-06-10").date), "2026-06-17");
deadlineContext.setArtifactSettings({
  dipsCalendarConfirmedDate: "",
  dipsCalendarConfirmedBy: "",
  dipsAdditionalClosedDates: ""
});
assert.equal(deadlineContext.deadline("2026-06-10").date, null, "未確認の営業日暦から確定日を表示してはいけません");

console.log("operations_logic_test: OK");
