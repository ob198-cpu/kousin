// @ts-nocheck
// 対象者1名につき1つのGoogleスプレッドシートを維持し、
// 各資料を固定名の別シートとして同じファイル内で再生成する。

var RENEWAL_PERSON_WORKBOOK = {
  FORMAT: "CDP_RENEWAL_PERSON_WORKBOOK_V1",
  GENERATOR_VERSION: 1,
  LAYOUT_VERSION: "OFFICIAL_FORMS_V2",
  PROPERTY_PREFIX: "RENEWAL_PERSON_WORKBOOK_",
  SYSTEM_SHEET_NAME: "__SYSTEM",
  SHEETS: [
    { key: "overview", name: "00_概要" },
    { key: "training", name: "01_別添03_講習記録簿" },
    { key: "plan", name: "02_別添04_実施計画書" },
    { key: "status", name: "03_別添05_実施状況報告書" },
    { key: "ledger", name: "04_別添13_発行台帳" },
    { key: "evidence", name: "05_申込・証憑保管" },
    { key: "certificate", name: "06_修了証明書" },
    { key: "dips", name: "07_DIPS CSV" },
    { key: "payment", name: "08_講習料金収納記録" }
  ]
};

function apiPreflightPersonWorkbook(request) {
  try {
    var authorization = artifactRequireCapability_("artifacts.admin");
    var canonicalRequest = artifactLoadCanonicalArtifactRequest_(
      personWorkbookCanonicalRequest_(request)
    );
    var settings = artifactLoadSettings_();
    personWorkbookAssertAdminOnlyAcl_(authorization.email);
    var record = artifactNormalizeRecord_(canonicalRequest.request.record);
    var sampleMode = typeof complianceIsSyntheticSampleRecord_ === "function" &&
      complianceIsSyntheticSampleRecord_(record);
    if (!sampleMode) complianceRequireTemplatesReady_();
    var fiscalYear = artifactText_(record.fiscalYear);
    artifactOutputFolderForFiscalYear_(settings, fiscalYear);
    if (!artifactRecordName_(record)) {
      throw new Error("対象者名がありません。登録・編集で氏名を保存してから作成してください。");
    }
    var warnings = [
      "未入力項目は空欄で作成します。共有正本の値を推測・補完しません。",
      "同じ対象者はrecordIdで判定し、同じGoogleスプレッドシートの固定シートを更新します。",
      "従来の個別成果物は監査履歴として残し、自動移動・自動削除しません。",
      "別添03・04・13は、承認済みの専用原本レイアウトを複製し、必要なセルだけを更新します。",
      "発行台帳・別添04・別添05・修了証明書の専用原本は、固定した本文版との一致を、書込み前に再検査します。"
    ];
    var financeState = personWorkbookFinanceSnapshot_(record.recordId, true);
    if (sampleMode) {
      warnings.push(
        "合成サンプルは正式データと分離した「サンプル出力」配下へ保存し、別添04・05は固定した公開参照元を使います。"
      );
    }
    if (!financeState) {
      warnings.push("正式会計台帳が未設定のため、講習料金収納記録は見出しと空欄だけを作成します。");
    } else if (!financeState.invoices.length && !financeState.payments.length) {
      warnings.push("対象者の正式請求・入金がないため、講習料金収納記録の明細は空欄です。");
    }
    return {
      success: true,
      ready: true,
      label: "対象者資料一式",
      summary: {
        targetName: artifactRecordName_(record),
        managementId: artifactText_(record.personId),
        fiscalYear: fiscalYear,
        sheetCount: RENEWAL_PERSON_WORKBOOK.SHEETS.length
      },
      warnings: warnings,
      message: "1つのファイル内に9種類の資料シートを作成・更新できます。"
    };
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return {
      success: false,
      ready: false,
      label: "対象者資料一式",
      errors: [message],
      error: message,
      message: message
    };
  }
}

function apiCreateOrUpdatePersonWorkbook(request) {
  request = request || {};
  var batchMode = request.__personWorkbookBatch === true;
  var batchIndex = Number(request.batchIndex);
  if (
    batchMode &&
    (!isFinite(batchIndex) || Math.floor(batchIndex) !== batchIndex ||
      batchIndex < 0 || batchIndex > 8)
  ) {
    return personWorkbookErrorResult_(
      new Error("対象者資料ブックの作成段階が正しくありません。")
    );
  }
  var authorization;
  var canonicalRequest;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
    canonicalRequest = artifactLoadCanonicalArtifactRequest_(
      personWorkbookCanonicalRequest_(request)
    );
  } catch (authorizationError) {
    return personWorkbookErrorResult_(authorizationError);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return personWorkbookErrorResult_(
      new Error("別の成果物作成が実行中です。しばらく待って再実行してください。")
    );
  }
  var resolved = null;
  var updateCompleted = false;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
    artifactAssertNoUnresolvedCleanupFailures_();
    canonicalRequest = artifactLoadCanonicalArtifactRequest_(
      personWorkbookCanonicalRequest_(request)
    );
    var settings = artifactLoadSettings_();
    var allowedEmails = personWorkbookAssertAdminOnlyAcl_(authorization.email);
    settings.allowedOutputEmails = allowedEmails;
    var record = artifactNormalizeRecord_(canonicalRequest.request.record);
    record.id = canonicalRequest.canonical.recordId;
    record.recordId = canonicalRequest.canonical.recordId;
    var sampleMode = typeof complianceIsSyntheticSampleRecord_ === "function" &&
      complianceIsSyntheticSampleRecord_(record);
    if (!artifactRecordName_(record)) {
      throw new Error("対象者名がありません。登録・編集で氏名を保存してから作成してください。");
    }
    var fiscalYear = artifactText_(record.fiscalYear);
    var outputFolderId = artifactOutputFolderForFiscalYear_(settings, fiscalYear);
    artifactRequireSafeOutputFolder_(
      outputFolderId,
      [settings.ledgerTemplateId, settings.certificateTemplateId],
      allowedEmails,
      fiscalYear
    );
    settings = artifactClone_(settings);
    settings.outputFolderId = outputFolderId;
    var complianceTemplates = sampleMode
      ? {
        planTemplateId: RENEWAL_COMPLIANCE_ARCHIVE.PLAN_SOURCE_ID,
        statusTemplateId: RENEWAL_COMPLIANCE_ARCHIVE.STATUS_SOURCE_ID,
        templateFolderId: ""
      }
      : complianceRequireTemplatesReady_();
    var autoRoot = artifactEnsureAutoRoot_(outputFolderId, allowedEmails);
    var workbookRoot = sampleMode
      ? complianceEnsureSampleFolder_(autoRoot, allowedEmails)
      : autoRoot;
    var recordFolder = artifactEnsureRecordFolder_(
      workbookRoot, record, allowedEmails
    );
    var finance = personWorkbookFinanceSnapshot_(record.recordId, true);
    var context = {
      authorization: authorization,
      canonical: canonicalRequest.canonical,
      record: record,
      settings: settings,
      complianceTemplates: complianceTemplates,
      finance: finance,
      sampleMode: sampleMode,
      autoRoot: workbookRoot,
      recordFolder: recordFolder,
      contentHash: personWorkbookContentHash_(
        canonicalRequest.canonical, settings, finance, complianceTemplates
      )
    };
    resolved = personWorkbookResolve_(context);
    var updateResult = batchMode
      ? personWorkbookUpdate_(resolved, context, {
        specs: personWorkbookBatchSpecs_(batchIndex),
        finalize: batchIndex === 8,
        batchIndex: batchIndex
      })
      : personWorkbookUpdate_(resolved, context);
    updateCompleted = true;
    resolved.file.setName(personWorkbookFileName_(record));
    if (resolved.file.getName() !== personWorkbookFileName_(record)) {
      throw new Error("対象者資料ブックのファイル名を保存・読戻しできません。");
    }
    personWorkbookPublishProperty_(resolved.file, context);
    artifactAssertReusableDriveItem_(
      resolved.file,
      recordFolder.getId(),
      "対象者資料ブック",
      allowedEmails
    );
    if (batchMode && updateResult.complete !== true) {
      return {
        success: true,
        ready: true,
        inProgress: true,
        complete: false,
        batchIndex: batchIndex,
        nextBatchIndex: batchIndex + 1,
        completedSheetCount: personWorkbookCompletedSheetCount_(batchIndex),
        label: "対象者資料一式",
        status: resolved.created ? "created" : "updated",
        fileId: resolved.file.getId(),
        url: resolved.file.getUrl(),
        fileUrl: resolved.file.getUrl(),
        fileName: resolved.file.getName(),
        warnings: updateResult.cleanupWarnings || [],
        message:
          "全9シートのうち" +
          personWorkbookCompletedSheetCount_(batchIndex) +
          "シートまで安全に更新しました。続けて残りを更新します。"
      };
    }
    var auditWarning = "";
    try {
      complianceEnsureServerAudit_({
        actor: authorization.email,
        scopeKey: "person-workbook:" + record.recordId,
        kind: "personWorkbook",
        hash: context.contentHash,
        fileId: resolved.file.getId(),
        action: context.sampleMode
          ? (resolved.created
            ? "COMPLIANCE_SAMPLE_PERSON_WORKBOOK_CREATE"
            : "COMPLIANCE_SAMPLE_PERSON_WORKBOOK_UPDATE")
          : (resolved.created
            ? "PERSON_WORKBOOK_CREATE"
            : "PERSON_WORKBOOK_UPDATE")
      });
    } catch (auditError) {
      auditWarning =
        "サーバー監査の確定を確認できません。ファイルは更新済みのため、再実行前に管理者が監査ログを確認してください。";
    }
    var responseWarnings = [];
    if (auditWarning) responseWarnings.push(auditWarning);
    if (updateResult.cleanupWarnings && updateResult.cleanupWarnings.length) {
      responseWarnings.push(
        "更新前の退避シートを一部削除できなかったため、非表示のまま残しました。" +
        "新しい固定シートの更新は完了しています。管理者が非表示シートを確認してください。"
      );
    }
    return {
      success: !auditWarning,
      ready: true,
      status: resolved.created ? "created" : "updated",
      preservationRequired: !!auditWarning,
      fileId: resolved.file.getId(),
      url: resolved.file.getUrl(),
      fileUrl: resolved.file.getUrl(),
      fileName: resolved.file.getName(),
      sheetNames: RENEWAL_PERSON_WORKBOOK.SHEETS.map(function(row) {
        return row.name;
      }),
      updatedAt: updateResult.updatedAt,
      complete: true,
      warnings: responseWarnings,
      message: auditWarning || (
        resolved.created
          ? "対象者資料ブックを作成し、9種類の資料を別シートへ保存しました。"
          : "既存の対象者資料ブックを同じファイルIDのまま上書き更新しました。"
      )
    };
  } catch (error) {
    if (resolved && resolved.created && resolved.file && !updateCompleted) {
      try {
        artifactPermanentlyDeleteNewDriveItem_(
          resolved.file, "作成途中の対象者資料ブック", "file", error
        );
      } catch (cleanupError) {
        error.artifactProvisional = {
          itemType: "file",
          label: "作成途中の対象者資料ブック",
          fileId: resolved.file.getId(),
          url: resolved.file.getUrl(),
          fileName: resolved.file.getName(),
          cleanupFailed: true
        };
      }
    }
    return personWorkbookErrorResult_(error, resolved && resolved.file, updateCompleted);
  } finally {
    lock.releaseLock();
  }
}

