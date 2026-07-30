const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("ComplianceArchive.js", "utf8");
const artifactsSource = fs.readFileSync("Artifacts.js", "utf8");
const html = fs.readFileSync("Index.html", "utf8");

function extractFunction(name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, name + " is missing");
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(name + " is not closed");
}

const context = {
  console,
  artifactText_: (value) => value == null ? "" : String(value).trim(),
  artifactRecordName_: (record) => String((record || {}).targetName || "").trim(),
  artifactNormalizeRecord_: (row) => Object.assign({}, row || {}),
  artifactValidIsoDateOrBlank_: (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "",
  artifactClassValue_: (value) =>
    String(value || "").includes("一等") ? "一等" :
      (String(value || "").includes("二等") ? "二等" : ""),
  artifactSafeName_: (value) => String(value || "").replace(/[\\/:*?"<>|]/g, "_")
};
vm.createContext(context);
[
  "complianceNonNegativeInteger_",
  "complianceStatusSummary_",
  "complianceJapanesePeriod_",
  "complianceDateParts_",
  "complianceOutputFileName_",
  "complianceOutputMimeType_",
  "complianceIsSyntheticSampleRecord_"
].forEach((name) => vm.runInContext(extractFunction(name), context));

assert.strictEqual(context.complianceNonNegativeInteger_("0", "人数"), 0);
assert.strictEqual(context.complianceNonNegativeInteger_(12, "人数"), 12);
assert.strictEqual(context.complianceNonNegativeInteger_(9999, "人数"), 9999);
assert.throws(() => context.complianceNonNegativeInteger_("", "人数"), /入力/);
assert.throws(() => context.complianceNonNegativeInteger_("1.5", "人数"), /整数/);
assert.throws(() => context.complianceNonNegativeInteger_("-1", "人数"), /整数/);

const summary = context.complianceStatusSummary_([
  { courseDate: "2026-05-01", courseProvider: "CDP", licenseClass: "一等", courseVenue: "札幌会場" },
  { courseDate: "2026-05-02", courseProvider: "CDP", licenseClass: "一等", courseVenue: "札幌会場" },
  { courseDate: "2026-05-03", courseProvider: "CDP", licenseClass: "二等", courseVenue: "旭川会場" },
  { courseDate: "2026-05-04", courseProvider: "他機関", licenseClass: "二等", courseVenue: "対象外" },
  { courseDate: "2026-07-01", courseProvider: "CDP", licenseClass: "二等", courseVenue: "期間外" }
], "2026-05-01", "2026-05-31");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(summary)),
  {
    first: { count: 2, venues: ["札幌会場"] },
    second: { count: 1, venues: ["旭川会場"] }
  }
);

assert.strictEqual(
  context.complianceJapanesePeriod_(
    { year: 2026, month: 5, day: 1 },
    { year: 2026, month: 7, day: 30 }
  ),
  "2026年　5月　1日　～　　2026年　7月　30日"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.complianceDateParts_("2026-07-27"))),
  { year: 2026, month: 7, day: 27 }
);

