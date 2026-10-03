import './style.css';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { parseGIF, decompressFrames } from 'gifuct-js';

// State Management
const state = {
  deviceUrl: localStorage.getItem('keypixel_url') || 'http://keypixel.local',
  isConnected: false,
  deviceStatus: null,
  filesList: [],
  currentFile: '',
  activeTab: 'video', // 'video' | 'image' | 'gif'
  
  // Media source state
  loadedVideoFile: null,
  loadedImage: null,
  loadedGifBlob: null,
  loadedGifParsed: null,
  loadedGifFrames: null,
  
  // Video Trimming & Params
  videoDuration: 0,
  trimStart: 0,
  trimEnd: 3,
  videoFps: 12,
  cropMode: 'cover',
  colorQuality: 128,

  // Image Params
  imgZoom: 1,
  imgContrast: 1,
  imgPixelate: false,

  // Result Ready
  generatedBlob: null,
  generatedFileName: 'animacao.gif',
};

// DOM References
const el = {
  deviceUrlInput: document.getElementById('device-url'),
  btnConnect: document.getElementById('btn-connect'),
  btnWifiConfig: document.getElementById('btn-wifi-config'),
  connectionDot: document.getElementById('connection-dot'),
  storageSummary: document.getElementById('storage-summary'),
  storageText: document.getElementById('storage-text'),
  storageBar: document.getElementById('storage-bar'),
  
  // Simulator
  virtualScreen: document.getElementById('virtual-screen'),
  simPlaceholder: document.getElementById('sim-placeholder'),
  simStatusBadge: document.getElementById('sim-status-badge'),
  simPowerLed: document.getElementById('sim-power-led'),
  screenScanlines: document.getElementById('screen-scanlines'),
  chkScanlines: document.getElementById('chk-scanlines'),
  currentPlayingName: document.getElementById('current-playing-name'),
  btnRefreshScreen: document.getElementById('btn-refresh-screen'),
  
  // Tabs & Dropzone
  tabVideo: document.getElementById('tab-video'),
  tabImage: document.getElementById('tab-image'),
  tabGif: document.getElementById('tab-gif'),
  mediaDropzone: document.getElementById('media-dropzone'),
  mediaFileInput: document.getElementById('media-file-input'),
  btnBrowseFile: document.getElementById('btn-browse-file'),
  dropzoneTitle: document.getElementById('dropzone-title'),
  dropzoneDesc: document.getElementById('dropzone-desc'),
  dropzoneIcon: document.getElementById('dropzone-icon'),

  // Video Editor
  videoEditor: document.getElementById('video-editor'),
  sourceVideo: document.getElementById('source-video'),
  videoFpsInput: document.getElementById('video-fps'),
  valFps: document.getElementById('val-fps'),
  videoCropMode: document.getElementById('video-crop-mode'),
  colorQuality: document.getElementById('color-quality'),
  valColors: document.getElementById('val-colors'),
  trimmerHighlight: document.getElementById('trimmer-highlight'),
  trimStartInput: document.getElementById('trim-start'),
  trimEndInput: document.getElementById('trim-end'),
  valTrimStart: document.getElementById('val-trim-start'),
  valTrimEnd: document.getElementById('val-trim-end'),
  valFrameCount: document.getElementById('val-frame-count'),
  trimDurationBadge: document.getElementById('trim-duration-badge'),
  btnConvertVideo: document.getElementById('btn-convert-video'),

  // Image Editor
  imageEditor: document.getElementById('image-editor'),
  imageCropCanvas: document.getElementById('image-crop-canvas'),
  imgZoomInput: document.getElementById('img-zoom'),
  valImgZoom: document.getElementById('val-img-zoom'),
  imgContrastInput: document.getElementById('img-contrast'),
  valImgContrast: document.getElementById('val-img-contrast'),
  chkPixelate: document.getElementById('chk-pixelate'),
  btnConvertImage: document.getElementById('btn-convert-image'),

  // GIF Optimizer
  gifDirectEditor: document.getElementById('gif-direct-editor'),
  sourceGifPreview: document.getElementById('source-gif-preview'),
  gifStatName: document.getElementById('gif-stat-name'),
  gifStatSize: document.getElementById('gif-stat-size'),
  gifStatDim: document.getElementById('gif-stat-dim'),
  gifStatFrames: document.getElementById('gif-stat-frames'),
  gifCropMode: document.getElementById('gif-crop-mode'),
  gifFrameSkip: document.getElementById('gif-frame-skip'),
  gifColors: document.getElementById('gif-colors'),
  btnOptimizeGif: document.getElementById('btn-optimize-gif'),
  gifWarningBox: document.getElementById('gif-warning-box'),

  // Progress & Export Box
  conversionProgress: document.getElementById('conversion-progress'),
  progressStatusText: document.getElementById('progress-status-text'),
  progressPercentage: document.getElementById('progress-percentage'),
  conversionBarFill: document.getElementById('conversion-bar-fill'),

  exportBox: document.getElementById('export-box'),
  exportFilename: document.getElementById('export-filename'),
  exportFilesize: document.getElementById('export-filesize'),
  exportPreviewImg: document.getElementById('export-preview-img'),
  btnSendToEsp: document.getElementById('btn-send-to-esp'),
  btnDownloadLocal: document.getElementById('btn-download-local'),
  btnCancelExport: document.getElementById('btn-cancel-export'),
  uploadProgressBox: document.getElementById('upload-progress-box'),
  uploadStatusText: document.getElementById('upload-status-text'),
  uploadPercentage: document.getElementById('upload-percentage'),
  uploadBarFill: document.getElementById('upload-bar-fill'),

  // Gallery
  filesGrid: document.getElementById('files-grid'),
  emptyGallery: document.getElementById('empty-gallery'),
  fileCountBadge: document.getElementById('file-count-badge'),
  btnRefreshFiles: document.getElementById('btn-refresh-files'),

  // Wi-Fi Modal
  wifiModal: document.getElementById('wifi-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnCancelWifi: document.getElementById('btn-cancel-wifi'),
  wifiForm: document.getElementById('wifi-form'),
  wifiSsid: document.getElementById('wifi-ssid'),
  wifiPass: document.getElementById('wifi-pass'),
  
  toastContainer: document.getElementById('toast-container'),
};

// Initialize Canvas Contexts
const simCtx = el.virtualScreen.getContext('2d');
const imgCtx = el.imageCropCanvas.getContext('2d');

// Toast Notification Helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> <span>${message}</span>`;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Format byte sizes
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format seconds to mm:ss.s
function formatTime(sec) {
  return sec.toFixed(1) + 's';
}

// -------------------------------------------------------------
// Connection & Device Telemetry
// -------------------------------------------------------------
async function checkDeviceStatus() {
  const url = el.deviceUrlInput.value.trim().replace(/\/$/, '');
  state.deviceUrl = url;
  localStorage.setItem('keypixel_url', url);

  el.connectionDot.className = 'connection-status-dot';
  el.storageText.textContent = 'Verificando...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${url}/api/status`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      state.isConnected = true;
      state.deviceStatus = data;
      state.currentFile = data.currentFile || '';

      // Update UI Indicators
      el.connectionDot.className = 'connection-status-dot connected';
      el.simStatusBadge.className = 'badge badge-success';
      el.simStatusBadge.textContent = data.wifi?.mode === 'AP' ? 'Modo SoftAP' : 'Online (Wi-Fi)';
      el.simPowerLed.className = 'power-indicator online';

      // Update Storage Gauge
      const total = data.storage?.total || 2818048;
      const used = data.storage?.used || 0;
      const free = data.storage?.free || (total - used);
      const percent = Math.min(100, Math.round((used / total) * 100));

      el.storageText.textContent = `${formatBytes(used)} / ${formatBytes(total)} (${percent}%)`;
      el.storageBar.style.width = `${percent}%`;

      // Update Now Playing Info
      const filename = state.currentFile.replace(/^\//, '');
      el.currentPlayingName.textContent = filename || 'Nenhuma mídia ativa';

      // Load Simulator Preview and Gallery
      loadSimulatorMedia(state.currentFile);
      loadGalleryFiles();
      showToast('ESP32 conectada com sucesso!', 'success');
      return true;
    }
  } catch (err) {
    console.warn('[KeyPixel] Erro de conexao:', err);
  }

  // Fallback state if unreachable
  state.isConnected = false;
  el.connectionDot.className = 'connection-status-dot disconnected';
  el.simStatusBadge.className = 'badge';
  el.simStatusBadge.textContent = 'Desconectado';
  el.simPowerLed.className = 'power-indicator';
  el.storageText.textContent = 'Offline';
  el.storageBar.style.width = '0%';
  showToast('Nao foi possivel conectar a ESP32. Verifique o IP ou Wi-Fi.', 'error');
  return false;
}

