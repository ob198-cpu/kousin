const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const acorn = require("acorn");
const crypto = require("node:crypto");

const artifactModuleFiles = ["Artifacts.js", "ArtifactCalendar.js", "ArtifactRegistry.js"];
const artifactModuleSources = new Map(
  artifactModuleFiles.map((file) => [file, fs.readFileSync(file, "utf8")])
);
const artifactModuleAsts = new Map(
  artifactModuleFiles.map((file) => [
    file,
    acorn.parse(artifactModuleSources.get(file), { ecmaVersion: "latest", sourceType: "script" })
  ])
);
const source = artifactModuleFiles.map((file) => artifactModuleSources.get(file)).join("\n\n");
const functionDefinitions = new Map();
const topLevelOwners = new Map();

function registerTopLevel(name, file) {
  assert(!topLevelOwners.has(name),
    `Apps Script top-level global must be unique: ${name} (${topLevelOwners.get(name)} / ${file})`);
  topLevelOwners.set(name, file);
}

for (const file of artifactModuleFiles) {
  const moduleSource = artifactModuleSources.get(file);
  for (const node of artifactModuleAsts.get(file).body) {
    if (node.type === "FunctionDeclaration" && node.id) {
      registerTopLevel(node.id.name, file);
      functionDefinitions.set(node.id.name, { file, node, source: moduleSource });
    } else if (node.type === "ClassDeclaration" && node.id) {
      registerTopLevel(node.id.name, file);
    } else if (node.type === "VariableDeclaration") {
      for (const declaration of node.declarations) {
        assert.equal(declaration.id.type, "Identifier",
          `${file} top-level destructuring is not supported by the global collision test`);
        registerTopLevel(declaration.id.name, file);
      }
    }
  }
}

function extractFunction(name) {
  const definition = functionDefinitions.get(name);
  assert(definition, `${name} was not found in the artifact modules`);
  return definition.source.slice(definition.node.start, definition.node.end);
}

const expectedCalendarModuleFunctions = [
  "artifactNormalizeIsoDateList_", "artifactParseCsvMatrixStrict_",
  "artifactParseOfficialHolidayCsv_", "artifactAssertImportedHolidayCalendarStore_",
  "artifactLoadImportedHolidayCalendars_", "artifactLoadEffectiveHolidayMaster_",
  "artifactValidateDipsCalendarSettings_", "artifactAddIsoDaysUtc_",
  "artifactDipsSubmissionDeadline_", "artifactValidateDipsSubmission_"
];
const expectedRegistryModuleFunctions = [
  "artifactOutputIdentity_", "artifactPreparedOutputIdentity_", "artifactExpectedOutputFileName_", "artifactPreparedOutputFileName_",
  "artifactPrepareNewOutputFile_", "artifactFinalizeNewOutputFile_", "artifactDriveRevisionState_",
  "artifactOutputContentHash_", "artifactAssertPriorOutputVersions_", "artifactAssertOutputRootContinuity_",
  "artifactAssertExistingOutputFile_", "artifactAssertGeneratedFileIdentity_", "artifactCreateSpreadsheetInFolder_", "artifactEnsureRegistry_",
  "artifactCreateDriveItemInFolder_", "artifactUpdateBlobFileContent_", "artifactCreateFolderInFolder_", "artifactCopyFileInFolder_",
  "artifactDriveAttemptOperation_", "artifactDriveAttemptKey_", "artifactReadDriveAttempt_",
  "artifactAssertNoUnresolvedDriveAttempt_", "artifactBeginDriveAttempt_",
  "artifactMarkDriveAttemptUncertain_", "artifactMarkDriveAttemptCreatedVerified_",
  "artifactClearDriveAttempt_", "artifactClearPublishedDriveAttempt_",
  "artifactClearPublishedDriveAttemptsForResourceIds_",
  "artifactPublishDriveIdentityProperty_",
  "artifactInitializeRegistryHeader_", "artifactRegistryRowsIssue_", "artifactRegistryGlobalRowsIssue_",
  "artifactAssertRegistryStructure_", "artifactReadRegistryRows_", "artifactReadAllRegistryRows_",
  "artifactRollbackCreated_", "artifactAppendRegistry_", "artifactRegistryRowObject_",
  "artifactPreparedRegistryMatches_", "artifactAppendPreparedRegistry_", "artifactRegistryEntryValues_",
  "artifactRegistryOutcomeUncertainError_", "artifactUpdatePreparedRegistry_", "artifactFindPrepared_",
  "artifactReplaceRegistryRow_", "artifactBuildRegistryMetadata_", "artifactCompleteRegistryMetadata_",
  "artifactPreparedFinalIdentityPrefix_", "artifactRecoverPreparedFile_",
  "artifactAssertNoStrayPreparedLedger_", "artifactRecoverPreparedLedger_",
  "artifactRecoverPreparedOutput_", "artifactFindExisting_", "artifactNextVersion_"
];
expectedCalendarModuleFunctions.forEach((name) => {
  assert.equal(functionDefinitions.get(name).file, "ArtifactCalendar.js",
    `${name} must remain in the calendar module`);
});
expectedRegistryModuleFunctions.forEach((name) => {
  assert.equal(functionDefinitions.get(name).file, "ArtifactRegistry.js",
    `${name} must remain in the registry/WAL module`);
});

const claspScriptFiles = fs.readdirSync(".").filter((file) => file.endsWith(".js")).sort();
const projectGlobalOwners = new Map();
for (const file of claspScriptFiles) {
  const moduleAst = artifactModuleAsts.get(file) ||
    acorn.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script" });
  for (const node of moduleAst.body) {
    let names = [];
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) {
      names = [node.id.name];
    } else if (node.type === "VariableDeclaration") {
      names = node.declarations.map((declaration) => {
        assert.equal(declaration.id.type, "Identifier",
          `${file} top-level destructuring is not supported by the Apps Script collision test`);
        return declaration.id.name;
      });
    }
    for (const name of names) {
      assert(!projectGlobalOwners.has(name),
        `Apps Script project global must be unique: ${name} (${projectGlobalOwners.get(name)} / ${file})`);
      projectGlobalOwners.set(name, file);
    }
  }
}

const pureNames = [
  "artifactCalculateBilling_", "artifactAddCalendarMonthsMinusOne_", "artifactDurationMinutes_",
  "artifactTimeMinutes_", "artifactFindTrainingOverlaps_", "artifactValidateTraining_",
  "artifactValidateCommon_",
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
  "artifactAssertPrivateSharingAccess_", "artifactRequireSafeOutputFolder_", "artifactPublicSettings_", "artifactLoadSettings_",
  "artifactSettingsDefaults_", "artifactNormalizeStoredSettings_", "artifactStoredSettingsObject_",
  "artifactNormalizeLegacyOutputFolders_", "artifactNormalizeSettingsMutationHistory_",
  "artifactSettingsSemanticValue_", "artifactSettingsStateEnvelopeValue_",
  "artifactCleanupLegacySettingsProperties_", "artifactAssertLegacySettingsCleanupComplete_",
  "artifactLoadSettingsState_", "artifactSettingsUtf8Bytes_", "artifactCommitSettingsState_",
  "artifactSettingsFromState_", "artifactSettingsAuditRows_", "artifactEnsureSettingsMutationAudit_",
  "artifactAssertLegacyOutputFolderSwitchSafe_",
  "artifactAssertReusableDriveItem_", "artifactAssertOwnerOnlyDriveItem_", "artifactHardenNewDriveItem_",
  "artifactSettingsForHash_", "artifactActiveActorEmail_",
  "artifactReferencePinKeysForKinds_", "artifactReferenceFingerprintForKind_",
  "artifactNormalizeAllowedEmails_", "artifactAssertAllowedOutputEmails_", "artifactAssertDriveItemAcl_", "artifactNormalizeSchedules_",
  "artifactNormalizeIsoDateList_", "artifactValidateDipsCalendarSettings_", "artifactAddIsoDaysUtc_",
  "artifactParseCsvMatrixStrict_", "artifactParseOfficialHolidayCsv_", "artifactAssertImportedHolidayCalendarStore_",
  "artifactDipsSubmissionDeadline_", "artifactValidateDipsSubmission_", "artifactErrorMessage_",
  "artifactTemplateId_", "artifactAssertRequiredTemplateSettings_",
  "artifactOriginalCertificateDates_", "artifactValidateCertificateDateContinuity_", "artifactAssertCertificateDateContinuity_",
  "artifactCertificateTemplateMissingSentinels_", "artifactLedgerTemplateRowsHaveData_",
  "artifactStripLedgerOldVersionMarkers_", "artifactLedgerOldVersionMarkers_", "artifactLedgerVisibleHash_",
  "artifactLedgerStateHash_", "artifactLedgerStableFieldsHash_", "artifactAnnualLedgerRowIssue_", "artifactAnnualLedgerRowsIssue_", "artifactNextLedgerRow_",
  "artifactRegistryRowsIssue_", "artifactRegistryGlobalRowsIssue_", "artifactFindExisting_", "artifactRecordNumberState_", "artifactAssertRecordNumberContinuity_",
  "artifactReadRegistryRows_", "artifactRegistryRowObject_", "artifactPreparedRegistryMatches_", "artifactAppendRegistry_", "artifactAppendPreparedRegistry_",
  "artifactRegistryEntryValues_", "artifactRegistryOutcomeUncertainError_", "artifactUpdatePreparedRegistry_",
  "artifactFindPrepared_", "artifactReplaceRegistryRow_", "artifactNextVersion_",
  "artifactGuidanceTemplateMissingSentinels_", "artifactCertificateTableSelection_", "artifactClassValue_",
  "artifactFlattenDocumentTabs_", "artifactGetDocumentTab_",
  "artifactIteratorItems_", "artifactCreateDriveItemInFolder_", "artifactCreateSpreadsheetInFolder_",
  "artifactUpdateBlobFileContent_", "artifactCreateFolderInFolder_", "artifactCopyFileInFolder_",
  "artifactDriveAttemptOperation_", "artifactDriveAttemptKey_", "artifactReadDriveAttempt_",
  "artifactAssertNoUnresolvedDriveAttempt_", "artifactBeginDriveAttempt_",
  "artifactMarkDriveAttemptUncertain_", "artifactMarkDriveAttemptCreatedVerified_",
  "artifactClearDriveAttempt_", "artifactClearPublishedDriveAttempt_",
  "artifactClearPublishedDriveAttemptsForResourceIds_",
  "artifactPublishDriveIdentityProperty_",
  "artifactGeneratedFileIdentity_", "artifactOutputIdentity_", "artifactPreparedOutputIdentity_", "artifactExpectedOutputFileName_", "artifactPreparedOutputFileName_",
  "artifactPrepareNewOutputFile_",
  "artifactPreparedFinalIdentityPrefix_", "artifactAnnualLedgerFileName_", "artifactAssertNoStrayPreparedLedger_",
  "artifactRecoverPreparedFile_", "artifactRecoverPreparedLedger_", "artifactRecoverPreparedOutput_",
  "artifactBoolean_", "artifactExtractDriveId_", "artifactFiscalYearFromIso_", "artifactExtractDriveFileId_", "artifactFolderUrl_", "artifactIsEmail_",
  "artifactCsvRow_", "artifactNumber_", "artifactStrictNumber_", "artifactSheetText_", "artifactRequireIsoDate_",
  "artifactSafeSheetRow_", "artifactSafeSheetMatrix_", "artifactText_", "artifactClone_",
  "artifactNormalizeRecord_", "artifactNormalizeKinds_", "artifactComposeTemplateFingerprint_", "artifactCanonicalJson_", "artifactHashHex_", "artifactPad_",
  "artifactCanonicalRequestError_", "artifactLoadCanonicalArtifactRequest_", "artifactLoadFormalInvoiceForArtifact_",
  "artifactValidateFormalBillingSnapshot_", "artifactBuildFormalBillingSnapshotForFinance_", "artifactSelectFormalInvoiceForArtifact_",
  "artifactFormalInvoiceEffectiveBilled_", "artifactAssertFormalInvoiceNewGenerationAllowed_",
  "artifactApplyFormalInvoiceToRecord_", "artifactBillingRenderInputs_",
  "artifactFormalInvoiceRecordUpdates_", "artifactFormalInvoiceMetadata_",
  "artifactCanonicalPayloadWithUpdates_", "artifactPersistCanonicalReservationsUnlocked_",
  "artifactCanonicalNumberReservationRows_", "artifactAttachCanonicalResult_",
  "artifactLatestCanonicalAfterFailure_",
  "artifactNormalizeNumberList_", "artifactBuildNumberingMigrationDryRun_",
  "artifactValueIsNonEmpty_", "artifactFindForbiddenDocumentContent_",
  "artifactDriveItemTrackingInfo_", "artifactPersistCleanupFailure_", "artifactCleanupFailureEntries_",
  "artifactAssertNoUnresolvedCleanupFailures_", "artifactPermanentlyDeleteNewDriveItem_",
  "artifactThrowAfterCleanup_", "artifactShortKey_", "artifactNowText_",
  "artifactFindSecondClassPracticalMinimumCells_", "artifactReplaceSecondClassPracticalMinimum_",
  "artifactRecordName_", "artifactSafeName_"
];
const driveState = {
  sharingAccess: "PRIVATE",
  sharingThrows: false,
  outputTrashed: false,
  templateParentId: "template-parent",
  actorEmail: "owner@example.com",
  effectiveEmail: "owner@example.com",
  ownerEmail: "owner@example.com",
  editorEmails: [],
  viewerEmails: [],
  shareableByEditors: false,
  permissions: [{ type: "user", emailAddress: "owner@example.com", role: "owner" }],
  permissionNextPageToken: ""
};
const directCreateState = {
  calls: [],
  copies: [],
  updates: [],
  parentById: {},
  trashedIds: [],
  removedIds: [],
  removedPermissions: [],
  createThrowsAfterCommit: false,
  copyThrowsAfterCommit: false,
  removeThrows: false,
  lookupThrowIds: [],
  responseOverride: null,
  copyResponseOverride: null,
  listedFiles: [],
  listNextPageToken: ""
};
const cleanupAuditProperties = {};
const settingsPropertyState = {
  throwBeforeWrite: false,
  throwAfterWrite: false,
  throwOnRead: false,
  throwOnGetProperties: false,
  legacyDeleteModeByKey: {},
  deleteCalls: []
};
const settingsAuditRows = [];
const settingsAuditState = {
  appendThrowsBeforeCommit: false,
  appendThrowsAfterCommit: false
};
function user(email) { return { getEmail: () => email }; }
function mockParents(parentIds) {
  let index = 0;
  const ids = parentIds.slice();
  return {
    hasNext: () => index < ids.length,
    next: () => ({ getId: () => ids[index++] })
  };
}
function mockDriveItem(id, parentIds) {
  let shareable = driveState.shareableByEditors;
  let name = id;
  let description = "";
  return {
    getId: () => id,
    getName: () => name,
    setName(value) { name = String(value); return this; },
    getUrl: () => "https://drive.google.com/open?id=" + id,
    getDescription: () => description,
    setDescription(value) { description = String(value); return this; },
    isTrashed: () => driveState.outputTrashed,
    setTrashed(value) {
      if (value) directCreateState.trashedIds.push(id);
    },
    getSharingAccess() {
      if (driveState.sharingThrows) throw new Error("sharing unavailable");
      return driveState.sharingAccess;
    },
    getOwner: () => user(driveState.ownerEmail),
    getEditors: () => driveState.editorEmails.map(user),
    getViewers: () => driveState.viewerEmails.map(user),
    isShareableByEditors: () => shareable,
    setShareableByEditors(value) { shareable = Boolean(value); },
    getParents: () => mockParents(parentIds)
  };
}
const context = {
  isFinite,
  RENEWAL_ARTIFACT: {
    SETTINGS_KEY: "RENEWAL_ARTIFACT_SETTINGS_V1",
    BANK_KEY: "RENEWAL_ARTIFACT_BANK_V1",
    SETTINGS_STATE_KEY: "RENEWAL_ARTIFACT_SETTINGS_STATE_V2",
    SETTINGS_STATE_FORMAT: "CDP_RENEWAL_ARTIFACT_SETTINGS_STATE_V2",
    SETTINGS_STATE_MAX_BYTES: 8000,
    SCHEMA_VERSION: 3,
    DRIVE_IDENTITY_VERSION: "CDP_RENEWAL_ARTIFACT_IDENTITY_V1",
    KINDS: ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"],
    LABELS: {
      ledger: "発行台帳", certificate: "講習修了証明書", dipsCsv: "DIPS提出CSV",
      guidance: "更新講習のご案内", training: "講習記録簿", billing: "見積書・請求書"
    },
    BILLING_NUMBER_NAMESPACE: "UC0157",
    ORGANIZATION_CODE: "0157",
    PINNED_OUTPUT_PARENT_FOLDER_ID: "1XmQirjBrQR-uC_GuBVXAyRK5zfqtoQwN",
    PINNED_OUTPUT_PARENT_FOLDER_NAME: "2026年度",
    PINNED_OUTPUT_FISCAL_YEAR: "2026",
    CERTIFICATE_BASE_TAB_ID: "t.0",
    TEMPLATE_IDS: { guidance: "template-guidance", training: "template-training" },
    BLOCKED_TEMPLATE_IDS: { ledger: "blocked-ledger", certificate: "blocked-certificate" },
    OFFICIAL_HOLIDAY_CSV_URL: "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv",
    REFERENCE_SOURCE_PINS: {
      manual: {
        id: "pinned-manual",
        modifiedTime: "2026-07-14T13:46:53.108Z",
        revisionId: "64",
        revisionModifiedTime: "2026-07-14T13:46:53.063Z",
        kinds: ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"]
      }
    }
  },
  RENEWAL_JAPAN_HOLIDAYS: {
    version: "TEST_V1",
    years: {
      "2026": ["01-01", "01-12", "02-11", "02-23", "03-20", "04-29", "05-03", "05-04", "05-05", "05-06", "07-20", "08-11", "09-21", "09-22", "09-23", "10-12", "11-03", "11-23"],
      "2027": ["01-01"]
    }
  },
  // The production version reads the verified Script Properties master.  The pure
  // validation test uses the preloaded official years as that master.
  artifactLoadEffectiveHolidayMaster_: () => context.RENEWAL_JAPAN_HOLIDAYS,
  Session: {
    getActiveUser: () => user(driveState.actorEmail),
    getEffectiveUser: () => user(driveState.effectiveEmail)
  },
  DriveApp: {
    Access: { PRIVATE: "PRIVATE" },
    getFolderById(id) {
      const parents = directCreateState.parentById[id] || ["root"];
      const item = mockDriveItem(id, parents);
      item.getName = () => "output";
      return item;
    },
    getFileById(id) {
      if (directCreateState.lookupThrowIds.includes(id)) {
        throw new Error("simulated DriveApp lookup failure");
      }
      const parents = directCreateState.parentById[id] ||
        (driveState.templateParentId ? [driveState.templateParentId] : []);
      return mockDriveItem(id, parents);
    }
  },
  Drive: {
    Files: {
      create(metadata, mediaData, options) {
        directCreateState.calls.push({ metadata, mediaData, options });
        const response = {
          id: "direct-spreadsheet-id",
          name: metadata.name,
          mimeType: metadata.mimeType,
          parents: metadata.parents.slice()
        };
        directCreateState.parentById[response.id] = metadata.parents.slice();
        if (directCreateState.createThrowsAfterCommit) {
          throw new Error("simulated create response loss");
        }
        return directCreateState.responseOverride
          ? directCreateState.responseOverride(response, metadata, mediaData, options)
          : response;
      },
      copy(metadata, sourceId, options) {
        directCreateState.copies.push({ metadata, sourceId, options });
        const response = {
          id: "direct-copy-id",
          name: metadata.name,
          mimeType: "application/vnd.google-apps.document",
          parents: metadata.parents.slice()
        };
        directCreateState.parentById[response.id] = metadata.parents.slice();
        if (directCreateState.copyThrowsAfterCommit) {
          throw new Error("simulated copy response loss");
        }
        return directCreateState.copyResponseOverride
          ? directCreateState.copyResponseOverride(response, metadata, sourceId, options)
          : response;
      },
      update(metadata, fileId, mediaData, options) {
        directCreateState.updates.push({ metadata, fileId, mediaData, options });
        const parentIds = directCreateState.parentById[fileId] || [];
        return {
          id: fileId,
          name: mediaData && mediaData.name || "blob-test.csv",
          mimeType: mediaData && mediaData.contentType || "text/csv",
          parents: parentIds.slice()
        };
      },
      list() {
        return {
          files: directCreateState.listedFiles.slice(),
          nextPageToken: directCreateState.listNextPageToken
        };
      },
      remove(fileId, options) {
        if (directCreateState.removeThrows) {
          throw new Error("simulated permanent delete failure");
        }
        directCreateState.removedIds.push(fileId);
        assert.equal(options.supportsAllDrives, true);
      }
    },
    Permissions: {
      list() {
        return { permissions: driveState.permissions, nextPageToken: driveState.permissionNextPageToken };
      },
      remove(fileId, permissionId, options) {
        directCreateState.removedPermissions.push({ fileId, permissionId, options });
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
      getProperty(key) {
        if (settingsPropertyState.throwOnRead &&
            key === context.RENEWAL_ARTIFACT.SETTINGS_STATE_KEY) {
          throw new Error("simulated settings read failure");
        }
        return Object.prototype.hasOwnProperty.call(cleanupAuditProperties, key)
          ? cleanupAuditProperties[key]
          : null;
      },
      setProperty(key, value) {
        if (settingsPropertyState.throwBeforeWrite &&
            key === context.RENEWAL_ARTIFACT.SETTINGS_STATE_KEY) {
          throw new Error("simulated settings write failure");
        }
        cleanupAuditProperties[key] = value;
        if (settingsPropertyState.throwAfterWrite &&
            key === context.RENEWAL_ARTIFACT.SETTINGS_STATE_KEY) {
          throw new Error("simulated settings response loss");
        }
        return this;
      },
      deleteProperty(key) {
        settingsPropertyState.deleteCalls.push(key);
        if (settingsPropertyState.legacyDeleteModeByKey[key] === "before") {
          throw new Error("simulated legacy property delete failure");
        }
        delete cleanupAuditProperties[key];
        if (settingsPropertyState.legacyDeleteModeByKey[key] === "after") {
          throw new Error("simulated legacy property delete response loss");
        }
        return this;
      },
      getProperties() {
        if (settingsPropertyState.throwOnGetProperties) {
          throw new Error("simulated property readback failure");
        }
        return Object.assign({}, cleanupAuditProperties);
      }
    })
  },
  storeOpen_: () => ({ getId: () => "canonical-store" }),
  storeSha256_: (value) => crypto.createHash("sha256")
    .update(String(value), "utf8").digest("hex"),
  storeReadObjects_: (spreadsheet, sheetName) => {
    assert.equal(sheetName, "audit");
    return settingsAuditRows.map((row) => Object.assign({}, row));
  },
  storeAppendAudit_: (spreadsheet, event) => {
    if (settingsAuditState.appendThrowsBeforeCommit) {
      throw new Error("simulated audit append failure");
    }
    settingsAuditRows.push({
      eventState: String(event.eventState || "COMMITTED").toUpperCase(),
      entityType: String(event.entityType || "").toUpperCase(),
      entityKeyHash: crypto.createHash("sha256")
        .update(String(event.entityKey || ""), "utf8").digest("hex"),
      action: String(event.action || "").toUpperCase(),
      actor: String(event.actor || "").toLowerCase(),
      reasonCode: String(event.reasonCode || "").toUpperCase(),
      beforeHash: String(event.beforeHash || ""),
      afterHash: String(event.afterHash || ""),
      versionBefore: Number(event.versionBefore || 0),
      versionAfter: Number(event.versionAfter || 0),
      correlationId: String(event.correlationId || "").toUpperCase()
    });
    if (settingsAuditState.appendThrowsAfterCommit) {
      throw new Error("simulated audit response loss");
    }
  },
  SpreadsheetApp: {
    flush() {},
    openById(id) { return { getId: () => id }; }
  },
  RENEWAL_ARTIFACT_REGISTRY_HEADERS: [
    "作成日時", "recordId", "種別", "payloadHash", "version", "状態",
    "fileId", "URL", "ファイル名", "保存先folderId", "実行者",
    "採番情報", "メッセージ", "metadataJson", "schemaVersion"
  ]
};
vm.createContext(context);
vm.runInContext(pureNames.map(extractFunction).join("\n") +
  "\nthis.logic={" + pureNames.join(",") + "};", context);
