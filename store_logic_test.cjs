const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const acorn = require("acorn");

const dataStoreSource = fs.readFileSync("DataStore.js", "utf8");
const generationSource = fs.readFileSync("DataStoreGeneration.js", "utf8");
const parsedSources = [
  ["DataStore.js", dataStoreSource],
  ["DataStoreGeneration.js", generationSource]
].map(([file, source]) => [
  file,
  source,
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" })
]);

function topLevelGlobalNames(ast) {
  const names = [];
  ast.body.forEach((node) => {
    if (node.type === "FunctionDeclaration" && node.id) names.push(node.id.name);
    if (node.type === "VariableDeclaration") {
      node.declarations.forEach((declaration) => {
        if (declaration.id.type === "Identifier") names.push(declaration.id.name);
      });
    }
  });
  return names;
}

const globalOwners = new Map();
parsedSources.forEach(([file, , ast]) => {
  topLevelGlobalNames(ast).forEach((name) => {
    assert.equal(
      globalOwners.has(name),
      false,
      `duplicate Apps Script global ${name}: ${globalOwners.get(name)} and ${file}`
    );
    globalOwners.set(name, file);
  });
});
[
  "storeResolveSheet_",
  "storeReadActiveDataGeneration_",
  "storeEnsureActiveDataGenerationPointer_",
  "storeDataGenerationCapacity_",
  "storeProjectedDataGenerationCells_",
  "storeProjectedGenerationRegistryCells_",
  "storeProjectedActiveGenerationPointerCells_",
  "storeProjectedBackupReconciliationAuditRows_",
  "storeProjectedSheetAppendCells_",
  "storeProjectedBulkSideEffectCells_",
  "storeAssertDataGenerationCapacityForCreate_",
  "storeAssertCompleteDataGeneration_",
  "storeCommitDataGeneration_"
].forEach((name) => {
  assert.equal(globalOwners.get(name), "DataStoreGeneration.js", `${name} must stay in the generation module`);
});
const source = `${dataStoreSource}\n${generationSource}`;

class MockRange {
  constructor(sheet, row, column, rows, columns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }
  setValues(values) {
    const isAuditCommitted = this.sheet.name === "audit" &&
      values.length === 1 && values[0][2] === "COMMITTED";
    if (isAuditCommitted && state.auditCommittedFailureCount > 0) {
      state.auditCommittedFailureCount -= 1;
      throw new Error("simulated committed audit append failure");
    }
    const isBackupComplete = this.sheet.name === "backups" &&
      values.length === 1 && values[0][9] === "COMPLETE";
    if (isBackupComplete && state.backupCompleteFailure === "before") {
      state.backupCompleteFailure = "";
      throw new Error("simulated stop before backup registry completion");
    }
    if (state.failSetValuesSheetPrefix &&
        this.sheet.name.startsWith(state.failSetValuesSheetPrefix)) {
      state.failSetValuesSheetPrefix = "";
      throw new Error("simulated generation sheet write stop");
    }
    const isGenerationManifestWrite =
      this.sheet.name === "_data_generations" && this.row >= 2;
    if (isGenerationManifestWrite &&
        state.generationManifestFailure === "before") {
      state.generationManifestFailure = "";
      throw new Error("simulated generation manifest stop before commit");
    }
    assert.equal(values.length, this.rows);
    values.forEach((row, rowIndex) => {
      assert.equal(row.length, this.columns);
      for (let columnIndex = 0; columnIndex < this.columns; columnIndex += 1) {
        const targetRow = this.row - 1 + rowIndex;
        const targetColumn = this.column - 1 + columnIndex;
        if (!this.sheet.values[targetRow]) this.sheet.values[targetRow] = [];
        this.sheet.values[targetRow][targetColumn] = row[columnIndex];
      }
    });
    if (isBackupComplete && state.backupCompleteFailure === "after") {
      state.backupCompleteFailure = "";
      throw new Error("simulated stop after backup registry completion");
    }
    if (isGenerationManifestWrite &&
        state.generationManifestFailure === "after") {
      state.generationManifestFailure = "";
      throw new Error("simulated generation manifest response loss");
    }
    return this;
  }
  setValue(value) {
    if (state.pointerFailure === "before") {
      state.pointerFailure = "";
      throw new Error("simulated pointer stop before commit");
    }
    this.setValues([[value]]);
    if (state.pointerFailure === "after") {
      state.pointerFailure = "";
      throw new Error("simulated pointer stop after commit");
    }
    return this;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, rowIndex) =>
      Array.from({ length: this.columns }, (_, columnIndex) =>
        (this.sheet.values[this.row - 1 + rowIndex] || [])[this.column - 1 + columnIndex] ?? ""
      )
    );
  }
  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => String(value)));
  }
  clearContent() {
    for (let rowIndex = 0; rowIndex < this.rows; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < this.columns; columnIndex += 1) {
        const targetRow = this.row - 1 + rowIndex;
        const targetColumn = this.column - 1 + columnIndex;
        if (!this.sheet.values[targetRow]) this.sheet.values[targetRow] = [];
        this.sheet.values[targetRow][targetColumn] = "";
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
    this.maxColumns = 26;
  }
  setName(name) { this.name = name; return this; }
  getName() { return this.name; }
  getRange(row, column, rows = 1, columns = 1) {
    return new MockRange(this, row, column, rows, columns);
  }
  getLastRow() {
    let last = 0;
    this.values.forEach((row, index) => {
      if ((row || []).some((value) => value !== "" && value !== undefined && value !== null)) last = index + 1;
    });
    return last;
  }
  setFrozenRows() { return this; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxColumns; }
  insertRowsAfter(afterPosition, howMany) {
    assert.equal(afterPosition, this.maxRows);
    assert(howMany > 0);
    this.maxRows += howMany;
    return this;
  }
}

class MockSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = [new MockSheet("Sheet1")];
  }
  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
  getSheetByName(name) { return this.sheets.find((sheet) => sheet.name === name) || null; }
}

class MockBlob {
  constructor(text, type, name) {
    this.text = text;
    this.type = type;
    this.name = name;
  }
  getDataAsString() {
    if (Array.isArray(this.text) || ArrayBuffer.isView(this.text)) {
      return Buffer.from(Array.from(this.text), "binary").toString("utf8");
    }
    return this.text;
  }
}

class MockFile {
  constructor(id, blob) {
    this.id = id;
    this.blob = blob;
    this.parent = null;
    this.description = "";
    this.trashed = false;
    this.sharingAccess = "PRIVATE";
    this.editors = [];
    this.viewers = [];
    this.commenters = [];
  }
  getId() { return this.id; }
  getName() { return this.blob.name; }
  getMimeType() { return this.blob.type; }
  getUrl() { return `https://drive.google.com/file/d/${this.id}/view`; }
  getBlob() { return this.blob; }
  getDescription() { return this.description; }
  setDescription(value) { this.description = String(value || ""); return this; }
  moveTo(folder) { this.parent = folder; return this; }
  setTrashed(value) { this.trashed = Boolean(value); return this; }
  setSharing(access) {
    this.sharingAccess = String(access);
    return this;
  }
  getSharingAccess() { return this.sharingAccess; }
  getEditors() { return this.editors.slice(); }
  getViewers() { return this.viewers.slice(); }
  getCommenters() { return this.commenters.slice(); }
  getParents() {
    const parents = this.parent ? [this.parent] : [];
    let index = 0;
    return {
      hasNext: () => index < parents.length,
      next: () => parents[index++]
    };
  }
}

class MockFolder {
  constructor(state, id, name, parent = null) {
    this.state = state;
    this.id = id;
    this.name = name;
    this.parent = parent;
    this.description = "";
    this.trashed = false;
    this.ownerEmail = state.effective;
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getMimeType() { return "application/vnd.google-apps.folder"; }
  getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
  getDescription() { return this.description; }
  getOwner() {
    return { getEmail: () => this.ownerEmail };
  }
  setDescription(value) { this.description = String(value || ""); return this; }
  setTrashed(value) { this.trashed = Boolean(value); return this; }
  setSharing() { return this; }
  getSharingAccess() { return "PRIVATE"; }
  getEditors() { return []; }
  getViewers() { return []; }
  getCommenters() { return []; }
  createFolder(name) {
    const folder = new MockFolder(this.state, `folder-${++this.state.sequence}`, name, this);
    this.state.folders.set(folder.id, folder);
    return folder;
  }
  createFile(blob) {
    if (this.state.backupFileFailure === "before") {
      this.state.backupFileFailure = "";
      throw new Error("simulated stop before backup file creation");
    }
    const file = new MockFile(`file-${++this.state.sequence}`, blob);
    file.parent = this;
    if (this.state.nextBackupFileEditor) {
      file.editors.push(this.state.nextBackupFileEditor);
      this.state.nextBackupFileEditor = "";
    }
    this.state.files.set(file.id, file);
    if (this.state.backupFileFailure === "after") {
      this.state.backupFileFailure = "";
      throw new Error("simulated stop after backup file creation");
    }
    return file;
  }
  getFilesByName(name) {
    const files = [...this.state.files.values()].filter(
      (file) => file.parent === this && file.getName() === name
    );
    let index = 0;
    return {
      hasNext: () => index < files.length,
      next: () => files[index++]
    };
  }
  getParents() {
    const parents = this.parent ? [this.parent] : [];
    let index = 0;
    return {
      hasNext: () => index < parents.length,
      next: () => parents[index++]
    };
  }
}

const state = {
  sequence: 0,
  uuid: 0,
  actor: "owner@example.com",
  effective: "owner@example.com",
  hostedDomain: "example.com",
  identityEmailOverride: "",
  identityIssuer: "https://accounts.google.com",
  identityVerified: true,
  identitySubject: "google-subject-owner",
  identityIssuedAtOffsetSeconds: -60,
  identityExpiryOffsetSeconds: 600,
  properties: new Map(),
  spreadsheets: new Map(),
  folders: new Map(),
  files: new Map(),
  openedIds: [],
  lockHeld: false,
  financeEnabled: false,
  financeValidated: 0,
  financeRevision: 7,
  financeStateHash: "f".repeat(64),
  financeBackups: new Map(),
  financeBackupFailure: "",
  failSetValuesSheetPrefix: "",
  generationManifestFailure: "",
  pointerFailure: "",
  backupFileFailure: "",
  backupCompleteFailure: "",
  nextBackupFileEditor: "",
  auditCommittedFailureCount: 0,
  driveRemoveFailure: "",
  permissionPages: new Map(),
  permissionListFailureToken: "",
  setPropertiesFailureMode: "",
  failGetPropertiesAfterSetProperties: false,
  getPropertiesFailureCount: 0
};

const rootFolder = new MockFolder(state, "root-folder", "My Drive", null);
state.folders.set(rootFolder.id, rootFolder);
const bootstrapOwnershipFolder = new MockFolder(
  state,
  "1XmQirjBrQR-uC_GuBVXAyRK5zfqtoQwN",
  "2026年度",
  rootFolder
);
bootstrapOwnershipFolder.ownerEmail = "owner@example.com";
state.folders.set(bootstrapOwnershipFolder.id, bootstrapOwnershipFolder);

const scriptProperties = {
  getProperty: (key) => state.properties.get(key) || null,
  setProperty: (key, value) => state.properties.set(key, String(value)),
  setProperties: (values) => {
    const failureMode = state.setPropertiesFailureMode;
    state.setPropertiesFailureMode = "";
    if (failureMode === "before") {
      throw new Error("simulated Script Properties write failure before commit");
    }
    Object.entries(values).forEach(
      ([key, value]) => state.properties.set(key, String(value))
    );
    if (state.failGetPropertiesAfterSetProperties) {
      state.failGetPropertiesAfterSetProperties = false;
      state.getPropertiesFailureCount += 1;
    }
    if (failureMode === "after") {
      throw new Error("simulated Script Properties response loss after commit");
    }
  },
  deleteProperty: (key) => state.properties.delete(key),
  getProperties: () => {
    if (state.getPropertiesFailureCount > 0) {
      state.getPropertiesFailureCount -= 1;
      throw new Error("simulated Script Properties readback failure");
    }
    return Object.fromEntries(state.properties);
  }
};

const context = {
  console,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Math,
  RegExp,
  Error,
  Set,
  Map,
  PropertiesService: { getScriptProperties: () => scriptProperties },
  SpreadsheetApp: {
    create: () => { throw new Error("SpreadsheetApp.create must not be used"); },
    openById: (id) => {
      state.openedIds.push(id);
      if (!state.spreadsheets.has(id)) throw new Error("not found");
      return state.spreadsheets.get(id);
    },
    flush: () => {}
  },
  DriveApp: {
    Access: { PRIVATE: "PRIVATE" },
    Permission: { NONE: "NONE" },
    createFolder: () => { throw new Error("DriveApp.createFolder must not be used"); },
    getRootFolder: () => rootFolder,
    getFolderById: (id) => {
      if (!state.folders.has(id)) throw new Error("folder not found");
      return state.folders.get(id);
    },
    getFileById: (id) => {
      if (!state.files.has(id)) throw new Error("file not found");
      return state.files.get(id);
    }
  },
  Drive: {
    Files: {
      create: (metadata, blob, options) => {
        assert.equal(options.ignoreDefaultVisibility, true);
        assert.equal(options.supportsAllDrives, true);
        assert(Array.isArray(metadata.parents) && metadata.parents.length === 1);
        const parent = state.folders.get(String(metadata.parents[0]));
        if (!parent) throw new Error("direct parent not found");
        let item;
        if (metadata.mimeType === "application/vnd.google-apps.folder") {
          item = new MockFolder(
            state,
            `folder-${++state.sequence}`,
            String(metadata.name),
            parent
          );
          item.setDescription(metadata.description);
          state.folders.set(item.id, item);
        } else if (metadata.mimeType === "application/vnd.google-apps.spreadsheet") {
          const id = `store-${++state.sequence}`;
          const spreadsheet = new MockSpreadsheet(id, String(metadata.name));
          state.spreadsheets.set(id, spreadsheet);
          item = new MockFile(
            id,
            new MockBlob("", metadata.mimeType, String(metadata.name))
          );
          item.parent = parent;
          item.setDescription(metadata.description);
          state.files.set(id, item);
        } else {
          item = parent.createFile(blob);
          item.setDescription(metadata.description);
        }
        return {
          id: item.getId(),
          name: item.getName(),
          mimeType: item.getMimeType(),
          parents: [parent.getId()],
          description: item.getDescription(),
          trashed: false
        };
      },
      get: (id) => {
        const item = state.files.get(String(id)) || state.folders.get(String(id));
        if (!item) throw new Error("Drive metadata not found");
        return {
          id: item.getId(),
          name: item.getName(),
          mimeType: item.getMimeType(),
          parents: item.parent ? [item.parent.getId()] : [],
          description: item.getDescription(),
          trashed: item.trashed === true
        };
      },
      remove: (id) => {
        if (state.driveRemoveFailure) {
          const message = state.driveRemoveFailure;
          state.driveRemoveFailure = "";
          throw new Error(message);
        }
        const key = String(id);
        if (state.files.has(key)) {
          state.files.delete(key);
          state.spreadsheets.delete(key);
          return;
        }
        const folder = state.folders.get(key);
        if (!folder || folder === rootFolder) throw new Error("folder not found");
        [...state.files.values()].forEach((file) => {
          if (file.parent === folder) {
            state.files.delete(file.getId());
            state.spreadsheets.delete(file.getId());
          }
        });
        [...state.folders.values()].forEach((child) => {
          if (child.parent === folder) state.folders.delete(child.getId());
        });
        state.folders.delete(key);
      }
    },
    Permissions: {
      list: (id, options) => {
        assert.equal(options.supportsAllDrives, true);
        assert.equal(options.pageSize, 100);
        assert(String(options.fields || "").includes("nextPageToken"));
        assert(String(options.fields || "").includes("permissions"));
        const token = String(options.pageToken || "");
        if (state.permissionListFailureToken &&
            (state.permissionListFailureToken === "*" ||
             state.permissionListFailureToken === token)) {
          state.permissionListFailureToken = "";
          throw new Error("simulated permission page failure");
        }
        const pages = state.permissionPages.get(String(id));
        if (!pages) {
          return {
            permissions: [{
              id: `owner-${id}`,
              type: "user",
              role: "owner",
              deleted: false
            }]
          };
        }
        if (!Object.prototype.hasOwnProperty.call(pages, token)) {
          throw new Error("permission page token not found");
        }
        return pages[token];
      }
    }
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => {
        if (state.lockHeld) return false;
        state.lockHeld = true;
        return true;
      },
      releaseLock: () => { state.lockHeld = false; }
    })
  },
  Session: {
    getActiveUser: () => ({ getEmail: () => state.actor }),
    getEffectiveUser: () => ({ getEmail: () => state.effective })
  },
  ScriptApp: {
    getIdentityToken: () => {
      const payload = {
        iss: state.identityIssuer,
        email: state.identityEmailOverride || state.actor,
        email_verified: state.identityVerified,
        sub: state.identitySubject,
        iat: Math.floor(Date.now() / 1000) +
          state.identityIssuedAtOffsetSeconds,
        exp: Math.floor(Date.now() / 1000) +
          state.identityExpiryOffsetSeconds
      };
      if (state.hostedDomain) payload.hd = state.hostedDomain;
      const encode = (value) =>
        Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
      return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest: (_algorithm, text) => Array.from(crypto.createHash("sha256").update(String(text), "utf8").digest()),
    base64DecodeWebSafe: (text) =>
      Array.from(Buffer.from(String(text), "base64url")),
    getUuid: () => `00000000-0000-4000-8000-${String(++state.uuid).padStart(12, "0")}`,
    newBlob: (text, type, name) => new MockBlob(text, type, name)
  }
};
vm.createContext(context);
vm.runInContext(source, context);
context.financeStoreIsConfigured_ = () => state.financeEnabled;
context.financeStoreReadMeta_ = () => ({
  currentRevision: String(state.financeRevision),
  currentStateHash: state.financeStateHash
});
context.financeStoreReadLatestSnapshot_ = () => ({
  state: {
    invoices: [],
    payments: [],
    credit_notes: []
  }
});
context.financeStoreBackupBody_ = (_spreadsheet, info) => ({
  format: "CDP_RENEWAL_FINANCE_BACKUP_V1", formatVersion: 1, schemaVersion: 1,
  financeSchemaVersion: "1", backupId: info.backupId, revision: info.revision,
  stateHash: info.stateHash, snapshots: [], audit: [], approvalRequests: []
});
context.financeStoreValidateBackupBody_ = (body) => {
  assert.equal(body.format, "CDP_RENEWAL_FINANCE_BACKUP_V1");
  state.financeValidated += 1;
  return true;
};
context.financeStoreGetRegisteredBackupForCallerRunId_ = (_spreadsheet, callerRunId) =>
  state.financeBackups.get(String(callerRunId || "")) || null;
