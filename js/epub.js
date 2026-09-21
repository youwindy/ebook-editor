/* ================= EPUB 解析/保存 ================= */
(function () {
  "use strict";

  const U = window.EpubApp;
  const { $, normalizePath, dirOf, resolveHref, guessMime, hasParseError, escapeHtml, isMobile } = U;

  const META_KEYS = ["title", "creator", "language", "identifier"];

  const statusEl = U.$("status");
  const setStatus = (s) => {
    statusEl.textContent = s;
  };

  /* ================= 解析 ================= */
  function parseManifest() {
    U.manifest = Object.create(null);
    const items = U.opfDoc.getElementsByTagName("item");
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const id = it.getAttribute("id");
      const href = it.getAttribute("href");
      if (!id || !href) continue;
      U.manifest[id] = {
        id,
        href,
        mediaType: it.getAttribute("media-type") || "",
        properties: it.getAttribute("properties") || "",
        zipPath: U.findZipKey(normalizePath(U.opfDir + href)),
      };
    }
  }

  function parseSpine() {
    U.chapters = [];
    const refs = U.opfDoc.getElementsByTagName("itemref");
    for (let i = 0; i < refs.length; i++) {
      const item = U.manifest[refs[i].getAttribute("idref")];
      if (!item || !item.zipPath) continue;
      U.chapters.push({
        id: item.id,
        label: "\u7b2c " + (U.chapters.length + 1) + " \u7ae0",
        href: item.href,
        mediaType: item.mediaType,
        properties: item.properties,
        zipPath: item.zipPath,
      });
    }
  }

  /* ================= 目录标题（NCX + EPUB3 nav） ================= */
  function loadTocTitles() {
    const titles = Object.create(null);
    let navItem = null;
    let ncxItem = null;

    for (const id in U.manifest) {
      const it = U.manifest[id];
      if (!navItem && /\bnav\b/.test(it.properties)) navItem = it;
      if (!ncxItem && it.mediaType === "application/x-dtbncx+xml") ncxItem = it;
    }
    if (!ncxItem) {
      const spineEl = U.opfDoc.getElementsByTagName("spine")[0];
      const tocId = spineEl && spineEl.getAttribute("toc");
      if (tocId && U.manifest[tocId]) ncxItem = U.manifest[tocId];
    }

    const jobs = [];
    if (navItem && navItem.zipPath) {
      const f = U.zip.file(navItem.zipPath);
      if (f)
        jobs.push(
          f
            .async("string")
            .then((s) => parseNavTitles(s, navItem.zipPath, titles))
            .catch(() => {}),
        );
    }
    if (ncxItem && ncxItem.zipPath) {
      const f = U.zip.file(ncxItem.zipPath);
      if (f)
        jobs.push(
          f
            .async("string")
            .then((s) => parseNcxTitles(s, ncxItem.zipPath, titles))
            .catch(() => {}),
        );
    }

    return Promise.all(jobs).then(() => titles);
  }

  function parseNcxTitles(xml, baseFile, titles) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (hasParseError(doc)) return;
    const points = doc.getElementsByTagName("navPoint");
    for (let i = 0; i < points.length; i++) {
      const label = points[i].getElementsByTagName("navLabel")[0];
      const textEl = label && label.getElementsByTagName("text")[0];
      const content = points[i].getElementsByTagName("content")[0];
      if (!textEl || !content) continue;
      const src = content.getAttribute("src");
      if (!src) continue;
      const key = resolveHref(src, baseFile);
      const t = textEl.textContent.trim();
      if (t && !titles[key]) titles[key] = t;
    }
  }

  function parseNavTitles(xml, baseFile, titles) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (hasParseError(doc)) return;
    const navs = doc.getElementsByTagName("nav");
    let tocNav = null;
    for (let i = 0; i < navs.length; i++) {
      const type =
        navs[i].getAttribute("epub:type") ||
        navs[i].getAttributeNS("http://www.idpf.org/2007/ops", "type") ||
        "";
      if (/\btoc\b/.test(type)) {
        tocNav = navs[i];
        break;
      }
    }
    if (!tocNav && navs.length) tocNav = navs[0];
    if (!tocNav) return;

    const links = tocNav.getElementsByTagName("a");
    for (let i = 0; i < links.length; i++) {
      const href = links[i].getAttribute("href");
      if (!href) continue;
      const key = resolveHref(href, baseFile);
      const t = links[i].textContent.trim();
      if (t && !titles[key]) titles[key] = t;
    }
  }

  function applyTocTitles() {
    for (let i = 0; i < U.chapters.length; i++) {
      const ch = U.chapters[i];
      const t =
        U.chapterTitles[ch.zipPath] ||
        U.chapterTitles[normalizePath(ch.zipPath)];
      if (t) ch.label = t;
    }
  }

  /* ================= 元数据 ================= */
  function dcEl(name) {
    const md = U.opfDoc.getElementsByTagName("metadata")[0];
    if (!md) return null;
    return (
      md.getElementsByTagName("dc:" + name)[0] ||
      md.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", name)[0] ||
      md.getElementsByTagName(name)[0] ||
      null
    );
  }

  function ensureDc(name) {
    let el = dcEl(name);
    if (el) return el;
    const md = U.opfDoc.getElementsByTagName("metadata")[0];
    if (!md) return null;
    el = U.opfDoc.createElementNS("http://purl.org/dc/elements/1.1/", "dc:" + name);
    md.appendChild(el);
    return el;
  }

  function fillMeta() {
    META_KEYS.forEach((k) => {
      const el = dcEl(k);
      const input = $("m-" + k);
      input.value = el ? el.textContent.trim() : "";
      input.disabled = false;
    });
  }

  /* ================= 目录渲染 ================= */
  function renderToc() {
    const toc = $("toc");
    toc.innerHTML = "";
    if (!U.chapters.length) {
      toc.innerHTML = '<div class="empty">\u6ca1\u6709\u627e\u5230\u53ef\u7f16\u8f91\u7684\u7ae0\u8282</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    U.chapters.forEach((ch, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chap";
      btn.title = ch.zipPath || ch.label || "";
      btn.innerHTML =
        '<span class="chap-num">' +
        (idx + 1) +
        "</span>" +
        escapeHtml(ch.label);
      btn.addEventListener("click", () => {
        U.openChapter(idx).then(() => {
          if (window.innerWidth < 900) U.closeDrawer();
        });
      });
      frag.appendChild(btn);
    });
    toc.appendChild(frag);
  }

  function highlightToc() {
    const chaps = document.querySelectorAll(".chap");
    const activeIdx = U.current ? U.current.chapterIndex : -1;
    for (let i = 0; i < chaps.length; i++) {
      chaps[i].classList.toggle("active", i === activeIdx);
    }
  }

  /* ================= 预读 ================= */
  function preloadAllChapters(onProgress) {
    const total = U.chapters.length;
    if (!total) return Promise.resolve();

    const queue = U.chapters.map((_, i) => i);
    let active = 0;
    let done = 0;

    return new Promise((resolve) => {
      function pump() {
        if (queue.length === 0 && active === 0) return resolve();
        while (active < U.PRELOAD_CONCURRENCY && queue.length) {
          const idx = queue.shift();
          active++;
          const ch = U.chapters[idx];
          const f = U.zip.file(ch.zipPath);
          const p = f ? f.async("string") : Promise.resolve("");
          p.then(
            (t) => {
              U.chapterTextCache[idx] = t;
            },
            () => {
              U.chapterTextCache[idx] = "";
            },
          ).then(() => {
            active--;
            done++;
            if (onProgress) onProgress(done, total);
            pump();
          });
        }
      }
      pump();
    });
  }

  /* ================= 加载 EPUB ================= */
  function loadEpub(file) {
    U.resetState();
    U.mode = "epub";
    U.docName = file.name;
    U.fileName = file.name.replace(/\.epub$/i, "") + "-edited.epub";

    return JSZip.loadAsync(file).then((z) =>
      loadFromZip(z, file.name, file.size),
    );
  }

  function loadFromZip(z, displayName, size) {
    U.zip = z;
    U.buildZipKeyMap();

    const cf = U.zip.file("META-INF/container.xml");
    if (!cf) throw new Error("\u7f3a\u5c11 META-INF/container.xml");

    return cf
      .async("string")
      .then((xml) => {
        const cDoc = new DOMParser().parseFromString(xml, "application/xml");
        if (hasParseError(cDoc)) throw new Error("container.xml \u89e3\u6790\u5931\u8d25");
        const rootfile = cDoc.getElementsByTagName("rootfile")[0];
        if (!rootfile) throw new Error("container.xml \u4e2d\u6ca1\u6709 rootfile");

        U.opfPath = rootfile.getAttribute("full-path");
        U.opfDir = dirOf(U.opfPath);

        const opfFile = U.zip.file(U.opfPath);
        if (!opfFile) throw new Error("\u627e\u4e0d\u5230 OPF\uff1a" + U.opfPath);
        return opfFile.async("string");
      })
      .then((opfXml) => {
        U.opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
        if (hasParseError(U.opfDoc)) throw new Error("OPF \u89e3\u6790\u5931\u8d25");

        parseManifest();
        parseSpine();
        fillMeta();

        setStatus("\u6b63\u5728\u89e3\u6790\u76ee\u5f55\u2026");
        return loadTocTitles();
      })
      .then((titles) => {
        U.chapterTitles = titles;
        applyTocTitles();
        renderToc();

        setStatus("\u6b63\u5728\u9884\u8bfb\u7ae0\u8282\u2026");
        return preloadAllChapters((done, total) => {
          if (done % 10 === 0 || done === total) {
            setStatus("\u9884\u8bfb\u4e2d " + done + "/" + total + "\u2026");
          }
        });
      })
      .then(() => {
        $("saveBtn").disabled = false;

        let extra = "";
        if (typeof size === "number" && size > 0) {
          const kb =
            size < 1048576
              ? (size / 1024).toFixed(0) + " KB"
              : (size / 1048576).toFixed(1) + " MB";
          extra = " \xb7 " + kb;
        }
        setStatus(
          (displayName || U.docName) +
            extra +
            " \xb7 " +
            U.chapters.length +
            " \u7ae0",
        );

        if (U.chapters.length) return U.openChapter(0);
      });
  }

  /* ================= 保存 ================= */
  function rebuildEpub() {
    const out = new JSZip();
    out.file("mimetype", "application/epub+zip", { compression: "STORE" });

    const names = Object.keys(U.zip.files).sort();
    let chain = Promise.resolve();

    names.forEach((name) => {
      if (name === "mimetype") return;
      chain = chain.then(() => {
        const entry = U.zip.files[name];
        if (entry.dir) {
          out.folder(name);
          return;
        }
        return entry.async("uint8array").then((data) => {
          out.file(name, data, { compression: "DEFLATE" });
        });
      });
    });

    return chain.then(() =>
      out.generateAsync({
        type: "blob",
        mimeType: "application/epub+zip",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      }),
    );
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    U.clearDirty();
    setStatus(U.isMobile ? "\u5df2\u5bfc\u51fa\uff0c\u8bf7\u5728\u4e0b\u8f7d\u4e2d\u67e5\u770b" : "\u5df2\u4fdd\u5b58");
  }

  function deliver(blob) {
    const file = new File([blob], U.fileName, { type: "application/epub+zip" });

    if (U.isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator
        .share({ files: [file], title: U.fileName })
        .then(() => {
          U.clearDirty();
          setStatus("\u5df2\u5bfc\u51fa");
        })
        .catch((err) => {
          if (err.name === "AbortError") {
            setStatus("\u5df2\u53d6\u6d88");
            return;
          }
          downloadBlob(blob, U.fileName);
        });
    }

    downloadBlob(blob, U.fileName);
  }

  function saveEpub() {
    setStatus("\u6b63\u5728\u6253\u5305\u2026");
    U.commitCurrent()
      .then(() => {
        let ser = new XMLSerializer().serializeToString(U.opfDoc);
        ser = ser.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
        const opfXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + ser;
        U.zip.file(U.opfPath, opfXml);
        return rebuildEpub();
      })
      .then((blob) => deliver(blob))
      .catch((err) => {
        console.error(err);
        setStatus("\u4fdd\u5b58\u5931\u8d25\uff1a" + err.message);
      });
  }

  /* ================= 导出 ================= */
  const E = window.EpubApp;
  E.META_KEYS = META_KEYS;
  E.setStatus = setStatus;
  E.parseManifest = parseManifest;
  E.parseSpine = parseSpine;
  E.loadTocTitles = loadTocTitles;
  E.parseNcxTitles = parseNcxTitles;
  E.parseNavTitles = parseNavTitles;
  E.applyTocTitles = applyTocTitles;
  E.dcEl = dcEl;
  E.ensureDc = ensureDc;
  E.fillMeta = fillMeta;
  E.renderToc = renderToc;
  E.highlightToc = highlightToc;
  E.preloadAllChapters = preloadAllChapters;
  E.loadEpub = loadEpub;
  E.loadFromZip = loadFromZip;
  E.saveEpub = saveEpub;
  E.rebuildEpub = rebuildEpub;
  E.deliver = deliver;
  E.downloadBlob = downloadBlob;
})();
