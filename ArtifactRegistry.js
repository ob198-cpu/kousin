/**
 * Artifact registry integrity, durable PREPARED intents, output identity checks, recovery, and rollback.
 *
 * This file is an Apps Script global module. Shared constants and general helpers
 * remain in Artifacts.js; do not duplicate those globals here.
 */

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

function artifactPreparedOutputIdentity_(recordId, kind, payloadHash, version) {
  var hash = artifactText_(payloadHash);
  var numericVersion = Number(version || 0);
  if (
    !artifactText_(recordId) ||
    RENEWAL_ARTIFACT.KINDS.indexOf(artifactText_(kind)) < 0 ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    numericVersion < 1 ||
    Math.floor(numericVersion) !== numericVersion
  ) throw new Error("個別成果物の作成予約識別情報を確定できません。");
  return RENEWAL_ARTIFACT.DRIVE_IDENTITY_VERSION + "|artifact-prepared|recordId=" + artifactText_(recordId) +
    "|kind=" + artifactText_(kind) + "|payloadHash=" + hash + "|version=" + numericVersion;
}

function artifactExpectedOutputFileName_(kind, record, version) {
  var suffix = artifactSafeName_(artifactRecordName_(record || {})) + "_v" + Number(version || 0);
  if (kind === "certificate") return "講習修了証明書_" + suffix;
  if (kind === "dipsCsv") return "DIPS更新修了者_" + suffix + ".csv";
  if (kind === "guidance") return "更新講習のご案内_" + suffix;
  if (kind === "training") return "講習記録簿_" + suffix;
  if (kind === "billing") return "見積書・請求書_" + suffix;
  throw new Error("個別成果物の予定ファイル名を確定できない種別です。");
}

function artifactPreparedOutputFileName_(recordId, kind, payloadHash, version) {
  var hash = artifactText_(payloadHash);
  var numericVersion = Number(version || 0);
  if (
    !artifactText_(recordId) ||
    RENEWAL_ARTIFACT.KINDS.indexOf(artifactText_(kind)) < 0 ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    numericVersion < 1 ||
    Math.floor(numericVersion) !== numericVersion
  ) throw new Error("個別成果物の匿名作成予約名を確定できません。");
  return "CDP_PREPARED_" + artifactText_(kind) + "_" +
    artifactShortKey_(artifactText_(recordId) + "|" + hash) + "_v" + numericVersion;
}

function artifactPrepareNewOutputFile_(file, context, label) {
  var itemLabel = artifactText_(label) || "新規成果物";
  artifactHardenNewDriveItem_(file, itemLabel);
  artifactAssertReusableDriveItem_(
    file,
    context && context.targetFolder ? context.targetFolder.getId() : "",
    itemLabel,
    context && context.settings ? context.settings.allowedOutputEmails : ""
  );
  try {
    file.setDescription(artifactPreparedOutputIdentity_(
      context.record.recordId, context.kind, context.payloadHash, context.version
    ));
  } catch (descriptionError) {
    throw new Error(itemLabel + "へ作成予約識別情報を設定できないため停止しました。");
  }
  var finalName = artifactExpectedOutputFileName_(context.kind, context.record, context.version);
  try {
    file.setName(finalName);
    if (artifactText_(file.getName()) !== finalName) {
      throw new Error("名称の読戻しが一致しません。");
    }
  } catch (renameError) {
    throw new Error(itemLabel + "をACL検査後の正式名称へ変更できないため停止しました。");
  }
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
      ["created", "prepared"].indexOf(row.status) >= 0 && selectedKinds.indexOf(row.kind) >= 0;
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

function artifactDriveAttemptOperation_(action, sourceId, name, mimeType, parentId) {
  return {
    action: artifactText_(action).toUpperCase(),
    sourceId: artifactText_(sourceId),
    name: artifactText_(name),
    mimeType: artifactText_(mimeType),
    parentId: artifactText_(parentId)
  };
}

function artifactDriveAttemptKey_(operation) {
  return "RENEWAL_ARTIFACT_DRIVE_ATTEMPT_V1_" +
    artifactShortKey_(artifactCanonicalJson_(operation || {}));
}

function artifactReadDriveAttempt_(key, label) {
  var raw = "";
  try {
    raw = artifactText_(
      PropertiesService.getScriptProperties().getProperty(artifactText_(key))
    );
  } catch (readError) {
    throw new Error(
      (artifactText_(label) || "Drive項目") +
      "のDrive試行記録を読めないため、作成を停止しました。【担当部署に確認が必要】"
    );
  }
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        [
          "ATTEMPT_STARTED",
          "OUTCOME_UNCERTAIN",
          "CREATED_VERIFIED"
        ].indexOf(
          artifactText_(parsed.state)
        ) < 0) {
      throw new Error("invalid Drive attempt state");
    }
    if (!parsed.operation ||
        artifactDriveAttemptKey_(parsed.operation) !== artifactText_(key) ||
        (artifactText_(parsed.state) === "CREATED_VERIFIED" &&
         !artifactText_(parsed.resourceId))) {
      throw new Error("invalid Drive attempt identity");
    }
    return parsed;
  } catch (parseError) {
    throw new Error(
      (artifactText_(label) || "Drive項目") +
      "のDrive試行記録が破損しています。自動修復せず停止しました。" +
      "【担当部署に確認が必要】key=" + artifactText_(key)
    );
  }
}

function artifactAssertNoUnresolvedDriveAttempt_(key, label) {
  var tracked = artifactReadDriveAttempt_(key, label);
  if (!tracked) return true;
  throw artifactRegistryOutcomeUncertainError_(
    (artifactText_(label) || "Drive項目") +
    "には結果未確定のDrive試行があります。予定した親・名前・識別情報を確認し、" +
    "記録を解決するまで同じ作成を再送しません。【担当部署に確認が必要】key=" +
    artifactText_(key)
  );
}

