/* =====================================================================
   audit-trial-balance.js — Trial Balance Import and View logic
   ===================================================================== */

(function () {
  const PAGE_KEY = 'audit';
  const PAGE_LABEL = 'Trial Balance';
  const PAGE_URL = '/audit/trial-balance.html';

  let engagementId = null;
  let uploadFile = null;
  let previewData = null; // Contains headers, rows, total_rows

  // View state
  let ledgers = [];
  let tbTotals = {};
  let viewPage = 1;
  const viewLimit = 50;
  let viewSearch = '';
  let viewMappedFilter = 'all'; // 'all', 'mapped', 'unmapped'

  const SYSTEM_FIELDS = [
    { key: 'col_ledger_code', label: 'Ledger Code', pattern: 'code' },
    { key: 'col_ledger_name', label: 'Ledger Name', pattern: 'name' },
    { key: 'col_opening_balance', label: 'Opening Balance', pattern: 'open' },
    { key: 'col_debit_transactions', label: 'Debit Transactions', pattern: 'debit' },
    { key: 'col_credit_transactions', label: 'Credit Transactions', pattern: 'credit' },
    { key: 'col_closing_balance', label: 'Closing Balance', pattern: 'closing' }
  ];

  document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    engagementId = urlParams.get('id');

    if (!engagementId) {
      alert('No engagement ID specified.');
      window.location.href = '/audit/index.html';
      return;
    }

    window.AE.initTopbar({ showBack: true, backHref: `/audit/engagement.html?id=${engagementId}` });
    window.AE.initSidebar(PAGE_KEY);
    window.AE.trackVisit(PAGE_KEY, PAGE_LABEL, `${PAGE_URL}?id=${engagementId}`);

    // Update subnav links
    const subnav = document.getElementById('audit-subnav');
    if (subnav) {
      subnav.querySelectorAll('a').forEach(link => {
        const page = link.getAttribute('href').split('?')[0];
        link.setAttribute('href', `${page}?id=${engagementId}`);
      });
    }

    initTabs();
    initImportWizard();
    await loadViewTab();
  });

  // ── Tabs ─────────────────────────────────────────────────────────────
  function initTabs() {
    const tabImportBtn = document.getElementById('tab-btn-import');
    const tabViewBtn = document.getElementById('tab-btn-view');
    const tabImportContent = document.getElementById('tab-import');
    const tabViewContent = document.getElementById('tab-view');

    tabImportBtn?.addEventListener('click', () => {
      tabImportBtn.classList.add('active');
      tabViewBtn.classList.remove('active');
      tabImportContent.style.display = 'block';
      tabViewContent.style.display = 'none';
    });

    tabViewBtn?.addEventListener('click', async () => {
      tabViewBtn.classList.add('active');
      tabImportBtn.classList.remove('active');
      tabViewContent.style.display = 'block';
      tabImportContent.style.display = 'none';
      await loadViewTab();
    });
  }

  // ── Import Wizard ───────────────────────────────────────────────────
  function initImportWizard() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('tb-file-input');

    // Drag-and-drop
    dropZone?.addEventListener('click', () => fileInput?.click());
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });

    // Step 2 & 3 back/next buttons
    document.getElementById('btn-wizard-back-2')?.addEventListener('click', () => showStep(1));
    document.getElementById('btn-wizard-next-2')?.addEventListener('click', proceedToStep3);
    document.getElementById('btn-wizard-back-3')?.addEventListener('click', () => showStep(2));
    document.getElementById('btn-confirm-import')?.addEventListener('click', executeImport);
  }

  function showStep(stepNum) {
    const steps = [1, 2, 3];
    steps.forEach(s => {
      const stepIndicator = document.querySelector(`.wizard-step[data-step="${s}"]`);
      const stepDiv = document.getElementById(`wizard-step-${s}`);
      if (s === stepNum) {
        stepIndicator?.classList.add('active');
        stepIndicator?.classList.remove('done');
        if (stepDiv) stepDiv.style.display = 'block';
      } else if (s < stepNum) {
        stepIndicator?.classList.remove('active');
        stepIndicator?.classList.add('done');
        if (stepDiv) stepDiv.style.display = 'none';
      } else {
        stepIndicator?.classList.remove('active', 'done');
        if (stepDiv) stepDiv.style.display = 'none';
      }
    });
  }

  async function handleFileSelect(file) {
    uploadFile = file;
    // Call preview endpoint to get column names
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('has_header_row', 'true');

    try {
      const res = await window.AE.apiFetch(`/api/audit/${engagementId}/trial-balance/preview`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        previewData = await res.json();
        renderColumnMapper();
        showStep(2);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to parse file.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error parsing preview.');
    }
  }

  function fuzzyMatchIndex(header, fieldPattern) {
    const h = header.toLowerCase();
    const p = fieldPattern;
    if (p === 'code') {
      return h.includes('code') || h === 'ac' || h.includes('account') || h === 'acc';
    }
    if (p === 'name') {
      return h.includes('name') || h.includes('desc') || h.includes('title') || h.includes('particulars');
    }
    if (p === 'open') {
      return h.includes('open') || h.includes('op') || h.includes('beg');
    }
    if (p === 'debit') {
      return h.includes('debit') || h === 'dr' || h === 'debits';
    }
    if (p === 'credit') {
      return h.includes('credit') || h === 'cr' || h === 'credits';
    }
    if (p === 'closing') {
      return h.includes('closing') || h === 'cl' || h.includes('close') || (h.includes('balance') && !h.includes('open'));
    }
    return false;
  }

  function renderColumnMapper() {
    const mapper = document.getElementById('column-mapper');
    if (!mapper) return;

    const optionsHtml = previewData.headers.map((h, idx) => {
      const letter = String.fromCharCode(65 + idx); // A, B, C...
      return `<option value="${idx}">Col ${letter}: ${window.AE.escapeHtml(h || `Column ${idx}`)}</option>`;
    }).join('');

    mapper.innerHTML = SYSTEM_FIELDS.map(field => {
      // Find fuzzy match index
      let matchedIdx = 0;
      for (let i = 0; i < previewData.headers.length; i++) {
        if (fuzzyMatchIndex(previewData.headers[i] || '', field.pattern)) {
          matchedIdx = i;
          break;
        }
      }

      return `
        <div class="column-mapper-label">${window.AE.escapeHtml(field.label)}</div>
        <div class="column-mapper-arrow">&rarr;</div>
        <div>
          <select class="input" id="map_${field.key}">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('') + `
      <div style="grid-column: 1 / -1; margin-top: 12px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);">
          <input type="checkbox" id="chk-has-header" checked />
          First row is a header row
        </label>
      </div>
      <div style="grid-column: 1 / -1; margin-top: 16px;">
        <h4 style="font-size:12px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Live Mapping Sample</h4>
        <div style="overflow-x:auto;">
          <table class="preview-table" id="tb-mapping-live-preview" style="width:100%;"></table>
        </div>
      </div>
    `;

    // Add change listeners to update live preview
    SYSTEM_FIELDS.forEach(field => {
      const el = document.getElementById(`map_${field.key}`);
      if (el) {
        el.value = matchedIdxForField(field.key);
        el.addEventListener('change', renderLiveMappingPreview);
      }
    });

    renderLiveMappingPreview();
  }

  function matchedIdxForField(fieldKey) {
    const field = SYSTEM_FIELDS.find(f => f.key === fieldKey);
    if (!field) return 0;
    for (let i = 0; i < previewData.headers.length; i++) {
      if (fuzzyMatchIndex(previewData.headers[i] || '', field.pattern)) {
        return i;
      }
    }
    // Default fallback
    if (fieldKey === 'col_ledger_code') return 0;
    if (fieldKey === 'col_ledger_name') return 1;
    if (fieldKey === 'col_opening_balance') return 2;
    if (fieldKey === 'col_debit_transactions') return 3;
    if (fieldKey === 'col_credit_transactions') return 4;
    if (fieldKey === 'col_closing_balance') return 5;
    return 0;
  }

  function renderLiveMappingPreview() {
    const table = document.getElementById('tb-mapping-live-preview');
    if (!table) return;

    const mapping = getSelectedMapping();

    const headersHtml = SYSTEM_FIELDS.map(f => `<th>${window.AE.escapeHtml(f.label)}</th>`).join('');
    const rowsHtml = previewData.rows.slice(0, 5).map((row, rIdx) => {
      return `<tr>` + SYSTEM_FIELDS.map(field => {
        const colIdx = mapping[field.key];
        const val = row[colIdx] !== undefined ? row[colIdx] : '';
        return `<td>${window.AE.escapeHtml(String(val))}</td>`;
      }).join('') + `</tr>`;
    }).join('');

    table.innerHTML = `<thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody>`;
  }

  function getSelectedMapping() {
    const mapping = {};
    SYSTEM_FIELDS.forEach(f => {
      const select = document.getElementById(`map_${f.key}`);
      mapping[f.key] = parseInt(select?.value || 0);
    });
    return mapping;
  }

  function proceedToStep3() {
    // Show validation preview
    const table = document.getElementById('tb-preview-table');
    if (!table) return;

    const mapping = getSelectedMapping();
    const hasHeader = document.getElementById('chk-has-header')?.checked;

    // Call API /preview again to update preview if hasHeader changed
    // In this case, we have local previewData anyway
    const headersHtml = SYSTEM_FIELDS.map(f => `<th>${window.AE.escapeHtml(f.label)}</th>`).join('');
    const rowsHtml = previewData.rows.slice(0, 10).map((row, rIdx) => {
      return `<tr>` + SYSTEM_FIELDS.map(field => {
        const colIdx = mapping[field.key];
        const val = row[colIdx] !== undefined ? row[colIdx] : '';
        return `<td>${window.AE.escapeHtml(String(val))}</td>`;
      }).join('') + `</tr>`;
    }).join('');

    table.innerHTML = `<thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody>`;

    // Compute client-side checks for the preview
    let debitSum = 0;
    let creditSum = 0;
    previewData.rows.forEach(row => {
      const dr = parseFloat(String(row[mapping.col_debit_transactions] || '').replace(/,/g, '')) || 0;
      const cr = parseFloat(String(row[mapping.col_credit_transactions] || '').replace(/,/g, '')) || 0;
      debitSum += dr;
      creditSum += cr;
    });

    const isBalanced = Math.abs(debitSum - creditSum) < 0.01;
    const checkContainer = document.getElementById('balance-check-container');
    if (checkContainer) {
      if (isBalanced) {
        checkContainer.innerHTML = `
          <div class="balance-check balanced">
            <span>✓</span> Balanced: Total Debits equal Total Credits (Preview of ${previewData.total_rows} rows).
          </div>
        `;
      } else {
        const diff = Math.abs(debitSum - creditSum);
        checkContainer.innerHTML = `
          <div class="balance-check unbalanced">
            <span>✗</span> Unbalanced: Difference is ${diff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
          </div>
        `;
      }
    }

    showStep(3);
  }

  async function executeImport() {
    const mapping = getSelectedMapping();
    const hasHeader = document.getElementById('chk-has-header')?.checked;

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('has_header_row', hasHeader ? 'true' : 'false');
    SYSTEM_FIELDS.forEach(f => {
      formData.append(f.key, mapping[f.key]);
    });

    const confirmBtn = document.getElementById('btn-confirm-import');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const res = await window.AE.apiFetch(`/api/audit/${engagementId}/trial-balance/import`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Successfully imported ${data.imported} ledgers.`);
        // Switch to view tab
        document.getElementById('tab-btn-view')?.click();
      } else {
        const err = await res.json();
        alert(err.error || 'Import failed.');
        if (confirmBtn) confirmBtn.disabled = false;
      }
    } catch (e) {
      console.error(e);
      alert('Network error during import.');
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  // ── View Tab ────────────────────────────────────────────────────────
  async function loadViewTab() {
    try {
      let url = `/api/audit/${engagementId}/trial-balance?`;
      if (viewSearch) url += `search=${encodeURIComponent(viewSearch)}&`;
      if (viewMappedFilter !== 'all') url += `mapped=${viewMappedFilter}&`;

      const res = await window.AE.apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        ledgers = data.ledgers || [];
        tbTotals = data.totals || {};
        renderBalanceStatusBar();
        renderViewTable();
      }
    } catch (e) {
      console.error('Error loading view tab:', e);
    }
  }

  function renderBalanceStatusBar() {
    const bar = document.getElementById('tb-balance-status');
    if (!bar) return;

    if (ledgers.length === 0) {
      bar.innerHTML = '';
      return;
    }

    const { debit_transactions, credit_transactions, is_balanced } = tbTotals;
    const diff = Math.abs(debit_transactions - credit_transactions);

    if (is_balanced) {
      bar.innerHTML = `
        <div class="balance-check balanced" style="margin-bottom: 20px;">
          <span>✓</span> Balanced: Total Debits equal Total Credits.
        </div>
      `;
    } else {
      bar.innerHTML = `
        <div class="balance-check unbalanced" style="margin-bottom: 20px;">
          <span>✗</span> Unbalanced: Debits / Credits mismatch by ${diff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
        </div>
      `;
    }
  }

  function renderViewTable() {
    const container = document.getElementById('tb-table-container');
    if (!container) return;

    // Filter controls inside view tab header
    const filterHeaderHtml = `
      <div class="audit-filter-bar">
        <input type="text" class="input" id="tb-search" placeholder="Search by ledger name or code…" value="${window.AE.escapeHtml(viewSearch)}" />
        <div class="filter-chips">
          <span class="filter-chip ${viewMappedFilter === 'all' ? 'active' : ''}" data-filter="all">All</span>
          <span class="filter-chip ${viewMappedFilter === 'unmapped' ? 'active' : ''}" data-filter="unmapped">Unmapped</span>
          <span class="filter-chip ${viewMappedFilter === 'mapped' ? 'active' : ''}" data-filter="mapped">Mapped</span>
        </div>
      </div>
    `;

    if (ledgers.length === 0) {
      container.innerHTML = filterHeaderHtml + `
        <div class="stat-card" style="text-align: center; padding: 48px;">
          <div style="font-size: 14px; color: var(--text-muted);">No ledger data imported yet or matches filters.</div>
        </div>
      `;
      attachViewFilterListeners();
      return;
    }

    // Pagination slice
    const totalCount = ledgers.length;
    const totalPages = Math.ceil(totalCount / viewLimit);
    if (viewPage > totalPages) viewPage = totalPages || 1;
    const start = (viewPage - 1) * viewLimit;
    const end = start + viewLimit;
    const sliced = ledgers.slice(start, end);

    const fmt = (v) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowsHtml = sliced.map(l => {
      const mappingLabel = l.subgroup_name
        ? `${l.group_name} &rarr; ${l.subgroup_name}`
        : `<span class="audit-status-badge badge-rejected" style="font-size: 10px;">Unmapped</span>`;

      return `
        <tr class="${l.is_mapped ? '' : 'unmapped-row'}">
          <td class="mono">${window.AE.escapeHtml(l.ledger_code)}</td>
          <td>${window.AE.escapeHtml(l.ledger_name)}</td>
          <td class="text-right mono">${fmt(l.opening_balance)}</td>
          <td class="text-right mono">${fmt(l.debit_transactions)}</td>
          <td class="text-right mono">${fmt(l.credit_transactions)}</td>
          <td class="text-right mono">${fmt(l.closing_balance)}</td>
          <td>${mappingLabel}</td>
        </tr>
      `;
    }).join('');

    const totalsRowHtml = `
      <tr style="font-weight: 700; background: var(--bg-raised);">
        <td colspan="2">TOTAL</td>
        <td class="text-right mono">${fmt(tbTotals.opening_balance || 0)}</td>
        <td class="text-right mono">${fmt(tbTotals.debit_transactions || 0)}</td>
        <td class="text-right mono">${fmt(tbTotals.credit_transactions || 0)}</td>
        <td class="text-right mono">${fmt(tbTotals.closing_balance || 0)}</td>
        <td></td>
      </tr>
    `;

    container.innerHTML = filterHeaderHtml + `
      <table class="audit-table">
        <thead>
          <tr>
            <th>Ledger Code</th>
            <th>Ledger Name</th>
            <th class="text-right">Opening Bal</th>
            <th class="text-right">Debits</th>
            <th class="text-right">Credits</th>
            <th class="text-right">Closing Bal</th>
            <th>Mapping Group</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${totalsRowHtml}
        </tbody>
      </table>
    `;

    renderPaginationControls(totalPages);
    attachViewFilterListeners();
  }

  function renderPaginationControls(totalPages) {
    const pag = document.getElementById('tb-pagination');
    if (!pag) return;

    if (totalPages <= 1) {
      pag.innerHTML = '';
      return;
    }

    let btns = `<button ${viewPage === 1 ? 'disabled' : ''} data-page="${viewPage - 1}">&larr; Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
      btns += `<button class="${viewPage === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    btns += `<button ${viewPage === totalPages ? 'disabled' : ''} data-page="${viewPage + 1}">Next &rarr;</button>`;

    pag.innerHTML = btns;

    pag.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const page = parseInt(btn.dataset.page);
        if (page) {
          viewPage = page;
          renderViewTable();
        }
      });
    });
  }

  function attachViewFilterListeners() {
    const search = document.getElementById('tb-search');
    search?.addEventListener('input', (e) => {
      viewSearch = e.target.value;
      viewPage = 1;
      // Debounce slightly if typing
      clearTimeout(window.tbSearchTimeout);
      window.tbSearchTimeout = setTimeout(loadViewTab, 300);
    });

    const chips = document.querySelectorAll('.filter-chips .filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        viewMappedFilter = chip.dataset.filter;
        viewPage = 1;
        loadViewTab();
      });
    });
  }
})();