const logic = context.logic;
const directCreated = logic.artifactCreateSpreadsheetInFolder_(
  "直接作成テスト",
  { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
  "直接作成テスト",
  "owner@example.com",
  false
);
assert.equal(directCreated.file.getId(), "direct-spreadsheet-id");
assert.equal(directCreated.spreadsheet.getId(), "direct-spreadsheet-id");
assert.equal(directCreateState.calls.length, 1);
assert.equal(directCreateState.calls[0].metadata.parents[0],
  context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID);
assert.equal(directCreateState.calls[0].metadata.mimeType,
  "application/vnd.google-apps.spreadsheet");
assert.equal(directCreateState.calls[0].mediaData, null);
assert.equal(directCreateState.calls[0].options.supportsAllDrives, true);
assert.equal(directCreateState.calls[0].options.ignoreDefaultVisibility, true);
const directSpreadsheetOperation = logic.artifactDriveAttemptOperation_(
  "CREATE",
  "",
  directCreateState.calls[0].metadata.name,
  "application/vnd.google-apps.spreadsheet",
  context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
);
const directSpreadsheetAttemptKey =
  logic.artifactDriveAttemptKey_(directSpreadsheetOperation);
assert.equal(
  JSON.parse(cleanupAuditProperties[directSpreadsheetAttemptKey]).state,
  "CREATED_VERIFIED",
  "Drive作成済みIDは上位の台帳・propertyへ公開されるまで保持する"
);
assert.throws(
  () => logic.artifactAssertNoUnresolvedDriveAttempt_(
    directSpreadsheetAttemptKey,
    "未公開スプレッドシート"
  ),
  (error) => error.artifactRegistryOutcomeUncertain === true
);
logic.artifactClearPublishedDriveAttempt_(
  directSpreadsheetOperation,
  directCreated.file.getId(),
  "公開済みスプレッドシート"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    cleanupAuditProperties,
    directSpreadsheetAttemptKey
  ),
  false
);
directCreateState.responseOverride = (response) =>
  Object.assign({}, response, { parents: ["wrong-parent"] });