function apiCreateOrUpdatePersonWorkbookBatch(request) {
  var input = artifactClone_(request || {});
  input.__personWorkbookBatch = true;
  return apiCreateOrUpdatePersonWorkbook(input);
}

function personWorkbookBatchSpecs_(batchIndex) {
  var boundaries = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var index = Number(batchIndex);
  var start = index === 0 ? 0 : boundaries[index - 1];
  return RENEWAL_PERSON_WORKBOOK.SHEETS.slice(start, boundaries[index]);
}

function personWorkbookCompletedSheetCount_(batchIndex) {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9][Number(batchIndex)] || 0;
}

function personWorkbookCanonicalRequest_(request) {
  request = request || {};
  return {
    recordId: artifactText_(request.recordId),
    expectedVersion: Number(request.expectedVersion),
    expectedPayloadHash: artifactText_(request.expectedPayloadHash),
    kinds: []
  };
}

function personWorkbookErrorResult_(error, file, updateCompleted) {
  var message = artifactErrorMessage_(error);
  var provisional = error && error.artifactProvisional;
  return {
    success: false,
    ready: false,
    preservationRequired: updateCompleted === true || !!provisional,
    error: message,
    errors: [message],
    message: message,
    fileId: file ? file.getId() : artifactText_(provisional && provisional.fileId),
    url: file ? file.getUrl() : artifactText_(provisional && provisional.url),
    fileUrl: file ? file.getUrl() : artifactText_(provisional && provisional.url)
  };
}

/**
 * 同じブックに会計シートを入れる場合、シート単位で閲覧権限を分けられない。
 * 現在のPersonalSingleUser運用（有効利用者が管理者だけ）に限定する。
 */
function personWorkbookAssertAdminOnlyAcl_(actorEmail) {
  if (
    typeof storeOpen_ !== "function" ||
    typeof storeReadRoles_ !== "function" ||
    typeof storeReadMetaMap_ !== "function"
  ) {
    throw new Error("統合資料ブックの利用者権限を確認できません。");
  }
  var spreadsheet = storeOpen_();
  var rows = storeReadRoles_(spreadsheet);
  var meta = storeReadMetaMap_(spreadsheet);
  var adminEmails = {};
  var createdBy = artifactText_(meta.createdBy).toLowerCase();
  if (createdBy) adminEmails[createdBy] = true;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    if (row.active === false) continue;
    var email = artifactText_(row.email).toLowerCase();
    if (artifactText_(row.role) !== "admin") {
      throw new Error(
        "会計情報を含む同一ブックは、管理者以外の有効利用者がいる環境では作成できません。" +
        "Google Sheetsはシート別の閲覧権限を設定できないため、権限設計を分離してください。"
      );
    }
    if (email) adminEmails[email] = true;
  }
  var allowed = artifactResolveOutputAccessEmails_();
  for (var allowedIndex = 0; allowedIndex < allowed.length; allowedIndex++) {
    if (!adminEmails[allowed[allowedIndex]]) {
      throw new Error(
        "成果物保存先へアクセスできる利用者に管理者以外が含まれています。" +
        "会計情報を同じブックへ保存できません。"
      );
    }
  }
  var actor = artifactText_(actorEmail).toLowerCase();
  if (!actor || !adminEmails[actor]) {
    throw new Error("統合資料ブックは管理者本人だけが作成・更新できます。");
  }
  return allowed;
}

function personWorkbookFinanceSnapshot_(recordId, allowUnconfigured) {
  if (typeof financeStoreGetState_ !== "function") {
    if (allowUnconfigured) return null;
    throw new Error("正式会計台帳を読み込めません。");
  }
  var envelope;
  try {
    envelope = financeStoreGetState_();
  } catch (financeReadError) {
    if (
      allowUnconfigured &&
      artifactText_(financeReadError && financeReadError.code) ===
        "FINANCE_NOT_CONFIGURED"
    ) {
      return null;
    }
    throw financeReadError;
  }
  if (!envelope || envelope.configured !== true || !envelope.state) {
    if (allowUnconfigured) return null;
    throw new Error("正式会計台帳が未設定です。");
  }
  if (envelope.recoveryNeeded === true) {
    throw new Error("正式会計台帳が復旧待ちのため、資料ブックを更新できません。");
  }
  financeValidateState_(envelope.state);
  var id = artifactText_(recordId);
  var state = envelope.state;
  return {
    revision: Number(envelope.revision || state.revision || 0),
    stateHash: artifactText_(envelope.stateHash),
    state: state,
    invoices: state.invoices.filter(function(row) {
      return artifactText_(row.customerId) === id;
    }),
    payments: state.payments.filter(function(row) {
      return artifactText_(row.customerId) === id;
    }),
    allocations: state.payment_allocations.filter(function(row) {
      return artifactText_(row.customerId) === id;
    }),
    credits: state.credit_notes.filter(function(row) {
      return artifactText_(row.customerId) === id;
    }),
    position: financeCustomerPosition_(state, id)
  };
}

function personWorkbookContentHash_(
  canonical, settings, finance, complianceTemplates
) {
  return artifactHashHex_({
    format: RENEWAL_PERSON_WORKBOOK.FORMAT,
    generatorVersion: RENEWAL_PERSON_WORKBOOK.GENERATOR_VERSION,
    layoutVersion: RENEWAL_PERSON_WORKBOOK.LAYOUT_VERSION,
    recordId: artifactText_(canonical && canonical.recordId),
    recordVersion: Number(canonical && canonical.version),
    recordPayloadHash: artifactText_(canonical && canonical.payloadHash),
    financeRevision: finance ? Number(finance.revision) : 0,
    financeStateHash: finance ? artifactText_(finance.stateHash) : "",
    templates: {
      training: RENEWAL_ARTIFACT.TEMPLATE_IDS.training,
      plan: artifactText_(complianceTemplates && complianceTemplates.planTemplateId),
      status: artifactText_(complianceTemplates && complianceTemplates.statusTemplateId),
      ledger: artifactText_(settings.ledgerTemplateId),
      certificate: artifactText_(settings.certificateTemplateId)
    },
    issuer: {
      company: artifactText_(settings.issuerCompany),
      representative: artifactText_(settings.issuerRepresentative),
      address: artifactText_(settings.issuerAddress),
      phone: artifactText_(settings.issuerPhone),
      email: artifactText_(settings.issuerEmail)
    }
  });
}

function personWorkbookFileName_(record) {
  var samplePrefix =
    typeof complianceIsSyntheticSampleRecord_ === "function" &&
    complianceIsSyntheticSampleRecord_(record)
      ? "サンプル_正式使用禁止_"
      : "";
  return (
    samplePrefix + "更新講習_資料一式_" +
    artifactSafeName_(artifactText_(record.personId || record.recordId)) + "_" +
    artifactSafeName_(artifactRecordName_(record))
  ).slice(0, 180);
}

function personWorkbookOptionalIdentifier_(value) {
  var text = artifactText_(value);
  return /^0+$/.test(text) ? "" : text;
}

function personWorkbookIdentityDescription_(context) {
  return RENEWAL_PERSON_WORKBOOK.FORMAT + "\n" + artifactCanonicalJson_({
    recordId: context.record.recordId,
    autoRootId: context.autoRoot.getId(),
    generatorVersion: RENEWAL_PERSON_WORKBOOK.GENERATOR_VERSION
  });
}

function personWorkbookPropertyKey_(context) {
  return RENEWAL_PERSON_WORKBOOK.PROPERTY_PREFIX +
    artifactShortKey_(context.autoRoot.getId() + "|" + context.record.recordId);
}

function personWorkbookResolve_(context) {
  var props = PropertiesService.getScriptProperties();
  var key = personWorkbookPropertyKey_(context);
  var storedId = artifactExtractDriveFileId_(props.getProperty(key));
  var expectedDescription = personWorkbookIdentityDescription_(context);
  var matches = [];
  if (storedId) {
    var storedFile;
    try {
      storedFile = DriveApp.getFileById(storedId);
    } catch (storedLookupError) {
      throw new Error("登録済みの対象者資料ブックを取得できません。削除・移動・権限を確認してください。");
    }
    personWorkbookAssertFile_(storedFile, context, expectedDescription);
    return {
      created: false,
      file: storedFile,
      spreadsheet: artifactOpenSpreadsheetByIdWithRetry_(storedFile.getId())
    };
  }
  var candidates = artifactIteratorItems_(
    context.recordFolder.getFilesByType(MimeType.GOOGLE_SHEETS), 501
  );
  if (candidates.length > 500) {
    throw new Error("対象者フォルダ内のスプレッドシートが多すぎるため、統合ブックを一意に検索できません。");
  }
  for (var i = 0; i < candidates.length; i++) {
    if (artifactText_(candidates[i].getDescription()) === expectedDescription) {
      matches.push(candidates[i]);
    }
  }
  if (matches.length > 1) {
    throw new Error("同じ対象者IDの資料ブックが複数あります。重複を確認するまで上書きしません。");
  }
  if (matches.length === 1) {
    personWorkbookAssertFile_(matches[0], context, expectedDescription);
    props.setProperty(key, matches[0].getId());
    return {
      created: false,
      file: matches[0],
      spreadsheet: artifactOpenSpreadsheetByIdWithRetry_(matches[0].getId())
    };
  }
  var created = artifactCreateSpreadsheetInFolder_(
    personWorkbookFileName_(context.record),
    context.recordFolder,
    "対象者資料ブック",
    context.settings.allowedOutputEmails,
    false
  );
  created.file.setDescription(expectedDescription);
  if (artifactText_(created.file.getDescription()) !== expectedDescription) {
    artifactPermanentlyDeleteNewDriveItem_(
      created.file, "識別情報未確定の対象者資料ブック", "file",
      new Error("対象者資料ブックの識別情報を保存できません。")
    );
    throw new Error("対象者資料ブックの識別情報を保存できません。");
  }
  return {
    created: true,
    file: created.file,
    spreadsheet: created.spreadsheet
  };
}