context.financeStoreCreateRegisteredBackupUnlocked_ = (_spreadsheet, _actor, input) => {
  const callerRunId = String(input && input.callerRunId || "");
  const existing = state.financeBackups.get(callerRunId);
  if (existing) return { success: true, ...existing, idempotentReplay: true };
  if (state.financeBackupFailure) {
    const code = state.financeBackupFailure;
    state.financeBackupFailure = "";
    const error = new Error("simulated finance backup failure");
    error.code = code;
    throw error;
  }
  const created = {
    backupId: `finance_backup_${callerRunId}`,
    status: "COMPLETE",
    revision: state.financeRevision,
    stateHash: state.financeStateHash,
    contentHash: "c".repeat(64),
    noteCode: String(input.noteCode || "")
  };
  state.financeBackups.set(callerRunId, created);
  return { success: true, ...created };
};

function expectCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code, code);
}

expectCode(() => context.storeSetup_({}), "STORE_SETUP_CONFIRM_REQUIRED");
state.actor = "owner@gmail.com";
state.effective = "owner@gmail.com";
state.hostedDomain = "";
expectCode(
  () => context.storeAssertSetupDeploymentMode_(
    "owner@gmail.com",
    { deploymentMode: context.RENEWAL_STORE.SETUP_MODE_WORKSPACE }
  ),
  "STORE_WORKSPACE_OWNER_REQUIRED"
);
expectCode(
  () => context.storeAssertSetupDeploymentMode_(
    "owner@gmail.com",
    { deploymentMode: context.RENEWAL_STORE.SETUP_MODE_PERSONAL }
  ),
  "STORE_PERSONAL_SINGLE_USER_CONFIRM_REQUIRED"
);
assert.equal(
  context.storeAssertSetupDeploymentMode_(
    "owner@gmail.com",
    {
      deploymentMode: context.RENEWAL_STORE.SETUP_MODE_PERSONAL,
      personalSingleUserConfirm:
        context.RENEWAL_STORE.PERSONAL_SETUP_CONFIRM
    }
  ),
  context.RENEWAL_STORE.SETUP_MODE_PERSONAL
);
state.actor = "owner@proton.me";
state.effective = "owner@proton.me";
state.hostedDomain = "";
expectCode(
  () => context.storeAssertSetupDeploymentMode_(
    "owner@proton.me",
    { deploymentMode: context.RENEWAL_STORE.SETUP_MODE_WORKSPACE }
  ),
  "STORE_WORKSPACE_OWNER_REQUIRED"
);
state.actor = "owner@example.com";
state.effective = "owner@example.com";
state.hostedDomain = "example.com";
state.identityExpiryOffsetSeconds = -1;
expectCode(
  () => context.storeAssertSetupDeploymentMode_(
    "owner@example.com",
    { deploymentMode: context.RENEWAL_STORE.SETUP_MODE_WORKSPACE }
  ),
  "STORE_GOOGLE_IDENTITY_MISMATCH"
);
state.identityExpiryOffsetSeconds = 600;
assert.equal(
  context.storeAssertSetupDeploymentMode_(
    "owner@example.com",
    { deploymentMode: context.RENEWAL_STORE.SETUP_MODE_WORKSPACE }
  ),
  context.RENEWAL_STORE.SETUP_MODE_WORKSPACE
);
assert.doesNotThrow(
  () => context.storeAssertBootstrapOwnershipAnchor_("owner@example.com")
);
bootstrapOwnershipFolder.ownerEmail = "other-owner@example.com";
expectCode(
  () => context.storeAssertBootstrapOwnershipAnchor_("owner@example.com"),
  "STORE_BOOTSTRAP_OWNER_MISMATCH"
);
bootstrapOwnershipFolder.ownerEmail = "owner@example.com";
const setupPublicationKeys = [
  context.RENEWAL_STORE.SPREADSHEET_ID_KEY,
  context.RENEWAL_STORE.DATA_FOLDER_ID_KEY,
  context.RENEWAL_STORE.BACKUP_FOLDER_ID_KEY
];
function exerciseSetupPublicationReadFailure(setFailureMode, expectedCode) {
  state.setPropertiesFailureMode = setFailureMode;
  state.failGetPropertiesAfterSetProperties = true;
  expectCode(() => context.storeSetup_({
    confirm: context.RENEWAL_STORE.SETUP_CONFIRM,
    deploymentMode: context.RENEWAL_STORE.SETUP_MODE_WORKSPACE
  }), expectedCode);

  const publishedDataFolderId = state.properties.get(
    context.RENEWAL_STORE.DATA_FOLDER_ID_KEY
  );
  assert(publishedDataFolderId);
  assert(state.folders.has(publishedDataFolderId));
  const setupTrackingEntries = [...state.properties.entries()].filter(
    ([key]) => key.startsWith(
      `${context.RENEWAL_STORE.DRIVE_FAILURE_PREFIX}SETUP_`
    )
  );
  const trackingEntries = setupTrackingEntries.filter(
    ([key, value]) => {
      try {
        const parsed = JSON.parse(value);
        return parsed.action === "PUBLISH_PROPERTIES";
      } catch {
        return false;
      }
    }
  );
  assert.equal(trackingEntries.length, 1);
  assert.equal(JSON.parse(trackingEntries[0][1]).state, "PUBLICATION_UNCERTAIN");
  assert.equal(
    JSON.parse(trackingEntries[0][1]).parentId,
    publishedDataFolderId
  );

  // Simulate the documented manual review: confirm the exact private tree,
  // unpublish all three IDs, then permanently remove the unpublished tree.
  setupPublicationKeys.forEach((key) => state.properties.delete(key));
  context.Drive.Files.remove(publishedDataFolderId);
  assert.equal(state.folders.has(publishedDataFolderId), false);
  setupTrackingEntries.forEach(([key]) => state.properties.delete(key));
}

exerciseSetupPublicationReadFailure(
  "after",
  "STORE_SETUP_PROPERTY_PUBLICATION_UNCERTAIN"
);
exerciseSetupPublicationReadFailure(
  "",
  "STORE_SETUP_PROPERTY_READBACK_FAILED"
);
const setup = context.storeSetup_({
  confirm: context.RENEWAL_STORE.SETUP_CONFIRM,
  deploymentMode: context.RENEWAL_STORE.SETUP_MODE_WORKSPACE
});
assert.equal(setup.configured, true);
assert.equal(setup.schemaVersion, 1);
assert.equal(setup.deploymentMode, context.RENEWAL_STORE.SETUP_MODE_WORKSPACE);
assert.equal(
  [...state.properties.keys()].filter((key) =>
    key.startsWith(`${context.RENEWAL_STORE.DRIVE_FAILURE_PREFIX}SETUP_`)
  ).length,
  0,
  "successful property publication must retire exact setup-create tracking"
);
const storeId = state.properties.get(context.RENEWAL_STORE.SPREADSHEET_ID_KEY);
assert(storeId);
assert(!context.RENEWAL_STORE.PROTECTED_SOURCE_IDS.includes(storeId));
const setupDataFolder = state.folders.get(
  state.properties.get(context.RENEWAL_STORE.DATA_FOLDER_ID_KEY)
);
const setupBackupFolder = state.folders.get(
  state.properties.get(context.RENEWAL_STORE.BACKUP_FOLDER_ID_KEY)
);
assert.strictEqual(setupDataFolder.parent, rootFolder);
assert.strictEqual(setupBackupFolder.parent, setupDataFolder);
assert.strictEqual(state.files.get(storeId).parent, setupDataFolder);
assert.strictEqual(
  state.files.get(storeId).getMimeType(),
  "application/vnd.google-apps.spreadsheet"
);
const setupSpreadsheet = state.spreadsheets.get(storeId);
const setupSheetNames = setupSpreadsheet.getSheets().map(
  (sheet) => sheet.getName()
);
assert.deepEqual(
  setupSheetNames.slice(0, 6),
  ["_meta", "records", "roles", "audit", "backups", "import_batches"]
);
const initialGeneration = context.storeReadActiveDataGeneration_(
  setupSpreadsheet
);
assert.notEqual(
  initialGeneration,
  context.RENEWAL_STORE.BASE_DATA_GENERATION,
  "setup must promote canonical rows into an aggregate-hashed generation"
);
assert(
  setupSheetNames.includes(
    context.storeDataGenerationSheetName_("records", initialGeneration)
  ) &&
  setupSheetNames.includes(
    context.storeDataGenerationSheetName_("roles", initialGeneration)
  ) &&
  setupSheetNames.includes(context.RENEWAL_STORE.GENERATION_REGISTRY_SHEET)
);
context.storeAssertCompleteDataGeneration_(
  setupSpreadsheet, initialGeneration, true
);
const setupDataFolderOwnerPermission = {
  id: "owner-setup-data",
  type: "user",
  role: "owner",
  deleted: false
};
state.permissionPages.set(setupDataFolder.getId(), {
  "": {
    permissions: [setupDataFolderOwnerPermission],
    nextPageToken: "second"
  },
  second: {
    permissions: [{
      id: "late-viewer",
      type: "user",
      role: "reader",
      deleted: false
    }]
  }
});
expectCode(
  () => context.storeAssertResourcePrivate_(
    setupDataFolder, "paged ACL fixture"
  ),
  "STORE_ACL_UNEXPECTED_PERMISSION"
);
[
  { id: "group-commenter", type: "group", role: "commenter" },
  { id: "domain-reader", type: "domain", role: "reader" },
  { id: "anyone-reader", type: "anyone", role: "reader" }
].forEach((permission) => {
  state.permissionPages.set(setupDataFolder.getId(), {
    "": {
      permissions: [
        setupDataFolderOwnerPermission,
        { ...permission, deleted: false }
      ]
    }
  });
  expectCode(
    () => context.storeAssertResourcePrivate_(
      setupDataFolder, "non-owner ACL fixture"
    ),
    "STORE_ACL_UNEXPECTED_PERMISSION"
  );
});
state.permissionPages.set(setupDataFolder.getId(), {
  "": {
    permissions: [setupDataFolderOwnerPermission],
    nextPageToken: "unavailable"
  }
});
state.permissionListFailureToken = "unavailable";
expectCode(
  () => context.storeAssertResourcePrivate_(
    setupDataFolder, "permission API failure fixture"
  ),
  "STORE_ACL_PERMISSION_LIST_FAILED"
);
state.permissionPages.set(setupDataFolder.getId(), {
  "": {
    permissions: [setupDataFolderOwnerPermission],
    nextPageToken: "repeat"
  },
  repeat: {
    permissions: [],
    nextPageToken: "repeat"
  }
});
expectCode(
  () => context.storeAssertResourcePrivate_(
    setupDataFolder, "permission paging loop fixture"
  ),
  "STORE_ACL_PERMISSION_PAGING_INVALID"
);
state.permissionPages.delete(setupDataFolder.getId());
const savedPermissionList = context.Drive.Permissions.list;
context.Drive.Permissions.list = undefined;
expectCode(
  () => context.storeAssertResourcePrivate_(
    setupDataFolder, "permission API unavailable fixture"
  ),
  "STORE_ACL_PERMISSION_LIST_UNAVAILABLE"
);
context.Drive.Permissions.list = savedPermissionList;
context.storeAssertResourcePrivate_(setupDataFolder, "owner-only ACL fixture");
assert.equal(context.storeGetSetupState_().role, "admin");
const recordsSheetCapacity = state.spreadsheets.get(storeId).getSheetByName("records");
context.storeEnsureSheetRows_(recordsSheetCapacity, 1001);
assert.equal(recordsSheetCapacity.getMaxRows(), 1001, "行上限到達前にシートを拡張する");
expectCode(() => context.storeEnsureSheetRows_(recordsSheetCapacity, 200001), "STORE_SHEET_ROW_LIMIT");
state.actor = "";
expectCode(() => context.storeGetSetupState_(), "STORE_ACTIVE_USER_REQUIRED");
state.actor = "owner@example.com";
state.effective = "other-owner@example.com";
expectCode(() => context.storeBootstrapActorEmail_(), "STORE_BOOTSTRAP_OWNER_REQUIRED");
state.effective = "owner@example.com";
context.RENEWAL_STORE.PROTECTED_SOURCE_IDS.forEach((id) => assert(!state.openedIds.includes(id)));

