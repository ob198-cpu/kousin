/*
 * Apps Script を使わない台帳永続化の回帰試験。
 * 実データ・実スプレッドシートには一切接続しない。
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const financeStoreSource = fs.readFileSync(
  path.join(__dirname, "FinanceStore.js"), "utf8"
);
const financeDisasterRestoreSource = fs.readFileSync(
  path.join(__dirname, "FinanceDisasterRestore.js"), "utf8"
);

class MockRange {
  constructor(sheet, row, column, rowCount, columnCount) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValues() {
    const values = [];
    for (let r = 0; r < this.rowCount; r += 1) {
      const line = [];
      for (let c = 0; c < this.columnCount; c += 1) {
        line.push((this.sheet.values[this.row - 1 + r] || [])[this.column - 1 + c] ?? "");
      }
      values.push(line);
    }
    return values;
  }
  getDisplayValues() { return this.getValues().map((row) => row.map((cell) => String(cell))); }
  setValues(values) {
    values.forEach((row, rowIndex) => {
      const targetIndex = this.row - 1 + rowIndex;
      if (!this.sheet.values[targetIndex]) this.sheet.values[targetIndex] = [];
      row.forEach((cell, columnIndex) => {
        this.sheet.values[targetIndex][this.column - 1 + columnIndex] = cell;
      });
    });
    return this;
  }
  setValue(value) {
    return this.setValues([[value]]);
  }
  clearContent() {
    for (let r = 0; r < this.rowCount; r += 1) {
      const targetIndex = this.row - 1 + r;
      if (!this.sheet.values[targetIndex]) this.sheet.values[targetIndex] = [];
      for (let c = 0; c < this.columnCount; c += 1) {
        this.sheet.values[targetIndex][this.column - 1 + c] = "";
      }
    }
    return this;
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.values = [];
    this.maxRows = 1000;
  }
  getRange(row, column, rowCount, columnCount) {
    if (row < 1 || row + rowCount - 1 > this.maxRows) {
      throw new Error(`range exceeds max rows: ${this.name}`);
    }
    return new MockRange(this, row, column, rowCount, columnCount);
  }
  getLastRow() {
    for (let index = this.values.length - 1; index >= 0; index -= 1) {
      if ((this.values[index] || []).some((value) => value !== "" && value !== undefined)) return index + 1;
    }
    return 0;
  }
  getLastColumn() {
    return this.values.reduce((maximum, row) => Math.max(maximum, (row || []).length), 0);
  }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(afterPosition, howMany) {
    assert.strictEqual(afterPosition, this.maxRows);
    assert.ok(Number.isInteger(howMany) && howMany > 0);
    this.maxRows += howMany;
  }
  setFrozenRows() {}
  clone() {
    const copy = new MockSheet(this.name);
    copy.values = this.values.map((row) => (row || []).slice());
    copy.maxRows = this.maxRows;
    return copy;
  }
}

class MockSpreadsheet {
  constructor(id = "mock-finance-store") {
    this.id = id;
    this.sheets = {};
  }
  insertSheet(name) {
    if (this.sheets[name]) throw new Error(`duplicate sheet: ${name}`);
    this.sheets[name] = new MockSheet(name);
    return this.sheets[name];
  }
  getSheetByName(name) { return this.sheets[name] || null; }
  getId() { return this.id; }
  getUrl() { return `https://sheets.test/${this.id}`; }
  clone(id) {
    const copy = new MockSpreadsheet(id);
    Object.keys(this.sheets).forEach((name) => {
      copy.sheets[name] = this.sheets[name].clone();
    });
    return copy;
  }
}

function assertCode(action, code) {
  assert.throws(action, (error) => error && error.code === code, code);
}

const spreadsheet = new MockSpreadsheet();
const storeMetaSheet = spreadsheet.insertSheet("_meta");
storeMetaSheet.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
storeMetaSheet.getRange(2, 1, 3, 2).setValues([
  ["spreadsheetId", spreadsheet.getId()],
  ["backupFolderId", "mock-backup-folder"],
  ["dataFolderId", "mock-data-folder"]
]);
const spreadsheets = { [spreadsheet.getId()]: spreadsheet };
const scriptPropertyValues = {
  RENEWAL_DATA_SPREADSHEET_ID: spreadsheet.getId()
};
let actor = "admin@example.com";
let uuid = 0;
const driveFiles = {};
const hiddenDriveFileIds = new Set();
let driveFileNumber = 0;
let stageFileNumber = 0;
let driveCreateFailure = "";
let driveCopyFailure = "";
let driveRemoveFailure = "";
function driveIterator(items) {
  let index = 0;
  return {
    hasNext: () => index < items.length,
    next: () => items[index++]
  };
}
function createDriveBlobFile(blob, folderId = "mock-backup-folder") {
  const id = `drive-file-${++driveFileNumber}`;
  const file = {
    blob,
    id,
    folderId,
    description: "",
    trashed: false,
    getId: () => id,
    getName: () => String(blob.name || ""),
    getMimeType: () => String(blob.contentType || "application/octet-stream"),
    getUrl: () => `https://drive.test/${id}`,
    getDescription() { return this.description; },
    setDescription(value) { this.description = String(value || ""); return this; },
    setTrashed(value) { this.trashed = Boolean(value); return this; },
    getBlob: () => ({ getDataAsString: () => String(blob.content || "") })
  };
  driveFiles[id] = file;
  return file;
}
function createSpreadsheetDriveFile(targetSpreadsheet, name, folderId) {
  const file = {
    id: targetSpreadsheet.getId(),
    spreadsheet: targetSpreadsheet,
    name: String(name || targetSpreadsheet.getId()),
    folderId: String(folderId || ""),
    description: "",
    trashed: false,
    getId() { return this.id; },
    getName() { return this.name; },
    getMimeType() { return "application/vnd.google-apps.spreadsheet"; },
    getUrl() { return `https://drive.test/${this.id}`; },
    getDescription() { return this.description; },
    setDescription(value) { this.description = String(value || ""); return this; },
    setTrashed(value) { this.trashed = Boolean(value); return this; },
    makeCopy() { throw new Error("DriveApp.makeCopy must not be used"); }
  };
  driveFiles[file.id] = file;
  return file;
}
createSpreadsheetDriveFile(
  spreadsheet, "mock-finance-store", "mock-data-folder"
);
const roles = {
  "admin@example.com": "admin",
  "approver@example.com": "admin",
  "accounting@example.com": "accounting",
  "renewal@example.com": "renewal",
  "viewer@example.com": "viewer"
};
const permissions = {
  admin: ["read", "role.write", "accounting.write", "backup.create", "restore"],
  accounting: ["read", "accounting.write"],
  renewal: ["read"],
  viewer: ["read"]
};
const storeAuditRowsBySpreadsheet = {
  [spreadsheet.getId()]: []
};
function readStoreMeta(targetSpreadsheet) {
  const sheet = targetSpreadsheet.getSheetByName("_meta");
  const result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2)
    .getValues().forEach((row) => { result[String(row[0] || "")] = row[1]; });
  return result;
}
let serverBankAccount = "テスト銀行 本店 普通 1234567";
function serverBillingSnapshot(customerId) {
  assert.strictEqual(customerId, "customer-1");
  return {
    recipientName: "株式会社受講者",
    recipientHonorific: "御中",
    recipientAddress: "〒060-0000 北海道札幌市",
    issuerCompany: "株式会社CDP北海道",
    issuerAddress: "〒001-0000 北海道札幌市",
    issuerPhone: "011-000-0000",
    issuerFax: "",
    issuerEmail: "",
    invoiceRegistrationNo: "T1234567890123",
    bankAccountText: serverBankAccount
  };
}
const context = {
  console,
  JSON,
  Date,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  RegExp,
  Error,
  isFinite,
  Utilities: {
    getUuid: () => `uuid-${++uuid}`,
    newBlob: (content, contentType, name) => ({ content, contentType, name }),
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest: (_algorithm, text) =>
      Array.from(crypto.createHash("sha256").update(String(text), "utf8").digest())
  },
  SpreadsheetApp: {
    flush() {},
    openById: (id) => {
      if (!spreadsheets[id]) throw new Error("spreadsheet missing");
      return spreadsheets[id];
    }
  },
  DriveApp: {
    getFolderById: (folderId) => {
      assert.ok(["mock-backup-folder", "mock-data-folder"].includes(folderId));
      return {
        id: folderId,
        getId: () => folderId,
        createFile: () => { throw new Error("folder.createFile must not be used"); },
        getFilesByName: (name) => driveIterator(
          Object.values(driveFiles).filter((file) =>
            file.folderId === folderId &&
            file.getName() === name &&
            !hiddenDriveFileIds.has(file.getId())
          )
        )
      };
    },
    getFileById: (id) => {
      const file = driveFiles[id];
      if (!file) throw new Error("file missing");
      return file;
    }
  },
  Drive: {
    Files: {
      create: (metadata, blob, options) => {
        assert.strictEqual(options.ignoreDefaultVisibility, true);
        assert.strictEqual(options.supportsAllDrives, true);
        assert.strictEqual(metadata.parents.length, 1);
        if (driveCreateFailure === "before") {
          driveCreateFailure = "";
          throw new Error("simulated finance Drive create stop before commit");
        }
        const file = createDriveBlobFile(blob, String(metadata.parents[0]));
        file.setDescription(metadata.description);
        if (driveCreateFailure === "after") {
          driveCreateFailure = "";
          throw new Error("simulated finance Drive create stop after commit");
        }
        return {
          id: file.getId(),
          name: file.getName(),
          mimeType: file.getMimeType(),
          parents: [file.folderId],
          description: file.getDescription(),
          trashed: false
        };
      },
      copy: (metadata, sourceId, options) => {
        assert.strictEqual(options.ignoreDefaultVisibility, true);
        assert.strictEqual(options.supportsAllDrives, true);
        assert.strictEqual(metadata.parents.length, 1);
        if (driveCopyFailure === "before") {
          driveCopyFailure = "";
          throw new Error("simulated finance Drive copy stop before commit");
        }
        const sourceFile = driveFiles[String(sourceId)];
        if (!sourceFile || !sourceFile.spreadsheet) throw new Error("copy source missing");
        const id = `stage-store-${++stageFileNumber}`;
        const copiedSpreadsheet = sourceFile.spreadsheet.clone(id);
        spreadsheets[id] = copiedSpreadsheet;
        storeAuditRowsBySpreadsheet[id] = (
          storeAuditRowsBySpreadsheet[sourceFile.spreadsheet.getId()] || []
        ).map((row) => ({ ...row }));
        const file = createSpreadsheetDriveFile(
          copiedSpreadsheet,
          String(metadata.name),
          String(metadata.parents[0])
        );
        file.setDescription(metadata.description);
        if (driveCopyFailure === "after") {
          driveCopyFailure = "";
          throw new Error("simulated finance Drive copy stop after commit");
        }
        return {
          id: file.getId(),
          name: file.getName(),
          mimeType: file.getMimeType(),
          parents: [file.folderId],
          description: file.getDescription(),
          trashed: false
        };
      },
      get: (id) => {
        const file = driveFiles[String(id)];
        if (!file) throw new Error("Drive metadata missing");
        return {
          id: file.getId(),
          name: file.getName(),
          mimeType: file.getMimeType(),
          parents: [file.folderId],
          description: file.getDescription(),
          trashed: file.trashed === true
        };
      },
      remove: (id) => {
        if (driveRemoveFailure) {
          const message = driveRemoveFailure;
          driveRemoveFailure = "";
          throw new Error(message);
        }
        const key = String(id);
        if (!driveFiles[key]) throw new Error("Drive file missing");
        delete driveFiles[key];
        delete spreadsheets[key];
        delete storeAuditRowsBySpreadsheet[key];
      }
    }
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => scriptPropertyValues[key] || "",
      setProperty: (key, value) => {
        scriptPropertyValues[key] = String(value || "");
      },
      deleteProperty: (key) => {
        delete scriptPropertyValues[key];
      }
    })
  },
  RENEWAL_STORE: {
    SPREADSHEET_ID_KEY: "RENEWAL_DATA_SPREADSHEET_ID"
  },
  storeMakePrivate_: () => {},
  storeAssertResourcePrivate_: () => {},
  storeWithLock_: (callback) => callback(),
  storeOpen_: () => spreadsheets[scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID],
  storeReadMetaMap_: (targetSpreadsheet) => readStoreMeta(targetSpreadsheet),
  storeValidateSchema_: () => {},
  storeActorEmail_: () => actor,
  storeRoleForActor_: (_spreadsheet, email) => roles[email],
  storeRequirePermission_: (_spreadsheet, email, permission) => {
    const role = roles[email];
    if (!role || !permissions[role].includes(permission)) {
      const error = new Error("denied");
      error.code = "STORE_ACCESS_DENIED";
      throw error;
    }
    return role;
  },
  storeContext_: (permission) => {
    const activeSpreadsheet =
      spreadsheets[scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID];
    return {
      spreadsheet: activeSpreadsheet,
      actor,
      role: context.storeRequirePermission_(
        activeSpreadsheet, actor, permission
      )
    };
  },
  storeRequireAdminApprover_: (_spreadsheet, value) => {
    const email = String(value || "").trim().toLowerCase();
    if (roles[email] !== "admin") {
      const error = new Error("invalid admin approver");
      error.code = "STORE_APPROVER_INVALID";
      throw error;
    }
    return email;
  },
  storeReadObjects_: (targetSpreadsheet, sheetName) =>
    sheetName === "audit" ?
      (storeAuditRowsBySpreadsheet[targetSpreadsheet.getId()] || []).slice() :
      [],
  storeAppendAudit_: (targetSpreadsheet, event) => {
    const id = targetSpreadsheet.getId();
    if (!storeAuditRowsBySpreadsheet[id]) storeAuditRowsBySpreadsheet[id] = [];
    storeAuditRowsBySpreadsheet[id].push({ ...event });
  },
  storeReadRecords_: () => [{ recordId: "customer-1", deleted: false }],
  storeReadRoles_: () => Object.keys(roles).map((email) => ({
    email, role: roles[email], active: true
  })),
  artifactBuildFormalBillingSnapshotForFinance_: (_spreadsheet, customerId) =>
    serverBillingSnapshot(customerId)
};
vm.createContext(context);
["Finance.js", "FinanceStore.js", "FinanceDisasterRestore.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename: file });
});

function draft(id, amount) {
  return {
    id,
    customerId: "customer-1",
    invoiceDate: "2026-07-24",
    accountingDate: "2026-07-24",
    dueDate: "2026-08-31",
    lines: [{ id: `${id}-line`, description: "更新講習", quantity: 1, unitAmount: amount, taxCategory: "TAXABLE_10" }]
  };
}
function issue(invoiceId, invoiceNo, journalEntryId) {
  return {
    type: "ISSUE_INVOICE",
    invoiceId,
    data: {
      invoiceNo,
      invoiceDate: "2026-07-24",
      accountingDate: "2026-07-24",
      dueDate: "2026-08-31",
      journalEntryId,
      // ブラウザから送った発行者情報はサーバーで破棄される。
      billingSnapshot: { recipientName: "偽のブラウザ入力" }
    }
  };
}
function execute(expectedRevision, command, reasonCode, idempotencyKey) {
  return context.financeStoreExecute_({
    expectedRevision, command, reasonCode, idempotencyKey
  });
}

// 初期化と草案の表示。草案は閲覧できるが売掛残高には含めない。
let setup = context.financeStoreSetup_({ confirm: context.FINANCE_STORE.SETUP_CONFIRM });
assert.strictEqual(setup.revision, 0);
let result = execute(0, { type: "CREATE_DRAFT_INVOICE", data: draft("invoice-1", 1000) });
assert.strictEqual(result.revision, 1);
assert.strictEqual(result.positions.length, 1);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.positions[0])), {
  invoiceId: "invoice-1", customerId: "customer-1", status: "DRAFT",
  originalBilled: 1100, billingReduction: 0, effectiveBilled: 1100,
  nonCashSettled: 0, cashAllocated: 0, applied: 0, overapplied: 0,
  outstanding: 0, provisionalAmount: 1100, accountingImpact: false
});

// 発行済みの内容は通常編集できず、旧版指定の書込みも拒否する。
result = execute(1, issue("invoice-1", "INV-001", "journal-1"), "ISSUE");
assert.strictEqual(result.revision, 2);
assert.strictEqual(result.positions[0].status, "ISSUED");
assert.strictEqual(result.positions[0].outstanding, 1100);
assert.strictEqual(
  result.state.invoices.find((row) => row.id === "invoice-1")
    .billingSnapshot.bankAccountText,
  "テスト銀行 本店 普通 1234567"
);
// 応答不明後に事業者設定が変わっても、同じ要求は最初の封印済み
// snapshotを返し、別イベントや新しい振込先へ差し替えない。
serverBankAccount = "変更後銀行 支店 普通 7654321";
const issuedRetry = execute(
  1, issue("invoice-1", "INV-001", "journal-1"), "ISSUE"
);
assert.strictEqual(issuedRetry.idempotentReplay, true);
assert.strictEqual(issuedRetry.revision, 2);
assert.strictEqual(
  issuedRetry.state.invoices.find((row) => row.id === "invoice-1")
    .billingSnapshot.bankAccountText,
  "テスト銀行 本店 普通 1234567"
);
assertCode(() => execute(2, { type: "UPDATE_DRAFT_INVOICE", invoiceId: "invoice-1", data: draft("ignored", 2000) }), "ISSUED_INVOICE_IMMUTABLE");
assertCode(() => execute(1, { type: "RECORD_RECEIPT", data: {
  id: "stale-payment", customerId: "customer-1", accountingDate: "2026-07-25", amount: 1,
  method: "bank", journalEntryId: "stale-journal"
} }), "CONCURRENT_MODIFICATION");

// 訂正は取消・再発行をまとめた一つのイベントにする。
const originalBeforeCorrection = JSON.parse(JSON.stringify(result.state.invoices.find((row) => row.id === "invoice-1")));
const correction = {
  type: "CORRECT_INVOICE",
  data: {
    reversal: {
      id: "credit-1", creditNoteNo: "CN-001", invoiceId: "invoice-1", accountingDate: "2026-07-25",
      reason: "訂正", journalEntryId: "journal-credit-1"
    },
    replacementInvoice: draft("invoice-2", 2000),
    replacementIssue: {
      invoiceNo: "INV-002", invoiceDate: "2026-07-25", accountingDate: "2026-07-25",
      dueDate: "2026-08-31", journalEntryId: "journal-2"
    }
  }
};
assertCode(
  () => context.financeStoreRequestApproval_({
    expectedRevision: 2,
    command: correction,
    reasonCode: "CORRECT",
    idempotencyKey: "short"
  }),
  "FINANCE_IDEMPOTENCY_KEY_INVALID"
);
const correctionApprovalRowsBeforeAttacks = spreadsheet
  .getSheetByName("finance_approval_requests").getLastRow();
const correctionEventsBeforeAttacks = spreadsheet
  .getSheetByName("finance_events").getLastRow();
const partialCorrectionAttack = JSON.parse(JSON.stringify(correction));
partialCorrectionAttack.data.reversal.lines = [{
  id: "partial-correction-attack-line",
  description: "部分取消を混入",
  quantity: 1,
  unitAmount: 100,
  taxCategory: "TAXABLE_10"
}];
assertCode(
  () => context.financeStoreRequestApproval_({
    expectedRevision: 2,
    command: partialCorrectionAttack,
    reasonCode: "CORRECT",
    idempotencyKey: "request-correction-partial-attack-0001"
  }),
  "REVERSAL_FIELD_NOT_EDITABLE"
);
const correctionSealAttack = JSON.parse(JSON.stringify(correction));
correctionSealAttack.serverTargetSnapshot = {
  cancellationAmount: 1,
  replacementAmount: 1
};
assertCode(
  () => context.financeStoreRequestApproval_({
    expectedRevision: 2,
    command: correctionSealAttack,
    reasonCode: "CORRECT",
    idempotencyKey: "request-correction-seal-attack-0001"
  }),
  "FINANCE_CORRECTION_SEAL_CLIENT_FORBIDDEN"
);
assert.strictEqual(
  spreadsheet.getSheetByName("finance_approval_requests").getLastRow(),
  correctionApprovalRowsBeforeAttacks,
  "部分取消・ブラウザ封印の悪用を承認待ちへ保存しない"
);
assert.strictEqual(
  spreadsheet.getSheetByName("finance_events").getLastRow(),
  correctionEventsBeforeAttacks,
  "拒否した請求訂正で会計イベントを追加しない"
);
let partialCorrectionSealState = context.financeCreateCreditNote_(
  result.state,
  {
    id: "credit-prior-partial",
    creditNoteNo: "CN-PRIOR-PARTIAL",
    invoiceId: "invoice-1",
    accountingDate: "2026-07-25",
    reason: "事前の正当な一部減額",
    journalEntryId: "journal-prior-partial",
    lines: [{
      id: "credit-prior-partial-line",
      description: "事前減額",
      quantity: 1,
      unitAmount: 500,
      taxCategory: "TAXABLE_10"
    }]
  },
  { actorId: "admin@example.com", at: "2026-07-25T00:00:00.000Z" }
);
const priorPartialCorrectionCommand = JSON.parse(JSON.stringify(correction));
priorPartialCorrectionCommand.data.reversal.id = "credit-partial-final";
priorPartialCorrectionCommand.data.reversal.creditNoteNo = "CN-PARTIAL-FINAL";
priorPartialCorrectionCommand.data.reversal.journalEntryId =
  "journal-partial-final";
priorPartialCorrectionCommand.data.replacementInvoice.id =
  "invoice-partial-replacement";
priorPartialCorrectionCommand.data.replacementInvoice.lines[0].id =
  "invoice-partial-replacement-line";
priorPartialCorrectionCommand.data.replacementIssue.invoiceNo =
  "INV-PARTIAL-REPLACEMENT";
priorPartialCorrectionCommand.data.replacementIssue.journalEntryId =
  "journal-partial-replacement";
const sealedPriorPartialCorrection =
  context.financeStorePrepareCorrectionCommand_(
    spreadsheet, partialCorrectionSealState, priorPartialCorrectionCommand
  );
assert.strictEqual(
  sealedPriorPartialCorrection.serverTargetSnapshot.originalInvoiceAmount,
  1100
);
assert.strictEqual(
  sealedPriorPartialCorrection.serverTargetSnapshot.cancellationAmount,
  550,
  "承認封印の実取消額は元請求総額でなく事前減額後の有効残額を使う"
);
assert.strictEqual(
  sealedPriorPartialCorrection.serverTargetSnapshot.replacementAmount,
  2200,
  "承認封印の新請求額は実取消額とは別に保持する"
);
partialCorrectionSealState = context.financeApplyCommand_(
  partialCorrectionSealState,
  sealedPriorPartialCorrection,
  { actorId: "accounting@example.com", at: "2026-07-25T01:00:00.000Z" }
);
assert.strictEqual(
  context.financeInvoicePosition_(
    partialCorrectionSealState, "invoice-1"
  ).effectiveBilled,
  0,
  "事前減額があっても訂正は残る有効請求額を全額取り消す"
);
let request = context.financeStoreRequestApproval_({
  expectedRevision: 2,
  command: correction,
  reasonCode: "CORRECT",
  idempotencyKey: "request-correction-0001"
});
const correctionRequestRows = spreadsheet
  .getSheetByName("finance_approval_requests").getLastRow();
const correctionRequestAuditRows = spreadsheet
  .getSheetByName("finance_audit").getLastRow();
const requestRetry = context.financeStoreRequestApproval_({
  expectedRevision: 2,
  command: correction,
  reasonCode: "CORRECT",
  idempotencyKey: "request-correction-0001"
});
assert.strictEqual(requestRetry.idempotentReplay, true);
assert.strictEqual(requestRetry.pendingApproval, true);
assert.strictEqual(requestRetry.status, "PENDING");
assert.strictEqual(requestRetry.requestId, request.requestId);
assert.strictEqual(
  spreadsheet.getSheetByName("finance_approval_requests").getLastRow(),
  correctionRequestRows
);
assert.strictEqual(
  spreadsheet.getSheetByName("finance_audit").getLastRow(),
  correctionRequestAuditRows,
  "承認依頼の再送で監査行を二重追加しない"
);
assertCode(
  () => context.financeStoreRequestApproval_({
    expectedRevision: 2,
    command: correction,
    reasonCode: "DIFFERENT",
    idempotencyKey: "request-correction-0001"
  }),
  "FINANCE_IDEMPOTENCY_CONFLICT"
);
let reviewRows = context.financeStoreListApprovals_({});
assert.strictEqual(reviewRows.length, 1);
const storedCorrectionRequest = context.financeStoreReadObjects_(
  spreadsheet, "finance_approval_requests"
)[0];
const storedCorrectionCommand = JSON.parse(storedCorrectionRequest.commandJson);
assert.strictEqual(reviewRows[0].commandHash, storedCorrectionRequest.commandHash);
assert.notStrictEqual(reviewRows[0].commandHash, context.financeHash_(correction));
assert.strictEqual(
  storedCorrectionCommand.data.replacementIssue.billingSnapshot.bankAccountText,
  "変更後銀行 支店 普通 7654321"
);
assert.strictEqual(
  storedCorrectionCommand.data.replacementInvoice.correctionOfInvoiceId,
  "invoice-1",
  "訂正版と元請求の関連はサーバーで固定する"
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(
    storedCorrectionCommand.data.reversal, "lines"
  ),
  false,
  "取消明細をブラウザ指定として承認本文へ保存しない"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(storedCorrectionCommand.serverTargetSnapshot)),
  {
    format: "CDP_FINANCE_CORRECTION_TARGET_V1",
    commandType: "CORRECT_INVOICE",
    targetType: "invoice",
    targetId: "invoice-1",
    customerId: "customer-1",
    originalInvoiceAmount: 1100,
    cancellationAmount: 1100,
    cancellationTotalExTax: 1000,
    cancellationTax: 100,
    cancellationTaxGroups: JSON.parse(JSON.stringify(
      result.state.invoices.find(
        (row) => row.id === "invoice-1"
      ).taxGroups
    )),
    cancellationTaxGroupsHash: context.financeHash_(
      result.state.invoices.find((row) => row.id === "invoice-1").taxGroups
    ),
    cancellationScope: "FULL_ACTIVE_BILLING_BALANCE",
    expectedOriginalEffectiveBilledAfter: 0,
    replacementInvoiceId: "invoice-2",
    replacementAmount: 2200,
    replacementTotalExTax: 2000,
    replacementTax: 200,
    replacementTaxGroupsHash: context.financeHash_(
      context.financeCalculateInvoice_({
        lines: correction.data.replacementInvoice.lines,
        pricingMode: correction.data.replacementInvoice.pricingMode
      }, result.state.companyPolicy).taxGroups
    ),
    originalInvoiceHash: context.financeHash_(
      result.state.invoices.find((row) => row.id === "invoice-1")
    ),
    originalInvoiceIntegrityKey: result.state.invoices.find(
      (row) => row.id === "invoice-1"
    ).immutableKey
  },
  "承認hashには元請求総額・正本から算出した実取消額・新請求額を別々に封印する"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(reviewRows[0].commandSummary)),
  {
    type: "CORRECT_INVOICE",
    transactionId: "credit-1",
    targetType: "invoice",
    targetId: "invoice-1",
    customerId: "customer-1",
    originalInvoiceAmount: 1100,
    cancellationAmount: 1100,
    cancellationScope: "FULL_ACTIVE_BILLING_BALANCE",
    expectedOriginalEffectiveBilledAfter: 0,
    replacementTargetId: "invoice-2",
    replacementAmount: 2200,
    accountingDate: "2026-07-25",
    amountBasis: "TAX_INCLUDED_JPY"
  }
);
assert.strictEqual(Object.prototype.hasOwnProperty.call(reviewRows[0], "commandJson"), false);
assert.strictEqual(JSON.stringify(reviewRows[0]).includes("更新講習"), false);
assert.strictEqual(JSON.stringify(reviewRows[0]).includes("訂正"), false);
const refundSummaryCommand = {
  type: "RECORD_REFUND",
  data: {
    id: "refund-summary",
    customerId: "customer-1",
    amount: 100,
    accountingDate: "2026-07-25",
    referenceNo: "RF-SECRET-1234"
  }
};
const refundSummary = context.financeStoreApprovalCommandSummary_({
  commandType: refundSummaryCommand.type,
  commandJson: context.financeStoreStableStringify_(refundSummaryCommand),
  commandHash: context.financeHash_(refundSummaryCommand)
}, result.state);
assert.strictEqual(refundSummary.referenceNoLast4, "1234");
assert.strictEqual(
  refundSummary.referenceNoHash,
  context.financeHash_("rf-secret-1234")
);
assert.strictEqual(
  JSON.stringify(refundSummary).includes("RF-SECRET-1234"),
  false,
  "承認一覧へ管理番号の全文を露出しない"
);
// 行hashまで書き換えたように見せても、承認時に正本から再計算した
// 実取消額・新請求額と一致しなければ実行しない。
const correctionApprovalSheet = spreadsheet.getSheetByName(
  "finance_approval_requests"
);
const correctionCommandJsonColumn =
  context.FINANCE_STORE_SCHEMAS.finance_approval_requests.indexOf(
    "commandJson"
  ) + 1;
const correctionCommandHashColumn =
  context.FINANCE_STORE_SCHEMAS.finance_approval_requests.indexOf(
    "commandHash"
  ) + 1;
const originalCorrectionCommandJson = storedCorrectionRequest.commandJson;
const originalCorrectionCommandHash = storedCorrectionRequest.commandHash;
const tamperedCorrectionCommand = JSON.parse(originalCorrectionCommandJson);
tamperedCorrectionCommand.serverTargetSnapshot.cancellationAmount = 1;
tamperedCorrectionCommand.serverTargetSnapshot.replacementAmount = 1;
correctionApprovalSheet
  .getRange(
    storedCorrectionRequest._rowNumber, correctionCommandJsonColumn, 1, 1
  )
  .setValue(context.financeStoreStableStringify_(tamperedCorrectionCommand));
correctionApprovalSheet
  .getRange(
    storedCorrectionRequest._rowNumber, correctionCommandHashColumn, 1, 1
  )
  .setValue(context.financeHash_(tamperedCorrectionCommand));
actor = "accounting@example.com";
assertCode(
  () => context.financeStoreApprove_({
    requestId: request.requestId,
    idempotencyKey: "approval-correction-tamper-0001"
  }),
  "FINANCE_CORRECTION_TARGET_CHANGED"
);
assert.strictEqual(
  spreadsheet.getSheetByName("finance_events").getLastRow(),
  correctionEventsBeforeAttacks,
  "承認時再検証に失敗した訂正でイベントを追加しない"
);
correctionApprovalSheet
  .getRange(
    storedCorrectionRequest._rowNumber, correctionCommandJsonColumn, 1, 1
  )
  .setValue(originalCorrectionCommandJson);
correctionApprovalSheet
  .getRange(
    storedCorrectionRequest._rowNumber, correctionCommandHashColumn, 1, 1
  )
  .setValue(originalCorrectionCommandHash);
actor = "admin@example.com";
assertCode(() => context.financeStoreApprove_({ requestId: request.requestId }), "FINANCE_SELF_APPROVAL_FORBIDDEN");
actor = "accounting@example.com";
result = context.financeStoreApprove_({
  requestId: request.requestId,
  idempotencyKey: "approval-correction-0001"
});
assert.strictEqual(result.revision, 3, "訂正は1回の承認につき1リビジョン");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(result.state.invoices.find((row) => row.id === "invoice-1"))),
  originalBeforeCorrection,
  "訂正元の発行済み請求書は不変"
);
assert.strictEqual(result.state.invoices.find((row) => row.id === "invoice-2").status, "ISSUED");
const correctionEventCount = spreadsheet.getSheetByName("finance_events").getLastRow();
const correctionRetry = context.financeStoreApprove_({
  requestId: request.requestId,
  idempotencyKey: "approval-correction-0001"
});
assert.strictEqual(correctionRetry.idempotentReplay, true);
assert.strictEqual(correctionRetry.eventId, result.eventId);
assert.strictEqual(
  spreadsheet.getSheetByName("finance_events").getLastRow(),
  correctionEventCount,
  "承認応答の再送でeventを二重追加しない"
);

// 承認対象の途中で台帳が更新されたら、承認待ちを再利用できない状態にする。
actor = "admin@example.com";
const approvedRequestRetry = context.financeStoreRequestApproval_({
  expectedRevision: 2,
  command: correction,
  reasonCode: "CORRECT",
  idempotencyKey: "request-correction-0001"
});
assert.strictEqual(approvedRequestRetry.idempotentReplay, true);
assert.strictEqual(approvedRequestRetry.pendingApproval, false);
assert.strictEqual(approvedRequestRetry.status, "APPROVED_EXECUTED");
assert.strictEqual(approvedRequestRetry.executedRevision, 3);
const rejectedCommand = {
  type: "POST_JOURNAL",
  data: {
    id: "journal-rejected",
    accountingDate: "2026-07-26",
    description: "却下試験",
    lines: [
      { side: "D", account: "1000-普通預金", amount: 20, memo: "" },
      { side: "C", account: "2100-預り金", amount: 20, memo: "" }
    ]
  }
};
const rejectedRequest = context.financeStoreRequestApproval_({
  expectedRevision: 3,
  command: rejectedCommand,
  reasonCode: "MANUAL",
  idempotencyKey: "request-rejected-0001"
});
const financeAuditSheet = spreadsheet.getSheetByName("finance_audit");
const missingPendingAuditRow = financeAuditSheet.getLastRow();
financeAuditSheet.getRange(missingPendingAuditRow, 1, 1, 15).clearContent();
const repairedRejectedRequest = context.financeStoreRequestApproval_({
  expectedRevision: 3,
  command: rejectedCommand,
  reasonCode: "MANUAL",
  idempotencyKey: "request-rejected-0001"
});
assert.strictEqual(repairedRejectedRequest.idempotentReplay, true);
assert.ok(context.financeStoreReadObjects_(spreadsheet, "finance_audit").some(
  (row) => row.eventState === "PENDING_APPROVAL" &&
    row.approvalRequestId === rejectedRequest.requestId
));
actor = "accounting@example.com";
context.financeStoreRejectApproval_({
  requestId: rejectedRequest.requestId,
  reasonCode: "DECLINED"
});
actor = "admin@example.com";
const rejectedRequestRetry = context.financeStoreRequestApproval_({
  expectedRevision: 3,
  command: rejectedCommand,
  reasonCode: "MANUAL",
  idempotencyKey: "request-rejected-0001"
});
assert.strictEqual(rejectedRequestRetry.idempotentReplay, true);
assert.strictEqual(rejectedRequestRetry.pendingApproval, false);
assert.strictEqual(rejectedRequestRetry.status, "REJECTED");
request = context.financeStoreRequestApproval_({
  expectedRevision: 3,
  reasonCode: "MANUAL",
  command: { type: "POST_JOURNAL", data: {
    id: "journal-manual", accountingDate: "2026-07-26", description: "調整",
    lines: [
      { side: "D", account: "1000-普通預金", amount: 10, memo: "借方" },
      { side: "C", account: "2100-預り金", amount: 10, memo: "貸方" }
    ]
  }}
});
const receiptCommand = { type: "RECORD_RECEIPT", data: {
  id: "payment-1", customerId: "customer-1", accountingDate: "2026-07-26", amount: 1100,
  method: "bank", journalEntryId: "journal-payment-1"
} };
result = execute(3, receiptCommand, undefined, "client-receipt-0001");
assert.strictEqual(result.revision, 4);
const receiptEventCount = spreadsheet.getSheetByName("finance_events").getLastRow();
const receiptRetry = execute(
  3, receiptCommand, undefined, "client-receipt-0001"
);
assert.strictEqual(receiptRetry.idempotentReplay, true);
assert.strictEqual(receiptRetry.eventId, result.eventId);
assert.strictEqual(spreadsheet.getSheetByName("finance_events").getLastRow(), receiptEventCount);
assertCode(
  () => execute(3, {
    type: "RECORD_RECEIPT",
    data: {
      id: "payment-conflict",
      customerId: "customer-1",
      accountingDate: "2026-07-26",
      amount: 1,
      method: "bank",
      journalEntryId: "journal-payment-conflict"
    }
  }, undefined, "client-receipt-0001"),
  "FINANCE_IDEMPOTENCY_CONFLICT"
);
actor = "accounting@example.com";
assertCode(() => context.financeStoreApprove_({ requestId: request.requestId }), "CONCURRENT_MODIFICATION");
const completedRequests = context.financeStoreListApprovals_({ includeCompleted: true });
assert.strictEqual(completedRequests.find((row) => row.requestId === request.requestId).status, "STALE");

// 再生成可能な投影を消しても、append-only 正本から再構築できる。
let current = context.financeStoreGetState_();
const invoiceProjection = spreadsheet.getSheetByName("invoices");
invoiceProjection.getRange(2, 1, Math.max(1, invoiceProjection.getLastRow() - 1), 14).clearContent();
current = context.financeStoreGetState_();
assert.strictEqual(invoiceProjection.getLastRow() - 1, current.state.invoices.length);
invoiceProjection.values[1][12] = "tampered-payload-hash";
current = context.financeStoreGetState_();
assert.notStrictEqual(invoiceProjection.values[1][12], "tampered-payload-hash");
assert.strictEqual(spreadsheet.getSheetByName("finance_events").getLastRow() - 1, current.revision + 1);

// event 追記後、checkpoint 更新前に停止しても「未保存」と誤表示せず、
// 次回読込が event を再生して checkpoint / meta / projection を自己修復する。
const originalWriteCheckpoint = context.financeStoreWriteCheckpoint_;
let interruptCheckpointOnce = true;
context.financeStoreWriteCheckpoint_ = function (...args) {
  if (interruptCheckpointOnce) {
    interruptCheckpointOnce = false;
    const error = new Error("simulated checkpoint interruption");
    error.code = "SIMULATED_CHECKPOINT_INTERRUPTION";
    throw error;
  }
  return originalWriteCheckpoint.apply(null, args);
};
result = execute(current.revision, {
  type: "CREATE_DRAFT_INVOICE",
  data: draft("invoice-after-interruption", 500)
});
assert.strictEqual(result.success, true);
assert.strictEqual(result.committed, true);
assert.strictEqual(result.recoveryNeeded, true);
assert.strictEqual(result.recoveryCode, "SIMULATED_CHECKPOINT_INTERRUPTION");
assert.strictEqual(
  spreadsheet.getSheetByName("finance_events").getLastRow() - 1,
  result.revision + 1,
  "event は中断前に確定済み"
);
context.financeStoreWriteCheckpoint_ = originalWriteCheckpoint;
current = context.financeStoreGetState_();
assert.strictEqual(current.revision, result.revision);
assert.strictEqual(current.recoveryNeeded, false);
assert.ok(current.state.invoices.some((row) => row.id === "invoice-after-interruption"));

// 50,000文字を超える current state も、1セル30,000文字以下の固定chunkで保存する。
function largeDraft(id) {
  return {
    id,
    customerId: "customer-large",
    invoiceDate: "2026-07-27",
    accountingDate: "2026-07-27",
    dueDate: "2026-08-31",
    lines: Array.from({ length: 100 }, (_, index) => ({
      id: `${id}-line-${index}`,
      description: `更新講習明細-${index}-` + "X".repeat(120),
      quantity: 1,
      unitAmount: 1,
      taxCategory: "TAXABLE_10"
    }))
  };
}
for (let index = 0; index < 11; index += 1) {
  result = execute(current.revision, {
    type: "CREATE_DRAFT_INVOICE",
    data: largeDraft(`large-invoice-${index}`)
  });
  current = context.financeStoreGetState_();
}
assert.ok(
  spreadsheet.getSheetByName("invoice_lines").getMaxRows() > 1000,
  "1000行を超える投影は書込前にシート行数を自動拡張する"
);
assertCode(
  () => context.financeStoreEnsureSheetCapacity_(
    spreadsheet.getSheetByName("invoices"),
    context.FINANCE_STORE.MAX_SHEET_ROWS + 1
  ),
  "FINANCE_SHEET_ROW_LIMIT"
);
const currentStateJson = context.financeStoreStableStringify_(current.state);
assert.ok(currentStateJson.length > 50000, "試験状態はGoogle Sheetsの1セル上限を超える");
const checkpointRows = context.financeStoreReadObjects_(spreadsheet, "finance_state_chunks");
assert.ok(checkpointRows.length > 1, "状態が複数chunkに分割される");
checkpointRows.forEach((row) => {
  assert.ok(String(row.stateChunk).length <= context.FINANCE_STORE.CHUNK_CHAR_SIZE);
  assert.ok(String(row.stateChunk).length < context.FINANCE_STORE.CELL_CHAR_LIMIT);
});
context.financeStoreReadObjects_(spreadsheet, "finance_events").forEach((row) => {
  Object.keys(row).forEach((key) => {
    if (key !== "_rowNumber" && typeof row[key] === "string") {
      assert.ok(row[key].length <= context.FINANCE_STORE.CELL_CHAR_LIMIT);
    }
  });
});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.financeStoreVerifyFullReplay_(spreadsheet))),
  { success: true, revision: current.revision, stateHash: current.stateHash },
  "全eventをfinanceApplyCommand_で再生検証できる"
);
const originalReplayEvents = context.financeStoreReplayEvents_;
let fullReplayCalls = 0;
context.financeStoreReplayEvents_ = function (...args) {
  fullReplayCalls += 1;
  return originalReplayEvents.apply(null, args);
};
context.financeStoreGetState_();
assert.strictEqual(fullReplayCalls, 0, "通常のUI読込では全event再生を行わない");
const health = context.financeStoreHealthCheck_({ forceFullReplay: true });
assert.strictEqual(health.healthy, true);
assert.strictEqual(health.fullReplayPerformed, true);
assert.strictEqual(health.fullReplayDue, false);
assert.strictEqual(fullReplayCalls, 1, "健全性検査では明示的に全eventを再生する");
const recentHealth = context.financeStoreHealthCheck_({});
assert.strictEqual(recentHealth.fullReplayPerformed, false);
assert.strictEqual(fullReplayCalls, 1, "24時間以内の定期検査は全再生を繰り返さない");
context.financeStoreReplayEvents_ = originalReplayEvents;

// バックアップはevent、分割checkpoint、監査、承認を含み、全event再生で検証する。
actor = "admin@example.com";
const lateReceiptRetry = execute(
  3, receiptCommand, undefined, "client-receipt-0001"
);
assert.strictEqual(lateReceiptRetry.idempotentReplay, true);
assert.strictEqual(lateReceiptRetry.revision, 4);
assert.strictEqual(lateReceiptRetry.state.revision, 4);
assert.strictEqual(context.financeStoreGetState_().revision, current.revision);
actor = "renewal@example.com";
assertCode(() => context.financeStoreGetState_(), "STORE_ACCESS_DENIED");
actor = "viewer@example.com";
assertCode(() => context.financeStoreGetState_(), "STORE_ACCESS_DENIED");
actor = "accounting@example.com";
assert.strictEqual(context.financeStoreGetState_().configured, true);
actor = "admin@example.com";

// A backup run records PREPARED before Drive I/O and resumes the same intent
// after hard stops without creating duplicate registry rows or files.
function financeBackupFileCount(backupId) {
  const expectedName = `renewal_finance_${backupId}.json`;
  return Object.values(driveFiles).filter((file) =>
    file.folderId === "mock-backup-folder" &&
    typeof file.getName === "function" &&
    file.getName() === expectedName
  ).length;
}
function exerciseBackupHardStop(callerRunId, point) {
  context.financeStoreRestoreFaultInjection_ = (actual) => {
    if (actual === point) throw new Error(`simulated backup hard stop: ${point}`);
  };
  assert.throws(
    () => context.financeStoreCreateBackup_({
      callerRunId,
      noteCode: "SYSTEM_BACKUP"
    }),
    new RegExp(point)
  );
  context.financeStoreRestoreFaultInjection_ = undefined;
  const intent = context.financeStoreGetRegisteredBackupForCallerRunId_(
    spreadsheet, callerRunId
  );
  assert.ok(intent);
  const completed = context.financeStoreCreateBackup_({
    callerRunId,
    noteCode: "SYSTEM_BACKUP"
  });
  assert.strictEqual(completed.backupId, intent.backupId);
  assert.strictEqual(
    context.financeStoreReadBackupRegistry_(spreadsheet)
      .filter((row) => row.backupId === completed.backupId).length,
    1
  );
  assert.strictEqual(financeBackupFileCount(completed.backupId), 1);
  return completed;
}
exerciseBackupHardStop("system-run-intent-0001", "AFTER_BACKUP_INTENT");
const completedBeforeAdvance = exerciseBackupHardStop(
  "system-run-file-0001", "AFTER_BACKUP_FILE"
);
exerciseBackupHardStop(
  "system-run-registry-0001", "AFTER_BACKUP_REGISTRY"
);
driveCreateFailure = "after";
let unknownFinanceCreateError;
try {
  context.financeStoreCreateBackup_({
    callerRunId: "system-run-drive-response-loss-0001",
    noteCode: "SYSTEM_BACKUP"
  });
} catch (error) {
  unknownFinanceCreateError = error;
}
assert.strictEqual(
  unknownFinanceCreateError.code,
  "FINANCE_BACKUP_FILE_OUTCOME_UNCERTAIN"
);
assert.strictEqual(unknownFinanceCreateError.financeDriveOutcomeUncertain, true);
const unknownFinanceCreateIntent =
  context.financeStoreGetRegisteredBackupForCallerRunId_(
    spreadsheet, "system-run-drive-response-loss-0001"
  );
assert.strictEqual(
  financeBackupFileCount(unknownFinanceCreateIntent.backupId),
  1,
  "a committed file must remain recoverable when only the Drive response was lost"
);
const hiddenFinanceBackupFile = Object.values(driveFiles).find((file) =>
  file.folderId === "mock-backup-folder" &&
  file.getName() === `renewal_finance_${unknownFinanceCreateIntent.backupId}.json`
);
hiddenDriveFileIds.add(hiddenFinanceBackupFile.getId());
assertCode(
  () => context.financeStoreCreateBackup_({
    callerRunId: "system-run-drive-response-loss-0001",
    noteCode: "SYSTEM_BACKUP"
  }),
  "FINANCE_DRIVE_OUTCOME_UNRESOLVED"
);
assert.strictEqual(
  financeBackupFileCount(unknownFinanceCreateIntent.backupId),
  1,
  "a temporarily invisible response-loss file must not trigger a duplicate create"
);
hiddenDriveFileIds.delete(hiddenFinanceBackupFile.getId());
const recoveredUnknownFinanceCreate = context.financeStoreCreateBackup_({
  callerRunId: "system-run-drive-response-loss-0001",
  noteCode: "SYSTEM_BACKUP"
});
assert.strictEqual(
  recoveredUnknownFinanceCreate.backupId,
  unknownFinanceCreateIntent.backupId
);
assert.strictEqual(financeBackupFileCount(recoveredUnknownFinanceCreate.backupId), 1);

// A lost COMPLETE response must return the original verified snapshot even
// after newer ledger work; it must never silently create a newer replacement.
result = execute(current.revision, {
  type: "CREATE_DRAFT_INVOICE",
  data: draft("invoice-after-complete-backup", 2100)
});
current = context.financeStoreGetState_();
const completedRetryAfterAdvance = context.financeStoreCreateBackup_({
  callerRunId: "system-run-file-0001",
  noteCode: "SYSTEM_BACKUP"
});
assert.strictEqual(completedRetryAfterAdvance.idempotentReplay, true);
assert.strictEqual(
  completedRetryAfterAdvance.revision,
  completedBeforeAdvance.revision
);
assert.ok(completedRetryAfterAdvance.revision < current.revision);
assert.strictEqual(
  completedRetryAfterAdvance.backupId,
  completedBeforeAdvance.backupId
);

// PREPARED has no committed body yet. If the ledger advances, recreating it
// from the new state would mislabel the snapshot, so recovery stops.
context.financeStoreRestoreFaultInjection_ = (actual) => {
  if (actual === "AFTER_BACKUP_INTENT") {
    throw new Error("simulated backup hard stop: prepared source change");
  }
};
assert.throws(
  () => context.financeStoreCreateBackup_({
    callerRunId: "system-run-prepared-change-0001",
    noteCode: "SYSTEM_BACKUP"
  }),
  /prepared source change/
);
context.financeStoreRestoreFaultInjection_ = undefined;
result = execute(current.revision, {
  type: "CREATE_DRAFT_INVOICE",
  data: draft("invoice-after-prepared-backup", 2200)
});
current = context.financeStoreGetState_();
assertCode(
  () => context.financeStoreCreateBackup_({
    callerRunId: "system-run-prepared-change-0001",
    noteCode: "SYSTEM_BACKUP"
  }),
  "FINANCE_BACKUP_PREPARED_SOURCE_CHANGED"
);

const backup = context.financeStoreCreateBackup_({ noteCode: "MANUAL" });
assert.strictEqual(backup.revision, current.revision);
const publicFinanceBackups = context.financeStoreListBackups_();
assert.ok(publicFinanceBackups.length >= 5);
assert.ok(publicFinanceBackups.every((row) =>
  !Object.prototype.hasOwnProperty.call(row, "fileId") &&
  !Object.prototype.hasOwnProperty.call(row, "driveFileId")
));
const verifiedBackup = JSON.parse(JSON.stringify(
  context.financeStoreVerifyBackup_({ backupId: backup.backupId })
));
assert.strictEqual(verifiedBackup.success, true);
assert.strictEqual(verifiedBackup.backupId, backup.backupId);
assert.ok(Number.isFinite(new Date(verifiedBackup.createdAt).getTime()));
assert.strictEqual(verifiedBackup.revision, current.revision);
assert.strictEqual(verifiedBackup.stateHash, current.stateHash);
assert.strictEqual(verifiedBackup.contentHash, backup.contentHash);
const backupWrapper = JSON.parse(driveFiles[backup.fileId].blob.content);
assert.ok(Array.isArray(backupWrapper.body.events));
assert.ok(Array.isArray(backupWrapper.body.checkpointChunks));
assert.ok(Array.isArray(backupWrapper.body.audit));
assert.ok(Array.isArray(backupWrapper.body.approvalRequests));
assert.strictEqual(backupWrapper.body.events.length, current.revision + 1);
assert.strictEqual(
  context.financeStoreValidateBackupBody_(backupWrapper.body).stateHash,
  current.stateHash
);

// Only the single COMMITTED marker for this backup may follow its body audit;
// approval/control rows added later must stop disaster recovery.
const restoreControlAuditSheet = spreadsheet.getSheetByName("finance_audit");
const completionMarker = context.financeStoreReadObjects_(
  spreadsheet, "finance_audit"
).slice(-1)[0];
restoreControlAuditSheet.values.push(
  context.FINANCE_STORE_SCHEMAS.finance_audit.map(
    (header) => completionMarker[header] ?? ""
  )
);
assertCode(
  () => context.financeStoreControlEvidenceAfterBackup_(
    spreadsheet,
    context.financeStoreLoadRegisteredBackup_(
      spreadsheet, backup.backupId, true
    )
  ),
  "FINANCE_RESTORE_POST_BACKUP_CONTROL_ROWS"
);
restoreControlAuditSheet.values.pop();
const approvalSheet = spreadsheet.getSheetByName(
  "finance_approval_requests"
);
const approvalForControlTest = backupWrapper.body.approvalRequests[0];
approvalSheet.values.push(
  context.FINANCE_STORE_SCHEMAS.finance_approval_requests.map(
    (header) => approvalForControlTest[header] ?? ""
  )
);
assertCode(
  () => context.financeStoreControlEvidenceAfterBackup_(
    spreadsheet,
    context.financeStoreLoadRegisteredBackup_(
      spreadsheet, backup.backupId, true
    )
  ),
  "FINANCE_RESTORE_POST_BACKUP_CONTROL_ROWS"
);
approvalSheet.values.pop();

// 災害復旧は別管理者の15分承認を必須にし、正常・同一状態では世代を
// 切り替えないNOOPとして完了する。ブラウザが同じ確定を再送しても、
// 完了済みrequestIdから同じ結果だけを返す。
assertCode(
  () => context.financeStorePrepareDisasterRestore_({
    backupId: backup.backupId,
    approver: "admin@example.com",
    reasonCode: "DISASTER_RECOVERY_TEST"
  }),
  "FINANCE_RESTORE_SELF_APPROVAL_FORBIDDEN"
);
const restoreRequest = context.financeStorePrepareDisasterRestore_({
  backupId: backup.backupId,
  approver: "approver@example.com",
  reasonCode: "DISASTER_RECOVERY_TEST"
});
assert.strictEqual(restoreRequest.status, "AWAITING_APPROVAL");
assert.strictEqual(restoreRequest.noOp, true);
assert.strictEqual(restoreRequest.canApprove, false);
assert.ok(
  new Date(restoreRequest.expiresAt).getTime() -
    new Date(restoreRequest.requestedAt).getTime() <= 15 * 60 * 1000
);
actor = "accounting@example.com";
assertCode(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: restoreRequest.requestId,
    confirmRequestId: restoreRequest.requestId
  }),
  "STORE_ACCESS_DENIED"
);
actor = "approver@example.com";
assertCode(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: restoreRequest.requestId,
    confirmRequestId: restoreRequest.requestId + " "
  }),
  "FINANCE_RESTORE_REQUEST_ID_CONFIRM_MISMATCH"
);
const backupCountBeforeNoOp = context.financeStoreListBackups_().length;
context.financeStoreRestoreFaultInjection_ = (point) => {
  if (point === "NOOP_AFTER_COMPLETE") {
    throw new Error("simulated hard stop: NOOP_AFTER_COMPLETE");
  }
};
assert.throws(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: restoreRequest.requestId,
    confirmRequestId: restoreRequest.requestId
  }),
  /NOOP_AFTER_COMPLETE/
);
context.financeStoreRestoreFaultInjection_ = undefined;
const noOpRestore = context.financeStoreConfirmDisasterRestore_({
  confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
  requestId: restoreRequest.requestId,
  confirmRequestId: restoreRequest.requestId
});
assert.strictEqual(noOpRestore.restored, true);
assert.strictEqual(noOpRestore.noOp, true);
assert.strictEqual(noOpRestore.idempotentReplay, true);
assert.strictEqual(noOpRestore.activeStoreId, spreadsheet.getId());
assert.strictEqual(noOpRestore.safetyStoreId, spreadsheet.getId());
assert.strictEqual(noOpRestore.safetyFinanceBackupId, "");
assert.strictEqual(
  context.financeStoreListBackups_().length,
  backupCountBeforeNoOp,
  "NOOPではデータ変更がないため新しいbackupを作らず、hard stop後も重複しない"
);
const noOpRetry = context.financeStoreConfirmDisasterRestore_({
  confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
  requestId: restoreRequest.requestId,
  confirmRequestId: restoreRequest.requestId
});
assert.strictEqual(noOpRetry.idempotentReplay, true);
assert.strictEqual(noOpRetry.requestId, noOpRestore.requestId);
assert.strictEqual(
  storeAuditRowsBySpreadsheet[spreadsheet.getId()].filter((row) =>
    row.action === "FINANCE_DISASTER_RESTORE_SWITCH" &&
    row.correlationId === restoreRequest.requestId
  ).length,
  1
);

// 最新COMPLETE以外は過去版ロールバックとして拒否する。
actor = "admin@example.com";
context.financeStoreCreateBackup_({ noteCode: "AFTER_NOOP_TEST" });
const listedAfterNoOp = context.financeStoreListBackups_();
const nonLatestBackup = listedAfterNoOp.find((row) =>
  row.status === "COMPLETE" && row.latestRestoreCandidate !== true
);
assert.ok(nonLatestBackup);
assertCode(
  () => context.financeStorePrepareDisasterRestore_({
    backupId: nonLatestBackup.backupId,
    approver: "approver@example.com",
    reasonCode: "OLD_BACKUP_FORBIDDEN"
  }),
  "FINANCE_RESTORE_LATEST_BACKUP_REQUIRED"
);

// backup境界より後ろの生行・有効revisionを自動で捨てない。
const eventSheetForRestoreGuard = spreadsheet.getSheetByName("finance_events");
const appendedEventRow = eventSheetForRestoreGuard.getLastRow() + 1;
eventSheetForRestoreGuard.getRange(
  appendedEventRow, 1, 1, context.FINANCE_STORE_SCHEMAS.finance_events.length
).setValues([Array(context.FINANCE_STORE_SCHEMAS.finance_events.length).fill("unknown")]);
assertCode(
  () => context.financeStoreAssertNoPostBackupEventRows_(
    spreadsheet, current.revision, current.revision + 1
  ),
  "FINANCE_RESTORE_POST_BACKUP_ROWS"
);
eventSheetForRestoreGuard.getRange(
  appendedEventRow, 1, 1, context.FINANCE_STORE_SCHEMAS.finance_events.length
).clearContent();

// 全体世代の対象者と作成済み請求帳票がbackup invoiceと整合しない場合は停止。
context.storeReadRecords_ = () => [];
assertCode(
  () => context.financeStoreAssertRestoredCustomers_(spreadsheet, current.state),
  "FINANCE_RESTORE_CUSTOMER_MISSING"
);
context.storeReadRecords_ = undefined;
context.artifactLoadSettings_ = () => ({ allowedOutputEmails: "admin@example.com" });
const issuedInvoiceForArtifact = current.state.invoices.find(
  (invoice) => invoice.id === "invoice-1"
);
context.artifactReadAllRegistryRows_ = () => [{
  status: "prepared",
  kind: "billing",
  recordId: "customer-1",
  metadataJson: JSON.stringify({
    financeInvoice: {
      financeInvoiceId: "invoice-1",
      immutableKey: issuedInvoiceForArtifact.immutableKey
    }
  })
}];
assert.doesNotThrow(
  () => context.financeStoreAssertRestoredArtifacts_(current.state)
);
context.artifactReadAllRegistryRows_ = () => [{
  status: "prepared",
  kind: "billing",
  recordId: "customer-1",
  metadataJson: JSON.stringify({
    financeInvoice: {
      financeInvoiceId: "invoice-1",
      immutableKey: "tampered-immutable-key"
    }
  })
}];
assertCode(
  () => context.financeStoreAssertRestoredArtifacts_(current.state),
  "FINANCE_RESTORE_ARTIFACT_INCOMPATIBLE"
);
context.artifactLoadSettings_ = undefined;
context.artifactReadAllRegistryRows_ = undefined;

// copy前、stage書込後、pointer直前・直後の各停止点は明示され、
// 再実行時に同じrequest/stageを照合する設計である。
[
  "BEFORE_COPY",
  "AFTER_STAGE_COPY",
  "AFTER_STAGE_FINANCE_WRITE",
  "BEFORE_POINTER_SWITCH",
  "AFTER_POINTER_SWITCH",
  "AFTER_COMMITTING",
  "AFTER_BACKUP_INTENT",
  "AFTER_BACKUP_FILE",
  "AFTER_BACKUP_REGISTRY",
  "AFTER_BASELINE_BACKUP",
  "NOOP_BEFORE_COMPLETE",
  "NOOP_AFTER_COMPLETE"
].forEach((point) => {
  context.financeStoreRestoreFaultInjection_ = (actual) => {
    if (actual === point) throw new Error("simulated hard stop: " + point);
  };
  assert.throws(
    () => context.financeStoreRestoreFaultPoint_(point),
    new RegExp(point)
  );
});
context.financeStoreRestoreFaultInjection_ = undefined;

const tamperedBackupBody = JSON.parse(JSON.stringify(backupWrapper.body));
tamperedBackupBody.events[1].commandJson = "{}";
assertCode(
  () => context.financeStoreValidateBackupBody_(tamperedBackupBody),
  "FINANCE_EVENT_COMMAND_TAMPERED"
);
const missingAuditBackup = JSON.parse(JSON.stringify(backupWrapper.body));
const auditedEventId = missingAuditBackup.events[1].eventId;
missingAuditBackup.audit = missingAuditBackup.audit.filter(
  (row) => row.snapshotId !== auditedEventId
);
assertCode(
  () => context.financeStoreValidateBackupBody_(missingAuditBackup),
  "FINANCE_BACKUP_AUDIT_INCOMPLETE"
);
const duplicateApprovalBackup = JSON.parse(JSON.stringify(backupWrapper.body));
duplicateApprovalBackup.approvalRequests.push(
  JSON.parse(JSON.stringify(duplicateApprovalBackup.approvalRequests[0]))
);
assertCode(
  () => context.financeStoreValidateBackupBody_(duplicateApprovalBackup),
  "FINANCE_BACKUP_APPROVAL_DUPLICATE"
);
const wrongApprovalRevisionBackup = JSON.parse(JSON.stringify(backupWrapper.body));
wrongApprovalRevisionBackup.approvalRequests.find(
  (row) => row.status === "APPROVED_EXECUTED"
).executedRevision += 1;
assertCode(
  () => context.financeStoreValidateBackupBody_(wrongApprovalRevisionBackup),
  "FINANCE_BACKUP_APPROVAL_MISMATCH"
);

// 途中eventのchain値を改ざんしeventHashだけを合わせても、前eventとのchain照合で拒否する。
const events = spreadsheet.getSheetByName("finance_events");
events.values[2][9] = "tampered-previous-event-hash"; // revision 1, previousEventHash
const tamperedRow = context.financeStoreReadObjects_(spreadsheet, "finance_events")[1];
events.values[2][10] = context.financeHash_(
  context.financeStoreEventHashPayload_(context.financeStoreNormalizeEvent_(tamperedRow))
);
assertCode(() => context.financeStoreGetState_(), "FINANCE_EVENT_CHAIN_BROKEN");

// Exercise the real non-NOOP path. The source ledger stays corrupted and
// immutable; a full spreadsheet copy is repaired, validated, backed up, then
// activated by one Script Property switch. Every hard stop reuses the same
// stage and baseline backup.
context.storeReadRecords_ = () => [{
  recordId: "customer-1",
  deleted: false
}, {
  recordId: "customer-large",
  deleted: false
}];
actor = "admin@example.com";
const latestCorruptRestoreBackup = context.financeStoreListBackups_().find(
  (row) => row.latestRestoreCandidate === true
);
assert.ok(latestCorruptRestoreBackup);
const restoreBackupLoaded = context.financeStoreLoadRegisteredBackup_(
  spreadsheet, latestCorruptRestoreBackup.backupId, true
);
const corruptSourceEventHash = events.values[2][10];
const corruptSourceRawFingerprint =
  context.financeStoreRawFingerprint_(spreadsheet);
const corruptRestoreRequest =
  context.financeStorePrepareDisasterRestore_({
    backupId: latestCorruptRestoreBackup.backupId,
    approver: "approver@example.com",
    reasonCode: "DISASTER_CORRUPTION_RECOVERY"
  });
assert.strictEqual(corruptRestoreRequest.noOp, false);
actor = "approver@example.com";

driveCopyFailure = "after";
let unknownStageCopyError;
try {
  context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: corruptRestoreRequest.requestId,
    confirmRequestId: corruptRestoreRequest.requestId
  });
} catch (error) {
  unknownStageCopyError = error;
}
assert.strictEqual(
  unknownStageCopyError.code,
  "FINANCE_RESTORE_STAGE_COPY_OUTCOME_UNCERTAIN"
);
assert.strictEqual(unknownStageCopyError.financeDriveOutcomeUncertain, true);
assert.strictEqual(
  scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID,
  spreadsheet.getId(),
  "a lost stage-copy response must not switch the active store"
);
const responseLossStageName = context.financeStoreStageName_(
  context.financeStoreFindRestoreRequest_(
    spreadsheet, corruptRestoreRequest.requestId
  )
);
assert.strictEqual(
  Object.values(driveFiles).filter((file) =>
    file.folderId === "mock-data-folder" &&
    file.getName() === responseLossStageName
  ).length,
  1
);
const responseLossStageFile = Object.values(driveFiles).find((file) =>
  file.folderId === "mock-data-folder" &&
  file.getName() === responseLossStageName
);
hiddenDriveFileIds.add(responseLossStageFile.getId());
assertCode(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: corruptRestoreRequest.requestId,
    confirmRequestId: corruptRestoreRequest.requestId
  }),
  "FINANCE_DRIVE_OUTCOME_UNRESOLVED"
);
assert.strictEqual(
  Object.values(driveFiles).filter((file) =>
    file.folderId === "mock-data-folder" &&
    file.getName() === responseLossStageName
  ).length,
  1,
  "a temporarily invisible stage copy must not trigger a duplicate copy"
);
hiddenDriveFileIds.delete(responseLossStageFile.getId());

context.financeStoreRestoreFaultInjection_ = (point) => {
  if (point === "AFTER_BACKUP_FILE") {
    throw new Error("simulated restore hard stop: AFTER_BACKUP_FILE");
  }
};
assert.throws(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: corruptRestoreRequest.requestId,
    confirmRequestId: corruptRestoreRequest.requestId
  }),
  /AFTER_BACKUP_FILE/
);
assert.strictEqual(
  scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID,
  spreadsheet.getId(),
  "baseline backup hard stop must not switch the active store"
);
assert.strictEqual(events.values[2][10], corruptSourceEventHash);
assert.strictEqual(
  context.financeStoreRawFingerprint_(spreadsheet),
  corruptSourceRawFingerprint
);
const committingRequest = context.financeStoreFindRestoreRequest_(
  spreadsheet, corruptRestoreRequest.requestId
);
assert.strictEqual(committingRequest.status, "COMMITTING");
context.financeStoreUpdateRestoreRequest_(spreadsheet, committingRequest, {
  expiresAt: new Date(
    new Date(committingRequest.requestedAt).getTime() + 1
  ).toISOString()
});

// COMMITTING remains resumable after its original 15-minute approval window.
context.financeStoreRestoreFaultInjection_ = (point) => {
  if (point === "BEFORE_POINTER_SWITCH") {
    throw new Error("simulated restore hard stop: BEFORE_POINTER_SWITCH");
  }
};
assert.throws(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: corruptRestoreRequest.requestId,
    confirmRequestId: corruptRestoreRequest.requestId
  }),
  /BEFORE_POINTER_SWITCH/
);
assert.strictEqual(
  scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID,
  spreadsheet.getId()
);
assert.strictEqual(events.values[2][10], corruptSourceEventHash);

// A lost response after the atomic pointer switch is result-unknown. Reusing
// the same request returns the durable completion; it never performs a second
// copy or a second baseline backup.
context.financeStoreRestoreFaultInjection_ = (point) => {
  if (point === "AFTER_POINTER_SWITCH") {
    throw new Error("simulated restore hard stop: AFTER_POINTER_SWITCH");
  }
};
assert.throws(
  () => context.financeStoreConfirmDisasterRestore_({
    confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
    requestId: corruptRestoreRequest.requestId,
    confirmRequestId: corruptRestoreRequest.requestId
  }),
  /AFTER_POINTER_SWITCH/
);
context.financeStoreRestoreFaultInjection_ = undefined;
const activeStageId = scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID;
assert.notStrictEqual(activeStageId, spreadsheet.getId());
const restoredResult = context.financeStoreConfirmDisasterRestore_({
  confirm: context.FINANCE_DISASTER_RESTORE.CONFIRM,
  requestId: corruptRestoreRequest.requestId,
  confirmRequestId: corruptRestoreRequest.requestId
});
assert.strictEqual(restoredResult.idempotentReplay, true);
assert.strictEqual(restoredResult.noOp, false);
assert.strictEqual(restoredResult.activeStoreId, activeStageId);
assert.strictEqual(restoredResult.safetyStoreId, spreadsheet.getId());
assert.strictEqual(events.values[2][10], corruptSourceEventHash);
assertCode(
  () => context.financeStoreReadCurrent_(spreadsheet, "admin@example.com"),
  "FINANCE_EVENT_CHAIN_BROKEN"
);

const restoreStageName = context.financeStoreStageName_(
  context.financeStoreFindRestoreRequest_(
    spreadsheets[activeStageId], corruptRestoreRequest.requestId
  )
);
assert.strictEqual(
  Object.values(driveFiles).filter((file) =>
    file.folderId === "mock-data-folder" &&
    file.getName() === restoreStageName
  ).length,
  1
);
const baselineBackupId = restoredResult.safetyFinanceBackupId;
assert.ok(baselineBackupId.startsWith("finance_backup_post_"));
assert.strictEqual(financeBackupFileCount(baselineBackupId), 1);
const activeStage = spreadsheets[activeStageId];
assert.strictEqual(readStoreMeta(activeStage).spreadsheetId, activeStageId);
assert.strictEqual(
  context.financeStoreReadBackupRegistry_(activeStage)
    .filter((row) => row.backupId === baselineBackupId).length,
  1
);
const postRestoreBaseline = context.financeStoreLoadRegisteredBackup_(
  activeStage, baselineBackupId, true
);
assert.strictEqual(
  postRestoreBaseline.replayed.stateHash,
  restoreBackupLoaded.replayed.stateHash
);
assert.strictEqual(
  postRestoreBaseline.body.spreadsheetId,
  activeStageId
);
const activeLatestBackup = context.financeStoreListBackups_().find(
  (row) => row.latestRestoreCandidate === true
);
assert.strictEqual(activeLatestBackup.backupId, baselineBackupId);
const activeFinanceAudit = context.financeStoreReadObjects_(
  activeStage, "finance_audit"
);
assert.strictEqual(
  activeFinanceAudit.filter((row) =>
    row.action === "BACKUP_CREATE" &&
    row.eventState === "COMMITTED" &&
    row.correlationId === latestCorruptRestoreBackup.backupId
  ).length,
  1,
  "the original backup COMMITTED suffix must survive staging"
);
assert.strictEqual(
  activeFinanceAudit.filter((row) =>
    row.action === "BACKUP_CREATE" &&
    row.eventState === "COMMITTED" &&
    row.correlationId === baselineBackupId
  ).length,
  1,
  "the post-restore baseline COMMITTED marker must be unique"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(
    context.financeStoreInspectLiveLedger_(activeStage)
  )).healthy,
  true
);

// 入金・返金・相殺/貸倒の反対取引は常に二者承認対象。
["REVERSE_RECEIPT", "REVERSE_REFUND", "REVERSE_SETTLEMENT"].forEach((type) => {
  assert.strictEqual(context.financeStoreNeedsApproval_(type), true);
});

// 申請時に元取引をサーバー正本から封印し、承認時にも再封印して一致を確認する。
// ブラウザは金額・対象者を送れず、単独実行もできない。
actor = "admin@example.com";
let reversalStoreCurrent = context.financeStoreGetState_();
let reversalStoreReceipt = execute(
  reversalStoreCurrent.revision,
  {
    type: "RECORD_RECEIPT",
    data: {
      id: "store-reversal-receipt",
      customerId: "customer-store-reversal",
      accountingDate: "2026-08-02",
      amount: 777,
      method: "銀行振込",
      reference: "bank-row-store-reversal",
      journalEntryId: "store-reversal-receipt-journal"
    }
  },
  "STORE_REVERSAL_FIXTURE",
  "store-reversal-receipt-0001"
);
const storeReversalCommand = {
  type: "REVERSE_RECEIPT",
  data: {
    id: "store-reversal-receipt-r",
    originalPaymentId: "store-reversal-receipt",
    accountingDate: "2026-08-02",
    reason: "重複入金の訂正",
    journalEntryId: "store-reversal-receipt-r-journal"
  }
};
assertCode(
  () => execute(
    reversalStoreReceipt.revision,
    storeReversalCommand,
    "RECEIPT_REVERSAL",
    "store-reversal-direct-0001"
  ),
  "FINANCE_SECOND_APPROVAL_REQUIRED"
);
assertCode(
  () => context.financeStoreRequestApproval_({
    expectedRevision: reversalStoreReceipt.revision,
    command: {
      type: "REVERSE_RECEIPT",
      data: {
        ...storeReversalCommand.data,
        amount: 1
      }
    },
    reasonCode: "RECEIPT_REVERSAL",
    idempotencyKey: "store-reversal-override-0001"
  }),
  "REVERSAL_FIELD_NOT_EDITABLE"
);
const storeReversalRequest = context.financeStoreRequestApproval_({
  expectedRevision: reversalStoreReceipt.revision,
  command: storeReversalCommand,
  reasonCode: "RECEIPT_REVERSAL",
  idempotencyKey: "store-reversal-request-0001"
});
const storeReversalRequestRetry = context.financeStoreRequestApproval_({
  expectedRevision: reversalStoreReceipt.revision,
  command: storeReversalCommand,
  reasonCode: "RECEIPT_REVERSAL",
  idempotencyKey: "store-reversal-request-0001"
});
assert.strictEqual(storeReversalRequestRetry.idempotentReplay, true);
assert.strictEqual(storeReversalRequestRetry.requestId, storeReversalRequest.requestId);
const activeReversalStore = spreadsheets[
  scriptPropertyValues.RENEWAL_DATA_SPREADSHEET_ID
];
let storeReversalApproval = context.financeStoreReadObjects_(
  activeReversalStore, "finance_approval_requests"
).find((row) => row.requestId === storeReversalRequest.requestId);
const sealedStoreReversalCommand = JSON.parse(storeReversalApproval.commandJson);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(sealedStoreReversalCommand.data)),
  storeReversalCommand.data,
  "金額・対象者を承認コマンド本文へブラウザ入力として追加しない"
);
assert.strictEqual(
  sealedStoreReversalCommand.serverTargetSnapshot.amount,
  777
);
assert.strictEqual(
  sealedStoreReversalCommand.serverTargetSnapshot.customerId,
  "customer-store-reversal"
);
assert.strictEqual(
  sealedStoreReversalCommand.serverTargetSnapshot.targetHash,
  context.financeHash_(
    reversalStoreReceipt.state.payments.find(
      (row) => row.id === "store-reversal-receipt"
    )
  )
);
const reversalApprovalListRow = context.financeStoreListApprovals_({}).find(
  (row) => row.requestId === storeReversalRequest.requestId
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(reversalApprovalListRow.commandSummary)),
  {
    type: "REVERSE_RECEIPT",
    transactionId: "store-reversal-receipt-r",
    targetType: "receipt",
    targetId: "store-reversal-receipt",
    targetKind: "RECEIPT",
    customerId: "customer-store-reversal",
    amount: 777,
    accountingDate: "2026-08-02",
    amountSource: "SERVER_ORIGINAL_TRANSACTION",
    amountBasis: "JPY"
  }
);

// 台帳行自体が同じでも、申請に保存したサーバー封印を書き換えれば承認時再封印で停止する。
const reversalApprovalSheet = activeReversalStore.getSheetByName(
  "finance_approval_requests"
);
const reversalCommandJsonColumn =
  context.FINANCE_STORE_SCHEMAS.finance_approval_requests.indexOf("commandJson") + 1;
const reversalCommandHashColumn =
  context.FINANCE_STORE_SCHEMAS.finance_approval_requests.indexOf("commandHash") + 1;
const originalSealedCommandJson = storeReversalApproval.commandJson;
const originalSealedCommandHash = storeReversalApproval.commandHash;
sealedStoreReversalCommand.serverTargetSnapshot.amount = 1;
const tamperedSealedCommandJson =
  context.financeStoreStableStringify_(sealedStoreReversalCommand);
reversalApprovalSheet
  .getRange(storeReversalApproval._rowNumber, reversalCommandJsonColumn, 1, 1)
  .setValue(tamperedSealedCommandJson);
reversalApprovalSheet
  .getRange(storeReversalApproval._rowNumber, reversalCommandHashColumn, 1, 1)
  .setValue(context.financeHash_(sealedStoreReversalCommand));
actor = "accounting@example.com";
assertCode(
  () => context.financeStoreApprove_({
    requestId: storeReversalRequest.requestId,
    idempotencyKey: "store-reversal-approval-0001"
  }),
  "FINANCE_REVERSAL_TARGET_CHANGED"
);
reversalApprovalSheet
  .getRange(storeReversalApproval._rowNumber, reversalCommandJsonColumn, 1, 1)
  .setValue(originalSealedCommandJson);
reversalApprovalSheet
  .getRange(storeReversalApproval._rowNumber, reversalCommandHashColumn, 1, 1)
  .setValue(originalSealedCommandHash);
const approvedStoreReversal = context.financeStoreApprove_({
  requestId: storeReversalRequest.requestId,
  idempotencyKey: "store-reversal-approval-0001"
});
assert.strictEqual(
  context.financeCustomerPosition_(
    approvedStoreReversal.state, "customer-store-reversal"
  ).receipts,
  0
);
assert.strictEqual(
  approvedStoreReversal.state.payments.find(
    (row) => row.id === "store-reversal-receipt-r"
  ).amount,
  777
);

const financeCleanupOperation = {
  action: "CREATE",
  operationId: "cleanup-tracking-test",
  name: "finance-cleanup-tracking-test.json",
  mimeType: "application/json",
  parentId: "mock-backup-folder",
  label: "finance cleanup tracking test"
};
const financeCleanupFailureKey =
  context.financeStoreDriveFailureKey_(financeCleanupOperation);
const financeCleanupFile = createDriveBlobFile(
  {
    content: "{}",
    contentType: "application/json",
    name: financeCleanupOperation.name
  },
  financeCleanupOperation.parentId
);
driveRemoveFailure = "simulated finance permanent delete failure";
let trackedFinanceCleanupError;
try {
  context.financeStorePermanentlyDeleteNewDriveItem_(
    financeCleanupFile,
    financeCleanupFile.getId(),
    financeCleanupOperation.label,
    new Error("simulated finance validation failure"),
    financeCleanupFailureKey,
    financeCleanupOperation
  );
} catch (error) {
  trackedFinanceCleanupError = error;
}
assert.strictEqual(
  trackedFinanceCleanupError.code,
  "FINANCE_DRIVE_CLEANUP_FAILED"
);
assert.strictEqual(trackedFinanceCleanupError.financeDriveCleanupFailed, true);
assert.strictEqual(
  JSON.parse(scriptPropertyValues[financeCleanupFailureKey]).state,
  "CLEANUP_FAILED"
);
assertCode(
  () => context.financeStoreCreatePrivateDriveFileInParent_({
    name: financeCleanupOperation.name,
    mimeType: financeCleanupOperation.mimeType,
    parentId: financeCleanupOperation.parentId,
    description: "",
    blob: context.Utilities.newBlob(
      "{}", financeCleanupOperation.mimeType, financeCleanupOperation.name
    ),
    label: financeCleanupOperation.label,
    operationId: financeCleanupOperation.operationId
  }),
  "FINANCE_DRIVE_CLEANUP_UNRESOLVED"
);
delete driveFiles[financeCleanupFile.getId()];

assert.strictEqual(
  /\.createFile\(|\.makeCopy\(/.test(
    financeStoreSource + "\n" + financeDisasterRestoreSource
  ),
  false,
  "finance backup and restore staging must not use default-visible DriveApp creation"
);
assert.ok(
  financeStoreSource.includes("ignoreDefaultVisibility: true") &&
  financeStoreSource.includes("Drive.Files.get") &&
  financeStoreSource.includes("Drive.Files.remove") &&
  financeDisasterRestoreSource.includes(
    "financeStoreCopyPrivateSpreadsheetInParent_"
  ),
  "finance Drive creation must enforce atomic parent placement, readback and cleanup"
);

console.log("finance_store_logic_test: OK");