// -------------------------------------------------------------
// ST7789 Simulator Media Preview
// -------------------------------------------------------------
function loadSimulatorMedia(filePath) {
  if (!filePath) {
    el.simPlaceholder.classList.remove('hidden');
    return;
  }

  el.simPlaceholder.classList.add('hidden');
  const cleanName = filePath.replace(/^\//, '');
  const mediaUrl = `${state.deviceUrl}/files/${cleanName}?t=${Date.now()}`;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    simCtx.clearRect(0, 0, 240, 240);
    simCtx.drawImage(img, 0, 0, 240, 240);
  };
  img.onerror = () => {
    // If CORS or error, draw cute pixel standby
    drawStandbyPixelArt(cleanName);
  };
  img.src = mediaUrl;
}

function drawStandbyPixelArt(name) {
  simCtx.fillStyle = '#080c16';
  simCtx.fillRect(0, 0, 240, 240);

  simCtx.fillStyle = '#00f0ff';
  simCtx.font = '14px Outfit, sans-serif';
  simCtx.textAlign = 'center';
  simCtx.fillText('DISPLAY ATIVO', 120, 100);

  simCtx.fillStyle = '#94a3b8';
  simCtx.font = '11px JetBrains Mono, monospace';
  simCtx.fillText(name || 'anime.gif', 120, 130);

  simCtx.fillStyle = '#00ff9d';
  simCtx.fillText('● Reproduzindo na ESP32', 120, 155);
}

