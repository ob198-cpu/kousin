// @ts-nocheck
// 事務規程に基づく8種類の保管物を、個人単位と期間単位を混同せず作成する。

var RENEWAL_COMPLIANCE_ARCHIVE = {
  SCHEMA_VERSION: 1,
  TEMPLATE_STATE_KEY: "RENEWAL_COMPLIANCE_TEMPLATE_STATE_V1",
  TEMPLATE_STATE_FORMAT: "CDP_RENEWAL_COMPLIANCE_TEMPLATE_STATE_V1",
  ARCHIVE_FOLDER_NAME: "監査保管",
  ARCHIVE_FOLDER_PROPERTY_PREFIX: "RENEWAL_COMPLIANCE_ARCHIVE_FOLDER_",
  PLAN_SOURCE_ID: "1igNBB5Ved91p-yUX4NhOUEWuW6KwIc-2jgOjReMp_Js",
  STATUS_SOURCE_ID: "10VToVFT0QltCgsRyGPt1nH9oeCQvz60KtmGTJjn_bZQ",
  STATUS_SOURCE_BASE_TAB_ID: "t.auzrd88tu44r",
  PLAN_TEMPLATE_NAME: "別添04_登録更新講習機関実施計画書_清浄原本",
  STATUS_TEMPLATE_NAME: "別添05_登録更新講習機関実施状況報告書_清浄原本",
  STATUS_TEMP_TEMPLATE_NAME: "一時_別添05原本清浄化_PREPARED",
  KINDS: ["implementationPlan", "implementationStatus", "applicationEvidence", "paymentRecord"],
  LABELS: {
    implementationPlan: "事務規程、別添04 実施計画書　保管",
    implementationStatus: "事務規程、別添05 実施状況報告書　保管",
    applicationEvidence: "申込書・技能証明書・身分証　保管",
    paymentRecord: "講習料金収納記録　保管"
  },
  MIME_TYPES: {
    implementationPlan: "application/vnd.google-apps.spreadsheet",
    implementationStatus: "application/vnd.google-apps.document",
    applicationEvidence: "application/vnd.google-apps.spreadsheet",
    paymentRecord: "application/vnd.google-apps.spreadsheet"
  }
};

function apiGetComplianceArchiveState() {
  try {
    artifactRequireCapability_("artifacts.read");
    var state = complianceLoadTemplateState_(false);
    var settings = artifactLoadSettings_();
    return {
      success: true,
      templatesReady: complianceTemplatesReady_(state, false),
      planTemplateId: state ? state.planTemplateId : "",
      statusTemplateId: state ? state.statusTemplateId : "",
      templateFolderUrl: artifactFolderUrl_(state ? state.templateFolderId : settings.templateFolderId),
      labels: RENEWAL_COMPLIANCE_ARCHIVE.LABELS
    };
  } catch (error) {
    return complianceErrorResult_(error);
  }
}

/**
 * 公開編集可能な参照元を直接運用原本にせず、所有者専用の単一ベース原本を作る。
 * 参照元は版固定し、コピー前後の両方で同じ版であることを確認する。
 */
function apiProvisionComplianceTemplates() {
  var authorization;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
  } catch (authorizationError) {
    return complianceErrorResult_(authorizationError);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return complianceErrorResult_(new Error("別の監査保管原本準備が実行中です。しばらく待って再実行してください。"));
  }
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
    artifactAssertNoUnresolvedCleanupFailures_();
    artifactAssertPinnedReferenceSource_("implementationPlanSource");
    artifactAssertPinnedReferenceSource_("implementationStatusSource");
    var settings = artifactLoadSettings_();
    var templateFolder = artifactEnsureTemplateFolder_(settings.templateFolderId);
    var current = complianceLoadTemplateState_(false) || {};
    var plan = complianceProvisionPlanTemplate_(templateFolder, current.planTemplateId);
    var status = complianceProvisionStatusTemplate_(templateFolder, current.statusTemplateId);

    artifactAssertPinnedReferenceSource_("implementationPlanSource");
    artifactAssertPinnedReferenceSource_("implementationStatusSource");
    complianceAssertPlanTemplateClean_(plan.file.getId());
    complianceAssertStatusTemplateClean_(status.file.getId());

    var state = complianceSaveTemplateState_({
      format: RENEWAL_COMPLIANCE_ARCHIVE.TEMPLATE_STATE_FORMAT,
      schemaVersion: RENEWAL_COMPLIANCE_ARCHIVE.SCHEMA_VERSION,
      templateFolderId: templateFolder.getId(),
      planTemplateId: plan.file.getId(),
      statusTemplateId: status.file.getId(),
      updatedAt: artifactNowText_(),
      updatedBy: authorization.email
    });
    complianceClearTemplateDriveAttempt_(plan, templateFolder);
    complianceClearTemplateDriveAttempt_(status, templateFolder);
    complianceEnsureServerAudit_({
      actor: authorization.email,
      scopeKey: "compliance-templates",
      kind: "templates",
      hash: state.envelopeHash,
      fileId: plan.file.getId() + ":" + status.file.getId(),
      action: plan.created || status.created ? "COMPLIANCE_TEMPLATES_CREATE" : "COMPLIANCE_TEMPLATES_VERIFY"
    });
    return {
      success: true,
      created: plan.created || status.created,
      planTemplateId: state.planTemplateId,
      statusTemplateId: state.statusTemplateId,
      templateFolderUrl: artifactFolderUrl_(state.templateFolderId),
      message: plan.created || status.created
        ? "別添04・05の所有者専用原本を作成し、版を固定しました。"
        : "別添04・05の所有者専用原本を再検査しました。新しい原本は作成していません。"
    };
  } catch (error) {
    return complianceErrorResult_(error);
  } finally {
    lock.releaseLock();
  }
}

function apiPreflightComplianceArchive(request) {
  try {
    request = request || {};
    var kind = complianceKind_(request.kind);
    var authorization = complianceRequireKindCapability_(kind, false);
    var context = complianceBuildContext_(kind, request, authorization);
    return {
      success: true,
      ready: true,
      kind: kind,
      label: RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind],
      summary: context.summary,
      warnings: context.warnings || [],
      message: "作成条件を満たしています。"
    };
  } catch (error) {
    var result = complianceErrorResult_(error);
    result.ready = false;
    result.kind = artifactText_(request && request.kind);
    result.label = RENEWAL_COMPLIANCE_ARCHIVE.LABELS[result.kind] || "監査保管";
    result.errors = [result.message];
    return result;
  }
}