assert.throws(() => logic.artifactCreateSpreadsheetInFolder_(
  "異常応答テスト",
  { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
  "異常応答テスト",
  "owner@example.com",
  false
), /指定フォルダ直下/);
assert(directCreateState.removedIds.includes("direct-spreadsheet-id"),
  "作成応答の親フォルダが不正な場合は既知IDの途中ファイルを完全削除します");
directCreateState.responseOverride = null;
const directBlob = { name: "blob-test.csv", contentType: "text/csv" };
const directBlobFile = logic.artifactCreateDriveItemInFolder_(
  "CDP_PREPARED_dipsCsv_test_v1",
  "text/csv",
  { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
  "CSV直接作成テスト",
  "owner@example.com",
  false,
  null
);
logic.artifactUpdateBlobFileContent_(
  directBlobFile,
  "blob-test.csv",
  "text/csv",
  directBlob,
  { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
  "CSV内容更新テスト"
);
assert.equal(directBlobFile.getId(), "direct-spreadsheet-id");
assert.equal(directCreateState.updates.length, 1);
assert.equal(directCreateState.updates[0].mediaData, directBlob);
assert.equal(directCreateState.updates[0].options.supportsAllDrives, true);
const anonymousPayloadHash = "a".repeat(64);
const anonymousPreparedName = logic.artifactPreparedOutputFileName_(
  "record-private-1", "certificate", anonymousPayloadHash, 1
);
assert(anonymousPreparedName.startsWith("CDP_PREPARED_certificate_"));
assert.equal(anonymousPreparedName.includes("個人名テスト"), false,
  "ACL確定前の準備名に対象者名を含めてはいけません");
const preparedOutputFile = mockDriveItem(
  "prepared-output-id",
  [context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID]
);
logic.artifactPrepareNewOutputFile_(preparedOutputFile, {
  record: { recordId: "record-private-1", targetName: "個人名テスト" },
  kind: "certificate",
  payloadHash: anonymousPayloadHash,
  version: 1,
  targetFolder: { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
  settings: { allowedOutputEmails: "owner@example.com" }
}, "匿名準備名テスト");
assert(preparedOutputFile.getName().includes("個人名テスト"),
  "ACL検査とPREPARED identity設定の後に正式名へ変更する必要があります");
assert.equal(
  preparedOutputFile.getDescription(),
  logic.artifactPreparedOutputIdentity_("record-private-1", "certificate", anonymousPayloadHash, 1)
);
directCreateState.createThrowsAfterCommit = true;
assert.throws(
  () => logic.artifactCreateDriveItemInFolder_(
    "CDP_PREPARED_response_loss_v1",
    "text/csv",
    { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
    "response loss create",
    "owner@example.com",
    false,
    null
  ),
  (error) => error.artifactRegistryOutcomeUncertain === true,
  "作成コミット後に応答を失った場合はPREPAREDを維持する必要があります"
);
directCreateState.createThrowsAfterCommit = false;
const createCallsAfterResponseLoss = directCreateState.calls.length;
assert.throws(
  () => logic.artifactCreateDriveItemInFolder_(
    "CDP_PREPARED_response_loss_v1",
    "text/csv",
    { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
    "response loss create",
    "owner@example.com",
    false,
    null
  ),
  (error) => error.artifactRegistryOutcomeUncertain === true,
  "応答不明のDrive作成は一覧反映が遅れても同じ要求を再送してはいけません"
);
assert.equal(directCreateState.calls.length, createCallsAfterResponseLoss,
  "未解決のDrive作成試行がある間はDrive APIを再呼出ししてはいけません");
directCreateState.lookupThrowIds = ["direct-spreadsheet-id"];
assert.throws(
  () => logic.artifactCreateDriveItemInFolder_(
    "CDP_PREPARED_lookup_failure_v1",
    "text/csv",
    { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
    "lookup failure create",
    "owner@example.com",
    false,
    null
  ),
  (error) => {
    assert.equal(error.artifactRegistryOutcomeUncertain, true);
    assert.equal(error.artifactProvisional.fileId, "direct-spreadsheet-id");
    assert.equal(error.artifactProvisional.cleanupFailed, true);
    return true;
  },
  "作成済みIDをDriveAppで取得できない場合はIDを監査記録しPREPAREDを維持します"
);
directCreateState.lookupThrowIds = [];
const directCopiedFile = logic.artifactCopyFileInFolder_(
  "source-document-id",
  "安全コピー",
  "application/vnd.google-apps.document",
  { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
  "コピー直接作成テスト",
  "owner@example.com",
  false
);
assert.equal(directCopiedFile.getId(), "direct-copy-id");
assert.equal(directCreateState.copies.length, 1);
assert.equal(directCreateState.copies[0].options.ignoreDefaultVisibility, true);
directCreateState.copyThrowsAfterCommit = true;
assert.throws(
  () => logic.artifactCopyFileInFolder_(
    "source-document-id",
    "CDP_PREPARED_copy_response_loss_v1",
    "application/vnd.google-apps.document",
    { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
    "response loss copy",
    "owner@example.com",
    false
  ),
  (error) => error.artifactRegistryOutcomeUncertain === true,
  "コピーコミット後に応答を失った場合はPREPAREDを維持する必要があります"
);
directCreateState.copyThrowsAfterCommit = false;
const copyCallsAfterResponseLoss = directCreateState.copies.length;
assert.throws(
  () => logic.artifactCopyFileInFolder_(
    "source-document-id",
    "CDP_PREPARED_copy_response_loss_v1",
    "application/vnd.google-apps.document",
    { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
    "response loss copy",
    "owner@example.com",
    false
  ),
  (error) => error.artifactRegistryOutcomeUncertain === true,
  "応答不明のDriveコピーは一覧反映が遅れても同じ要求を再送してはいけません"
);
assert.equal(directCreateState.copies.length, copyCallsAfterResponseLoss,
  "未解決のDriveコピー試行がある間はDrive APIを再呼出ししてはいけません");
directCreateState.lookupThrowIds = ["direct-copy-id"];
assert.throws(
  () => logic.artifactCopyFileInFolder_(
    "source-document-id",
    "CDP_PREPARED_copy_lookup_failure_v1",
    "application/vnd.google-apps.document",
    { getId: () => context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID },
    "lookup failure copy",
    "owner@example.com",
    false
  ),
  (error) => {
    assert.equal(error.artifactRegistryOutcomeUncertain, true);
    assert.equal(error.artifactProvisional.fileId, "direct-copy-id");
    assert.equal(error.artifactProvisional.cleanupFailed, true);
    return true;
  },
  "コピー済みIDをDriveAppで取得できない場合はIDを監査記録しPREPAREDを維持します"
);
directCreateState.lookupThrowIds = [];
const lookupFailureAuditKeys = Object.keys(cleanupAuditProperties)
  .filter((key) => key.startsWith("RENEWAL_ARTIFACT_CLEANUP_FAILURE_"));
assert(lookupFailureAuditKeys.length >= 2,
  "DriveApp取得不能となった作成・コピーの既知IDをcleanup監査へ残す必要があります");
assert.throws(
  () => logic.artifactAssertNoUnresolvedCleanupFailures_(),
  /新しい成果物・原本を作成しません/,
  "完全削除失敗が1件でも残る間は別versionを含む全成果物作成を停止する必要があります"
);
lookupFailureAuditKeys.forEach((key) => delete cleanupAuditProperties[key]);
assert.equal(logic.artifactAssertNoUnresolvedCleanupFailures_(), true);
const artifactSettingsKey = context.RENEWAL_ARTIFACT.SETTINGS_KEY;
delete cleanupAuditProperties[artifactSettingsKey];
assert.equal(logic.artifactLoadSettings_().outputFolderId,
  context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID,
  "未設定時だけ固定保存先を既定値として使用します");
cleanupAuditProperties[artifactSettingsKey] = "{broken";
assert.throws(() => logic.artifactLoadSettings_(), /設定JSONが破損/);
cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({ outputFolderId: "not a folder" });
assert.throws(() => logic.artifactLoadSettings_(), /フォルダIDが不正/);
[
  ["templateFolderId", "専用原本フォルダID"],
  ["ledgerTemplateId", "発行台帳専用原本ID"],
  ["certificateTemplateId", "修了証明書専用原本ID"]
].forEach(([field, label]) => {
  cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({ [field]: "not a valid id" });
  assert.throws(() => logic.artifactLoadSettings_(), new RegExp(label + "が不正"));
});
cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({ outputFolderId: "legacy-output" });
const legacyInternalSettings = logic.artifactLoadSettings_();
assert.equal(legacyInternalSettings.outputFolderId, "legacy-output",
  "有効な旧保存先IDは内部で保持し、黙って固定先へ切り替えません");
assert.equal(logic.artifactPublicSettings_(legacyInternalSettings).outputFolderMigrationRequired, true);
cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({ outputFolderId: "" });
assert.equal(logic.artifactLoadSettings_().outputFolderId,
  context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID);
delete cleanupAuditProperties[artifactSettingsKey];
directCreateState.listedFiles = [];
directCreateState.listNextPageToken = "";
assert.doesNotThrow(() => logic.artifactAssertLegacyOutputFolderSwitchSafe_("legacy-output"));
cleanupAuditProperties["RENEWAL_ARTIFACT_AUTO_ROOT_legacy-output"] = "legacy-auto-root";
assert.throws(() => logic.artifactAssertLegacyOutputFolderSwitchSafe_("legacy-output"), /登録履歴/);
delete cleanupAuditProperties["RENEWAL_ARTIFACT_AUTO_ROOT_legacy-output"];
cleanupAuditProperties.RENEWAL_ARTIFACT_CLEANUP_FAILURE_test = JSON.stringify({ fileId: "failed-file" });
assert.throws(() => logic.artifactAssertLegacyOutputFolderSwitchSafe_("legacy-output"), /削除失敗記録/);
delete cleanupAuditProperties.RENEWAL_ARTIFACT_CLEANUP_FAILURE_test;
directCreateState.listedFiles = [{ id: "legacy-child", name: "旧成果物", mimeType: "text/csv", trashed: false }];
assert.throws(() => logic.artifactAssertLegacyOutputFolderSwitchSafe_("legacy-output"), /残っています/);
directCreateState.listedFiles = [];

const artifactSettingsStateKey = context.RENEWAL_ARTIFACT.SETTINGS_STATE_KEY;
const artifactBankKey = context.RENEWAL_ARTIFACT.BANK_KEY;
delete cleanupAuditProperties[artifactSettingsStateKey];
cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({
  outputFolderId: context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
});
cleanupAuditProperties[artifactBankKey] = "移行前の旧平文振込先";
settingsPropertyState.legacyDeleteModeByKey = {
  [artifactBankKey]: "after"
};
settingsPropertyState.deleteCalls.length = 0;
settingsAuditRows.length = 0;
const initialSettingsV2 = logic.artifactLoadSettings_();
assert.equal(initialSettingsV2._settingsVersion, 0);
settingsAuditState.appendThrowsAfterCommit = true;
const firstSettingsCommit = logic.artifactCommitSettingsState_(
  initialSettingsV2,
  "テスト銀行 本店 普通 1234567",
  {
    actor: "owner@example.com",
    expectedVersion: 0,
    idempotencyKey: "artifact-settings-first-0001",
    reasonCode: "ARTIFACT_SETTINGS_UPDATE"
  }
);
settingsAuditState.appendThrowsAfterCommit = false;
assert.equal(firstSettingsCommit.version, 1);
assert.equal(firstSettingsCommit.auditRecoveryRequired, false);
assert.equal(firstSettingsCommit.cleanupRequired, false,
  "旧振込先削除後の応答喪失は、読戻しで不存在なら清掃完了として扱う必要があります");
assert.equal(firstSettingsCommit.recoveryRequired, false);
assert.equal(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactSettingsKey), false,
  "V2確定後は旧SETTINGS_KEYを削除する必要があります");
assert.equal(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactBankKey), false,
  "V2確定後は旧平文BANK_KEYを削除する必要があります");
assert(settingsPropertyState.deleteCalls.includes(artifactSettingsKey));
assert(settingsPropertyState.deleteCalls.includes(artifactBankKey));
settingsPropertyState.legacyDeleteModeByKey = {};
assert.equal(settingsAuditRows.length, 1,
  "V2設定確定後は共有正本のCOMMITTED監査行を1件だけ残す必要があります");
assert.equal(JSON.stringify(settingsAuditRows[0]).includes("テスト銀行"), false,
  "サーバー監査行へ振込先本文を保存してはいけません");
assert(cleanupAuditProperties[artifactSettingsStateKey],
  "設定と振込先は単一V2 propertyへ保存する必要があります");
assert.equal(logic.artifactLoadSettings_()._bankAccountText, "テスト銀行 本店 普通 1234567");
assert.equal(logic.artifactLoadSettings_()._settingsVersion, 1);
assert.equal(
  JSON.stringify(logic.artifactPublicSettings_(logic.artifactLoadSettings_()))
    .includes("テスト銀行"),
  false,
  "public settingsへ振込先本文を返してはいけません"
);
const getArtifactSettingsApiBlock = extractFunction("apiGetArtifactSettings");
assert(getArtifactSettingsApiBlock.includes("cleanupRequired"),
  "設定取得APIは旧設定清掃の要否を本文なしで返す必要があります");

const responseLossSettings = logic.artifactLoadSettings_();
responseLossSettings.issuerPhone = "011-111-2222";
settingsPropertyState.throwAfterWrite = true;
const responseLossCommit = logic.artifactCommitSettingsState_(
  responseLossSettings,
  responseLossSettings._bankAccountText,
  {
    actor: "owner@example.com",
    expectedVersion: 1,
    idempotencyKey: "artifact-settings-response-loss-0001",
    reasonCode: "ARTIFACT_SETTINGS_UPDATE"
  }
);
settingsPropertyState.throwAfterWrite = false;
assert.equal(responseLossCommit.version, 2,
  "property確定後の応答喪失は読戻し一致で成功扱いにする必要があります");
const responseLossRetry = logic.artifactCommitSettingsState_(
  logic.artifactLoadSettings_(),
  logic.artifactLoadSettings_()._bankAccountText,
  {
    actor: "owner@example.com",
    expectedVersion: 1,
    idempotencyKey: "artifact-settings-response-loss-0001",
    reasonCode: "ARTIFACT_SETTINGS_UPDATE"
  }
);
assert.equal(responseLossRetry.version, 2,
  "同じidempotencyKey・同じ内容の再送で版を増やしてはいけません");
const reusedKeySettings = logic.artifactLoadSettings_();
reusedKeySettings.issuerFax = "011-999-9999";
assert.throws(
  () => logic.artifactCommitSettingsState_(
    reusedKeySettings,
    reusedKeySettings._bankAccountText,
    {
      actor: "owner@example.com",
      expectedVersion: 2,
      idempotencyKey: "artifact-settings-response-loss-0001",
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    }
  ),
  /異なる成果物設定/
);
const staleSettings = logic.artifactLoadSettings_();
staleSettings.issuerEmail = "changed@example.com";
assert.throws(
  () => logic.artifactCommitSettingsState_(
    staleSettings,
    staleSettings._bankAccountText,
    {
      actor: "owner@example.com",
      expectedVersion: 1,
      idempotencyKey: "artifact-settings-stale-0001",
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    }
  ),
  /別の担当者により更新/
);
settingsPropertyState.throwBeforeWrite = true;
const beforeWriteFailureSettings = logic.artifactLoadSettings_();
beforeWriteFailureSettings.issuerEmail = "write-failure@example.com";
assert.throws(
  () => logic.artifactCommitSettingsState_(
    beforeWriteFailureSettings,
    beforeWriteFailureSettings._bankAccountText,
    {
      actor: "owner@example.com",
      expectedVersion: 2,
      idempotencyKey: "artifact-settings-write-failure-0001",
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    }
  ),
  (error) => error.artifactSettingsOutcomeUncertain === true
);
settingsPropertyState.throwBeforeWrite = false;
assert.equal(logic.artifactLoadSettings_()._settingsVersion, 2);

const validV2State = cleanupAuditProperties[artifactSettingsStateKey];
cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({ issuerCompany: "旧設定へ戻ってはいけない" });
cleanupAuditProperties[artifactBankKey] = "破損V2検査用の旧平文振込先";
settingsPropertyState.deleteCalls.length = 0;
cleanupAuditProperties[artifactSettingsStateKey] = "{broken";
assert.throws(() => logic.artifactLoadSettings_(), /設定V2が破損/,
  "V2が存在する場合は破損していてもV1へfallbackしてはいけません");
assert.equal(settingsPropertyState.deleteCalls.length, 0,
  "V2が破損して検証できない場合は旧設定を削除してはいけません");
assert(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactSettingsKey));
assert(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactBankKey));
cleanupAuditProperties[artifactSettingsStateKey] = validV2State;
delete cleanupAuditProperties[artifactSettingsKey];
delete cleanupAuditProperties[artifactBankKey];

delete cleanupAuditProperties[artifactSettingsStateKey];
cleanupAuditProperties[artifactSettingsKey] = JSON.stringify({ outputFolderId: "legacy-output" });
cleanupAuditProperties[artifactBankKey] = "旧振込先";
settingsPropertyState.legacyDeleteModeByKey = {
  [artifactBankKey]: "before"
};
const legacySwitchSettings = logic.artifactLoadSettings_();
legacySwitchSettings.outputFolderId = context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID;
const legacySwitchCommit = logic.artifactCommitSettingsState_(
  legacySwitchSettings,
  legacySwitchSettings._bankAccountText,
  {
    actor: "owner@example.com",
    expectedVersion: 0,
    idempotencyKey: "artifact-settings-legacy-switch-0001",
    reasonCode: "ARTIFACT_SETTINGS_UPDATE"
  }
);
assert.equal(legacySwitchCommit.legacyOutputFolders[0].folderId, "legacy-output",
  "固定先へ切替後も監査済み旧保存先IDをV2履歴に残す必要があります");
assert.equal(legacySwitchCommit.cleanupRequired, true,
  "V2確定後に旧平文振込先が残った場合も、確定済みV2自体は成功として返す必要があります");
assert.equal(legacySwitchCommit.recoveryRequired, true);
assert(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactBankKey));
assert.equal(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactSettingsKey), false);
const residualCleanupPublic = logic.artifactPublicSettings_(
  logic.artifactSettingsFromState_(legacySwitchCommit)
);
assert.equal(residualCleanupPublic.cleanupRequired, true);
assert.equal(JSON.stringify(residualCleanupPublic).includes("旧振込先"), false,
  "cleanup警告を含むpublic settingsにも振込先本文を返してはいけません");
const blockedCleanupSettings = logic.artifactLoadSettings_();
blockedCleanupSettings.issuerPhone = "011-555-0000";
assert.throws(
  () => logic.artifactCommitSettingsState_(
    blockedCleanupSettings,
    blockedCleanupSettings._bankAccountText,
    {
      actor: "owner@example.com",
      expectedVersion: 1,
      idempotencyKey: "artifact-settings-cleanup-block-0001",
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    }
  ),
  /旧平文振込先を清掃できないため/
);
assert.equal(JSON.parse(cleanupAuditProperties[artifactSettingsStateKey]).version, 1,
  "旧設定清掃が未解決の間は次版を書き込んではいけません");
settingsPropertyState.legacyDeleteModeByKey = {};
const recoveredCleanupSettings = logic.artifactLoadSettings_();
assert.equal(recoveredCleanupSettings._legacySettingsCleanupRequired, false,
  "次回読込で旧キーの再清掃に成功したら更新停止を解除できる必要があります");
assert.equal(Object.prototype.hasOwnProperty.call(cleanupAuditProperties, artifactBankKey), false);
assert.equal(logic.artifactPublicSettings_(recoveredCleanupSettings).legacyOutputFolderCount, 1);
const oversizedSettings = logic.artifactLoadSettings_();
assert.throws(
  () => logic.artifactCommitSettingsState_(
    oversizedSettings,
    "x".repeat(9000),
    {
      actor: "owner@example.com",
      expectedVersion: 1,
      idempotencyKey: "artifact-settings-oversized-0001",
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    }
  ),
  /容量を超える/
);
let rollingSettingsVersion = 1;
for (let settingsRevision = 2; settingsRevision <= 7; settingsRevision++) {
  const rollingSettings = logic.artifactLoadSettings_();
  rollingSettings.issuerPhone = "011-000-" + String(settingsRevision).padStart(4, "0");
  const rollingCommit = logic.artifactCommitSettingsState_(
    rollingSettings,
    rollingSettings._bankAccountText,
    {
      actor: "owner@example.com",
      expectedVersion: rollingSettingsVersion,
      idempotencyKey: "artifact-settings-rolling-" + String(settingsRevision).padStart(4, "0"),
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    }
  );
  rollingSettingsVersion = rollingCommit.version;
}
assert.equal(rollingSettingsVersion, 7);
assert(logic.artifactSettingsUtf8Bytes_(cleanupAuditProperties[artifactSettingsStateKey]) <=
  context.RENEWAL_ARTIFACT.SETTINGS_STATE_MAX_BYTES,
  "通常の複数回設定更新でV2 property容量を超えてはいけません");

let saveApiCurrent = {
  issuerCompany: "株式会社CDP北海道",
  issuerAddress: "札幌市",
  issuerPhone: "011-000-0000",
  issuerFax: "",
  issuerEmail: "owner@example.com",
  invoiceRegistrationNo: "T1234567890123",
  outputFolderId: context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID,
  templateFolderId: "template-folder",
  ledgerTemplateId: "ledger-template",
  certificateTemplateId: "certificate-template",
  allowedOutputEmails: "owner@example.com",
  dipsAdditionalClosedDates: "",
  dipsCalendarConfirmedDate: "2026-07-01",
  dipsCalendarConfirmedBy: "担当者",
  numberingInitialized: false,
  numberingCutoverMonth: "",
  certificateSequenceSeed: "",
  dipsSequenceSeed: "",
  schedules: []
};
const saveApiWrites = [];
const saveApiCommits = [];
let legacySwitchCalls = 0;
let rejectLegacySwitch = false;
const saveApiContext = {
  RENEWAL_ARTIFACT: context.RENEWAL_ARTIFACT,
  artifactRequireCapability_() { return { email: "owner@example.com", role: "admin" }; },
  artifactLoadSettings_: () => JSON.parse(JSON.stringify(saveApiCurrent)),
  artifactAssertLegacySettingsCleanupComplete_() {},
  artifactText_: (value) => String(value == null ? "" : value).trim(),
  artifactExtractDriveId_: (value) => /^[A-Za-z0-9_-]+$/.test(String(value || "")) ? String(value) : "",
  artifactExtractDriveFileId_: (value) => /^[A-Za-z0-9_-]+$/.test(String(value || "")) ? String(value) : "",
  artifactNormalizeAllowedEmails_: (value) => String(value || "").split(/[\s,;]+/).filter(Boolean),
  artifactNormalizeIsoDateList_: (value) => String(value || "").split(/[\s,;]+/).filter(Boolean),
  artifactNormalizeSchedules_: (value) => Array.isArray(value) ? value : [],
  artifactBoolean_: (value) => value === true,
  artifactIsEmail_: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "")),
  artifactAssertNumberingSettings_() {},
  artifactAssertAllowedOutputEmails_() {},
  artifactTodayIso_: () => "2026-07-24",
  artifactValidateDipsCalendarSettings_() {},
  artifactAssertRequiredTemplateSettings_() {},
  artifactAssertLedgerTemplateClean_() {},
  artifactAssertCertificateTemplateClean_() {},
  artifactAssertDedicatedTemplateStorageSafe_() {},
  artifactRequireSafeOutputFolder_() {},
  artifactAssertLegacyOutputFolderSwitchSafe_() {
    legacySwitchCalls++;
    if (rejectLegacySwitch) throw new Error("旧保存先の監査が未完了です");
  },
  artifactCommitSettingsState_(settings, bankAccountText, options) {
    saveApiCommits.push({
      settings: JSON.parse(JSON.stringify(settings)),
      bankAccountText,
      options: JSON.parse(JSON.stringify(options || {}))
    });
    return {
      version: Number(options && options.expectedVersion || 0) + 1,
      settings: JSON.parse(JSON.stringify(settings)),
      bankAccountText
    };
  },
  artifactSettingsFromState_(state) {
    return Object.assign({}, state.settings || {}, {
      _bankAccountText: state.bankAccountText || "",
      _settingsVersion: Number(state.version || 0),
      _legacyOutputFolders: []
    });
  },
  artifactPublicSettings_(settings) {
    return {
      saved: true,
      outputFolderId: settings.outputFolderId,
      settingsVersion: settings._settingsVersion
    };
  },
  artifactFolderUrl_: (id) => id ? "https://drive.google.com/drive/folders/" + id : "",
  artifactErrorMessage_: (error) => String(error && error.message || error),
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock() {} })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      setProperty(key, value) { saveApiWrites.push({ type: "set", key, value }); },
      deleteProperty(key) { saveApiWrites.push({ type: "delete", key }); }
    })
  },
  apiGetArtifactSettings: () => ({ success: true, settings: { saved: true } })
};
vm.createContext(saveApiContext);
vm.runInContext(extractFunction("apiSaveArtifactSettings") + "\nthis.saveArtifactSettings = apiSaveArtifactSettings;", saveApiContext);
assert.equal(saveApiContext.saveArtifactSettings({ outputFolderId: "wrong-folder" }).success, false);
assert.equal(saveApiCommits.length, 0, "固定保存先以外の要求で設定を書き込んではいけません");
saveApiCurrent.outputFolderId = "legacy-output";
rejectLegacySwitch = true;
assert.equal(saveApiContext.saveArtifactSettings({
  outputFolderId: context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
}).success, false);
assert.equal(legacySwitchCalls, 1);
assert.equal(saveApiCommits.length, 0, "旧保存先監査が未完了なら設定を書き込んではいけません");
saveApiCurrent.outputFolderId = context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID;
rejectLegacySwitch = false;
const savedFixedSettings = saveApiContext.saveArtifactSettings({
  outputFolderId: context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
});
assert.equal(savedFixedSettings.success, true);
assert.equal(saveApiCommits.length, 1, "検査合格後の固定保存先設定が単一state commitへ渡されません");
assert.equal(saveApiCommits[0].settings.outputFolderId,
  context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID);

