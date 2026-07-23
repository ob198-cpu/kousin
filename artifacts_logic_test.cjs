const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const acorn = require("acorn");
const crypto = require("node:crypto");

const source = fs.readFileSync("Artifacts.js", "utf8");
const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });

function extractFunction(name) {
  const node = ast.body.find((item) => item.type === "FunctionDeclaration" && item.id && item.id.name === name);
  assert(node, name + "が見つかりません");
  return source.slice(node.start, node.end);
}

const pureNames = [
  "artifactCalculateBilling_", "artifactAddCalendarMonthsMinusOne_", "artifactDurationMinutes_",
  "artifactTimeMinutes_", "artifactFindTrainingOverlaps_", "artifactValidateTraining_",
  "artifactRequireMinutes_", "artifactValidTime_",
  "artifactQuoteDefaultExpiry_", "artifactMonthEnd_", "artifactIsoParts_",
  "artifactDaysInMonth_", "artifactValidIsoDateOrBlank_", "artifactValidateBillingAmounts_", "artifactIsSafeInteger_",
  "artifactValidateBillingDatesAndNumbers_", "artifactValidateTaxException_", "artifactValidateOptionalIso_", "artifactRecordForHash_",
  "artifactComposeBillingNumberPrefix_", "artifactIsAllowedBillingNumber_", "artifactBillingNumberMatchesDate_",
  "artifactSequenceSeedValue_", "artifactAssertNumberingSettings_", "artifactValidYearMonthToken_",
  "artifactValidCutoverMonth_", "artifactRequireNumberingInitialized_",
  "artifactAssertAutomaticNumberingAllowed_", "artifactValidateAutomaticNumberingForPreflight_",
  "artifactValidateCertificateDates_", "artifactValidateCertificateDelivery_",
  "artifactValidateEligibility_", "artifactEligibilityMetadata_", "artifactQualificationContextMetadata_", "artifactTaxExceptionMetadata_",
  "artifactAssertEffectiveNumberRules_", "artifactAnyKind_", "artifactYyMm_",
  "artifactAssertPrivateSharingAccess_", "artifactRequireSafeOutputFolder_",
  "artifactAssertReusableDriveItem_", "artifactSettingsForHash_",
  "artifactNormalizeAllowedEmails_", "artifactAssertAllowedOutputEmails_", "artifactAssertDriveItemAcl_",
  "artifactNormalizeIsoDateList_", "artifactValidateDipsCalendarSettings_", "artifactAddIsoDaysUtc_",
  "artifactDipsSubmissionDeadline_", "artifactValidateDipsSubmission_", "artifactErrorMessage_",
  "artifactTemplateId_", "artifactAssertRequiredTemplateSettings_",
  "artifactOriginalCertificateDates_", "artifactValidateCertificateDateContinuity_", "artifactAssertCertificateDateContinuity_",
  "artifactCertificateTemplateMissingSentinels_", "artifactLedgerTemplateRowsHaveData_",
  "artifactStripLedgerOldVersionMarkers_", "artifactLedgerOldVersionMarkers_", "artifactLedgerVisibleHash_",
  "artifactLedgerStateHash_", "artifactLedgerStableFieldsHash_", "artifactAnnualLedgerRowIssue_", "artifactAnnualLedgerRowsIssue_", "artifactNextLedgerRow_",
  "artifactRegistryRowsIssue_", "artifactRegistryGlobalRowsIssue_", "artifactFindExisting_", "artifactRecordNumberState_", "artifactAssertRecordNumberContinuity_",
  "artifactGuidanceTemplateMissingSentinels_", "artifactCertificateTableSelection_", "artifactClassValue_",
  "artifactFlattenDocumentTabs_", "artifactGetDocumentTab_",
  "artifactIteratorItems_",
  "artifactBoolean_", "artifactExtractDriveId_", "artifactExtractDriveFileId_", "artifactFolderUrl_", "artifactIsEmail_",
  "artifactCsvRow_", "artifactNumber_", "artifactStrictNumber_", "artifactSheetText_",
  "artifactSafeSheetRow_", "artifactSafeSheetMatrix_", "artifactText_", "artifactClone_",
  "artifactNormalizeRecord_", "artifactComposeTemplateFingerprint_", "artifactCanonicalJson_", "artifactHashHex_", "artifactPad_",
  "artifactDriveItemTrackingInfo_", "artifactPersistCleanupFailure_", "artifactThrowAfterCleanup_", "artifactShortKey_", "artifactNowText_",
  "artifactFindSecondClassPracticalMinimumCells_", "artifactReplaceSecondClassPracticalMinimum_"
];
const driveState = {
  sharingAccess: "PRIVATE",
  sharingThrows: false,
  outputTrashed: false,
  templateParentId: "template-parent",
  actorEmail: "owner@example.com",
  ownerEmail: "owner@example.com",
  editorEmails: [],
  viewerEmails: [],
  shareableByEditors: false,
  permissions: [{ type: "user", emailAddress: "owner@example.com", role: "owner" }],
  permissionNextPageToken: ""
};
const cleanupAuditProperties = {};
function user(email) { return { getEmail: () => email }; }
const context = {
  isFinite,
  RENEWAL_ARTIFACT: {
    SCHEMA_VERSION: 3,
    KINDS: ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"],
    BILLING_NUMBER_NAMESPACE: "UC0157",
    ORGANIZATION_CODE: "0157",
    CERTIFICATE_BASE_TAB_ID: "t.0",
    TEMPLATE_IDS: { guidance: "template-guidance", training: "template-training" },
    BLOCKED_TEMPLATE_IDS: { ledger: "blocked-ledger", certificate: "blocked-certificate" }
  },
  RENEWAL_JAPAN_HOLIDAYS: {
    version: "TEST_V1",
    years: {
      "2026": ["01-01", "01-12", "02-11", "02-23", "03-20", "04-29", "05-03", "05-04", "05-05", "05-06", "07-20", "08-11", "09-21", "09-22", "09-23", "10-12", "11-03", "11-23"],
      "2027": ["01-01"]
    }
  },
  Session: {
    getActiveUser: () => user(driveState.actorEmail),
    getEffectiveUser: () => user(driveState.actorEmail)
  },
  DriveApp: {
    Access: { PRIVATE: "PRIVATE" },
    getFolderById(id) {
      return {
        getId: () => id,
        getName: () => "output",
        isTrashed: () => driveState.outputTrashed,
        getSharingAccess() {
          if (driveState.sharingThrows) throw new Error("sharing unavailable");
          return driveState.sharingAccess;
        },
        getOwner: () => user(driveState.ownerEmail),
        getEditors: () => driveState.editorEmails.map(user),
        getViewers: () => driveState.viewerEmails.map(user),
        isShareableByEditors: () => driveState.shareableByEditors
      };
    },
    getFileById() {
      return {
        getParents() {
          let consumed = false;
          return {
            hasNext: () => !consumed && !!driveState.templateParentId,
            next() {
              consumed = true;
              return { getId: () => driveState.templateParentId };
            }
          };
        }
      };
    }
  },
  Drive: {
    Permissions: {
      list() {
        return { permissions: driveState.permissions, nextPageToken: driveState.permissionNextPageToken };
      }
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest(algorithm, value) {
      assert.equal(algorithm, "SHA_256");
      return Array.from(crypto.createHash("sha256").update(String(value), "utf8").digest())
        .map((byte) => byte > 127 ? byte - 256 : byte);
    },
    formatDate: () => "2026-07-15 10:00:00"
  },
  PropertiesService: {
    getScriptProperties: () => ({
      setProperty(key, value) { cleanupAuditProperties[key] = value; }
    })
  }
};
vm.createContext(context);
vm.runInContext(pureNames.map(extractFunction).join("\n") +
  "\nthis.logic={" + pureNames.join(",") + "};", context);
const logic = context.logic;

let trackedCleanupError;
try {
  logic.artifactThrowAfterCleanup_(new Error("generation failed"), {
    setTrashed() { throw new Error("trash denied"); },
    getId: () => "partial-file-id",
    getUrl: () => "https://drive.google.com/open?id=partial-file-id",
    getName: () => "partial-output"
  }, "新規テスト成果物", "file");
} catch (error) {
  trackedCleanupError = error;
}
assert.equal(trackedCleanupError.artifactProvisional.fileId, "partial-file-id");
assert.equal(trackedCleanupError.artifactProvisional.cleanupFailed, true);
assert(trackedCleanupError.message.includes("担当部署に確認が必要"));
assert(Object.keys(cleanupAuditProperties).some((key) => key.startsWith("RENEWAL_ARTIFACT_CLEANUP_FAILURE_")),
  "cleanup失敗はScriptPropertyにも追跡記録を残します");
let cleanupSucceeded = false;
const originalCleanupError = new Error("original failure");
assert.throws(() => logic.artifactThrowAfterCleanup_(originalCleanupError, {
  setTrashed() { cleanupSucceeded = true; }, getId: () => "cleaned-id", getUrl: () => "", getName: () => "cleaned"
}, "cleaned", "file"), /original failure/);
assert.equal(cleanupSucceeded, true);

assert.equal(logic.artifactAddCalendarMonthsMinusOne_("2026-01-31"), "2026-04-30");
assert.equal(logic.artifactAddCalendarMonthsMinusOne_("2028-11-30"), "2029-02-28");
assert.equal(logic.artifactAddCalendarMonthsMinusOne_("2027-11-30"), "2028-02-29");
assert.equal(logic.artifactAddCalendarMonthsMinusOne_("2026-01-30"), "2026-04-29");
assert.equal(logic.artifactAddCalendarMonthsMinusOne_("2026-06-10"), "2026-09-09");
assert.throws(() => logic.artifactAddCalendarMonthsMinusOne_("2026-02-30"));
assert.equal(logic.artifactQuoteDefaultExpiry_("2026-01-15"), "2026-03-31");
assert.equal(logic.artifactMonthEnd_("2028-02-10"), "2028-02-29");

let errors = [];
assert.equal(logic.artifactValidateCertificateDates_("2026-07-01", "", "2026-07-15", errors), "");
assert(errors.some((message) => message.includes("証明書発行日が必要")));
errors = [];
logic.artifactValidateCertificateDates_("2026-07-02", "2026-07-01", "2026-07-15", errors);
assert(errors.some((message) => message.includes("講習修了日以後")));
errors = [];
logic.artifactValidateCertificateDates_("2026-07-01", "2026-07-16", "2026-07-15", errors);
assert(errors.some((message) => message.includes("未来日")));
errors = [];
assert.equal(
  logic.artifactValidateCertificateDates_("2026-06-30", "2026-07-01", "2026-07-15", errors),
  "2026-07-01"
);
assert.deepEqual(errors, []);

errors = [];
logic.artifactValidateCertificateDelivery_("有り", "", "2026-07-01", "2026-07-15", errors, []);
assert(errors.some((message) => message.includes("証明書交付日が必要")));
errors = [];
logic.artifactValidateCertificateDelivery_("有り", "2026-06-30", "2026-07-01", "2026-07-15", errors, []);
assert(errors.some((message) => message.includes("発行日以後")));
errors = [];
logic.artifactValidateCertificateDelivery_("有り", "2026-07-16", "2026-07-01", "2026-07-15", errors, []);
assert(errors.some((message) => message.includes("未来日")));
errors = [];
assert.equal(
  logic.artifactValidateCertificateDelivery_("有り", "2026-07-02", "2026-07-01", "2026-07-15", errors, []),
  "2026-07-02"
);
assert.deepEqual(errors, []);
errors = [];
logic.artifactValidateCertificateDelivery_("任意値", "", "2026-07-01", "2026-07-15", errors, []);
assert(errors.some((message) => message.includes("未確認")), "交付状態の列挙値以外を許可してはいけません");
errors = [];
logic.artifactValidateCertificateDelivery_("無し", "2026-07-02", "2026-07-01", "2026-07-15", errors, []);
assert(errors.some((message) => message.includes("交付状態を「有り」")), "未交付表示と交付日の矛盾を台帳へ出してはいけません");

errors = [];
logic.artifactValidateEligibility_({}, "2026-07-15", errors);
assert(errors.some((message) => message.includes("一致確認済み")));
assert(errors.some((message) => message.includes("照合日")));
assert(errors.some((message) => message.includes("照合者")));
assert(errors.some((message) => message.includes("照合証憑参照")));
errors = [];
logic.artifactValidateEligibility_({
  eligibilityCheckStatus: "一致確認済み", eligibilityCheckedDate: "2026-07-16",
  eligibilityCheckedBy: "担当者", eligibilityEvidence: "DIPS画面"
}, "2026-07-15", errors);
assert(errors.some((message) => message.includes("未来日")));
errors = [];
logic.artifactValidateEligibility_({
  eligibilityCheckStatus: "一致確認済み", eligibilityCheckedDate: "2026-07-15",
  eligibilityCheckedBy: "担当者", eligibilityEvidence: "DIPS画面"
}, "2026-07-15", errors);
assert.deepEqual(errors, []);
errors = [];
logic.artifactValidateEligibility_({
  courseDate: "2026-07-14", eligibilityCheckStatus: "一致確認済み", eligibilityCheckedDate: "2026-07-15",
  eligibilityCheckedBy: "担当者", eligibilityEvidence: "DIPS画面"
}, "2026-07-15", errors);
assert(errors.some((message) => message.includes("講習修了日以前")), "受講開始時照合を講習後に行ってはいけません");
assert.deepEqual(JSON.parse(JSON.stringify(logic.artifactEligibilityMetadata_({
  eligibilityCheckStatus: "一致確認済み", eligibilityCheckedDate: "2026-07-15",
  eligibilityCheckedBy: "担当者", eligibilityEvidence: "DIPS画面"
}))), {
  status: "一致確認済み", checkedDate: "2026-07-15", checkedBy: "担当者", evidence: "DIPS画面"
});
assert.doesNotThrow(() => logic.artifactAssertEffectiveNumberRules_({
  courseDate: "2026-06-30", certificateIssuedDate: "2026-07-01",
  certificateNo: "UC015726070001"
}, ["certificate"]), "証明書番号のYYMMは講習修了日ではなく発行日基準です");
assert.throws(() => logic.artifactAssertEffectiveNumberRules_({
  courseDate: "2026-06-30", certificateIssuedDate: "2026-07-01",
  certificateNo: "UC015726060001"
}, ["certificate"]), /発行日/);
const originalDateRows = [{
  recordId: "rec-date", kind: "certificate", status: "created",
  metadataJson: JSON.stringify({ certificateIssuedDate: "2026-07-01", certificateExpiry: "2026-09-30" })
}];
errors = [];
logic.artifactValidateCertificateDateContinuity_(originalDateRows, {
  recordId: "rec-date", certificateIssuedDate: "2026-07-01"
}, errors, []);
assert.deepEqual(errors, []);
errors = [];
logic.artifactValidateCertificateDateContinuity_(originalDateRows, {
  recordId: "rec-date", certificateIssuedDate: "2026-07-02"
}, errors, []);
assert(errors.some((message) => message.includes("再発行は未対応")));
errors = [];
const dateWarnings = [];
logic.artifactValidateCertificateDateContinuity_([{
  recordId: "rec-date", kind: "ledger", status: "created", metadataJson: "{}"
}], { recordId: "rec-date", certificateIssuedDate: "2026-07-01" }, errors, dateWarnings);
assert(errors.some((message) => message.includes("自動確認できない")));
assert(dateWarnings.some((message) => message.includes("metadata")));

let billing = logic.artifactCalculateBilling_({
  feeExTax: "1001", discountExTax: "0", taxRate: "10", taxRounding: "切捨て"
});
assert.deepEqual(JSON.parse(JSON.stringify(billing)), {
  feeExTax: 1001, discountExTax: 0, netExTax: 1001, taxRate: 10,
  rounding: "切捨て", tax: 100, total: 1101
});
billing = logic.artifactCalculateBilling_({
  feeExTax: "1001", discountExTax: "1", taxRate: "8", taxRounding: "切上げ"
});
assert.equal(billing.netExTax, 1000);
assert.equal(billing.tax, 80);
assert.equal(billing.total, 1080);
assert.throws(() => logic.artifactCalculateBilling_({
  feeExTax: "1000.5", discountExTax: "0", taxRate: "10", taxRounding: "切捨て"
}), /整数円/);
assert.throws(() => logic.artifactCalculateBilling_({
  feeExTax: "1000", discountExTax: "0.5", taxRate: "10", taxRounding: "切捨て"
}), /整数円/);

errors = [];
logic.artifactValidateBillingAmounts_({
  feeExTax: "1000", discountExTax: "1001", taxRate: "7", taxRounding: "任意"
}, errors);
assert(errors.some((message) => message.includes("値引")));
assert(errors.some((message) => message.includes("消費税率")));
assert(errors.some((message) => message.includes("端数処理")));
errors = [];
logic.artifactValidateBillingAmounts_({
  feeExTax: "-1", discountExTax: "-2", taxRate: "10", taxRounding: "切捨て"
}, errors);
assert.equal(errors.length >= 2, true);
errors = [];
logic.artifactValidateBillingAmounts_({
  feeExTax: "1000.5", discountExTax: "0.1", taxRate: "10", taxRounding: "切捨て"
}, errors);
assert.equal(errors.filter((message) => message.includes("整数円")).length, 2);

errors = [];
logic.artifactValidateBillingDatesAndNumbers_({
  quoteDate: "2026-07-15", quoteExpiry: "2026-07-14", quoteNo: "QT-UC0157-20260714-1",
  invoiceDate: "2026-07-15", accountingDate: "2026-07-15", paymentDueDate: "2026-07-14", invoiceNo: "INV-UC0157-20260714-1"
}, errors);
assert(errors.some((message) => message.includes("見積有効期限")));
assert(errors.some((message) => message.includes("入金期限")));
assert(errors.some((message) => message.includes("見積書番号の日付部")));
assert(errors.some((message) => message.includes("請求書番号の日付部")));
errors = [];
logic.artifactValidateBillingDatesAndNumbers_({}, errors);
assert(errors.some((message) => message.includes("明示入力")), "入金期限を推定してはいけません");
assert(errors.some((message) => message.includes("取引年月日")), "適格請求書の取引年月日を必須にします");
errors = [];
logic.artifactValidateBillingDatesAndNumbers_({
  quoteDate: "2026-07-15", quoteExpiry: "2026-07-31", quoteNo: "QT-20260715-1",
  invoiceDate: "2026-07-15", accountingDate: "2026-07-15", paymentDueDate: "2026-07-31", invoiceNo: "INV-20260715-1"
}, errors);
assert.deepEqual(errors, [], "移行済みの正式なlegacy見積・請求番号は受理します");
errors = [];
logic.artifactValidateBillingDatesAndNumbers_({
  quoteDate: "2026-07-15", quoteExpiry: "2026-07-31", quoteNo: "QT-UC0157-20260715-1",
  invoiceDate: "2026-07-15", accountingDate: "2026-07-15", paymentDueDate: "2026-07-31", invoiceNo: "INV-UC0157-20260715-1"
}, errors);
assert.deepEqual(errors, [], "専用名前空間の正しい見積・請求番号は受理します");
errors = [];
logic.artifactValidateBillingDatesAndNumbers_({
  quoteDate: "2026-07-15", quoteExpiry: "2026-07-31", quoteNo: "QT-20260714-1",
  invoiceDate: "2026-07-15", accountingDate: "2026-07-15", paymentDueDate: "2026-07-31", invoiceNo: "INV-20260714-1"
}, errors);
assert(errors.some((message) => message.includes("見積書番号の日付部")), "legacy見積番号も日付一致が必要です");
assert(errors.some((message) => message.includes("請求書番号の日付部")), "legacy請求番号も日付一致が必要です");
errors = [];
logic.artifactValidateBillingDatesAndNumbers_({
  quoteDate: "2026-07-15", quoteExpiry: "2026-07-31", quoteNo: "SAMPLE-QT-20260715-1",
  invoiceDate: "2026-07-15", accountingDate: "2026-07-15", paymentDueDate: "2026-07-31", invoiceNo: "SAMPLE-INV-20260715-1"
}, errors);
assert(errors.some((message) => message.includes("見積書番号は")), "SAMPLE見積番号を受理してはいけません");
assert(errors.some((message) => message.includes("請求書番号は")), "SAMPLE請求番号を受理してはいけません");
assert.equal(
  logic.artifactComposeBillingNumberPrefix_("QT", "UC0157", "2026-07-15"),
  "QT-UC0157-20260715-"
);
assert.equal(logic.artifactIsAllowedBillingNumber_("QT-UC0157-20260715-1", "QT", "UC0157"), true);
assert.equal(logic.artifactIsAllowedBillingNumber_("QT-20260715-1", "QT", "UC0157"), true);
assert.equal(logic.artifactIsAllowedBillingNumber_("SAMPLE-QT-20260715-1", "QT", "UC0157"), false);

errors = [];
logic.artifactValidateTaxException_({ taxRate: 8 }, "2026-07-15", errors);
assert(errors.some((message) => message.includes("承認日")));
assert(errors.some((message) => message.includes("承認者")));
assert(errors.some((message) => message.includes("根拠")));
errors = [];
logic.artifactValidateTaxException_({
  taxRate: 0, taxExceptionApprovalDate: "2026-07-16", taxExceptionApprovedBy: "経理", taxExceptionReason: "非課税根拠"
}, "2026-07-15", errors);
assert(errors.some((message) => message.includes("未来日")));
errors = [];
logic.artifactValidateTaxException_({ taxRate: 10 }, "2026-07-15", errors);
assert.deepEqual(errors, [], "標準税率10%には例外承認を要求しません");

assert.equal(logic.artifactDurationMinutes_("10:00", "10:20"), 20);
assert.equal(logic.artifactDurationMinutes_("10:20", "10:00"), -20);
assert.equal(Number.isNaN(logic.artifactDurationMinutes_("99:00", "99:20")), true);
assert.equal(logic.artifactValidTime_("23:59"), true);
assert.equal(logic.artifactValidTime_("24:00"), false);
const overlapModules = [["a", "項目A"], ["b", "項目B"]];
assert.equal(logic.artifactFindTrainingOverlaps_({
  aDate: "2026-07-15", aStart: "09:00", aEnd: "09:06",
  bDate: "2026-07-15", bStart: "09:00", bEnd: "09:06"
}, overlapModules).length, 1, "同日重複を検出する必要があります");
assert.equal(logic.artifactFindTrainingOverlaps_({
  aDate: "2026-07-15", aStart: "09:00", aEnd: "09:06",
  bDate: "2026-07-15", bStart: "09:06", bEnd: "09:12"
}, overlapModules).length, 0, "終了時刻と次の開始時刻が同じ場合は許可します");
assert.equal(logic.artifactFindTrainingOverlaps_({
  aDate: "2026-07-15", aStart: "09:00", aEnd: "09:06",
  bDate: "2026-07-16", bStart: "09:00", bEnd: "09:06"
}, overlapModules).length, 0, "別日の同時刻は重複ではありません");

function setTrainingSlot(record, prefix, start, end) {
  record[prefix + "Date"] = "2026-07-15";
  record[prefix + "Start"] = start;
  record[prefix + "End"] = end;
  record[prefix + "Instructor"] = "講師";
}
function commonTrainingRecord() {
  const record = { courseDate: "2026-07-15", suspensionCourse: "あり" };
  setTrainingSlot(record, "academicOverview", "09:00", "09:06");
  setTrainingSlot(record, "academicRules", "09:06", "09:12");
  setTrainingSlot(record, "academicLawUpdate", "09:12", "09:18");
  setTrainingSlot(record, "academicAccident", "09:18", "09:24");
  setTrainingSlot(record, "academicSafety", "09:24", "09:30");
  setTrainingSlot(record, "academicVideo", "09:30", "09:50");
  return record;
}
const secondClassTraining = commonTrainingRecord();
setTrainingSlot(secondClassTraining, "practicalExercise1", "09:50", "09:55");
setTrainingSlot(secondClassTraining, "practicalDiscussion", "09:55", "10:00");
const secondClassErrors = [];
logic.artifactValidateTraining_(secondClassTraining, 2, secondClassErrors, []);
assert(secondClassErrors.some((message) => message.includes("実地・操縦演習は6分以上")),
  "二等の操縦演習は合計6分以上必要です");

const firstClassTraining = commonTrainingRecord();
setTrainingSlot(firstClassTraining, "academicFirstClass", "09:50", "10:05");
setTrainingSlot(firstClassTraining, "academicFirstClassVideo", "10:05", "10:15");
setTrainingSlot(firstClassTraining, "practicalExercise1", "10:15", "10:20");
setTrainingSlot(firstClassTraining, "practicalDiscussion", "10:20", "10:30");
const firstClassErrors = [];
logic.artifactValidateTraining_(firstClassTraining, 1, firstClassErrors, []);
assert.equal(firstClassErrors.some((message) => message.includes("実地・操縦演習")), false,
  "一等の操縦演習は5分で要件を満たします");

const normalTraining = commonTrainingRecord();
normalTraining.suspensionCourse = "なし";
const normalTrainingErrors = [];
const normalTrainingWarnings = [];
logic.artifactValidateTraining_(normalTraining, 2, normalTrainingErrors, normalTrainingWarnings);
assert.equal(normalTrainingErrors.some((message) => message.includes("実地")), false,
  "停止処分なしの通常講習に実地記録を要求してはいけません");
normalTraining.practicalExercise1Date = "2026-07-15";
logic.artifactValidateTraining_(normalTraining, 2, [], normalTrainingWarnings);
assert(normalTrainingWarnings.some((message) => message.includes("出力しません")),
  "通常講習に実地入力があれば無視する旨を警告します");
const futureTraining = commonTrainingRecord();
futureTraining.suspensionCourse = "なし";
futureTraining.courseDate = "2026-07-16";
const futureTrainingErrors = [];
logic.artifactValidateTraining_(futureTraining, 2, futureTrainingErrors, [], "2026-07-15");
assert(futureTrainingErrors.some((message) => message.includes("実施前")),
  "未来の講習修了日で正式記録簿を作成してはいけません");
const afterCompletionTraining = commonTrainingRecord();
afterCompletionTraining.suspensionCourse = "なし";
afterCompletionTraining.academicVideoDate = "2026-07-16";
const afterCompletionErrors = [];
logic.artifactValidateTraining_(afterCompletionTraining, 2, afterCompletionErrors, [], "2026-07-17");
assert(afterCompletionErrors.some((message) => message.includes("講習修了日以前")),
  "各受講日は講習修了日を超えてはいけません");
const missingCompletionTraining = commonTrainingRecord();
missingCompletionTraining.suspensionCourse = "なし";
delete missingCompletionTraining.courseDate;
const missingCompletionErrors = [];
logic.artifactValidateTraining_(missingCompletionTraining, 2, missingCompletionErrors, [], "2026-07-15");
assert(missingCompletionErrors.some((message) => message.includes("講習修了日")),
  "受講日があっても講習修了日なしの正式記録簿を作成してはいけません");

const secondClassTemplateValues = Array.from({ length: 32 }, () => Array(6).fill(""));
secondClassTemplateValues[21][0] = "操縦演習（異常事態における飛行）";
secondClassTemplateValues[21][1] = "操縦演習に基づく指導及び質疑応答";
secondClassTemplateValues[22][0] = "５分以上";
secondClassTemplateValues[22][1] = "5分以上";
const minimumMatches = logic.artifactFindSecondClassPracticalMinimumCells_(secondClassTemplateValues);
assert.deepEqual(JSON.parse(JSON.stringify(minimumMatches)), [
  { row: 23, column: 1, oldText: "５分以上", newText: "６分以上" }
]);
let writtenMinimum = null;
const fakeSecondClassSheet = {
  getRange(row, column, rowCount, columnCount) {
    if (row === 1 && column === 1 && rowCount === 32 && columnCount === 6) {
      return { getDisplayValues: () => secondClassTemplateValues };
    }
    assert.equal(row, 23);
    assert.equal(column, 1);
    return {
      getDisplayValue: () => secondClassTemplateValues[row - 1][column - 1],
      setValue(value) { writtenMinimum = { row, column, value }; }
    };
  }
};
logic.artifactReplaceSecondClassPracticalMinimum_(fakeSecondClassSheet);
assert.deepEqual(writtenMinimum, { row: 23, column: 1, value: "６分以上" });
assert.equal(secondClassTemplateValues[22][1], "5分以上", "指導・質疑のB23は5分のまま維持します");
const missingMinimumValues = Array.from({ length: 32 }, () => Array(6).fill(""));
assert.throws(() => logic.artifactReplaceSecondClassPracticalMinimum_({
  getRange() { return { getDisplayValues: () => missingMinimumValues }; }
}), /一意/);
const duplicatedMinimumValues = secondClassTemplateValues.map((row) => row.slice());
duplicatedMinimumValues[24][0] = "操縦演習（異常事態における飛行）";
duplicatedMinimumValues[25][0] = "5分以上";
assert.throws(() => logic.artifactReplaceSecondClassPracticalMinimum_({
  getRange() { return { getDisplayValues: () => duplicatedMinimumValues }; }
}), /一意/);

const cleanCertificateText = [
  "第　UC0157　号", "2000年 1月 1日 修了", "2000年 4月 1日 まで有効", "　　　殿",
  "技能証明申請者番号：0000000000", "担当講師："
].join("\n");
assert.deepEqual(Array.from(logic.artifactCertificateTemplateMissingSentinels_(cleanCertificateText)), []);
const dirtyCertificateName = cleanCertificateText.replace("　　　殿", "山田 太郎　殿");
assert(logic.artifactCertificateTemplateMissingSentinels_(dirtyCertificateName).includes("受講者氏名"),
  "実名入り氏名行を空欄センチネルとして受理してはいけません");
const certificateMatrix = [
  ["区分", "航空機", "一等", "二等"],
  ["", ""],
  ["", "回転翼航空機（マルチローター）", "〇", ""],
  ["", "回転翼航空機（ヘリコプター）", "", "〇"],
  ["", "飛行機", "〇", "〇"]
];
const tableSelection = logic.artifactCertificateTableSelection_(
  certificateMatrix, "回転翼航空機（ヘリコプター）", "二等"
);
assert.equal(tableSelection.row, 3);
assert.equal(tableSelection.column, 3);
assert.equal(tableSelection.allCells.length, 6, "全3機種×2等級の既存丸を消去する必要があります");
assert.throws(() => logic.artifactCertificateTableSelection_(
  certificateMatrix.concat([["", "飛行機", "", ""]]), "飛行機", "一等"
), /一意/);
assert.equal(logic.artifactLedgerTemplateRowsHaveData_([["", "", "", "", "□有り　・　□無し"]], true), false);
assert.equal(logic.artifactLedgerTemplateRowsHaveData_([["UC0157", "氏名"]], true), true);
assert.equal(logic.artifactLedgerTemplateRowsHaveData_([["", "", "", "", "=FORMULA"]], false), true);
const validLedgerAuditRow = [
  "UC015726070001", "氏名", "二等", "2026-07-15", "□有り　・　☑無し", "", "2026-10-14", "",
  "record-1", "1", "a".repeat(64) + " / 2026-07-15 10:00:00", "", ""
];
validLedgerAuditRow[11] = logic.artifactLedgerVisibleHash_(validLedgerAuditRow.slice(0, 8));
validLedgerAuditRow[12] = logic.artifactLedgerStateHash_(validLedgerAuditRow.slice(0, 8), validLedgerAuditRow.slice(8, 12));
assert.equal(logic.artifactAnnualLedgerRowsIssue_([validLedgerAuditRow]), "");
function ledgerAuditRow(version, memo, payloadChar) {
  const row = validLedgerAuditRow.slice();
  row[7] = memo;
  row[9] = String(version);
  row[10] = payloadChar.repeat(64) + " / 2026-07-15 10:00:0" + version;
  row[11] = logic.artifactLedgerVisibleHash_(row.slice(0, 8));
  row[12] = logic.artifactLedgerStateHash_(row.slice(0, 8), row.slice(8, 12));
  return row;
}
const ledgerV1Old = ledgerAuditRow(1, "【旧版・v2で訂正】", "a");
const ledgerV2Active = ledgerAuditRow(2, "【訂正版v2・旧版行を残置】", "b");
assert.equal(logic.artifactAnnualLedgerRowsIssue_([ledgerV1Old, ledgerV2Active]), "");
const missingOldMarker = ledgerV1Old.slice();
missingOldMarker[7] = "";
missingOldMarker[11] = logic.artifactLedgerVisibleHash_(missingOldMarker.slice(0, 8));
missingOldMarker[12] = logic.artifactLedgerStateHash_(missingOldMarker.slice(0, 8), missingOldMarker.slice(8, 12));
assert(logic.artifactAnnualLedgerRowsIssue_([missingOldMarker, ledgerV2Active]).includes("旧版表示"));
assert(logic.artifactAnnualLedgerRowsIssue_([ledgerV1Old, ledgerV1Old.slice()]).includes("重複"));
const missingLedgerCertificateNo = validLedgerAuditRow.slice();
missingLedgerCertificateNo[0] = "";
assert(logic.artifactAnnualLedgerRowsIssue_([missingLedgerCertificateNo]).includes("証明書番号"));
const missingLedgerRecordId = validLedgerAuditRow.slice();
missingLedgerRecordId[8] = "";
assert(logic.artifactAnnualLedgerRowsIssue_([missingLedgerRecordId]).includes("recordId"));
const malformedLedgerHash = validLedgerAuditRow.slice();
malformedLedgerHash[10] = "not-a-hash";
assert(logic.artifactAnnualLedgerRowsIssue_([malformedLedgerHash]).includes("payloadHash"));
assert(logic.artifactAnnualLedgerRowsIssue_([["", "", "", "", "□有り　・　□無し", "", "", "", "record-1", "1", "a".repeat(64) + " / 2026-07-15 10:00:00", "b".repeat(64), "c".repeat(64)]]).includes("監査列だけ"));
const occupiedLedgerRows = [
  ["", "", "", "", "□有り　・　□無し", "", "", "", "", "", "", "", ""],
  ["", "氏名だけ残存", "", "", "", "", "", "", "record-x", "1", "a".repeat(64) + " / 2026-07-15 10:00:00", "b".repeat(64), "c".repeat(64)],
  ["", "", "", "", "", "", "", "", "", "", "", "", ""]
];
const nextLedgerRowSheet = {
  getMaxRows: () => 5,
  getRange(row, column, rowCount, columnCount) {
    assert.deepEqual([row, column, rowCount, columnCount], [3, 2, 3, 13]);
    return { getDisplayValues: () => occupiedLedgerRows };
  }
};
assert.equal(logic.artifactNextLedgerRow_(nextLedgerRowSheet), 5,
  "B列が空でもC:Mのどこかに値がある行を上書きしてはいけません");
const registryPayloadHash = "c".repeat(64);
const validRegistryMetadata = {
  kind: "ledger", version: 1, payloadHash: registryPayloadHash,
  ledgerRow: 3, ledgerSheetName: "2026年",
  ledgerVisibleHash: "d".repeat(64), ledgerStateHash: "e".repeat(64),
  recordUpdates: { certificateNo: "UC015726070001" }
};
const validRegistryRow = [
  "2026-07-15 10:00:00", "record-1", "ledger", registryPayloadHash, "1", "created",
  "file-id", "https://docs.google.com/spreadsheets/d/file-id/edit", "台帳", "folder-id", "owner@example.com",
  "UC015726070001", "作成", JSON.stringify(validRegistryMetadata), "3"
];
assert.equal(logic.artifactRegistryRowsIssue_([validRegistryRow]), "");
const validOutputMetadata = {
  kind: "certificate", version: 1, payloadHash: registryPayloadHash,
  outputContentHash: "1".repeat(64), outputDriveVersion: "9",
  outputModifiedTime: "2026-07-15T01:00:00.000Z", outputMd5Checksum: ""
};
const validOutputRegistryRow = [
  "2026-07-15 10:00:00", "record-2", "certificate", registryPayloadHash, "1", "created",
  "certificate-file", "https://docs.google.com/document/d/certificate-file/edit", "証明書", "record-folder", "owner@example.com",
  "UC015726070002", "作成", JSON.stringify(validOutputMetadata), "3"
];
assert.equal(logic.artifactRegistryRowsIssue_([validOutputRegistryRow]), "");
const missingOutputRevision = validOutputRegistryRow.slice();
missingOutputRevision[13] = JSON.stringify({ ...validOutputMetadata, outputDriveVersion: "" });
assert(logic.artifactRegistryRowsIssue_([missingOutputRevision]).includes("Drive版metadata"));
assert.equal(logic.artifactRegistryGlobalRowsIssue_([
  { recordId: "record-2", kind: "certificate", version: 1, status: "created", fileId: "file-v1" },
  { recordId: "record-2", kind: "certificate", version: 2, status: "created", fileId: "file-v2" }
]), "");
assert(logic.artifactRegistryGlobalRowsIssue_([
  { recordId: "record-2", kind: "certificate", version: 2, status: "created", fileId: "file-v2" }
]).includes("1から連続"));
const versionRows = [
  { recordId: "record-2", kind: "certificate", version: 1, hash: "a", status: "created" },
  { recordId: "record-2", kind: "certificate", version: 2, hash: "b", status: "created" }
];
assert.equal(logic.artifactFindExisting_(versionRows, "record-2", "certificate", "a"), null,
  "旧版と同じpayloadへ戻しても旧版を再利用してはいけません");
assert.equal(logic.artifactFindExisting_(versionRows, "record-2", "certificate", "b").version, 2);
const registryMissingNumber = validRegistryRow.slice();
registryMissingNumber[11] = "";
assert(logic.artifactRegistryRowsIssue_([registryMissingNumber]).includes("採番情報"));
const registryMissingHash = validRegistryRow.slice();
registryMissingHash[3] = "";
assert(logic.artifactRegistryRowsIssue_([registryMissingHash]).includes("payloadHash"));
const registryBadMetadata = validRegistryRow.slice();
registryBadMetadata[13] = "{}";
assert(logic.artifactRegistryRowsIssue_([registryBadMetadata]).includes("metadataJson"));
const assignmentRows = [
  {
    recordId: "record-1", kind: "certificate", status: "created", documentNumbers: "UC015726070001",
    metadataJson: JSON.stringify({ recordUpdates: { certificateNo: "UC015726070001" } })
  },
  {
    recordId: "record-1", kind: "dipsCsv", status: "error", documentNumbers: "UC015726070001;260701",
    metadataJson: JSON.stringify({ recordUpdates: { certificateNo: "UC015726070001", dipsApplicantId: "260701" } })
  },
  {
    recordId: "record-1", kind: "billing", status: "created", documentNumbers: "QT-UC0157-20260715-1;INV-UC0157-20260715-1",
    metadataJson: JSON.stringify({ recordUpdates: { quoteNo: "QT-UC0157-20260715-1", invoiceNo: "INV-UC0157-20260715-1" } })
  }
];
const assignmentState = logic.artifactRecordNumberState_(assignmentRows, "record-1");
assert.deepEqual(JSON.parse(JSON.stringify(assignmentState.assignments)), {
  certificateNo: "UC015726070001", dipsApplicantId: "260701",
  quoteNo: "QT-UC0157-20260715-1", invoiceNo: "INV-UC0157-20260715-1"
});
assert.throws(() => logic.artifactAssertRecordNumberContinuity_(assignmentState, {
  certificateNo: "UC015726070002"
}, ["certificate"]), /変更できません/);
assert.throws(() => logic.artifactAssertRecordNumberContinuity_(assignmentState, {
  dipsApplicantId: "260702"
}, ["dipsCsv"]), /変更できません/);
assert.throws(() => logic.artifactAssertRecordNumberContinuity_(assignmentState, {
  quoteNo: "QT-UC0157-20260715-2", invoiceNo: "INV-UC0157-20260715-1"
}, ["billing"]), /変更できません/);
const conflictingAssignmentState = logic.artifactRecordNumberState_(assignmentRows.concat([{
  recordId: "record-1", kind: "certificate", status: "error", documentNumbers: "UC015726070099",
  metadataJson: JSON.stringify({ recordUpdates: { certificateNo: "UC015726070099" } })
}]), "record-1");
assert.throws(() => logic.artifactAssertRecordNumberContinuity_(conflictingAssignmentState, {}, ["certificate"]), /競合/);
assert.deepEqual(Array.from(logic.artifactGuidanceTemplateMissingSentinels_([
  "対象者：二等無人航空機操縦士", "11,440円（税込）", "電話番号：", "メールアドレス：", "株式会社", "住所："
].join("\n"))), []);
function fakeTab(id, title, children) {
  return { getId: () => id, getTitle: () => title, getChildTabs: () => children || [] };
}
const nestedTabs = logic.artifactFlattenDocumentTabs_([fakeTab("t.0", "ベース", [fakeTab("t.1", "子")])]);
assert.deepEqual(Array.from(nestedTabs, (tab) => tab.getId()), ["t.0", "t.1"]);
assert.throws(() => logic.artifactGetDocumentTab_({
  getTab: () => null, getTabs: () => [fakeTab("t.0", "A"), fakeTab("t.1", "B")]
}), /複数タブ/);

assert.equal(logic.artifactSheetText_("=SUM(A1:A2)"), "'=SUM(A1:A2)");
assert.equal(logic.artifactSheetText_("@IMPORTXML"), "'@IMPORTXML");
assert.equal(logic.artifactSheetText_("  =SUM(A1:A2)"), "'  =SUM(A1:A2)");
assert.equal(logic.artifactSheetText_("通常文字"), "通常文字");
assert.deepEqual(Array.from(logic.artifactSafeSheetRow_(["+1", 1, "氏名"])), ["'+1", 1, "氏名"]);
assert.equal(logic.artifactCsvRow_(["a,b", 'a"b', "a\nb"]), '"a,b","a""b","a\nb"');
assert.equal(
  logic.artifactComposeTemplateFingerprint_("template-id", "2026-07-15T01:02:03.000Z", ""),
  "drive:template-id@2026-07-15T01:02:03.000Z"
);
assert.equal(
  logic.artifactComposeTemplateFingerprint_("", "", "DIPS_MANUAL_11COL_V2"),
  "layout:DIPS_MANUAL_11COL_V2"
);
assert.equal(
  logic.artifactComposeTemplateFingerprint_("template-id", "2026-07-15T01:02:03.000Z", "TRAINING_OUTPUT_V2"),
  "drive:template-id@2026-07-15T01:02:03.000Z|layout:TRAINING_OUTPUT_V2",
  "原本を変更しないコピー後補正もfingerprintへ含めます"
);
assert.throws(() => logic.artifactComposeTemplateFingerprint_("", "", ""));
assert.deepEqual(Array.from(logic.artifactNormalizeIsoDateList_("2026-08-14, 2026-08-13\n2026-08-14")), [
  "2026-08-13", "2026-08-14"
]);
let calendarErrors = [];
logic.artifactValidateDipsCalendarSettings_({}, "2026-07-15", true, calendarErrors);
assert(calendarErrors.some((message) => message.includes("確認日")));
assert(calendarErrors.some((message) => message.includes("確認者")));
calendarErrors = [];
logic.artifactValidateDipsCalendarSettings_({
  dipsAdditionalClosedDates: "2026-02-30", dipsCalendarConfirmedDate: "2026-07-16", dipsCalendarConfirmedBy: "担当"
}, "2026-07-15", true, calendarErrors);
assert(calendarErrors.some((message) => message.includes("追加閉庁日")));
assert(calendarErrors.some((message) => message.includes("未来日")));
assert.equal(logic.artifactDipsSubmissionDeadline_("2026-07-15", "", context.RENEWAL_JAPAN_HOLIDAYS), "2026-07-23");
assert.equal(logic.artifactDipsSubmissionDeadline_("2026-07-15", "2026-07-23", context.RENEWAL_JAPAN_HOLIDAYS), "2026-07-24");
assert.throws(() => logic.artifactDipsSubmissionDeadline_("2027-12-30", "", context.RENEWAL_JAPAN_HOLIDAYS), /2028年/);
let dipsErrors = [];
let dipsWarnings = [];
const dipsCalendarSettings = {
  dipsCalendarConfirmedDate: "2026-07-15", dipsCalendarConfirmedBy: "担当", dipsAdditionalClosedDates: ""
};
assert.equal(logic.artifactValidateDipsSubmission_(
  dipsCalendarSettings, "2026-07-15", "2026-07-14", "2026-07-24", dipsErrors, dipsWarnings
), "2026-07-23");
assert(dipsErrors.some((message) => message.includes("発行日以後")));
assert(dipsWarnings.some((message) => message.includes("担当部署に確認が必要")));
assert(dipsWarnings.some((message) => message.includes("超過")));
dipsErrors = [];
dipsWarnings = [];
logic.artifactValidateDipsSubmission_(
  dipsCalendarSettings, "2026-07-15", "2026-07-25", "2026-07-24", dipsErrors, dipsWarnings
);
assert(dipsErrors.some((message) => message.includes("未来日")));
assert.doesNotThrow(() => logic.artifactAssertNumberingSettings_({
  certificateSequenceSeed: "UC015726070123", dipsSequenceSeed: "260712"
}));
assert.doesNotThrow(() => logic.artifactAssertNumberingSettings_({
  numberingInitialized: true, numberingCutoverMonth: "2026-07"
}));
assert.throws(() => logic.artifactAssertNumberingSettings_({ numberingInitialized: true }));
assert.throws(() => logic.artifactAssertNumberingSettings_({
  numberingInitialized: true, numberingCutoverMonth: "2026-13"
}));
assert.throws(() => logic.artifactAssertNumberingSettings_({ certificateSequenceSeed: "UC015726130123" }));
assert.throws(() => logic.artifactAssertNumberingSettings_({ dipsSequenceSeed: "261312" }));
assert.equal(logic.artifactSequenceSeedValue_("UC015726070123", "UC01572607", 4), 123);
assert.equal(logic.artifactSequenceSeedValue_("UC015726060999", "UC01572607", 4), 0,
  "不一致月の修了証明書seedは無視します");
assert.equal(logic.artifactSequenceSeedValue_("260712", "2607", 2), 12);
assert.equal(logic.artifactSequenceSeedValue_("", "2608", 2), 0,
  "切替後の未来月に既存番号もseedもなければ連番1から開始できます");
assert.equal(logic.artifactSequenceSeedValue_("260699", "2607", 2), 0,
  "不一致月のDIPS seedは無視します");
assert.doesNotThrow(() => logic.artifactAssertPrivateSharingAccess_("PRIVATE", "PRIVATE"));
assert.throws(() => logic.artifactAssertPrivateSharingAccess_("DOMAIN", "PRIVATE"));
assert.doesNotThrow(() => logic.artifactRequireNumberingInitialized_({ numberingInitialized: true }, "修了証明書番号"));
assert.throws(() => logic.artifactRequireNumberingInitialized_({ numberingInitialized: false }, "修了証明書番号"));
const numberingSettings = { numberingInitialized: true, numberingCutoverMonth: "2026-07" };
assert.doesNotThrow(() => logic.artifactAssertAutomaticNumberingAllowed_(numberingSettings, "2026-07-01", "修了証明書番号"));
assert.doesNotThrow(() => logic.artifactAssertAutomaticNumberingAllowed_(numberingSettings, "2026-08-01", "DIPS申請者ID"));
assert.throws(() => logic.artifactAssertAutomaticNumberingAllowed_(numberingSettings, "2026-06-30", "修了証明書番号"));
const cutoverErrors = [];
logic.artifactValidateAutomaticNumberingForPreflight_(numberingSettings, "2026-06-30", "修了証明書番号", cutoverErrors);
assert(cutoverErrors.some((message) => message.includes("手入力")), "切替前の自動採番を事前検査で停止します");
driveState.sharingAccess = "PRIVATE";
driveState.sharingThrows = false;
driveState.outputTrashed = false;
driveState.templateParentId = "template-parent";
driveState.shareableByEditors = false;
driveState.permissions = [{ type: "user", emailAddress: "owner@example.com", role: "owner" }];
driveState.permissionNextPageToken = "";
const allowedOutputEmails = "owner@example.com";
function iteratorOf(items) {
  let index = 0;
  return { hasNext: () => index < items.length, next: () => items[index++] };
}
assert.deepEqual(Array.from(logic.artifactIteratorItems_(iteratorOf([1, 2, 3]), 2)), [1, 2]);
assert.equal(logic.artifactExtractDriveFileId_("https://docs.google.com/document/d/clean-certificate/edit"), "clean-certificate");
assert.equal(logic.artifactTemplateId_("ledger", { ledgerTemplateId: "clean-ledger" }), "clean-ledger");
assert.throws(() => logic.artifactTemplateId_("ledger", {}), /必須|指定/);
assert.throws(() => logic.artifactTemplateId_("certificate", { certificateTemplateId: "blocked-certificate" }), /既知の実データ/);
assert.deepEqual(Array.from(logic.artifactNormalizeAllowedEmails_("Owner@Example.com, staff@example.com\nowner@example.com")), [
  "owner@example.com", "staff@example.com"
]);
assert.throws(() => logic.artifactAssertAllowedOutputEmails_(""), /必須/);
assert.doesNotThrow(() => logic.artifactRequireSafeOutputFolder_("safe-output", [], allowedOutputEmails));
driveState.actorEmail = "";
assert.throws(() => logic.artifactRequireSafeOutputFolder_("safe-output", [], allowedOutputEmails), /実行者メール/);
driveState.actorEmail = "owner@example.com";
driveState.outputTrashed = true;
assert.throws(() => logic.artifactRequireSafeOutputFolder_("safe-output", [], allowedOutputEmails));
driveState.outputTrashed = false;
driveState.sharingAccess = "DOMAIN";
assert.throws(() => logic.artifactRequireSafeOutputFolder_("safe-output", [], allowedOutputEmails));
driveState.sharingAccess = "PRIVATE";
driveState.sharingThrows = true;
assert.throws(() => logic.artifactRequireSafeOutputFolder_("safe-output", [], allowedOutputEmails));
driveState.sharingThrows = false;
driveState.templateParentId = "safe-output";
assert.throws(() => logic.artifactRequireSafeOutputFolder_("safe-output", [], allowedOutputEmails));
driveState.templateParentId = "template-parent";
assert.throws(() => logic.artifactRequireSafeOutputFolder_("", [], allowedOutputEmails));
function driveItem(options) {
  const config = Object.assign({
    id: "drive-item", trashed: false, access: "PRIVATE", parents: ["expected-parent"], owner: "owner@example.com",
    editors: [], viewers: [], shareableByEditors: false
  }, options || {});
  return {
    getId: () => config.id,
    isTrashed: () => config.trashed,
    getSharingAccess: () => config.access,
    getOwner: () => config.owner ? user(config.owner) : null,
    getEditors: () => config.editors.map(user),
    getViewers: () => config.viewers.map(user),
    isShareableByEditors: () => config.shareableByEditors,
    getParents() {
      let index = 0;
      return {
        hasNext: () => index < config.parents.length,
        next: () => ({ getId: () => config.parents[index++] })
      };
    }
  };
}
assert.doesNotThrow(() => logic.artifactAssertReusableDriveItem_(driveItem(), "expected-parent", "テスト項目", allowedOutputEmails));
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ trashed: true }), "expected-parent", "テスト項目", allowedOutputEmails));
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ access: "DOMAIN" }), "expected-parent", "テスト項目", allowedOutputEmails));
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ parents: ["moved-parent"] }), "expected-parent", "テスト項目", allowedOutputEmails));
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ viewers: ["outsider@example.com"] }), "expected-parent", "テスト項目", allowedOutputEmails));
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ shareableByEditors: true }), "expected-parent", "テスト項目", allowedOutputEmails), /再共有/);
driveState.permissions = [{ type: "user", emailAddress: "owner@example.com", role: "owner" }, { type: "group", emailAddress: "approved-group@example.com", role: "reader" }];
assert.doesNotThrow(() => logic.artifactAssertReusableDriveItem_(driveItem(), "expected-parent", "テスト項目", "owner@example.com,approved-group@example.com"));
driveState.permissions = [{ type: "user", emailAddress: "owner@example.com", role: "owner" }, { type: "group", emailAddress: "outsider-group@example.com", role: "reader" }];
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem(), "expected-parent", "テスト項目", allowedOutputEmails), /許可一覧外/);
driveState.permissions = [{ type: "domain", domain: "example.com", role: "reader" }];
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem(), "expected-parent", "テスト項目", allowedOutputEmails), /ドメイン|リンク共有/);
driveState.permissions = [{ type: "user", emailAddress: "owner@example.com", role: "owner" }];
assert.throws(() => logic.artifactAssertReusableDriveItem_({
  getId: () => "broken-item",
  isTrashed: () => false,
  isShareableByEditors: () => false,
  getSharingAccess: () => { throw new Error("unavailable"); },
  getParents: () => ({ hasNext: () => false })
}, "expected-parent", "テスト項目", allowedOutputEmails));
assert.equal(logic.artifactBoolean_("true"), true);
assert.equal(logic.artifactBoolean_("false"), false);
assert.equal(logic.artifactFolderUrl_(""), "", "未設定の出力先へ既定URLを補完してはいけません");
const numberingHashSettings = logic.artifactSettingsForHash_("ledger", {
  issuerCompany: "CDP", outputFolderId: "folder", numberingInitialized: true,
  numberingCutoverMonth: "2026-07"
});
assert.equal(numberingHashSettings.numberingCutoverMonth, "2026-07", "採番切替年月をhashへ含めます");

