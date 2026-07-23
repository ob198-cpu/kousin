// @ts-nocheck
// 更新講習の成果物を、既存の原本を変更せずに複製・作成するサーバー処理。

var RENEWAL_ARTIFACT = {
  // 全成果物に共通するハッシュ構造・生成仕様を変更した場合は増分する。
  SCHEMA_VERSION: 3,
  DRIVE_IDENTITY_VERSION: "CDP_RENEWAL_ARTIFACT_IDENTITY_V1",
  SETTINGS_KEY: "RENEWAL_ARTIFACT_SETTINGS_V1",
  BANK_KEY: "RENEWAL_ARTIFACT_BANK_V1",
  TEMPLATE_FOLDER_NAME: "更新講習システム_専用原本",
  // ledger / certificate は設定画面で「無個人情報・ベースのみ」の専用原本IDを必須指定する。
  // 既存受講者データを含む既知の原本は BLOCKED_TEMPLATE_IDS で明示拒否する。
  TEMPLATE_IDS: {
    guidance: "1jmjiJCrmqi_yWNp_hPLfAFmjVctaVqUZDguhRZ-HRks",
    training: "1b2gjUL0I2vfK-XOvbDhg8oXg36EdADajamivX7wfgC4"
  },
  // 2026-07-23に全本文・全使用セルを確認した承認版。更新された原本は再承認まで拒否する。
  TRUSTED_TEMPLATE_MODIFIED_TIMES: {
    guidance: "2026-07-14T13:49:04.709Z",
    training: "2026-07-14T13:49:39.552Z"
  },
  BLOCKED_TEMPLATE_IDS: {
    ledger: "1lAO89hPt2FRu-EoqfkS_xCFKVkfrglz5o-ms-qD92yE",
    certificate: "1QNHWJMo94V1kfz3EGhdO8Y-5kEvVnbChePe1T52-ALY"
  },
  // 各成果物の列・セル・数式・表示・コピー後補正を変更した場合は、原本更新の有無にかかわらず対象版を増分する。
  LAYOUT_VERSIONS: {
    ledger: "LEDGER_OUTPUT_V4",
    certificate: "CERTIFICATE_OUTPUT_V2",
    dipsCsv: "DIPS_MANUAL_11COL_V2",
    guidance: "GUIDANCE_OUTPUT_V2",
    training: "TRAINING_OUTPUT_V2",
    billing: "CDP_CLEAN_BILLING_V2"
  },
  CERTIFICATE_BASE_TAB_ID: "t.0",
  ORGANIZATION_CODE: "0157",
  OFFICE_CODE: "R0157001",
  BILLING_NUMBER_NAMESPACE: "UC0157",
  AUTO_FOLDER_NAME: "自動作成",
  REGISTRY_FILE_NAME: "更新講習_成果物レジストリ",
  REGISTRY_SHEET_NAME: "監査ログ",
  KINDS: ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"],
  LABELS: {
    ledger: "発行台帳",
    certificate: "講習修了証明書",
    dipsCsv: "DIPS提出CSV",
    guidance: "更新講習のご案内",
    training: "講習記録簿",
    billing: "見積書・請求書"
  }
};

// 内閣府「国民の祝日について」公表済み日付。未収録年は推測せずDIPS成果物を停止する。
var RENEWAL_JAPAN_HOLIDAYS = {
  version: "CAO_JP_HOLIDAYS_2026_2027_V1",
  years: {
    "2026": ["01-01", "01-12", "02-11", "02-23", "03-20", "04-29", "05-03", "05-04", "05-05", "05-06", "07-20", "08-11", "09-21", "09-22", "09-23", "10-12", "11-03", "11-23"],
    "2027": ["01-01", "01-11", "02-11", "02-23", "03-21", "03-22", "04-29", "05-03", "05-04", "05-05", "07-19", "08-11", "09-20", "09-23", "10-11", "11-03", "11-23"]
  }
};

var RENEWAL_ARTIFACT_REGISTRY_HEADERS = [
  "作成日時", "recordId", "種別", "payloadHash", "version", "状態",
  "fileId", "URL", "ファイル名", "保存先folderId", "実行者",
  "採番情報", "メッセージ", "metadataJson", "schemaVersion"
];

/** 保存済みの事業者設定を返す。振込先の本文は返さない。 */
function apiGetArtifactSettings() {
  try {
    var internal = artifactLoadSettings_();
    return {
      success: true,
      settings: artifactPublicSettings_(internal),
      outputFolderUrl: artifactFolderUrl_(internal.outputFolderId),
      templateFolderUrl: artifactFolderUrl_(internal.templateFolderId)
    };
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, error: message, message: message };
  }
}

/**
 * 個人情報入りの既存資料を運用原本として使わず、清浄な専用原本を一度だけ準備する。
 *
 * 証明書は元ファイルのネイティブ複製を一時ファイルとして作り、ベース以外のタブを
 * 削除して全差込欄を固定ダミー値へ置換する。さらに清浄化後の二次コピーだけを
 * 運用原本にするため、最終原本の版履歴に元の個人情報は入らない。
 * 発行台帳は既存ファイル全体を複製せず、空の「ベース」シートだけを新規ブックへ移す。
 */
function apiProvisionArtifactTemplates() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      success: false,
      error: "別の専用原本準備が実行中です。しばらく待って再実行してください。",
      message: "別の専用原本準備が実行中です。しばらく待って再実行してください。"
    };
  }

  var createdFiles = [];
  try {
    var current = artifactLoadSettings_();
    var templateFolder = artifactEnsureTemplateFolder_(current.templateFolderId);
    var ledgerTemplateId = artifactExtractDriveFileId_(current.ledgerTemplateId);
    var certificateTemplateId = artifactExtractDriveFileId_(current.certificateTemplateId);

    if (ledgerTemplateId) {
      artifactAssertLedgerTemplateClean_(ledgerTemplateId);
    } else {
      var ledgerFile = artifactProvisionLedgerTemplate_(templateFolder);
      createdFiles.push(ledgerFile);
      ledgerTemplateId = ledgerFile.getId();
    }

    if (certificateTemplateId) {
      artifactAssertCertificateTemplateClean_(certificateTemplateId);
    } else {
      var certificateFile = artifactProvisionCertificateTemplate_(templateFolder);
      createdFiles.push(certificateFile);
      certificateTemplateId = certificateFile.getId();
    }

    artifactAssertLedgerTemplateClean_(ledgerTemplateId);
    artifactAssertCertificateTemplateClean_(certificateTemplateId);

    current.templateFolderId = templateFolder.getId();
    current.ledgerTemplateId = ledgerTemplateId;
    current.certificateTemplateId = certificateTemplateId;
    delete current._bankAccountText;
    PropertiesService.getScriptProperties().setProperty(
      RENEWAL_ARTIFACT.SETTINGS_KEY,
      JSON.stringify(current)
    );

    return {
      success: true,
      settings: artifactPublicSettings_(artifactLoadSettings_()),
      templateFolderUrl: artifactFolderUrl_(templateFolder.getId()),
      ledgerTemplateUrl: "https://docs.google.com/spreadsheets/d/" + ledgerTemplateId + "/edit",
      certificateTemplateUrl: "https://docs.google.com/document/d/" + certificateTemplateId + "/edit",
      created: createdFiles.length > 0,
      message: createdFiles.length
        ? "無個人情報の修了証明書・発行台帳専用原本を作成しました。"
        : "既存の専用原本は清浄性検査済みです。新しい原本は作成していません。"
    };
  } catch (error) {
    for (var cleanupIndex = 0; cleanupIndex < createdFiles.length; cleanupIndex++) {
      artifactRemoveCreatedFilePermanently_(createdFiles[cleanupIndex]);
    }
    var message = artifactErrorMessage_(error);
    return { success: false, error: message, message: message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 事業者設定を保存する。
 * bankAccountText は空欄なら既存値を維持し、clearBankAccount=true のときだけ削除する。
 */
function apiSaveArtifactSettings(input) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, error: "別の設定更新が実行中です。しばらく待って再実行してください。", message: "別の設定更新が実行中です。しばらく待って再実行してください。" };
  try {
    input = input || {};
    var current = artifactLoadSettings_();
    var next = {
      issuerCompany: artifactText_(input.issuerCompany !== undefined ? input.issuerCompany : current.issuerCompany),
      issuerAddress: artifactText_(input.issuerAddress !== undefined ? input.issuerAddress : current.issuerAddress),
      issuerPhone: artifactText_(input.issuerPhone !== undefined ? input.issuerPhone : current.issuerPhone),
      issuerFax: artifactText_(input.issuerFax !== undefined ? input.issuerFax : current.issuerFax),
      issuerEmail: artifactText_(input.issuerEmail !== undefined ? input.issuerEmail : current.issuerEmail),
      invoiceRegistrationNo: artifactText_(input.invoiceRegistrationNo !== undefined ? input.invoiceRegistrationNo : current.invoiceRegistrationNo),
      outputFolderId: artifactExtractDriveId_(input.outputFolderId !== undefined ? input.outputFolderId : current.outputFolderId),
      templateFolderId: artifactExtractDriveId_(current.templateFolderId),
      ledgerTemplateId: artifactExtractDriveFileId_(input.ledgerTemplateId !== undefined ? input.ledgerTemplateId : current.ledgerTemplateId),
      certificateTemplateId: artifactExtractDriveFileId_(input.certificateTemplateId !== undefined ? input.certificateTemplateId : current.certificateTemplateId),
      allowedOutputEmails: artifactNormalizeAllowedEmails_(input.allowedOutputEmails !== undefined
        ? input.allowedOutputEmails
        : current.allowedOutputEmails).join("\n"),
      dipsAdditionalClosedDates: artifactNormalizeIsoDateList_(input.dipsAdditionalClosedDates !== undefined
        ? input.dipsAdditionalClosedDates
        : current.dipsAdditionalClosedDates).join("\n"),
      dipsCalendarConfirmedDate: artifactText_(input.dipsCalendarConfirmedDate !== undefined
        ? input.dipsCalendarConfirmedDate
        : current.dipsCalendarConfirmedDate),
      dipsCalendarConfirmedBy: artifactText_(input.dipsCalendarConfirmedBy !== undefined
        ? input.dipsCalendarConfirmedBy
        : current.dipsCalendarConfirmedBy),
      numberingInitialized: input.numberingInitialized !== undefined
        ? artifactBoolean_(input.numberingInitialized)
        : artifactBoolean_(current.numberingInitialized),
      numberingCutoverMonth: artifactText_(input.numberingCutoverMonth !== undefined
        ? input.numberingCutoverMonth
        : current.numberingCutoverMonth),
      certificateSequenceSeed: artifactText_(input.certificateSequenceSeed !== undefined
        ? input.certificateSequenceSeed
        : current.certificateSequenceSeed),
      dipsSequenceSeed: artifactText_(input.dipsSequenceSeed !== undefined
        ? input.dipsSequenceSeed
        : current.dipsSequenceSeed),
      schedules: Array.isArray(input.schedules) ? artifactNormalizeSchedules_(input.schedules) : current.schedules
    };
    if (next.issuerEmail && !artifactIsEmail_(next.issuerEmail)) throw new Error("申込先メールの形式が正しくありません。");
    artifactAssertNumberingSettings_(next);
    artifactAssertAllowedOutputEmails_(next.allowedOutputEmails);
    var dipsSettingsErrors = [];
    artifactValidateDipsCalendarSettings_(next, artifactTodayIso_(), false, dipsSettingsErrors);
    if (dipsSettingsErrors.length) throw new Error(dipsSettingsErrors.join(" "));
    artifactAssertRequiredTemplateSettings_(next);
    artifactAssertLedgerTemplateClean_(next.ledgerTemplateId);
    artifactAssertCertificateTemplateClean_(next.certificateTemplateId);

    // 保存時にも個人情報を置ける非公開フォルダであることを確認する。フォルダ自体は変更しない。
    artifactRequireSafeOutputFolder_(next.outputFolderId, [next.ledgerTemplateId, next.certificateTemplateId], next.allowedOutputEmails);
    if (artifactText_(current.outputFolderId) && artifactText_(current.outputFolderId) !== artifactText_(next.outputFolderId)) {
      var existingRows = artifactReadAllRegistryRows_(current.allowedOutputEmails);
      if (existingRows.some(function(row) { return row.status === "created"; })) {
        throw new Error("作成済み成果物があるため出力先フォルダは変更できません。担当部署で監査ログを伴う移行を完了してから設定してください。");
      }
    }

    var props = PropertiesService.getScriptProperties();
    props.setProperty(RENEWAL_ARTIFACT.SETTINGS_KEY, JSON.stringify(next));
    if (input.clearBankAccount === true) {
      props.deleteProperty(RENEWAL_ARTIFACT.BANK_KEY);
    } else if (artifactText_(input.bankAccountText || input.bankAccount)) {
      props.setProperty(RENEWAL_ARTIFACT.BANK_KEY, artifactText_(input.bankAccountText || input.bankAccount));
    }
    return apiGetArtifactSettings();
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, error: message, message: message };
  } finally {
    lock.releaseLock();
  }
}

/** 作成前検査。Driveへの書込みや採番の予約は行わない。 */
function apiPreflightArtifacts(request) {
  try {
    return artifactBuildPreflight_(request || {});
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, ready: false, items: [], errors: [message], warnings: [], error: message, message: message };
  }
}

/**
 * 検査済み成果物を作成する。テンプレート原本は読み取りのみで、必ずコピーへ記入する。
 * 同一 recordId・種別・payloadHash は既存成果物を返し、内容変更時だけ version を進める。
 */
function apiCreateArtifacts(request) {
  request = request || {};
  var preflight = artifactBuildPreflight_(request);
  if (!preflight.success || !preflight.ready) {
    return {
      success: false,
      results: [],
      recordUpdates: {},
      errors: preflight.errors && preflight.errors.length ? preflight.errors : ["作成前検査に合格していません。"],
      preflight: preflight
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, results: [], recordUpdates: {}, errors: ["別の成果物作成が実行中です。しばらく待って再実行してください。"], message: "別の成果物作成が実行中です。しばらく待って再実行してください。" };
  }

  try {
    // Lock取得後に設定と検査を再読込し、採番・レジストリ更新を直列化する。
    var lockedPreflight = artifactBuildPreflight_(request);
    if (!lockedPreflight.ready) {
      return { success: false, results: [], recordUpdates: {}, errors: lockedPreflight.errors || ["作成前検査に合格していません。"] };
    }

    var settings = artifactLoadSettings_();
    var record = artifactNormalizeRecord_(request.record || request.payload || {});
    var kinds = artifactNormalizeKinds_(request.kinds || request.types || request.artifactTypes);
    // 案内日程は事業者設定に保存済みのマスタだけを正本とし、request側の未保存値は使用しない。
    var schedules = artifactNormalizeSchedules_(settings.schedules);
    var templateFingerprints = {};
    for (var fingerprintIndex = 0; fingerprintIndex < kinds.length; fingerprintIndex++) {
      templateFingerprints[kinds[fingerprintIndex]] = artifactTemplateFingerprint_(kinds[fingerprintIndex], settings);
    }
    var autoRoot = artifactEnsureAutoRoot_(settings.outputFolderId, settings.allowedOutputEmails);
    var registry = artifactEnsureRegistry_(autoRoot, settings.allowedOutputEmails);
    var registryRows = artifactReadAllRegistryRows_(settings.allowedOutputEmails);
    artifactAssertOutputRootContinuity_(registryRows, autoRoot.getId(), record.recordId, kinds);
    var existingAssignments = artifactFindRecordAssignments_(registryRows, artifactText_(record.recordId));
    artifactApplyMissing_(record, existingAssignments);
    var recordNumberState = artifactRecordNumberState_(registryRows, artifactText_(record.recordId));
    artifactAssertRecordNumberContinuity_(recordNumberState, record, kinds);
    if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv"])) {
      artifactAssertCertificateDateContinuity_(registryRows, record);
    }

    var recordUpdates = {};
    var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
    if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv", "training"])) {
      courseDate = artifactRequireIsoDate_(record.courseDate, "講習修了日");
    }
    var certificateIssuedDate = "";
    if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv"])) {
      var certificateDateErrors = [];
      certificateIssuedDate = artifactValidateCertificateDates_(
        courseDate, record.certificateIssuedDate, artifactTodayIso_(), certificateDateErrors
      );
      if (kinds.indexOf("ledger") >= 0) {
        artifactValidateCertificateDelivery_(
          record.certificateDelivered,
          record.certificateDeliveredDate,
          certificateIssuedDate,
          artifactTodayIso_(),
          certificateDateErrors,
          []
        );
      }
      if (certificateDateErrors.length) throw new Error(certificateDateErrors.join(" "));
      var calculatedExpiry = artifactAddCalendarMonthsMinusOne_(certificateIssuedDate);
      record.certificateExpiry = calculatedExpiry;
      recordUpdates.certificateExpiry = calculatedExpiry;
    }

    if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv"])) {
      if (!artifactText_(record.certificateNo)) {
        artifactAssertAutomaticNumberingAllowed_(settings, certificateIssuedDate, "修了証明書番号");
        record.certificateNo = artifactNextCertificateNo_(
          registryRows, autoRoot, certificateIssuedDate, settings.certificateSequenceSeed, settings
        );
      }
      recordUpdates.certificateNo = record.certificateNo;
    }
    if (kinds.indexOf("dipsCsv") >= 0) {
      if (!artifactText_(record.dipsApplicantId)) {
        if (artifactText_(record.dipsRecordMode) !== "新規登録") {
          throw new Error("DIPSの既存情報更新・削除には登録済みのDIPS申請者IDが必要です。自動採番はできません。");
        }
        artifactAssertAutomaticNumberingAllowed_(settings, courseDate, "DIPS申請者ID");
        record.dipsApplicantId = artifactNextDipsApplicantId_(registryRows, courseDate, settings.dipsSequenceSeed);
      }
      recordUpdates.dipsApplicantId = record.dipsApplicantId;
    }
    if (kinds.indexOf("billing") >= 0) {
      artifactPrepareBillingIdentity_(record, registryRows, recordUpdates);
    }
    artifactAssertEffectiveNumberRules_(record, kinds);
    artifactAssertNumberUniqueness_(record, kinds, registryRows);

    var recordFolder = null;
    var results = [];
    var errors = [];
    for (var i = 0; i < kinds.length; i++) {
      var kind = kinds[i];
      var label = RENEWAL_ARTIFACT.LABELS[kind];
      var targetFolder = autoRoot;
      var dipsSubmissionDeadline = kind === "dipsCsv"
        ? artifactDipsSubmissionDeadline_(record.certificateIssuedDate, settings.dipsAdditionalClosedDates, RENEWAL_JAPAN_HOLIDAYS)
        : "";
      var payloadHash = artifactHashHex_({
        schemaVersion: RENEWAL_ARTIFACT.SCHEMA_VERSION,
        kind: kind,
        templateFingerprint: templateFingerprints[kind],
        record: artifactRecordForHash_(kind, record),
        settings: artifactSettingsForHash_(kind, settings),
        schedules: kind === "guidance" ? schedules : [],
        outputFolderId: settings.outputFolderId
      });
      var version = artifactNextVersion_(registryRows, record.recordId, kind);
      var created = null;
      var priorLedgerMark = null;
      var registryCommitted = false;
      try {
        if (kind !== "ledger") {
          if (!recordFolder) recordFolder = artifactEnsureRecordFolder_(autoRoot, record, settings.allowedOutputEmails);
          targetFolder = recordFolder;
          artifactAssertPriorOutputVersions_(
            registryRows, record.recordId, kind, targetFolder, settings.allowedOutputEmails
          );
        }
        var existing = artifactFindExisting_(registryRows, record.recordId, kind, payloadHash);
        if (existing) {
          var existingArtifactFile;
          try { existingArtifactFile = DriveApp.getFileById(existing.fileId); }
          catch (existingFileError) { throw new Error("作成済み成果物を確認できません。ファイルを復元し、権限を修復してから再実行してください。"); }
          artifactAssertReusableDriveItem_(existingArtifactFile, targetFolder.getId(), label + "の既存成果物", settings.allowedOutputEmails);
          var verifiedExisting = null;
          if (kind === "ledger") artifactAssertExistingLedgerRow_(existing, record.recordId, payloadHash, autoRoot, settings);
          else verifiedExisting = artifactAssertExistingOutputFile_(existingArtifactFile, existing, record.recordId, kind, payloadHash, targetFolder);
          results.push({
            kind: kind,
            label: label,
            status: "skipped",
            url: verifiedExisting ? verifiedExisting.url : existing.url,
            fileName: verifiedExisting ? verifiedExisting.fileName : existingArtifactFile.getName(),
            dipsSubmissionDeadline: dipsSubmissionDeadline,
            message: "同じ内容の作成済み成果物（v" + existing.version + "）を使用します。"
          });
          continue;
        }
        var context = {
          kind: kind,
          label: label,
          record: record,
          settings: settings,
          schedules: schedules,
          autoRoot: autoRoot,
          targetFolder: targetFolder,
          registrySheet: registry.sheet,
          registryRows: registryRows,
          payloadHash: payloadHash,
          version: version
        };
        created = artifactCreateByKind_(context);
        if (kind !== "ledger") {
          var outputIntegrity = artifactFinalizeNewOutputFile_(
            DriveApp.getFileById(created.fileId), context, "新規" + label
          );
          created.outputContentHash = outputIntegrity.contentHash;
          created.outputDriveVersion = outputIntegrity.driveVersion;
          created.outputModifiedTime = outputIntegrity.modifiedTime;
          created.outputMd5Checksum = outputIntegrity.md5Checksum;
        }
        artifactAssertReusableDriveItem_(DriveApp.getFileById(created.fileId), targetFolder.getId(), label + "の作成成果物", settings.allowedOutputEmails);
        if (kind === "ledger" && created.ledgerRow && version > 1) {
          var correctionSheet = SpreadsheetApp.openById(created.fileId).getSheetByName(created.ledgerSheetName);
          priorLedgerMark = artifactMarkPriorLedgerRows_(correctionSheet, record.recordId, version);
          created.message += " 旧版" + priorLedgerMark.changes.length + "行へ訂正表示を確認済みです。";
        }
        var metadata = {
          recordUpdates: recordUpdates,
          kind: kind,
          version: version,
          payloadHash: payloadHash,
          templateFingerprint: templateFingerprints[kind],
          numberingCutoverMonth: artifactText_(settings.numberingCutoverMonth),
          eligibilityCheck: artifactEligibilityMetadata_(record),
          qualificationContext: artifactQualificationContextMetadata_(record),
          taxException: artifactTaxExceptionMetadata_(record),
          dipsSubmissionDeadline: dipsSubmissionDeadline,
          dipsCompletionLinkedDate: kind === "dipsCsv" ? artifactText_(record.dipsCompletionLinkedDate) : "",
          certificateIssuedDate: artifactAnyKind_([kind], ["ledger", "certificate", "dipsCsv"]) ? artifactText_(record.certificateIssuedDate) : "",
          certificateExpiry: artifactAnyKind_([kind], ["ledger", "certificate", "dipsCsv"]) ? artifactText_(record.certificateExpiry) : ""
        };
        if (kind === "ledger") {
          metadata.ledgerRow = created.ledgerRow;
          metadata.ledgerSheetName = created.ledgerSheetName;
          metadata.ledgerVisibleHash = created.ledgerVisibleHash;
          metadata.ledgerStateHash = created.ledgerStateHash;
        } else {
          metadata.outputContentHash = created.outputContentHash;
          metadata.outputDriveVersion = created.outputDriveVersion;
          metadata.outputModifiedTime = created.outputModifiedTime;
          metadata.outputMd5Checksum = created.outputMd5Checksum;
        }
        var proposedRegistryRow = {
          recordId: record.recordId,
          kind: kind,
          hash: payloadHash,
          version: version,
          status: "created",
          fileId: created.fileId
        };
        var proposedGlobalIssue = artifactRegistryGlobalRowsIssue_(registryRows.concat([proposedRegistryRow]));
        if (proposedGlobalIssue) throw new Error("成果物レジストリ追記前の全体版検証に失敗しました。" + proposedGlobalIssue);
        var committedRegistryRow = artifactAppendRegistry_(registry.sheet, {
          recordId: record.recordId,
          kind: kind,
          hash: payloadHash,
          version: version,
          status: "created",
          fileId: created.fileId,
          url: created.url,
          fileName: created.fileName,
          folderId: targetFolder.getId(),
          documentNumbers: created.documentNumbers || artifactDocumentNumbers_(record, kind),
          message: created.message || "",
          metadata: metadata
        });
        registryCommitted = true;
        registryRows.push(committedRegistryRow);
        results.push({
          kind: kind,
          label: label,
          status: "created",
          url: created.url,
          fileName: created.fileName,
          dipsSubmissionDeadline: dipsSubmissionDeadline,
          message: created.message || ("v" + version + " を作成しました。")
        });
      } catch (error) {
        var cleanupErrors = [];
        var cleanupFailure = error && error.artifactProvisional ? error.artifactProvisional : null;
        if (!registryCommitted && created && priorLedgerMark) {
          try { artifactRestorePriorLedgerRows_(created.fileId, priorLedgerMark); }
          catch (restorePriorLedgerError) { cleanupErrors.push("旧版表示の復元: " + artifactErrorMessage_(restorePriorLedgerError)); }
        }
        if (!registryCommitted && created) {
          try { artifactRollbackCreated_(created, kind); }
          catch (rollbackError) {
            cleanupErrors.push("作成途中成果物のrollback: " + artifactErrorMessage_(rollbackError));
            if (!cleanupFailure) {
              cleanupFailure = rollbackError && rollbackError.artifactProvisional
                ? rollbackError.artifactProvisional
                : {
                  itemType: kind === "ledger" ? "ledgerRow" : "file",
                  label: "作成途中" + label,
                  fileId: artifactText_(created.fileId),
                  url: artifactText_(created.url),
                  fileName: artifactText_(created.fileName),
                  cleanupFailed: true,
                  ledgerRow: Number(created.ledgerRow || 0),
                  ledgerSheetName: artifactText_(created.ledgerSheetName),
                  ledgerVersion: Number(created.ledgerVersion || 0)
                };
            }
          }
        }
        if (cleanupFailure) {
          var cleanupAuditIssue = artifactPersistCleanupFailure_(
            cleanupFailure, error, cleanupErrors.join(" / ") || "cleanup失敗"
          );
          if (cleanupAuditIssue) cleanupErrors.push(cleanupAuditIssue);
        }
        var message = artifactErrorMessage_(error);
        if (cleanupErrors.length) message += " 【担当部署に確認が必要】" + cleanupErrors.join(" / ");
        if (registryCommitted) message = "成果物と監査ログは作成済みですが、作成後処理でエラーになりました。削除せず保持します。" + message;
        errors.push(label + ": " + message);
        if (!registryCommitted) try {
          var errorRegistryRow = artifactAppendRegistry_(registry.sheet, {
            recordId: record.recordId,
            kind: kind,
            hash: payloadHash,
            version: version,
            status: "error",
            fileId: cleanupFailure ? artifactText_(cleanupFailure.fileId) : "",
            url: cleanupFailure ? artifactText_(cleanupFailure.url) : "",
            fileName: cleanupFailure ? artifactText_(cleanupFailure.fileName) : "",
            folderId: targetFolder.getId(),
            documentNumbers: artifactDocumentNumbers_(record, kind),
            message: message,
            metadata: {
              recordUpdates: recordUpdates,
              kind: kind,
              version: version,
              payloadHash: payloadHash,
              templateFingerprint: templateFingerprints[kind],
              numberingCutoverMonth: artifactText_(settings.numberingCutoverMonth),
              eligibilityCheck: artifactEligibilityMetadata_(record),
              qualificationContext: artifactQualificationContextMetadata_(record),
              taxException: artifactTaxExceptionMetadata_(record),
              dipsSubmissionDeadline: dipsSubmissionDeadline,
              dipsCompletionLinkedDate: kind === "dipsCsv" ? artifactText_(record.dipsCompletionLinkedDate) : "",
              certificateIssuedDate: artifactAnyKind_([kind], ["ledger", "certificate", "dipsCsv"]) ? artifactText_(record.certificateIssuedDate) : "",
              certificateExpiry: artifactAnyKind_([kind], ["ledger", "certificate", "dipsCsv"]) ? artifactText_(record.certificateExpiry) : "",
              cleanupFailure: cleanupFailure || null
            }
          });
          registryRows.push(errorRegistryRow);
        } catch (registryError) {
          errors.push("監査ログ記録: " + artifactErrorMessage_(registryError));
        }
        results.push({
          kind: kind, label: label, status: "error", dipsSubmissionDeadline: dipsSubmissionDeadline,
          url: cleanupFailure ? artifactText_(cleanupFailure.url) : "",
          fileName: cleanupFailure ? artifactText_(cleanupFailure.fileName) : "",
          message: message
        });
      }
    }

    return {
      success: errors.length === 0,
      results: results,
      recordUpdates: recordUpdates,
      errors: errors,
      outputFolderUrl: recordFolder ? artifactFolderUrl_(recordFolder.getId()) : artifactFolderUrl_(autoRoot.getId())
    };
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, results: [], recordUpdates: {}, errors: [message], error: message, message: message };
  } finally {
    lock.releaseLock();
  }
}