function artifactBeginDriveAttempt_(operation, label) {
  var key = artifactDriveAttemptKey_(operation);
  artifactAssertNoUnresolvedDriveAttempt_(key, label);
  var tracked = {
    state: "ATTEMPT_STARTED",
    detectedAt: artifactNowText_(),
    operation: operation
  };
  var serialized = JSON.stringify(tracked);
  var props = PropertiesService.getScriptProperties();
  try {
    props.setProperty(key, serialized);
    if (artifactText_(props.getProperty(key)) !== serialized) {
      throw new Error("Drive試行記録の読戻しが一致しません。");
    }
  } catch (writeError) {
    throw new Error(
      (artifactText_(label) || "Drive項目") +
      "のDrive試行を事前記録できないため、Driveへ作成要求を送りません。" +
      "【担当部署に確認が必要】"
    );
  }
  return key;
}

function artifactMarkDriveAttemptUncertain_(key, operation, resourceId, error) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      key,
      JSON.stringify({
        state: "OUTCOME_UNCERTAIN",
        detectedAt: artifactNowText_(),
        operation: operation,
        resourceId: artifactText_(resourceId),
        error: artifactErrorMessage_(error)
      })
    );
    return true;
  } catch (ignoredAttemptUpdateError) {
    // The durable ATTEMPT_STARTED marker was written before Drive was called.
    return false;
  }
}

function artifactMarkDriveAttemptCreatedVerified_(
  key, operation, resourceId, label
) {
  var id = artifactText_(resourceId);
  if (!id) {
    throw new Error(
      (artifactText_(label) || "Drive項目") +
      "の作成済みIDを記録できないため停止しました。"
    );
  }
  var tracked = {
    state: "CREATED_VERIFIED",
    detectedAt: artifactNowText_(),
    operation: operation,
    resourceId: id
  };
  var serialized = JSON.stringify(tracked);
  var props = PropertiesService.getScriptProperties();
  try {
    props.setProperty(artifactText_(key), serialized);
    var readback = artifactReadDriveAttempt_(key, label);
    if (!readback ||
        artifactText_(readback.state) !== "CREATED_VERIFIED" ||
        artifactText_(readback.resourceId) !== id ||
        artifactCanonicalJson_(readback.operation) !==
          artifactCanonicalJson_(operation)) {
      throw new Error("Drive作成済み記録の読戻しが一致しません。");
    }
  } catch (writeError) {
    throw new Error(
      (artifactText_(label) || "Drive項目") +
      "の作成済みIDを安全に記録できないため停止しました。"
    );
  }
  return tracked;
}

function artifactClearDriveAttempt_(key) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(artifactText_(key));
  } catch (ignoredAttemptClearError) {
    // A stale marker is fail-closed for this exact operation and does not
    // invalidate the already verified Drive item.
  }
}

function artifactClearPublishedDriveAttempt_(
  operation, expectedResourceId, label
) {
  var key = artifactDriveAttemptKey_(operation);
  var tracked = artifactReadDriveAttempt_(key, label);
  if (!tracked) return true;
  var expectedId = artifactText_(expectedResourceId);
  if (!expectedId ||
      artifactCanonicalJson_(tracked.operation) !==
        artifactCanonicalJson_(operation) ||
      (artifactText_(tracked.resourceId) &&
       artifactText_(tracked.resourceId) !== expectedId)) {
    throw artifactRegistryOutcomeUncertainError_(
      (artifactText_(label) || "Drive項目") +
      "の作成試行記録が、公開済みIDまたは作成条件と一致しません。" +
      "【担当部署に確認が必要】key=" + key
    );
  }
  artifactClearDriveAttempt_(key);
  if (artifactReadDriveAttempt_(key, label)) {
    throw artifactRegistryOutcomeUncertainError_(
      (artifactText_(label) || "Drive項目") +
      "は台帳へ確定済みですが、Drive作成試行記録を解除できません。" +
      "【担当部署に確認が必要】key=" + key
    );
  }
  return true;
}

function artifactClearPublishedDriveAttemptsForResourceIds_(
  resourceIds, label
) {
  var expected = {};
  (resourceIds || []).forEach(function (resourceId) {
    var id = artifactText_(resourceId);
    if (id) expected[id] = true;
  });
  if (!Object.keys(expected).length) return true;
  var props = PropertiesService.getScriptProperties();
  var all;
  try {
    all = props.getProperties();
  } catch (readError) {
    throw artifactRegistryOutcomeUncertainError_(
      (artifactText_(label) || "Drive項目") +
      "の作成試行記録一覧を確認できません。"
    );
  }
  Object.keys(all || {}).filter(function (key) {
    return key.indexOf("RENEWAL_ARTIFACT_DRIVE_ATTEMPT_V1_") === 0;
  }).forEach(function (key) {
    var tracked = artifactReadDriveAttempt_(key, label);
    var resourceId = artifactText_(tracked && tracked.resourceId);
    if (!resourceId || !expected[resourceId]) return;
    artifactClearPublishedDriveAttempt_(
      tracked.operation, resourceId, label
    );
  });
  return true;
}

function artifactPublishDriveIdentityProperty_(
  properties, propertyKey, resourceId, operation, label
) {
  var id = artifactText_(resourceId);
  if (!properties || !artifactText_(propertyKey) || !id) {
    throw new Error(
      (artifactText_(label) || "Drive項目") +
      "の公開IDを保存する条件が不足しています。"
    );
  }
  try {
    properties.setProperty(artifactText_(propertyKey), id);
    if (artifactText_(
      properties.getProperty(artifactText_(propertyKey))
    ) !== id) {
      throw new Error("公開IDの読戻しが一致しません。");
    }
  } catch (publishError) {
    throw artifactRegistryOutcomeUncertainError_(
      (artifactText_(label) || "Drive項目") +
      "の公開IDを安全に保存できませんでした。",
      publishError
    );
  }
  artifactClearPublishedDriveAttempt_(operation, id, label);
  return id;
}

/**
 * Create a Drive item with the approved parent in the same Drive API request.
 * ignoreDefaultVisibility prevents a Workspace domain default from granting
 * unintended access before the explicit ACL audit runs.
 */
