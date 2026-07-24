const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("Finance.js", "utf8");
const remotelyCallableFinanceFunctions = Array.from(
  source.matchAll(/^function\s+(finance[A-Za-z0-9_$]+)\s*\(/gm),
  (match) => match[1]
).filter((name) => !name.endsWith("_"));
assert.deepEqual(
  remotelyCallableFinanceFunctions,
  [],
  "Finance.jsの純粋計算関数をApps Script公開エンドポイントにしてはいけません"
);
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

const actor = { actorId: "accounting@example.jp", at: "2026-07-24T10:00:00+09:00" };
const actor2 = { actorId: "manager@example.jp", at: "2026-07-24T11:00:00+09:00" };

function expectCode(code, callback) {
  assert.throws(callback, (error) => error && error.code === code,
    "expected error code " + code);
}

function line(id, unitAmount, taxCategory = "TAXABLE_10", extra = {}) {
  const result = {
    id,
    description: "更新講習料",
    quantity: 1,
    unitAmount,
    taxCategory,
    ...extra
  };
  if (taxCategory !== "TAXABLE_10" && !result.taxEvidence) {
    result.taxEvidence = {
      reference: "税区分判定資料-" + id,
      reason: "会計責任者が取引内容を確認",
      approvedBy: "manager@example.jp",
      approvedDate: "2026-07-24"
    };
  }
  return result;
}

function billingSnapshot(overrides = {}) {
  return {
    recipientName: "株式会社受講者",
    recipientHonorific: "御中",
    recipientAddress: "〒060-0001 北海道札幌市中央区北一条西1丁目",
    issuerCompany: "株式会社CDP北海道",
    issuerAddress: "〒002-8053 北海道札幌市北区篠路町篠路389-72",
    issuerPhone: "011-790-7925",
    issuerFax: "011-790-7935",
    issuerEmail: "billing@example.jp",
    invoiceRegistrationNo: "T9430001086920",
    bankAccountText: "テスト銀行 本店 普通 1234567 株式会社CDP北海道",
    ...overrides
  };
}

function draft(id, customerId, amount, no = "") {
  return {
    id,
    invoiceNo: no,
    customerId,
    pricingMode: "EXCLUSIVE",
    subject: "免許更新講習",
    billingSnapshot: billingSnapshot(),
    lines: [line(id + "-L1", amount)]
  };
}

function issue(no, journalEntryId, date = "2026-07-24") {
  return {
    invoiceNo: no,
    invoiceDate: date,
    accountingDate: date,
    dueDate: "2026-08-31",
    journalEntryId
  };
}

// 税率区分ごとに一度だけ丸める。5円+5円の10%は行別0+0ではなく、区分合計10円の1円。
let calculation = context.financeCalculateInvoice_({
  pricingMode: "EXCLUSIVE",
  lines: [line("L1", 5), line("L2", 5)]
}, { taxRounding: "FLOOR" });
assert.equal(calculation.totalExTax, 10);
assert.equal(calculation.totalTax, 1);
assert.equal(calculation.totalInclTax, 11);

// 税込からの逆算も区分合計に一度だけ丸める。
calculation = context.financeCalculateInvoice_({
  pricingMode: "INCLUSIVE",
  lines: [line("L1", 1101)]
}, { taxRounding: "FLOOR" });
assert.equal(calculation.totalExTax, 1001);
assert.equal(calculation.totalTax, 100);
assert.equal(calculation.totalInclTax, 1101);

calculation = context.financeCalculateInvoice_({
  pricingMode: "EXCLUSIVE",
  lines: [
    line("L10", 1000, "TAXABLE_10"),
    line("L8", 1000, "TAXABLE_8"),
    line("LEX", 1000, "EXEMPT"),
    line("LNT", 1000, "NON_TAXABLE"),
    line("LOUT", 1000, "OUT_OF_SCOPE")
  ]
}, { taxRounding: "FLOOR" });
assert.equal(calculation.totalExTax, 5000);
assert.equal(calculation.totalTax, 180);
assert.equal(calculation.totalInclTax, 5180);
assert.deepEqual(Array.from(calculation.taxGroups, (group) => group.tax),
  [100, 80, 0, 0, 0]);

expectCode("TAX_EVIDENCE_REQUIRED", () => context.financeCalculateInvoice_({
  pricingMode: "EXCLUSIVE",
  lines: [{
    id: "L8-NO-EVIDENCE",
    description: "軽減税率対象",
    quantity: 1,
    unitAmount: 1000,
    taxCategory: "TAXABLE_8"
  }]
}, { taxRounding: "FLOOR" }));

expectCode("ROUNDING_POLICY_MISMATCH", () => context.financeCalculateInvoice_({
  pricingMode: "EXCLUSIVE",
  taxRounding: "CEIL",
  lines: [line("L1", 100)]
}, { taxRounding: "FLOOR" }));

let state = context.financeCreateState_({ taxRounding: "FLOOR" });
assert.equal(context.financeValidateState_(state), true);

// 発行済請求は上書きせず、番号は一意。
state = context.financeCreateDraftInvoice_(state, draft("INV1", "C1", 1000), actor);
const stateBeforeIssue = JSON.parse(JSON.stringify(state));
state = context.financeIssueInvoice_(state, "INV1", issue("2026-001", "JE-INV1"), actor);
assert.equal(state.invoices[0].totalInclTax, 1100);
assert.equal(state.invoices[0].billingSnapshot.recipientName, "株式会社受講者");
assert.equal(state.journal_entries[0].lines.reduce((n, row) => n + (row.side === "D" ? row.amount : -row.amount), 0), 0);
assert.equal(stateBeforeIssue.invoices[0].status, "DRAFT", "入力stateを変更してはいけない");
expectCode("ISSUED_INVOICE_IMMUTABLE", () => context.financeUpdateDraftInvoice_(
  state, "INV1", draft("INV1", "C1", 2000), actor2
));

const noSnapshotDraftInput = draft("INV-NO-SNAPSHOT", "C1", 1000);
delete noSnapshotDraftInput.billingSnapshot;
let noSnapshotState = context.financeCreateDraftInvoice_(
  context.financeCreateState_({ taxRounding: "FLOOR" }),
  noSnapshotDraftInput,
  actor
);
expectCode("BILLING_SNAPSHOT_REQUIRED", () => context.financeIssueInvoice_(
  noSnapshotState,
  "INV-NO-SNAPSHOT",
  issue("2026-NO-SNAPSHOT", "JE-NO-SNAPSHOT"),
  actor
));

let issueSnapshotState = context.financeCreateDraftInvoice_(
  context.financeCreateState_({ taxRounding: "FLOOR" }),
  {
    ...draft("INV-ISSUE-SNAPSHOT", "C1", 1000),
    billingSnapshot: billingSnapshot({ recipientName: "下書き時点の宛先" })
  },
  actor
);
issueSnapshotState = context.financeIssueInvoice_(
  issueSnapshotState,
  "INV-ISSUE-SNAPSHOT",
  {
    ...issue("2026-ISSUE-SNAPSHOT", "JE-ISSUE-SNAPSHOT"),
    billingSnapshot: billingSnapshot({ recipientName: "発行時点の宛先" })
  },
  actor
);
assert.equal(issueSnapshotState.invoices[0].billingSnapshot.recipientName, "発行時点の宛先");
let correctionSnapshotState = context.financeCreateDraftInvoice_(
  context.financeCreateState_({ taxRounding: "FLOOR" }),
  {
    ...draft("INV-CORRECTION-OLD", "C-CORRECTION", 1000),
    billingSnapshot: billingSnapshot({ recipientName: "訂正前の宛先" })
  },
  actor
);
correctionSnapshotState = context.financeIssueInvoice_(
  correctionSnapshotState,
  "INV-CORRECTION-OLD",
  issue("2026-CORRECTION-OLD", "JE-CORRECTION-OLD"),
  actor
);
const correctionStateBeforeRejectedPartial = JSON.parse(
  JSON.stringify(correctionSnapshotState)
);
expectCode("REVERSAL_FIELD_NOT_EDITABLE", () =>
  context.financeCorrectInvoice_(correctionSnapshotState, {
    reversal: {
      id: "CN-CORRECTION-PARTIAL-ATTACK",
      creditNoteNo: "CN-2026-CORRECTION-PARTIAL-ATTACK",
      invoiceId: "INV-CORRECTION-OLD",
      accountingDate: "2026-07-24",
      reason: "部分取消を混入",
      journalEntryId: "JE-CN-CORRECTION-PARTIAL-ATTACK",
      lines: [line("CORRECTION-PARTIAL-ATTACK-L1", 100)]
    },
    replacementInvoice: draft(
      "INV-CORRECTION-PARTIAL-ATTACK-NEW", "C-CORRECTION", 1000
    ),
    replacementIssue: issue(
      "2026-CORRECTION-PARTIAL-ATTACK-NEW",
      "JE-CORRECTION-PARTIAL-ATTACK-NEW"
    )
  }, actor2)
);
assert.equal(
  JSON.stringify(correctionSnapshotState),
  JSON.stringify(correctionStateBeforeRejectedPartial),
  "部分取消を指定した訂正失敗時に元stateを変更してはいけない"
);
correctionSnapshotState = context.financeCorrectInvoice_(correctionSnapshotState, {
  reversal: {
    id: "CN-CORRECTION-OLD",
    creditNoteNo: "CN-2026-CORRECTION-OLD",
    invoiceId: "INV-CORRECTION-OLD",
    accountingDate: "2026-07-24",
    reason: "請求先訂正",
    journalEntryId: "JE-CN-CORRECTION-OLD"
  },
  replacementInvoice: {
    ...draft("INV-CORRECTION-NEW", "C-CORRECTION", 1000),
    billingSnapshot: billingSnapshot({ recipientName: "訂正後の宛先" })
  },
  replacementIssue: issue("2026-CORRECTION-NEW", "JE-CORRECTION-NEW")
}, actor2);
assert.equal(
  correctionSnapshotState.invoices.find((row) => row.id === "INV-CORRECTION-OLD")
    .billingSnapshot.recipientName,
  "訂正前の宛先"
);
assert.equal(
  correctionSnapshotState.invoices.find((row) => row.id === "INV-CORRECTION-NEW")
    .billingSnapshot.recipientName,
  "訂正後の宛先"
);
assert.equal(
  correctionSnapshotState.credit_notes.find(
    (row) => row.id === "CN-CORRECTION-OLD"
  ).totalInclTax,
  1100,
  "訂正はブラウザ指定額ではなく元請求の有効残額全額を取り消す"
);
assert.equal(
  context.financeInvoicePosition_(
    correctionSnapshotState, "INV-CORRECTION-OLD"
  ).effectiveBilled,
  0,
  "訂正版の発行前後で元請求の有効残高は0でなければならない"
);
assert.equal(
  correctionSnapshotState.invoices.find(
    (row) => row.id === "INV-CORRECTION-NEW"
  ).correctionOfInvoiceId,
  "INV-CORRECTION-OLD",
  "訂正版と元請求の関連はサーバードメインで固定する"
);

// 既存の正当な一部減額がある場合、訂正時の実取消額は元請求総額ではなく
// 残る有効請求額であり、その全額を取り消して0にする。
let partiallyReducedCorrectionState = context.financeCreateDraftInvoice_(
  context.financeCreateState_({ taxRounding: "FLOOR" }),
  draft("INV-PARTIAL-OLD", "C-PARTIAL", 1000),
  actor
);
partiallyReducedCorrectionState = context.financeIssueInvoice_(
  partiallyReducedCorrectionState,
  "INV-PARTIAL-OLD",
  issue("2026-PARTIAL-OLD", "JE-PARTIAL-OLD"),
  actor
);
partiallyReducedCorrectionState = context.financeCreateCreditNote_(
  partiallyReducedCorrectionState,
  {
    id: "CN-PARTIAL-PRIOR",
    creditNoteNo: "CN-2026-PARTIAL-PRIOR",
    invoiceId: "INV-PARTIAL-OLD",
    accountingDate: "2026-07-24",
    reason: "事前の正当な一部減額",
    journalEntryId: "JE-CN-PARTIAL-PRIOR",
    lines: [line("CN-PARTIAL-PRIOR-L1", 500)]
  },
  actor
);
const partiallyReducedOriginal = JSON.parse(JSON.stringify(
  partiallyReducedCorrectionState.invoices.find(
    (row) => row.id === "INV-PARTIAL-OLD"
  )
));
partiallyReducedCorrectionState = context.financeCorrectInvoice_(
  partiallyReducedCorrectionState,
  {
    reversal: {
      id: "CN-PARTIAL-FINAL",
      creditNoteNo: "CN-2026-PARTIAL-FINAL",
      invoiceId: "INV-PARTIAL-OLD",
      accountingDate: "2026-07-25",
      reason: "残る有効請求額を全額取消",
      journalEntryId: "JE-CN-PARTIAL-FINAL"
    },
    replacementInvoice: draft("INV-PARTIAL-NEW", "C-PARTIAL", 750),
    replacementIssue: issue("2026-PARTIAL-NEW", "JE-PARTIAL-NEW", "2026-07-25")
  },
  actor2
);
assert.equal(
  partiallyReducedCorrectionState.credit_notes.find(
    (row) => row.id === "CN-PARTIAL-FINAL"
  ).totalInclTax,
  550,
  "事前減額後の実取消額は残る有効請求額と一致する"
);
assert.equal(
  context.financeInvoicePosition_(
    partiallyReducedCorrectionState, "INV-PARTIAL-OLD"
  ).effectiveBilled,
  0
);
assert.equal(
  JSON.stringify(partiallyReducedCorrectionState.invoices.find(
    (row) => row.id === "INV-PARTIAL-OLD"
  )),
  JSON.stringify(partiallyReducedOriginal),
  "訂正元請求は既存の一部減額があっても不変"
);
assert.equal(
  partiallyReducedCorrectionState.invoices.find(
    (row) => row.id === "INV-PARTIAL-NEW"
  ).totalInclTax,
  825,
  "新請求額は実取消額とは独立して計算する"
);
expectCode("BILLING_SNAPSHOT_FORMULA_RISK", () => context.financeCreateDraftInvoice_(
  context.financeCreateState_({ taxRounding: "FLOOR" }),
  {
    ...draft("INV-FORMULA", "C1", 1000),
    billingSnapshot: billingSnapshot({ bankAccountText: "=HYPERLINK(\"https://example.invalid\")" })
  },
  actor
));

state = context.financeCreateDraftInvoice_(state, draft("INV2", "C1", 500), actor);
expectCode("DUPLICATE_INVOICE_NO", () => context.financeIssueInvoice_(
  state, "INV2", issue("2026-001", "JE-INV2"), actor
));
state = context.financeIssueInvoice_(state, "INV2", issue("2026-002", "JE-INV2"), actor);

let tamperedDraft = context.financeCreateDraftInvoice_(
  context.financeCreateState_({ taxRounding: "FLOOR" }),
  draft("INV-TAMPERED", "C1", 1000),
  actor
);
tamperedDraft.invoice_lines[0].unitAmount = 2000;
tamperedDraft.invoice_lines[0].amount = 2000;
expectCode("DRAFT_TOTAL_MISMATCH", () => context.financeIssueInvoice_(
  tamperedDraft, "INV-TAMPERED", issue("2026-TAMPERED", "JE-TAMPERED"), actor
));

// 1入金を複数請求へ一括消込。
state = context.financeRecordReceipt_(state, {
  id: "PAY-BULK",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 1650,
  method: "銀行振込",
  journalEntryId: "JE-PAY-BULK"
}, actor);
state = context.financeAllocateReceipt_(state, {
  paymentId: "PAY-BULK",
  accountingDate: "2026-07-24",
  journalEntryId: "JE-ALLOC-BULK",
  allocations: [
    { id: "ALLOC-1", invoiceId: "INV1", amount: 900 },
    { id: "ALLOC-2", invoiceId: "INV2", amount: 550 }
  ]
}, actor);
assert.equal(context.financeInvoicePosition_(state, "INV1").outstanding, 200);
assert.equal(context.financeInvoicePosition_(state, "INV2").outstanding, 0);
assert.equal(context.financeCustomerPosition_(state, "C1").unallocatedReceiptsBeforeRefund, 200);

// 複数入金を1請求へ分割消込。
state = context.financeRecordReceipt_(state, {
  id: "PAY-SPLIT",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 100,
  method: "現金",
  journalEntryId: "JE-PAY-SPLIT"
}, actor);
state = context.financeAllocateReceipt_(state, {
  paymentId: "PAY-SPLIT",
  accountingDate: "2026-07-24",
  journalEntryId: "JE-ALLOC-SPLIT",
  allocations: [{ id: "ALLOC-3", invoiceId: "INV1", amount: 100 }]
}, actor);
assert.equal(context.financeInvoicePosition_(state, "INV1").outstanding, 100);
expectCode("PAYMENT_ALLOCATION_EXCEEDS_OUTSTANDING", () => context.financeAllocateReceipt_(state, {
  paymentId: "PAY-BULK",
  accountingDate: "2026-07-24",
  journalEntryId: "JE-OVERALLOC",
  allocations: [{ id: "ALLOC-X", invoiceId: "INV1", amount: 101 }]
}, actor));

// 過入金は未消込で保持し、返金元と仕訳を自動的に対応させる。
assert.equal(context.financeCustomerPosition_(state, "C1").refundableCredit, 200);
state = context.financeRecordRefund_(state, {
  id: "REFUND-1",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 150,
  method: "銀行振込",
  referenceNo: "RF-2026-0001",
  reason: "過入金返金",
  journalEntryId: "JE-REFUND-1"
}, actor2);
assert.equal(context.financeCustomerPosition_(state, "C1").refundableCredit, 50);
assert.equal(context.financeCustomerPosition_(state, "C1").unallocatedReceiptsBeforeRefund, 200);
assert.equal(context.financeCustomerPosition_(state, "C1").unallocatedReceipts, 50);
expectCode("PAYMENT_ALLOCATION_EXCEEDS_RECEIPT", () => context.financeAllocateReceipt_(state, {
  paymentId: "PAY-BULK",
  accountingDate: "2026-07-24",
  journalEntryId: "JE-ALLOC-REFUNDED-CASH",
  allocations: [{ id: "ALLOC-REFUNDED-CASH", invoiceId: "INV1", amount: 51 }]
}, actor2));
assert.doesNotThrow(() => context.financeAllocateReceipt_(state, {
  paymentId: "PAY-BULK",
  accountingDate: "2026-07-24",
  journalEntryId: "JE-ALLOC-REMAINING-CASH",
  allocations: [{ id: "ALLOC-REMAINING-CASH", invoiceId: "INV1", amount: 50 }]
}, actor2));
expectCode("DUPLICATE_REFUND_REFERENCE_NO", () => context.financeRecordRefund_(state, {
  id: "REFUND-DUPLICATE-REFERENCE",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 1,
  method: "銀行振込",
  referenceNo: "RF-2026-0001",
  reason: "同一管理番号の誤登録",
  journalEntryId: "JE-REFUND-DUPLICATE-REFERENCE"
}, actor2));
expectCode("PAYMENT_REVERSAL_UNSUPPORTED", () => context.financeRecordRefund_(state, {
  id: "REFUND-UNSUPPORTED-REVERSAL",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 1,
  method: "銀行振込",
  referenceNo: "RF-2026-REVERSAL",
  reversalOfPaymentId: "REFUND-1",
  reason: "直接反転を試行",
  journalEntryId: "JE-REFUND-UNSUPPORTED-REVERSAL"
}, actor2));
expectCode("REFUND_EXCEEDS_CUSTOMER_CREDIT", () => context.financeRecordRefund_(state, {
  id: "REFUND-X",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 51,
  method: "銀行振込",
  referenceNo: "RF-2026-OVER",
  reason: "超過",
  journalEntryId: "JE-REFUND-X"
}, actor2));

const overconsumedRefundSource = JSON.parse(JSON.stringify(state));
const overconsumedRefund = overconsumedRefundSource.payments.find((row) => row.id === "REFUND-1");
overconsumedRefund.amount = 201;
overconsumedRefund.refundSources[0].amount = 201;
delete overconsumedRefund.immutableKey;
context.financeSealRecord_(overconsumedRefund);
expectCode("REFUND_SOURCE_OVERCONSUMED", () => context.financeValidateState_(overconsumedRefundSource));

// 相殺・貸倒は売上額を変えずに債権残高だけを減らす。
state = context.financeRecordSettlement_(state, {
  id: "OFFSET-1",
  invoiceId: "INV1",
  kind: "OFFSET",
  amount: 40,
  accountingDate: "2026-07-24",
  referenceNo: "OFF-001",
  counterReference: "買掛金AP-001",
  reason: "合意済相殺",
  journalEntryId: "JE-OFFSET-1"
}, actor2);
assert.equal(context.financeInvoicePosition_(state, "INV1").effectiveBilled, 1100);
assert.equal(context.financeInvoicePosition_(state, "INV1").outstanding, 60);
expectCode("DUPLICATE_CREDIT_NOTE_NO", () => context.financeRecordSettlement_(state, {
  id: "OFFSET-DUPLICATE-REFERENCE",
  invoiceId: "INV1",
  kind: "OFFSET",
  amount: 1,
  accountingDate: "2026-07-24",
  referenceNo: "OFF-001",
  reason: "同一管理番号の誤登録",
  journalEntryId: "JE-OFFSET-DUPLICATE-REFERENCE"
}, actor2));
state = context.financeRecordSettlement_(state, {
  id: "BAD-1",
  invoiceId: "INV1",
  kind: "BAD_DEBT",
  amount: 60,
  accountingDate: "2026-07-24",
  referenceNo: "BAD-001",
  reason: "承認済貸倒",
  journalEntryId: "JE-BAD-1"
}, actor2);
assert.equal(context.financeInvoicePosition_(state, "INV1").outstanding, 0);

// 入金訂正は金額・対象者を元取引から継承し、元行・元仕訳を変更しない。
let receiptReversalState = context.financeCreateState_({ taxRounding: "FLOOR" });
receiptReversalState = context.financeRecordReceipt_(receiptReversalState, {
  id: "PAY-REV-TARGET",
  customerId: "C-REV-RECEIPT",
  paymentDate: "2026-07-24",
  amount: 1000,
  method: "銀行振込",
  reference: "BANK-LINE-001",
  journalEntryId: "JE-PAY-REV-TARGET"
}, actor);
const originalReceiptBeforeReversal = JSON.stringify(
  receiptReversalState.payments.find((row) => row.id === "PAY-REV-TARGET")
);
const originalReceiptJournalBeforeReversal = JSON.stringify(
  receiptReversalState.journal_entries.find((row) => row.id === "JE-PAY-REV-TARGET")
);
expectCode("REVERSAL_FIELD_NOT_EDITABLE", () => context.financeReverseReceipt_(
  receiptReversalState,
  {
    id: "PAY-REV-OVERRIDE",
    originalPaymentId: "PAY-REV-TARGET",
    accountingDate: "2026-07-24",
    amount: 1,
    reason: "金額上書きを試行",
    journalEntryId: "JE-PAY-REV-OVERRIDE"
  },
  actor2
));
receiptReversalState = context.financeApplyCommand_(receiptReversalState, {
  type: "REVERSE_RECEIPT",
  data: {
    id: "PAY-REV-TARGET-R",
    originalPaymentId: "PAY-REV-TARGET",
    accountingDate: "2026-07-24",
    reason: "二重入金の訂正",
    journalEntryId: "JE-PAY-REV-TARGET-R"
  }
}, actor2);
assert.equal(
  JSON.stringify(receiptReversalState.payments.find((row) => row.id === "PAY-REV-TARGET")),
  originalReceiptBeforeReversal
);
assert.equal(
  JSON.stringify(receiptReversalState.journal_entries.find((row) => row.id === "JE-PAY-REV-TARGET")),
  originalReceiptJournalBeforeReversal
);
const receiptReversal = receiptReversalState.payments.find(
  (row) => row.id === "PAY-REV-TARGET-R"
);
assert.equal(receiptReversal.kind, "REVERSE_RECEIPT");
assert.equal(receiptReversal.reversalOfPaymentId, "PAY-REV-TARGET");
assert.equal(receiptReversal.customerId, "C-REV-RECEIPT");
assert.equal(receiptReversal.amount, 1000);
assert.equal(context.financeCustomerPosition_(
  receiptReversalState, "C-REV-RECEIPT"
).receipts, 0);
assert.equal(context.financeCustomerPosition_(
  receiptReversalState, "C-REV-RECEIPT"
).unallocatedReceipts, 0);
const receiptReversalJournal = receiptReversalState.journal_entries.find(
  (row) => row.id === "JE-PAY-REV-TARGET-R"
);
assert.equal(receiptReversalJournal.reversalOfJournalEntryId, "JE-PAY-REV-TARGET");
assert.deepEqual(
  Array.from(receiptReversalJournal.lines, (row) => [row.side, row.account, row.amount]),
  Array.from(
    receiptReversalState.journal_entries.find((row) => row.id === "JE-PAY-REV-TARGET").lines,
    (row) => [row.side === "D" ? "C" : "D", row.account, row.amount]
  )
);
expectCode("ALREADY_REVERSED", () => context.financeReverseReceipt_(
  receiptReversalState,
  {
    id: "PAY-REV-TARGET-R2",
    originalPaymentId: "PAY-REV-TARGET",
    accountingDate: "2026-07-24",
    reason: "二重反転",
    journalEntryId: "JE-PAY-REV-TARGET-R2"
  },
  actor2
));
expectCode("INVALID_REVERSAL_TARGET", () => context.financeReverseReceipt_(
  receiptReversalState,
  {
    id: "PAY-REVERSAL-OF-REVERSAL",
    originalPaymentId: "PAY-REV-TARGET-R",
    accountingDate: "2026-07-24",
    reason: "反対行を対象にした誤操作",
    journalEntryId: "JE-PAY-REVERSAL-OF-REVERSAL"
  },
  actor2
));
const tamperedReceiptReversal = JSON.parse(JSON.stringify(receiptReversalState));
tamperedReceiptReversal.payments.find((row) => row.id === "PAY-REV-TARGET-R").amount = 999;
expectCode("PAYMENT_TAMPERED", () => context.financeValidateState_(tamperedReceiptReversal));
const resealedReceiptReversal = JSON.parse(JSON.stringify(receiptReversalState));
const resealedReceiptReversalRow = resealedReceiptReversal.payments.find(
  (row) => row.id === "PAY-REV-TARGET-R"
);
resealedReceiptReversalRow.amount = 999;
delete resealedReceiptReversalRow.immutableKey;
context.financeSealRecord_(resealedReceiptReversalRow);
expectCode("INVALID_PAYMENT_REVERSAL", () => context.financeValidateState_(resealedReceiptReversal));

// 消込が残る入金は反転せず、反対消込で全額戻した後だけ訂正できる。
let allocatedReceiptReversalState = context.financeCreateState_({ taxRounding: "FLOOR" });
allocatedReceiptReversalState = context.financeCreateDraftInvoice_(
  allocatedReceiptReversalState,
  draft("INV-ALLOC-REV", "C-ALLOC-REV", 1000),
  actor
);
allocatedReceiptReversalState = context.financeIssueInvoice_(
  allocatedReceiptReversalState,
  "INV-ALLOC-REV",
  issue("2026-ALLOC-REV", "JE-INV-ALLOC-REV"),
  actor
);
allocatedReceiptReversalState = context.financeRecordReceipt_(
  allocatedReceiptReversalState,
  {
    id: "PAY-ALLOC-REV",
    customerId: "C-ALLOC-REV",
    paymentDate: "2026-07-24",
    amount: 1100,
    method: "銀行振込",
    journalEntryId: "JE-PAY-ALLOC-REV"
  },
  actor
);
allocatedReceiptReversalState = context.financeAllocateReceipt_(
  allocatedReceiptReversalState,
  {
    paymentId: "PAY-ALLOC-REV",
    accountingDate: "2026-07-24",
    journalEntryId: "JE-ALLOC-REV",
    allocations: [{ id: "ALLOC-REV-TARGET", invoiceId: "INV-ALLOC-REV", amount: 1100 }]
  },
  actor
);
expectCode("RECEIPT_REVERSAL_ALLOCATION_REMAINS", () => context.financeReverseReceipt_(
  allocatedReceiptReversalState,
  {
    id: "PAY-ALLOC-REV-R",
    originalPaymentId: "PAY-ALLOC-REV",
    accountingDate: "2026-07-24",
    reason: "消込が残る状態",
    journalEntryId: "JE-PAY-ALLOC-REV-R"
  },
  actor2
));
allocatedReceiptReversalState = context.financeReverseAllocation_(
  allocatedReceiptReversalState,
  {
    id: "ALLOC-REV-TARGET-R",
    originalAllocationId: "ALLOC-REV-TARGET",
    accountingDate: "2026-07-24",
    reason: "入金訂正の前処理",
    journalEntryId: "JE-ALLOC-REV-R"
  },
  actor2
);
allocatedReceiptReversalState = context.financeReverseReceipt_(
  allocatedReceiptReversalState,
  {
    id: "PAY-ALLOC-REV-R",
    originalPaymentId: "PAY-ALLOC-REV",
    accountingDate: "2026-07-24",
    reason: "入金自体の訂正",
    journalEntryId: "JE-PAY-ALLOC-REV-R"
  },
  actor2
);
assert.equal(
  context.financeCustomerPosition_(allocatedReceiptReversalState, "C-ALLOC-REV").receipts,
  0
);
assert.equal(
  context.financeInvoicePosition_(allocatedReceiptReversalState, "INV-ALLOC-REV").outstanding,
  1100
);

// 返金訂正は元の返金元明細を自動継承し、未消込・返金可能額を正確に戻す。
let refundReversalState = context.financeCreateState_({ taxRounding: "FLOOR" });
refundReversalState = context.financeRecordReceipt_(refundReversalState, {
  id: "PAY-REFUND-REV",
  customerId: "C-REFUND-REV",
  paymentDate: "2026-07-24",
  amount: 500,
  method: "銀行振込",
  journalEntryId: "JE-PAY-REFUND-REV"
}, actor);
refundReversalState = context.financeRecordRefund_(refundReversalState, {
  id: "REFUND-REV-TARGET",
  customerId: "C-REFUND-REV",
  paymentDate: "2026-07-24",
  amount: 200,
  method: "銀行振込",
  referenceNo: "RF-REV-001",
  reason: "返金",
  journalEntryId: "JE-REFUND-REV-TARGET"
}, actor);
assert.equal(
  context.financeCustomerPosition_(refundReversalState, "C-REFUND-REV").refundableCredit,
  300
);
const originalRefundBeforeReversal = JSON.stringify(
  refundReversalState.payments.find((row) => row.id === "REFUND-REV-TARGET")
);
expectCode("RECEIPT_REVERSAL_REFUND_REMAINS", () => context.financeReverseReceipt_(
  refundReversalState,
  {
    id: "PAY-REFUND-REV-R-BEFORE-REFUND-REVERSAL",
    originalPaymentId: "PAY-REFUND-REV",
    accountingDate: "2026-07-24",
    reason: "返金が残る状態",
    journalEntryId: "JE-PAY-REFUND-REV-R-BEFORE-REFUND-REVERSAL"
  },
  actor2
));
refundReversalState = context.financeReverseRefund_(refundReversalState, {
  id: "REFUND-REV-TARGET-R",
  originalPaymentId: "REFUND-REV-TARGET",
  accountingDate: "2026-07-24",
  reason: "返金先誤り",
  journalEntryId: "JE-REFUND-REV-TARGET-R"
}, actor2);
assert.equal(
  JSON.stringify(refundReversalState.payments.find((row) => row.id === "REFUND-REV-TARGET")),
  originalRefundBeforeReversal
);
const refundReversal = refundReversalState.payments.find(
  (row) => row.id === "REFUND-REV-TARGET-R"
);
assert.equal(refundReversal.kind, "REVERSE_REFUND");
assert.equal(refundReversal.amount, 200);
assert.equal(refundReversal.customerId, "C-REFUND-REV");
assert.equal(refundReversal.reversalOfPaymentId, "REFUND-REV-TARGET");
assert.equal(
  JSON.stringify(refundReversal.refundSources),
  JSON.stringify(refundReversalState.payments.find(
    (row) => row.id === "REFUND-REV-TARGET"
  ).refundSources)
);
assert.equal(
  context.financeCustomerPosition_(refundReversalState, "C-REFUND-REV").refunds,
  0
);
assert.equal(
  context.financeCustomerPosition_(refundReversalState, "C-REFUND-REV").refundableCredit,
  500
);
expectCode("ALREADY_REVERSED", () => context.financeReverseRefund_(refundReversalState, {
  id: "REFUND-REV-TARGET-R2",
  originalPaymentId: "REFUND-REV-TARGET",
  accountingDate: "2026-07-24",
  reason: "二重反転",
  journalEntryId: "JE-REFUND-REV-TARGET-R2"
}, actor2));
assert.doesNotThrow(() => context.financeReverseReceipt_(refundReversalState, {
  id: "PAY-REFUND-REV-R",
  originalPaymentId: "PAY-REFUND-REV",
  accountingDate: "2026-07-24",
  reason: "返金訂正後の入金訂正",
  journalEntryId: "JE-PAY-REFUND-REV-R"
}, actor2));

// 請求取消で発生した過消込を返金した場合も、返金訂正で過消込・返金可能額を戻す。
let invoiceCreditRefundReversalState = context.financeCreateState_({ taxRounding: "FLOOR" });
invoiceCreditRefundReversalState = context.financeCreateDraftInvoice_(
  invoiceCreditRefundReversalState,
  draft("INV-CREDIT-REFUND-REV", "C-CREDIT-REFUND-REV", 1000),
  actor
);
invoiceCreditRefundReversalState = context.financeIssueInvoice_(
  invoiceCreditRefundReversalState,
  "INV-CREDIT-REFUND-REV",
  issue("2026-CREDIT-REFUND-REV", "JE-INV-CREDIT-REFUND-REV"),
  actor
);
invoiceCreditRefundReversalState = context.financeRecordReceipt_(
  invoiceCreditRefundReversalState,
  {
    id: "PAY-CREDIT-REFUND-REV",
    customerId: "C-CREDIT-REFUND-REV",
    paymentDate: "2026-07-24",
    amount: 1100,
    method: "銀行振込",
    journalEntryId: "JE-PAY-CREDIT-REFUND-REV"
  },
  actor
);
invoiceCreditRefundReversalState = context.financeAllocateReceipt_(
  invoiceCreditRefundReversalState,
  {
    paymentId: "PAY-CREDIT-REFUND-REV",
    accountingDate: "2026-07-24",
    journalEntryId: "JE-ALLOC-CREDIT-REFUND-REV",
    allocations: [{
      id: "ALLOC-CREDIT-REFUND-REV",
      invoiceId: "INV-CREDIT-REFUND-REV",
      amount: 1100
    }]
  },
  actor
);
invoiceCreditRefundReversalState = context.financeReverseInvoice_(
  invoiceCreditRefundReversalState,
  {
    id: "CN-CREDIT-REFUND-REV",
    creditNoteNo: "CN-CREDIT-REFUND-REV",
    invoiceId: "INV-CREDIT-REFUND-REV",
    accountingDate: "2026-07-24",
    reason: "請求取消",
    journalEntryId: "JE-CN-CREDIT-REFUND-REV"
  },
  actor2
);
invoiceCreditRefundReversalState = context.financeRecordRefund_(
  invoiceCreditRefundReversalState,
  {
    id: "REFUND-INVOICE-CREDIT-REV",
    customerId: "C-CREDIT-REFUND-REV",
    paymentDate: "2026-07-24",
    amount: 400,
    method: "銀行振込",
    referenceNo: "RF-INVOICE-CREDIT-REV",
    reason: "請求取消分返金",
    journalEntryId: "JE-REFUND-INVOICE-CREDIT-REV"
  },
  actor2
);
assert.equal(
  context.financeInvoicePosition_(
    invoiceCreditRefundReversalState, "INV-CREDIT-REFUND-REV"
  ).overapplied,
  700
);
invoiceCreditRefundReversalState = context.financeReverseRefund_(
  invoiceCreditRefundReversalState,
  {
    id: "REFUND-INVOICE-CREDIT-REV-R",
    originalPaymentId: "REFUND-INVOICE-CREDIT-REV",
    accountingDate: "2026-07-24",
    reason: "返金誤り",
    journalEntryId: "JE-REFUND-INVOICE-CREDIT-REV-R"
  },
  actor2
);
assert.equal(
  context.financeInvoicePosition_(
    invoiceCreditRefundReversalState, "INV-CREDIT-REFUND-REV"
  ).overapplied,
  1100
);
assert.equal(
  context.financeCustomerPosition_(
    invoiceCreditRefundReversalState, "C-CREDIT-REFUND-REV"
  ).refundableCredit,
  1100
);

// 相殺・貸倒訂正は元取引と元仕訳を保持し、売掛残高だけを反対方向へ戻す。
let settlementReversalState = context.financeCreateState_({ taxRounding: "FLOOR" });
settlementReversalState = context.financeCreateDraftInvoice_(
  settlementReversalState,
  draft("INV-SETTLEMENT-REV", "C-SETTLEMENT-REV", 1000),
  actor
);
settlementReversalState = context.financeIssueInvoice_(
  settlementReversalState,
  "INV-SETTLEMENT-REV",
  issue("2026-SETTLEMENT-REV", "JE-INV-SETTLEMENT-REV"),
  actor
);
settlementReversalState = context.financeRecordSettlement_(settlementReversalState, {
  id: "OFFSET-REV-TARGET",
  invoiceId: "INV-SETTLEMENT-REV",
  kind: "OFFSET",
  amount: 100,
  accountingDate: "2026-07-24",
  referenceNo: "OFF-REV-001",
  counterReference: "AP-REV-001",
  reason: "相殺",
  journalEntryId: "JE-OFFSET-REV-TARGET"
}, actor);
settlementReversalState = context.financeRecordSettlement_(settlementReversalState, {
  id: "BAD-REV-TARGET",
  invoiceId: "INV-SETTLEMENT-REV",
  kind: "BAD_DEBT",
  amount: 200,
  accountingDate: "2026-07-24",
  referenceNo: "BAD-REV-001",
  reason: "貸倒",
  journalEntryId: "JE-BAD-REV-TARGET"
}, actor);
assert.equal(
  context.financeInvoicePosition_(settlementReversalState, "INV-SETTLEMENT-REV").outstanding,
  800
);
const originalOffsetBeforeReversal = JSON.stringify(
  settlementReversalState.credit_notes.find((row) => row.id === "OFFSET-REV-TARGET")
);
expectCode("REVERSAL_FIELD_NOT_EDITABLE", () => context.financeReverseSettlement_(
  settlementReversalState,
  {
    id: "OFFSET-REV-OVERRIDE",
    originalSettlementId: "OFFSET-REV-TARGET",
    accountingDate: "2026-07-24",
    amount: 1,
    reason: "金額上書きを試行",
    journalEntryId: "JE-OFFSET-REV-OVERRIDE"
  },
  actor2
));
settlementReversalState = context.financeReverseSettlement_(settlementReversalState, {
  id: "OFFSET-REV-TARGET-R",
  originalSettlementId: "OFFSET-REV-TARGET",
  accountingDate: "2026-07-24",
  reason: "相殺合意取消",
  journalEntryId: "JE-OFFSET-REV-TARGET-R"
}, actor2);
settlementReversalState = context.financeApplyCommand_(settlementReversalState, {
  type: "REVERSE_SETTLEMENT",
  data: {
    id: "BAD-REV-TARGET-R",
    originalSettlementId: "BAD-REV-TARGET",
    accountingDate: "2026-07-24",
    reason: "貸倒認定取消",
    journalEntryId: "JE-BAD-REV-TARGET-R"
  }
}, actor2);
assert.equal(
  JSON.stringify(settlementReversalState.credit_notes.find(
    (row) => row.id === "OFFSET-REV-TARGET"
  )),
  originalOffsetBeforeReversal
);
assert.equal(
  context.financeInvoicePosition_(settlementReversalState, "INV-SETTLEMENT-REV").outstanding,
  1100
);
assert.equal(
  context.financeCustomerPosition_(settlementReversalState, "C-SETTLEMENT-REV").outstanding,
  1100
);
const reversedOffset = settlementReversalState.credit_notes.find(
  (row) => row.id === "OFFSET-REV-TARGET-R"
);
assert.equal(reversedOffset.kind, "REVERSE_SETTLEMENT");
assert.equal(reversedOffset.totalInclTax, 100);
assert.equal(reversedOffset.customerId, "C-SETTLEMENT-REV");
assert.equal(reversedOffset.invoiceId, "INV-SETTLEMENT-REV");
assert.equal(reversedOffset.reversalOfCreditNoteId, "OFFSET-REV-TARGET");
expectCode("ALREADY_REVERSED", () => context.financeReverseSettlement_(
  settlementReversalState,
  {
    id: "OFFSET-REV-TARGET-R2",
    originalSettlementId: "OFFSET-REV-TARGET",
    accountingDate: "2026-07-24",
    reason: "二重反転",
    journalEntryId: "JE-OFFSET-REV-TARGET-R2"
  },
  actor2
));
const resealedReversalJournalState = JSON.parse(JSON.stringify(settlementReversalState));
const resealedReversalJournal = resealedReversalJournalState.journal_entries.find(
  (row) => row.id === "JE-OFFSET-REV-TARGET-R"
);
resealedReversalJournal.lines[0].amount = 101;
resealedReversalJournal.lines[1].amount = 101;
delete resealedReversalJournal.immutableKey;
context.financeSealRecord_(resealedReversalJournal);
expectCode(
  "INVALID_LINKED_REVERSAL_JOURNAL",
  () => context.financeValidateState_(resealedReversalJournalState)
);

// 取消は元請求を一切変更せず、貸方取引と反対仕訳を追加する。
const originalInvoice = JSON.stringify(state.invoices.find((row) => row.id === "INV2"));
const originalLines = JSON.stringify(state.invoice_lines.filter((row) => row.invoiceId === "INV2"));
state = context.financeReverseInvoice_(state, {
  id: "CN-INV2",
  creditNoteNo: "CN-2026-001",
  invoiceId: "INV2",
  accountingDate: "2026-07-24",
  reason: "請求取消",
  journalEntryId: "JE-CN-INV2"
}, actor2);
assert.equal(JSON.stringify(state.invoices.find((row) => row.id === "INV2")), originalInvoice);
assert.equal(JSON.stringify(state.invoice_lines.filter((row) => row.invoiceId === "INV2")), originalLines);
assert.equal(context.financeInvoicePosition_(state, "INV2").effectiveBilled, 0);
assert.equal(context.financeInvoicePosition_(state, "INV2").overapplied, 550);

// 請求取消によって生じた過消込も返金できる。
state = context.financeRecordRefund_(state, {
  id: "REFUND-2",
  customerId: "C1",
  paymentDate: "2026-07-24",
  amount: 550,
  method: "銀行振込",
  referenceNo: "RF-2026-0002",
  reason: "請求取消返金",
  journalEntryId: "JE-REFUND-2"
}, actor2);
assert.equal(context.financeCustomerPosition_(state, "C1").invoiceCreditBeforeRefund, 550);
assert.equal(context.financeCustomerPosition_(state, "C1").refundableCredit, 50);

// 消込訂正も元行を変更せず反対行を追加する。
const originalAllocation = JSON.stringify(state.payment_allocations.find((row) => row.id === "ALLOC-3"));
state = context.financeReverseAllocation_(state, {
  id: "ALLOC-3-R",
  originalAllocationId: "ALLOC-3",
  accountingDate: "2026-07-24",
  reason: "消込先誤り",
  journalEntryId: "JE-ALLOC-3-R"
}, actor2);
assert.equal(JSON.stringify(state.payment_allocations.find((row) => row.id === "ALLOC-3")), originalAllocation);

// 発行済データの直接改変を検知する。
const tampered = JSON.parse(JSON.stringify(state));
tampered.invoices.find((row) => row.id === "INV1").totalInclTax = 1;
expectCode("ISSUED_INVOICE_TAMPERED", () => context.financeValidateState_(tampered));
const tamperedSnapshot = JSON.parse(JSON.stringify(state));
tamperedSnapshot.invoices.find((row) => row.id === "INV1").billingSnapshot.recipientName = "改変された宛先";
expectCode("ISSUED_INVOICE_TAMPERED", () => context.financeValidateState_(tamperedSnapshot));
const missingIssuedSnapshot = JSON.parse(JSON.stringify(state));
delete missingIssuedSnapshot.invoices.find((row) => row.id === "INV1").billingSnapshot;
expectCode("ISSUED_INVOICE_BILLING_SNAPSHOT_MISSING", () => context.financeValidateState_(missingIssuedSnapshot));

// 自動生成仕訳は元取引との不整合を防ぐため直接反対仕訳にできない。
expectCode("SYSTEM_JOURNAL_REVERSAL_FORBIDDEN", () => context.financeReverseJournalEntry_(state, {
  id: "JE-INV1-R",
  originalJournalEntryId: "JE-INV1",
  accountingDate: "2026-07-24",
  reason: "請求仕訳の直接取消を試行"
}, actor2));
expectCode("MANUAL_JOURNAL_SOURCE_ONLY", () => context.financePostJournalEntry_(state, {
  id: "JE-FAKE-SYSTEM",
  accountingDate: "2026-07-24",
  description: "偽装した発生元",
  sourceType: "INVOICE",
  sourceId: "INV-FAKE",
  lines: [
    { side: "D", account: "普通預金", amount: 1 },
    { side: "C", account: "売上", amount: 1 }
  ]
}, actor2));

// 不均衡仕訳は登録拒否、手動仕訳の訂正は反対仕訳。
expectCode("UNBALANCED_JOURNAL", () => context.financePostJournalEntry_(state, {
  id: "JE-BAD",
  accountingDate: "2026-07-24",
  description: "不均衡",
  lines: [
    { side: "D", account: "現金", amount: 100 },
    { side: "C", account: "売上", amount: 99 }
  ]
}, actor));
state = context.financePostJournalEntry_(state, {
  id: "JE-MANUAL",
  accountingDate: "2026-07-24",
  description: "振替",
  lines: [
    { side: "D", account: "仮払金", amount: 100 },
    { side: "C", account: "普通預金", amount: 100 }
  ]
}, actor);
const originalJournal = JSON.stringify(state.journal_entries.find((row) => row.id === "JE-MANUAL"));
state = context.financeReverseJournalEntry_(state, {
  id: "JE-MANUAL-R",
  originalJournalEntryId: "JE-MANUAL",
  accountingDate: "2026-07-24",
  reason: "勘定科目誤り"
}, actor2);
assert.equal(JSON.stringify(state.journal_entries.find((row) => row.id === "JE-MANUAL")), originalJournal);
assert.equal(state.journal_entries.find((row) => row.id === "JE-MANUAL-R").sourceType, "JOURNAL_REVERSAL");

// 入金・返金・相殺/貸倒の反対取引も締め済日へ遡及せず、指定した開放日だけで登録する。
let closedReversalState = context.financeCreateState_({ taxRounding: "FLOOR" });
closedReversalState = context.financeRecordReceipt_(closedReversalState, {
  id: "PAY-CLOSE-REV",
  customerId: "C-CLOSE-RECEIPT",
  paymentDate: "2026-07-24",
  amount: 100,
  method: "銀行振込",
  journalEntryId: "JE-PAY-CLOSE-REV"
}, actor);
closedReversalState = context.financeRecordReceipt_(closedReversalState, {
  id: "PAY-CLOSE-REFUND-SOURCE",
  customerId: "C-CLOSE-REFUND",
  paymentDate: "2026-07-24",
  amount: 100,
  method: "銀行振込",
  journalEntryId: "JE-PAY-CLOSE-REFUND-SOURCE"
}, actor);
closedReversalState = context.financeRecordRefund_(closedReversalState, {
  id: "REFUND-CLOSE-REV",
  customerId: "C-CLOSE-REFUND",
  paymentDate: "2026-07-24",
  amount: 50,
  method: "銀行振込",
  referenceNo: "RF-CLOSE-REV",
  reason: "返金",
  journalEntryId: "JE-REFUND-CLOSE-REV"
}, actor);
closedReversalState = context.financeCreateDraftInvoice_(
  closedReversalState,
  draft("INV-CLOSE-SETTLEMENT", "C-CLOSE-SETTLEMENT", 1000),
  actor
);
closedReversalState = context.financeIssueInvoice_(
  closedReversalState,
  "INV-CLOSE-SETTLEMENT",
  issue("2026-CLOSE-SETTLEMENT", "JE-INV-CLOSE-SETTLEMENT"),
  actor
);
closedReversalState = context.financeRecordSettlement_(closedReversalState, {
  id: "SETTLEMENT-CLOSE-REV",
  invoiceId: "INV-CLOSE-SETTLEMENT",
  kind: "BAD_DEBT",
  amount: 100,
  accountingDate: "2026-07-24",
  referenceNo: "BAD-CLOSE-REV",
  reason: "貸倒",
  journalEntryId: "JE-SETTLEMENT-CLOSE-REV"
}, actor);
const reversalClosingActor = {
  actorId: "manager@example.jp",
  at: "2026-08-01T09:00:00+09:00"
};
closedReversalState = context.financeClosePeriod_(closedReversalState, {
  id: "CLOSE-REVERSALS-2026-07",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  reason: "月次締め"
}, reversalClosingActor);
expectCode("ACCOUNTING_PERIOD_CLOSED", () => context.financeReverseReceipt_(
  closedReversalState,
  {
    id: "PAY-CLOSE-REV-R-CLOSED",
    originalPaymentId: "PAY-CLOSE-REV",
    accountingDate: "2026-07-31",
    reason: "締め済日への遡及",
    journalEntryId: "JE-PAY-CLOSE-REV-R-CLOSED"
  },
  reversalClosingActor
));
expectCode("ACCOUNTING_PERIOD_CLOSED", () => context.financeReverseRefund_(
  closedReversalState,
  {
    id: "REFUND-CLOSE-REV-R-CLOSED",
    originalPaymentId: "REFUND-CLOSE-REV",
    accountingDate: "2026-07-31",
    reason: "締め済日への遡及",
    journalEntryId: "JE-REFUND-CLOSE-REV-R-CLOSED"
  },
  reversalClosingActor
));
expectCode("ACCOUNTING_PERIOD_CLOSED", () => context.financeReverseSettlement_(
  closedReversalState,
  {
    id: "SETTLEMENT-CLOSE-REV-R-CLOSED",
    originalSettlementId: "SETTLEMENT-CLOSE-REV",
    accountingDate: "2026-07-31",
    reason: "締め済日への遡及",
    journalEntryId: "JE-SETTLEMENT-CLOSE-REV-R-CLOSED"
  },
  reversalClosingActor
));
closedReversalState = context.financeReverseReceipt_(closedReversalState, {
  id: "PAY-CLOSE-REV-R",
  originalPaymentId: "PAY-CLOSE-REV",
  accountingDate: "2026-08-01",
  reason: "翌期入金訂正",
  journalEntryId: "JE-PAY-CLOSE-REV-R"
}, reversalClosingActor);
closedReversalState = context.financeReverseRefund_(closedReversalState, {
  id: "REFUND-CLOSE-REV-R",
  originalPaymentId: "REFUND-CLOSE-REV",
  accountingDate: "2026-08-01",
  reason: "翌期返金訂正",
  journalEntryId: "JE-REFUND-CLOSE-REV-R"
}, reversalClosingActor);
closedReversalState = context.financeReverseSettlement_(closedReversalState, {
  id: "SETTLEMENT-CLOSE-REV-R",
  originalSettlementId: "SETTLEMENT-CLOSE-REV",
  accountingDate: "2026-08-01",
  reason: "翌期貸倒訂正",
  journalEntryId: "JE-SETTLEMENT-CLOSE-REV-R"
}, reversalClosingActor);
assert.equal(context.financeValidateState_(closedReversalState), true);

// 締め済期間への遡及登録は禁止。元取引は翌期の反対取引で訂正する。
expectCode("FUTURE_CLOSING_PERIOD_FORBIDDEN", () => context.financeClosePeriod_(state, {
  id: "CLOSE-FUTURE",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  reason: "未来締め"
}, actor2));
const closingActor = { actorId: "manager@example.jp", at: "2026-08-01T09:00:00+09:00" };
state = context.financeClosePeriod_(state, {
  id: "CLOSE-2026-07",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  reason: "月次締め"
}, closingActor);
expectCode("ACCOUNTING_PERIOD_CLOSED", () => context.financeRecordReceipt_(state, {
  id: "PAY-CLOSED",
  customerId: "C1",
  paymentDate: "2026-07-25",
  amount: 100,
  method: "現金",
  journalEntryId: "JE-PAY-CLOSED"
}, actor2));

// 保存ポートはrevision一致時だけ確定し、競合時は既存stateを上書きしない。
let stored = JSON.parse(JSON.stringify(state));
const adapter = {
  loadSnapshot() {
    return JSON.parse(JSON.stringify(stored));
  },
  compareAndSwap(expectedRevision, nextState) {
    if (stored.revision !== expectedRevision) return false;
    stored = JSON.parse(JSON.stringify(nextState));
    return true;
  }
};
const port = context.financeCreateBackendStorePort_(adapter);
const expectedRevision = stored.revision;
stored = context.financeExecuteWithStore_(port, expectedRevision, {
  type: "POST_JOURNAL",
  data: {
    id: "JE-AUG",
    accountingDate: "2026-08-01",
    description: "翌月振替",
    lines: [
      { side: "D", account: "仮払金", amount: 10 },
      { side: "C", account: "普通預金", amount: 10 }
    ]
  }
}, actor2);
expectCode("CONCURRENT_MODIFICATION", () => context.financeExecuteWithStore_(port, expectedRevision, {
  type: "POST_JOURNAL",
  data: {
    id: "JE-STALE",
    accountingDate: "2026-08-01",
    description: "競合",
    lines: [
      { side: "D", account: "仮払金", amount: 10 },
      { side: "C", account: "普通預金", amount: 10 }
    ]
  }
}, actor2));

assert.equal(context.financeValidateState_(stored), true);
console.log("finance_logic_test: OK");