assert.match(
  context.complianceOutputFileName_(
    "implementationPlan",
    { planMonth: "2026-07" },
    "abcdef0123456789"
  ),
  /^別添04_登録更新講習機関実施計画書_2026-07_abcdef012345$/
);
assert.match(
  context.complianceOutputFileName_(
    "applicationEvidence",
    { record: { personId: "CDP/001" }, canonical: { version: 3 } },
    "abcdef0123456789"
  ),
  /^申込書・技能証明書・身分証_保管チェックリスト_CDP_001_v3_abcdef012345$/
);
assert.match(
  context.complianceOutputFileName_(
    "implementationPlan",
    { planMonth: "2026-07", sampleMode: true },
    "abcdef0123456789"
  ),
  /^サンプル_正式使用禁止_別添04_登録更新講習機関実施計画書_2026-07_abcdef012345$/
);
assert.match(
  context.complianceOutputFileName_(
    "ledger",
    {
      sampleMode: true,
      record: { personId: "SAMPLE-001" },
      canonical: { version: 1 }
  },
  "abcdef0123456789"
  ),
  /^サンプル_正式使用禁止_別添13_修了証明書発行台帳_SAMPLE-001_abcdef012345\.csv$/
);
context.RENEWAL_COMPLIANCE_ARCHIVE = {
  MIME_TYPES: { ledger: "application/vnd.google-apps.spreadsheet" }
};
assert.strictEqual(
  context.complianceOutputMimeType_("ledger", { sampleMode: true }),
  "text/csv"
);
assert.strictEqual(
  context.complianceOutputMimeType_("ledger", { sampleMode: false }),
  "application/vnd.google-apps.spreadsheet"
);
assert.strictEqual(context.complianceIsSyntheticSampleRecord_({
  targetName: "サンプル太郎",
  personId: "P-20260727-63261",
  licenseNo: "SAMPLE-LICENSE-TARO",
  certificateNo: "SAMPLE-CERT-TARO",
  companyName: "サンプル株式会社（試験用）",
  internalMemo: "試験用ダミーデータ。正式業務に使用しないでください。"
}), true);
assert.strictEqual(context.complianceIsSyntheticSampleRecord_({
  targetName: "サンプル太郎",
  personId: "P-001",
  licenseNo: "REAL-LICENSE"
}), false);
assert.strictEqual(context.complianceIsSyntheticSampleRecord_({
  targetName: "実在太郎",
  personId: "SAMPLE-001",
  licenseNo: "SAMPLE-LICENSE",
  certificateNo: "SAMPLE-CERT"
}), false);

[
  "apiGetComplianceArchiveState",
  "apiProvisionComplianceTemplates",
  "apiPreflightComplianceArchive",
  "apiCreateComplianceArchive"
].forEach((name) => assert(source.includes("function " + name + "("), name + " API is missing"));

[
  "事務規程、別添03 講習記録簿　保管",
  "事務規程、別添04 実施計画書　保管",
  "事務規程、別添05 実施状況報告書　保管",
  "事務規程、別添13 修了証明書発行台帳　保管",
  "申込書・技能証明書・身分証　保管",
  "無人航空機更新講習修了証明書　保管",
  "CSVファイル　保管",
  "講習料金収納記録　保管"
].forEach((label) => assert(html.includes(label), label + " button label is missing"));

[
  'data-existing-compliance-kind="training"',
  'data-compliance-kind="implementationPlan"',
  'data-compliance-kind="implementationStatus"',
  'data-existing-compliance-kind="ledger"',
  'data-compliance-kind="applicationEvidence"',
  'data-existing-compliance-kind="certificate"',
  'data-existing-compliance-kind="dipsCsv"',
  'data-compliance-kind="paymentRecord"'
].forEach((attribute) => assert(html.includes(attribute), attribute + " is missing"));