function artifactBuildPreflight_(request) {
  request = request || {};
  var settings = artifactLoadSettings_();
  var record = artifactNormalizeRecord_(request.record || request.payload || {});
  var kinds = artifactNormalizeKinds_(request.kinds || request.types || request.artifactTypes);
  // request.schedules は旧画面・未保存編集の可能性があるため無視し、保存済み設定を正本にする。
  var schedules = artifactNormalizeSchedules_(settings.schedules);
  var items = [];
  var globalErrors = [];
  var globalWarnings = [];
  if (!kinds.length) globalErrors.push("作成する成果物を1つ以上選択してください。");

  try { artifactAssertNumberingSettings_(settings); }
  catch (numberingSettingsError) { globalErrors.push(artifactErrorMessage_(numberingSettingsError)); }
  try { artifactRequireSafeOutputFolder_(settings.outputFolderId, [settings.ledgerTemplateId, settings.certificateTemplateId], settings.allowedOutputEmails); }
  catch (folderError) { globalErrors.push(artifactErrorMessage_(folderError)); }
  var registryRows = [];
  try { registryRows = artifactReadAllRegistryRows_(settings.allowedOutputEmails); }
  catch (registryReadError) { globalErrors.push(artifactErrorMessage_(registryReadError)); }
  if (!globalErrors.length || registryRows.length) {
    try {
      artifactApplyMissing_(record, artifactFindRecordAssignments_(registryRows, artifactText_(record.recordId)));
      artifactAssertRecordNumberContinuity_(
        artifactRecordNumberState_(registryRows, artifactText_(record.recordId)), record, kinds
      );
    } catch (continuityError) {
      globalErrors.push(artifactErrorMessage_(continuityError));
    }
  }

  var checkedTemplates = {};
  for (var i = 0; i < kinds.length; i++) {
    var kind = kinds[i];
    var item = { kind: kind, label: RENEWAL_ARTIFACT.LABELS[kind], ready: false, errors: [], warnings: [] };
    artifactValidateCommon_(record, item.errors);
    artifactValidateKind_(kind, record, settings, schedules, item.errors, item.warnings);
    if (["ledger", "certificate", "dipsCsv"].indexOf(kind) >= 0) {
      artifactValidateCertificateDateContinuity_(registryRows, record, item.errors, item.warnings);
    }
    if (kind === "dipsCsv") {
      try {
        item.dipsSubmissionDeadline = artifactDipsSubmissionDeadline_(
          record.certificateIssuedDate, settings.dipsAdditionalClosedDates, RENEWAL_JAPAN_HOLIDAYS
        );
      } catch (ignoredDeadlineError) {
        item.dipsSubmissionDeadline = "";
      }
    }
    var templateId = "";
    try {
      templateId = artifactTemplateId_(kind, settings);
      if (templateId && !checkedTemplates[templateId]) {
        DriveApp.getFileById(templateId).getName();
        if (kind === "ledger") artifactAssertLedgerTemplateClean_(templateId);
        if (kind === "certificate") artifactAssertCertificateTemplateClean_(templateId);
        if (kind === "guidance") artifactAssertGuidanceTemplateClean_(templateId);
        if (kind === "training") artifactAssertTrainingTemplateClean_(templateId);
        checkedTemplates[templateId] = true;
      }
    } catch (templateError) {
      item.errors.push(artifactErrorMessage_(templateError));
    }
    item.ready = item.errors.length === 0;
    items.push(item);
  }
  var ready = globalErrors.length === 0;
  for (var j = 0; j < items.length; j++) if (!items[j].ready) ready = false;
  return { success: true, ready: ready, items: items, errors: globalErrors, warnings: globalWarnings };
}

function artifactValidateCommon_(record, errors) {
  if (record._recordIdMismatch) errors.push("保存データのidとrecordIdが一致しません。対象者を開いて保存し直してから作成してください。");
  if (!artifactText_(record.recordId)) errors.push("recordIdがありません。対象者をいったん保存してから作成してください。");
  if (!artifactText_(record.targetName || record.name || record.studentName)) errors.push("対象者名が必要です。");
}

function artifactValidateKind_(kind, record, settings, schedules, errors, warnings) {
  var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
  var classValue = artifactClassValue_(record.licenseClass);
  if (kind === "ledger" || kind === "certificate" || kind === "dipsCsv" || kind === "training") {
    if (!courseDate) errors.push("講習修了日が必要です。");
    if (!classValue) errors.push("資格区分は一等または二等を選択してください。");
    if (["なし", "あり"].indexOf(artifactText_(record.suspensionCourse)) < 0) {
      errors.push("停止処分者向け講習は「なし」または「あり」を確定してください。「未確認」のまま正式成果物は作成できません。");
    }
    if (["回転翼航空機（マルチローター）", "回転翼航空機（ヘリコプター）", "飛行機"].indexOf(artifactText_(record.aircraftType)) < 0) {
      errors.push("航空機の種類をマルチローター・ヘリコプター・飛行機のいずれかに確定してください。");
    }
    if (artifactText_(record.courseProvider) !== "CDP") {
      errors.push("【担当部署に確認が必要】CDP実施分以外の正式成果物はCDP名義で作成できません。講習実施機関を確認してください。");
    }
    artifactValidateEligibility_(record, artifactTodayIso_(), errors);
  }
  var usesCertificateNumber = ["ledger", "certificate", "dipsCsv"].indexOf(kind) >= 0;
  var certificateIssuedDate = "";
  if (usesCertificateNumber) {
    certificateIssuedDate = artifactValidateCertificateDates_(
      courseDate, record.certificateIssuedDate, artifactTodayIso_(), errors
    );
    if (kind === "ledger") {
      artifactValidateCertificateDelivery_(
        record.certificateDelivered,
        record.certificateDeliveredDate,
        certificateIssuedDate,
        artifactTodayIso_(),
        errors,
        warnings
      );
    }
  }
  if (usesCertificateNumber && !artifactText_(record.certificateNo)) {
    artifactValidateAutomaticNumberingForPreflight_(settings, certificateIssuedDate, "修了証明書番号", errors);
  }
  if (usesCertificateNumber && record.certificateNo && !/^UC0157\d{8}$/.test(artifactText_(record.certificateNo))) {
    errors.push("修了証明書番号は UC0157YYMMNNNN 形式で入力してください。");
  }
  if (usesCertificateNumber && record.certificateNo && certificateIssuedDate && artifactText_(record.certificateNo).indexOf("UC0157" + artifactYyMm_(certificateIssuedDate)) !== 0) {
    errors.push("修了証明書番号のYYMMは証明書発行日の年月と一致させてください。");
  }
  var dipsRecordMode = artifactText_(record.dipsRecordMode);
  if (kind === "dipsCsv" && record.dipsApplicantId && !/^\d{6}$/.test(artifactText_(record.dipsApplicantId))) {
    errors.push("DIPS申請者IDは YYMMNN の6桁で入力してください。");
  }
  if (kind === "dipsCsv" && !artifactText_(record.dipsApplicantId) && dipsRecordMode === "新規登録") {
    artifactValidateAutomaticNumberingForPreflight_(settings, courseDate, "DIPS申請者ID", errors);
  }
  if (kind === "dipsCsv" && !artifactText_(record.dipsApplicantId) && ["既存情報更新", "削除"].indexOf(dipsRecordMode) >= 0) {
    errors.push("DIPSの既存情報更新・削除には、登録済みのDIPS申請者IDを手入力してください。自動採番はできません。");
  }
  if (kind === "dipsCsv" && record.dipsApplicantId && courseDate && artifactText_(record.dipsApplicantId).indexOf(artifactYyMm_(courseDate)) !== 0) {
    errors.push("DIPS申請者IDのYYMMは講習修了日の年月と一致させてください。");
  }
  if (usesCertificateNumber && certificateIssuedDate && record.certificateExpiry) {
    var expectedExpiry = artifactAddCalendarMonthsMinusOne_(certificateIssuedDate);
    if (artifactText_(record.certificateExpiry) !== expectedExpiry) {
      warnings.push("修了証明書有効期限は証明書発行日から3暦月後の応当日前日（応当日がない月は月末、" + expectedExpiry + "）で作成します。");
    }
  }

  if (kind === "certificate") {
    if (!/^\d{10}$/.test(artifactText_(record.skillsApplicantNo))) errors.push("技能証明申請者番号は10桁で入力してください。");
    if (!artifactText_(record.certificateInstructor)) errors.push("修了証明書の担当講師が必要です。");
    artifactRequireIssuer_(settings, errors, false, false);
  } else if (kind === "dipsCsv") {
    if (!/^\d{10}$/.test(artifactText_(record.skillsApplicantNo))) errors.push("技能証明申請者番号は10桁で入力してください。");
    if (["なし", "あり"].indexOf(artifactText_(record.suspensionCourse)) < 0) errors.push("停止処分者向け講習は「なし」または「あり」を選択してください。");
    if (["新規登録", "既存情報更新", "削除"].indexOf(dipsRecordMode) < 0) errors.push("DIPS状態フラグは「新規登録」「既存情報更新」「削除」のいずれかを選択してください。");
    if (dipsRecordMode === "削除") warnings.push("DIPS削除データです。対象IDと削除理由を担当者が再確認し、手動アップロード後もシステム状態は自動変更しません。");
    artifactValidateDipsSubmission_(settings, certificateIssuedDate, record.dipsCompletionLinkedDate, artifactTodayIso_(), errors, warnings);
    warnings.push("DIPSからダウンロードする最新の公式CSVひな形とは未照合です。アップロード前に11列の名称・順序を公式ひな形と照合してください。");
  } else if (kind === "guidance") {
    if (!classValue) errors.push("案内の対象資格として一等または二等を選択してください。");
    if (!artifactValidIsoDateOrBlank_(record.licenseExpiry)) errors.push("現在の免許期限が必要です。");
    if (!artifactValidIsoDateOrBlank_(record.courseAvailableDate)) errors.push("講習実施可能日が必要です。");
    if (!artifactValidIsoDateOrBlank_(record.courseDeadlineDate)) errors.push("講習締切日が必要です。");
    artifactValidateBillingAmounts_(record, errors);
    artifactValidateTaxException_(record, artifactTodayIso_(), errors);
    if ([0, 8].indexOf(Number(record.taxRate)) >= 0) warnings.push("標準税率10%以外を使用します。承認日・承認者・根拠を案内送付前に経理担当者が再確認してください。");
    artifactValidateSchedules_(schedules, record, errors);
    artifactRequireIssuer_(settings, errors, true, false);
  } else if (kind === "training") {
    if (artifactText_(record.aircraftType) !== "回転翼航空機（マルチローター）") {
      errors.push("講習記録簿の自動作成と最低時間判定は、回転翼航空機（マルチローター）のみ対応しています。");
    }
    if (!artifactText_(record.courseVenue)) errors.push("学科講習の会場が必要です。");
    if (artifactText_(record.suspensionCourse) === "あり" && !artifactText_(record.practicalVenue || record.courseVenue)) errors.push("停止処分者向け実地講習の場所が必要です。");
    artifactValidateTraining_(record, classValue, errors, warnings, artifactTodayIso_());
  } else if (kind === "billing") {
    if (!artifactText_(record.billingRecipientName || record.targetName)) errors.push("見積・請求先名が必要です。");
    artifactValidateBillingAmounts_(record, errors);
    artifactValidateTaxException_(record, artifactTodayIso_(), errors);
    if ([0, 8].indexOf(Number(record.taxRate)) >= 0) warnings.push("標準税率10%以外を使用します。承認日・承認者・根拠を請求書送付前に経理担当者が再確認してください。");
    if (["御中", "様"].indexOf(artifactText_(record.billingHonorific)) < 0) errors.push("敬称は「御中」または「様」を選択してください。");
    artifactValidateBillingDatesAndNumbers_(record, errors);
    artifactRequireIssuer_(settings, errors, false, true);
  }
}

function artifactValidateCertificateDates_(courseDate, issuedDateValue, todayIso, errors) {
  var issuedText = artifactText_(issuedDateValue);
  if (!issuedText) {
    errors.push("証明書発行日が必要です。");
    return "";
  }
  var issuedDate = artifactValidIsoDateOrBlank_(issuedText);
  if (!issuedDate) {
    errors.push("証明書発行日はyyyy-MM-dd形式の実在日で入力してください。");
    return "";
  }
  var validCourseDate = artifactValidIsoDateOrBlank_(courseDate);
  if (validCourseDate && issuedDate < validCourseDate) {
    errors.push("証明書発行日は講習修了日以後にしてください。");
  }
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (today && issuedDate > today) {
    errors.push("証明書発行日に未来日は指定できません。");
  }
  return issuedDate;
}

function artifactValidateCertificateDelivery_(deliveryState, deliveredDateValue, issuedDate, todayIso, errors, warnings) {
  var state = artifactText_(deliveryState);
  var deliveredText = artifactText_(deliveredDateValue);
  if (["未確認", "有り", "無し"].indexOf(state) < 0) {
    errors.push("証明書交付状態は「未確認」「有り」「無し」のいずれかで入力してください。");
  }
  if (state === "有り" && !deliveredText) {
    errors.push("交付状態が「有り」の場合は、証明書交付日が必要です。");
    return "";
  }
  if (!deliveredText) return "";
  if (state !== "有り") {
    errors.push("証明書交付日を入力する場合は、交付状態を「有り」にしてください。");
  }
  var deliveredDate = artifactValidIsoDateOrBlank_(deliveredText);
  if (!deliveredDate) {
    errors.push("証明書交付日はyyyy-MM-dd形式の実在日で入力してください。");
    return "";
  }
  var validIssuedDate = artifactValidIsoDateOrBlank_(issuedDate);
  if (validIssuedDate && deliveredDate < validIssuedDate) {
    errors.push("証明書交付日は証明書発行日以後にしてください。");
  }
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (today && deliveredDate > today) {
    errors.push("交付済みの証明書交付日に未来日は指定できません。");
  }
  return deliveredDate;
}

/** 正式成果物の前提となる、受講開始時の本人・対象講習照合を検査する。 */
function artifactValidateEligibility_(record, todayIso, errors) {
  record = record || {};
  if (artifactText_(record.eligibilityCheckStatus) !== "一致確認済み") {
    errors.push("正式成果物の作成には、受講開始時の本人・対象講習照合を「一致確認済み」にしてください。");
  }
  var checkedText = artifactText_(record.eligibilityCheckedDate);
  var checkedDate = artifactValidIsoDateOrBlank_(checkedText);
  if (!checkedText) {
    errors.push("受講開始時の照合日が必要です。");
  } else if (!checkedDate) {
    errors.push("受講開始時の照合日はyyyy-MM-dd形式の実在日で入力してください。");
  } else {
    var today = artifactValidIsoDateOrBlank_(todayIso);
    if (today && checkedDate > today) errors.push("受講開始時の照合日に未来日は指定できません。");
    var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
    if (courseDate && checkedDate > courseDate) errors.push("受講開始時の照合日は講習修了日以前にしてください。事後照合では正式成果物を作成できません。");
  }
  if (!artifactText_(record.eligibilityCheckedBy)) errors.push("受講開始時の照合者が必要です。");
  if (!artifactText_(record.eligibilityEvidence)) errors.push("受講開始時の照合証憑参照が必要です。");
  return checkedDate;
}

function artifactEligibilityMetadata_(record) {
  record = record || {};
  return {
    status: artifactText_(record.eligibilityCheckStatus),
    checkedDate: artifactText_(record.eligibilityCheckedDate),
    checkedBy: artifactText_(record.eligibilityCheckedBy),
    evidence: artifactText_(record.eligibilityEvidence)
  };
}

function artifactQualificationContextMetadata_(record) {
  record = record || {};
  return {
    licenseClass: artifactText_(record.licenseClass),
    aircraftType: artifactText_(record.aircraftType),
    suspensionCourse: artifactText_(record.suspensionCourse),
    courseProvider: artifactText_(record.courseProvider)
  };
}

function artifactTaxExceptionMetadata_(record) {
  record = record || {};
  return {
    approvalDate: artifactText_(record.taxExceptionApprovalDate),
    approvedBy: artifactText_(record.taxExceptionApprovedBy),
    reason: artifactText_(record.taxExceptionReason)
  };
}

function artifactValidateBillingAmounts_(record, errors) {
  var rawFee = artifactStrictNumber_(record.feeExTax, false);
  var rawDiscount = artifactStrictNumber_(record.discountExTax, true);
  if (!isFinite(rawFee)) errors.push("料金（税抜）は数値で入力してください。");
  else if (!artifactIsSafeInteger_(rawFee)) errors.push("料金（税抜）は安全に計算できる整数円で入力してください。");
  else if (rawFee < 0) errors.push("料金（税抜）は0円以上で入力してください。");
  else if (rawFee === 0) errors.push("料金（税抜）は1円以上で入力してください。");
  if (!isFinite(rawDiscount)) errors.push("値引（税抜）は数値で入力してください。");
  else if (!artifactIsSafeInteger_(rawDiscount)) errors.push("値引（税抜）は安全に計算できる整数円で入力してください。");
  else if (rawDiscount < 0) errors.push("値引（税抜）は0円以上で入力してください。");
  if (isFinite(rawFee) && isFinite(rawDiscount) && rawDiscount > rawFee) errors.push("値引（税抜）は料金（税抜）以下にしてください。");
  var rawTaxRate = artifactStrictNumber_(record.taxRate, false);
  if ([0, 8, 10].indexOf(rawTaxRate) < 0) errors.push("消費税率は0%、8%、10%のいずれかにしてください。");
  if (["切捨て", "四捨五入", "切上げ"].indexOf(artifactText_(record.taxRounding)) < 0) errors.push("消費税の端数処理を選択してください。");
}

function artifactIsSafeInteger_(value) {
  return isFinite(value) && Math.floor(value) === value && Math.abs(value) <= 9007199254740991;
}

function artifactValidateBillingDatesAndNumbers_(record, errors) {
  var quoteDate = artifactValidateOptionalIso_(record.quoteDate, "見積日", errors);
  var quoteExpiry = artifactValidateOptionalIso_(record.quoteExpiry, "見積有効期限", errors);
  var invoiceDate = artifactValidateOptionalIso_(record.invoiceDate, "請求日", errors);
  var accountingDate = artifactValidateOptionalIso_(record.accountingDate, "取引年月日（役務提供日）", errors);
  var paymentDue = artifactValidateOptionalIso_(record.paymentDueDate, "入金期限", errors);
  if (!artifactText_(record.accountingDate)) errors.push("適格請求書の取引年月日（役務提供日）が必要です。");
  if (!artifactText_(record.paymentDueDate)) errors.push("請求書の入金期限は契約条件に基づいて明示入力してください。");
  if (quoteDate && quoteExpiry && quoteExpiry < quoteDate) errors.push("見積有効期限は見積日以後にしてください。");
  if (invoiceDate && paymentDue && paymentDue < invoiceDate) errors.push("入金期限は請求日以後にしてください。");

  var namespace = RENEWAL_ARTIFACT.BILLING_NUMBER_NAMESPACE;
  var quoteNo = artifactText_(record.quoteNo);
  var quoteFormatValid = !quoteNo || artifactIsAllowedBillingNumber_(quoteNo, "QT", namespace);
  if (quoteNo && !quoteFormatValid) errors.push("見積書番号は QT-UC0157-yyyyMMdd-N 形式、または移行済みの正式番号 QT-yyyyMMdd-N 形式で入力してください。");
  if (quoteNo && !quoteDate) errors.push("見積書番号を手入力する場合は見積日が必要です。");
  if (quoteNo && quoteDate && quoteFormatValid && !artifactBillingNumberMatchesDate_(quoteNo, "QT", namespace, quoteDate)) errors.push("見積書番号の日付部を見積日と一致させてください。");

  var invoiceNo = artifactText_(record.invoiceNo);
  var invoiceFormatValid = !invoiceNo || artifactIsAllowedBillingNumber_(invoiceNo, "INV", namespace);
  if (invoiceNo && !invoiceFormatValid) errors.push("請求書番号は INV-UC0157-yyyyMMdd-N 形式、または移行済みの正式番号 INV-yyyyMMdd-N 形式で入力してください。");
  if (invoiceNo && !invoiceDate) errors.push("請求書番号を手入力する場合は請求日が必要です。");
  if (invoiceNo && invoiceDate && invoiceFormatValid && !artifactBillingNumberMatchesDate_(invoiceNo, "INV", namespace, invoiceDate)) errors.push("請求書番号の日付部を請求日と一致させてください。");
}

function artifactValidateTaxException_(record, todayIso, errors) {
  var taxRate = artifactStrictNumber_(record.taxRate, false);
  if ([0, 8].indexOf(taxRate) < 0) return;
  var approvalText = artifactText_(record.taxExceptionApprovalDate);
  var approvalDate = artifactValidIsoDateOrBlank_(approvalText);
  if (!approvalText) errors.push("税率" + taxRate + "%を使用する場合は税率例外の承認日が必要です。");
  else if (!approvalDate) errors.push("税率例外の承認日はyyyy-MM-dd形式の実在日で入力してください。");
  else {
    var today = artifactValidIsoDateOrBlank_(todayIso);
    if (today && approvalDate > today) errors.push("税率例外の承認日に未来日は指定できません。");
  }
  if (!artifactText_(record.taxExceptionApprovedBy)) errors.push("税率" + taxRate + "%を使用する場合は税率例外の承認者が必要です。");
  if (!artifactText_(record.taxExceptionReason)) errors.push("税率" + taxRate + "%を使用する場合は税率例外の根拠が必要です。");
}

function artifactIsAllowedBillingNumber_(number, documentCode, namespace) {
  var value = artifactText_(number);
  var code = artifactText_(documentCode);
  var namespaceText = artifactText_(namespace);
  if (["QT", "INV"].indexOf(code) < 0 || !namespaceText) return false;
  var dedicated = new RegExp("^" + code + "-" + namespaceText + "-\\d{8}-\\d+$");
  var legacy = new RegExp("^" + code + "-\\d{8}-\\d+$");
  return dedicated.test(value) || legacy.test(value);
}

function artifactBillingNumberMatchesDate_(number, documentCode, namespace, isoDate) {
  var value = artifactText_(number);
  var date = artifactValidIsoDateOrBlank_(isoDate);
  if (!date || !artifactIsAllowedBillingNumber_(value, documentCode, namespace)) return false;
  var dedicatedPrefix = artifactComposeBillingNumberPrefix_(documentCode, namespace, date);
  var legacyPrefix = artifactText_(documentCode) + "-" + date.replace(/-/g, "") + "-";
  return value.indexOf(dedicatedPrefix) === 0 || value.indexOf(legacyPrefix) === 0;
}

function artifactValidateOptionalIso_(value, label, errors) {
  if (!artifactText_(value)) return "";
  var valid = artifactValidIsoDateOrBlank_(value);
  if (!valid) errors.push(label + "はyyyy-MM-dd形式の実在日で入力してください。");
  return valid;
}

function artifactRequireIssuer_(settings, errors, requireEmail, requireBank) {
  if (!artifactText_(settings.issuerCompany)) errors.push("事業者設定の事業者名が必要です。");
  if ((requireEmail || requireBank) && !artifactText_(settings.issuerAddress)) errors.push("事業者設定の住所が必要です。");
  if ((requireEmail || requireBank) && !artifactText_(settings.issuerPhone)) errors.push("事業者設定の電話番号が必要です。");
  if (requireEmail && !artifactText_(settings.issuerEmail)) errors.push("案内作成には事業者設定の申込先メールが必要です。");
  if (requireEmail && settings.issuerEmail && !artifactIsEmail_(settings.issuerEmail)) errors.push("申込先メールの形式が正しくありません。");
  if (requireBank && !artifactText_(settings._bankAccountText)) errors.push("請求書作成には事業者設定の振込先が必要です。");
  if (requireBank && !/^T\d{13}$/.test(artifactText_(settings.invoiceRegistrationNo))) errors.push("請求書作成にはT＋13桁の適格請求書発行事業者登録番号が必要です。");
}

function artifactValidateSchedules_(schedules, record, errors) {
  if (!Array.isArray(schedules) || schedules.length !== 4) {
    errors.push("案内の日程マスタは4行登録してください。");
    return;
  }
  var start = artifactText_(record.courseAvailableDate);
  var end = artifactText_(record.courseDeadlineDate);
  if (start && end && start > end) errors.push("講習実施可能日は講習締切日以前にしてください。");
  for (var i = 0; i < 4; i++) {
    var row = schedules[i] || {};
    if (!artifactValidIsoDateOrBlank_(row.date)) errors.push("日程マスタ" + (i + 1) + "行目の日付が必要です。");
    if (!artifactText_(row.venue)) errors.push("日程マスタ" + (i + 1) + "行目の会場が必要です。");
    if (!row.morning && !row.afternoon && !row.evening) errors.push("日程マスタ" + (i + 1) + "行目は受付可能な時間帯を1つ以上選択してください。");
    if (row.date && start && row.date < start) errors.push("日程マスタ" + (i + 1) + "行目が講習実施可能日より前です。");
    if (row.date && end && row.date > end) errors.push("日程マスタ" + (i + 1) + "行目が講習締切日より後です。");
  }
}

function artifactValidateTraining_(record, classValue, errors, warnings, todayIso) {
  var requiresPractical = artifactText_(record.suspensionCourse) === "あり";
  var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (!courseDate) errors.push("講習記録簿には実在する講習修了日が必要です。");
  else if (today && courseDate > today) errors.push("実施前の講習記録簿は作成できません。講習修了日は今日以前にしてください。");
  var common = [
    ["academicOverview", "技能証明制度の概要"],
    ["academicRules", "操縦者が遵守すべき事項"],
    ["academicLawUpdate", "最近の制度改正"],
    ["academicAccident", "事故・重大インシデント事例"],
    ["academicSafety", "運航ルール・事故防止"],
    ["academicVideo", "動画（共通）"]
  ];
  if (classValue === 1) {
    common.push(["academicFirstClass", "一等操縦士が留意すべき事項"]);
    common.push(["academicFirstClassVideo", "動画（一等）"]);
  }
  if (requiresPractical) {
    common.push(["practicalExercise1", "実地・操縦演習"]);
    common.push(["practicalDiscussion", "実地・指導及び質疑応答"]);
  }
  for (var i = 0; i < common.length; i++) {
    var prefix = common[i][0];
    var missing = [];
    var moduleDate = artifactValidIsoDateOrBlank_(record[prefix + "Date"]);
    if (!moduleDate) missing.push("受講日");
    if (!artifactText_(record[prefix + "Start"])) missing.push("開始");
    if (!artifactText_(record[prefix + "End"])) missing.push("終了");
    if (!artifactText_(record[prefix + "Instructor"])) missing.push("担当者");
    if (missing.length) errors.push(common[i][1] + "の" + missing.join("・") + "が必要です。");
    if (record[prefix + "Start"] && !artifactValidTime_(record[prefix + "Start"])) errors.push(common[i][1] + "の開始時刻は00:00～23:59の形式で入力してください。");
    if (record[prefix + "End"] && !artifactValidTime_(record[prefix + "End"])) errors.push(common[i][1] + "の終了時刻は00:00～23:59の形式で入力してください。");
    if (moduleDate && today && moduleDate > today) errors.push(common[i][1] + "の受講日は今日以前にしてください。");
    if (moduleDate && courseDate && moduleDate > courseDate) errors.push(common[i][1] + "の受講日は講習修了日以前にしてください。");
    var minutes = artifactDurationMinutes_(record[prefix + "Start"], record[prefix + "End"]);
    if (isFinite(minutes) && minutes <= 0) errors.push(common[i][1] + "の終了時刻は開始時刻より後にしてください。");
  }
  var overlaps = artifactFindTrainingOverlaps_(record, common);
  for (var overlapIndex = 0; overlapIndex < overlaps.length; overlapIndex++) {
    var overlap = overlaps[overlapIndex];
    errors.push(
      overlap.date + "の「" + overlap.leftLabel + "」（" + overlap.leftStart + "～" + overlap.leftEnd +
      "）と「" + overlap.rightLabel + "」（" + overlap.rightStart + "～" + overlap.rightEnd +
      "）の講習時間が重複しています。"
    );
  }
  var firstFive = ["academicOverview", "academicRules", "academicLawUpdate", "academicAccident", "academicSafety"];
  var total = 0;
  for (var j = 0; j < firstFive.length; j++) {
    var duration = artifactDurationMinutes_(record[firstFive[j] + "Start"], record[firstFive[j] + "End"]);
    if (isFinite(duration)) total += Math.max(0, duration);
  }
  if (total < 30) errors.push("共通学科5項目の講習時間合計は30分以上必要です。");
  artifactRequireMinutes_(record, "academicVideo", 20, "共通動画", errors);
  if (classValue === 1) {
    artifactRequireMinutes_(record, "academicFirstClass", 15, "一等留意事項", errors);
    artifactRequireMinutes_(record, "academicFirstClassVideo", 10, "一等動画", errors);
  }
  if (requiresPractical) {
    artifactRequireMinutes_(record, "practicalExercise1", classValue === 1 ? 5 : 6, "実地・操縦演習", errors);
    artifactRequireMinutes_(record, "practicalDiscussion", classValue === 1 ? 10 : 5, "実地・指導及び質疑応答", errors);
  } else {
    var practicalFields = [
      "practicalExercise1Date", "practicalExercise1Start", "practicalExercise1End", "practicalExercise1Instructor",
      "practicalDiscussionDate", "practicalDiscussionStart", "practicalDiscussionEnd", "practicalDiscussionInstructor",
      "practicalVenue"
    ];
    for (var practicalIndex = 0; practicalIndex < practicalFields.length; practicalIndex++) {
      if (artifactText_(record[practicalFields[practicalIndex]])) {
        warnings.push("停止処分者向け講習が「なし」のため、入力済みの実地講習情報は講習記録簿へ出力しません。");
        break;
      }
    }
  }
  if (courseDate) {
    for (var k = 0; k < common.length; k++) {
      var dateValue = artifactValidIsoDateOrBlank_(record[common[k][0] + "Date"]);
      if (dateValue && dateValue < courseDate) {
        warnings.push(common[k][1] + "の受講日が講習修了日と異なります。記録簿には入力値を出力します。");
      }
    }
  }
}

function artifactFindTrainingOverlaps_(record, modules) {
  var slots = [];
  for (var i = 0; i < modules.length; i++) {
    var prefix = modules[i][0];
    var date = artifactValidIsoDateOrBlank_(record[prefix + "Date"]);
    var start = artifactText_(record[prefix + "Start"]);
    var end = artifactText_(record[prefix + "End"]);
    var duration = artifactDurationMinutes_(start, end);
    if (!date || !isFinite(duration) || duration <= 0) continue;
    slots.push({
      label: modules[i][1],
      date: date,
      start: start,
      end: end,
      startMinutes: artifactTimeMinutes_(start),
      endMinutes: artifactTimeMinutes_(end)
    });
  }
  var overlaps = [];
  for (var left = 0; left < slots.length; left++) {
    for (var right = left + 1; right < slots.length; right++) {
      var a = slots[left];
      var b = slots[right];
      if (a.date !== b.date) continue;
      // 半開区間 [開始, 終了) として比較するため、終了=次開始は重複にならない。
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        overlaps.push({
          date: a.date,
          leftLabel: a.label,
          leftStart: a.start,
          leftEnd: a.end,
          rightLabel: b.label,
          rightStart: b.start,
          rightEnd: b.end
        });
      }
    }
  }
  return overlaps;
}

function artifactRequireMinutes_(record, prefix, minimum, label, errors) {
  var minutes = artifactDurationMinutes_(record[prefix + "Start"], record[prefix + "End"]);
  if (isFinite(minutes) && minutes < minimum) {
    errors.push(label + "は" + minimum + "分以上必要です。");
  }
}

