/* ================= 编辑器 / 预览 ================= */
(function () {
  "use strict";

  const U = window.EpubApp;
  const { $, dirOf, normalizePath, guessMime, findZipKey } = U;

  const editor = $("editor");

  /* ================= 章节编辑 ================= */
  let openSeq = 0;

  function openChapter(i) {
    if (i < 0 || i >= U.chapters.length) return Promise.resolve();
    const seq = ++openSeq;

    return commitCurrent()
      .then(() => {
        if (seq !== openSeq) return null;
        if (U.chapterTextCache[i] !== undefined) {
          return { i: i, text: U.chapterTextCache[i] };
        }
        const f = U.zip.file(U.chapters[i].zipPath);
        if (!f) return { i: i, text: "" };
        return f.async("string").then((t) => {
          U.chapterTextCache[i] = t;
          return { i: i, text: t };
        });
      })
      .then((res) => {
        if (seq !== openSeq || !res) return;

        const ch = U.chapters[res.i];
        U.current = ch;
        ch.chapterIndex = res.i;
        ch.originalText = res.text;

        editor.value = res.text;
        editor.disabled = false;

        U.highlightToc();
        if (!$("findbar").hidden) U.recomputeMatches();
        updatePreview(true);
        U.setStatus("\u7f16\u8f91\u4e2d\uff1a" + ch.label);

        if (window.innerWidth < 900) {
          const codeTab = document.querySelector('.tab[data-tab="code"]');
          if (codeTab) codeTab.click();
        }
      });
  }

  function commitCurrent() {
    if (!U.current) return Promise.resolve();
    const text = editor.value;
    if (text !== U.current.originalText) {
      U.zip.file(U.current.zipPath, text);
      U.chapterTextCache[U.current.chapterIndex] = text;
      U.current.originalText = text;
      U.markDirty();
    }
    return Promise.resolve();
  }

  /* ================= 预览（含资源内联） ================= */
  let previewTimer = null;
  let previewSeq = 0;
  let previewUrls = [];

  function clearPreviewUrls() {
    const old = previewUrls;
    previewUrls = [];
    if (!old.length) return;
    setTimeout(() => {
      old.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch (e) {}
      });
    }, 3000);
  }

  function makeBlobUrl(data, mime) {
    const blob = new Blob([data], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    previewUrls.push(url);
    return url;
  }

  function buildPreviewHtml(html, chapterZipPath) {
    return new Promise((resolve) => {
      const src = html.replace(/<\?xml[^>]*\?>/i, "");
      if (!U.zip || !chapterZipPath) return resolve(src);

      let doc;
      try {
        doc = new DOMParser().parseFromString(src, "text/html");
      } catch (e) {
        return resolve(src);
      }
      if (!doc || doc.getElementsByTagName("parsererror").length)
        return resolve(src);

      const chapterDir = dirOf(chapterZipPath);
      const tasks = [];

      const loadAsset = (baseDir, ref) => {
        const p = normalizePath(baseDir + ref);
        const key = findZipKey(p);
        if (!key) return null;
        const f = U.zip.file(key);
        return f ? { key, f } : null;
      };

      const rewriteCssUrls = (cssText, cssDir) => {
        const slots = [];
        const jobs = [];
        const marked = cssText.replace(
          /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
          (whole, q, ref) => {
            if (/^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i.test(ref))
              return whole;
            const asset = loadAsset(cssDir, ref);
            if (!asset) return whole;
            const i = slots.length;
            slots.push(whole);
            jobs.push(
              asset.f
                .async("uint8array")
                .then((data) => {
                  slots[i] =
                    "url(" + makeBlobUrl(data, guessMime(asset.key)) + ")";
                })
                .catch(() => {}),
            );
            return "\u0000" + i + "\u0000";
          },
        );
        if (!jobs.length) return Promise.resolve(cssText);
        return Promise.all(jobs).then(() =>
          marked.replace(/\u0000(\d+)\u0000/g, (w, n) => slots[+n] || w),
        );
      };

      const rewrite = (el, attr) => {
        const val = el.getAttribute(attr);
        if (!val) return;
        if (/^(https?:|data:|blob:|mailto:|tel:|#)/i.test(val)) return;

        const hashIdx = val.indexOf("#");
        const hash = hashIdx >= 0 ? val.slice(hashIdx) : "";
        const path = hashIdx >= 0 ? val.slice(0, hashIdx) : val;
        if (!path) return;

        const asset = loadAsset(chapterDir, path);
        if (!asset) return;

        tasks.push(
          asset.f
            .async("uint8array")
            .then((data) => {
              const url = makeBlobUrl(data, guessMime(asset.key));
              el.setAttribute(attr, url + hash);
            })
            .catch(() => {}),
        );
      };

      doc.querySelectorAll("img[src]").forEach((el) => rewrite(el, "src"));
      doc.querySelectorAll("link[rel~='stylesheet'][href]").forEach((el) => {
        const val = el.getAttribute("href");
        if (!val || /^(https?:|data:|blob:|#)/i.test(val)) return;
        const hashIdx = val.indexOf("#");
        const path = hashIdx >= 0 ? val.slice(0, hashIdx) : val;
        if (!path) return;
        const asset = loadAsset(chapterDir, path);
        if (!asset) return;
        tasks.push(
          asset.f
            .async("string")
            .then((cssText) => rewriteCssUrls(cssText, dirOf(asset.key)))
            .then((css) => {
              el.setAttribute("href", makeBlobUrl(css, "text/css"));
            })
            .catch(() => {}),
        );
      });
      doc.querySelectorAll("image").forEach((el) => {
        const xlink = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        if (xlink) {
          el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", xlink);
          rewrite(el, "xlink:href");
        }
        if (el.getAttribute("href")) rewrite(el, "href");
      });

      if (!tasks.length) return resolve(src);

      Promise.all(tasks).then(() => {
        resolve("<!DOCTYPE html>\n" + doc.documentElement.outerHTML);
      });
    });
  }

  function updatePreview(immediate) {
    clearTimeout(previewTimer);
    const seq = ++previewSeq;

    const run = () => {
      if (!U.current) {
        $("preview").srcdoc = editor.value;
        return;
      }
      clearPreviewUrls();
      buildPreviewHtml(editor.value, U.current.zipPath).then((html) => {
        if (seq !== previewSeq) return;
        $("preview").srcdoc = html;
      });
    };

    if (immediate) run();
    else previewTimer = setTimeout(run, 300);
  }

  /* ================= 编辑器事件 ================= */
  editor.addEventListener("input", () => {
    if (U.current) {
      U.chapterTextCache[U.current.chapterIndex] = editor.value;
      U.markDirty();
    }
    updatePreview(false);
    U.scheduleRecompute();
  });

  editor.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const s = editor.selectionStart;
    const t = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(t);
    editor.selectionStart = editor.selectionEnd = s + 2;
    if (U.current) {
      U.chapterTextCache[U.current.chapterIndex] = editor.value;
      U.markDirty();
    }
    updatePreview(false);
    U.scheduleRecompute();
  });

  /* ================= 导出 ================= */
  const E = window.EpubApp;
  E.openChapter = openChapter;
  E.commitCurrent = commitCurrent;
  E.updatePreview = updatePreview;
  E.buildPreviewHtml = buildPreviewHtml;
  E.clearPreviewUrls = clearPreviewUrls;
})();