function apiCreateComplianceArchive(request) {
  request = request || {};
  var kind = "";
  var firstAuthorization = null;
  try {
    kind = complianceKind_(request.kind);
    firstAuthorization = complianceRequireKindCapability_(kind, true);
    complianceBuildContext_(kind, request, firstAuthorization);
  } catch (preflightError) {
    return complianceErrorResult_(preflightError);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return complianceErrorResult_(new Error("別の監査保管物作成が実行中です。しばらく待って再実行してください。"));
  }
  var createdFile = null;
  var createdThisAttempt = false;
  var driveOperation = null;
  try {
    var authorization = complianceRequireKindCapability_(kind, true);
    artifactAssertNoUnresolvedCleanupFailures_();
    var context = complianceBuildContext_(kind, request, authorization);
    var settings = context.settings;
    var autoRoot = artifactEnsureAutoRoot_(settings.outputFolderId, settings.allowedOutputEmails);
    var targetFolder;
    if (kind === "implementationPlan" || kind === "implementationStatus") {
      targetFolder = complianceEnsureArchiveFolder_(autoRoot, settings.allowedOutputEmails);
    } else {
      targetFolder = artifactEnsureRecordFolder_(autoRoot, context.record, settings.allowedOutputEmails);
    }
    var identity = complianceOutputIdentity_(kind, context);
    var fileName = complianceOutputFileName_(kind, context, identity.hash);
    var reusable = complianceFindReusableFile_(
      targetFolder,
      fileName,
      RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind],
      identity,
      settings.allowedOutputEmails
    );
    if (reusable) {
      var recoveryOperation = complianceDriveOperation_(
        kind, context, targetFolder, fileName
      );
      var recoveryAttempt = artifactReadDriveAttempt_(
        artifactDriveAttemptKey_(recoveryOperation),
        RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind]
      );
      var recoveryAction = recoveryAttempt
        ? "COMPLIANCE_ARCHIVE_CREATE"
        : "COMPLIANCE_ARCHIVE_REUSE";
      complianceEnsureServerAudit_({
        actor: authorization.email,
        scopeKey: context.scopeKey,
        kind: kind,
        hash: identity.hash,
        fileId: reusable.getId(),
        action: recoveryAction
      });
      if (recoveryAttempt) {
        artifactClearPublishedDriveAttempt_(
          recoveryOperation,
          reusable.getId(),
          RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind]
        );
      }
      return complianceSuccessResult_(kind, reusable, context, true);
    }

    var created = complianceCreateOutput_(kind, context, targetFolder, fileName);
    createdFile = created.file;
    createdThisAttempt = true;
    driveOperation = created.driveOperation;
    complianceSetAndAssertOutputIdentity_(createdFile, identity);
    artifactAssertReusableDriveItem_(
      createdFile,
      targetFolder.getId(),
      RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind],
      settings.allowedOutputEmails
    );
    complianceEnsureServerAudit_({
      actor: authorization.email,
      scopeKey: context.scopeKey,
      kind: kind,
      hash: identity.hash,
      fileId: createdFile.getId(),
      action: "COMPLIANCE_ARCHIVE_CREATE"
    });
    if (driveOperation) {
      artifactClearPublishedDriveAttempt_(
        driveOperation,
        createdFile.getId(),
        RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind]
      );
    }
    return complianceSuccessResult_(kind, createdFile, context, false);
  } catch (error) {
    if (
      createdThisAttempt &&
      createdFile &&
      error &&
      error.complianceAuditOutcomeUncertain === true
    ) {
      var uncertainMessage =
        artifactErrorMessage_(error) +
        " 作成ファイルは監査記録との不整合を避けるため削除していません。" +
        "【担当部署に確認が必要】ID=" + artifactText_(createdFile.getId());
      return {
        success: false,
        error: uncertainMessage,
        message: uncertainMessage,
        errors: [uncertainMessage],
        preservationRequired: true,
        fileId: createdFile.getId(),
        url: createdFile.getUrl()
      };
    }
    if (createdThisAttempt && createdFile) {
      try {
        artifactPermanentlyDeleteNewDriveItem_(
          createdFile,
          RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind] || "作成途中の監査保管物",
          "file",
          error
        );
        if (driveOperation) artifactClearDriveAttempt_(artifactDriveAttemptKey_(driveOperation));
      } catch (cleanupError) {
        return complianceErrorResult_(new Error(
          artifactErrorMessage_(error) +
          " 作成途中ファイルを完全削除できません。【担当部署に確認が必要】ID=" +
          artifactText_(createdFile.getId()) + " / " + artifactErrorMessage_(cleanupError)
        ));
      }
    }
    return complianceErrorResult_(error);
  } finally {
    lock.releaseLock();
  }
}

function complianceErrorResult_(error) {
  var message = artifactErrorMessage_(error);
  return { success: false, error: message, message: message, errors: [message] };
}

function complianceSuccessResult_(kind, file, context, reused) {
  var warnings = (context.warnings || []).slice();
  if (kind === "applicationEvidence") {
    warnings.push("実際の申込書・技能証明書・身分証は自動生成しません。開いた対象者フォルダへ原本をアップロードし、チェックリストへリンク・確認日・確認者を記入してください。");
  }
  return {
    success: true,
    kind: kind,
    label: RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind],
    status: reused ? "reused" : "created",
    fileId: file.getId(),
    fileName: file.getName(),
    url: file.getUrl(),
    folderUrl: context.outputFolderUrl || "",
    warnings: warnings,
    message: reused ? "同じ正本内容の作成済み保管物を再利用しました。" : "Google Driveへ作成・保管しました。"
  };
}

function complianceKind_(kind) {
  var value = artifactText_(kind);
  if (RENEWAL_COMPLIANCE_ARCHIVE.KINDS.indexOf(value) < 0) {
    throw new Error("未対応の監査保管種別です。");
  }
  return value;
}

function complianceRequireKindCapability_(kind, write) {
  if (kind === "paymentRecord") return artifactRequireCapability_("artifacts.billing");
  return artifactRequireCapability_(write ? "artifacts.write" : "artifacts.read");
}

function complianceBuildContext_(kind, request, authorization) {
  var settings = artifactLoadSettings_();
  artifactAssertAllowedOutputEmails_(settings.allowedOutputEmails);
  artifactRequireSafeOutputFolder_(
    settings.outputFolderId,
    [settings.ledgerTemplateId, settings.certificateTemplateId],
    settings.allowedOutputEmails
  );
  var context = {
    kind: kind,
    request: request,
    authorization: authorization,
    settings: settings,
    summary: {},
    warnings: []
  };
  if (kind === "implementationPlan") return complianceBuildPlanContext_(context);
  if (kind === "implementationStatus") return complianceBuildStatusContext_(context);
  var canonicalRequest = artifactLoadCanonicalArtifactRequest_({
    recordId: request.recordId,
    expectedVersion: request.expectedVersion,
    expectedPayloadHash: request.expectedPayloadHash,
    kinds: ["training"]
  });
  context.canonical = canonicalRequest.canonical;
  context.record = artifactNormalizeRecord_(canonicalRequest.request.record);
  context.scopeKey = kind + ":" + context.record.recordId;
  context.summary = {
    targetName: artifactRecordName_(context.record),
    managementId: artifactText_(context.record.personId || context.record.managementId),
    recordVersion: Number(context.canonical.version || 0)
  };
  if (kind === "applicationEvidence") {
    if (!artifactRecordName_(context.record)) throw new Error("対象者名が必要です。");
    return context;
  }
  context.finance = complianceFinanceSnapshotForRecord_(context.record.recordId);
  if (!context.finance.invoices.length && !context.finance.payments.length) {
    throw new Error("正式会計台帳に、この対象者の請求・入金記録がありません。対象者画面の旧金額から収納記録を推測作成しません。");
  }
  context.summary.invoiceCount = context.finance.invoices.length;
  context.summary.paymentCount = context.finance.payments.length;
  context.summary.financeRevision = context.finance.revision;
  return context;
}