assert(html.includes('serverCall("apiPreflightComplianceArchive", request)'));
assert(html.includes('serverCall("apiCreateComplianceArchive", request)'));
assert(html.includes('serverCall("apiPreflightArtifacts", request)'));
assert(html.includes('serverCall("apiCreateArtifacts", request)'));
assert(html.includes('serverCall("apiProvisionComplianceTemplates")'));
assert(html.includes("サンプル出力モード"));
assert(html.includes("function isSyntheticSampleRecord(record)"));
assert(source.includes("error.complianceAuditOutcomeUncertain === true"));
assert(source.includes("preservationRequired: true"));
assert(source.includes("実物書類は自動生成しません"));
assert(source.includes("正式会計台帳"));
assert(source.includes('SAMPLE_FOLDER_NAME: "サンプル出力"'));
assert(source.includes('action: context.sampleMode ? "COMPLIANCE_SAMPLE_CREATE"'));
assert(source.includes("【サンプル・正式使用禁止】"));
assert(source.includes("function complianceSampleRequestContext_"));
assert(source.includes("function complianceCreateSamplePlan_"));
assert(source.includes("function complianceCreateSampleStatus_"));
assert(source.includes("function complianceCreateSampleTraining_"));
assert(source.includes("function complianceCreateSampleLedger_"));
assert(source.includes("function complianceCreateSampleCertificate_"));
assert(source.includes("function complianceCreateSampleDipsCsv_"));
assert(source.includes("function complianceCreateSamplePaymentRecord_"));
assert(source.includes("function complianceResolveSampleOutputFileName_"));
const sampleLedgerSource = extractFunction("complianceCreateSampleLedger_");
assert(sampleLedgerSource.includes("artifactCreateDriveItemInFolder_"));
assert(sampleLedgerSource.includes("artifactUpdateBlobFileContent_"));
assert(!sampleLedgerSource.includes("SpreadsheetApp"));
assert(sampleLedgerSource.includes('"更新講習修了証明書番号"'));
assert(sampleLedgerSource.includes('"CREATE", "", fileName'));
assert(!extractFunction("complianceDriveOperation_").includes(
  'context.sampleMode && kind === "ledger"'
));
assert(source.includes("context.sampleMode ? null : complianceRequireTemplatesReady_()"));
assert(source.includes("value.sampleGeneratorVersion = 2"));
assert(html.includes("sampleMode: base.sampleMode"));
assert(html.includes("if (base.sampleMode)"));
assert(source.includes("var sheet = base.copyTo(spreadsheet).setName("));
assert(source.includes('sheet.getRange("D1")'));
assert(!source.includes('sheet.getRange("A1:AF1").merge()'));

const sampleResolverContext = {
  artifactText_: (value) => value == null ? "" : String(value).trim(),
  artifactIteratorItems_: (items) => items,
  Drive: {
    Files: {
      get(fileId) {
        return {
          id: fileId,
          name: fileId,
          mimeType: "text/csv",
          trashed: false
        };
      }
    }
  }
};
vm.createContext(sampleResolverContext);
[
  "complianceIdentityDescription_",
  "complianceSampleAlternateFileName_",
  "complianceResolveSampleOutputFileName_"
].forEach((name) => vm.runInContext(extractFunction(name), sampleResolverContext));
const resolverIdentity = { hash: "abc", value: { sampleMode: true } };
const expectedResolverDescription =
  sampleResolverContext.complianceIdentityDescription_(resolverIdentity);
const legacySampleFile = {
  getId: () => "legacy-sample-id",
  getDescription: () => "legacy-description"
};
const matchingSampleFile = {
  getId: () => "matching-sample-id",
  getDescription: () => expectedResolverDescription
};
const resolverWarnings = [];
assert.strictEqual(
  sampleResolverContext.complianceResolveSampleOutputFileName_(
    {
      getFilesByName(name) {
        if (name === "sample.csv") return [legacySampleFile];
        return [];
      }
    },
    "sample.csv",
    "text/csv",
    resolverIdentity,
    { warnings: resolverWarnings }
  ),
  "sample_再作成2.csv"
);
assert.strictEqual(resolverWarnings.length, 1);
assert(resolverWarnings[0].includes("上書きせず保存"));
assert.strictEqual(
  sampleResolverContext.complianceResolveSampleOutputFileName_(
    {
      getFilesByName(name) {
        if (name === "sample.csv") return [legacySampleFile];
        if (name === "sample_再作成2.csv") return [matchingSampleFile];
        return [];
      }
    },
    "sample.csv",
    "text/csv",
    resolverIdentity,
    { warnings: [] }
  ),
  "sample_再作成2.csv"
);

assert(artifactsSource.includes("implementationPlanSource"));
assert(artifactsSource.includes("implementationStatusSource"));
assert(artifactsSource.includes('"implementationPlan", "implementationStatus"'));

console.log("compliance archive logic tests passed");
