// @ts-nocheck
// 事務規程に基づく8種類の保管物を、個人単位と期間単位を混同せず作成する。

var RENEWAL_COMPLIANCE_ARCHIVE = {
  SCHEMA_VERSION: 1,
  TEMPLATE_STATE_KEY: "RENEWAL_COMPLIANCE_TEMPLATE_STATE_V1",
  TEMPLATE_STATE_FORMAT: "CDP_RENEWAL_COMPLIANCE_TEMPLATE_STATE_V1",
  ARCHIVE_FOLDER_NAME: "監査保管",
  ARCHIVE_FOLDER_PROPERTY_PREFIX: "RENEWAL_COMPLIANCE_ARCHIVE_FOLDER_",
  SAMPLE_FOLDER_NAME: "サンプル出力",
  SAMPLE_FOLDER_PROPERTY_PREFIX: "RENEWAL_COMPLIANCE_SAMPLE_FOLDER_",
  PLAN_SOURCE_ID: "1igNBB5Ved91p-yUX4NhOUEWuW6KwIc-2jgOjReMp_Js",
  STATUS_SOURCE_ID: "10VToVFT0QltCgsRyGPt1nH9oeCQvz60KtmGTJjn_bZQ",
  STATUS_SOURCE_BASE_TAB_ID: "t.auzrd88tu44r",
  PLAN_TEMPLATE_NAME: "別添04_登録更新講習機関実施計画書_清浄原本",
  STATUS_TEMPLATE_NAME: "別添05_登録更新講習機関実施状況報告書_清浄原本",
  STATUS_TEMP_TEMPLATE_NAME: "一時_別添05原本清浄化_PREPARED",
  KINDS: [
    "training", "implementationPlan", "implementationStatus", "ledger",
    "applicationEvidence", "certificate", "dipsCsv", "paymentRecord"
  ],
  LABELS: {
    training: "事務規程、別添03 講習記録簿　保管",
    implementationPlan: "事務規程、別添04 実施計画書　保管",
    implementationStatus: "事務規程、別添05 実施状況報告書　保管",
    ledger: "事務規程、別添13 修了証明書発行台帳　保管",
    applicationEvidence: "申込書・技能証明書・身分証　保管",
    certificate: "無人航空機更新講習修了証明書　保管",
    dipsCsv: "CSVファイル　保管",
    paymentRecord: "講習料金収納記録　保管"
  },
  MIME_TYPES: {
    training: "application/vnd.google-apps.spreadsheet",
    implementationPlan: "application/vnd.google-apps.spreadsheet",
    implementationStatus: "application/vnd.google-apps.document",
    ledger: "application/vnd.google-apps.spreadsheet",
    applicationEvidence: "application/vnd.google-apps.spreadsheet",
    certificate: "application/vnd.google-apps.document",
    dipsCsv: "text/csv",
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
    // 確認画面では入力・正本版・年度対応だけを検査する。
    // DriveのACL・原本・出力先実体は作成確定後、書込みより前にロック内で
    // 必ず再検査する。確認と作成で同じ重いDrive検査を重複させない。
    var context = complianceBuildContext_(
      kind, request, authorization, { skipDriveValidation: true }
    );
    return {
      success: true,
      ready: true,
      kind: kind,
      label: complianceResultLabel_(kind, context.sampleMode),
      summary: context.summary,
      warnings: context.warnings || [],
      message: context.sampleMode
        ? "サンプル出力の作成条件を満たしています。正式提出・正式保管には使用できません。"
        : "作成条件を満たしています。"
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
    // ロック待ちの前は入力・正本版だけを検査する。Drive安全性は下の
    // ロック内の完全検査で確認し、合格するまでファイルを作成しない。
    complianceBuildContext_(
      kind, request, firstAuthorization, { skipDriveValidation: true }
    );
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
    if (context.sampleMode) {
      targetFolder = complianceEnsureSampleFolder_(autoRoot, settings.allowedOutputEmails);
    } else if (kind === "implementationPlan" || kind === "implementationStatus") {
      targetFolder = complianceEnsureArchiveFolder_(autoRoot, settings.allowedOutputEmails);
    } else {
      targetFolder = artifactEnsureRecordFolder_(autoRoot, context.record, settings.allowedOutputEmails);
    }
    var identity = complianceOutputIdentity_(kind, context);
    var fileName = complianceOutputFileName_(kind, context, identity.hash);
    if (context.sampleMode) {
      fileName = complianceResolveSampleOutputFileName_(
        targetFolder,
        fileName,
        complianceOutputMimeType_(kind, context),
        identity,
        context
      );
    }
    var reusable = complianceFindReusableFile_(
      targetFolder,
      fileName,
      complianceOutputMimeType_(kind, context),
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
      var recoveryAction = context.sampleMode
        ? (recoveryAttempt ? "COMPLIANCE_SAMPLE_CREATE" : "COMPLIANCE_SAMPLE_REUSE")
        : (recoveryAttempt ? "COMPLIANCE_ARCHIVE_CREATE" : "COMPLIANCE_ARCHIVE_REUSE");
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
      action: context.sampleMode ? "COMPLIANCE_SAMPLE_CREATE" : "COMPLIANCE_ARCHIVE_CREATE"
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
    label: complianceResultLabel_(kind, context.sampleMode),
    status: reused ? "reused" : "created",
    fileId: file.getId(),
    fileName: file.getName(),
    url: file.getUrl(),
    folderUrl: context.outputFolderUrl || "",
    warnings: warnings,
    sampleMode: context.sampleMode === true,
    message: context.sampleMode
      ? (reused
        ? "同じ内容のサンプル出力を再利用しました。正式提出・正式保管には使用できません。"
        : "サンプル出力をGoogle Driveへ作成しました。正式提出・正式保管には使用できません。")
      : (reused ? "同じ正本内容の作成済み保管物を再利用しました。" : "Google Driveへ作成・保管しました。")
  };
}

function complianceResultLabel_(kind, sampleMode) {
  var label = RENEWAL_COMPLIANCE_ARCHIVE.LABELS[kind] || "監査保管";
  return sampleMode === true ? label + "（サンプル出力）" : label;
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

function complianceBuildContext_(kind, request, authorization, runtime) {
  runtime = runtime || {};
  var settings = artifactLoadSettings_();
  artifactAssertAllowedOutputEmails_(settings.allowedOutputEmails);
  var context = {
    kind: kind,
    request: request,
    authorization: authorization,
    settings: settings,
    summary: {},
    warnings: []
  };
  var sample = complianceSampleRequestContext_(kind, request);
  if (sample) {
    context.sampleMode = true;
    context.sampleRecord = sample.record;
    context.sampleCanonical = sample.canonical;
    context.warnings.push("これはサンプル出力です。正式提出・正式保管・採番・会計処理には使用できません。");
  }
  if (kind === "implementationPlan") {
    return complianceBindOutputFolder_(
      complianceBuildPlanContext_(context), runtime.skipDriveValidation === true
    );
  }
  if (kind === "implementationStatus") {
    return complianceBindOutputFolder_(
      complianceBuildStatusContext_(context), runtime.skipDriveValidation === true
    );
  }
  if (context.sampleMode) {
    return complianceBindOutputFolder_(
      complianceBuildSampleRecordContext_(context), runtime.skipDriveValidation === true
    );
  }
  if (["training", "ledger", "certificate", "dipsCsv"].indexOf(kind) >= 0) {
    throw new Error("正式成果物は成果物専用の作成前検査・作成処理を使用してください。");
  }
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
    return complianceBindOutputFolder_(context, runtime.skipDriveValidation === true);
  }
  context.finance = complianceFinanceSnapshotForRecord_(context.record.recordId);
  if (!context.finance.invoices.length && !context.finance.payments.length) {
    throw new Error("正式会計台帳に、この対象者の請求・入金記録がありません。対象者画面の旧金額から収納記録を推測作成しません。");
  }
  context.summary.invoiceCount = context.finance.invoices.length;
  context.summary.paymentCount = context.finance.payments.length;
  context.summary.financeRevision = context.finance.revision;
  return complianceBindOutputFolder_(context, runtime.skipDriveValidation === true);
}

function complianceBindOutputFolder_(context, skipDriveValidation) {
  var fiscalYear = "";
  if (context.kind === "implementationPlan") {
    fiscalYear = artifactFiscalYearFromIso_(context.planMonth + "-01");
  } else if (context.kind === "implementationStatus") {
    fiscalYear = artifactFiscalYearFromIso_(context.reportStartDate);
  } else {
    fiscalYear = artifactText_((context.record || context.sampleRecord || {}).fiscalYear);
  }
  var outputFolderId = artifactOutputFolderForFiscalYear_(context.settings, fiscalYear);
  if (skipDriveValidation !== true) {
    artifactRequireSafeOutputFolder_(
      outputFolderId,
      [context.settings.ledgerTemplateId, context.settings.certificateTemplateId],
      context.settings.allowedOutputEmails,
      fiscalYear
    );
  }
  context.settings = artifactClone_(context.settings);
  context.settings.outputFolderId = outputFolderId;
  context.outputFiscalYear = fiscalYear;
  return context;
}

function complianceSampleRequestContext_(kind, request) {
  if (!request || request.sampleMode !== true) return null;
  var canonicalRequest = artifactLoadCanonicalArtifactRequest_({
    recordId: request.recordId,
    expectedVersion: request.expectedVersion,
    expectedPayloadHash: request.expectedPayloadHash,
    kinds: ["training"]
  });
  var record = artifactNormalizeRecord_(canonicalRequest.request.record);
  if (!complianceIsSyntheticSampleRecord_(record)) {
    throw new Error("サンプル出力は、対象者名と複数の試験用識別子を確認できる合成データだけに使用できます。");
  }
  return {
    record: record,
    canonical: canonicalRequest.canonical
  };
}

function complianceBuildSampleRecordContext_(context) {
  context.canonical = context.sampleCanonical;
  context.record = context.sampleRecord;
  context.scopeKey = "sample:" + context.kind + ":" + context.record.recordId;
  context.summary = {
    targetName: artifactRecordName_(context.record),
    managementId: artifactText_(context.record.personId || context.record.managementId),
    recordVersion: Number(context.canonical.version || 0),
    sampleMode: true
  };
  if (!artifactRecordName_(context.record)) throw new Error("サンプル対象者名がありません。");
  if (context.kind === "paymentRecord") {
    context.summary.invoiceCount = artifactText_(context.record.invoiceNo) ? 1 : 0;
    context.summary.paymentCount = artifactText_(context.record.paymentDate) ? 1 : 0;
    context.summary.financeRevision = 0;
  }
  return context;
}

function complianceIsSyntheticSampleRecord_(record) {
  var targetName = artifactRecordName_(record);
  if (targetName.indexOf("サンプル") !== 0) return false;
  var markers = [
    /^SAMPLE-[A-Z0-9_-]+$/i.test(artifactText_(record.personId || record.managementId)),
    /^SAMPLE-[A-Z0-9_-]+$/i.test(artifactText_(record.licenseNo)),
    /^SAMPLE-[A-Z0-9_-]+$/i.test(artifactText_(record.certificateNo)),
    artifactText_(record.companyName).indexOf("試験用") >= 0,
    artifactText_(record.internalMemo).indexOf("試験用ダミーデータ") >= 0
  ].filter(function(value) { return value === true; });
  return markers.length >= 2;
}

function complianceBuildPlanContext_(context) {
  var input = context.request || {};
  var month = artifactText_(input.planMonth);
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("実施計画書の対象月をYYYY-MM形式で指定してください。");
  }
  artifactOutputFolderForFiscalYear_(
    context.settings, artifactFiscalYearFromIso_(month + "-01")
  );
  var counts = {
    firstStart: complianceNonNegativeInteger_(input.firstStartCount, "一等の開始予定人数"),
    firstFinish: complianceNonNegativeInteger_(input.firstFinishCount, "一等の修了予定人数"),
    secondStart: complianceNonNegativeInteger_(input.secondStartCount, "二等の開始予定人数"),
    secondFinish: complianceNonNegativeInteger_(input.secondFinishCount, "二等の修了予定人数")
  };
  var state = context.sampleMode ? null : complianceRequireTemplatesReady_();
  context.templateState = state;
  context.planMonth = month;
  context.counts = counts;
  context.scopeKey = (context.sampleMode ? "sample:" : "") + "implementationPlan:" + month;
  context.summary = {
    planMonth: month,
    firstStartCount: counts.firstStart,
    firstFinishCount: counts.firstFinish,
    secondStartCount: counts.secondStart,
    secondFinishCount: counts.secondFinish,
    sampleMode: context.sampleMode === true,
    targetName: context.sampleMode ? artifactRecordName_(context.sampleRecord) : "",
    managementId: context.sampleMode ? artifactText_(context.sampleRecord.personId) : ""
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
  var startFiscalYear = artifactFiscalYearFromIso_(startDate);
  var endFiscalYear = artifactFiscalYearFromIso_(endDate);
  if (startFiscalYear !== endFiscalYear) {
    throw new Error("別添05の対象開始日と対象終了日は同じ年度内にしてください。");
  }
  artifactOutputFolderForFiscalYear_(context.settings, startFiscalYear);
  var state = context.sampleMode ? null : complianceRequireTemplatesReady_();
  // サンプル出力へ実在者の人数・会場を混ぜない。サンプル対象者1件だけで集計する。
  var records = context.sampleMode
    ? [context.sampleRecord]
    : storeListRecords_({ includeDeleted: false });
  var summary = complianceStatusSummary_(records, startDate, endDate);
  if (context.sampleMode) {
    var sampleClass = artifactClassValue_(context.sampleRecord.licenseClass);
    var sampleVenue = artifactText_(context.sampleRecord.courseVenue) || "サンプル会場（正式使用不可）";
    if (sampleClass === "一等" && summary.first.count > 0 && !summary.first.venues.length) {
      summary.first.venues.push(sampleVenue);
    }
    if (sampleClass === "二等" && summary.second.count > 0 && !summary.second.venues.length) {
      summary.second.venues.push(sampleVenue);
    }
  }
  context.templateState = state;
  context.reportDate = reportDate;
  context.reportStartDate = startDate;
  context.reportEndDate = endDate;
  context.statusSummary = summary;
  context.scopeKey = (context.sampleMode ? "sample:" : "") +
    "implementationStatus:" + startDate + ":" + endDate;
  context.summary = {
    reportDate: reportDate,
    reportStartDate: startDate,
    reportEndDate: endDate,
    firstCompletedCount: summary.first.count,
    secondCompletedCount: summary.second.count,
    firstVenues: summary.first.venues,
    secondVenues: summary.second.venues,
    sampleMode: context.sampleMode === true,
    targetName: context.sampleMode ? artifactRecordName_(context.sampleRecord) : "",
    managementId: context.sampleMode ? artifactText_(context.sampleRecord.personId) : ""
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
    scopeKey: context.scopeKey,
    sampleMode: context.sampleMode === true
  };
  if (context.sampleMode) {
    value.sampleRecordId = context.sampleRecord.recordId;
    value.sampleRecordVersion = Number(context.sampleCanonical.version);
    value.sampleRecordPayloadHash = artifactText_(context.sampleCanonical.payloadHash);
    value.sampleGeneratorVersion = 1;
  }
  if (kind === "ledger") {
    if (context.sampleMode) value.sampleGeneratorVersion = 2;
  } else if (kind === "implementationPlan") {
    value.planMonth = context.planMonth;
    value.counts = context.counts;
    if (context.sampleMode) value.sampleGeneratorVersion = 2;
    else value.templatePin = complianceTemplatePinValue_("implementationPlan", context.templateState.planTemplateId);
  } else if (kind === "implementationStatus") {
    value.reportDate = context.reportDate;
    value.startDate = context.reportStartDate;
    value.endDate = context.reportEndDate;
    value.summary = context.statusSummary;
    if (context.sampleMode) value.sampleGeneratorVersion = 1;
    else value.templatePin = complianceTemplatePinValue_("implementationStatus", context.templateState.statusTemplateId);
  } else if (kind === "applicationEvidence") {
    value.recordId = context.record.recordId;
    value.recordVersion = Number(context.canonical.version);
    value.recordPayloadHash = artifactText_(context.canonical.payloadHash);
  } else if (kind === "paymentRecord") {
    value.recordId = context.record.recordId;
    value.recordVersion = Number(context.canonical.version);
    value.recordPayloadHash = artifactText_(context.canonical.payloadHash);
    if (context.sampleMode) {
      // サンプル収納記録は正式なFinanceStoreへ登録しない。
      // 対象者正本の版・hashと生成器版だけで内容を一意にし、
      // 存在しない会計revisionを参照しない。
      value.sampleGeneratorVersion = 3;
    } else {
      value.financeRevision = context.finance.revision;
      value.financeStateHash = context.finance.stateHash;
    }
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
  var prefix = context.sampleMode === true ? "サンプル_正式使用禁止_" : "";
  if (kind === "implementationPlan") {
    return (prefix + "別添04_登録更新講習機関実施計画書_" +
      context.planMonth + "_" + suffix).slice(0, 180);
  }
  if (kind === "implementationStatus") {
    return (prefix + "別添05_登録更新講習機関実施状況報告書_" +
      context.reportStartDate + "_" + context.reportEndDate + "_" + suffix).slice(0, 180);
  }
  var personId = artifactSafeName_(context.record.personId || context.record.recordId);
  if (kind === "training") {
    return (prefix + "別添03_講習記録簿_" + personId + "_" + suffix).slice(0, 180);
  }
  if (kind === "ledger") {
    return (
      prefix + "別添13_修了証明書発行台帳_" + personId + "_" + suffix +
      (context.sampleMode ? ".csv" : "")
    ).slice(0, 180);
  }
  if (kind === "certificate") {
    return (prefix + "更新講習修了証明書_" + personId + "_" + suffix).slice(0, 180);
  }
  if (kind === "dipsCsv") {
    return (prefix + "DIPS提出11列CSV_" + personId + "_" + suffix + ".csv").slice(0, 180);
  }
  if (kind === "applicationEvidence") {
    return (prefix + "申込書・技能証明書・身分証_保管チェックリスト_" + personId + "_v" +
      context.canonical.version + "_" + suffix).slice(0, 180);
  }
  if (context.sampleMode) {
    return (prefix + "講習料金収納記録_" + personId + "_" + suffix).slice(0, 180);
  }
  return ("講習料金収納記録_" + personId + "_会計r" + context.finance.revision + "_" + suffix).slice(0, 180);
}

function complianceOutputMimeType_(kind, context) {
  if (kind === "ledger" && context && context.sampleMode === true) return "text/csv";
  return RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind];
}

function complianceIdentityDescription_(identity) {
  return JSON.stringify({
    format: "CDP_RENEWAL_COMPLIANCE_OUTPUT_IDENTITY_V1",
    hash: identity.hash,
    value: identity.value
  });
}

function complianceSampleAlternateFileName_(baseName, revision) {
  var name = artifactText_(baseName);
  var number = Math.max(2, Number(revision || 2));
  var extensionMatch = /(\.csv)$/i.exec(name);
  var extension = extensionMatch ? extensionMatch[1] : "";
  var stem = extension ? name.slice(0, -extension.length) : name;
  var suffix = "_再作成" + number;
  return stem.slice(0, Math.max(1, 180 - suffix.length - extension.length)) +
    suffix + extension;
}

function complianceResolveSampleOutputFileName_(folder, baseName, mimeType, identity, context) {
  var expectedDescription = complianceIdentityDescription_(identity);
  var preservedConflict = false;
  for (var revision = 1; revision <= 20; revision++) {
    var candidate = revision === 1
      ? artifactText_(baseName)
      : complianceSampleAlternateFileName_(baseName, revision);
    var matches = artifactIteratorItems_(folder.getFilesByName(candidate), 3);
    if (!matches.length) {
      if (preservedConflict && context && Array.isArray(context.warnings)) {
        context.warnings.push(
          "旧仕様または内容変更済みのサンプルは上書きせず保存し、別名「" +
          candidate + "」で作成しました。"
        );
      }
      return candidate;
    }
    if (matches.length !== 1) {
      preservedConflict = true;
      continue;
    }
    var file = matches[0];
    var state;
    try {
      state = Drive.Files.get(file.getId(), {
        fields: "id,name,mimeType,trashed",
        supportsAllDrives: true
      });
    } catch (stateError) {
      preservedConflict = true;
      continue;
    }
    if (
      state &&
      state.trashed !== true &&
      artifactText_(state.mimeType) === artifactText_(mimeType) &&
      artifactText_(file.getDescription()) === expectedDescription
    ) {
      return candidate;
    }
    preservedConflict = true;
  }
  throw new Error(
    "旧仕様の同名サンプルが20世代以上あります。旧ファイルは変更していません。" +
    "サンプル出力フォルダを整理してから再実行してください。【担当部署に確認が必要】"
  );
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
  if (context.sampleMode && kind === "training") {
    return complianceCreateSampleTraining_(context, folder, fileName);
  }
  if (context.sampleMode && kind === "implementationPlan") {
    return complianceCreateSamplePlan_(context, folder, fileName);
  }
  if (context.sampleMode && kind === "implementationStatus") {
    return complianceCreateSampleStatus_(context, folder, fileName);
  }
  if (context.sampleMode && kind === "ledger") {
    return complianceCreateSampleLedger_(context, folder, fileName);
  }
  if (context.sampleMode && kind === "certificate") {
    return complianceCreateSampleCertificate_(context, folder, fileName);
  }
  if (context.sampleMode && kind === "dipsCsv") {
    return complianceCreateSampleDipsCsv_(context, folder, fileName);
  }
  if (context.sampleMode && kind === "paymentRecord") {
    return complianceCreateSamplePaymentRecord_(context, folder, fileName);
  }
  if (kind === "implementationPlan") return complianceCreatePlan_(context, folder, fileName);
  if (kind === "implementationStatus") return complianceCreateStatus_(context, folder, fileName);
  if (kind === "applicationEvidence") return complianceCreateApplicationChecklist_(context, folder, fileName);
  if (kind === "paymentRecord") return complianceCreatePaymentRecord_(context, folder, fileName);
  throw new Error("未対応の監査保管物です。");
}

function complianceDriveOperation_(kind, context, folder, fileName) {
  var sourceId = "";
  var operationType = "CREATE";
  if (context.sampleMode && kind === "training") {
    operationType = "COPY";
    sourceId = RENEWAL_ARTIFACT.TEMPLATE_IDS.training;
  } else if (context.sampleMode && kind === "certificate") {
    operationType = "COPY";
    sourceId = context.settings.certificateTemplateId;
  } else if (!context.sampleMode && kind === "implementationPlan") {
    operationType = "COPY";
    sourceId = context.templateState.planTemplateId;
  } else if (!context.sampleMode && kind === "implementationStatus") {
    operationType = "COPY";
    sourceId = context.templateState.statusTemplateId;
  }
  return artifactDriveAttemptOperation_(
    operationType,
    sourceId,
    fileName,
    complianceOutputMimeType_(kind, context),
    folder.getId()
  );
}

function complianceSampleRecord_(context) {
  var record = artifactClone_(context.sampleRecord || context.record || {});
  record.recordId = artifactText_(record.recordId || record.id || "SAMPLE");
  record.personId = artifactText_(record.personId || "SAMPLE-001");
  record.targetName = artifactRecordName_(record) || "サンプル太郎";
  record.certificateNo = /^SAMPLE-/i.test(artifactText_(record.certificateNo))
    ? artifactText_(record.certificateNo) : "SAMPLE-CERT-001";
  record.dipsApplicantId = "SAMPLE1";
  record.skillsApplicantNo = "0000000000";
  record.courseDate = artifactValidIsoDateOrBlank_(record.courseDate) || "2026-07-15";
  record.certificateIssuedDate =
    artifactValidIsoDateOrBlank_(record.certificateIssuedDate) || record.courseDate;
  record.certificateExpiry =
    artifactValidIsoDateOrBlank_(record.certificateExpiry) ||
    artifactAddCalendarMonthsMinusOne_(record.courseDate);
  record.certificateDeliveredDate =
    artifactValidIsoDateOrBlank_(record.certificateDeliveredDate) || record.certificateIssuedDate;
  record.certificateDelivered = "有り";
  record.certificateInstructor = artifactText_(record.certificateInstructor) || "サンプル講師";
  record.courseVenue = artifactText_(record.courseVenue) || "サンプル会場（正式使用禁止）";
  record.practicalVenue = artifactText_(record.practicalVenue) || record.courseVenue;
  record.dipsRecordMode = "新規登録";
  var feeText = artifactText_(record.feeExTax);
  var feeExTax = Number(feeText);
  if (!feeText || !Number.isSafeInteger(feeExTax) || feeExTax <= 0) feeExTax = 50000;
  var discountText = artifactText_(record.discountExTax);
  var discountExTax = Number(discountText);
  if (
    !discountText ||
    !Number.isSafeInteger(discountExTax) ||
    discountExTax < 0 ||
    discountExTax > feeExTax
  ) {
    discountExTax = 0;
  }
  var taxRateText = artifactText_(record.taxRate);
  var taxRate = Number(taxRateText);
  if (!taxRateText || !isFinite(taxRate) || taxRate < 0 || taxRate > 100) taxRate = 10;
  var taxRounding = artifactText_(record.taxRounding);
  if (["切捨て", "四捨五入", "切上げ"].indexOf(taxRounding) < 0) taxRounding = "切捨て";
  record.feeExTax = feeExTax;
  record.discountExTax = discountExTax;
  record.taxRate = taxRate;
  record.taxRounding = taxRounding;
  return record;
}

function complianceCreateSampleTraining_(context, folder, fileName) {
  var kind = "training";
  var label = complianceResultLabel_(kind, true);
  var sourceId = RENEWAL_ARTIFACT.TEMPLATE_IDS.training;
  artifactAssertTrainingTemplateClean_(sourceId);
  var file = artifactCopyFileInFolder_(
    sourceId, fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind],
    folder, label, context.settings.allowedOutputEmails, false
  );
  try {
    var record = complianceSampleRecord_(context);
    var firstClass = artifactClassValue_(record.licenseClass) === 1;
    var requiresPractical = artifactText_(record.suspensionCourse) === "あり";
    var sourceSheetName = firstClass ? "一等無人航空機操縦士" : "二等無人航空機操縦士";
    var keepColumns = firstClass ? 8 : 6;
    var ss = artifactOpenSpreadsheetByIdWithRetry_(file.getId());
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    var sheet = ss.getSheetByName(sourceSheetName);
    if (!sheet) throw new Error("講習記録簿参照元の対象区分シートがありません。");
    ss.getSheets().forEach(function(candidate) {
      if (candidate.getSheetId() !== sheet.getSheetId()) ss.deleteSheet(candidate);
    });
    if (sheet.getMaxRows() > 32) sheet.deleteRows(33, sheet.getMaxRows() - 32);
    if (sheet.getMaxColumns() > keepColumns) {
      sheet.deleteColumns(keepColumns + 1, sheet.getMaxColumns() - keepColumns);
    }
    sheet.setName(sourceSheetName + "（サンプル）");
    sheet.setTabColor("#b91c1c");
    sheet.getRange("A1").setValue(artifactSheetText_(
      "【サンプル・正式使用禁止】講習記録簿　受講者氏名（　" + record.targetName + "　）"
    )).setNote("入力・出力確認用です。正式保管・提出・実績集計には使用できません。");
    sheet.getRange("A4").setValue(artifactSheetText_(artifactClassLongLabel_(record.licenseClass)));
    sheet.getRange("A5").setValue(artifactSheetText_("受講日（" + artifactSlashDate_(record.courseDate) + "）"));
    sheet.getRange("A7").setValue(artifactSheetText_("場所（" + record.courseVenue + "）"));
    var modules = [
      "academicOverview", "academicRules", "academicLawUpdate", "academicAccident",
      "academicSafety", "academicVideo"
    ];
    if (firstClass) modules.push("academicFirstClass", "academicFirstClassVideo");
    modules.forEach(function(prefix, index) {
      if (!record[prefix + "Date"]) record[prefix + "Date"] = record.courseDate;
      if (!record[prefix + "Start"]) record[prefix + "Start"] = "09:00";
      if (!record[prefix + "End"]) record[prefix + "End"] = "09:30";
      if (!record[prefix + "Instructor"]) record[prefix + "Instructor"] = "サンプル講師";
      artifactWriteTrainingModule_(sheet, index + 1, prefix, record, 12, 15, 17);
    });
    if (requiresPractical) {
      sheet.getRange("A21").setValue(artifactSheetText_("場所（" + record.practicalVenue + "）実地講習"));
      ["practicalExercise1", "practicalDiscussion"].forEach(function(prefix, index) {
        record[prefix + "Date"] = record[prefix + "Date"] || record.courseDate;
        record[prefix + "Start"] = record[prefix + "Start"] || "13:00";
        record[prefix + "End"] = record[prefix + "End"] || "13:30";
        record[prefix + "Instructor"] = record[prefix + "Instructor"] || "サンプル講師";
        artifactWriteTrainingModule_(sheet, index + 1, prefix, record, 26, 29, 31);
      });
    } else {
      sheet.getRange("A21").setValue(artifactSheetText_("実地講習：対象外（サンプル）"));
    }
    try { sheet.setHiddenGridlines(true); } catch (ignoredGrid) {}
    SpreadsheetApp.flush();
    if (sheet.getRange("A1").getDisplayValue().indexOf("サンプル・正式使用禁止") < 0) {
      throw new Error("講習記録簿サンプルの警告表示を確認できません。");
    }
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "COPY", sourceId, fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind], folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
}

function complianceCreateSampleLedger_(context, folder, fileName) {
  var kind = "ledger";
  var label = complianceResultLabel_(kind, true);
  var mimeType = complianceOutputMimeType_(kind, context);
  var record = complianceSampleRecord_(context);
  var headers = RENEWAL_ARTIFACT.LEDGER_OUTPUT_HEADERS.slice();
  var row = artifactLedgerOutputFields_(record);
  row[3] = artifactSlashDate_(row[3]);
  row[5] = artifactSlashDate_(row[5]);
  row[6] = artifactSlashDate_(row[6]);
  row[7] = "【サンプル・正式使用禁止】正式台帳・採番・監査履歴には登録されません。";
  var csv = "\uFEFF" +
    artifactCsvRow_(["【サンプル・正式使用禁止】別添13　無人航空機更新講習修了証明書発行台帳"]) +
    "\r\n" + artifactCsvRow_(headers) + "\r\n" + artifactCsvRow_(row) + "\r\n";
  var file = artifactCreateDriveItemInFolder_(
    fileName,
    mimeType,
    folder,
    label,
    context.settings.allowedOutputEmails,
    false,
    null
  );
  try {
    artifactUpdateBlobFileContent_(
      file,
      fileName,
      mimeType,
      Utilities.newBlob(csv, mimeType, fileName),
      folder,
      label
    );
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "CREATE", "", fileName, mimeType, folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
}

function complianceCreateSampleCertificate_(context, folder, fileName) {
  var kind = "certificate";
  var label = complianceResultLabel_(kind, true);
  var sourceId = artifactTemplateId_(kind, context.settings);
  artifactAssertCertificateTemplateClean_(sourceId);
  var file = artifactCopyFileInFolder_(
    sourceId, fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind],
    folder, label, context.settings.allowedOutputEmails, false
  );
  try {
    var record = complianceSampleRecord_(context);
    var doc = DocumentApp.openById(file.getId());
    var tab = artifactGetDocumentTab_(doc, RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID);
    var body = tab.asDocumentTab().getBody();
    body.insertParagraph(0, "【サンプル・正式使用禁止】")
      .editAsText().setBold(true).setForegroundColor("#c62828");
    artifactReplaceRequiredText_(
      body, "第[ 　\\t]*UC0157[ 　\\t]*号",
      "第　" + record.certificateNo + "　号", "修了証明書番号"
    );
    artifactReplaceRequiredText_(
      body, "2000年[ 　\\t]*1月[ 　\\t]*1日[ 　\\t]*修了",
      artifactFormatJapaneseLongDate_(record.courseDate) + "　修了", "講習修了日"
    );
    artifactReplaceRequiredText_(
      body, "2000年[ 　\\t]*4月[ 　\\t]*1日[ 　\\t]*まで有効",
      artifactFormatJapaneseLongDate_(record.certificateExpiry) + "　まで有効", "有効期限"
    );
    artifactReplaceRequiredText_(body, "^[ 　\\t]*殿$", record.targetName + "　殿", "受講者氏名");
    artifactReplaceRequiredText_(
      body, "技能証明申請者番号：[ 　\\t]*0000000000",
      "技能証明申請者番号：0000000000（サンプル）", "技能証明申請者番号"
    );
    artifactReplaceRequiredText_(
      body, RENEWAL_ARTIFACT_DOC_TEXT_BLOCK_PATTERNS.certificateInstructor,
      "担当講師：" + record.certificateInstructor + "（サンプル）", "担当講師"
    );
    artifactReplaceRequiredText_(
      body, RENEWAL_ARTIFACT_DOC_TEXT_BLOCK_PATTERNS.certificateIssuer,
      "登録更新講習機関名 サンプル登録更新講習機関（正式使用禁止）", "登録更新講習機関名"
    );
    artifactReplaceRequiredText_(
      body, RENEWAL_ARTIFACT_DOC_TEXT_BLOCK_PATTERNS.organizationCode,
      "登録更新講習機関コード：SAMPLE", "登録更新講習機関コード"
    );
    var matches = [];
    body.getTables().forEach(function(table) {
      try {
        matches.push({
          table: table,
          selection: artifactCertificateTableSelection_(
            artifactDocTableMatrix_(table), artifactOperationalAircraftType_(record), record.licenseClass
          )
        });
      } catch (ignoredTable) {}
    });
    if (matches.length !== 1) throw new Error("修了証明書原本の区分表を一意に確認できません。");
    matches[0].selection.allCells.forEach(function(position) {
      artifactSetDocCellText_(
        matches[0].table.getRow(position.row).getCell(position.column), ""
      );
    });
    artifactSetDocCellText_(
      matches[0].table.getRow(matches[0].selection.row).getCell(matches[0].selection.column), "〇"
    );
    doc.saveAndClose();
    var verify = DocumentApp.openById(file.getId());
    var text = artifactGetDocumentTab_(
      verify, RENEWAL_ARTIFACT.CERTIFICATE_BASE_TAB_ID
    ).asDocumentTab().getBody().getText();
    verify.saveAndClose();
    if (
      text.indexOf("サンプル・正式使用禁止") < 0 ||
      text.indexOf(record.certificateNo) < 0 ||
      text.indexOf(record.targetName) < 0
    ) throw new Error("修了証明書サンプルの作成後読戻し検証に失敗しました。");
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "COPY", sourceId, fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind], folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
}

function complianceCreateSampleDipsCsv_(context, folder, fileName) {
  var kind = "dipsCsv";
  var label = complianceResultLabel_(kind, true);
  var record = complianceSampleRecord_(context);
  var headers = [
    "申請者ID", "技能証明申請者番号", "登録更新講習機関コード",
    "登録更新講習機関事務所コード", "区分", "停止処分者向け講習受講有無",
    "無人航空機操縦者身体適性検査証明書番号", "更新講習修了証明書番号",
    "更新講習修了日", "有効期間満了日", "状態フラグ"
  ];
  var row = [
    "SAMPLE1", "0000000000", "SAMPLE", "SAMPLE",
    String(artifactClassValue_(record.licenseClass)),
    artifactText_(record.suspensionCourse) === "あり" ? "2" : "1",
    "SAMPLE-PA", record.certificateNo, artifactSlashDate_(record.courseDate),
    artifactSlashDate_(record.certificateExpiry), "1"
  ];
  var csv = "\uFEFF" + artifactCsvRow_(headers) + "\r\n" + artifactCsvRow_(row) + "\r\n";
  var file = artifactCreateDriveItemInFolder_(
    fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind],
    folder, label, context.settings.allowedOutputEmails, false, null
  );
  try {
    artifactUpdateBlobFileContent_(
      file, fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind],
      Utilities.newBlob(csv, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind], fileName),
      folder, label
    );
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "CREATE", "", fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind], folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
}