function complianceBuildPlanContext_(context) {
  var input = context.request || {};
  var month = artifactText_(input.planMonth);
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("実施計画書の対象月をYYYY-MM形式で指定してください。");
  }
  if (artifactFiscalYearFromIso_(month + "-01") !== RENEWAL_ARTIFACT.PINNED_OUTPUT_FISCAL_YEAR) {
    throw new Error("別添04の対象月は固定保存先と同じ2026年度内にしてください。");
  }
  var counts = {
    firstStart: complianceNonNegativeInteger_(input.firstStartCount, "一等の開始予定人数"),
    firstFinish: complianceNonNegativeInteger_(input.firstFinishCount, "一等の修了予定人数"),
    secondStart: complianceNonNegativeInteger_(input.secondStartCount, "二等の開始予定人数"),
    secondFinish: complianceNonNegativeInteger_(input.secondFinishCount, "二等の修了予定人数")
  };
  var state = complianceRequireTemplatesReady_();
  context.templateState = state;
  context.planMonth = month;
  context.counts = counts;
  context.scopeKey = "implementationPlan:" + month;
  context.summary = {
    planMonth: month,
    firstStartCount: counts.firstStart,
    firstFinishCount: counts.firstFinish,
    secondStartCount: counts.secondStart,
    secondFinishCount: counts.secondFinish
  };
  return context;
}

function complianceBuildStatusContext_(context) {
  var input = context.request || {};
  var reportDate = artifactValidIsoDateOrBlank_(input.reportDate);
  var startDate = artifactValidIsoDateOrBlank_(input.reportStartDate);
  var endDate = artifactValidIsoDateOrBlank_(input.reportEndDate);
  var today = artifactTodayIso_();
  if (!reportDate || !startDate || !endDate) {
    throw new Error("実施状況報告書の報告日・対象開始日・対象終了日を実在する日付で指定してください。");
  }
  if (startDate > endDate) throw new Error("実施状況報告書の対象開始日は対象終了日以前にしてください。");
  if (endDate > today || reportDate > today) throw new Error("実施状況報告書に未来の終了日・報告日は指定できません。");
  if (reportDate < endDate) throw new Error("実施状況報告書の報告日は対象終了日以後にしてください。");
  if (
    artifactFiscalYearFromIso_(startDate) !== RENEWAL_ARTIFACT.PINNED_OUTPUT_FISCAL_YEAR ||
    artifactFiscalYearFromIso_(endDate) !== RENEWAL_ARTIFACT.PINNED_OUTPUT_FISCAL_YEAR
  ) {
    throw new Error("別添05の対象期間は固定保存先と同じ2026年度内にしてください。");
  }
  var state = complianceRequireTemplatesReady_();
  var records = storeListRecords_({ includeDeleted: false });
  var summary = complianceStatusSummary_(records, startDate, endDate);
  context.templateState = state;
  context.reportDate = reportDate;
  context.reportStartDate = startDate;
  context.reportEndDate = endDate;
  context.statusSummary = summary;
  context.scopeKey = "implementationStatus:" + startDate + ":" + endDate;
  context.summary = {
    reportDate: reportDate,
    reportStartDate: startDate,
    reportEndDate: endDate,
    firstCompletedCount: summary.first.count,
    secondCompletedCount: summary.second.count,
    firstVenues: summary.first.venues,
    secondVenues: summary.second.venues
  };
  if (!summary.first.venues.length && summary.first.count > 0) {
    throw new Error("対象期間の一等修了者に講習会場がないため、実施場所を確定できません。");
  }
  if (!summary.second.venues.length && summary.second.count > 0) {
    throw new Error("対象期間の二等修了者に講習会場がないため、実施場所を確定できません。");
  }
  return context;
}

function complianceNonNegativeInteger_(value, label) {
  if (value === "" || value === null || value === undefined) throw new Error(label + "を入力してください。");
  var number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 9999) {
    throw new Error(label + "は0～9999の整数で入力してください。");
  }
  return number;
}

function complianceStatusSummary_(records, startDate, endDate) {
  var result = {
    first: { count: 0, venues: [] },
    second: { count: 0, venues: [] }
  };
  var venueMaps = { first: {}, second: {} };
  (Array.isArray(records) ? records : []).forEach(function(row) {
    var record = artifactNormalizeRecord_(row && row.record ? row.record : row);
    var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
    if (!courseDate || courseDate < startDate || courseDate > endDate) return;
    if (artifactText_(record.courseProvider) !== "CDP") return;
    var classValue = artifactClassValue_(record.licenseClass);
    var key = classValue === "一等" ? "first" : (classValue === "二等" ? "second" : "");
    if (!key) return;
    result[key].count++;
    var venue = artifactText_(record.courseVenue);
    if (venue) venueMaps[key][venue] = true;
  });
  result.first.venues = Object.keys(venueMaps.first).sort();
  result.second.venues = Object.keys(venueMaps.second).sort();
  return result;
}

function complianceFinanceSnapshotForRecord_(recordId) {
  if (typeof financeStoreGetState_ !== "function") {
    throw new Error("正式会計台帳が利用できないため収納記録を作成できません。");
  }
  var envelope = financeStoreGetState_();
  if (!envelope || envelope.configured !== true || !envelope.state) {
    throw new Error("正式会計台帳が未設定のため収納記録を作成できません。");
  }
  if (envelope.recoveryNeeded === true) {
    throw new Error("正式会計台帳が復旧待ちのため収納記録を作成できません。");
  }
  financeValidateState_(envelope.state);
  var id = artifactText_(recordId);
  var state = envelope.state;
  return {
    revision: Number(envelope.revision || state.revision || 0),
    stateHash: artifactText_(envelope.stateHash),
    state: state,
    invoices: state.invoices.filter(function(row) { return artifactText_(row.customerId) === id; }),
    payments: state.payments.filter(function(row) { return artifactText_(row.customerId) === id; }),
    allocations: state.payment_allocations.filter(function(row) { return artifactText_(row.customerId) === id; }),
    credits: state.credit_notes.filter(function(row) { return artifactText_(row.customerId) === id; }),
    position: financeCustomerPosition_(state, id)
  };
}

function complianceOutputIdentity_(kind, context) {
  var value = {
    format: "CDP_RENEWAL_COMPLIANCE_OUTPUT_V1",
    schemaVersion: RENEWAL_COMPLIANCE_ARCHIVE.SCHEMA_VERSION,
    kind: kind,
    scopeKey: context.scopeKey
  };
  if (kind === "implementationPlan") {
    value.planMonth = context.planMonth;
    value.counts = context.counts;
    value.templatePin = complianceTemplatePinValue_("implementationPlan", context.templateState.planTemplateId);
  } else if (kind === "implementationStatus") {
    value.reportDate = context.reportDate;
    value.startDate = context.reportStartDate;
    value.endDate = context.reportEndDate;
    value.summary = context.statusSummary;
    value.templatePin = complianceTemplatePinValue_("implementationStatus", context.templateState.statusTemplateId);
  } else if (kind === "applicationEvidence") {
    value.recordId = context.record.recordId;
    value.recordVersion = Number(context.canonical.version);
    value.recordPayloadHash = artifactText_(context.canonical.payloadHash);
  } else if (kind === "paymentRecord") {
    value.recordId = context.record.recordId;
    value.recordVersion = Number(context.canonical.version);
    value.recordPayloadHash = artifactText_(context.canonical.payloadHash);
    value.financeRevision = context.finance.revision;
    value.financeStateHash = context.finance.stateHash;
  }
  return {
    value: value,
    hash: artifactHashHex_(value)
  };
}

function complianceTemplatePinValue_(kind, fileId) {
  artifactAssertDedicatedTemplatePin_(kind, fileId);
  var store = artifactLoadDedicatedTemplatePins_();
  var pin = store.pins[kind];
  return {
    fileId: pin.fileId,
    driveVersion: pin.driveVersion,
    modifiedTime: pin.modifiedTime,
    md5Checksum: pin.md5Checksum
  };
}