const normalized = logic.artifactNormalizeRecord_({ id: "rec-1" });
assert.equal(normalized.recordId, "rec-1");
assert.equal(normalized._recordIdMismatch, false);
assert.equal(logic.artifactNormalizeRecord_({ id: "rec-1", recordId: "rec-2" })._recordIdMismatch, true);
const hashRecord = logic.artifactRecordForHash_("certificate", {
  targetName: "対象者", certificateNo: "UC015726070001", courseDate: "2026-07-15",
  certificateIssuedDate: "2026-07-15",
  certificateExpiry: "2026-10-14", skillsApplicantNo: "1234567890", licenseClass: "二等",
  certificateInstructor: "講師", eligibilityCheckStatus: "一致確認済み",
  eligibilityCheckedDate: "2026-07-15", eligibilityCheckedBy: "担当者",
  eligibilityEvidence: "DIPS画面", updatedAt: "changes-every-save", internalMemo: "帳票外"
});
assert.equal(Object.prototype.hasOwnProperty.call(hashRecord, "updatedAt"), false);
assert.equal(Object.prototype.hasOwnProperty.call(hashRecord, "internalMemo"), false);
assert.equal(hashRecord.certificateNo, "UC015726070001");
assert.equal(hashRecord.certificateIssuedDate, "2026-07-15");
assert.equal(hashRecord.eligibilityCheckStatus, "一致確認済み");
assert.equal(hashRecord.eligibilityEvidence, "DIPS画面");
const ledgerHashRecord = logic.artifactRecordForHash_("ledger", {
  certificateIssuedDate: "2026-07-15", certificateDeliveredDate: "2026-07-16"
});
assert.equal(ledgerHashRecord.certificateIssuedDate, "2026-07-15");
assert.equal(ledgerHashRecord.certificateDeliveredDate, "2026-07-16");
const dipsHashRecord = logic.artifactRecordForHash_("dipsCsv", {
  certificateIssuedDate: "2026-07-15", fitnessCertificateNo: "PA999999999999",
  dipsDate: "2026-06-01", dipsCompletionLinkedDate: "2026-07-16", courseProvider: "CDP"
});
assert.equal(dipsHashRecord.certificateIssuedDate, "2026-07-15");
assert.equal(Object.prototype.hasOwnProperty.call(dipsHashRecord, "fitnessCertificateNo"), false,
  "DIPS列7固定値に旧入力値を混入させてはいけません");