// -------------------------------------------------------------
// ESP32 File Explorer / Gallery
// -------------------------------------------------------------
async function loadGalleryFiles() {
  if (!state.isConnected) return;

  try {
    const res = await fetch(`${state.deviceUrl}/api/files`);
    if (res.ok) {
      const data = await res.json();
      state.filesList = data.files || [];
      state.currentFile = data.current || state.currentFile;
      renderGallery();
    }
  } catch (err) {
    console.error('Erro ao listar arquivos:', err);
  }
}

function renderGallery() {
  el.fileCountBadge.textContent = `${state.filesList.length} ${state.filesList.length === 1 ? 'arquivo' : 'arquivos'}`;

  if (state.filesList.length === 0) {
    el.filesGrid.innerHTML = '';
    el.filesGrid.appendChild(el.emptyGallery);
    return;
  }

  el.filesGrid.innerHTML = '';

  state.filesList.forEach((file) => {
    const card = document.createElement('div');
    const isCurrent = (file.path === state.currentFile || file.name === state.currentFile.replace(/^\//, ''));
    card.className = `media-card ${isCurrent ? 'is-active' : ''}`;

    const cleanName = file.name;
    const fileUrl = `${state.deviceUrl}/files/${cleanName}`;

    card.innerHTML = `
      <div class="card-thumb-wrapper">
        <img src="${fileUrl}" alt="${cleanName}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\'><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23666\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>GIF</text></svg>'"/>
        ${isCurrent ? '<div class="card-playing-badge">ATIVO</div>' : ''}
      </div>
      <div class="card-info">
        <span class="card-name" title="${cleanName}">${cleanName}</span>
        <span class="card-size">${formatBytes(file.size)}</span>
      </div>
      <div class="card-actions">
        <button class="btn btn-sm ${isCurrent ? 'btn-secondary' : 'btn-primary'} btn-play" data-file="${cleanName}">
          ${isCurrent ? '✓ Exibindo' : '▶ Exibir'}
        </button>
        <button class="btn btn-sm btn-ghost btn-delete" data-file="${cleanName}" title="Excluir da memória">
          🗑
        </button>
      </div>
    `;

    // Play action
    card.querySelector('.btn-play').addEventListener('click', () => {
      playFileOnEsp(cleanName);
    });

    // Delete action
    card.querySelector('.btn-delete').addEventListener('click', () => {
      if (confirm(`Deseja excluir "${cleanName}" da memória flash da ESP32?`)) {
        deleteFileOnEsp(cleanName);
      }
    });

    el.filesGrid.appendChild(card);
  });
}

async function playFileOnEsp(filename) {
  try {
    const res = await fetch(`${state.deviceUrl}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename }),
    });
    if (res.ok) {
      state.currentFile = filename.startsWith('/') ? filename : '/' + filename;
      el.currentPlayingName.textContent = filename;
      loadSimulatorMedia(state.currentFile);
      renderGallery();
      showToast(`Reproduzindo "${filename}" no display!`, 'success');
    }
  } catch (err) {
    showToast('Falha ao acionar reprodução.', 'error');
  }
}

async function deleteFileOnEsp(filename) {
  try {
    const res = await fetch(`${state.deviceUrl}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename }),
    });
    if (res.ok) {
      showToast(`Arquivo "${filename}" removido.`, 'success');
      loadGalleryFiles();
      checkDeviceStatus();
    }
  } catch (err) {
    showToast('Erro ao excluir arquivo.', 'error');
  }
}