function complianceOutputFileName_(kind, context, hash) {
  var suffix = artifactText_(hash).slice(0, 12);
  if (kind === "implementationPlan") {
    return ("別添04_登録更新講習機関実施計画書_" + context.planMonth + "_" + suffix).slice(0, 180);
  }
  if (kind === "implementationStatus") {
    return ("別添05_登録更新講習機関実施状況報告書_" +
      context.reportStartDate + "_" + context.reportEndDate + "_" + suffix).slice(0, 180);
  }
  var personId = artifactSafeName_(context.record.personId || context.record.recordId);
  if (kind === "applicationEvidence") {
    return ("申込書・技能証明書・身分証_保管チェックリスト_" + personId + "_v" +
      context.canonical.version + "_" + suffix).slice(0, 180);
  }
  return ("講習料金収納記録_" + personId + "_会計r" + context.finance.revision + "_" + suffix).slice(0, 180);
}

function complianceIdentityDescription_(identity) {
  return JSON.stringify({
    format: "CDP_RENEWAL_COMPLIANCE_OUTPUT_IDENTITY_V1",
    hash: identity.hash,
    value: identity.value
  });
}

function complianceSetAndAssertOutputIdentity_(file, identity) {
  var description = complianceIdentityDescription_(identity);
  file.setDescription(description);
  if (artifactText_(file.getDescription()) !== description) {
    throw new Error("監査保管物の識別情報を保存・読戻しできません。");
  }
  return true;
}

function complianceFindReusableFile_(folder, name, mimeType, identity, allowedOutputEmails) {
  var matches = artifactIteratorItems_(folder.getFilesByName(name), 2);
  if (matches.length > 1) {
    throw new Error("同名の監査保管物が複数あります。重複を監査してから再実行してください。");
  }
  if (!matches.length) return null;
  var file = matches[0];
  artifactAssertReusableDriveItem_(file, folder.getId(), "既存の監査保管物", allowedOutputEmails);
  var state = Drive.Files.get(file.getId(), {
    fields: "id,name,mimeType,trashed",
    supportsAllDrives: true
  });
  if (!state || state.trashed === true || artifactText_(state.mimeType) !== mimeType) {
    throw new Error("既存の監査保管物のファイル種類が一致しません。");
  }
  if (artifactText_(file.getDescription()) !== complianceIdentityDescription_(identity)) {
    throw new Error("既存の監査保管物の内容識別情報が一致しません。自動上書きしません。【担当部署に確認が必要】");
  }
  return file;
}

function complianceCreateOutput_(kind, context, folder, fileName) {
  if (kind === "implementationPlan") return complianceCreatePlan_(context, folder, fileName);
  if (kind === "implementationStatus") return complianceCreateStatus_(context, folder, fileName);
  if (kind === "applicationEvidence") return complianceCreateApplicationChecklist_(context, folder, fileName);
  if (kind === "paymentRecord") return complianceCreatePaymentRecord_(context, folder, fileName);
  throw new Error("未対応の監査保管物です。");
}

function complianceDriveOperation_(kind, context, folder, fileName) {
  var sourceId = "";
  var operationType = "CREATE";
  if (kind === "implementationPlan") {
    operationType = "COPY";
    sourceId = context.templateState.planTemplateId;
  } else if (kind === "implementationStatus") {
    operationType = "COPY";
    sourceId = context.templateState.statusTemplateId;
  }
  return artifactDriveAttemptOperation_(
    operationType,
    sourceId,
    fileName,
    RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind],
    folder.getId()
  );
}

function complianceCreatePlan_(context, folder, fileName) {
  var mimeType = RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES.implementationPlan;
  var file = artifactCopyFileInFolder_(
    context.templateState.planTemplateId,
    fileName,
    mimeType,
    folder,
    RENEWAL_COMPLIANCE_ARCHIVE.LABELS.implementationPlan,
    context.settings.allowedOutputEmails,
    false
  );
  try {
    var spreadsheet = SpreadsheetApp.openById(file.getId());
    var sheets = spreadsheet.getSheets();
    if (sheets.length !== 1 || sheets[0].getName() !== "ベース") {
      throw new Error("別添04専用原本が単一ベース構造ではありません。");
    }
    spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
    var sheet = sheets[0];
    var parts = context.planMonth.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var lastDay = new Date(year, month, 0).getDate();
    var days = [];
    var weekdays = [];
    var weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
    for (var day = 1; day <= 31; day++) {
      days.push(day <= lastDay ? day : "");
      weekdays.push(day <= lastDay ? weekdayLabels[new Date(year, month - 1, day).getDay()] : "");
    }
    sheet.setName(year + "年" + month + "月");
    sheet.getRange("D1").setValue("登録更新講習機関実施計画書　" + month + "月");
    sheet.getRange(2, 4, 1, 31).setValues([days]);
    sheet.getRange(3, 4, 1, 31).setValues([weekdays]);
    sheet.getRange("B4:C5").setValues([
      [context.counts.secondStart, context.counts.secondFinish],
      [context.counts.firstStart, context.counts.firstFinish]
    ]);
    SpreadsheetApp.flush();
    if (
      artifactText_(sheet.getRange("D1").getDisplayValue()).indexOf(month + "月") < 0 ||
      Number(sheet.getRange("B4").getValue()) !== context.counts.secondStart ||
      Number(sheet.getRange("B5").getValue()) !== context.counts.firstStart
    ) {
      throw new Error("別添04の作成後読戻し検証に失敗しました。");
    }
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_("COPY", context.templateState.planTemplateId, fileName, mimeType, folder.getId())
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, RENEWAL_COMPLIANCE_ARCHIVE.LABELS.implementationPlan, "file");
  }
}

function complianceCreateStatus_(context, folder, fileName) {
  var mimeType = RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES.implementationStatus;
  var file = artifactCopyFileInFolder_(
    context.templateState.statusTemplateId,
    fileName,
    mimeType,
    folder,
    RENEWAL_COMPLIANCE_ARCHIVE.LABELS.implementationStatus,
    context.settings.allowedOutputEmails,
    false
  );
  try {
    var doc = DocumentApp.openById(file.getId());
    var tabs = artifactFlattenDocumentTabs_(doc.getTabs());
    if (tabs.length !== 1 || artifactText_(tabs[0].getTitle()) !== "ベース") {
      throw new Error("別添05専用原本が単一ベース構造ではありません。");
    }
    var body = tabs[0].asDocumentTab().getBody();
    var reportDate = complianceDateParts_(context.reportDate);
    var startDate = complianceDateParts_(context.reportStartDate);
    var endDate = complianceDateParts_(context.reportEndDate);
    artifactReplaceRequiredText_(
      body,
      "令和[ 　]*[0-9]+年[ 　]*[0-9]*月[ 　]*[0-9]*日",
      "令和　" + (reportDate.year - 2018) + "年　" + reportDate.month + "月　" + reportDate.day + "日",
      "報告日"
    );
    var tables = body.getTables();
    if (tables.length !== 1 || tables[0].getNumRows() !== 12) {
      throw new Error("別添05の表構造を一意に確認できません。");
    }
    var table = tables[0];
    var fiscalYear = artifactFiscalYearFromIso_(context.reportStartDate);
    complianceSetLastTableCell_(table, 4,
      (fiscalYear - 2018) + "年度　（　" + startDate.year + "年　" + startDate.month + "月　" + startDate.day + "日開始分）");
    complianceSetLastTableCell_(table, 6, context.statusSummary.first.venues.join("、") || "該当なし");
    complianceSetLastTableCell_(table, 7, complianceJapanesePeriod_(startDate, endDate));
    complianceSetLastTableCell_(table, 8, "　　" + context.statusSummary.first.count + "人");
    complianceSetLastTableCell_(table, 9, context.statusSummary.second.venues.join("、") || "該当なし");
    complianceSetLastTableCell_(table, 10, complianceJapanesePeriod_(startDate, endDate));
    complianceSetLastTableCell_(table, 11, "　　" + context.statusSummary.second.count + "人");
    doc.saveAndClose();
    var verifyDoc = DocumentApp.openById(file.getId());
    var verifyTabs = artifactFlattenDocumentTabs_(verifyDoc.getTabs());
    var verifyText = verifyTabs[0].asDocumentTab().getBody().getText();
    if (
      verifyText.indexOf(context.reportStartDate.slice(0, 4) + "年") < 0 ||
      verifyText.indexOf("　　" + context.statusSummary.first.count + "人") < 0 ||
      verifyText.indexOf("　　" + context.statusSummary.second.count + "人") < 0
    ) {
      throw new Error("別添05の作成後読戻し検証に失敗しました。");
    }
    verifyDoc.saveAndClose();
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_("COPY", context.templateState.statusTemplateId, fileName, mimeType, folder.getId())
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, RENEWAL_COMPLIANCE_ARCHIVE.LABELS.implementationStatus, "file");
  }
}

