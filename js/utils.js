/* ================= 工具函数 ================= */
window.EpubApp = window.EpubApp || {};

(function () {
  "use strict";

  const CTX_BEFORE = 30;
  const CTX_AFTER = 30;
  const CTX_MATCH = 70;
  const MAX_MATCH_GLOBAL = 5000;
  const MAX_RENDER = 200;
  const PRELOAD_CONCURRENCY = 6;
  const MIME_MAP = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    css: "text/css",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    eot: "application/vnd.ms-fontobject",
  };

  const $ = (id) => document.getElementById(id);

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  function normalizePath(p) {
    if (!p) return "";
    let clean = p.split("#")[0];
    try {
      clean = decodeURIComponent(clean);
    } catch (e) {
      /* 非法编码，保留原样 */
    }
    const out = [];
    const parts = clean.split("/");
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (!seg || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return out.join("/");
  }

  function dirOf(path) {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(0, i + 1) : "";
  }

  function resolveHref(href, baseFile) {
    return normalizePath(dirOf(baseFile) + href);
  }

  function guessMime(path) {
    const ext = (path.split(".").pop() || "").toLowerCase();
    return MIME_MAP[ext] || "application/octet-stream";
  }

  function hasParseError(doc) {
    return !doc || doc.getElementsByTagName("parsererror").length > 0;
  }

  /* 导出 */
  const U = window.EpubApp;
  U.CTX_BEFORE = CTX_BEFORE;
  U.CTX_AFTER = CTX_AFTER;
  U.CTX_MATCH = CTX_MATCH;
  U.MAX_MATCH_GLOBAL = MAX_MATCH_GLOBAL;
  U.MAX_RENDER = MAX_RENDER;
  U.PRELOAD_CONCURRENCY = PRELOAD_CONCURRENCY;
  U.MIME_MAP = MIME_MAP;
  U.$ = $;
  U.isMobile = isMobile;
  U.escapeHtml = escapeHtml;
  U.normalizePath = normalizePath;
  U.dirOf = dirOf;
  U.resolveHref = resolveHref;
  U.guessMime = guessMime;
  U.hasParseError = hasParseError;
})();