function artifactFlattenDocumentTabs_(tabs) {
  var result = [];
  function visit(list) {
    list = Array.isArray(list) ? list : [];
    for (var i = 0; i < list.length; i++) {
      var tab = list[i];
      result.push(tab);
      var children = [];
      try { children = tab.getChildTabs() || []; }
      catch (childTabError) { throw new Error("修了証明書原本の子タブ構成を確認できません。"); }
      visit(children);
    }
  }
  visit(tabs);
  return result;
}

function artifactAssertTemplateFolderSafe_(folder) {
  if (!folder) throw new Error("専用原本フォルダを確認できません。");
  try {
    if (folder.isTrashed()) throw new Error("専用原本フォルダがゴミ箱にあります。");
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
      throw new Error("専用原本フォルダが「制限付き」ではありません。");
    }
    artifactHardenNewDriveItem_(folder, "専用原本フォルダ");
    if (folder.getEditors().length || folder.getViewers().length) {
      throw new Error("専用原本フォルダは所有者以外と共有されています。共有を解除してから再実行してください。");
    }
  } catch (error) {
    var message = artifactErrorMessage_(error);
    if (message.indexOf("専用原本フォルダ") >= 0) throw error;
    throw new Error("専用原本フォルダの非公開設定を確認できません。");
  }
  return folder;
}

function artifactEnsureTemplateFolder_(storedFolderId) {
  var id = artifactExtractDriveId_(storedFolderId);
  if (id) {
    try { return artifactAssertTemplateFolderSafe_(DriveApp.getFolderById(id)); }
    catch (storedFolderError) {
      throw new Error("保存済みの専用原本フォルダを安全確認できません。削除・移動・共有設定を確認してください。");
    }
  }

  var root = DriveApp.getRootFolder();
  var matches = root.getFoldersByName(RENEWAL_ARTIFACT.TEMPLATE_FOLDER_NAME);
  var reusable = [];
  while (matches.hasNext()) {
    var candidate = matches.next();
    try {
      artifactAssertTemplateFolderSafe_(candidate);
      reusable.push(candidate);
    } catch (ignoredUnsafeFolder) {}
  }
  if (reusable.length > 1) {
    throw new Error("My Drive直下に安全な専用原本フォルダが複数あります。重複を整理してから再実行してください。");
  }
  if (reusable.length === 1) return reusable[0];

  var folder = root.createFolder(RENEWAL_ARTIFACT.TEMPLATE_FOLDER_NAME);
  return artifactAssertTemplateFolderSafe_(folder);
}

function artifactRemoveCreatedFilePermanently_(file) {
  if (!file) return;
  var id = "";
  try { id = artifactText_(file.getId()); } catch (ignoredIdError) {}
  if (!id) return;
  try {
    Drive.Files.remove(id);
  } catch (removeError) {
    try {
      file.setTrashed(true);
    } catch (trashError) {
      throw new Error(
        "作成途中の専用原本を削除できませんでした。Driveで次のIDを確認してください: " + id +
        "（完全削除: " + artifactErrorMessage_(removeError) +
        "／ゴミ箱移動: " + artifactErrorMessage_(trashError) + "）"
      );
    }
  }
}

function artifactProvisionLedgerTemplate_(templateFolder) {
  var outputFile = null;
  try {
    var source = SpreadsheetApp.openById(RENEWAL_ARTIFACT.BLOCKED_TEMPLATE_IDS.ledger);
    var sourceBase = source.getSheetByName("ベース");
    if (!sourceBase) throw new Error("発行台帳の参照元に「ベース」シートがありません。");

    var output = SpreadsheetApp.create("更新講習修了証明書発行台帳_清浄原本");
    outputFile = DriveApp.getFileById(output.getId());
    outputFile.moveTo(templateFolder);
    artifactHardenNewDriveItem_(outputFile, "発行台帳専用原本");

    var copiedBase = sourceBase.copyTo(output);
    copiedBase.setName("ベース");
    var sheets = output.getSheets();
    for (var sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
      if (sheets[sheetIndex].getSheetId() !== copiedBase.getSheetId()) output.deleteSheet(sheets[sheetIndex]);
    }

    var maxRows = copiedBase.getMaxRows();
    var maxColumns = copiedBase.getMaxColumns();
    if (maxColumns < 13) copiedBase.insertColumnsAfter(maxColumns, 13 - maxColumns);
    if (copiedBase.getMaxColumns() > 13) {
      copiedBase.deleteColumns(14, copiedBase.getMaxColumns() - 13);
    }
    maxColumns = copiedBase.getMaxColumns();
    copiedBase.getRange(1, 1, maxRows, maxColumns).clearNote();
    if (maxRows > 1) copiedBase.getRange(2, 1, maxRows - 1, 1).clearContent();
    if (maxColumns > 9) copiedBase.getRange(1, 10, maxRows, maxColumns - 9).clearContent();
    if (maxRows >= 3) {
      copiedBase.getRange(3, 2, maxRows - 2, 8).clearContent();
      var deliveryPlaceholders = [];
      for (var rowIndex = 3; rowIndex <= maxRows; rowIndex++) deliveryPlaceholders.push(["□有り　・　□無し"]);
      copiedBase.getRange(3, 6, deliveryPlaceholders.length, 1).setValues(deliveryPlaceholders);
    }
    copiedBase.getCharts().forEach(function(chart) { copiedBase.removeChart(chart); });
    copiedBase.getDrawings().forEach(function(drawing) { drawing.remove(); });
    copiedBase.getImages().forEach(function(image) { image.remove(); });
    output.setSpreadsheetTimeZone("Asia/Tokyo");
    SpreadsheetApp.flush();

    artifactAssertLedgerTemplateClean_(output.getId());
    return outputFile;
  } catch (error) {
    artifactRemoveCreatedFilePermanently_(outputFile);
    throw error;
  }
}

function artifactCertificateTabsToDelete_(rootTabs, retainedId) {
  var requests = [];
  var roots = Array.isArray(rootTabs) ? rootTabs : [];
  for (var rootIndex = 0; rootIndex < roots.length; rootIndex++) {
    var root = roots[rootIndex];
    if (root.getId() !== retainedId) {
      requests.push({ deleteTab: { tabId: root.getId() } });
      continue;
    }
    var children = root.getChildTabs() || [];
    for (var childIndex = 0; childIndex < children.length; childIndex++) {
      requests.push({ deleteTab: { tabId: children[childIndex].getId() } });
    }
  }
  return requests;
}

function artifactProvisionCertificateTemplate_(templateFolder) {
  if (typeof Docs === "undefined" || !Docs.Documents || typeof Docs.Documents.batchUpdate !== "function") {
    throw new Error("専用証明書原本の準備に必要なAdvanced Google Docs API v1が有効ではありません。");
  }

  var tempFile = null;
  var finalFile = null;
  try {
    tempFile = DriveApp.getFileById(RENEWAL_ARTIFACT.BLOCKED_TEMPLATE_IDS.certificate)
      .makeCopy("一時_修了証明書原本清浄化_" + Utilities.getUuid(), templateFolder);
    artifactHardenNewDriveItem_(tempFile, "一時修了証明書原本");

    var tempDocument = DocumentApp.openById(tempFile.getId());
    var rootTabs = tempDocument.getTabs();
    var baseRootFound = false;
    for (var rootIndex = 0; rootIndex < rootTabs.length; rootIndex++) {
      if (rootTabs[rootIndex].getId() === RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID) baseRootFound = true;
    }
    if (!baseRootFound) throw new Error("修了証明書参照元の先頭ベースタブ t.0 を確認できません。");
    var requests = artifactCertificateTabsToDelete_(
      rootTabs,
      RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID
    );
    tempDocument.saveAndClose();
    requests.push({
      updateDocumentTabProperties: {
        tabProperties: {
          tabId: RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID,
          title: "ベース"
        },
        fields: "title"
      }
    });
    Docs.Documents.batchUpdate({ requests: requests }, tempFile.getId());

    var cleanDocument = DocumentApp.openById(tempFile.getId());
    var cleanTab = artifactGetDocumentTab_(cleanDocument, RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID);
    var body = cleanTab.asDocumentTab().getBody();
    artifactReplaceRequiredText_(body, "第[ 　\\t]*UC[0-9]+[ 　\\t]*号", "第　UC0157　号", "修了証明書番号");
    artifactReplaceRequiredText_(body, "[0-9]{4}年[ 　\\t]*[0-9]{1,2}月[ 　\\t]*[0-9]{1,2}日[ 　\\t]*修了", "2000年 1月 1日 修了", "講習修了日");
    artifactReplaceRequiredText_(body, "[0-9]{4}年[ 　\\t]*[0-9]{1,2}月[ 　\\t]*[0-9]{1,2}日[ 　\\t]*まで有効", "2000年 4月 1日 まで有効", "有効期限");
    artifactReplaceRequiredText_(body, "^[^\\n\\r\\u000b]*殿$", "　　　殿", "受講者氏名");
    artifactReplaceRequiredText_(body, "技能証明申請者番号：[^\\n\\r\\u000b]*", "技能証明申請者番号：0000000000", "技能証明申請者番号");
    artifactReplaceRequiredText_(body, "担当講師：[^\\n\\r\\u000b]*", "担当講師：", "担当講師");
    artifactReplaceRequiredText_(body, "登録更新講習機関名[ 　]*株式会社[^\\n\\r\\u000b]*", "登録更新講習機関名 株式会社", "登録更新講習機関名");
    artifactReplaceRequiredText_(body, "登録更新講習機関コード：[^\\n\\r\\u000b]*", "登録更新講習機関コード：", "登録更新講習機関コード");

    var tables = body.getTables();
    var matching = [];
    for (var tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      try {
        matching.push({
          table: tables[tableIndex],
          selection: artifactCertificateTableSelection_(
            artifactDocTableMatrix_(tables[tableIndex]),
            "回転翼航空機（マルチローター）",
            "一等"
          )
        });
      } catch (ignoredTableMismatch) {}
    }
    if (matching.length !== 1) throw new Error("修了証明書参照元の区分表を一意に確認できません。");
    for (var selectionIndex = 0; selectionIndex < matching[0].selection.allCells.length; selectionIndex++) {
      var position = matching[0].selection.allCells[selectionIndex];
      artifactSetDocCellText_(
        matching[0].table.getRow(position.row).getCell(position.column),
        ""
      );
    }
    cleanDocument.saveAndClose();
    artifactAssertCertificateTemplateClean_(tempFile.getId());

    finalFile = tempFile.makeCopy("更新講習修了証明書_清浄原本", templateFolder);
    artifactHardenNewDriveItem_(finalFile, "修了証明書専用原本");
    artifactAssertCertificateTemplateClean_(finalFile.getId());
    artifactRemoveCreatedFilePermanently_(tempFile);
    tempFile = null;
    return finalFile;
  } catch (error) {
    artifactRemoveCreatedFilePermanently_(tempFile);
    artifactRemoveCreatedFilePermanently_(finalFile);
    throw error;
  }
}

function artifactCertificateTemplateMissingSentinels_(textValue) {
  var text = String(textValue === null || textValue === undefined ? "" : textValue);
  var checks = [
    ["証明書番号", /第[ 　\t]*UC0157[ 　\t]*号/],
    ["講習修了日", /2000年[ 　\t]*1月[ 　\t]*1日[ 　\t]*修了/],
    ["有効期限", /2000年[ 　\t]*4月[ 　\t]*1日[ 　\t]*まで有効/],
    ["技能証明申請者番号", /技能証明申請者番号：[ 　\t]*0000000000/],
    ["担当講師", /担当講師：[ 　\t]*(?:[\n\r\u000b]|$)/]
  ];
  var missing = [];
  for (var i = 0; i < checks.length; i++) if (!checks[i][1].test(text)) missing.push(checks[i][0]);
  var blankNameLines = text.split(/[\n\r\u000b]+/).filter(function(line) { return /^[ 　\t]*殿$/.test(line); });
  if (blankNameLines.length !== 1) missing.push("受講者氏名");
  return missing;
}

function artifactAssertDocumentTabPeripheralClean_(tab, label) {
  var documentTab;
  try { documentTab = tab.asDocumentTab(); }
  catch (tabError) { throw new Error(label + "原本の文書タブを確認できません。"); }
  var header = documentTab.getHeader();
  var footer = documentTab.getFooter();
  var footnotes = documentTab.getFootnotes() || [];
  if (
    (header && artifactText_(header.getText())) ||
    (footer && artifactText_(footer.getText())) ||
    footnotes.length
  ) {
    throw new Error(label + "原本のヘッダー・フッター・脚注に想定外データがあります。無個人情報の専用原本へ差し替えてください。");
  }
  return true;
}

function artifactAssertTrustedSharedTemplate_(kind, templateId) {
  var expectedId = artifactExtractDriveFileId_(RENEWAL_ARTIFACT.TEMPLATE_IDS[kind]);
  var expectedModifiedTime = artifactText_(RENEWAL_ARTIFACT.TRUSTED_TEMPLATE_MODIFIED_TIMES[kind]);
  var id = artifactExtractDriveFileId_(templateId);
  if (!expectedId || id !== expectedId || !expectedModifiedTime) {
    throw new Error((RENEWAL_ARTIFACT.LABELS[kind] || "共有原本") + "の承認版識別情報が一致しません。");
  }
  var state;
  try {
    state = Drive.Files.get(id, {
      fields: "id,modifiedTime,trashed",
      supportsAllDrives: true
    });
  } catch (stateError) {
    throw new Error((RENEWAL_ARTIFACT.LABELS[kind] || "共有原本") + "のDrive版情報を確認できません。");
  }
  if (
    !state ||
    artifactText_(state.id) !== id ||
    state.trashed === true ||
    artifactText_(state.modifiedTime) !== expectedModifiedTime
  ) {
    throw new Error(
      (RENEWAL_ARTIFACT.LABELS[kind] || "共有原本") +
      "が承認版から更新されています。全領域の個人情報不存在と差込構造を再確認し、承認時刻を更新するまで作成を停止します。"
    );
  }
  return true;
}

function artifactAssertCertificateTemplateClean_(templateId) {
  var id = artifactTemplateId_("certificate", { certificateTemplateId: templateId });
  var doc;
  try { doc = DocumentApp.openById(id); }
  catch (openError) { throw new Error("修了証明書の専用テンプレートを読み取れません。IDと権限を確認してください。"); }
  var tabs;
  try { tabs = artifactFlattenDocumentTabs_(doc.getTabs()); }
  catch (tabError) { throw new Error("修了証明書の専用テンプレートの全タブを確認できません。作成を停止しました。"); }
  var baseTitle = "";
  try { if (tabs.length === 1) baseTitle = artifactText_(tabs[0].getTitle()); }
  catch (titleError) { throw new Error("修了証明書の専用テンプレートのタブ名を確認できません。作成を停止しました。"); }
  if (tabs.length !== 1 || tabs[0].getId() !== RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID || baseTitle !== "ベース") {
    throw new Error("修了証明書原本は、個人情報を含まない t.0「ベース」1タブだけの専用原本へ差し替えてください。子タブを含む他タブは使用できません。");
  }
  artifactAssertDocumentTabPeripheralClean_(tabs[0], "修了証明書");
  var body;
  var text;
  try {
    body = tabs[0].asDocumentTab().getBody();
    text = body.getText();
  }
  catch (bodyError) { throw new Error("修了証明書原本のベース本文を確認できません。作成を停止しました。"); }
  var missing = artifactCertificateTemplateMissingSentinels_(text);
  if (missing.length) {
    throw new Error("修了証明書原本に無個人情報センチネルがありません（" + missing.join("・") + "）。指定値を入れた専用原本へ差し替えてください。");
  }
  var requiredInsertionPatterns = [
    ["修了証明書番号", "第[ 　\\t]*UC0157[ 　\\t]*号"],
    ["講習修了日", "2000年[ 　\\t]*1月[ 　\\t]*1日[ 　\\t]*修了"],
    ["有効期限", "2000年[ 　\\t]*4月[ 　\\t]*1日[ 　\\t]*まで有効"],
    ["受講者氏名", "^[ 　\\t]*殿$"],
    ["技能証明申請者番号", "技能証明申請者番号：[ 　\\t]*0000000000"],
    ["担当講師", "担当講師：[^\\n\\r\\u000b]*"],
    ["登録更新講習機関名", "登録更新講習機関名[ 　]*株式会社[^\\n\\r\\u000b]*"],
    ["登録更新講習機関コード", "登録更新講習機関コード：[^\\n\\r\\u000b]*"]
  ];
  for (var insertionIndex = 0; insertionIndex < requiredInsertionPatterns.length; insertionIndex++) {
    if (!body.findText(requiredInsertionPatterns[insertionIndex][1])) {
      throw new Error("修了証明書原本の「" + requiredInsertionPatterns[insertionIndex][0] + "」差込位置が文字装飾で分断されているか、構造が一致しないため停止しました。");
    }
  }
  var matchingTables = 0;
  var tables = body.getTables();
  for (var tableIndex = 0; tableIndex < tables.length; tableIndex++) {
    try {
      artifactCertificateTableSelection_(
        artifactDocTableMatrix_(tables[tableIndex]), "回転翼航空機（マルチローター）", "一等"
      );
      matchingTables++;
    } catch (tableError) {}
  }
  if (tables.length !== 1 || matchingTables !== 1) throw new Error("修了証明書原本は所定の航空機種類×一等・二等区分表1個だけである必要があります。");
  return true;
}

function artifactGuidanceTemplateMissingSentinels_(textValue) {
  var text = String(textValue === null || textValue === undefined ? "" : textValue);
  var checks = [
    ["対象資格", /対象者：[一二]等無人航空機操縦士/],
    ["受講料金", /[0-9,]+円（税[込こ]み?）/],
    ["電話番号空欄", /電話番号：[ 　\t]*(?:[\n\r\u000b]|$)/],
    ["申込メール空欄", /メールアドレス：[ 　\t]*(?:[\n\r\u000b]|$)/],
    ["会社名空欄", /株式会社[ 　\t]*(?:[\n\r\u000b]|$)/],
    ["住所空欄", /住所：[ 　\t]*(?:[\n\r\u000b]|$)/]
  ];
  var missing = [];
  for (var i = 0; i < checks.length; i++) if (!checks[i][1].test(text)) missing.push(checks[i][0]);
  return missing;
}

function artifactAssertGuidanceTemplateClean_(templateId) {
  artifactAssertTrustedSharedTemplate_("guidance", templateId);
  var doc;
  try { doc = DocumentApp.openById(templateId); }
  catch (openError) { throw new Error("更新講習案内テンプレートを読み取れません。IDと権限を確認してください。"); }
  var tabs = artifactFlattenDocumentTabs_(doc.getTabs());
  var title = "";
  try { if (tabs.length === 1) title = artifactText_(tabs[0].getTitle()); }
  catch (titleError) {}
  if (tabs.length !== 1 || tabs[0].getId() !== "t.0" || title !== "修正版") {
    throw new Error("更新講習案内原本は t.0「修正版」1タブだけにしてください。想定外タブがあるため作成を停止しました。");
  }
  artifactAssertDocumentTabPeripheralClean_(tabs[0], "更新講習案内");
  var body = tabs[0].asDocumentTab().getBody();
  var missing = artifactGuidanceTemplateMissingSentinels_(body.getText());
  if (missing.length) throw new Error("更新講習案内原本の清浄センチネルまたは差込構造が不正です（" + missing.join("・") + "）。");
  var tables = body.getTables();
  if (tables.length !== 2 || tables[0].getNumRows() !== 3 || tables[1].getNumRows() !== 5) {
    throw new Error("更新講習案内原本の対象者表または4行日程表が想定構造と一致しません。");
  }
  for (var targetRow = 0; targetRow < 3; targetRow++) {
    if (tables[0].getRow(targetRow).getNumCells() !== 2) throw new Error("更新講習案内原本の対象者表は各行2列である必要があります。");
  }
  for (var scheduleRow = 0; scheduleRow < 5; scheduleRow++) {
    if (tables[1].getRow(scheduleRow).getNumCells() !== 5) throw new Error("更新講習案内原本の日程表は各行5列である必要があります。");
  }
  for (var row = 0; row < 3; row++) {
    if (artifactText_(tables[0].getRow(row).getCell(1).getText())) {
      throw new Error("更新講習案内原本の対象者差込欄に実データがあります。空欄の清浄原本へ戻してください。");
    }
  }
  return true;
}

function artifactAssertTrainingSheetClean_(sheet, keepColumns) {
  var name = sheet.getName();
  var lastRow = Math.max(1, sheet.getLastRow());
  var lastColumn = Math.max(1, sheet.getLastColumn());
  if (lastRow > 32 || lastColumn > keepColumns) {
    throw new Error("講習記録簿原本「" + name + "」のA1:" + (keepColumns === 8 ? "H" : "F") + "32外にデータがあります。");
  }
  var usedRange = sheet.getRange(1, 1, lastRow, lastColumn);
  if (
    artifactLedgerTemplateRowsHaveData_(usedRange.getFormulas(), false) ||
    artifactLedgerTemplateRowsHaveData_(usedRange.getNotes(), false) ||
    sheet.getCharts().length || sheet.getDrawings().length || sheet.getImages().length
  ) {
    throw new Error("講習記録簿原本「" + name + "」に想定外の数式・メモ・グラフ・図形・画像があります。");
  }
  var expectedCells = [
    [1, 1, /^講習記録簿\s*受講者氏名（[ 　\t]*）$/],
    [5, 1, /^受講日（[ 　\t]*\/[ 　\t]*）$/],
    [7, 1, /^場所（[ 　\t]*）$/],
    [21, 1, /^場所（[ 　\t]*）実地講習$/]
  ];
  for (var i = 0; i < expectedCells.length; i++) {
    var value = sheet.getRange(expectedCells[i][0], expectedCells[i][1]).getDisplayValue();
    if (!expectedCells[i][2].test(String(value || ""))) {
      throw new Error("講習記録簿原本「" + name + "」の氏名・日付・場所差込欄に実データまたは想定外表示があります。");
    }
  }
  var rows = [[12, "/", keepColumns], [15, "～", keepColumns], [17, "担当印", keepColumns], [26, "/", 2], [29, "～", 2], [31, "担当印", 2]];
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    var values = sheet.getRange(rows[rowIndex][0], 1, 1, rows[rowIndex][2]).getDisplayValues()[0];
    for (var column = 0; column < values.length; column++) {
      if (artifactText_(values[column]) !== rows[rowIndex][1]) {
        throw new Error("講習記録簿原本「" + name + "」の受講日・時間・担当印欄に実データがあります。");
      }
    }
  }
  return true;
}

function artifactAssertTrainingTemplateClean_(templateId) {
  artifactAssertTrustedSharedTemplate_("training", templateId);
  var ss;
  try { ss = SpreadsheetApp.openById(templateId); }
  catch (openError) { throw new Error("講習記録簿テンプレートを読み取れません。IDと権限を確認してください。"); }
  var sheets = ss.getSheets();
  var first = ss.getSheetByName("一等無人航空機操縦士");
  var second = ss.getSheetByName("二等無人航空機操縦士");
  if (sheets.length !== 2 || !first || !second) {
    throw new Error("講習記録簿原本は清浄な一等・二等の2シートだけにしてください。想定外シートがあるため停止しました。");
  }
  artifactAssertTrainingSheetClean_(first, 8);
  artifactAssertTrainingSheetClean_(second, 6);
  return true;
}

function artifactLedgerTemplateRowsHaveData_(values, allowUncheckedDeliveryCell) {
  var rows = Array.isArray(values) ? values : [];
  for (var row = 0; row < rows.length; row++) {
    var columns = Array.isArray(rows[row]) ? rows[row] : [];
    for (var column = 0; column < columns.length; column++) {
      var text = artifactText_(columns[column]);
      if (!text) continue;
      if (allowUncheckedDeliveryCell && column === 4 && text.replace(/\s/g, "") === "□有り・□無し") continue;
      return true;
    }
  }
  return false;
}

function artifactCertificateTableSelection_(matrix, aircraftType, licenseClass) {
  var aircraftLabels = ["回転翼航空機（マルチローター）", "回転翼航空機（ヘリコプター）", "飛行機"];
  var selectedAircraft = artifactText_(aircraftType);
  var classValue = artifactClassValue_(licenseClass);
  if (aircraftLabels.indexOf(selectedAircraft) < 0 || !classValue) throw new Error("証明書区分表の選択値が確定していません。");
  var classLabels = ["一等", "二等"];
  var aircraftRows = {};
  var classColumns = {};
  function normalized(value) { return artifactText_(value).replace(/\s/g, ""); }

  for (var aircraftIndex = 0; aircraftIndex < aircraftLabels.length; aircraftIndex++) {
    var aircraftMatches = [];
    for (var row = 0; row < matrix.length; row++) {
      for (var column = 0; column < matrix[row].length; column++) {
        if (normalized(matrix[row][column]) === normalized(aircraftLabels[aircraftIndex])) aircraftMatches.push({ row: row, column: column });
      }
    }
    if (aircraftMatches.length !== 1) throw new Error("証明書区分表の航空機種類行を一意に確認できません。");
    aircraftRows[aircraftLabels[aircraftIndex]] = aircraftMatches[0].row;
  }
  for (var classIndex = 0; classIndex < classLabels.length; classIndex++) {
    var classMatches = [];
    for (var classRow = 0; classRow < matrix.length; classRow++) {
      for (var classColumn = 0; classColumn < matrix[classRow].length; classColumn++) {
        if (normalized(matrix[classRow][classColumn]) === classLabels[classIndex]) classMatches.push({ row: classRow, column: classColumn });
      }
    }
    if (classMatches.length !== 1) throw new Error("証明書区分表の一等・二等列を一意に確認できません。");
    classColumns[classLabels[classIndex]] = classMatches[0].column;
  }
  var allCells = [];
  for (var rowIndex = 0; rowIndex < aircraftLabels.length; rowIndex++) {
    for (var columnIndex = 0; columnIndex < classLabels.length; columnIndex++) {
      var targetRow = aircraftRows[aircraftLabels[rowIndex]];
      var targetColumn = classColumns[classLabels[columnIndex]];
      if (!matrix[targetRow] || targetColumn >= matrix[targetRow].length) throw new Error("証明書区分表の選択セルがありません。");
      allCells.push({ row: targetRow, column: targetColumn });
    }
  }
  return {
    row: aircraftRows[selectedAircraft],
    column: classColumns[classValue === 1 ? "一等" : "二等"],
    allCells: allCells
  };
}

function artifactDocTableMatrix_(table) {
  var matrix = [];
  for (var row = 0; row < table.getNumRows(); row++) {
    var tableRow = table.getRow(row);
    var values = [];
    for (var column = 0; column < tableRow.getNumCells(); column++) values.push(tableRow.getCell(column).getText());
    matrix.push(values);
  }
  return matrix;
}

function artifactAssertLedgerTemplateClean_(templateId) {
  var id = artifactTemplateId_("ledger", { ledgerTemplateId: templateId });
  var ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (openError) { throw new Error("発行台帳の専用テンプレートを読み取れません。IDと権限を確認してください。"); }
  var sheets = ss.getSheets();
  var base = ss.getSheetByName("ベース");
  if (!base || sheets.length !== 1 || sheets[0].getSheetId() !== base.getSheetId()) {
    throw new Error("発行台帳原本は、個人情報を含まない「ベース」1シートだけの専用原本へ差し替えてください。他の年次シートは使用できません。");
  }
  if (base.getMaxColumns() < 13) throw new Error("発行台帳原本の列数が不足しています。");
  var wholeRange = base.getRange(1, 1, base.getMaxRows(), base.getMaxColumns());
  var wholeValues = wholeRange.getDisplayValues();
  if (!/無人航空機更新講習(?:講習)?修了証明書発行台帳/.test(artifactText_(wholeValues[0] && wholeValues[0][0]))) {
    throw new Error("発行台帳原本のA1に所定の台帳表題がありません。");
  }
  for (var wholeRow = 0; wholeRow < wholeValues.length; wholeRow++) {
    for (var wholeColumn = 0; wholeColumn < wholeValues[wholeRow].length; wholeColumn++) {
      if (wholeRow === 0 && wholeColumn === 0) continue;
      if (wholeColumn >= 1 && wholeColumn <= 8) continue;
      if (artifactText_(wholeValues[wholeRow][wholeColumn])) {
        throw new Error("発行台帳原本の許可領域B:I外に想定外データがあります。");
      }
    }
  }
  if (
    artifactLedgerTemplateRowsHaveData_(wholeRange.getFormulas(), false) ||
    artifactLedgerTemplateRowsHaveData_(wholeRange.getNotes(), false)
  ) throw new Error("発行台帳原本に想定外の数式またはメモがあります。");
  var lastRow = Math.max(3, base.getLastRow());
  var range = base.getRange(3, 2, lastRow - 2, 12);
  var hasDisplayedData = artifactLedgerTemplateRowsHaveData_(range.getDisplayValues(), true);
  var hasFormulas = artifactLedgerTemplateRowsHaveData_(range.getFormulas(), false);
  var hasNotes = artifactLedgerTemplateRowsHaveData_(range.getNotes(), false);
  if (hasDisplayedData || hasFormulas || hasNotes || base.getCharts().length || base.getDrawings().length || base.getImages().length) {
    throw new Error("発行台帳原本のベースに実データまたは数式があります。入力済み行のない無個人情報専用原本へ差し替えてください。");
  }
  return true;
}

function artifactStripLedgerOldVersionMarkers_(value) {
  return artifactText_(value).replace(/\s*【旧版・v\d+で訂正】/g, "").trim();
}

function artifactLedgerOldVersionMarkers_(value) {
  var text = artifactText_(value);
  var pattern = /【旧版・v(\d+)で訂正】/g;
  var matches = [];
  var match;
  while ((match = pattern.exec(text)) !== null) matches.push(Number(match[1] || 0));
  return matches;
}

function artifactLedgerVisibleHash_(displayRow) {
  var row = Array.isArray(displayRow) ? displayRow.slice(0, 8) : [];
  while (row.length < 8) row.push("");
  row = row.map(function(value) { return String(value === null || value === undefined ? "" : value); });
  // 旧版状態はN列の状態hashで監査し、M列は発行時のB:I本体値を保持する。
  row[7] = artifactStripLedgerOldVersionMarkers_(row[7]);
  return artifactHashHex_(row);
}

function artifactLedgerStateHash_(displayRow, auditFields) {
  var visible = Array.isArray(displayRow) ? displayRow.slice(0, 8) : [];
  var audit = Array.isArray(auditFields) ? auditFields.slice(0, 4) : [];
  while (visible.length < 8) visible.push("");
  while (audit.length < 4) audit.push("");
  return artifactHashHex_({
    visible: visible.map(function(value) { return String(value === null || value === undefined ? "" : value); }),
    audit: audit.map(function(value) { return String(value === null || value === undefined ? "" : value); })
  });
}

