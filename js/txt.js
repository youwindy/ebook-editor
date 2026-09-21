/* ================= TXT 加载 / 拆章 / 保存 ================= */
(function () {
  "use strict";

  const U = window.EpubApp;
  const { $ } = U;

  const DEFAULT_PATTERN =
    "^\\s*第[0-9零一二三四五六七八九十百千两]+[章卷回节].*$";
  const DEFAULT_FLAGS = "m";

  /* ================= 编码 ================= */
  function decodeBuffer(buffer, encoding) {
    const bytes = new Uint8Array(buffer);

    if (encoding === "auto") {
      if (
        bytes.length >= 3 &&
        bytes[0] === 0xef &&
        bytes[1] === 0xbb &&
        bytes[2] === 0xbf
      ) {
        return new TextDecoder("utf-8").decode(bytes.subarray(3));
      }
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(bytes);
      }
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(bytes);
      }
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch (e) {
        /* 非 UTF-8，尝试 GBK */
      }
      try {
        return new TextDecoder("gbk").decode(bytes);
      } catch (e) {
        return new TextDecoder("utf-8").decode(bytes);
      }
    }

    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch (e) {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }

  /* ================= 拆章 ================= */
  function trimBlank(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start].trim() === "") start++;
    while (end > start && lines[end - 1].trim() === "") end--;
    return lines.slice(start, end);
  }

  function splitChapters(text, pattern, flags) {
    let re;
    try {
      const f = flags.indexOf("g") < 0 ? flags + "g" : flags;
      re = new RegExp(pattern, f);
    } catch (e) {
      throw new Error("正则无效：" + e.message);
    }

    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const chapters = [];
    const preface = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      re.lastIndex = 0;
      if (re.test(line)) {
        if (current) chapters.push(current);
        current = { label: line.trim(), lines: [] };
      } else if (current) {
        current.lines.push(line);
      } else {
        preface.push(line);
      }
    }
    if (current) chapters.push(current);

    const result = [];
    const preText = preface.join("\n").trim();
    if (preText) result.push({ label: "序", text: preText });

    for (let i = 0; i < chapters.length; i++) {
      result.push({
        label: chapters[i].label || "第 " + (i + 1) + " 章",
        text: trimBlank(chapters[i].lines).join("\n"),
      });
    }

    if (!result.length && String(text).trim()) {
      result.push({ label: "全文", text: String(text).trim() });
    }
    return result;
  }

  function applySplit(text, render) {
    const pattern = ($("txt-pattern") && $("txt-pattern").value) || DEFAULT_PATTERN;
    const flags = ($("txt-flags") && $("txt-flags").value) || DEFAULT_FLAGS;

    let list;
    try {
      list = splitChapters(text, pattern, flags);
    } catch (e) {
      U.setStatus("拆章失败：" + e.message);
      return false;
    }

    U.chapters = list.map((c, i) => ({
      id: "txt-" + i,
      label: c.label,
      text: c.text,
    }));
    U.chapterTextCache = Object.create(null);
    U.current = null;

    if (render) U.renderToc();
    updateSplitInfo();
    return true;
  }

  function updateSplitInfo() {
    const el = $("txt-split-info");
    if (!el) return;
    el.textContent = "共 " + U.chapters.length + " 章";
  }

  /* ================= 加载 / 保存 ================= */
  function loadTxt(file) {
    U.resetState();
    U.mode = "txt";
    U.docName = file.name;
    U.fileName = file.name.replace(/\.txt$/i, "") + "-edited.txt";

    U.META_KEYS.forEach((k) => {
      const el = $("m-" + k);
      if (el) {
        el.value = "";
        el.disabled = false;
      }
    });

    return file.arrayBuffer().then((buffer) => {
      const encoding =
        ($("txt-encoding") && $("txt-encoding").value) || "auto";
      const text = decodeBuffer(buffer, encoding);
      U.txtBuffer = buffer;
      U.txtRaw = text;

      if (!applySplit(text, true)) throw new Error("拆章失败");
      $("saveBtn").disabled = false;
      U.setStatus(
        file.name + " \xb7 " + U.chapters.length + " \u7ae0",
      );
      if (U.chapters.length) return U.openChapter(0);
    });
  }

  function saveTxt() {
    return U.commitCurrent().then(() => {
      const parts = [];
      for (let i = 0; i < U.chapters.length; i++) {
        parts.push(U.chapters[i].label);
        parts.push("");
        parts.push(U.getChapterText(i));
        parts.push("");
        parts.push("");
      }
      const blob = new Blob([parts.join("\n")], {
        type: "text/plain;charset=utf-8",
      });
      U.downloadBlob(blob, U.fileName);
    });
  }

  /* ================= 初始化 / 事件 ================= */
  const patternInput = $("txt-pattern");
  if (patternInput && !patternInput.value) patternInput.value = DEFAULT_PATTERN;
  const flagsInput = $("txt-flags");
  if (flagsInput && !flagsInput.value) flagsInput.value = DEFAULT_FLAGS;

  const resplitBtn = $("txt-resplit");
  if (resplitBtn) {
    resplitBtn.addEventListener("click", () => {
      if (U.mode !== "txt" || U.txtRaw === undefined) return;
      if (U.txtBuffer) {
        const encoding =
          ($("txt-encoding") && $("txt-encoding").value) || "auto";
        U.txtRaw = decodeBuffer(U.txtBuffer, encoding);
      }
      if (applySplit(U.txtRaw, true) && U.chapters.length) {
        U.openChapter(0);
        U.setStatus("已重新拆章，共 " + U.chapters.length + " 章");
      }
    });
  }

  /* ================= 导出 ================= */
  const T = window.EpubApp;
  T.DEFAULT_TXT_PATTERN = DEFAULT_PATTERN;
  T.DEFAULT_TXT_FLAGS = DEFAULT_FLAGS;
  T.splitChapters = splitChapters;
  T.loadTxt = loadTxt;
  T.saveTxt = saveTxt;
  T.applySplit = applySplit;
})();
