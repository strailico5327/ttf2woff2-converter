import {
  Archive,
  Download,
  Eraser,
  FilePlus2,
  FolderPlus,
  Info,
  ListMinus,
  Play,
  Trash2,
  UploadCloud,
  createIcons,
} from 'lucide';
import './styles.css';

const icons = {
  Archive,
  Download,
  Eraser,
  FilePlus2,
  FolderPlus,
  Info,
  ListMinus,
  Play,
  Trash2,
  UploadCloud,
};

let compressLoader;
const PREVIEW_TEXT = 'A quick fox jumps over a lazy dog.';

const state = {
  queue: [],
  queueKeys: new Set(),
  selectedKeys: new Set(),
  results: [],
  running: false,
  previewRequestId: 0,
  previewFont: {
    key: null,
    face: null,
    url: null,
  },
};

const elements = {
  aboutButton: document.querySelector('#aboutButton'),
  aboutDialog: document.querySelector('#aboutDialog'),
  addFilesButton: document.querySelector('#addFilesButton'),
  addFolderButton: document.querySelector('#addFolderButton'),
  clearLogButton: document.querySelector('#clearLogButton'),
  clearQueueButton: document.querySelector('#clearQueueButton'),
  convertButton: document.querySelector('#convertButton'),
  downloadAllButton: document.querySelector('#downloadAllButton'),
  downloadLabel: document.querySelector('#downloadLabel'),
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  folderInput: document.querySelector('#folderInput'),
  fontPreview: document.querySelector('#fontPreview'),
  logBox: document.querySelector('#logBox'),
  previewMeta: document.querySelector('#previewMeta'),
  previewTitle: document.querySelector('#previewTitle'),
  queueCount: document.querySelector('#queueCount'),
  queueList: document.querySelector('#queueList'),
  removeSelectedButton: document.querySelector('#removeSelectedButton'),
};

createIcons({ icons });
log('Ready. Add .ttf files to the queue, then start conversion.');
render();

elements.aboutButton?.addEventListener('click', () => {
  elements.aboutDialog.showModal();
});

elements.addFilesButton.addEventListener('click', (event) => {
  event.stopPropagation();
  elements.fileInput.click();
});

elements.addFolderButton.addEventListener('click', (event) => {
  event.stopPropagation();
  elements.folderInput.click();
});

elements.fileInput.addEventListener('change', () => {
  addFiles(Array.from(elements.fileInput.files));
  elements.fileInput.value = '';
});

elements.folderInput.addEventListener('change', () => {
  addFiles(Array.from(elements.folderInput.files));
  elements.folderInput.value = '';
});

elements.clearQueueButton.addEventListener('click', () => {
  if (state.running) return;
  const count = state.queue.length;
  state.queue = [];
  state.queueKeys.clear();
  state.selectedKeys.clear();
  log(`Queue cleared. Removed ${count} file(s).`);
  render();
});

elements.removeSelectedButton.addEventListener('click', () => {
  if (state.running || state.selectedKeys.size === 0) return;
  const selectedCount = state.selectedKeys.size;
  state.queue = state.queue.filter((item) => !state.selectedKeys.has(item.key));
  state.queueKeys = new Set(state.queue.map((item) => item.key));
  state.selectedKeys.clear();
  log(`Removed selected item(s): ${selectedCount}`);
  render();
});

elements.clearLogButton.addEventListener('click', () => {
  elements.logBox.textContent = '';
});

elements.convertButton.addEventListener('click', () => {
  convertQueue();
});

elements.downloadAllButton.addEventListener('click', () => {
  downloadAllResults();
});

elements.dropZone.addEventListener('click', () => {
  elements.fileInput.click();
});

elements.dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    elements.fileInput.click();
  }
});

elements.dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  elements.dropZone.classList.add('is-dragging');
});

elements.dropZone.addEventListener('dragleave', () => {
  elements.dropZone.classList.remove('is-dragging');
});

elements.dropZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove('is-dragging');

  const files = await getFilesFromDrop(event.dataTransfer);
  addFiles(files);
});