function artifactCreateDriveItemInFolder_(
  name,
  mimeType,
  parentFolder,
  label,
  allowedOutputEmails,
  ownerOnly,
  mediaData
) {
  var fileName = artifactText_(name);
  var expectedMimeType = artifactText_(mimeType);
  var itemLabel = artifactText_(label) || "Drive項目";
  var parentId = "";
  try {
    parentId = artifactText_(parentFolder && parentFolder.getId ? parentFolder.getId() : parentFolder);
  } catch (parentReadError) {
    throw new Error(itemLabel + "の保存先フォルダIDを確認できません。");
  }
  if (!fileName || !expectedMimeType || !parentId) {
    throw new Error(itemLabel + "の名前、種類、または保存先フォルダIDがありません。");
  }

  var resource = null;
  var item = null;
  var itemType = expectedMimeType === "application/vnd.google-apps.folder" ? "folder" : "file";
  var operation = artifactDriveAttemptOperation_(
    "CREATE", "", fileName, expectedMimeType, parentId
  );
  var attemptKey = artifactBeginDriveAttempt_(operation, itemLabel);
  try {
    resource = Drive.Files.create({
      name: fileName,
      mimeType: expectedMimeType,
      parents: [parentId]
    }, mediaData || null, {
      fields: "id,name,mimeType,parents",
      supportsAllDrives: true,
      ignoreDefaultVisibility: true
    });
    var resourceId = artifactText_(resource && resource.id);
    var resourceParents = resource && Array.isArray(resource.parents) ? resource.parents.map(artifactText_) : [];
    if (
      !resourceId ||
      artifactText_(resource.name) !== fileName ||
      artifactText_(resource.mimeType) !== expectedMimeType ||
      resourceParents.length !== 1 ||
      resourceParents[0] !== parentId
    ) {
      throw new Error(itemLabel + "を指定フォルダ直下へ作成したことを確認できません。");
    }
    item = itemType === "folder"
      ? DriveApp.getFolderById(resourceId)
      : DriveApp.getFileById(resourceId);
    artifactHardenNewDriveItem_(item, itemLabel);
    if (ownerOnly === true) {
      artifactAssertOwnerOnlyDriveItem_(item, parentId, itemLabel);
    } else {
      artifactAssertReusableDriveItem_(item, parentId, itemLabel, allowedOutputEmails);
    }
    artifactMarkDriveAttemptCreatedVerified_(
      attemptKey, operation, resourceId, itemLabel
    );
    return item;
  } catch (createError) {
    artifactMarkDriveAttemptUncertain_(
      attemptKey, operation, resource && resource.id, createError
    );
    if (item) {
      artifactPermanentlyDeleteNewDriveItem_(item, itemLabel, itemType, createError);
      artifactClearDriveAttempt_(attemptKey);
      throw createError;
    }
    if (resource && artifactText_(resource.id)) {
      try {
        item = itemType === "folder"
          ? DriveApp.getFolderById(artifactText_(resource.id))
          : DriveApp.getFileById(artifactText_(resource.id));
      } catch (lookupError) {
        var lookupInfo = {
          itemType: itemType,
          label: itemLabel,
          fileId: artifactText_(resource.id),
          url: "",
          fileName: fileName,
          cleanupFailed: true
        };
        var lookupAuditIssue = artifactPersistCleanupFailure_(
          lookupInfo, createError, lookupError
        );
        var lookupUncertain = artifactRegistryOutcomeUncertainError_(
          itemLabel + "はDrive上で作成された可能性がありますが、取得・完全削除できません。" +
          "作成予約を維持し、IDを担当部署で確認してください。【担当部署に確認が必要】ID=" +
          artifactText_(resource.id) + (lookupAuditIssue ? " / " + lookupAuditIssue : ""),
          createError
        );
        lookupUncertain.artifactProvisional = lookupInfo;
        throw lookupUncertain;
      }
      artifactPermanentlyDeleteNewDriveItem_(item, itemLabel, itemType, createError);
      artifactClearDriveAttempt_(attemptKey);
      throw createError;
    }
    throw artifactRegistryOutcomeUncertainError_(
      itemLabel + "のDrive作成結果を取得できません。作成予約を維持して次回照合します。",
      createError
    );
  }
}

function artifactCreateSpreadsheetInFolder_(name, parentFolder, label, allowedOutputEmails, ownerOnly) {
  var file = artifactCreateDriveItemInFolder_(
    name,
    "application/vnd.google-apps.spreadsheet",
    parentFolder,
    label || "スプレッドシート",
    allowedOutputEmails,
    ownerOnly === true,
    null
  );
  try {
    return { file: file, spreadsheet: SpreadsheetApp.openById(file.getId()) };
  } catch (openError) {
    artifactThrowAfterCleanup_(openError, file, artifactText_(label) || "スプレッドシート", "file");
  }
}

function artifactUpdateBlobFileContent_(file, name, mimeType, blob, parentFolder, label) {
  var itemLabel = artifactText_(label) || "新規ファイル";
  if (!file || !blob) throw new Error(itemLabel + "のファイルまたは内容がありません。");
  var parentId = artifactText_(parentFolder && parentFolder.getId ? parentFolder.getId() : parentFolder);
  var updated = Drive.Files.update({}, file.getId(), blob, {
    fields: "id,name,mimeType,parents",
    supportsAllDrives: true
  });
  var updatedParents = updated && Array.isArray(updated.parents) ? updated.parents.map(artifactText_) : [];
  if (
    artifactText_(updated && updated.id) !== artifactText_(file.getId()) ||
    artifactText_(updated && updated.name) !== artifactText_(name) ||
    artifactText_(updated && updated.mimeType) !== artifactText_(mimeType) ||
    updatedParents.length !== 1 ||
    updatedParents[0] !== parentId
  ) {
    throw new Error(itemLabel + "へ内容を保存した結果を確認できません。");
  }
  return file;
}

function artifactCreateFolderInFolder_(name, parentFolder, label, allowedOutputEmails, ownerOnly) {
  return artifactCreateDriveItemInFolder_(
    name,
    "application/vnd.google-apps.folder",
    parentFolder,
    label || "新規フォルダ",
    allowedOutputEmails,
    ownerOnly === true,
    null
  );
}