// -------------------------------------------------------------
// Drag & Drop & Media Input Handling
// -------------------------------------------------------------
function setupDropzone() {
  const dropzone = el.mediaDropzone;
  const input = el.mediaFileInput;

  el.btnBrowseFile.addEventListener('click', () => input.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      handleFileSelected(input.files[0]);
    }
  });
}

function handleFileSelected(file) {
  el.exportBox.classList.add('hidden');
  const type = file.type;
  const name = file.name.toLowerCase();

  if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov')) {
    switchTab('video');
    setupVideoEditor(file);
  } else if (name.endsWith('.gif') || type === 'image/gif') {
    switchTab('gif');
    setupGifDirectEditor(file);
  } else if (type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
    switchTab('image');
    setupImageEditor(file);
  } else {
    showToast('Formato nao suportado. Use video (MP4/WebM), imagem (PNG/JPG) ou GIF.', 'error');
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  el.tabVideo.classList.toggle('active', tab === 'video');
  el.tabImage.classList.toggle('active', tab === 'image');
  el.tabGif.classList.toggle('active', tab === 'gif');

  el.tabVideo.setAttribute('aria-selected', tab === 'video');
  el.tabImage.setAttribute('aria-selected', tab === 'image');
  el.tabGif.setAttribute('aria-selected', tab === 'gif');

  el.videoEditor.classList.toggle('hidden', tab !== 'video' || !state.loadedVideoFile);
  el.imageEditor.classList.toggle('hidden', tab !== 'image' || !state.loadedImage);
  el.gifDirectEditor.classList.toggle('hidden', tab !== 'gif' || !state.loadedGifBlob);
}

// -------------------------------------------------------------
// 1. Video Studio Editor & Transcoder
// -------------------------------------------------------------
function setupVideoEditor(file) {
  state.loadedVideoFile = file;
  state.generatedFileName = file.name.replace(/\.[^/.]+$/, '') + '.gif';
  
  const video = el.sourceVideo;
  video.src = URL.createObjectURL(file);

  video.onloadedmetadata = () => {
    state.videoDuration = video.duration;
    state.trimStart = 0;
    state.trimEnd = Math.min(3.0, video.duration); // Default 3 second clip

    el.trimStartInput.max = video.duration;
    el.trimEndInput.max = video.duration;
    el.trimStartInput.value = 0;
    el.trimEndInput.value = state.trimEnd;

    updateTimelineUI();
    el.videoEditor.classList.remove('hidden');
    el.mediaDropzone.classList.add('hidden');
    video.currentTime = 0;
  };
}

function updateTimelineUI() {
  const dur = state.trimEnd - state.trimStart;
  el.valTrimStart.textContent = formatTime(state.trimStart);
  el.valTrimEnd.textContent = formatTime(state.trimEnd);
  el.trimDurationBadge.textContent = `${formatTime(dur)} / ${formatTime(state.videoDuration)}`;

  const totalFrames = Math.max(1, Math.round(dur * state.videoFps));
  el.valFrameCount.textContent = `${totalFrames} frames (~${Math.round(totalFrames * 4.5)} KB)`;

  // Update slider highlight track
  if (state.videoDuration > 0) {
    const leftPct = (state.trimStart / state.videoDuration) * 100;
    const rightPct = 100 - (state.trimEnd / state.videoDuration) * 100;
    el.trimmerHighlight.style.left = `${leftPct}%`;
    el.trimmerHighlight.style.right = `${rightPct}%`;
  }
}

// Timeline Trimming Slider Events
el.trimStartInput.addEventListener('input', (e) => {
  let val = parseFloat(e.target.value);
  if (val >= state.trimEnd - 0.2) {
    val = Math.max(0, state.trimEnd - 0.2);
    e.target.value = val;
  }
  state.trimStart = val;
  el.sourceVideo.currentTime = val;
  updateTimelineUI();
});