function personWorkbookAssertFile_(file, context, expectedDescription) {
  artifactAssertReusableDriveItem_(
    file,
    context.recordFolder.getId(),
    "既存の対象者資料ブック",
    context.settings.allowedOutputEmails
  );
  var state = Drive.Files.get(file.getId(), {
    fields: "id,mimeType,trashed",
    supportsAllDrives: true
  });
  if (
    !state ||
    state.trashed === true ||
    artifactText_(state.mimeType) !== "application/vnd.google-apps.spreadsheet"
  ) {
    throw new Error("既存の対象者資料ブックのファイル種類が一致しません。");
  }
  if (artifactText_(file.getDescription()) !== expectedDescription) {
    throw new Error("既存の対象者資料ブックの対象者ID識別情報が一致しません。自動上書きしません。");
  }
}

function personWorkbookPublishProperty_(file, context) {
  var props = PropertiesService.getScriptProperties();
  var key = personWorkbookPropertyKey_(context);
  props.setProperty(key, file.getId());
  if (artifactText_(props.getProperty(key)) !== file.getId()) {
    throw new Error("対象者資料ブックの登録IDを保存・読戻しできません。");
  }
}

function personWorkbookUpdate_(resolved, context, options) {
  options = options || {};
  var renderSpecs = Array.isArray(options.specs) && options.specs.length
    ? options.specs
    : RENEWAL_PERSON_WORKBOOK.SHEETS;
  var finalize = options.finalize !== false;
  // Full-cell cleanliness was verified when the dedicated master was pinned.
  // At each output, verify that the Drive content revision is still that
  // approved revision before touching the destination workbook.
  var renderedKeys = {};
  renderSpecs.forEach(function(spec) {
    renderedKeys[spec.key] = true;
  });
  if (renderedKeys.ledger && !context.sampleMode) {
    artifactAssertDedicatedTemplatePin_(
      "ledger", context.settings.ledgerTemplateId
    );
  }
  if (renderedKeys.certificate) {
    artifactAssertDedicatedTemplatePin_(
      "certificate", context.settings.certificateTemplateId
    );
  }
  if (renderedKeys.plan) {
    if (context.sampleMode) {
      artifactAssertPinnedReferenceSource_("implementationPlanSource");
    } else {
      complianceAssertPlanTemplateClean_(
        context.complianceTemplates.planTemplateId
      );
    }
  }
  if (renderedKeys.status) {
    if (context.sampleMode) {
      artifactAssertPinnedReferenceSource_("implementationStatusSource");
    } else {
      complianceAssertStatusTemplateClean_(
        context.complianceTemplates.statusTemplateId
      );
    }
  }
  var spreadsheet = resolved.spreadsheet;
  spreadsheet.setSpreadsheetTimeZone("Asia/Tokyo");
  var systemSheet = personWorkbookEnsureSystemSheet_(
    spreadsheet, resolved.created, resolved.file, context
  );
  var sheets = spreadsheet.getSheets();
  var recoveryWarnings = [];
  for (var sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    var currentName = sheets[sheetIndex].getName();
    if (/^__準備_/.test(currentName)) {
      var quarantineName = personWorkbookQuarantineName_(
        spreadsheet, currentName
      );
      sheets[sheetIndex].setName(quarantineName);
      try { sheets[sheetIndex].hideSheet(); } catch (ignoredQuarantineHideError) {}
      recoveryWarnings.push(
        "前回中断の準備シート「" + currentName + "」は削除せず、" +
        "「" + quarantineName + "」へ改名して非表示保管しました。"
      );
    }
    if (/^__(旧|中断)_/.test(currentName)) {
      try { sheets[sheetIndex].hideSheet(); } catch (ignoredOldSheetHideError) {}
    }
  }
  var runTag = artifactShortKey_(
    context.record.recordId + "|" + context.contentHash + "|" +
    artifactNowText_() + "|" + Utilities.getUuid()
  ).slice(0, 12);
  var temporarySheetPrefix = "__準備_" + runTag + "_";
  var prepared = [];
  var backups = [];
  var renamedTargets = [];
  var systemBefore = systemSheet.getRange(1, 1, 11, 2).getValues();
  var systemWasHidden = systemSheet.isSheetHidden();
  systemSheet.showSheet();
  try {
    for (var i = 0; i < renderSpecs.length; i++) {
      var spec = renderSpecs[i];
      var tempName = temporarySheetPrefix + (i + 1);
      var preparedSheet = personWorkbookRenderPrepared_(
        spreadsheet, tempName, spec.key, context
      );
      personWorkbookFlushWithRetry_();
      if (!personWorkbookHasReadableContent_(preparedSheet)) {
        throw new Error(spec.name + "の作成後読戻しに失敗しました。");
      }
      prepared.push({
        key: spec.key,
        targetName: spec.name,
        sheet: preparedSheet
      });
    }
    for (var swapIndex = 0; swapIndex < prepared.length; swapIndex++) {
      var targetName = prepared[swapIndex].targetName;
      var oldSheet = spreadsheet.getSheetByName(targetName);
      if (oldSheet) {
        var backupName = "__旧_" + runTag + "_" + (swapIndex + 1);
        oldSheet.setName(backupName);
        backups.push({
          targetName: targetName,
          backupName: backupName,
          sheet: oldSheet
        });
      }
      prepared[swapIndex].sheet.setName(targetName);
      renamedTargets.push({
        targetName: targetName,
        sheet: prepared[swapIndex].sheet
      });
    }
    SpreadsheetApp.flush();
    for (var targetIndex = 0; targetIndex < renamedTargets.length; targetIndex++) {
      var verifiedSheet = spreadsheet.getSheetByName(
        renamedTargets[targetIndex].targetName
      );
      if (
        !verifiedSheet ||
        verifiedSheet.getSheetId() !== renamedTargets[targetIndex].sheet.getSheetId() ||
        !personWorkbookHasReadableContent_(verifiedSheet)
      ) {
        throw new Error("更新後シートの名前・内容を確認できません。");
      }
    }
    var updatedAt = artifactNowText_();
    if (finalize) {
      for (
        var orderIndex = 0;
        orderIndex < RENEWAL_PERSON_WORKBOOK.SHEETS.length;
        orderIndex++
      ) {
        var ordered = spreadsheet.getSheetByName(
          RENEWAL_PERSON_WORKBOOK.SHEETS[orderIndex].name
        );
        spreadsheet.setActiveSheet(ordered);
        spreadsheet.moveActiveSheet(orderIndex + 1);
      }
      personWorkbookWriteSystemSheet_(
        systemSheet, resolved.file, context, updatedAt
      );
      spreadsheet.setActiveSheet(
        spreadsheet.getSheetByName(RENEWAL_PERSON_WORKBOOK.SHEETS[0].name)
      );
      systemSheet.hideSheet();
      SpreadsheetApp.flush();
      personWorkbookAssertSystemSheet_(
        systemSheet, resolved.file, context
      );
    } else {
      if (systemWasHidden) systemSheet.hideSheet();
      personWorkbookFlushWithRetry_();
    }
    var cleanupWarnings = recoveryWarnings.slice();
    for (var deleteIndex = 0; deleteIndex < backups.length; deleteIndex++) {
      try {
        spreadsheet.deleteSheet(backups[deleteIndex].sheet);
      } catch (backupCleanupError) {
        cleanupWarnings.push(
          backups[deleteIndex].backupName + ": " +
          artifactErrorMessage_(backupCleanupError)
        );
        try { backups[deleteIndex].sheet.hideSheet(); } catch (ignoredBackupHideError) {}
      }
    }
    try { SpreadsheetApp.flush(); } catch (cleanupFlushError) {
      cleanupWarnings.push(artifactErrorMessage_(cleanupFlushError));
    }
    return {
      updatedAt: updatedAt,
      complete: finalize,
      cleanupWarnings: cleanupWarnings
    };
  } catch (error) {
    var rollbackErrors = [];
    try { systemSheet.showSheet(); } catch (showSystemError) {
      rollbackErrors.push(artifactErrorMessage_(showSystemError));
    }
    for (var rollbackIndex = renamedTargets.length - 1; rollbackIndex >= 0; rollbackIndex--) {
      var renamed = renamedTargets[rollbackIndex];
      var backup = null;
      for (var backupIndex = 0; backupIndex < backups.length; backupIndex++) {
        if (backups[backupIndex].targetName === renamed.targetName) {
          backup = backups[backupIndex];
          break;
        }
      }
      try {
        var currentTarget = spreadsheet.getSheetByName(renamed.targetName);
        if (currentTarget && currentTarget.getSheetId() === renamed.sheet.getSheetId()) {
          spreadsheet.deleteSheet(currentTarget);
        }
        if (backup) backup.sheet.setName(backup.targetName);
      } catch (rollbackSheetError) {
        rollbackErrors.push(
          renamed.targetName + ": " + artifactErrorMessage_(rollbackSheetError)
        );
      }
    }
    var currentSheets = spreadsheet.getSheets();
    for (var preparedIndex = 0; preparedIndex < currentSheets.length; preparedIndex++) {
      var remainingPreparedName = "";
      try {
        remainingPreparedName = currentSheets[preparedIndex].getName();
        if (remainingPreparedName.indexOf(temporarySheetPrefix) === 0) {
          spreadsheet.deleteSheet(currentSheets[preparedIndex]);
        }
      } catch (preparedCleanupError) {
        rollbackErrors.push(
          (remainingPreparedName || temporarySheetPrefix) + ": " +
          artifactErrorMessage_(preparedCleanupError)
        );
      }
    }
    try {
      systemSheet.showSheet();
      systemSheet.getRange(1, 1, 11, 2).setValues(systemBefore);
      if (systemWasHidden) systemSheet.hideSheet();
    } catch (systemRollbackError) {
      rollbackErrors.push(
        "__SYSTEM: " + artifactErrorMessage_(systemRollbackError)
      );
    }
    SpreadsheetApp.flush();
    if (rollbackErrors.length) {
      resolved.file.setDescription(
        personWorkbookIdentityDescription_(context) +
        "\nRECOVERY_REQUIRED:" + runTag
      );
      var uncertain = artifactRegistryOutcomeUncertainError_(
        "対象者資料ブックの更新失敗後に旧シートを完全復元できません。" +
        "自動再実行せず、準備・旧シートを確認してください。【担当部署に確認が必要】 " +
        rollbackErrors.join(" / "),
        error
      );
      uncertain.artifactProvisional = {
        itemType: "file",
        label: "復旧確認が必要な対象者資料ブック",
        fileId: resolved.file.getId(),
        url: resolved.file.getUrl(),
        fileName: resolved.file.getName(),
        cleanupFailed: true
      };
      throw uncertain;
    }
    throw error;
  }
}