function artifactLedgerStableFieldsHash_(displayRow, auditFields) {
  var visible = Array.isArray(displayRow) ? displayRow.slice(0, 7) : [];
  var audit = Array.isArray(auditFields) ? auditFields.slice(0, 4) : [];
  while (visible.length < 7) visible.push("");
  while (audit.length < 4) audit.push("");
  return artifactHashHex_({ visibleWithoutMemo: visible, audit: audit });
}

function artifactAnnualLedgerRowIssue_(rowValue, sheetRow) {
  var row = Array.isArray(rowValue) ? rowValue : [];
  var visibleHasData = artifactLedgerTemplateRowsHaveData_([row.slice(0, 8)], true);
  var recordId = artifactText_(row[8]);
  var version = artifactText_(row[9]);
  var payloadAndTime = artifactText_(row[10]);
  var visibleHash = artifactText_(row[11]);
  var stateHash = artifactText_(row[12]);
  var auditHasData = !!(recordId || version || payloadAndTime || visibleHash || stateHash);
  if (!visibleHasData && !auditHasData) return "";
  if (!visibleHasData) return sheetRow + "行目は監査列だけに値があり、台帳行と対応していません。";
  if (!/^UC0157\d{8}$/.test(artifactText_(row[0]))) return sheetRow + "行目の証明書番号がUC0157YYMMNNNN形式ではありません。";
  if (!recordId) return sheetRow + "行目のrecordIdがありません。";
  if (!/^[1-9]\d*$/.test(version)) return sheetRow + "行目のversionが正の整数ではありません。";
  if (!/^[0-9a-f]{64} \/ \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(payloadAndTime)) {
    return sheetRow + "行目のpayloadHashまたは作成日時が正しくありません。";
  }
  if (!/^[0-9a-f]{64}$/.test(visibleHash)) return sheetRow + "行目のledgerVisibleHashが正しくありません。";
  if (!/^[0-9a-f]{64}$/.test(stateHash)) return sheetRow + "行目のledgerStateHashが正しくありません。";
  if (artifactLedgerVisibleHash_(row.slice(0, 8)) !== visibleHash) return sheetRow + "行目の可視値が作成時hashと一致しません。";
  if (artifactLedgerStateHash_(row.slice(0, 8), row.slice(8, 12)) !== stateHash) return sheetRow + "行目の旧版状態を含む状態hashが一致しません。";
  return "";
}

function artifactAnnualLedgerRowsIssue_(values) {
  var rows = Array.isArray(values) ? values : [];
  var versionKeys = {};
  var certificateOwners = {};
  var records = {};
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    var row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    var rowIssue = artifactAnnualLedgerRowIssue_(row, rowIndex + 3);
    if (rowIssue) return rowIssue;
    if (!artifactLedgerTemplateRowsHaveData_([row.slice(0, 8)], true)) continue;
    var recordId = artifactText_(row[8]);
    var version = Number(row[9] || 0);
    var certificateNo = artifactText_(row[0]);
    var versionKey = recordId + "|" + version;
    if (versionKeys[versionKey]) return (rowIndex + 3) + "行目は同一recordId・versionの重複行です。";
    versionKeys[versionKey] = true;
    if (certificateOwners[certificateNo] && certificateOwners[certificateNo] !== recordId) {
      return (rowIndex + 3) + "行目の証明書番号が別recordIdと重複しています。";
    }
    certificateOwners[certificateNo] = recordId;
    if (!records[recordId]) records[recordId] = { certificateNo: certificateNo, entries: [] };
    if (records[recordId].certificateNo !== certificateNo) {
      return (rowIndex + 3) + "行目は同一recordIdの証明書番号が過去版と一致しません。";
    }
    records[recordId].entries.push({ version: version, memo: artifactText_(row[7]), row: rowIndex + 3 });
  }
  var recordIds = Object.keys(records);
  for (var recordIndex = 0; recordIndex < recordIds.length; recordIndex++) {
    var state = records[recordIds[recordIndex]];
    state.entries.sort(function(left, right) { return left.version - right.version; });
    for (var entryIndex = 0; entryIndex < state.entries.length; entryIndex++) {
      if (state.entries[entryIndex].version !== entryIndex + 1) {
        return state.entries[entryIndex].row + "行目のversionが1から連続していません。";
      }
    }
    var maxVersion = state.entries[state.entries.length - 1].version;
    for (var stateIndex = 0; stateIndex < state.entries.length; stateIndex++) {
      var entry = state.entries[stateIndex];
      var markers = artifactLedgerOldVersionMarkers_(entry.memo);
      if (entry.version === maxVersion) {
        if (markers.length) return entry.row + "行目は最新versionなのに旧版表示があります。";
      } else if (markers.length !== 1 || markers[0] !== maxVersion) {
        return entry.row + "行目の旧版表示が最新versionを一意に示していません。";
      }
    }
  }
  return "";
}

function artifactAssertAnnualLedgerStructure_(file, ss, autoRootId, year, templateBase) {
  var expectedName = "更新講習修了証明書発行台帳_" + year + "年";
  artifactAssertGeneratedFileIdentity_(
    file,
    expectedName,
    artifactGeneratedFileIdentity_("annual-ledger", autoRootId, year),
    "年次発行台帳"
  );
  var sheets = ss.getSheets();
  var expectedSheetName = year + "年";
  var sheet = ss.getSheetByName(expectedSheetName);
  if (!sheet || sheets.length !== 1 || sheets[0].getSheetId() !== sheet.getSheetId()) {
    throw new Error("年次発行台帳は「" + expectedSheetName + "」1シートだけである必要があります。別ファイルへの誤追記を防ぐため停止しました。");
  }
  if (!templateBase || sheet.getMaxColumns() !== 14 || sheet.getMaxRows() < 3) {
    throw new Error("年次発行台帳の列・行構造が専用原本と一致しないため停止しました。");
  }
  var expectedVisibleHeader = templateBase.getRange(1, 1, 2, 9).getDisplayValues();
  var actualVisibleHeader = sheet.getRange(1, 1, 2, 9).getDisplayValues();
  if (artifactCanonicalJson_(actualVisibleHeader) !== artifactCanonicalJson_(expectedVisibleHeader)) {
    throw new Error("年次発行台帳の表題・見出しが専用原本と一致しないため停止しました。");
  }
  var auditHeaders = sheet.getRange(2, 10, 1, 5).getDisplayValues()[0];
  if (artifactCanonicalJson_(auditHeaders) !== artifactCanonicalJson_(["recordId", "version", "payloadHash / 作成日時", "ledgerVisibleHash", "ledgerStateHash"])) {
    throw new Error("年次発行台帳の監査列見出しが一致しないため停止しました。");
  }
  if (!sheet.isColumnHiddenByUser(10) || !sheet.isColumnHiddenByUser(11) || !sheet.isColumnHiddenByUser(12) || !sheet.isColumnHiddenByUser(13) || !sheet.isColumnHiddenByUser(14)) {
    throw new Error("年次発行台帳の監査列が保護された非表示構造ではないため停止しました。");
  }
  var wholeRange = sheet.getRange(1, 1, sheet.getMaxRows(), 14);
  if (
    sheet.getMaxRows() > 1 &&
    artifactLedgerTemplateRowsHaveData_(sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).getDisplayValues(), false)
  ) {
    throw new Error("年次発行台帳の許可領域外A列に想定外データがあるため停止しました。");
  }
  if (
    artifactLedgerTemplateRowsHaveData_(wholeRange.getNotes(), false) ||
    sheet.getCharts().length || sheet.getDrawings().length || sheet.getImages().length
  ) throw new Error("年次発行台帳に想定外のメモ・グラフ・図形・画像があるため停止しました。");
  var lastRow = Math.max(3, sheet.getLastRow());
  var dataRange = sheet.getRange(3, 2, lastRow - 2, 13);
  var displayRows = dataRange.getDisplayValues();
  var rowIssue = artifactAnnualLedgerRowsIssue_(displayRows);
  if (rowIssue) throw new Error("年次発行台帳の監査構造が不正です。" + rowIssue);
  if (artifactLedgerTemplateRowsHaveData_(wholeRange.getFormulas(), false)) {
    throw new Error("年次発行台帳のデータ行に想定外の数式があるため停止しました。");
  }
  return sheet;
}

function artifactCreateByKind_(context) {
  if (context.kind === "ledger") return artifactCreateLedger_(context);
  if (context.kind === "certificate") return artifactCreateCertificate_(context);
  if (context.kind === "dipsCsv") return artifactCreateDipsCsv_(context);
  if (context.kind === "guidance") return artifactCreateGuidance_(context);
  if (context.kind === "training") return artifactCreateTraining_(context);
  if (context.kind === "billing") return artifactCreateBilling_(context);
  throw new Error("未対応の成果物種別です: " + context.kind);
}