const first = context.storeUpsertRecord_({
  record: {
    id: "rec-1",
    personId: "UC-0001",
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: "個人情報テスト",
    invoiceNo: "INV-001",
    invoiceStatus: "発行済",
    feeExTax: "1000",
    paidAmount: "0"
  },
  expectedVersion: 0,
  reasonCode: "INITIAL_ENTRY"
});
assert.equal(first.version, 1);
assert.equal(first.managementId, "UC-0001|2026|1");
assert.equal(context.storeListRecords_().length, 1);
expectCode(() => context.storeUpsertRecord_({
  record: { ...first.record, targetName: "forged approval" },
  expectedVersion: first.version,
  reasonCode: "NORMAL_UPDATE",
  approver: "approver@example.com"
}), "STORE_APPROVER_NOT_ALLOWED");
assert.equal(context.storeGetRecord_("rec-1").version, first.version);

const anotherSession = context.storeUpsertRecord_({
  record: { id: "rec-1b", personId: "UC-0001", fiscalYear: "2027", sessionNo: "2", targetName: "別年度回", invoiceNo: "INV-001B" },
  expectedVersion: 0,
  reasonCode: "INITIAL_ENTRY"
});
assert.equal(anotherSession.managementId, "UC-0001|2027|2");
assert.equal(context.storeListRecords_().length, 2);

const preparedBefore = context.storeGetRecord_("rec-1b");
const preparedRetryInput = {
  record: { ...preparedBefore.record, targetName: "prepared exact retry" },
  expectedVersion: preparedBefore.version,
  reasonCode: "PREPARED_EXACT_RETRY"
};
state.failSetValuesSheetPrefix = "records";
assert.throws(
  () => context.storeUpsertRecord_(preparedRetryInput),
  /simulated generation sheet write stop/
);
const preparedLifecycleMarker = JSON.parse(
  state.properties.get(context.RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY)
);
assert.equal(
  preparedLifecycleMarker.format,
  "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3"
);
assert.equal(preparedLifecycleMarker.rowProof.sheetName, "records");
const preparedLifecycleTime = preparedLifecycleMarker.rowProof.updatedAt;
while (Date.now() <= new Date(preparedLifecycleTime).getTime() + 2) {
  // Force the retry's newly proposed server timestamp to differ from T1.
}
expectCode(() => context.storeUpsertRecord_({
  record: { ...preparedBefore.record, targetName: "different overwrite" },
  expectedVersion: preparedBefore.version,
  reasonCode: "PREPARED_DIFFERENT_RETRY"
}), "STORE_PREPARED_MUTATION_PENDING");
const preparedResolved = context.storeUpsertRecord_(preparedRetryInput);
assert.equal(preparedResolved.committed, true);
assert.equal(preparedResolved.version, preparedBefore.version + 1);
assert.equal(preparedResolved.updatedAt, preparedLifecycleTime);
assert.equal(
  context.storeGetRecord_("rec-1b").updatedAt,
  preparedLifecycleTime
);
assert.equal(
  state.properties.has(context.RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY),
  false
);
const lifecycleT1 = "2026-07-24T01:02:03.004Z";
const lifecycleT2 = "2026-07-24T01:02:04.005Z";
const preparedRoleRow = [
  "future-role@example.com", "viewer", true, 1,
  lifecycleT1, lifecycleT1, "owner@example.com"
];
const preparedRoleProof = context.storeAuditedRowLifecycleProof_(
  "roles", 99, preparedRoleRow
);
const retriedRoleRow = preparedRoleRow.slice();
retriedRoleRow[4] = lifecycleT2;
retriedRoleRow[5] = lifecycleT2;
const restoredRoleRow = context.storeApplyPendingAuditedRowLifecycle_(
  {
    format: "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3",
    rowProof: preparedRoleProof
  },
  "roles",
  99,
  retriedRoleRow
);
assert.equal(restoredRoleRow[4], lifecycleT1);
assert.equal(restoredRoleRow[5], lifecycleT1);
const alteredRoleRow = retriedRoleRow.slice();
alteredRoleRow[1] = "admin";
expectCode(
  () => context.storeApplyPendingAuditedRowLifecycle_(
    {
      format: "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V3",
      rowProof: preparedRoleProof
    },
    "roles",
    99,
    alteredRoleRow
  ),
  "STORE_PREPARED_MUTATION_PENDING"
);
expectCode(
  () => context.storeApplyPendingAuditedRowLifecycle_(
    {
      format: "CDP_RENEWAL_PENDING_AUDIT_RECOVERY_V2",
      rowProof: null
    },
    "roles",
    99,
    retriedRoleRow
  ),
  "STORE_AUDIT_RECOVERY_LIFECYCLE_PROOF_MISSING"
);

const auditRecoveryBefore = context.storeGetRecord_("rec-1b");
state.auditCommittedFailureCount = 1;
const auditRecoveryWrite = context.storeUpsertRecord_({
  record: { ...auditRecoveryBefore.record, targetName: "audit recovery target" },
  expectedVersion: auditRecoveryBefore.version,
  reasonCode: "AUDIT_RECOVERY_TEST"
});
assert.equal(auditRecoveryWrite.committed, true);
assert.equal(auditRecoveryWrite.recoveryNeeded, true);
assert.equal(context.storeGetRecord_("rec-1b").version, auditRecoveryBefore.version + 1);
assert.equal(
  context.storePendingAuditRecoveryInfo_(
    state.properties.get(context.RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY)
  ).correlationId,
  auditRecoveryWrite.correlationId
);
const auditRecoveryTrigger = context.storeSetRole_({
  email: "viewer@example.com",
  role: "viewer",
  active: true,
  expectedVersion: 0,
  reasonCode: "ADD_VIEWER"
});
assert.equal(auditRecoveryTrigger.committed, true);
assert.match(auditRecoveryWrite.correlationId, /^MUTATION_[0-9A-F]{64}$/);
assert.equal(
  state.properties.has(context.RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY),
  false
);
assert.equal(
  state.spreadsheets.get(storeId).getSheetByName("audit").values.filter((row) =>
    row[2] === "COMMITTED" &&
    row[13] === auditRecoveryWrite.correlationId
  ).length,
  1,
  "the next ordinary locked API mutation must finalize the durable PREPARED row"
);
const confirmedRecovery = context.storeConfirmAuditedMutation_({
  correlationId: auditRecoveryWrite.correlationId
});
assert.equal(confirmedRecovery.committed, true);
assert.equal(confirmedRecovery.recoveryNeeded, false);
const auditRecoveryStored = context.storeReadRecords_(
  state.spreadsheets.get(storeId)
).find((row) => row.recordId === "rec-1b");
const auditRecoveryStatus = context.storeWriteAuditedRow_(
  state.spreadsheets.get(storeId),
  "records",
  auditRecoveryStored._rowNumber,
  context.storeRecordToRow_(auditRecoveryStored),
  {
    entityType: "record",
    entityKey: auditRecoveryStored.recordId,
    action: "RECORD_UPDATE",
    actor: "owner@example.com",
    reasonCode: "AUDIT_RECOVERY_TEST",
    approver: "",
    beforeHash: auditRecoveryBefore.payloadHash,
    afterHash: auditRecoveryStored.payloadHash,
    versionBefore: auditRecoveryBefore.version,
    versionAfter: auditRecoveryStored.version
  }
);
assert.equal(auditRecoveryStatus.committed, true);
assert.equal(auditRecoveryStatus.recoveryNeeded, false);
assert.equal(auditRecoveryStatus.idempotentReplay, true);
expectCode(() => context.storeUpsertRecord_({
  record: { ...auditRecoveryBefore.record, targetName: "audit recovery target" },
  expectedVersion: auditRecoveryBefore.version,
  reasonCode: "AUDIT_RECOVERY_TEST"
}), "STORE_VERSION_CONFLICT");
assert.equal(
  context.storeGetRecord_("rec-1b").version,
  auditRecoveryBefore.version + 1,
  "retry after an acknowledged commit must not increment the version twice"
);

expectCode(() => context.storeUpsertRecord_({
  record: { id: "rec-2", personId: "uc-0001", fiscalYear: "2026", sessionNo: "1", targetName: "別人", invoiceNo: "INV-002" },
  expectedVersion: 0,
  reasonCode: "INITIAL_ENTRY"
}), "STORE_MANAGEMENT_ID_DUPLICATE");
expectCode(() => context.storeUpsertRecord_({
  record: { id: "rec-2", personId: "UC-0002", fiscalYear: "2026", sessionNo: "1", targetName: "別人", invoiceNo: "inv-001" },
  expectedVersion: 0,
  reasonCode: "INITIAL_ENTRY"
}), "STORE_INVOICE_NO_DUPLICATE");
expectCode(() => context.storeUpsertRecord_({
  record: { ...first.record, targetName: "競合更新" },
  expectedVersion: 0,
  reasonCode: "NORMAL_UPDATE"
}), "STORE_VERSION_CONFLICT");

context.storeSetRole_({
  email: "renewal@example.com",
  role: "renewal",
  active: true,
  expectedVersion: 0,
  reasonCode: "ADD_RENEWAL"
});
context.storeSetRole_({
  email: "accounting@example.com",
  role: "accounting",
  active: true,
  expectedVersion: 0,
  reasonCode: "ADD_ACCOUNTING"
});
context.storeSetRole_({
  email: "approver@example.com",
  role: "admin",
  active: true,
  expectedVersion: 0,
  reasonCode: "ADD_APPROVER"
});
expectCode(() => context.storeSetRole_({
  email: "forged-approval@example.com",
  role: "viewer",
  active: true,
  expectedVersion: 0,
  reasonCode: "ADD_VIEWER",
  approver: "approver@example.com"
}), "STORE_APPROVER_NOT_ALLOWED");
expectCode(() => context.storeSetRole_({
  email: "outsider@other.example",
  role: "viewer",
  active: true,
  expectedVersion: 0,
  reasonCode: "ADD_VIEWER"
}), "STORE_WORKSPACE_REQUIRED");
expectCode(
  () => context.storeAssertRoleDomainPolicy_(
    context.storeOpen_(),
    "legacy-outsider@other.example",
    true,
    { active: true }
  ),
  "STORE_WORKSPACE_REQUIRED"
);
expectCode(
  () => context.storeAssertRoleDomainPair_(
    "owner@gmail.com",
    "colleague@gmail.com",
    context.RENEWAL_STORE.SETUP_MODE_PERSONAL
  ),
  "STORE_WORKSPACE_REQUIRED"
);
assert.doesNotThrow(
  () => context.storeAssertRoleDomainPair_(
    "owner@workspace.example",
    "colleague@workspace.example",
    context.RENEWAL_STORE.SETUP_MODE_WORKSPACE
  )
);
const personalPolicyStore = new MockSpreadsheet("personal-policy-store", "personal policy");
context.storeInitializeSpreadsheet_(personalPolicyStore, {
  createdAt: new Date().toISOString(),
  createdBy: "owner@gmail.com",
  deploymentMode: context.RENEWAL_STORE.SETUP_MODE_PERSONAL,
  dataFolderId: "personal-policy-data",
  backupFolderId: "personal-policy-backup"
});
const personalPolicyBody = {
  records: [],
  roles: [{
    email: "owner@gmail.com", role: "admin", active: true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    updatedBy: "owner@gmail.com"
  }, {
    email: "colleague@gmail.com", role: "viewer", active: true, version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    updatedBy: "owner@gmail.com"
  }]
};
expectCode(() => context.storeBuildRestorePlan_(
  context.storeReadRecords_(personalPolicyStore),
  context.storeReadRoles_(personalPolicyStore),
  personalPolicyBody,
  "owner@gmail.com",
  ["owner@gmail.com"],
  personalPolicyStore
), "STORE_WORKSPACE_REQUIRED");