function personWorkbookFlushWithRetry_() {
  var lastError = null;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      SpreadsheetApp.flush();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) Utilities.sleep((attempt + 1) * 1200);
    }
  }
  throw lastError || new Error("スプレッドシートの変更を確定できません。");
}

function personWorkbookQuarantineName_(spreadsheet, preparedName) {
  var base = ("__中断_" + artifactText_(preparedName).replace(/^__準備_/, ""))
    .slice(0, 90);
  var candidate = base;
  var suffix = 2;
  while (spreadsheet.getSheetByName(candidate)) {
    candidate = (base.slice(0, 90 - String(suffix).length) + "_" + suffix)
      .slice(0, 90);
    suffix++;
    if (suffix > 100) {
      throw new Error(
        "中断シートの保管名を一意にできません。管理者が非表示シートを確認してください。"
      );
    }
  }
  return candidate;
}

function personWorkbookEnsureSystemSheet_(spreadsheet, created, file, context) {
  var systemSheet = spreadsheet.getSheetByName(
    RENEWAL_PERSON_WORKBOOK.SYSTEM_SHEET_NAME
  );
  if (!systemSheet && created === true) {
    var sheets = spreadsheet.getSheets();
    if (sheets.length !== 1) {
      throw new Error("新規対象者資料ブックの初期シート構造が一致しません。");
    }
    systemSheet = sheets[0];
    systemSheet.setName(RENEWAL_PERSON_WORKBOOK.SYSTEM_SHEET_NAME);
    personWorkbookWriteSystemSheet_(
      systemSheet, file, context, artifactNowText_()
    );
  }
  if (!systemSheet) {
    throw new Error("既存の対象者資料ブックにシステム識別シートがありません。自動上書きしません。");
  }
  personWorkbookAssertSystemSheet_(systemSheet, file, context);
  return systemSheet;
}

function personWorkbookWriteSystemSheet_(sheet, file, context, updatedAt) {
  var values = [
    ["format", RENEWAL_PERSON_WORKBOOK.FORMAT],
    ["generatorVersion", RENEWAL_PERSON_WORKBOOK.GENERATOR_VERSION],
    ["layoutVersion", RENEWAL_PERSON_WORKBOOK.LAYOUT_VERSION],
    ["recordId", context.record.recordId],
    ["autoRootId", context.autoRoot.getId()],
    ["fileId", file.getId()],
    ["canonicalVersion", Number(context.canonical.version)],
    ["canonicalPayloadHash", context.canonical.payloadHash],
    ["contentHash", context.contentHash],
    ["updatedAt", updatedAt],
    ["updatedBy", context.authorization.email]
  ];
  sheet.clear();
  sheet.getRange(1, 1, values.length, 2).setValues(
    artifactSafeSheetMatrix_(values)
  );
  sheet.getRange("A1:A11").setFontWeight("bold");
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 480);
}

function personWorkbookAssertSystemSheet_(sheet, file, context) {
  var values = sheet.getRange(1, 1, 11, 2).getDisplayValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    map[artifactText_(values[i][0])] = artifactText_(values[i][1]);
  }
  if (
    map.format !== RENEWAL_PERSON_WORKBOOK.FORMAT ||
    Number(map.generatorVersion) !== RENEWAL_PERSON_WORKBOOK.GENERATOR_VERSION ||
    (map.layoutVersion &&
      map.layoutVersion !== RENEWAL_PERSON_WORKBOOK.LAYOUT_VERSION) ||
    map.recordId !== context.record.recordId ||
    map.autoRootId !== context.autoRoot.getId() ||
    map.fileId !== file.getId()
  ) {
    throw new Error("対象者資料ブックのrecordId・保存先・ファイル識別情報が一致しません。");
  }
  return true;
}

function personWorkbookRenderPrepared_(spreadsheet, tempName, key, context) {
  if (key === "training") {
    return personWorkbookRenderTraining_(spreadsheet, tempName, context);
  }
  if (key === "plan") {
    return personWorkbookRenderPlan_(spreadsheet, tempName, context);
  }
  if (key === "ledger") {
    return personWorkbookRenderLedger_(spreadsheet, tempName, context);
  }
  var sheet = spreadsheet.insertSheet(tempName);
  if (key === "overview") personWorkbookRenderOverview_(sheet, context);
  else if (key === "status") personWorkbookRenderStatus_(sheet, context);
  else if (key === "evidence") personWorkbookRenderEvidence_(sheet, context);
  else if (key === "certificate") personWorkbookRenderCertificate_(sheet, context);
  else if (key === "dips") personWorkbookRenderDips_(sheet, context);
  else if (key === "payment") personWorkbookRenderPayment_(sheet, context);
  else throw new Error("未対応の統合資料シートです: " + key);
  return sheet;
}

function personWorkbookTitle_(sheet, rangeA1, title, context) {
  var range = sheet.getRange(rangeA1);
  range.merge().setValue(
    (context.sampleMode ? "【サンプル・正式使用禁止】" : "") + title
  );
  range
    .setBackground("#ffffff")
    .setFontColor(context.sampleMode ? "#b91c1c" : "#111827")
    .setFontWeight("bold")
    .setFontSize(16)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(null, null, true, null, null, null, "#111827",
      SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(range.getRow(), 38);
  if (context.sampleMode) sheet.setTabColor("#b91c1c");
}

function personWorkbookApplyDocumentStyle_(sheet, rows, columns) {
  personWorkbookPrepareGrid_(sheet, rows, columns);
  try { sheet.setHiddenGridlines(true); } catch (ignoredGridlines) {}
  sheet.getRange(1, 1, rows, columns)
    .setBackground("#ffffff")
    .setFontFamily("Noto Serif JP")
    .setFontColor("#111827");
}

function personWorkbookSampleNotice_(sheet, rangeA1, context) {
  if (!context.sampleMode) return;
  sheet.getRange(rangeA1)
    .merge()
    .setValue("【サンプル・正式使用禁止】")
    .setFontColor("#b91c1c")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBackground("#fff1f2");
  sheet.setTabColor("#b91c1c");
}

function personWorkbookMarkCopiedSample_(sheet) {
  var notice = "【サンプル・正式使用禁止】正式提出・交付・会計処理には使用できません。";
  var anchor = sheet.getRange("A1");
  var currentNote = artifactText_(anchor.getNote());
  if (currentNote.indexOf(notice) < 0) {
    anchor.setNote(currentNote ? currentNote + "\n" + notice : notice);
  }
  sheet.setTabColor("#b91c1c");
}

function personWorkbookPrepareGrid_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(), columns - sheet.getMaxColumns()
    );
  }
  if (sheet.getMaxRows() > rows) {
    sheet.deleteRows(rows + 1, sheet.getMaxRows() - rows);
  }
  if (sheet.getMaxColumns() > columns) {
    sheet.deleteColumns(columns + 1, sheet.getMaxColumns() - columns);
  }
  try { sheet.setHiddenGridlines(true); } catch (ignored) {}
  sheet.getRange(1, 1, rows, columns)
    .setFontFamily("Noto Sans JP")
    .setFontSize(10)
    .setVerticalAlignment("middle");
}

function personWorkbookReadGridSnapshotById_(
  spreadsheetId, sheetName, rows, columns
) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets) {
    throw new Error(
      "原本レイアウトを一括検査するGoogle Sheets APIを利用できません。"
    );
  }
  var quotedSheetName = "'" + sheetName.replace(/'/g, "''") + "'";
  var rangeA1 =
    quotedSheetName + "!A1:" + artifactColumnLetters_(columns) + rows;
  var response = Sheets.Spreadsheets.get(
    spreadsheetId,
    {
      ranges: [rangeA1],
      includeGridData: true,
      fields:
        "sheets(" +
          "properties(gridProperties(" +
            "frozenRowCount,frozenColumnCount,hideGridlines" +
          "))," +
          "merges," +
          "data(" +
            "startRow,startColumn," +
            "rowData(values(userEnteredValue,userEnteredFormat))," +
            "rowMetadata(pixelSize,hiddenByUser)," +
            "columnMetadata(pixelSize,hiddenByUser)" +
          ")" +
        ")"
    }
  );
  var returnedSheet =
    response && response.sheets && response.sheets.length
      ? response.sheets[0]
      : null;
  if (!returnedSheet) {
    throw new Error("原本レイアウトの一括読取結果が空です。");
  }
  return returnedSheet;
}

function personWorkbookReadGridSnapshot_(sheet, rows, columns) {
  return personWorkbookReadGridSnapshotById_(
    sheet.getParent().getId(), sheet.getName(), rows, columns
  );
}

function personWorkbookGridHashInput_(returnedSheet) {
  var normalizedMerges = (returnedSheet.merges || []).map(function(merge) {
    return {
      startRowIndex: Number(merge.startRowIndex || 0),
      endRowIndex: Number(merge.endRowIndex || 0),
      startColumnIndex: Number(merge.startColumnIndex || 0),
      endColumnIndex: Number(merge.endColumnIndex || 0)
    };
  }).sort(function(left, right) {
    return artifactCanonicalJson_(left).localeCompare(
      artifactCanonicalJson_(right)
    );
  });
  var data = returnedSheet.data && returnedSheet.data.length
    ? returnedSheet.data[0]
    : {};
  return {
    gridProperties:
      returnedSheet.properties &&
      returnedSheet.properties.gridProperties
        ? returnedSheet.properties.gridProperties
        : {},
    merges: normalizedMerges,
    rowData: data.rowData || [],
    rowMetadata: data.rowMetadata || [],
    columnMetadata: data.columnMetadata || []
  };
}

function personWorkbookLayoutFingerprint_(sheet, rows, columns) {
  return artifactHashHex_(personWorkbookGridHashInput_(
    personWorkbookReadGridSnapshot_(sheet, rows, columns)
  ));
}