function artifactCreateLedger_(context) {
  var record = context.record;
  var year = Number(artifactText_(record.certificateIssuedDate).slice(0, 4));
  var ledger = artifactEnsureAnnualLedger_(context.autoRoot, year, context.settings);
  var sheet = ledger.sheet;
  var row = artifactNextLedgerRow_(sheet);
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
  var originalRowValues = sheet.getRange(row, 2, 1, 13).getValues();
  try {
    if (row > 3) {
      sheet.getRange(3, 2, 1, 13).copyTo(sheet.getRange(row, 2, 1, 13), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
    var deliveryState = artifactText_(record.certificateDelivered);
    var delivered = deliveryState === "有り"
      ? "☑有り　・　□無し"
      : (deliveryState === "無し" ? "□有り　・　☑無し" : "□有り　・　□無し");
    var deliveredDate = artifactValidIsoDateOrBlank_(record.certificateDeliveredDate);
    var visibleMemo = artifactText_(record.certificateLedgerMemo);
    if (context.version > 1) {
      visibleMemo = (visibleMemo ? visibleMemo + " " : "") + "【訂正版v" + context.version + "・旧版行を残置】";
    }
    var values = [[
      record.certificateNo,
      artifactRecordName_(record),
      artifactClassLabel_(record.licenseClass),
      artifactDateObject_(record.courseDate),
      delivered,
      deliveredDate ? artifactDateObject_(deliveredDate) : "",
      artifactDateObject_(record.certificateExpiry),
      visibleMemo
    ]];
    sheet.getRange(row, 2, 1, 8).setValues(artifactSafeSheetMatrix_(values));
    sheet.getRange(row, 5).setNumberFormat('yyyy"年"m"月"d"日');
    sheet.getRange(row, 7, 1, 2).setNumberFormat('yyyy"年"m"月"d"日');
    SpreadsheetApp.flush();
    var ledgerVisibleHash = artifactLedgerVisibleHash_(sheet.getRange(row, 2, 1, 8).getDisplayValues()[0]);
    var payloadAndTime = context.payloadHash + " / " + artifactNowText_();
    sheet.getRange(row, 10, 1, 4).setValues(artifactSafeSheetMatrix_([[
      artifactText_(record.recordId),
      context.version,
      payloadAndTime,
      ledgerVisibleHash
    ]]));
    SpreadsheetApp.flush();
    var ledgerStateHash = artifactLedgerStateHash_(
      sheet.getRange(row, 2, 1, 8).getDisplayValues()[0],
      sheet.getRange(row, 10, 1, 4).getDisplayValues()[0]
    );
    sheet.getRange(row, 14).setValue(artifactSheetText_(ledgerStateHash));
    sheet.hideColumns(10, 5);
    SpreadsheetApp.flush();
    var createdRow = sheet.getRange(row, 2, 1, 13).getDisplayValues()[0];
    var rowIssue = artifactAnnualLedgerRowIssue_(createdRow, row);
    if (rowIssue) throw new Error("作成した台帳行の監査検証に失敗しました。" + rowIssue);
    if (context.version === 1) {
      var firstVersionIssue = artifactAnnualLedgerRowsIssue_(
        sheet.getRange(3, 2, Math.max(3, sheet.getLastRow()) - 2, 13).getDisplayValues()
      );
      if (firstVersionIssue) throw new Error("作成した台帳の全体検証に失敗しました。" + firstVersionIssue);
    }
    return {
      fileId: ledger.file.getId(),
      url: ledger.file.getUrl() + "#gid=" + sheet.getSheetId() + "&range=B" + row + ":I" + row,
      fileName: ledger.file.getName(),
      documentNumbers: record.certificateNo,
      ledgerRow: row,
      ledgerSheetName: sheet.getName(),
      ledgerRecordId: artifactText_(record.recordId),
      ledgerVersion: context.version,
      ledgerPayloadHash: context.payloadHash,
      ledgerVisibleHash: ledgerVisibleHash,
      ledgerStateHash: ledgerStateHash,
      message: year + "年台帳の" + row + "行目へv" + context.version + "として追記しました。旧版は削除しません。"
    };
  } catch (ledgerWriteError) {
    try {
      sheet.getRange(row, 2, 1, 13).setValues(originalRowValues);
      SpreadsheetApp.flush();
    } catch (ledgerWriteRestoreError) {
      throw new Error(
        artifactErrorMessage_(ledgerWriteError) + " 【担当部署に確認が必要】台帳" + row + "行目の作成前状態を復元できませんでした: " +
        artifactErrorMessage_(ledgerWriteRestoreError)
      );
    }
    throw ledgerWriteError;
  }
}

function artifactLedgerRowSnapshot_(sheet, row) {
  var visible = sheet.getRange(row, 2, 1, 8).getDisplayValues()[0];
  var audit = sheet.getRange(row, 10, 1, 4).getDisplayValues()[0];
  var stateHash = artifactText_(sheet.getRange(row, 14).getDisplayValue());
  return {
    memo: artifactText_(visible[7]),
    stateHash: stateHash,
    computedStateHash: artifactLedgerStateHash_(visible, audit),
    stableHash: artifactLedgerStableFieldsHash_(visible, audit)
  };
}

function artifactMarkPriorLedgerRows_(sheet, recordId, newVersion) {
  if (!sheet) throw new Error("訂正前の台帳シートを確認できません。");
  var last = Math.max(3, sheet.getLastRow());
  var audit = sheet.getRange(3, 10, last - 2, 2).getDisplayValues();
  var changes = [];
  var newVersionRows = 0;
  for (var i = 0; i < audit.length; i++) {
    var row = i + 3;
    var oldVersion = Number(audit[i][1] || 0);
    if (audit[i][0] !== artifactText_(recordId)) continue;
    if (oldVersion === newVersion) {
      newVersionRows++;
      continue;
    }
    if (oldVersion <= 0 || oldVersion > newVersion) throw new Error("訂正版より新しい、または版番号不明の台帳行があるため停止しました。");
    var snapshot = artifactLedgerRowSnapshot_(sheet, row);
    if (!/^[0-9a-f]{64}$/.test(snapshot.stateHash) || snapshot.stateHash !== snapshot.computedStateHash) {
      throw new Error("旧版台帳" + row + "行目の状態hashが一致しないため停止しました。");
    }
    var baseMemo = artifactStripLedgerOldVersionMarkers_(snapshot.memo);
    var marker = "【旧版・v" + newVersion + "で訂正】";
    changes.push({
      row: row,
      original: snapshot.memo,
      updated: (baseMemo ? baseMemo + " " : "") + marker,
      originalStateHash: snapshot.stateHash,
      updatedStateHash: "",
      stableHash: snapshot.stableHash
    });
  }
  if (newVersionRows !== 1 || !changes.length) {
    throw new Error("訂正版または対応する旧版台帳行を一意に確認できないため、二重有効表示を防ぐため停止しました。");
  }
  try {
    for (var changeIndex = 0; changeIndex < changes.length; changeIndex++) {
      sheet.getRange(changes[changeIndex].row, 9).setValue(artifactSheetText_(changes[changeIndex].updated));
    }
    SpreadsheetApp.flush();
    for (var stateIndex = 0; stateIndex < changes.length; stateIndex++) {
      var changedSnapshot = artifactLedgerRowSnapshot_(sheet, changes[stateIndex].row);
      if (changedSnapshot.memo !== changes[stateIndex].updated || changedSnapshot.stableHash !== changes[stateIndex].stableHash) {
        throw new Error("旧版台帳行の訂正表示以外の値が変化したため停止しました。");
      }
      changes[stateIndex].updatedStateHash = changedSnapshot.computedStateHash;
      sheet.getRange(changes[stateIndex].row, 14).setValue(artifactSheetText_(changedSnapshot.computedStateHash));
    }
    SpreadsheetApp.flush();
    for (var verifyIndex = 0; verifyIndex < changes.length; verifyIndex++) {
      var verifiedSnapshot = artifactLedgerRowSnapshot_(sheet, changes[verifyIndex].row);
      if (
        verifiedSnapshot.memo !== changes[verifyIndex].updated ||
        verifiedSnapshot.stateHash !== changes[verifyIndex].updatedStateHash ||
        verifiedSnapshot.computedStateHash !== changes[verifyIndex].updatedStateHash ||
        verifiedSnapshot.stableHash !== changes[verifyIndex].stableHash
      ) throw new Error("旧版台帳行へ訂正表示と状態hashを書き込めなかったため停止しました。");
    }
    var fullIssue = artifactAnnualLedgerRowsIssue_(sheet.getRange(3, 2, last - 2, 13).getDisplayValues());
    if (fullIssue) throw new Error("訂正後の年次台帳全体が不整合です。" + fullIssue);
  } catch (markError) {
    var restoreIssues = [];
    for (var restoreIndex = 0; restoreIndex < changes.length; restoreIndex++) {
      var change = changes[restoreIndex];
      var current = artifactLedgerRowSnapshot_(sheet, change.row);
      var allowedState = current.stateHash === change.originalStateHash ||
        (!!change.updatedStateHash && current.stateHash === change.updatedStateHash);
      if (current.stableHash !== change.stableHash || [change.original, change.updated].indexOf(current.memo) < 0 || !allowedState) {
        restoreIssues.push(change.row + "行目が想定外の値です");
        continue;
      }
      sheet.getRange(change.row, 9).setValue(artifactSheetText_(change.original));
      sheet.getRange(change.row, 14).setValue(artifactSheetText_(change.originalStateHash));
    }
    SpreadsheetApp.flush();
    for (var restoreVerifyIndex = 0; restoreVerifyIndex < changes.length; restoreVerifyIndex++) {
      var restoreChange = changes[restoreVerifyIndex];
      var restored = artifactLedgerRowSnapshot_(sheet, restoreChange.row);
      if (
        restored.memo !== restoreChange.original || restored.stateHash !== restoreChange.originalStateHash ||
        restored.computedStateHash !== restoreChange.originalStateHash || restored.stableHash !== restoreChange.stableHash
      ) restoreIssues.push(restoreChange.row + "行目を復元できませんでした");
    }
    if (restoreIssues.length) {
      throw new Error(artifactErrorMessage_(markError) + " 【担当部署に確認が必要】" + restoreIssues.join(" / "));
    }
    throw markError;
  }
  return { sheetName: sheet.getName(), changes: changes };
}

function artifactRestorePriorLedgerRows_(fileId, markResult) {
  if (!markResult || !markResult.sheetName || !Array.isArray(markResult.changes)) return;
  var sheet = SpreadsheetApp.openById(fileId).getSheetByName(markResult.sheetName);
  if (!sheet) throw new Error("旧版台帳行の復元対象シートを確認できません。");
  for (var i = 0; i < markResult.changes.length; i++) {
    var change = markResult.changes[i];
    var current = artifactLedgerRowSnapshot_(sheet, change.row);
    if (
      current.memo !== artifactText_(change.updated) || current.stateHash !== artifactText_(change.updatedStateHash) ||
      current.computedStateHash !== artifactText_(change.updatedStateHash) || current.stableHash !== artifactText_(change.stableHash)
    ) throw new Error("旧版台帳" + change.row + "行目が訂正表示後に変更されているため、安全に復元できません。");
  }
  for (var restoreIndex = 0; restoreIndex < markResult.changes.length; restoreIndex++) {
    var restoreChange = markResult.changes[restoreIndex];
    sheet.getRange(restoreChange.row, 9).setValue(artifactSheetText_(restoreChange.original));
    sheet.getRange(restoreChange.row, 14).setValue(artifactSheetText_(restoreChange.originalStateHash));
  }
  SpreadsheetApp.flush();
  for (var verifyIndex = 0; verifyIndex < markResult.changes.length; verifyIndex++) {
    var verifyChange = markResult.changes[verifyIndex];
    var restored = artifactLedgerRowSnapshot_(sheet, verifyChange.row);
    if (
      restored.memo !== artifactText_(verifyChange.original) || restored.stateHash !== artifactText_(verifyChange.originalStateHash) ||
      restored.computedStateHash !== artifactText_(verifyChange.originalStateHash) || restored.stableHash !== artifactText_(verifyChange.stableHash)
    ) throw new Error("旧版台帳" + verifyChange.row + "行目を作成前状態へ復元できませんでした。");
  }
}

function artifactEnsureAnnualLedger_(autoRoot, year, settings) {
  var templateId = artifactTemplateId_("ledger", settings || {});
  artifactAssertLedgerTemplateClean_(templateId);
  var sourceSs = SpreadsheetApp.openById(templateId);
  var sourceBase = sourceSs.getSheetByName("ベース");
  var allowedOutputEmails = settings && settings.allowedOutputEmails;
  var props = PropertiesService.getScriptProperties();
  var key = "RENEWAL_ARTIFACT_LEDGER_" + autoRoot.getId() + "_" + year;
  var name = "更新講習修了証明書発行台帳_" + year + "年";
  var matchingLedgerFiles = artifactIteratorItems_(autoRoot.getFilesByName(name), 2);
  if (matchingLedgerFiles.length > 1) throw new Error("同名の年次発行台帳が複数あります。重複を整理してから再実行してください。");
  var storedId = props.getProperty(key);
  if (storedId) {
    var storedFile;
    try {
      storedFile = DriveApp.getFileById(storedId);
    } catch (storedLedgerFileError) {
      throw new Error("保存済みの年次発行台帳を取得できないため、成果物作成を停止しました。");
    }
    if (matchingLedgerFiles.length !== 1 || matchingLedgerFiles[0].getId() !== storedId) {
      throw new Error("保存済み年次発行台帳のIDと所定ファイル名が一致しません。誤追記を防ぐため停止しました。");
    }
    artifactAssertReusableDriveItem_(storedFile, autoRoot.getId(), "年次発行台帳", allowedOutputEmails);
    var storedSs;
    try {
      storedSs = SpreadsheetApp.openById(storedId);
    } catch (storedLedgerOpenError) {
      throw new Error("保存済みの年次発行台帳を開けないため、成果物作成を停止しました。");
    }
    var storedSheet = artifactAssertAnnualLedgerStructure_(storedFile, storedSs, autoRoot.getId(), year, sourceBase);
    storedSs.setSpreadsheetTimeZone("Asia/Tokyo");
    return { file: storedFile, spreadsheet: storedSs, sheet: storedSheet };
  }

  if (matchingLedgerFiles.length === 1) {
    var existingFile = matchingLedgerFiles[0];
    artifactAssertReusableDriveItem_(existingFile, autoRoot.getId(), "年次発行台帳", allowedOutputEmails);
    var existingSs;
    try {
      existingSs = SpreadsheetApp.openById(existingFile.getId());
    } catch (existingLedgerOpenError) {
      throw new Error("既存の年次発行台帳を開けないため、成果物作成を停止しました。");
    }
    var existingSheet = artifactAssertAnnualLedgerStructure_(existingFile, existingSs, autoRoot.getId(), year, sourceBase);
    existingSs.setSpreadsheetTimeZone("Asia/Tokyo");
    props.setProperty(key, existingFile.getId());
    return { file: existingFile, spreadsheet: existingSs, sheet: existingSheet };
  }
  var ss = SpreadsheetApp.create(name);
  var copy = DriveApp.getFileById(ss.getId());
  try {
    copy.moveTo(autoRoot);
    artifactHardenNewDriveItem_(copy, "新規年次発行台帳");
    copy.setDescription(artifactGeneratedFileIdentity_("annual-ledger", autoRoot.getId(), year));
    artifactAssertReusableDriveItem_(copy, autoRoot.getId(), "年次発行台帳", allowedOutputEmails);
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    var defaultSheet = ss.getSheets()[0];
    var base = sourceBase.copyTo(ss);
    base.setName(year + "年");
    ss.deleteSheet(defaultSheet);
    if (base.getMaxColumns() < 14) base.insertColumnsAfter(base.getMaxColumns(), 14 - base.getMaxColumns());
    base.getRange("J2:N2").setValues([["recordId", "version", "payloadHash / 作成日時", "ledgerVisibleHash", "ledgerStateHash"]]);
    base.hideColumns(10, 5);
    SpreadsheetApp.flush();
    artifactAssertAnnualLedgerStructure_(copy, ss, autoRoot.getId(), year, sourceBase);
    props.setProperty(key, copy.getId());
    return { file: copy, spreadsheet: ss, sheet: base };
  } catch (error) {
    artifactThrowAfterCleanup_(error, copy, "新規年次発行台帳", "file");
  }
}

function artifactNextLedgerRow_(sheet) {
  var max = Math.max(3, sheet.getMaxRows());
  var values = sheet.getRange(3, 2, max - 2, 13).getDisplayValues();
  var last = 2;
  for (var i = 0; i < values.length; i++) {
    if (artifactLedgerTemplateRowsHaveData_([values[i]], true)) last = i + 3;
  }
  return last + 1;
}

function artifactCreateCertificate_(context) {
  var record = context.record;
  var templateId = artifactTemplateId_("certificate", context.settings);
  artifactAssertCertificateTemplateClean_(templateId);
  var fileName = "講習修了証明書_" + artifactSafeName_(artifactRecordName_(record)) + "_v" + context.version;
  var copy = DriveApp.getFileById(templateId).makeCopy(fileName, context.targetFolder);
  try {
    artifactPrepareNewOutputFile_(copy, context, "新規修了証明書");
    var doc = DocumentApp.openById(copy.getId());
    var tab = artifactGetDocumentTab_(doc, RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID);
    var body = tab.asDocumentTab().getBody();
    var courseJa = artifactFormatJapaneseLongDate_(record.courseDate);
    var expiryJa = artifactFormatJapaneseLongDate_(record.certificateExpiry);
    artifactReplaceRequiredText_(body, "第[ 　\\t]*UC0157[ 　\\t]*号", "第　" + record.certificateNo + "　号", "修了証明書番号");
    artifactReplaceRequiredText_(body, "2000年[ 　\\t]*1月[ 　\\t]*1日[ 　\\t]*修了", courseJa + "　修了", "講習修了日");
    artifactReplaceRequiredText_(body, "2000年[ 　\\t]*4月[ 　\\t]*1日[ 　\\t]*まで有効", expiryJa + "　まで有効", "有効期限");
    artifactReplaceRequiredText_(body, "^[ 　\\t]*殿$", artifactRecordName_(record) + "　殿", "受講者氏名");
    artifactReplaceRequiredText_(body, "技能証明申請者番号：[ 　\\t]*0000000000", "技能証明申請者番号：" + artifactText_(record.skillsApplicantNo), "技能証明申請者番号");
    artifactReplaceRequiredText_(body, "担当講師：[^\\n\\r\\u000b]*", "担当講師：" + artifactText_(record.certificateInstructor), "担当講師");
    artifactReplaceRequiredText_(body, "登録更新講習機関名[ 　]*株式会社[^\\n\\r\\u000b]*", "登録更新講習機関名 " + context.settings.issuerCompany, "登録更新講習機関名");
    artifactReplaceRequiredText_(body, "登録更新講習機関コード：[^\\n\\r\\u000b]*", "登録更新講習機関コード：" + RENEWAL_ARTIFACT.ORGANIZATION_CODE, "登録更新講習機関コード");

    var tables = body.getTables();
    var tableSelections = [];
    for (var tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      try {
        tableSelections.push({
          table: tables[tableIndex],
          selection: artifactCertificateTableSelection_(
            artifactDocTableMatrix_(tables[tableIndex]), record.aircraftType, record.licenseClass
          )
        });
      } catch (tableMismatchError) {}
    }
    if (tableSelections.length !== 1) throw new Error("修了証明書の航空機種類×一等・二等区分表を一意に確認できません。");
    var selectedTable = tableSelections[0].table;
    var selectedPosition = tableSelections[0].selection;
    for (var selectionIndex = 0; selectionIndex < selectedPosition.allCells.length; selectionIndex++) {
      var clearPosition = selectedPosition.allCells[selectionIndex];
      artifactSetDocCellText_(selectedTable.getRow(clearPosition.row).getCell(clearPosition.column), "");
    }
    artifactSetDocCellText_(selectedTable.getRow(selectedPosition.row).getCell(selectedPosition.column), "〇");
    doc.saveAndClose();
    return {
      fileId: copy.getId(),
      url: copy.getUrl(),
      fileName: fileName,
      documentNumbers: record.certificateNo,
      message: "無個人情報の単一ベース原本を複製して差し込みました。押印は作成後に確認してください。"
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, copy, "新規修了証明書", "file");
  }
}

function artifactCreateDipsCsv_(context) {
  var record = context.record;
  var headers = [
    "申請者ID",
    "技能証明申請者番号",
    "登録更新講習機関コード",
    "登録更新講習機関事務所コード",
    "区分",
    "停止処分者向け講習受講有無",
    "無人航空機操縦者身体適性検査証明書番号",
    "更新講習修了証明書番号",
    "更新講習修了日",
    "有効期間満了日",
    "状態フラグ"
  ];
  var row = [
    record.dipsApplicantId,
    artifactText_(record.skillsApplicantNo),
    RENEWAL_ARTIFACT.ORGANIZATION_CODE,
    RENEWAL_ARTIFACT.OFFICE_CODE,
    String(artifactClassValue_(record.licenseClass)),
    artifactText_(record.suspensionCourse) === "あり" ? "2" : "1",
    "PA000000000000",
    record.certificateNo,
    artifactSlashDate_(record.courseDate),
    artifactSlashDate_(record.certificateExpiry),
    artifactText_(record.dipsRecordMode) === "削除"
      ? "3"
      : (artifactText_(record.dipsRecordMode) === "既存情報更新" ? "2" : "1")
  ];
  var csv = "\uFEFF" + artifactCsvRow_(headers) + "\r\n" + artifactCsvRow_(row) + "\r\n";
  var fileName = "DIPS更新修了者_" + artifactSafeName_(artifactRecordName_(record)) + "_v" + context.version + ".csv";
  var blob = Utilities.newBlob(csv, "text/csv", fileName);
  var file = context.targetFolder.createFile(blob);
  try {
    artifactPrepareNewOutputFile_(file, context, "新規DIPS CSV");
    return {
      fileId: file.getId(),
      url: file.getUrl(),
      fileName: fileName,
      documentNumbers: record.certificateNo + ";" + record.dipsApplicantId,
      message: "マニュアル記載の11列・UTF-8 BOM付きで作成しました。DIPS公式ひな形との最終照合後にアップロードしてください。"
    };
  } catch (dipsCreateError) {
    artifactThrowAfterCleanup_(dipsCreateError, file, "新規DIPS CSV", "file");
  }
}

function artifactCreateGuidance_(context) {
  var record = context.record;
  artifactAssertGuidanceTemplateClean_(RENEWAL_ARTIFACT.TEMPLATE_IDS.guidance);
  var fileName = "更新講習のご案内_" + artifactSafeName_(artifactRecordName_(record)) + "_v" + context.version;
  var copy = DriveApp.getFileById(RENEWAL_ARTIFACT.TEMPLATE_IDS.guidance).makeCopy(fileName, context.targetFolder);
  try {
    artifactPrepareNewOutputFile_(copy, context, "新規更新講習案内");
    var doc = DocumentApp.openById(copy.getId());
    var tab = artifactGetDocumentTab_(doc, "t.0");
    var body = tab.asDocumentTab().getBody();
    artifactReplaceRequiredText_(body, "対象者：[一二]等無人航空機操縦士", "対象者：" + artifactClassLongLabel_(record.licenseClass), "対象資格");
    var tables = body.getTables();
    if (tables.length < 2 || tables[0].getNumRows() < 3 || tables[1].getNumRows() < 5) {
      throw new Error("案内テンプレートの対象者表または日程表を確認できません。");
    }
    artifactSetDocCellText_(tables[0].getRow(0).getCell(1), artifactRecordName_(record));
    artifactSetDocCellText_(tables[0].getRow(1).getCell(1), artifactFormatJapaneseLongDate_(record.licenseExpiry));
    artifactSetDocCellText_(tables[0].getRow(2).getCell(1), artifactFormatJapaneseLongDate_(record.courseAvailableDate) + " ～ " + artifactFormatJapaneseLongDate_(record.courseDeadlineDate));
    for (var i = 0; i < 4; i++) {
      var schedule = context.schedules[i];
      var row = tables[1].getRow(i + 1);
      artifactSetDocCellText_(row.getCell(0), artifactFormatJapaneseWeekdayDate_(schedule.date));
      artifactSetDocCellText_(row.getCell(1), schedule.venue);
      artifactSetDocCellText_(row.getCell(2), schedule.morning ? "〇" : "―");
      artifactSetDocCellText_(row.getCell(3), schedule.afternoon ? "〇" : "―");
      artifactSetDocCellText_(row.getCell(4), schedule.evening ? "〇" : "―");
    }
    var billing = artifactCalculateBilling_(record);
    body.replaceText("■受講料金[ 　]*※卒業生特別価格", "■受講料金");
    artifactReplaceRequiredText_(body, "[0-9,]+円（税[込こ]み?）", artifactCurrency_(billing.total) + "円（税込）", "受講料金");
    artifactReplaceRequiredText_(body, "メールアドレス：[^\\n\\r\\u000b]*", "メールアドレス：" + context.settings.issuerEmail, "申込先メール");
    artifactReplaceRequiredText_(body, "電話番号：[^\\n\\r\\u000b]*", "電話番号：" + context.settings.issuerPhone, "電話番号");
    artifactReplaceRequiredText_(body, "株式会社[^\\n\\r\\u000b]*", context.settings.issuerCompany, "事業者名");
    artifactReplaceRequiredText_(body, "住所：[^\\n\\r\\u000b]*", "住所：" + context.settings.issuerAddress, "住所");
    doc.saveAndClose();
    return {
      fileId: copy.getId(),
      url: copy.getUrl(),
      fileName: fileName,
      message: "対象者表・4行の日程マスタ・料金・申込先を差し込みました。"
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, copy, "新規更新講習案内", "file");
  }
}

function artifactCreateTraining_(context) {
  var record = context.record;
  artifactAssertTrainingTemplateClean_(RENEWAL_ARTIFACT.TEMPLATE_IDS.training);
  var firstClass = artifactClassValue_(record.licenseClass) === 1;
  var requiresPractical = artifactText_(record.suspensionCourse) === "あり";
  var sourceSheetName = firstClass ? "一等無人航空機操縦士" : "二等無人航空機操縦士";
  var keepColumns = firstClass ? 8 : 6;
  var fileName = "講習記録簿_" + artifactSafeName_(artifactRecordName_(record)) + "_v" + context.version;
  var copy = DriveApp.getFileById(RENEWAL_ARTIFACT.TEMPLATE_IDS.training).makeCopy(fileName, context.targetFolder);
  try {
    artifactPrepareNewOutputFile_(copy, context, "新規講習記録簿");
    var ss = SpreadsheetApp.openById(copy.getId());
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    var sheet = ss.getSheetByName(sourceSheetName);
    if (!sheet) throw new Error("講習記録簿テンプレートに「" + sourceSheetName + "」シートがありません。");
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) if (sheets[i].getSheetId() !== sheet.getSheetId()) ss.deleteSheet(sheets[i]);
    if (sheet.getMaxRows() > 32) sheet.deleteRows(33, sheet.getMaxRows() - 32);
    if (sheet.getMaxColumns() > keepColumns) sheet.deleteColumns(keepColumns + 1, sheet.getMaxColumns() - keepColumns);
    if (!firstClass && requiresPractical) artifactReplaceSecondClassPracticalMinimum_(sheet);
    sheet.getRange("A1").setValue(artifactSheetText_("講習記録簿　　受講者氏名（　" + artifactRecordName_(record) + "　）"));
    sheet.getRange("A4").setValue(artifactSheetText_(artifactClassLongLabel_(record.licenseClass)));
    sheet.getRange("A5").setValue(artifactSheetText_("受講日（" + artifactSlashDate_(record.courseDate) + "）"));
    sheet.getRange("A7").setValue(artifactSheetText_("場所（" + artifactText_(record.courseVenue) + "）"));
    var modules = [
      "academicOverview", "academicRules", "academicLawUpdate", "academicAccident",
      "academicSafety", "academicVideo"
    ];
    if (firstClass) modules.push("academicFirstClass", "academicFirstClassVideo");
    for (var col = 0; col < modules.length; col++) artifactWriteTrainingModule_(sheet, col + 1, modules[col], record, 12, 15, 17);
    if (requiresPractical) {
      sheet.getRange("A21").setValue(artifactSheetText_("場所（" + artifactText_(record.practicalVenue || record.courseVenue) + "）実地講習"));
      artifactWriteTrainingModule_(sheet, 1, "practicalExercise1", record, 26, 29, 31);
      artifactWriteTrainingModule_(sheet, 2, "practicalDiscussion", record, 26, 29, 31);
    } else {
      sheet.getRange("A21").setValue(artifactSheetText_("実地講習：対象外（停止処分者向け講習なし）"));
    }
    try { sheet.setHiddenGridlines(true); } catch (ignoredGrid) {}
    SpreadsheetApp.flush();
    return {
      fileId: copy.getId(),
      url: copy.getUrl(),
      fileName: fileName,
      message: sourceSheetName + "だけを残し、Asia/Tokyo・A1:" + (firstClass ? "H" : "F") + "32に整えて記入しました。"
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, copy, "新規講習記録簿", "file");
  }
}

function artifactWriteTrainingModule_(sheet, column, prefix, record, dateRow, timeRow, instructorRow) {
  sheet.getRange(dateRow, column).setValue(artifactSheetText_(artifactSlashDate_(record[prefix + "Date"])));
  sheet.getRange(timeRow, column).setValue(artifactSheetText_(artifactText_(record[prefix + "Start"]) + " ～ " + artifactText_(record[prefix + "End"])));
  sheet.getRange(instructorRow, column).setValue(artifactSheetText_(record[prefix + "Instructor"]));
}

/** 二等様式の「操縦演習」列だけを特定する。指導・質疑列の5分は対象外。 */
function artifactFindSecondClassPracticalMinimumCells_(values) {
  var matches = [];
  var rows = Array.isArray(values) ? values : [];
  for (var row = 0; row < rows.length - 1; row++) {
    var columns = Array.isArray(rows[row]) ? rows[row] : [];
    for (var column = 0; column < columns.length; column++) {
      if (artifactText_(columns[column]) !== "操縦演習（異常事態における飛行）") continue;
      var following = Array.isArray(rows[row + 1]) ? artifactText_(rows[row + 1][column]) : "";
      if (!/^[5５]分以上$/.test(following)) continue;
      matches.push({
        row: row + 2,
        column: column + 1,
        oldText: following,
        newText: following.charAt(0) === "５" ? "６分以上" : "6分以上"
      });
    }
  }
  return matches;
}

function artifactReplaceSecondClassPracticalMinimum_(sheet) {
  var values = sheet.getRange(1, 1, 32, 6).getDisplayValues();
  var matches = artifactFindSecondClassPracticalMinimumCells_(values);
  if (matches.length !== 1) {
    throw new Error("二等講習記録簿の操縦演習最低時間セルを一意に確認できないため、作成を停止しました。");
  }
  var match = matches[0];
  var cell = sheet.getRange(match.row, match.column);
  if (artifactText_(cell.getDisplayValue()) !== match.oldText) {
    throw new Error("二等講習記録簿の操縦演習最低時間表示が読み取り時から変わったため、作成を停止しました。");
  }
  cell.setValue(artifactSheetText_(match.newText));
}

function artifactCreateBilling_(context) {
  var record = context.record;
  var fileName = "見積書・請求書_" + artifactSafeName_(artifactRecordName_(record)) + "_v" + context.version;
  var ss = SpreadsheetApp.create(fileName);
  var file = DriveApp.getFileById(ss.getId());
  try {
    file.moveTo(context.targetFolder);
    artifactPrepareNewOutputFile_(file, context, "新規見積書・請求書");
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    var defaultSheet = ss.getSheets()[0];
    var quote = ss.insertSheet("見積書");
    var invoice = ss.insertSheet("請求書");
    artifactBuildBillingSheet_(quote, "quote", record, context.settings);
    artifactBuildBillingSheet_(invoice, "invoice", record, context.settings);
    ss.deleteSheet(defaultSheet);
    SpreadsheetApp.flush();
    return {
      fileId: file.getId(),
      url: file.getUrl(),
      fileName: fileName,
      documentNumbers: record.quoteNo + ";" + record.invoiceNo,
      message: "CDP標準のA4帳票として見積書と請求書を作成しました。値引は率ではなく税抜の実額、消費税は税率別合計へ1回だけ端数処理しています。"
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, "新規見積書・請求書", "file");
  }
}

function artifactBuildBillingSheet_(sheet, docType, record, settings) {
  var isInvoice = docType === "invoice";
  var billing = artifactCalculateBilling_(record);
  var title = isInvoice ? "請求書（下書き）" : "見積書（下書き）";
  var number = isInvoice ? record.invoiceNo : record.quoteNo;
  var issueDate = isInvoice ? record.invoiceDate : record.quoteDate;
  var limitDate = isInvoice ? record.paymentDueDate : record.quoteExpiry;
  var recipient = artifactText_(record.billingRecipientName || record.targetName);
  var honorific = artifactText_(record.billingHonorific) || (record.companyName ? "御中" : "様");
  var subject = artifactText_(record.serviceCategory) || "更新講習";
  var accent = "#16436B";
  var soft = "#EAF2F8";
  var line = "#CBD5E1";
  var textColor = "#111827";
  var muted = "#475569";

  if (sheet.getMaxRows() < 48) sheet.insertRowsAfter(sheet.getMaxRows(), 48 - sheet.getMaxRows());
  if (sheet.getMaxColumns() < 26) sheet.insertColumnsAfter(sheet.getMaxColumns(), 26 - sheet.getMaxColumns());
  try { sheet.setHiddenGridlines(true); } catch (ignoredGrid) {}
  sheet.getRange("A1:R48").setBackground("#FFFFFF").setFontFamily("Noto Sans JP").setFontColor(textColor).setFontSize(10);
  var widths = [28, 42, 46, 50, 54, 58, 62, 66, 54, 54, 54, 54, 58, 58, 58, 58, 62, 28];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  for (var r = 1; r <= 48; r++) sheet.setRowHeight(r, 22);
  sheet.setRowHeight(3, 38);
  sheet.setRowHeights(36, 5, 24);

  artifactBillingMerge_(sheet, "B3:Q3", title).setHorizontalAlignment("center").setFontSize(20).setFontWeight("bold");
  artifactBillingMerge_(sheet, "B5:H5", recipient + "　" + honorific)
    .setFontSize(12).setFontWeight("bold")
    .setBorder(false, false, true, false, false, false, line, SpreadsheetApp.BorderStyle.SOLID);
  artifactBillingMerge_(sheet, "B6:H6", artifactText_(record.billingAddress)).setFontColor(muted);
  artifactBillingMerge_(sheet, "B8:H8", "件名: " + subject).setFontColor(muted);
  artifactBillingMerge_(sheet, "B9:H9", isInvoice ? "下記の通りご請求申し上げます。" : "下記のとおりお見積り申し上げます。").setFontColor(muted);

  artifactBillingMerge_(sheet, "K5:M5", isInvoice ? "請求書番号" : "見積書番号").setHorizontalAlignment("right").setFontColor(muted);
  artifactBillingMerge_(sheet, "N5:Q5", number).setHorizontalAlignment("left");
  artifactBillingMerge_(sheet, "K6:M6", isInvoice ? "請求日" : "発行日").setHorizontalAlignment("right").setFontColor(muted);
  artifactBillingMerge_(sheet, "N6:Q6", artifactFormatJapaneseLongDate_(issueDate)).setHorizontalAlignment("left");
  artifactBillingMerge_(sheet, "K7:M7", isInvoice ? "お支払期限" : "有効期限").setHorizontalAlignment("right").setFontColor(muted);
  artifactBillingMerge_(sheet, "N7:Q7", artifactFormatJapaneseLongDate_(limitDate)).setHorizontalAlignment("left");
  if (isInvoice) {
    artifactBillingMerge_(sheet, "K8:M8", "取引年月日（役務提供日）").setHorizontalAlignment("right").setFontColor(muted).setWrap(true);
    artifactBillingMerge_(sheet, "N8:Q8", artifactFormatJapaneseLongDate_(record.accountingDate)).setHorizontalAlignment("left");
  }

  artifactBillingMerge_(sheet, "K9:Q9", settings.issuerCompany).setFontSize(12).setFontWeight("bold");
  artifactBillingMerge_(sheet, "K10:Q10", settings.issuerAddress);
  artifactBillingMerge_(sheet, "K11:Q11", "TEL: " + settings.issuerPhone + (settings.issuerFax ? "　FAX: " + settings.issuerFax : ""));
  artifactBillingMerge_(sheet, "K12:Q12", settings.issuerEmail || "");
  artifactBillingMerge_(sheet, "K13:Q13", settings.invoiceRegistrationNo ? "登録番号: " + settings.invoiceRegistrationNo : "").setFontColor(muted);

  var headers = [
    ["B16:C16", "コード"], ["D16:J16", "品目"], ["K16:M16", "単価 税抜"],
    ["N16:O16", "数量"], ["P16:P16", "単位"], ["Q16:Q16", "金額 税抜"]
  ];
  for (var h = 0; h < headers.length; h++) {
    artifactBillingMerge_(sheet, headers[h][0], headers[h][1])
      .setBackground(accent).setFontColor("#FFFFFF").setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
  }
  for (var row = 17; row <= 26; row++) {
    artifactBillingMerge_(sheet, "B" + row + ":C" + row, "");
    artifactBillingMerge_(sheet, "D" + row + ":J" + row, "");
    artifactBillingMerge_(sheet, "K" + row + ":M" + row, "");
    artifactBillingMerge_(sheet, "N" + row + ":O" + row, "");
    artifactBillingMerge_(sheet, "P" + row + ":P" + row, "");
    artifactBillingMerge_(sheet, "Q" + row + ":Q" + row, "");
  }
  sheet.getRange("B17:C17").setValue("REN-001").setHorizontalAlignment("center");
  sheet.getRange("D17:J17").setValue(artifactSheetText_(subject)).setWrap(true);
  sheet.getRange("K17:M17").setValue(billing.feeExTax).setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  sheet.getRange("N17:O17").setValue(1).setHorizontalAlignment("center");
  sheet.getRange("P17").setValue("式").setHorizontalAlignment("center");
  sheet.getRange("Q17").setFormula("=ROUND(K17*N17,0)").setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  sheet.getRange("B16:Q26").setBorder(true, true, true, true, true, true, line, SpreadsheetApp.BorderStyle.SOLID);

  artifactBillingMerge_(sheet, "K28:P28", "小計（値引前）");
  sheet.getRange("Q28").setFormula("=SUM(Q17:Q26)").setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  artifactBillingMerge_(sheet, "K29:P29", "値引（税抜）");
  sheet.getRange("Q29").setValue(billing.discountExTax).setNumberFormat('-¥#,##0;[Red]-¥#,##0;¥0').setFontColor("#B91C1C").setHorizontalAlignment("right");
  artifactBillingMerge_(sheet, "K30:P30", "課税標準額");
  sheet.getRange("Q30").setFormula("=MAX(0,Q28-Q29)").setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  artifactBillingMerge_(sheet, "K31:P31", "消費税（" + billing.taxRate + "%・" + billing.rounding + "）");
  var taxFormula = artifactTaxFormula_("Q30", billing.taxRate, billing.rounding);
  sheet.getRange("Q31").setFormula(taxFormula).setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  artifactBillingMerge_(sheet, "K32:P32", "合計").setFontWeight("bold").setBackground(soft);
  sheet.getRange("Q32").setFormula("=Q30+Q31").setNumberFormat('¥#,##0').setFontWeight("bold").setBackground(soft).setHorizontalAlignment("right");
  sheet.getRange("K28:Q32").setBorder(false, false, true, false, false, false, line, SpreadsheetApp.BorderStyle.SOLID);
  artifactBillingMerge_(sheet, "B11:H12", "").setFormula('="' + (isInvoice ? "ご請求金額　" : "お見積金額　") + '"&TEXT(Q32,"¥#,##0")')
    .setBackground(soft).setFontColor(accent).setFontSize(14).setFontWeight("bold")
    .setVerticalAlignment("middle")
    .setBorder(true, false, true, false, false, false, accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  artifactBillingMerge_(sheet, "B35:Q35", "備考").setBackground(accent).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  var remarks = [];
  if (isInvoice) {
    remarks.push("本書は下書きです。承認・送付・発行は別途記録してください。");
    remarks.push("お支払期限までにお振込みをお願いいたします。");
    remarks.push("振込先: " + settings._bankAccountText);
    remarks.push("振込手数料はお客様にてご負担ください。");
  } else {
    remarks.push("本書は下書きです。承認・送付は別途記録してください。");
    remarks.push("講習日程・実施場所はお申し込み内容をご確認ください。");
    remarks.push("本見積書は発行日時点の内容に基づき作成しています。");
  }
  artifactBillingMerge_(sheet, "B36:Q40", remarks.join("\n")).setWrap(true).setVerticalAlignment("top");
  sheet.getRange("B35:Q40").setBorder(true, true, true, true, false, false, line, SpreadsheetApp.BorderStyle.SOLID);
  artifactBillingMerge_(sheet, "B43:Q43", "消費税の1円未満は、1帳票・税率ごとの税抜合計に対して1回だけ" + billing.rounding + "処理しています。")
    .setFontSize(8).setFontColor(muted);
  sheet.getRange("Z1").setValue(isInvoice ? "CDP_CLEAN_INVOICE_V2" : "CDP_CLEAN_QUOTE_V2");
  try { sheet.hideColumns(19, sheet.getMaxColumns() - 18); } catch (ignoredHide) {}
}

function artifactBillingMerge_(sheet, a1, value) {
  var range = sheet.getRange(a1);
  try { range.breakApart(); } catch (ignored) {}
  if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
    range.merge();
    range = sheet.getRange(a1);
  }
  range.setValue(typeof value === "string" ? artifactSheetText_(value) : value);
  return range;
}

function artifactTaxFormula_(netCell, taxRate, rounding) {
  if (Number(taxRate) === 0) return "=0";
  var fn = rounding === "切上げ" ? "ROUNDUP" : (rounding === "四捨五入" ? "ROUND" : "ROUNDDOWN");
  return "=" + fn + "(" + netCell + "*" + Number(taxRate) + "%,0)";
}

function artifactLoadSettings_() {
  var defaults = {
    issuerCompany: "株式会社ＣＤＰ北海道",
    issuerAddress: "〒002-8053 札幌市北区篠路町篠路389-72",
    issuerPhone: "011-790-7925",
    issuerFax: "011-790-7935",
    issuerEmail: "",
    invoiceRegistrationNo: "T9430001086920",
    outputFolderId: "",
    templateFolderId: "",
    ledgerTemplateId: "",
    certificateTemplateId: "",
    allowedOutputEmails: "",
    dipsAdditionalClosedDates: "",
    dipsCalendarConfirmedDate: "",
    dipsCalendarConfirmedBy: "",
    numberingInitialized: false,
    numberingCutoverMonth: "",
    certificateSequenceSeed: "",
    dipsSequenceSeed: "",
    schedules: []
  };
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(RENEWAL_ARTIFACT.SETTINGS_KEY);
  if (raw) {
    try {
      var stored = JSON.parse(raw);
      Object.keys(defaults).forEach(function(key) {
        if (stored[key] !== undefined && stored[key] !== null) defaults[key] = stored[key];
      });
    } catch (ignored) {}
  }
  defaults.outputFolderId = artifactExtractDriveId_(defaults.outputFolderId);
  defaults.templateFolderId = artifactExtractDriveId_(defaults.templateFolderId);
  defaults.ledgerTemplateId = artifactExtractDriveFileId_(defaults.ledgerTemplateId);
  defaults.certificateTemplateId = artifactExtractDriveFileId_(defaults.certificateTemplateId);
  defaults.allowedOutputEmails = artifactNormalizeAllowedEmails_(defaults.allowedOutputEmails).join("\n");
  defaults.dipsAdditionalClosedDates = artifactNormalizeIsoDateList_(defaults.dipsAdditionalClosedDates).join("\n");
  defaults.dipsCalendarConfirmedDate = artifactText_(defaults.dipsCalendarConfirmedDate);
  defaults.dipsCalendarConfirmedBy = artifactText_(defaults.dipsCalendarConfirmedBy);
  defaults.numberingInitialized = artifactBoolean_(defaults.numberingInitialized);
  defaults.numberingCutoverMonth = artifactText_(defaults.numberingCutoverMonth);
  defaults.certificateSequenceSeed = artifactText_(defaults.certificateSequenceSeed);
  defaults.dipsSequenceSeed = artifactText_(defaults.dipsSequenceSeed);
  defaults.schedules = artifactNormalizeSchedules_(defaults.schedules);
  defaults._bankAccountText = artifactText_(props.getProperty(RENEWAL_ARTIFACT.BANK_KEY));
  return defaults;
}

function artifactPublicSettings_(settings) {
  return {
    issuerCompany: settings.issuerCompany,
    issuerAddress: settings.issuerAddress,
    issuerPhone: settings.issuerPhone,
    issuerFax: settings.issuerFax,
    issuerEmail: settings.issuerEmail,
    invoiceRegistrationNo: settings.invoiceRegistrationNo,
    outputFolderId: settings.outputFolderId,
    templateFolderId: artifactText_(settings.templateFolderId),
    ledgerTemplateId: artifactText_(settings.ledgerTemplateId),
    certificateTemplateId: artifactText_(settings.certificateTemplateId),
    allowedOutputEmails: artifactNormalizeAllowedEmails_(settings.allowedOutputEmails).join("\n"),
    dipsAdditionalClosedDates: artifactNormalizeIsoDateList_(settings.dipsAdditionalClosedDates).join("\n"),
    dipsCalendarConfirmedDate: artifactText_(settings.dipsCalendarConfirmedDate),
    dipsCalendarConfirmedBy: artifactText_(settings.dipsCalendarConfirmedBy),
    numberingInitialized: artifactBoolean_(settings.numberingInitialized),
    numberingCutoverMonth: artifactText_(settings.numberingCutoverMonth),
    certificateSequenceSeed: artifactText_(settings.certificateSequenceSeed),
    dipsSequenceSeed: artifactText_(settings.dipsSequenceSeed),
    bankAccountConfigured: !!artifactText_(settings._bankAccountText),
    schedules: artifactNormalizeSchedules_(settings.schedules)
  };
}

function artifactAssertRequiredTemplateSettings_(settings) {
  artifactTemplateId_("ledger", settings || {});
  artifactTemplateId_("certificate", settings || {});
}

function artifactNormalizeAllowedEmails_(value) {
  var raw = Array.isArray(value) ? value.join("\n") : String(value === null || value === undefined ? "" : value);
  var seen = {};
  var result = [];
  raw.split(/[\s,;]+/).forEach(function(part) {
    var email = artifactText_(part).toLowerCase();
    if (email && !seen[email]) {
      seen[email] = true;
      result.push(email);
    }
  });
  return result;
}

function artifactAssertAllowedOutputEmails_(value) {
  var emails = artifactNormalizeAllowedEmails_(value);
  if (!emails.length) throw new Error("成果物アクセス許可メール一覧は必須です。出力先の所有者・編集者・閲覧者をすべて指定してください。");
  for (var i = 0; i < emails.length; i++) {
    if (!artifactIsEmail_(emails[i])) throw new Error("成果物アクセス許可メールの形式が正しくありません: " + emails[i]);
  }
  return emails;
}

function artifactNormalizeIsoDateList_(value) {
  var raw = Array.isArray(value) ? value.join("\n") : String(value === null || value === undefined ? "" : value);
  var seen = {};
  var result = [];
  raw.split(/[\s,;]+/).forEach(function(part) {
    var token = artifactText_(part);
    if (token && !seen[token]) {
      seen[token] = true;
      result.push(token);
    }
  });
  return result.sort();
}

function artifactValidateDipsCalendarSettings_(settings, todayIso, required, errors) {
  settings = settings || {};
  errors = errors || [];
  var closedDates = artifactNormalizeIsoDateList_(settings.dipsAdditionalClosedDates);
  for (var i = 0; i < closedDates.length; i++) {
    if (!artifactValidIsoDateOrBlank_(closedDates[i])) errors.push("DIPS追加閉庁日はyyyy-MM-dd形式の実在日で入力してください: " + closedDates[i]);
  }
  var confirmedText = artifactText_(settings.dipsCalendarConfirmedDate);
  var confirmedDate = artifactValidIsoDateOrBlank_(confirmedText);
  var confirmedBy = artifactText_(settings.dipsCalendarConfirmedBy);
  if (required && !confirmedText) errors.push("DIPS営業日カレンダーの確認日が必要です。");
  if (confirmedText && !confirmedDate) errors.push("DIPS営業日カレンダー確認日はyyyy-MM-dd形式の実在日で入力してください。");
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (confirmedDate && today && confirmedDate > today) errors.push("DIPS営業日カレンダー確認日に未来日は指定できません。");
  if (required && !confirmedBy) errors.push("DIPS営業日カレンダーの確認者が必要です。");
  if (!required && ((confirmedText && !confirmedBy) || (!confirmedText && confirmedBy))) {
    errors.push("DIPS営業日カレンダーの確認日と確認者は両方入力してください。");
  }
  return closedDates;
}

function artifactAddIsoDaysUtc_(isoDate, days) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) throw new Error("営業日計算の基準日が正しくありません。");
  var date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Number(days || 0)));
  return date.getUTCFullYear() + "-" + artifactPad_(date.getUTCMonth() + 1, 2) + "-" + artifactPad_(date.getUTCDate(), 2);
}

/** 発行日の翌日から数え、土日・祝日・設定済み閉庁日を除く5営業日目。 */
function artifactDipsSubmissionDeadline_(issuedDateValue, additionalClosedDates, holidayMaster) {
  var issuedDate = artifactValidIsoDateOrBlank_(issuedDateValue);
  if (!issuedDate) throw new Error("DIPS連携期限の計算には正しい証明書発行日が必要です。");
  var master = holidayMaster || RENEWAL_JAPAN_HOLIDAYS;
  var additional = {};
  artifactNormalizeIsoDateList_(additionalClosedDates).forEach(function(date) {
    if (!artifactValidIsoDateOrBlank_(date)) throw new Error("DIPS追加閉庁日が正しくありません: " + date);
    additional[date] = true;
  });
  var cursor = issuedDate;
  var businessDays = 0;
  while (businessDays < 5) {
    cursor = artifactAddIsoDaysUtc_(cursor, 1);
    var year = cursor.slice(0, 4);
    if (!master || !master.years || !Array.isArray(master.years[year])) {
      throw new Error(year + "年の内閣府祝日マスタが未収録のため、DIPS連携期限を推測できません。");
    }
    var parts = artifactIsoParts_(cursor);
    var dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    var holiday = master.years[year].indexOf(cursor.slice(5)) >= 0;
    if (dayOfWeek === 0 || dayOfWeek === 6 || holiday || additional[cursor]) continue;
    businessDays++;
  }
  return cursor;
}

function artifactValidateDipsSubmission_(settings, issuedDate, linkedDateValue, todayIso, errors, warnings) {
  artifactValidateDipsCalendarSettings_(settings, todayIso, true, errors);
  warnings.push("【担当部署に確認が必要】営業日の定義は公開資料で未確認です。民法140条の初日不算入として翌日から暫定計算しています。");
  var deadline = "";
  try {
    deadline = artifactDipsSubmissionDeadline_(issuedDate, settings && settings.dipsAdditionalClosedDates, RENEWAL_JAPAN_HOLIDAYS);
  } catch (deadlineError) {
    errors.push(artifactErrorMessage_(deadlineError));
    return "";
  }
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (today && today > deadline) warnings.push("DIPS修了者情報連携の暫定期限（" + deadline + "）を超過しています。担当部署へ直ちに確認してください。");
  var linkedDate = artifactValidateOptionalIso_(linkedDateValue, "DIPS修了者情報連携日", errors);
  var validIssuedDate = artifactValidIsoDateOrBlank_(issuedDate);
  if (linkedDate && validIssuedDate && linkedDate < validIssuedDate) errors.push("DIPS修了者情報連携日は証明書発行日以後にしてください。");
  if (linkedDate && today && linkedDate > today) errors.push("DIPS修了者情報連携日に未来日は指定できません。");
  if (linkedDate && linkedDate > deadline) warnings.push("DIPS修了者情報連携日が暫定連携期限（" + deadline + "）を超過しています。遅延理由を記録し、担当部署へ確認してください。");
  return deadline;
}