assert.equal(Object.prototype.hasOwnProperty.call(dipsHashRecord, "dipsDate"), false,
  "本人のDIPS更新申請日は機関CSVの内容hashへ含めません");
assert.equal(Object.prototype.hasOwnProperty.call(dipsHashRecord, "dipsCompletionLinkedDate"), false,
  "機関連携日はCSV出力後の運用状態なので内容hashへ含めません");
assert.equal(dipsHashRecord.courseProvider, "CDP");
const trainingHashRecord = logic.artifactRecordForHash_("training", {
  aircraftType: "回転翼航空機（マルチローター）",
  suspensionCourse: "なし", courseProvider: "CDP", eligibilityCheckStatus: "一致確認済み"
});
assert.equal(trainingHashRecord.aircraftType, "回転翼航空機（マルチローター）");
assert.equal(trainingHashRecord.eligibilityCheckStatus, "一致確認済み");
assert.equal(trainingHashRecord.suspensionCourse, "なし");
assert.equal(trainingHashRecord.courseProvider, "CDP");
assert.equal(Object.prototype.hasOwnProperty.call(trainingHashRecord, "practicalExercise1Date"), false,
  "通常講習では無視する実地入力をhashへ含めません");
const billingHashRecord = logic.artifactRecordForHash_("billing", {
  accountingDate: "2026-07-15", taxExceptionApprovalDate: "2026-07-14",
  taxExceptionApprovedBy: "経理", taxExceptionReason: "軽減根拠"
});
assert.equal(billingHashRecord.accountingDate, "2026-07-15");
assert.equal(billingHashRecord.taxExceptionReason, "軽減根拠");
const guidanceHashRecord = logic.artifactRecordForHash_("guidance", { taxExceptionApprovedBy: "経理" });
assert.equal(guidanceHashRecord.taxExceptionApprovedBy, "経理");

