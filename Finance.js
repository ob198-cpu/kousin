// @ts-nocheck
/*
 * CDP 更新講習システム - 会計取引ドメイン
 *
 * このファイルは画面・Drive・Spreadsheet に直接アクセスしない。
 * すべての更新関数は入力 state を変更せず、新しい state を返す。
 * 永続化は末尾の financeCreateBackendStorePort_ / financeExecuteWithStore_ を通じて、
 * backend_store の比較更新（CAS）へ接続する。
 */

var FINANCE_SCHEMA_VERSION = "1.0.0";
var FINANCE_MAX_AMOUNT = 900000000000;
var FINANCE_BILLING_SNAPSHOT_FIELDS = [
  "recipientName",
  "recipientHonorific",
  "recipientAddress",
  "issuerCompany",
  "issuerAddress",
  "issuerPhone",
  "issuerFax",
  "issuerEmail",
  "invoiceRegistrationNo",
  "bankAccountText"
];
var FINANCE_BILLING_SNAPSHOT_REQUIRED_VALUES = {
  recipientName: true,
  recipientHonorific: true,
  recipientAddress: true,
  issuerCompany: true,
  issuerAddress: true,
  issuerPhone: true,
  invoiceRegistrationNo: true,
  bankAccountText: true
};
var FINANCE_BILLING_SNAPSHOT_MAX_LENGTHS = {
  recipientName: 200,
  recipientHonorific: 2,
  recipientAddress: 500,
  issuerCompany: 200,
  issuerAddress: 500,
  issuerPhone: 50,
  issuerFax: 50,
  issuerEmail: 254,
  invoiceRegistrationNo: 14,
  bankAccountText: 500
};

var FINANCE_TAX_CATEGORY = {
  TAXABLE_10: "TAXABLE_10",
  TAXABLE_8: "TAXABLE_8",
  EXEMPT: "EXEMPT",
  NON_TAXABLE: "NON_TAXABLE",
  OUT_OF_SCOPE: "OUT_OF_SCOPE"
};

var FINANCE_TAX_DEFINITIONS = {
  TAXABLE_10: { label: "課税10%", rateBps: 1000, revenueAccountKey: "revenueTaxable10" },
  TAXABLE_8: { label: "課税8%", rateBps: 800, revenueAccountKey: "revenueTaxable8" },
  EXEMPT: { label: "非課税", rateBps: 0, revenueAccountKey: "revenueExempt" },
  NON_TAXABLE: { label: "不課税", rateBps: 0, revenueAccountKey: "revenueNonTaxable" },
  OUT_OF_SCOPE: { label: "対象外", rateBps: 0, revenueAccountKey: "revenueOutOfScope" }
};

var FINANCE_ROUNDING = {
  FLOOR: "FLOOR",
  CEIL: "CEIL",
  HALF_UP: "HALF_UP"
};

var FINANCE_PRICING_MODE = {
  EXCLUSIVE: "EXCLUSIVE",
  INCLUSIVE: "INCLUSIVE"
};

var FINANCE_INVOICE_STATUS = {
  DRAFT: "DRAFT",
  ISSUED: "ISSUED"
};

var FINANCE_PAYMENT_KIND = {
  RECEIPT: "RECEIPT",
  REFUND: "REFUND",
  REVERSE_RECEIPT: "REVERSE_RECEIPT",
  REVERSE_REFUND: "REVERSE_REFUND"
};

var FINANCE_CREDIT_KIND = {
  CREDIT: "CREDIT",
  REVERSAL: "REVERSAL",
  OFFSET: "OFFSET",
  BAD_DEBT: "BAD_DEBT",
  REVERSE_CREDIT: "REVERSE_CREDIT",
  REVERSE_SETTLEMENT: "REVERSE_SETTLEMENT"
};

var FINANCE_DEFAULT_ACCOUNTS = {
  accountsReceivable: "1100-売掛金",
  bank: "1000-普通預金",
  customerDeposits: "2100-預り金",
  taxPayable: "2200-仮受消費税",
  revenueTaxable10: "4100-講習売上10%",
  revenueTaxable8: "4110-講習売上8%",
  revenueExempt: "4120-非課税売上",
  revenueNonTaxable: "4130-不課税取引",
  revenueOutOfScope: "4140-対象外取引",
  offsetClearing: "1200-相殺勘定",
  badDebtExpense: "5100-貸倒損失"
};

function financeCreateState_(policyInput) {
  var policy = financeNormalizePolicy_(policyInput || {});
  return {
    schemaVersion: FINANCE_SCHEMA_VERSION,
    revision: 0,
    companyPolicy: policy,
    policyIntegrityKey: financeHash_(policy),
    invoices: [],
    invoice_lines: [],
    payments: [],
    payment_allocations: [],
    credit_notes: [],
    closing_periods: [],
    journal_entries: []
  };
}

function financeCalculateInvoice_(invoiceInput, policyInput) {
  var policy = financeNormalizePolicy_(policyInput || {});
  var input = invoiceInput || {};
  var pricingMode = String(input.pricingMode || FINANCE_PRICING_MODE.EXCLUSIVE);
  if (pricingMode !== FINANCE_PRICING_MODE.EXCLUSIVE &&
      pricingMode !== FINANCE_PRICING_MODE.INCLUSIVE) {
    financeFail_("INVALID_PRICING_MODE", "金額区分は税抜または税込で指定してください。");
  }
  if (input.taxRounding && input.taxRounding !== policy.taxRounding) {
    financeFail_("ROUNDING_POLICY_MISMATCH", "請求ごとの丸め変更は禁止されています。会社設定を使用してください。");
  }

  var rawLines = input.lines || [];
  if (!rawLines.length) {
    financeFail_("INVOICE_LINES_REQUIRED", "請求明細が1行以上必要です。");
  }

  var seenLineIds = {};
  var normalizedLines = [];
  var groupsByCategory = {};
  var index;
  for (index = 0; index < rawLines.length; index += 1) {
    var raw = rawLines[index] || {};
    var lineId = financeRequiredText_(raw.id, "明細ID");
    if (seenLineIds[lineId]) financeFail_("DUPLICATE_LINE_ID", "請求明細IDが重複しています: " + lineId);
    seenLineIds[lineId] = true;

    var category = String(raw.taxCategory || "");
    var definition = FINANCE_TAX_DEFINITIONS[category];
    if (!definition) financeFail_("INVALID_TAX_CATEGORY", "税区分が不正です: " + category);
    var taxEvidence = financeNormalizeTaxEvidence_(category, raw.taxEvidence);

    var quantity = raw.quantity === undefined || raw.quantity === null || raw.quantity === "" ?
      1 : financePositiveInteger_(raw.quantity, "数量");
    var unitAmount = financeNonNegativeAmount_(raw.unitAmount, "単価");
    if (unitAmount > Math.floor(FINANCE_MAX_AMOUNT / quantity)) {
      financeFail_("AMOUNT_TOO_LARGE", "明細金額が上限を超えています。");
    }
    var lineType = String(raw.lineType || "CHARGE");
    if (lineType !== "CHARGE" && lineType !== "DISCOUNT") {
      financeFail_("INVALID_LINE_TYPE", "明細種別は請求または値引で指定してください。");
    }
    var signedAmount = quantity * unitAmount * (lineType === "DISCOUNT" ? -1 : 1);
    var normalized = {
      id: lineId,
      description: financeRequiredText_(raw.description, "摘要"),
      quantity: quantity,
      unitAmount: unitAmount,
      lineType: lineType,
      taxCategory: category,
      amount: signedAmount
    };
    if (taxEvidence) normalized.taxEvidence = taxEvidence;
    normalizedLines.push(normalized);
    if (!groupsByCategory[category]) groupsByCategory[category] = 0;
    groupsByCategory[category] += signedAmount;
  }

  var categoryOrder = [
    FINANCE_TAX_CATEGORY.TAXABLE_10,
    FINANCE_TAX_CATEGORY.TAXABLE_8,
    FINANCE_TAX_CATEGORY.EXEMPT,
    FINANCE_TAX_CATEGORY.NON_TAXABLE,
    FINANCE_TAX_CATEGORY.OUT_OF_SCOPE
  ];
  var taxGroups = [];
  var totalExTax = 0;
  var totalTax = 0;
  var totalInclTax = 0;
  for (index = 0; index < categoryOrder.length; index += 1) {
    var categoryKey = categoryOrder[index];
    if (groupsByCategory[categoryKey] === undefined) continue;
    var enteredAmount = groupsByCategory[categoryKey];
    if (enteredAmount < 0) {
      financeFail_("NEGATIVE_TAX_GROUP", "税区分ごとの値引額は請求額を超えられません: " +
        FINANCE_TAX_DEFINITIONS[categoryKey].label);
    }
    var rateBps = FINANCE_TAX_DEFINITIONS[categoryKey].rateBps;
    var baseExTax;
    var tax;
    var inclTax;
    if (pricingMode === FINANCE_PRICING_MODE.EXCLUSIVE) {
      baseExTax = enteredAmount;
      tax = financeRoundRational_(baseExTax * rateBps, 10000, policy.taxRounding);
      inclTax = baseExTax + tax;
    } else {
      inclTax = enteredAmount;
      tax = financeRoundRational_(inclTax * rateBps, 10000 + rateBps, policy.taxRounding);
      baseExTax = inclTax - tax;
    }
    financeAssertAmountRange_(baseExTax, "税抜額");
    financeAssertAmountRange_(tax, "消費税額");
    financeAssertAmountRange_(inclTax, "税込額");
    taxGroups.push({
      taxCategory: categoryKey,
      label: FINANCE_TAX_DEFINITIONS[categoryKey].label,
      rateBps: rateBps,
      enteredAmount: enteredAmount,
      baseExTax: baseExTax,
      tax: tax,
      totalInclTax: inclTax
    });
    totalExTax += baseExTax;
    totalTax += tax;
    totalInclTax += inclTax;
  }
  financeAssertAmountRange_(totalExTax, "税抜合計");
  financeAssertAmountRange_(totalTax, "消費税合計");
  financeAssertAmountRange_(totalInclTax, "税込合計");

  return {
    pricingMode: pricingMode,
    taxRounding: policy.taxRounding,
    lines: normalizedLines,
    taxGroups: taxGroups,
    totalExTax: totalExTax,
    totalTax: totalTax,
    totalInclTax: totalInclTax
  };
}

function financeCreateDraftInvoice_(state, invoiceInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = invoiceInput || {};
  var invoiceId = financeRequiredText_(input.id, "請求ID");
  financeAssertUniqueId_(next.invoices, invoiceId, "DUPLICATE_INVOICE_ID");
  var invoiceNo = financeOptionalText_(input.invoiceNo);
  if (invoiceNo) financeAssertUniqueInvoiceNo_(next, invoiceNo, "");
  var customerId = financeRequiredText_(input.customerId, "対象者ID");
  var calculation = financeCalculateInvoice_({
    pricingMode: input.pricingMode,
    taxRounding: input.taxRounding,
    lines: input.lines
  }, next.companyPolicy);
  var meta = financeContext_(context);
  var invoice = {
    id: invoiceId,
    invoiceNo: invoiceNo,
    customerId: customerId,
    status: FINANCE_INVOICE_STATUS.DRAFT,
    pricingMode: calculation.pricingMode,
    taxRounding: calculation.taxRounding,
    invoiceDate: financeOptionalDate_(input.invoiceDate, "請求日"),
    accountingDate: financeOptionalDate_(input.accountingDate, "計上日"),
    dueDate: financeOptionalDate_(input.dueDate, "支払期限"),
    subject: financeOptionalText_(input.subject),
    billingSnapshot: input.billingSnapshot === undefined || input.billingSnapshot === null
      ? null
      : financeNormalizeBillingSnapshot_(input.billingSnapshot, false),
    totalExTax: calculation.totalExTax,
    totalTax: calculation.totalTax,
    totalInclTax: calculation.totalInclTax,
    taxGroups: calculation.taxGroups,
    correctionOfInvoiceId: financeOptionalText_(input.correctionOfInvoiceId),
    createdAt: meta.at,
    createdBy: meta.actorId,
    updatedAt: meta.at,
    updatedBy: meta.actorId
  };
  next.invoices.push(invoice);
  var index;
  for (index = 0; index < calculation.lines.length; index += 1) {
    var line = financeClone_(calculation.lines[index]);
    line.invoiceId = invoiceId;
    next.invoice_lines.push(line);
  }
  return financeFinishMutation_(next);
}

function financeUpdateDraftInvoice_(state, invoiceId, replacement, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var invoice = financeFindRequired_(next.invoices, invoiceId, "INVOICE_NOT_FOUND", "請求が見つかりません。");
  if (invoice.status !== FINANCE_INVOICE_STATUS.DRAFT) {
    financeFail_("ISSUED_INVOICE_IMMUTABLE", "発行済請求は変更できません。取消・訂正取引を作成してください。");
  }
  var input = replacement || {};
  var invoiceNo = financeOptionalText_(input.invoiceNo);
  if (invoiceNo) financeAssertUniqueInvoiceNo_(next, invoiceNo, invoice.id);
  var calculation = financeCalculateInvoice_({
    pricingMode: input.pricingMode,
    taxRounding: input.taxRounding,
    lines: input.lines
  }, next.companyPolicy);
  var meta = financeContext_(context);
  invoice.invoiceNo = invoiceNo;
  invoice.customerId = financeRequiredText_(input.customerId, "対象者ID");
  invoice.pricingMode = calculation.pricingMode;
  invoice.taxRounding = calculation.taxRounding;
  invoice.invoiceDate = financeOptionalDate_(input.invoiceDate, "請求日");
  invoice.accountingDate = financeOptionalDate_(input.accountingDate, "計上日");
  invoice.dueDate = financeOptionalDate_(input.dueDate, "支払期限");
  invoice.subject = financeOptionalText_(input.subject);
  if (Object.prototype.hasOwnProperty.call(input, "billingSnapshot")) {
    invoice.billingSnapshot = input.billingSnapshot === null
      ? null
      : financeNormalizeBillingSnapshot_(input.billingSnapshot, false);
  }
  invoice.totalExTax = calculation.totalExTax;
  invoice.totalTax = calculation.totalTax;
  invoice.totalInclTax = calculation.totalInclTax;
  invoice.taxGroups = calculation.taxGroups;
  invoice.updatedAt = meta.at;
  invoice.updatedBy = meta.actorId;
  next.invoice_lines = next.invoice_lines.filter(function (line) {
    return line.invoiceId !== invoice.id;
  });
  var index;
  for (index = 0; index < calculation.lines.length; index += 1) {
    var line = financeClone_(calculation.lines[index]);
    line.invoiceId = invoice.id;
    next.invoice_lines.push(line);
  }
  return financeFinishMutation_(next);
}

