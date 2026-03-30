import { io } from '/socket.io/socket.io.esm.min.js';

const projectListEl = document.getElementById('project-list');
const emptyStateEl = document.getElementById('empty-state');
const projectSearchInput = document.getElementById('project-search-input');

const newProjectModal = document.getElementById('new-project-modal');
const newProjectNumberInput = document.getElementById('new-project-number');
const newProjectNameInput = document.getElementById('new-project-name');
const newProjectErrorEl = document.getElementById('new-project-error');
const modalCreateBtn = document.getElementById('modal-create');
const modalCancelBtn = document.getElementById('modal-cancel');

const openProjectModal = document.getElementById('open-project-modal');
const openProjectListEl = document.getElementById('open-project-list');
const openProjectSearchInput = document.getElementById('open-project-search-input');
const openModalCloseBtn = document.getElementById('open-modal-close');

const MAX_PROJECT_NUMBER_LENGTH = 20;
const SEARCH_FADE_MS = 140;
let searchFadeOutTimer = null;
let searchFadeInTimer = null;

let allProjects = [];
let modalProjects = [];

function normalizeWorkflowState(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
  if (v === 'REJECTED') return 'REJECTED';
  if (v === 'PUBLISHED') return 'PUBLISHED';
  return 'DRAFT';
}

function isStagingProject(project) {
  const state = normalizeWorkflowState(project && project.workflow_state);
  return state !== 'PUBLISHED';
}

function workflowLabel(state) {
  if (state === 'PENDING_APPROVAL') return 'Pending';
  if (state === 'REJECTED') return 'Rejected';
  return 'Draft';
}

function sanitizeProjectNumber(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .slice(0, MAX_PROJECT_NUMBER_LENGTH);
}

async function fetchProjects() {
  const res = await fetch('/api/projects', { headers: { 'Accept': 'application/json' } });
  const data = await res.json();
  if (!res.ok) throw new Error((data && (data.message || data.error)) || 'Failed to load projects');
  return Array.isArray(data) ? data : [];
}

async function createProject(name, number) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      name: String(name || '').trim(),
      number: String(number || '').trim(),
      status: 'in-progress',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Failed to create project');
  return data;
}

function openStagingEditor(project) {
  if (!project || !project.id) return;
  const params = new URLSearchParams({ project: project.id });
  window.location.href = `staging-editor.html?${params.toString()}`;
}

function renderProjectRow(project) {
  const state = normalizeWorkflowState(project.workflow_state);

  const row = document.createElement('div');
  row.className = 'project-row';
  row.dataset.projectId = project.id;

  const numberDisplay = document.createElement('div');
  numberDisplay.className = 'project-number-display';
  numberDisplay.textContent = project.number || '';
  const numberCell = document.createElement('div');
  numberCell.className = 'project-number-cell';
  numberCell.appendChild(numberDisplay);

  const nameDisplay = document.createElement('div');
  nameDisplay.className = 'project-name-display';
  nameDisplay.textContent = project.name || '';
  const nameCell = document.createElement('div');
  nameCell.className = 'project-name-cell';
  nameCell.appendChild(nameDisplay);

  const statusCell = document.createElement('div');
  statusCell.className = 'project-status-cell';
  const statusDisplay = document.createElement('div');
  statusDisplay.className = 'project-status-display';
  statusDisplay.textContent = workflowLabel(state);
  statusCell.appendChild(statusDisplay);

  const actionsCell = document.createElement('div');
  actionsCell.className = 'project-actions-cell';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn-open';
  editBtn.title = 'Open draft';
  editBtn.textContent = 'Open';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openStagingEditor(project);
  });
  actionsCell.appendChild(editBtn);

  row.append(numberCell, nameCell, statusCell, actionsCell);

  row.addEventListener('click', () => openStagingEditor(project));
  return row;
}

function updateEmptyState() {
  const count = projectListEl.querySelectorAll('.project-row').length;
  emptyStateEl.style.display = count === 0 ? 'block' : 'none';
}

function renderProjectList(projects) {
  projectListEl.innerHTML = '';
  for (const p of projects) {
    projectListEl.appendChild(renderProjectRow(p));
  }
  updateEmptyState();
}

function renderProjectListWithSearchAnimation(projects) {
  if (!projectListEl) {
    renderProjectList(projects);
    return;
  }

  if (searchFadeOutTimer) {
    clearTimeout(searchFadeOutTimer);
    searchFadeOutTimer = null;
  }
  if (searchFadeInTimer) {
    clearTimeout(searchFadeInTimer);
    searchFadeInTimer = null;
  }

  projectListEl.classList.remove('search-fade-in');
  projectListEl.classList.add('search-fade-out');

  searchFadeOutTimer = setTimeout(() => {
    renderProjectList(projects);
    projectListEl.classList.remove('search-fade-out');
    projectListEl.classList.add('search-fade-in');

    searchFadeInTimer = setTimeout(() => {
      projectListEl.classList.remove('search-fade-in');
      searchFadeInTimer = null;
    }, SEARCH_FADE_MS);

    searchFadeOutTimer = null;
  }, SEARCH_FADE_MS);
}