function personWorkbookCopyPinnedGrid_(
  sourceSpreadsheetId, sourceSheetName, destinationSpreadsheet,
  tempName, rows, columns, label
) {
  var snapshot = personWorkbookReadGridSnapshotById_(
    sourceSpreadsheetId, sourceSheetName, rows, columns
  );
  var target = destinationSpreadsheet.insertSheet(tempName);
  if (target.getMaxRows() > rows) {
    target.deleteRows(rows + 1, target.getMaxRows() - rows);
  }
  if (target.getMaxColumns() > columns) {
    target.deleteColumns(columns + 1, target.getMaxColumns() - columns);
  }
  var sheetId = target.getSheetId();
  var requests = [];
  var sourceGridProperties =
    snapshot.properties && snapshot.properties.gridProperties
      ? snapshot.properties.gridProperties
      : {};
  var copiedGridProperties = {};
  var gridFields = [];
  [
    "frozenRowCount",
    "frozenColumnCount",
    "hideGridlines"
  ].forEach(function(field) {
    if (sourceGridProperties[field] !== undefined) {
      copiedGridProperties[field] = sourceGridProperties[field];
      gridFields.push("gridProperties." + field);
    }
  });
  if (gridFields.length) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: copiedGridProperties
        },
        fields: gridFields.join(",")
      }
    });
  }
  var data = snapshot.data && snapshot.data.length
    ? snapshot.data[0]
    : {};
  if (data.rowData && data.rowData.length) {
    requests.push({
      updateCells: {
        rows: data.rowData,
        fields: "userEnteredValue,userEnteredFormat",
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: rows,
          startColumnIndex: 0,
          endColumnIndex: columns
        }
      }
    });
  }
  function addDimensionRequests(metadata, dimension) {
    (metadata || []).forEach(function(properties, index) {
      var copiedProperties = {};
      var fields = [];
      ["pixelSize", "hiddenByUser"].forEach(function(field) {
        if (properties && properties[field] !== undefined) {
          copiedProperties[field] = properties[field];
          fields.push(field);
        }
      });
      if (!fields.length) return;
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: dimension,
            startIndex: index,
            endIndex: index + 1
          },
          properties: copiedProperties,
          fields: fields.join(",")
        }
      });
    });
  }
  addDimensionRequests(data.rowMetadata, "ROWS");
  addDimensionRequests(data.columnMetadata, "COLUMNS");
  (snapshot.merges || []).forEach(function(merge) {
    requests.push({
      mergeCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: Number(merge.startRowIndex || 0),
          endRowIndex: Number(merge.endRowIndex || 0),
          startColumnIndex: Number(merge.startColumnIndex || 0),
          endColumnIndex: Number(merge.endColumnIndex || 0)
        },
        mergeType: "MERGE_ALL"
      }
    });
  });
  if (!requests.length) {
    throw new Error("原本レイアウトの複製要求が空です。");
  }
  Sheets.Spreadsheets.batchUpdate(
    { requests: requests },
    destinationSpreadsheet.getId()
  );
  SpreadsheetApp.flush();
  var sourceHash = artifactHashHex_(
    personWorkbookGridHashInput_(snapshot)
  );
  var copiedHash = personWorkbookLayoutFingerprint_(
    target, rows, columns
  );
  if (sourceHash !== copiedHash) {
    throw new Error(
      artifactText_(label) +
      "の結合・列幅・行高・罫線を含むセル書式が承認済み原本と一致しません。"
    );
  }
  return target;
}

function personWorkbookAssertCopiedLayout_(
  sourceSheet, copiedSheet, rows, columns, label
) {
  var sourceHash = personWorkbookLayoutFingerprint_(
    sourceSheet, rows, columns
  );
  var copiedHash = personWorkbookLayoutFingerprint_(
    copiedSheet, rows, columns
  );
  if (sourceHash !== copiedHash) {
    throw new Error(
      artifactText_(label) +
      "の結合・列幅・行高・罫線を含むセル書式が承認済み原本と一致しません。"
    );
  }
  return copiedHash;
}

function personWorkbookRenderOverview_(sheet, context) {
  personWorkbookApplyDocumentStyle_(sheet, 42, 8);
  personWorkbookTitle_(sheet, "A1:H1", "対象者資料一式　概要", context);
  var record = context.record;
  var expiry = artifactValidIsoDateOrBlank_(record.certificateExpiry) ||
    (artifactValidIsoDateOrBlank_(record.courseDate)
      ? artifactAddCalendarMonthsMinusOne_(record.courseDate)
      : "");
  var rows = [
    ["項目", "登録内容"],
    ["recordId", record.recordId],
    ["管理ID", record.personId],
    ["対象者氏名", artifactRecordName_(record)],
    ["会社名", record.companyName],
    ["区分", record.customerType],
    ["受講機関", record.courseProvider],
    ["資格区分", record.licenseClass],
    ["航空機の種類", artifactOperationalAircraftType_(record)],
    ["技能証明申請者番号",
      personWorkbookOptionalIdentifier_(record.skillsApplicantNo)],
    ["現在の免許期限", record.licenseExpiry],
    ["CDP申込日", record.applicationDate],
    ["講習予定日", record.courseScheduledDate],
    ["講習修了日", record.courseDate],
    ["講習会場", record.courseVenue],
    ["停止処分者向け講習", record.suspensionCourse],
    ["修了証明書番号", record.certificateNo],
    ["修了証明書発行日", record.certificateIssuedDate],
    ["修了証明書有効期限", expiry],
    ["DIPS申請者ID", record.dipsApplicantId],
    ["DIPS状態フラグ", record.dipsRecordMode],
    ["更新完了確認日", record.confirmedDate],
    ["新しい免許期限", record.newExpiry],
    ["共有正本version", context.canonical.version],
    ["共有正本payloadHash", context.canonical.payloadHash],
    ["資料更新内容hash", context.contentHash]
  ];
  sheet.getRange(3, 1, rows.length, 2).setValues(
    artifactSafeSheetMatrix_(rows)
  );
  sheet.getRange("A3:B3").setBackground("#e5e7eb").setFontWeight("bold");
  sheet.getRange(3, 1, rows.length, 2)
    .setBorder(true, true, true, true, true, true)
    .setWrap(true);
  sheet.getRange(4, 1, rows.length - 1, 1).setBackground("#f8fafc");
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 520);
  sheet.setFrozenRows(3);
}

function personWorkbookRenderTraining_(spreadsheet, tempName, context) {
  var record = context.record;
  var classValue = Number(artifactClassValue_(record.licenseClass));
  if ([1, 2].indexOf(classValue) < 0) {
    var blank = spreadsheet.insertSheet(tempName);
    personWorkbookApplyDocumentStyle_(blank, 34, 8);
    personWorkbookTitle_(blank, "A1:H1", "別添03 講習記録簿", context);
    blank.getRange("A3:H3").merge().setValue(
      "資格区分が未入力のため、講習記録欄は空欄です。"
    );
    personWorkbookWriteBlankTrainingTable_(blank, context);
    return blank;
  }
  artifactAssertTrainingTemplateClean_(RENEWAL_ARTIFACT.TEMPLATE_IDS.training);
  var source = SpreadsheetApp.openById(
    RENEWAL_ARTIFACT.TEMPLATE_IDS.training
  );
  var sourceName = classValue === 1
    ? "一等無人航空機操縦士"
    : "二等無人航空機操縦士";
  var sourceSheet = source.getSheetByName(sourceName);
  if (!sourceSheet) {
    throw new Error("講習記録簿原本の対象区分シートがありません。");
  }
  var sheet = sourceSheet.copyTo(spreadsheet);
  sheet.setName(tempName);
  var keepColumns = classValue === 1 ? 8 : 6;
  if (sheet.getMaxRows() > 32) {
    sheet.deleteRows(33, sheet.getMaxRows() - 32);
  }
  if (sheet.getMaxColumns() > keepColumns) {
    sheet.deleteColumns(
      keepColumns + 1, sheet.getMaxColumns() - keepColumns
    );
  }
  personWorkbookAssertCopiedLayout_(
    sourceSheet, sheet, 32, keepColumns, "別添03 講習記録簿"
  );
  sheet.getRange("A1").setValue(artifactSheetText_(
    "講習記録簿　　受講者氏名（　" + artifactRecordName_(record) + "　）"
  ));
  sheet.getRange("A4").setValue(
    artifactSheetText_(artifactClassLongLabel_(record.licenseClass))
  );
  sheet.getRange("A5").setValue(artifactSheetText_(
    artifactValidIsoDateOrBlank_(record.courseDate)
      ? "受講日（" + artifactSlashDate_(record.courseDate) + "）"
      : "受講日（　　　　　　　　　）"
  ));
  sheet.getRange("A7").setValue(artifactSheetText_(
    record.courseVenue ? "場所（" + record.courseVenue + "）" : "場所（　　　　　　　　）"
  ));
  var modules = [
    "academicOverview", "academicRules", "academicLawUpdate",
    "academicAccident", "academicSafety", "academicVideo"
  ];
  if (classValue === 1) {
    modules.push("academicFirstClass", "academicFirstClassVideo");
  }
  for (var moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
    personWorkbookWriteTrainingModule_(
      sheet, moduleIndex + 1, modules[moduleIndex], record, 12, 15, 17
    );
  }
  if (artifactText_(record.suspensionCourse) === "あり") {
    sheet.getRange("A21").setValue(artifactSheetText_(
      record.practicalVenue || record.courseVenue
        ? "場所（" + artifactText_(record.practicalVenue || record.courseVenue) + "）実地講習"
        : "場所（　　　　　　　　）実地講習"
    ));
    personWorkbookWriteTrainingModule_(
      sheet, 1, "practicalExercise1", record, 26, 29, 31
    );
    personWorkbookWriteTrainingModule_(
      sheet, 2, "practicalDiscussion", record, 26, 29, 31
    );
  } else if (artifactText_(record.suspensionCourse) === "なし") {
    sheet.getRange("A21").setValue(
      "実地講習：対象外（停止処分者向け講習なし）"
    );
    personWorkbookWriteTrainingModule_(
      sheet, 1, "practicalExercise1", {}, 26, 29, 31
    );
    personWorkbookWriteTrainingModule_(
      sheet, 2, "practicalDiscussion", {}, 26, 29, 31
    );
  } else {
    sheet.getRange("A21").setValue("実地講習");
    personWorkbookWriteTrainingModule_(
      sheet, 1, "practicalExercise1", {}, 26, 29, 31
    );
    personWorkbookWriteTrainingModule_(
      sheet, 2, "practicalDiscussion", {}, 26, 29, 31
    );
  }
  if (context.sampleMode) {
    personWorkbookMarkCopiedSample_(sheet);
  }
  try { sheet.setHiddenGridlines(true); } catch (ignoredGrid) {}
  return sheet;
}