// Public artifact requests are pinned to one canonical revision.  A browser
// payload may be present for transition compatibility, but it can never
// override or differ from the canonical store.
const canonicalHash = "a".repeat(64);
let canonicalRow = {
  recordId: "record-1",
  version: 7,
  payloadHash: canonicalHash,
  deleted: false,
  record: { id: "record-1", targetName: "Canonical Person" }
};
context.storeGetRecord_ = () => JSON.parse(JSON.stringify(canonicalRow));
let canonicalRequest = logic.artifactLoadCanonicalArtifactRequest_({
  recordId: "record-1",
  expectedVersion: 7,
  expectedPayloadHash: canonicalHash,
  kinds: ["certificate"]
});
assert.equal(canonicalRequest.request.record.targetName, "Canonical Person");
assert.equal(canonicalRequest.canonical.version, 7);
const canonicalResult = logic.artifactAttachCanonicalResult_({ success: true }, canonicalRequest.canonical);
assert.equal(canonicalResult.recordVersion, 7);
assert.equal(canonicalResult.recordPayloadHash, canonicalHash);
assert.equal(canonicalResult.canonical.record.targetName, "Canonical Person");
assert.throws(() => logic.artifactLoadCanonicalArtifactRequest_({
  recordId: "record-1",
  expectedVersion: 7,
  expectedPayloadHash: canonicalHash,
  kinds: ["certificate"],
  record: { id: "record-1", targetName: "Tampered Person" }
}), /共有正本と異なる/);
let staleCanonicalError;
try {
  logic.artifactLoadCanonicalArtifactRequest_({
    recordId: "record-1",
    expectedVersion: 6,
    expectedPayloadHash: canonicalHash,
    kinds: ["certificate"]
  });
} catch (error) {
  staleCanonicalError = error;
}
assert.match(staleCanonicalError.message, /更新されています/);
assert.equal(staleCanonicalError.artifactCanonical.version, 7,
  "A stale retry must return the latest canonical revision for a safe rerun.");
assert.throws(() => logic.artifactLoadCanonicalArtifactRequest_({
  recordId: "record-1",
  expectedVersion: 7,
  expectedPayloadHash: "c".repeat(64),
  kinds: ["certificate"]
}), /内容hash/);
canonicalRow.deleted = true;
assert.throws(() => logic.artifactLoadCanonicalArtifactRequest_({
  recordId: "record-1",
  expectedVersion: 7,
  expectedPayloadHash: canonicalHash,
  kinds: ["certificate"]
}), /削除済み/);
canonicalRow.deleted = false;
assert.throws(() => logic.artifactLoadCanonicalArtifactRequest_({
  recordId: "record-1",
  expectedVersion: 7,
  expectedPayloadHash: canonicalHash,
  kinds: ["billing"]
}), /financeInvoiceId/);

const snapshotSettings = {
  issuerCompany: "株式会社CDP北海道",
  issuerAddress: "〒002-8053 北海道札幌市北区篠路町篠路389-72",
  issuerPhone: "011-790-7925",
  issuerFax: "011-790-7935",
  issuerEmail: "billing@example.jp",
  invoiceRegistrationNo: "T9430001086920",
  _bankAccountText: "テスト銀行 本店 普通 1234567 株式会社CDP北海道"
};
context.artifactLoadSettings_ = () => JSON.parse(JSON.stringify(snapshotSettings));
context.storeReadRecords_ = () => [{
  recordId: "record-1",
  deleted: false,
  payload: {
    billingRecipientName: "株式会社受講者",
    billingHonorific: "御中",
    billingAddress: "〒060-0001 北海道札幌市中央区北一条西1丁目"
  }
}];
const serverBillingSnapshot = logic.artifactBuildFormalBillingSnapshotForFinance_("store-sheet", "record-1");
assert.equal(serverBillingSnapshot.recipientName, "株式会社受講者");
assert.equal(serverBillingSnapshot.issuerCompany, snapshotSettings.issuerCompany);
assert.equal(serverBillingSnapshot.bankAccountText, snapshotSettings._bankAccountText);
context.storeReadRecords_ = () => [{
  recordId: "record-1", deleted: false,
  payload: { billingRecipientName: "株式会社受講者", billingHonorific: "御中", billingAddress: "" }
}];
assert.throws(
  () => logic.artifactBuildFormalBillingSnapshotForFinance_("store-sheet", "record-1"),
  /recipientAddress|必須値/
);
context.storeReadRecords_ = () => [{
  recordId: "record-1", deleted: true,
  payload: { billingRecipientName: "株式会社受講者", billingHonorific: "御中", billingAddress: "住所" }
}];
assert.throws(
  () => logic.artifactBuildFormalBillingSnapshotForFinance_("store-sheet", "record-1"),
  /有効レコード/
);

const issuedInvoiceState = {
  invoices: [{
    id: "fin-inv-1",
    invoiceNo: "INV-FORMAL-0001",
    customerId: "record-1",
    status: "ISSUED",
    immutableKey: "sealed-invoice-key",
    pricingMode: "EXCLUSIVE",
    taxRounding: "FLOOR",
    invoiceDate: "2026-07-15",
    accountingDate: "2026-07-14",
    dueDate: "2026-07-31",
    subject: "更新講習",
    billingSnapshot: {
      recipientName: "発行時点の株式会社受講者",
      recipientHonorific: "御中",
      recipientAddress: "〒060-0001 北海道札幌市中央区北一条西1丁目",
      issuerCompany: "発行時点の株式会社CDP北海道",
      issuerAddress: "〒002-8053 北海道札幌市北区篠路町篠路389-72",
      issuerPhone: "011-790-7925",
      issuerFax: "011-790-7935",
      issuerEmail: "billing@example.jp",
      invoiceRegistrationNo: "T9430001086920",
      bankAccountText: "テスト銀行 本店 普通 1234567 株式会社CDP北海道"
    },
    totalExTax: 9000,
    totalTax: 900,
    totalInclTax: 9900,
    taxGroups: [{
      taxCategory: "TAXABLE_10",
      rateBps: 1000,
      baseExTax: 9000,
      tax: 900,
      totalInclTax: 9900
    }]
  }],
  invoice_lines: [{
    id: "line-charge",
    invoiceId: "fin-inv-1",
    description: "更新講習料",
    quantity: 1,
    unitAmount: 10000,
    amount: 10000,
    lineType: "CHARGE",
    taxCategory: "TAXABLE_10"
  }, {
    id: "line-discount",
    invoiceId: "fin-inv-1",
    description: "値引",
    quantity: 1,
    unitAmount: 1000,
    amount: -1000,
    lineType: "DISCOUNT",
    taxCategory: "TAXABLE_10"
  }]
};
const selectedInvoice = logic.artifactSelectFormalInvoiceForArtifact_(
  issuedInvoiceState, "fin-inv-1", "record-1", "finance-state-hash"
);
assert.equal(selectedInvoice.status, "ISSUED");
assert.equal(selectedInvoice.totalInclTax, 9900);
assert.equal(selectedInvoice.effectiveBilled, 9900);
const formalRecord = {
  id: "record-1",
  targetName: "Canonical Person",
  feeExTax: 1,
  discountExTax: 0,
  invoiceNo: "LEGACY-UNTRUSTED"
};
logic.artifactApplyFormalInvoiceToRecord_(formalRecord, selectedInvoice);
assert.equal(formalRecord.invoiceNo, "INV-FORMAL-0001");
assert.equal(formalRecord.invoiceStatus, "発行済");
assert.equal(formalRecord.feeExTax, 10000);
assert.equal(formalRecord.discountExTax, 1000);
assert.equal(formalRecord.formalBillingTotalTax, 900);
assert.equal(formalRecord.formalBillingSnapshot.recipientName, "発行時点の株式会社受講者");
const formalRecordUpdates = logic.artifactFormalInvoiceRecordUpdates_(formalRecord);
assert.equal(formalRecordUpdates.invoiceNo, "INV-FORMAL-0001");
assert.equal(Object.prototype.hasOwnProperty.call(formalRecordUpdates, "serviceCategory"), false);
assert.equal(Object.prototype.hasOwnProperty.call(formalRecordUpdates, "billingRecipientName"), false);
assert.equal(Object.prototype.hasOwnProperty.call(formalRecordUpdates, "formalBillingSnapshot"), false);

