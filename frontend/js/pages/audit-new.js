/* =====================================================================
   audit-new.js — New engagement form logic
   ===================================================================== */

(function () {
  const PAGE_KEY = 'audit';
  const PAGE_LABEL = 'New Engagement';
  const PAGE_URL = '/audit/new.html';

  document.addEventListener('DOMContentLoaded', async () => {
    window.AE.initTopbar({ showBack: true, backHref: '/audit/index.html' });
    window.AE.initSidebar(PAGE_KEY);
    window.AE.trackVisit(PAGE_KEY, PAGE_LABEL, PAGE_URL);

    const form = document.getElementById('form-new-engagement');
    if (form) {
      form.addEventListener('submit', handleSubmit);
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();

    const client_name = document.getElementById('client_name')?.value?.trim();
    const financial_year = document.getElementById('financial_year')?.value?.trim();
    const period_start = document.getElementById('period_start')?.value;
    const period_end = document.getElementById('period_end')?.value;

    if (!client_name || !financial_year || !period_start || !period_end) {
      alert('All fields are required.');
      return;
    }

    // Basic date ordering validation
    if (new Date(period_start) > new Date(period_end)) {
      alert('Period Start date cannot be after Period End date.');
      return;
    }

    const submitBtn = document.getElementById('btn-create-engagement');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await window.AE.apiFetch('/api/audit/engagements', {
        method: 'POST',
        body: JSON.stringify({ client_name, financial_year, period_start, period_end })
      });

      if (res.ok) {
        const data = await res.json();
        // Redirect to dashboard page
        window.location.href = `/audit/engagement.html?id=${data.id}`;
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || 'Failed to create engagement.');
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      console.error(err);
      alert('Network error creating engagement.');
      if (submitBtn) submitBtn.disabled = false;
    }
  }
})();
