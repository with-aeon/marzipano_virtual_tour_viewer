import { cleanupHotspotsForDeletedImages } from './hotspots.js';
import { showAlert, showConfirm, showTimedAlert } from '../dialog.js';
import { appendProjectParams } from '../project-context.js';

export function initDelete() {
  const deleteSelectionBtnEl = document.getElementById('pano-delete-selection-btn');
  if (deleteSelectionBtnEl) {
    deleteSelectionBtnEl.addEventListener('click', handleDeleteSelection);
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-pano-action="delete"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const li = button.closest('#pano-image-list li');
    if (li?.dataset?.filename) {
      const { loadPanorama } = await import('../marzipano-viewer.js');
      await loadPanorama(li.dataset.filename);
    }
    await handleDeleteSingle();
  });
}

async function handleDeleteSingle() {
  const { getSelectedImageName } = await import('../marzipano-viewer.js');
  const selectedName = getSelectedImageName();
  if (!selectedName) {
    await showAlert('Please select an image to delete.', 'Delete');
    return;
  }

  const msg = `Are you sure you want to delete "${selectedName}"?`;
  const confirmDelete = await showConfirm(msg, 'Delete');
  if (!confirmDelete) return;

  await deleteImages([selectedName], 'Delete');
}

async function handleDeleteSelection() {
  const { getMultiSelectedImageNames, isDeleteSelectionMode, setDeleteSelectionMode } = await import('../marzipano-viewer.js');
  const deleteSelectionBtnEl = document.getElementById('pano-delete-selection-btn');

  if (!isDeleteSelectionMode()) {
    setDeleteSelectionMode(true);
    if (deleteSelectionBtnEl) {
      deleteSelectionBtnEl.classList.add('active');
      deleteSelectionBtnEl.title = 'Ctrl/Cmd+Click panoramas to mark them, then click again to delete';
    }
    await showTimedAlert('Delete selection mode enabled. Use Ctrl/Cmd+Click to mark panoramas in red.', 'Delete selection', 900);
    return;
  }

  const selectedNames = getMultiSelectedImageNames();
  if (selectedNames.length === 0) {
    await showAlert('No panoramas marked. Use Ctrl/Cmd+Click to mark panoramas in red.', 'Delete selection');
    return;
  }

  const msg = selectedNames.length === 1
    ? `Are you sure you want to delete "${selectedNames[0]}"?`
    : `Are you sure you want to delete ${selectedNames.length} selected images?`;
  const confirmDelete = await showConfirm(msg, 'Delete selection');
  if (!confirmDelete) return;

  setDeleteSelectionMode(false);
  if (deleteSelectionBtnEl) {
    deleteSelectionBtnEl.classList.remove('active');
    deleteSelectionBtnEl.title = 'Click to start delete-selection mode';
  }
  await deleteImages(selectedNames, 'Delete selection');
}

async function deleteImages(imageNames, title) {
  if (!Array.isArray(imageNames) || imageNames.length === 0) return;

  const errors = [];
  const deletedNames = [];
  for (const name of imageNames) {
    try {
      const res = await fetch(appendProjectParams(`/upload/${encodeURIComponent(name)}`), { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        errors.push(`${name}: ${data.message}`);
      } else {
        deletedNames.push(name);
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  if (deletedNames.length > 0) {
    try {
      const { floorplanApi } = await import('./floorplans.js');
      if (floorplanApi && typeof floorplanApi.cleanupForDeletedPano === 'function') {
        deletedNames.forEach((name) => floorplanApi.cleanupForDeletedPano(name));
      }
    } catch (e) {
      // ignore
    }
  }

  const { clearSelection, clearMultiSelection, loadImages } = await import('../marzipano-viewer.js');
  clearSelection();
  clearMultiSelection();
  await loadImages(cleanupHotspotsForDeletedImages);

  if (errors.length > 0) {
    await showAlert('Some images could not be deleted:\n' + errors.join('\n'), title);
  } else {
    const successMsg = imageNames.length === 1
      ? 'Panorama image deleted successfully.'
      : `${imageNames.length} panorama images deleted successfully.`;
    await showTimedAlert(successMsg, title, 500);
  }
}
