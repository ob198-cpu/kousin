// @ts-nocheck
// 更新講習の成果物を、既存の原本を変更せずに複製・作成するサーバー処理。

var RENEWAL_ARTIFACT = {
  // 全成果物に共通するハッシュ構造・生成仕様を変更した場合は増分する。
  SCHEMA_VERSION: 3,
  DRIVE_IDENTITY_VERSION: "CDP_RENEWAL_ARTIFACT_IDENTITY_V1",
  SETTINGS_KEY: "RENEWAL_ARTIFACT_SETTINGS_V1",
  BANK_KEY: "RENEWAL_ARTIFACT_BANK_V1",
  SETTINGS_STATE_KEY: "RENEWAL_ARTIFACT_SETTINGS_STATE_V2",
  SETTINGS_STATE_FORMAT: "CDP_RENEWAL_ARTIFACT_SETTINGS_STATE_V2",
  SETTINGS_STATE_MAX_BYTES: 8000,
  HOLIDAY_CALENDAR_KEY: "RENEWAL_ARTIFACT_OFFICIAL_HOLIDAYS_V1",
  DEDICATED_TEMPLATE_PINS_KEY: "RENEWAL_ARTIFACT_TEMPLATE_PINS_V1",
  OFFICIAL_HOLIDAY_CSV_URL: "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv",
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
  // 規程・参照元は読取専用で版を固定する。更新検知時は内容を推測して追従せず、再確認まで停止する。
  REFERENCE_SOURCE_PINS: {
    manual: {
      label: "更新講習マニュアル",
      id: "1t7dL_T5doBs_9tWZ2RvdFdzUZS9fQypAg3MfAZpFsbQ",
      mimeType: "application/vnd.google-apps.document",
      revisionId: "64",
      revisionModifiedTime: "2026-07-14T13:46:53.063Z",
      modifiedTime: "2026-07-14T13:46:53.108Z",
      kinds: ["ledger", "certificate", "dipsCsv", "guidance", "training", "billing"]
    },
    ledgerSource: {
      label: "発行台帳参照元",
      id: "1lAO89hPt2FRu-EoqfkS_xCFKVkfrglz5o-ms-qD92yE",
      mimeType: "application/vnd.google-apps.spreadsheet",
      revisionId: "1",
      revisionModifiedTime: "2026-06-20T04:58:04.039Z",
      modifiedTime: "2026-06-20T04:58:37.778Z",
      kinds: ["ledger"]
    },
    certificateSource: {
      label: "修了証明書参照元",
      id: "1QNHWJMo94V1kfz3EGhdO8Y-5kEvVnbChePe1T52-ALY",
      mimeType: "application/vnd.google-apps.document",
      revisionId: "18",
      revisionModifiedTime: "2026-06-27T10:26:32.571Z",
      modifiedTime: "2026-06-27T10:26:32.613Z",
      kinds: ["certificate"]
    }
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
    billing: "CDP_CLEAN_BILLING_V3"
  },
  CERTIFICATE_BASE_TAB_ID: "t.0",
  ORGANIZATION_CODE: "0157",
  OFFICE_CODE: "R0157001",
  BILLING_NUMBER_NAMESPACE: "UC0157",
  PINNED_OUTPUT_PARENT_FOLDER_ID: "1XmQirjBrQR-uC_GuBVXAyRK5zfqtoQwN",
  PINNED_OUTPUT_PARENT_FOLDER_NAME: "2026年度",
  PINNED_OUTPUT_FISCAL_YEAR: "2026",
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
  },
  LEDGER_HEADER_ALLOWLIST: [
    ["別添13　無人航空機更新講習講習修了証明書発行台帳", "", "", "", "", "", "", "", ""],
    ["", "更新講習\n修了証明書発行番号", "受講者氏名", "修了証明書種別", "講習日", "修了証明書の\n交付の有無", "修了証明書の\n交付年月日", "修了証明書の\n有効年月日", "備考"]
  ],
  TRAINING_TEXT_ALLOWLISTS: {
    "一等無人航空機操縦士": {
      columns: 8,
      rows: {
        "1": ["講習記録簿　    受講者氏名（　　　　　　　　　　　　　　　　　　）"],
        "4": ["一等無人航空機操縦士　　　　　"],
        "5": ["受講日（　　　　　　　/　　　　　　　　　　）"],
        "7": ["場所（                   ）"],
        "8": ["　無人航空機操縦士技能証明制度の概要", "無人航空機を飛行させる者（以下「操縦者」が遵守すべき事", "　最近の無人航空機関連の制度改正", "  事故・重大インシデント事例及び教訓", "　運航ルール・事故防止に関する情報", "動画", "一等無人航空機操縦士が留意すべき事項", "動画"],
        "9": ["必須時間３０分", "", "", "", "", "必須時間　20分", "必須時間　１５分", "必須時間　１０分"],
        "11": ["受講日", "受講日", "受講日", "受講日", "受講日", "受講日", "受講日", "受講日"],
        "12": ["/", "/", "/", "/", "/", "/", "/", "/"],
        "14": ["時間", "時間", "時間", "時間", "時間", "時間", "時間", "時間"],
        "15": ["～", "～", "～", "～", "～", "～", "～", "～"],
        "17": ["担当印", "担当印", "担当印", "担当印", "担当印", "担当印", "担当印", "担当印"],
        "21": ["場所（                 ）実地講習"],
        "22": ["緊急着陸を伴う八の字飛行", "操縦演習に基づく指導及び質疑応答"],
        "23": ["５分以上", "１０分以上"],
        "25": ["受講日", "受講日"],
        "26": ["/", "/"],
        "28": ["時間", "時間"],
        "29": ["～", "～"],
        "31": ["担当印", "担当印"]
      }
    },
    "二等無人航空機操縦士": {
      columns: 6,
      rows: {
        "1": ["講習記録簿　　受講者氏名（　　　　　　　　　　　　　　　　　　）"],
        "4": ["二等無人航空機操縦士　　　　　"],
        "5": ["受講日（　　　　　　　/　　　　　　　　　）"],
        "7": ["場所（                       ）"],
        "8": ["　無人航空機操縦士技能証明制度の概要", "無人航空機を飛行させる者（以下「操縦者」（４のみ二十分以上）という。）が遵守すべき事", "　最近の無人航空機関連の制度改正", "  事故・重大インシデント事例及び教訓", "　運航ルール・事故防止に関する情報", "動画"],
        "9": ["必須時間３０分", "", "", "", "", "必須時間２０分"],
        "11": ["受講日", "受講日", "受講日", "受講日", "受講日", "受講日"],
        "12": ["/", "/", "/", "/", "/", "/"],
        "14": ["時間", "時間", "時間", "時間", "時間", "時間"],
        "15": ["～", "～", "～", "～", "～", "～"],
        "17": ["担当印", "担当印", "担当印", "担当印", "担当印", "担当印"],
        "21": ["場所（                    ）実地講習"],
        "22": ["操縦演習（異常事態における飛行）", "操縦演習に基づく指導及び質疑応答"],
        "23": ["５分以上", "5分以上"],
        "25": ["受講日", "受講日"],
        "26": ["/", "/"],
        "28": ["時間", "時間"],
        "29": ["～", "～"],
        "31": ["担当印", "担当印"]
      }
    }
  }
};

// 内閣府「国民の祝日について」で公表済みの年だけを収録する。
// 2028年分は2027年2月に公表予定のため、将来年を数式で推測しない。
var RENEWAL_JAPAN_HOLIDAYS = {
  version: "CAO_OFFICIAL_JP_HOLIDAYS_2026_2027_V1",
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
/**
 * Artifact APIs run as the deploying account. Authentication/authorization
 * must therefore be delegated to the canonical-store capability gate; never
 * infer a caller from the effective (deployer) account.
 */
function artifactRequireCapability_(capability) {
  if (typeof storeRequireCapability_ !== "function") {
    throw new Error("Shared-store authorization is unavailable. Set up the canonical store before using artifacts.");
  }
  return storeRequireCapability_(capability);
}

/** Active caller identity only. The deploying user is not a caller identity. */
function artifactActiveActorEmail_() {
  var active = "";
  try { active = Session.getActiveUser().getEmail(); } catch (ignored) {}
  active = artifactText_(active).toLowerCase();
  if (!active) {
    throw new Error("実行者メールを取得できません。Google認可と共有データストアの設定を確認してください。");
  }
  return active;
}

function apiGetArtifactSettings() {
  try {
    var authorization = artifactRequireCapability_("artifacts.read");
    var settingsState = artifactLoadSettingsState_();
    var internal = artifactSettingsFromState_(settingsState);
    if (settingsState.lastMutation) {
      try {
        internal._settingsAuditRecoveryRequired =
          artifactSettingsAuditRows_(storeOpen_(), settingsState.lastMutation).length !== 1;
      } catch (auditStatusError) {
        internal._settingsAuditRecoveryRequired = true;
        internal._settingsAuditRecoveryMessage =
          "成果物設定のサーバー監査状態を確認できません。【担当部署に確認が必要】" +
          artifactErrorMessage_(auditStatusError);
      }
    }
    var settingsRecoveryMessages = [
      artifactText_(internal._settingsAuditRecoveryMessage),
      artifactText_(internal._legacySettingsCleanupMessage)
    ].filter(function(message) { return !!message; });
    return {
      success: true,
      settings: artifactPublicSettings_(internal, authorization.role === "admin"),
      outputFolderUrl: artifactFolderUrl_(
        RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
      ),
      templateFolderUrl: artifactFolderUrl_(internal.templateFolderId),
      recoveryRequired:
        internal._settingsAuditRecoveryRequired === true ||
        internal._legacySettingsCleanupRequired === true,
      cleanupRequired: internal._legacySettingsCleanupRequired === true,
      warning: settingsRecoveryMessages.join(" ")
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
  var authorization;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
  } catch (authorizationError) {
    var authorizationMessage = artifactErrorMessage_(authorizationError);
    return { success: false, error: authorizationMessage, message: authorizationMessage };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      success: false,
      error: "別の専用原本準備が実行中です。しばらく待って再実行してください。",
      message: "別の専用原本準備が実行中です。しばらく待って再実行してください。"
    };
  }

  var createdFiles = [];
  var settingsStateCommitted = false;
  try {
    // The role may change while this invocation is waiting for the lock.
    // Re-authorize inside the critical section before mutating Drive.
    authorization = artifactRequireCapability_("artifacts.admin");
    artifactAssertNoUnresolvedCleanupFailures_();
    var current = artifactLoadSettings_();
    artifactAssertLegacySettingsCleanupComplete_(current);
    artifactAssertPinnedReferenceSources_(["ledger", "certificate"]);
    var templateFolder = artifactEnsureTemplateFolder_(current.templateFolderId);
    var ledgerTemplateId = artifactExtractDriveFileId_(current.ledgerTemplateId);
    var certificateTemplateId = artifactExtractDriveFileId_(current.certificateTemplateId);

    if (ledgerTemplateId) {
      artifactAssertTemplateFileSafe_(
        DriveApp.getFileById(ledgerTemplateId),
        templateFolder,
        "発行台帳専用原本"
      );
      artifactAssertLedgerTemplateClean_(ledgerTemplateId, true);
      if (artifactHasDedicatedTemplatePin_("ledger", ledgerTemplateId)) {
        artifactAssertDedicatedTemplatePin_("ledger", ledgerTemplateId);
      } else {
        artifactPinDedicatedTemplate_("ledger", ledgerTemplateId);
      }
    } else {
      var ledgerProvision = artifactProvisionLedgerTemplate_(templateFolder);
      var ledgerFile = ledgerProvision.file;
      if (ledgerProvision.created) createdFiles.push(ledgerFile);
      ledgerTemplateId = ledgerFile.getId();
      artifactPinDedicatedTemplate_("ledger", ledgerTemplateId);
    }

    if (certificateTemplateId) {
      artifactAssertTemplateFileSafe_(
        DriveApp.getFileById(certificateTemplateId),
        templateFolder,
        "修了証明書専用原本"
      );
      artifactAssertCertificateTemplateClean_(certificateTemplateId, true);
      if (artifactHasDedicatedTemplatePin_("certificate", certificateTemplateId)) {
        artifactAssertDedicatedTemplatePin_("certificate", certificateTemplateId);
      } else {
        artifactPinDedicatedTemplate_("certificate", certificateTemplateId);
      }
    } else {
      var certificateProvision = artifactProvisionCertificateTemplate_(templateFolder);
      var certificateFile = certificateProvision.file;
      if (certificateProvision.created) createdFiles.push(certificateFile);
      certificateTemplateId = certificateFile.getId();
      artifactPinDedicatedTemplate_("certificate", certificateTemplateId);
    }

    artifactAssertLedgerTemplateClean_(ledgerTemplateId);
    artifactAssertCertificateTemplateClean_(certificateTemplateId);

    current.templateFolderId = templateFolder.getId();
    current.ledgerTemplateId = ledgerTemplateId;
    current.certificateTemplateId = certificateTemplateId;
    var committedSettingsState = artifactCommitSettingsState_(current, current._bankAccountText, {
      actor: authorization.email,
      expectedVersion: Number(current._settingsVersion || 0),
      idempotencyKey: "template-provision-" +
        artifactHashHex_([
          Number(current._settingsVersion || 0),
          artifactText_(current._settingsStateHash),
          templateFolder.getId(),
          ledgerTemplateId,
          certificateTemplateId
        ]).slice(0, 40),
      reasonCode: "ARTIFACT_TEMPLATE_PROVISION"
    });
    settingsStateCommitted = true;
    artifactClearPublishedDriveAttemptsForResourceIds_(
      [
        templateFolder.getId(),
        ledgerTemplateId,
        certificateTemplateId
      ],
      "専用原本設定"
    );

    return {
      success: true,
      settings: artifactPublicSettings_(artifactSettingsFromState_(committedSettingsState), true),
      templateFolderUrl: artifactFolderUrl_(templateFolder.getId()),
      ledgerTemplateUrl: "https://docs.google.com/spreadsheets/d/" + ledgerTemplateId + "/edit",
      certificateTemplateUrl: "https://docs.google.com/document/d/" + certificateTemplateId + "/edit",
      created: createdFiles.length > 0,
      recoveryRequired: committedSettingsState.recoveryRequired === true,
      cleanupRequired: committedSettingsState.cleanupRequired === true,
      warning: artifactText_(committedSettingsState.recoveryMessage),
      message: createdFiles.length
        ? "無個人情報の修了証明書・発行台帳専用原本を作成しました。"
        : "既存の専用原本は清浄性検査済みです。新しい原本は作成していません。"
    };
  } catch (error) {
    if (!settingsStateCommitted && !(error && error.artifactSettingsOutcomeUncertain)) {
      for (var cleanupIndex = 0; cleanupIndex < createdFiles.length; cleanupIndex++) {
        artifactRemoveDedicatedTemplatePinForFile_(createdFiles[cleanupIndex]);
        artifactRemoveCreatedFilePermanently_(createdFiles[cleanupIndex]);
      }
    }
    var message = artifactErrorMessage_(error);
    if (settingsStateCommitted || (error && error.artifactSettingsOutcomeUncertain)) {
      message =
        "専用原本または設定が確定している可能性があるため、新規ファイルを削除せず保持しました。" +
        "再実行前に設定版・原本ID・Drive権限を確認してください。【担当部署に確認が必要】" + message;
    }
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
  var authorization;
  try {
    authorization = artifactRequireCapability_("artifacts.admin");
  } catch (authorizationError) {
    var authorizationMessage = artifactErrorMessage_(authorizationError);
    return { success: false, error: authorizationMessage, message: authorizationMessage };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { success: false, error: "別の設定更新が実行中です。しばらく待って再実行してください。", message: "別の設定更新が実行中です。しばらく待って再実行してください。" };
  try {
    // Re-check after lock acquisition so a revoked administrator cannot write.
    authorization = artifactRequireCapability_("artifacts.admin");
    input = input || {};
    var current = artifactLoadSettings_();
    artifactAssertLegacySettingsCleanupComplete_(current);
    var outputFolderWasSupplied = input.outputFolderId !== undefined;
    var requestedOutputFolderRaw = artifactText_(
      outputFolderWasSupplied ?
        input.outputFolderId : RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
    );
    var requestedOutputFolderId = artifactExtractDriveId_(requestedOutputFolderRaw);
    if (
      (outputFolderWasSupplied && !requestedOutputFolderRaw) ||
      requestedOutputFolderId !== RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
    ) {
      throw new Error(
        "成果物の保存先は承認済みの「" +
        RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_NAME +
        "」フォルダに固定されています。別フォルダには保存できません。"
      );
    }
    var next = {
      issuerCompany: artifactText_(input.issuerCompany !== undefined ? input.issuerCompany : current.issuerCompany),
      issuerAddress: artifactText_(input.issuerAddress !== undefined ? input.issuerAddress : current.issuerAddress),
      issuerPhone: artifactText_(input.issuerPhone !== undefined ? input.issuerPhone : current.issuerPhone),
      issuerFax: artifactText_(input.issuerFax !== undefined ? input.issuerFax : current.issuerFax),
      issuerEmail: artifactText_(input.issuerEmail !== undefined ? input.issuerEmail : current.issuerEmail),
      invoiceRegistrationNo: artifactText_(input.invoiceRegistrationNo !== undefined ? input.invoiceRegistrationNo : current.invoiceRegistrationNo),
      outputFolderId: RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID,
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
    artifactAssertDedicatedTemplateStorageSafe_(next);

    // 保存時にも個人情報を置ける非公開フォルダであることを確認する。フォルダ自体は変更しない。
    artifactRequireSafeOutputFolder_(next.outputFolderId, [next.ledgerTemplateId, next.certificateTemplateId], next.allowedOutputEmails);
    if (artifactText_(current.outputFolderId) && artifactText_(current.outputFolderId) !== artifactText_(next.outputFolderId)) {
      artifactAssertLegacyOutputFolderSwitchSafe_(current.outputFolderId);
    }

    var nextBankAccountText = artifactText_(current._bankAccountText);
    if (input.clearBankAccount === true) {
      nextBankAccountText = "";
    } else if (artifactText_(input.bankAccountText || input.bankAccount)) {
      nextBankAccountText = artifactText_(input.bankAccountText || input.bankAccount);
    }
    var committedSettingsState = artifactCommitSettingsState_(next, nextBankAccountText, {
      currentSettings: current,
      actor: authorization.email,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      reasonCode: "ARTIFACT_SETTINGS_UPDATE"
    });
    var committedSettings = artifactSettingsFromState_(committedSettingsState);
    return {
      success: true,
      settings: artifactPublicSettings_(committedSettings, true),
      outputFolderUrl: artifactFolderUrl_(
        RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
      ),
      templateFolderUrl: artifactFolderUrl_(committedSettings.templateFolderId),
      recoveryRequired: committedSettingsState.recoveryRequired === true,
      cleanupRequired: committedSettingsState.cleanupRequired === true,
      warning: artifactText_(committedSettingsState.recoveryMessage)
    };
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, error: message, message: message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 内閣府の公式CSVを担当者が取得・確認した後、未収録年を追加する。
 * ネット上の将来日を推測せず、元CSV・確認者・確認日・hashをScript Propertiesへ保存する。
 */
function apiUpdateHolidayCalendarFromOfficialCsv(input) {
  try {
    artifactRequireCapability_("artifacts.admin");
  } catch (authorizationError) {
    var authorizationMessage = artifactErrorMessage_(authorizationError);
    return { success: false, error: authorizationMessage, message: authorizationMessage };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { success: false, error: "別の祝日マスタ更新が実行中です。しばらく待って再実行してください。", message: "別の祝日マスタ更新が実行中です。しばらく待って再実行してください。" };
  }
  try {
    // Re-check after lock acquisition so a revoked administrator cannot write.
    artifactRequireCapability_("artifacts.admin");
    input = input || {};
    var parsed = artifactParseOfficialHolidayCsv_(
      input.csvText || input.csv,
      input.year,
      input.sourceUrl
    );
    var confirmedDate = artifactValidIsoDateOrBlank_(input.confirmedDate);
    var confirmedBy = artifactText_(input.confirmedBy);
    var today = artifactTodayIso_();
    if (!confirmedDate || confirmedDate > today) {
      throw new Error("公式祝日CSVの確認日は、未来日でないyyyy-MM-dd形式の実在日を指定してください。");
    }
    if (!confirmedBy || confirmedBy.length > 100) {
      throw new Error("公式祝日CSVを確認した担当者名を100文字以内で入力してください。");
    }

    var props = PropertiesService.getScriptProperties();
    var stored = artifactLoadImportedHolidayCalendars_();
    var existing = stored.years[String(parsed.year)];
    if (existing && existing.sourceHash !== parsed.sourceHash) {
      if (input.replaceExisting !== true || !artifactText_(input.correctionReason)) {
        throw new Error(parsed.year + "年の祝日マスタは登録済みです。差替えにはreplaceExisting=trueと訂正理由が必要です。");
      }
    }
    var entry = {
      year: parsed.year,
      rows: parsed.rows,
      sourceUrl: parsed.sourceUrl,
      sourceHash: parsed.sourceHash,
      csvHash: parsed.csvHash,
      confirmedDate: confirmedDate,
      confirmedBy: confirmedBy,
      correctionReason: existing && existing.sourceHash !== parsed.sourceHash ? artifactText_(input.correctionReason) : "",
      importedAt: artifactNowText_()
    };
    stored.years[String(parsed.year)] = entry;
    stored.schemaVersion = 1;
    stored.updatedAt = artifactNowText_();
    artifactAssertImportedHolidayCalendarStore_(stored);
    props.setProperty(RENEWAL_ARTIFACT.HOLIDAY_CALENDAR_KEY, JSON.stringify(stored));
    var effective = artifactLoadEffectiveHolidayMaster_();
    return {
      success: true,
      year: parsed.year,
      dates: effective.years[String(parsed.year)].slice(),
      sourceHash: parsed.sourceHash,
      calendarVersion: effective.version,
      replaced: !!(existing && existing.sourceHash !== parsed.sourceHash),
      message: parsed.year + "年の内閣府公式祝日CSVを検証して保存しました。DIPSの追加閉庁日・起算方法は別途担当部署確認が必要です。"
    };
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, error: message, message: message };
  } finally {
    lock.releaseLock();
  }
}

/** 祝日マスタの登録状況だけを返す。CSV本文や確認者名は返さない。 */
function apiGetArtifactHolidayCalendarStatus() {
  try {
    artifactRequireCapability_("artifacts.read");
    var master = artifactLoadEffectiveHolidayMaster_();
    var stored = artifactLoadImportedHolidayCalendars_();
    return {
      success: true,
      version: master.version,
      years: Object.keys(master.years).sort().map(function(year) {
        var imported = stored.years[year];
        return {
          year: Number(year),
          count: master.years[year].length,
          dates: master.years[year].map(function(monthDay) { return year + "-" + monthDay; }),
          source: imported ? "内閣府公式CSV手動確認" : "コード固定公式マスタ",
          sourceHash: imported ? artifactText_(imported.sourceHash) : "",
          confirmedDate: imported ? artifactText_(imported.confirmedDate) : ""
        };
      })
    };
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return { success: false, error: message, message: message };
  }
}

/**
 * 既存台帳・DIPS番号を読み取り専用で照合する。設定変更・採番予約・Drive書込みは行わない。
 * 結果hashを保管し、担当部署承認後に既存の設定保存APIへ値を転記する。
 */
function apiDryRunNumberingMigration(input) {
  try {
    artifactRequireCapability_("artifacts.admin");
    input = input || {};
    var settings = artifactLoadSettings_();
    var registryRows = artifactReadAllRegistryRows_(settings.allowedOutputEmails);
    return artifactBuildNumberingMigrationDryRun_(input, registryRows, artifactTodayIso_());
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return {
      success: false, ready: false, errors: [message], warnings: [],
      error: message, message: message
    };
  }
}

/** 作成前検査。Driveへの書込みや採番の予約は行わない。 */
/**
 * Public artifact APIs never accept a browser record as the source of truth.
 * The caller must prove which canonical revision it reviewed, and the server
 * re-reads that exact revision before preflight/generation.
 */
function artifactCanonicalRequestError_(message, canonical) {
  var error = new Error(message);
  if (canonical) error.artifactCanonical = canonical;
  return error;
}

function artifactLoadCanonicalArtifactRequest_(request) {
  request = request || {};
  if (typeof storeGetRecord_ !== "function") {
    throw new Error("共有正本を読み込めないため、成果物作成を停止しました。");
  }
  var recordId = artifactText_(request.recordId);
  if (!recordId) throw new Error("recordIdが必要です。対象者一覧を再読込してください。");
  if (typeof request.expectedVersion !== "number" || !Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
    throw new Error("expectedVersionが必要です。対象者一覧を再読込してください。");
  }
  var expectedPayloadHash = artifactText_(request.expectedPayloadHash).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedPayloadHash)) {
    throw new Error("expectedPayloadHashが必要です。対象者一覧を再読込してください。");
  }

  var canonical = storeGetRecord_(recordId, { includeDeleted: true });
  if (!canonical) throw new Error("共有正本に対象者が見つかりません。");
  if (canonical.deleted) {
    throw artifactCanonicalRequestError_("削除済みの対象者から成果物は作成できません。", canonical);
  }
  if (Number(canonical.version) !== request.expectedVersion) {
    throw artifactCanonicalRequestError_(
      "対象者データが他の担当者により更新されています。再読込してください。",
      canonical
    );
  }
  if (artifactText_(canonical.payloadHash).toLowerCase() !== expectedPayloadHash) {
    throw artifactCanonicalRequestError_(
      "対象者データの内容hashが一致しません。再読込してください。",
      canonical
    );
  }
  if (!canonical.record || typeof canonical.record !== "object" || Array.isArray(canonical.record)) {
    throw artifactCanonicalRequestError_("共有正本の対象者データが不正です。", canonical);
  }

  var clientRecord = request.record !== undefined ? request.record : request.payload;
  if (
    clientRecord !== undefined &&
    artifactCanonicalJson_(clientRecord) !== artifactCanonicalJson_(canonical.record)
  ) {
    throw artifactCanonicalRequestError_(
      "画面から送信された対象者データが共有正本と異なるため停止しました。再読込してください。",
      canonical
    );
  }

  var kinds = artifactNormalizeKinds_(request.kinds || request.types || request.artifactTypes);
  var record = artifactNormalizeRecord_(canonical.record);
  record.id = recordId;
  record.recordId = recordId;
  var financeInvoice = null;
  if (kinds.indexOf("billing") >= 0) {
    var financeInvoiceId = artifactText_(request.financeInvoiceId);
    if (!financeInvoiceId) {
      throw artifactCanonicalRequestError_(
        "請求帳票には発行済み正式請求のfinanceInvoiceIdが必要です。",
        canonical
      );
    }
    try {
      financeInvoice = artifactLoadFormalInvoiceForArtifact_(financeInvoiceId, recordId);
    } catch (financeInvoiceError) {
      financeInvoiceError.artifactCanonical = canonical;
      throw financeInvoiceError;
    }
    artifactApplyFormalInvoiceToRecord_(record, financeInvoice);
  }
  return {
    canonical: canonical,
    financeInvoice: financeInvoice,
    request: {
      record: record,
      kinds: kinds,
      financeInvoiceId: financeInvoice ? financeInvoice.id : ""
    }
  };
}

function artifactLoadFormalInvoiceForArtifact_(financeInvoiceId, recordId) {
  var envelope;
  if (typeof financeStoreGetState_ === "function") {
    envelope = financeStoreGetState_();
  } else if (
    typeof financeStoreReadLatestSnapshot_ === "function" &&
    typeof storeOpen_ === "function"
  ) {
    var snapshot = financeStoreReadLatestSnapshot_(storeOpen_());
    envelope = {
      configured: true,
      state: snapshot.state,
      stateHash: snapshot.stateHash,
      recoveryNeeded: snapshot.recoveryNeeded === true
    };
  } else {
    throw new Error("正式会計台帳が利用できないため請求帳票を作成できません。");
  }
  if (!envelope || envelope.configured !== true || !envelope.state) {
    throw new Error("正式会計台帳が未設定のため請求帳票を作成できません。");
  }
  if (envelope.recoveryNeeded === true) {
    throw new Error("正式会計台帳が復旧待ちのため請求帳票を作成できません。会計台帳を復旧してください。");
  }
  return artifactSelectFormalInvoiceForArtifact_(
    envelope.state,
    financeInvoiceId,
    recordId,
    envelope.stateHash
  );
}

/**
 * Convert only an immutable ISSUED finance invoice that the current billing
 * layout can reproduce exactly. Unsupported combinations stop fail-closed.
 */
function artifactValidateFormalBillingSnapshot_(input) {
  var fields = [
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
  var requiredValues = {
    recipientName: true,
    recipientHonorific: true,
    recipientAddress: true,
    issuerCompany: true,
    issuerAddress: true,
    issuerPhone: true,
    invoiceRegistrationNo: true,
    bankAccountText: true
  };
  var maximumLengths = {
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
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("発行済み正式請求に、発行時点の請求先・発行者・振込先スナップショットがありません。旧データへ推測補完せず作成を停止しました。");
  }
  var allowed = {};
  fields.forEach(function (field) { allowed[field] = true; });
  Object.keys(input).forEach(function (field) {
    if (!allowed[field]) throw new Error("正式請求スナップショットに未対応の項目があります: " + field);
  });
  var result = {};
  fields.forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      throw new Error("正式請求スナップショットの項目が不足しています: " + field);
    }
    var text = String(input[field] === undefined || input[field] === null ? "" : input[field]);
    if (typeof text.normalize === "function") text = text.normalize("NFKC");
    text = text.replace(/\r\n?/g, "\n").trim();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      throw new Error("正式請求スナップショットに制御文字は使用できません: " + field);
    }
    if (/(^|\n)[ \t\u3000]*[=+\-@]/.test(text)) {
      throw new Error("正式請求スナップショットに数式として解釈される先頭文字は使用できません: " + field);
    }
    if (text.length > maximumLengths[field]) {
      throw new Error("正式請求スナップショットの文字数が上限を超えています: " + field);
    }
    if (requiredValues[field] && !text) {
      throw new Error("正式請求スナップショットの必須値が空です: " + field);
    }
    result[field] = text;
  });
  if (["御中", "様"].indexOf(result.recipientHonorific) < 0) {
    throw new Error("正式請求スナップショットの敬称は「御中」または「様」にしてください。");
  }
  if (!/^T\d{13}$/.test(result.invoiceRegistrationNo)) {
    throw new Error("正式請求スナップショットの登録番号はTと13桁の数字にしてください。");
  }
  if (result.issuerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.issuerEmail)) {
    throw new Error("正式請求スナップショットの発行者メールアドレスが不正です。");
  }
  if (artifactCanonicalJson_(result) !== artifactCanonicalJson_(input)) {
    throw new Error("正式請求スナップショットが正規化済みの形式ではありません。");
  }
  return result;
}