const formalSettingsAtIssue = {
  issuerCompany: "現在設定の発行者",
  issuerAddress: "現在設定の住所",
  issuerPhone: "000-0000-0000",
  issuerFax: "",
  issuerEmail: "current@example.jp",
  invoiceRegistrationNo: "T1111111111111",
  _bankAccountText: "現在設定の振込先",
  outputFolderId: "folder",
  allowedOutputEmails: "owner@example.com"
};
const renderInputsAtIssue = logic.artifactBillingRenderInputs_(formalRecord, formalSettingsAtIssue);
assert.equal(renderInputsAtIssue.recipientName, "発行時点の株式会社受講者");
assert.equal(renderInputsAtIssue.issuerCompany, "発行時点の株式会社CDP北海道");
assert.match(renderInputsAtIssue.bankAccountText, /テスト銀行/);
const formalPayloadHashBefore = logic.artifactHashHex_({
  record: logic.artifactRecordForHash_("billing", formalRecord),
  settings: logic.artifactSettingsForHash_(
    "billing", formalSettingsAtIssue, context.RENEWAL_JAPAN_HOLIDAYS, formalRecord
  )
});
const formalIdentityRecord = logic.artifactRecordForHash_(
  "billing", formalRecord
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    formalIdentityRecord, "_formalFinanceStateHash"
  ),
  false,
  "会計全体stateHashは正式請求成果物の同一性へ含めない"
);
assert.equal(
  formalIdentityRecord.financeInvoiceImmutableKey,
  "sealed-invoice-key"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(formalIdentityRecord.formalBillingSnapshot)),
  issuedInvoiceState.invoices[0].billingSnapshot,
  "正式請求成果物の同一性には発行時封印snapshotを含める"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(formalIdentityRecord.formalBillingLines)),
  JSON.parse(JSON.stringify(selectedInvoice.lines)),
  "正式請求成果物の同一性には発行済請求明細を含める"
);
const formalMetadataBeforeUnrelatedFinanceEvent =
  logic.artifactFormalInvoiceMetadata_(formalRecord);
formalRecord._formalFinanceStateHash =
  "finance-state-hash-after-unrelated-receipt";
const formalPayloadHashAfterUnrelatedFinanceEvent = logic.artifactHashHex_({
  record: logic.artifactRecordForHash_("billing", formalRecord),
  settings: logic.artifactSettingsForHash_(
    "billing", formalSettingsAtIssue,
    context.RENEWAL_JAPAN_HOLIDAYS, formalRecord
  )
});
const formalMetadataAfterUnrelatedFinanceEvent =
  logic.artifactFormalInvoiceMetadata_(formalRecord);
assert.equal(
  formalPayloadHashAfterUnrelatedFinanceEvent,
  formalPayloadHashBefore,
  "無関係な入金・仕訳等で会計全体stateHashが変わっても正式請求成果物のpayloadHashを変えてはいけない"
);
assert.notEqual(
  formalMetadataAfterUnrelatedFinanceEvent.financeStateHash,
  formalMetadataBeforeUnrelatedFinanceEvent.financeStateHash,
  "会計全体stateHashは同一性ではなく作成時監査metadataとして保持する"
);
const unchangedIdentityRegistryRows = [{
  recordId: "record-1",
  kind: "billing",
  hash: formalPayloadHashBefore,
  version: 1,
  status: "created",
  fileId: "formal-billing-v1"
}];
assert.equal(
  logic.artifactFindExisting_(
    unchangedIdentityRegistryRows,
    "record-1",
    "billing",
    formalPayloadHashAfterUnrelatedFinanceEvent
  ).version,
  1,
  "無関係会計イベント後も作成済み版を再利用し、重複versionを作らない"
);
formalRecord.targetName = "発行後に変更された対象者";
formalRecord.billingRecipientName = "発行後に変更された請求先";
formalRecord.billingHonorific = "様";
formalRecord.billingAddress = "発行後に変更された住所";
formalRecord.serviceCategory = "発行後に変更された件名";
const settingsAfterIssue = {
  ...formalSettingsAtIssue,
  issuerCompany: "発行後に変更された発行者",
  issuerAddress: "発行後に変更された発行者住所",
  issuerPhone: "999-9999-9999",
  _bankAccountText: "発行後に変更された振込先"
};
assert.deepEqual(
  JSON.parse(JSON.stringify(logic.artifactBillingRenderInputs_(formalRecord, settingsAfterIssue))),
  JSON.parse(JSON.stringify(renderInputsAtIssue))
);
const formalPayloadHashAfter = logic.artifactHashHex_({
  record: logic.artifactRecordForHash_("billing", formalRecord),
  settings: logic.artifactSettingsForHash_(
    "billing", settingsAfterIssue, context.RENEWAL_JAPAN_HOLIDAYS, formalRecord
  )
});
assert.equal(formalPayloadHashAfter, formalPayloadHashBefore,
  "発行後の対象者・会社設定変更で正式帳票の入力hashを変えてはいけません");

const fullyCancelledInvoiceState = JSON.parse(
  JSON.stringify(issuedInvoiceState)
);
fullyCancelledInvoiceState.credit_notes = [{
  id: "credit-full-cancellation",
  invoiceId: "fin-inv-1",
  effect: "BILLING_REDUCTION",
  direction: -1,
  totalInclTax: 9900
}];
const selectedFullyCancelledInvoice =
  logic.artifactSelectFormalInvoiceForArtifact_(
    fullyCancelledInvoiceState,
    "fin-inv-1",
    "record-1",
    "finance-state-after-full-cancellation"
  );
assert.equal(
  selectedFullyCancelledInvoice.status,
  "ISSUED",
  "取消は発行済請求を上書きせず追記される"
);
assert.equal(selectedFullyCancelledInvoice.effectiveBilled, 0);
const fullyCancelledRecord = {
  id: "record-1",
  recordId: "record-1",
  targetName: "Canonical Person"
};
logic.artifactApplyFormalInvoiceToRecord_(
  fullyCancelledRecord, selectedFullyCancelledInvoice
);
assert.throws(
  () => logic.artifactAssertFormalInvoiceNewGenerationAllowed_(
    fullyCancelledRecord
  ),
  /全額取消済み.*新規生成できません/,
  "全額取消後のISSUED請求から通常請求書を新規生成してはいけない"
);
const existingCancelledHistory = [{
  recordId: "record-1",
  kind: "billing",
  hash: formalPayloadHashBefore,
  version: 1,
  status: "created",
  fileId: "formal-billing-history-v1"
}];
assert.equal(
  logic.artifactFindExisting_(
    existingCancelledHistory,
    "record-1",
    "billing",
    formalPayloadHashBefore
  ).fileId,
  "formal-billing-history-v1",
  "全額取消後も作成済み成果物の履歴参照を失わせてはいけない"
);
assert.deepEqual(
  existingCancelledHistory,
  [{
    recordId: "record-1",
    kind: "billing",
    hash: formalPayloadHashBefore,
    version: 1,
    status: "created",
    fileId: "formal-billing-history-v1"
  }],
  "取消判定は既存レジストリ履歴を変更しない"
);
const restoredInvoiceState = JSON.parse(
  JSON.stringify(fullyCancelledInvoiceState)
);
restoredInvoiceState.credit_notes.push({
  id: "credit-full-cancellation-reversal",
  invoiceId: "fin-inv-1",
  effect: "BILLING_REDUCTION",
  direction: 1,
  totalInclTax: 9900
});
const restoredFormalInvoice = logic.artifactSelectFormalInvoiceForArtifact_(
  restoredInvoiceState,
  "fin-inv-1",
  "record-1",
  "finance-state-after-cancellation-reversal"
);
const restoredFormalRecord = {};
logic.artifactApplyFormalInvoiceToRecord_(
  restoredFormalRecord, restoredFormalInvoice
);
assert.equal(restoredFormalInvoice.effectiveBilled, 9900);
assert.equal(
  logic.artifactAssertFormalInvoiceNewGenerationAllowed_(
    restoredFormalRecord
  ),
  true,
  "取消の正当な反対取引で有効請求額が復元した場合は通常判定へ戻る"
);

const draftState = JSON.parse(JSON.stringify(issuedInvoiceState));
draftState.invoices[0].status = "DRAFT";
assert.throws(() => logic.artifactSelectFormalInvoiceForArtifact_(
  draftState, "fin-inv-1", "record-1", "hash"
), /下書き請求/);
assert.throws(() => logic.artifactSelectFormalInvoiceForArtifact_(
  issuedInvoiceState, "fin-inv-1", "record-other", "hash"
), /対象者ID/);
const missingSnapshotState = JSON.parse(JSON.stringify(issuedInvoiceState));
delete missingSnapshotState.invoices[0].billingSnapshot;
assert.throws(() => logic.artifactSelectFormalInvoiceForArtifact_(
  missingSnapshotState, "fin-inv-1", "record-1", "hash"
), /スナップショット/);
const multiTaxState = JSON.parse(JSON.stringify(issuedInvoiceState));
multiTaxState.invoices[0].taxGroups.push({
  taxCategory: "TAXABLE_8", rateBps: 800, baseExTax: 0, tax: 0, totalInclTax: 0
});
assert.throws(() => logic.artifactSelectFormalInvoiceForArtifact_(
  multiTaxState, "fin-inv-1", "record-1", "hash"
), /複数税率/);
const inclusiveState = JSON.parse(JSON.stringify(issuedInvoiceState));
inclusiveState.invoices[0].pricingMode = "INCLUSIVE";
assert.throws(() => logic.artifactSelectFormalInvoiceForArtifact_(
  inclusiveState, "fin-inv-1", "record-1", "hash"
), /税込単価/);
const tooManyLinesState = JSON.parse(JSON.stringify(issuedInvoiceState));
tooManyLinesState.invoice_lines = Array.from({ length: 11 }, (_, index) => ({
  id: "line-" + index,
  invoiceId: "fin-inv-1",
  description: "明細",
  quantity: 1,
  unitAmount: index === 0 ? 9000 : 0,
  amount: index === 0 ? 9000 : 0,
  lineType: "CHARGE",
  taxCategory: "TAXABLE_10"
}));
assert.throws(() => logic.artifactSelectFormalInvoiceForArtifact_(
  tooManyLinesState, "fin-inv-1", "record-1", "hash"
), /10行を超え/);
context.financeStoreGetState_ = () => ({ configured: false });
assert.throws(() => logic.artifactLoadFormalInvoiceForArtifact_("fin-inv-1", "record-1"), /未設定/);
context.financeStoreGetState_ = () => ({
  configured: true,
  state: issuedInvoiceState,
  stateHash: "finance-state-hash",
  recoveryNeeded: true
});
assert.throws(() => logic.artifactLoadFormalInvoiceForArtifact_("fin-inv-1", "record-1"), /復旧待ち/);
context.financeStoreGetState_ = () => ({
  configured: true,
  state: issuedInvoiceState,
  stateHash: "finance-state-hash"
});

// A derived number is committed to the canonical store before generation.
// If generation then fails, a retry sees the same number and does not consume
// or allocate another one.
let reservationWrites = 0;
context.storeUpsertRecordUnlocked_ = (spreadsheet, actor, role, input) => {
  reservationWrites += 1;
  assert.equal(spreadsheet, "store-sheet");
  assert.equal(actor, "operator@example.com");
  assert.equal(role, "renewal");
  assert.equal(input.expectedVersion, 7);
  return {
    recordId: input.recordId,
    version: 8,
    payloadHash: "b".repeat(64),
    deleted: false,
    record: JSON.parse(JSON.stringify(input.record))
  };
};
const reserved = logic.artifactPersistCanonicalReservationsUnlocked_(
  "store-sheet", "operator@example.com", "renewal", canonicalRow,
  { certificateNo: "UC015726070001", certificateExpiry: "2026-10-14" }
);
assert.equal(reserved.record.certificateNo, "UC015726070001");
assert.equal(reservationWrites, 1);
// Simulated Drive failure: no canonical rollback is performed.
const retriedReservation = logic.artifactPersistCanonicalReservationsUnlocked_(
  "store-sheet", "operator@example.com", "renewal", reserved,
  { certificateNo: "UC015726070001", certificateExpiry: "2026-10-14" }
);
assert.equal(retriedReservation.version, 8);
assert.equal(retriedReservation.record.certificateNo, "UC015726070001");
assert.equal(reservationWrites, 1);
canonicalRow = JSON.parse(JSON.stringify(reserved));
assert.equal(
  logic.artifactLatestCanonicalAfterFailure_("record-1", null).record.certificateNo,
  "UC015726070001"
);
context.storeReadRecords_ = () => [{
  recordId: "record-1",
  deleted: false,
  payload: reserved.record
}, {
  recordId: "record-2",
  deleted: false,
  payload: { id: "record-2", certificateNo: "UC015726070002", quoteNo: "QT-2" }
}, {
  recordId: "record-deleted",
  deleted: true,
  payload: { id: "record-deleted", certificateNo: "UC015726070003" }
}];
const reservedNumberRows = logic.artifactCanonicalNumberReservationRows_("store-sheet", "record-1");
assert.equal(reservedNumberRows.length, 2);
assert(reservedNumberRows[0].documentNumbers.includes("UC015726070002"));
assert(reservedNumberRows[1].documentNumbers.includes("UC015726070003"),
  "Soft deletion must never release a reserved number.");

let trackedCleanupError;
let fallbackTrashSucceeded = false;
directCreateState.removeThrows = true;
try {
  logic.artifactThrowAfterCleanup_(new Error("generation failed"), {
    setShareableByEditors() {},
    setTrashed() { fallbackTrashSucceeded = true; },
    getId: () => "partial-file-id",
    getUrl: () => "https://drive.google.com/open?id=partial-file-id",
    getName: () => "partial-output"
  }, "新規テスト成果物", "file");
} catch (error) {
  trackedCleanupError = error;
}
directCreateState.removeThrows = false;
assert.equal(trackedCleanupError.artifactProvisional.fileId, "partial-file-id");
assert.equal(trackedCleanupError.artifactProvisional.cleanupFailed, true);
assert.equal(fallbackTrashSucceeded, true,
  "完全削除に失敗した場合は暫定的にゴミ箱へ移動します");
assert(trackedCleanupError.message.includes("担当部署に確認が必要"));
assert(Object.keys(cleanupAuditProperties).some((key) => key.startsWith("RENEWAL_ARTIFACT_CLEANUP_FAILURE_")),
  "ゴミ箱移動に成功しても完全削除失敗はScriptPropertyへ追跡記録を残します");
const removedBeforeSuccessfulCleanup = directCreateState.removedIds.length;
const originalCleanupError = new Error("original failure");
assert.throws(() => logic.artifactThrowAfterCleanup_(originalCleanupError, {
  setTrashed() { throw new Error("permanent delete should return first"); },
  getId: () => "cleaned-id", getUrl: () => "", getName: () => "cleaned"
}, "cleaned", "file"), /original failure/);
assert.equal(directCreateState.removedIds.length, removedBeforeSuccessfulCleanup + 1);
assert.equal(directCreateState.removedIds.at(-1), "cleaned-id",
  "後始末はゴミ箱移動ではなくDrive APIの完全削除を優先します");