function complianceSetLastTableCell_(table, rowIndex, value) {
  var row = table.getRow(rowIndex);
  var count = row.getNumCells();
  if (count < 1) throw new Error("別添05の" + (rowIndex + 1) + "行目に記入セルがありません。");
  row.getCell(count - 1).setText(artifactText_(value));
}

function complianceJapanesePeriod_(start, end) {
  return start.year + "年　" + start.month + "月　" + start.day +
    "日　～　　" + end.year + "年　" + end.month + "月　" + end.day + "日";
}

function complianceDateParts_(isoDate) {
  var valid = artifactValidIsoDateOrBlank_(isoDate);
  if (!valid) throw new Error("帳票へ記入する日付が正しくありません。");
  var parts = valid.split("-");
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

function complianceCreateApplicationChecklist_(context, folder, fileName) {
  var mimeType = RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES.applicationEvidence;
  var created = artifactCreateSpreadsheetInFolder_(
    fileName,
    folder,
    RENEWAL_COMPLIANCE_ARCHIVE.LABELS.applicationEvidence,
    context.settings.allowedOutputEmails,
    false
  );
  var file = created.file;
  try {
    var spreadsheet = created.spreadsheet;
    spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
    var sheet = spreadsheet.getSheets()[0];
    sheet.setName("保管チェックリスト");
    sheet.getRange("A1:H1").merge().setValue("申込書・技能証明書・身分証　保管チェックリスト");
    sheet.getRange("A2:H4").setValues([
      ["recordId", context.record.recordId, "管理ID", artifactText_(context.record.personId), "対象者", artifactRecordName_(context.record), "正本版", Number(context.canonical.version)],
      ["保存先", folder.getUrl(), "", "", "", "", "", ""],
      ["注意", "実物書類は自動生成しません。対象者フォルダへ原本をアップロードし、下表へリンクと確認記録を入力してください。", "", "", "", "", "", ""]
    ]);
    sheet.getRange("A6:H6").setValues([["書類", "状態", "Driveファイル名", "Driveリンク", "受領日", "確認日", "確認者", "備考"]]);
    sheet.getRange("A7:H9").setValues([
      ["申込書", "未登録", "", "", "", "", "", ""],
      ["技能証明書", "未登録", "", "", "", "", "", ""],
      ["身分証", "未登録", "", "", "", "", "", ""]
    ]);
    sheet.getRange("A1:H1").setBackground("#0b4f8a").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange("A6:H6").setBackground("#dbeafe").setFontWeight("bold");
    sheet.setFrozenRows(6);
    sheet.setColumnWidths(1, 8, 140);
    sheet.setColumnWidth(4, 260);
    sheet.getRange("A1:H9").setWrap(true).setVerticalAlignment("middle");
    sheet.getRange("E7:F9").setNumberFormat("yyyy-mm-dd");
    sheet.getRange("A6:H9").createFilter();
    SpreadsheetApp.flush();
    if (sheet.getRange("A7").getDisplayValue() !== "申込書") {
      throw new Error("保管チェックリストの作成後読戻し検証に失敗しました。");
    }
    context.outputFolderUrl = folder.getUrl();
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_("CREATE", "", fileName, mimeType, folder.getId())
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, RENEWAL_COMPLIANCE_ARCHIVE.LABELS.applicationEvidence, "file");
  }
}

function complianceCreatePaymentRecord_(context, folder, fileName) {
  var mimeType = RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES.paymentRecord;
  var created = artifactCreateSpreadsheetInFolder_(
    fileName,
    folder,
    RENEWAL_COMPLIANCE_ARCHIVE.LABELS.paymentRecord,
    context.settings.allowedOutputEmails,
    false
  );
  var file = created.file;
  try {
    var spreadsheet = created.spreadsheet;
    spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
    var summarySheet = spreadsheet.getSheets()[0];
    summarySheet.setName("収納記録");
    complianceWritePaymentSummarySheet_(summarySheet, context);
    var invoiceSheet = spreadsheet.insertSheet("請求・消込");
    complianceWriteInvoiceSheet_(invoiceSheet, context);
    var auditSheet = spreadsheet.insertSheet("監査情報");
    complianceWritePaymentAuditSheet_(auditSheet, context);
    SpreadsheetApp.flush();
    if (
      summarySheet.getRange("A1").getDisplayValue() !== "講習料金収納記録" ||
      auditSheet.getRange("B2").getDisplayValue() !== String(context.finance.revision)
    ) {
      throw new Error("講習料金収納記録の作成後読戻し検証に失敗しました。");
    }
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_("CREATE", "", fileName, mimeType, folder.getId())
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, RENEWAL_COMPLIANCE_ARCHIVE.LABELS.paymentRecord, "file");
  }
}

function complianceWritePaymentSummarySheet_(sheet, context) {
  sheet.getRange("A1:J1").merge().setValue("講習料金収納記録");
  sheet.getRange("A2:J4").setValues([
    ["recordId", context.record.recordId, "管理ID", artifactText_(context.record.personId), "対象者", artifactRecordName_(context.record), "会計revision", context.finance.revision, "会計stateHash", context.finance.stateHash],
    ["入金合計", context.finance.position.receipts, "返金合計", context.finance.position.refunds, "未消込入金", context.finance.position.unallocatedReceipts, "請求残高", context.finance.position.outstanding, "作成日時", artifactNowText_()],
    ["計算根拠", "正式会計台帳の検証済みイベント・消込・反対取引から集計。対象者画面の旧金額は不使用。", "", "", "", "", "", "", "", ""]
  ]);
  var headers = [["取引日", "入金ID", "取引区分", "金額", "符号付金額", "入金方法", "参照", "消込額", "未消込額", "記録者・時刻"]];
  sheet.getRange("A6:J6").setValues(headers);
  var allocationTotals = {};
  context.finance.allocations.forEach(function(row) {
    allocationTotals[row.paymentId] = (allocationTotals[row.paymentId] || 0) + Number(row.amount) * Number(row.direction);
  });
  var rows = context.finance.payments.map(function(payment) {
    var sign = payment.kind === "RECEIPT" ? 1 :
      (payment.kind === "REVERSE_RECEIPT" || payment.kind === "REFUND" ? -1 : 1);
    var allocated = allocationTotals[payment.id] || 0;
    var unallocated = payment.kind === "RECEIPT"
      ? financeReceiptUnallocated_(context.finance.state, payment.id)
      : 0;
    return [
      payment.accountingDate,
      payment.id,
      payment.kind,
      Number(payment.amount),
      Number(payment.amount) * sign,
      artifactText_(payment.method),
      artifactText_(payment.reference || payment.reason),
      allocated,
      unallocated,
      artifactText_(payment.createdBy) + " / " + artifactText_(payment.createdAt)
    ];
  }).sort(function(a, b) {
    return String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]));
  });
  if (rows.length) sheet.getRange(7, 1, rows.length, 10).setValues(artifactSafeSheetMatrix_(rows));
  sheet.getRange("A1:J1").setBackground("#0b4f8a").setFontColor("#ffffff").setFontWeight("bold");
  sheet.getRange("A6:J6").setBackground("#dbeafe").setFontWeight("bold");
  sheet.getRange("B3:H3").setNumberFormat("#,##0");
  if (rows.length) sheet.getRange(7, 4, rows.length, 6).setNumberFormat("#,##0");
  sheet.setFrozenRows(6);
  sheet.getRange(1, 1, Math.max(7, 6 + rows.length), 10).setWrap(true).setVerticalAlignment("middle");
  sheet.autoResizeColumns(1, 10);
}

