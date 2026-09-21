/* ================= 入口：UI 初始化 ================= */
(function () {
  "use strict";

  if (typeof JSZip === "undefined") {
    document.body.innerHTML =
      '<div style="padding:40px 20px;font-family:system-ui;text-align:center;color:#374151">' +
      '<h2 style="font-size:16px;margin:0 0 8px">依赖加载失败</h2>' +
      '<p style="font-size:13px;color:#6b7280;margin:0">未能加载 JSZip，请检查网络后重试。</p>' +
      "</div>";
    return;
  }

  const U = window.EpubApp;
  const { $ } = U;

  /* ================= 抽屉 ================= */
  const drawer = $("drawer");
  const backdrop = $("backdrop");

  function setTocNav(active) {
    const el = document.querySelector('#bottomNav .bn-item[data-nav="toc"]');
    if (el) el.classList.toggle("active", active);
  }

  function openDrawer() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.classList.add("show");
    setTocNav(true);
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("show");
    setTocNav(false);
  }
  function toggleDrawer() {
    if (drawer.classList.contains("open")) closeDrawer();
    else openDrawer();
  }

  U.openDrawer = openDrawer;
  U.closeDrawer = closeDrawer;
  U.toggleDrawer = toggleDrawer;

  $("menuBtn").addEventListener("click", (e) => {
    e.preventDefault();
    toggleDrawer();
  });
  $("closeDrawer").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeDrawer();
  });
  backdrop.addEventListener("click", closeDrawer);

  /* ================= 面板切换 ================= */
  function showPane(name) {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $("pane-code").classList.toggle("show", name === "code");
    $("pane-preview").classList.toggle("show", name === "preview");
    if (name === "preview") U.updatePreview(true);
    document.querySelectorAll("#bottomNav .bn-item").forEach((b) => {
      if (b.dataset.nav !== "toc")
        b.classList.toggle("active", b.dataset.nav === name);
    });
  }
  U.showPane = showPane;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showPane(tab.dataset.tab));
  });

  /* ================= 底部导航（移动端） ================= */
  document.querySelectorAll("#bottomNav .bn-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nav = btn.dataset.nav;
      if (nav === "toc") {
        toggleDrawer();
        return;
      }
      showPane(nav);
      closeDrawer();
    });
  });

  if (window.innerWidth >= 900) $("metaPanel").open = true;

  /* ================= 文件操作 ================= */
  function confirmDiscard() {
    return (
      !U.dirty ||
      window.confirm("有未保存的修改，确定放弃并打开新文件？")
    );
  }

  function setMode(mode) {
    const isTxt = mode === "txt";
    U.mode = mode;
    document.body.classList.toggle("mode-epub", !isTxt);
    document.body.classList.toggle("mode-txt", isTxt);
    document.querySelectorAll(".txt-only").forEach((el) => {
      el.hidden = !isTxt;
    });
    document.querySelectorAll(".epub-only").forEach((el) => {
      el.hidden = isTxt;
    });
  }
  U.setMode = setMode;

  function handleFile(file) {
    const name = file.name.toLowerCase();
    if (/\.epub$/.test(name)) {
      setMode("epub");
      U.setStatus("正在解压…");
      return U.loadEpub(file);
    }
    if (/\.txt$/.test(name)) {
      setMode("txt");
      U.setStatus("正在读取…");
      return U.loadTxt(file);
    }
    return Promise.reject(new Error("请打开 .epub 或 .txt 文件"));
  }

  $("openBtn").addEventListener("click", () => $("fileInput").click());

  $("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!confirmDiscard()) return;
    handleFile(file).catch((err) => {
      console.error(err);
      U.setStatus("加载失败：" + err.message);
    });
  });

  /* ================= 元数据 ================= */
  U.META_KEYS.forEach((k) => {
    $("m-" + k).addEventListener("input", () => {
      if (U.mode === "epub") {
        const el = U.ensureDc(k);
        if (el) el.textContent = $("m-" + k).value;
      }
      U.markDirty();
    });
  });

  /* ================= 转换 ================= */
  const toEpubBtn = $("txt-to-epub");
  if (toEpubBtn) toEpubBtn.addEventListener("click", U.txtToEpub);
  const toTxtBtn = $("epub-to-txt");
  if (toTxtBtn) toTxtBtn.addEventListener("click", U.epubToTxt);

  /* ================= 保存 ================= */
  $("saveBtn").addEventListener("click", () => U.saveDoc());

  /* ================= 全局快捷键 ================= */
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === "Escape") {
      if (!$("findbar").hidden) {
        $("findbar").hidden = true;
        return;
      }
      if (window.innerWidth < 900) closeDrawer();
      return;
    }

    if (mod && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      $("findbar").hidden = false;
      U.recomputeMatches();
      $("re-pattern").focus();
      $("re-pattern").select();
      return;
    }

    if (mod && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (!$("saveBtn").disabled) U.saveDoc();
      return;
    }
  });

  /* ================= 离开确认 ================= */
  window.addEventListener("beforeunload", (e) => {
    if (!U.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ================= 拖放打开 ================= */
  const dropOverlay = $("dropOverlay");
  let dragDepth = 0;

  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types) return;
    if (e.dataTransfer.types.indexOf("Files") < 0) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.classList.add("show");
  });
  window.addEventListener("dragover", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types) return;
    if (e.dataTransfer.types.indexOf("Files") < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.classList.remove("show");
  });
  window.addEventListener("drop", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types) return;
    if (e.dataTransfer.types.indexOf("Files") < 0) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.remove("show");
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!/\.(epub|txt)$/i.test(f.name)) {
      U.setStatus("请拖入 .epub 或 .txt 文件");
      return;
    }
    if (!confirmDiscard()) return;
    handleFile(f).catch((err) => {
      console.error(err);
      U.setStatus("加载失败：" + err.message);
    });
  });

  /* ================= 初始化 ================= */
  setMode(U.mode || "epub");
  U.updateModeUI();
  showPane("code");

  /* ================= PWA ================= */
  if (
    "serviceWorker" in navigator &&
    location.protocol.indexOf("http") === 0
  ) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
