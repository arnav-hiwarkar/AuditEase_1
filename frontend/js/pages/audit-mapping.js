/* =====================================================================
   audit-mapping.js — Ledger Mapping page logic
   ===================================================================== */

(function () {
  const PAGE_KEY = 'audit';
  const PAGE_LABEL = 'Ledger Mapping';
  const PAGE_URL = '/audit/mapping.html';

  let engagementId = null;
  let engagement = null;
  let groupsData = {}; // Grouped by type: Income, Expenditure, etc.
  let ledgers = [];
  let selectedSubgroupId = null; // Filter right panel by this subgroup ID

  // Filter state for right panel
  let filterState = 'unmapped'; // 'unmapped', 'all', 'mapped'
  let selectedLedgerIds = new Set();

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

    await loadData();
  });

  async function loadData() {
    try {
      // Fetch engagement
      const engRes = await window.AE.apiFetch(`/api/audit/engagements/${engagementId}`);
      if (engRes.ok) {
        engagement = await engRes.json();
      }

      // Fetch groups
      const groupsRes = await window.AE.apiFetch(`/api/audit/${engagementId}/groups`);
      if (groupsRes.ok) {
        groupsData = await groupsRes.json();
      }

      // Fetch ledgers
      const ledgersRes = await window.AE.apiFetch(`/api/audit/${engagementId}/trial-balance`);
      if (ledgersRes.ok) {
        const data = await ledgersRes.json();
        ledgers = data.ledgers || [];
      }

      updateProgressBar();
      renderGroupsPanel();
      renderLedgerPanel();
    } catch (e) {
      console.error(e);
      alert('Error loading mapping data.');
    }
  }

  function updateProgressBar() {
    const total = ledgers.length;
    const mapped = ledgers.filter(l => l.is_mapped).length;
    const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;

    const fill = document.getElementById('mapping-progress-fill');
    const label = document.getElementById('mapping-progress-label');

    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `${mapped} / ${total} mapped (${pct}%)`;
  }

  // ── Groups Panel (Left) ────────────────────────────────────────────
  function renderGroupsPanel() {
    const panel = document.getElementById('mapping-left');
    if (!panel) return;

    const types = ['Income', 'Expenditure', 'Asset', 'Liability', 'Equity'];

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text-primary);">Groups</h3>
        <button class="btn btn-primary btn-sm" id="btn-add-group" style="padding:4px 8px;font-size:11px;">+ Add</button>
      </div>
    `;

    types.forEach(type => {
      const list = groupsData[type] || [];
      html += `<div class="group-type-header">${type}</div>`;

      if (list.length === 0) {
        html += `<div style="font-size:11px;color:var(--text-muted);padding:4px 8px;font-style:italic;">No groups</div>`;
      } else {
        list.forEach(g => {
          const isSelected = selectedSubgroupId === g.id;
          html += `
            <div class="group-tree-item ${isSelected ? 'selected' : ''}" data-id="${g.id}">
              <div class="group-tree-item-title" style="flex:1;">
                <strong>${window.AE.escapeHtml(g.subgroup_code)}</strong>: ${window.AE.escapeHtml(g.subgroup_name)}
                <span style="font-size:11px;color:var(--text-muted);font-weight:normal;">(${g.ledger_count || 0})</span>
              </div>
              <div class="group-tree-actions" style="display:flex;gap:4px;">
                <button class="btn-edit-group" data-id="${g.id}" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:2px;" title="Edit">✏️</button>
                <button class="btn-delete-group" data-id="${g.id}" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:2px;" title="Delete">🗑️</button>
              </div>
            </div>
          `;
        });
      }
    });

    panel.innerHTML = html;

    // Attach listeners
    panel.querySelectorAll('.group-tree-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.group-tree-actions')) return; // ignore action clicks
        const gid = parseInt(item.dataset.id);
        selectedSubgroupId = selectedSubgroupId === gid ? null : gid; // toggle filter
        renderGroupsPanel();
        renderLedgerPanel();
      });
    });

    panel.querySelector('#btn-add-group')?.addEventListener('click', () => openGroupModal());
    panel.querySelectorAll('.btn-edit-group').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = parseInt(btn.dataset.id);
        const group = findGroupById(gid);
        if (group) openGroupModal(group);
      });
    });

    panel.querySelectorAll('.btn-delete-group').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = parseInt(btn.dataset.id);
        deleteGroup(gid);
      });
    });
  }

  function findGroupById(gid) {
    for (const type in groupsData) {
      const found = groupsData[type].find(g => g.id === gid);
      if (found) return found;
    }
    return null;
  }

  function openGroupModal(group = null) {
    let modal = document.getElementById('group-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'group-modal';
      modal.className = 'audit-modal';
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="audit-modal-content">
        <h3>${group ? 'Edit Group' : 'Add New Group'}</h3>
        <form id="form-group">
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" for="grp_type">IE/PL Type</label>
            <select class="input" id="grp_type" required>
              <option value="Income" ${group?.ie_pl_type === 'Income' ? 'selected' : ''}>Income</option>
              <option value="Expenditure" ${group?.ie_pl_type === 'Expenditure' ? 'selected' : ''}>Expenditure</option>
              <option value="Asset" ${group?.ie_pl_type === 'Asset' ? 'selected' : ''}>Asset</option>
              <option value="Liability" ${group?.ie_pl_type === 'Liability' ? 'selected' : ''}>Liability</option>
              <option value="Equity" ${group?.ie_pl_type === 'Equity' ? 'selected' : ''}>Equity</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px; display:grid; grid-template-columns:1fr 2fr; gap:12px;">
            <div>
              <label class="form-label" for="grp_code">Group Code</label>
              <input type="text" class="input" id="grp_code" required value="${window.AE.escapeHtml(group?.group_code || '')}" placeholder="GRP-01" />
            </div>
            <div>
              <label class="form-label" for="grp_name">Group Name</label>
              <input type="text" class="input" id="grp_name" required value="${window.AE.escapeHtml(group?.group_name || '')}" placeholder="Revenue" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:12px; display:grid; grid-template-columns:1fr 2fr; gap:12px;">
            <div>
              <label class="form-label" for="subgrp_code">Subgroup Code</label>
              <input type="text" class="input" id="subgrp_code" required value="${window.AE.escapeHtml(group?.subgroup_code || '')}" placeholder="SUB-01-01" />
            </div>
            <div>
              <label class="form-label" for="subgrp_name">Subgroup Name</label>
              <input type="text" class="input" id="subgrp_name" required value="${window.AE.escapeHtml(group?.subgroup_name || '')}" placeholder="Operating Revenue" />
            </div>
          </div>
          <div class="form-group" style="margin-bottom:20px;">
            <label class="form-label" for="grp_order">Display Order</label>
            <input type="number" class="input" id="grp_order" required value="${group?.display_order || 0}" />
          </div>
          <div style="display:flex;justify-content:flex-end;gap:12px;">
            <button type="button" class="btn btn-ghost" id="btn-group-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Group</button>
          </div>
        </form>
      </div>
    `;

    modal.querySelector('#btn-group-cancel').addEventListener('click', () => modal.style.display = 'none');
    modal.querySelector('#form-group').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        ie_pl_type: document.getElementById('grp_type').value,
        group_code: document.getElementById('grp_code').value.trim(),
        group_name: document.getElementById('grp_name').value.trim(),
        subgroup_code: document.getElementById('subgrp_code').value.trim(),
        subgroup_name: document.getElementById('subgrp_name').value.trim(),
        display_order: parseInt(document.getElementById('grp_order').value || 0)
      };

      try {
        const url = group
          ? `/api/audit/${engagementId}/groups/${group.id}`
          : `/api/audit/${engagementId}/groups`;
        const method = group ? 'PATCH' : 'POST';

        const res = await window.AE.apiFetch(url, {
          method,
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          modal.style.display = 'none';
          await loadData();
        } else {
          alert('Failed to save group details.');
        }
      } catch (err) {
        console.error(err);
        alert('Network error saving group.');
      }
    });
  }

  async function deleteGroup(gid) {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      const res = await window.AE.apiFetch(`/api/audit/${engagementId}/groups/${gid}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        if (selectedSubgroupId === gid) selectedSubgroupId = null;
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Cannot delete group. Verify no ledgers are mapped to it.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error deleting group.');
    }
  }

  // ── Ledgers Panel (Right) ──────────────────────────────────────────
  function renderLedgerPanel() {
    const panel = document.getElementById('mapping-right');
    if (!panel) return;

    // Filter ledgers
    let filtered = ledgers;

    if (selectedSubgroupId !== null) {
      filtered = ledgers.filter(l => l.ie_pl_group_id === selectedSubgroupId);
    } else {
      if (filterState === 'unmapped') {
        filtered = ledgers.filter(l => !l.is_mapped);
      } else if (filterState === 'mapped') {
        filtered = ledgers.filter(l => l.is_mapped);
      }
    }

    const unmappedCount = ledgers.filter(l => !l.is_mapped).length;

    // Build options list for dropdown
    const groupOptionsHtml = buildGroupSelectOptions();

    // Determine panel title
    let panelTitle = 'All Ledgers';
    if (selectedSubgroupId !== null) {
      const g = findGroupById(selectedSubgroupId);
      panelTitle = g ? `Ledgers in ${g.subgroup_name}` : 'Filtered Ledgers';
    } else if (filterState === 'unmapped') {
      panelTitle = `Unmapped Ledgers (${unmappedCount})`;
    } else if (filterState === 'mapped') {
      panelTitle = `Mapped Ledgers (${ledgers.length - unmappedCount})`;
    }

    const showBulkMapBtn = selectedLedgerIds.size > 0;

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
        <h3 style="margin:0;font-size:15px;font-weight:600;color:var(--text-primary);">${panelTitle}</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-secondary btn-sm" id="btn-import-prev-mapping" style="padding:4px 8px;font-size:11px;">Import Previous Year Mapping</button>
          ${showBulkMapBtn ? `<button class="btn btn-primary btn-sm" id="btn-bulk-map">Bulk Map (${selectedLedgerIds.size})</button>` : ''}
          <div class="filter-chips">
            <span class="filter-chip ${filterState === 'unmapped' && selectedSubgroupId === null ? 'active' : ''}" id="chip-unmapped">Unmapped</span>
            <span class="filter-chip ${filterState === 'all' && selectedSubgroupId === null ? 'active' : ''}" id="chip-all">All</span>
            <span class="filter-chip ${filterState === 'mapped' && selectedSubgroupId === null ? 'active' : ''}" id="chip-mapped">Mapped</span>
          </div>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table class="audit-table">
          <thead>
            <tr>
              <th width="40"><input type="checkbox" id="chk-select-all-ledgers" /></th>
              <th>Ledger Code</th>
              <th>Ledger Name</th>
              <th class="text-right">Closing Balance</th>
              <th>Assign Group</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => {
              return `
                <tr class="${l.is_mapped ? '' : 'unmapped-row'}" id="row-${l.id}">
                  <td><input type="checkbox" class="chk-ledger" data-id="${l.id}" ${selectedLedgerIds.has(l.id) ? 'checked' : ''} /></td>
                  <td class="mono">${window.AE.escapeHtml(l.ledger_code)}</td>
                  <td>${window.AE.escapeHtml(l.ledger_name)}</td>
                  <td class="text-right mono">${l.closing_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td>
                    <select class="input select-ledger-mapping" data-id="${l.id}" style="padding:4px 8px; font-size:12px; width:auto; max-width:260px;">
                      ${groupOptionsHtml}
                    </select>
                    <span class="save-status" id="status-${l.id}" style="font-size:11px;color:var(--status-verified);margin-left:8px;opacity:0;transition:opacity 0.2s;">Saved ✓</span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Prefill select dropdowns
    filtered.forEach(l => {
      const select = panel.querySelector(`.select-ledger-mapping[data-id="${l.id}"]`);
      if (select) {
        select.value = l.ie_pl_group_id || '';
      }
    });

    // Checkbox mapping selection listeners
    const selectAllChk = panel.querySelector('#chk-select-all-ledgers');
    if (selectAllChk) {
      selectAllChk.checked = filtered.length > 0 && filtered.every(l => selectedLedgerIds.has(l.id));
      selectAllChk.addEventListener('change', (e) => {
        filtered.forEach(l => {
          if (e.target.checked) selectedLedgerIds.add(l.id);
          else selectedLedgerIds.delete(l.id);
        });
        renderLedgerPanel();
      });
    }

    panel.querySelectorAll('.chk-ledger').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const lid = parseInt(chk.dataset.id);
        if (e.target.checked) selectedLedgerIds.add(lid);
        else selectedLedgerIds.delete(lid);
        renderLedgerPanel();
      });
    });

    // Filter chip events
    panel.querySelector('#chip-unmapped')?.addEventListener('click', () => {
      selectedSubgroupId = null;
      filterState = 'unmapped';
      renderLedgerPanel();
    });
    panel.querySelector('#chip-all')?.addEventListener('click', () => {
      selectedSubgroupId = null;
      filterState = 'all';
      renderLedgerPanel();
    });
    panel.querySelector('#chip-mapped')?.addEventListener('click', () => {
      selectedSubgroupId = null;
      filterState = 'mapped';
      renderLedgerPanel();
    });

    // Dropdown change listener
    panel.querySelectorAll('.select-ledger-mapping').forEach(select => {
      select.addEventListener('change', async () => {
        const lid = parseInt(select.dataset.id);
        const gid = select.value ? parseInt(select.value) : null;
        await saveIndividualMapping(lid, gid);
      });
    });

    // Bulk map trigger
    panel.querySelector('#btn-bulk-map')?.addEventListener('click', () => openBulkMapModal());

    // Import previous mapping trigger
    panel.querySelector('#btn-import-prev-mapping')?.addEventListener('click', importPreviousMapping);
  }

  function buildGroupSelectOptions() {
    let html = '<option value="">— Unmapped —</option>';
    const types = ['Income', 'Expenditure', 'Asset', 'Liability', 'Equity'];
    types.forEach(type => {
      const list = groupsData[type] || [];
      if (list.length > 0) {
        html += `<optgroup label="${type.toUpperCase()}">`;
        list.forEach(g => {
          html += `<option value="${g.id}">${window.AE.escapeHtml(g.group_name)} &gt; ${window.AE.escapeHtml(g.subgroup_name)}</option>`;
        });
        html += `</optgroup>`;
      }
    });
    return html;
  }

  async function saveIndividualMapping(ledgerId, groupId) {
    try {
      const res = await window.AE.apiFetch(`/api/audit/${engagementId}/ledgers/${ledgerId}/map`, {
        method: 'PATCH',
        body: JSON.stringify({ ie_pl_group_id: groupId })
      });

      if (res.ok) {
        const updatedLedger = await res.json();
        // Update local state
        const index = ledgers.findIndex(l => l.id === ledgerId);
        if (index !== -1) {
          ledgers[index].ie_pl_group_id = updatedLedger.ie_pl_group_id;
          ledgers[index].is_mapped = updatedLedger.is_mapped;
        }

        // Show flash status
        const flash = document.getElementById(`status-${ledgerId}`);
        if (flash) {
          flash.style.opacity = 1;
          setTimeout(() => flash.style.opacity = 0, 1000);
        }

        updateProgressBar();
      } else {
        alert('Failed to map ledger.');
      }
    } catch (e) {
      console.error(e);
      alert('Error mapping ledger.');
    }
  }

  function openBulkMapModal() {
    let modal = document.getElementById('bulk-map-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bulk-map-modal';
      modal.className = 'audit-modal';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="audit-modal-content">
        <h3>Bulk Map (${selectedLedgerIds.size} Ledgers Selected)</h3>
        <div class="form-group" style="margin-bottom:20px;">
          <label class="form-label" for="bulk_grp">Map selected ledgers to:</label>
          <select class="input" id="bulk_grp">
            ${buildGroupSelectOptions()}
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:12px;">
          <button type="button" class="btn btn-ghost" id="btn-bulk-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="btn-bulk-apply">Apply Mapping</button>
        </div>
      </div>
    `;

    modal.querySelector('#btn-bulk-cancel').addEventListener('click', () => modal.style.display = 'none');
    modal.querySelector('#btn-bulk-apply').addEventListener('click', async () => {
      const gidVal = modal.querySelector('#bulk_grp').value;
      const gid = gidVal ? parseInt(gidVal) : null;

      try {
        const res = await window.AE.apiFetch(`/api/audit/${engagementId}/ledgers/bulk-map`, {
          method: 'POST',
          body: JSON.stringify({
            ledger_ids: Array.from(selectedLedgerIds),
            ie_pl_group_id: gid
          })
        });

        if (res.ok) {
          modal.style.display = 'none';
          selectedLedgerIds.clear();
          await loadData();
        } else {
          alert('Bulk mapping failed.');
        }
      } catch (err) {
        console.error(err);
        alert('Network error during bulk mapping.');
      }
    });
  }

  // ── Import Previous Year Mapping ───────────────────────────────────
  async function importPreviousMapping() {
    if (!engagement) return;
    const btn = document.getElementById('btn-import-prev-mapping');
    if (btn) btn.disabled = true;

    try {
      // 1. Fetch engagements list to find matching client
      const listRes = await window.AE.apiFetch('/api/audit/engagements');
      if (!listRes.ok) {
        alert('Failed to search other engagements.');
        if (btn) btn.disabled = false;
        return;
      }
      const allEng = await listRes.json();

      // Find other engagements for same client
      const matches = allEng
        .filter(e => e.client_name === engagement.client_name && e.id !== engagement.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (matches.length === 0) {
        alert('No previous year engagements found for this client.');
        if (btn) btn.disabled = false;
        return;
      }

      const prevEng = matches[0];
      if (!confirm(`Found previous engagement: ${prevEng.financial_year}. Would you like to import its mappings?`)) {
        if (btn) btn.disabled = false;
        return;
      }

      // 2. Fetch previous year's groups & ledgers
      const [prevGroupsRes, prevLedgersRes] = await Promise.all([
        window.AE.apiFetch(`/api/audit/${prevEng.id}/groups`),
        window.AE.apiFetch(`/api/audit/${prevEng.id}/trial-balance`)
      ]);

      if (!prevGroupsRes.ok || !prevLedgersRes.ok) {
        alert('Failed to load previous engagement details.');
        if (btn) btn.disabled = false;
        return;
      }

      const prevGroupsData = await prevGroupsRes.json();
      const prevLedgersData = await prevLedgersRes.json();
      const prevLedgers = prevLedgersData.ledgers || [];

      // Flatten previous groups to array
      const prevGroupsList = [];
      for (const t in prevGroupsData) {
        prevGroupsList.push(...prevGroupsData[t]);
      }

      // 3. For each group in previous year, ensure matching group exists in current year
      const currentGroupsList = [];
      for (const t in groupsData) {
        currentGroupsList.push(...groupsData[t]);
      }

      // Helper to find matching group in current year
      const findMatchingCurrentGroup = (prevG) => {
        return currentGroupsList.find(cg =>
          cg.ie_pl_type === prevG.ie_pl_type &&
          cg.group_code === prevG.group_code &&
          cg.subgroup_code === prevG.subgroup_code
        );
      };

      // Create missing groups in current engagement
      for (const pg of prevGroupsList) {
        const match = findMatchingCurrentGroup(pg);
        if (!match) {
          // POST to create group
          const createRes = await window.AE.apiFetch(`/api/audit/${engagementId}/groups`, {
            method: 'POST',
            body: JSON.stringify({
              ie_pl_type: pg.ie_pl_type,
              group_code: pg.group_code,
              group_name: pg.group_name,
              subgroup_code: pg.subgroup_code,
              subgroup_name: pg.subgroup_name,
              display_order: pg.display_order
            })
          });
          if (!createRes.ok) {
            console.error('Failed to create matching group:', pg);
          }
        }
      }

      // Reload groups for current engagement
      const newGroupsRes = await window.AE.apiFetch(`/api/audit/${engagementId}/groups`);
      if (newGroupsRes.ok) {
        groupsData = await newGroupsRes.json();
      }

      // Update fresh current list
      const freshCurrentGroups = [];
      for (const t in groupsData) {
        freshCurrentGroups.push(...groupsData[t]);
      }

      // 4. Map previous ledgers to group-codes
      const prevMappingMap = {}; // { ledger_code: group_descriptor }
      prevLedgers.forEach(pl => {
        if (pl.is_mapped) {
          const pg = prevGroupsList.find(g => g.id === pl.ie_pl_group_id);
          if (pg) {
            prevMappingMap[pl.ledger_code] = {
              ie_pl_type: pg.ie_pl_type,
              group_code: pg.group_code,
              subgroup_code: pg.subgroup_code
            };
          }
        }
      });

      // 5. Apply mappings to matching current ledger codes
      const bulkMaps = {}; // { current_group_id: [ledger_ids] }
      let matchedCount = 0;

      ledgers.forEach(cl => {
        if (!cl.is_mapped) {
          const matchDescriptor = prevMappingMap[cl.ledger_code];
          if (matchDescriptor) {
            const currentGroupMatch = freshCurrentGroups.find(cg =>
              cg.ie_pl_type === matchDescriptor.ie_pl_type &&
              cg.group_code === matchDescriptor.group_code &&
              cg.subgroup_code === matchDescriptor.subgroup_code
            );

            if (currentGroupMatch) {
              bulkMaps[currentGroupMatch.id] = bulkMaps[currentGroupMatch.id] || [];
              bulkMaps[currentGroupMatch.id].push(cl.id);
              matchedCount++;
            }
          }
        }
      });

      if (matchedCount === 0) {
        alert('No new ledger code matches found to map.');
        if (btn) btn.disabled = false;
        return;
      }

      // Execute bulk mapping queries
      let updatedTotal = 0;
      for (const currGId in bulkMaps) {
        const res = await window.AE.apiFetch(`/api/audit/${engagementId}/ledgers/bulk-map`, {
          method: 'POST',
          body: JSON.stringify({
            ledger_ids: bulkMaps[currGId],
            ie_pl_group_id: parseInt(currGId)
          })
        });
        if (res.ok) {
          const resData = await res.json();
          updatedTotal += resData.updated || 0;
        }
      }

      alert(`Successfully matched and imported ${updatedTotal} mappings.`);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Error during mapping import.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
})();