function complianceWriteInvoiceSheet_(sheet, context) {
  var headers = [["請求日", "請求書番号", "請求ID", "状態", "税込請求額", "消込額", "反対取引・相殺等", "請求残高", "役務提供日", "入金期限"]];
  sheet.getRange("A1:J1").setValues(headers).setBackground("#dbeafe").setFontWeight("bold");
  var rows = context.finance.invoices.map(function(invoice) {
    var position = financeInvoicePosition_(context.finance.state, invoice.id);
    return [
      invoice.invoiceDate,
      invoice.invoiceNo,
      invoice.id,
      invoice.status,
      Number(invoice.totalInclTax),
      Number(position.cashAllocated || 0),
      Number(position.billingReduction || 0) + Number(position.nonCashSettled || 0),
      Number(position.outstanding || 0),
      invoice.accountingDate,
      invoice.paymentDueDate
    ];
  }).sort(function(a, b) {
    return String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]));
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, 10).setValues(artifactSafeSheetMatrix_(rows));
  if (rows.length) sheet.getRange(2, 5, rows.length, 4).setNumberFormat("#,##0");
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, Math.max(2, rows.length + 1), 10).setWrap(true).setVerticalAlignment("middle");
  sheet.autoResizeColumns(1, 10);
}

function complianceWritePaymentAuditSheet_(sheet, context) {
  var values = [
    ["項目", "値"],
    ["会計revision", context.finance.revision],
    ["会計stateHash", context.finance.stateHash],
    ["対象recordId", context.record.recordId],
    ["対象者正本version", Number(context.canonical.version)],
    ["対象者payloadHash", context.canonical.payloadHash],
    ["請求件数", context.finance.invoices.length],
    ["入金・返金取引件数", context.finance.payments.length],
    ["消込・反対消込件数", context.finance.allocations.length],
    ["反対取引・相殺・貸倒件数", context.finance.credits.length],
    ["作成日時", artifactNowText_()],
    ["計算方法", "FinanceStore正本をhash chain検証後、financeCustomerPosition_・financeInvoicePosition_で集計"]
  ];
  sheet.getRange(1, 1, values.length, 2).setValues(artifactSafeSheetMatrix_(values));
  sheet.getRange("A1:B1").setBackground("#dbeafe").setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 520);
  sheet.getRange(1, 1, values.length, 2).setWrap(true).setVerticalAlignment("top");
}

function complianceEnsureArchiveFolder_(autoRoot, allowedOutputEmails) {
  var parentId = autoRoot.getId();
  var name = RENEWAL_COMPLIANCE_ARCHIVE.ARCHIVE_FOLDER_NAME;
  var key = RENEWAL_COMPLIANCE_ARCHIVE.ARCHIVE_FOLDER_PROPERTY_PREFIX + artifactShortKey_(parentId);
  var props = PropertiesService.getScriptProperties();
  var identity = JSON.stringify({
    format: "CDP_RENEWAL_COMPLIANCE_ARCHIVE_FOLDER_V1",
    parentId: parentId
  });
  var matches = artifactIteratorItems_(autoRoot.getFoldersByName(name), 2);
  if (matches.length > 1) throw new Error("同名の監査保管フォルダが複数あります。重複を監査してください。");
  var storedId = artifactText_(props.getProperty(key));
  var folder = null;
  var createdNow = false;
  var published = false;
  var operation = artifactDriveAttemptOperation_(
    "CREATE", "", name, "application/vnd.google-apps.folder", parentId
  );
  try {
    if (storedId) {
      folder = DriveApp.getFolderById(storedId);
      if (matches.length !== 1 || matches[0].getId() !== storedId) {
        throw new Error("保存済み監査保管フォルダのIDとDrive上の所定フォルダが一致しません。");
      }
    } else if (matches.length === 1) {
      folder = matches[0];
      if (artifactText_(folder.getDescription()) !== identity) {
        throw new Error("識別情報のない手作業の監査保管フォルダは自動採用しません。");
      }
    } else {
      folder = artifactCreateFolderInFolder_(name, autoRoot, "監査保管フォルダ", allowedOutputEmails, false);
      createdNow = true;
      folder.setDescription(identity);
    }
    artifactAssertReusableDriveItem_(folder, parentId, "監査保管フォルダ", allowedOutputEmails);
    if (artifactText_(folder.getDescription()) !== identity) {
      throw new Error("監査保管フォルダの識別情報が一致しません。");
    }
    props.setProperty(key, folder.getId());
    if (artifactText_(props.getProperty(key)) !== folder.getId()) {
      throw new Error("監査保管フォルダIDを保存・読戻しできません。");
    }
    published = true;
    artifactClearPublishedDriveAttempt_(
      operation,
      folder.getId(),
      "監査保管フォルダ"
    );
    return folder;
  } catch (error) {
    if (createdNow && folder && !published) {
      artifactPermanentlyDeleteNewDriveItem_(
        folder, "作成途中の監査保管フォルダ", "folder", error
      );
      try { props.deleteProperty(key); } catch (ignoredPropertyCleanupError) {}
    }
    throw error;
  }
}

function complianceEnsureServerAudit_(input) {
  var spreadsheet = storeOpen_();
  var correlationId = "CMPARC_" + artifactHashHex_([
    input.scopeKey, input.kind, input.hash, input.fileId, input.action
  ]).slice(0, 48).toUpperCase();
  var existing = storeReadObjects_(spreadsheet, "audit").filter(function(row) {
    return artifactText_(row.correlationId) === correlationId;
  });
  if (existing.length > 1) {
    throw new Error("監査保管のサーバー監査行が重複しています。【担当部署に確認が必要】");
  }
  if (!existing.length) {
    try {
      storeAppendAudit_(spreadsheet, {
        eventState: "COMMITTED",
        entityType: "compliance_archive",
        entityKey: input.scopeKey,
        action: input.action,
        actor: input.actor,
        reasonCode: "COMPLIANCE_ARCHIVE",
        approver: "",
        beforeHash: "",
        afterHash: input.hash,
        versionBefore: 0,
        versionAfter: 1,
        correlationId: correlationId
      });
      existing = storeReadObjects_(spreadsheet, "audit").filter(function(row) {
        return artifactText_(row.correlationId) === correlationId;
      });
    } catch (appendOrReadbackError) {
      appendOrReadbackError.complianceAuditOutcomeUncertain = true;
      throw appendOrReadbackError;
    }
  }
  if (
    existing.length !== 1 ||
    artifactText_(existing[0].afterHash) !== artifactText_(input.hash) ||
    artifactText_(existing[0].action) !== artifactText_(input.action)
  ) {
    var verificationError =
      new Error("監査保管のサーバー監査行を一意に保存・読戻しできません。【担当部署に確認が必要】");
    verificationError.complianceAuditOutcomeUncertain = true;
    throw verificationError;
  }
  return true;
}

