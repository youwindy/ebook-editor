/* ================= 格式互转（TXT <-> EPUB） ================= */
(function () {
  "use strict";

  const U = window.EpubApp;
  const { $, escapeHtml } = U;

  const CONTAINER_XML =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" ' +
    'media-type="application/oebps-package+xml"/></rootfiles></container>';

  function genUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function isoNow() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function collectMeta() {
    const val = (id) => ($(id) ? $(id).value.trim() : "");
    const base = (U.docName || "").replace(/\.(txt|epub)$/i, "");
    return {
      title: val("m-title") || base || "未命名",
      creator: val("m-creator"),
      language: val("m-language") || "zh",
      identifier: val("m-identifier"),
    };
  }

  /* ================= 文本 -> XHTML ================= */
  function textToXhtml(text) {
    const paras = String(text)
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/);
    const out = [];
    for (let i = 0; i < paras.length; i++) {
      const p = paras[i].replace(/^\n+|\n+$/g, "");
      if (!p) continue;
      out.push("<p>" + escapeHtml(p).replace(/\n/g, "<br/>") + "</p>");
    }
    return out.join("\n");
  }

  /* ================= XHTML -> 文本 ================= */
  function xhtmlToText(html) {
    const src = String(html).replace(/<\?xml[^>]*\?>/i, "");
    let doc;
    try {
      doc = new DOMParser().parseFromString(src, "text/html");
    } catch (e) {
      return src.replace(/<[^>]+>/g, "");
    }
    if (!doc || doc.getElementsByTagName("parsererror").length) {
      return src.replace(/<[^>]+>/g, "");
    }

    doc.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
    doc
      .querySelectorAll(
        "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,section,article,tr,figcaption",
      )
      .forEach((el) => el.appendChild(doc.createTextNode("\n")));

    const body = doc.body || doc.documentElement;
    let text = body ? body.textContent : "";
    text = text.replace(/\u00a0/g, " ");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  /* ================= TXT -> EPUB ================= */
  function buildEpubBlob() {
    const meta = collectMeta();
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("META-INF/container.xml", CONTAINER_XML);

    const oebps = "OEBPS/";
    const items = [];
    const spine = [];
    const navLis = [];
    const navPoints = [];

    for (let i = 0; i < U.chapters.length; i++) {
      const n = i + 1;
      const id = "chap" + n;
      const href = "chapter" + n + ".xhtml";
      const label = U.chapters[i].label || "第 " + n + " 章";
      const body = textToXhtml(U.getChapterText(i));

      const xhtml =
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        "<!DOCTYPE html>\n" +
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' +
        escapeHtml(meta.language) +
        '">\n<head><meta charset="utf-8"/><title>' +
        escapeHtml(label) +
        "</title></head>\n<body>\n<h1>" +
        escapeHtml(label) +
        "</h1>\n" +
        body +
        "\n</body></html>";
      zip.file(oebps + href, xhtml);

      items.push(
        '<item id="' + id + '" href="' + href +
          '" media-type="application/xhtml+xml"/>',
      );
      spine.push('<itemref idref="' + id + '"/>');
      navLis.push('<li><a href="' + href + '">' + escapeHtml(label) + "</a></li>");
      navPoints.push(
        '<navPoint id="nav' + n + '" playOrder="' + n + '">' +
          "<navLabel><text>" + escapeHtml(label) + "</text></navLabel>" +
          '<content src="' + href + '"/></navPoint>',
      );
    }

    const nav =
      '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" ' +
      'xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/>' +
      "<title>目录</title></head><body>" +
      '<nav epub:type="toc" id="toc"><h1>目录</h1><ol>' +
      navLis.join("") +
      "</ol></nav></body></html>";
    zip.file(oebps + "nav.xhtml", nav);
    items.push(
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" ' +
        'properties="nav"/>',
    );

    const ncx =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">' +
      "<head>" +
      '<meta name="dtb:uid" content="' + escapeHtml(meta.identifier || "") + '"/>' +
      "</head><docTitle><text>" + escapeHtml(meta.title) + "</text></docTitle>" +
      "<navMap>" + navPoints.join("") + "</navMap></ncx>";
    zip.file(oebps + "toc.ncx", ncx);
    items.push(
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    );

    const uid = meta.identifier || "urn:uuid:" + genUuid();
    const opf =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" ' +
      'unique-identifier="bookid">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="bookid">' + escapeHtml(uid) + "</dc:identifier>" +
      "<dc:title>" + escapeHtml(meta.title) + "</dc:title>" +
      "<dc:language>" + escapeHtml(meta.language) + "</dc:language>" +
      (meta.creator
        ? "<dc:creator>" + escapeHtml(meta.creator) + "</dc:creator>"
        : "") +
      '<meta property="dcterms:modified">' + isoNow() + "</meta>" +
      "</metadata><manifest>" + items.join("") + "</manifest>" +
      '<spine toc="ncx">' + spine.join("") + "</spine></package>";
    zip.file(oebps + "content.opf", opf);

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  function txtToEpub() {
    if (!U.chapters.length) return Promise.resolve();
    U.setStatus("正在生成 EPUB…");
    return U.commitCurrent()
      .then(() => buildEpubBlob())
      .then((blob) => {
        const name = (U.docName || "book").replace(/\.txt$/i, "") + ".epub";
        download(blob, name);
        U.setStatus("已导出 " + name);
      })
      .catch((err) => {
        console.error(err);
        U.setStatus("转换失败：" + err.message);
      });
  }

  /* ================= EPUB -> TXT ================= */
  function epubToTxt() {
    if (!U.chapters.length) return Promise.resolve();
    U.setStatus("正在转换…");
    return U.commitCurrent().then(() => {
      const parts = [];
      for (let i = 0; i < U.chapters.length; i++) {
        const label = U.chapters[i].label || "第 " + (i + 1) + " 章";
        const plain = xhtmlToText(U.getChapterText(i));
        parts.push(label);
        parts.push("");
        if (plain) parts.push(plain);
        parts.push("");
        parts.push("");
      }
      const blob = new Blob([parts.join("\n")], {
        type: "text/plain;charset=utf-8",
      });
      const name =
        (U.docName || "book").replace(/\.epub$/i, "") + ".txt";
      download(blob, name);
      U.setStatus("已导出 " + name);
    });
  }

  /* ================= 导出 ================= */
  const C = window.EpubApp;
  C.txtToEpub = txtToEpub;
  C.epubToTxt = epubToTxt;
  C.textToXhtml = textToXhtml;
  C.xhtmlToText = xhtmlToText;
})();