assert.equal(logic.artifactAddCalendarMonthsMinusOne_("2026-01-31"), "2026-04-30");
assert.equal(logic.artifactFiscalYearFromIso_("2026-04-01"), "2026");
assert.equal(logic.artifactFiscalYearFromIso_("2027-03-31"), "2026");
assert.equal(logic.artifactFiscalYearFromIso_("2027-04-01"), "2027");
assert.equal(logic.artifactFiscalYearFromIso_("2026-02-30"), "");
let fixedYearErrors = [];
logic.artifactValidateCommon_(
  { recordId: "record-year", targetName: "年度確認", fiscalYear: "2026", courseDate: "" },
  fixedYearErrors
);
assert.deepEqual(fixedYearErrors, [], "案内など講習修了日前の成果物では空の講習日を年度不一致にしません");
fixedYearErrors = [];
logic.artifactValidateCommon_(
  { recordId: "record-year", targetName: "年度確認", fiscalYear: "2026", courseDate: "2027-03-31" },
  fixedYearErrors
);
assert.deepEqual(fixedYearErrors, []);
fixedYearErrors = [];
logic.artifactValidateCommon_(
  { recordId: "record-year", targetName: "年度確認", fiscalYear: "2026", courseDate: "2027-04-01" },
  fixedYearErrors
);
assert(fixedYearErrors.some((message) => message.includes("年度が一致しません")));
fixedYearErrors = [];
logic.artifactValidateCommon_(
  { recordId: "record-year", targetName: "年度確認", fiscalYear: "2027", courseDate: "" },
  fixedYearErrors
);
assert(fixedYearErrors.some((message) => message.includes("2026年度専用")));
fixedYearErrors = [];
logic.artifactValidateCommon_(
  { recordId: "record-year", targetName: "年度確認", fiscalYear: "2026", courseDate: "2026-02-30" },
  fixedYearErrors
);
assert(fixedYearErrors.some((message) => message.includes("実在する yyyy-MM-dd")),
  "案内・請求でも入力済みの不正な講習修了日を無視してはいけません");
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

function makeRegistrySheet({ throwAfterAppend = false, throwAfterSet = false, throwReadAfterSet = false } = {}) {
  const data = [];
  let appendShouldThrow = throwAfterAppend;
  let setShouldThrow = throwAfterSet;
  let hasSet = false;
  let readAfterSetShouldThrow = throwReadAfterSet;
  return {
    data,
    getLastRow: () => data.length + 1,
    getMaxRows: () => 100,
    insertRowsAfter() {},
    appendRow(values) {
      data.push(values.map(String));
      if (appendShouldThrow) {
        appendShouldThrow = false;
        throw new Error("simulated lost append response");
      }
    },
    deleteRow(row) { data.splice(row - 2, 1); },
    getRange(row, column, rowCount, columnCount) {
      assert.equal(column, 1);
      assert.equal(columnCount, 15);
      return {
        setNumberFormat() { return this; },
        setValues(matrix) {
          data[row - 2] = matrix[0].map(String);
          hasSet = true;
          if (setShouldThrow) {
            setShouldThrow = false;
            throw new Error("simulated lost update response");
          }
          return this;
        },
        getDisplayValues() {
          if (hasSet && readAfterSetShouldThrow) {
            readAfterSetShouldThrow = false;
            throw new Error("simulated lost readback response");
          }
          return data.slice(row - 2, row - 2 + rowCount).map((values) => values.slice());
        }
      };
    }
  };
}

const preparedMetadata = {
  kind: "certificate",
  version: 1,
  payloadHash: registryPayloadHash,
  recordUpdates: { certificateNo: "UC015726070002" }
};
const preparedEntry = {
  recordId: "record-prepared",
  kind: "certificate",
  hash: registryPayloadHash,
  version: 1,
  folderId: "record-folder",
  documentNumbers: "UC015726070002",
  message: "成果物作成前の永続予約",
  metadata: preparedMetadata
};
const unknownAppendSheet = makeRegistrySheet({ throwAfterAppend: true });
const recoveredPreparedAppend = logic.artifactAppendPreparedRegistry_(unknownAppendSheet, { ...preparedEntry });
assert.equal(recoveredPreparedAppend.status, "prepared");
assert.equal(unknownAppendSheet.data.length, 1,
  "追記応答不明でも永続化済みprepared行を削除・重複追記してはいけません");
assert.equal(logic.artifactRegistryRowsIssue_(unknownAppendSheet.data), "");
assert.equal(logic.artifactFindExisting_([recoveredPreparedAppend], "record-prepared", "certificate", registryPayloadHash), null,
  "preparedはcreated成果物として再利用してはいけません");
assert.equal(logic.artifactFindPrepared_([recoveredPreparedAppend], "record-prepared", "certificate").version, 1);
assert.equal(logic.artifactNextVersion_([recoveredPreparedAppend], "record-prepared", "certificate"), 2,
  "prepared versionは別の新規版に再利用されない予約でなければなりません");
assert.equal(logic.artifactRegistryGlobalRowsIssue_([recoveredPreparedAppend]), "");
assert(logic.artifactRegistryGlobalRowsIssue_([
  recoveredPreparedAppend,
  { ...recoveredPreparedAppend, sheetRow: 3 }
]).includes("重複") || logic.artifactRegistryGlobalRowsIssue_([
  recoveredPreparedAppend,
  { ...recoveredPreparedAppend, sheetRow: 3 }
]).includes("複数"));

const createdMetadataAfterRecovery = {
  ...preparedMetadata,
  outputContentHash: "1".repeat(64),
  outputDriveVersion: "9",
  outputModifiedTime: "2026-07-15T01:00:00.000Z",
  outputMd5Checksum: ""
};
const committedAfterUnknownResponse = logic.artifactUpdatePreparedRegistry_(
  unknownAppendSheet,
  recoveredPreparedAppend,
  {
    ...preparedEntry,
    status: "created",
    fileId: "certificate-file",
    url: "https://docs.google.com/document/d/certificate-file/edit",
    fileName: "証明書",
    message: "中断前成果物を再検証",
    metadata: createdMetadataAfterRecovery
  }
);
assert.equal(committedAfterUnknownResponse.status, "created");
assert.equal(unknownAppendSheet.data.length, 1,
  "prepared確定は同じ行の1回更新であり新しいcreated行を追記してはいけません");
const errorTransitionSheet = makeRegistrySheet();
const preparedForError = logic.artifactAppendPreparedRegistry_(errorTransitionSheet, { ...preparedEntry });
const committedError = logic.artifactUpdatePreparedRegistry_(errorTransitionSheet, preparedForError, {
  ...preparedEntry,
  status: "error",
  message: "生成失敗・rollback済み",
  metadata: { ...preparedMetadata, cleanupFailure: null }
});
assert.equal(committedError.status, "error");
assert.equal(errorTransitionSheet.data.length, 1,
  "catch時も新しいerror行を追記せず同じprepared行を更新する必要があります");
assert.equal(
  logic.artifactNextVersion_([committedError], "record-prepared", "certificate"),
  2,
  "失敗したversionも監査上の使用済み版として保持し、同じ入力の再試行は次版へ進める必要があります"
);
const retryAfterError = {
  ...recoveredPreparedAppend,
  sheetRow: 3,
  version: 2,
  status: "prepared",
  metadataJson: JSON.stringify({ ...preparedMetadata, version: 2 })
};
assert.equal(
  logic.artifactRegistryGlobalRowsIssue_([committedError, retryAfterError]),
  "",
  "error版を残したまま次versionを予約できなければなりません"
);
assert(
  logic.artifactRegistryGlobalRowsIssue_([
    committedError,
    { ...retryAfterError, version: 1, metadataJson: committedError.metadataJson }
  ]).includes("重複"),
  "error版と同じversionを再利用してはいけません"
);

const unknownUpdateSheet = makeRegistrySheet({ throwAfterSet: true });
unknownUpdateSheet.data.push(unknownAppendSheet.data[0].map(String));
unknownUpdateSheet.data[0][5] = "prepared";
unknownUpdateSheet.data[0][6] = "";
unknownUpdateSheet.data[0][7] = "";
unknownUpdateSheet.data[0][8] = "";
unknownUpdateSheet.data[0][12] = "成果物作成前の永続予約";
unknownUpdateSheet.data[0][13] = JSON.stringify(preparedMetadata);
const unknownUpdatePrepared = logic.artifactRegistryRowObject_(unknownUpdateSheet.data[0], 2);
const recoveredCreatedUpdate = logic.artifactUpdatePreparedRegistry_(
  unknownUpdateSheet,
  unknownUpdatePrepared,
  {
    ...preparedEntry,
    status: "created",
    fileId: "certificate-file",
    url: "https://docs.google.com/document/d/certificate-file/edit",
    fileName: "証明書",
    message: "作成済み",
    metadata: createdMetadataAfterRecovery
  }
);
assert.equal(recoveredCreatedUpdate.status, "created",
  "created確定後の応答不明は同じ行の読戻しで成功として回収する必要があります");
const replacementRows = [
  { ...recoveredPreparedAppend, status: "error" },
  { ...recoveredPreparedAppend, sheetRow: 4 }
];
logic.artifactReplaceRegistryRow_(replacementRows, { ...committedAfterUnknownResponse, sheetRow: 4 });
assert.equal(replacementRows[0].status, "error");
assert.equal(replacementRows[1].status, "created",
  "複数レジストリで同じsheetRowがあり得るため完全なprepared identityで置換する必要があります");

const unknownReadbackSheet = makeRegistrySheet({ throwReadAfterSet: true });
unknownReadbackSheet.data.push(unknownUpdateSheet.data[0].map(String));
unknownReadbackSheet.data[0][5] = "prepared";
unknownReadbackSheet.data[0][6] = "";
unknownReadbackSheet.data[0][7] = "";
unknownReadbackSheet.data[0][8] = "";
unknownReadbackSheet.data[0][12] = "成果物作成前の永続予約";
unknownReadbackSheet.data[0][13] = JSON.stringify(preparedMetadata);
const unknownReadbackPrepared = logic.artifactRegistryRowObject_(unknownReadbackSheet.data[0], 2);
assert.throws(
  () => logic.artifactUpdatePreparedRegistry_(unknownReadbackSheet, unknownReadbackPrepared, {
    ...preparedEntry,
    status: "created",
    fileId: "certificate-file",
    url: "https://docs.google.com/document/d/certificate-file/edit",
    fileName: "証明書",
    message: "作成済み",
    metadata: createdMetadataAfterRecovery
  }),
  (error) => error.artifactRegistryOutcomeUncertain === true,
  "確定書込後に読戻し不能なら成果物をrollbackしてはいけない不明状態として扱う必要があります"
);

function arrayIterator(items) {
  let index = 0;
  return {
    hasNext: () => index < items.length,
    next: () => items[index++]
  };
}

const savedGetFilesByName = context.DriveApp.getFilesByName;
const savedReusableCheck = context.artifactAssertReusableDriveItem_;
const savedOutputContentHash = context.artifactOutputContentHash_;
const savedDriveRevisionState = context.artifactDriveRevisionState_;
const savedGeneratedIdentityCheck = context.artifactAssertGeneratedFileIdentity_;
const recoveryRecord = { recordId: "record-prepared", targetName: "回収対象者" };
const recoveryFileName = logic.artifactExpectedOutputFileName_("certificate", recoveryRecord, 1);
const recoveryPreparedName = logic.artifactPreparedOutputFileName_(
  recoveryRecord.recordId, "certificate", registryPayloadHash, 1
);
const recoveryContentHash = "f".repeat(64);
let recoveryDescription = logic.artifactOutputIdentity_(
  recoveryRecord.recordId, "certificate", registryPayloadHash, 1, recoveryContentHash
);
let recoveryCurrentName = recoveryFileName;
const recoveryFile = {
  getId: () => "recovered-file-id",
  getName: () => recoveryCurrentName,
  getUrl: () => "https://docs.google.com/document/d/recovered-file-id/edit",
  getDescription: () => recoveryDescription
};
const recoveryFolder = {
  getId: () => "record-folder",
  getFiles: () => arrayIterator([recoveryFile])
};
context.DriveApp.getFilesByName = () => {
  throw new Error("prepared recovery must not scan same-name files globally");
};
context.artifactAssertReusableDriveItem_ = () => true;
context.artifactOutputContentHash_ = () => recoveryContentHash;
context.artifactDriveRevisionState_ = () => ({
  driveVersion: "12",
  modifiedTime: "2026-07-15T01:00:00.000Z",
  md5Checksum: ""
});
context.artifactAssertGeneratedFileIdentity_ = (file, expectedName, expectedIdentity) => {
  assert.equal(file.getName(), expectedName);
  assert.equal(file.getDescription(), expectedIdentity);
  return true;
};
const recoveredHardStopFile = logic.artifactRecoverPreparedFile_(
  recoveredPreparedAppend,
  {
    record: recoveryRecord,
    kind: "certificate",
    payloadHash: registryPayloadHash,
    version: 1,
    targetFolder: recoveryFolder,
    settings: { allowedOutputEmails: "owner@example.com" }
  }
);
assert.equal(recoveredHardStopFile.fileId, "recovered-file-id");
assert.equal(recoveredHardStopFile.outputContentHash, recoveryContentHash);
assert.equal(recoveredHardStopFile.outputDriveVersion, "12",
  "ファイル作成後hard-stopはidentity・本文hash・Drive版を再検証して回収する必要があります");
recoveryCurrentName = recoveryPreparedName;
recoveryDescription = "";
assert.throws(
  () => logic.artifactRecoverPreparedFile_(recoveredPreparedAppend, {
    record: recoveryRecord,
    kind: "certificate",
    payloadHash: registryPayloadHash,
    version: 1,
    targetFolder: recoveryFolder,
    settings: { allowedOutputEmails: "owner@example.com" }
  }),
  /途中|未完成|担当部署/,
  "匿名PREPARED名の途中ファイルを見落としたり完成品として確定してはいけません"
);
recoveryCurrentName = recoveryFileName;
recoveryDescription = logic.artifactPreparedOutputIdentity_(
  recoveryRecord.recordId, "certificate", registryPayloadHash, 1
);
assert.throws(
  () => logic.artifactRecoverPreparedFile_(recoveredPreparedAppend, {
    record: recoveryRecord,
    kind: "certificate",
    payloadHash: registryPayloadHash,
    version: 1,
    targetFolder: recoveryFolder,
    settings: { allowedOutputEmails: "owner@example.com" }
  }),
  /作成途中/,
  "prepared identityのままの未完成ファイルを完成品として確定してはいけません"
);
context.DriveApp.getFilesByName = savedGetFilesByName;
context.artifactAssertReusableDriveItem_ = savedReusableCheck;
context.artifactOutputContentHash_ = savedOutputContentHash;
context.artifactDriveRevisionState_ = savedDriveRevisionState;
context.artifactAssertGeneratedFileIdentity_ = savedGeneratedIdentityCheck;

const savedEnsureAnnualLedger = context.artifactEnsureAnnualLedger_;
let ledgerRootFiles = [];
const ledgerAutoRoot = {
  getId: () => "auto-root",
  getFilesByName: () => arrayIterator(ledgerRootFiles)
};
const ledgerRecoveryRow = validLedgerAuditRow.slice();
ledgerRecoveryRow[0] = "UC015726070002";
ledgerRecoveryRow[8] = "record-ledger";
ledgerRecoveryRow[9] = "1";
ledgerRecoveryRow[10] = registryPayloadHash + " / 2026-07-15 10:00:00";
ledgerRecoveryRow[11] = logic.artifactLedgerVisibleHash_(ledgerRecoveryRow.slice(0, 8));
ledgerRecoveryRow[12] = logic.artifactLedgerStateHash_(ledgerRecoveryRow.slice(0, 8), ledgerRecoveryRow.slice(8, 12));
let ledgerRecoveryRows = [ledgerRecoveryRow];
const ledgerRecoverySheet = {
  getLastRow: () => 3,
  getSheetId: () => 777,
  getName: () => "2026年",
  getRange(row, column, rowCount, columnCount) {
    assert.deepEqual([row, column, rowCount, columnCount], [3, 2, 1, 13]);
    return { getDisplayValues: () => ledgerRecoveryRows.map((values) => values.slice()) };
  }
};
const ledgerRecoveryFile = {
  getId: () => "annual-ledger-id",
  getUrl: () => "https://docs.google.com/spreadsheets/d/annual-ledger-id/edit",
  getName: () => "更新講習修了証明書発行台帳_2026年"
};
context.artifactEnsureAnnualLedger_ = () => ({
  file: ledgerRecoveryFile,
  sheet: ledgerRecoverySheet,
  spreadsheet: {}
});
context.artifactAssertReusableDriveItem_ = () => true;
const ledgerPrepared = {
  recordId: "record-ledger",
  kind: "ledger",
  hash: registryPayloadHash,
  version: 1,
  folderId: "auto-root",
  documentNumbers: "UC015726070002",
  status: "prepared"
};
const recoveredHardStopLedger = logic.artifactRecoverPreparedLedger_(ledgerPrepared, {
  record: {
    recordId: "record-ledger",
    certificateIssuedDate: "2026-07-15"
  },
  kind: "ledger",
  payloadHash: registryPayloadHash,
  version: 1,
  autoRoot: ledgerAutoRoot,
  settings: { allowedOutputEmails: "owner@example.com" }
});
assert.equal(recoveredHardStopLedger.ledgerRow, 3);
assert.equal(recoveredHardStopLedger.ledgerStateHash, ledgerRecoveryRow[12],
  "台帳書込後hard-stopは監査列と可視値/state hashを再検証して回収する必要があります");