/**
 * Build the immutable finance billing snapshot only from the canonical shared
 * record and server-side artifact settings.  Browser-supplied issuer/payee
 * values are deliberately excluded from this trust boundary.
 */
function artifactBuildFormalBillingSnapshotForFinance_(spreadsheet, customerId) {
  var normalizedCustomerId = artifactText_(customerId);
  if (!spreadsheet || !normalizedCustomerId || typeof storeReadRecords_ !== "function") {
    throw new Error("正式請求スナップショットの共有正本を確認できないため処理を停止しました。");
  }
  var matches = storeReadRecords_(spreadsheet).filter(function (row) {
    return artifactText_(row && row.recordId) === normalizedCustomerId;
  });
  if (matches.length !== 1 || matches[0].deleted === true) {
    throw new Error("正式請求の対象者が共有正本に一意な有効レコードとして存在しません。");
  }
  var payload = matches[0].payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("正式請求の対象者データが不正なため処理を停止しました。");
  }
  var settings = artifactLoadSettings_();
  return artifactValidateFormalBillingSnapshot_({
    recipientName: artifactText_(payload.billingRecipientName),
    recipientHonorific: artifactText_(payload.billingHonorific),
    recipientAddress: artifactText_(payload.billingAddress),
    issuerCompany: artifactText_(settings.issuerCompany),
    issuerAddress: artifactText_(settings.issuerAddress),
    issuerPhone: artifactText_(settings.issuerPhone),
    issuerFax: artifactText_(settings.issuerFax),
    issuerEmail: artifactText_(settings.issuerEmail),
    invoiceRegistrationNo: artifactText_(settings.invoiceRegistrationNo),
    bankAccountText: artifactText_(settings._bankAccountText)
  });
}

function artifactSelectFormalInvoiceForArtifact_(state, financeInvoiceId, recordId, stateHash) {
  state = state || {};
  var invoices = Array.isArray(state.invoices) ? state.invoices : [];
  var invoice = null;
  for (var i = 0; i < invoices.length; i++) {
    if (artifactText_(invoices[i] && invoices[i].id) === artifactText_(financeInvoiceId)) {
      invoice = invoices[i];
      break;
    }
  }
  if (!invoice) throw new Error("指定した正式請求が見つかりません。");
  if (artifactText_(invoice.status) !== "ISSUED") {
    throw new Error("下書き請求から正式な請求帳票は作成できません。会計で発行してください。");
  }
  if (artifactText_(invoice.customerId) !== artifactText_(recordId)) {
    throw new Error("正式請求の対象者IDが共有正本のrecordIdと一致しません。");
  }
  if (!artifactText_(invoice.immutableKey)) {
    throw new Error("正式請求の改変防止キーがないため作成を停止しました。");
  }
  if (artifactText_(invoice.pricingMode) !== "EXCLUSIVE") {
    throw new Error("税込単価の正式請求は現在の税抜表示レイアウトで正確に表現できません。");
  }
  if (["FLOOR", "CEIL", "HALF_UP"].indexOf(artifactText_(invoice.taxRounding)) < 0) {
    throw new Error("正式請求の端数処理を現在の帳票で表現できません。");
  }
  if (
    !artifactText_(invoice.invoiceNo) ||
    !artifactValidIsoDateOrBlank_(invoice.invoiceDate) ||
    !artifactValidIsoDateOrBlank_(invoice.accountingDate) ||
    !artifactValidIsoDateOrBlank_(invoice.dueDate)
  ) {
    throw new Error("正式請求の番号・請求日・取引日・支払期限が不完全です。");
  }
  var billingSnapshot = artifactValidateFormalBillingSnapshot_(invoice.billingSnapshot);

  var groups = Array.isArray(invoice.taxGroups) ? invoice.taxGroups : [];
  if (groups.length !== 1) {
    throw new Error("複数税率の正式請求は現在の単一税率帳票で正確に表現できません。");
  }
  var group = groups[0] || {};
  var category = artifactText_(group.taxCategory);
  if (["TAXABLE_10", "TAXABLE_8"].indexOf(category) < 0) {
    throw new Error("非課税・不課税・対象外の区分は現在の帳票で明確に表現できません。");
  }
  var expectedRateBps = category === "TAXABLE_10" ? 1000 : 800;
  if (Number(group.rateBps) !== expectedRateBps) {
    throw new Error("正式請求の税区分と税率が一致しません。");
  }

  var allLines = Array.isArray(state.invoice_lines) ? state.invoice_lines : [];
  var lines = allLines.filter(function (line) {
    return artifactText_(line && line.invoiceId) === artifactText_(invoice.id);
  });
  if (!lines.length) throw new Error("正式請求の明細がありません。");
  if (lines.length > 10) throw new Error("正式請求の明細が10行を超え、現在の帳票に収まりません。");

  var lineTotal = 0;
  var normalizedLines = [];
  for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    var line = lines[lineIndex] || {};
    var quantity = Number(line.quantity);
    var unitAmount = Number(line.unitAmount);
    var amount = Number(line.amount);
    var lineType = artifactText_(line.lineType);
    if (
      !artifactText_(line.id) || !artifactText_(line.description) ||
      !Number.isInteger(quantity) || quantity < 1 ||
      !Number.isSafeInteger(unitAmount) || unitAmount < 0 ||
      !Number.isSafeInteger(amount) ||
      ["CHARGE", "DISCOUNT"].indexOf(lineType) < 0 ||
      artifactText_(line.taxCategory) !== category
    ) {
      throw new Error("正式請求の明細を現在の帳票で正確に表現できません。");
    }
    var expectedAmount = quantity * unitAmount * (lineType === "DISCOUNT" ? -1 : 1);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== amount) {
      throw new Error("正式請求の明細金額と単価・数量が一致しません。");
    }
    lineTotal += amount;
    normalizedLines.push({
      id: artifactText_(line.id),
      description: artifactText_(line.description),
      quantity: quantity,
      unitAmount: unitAmount,
      amount: amount,
      lineType: lineType,
      taxCategory: category
    });
  }

  var totalExTax = Number(invoice.totalExTax);
  var totalTax = Number(invoice.totalTax);
  var totalInclTax = Number(invoice.totalInclTax);
  if (
    !Number.isSafeInteger(totalExTax) || totalExTax < 0 ||
    !Number.isSafeInteger(totalTax) || totalTax < 0 ||
    !Number.isSafeInteger(totalInclTax) || totalInclTax < 0 ||
    lineTotal !== totalExTax ||
    Number(group.baseExTax) !== totalExTax ||
    Number(group.tax) !== totalTax ||
    Number(group.totalInclTax) !== totalInclTax ||
    totalExTax + totalTax !== totalInclTax
  ) {
    throw new Error("正式請求の税抜額・消費税・税込額または明細合計が一致しません。");
  }
  var effectiveBilled = artifactFormalInvoiceEffectiveBilled_(state, invoice);

  return {
    id: artifactText_(invoice.id),
    invoiceNo: artifactText_(invoice.invoiceNo),
    customerId: artifactText_(invoice.customerId),
    status: "ISSUED",
    immutableKey: artifactText_(invoice.immutableKey),
    stateHash: artifactText_(stateHash),
    invoiceDate: artifactText_(invoice.invoiceDate),
    accountingDate: artifactText_(invoice.accountingDate),
    dueDate: artifactText_(invoice.dueDate),
    subject: artifactText_(invoice.subject),
    pricingMode: "EXCLUSIVE",
    taxRounding: artifactText_(invoice.taxRounding),
    taxCategory: category,
    taxRate: expectedRateBps / 100,
    totalExTax: totalExTax,
    totalTax: totalTax,
    totalInclTax: totalInclTax,
    effectiveBilled: effectiveBilled,
    billingSnapshot: artifactClone_(billingSnapshot),
    lines: normalizedLines
  };
}

/**
 * 発行済み請求そのものは不変なので、取消・取消の反対取引を追記した現在の
 * 有効請求額は会計正本のBILLING_REDUCTIONだけから決定する。
 */
function artifactFormalInvoiceEffectiveBilled_(state, invoice) {
  var total = Number(invoice && invoice.totalInclTax);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("正式請求の税込額が不正なため有効請求額を確認できません。");
  }
  var credits = Array.isArray(state && state.credit_notes)
    ? state.credit_notes
    : [];
  for (var i = 0; i < credits.length; i++) {
    var credit = credits[i] || {};
    if (
      artifactText_(credit.invoiceId) !== artifactText_(invoice && invoice.id) ||
      artifactText_(credit.effect) !== "BILLING_REDUCTION"
    ) continue;
    var direction = Number(credit.direction);
    var amount = Number(credit.totalInclTax);
    if (
      [1, -1].indexOf(direction) < 0 ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(total + direction * amount)
    ) {
      throw new Error("正式請求の取消・反対取引が不正なため有効請求額を確認できません。");
    }
    total += direction * amount;
  }
  return total;
}

function artifactApplyFormalInvoiceToRecord_(record, formalInvoice) {
  record = record || {};
  formalInvoice = formalInvoice || {};
  var feeExTax = 0;
  var discountExTax = 0;
  (formalInvoice.lines || []).forEach(function (line) {
    if (line.lineType === "DISCOUNT") discountExTax += Math.abs(Number(line.amount));
    else feeExTax += Number(line.amount);
  });
  record.financeInvoiceId = formalInvoice.id;
  record.financeInvoiceImmutableKey = formalInvoice.immutableKey;
  record._formalFinanceInvoice = true;
  record._formalFinanceStateHash = formalInvoice.stateHash;
  record._formalFinanceEffectiveBilled = formalInvoice.effectiveBilled;
  record.formalBillingLines = artifactClone_(formalInvoice.lines);
  record.formalBillingTaxCategory = formalInvoice.taxCategory;
  record.formalBillingTotalExTax = formalInvoice.totalExTax;
  record.formalBillingTotalTax = formalInvoice.totalTax;
  record.formalBillingTotalInclTax = formalInvoice.totalInclTax;
  record.formalBillingSnapshot = artifactClone_(
    artifactValidateFormalBillingSnapshot_(formalInvoice.billingSnapshot)
  );
  record.billingRecipientName = record.formalBillingSnapshot.recipientName;
  record.billingHonorific = record.formalBillingSnapshot.recipientHonorific;
  record.billingAddress = record.formalBillingSnapshot.recipientAddress;
  record._formalBillingSubject = artifactText_(formalInvoice.subject) || "更新講習";
  record.invoiceNo = formalInvoice.invoiceNo;
  record.invoiceStatus = "発行済";
  record.invoiceDate = formalInvoice.invoiceDate;
  record.accountingDate = formalInvoice.accountingDate;
  record.paymentDueDate = formalInvoice.dueDate;
  record.feeExTax = feeExTax;
  record.discountExTax = discountExTax;
  record.taxRate = formalInvoice.taxRate;
  record.taxRounding = {
    FLOOR: "切捨て",
    CEIL: "切上げ",
    HALF_UP: "四捨五入"
  }[formalInvoice.taxRounding];
  return record;
}

function artifactBillingRenderInputs_(record, settings) {
  record = record || {};
  settings = settings || {};
  if (record._formalFinanceInvoice === true) {
    var snapshot = artifactValidateFormalBillingSnapshot_(record.formalBillingSnapshot);
    return {
      recipientName: snapshot.recipientName,
      recipientHonorific: snapshot.recipientHonorific,
      recipientAddress: snapshot.recipientAddress,
      subject: artifactText_(record._formalBillingSubject) || "更新講習",
      issuerCompany: snapshot.issuerCompany,
      issuerAddress: snapshot.issuerAddress,
      issuerPhone: snapshot.issuerPhone,
      issuerFax: snapshot.issuerFax,
      issuerEmail: snapshot.issuerEmail,
      invoiceRegistrationNo: snapshot.invoiceRegistrationNo,
      bankAccountText: snapshot.bankAccountText
    };
  }
  return {
    recipientName: artifactText_(record.billingRecipientName || record.targetName),
    recipientHonorific: artifactText_(record.billingHonorific) || (record.companyName ? "御中" : "様"),
    recipientAddress: artifactText_(record.billingAddress),
    subject: artifactText_(record.serviceCategory) || "更新講習",
    issuerCompany: artifactText_(settings.issuerCompany),
    issuerAddress: artifactText_(settings.issuerAddress),
    issuerPhone: artifactText_(settings.issuerPhone),
    issuerFax: artifactText_(settings.issuerFax),
    issuerEmail: artifactText_(settings.issuerEmail),
    invoiceRegistrationNo: artifactText_(settings.invoiceRegistrationNo),
    bankAccountText: artifactText_(settings._bankAccountText)
  };
}