function financeIssueInvoice_(state, invoiceId, issueInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var invoice = financeFindRequired_(next.invoices, invoiceId, "INVOICE_NOT_FOUND", "請求が見つかりません。");
  if (invoice.status !== FINANCE_INVOICE_STATUS.DRAFT) {
    financeFail_("INVOICE_ALREADY_ISSUED", "請求はすでに発行済みです。");
  }
  financeAssertDraftCalculationConsistent_(next, invoice);
  var input = issueInput || {};
  var invoiceNo = financeRequiredText_(input.invoiceNo || invoice.invoiceNo, "請求書番号");
  financeAssertUniqueInvoiceNo_(next, invoiceNo, invoice.id);
  var invoiceDate = financeRequiredDate_(input.invoiceDate || invoice.invoiceDate, "請求日");
  var accountingDate = financeRequiredDate_(input.accountingDate || invoice.accountingDate || invoiceDate, "計上日");
  var dueDate = financeRequiredDate_(input.dueDate || invoice.dueDate, "支払期限");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var billingSnapshotInput = Object.prototype.hasOwnProperty.call(input, "billingSnapshot")
    ? input.billingSnapshot
    : invoice.billingSnapshot;
  var billingSnapshot = financeNormalizeBillingSnapshot_(billingSnapshotInput, true);
  var meta = financeContext_(context);
  invoice.invoiceNo = invoiceNo;
  invoice.invoiceDate = invoiceDate;
  invoice.accountingDate = accountingDate;
  invoice.dueDate = dueDate;
  invoice.billingSnapshot = billingSnapshot;
  invoice.status = FINANCE_INVOICE_STATUS.ISSUED;
  invoice.issuedAt = meta.at;
  invoice.issuedBy = meta.actorId;
  invoice.updatedAt = meta.at;
  invoice.updatedBy = meta.actorId;

  var journal = financeInvoiceJournal_(next, invoice, journalEntryId, meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  invoice.immutableKey = financeInvoiceIntegrityKey_(next, invoice);
  return financeFinishMutation_(next);
}

function financeCreateCreditNote_(state, creditInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = creditInput || {};
  var invoice = financeFindIssuedInvoice_(next, input.invoiceId);
  var id = financeRequiredText_(input.id, "貸方取引ID");
  financeAssertUniqueId_(next.credit_notes, id, "DUPLICATE_CREDIT_NOTE_ID");
  var creditNoteNo = financeRequiredText_(input.creditNoteNo, "取消・訂正番号");
  financeAssertUniqueCreditNo_(next, creditNoteNo);
  var accountingDate = financeRequiredDate_(input.accountingDate || input.date, "計上日");
  financeAssertDateOpen_(next, accountingDate);
  var kind = String(input.kind || FINANCE_CREDIT_KIND.CREDIT);
  if (kind !== FINANCE_CREDIT_KIND.CREDIT && kind !== FINANCE_CREDIT_KIND.REVERSAL) {
    financeFail_("INVALID_CREDIT_KIND", "請求減額は訂正または取消として登録してください。");
  }
  var calculation;
  if (kind === FINANCE_CREDIT_KIND.REVERSAL && !(input.lines || []).length) {
    calculation = financeRemainingBillingCalculation_(next, invoice);
  } else {
    calculation = financeCalculateInvoice_({
      pricingMode: invoice.pricingMode,
      taxRounding: invoice.taxRounding,
      lines: input.lines
    }, next.companyPolicy);
  }
  financeAssertCreditWithinRemaining_(next, invoice, calculation);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var meta = financeContext_(context);
  var credit = {
    id: id,
    creditNoteNo: creditNoteNo,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    kind: kind,
    effect: "BILLING_REDUCTION",
    direction: -1,
    accountingDate: accountingDate,
    reason: financeRequiredText_(input.reason, "取消・訂正理由"),
    pricingMode: invoice.pricingMode,
    taxRounding: invoice.taxRounding,
    taxGroups: financeClone_(calculation.taxGroups),
    totalExTax: calculation.totalExTax,
    totalTax: calculation.totalTax,
    totalInclTax: calculation.totalInclTax,
    reversalOfCreditNoteId: "",
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(credit);
  next.credit_notes.push(credit);
  var journal = financeCreditJournal_(next, credit, journalEntryId, meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeReverseInvoice_(state, input, context) {
  var data = financeClone_(input || {});
  data.kind = FINANCE_CREDIT_KIND.REVERSAL;
  return financeCreateCreditNote_(state, data, context);
}

function financeCorrectInvoice_(state, correctionInput, context) {
  financeValidateState_(state);
  var input = correctionInput || {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    financeFail_("INVALID_CORRECTION_INPUT", "請求訂正の入力形式が不正です。");
  }
  var inputKeys = Object.keys(input);
  var allowedInput = {
    reversal: true,
    replacementInvoice: true,
    replacementIssue: true
  };
  var inputIndex;
  for (inputIndex = 0; inputIndex < inputKeys.length; inputIndex += 1) {
    if (!allowedInput[inputKeys[inputIndex]]) {
      financeFail_(
        "CORRECTION_FIELD_NOT_EDITABLE",
        "請求訂正の" + inputKeys[inputIndex] + "は指定できません。"
      );
    }
  }
  var reversalInput = input.reversal || {};
  // CORRECT_INVOICE は「元請求の有効な請求残額を全額取り消してから、
  // 訂正版を新規発行する」一つの追記取引である。lines や kind を入力で
  // 許すと部分取消と訂正版が併存するため、取消額は正本からだけ算出する。
  financeAssertOnlyReversalFields_(reversalInput, {
    id: true,
    creditNoteNo: true,
    invoiceId: true,
    accountingDate: true,
    date: true,
    reason: true,
    journalEntryId: true
  });
  var originalInvoice = financeFindIssuedInvoice_(
    state, financeRequiredText_(reversalInput.invoiceId, "訂正元請求ID")
  );
  var expectedCancellation = financeRemainingBillingCalculation_(
    state, originalInvoice
  );
  var before = financeClone_(state);
  var reversed = financeReverseInvoice_(state, reversalInput, context);
  var cancellation = financeFindRequired_(
    reversed.credit_notes,
    financeRequiredText_(reversalInput.id, "取消取引ID"),
    "CORRECTION_CANCELLATION_NOT_FOUND",
    "請求訂正の取消取引が作成されませんでした。"
  );
  var expectedCancellationBody = {
    totalExTax: expectedCancellation.totalExTax,
    totalTax: expectedCancellation.totalTax,
    totalInclTax: expectedCancellation.totalInclTax,
    taxGroups: expectedCancellation.taxGroups
  };
  var actualCancellationBody = {
    totalExTax: cancellation.totalExTax,
    totalTax: cancellation.totalTax,
    totalInclTax: cancellation.totalInclTax,
    taxGroups: cancellation.taxGroups
  };
  if (cancellation.invoiceId !== originalInvoice.id ||
      cancellation.kind !== FINANCE_CREDIT_KIND.REVERSAL ||
      cancellation.effect !== "BILLING_REDUCTION" ||
      cancellation.direction !== -1 ||
      financeStableStringify_(actualCancellationBody) !==
        financeStableStringify_(expectedCancellationBody)) {
    financeFail_(
      "CORRECTION_NOT_FULL_REVERSAL",
      "請求訂正の取消額が、訂正元請求の有効な請求残額全額と一致しません。"
    );
  }
  if (financeInvoicePosition_(reversed, originalInvoice.id).effectiveBilled !== 0) {
    financeFail_(
      "CORRECTION_ORIGINAL_BALANCE_REMAINS",
      "請求訂正後も元請求の有効残高が残るため、訂正版の発行を中止しました。"
    );
  }
  var replacementInvoice = financeClone_(input.replacementInvoice || {});
  replacementInvoice.correctionOfInvoiceId = originalInvoice.id;
  var withDraft = financeCreateDraftInvoice_(
    reversed, replacementInvoice, context
  );
  var issued = financeIssueInvoice_(
    withDraft,
    replacementInvoice.id,
    input.replacementIssue,
    context
  );
  financeAssertUnchangedOriginal_(before, issued, originalInvoice.id);
  if (financeInvoicePosition_(issued, originalInvoice.id).effectiveBilled !== 0) {
    financeFail_(
      "CORRECTION_ORIGINAL_BALANCE_REMAINS",
      "訂正版発行後に元請求の有効残高が復元されたため、訂正処理を中止しました。"
    );
  }
  // A correction is one business command.  The helper calls above each use the
  // normal mutation primitive (and therefore increment revision), but exposing
  // those intermediate revisions would make one approval produce three ledger
  // snapshots.  Collapse them into one atomic state transition for the store's
  // optimistic-concurrency and append-only snapshot contract.
  issued.revision = before.revision + 1;
  financeValidateState_(issued);
  return issued;
}

function financeReverseCreditNote_(state, reversalInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = reversalInput || {};
  var original = financeFindRequired_(next.credit_notes, input.originalCreditNoteId,
    "CREDIT_NOTE_NOT_FOUND", "取消・訂正取引が見つかりません。");
  if (financeHasReversal_(next.credit_notes, "reversalOfCreditNoteId", original.id)) {
    financeFail_("ALREADY_REVERSED", "この取消・訂正取引はすでに反対取引で訂正されています。");
  }
  var id = financeRequiredText_(input.id, "反対取引ID");
  financeAssertUniqueId_(next.credit_notes, id, "DUPLICATE_CREDIT_NOTE_ID");
  var creditNoteNo = financeRequiredText_(input.creditNoteNo, "反対取引番号");
  financeAssertUniqueCreditNo_(next, creditNoteNo);
  var accountingDate = financeRequiredDate_(input.accountingDate, "計上日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var meta = financeContext_(context);
  var reverse = financeClone_(original);
  delete reverse.immutableKey;
  reverse.id = id;
  reverse.creditNoteNo = creditNoteNo;
  reverse.kind = FINANCE_CREDIT_KIND.REVERSE_CREDIT;
  reverse.direction = original.direction * -1;
  reverse.accountingDate = accountingDate;
  reverse.reason = financeRequiredText_(input.reason, "訂正理由");
  reverse.reversalOfCreditNoteId = original.id;
  reverse.createdAt = meta.at;
  reverse.createdBy = meta.actorId;
  financeSealRecord_(reverse);
  next.credit_notes.push(reverse);
  var journal = financeCreditJournal_(next, reverse, journalEntryId, meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeRecordReceipt_(state, receiptInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = receiptInput || {};
  var id = financeRequiredText_(input.id, "入金ID");
  financeAssertUniqueId_(next.payments, id, "DUPLICATE_PAYMENT_ID");
  var accountingDate = financeRequiredDate_(input.accountingDate || input.paymentDate, "入金日");
  financeAssertDateOpen_(next, accountingDate);
  var amount = financePositiveAmount_(input.amount, "入金額");
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var meta = financeContext_(context);
  var payment = {
    id: id,
    customerId: financeRequiredText_(input.customerId, "対象者ID"),
    kind: FINANCE_PAYMENT_KIND.RECEIPT,
    accountingDate: accountingDate,
    amount: amount,
    method: financeRequiredText_(input.method, "入金方法"),
    reference: financeOptionalText_(input.reference),
    reversalOfPaymentId: "",
    refundSources: [],
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(payment);
  next.payments.push(payment);
  var journal = financeSimpleJournal_(journalEntryId, accountingDate, "入金 " + id, "PAYMENT", id, [
    financeJournalLine_("D", next.companyPolicy.accounts.bank, amount, "入金"),
    financeJournalLine_("C", next.companyPolicy.accounts.customerDeposits, amount, "未消込入金")
  ], meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeAllocateReceipt_(state, allocationInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = allocationInput || {};
  var payment = financeFindRequired_(next.payments, input.paymentId,
    "PAYMENT_NOT_FOUND", "入金が見つかりません。");
  if (payment.kind !== FINANCE_PAYMENT_KIND.RECEIPT) {
    financeFail_("PAYMENT_NOT_RECEIPT", "返金取引は請求へ消し込めません。");
  }
  var accountingDate = financeRequiredDate_(input.accountingDate, "消込日");
  financeAssertDateOpen_(next, accountingDate);
  var rows = input.allocations || [];
  if (!rows.length) financeFail_("ALLOCATIONS_REQUIRED", "消込明細が必要です。");
  var paymentRemaining = financeReceiptUnallocated_(next, payment.id);
  var total = 0;
  var invoiceRequested = {};
  var normalized = [];
  var index;
  for (index = 0; index < rows.length; index += 1) {
    var raw = rows[index] || {};
    var id = financeRequiredText_(raw.id, "消込ID");
    financeAssertUniqueId_(next.payment_allocations, id, "DUPLICATE_ALLOCATION_ID");
    if (normalized.some(function (row) { return row.id === id; })) {
      financeFail_("DUPLICATE_ALLOCATION_ID", "同じ消込IDが指定されています: " + id);
    }
    var invoice = financeFindIssuedInvoice_(next, raw.invoiceId);
    if (invoice.customerId !== payment.customerId) {
      financeFail_("CUSTOMER_MISMATCH", "入金と請求の対象者が一致しません。");
    }
    var amount = financePositiveAmount_(raw.amount, "消込額");
    total += amount;
    invoiceRequested[invoice.id] = (invoiceRequested[invoice.id] || 0) + amount;
    normalized.push({ id: id, invoice: invoice, amount: amount });
  }
  if (total > paymentRemaining) {
    financeFail_("PAYMENT_ALLOCATION_EXCEEDS_RECEIPT", "入金の未消込額を超えています。");
  }
  var invoiceId;
  for (invoiceId in invoiceRequested) {
    if (Object.prototype.hasOwnProperty.call(invoiceRequested, invoiceId)) {
      var position = financeInvoicePosition_(next, invoiceId);
      if (invoiceRequested[invoiceId] > position.outstanding) {
        financeFail_("PAYMENT_ALLOCATION_EXCEEDS_OUTSTANDING", "請求残高を超える消込はできません。過入金は未消込で保持してください。");
      }
    }
  }
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var meta = financeContext_(context);
  for (index = 0; index < normalized.length; index += 1) {
    var allocation = {
      id: normalized[index].id,
      paymentId: payment.id,
      invoiceId: normalized[index].invoice.id,
      customerId: payment.customerId,
      amount: normalized[index].amount,
      direction: 1,
      accountingDate: accountingDate,
      reversalOfAllocationId: "",
      createdAt: meta.at,
      createdBy: meta.actorId
    };
    financeSealRecord_(allocation);
    next.payment_allocations.push(allocation);
  }
  var journal = financeSimpleJournal_(journalEntryId, accountingDate, "入金消込 " + payment.id,
    "PAYMENT_ALLOCATION", payment.id, [
      financeJournalLine_("D", next.companyPolicy.accounts.customerDeposits, total, "未消込入金の振替"),
      financeJournalLine_("C", next.companyPolicy.accounts.accountsReceivable, total, "売掛金消込")
    ], meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeReverseAllocation_(state, reversalInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = reversalInput || {};
  var original = financeFindRequired_(next.payment_allocations, input.originalAllocationId,
    "ALLOCATION_NOT_FOUND", "消込が見つかりません。");
  if (original.direction !== 1) financeFail_("INVALID_REVERSAL_TARGET", "元の正の消込を指定してください。");
  if (financeHasReversal_(next.payment_allocations, "reversalOfAllocationId", original.id)) {
    financeFail_("ALREADY_REVERSED", "この消込はすでに反対取引で訂正されています。");
  }
  var id = financeRequiredText_(input.id, "反対消込ID");
  financeAssertUniqueId_(next.payment_allocations, id, "DUPLICATE_ALLOCATION_ID");
  var accountingDate = financeRequiredDate_(input.accountingDate, "訂正日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var meta = financeContext_(context);
  var reverse = {
    id: id,
    paymentId: original.paymentId,
    invoiceId: original.invoiceId,
    customerId: original.customerId,
    amount: original.amount,
    direction: -1,
    accountingDate: accountingDate,
    reversalOfAllocationId: original.id,
    reason: financeRequiredText_(input.reason, "訂正理由"),
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(reverse);
  next.payment_allocations.push(reverse);
  var journal = financeSimpleJournal_(journalEntryId, accountingDate, "入金消込訂正 " + original.id,
    "PAYMENT_ALLOCATION_REVERSAL", reverse.id, [
      financeJournalLine_("D", next.companyPolicy.accounts.accountsReceivable, original.amount, "売掛金消込の取消"),
      financeJournalLine_("C", next.companyPolicy.accounts.customerDeposits, original.amount, "未消込入金へ戻す")
    ], meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeRecordRefund_(state, refundInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = refundInput || {};
  var id = financeRequiredText_(input.id, "返金ID");
  financeAssertUniqueId_(next.payments, id, "DUPLICATE_PAYMENT_ID");
  var customerId = financeRequiredText_(input.customerId, "対象者ID");
  var amount = financePositiveAmount_(input.amount, "返金額");
  var position = financeCustomerPosition_(next, customerId);
  if (amount > position.refundableCredit) {
    financeFail_("REFUND_EXCEEDS_CUSTOMER_CREDIT", "返金可能額を超えています。");
  }
  var accountingDate = financeRequiredDate_(input.accountingDate || input.paymentDate, "返金日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var referenceNo = financeRequiredText_(input.referenceNo, "返金管理番号");
  financeAssertUniqueRefundReferenceNo_(next, referenceNo);
  if (financeOptionalText_(input.reversalOfPaymentId)) {
    financeFail_(
      "PAYMENT_REVERSAL_UNSUPPORTED",
      "入金・返金の直接反転は未対応です。元取引IDだけを指定する訂正は会計残高を壊すため登録できません。"
    );
  }
  var sources = financeSelectRefundSources_(next, customerId, amount);
  var depositAmount = 0;
  var receivableAmount = 0;
  var index;
  for (index = 0; index < sources.length; index += 1) {
    if (sources[index].sourceType === "UNALLOCATED_RECEIPT") depositAmount += sources[index].amount;
    else receivableAmount += sources[index].amount;
  }
  var meta = financeContext_(context);
  var refund = {
    id: id,
    customerId: customerId,
    kind: FINANCE_PAYMENT_KIND.REFUND,
    accountingDate: accountingDate,
    amount: amount,
    method: financeRequiredText_(input.method, "返金方法"),
    referenceNo: referenceNo,
    reference: financeOptionalText_(input.reference),
    reversalOfPaymentId: "",
    refundSources: sources,
    reason: financeRequiredText_(input.reason, "返金理由"),
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(refund);
  next.payments.push(refund);
  var lines = [];
  if (depositAmount) {
    lines.push(financeJournalLine_("D", next.companyPolicy.accounts.customerDeposits, depositAmount, "未消込入金の返金"));
  }
  if (receivableAmount) {
    lines.push(financeJournalLine_("D", next.companyPolicy.accounts.accountsReceivable, receivableAmount, "過消込・請求減額分の返金"));
  }
  lines.push(financeJournalLine_("C", next.companyPolicy.accounts.bank, amount, "返金"));
  var journal = financeSimpleJournal_(journalEntryId, accountingDate, "返金 " + id, "REFUND", id, lines, meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

/**
 * 入出金の訂正は元行を更新せず、元取引と元仕訳へリンクした反対行を追加する。
 * 金額・対象者・方法・参照情報はサーバー上の元行からのみ継承し、入力値での
 * 上書きを許さない。
 */
function financeReverseReceipt_(state, reversalInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = reversalInput || {};
  financeAssertOnlyReversalFields_(input, {
    id: true,
    originalPaymentId: true,
    accountingDate: true,
    reason: true,
    journalEntryId: true
  });
  var original = financeFindRequired_(next.payments,
    financeRequiredText_(input.originalPaymentId, "元入金ID"),
    "PAYMENT_NOT_FOUND", "訂正対象の入金が見つかりません。");
  if (original.kind !== FINANCE_PAYMENT_KIND.RECEIPT ||
      financeOptionalText_(original.reversalOfPaymentId)) {
    financeFail_("INVALID_REVERSAL_TARGET", "元の正の入金取引だけを訂正できます。");
  }
  if (financeHasReversal_(next.payments, "reversalOfPaymentId", original.id)) {
    financeFail_("ALREADY_REVERSED", "この入金はすでに反対取引で訂正されています。");
  }
  if (financeReceiptAllocated_(next, original.id) !== 0) {
    financeFail_(
      "RECEIPT_REVERSAL_ALLOCATION_REMAINS",
      "入金消込が残っています。先に各消込を反対消込で全額戻してください。"
    );
  }
  if (financeRefundedFromSource_(next, "UNALLOCATED_RECEIPT", original.id) !== 0) {
    financeFail_(
      "RECEIPT_REVERSAL_REFUND_REMAINS",
      "この入金を返金元とする返金が残っています。先に返金を反対取引で戻してください。"
    );
  }
  var id = financeRequiredText_(input.id, "反対入金ID");
  financeAssertUniqueId_(next.payments, id, "DUPLICATE_PAYMENT_ID");
  var accountingDate = financeRequiredDate_(input.accountingDate, "反対取引日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "反対仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var originalJournal = financeFindUniqueSourceJournal_(
    next, "PAYMENT", original.id, "元入金仕訳"
  );
  var meta = financeContext_(context);
  var reverse = {
    id: id,
    customerId: original.customerId,
    kind: FINANCE_PAYMENT_KIND.REVERSE_RECEIPT,
    accountingDate: accountingDate,
    amount: original.amount,
    method: original.method,
    reference: financeOptionalText_(original.reference),
    reversalOfPaymentId: original.id,
    refundSources: [],
    reason: financeRequiredText_(input.reason, "訂正理由"),
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(reverse);
  next.payments.push(reverse);
  var journal = financeCreateLinkedReversalJournal_(
    originalJournal,
    journalEntryId,
    accountingDate,
    "入金訂正 " + original.id,
    "PAYMENT_REVERSAL",
    reverse.id,
    meta
  );
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeReverseRefund_(state, reversalInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = reversalInput || {};
  financeAssertOnlyReversalFields_(input, {
    id: true,
    originalPaymentId: true,
    accountingDate: true,
    reason: true,
    journalEntryId: true
  });
  var original = financeFindRequired_(next.payments,
    financeRequiredText_(input.originalPaymentId, "元返金ID"),
    "PAYMENT_NOT_FOUND", "訂正対象の返金が見つかりません。");
  if (original.kind !== FINANCE_PAYMENT_KIND.REFUND ||
      financeOptionalText_(original.reversalOfPaymentId)) {
    financeFail_("INVALID_REVERSAL_TARGET", "元の正の返金取引だけを訂正できます。");
  }
  if (financeHasReversal_(next.payments, "reversalOfPaymentId", original.id)) {
    financeFail_("ALREADY_REVERSED", "この返金はすでに反対取引で訂正されています。");
  }
  var id = financeRequiredText_(input.id, "反対返金ID");
  financeAssertUniqueId_(next.payments, id, "DUPLICATE_PAYMENT_ID");
  var accountingDate = financeRequiredDate_(input.accountingDate, "反対取引日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "反対仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var originalJournal = financeFindUniqueSourceJournal_(
    next, "REFUND", original.id, "元返金仕訳"
  );
  var meta = financeContext_(context);
  var reverse = {
    id: id,
    customerId: original.customerId,
    kind: FINANCE_PAYMENT_KIND.REVERSE_REFUND,
    accountingDate: accountingDate,
    amount: original.amount,
    method: original.method,
    referenceNo: financeDerivedReversalReference_(original.referenceNo, id),
    reference: financeOptionalText_(original.reference),
    reversalOfPaymentId: original.id,
    refundSources: financeClone_(original.refundSources),
    reason: financeRequiredText_(input.reason, "訂正理由"),
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(reverse);
  next.payments.push(reverse);
  var journal = financeCreateLinkedReversalJournal_(
    originalJournal,
    journalEntryId,
    accountingDate,
    "返金訂正 " + original.id,
    "REFUND_REVERSAL",
    reverse.id,
    meta
  );
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeRecordSettlement_(state, settlementInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = settlementInput || {};
  var invoice = financeFindIssuedInvoice_(next, input.invoiceId);
  var kind = String(input.kind || "");
  if (kind !== FINANCE_CREDIT_KIND.OFFSET && kind !== FINANCE_CREDIT_KIND.BAD_DEBT) {
    financeFail_("INVALID_SETTLEMENT_KIND", "非現金決済は相殺または貸倒で指定してください。");
  }
  var id = financeRequiredText_(input.id, "非現金決済ID");
  financeAssertUniqueId_(next.credit_notes, id, "DUPLICATE_CREDIT_NOTE_ID");
  var referenceNo = financeRequiredText_(input.referenceNo, "相殺・貸倒管理番号");
  financeAssertUniqueCreditNo_(next, referenceNo);
  var amount = financePositiveAmount_(input.amount, "決済額");
  var position = financeInvoicePosition_(next, invoice.id);
  if (amount > position.outstanding) {
    financeFail_("SETTLEMENT_EXCEEDS_OUTSTANDING", "請求残高を超える相殺・貸倒は登録できません。");
  }
  var accountingDate = financeRequiredDate_(input.accountingDate, "計上日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var meta = financeContext_(context);
  var settlement = {
    id: id,
    creditNoteNo: referenceNo,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    kind: kind,
    effect: "SETTLEMENT",
    direction: -1,
    accountingDate: accountingDate,
    reason: financeRequiredText_(input.reason, "相殺・貸倒理由"),
    pricingMode: "",
    taxRounding: "",
    taxGroups: [],
    totalExTax: 0,
    totalTax: 0,
    totalInclTax: amount,
    reversalOfCreditNoteId: "",
    counterReference: financeOptionalText_(input.counterReference),
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeSealRecord_(settlement);
  next.credit_notes.push(settlement);
  var debitAccount = kind === FINANCE_CREDIT_KIND.BAD_DEBT ?
    next.companyPolicy.accounts.badDebtExpense :
    financeOptionalText_(input.debitAccount) || next.companyPolicy.accounts.offsetClearing;
  var journal = financeSimpleJournal_(journalEntryId, accountingDate,
    (kind === FINANCE_CREDIT_KIND.BAD_DEBT ? "貸倒 " : "相殺 ") + id, "SETTLEMENT", id, [
      financeJournalLine_("D", debitAccount, amount, kind === FINANCE_CREDIT_KIND.BAD_DEBT ? "貸倒損失" : "相殺"),
      financeJournalLine_("C", next.companyPolicy.accounts.accountsReceivable, amount, "売掛金消込")
    ], meta);
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeReverseSettlement_(state, reversalInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = reversalInput || {};
  financeAssertOnlyReversalFields_(input, {
    id: true,
    originalSettlementId: true,
    accountingDate: true,
    reason: true,
    journalEntryId: true
  });
  var original = financeFindRequired_(next.credit_notes,
    financeRequiredText_(input.originalSettlementId, "元相殺・貸倒ID"),
    "SETTLEMENT_NOT_FOUND", "訂正対象の相殺・貸倒が見つかりません。");
  if ((original.kind !== FINANCE_CREDIT_KIND.OFFSET &&
       original.kind !== FINANCE_CREDIT_KIND.BAD_DEBT) ||
      original.effect !== "SETTLEMENT" || original.direction !== -1 ||
      financeOptionalText_(original.reversalOfCreditNoteId)) {
    financeFail_("INVALID_REVERSAL_TARGET", "元の正の相殺・貸倒取引だけを訂正できます。");
  }
  if (financeHasReversal_(next.credit_notes, "reversalOfCreditNoteId", original.id)) {
    financeFail_("ALREADY_REVERSED", "この相殺・貸倒はすでに反対取引で訂正されています。");
  }
  var id = financeRequiredText_(input.id, "反対相殺・貸倒ID");
  financeAssertUniqueId_(next.credit_notes, id, "DUPLICATE_CREDIT_NOTE_ID");
  var referenceNo = financeDerivedReversalReference_(original.creditNoteNo, id);
  financeAssertUniqueCreditNo_(next, referenceNo);
  var accountingDate = financeRequiredDate_(input.accountingDate, "反対取引日");
  financeAssertDateOpen_(next, accountingDate);
  var journalEntryId = financeRequiredText_(input.journalEntryId, "反対仕訳ID");
  financeAssertUniqueId_(next.journal_entries, journalEntryId, "DUPLICATE_JOURNAL_ID");
  var originalJournal = financeFindUniqueSourceJournal_(
    next, "SETTLEMENT", original.id, "元相殺・貸倒仕訳"
  );
  var meta = financeContext_(context);
  var reverse = financeClone_(original);
  delete reverse.immutableKey;
  reverse.id = id;
  reverse.creditNoteNo = referenceNo;
  reverse.kind = FINANCE_CREDIT_KIND.REVERSE_SETTLEMENT;
  reverse.direction = 1;
  reverse.accountingDate = accountingDate;
  reverse.reason = financeRequiredText_(input.reason, "訂正理由");
  reverse.reversalOfCreditNoteId = original.id;
  reverse.createdAt = meta.at;
  reverse.createdBy = meta.actorId;
  financeSealRecord_(reverse);
  next.credit_notes.push(reverse);
  var journal = financeCreateLinkedReversalJournal_(
    originalJournal,
    journalEntryId,
    accountingDate,
    "相殺・貸倒訂正 " + original.id,
    "SETTLEMENT_REVERSAL",
    reverse.id,
    meta
  );
  financeSealRecord_(journal);
  next.journal_entries.push(journal);
  return financeFinishMutation_(next);
}

function financeInvoicePosition_(state, invoiceId) {
  financeValidateStateShape_(state);
  var invoice = financeFindIssuedInvoice_(state, invoiceId);
  var billingReduction = 0;
  var settlement = 0;
  var index;
  for (index = 0; index < state.credit_notes.length; index += 1) {
    var credit = state.credit_notes[index];
    if (credit.invoiceId !== invoice.id) continue;
    var impact = credit.direction * credit.totalInclTax;
    if (credit.effect === "BILLING_REDUCTION") billingReduction += impact;
    else if (credit.effect === "SETTLEMENT") settlement += impact;
  }
  var effectiveBilled = invoice.totalInclTax + billingReduction;
  var nonCashSettled = settlement * -1;
  var cashAllocated = financeInvoiceAllocated_(state, invoice.id);
  var collectible = Math.max(0, effectiveBilled - nonCashSettled);
  var applied = Math.min(cashAllocated, collectible);
  var overappliedBeforeRefund = Math.max(0, cashAllocated - collectible);
  var refundedFromCredit = financeRefundedFromSource_(state, "INVOICE_CREDIT", invoice.id);
  if (refundedFromCredit > overappliedBeforeRefund) {
    financeFail_(
      "REFUND_SOURCE_OVERCONSUMED",
      "請求の過消込額を超えて返金済みです。返金後に元の消込・請求減額を変更できません。"
    );
  }
  var overapplied = overappliedBeforeRefund - refundedFromCredit;
  return {
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    originalBilled: invoice.totalInclTax,
    billingReduction: billingReduction * -1,
    effectiveBilled: effectiveBilled,
    nonCashSettled: nonCashSettled,
    cashAllocated: cashAllocated,
    applied: applied,
    overappliedBeforeRefund: overappliedBeforeRefund,
    refundedFromCredit: refundedFromCredit,
    overapplied: overapplied,
    outstanding: Math.max(0, collectible - cashAllocated)
  };
}

function financeCustomerPosition_(state, customerId) {
  financeValidateStateShape_(state);
  var id = financeRequiredText_(customerId, "対象者ID");
  var receipts = 0;
  var refunds = 0;
  var unallocatedBeforeRefund = 0;
  var unallocatedAvailable = 0;
  var invoiceCreditBeforeRefund = 0;
  var invoiceCreditAvailable = 0;
  var outstanding = 0;
  var index;
  for (index = 0; index < state.payments.length; index += 1) {
    var payment = state.payments[index];
    if (payment.customerId !== id) continue;
    if (payment.kind === FINANCE_PAYMENT_KIND.RECEIPT) {
      receipts += payment.amount;
      unallocatedBeforeRefund += financeReceiptUnallocatedBeforeRefund_(state, payment.id);
      unallocatedAvailable += financeReceiptUnallocated_(state, payment.id);
    } else if (payment.kind === FINANCE_PAYMENT_KIND.REVERSE_RECEIPT) {
      receipts -= payment.amount;
    } else if (payment.kind === FINANCE_PAYMENT_KIND.REFUND) {
      refunds += payment.amount;
    } else if (payment.kind === FINANCE_PAYMENT_KIND.REVERSE_REFUND) {
      refunds -= payment.amount;
    }
  }
  for (index = 0; index < state.invoices.length; index += 1) {
    var invoice = state.invoices[index];
    if (invoice.customerId !== id || invoice.status !== FINANCE_INVOICE_STATUS.ISSUED) continue;
    var position = financeInvoicePosition_(state, invoice.id);
    invoiceCreditBeforeRefund += position.overappliedBeforeRefund;
    invoiceCreditAvailable += position.overapplied;
    outstanding += position.outstanding;
  }
  var refundableCredit = unallocatedAvailable + invoiceCreditAvailable;
  return {
    customerId: id,
    receipts: receipts,
    refunds: refunds,
    unallocatedReceiptsBeforeRefund: unallocatedBeforeRefund,
    invoiceCreditBeforeRefund: invoiceCreditBeforeRefund,
    unallocatedReceipts: unallocatedAvailable,
    invoiceCredit: invoiceCreditAvailable,
    refundableCredit: refundableCredit,
    outstanding: outstanding
  };
}

function financeClosePeriod_(state, periodInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = periodInput || {};
  var id = financeRequiredText_(input.id, "締め期間ID");
  financeAssertUniqueId_(next.closing_periods, id, "DUPLICATE_CLOSING_PERIOD_ID");
  var startDate = financeRequiredDate_(input.startDate, "締め開始日");
  var endDate = financeRequiredDate_(input.endDate, "締め終了日");
  if (startDate > endDate) financeFail_("INVALID_CLOSING_PERIOD", "締め開始日は終了日以前にしてください。");
  var meta = financeContext_(context);
  if (endDate > meta.at.slice(0, 10)) {
    financeFail_("FUTURE_CLOSING_PERIOD_FORBIDDEN", "終了していない将来期間は会計締めできません。");
  }
  var index;
  for (index = 0; index < next.closing_periods.length; index += 1) {
    var period = next.closing_periods[index];
    if (!(endDate < period.startDate || startDate > period.endDate)) {
      financeFail_("OVERLAPPING_CLOSING_PERIOD", "締め期間が既存の締めと重複しています。");
    }
  }
  var closing = {
    id: id,
    startDate: startDate,
    endDate: endDate,
    reason: financeRequiredText_(input.reason, "締め理由"),
    closedAt: meta.at,
    closedBy: meta.actorId
  };
  financeSealRecord_(closing);
  next.closing_periods.push(closing);
  return financeFinishMutation_(next);
}

function financePostJournalEntry_(state, entryInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = financeClone_(entryInput || {});
  var requestedSourceType = financeOptionalText_(input.sourceType);
  if (requestedSourceType && requestedSourceType !== "MANUAL") {
    financeFail_(
      "MANUAL_JOURNAL_SOURCE_ONLY",
      "任意仕訳の発生元はMANUAL固定です。請求・入金等の発生元は専用取引からのみ作成してください。"
    );
  }
  var id = financeRequiredText_(input.id, "仕訳ID");
  financeAssertUniqueId_(next.journal_entries, id, "DUPLICATE_JOURNAL_ID");
  var accountingDate = financeRequiredDate_(input.accountingDate, "計上日");
  financeAssertDateOpen_(next, accountingDate);
  var meta = financeContext_(context);
  var entry = financeSimpleJournal_(id, accountingDate,
    financeRequiredText_(input.description, "仕訳摘要"),
    "MANUAL",
    financeOptionalText_(input.sourceId),
    input.lines || [], meta);
  financeValidateJournal_(entry);
  financeSealRecord_(entry);
  next.journal_entries.push(entry);
  return financeFinishMutation_(next);
}

function financeReverseJournalEntry_(state, reversalInput, context) {
  financeValidateState_(state);
  var next = financeClone_(state);
  var input = reversalInput || {};
  var original = financeFindRequired_(next.journal_entries, input.originalJournalEntryId,
    "JOURNAL_NOT_FOUND", "仕訳が見つかりません。");
  if (original.sourceType !== "MANUAL") {
    financeFail_(
      "SYSTEM_JOURNAL_REVERSAL_FORBIDDEN",
      "請求・入金・消込などから自動作成された仕訳は直接取り消せません。元取引の取消・訂正処理を使用してください。"
    );
  }
  if (financeHasReversal_(next.journal_entries, "reversalOfJournalEntryId", original.id)) {
    financeFail_("ALREADY_REVERSED", "この仕訳はすでに反対仕訳で訂正されています。");
  }
  var id = financeRequiredText_(input.id, "反対仕訳ID");
  financeAssertUniqueId_(next.journal_entries, id, "DUPLICATE_JOURNAL_ID");
  var accountingDate = financeRequiredDate_(input.accountingDate, "反対仕訳日");
  financeAssertDateOpen_(next, accountingDate);
  var meta = financeContext_(context);
  var lines = original.lines.map(function (line) {
    return {
      side: line.side === "D" ? "C" : "D",
      account: line.account,
      amount: line.amount,
      memo: "反対仕訳: " + line.memo
    };
  });
  var reverse = financeSimpleJournal_(id, accountingDate,
    financeRequiredText_(input.reason, "反対仕訳理由"),
    "JOURNAL_REVERSAL", original.id, lines, meta);
  reverse.reversalOfJournalEntryId = original.id;
  financeValidateJournal_(reverse);
  financeSealRecord_(reverse);
  next.journal_entries.push(reverse);
  return financeFinishMutation_(next);
}

function financeValidateState_(state) {
  financeValidateStateShape_(state);
  if (state.schemaVersion !== FINANCE_SCHEMA_VERSION) {
    financeFail_("SCHEMA_VERSION_MISMATCH", "会計データのバージョンが一致しません。移行処理が必要です。");
  }
  if (!financeIsInteger_(state.revision) || state.revision < 0) {
    financeFail_("INVALID_REVISION", "会計データのリビジョンが不正です。");
  }
  var normalizedPolicy = financeNormalizePolicy_(state.companyPolicy);
  if (financeHash_(normalizedPolicy) !== state.policyIntegrityKey) {
    financeFail_("POLICY_TAMPERED", "会社固定の会計設定が取引後に変更されています。");
  }
  financeAssertCollectionIds_(state.invoices, "請求");
  financeAssertCollectionIds_(state.invoice_lines, "請求明細");
  financeAssertCollectionIds_(state.payments, "入出金");
  financeAssertCollectionIds_(state.payment_allocations, "消込");
  financeAssertCollectionIds_(state.credit_notes, "取消・決済");
  financeAssertCollectionIds_(state.closing_periods, "締め期間");
  financeAssertCollectionIds_(state.journal_entries, "仕訳");
  financeAssertAllInvoiceNosUnique_(state);
  financeAssertAllCreditNosUnique_(state);
  financeAssertAllRefundReferenceNosUnique_(state);

  var invoiceById = {};
  var index;
  for (index = 0; index < state.invoices.length; index += 1) {
    invoiceById[state.invoices[index].id] = state.invoices[index];
  }
  for (index = 0; index < state.invoice_lines.length; index += 1) {
    if (!invoiceById[state.invoice_lines[index].invoiceId]) {
      financeFail_("ORPHAN_INVOICE_LINE", "請求に属さない明細があります。");
    }
  }
  for (index = 0; index < state.invoices.length; index += 1) {
    var invoice = state.invoices[index];
    if (invoice.status !== FINANCE_INVOICE_STATUS.DRAFT &&
        invoice.status !== FINANCE_INVOICE_STATUS.ISSUED) {
      financeFail_("INVALID_INVOICE_STATUS", "請求状態が不正です。");
    }
    financeAssertStoredBillingSnapshot_(invoice);
    if (invoice.status === FINANCE_INVOICE_STATUS.ISSUED) {
      if (invoice.taxRounding !== state.companyPolicy.taxRounding) {
        financeFail_("ROUNDING_POLICY_MISMATCH", "発行済請求の丸め方法が会社設定と一致しません。");
      }
      if (financeInvoiceIntegrityKey_(state, invoice) !== invoice.immutableKey) {
        financeFail_("ISSUED_INVOICE_TAMPERED", "発行済請求または明細が変更されています。取消・訂正取引を使用してください。");
      }
    }
  }
  for (index = 0; index < state.payments.length; index += 1) {
    financeValidateSealedRecord_(state.payments[index], "PAYMENT_TAMPERED", "入出金取引");
  }
  var reversedAllocationIds = {};
  for (index = 0; index < state.payment_allocations.length; index += 1) {
    var allocation = state.payment_allocations[index];
    financeValidateSealedRecord_(allocation, "ALLOCATION_TAMPERED", "消込取引");
    var allocationPayment = financeFindById_(state.payments, allocation.paymentId);
    var allocationInvoice = financeFindById_(state.invoices, allocation.invoiceId);
    if (!allocationPayment || !allocationInvoice) {
      financeFail_("ORPHAN_ALLOCATION", "入金または請求に属さない消込があります。");
    }
    if (allocationPayment.kind !== FINANCE_PAYMENT_KIND.RECEIPT ||
        allocationPayment.customerId !== allocation.customerId ||
        allocationInvoice.customerId !== allocation.customerId) {
      financeFail_("INVALID_ALLOCATION_LINK", "消込は同一対象者の入金と請求へだけ関連付けできます。");
    }
    financePositiveAmount_(allocation.amount, "消込額");
    if (allocation.direction === 1) {
      if (financeOptionalText_(allocation.reversalOfAllocationId)) {
        financeFail_("INVALID_ALLOCATION_REVERSAL", "正の消込に反対消込IDは設定できません。");
      }
    } else if (allocation.direction === -1) {
      var originalAllocationId = financeRequiredText_(allocation.reversalOfAllocationId, "反対消込の元ID");
      var originalAllocation = financeFindById_(state.payment_allocations, originalAllocationId);
      if (!originalAllocation || originalAllocation.direction !== 1 ||
          originalAllocation.paymentId !== allocation.paymentId ||
          originalAllocation.invoiceId !== allocation.invoiceId ||
          originalAllocation.customerId !== allocation.customerId ||
          originalAllocation.amount !== allocation.amount) {
        financeFail_("INVALID_ALLOCATION_REVERSAL", "反対消込が元の正の消込と一致しません。");
      }
      if (reversedAllocationIds[originalAllocationId]) {
        financeFail_("DUPLICATE_ALLOCATION_REVERSAL", "同じ消込が複数回反転されています。");
      }
      reversedAllocationIds[originalAllocationId] = true;
    } else {
      financeFail_("INVALID_ALLOCATION_DIRECTION", "消込の方向が不正です。");
    }
  }
  for (index = 0; index < state.credit_notes.length; index += 1) {
    var credit = state.credit_notes[index];
    financeValidateSealedRecord_(credit, "CREDIT_NOTE_TAMPERED", "取消・決済取引");
    if (!invoiceById[credit.invoiceId]) financeFail_("ORPHAN_CREDIT_NOTE", "請求に属さない取消・決済取引があります。");
  }
  financeValidateSettlementReversals_(state);
  financeValidatePaymentAndRefundSources_(state);
  for (index = 0; index < state.closing_periods.length; index += 1) {
    financeValidateSealedRecord_(state.closing_periods[index], "CLOSING_PERIOD_TAMPERED", "締め期間");
  }
  for (index = 0; index < state.journal_entries.length; index += 1) {
    financeValidateSealedRecord_(state.journal_entries[index], "JOURNAL_TAMPERED", "仕訳");
    financeValidateJournal_(state.journal_entries[index]);
  }
  financeValidateLinkedTransactionReversalJournals_(state);
  return true;
}

/*
 * backend_store 接続口。
 * adapter は loadSnapshot() と compareAndSwap(expectedRevision, nextState, auditMeta)
 * を実装する。compareAndSwap は競合時に false を返し、既存データを上書きしない。
 */
function financeCreateBackendStorePort_(adapter) {
  if (!adapter || typeof adapter.loadSnapshot !== "function" ||
      typeof adapter.compareAndSwap !== "function") {
    financeFail_("INVALID_STORE_ADAPTER", "保存アダプターには loadSnapshot と compareAndSwap が必要です。");
  }
  return {
    loadSnapshot: function () {
      var loaded = adapter.loadSnapshot();
      financeValidateState_(loaded);
      return financeClone_(loaded);
    },
    compareAndSwap: function (expectedRevision, nextState, auditMeta) {
      financeValidateState_(nextState);
      return adapter.compareAndSwap(expectedRevision, financeClone_(nextState), financeClone_(auditMeta));
    }
  };
}

function financeExecuteWithStore_(storePort, expectedRevision, command, context) {
  if (!storePort || typeof storePort.loadSnapshot !== "function" ||
      typeof storePort.compareAndSwap !== "function") {
    financeFail_("INVALID_STORE_PORT", "会計保存ポートが不正です。");
  }
  var current = storePort.loadSnapshot();
  if (current.revision !== expectedRevision) {
    financeFail_("CONCURRENT_MODIFICATION", "別の担当者が先に更新しました。再読込してからやり直してください。");
  }
  var next = financeApplyCommand_(current, command, context);
  var meta = financeContext_(context);
  var committed = storePort.compareAndSwap(expectedRevision, next, {
    commandType: command && command.type,
    actorId: meta.actorId,
    at: meta.at,
    fromRevision: expectedRevision,
    toRevision: next.revision
  });
  if (!committed) {
    financeFail_("CONCURRENT_MODIFICATION", "保存直前に別の更新を検出しました。既存データは上書きしていません。");
  }
  return next;
}

function financeApplyCommand_(state, command, context) {
  var input = command || {};
  switch (input.type) {
    case "CREATE_DRAFT_INVOICE":
      return financeCreateDraftInvoice_(state, input.data, context);
    case "UPDATE_DRAFT_INVOICE":
      return financeUpdateDraftInvoice_(state, input.invoiceId, input.data, context);
    case "ISSUE_INVOICE":
      return financeIssueInvoice_(state, input.invoiceId, input.data, context);
    case "CREATE_CREDIT_NOTE":
      return financeCreateCreditNote_(state, input.data, context);
    case "REVERSE_INVOICE":
      return financeReverseInvoice_(state, input.data, context);
    case "CORRECT_INVOICE":
      return financeCorrectInvoice_(state, input.data, context);
    case "REVERSE_CREDIT_NOTE":
      return financeReverseCreditNote_(state, input.data, context);
    case "RECORD_RECEIPT":
      return financeRecordReceipt_(state, input.data, context);
    case "REVERSE_RECEIPT":
      return financeReverseReceipt_(state, input.data, context);
    case "ALLOCATE_RECEIPT":
      return financeAllocateReceipt_(state, input.data, context);
    case "REVERSE_ALLOCATION":
      return financeReverseAllocation_(state, input.data, context);
    case "RECORD_REFUND":
      return financeRecordRefund_(state, input.data, context);
    case "REVERSE_REFUND":
      return financeReverseRefund_(state, input.data, context);
    case "RECORD_SETTLEMENT":
      return financeRecordSettlement_(state, input.data, context);
    case "REVERSE_SETTLEMENT":
      return financeReverseSettlement_(state, input.data, context);
    case "CLOSE_PERIOD":
      return financeClosePeriod_(state, input.data, context);
    case "POST_JOURNAL":
      return financePostJournalEntry_(state, input.data, context);
    case "REVERSE_JOURNAL":
      return financeReverseJournalEntry_(state, input.data, context);
    default:
      financeFail_("UNKNOWN_FINANCE_COMMAND", "未対応の会計操作です。");
  }
}

function financeNormalizePolicy_(input) {
  var rounding = String(input.taxRounding || FINANCE_ROUNDING.FLOOR);
  if (!FINANCE_ROUNDING[rounding]) {
    financeFail_("INVALID_ROUNDING_POLICY", "会社の消費税丸め方法が不正です。");
  }
  var accounts = {};
  var key;
  for (key in FINANCE_DEFAULT_ACCOUNTS) {
    if (Object.prototype.hasOwnProperty.call(FINANCE_DEFAULT_ACCOUNTS, key)) {
      accounts[key] = financeRequiredText_((input.accounts || {})[key] || FINANCE_DEFAULT_ACCOUNTS[key], "勘定科目");
    }
  }
  return {
    currency: "JPY",
    taxRounding: rounding,
    accounts: accounts
  };
}

function financeNormalizeTaxEvidence_(taxCategory, evidenceInput) {
  if (taxCategory === FINANCE_TAX_CATEGORY.TAXABLE_10) return null;
  var evidence = evidenceInput || {};
  if (!evidenceInput || typeof evidenceInput !== "object" || Array.isArray(evidenceInput)) {
    financeFail_("TAX_EVIDENCE_REQUIRED",
      "8%・非課税・不課税・対象外の税区分には根拠資料と承認記録が必要です。");
  }
  return {
    reference: financeRequiredText_(evidence.reference, "税区分の根拠資料"),
    reason: financeRequiredText_(evidence.reason, "税区分の適用理由"),
    approvedBy: financeRequiredText_(evidence.approvedBy, "税区分の承認者"),
    approvedDate: financeRequiredDate_(evidence.approvedDate, "税区分の承認日")
  };
}

function financeAssertDraftCalculationConsistent_(state, invoice) {
  var lines = state.invoice_lines.filter(function (line) {
    return line.invoiceId === invoice.id;
  });
  var calculation = financeCalculateInvoice_({
    pricingMode: invoice.pricingMode,
    taxRounding: invoice.taxRounding,
    lines: lines
  }, state.companyPolicy);
  var saved = {
    totalExTax: invoice.totalExTax,
    totalTax: invoice.totalTax,
    totalInclTax: invoice.totalInclTax,
    taxGroups: invoice.taxGroups
  };
  var recalculated = {
    totalExTax: calculation.totalExTax,
    totalTax: calculation.totalTax,
    totalInclTax: calculation.totalInclTax,
    taxGroups: calculation.taxGroups
  };
  if (financeStableStringify_(saved) !== financeStableStringify_(recalculated)) {
    financeFail_("DRAFT_TOTAL_MISMATCH",
      "請求下書きの明細と合計が一致しません。発行せず、下書きを再保存してください。");
  }
}

function financeInvoiceJournal_(state, invoice, journalEntryId, meta) {
  var lines = [
    financeJournalLine_("D", state.companyPolicy.accounts.accountsReceivable,
      invoice.totalInclTax, "請求 " + invoice.invoiceNo)
  ];
  var index;
  for (index = 0; index < invoice.taxGroups.length; index += 1) {
    var group = invoice.taxGroups[index];
    var definition = FINANCE_TAX_DEFINITIONS[group.taxCategory];
    if (group.baseExTax) {
      lines.push(financeJournalLine_("C",
        state.companyPolicy.accounts[definition.revenueAccountKey],
        group.baseExTax, definition.label + " 売上"));
    }
    if (group.tax) {
      lines.push(financeJournalLine_("C", state.companyPolicy.accounts.taxPayable,
        group.tax, definition.label + " 消費税"));
    }
  }
  return financeSimpleJournal_(journalEntryId, invoice.accountingDate,
    "請求発行 " + invoice.invoiceNo, "INVOICE", invoice.id, lines, meta);
}

function financeCreditJournal_(state, credit, journalEntryId, meta) {
  var lines = [];
  var reducing = credit.direction === -1;
  if (credit.effect === "SETTLEMENT") {
    financeFail_("INVALID_CREDIT_JOURNAL", "非現金決済は専用仕訳を使用してください。");
  }
  var index;
  for (index = 0; index < credit.taxGroups.length; index += 1) {
    var group = credit.taxGroups[index];
    var definition = FINANCE_TAX_DEFINITIONS[group.taxCategory];
    if (group.baseExTax) {
      lines.push(financeJournalLine_(reducing ? "D" : "C",
        state.companyPolicy.accounts[definition.revenueAccountKey],
        group.baseExTax, definition.label + " 売上の" + (reducing ? "減額" : "復元")));
    }
    if (group.tax) {
      lines.push(financeJournalLine_(reducing ? "D" : "C",
        state.companyPolicy.accounts.taxPayable,
        group.tax, definition.label + " 消費税の" + (reducing ? "減額" : "復元")));
    }
  }
  lines.push(financeJournalLine_(reducing ? "C" : "D",
    state.companyPolicy.accounts.accountsReceivable,
    credit.totalInclTax, "売掛金の" + (reducing ? "減額" : "復元")));
  return financeSimpleJournal_(journalEntryId, credit.accountingDate,
    "請求の取消・訂正 " + credit.creditNoteNo, "CREDIT_NOTE", credit.id, lines, meta);
}

function financeSimpleJournal_(id, accountingDate, description, sourceType, sourceId, lines, meta) {
  var normalizedLines = [];
  var index;
  for (index = 0; index < lines.length; index += 1) {
    var line = lines[index] || {};
    normalizedLines.push({
      side: String(line.side || ""),
      account: financeRequiredText_(line.account, "勘定科目"),
      amount: financePositiveAmount_(line.amount, "仕訳金額"),
      memo: financeOptionalText_(line.memo)
    });
  }
  var entry = {
    id: id,
    accountingDate: accountingDate,
    description: description,
    sourceType: sourceType,
    sourceId: sourceId,
    reversalOfJournalEntryId: "",
    lines: normalizedLines,
    createdAt: meta.at,
    createdBy: meta.actorId
  };
  financeValidateJournal_(entry);
  return entry;
}

function financeCreateLinkedReversalJournal_(
  originalJournal, id, accountingDate, description, sourceType, sourceId, meta
) {
  var entry = financeSimpleJournal_(
    id,
    accountingDate,
    description,
    sourceType,
    sourceId,
    financeReversedJournalLines_(originalJournal),
    meta
  );
  entry.reversalOfJournalEntryId = originalJournal.id;
  financeValidateJournal_(entry);
  return entry;
}

function financeReversedJournalLines_(originalJournal) {
  return (originalJournal.lines || []).map(function (line) {
    return {
      side: line.side === "D" ? "C" : "D",
      account: line.account,
      amount: line.amount,
      memo: "反対仕訳: " + financeOptionalText_(line.memo)
    };
  });
}

function financeFindUniqueSourceJournal_(state, sourceType, sourceId, label) {
  var matches = [];
  var index;
  for (index = 0; index < state.journal_entries.length; index += 1) {
    var journal = state.journal_entries[index];
    if (journal.sourceType === sourceType && journal.sourceId === sourceId) {
      matches.push(journal);
    }
  }
  if (matches.length !== 1) {
    financeFail_(
      "SOURCE_JOURNAL_LINK_INVALID",
      (label || "元取引仕訳") + "が一意に確認できないため、反対取引を登録できません。"
    );
  }
  return matches[0];
}

function financeValidateLinkedTransactionReversalJournals_(state) {
  var index;
  for (index = 0; index < state.payments.length; index += 1) {
    var payment = state.payments[index];
    if (payment.kind !== FINANCE_PAYMENT_KIND.REVERSE_RECEIPT &&
        payment.kind !== FINANCE_PAYMENT_KIND.REVERSE_REFUND) continue;
    var originalPayment = financeFindById_(state.payments, payment.reversalOfPaymentId);
    var originalSourceType = payment.kind === FINANCE_PAYMENT_KIND.REVERSE_RECEIPT ?
      "PAYMENT" : "REFUND";
    var reversalSourceType = payment.kind === FINANCE_PAYMENT_KIND.REVERSE_RECEIPT ?
      "PAYMENT_REVERSAL" : "REFUND_REVERSAL";
    var originalPaymentJournal = financeFindUniqueSourceJournal_(
      state, originalSourceType, originalPayment.id, "元入出金仕訳"
    );
    var paymentReversalJournal = financeFindUniqueSourceJournal_(
      state, reversalSourceType, payment.id, "反対入出金仕訳"
    );
    financeAssertLinkedReversalJournalMatches_(
      paymentReversalJournal, originalPaymentJournal, payment.accountingDate
    );
  }
  for (index = 0; index < state.credit_notes.length; index += 1) {
    var settlement = state.credit_notes[index];
    if (settlement.kind !== FINANCE_CREDIT_KIND.REVERSE_SETTLEMENT) continue;
    var originalSettlement = financeFindById_(
      state.credit_notes, settlement.reversalOfCreditNoteId
    );
    var originalSettlementJournal = financeFindUniqueSourceJournal_(
      state, "SETTLEMENT", originalSettlement.id, "元相殺・貸倒仕訳"
    );
    var settlementReversalJournal = financeFindUniqueSourceJournal_(
      state, "SETTLEMENT_REVERSAL", settlement.id, "反対相殺・貸倒仕訳"
    );
    financeAssertLinkedReversalJournalMatches_(
      settlementReversalJournal, originalSettlementJournal, settlement.accountingDate
    );
  }
}

function financeAssertLinkedReversalJournalMatches_(
  reversalJournal, originalJournal, accountingDate
) {
  if (reversalJournal.reversalOfJournalEntryId !== originalJournal.id ||
      reversalJournal.accountingDate !== accountingDate ||
      financeStableStringify_(reversalJournal.lines) !==
        financeStableStringify_(financeReversedJournalLines_(originalJournal))) {
    financeFail_(
      "INVALID_LINKED_REVERSAL_JOURNAL",
      "反対仕訳が元仕訳の借方・貸方・金額・勘定科目と一致しません。"
    );
  }
}

function financeJournalLine_(side, account, amount, memo) {
  return { side: side, account: account, amount: amount, memo: memo };
}

function financeValidateJournal_(entry) {
  if (!entry.lines || entry.lines.length < 2) {
    financeFail_("JOURNAL_LINES_REQUIRED", "仕訳は借方・貸方の2行以上が必要です。");
  }
  var debit = 0;
  var credit = 0;
  var index;
  for (index = 0; index < entry.lines.length; index += 1) {
    var line = entry.lines[index];
    if (line.side !== "D" && line.side !== "C") {
      financeFail_("INVALID_JOURNAL_SIDE", "仕訳区分は借方または貸方で指定してください。");
    }
    financePositiveAmount_(line.amount, "仕訳金額");
    if (line.side === "D") debit += line.amount;
    else credit += line.amount;
  }
  if (debit !== credit) {
    financeFail_("UNBALANCED_JOURNAL", "借方合計と貸方合計が一致しません。");
  }
  return true;
}

function financeRemainingBillingCalculation_(state, invoice) {
  var groups = {};
  var index;
  for (index = 0; index < invoice.taxGroups.length; index += 1) {
    var original = invoice.taxGroups[index];
    groups[original.taxCategory] = {
      taxCategory: original.taxCategory,
      label: original.label,
      rateBps: original.rateBps,
      enteredAmount: original.enteredAmount,
      baseExTax: original.baseExTax,
      tax: original.tax,
      totalInclTax: original.totalInclTax
    };
  }
  for (index = 0; index < state.credit_notes.length; index += 1) {
    var credit = state.credit_notes[index];
    if (credit.invoiceId !== invoice.id || credit.effect !== "BILLING_REDUCTION") continue;
    var groupIndex;
    for (groupIndex = 0; groupIndex < credit.taxGroups.length; groupIndex += 1) {
      var reduction = credit.taxGroups[groupIndex];
      var target = groups[reduction.taxCategory];
      if (!target) financeFail_("CREDIT_TAX_GROUP_MISMATCH", "元請求にない税区分の訂正があります。");
      target.baseExTax += credit.direction * reduction.baseExTax;
      target.tax += credit.direction * reduction.tax;
      target.totalInclTax += credit.direction * reduction.totalInclTax;
      target.enteredAmount = invoice.pricingMode === FINANCE_PRICING_MODE.EXCLUSIVE ?
        target.baseExTax : target.totalInclTax;
    }
  }
  var resultGroups = [];
  var totalExTax = 0;
  var totalTax = 0;
  var totalInclTax = 0;
  var order = [
    FINANCE_TAX_CATEGORY.TAXABLE_10, FINANCE_TAX_CATEGORY.TAXABLE_8,
    FINANCE_TAX_CATEGORY.EXEMPT, FINANCE_TAX_CATEGORY.NON_TAXABLE,
    FINANCE_TAX_CATEGORY.OUT_OF_SCOPE
  ];
  for (index = 0; index < order.length; index += 1) {
    if (!groups[order[index]]) continue;
    var group = groups[order[index]];
    if (group.totalInclTax < 0 || group.baseExTax < 0 || group.tax < 0) {
      financeFail_("CREDIT_EXCEEDS_INVOICE", "取消・訂正額が元請求を超えています。");
    }
    if (!group.totalInclTax && !group.baseExTax && !group.tax) continue;
    resultGroups.push(group);
    totalExTax += group.baseExTax;
    totalTax += group.tax;
    totalInclTax += group.totalInclTax;
  }
  if (!totalInclTax) financeFail_("INVOICE_ALREADY_FULLY_REVERSED", "請求はすでに全額取消済みです。");
  return {
    pricingMode: invoice.pricingMode,
    taxRounding: invoice.taxRounding,
    lines: [],
    taxGroups: resultGroups,
    totalExTax: totalExTax,
    totalTax: totalTax,
    totalInclTax: totalInclTax
  };
}

function financeAssertCreditWithinRemaining_(state, invoice, calculation) {
  var remaining = financeRemainingBillingCalculation_(state, invoice);
  var remainingByCategory = {};
  var index;
  for (index = 0; index < remaining.taxGroups.length; index += 1) {
    remainingByCategory[remaining.taxGroups[index].taxCategory] = remaining.taxGroups[index];
  }
  for (index = 0; index < calculation.taxGroups.length; index += 1) {
    var group = calculation.taxGroups[index];
    var available = remainingByCategory[group.taxCategory];
    if (!available || group.baseExTax > available.baseExTax ||
        group.tax > available.tax || group.totalInclTax > available.totalInclTax) {
      financeFail_("CREDIT_EXCEEDS_INVOICE", "取消・訂正額が元請求の税区分別残額を超えています。");
    }
  }
}

function financeValidateSettlementReversals_(state) {
  var reversedSettlementIds = {};
  var index;
  for (index = 0; index < state.credit_notes.length; index += 1) {
    var row = state.credit_notes[index];
    if (row.kind === FINANCE_CREDIT_KIND.OFFSET ||
        row.kind === FINANCE_CREDIT_KIND.BAD_DEBT) {
      if (row.effect !== "SETTLEMENT" || row.direction !== -1 ||
          financeOptionalText_(row.reversalOfCreditNoteId) ||
          row.totalExTax !== 0 || row.totalTax !== 0 ||
          !Array.isArray(row.taxGroups) || row.taxGroups.length ||
          !financeIsInteger_(row.totalInclTax) || row.totalInclTax <= 0) {
        financeFail_("INVALID_SETTLEMENT_RECORD", "相殺・貸倒取引の会計属性が不正です。");
      }
      continue;
    }
    if (row.kind !== FINANCE_CREDIT_KIND.REVERSE_SETTLEMENT) {
      if (row.effect === "SETTLEMENT") {
        financeFail_("INVALID_SETTLEMENT_RECORD", "非現金決済の取引種別が不正です。");
      }
      continue;
    }
    var originalId = financeRequiredText_(
      row.reversalOfCreditNoteId, "反対相殺・貸倒の元取引ID"
    );
    var original = financeFindById_(state.credit_notes, originalId);
    if (!original ||
        (original.kind !== FINANCE_CREDIT_KIND.OFFSET &&
         original.kind !== FINANCE_CREDIT_KIND.BAD_DEBT) ||
        original.effect !== "SETTLEMENT" || original.direction !== -1 ||
        financeOptionalText_(original.reversalOfCreditNoteId)) {
      financeFail_("INVALID_SETTLEMENT_REVERSAL", "反対相殺・貸倒の元取引が一致しません。");
    }
    if (reversedSettlementIds[originalId]) {
      financeFail_("DUPLICATE_SETTLEMENT_REVERSAL", "同じ相殺・貸倒が複数回反転されています。");
    }
    reversedSettlementIds[originalId] = true;
    var expected = financeClone_(original);
    delete expected.immutableKey;
    expected.id = row.id;
    expected.creditNoteNo = financeDerivedReversalReference_(original.creditNoteNo, row.id);
    expected.kind = FINANCE_CREDIT_KIND.REVERSE_SETTLEMENT;
    expected.direction = 1;
    expected.accountingDate = row.accountingDate;
    expected.reason = row.reason;
    expected.reversalOfCreditNoteId = original.id;
    expected.createdAt = row.createdAt;
    expected.createdBy = row.createdBy;
    var actual = financeClone_(row);
    delete actual.immutableKey;
    if (financeStableStringify_(actual) !== financeStableStringify_(expected)) {
      financeFail_(
        "INVALID_SETTLEMENT_REVERSAL",
        "反対相殺・貸倒の金額・対象者・請求・元取引情報が元取引と一致しません。"
      );
    }
  }
}

function financeValidatePaymentAndRefundSources_(state) {
  var reversedPaymentIds = {};
  var index;
  for (index = 0; index < state.payments.length; index += 1) {
    var payment = state.payments[index];
    financeRequiredText_(payment.customerId, "入出金の対象者ID");
    financePositiveAmount_(payment.amount, "入出金額");
    if (payment.kind === FINANCE_PAYMENT_KIND.RECEIPT) {
      if (!Array.isArray(payment.refundSources) || payment.refundSources.length) {
        financeFail_("INVALID_RECEIPT_REFUND_SOURCES", "入金取引に返金元明細を設定できません。");
      }
      if (financeOptionalText_(payment.reversalOfPaymentId)) {
        financeFail_("INVALID_PAYMENT_REVERSAL", "正の入金取引に元取引IDは設定できません。");
      }
      continue;
    }
    if (payment.kind === FINANCE_PAYMENT_KIND.REFUND) {
      financeRequiredText_(payment.referenceNo, "返金管理番号");
      if (financeOptionalText_(payment.reversalOfPaymentId)) {
        financeFail_("INVALID_PAYMENT_REVERSAL", "正の返金取引に元取引IDは設定できません。");
      }
      financeValidateRefundSourcesForPayment_(state, payment);
      continue;
    }
    if (payment.kind !== FINANCE_PAYMENT_KIND.REVERSE_RECEIPT &&
        payment.kind !== FINANCE_PAYMENT_KIND.REVERSE_REFUND) {
      financeFail_("INVALID_PAYMENT_KIND", "入出金区分が不正です。");
    }
    var originalPaymentId = financeRequiredText_(
      payment.reversalOfPaymentId, "反対入出金の元取引ID"
    );
    var originalPayment = financeFindById_(state.payments, originalPaymentId);
    var expectedKind = payment.kind === FINANCE_PAYMENT_KIND.REVERSE_RECEIPT ?
      FINANCE_PAYMENT_KIND.RECEIPT : FINANCE_PAYMENT_KIND.REFUND;
    if (!originalPayment || originalPayment.kind !== expectedKind ||
        financeOptionalText_(originalPayment.reversalOfPaymentId)) {
      financeFail_("INVALID_PAYMENT_REVERSAL", "反対入出金の元取引が正の入金・返金と一致しません。");
    }
    if (reversedPaymentIds[originalPaymentId]) {
      financeFail_("DUPLICATE_PAYMENT_REVERSAL", "同じ入出金が複数回反転されています。");
    }
    reversedPaymentIds[originalPaymentId] = true;
    financeAssertPaymentReversalMatches_(payment, originalPayment);
    if (payment.kind === FINANCE_PAYMENT_KIND.REVERSE_REFUND) {
      financeValidateRefundSourcesForPayment_(state, payment);
    } else if (!Array.isArray(payment.refundSources) || payment.refundSources.length) {
      financeFail_("INVALID_RECEIPT_REFUND_SOURCES", "反対入金に返金元明細を設定できません。");
    }
  }
  for (index = 0; index < state.payments.length; index += 1) {
    if (state.payments[index].kind === FINANCE_PAYMENT_KIND.RECEIPT) {
      financeReceiptUnallocated_(state, state.payments[index].id);
    }
  }
  for (index = 0; index < state.invoices.length; index += 1) {
    if (state.invoices[index].status === FINANCE_INVOICE_STATUS.ISSUED) {
      financeInvoicePosition_(state, state.invoices[index].id);
    }
  }
}

function financeValidateRefundSourcesForPayment_(state, payment) {
  if (!Array.isArray(payment.refundSources) || !payment.refundSources.length) {
    financeFail_("REFUND_SOURCES_REQUIRED", "返金には未消込入金または請求過消込の返金元明細が必要です。");
  }
  var sourceTotal = 0;
  var seenSources = {};
  var sourceIndex;
  for (sourceIndex = 0; sourceIndex < payment.refundSources.length; sourceIndex += 1) {
    var source = payment.refundSources[sourceIndex] || {};
    var sourceType = String(source.sourceType || "");
    var sourceId = financeRequiredText_(source.sourceId, "返金元ID");
    var sourceAmount = financePositiveAmount_(source.amount, "返金元金額");
    if (sourceType !== "UNALLOCATED_RECEIPT" && sourceType !== "INVOICE_CREDIT") {
      financeFail_("INVALID_REFUND_SOURCE_TYPE", "返金元区分が不正です: " + sourceType);
    }
    var sourceKey = sourceType + ":" + sourceId;
    if (seenSources[sourceKey]) {
      financeFail_("DUPLICATE_REFUND_SOURCE", "同じ返金取引内で返金元が重複しています: " + sourceKey);
    }
    seenSources[sourceKey] = true;
    sourceTotal += sourceAmount;
    if (!financeIsInteger_(sourceTotal) || sourceTotal > FINANCE_MAX_AMOUNT) {
      financeFail_("AMOUNT_OUT_OF_RANGE", "返金元金額の合計が上限を超えています。");
    }
    if (sourceType === "UNALLOCATED_RECEIPT") {
      var receipt = financeFindById_(state.payments, sourceId);
      if (!receipt || receipt.kind !== FINANCE_PAYMENT_KIND.RECEIPT) {
        financeFail_("REFUND_SOURCE_NOT_FOUND", "返金元の入金が見つかりません: " + sourceId);
      }
      if (receipt.customerId !== payment.customerId) {
        financeFail_("REFUND_SOURCE_CUSTOMER_MISMATCH", "返金と返金元入金の対象者が一致しません。");
      }
    } else {
      var invoice = financeFindById_(state.invoices, sourceId);
      if (!invoice || invoice.status !== FINANCE_INVOICE_STATUS.ISSUED) {
        financeFail_("REFUND_SOURCE_NOT_FOUND", "返金元の発行済請求が見つかりません: " + sourceId);
      }
      if (invoice.customerId !== payment.customerId) {
        financeFail_("REFUND_SOURCE_CUSTOMER_MISMATCH", "返金と返金元請求の対象者が一致しません。");
      }
    }
  }
  if (sourceTotal !== payment.amount) {
    financeFail_("REFUND_SOURCE_TOTAL_MISMATCH", "返金額と返金元明細の合計が一致しません。");
  }
}

function financeAssertPaymentReversalMatches_(reverse, original) {
  if (reverse.customerId !== original.customerId ||
      reverse.amount !== original.amount ||
      reverse.method !== original.method ||
      financeOptionalText_(reverse.reference) !== financeOptionalText_(original.reference)) {
    financeFail_("INVALID_PAYMENT_REVERSAL", "反対入出金の金額・対象者・方法・参照情報が元取引と一致しません。");
  }
  if (reverse.kind === FINANCE_PAYMENT_KIND.REVERSE_RECEIPT) return;
  if (financeRequiredText_(reverse.referenceNo, "反対返金管理番号") !==
      financeDerivedReversalReference_(original.referenceNo, reverse.id) ||
      financeStableStringify_(reverse.refundSources) !==
        financeStableStringify_(original.refundSources)) {
    financeFail_("INVALID_PAYMENT_REVERSAL", "反対返金の管理番号または返金元明細が元返金と一致しません。");
  }
}

function financeReceiptAllocated_(state, paymentId) {
  var payment = financeFindById_(state.payments, paymentId);
  if (!payment || payment.kind !== FINANCE_PAYMENT_KIND.RECEIPT) return 0;
  var allocated = 0;
  var index;
  for (index = 0; index < state.payment_allocations.length; index += 1) {
    var row = state.payment_allocations[index];
    if (row.paymentId === paymentId) allocated += row.direction * row.amount;
  }
  if (allocated < 0 || allocated > payment.amount) {
    financeFail_("INVALID_PAYMENT_ALLOCATION_TOTAL", "入金消込合計が入金額の範囲外です。");
  }
  return allocated;
}

function financeReceiptUnallocatedBeforeRefund_(state, paymentId) {
  var payment = financeFindById_(state.payments, paymentId);
  if (!payment || payment.kind !== FINANCE_PAYMENT_KIND.RECEIPT) return 0;
  var reversed = financeHasReversal_(state.payments, "reversalOfPaymentId", paymentId) ?
    payment.amount : 0;
  var remaining = payment.amount - financeReceiptAllocated_(state, paymentId) - reversed;
  if (remaining < 0) {
    financeFail_(
      "INVALID_REVERSED_RECEIPT_BALANCE",
      "反対入金後に消込が残っています。元入金を訂正する前に消込を戻してください。"
    );
  }
  return remaining;
}

function financeRefundedFromSource_(state, sourceType, sourceId) {
  var refunded = 0;
  var index;
  for (index = 0; index < state.payments.length; index += 1) {
    var payment = state.payments[index];
    var direction = payment.kind === FINANCE_PAYMENT_KIND.REFUND ? 1 :
      (payment.kind === FINANCE_PAYMENT_KIND.REVERSE_REFUND ? -1 : 0);
    if (!direction || !Array.isArray(payment.refundSources)) continue;
    var sourceIndex;
    for (sourceIndex = 0; sourceIndex < payment.refundSources.length; sourceIndex += 1) {
      var source = payment.refundSources[sourceIndex] || {};
      if (source.sourceType === sourceType && source.sourceId === sourceId) {
        refunded += direction * Number(source.amount);
      }
    }
  }
  if (!financeIsInteger_(refunded) || refunded < 0) {
    financeFail_("INVALID_REFUND_REVERSAL_TOTAL", "返金の反対取引が元返金額を超えています。");
  }
  return refunded;
}

function financeReceiptUnallocated_(state, paymentId) {
  var beforeRefund = financeReceiptUnallocatedBeforeRefund_(state, paymentId);
  var refunded = financeRefundedFromSource_(state, "UNALLOCATED_RECEIPT", paymentId);
  if (!financeIsInteger_(refunded) || refunded < 0 || refunded > beforeRefund) {
    financeFail_(
      "REFUND_SOURCE_OVERCONSUMED",
      "未消込入金額を超えて返金済みです。同じ入金を返金と請求消込へ二重利用できません。"
    );
  }
  return beforeRefund - refunded;
}

function financeInvoiceAllocated_(state, invoiceId) {
  var total = 0;
  var index;
  for (index = 0; index < state.payment_allocations.length; index += 1) {
    var row = state.payment_allocations[index];
    if (row.invoiceId === invoiceId) total += row.direction * row.amount;
  }
  if (total < 0) financeFail_("INVALID_INVOICE_ALLOCATION_TOTAL", "請求消込合計が負数です。");
  return total;
}

function financeSelectRefundSources_(state, customerId, amount) {
  var sources = [];
  var remaining = amount;
  var index;
  for (index = 0; index < state.payments.length && remaining > 0; index += 1) {
    var receipt = state.payments[index];
    if (receipt.kind !== FINANCE_PAYMENT_KIND.RECEIPT || receipt.customerId !== customerId) continue;
    var receiptAvailable = financeReceiptUnallocated_(state, receipt.id);
    if (receiptAvailable <= 0) continue;
    var receiptUse = Math.min(receiptAvailable, remaining);
    sources.push({ sourceType: "UNALLOCATED_RECEIPT", sourceId: receipt.id, amount: receiptUse });
    remaining -= receiptUse;
  }
  for (index = 0; index < state.invoices.length && remaining > 0; index += 1) {
    var invoice = state.invoices[index];
    if (invoice.status !== FINANCE_INVOICE_STATUS.ISSUED || invoice.customerId !== customerId) continue;
    var invoiceAvailable = financeInvoicePosition_(state, invoice.id).overapplied;
    if (invoiceAvailable <= 0) continue;
    var invoiceUse = Math.min(invoiceAvailable, remaining);
    sources.push({ sourceType: "INVOICE_CREDIT", sourceId: invoice.id, amount: invoiceUse });
    remaining -= invoiceUse;
  }
  if (remaining) financeFail_("REFUND_SOURCE_SHORTAGE", "返金元となる未消込入金または過消込額が不足しています。");
  return sources;
}

function financeAssertDateOpen_(state, dateText) {
  var index;
  for (index = 0; index < state.closing_periods.length; index += 1) {
    var period = state.closing_periods[index];
    if (dateText >= period.startDate && dateText <= period.endDate) {
      financeFail_("ACCOUNTING_PERIOD_CLOSED", "締め済み期間には登録・変更できません。翌期間に反対取引を登録してください。");
    }
  }
}

function financeFindIssuedInvoice_(state, invoiceId) {
  var invoice = financeFindRequired_(state.invoices, financeRequiredText_(invoiceId, "請求ID"),
    "INVOICE_NOT_FOUND", "請求が見つかりません。");
  if (invoice.status !== FINANCE_INVOICE_STATUS.ISSUED) {
    financeFail_("INVOICE_NOT_ISSUED", "発行済請求だけが会計取引の対象です。");
  }
  return invoice;
}

function financeFinishMutation_(state) {
  state.revision += 1;
  financeValidateState_(state);
  return state;
}

function financeValidateStateShape_(state) {
  if (!state || typeof state !== "object") financeFail_("INVALID_STATE", "会計データがありません。");
  var arrays = [
    "invoices", "invoice_lines", "payments", "payment_allocations",
    "credit_notes", "closing_periods", "journal_entries"
  ];
  var index;
  for (index = 0; index < arrays.length; index += 1) {
    if (!Array.isArray(state[arrays[index]])) {
      financeFail_("INVALID_STATE", "会計データの " + arrays[index] + " が不正です。");
    }
  }
}

function financeAssertCollectionIds_(collection, label) {
  var seen = {};
  var index;
  for (index = 0; index < collection.length; index += 1) {
    var id = financeRequiredText_(collection[index].id, label + "ID");
    if (seen[id]) financeFail_("DUPLICATE_ENTITY_ID", label + "IDが重複しています: " + id);
    seen[id] = true;
  }
}

function financeAssertAllInvoiceNosUnique_(state) {
  var seen = {};
  var index;
  for (index = 0; index < state.invoices.length; index += 1) {
    var no = financeOptionalText_(state.invoices[index].invoiceNo);
    if (!no) continue;
    var key = no.toUpperCase();
    if (seen[key]) financeFail_("DUPLICATE_INVOICE_NO", "請求書番号が重複しています: " + no);
    seen[key] = true;
  }
}

function financeAssertAllCreditNosUnique_(state) {
  var seen = {};
  var index;
  for (index = 0; index < state.credit_notes.length; index += 1) {
    var no = financeRequiredText_(state.credit_notes[index].creditNoteNo, "取消・決済番号");
    var key = no.toUpperCase();
    if (seen[key]) financeFail_("DUPLICATE_CREDIT_NOTE_NO", "取消・決済番号が重複しています: " + no);
    seen[key] = true;
  }
}

function financeAssertAllRefundReferenceNosUnique_(state) {
  var seen = {};
  var index;
  for (index = 0; index < state.payments.length; index += 1) {
    var payment = state.payments[index];
    if (payment.kind !== FINANCE_PAYMENT_KIND.REFUND) continue;
    var no = financeRequiredText_(payment.referenceNo, "返金管理番号");
    var key = no.toUpperCase();
    if (seen[key]) financeFail_("DUPLICATE_REFUND_REFERENCE_NO", "返金管理番号が重複しています: " + no);
    seen[key] = true;
  }
}

function financeAssertUniqueInvoiceNo_(state, invoiceNo, exceptInvoiceId) {
  var normalized = String(invoiceNo).toUpperCase();
  var index;
  for (index = 0; index < state.invoices.length; index += 1) {
    var invoice = state.invoices[index];
    if (invoice.id !== exceptInvoiceId && String(invoice.invoiceNo || "").toUpperCase() === normalized) {
      financeFail_("DUPLICATE_INVOICE_NO", "請求書番号はすでに使用されています: " + invoiceNo);
    }
  }
}

function financeAssertUniqueCreditNo_(state, creditNo) {
  var normalized = String(creditNo).toUpperCase();
  var index;
  for (index = 0; index < state.credit_notes.length; index += 1) {
    if (String(state.credit_notes[index].creditNoteNo || "").toUpperCase() === normalized) {
      financeFail_("DUPLICATE_CREDIT_NOTE_NO", "取消・決済番号はすでに使用されています: " + creditNo);
    }
  }
}

function financeAssertUniqueRefundReferenceNo_(state, referenceNo) {
  var normalized = String(referenceNo).toUpperCase();
  var index;
  for (index = 0; index < state.payments.length; index += 1) {
    var payment = state.payments[index];
    if (payment.kind === FINANCE_PAYMENT_KIND.REFUND &&
        String(payment.referenceNo || "").toUpperCase() === normalized) {
      financeFail_("DUPLICATE_REFUND_REFERENCE_NO", "返金管理番号はすでに使用されています: " + referenceNo);
    }
  }
}

function financeAssertUniqueId_(collection, id, code) {
  if (financeFindById_(collection, id)) financeFail_(code, "IDがすでに使用されています: " + id);
}

function financeFindRequired_(collection, id, code, message) {
  var found = financeFindById_(collection, id);
  if (!found) financeFail_(code, message);
  return found;
}

function financeFindById_(collection, id) {
  var index;
  for (index = 0; index < collection.length; index += 1) {
    if (collection[index].id === id) return collection[index];
  }
  return null;
}

function financeHasReversal_(collection, field, originalId) {
  var index;
  for (index = 0; index < collection.length; index += 1) {
    if (collection[index][field] === originalId) return true;
  }
  return false;
}

function financeAssertUnchangedOriginal_(before, after, invoiceId) {
  var oldInvoice = financeFindById_(before.invoices, invoiceId);
  var newInvoice = financeFindById_(after.invoices, invoiceId);
  if (financeStableStringify_(oldInvoice) !== financeStableStringify_(newInvoice)) {
    financeFail_("ORIGINAL_TRANSACTION_MUTATED", "訂正処理が元請求を変更しました。処理を中止します。");
  }
  var oldLines = before.invoice_lines.filter(function (line) { return line.invoiceId === invoiceId; });
  var newLines = after.invoice_lines.filter(function (line) { return line.invoiceId === invoiceId; });
  if (financeStableStringify_(oldLines) !== financeStableStringify_(newLines)) {
    financeFail_("ORIGINAL_TRANSACTION_MUTATED", "訂正処理が元請求明細を変更しました。処理を中止します。");
  }
}

function financeInvoiceIntegrityKey_(state, invoice) {
  var copy = financeClone_(invoice);
  delete copy.immutableKey;
  var lines = state.invoice_lines.filter(function (line) {
    return line.invoiceId === invoice.id;
  }).sort(function (a, b) {
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
  return financeHash_({ invoice: copy, lines: lines });
}

function financeSealRecord_(record) {
  var copy = financeClone_(record);
  delete copy.immutableKey;
  record.immutableKey = financeHash_(copy);
}

function financeValidateSealedRecord_(record, code, label) {
  var copy = financeClone_(record);
  var expected = copy.immutableKey;
  delete copy.immutableKey;
  if (!expected || financeHash_(copy) !== expected) {
    financeFail_(code, label + "が上書きされています。反対取引で訂正してください。");
  }
}

function financeAssertOnlyReversalFields_(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    financeFail_("INVALID_REVERSAL_INPUT", "反対取引の入力形式が不正です。");
  }
  var key;
  for (key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key) && !allowed[key]) {
      financeFail_(
        "REVERSAL_FIELD_NOT_EDITABLE",
        "反対取引の" + key + "は元取引から自動継承されるため指定・変更できません。"
      );
    }
  }
}

function financeDerivedReversalReference_(originalReference, reversalId) {
  return financeRequiredText_(originalReference, "元取引管理番号") +
    "-REV-" + financeRequiredText_(reversalId, "反対取引ID");
}

function financeRoundRational_(numerator, denominator, rounding) {
  if (!financeIsInteger_(numerator) || numerator < 0 || !financeIsInteger_(denominator) || denominator <= 0) {
    financeFail_("INVALID_TAX_CALCULATION", "消費税計算値が不正です。");
  }
  if (rounding === FINANCE_ROUNDING.FLOOR) return Math.floor(numerator / denominator);
  if (rounding === FINANCE_ROUNDING.CEIL) return Math.ceil(numerator / denominator);
  if (rounding === FINANCE_ROUNDING.HALF_UP) return Math.floor((numerator + denominator / 2) / denominator);
  financeFail_("INVALID_ROUNDING_POLICY", "消費税丸め方法が不正です。");
}

function financePositiveInteger_(value, label) {
  var number = Number(value);
  if (!financeIsInteger_(number) || number <= 0) financeFail_("INVALID_INTEGER", label + "は1以上の整数で指定してください。");
  return number;
}

function financeNonNegativeAmount_(value, label) {
  var number = Number(value);
  if (!financeIsInteger_(number) || number < 0) financeFail_("INVALID_AMOUNT", label + "は0以上の整数円で指定してください。");
  financeAssertAmountRange_(number, label);
  return number;
}

function financePositiveAmount_(value, label) {
  var number = financeNonNegativeAmount_(value, label);
  if (number <= 0) financeFail_("INVALID_AMOUNT", label + "は1円以上で指定してください。");
  return number;
}

function financeAssertAmountRange_(value, label) {
  if (!financeIsInteger_(value) || value < 0 || value > FINANCE_MAX_AMOUNT) {
    financeFail_("AMOUNT_OUT_OF_RANGE", label + "が安全に計算できる範囲を超えています。");
  }
}

function financeIsInteger_(value) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
}

function financeNormalizeBillingSnapshot_(input, requireComplete) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    financeFail_(
      requireComplete ? "BILLING_SNAPSHOT_REQUIRED" : "BILLING_SNAPSHOT_INVALID",
      requireComplete
        ? "正式請求の発行には、発行時点の請求先・発行者・振込先スナップショットが必要です。"
        : "請求スナップショットはオブジェクトで指定してください。"
    );
  }
  var allowed = {};
  var index;
  for (index = 0; index < FINANCE_BILLING_SNAPSHOT_FIELDS.length; index += 1) {
    allowed[FINANCE_BILLING_SNAPSHOT_FIELDS[index]] = true;
  }
  var inputKeys = Object.keys(input);
  for (index = 0; index < inputKeys.length; index += 1) {
    if (!allowed[inputKeys[index]]) {
      financeFail_("BILLING_SNAPSHOT_INVALID", "請求スナップショットに未対応の項目があります: " + inputKeys[index]);
    }
  }

  var normalized = {};
  for (index = 0; index < FINANCE_BILLING_SNAPSHOT_FIELDS.length; index += 1) {
    var field = FINANCE_BILLING_SNAPSHOT_FIELDS[index];
    var hasField = Object.prototype.hasOwnProperty.call(input, field);
    if (!hasField) {
      if (requireComplete) {
        financeFail_("BILLING_SNAPSHOT_INCOMPLETE", "請求スナップショットの項目が不足しています: " + field);
      }
      continue;
    }
    var text = String(input[field] === undefined || input[field] === null ? "" : input[field]);
    if (typeof text.normalize === "function") text = text.normalize("NFKC");
    text = text.replace(/\r\n?/g, "\n").trim();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      financeFail_("BILLING_SNAPSHOT_CONTROL_CHARACTER", "請求スナップショットに制御文字は使用できません: " + field);
    }
    if (/(^|\n)[ \t\u3000]*[=+\-@]/.test(text)) {
      financeFail_("BILLING_SNAPSHOT_FORMULA_RISK", "請求スナップショットに数式として解釈される先頭文字は使用できません: " + field);
    }
    if (text.length > FINANCE_BILLING_SNAPSHOT_MAX_LENGTHS[field]) {
      financeFail_("BILLING_SNAPSHOT_TEXT_TOO_LONG", "請求スナップショットの文字数が上限を超えています: " + field);
    }
    if (requireComplete && FINANCE_BILLING_SNAPSHOT_REQUIRED_VALUES[field] && !text) {
      financeFail_("BILLING_SNAPSHOT_INCOMPLETE", "請求スナップショットの必須値が空です: " + field);
    }
    normalized[field] = text;
  }
  if (normalized.recipientHonorific &&
      normalized.recipientHonorific !== "御中" &&
      normalized.recipientHonorific !== "様") {
    financeFail_("BILLING_SNAPSHOT_INVALID_HONORIFIC", "請求先敬称は「御中」または「様」を指定してください。");
  }
  if (normalized.invoiceRegistrationNo &&
      !/^T\d{13}$/.test(normalized.invoiceRegistrationNo)) {
    financeFail_("BILLING_SNAPSHOT_INVALID_REGISTRATION_NO", "適格請求書発行事業者の登録番号はTと13桁の数字で指定してください。");
  }
  if (normalized.issuerEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.issuerEmail)) {
    financeFail_("BILLING_SNAPSHOT_INVALID_EMAIL", "発行者メールアドレスの形式が不正です。");
  }
  return normalized;
}

function financeAssertStoredBillingSnapshot_(invoice) {
  var issued = invoice.status === FINANCE_INVOICE_STATUS.ISSUED;
  if (invoice.billingSnapshot === undefined || invoice.billingSnapshot === null) {
    if (issued) {
      financeFail_(
        "ISSUED_INVOICE_BILLING_SNAPSHOT_MISSING",
        "発行済請求に発行時点の請求先・発行者・振込先スナップショットがありません。旧データへ推測補完せず作成を停止します。"
      );
    }
    return;
  }
  var normalized;
  try {
    normalized = financeNormalizeBillingSnapshot_(invoice.billingSnapshot, issued);
  } catch (error) {
    financeFail_(
      issued ? "ISSUED_INVOICE_BILLING_SNAPSHOT_INVALID" : "DRAFT_INVOICE_BILLING_SNAPSHOT_INVALID",
      (issued ? "発行済請求" : "下書き請求") + "の請求スナップショットが不正です。" +
        (error && error.code ? " (" + error.code + ")" : "")
    );
  }
  if (financeStableStringify_(normalized) !== financeStableStringify_(invoice.billingSnapshot)) {
    financeFail_(
      issued ? "ISSUED_INVOICE_BILLING_SNAPSHOT_INVALID" : "DRAFT_INVOICE_BILLING_SNAPSHOT_INVALID",
      (issued ? "発行済請求" : "下書き請求") + "の請求スナップショットが正規化済みの形式ではありません。"
    );
  }
}

function financeRequiredText_(value, label) {
  var text = String(value === undefined || value === null ? "" : value).trim();
  if (!text) financeFail_("REQUIRED_FIELD", label + "を入力してください。");
  if (text.length > 500) financeFail_("TEXT_TOO_LONG", label + "が長すぎます。");
  return text;
}

function financeOptionalText_(value) {
  var text = String(value === undefined || value === null ? "" : value).trim();
  if (text.length > 500) financeFail_("TEXT_TOO_LONG", "入力文字列が長すぎます。");
  return text;
}

function financeRequiredDate_(value, label) {
  var date = financeOptionalDate_(value, label);
  if (!date) financeFail_("REQUIRED_FIELD", label + "を入力してください。");
  return date;
}

function financeOptionalDate_(value, label) {
  var text = financeOptionalText_(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) financeFail_("INVALID_DATE", label + "はYYYY-MM-DD形式で指定してください。");
  var parts = text.split("-");
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (date.getFullYear() !== Number(parts[0]) || date.getMonth() !== Number(parts[1]) - 1 ||
      date.getDate() !== Number(parts[2])) {
    financeFail_("INVALID_DATE", label + "が実在する日付ではありません。");
  }
  return text;
}

function financeContext_(context) {
  var input = context || {};
  var at = financeRequiredText_(input.at, "操作日時");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(at)) {
    financeFail_("INVALID_TIMESTAMP", "操作日時はタイムゾーン付きISO形式で指定してください。");
  }
  return {
    actorId: financeRequiredText_(input.actorId, "操作者ID"),
    at: at
  };
}

function financeClone_(value) {
  return JSON.parse(JSON.stringify(value));
}

function financeStableStringify_(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(function (item) { return financeStableStringify_(item); }).join(",") + "]";
  }
  var keys = Object.keys(value).sort();
  return "{" + keys.map(function (key) {
    return JSON.stringify(key) + ":" + financeStableStringify_(value[key]);
  }).join(",") + "}";
}

function financeHash_(value) {
  var text = financeStableStringify_(value);
  // Ledger integrity is evaluated on Apps Script.  Use a cryptographic digest
  // there; retain the small deterministic fallback so this pure domain module
  // remains executable in browser/Node logic tests without Apps Script APIs.
  if (typeof Utilities !== "undefined" && Utilities.computeDigest &&
      Utilities.DigestAlgorithm && Utilities.Charset) {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8
    );
    return bytes.map(function (byte) {
      return (byte & 255).toString(16).padStart(2, "0");
    }).join("");
  }
  var hash = 2166136261;
  var index;
  for (index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return ("00000000" + hash.toString(16)).slice(-8);
}

function financeFail_(code, message) {
  var error = new Error(message);
  error.code = code;
  throw error;
}