state.actor = "viewer@example.com";
assert.equal(context.storeListRecords_().length, 2);
expectCode(() => context.storeRequireCapability_("finance.read"), "STORE_ACCESS_DENIED");
expectCode(() => context.storeUpsertRecord_({
  record: first.record,
  expectedVersion: 1,
  reasonCode: "VIEWER_WRITE"
}), "STORE_ACCESS_DENIED");

state.actor = "renewal@example.com";
expectCode(() => context.storeRequireCapability_("finance.read"), "STORE_ACCESS_DENIED");
expectCode(() => context.storeUpsertRecord_({
  record: { ...first.record, feeExTax: "1200" },
  expectedVersion: 1,
  reasonCode: "FINANCE_CHANGE"
}), "STORE_ACCOUNTING_ROLE_REQUIRED");

state.actor = "accounting@example.com";
assert.equal(context.storeRequireCapability_("finance.read").role, "accounting");
expectCode(() => context.storeUpsertRecord_({
  record: { ...first.record, targetName: "氏名変更" },
  expectedVersion: 1,
  reasonCode: "GENERAL_CHANGE"
}), "STORE_RENEWAL_ROLE_REQUIRED");

state.actor = "owner@example.com";
const restorable = context.storeUpsertRecord_({
  record: {
    id: "rec-restore",
    personId: "UC-RESTORE",
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: "復元前"
  },
  expectedVersion: 0,
  reasonCode: "RESTORE_FIXTURE"
});
const renewalOnlyFixture = context.storeUpsertRecord_({
  record: {
    id: "renewal-only-pre-finance",
    personId: "UC-RENEWAL-ONLY",
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: "pre-finance renewal-only fixture"
  },
  expectedVersion: 0,
  reasonCode: "RESTORE_FIXTURE"
});
state.financeEnabled = true;
const financeGuardedRecord = context.storeGetRecord_("rec-1");
const canonicalMirrorBefore = {};
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  if (Object.prototype.hasOwnProperty.call(financeGuardedRecord.record, field)) {
    canonicalMirrorBefore[field] = financeGuardedRecord.record[field];
  }
});
const mirrorChangeIgnored = context.storeUpsertRecord_({
  record: {
    ...financeGuardedRecord.record,
    targetName: "renewal edit with spoofed finance values",
    paidAmount: "999",
    feeExTax: "999999",
    invoiceNo: "BROWSER-SPOOF"
  },
  expectedVersion: financeGuardedRecord.version,
  reasonCode: "LEGACY_PAYMENT_EDIT"
});
const canonicalMirrorAfterSpoof = {};
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  if (Object.prototype.hasOwnProperty.call(mirrorChangeIgnored.record, field)) {
    canonicalMirrorAfterSpoof[field] = mirrorChangeIgnored.record[field];
  }
});
assert.deepEqual(canonicalMirrorAfterSpoof, canonicalMirrorBefore);
const mirrorFieldsOmitted = { ...mirrorChangeIgnored.record };
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  delete mirrorFieldsOmitted[field];
});
mirrorFieldsOmitted.targetName = "renewal edit with omitted finance values";
const mirrorRemovalIgnored = context.storeUpsertRecord_({
  record: mirrorFieldsOmitted,
  expectedVersion: mirrorChangeIgnored.version,
  reasonCode: "NORMAL_UPDATE"
});
const canonicalMirrorAfterOmission = {};
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  if (Object.prototype.hasOwnProperty.call(mirrorRemovalIgnored.record, field)) {
    canonicalMirrorAfterOmission[field] = mirrorRemovalIgnored.record[field];
  }
});
assert.deepEqual(
  canonicalMirrorAfterOmission,
  canonicalMirrorBefore,
  "omitting mirror fields must not erase canonical finance values"
);

state.actor = "renewal@example.com";
const renewalEditWithDefaults = context.storeUpsertRecord_({
  record: {
    ...renewalOnlyFixture.record,
    targetName: "renewal-only edit after finance setup",
    feeExTax: "0",
    discountExTax: "0",
    taxRate: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.taxRate,
    taxRounding: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.taxRounding,
    invoiceStatus: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.invoiceStatus,
    paidAmount: "0"
  },
  expectedVersion: renewalOnlyFixture.version,
  reasonCode: "NORMAL_UPDATE"
});
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(renewalEditWithDefaults.record, field),
    false,
    `pre-finance record must remain mirror-free: ${field}`
  );
});
const newTargetWithDefaults = context.storeUpsertRecord_({
  record: {
    id: "finance-normal-new-defaults",
    personId: "UC-FIN-NORMAL",
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: "new target after finance setup",
    feeExTax: "0",
    discountExTax: "0",
    taxRate: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.taxRate,
    taxRounding: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.taxRounding,
    invoiceStatus: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.invoiceStatus,
    paidAmount: "0"
  },
  expectedVersion: 0,
  reasonCode: "INITIAL_ENTRY"
});
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(newTargetWithDefaults.record, field),
    false,
    `new target must not persist browser finance default: ${field}`
  );
});
state.actor = "owner@example.com";
const configuredStore = state.spreadsheets.get(storeId);
assert.doesNotThrow(() => context.storeAssertFormalFinanceRecordWrite_(
  configuredStore,
  "new-empty-finance-mirror",
  null,
  { id: "new-empty-finance-mirror", targetName: "empty mirror", invoiceNo: "" },
  { migration: true, formalFinanceMirror: false }
));
expectCode(() => context.storeAssertFormalFinanceRecordWrite_(
  configuredStore,
  "new-injected-finance-mirror",
  null,
  { id: "new-injected-finance-mirror", feeExTax: "1000" },
  { migration: false, formalFinanceMirror: true }
), "STORE_FORMAL_FINANCE_MIRROR_MISMATCH");
const sanitizedInjectionPreview = context.storePreviewLocalRecordsBatch_({
  records: [{
    id: "finance-batch-injection",
    personId: "UC-FIN-INJECT",
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: "blocked finance injection",
    invoiceNo: "INV-FIN-INJECT"
  }],
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
assert.equal(sanitizedInjectionPreview.insert, 1);
const backup = context.storeCreateManualBackup_({
  reasonCode: "PRE_CHANGE_BACKUP",
  idempotencyKey: "manual-pre-change-0001"
});
assert(backup.backupId);
assert.equal(context.storeListRegisteredBackups_()[0].backupId, backup.backupId);
const verifiedBackup = context.storeVerifyRegisteredBackup_({ backupId: backup.backupId });
assert.equal(verifiedBackup.verified, true);
assert.equal(verifiedBackup.financeIncluded, true);
assert.equal(verifiedBackup.auditIncluded, true);
assert(verifiedBackup.auditCount > 0);
const backupWrapper = JSON.parse(state.files.get(backup.fileId).getBlob().getDataAsString());
assert.equal(backupWrapper.body.finance.revision, 7);
const crossDomainRestoreBody = JSON.parse(JSON.stringify(backupWrapper.body));
crossDomainRestoreBody.roles.push({
  email: "revived-outsider@other.example",
  role: "viewer",
  active: true,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updatedBy: "owner@example.com"
});
expectCode(() => context.storeBuildRestorePlan_(
  context.storeReadRecords_(configuredStore),
  context.storeReadRoles_(configuredStore),
  crossDomainRestoreBody,
  "owner@example.com",
  ["owner@example.com", "approver@example.com"],
  configuredStore
), "STORE_WORKSPACE_REQUIRED");
assert.equal(backup.status, "COMPLETE");
assert.equal(backup.mode, "STORE_AND_FINANCE");
assert.equal(backup.storeBackupId, backup.backupId);
assert(backup.financeBackupId);
const pairedBackupCount = context.storeReadBackups_(configuredStore).length;
const primaryBackupFile = state.files.get(backup.fileId);
assert.equal(primaryBackupFile.getSharingAccess(), "PRIVATE");
assert.equal(primaryBackupFile.getEditors().length, 0);
primaryBackupFile.sharingAccess = "ANYONE_WITH_LINK";
const backupReplay = context.storeCreateManualBackup_({
  reasonCode: "PRE_CHANGE_BACKUP",
  idempotencyKey: "manual-pre-change-0001"
});
assert.equal(backupReplay.runId, backup.runId);
assert.equal(backupReplay.idempotentReplay, true);
assert.equal(
  primaryBackupFile.getSharingAccess(),
  "PRIVATE",
  "idempotent backup reuse must re-apply and verify PRIVATE sharing"
);
assert.equal(context.storeReadBackups_(configuredStore).length, pairedBackupCount);
primaryBackupFile.editors.push("unexpected@example.com");
expectCode(
  () => context.storeVerifyRegisteredBackup_({ backupId: backup.backupId }),
  "STORE_ACL_UNEXPECTED_COLLABORATOR"
);
expectCode(() => context.storePrepareRestore_({
  backupId: backup.backupId,
  reasonCode: "RESTORE_ACL_TEST",
  approver: "approver@example.com"
}), "STORE_ACL_UNEXPECTED_COLLABORATOR");
primaryBackupFile.editors.length = 0;
assert.equal(
  context.storeVerifyRegisteredBackup_({ backupId: backup.backupId }).verified,
  true
);
expectCode(
  () => context.storeCreateManualBackup_({ reasonCode: "MANUAL_BACKUP" }),
  "STORE_BACKUP_IDEMPOTENCY_REQUIRED"
);

state.financeBackupFailure = "SIMULATED_FINANCE_BACKUP_FAILURE";
const partialPair = context.storeCreateManualBackup_({
  reasonCode: "MANUAL_BACKUP",
  idempotencyKey: "manual-partial-unchanged-0001"
});
assert.equal(partialPair.status, "PARTIAL");
assert.equal(partialPair.partial, true);
assert(partialPair.storeBackupId);
assert.equal(partialPair.financeBackupId, "");
const partialStoreBackupCount = context.storeReadBackups_(configuredStore).length;
const resumedPair = context.storeCreateManualBackup_({
  reasonCode: "MANUAL_BACKUP",
  idempotencyKey: "manual-partial-unchanged-0001"
});
assert.equal(resumedPair.status, "COMPLETE");
assert.equal(resumedPair.runId, partialPair.runId);
assert.equal(resumedPair.storeBackupId, partialPair.storeBackupId);
assert(resumedPair.financeBackupId);
assert.equal(
  context.storeReadBackups_(configuredStore).length,
  partialStoreBackupCount,
  "unchanged PARTIAL retry must create only the missing finance side"
);

state.financeBackupFailure = "SIMULATED_FINANCE_BACKUP_FAILURE";
const changedFinancePartial = context.storeCreateManualBackup_({
  reasonCode: "MANUAL_BACKUP",
  idempotencyKey: "manual-partial-finance-changed-0001"
});
assert.equal(changedFinancePartial.status, "PARTIAL");
state.financeRevision += 1;
state.financeStateHash = "e".repeat(64);
const restartedPair = context.storeCreateManualBackup_({
  reasonCode: "MANUAL_BACKUP",
  idempotencyKey: "manual-partial-finance-changed-0001"
});
assert.equal(restartedPair.status, "COMPLETE");
assert.notEqual(restartedPair.runId, changedFinancePartial.runId);
assert.notEqual(restartedPair.storeBackupId, changedFinancePartial.storeBackupId);
const changedRuns = context.storeReadSystemBackupRuns_(
  context.storeEnsureSystemBackupRunSheet_(configuredStore)
).filter((row) =>
  row.idempotencyKeyHash === context.storeSha256_(
    "manual-partial-finance-changed-0001"
  )
);
assert.deepEqual(
  changedRuns.map((row) => row.status).sort(),
  ["ABORTED_PARTIAL", "COMPLETE"]
);
const pairedListings = context.storeListRegisteredBackups_();
assert.equal(
  pairedListings.find(
    (row) => row.backupId === changedFinancePartial.storeBackupId
  ).systemPairComplete,
  false,
  "an aborted partial store backup must not be displayed as a complete pair"
);
assert.equal(
  pairedListings.find(
    (row) => row.backupId === restartedPair.storeBackupId
  ).systemPairComplete,
  true
);

state.financeBackupFailure = "SIMULATED_DAILY_FINANCE_FAILURE";
let dailyPartialError;
try {
  context.storeRunDailyBackup_();
} catch (error) {
  dailyPartialError = error;
}
assert.equal(dailyPartialError.code, "STORE_SYSTEM_BACKUP_PARTIAL");
assert.equal(dailyPartialError.backupRun.status, "PARTIAL");
const dailyRecovered = context.storeRunDailyBackup_();
assert.equal(dailyRecovered.status, "COMPLETE");
assert.equal(dailyRecovered.runId, dailyPartialError.backupRun.runId);

state.financeEnabled = false;
const storeOnlyBackup = context.storeCreateManualBackup_({
  reasonCode: "MANUAL_BACKUP",
  idempotencyKey: "manual-store-only-0001"
});
assert.equal(storeOnlyBackup.status, "COMPLETE");
assert.equal(storeOnlyBackup.mode, "STORE_ONLY");
assert.equal(storeOnlyBackup.financeBackupId, "");
state.financeEnabled = true;
const backupFolderId = context.storeReadMetaMap_(configuredStore).backupFolderId;
const backupFolder = state.folders.get(backupFolderId);
const backupFolderFiles = () => [...state.files.values()].filter(
  (file) => file.parent === backupFolder
);

const unsafeAclBackupId = "backup_test-unsafe-acl";
state.nextBackupFileEditor = "unexpected@example.com";
expectCode(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_UNSAFE_ACL",
  { backupId: unsafeAclBackupId }
), "STORE_ACL_UNEXPECTED_COLLABORATOR");
const unsafeAclFile = backupFolderFiles().find(
  (file) => file.getName().includes(unsafeAclBackupId)
);
assert.equal(
  unsafeAclFile,
  undefined,
  "a newly created backup with an unexpected collaborator must be permanently deleted"
);
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    unsafeAclBackupId
  ).status,
  "PREPARED"
);
const recoveredAclBackup = context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_UNSAFE_ACL_REPLACEMENT"
);
assert.notEqual(recoveredAclBackup.backupId, unsafeAclBackupId);
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    unsafeAclBackupId
  ).status,
  "FAILED_NO_FILE"
);