el.trimEndInput.addEventListener('input', (e) => {
  let val = parseFloat(e.target.value);
  if (val <= state.trimStart + 0.2) {
    val = Math.min(state.videoDuration, state.trimStart + 0.2);
    e.target.value = val;
  }
  state.trimEnd = val;
  el.sourceVideo.currentTime = val;
  updateTimelineUI();
});

el.videoFpsInput.addEventListener('input', (e) => {
  state.videoFps = parseInt(e.target.value, 10);
  el.valFps.textContent = `${state.videoFps} FPS`;
  updateTimelineUI();
});

el.videoCropMode.addEventListener('change', (e) => {
  state.cropMode = e.target.value;
});

el.colorQuality.addEventListener('change', (e) => {
  state.colorQuality = parseInt(e.target.value, 10);
  el.valColors.textContent = `${state.colorQuality} Cores`;
});

// Convert Video to GIF using gifenc
el.btnConvertVideo.addEventListener('click', async () => {
  if (!state.loadedVideoFile) return;

  const video = el.sourceVideo;
  const fps = state.videoFps;
  const startTime = state.trimStart;
  const endTime = state.trimEnd;
  const duration = endTime - startTime;
  const frameInterval = 1 / fps;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const delayMs = Math.round(1000 / fps);
  const maxColors = state.colorQuality;

  // Show progress box
  el.conversionProgress.classList.remove('hidden');
  el.exportBox.classList.add('hidden');
  el.btnConvertVideo.disabled = true;

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = 240;
  offscreenCanvas.height = 240;
  const offCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

  const gif = GIFEncoder();

  let frameIdx = 0;
  let currTime = startTime;

  const seekTo = (time) => {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = Math.min(video.duration, Math.max(0, time));
    });
  };

  try {
    while (currTime <= endTime && frameIdx < totalFrames) {
      await seekTo(currTime);

      // Render frame onto 240x240 canvas with selected crop mode
      offCtx.fillStyle = '#000000';
      offCtx.fillRect(0, 0, 240, 240);

      const vw = video.videoWidth || 240;
      const vh = video.videoHeight || 240;

      if (state.cropMode === 'cover') {
        const scale = Math.max(240 / vw, 240 / vh);
        const sw = 240 / scale;
        const sh = 240 / scale;
        const sx = (vw - sw) / 2;
        const sy = (vh - sh) / 2;
        offCtx.drawImage(video, sx, sy, sw, sh, 0, 0, 240, 240);
      } else if (state.cropMode === 'contain') {
        const scale = Math.min(240 / vw, 240 / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (240 - dw) / 2;
        const dy = (240 - dh) / 2;
        offCtx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
      } else {
        // Stretch
        offCtx.drawImage(video, 0, 0, 240, 240);
      }

      // Extract pixel buffer
      const imageData = offCtx.getImageData(0, 0, 240, 240);
      const rgba = imageData.data;

      // Quantize palette and write frame
      const palette = quantize(rgba, maxColors);
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, 240, 240, { palette, delay: delayMs });

      frameIdx++;
      currTime += frameInterval;

      // Update progress
      const pct = Math.min(99, Math.round((frameIdx / totalFrames) * 100));
      el.progressPercentage.textContent = `${pct}%`;
      el.progressStatusText.textContent = `Processando frame ${frameIdx} de ${totalFrames}...`;
      el.conversionBarFill.style.width = `${pct}%`;
    }

    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([bytes], { type: 'image/gif' });

    displayExportResult(blob, state.generatedFileName);
    showToast('GIF 240×240 gerado com sucesso!', 'success');
  } catch (err) {
    console.error('Erro na conversao:', err);
    showToast('Falha na transcodificacao do video.', 'error');
  } finally {
    el.conversionProgress.classList.add('hidden');
    el.btnConvertVideo.disabled = false;
  }
});

// -------------------------------------------------------------
// 2. Static Image Editor & Converter
// -------------------------------------------------------------
function setupImageEditor(file) {
  state.generatedFileName = file.name.replace(/\.[^/.]+$/, '') + '.gif';
  const img = new Image();
  img.onload = () => {
    state.loadedImage = img;
    renderImageToCanvas();
    el.imageEditor.classList.remove('hidden');
    el.mediaDropzone.classList.add('hidden');
  };
  img.src = URL.createObjectURL(file);
}