function personWorkbookWriteBlankTrainingTable_(sheet, context) {
  var headers = [["講習項目", "受講日", "開始", "終了", "担当者", "備考"]];
  var names = [
    "学科・技能証明制度の概要",
    "学科・操縦者が遵守すべき事項",
    "学科・最近の制度改正",
    "学科・事故・重大インシデント",
    "学科・運航ルール・事故防止",
    "学科・動画（共通）",
    "実地・飛行",
    "実地・ディスカッション"
  ];
  sheet.getRange("A5:F5").setValues(headers)
    .setBackground("#dbeafe").setFontWeight("bold");
  var rows = names.map(function(name) {
    return [name, "", "", "", "", ""];
  });
  sheet.getRange(6, 1, rows.length, 6).setValues(rows);
  sheet.getRange(5, 1, rows.length + 1, 6)
    .setBorder(true, true, true, true, true, true);
  sheet.setColumnWidths(1, 6, 135);
  sheet.setColumnWidth(1, 250);
}

function personWorkbookWriteTrainingModule_(
  sheet, column, prefix, record, dateRow, timeRow, instructorRow
) {
  var dateValue = artifactValidIsoDateOrBlank_(record[prefix + "Date"]);
  var start = artifactText_(record[prefix + "Start"]);
  var end = artifactText_(record[prefix + "End"]);
  var time = start && end ? start + " ～ " + end : (start || end || "");
  sheet.getRange(dateRow, column).setValue(
    artifactSheetText_(dateValue ? artifactSlashDate_(dateValue) : "")
  );
  sheet.getRange(timeRow, column).setValue(artifactSheetText_(time));
  sheet.getRange(instructorRow, column).setValue(
    artifactSheetText_(record[prefix + "Instructor"])
  );
}

function personWorkbookRenderPlan_(spreadsheet, tempName, context) {
  var record = context.record;
  var plannedDate = artifactValidIsoDateOrBlank_(
    record.courseScheduledDate || record.courseDate
  );
  var plannedClass = Number(artifactClassValue_(record.licenseClass));
  var hasPlan = !!plannedDate && [1, 2].indexOf(plannedClass) >= 0;
  var planMonth = plannedDate ? plannedDate.slice(0, 7) : "";
  var year = planMonth ? Number(planMonth.slice(0, 4)) : "";
  var month = planMonth ? Number(planMonth.slice(5, 7)) : "";
  var templateId = artifactExtractDriveFileId_(
    context.complianceTemplates &&
    context.complianceTemplates.planTemplateId
  );
  var source = SpreadsheetApp.openById(templateId);
  var sourceSheet = source.getSheetByName("ベース");
  if (!sourceSheet) {
    throw new Error("別添04専用原本の「ベース」シートがありません。");
  }
  var sheet = sourceSheet.copyTo(spreadsheet);
  sheet.setName(tempName);
  personWorkbookAssertCopiedLayout_(
    sourceSheet, sheet, 8, 37, "別添04 実施計画書"
  );
  var lastDay = planMonth ? new Date(year, month, 0).getDate() : 0;
  var days = [];
  var weekdays = [];
  var weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  for (var day = 1; day <= 31; day++) {
    days.push(day <= lastDay ? day : "");
    weekdays.push(
      day <= lastDay
        ? weekdayLabels[new Date(year, month - 1, day).getDay()]
        : ""
    );
  }
  sheet.getRange("D1").setValue(
    "登録更新講習機関実施計画書" +
    (month ? "　" + year + "年" + month + "月" : "")
  );
  sheet.getRange(2, 4, 1, 31).setValues([days]);
  sheet.getRange(3, 4, 1, 31).setValues([weekdays]);
  sheet.getRange("B4:C5").setValues(artifactSafeSheetMatrix_([
    [
      hasPlan && plannedClass === 2 ? 1 : "",
      hasPlan && plannedClass === 2 ? 1 : ""
    ],
    [
      hasPlan && plannedClass === 1 ? 1 : "",
      hasPlan && plannedClass === 1 ? 1 : ""
    ]
  ]));
  sheet.getRange("D1").setNote(
    "対象者：" + artifactRecordName_(record) +
    " / 管理ID：" + artifactText_(record.personId) +
    "。保存済み予定から作成し、未入力値は空欄です。"
  );
  if (context.sampleMode) {
    personWorkbookMarkCopiedSample_(sheet);
  }
  return sheet;
}

function personWorkbookRenderStatus_(sheet, context) {
  personWorkbookApplyDocumentStyle_(sheet, 34, 12);
  var record = context.record;
  var completedDate = artifactValidIsoDateOrBlank_(record.courseDate);
  var issuedDate = artifactValidIsoDateOrBlank_(record.certificateIssuedDate);
  var completedClass = Number(artifactClassValue_(record.licenseClass));
  var completed = !!completedDate && [1, 2].indexOf(completedClass) >= 0;
  var fiscalYear = Number(artifactText_(record.fiscalYear)) ||
    (completedDate ? artifactFiscalYearFromIso_(completedDate) : "");
  var reportDateText = issuedDate
    ? artifactFormatJapaneseLongDate_(issuedDate)
    : "";
  var periodText = completedDate
    ? artifactFormatJapaneseLongDate_(completedDate)
    : "";
  var periodRangeText = periodText ? periodText + " ～ " + periodText : "";
  var className = completedClass === 1
    ? "一等"
    : (completedClass === 2 ? "二等" : "");
  var registrationNumber = completedClass === 1
    ? "国空無機第325175号"
    : (completedClass === 2 ? "国空無機第325176号" : "");
  var officeName = artifactText_(context.settings.issuerCompany);
  var officeAddress = artifactText_(context.settings.issuerAddress);
  var officePhone = artifactText_(context.settings.issuerPhone);
  var academicVenue = completed ? artifactText_(record.courseVenue) : "";
  var practicalVenue = completed
    ? artifactText_(record.practicalVenue || record.courseVenue)
    : "";
  var statusCompatibilityLabel = "登録更新講習機関実施状況報告書";

  sheet.getRange("A1:L34")
    .setFontFamily("MS Mincho")
    .setFontSize(10)
    .setBackground("#ffffff")
    .setFontColor("#000000");
  sheet.getRange("A2:L2").merge()
    .setValue("登録講習機関実施状況報告書")
    .setFontSize(12)
    .setFontWeight("normal")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setNote(
      statusCompatibilityLabel + " / 対象者：" +
      artifactRecordName_(record) + " / 管理ID：" +
      artifactText_(record.personId)
    );
  sheet.getRange("H4:L4").merge()
    .setValue(reportDateText)
    .setHorizontalAlignment("right")
    .setFontSize(11);
  sheet.getRange("A5:D5").merge()
    .setValue("国土交通大臣　殿")
    .setFontSize(11)
    .setHorizontalAlignment("left");
  sheet.getRange("G6:L6").merge()
    .setValue(officeName)
    .setFontSize(11)
    .setHorizontalAlignment("right");
  sheet.getRange("G7:L7").merge()
    .setValue(officeAddress)
    .setHorizontalAlignment("right")
    .setWrap(true);
  sheet.getRange("A9:L10").merge()
    .setValue(
      "無人航空機の登録講習機関及び登録更新講習機関に関する省令" +
      "第12条第1項の規定に基づき実施状況の報告を致します。"
    )
    .setWrap(true)
    .setFontSize(11)
    .setHorizontalAlignment("left")
    .setVerticalAlignment("middle");

  sheet.getRange("A12:C12").merge().setValue("登録講習機関登録番号");
  sheet.getRange("D12:L12").merge().setValue(registrationNumber);
  sheet.getRange("A13:A15").merge()
    .setValue("報\n告\nす\nる\n事\n業\n所")
    .setWrap(true)
    .setFontSize(9);
  sheet.getRange("B13:C13").merge().setValue("事業所の名称");
  sheet.getRange("D13:L13").merge().setValue(officeName);
  sheet.getRange("B14:C14").merge().setValue("事業所の所在地");
  sheet.getRange("D14:L14").merge().setValue(officeAddress);
  sheet.getRange("B15:C15").merge().setValue("電話番号");
  sheet.getRange("D15:L15").merge().setValue(officePhone);
  sheet.getRange("A16:C16").merge().setValue("講習課程");
  sheet.getRange("D16:L16").merge().setValue(
    className
      ? className +
        "無人航空機操縦士に係る学科講習及び実地講習"
      : ""
  );
  sheet.getRange("A17:C17").merge().setValue("報告年度");
  sheet.getRange("D17:L17").merge().setValue(
    fiscalYear
      ? "令和" + (Number(fiscalYear) - 2018) + "年度" +
        (completedDate ? "（" + periodText + "開始分）" : "")
      : ""
  );

  sheet.getRange("A18:A23").merge()
    .setValue("講\n習\n内\n容")
    .setWrap(true);
  sheet.getRange("B18:C20").merge().setValue(
    className ? className + "無人航空機操縦士\n（学科講習）" : ""
  );
  sheet.getRange("D18:E18").merge().setValue("実施場所");
  sheet.getRange("F18:L18").merge().setValue(academicVenue);
  sheet.getRange("D19:E19").merge().setValue("実施期間");
  sheet.getRange("F19:L19").merge().setValue(
    completed ? periodRangeText : ""
  );
  sheet.getRange("D20:E20").merge().setValue("修了者数");
  sheet.getRange("F20:L20").merge().setValue(completed ? "1人" : "");

  sheet.getRange("B21:C23").merge().setValue(
    className ? className + "無人航空機操縦士\n（実地講習）" : ""
  );
  sheet.getRange("D21:E21").merge().setValue("実施場所");
  sheet.getRange("F21:L21").merge().setValue(practicalVenue);
  sheet.getRange("D22:E22").merge().setValue("実施期間");
  sheet.getRange("F22:L22").merge().setValue(
    completed ? periodRangeText : ""
  );
  sheet.getRange("D23:E23").merge().setValue("修了者数");
  sheet.getRange("F23:L23").merge().setValue(completed ? "1人" : "");

  sheet.getRange("A12:L23")
    .setBorder(
      true, true, true, true, true, true,
      "#000000", SpreadsheetApp.BorderStyle.SOLID
    )
    .setWrap(true)
    .setVerticalAlignment("middle");
  sheet.getRange("A12:C23").setHorizontalAlignment("center");
  sheet.getRange("D18:E23").setHorizontalAlignment("center");
  sheet.getRange("D12:L17").setHorizontalAlignment("left");
  sheet.getRange("F18:L23").setHorizontalAlignment("left");
  sheet.getRange("A25:L25").merge()
    .setValue("添付資料：講習修了者一覧")
    .setFontSize(10)
    .setHorizontalAlignment("left");
  if (context.sampleMode) {
    sheet.getRange("A32:L32").merge()
      .setValue("【サンプル・正式使用禁止】")
      .setFontColor("#b91c1c")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.setTabColor("#b91c1c");
  }
  sheet.setColumnWidth(1, 32);
  sheet.setColumnWidths(2, 2, 70);
  sheet.setColumnWidths(4, 2, 58);
  sheet.setColumnWidths(6, 7, 62);
  sheet.setRowHeight(1, 20);
  sheet.setRowHeight(2, 30);
  sheet.setRowHeight(3, 20);
  sheet.setRowHeight(4, 24);
  sheet.setRowHeight(5, 24);
  sheet.setRowHeights(6, 2, 22);
  sheet.setRowHeights(9, 2, 24);
  sheet.setRowHeight(11, 18);
  sheet.setRowHeight(12, 30);
  sheet.setRowHeight(13, 42);
  sheet.setRowHeight(14, 48);
  sheet.setRowHeights(15, 3, 30);
  sheet.setRowHeights(18, 6, 30);
  sheet.setRowHeight(25, 24);
  sheet.setRowHeight(32, 24);
}