const beforeFileBackupId = "backup_test-before-file";
const beforeFileCount = backupFolderFiles().length;
state.backupFileFailure = "before";
assert.throws(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_BEFORE_FILE",
  { backupId: beforeFileBackupId }
), /simulated stop before backup file creation/);
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    beforeFileBackupId
  ).status,
  "PREPARED"
);
assert.equal(backupFolderFiles().length, beforeFileCount);
const beforeFileRow = context.storeFindBackup_(
  context.storeReadBackups_(configuredStore),
  beforeFileBackupId
);
const beforeFileFailureKey = context.storeDriveFailureKey_({
  scope: "BACKUP",
  action: "CREATE",
  name: context.storeBackupFileName_(beforeFileRow),
  mimeType: "application/json",
  parentId: backupFolder.getId(),
  label: "store backup"
});
assert.equal(
  JSON.parse(state.properties.get(beforeFileFailureKey)).state,
  "OUTCOME_UNCERTAIN"
);
expectCode(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_BEFORE_FILE_RETRY"
), "STORE_BACKUP_RECOVERY_FILE_VISIBILITY_UNCERTAIN");
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    beforeFileBackupId
  ).status,
  "PREPARED",
  "a zero-result Drive search must not close a tracked create attempt"
);
assert.equal(
  JSON.parse(state.properties.get(beforeFileFailureKey)).state,
  "OUTCOME_UNCERTAIN",
  "reconciliation must retain the uncertain create evidence"
);
// Simulate an administrator's out-of-band confirmation that Drive contains
// no file for this exact intent. With the tracking removed, the pre-existing
// no-file path may close the intent and create a fresh backup.
context.storeClearDriveFailure_(beforeFileFailureKey);
const noFileReplacement = context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_BEFORE_FILE_RETRY"
);
assert(noFileReplacement.backupId !== beforeFileBackupId);
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    beforeFileBackupId
  ).status,
  "FAILED_NO_FILE"
);

const afterFileBackupId = "backup_test-after-file";
const afterFileCount = backupFolderFiles().length;
state.backupFileFailure = "after";
assert.throws(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_AFTER_FILE",
  { backupId: afterFileBackupId }
), /simulated stop after backup file creation/);
assert.equal(backupFolderFiles().length, afterFileCount + 1);
const afterFileRecovered = context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_AFTER_FILE",
  { backupId: afterFileBackupId }
);
assert.equal(afterFileRecovered.backupId, afterFileBackupId);
assert.equal(afterFileRecovered.recovered, true);
assert.equal(backupFolderFiles().length, afterFileCount + 1);

const afterCompleteBackupId = "backup_test-after-complete";
const afterCompleteCount = backupFolderFiles().length;
state.backupCompleteFailure = "after";
assert.throws(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_AFTER_COMPLETE",
  { backupId: afterCompleteBackupId }
), /simulated stop after backup registry completion/);
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    afterCompleteBackupId
  ).status,
  "COMPLETE"
);
assert.equal(
  context.storeBackupAuditCounts_(configuredStore, afterCompleteBackupId).committed,
  0
);
const afterCompleteRecovered = context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_AFTER_COMPLETE",
  { backupId: afterCompleteBackupId }
);
assert.equal(afterCompleteRecovered.backupId, afterCompleteBackupId);
assert.equal(
  context.storeBackupAuditCounts_(configuredStore, afterCompleteBackupId).committed,
  1
);
assert.equal(backupFolderFiles().length, afterCompleteCount + 1);

const ambiguousBackupId = "backup_test-ambiguous";
state.backupFileFailure = "after";
assert.throws(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_AMBIGUOUS",
  { backupId: ambiguousBackupId }
), /simulated stop after backup file creation/);
const ambiguousOriginal = backupFolderFiles().find(
  (file) => file.getName().includes(ambiguousBackupId)
);
const ambiguousDuplicate = backupFolder.createFile(ambiguousOriginal.getBlob());
const ambiguousCount = backupFolderFiles().length;
expectCode(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_AMBIGUOUS",
  { backupId: ambiguousBackupId }
), "STORE_BACKUP_RECOVERY_AMBIGUOUS");
assert.equal(backupFolderFiles().length, ambiguousCount);
ambiguousDuplicate.parent = null;
assert.equal(
  context.storeCreateBackupUnlocked_(
    configuredStore,
    "owner@example.com",
    "TEST",
    "BACKUP_AMBIGUOUS",
    { backupId: ambiguousBackupId }
  ).backupId,
  ambiguousBackupId
);

const stalePreparedBackupId = "backup_test-stale-prepared";
state.backupFileFailure = "after";
assert.throws(() => context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_STALE_PREPARED",
  { backupId: stalePreparedBackupId }
), /simulated stop after backup file creation/);
const staleEditBase = context.storeGetRecord_("finance-normal-new-defaults");
const staleEdit = context.storeUpsertRecord_({
  record: { ...staleEditBase.record, targetName: "changed after prepared backup" },
  expectedVersion: staleEditBase.version,
  reasonCode: "NORMAL_UPDATE"
});
const freshAfterStaleRecovery = context.storeCreateBackupUnlocked_(
  configuredStore,
  "owner@example.com",
  "TEST",
  "BACKUP_FRESH_AFTER_STALE"
);
assert.notEqual(freshAfterStaleRecovery.backupId, stalePreparedBackupId);
assert.equal(
  context.storeFindBackup_(
    context.storeReadBackups_(configuredStore),
    stalePreparedBackupId
  ).status,
  "COMPLETE"
);
const freshWrapper = JSON.parse(
  state.files.get(freshAfterStaleRecovery.fileId).getBlob().getDataAsString()
);
assert.equal(
  freshWrapper.body.records.find(
    (row) => row.recordId === staleEdit.recordId
  ).payload.targetName,
  staleEdit.record.targetName,
  "a recovered old intent must not be returned as the current backup"
);
const storeSpreadsheet = state.spreadsheets.get(storeId);
const accountingRow = context.storeReadRecords_(storeSpreadsheet).find((row) => row.recordId === "rec-1");
expectCode(() => context.storeAssertRestoreFinanceSafety_(
  storeSpreadsheet,
  [accountingRow],
  [{ ...accountingRow, payloadHash: "0".repeat(64) }]
), "STORE_RESTORE_FINANCE_CONFLICT");
const changed = context.storeUpsertRecord_({
  record: { ...restorable.record, targetName: "変更後" },
  expectedVersion: 1,
  reasonCode: "NORMAL_UPDATE"
});
assert.equal(changed.version, 2);

expectCode(() => context.storePrepareRestore_({
  backupId: backup.backupId,
  reasonCode: "RESTORE_TEST",
  approver: "owner@example.com"
}), "STORE_RESTORE_SELF_APPROVAL_FORBIDDEN");
const dryRun = context.storePrepareRestore_({
  backupId: backup.backupId,
  reasonCode: "RESTORE_TEST",
  approver: "approver@example.com"
});
assert.equal(dryRun.dryRun, true);
assert.equal(dryRun.confirmToken, undefined);
assert.equal(context.storeGetRecord_("rec-restore").record.targetName, "変更後");
assert.equal(context.storeListPendingRestores_().length, 1);
expectCode(() => context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: dryRun.batchId
}), "STORE_RESTORE_SELF_APPROVAL_FORBIDDEN");
assert.equal(context.storeGetRecord_("rec-restore").record.targetName, "変更後");
state.actor = "approver@example.com";
expectCode(() => context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: dryRun.batchId,
  confirmBatchId: "wrong-batch"
}), "STORE_RESTORE_BATCH_CONFIRM_MISMATCH");
const preparedRestoreBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === dryRun.batchId);
const preparedSummaryHash = preparedRestoreBatch.summaryHash;
preparedRestoreBatch.summaryHash = "0".repeat(64);
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "import_batches",
  preparedRestoreBatch._rowNumber,
  preparedRestoreBatch
);
expectCode(() => context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: dryRun.batchId,
  confirmBatchId: dryRun.batchId
}), "STORE_RESTORE_PLAN_CHANGED");
preparedRestoreBatch.summaryHash = preparedSummaryHash;
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "import_batches",
  preparedRestoreBatch._rowNumber,
  preparedRestoreBatch
);
const restored = context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: dryRun.batchId,
  confirmBatchId: dryRun.batchId
});
assert.equal(restored.restored, true);
assert.equal(context.storeGetRecord_("rec-restore").record.targetName, "復元前");
assert(context.storeGetRecord_("rec-restore").version > changed.version);
const completedRestoreBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === dryRun.batchId);
assert.equal(completedRestoreBatch.backupId, backup.backupId);
assert.notEqual(restored.safetyBackupId, backup.backupId);
assert(context.storeReadObjects_(storeSpreadsheet, "audit").some((row) =>
  row.action === "RESTORE_SAFETY_BACKUP_CREATED" &&
  row.correlationId === restored.safetyBackupId.toUpperCase()
));

state.actor = "owner@example.com";
const rejectedDryRun = context.storePrepareRestore_({
  backupId: backup.backupId,
  reasonCode: "RESTORE_REJECT_TEST",
  approver: "approver@example.com"
});
state.actor = "approver@example.com";
assert.equal(context.storeListPendingRestores_().some((row) => row.batchId === rejectedDryRun.batchId), true);
const rejectedRestore = context.storeRejectRestore_({
  batchId: rejectedDryRun.batchId,
  reasonCode: "RESTORE_REJECTED_TEST"
});
assert.equal(rejectedRestore.rejected, true);
state.actor = "owner@example.com";
const afterRestore = context.storeGetRecord_("rec-1");
expectCode(() => context.storeSoftDeleteRecord_({
  recordId: "rec-1",
  expectedVersion: afterRestore.version,
  reasonCode: "SOFT_DELETE_TEST"
}), "STORE_ACCOUNTING_RECORD_DELETE_FORBIDDEN");
state.financeEnabled = false;
const cleanRecord = context.storeUpsertRecord_({
  record: {
    id: "rec-clean",
    personId: "UC-CLEAN",
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: "削除試験",
    invoiceNo: ""
  },
  expectedVersion: 0,
  reasonCode: "INITIAL_ENTRY"
});
expectCode(() => context.storeSoftDeleteRecord_({
  recordId: "rec-clean",
  expectedVersion: cleanRecord.version,
  reasonCode: "SOFT_DELETE_TEST",
  approver: "approver@example.com"
}), "STORE_APPROVER_NOT_ALLOWED");
assert.equal(context.storeGetRecord_("rec-clean").deleted, false);
const deleted = context.storeSoftDeleteRecord_({
  recordId: "rec-clean",
  expectedVersion: cleanRecord.version,
  reasonCode: "SOFT_DELETE_TEST"
});
assert.equal(deleted.deleted, true);
assert.equal(context.storeListRecords_().length, 5);
assert.equal(context.storeListRecords_({ includeDeleted: true }).length, 6);
expectCode(() => context.storeUpsertRecord_({
  record: { id: "rec-3", personId: "UC-CLEAN", fiscalYear: "2026", sessionNo: "1", targetName: "番号再利用", invoiceNo: "INV-003" },
  expectedVersion: 0,
  reasonCode: "REUSE_TEST"
}), "STORE_MANAGEMENT_ID_DUPLICATE");