function artifactAssertDriveItemAcl_(item, allowedOutputEmails, label) {
  var itemLabel = artifactText_(label) || "Drive項目";
  var allowed = artifactAssertAllowedOutputEmails_(allowedOutputEmails);
  var allowedMap = {};
  for (var i = 0; i < allowed.length; i++) allowedMap[allowed[i]] = true;

  var actor = "";
  try {
    actor = artifactText_(Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail()).toLowerCase();
  } catch (actorError) {}
  if (!actor) throw new Error(itemLabel + "を操作する実行者メールを取得できないため、ACL監査未完として停止しました。");
  if (!allowedMap[actor]) throw new Error(itemLabel + "の実行者メールが成果物アクセス許可一覧にありません: " + actor);

  try {
    if (item.isShareableByEditors()) {
      throw new Error(itemLabel + "で編集者による再共有が許可されています。Driveの共有設定で無効にしてください。");
    }
  } catch (reshareError) {
    if (artifactErrorMessage_(reshareError).indexOf("再共有が許可") >= 0) throw reshareError;
    throw new Error(itemLabel + "の編集者再共有設定を確認できないため、ACL監査未完として停止しました。");
  }

  var owner;
  var editors;
  var viewers;
  try {
    owner = item.getOwner();
    editors = item.getEditors();
    viewers = item.getViewers();
  } catch (aclReadError) {
    throw new Error(itemLabel + "の所有者・編集者・閲覧者を完全取得できないため、ACL監査未完として停止しました。");
  }
  if (!owner) throw new Error(itemLabel + "の所有者を取得できないため、共有ドライブ等のACL監査未完として停止しました。");
  var users = [owner].concat(Array.isArray(editors) ? editors : [], Array.isArray(viewers) ? viewers : []);
  for (var userIndex = 0; userIndex < users.length; userIndex++) {
    var email = "";
    try { email = artifactText_(users[userIndex].getEmail()).toLowerCase(); }
    catch (userError) {}
    if (!email) throw new Error(itemLabel + "の共有ユーザーのメールを取得できないため、ACL監査未完として停止しました。");
    if (!allowedMap[email]) throw new Error(itemLabel + "に許可一覧外の共有ユーザーがあります: " + email);
  }

  var itemId = "";
  try { itemId = artifactText_(item.getId()); }
  catch (itemIdError) {}
  if (!itemId) throw new Error(itemLabel + "のDrive IDを取得できないため、ACL監査未完として停止しました。");
  if (typeof Drive === "undefined" || !Drive.Permissions || typeof Drive.Permissions.list !== "function") {
    throw new Error(itemLabel + "の完全ACL監査に必要なAdvanced Drive API v3が有効ではありません。");
  }
  var pageToken = "";
  var seenPageTokens = {};
  var pageCount = 0;
  do {
    if (pageToken && seenPageTokens[pageToken]) throw new Error(itemLabel + "のACLページングが循環したため、監査未完として停止しました。");
    if (pageToken) seenPageTokens[pageToken] = true;
    if (++pageCount > 1000) throw new Error(itemLabel + "のACLページ数が上限を超えたため、監査未完として停止しました。");
    var response;
    try {
      var options = {
        pageSize: 100,
        supportsAllDrives: true,
        fields: "nextPageToken,permissions(id,type,emailAddress,domain,role,deleted,permissionDetails(inherited,inheritedFrom,permissionType,role))"
      };
      if (pageToken) options.pageToken = pageToken;
      response = Drive.Permissions.list(itemId, options);
    } catch (permissionsError) {
      throw new Error(itemLabel + "の全権限をAdvanced Drive APIで列挙できないため、ACL監査未完として停止しました。");
    }
    if (!response || !Array.isArray(response.permissions)) {
      throw new Error(itemLabel + "の全権限一覧を取得できないため、ACL監査未完として停止しました。");
    }
    for (var permissionIndex = 0; permissionIndex < response.permissions.length; permissionIndex++) {
      var permission = response.permissions[permissionIndex] || {};
      if (permission.deleted === true) continue;
      var permissionType = artifactText_(permission.type).toLowerCase();
      if (["domain", "anyone"].indexOf(permissionType) >= 0) {
        throw new Error(itemLabel + "にドメインまたはリンク共有権限があります。完全非公開にしてください。");
      }
      if (["user", "group"].indexOf(permissionType) < 0) {
        throw new Error(itemLabel + "に判定できない権限種別があります: " + (permissionType || "不明"));
      }
      var permissionEmail = artifactText_(permission.emailAddress).toLowerCase();
      if (!permissionEmail) throw new Error(itemLabel + "の" + permissionType + "権限メールを取得できないため、ACL監査未完として停止しました。");
      if (!allowedMap[permissionEmail]) throw new Error(itemLabel + "に許可一覧外の" + permissionType + "権限があります: " + permissionEmail);
    }
    pageToken = artifactText_(response.nextPageToken);
  } while (pageToken);
  return true;
}

function artifactHardenNewDriveItem_(item, label) {
  var itemLabel = artifactText_(label) || "新規Drive項目";
  try {
    item.setShareableByEditors(false);
    if (item.isShareableByEditors()) throw new Error("再共有無効化後も有効です。");
  } catch (hardeningError) {
    throw new Error(itemLabel + "で編集者による再共有を無効化できないため、作成を停止しました。");
  }
  return item;
}

/** 証明書・台帳は設定済みの清浄原本、それ以外はコード固定の共有原本を返す。 */
function artifactTemplateId_(kind, settings) {
  var id = "";
  if (kind === "ledger") id = artifactExtractDriveFileId_(settings && settings.ledgerTemplateId);
  else if (kind === "certificate") id = artifactExtractDriveFileId_(settings && settings.certificateTemplateId);
  else id = artifactExtractDriveFileId_(RENEWAL_ARTIFACT.TEMPLATE_IDS[kind]);

  if ((kind === "ledger" || kind === "certificate") && !id) {
    throw new Error((kind === "ledger" ? "発行台帳" : "修了証明書") + "の無個人情報専用テンプレートIDを事業者設定で指定してください。");
  }
  if (RENEWAL_ARTIFACT.BLOCKED_TEMPLATE_IDS[kind] && id === RENEWAL_ARTIFACT.BLOCKED_TEMPLATE_IDS[kind]) {
    throw new Error((kind === "ledger" ? "発行台帳" : "修了証明書") + "に既知の実データ入り原本は使用できません。無個人情報・ベースのみの専用原本を新規作成し、そのIDへ差し替えてください。");
  }
  return id;
}

function artifactAssertNumberingSettings_(settings) {
  var initialized = artifactBoolean_(settings && settings.numberingInitialized);
  var cutoverMonth = artifactText_(settings && settings.numberingCutoverMonth);
  var certificateSeed = artifactText_(settings && settings.certificateSequenceSeed);
  var dipsSeed = artifactText_(settings && settings.dipsSequenceSeed);
  if (initialized && !cutoverMonth) {
    throw new Error("採番移行確認済みを有効にする場合は、採番切替年月（YYYY-MM）が必要です。");
  }
  if (cutoverMonth && !artifactValidCutoverMonth_(cutoverMonth)) {
    throw new Error("採番切替年月は YYYY-MM 形式の実在月で入力してください。");
  }
  if (certificateSeed && (!/^UC0157\d{8}$/.test(certificateSeed) || !artifactValidYearMonthToken_(certificateSeed.slice(6, 10)))) {
    throw new Error("修了証明書番号の採番開始値は UC0157YYMMNNNN 形式で入力してください。");
  }
  if (dipsSeed && (!/^\d{6}$/.test(dipsSeed) || !artifactValidYearMonthToken_(dipsSeed.slice(0, 4)))) {
    throw new Error("DIPS申請者IDの採番開始値は YYMMNN の6桁で入力してください。");
  }
}

function artifactValidCutoverMonth_(value) {
  var match = /^(\d{4})-(\d{2})$/.exec(artifactText_(value));
  if (!match) return false;
  var month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function artifactValidYearMonthToken_(value) {
  var match = /^\d{2}(\d{2})$/.exec(artifactText_(value));
  if (!match) return false;
  var month = Number(match[1]);
  return month >= 1 && month <= 12;
}

function artifactRequireNumberingInitialized_(settings, label) {
  if (!settings || !artifactBoolean_(settings.numberingInitialized)) {
    throw new Error(
      label + "を自動採番できません。既存台帳を照合し、事業者設定で「採番移行確認済み」を有効にしてください。"
    );
  }
}

function artifactAssertAutomaticNumberingAllowed_(settings, courseDate, label) {
  artifactAssertNumberingSettings_(settings || {});
  artifactRequireNumberingInitialized_(settings, label);
  var validCourseDate = artifactValidIsoDateOrBlank_(courseDate);
  if (!validCourseDate) throw new Error(label + "の自動採番には正しい講習修了日が必要です。");
  var courseMonth = validCourseDate.slice(0, 7);
  var cutoverMonth = artifactText_(settings.numberingCutoverMonth);
  if (courseMonth < cutoverMonth) {
    throw new Error(
      label + "は採番切替年月（" + cutoverMonth + "）より前の講習分です。既存台帳で確認した正式番号を手入力してください。"
    );
  }
}

function artifactValidateAutomaticNumberingForPreflight_(settings, courseDate, label, errors) {
  if (!artifactBoolean_(settings && settings.numberingInitialized)) {
    errors.push(label + "を自動採番する前に、既存台帳を照合し、事業者設定で「採番移行確認済み」を有効にしてください。");
    return;
  }
  var cutoverMonth = artifactText_(settings && settings.numberingCutoverMonth);
  var validCourseDate = artifactValidIsoDateOrBlank_(courseDate);
  if (artifactValidCutoverMonth_(cutoverMonth) && validCourseDate && validCourseDate.slice(0, 7) < cutoverMonth) {
    errors.push(
      label + "は採番切替年月（" + cutoverMonth + "）より前の講習分です。既存台帳で確認した正式番号を手入力してください。"
    );
  }
}

function artifactRequireSafeOutputFolder_(folderId, additionalTemplateIds, allowedOutputEmails) {
  var id = artifactExtractDriveId_(folderId);
  if (!id) throw new Error("成果物の出力先フォルダは必須です。個人情報用の非公開フォルダを指定してください。");

  var folder;
  try {
    folder = DriveApp.getFolderById(id);
    folder.getName();
  } catch (folderError) {
    throw new Error("出力先フォルダを確認できません。フォルダIDと編集権限を確認してください。");
  }
  try {
    if (folder.isTrashed()) throw new Error("出力先フォルダがゴミ箱にあります。復元するか別の非公開フォルダを指定してください。");
  } catch (outputTrashedError) {
    if (artifactText_(outputTrashedError && outputTrashedError.message).indexOf("ゴミ箱にあります") >= 0) throw outputTrashedError;
    throw new Error("出力先フォルダの削除状態を確認できないため、個人情報を出力できません。");
  }

  var sharingAccess;
  try {
    sharingAccess = folder.getSharingAccess();
  } catch (sharingError) {
    throw new Error("出力先フォルダの共有設定を確認できないため、個人情報を出力できません。");
  }
  artifactAssertPrivateSharingAccess_(sharingAccess, DriveApp.Access.PRIVATE);
  artifactAssertDriveItemAcl_(folder, allowedOutputEmails, "出力先フォルダ");

  try {
    var templateKinds = Object.keys(RENEWAL_ARTIFACT.TEMPLATE_IDS);
    var templateIds = templateKinds.map(function(kind) { return artifactText_(RENEWAL_ARTIFACT.TEMPLATE_IDS[kind]); });
    if (Array.isArray(additionalTemplateIds)) templateIds = templateIds.concat(additionalTemplateIds);
    var seenTemplateIds = {};
    for (var i = 0; i < templateIds.length; i++) {
      var templateId = artifactExtractDriveFileId_(templateIds[i]);
      if (!templateId || seenTemplateIds[templateId]) continue;
      seenTemplateIds[templateId] = true;
      var templateFile = DriveApp.getFileById(templateId);
      var parents = templateFile.getParents();
      while (parents.hasNext()) {
        if (parents.next().getId() === id) {
          throw new Error("テンプレート原本を置く親フォルダは成果物の出力先に指定できません。別の非公開フォルダを指定してください。");
        }
      }
    }
  } catch (templateParentError) {
    if (artifactText_(templateParentError && templateParentError.message).indexOf("テンプレート原本を置く親フォルダ") >= 0) {
      throw templateParentError;
    }
    throw new Error("テンプレート原本の親フォルダを確認できないため、出力先の安全性を確認できません。");
  }
  return folder;
}

function artifactAssertPrivateSharingAccess_(sharingAccess, privateAccess) {
  if (sharingAccess !== privateAccess) {
    throw new Error("出力先フォルダが非公開ではありません。共有設定を「制限付き」にしてから保存してください。");
  }
}

function artifactAssertReusableDriveItem_(item, expectedParentId, label, allowedOutputEmails) {
  var expected = artifactExtractDriveId_(expectedParentId);
  var itemLabel = artifactText_(label) || "保存済みDrive項目";
  if (!item || !expected) throw new Error(itemLabel + "の保存先を安全確認できません。");

  try {
    if (item.isTrashed()) throw new Error(itemLabel + "はゴミ箱にあります。復元または設定の見直しが必要です。");
  } catch (trashedError) {
    if (artifactText_(trashedError && trashedError.message).indexOf("ゴミ箱にあります") >= 0) throw trashedError;
    throw new Error(itemLabel + "の削除状態を確認できないため、成果物作成を停止しました。");
  }

  var access;
  try { access = item.getSharingAccess(); }
  catch (sharingError) { throw new Error(itemLabel + "の共有設定を確認できないため、成果物作成を停止しました。"); }
  if (access !== DriveApp.Access.PRIVATE) {
    throw new Error(itemLabel + "が非公開ではありません。共有設定を「制限付き」に戻してください。");
  }
  artifactAssertDriveItemAcl_(item, allowedOutputEmails, itemLabel);

  var hasExpectedParent = false;
  try {
    var parents = item.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === expected) hasExpectedParent = true;
    }
  } catch (parentError) {
    throw new Error(itemLabel + "の親フォルダを確認できないため、成果物作成を停止しました。");
  }
  if (!hasExpectedParent) {
    throw new Error(itemLabel + "が現在の指定出力先の直下にありません。移動先を確認してください。");
  }
  return item;
}

function artifactSettingsForHash_(kind, settings) {
  var base = {
    issuerCompany: settings.issuerCompany,
    outputFolderId: settings.outputFolderId,
    allowedOutputEmails: artifactNormalizeAllowedEmails_(settings.allowedOutputEmails)
  };
  if (kind === "ledger") base.ledgerTemplateId = artifactText_(settings.ledgerTemplateId);
  if (kind === "certificate") base.certificateTemplateId = artifactText_(settings.certificateTemplateId);
  if (["ledger", "certificate", "dipsCsv"].indexOf(kind) >= 0) {
    base.numberingInitialized = artifactBoolean_(settings.numberingInitialized);
    base.numberingCutoverMonth = artifactText_(settings.numberingCutoverMonth);
  }
  if (kind === "dipsCsv") {
    base.holidayCalendarVersion = RENEWAL_JAPAN_HOLIDAYS.version;
    base.dipsAdditionalClosedDates = artifactNormalizeIsoDateList_(settings.dipsAdditionalClosedDates);
    base.dipsCalendarConfirmedDate = artifactText_(settings.dipsCalendarConfirmedDate);
    base.dipsCalendarConfirmedBy = artifactText_(settings.dipsCalendarConfirmedBy);
  }
  if (kind === "certificate") {
    base.organizationCode = RENEWAL_ARTIFACT.ORGANIZATION_CODE;
  } else if (kind === "guidance") {
    base.issuerAddress = settings.issuerAddress;
    base.issuerPhone = settings.issuerPhone;
    base.issuerEmail = settings.issuerEmail;
  } else if (kind === "billing") {
    base.issuerAddress = settings.issuerAddress;
    base.issuerPhone = settings.issuerPhone;
    base.issuerFax = settings.issuerFax;
    base.issuerEmail = settings.issuerEmail;
    base.invoiceRegistrationNo = settings.invoiceRegistrationNo;
    base.bankAccountText = settings._bankAccountText;
  }
  return base;
}

function artifactTemplateFingerprint_(kind, settings) {
  var templateId = artifactTemplateId_(kind, settings || {});
  var layoutVersion = RENEWAL_ARTIFACT.LAYOUT_VERSIONS[kind] || "";
  if (templateId) {
    var file = DriveApp.getFileById(templateId);
    return artifactComposeTemplateFingerprint_(templateId, file.getLastUpdated().toISOString(), layoutVersion);
  }
  return artifactComposeTemplateFingerprint_("", "", layoutVersion);
}

/** Drive原本またはコード内レイアウト版を、payloadHashへ入れる安定した文字列にする純粋関数。 */
function artifactComposeTemplateFingerprint_(templateId, lastUpdatedIso, layoutVersion) {
  var id = artifactText_(templateId);
  var updated = artifactText_(lastUpdatedIso);
  var layout = artifactText_(layoutVersion);
  if (id) {
    if (!updated) throw new Error("テンプレートの最終更新日時を取得できません。");
    return "drive:" + id + "@" + updated + (layout ? "|layout:" + layout : "");
  }
  if (!layout) throw new Error("成果物のレイアウト版が設定されていません。");
  return "layout:" + layout;
}

function artifactNormalizeSchedules_(schedules) {
  if (!Array.isArray(schedules)) return [];
  return schedules.slice(0, 4).map(function(row) {
    row = row || {};
    return {
      date: artifactText_(row.date),
      venue: artifactText_(row.venue),
      morning: row.morning === true || row.morning === "true" || row.morning === 1,
      afternoon: row.afternoon === true || row.afternoon === "true" || row.afternoon === 1,
      evening: row.evening === true || row.evening === "true" || row.evening === 1
    };
  });
}

function artifactNormalizeKinds_(kinds) {
  if (!Array.isArray(kinds)) kinds = RENEWAL_ARTIFACT.KINDS.slice();
  var seen = {};
  var result = [];
  for (var i = 0; i < kinds.length; i++) {
    var kind = artifactText_(kinds[i]);
    if (RENEWAL_ARTIFACT.KINDS.indexOf(kind) >= 0 && !seen[kind]) {
      seen[kind] = true;
      result.push(kind);
    }
  }
  return result;
}

function artifactIteratorItems_(iterator, maximum) {
  var items = [];
  var limit = Math.max(1, Number(maximum || 100));
  while (iterator && iterator.hasNext() && items.length < limit) items.push(iterator.next());
  return items;
}

function artifactGeneratedFileIdentity_(type, autoRootId, qualifier) {
  var identity = RENEWAL_ARTIFACT.DRIVE_IDENTITY_VERSION + "|" + artifactText_(type) + "|autoRoot=" + artifactText_(autoRootId);
  var suffix = artifactText_(qualifier);
  return suffix ? identity + "|qualifier=" + suffix : identity;
}

function artifactOutputIdentity_(recordId, kind, payloadHash, version, contentHash) {
  var hash = artifactText_(payloadHash);
  var bodyHash = artifactText_(contentHash);
  var numericVersion = Number(version || 0);
  if (!artifactText_(recordId) || RENEWAL_ARTIFACT.KINDS.indexOf(artifactText_(kind)) < 0 || !/^[0-9a-f]{64}$/.test(hash) || !/^[0-9a-f]{64}$/.test(bodyHash) || numericVersion < 1 || Math.floor(numericVersion) !== numericVersion) {
    throw new Error("個別成果物の生成物識別情報を確定できません。");
  }
  return RENEWAL_ARTIFACT.DRIVE_IDENTITY_VERSION + "|artifact|recordId=" + artifactText_(recordId) +
    "|kind=" + artifactText_(kind) + "|payloadHash=" + hash + "|version=" + numericVersion + "|contentHash=" + bodyHash;
}

function artifactPrepareNewOutputFile_(file, context, label) {
  artifactHardenNewDriveItem_(file, label);
  return file;
}

function artifactFinalizeNewOutputFile_(file, context, label) {
  var contentHash = artifactOutputContentHash_(file.getId(), context.kind);
  var identity = artifactOutputIdentity_(context.record.recordId, context.kind, context.payloadHash, context.version, contentHash);
  try { file.setDescription(identity); }
  catch (descriptionError) { throw new Error((artifactText_(label) || "新規成果物") + "へ生成物識別情報を設定できないため停止しました。"); }
  var revision = artifactDriveRevisionState_(file.getId());
  return {
    contentHash: contentHash,
    driveVersion: revision.driveVersion,
    modifiedTime: revision.modifiedTime,
    md5Checksum: revision.md5Checksum
  };
}

function artifactDriveRevisionState_(fileId) {
  var resource;
  try {
    resource = Drive.Files.get(fileId, {
      fields: "id,modifiedTime,version,md5Checksum",
      supportsAllDrives: true
    });
  } catch (revisionError) {
    throw new Error("成果物のDrive版情報を取得できないため停止しました。Advanced Drive Service v3を確認してください。");
  }
  var driveVersion = artifactText_(resource && resource.version);
  var modifiedTime = artifactText_(resource && resource.modifiedTime);
  var md5Checksum = artifactText_(resource && resource.md5Checksum).toLowerCase();
  if (
    artifactText_(resource && resource.id) !== artifactText_(fileId) ||
    !/^[1-9]\d*$/.test(driveVersion) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(modifiedTime) ||
    (md5Checksum && !/^[0-9a-f]{32}$/.test(md5Checksum))
  ) {
    throw new Error("成果物のDrive版情報が不完全なため停止しました。");
  }
  return { driveVersion: driveVersion, modifiedTime: modifiedTime, md5Checksum: md5Checksum };
}

function artifactOutputContentHash_(fileId, kind) {
  var snapshot;
  if (["certificate", "guidance"].indexOf(kind) >= 0) {
    var doc = DocumentApp.openById(fileId);
    snapshot = artifactFlattenDocumentTabs_(doc.getTabs()).map(function(tab) {
      var documentTab = tab.asDocumentTab();
      var body = documentTab.getBody();
      var header = documentTab.getHeader();
      var footer = documentTab.getFooter();
      var childTypes = [];
      for (var childIndex = 0; childIndex < body.getNumChildren(); childIndex++) {
        childTypes.push(String(body.getChild(childIndex).getType()));
      }
      var tables = body.getTables().map(function(table) { return artifactDocTableMatrix_(table); });
      var footnotes = documentTab.getFootnotes() || [];
      return {
        id: tab.getId(),
        title: tab.getTitle(),
        header: header ? header.getText() : "",
        footer: footer ? footer.getText() : "",
        bodyText: body.getText(),
        childTypes: childTypes,
        tables: tables,
        footnotes: footnotes.map(function(footnote) { return footnote.getFootnoteContents().getText(); })
      };
    });
  } else if (["training", "billing"].indexOf(kind) >= 0) {
    var ss = SpreadsheetApp.openById(fileId);
    snapshot = ss.getSheets().map(function(sheet) {
      var lastRow = Math.max(1, sheet.getLastRow());
      var lastColumn = Math.max(1, sheet.getLastColumn());
      var range = sheet.getRange(1, 1, lastRow, lastColumn);
      return {
        sheetId: sheet.getSheetId(),
        name: sheet.getName(),
        hidden: sheet.isSheetHidden(),
        displayValues: range.getDisplayValues(),
        formulas: range.getFormulas(),
        notes: range.getNotes(),
        chartCount: sheet.getCharts().length,
        drawingCount: sheet.getDrawings().length,
        imageCount: sheet.getImages().length
      };
    });
  } else if (kind === "dipsCsv") {
    snapshot = DriveApp.getFileById(fileId).getBlob().getDataAsString("UTF-8");
  } else {
    throw new Error("個別成果物の本文hash計算に未対応の種別です: " + kind);
  }
  return artifactHashHex_(snapshot);
}

function artifactAssertPriorOutputVersions_(rows, recordId, kind, targetFolder, allowedOutputEmails) {
  var prior = (rows || []).filter(function(row) {
    return artifactText_(row.recordId) === artifactText_(recordId) && row.kind === kind && row.status === "created";
  });
  for (var i = 0; i < prior.length; i++) {
    var file;
    try { file = DriveApp.getFileById(prior[i].fileId); }
    catch (priorFileError) {
      throw new Error("旧版" + (RENEWAL_ARTIFACT.LABELS[kind] || "成果物") + " v" + prior[i].version + "を確認できません。復元・権限修復まで新versionを作成できません。");
    }
    artifactAssertReusableDriveItem_(
      file, targetFolder.getId(), "旧版" + (RENEWAL_ARTIFACT.LABELS[kind] || "成果物") + " v" + prior[i].version,
      allowedOutputEmails
    );
    artifactAssertExistingOutputFile_(file, prior[i], recordId, kind, prior[i].hash, targetFolder);
  }
  return true;
}

function artifactAssertOutputRootContinuity_(rows, autoRootId, recordId, kinds) {
  var expectedRoot = artifactText_(autoRootId);
  var selectedKinds = Array.isArray(kinds) ? kinds : [];
  var prior = (rows || []).filter(function(row) {
    return artifactText_(row.recordId) === artifactText_(recordId) &&
      row.status === "created" && selectedKinds.indexOf(row.kind) >= 0;
  });
  for (var i = 0; i < prior.length; i++) {
    if (prior[i].kind === "ledger") {
      if (artifactText_(prior[i].folderId) !== expectedRoot) {
        throw new Error("既存成果物があるrecordIdは出力先を変更できません。旧出力先へ戻すか、担当部署で監査ログを伴う移行を行ってください。");
      }
      continue;
    }
    var folder;
    try { folder = DriveApp.getFolderById(prior[i].folderId); }
    catch (priorFolderError) { throw new Error("旧版成果物の保存先フォルダを確認できないため停止しました。"); }
    var parents = folder.getParents();
    var underExpectedRoot = false;
    while (parents.hasNext()) if (parents.next().getId() === expectedRoot) underExpectedRoot = true;
    if (!underExpectedRoot) {
      throw new Error("既存成果物があるrecordIdは出力先を変更できません。旧出力先へ戻すか、担当部署で監査ログを伴う移行を行ってください。");
    }
  }
  return true;
}

function artifactAssertExistingOutputFile_(file, registryEntry, recordId, kind, payloadHash, targetFolder) {
  if (!file || !registryEntry || !targetFolder) throw new Error("既存成果物の照合情報が不足しています。");
  var expectedName = artifactText_(registryEntry.fileName);
  var metadata;
  try { metadata = JSON.parse(artifactText_(registryEntry.metadataJson) || "{}"); }
  catch (metadataError) { throw new Error("既存成果物の本文hash metadataを解析できません。"); }
  var expectedContentHash = artifactText_(metadata.outputContentHash);
  var expectedDriveVersion = artifactText_(metadata.outputDriveVersion);
  var expectedModifiedTime = artifactText_(metadata.outputModifiedTime);
  var expectedMd5Checksum = artifactText_(metadata.outputMd5Checksum).toLowerCase();
  if (
    !/^[0-9a-f]{64}$/.test(expectedContentHash) ||
    !/^[1-9]\d*$/.test(expectedDriveVersion) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(expectedModifiedTime) ||
    (expectedMd5Checksum && !/^[0-9a-f]{32}$/.test(expectedMd5Checksum))
  ) throw new Error("既存成果物の本文hashまたはDrive版metadataがありません。");
  artifactAssertGeneratedFileIdentity_(
    file,
    expectedName,
    artifactOutputIdentity_(recordId, kind, payloadHash, registryEntry.version, expectedContentHash),
    "既存" + (RENEWAL_ARTIFACT.LABELS[kind] || "成果物")
  );
  var actualId = artifactText_(file.getId());
  var actualUrl = artifactText_(file.getUrl());
  var actualContentHash = artifactOutputContentHash_(actualId, kind);
  var actualRevision = artifactDriveRevisionState_(actualId);
  if (
    actualId !== artifactText_(registryEntry.fileId) ||
    artifactText_(registryEntry.folderId) !== artifactText_(targetFolder.getId()) ||
    !actualUrl || actualUrl.indexOf(actualId) < 0 ||
    artifactText_(registryEntry.url) !== actualUrl ||
    actualContentHash !== expectedContentHash ||
    actualRevision.driveVersion !== expectedDriveVersion ||
    actualRevision.modifiedTime !== expectedModifiedTime ||
    actualRevision.md5Checksum !== expectedMd5Checksum
  ) {
    throw new Error("既存成果物のfileId・URL・保存先・本文hash・Drive版が監査ログまたは実ファイルと一致しないため再利用を停止しました。");
  }
  return { fileId: actualId, url: actualUrl, fileName: artifactText_(file.getName()) };
}

function artifactAssertGeneratedFileIdentity_(file, expectedName, expectedIdentity, label) {
  var actualName = "";
  var actualIdentity = "";
  try {
    actualName = artifactText_(file.getName());
    actualIdentity = artifactText_(file.getDescription());
  } catch (identityReadError) {
    throw new Error(label + "の生成物識別情報を確認できないため停止しました。");
  }
  if ((artifactText_(expectedName) && actualName !== artifactText_(expectedName)) || actualIdentity !== artifactText_(expectedIdentity)) {
    throw new Error(label + "のファイル名または生成物識別情報が一致しません。別ファイルへの誤記入を防ぐため停止しました。");
  }
  return true;
}