function complianceCreateSamplePaymentRecord_(context, folder, fileName) {
  var kind = "paymentRecord";
  var label = complianceResultLabel_(kind, true);
  var created = artifactCreateSpreadsheetInFolder_(
    fileName, folder, label, context.settings.allowedOutputEmails, false
  );
  var file = created.file;
  try {
    var record = complianceSampleRecord_(context);
    var billing = artifactCalculateBilling_(record);
    var paid = Math.max(0, Number(record.paidAmount || 0));
    var sheet = created.spreadsheet.getSheets()[0];
    created.spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
    sheet.setName("収納記録（サンプル）");
    sheet.setTabColor("#b91c1c");
    sheet.getRange("A1:H1").merge().setValue(
      "【サンプル・正式使用禁止】講習料金収納記録"
    ).setBackground("#fee2e2").setFontColor("#991b1b").setFontWeight("bold");
    sheet.getRange("A3:H3").setValues([[
      "対象者", "請求書番号", "請求日", "税抜額", "消費税", "税込額", "入金日", "入金額"
    ]]).setBackground("#dbeafe").setFontWeight("bold");
    sheet.getRange("A4:H4").setValues([[
      record.targetName,
      artifactText_(record.invoiceNo) || "SAMPLE-INV-001",
      artifactText_(record.invoiceDate) || record.courseDate,
      billing.netExTax,
      billing.tax,
      billing.total,
      artifactText_(record.paymentDate) || record.courseDate,
      paid || billing.total
    ]]);
    sheet.getRange("D4:F4").setNumberFormat("¥#,##0");
    sheet.getRange("H4").setNumberFormat("¥#,##0");
    sheet.getRange("A6:H6").merge().setValue(
      "正式会計台帳・請求・入金・消込には登録していません。入力・出力確認専用です。"
    ).setFontColor("#991b1b");
    sheet.setFrozenRows(3);
    sheet.autoResizeColumns(1, 8);
    SpreadsheetApp.flush();
    if (sheet.getRange("A1").getDisplayValue().indexOf("サンプル・正式使用禁止") < 0) {
      throw new Error("収納記録サンプルの警告表示を確認できません。");
    }
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "CREATE", "", fileName, RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES[kind], folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
}

function complianceCreateSamplePlan_(context, folder, fileName) {
  var mimeType = RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES.implementationPlan;
  var label = complianceResultLabel_("implementationPlan", true);
  var file = null;
  try {
    var parts = context.planMonth.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var lastDay = new Date(year, month, 0).getDate();
    var weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
    var days = [];
    var weekdays = [];
    for (var day = 1; day <= 31; day++) {
      days.push(day <= lastDay ? day : "");
      weekdays.push(day <= lastDay ? weekdayLabels[new Date(year, month - 1, day).getDay()] : "");
    }

    // サンプルも別添04の実用レイアウトを確認できるよう、公開参照元の
    // 「ベース」だけを新規ファイルへ複製する。正式用の専用原本や台帳は変更しない。
    var source = SpreadsheetApp.openById(RENEWAL_COMPLIANCE_ARCHIVE.PLAN_SOURCE_ID);
    var base = source.getSheetByName("ベース");
    if (!base) throw new Error("別添04参照元に「ベース」シートがありません。");
    var sourceHeadings = base.getRange("A1:D8").getDisplayValues();
    if (
      artifactText_(sourceHeadings[0][0]) !== "講習区分" ||
      artifactText_(sourceHeadings[0][1]).replace(/\s+/g, "") !== "開始(人)" ||
      artifactText_(sourceHeadings[0][2]).replace(/\s+/g, "") !== "修了(人)" ||
      artifactText_(sourceHeadings[3][0]).indexOf("二等無人航空機操縦士") < 0 ||
      artifactText_(sourceHeadings[4][0]).indexOf("一等無人航空機操縦士") < 0
    ) {
      throw new Error("別添04参照元の固定見出しが一致しません。");
    }

    var created = artifactCreateSpreadsheetInFolder_(
      fileName, folder, label, context.settings.allowedOutputEmails, false
    );
    file = created.file;
    var spreadsheet = created.spreadsheet;
    spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
    var sheet = base.copyTo(spreadsheet).setName(
      year + "年" + month + "月（サンプル）"
    );
    spreadsheet.getSheets().forEach(function(candidate) {
      if (candidate.getSheetId() !== sheet.getSheetId()) spreadsheet.deleteSheet(candidate);
    });

    sheet.getRange("D1")
      .setValue("【サンプル・正式使用禁止】登録更新講習機関実施計画書　" + month + "月")
      .setNote(
        "入力・出力確認用です。国土交通省等への提出、正式保管、実績集計には使用できません。" +
        " 作成元：" + artifactRecordName_(context.sampleRecord) + " / " +
        artifactText_(context.sampleRecord.personId)
      )
      .setFontColor("#991b1b")
      .setFontWeight("bold");
    sheet.getRange(2, 4, 1, 31).setValues([days]);
    sheet.getRange(3, 4, 1, 31).setValues([weekdays]);
    sheet.getRange("B4:C5").setValues([
      [context.counts.secondStart, context.counts.secondFinish],
      [context.counts.firstStart, context.counts.firstFinish]
    ]);
    sheet.setTabColor("#b91c1c");
    SpreadsheetApp.flush();
    if (
      spreadsheet.getSheets().length !== 1 ||
      sheet.getRange("D1").getDisplayValue().indexOf("サンプル・正式使用禁止") < 0 ||
      Number(sheet.getRange("B4").getValue()) !== context.counts.secondStart ||
      Number(sheet.getRange("C4").getValue()) !== context.counts.secondFinish ||
      Number(sheet.getRange("B5").getValue()) !== context.counts.firstStart ||
      Number(sheet.getRange("C5").getValue()) !== context.counts.firstFinish ||
      artifactText_(sheet.getRange("D3").getDisplayValue()) !== weekdays[0]
    ) {
      throw new Error("別添04サンプルの作成後読戻し検証に失敗しました。");
    }
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "CREATE", "", fileName, mimeType, folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
}

function complianceCreateSampleStatus_(context, folder, fileName) {
  var mimeType = RENEWAL_COMPLIANCE_ARCHIVE.MIME_TYPES.implementationStatus;
  var label = complianceResultLabel_("implementationStatus", true);
  var file = artifactCreateDriveItemInFolder_(
    fileName,
    mimeType,
    folder,
    label,
    context.settings.allowedOutputEmails,
    false,
    null
  );
  try {
    var doc = DocumentApp.openById(file.getId());
    var body = doc.getBody();
    body.clear();
    body.appendParagraph("【サンプル・正式使用禁止】")
      .editAsText()
      .setBold(true)
      .setFontSize(16)
      .setForegroundColor("#b91c1c");
    body.appendParagraph("別添05 登録更新講習機関実施状況報告書（入力・出力確認用）")
      .editAsText()
      .setBold(true)
      .setFontSize(14);
    body.appendParagraph(
      "国土交通省等への提出、正式保管、実績集計には使用できません。"
    ).editAsText().setForegroundColor("#991b1b");
    var rows = [
      ["項目", "サンプル出力内容"],
      ["報告日", context.reportDate],
      ["対象期間", context.reportStartDate + " ～ " + context.reportEndDate],
      ["一等・修了人数", context.statusSummary.first.count + "人"],
      ["一等・実施場所", context.statusSummary.first.venues.join("、") || "該当なし"],
      ["二等・修了人数", context.statusSummary.second.count + "人"],
      ["二等・実施場所", context.statusSummary.second.venues.join("、") || "該当なし"],
      ["作成元", artifactRecordName_(context.sampleRecord) + " / " +
        artifactText_(context.sampleRecord.personId)]
    ];
    var table = body.appendTable(rows);
    table.getRow(0).getCell(0).setBackgroundColor("#dbeafe");
    table.getRow(0).getCell(1).setBackgroundColor("#dbeafe");
    table.getRow(0).getCell(0).editAsText().setBold(true);
    table.getRow(0).getCell(1).editAsText().setBold(true);
    doc.saveAndClose();
    var verifyDoc = DocumentApp.openById(file.getId());
    var verifyText = verifyDoc.getBody().getText();
    verifyDoc.saveAndClose();
    if (
      verifyText.indexOf("サンプル・正式使用禁止") < 0 ||
      verifyText.indexOf(context.reportStartDate) < 0 ||
      verifyText.indexOf(context.reportEndDate) < 0
    ) {
      throw new Error("別添05サンプルの作成後読戻し検証に失敗しました。");
    }
    return {
      file: file,
      driveOperation: artifactDriveAttemptOperation_(
        "CREATE", "", fileName, mimeType, folder.getId()
      )
    };
  } catch (error) {
    artifactThrowAfterCleanup_(error, file, label, "file");
  }
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
    sheet.getRange("D1").setValue(
      (context.sampleMode ? "【サンプル・正式使用禁止】" : "") +
      "登録更新講習機関実施計画書　" + month + "月"
    );
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
    if (context.sampleMode) {
      body.insertParagraph(0, "【サンプル・正式使用禁止】")
        .editAsText()
        .setBold(true)
        .setForegroundColor("#c62828");
    }
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
    sheet.getRange("A1:H1").merge().setValue(
      (context.sampleMode ? "【サンプル・正式使用禁止】" : "") +
      "申込書・技能証明書・身分証　保管チェックリスト"
    );
    sheet.getRange("A2:H4").setValues([
      ["recordId", context.record.recordId, "管理ID", artifactText_(context.record.personId), "対象者", artifactRecordName_(context.record), "正本版", Number(context.canonical.version)],
      ["保存先", folder.getUrl(), "", "", "", "", "", ""],
      [
        "注意",
        context.sampleMode
          ? "入力・出力確認専用です。実物書類のアップロードや正式確認には使用できません。"
          : "実物書類は自動生成しません。対象者フォルダへ原本をアップロードし、下表へリンクと確認記録を入力してください。",
        "", "", "", "", "", ""
      ]
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
  return complianceEnsureManagedFolder_(autoRoot, allowedOutputEmails, {
    name: RENEWAL_COMPLIANCE_ARCHIVE.ARCHIVE_FOLDER_NAME,
    propertyPrefix: RENEWAL_COMPLIANCE_ARCHIVE.ARCHIVE_FOLDER_PROPERTY_PREFIX,
    format: "CDP_RENEWAL_COMPLIANCE_ARCHIVE_FOLDER_V1",
    label: "監査保管フォルダ"
  });
}

function complianceEnsureSampleFolder_(autoRoot, allowedOutputEmails) {
  return complianceEnsureManagedFolder_(autoRoot, allowedOutputEmails, {
    name: RENEWAL_COMPLIANCE_ARCHIVE.SAMPLE_FOLDER_NAME,
    propertyPrefix: RENEWAL_COMPLIANCE_ARCHIVE.SAMPLE_FOLDER_PROPERTY_PREFIX,
    format: "CDP_RENEWAL_COMPLIANCE_SAMPLE_FOLDER_V1",
    label: "サンプル出力フォルダ"
  });
}

function complianceEnsureManagedFolder_(autoRoot, allowedOutputEmails, options) {
  var parentId = autoRoot.getId();
  var name = artifactText_(options && options.name);
  var label = artifactText_(options && options.label) || "管理フォルダ";
  var propertyPrefix = artifactText_(options && options.propertyPrefix);
  var format = artifactText_(options && options.format);
  if (!name || !propertyPrefix || !format) throw new Error("管理フォルダ設定が不足しています。");
  var key = propertyPrefix + artifactShortKey_(parentId);
  var props = PropertiesService.getScriptProperties();
  var identity = JSON.stringify({
    format: format,
    parentId: parentId
  });
  var matches = artifactIteratorItems_(autoRoot.getFoldersByName(name), 2);
  if (matches.length > 1) throw new Error("同名の" + label + "が複数あります。重複を監査してください。");
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
        throw new Error("保存済み" + label + "のIDとDrive上の所定フォルダが一致しません。");
      }
    } else if (matches.length === 1) {
      folder = matches[0];
      if (artifactText_(folder.getDescription()) !== identity) {
        throw new Error("識別情報のない手作業の" + label + "は自動採用しません。");
      }
    } else {
      folder = artifactCreateFolderInFolder_(name, autoRoot, label, allowedOutputEmails, false);
      createdNow = true;
      folder.setDescription(identity);
    }
    artifactAssertReusableDriveItem_(folder, parentId, label, allowedOutputEmails);
    if (artifactText_(folder.getDescription()) !== identity) {
      throw new Error(label + "の識別情報が一致しません。");
    }
    props.setProperty(key, folder.getId());
    if (artifactText_(props.getProperty(key)) !== folder.getId()) {
      throw new Error(label + "IDを保存・読戻しできません。");
    }
    published = true;
    artifactClearPublishedDriveAttempt_(
      operation,
      folder.getId(),
      label
    );
    return folder;
  } catch (error) {
    if (createdNow && folder && !published) {
      artifactPermanentlyDeleteNewDriveItem_(
        folder, "作成途中の" + label, "folder", error
      );
      try { props.deleteProperty(key); } catch (ignoredPropertyCleanupError) {}
    }
    throw error;
  }
}

function complianceEnsureServerAudit_(input) {
  var spreadsheet = storeOpen_();
  var sampleAudit = artifactText_(input.action).indexOf("COMPLIANCE_SAMPLE_") === 0;
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
        entityType: sampleAudit ? "compliance_sample" : "compliance_archive",
        entityKey: input.scopeKey,
        action: input.action,
        actor: input.actor,
        reasonCode: sampleAudit ? "COMPLIANCE_SAMPLE" : "COMPLIANCE_ARCHIVE",
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
    artifactText_(values[0][1]).replace(/\s+/g, "") !== "開始(人)" ||
    artifactText_(values[0][2]).replace(/\s+/g, "") !== "修了(人)" ||
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