function personWorkbookRenderLedger_(spreadsheet, tempName, context) {
  if (context.sampleMode) {
    return personWorkbookRenderLedgerSampleFast_(
      spreadsheet, tempName, context
    );
  }
  var templateId = artifactExtractDriveFileId_(
    context.settings.ledgerTemplateId
  );
  var sheet = personWorkbookCopyPinnedGrid_(
    templateId, "ベース", spreadsheet, tempName, 22, 9,
    "別添13 修了証明書発行台帳"
  );
  artifactApplyLedgerOutputHeaders_(sheet);
  var values = artifactLedgerOutputFields_(context.record);
  [3, 5, 6].forEach(function(index) {
    values[index] = values[index] ? artifactDateObject_(values[index]) : "";
  });
  personWorkbookSetValuesWithRetry_(
    sheet.getRange(3, 2, 1, values.length),
    [values]
  );
  sheet.getRange("E3").setNumberFormat('yyyy"年"m"月"d"日');
  sheet.getRange("G3:H3").setNumberFormat('yyyy"年"m"月"d"日');
  if (context.sampleMode) {
    personWorkbookMarkCopiedSample_(sheet);
  }
  return sheet;
}

function personWorkbookRenderLedgerSampleFast_(
  spreadsheet, tempName, context
) {
  var sheet = spreadsheet.insertSheet(tempName);
  personWorkbookApplyDocumentStyle_(sheet, 22, 9);
  sheet.getRange("A1:I1").merge()
    .setValue(
      "【サンプル・正式使用禁止】別添13 " +
      "無人航空機更新講習修了証明書発行台帳"
    )
    .setBackground("#fff1f2")
    .setFontColor("#b91c1c")
    .setFontWeight("bold")
    .setFontSize(13)
    .setHorizontalAlignment("center");

  var headers = RENEWAL_ARTIFACT.LEDGER_OUTPUT_HEADERS.slice();
  sheet.getRange(2, 2, 1, headers.length)
    .setValues([headers])
    .setBackground("#f3f4f6")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setWrap(true);

  var values = artifactLedgerOutputFields_(context.record);
  personWorkbookSetValuesWithRetry_(
    sheet.getRange(3, 2, 1, values.length),
    [values]
  );
  sheet.getRange(2, 2, 2, headers.length)
    .setBorder(
      true, true, true, true, true, true,
      "#111827", SpreadsheetApp.BorderStyle.SOLID
    )
    .setWrap(true)
    .setVerticalAlignment("middle");
  sheet.getRange("E3").setNumberFormat("yyyy/mm/dd");
  sheet.getRange("G3:H3").setNumberFormat("yyyy/mm/dd");
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 28);
  sheet.setColumnWidths(2, 8, 135);
  sheet.setRowHeight(1, 36);
  sheet.setRowHeight(2, 54);
  sheet.setRowHeight(3, 34);
  sheet.setTabColor("#b91c1c");
  return sheet;
}

function personWorkbookSetValuesWithRetry_(range, values) {
  var lastError = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      range.setValues(values);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) Utilities.sleep(1500);
    }
  }
  throw lastError || new Error("シートの範囲へ値を書き込めません。");
}

function personWorkbookHasReadableContent_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  for (var row = 0; row < values.length; row++) {
    for (var column = 0; column < values[row].length; column++) {
      if (artifactText_(values[row][column])) return true;
    }
  }
  return false;
}

function personWorkbookRenderEvidence_(sheet, context) {
  personWorkbookApplyDocumentStyle_(sheet, 24, 8);
  personWorkbookTitle_(sheet, "A1:H1", "申込書・技能証明書・身分証　保管", context);
  var record = context.record;
  sheet.getRange("A3:H3").setValues([[
    "書類", "状態", "確認情報", "原本・証憑参照",
    "受領日", "確認日", "確認者", "備考"
  ]]).setBackground("#e5e7eb").setFontWeight("bold");
  sheet.getRange("A4:H6").setValues(artifactSafeSheetMatrix_([
    [
      "申込書",
      record.applicationDate ? "記録あり" : "",
      record.applicationDate ? "CDP申込日 " + record.applicationDate : "",
      record.sourceMemo,
      record.applicationDate,
      "",
      "",
      ""
    ],
    [
      "技能証明書",
      record.referenceSource === "技能証明書" ? "資料参照あり" : "",
      "",
      record.referenceSource,
      "",
      "",
      "",
      record.sourceMemo
    ],
    [
      "身分証",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ]
  ]));
  sheet.getRange("A9:H9").merge().setValue(
    "実物書類は自動生成しません。Driveリンク等が登録されていない欄は空欄です。"
  ).setFontColor("#475569");
  sheet.getRange("A3:H6")
    .setBorder(true, true, true, true, true, true)
    .setWrap(true);
  sheet.setFrozenRows(3);
  sheet.setColumnWidths(1, 8, 145);
  sheet.setColumnWidth(4, 280);
  sheet.setColumnWidth(8, 280);
}

function personWorkbookRenderCertificate_(sheet, context) {
  personWorkbookApplyDocumentStyle_(sheet, 36, 12);
  var record = context.record;
  var aircraftType = artifactOperationalAircraftType_(record);
  var expiry = artifactValidIsoDateOrBlank_(record.certificateExpiry) ||
    (artifactValidIsoDateOrBlank_(record.courseDate)
      ? artifactAddCalendarMonthsMinusOne_(record.courseDate)
      : "");
  var courseDate = artifactValidIsoDateOrBlank_(record.courseDate);
  var classValue = Number(artifactClassValue_(record.licenseClass));
  sheet.getRange("A1:L36")
    .setFontFamily("MS Mincho")
    .setFontSize(12)
    .setBackground("#ffffff")
    .setFontColor("#000000");
  sheet.getRange("A2:L2").merge()
    .setValue("無人航空機更新講習修了証明書")
    .setFontSize(12)
    .setFontWeight("normal")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");
  sheet.getRange("H4:L4").merge().setValue(
    "第　" + artifactText_(record.certificateNo) + "　号"
  ).setHorizontalAlignment("right").setFontSize(12);
  sheet.getRange("H5:L5").merge().setValue(
    courseDate ? artifactFormatJapaneseLongDate_(courseDate) + "　修了" : ""
  ).setHorizontalAlignment("right").setFontSize(12);
  sheet.getRange("H6:L6").merge().setValue(
    expiry ? artifactFormatJapaneseLongDate_(expiry) + "　まで有効" : ""
  ).setHorizontalAlignment("right").setFontSize(12);
  sheet.getRange("A8:L8").merge().setValue(
    artifactRecordName_(record) + (artifactRecordName_(record) ? "　殿" : "")
  )
    .setHorizontalAlignment("center")
    .setFontSize(14)
    .setFontWeight("normal");
  sheet.getRange("C10:J10").merge().setValue(
    "技能証明申請者番号：" +
      personWorkbookOptionalIdentifier_(record.skillsApplicantNo)
  ).setHorizontalAlignment("left").setFontSize(12);
  sheet.getRange("B12:K13").merge().setValue(
    "航空法第132条の51の規定に関し、登録更新講習機関が行う無人航空機" +
    "更新講習を修了したことを証明する。"
  )
    .setHorizontalAlignment("left")
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setFontSize(12);

  sheet.getRange("B15:E16").merge().setValue("");
  sheet.getRange("F15:K15").merge().setValue("区分").setFontSize(11);
  sheet.getRange("F16:H16").merge().setValue("一等").setFontSize(11);
  sheet.getRange("I16:K16").merge().setValue("二等").setFontSize(11);
  sheet.getRange("B17:C22").merge()
    .setValue("限 定\n解 除\n事 項")
    .setWrap(true)
    .setFontSize(12);
  sheet.getRange("D17:E18").merge()
    .setValue("回転翼航空機\n（マルチローター）")
    .setWrap(true)
    .setFontSize(11);
  sheet.getRange("D19:E20").merge()
    .setValue("回転翼航空機\n（ヘリコプター）")
    .setWrap(true)
    .setFontSize(11);
  sheet.getRange("D21:E22").merge().setValue("飛行機").setFontSize(11);
  sheet.getRange("F17:H18").merge().setValue(
    aircraftType === "回転翼航空機（マルチローター）" && classValue === 1
      ? "○" : ""
  );
  sheet.getRange("I17:K18").merge().setValue(
    aircraftType === "回転翼航空機（マルチローター）" && classValue === 2
      ? "○" : ""
  );
  sheet.getRange("F19:H20").merge().setValue(
    aircraftType === "回転翼航空機（ヘリコプター）" && classValue === 1
      ? "○" : ""
  );
  sheet.getRange("I19:K20").merge().setValue(
    aircraftType === "回転翼航空機（ヘリコプター）" && classValue === 2
      ? "○" : ""
  );
  sheet.getRange("F21:H22").merge().setValue(
    aircraftType === "飛行機" && classValue === 1 ? "○" : ""
  );
  sheet.getRange("I21:K22").merge().setValue(
    aircraftType === "飛行機" && classValue === 2 ? "○" : ""
  );
  sheet.getRange("B15:K22")
    .setBorder(
      true, true, true, true, true, true,
      "#000000", SpreadsheetApp.BorderStyle.SOLID
    )
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.getRange("G25:L25").merge().setValue(
    "担当講師：" + artifactText_(record.certificateInstructor)
  )
    .setHorizontalAlignment("right")
    .setFontLine("underline");
  sheet.getRange("G27:L27").merge().setValue(
    "登録更新講習機関名　" + artifactText_(context.settings.issuerCompany)
  ).setHorizontalAlignment("right");
  sheet.getRange("G28:L28").merge().setValue(
    "登録更新講習機関コード：　" +
      (context.sampleMode ? "SAMPLE" : RENEWAL_ARTIFACT.ORGANIZATION_CODE)
  ).setHorizontalAlignment("right");
  sheet.getRange("A30:L30").setNote(
    "印刷・交付前に、番号・氏名・日付・区分・担当講師を確認してください。"
  );
  if (context.sampleMode) {
    sheet.getRange("A34:L34").merge()
      .setValue("【サンプル・正式使用禁止】")
      .setFontColor("#b91c1c")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.setTabColor("#b91c1c");
  }
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidths(2, 2, 44);
  sheet.setColumnWidths(4, 2, 54);
  sheet.setColumnWidths(6, 6, 68);
  sheet.setColumnWidth(12, 50);
  sheet.setRowHeight(1, 20);
  sheet.setRowHeight(2, 30);
  sheet.setRowHeight(3, 20);
  sheet.setRowHeights(4, 3, 22);
  sheet.setRowHeight(7, 20);
  sheet.setRowHeight(8, 34);
  sheet.setRowHeight(9, 20);
  sheet.setRowHeight(10, 26);
  sheet.setRowHeight(11, 22);
  sheet.setRowHeights(12, 2, 30);
  sheet.setRowHeights(15, 2, 24);
  sheet.setRowHeights(17, 6, 36);
  sheet.setRowHeights(23, 2, 20);
  sheet.setRowHeight(25, 26);
  sheet.setRowHeight(26, 20);
  sheet.setRowHeights(27, 2, 24);
  sheet.setRowHeight(34, 24);
}

