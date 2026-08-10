(function () {
  "use strict";

  // Load header images as embedded base64 data URIs (assets/embedded-assets.js).
  // Plain file:// paths get treated as a separate opaque origin by the browser,
  // which taints the html2canvas output canvas and breaks "Download as Image".
  // data: URIs are never cross-origin, so this keeps the canvas exportable
  // whether the page is opened by double-click or served over http.
  if (window.EMBEDDED_ASSETS) {
    const bismillahImg = document.getElementById("bismillahImg");
    const logoImg = document.getElementById("logoImg");
    if (bismillahImg && !bismillahImg.getAttribute("src")) {
      bismillahImg.src = window.EMBEDDED_ASSETS.bismillah;
      bismillahImg.classList.remove("hidden");
      document.getElementById("bismillahLabel").classList.add("hidden");
    }
    if (logoImg && !logoImg.getAttribute("src")) {
      logoImg.src = window.EMBEDDED_ASSETS.logo;
      logoImg.classList.remove("hidden");
      document.getElementById("logoLabel").classList.add("hidden");
    }
  }

  const receivedInputs = Array.from(document.querySelectorAll(".received-input"));
  const usedInputs = Array.from(document.querySelectorAll(".used-input"));
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

  function sumInputs(inputs) {
    return inputs.reduce((total, input) => total + toNumber(input.value), 0);
  }

  // Live comma-formatting for the amount inputs (native type="number" can't
  // display commas, so these are plain text inputs formatted as you type).
  function formatAmountInputLive(input) {
    const original = input.value;
    const cursorPos = input.selectionStart == null ? original.length : input.selectionStart;
    const digitsBeforeCursor = original.slice(0, cursorPos).replace(/[^0-9.]/g, "").length;

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
    const formatted = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;

    input.value = formatted;

    let count = 0;
    let newPos = formatted.length;
    if (digitsBeforeCursor === 0) {
      newPos = 0;
    } else {
      for (let i = 0; i < formatted.length; i++) {
        if (/[0-9.]/.test(formatted[i])) count++;
        if (count === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
    }
    input.setSelectionRange(newPos, newPos);
  }

  function handleAmountBlur(e) {
    if (e.target.value.trim() === "" || e.target.value === ".") {
      e.target.value = "0";
      recalculate();
    }
  }

  function recalculate() {
    const receivedTotal = sumInputs(receivedInputs);
    const usedTotal = sumInputs(usedInputs);
    const leftover = toNumber(leftoverInput.value);
    const fundsLeft = leftover + receivedTotal - usedTotal;

    receivedTotalCell.textContent = formatMoney(receivedTotal);
    usedTotalCell.textContent = formatMoney(usedTotal);
    totalReceivedBox.textContent = formatMoney(receivedTotal);
    totalExpenseBox.textContent = formatMoney(usedTotal);
    totalLeftBox.textContent = formatMoney(fundsLeft);
    leftoverDisplay.textContent = leftoverInput.value;
  }

  [...receivedInputs, ...usedInputs, leftoverInput].forEach((input) => {
    input.addEventListener("input", () => {
      formatAmountInputLive(input);
      recalculate();
    });
    input.addEventListener("blur", handleAmountBlur);
  });

  recalculate();

  // ---- Image upload (Bismillah / Logo) ----
  function wireUpload(inputId, imgId, labelId, removeBtnId) {
    const fileInput = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    const label = document.getElementById(labelId);
    const removeBtn = document.getElementById(removeBtnId);

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
        img.classList.remove("hidden");
        label.classList.add("hidden");
        removeBtn.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    });

    removeBtn.addEventListener("click", () => {
      img.src = "";
      img.classList.add("hidden");
      label.classList.remove("hidden");
      removeBtn.classList.add("hidden");
      fileInput.value = "";
    });
  }

  wireUpload("bismillahInput", "bismillahImg", "bismillahLabel", "bismillahRemove");
  wireUpload("logoInput", "logoImg", "logoLabel", "logoRemove");

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
    [...receivedInputs, ...usedInputs].forEach((input) => (input.value = "0"));
    leftoverInput.value = "0";
    recalculate();
  });

  // ---- Download as Image (PNG — lossless, best for social media text/tables) ----
  const downloadImgBtn = document.getElementById("downloadImgBtn");
  const pageEl = document.getElementById("page");

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "revenue-report";
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
      const canvas = await html2canvas(pageEl, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          alert("Could not generate the image. Please try again.");
          return;
        }
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
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      alert("Image export failed: " + err.message);
    } finally {
      pageEl.classList.remove("capturing");
      downloadImgBtn.disabled = false;
      downloadImgBtn.textContent = originalLabel;
    }
  });
})();