function artifactEnsureAutoRoot_(parentFolderId, allowedOutputEmails) {
  var parentId = artifactExtractDriveId_(parentFolderId);
  if (!parentId) throw new Error("成果物の出力先フォルダが設定されていません。");
  var parent = DriveApp.getFolderById(parentId);
  var props = PropertiesService.getScriptProperties();
  var key = "RENEWAL_ARTIFACT_AUTO_ROOT_" + parent.getId();
  var matchingFolders = artifactIteratorItems_(parent.getFoldersByName(RENEWAL_ARTIFACT.AUTO_FOLDER_NAME), 2);
  if (matchingFolders.length > 1) throw new Error("同名の自動作成フォルダが複数あります。重複を整理してから再実行してください。");
  var storedId = props.getProperty(key);
  if (storedId) {
    var storedFolder;
    try { storedFolder = DriveApp.getFolderById(storedId); }
    catch (storedFolderError) { throw new Error("保存済みの自動作成フォルダを取得できないため、成果物作成を停止しました。"); }
    if (matchingFolders.length !== 1 || matchingFolders[0].getId() !== storedId) {
      throw new Error("保存済み自動作成フォルダのIDと所定フォルダ名が一致しません。誤保存を防ぐため停止しました。");
    }
    artifactAssertReusableDriveItem_(storedFolder, parentId, "自動作成フォルダ", allowedOutputEmails);
    artifactAssertGeneratedFileIdentity_(
      storedFolder,
      RENEWAL_ARTIFACT.AUTO_FOLDER_NAME,
      artifactGeneratedFileIdentity_("auto-root", parentId, ""),
      "自動作成フォルダ"
    );
    return storedFolder;
  }
  var folder = matchingFolders.length === 1 ? matchingFolders[0] : parent.createFolder(RENEWAL_ARTIFACT.AUTO_FOLDER_NAME);
  if (matchingFolders.length === 0) {
    try {
      artifactHardenNewDriveItem_(folder, "新規自動作成フォルダ");
      folder.setDescription(artifactGeneratedFileIdentity_("auto-root", parentId, ""));
    } catch (autoRootCreateError) {
      artifactThrowAfterCleanup_(autoRootCreateError, folder, "新規自動作成フォルダ", "folder");
    }
  }
  artifactAssertReusableDriveItem_(folder, parentId, "自動作成フォルダ", allowedOutputEmails);
  artifactAssertGeneratedFileIdentity_(
    folder,
    RENEWAL_ARTIFACT.AUTO_FOLDER_NAME,
    artifactGeneratedFileIdentity_("auto-root", parentId, ""),
    "自動作成フォルダ"
  );
  props.setProperty(key, folder.getId());
  return folder;
}

function artifactEnsureRecordFolder_(autoRoot, record, allowedOutputEmails) {
  var props = PropertiesService.getScriptProperties();
  var recordId = artifactText_(record.recordId);
  var key = "RENEWAL_ARTIFACT_RECORD_FOLDER_" + artifactShortKey_(autoRoot.getId() + "|" + recordId);
  var name = ("更新講習_" + artifactSafeName_(recordId) + "_" + artifactSafeName_(artifactRecordName_(record))).slice(0, 100);
  var matchingFolders = artifactIteratorItems_(autoRoot.getFoldersByName(name), 2);
  if (matchingFolders.length > 1) throw new Error("同名の対象者フォルダが複数あります。recordIdを確認し、重複を整理してください。");
  var storedId = props.getProperty(key);
  if (storedId) {
    var storedFolder;
    try { storedFolder = DriveApp.getFolderById(storedId); }
    catch (storedFolderError) { throw new Error("保存済みの対象者フォルダを取得できないため、成果物作成を停止しました。"); }
    if (matchingFolders.length === 1 && matchingFolders[0].getId() !== storedId) {
      throw new Error("保存済み対象者フォルダとは別に同名フォルダがあります。誤保存を防ぐため停止しました。");
    }
    artifactAssertReusableDriveItem_(storedFolder, autoRoot.getId(), "対象者フォルダ", allowedOutputEmails);
    artifactAssertGeneratedFileIdentity_(
      storedFolder,
      "",
      artifactGeneratedFileIdentity_("record-folder", autoRoot.getId(), recordId),
      "対象者フォルダ"
    );
    return storedFolder;
  }
  var folder = matchingFolders.length === 1 ? matchingFolders[0] : autoRoot.createFolder(name);
  if (matchingFolders.length === 0) {
    try {
      artifactHardenNewDriveItem_(folder, "新規対象者フォルダ");
      folder.setDescription(artifactGeneratedFileIdentity_("record-folder", autoRoot.getId(), recordId));
    } catch (recordFolderCreateError) {
      artifactThrowAfterCleanup_(recordFolderCreateError, folder, "新規対象者フォルダ", "folder");
    }
  }
  artifactAssertReusableDriveItem_(folder, autoRoot.getId(), "対象者フォルダ", allowedOutputEmails);
  artifactAssertGeneratedFileIdentity_(
    folder,
    name,
    artifactGeneratedFileIdentity_("record-folder", autoRoot.getId(), recordId),
    "対象者フォルダ"
  );
  props.setProperty(key, folder.getId());
  return folder;
}

function artifactEnsureRegistry_(autoRoot, allowedOutputEmails) {
  var props = PropertiesService.getScriptProperties();
  var key = "RENEWAL_ARTIFACT_REGISTRY_" + autoRoot.getId();
  var matchingRegistryFiles = artifactIteratorItems_(autoRoot.getFilesByName(RENEWAL_ARTIFACT.REGISTRY_FILE_NAME), 2);
  if (matchingRegistryFiles.length > 1) throw new Error("同名の成果物レジストリが複数あります。重複を整理してから再実行してください。");
  var storedId = props.getProperty(key);
  if (storedId) {
    var storedFile;
    try {
      storedFile = DriveApp.getFileById(storedId);
    } catch (storedRegistryFileError) {
      throw new Error("保存済みの成果物レジストリを取得できないため、成果物作成を停止しました。");
    }
    if (matchingRegistryFiles.length !== 1 || matchingRegistryFiles[0].getId() !== storedId) {
      throw new Error("保存済み成果物レジストリのIDと所定ファイル名が一致しません。誤記入を防ぐため停止しました。");
    }
    artifactAssertReusableDriveItem_(storedFile, autoRoot.getId(), "成果物レジストリ", allowedOutputEmails);
    var storedSs;
    try {
      storedSs = SpreadsheetApp.openById(storedId);
    } catch (storedRegistryOpenError) {
      throw new Error("保存済みの成果物レジストリを開けないため、成果物作成を停止しました。");
    }
    var storedSheet = artifactAssertRegistryStructure_(storedFile, storedSs, autoRoot.getId());
    return { file: storedFile, spreadsheet: storedSs, sheet: storedSheet };
  }
  if (matchingRegistryFiles.length === 1) {
    var existingFile = matchingRegistryFiles[0];
    artifactAssertReusableDriveItem_(existingFile, autoRoot.getId(), "成果物レジストリ", allowedOutputEmails);
    var existingSs;
    try {
      existingSs = SpreadsheetApp.openById(existingFile.getId());
    } catch (existingRegistryOpenError) {
      throw new Error("既存の成果物レジストリを開けないため、成果物作成を停止しました。");
    }
    var existingSheet = artifactAssertRegistryStructure_(existingFile, existingSs, autoRoot.getId());
    props.setProperty(key, existingFile.getId());
    return { file: existingFile, spreadsheet: existingSs, sheet: existingSheet };
  }
  var ss = SpreadsheetApp.create(RENEWAL_ARTIFACT.REGISTRY_FILE_NAME);
  var file = DriveApp.getFileById(ss.getId());
  try {
    file.moveTo(autoRoot);
    artifactHardenNewDriveItem_(file, "新規成果物レジストリ");
    file.setDescription(artifactGeneratedFileIdentity_("registry", autoRoot.getId(), ""));
    artifactAssertReusableDriveItem_(file, autoRoot.getId(), "成果物レジストリ", allowedOutputEmails);
    var sheet = ss.getSheets()[0];
    sheet.setName(RENEWAL_ARTIFACT.REGISTRY_SHEET_NAME);
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    artifactInitializeRegistryHeader_(sheet);
    SpreadsheetApp.flush();
    artifactAssertRegistryStructure_(file, ss, autoRoot.getId());
    props.setProperty(key, file.getId());
    return { file: file, spreadsheet: ss, sheet: sheet };
  } catch (createRegistryError) {
    artifactThrowAfterCleanup_(createRegistryError, file, "新規成果物レジストリ", "file");
  }
}

function artifactInitializeRegistryHeader_(sheet) {
  if (sheet.getMaxColumns() < RENEWAL_ARTIFACT_REGISTRY_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), RENEWAL_ARTIFACT_REGISTRY_HEADERS.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() > 0 && artifactLedgerTemplateRowsHaveData_(sheet.getDataRange().getDisplayValues(), false)) {
    throw new Error("新規成果物レジストリの初期シートが空ではないため停止しました。");
  }
  sheet.getRange(1, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).setValues([RENEWAL_ARTIFACT_REGISTRY_HEADERS]);
  sheet.getRange(1, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length)
    .setBackground("#16436B").setFontColor("#FFFFFF").setFontWeight("bold");
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).setNumberFormat("@");
  }
  sheet.setFrozenRows(1);
}

function artifactRegistryRowsIssue_(values) {
  var rows = Array.isArray(values) ? values : [];
  var kinds = ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"];
  var numberedKinds = ["ledger", "certificate", "dipsCsv", "billing"];
  var createdVersionKeys = {};
  var individualFileIds = {};
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    var row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    var sheetRow = rowIndex + 2;
    var hasAnyValue = row.some(function(value) { return !!artifactText_(value); });
    if (!hasAnyValue) return sheetRow + "行目が空行です。監査ログの途中に空行は置けません。";
    var timestampMatch = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(artifactText_(row[0]));
    if (
      !timestampMatch ||
      !artifactValidIsoDateOrBlank_(timestampMatch[1]) ||
      !artifactValidTime_(timestampMatch[2].slice(0, 5)) ||
      Number(timestampMatch[2].slice(6, 8)) > 59
    ) {
      return sheetRow + "行目の作成日時が正しくありません。";
    }
    if (!artifactText_(row[1])) return sheetRow + "行目のrecordIdがありません。";
    var kind = artifactText_(row[2]);
    if (kinds.indexOf(kind) < 0) return sheetRow + "行目の種別が正しくありません。";
    var hash = artifactText_(row[3]);
    if (!/^[0-9a-f]{64}$/.test(hash)) return sheetRow + "行目のpayloadHashが正しくありません。";
    var version = artifactText_(row[4]);
    if (!/^[1-9]\d*$/.test(version)) return sheetRow + "行目のversionが正の整数ではありません。";
    var status = artifactText_(row[5]);
    if (["created", "error"].indexOf(status) < 0) return sheetRow + "行目の状態が正しくありません。";
    if (!artifactText_(row[9])) return sheetRow + "行目の保存先folderIdがありません。";
    if (!artifactIsEmail_(row[10])) return sheetRow + "行目の実行者メールがありません、または形式が正しくありません。";
    if (status === "created") {
      if (!artifactText_(row[6])) return sheetRow + "行目の作成済みfileIdがありません。";
      if (!/^https:\/\//.test(artifactText_(row[7]))) return sheetRow + "行目の作成済みURLが正しくありません。";
      if (!artifactText_(row[8])) return sheetRow + "行目の作成済みファイル名がありません。";
      if (numberedKinds.indexOf(kind) >= 0 && !artifactText_(row[11])) return sheetRow + "行目の採番情報がありません。";
      var createdVersionKey = artifactText_(row[1]) + "|" + kind + "|" + version;
      if (createdVersionKeys[createdVersionKey]) return sheetRow + "行目は同一recordId・種別・versionの作成済み監査行と重複しています。";
      createdVersionKeys[createdVersionKey] = true;
      if (kind !== "ledger") {
        var individualFileId = artifactText_(row[6]);
        if (individualFileIds[individualFileId]) return sheetRow + "行目の個別成果物fileIdが別の作成済み監査行と重複しています。";
        individualFileIds[individualFileId] = true;
      }
    }
    var metadata;
    try { metadata = JSON.parse(artifactText_(row[13])); }
    catch (metadataError) { return sheetRow + "行目のmetadataJsonを解析できません。"; }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return sheetRow + "行目のmetadataJsonがオブジェクトではありません。";
    if (
      artifactText_(metadata.kind) !== kind ||
      Number(metadata.version || 0) !== Number(version) ||
      artifactText_(metadata.payloadHash) !== hash
    ) {
      return sheetRow + "行目のmetadataJsonが種別・version・payloadHashと一致しません。";
    }
    if (status === "created" && kind === "ledger") {
      if (
        Number(metadata.ledgerRow || 0) < 3 || !artifactText_(metadata.ledgerSheetName) ||
        !/^[0-9a-f]{64}$/.test(artifactText_(metadata.ledgerVisibleHash)) ||
        !/^[0-9a-f]{64}$/.test(artifactText_(metadata.ledgerStateHash))
      ) return sheetRow + "行目の台帳行監査metadataが不完全です。";
    }
    if (status === "created" && kind !== "ledger") {
      var outputMd5 = artifactText_(metadata.outputMd5Checksum).toLowerCase();
      if (
        !/^[0-9a-f]{64}$/.test(artifactText_(metadata.outputContentHash)) ||
        !/^[1-9]\d*$/.test(artifactText_(metadata.outputDriveVersion)) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(artifactText_(metadata.outputModifiedTime)) ||
        (outputMd5 && !/^[0-9a-f]{32}$/.test(outputMd5))
      ) return sheetRow + "行目の個別成果物本文hashまたはDrive版metadataが不完全です。";
    }
    if (Number(row[14] || 0) !== Number(RENEWAL_ARTIFACT.SCHEMA_VERSION)) {
      return sheetRow + "行目のschemaVersionが現行版と一致しません。";
    }
  }
  return "";
}

function artifactRegistryGlobalRowsIssue_(rows) {
  var source = Array.isArray(rows) ? rows : [];
  var versionKeys = {};
  var chains = {};
  var individualFileIds = {};
  for (var i = 0; i < source.length; i++) {
    var row = source[i] || {};
    if (artifactText_(row.status) !== "created") continue;
    var recordId = artifactText_(row.recordId);
    var kind = artifactText_(row.kind);
    var version = Number(row.version || 0);
    var versionKey = recordId + "|" + kind + "|" + version;
    if (versionKeys[versionKey]) return "同一recordId・種別・versionの作成済み監査行が全レジストリ間で重複しています: " + versionKey;
    versionKeys[versionKey] = true;
    var chainKey = recordId + "|" + kind;
    if (!chains[chainKey]) chains[chainKey] = [];
    chains[chainKey].push(version);
    if (kind !== "ledger") {
      var fileId = artifactText_(row.fileId);
      if (individualFileIds[fileId]) return "個別成果物fileIdが全レジストリ間で重複しています: " + fileId;
      individualFileIds[fileId] = true;
    }
  }
  var chainKeys = Object.keys(chains);
  for (var chainIndex = 0; chainIndex < chainKeys.length; chainIndex++) {
    var versions = chains[chainKeys[chainIndex]].sort(function(left, right) { return left - right; });
    for (var versionIndex = 0; versionIndex < versions.length; versionIndex++) {
      if (versions[versionIndex] !== versionIndex + 1) return "作成済みversionが全レジストリ通算で1から連続していません: " + chainKeys[chainIndex];
    }
  }
  return "";
}

function artifactAssertRegistryStructure_(file, ss, autoRootId) {
  artifactAssertGeneratedFileIdentity_(
    file,
    RENEWAL_ARTIFACT.REGISTRY_FILE_NAME,
    artifactGeneratedFileIdentity_("registry", autoRootId, ""),
    "成果物レジストリ"
  );
  var sheets = ss.getSheets();
  var sheet = ss.getSheetByName(RENEWAL_ARTIFACT.REGISTRY_SHEET_NAME);
  if (!sheet || sheets.length !== 1 || sheets[0].getSheetId() !== sheet.getSheetId()) {
    throw new Error("成果物レジストリは「" + RENEWAL_ARTIFACT.REGISTRY_SHEET_NAME + "」1シートだけである必要があります。誤記入を防ぐため停止しました。");
  }
  if (sheet.getMaxColumns() < RENEWAL_ARTIFACT_REGISTRY_HEADERS.length) {
    throw new Error("成果物レジストリの列数が不足しているため停止しました。");
  }
  var current = sheet.getRange(1, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues()[0];
  if (artifactCanonicalJson_(current) !== artifactCanonicalJson_(RENEWAL_ARTIFACT_REGISTRY_HEADERS)) {
    throw new Error("成果物レジストリの完全ヘッダーが一致しないため停止しました。既存データは上書きしません。");
  }
  if (sheet.getFrozenRows() !== 1 || sheet.getLastColumn() > RENEWAL_ARTIFACT_REGISTRY_HEADERS.length) {
    throw new Error("成果物レジストリの固定行または列構造が一致しないため停止しました。");
  }
  var lastRow = Math.max(1, sheet.getLastRow());
  if (artifactLedgerTemplateRowsHaveData_(
    sheet.getRange(1, 1, lastRow, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getFormulas(),
    false
  )) {
    throw new Error("成果物レジストリに想定外の数式があるため停止しました。");
  }
  if (lastRow >= 2) {
    var rowIssue = artifactRegistryRowsIssue_(
      sheet.getRange(2, 1, lastRow - 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues()
    );
    if (rowIssue) throw new Error("成果物レジストリの監査行が不正です。" + rowIssue);
  }
  return sheet;
}

function artifactReadRegistryRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues();
  return values.map(function(row, index) {
    return {
      sheetRow: index + 2,
      timestamp: row[0], recordId: row[1], kind: row[2], hash: row[3],
      version: Number(row[4] || 0), status: row[5], fileId: row[6], url: row[7],
      fileName: row[8], folderId: row[9], actor: row[10], documentNumbers: row[11],
      message: row[12], metadataJson: row[13], schemaVersion: row[14]
    };
  });
}

function artifactReadAllRegistryRows_(allowedOutputEmails) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var rows = [];
  var keyPrefix = "RENEWAL_ARTIFACT_REGISTRY_";
  Object.keys(props).forEach(function(key) {
    if (key.indexOf(keyPrefix) !== 0 || !props[key]) return;
    var autoRootId = key.slice(keyPrefix.length);
    var registryFile;
    try {
      registryFile = DriveApp.getFileById(props[key]);
    } catch (registryFileError) {
      throw new Error("保存済みの成果物レジストリを取得できません。生成台帳を復元し、権限を修復してください。");
    }
    artifactAssertReusableDriveItem_(registryFile, autoRootId, "成果物レジストリ", allowedOutputEmails);
    try {
      var ss = SpreadsheetApp.openById(props[key]);
      var sheet = artifactAssertRegistryStructure_(registryFile, ss, autoRootId);
      rows = rows.concat(artifactReadRegistryRows_(sheet));
    } catch (registryReadError) {
      throw new Error("保存済みの成果物レジストリを読み込めません。生成台帳を復元し、権限を修復してください。");
    }
  });
  var globalIssue = artifactRegistryGlobalRowsIssue_(rows);
  if (globalIssue) throw new Error("全成果物レジストリの版管理が不正です。" + globalIssue);
  return rows;
}

function artifactRollbackCreated_(created, kind) {
  if (!created || !created.fileId) return;
  if (kind === "ledger" && created.ledgerRow) {
    var ss = SpreadsheetApp.openById(created.fileId);
    var sheetName = artifactText_(created.ledgerSheetName);
    var recordId = artifactText_(created.ledgerRecordId);
    var payloadHash = artifactText_(created.ledgerPayloadHash);
    var visibleHash = artifactText_(created.ledgerVisibleHash);
    var stateHash = artifactText_(created.ledgerStateHash);
    var sheet = sheetName ? ss.getSheetByName(sheetName) : null;
    if (!sheet || !recordId || !/^[0-9a-f]{64}$/.test(payloadHash) || !/^[0-9a-f]{64}$/.test(visibleHash) || !/^[0-9a-f]{64}$/.test(stateHash) || created.ledgerRow > sheet.getMaxRows()) {
      throw new Error("台帳rollbackの対象行識別情報が不足しているため、誤消去防止のため削除しませんでした。");
    }
    var visible = sheet.getRange(created.ledgerRow, 2, 1, 8).getDisplayValues()[0];
    var audit = sheet.getRange(created.ledgerRow, 10, 1, 5).getDisplayValues()[0];
    if (
      artifactText_(audit[0]) !== recordId ||
      Number(audit[1] || 0) !== Number(created.ledgerVersion || 0) ||
      artifactText_(audit[2]).indexOf(payloadHash + " / ") !== 0 ||
      artifactText_(audit[3]) !== visibleHash ||
      artifactText_(audit[4]) !== stateHash ||
      artifactLedgerVisibleHash_(visible) !== visibleHash ||
      artifactLedgerStateHash_(visible, audit.slice(0, 4)) !== stateHash
    ) {
      throw new Error("台帳rollbackのrecordId・version・payloadHash・状態hashが一致しないため、誤消去防止のため削除しませんでした。");
    }
    sheet.getRange(created.ledgerRow, 2, 1, 13).clearContent();
    SpreadsheetApp.flush();
    if (artifactLedgerTemplateRowsHaveData_(sheet.getRange(created.ledgerRow, 2, 1, 13).getDisplayValues(), false)) {
      throw new Error("台帳rollback対象行を完全に消去できませんでした。【担当部署に確認が必要】");
    }
    var last = Math.max(3, sheet.getLastRow());
    var remainingIssue = artifactAnnualLedgerRowsIssue_(sheet.getRange(3, 2, last - 2, 13).getDisplayValues());
    if (remainingIssue) throw new Error("台帳rollback後の全体検証に失敗しました。【担当部署に確認が必要】" + remainingIssue);
    return;
  }
  var rollbackFile = DriveApp.getFileById(created.fileId);
  try {
    rollbackFile.setTrashed(true);
  } catch (rollbackTrashError) {
    var rollbackInfo = artifactDriveItemTrackingInfo_(rollbackFile, "作成途中" + (RENEWAL_ARTIFACT.LABELS[kind] || "成果物"), "file");
    var rollbackPersistIssue = artifactPersistCleanupFailure_(rollbackInfo, "rollback", rollbackTrashError);
    var trackedRollbackError = new Error(
      "作成途中成果物の削除に失敗しました。【担当部署に確認が必要】ID=" + (rollbackInfo.fileId || created.fileId) +
      " / URL=" + (rollbackInfo.url || artifactText_(created.url)) + " / cleanup=" + artifactErrorMessage_(rollbackTrashError) +
      (rollbackPersistIssue ? " / " + rollbackPersistIssue : "")
    );
    trackedRollbackError.artifactProvisional = rollbackInfo;
    throw trackedRollbackError;
  }
}

function artifactAppendRegistry_(sheet, entry) {
  var actor = "";
  try { actor = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ""; } catch (ignored) {}
  var values = [
    artifactNowText_(), artifactText_(entry.recordId), artifactText_(entry.kind), artifactText_(entry.hash),
    Number(entry.version || 1), artifactText_(entry.status), artifactText_(entry.fileId), artifactText_(entry.url),
    artifactText_(entry.fileName), artifactText_(entry.folderId), actor,
    artifactText_(entry.documentNumbers), artifactText_(entry.message),
    JSON.stringify(entry.metadata || {}), RENEWAL_ARTIFACT.SCHEMA_VERSION
  ];
  var targetRow = sheet.getLastRow() + 1;
  var appended = false;
  var displayValues;
  try {
    if (targetRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
    sheet.getRange(targetRow, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).setNumberFormat("@");
    sheet.appendRow(artifactSafeSheetRow_(values));
    appended = true;
    SpreadsheetApp.flush();
    displayValues = sheet.getRange(targetRow, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues()[0];
    var expectedDisplay = values.map(function(value) { return artifactText_(value); });
    var issue = artifactRegistryRowsIssue_(
      sheet.getRange(2, 1, targetRow - 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues()
    );
    if (issue || artifactCanonicalJson_(displayValues) !== artifactCanonicalJson_(expectedDisplay)) {
      throw new Error("成果物レジストリ追記後の読戻し検証に失敗しました。" + (issue || "期待値と一致しません。"));
    }
  } catch (appendError) {
    var cleanupIssue = "";
    if (appended) {
      try {
        var actual = displayValues || sheet.getRange(targetRow, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues()[0];
        if (
          sheet.getLastRow() === targetRow &&
          artifactText_(actual[1]) === artifactText_(entry.recordId) &&
          artifactText_(actual[2]) === artifactText_(entry.kind) &&
          artifactText_(actual[3]) === artifactText_(entry.hash)
        ) {
          sheet.deleteRow(targetRow);
          SpreadsheetApp.flush();
        } else {
          cleanupIssue = " 【担当部署に確認が必要】未検証の監査行を安全に特定できません。";
        }
      } catch (registryCleanupError) {
        cleanupIssue = " 【担当部署に確認が必要】未検証の監査行を削除できませんでした: " + artifactErrorMessage_(registryCleanupError);
      }
    }
    throw new Error(artifactErrorMessage_(appendError) + cleanupIssue);
  }
  return {
    sheetRow: targetRow,
    timestamp: displayValues[0], recordId: displayValues[1], kind: displayValues[2], hash: displayValues[3],
    version: Number(displayValues[4] || 0), status: displayValues[5], fileId: displayValues[6], url: displayValues[7],
    fileName: displayValues[8], folderId: displayValues[9], actor: displayValues[10], documentNumbers: displayValues[11],
    message: displayValues[12], metadataJson: displayValues[13], schemaVersion: displayValues[14]
  };
}

function artifactFindExisting_(rows, recordId, kind, hash) {
  var latest = null;
  var latestCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.recordId !== artifactText_(recordId) || row.kind !== kind || row.status !== "created") continue;
    if (!latest || Number(row.version || 0) > Number(latest.version || 0)) {
      latest = row;
      latestCount = 1;
    } else if (Number(row.version || 0) === Number(latest.version || 0)) {
      latestCount++;
    }
  }
  if (latestCount > 1) throw new Error("同一recordId・種別・最新versionの作成済み監査行が複数あります。重複成果物を担当部署で確認してください。");
  // 同じ内容でも旧版なら再利用せず、訂正版として新versionを作る。
  return latest && latest.hash === hash ? latest : null;
}

function artifactOriginalCertificateDates_(rows, recordId) {
  var result = { hasFormalArtifact: false, missingMetadata: false, conflict: false, issuedDate: "", expiry: "" };
  var formalKinds = ["ledger", "certificate", "dipsCsv"];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.recordId !== artifactText_(recordId) || row.status !== "created" || formalKinds.indexOf(row.kind) < 0) continue;
    result.hasFormalArtifact = true;
    var metadata;
    try { metadata = JSON.parse(artifactText_(row.metadataJson) || "{}"); }
    catch (metadataError) { result.missingMetadata = true; continue; }
    var issuedDate = artifactValidIsoDateOrBlank_(metadata.certificateIssuedDate);
    var expiry = artifactValidIsoDateOrBlank_(metadata.certificateExpiry);
    if (!issuedDate || !expiry) {
      result.missingMetadata = true;
      continue;
    }
    if (!result.issuedDate) {
      result.issuedDate = issuedDate;
      result.expiry = expiry;
    } else if (result.issuedDate !== issuedDate || result.expiry !== expiry) {
      result.conflict = true;
    }
  }
  return result;
}

function artifactValidateCertificateDateContinuity_(rows, record, errors, warnings) {
  var original = artifactOriginalCertificateDates_(rows || [], record && record.recordId);
  if (!original.hasFormalArtifact) return original;
  if (original.missingMetadata) {
    warnings.push("既存正式成果物に初回発行日・元期限の監査metadataがありません。担当部署による台帳原本確認が必要です。");
    errors.push("再発行は未対応です。既存成果物の初回発行日・元期限を自動確認できないため、担当部署に確認が必要です。");
    return original;
  }
  if (original.conflict) {
    errors.push("既存正式成果物間で初回発行日・元期限が不一致です。再発行は未対応のため、担当部署に確認が必要です。");
    return original;
  }
  var proposedIssuedDate = artifactValidIsoDateOrBlank_(record.certificateIssuedDate);
  var proposedExpiry = proposedIssuedDate ? artifactAddCalendarMonthsMinusOne_(proposedIssuedDate) : artifactValidIsoDateOrBlank_(record.certificateExpiry);
  if (proposedIssuedDate && (proposedIssuedDate !== original.issuedDate || proposedExpiry !== original.expiry)) {
    errors.push("再発行は未対応です。初回発行日（" + original.issuedDate + "）・元期限（" + original.expiry + "）を維持し、担当部署に確認が必要です。");
  }
  return original;
}

function artifactAssertCertificateDateContinuity_(rows, record) {
  var errors = [];
  artifactValidateCertificateDateContinuity_(rows, record, errors, []);
  if (errors.length) throw new Error(errors.join(" "));
}

function artifactAssertExistingLedgerRow_(registryEntry, recordId, payloadHash, autoRoot, settings) {
  var metadata;
  try { metadata = JSON.parse(artifactText_(registryEntry && registryEntry.metadataJson) || "{}"); }
  catch (metadataError) { throw new Error("既存台帳行の監査metadataを読み取れないため、再利用を停止しました。"); }
  var row = Number(metadata.ledgerRow || 0);
  var sheetName = artifactText_(metadata.ledgerSheetName);
  var metadataVisibleHash = artifactText_(metadata.ledgerVisibleHash);
  var metadataStateHash = artifactText_(metadata.ledgerStateHash);
  var issuedDate = artifactValidIsoDateOrBlank_(metadata.certificateIssuedDate);
  if (!registryEntry || !registryEntry.fileId || row < 3 || !sheetName || !issuedDate || !autoRoot || !/^[0-9a-f]{64}$/.test(metadataVisibleHash) || !/^[0-9a-f]{64}$/.test(metadataStateHash)) {
    throw new Error("既存台帳行の位置情報がないため、成果物を再利用できません。台帳とレジストリを確認してください。");
  }
  var ss;
  var ledgerFile;
  try {
    ledgerFile = DriveApp.getFileById(registryEntry.fileId);
    ss = SpreadsheetApp.openById(registryEntry.fileId);
  }
  catch (openError) { throw new Error("既存台帳の監査対象シートを開けないため、再利用を停止しました。"); }
  var templateId = artifactTemplateId_("ledger", settings || {});
  artifactAssertLedgerTemplateClean_(templateId);
  var templateBase = SpreadsheetApp.openById(templateId).getSheetByName("ベース");
  var sheet = artifactAssertAnnualLedgerStructure_(
    ledgerFile, ss, autoRoot.getId(), Number(issuedDate.slice(0, 4)), templateBase
  );
  if (sheet.getName() !== sheetName) throw new Error("既存台帳行のシート名が監査metadataと一致しないため、再利用を停止しました。");
  if (!sheet || row > sheet.getMaxRows()) throw new Error("既存台帳の監査対象行が見つからないため、再利用を停止しました。");
  var audit = sheet.getRange(row, 10, 1, 5).getDisplayValues()[0];
  var visible = sheet.getRange(row, 2, 1, 8).getDisplayValues()[0];
  var currentVisibleHash = artifactLedgerVisibleHash_(visible);
  var currentStateHash = artifactLedgerStateHash_(visible, audit.slice(0, 4));
  if (
    artifactText_(audit[0]) !== artifactText_(recordId) ||
    Number(audit[1] || 0) !== Number(registryEntry.version || 0) ||
    artifactText_(audit[2]).indexOf(artifactText_(payloadHash) + " / ") !== 0 ||
    artifactText_(audit[3]) !== metadataVisibleHash ||
    artifactText_(audit[4]) !== metadataStateHash ||
    currentVisibleHash !== metadataVisibleHash ||
    currentStateHash !== metadataStateHash
  ) {
    throw new Error("既存台帳行のrecordId・version・payloadHash・可視値hash・状態hashがレジストリと一致しないため、再利用を停止しました。");
  }
  return true;
}

function artifactNextVersion_(rows, recordId, kind) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].recordId === artifactText_(recordId) && rows[i].kind === kind && rows[i].status === "created") {
      max = Math.max(max, Number(rows[i].version || 0));
    }
  }
  return max + 1;
}