[
  "artifactCreateLedger_", "artifactCreateCertificate_", "artifactCreateDipsCsv_",
  "artifactCreateGuidance_", "artifactCreateTraining_", "artifactCreateBilling_"
].forEach((name) => assert(source.includes("function " + name + "("), name + "がありません"));
assert(source.includes("SCHEMA_VERSION: 3"), "完成版の共通スキーマ版へ増分されていません");
assert(source.includes('ledger: "LEDGER_OUTPUT_V4"'), "台帳レイアウト版がありません");
assert(source.includes('certificate: "CERTIFICATE_OUTPUT_V2"'), "証明書レイアウト版がありません");
assert(source.includes('dipsCsv: "DIPS_MANUAL_11COL_V2"'), "DIPSレイアウト版がありません");
assert(source.includes('training: "TRAINING_OUTPUT_V2"'), "講習記録簿レイアウト版がありません");
assert(source.includes('billing: "CDP_CLEAN_BILLING_V2"'), "請求帳票レイアウト版がありません");
assert(source.includes("file.getLastUpdated().toISOString()"),
  "Driveテンプレートfingerprintに最終更新日時が含まれていません");
assert(source.includes("templateFingerprint: templateFingerprints[kind]"),
  "payloadHashにテンプレートfingerprintが含まれていません");