function complianceTemplatesReady_(state, verify) {
  if (!state || !state.planTemplateId || !state.statusTemplateId || !state.templateFolderId) return false;
  if (verify !== false) {
    complianceAssertTemplateStorageSafe_(state);
    complianceAssertPlanTemplateClean_(state.planTemplateId);
    complianceAssertStatusTemplateClean_(state.statusTemplateId);
  }
  return true;
}

function complianceAssertTemplateStorageSafe_(state) {
  var settings = artifactLoadSettings_();
  var stateFolderId = artifactExtractDriveId_(state && state.templateFolderId);
  var settingsFolderId = artifactExtractDriveId_(settings && settings.templateFolderId);
  if (!stateFolderId || stateFolderId !== settingsFolderId) {
    throw new Error("別添04・05専用原本の保存先が成果物設定の専用原本フォルダと一致しません。");
  }
  var folder = artifactAssertTemplateFolderSafe_(
    DriveApp.getFolderById(stateFolderId),
    DriveApp.getRootFolder().getId()
  );
  artifactAssertTemplateFileSafe_(
    DriveApp.getFileById(state.planTemplateId),
    folder,
    "別添04専用原本"
  );
  artifactAssertTemplateFileSafe_(
    DriveApp.getFileById(state.statusTemplateId),
    folder,
    "別添05専用原本"
  );
  return true;
}

function complianceRequireTemplatesReady_() {
  var state = complianceLoadTemplateState_(true);
  if (!complianceTemplatesReady_(state, true)) {
    throw new Error("別添04・05の所有者専用原本が未準備です。データ管理で「専用原本を自動準備」を1回実行してください。");
  }
  return state;
}

function complianceLoadTemplateState_(required) {
  var raw = PropertiesService.getScriptProperties().getProperty(
    RENEWAL_COMPLIANCE_ARCHIVE.TEMPLATE_STATE_KEY
  );
  if (!raw) {
    if (required) throw new Error("別添04・05の所有者専用原本が未準備です。");
    return null;
  }
  var state;
  try { state = JSON.parse(raw); }
  catch (error) { throw new Error("別添04・05専用原本の設定が破損しています。"); }
  if (
    !state ||
    state.format !== RENEWAL_COMPLIANCE_ARCHIVE.TEMPLATE_STATE_FORMAT ||
    Number(state.schemaVersion) !== RENEWAL_COMPLIANCE_ARCHIVE.SCHEMA_VERSION
  ) {
    throw new Error("別添04・05専用原本の設定形式が一致しません。");
  }
  var expected = artifactHashHex_(complianceTemplateStateEnvelope_(state));
  if (!/^[0-9a-f]{64}$/.test(artifactText_(state.envelopeHash)) || state.envelopeHash !== expected) {
    throw new Error("別添04・05専用原本の設定hashが一致しません。");
  }
  return state;
}

function complianceSaveTemplateState_(state) {
  state.templateFolderId = artifactExtractDriveId_(state.templateFolderId);
  state.planTemplateId = artifactExtractDriveFileId_(state.planTemplateId);
  state.statusTemplateId = artifactExtractDriveFileId_(state.statusTemplateId);
  if (!state.templateFolderId || !state.planTemplateId || !state.statusTemplateId) {
    throw new Error("別添04・05専用原本の設定IDが不足しています。");
  }
  state.envelopeHash = artifactHashHex_(complianceTemplateStateEnvelope_(state));
  var serialized = JSON.stringify(state);
  var props = PropertiesService.getScriptProperties();
  props.setProperty(RENEWAL_COMPLIANCE_ARCHIVE.TEMPLATE_STATE_KEY, serialized);
  if (props.getProperty(RENEWAL_COMPLIANCE_ARCHIVE.TEMPLATE_STATE_KEY) !== serialized) {
    throw new Error("別添04・05専用原本の設定を保存・読戻しできません。");
  }
  return complianceLoadTemplateState_(true);
}

function complianceTemplateStateEnvelope_(state) {
  return {
    format: state.format,
    schemaVersion: Number(state.schemaVersion),
    templateFolderId: artifactExtractDriveId_(state.templateFolderId),
    planTemplateId: artifactExtractDriveFileId_(state.planTemplateId),
    statusTemplateId: artifactExtractDriveFileId_(state.statusTemplateId),
    updatedAt: artifactText_(state.updatedAt),
    updatedBy: artifactText_(state.updatedBy).toLowerCase()
  };
}

function complianceProvisionPlanTemplate_(templateFolder, storedId) {
  var outputName = RENEWAL_COMPLIANCE_ARCHIVE.PLAN_TEMPLATE_NAME;
  var id = artifactExtractDriveFileId_(storedId);
  if (id) {
    var storedFile = DriveApp.getFileById(id);
    artifactAssertTemplateFileSafe_(storedFile, templateFolder, "既存の別添04専用原本");
    complianceAssertPlanTemplateClean_(id);
    return { file: storedFile, created: false, operation: null };
  }
  var matches = artifactIteratorItems_(templateFolder.getFilesByName(outputName), 2);
  if (matches.length > 1) throw new Error("同名の別添04専用原本が複数あります。");
  if (matches.length === 1) {
    artifactAssertTemplateFileSafe_(matches[0], templateFolder, "既存の別添04専用原本");
    complianceAssertPlanTemplateClean_(matches[0].getId(), true);
    if (artifactHasDedicatedTemplatePin_("implementationPlan", matches[0].getId())) {
      artifactAssertDedicatedTemplatePin_("implementationPlan", matches[0].getId());
    } else {
      artifactPinDedicatedTemplate_("implementationPlan", matches[0].getId());
    }
    return { file: matches[0], created: false, operation: null };
  }
  var outputFile = null;
  try {
    artifactAssertPinnedReferenceSource_("implementationPlanSource");
    var source = SpreadsheetApp.openById(RENEWAL_COMPLIANCE_ARCHIVE.PLAN_SOURCE_ID);
    var base = source.getSheetByName("ベース");
    if (!base) throw new Error("別添04参照元に「ベース」シートがありません。");
    var created = artifactCreateSpreadsheetInFolder_(
      outputName, templateFolder, "別添04専用原本", "", true
    );
    outputFile = created.file;
    var spreadsheet = created.spreadsheet;
    var copied = base.copyTo(spreadsheet).setName("ベース");
    spreadsheet.getSheets().forEach(function(sheet) {
      if (sheet.getSheetId() !== copied.getSheetId()) spreadsheet.deleteSheet(sheet);
    });
    SpreadsheetApp.flush();
    artifactAssertPinnedReferenceSource_("implementationPlanSource");
    complianceAssertPlanTemplateClean_(outputFile.getId(), true);
    artifactPinDedicatedTemplate_("implementationPlan", outputFile.getId());
    return {
      file: outputFile,
      created: true,
      operation: artifactDriveAttemptOperation_("CREATE", "", outputName, "application/vnd.google-apps.spreadsheet", templateFolder.getId())
    };
  } catch (error) {
    if (outputFile) artifactRemoveCreatedFilePermanently_(outputFile);
    throw error;
  }
}

