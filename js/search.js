/* ================= 查找替换 ================= */
(function () {
  "use strict";

  const U = window.EpubApp;
  const { $, escapeHtml, isMobile } = U;

  let matches = [];
  let currentIndex = 0;
  let reTimer = null;
  let searchMode = "regex";
  let scopeAll = false;

  const findbar = $("findbar");

  /* ================= 模式 / flags ================= */
  function updateModeUI() {
    const isRegex = searchMode === "regex";
    document
      .querySelectorAll('.flag[data-flag="m"], .flag[data-flag="s"]')
      .forEach((el) => {
        el.style.display = isRegex ? "" : "none";
      });
    $("re-pattern").placeholder = isRegex
      ? "正则，如 <p[^>]*>"
      : "查找文本（按字面匹配）";
    $("re-replace").placeholder = isRegex
      ? "替换为，可用 $1 $2 $& $<name>"
      : "替换为（纯文本，$ 不解析）";
  }

  function getFlags() {
    let f = "";
    document.querySelectorAll(".flag.on").forEach((el) => {
      if (el.id === "scope-all") return;
      f += el.dataset.flag;
    });
    if (searchMode === "text") f = f.replace(/[ms]/g, "");
    return f;
  }

  function buildRegex(pattern) {
    const source =
      searchMode === "regex"
        ? pattern
        : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let flags = getFlags();
    if (flags.indexOf("g") < 0) flags += "g";
    return new RegExp(source, flags);
  }

  /* ================= 匹配计算 ================= */
  function scheduleRecompute() {
    if (findbar.hidden) return;
    clearTimeout(reTimer);
    reTimer = setTimeout(recomputeMatches, scopeAll ? 400 : 200);
  }

  function recomputeMatches() {
    const pattern = $("re-pattern").value;
    const list = $("re-matches");

    matches = [];
    currentIndex = 0;

    if (!pattern) {
      list.innerHTML =
        '<div class="re-hint">输入' +
        (searchMode === "regex" ? "正则" : "文本") +
        "开始匹配</div>";
      updateSummary();
      return;
    }

    let re;
    try {
      re = buildRegex(pattern);
    } catch (err) {
      list.innerHTML =
        '<div class="re-hint error">' + escapeHtml(err.message) + "</div>";
      updateSummary();
      return;
    }

    const targets = [];
    if (scopeAll) {
      for (let ci = 0; ci < U.chapters.length; ci++) {
        targets.push({ idx: ci, text: U.getChapterText(ci) });
      }
    } else {
      const curIdx = U.current ? U.current.chapterIndex : -1;
      targets.push({ idx: curIdx, text: $("editor").value });
    }

    outer: for (let t = 0; t < targets.length; t++) {
      const target = targets[t];
      const text = target.text;
      if (text === undefined || text === null || text === "") continue;

      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({
          chapterIndex: target.idx,
          chapterLabel:
            target.idx >= 0 ? U.chapters[target.idx].label : "",
          index: m.index,
          length: m[0].length,
          match: m[0],
          groups:
            searchMode === "regex"
              ? Array.prototype.slice.call(m, 1)
              : [],
          named: searchMode === "regex" ? m.groups || {} : {},
        });
        if (matches.length >= U.MAX_MATCH_GLOBAL) break outer;
        if (m[0] === "") re.lastIndex++;
      }
    }

    renderMatches();
    if (matches.length) {
      currentIndex = 0;
      markActive();
    }
    updateSummary();
  }

  /* ================= 渲染匹配列表 ================= */
  function buildContextParts(text, m) {
    const mStart = m.index;
    const mEnd = m.index + m.length;
    const start = Math.max(0, mStart - U.CTX_BEFORE);
    const end = Math.min(text.length, mEnd + U.CTX_AFTER);

    const clean = (s) => s.replace(/\s+/g, " ");

    let before = clean(text.slice(start, mStart));
    let match = clean(text.slice(mStart, mEnd));
    let after = clean(text.slice(mEnd, end));

    if (match.length > U.CTX_MATCH) {
      const half = Math.floor((U.CTX_MATCH - 1) / 2);
      match =
        match.slice(0, half) + "…" + match.slice(match.length - half);
    }
    if (start > 0) before = "…" + before;
    if (end < text.length) after = after + "…";

    return { before, match, after };
  }

  function renderMatches() {
    const list = $("re-matches");
    if (!matches.length) {
      list.innerHTML = '<div class="re-hint">无匹配</div>';
      return;
    }

    const n = Math.min(matches.length, U.MAX_RENDER);
    const parts = [];
    const showChapter = scopeAll;

    for (let i = 0; i < n; i++) {
      const m = matches[i];
      const srcText =
        m.chapterIndex >= 0
          ? U.getChapterText(m.chapterIndex)
          : $("editor").value;
      const ctx = buildContextParts(srcText, m);

      const chips = [];
      m.groups.forEach((g, gi) => {
        if (g === undefined) return;
        const gv = g.length > 40 ? g.slice(0, 40) + "…" : g;
        chips.push(
          '<span class="re-g"><b>$' +
            (gi + 1) +
            "</b>=" +
            escapeHtml(gv) +
            "</span>",
        );
      });
      Object.keys(m.named).forEach((k) => {
        const v = m.named[k];
        if (v === undefined) return;
        const gv = v.length > 40 ? v.slice(0, 40) + "…" : v;
        chips.push(
          '<span class="re-g"><b>$&lt;' +
            escapeHtml(k) +
            "&gt;</b>=" +
            escapeHtml(gv) +
            "</span>",
        );
      });

      parts.push(
        '<div class="re-item" data-i="' + i + '">' +
          '<div class="re-item-head">' +
            '<span class="re-idx">' + (i + 1) + "</span>" +
            (showChapter && m.chapterLabel
              ? '<span class="re-chapter">' + escapeHtml(m.chapterLabel) + "</span>"
              : "") +
            (m.groups.length
              ? '<span class="re-count">' + m.groups.length + " 组</span>"
              : "") +
            '<span class="re-pos">@' + m.index + "</span>" +
          "</div>" +
          '<div class="re-context">' +
            '<span class="re-ctx-dim">' + escapeHtml(ctx.before) + "</span>" +
            '<mark class="re-ctx-match">' + escapeHtml(ctx.match) + "</mark>" +
            '<span class="re-ctx-dim">' + escapeHtml(ctx.after) + "</span>" +
          "</div>" +
          (chips.length
            ? '<div class="re-groups">' + chips.join("") + "</div>"
            : "") +
        "</div>",
      );
    }

    if (matches.length > U.MAX_RENDER) {
      parts.push(
        '<div class="re-hint">仅显示前 ' +
          U.MAX_RENDER +
          " 项，共 " +
          matches.length +
          " 项</div>",
      );
    }

    list.innerHTML = parts.join("");
    list.querySelectorAll(".re-item").forEach((el) => {
      el.addEventListener("click", () => selectMatch(+el.dataset.i));
    });
  }

  function markActive() {
    const items = document.querySelectorAll(".re-item");
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", i === currentIndex);
    }
    const active = document.querySelector(".re-item.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  /* ================= 选择 / 跳转 ================= */
  function selectMatch(i) {
    if (!matches[i]) return;
    currentIndex = i;
    const m = matches[i];

    if (
      m.chapterIndex >= 0 &&
      (!U.current || m.chapterIndex !== U.current.chapterIndex)
    ) {
      U.openChapter(m.chapterIndex).then(() => {
        let idx = matches.indexOf(m);
        if (idx < 0) {
          for (let j = 0; j < matches.length; j++) {
            const cand = matches[j];
            if (
              cand.chapterIndex === m.chapterIndex &&
              cand.index === m.index &&
              cand.length === m.length
            ) {
              idx = j;
              break;
            }
          }
        }
        if (idx < 0) idx = 0;
        currentIndex = idx;
        $("editor").setSelectionRange(m.index, m.index + m.length);
        scrollEditorTo(m.index);
        markActive();
        updateSummary();
      });
      return;
    }

    $("editor").focus();
    $("editor").setSelectionRange(m.index, m.index + m.length);
    scrollEditorTo(m.index);
    markActive();
    updateSummary();
  }

  function scrollEditorTo(index) {
    const ed = $("editor");
    const before = ed.value.slice(0, index);
    const line = before.split("\n").length - 1;
    const cs = getComputedStyle(ed);
    let lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.65 || 22;
    const target = line * lh - lh * 1.5;
    ed.scrollTop = Math.max(0, target);
  }

  function updateSummary() {
    const summary = $("re-summary");
    if (!matches.length) {
      summary.textContent = $("re-pattern").value ? "无匹配" : "—";
      return;
    }
    summary.textContent = currentIndex + 1 + " / " + matches.length;
  }

  function goToMatch(delta) {
    if (!matches.length) return;
    currentIndex =
      (currentIndex + delta + matches.length) % matches.length;
    selectMatch(currentIndex);
  }

  /* ================= 替换 ================= */
  function expandReplacement(tpl, m, fullText) {
    return tpl.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g, (whole, tok) => {
      if (tok === "$") return "$";
      if (tok === "&") return m.match;
      if (tok === "`") return fullText.slice(0, m.index);
      if (tok === "'") return fullText.slice(m.index + m.length);
      if (tok[0] === "<") {
        const key = tok.slice(1, -1);
        return m.named[key] !== undefined ? m.named[key] : "";
      }
      const n = parseInt(tok, 10);
      if (n === 0) return m.match;
      return m.groups[n - 1] !== undefined ? m.groups[n - 1] : "";
    });
  }

  function applyReplacement(tpl, m, fullText) {
    if (searchMode === "text") return tpl;
    return expandReplacement(tpl, m, fullText);
  }

  function replaceOne() {
    if (!matches.length) return;
    if (currentIndex < 0 || currentIndex >= matches.length)
      currentIndex = 0;

    const m = matches[currentIndex];
    const tpl = $("re-replace").value;
    const ci = m.chapterIndex;

    const text =
      ci >= 0 ? U.getChapterText(ci) : $("editor").value;
    const rep = applyReplacement(tpl, m, text);
    const caret = m.index + rep.length;

    const newText =
      text.slice(0, m.index) + rep + text.slice(m.index + m.length);

    if (ci >= 0) {
      U.writeChapter(ci, newText);
    }

    if (U.current && ci === U.current.chapterIndex) {
      $("editor").value = newText;
      U.current.originalText = newText;
    } else if (ci < 0) {
      $("editor").value = newText;
    }

    U.markDirty();
    recomputeMatches();
    U.setStatus("已替换 1 处（剩余 " + matches.length + "）");

    if (matches.length) {
      let next = -1;
      for (let i = 0; i < matches.length; i++) {
        if (
          matches[i].chapterIndex === ci &&
          matches[i].index >= caret
        ) {
          next = i;
          break;
        }
      }
      if (next === -1) next = 0;
      selectMatch(next);
    }
    U.updatePreview(false);
  }

  function replaceAll() {
    if (!matches.length) return;

    const tpl = $("re-replace").value;
    const count = matches.length;

    const groups = Object.create(null);
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const key = String(m.chapterIndex);
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }

    const keys = Object.keys(groups);
    if (keys.length > 1) {
      const ok = window.confirm(
        "将在 " +
          keys.length +
          " 个章节中替换 " +
          count +
          " 处，确定继续？",
      );
      if (!ok) return;
    }

    for (let k = 0; k < keys.length; k++) {
      const ci = parseInt(keys[k], 10);
      const list = groups[keys[k]];

      let text =
        ci >= 0 ? U.getChapterText(ci) : $("editor").value;

      for (let j = list.length - 1; j >= 0; j--) {
        const mm = list[j];
        const rep = applyReplacement(tpl, mm, text);
        text =
          text.slice(0, mm.index) +
          rep +
          text.slice(mm.index + mm.length);
      }

      if (ci >= 0) {
        U.writeChapter(ci, text);
      }
      if (U.current && ci === U.current.chapterIndex) {
        $("editor").value = text;
        U.current.originalText = text;
      } else if (ci < 0) {
        $("editor").value = text;
      }
    }

    U.markDirty();
    recomputeMatches();
    U.updatePreview(false);
    U.setStatus("已替换 " + count + " 处");
  }

  /* ================= 绑定事件 ================= */
  $("findBtn").addEventListener("click", () => {
    findbar.hidden = !findbar.hidden;
    if (!findbar.hidden) {
      recomputeMatches();
      if (!isMobile)
        setTimeout(() => {
          $("re-pattern").focus();
          $("re-pattern").select();
        }, 50);
    }
  });

  $("findClose").addEventListener("click", () => {
    findbar.hidden = true;
  });

  document.querySelectorAll("#modeToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (searchMode === btn.dataset.mode) return;
      searchMode = btn.dataset.mode;
      document
        .querySelectorAll("#modeToggle button")
        .forEach((b) => b.classList.toggle("active", b === btn));
      updateModeUI();
      recomputeMatches();
    });
  });

  document.querySelectorAll(".flag").forEach((btn) => {
    if (btn.id === "scope-all") return;
    btn.addEventListener("click", () => {
      btn.classList.toggle("on");
      recomputeMatches();
    });
  });

  $("scope-all").addEventListener("click", () => {
    scopeAll = !scopeAll;
    $("scope-all").classList.toggle("on", scopeAll);
    recomputeMatches();
  });

  $("find-prev").addEventListener("click", () => goToMatch(-1));
  $("find-next").addEventListener("click", () => goToMatch(1));

  $("re-pattern").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    goToMatch(e.shiftKey ? -1 : 1);
  });

  $("re-replace-one").addEventListener("click", replaceOne);
  $("re-replace-all").addEventListener("click", replaceAll);

  /* ================= 导出 ================= */
  const S = window.EpubApp;
  S.updateModeUI = updateModeUI;
  S.recomputeMatches = recomputeMatches;
  S.scheduleRecompute = scheduleRecompute;
  S.replaceOne = replaceOne;
  S.replaceAll = replaceAll;

  Object.defineProperty(S, "scopeAll", {
    get: () => scopeAll,
    set: (v) => { scopeAll = v; },
  });
})();