assert.equal(source.includes("DEFAULT_PARENT_FOLDER_ID"), false, "出力先の既定フォルダへフォールバックしてはいけません");
assert(source.includes("folder.getSharingAccess()"), "出力先フォルダの共有範囲を検査する必要があります");
assert(source.includes("DriveApp.Access.PRIVATE"), "出力先フォルダはPRIVATEだけを許可する必要があります");
assert(source.includes("templateFile.getParents()"), "テンプレート親フォルダを出力先から除外する必要があります");
assert(source.includes("artifactAssertDriveItemAcl_"), "所有者・編集者・閲覧者のACL照合がありません");
assert(source.includes("Drive.Permissions.list(itemId"), "Advanced Drive v3で全権限を列挙する必要があります");
assert(source.includes("supportsAllDrives: true"), "共有ドライブを含むACL列挙指定がありません");
assert(source.includes("item.isShareableByEditors()"), "編集者による再共有をfail-closed検査する必要があります");
assert(source.includes("item.setShareableByEditors(false)"), "新規成果物で編集者再共有を無効化する必要があります");
const advancedManifest = JSON.parse(fs.readFileSync("appsscript.json", "utf8"));
assert((advancedManifest.dependencies && advancedManifest.dependencies.enabledAdvancedServices || []).some((service) =>
  service.userSymbol === "Drive" && service.serviceId === "drive" && service.version === "v3"
), "Advanced Drive API v3をmanifestで有効化する必要があります");
assert(source.includes("allowedOutputEmails"), "成果物アクセス許可メール設定がありません");
assert(source.includes("BLOCKED_TEMPLATE_IDS"), "既知の実データ入りテンプレートID拒否設定がありません");
assert(source.includes("numberingInitialized"), "採番移行確認設定がありません");
assert(source.includes("numberingCutoverMonth"), "採番切替年月設定がありません");
assert(source.includes("certificateSequenceSeed"), "修了証明書採番seedがありません");
assert(source.includes("dipsSequenceSeed"), "DIPS採番seedがありません");
assert(source.includes('BILLING_NUMBER_NAMESPACE: "UC0157"'), "見積・請求番号の専用名前空間がありません");
const saveSettingsBlock = source.slice(
  source.indexOf("function apiSaveArtifactSettings"),
  source.indexOf("function apiPreflightArtifacts")
);
assert(saveSettingsBlock.includes("artifactRequireSafeOutputFolder_(next.outputFolderId,"),
  "設定保存時に出力先の非公開検査がありません");