function artifactCopyFileInFolder_(
  sourceFileId,
  name,
  expectedMimeType,
  parentFolder,
  label,
  allowedOutputEmails,
  ownerOnly
) {
  var sourceId = artifactExtractDriveFileId_(sourceFileId);
  var fileName = artifactText_(name);
  var mimeType = artifactText_(expectedMimeType);
  var itemLabel = artifactText_(label) || "新規コピー";
  var parentId = "";
  try {
    parentId = artifactText_(parentFolder && parentFolder.getId ? parentFolder.getId() : parentFolder);
  } catch (parentReadError) {
    throw new Error(itemLabel + "の保存先フォルダIDを確認できません。");
  }
  if (!sourceId || !fileName || !mimeType || !parentId) {
    throw new Error(itemLabel + "の原本ID、名前、種類、または保存先フォルダIDがありません。");
  }

  var resource = null;
  var file = null;
  var operation = artifactDriveAttemptOperation_(
    "COPY", sourceId, fileName, mimeType, parentId
  );
  var attemptKey = artifactBeginDriveAttempt_(operation, itemLabel);
  try {
    resource = Drive.Files.copy({
      name: fileName,
      parents: [parentId]
    }, sourceId, {
      fields: "id,name,mimeType,parents",
      supportsAllDrives: true,
      ignoreDefaultVisibility: true
    });
    var resourceId = artifactText_(resource && resource.id);
    var resourceParents = resource && Array.isArray(resource.parents) ? resource.parents.map(artifactText_) : [];
    if (
      !resourceId ||
      artifactText_(resource.name) !== fileName ||
      artifactText_(resource.mimeType) !== mimeType ||
      resourceParents.length !== 1 ||
      resourceParents[0] !== parentId
    ) {
      throw new Error(itemLabel + "を指定フォルダ直下へ複製したことを確認できません。");
    }
    file = DriveApp.getFileById(resourceId);
    artifactHardenNewDriveItem_(file, itemLabel);
    if (ownerOnly === true) {
      artifactAssertOwnerOnlyDriveItem_(file, parentId, itemLabel);
    } else {
      artifactAssertReusableDriveItem_(file, parentId, itemLabel, allowedOutputEmails);
    }
    artifactMarkDriveAttemptCreatedVerified_(
      attemptKey, operation, resourceId, itemLabel
    );
    return file;
  } catch (copyError) {
    artifactMarkDriveAttemptUncertain_(
      attemptKey, operation, resource && resource.id, copyError
    );
    if (file) {
      artifactPermanentlyDeleteNewDriveItem_(file, itemLabel, "file", copyError);
      artifactClearDriveAttempt_(attemptKey);
      throw copyError;
    }
    if (resource && artifactText_(resource.id)) {
      try {
        file = DriveApp.getFileById(artifactText_(resource.id));
      } catch (lookupError) {
        var lookupInfo = {
          itemType: "file",
          label: itemLabel,
          fileId: artifactText_(resource.id),
          url: "",
          fileName: fileName,
          cleanupFailed: true
        };
        var lookupAuditIssue = artifactPersistCleanupFailure_(
          lookupInfo, copyError, lookupError
        );
        var lookupUncertain = artifactRegistryOutcomeUncertainError_(
          itemLabel + "はDrive上で複製された可能性がありますが、取得・完全削除できません。" +
          "作成予約を維持し、IDを担当部署で確認してください。【担当部署に確認が必要】ID=" +
          artifactText_(resource.id) + (lookupAuditIssue ? " / " + lookupAuditIssue : ""),
          copyError
        );
        lookupUncertain.artifactProvisional = lookupInfo;
        throw lookupUncertain;
      }
      artifactPermanentlyDeleteNewDriveItem_(file, itemLabel, "file", copyError);
      artifactClearDriveAttempt_(attemptKey);
      throw copyError;
    }
    throw artifactRegistryOutcomeUncertainError_(
      itemLabel + "のDrive複製結果を取得できません。作成予約を維持して次回照合します。",
      copyError
    );
  }
}

