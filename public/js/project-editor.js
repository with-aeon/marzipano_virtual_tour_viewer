import { initViewer, loadImages, setProjectName, updateInitialViewForRenamedImage } from './marzipano-viewer.js';
import { getProjectId } from './project-context.js';
import { initLayouts, layoutApi } from './features/floorplans.js';
import { initArchive, archiveApi } from './features/archive.js';
import { initRename } from './features/rename.js';
import { initUpdate } from './features/update.js';
import { initUpload } from './features/upload.js';
import { initHotspots, cleanupHotspotsForDeletedImages, updateHotspotsForRenamedImage, reloadHotspots } from './features/hotspots.js';
import { initBlurMasks, cleanupBlurMasksForDeletedImages, updateBlurMasksForRenamedImage, reloadBlurMasks } from './features/blur-masks.js';
import { initMenuCollapsible } from './menu-collapsible.js';
import { initInitialView } from './features/initial-view.js';
import { reloadInitialViews } from './marzipano-viewer.js';
import { io } from '/socket.io/socket.io.esm.min.js';

function normalizeWorkflowState(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
  if (v === 'MODIFIED') return 'MODIFIED';
  if (v === 'REJECTED') return 'REJECTED';
  if (v === 'DRAFT') return 'DRAFT';
  return 'PUBLISHED';
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
  if (state === 'MODIFIED') return '[MODIFIED]';
  if (state === 'REJECTED') return '[REJECTED]';
  if (state === 'DRAFT') return '[DRAFT]';
  return '[APPROVED]';
}

function badgeClass(state) {
  if (state === 'PENDING_APPROVAL') return 'workflow-badge-pending';
  if (state === 'MODIFIED') return 'workflow-badge-modified';
  if (state === 'REJECTED') return 'workflow-badge-rejected';
  if (state === 'DRAFT') return 'workflow-badge-draft';
  return 'workflow-badge-published';
}

