(function () {
  "use strict";

  const leftoverInput = document.getElementById("leftoverFunds");
  const leftoverDisplay = document.getElementById("leftoverFundsDisplay");

  const receivedTotalCell = document.getElementById("receivedTotalCell");
  const usedTotalCell = document.getElementById("usedTotalCell");
  const totalReceivedBox = document.getElementById("totalReceivedBox");
  const totalExpenseBox = document.getElementById("totalExpenseBox");
  const totalLeftBox = document.getElementById("totalLeftBox");

  function toNumber(value) {
    const n = parseFloat(String(value).replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function formatMoney(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Live comma-formatting for the amount inputs (native type="number" can't
  // display commas, so these are plain text inputs formatted as you type).
  // allowNegative: only the previous-month balance may be negative (a deficit).
  function formatAmountInputLive(input, allowNegative) {
    const original = input.value;
    const cursorPos = input.selectionStart == null ? original.length : input.selectionStart;
    const minusIndex = original.indexOf("-");
    const negative = allowNegative && minusIndex !== -1 && original.slice(0, minusIndex).trim() === "";
    const digitsBeforeCursor =
      original.slice(0, cursorPos).replace(/[^0-9.]/g, "").length +
      (negative && cursorPos > minusIndex ? 1 : 0);

    let cleaned = original.replace(/[^0-9.]/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
    }

    let [intPart, decPart] = cleaned.split(".");
    intPart = intPart.replace(/^0+(?=\d)/, "");
    if (decPart !== undefined) decPart = decPart.slice(0, 2);
    if (intPart === "") intPart = decPart !== undefined ? "0" : "";

    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const formatted =
      (negative ? "-" : "") + (decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt);

    input.value = formatted;

    let count = 0;
    let newPos = formatted.length;
    if (digitsBeforeCursor === 0) {
      newPos = 0;
    } else {
      for (let i = 0; i < formatted.length; i++) {
        if (/[0-9.-]/.test(formatted[i])) count++;
        if (count === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
    }
    input.setSelectionRange(newPos, newPos);
  }

  // Normalize incomplete entries left behind on blur: "", ".", "-", "-.", "250." etc.
  function handleAmountBlur(e) {
    const input = e.target;
    let value = input.value.trim().replace(/\.$/, "");
    if (value === "" || value === "-" || value === "-0") value = "0";
    if (value !== input.value) {
      input.value = value;
      recalculate();
    }
  }

  // ---- Fund tables (editable rows with one level of sub-rows) ----
  // Each table is its own list of rows. A row is { label, amount, children },
  // where amount is the text typed in its input and children are
  // { label, amount } sub-rows. A row with sub-rows is worth the sum of its
  // sub-rows and has no input of its own. The row layout (labels and
  // structure, not amounts) is remembered in the browser for next time.
  const DEFAULT_FUNDS = [
    "ދައުލަތުން ދޭ ބްލޮކް ގްރާންޓް",
    "އަންހެނުންގެ ތަރައްޤީއަށް މަސައްކަތްކުރާ ކޮމިޓީގެ ފަންޑް",
    "ކައުންސިލްގެ އާމްދަނީ ފަންޑް",
    "ތިންވަނަ ފަރާތުގެ ފައިސާގެ ފަންޑް",
    "ޕަބްލިކް އެކައުންޓް ފަންޑް",
    "ޑޮނޭޝަން ފަންޑް",
    "އެހެނިހެން ފަންޑް"
  ];
  const LAYOUT_KEY = "revenueReport.rowLayout.v1";
  const NEW_ROW_LABEL = "New row";

  const tables = {
    received: { body: document.getElementById("receivedRows"), rows: [] },
    used: { body: document.getElementById("usedRows"), rows: [] }
  };

  function defaultRows() {
    return DEFAULT_FUNDS.map((label) => ({ label, amount: "0", children: [] }));
  }

  function rowValue(row) {
    return row.children.length
      ? row.children.reduce((total, child) => total + toNumber(child.amount), 0)
      : toNumber(row.amount);
  }

  function tableTotal(kind) {
    return tables[kind].rows.reduce((total, row) => total + rowValue(row), 0);
  }

  function saveLayout() {
    const layout = {};
    for (const kind of Object.keys(tables)) {
      layout[kind] = tables[kind].rows.map((row) => ({
        label: row.label,
        children: row.children.map((child) => ({ label: child.label }))
      }));
    }
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch (_) {
      // Storage unavailable (private mode, blocked): layout just isn't remembered.
    }
  }

  function loadLayout(kind) {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
      const list = saved && saved[kind];
      if (!Array.isArray(list)) return null;
      return list.map((row) => ({
        label: String(row.label ?? ""),
        amount: "0",
        children: (Array.isArray(row.children) ? row.children : []).map((child) => ({
          label: String(child.label ?? ""),
          amount: "0"
        }))
      }));
    } catch (_) {
      return null;
    }
  }

  function makeLabel(item) {
    const label = document.createElement("span");
    label.className = "row-label";
    try {
      label.contentEditable = "plaintext-only";
    } catch (_) {
      label.contentEditable = "true";
    }
    label.spellcheck = false;
    label.textContent = item.label;
    label.addEventListener("input", () => {
      item.label = label.textContent;
      saveLayout();
    });
    label.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        label.blur();
      }
    });
    return label;
  }

  function makeButton(text, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-btn";
    btn.textContent = text;
    btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
  }

  // Delete buttons sit on each table's outer edge: the received table is the
  // right-hand column (its label cell, RTL), the used table the left-hand one
  // (its amount cell).
  function outerEdgeCell(kind, labelCell, amountCell) {
    return kind === "received" ? labelCell : amountCell;
  }

  function makeDeleteButton(title, onClick) {
    const btn = makeButton("×", title, onClick);
    btn.className = "row-del-btn no-export";
    btn.setAttribute("aria-label", title);
    return btn;
  }

  function makeAmountInput(item) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "amount-input";
    input.value = item.amount;
    input.addEventListener("input", () => {
      formatAmountInputLive(input, false);
      item.amount = input.value;
      recalculate();
    });
    input.addEventListener("blur", (e) => {
      handleAmountBlur(e);
      item.amount = input.value;
    });
    return input;
  }

  function focusLabel(kind, rowIndex, childIndex) {
    const selector = childIndex == null
      ? `tr[data-row="${rowIndex}"]:not(.sub-row) .row-label`
      : `tr[data-row="${rowIndex}"][data-child="${childIndex}"] .row-label`;
    const label = tables[kind].body.querySelector(selector);
    if (!label) return;
    label.focus();
    const range = document.createRange();
    range.selectNodeContents(label);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function hasValue(row) {
    return row.children.length > 0 || rowValue(row) !== 0;
  }

  function renderTable(kind) {
    const table = tables[kind];
    table.body.textContent = "";

    table.rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      // A row and its sub-rows share one stripe colour so they read as a group.
      const stripe = i % 2 === 0 ? "stripe-odd" : "stripe-even";
      tr.className = `fund-row ${stripe}${row.children.length ? " has-children" : ""}`;
      tr.dataset.row = i;

      const labelCell = document.createElement("td");
      const controls = document.createElement("span");
      controls.className = "row-controls no-export";
      controls.append(
        makeButton("+ Sub", "Add a sub-row under this row", () => {
          // The first sub-row takes over the row's typed amount so the total doesn't jump.
          const carried = row.children.length ? "0" : row.amount;
          row.children.push({ label: NEW_ROW_LABEL, amount: carried });
          row.amount = "0";
          refresh(kind);
          focusLabel(kind, i, row.children.length - 1);
        })
      );
      labelCell.append(makeLabel(row), controls);

      const amountCell = document.createElement("td");
      if (row.children.length) {
        const sum = document.createElement("span");
        sum.className = "row-sum";
        sum.textContent = formatMoney(rowValue(row));
        amountCell.append(sum);
      } else {
        amountCell.append(makeAmountInput(row));
      }
      tr.append(labelCell, amountCell);
      outerEdgeCell(kind, labelCell, amountCell).append(
        makeDeleteButton("Delete this row", () => {
          if (hasValue(row) && !confirm(`Delete "${row.label}" and its amounts?`)) return;
          table.rows.splice(i, 1);
          refresh(kind);
        })
      );
      table.body.append(tr);

      row.children.forEach((child, j) => {
        const sub = document.createElement("tr");
        sub.className = `fund-row sub-row ${stripe}${j === row.children.length - 1 ? " last-sub" : ""}`;
        sub.dataset.row = i;
        sub.dataset.child = j;

        const subLabelCell = document.createElement("td");
        subLabelCell.append(makeLabel(child));

        const subAmountCell = document.createElement("td");
        subAmountCell.append(makeAmountInput(child));
        sub.append(subLabelCell, subAmountCell);
        outerEdgeCell(kind, subLabelCell, subAmountCell).append(
          makeDeleteButton("Delete this sub-row", () => {
            if (toNumber(child.amount) !== 0 && !confirm(`Delete "${child.label}" and its amount?`)) return;
            row.children.splice(j, 1);
            refresh(kind);
          })
        );
        table.body.append(sub);
      });
    });
  }

  // Re-draw a table after its structure changed, then update totals and memory.
  function refresh(kind) {
    renderTable(kind);
    recalculate();
    saveLayout();
  }

  // Keep the parent rows' sub-total cells in step while amounts are typed.
  function updateRowSums() {
    for (const kind of Object.keys(tables)) {
      tables[kind].rows.forEach((row, i) => {
        if (!row.children.length) return;
        const cell = tables[kind].body.querySelector(`tr[data-row="${i}"]:not(.sub-row) .row-sum`);
        if (cell) cell.textContent = formatMoney(rowValue(row));
      });
    }
  }

  document.querySelectorAll(".add-row-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.table;
      tables[kind].rows.push({ label: NEW_ROW_LABEL, amount: "0", children: [] });
      refresh(kind);
      focusLabel(kind, tables[kind].rows.length - 1);
    });
  });

  function recalculate() {
    updateRowSums();
    const receivedTotal = tableTotal("received");
    const usedTotal = tableTotal("used");
    const leftover = toNumber(leftoverInput.value);
    const fundsLeft = leftover + receivedTotal - usedTotal;

    receivedTotalCell.textContent = formatMoney(receivedTotal);
    usedTotalCell.textContent = formatMoney(usedTotal);
    totalReceivedBox.textContent = formatMoney(receivedTotal);
    totalExpenseBox.textContent = formatMoney(usedTotal);
    totalLeftBox.textContent = formatMoney(fundsLeft);
    leftoverDisplay.textContent = formatMoney(leftover);
  }

  leftoverInput.addEventListener("input", () => {
    formatAmountInputLive(leftoverInput, true);
    recalculate();
  });
  leftoverInput.addEventListener("blur", handleAmountBlur);

  for (const kind of Object.keys(tables)) {
    tables[kind].rows = loadLayout(kind) || defaultRows();
    renderTable(kind);
  }
  recalculate();

  // ---- Image upload (Bismillah / Logo) ----
  // Default header images come from assets/embedded-assets.js as base64 data URIs.
  // Plain file:// paths get treated as a separate opaque origin by the browser,
  // which taints the html2canvas output canvas and breaks "Download as Image".
  // data: URIs are never cross-origin, so this keeps the canvas exportable
  // whether the page is opened by double-click or served over http.
  const EMBEDDED = window.EMBEDDED_ASSETS || {};

  function wireUpload(inputId, imgId, labelId, removeBtnId, defaultSrc) {
    const fileInput = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    const label = document.getElementById(labelId);
    const removeBtn = document.getElementById(removeBtnId);

    // With an image shown, the button removes it. With the slot empty and a
    // default available, the same button restores the default.
    function setImage(src) {
      if (src) {
        img.src = src;
        img.classList.remove("hidden");
        label.classList.add("hidden");
        removeBtn.innerHTML = "&times;";
        removeBtn.title = "Remove image";
        removeBtn.classList.remove("hidden");
      } else {
        img.removeAttribute("src");
        img.classList.add("hidden");
        label.classList.remove("hidden");
        fileInput.value = "";
        removeBtn.textContent = "↺";
        removeBtn.title = "Restore default image";
        removeBtn.classList.toggle("hidden", !defaultSrc);
      }
    }

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => setImage(e.target.result);
      reader.onerror = () => {
        alert("Could not read the selected image file. Please try a different file.");
        fileInput.value = "";
      };
      reader.readAsDataURL(file);
    });

    removeBtn.addEventListener("click", () => {
      setImage(img.classList.contains("hidden") ? defaultSrc : "");
    });

    setImage(defaultSrc);
  }

  wireUpload("bismillahInput", "bismillahImg", "bismillahLabel", "bismillahRemove", EMBEDDED.bismillah);
  wireUpload("logoInput", "logoImg", "logoLabel", "logoRemove", EMBEDDED.logo);

  // ---- Date (Dhivehi display, native input holds the real value) ----
  const DHIVEHI_MONTHS = [
    "ޖެނުއަރީ", "ފެބްރުއަރީ", "މާރިޗު", "އޭޕްރީލް", "މޭ", "ޖޫން",
    "ޖުލައި", "އޮގަސްޓް", "ސެޕްޓެންބަރު", "އޮކްޓޯބަރު", "ނޮވެންބަރު", "ޑިސެންބަރު"
  ];

  const dateField = document.getElementById("reportDate");
  const dateDisplayBtn = document.getElementById("reportDateDisplay");
  const dateDisplayText = document.getElementById("reportDateText");

  function formatDhivehiDate(isoValue) {
    if (!isoValue) return "";
    const [y, m, d] = isoValue.split("-").map(Number);
    return `${d} ${DHIVEHI_MONTHS[m - 1]} ${y}`;
  }

  function updateDateDisplay() {
    const formatted = formatDhivehiDate(dateField.value);
    dateDisplayText.textContent = formatted || "ތާރީޚް ޚިޔާރު ކުރައްވާ";
  }

  if (dateField && !dateField.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateField.value = `${yyyy}-${mm}-${dd}`;
  }
  updateDateDisplay();

  dateField.addEventListener("change", updateDateDisplay);
  dateDisplayBtn.addEventListener("click", () => {
    if (typeof dateField.showPicker === "function") {
      dateField.showPicker();
    } else {
      dateField.focus();
    }
  });

  // ---- Actions ----
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset all entered amounts to 0?")) return;
    for (const kind of Object.keys(tables)) {
      tables[kind].rows.forEach((row) => {
        row.amount = "0";
        row.children.forEach((child) => (child.amount = "0"));
      });
      renderTable(kind);
    }
    leftoverInput.value = "0";
    recalculate();
  });

  document.getElementById("restoreRowsBtn").addEventListener("click", () => {
    if (!confirm("Restore the original 7 rows in both tables? Your custom rows and all table amounts will be cleared.")) return;
    for (const kind of Object.keys(tables)) {
      tables[kind].rows = defaultRows();
      renderTable(kind);
    }
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch (_) {
      // Nothing stored to remove.
    }
    recalculate();
  });

  // ---- Download as Image (PNG — lossless, best for social media text/tables) ----
  const downloadImgBtn = document.getElementById("downloadImgBtn");
  const pageEl = document.getElementById("page");

  function slugify(text) {
    // Keep letters/marks/digits from any script (Thaana titles included).
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/(^-|-$)/g, "") || "revenue-report";
  }

  // html2canvas rounds sub-pixel page positions up, which can leave the image
  // a pixel over the target. Trim that edge (it's the page's white margin)
  // rather than resampling, so the text stays pixel-sharp.
  function trimToMaxSide(source, maxSide) {
    const width = Math.min(source.width, maxSide);
    const height = Math.min(source.height, maxSide);
    if (width === source.width && height === source.height) return source;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    out.getContext("2d").drawImage(source, 0, 0);
    return out;
  }

  downloadImgBtn.addEventListener("click", async () => {
    if (typeof html2canvas === "undefined") {
      alert("Image export library failed to load (html2canvas.min.js). Make sure it is present in the project folder.");
      return;
    }

    downloadImgBtn.disabled = true;
    const originalLabel = downloadImgBtn.textContent;
    downloadImgBtn.textContent = "Preparing image…";

    pageEl.classList.add("capturing");
    // Let the browser apply the .capturing styles before snapshotting.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      // Facebook stores photos at up to 2048px on the long side and resamples
      // anything larger (softening small text), so render exactly to that size.
      const FB_MAX_SIDE = 2048;
      const rect = pageEl.getBoundingClientRect();
      const scale = FB_MAX_SIDE / Math.max(rect.width, rect.height);
      const rendered = await html2canvas(pageEl, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true
      });
      const canvas = trimToMaxSide(rendered, FB_MAX_SIDE);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        alert("Could not generate the image. Please try again.");
      } else {
        const titleText = document.getElementById("reportTitle").value || "revenue-report";
        const dateText = document.getElementById("reportDate").value || "";
        const filename = `${slugify(titleText)}${dateText ? "-" + dateText : ""}.png`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Revoking synchronously can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      alert("Image export failed: " + err.message);
    } finally {
      pageEl.classList.remove("capturing");
      downloadImgBtn.disabled = false;
      downloadImgBtn.textContent = originalLabel;
    }
  });
})();
