/* ================= 状态管理 ================= */
(function () {
  "use strict";

  const U = window.EpubApp;

  let zip = null;
  let zipKeyMap = Object.create(null);
  let fileName = "edited.epub";
  let opfPath = "";
  let opfDir = "";
  let opfDoc = null;
  let manifest = Object.create(null);
  let chapters = [];
  let current = null;
  let chapterTitles = Object.create(null);
  let chapterTextCache = Object.create(null);
  let dirty = false;
  let mode = "epub";
  let docName = "";

  /* 路径 → zip key 索引 */
  function buildZipKeyMap() {
    zipKeyMap = Object.create(null);
    const keys = Object.keys(zip.files);
    for (let i = 0; i < keys.length; i++) {
      zipKeyMap[U.normalizePath(keys[i])] = keys[i];
    }
  }

  function findZipKey(normalized) {
    if (!zip) return null;
    if (zip.files[normalized]) return normalized;
    return zipKeyMap[normalized] || null;
  }

  function markDirty() {
    if (dirty) return;
    dirty = true;
    document.title = "\u2022 \u7535\u5b50\u4e66\u7f16\u8f91\u5668";
  }

  function clearDirty() {
    dirty = false;
    document.title = "\u7535\u5b50\u4e66\u7f16\u8f91\u5668";
  }

  function resetState() {
    zip = null;
    zipKeyMap = Object.create(null);
    opfPath = "";
    opfDir = "";
    opfDoc = null;
    manifest = Object.create(null);
    chapters = [];
    current = null;
    chapterTitles = Object.create(null);
    chapterTextCache = Object.create(null);
    clearDirty();
  }

  /* ================= 通用文档访问（epub / txt 共用） ================= */
  function getChapterText(i) {
    if (mode === "txt") {
      const ch = chapters[i];
      return ch ? ch.text || "" : "";
    }
    return chapterTextCache[i] || "";
  }

  function readChapter(i) {
    if (mode === "txt") {
      const ch = chapters[i];
      return Promise.resolve(ch ? ch.text || "" : "");
    }
    if (chapterTextCache[i] !== undefined) {
      return Promise.resolve(chapterTextCache[i]);
    }
    const ch = chapters[i];
    const f = zip && ch ? zip.file(ch.zipPath) : null;
    if (!f) return Promise.resolve("");
    return f.async("string").then((t) => {
      chapterTextCache[i] = t;
      return t;
    });
  }

  function writeChapter(i, text) {
    if (mode === "txt") {
      if (chapters[i]) chapters[i].text = text;
      return;
    }
    chapterTextCache[i] = text;
    if (chapters[i]) zip.file(chapters[i].zipPath, text);
  }

  function saveDoc() {
    return mode === "epub" ? U.saveEpub() : U.saveTxt();
  }

  /* 导出 */
  const S = U;
  Object.defineProperty(S, "zip", {
    get: () => zip,
    set: (v) => { zip = v; },
  });
  Object.defineProperty(S, "fileName", {
    get: () => fileName,
    set: (v) => { fileName = v; },
  });
  Object.defineProperty(S, "opfPath", {
    get: () => opfPath,
    set: (v) => { opfPath = v; },
  });
  Object.defineProperty(S, "opfDir", {
    get: () => opfDir,
    set: (v) => { opfDir = v; },
  });
  Object.defineProperty(S, "opfDoc", {
    get: () => opfDoc,
    set: (v) => { opfDoc = v; },
  });
  Object.defineProperty(S, "manifest", {
    get: () => manifest,
    set: (v) => { manifest = v; },
  });
  Object.defineProperty(S, "chapters", {
    get: () => chapters,
    set: (v) => { chapters = v; },
  });
  Object.defineProperty(S, "current", {
    get: () => current,
    set: (v) => { current = v; },
  });
  Object.defineProperty(S, "chapterTitles", {
    get: () => chapterTitles,
    set: (v) => { chapterTitles = v; },
  });
  Object.defineProperty(S, "chapterTextCache", {
    get: () => chapterTextCache,
    set: (v) => { chapterTextCache = v; },
  });
  Object.defineProperty(S, "dirty", {
    get: () => dirty,
  });
  Object.defineProperty(S, "mode", {
    get: () => mode,
    set: (v) => { mode = v; },
  });
  Object.defineProperty(S, "docName", {
    get: () => docName,
    set: (v) => { docName = v; },
  });
  S.buildZipKeyMap = buildZipKeyMap;
  S.findZipKey = findZipKey;
  S.markDirty = markDirty;
  S.clearDirty = clearDirty;
  S.resetState = resetState;
  S.getChapterText = getChapterText;
  S.readChapter = readChapter;
  S.writeChapter = writeChapter;
  S.saveDoc = saveDoc;
})();