assert(saveSettingsBlock.includes("artifactAssertNumberingSettings_(next)"),
  "設定保存時に採番seedの形式検査がありません");
assert(saveSettingsBlock.includes("numberingCutoverMonth"),
  "設定保存時に採番切替年月を保存する必要があります");
assert(saveSettingsBlock.includes("artifactAssertLedgerTemplateClean_(next.ledgerTemplateId)"));
assert(saveSettingsBlock.includes("artifactAssertCertificateTemplateClean_(next.certificateTemplateId)"));
assert(saveSettingsBlock.includes("artifactAssertAllowedOutputEmails_(next.allowedOutputEmails)"));
const preflightBlock = source.slice(
  source.indexOf("function artifactBuildPreflight_"),
  source.indexOf("function artifactValidateCommon_")
);
assert(preflightBlock.includes("artifactRequireSafeOutputFolder_(settings.outputFolderId,"),
  "事前検査時に出力先の非公開検査がありません");
const createBlock = source.slice(
  source.indexOf("function apiCreateArtifacts"),
  source.indexOf("function artifactBuildPreflight_")
);
assert(createBlock.includes("var lockedPreflight = artifactBuildPreflight_(request)"),
  "作成時はロック取得後にも出力先を含む事前検査を再実行する必要があります");
assert(createBlock.includes("settings.certificateSequenceSeed"),
  "修了証明書の自動採番に移行seedが渡されていません");
