import {
  Archive,
  Download,
  Eraser,
  FilePlus2,
  FolderPlus,
  Info,
  ListMinus,
  Plus,
  Play,
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
  Plus,
  Play,
  UploadCloud,
};

let compressLoader;
const PREVIEW_TEXT = 'A quick fox jumps over a lazy dog.';

const state = {
  queue: [],
  queueKeys: new Set(),
  selectedKeys: new Set(),
  highlightedKey: null,
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
  convertButton: document.querySelector('#convertButton'),
  downloadAllButton: document.querySelector('#downloadAllButton'),
  downloadLabel: document.querySelector('#downloadLabel'),
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  folderInput: document.querySelector('#folderInput'),
  fontPreview: document.querySelector('#fontPreview'),
  queueCount: document.querySelector('#queueCount'),
  queueList: document.querySelector('#queueList'),
  removeSelectedButton: document.querySelector('#removeSelectedButton'),
  removeSelectedLabel: document.querySelector('#removeSelectedLabel'),
};

createIcons({ icons });
log('Ready. Add .ttf files to the queue, then start conversion.');
render();
warmCompress();

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

elements.removeSelectedButton.addEventListener('click', () => {
  const selectedCount = selectedQueueItems().length;
  if (state.running || selectedCount === 0) return;
  state.queue = state.queue.filter((item) => !state.selectedKeys.has(item.key));
  state.queueKeys = new Set(state.queue.map((item) => item.key));
  state.results = state.results.filter((result) => !state.selectedKeys.has(result.key));
  if (!state.queueKeys.has(state.highlightedKey)) {
    state.highlightedKey = null;
  }
  state.selectedKeys.clear();
  log(`Removed selected item(s): ${selectedCount}`);
  render();
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
  warmCompress();
}

async function convertQueue() {
  if (state.running || state.queue.length === 0) return;

  state.running = true;
  state.results = [];
  state.queue.forEach((item) => {
    item.status = 'Queued';
  });
  render();

  let successCount = 0;
  let failedCount = 0;

  log(`Starting conversion for ${state.queue.length} queued TTF file(s)...`);
  state.queue.forEach((item) => {
    item.status = 'Preparing';
  });
  renderQueue();

  let compress;
  try {
    compress = await getCompress();
  } catch (error) {
    state.queue.forEach((item) => {
      item.status = 'Failed';
    });
    log(`Failed to load WOFF2 compressor: ${error.message || error}`);
    state.running = false;
    render();
    return;
  }

  for (const item of state.queue) {
    try {
      item.status = 'Converting';
      renderQueue();
      const source = new Uint8Array(await item.file.arrayBuffer());
      const output = await compress(source);
      const outputName = item.file.name.replace(/\.ttf$/i, '.woff2');
      const result = {
        key: item.key,
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
  const selectedResults = selectedConvertedResults();
  elements.downloadAllButton.disabled = selectedResults.length === 0;
  const selectedCount = selectedQueueItems().length;
  const allSelected = state.queue.length > 0 && selectedCount === state.queue.length;
  elements.removeSelectedButton.disabled = state.running || selectedCount === 0;
  elements.removeSelectedLabel.textContent = allSelected ? 'Clear' : 'Remove selected';
  elements.addFilesButton.disabled = state.running;
  elements.addFolderButton.disabled = state.running;
  elements.downloadLabel.textContent = downloadButtonText(selectedResults.length);

  elements.queueCount.textContent = `${state.queue.length} ${state.queue.length === 1 ? 'file' : 'files'}`;
  renderQueue();
  void updateFontPreview();
}

function selectedQueueItems() {
  return state.queue.filter((item) => state.selectedKeys.has(item.key));
}

function selectedConvertedResults() {
  return state.results.filter((result) => state.selectedKeys.has(result.key));
}

function renderQueue() {
  elements.queueList.innerHTML = '';
  elements.queueList.append(createQueueHeader());

  if (state.queue.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Queue is empty';
    elements.queueList.append(empty);
    return;
  }

  state.queue.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'queue-row';
    if (item.key === state.highlightedKey) {
      row.classList.add('is-highlighted');
    }
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-selected', String(item.key === state.highlightedKey));
    row.addEventListener('click', () => {
      state.highlightedKey = item.key;
      render();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.highlightedKey = item.key;
        render();
      }
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedKeys.has(item.key);
    checkbox.disabled = state.running;
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener('change', (event) => {
      event.stopPropagation();
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

    row.append(checkbox, status, name, size);
    elements.queueList.append(row);
  });
}

function createQueueHeader() {
  const selectedCount = selectedQueueItems().length;
  const allSelected = state.queue.length > 0 && selectedCount === state.queue.length;
  const header = document.createElement('div');
  header.className = 'queue-row queue-header';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = allSelected;
  checkbox.indeterminate = selectedCount > 0 && !allSelected;
  checkbox.disabled = state.running || state.queue.length === 0;
  checkbox.setAttribute('aria-label', 'Select all');
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      state.queue.forEach((item) => state.selectedKeys.add(item.key));
    } else {
      state.selectedKeys.clear();
    }
    render();
  });

  const status = document.createElement('span');
  status.textContent = 'Status';

  const name = document.createElement('span');
  name.textContent = 'Name';

  const size = document.createElement('span');
  size.textContent = 'File Size';

  header.append(checkbox, status, name, size);
  return header;
}

function previewQueueItem() {
  return state.queue.find((item) => item.key === state.highlightedKey) || null;
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

function clearFontPreview() {
  state.previewRequestId += 1;
  disposePreviewFont();
  elements.fontPreview.classList.add('is-empty');
  elements.fontPreview.style.fontFamily = '';
  elements.fontPreview.textContent = PREVIEW_TEXT;
}

async function updateFontPreview() {
  if (!('FontFace' in window)) {
    clearFontPreview();
    return;
  }

  const item = previewQueueItem();
  if (!item) {
    clearFontPreview();
    return;
  }

  if (state.previewFont.key === item.key) {
    return;
  }

  const requestId = state.previewRequestId + 1;
  state.previewRequestId = requestId;
  elements.fontPreview.classList.add('is-empty');

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
  } catch (error) {
    if (state.previewRequestId !== requestId) {
      URL.revokeObjectURL(url);
      return;
    }

    URL.revokeObjectURL(url);
    clearFontPreview();
  }
}

function downloadAllResults() {
  const selectedResults = selectedConvertedResults();
  if (selectedResults.length === 0) return;

  if (selectedResults.length === 1) {
    downloadBlob(selectedResults[0].blob, selectedResults[0].name);
    return;
  }

  const zipEntries = {};
  const pendingReads = selectedResults.map(async (result) => {
    zipEntries[result.path] = new Uint8Array(await result.blob.arrayBuffer());
  });

  Promise.all(pendingReads).then(async () => {
    const { zipSync } = await import('fflate');
    const zipped = zipSync(zipEntries, { level: 9 });
    const blob = new Blob([zipped], { type: 'application/zip' });
    downloadBlob(blob, 'woff2-fonts.zip');
  });
}

function downloadButtonText(downloadableCount) {
  if (downloadableCount === 1) return 'Download file';
  if (downloadableCount > 1) return 'Download archive';
  return 'Download';
}

async function getCompress() {
  if (!compressLoader) {
    compressLoader = import('wawoff2/compress')
      .then((module) => module.default)
      .catch((error) => {
        compressLoader = undefined;
        throw error;
      });
  }

  return compressLoader;
}

function warmCompress() {
  const preload = () => {
    void getCompress().catch((error) => {
      console.warn('WOFF2 compressor preload failed:', error);
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preload, { timeout: 1200 });
    return;
  }

  window.setTimeout(preload, 400);
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
  if (status === 'Converting' || status === 'Preparing') return 'is-running';
  return '';
}

function log(message) {
  console.info(message);
}