const partialLedgerRow = ledgerRecoveryRow.slice();
partialLedgerRow.splice(8, 5, "", "", "", "", "");
ledgerRecoveryRows = [partialLedgerRow];
assert.throws(
  () => logic.artifactRecoverPreparedLedger_(ledgerPrepared, {
    record: { recordId: "record-ledger", certificateIssuedDate: "2026-07-15" },
    kind: "ledger",
    payloadHash: registryPayloadHash,
    version: 1,
    autoRoot: ledgerAutoRoot,
    settings: { allowedOutputEmails: "owner@example.com" }
  }),
  /未完成台帳行/,
  "可視列だけ書かれたhard-stop台帳行を見逃して次行へ重複作成してはいけません"
);
const strayLedgerFile = {
  getId: () => "stray-ledger-id",
  getParents: () => arrayIterator([{ getId: () => "auto-root" }]),
  getDescription: () => ""
};
ledgerRootFiles = [strayLedgerFile];
assert.throws(
  () => logic.artifactAssertNoStrayPreparedLedger_(ledgerAutoRoot, 2026),
  /作成途中|識別情報不一致/,
  "固定保存先内の識別情報不一致の年次台帳を重複作成せず検出する必要があります"
);
ledgerRootFiles = [];
context.artifactEnsureAnnualLedger_ = savedEnsureAnnualLedger;
context.artifactAssertReusableDriveItem_ = savedReusableCheck;
context.DriveApp.getFilesByName = savedGetFilesByName;

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
const official2028Csv = [
  "date,name",
  "2028/01/01,元日",
  "2028/01/10,成人の日",
  "2028/02/11,建国記念の日",
  "2028/02/23,天皇誕生日",
  "2028/03/20,春分の日",
  "2028/04/29,昭和の日",
  "2028/05/03,憲法記念日",
  "2028/05/04,みどりの日",
  "2028/05/05,こどもの日",
  "2028/07/17,海の日",
  "2028/08/11,山の日",
  "2028/09/18,敬老の日",
  "2028/09/22,秋分の日",
  "2028/10/09,スポーツの日",
  "2028/11/03,文化の日",
  "2028/11/23,勤労感謝の日"
].join("\r\n");
const imported2028 = logic.artifactParseOfficialHolidayCsv_(
  official2028Csv, 2028, context.RENEWAL_ARTIFACT.OFFICIAL_HOLIDAY_CSV_URL
);
assert.equal(imported2028.year, 2028);
assert.equal(imported2028.rows.length, 16);
assert.match(imported2028.csvHash, /^[0-9a-f]{64}$/);
assert.match(imported2028.sourceHash, /^[0-9a-f]{64}$/);
assert.throws(() => logic.artifactParseOfficialHolidayCsv_(official2028Csv, 2027,
  context.RENEWAL_ARTIFACT.OFFICIAL_HOLIDAY_CSV_URL));
assert.throws(() => logic.artifactParseOfficialHolidayCsv_(official2028Csv, 2028,
  "https://example.invalid/holidays.csv"));
assert.doesNotThrow(() => logic.artifactAssertImportedHolidayCalendarStore_({
  schemaVersion: 1,
  years: {
    "2028": {
      year: 2028,
      rows: imported2028.rows,
      sourceUrl: imported2028.sourceUrl,
      sourceHash: imported2028.sourceHash,
      csvHash: imported2028.csvHash,
      confirmedDate: "2026-07-24",
      confirmedBy: "administrator"
    }
  }
}));
assert.throws(() => logic.artifactAssertImportedHolidayCalendarStore_({
  schemaVersion: 1,
  years: {
    "2028": {
      year: 2028,
      rows: imported2028.rows,
      sourceUrl: imported2028.sourceUrl,
      sourceHash: "0".repeat(64),
      csvHash: imported2028.csvHash,
      confirmedDate: "2026-07-24",
      confirmedBy: "administrator"
    }
  }
}));
assert.equal(logic.artifactFindForbiddenDocumentContent_({ body: { content: [] } }, ""), "");
assert.equal(logic.artifactFindForbiddenDocumentContent_({
  tabs: [{ documentTab: { inlineObjects: { objectId: {}} } }]
}, ""), "tabs.0.documentTab.inlineObjects");
const dryRun = logic.artifactBuildNumberingMigrationDryRun_({
  cutoverMonth: "2026-07",
  confirmedDate: "2026-07-24",
  confirmedBy: "administrator",
  certificateSourceChecked: true,
  dipsSourceChecked: true,
  existingCertificateNumbers: "UC015726070010",
  existingDipsApplicantIds: "260712"
}, [{ recordId: "r-1", documentNumbers: "UC015726070009;260711" }], "2026-07-24");
assert.equal(dryRun.ready, true);
assert.equal(dryRun.summary.recommendedCertificateSequenceSeed, "UC015726070010");
assert.equal(dryRun.summary.recommendedDipsSequenceSeed, "260712");
assert.equal(dryRun.summary.nextCertificateNo, "UC015726070011");
assert.equal(dryRun.summary.nextDipsApplicantId, "260713");
const duplicateDryRun = logic.artifactBuildNumberingMigrationDryRun_({
  cutoverMonth: "2026-07",
  confirmedDate: "2026-07-24",
  confirmedBy: "administrator",
  certificateSourceChecked: true,
  dipsSourceChecked: true,
  existingCertificateNumbers: "UC015726070010\nUC015726070010"
}, [], "2026-07-24");
assert.equal(duplicateDryRun.ready, false);
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
const pinnedOutputFolderId = context.RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID;
assert.equal(
  logic.artifactPublicSettings_({ outputFolderId: "legacy-output" }).outputFolderMigrationRequired,
  true
);
assert.equal(
  logic.artifactPublicSettings_({ outputFolderId: "legacy-output" }).outputFolderId,
  pinnedOutputFolderId
);
assert.equal(
  logic.artifactPublicSettings_({ outputFolderId: pinnedOutputFolderId }).outputFolderMigrationRequired,
  false
);
assert.equal(
  logic.artifactPublicSettings_({ outputFolderId: pinnedOutputFolderId }).outputFolderName,
  "2026年度"
);
assert.throws(
  () => logic.artifactRequireSafeOutputFolder_("legacy-output", [], allowedOutputEmails),
  /固定/
);
assert.doesNotThrow(() => logic.artifactRequireSafeOutputFolder_(pinnedOutputFolderId, [], allowedOutputEmails));
driveState.actorEmail = "";
assert.throws(() => logic.artifactRequireSafeOutputFolder_(pinnedOutputFolderId, [], allowedOutputEmails), /実行者メール/);
driveState.actorEmail = "owner@example.com";
driveState.outputTrashed = true;
assert.throws(() => logic.artifactRequireSafeOutputFolder_(pinnedOutputFolderId, [], allowedOutputEmails));
driveState.outputTrashed = false;
driveState.sharingAccess = "DOMAIN";
assert.throws(() => logic.artifactRequireSafeOutputFolder_(pinnedOutputFolderId, [], allowedOutputEmails));
driveState.sharingAccess = "PRIVATE";
driveState.sharingThrows = true;
assert.throws(() => logic.artifactRequireSafeOutputFolder_(pinnedOutputFolderId, [], allowedOutputEmails));
driveState.sharingThrows = false;
driveState.templateParentId = pinnedOutputFolderId;
assert.throws(() => logic.artifactRequireSafeOutputFolder_(pinnedOutputFolderId, [], allowedOutputEmails));
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
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ parents: ["expected-parent", "extra-parent"] }), "expected-parent", "テスト項目", allowedOutputEmails), /直下1か所/);
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ viewers: ["outsider@example.com"] }), "expected-parent", "テスト項目", allowedOutputEmails));
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem({ shareableByEditors: true }), "expected-parent", "テスト項目", allowedOutputEmails), /再共有/);
assert.throws(() => logic.artifactAssertReusableDriveItem_(driveItem(), "expected-parent", "テスト項目", "owner@example.com,missing@example.com"), /実際のDrive権限/);
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
assert(source.includes('billing: "CDP_CLEAN_BILLING_V3"'), "請求帳票レイアウト版がありません");
assert(source.includes('"CDP_CLEAN_INVOICE_V3"') && source.includes('"CDP_CLEAN_QUOTE_V3"'),
  "正式会計対応後の請求・見積レイアウト識別子がありません");
assert(source.includes("file.getLastUpdated().toISOString()"),
  "Driveテンプレートfingerprintに最終更新日時が含まれていません");
assert(source.includes("templateFingerprint: templateFingerprints[kind]"),
  "payloadHashにテンプレートfingerprintが含まれていません");
assert.equal(source.includes("DEFAULT_PARENT_FOLDER_ID"), false, "出力先の既定フォルダへフォールバックしてはいけません");
assert(source.includes('PINNED_OUTPUT_PARENT_FOLDER_ID: "1XmQirjBrQR-uC_GuBVXAyRK5zfqtoQwN"'),
  "成果物の固定保存先が承認済み2026年度フォルダへ固定されていません");
assert(source.includes("id !== RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID"),
  "承認済みフォルダ以外への書込みを拒否する検査がありません");
assert(source.includes("folder.getSharingAccess()"), "出力先フォルダの共有範囲を検査する必要があります");
assert(source.includes("DriveApp.Access.PRIVATE"), "出力先フォルダはPRIVATEだけを許可する必要があります");
assert(source.includes("templateFile.getParents()"), "テンプレート親フォルダを出力先から除外する必要があります");
assert(source.includes("artifactAssertDriveItemAcl_"), "所有者・編集者・閲覧者のACL照合がありません");
assert(source.includes("Drive.Permissions.list(itemId"), "Advanced Drive v3で全権限を列挙する必要があります");
assert(source.includes("supportsAllDrives: true"), "共有ドライブを含むACL列挙指定がありません");
const driveAclBlock = extractFunction("artifactAssertDriveItemAcl_");
assert(driveAclBlock.includes("var requestOptions") &&
  driveAclBlock.includes("requestOptions.pageToken = pageToken") &&
  driveAclBlock.includes("Drive.Permissions.list(itemId, requestOptions)"),
  "ACL列挙の要求オプションは関数引数と衝突しない変数で全ページへ適用する必要があります");
assert(source.includes("item.isShareableByEditors()"), "編集者による再共有をfail-closed検査する必要があります");
assert(source.includes("item.setShareableByEditors(false)"), "新規成果物で編集者再共有を無効化する必要があります");
const advancedManifest = JSON.parse(fs.readFileSync("appsscript.json", "utf8"));
assert((advancedManifest.dependencies && advancedManifest.dependencies.enabledAdvancedServices || []).some((service) =>
  service.userSymbol === "Drive" && service.serviceId === "drive" && service.version === "v3"
), "Advanced Drive API v3をmanifestで有効化する必要があります");
assert(source.includes("allowedOutputEmails"), "成果物アクセス許可メール設定がありません");
assert(source.includes("BLOCKED_TEMPLATE_IDS"), "既知の実データ入りテンプレートID拒否設定がありません");
const provisionCertificateTemplateBlock = extractFunction("artifactProvisionCertificateTemplate_");
assert(provisionCertificateTemplateBlock.indexOf("if (tempMatches.length)") >= 0 &&
  provisionCertificateTemplateBlock.indexOf("if (tempMatches.length)") <
    provisionCertificateTemplateBlock.indexOf("if (finalMatches.length === 1)"),
  "修了証明書の一時原本は完成原本を再利用する前にも必ず検出して停止する必要があります");
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
assert(saveSettingsBlock.includes("artifactAssertLegacyOutputFolderSwitchSafe_(current.outputFolderId)"),
  "旧保存先の作成履歴・残存項目・削除失敗を監査せず固定保存先へ切り替えてはいけません");
const legacySwitchBlock = extractFunction("artifactAssertLegacyOutputFolderSwitchSafe_");
assert(legacySwitchBlock.includes("RENEWAL_ARTIFACT_AUTO_ROOT_") &&
  legacySwitchBlock.includes("RENEWAL_ARTIFACT_CLEANUP_FAILURE_") &&
  legacySwitchBlock.includes("Drive.Files.list"),
  "旧保存先の自動作成履歴・cleanup失敗・残存項目をすべて検査する必要があります");
const preflightBlock = source.slice(
  source.indexOf("function artifactBuildPreflight_"),
  source.indexOf("function artifactValidateCommon_")
);
assert(preflightBlock.includes("artifactRequireSafeOutputFolder_(settings.outputFolderId,"),
  "事前検査時に出力先の非公開検査がありません");
assert(preflightBlock.includes("artifactAssertDedicatedTemplateStorageSafe_(settings)"),
  "事前検査時に専用原本フォルダと原本ファイルの所有者専用ACLを確認する必要があります");
const createBlock = source.slice(
  source.indexOf("function apiCreateArtifacts"),
  source.indexOf("function artifactBuildPreflight_")
);
assert(createBlock.includes("var lockedCanonicalRequest = artifactLoadCanonicalArtifactRequest_(request)") &&
  createBlock.includes("var lockedPreflight = artifactBuildPreflight_(lockedCanonicalRequest.request)"),
  "作成時はロック取得後にも出力先を含む事前検査を再実行する必要があります");
assert(createBlock.includes("artifactPersistCanonicalReservationsUnlocked_") &&
  createBlock.indexOf("artifactPersistCanonicalReservationsUnlocked_") < createBlock.indexOf("artifactCreateByKind_"),
  "採番・期限はDrive成果物の生成前に共有正本へ予約する必要があります");
assert(createBlock.includes("artifactCanonicalNumberReservationRows_"),
  "生成失敗後の予約番号を別対象者が再利用しない検査が必要です");
assert(createBlock.includes("settings.certificateSequenceSeed"),
  "修了証明書の自動採番に移行seedが渡されていません");
assert(createBlock.includes("settings.dipsSequenceSeed"),
  "DIPSの自動採番に移行seedが渡されていません");
assert(createBlock.includes("artifactAssertAutomaticNumberingAllowed_"),
  "空欄からの自動採番前に採番移行確認と切替年月を強制する必要があります");
assert(createBlock.includes("artifactAssertReusableDriveItem_(existingArtifactFile"),
  "同一内容の既存成果物を再利用する前にも共有・親・削除状態を検査する必要があります");