assert(createBlock.includes("settings.dipsSequenceSeed"),
  "DIPSの自動採番に移行seedが渡されていません");
assert(createBlock.includes("artifactAssertAutomaticNumberingAllowed_"),
  "空欄からの自動採番前に採番移行確認と切替年月を強制する必要があります");
assert(createBlock.includes("artifactAssertReusableDriveItem_(existingArtifactFile"),
  "同一内容の既存成果物を再利用する前にも共有・親・削除状態を検査する必要があります");
assert.equal(/Array\.isArray\(request\.schedules\)/.test(createBlock), false,
  "作成時にrequest側の未保存日程を正本にしてはいけません");
assert(createBlock.includes("artifactNormalizeSchedules_(settings.schedules)"),
  "作成時は保存済み日程マスタを正本にする必要があります");
assert.equal(/Array\.isArray\(request\.schedules\)/.test(preflightBlock), false,
  "事前検査でrequest側の未保存日程を正本にしてはいけません");
assert(preflightBlock.includes("artifactNormalizeSchedules_(settings.schedules)"),
  "事前検査は保存済み日程マスタを正本にする必要があります");
assert(source.includes("numberingCutoverMonth: artifactText_(settings.numberingCutoverMonth)"),
  "監査metadataへ採番切替年月を残す必要があります");
assert(source.includes("eligibilityCheck: artifactEligibilityMetadata_(record)"),
  "監査metadataへ正式成果物の適格性照合証跡を残す必要があります");
const validateKindBlock = source.slice(
  source.indexOf("function artifactValidateKind_"),
  source.indexOf("function artifactValidateCertificateDates_")
);
assert(validateKindBlock.includes("artifactValidateEligibility_(record"),
  "台帳・証明書・DIPS・講習記録簿の作成前に適格性照合を強制する必要があります");
assert(validateKindBlock.includes('record.aircraftType) !== "回転翼航空機（マルチローター）"'),
  "講習記録簿の機体種類をマルチローターに限定する必要があります");
assert(validateKindBlock.includes('record.courseProvider) !== "CDP"'),
  "CDP実施分以外の正式成果物をCDP名義で作成してはいけません");
assert(validateKindBlock.includes("artifactValidateDipsSubmission_"),
  "DIPS修了者情報の5営業日連携期限検査がありません");

const autoRootBlock = source.slice(
  source.indexOf("function artifactEnsureAutoRoot_"),
  source.indexOf("function artifactEnsureRecordFolder_")
);
const recordFolderBlock = source.slice(
  source.indexOf("function artifactEnsureRecordFolder_"),
  source.indexOf("function artifactEnsureRegistry_")
);
const registryBlock = source.slice(
  source.indexOf("function artifactEnsureRegistry_"),
  source.indexOf("function artifactInitializeRegistryHeader_")
);
const registryStructureBlock = source.slice(
  source.indexOf("function artifactAssertRegistryStructure_"),
  source.indexOf("function artifactReadRegistryRows_")
);
const ledgerBlock = source.slice(
  source.indexOf("function artifactEnsureAnnualLedger_"),
  source.indexOf("function artifactNextLedgerRow_")
);
[autoRootBlock, recordFolderBlock, registryBlock, ledgerBlock].forEach((block) => {
  assert(block.includes("artifactAssertReusableDriveItem_"),
    "保存済みDrive項目は非削除・PRIVATE・親一致を毎回検査する必要があります");
});
assert(autoRootBlock.includes('setDescription(artifactGeneratedFileIdentity_("auto-root"') &&
  autoRootBlock.includes("artifactAssertGeneratedFileIdentity_"),
  "自動作成フォルダは新規時だけidentityを設定し、再利用時に完全照合する必要があります");
assert(recordFolderBlock.includes('setDescription(artifactGeneratedFileIdentity_("record-folder"') &&
  recordFolderBlock.includes("artifactAssertGeneratedFileIdentity_"),
  "対象者フォルダはrecordIdを含むidentityを新規時だけ設定し、再利用時に完全照合する必要があります");
assert(ledgerBlock.includes("artifactAssertLedgerTemplateClean_(templateId)"),
  "年次台帳作成直前にも清浄原本を検査する必要があります");
assert(ledgerBlock.includes("SpreadsheetApp.create(name)"),
  "台帳は実データ入り得る原本ファイル全体を複製せず新規作成します");
assert(ledgerBlock.includes("sourceBase.copyTo(ss)"), "台帳は清浄なベースシートだけをコピーします");
assert.equal(ledgerBlock.includes(".makeCopy("), false, "台帳原本全体をコピーしてはいけません");
assert(ledgerBlock.includes("artifactAssertAnnualLedgerStructure_"),
  "保存済み・同名・新規の年次台帳を厳格な単一シート構造で検査する必要があります");
assert(ledgerBlock.includes('setDescription(artifactGeneratedFileIdentity_("annual-ledger"'),
  "年次台帳へ生成物識別子を付ける必要があります");
assert.equal(ledgerBlock.includes('getSheetByName("ベース") ||'), false,
  "年次台帳再利用でベースや先頭シートへfallbackしてはいけません");
assert(registryBlock.includes("artifactAssertRegistryStructure_"),
  "保存済み・同名レジストリは完全構造検査が必要です");
assert(registryBlock.includes('setDescription(artifactGeneratedFileIdentity_("registry"'),
  "成果物レジストリへ生成物識別子を付ける必要があります");
assert.equal(registryBlock.includes("|| storedSs.getSheets()[0]"), false,
  "保存済みレジストリの先頭シートへfallbackしてはいけません");
assert.equal(registryBlock.includes("artifactInitializeRegistryHeader_(stored"), false,
  "保存済みレジストリのヘッダーを上書きしてはいけません");
assert(registryStructureBlock.includes("RENEWAL_ARTIFACT_REGISTRY_HEADERS"),
  "レジストリ再利用時は完全ヘッダーを照合する必要があります");
[autoRootBlock, recordFolderBlock, registryBlock, ledgerBlock].forEach((block) => {
  assert(block.includes("length > 1"), "同名Drive候補が複数なら任意採用せず停止する必要があります");
});
assert.equal(registryBlock.includes("props.deleteProperty(key)"), false,
  "保存済みレジストリ異常時にpropertyを消して新規作成へ移行してはいけません");
assert.equal(ledgerBlock.includes("props.deleteProperty(key)"), false,
  "保存済み年次台帳異常時にpropertyを消して新規作成へ移行してはいけません");
const allRegistryBlock = source.slice(
  source.indexOf("function artifactReadAllRegistryRows_"),
  source.indexOf("function artifactRollbackCreated_")
);
assert(allRegistryBlock.includes("artifactAssertReusableDriveItem_"),
  "全レジストリ読込時も保存先と共有状態を検査する必要があります");
assert(allRegistryBlock.includes("artifactAssertRegistryStructure_"),
  "全レジストリ読込時も生成物識別子・単一シート・完全ヘッダーを検査する必要があります");
assert.equal(/catch\s*\([^)]*\)\s*\{\s*\}/.test(allRegistryBlock), false,
  "レジストリ読込失敗を黙殺してはいけません");
const rollbackBlock = source.slice(
  source.indexOf("function artifactRollbackCreated_"),
  source.indexOf("function artifactAppendRegistry_")
);
assert(rollbackBlock.includes("getSheetByName(sheetName)"),
  "台帳rollbackは作成対象シートだけを指定する必要があります");
assert(rollbackBlock.includes("created.ledgerRecordId") && rollbackBlock.includes("created.ledgerPayloadHash"),
  "台帳rollbackはrecordIdとpayloadHashの一致を必須にする必要があります");
assert(rollbackBlock.includes("created.ledgerStateHash") && rollbackBlock.includes("1, 13).clearContent()"),
  "台帳rollbackはN列状態hashまで照合してB:Nを消去する必要があります");
assert(rollbackBlock.includes("artifactDriveItemTrackingInfo_") && rollbackBlock.includes("artifactPersistCleanupFailure_"),
  "個別成果物の外側rollback失敗もID・URLを追跡保存する必要があります");
assert.equal(rollbackBlock.includes("ss.getSheets()"), false,
  "台帳rollbackで全シートの同一行を走査してはいけません");
const createApiBlock = source.slice(
  source.indexOf("function apiCreateArtifacts"),
  source.indexOf("function artifactBuildPreflight_")
);
assert(createApiBlock.includes("artifactMarkPriorLedgerRows_"),
  "訂正版台帳の成功前に旧版行へ訂正表示を付ける必要があります");
assert(createApiBlock.includes("artifactFinalizeNewOutputFile_") &&
  createApiBlock.includes("metadata.outputDriveVersion") && createApiBlock.includes("metadata.outputModifiedTime"),
  "個別成果物は本文hashとDrive版を確定してから監査ログへ記録する必要があります");
assert(createApiBlock.includes("error.artifactProvisional") && createApiBlock.includes("cleanupFailure: cleanupFailure"),
  "cleanup失敗した部分成果物はID・URL・名前をerror registryへ残す必要があります");
