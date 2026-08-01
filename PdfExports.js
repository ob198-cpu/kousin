// @ts-nocheck
// Googleネイティブ成果物をPDF化し、利用者指定の固定フォルダへ同じIDで更新保存する。

var RENEWAL_PDF_EXPORT = {
  FORMAT: "CDP_RENEWAL_PDF_V1",
  OUTPUT_FOLDER_ID: "1mEa7LjNYge-Nesu02-zoyycwEpaEh_qZ",
  APPROVED_EMAILS: [
    "obata1986@gmail.com",
    "cdp.hokkaido.drone@gmail.com",
    "rokudosapporo@gmail.com",
    "obata.wsh@gmail.com",
    "obata@experiencing.info",
    "shibuya.cdp.hokkaido@gmail.com"
  ]
};

function renewalPdfRequireOutputFolder_(settings) {
  var configured = artifactExtractDriveId_(settings && settings.pdfOutputFolderId);
  if (configured !== RENEWAL_PDF_EXPORT.OUTPUT_FOLDER_ID) {
    throw new Error("PDF保存先が承認済みフォルダと一致しません。設定を監査してください。");
  }
  var folder;
  try {
    folder = DriveApp.getFolderById(configured);
    if (folder.isTrashed()) throw new Error("PDF保存先フォルダがゴミ箱にあります。");
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
      throw new Error("PDF保存先フォルダがリンク公開されています。共有設定を「制限付き」にしてください。");
    }
  } catch (error) {
    var message = artifactErrorMessage_(error);
    if (message.indexOf("ゴミ箱") >= 0 || message.indexOf("リンク公開") >= 0) throw error;
    throw new Error("PDF保存先フォルダを確認できません。編集権限を確認してください。");
  }
  var approved = {};
  RENEWAL_PDF_EXPORT.APPROVED_EMAILS.forEach(function(email) {
    approved[email] = true;
  });
  var observed = [];
  var seen = {};
  var token = "";
  do {
    var options = {
      pageSize: 100,
      supportsAllDrives: true,
      fields: "nextPageToken,permissions(type,emailAddress,role,deleted)"
    };
    if (token) options.pageToken = token;
    var response = Drive.Permissions.list(configured, options);
    if (!response || !Array.isArray(response.permissions)) {
      throw new Error("PDF保存先の共有権限を完全取得できません。");
    }
    response.permissions.forEach(function(permission) {
      if (!permission || permission.deleted === true) return;
      var type = artifactText_(permission.type).toLowerCase();
      if (type !== "user") {
        throw new Error("PDF保存先にユーザー以外の共有権限があります。リンク・ドメイン・グループ共有は使用できません。");
      }
      var email = artifactText_(permission.emailAddress).toLowerCase();
      if (!email || !approved[email]) {
        throw new Error("PDF保存先に承認されていない共有先があります: " + (email || "取得不能"));
      }
      if (!seen[email]) {
        seen[email] = true;
        observed.push(email);
      }
    });
    token = artifactText_(response.nextPageToken);
  } while (token);
  var actor = artifactActiveActorEmail_();
  if (!actor || !seen[actor]) {
    throw new Error("PDF保存先の共有権限に現在の実行者が含まれていません。");
  }
  return { folder: folder, allowedEmails: observed.sort() };
}

function renewalPdfIdentity_(scopeKey, sourceFileId) {
  return RENEWAL_PDF_EXPORT.FORMAT + "\n" + artifactCanonicalJson_({
    scopeKey: artifactText_(scopeKey),
    sourceFileId: artifactText_(sourceFileId)
  });
}

function renewalPdfExportBlob_(sourceFileId, fileName) {
  var id = artifactText_(sourceFileId);
  if (!id) throw new Error("PDF化するGoogleファイルIDがありません。");
  var blob;
  try {
    blob = Drive.Files.export(id, "application/pdf");
  } catch (error) {
    throw new Error("GoogleファイルをPDFへ変換できませんでした: " + artifactErrorMessage_(error));
  }
  if (!blob || typeof blob.getBytes !== "function" || !blob.getBytes().length) {
    throw new Error("PDF変換結果が空です。保存を停止しました。");
  }
  return blob.setName(fileName).setContentType("application/pdf");
}

function renewalPdfFindExisting_(folder, fileName, identity, allowedEmails) {
  var matches = [];
  var iterator = folder.getFilesByName(fileName);
  while (iterator.hasNext()) {
    var file = iterator.next();
    if (file.getMimeType() === "application/pdf" && !file.isTrashed()) matches.push(file);
  }
  if (matches.length > 1) {
    throw new Error("PDF保存先に同名PDFが複数あります。自動上書きを停止しました: " + fileName);
  }
  if (!matches.length) return null;
  var file = matches[0];
  if (artifactText_(file.getDescription()) !== identity) {
    throw new Error("同名PDFはこのシステムの管理ファイルと確認できないため上書きしません: " + fileName);
  }
  artifactAssertReusableDriveItem_(
    file, folder.getId(), "PDF出力", allowedEmails,
    { requireActorPermission: true, requireExactPermissions: true }
  );
  return file;
}

function renewalPdfExportAndSave_(sourceFile, scopeKey, settings) {
  if (!sourceFile || typeof sourceFile.getId !== "function") {
    throw new Error("PDF化するGoogleファイルがありません。");
  }
  var access = renewalPdfRequireOutputFolder_(settings || {});
  var sourceId = sourceFile.getId();
  var fileName = artifactSafeName_(sourceFile.getName()) + ".pdf";
  var identity = renewalPdfIdentity_(scopeKey, sourceId);
  var blob = renewalPdfExportBlob_(sourceId, fileName);
  var pdfFile = renewalPdfFindExisting_(
    access.folder, fileName, identity, access.allowedEmails
  );
  var created = false;
  if (pdfFile) {
    artifactUpdateBlobFileContent_(
      pdfFile, fileName, "application/pdf", blob, access.folder, "PDF出力"
    );
  } else {
    pdfFile = artifactCreateDriveItemInFolder_(
      fileName,
      "application/pdf",
      access.folder,
      "PDF出力",
      access.allowedEmails,
      false,
      blob
    );
    created = true;
    try {
      pdfFile.setDescription(identity);
      if (artifactText_(pdfFile.getDescription()) !== identity) {
        throw new Error("PDFの管理識別情報を保存・読戻しできません。");
      }
      artifactClearPublishedDriveAttempt_(
        artifactDriveAttemptOperation_(
          "CREATE", "", fileName, "application/pdf", access.folder.getId()
        ),
        pdfFile.getId(),
        "PDF出力"
      );
    } catch (identityError) {
      try {
        artifactPermanentlyDeleteNewDriveItem_(pdfFile, "作成途中のPDF", "file", identityError);
        artifactClearDriveAttempt_(artifactDriveAttemptKey_(
          artifactDriveAttemptOperation_(
            "CREATE", "", fileName, "application/pdf", access.folder.getId()
          )
        ));
      } catch (cleanupError) {
        throw new Error(
          artifactErrorMessage_(identityError) +
          " 作成途中PDFを完全削除できません。【担当部署に確認が必要】ID=" + pdfFile.getId()
        );
      }
      throw identityError;
    }
  }
  artifactAssertReusableDriveItem_(
    pdfFile, access.folder.getId(), "PDF出力", access.allowedEmails,
    { requireActorPermission: true, requireExactPermissions: true }
  );
  return {
    created: created,
    fileId: pdfFile.getId(),
    fileName: fileName,
    url: "https://drive.google.com/file/d/" + pdfFile.getId() + "/view",
    folderUrl: artifactFolderUrl_(access.folder.getId())
  };
}