function artifactFormalInvoiceRecordUpdates_(record) {
  if (!record || record._formalFinanceInvoice !== true) return {};
  var fields = [
    "financeInvoiceId", "financeInvoiceImmutableKey",
    "invoiceNo", "invoiceStatus", "invoiceDate", "accountingDate", "paymentDueDate",
    "feeExTax", "discountExTax", "taxRate", "taxRounding"
  ];
  var result = {};
  fields.forEach(function (field) {
    if (record[field] !== undefined) result[field] = record[field];
  });
  return result;
}

function artifactFormalInvoiceMetadata_(record) {
  if (!record || record._formalFinanceInvoice !== true) return null;
  return {
    financeInvoiceId: artifactText_(record.financeInvoiceId),
    immutableKey: artifactText_(record.financeInvoiceImmutableKey),
    // 会計全体stateHashと現在有効額は作成時の監査証跡であり、
    // 同一請求書成果物のpayload identityには含めない。
    financeStateHash: artifactText_(record._formalFinanceStateHash),
    effectiveBilledAtRequest: Number(record._formalFinanceEffectiveBilled),
    invoiceNo: artifactText_(record.invoiceNo),
    invoiceDate: artifactText_(record.invoiceDate),
    accountingDate: artifactText_(record.accountingDate),
    paymentDueDate: artifactText_(record.paymentDueDate),
    taxCategory: artifactText_(record.formalBillingTaxCategory),
    totalExTax: Number(record.formalBillingTotalExTax),
    totalTax: Number(record.formalBillingTotalTax),
    totalInclTax: Number(record.formalBillingTotalInclTax),
    subject: artifactText_(record._formalBillingSubject),
    billingSnapshotHash: artifactHashHex_(record.formalBillingSnapshot || {}),
    linesHash: artifactHashHex_(record.formalBillingLines || [])
  };
}

function artifactAssertFormalInvoiceNewGenerationAllowed_(record) {
  if (!record || record._formalFinanceInvoice !== true) return true;
  var effectiveBilled = Number(record._formalFinanceEffectiveBilled);
  if (!Number.isSafeInteger(effectiveBilled)) {
    throw new Error("正式請求の有効請求額を確認できないため、新しい請求書の作成を停止しました。");
  }
  if (effectiveBilled <= 0) {
    throw new Error(
      "全額取消済みの正式請求（有効請求額0円以下）から通常請求書を新規生成できません。" +
      "既存成果物の履歴は保持されます。訂正版として発行した別の正式請求を選択してください。"
    );
  }
  return true;
}

function artifactCanonicalPayloadWithUpdates_(canonical, updates) {
  var payload = artifactClone_(canonical && canonical.record);
  payload.id = artifactText_(canonical && canonical.recordId);
  Object.keys(updates || {}).forEach(function (key) {
    if (updates[key] !== undefined) payload[key] = updates[key];
  });
  return payload;
}

function artifactPersistCanonicalReservationsUnlocked_(
  spreadsheet, actor, role, canonical, updates, options
) {
  options = options || {};
  var payload = artifactCanonicalPayloadWithUpdates_(canonical, updates);
  if (artifactCanonicalJson_(payload) === artifactCanonicalJson_(canonical.record)) return canonical;
  if (typeof storeUpsertRecordUnlocked_ !== "function") {
    throw new Error("共有正本へ採番予約を保存できないため成果物作成を停止しました。");
  }
  return storeUpsertRecordUnlocked_(
    spreadsheet,
    actor,
    role,
    {
      recordId: canonical.recordId,
      record: payload,
      expectedVersion: canonical.version,
      reasonCode: "ARTIFACT_RESERVATION"
    },
    {
      migration: false,
      allowDeletedRestore: false,
      formalFinanceMirror: options.formalFinanceMirror === true
    }
  );
}

/**
 * Reserved numbers live in the canonical store even if Drive generation fails.
 * Feed those reservations into allocation so another record cannot reuse them.
 */
function artifactCanonicalNumberReservationRows_(spreadsheet, currentRecordId) {
  if (typeof storeReadRecords_ !== "function") {
    throw new Error("共有正本の採番予約を検査できないため成果物作成を停止しました。");
  }
  return storeReadRecords_(spreadsheet).filter(function (row) {
    // Soft deletion never releases a legally/audit-relevant number.
    return artifactText_(row.recordId) !== artifactText_(currentRecordId);
  }).map(function (row) {
    var payload = row.payload || {};
    return {
      recordId: artifactText_(row.recordId),
      status: "canonical-reservation",
      documentNumbers: [
        artifactText_(payload.certificateNo),
        artifactText_(payload.dipsApplicantId),
        artifactText_(payload.quoteNo),
        artifactText_(payload.invoiceNo)
      ].join(";"),
      metadataJson: "",
      fileName: ""
    };
  });
}

function artifactAttachCanonicalResult_(result, canonical) {
  result = result || {};
  if (!canonical) return result;
  result.canonical = {
    recordId: canonical.recordId,
    managementId: canonical.managementId || "",
    invoiceNo: canonical.invoiceNo || "",
    version: canonical.version,
    payloadHash: canonical.payloadHash,
    deleted: canonical.deleted === true,
    createdAt: canonical.createdAt || "",
    updatedAt: canonical.updatedAt || "",
    record: artifactClone_(canonical.record)
  };
  result.recordId = canonical.recordId;
  result.recordVersion = canonical.version;
  result.recordPayloadHash = canonical.payloadHash;
  return result;
}

function artifactLatestCanonicalAfterFailure_(recordId, fallback) {
  try {
    if (typeof storeGetRecord_ === "function") {
      return storeGetRecord_(recordId, { includeDeleted: true }) || fallback || null;
    }
  } catch (ignoredReadbackError) {}
  return fallback || null;
}

function apiPreflightArtifacts(request) {
  try {
    var kinds = artifactNormalizeKinds_((request || {}).kinds || (request || {}).types || (request || {}).artifactTypes);
    var hasNonBillingKind = kinds.some(function (kind) { return kind !== "billing"; });
    if (!kinds.length || hasNonBillingKind) artifactRequireCapability_("artifacts.write");
    if (kinds.indexOf("billing") >= 0) artifactRequireCapability_("artifacts.billing");
    var canonicalRequest = artifactLoadCanonicalArtifactRequest_(request || {});
    return artifactAttachCanonicalResult_(
      artifactBuildPreflight_(canonicalRequest.request),
      canonicalRequest.canonical
    );
  } catch (error) {
    var message = artifactErrorMessage_(error);
    return artifactAttachCanonicalResult_(
      { success: false, ready: false, items: [], errors: [message], warnings: [], error: message, message: message },
      error && error.artifactCanonical
    );
  }
}

/**
 * 検査済み成果物を作成する。テンプレート原本は読み取りのみで、必ずコピーへ記入する。
 * 同一 recordId・種別・payloadHash は既存成果物を返し、内容変更時だけ version を進める。
 */