assert(createApiBlock.includes('itemType: kind === "ledger" ? "ledgerRow" : "file"') &&
  createApiBlock.includes("ledgerSheetName: artifactText_(created.ledgerSheetName)"),
  "外側rollback失敗ではcreated情報から個別fileまたは台帳sheet/rowを必ず追跡する必要があります");
assert.equal(/setTrashed\(true\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}/.test(source), false,
  "新規Drive項目のcleanup失敗を黙殺してはいけません");
assert.equal(/catch\s*\(oldRowMarkError\)\s*\{\s*\}/.test(createApiBlock), false,
  "旧版台帳行の訂正表示失敗を握り潰してはいけません");
const settingsLoadBlock = source.slice(
  source.indexOf("function artifactLoadSettings_"),
  source.indexOf("function artifactPublicSettings_")
);
const publicSettingsBlock = source.slice(
  source.indexOf("function artifactPublicSettings_"),
  source.indexOf("function artifactAssertNumberingSettings_")
);
assert(settingsLoadBlock.includes('numberingCutoverMonth: ""'),
  "採番切替年月の保存済み設定読込がありません");
assert(publicSettingsBlock.includes("numberingCutoverMonth"),
  "public settingsへ採番切替年月を返す必要があります");
["ledgerTemplateId", "certificateTemplateId", "allowedOutputEmails", "dipsAdditionalClosedDates", "dipsCalendarConfirmedDate", "dipsCalendarConfirmedBy"].forEach((field) => {
  assert(settingsLoadBlock.includes(field), "設定読込にありません: " + field);
  assert(publicSettingsBlock.includes(field), "public settingsにありません: " + field);
});
const nextCertificateBlock = source.slice(
  source.indexOf("function artifactNextCertificateNo_"),
  source.indexOf("function artifactNextDipsApplicantId_")
);
assert(nextCertificateBlock.includes("artifactAssertReusableDriveItem_"),
  "修了証明書採番時も保存済み年次台帳をfail-closedで検査する必要があります");
assert(nextCertificateBlock.includes("artifactAssertAnnualLedgerStructure_"),
  "修了証明書採番時も年次台帳の生成物識別子と構造を検査する必要があります");
assert.equal(nextCertificateBlock.includes("|| ss.getSheets()[0]"), false,
  "修了証明書採番時に先頭シートへfallbackしてはいけません");
assert.equal(/catch\s*\([^)]*\)\s*\{\s*\}/.test(nextCertificateBlock), false,
  "修了証明書採番時に年次台帳読込失敗を黙殺してはいけません");
[
  "1lAO89hPt2FRu-EoqfkS_xCFKVkfrglz5o-ms-qD92yE",
  "1QNHWJMo94V1kfz3EGhdO8Y-5kEvVnbChePe1T52-ALY",
  "1jmjiJCrmqi_yWNp_hPLfAFmjVctaVqUZDguhRZ-HRks",
  "1b2gjUL0I2vfK-XOvbDhg8oXg36EdADajamivX7wfgC4"
].forEach((id) => assert(source.includes(id), id + "がありません"));
assert(source.includes('ledger: "1lAO89hPt2FRu-EoqfkS_xCFKVkfrglz5o-ms-qD92yE"'),
  "既知の汚染台帳IDを明示拒否一覧に残す必要があります");
assert(source.includes('certificate: "1QNHWJMo94V1kfz3EGhdO8Y-5kEvVnbChePe1T52-ALY"'),
  "既知の汚染証明書IDを明示拒否一覧に残す必要があります");
assert.equal(/DocumentApp\.openById\(RENEWAL_ARTIFACT\.TEMPLATE_IDS/.test(source), false,
  "Googleドキュメント原本を直接編集してはいけません");
assert.equal(/SpreadsheetApp\.openById\(RENEWAL_ARTIFACT\.TEMPLATE_IDS/.test(source), false,
  "スプレッドシート原本を直接編集してはいけません");

const dipsBlock = source.slice(source.indexOf("function artifactCreateDipsCsv_"), source.indexOf("function artifactCreateGuidance_"));
[
  "申請者ID", "技能証明申請者番号", "登録更新講習機関コード", "登録更新講習機関事務所コード",
  "区分", "停止処分者向け講習受講有無", "無人航空機操縦者身体適性検査証明書番号",
  "更新講習修了証明書番号", "更新講習修了日", "有効期間満了日", "状態フラグ"
].reduce((last, header) => {
  const index = dipsBlock.indexOf('"' + header + '"', last + 1);
  assert(index > last, "DIPS列順が正しくありません: " + header);
  return index;
}, -1);
assert(dipsBlock.includes('"\\uFEFF"'), "DIPS CSVにUTF-8 BOMがありません");
assert(dipsBlock.includes('"\\r\\n"'), "DIPS CSVがCRLFではありません");
assert(dipsBlock.includes('"PA000000000000"'), "DIPS列7は公式指定の固定値にする必要があります");
assert.equal(dipsBlock.includes("record.fitnessCertificateNo"), false,
  "DIPS列7へ旧身体適性検査証明書入力値を出力してはいけません");
assert(dipsBlock.includes('? "3"'), "DIPS削除は状態フラグ3で出力する必要があります");
assert(dipsBlock.includes("artifactPrepareNewOutputFile_"), "DIPS成果物へrecord/hash/version identityが必要です");
assert(validateKindBlock.includes('["新規登録", "既存情報更新", "削除"]'),
  "DIPS状態モードに削除がありません");
assert(validateKindBlock.includes('dipsRecordMode === "削除"'),
  "DIPS削除時の警告がありません");
const trainingCreateBlock = source.slice(
  source.indexOf("function artifactCreateTraining_"),
  source.indexOf("function artifactWriteTrainingModule_")
);
assert(trainingCreateBlock.includes("if (!firstClass && requiresPractical) artifactReplaceSecondClassPracticalMinimum_(sheet)"),
  "二等の生成コピーだけ操縦演習最低時間ラベルを補正する必要があります");
assert.equal(/openById\(RENEWAL_ARTIFACT\.TEMPLATE_IDS\.training\)/.test(trainingCreateBlock), false,
  "講習記録簿原本を直接編集してはいけません");
assert(trainingCreateBlock.includes("実地講習：対象外（停止処分者向け講習なし）"),
  "通常講習の実地欄は未記入漏れではなく対象外と明示します");
assert(trainingCreateBlock.includes("artifactPrepareNewOutputFile_"), "講習記録簿へrecord/hash/version identityが必要です");
assert.equal(trainingCreateBlock.includes('copy.getUrl() + "#gid="'), false,
  "既存再利用のURL照合用に講習記録簿はbase getUrlを記録します");
const certificateCreateBlock = source.slice(
  source.indexOf("function artifactCreateCertificate_"), source.indexOf("function artifactCreateDipsCsv_")
);
assert(certificateCreateBlock.includes("artifactAssertCertificateTemplateClean_(templateId)"));
assert(certificateCreateBlock.includes("artifactCertificateTableSelection_"));
assert(certificateCreateBlock.includes("artifactPrepareNewOutputFile_"), "修了証明書へrecord/hash/version identityが必要です");
assert.equal(certificateCreateBlock.includes('copy.getUrl() + "?tab="'), false,
  "既存再利用のURL照合用に修了証明書はbase getUrlを記録します");
assert.equal(certificateCreateBlock.includes("artifactDeleteOtherDocumentTabs_"), false,
  "個人情報タブを全体コピーして後から削除する方式は禁止です");
const billingBuildBlock = source.slice(
  source.indexOf("function artifactBuildBillingSheet_"), source.indexOf("function artifactBillingMerge_")
);
assert(billingBuildBlock.includes("取引年月日（役務提供日）"), "請求書に取引年月日がありません");
assert(createBlock.includes("artifactAssertExistingLedgerRow_"),
  "同一hash台帳を再利用する前にJ:N監査列を照合する必要があります");
assert(createBlock.includes("artifactAssertExistingOutputFile_"),
  "同一hashの個別成果物はDrive identity・実URL・実ファイル名・保存先を照合する必要があります");
assert(createBlock.includes("artifactRecordNumberState_") && createBlock.includes("artifactAssertRecordNumberContinuity_"),
  "同一recordId内の証明書・DIPS・見積・請求番号継続性をfail-closed検査する必要があります");
const outputIntegrityBlock = source.slice(
  source.indexOf("function artifactFinalizeNewOutputFile_"),
  source.indexOf("function artifactAssertGeneratedFileIdentity_")
);
assert(outputIntegrityBlock.includes("Drive.Files.get") && outputIntegrityBlock.includes("modifiedTime") && outputIntegrityBlock.includes("version"),
  "個別成果物再利用はDrive version/modifiedTimeを照合する必要があります");
const appendRegistryBlock = source.slice(
  source.indexOf("function artifactAppendRegistry_"),
  source.indexOf("function artifactFindExisting_")
);
assert(appendRegistryBlock.includes("SpreadsheetApp.flush()") && appendRegistryBlock.includes("getDisplayValues()") && appendRegistryBlock.includes("artifactRegistryRowsIssue_"),
  "監査ログ追記はcommit前にflush・読戻し・全行検証する必要があります");
assert(source.includes("ledgerSheetName: sheet.getName()"), "台帳行位置metadata用のシート名がありません");
assert(source.includes("ledgerVisibleHash: ledgerVisibleHash"), "台帳B:I可視値の作成時hashがありません");
assert(source.includes("ledgerStateHash: ledgerStateHash"), "台帳旧版markerを含む状態hashがありません");
assert(source.includes("artifactAssertGuidanceTemplateClean_"), "案内原本の清浄性検査がありません");
assert(source.includes("TRUSTED_TEMPLATE_MODIFIED_TIMES") && source.includes("artifactAssertTrustedSharedTemplate_"),
  "共有原本を承認版の最終更新時刻へ固定する検査がありません");
assert(source.includes("artifactAssertTrainingTemplateClean_"), "講習記録簿原本の清浄性検査がありません");

const manifest = JSON.parse(fs.readFileSync("appsscript.json", "utf8"));
assert.equal(manifest.timeZone, "Asia/Tokyo");
const scopes = new Set(manifest.oauthScopes || []);
[
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email"
].forEach((scope) => assert(scopes.has(scope), "OAuth scopeがありません: " + scope));
assert.equal(manifest.webapp.access, "MYSELF");

console.log("artifacts_logic_test: OK");