const migrated = context.storeUpsertLocalStorageRecord_({
  confirm: context.RENEWAL_STORE.LOCAL_MIGRATION_CONFIRM,
  record: { id: "legacy-1", personId: "UC-0999", fiscalYear: "2026", sessionNo: "1", targetName: "移行対象", invoiceNo: "" },
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
assert.equal(migrated.version, 1);
const migratedAgain = context.storeUpsertLocalStorageRecord_({
  confirm: context.RENEWAL_STORE.LOCAL_MIGRATION_CONFIRM,
  record: { id: "legacy-1", personId: "UC-0999", fiscalYear: "2026", sessionNo: "1", targetName: "移行対象", invoiceNo: "" },
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
assert.equal(migratedAgain.recordId, migrated.recordId);
assert.equal(migratedAgain.version, 1);
expectCode(() => context.storeUpsertLocalStorageRecord_({
  confirm: context.RENEWAL_STORE.LOCAL_MIGRATION_CONFIRM,
  record: { id: "different-local-id", personId: "UC-0999", fiscalYear: "2026", sessionNo: "1", targetName: "移行対象更新", invoiceNo: "" },
  reasonCode: "LOCAL_STORAGE_MIGRATION"
}), "STORE_MIGRATION_EXISTING_REVIEW_REQUIRED");

const localBatchRecords = [{ id: "local-batch-1", personId: "UC-2000", fiscalYear: "2026", sessionNo: "1", targetName: "local batch", invoiceNo: "INV-2000" }];
const localPreview = context.storePreviewLocalRecordsBatch_({ records: localBatchRecords, reasonCode: "LOCAL_STORAGE_MIGRATION" });
assert.equal(localPreview.dryRun, true);
const localPreviewBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === localPreview.batchId);
const localPlanHash = localPreviewBatch.summaryHash;
localPreviewBatch.summaryHash = "0".repeat(64);
context.storeWriteObjectAt_(storeSpreadsheet, "import_batches", localPreviewBatch._rowNumber, localPreviewBatch);
expectCode(() => context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: localPreview.batchId,
  confirmToken: localPreview.confirmToken,
  records: localBatchRecords
}), "STORE_MIGRATION_PLAN_CHANGED");
localPreviewBatch.summaryHash = localPlanHash;
context.storeWriteObjectAt_(storeSpreadsheet, "import_batches", localPreviewBatch._rowNumber, localPreviewBatch);
const generationBeforeLocalBatch = context.storeReadActiveDataGeneration_(storeSpreadsheet);
const localCommit = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: localPreview.batchId,
  confirmToken: localPreview.confirmToken,
  records: localBatchRecords
});
assert.equal(localCommit.inserted, 1);
assert.notEqual(
  context.storeReadActiveDataGeneration_(storeSpreadsheet),
  generationBeforeLocalBatch,
  "local batch must commit through a new data generation"
);
expectCode(() => context.storeRecordBrowserStoragePurge_({
  confirm: "CONFIRM_BROWSER_STORAGE_PURGED",
  storageKeySetVersion: "CDP_RENEWAL_BROWSER_PII_V1",
  purgedKeyCount: 3,
  batchId: localPreview.batchId,
  sourceHash: localPreview.sourceHash
}), "STORE_BROWSER_PURGE_KEYSET_INVALID");
expectCode(() => context.storeRecordBrowserStoragePurge_({
  confirm: "CONFIRM_BROWSER_STORAGE_PURGED",
  storageKeySetVersion: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_VERSION,
  purgedKeyCount: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_COUNT - 1,
  batchId: localPreview.batchId,
  sourceHash: localPreview.sourceHash
}), "STORE_BROWSER_PURGE_COUNT_INVALID");
const purgeEvidence = context.storeRecordBrowserStoragePurge_({
  confirm: "CONFIRM_BROWSER_STORAGE_PURGED",
  storageKeySetVersion: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_VERSION,
  purgedKeyCount: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_COUNT,
  batchId: localPreview.batchId,
  sourceHash: localPreview.sourceHash
});
assert.equal(purgeEvidence.recorded, true);
assert.equal(purgeEvidence.idempotentReplay, false);
const purgeEvidenceRetry = context.storeRecordBrowserStoragePurge_({
  confirm: "CONFIRM_BROWSER_STORAGE_PURGED",
  storageKeySetVersion: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_VERSION,
  purgedKeyCount: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_COUNT,
  batchId: localPreview.batchId,
  sourceHash: localPreview.sourceHash
});
assert.equal(purgeEvidenceRetry.idempotentReplay, true);
expectCode(() => context.storeRecordBrowserStoragePurge_({
  confirm: "CONFIRM_BROWSER_STORAGE_PURGED",
  storageKeySetVersion: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_VERSION,
  purgedKeyCount: context.RENEWAL_STORE.BROWSER_STORAGE_KEYSET_COUNT,
  batchId: localPreview.batchId,
  sourceHash: "0".repeat(64)
}), "STORE_BROWSER_PURGE_SOURCE_MISMATCH");
const committedLocalBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === localPreview.batchId);
committedLocalBatch.status = "COMMITTING";
committedLocalBatch.completedAt = "";
committedLocalBatch.expiresAt = "2000-01-01T00:00:00.000Z";
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "import_batches",
  committedLocalBatch._rowNumber,
  committedLocalBatch
);
const postCutoverRecord = context.storeGetRecord_("local-batch-1");
const postCutoverEdit = context.storeUpsertRecord_({
  record: { ...postCutoverRecord.record, targetName: "legitimate edit after batch cutover" },
  expectedVersion: postCutoverRecord.version,
  reasonCode: "NORMAL_UPDATE"
});
const recoveredLocalBatch = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: localPreview.batchId,
  confirmToken: localPreview.confirmToken,
  records: localBatchRecords
});
assert.equal(recoveredLocalBatch.recovered, true);
assert.equal(
  context.storeGetRecord_("local-batch-1").record.targetName,
  postCutoverEdit.record.targetName,
  "generation correlation must finalize without replaying over a later valid edit"
);
expectCode(() => context.storePreviewLocalRecordsBatch_({
  operation: "LOCAL_STORAGE_MIGRATION",
  records: [{ ...localBatchRecords[0], targetName: "browser stale overwrite" }],
  reasonCode: "LOCAL_STORAGE_MIGRATION"
}), "STORE_MIGRATION_EXISTING_REVIEW_REQUIRED");
expectCode(() => context.storePreviewLocalRecordsBatch_({
  operation: "LOCAL_STORAGE_MIGRATION",
  records: [{ id: "archived-local", personId: "UC-ARCH", fiscalYear: "2026", sessionNo: "1", archived: true }]
}), "STORE_MIGRATION_ARCHIVED_UNSUPPORTED");

const csvCurrent = context.storeGetRecord_("local-batch-1");
const csvRecords = [{ ...csvCurrent.record, targetName: "version checked CSV" }];
const csvExpected = [{
  recordId: csvCurrent.recordId,
  expectedVersion: csvCurrent.version,
  expectedPayloadHash: csvCurrent.payloadHash
}];
const csvPreview = context.storePreviewLocalRecordsBatch_({
  operation: "VALIDATED_CSV_IMPORT",
  records: csvRecords,
  expectedRecords: csvExpected,
  reasonCode: "VALIDATED_CSV_IMPORT"
});
const csvCommit = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  operation: "VALIDATED_CSV_IMPORT",
  batchId: csvPreview.batchId,
  confirmToken: csvPreview.confirmToken,
  records: csvRecords,
  expectedRecords: csvExpected
});
assert.equal(csvCommit.updated, 1);
expectCode(() => context.storePreviewLocalRecordsBatch_({
  operation: "VALIDATED_CSV_IMPORT",
  records: [{ ...csvRecords[0], targetName: "stale CSV" }],
  expectedRecords: csvExpected,
  reasonCode: "VALIDATED_CSV_IMPORT"
}), "STORE_CSV_STALE_RECORD");

const generationBeforeSourceImport = context.storeReadActiveDataGeneration_(storeSpreadsheet);
const sourceImportRows = [{
  personId: "REN-2026-0001", targetName: "source row", email: "source@example.com",
  fiscalYear: "2026", sessionNo: "1", sourceExternalKey: "source:2026:1",
  sourceSpreadsheetId: "14bzaYZ_9dz4BMHNVDx7AfpKFN-3pStoWjKdKOMVeiv0", sourceSheetId: "1544892163",
  sourceSheetName: "2026", sourceRowNumber: "5", sourceImportStatus: "imported", sourceRowHash: "x"
}];
const sourceImport = context.storeImportSourceRecords_({
  actorEmail: "owner@example.com",
  sourceBatchHash: "a".repeat(64),
  rows: sourceImportRows
});
assert.equal(sourceImport.sourceWritePolicy, "READ_ONLY_SOURCE");
assert.equal(sourceImport.inserted, 1);
assert.notEqual(
  context.storeReadActiveDataGeneration_(storeSpreadsheet),
  generationBeforeSourceImport,
  "source import must commit through a new data generation"
);
const sourceNoOpGeneration = context.storeReadActiveDataGeneration_(storeSpreadsheet);
const sourceNoOpSheetCount = storeSpreadsheet.getSheets().length;
const sourceNoOpBackupCount = context.storeReadBackups_(storeSpreadsheet).length;
["b", "c"].forEach((prefix) => {
  const noOp = context.storeImportSourceRecords_({
    actorEmail: "owner@example.com",
    sourceBatchHash: prefix.repeat(64),
    rows: sourceImportRows
  });
  assert.equal(noOp.noOp, true);
  assert.equal(noOp.backupId, "");
  assert.equal(noOp.inserted, 0);
  assert.equal(noOp.updated, 0);
});
assert.equal(context.storeReadActiveDataGeneration_(storeSpreadsheet), sourceNoOpGeneration);
assert.equal(
  storeSpreadsheet.getSheets().length,
  sourceNoOpSheetCount,
  "repeated source no-op imports must not create staged generations"
);
assert.equal(
  context.storeReadBackups_(storeSpreadsheet).length,
  sourceNoOpBackupCount,
  "repeated source no-op imports must not create safety backups"
);

const auditSheet = state.spreadsheets.get(storeId).getSheetByName("audit");
const auditText = JSON.stringify(auditSheet.values);
assert(!auditText.includes("個人情報テスト"), "監査ログに対象者本文を保存してはいけません");
assert(!auditText.includes("移行対象更新"), "監査ログに移行対象者本文を保存してはいけません");
assert(auditText.includes("PREPARED"));
assert(auditText.includes("COMMITTED"));

const recordsSheet = context.storeResolveSheet_(
  state.spreadsheets.get(storeId), "records"
);
assert(recordsSheet.getLastRow() >= 3, "soft deleteは物理削除してはいけません");
context.RENEWAL_STORE.PROTECTED_SOURCE_IDS.forEach((id) => assert(!state.openedIds.includes(id)));

state.financeEnabled = true;
const defaultFinanceMigrationRecord = {
  id: "finance-default-placeholder",
  personId: "UC-FIN-DEFAULT",
  fiscalYear: "2026",
  sessionNo: "1",
  targetName: "finance defaults are not evidence",
  invoiceNo: "",
  feeExTax: "0",
  discountExTax: "0",
  taxRate: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.taxRate,
  taxRounding: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.taxRounding,
  invoiceStatus: context.RENEWAL_STORE.ACCOUNTING_DEFAULTS.invoiceStatus,
  paidAmount: "0"
};
const defaultFinancePreview = context.storePreviewLocalRecordsBatch_({
  records: [defaultFinanceMigrationRecord],
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
const defaultFinanceCommit = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: defaultFinancePreview.batchId,
  confirmToken: defaultFinancePreview.confirmToken,
  records: [defaultFinanceMigrationRecord]
});
assert.equal(defaultFinanceCommit.inserted, 1);
const normalizedFinanceMigration = context.storeGetRecord_("finance-default-placeholder");
context.RENEWAL_STORE.FORMAL_FINANCE_MIRROR_FIELDS.forEach((field) => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(normalizedFinanceMigration.record, field),
    false,
    `new migration placeholder must not persist ${field}`
  );
});
const defaultFinanceRetryPreview = context.storePreviewLocalRecordsBatch_({
  records: [defaultFinanceMigrationRecord],
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
assert.equal(defaultFinanceRetryPreview.skip, 1);
const localNoOpGeneration = context.storeReadActiveDataGeneration_(storeSpreadsheet);
const localNoOpSheetCount = storeSpreadsheet.getSheets().length;
const localNoOpBackupCount = context.storeReadBackups_(storeSpreadsheet).length;
const firstLocalNoOp = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: defaultFinanceRetryPreview.batchId,
  confirmToken: defaultFinanceRetryPreview.confirmToken,
  records: [defaultFinanceMigrationRecord]
});
assert.equal(firstLocalNoOp.noOp, true);
assert.equal(firstLocalNoOp.backupId, "");
const secondLocalNoOpPreview = context.storePreviewLocalRecordsBatch_({
  records: [defaultFinanceMigrationRecord],
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
const secondLocalNoOp = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: secondLocalNoOpPreview.batchId,
  confirmToken: secondLocalNoOpPreview.confirmToken,
  records: [defaultFinanceMigrationRecord]
});
assert.equal(secondLocalNoOp.noOp, true);
assert.equal(context.storeReadActiveDataGeneration_(storeSpreadsheet), localNoOpGeneration);
assert.equal(
  storeSpreadsheet.getSheets().length,
  localNoOpSheetCount,
  "repeated local no-op commits must not create staged generations"
);
assert.equal(
  context.storeReadBackups_(storeSpreadsheet).length,
  localNoOpBackupCount,
  "repeated local no-op commits must not create safety backups"
);
assert.equal(
  context.storeBatchDesiredPayloadsPresent_(
    storeSpreadsheet,
    context.storeReadRecords_(storeSpreadsheet),
    [defaultFinanceMigrationRecord]
  ),
  true,
  "COMMITTING retry must compare the same normalized finance placeholders"
);
const normalizedFinanceCsv = [{
  ...normalizedFinanceMigration.record,
  feeExTax: "1000"
}];
const sanitizedFinanceCsvPreview = context.storePreviewLocalRecordsBatch_({
  operation: "VALIDATED_CSV_IMPORT",
  records: normalizedFinanceCsv,
  expectedRecords: [{
    recordId: normalizedFinanceMigration.recordId,
    expectedVersion: normalizedFinanceMigration.version,
    expectedPayloadHash: normalizedFinanceMigration.payloadHash
  }],
  reasonCode: "VALIDATED_CSV_IMPORT"
});
assert.equal(
  sanitizedFinanceCsvPreview.skip,
  1,
  "CSV finance mirror injection must normalize to the canonical row"
);
state.financeEnabled = false;

function generationFixtureRows(recordId) {
  const currentRecords = context.storeReadRecords_(storeSpreadsheet);
  const currentRoles = context.storeReadRoles_(storeSpreadsheet);
  const payload = {
    id: recordId,
    personId: `PERSON-${recordId}`,
    fiscalYear: "2026",
    sessionNo: "1",
    targetName: `generation ${recordId}`,
    invoiceNo: ""
  };
  const payloadJson = context.storeStableStringify_(payload);
  const row = {
    recordId,
    managementId: context.storeManagementId_(payload),
    invoiceNo: "",
    version: 1,
    deleted: false,
    createdAt: context.storeNowIso_(),
    updatedAt: context.storeNowIso_(),
    createdBy: "owner@example.com",
    updatedBy: "owner@example.com",
    payloadJson,
    payload,
    payloadHash: context.storeSha256_(payloadJson)
  };
  return {
    records: currentRecords.map(context.storeRecordToRow_).concat([context.storeRecordToRow_(row)]),
    roles: currentRoles.map(context.storeRoleToRow_)
  };
}

const generationBeforeFailure = context.storeReadActiveDataGeneration_(storeSpreadsheet);
const fingerprintBeforeFailure = context.storeDataFingerprint_(
  context.storeReadRecords_(storeSpreadsheet),
  context.storeReadRoles_(storeSpreadsheet)
);
state.failSetValuesSheetPrefix = "roles__g_";
assert.throws(() => {
  const fixture = generationFixtureRows("generation-sheet-stop");
  context.storeCommitDataGeneration_(
    storeSpreadsheet, fixture.records, fixture.roles, "owner@example.com",
    { correlationId: "GENERATION_SHEET_STOP" }
  );
}, /simulated generation sheet write stop/);
assert.equal(context.storeReadActiveDataGeneration_(storeSpreadsheet), generationBeforeFailure);
assert.equal(
  context.storeDataFingerprint_(
    context.storeReadRecords_(storeSpreadsheet),
    context.storeReadRoles_(storeSpreadsheet)
  ),
  fingerprintBeforeFailure,
  "staged sheet failure must leave the old generation canonical"
);