function setBadge(state) {
  const el = document.getElementById('workflow-badge');
  if (!el) return;
  el.hidden = false;
  el.textContent = badgeText(state);
  el.classList.remove('workflow-badge-draft', 'workflow-badge-pending', 'workflow-badge-modified', 'workflow-badge-rejected', 'workflow-badge-published');
  el.classList.add(badgeClass(state));
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

function configureRequestButton(state, canonicalId) {
  const btn = document.getElementById('request-approval-btn');
  if (!btn) return;

  if (state === 'PENDING_APPROVAL') {
    btn.hidden = false;
    btn.disabled = true;
    btn.textContent = 'Pending...';
    btn.title = 'This project is already pending approval.';
    return;
  }
  if (state === 'PUBLISHED') {
    btn.hidden = true;
    return;
  }

  btn.hidden = false;
  btn.disabled = false;
  btn.textContent = state === 'MODIFIED' ? 'Request Re-Approval' : 'Request Approval';
  btn.title = state === 'MODIFIED'
    ? 'Submit these modifications for Super Admin approval.'
    : 'Submit this draft for Super Admin approval.';

  btn.addEventListener('click', async () => {
    const ok = window.confirm(
      state === 'MODIFIED'
        ? 'Submit these modifications for Super Admin approval? This will mark it as pending.'
        : 'Submit this draft for Super Admin approval? This will mark it as pending.'
    );
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

function setMenuTarget(state) {
  const menu = document.getElementById('pano-menu-btn');
  if (!menu) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const ret = String(params.get('return') || params.get('returnTo') || '').trim().toLowerCase();
    if (ret === 'superadmindb') {
      menu.href = 'superadmindb.html';
      return;
    }
  } catch (e) {}
  if (state !== 'PUBLISHED') {
    menu.href = 'dashboard.html?view=staging';
  } else {
    menu.href = 'dashboard.html';
  }
}

function setEditorTitle(state) {
  document.title = state === 'PUBLISHED' ? 'QCDE - IPVT' : 'QCDE - IPVT (Staging)';
}

function cleanupSceneLinkedData(validImageNames) {
  try { cleanupHotspotsForDeletedImages(validImageNames); } catch (e) {}
  try { cleanupBlurMasksForDeletedImages(validImageNames); } catch (e) {}
}

if (!getProjectId()) {
  const params = new URLSearchParams(window.location.search);
  const view = String(params.get('view') || '').trim().toLowerCase();
  window.location.replace(view === 'staging' ? 'dashboard.html?view=staging' : 'dashboard.html');
} else {
  initRename();
  initUpdate();
  initUpload();
  initArchive();
  initHotspots();
  initBlurMasks();
  initMenuCollapsible();
  initInitialView();

  document.addEventListener('DOMContentLoaded', () => {
    (async () => {
      try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        const raw = getProjectId();
        const id = resolveProjectId(projects, raw);
        const project = Array.isArray(projects) ? projects.find(p => p.id === id) : null;
        if (!project) {
          const params = new URLSearchParams(window.location.search);
          const view = String(params.get('view') || '').trim().toLowerCase();
          window.alert('Project not found.');
          window.location.replace(view === 'staging' ? 'dashboard.html?view=staging' : 'dashboard.html');
          return;
        }

        const state = normalizeWorkflowState(project.workflow_state);
        setBadge(state);
        configureRequestButton(state, id);
        setMenuTarget(state);
        setEditorTitle(state);
        if (project.name) setProjectName(project.name);
      } catch {}
    })();
    initViewer();
    loadImages(cleanupSceneLinkedData);
    initLayouts();
  });

  // Realtime project name updates
  try {
    const socket = io();
    (async () => {
      try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        const raw = getProjectId();
        const pid = resolveProjectId(projects, raw);
        if (pid) socket.emit('joinProject', pid);
        socket.on('projects:changed', (projectsUpdate) => {
          const projId = resolveProjectId(projectsUpdate, raw);
          if (!projId) return;
          const proj = Array.isArray(projectsUpdate) ? projectsUpdate.find(p => p.id === projId) : null;
          if (!proj) return;
          if (proj.name) setProjectName(proj.name);
          const state = normalizeWorkflowState(proj.workflow_state);
          setBadge(state);
          configureRequestButton(state, projId);
          setMenuTarget(state);
          setEditorTitle(state);
        });
      } catch (e) {}
    })();

    socket.on('panos:ready', (payload) => {
      loadImages(cleanupSceneLinkedData);
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('panos:order', (payload) => {
      loadImages(cleanupSceneLinkedData);
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('pano:renamed', (payload) => {
      try { updateInitialViewForRenamedImage(payload.oldFilename, payload.newFilename); } catch (e) {}
      try { updateHotspotsForRenamedImage(payload.oldFilename, payload.newFilename); } catch (e) {}
      try { updateBlurMasksForRenamedImage(payload.oldFilename, payload.newFilename); } catch (e) {}
      try { layoutApi.updateForRenamedPano(payload.oldFilename, payload.newFilename); } catch (e) {}
      loadImages(cleanupSceneLinkedData);
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('pano:updated', (payload) => {
      loadImages(cleanupSceneLinkedData);
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('pano:removed', (payload) => {
      loadImages(cleanupSceneLinkedData);
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('hotspots:changed', (payload) => {
      try { reloadHotspots(); } catch (e) {}
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('blur-masks:changed', () => {
      try { reloadBlurMasks(); } catch (e) {}
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('initial-views:changed', async (payload) => {
      try { await reloadInitialViews(); } catch (e) {}
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('floorplans:order', () => {
      try { layoutApi.reloadList(); } catch (e) {}
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
    socket.on('layouts:order', () => {
      try { layoutApi.reloadList(); } catch (e) {}
      try { archiveApi.refreshIfVisible(); } catch (e) {}
    });
  } catch (e) {}
}