function artifactEnsureRegistry_(autoRoot, allowedOutputEmails) {
  var props = PropertiesService.getScriptProperties();
  var key = "RENEWAL_ARTIFACT_REGISTRY_" + autoRoot.getId();
  var registryDriveOperation = artifactDriveAttemptOperation_(
    "CREATE",
    "",
    RENEWAL_ARTIFACT.REGISTRY_FILE_NAME,
    "application/vnd.google-apps.spreadsheet",
    autoRoot.getId()
  );
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
    artifactClearPublishedDriveAttempt_(
      registryDriveOperation, storedId, "成果物レジストリ"
    );
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
    artifactPublishDriveIdentityProperty_(
      props,
      key,
      existingFile.getId(),
      registryDriveOperation,
      "成果物レジストリ"
    );
    return { file: existingFile, spreadsheet: existingSs, sheet: existingSheet };
  }
  var createdRegistry = artifactCreateSpreadsheetInFolder_(
    RENEWAL_ARTIFACT.REGISTRY_FILE_NAME,
    autoRoot,
    "新規成果物レジストリ",
    allowedOutputEmails,
    false
  );
  var ss = createdRegistry.spreadsheet;
  var file = createdRegistry.file;
  var sheet;
  try {
    file.setDescription(artifactGeneratedFileIdentity_("registry", autoRoot.getId(), ""));
    sheet = ss.getSheets()[0];
    sheet.setName(RENEWAL_ARTIFACT.REGISTRY_SHEET_NAME);
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    artifactInitializeRegistryHeader_(sheet);
    SpreadsheetApp.flush();
    artifactAssertRegistryStructure_(file, ss, autoRoot.getId());
  } catch (createRegistryError) {
    artifactThrowAfterCleanup_(createRegistryError, file, "新規成果物レジストリ", "file");
  }
  artifactPublishDriveIdentityProperty_(
    props,
    key,
    file.getId(),
    registryDriveOperation,
    "成果物レジストリ"
  );
  return { file: file, spreadsheet: ss, sheet: sheet };
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
  var reservedVersionKeys = {};
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
    if (["prepared", "created", "error"].indexOf(status) < 0) return sheetRow + "行目の状態が正しくありません。";
    if (!artifactText_(row[9])) return sheetRow + "行目の保存先folderIdがありません。";
    if (!artifactIsEmail_(row[10])) return sheetRow + "行目の実行者メールがありません、または形式が正しくありません。";
    if (["created", "prepared", "error"].indexOf(status) >= 0) {
      var reservedVersionKey = artifactText_(row[1]) + "|" + kind + "|" + version;
      if (reservedVersionKeys[reservedVersionKey]) {
        return sheetRow + "行目は同一recordId・種別・versionの監査行と重複しています。";
      }
      reservedVersionKeys[reservedVersionKey] = true;
    }
    if (status === "created") {
      if (!artifactText_(row[6])) return sheetRow + "行目の作成済みfileIdがありません。";
      if (!/^https:\/\//.test(artifactText_(row[7]))) return sheetRow + "行目の作成済みURLが正しくありません。";
      if (!artifactText_(row[8])) return sheetRow + "行目の作成済みファイル名がありません。";
      if (numberedKinds.indexOf(kind) >= 0 && !artifactText_(row[11])) return sheetRow + "行目の採番情報がありません。";
      if (kind !== "ledger") {
        var individualFileId = artifactText_(row[6]);
        if (individualFileIds[individualFileId]) return sheetRow + "行目の個別成果物fileIdが別の作成済み監査行と重複しています。";
        individualFileIds[individualFileId] = true;
      }
    }
    if (status === "prepared" && numberedKinds.indexOf(kind) >= 0 && !artifactText_(row[11])) {
      return sheetRow + "行目の作成予約に採番情報がありません。";
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
  var preparedByChain = {};
  var individualFileIds = {};
  for (var i = 0; i < source.length; i++) {
    var row = source[i] || {};
    var status = artifactText_(row.status);
    if (["created", "prepared", "error"].indexOf(status) < 0) continue;
    var recordId = artifactText_(row.recordId);
    var kind = artifactText_(row.kind);
    var version = Number(row.version || 0);
    var versionKey = recordId + "|" + kind + "|" + version;
    if (versionKeys[versionKey]) return "同一recordId・種別・versionの監査行が全レジストリ間で重複しています: " + versionKey;
    versionKeys[versionKey] = true;
    var chainKey = recordId + "|" + kind;
    if (!chains[chainKey]) chains[chainKey] = [];
    chains[chainKey].push(version);
    if (status === "prepared") {
      if (preparedByChain[chainKey]) return "同一recordId・種別に作成予約が複数あります: " + chainKey;
      preparedByChain[chainKey] = version;
    }
    if (status === "created" && kind !== "ledger") {
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
    if (
      preparedByChain[chainKeys[chainIndex]] &&
      preparedByChain[chainKeys[chainIndex]] !== versions[versions.length - 1]
    ) return "作成予約versionが版履歴の最新ではありません: " + chainKeys[chainIndex];
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
  artifactPermanentlyDeleteNewDriveItem_(
    rollbackFile,
    "作成途中" + (RENEWAL_ARTIFACT.LABELS[kind] || "成果物"),
    "file",
    new Error("成果物作成処理のrollback")
  );
}

function artifactAppendRegistry_(sheet, entry) {
  var actor = artifactActiveActorEmail_();
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
    // A prepared row is the durable write-ahead intent.  Once append may have
    // succeeded it must never be deleted merely because the response was
    // uncertain; the caller reconciles it by identity.
    if (appended && artifactText_(entry.status) !== "prepared") {
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
  return artifactRegistryRowObject_(displayValues, targetRow);
}

function artifactRegistryRowObject_(displayValues, sheetRow) {
  var row = Array.isArray(displayValues) ? displayValues : [];
  return {
    sheetRow: Number(sheetRow || 0),
    timestamp: row[0], recordId: row[1], kind: row[2], hash: row[3],
    version: Number(row[4] || 0), status: row[5], fileId: row[6], url: row[7],
    fileName: row[8], folderId: row[9], actor: row[10], documentNumbers: row[11],
    message: row[12], metadataJson: row[13], schemaVersion: row[14]
  };
}

function artifactPreparedRegistryMatches_(row, entry) {
  if (!row || !entry) return false;
  return (
    artifactText_(row.recordId) === artifactText_(entry.recordId) &&
    artifactText_(row.kind) === artifactText_(entry.kind) &&
    artifactText_(row.hash) === artifactText_(entry.hash) &&
    Number(row.version || 0) === Number(entry.version || 0) &&
    artifactText_(row.status) === "prepared" &&
    artifactText_(row.folderId) === artifactText_(entry.folderId) &&
    artifactText_(row.documentNumbers) === artifactText_(entry.documentNumbers) &&
    artifactText_(row.metadataJson) === JSON.stringify(entry.metadata || {})
  );
}

function artifactAppendPreparedRegistry_(sheet, entry) {
  entry = entry || {};
  entry.status = "prepared";
  var current = artifactReadRegistryRows_(sheet).filter(function (row) {
    return artifactText_(row.recordId) === artifactText_(entry.recordId) &&
      artifactText_(row.kind) === artifactText_(entry.kind) &&
      artifactText_(row.hash) === artifactText_(entry.hash) &&
      Number(row.version || 0) === Number(entry.version || 0);
  });
  if (current.length > 1) throw new Error("同一作成予約が複数あるため停止しました。【担当部署に確認が必要】");
  if (current.length === 1) {
    if (!artifactPreparedRegistryMatches_(current[0], entry)) {
      throw new Error("既存の作成予約内容が今回の予約と一致しません。【担当部署に確認が必要】");
    }
    return current[0];
  }
  try {
    return artifactAppendRegistry_(sheet, entry);
  } catch (appendError) {
    // Append may have committed even when Apps Script did not receive the
    // response.  Read back by the complete immutable identity before deciding.
    var recovered = artifactReadRegistryRows_(sheet).filter(function (row) {
      return artifactPreparedRegistryMatches_(row, entry);
    });
    if (recovered.length === 1) return recovered[0];
    if (recovered.length > 1) {
      throw new Error("作成予約の追記結果が重複しています。【担当部署に確認が必要】");
    }
    throw appendError;
  }
}

function artifactRegistryEntryValues_(preparedRow, entry) {
  return [
    artifactText_(preparedRow.timestamp),
    artifactText_(entry.recordId),
    artifactText_(entry.kind),
    artifactText_(entry.hash),
    Number(entry.version || 0),
    artifactText_(entry.status),
    artifactText_(entry.fileId),
    artifactText_(entry.url),
    artifactText_(entry.fileName),
    artifactText_(entry.folderId),
    artifactText_(preparedRow.actor),
    artifactText_(entry.documentNumbers),
    artifactText_(entry.message),
    JSON.stringify(entry.metadata || {}),
    RENEWAL_ARTIFACT.SCHEMA_VERSION
  ];
}

function artifactRegistryOutcomeUncertainError_(message, cause) {
  var error = new Error((cause ? artifactErrorMessage_(cause) + " / " : "") + message);
  error.artifactRegistryOutcomeUncertain = true;
  return error;
}

function artifactUpdatePreparedRegistry_(sheet, preparedRow, entry) {
  if (!sheet || !preparedRow || Number(preparedRow.sheetRow || 0) < 2) {
    throw new Error("更新対象の作成予約行を特定できません。【担当部署に確認が必要】");
  }
  var rowNumber = Number(preparedRow.sheetRow);
  var range = sheet.getRange(rowNumber, 1, 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length);
  var beforeValues = range.getDisplayValues()[0];
  var before = artifactRegistryRowObject_(beforeValues, rowNumber);
  var desiredValues = artifactRegistryEntryValues_(preparedRow, entry);
  var desiredDisplay = desiredValues.map(function (value) { return artifactText_(value); });
  if (artifactCanonicalJson_(beforeValues) === artifactCanonicalJson_(desiredDisplay)) return before;
  if (
    artifactText_(before.recordId) !== artifactText_(preparedRow.recordId) ||
    artifactText_(before.kind) !== artifactText_(preparedRow.kind) ||
    artifactText_(before.hash) !== artifactText_(preparedRow.hash) ||
    Number(before.version || 0) !== Number(preparedRow.version || 0) ||
    artifactText_(before.status) !== "prepared" ||
    artifactText_(before.actor) !== artifactText_(preparedRow.actor)
  ) {
    throw new Error("作成予約行が更新前に変更されています。【担当部署に確認が必要】");
  }
  var writeError = null;
  try {
    range.setValues([artifactSafeSheetRow_(desiredValues)]);
    SpreadsheetApp.flush();
  } catch (error) {
    writeError = error;
  }
  var afterValues;
  try { afterValues = range.getDisplayValues()[0]; }
  catch (readError) {
    throw artifactRegistryOutcomeUncertainError_(
      "作成予約行の更新結果を読戻しできません。【担当部署に確認が必要】",
      writeError || readError
    );
  }
  if (artifactCanonicalJson_(afterValues) !== artifactCanonicalJson_(desiredDisplay)) {
    throw artifactRegistryOutcomeUncertainError_(
      "作成予約行の更新結果が期待値と一致しません。【担当部署に確認が必要】",
      writeError
    );
  }
  var allIssue = artifactRegistryRowsIssue_(
    sheet.getRange(2, 1, sheet.getLastRow() - 1, RENEWAL_ARTIFACT_REGISTRY_HEADERS.length).getDisplayValues()
  );
  if (allIssue) {
    throw artifactRegistryOutcomeUncertainError_(
      "作成予約行の更新後検証に失敗しました。" + allIssue
    );
  }
  return artifactRegistryRowObject_(afterValues, rowNumber);
}

function artifactFindPrepared_(rows, recordId, kind) {
  var matches = (rows || []).filter(function (row) {
    return artifactText_(row.recordId) === artifactText_(recordId) &&
      artifactText_(row.kind) === artifactText_(kind) &&
      artifactText_(row.status) === "prepared";
  });
  if (matches.length > 1) throw new Error("同一対象・種別の作成予約が複数あります。【担当部署に確認が必要】");
  return matches.length === 1 ? matches[0] : null;
}

function artifactReplaceRegistryRow_(rows, replacement) {
  var found = false;
  for (var i = 0; i < rows.length; i++) {
    if (
      Number(rows[i].sheetRow || 0) === Number(replacement.sheetRow || 0) &&
      artifactText_(rows[i].recordId) === artifactText_(replacement.recordId) &&
      artifactText_(rows[i].kind) === artifactText_(replacement.kind) &&
      artifactText_(rows[i].hash) === artifactText_(replacement.hash) &&
      Number(rows[i].version || 0) === Number(replacement.version || 0) &&
      artifactText_(rows[i].status) === "prepared" &&
      artifactText_(rows[i].folderId) === artifactText_(replacement.folderId) &&
      artifactText_(rows[i].actor) === artifactText_(replacement.actor) &&
      artifactText_(rows[i].timestamp) === artifactText_(replacement.timestamp)
    ) {
      rows[i] = replacement;
      found = true;
      break;
    }
  }
  if (!found) throw new Error("作成予約行をメモリ上のレジストリに反映できません。【担当部署に確認が必要】");
  return rows;
}

function artifactBuildRegistryMetadata_(options) {
  options = options || {};
  var kind = artifactText_(options.kind);
  var record = options.record || {};
  var metadata = {
    recordUpdates: artifactClone_(options.recordUpdates || {}),
    kind: kind,
    version: Number(options.version || 0),
    payloadHash: artifactText_(options.payloadHash),
    templateFingerprint: artifactText_(options.templateFingerprint),
    numberingCutoverMonth: artifactText_(options.settings && options.settings.numberingCutoverMonth),
    eligibilityCheck: artifactEligibilityMetadata_(record),
    qualificationContext: artifactQualificationContextMetadata_(record),
    taxException: artifactTaxExceptionMetadata_(record),
    financeInvoice: kind === "billing" ? artifactFormalInvoiceMetadata_(record) : null,
    canonicalRecordVersion: Number(options.canonical && options.canonical.version || 0),
    canonicalRecordPayloadHash: artifactText_(options.canonical && options.canonical.payloadHash),
    dipsSubmissionDeadline: artifactText_(options.dipsSubmissionDeadline),
    holidayCalendarVersion: kind === "dipsCsv"
      ? artifactText_(options.holidayMaster && options.holidayMaster.version)
      : "",
    dipsCompletionLinkedDate: kind === "dipsCsv" ? artifactText_(record.dipsCompletionLinkedDate) : "",
    certificateIssuedDate: artifactAnyKind_([kind], ["ledger", "certificate", "dipsCsv"])
      ? artifactText_(record.certificateIssuedDate)
      : "",
    certificateExpiry: artifactAnyKind_([kind], ["ledger", "certificate", "dipsCsv"])
      ? artifactText_(record.certificateExpiry)
      : ""
  };
  return metadata;
}

function artifactCompleteRegistryMetadata_(baseMetadata, kind, created) {
  var metadata = artifactClone_(baseMetadata || {});
  if (kind === "ledger") {
    metadata.ledgerRow = Number(created.ledgerRow || 0);
    metadata.ledgerSheetName = artifactText_(created.ledgerSheetName);
    metadata.ledgerVisibleHash = artifactText_(created.ledgerVisibleHash);
    metadata.ledgerStateHash = artifactText_(created.ledgerStateHash);
  } else {
    metadata.outputContentHash = artifactText_(created.outputContentHash);
    metadata.outputDriveVersion = artifactText_(created.outputDriveVersion);
    metadata.outputModifiedTime = artifactText_(created.outputModifiedTime);
    metadata.outputMd5Checksum = artifactText_(created.outputMd5Checksum).toLowerCase();
  }
  return metadata;
}

function artifactPreparedFinalIdentityPrefix_(recordId, kind, payloadHash, version) {
  return RENEWAL_ARTIFACT.DRIVE_IDENTITY_VERSION + "|artifact|recordId=" + artifactText_(recordId) +
    "|kind=" + artifactText_(kind) + "|payloadHash=" + artifactText_(payloadHash) +
    "|version=" + Number(version || 0) + "|contentHash=";
}

function artifactRecoverPreparedFile_(preparedRow, context) {
  var preparedIdentity = artifactPreparedOutputIdentity_(
    context.record.recordId, context.kind, context.payloadHash, context.version
  );
  var finalPrefix = artifactPreparedFinalIdentityPrefix_(
    context.record.recordId, context.kind, context.payloadHash, context.version
  );
  var expectedName = artifactExpectedOutputFileName_(
    context.kind, context.record, context.version
  );
  var preparedName = artifactPreparedOutputFileName_(
    context.record.recordId, context.kind, context.payloadHash, context.version
  );
  var iterator = context.targetFolder.getFiles();
  var matches = [];
  var matchedIds = {};
  var inspected = 0;
  function addMatch(file, description) {
    var id = artifactText_(file && file.getId());
    if (id && !matchedIds[id]) {
      matchedIds[id] = true;
      matches.push({ file: file, description: description });
    }
  }
  while (iterator.hasNext()) {
    var file = iterator.next();
    inspected++;
    if (inspected > 10000) {
      throw new Error("保存先のファイル数が多すぎるため作成予約を安全に照合できません。【担当部署に確認が必要】");
    }
    var description = "";
    try { description = artifactText_(file.getDescription()); }
    catch (descriptionError) {
      throw new Error("作成予約中の保存先ファイル識別情報を読めません。【担当部署に確認が必要】");
    }
    if (
      description === preparedIdentity ||
      description.indexOf(finalPrefix) === 0 ||
      artifactText_(file.getName()) === expectedName ||
      artifactText_(file.getName()) === preparedName
    ) {
      addMatch(file, description);
    }
  }
  if (matches.length > 1) {
    throw new Error("同一作成予約に一致する個別成果物が複数あります。【担当部署に確認が必要】");
  }
  if (!matches.length) return null;
  if (
    matches[0].description === preparedIdentity ||
    matches[0].description.indexOf(finalPrefix) !== 0
  ) {
    throw new Error("作成途中の個別成果物が残っています。内容が完成済みか機械判定できないため停止しました。【担当部署に確認が必要】");
  }
  var contentHash = matches[0].description.slice(finalPrefix.length);
  if (!/^[0-9a-f]{64}$/.test(contentHash)) {
    throw new Error("作成予約中成果物の内容hash識別情報が不正です。【担当部署に確認が必要】");
  }
  var matchedFile = matches[0].file;
  artifactAssertReusableDriveItem_(
    matchedFile,
    context.targetFolder.getId(),
    (RENEWAL_ARTIFACT.LABELS[context.kind] || "成果物") + "の作成予約回収",
    context.settings.allowedOutputEmails
  );
  var actualContentHash = artifactOutputContentHash_(matchedFile.getId(), context.kind);
  if (actualContentHash !== contentHash) {
    throw new Error("作成予約中成果物の内容hashが識別情報と一致しません。【担当部署に確認が必要】");
  }
  var revision = artifactDriveRevisionState_(matchedFile.getId());
  artifactAssertGeneratedFileIdentity_(
    matchedFile,
    expectedName,
    artifactOutputIdentity_(
      context.record.recordId, context.kind, context.payloadHash, context.version, actualContentHash
    ),
    "作成予約中成果物"
  );
  return {
    fileId: matchedFile.getId(),
    url: matchedFile.getUrl(),
    fileName: matchedFile.getName(),
    documentNumbers: artifactText_(preparedRow.documentNumbers),
    outputContentHash: actualContentHash,
    outputDriveVersion: revision.driveVersion,
    outputModifiedTime: revision.modifiedTime,
    outputMd5Checksum: revision.md5Checksum,
    message: "中断前に完成していた成果物を内容hashとDrive版情報で再検証し、作成予約を確定しました。"
  };
}

function artifactAssertNoStrayPreparedLedger_(autoRoot, year) {
  var autoRootId = artifactText_(autoRoot && autoRoot.getId());
  if (!autoRootId || !autoRoot || typeof autoRoot.getFilesByName !== "function") {
    throw new Error("年次発行台帳の保存先を限定して照合できません。【担当部署に確認が必要】");
  }
  var expectedIdentity = artifactGeneratedFileIdentity_("annual-ledger", autoRootId, year);
  var iterator = autoRoot.getFilesByName(artifactAnnualLedgerFileName_(year));
  var suspicious = [];
  var inspected = 0;
  while (iterator.hasNext()) {
    var file = iterator.next();
    inspected++;
    if (inspected > 2) {
      throw new Error("固定保存先に同名の年次発行台帳が複数あります。【担当部署に確認が必要】");
    }
    var description = "";
    try {
      var parents = file.getParents();
      var parentCount = 0;
      var underCurrentRoot = false;
      while (parents.hasNext()) {
        parentCount++;
        if (artifactText_(parents.next().getId()) === autoRootId) underCurrentRoot = true;
      }
      description = artifactText_(file.getDescription());
    } catch (readError) {
      throw new Error("同名の年次発行台帳の保存先・識別情報を確認できません。【担当部署に確認が必要】");
    }
    if (!underCurrentRoot || parentCount !== 1 || description !== expectedIdentity) {
      suspicious.push(artifactText_(file.getId()));
    }
  }
  if (suspicious.length) {
    throw new Error(
      "固定保存先に作成途中または識別情報不一致の年次発行台帳があります。" +
      "重複作成せず停止しました。【担当部署に確認が必要】ID=" + suspicious.join(",")
    );
  }
}

function artifactRecoverPreparedLedger_(preparedRow, context) {
  var issuedDate = artifactRequireIsoDate_(context.record.certificateIssuedDate, "修了証明書発行日");
  artifactAssertNoStrayPreparedLedger_(
    context.autoRoot, Number(issuedDate.slice(0, 4))
  );
  var ledger = artifactEnsureAnnualLedger_(
    context.autoRoot, Number(issuedDate.slice(0, 4)), context.settings
  );
  var sheet = ledger.sheet;
  var last = Math.max(3, sheet.getLastRow());
  var rows = sheet.getRange(3, 2, last - 2, 13).getDisplayValues();
  var matches = [];
  var suspiciousPartialRows = [];
  var reservedCertificateNo = artifactText_(preparedRow.documentNumbers).split(";")[0];
  for (var i = 0; i < rows.length; i++) {
    var visible = rows[i].slice(0, 8);
    var audit = rows[i].slice(8, 13);
    if (
      artifactText_(audit[0]) === artifactText_(context.record.recordId) &&
      Number(audit[1] || 0) === Number(context.version || 0) &&
      artifactText_(audit[2]).indexOf(context.payloadHash + " / ") === 0
    ) {
      matches.push({ rowNumber: i + 3, row: rows[i] });
      continue;
    }
    var sameCertificate = !!reservedCertificateNo &&
      artifactText_(visible[0]) === reservedCertificateNo;
    var sameCurrentAudit = artifactText_(audit[0]) === artifactText_(context.record.recordId) &&
      Number(audit[1] || 0) === Number(context.version || 0);
    var priorCompleteVersion = sameCertificate &&
      artifactText_(audit[0]) === artifactText_(context.record.recordId) &&
      Number(audit[1] || 0) > 0 &&
      Number(audit[1] || 0) < Number(context.version || 0) &&
      /^[0-9a-f]{64} \/ /.test(artifactText_(audit[2])) &&
      /^[0-9a-f]{64}$/.test(artifactText_(audit[3])) &&
      /^[0-9a-f]{64}$/.test(artifactText_(audit[4]));
    if (sameCurrentAudit || (sameCertificate && !priorCompleteVersion)) {
      suspiciousPartialRows.push(i + 3);
    }
  }
  if (suspiciousPartialRows.length) {
    throw new Error(
      "作成予約と同じ番号または監査IDを持つ未完成台帳行があります（" +
      suspiciousPartialRows.join(",") + "行）。上書きせず停止しました。【担当部署に確認が必要】"
    );
  }
  if (matches.length > 1) {
    throw new Error("同一作成予約に一致する発行台帳行が複数あります。【担当部署に確認が必要】");
  }
  if (!matches.length) return null;
  var match = matches[0];
  var visible = match.row.slice(0, 8);
  var auditValues = match.row.slice(8, 13);
  var visibleHash = artifactText_(auditValues[3]);
  var stateHash = artifactText_(auditValues[4]);
  if (
    !/^[0-9a-f]{64}$/.test(visibleHash) ||
    !/^[0-9a-f]{64}$/.test(stateHash) ||
    artifactLedgerVisibleHash_(visible) !== visibleHash ||
    artifactLedgerStateHash_(visible, auditValues.slice(0, 4)) !== stateHash ||
    artifactAnnualLedgerRowIssue_(match.row, match.rowNumber)
  ) {
    throw new Error("作成予約中の発行台帳行の可視値・監査hashが一致しません。【担当部署に確認が必要】");
  }
  artifactAssertReusableDriveItem_(
    ledger.file, context.autoRoot.getId(), "発行台帳の作成予約回収", context.settings.allowedOutputEmails
  );
  return {
    fileId: ledger.file.getId(),
    url: ledger.file.getUrl() + "#gid=" + sheet.getSheetId() + "&range=B" + match.rowNumber + ":I" + match.rowNumber,
    fileName: ledger.file.getName(),
    documentNumbers: artifactText_(preparedRow.documentNumbers),
    ledgerRow: match.rowNumber,
    ledgerSheetName: sheet.getName(),
    ledgerRecordId: artifactText_(context.record.recordId),
    ledgerVersion: Number(context.version),
    ledgerPayloadHash: artifactText_(context.payloadHash),
    ledgerVisibleHash: visibleHash,
    ledgerStateHash: stateHash,
    message: "中断前に完成していた発行台帳行を可視値hashと状態hashで再検証し、作成予約を確定しました。"
  };
}

function artifactRecoverPreparedOutput_(preparedRow, context) {
  if (!preparedRow) return null;
  if (
    artifactText_(preparedRow.recordId) !== artifactText_(context.record.recordId) ||
    artifactText_(preparedRow.kind) !== artifactText_(context.kind) ||
    artifactText_(preparedRow.hash) !== artifactText_(context.payloadHash) ||
    Number(preparedRow.version || 0) !== Number(context.version || 0) ||
    artifactText_(preparedRow.folderId) !== artifactText_(context.targetFolder.getId())
  ) throw new Error("作成予約と今回の生成条件が一致しません。【担当部署に確認が必要】");
  return context.kind === "ledger"
    ? artifactRecoverPreparedLedger_(preparedRow, context)
    : artifactRecoverPreparedFile_(preparedRow, context);
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

function artifactNextVersion_(rows, recordId, kind) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    if (
      rows[i].recordId === artifactText_(recordId) &&
      rows[i].kind === kind &&
      ["created", "prepared", "error"].indexOf(rows[i].status) >= 0
    ) {
      max = Math.max(max, Number(rows[i].version || 0));
    }
  }
  return max + 1;
}
