import { getProjectId } from './project-context.js';

function normalizeWorkflowState(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
  if (v === 'REJECTED') return 'REJECTED';
  if (v === 'PUBLISHED') return 'PUBLISHED';
  return 'DRAFT';
}

function resolveProjectId(projects, token) {
  const value = (token || '').trim();
  if (!value || !Array.isArray(projects)) return value;
  const match = projects.find(
    (p) =>
      p.id === value ||
      (p.number && String(p.number).trim() === value)
  );
  return match ? match.id : value;
}

function badgeText(state) {
  if (state === 'PENDING_APPROVAL') return '[PENDING APPROVAL]';
  if (state === 'REJECTED') return '[REJECTED]';
  if (state === 'PUBLISHED') return '[PUBLISHED]';
  return '[DRAFT]';
}

function badgeClass(state) {
  if (state === 'PENDING_APPROVAL') return 'workflow-badge-pending';
  if (state === 'REJECTED') return 'workflow-badge-rejected';
  if (state === 'PUBLISHED') return 'workflow-badge-published';
  return 'workflow-badge-draft';
}

async function fetchProjects() {
  const res = await fetch('/api/projects', { headers: { 'Accept': 'application/json' } });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error((data && (data.message || data.error)) || 'Failed to load projects');
  return Array.isArray(data) ? data : [];
}

async function requestApproval(projectId) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/request-approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

function setBadge(state) {
  const el = document.getElementById('workflow-badge');
  if (!el) return;
  el.hidden = false;
  el.textContent = badgeText(state);
  el.classList.remove('workflow-badge-draft', 'workflow-badge-pending', 'workflow-badge-rejected', 'workflow-badge-published');
  el.classList.add(badgeClass(state));
}

function configureRequestButton(state, canonicalId) {
  const btn = document.getElementById('request-approval-btn');
  if (!btn) return;

  if (state === 'PENDING_APPROVAL') {
    btn.disabled = true;
    btn.textContent = 'Pending...';
    btn.title = 'This project is already pending approval.';
    return;
  }
  if (state === 'PUBLISHED') {
    btn.disabled = true;
    btn.textContent = 'Published';
    btn.title = 'This project is already published.';
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Request Approval';
  btn.title = 'Submit this draft for Super Admin approval.';

  btn.addEventListener('click', async () => {
    const ok = window.confirm('Submit this draft for Super Admin approval? This will mark it as pending.');
    if (!ok) return;
    btn.disabled = true;
    try {
      await requestApproval(canonicalId);
      setBadge('PENDING_APPROVAL');
      configureRequestButton('PENDING_APPROVAL', canonicalId);
      window.alert('Approval request submitted. This project is now pending approval.');
    } catch (e) {
      btn.disabled = false;
      window.alert(e.message || 'Failed to submit approval request.');
    }
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = getProjectId();
  if (!token) {
    window.location.replace('staging-dashboard.html');
    return;
  }

  try {
    const projects = await fetchProjects();
    const canonicalId = resolveProjectId(projects, token);
    const project = projects.find((p) => p && p.id === canonicalId) || null;
    const state = normalizeWorkflowState(project && project.workflow_state);

    // Staging editor is for non-published projects. If it's already published, redirect to the published editor.
    if (state === 'PUBLISHED') {
      const params = new URLSearchParams({ project: canonicalId });
      window.location.replace(`project-editor.html?${params.toString()}`);
      return;
    }

    setBadge(state);
    configureRequestButton(state, canonicalId);
  } catch (e) {
    console.error('Staging editor init failed:', e);
    setBadge('DRAFT');
    configureRequestButton('DRAFT', token);
  }
});