function artifactFindRecordAssignments_(rows, recordId) {
  var result = {};
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].recordId !== recordId || !rows[i].metadataJson) continue;
    try {
      var metadata = JSON.parse(rows[i].metadataJson);
      artifactApplyMissing_(result, metadata.recordUpdates || {});
    } catch (ignored) {}
  }
  return result;
}

function artifactRecordNumberState_(rows, recordId) {
  var fields = ["certificateNo", "dipsApplicantId", "quoteNo", "invoiceNo"];
  var values = {};
  for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) values[fields[fieldIndex]] = {};
  function add(field, value) {
    var normalized = artifactText_(value);
    if (normalized && values[field]) values[field][normalized] = true;
  }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    if (artifactText_(row.recordId) !== artifactText_(recordId) || ["created", "error"].indexOf(artifactText_(row.status)) < 0) continue;
    var metadata = {};
    try { metadata = JSON.parse(artifactText_(row.metadataJson) || "{}"); }
    catch (metadataError) { throw new Error("同一recordIdの採番metadataを解析できないため停止しました。"); }
    var updates = metadata && metadata.recordUpdates && typeof metadata.recordUpdates === "object" ? metadata.recordUpdates : {};
    for (var updateIndex = 0; updateIndex < fields.length; updateIndex++) add(fields[updateIndex], updates[fields[updateIndex]]);
    var numbers = artifactText_(row.documentNumbers).split(";");
    if (["ledger", "certificate"].indexOf(row.kind) >= 0) add("certificateNo", numbers[0]);
    if (row.kind === "dipsCsv") {
      add("certificateNo", numbers[0]);
      add("dipsApplicantId", numbers[1]);
    }
    if (row.kind === "billing") {
      add("quoteNo", numbers[0]);
      add("invoiceNo", numbers[1]);
    }
  }
  var assignments = {};
  var conflicts = [];
  for (var resultIndex = 0; resultIndex < fields.length; resultIndex++) {
    var field = fields[resultIndex];
    var candidates = Object.keys(values[field]);
    if (candidates.length > 1) conflicts.push(field + ": " + candidates.join(" / "));
    else if (candidates.length === 1) assignments[field] = candidates[0];
  }
  return { assignments: assignments, conflicts: conflicts };
}

function artifactAssertRecordNumberContinuity_(state, record, kinds) {
  state = state || { assignments: {}, conflicts: [] };
  record = record || {};
  kinds = Array.isArray(kinds) ? kinds : [];
  if (state.conflicts && state.conflicts.length) {
    throw new Error("同一recordIdの既存採番が複数に競合しています。専用の取消・訂正手順で担当部署が解消してください: " + state.conflicts.join(" / "));
  }
  var relevant = [];
  if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv"])) relevant.push("certificateNo");
  if (kinds.indexOf("dipsCsv") >= 0) relevant.push("dipsApplicantId");
  if (kinds.indexOf("billing") >= 0) relevant.push("quoteNo", "invoiceNo");
  for (var i = 0; i < relevant.length; i++) {
    var field = relevant[i];
    var assigned = artifactText_(state.assignments && state.assignments[field]);
    var proposed = artifactText_(record[field]);
    if (assigned && proposed && assigned !== proposed) {
      throw new Error("同一recordIdの" + field + "は既存採番「" + assigned + "」から変更できません。番号変更の専用取消・訂正ワークフローは未対応です。");
    }
    if (assigned && !proposed) record[field] = assigned;
  }
  return record;
}

function artifactApplyMissing_(target, source) {
  source = source || {};
  Object.keys(source).forEach(function(key) {
    if (target[key] === undefined || target[key] === null || target[key] === "") target[key] = source[key];
  });
  return target;
}

function artifactDriveFileExists_(fileId) {
  if (!fileId) return false;
  try {
    var file = DriveApp.getFileById(fileId);
    file.getName();
    return !file.isTrashed();
  } catch (fileCheckError) {
    throw new Error("作成済み成果物を確認できません。ファイルを復元し、権限を修復してから再実行してください。");
  }
}

function artifactNextCertificateNo_(registryRows, autoRoot, certificateIssuedDate, sequenceSeed, settings) {
  settings = settings || {};
  var prefix = "UC" + RENEWAL_ARTIFACT.ORGANIZATION_CODE + artifactYyMm_(certificateIssuedDate);
  var haystack = artifactRegistryNumberText_(registryRows);
  // レジストリが残っていない場合でも、当年台帳のB列を併せて確認する。
  var year = Number(certificateIssuedDate.slice(0, 4));
  var name = "更新講習修了証明書発行台帳_" + year + "年";
  var key = "RENEWAL_ARTIFACT_LEDGER_" + autoRoot.getId() + "_" + year;
  var props = PropertiesService.getScriptProperties();
  var storedLedgerId = props.getProperty(key);
  var candidates = artifactIteratorItems_(autoRoot.getFilesByName(name), 2);
  if (candidates.length > 1) throw new Error("同名の年次発行台帳が複数あるため、安全に採番できません。");
  if (storedLedgerId && (candidates.length !== 1 || candidates[0].getId() !== storedLedgerId)) {
    throw new Error("保存済み年次発行台帳のIDと所定ファイル名が一致しないため、安全に採番できません。");
  }
  var ledgerFile = storedLedgerId
    ? (function() {
      try { return DriveApp.getFileById(storedLedgerId); }
      catch (ledgerFileError) {
        throw new Error("保存済みの年次発行台帳を取得できません。台帳を復元し、権限を修復してください。");
      }
    })()
    : (candidates.length === 1 ? candidates[0] : null);
  if (ledgerFile) {
    artifactAssertReusableDriveItem_(ledgerFile, autoRoot.getId(), "年次発行台帳", settings.allowedOutputEmails);
    var ss;
    try { ss = SpreadsheetApp.openById(ledgerFile.getId()); }
    catch (ledgerFileError) {
      throw new Error("年次発行台帳を読み込めません。台帳を復元し、権限を修復してください。");
    }
    var templateId = artifactTemplateId_("ledger", settings);
    artifactAssertLedgerTemplateClean_(templateId);
    var templateBase = SpreadsheetApp.openById(templateId).getSheetByName("ベース");
    var sheet = artifactAssertAnnualLedgerStructure_(ledgerFile, ss, autoRoot.getId(), year, templateBase);
    var last = Math.max(3, sheet.getLastRow());
    haystack += "\n" + sheet.getRange(3, 2, last - 2, 1).getDisplayValues().join("\n");
    if (!storedLedgerId) props.setProperty(key, ledgerFile.getId());
  }
  var regex = new RegExp(prefix + "(\\d{4})", "g");
  var max = 0;
  var match;
  while ((match = regex.exec(haystack)) !== null) max = Math.max(max, Number(match[1]));
  max = Math.max(max, artifactSequenceSeedValue_(sequenceSeed, prefix, 4));
  if (max >= 9999) throw new Error(prefix + "の月内連番が上限9999件に達しています。");
  return prefix + artifactPad_(max + 1, 4);
}

function artifactNextDipsApplicantId_(registryRows, courseDate, sequenceSeed) {
  var prefix = artifactYyMm_(courseDate);
  var haystack = artifactRegistryNumberText_(registryRows);
  var regex = new RegExp("(?:^|[^0-9])" + prefix + "(\\d{2})(?:[^0-9]|$)", "g");
  var max = 0;
  var match;
  while ((match = regex.exec(haystack)) !== null) max = Math.max(max, Number(match[1]));
  max = Math.max(max, artifactSequenceSeedValue_(sequenceSeed, prefix, 2));
  if (max >= 99) throw new Error("DIPS申請者ID " + prefix + " の月内連番が99件に達しています。手動で続行せず担当部署へ確認してください。");
  return prefix + artifactPad_(max + 1, 2);
}

function artifactSequenceSeedValue_(seed, expectedPrefix, sequenceWidth) {
  var text = artifactText_(seed);
  var prefix = artifactText_(expectedPrefix);
  var width = Number(sequenceWidth);
  if (!text || !prefix || !isFinite(width) || width < 1) return 0;
  var escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var match = new RegExp("^" + escapedPrefix + "(\\d{" + width + "})$").exec(text);
  return match ? Number(match[1]) : 0;
}

function artifactPrepareBillingIdentity_(record, registryRows, updates) {
  var today = artifactTodayIso_();
  record.quoteDate = artifactValidIsoDateOrBlank_(record.quoteDate) || today;
  record.invoiceDate = artifactValidIsoDateOrBlank_(record.invoiceDate) || today;
  record.quoteExpiry = artifactValidIsoDateOrBlank_(record.quoteExpiry) || artifactQuoteDefaultExpiry_(record.quoteDate);
  record.paymentDueDate = artifactRequireIsoDate_(record.paymentDueDate, "入金期限");
  if (!artifactText_(record.quoteNo)) record.quoteNo = artifactNextDailyNumber_(registryRows, "QT", record.quoteDate);
  if (!artifactText_(record.invoiceNo)) record.invoiceNo = artifactNextDailyNumber_(registryRows, "INV", record.invoiceDate);
  updates.quoteNo = record.quoteNo;
  updates.quoteDate = record.quoteDate;
  updates.quoteExpiry = record.quoteExpiry;
  updates.invoiceNo = record.invoiceNo;
  updates.invoiceDate = record.invoiceDate;
  updates.paymentDueDate = record.paymentDueDate;
}

function artifactNextDailyNumber_(registryRows, code, isoDate) {
  var prefix = artifactComposeBillingNumberPrefix_(code, RENEWAL_ARTIFACT.BILLING_NUMBER_NAMESPACE, isoDate);
  var regex = new RegExp(prefix + "(\\d+)", "g");
  var haystack = artifactRegistryNumberText_(registryRows);
  var max = 0;
  var match;
  while ((match = regex.exec(haystack)) !== null) max = Math.max(max, Number(match[1]));
  return prefix + (max + 1);
}

function artifactComposeBillingNumberPrefix_(documentCode, namespace, isoDate) {
  var code = artifactText_(documentCode);
  var namespaceText = artifactText_(namespace);
  var date = artifactValidIsoDateOrBlank_(isoDate);
  if (["QT", "INV"].indexOf(code) < 0 || !namespaceText || !date) {
    throw new Error("見積・請求番号の採番条件が正しくありません。");
  }
  return code + "-" + namespaceText + "-" + date.replace(/-/g, "") + "-";
}

function artifactRegistryNumberText_(rows) {
  var parts = [];
  for (var i = 0; i < rows.length; i++) {
    parts.push(rows[i].documentNumbers || "");
    parts.push(rows[i].metadataJson || "");
    parts.push(rows[i].fileName || "");
  }
  return parts.join("\n");
}

function artifactDocumentNumbers_(record, kind) {
  if (kind === "billing") return artifactText_(record.quoteNo) + ";" + artifactText_(record.invoiceNo);
  if (kind === "dipsCsv") return artifactText_(record.certificateNo) + ";" + artifactText_(record.dipsApplicantId);
  if (["ledger", "certificate"].indexOf(kind) >= 0) return artifactText_(record.certificateNo);
  return "";
}

function artifactAssertEffectiveNumberRules_(record, kinds) {
  var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
  var certificateIssuedDate = artifactValidIsoDateOrBlank_(record.certificateIssuedDate);
  if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv"])) {
    if (!/^UC0157\d{8}$/.test(artifactText_(record.certificateNo))) throw new Error("修了証明書番号は UC0157YYMMNNNN 形式である必要があります。");
    if (!certificateIssuedDate || artifactText_(record.certificateNo).indexOf("UC0157" + artifactYyMm_(certificateIssuedDate)) !== 0) throw new Error("修了証明書番号のYYMMが証明書発行日と一致しません。");
  }
  if (kinds.indexOf("dipsCsv") >= 0) {
    if (!/^\d{6}$/.test(artifactText_(record.dipsApplicantId))) throw new Error("DIPS申請者IDはYYMMNNの6桁である必要があります。");
    if (!courseDate || artifactText_(record.dipsApplicantId).indexOf(artifactYyMm_(courseDate)) !== 0) throw new Error("DIPS申請者IDのYYMMが講習修了日と一致しません。");
  }
  if (kinds.indexOf("billing") >= 0) {
    var errors = [];
    artifactValidateBillingDatesAndNumbers_(record, errors);
    if (errors.length) throw new Error(errors.join(" "));
  }
}

function artifactAssertNumberUniqueness_(record, kinds, rows) {
  var numbers = [];
  if (artifactAnyKind_(kinds, ["ledger", "certificate", "dipsCsv"])) numbers.push(artifactText_(record.certificateNo));
  if (kinds.indexOf("dipsCsv") >= 0) numbers.push(artifactText_(record.dipsApplicantId));
  if (kinds.indexOf("billing") >= 0) numbers.push(artifactText_(record.quoteNo), artifactText_(record.invoiceNo));
  numbers = numbers.filter(Boolean);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].recordId === artifactText_(record.recordId)) continue;
    var used = artifactText_(rows[i].documentNumbers).split(";").map(function(value) { return artifactText_(value); });
    for (var j = 0; j < numbers.length; j++) {
      if (used.indexOf(numbers[j]) >= 0) {
        throw new Error("番号「" + numbers[j] + "」は別のrecordId（" + rows[i].recordId + "）で使用済みです。採番を変更してください。");
      }
    }
  }
}

function artifactRecordForHash_(kind, record) {
  var fields = [];
  if (kind === "ledger") {
    fields = ["certificateNo", "targetName", "licenseClass", "aircraftType", "suspensionCourse", "courseProvider", "courseDate", "certificateIssuedDate", "certificateDelivered", "certificateDeliveredDate", "certificateExpiry", "certificateLedgerMemo"];
  } else if (kind === "certificate") {
    fields = ["certificateNo", "courseDate", "certificateIssuedDate", "certificateExpiry", "targetName", "skillsApplicantNo", "licenseClass", "aircraftType", "suspensionCourse", "courseProvider", "certificateInstructor"];
  } else if (kind === "dipsCsv") {
    fields = ["targetName", "dipsApplicantId", "skillsApplicantNo", "licenseClass", "aircraftType", "suspensionCourse", "courseProvider", "certificateNo", "courseDate", "certificateIssuedDate", "certificateExpiry", "dipsRecordMode"];
  } else if (kind === "guidance") {
    fields = [
      "targetName", "licenseClass", "licenseExpiry", "courseAvailableDate", "courseDeadlineDate",
      "feeExTax", "discountExTax", "taxRate", "taxRounding",
      "taxExceptionApprovalDate", "taxExceptionApprovedBy", "taxExceptionReason"
    ];
  } else if (kind === "training") {
    fields = ["targetName", "licenseClass", "aircraftType", "suspensionCourse", "courseProvider", "courseDate", "courseVenue"];
    if (artifactText_(record.suspensionCourse) === "あり") fields.push("practicalVenue");
    var prefixes = [
      "academicOverview", "academicRules", "academicLawUpdate", "academicAccident", "academicSafety", "academicVideo",
      "academicFirstClass", "academicFirstClassVideo"
    ];
    if (artifactText_(record.suspensionCourse) === "あり") prefixes.push("practicalExercise1", "practicalDiscussion");
    prefixes.forEach(function(prefix) {
      fields.push(prefix + "Date", prefix + "Start", prefix + "End", prefix + "Instructor");
    });
  } else if (kind === "billing") {
    fields = [
      "targetName", "billingRecipientName", "billingHonorific", "billingAddress", "serviceCategory",
      "feeExTax", "discountExTax", "taxRate", "taxRounding",
      "quoteNo", "quoteDate", "quoteExpiry", "invoiceNo", "invoiceDate", "accountingDate", "paymentDueDate",
      "taxExceptionApprovalDate", "taxExceptionApprovedBy", "taxExceptionReason"
    ];
  }
  if (["ledger", "certificate", "dipsCsv", "training"].indexOf(kind) >= 0) {
    fields = fields.concat([
      "eligibilityCheckStatus", "eligibilityCheckedDate", "eligibilityCheckedBy", "eligibilityEvidence"
    ]);
  }
  var result = {};
  for (var i = 0; i < fields.length; i++) result[fields[i]] = record[fields[i]] === undefined || record[fields[i]] === null ? "" : record[fields[i]];
  return result;
}

function artifactGetDocumentTab_(doc, tabId) {
  try {
    var exact = doc.getTab(tabId);
    if (exact) return exact;
  } catch (ignored) {}
  var tabs = artifactFlattenDocumentTabs_(doc.getTabs());
  if (tabs.length === 1) return tabs[0];
  throw new Error("指定したGoogleドキュメントタブが見つからず、複数タブから安全に選択できないため停止しました。");
}

function artifactReplaceRequiredText_(body, pattern, replacement, label) {
  if (!body.findText(pattern)) throw new Error("テンプレート内の「" + label + "」差込位置を確認できません。");
  body.replaceText(pattern, replacement);
}

function artifactSetDocCellText_(cell, value) {
  value = artifactText_(value);
  if (cell.getNumChildren() > 0 && cell.getChild(0).getType() === DocumentApp.ElementType.PARAGRAPH) {
    var paragraph = cell.getChild(0).asParagraph();
    if (paragraph.getNumChildren() > 0 && paragraph.getChild(0).getType() === DocumentApp.ElementType.TEXT) {
      paragraph.getChild(0).asText().setText(value);
      for (var i = paragraph.getNumChildren() - 1; i >= 1; i--) paragraph.removeChild(paragraph.getChild(i));
      return;
    }
  }
  cell.setText(value);
}

// ---- Pure calculation / normalization helpers (unit-test friendly) ----

function artifactCalculateBilling_(record) {
  record = record || {};
  var rawFee = artifactStrictNumber_(record.feeExTax, false);
  var rawDiscount = artifactStrictNumber_(record.discountExTax, true);
  if (!isFinite(rawFee) || rawFee < 0) throw new Error("料金（税抜）は0円以上の数値で入力してください。");
  if (!isFinite(rawDiscount) || rawDiscount < 0) throw new Error("値引（税抜）は0円以上の数値で入力してください。");
  if (!artifactIsSafeInteger_(rawFee)) throw new Error("料金（税抜）は安全に計算できる整数円で入力してください。");
  if (!artifactIsSafeInteger_(rawDiscount)) throw new Error("値引（税抜）は安全に計算できる整数円で入力してください。");
  if (rawDiscount > rawFee) throw new Error("値引（税抜）は料金（税抜）以下にしてください。");
  var fee = rawFee;
  var discount = rawDiscount;
  var net = Math.max(0, fee - discount);
  var taxRate = Number(record.taxRate === "" || record.taxRate === null || record.taxRate === undefined ? 10 : record.taxRate);
  if (!isFinite(taxRate)) taxRate = 10;
  var rounding = artifactText_(record.taxRounding) || "切捨て";
  var rawTax = net * taxRate / 100;
  var tax = rounding === "切上げ" ? Math.ceil(rawTax) : (rounding === "四捨五入" ? Math.round(rawTax) : Math.floor(rawTax));
  return {
    feeExTax: fee,
    discountExTax: discount,
    netExTax: net,
    taxRate: taxRate,
    rounding: rounding,
    tax: tax,
    total: net + tax
  };
}

function artifactAddCalendarMonthsMinusOne_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) throw new Error("日付が正しくありません: " + isoDate);
  var absoluteMonth = parts.year * 12 + (parts.month - 1) + 3;
  var year = Math.floor(absoluteMonth / 12);
  var month = absoluteMonth % 12 + 1;
  var lastDay = artifactDaysInMonth_(year, month);
  // 3か月後に応当日がない場合はその月末を期限とし、存在する場合だけ応当日の前日とする。
  if (parts.day > lastDay) {
    return year + "-" + artifactPad_(month, 2) + "-" + artifactPad_(lastDay, 2);
  }
  var day = parts.day;
  var date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.getUTCFullYear() + "-" + artifactPad_(date.getUTCMonth() + 1, 2) + "-" + artifactPad_(date.getUTCDate(), 2);
}

function artifactCanonicalJson_(value) {
  if (value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return "[" + value.map(artifactCanonicalJson_).join(",") + "]";
  if (typeof value === "object") {
    var keys = Object.keys(value).filter(function(key) { return value[key] !== undefined; }).sort();
    return "{" + keys.map(function(key) { return JSON.stringify(key) + ":" + artifactCanonicalJson_(value[key]); }).join(",") + "}";
  }
  return JSON.stringify(value);
}

function artifactDurationMinutes_(start, end) {
  if (!artifactValidTime_(start) || !artifactValidTime_(end)) return NaN;
  return artifactTimeMinutes_(end) - artifactTimeMinutes_(start);
}

function artifactTimeMinutes_(value) {
  if (!artifactValidTime_(value)) return NaN;
  var match = /^(\d{2}):(\d{2})$/.exec(artifactText_(value));
  return Number(match[1]) * 60 + Number(match[2]);
}

function artifactValidTime_(value) {
  var match = /^(\d{2}):(\d{2})$/.exec(artifactText_(value));
  if (!match) return false;
  var hour = Number(match[1]);
  var minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function artifactHashHex_(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    artifactCanonicalJson_(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function artifactQuoteDefaultExpiry_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) throw new Error("見積日が正しくありません。");
  var absoluteMonth = parts.year * 12 + (parts.month - 1) + 2;
  var year = Math.floor(absoluteMonth / 12);
  var month = absoluteMonth % 12 + 1;
  return year + "-" + artifactPad_(month, 2) + "-" + artifactPad_(artifactDaysInMonth_(year, month), 2);
}

function artifactMonthEnd_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) throw new Error("請求日が正しくありません。");
  return parts.year + "-" + artifactPad_(parts.month, 2) + "-" + artifactPad_(artifactDaysInMonth_(parts.year, parts.month), 2);
}

function artifactIsoParts_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(artifactText_(value));
  if (!match) return null;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > artifactDaysInMonth_(year, month)) return null;
  return { year: year, month: month, day: day };
}

function artifactDaysInMonth_(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function artifactValidIsoDateOrBlank_(value) {
  return artifactIsoParts_(value) ? artifactText_(value) : "";
}

function artifactRequireIsoDate_(value, label) {
  var valid = artifactValidIsoDateOrBlank_(value);
  if (!valid) throw new Error(label + "が正しくありません。");
  return valid;
}

function artifactDateObject_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) return "";
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
}

function artifactFormatJapaneseLongDate_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) return "";
  return parts.year + "年" + parts.month + "月" + parts.day + "日";
}

function artifactFormatJapaneseWeekdayDate_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) return "";
  var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  var dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return parts.month + "月" + parts.day + "日（" + weekdays[dayOfWeek] + "）";
}

function artifactSlashDate_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  return parts ? (parts.year + "/" + artifactPad_(parts.month, 2) + "/" + artifactPad_(parts.day, 2)) : "";
}

function artifactYyMm_(isoDate) {
  var parts = artifactIsoParts_(isoDate);
  if (!parts) throw new Error("採番基準日が正しくありません。");
  return artifactPad_(parts.year % 100, 2) + artifactPad_(parts.month, 2);
}

function artifactClassValue_(value) {
  var text = artifactText_(value);
  if (text.indexOf("一等") >= 0 || text === "1") return 1;
  if (text.indexOf("二等") >= 0 || text === "2") return 2;
  return 0;
}

function artifactClassLabel_(value) {
  return artifactClassValue_(value) === 1 ? "一等" : "二等";
}

function artifactClassLongLabel_(value) {
  return artifactClassValue_(value) === 1 ? "一等無人航空機操縦士" : "二等無人航空機操縦士";
}

function artifactRecordName_(record) {
  return artifactText_(record.targetName || record.name || record.studentName);
}

function artifactCsvRow_(values) {
  return values.map(function(value) {
    var text = String(value === null || value === undefined ? "" : value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }).join(",");
}

function artifactCurrency_(value) {
  return String(Math.round(artifactNumber_(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function artifactNumber_(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return isFinite(value) ? value : 0;
  var parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return isFinite(parsed) ? parsed : 0;
}

function artifactSheetText_(value) {
  var text = value === null || value === undefined ? "" : String(value);
  // Google Sheetsが先頭の空白・制御文字を無視して式として扱う場合もあるため、
  // ユーザー文字列は最初の有効文字まで確認してリテラルとして保存する。
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
}

function artifactSafeSheetRow_(row) {
  return row.map(function(value) {
    return typeof value === "string" ? artifactSheetText_(value) : value;
  });
}

function artifactSafeSheetMatrix_(rows) {
  return rows.map(artifactSafeSheetRow_);
}

function artifactStrictNumber_(value, blankAsZero) {
  if (value === null || value === undefined || value === "") return blankAsZero ? 0 : NaN;
  if (typeof value === "number") return isFinite(value) ? value : NaN;
  var text = String(value).trim().replace(/,/g, "");
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(text)) return NaN;
  var parsed = Number(text);
  return isFinite(parsed) ? parsed : NaN;
}

function artifactText_(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function artifactBoolean_(value) {
  return value === true || value === 1 || value === "1" || artifactText_(value).toLowerCase() === "true";
}

function artifactClone_(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function artifactNormalizeRecord_(value) {
  var record = artifactClone_(value);
  var explicitRecordId = artifactText_(record.recordId);
  var uiRecordId = artifactText_(record.id);
  record._recordIdMismatch = !!(explicitRecordId && uiRecordId && explicitRecordId !== uiRecordId);
  record.recordId = explicitRecordId || uiRecordId;
  // fileName・本文・payloadHashが常に同じ氏名正本を見るようfallbackをここで確定する。
  record.targetName = artifactText_(record.targetName || record.name || record.studentName);
  return record;
}

function artifactPad_(value, width) {
  var text = String(value);
  while (text.length < width) text = "0" + text;
  return text;
}

function artifactSafeName_(value) {
  var text = artifactText_(value).replace(/[\\/:*?"<>|\[\]]/g, "").replace(/\s+/g, "_");
  return (text || "対象者").slice(0, 60);
}

function artifactShortKey_(value) {
  var text = artifactText_(value);
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function artifactExtractDriveId_(value) {
  var text = artifactText_(value);
  if (!text) return "";
  var match = /\/folders\/([A-Za-z0-9_-]+)/.exec(text);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

function artifactExtractDriveFileId_(value) {
  var text = artifactText_(value);
  if (!text) return "";
  var match = /\/d\/([A-Za-z0-9_-]+)/.exec(text) || /[?&]id=([A-Za-z0-9_-]+)/.exec(text);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

function artifactFolderUrl_(folderId) {
  var id = artifactExtractDriveId_(folderId);
  return id ? "https://drive.google.com/drive/folders/" + encodeURIComponent(id) : "";
}

function artifactIsEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(artifactText_(value));
}

function artifactAnyKind_(kinds, candidates) {
  for (var i = 0; i < candidates.length; i++) if (kinds.indexOf(candidates[i]) >= 0) return true;
  return false;
}

function artifactNowText_() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
}

function artifactTodayIso_() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
}

function artifactErrorMessage_(error) {
  return error && error.message ? String(error.message) : String(error || "不明なエラー");
}

function artifactDriveItemTrackingInfo_(item, label, itemType) {
  var info = {
    itemType: artifactText_(itemType) || "file",
    label: artifactText_(label) || "新規Drive項目",
    fileId: "",
    url: "",
    fileName: "",
    cleanupFailed: true
  };
  try { info.fileId = artifactText_(item && item.getId()); } catch (ignoredTrackingId) {}
  try { info.url = artifactText_(item && item.getUrl()); } catch (ignoredTrackingUrl) {}
  try { info.fileName = artifactText_(item && item.getName()); } catch (ignoredTrackingName) {}
  return info;
}

function artifactPersistCleanupFailure_(info, originalError, cleanupError) {
  info = info || {};
  try {
    var keySeed = artifactText_(info.fileId) || (artifactText_(info.label) + "|" + artifactNowText_());
    PropertiesService.getScriptProperties().setProperty(
      "RENEWAL_ARTIFACT_CLEANUP_FAILURE_" + artifactShortKey_(keySeed),
      JSON.stringify({
        detectedAt: artifactNowText_(), itemType: artifactText_(info.itemType), label: artifactText_(info.label),
        fileId: artifactText_(info.fileId), url: artifactText_(info.url), fileName: artifactText_(info.fileName),
        ledgerRow: Number(info.ledgerRow || 0), ledgerSheetName: artifactText_(info.ledgerSheetName), ledgerVersion: Number(info.ledgerVersion || 0),
        originalError: artifactErrorMessage_(originalError), cleanupError: artifactErrorMessage_(cleanupError)
      })
    );
    return "";
  } catch (cleanupPropertyError) {
    return "cleanup監査property保存失敗: " + artifactErrorMessage_(cleanupPropertyError);
  }
}

function artifactThrowAfterCleanup_(originalError, item, label, itemType) {
  try {
    item.setTrashed(true);
  } catch (cleanupError) {
    var info = artifactDriveItemTrackingInfo_(item, label, itemType);
    var persistedIssue = artifactPersistCleanupFailure_(info, originalError, cleanupError);
    var propertyIssue = persistedIssue ? " / " + persistedIssue : "";
    var trackedError = new Error(
      artifactErrorMessage_(originalError) + " 【担当部署に確認が必要】" + info.label + "の削除に失敗しました。" +
      "種別=" + info.itemType + " / ID=" + (info.fileId || "未取得") + " / URL=" + (info.url || "未取得") +
      " / cleanup=" + artifactErrorMessage_(cleanupError) + propertyIssue
    );
    trackedError.artifactProvisional = info;
    throw trackedError;
  }
  throw originalError instanceof Error ? originalError : new Error(artifactErrorMessage_(originalError));
}