state.pointerFailure = "before";
assert.throws(() => {
  const fixture = generationFixtureRows("generation-pointer-before");
  context.storeCommitDataGeneration_(
    storeSpreadsheet, fixture.records, fixture.roles, "owner@example.com",
    { correlationId: "GENERATION_POINTER_BEFORE" }
  );
}, /simulated pointer stop before commit/);
assert.equal(context.storeReadActiveDataGeneration_(storeSpreadsheet), generationBeforeFailure);
assert.equal(context.storeGetRecord_("generation-pointer-before"), null);

state.pointerFailure = "after";
assert.throws(() => {
  const fixture = generationFixtureRows("generation-pointer-after");
  context.storeCommitDataGeneration_(
    storeSpreadsheet, fixture.records, fixture.roles, "owner@example.com",
    { correlationId: "GENERATION_POINTER_AFTER" }
  );
}, /simulated pointer stop after commit/);
const generationAfterAmbiguousStop = context.storeReadActiveDataGeneration_(storeSpreadsheet);
assert.notEqual(generationAfterAmbiguousStop, generationBeforeFailure);
assert(context.storeGetRecord_("generation-pointer-after"));
const activeRecordsSheet = storeSpreadsheet.getSheetByName(
  context.storeDataGenerationSheetName_("records", generationAfterAmbiguousStop)
);
const activeRolesSheet = storeSpreadsheet.getSheetByName(
  context.storeDataGenerationSheetName_("roles", generationAfterAmbiguousStop)
);
assert(activeRecordsSheet && activeRolesSheet, "one pointer must select the complete records/roles pair");
assert.equal(
  activeRecordsSheet.getName().replace(/^records__/, ""),
  activeRolesSheet.getName().replace(/^roles__/, "")
);
const generationRecord = context.storeGetRecord_("generation-pointer-after");
const generationRecordUpdated = context.storeUpsertRecord_({
  record: { ...generationRecord.record, targetName: "updated in active generation" },
  expectedVersion: generationRecord.version,
  reasonCode: "ACTIVE_GENERATION_ROW_UPDATE"
});
assert.equal(generationRecordUpdated.version, 2);
assert.equal(
  context.storeGetRecord_("generation-pointer-after").record.targetName,
  "updated in active generation"
);

const generationManifestRecoveryBefore = context.storeGetRecord_(
  "generation-pointer-after"
);
state.generationManifestFailure = "before";
assert.throws(() => context.storeUpsertRecord_({
  record: {
    ...generationManifestRecoveryBefore.record,
    targetName: "row committed before manifest recovery"
  },
  expectedVersion: generationManifestRecoveryBefore.version,
  reasonCode: "GENERATION_MANIFEST_RECOVERY"
}), /simulated generation manifest stop before commit/);
const generationPendingMarker = context.storePendingAuditRecoveryInfo_(
  state.properties.get(context.RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY)
);
assert.equal(
  generationPendingMarker.expectedGenerationIntegrity.generationId,
  generationAfterAmbiguousStop
);
expectCode(
  () => context.storeOpen_(),
  "STORE_DATA_GENERATION_INCOMPLETE"
);
assert.equal(
  context.storeWithLock_(() => {
    context.storeOpen_();
    return true;
  }),
  true,
  "the lock recovery path must apply only the persisted expected aggregate"
);
assert.equal(
  state.properties.has(context.RENEWAL_STORE.PENDING_AUDIT_RECOVERY_KEY),
  false
);
assert.equal(
  context.storeGetRecord_(
    "generation-pointer-after"
  ).record.targetName,
  "row committed before manifest recovery"
);

const integrityFixtureRow = context.storeReadRecords_(
  storeSpreadsheet
).find((row) => row.recordId === "generation-pointer-after");
const integrityFixtureRange = activeRecordsSheet.getRange(
  integrityFixtureRow._rowNumber,
  1,
  1,
  context.RENEWAL_STORE_SCHEMAS.records.length
);
const integrityFixtureValues = integrityFixtureRange.getValues()[0];
const validButUnregisteredValues = integrityFixtureValues.slice();
const validButUnregisteredPayload = JSON.parse(
  validButUnregisteredValues[9]
);
validButUnregisteredPayload.targetName = "manual valid-hash tamper";
validButUnregisteredValues[9] = context.storeStableStringify_(
  validButUnregisteredPayload
);
validButUnregisteredValues[10] = context.storeSha256_(
  validButUnregisteredValues[9]
);
integrityFixtureRange.setValues([validButUnregisteredValues]);
expectCode(
  () => context.storeOpen_(),
  "STORE_DATA_GENERATION_INCOMPLETE"
);
integrityFixtureRange.setValues([integrityFixtureValues]);
context.storeOpen_();

integrityFixtureRange.clearContent();
expectCode(
  () => context.storeOpen_(),
  "STORE_DATA_GENERATION_INCOMPLETE"
);
integrityFixtureRange.setValues([integrityFixtureValues]);
context.storeOpen_();

const generationCapacity = context.storeDataGenerationCapacity_(storeSpreadsheet);
assert(generationCapacity.retainedCount >= 3);
assert(generationCapacity.incompleteCount >= 1);
assert.equal(generationCapacity.warning, true);
const generationCapacitySheetCount = storeSpreadsheet.getSheets().length;
const generationCapacityHardLimit = context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT;
const generationCapacityWarningCount = context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT;
context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT = generationCapacity.retainedCount - 1;
context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT = generationCapacity.retainedCount;
expectCode(() => {
  const fixture = generationFixtureRows("generation-capacity-stop");
  context.storeCommitDataGeneration_(
    storeSpreadsheet, fixture.records, fixture.roles, "owner@example.com",
    { correlationId: "GENERATION_CAPACITY_STOP" }
  );
}, "STORE_DATA_GENERATION_CAPACITY_LIMIT");
assert.equal(
  storeSpreadsheet.getSheets().length,
  generationCapacitySheetCount,
  "capacity hard stop must run before creating staging sheets"
);
context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT = generationCapacityHardLimit;
context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT = generationCapacityWarningCount;

const generationCellProjection = context.storeProjectedDataGenerationCells_(
  context.storeReadRecords_(storeSpreadsheet).length,
  context.storeReadRoles_(storeSpreadsheet).length
);
assert(generationCellProjection >= 52000);
expectCode(() => context.storeProjectedDataGenerationCells_(
  context.RENEWAL_STORE.MAX_SHEET_ROWS,
  1
), "STORE_SHEET_ROW_LIMIT");
assert(generationCapacity.allocatedCellCount > 0);

const projectionPointerRow =
  context.storeEnsureActiveDataGenerationPointer_(storeSpreadsheet);
const projectionMetaSheet = storeSpreadsheet.getSheetByName("_meta");
const projectionPointerValue = projectionMetaSheet
  .getRange(projectionPointerRow, 2).getValues()[0][0];
const projectionMetaMaxRows = projectionMetaSheet.maxRows;
projectionMetaSheet.getRange(projectionPointerRow, 1, 1, 2).clearContent();
projectionMetaSheet.maxRows = projectionMetaSheet.getLastRow();
assert.equal(
  context.storeProjectedActiveGenerationPointerCells_(storeSpreadsheet),
  projectionMetaSheet.getMaxColumns(),
  "a missing legacy generation pointer row must be included in cell projection"
);
projectionMetaSheet.getRange(projectionPointerRow, 1, 1, 2).setValues([[
  context.RENEWAL_STORE.ACTIVE_DATA_GENERATION_META_KEY,
  projectionPointerValue
]]);
projectionMetaSheet.maxRows = projectionMetaMaxRows;

const reconciliationAuditRowsBefore =
  context.storeProjectedBackupReconciliationAuditRows_(storeSpreadsheet);
const reconciliationReserveBackup = {
  backupId: "backup_reconciliation_reserve_test",
  createdAt: context.storeNowIso_(),
  createdBy: "owner@example.com",
  kind: "TEST",
  recordCount: 0,
  activeCount: 0,
  roleCount: 0,
  contentHash: "e".repeat(64),
  driveFileId: "test-file",
  status: "COMPLETE",
  noteCode: "RECONCILIATION_RESERVE_TEST",
  schemaVersion: context.RENEWAL_STORE.SCHEMA_VERSION
};
reconciliationReserveBackup._rowNumber = context.storeAppendObject_(
  storeSpreadsheet, "backups", reconciliationReserveBackup
);
assert.equal(
  context.storeProjectedBackupReconciliationAuditRows_(storeSpreadsheet),
  reconciliationAuditRowsBefore + 1,
  "a COMPLETE backup missing its COMMITTED audit must reserve one audit row"
);
reconciliationReserveBackup.status = "FAILED_TEST";
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "backups",
  reconciliationReserveBackup._rowNumber,
  reconciliationReserveBackup
);
assert.equal(
  context.storeProjectedBackupReconciliationAuditRows_(storeSpreadsheet),
  reconciliationAuditRowsBefore
);

const spreadsheetCellHardLimit = context.RENEWAL_STORE.SPREADSHEET_CELL_HARD_LIMIT;
const spreadsheetCellWarningLimit = context.RENEWAL_STORE.SPREADSHEET_CELL_WARNING_LIMIT;
context.RENEWAL_STORE.SPREADSHEET_CELL_WARNING_LIMIT =
  generationCapacity.allocatedCellCount + generationCellProjection - 2;
context.RENEWAL_STORE.SPREADSHEET_CELL_HARD_LIMIT =
  generationCapacity.allocatedCellCount + generationCellProjection - 1;
expectCode(() => {
  context.storeAssertDataGenerationCapacityForCreate_(
    storeSpreadsheet,
    context.storeReadRecords_(storeSpreadsheet).length,
    context.storeReadRoles_(storeSpreadsheet).length
  );
}, "STORE_SPREADSHEET_CELL_CAPACITY_LIMIT");
context.RENEWAL_STORE.SPREADSHEET_CELL_HARD_LIMIT = spreadsheetCellHardLimit;
context.RENEWAL_STORE.SPREADSHEET_CELL_WARNING_LIMIT = spreadsheetCellWarningLimit;

function capacitySideEffectSnapshot() {
  return {
    sheetCount: storeSpreadsheet.getSheets().length,
    backupCount: context.storeReadBackups_(storeSpreadsheet).length,
    auditCount: context.storeReadObjects_(storeSpreadsheet, "audit").length,
    fingerprint: context.storeDataFingerprint_(
      context.storeReadRecords_(storeSpreadsheet),
      context.storeReadRoles_(storeSpreadsheet)
    )
  };
}

const capacityLocalRecords = [{
  id: "capacity-local-stop",
  personId: "UC-CAPACITY-LOCAL",
  fiscalYear: "2026",
  sessionNo: "1",
  targetName: "capacity local stop",
  invoiceNo: ""
}];
const capacityLocalPreview = context.storePreviewLocalRecordsBatch_({
  records: capacityLocalRecords,
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
const capacityLocalBatchBefore = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === capacityLocalPreview.batchId);
const capacityLocalBefore = capacitySideEffectSnapshot();
context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT =
  generationCapacity.retainedCount - 1;
context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT =
  generationCapacity.retainedCount;
expectCode(() => context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: capacityLocalPreview.batchId,
  confirmToken: capacityLocalPreview.confirmToken,
  records: capacityLocalRecords
}), "STORE_DATA_GENERATION_CAPACITY_LIMIT");
assert.deepEqual(
  capacitySideEffectSnapshot(),
  capacityLocalBefore,
  "local batch capacity stop must have no backup, audit, sheet, or data side effect"
);
const capacityLocalBatchAfter = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === capacityLocalPreview.batchId);
assert.equal(capacityLocalBatchAfter.status, capacityLocalBatchBefore.status);
assert.equal(capacityLocalBatchAfter.backupId, capacityLocalBatchBefore.backupId);

const capacitySourceBefore = capacitySideEffectSnapshot();
expectCode(() => context.storeImportSourceRecords_({
  actorEmail: "owner@example.com",
  sourceBatchHash: "d".repeat(64),
  rows: [{
    ...sourceImportRows[0],
    personId: "REN-2026-CAPACITY",
    targetName: "capacity source stop",
    sourceExternalKey: "source:2026:capacity-stop",
    sourceRowNumber: "99"
  }]
}), "STORE_DATA_GENERATION_CAPACITY_LIMIT");
assert.deepEqual(
  capacitySideEffectSnapshot(),
  capacitySourceBefore,
  "source capacity stop must have no backup, audit, sheet, or data side effect"
);
context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT = generationCapacityHardLimit;
context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT = generationCapacityWarningCount;

const capacityAuditSheet = storeSpreadsheet.getSheetByName("audit");
const capacityBackupSheet = storeSpreadsheet.getSheetByName("backups");
const capacityAuditMaxRows = capacityAuditSheet.maxRows;
const capacityBackupMaxRows = capacityBackupSheet.maxRows;
capacityAuditSheet.maxRows = capacityAuditSheet.getLastRow();
capacityBackupSheet.maxRows = capacityBackupSheet.getLastRow();
const sideEffectCapacity = context.storeDataGenerationCapacity_(storeSpreadsheet);
const sideEffectCellProjection = context.storeProjectedBulkSideEffectCells_(
  storeSpreadsheet,
  { auditRows: 6, backupRows: 1, reconcileBackups: true }
);
const sideEffectGenerationProjection =
  context.storeProjectedDataGenerationCells_(
    context.storeReadRecords_(storeSpreadsheet).length + 1,
    context.storeReadRoles_(storeSpreadsheet).length
  ) +
  context.storeProjectedGenerationRegistryCells_(storeSpreadsheet) +
  context.storeProjectedActiveGenerationPointerCells_(storeSpreadsheet);
assert(sideEffectCellProjection > 0);
const sideEffectCellBefore = capacitySideEffectSnapshot();
context.RENEWAL_STORE.SPREADSHEET_CELL_WARNING_LIMIT =
  sideEffectCapacity.allocatedCellCount +
  sideEffectGenerationProjection + sideEffectCellProjection - 2;
context.RENEWAL_STORE.SPREADSHEET_CELL_HARD_LIMIT =
  sideEffectCapacity.allocatedCellCount +
  sideEffectGenerationProjection + sideEffectCellProjection - 1;