function addFiles(files) {
  if (state.running) {
    log('Conversion is already running.');
    return;
  }

  const ttfFiles = files.filter((file) => file.name.toLowerCase().endsWith('.ttf'));

  if (ttfFiles.length === 0) {
    log('No .ttf files found.');
    return;
  }

  let addedCount = 0;
  let duplicateCount = 0;

  ttfFiles.forEach((file) => {
    const key = getFileKey(file);

    if (state.queueKeys.has(key)) {
      duplicateCount += 1;
      return;
    }

    state.queueKeys.add(key);
    state.queue.push({
      file,
      key,
      path: file.webkitRelativePath || file.name,
      status: 'Queued',
    });
    addedCount += 1;
  });

  log(`Added to queue: ${addedCount} file(s).`);

  if (duplicateCount > 0) {
    log(`Skipped duplicate queue item(s): ${duplicateCount}`);
  }

  render();
}

async function convertQueue() {
  if (state.running || state.queue.length === 0) return;

  state.running = true;
  state.results = [];
  render();

  let successCount = 0;
  let failedCount = 0;

  log(`Starting conversion for ${state.queue.length} queued TTF file(s)...`);
  const compress = await getCompress();

  for (const item of state.queue) {
    try {
      item.status = 'Converting';
      renderQueue();
      const source = new Uint8Array(await item.file.arrayBuffer());
      const output = await compress(source);
      const outputName = item.file.name.replace(/\.ttf$/i, '.woff2');
      const result = {
        name: outputName,
        path: item.path.replace(/\.ttf$/i, '.woff2'),
        blob: new Blob([output], { type: 'font/woff2' }),
      };

      state.results.push(result);
      successCount += 1;
      item.status = 'Done';
      log(`Done: ${item.file.name} -> ${outputName}`);
      renderQueue();
    } catch (error) {
      failedCount += 1;
      item.status = 'Failed';
      log(`Failed: ${item.file.name} | ${error.message || error}`);
      renderQueue();
    }
  }

  log('');
  log(`Conversion finished. Success: ${successCount}, failed: ${failedCount}`);
  state.running = false;
  render();
}

function render() {
  elements.convertButton.disabled = state.running || state.queue.length === 0;
  elements.downloadAllButton.disabled = state.results.length === 0;
  elements.clearQueueButton.disabled = state.running || state.queue.length === 0;
  elements.removeSelectedButton.disabled = state.running || state.selectedKeys.size === 0;
  elements.addFilesButton.disabled = state.running;
  elements.addFolderButton.disabled = state.running;
  elements.downloadLabel.textContent = downloadButtonText();

  elements.queueCount.textContent = `${state.queue.length} ${state.queue.length === 1 ? 'file' : 'files'}`;
  renderQueue();
  void updateFontPreview();
}

function renderQueue() {
  if (state.queue.length === 0) {
    elements.queueList.innerHTML = '<div class="empty-state">Queue is empty</div>';
    return;
  }

  elements.queueList.innerHTML = '';

  state.queue.forEach((item) => {
    const row = document.createElement('label');
    row.className = 'queue-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedKeys.has(item.key);
    checkbox.disabled = state.running;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.selectedKeys.add(item.key);
      } else {
        state.selectedKeys.delete(item.key);
      }
      render();
    });

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = item.path;

    const status = document.createElement('span');
    status.className = `queue-status ${statusClass(item.status)}`;
    status.textContent = item.status || 'Queued';

    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = formatBytes(item.file.size);

    row.append(checkbox, name, status, size);
    elements.queueList.append(row);
  });
}

function previewQueueItem() {
  return state.queue.find((item) => state.selectedKeys.has(item.key)) || state.queue[0] || null;
}

function disposePreviewFont() {
  if (state.previewFont.face) {
    document.fonts.delete(state.previewFont.face);
  }
  if (state.previewFont.url) {
    URL.revokeObjectURL(state.previewFont.url);
  }
  state.previewFont = {
    key: null,
    face: null,
    url: null,
  };
}

function clearFontPreview(title = 'No font selected', meta = 'Add a TTF file to preview it') {
  state.previewRequestId += 1;
  disposePreviewFont();
  elements.fontPreview.classList.add('is-empty');
  elements.fontPreview.style.fontFamily = '';
  elements.fontPreview.textContent = PREVIEW_TEXT;
  elements.previewTitle.textContent = title;
  elements.previewMeta.textContent = meta;
}