function renderImageToCanvas() {
  if (!state.loadedImage) return;

  const img = state.loadedImage;
  imgCtx.fillStyle = '#000000';
  imgCtx.fillRect(0, 0, 240, 240);

  imgCtx.filter = `contrast(${state.imgContrast * 100}%)`;

  const scale = (Math.max(240 / img.width, 240 / img.height)) * state.imgZoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (240 - dw) / 2;
  const dy = (240 - dh) / 2;

  imgCtx.drawImage(img, dx, dy, dw, dh);
  imgCtx.filter = 'none';

  // Apply Retro Pixelation filter if checked
  if (state.imgPixelate) {
    const size = 3;
    const w = 240 / size;
    const h = 240 / size;
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = w;
    smallCanvas.height = h;
    const sCtx = smallCanvas.getContext('2d');
    sCtx.drawImage(el.imageCropCanvas, 0, 0, w, h);
    imgCtx.imageSmoothingEnabled = false;
    imgCtx.drawImage(smallCanvas, 0, 0, w, h, 0, 0, 240, 240);
  }
}

el.imgZoomInput.addEventListener('input', (e) => {
  state.imgZoom = parseInt(e.target.value, 10) / 100;
  el.valImgZoom.textContent = `${e.target.value}%`;
  renderImageToCanvas();
});

el.imgContrastInput.addEventListener('input', (e) => {
  state.imgContrast = parseInt(e.target.value, 10) / 100;
  el.valImgContrast.textContent = `${e.target.value}%`;
  renderImageToCanvas();
});

el.chkPixelate.addEventListener('change', (e) => {
  state.imgPixelate = e.target.checked;
  renderImageToCanvas();
});

el.btnConvertImage.addEventListener('click', () => {
  if (!state.loadedImage) return;

  const imageData = imgCtx.getImageData(0, 0, 240, 240);
  const rgba = imageData.data;

  const gif = GIFEncoder();
  const palette = quantize(rgba, 128);
  const index = applyPalette(rgba, palette);
  gif.writeFrame(index, 240, 240, { palette, delay: 1000 });
  gif.finish();

  const bytes = gif.bytes();
  const blob = new Blob([bytes], { type: 'image/gif' });
  displayExportResult(blob, state.generatedFileName);
  showToast('Imagem convertida para padrão ST7789!', 'success');
});

// -------------------------------------------------------------
// 3. GIF Optimizer for ESP32 (Compress & Resize)
// -------------------------------------------------------------
async function setupGifDirectEditor(file) {
  state.loadedGifBlob = file;
  state.generatedFileName = file.name;

  el.gifStatName.textContent = file.name;
  el.gifStatSize.textContent = formatBytes(file.size);
  el.gifStatDim.textContent = 'Lendo dimensões...';
  el.gifStatFrames.textContent = 'Extraindo quadros...';
  
  const url = URL.createObjectURL(file);
  el.sourceGifPreview.src = url;

  el.gifDirectEditor.classList.remove('hidden');
  el.mediaDropzone.classList.add('hidden');

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseGIF(buffer);
    const frames = decompressFrames(parsed, true);
    state.loadedGifParsed = parsed;
    state.loadedGifFrames = frames;

    const w = parsed.lsd.width;
    const h = parsed.lsd.height;
    el.gifStatDim.textContent = `${w}×${h} px`;
    el.gifStatFrames.textContent = `${frames.length} quadros`;

    const isOversized = (w !== 240 || h !== 240 || file.size > 250 * 1024);
    if (isOversized) {
      el.gifWarningBox.innerHTML = `⚠️ <strong>GIF detectado com ${w}×${h} px (${formatBytes(file.size)})!</strong> O display ST7789 exige 240×240 px e a memória da ESP32-C3 trava com arquivos grandes. Clique abaixo em 'Otimizar & Converter' para torná-lo 100% compatível!`;
      el.gifWarningBox.style.borderColor = 'var(--accent-magenta)';
    } else {
      el.gifWarningBox.innerHTML = `✓ <strong>GIF compatível:</strong> Este arquivo já possui dimensões compactas. Você pode otimizá-lo ainda mais ou enviá-lo diretamente.`;
      el.gifWarningBox.style.borderColor = 'var(--accent-emerald)';
      displayExportResult(file, file.name);
    }
  } catch (err) {
    console.error('Erro ao decodificar GIF:', err);
    el.gifStatDim.textContent = 'Não detectado';
    el.gifStatFrames.textContent = 'N/A';
  }
}