function personWorkbookRenderDips_(sheet, context) {
  personWorkbookApplyDocumentStyle_(sheet, 2, 11);
  var record = context.record;
  var expiry = artifactValidIsoDateOrBlank_(record.certificateExpiry) ||
    (artifactValidIsoDateOrBlank_(record.courseDate)
      ? artifactAddCalendarMonthsMinusOne_(record.courseDate)
      : "");
  var classValue = Number(artifactClassValue_(record.licenseClass));
  var suspension = artifactText_(record.suspensionCourse) === "あり"
    ? "2"
    : (artifactText_(record.suspensionCourse) === "なし" ? "1" : "");
  var mode = artifactText_(record.dipsRecordMode);
  var stateFlag = mode === "削除" ? "3" :
    (mode === "既存情報更新" ? "2" : (mode === "新規登録" ? "1" : ""));
  var organizationCode = context.sampleMode
    ? "SAMPLE"
    : RENEWAL_ARTIFACT.ORGANIZATION_CODE;
  var officeCode = context.sampleMode
    ? "SAMPLE"
    : RENEWAL_ARTIFACT.OFFICE_CODE;
  var applicationNumber = context.sampleMode
    ? "SAMPLE-PA"
    : "PA000000000000";
  sheet.getRange(1, 1, 1, 11).setValues([artifactDipsCsvHeaders_()])
    .setBackground("#e5e7eb").setFontWeight("bold").setWrap(true);
  sheet.getRange(2, 1, 1, 11).setValues(artifactSafeSheetMatrix_([[
    personWorkbookOptionalIdentifier_(record.dipsApplicantId),
    personWorkbookOptionalIdentifier_(record.skillsApplicantNo),
    organizationCode,
    officeCode,
    [1, 2].indexOf(classValue) >= 0 ? String(classValue) : "",
    suspension,
    applicationNumber,
    record.certificateNo,
    artifactValidIsoDateOrBlank_(record.courseDate)
      ? artifactSlashDate_(record.courseDate) : "",
    expiry ? artifactSlashDate_(expiry) : "",
    stateFlag
  ]]));
  sheet.getRange("A1:K2")
    .setBorder(true, true, true, true, true, true)
    .setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 11, 170);
  var confirmed = artifactText_(context.settings.dipsCsvTemplateHeaderHash) ===
    artifactHashHex_(artifactDipsCsvHeaders_());
  var note = confirmed
      ? "DIPS公式空CSV確認済み：" +
        artifactText_(context.settings.dipsCsvTemplateConfirmedDate) + " / " +
        artifactText_(context.settings.dipsCsvTemplateConfirmedBy)
      : "DIPS公式空CSV未確認です。設定で最新11列を照合してください。";
  if (context.sampleMode) {
    note = "【サンプル・正式使用禁止】\n" + note;
    sheet.setTabColor("#b91c1c");
  }
  sheet.getRange("A1").setNote(note);
}

function personWorkbookRenderPayment_(sheet, context) {
  personWorkbookApplyDocumentStyle_(sheet, 80, 10);
  personWorkbookTitle_(sheet, "A1:J1", "講習料金収納記録　保管", context);
  var finance = context.finance;
  var position = finance ? finance.position : null;
  sheet.getRange("A3:J5").setValues(artifactSafeSheetMatrix_([
    [
      "recordId", context.record.recordId,
      "管理ID", context.record.personId,
      "対象者", artifactRecordName_(context.record),
      "会計revision", finance ? finance.revision : "",
      "会計stateHash", finance ? finance.stateHash : ""
    ],
    [
      "入金合計", position ? position.receipts : "",
      "返金合計", position ? position.refunds : "",
      "未消込入金", position ? position.unallocatedReceipts : "",
      "請求残高", position ? position.outstanding : "",
      "更新日時", artifactNowText_()
    ],
    [
      "計算根拠",
      finance
        ? "正式会計台帳の検証済み請求・入金・消込・反対取引から集計"
        : "正式会計台帳未設定のため空欄",
      "", "", "", "", "", "", "", ""
    ]
  ]));
  sheet.getRange("B4:H4").setNumberFormat("#,##0");
  sheet.getRange("A7:J7").setValues([[
    "請求日", "請求書番号", "請求ID", "状態", "税込請求額",
    "消込額", "反対取引・相殺等", "請求残高", "役務提供日", "入金期限"
  ]]).setBackground("#e5e7eb").setFontWeight("bold");
  var invoiceRows = finance ? finance.invoices.map(function(invoice) {
    var invoicePosition = financeInvoicePosition_(finance.state, invoice.id);
    return [
      invoice.invoiceDate,
      invoice.invoiceNo,
      invoice.id,
      invoice.status,
      Number(invoice.totalInclTax),
      Number(invoicePosition.cashAllocated || 0),
      Number(invoicePosition.billingReduction || 0) +
        Number(invoicePosition.nonCashSettled || 0),
      Number(invoicePosition.outstanding || 0),
      invoice.accountingDate,
      invoice.paymentDueDate
    ];
  }) : [];
  if (invoiceRows.length) {
    sheet.getRange(8, 1, invoiceRows.length, 10).setValues(
      artifactSafeSheetMatrix_(invoiceRows)
    );
    sheet.getRange(8, 5, invoiceRows.length, 4).setNumberFormat("#,##0");
  }
  var paymentStart = Math.max(12, 9 + invoiceRows.length);
  sheet.getRange(paymentStart, 1, 1, 10).setValues([[
    "取引日", "入金ID", "取引区分", "金額", "符号付金額",
    "入金方法", "参照", "消込額", "未消込額", "記録者・時刻"
  ]]).setBackground("#e5e7eb").setFontWeight("bold");
  var allocationTotals = {};
  if (finance) {
    finance.allocations.forEach(function(row) {
      allocationTotals[row.paymentId] =
        (allocationTotals[row.paymentId] || 0) +
        Number(row.amount) * Number(row.direction);
    });
  }
  var paymentRows = finance ? finance.payments.map(function(payment) {
    var sign = payment.kind === "RECEIPT" ? 1 :
      (payment.kind === "REVERSE_RECEIPT" || payment.kind === "REFUND" ? -1 : 1);
    return [
      payment.accountingDate,
      payment.id,
      payment.kind,
      Number(payment.amount),
      Number(payment.amount) * sign,
      payment.method,
      payment.reference || payment.reason,
      allocationTotals[payment.id] || 0,
      payment.kind === "RECEIPT"
        ? financeReceiptUnallocated_(finance.state, payment.id)
        : 0,
      artifactText_(payment.createdBy) + " / " +
        artifactText_(payment.createdAt)
    ];
  }) : [];
  if (paymentRows.length) {
    sheet.getRange(
      paymentStart + 1, 1, paymentRows.length, 10
    ).setValues(artifactSafeSheetMatrix_(paymentRows));
    sheet.getRange(
      paymentStart + 1, 4, paymentRows.length, 6
    ).setNumberFormat("#,##0");
  }
  var legacyStart = paymentStart + Math.max(4, paymentRows.length + 3);
  sheet.getRange(legacyStart, 1, 1, 6).setValues([[
    "対象者入力値（正式会計ではない）", "税抜額", "値引", "税率", "入金入力値", "入金日"
  ]]).setBackground("#fef3c7").setFontWeight("bold");
  sheet.getRange(legacyStart + 1, 1, 1, 6).setValues(
    artifactSafeSheetMatrix_([[
      "登録・編集タブの参考値",
      context.record.feeExTax,
      context.record.discountExTax,
      context.record.taxRate,
      context.record.paidAmount,
      context.record.paymentDate
    ]])
  );
  sheet.getRange(1, 1, Math.max(legacyStart + 2, 20), 10).setWrap(true);
  sheet.setFrozenRows(7);
  [250, 160, 140, 110, 135, 120, 190, 130, 130, 220]
    .forEach(function(width, index) {
      sheet.setColumnWidth(index + 1, width);
    });
}