async function updateFontPreview() {
  if (!('FontFace' in window)) {
    clearFontPreview('Preview unavailable', 'This browser does not support FontFace preview.');
    return;
  }

  const item = previewQueueItem();
  if (!item) {
    clearFontPreview();
    return;
  }

  if (state.previewFont.key === item.key) {
    elements.previewMeta.textContent = item.path;
    return;
  }

  const requestId = state.previewRequestId + 1;
  state.previewRequestId = requestId;
  elements.fontPreview.classList.add('is-empty');
  elements.previewTitle.textContent = 'Loading preview';
  elements.previewMeta.textContent = item.path;

  const family = `TTFPreview-${requestId}`;
  const url = URL.createObjectURL(item.file);
  const face = new FontFace(family, `url(${url})`);

  try {
    await face.load();
    if (state.previewRequestId !== requestId) {
      URL.revokeObjectURL(url);
      return;
    }

    disposePreviewFont();
    document.fonts.add(face);
    state.previewFont = {
      key: item.key,
      face,
      url,
    };
    elements.fontPreview.classList.remove('is-empty');
    elements.fontPreview.style.fontFamily = `"${family}", "Segoe UI", sans-serif`;
    elements.fontPreview.textContent = PREVIEW_TEXT;
    elements.previewTitle.textContent = 'Font preview';
    elements.previewMeta.textContent = item.path;
  } catch (error) {
    if (state.previewRequestId !== requestId) {
      URL.revokeObjectURL(url);
      return;
    }

    URL.revokeObjectURL(url);
    clearFontPreview('Preview unavailable', error.message || 'The selected font could not be previewed.');
  }
}

function downloadAllResults() {
  if (state.results.length === 0) return;

  if (state.results.length === 1) {
    downloadBlob(state.results[0].blob, state.results[0].name);
    return;
  }

  const zipEntries = {};
  const pendingReads = state.results.map(async (result) => {
    zipEntries[result.path] = new Uint8Array(await result.blob.arrayBuffer());
  });

  Promise.all(pendingReads).then(async () => {
    const { zipSync } = await import('fflate');
    const zipped = zipSync(zipEntries, { level: 9 });
    const blob = new Blob([zipped], { type: 'application/zip' });
    downloadBlob(blob, 'woff2-fonts.zip');
  });
}

function downloadButtonText() {
  if (state.results.length === 1) return 'Download file';
  if (state.results.length > 1) return 'Download archive';
  return 'Download';
}

async function getCompress() {
  if (!compressLoader) {
    compressLoader = import('wawoff2/compress').then((module) => module.default);
  }

  return compressLoader;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function getFilesFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);

  if (items.length === 0) {
    return Array.from(dataTransfer.files || []);
  }

  const fileGroups = await Promise.all(items.map((item) => {
    const entry = item.webkitGetAsEntry?.();
    return entry ? readEntry(entry) : Promise.resolve([]);
  }));

  const files = fileGroups.flat();
  return files.length > 0 ? files : Array.from(dataTransfer.files || []);
}

function readEntry(entry) {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => resolve([file]), () => resolve([]));
    });
  }

  if (!entry.isDirectory) {
    return Promise.resolve([]);
  }

  const reader = entry.createReader();
  const entries = [];

  return new Promise((resolve) => {
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (batch.length === 0) {
          const files = await Promise.all(entries.map(readEntry));
          resolve(files.flat());
          return;
        }

        entries.push(...batch);
        readBatch();
      }, () => resolve([]));
    };

    readBatch();
  });
}

function getFileKey(file) {
  return [
    file.webkitRelativePath || file.name,
    file.size,
    file.lastModified,
  ].join('|');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function statusClass(status) {
  if (status === 'Done') return 'is-done';
  if (status === 'Failed') return 'is-failed';
  if (status === 'Converting') return 'is-running';
  return '';
}

function log(message) {
  elements.logBox.textContent += `${message}\n`;
  elements.logBox.scrollTop = elements.logBox.scrollHeight;
}