el.btnOptimizeGif.addEventListener('click', async () => {
  if (!state.loadedGifFrames || state.loadedGifFrames.length === 0) {
    showToast('Nenhum quadro de GIF disponível para otimizar.', 'error');
    return;
  }

  const frames = state.loadedGifFrames;
  const parsed = state.loadedGifParsed;
  const origW = parsed.lsd.width;
  const origH = parsed.lsd.height;
  const step = parseInt(el.gifFrameSkip.value, 10) || 1;
  const maxColors = parseInt(el.gifColors.value, 10) || 128;
  const cropMode = el.gifCropMode.value;

  // Show progress UI
  el.conversionProgress.classList.remove('hidden');
  el.exportBox.classList.add('hidden');
  el.btnOptimizeGif.disabled = true;

  // Canvas to hold the cumulative frame assembly of the original GIF
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = origW;
  compositeCanvas.height = origH;
  const compCtx = compositeCanvas.getContext('2d');

  // Small patch canvas for putting the raw ImageData
  const patchCanvas = document.createElement('canvas');
  const patchCtx = patchCanvas.getContext('2d');

  // Output 240x240 canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = 240;
  outCanvas.height = 240;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

  const gif = GIFEncoder();
  const totalFramesToProcess = Math.ceil(frames.length / step);
  let processedCount = 0;

  try {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      // Disposal: 2 = Restore to background color
      if (frame.disposalType === 2) {
        compCtx.clearRect(0, 0, origW, origH);
      }

      // Draw current frame patch onto composite canvas
      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      const imgData = new ImageData(frame.patch, frame.dims.width, frame.dims.height);
      patchCtx.putImageData(imgData, 0, 0);
      compCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

      // Only save if it matches our step
      if (i % step === 0) {
        // Clear 240x240 output
        outCtx.fillStyle = '#000000';
        outCtx.fillRect(0, 0, 240, 240);

        if (cropMode === 'cover') {
          const scale = Math.max(240 / origW, 240 / origH);
          const sw = 240 / scale;
          const sh = 240 / scale;
          const sx = (origW - sw) / 2;
          const sy = (origH - sh) / 2;
          outCtx.drawImage(compositeCanvas, sx, sy, sw, sh, 0, 0, 240, 240);
        } else {
          // Contain
          const scale = Math.min(240 / origW, 240 / origH);
          const dw = origW * scale;
          const dh = origH * scale;
          const dx = (240 - dw) / 2;
          const dy = (240 - dh) / 2;
          outCtx.drawImage(compositeCanvas, 0, 0, origW, origH, dx, dy, dw, dh);
        }

        const outData = outCtx.getImageData(0, 0, 240, 240);
        const rgba = outData.data;

        const palette = quantize(rgba, maxColors);
        const index = applyPalette(rgba, palette);
        const delay = Math.max(20, Math.round((frame.delay || 40) * step));
        gif.writeFrame(index, 240, 240, { palette, delay });

        processedCount++;
        const pct = Math.min(99, Math.round((processedCount / totalFramesToProcess) * 100));
        el.progressPercentage.textContent = `${pct}%`;
        el.progressStatusText.textContent = `Otimizando frame ${processedCount} de ${totalFramesToProcess}...`;
        el.conversionBarFill.style.width = `${pct}%`;

        // Yield to browser thread every 4 frames so UI stays responsive
        if (processedCount % 4 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([bytes], { type: 'image/gif' });

    displayExportResult(blob, state.generatedFileName);
    const origSize = state.loadedGifBlob ? state.loadedGifBlob.size : blob.size;
    const reduction = Math.max(0, Math.round((1 - (blob.size / origSize)) * 100));
    showToast(`Otimização concluída! Redução de ${reduction}% (${formatBytes(origSize)} ➔ ${formatBytes(blob.size)})`, 'success');
  } catch (err) {
    console.error('Erro ao otimizar GIF:', err);
    showToast('Falha na otimização do GIF.', 'error');
  } finally {
    el.conversionProgress.classList.add('hidden');
    el.btnOptimizeGif.disabled = false;
  }
});

// -------------------------------------------------------------
// Export Result & Sending to ESP32
// -------------------------------------------------------------
function displayExportResult(blob, filename) {
  state.generatedBlob = blob;
  const cleanName = filename.toLowerCase().endsWith('.gif') ? filename : filename + '.gif';
  state.generatedFileName = cleanName;

  el.exportFilename.textContent = cleanName;
  el.exportFilesize.textContent = formatBytes(blob.size);
  
  const previewUrl = URL.createObjectURL(blob);
  el.exportPreviewImg.src = previewUrl;

  el.exportBox.classList.remove('hidden');
  el.exportBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Download locally
el.btnDownloadLocal.addEventListener('click', () => {
  if (!state.generatedBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(state.generatedBlob);
  a.download = state.generatedFileName;
  a.click();
});

// Cancel Export
el.btnCancelExport.addEventListener('click', () => {
  el.exportBox.classList.add('hidden');
  el.mediaDropzone.classList.remove('hidden');
  el.videoEditor.classList.add('hidden');
  el.imageEditor.classList.add('hidden');
  el.gifDirectEditor.classList.add('hidden');
  state.loadedVideoFile = null;
  state.loadedImage = null;
  state.loadedGifBlob = null;
});

// Upload direct to ESP32 via HTTP POST /api/upload
el.btnSendToEsp.addEventListener('click', async () => {
  if (!state.generatedBlob) return;

  const url = el.deviceUrlInput.value.trim().replace(/\/$/, '');
  const cleanName = state.generatedFileName.replace(/^\//, '');

  el.uploadProgressBox.classList.remove('hidden');
  el.uploadPercentage.textContent = '0%';
  el.uploadBarFill.style.width = '0%';
  el.btnSendToEsp.disabled = true;

  const formData = new FormData();
  formData.append('file', state.generatedBlob, cleanName);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${url}/api/upload`, true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      el.uploadPercentage.textContent = `${pct}%`;
      el.uploadBarFill.style.width = `${pct}%`;
      el.uploadStatusText.textContent = `Enviando ${formatBytes(e.loaded)} de ${formatBytes(e.total)}...`;
    }
  };

  xhr.onload = () => {
    el.uploadProgressBox.classList.add('hidden');
    el.btnSendToEsp.disabled = false;

    if (xhr.status >= 200 && xhr.status < 300) {
      showToast(`Mídia "${cleanName}" gravada e exibida na ESP32!`, 'success');
      state.currentFile = '/' + cleanName;
      el.currentPlayingName.textContent = cleanName;
      loadSimulatorMedia(state.currentFile);
      loadGalleryFiles();
      checkDeviceStatus();
    } else {
      showToast('Falha no upload para a ESP32.', 'error');
    }
  };

  xhr.onerror = () => {
    el.uploadProgressBox.classList.add('hidden');
    el.btnSendToEsp.disabled = false;
    showToast('Erro de conexao durante o upload para a ESP32.', 'error');
  };

  xhr.send(formData);
});

// -------------------------------------------------------------
// Scanlines & Display Controls
// -------------------------------------------------------------
el.chkScanlines.addEventListener('change', (e) => {
  el.screenScanlines.style.display = e.target.checked ? 'block' : 'none';
});

el.btnRefreshScreen.addEventListener('click', () => {
  checkDeviceStatus();
});

// -------------------------------------------------------------
// Wi-Fi Settings Modal
// -------------------------------------------------------------
el.btnWifiConfig.addEventListener('click', () => {
  el.wifiModal.classList.remove('hidden');
});

el.btnCloseModal.addEventListener('click', () => {
  el.wifiModal.classList.add('hidden');
});

el.btnCancelWifi.addEventListener('click', () => {
  el.wifiModal.classList.add('hidden');
});

el.wifiForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ssid = el.wifiSsid.value.trim();
  const pass = el.wifiPass.value;

  try {
    const res = await fetch(`${state.deviceUrl}/api/wifi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid, password: pass }),
    });

    if (res.ok) {
      showToast('Credenciais salvas! A ESP32 conectara a nova rede.', 'success');
      el.wifiModal.classList.add('hidden');
      setTimeout(checkDeviceStatus, 3000);
    } else {
      showToast('Nao foi possivel salvar as configuracoes.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexao com a ESP32.', 'error');
  }
});

// -------------------------------------------------------------
// Initial Boot & Event Listeners
// -------------------------------------------------------------
el.btnConnect.addEventListener('click', checkDeviceStatus);
el.btnRefreshFiles.addEventListener('click', loadGalleryFiles);

// Tab Buttons
el.tabVideo.addEventListener('click', () => switchTab('video'));
el.tabImage.addEventListener('click', () => switchTab('image'));
el.tabGif.addEventListener('click', () => switchTab('gif'));

setupDropzone();

// Auto-check connection on page load
checkDeviceStatus();