function applySearch({ animate = false } = {}) {
  const query = (projectSearchInput && projectSearchInput.value.trim()) || '';
  if (!query) {
    return animate ? renderProjectListWithSearchAnimation(allProjects) : renderProjectList(allProjects);
  }
  const q = query.toLowerCase();
  const filtered = allProjects.filter((p) =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.number || '').toLowerCase().includes(q) ||
    normalizeWorkflowState(p.workflow_state).toLowerCase().includes(q)
  );
  return animate ? renderProjectListWithSearchAnimation(filtered) : renderProjectList(filtered);
}

function renderOpenProjectList(projects) {
  if (!openProjectListEl) return;
  openProjectListEl.innerHTML = '';
  if (!projects || projects.length === 0) {
    openProjectListEl.innerHTML = '<p class="empty-state">No draft projects yet.</p>';
    return;
  }
  for (const p of projects) {
    const row = document.createElement('div');
    row.className = 'project-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'project-name-input';
    input.value = `${p.number || ''} — ${p.name || ''}`.trim();
    input.disabled = true;
    input.style.cursor = 'pointer';
    const openBtn = document.createElement('button');
    openBtn.className = 'btn-open-modal';
    openBtn.textContent = 'Open';
    openBtn.onclick = () => {
      openProjectModal.classList.remove('visible');
      openStagingEditor(p);
    };
    input.onclick = () => openStagingEditor(p);
    row.append(input, openBtn);
    openProjectListEl.appendChild(row);
  }
}

function applyModalSearch() {
  const query = (openProjectSearchInput && openProjectSearchInput.value.trim()) || '';
  if (!query) return renderOpenProjectList(modalProjects);
  const q = query.toLowerCase();
  const filtered = modalProjects.filter((p) =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.number || '').toLowerCase().includes(q) ||
    normalizeWorkflowState(p.workflow_state).toLowerCase().includes(q)
  );
  renderOpenProjectList(filtered);
}

async function loadProjects() {
  try {
    const fetched = await fetchProjects();
    allProjects = fetched.filter(isStagingProject);
    renderProjectList(allProjects);
  } catch (e) {
    emptyStateEl.textContent = 'Error loading projects: ' + (e.message || e);
    emptyStateEl.style.display = 'block';
  }
}

// ---- UI wiring ----
document.getElementById('btn-new-project').onclick = () => {
  if (newProjectNumberInput) newProjectNumberInput.value = '';
  if (newProjectNameInput) newProjectNameInput.value = '';
  if (newProjectErrorEl) newProjectErrorEl.textContent = '';
  newProjectModal.classList.add('visible');
  if (newProjectNumberInput) newProjectNumberInput.focus();
};

modalCancelBtn.onclick = () => {
  newProjectModal.classList.remove('visible');
};

if (newProjectNumberInput) {
  newProjectNumberInput.addEventListener('input', (e) => {
    const value = sanitizeProjectNumber(e.target.value || '');
    if (e.target.value !== value) e.target.value = value;
  });
}

modalCreateBtn.onclick = async () => {
  const number = sanitizeProjectNumber(newProjectNumberInput.value || '');
  const name = String(newProjectNameInput.value || '').trim();
  if (!number) {
    if (newProjectErrorEl) newProjectErrorEl.textContent = 'Please enter a project number.';
    return;
  }
  if (!name) {
    if (newProjectErrorEl) newProjectErrorEl.textContent = 'Please enter a project name.';
    return;
  }

  modalCreateBtn.disabled = true;
  try {
    const created = await createProject(name, number);
    newProjectModal.classList.remove('visible');
    await loadProjects();
    openStagingEditor(created);
  } catch (e) {
    if (newProjectErrorEl) newProjectErrorEl.textContent = e.message || 'Failed to create project.';
  } finally {
    modalCreateBtn.disabled = false;
  }
};

document.getElementById('btn-open-project').onclick = async () => {
  try {
    const fetched = await fetchProjects();
    modalProjects = fetched.filter(isStagingProject);
    if (openProjectSearchInput) openProjectSearchInput.value = '';
    applyModalSearch();
    openProjectModal.classList.add('visible');
    if (openProjectSearchInput) openProjectSearchInput.focus();
  } catch (e) {
    window.alert('Error loading projects: ' + (e.message || e));
  }
};

openModalCloseBtn.onclick = () => {
  openProjectModal.classList.remove('visible');
};

newProjectModal.onclick = (e) => {
  if (e.target === newProjectModal) newProjectModal.classList.remove('visible');
};
openProjectModal.onclick = (e) => {
  if (e.target === openProjectModal) openProjectModal.classList.remove('visible');
};

if (projectSearchInput) {
  projectSearchInput.addEventListener('input', () => applySearch({ animate: true }));
  projectSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      projectSearchInput.value = '';
      applySearch({ animate: true });
      projectSearchInput.blur();
    }
  });
}
if (openProjectSearchInput) {
  openProjectSearchInput.addEventListener('input', () => applyModalSearch());
  openProjectSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      openProjectSearchInput.value = '';
      applyModalSearch();
      openProjectSearchInput.blur();
    }
  });
}

// Realtime updates (best-effort)
try {
  const socket = io();
  socket.on('projects:changed', (projects) => {
    if (!Array.isArray(projects)) return;
    allProjects = projects.filter(isStagingProject);
    applySearch();
    if (openProjectModal && openProjectModal.classList.contains('visible')) {
      modalProjects = projects.filter(isStagingProject);
      applyModalSearch();
    }
  });
} catch (e) {}

loadProjects();