function apiCreateArtifacts(request) {
  request = request || {};
  var authorizationContext = null;
  var canonicalRequest = null;
  var canonicalAfterReservation = null;
  try {
    var requestedKinds = artifactNormalizeKinds_(request.kinds || request.types || request.artifactTypes);
    var hasRequestedNonBillingKind = requestedKinds.some(function (kind) { return kind !== "billing"; });
    if (!requestedKinds.length || hasRequestedNonBillingKind) {
      authorizationContext = artifactRequireCapability_("artifacts.write");
    }
    if (requestedKinds.indexOf("billing") >= 0) {
      var billingAuthorizationContext = artifactRequireCapability_("artifacts.billing");
      if (!authorizationContext) authorizationContext = billingAuthorizationContext;
    }
    canonicalRequest = artifactLoadCanonicalArtifactRequest_(request);
  } catch (authorizationError) {
    var authorizationMessage = artifactErrorMessage_(authorizationError);
    return artifactAttachCanonicalResult_(
      { success: false, results: [], recordUpdates: {}, errors: [authorizationMessage], error: authorizationMessage, message: authorizationMessage },
      authorizationError && authorizationError.artifactCanonical
    );
  }
  var preflight = artifactBuildPreflight_(canonicalRequest.request);
  if (!preflight.success || !preflight.ready) {
    return artifactAttachCanonicalResult_({
      success: false,
      results: [],
      recordUpdates: {},
      errors: preflight.errors && preflight.errors.length ? preflight.errors : ["作成前検査に合格していません。"],
      preflight: preflight
    }, canonicalRequest.canonical);
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return artifactAttachCanonicalResult_(
      { success: false, results: [], recordUpdates: {}, errors: ["別の成果物作成が実行中です。しばらく待って再実行してください。"], message: "別の成果物作成が実行中です。しばらく待って再実行してください。" },
      canonicalRequest.canonical
    );
  }

  try {
    // Lock取得後に正本・権限・正式請求を再読込し、採番予約とDrive生成を直列化する。
    authorizationContext = null;
    if (!requestedKinds.length || hasRequestedNonBillingKind) {
      authorizationContext = artifactRequireCapability_("artifacts.write");
    }
    if (requestedKinds.indexOf("billing") >= 0) {
      var lockedBillingAuthorizationContext = artifactRequireCapability_("artifacts.billing");
      if (!authorizationContext) authorizationContext = lockedBillingAuthorizationContext;
    }
    artifactAssertNoUnresolvedCleanupFailures_();
    var lockedCanonicalRequest = artifactLoadCanonicalArtifactRequest_(request);
    var lockedPreflight = artifactBuildPreflight_(lockedCanonicalRequest.request);
    if (!lockedPreflight.ready) {
      return artifactAttachCanonicalResult_(
        { success: false, results: [], recordUpdates: {}, errors: lockedPreflight.errors || ["作成前検査に合格していません。"] },
        lockedCanonicalRequest.canonical
      );
    }

    var settings = artifactLoadSettings_();
    var record = artifactNormalizeRecord_(lockedCanonicalRequest.request.record);
    var kinds = artifactNormalizeKinds_(lockedCanonicalRequest.request.kinds);
    var effectiveHolidayMaster = kinds.indexOf("dipsCsv") >= 0
      ? artifactLoadEffectiveHolidayMaster_()
      : RENEWAL_JAPAN_HOLIDAYS;
    // 案内日程は事業者設定に保存済みのマスタだけを正本とし、request側の未保存値は使用しない。
    var schedules = artifactNormalizeSchedules_(settings.schedules);
    var templateFingerprints = {};
    for (var fingerprintIndex = 0; fingerprintIndex < kinds.length; fingerprintIndex++) {
      templateFingerprints[kinds[fingerprintIndex]] = artifactTemplateFingerprint_(kinds[fingerprintIndex], settings);
    }
    var autoRoot = artifactEnsureAutoRoot_(settings.outputFolderId, settings.allowedOutputEmails);
    var registry = artifactEnsureRegistry_(autoRoot, settings.allowedOutputEmails);
    var registryRows = artifactReadAllRegistryRows_(settings.allowedOutputEmails);
    var canonicalSpreadsheet = storeOpen_();
    var numberingRows = registryRows.concat(
      artifactCanonicalNumberReservationRows_(canonicalSpreadsheet, record.recordId)
    );
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
          numberingRows, autoRoot, certificateIssuedDate, settings.certificateSequenceSeed, settings
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
        record.dipsApplicantId = artifactNextDipsApplicantId_(numberingRows, courseDate, settings.dipsSequenceSeed);
      }
      recordUpdates.dipsApplicantId = record.dipsApplicantId;
    }
    if (kinds.indexOf("billing") >= 0) {
      artifactPrepareBillingIdentity_(record, numberingRows, recordUpdates);
      artifactApplyMissing_(recordUpdates, artifactFormalInvoiceRecordUpdates_(record));
    }
    artifactAssertEffectiveNumberRules_(record, kinds);
    artifactAssertNumberUniqueness_(record, kinds, numberingRows);

    // Reserve all derived dates/numbers in the canonical store before creating
    // any output.  This uses the already-held script lock (no nested lock).
    canonicalAfterReservation = artifactPersistCanonicalReservationsUnlocked_(
      canonicalSpreadsheet,
      authorizationContext.email,
      authorizationContext.role,
      lockedCanonicalRequest.canonical,
      recordUpdates,
      { formalFinanceMirror: !!lockedCanonicalRequest.financeInvoice }
    );
    var reservedRecord = artifactNormalizeRecord_(canonicalAfterReservation.record);
    reservedRecord.id = canonicalAfterReservation.recordId;
    reservedRecord.recordId = canonicalAfterReservation.recordId;
    if (lockedCanonicalRequest.financeInvoice) {
      artifactApplyFormalInvoiceToRecord_(reservedRecord, lockedCanonicalRequest.financeInvoice);
    }
    record = reservedRecord;
    var reservedPreflight = artifactBuildPreflight_({ record: record, kinds: kinds });
    if (!reservedPreflight.ready) {
      throw new Error(
        (reservedPreflight.errors || []).concat(
          (reservedPreflight.items || []).reduce(function (all, item) {
            return all.concat(item.errors || []);
          }, [])
        ).join(" ") || "採番予約後の作成前検査に合格していません。"
      );
    }

    var recordFolder = null;
    var results = [];
    var errors = [];
    for (var i = 0; i < kinds.length; i++) {
      var kind = kinds[i];
      var label = RENEWAL_ARTIFACT.LABELS[kind];
      var targetFolder = autoRoot;
      var dipsSubmissionDeadline = kind === "dipsCsv"
        ? artifactDipsSubmissionDeadline_(record.certificateIssuedDate, settings.dipsAdditionalClosedDates, effectiveHolidayMaster)
        : "";
      var payloadHash = artifactHashHex_({
        schemaVersion: RENEWAL_ARTIFACT.SCHEMA_VERSION,
        kind: kind,
        templateFingerprint: templateFingerprints[kind],
        record: artifactRecordForHash_(kind, record),
        settings: artifactSettingsForHash_(kind, settings, effectiveHolidayMaster, record),
        schedules: kind === "guidance" ? schedules : [],
        outputFolderId: settings.outputFolderId
      });
      var version = 0;
      var created = null;
      var priorLedgerMark = null;
      var registryCommitted = false;
      var preparedRegistryRow = null;
      var preparedCreatedThisAttempt = false;
      var baseRegistryMetadata = null;
      var createdByCurrentAttempt = false;
      var recoveredPrepared = false;
      try {
        if (kind !== "ledger") {
          if (!recordFolder) recordFolder = artifactEnsureRecordFolder_(autoRoot, record, settings.allowedOutputEmails);
          targetFolder = recordFolder;
          artifactAssertPriorOutputVersions_(
            registryRows, record.recordId, kind, targetFolder, settings.allowedOutputEmails
          );
        }
        preparedRegistryRow = artifactFindPrepared_(registryRows, record.recordId, kind);
        if (preparedRegistryRow && artifactText_(preparedRegistryRow.hash) !== payloadHash) {
          throw new Error(
            "前回中断した作成予約と現在の入力内容が一致しません。別versionを自動作成せず停止しました。" +
            "【担当部署に確認が必要】"
          );
        }
        var existing = preparedRegistryRow
          ? null
          : artifactFindExisting_(registryRows, record.recordId, kind, payloadHash);
        if (existing) {
          var existingArtifactFile;
          try { existingArtifactFile = DriveApp.getFileById(existing.fileId); }
          catch (existingFileError) { throw new Error("作成済み成果物を確認できません。ファイルを復元し、権限を修復してから再実行してください。"); }
          artifactAssertReusableDriveItem_(existingArtifactFile, targetFolder.getId(), label + "の既存成果物", settings.allowedOutputEmails);
          var verifiedExisting = null;
          if (kind === "ledger") artifactAssertExistingLedgerRow_(existing, record.recordId, payloadHash, autoRoot, settings);
          else verifiedExisting = artifactAssertExistingOutputFile_(existingArtifactFile, existing, record.recordId, kind, payloadHash, targetFolder);
          artifactClearPublishedOutputDriveAttempt_(
            kind,
            record,
            payloadHash,
            Number(existing.version),
            settings,
            autoRoot,
            targetFolder,
            existing.fileId
          );
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
        if (kind === "billing") {
          // 同一payloadの作成済み成果物は上で検証して参照できる。一方、
          // 全額取消後に新しい通常請求書ファイルを作ることは認めない。
          artifactAssertFormalInvoiceNewGenerationAllowed_(record);
        }
        version = preparedRegistryRow
          ? Number(preparedRegistryRow.version)
          : artifactNextVersion_(registryRows, record.recordId, kind);
        baseRegistryMetadata = artifactBuildRegistryMetadata_({
          kind: kind,
          version: version,
          payloadHash: payloadHash,
          recordUpdates: recordUpdates,
          templateFingerprint: templateFingerprints[kind],
          settings: settings,
          record: record,
          canonical: canonicalAfterReservation,
          dipsSubmissionDeadline: dipsSubmissionDeadline,
          holidayMaster: effectiveHolidayMaster
        });
        var preparedEntry = {
          recordId: record.recordId,
          kind: kind,
          hash: payloadHash,
          version: version,
          status: "prepared",
          fileId: "",
          url: "",
          fileName: "",
          folderId: targetFolder.getId(),
          documentNumbers: artifactDocumentNumbers_(record, kind),
          message: "成果物作成前の永続予約",
          metadata: baseRegistryMetadata
        };
        if (!preparedRegistryRow) {
          var preparedGlobalIssue = artifactRegistryGlobalRowsIssue_(registryRows.concat([preparedEntry]));
          if (preparedGlobalIssue) {
            throw new Error("成果物作成予約前の全体版検証に失敗しました。" + preparedGlobalIssue);
          }
          preparedRegistryRow = artifactAppendPreparedRegistry_(registry.sheet, preparedEntry);
          preparedCreatedThisAttempt = true;
          registryRows.push(preparedRegistryRow);
        } else if (!artifactPreparedRegistryMatches_(preparedRegistryRow, preparedEntry)) {
          throw new Error("前回中断した作成予約の内容が現在の生成条件と一致しません。【担当部署に確認が必要】");
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
        created = artifactRecoverPreparedOutput_(preparedRegistryRow, context);
        recoveredPrepared = !!created;
        if (!created) {
          if (!preparedCreatedThisAttempt) {
            throw artifactRegistryOutcomeUncertainError_(
              "前回実行から残る作成予約に一致するDrive成果物をまだ確認できません。" +
              "Drive一覧の反映遅延または作成直前の中断を一意に判定できないため、" +
              "新規作成せず停止しました。【担当部署に確認が必要】"
            );
          }
          created = artifactCreateByKind_(context);
          createdByCurrentAttempt = true;
        }
        if (kind !== "ledger" && createdByCurrentAttempt) {
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
        var metadata = artifactCompleteRegistryMetadata_(baseRegistryMetadata, kind, created);
        var proposedRegistryRow = {
          recordId: record.recordId,
          kind: kind,
          hash: payloadHash,
          version: version,
          status: "created",
          fileId: created.fileId
        };
        var proposedRows = registryRows.map(function (row) {
          return Number(row.sheetRow || 0) === Number(preparedRegistryRow.sheetRow || 0) &&
            artifactText_(row.recordId) === artifactText_(preparedRegistryRow.recordId) &&
            artifactText_(row.kind) === artifactText_(preparedRegistryRow.kind)
            ? proposedRegistryRow
            : row;
        });
        var proposedGlobalIssue = artifactRegistryGlobalRowsIssue_(proposedRows);
        if (proposedGlobalIssue) throw new Error("成果物レジストリ追記前の全体版検証に失敗しました。" + proposedGlobalIssue);
        var committedRegistryRow = artifactUpdatePreparedRegistry_(registry.sheet, preparedRegistryRow, {
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
        artifactReplaceRegistryRow_(registryRows, committedRegistryRow);
        artifactClearPublishedOutputDriveAttempt_(
          kind,
          record,
          payloadHash,
          version,
          settings,
          autoRoot,
          targetFolder,
          created.fileId
        );
        results.push({
          kind: kind,
          label: label,
          status: "created",
          url: created.url,
          fileName: created.fileName,
          dipsSubmissionDeadline: dipsSubmissionDeadline,
          message: created.message || (
            recoveredPrepared
              ? "中断前に完成していたv" + version + "を再検証して確定しました。"
              : "v" + version + " を作成しました。"
          )
        });
      } catch (error) {
        var cleanupErrors = [];
        var cleanupFailure = error && error.artifactProvisional ? error.artifactProvisional : null;
        var registryOutcomeUncertain = !!(error && error.artifactRegistryOutcomeUncertain);
        if (!registryCommitted && !registryOutcomeUncertain && createdByCurrentAttempt && created && priorLedgerMark) {
          try { artifactRestorePriorLedgerRows_(created.fileId, priorLedgerMark); }
          catch (restorePriorLedgerError) { cleanupErrors.push("旧版表示の復元: " + artifactErrorMessage_(restorePriorLedgerError)); }
        }
        if (!registryCommitted && !registryOutcomeUncertain && createdByCurrentAttempt && created) {
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
        if (registryOutcomeUncertain) {
          message =
            "レジストリ確定結果が不明なため成果物を削除せず、予約行も変更しません。" +
            "再実行時に自動照合します。【担当部署に確認が必要】" + message;
        }
        if (cleanupErrors.length) message += " 【担当部署に確認が必要】" + cleanupErrors.join(" / ");
        if (registryCommitted) message = "成果物と監査ログは作成済みですが、作成後処理でエラーになりました。削除せず保持します。" + message;
        errors.push(label + ": " + message);
        var canFailPreparedRow = preparedRegistryRow &&
          artifactText_(preparedRegistryRow.status) === "prepared" &&
          artifactText_(preparedRegistryRow.hash) === payloadHash &&
          Number(preparedRegistryRow.version || 0) === Number(version || 0) &&
          !registryOutcomeUncertain &&
          !(recoveredPrepared && created && !createdByCurrentAttempt);
        if (!registryCommitted && canFailPreparedRow) try {
          var errorMetadata = artifactClone_(baseRegistryMetadata || {});
          errorMetadata.cleanupFailure = cleanupFailure || null;
          var errorRegistryRow = artifactUpdatePreparedRegistry_(registry.sheet, preparedRegistryRow, {
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
            metadata: errorMetadata
          });
          artifactReplaceRegistryRow_(registryRows, errorRegistryRow);
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

    return artifactAttachCanonicalResult_({
      success: errors.length === 0,
      results: results,
      recordUpdates: recordUpdates,
      errors: errors,
      outputFolderUrl: recordFolder ? artifactFolderUrl_(recordFolder.getId()) : artifactFolderUrl_(autoRoot.getId())
    }, canonicalAfterReservation);
  } catch (error) {
    var message = artifactErrorMessage_(error);
    var failureCanonical = artifactLatestCanonicalAfterFailure_(
      request.recordId,
      canonicalAfterReservation || (canonicalRequest && canonicalRequest.canonical)
    );
    return artifactAttachCanonicalResult_(
      { success: false, results: [], recordUpdates: {}, errors: [message], error: message, message: message },
      failureCanonical
    );
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
  try { artifactAssertPinnedReferenceSources_(kinds); }
  catch (referenceError) { globalErrors.push(artifactErrorMessage_(referenceError)); }

  try { artifactAssertNumberingSettings_(settings); }
  catch (numberingSettingsError) { globalErrors.push(artifactErrorMessage_(numberingSettingsError)); }
  try { artifactAssertDedicatedTemplateStorageSafe_(settings); }
  catch (templateStorageError) { globalErrors.push(artifactErrorMessage_(templateStorageError)); }
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
          record.certificateIssuedDate, settings.dipsAdditionalClosedDates, artifactLoadEffectiveHolidayMaster_()
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
  var recordFiscalYear = artifactText_(record.fiscalYear);
  if (recordFiscalYear !== RENEWAL_ARTIFACT.PINNED_OUTPUT_FISCAL_YEAR) {
    errors.push(
      "固定保存先は" + RENEWAL_ARTIFACT.PINNED_OUTPUT_FISCAL_YEAR +
      "年度専用です。対象者の年度を確認してください。別年度は承認済み保存先とコードを切り替えるまで作成できません。"
    );
  }
  var courseDateText = artifactText_(record.courseDate);
  var validCourseDate = artifactValidIsoDateOrBlank_(courseDateText);
  if (courseDateText && !validCourseDate) {
    errors.push("入力済みの講習修了日は実在する yyyy-MM-dd 形式で指定してください。");
  }
  var courseFiscalYear = validCourseDate ? artifactFiscalYearFromIso_(validCourseDate) : "";
  if (courseFiscalYear && recordFiscalYear && courseFiscalYear !== recordFiscalYear) {
    errors.push("対象者の年度と講習修了日の年度が一致しません。年度を推測で変更せず、対象者データを確認してください。");
  }
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
    var formalBillingInputs = null;
    if (record._formalFinanceInvoice === true) {
      try {
        formalBillingInputs = artifactBillingRenderInputs_(record, settings);
        if (Number(record._formalFinanceEffectiveBilled) <= 0) {
          warnings.push(
            "全額取消済みの正式請求です。作成済み成果物の履歴参照は維持しますが、新しい通常請求書ファイルは生成しません。訂正版の正式請求を選択してください。"
          );
        }
      } catch (formalBillingError) {
        errors.push(artifactErrorMessage_(formalBillingError));
      }
    }
    if (!artifactText_(formalBillingInputs
      ? formalBillingInputs.recipientName
      : (record.billingRecipientName || record.targetName))) {
      errors.push("見積・請求先名が必要です。");
    }
    artifactValidateBillingAmounts_(record, errors);
    artifactValidateTaxException_(record, artifactTodayIso_(), errors);
    if ([0, 8].indexOf(Number(record.taxRate)) >= 0) warnings.push("標準税率10%以外を使用します。承認日・承認者・根拠を請求書送付前に経理担当者が再確認してください。");
    var billingHonorific = formalBillingInputs
      ? formalBillingInputs.recipientHonorific
      : artifactText_(record.billingHonorific);
    if (["御中", "様"].indexOf(billingHonorific) < 0) errors.push("敬称は「御中」または「様」を選択してください。");
    artifactValidateBillingDatesAndNumbers_(record, errors);
    if (record._formalFinanceInvoice !== true) artifactRequireIssuer_(settings, errors, false, true);
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
  if (record._formalFinanceInvoice === true) {
    if (!invoiceNo) errors.push("発行済み正式請求の請求書番号が必要です。");
    if (invoiceNo.length > 40 || /[;\r\n]/.test(invoiceNo)) {
      errors.push("発行済み正式請求の請求書番号を帳票に安全に表示できません。");
    }
    if (!invoiceDate) errors.push("発行済み正式請求の請求日が必要です。");
  } else {
    var invoiceFormatValid = !invoiceNo || artifactIsAllowedBillingNumber_(invoiceNo, "INV", namespace);
    if (invoiceNo && !invoiceFormatValid) errors.push("請求書番号は INV-UC0157-yyyyMMdd-N 形式、または移行済みの正式番号 INV-yyyyMMdd-N 形式で入力してください。");
    if (invoiceNo && !invoiceDate) errors.push("請求書番号を手入力する場合は請求日が必要です。");
    if (invoiceNo && invoiceDate && invoiceFormatValid && !artifactBillingNumberMatchesDate_(invoiceNo, "INV", namespace, invoiceDate)) errors.push("請求書番号の日付部を請求日と一致させてください。");
  }
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

function artifactAssertTemplateFolderSafe_(folder, rootFolderId) {
  if (!folder) throw new Error("専用原本フォルダを確認できません。");
  try {
    artifactHardenNewDriveItem_(folder, "専用原本フォルダ");
    artifactAssertOwnerOnlyDriveItem_(folder, rootFolderId, "専用原本フォルダ");
  } catch (error) {
    var message = artifactErrorMessage_(error);
    if (message.indexOf("専用原本フォルダ") >= 0) throw error;
    throw new Error("専用原本フォルダの非公開設定を確認できません。");
  }
  return folder;
}

function artifactAssertTemplateFileSafe_(file, templateFolder, label) {
  var itemLabel = artifactText_(label) || "専用原本";
  if (!file || !templateFolder) throw new Error(itemLabel + "または専用原本フォルダを確認できません。");
  artifactHardenNewDriveItem_(file, itemLabel);
  return artifactAssertOwnerOnlyDriveItem_(file, templateFolder.getId(), itemLabel);
}

function artifactAssertDedicatedTemplateStorageSafe_(settings) {
  var templateFolderId = artifactExtractDriveId_(settings && settings.templateFolderId);
  var ledgerTemplateId = artifactExtractDriveFileId_(settings && settings.ledgerTemplateId);
  var certificateTemplateId = artifactExtractDriveFileId_(settings && settings.certificateTemplateId);
  if (!templateFolderId || !ledgerTemplateId || !certificateTemplateId) {
    throw new Error("専用原本フォルダ・発行台帳原本・修了証明書原本の設定が揃っていません。");
  }
  var root = DriveApp.getRootFolder();
  var folder = artifactAssertTemplateFolderSafe_(
    DriveApp.getFolderById(templateFolderId),
    root.getId()
  );
  artifactAssertTemplateFileSafe_(
    DriveApp.getFileById(ledgerTemplateId),
    folder,
    "発行台帳専用原本"
  );
  artifactAssertTemplateFileSafe_(
    DriveApp.getFileById(certificateTemplateId),
    folder,
    "修了証明書専用原本"
  );
  return folder;
}

function artifactEnsureTemplateFolder_(storedFolderId) {
  var root = DriveApp.getRootFolder();
  var rootId = artifactText_(root.getId());
  if (!rootId) throw new Error("My Driveのルートフォルダを確認できません。");
  var id = artifactExtractDriveId_(storedFolderId);
  if (id) {
    try { return artifactAssertTemplateFolderSafe_(DriveApp.getFolderById(id), rootId); }
    catch (storedFolderError) {
      throw new Error("保存済みの専用原本フォルダを安全確認できません。削除・移動・共有設定を確認してください。");
    }
  }

  var matches = root.getFoldersByName(RENEWAL_ARTIFACT.TEMPLATE_FOLDER_NAME);
  var candidates = artifactIteratorItems_(matches, 2);
  if (candidates.length > 1) {
    throw new Error("My Drive直下に専用原本フォルダが複数あります。重複を監査してから再実行してください。");
  }
  if (candidates.length === 1) return artifactAssertTemplateFolderSafe_(candidates[0], rootId);

  return artifactCreateFolderInFolder_(
    RENEWAL_ARTIFACT.TEMPLATE_FOLDER_NAME,
    root,
    "専用原本フォルダ",
    "",
    true
  );
}

function artifactRemoveCreatedFilePermanently_(file) {
  if (!file) return;
  artifactPermanentlyDeleteNewDriveItem_(
    file,
    "作成途中の専用原本",
    "file",
    new Error("作成途中の専用原本を完全削除します。")
  );
}

function artifactProvisionLedgerTemplate_(templateFolder) {
  var outputName = "更新講習修了証明書発行台帳_清浄原本";
  var existing = artifactIteratorItems_(templateFolder.getFilesByName(outputName), 2);
  if (existing.length > 1) {
    throw new Error("同名の発行台帳専用原本が複数あります。重複を監査してから再実行してください。");
  }
  if (existing.length === 1) {
    artifactAssertTemplateFileSafe_(existing[0], templateFolder, "既存の発行台帳専用原本");
    artifactAssertLedgerTemplateClean_(existing[0].getId(), true);
    return { file: existing[0], created: false };
  }

  var outputFile = null;
  try {
    artifactAssertPinnedReferenceSource_("ledgerSource");
    var source = SpreadsheetApp.openById(RENEWAL_ARTIFACT.BLOCKED_TEMPLATE_IDS.ledger);
    var sourceBase = source.getSheetByName("ベース");
    if (!sourceBase) throw new Error("発行台帳の参照元に「ベース」シートがありません。");

    var createdTemplate = artifactCreateSpreadsheetInFolder_(
      outputName,
      templateFolder,
      "発行台帳専用原本",
      "",
      true
    );
    var output = createdTemplate.spreadsheet;
    outputFile = createdTemplate.file;

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

    artifactAssertLedgerTemplateClean_(output.getId(), true);
    return { file: outputFile, created: true };
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

  var tempName = "一時_修了証明書原本清浄化_PREPARED";
  var finalName = "更新講習修了証明書_清浄原本";
  var finalMatches = artifactIteratorItems_(templateFolder.getFilesByName(finalName), 2);
  if (finalMatches.length > 1) {
    throw new Error("同名の修了証明書専用原本が複数あります。重複を監査してから再実行してください。");
  }
  var tempMatches = artifactIteratorItems_(templateFolder.getFilesByName(tempName), 2);
  if (tempMatches.length) {
    var tempIds = tempMatches.map(function(item) { return artifactText_(item.getId()); }).join(",");
    throw new Error(
      "前回中断した修了証明書の一時原本があります。自動で上書き・再利用しません。" +
      "内容と所有者専用権限を確認し、不要なら削除してから再実行してください。【担当部署に確認が必要】ID=" + tempIds
    );
  }
  if (finalMatches.length === 1) {
    artifactAssertTemplateFileSafe_(finalMatches[0], templateFolder, "既存の修了証明書専用原本");
    artifactAssertCertificateTemplateClean_(finalMatches[0].getId(), true);
    return { file: finalMatches[0], created: false };
  }

  var tempFile = null;
  var finalFile = null;
  try {
    artifactAssertPinnedReferenceSource_("certificateSource");
    tempFile = artifactCopyFileInFolder_(
      RENEWAL_ARTIFACT.BLOCKED_TEMPLATE_IDS.certificate,
      tempName,
      "application/vnd.google-apps.document",
      templateFolder,
      "一時修了証明書原本",
      "",
      true
    );

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
    artifactAssertCertificateTemplateClean_(tempFile.getId(), true);

    finalFile = artifactCopyFileInFolder_(
      tempFile.getId(),
      finalName,
      "application/vnd.google-apps.document",
      templateFolder,
      "修了証明書専用原本",
      "",
      true
    );
    artifactAssertCertificateTemplateClean_(finalFile.getId(), true);
    artifactRemoveCreatedFilePermanently_(tempFile);
    tempFile = null;
    return { file: finalFile, created: true };
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

function artifactValueIsNonEmpty_(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function artifactFindForbiddenDocumentContent_(value, path) {
  if (!value || typeof value !== "object") return "";
  var forbiddenContainers = {
    inlineObjects: true,
    positionedObjects: true,
    footnotes: true,
    namedRanges: true,
    suggestedDocumentStyleChanges: true,
    suggestedNamedStylesChanges: true,
    suggestedPositionedObjectPropertiesChanges: true
  };
  var forbiddenElements = {
    inlineObjectElement: true,
    positionedObjectId: true,
    richLink: true,
    person: true,
    autoText: true,
    equation: true
  };
  var keys = Object.keys(value);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var childPath = path ? path + "." + key : key;
    if ((forbiddenContainers[key] || forbiddenElements[key] || /^suggested(?:Insertion|Deletion)Ids$/.test(key)) && artifactValueIsNonEmpty_(value[key])) {
      return childPath;
    }
    var nested = artifactFindForbiddenDocumentContent_(value[key], childPath);
    if (nested) return nested;
  }
  return "";
}

function artifactAssertDocumentAdvancedClean_(fileId, label) {
  if (typeof Docs === "undefined" || !Docs.Documents || typeof Docs.Documents.get !== "function") {
    throw new Error(label + "原本の画像・埋込み要素検査に必要なAdvanced Google Docs API v1が有効ではありません。");
  }
  var resource;
  try {
    resource = Docs.Documents.get(fileId, { includeTabsContent: true });
  } catch (docsReadError) {
    throw new Error(label + "原本の全タブ・画像・埋込み要素を検査できないため作成を停止しました。");
  }
  var forbiddenPath = artifactFindForbiddenDocumentContent_(resource, "");
  if (forbiddenPath) {
    throw new Error(label + "原本に許可していない画像・埋込み・提案・脚注等があります（" + forbiddenPath + "）。無個人情報の文字・表だけの原本へ戻してください。");
  }
  return true;
}

function artifactAssertDriveCommentsAbsent_(fileId, label) {
  if (typeof Drive === "undefined" || !Drive.Comments || typeof Drive.Comments.list !== "function") {
    throw new Error(label + "のコメント検査に必要なAdvanced Drive API v3が有効ではありません。");
  }
  var pageToken = "";
  var seenTokens = {};
  do {
    if (pageToken && seenTokens[pageToken]) throw new Error(label + "のコメント一覧ページングが循環したため停止しました。");
    if (pageToken) seenTokens[pageToken] = true;
    var options = {
      pageSize: 100,
      includeDeleted: false,
      fields: "nextPageToken,comments(id,deleted,resolved)"
    };
    if (pageToken) options.pageToken = pageToken;
    var response;
    try { response = Drive.Comments.list(fileId, options); }
    catch (commentsError) { throw new Error(label + "の全コメントを確認できないため作成を停止しました。"); }
    if (!response || !Array.isArray(response.comments)) {
      throw new Error(label + "のコメント一覧が不完全なため作成を停止しました。");
    }
    if (response.comments.some(function(comment) { return comment && comment.deleted !== true; })) {
      throw new Error(label + "にDriveコメントがあります。コメント本文へ個人情報を残さず、承認後に削除してから再実行してください。");
    }
    pageToken = artifactText_(response.nextPageToken);
  } while (pageToken);
  return true;
}

function artifactAssertPinnedReferenceSource_(key) {
  var pin = RENEWAL_ARTIFACT.REFERENCE_SOURCE_PINS[key];
  if (!pin) throw new Error("参照元の承認版設定がありません: " + key);
  var label = artifactText_(pin.label) || "参照元";
  if (!pin.id || !pin.revisionId || !pin.modifiedTime || !pin.revisionModifiedTime || !pin.mimeType) {
    throw new Error(label + "の承認版識別情報が不完全です。");
  }
  if (typeof Drive === "undefined" || !Drive.Files || !Drive.Revisions) {
    throw new Error(label + "の版検査に必要なAdvanced Drive API v3が有効ではありません。");
  }
  var fileState;
  var revisionState;
  try {
    fileState = Drive.Files.get(pin.id, {
      fields: "id,mimeType,modifiedTime,trashed",
      supportsAllDrives: true
    });
    revisionState = Drive.Revisions.get(pin.id, pin.revisionId, {
      fields: "id,modifiedTime"
    });
  } catch (stateError) {
    throw new Error(label + "のDriveファイル版・revisionを確認できないため作成を停止しました。");
  }
  if (
    !fileState ||
    artifactText_(fileState.id) !== pin.id ||
    artifactText_(fileState.mimeType) !== pin.mimeType ||
    artifactText_(fileState.modifiedTime) !== pin.modifiedTime ||
    fileState.trashed === true ||
    !revisionState ||
    artifactText_(revisionState.id) !== pin.revisionId ||
    artifactText_(revisionState.modifiedTime) !== pin.revisionModifiedTime
  ) {
    throw new Error(label + "が承認版から変更されています。自動取込せず、差分・個人情報・計算規則を再確認して版設定を更新するまで作成を停止します。");
  }
  return true;
}

function artifactReferencePinKeysForKinds_(kinds) {
  var selected = Array.isArray(kinds) ? kinds : [];
  return Object.keys(RENEWAL_ARTIFACT.REFERENCE_SOURCE_PINS || {}).filter(function(key) {
    var pinKinds = RENEWAL_ARTIFACT.REFERENCE_SOURCE_PINS[key].kinds || [];
    return selected.some(function(kind) { return pinKinds.indexOf(kind) >= 0; });
  }).sort();
}

function artifactAssertPinnedReferenceSources_(kinds) {
  var keys = artifactReferencePinKeysForKinds_(kinds);
  for (var i = 0; i < keys.length; i++) artifactAssertPinnedReferenceSource_(keys[i]);
  return keys;
}

function artifactReferenceFingerprintForKind_(kind) {
  return artifactReferencePinKeysForKinds_([kind]).map(function(key) {
    var pin = RENEWAL_ARTIFACT.REFERENCE_SOURCE_PINS[key];
    return key + ":" + pin.id + "@" + pin.modifiedTime + "#rev=" + pin.revisionId + "@" + pin.revisionModifiedTime;
  });
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

function artifactLoadDedicatedTemplatePins_() {
  var raw = PropertiesService.getScriptProperties().getProperty(RENEWAL_ARTIFACT.DEDICATED_TEMPLATE_PINS_KEY);
  if (!raw) return { schemaVersion: 1, pins: {} };
  var parsed;
  try { parsed = JSON.parse(raw); }
  catch (parseError) { throw new Error("専用原本の版固定情報が壊れているため作成を停止しました。"); }
  if (!parsed || parsed.schemaVersion !== 1 || !parsed.pins || typeof parsed.pins !== "object" || Array.isArray(parsed.pins)) {
    throw new Error("専用原本の版固定情報が不正なため作成を停止しました。");
  }
  return parsed;
}

function artifactHasDedicatedTemplatePin_(kind, fileId) {
  var store = artifactLoadDedicatedTemplatePins_();
  var pin = store.pins[kind];
  return !!(pin && artifactText_(pin.fileId) === artifactText_(fileId));
}

function artifactPinDedicatedTemplate_(kind, fileId) {
  if (["ledger", "certificate"].indexOf(kind) < 0) throw new Error("専用原本として版固定できない種別です: " + kind);
  var id = artifactExtractDriveFileId_(fileId);
  if (!id) throw new Error("専用原本のDrive IDが正しくありません。");
  var revision = artifactDriveRevisionState_(id);
  var store = artifactLoadDedicatedTemplatePins_();
  store.pins[kind] = {
    fileId: id,
    driveVersion: revision.driveVersion,
    modifiedTime: revision.modifiedTime,
    md5Checksum: revision.md5Checksum,
    pinnedAt: artifactNowText_()
  };
  PropertiesService.getScriptProperties().setProperty(
    RENEWAL_ARTIFACT.DEDICATED_TEMPLATE_PINS_KEY,
    JSON.stringify(store)
  );
  return store.pins[kind];
}

function artifactAssertDedicatedTemplatePin_(kind, fileId) {
  var id = artifactExtractDriveFileId_(fileId);
  var store = artifactLoadDedicatedTemplatePins_();
  var expected = store.pins[kind];
  if (!expected || artifactText_(expected.fileId) !== id) {
    throw new Error((RENEWAL_ARTIFACT.LABELS[kind] || "専用原本") + "の版固定情報がありません。「専用原本を自動準備」で清浄性確認と版固定を行ってください。");
  }
  var actual = artifactDriveRevisionState_(id);
  if (
    actual.driveVersion !== artifactText_(expected.driveVersion) ||
    actual.modifiedTime !== artifactText_(expected.modifiedTime) ||
    actual.md5Checksum !== artifactText_(expected.md5Checksum)
  ) {
    throw new Error((RENEWAL_ARTIFACT.LABELS[kind] || "専用原本") + "が版固定後に変更されています。自動で承認し直さず、全領域を再確認するまで作成を停止します。");
  }
  return true;
}

function artifactRemoveDedicatedTemplatePinForFile_(file) {
  var id = "";
  try { id = artifactText_(file && file.getId()); } catch (ignoredId) {}
  if (!id) return;
  var store;
  try { store = artifactLoadDedicatedTemplatePins_(); }
  catch (ignoredStoreError) { return; }
  var changed = false;
  Object.keys(store.pins).forEach(function(kind) {
    if (artifactText_(store.pins[kind] && store.pins[kind].fileId) === id) {
      delete store.pins[kind];
      changed = true;
    }
  });
  if (changed) {
    PropertiesService.getScriptProperties().setProperty(
      RENEWAL_ARTIFACT.DEDICATED_TEMPLATE_PINS_KEY,
      JSON.stringify(store)
    );
  }
}

function artifactAssertCertificateTemplateClean_(templateId, skipDedicatedPin) {
  var id = artifactTemplateId_("certificate", { certificateTemplateId: templateId });
  if (!skipDedicatedPin) artifactAssertDedicatedTemplatePin_("certificate", id);
  artifactAssertDriveCommentsAbsent_(id, "修了証明書原本");
  artifactAssertDocumentAdvancedClean_(id, "修了証明書");
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

function artifactRangeHasDataValidation_(range) {
  var validations;
  try { validations = range.getDataValidations(); }
  catch (validationError) { throw new Error("セル入力規則を完全取得できないため原本検査を停止しました。"); }
  for (var row = 0; row < validations.length; row++) {
    for (var column = 0; column < validations[row].length; column++) {
      if (validations[row][column]) return true;
    }
  }
  return false;
}

function artifactRangeHasRichLinks_(range) {
  var richValues;
  try { richValues = range.getRichTextValues(); }
  catch (richTextError) { throw new Error("セルのリッチテキスト・リンクを完全取得できないため原本検査を停止しました。"); }
  for (var row = 0; row < richValues.length; row++) {
    for (var column = 0; column < richValues[row].length; column++) {
      var rich = richValues[row][column];
      if (!rich) continue;
      try {
        if (rich.getLinkUrl()) return true;
        var runs = rich.getRuns() || [];
        for (var runIndex = 0; runIndex < runs.length; runIndex++) {
          if (runs[runIndex].getLinkUrl()) return true;
        }
      } catch (linkReadError) {
        throw new Error("セル内リンクを完全確認できないため原本検査を停止しました。");
      }
    }
  }
  return false;
}

function artifactAssertSheetTextAllowlist_(sheet, allowlist, rowCount) {
  var columns = Number(allowlist && allowlist.columns);
  var rows = allowlist && allowlist.rows;
  var count = Number(rowCount);
  if (!columns || !rows || !count) throw new Error("シート文字allowlist設定が不完全です。");
  var values = sheet.getRange(1, 1, count, columns).getDisplayValues();
  for (var row = 1; row <= count; row++) {
    var expected = rows[String(row)] || [];
    for (var column = 1; column <= columns; column++) {
      var actualText = String(values[row - 1][column - 1] || "");
      var expectedText = String(expected[column - 1] || "");
      if (actualText !== expectedText) {
        throw new Error(
          "講習記録簿原本「" + sheet.getName() + "」のR" + row + "C" + column +
          "が承認済み文字allowlistと一致しません。実データ混入の可能性があるため作成を停止しました。"
        );
      }
    }
  }
  return true;
}

function artifactAssertGuidanceTemplateClean_(templateId) {
  artifactAssertTrustedSharedTemplate_("guidance", templateId);
  artifactAssertDriveCommentsAbsent_(templateId, "更新講習案内原本");
  artifactAssertDocumentAdvancedClean_(templateId, "更新講習案内");
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
  var allowlist = RENEWAL_ARTIFACT.TRAINING_TEXT_ALLOWLISTS[name];
  if (!allowlist || Number(allowlist.columns) !== Number(keepColumns)) {
    throw new Error("講習記録簿原本「" + name + "」の文字allowlist設定がありません。");
  }
  var lastRow = Math.max(1, sheet.getLastRow());
  var lastColumn = Math.max(1, sheet.getLastColumn());
  if (lastRow > 32 || lastColumn > keepColumns) {
    throw new Error("講習記録簿原本「" + name + "」のA1:" + (keepColumns === 8 ? "H" : "F") + "32外にデータがあります。");
  }
  var usedRange = sheet.getRange(1, 1, lastRow, lastColumn);
  if (
    artifactLedgerTemplateRowsHaveData_(usedRange.getFormulas(), false) ||
    artifactLedgerTemplateRowsHaveData_(usedRange.getNotes(), false) ||
    artifactRangeHasDataValidation_(usedRange) ||
    artifactRangeHasRichLinks_(usedRange) ||
    sheet.getCharts().length || sheet.getDrawings().length || sheet.getImages().length
  ) {
    throw new Error("講習記録簿原本「" + name + "」に想定外の数式・メモ・リンク・入力規則・グラフ・図形・画像があります。");
  }
  artifactAssertSheetTextAllowlist_(sheet, allowlist, 32);
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
  artifactAssertDriveCommentsAbsent_(templateId, "講習記録簿原本");
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

function artifactAssertLedgerTemplateClean_(templateId, skipDedicatedPin) {
  var id = artifactTemplateId_("ledger", { ledgerTemplateId: templateId });
  if (!skipDedicatedPin) artifactAssertDedicatedTemplatePin_("ledger", id);
  artifactAssertDriveCommentsAbsent_(id, "発行台帳原本");
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
  var approvedHeaders = RENEWAL_ARTIFACT.LEDGER_HEADER_ALLOWLIST;
  for (var headerRow = 0; headerRow < approvedHeaders.length; headerRow++) {
    for (var headerColumn = 0; headerColumn < approvedHeaders[headerRow].length; headerColumn++) {
      if (String(wholeValues[headerRow][headerColumn] || "") !== approvedHeaders[headerRow][headerColumn]) {
        throw new Error("発行台帳原本のA1:I2が承認済み文字allowlistと一致しません。セル内容を推測修復せず作成を停止しました。");
      }
    }
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
    artifactLedgerTemplateRowsHaveData_(wholeRange.getNotes(), false) ||
    artifactRangeHasDataValidation_(wholeRange) ||
    artifactRangeHasRichLinks_(wholeRange)
  ) throw new Error("発行台帳原本に想定外の数式・メモ・リンク・入力規則があります。");
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

function artifactAnnualLedgerFileName_(year) {
  return "更新講習修了証明書発行台帳_" + Number(year) + "年";
}

function artifactAssertAnnualLedgerStructure_(file, ss, autoRootId, year, templateBase) {
  var expectedName = artifactAnnualLedgerFileName_(year);
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

function artifactOutputDriveAttemptOperation_(
  kind, record, payloadHash, version, settings, autoRoot, targetFolder
) {
  var normalizedKind = artifactText_(kind);
  var parentId = normalizedKind === "ledger"
    ? artifactText_(autoRoot && autoRoot.getId())
    : artifactText_(targetFolder && targetFolder.getId());
  if (normalizedKind === "ledger") {
    var year = Number(
      artifactText_(record && record.certificateIssuedDate).slice(0, 4)
    );
    return artifactDriveAttemptOperation_(
      "CREATE",
      "",
      artifactAnnualLedgerFileName_(year),
      "application/vnd.google-apps.spreadsheet",
      parentId
    );
  }
  var preparedName = artifactPreparedOutputFileName_(
    record.recordId, normalizedKind, payloadHash, version
  );
  if (normalizedKind === "certificate") {
    return artifactDriveAttemptOperation_(
      "COPY",
      artifactTemplateId_("certificate", settings || {}),
      preparedName,
      "application/vnd.google-apps.document",
      parentId
    );
  }
  if (normalizedKind === "dipsCsv") {
    return artifactDriveAttemptOperation_(
      "CREATE", "", preparedName, "text/csv", parentId
    );
  }
  if (normalizedKind === "guidance") {
    return artifactDriveAttemptOperation_(
      "COPY",
      RENEWAL_ARTIFACT.TEMPLATE_IDS.guidance,
      preparedName,
      "application/vnd.google-apps.document",
      parentId
    );
  }
  if (normalizedKind === "training") {
    return artifactDriveAttemptOperation_(
      "COPY",
      RENEWAL_ARTIFACT.TEMPLATE_IDS.training,
      preparedName,
      "application/vnd.google-apps.spreadsheet",
      parentId
    );
  }
  if (normalizedKind === "billing") {
    return artifactDriveAttemptOperation_(
      "CREATE",
      "",
      preparedName,
      "application/vnd.google-apps.spreadsheet",
      parentId
    );
  }
  throw new Error("Drive作成試行を特定できない成果物種別です。");
}

function artifactClearPublishedOutputDriveAttempt_(
  kind, record, payloadHash, version, settings,
  autoRoot, targetFolder, resourceId
) {
  return artifactClearPublishedDriveAttempt_(
    artifactOutputDriveAttemptOperation_(
      kind,
      record,
      payloadHash,
      version,
      settings,
      autoRoot,
      targetFolder
    ),
    resourceId,
    (RENEWAL_ARTIFACT.LABELS[kind] || "成果物") + "の確定"
  );
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
  var name = artifactAnnualLedgerFileName_(year);
  var ledgerDriveOperation = artifactDriveAttemptOperation_(
    "CREATE",
    "",
    name,
    "application/vnd.google-apps.spreadsheet",
    autoRoot.getId()
  );
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
    artifactClearPublishedDriveAttempt_(
      ledgerDriveOperation, storedId, "年次発行台帳"
    );
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
    artifactPublishDriveIdentityProperty_(
      props,
      key,
      existingFile.getId(),
      ledgerDriveOperation,
      "年次発行台帳"
    );
    return { file: existingFile, spreadsheet: existingSs, sheet: existingSheet };
  }
  var createdLedger = artifactCreateSpreadsheetInFolder_(
    name,
    autoRoot,
    "新規年次発行台帳",
    allowedOutputEmails,
    false
  );
  var ss = createdLedger.spreadsheet;
  var copy = createdLedger.file;
  var base;
  try {
    copy.setDescription(artifactGeneratedFileIdentity_("annual-ledger", autoRoot.getId(), year));
    ss.setSpreadsheetTimeZone("Asia/Tokyo");
    var defaultSheet = ss.getSheets()[0];
    base = sourceBase.copyTo(ss);
    base.setName(year + "年");
    ss.deleteSheet(defaultSheet);
    if (base.getMaxColumns() < 14) base.insertColumnsAfter(base.getMaxColumns(), 14 - base.getMaxColumns());
    base.getRange("J2:N2").setValues([["recordId", "version", "payloadHash / 作成日時", "ledgerVisibleHash", "ledgerStateHash"]]);
    base.hideColumns(10, 5);
    SpreadsheetApp.flush();
    artifactAssertAnnualLedgerStructure_(copy, ss, autoRoot.getId(), year, sourceBase);
  } catch (error) {
    artifactThrowAfterCleanup_(error, copy, "新規年次発行台帳", "file");
  }
  artifactPublishDriveIdentityProperty_(
    props,
    key,
    copy.getId(),
    ledgerDriveOperation,
    "年次発行台帳"
  );
  return { file: copy, spreadsheet: ss, sheet: base };
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
  var fileName = artifactExpectedOutputFileName_("certificate", record, context.version);
  var preparedName = artifactPreparedOutputFileName_(
    record.recordId, context.kind, context.payloadHash, context.version
  );
  var copy = artifactCopyFileInFolder_(
    templateId,
    preparedName,
    "application/vnd.google-apps.document",
    context.targetFolder,
    "新規修了証明書",
    context.settings.allowedOutputEmails,
    false
  );
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
  var fileName = artifactExpectedOutputFileName_("dipsCsv", record, context.version);
  var preparedName = artifactPreparedOutputFileName_(
    record.recordId, context.kind, context.payloadHash, context.version
  );
  var blob = Utilities.newBlob(csv, "text/csv", fileName);
  var file = artifactCreateDriveItemInFolder_(
    preparedName,
    "text/csv",
    context.targetFolder,
    "新規DIPS CSV",
    context.settings.allowedOutputEmails,
    false,
    null
  );
  try {
    artifactPrepareNewOutputFile_(file, context, "新規DIPS CSV");
    artifactUpdateBlobFileContent_(
      file,
      fileName,
      "text/csv",
      blob,
      context.targetFolder,
      "新規DIPS CSV"
    );
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
  var fileName = artifactExpectedOutputFileName_("guidance", record, context.version);
  var preparedName = artifactPreparedOutputFileName_(
    record.recordId, context.kind, context.payloadHash, context.version
  );
  var copy = artifactCopyFileInFolder_(
    RENEWAL_ARTIFACT.TEMPLATE_IDS.guidance,
    preparedName,
    "application/vnd.google-apps.document",
    context.targetFolder,
    "新規更新講習案内",
    context.settings.allowedOutputEmails,
    false
  );
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
  var fileName = artifactExpectedOutputFileName_("training", record, context.version);
  var preparedName = artifactPreparedOutputFileName_(
    record.recordId, context.kind, context.payloadHash, context.version
  );
  var copy = artifactCopyFileInFolder_(
    RENEWAL_ARTIFACT.TEMPLATE_IDS.training,
    preparedName,
    "application/vnd.google-apps.spreadsheet",
    context.targetFolder,
    "新規講習記録簿",
    context.settings.allowedOutputEmails,
    false
  );
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
  // API側のversion予約前検査に加え、実ファイル生成の直前にも強制する。
  artifactAssertFormalInvoiceNewGenerationAllowed_(record);
  var fileName = artifactExpectedOutputFileName_("billing", record, context.version);
  var preparedName = artifactPreparedOutputFileName_(
    record.recordId, context.kind, context.payloadHash, context.version
  );
  var createdBilling = artifactCreateSpreadsheetInFolder_(
    preparedName,
    context.targetFolder,
    "新規見積書・請求書",
    context.settings.allowedOutputEmails,
    false
  );
  var ss = createdBilling.spreadsheet;
  var file = createdBilling.file;
  try {
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
  var isFormalBilling = record._formalFinanceInvoice === true;
  var title = isInvoice && isFormalBilling ? "請求書" : (isInvoice ? "請求書（下書き）" : "見積書");
  var number = isInvoice ? record.invoiceNo : record.quoteNo;
  var issueDate = isInvoice ? record.invoiceDate : record.quoteDate;
  var limitDate = isInvoice ? record.paymentDueDate : record.quoteExpiry;
  var renderInputs = artifactBillingRenderInputs_(record, settings);
  var recipient = renderInputs.recipientName;
  var honorific = renderInputs.recipientHonorific;
  var subject = renderInputs.subject;
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
  artifactBillingMerge_(sheet, "B6:H6", renderInputs.recipientAddress).setFontColor(muted);
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

  artifactBillingMerge_(sheet, "K9:Q9", renderInputs.issuerCompany).setFontSize(12).setFontWeight("bold");
  artifactBillingMerge_(sheet, "K10:Q10", renderInputs.issuerAddress);
  artifactBillingMerge_(sheet, "K11:Q11", "TEL: " + renderInputs.issuerPhone + (renderInputs.issuerFax ? "　FAX: " + renderInputs.issuerFax : ""));
  artifactBillingMerge_(sheet, "K12:Q12", renderInputs.issuerEmail || "");
  artifactBillingMerge_(sheet, "K13:Q13", renderInputs.invoiceRegistrationNo ? "登録番号: " + renderInputs.invoiceRegistrationNo : "").setFontColor(muted);

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
  if (isFormalBilling) {
    var formalLines = record.formalBillingLines || [];
    for (var formalIndex = 0; formalIndex < formalLines.length; formalIndex++) {
      var formalLine = formalLines[formalIndex];
      var formalRow = 17 + formalIndex;
      var signedUnitAmount = formalLine.lineType === "DISCOUNT"
        ? -Number(formalLine.unitAmount)
        : Number(formalLine.unitAmount);
      sheet.getRange("B" + formalRow + ":C" + formalRow)
        .setValue(artifactSheetText_(formalLine.id)).setHorizontalAlignment("center");
      sheet.getRange("D" + formalRow + ":J" + formalRow)
        .setValue(artifactSheetText_(formalLine.description)).setWrap(true);
      sheet.getRange("K" + formalRow + ":M" + formalRow)
        .setValue(signedUnitAmount).setNumberFormat('¥#,##0;[Red]-¥#,##0').setHorizontalAlignment("right");
      sheet.getRange("N" + formalRow + ":O" + formalRow)
        .setValue(formalLine.quantity).setHorizontalAlignment("center");
      sheet.getRange("P" + formalRow).setValue("式").setHorizontalAlignment("center");
      // The issued finance ledger is authoritative; write the sealed line
      // amount instead of re-rounding it in a spreadsheet formula.
      sheet.getRange("Q" + formalRow).setValue(formalLine.amount)
        .setNumberFormat('¥#,##0;[Red]-¥#,##0').setHorizontalAlignment("right");
    }
  } else {
    sheet.getRange("B17:C17").setValue("REN-001").setHorizontalAlignment("center");
    sheet.getRange("D17:J17").setValue(artifactSheetText_(subject)).setWrap(true);
    sheet.getRange("K17:M17").setValue(billing.feeExTax).setNumberFormat('¥#,##0').setHorizontalAlignment("right");
    sheet.getRange("N17:O17").setValue(1).setHorizontalAlignment("center");
    sheet.getRange("P17").setValue("式").setHorizontalAlignment("center");
    sheet.getRange("Q17").setFormula("=ROUND(K17*N17,0)").setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  }
  sheet.getRange("B16:Q26").setBorder(true, true, true, true, true, true, line, SpreadsheetApp.BorderStyle.SOLID);

  artifactBillingMerge_(sheet, "K28:P28", "小計（値引前）");
  if (isFormalBilling) {
    sheet.getRange("Q28").setValue(billing.feeExTax).setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  } else {
    sheet.getRange("Q28").setFormula("=SUM(Q17:Q26)").setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  }
  artifactBillingMerge_(sheet, "K29:P29", "値引（税抜）");
  sheet.getRange("Q29").setValue(billing.discountExTax).setNumberFormat('-¥#,##0;[Red]-¥#,##0;¥0').setFontColor("#B91C1C").setHorizontalAlignment("right");
  artifactBillingMerge_(sheet, "K30:P30", "課税標準額");
  sheet.getRange("Q30").setFormula("=MAX(0,Q28-Q29)").setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  artifactBillingMerge_(sheet, "K31:P31", "消費税（" + billing.taxRate + "%・" + billing.rounding + "）");
  var taxFormula = artifactTaxFormula_("Q30", billing.taxRate, billing.rounding);
  if (isFormalBilling) {
    sheet.getRange("Q31").setValue(billing.tax).setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  } else {
    sheet.getRange("Q31").setFormula(taxFormula).setNumberFormat('¥#,##0').setHorizontalAlignment("right");
  }
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
    remarks.push(isFormalBilling
      ? "本書は発行済み正式請求（" + artifactText_(record.financeInvoiceId) + "）に基づき作成しています。"
      : "本書は下書きです。承認・送付・発行は別途記録してください。");
    remarks.push("お支払期限までにお振込みをお願いいたします。");
    remarks.push("振込先: " + renderInputs.bankAccountText);
    remarks.push("振込手数料はお客様にてご負担ください。");
  } else {
    remarks.push("本見積書は発行済み正式請求の明細・税額を基に作成しています。送付は別途記録してください。");
    remarks.push("講習日程・実施場所はお申し込み内容をご確認ください。");
    remarks.push("本見積書は発行日時点の内容に基づき作成しています。");
  }
  artifactBillingMerge_(sheet, "B36:Q40", remarks.join("\n")).setWrap(true).setVerticalAlignment("top");
  sheet.getRange("B35:Q40").setBorder(true, true, true, true, false, false, line, SpreadsheetApp.BorderStyle.SOLID);
  artifactBillingMerge_(sheet, "B43:Q43", "消費税の1円未満は、1帳票・税率ごとの税抜合計に対して1回だけ" + billing.rounding + "処理しています。")
    .setFontSize(8).setFontColor(muted);
  sheet.getRange("Z1").setValue(isInvoice ? "CDP_CLEAN_INVOICE_V3" : "CDP_CLEAN_QUOTE_V3");
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

function artifactSettingsDefaults_() {
  return {
    issuerCompany: "株式会社ＣＤＰ北海道",
    issuerAddress: "〒002-8053 札幌市北区篠路町篠路389-72",
    issuerPhone: "011-790-7925",
    issuerFax: "011-790-7935",
    issuerEmail: "",
    invoiceRegistrationNo: "T9430001086920",
    outputFolderId: RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID,
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
}

function artifactNormalizeStoredSettings_(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    throw new Error("保存済みの成果物設定の形式が不正です。固定保存先へ推測で置き換えず、Script Propertiesの設定を監査してください。");
  }
  var defaults = artifactSettingsDefaults_();
  Object.keys(defaults).forEach(function(key) {
    if (stored[key] !== undefined && stored[key] !== null) defaults[key] = stored[key];
  });
  var storedOutputFolderRaw = artifactText_(defaults.outputFolderId);
  defaults.outputFolderId = artifactExtractDriveId_(storedOutputFolderRaw);
  if (storedOutputFolderRaw && !defaults.outputFolderId) {
    throw new Error("保存済みの成果物出力先フォルダIDが不正です。固定保存先へ推測で置き換えず、旧設定を監査してください。");
  }
  if (!defaults.outputFolderId) {
    defaults.outputFolderId =
      RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID;
  }
  var storedTemplateFolderRaw = artifactText_(defaults.templateFolderId);
  defaults.templateFolderId = artifactExtractDriveId_(storedTemplateFolderRaw);
  if (storedTemplateFolderRaw && !defaults.templateFolderId) {
    throw new Error("保存済みの専用原本フォルダIDが不正です。空欄へ置き換えず、旧設定を監査してください。");
  }
  var storedLedgerTemplateRaw = artifactText_(defaults.ledgerTemplateId);
  defaults.ledgerTemplateId = artifactExtractDriveFileId_(storedLedgerTemplateRaw);
  if (storedLedgerTemplateRaw && !defaults.ledgerTemplateId) {
    throw new Error("保存済みの発行台帳専用原本IDが不正です。空欄へ置き換えず、旧設定を監査してください。");
  }
  var storedCertificateTemplateRaw = artifactText_(defaults.certificateTemplateId);
  defaults.certificateTemplateId = artifactExtractDriveFileId_(storedCertificateTemplateRaw);
  if (storedCertificateTemplateRaw && !defaults.certificateTemplateId) {
    throw new Error("保存済みの修了証明書専用原本IDが不正です。空欄へ置き換えず、旧設定を監査してください。");
  }
  defaults.allowedOutputEmails = artifactNormalizeAllowedEmails_(defaults.allowedOutputEmails).join("\n");
  defaults.dipsAdditionalClosedDates = artifactNormalizeIsoDateList_(defaults.dipsAdditionalClosedDates).join("\n");
  defaults.dipsCalendarConfirmedDate = artifactText_(defaults.dipsCalendarConfirmedDate);
  defaults.dipsCalendarConfirmedBy = artifactText_(defaults.dipsCalendarConfirmedBy);
  defaults.numberingInitialized = artifactBoolean_(defaults.numberingInitialized);
  defaults.numberingCutoverMonth = artifactText_(defaults.numberingCutoverMonth);
  defaults.certificateSequenceSeed = artifactText_(defaults.certificateSequenceSeed);
  defaults.dipsSequenceSeed = artifactText_(defaults.dipsSequenceSeed);
  defaults.schedules = artifactNormalizeSchedules_(defaults.schedules);
  return defaults;
}

function artifactStoredSettingsObject_(settings) {
  var normalized = artifactNormalizeStoredSettings_(settings || {});
  var stored = {};
  Object.keys(artifactSettingsDefaults_()).forEach(function(key) {
    stored[key] = normalized[key];
  });
  return stored;
}

function artifactNormalizeLegacyOutputFolders_(rows) {
  if (rows === undefined || rows === null) return [];
  if (!Array.isArray(rows) || rows.length > 50) {
    throw new Error("成果物設定の旧保存先履歴が不正です。自動修復せず監査してください。");
  }
  var seen = {};
  var normalizedRows = rows.map(function(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("成果物設定の旧保存先履歴が不正です。自動修復せず監査してください。");
    }
    var folderId = artifactExtractDriveId_(row.folderId);
    var verifiedBy = artifactText_(row.verifiedBy).toLowerCase();
    var version = Number(row.switchedAtVersion || 0);
    if (
      !folderId ||
      seen[folderId] ||
      !artifactText_(row.verifiedEmptyAt) ||
      !artifactIsEmail_(verifiedBy) ||
      version < 1 ||
      Math.floor(version) !== version
    ) {
      throw new Error("成果物設定の旧保存先履歴が不正です。自動修復せず監査してください。");
    }
    seen[folderId] = true;
    return {
      folderId: folderId,
      verifiedEmptyAt: artifactText_(row.verifiedEmptyAt),
      verifiedBy: verifiedBy,
      switchedAtVersion: version
    };
  });
  return normalizedRows;
}

function artifactNormalizeSettingsMutationHistory_(rows) {
  if (rows === undefined || rows === null) return [];
  if (!Array.isArray(rows) || rows.length > 6) {
    throw new Error("成果物設定の変更履歴が不正です。自動修復せず監査してください。");
  }
  var normalizedRows = rows.map(function(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("成果物設定の変更履歴が不正です。自動修復せず監査してください。");
    }
    var normalized = {
      correlationId: artifactText_(row.correlationId),
      idempotencyKeyHash: artifactText_(row.idempotencyKeyHash),
      requestHash: artifactText_(row.requestHash),
      beforeHash: artifactText_(row.beforeHash),
      afterHash: artifactText_(row.afterHash),
      versionBefore: Number(row.versionBefore || 0),
      versionAfter: Number(row.versionAfter || 0),
      actor: artifactText_(row.actor).toLowerCase(),
      reasonCode: artifactText_(row.reasonCode),
      committedAt: artifactText_(row.committedAt)
    };
    if (
      !/^ARTSET_[0-9A-F]{32,64}$/.test(normalized.correlationId) ||
      !/^[0-9a-f]{64}$/.test(normalized.idempotencyKeyHash) ||
      !/^[0-9a-f]{64}$/.test(normalized.requestHash) ||
      !/^[0-9a-f]{64}$/.test(normalized.beforeHash) ||
      !/^[0-9a-f]{64}$/.test(normalized.afterHash) ||
      normalized.versionBefore < 0 ||
      normalized.versionAfter !== normalized.versionBefore + 1 ||
      !artifactIsEmail_(normalized.actor) ||
      !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(normalized.reasonCode) ||
      !normalized.committedAt
    ) {
      throw new Error("成果物設定の変更履歴が不正です。自動修復せず監査してください。");
    }
    return normalized;
  });
  var correlationIds = {};
  var idempotencyHashes = {};
  for (var historyIndex = 0; historyIndex < normalizedRows.length; historyIndex++) {
    var current = normalizedRows[historyIndex];
    if (correlationIds[current.correlationId] || idempotencyHashes[current.idempotencyKeyHash]) {
      throw new Error("成果物設定の変更履歴に重複識別子があります。自動修復せず監査してください。");
    }
    correlationIds[current.correlationId] = true;
    idempotencyHashes[current.idempotencyKeyHash] = true;
    if (historyIndex > 0) {
      var previous = normalizedRows[historyIndex - 1];
      if (
        current.versionBefore !== previous.versionAfter ||
        current.beforeHash !== previous.afterHash
      ) {
        throw new Error("成果物設定の変更履歴が連続していません。自動修復せず監査してください。");
      }
    }
  }
  return normalizedRows;
}

function artifactSettingsSemanticValue_(settings, bankAccountText, legacyOutputFolders) {
  return {
    settings: artifactStoredSettingsObject_(settings),
    bankAccountText: artifactText_(bankAccountText),
    legacyOutputFolders: artifactNormalizeLegacyOutputFolders_(legacyOutputFolders)
  };
}

function artifactSettingsStateEnvelopeValue_(state) {
  return {
    format: state.format,
    schemaVersion: Number(state.schemaVersion),
    version: Number(state.version),
    settings: artifactStoredSettingsObject_(state.settings),
    bankAccountText: artifactText_(state.bankAccountText),
    legacyOutputFolders: artifactNormalizeLegacyOutputFolders_(state.legacyOutputFolders),
    contentHash: artifactText_(state.contentHash),
    updatedAt: artifactText_(state.updatedAt),
    updatedBy: artifactText_(state.updatedBy).toLowerCase(),
    lastMutation: state.lastMutation || null,
    history: artifactNormalizeSettingsMutationHistory_(state.history)
  };
}

/**
 * V2を完全検証し、かつ検証した本文が現在値のままである場合に限り、
 * 旧V1設定と旧平文振込先を削除する。deleteProperty の応答喪失は
 * getProperties の読戻しで両キーの不存在を確認できた場合だけ成功とする。
 */
function artifactCleanupLegacySettingsProperties_(props, validatedState) {
  var result = {
    cleanupRequired: false,
    cleanupMessage: ""
  };
  if (
    !validatedState ||
    validatedState.isLegacy === true ||
    validatedState.format !== RENEWAL_ARTIFACT.SETTINGS_STATE_FORMAT ||
    Number(validatedState.schemaVersion) !== 2 ||
    Number(validatedState.version || 0) < 1 ||
    !artifactText_(validatedState.rawValue)
  ) {
    return result;
  }

  var currentV2Raw;
  try {
    currentV2Raw = props.getProperty(RENEWAL_ARTIFACT.SETTINGS_STATE_KEY);
  } catch (stateReadError) {
    result.cleanupRequired = true;
    result.cleanupMessage =
      "成果物設定V2の確認中に旧設定の清掃状態を読戻しできません。" +
      "次の設定更新を停止します。【担当部署に確認が必要】";
    return result;
  }
  if (currentV2Raw !== validatedState.rawValue) {
    result.cleanupRequired = true;
    result.cleanupMessage =
      "成果物設定V2が検証後に変化したため旧設定を削除していません。" +
      "最新設定を再読込してください。【担当部署に確認が必要】";
    return result;
  }

  var legacyKeys = [
    RENEWAL_ARTIFACT.SETTINGS_KEY,
    RENEWAL_ARTIFACT.BANK_KEY
  ];
  legacyKeys.forEach(function(key) {
    try {
      props.deleteProperty(key);
    } catch (deleteResponseError) {
      // 応答喪失か未削除かは、下の一括読戻しだけで判定する。
    }
  });

  var observedProperties;
  try {
    observedProperties = props.getProperties();
  } catch (readBackError) {
    result.cleanupRequired = true;
    result.cleanupMessage =
      "旧成果物設定の削除結果を読戻しできません。確定済みV2は保持していますが、" +
      "次の設定更新を停止します。【担当部署に確認が必要】";
    return result;
  }
  if (
    !observedProperties ||
    typeof observedProperties !== "object" ||
    Array.isArray(observedProperties) ||
    observedProperties[RENEWAL_ARTIFACT.SETTINGS_STATE_KEY] !== validatedState.rawValue
  ) {
    result.cleanupRequired = true;
    result.cleanupMessage =
      "旧成果物設定の削除後に、検証済み成果物設定V2を同一内容で確認できません。" +
      "次の設定更新を停止します。【担当部署に確認が必要】";
    return result;
  }
  var remainingKeys = legacyKeys.filter(function(key) {
    return Object.prototype.hasOwnProperty.call(observedProperties, key);
  });
  if (remainingKeys.length) {
    result.cleanupRequired = true;
    result.cleanupMessage =
      "旧成果物設定または旧平文振込先の清掃が完了していません。" +
      "確定済みV2は保持していますが、次の設定更新を停止します。" +
      "【担当部署に確認が必要】";
  }
  return result;
}

function artifactAssertLegacySettingsCleanupComplete_(stateOrSettings) {
  if (
    stateOrSettings &&
    (
      stateOrSettings.cleanupRequired === true ||
      stateOrSettings._legacySettingsCleanupRequired === true
    )
  ) {
    throw new Error(
      "旧成果物設定または旧平文振込先を清掃できないため、次の設定更新を停止しました。" +
      "確定済みの成果物設定V2は変更していません。【担当部署に確認が必要】"
    );
  }
  return true;
}

function artifactLoadSettingsState_() {
  var props = PropertiesService.getScriptProperties();
  var stateRaw = props.getProperty(RENEWAL_ARTIFACT.SETTINGS_STATE_KEY);
  if (!stateRaw) {
    var legacyRaw = props.getProperty(RENEWAL_ARTIFACT.SETTINGS_KEY);
    var legacyStored = {};
    if (legacyRaw) {
      try {
        legacyStored = JSON.parse(legacyRaw);
      } catch (settingsParseError) {
        throw new Error("保存済みの成果物設定JSONが破損しています。固定保存先へ推測で置き換えず、Script Propertiesの設定を監査してください。");
      }
    }
    var legacySettings = artifactNormalizeStoredSettings_(legacyStored);
    var legacySemantic = artifactSettingsSemanticValue_(
      legacySettings,
      props.getProperty(RENEWAL_ARTIFACT.BANK_KEY),
      []
    );
    return {
      format: RENEWAL_ARTIFACT.SETTINGS_STATE_FORMAT,
      schemaVersion: 2,
      version: 0,
      settings: legacySemantic.settings,
      bankAccountText: legacySemantic.bankAccountText,
      legacyOutputFolders: [],
      contentHash: artifactHashHex_(legacySemantic),
      updatedAt: "",
      updatedBy: "",
      lastMutation: null,
      history: [],
      envelopeHash: "",
      isLegacy: true,
      rawValue: ""
    };
  }

  var parsed;
  try {
    parsed = JSON.parse(stateRaw);
  } catch (stateParseError) {
    throw new Error("保存済みの成果物設定V2が破損しています。旧設定へ戻さず、Script Propertiesを監査してください。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("保存済みの成果物設定V2の形式が不正です。旧設定へ戻さず監査してください。");
  }
  var version = Number(parsed.version || 0);
  if (
    parsed.format !== RENEWAL_ARTIFACT.SETTINGS_STATE_FORMAT ||
    Number(parsed.schemaVersion) !== 2 ||
    version < 1 ||
    Math.floor(version) !== version
  ) {
    throw new Error("保存済みの成果物設定V2の版または識別情報が不正です。旧設定へ戻さず監査してください。");
  }
  var semantic = artifactSettingsSemanticValue_(
    parsed.settings,
    parsed.bankAccountText,
    parsed.legacyOutputFolders
  );
  var contentHash = artifactHashHex_(semantic);
  if (contentHash !== artifactText_(parsed.contentHash)) {
    throw new Error("保存済みの成果物設定V2の内容hashが一致しません。旧設定へ戻さず監査してください。");
  }
  var history = artifactNormalizeSettingsMutationHistory_(parsed.history);
  var lastMutation = parsed.lastMutation || null;
  if (!lastMutation || !history.length ||
      artifactCanonicalJson_(lastMutation) !== artifactCanonicalJson_(history[history.length - 1]) ||
      Number(lastMutation.versionAfter || 0) !== version ||
      artifactText_(lastMutation.afterHash) !== contentHash) {
    throw new Error("保存済みの成果物設定V2の変更証跡が不正です。旧設定へ戻さず監査してください。");
  }
  var normalizedState = {
    format: RENEWAL_ARTIFACT.SETTINGS_STATE_FORMAT,
    schemaVersion: 2,
    version: version,
    settings: semantic.settings,
    bankAccountText: semantic.bankAccountText,
    legacyOutputFolders: semantic.legacyOutputFolders,
    contentHash: contentHash,
    updatedAt: artifactText_(parsed.updatedAt),
    updatedBy: artifactText_(parsed.updatedBy).toLowerCase(),
    lastMutation: history[history.length - 1],
    history: history
  };
  if (!normalizedState.updatedAt || !artifactIsEmail_(normalizedState.updatedBy)) {
    throw new Error("保存済みの成果物設定V2の更新者または更新日時が不正です。旧設定へ戻さず監査してください。");
  }
  var envelopeHash = artifactHashHex_(artifactSettingsStateEnvelopeValue_(normalizedState));
  if (envelopeHash !== artifactText_(parsed.envelopeHash)) {
    throw new Error("保存済みの成果物設定V2の封筒hashが一致しません。旧設定へ戻さず監査してください。");
  }
  normalizedState.envelopeHash = envelopeHash;
  normalizedState.isLegacy = false;
  normalizedState.rawValue = stateRaw;
  var legacyCleanup = artifactCleanupLegacySettingsProperties_(props, normalizedState);
  normalizedState.cleanupRequired = legacyCleanup.cleanupRequired === true;
  normalizedState.cleanupMessage = artifactText_(legacyCleanup.cleanupMessage);
  return normalizedState;
}

function artifactSettingsUtf8Bytes_(value) {
  var text = String(value || "");
  var bytes = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length &&
      text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function artifactSettingsAuditRows_(spreadsheet, mutation) {
  if (
    typeof storeReadObjects_ !== "function" ||
    typeof storeSha256_ !== "function"
  ) {
    throw new Error("成果物設定のサーバー監査機能を利用できません。");
  }
  var correlationId = artifactText_(mutation && mutation.correlationId).toUpperCase();
  var rows = storeReadObjects_(spreadsheet, "audit").filter(function(row) {
    return artifactText_(row.correlationId).toUpperCase() === correlationId;
  });
  if (rows.length > 1) {
    throw new Error("同じ成果物設定correlationIdの監査行が複数あります。【担当部署に確認が必要】");
  }
  if (rows.length === 1) {
    var row = rows[0];
    if (
      artifactText_(row.eventState).toUpperCase() !== "COMMITTED" ||
      artifactText_(row.entityType).toUpperCase() !== "ARTIFACT_SETTINGS" ||
      artifactText_(row.entityKeyHash) !== storeSha256_("canonical-artifact-settings") ||
      artifactText_(row.action).toUpperCase() !== "ARTIFACT_SETTINGS_UPDATE" ||
      artifactText_(row.actor).toLowerCase() !== artifactText_(mutation.actor).toLowerCase() ||
      artifactText_(row.reasonCode).toUpperCase() !== artifactText_(mutation.reasonCode).toUpperCase() ||
      artifactText_(row.beforeHash) !== artifactText_(mutation.beforeHash) ||
      artifactText_(row.afterHash) !== artifactText_(mutation.afterHash) ||
      Number(row.versionBefore || 0) !== Number(mutation.versionBefore || 0) ||
      Number(row.versionAfter || 0) !== Number(mutation.versionAfter || 0)
    ) {
      throw new Error("成果物設定の監査行が確定stateと一致しません。【担当部署に確認が必要】");
    }
  }
  return rows;
}

function artifactEnsureSettingsMutationAudit_(state) {
  if (!state || !state.lastMutation) return true;
  if (
    typeof storeOpen_ !== "function" ||
    typeof storeAppendAudit_ !== "function"
  ) {
    throw new Error("成果物設定のサーバー監査機能を利用できません。");
  }
  var spreadsheet;
  try {
    spreadsheet = storeOpen_();
  } catch (openError) {
    return false;
  }
  var existing;
  try {
    existing = artifactSettingsAuditRows_(spreadsheet, state.lastMutation);
  } catch (readError) {
    throw readError;
  }
  if (existing.length === 1) return true;
  try {
    storeAppendAudit_(spreadsheet, {
      eventState: "COMMITTED",
      entityType: "ARTIFACT_SETTINGS",
      entityKey: "canonical-artifact-settings",
      action: "ARTIFACT_SETTINGS_UPDATE",
      actor: state.lastMutation.actor,
      reasonCode: state.lastMutation.reasonCode,
      approver: "",
      beforeHash: state.lastMutation.beforeHash,
      afterHash: state.lastMutation.afterHash,
      versionBefore: state.lastMutation.versionBefore,
      versionAfter: state.lastMutation.versionAfter,
      correlationId: state.lastMutation.correlationId
    });
  } catch (appendError) {
    try {
      return artifactSettingsAuditRows_(spreadsheet, state.lastMutation).length === 1;
    } catch (readBackError) {
      return false;
    }
  }
  try {
    return artifactSettingsAuditRows_(spreadsheet, state.lastMutation).length === 1;
  } catch (verifyError) {
    return false;
  }
}

function artifactCommitSettingsState_(nextSettings, bankAccountText, options) {
  options = options || {};
  var current = artifactLoadSettingsState_();
  artifactAssertLegacySettingsCleanupComplete_(current);
  if (!artifactEnsureSettingsMutationAudit_(current)) {
    throw new Error(
      "前回確定した成果物設定の監査行を回収できないため、次の更新を停止しました。" +
      "【担当部署に確認が必要】"
    );
  }
  var actor = artifactText_(options.actor).toLowerCase();
  if (!artifactIsEmail_(actor)) throw new Error("成果物設定の更新者メールを確認できないため保存を停止しました。");
  var reasonCode = artifactText_(options.reasonCode || "ARTIFACT_SETTINGS_UPDATE").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(reasonCode)) {
    throw new Error("成果物設定の変更理由コードが不正です。");
  }

  var nextStoredSettings = artifactStoredSettingsObject_(nextSettings);
  var legacyFolders = artifactNormalizeLegacyOutputFolders_(current.legacyOutputFolders);
  var currentOutputFolderId = artifactText_(current.settings.outputFolderId);
  if (
    currentOutputFolderId &&
    currentOutputFolderId !== RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID &&
    nextStoredSettings.outputFolderId === RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID &&
    !legacyFolders.some(function(row) { return row.folderId === currentOutputFolderId; })
  ) {
    legacyFolders.push({
      folderId: currentOutputFolderId,
      verifiedEmptyAt: artifactNowText_(),
      verifiedBy: actor,
      switchedAtVersion: current.version + 1
    });
  }
  var semantic = artifactSettingsSemanticValue_(
    nextStoredSettings,
    bankAccountText,
    legacyFolders
  );
  var requestHash = artifactHashHex_({
    semantic: semantic,
    reasonCode: reasonCode
  });
  var nextContentHash = artifactHashHex_(semantic);
  var idempotencyKey = artifactText_(options.idempotencyKey);
  if (!idempotencyKey && current.version === 0) {
    idempotencyKey = "legacy-settings-" + requestHash.slice(0, 40);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(idempotencyKey)) {
    throw new Error("成果物設定のidempotencyKeyは英数字で始まる8～160文字で指定してください。");
  }
  var idempotencyKeyHash = artifactHashHex_(idempotencyKey);
  var matchingIdempotencyMutations =
    artifactNormalizeSettingsMutationHistory_(current.history).filter(function(mutation) {
      return artifactText_(mutation.idempotencyKeyHash) === idempotencyKeyHash;
    });
  if (matchingIdempotencyMutations.length > 1) {
    throw new Error("成果物設定の変更履歴でidempotencyKeyが重複しています。【担当部署に確認が必要】");
  }
  if (matchingIdempotencyMutations.length === 1) {
    var matchingMutation = matchingIdempotencyMutations[0];
    if (artifactText_(matchingMutation.requestHash) !== requestHash) {
      throw new Error("同じidempotencyKeyが異なる成果物設定に再利用されました。保存を停止しました。");
    }
    if (
      current.lastMutation &&
      artifactText_(current.lastMutation.correlationId) === artifactText_(matchingMutation.correlationId)
    ) return current;
    throw new Error("このidempotencyKeyは過去の成果物設定更新で使用済みです。最新設定を再読込してください。");
  }
  if (!current.isLegacy && current.contentHash === nextContentHash) return current;

  var expectedVersion = options.expectedVersion;
  if (expectedVersion === undefined || expectedVersion === null || expectedVersion === "") {
    if (current.version > 0) {
      throw new Error("成果物設定の版番号がありません。画面を再読み込みしてから保存してください。");
    }
    expectedVersion = 0;
  }
  expectedVersion = Number(expectedVersion);
  if (expectedVersion !== current.version || Math.floor(expectedVersion) !== expectedVersion) {
    throw new Error(
      "成果物設定は別の担当者により更新されています。画面を再読み込みして内容を確認してください。" +
      "現在版=" + current.version
    );
  }

  var committedAt = artifactNowText_();
  var mutation = {
    correlationId: "ARTSET_" + artifactHashHex_([
      current.contentHash, nextContentHash, actor, idempotencyKeyHash, requestHash
    ]).slice(0, 48).toUpperCase(),
    idempotencyKeyHash: idempotencyKeyHash,
    requestHash: requestHash,
    beforeHash: current.contentHash,
    afterHash: nextContentHash,
    versionBefore: current.version,
    versionAfter: current.version + 1,
    actor: actor,
    reasonCode: reasonCode,
    committedAt: committedAt
  };
  var history = artifactNormalizeSettingsMutationHistory_(current.history)
    .concat([mutation]).slice(-6);
  var state = {
    format: RENEWAL_ARTIFACT.SETTINGS_STATE_FORMAT,
    schemaVersion: 2,
    version: current.version + 1,
    settings: semantic.settings,
    bankAccountText: semantic.bankAccountText,
    legacyOutputFolders: semantic.legacyOutputFolders,
    contentHash: nextContentHash,
    updatedAt: committedAt,
    updatedBy: actor,
    lastMutation: mutation,
    history: history
  };
  state.envelopeHash = artifactHashHex_(artifactSettingsStateEnvelopeValue_(state));
  var serialized = JSON.stringify(state);
  if (artifactSettingsUtf8Bytes_(serialized) > RENEWAL_ARTIFACT.SETTINGS_STATE_MAX_BYTES) {
    throw new Error("成果物設定が安全なScript Property容量を超えるため保存を停止しました。日程や設定件数を見直してください。");
  }

  var props = PropertiesService.getScriptProperties();
  var writeError = null;
  try {
    props.setProperty(RENEWAL_ARTIFACT.SETTINGS_STATE_KEY, serialized);
  } catch (error) {
    writeError = error;
  }
  var observed;
  try {
    observed = props.getProperty(RENEWAL_ARTIFACT.SETTINGS_STATE_KEY);
  } catch (readError) {
    var unreadable = new Error(
      "成果物設定の保存結果を読戻しできません。【担当部署に確認が必要】" +
      artifactErrorMessage_(writeError || readError)
    );
    unreadable.artifactSettingsOutcomeUncertain = true;
    throw unreadable;
  }
  if (observed !== serialized) {
    var mismatch = new Error(
      "成果物設定の保存結果が期待値と一致しません。再保存せず担当部署でScript Propertiesを確認してください。" +
      "【担当部署に確認が必要】" + (writeError ? artifactErrorMessage_(writeError) : "")
    );
    mismatch.artifactSettingsOutcomeUncertain = true;
    throw mismatch;
  }
  var verified = artifactLoadSettingsState_();
  if (
    verified.rawValue !== serialized ||
    verified.version !== state.version ||
    verified.envelopeHash !== state.envelopeHash
  ) {
    var verifyError = new Error("成果物設定の保存後検証に失敗しました。【担当部署に確認が必要】");
    verifyError.artifactSettingsOutcomeUncertain = true;
    throw verifyError;
  }
  var auditComplete = false;
  var auditErrorMessage = "";
  try {
    auditComplete = artifactEnsureSettingsMutationAudit_(verified);
  } catch (auditError) {
    auditErrorMessage = artifactErrorMessage_(auditError);
  }
  verified.auditRecoveryRequired = !auditComplete;
  verified.auditRecoveryMessage = auditComplete
    ? ""
    : "成果物設定は確定しましたが、サーバー監査行の回収が必要です。【担当部署に確認が必要】" +
      auditErrorMessage;
  verified.recoveryRequired =
    verified.auditRecoveryRequired === true ||
    verified.cleanupRequired === true;
  verified.recoveryMessage = [
    artifactText_(verified.auditRecoveryMessage),
    artifactText_(verified.cleanupMessage)
  ].filter(function(message) { return !!message; }).join(" ");
  return verified;
}

function artifactSettingsFromState_(state) {
  if (!state || typeof state !== "object") {
    throw new Error("成果物設定stateを内部設定へ変換できません。");
  }
  var settings = artifactNormalizeStoredSettings_(state.settings);
  settings._bankAccountText = artifactText_(state.bankAccountText);
  settings._settingsVersion = Number(state.version || 0);
  settings._settingsStateHash = artifactText_(state.contentHash);
  settings._legacyOutputFolders = artifactNormalizeLegacyOutputFolders_(state.legacyOutputFolders);
  settings._settingsMutationHistory = artifactNormalizeSettingsMutationHistory_(state.history);
  settings._settingsAuditRecoveryRequired = state.auditRecoveryRequired === true;
  settings._settingsAuditRecoveryMessage = artifactText_(state.auditRecoveryMessage);
  settings._legacySettingsCleanupRequired = state.cleanupRequired === true;
  settings._legacySettingsCleanupMessage = artifactText_(state.cleanupMessage);
  return settings;
}

function artifactLoadSettings_() {
  return artifactSettingsFromState_(artifactLoadSettingsState_());
}

function artifactPublicSettings_(settings, includeAdminDetails) {
  var storedOutputFolderId = artifactText_(settings.outputFolderId);
  var outputFolderMigrationRequired = Boolean(
    storedOutputFolderId &&
    storedOutputFolderId !== RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID
  );
  var result = {
    issuerCompany: settings.issuerCompany,
    issuerAddress: settings.issuerAddress,
    issuerPhone: settings.issuerPhone,
    issuerFax: settings.issuerFax,
    issuerEmail: settings.issuerEmail,
    invoiceRegistrationNo: settings.invoiceRegistrationNo,
    outputFolderId: RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID,
    outputFolderName: RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_NAME,
    outputFolderMigrationRequired: outputFolderMigrationRequired,
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
    settingsVersion: Number(settings._settingsVersion || 0),
    settingsAuditRecoveryRequired: settings._settingsAuditRecoveryRequired === true,
    settingsAuditRecoveryMessage: artifactText_(settings._settingsAuditRecoveryMessage),
    cleanupRequired: settings._legacySettingsCleanupRequired === true,
    cleanupWarning: artifactText_(settings._legacySettingsCleanupMessage),
    legacyOutputFolderCount: Array.isArray(settings._legacyOutputFolders)
      ? settings._legacyOutputFolders.length
      : 0,
    bankAccountConfigured: !!artifactText_(settings._bankAccountText),
    schedules: artifactNormalizeSchedules_(settings.schedules)
  };
  if (includeAdminDetails === true) {
    result.legacyOutputFolderId = outputFolderMigrationRequired ? storedOutputFolderId : "";
    result.legacyOutputFolderUrl = outputFolderMigrationRequired
      ? artifactFolderUrl_(storedOutputFolderId)
      : "";
    result.legacyOutputFolders = Array.isArray(settings._legacyOutputFolders)
      ? settings._legacyOutputFolders.map(function(row) {
        return {
          folderId: row.folderId,
          folderUrl: artifactFolderUrl_(row.folderId),
          verifiedEmptyAt: row.verifiedEmptyAt,
          verifiedBy: row.verifiedBy,
          switchedAtVersion: row.switchedAtVersion
        };
      })
      : [];
  }
  return result;
}

function artifactAssertLegacyOutputFolderSwitchSafe_(legacyFolderId) {
  var legacyId = artifactExtractDriveId_(legacyFolderId);
  if (!legacyId || legacyId === RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID) return true;

  var props = PropertiesService.getScriptProperties();
  var allProperties;
  try {
    allProperties = props.getProperties();
  } catch (propertyReadError) {
    throw new Error("旧保存先の監査情報を取得できないため、固定保存先への切替を停止しました。");
  }
  if (!allProperties || typeof allProperties !== "object") {
    throw new Error("旧保存先の監査情報が不完全なため、固定保存先への切替を停止しました。");
  }
  if (artifactText_(allProperties["RENEWAL_ARTIFACT_AUTO_ROOT_" + legacyId])) {
    throw new Error(
      "旧保存先に自動作成フォルダの登録履歴があります。自動移動・自動削除は行いません。" +
      "監査付き移行を完了してから固定保存先へ切り替えてください。【担当部署に確認が必要】"
    );
  }
  var cleanupFailureKeys = Object.keys(allProperties).filter(function(key) {
    return key.indexOf("RENEWAL_ARTIFACT_CLEANUP_FAILURE_") === 0 && artifactText_(allProperties[key]);
  });
  if (cleanupFailureKeys.length) {
    throw new Error(
      "未解決の成果物削除失敗記録があります。対象IDと旧保存先を監査し、解決記録を残すまで固定保存先へ切り替えられません。" +
      "【担当部署に確認が必要】件数=" + cleanupFailureKeys.length
    );
  }

  var legacyFolder;
  try {
    legacyFolder = DriveApp.getFolderById(legacyId);
    if (legacyFolder.isTrashed()) throw new Error("旧保存先がゴミ箱にあります。");
    legacyFolder.getName();
  } catch (legacyFolderError) {
    throw new Error(
      "旧保存先を取得・監査できないため、固定保存先への切替を停止しました。【担当部署に確認が必要】ID=" + legacyId
    );
  }
  if (typeof Drive === "undefined" || !Drive.Files || typeof Drive.Files.list !== "function") {
    throw new Error("旧保存先の全項目確認に必要なAdvanced Drive API v3が利用できないため切替を停止しました。");
  }
  var response;
  try {
    response = Drive.Files.list({
      q: "'" + legacyId + "' in parents",
      pageSize: 2,
      fields: "nextPageToken,files(id,name,mimeType,trashed)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
  } catch (listError) {
    throw new Error("旧保存先の内容を列挙できないため、固定保存先への切替を停止しました。");
  }
  if (!response || !Array.isArray(response.files)) {
    throw new Error("旧保存先の内容一覧が不完全なため、固定保存先への切替を停止しました。");
  }
  if (response.files.length || artifactText_(response.nextPageToken)) {
    var firstIds = response.files.map(function(file) { return artifactText_(file.id); }).filter(Boolean).join(",");
    throw new Error(
      "旧保存先にファイルまたはフォルダが残っています。自動移動・自動削除は行いません。" +
      "監査付き移行を完了してから固定保存先へ切り替えてください。【担当部署に確認が必要】" +
      (firstIds ? "確認ID=" + firstIds : "")
    );
  }
  return true;
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

/** 発行日の翌日から数え、土日・祝日・設定済み閉庁日を除く5営業日目。 */
function artifactAssertDriveItemAcl_(item, allowedOutputEmails, label, options) {
  var itemLabel = artifactText_(label) || "Drive項目";
  options = options || {};
  var requireActorPermission = options.requireActorPermission !== false;
  var requireExactPermissions = options.requireExactPermissions !== false;
  var allowed = artifactAssertAllowedOutputEmails_(allowedOutputEmails);
  var allowedMap = {};
  for (var i = 0; i < allowed.length; i++) allowedMap[allowed[i]] = true;

  if (requireActorPermission) {
    var actor = artifactActiveActorEmail_();
    if (!actor) throw new Error(itemLabel + "を操作する実行者メールを取得できないため、ACL監査未完として停止しました。");
    if (!allowedMap[actor]) throw new Error(itemLabel + "の実行者メールが成果物アクセス許可一覧にありません: " + actor);
  }

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
  var seenPermissionEmails = {};
  var pageCount = 0;
  do {
    if (pageToken && seenPageTokens[pageToken]) throw new Error(itemLabel + "のACLページングが循環したため、監査未完として停止しました。");
    if (pageToken) seenPageTokens[pageToken] = true;
    if (++pageCount > 1000) throw new Error(itemLabel + "のACLページ数が上限を超えたため、監査未完として停止しました。");
    var response;
    try {
      var requestOptions = {
        pageSize: 100,
        supportsAllDrives: true,
        fields: "nextPageToken,permissions(id,type,emailAddress,domain,role,deleted,permissionDetails(inherited,inheritedFrom,permissionType,role))"
      };
      if (pageToken) requestOptions.pageToken = pageToken;
      response = Drive.Permissions.list(itemId, requestOptions);
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
      seenPermissionEmails[permissionEmail] = true;
    }
    pageToken = artifactText_(response.nextPageToken);
  } while (pageToken);
  if (requireExactPermissions) {
    for (var allowedIndex = 0; allowedIndex < allowed.length; allowedIndex++) {
      if (!seenPermissionEmails[allowed[allowedIndex]]) {
        throw new Error(itemLabel + "の実際のDrive権限に、許可一覧のメールがありません: " + allowed[allowedIndex]);
      }
    }
  }
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

function artifactAssertOwnerOnlyDriveItem_(item, expectedParentId, label) {
  var itemLabel = artifactText_(label) || "所有者専用Drive項目";
  var owner;
  var ownerEmail = "";
  var editors;
  var viewers;
  try {
    owner = item.getOwner();
    ownerEmail = artifactText_(owner && owner.getEmail ? owner.getEmail() : "").toLowerCase();
    editors = item.getEditors();
    viewers = item.getViewers();
  } catch (aclReadError) {
    throw new Error(itemLabel + "の所有者専用ACLを確認できないため停止しました。");
  }
  if (!ownerEmail) throw new Error(itemLabel + "の所有者メールを確認できないため停止しました。");
  if ((editors && editors.length) || (viewers && viewers.length)) {
    throw new Error(itemLabel + "は所有者以外と共有されています。共有を解除してから再実行してください。");
  }
  return artifactAssertReusableDriveItem_(
    item,
    expectedParentId,
    itemLabel,
    [ownerEmail],
    { requireActorPermission: false, requireExactPermissions: true }
  );
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

function artifactNormalizeNumberList_(value) {
  var source = Array.isArray(value) ? value : String(value === null || value === undefined ? "" : value).split(/[\s,;]+/);
  return source.map(function(number) { return artifactText_(number); }).filter(Boolean);
}

function artifactBuildNumberingMigrationDryRun_(input, registryRows, todayIso) {
  input = input || {};
  registryRows = Array.isArray(registryRows) ? registryRows : [];
  var errors = [];
  var warnings = [
    "これは読取専用dry-runです。設定変更・採番予約・台帳更新は行っていません。",
    "担当部署がこのreportHashと既存台帳の原本を照合してから、採番移行確認済み設定を保存してください。"
  ];
  var cutoverMonth = artifactText_(input.cutoverMonth || input.numberingCutoverMonth);
  if (!artifactValidCutoverMonth_(cutoverMonth)) errors.push("採番切替年月はYYYY-MM形式の実在月で指定してください。");
  var confirmedDate = artifactValidIsoDateOrBlank_(input.confirmedDate);
  var confirmedBy = artifactText_(input.confirmedBy);
  var today = artifactValidIsoDateOrBlank_(todayIso);
  if (!confirmedDate || (today && confirmedDate > today)) errors.push("既存台帳照合日は未来日でないyyyy-MM-dd形式で指定してください。");
  if (!confirmedBy || confirmedBy.length > 100) errors.push("既存台帳の照合担当者を100文字以内で指定してください。");
  if (input.certificateSourceChecked !== true) errors.push("既存の修了証明書発行台帳を全件照合した確認が必要です。");
  if (input.dipsSourceChecked !== true) errors.push("DIPS既存申請者IDを全件照合した確認が必要です。");

  var externalCertificates = artifactNormalizeNumberList_(input.existingCertificateNumbers);
  var externalDips = artifactNormalizeNumberList_(input.existingDipsApplicantIds);
  var externalCertificateSeen = {};
  var externalDipsSeen = {};
  externalCertificates.forEach(function(number) {
    if (!/^UC0157\d{8}$/.test(number) || !artifactValidYearMonthToken_(number.slice(6, 10))) {
      errors.push("既存修了証明書番号の形式が不正です: " + number);
    }
    if (externalCertificateSeen[number]) errors.push("既存修了証明書番号一覧に重複があります: " + number);
    externalCertificateSeen[number] = true;
  });
  externalDips.forEach(function(number) {
    if (!/^\d{6}$/.test(number) || !artifactValidYearMonthToken_(number.slice(0, 4))) {
      errors.push("既存DIPS申請者IDの形式が不正です: " + number);
    }
    if (externalDipsSeen[number]) errors.push("既存DIPS申請者ID一覧に重複があります: " + number);
    externalDipsSeen[number] = true;
  });

  var registryCertificateOwners = {};
  var registryDipsOwners = {};
  function addRegistryNumber(map, number, recordId) {
    if (!number) return;
    if (!map[number]) map[number] = {};
    map[number][recordId || "(recordId空欄)"] = true;
  }
  registryRows.forEach(function(row) {
    var numbers = artifactText_(row && row.documentNumbers).split(";").map(function(number) { return artifactText_(number); });
    for (var i = 0; i < numbers.length; i++) {
      if (/^UC0157\d{8}$/.test(numbers[i])) addRegistryNumber(registryCertificateOwners, numbers[i], artifactText_(row.recordId));
      else if (/^\d{6}$/.test(numbers[i])) addRegistryNumber(registryDipsOwners, numbers[i], artifactText_(row.recordId));
    }
  });
  Object.keys(registryCertificateOwners).forEach(function(number) {
    var owners = Object.keys(registryCertificateOwners[number]);
    if (owners.length > 1) errors.push("成果物レジストリで修了証明書番号が複数recordIdに重複しています: " + number);
  });
  Object.keys(registryDipsOwners).forEach(function(number) {
    var owners = Object.keys(registryDipsOwners[number]);
    if (owners.length > 1) errors.push("成果物レジストリでDIPS申請者IDが複数recordIdに重複しています: " + number);
  });

  var yyMm = artifactValidCutoverMonth_(cutoverMonth)
    ? cutoverMonth.slice(2, 4) + cutoverMonth.slice(5, 7)
    : "";
  var certificatePrefix = yyMm ? "UC0157" + yyMm : "";
  var dipsPrefix = yyMm;
  var allCertificates = Object.keys(registryCertificateOwners).concat(externalCertificates);
  var allDips = Object.keys(registryDipsOwners).concat(externalDips);
  var certificateMax = 0;
  var dipsMax = 0;
  allCertificates.forEach(function(number) {
    if (certificatePrefix && number.indexOf(certificatePrefix) === 0) certificateMax = Math.max(certificateMax, Number(number.slice(-4)));
  });
  allDips.forEach(function(number) {
    if (dipsPrefix && number.indexOf(dipsPrefix) === 0) dipsMax = Math.max(dipsMax, Number(number.slice(-2)));
  });
  if (certificateMax >= 9999) errors.push("切替月の修了証明書連番が9999件に達しているため自動採番へ移行できません。");
  if (dipsMax >= 99) errors.push("切替月のDIPS連番が99件に達しているため自動採番へ移行できません。");
  var recommendedCertificateSeed = certificatePrefix ? certificatePrefix + artifactPad_(certificateMax, 4) : "";
  var recommendedDipsSeed = dipsPrefix ? dipsPrefix + artifactPad_(dipsMax, 2) : "";
  var proposedCertificateSeed = artifactText_(input.certificateSequenceSeed);
  var proposedDipsSeed = artifactText_(input.dipsSequenceSeed);
  if (proposedCertificateSeed && proposedCertificateSeed !== recommendedCertificateSeed) {
    errors.push("修了証明書の採番開始値はdry-run推奨値（" + recommendedCertificateSeed + "）と一致させてください。");
  }
  if (proposedDipsSeed && proposedDipsSeed !== recommendedDipsSeed) {
    errors.push("DIPSの採番開始値はdry-run推奨値（" + recommendedDipsSeed + "）と一致させてください。");
  }

  var summary = {
    cutoverMonth: cutoverMonth,
    registryRowCount: registryRows.length,
    externalCertificateCount: externalCertificates.length,
    externalDipsCount: externalDips.length,
    cutoverCertificateMax: certificateMax,
    cutoverDipsMax: dipsMax,
    recommendedCertificateSequenceSeed: recommendedCertificateSeed,
    recommendedDipsSequenceSeed: recommendedDipsSeed,
    nextCertificateNo: certificateMax < 9999 && certificatePrefix ? certificatePrefix + artifactPad_(certificateMax + 1, 4) : "",
    nextDipsApplicantId: dipsMax < 99 && dipsPrefix ? dipsPrefix + artifactPad_(dipsMax + 1, 2) : "",
    confirmedDate: confirmedDate || "",
    confirmedBy: confirmedBy
  };
  var reportHash = artifactHashHex_({
    summary: summary,
    externalCertificates: externalCertificates.slice().sort(),
    externalDips: externalDips.slice().sort(),
    registryNumbers: {
      certificates: Object.keys(registryCertificateOwners).sort(),
      dips: Object.keys(registryDipsOwners).sort()
    }
  });
  return {
    success: true,
    ready: errors.length === 0,
    errors: errors,
    warnings: warnings,
    summary: summary,
    reportHash: reportHash,
    generatedAt: artifactNowText_()
  };
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
  if (initialized && cutoverMonth) {
    var cutoverYyMm = cutoverMonth.slice(2, 4) + cutoverMonth.slice(5, 7);
    if (certificateSeed && certificateSeed.slice(6, 10) !== cutoverYyMm) {
      throw new Error("修了証明書番号の採番開始値YYMMは採番切替年月と一致させてください。");
    }
    if (dipsSeed && dipsSeed.slice(0, 4) !== cutoverYyMm) {
      throw new Error("DIPS申請者IDの採番開始値YYMMは採番切替年月と一致させてください。");
    }
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
  if (id !== RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_ID) {
    throw new Error(
      "成果物の保存先は承認済みの「" +
      RENEWAL_ARTIFACT.PINNED_OUTPUT_PARENT_FOLDER_NAME +
      "」フォルダに固定されています。設定と保存履歴を確認してください。"
    );
  }

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

function artifactAssertReusableDriveItem_(item, expectedParentId, label, allowedOutputEmails, aclOptions) {
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
  artifactAssertDriveItemAcl_(item, allowedOutputEmails, itemLabel, aclOptions);

  var hasExpectedParent = false;
  var parentCount = 0;
  try {
    var parents = item.getParents();
    while (parents.hasNext()) {
      parentCount++;
      if (parents.next().getId() === expected) hasExpectedParent = true;
    }
  } catch (parentError) {
    throw new Error(itemLabel + "の親フォルダを確認できないため、成果物作成を停止しました。");
  }
  if (!hasExpectedParent || parentCount !== 1) {
    throw new Error(itemLabel + "が現在の指定保存先の直下1か所だけにありません。移動先を確認してください。");
  }
  return item;
}

function artifactSettingsForHash_(kind, settings, holidayMaster, record) {
  var formalBilling = kind === "billing" && record && record._formalFinanceInvoice === true;
  var base = {
    outputFolderId: settings.outputFolderId,
    allowedOutputEmails: artifactNormalizeAllowedEmails_(settings.allowedOutputEmails),
    referenceSourcePins: artifactReferenceFingerprintForKind_(kind)
  };
  if (!formalBilling) base.issuerCompany = settings.issuerCompany;
  if (kind === "ledger") base.ledgerTemplateId = artifactText_(settings.ledgerTemplateId);
  if (kind === "certificate") base.certificateTemplateId = artifactText_(settings.certificateTemplateId);
  if (["ledger", "certificate", "dipsCsv"].indexOf(kind) >= 0) {
    base.numberingInitialized = artifactBoolean_(settings.numberingInitialized);
    base.numberingCutoverMonth = artifactText_(settings.numberingCutoverMonth);
  }
  if (kind === "dipsCsv") {
    base.holidayCalendarVersion = artifactText_((holidayMaster || RENEWAL_JAPAN_HOLIDAYS).version);
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
    if (formalBilling) {
      base.formalBillingSnapshot = artifactValidateFormalBillingSnapshot_(record.formalBillingSnapshot);
    } else {
      base.issuerAddress = settings.issuerAddress;
      base.issuerPhone = settings.issuerPhone;
      base.issuerFax = settings.issuerFax;
      base.issuerEmail = settings.issuerEmail;
      base.invoiceRegistrationNo = settings.invoiceRegistrationNo;
      base.bankAccountText = settings._bankAccountText;
    }
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

function artifactPreparedRecordFolderName_(autoRootId, recordId) {
  var rootId = artifactExtractDriveId_(autoRootId);
  var id = artifactText_(recordId);
  if (!rootId || !id) throw new Error("対象者フォルダの匿名作成予約名を確定できません。");
  return "CDP_PREPARED_RECORD_" + artifactShortKey_(rootId + "|" + id);
}

function artifactEnsureAutoRoot_(parentFolderId, allowedOutputEmails) {
  var parentId = artifactExtractDriveId_(parentFolderId);
  if (!parentId) throw new Error("成果物の出力先フォルダが設定されていません。");
  var parent = DriveApp.getFolderById(parentId);
  var props = PropertiesService.getScriptProperties();
  var key = "RENEWAL_ARTIFACT_AUTO_ROOT_" + parent.getId();
  var autoRootDriveOperation = artifactDriveAttemptOperation_(
    "CREATE",
    "",
    RENEWAL_ARTIFACT.AUTO_FOLDER_NAME,
    "application/vnd.google-apps.folder",
    parentId
  );
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
    artifactClearPublishedDriveAttempt_(
      autoRootDriveOperation, storedId, "自動作成フォルダ"
    );
    return storedFolder;
  }
  var folder = matchingFolders.length === 1
    ? matchingFolders[0]
    : artifactCreateFolderInFolder_(
      RENEWAL_ARTIFACT.AUTO_FOLDER_NAME,
      parent,
      "新規自動作成フォルダ",
      allowedOutputEmails,
      false
    );
  if (matchingFolders.length === 0) {
    try {
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
  artifactPublishDriveIdentityProperty_(
    props,
    key,
    folder.getId(),
    autoRootDriveOperation,
    "自動作成フォルダ"
  );
  return folder;
}

function artifactEnsureRecordFolder_(autoRoot, record, allowedOutputEmails) {
  var props = PropertiesService.getScriptProperties();
  var recordId = artifactText_(record.recordId);
  var key = "RENEWAL_ARTIFACT_RECORD_FOLDER_" + artifactShortKey_(autoRoot.getId() + "|" + recordId);
  var name = ("更新講習_" + artifactSafeName_(recordId) + "_" + artifactSafeName_(artifactRecordName_(record))).slice(0, 100);
  var preparedName = artifactPreparedRecordFolderName_(autoRoot.getId(), recordId);
  var recordFolderDriveOperation = artifactDriveAttemptOperation_(
    "CREATE",
    "",
    preparedName,
    "application/vnd.google-apps.folder",
    autoRoot.getId()
  );
  var preparedFolders = artifactIteratorItems_(autoRoot.getFoldersByName(preparedName), 2);
  if (preparedFolders.length) {
    var preparedIds = preparedFolders.map(function(folder) { return artifactText_(folder.getId()); }).join(",");
    throw new Error(
      "前回中断した匿名の対象者フォルダがあります。自動で改名・再利用せず停止しました。" +
      "【担当部署に確認が必要】ID=" + preparedIds
    );
  }
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
    artifactClearPublishedDriveAttempt_(
      recordFolderDriveOperation, storedId, "対象者フォルダ"
    );
    return storedFolder;
  }
  var folder = matchingFolders.length === 1
    ? matchingFolders[0]
    : artifactCreateFolderInFolder_(
      preparedName,
      autoRoot,
      "新規対象者フォルダ",
      allowedOutputEmails,
      false
    );
  if (matchingFolders.length === 0) {
    try {
      folder.setDescription(artifactGeneratedFileIdentity_("record-folder", autoRoot.getId(), recordId));
      folder.setName(name);
      if (artifactText_(folder.getName()) !== name) {
        throw new Error("対象者フォルダ名の読戻しが一致しません。");
      }
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
  artifactPublishDriveIdentityProperty_(
    props,
    key,
    folder.getId(),
    recordFolderDriveOperation,
    "対象者フォルダ"
  );
  return folder;
}

/**
 * Commit or fail a prepared intent by replacing exactly the same registry row
 * in one range write.  Identity and read-back checks make the update
 * idempotent when the previous response was lost.
 */
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
    if (artifactText_(row.recordId) !== artifactText_(recordId) || ["prepared", "created", "error"].indexOf(artifactText_(row.status)) < 0) continue;
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
  var name = artifactAnnualLedgerFileName_(year);
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
  record.quoteDate = artifactValidIsoDateOrBlank_(record.quoteDate) ||
    artifactValidIsoDateOrBlank_(record.invoiceDate) || today;
  if (record._formalFinanceInvoice === true) {
    record.invoiceNo = artifactText_(record.invoiceNo);
    record.invoiceDate = artifactRequireIsoDate_(record.invoiceDate, "正式請求の請求日");
    record.accountingDate = artifactRequireIsoDate_(record.accountingDate, "正式請求の取引日");
    record.paymentDueDate = artifactRequireIsoDate_(record.paymentDueDate, "正式請求の支払期限");
    if (!record.invoiceNo) throw new Error("正式請求の請求書番号がありません。");
  } else {
    // Internal/pure compatibility only. Public APIs always require a formal
    // finance invoice before they can reach this branch for billing.
    record.invoiceDate = artifactValidIsoDateOrBlank_(record.invoiceDate) || today;
    record.paymentDueDate = artifactRequireIsoDate_(record.paymentDueDate, "入金期限");
    if (!artifactText_(record.invoiceNo)) {
      record.invoiceNo = artifactNextDailyNumber_(registryRows, "INV", record.invoiceDate);
    }
  }
  record.quoteExpiry = artifactValidIsoDateOrBlank_(record.quoteExpiry) || artifactQuoteDefaultExpiry_(record.quoteDate);
  if (!artifactText_(record.quoteNo)) record.quoteNo = artifactNextDailyNumber_(registryRows, "QT", record.quoteDate);
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
  record = record || {};
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
    if (record._formalFinanceInvoice === true) {
      fields = [
        "feeExTax", "discountExTax", "taxRate", "taxRounding",
        "quoteNo", "quoteDate", "quoteExpiry",
        "invoiceNo", "invoiceStatus", "invoiceDate", "accountingDate", "paymentDueDate",
        "financeInvoiceId", "financeInvoiceImmutableKey",
        "_formalBillingSubject", "formalBillingSnapshot",
        "formalBillingLines", "formalBillingTaxCategory",
        "formalBillingTotalExTax", "formalBillingTotalTax", "formalBillingTotalInclTax"
      ];
    } else {
      fields = [
        "targetName", "billingRecipientName", "billingHonorific", "billingAddress", "serviceCategory",
        "feeExTax", "discountExTax", "taxRate", "taxRounding",
        "quoteNo", "quoteDate", "quoteExpiry", "invoiceNo", "invoiceStatus", "invoiceDate", "accountingDate", "paymentDueDate",
        "taxExceptionApprovalDate", "taxExceptionApprovedBy", "taxExceptionReason",
        "financeInvoiceId", "financeInvoiceImmutableKey",
        "formalBillingLines", "formalBillingTaxCategory",
        "formalBillingTotalExTax", "formalBillingTotalTax", "formalBillingTotalInclTax"
      ];
    }
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
  if (record._formalFinanceInvoice === true) {
    var formalExTax = Number(record.formalBillingTotalExTax);
    var formalTax = Number(record.formalBillingTotalTax);
    var formalTotal = Number(record.formalBillingTotalInclTax);
    var formalFee = Number(record.feeExTax);
    var formalDiscount = Number(record.discountExTax);
    if (
      !Number.isSafeInteger(formalExTax) || formalExTax < 0 ||
      !Number.isSafeInteger(formalTax) || formalTax < 0 ||
      !Number.isSafeInteger(formalTotal) || formalTotal < 0 ||
      !Number.isSafeInteger(formalFee) || formalFee < 0 ||
      !Number.isSafeInteger(formalDiscount) || formalDiscount < 0 ||
      formalFee - formalDiscount !== formalExTax ||
      formalExTax + formalTax !== formalTotal
    ) {
      throw new Error("正式会計の請求合計が不正です。");
    }
    return {
      feeExTax: formalFee,
      discountExTax: formalDiscount,
      netExTax: formalExTax,
      taxRate: Number(record.taxRate),
      rounding: artifactText_(record.taxRounding),
      tax: formalTax,
      total: formalTotal
    };
  }
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

function artifactFiscalYearFromIso_(value) {
  var iso = artifactValidIsoDateOrBlank_(value);
  if (!iso) return "";
  var parts = iso.split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  return String(month >= 4 ? year : year - 1);
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
    var failureKey = "RENEWAL_ARTIFACT_CLEANUP_FAILURE_" + artifactShortKey_(keySeed);
    var originalCode = artifactText_(originalError && originalError.code);
    var cleanupCode = artifactText_(cleanupError && cleanupError.code);
    if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(originalCode)) {
      originalCode = "UNCLASSIFIED";
    }
    if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(cleanupCode)) {
      cleanupCode = "UNCLASSIFIED";
    }
    PropertiesService.getScriptProperties().setProperty(
      failureKey,
      JSON.stringify({
        failureKey: failureKey, status: "UNRESOLVED",
        detectedAt: artifactNowText_(),
        itemType: artifactText_(info.itemType),
        labelHash: artifactHashHex_(artifactText_(info.label)),
        fileId: artifactText_(info.fileId),
        fileNameHash: artifactHashHex_(artifactText_(info.fileName)),
        ledgerRow: Number(info.ledgerRow || 0),
        ledgerSheetNameHash: artifactHashHex_(
          artifactText_(info.ledgerSheetName)
        ),
        ledgerVersion: Number(info.ledgerVersion || 0),
        originalErrorCode: originalCode,
        originalErrorHash: artifactHashHex_(
          artifactErrorMessage_(originalError)
        ),
        cleanupErrorCode: cleanupCode,
        cleanupErrorHash: artifactHashHex_(
          artifactErrorMessage_(cleanupError)
        )
      })
    );
    return "";
  } catch (cleanupPropertyError) {
    return "cleanup監査property保存失敗: " + artifactErrorMessage_(cleanupPropertyError);
  }
}

function artifactCleanupFailureEntries_() {
  var properties;
  try {
    properties = PropertiesService.getScriptProperties().getProperties();
  } catch (readError) {
    throw new Error(
      "成果物の削除失敗記録を確認できないため、新しいDrive項目の作成を停止しました。" +
      "【担当部署に確認が必要】"
    );
  }
  if (!properties || typeof properties !== "object") {
    throw new Error(
      "成果物の削除失敗記録が不完全なため、新しいDrive項目の作成を停止しました。" +
      "【担当部署に確認が必要】"
    );
  }
  return Object.keys(properties).filter(function(key) {
    return key.indexOf("RENEWAL_ARTIFACT_CLEANUP_FAILURE_") === 0 &&
      artifactText_(properties[key]);
  }).sort().map(function(key) {
    var parsed = null;
    try { parsed = JSON.parse(artifactText_(properties[key])); }
    catch (parseError) {}
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { failureKey: key, status: "CORRUPT" };
    }
    return {
      failureKey: key,
      status: artifactText_(parsed.status) || "UNRESOLVED",
      detectedAt: artifactText_(parsed.detectedAt),
      itemType: artifactText_(parsed.itemType),
      label: "未解決のDrive項目",
      fileId: artifactText_(parsed.fileId),
      url: "",
      fileName: "",
      ledgerRow: Number(parsed.ledgerRow || 0),
      ledgerSheetName: "",
      ledgerVersion: Number(parsed.ledgerVersion || 0)
    };
  });
}

function artifactAssertNoUnresolvedCleanupFailures_() {
  var failures = artifactCleanupFailureEntries_();
  if (!failures.length) return true;
  throw new Error(
    "完全削除または台帳rollbackに失敗した成果物が残っているため、新しい成果物・原本を作成しません。" +
    "対象ID・台帳行を復旧し、監査記録を解決してから再実行してください。" +
    "【担当部署に確認が必要】件数=" + failures.length +
    " / key=" + failures.slice(0, 3).map(function(row) {
      return row.failureKey;
    }).join(",")
  );
}

function artifactPermanentlyDeleteNewDriveItem_(item, label, itemType, originalError) {
  var info = artifactDriveItemTrackingInfo_(item, label, itemType);
  if (!info.fileId) {
    var missingIdIssue = artifactPersistCleanupFailure_(
      info,
      originalError,
      new Error("完全削除対象のDrive IDを取得できません。")
    );
    var missingIdError = new Error(
      artifactErrorMessage_(originalError) + " 【担当部署に確認が必要】" +
      info.label + "の完全削除対象IDを取得できません。" +
      (missingIdIssue ? " / " + missingIdIssue : "")
    );
    missingIdError.artifactProvisional = info;
    throw missingIdError;
  }
  var permanentDeleteError = null;
  var permanentlyDeleted = false;
  try {
    if (typeof Drive === "undefined" || !Drive.Files || typeof Drive.Files.remove !== "function") {
      throw new Error("Advanced Drive API v3の完全削除APIを利用できません。");
    }
    Drive.Files.remove(info.fileId, { supportsAllDrives: true });
    permanentlyDeleted = true;
  } catch (removeError) {
    permanentDeleteError = removeError;
  }
  if (permanentlyDeleted) {
    artifactClearPublishedDriveAttemptsForResourceIds_(
      [info.fileId],
      info.label + "の完全削除"
    );
    return true;
  }

  var fallbackResults = [];
  try {
    item.setShareableByEditors(false);
    fallbackResults.push("再共有無効化");
  } catch (ignoredReshareError) {
    fallbackResults.push("再共有無効化失敗");
  }
  try {
    if (
      typeof item.setSharing === "function" &&
      typeof DriveApp !== "undefined" &&
      DriveApp.Access &&
      DriveApp.Permission
    ) {
      item.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      fallbackResults.push("一般共有解除");
    }
  } catch (ignoredGeneralSharingError) {
    fallbackResults.push("一般共有解除失敗");
  }
  try {
    var permissionResponse = Drive.Permissions && typeof Drive.Permissions.list === "function"
      ? Drive.Permissions.list(info.fileId, {
        pageSize: 100,
        supportsAllDrives: true,
        fields: "permissions(id,role,deleted),nextPageToken"
      })
      : null;
    if (permissionResponse && Array.isArray(permissionResponse.permissions) && !permissionResponse.nextPageToken) {
      for (var permissionIndex = 0; permissionIndex < permissionResponse.permissions.length; permissionIndex++) {
        var permission = permissionResponse.permissions[permissionIndex] || {};
        if (
          permission.deleted === true ||
          artifactText_(permission.role).toLowerCase() === "owner" ||
          !artifactText_(permission.id)
        ) continue;
        if (!Drive.Permissions || typeof Drive.Permissions.remove !== "function") {
          throw new Error("個別権限削除APIを利用できません。");
        }
        Drive.Permissions.remove(info.fileId, artifactText_(permission.id), { supportsAllDrives: true });
      }
      fallbackResults.push("個別権限解除");
    } else {
      fallbackResults.push("個別権限解除未完");
    }
  } catch (ignoredPermissionRemovalError) {
    fallbackResults.push("個別権限解除失敗");
  }
  try {
    item.setTrashed(true);
    fallbackResults.push("ゴミ箱移動");
  } catch (ignoredTrashError) {
    fallbackResults.push("ゴミ箱移動失敗");
  }

  var cleanupSummary = new Error(
    "完全削除失敗: " + artifactErrorMessage_(permanentDeleteError) +
    " / 暫定措置: " + fallbackResults.join(",")
  );
  var persistedIssue = artifactPersistCleanupFailure_(info, originalError, cleanupSummary);
  var propertyIssue = persistedIssue ? " / " + persistedIssue : "";
  var trackedError = new Error(
    artifactErrorMessage_(originalError) + " 【担当部署に確認が必要】" +
    info.label + "を完全削除できませんでした。ゴミ箱移動だけでは共有相手のアクセスが残るため未解決として記録しました。" +
    "種別=" + info.itemType + " / ID=" + info.fileId + " / URL=" + (info.url || "未取得") +
    " / cleanup=" + artifactErrorMessage_(cleanupSummary) + propertyIssue
  );
  trackedError.artifactProvisional = info;
  throw trackedError;
}

function artifactThrowAfterCleanup_(originalError, item, label, itemType) {
  artifactPermanentlyDeleteNewDriveItem_(item, label, itemType, originalError);
  throw originalError instanceof Error ? originalError : new Error(artifactErrorMessage_(originalError));
}