expectCode(() => context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: capacityLocalPreview.batchId,
  confirmToken: capacityLocalPreview.confirmToken,
  records: capacityLocalRecords
}), "STORE_SPREADSHEET_CELL_CAPACITY_LIMIT");
assert.deepEqual(
  capacitySideEffectSnapshot(),
  sideEffectCellBefore,
  "cell projection must reserve backup and all PREPARED/COMMITTED audit expansion"
);
const sideEffectCellBatchAfter = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === capacityLocalPreview.batchId);
assert.equal(sideEffectCellBatchAfter.status, capacityLocalBatchBefore.status);
assert.equal(sideEffectCellBatchAfter.backupId, capacityLocalBatchBefore.backupId);
context.RENEWAL_STORE.SPREADSHEET_CELL_HARD_LIMIT = spreadsheetCellHardLimit;
context.RENEWAL_STORE.SPREADSHEET_CELL_WARNING_LIMIT = spreadsheetCellWarningLimit;
capacityAuditSheet.maxRows = capacityAuditMaxRows;
capacityBackupSheet.maxRows = capacityBackupMaxRows;

const auditRowLimitBefore = capacitySideEffectSnapshot();
const capacityAuditGetLastRow = capacityAuditSheet.getLastRow;
capacityAuditSheet.getLastRow = function () {
  return context.RENEWAL_STORE.MAX_SHEET_ROWS - 5;
};
expectCode(() => context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: capacityLocalPreview.batchId,
  confirmToken: capacityLocalPreview.confirmToken,
  records: capacityLocalRecords
}), "STORE_SHEET_ROW_LIMIT");
capacityAuditSheet.getLastRow = capacityAuditGetLastRow;
assert.deepEqual(
  capacitySideEffectSnapshot(),
  auditRowLimitBefore,
  "audit row-limit stop must happen before backup, batch, audit, sheet, or data changes"
);

const priorGenerationSheet = storeSpreadsheet.getSheetByName(
  context.storeDataGenerationSheetName_("records", generationBeforeFailure)
);
const priorGenerationObjects = context.storeParseRecordObjects_(
  context.storeReadObjectsFromSheet_(priorGenerationSheet, "records")
);
assert.equal(
  priorGenerationObjects.some((row) => row.recordId === "generation-pointer-after"),
  false,
  "ordinary row updates must not write to a non-active generation"
);

const pointerRow = context.storeEnsureActiveDataGenerationPointer_(storeSpreadsheet);
storeSpreadsheet.getSheetByName("_meta").getRange(pointerRow, 2).setValue("g_unregistered");
expectCode(() => context.storeListRecords_(), "STORE_DATA_GENERATION_INCOMPLETE");
storeSpreadsheet.getSheetByName("_meta").getRange(pointerRow, 2).setValue(generationAfterAmbiguousStop);
assert(context.storeGetRecord_("generation-pointer-after"));

state.actor = "owner@example.com";
const hardStopRestoreBackup = context.storeCreateManualBackup_({
  reasonCode: "HARD_STOP_RESTORE_BASE",
  idempotencyKey: "manual-hard-stop-restore-0001"
});
const hardStopRestoreCurrent = context.storeGetRecord_("generation-pointer-after");
context.storeUpsertRecord_({
  record: { ...hardStopRestoreCurrent.record, targetName: "changed after restore backup" },
  expectedVersion: hardStopRestoreCurrent.version,
  reasonCode: "HARD_STOP_RESTORE_CHANGE"
});
const hardStopRestorePlan = context.storePrepareRestore_({
  backupId: hardStopRestoreBackup.backupId,
  reasonCode: "HARD_STOP_RESTORE",
  approver: "approver@example.com"
});
state.actor = "approver@example.com";
const capacityRestoreBatchBefore = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === hardStopRestorePlan.batchId);
const capacityRestoreBefore = capacitySideEffectSnapshot();
const capacityRestoreInventory =
  context.storeDataGenerationCapacity_(storeSpreadsheet);
context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT =
  capacityRestoreInventory.retainedCount - 1;
context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT =
  capacityRestoreInventory.retainedCount;
expectCode(() => context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: hardStopRestorePlan.batchId,
  confirmBatchId: hardStopRestorePlan.batchId
}), "STORE_DATA_GENERATION_CAPACITY_LIMIT");
assert.deepEqual(
  capacitySideEffectSnapshot(),
  capacityRestoreBefore,
  "restore capacity stop must have no backup, audit, sheet, or data side effect"
);
const capacityRestoreBatchAfter = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === hardStopRestorePlan.batchId);
assert.equal(capacityRestoreBatchAfter.status, capacityRestoreBatchBefore.status);
assert.equal(capacityRestoreBatchAfter.backupId, capacityRestoreBatchBefore.backupId);
context.RENEWAL_STORE.DATA_GENERATION_HARD_LIMIT = generationCapacityHardLimit;
context.RENEWAL_STORE.DATA_GENERATION_WARNING_COUNT = generationCapacityWarningCount;
state.pointerFailure = "after";
const interruptedRestore = context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: hardStopRestorePlan.batchId,
  confirmBatchId: hardStopRestorePlan.batchId
});
assert.equal(interruptedRestore.restored, true);
assert.equal(interruptedRestore.recoveryRequired, true);
const interruptedBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === hardStopRestorePlan.batchId);
assert.equal(interruptedBatch.status, "COMMITTING");
assert.equal(
  context.storeListPendingRestores_().some((row) =>
    row.batchId === hardStopRestorePlan.batchId && row.status === "COMMITTING"
  ),
  true
);
interruptedBatch.expiresAt = "2000-01-01T00:00:00.000Z";
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "import_batches",
  interruptedBatch._rowNumber,
  interruptedBatch
);
const recoveredRestore = context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: hardStopRestorePlan.batchId,
  confirmBatchId: hardStopRestorePlan.batchId
});
assert.equal(recoveredRestore.recovered, true);
assert.equal(recoveredRestore.summary.roles.recovered, true);
assert(recoveredRestore.summary.roles.total >= 2);
assert.equal(
  context.storeGetRecord_("generation-pointer-after").record.targetName,
  "row committed before manifest recovery"
);

state.actor = "owner@example.com";
const beforeCutoverSourceBackup = context.storeCreateManualBackup_({
  reasonCode: "BEFORE_CUTOVER_SOURCE",
  idempotencyKey: "manual-before-cutover-source-0001"
});
const beforeCutoverCurrent = context.storeGetRecord_("generation-pointer-after");
context.storeUpsertRecord_({
  record: { ...beforeCutoverCurrent.record, targetName: "changed before cutover stop" },
  expectedVersion: beforeCutoverCurrent.version,
  reasonCode: "BEFORE_CUTOVER_CHANGE"
});
const beforeCutoverPlan = context.storePrepareRestore_({
  backupId: beforeCutoverSourceBackup.backupId,
  reasonCode: "BEFORE_CUTOVER_RESTORE",
  approver: "approver@example.com"
});
state.actor = "approver@example.com";
const beforeCutoverBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === beforeCutoverPlan.batchId);
const beforeCutoverSafety = context.storeCreateBackupUnlocked_(
  storeSpreadsheet,
  "approver@example.com",
  "PRE_RESTORE",
  "PRE_RESTORE_SAFETY_BACKUP"
);
context.storeAppendAudit_(storeSpreadsheet, {
  eventState: "COMMITTED",
  entityType: "restore",
  entityKey: beforeCutoverBatch.batchId,
  action: "RESTORE_SAFETY_BACKUP_CREATED",
  actor: "approver@example.com",
  reasonCode: "PRE_RESTORE_SAFETY_BACKUP",
  approver: beforeCutoverBatch.approver,
  beforeHash: beforeCutoverBatch.baseStoreHash,
  afterHash: beforeCutoverSafety.contentHash,
  versionBefore: 0,
  versionAfter: 0,
  correlationId: beforeCutoverSafety.backupId
});
beforeCutoverBatch.status = "COMMITTING";
beforeCutoverBatch.expiresAt = "2000-01-01T00:00:00.000Z";
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "import_batches",
  beforeCutoverBatch._rowNumber,
  beforeCutoverBatch
);
const backupCountBeforeResume = context.storeReadBackups_(storeSpreadsheet).length;
const resumedBeforeCutover = context.storeConfirmRestore_({
  confirm: context.RENEWAL_STORE.RESTORE_CONFIRM,
  batchId: beforeCutoverPlan.batchId,
  confirmBatchId: beforeCutoverPlan.batchId
});
assert.equal(resumedBeforeCutover.restored, true);
assert.equal(Boolean(resumedBeforeCutover.recoveryRequired), false);
assert.equal(resumedBeforeCutover.safetyBackupId, beforeCutoverSafety.backupId);
assert.equal(
  context.storeReadBackups_(storeSpreadsheet).length,
  backupCountBeforeResume,
  "resume before cutover must reuse the registered safety backup"
);
assert.equal(
  context.storeGetRecord_("generation-pointer-after").record.targetName,
  "row committed before manifest recovery"
);

state.actor = "owner@example.com";
const localBeforeCutoverRecord = [{
  id: "local-before-cutover-stop",
  personId: "UC-LOCAL-BEFORE-CUTOVER",
  fiscalYear: "2026",
  sessionNo: "1",
  targetName: "local resume before pointer",
  invoiceNo: ""
}];
const localBeforeCutoverPreview = context.storePreviewLocalRecordsBatch_({
  records: localBeforeCutoverRecord,
  reasonCode: "LOCAL_STORAGE_MIGRATION"
});
const localBeforeCutoverBatch = context.storeReadImportBatches_(storeSpreadsheet)
  .find((row) => row.batchId === localBeforeCutoverPreview.batchId);
const localBeforeCutoverSafety = context.storeCreateBackupUnlocked_(
  storeSpreadsheet,
  "owner@example.com",
  "PRE_LOCAL_MIGRATION",
  "PRE_LOCAL_MIGRATION_BACKUP"
);
localBeforeCutoverBatch.status = "COMMITTING";
localBeforeCutoverBatch.backupId = localBeforeCutoverSafety.backupId;
localBeforeCutoverBatch.expiresAt = "2000-01-01T00:00:00.000Z";
context.storeWriteObjectAt_(
  storeSpreadsheet,
  "import_batches",
  localBeforeCutoverBatch._rowNumber,
  localBeforeCutoverBatch
);
const localGenerationBeforeResume = context.storeReadActiveDataGeneration_(storeSpreadsheet);
const localResumedBeforeCutover = context.storeCommitLocalRecordsBatch_({
  confirm: context.RENEWAL_STORE.LOCAL_BATCH_CONFIRM,
  batchId: localBeforeCutoverPreview.batchId,
  confirmToken: localBeforeCutoverPreview.confirmToken,
  records: localBeforeCutoverRecord
});
assert.equal(localResumedBeforeCutover.committed, true);
assert.notEqual(
  context.storeReadActiveDataGeneration_(storeSpreadsheet),
  localGenerationBeforeResume
);
assert(context.storeGetRecord_("local-before-cutover-stop"));

state.nextBackupFileEditor = "unexpected-cleanup@example.com";
state.driveRemoveFailure = "simulated permanent delete failure";
let trackedDriveCleanupError;
try {
  context.storeCreatePrivateDriveItemInParent_({
    name: "cleanup-tracking-test.json",
    mimeType: "application/json",
    parentId: backupFolder.getId(),
    blob: context.Utilities.newBlob(
      "{}", "application/json", "cleanup-tracking-test.json"
    ),
    label: "cleanup tracking test",
    scope: "BACKUP"
  });
} catch (error) {
  trackedDriveCleanupError = error;
}
assert.equal(trackedDriveCleanupError.code, "STORE_DRIVE_CLEANUP_FAILED");
assert.equal(trackedDriveCleanupError.storeDriveCleanupFailed, true);
const trackedStoreDriveFailures = Object.entries(
  Object.fromEntries(state.properties)
).filter(([key, value]) =>
  key.startsWith(context.RENEWAL_STORE.DRIVE_FAILURE_PREFIX) &&
  JSON.parse(value).state === "CLEANUP_FAILED"
);
assert(trackedStoreDriveFailures.length >= 1);
expectCode(
  () => context.storeCreatePrivateDriveItemInParent_({
    name: "cleanup-tracking-test.json",
    mimeType: "application/json",
    parentId: backupFolder.getId(),
    blob: context.Utilities.newBlob(
      "{}", "application/json", "cleanup-tracking-test.json"
    ),
    label: "cleanup tracking test",
    scope: "BACKUP"
  }),
  "STORE_DRIVE_CLEANUP_UNRESOLVED"
);
state.files.delete(trackedDriveCleanupError.storeDriveResourceId);

const interruptedSetupOptions = {
  name: "setup-interruption-tracking",
  mimeType: "application/vnd.google-apps.folder",
  parentId: rootFolder.getId(),
  description: "CDP_RENEWAL_SETUP_INTERRUPTION_TEST",
  label: "setup interruption fixture",
  scope: "SETUP"
};
const interruptedSetupFolder =
  context.storeCreatePrivateDriveItemInParent_(interruptedSetupOptions);
const interruptedSetupFailureKey = context.storeDriveFailureKey_(
  context.storeDriveCreateOperation_(interruptedSetupOptions)
);
assert.equal(
  JSON.parse(state.properties.get(interruptedSetupFailureKey)).state,
  "CREATED_VERIFIED",
  "a verified setup child remains tracked until publication completes"
);
expectCode(
  () => context.storeAssertNoUnresolvedDriveSetupOutcome_(),
  "STORE_SETUP_DRIVE_OUTCOME_UNRESOLVED"
);
expectCode(
  () => context.storeCreatePrivateDriveItemInParent_(interruptedSetupOptions),
  "STORE_DRIVE_OUTCOME_UNRESOLVED"
);
context.Drive.Files.remove(interruptedSetupFolder.getId());
context.storeClearDriveFailure_(interruptedSetupFailureKey);

assert.equal(
  /DriveApp\.createFolder|SpreadsheetApp\.create|\.moveTo\(|\.createFile\(/.test(
    dataStoreSource
  ),
  false,
  "production storage creation must not use create-then-move/default-visible APIs"
);
assert(
  dataStoreSource.includes("ignoreDefaultVisibility: true") &&
  dataStoreSource.includes("Drive.Files.get") &&
  dataStoreSource.includes("Drive.Files.remove"),
  "safe creation must enforce private defaults, metadata readback and permanent cleanup"
);

console.log("store_logic_test: OK");