function complianceProvisionStatusTemplate_(templateFolder, storedId) {
  var finalName = RENEWAL_COMPLIANCE_ARCHIVE.STATUS_TEMPLATE_NAME;
  var id = artifactExtractDriveFileId_(storedId);
  if (id) {
    var storedFile = DriveApp.getFileById(id);
    artifactAssertTemplateFileSafe_(storedFile, templateFolder, "既存の別添05専用原本");
    complianceAssertStatusTemplateClean_(id);
    return { file: storedFile, created: false, operation: null };
  }
  var matches = artifactIteratorItems_(templateFolder.getFilesByName(finalName), 2);
  if (matches.length > 1) throw new Error("同名の別添05専用原本が複数あります。");
  if (matches.length === 1) {
    artifactAssertTemplateFileSafe_(matches[0], templateFolder, "既存の別添05専用原本");
    complianceAssertStatusTemplateClean_(matches[0].getId(), true);
    if (artifactHasDedicatedTemplatePin_("implementationStatus", matches[0].getId())) {
      artifactAssertDedicatedTemplatePin_("implementationStatus", matches[0].getId());
    } else {
      artifactPinDedicatedTemplate_("implementationStatus", matches[0].getId());
    }
    return { file: matches[0], created: false, operation: null };
  }
  var tempMatches = artifactIteratorItems_(
    templateFolder.getFilesByName(RENEWAL_COMPLIANCE_ARCHIVE.STATUS_TEMP_TEMPLATE_NAME), 2
  );
  if (tempMatches.length) {
    throw new Error("前回中断した別添05の一時原本があります。内容を確認し、不要なら削除してください。【担当部署に確認が必要】");
  }
  var tempFile = null;
  var finalFile = null;
  try {
    artifactAssertPinnedReferenceSource_("implementationStatusSource");
    tempFile = artifactCopyFileInFolder_(
      RENEWAL_COMPLIANCE_ARCHIVE.STATUS_SOURCE_ID,
      RENEWAL_COMPLIANCE_ARCHIVE.STATUS_TEMP_TEMPLATE_NAME,
      "application/vnd.google-apps.document",
      templateFolder,
      "一時別添05専用原本",
      "",
      true
    );
    var tempDoc = DocumentApp.openById(tempFile.getId());
    var roots = tempDoc.getTabs();
    var found = roots.some(function(tab) {
      return tab.getId() === RENEWAL_COMPLIANCE_ARCHIVE.STATUS_SOURCE_BASE_TAB_ID;
    });
    if (!found) throw new Error("別添05参照元のベースタブを確認できません。");
    var requests = artifactCertificateTabsToDelete_(
      roots, RENEWAL_COMPLIANCE_ARCHIVE.STATUS_SOURCE_BASE_TAB_ID
    );
    tempDoc.saveAndClose();
    requests.push({
      updateDocumentTabProperties: {
        tabProperties: {
          tabId: RENEWAL_COMPLIANCE_ARCHIVE.STATUS_SOURCE_BASE_TAB_ID,
          title: "ベース"
        },
        fields: "title"
      }
    });
    Docs.Documents.batchUpdate({ requests: requests }, tempFile.getId());
    complianceAssertStatusTemplateClean_(tempFile.getId(), true);
    finalFile = artifactCopyFileInFolder_(
      tempFile.getId(),
      finalName,
      "application/vnd.google-apps.document",
      templateFolder,
      "別添05専用原本",
      "",
      true
    );
    complianceAssertStatusTemplateClean_(finalFile.getId(), true);
    artifactAssertPinnedReferenceSource_("implementationStatusSource");
    artifactPinDedicatedTemplate_("implementationStatus", finalFile.getId());
    var sanitizedSourceId = tempFile.getId();
    artifactRemoveCreatedFilePermanently_(tempFile);
    artifactClearDriveAttempt_(artifactDriveAttemptKey_(artifactDriveAttemptOperation_(
      "COPY",
      RENEWAL_COMPLIANCE_ARCHIVE.STATUS_SOURCE_ID,
      RENEWAL_COMPLIANCE_ARCHIVE.STATUS_TEMP_TEMPLATE_NAME,
      "application/vnd.google-apps.document",
      templateFolder.getId()
    )));
    tempFile = null;
    return {
      file: finalFile,
      created: true,
      operation: artifactDriveAttemptOperation_(
        "COPY", sanitizedSourceId, finalName,
        "application/vnd.google-apps.document", templateFolder.getId()
      )
    };
  } catch (error) {
    if (finalFile) artifactRemoveCreatedFilePermanently_(finalFile);
    if (tempFile) artifactRemoveCreatedFilePermanently_(tempFile);
    throw error;
  }
}

function complianceClearTemplateDriveAttempt_(provision, templateFolder) {
  if (!provision || !provision.created || !provision.file) return;
  var operation = provision.operation;
  if (operation) {
    artifactClearPublishedDriveAttempt_(
      operation, provision.file.getId(), "監査保管専用原本"
    );
  }
}

function complianceAssertPlanTemplateClean_(fileId, skipPin) {
  var id = artifactExtractDriveFileId_(fileId);
  if (!id) throw new Error("別添04専用原本IDがありません。");
  if (!skipPin) artifactAssertDedicatedTemplatePin_("implementationPlan", id);
  artifactAssertDriveCommentsAbsent_(id, "別添04専用原本");
  var spreadsheet = SpreadsheetApp.openById(id);
  var sheets = spreadsheet.getSheets();
  if (sheets.length !== 1 || sheets[0].getName() !== "ベース") {
    throw new Error("別添04専用原本は「ベース」1シートだけである必要があります。");
  }
  var values = sheets[0].getRange("A1:D8").getDisplayValues();
  if (
    artifactText_(values[0][0]) !== "講習区分" ||
    artifactText_(values[0][1]) !== "開始(人)" ||
    artifactText_(values[0][2]) !== "修了(人)" ||
    artifactText_(values[3][0]).indexOf("二等無人航空機操縦士") < 0 ||
    artifactText_(values[4][0]).indexOf("一等無人航空機操縦士") < 0
  ) {
    throw new Error("別添04専用原本の固定見出しが一致しません。");
  }
  return true;
}

function complianceAssertStatusTemplateClean_(fileId, skipPin) {
  var id = artifactExtractDriveFileId_(fileId);
  if (!id) throw new Error("別添05専用原本IDがありません。");
  if (!skipPin) artifactAssertDedicatedTemplatePin_("implementationStatus", id);
  artifactAssertDriveCommentsAbsent_(id, "別添05専用原本");
  artifactAssertDocumentAdvancedClean_(id, "別添05専用原本");
  var doc = DocumentApp.openById(id);
  var tabs = artifactFlattenDocumentTabs_(doc.getTabs());
  if (tabs.length !== 1 || artifactText_(tabs[0].getTitle()) !== "ベース") {
    throw new Error("別添05専用原本は「ベース」1タブだけである必要があります。");
  }
  var body = tabs[0].asDocumentTab().getBody();
  var text = body.getText();
  var tables = body.getTables();
  if (
    text.indexOf("登録更新講習機関実施状況報告書") < 0 ||
    text.indexOf("添付資料：講習修了者一覧") < 0 ||
    tables.length !== 1 ||
    tables[0].getNumRows() !== 12 ||
    /2026年[ 　]*[0-9]+月[ 　]*[0-9]+日[ 　]*～/.test(text)
  ) {
    throw new Error("別添05専用原本の固定構造または空欄状態が一致しません。");
  }
  return true;
}