const existingBillingLookupIndex = createBlock.indexOf(
  "var existing = preparedRegistryRow"
);
const cancelledBillingGuardIndex = createBlock.indexOf(
  "artifactAssertFormalInvoiceNewGenerationAllowed_(record)"
);
const billingVersionAllocationIndex = createBlock.indexOf(
  "version = preparedRegistryRow"
);
assert(
  existingBillingLookupIndex >= 0 &&
  cancelledBillingGuardIndex > existingBillingLookupIndex &&
  billingVersionAllocationIndex > cancelledBillingGuardIndex,
  "全額取消判定は既存成果物の検証・履歴参照後、かつ新version予約前に行う必要があります"
);
const createBillingBlock = extractFunction("artifactCreateBilling_");
assert(
  createBillingBlock.indexOf(
    "artifactAssertFormalInvoiceNewGenerationAllowed_(record)"
  ) >= 0 &&
  createBillingBlock.indexOf(
    "artifactAssertFormalInvoiceNewGenerationAllowed_(record)"
  ) < createBillingBlock.indexOf("artifactCreateSpreadsheetInFolder_"),
  "請求書生成関数もDriveファイル作成前に全額取消を再検査する必要があります"
);
const formalBillingHashBlock = extractFunction("artifactRecordForHash_");
assert.equal(
  formalBillingHashBlock.includes('"_formalFinanceStateHash"'),
  false,
  "会計全体stateHashを正式請求成果物のpayload identityへ含めてはいけません"
);
assert(
  formalBillingHashBlock.includes('"financeInvoiceImmutableKey"') &&
  formalBillingHashBlock.includes('"formalBillingSnapshot"') &&
  formalBillingHashBlock.includes('"formalBillingLines"'),
  "正式請求成果物のidentityは対象請求immutableKey・発行時snapshot・請求明細を含む必要があります"
);
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
const validateCommonBlock = extractFunction("artifactValidateCommon_");
assert(validateCommonBlock.includes("PINNED_OUTPUT_FISCAL_YEAR") &&
  validateCommonBlock.includes("validCourseDate") &&
  validateCommonBlock.includes("artifactFiscalYearFromIso_(validCourseDate)"),
  "2026年度固定フォルダへ別年度の成果物を誤保存しない検査が必要です");

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
assert(ledgerBlock.includes("artifactCreateSpreadsheetInFolder_(") &&
  ledgerBlock.includes("name,") && ledgerBlock.includes("autoRoot,"),
  "台帳は保存先を指定した同一Drive API要求で新規作成します");
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
assert(registryBlock.includes("artifactCreateSpreadsheetInFolder_"),
  "成果物レジストリはMy Drive直下を経由せず固定保存先へ直接作成する必要があります");
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
const directSpreadsheetCreateBlock = extractFunction("artifactCreateSpreadsheetInFolder_");
const directDriveCreateBlock = extractFunction("artifactCreateDriveItemInFolder_");
assert(directSpreadsheetCreateBlock.includes("artifactCreateDriveItemInFolder_") &&
  directDriveCreateBlock.includes("Drive.Files.create") &&
  directDriveCreateBlock.includes("parents: [parentId]") &&
  directDriveCreateBlock.includes("supportsAllDrives: true") &&
  directDriveCreateBlock.includes("ignoreDefaultVisibility: true"),
  "新規スプレッドシートは親フォルダを作成要求へ含め、移動前中断窓を作らない必要があります");
assert.equal(directSpreadsheetCreateBlock.includes("SpreadsheetApp.create"), false,
  "固定保存先へ直接作る処理でMy Drive直下作成を使ってはいけません");
const directCopyBlock = extractFunction("artifactCopyFileInFolder_");
assert(directCopyBlock.includes("Drive.Files.copy") &&
  directCopyBlock.includes("parents: [parentId]") &&
  directCopyBlock.includes("ignoreDefaultVisibility: true"),
  "Googleドキュメント・シートのコピーも親指定と既定公開無効化を同一要求で行う必要があります");
assert.equal(source.includes(".makeCopy("), false,
  "DriveApp.makeCopyによる既定公開・移動中断窓を残してはいけません");
assert.equal(source.includes(".createFolder("), false,
  "DriveApp.createFolderによる既定公開窓を残してはいけません");
assert.equal(source.includes(".createFile("), false,
  "個人情報入りCSVをDriveApp.createFileで先に作成してはいけません");
const directBlobBlock = extractFunction("artifactUpdateBlobFileContent_");
const dipsDirectSequenceBlock = source.slice(
  source.indexOf("function artifactCreateDipsCsv_"),
  source.indexOf("function artifactCreateGuidance_")
);
assert(directBlobBlock.includes("Drive.Files.update") &&
  dipsDirectSequenceBlock.indexOf("artifactCreateDriveItemInFolder_") >= 0 &&
  dipsDirectSequenceBlock.indexOf("artifactCreateDriveItemInFolder_") <
    dipsDirectSequenceBlock.indexOf("artifactPrepareNewOutputFile_") &&
  dipsDirectSequenceBlock.indexOf("artifactPrepareNewOutputFile_") <
    dipsDirectSequenceBlock.indexOf("artifactUpdateBlobFileContent_"),
  "CSVは空ファイルの親・ACLを確定してから個人情報を含む内容をアップロードする必要があります");
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
assert(rollbackBlock.includes("artifactPermanentlyDeleteNewDriveItem_"),
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
  createApiBlock.includes("artifactCompleteRegistryMetadata_"),
  "個別成果物は本文hashとDrive版を確定してから監査ログへ記録する必要があります");
assert(extractFunction("artifactCompleteRegistryMetadata_").includes("outputDriveVersion") &&
  extractFunction("artifactCompleteRegistryMetadata_").includes("outputModifiedTime"));
assert(createApiBlock.includes("error.artifactProvisional") && createApiBlock.includes("errorMetadata.cleanupFailure"),
  "cleanup失敗した部分成果物はID・URL・名前をerror registryへ残す必要があります");
assert(createApiBlock.includes('itemType: kind === "ledger" ? "ledgerRow" : "file"') &&
  createApiBlock.includes("ledgerSheetName: artifactText_(created.ledgerSheetName)"),
  "外側rollback失敗ではcreated情報から個別fileまたは台帳sheet/rowを必ず追跡する必要があります");
assert.equal(/setTrashed\(true\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}/.test(source), false,
  "新規Drive項目のcleanup失敗を黙殺してはいけません");
const permanentDeleteBlock = extractFunction("artifactPermanentlyDeleteNewDriveItem_");
assert(permanentDeleteBlock.includes("Drive.Files.remove") &&
  permanentDeleteBlock.indexOf("Drive.Files.remove") < permanentDeleteBlock.indexOf("item.setTrashed(true)") &&
  permanentDeleteBlock.includes("artifactPersistCleanupFailure_"),
  "途中成果物は完全削除を先に試し、ゴミ箱移動だけなら未解決として追跡する必要があります");
assert.equal(/catch\s*\(oldRowMarkError\)\s*\{\s*\}/.test(createApiBlock), false,
  "旧版台帳行の訂正表示失敗を握り潰してはいけません");
const settingsLoadBlock = source.slice(
  source.indexOf("function artifactSettingsDefaults_"),
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
assert(
  createApiBlock.indexOf("artifactAppendPreparedRegistry_") < createApiBlock.indexOf("artifactCreateByKind_"),
  "Drive成果物・台帳を書き込む前にprepared予約を永続化する必要があります"
);
assert(createApiBlock.includes("artifactAssertNoUnresolvedCleanupFailures_"),
  "未解決の完全削除・台帳rollback失敗がある間は成果物作成全体を停止する必要があります");
assert(extractFunction("apiProvisionArtifactTemplates").includes("artifactAssertNoUnresolvedCleanupFailures_"),
  "未解決cleanupがある間は専用原本の追加作成も停止する必要があります");
assert(createApiBlock.includes("artifactRecoverPreparedOutput_") &&
  createApiBlock.includes("前回中断した作成予約と現在の入力内容が一致しません"),
  "prepared再実行は既存成果物を照合し、入力hash変更時はfail-closedにする必要があります");
assert(createApiBlock.includes("preparedCreatedThisAttempt") &&
  createApiBlock.includes("前回実行から残る作成予約に一致するDrive成果物をまだ確認できません"),
  "以前から残るPREPAREDで一覧候補が0件でも不存在と断定して再作成してはいけません");
assert(createApiBlock.includes("artifactUpdatePreparedRegistry_") &&
  extractFunction("artifactUpdatePreparedRegistry_").includes("range.setValues"),
  "preparedは同じ監査行の1 range更新でcreated/errorへ確定する必要があります");
const recoverPreparedFileBlock = extractFunction("artifactRecoverPreparedFile_");
assert(recoverPreparedFileBlock.includes("getDescription") &&
  recoverPreparedFileBlock.includes("artifactExpectedOutputFileName_") &&
  recoverPreparedFileBlock.includes("artifactPreparedOutputFileName_") &&
  recoverPreparedFileBlock.includes("context.targetFolder.getFiles()") &&
  !recoverPreparedFileBlock.includes("DriveApp.getFilesByName") &&
  recoverPreparedFileBlock.includes("artifactOutputContentHash_") &&
  recoverPreparedFileBlock.includes("artifactDriveRevisionState_"),
  "中断後の個別成果物は予定名・description identity・本文hash・Drive版情報で照合する必要があります");
assert(extractFunction("artifactRecoverPreparedLedger_").includes("ledgerVisibleHash") &&
  extractFunction("artifactRecoverPreparedLedger_").includes("ledgerStateHash") &&
  extractFunction("artifactRecoverPreparedLedger_").includes("suspiciousPartialRows"),
  "中断後の台帳行はrecord/version/hashと可視値hash・状態hashで照合する必要があります");
const ledgerStrayBlock = extractFunction("artifactAssertNoStrayPreparedLedger_");
assert(ledgerStrayBlock.includes("autoRoot.getFilesByName") &&
  !ledgerStrayBlock.includes("DriveApp.getFilesByName"),
  "中断年次台帳の探索は固定保存先フォルダ内だけに限定する必要があります");
const prepareNewOutputBlock = extractFunction("artifactPrepareNewOutputFile_");
assert(prepareNewOutputBlock.includes("artifactPreparedOutputIdentity_") &&
  prepareNewOutputBlock.indexOf("artifactAssertReusableDriveItem_") <
    prepareNewOutputBlock.indexOf("file.setName(finalName)"),
  "生成開始直後の個別成果物へprepared identityを設定する必要があります");
assert(source.includes("ledgerSheetName: sheet.getName()"), "台帳行位置metadata用のシート名がありません");
assert(source.includes("ledgerVisibleHash: ledgerVisibleHash"), "台帳B:I可視値の作成時hashがありません");
assert(source.includes("ledgerStateHash: ledgerStateHash"), "台帳旧版markerを含む状態hashがありません");
assert(source.includes("artifactAssertGuidanceTemplateClean_"), "案内原本の清浄性検査がありません");
assert(source.includes("TRUSTED_TEMPLATE_MODIFIED_TIMES") && source.includes("artifactAssertTrustedSharedTemplate_"),
  "共有原本を承認版の最終更新時刻へ固定する検査がありません");
assert(source.includes("artifactAssertTrainingTemplateClean_"), "講習記録簿原本の清浄性検査がありません");

assert(source.includes("function artifactRequireCapability_"), "Artifact capability gate is required.");
assert(source.includes("function artifactActiveActorEmail_"), "Active-user identity helper is required.");
assert.equal(source.includes("Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail()"), false,
  "The deployer/effective user must never be used as an artifact caller identity.");
[
  ["apiGetArtifactSettings", "artifacts.read"],
  ["apiGetArtifactHolidayCalendarStatus", "artifacts.read"],
  ["apiProvisionArtifactTemplates", "artifacts.admin"],
  ["apiSaveArtifactSettings", "artifacts.admin"],
  ["apiUpdateHolidayCalendarFromOfficialCsv", "artifacts.admin"],
  ["apiDryRunNumberingMigration", "artifacts.admin"],
  ["apiPreflightArtifacts", "artifacts.write"],
  ["apiCreateArtifacts", "artifacts.write"]
].forEach(([api, capability]) => {
  assert(extractFunction(api).includes('artifactRequireCapability_("' + capability + '")'),
    api + " must be gated by " + capability);
});
["apiProvisionArtifactTemplates", "apiSaveArtifactSettings", "apiUpdateHolidayCalendarFromOfficialCsv"].forEach((api) => {
  const block = extractFunction(api);
  assert.equal((block.match(/artifactRequireCapability_\("artifacts\.admin"\)/g) || []).length, 2,
    api + " must re-check artifacts.admin after acquiring the script lock");
});
const snapshotBuilderBlock = extractFunction("artifactBuildFormalBillingSnapshotForFinance_");
assert(snapshotBuilderBlock.includes("storeReadRecords_") && snapshotBuilderBlock.includes("artifactLoadSettings_") &&
  snapshotBuilderBlock.includes("artifactValidateFormalBillingSnapshot_"),
  "正式請求snapshotは共有正本とサーバー設定だけから構築・検証する必要があります");
assert.equal(snapshotBuilderBlock.includes("input."), false,
  "正式請求snapshotへ画面入力値を混入してはいけません");
["apiPreflightArtifacts", "apiCreateArtifacts"].forEach((api) => {
  const block = extractFunction(api);
  assert(block.includes('artifactRequireCapability_("artifacts.billing")'),
    api + " must require artifacts.billing for billing output");
  assert(block.includes("artifactLoadCanonicalArtifactRequest_"),
    api + " must reload the canonical record");
});
assert(extractFunction("apiPreflightArtifacts").includes("hasNonBillingKind") &&
  extractFunction("apiCreateArtifacts").includes("hasRequestedNonBillingKind"),
  "Non-billing output must be gated independently from accounting-only billing output.");
assert(extractFunction("artifactPersistCanonicalReservationsUnlocked_").includes("storeUpsertRecordUnlocked_"));
assert.equal(extractFunction("artifactPersistCanonicalReservationsUnlocked_").includes("storeUpsertRecord_("), false,
  "Artifact reservation must not acquire a nested store lock.");
assert(extractFunction("artifactPersistCanonicalReservationsUnlocked_").includes("formalFinanceMirror"),
  "正式請求の正本ミラー保存はDataStoreの内部専用フラグを明示する必要があります。");
assert(createBlock.includes("formalFinanceMirror: !!lockedCanonicalRequest.financeInvoice"),
  "正式請求を選択した作成処理だけが正式会計ミラー保存を許可されます。");
assert(source.includes("financeInvoice: kind === \"billing\" ? artifactFormalInvoiceMetadata_(record) : null"),
  "Billing registry metadata must retain the formal finance invoice evidence.");
["apiPreflightArtifacts", "apiCreateArtifacts"].forEach((api) => {
  assert.equal(/artifactNormalizeRecord_\(request\.(?:record|payload)/.test(extractFunction(api)), false,
    "Public artifact APIs must not normalize a browser payload as the source of truth.");
});

const manifest = JSON.parse(fs.readFileSync("appsscript.json", "utf8"));
assert.equal(manifest.timeZone, "Asia/Tokyo");
const scopes = new Set(manifest.oauthScopes || []);
[
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/userinfo.email"
].forEach((scope) => assert(scopes.has(scope), "OAuth scopeがありません: " + scope));
assert.equal(manifest.webapp.access, "ANYONE");
assert.equal(manifest.webapp.executeAs, "USER_DEPLOYING");

console.log("artifacts_logic_test: OK");
