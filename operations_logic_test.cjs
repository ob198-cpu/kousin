const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const acorn = require("acorn");
const cheerio = require("cheerio");
const { Linter } = require("eslint");

const html = fs.readFileSync("Index.html", "utf8");
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
assert(html.includes("公開Pages版：実名・連絡先・証憑・会計情報を入力しないでください。"), "公開Pages版の実データ入力禁止表示がありません");
assert(scriptMatch[1].includes('const LEGACY_STORAGE_KEYS = ["cdp-renewal-license-records-v3"]'), "旧版ブラウザ保存データの移行元がありません");
assert(scriptMatch[1].includes('appendAudit("旧版ブラウザデータ移行", null)'), "旧版ブラウザ保存データの移行記録がありません");
assert.equal(scriptMatch[1].includes("localStorage.removeItem(LEGACY_STORAGE_KEYS"), false, "旧版ブラウザ保存データを自動削除してはいけません");

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
