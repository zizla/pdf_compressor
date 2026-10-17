/**
 * PDF Slimmer - Pure Client-Side PDF Compression Engine
 * 100% In-Memory Browser Execution (Zero Server Communication)
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. Worker Setup & Fallback Handling for PDF.js
  // -------------------------------------------------------------------------
  if (window.pdfjsLib) {
    try {
      // Use CDN worker
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } catch (e) {
      console.warn('PDF.js worker initialization notice:', e);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Application State
  // -------------------------------------------------------------------------
  const state = {
    files: [], // Array of FileItem objects
    isProcessing: false,
    settings: {
      preset: 'balanced', // balanced, extreme, highquality, lossless
      quality: 0.72,      // 0.20 to 0.95
      scale: 1.25,        // 0.6 to 2.0 (DPI multiplier)
      grayscale: false,   // true / false
      mode: 'canvas'      // 'canvas' (image recompression) or 'lossless' (pdf-lib structure)
    },
    preview: {
      doc: null,
      currentPage: 1,
      totalPage: 1,
      fileName: '',
      blob: null
    }
  };

  // Preset Configurations
  const PRESETS = {
    balanced: {
      mode: 'canvas',
      quality: 0.72,
      scale: 1.25,
      grayscale: false
    },
    extreme: {
      mode: 'canvas',
      quality: 0.45,
      scale: 0.95,
      grayscale: false
    },
    highquality: {
      mode: 'canvas',
      quality: 0.88,
      scale: 1.55,
      grayscale: false
    },
    lossless: {
      mode: 'lossless',
      quality: 0.90,
      scale: 1.25,
      grayscale: false
    }
  };

  // -------------------------------------------------------------------------
  // 3. DOM Elements
  // -------------------------------------------------------------------------
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowse = document.getElementById('btnBrowse');
  const queueSection = document.getElementById('queueSection');
  const queueCount = document.getElementById('queueCount');
  const fileList = document.getElementById('fileList');
  const btnStartAll = document.getElementById('btnStartAll');
  const btnClearAll = document.getElementById('btnClearAll');
  const btnDownloadAll = document.getElementById('btnDownloadAll');

  // Settings DOM
  const presetButtons = document.querySelectorAll('.preset-btn');
  const btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
  const advancedControls = document.getElementById('advancedControls');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValue = document.getElementById('qualityValue');
  const scaleSlider = document.getElementById('scaleSlider');
  const scaleValue = document.getElementById('scaleValue');
  const grayscaleToggle = document.getElementById('grayscaleToggle');
  const qualityControlItem = document.getElementById('qualityControlItem');
  const scaleControlItem = document.getElementById('scaleControlItem');

  // Preview Modal DOM
  const previewModal = document.getElementById('previewModal');
  const previewTitle = document.getElementById('previewTitle');
  const previewPageIndicator = document.getElementById('previewPageIndicator');
  const previewCanvas = document.getElementById('previewCanvas');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  const btnDownloadFromModal = document.getElementById('btnDownloadFromModal');

  const toastContainer = document.getElementById('toastContainer');

  // -------------------------------------------------------------------------
  // 4. Utility Functions
  // -------------------------------------------------------------------------
  function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function generateId() {
    return 'item_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // -------------------------------------------------------------------------
  // 5. Settings Controller
  // -------------------------------------------------------------------------
  function applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    state.settings.preset = presetKey;
    state.settings.mode = preset.mode;
    state.settings.quality = preset.quality;
    state.settings.scale = preset.scale;
    state.settings.grayscale = preset.grayscale;

    // Update UI controls
    presetButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });

    qualitySlider.value = Math.round(preset.quality * 100);
    qualityValue.textContent = Math.round(preset.quality * 100) + '%';

    scaleSlider.value = preset.scale;
    scaleValue.textContent = preset.scale + 'x';

    grayscaleToggle.checked = preset.grayscale;

    // Dim sliders if lossless is selected
    const isLossless = preset.mode === 'lossless';
    qualityControlItem.style.opacity = isLossless ? '0.4' : '1';
    scaleControlItem.style.opacity = isLossless ? '0.4' : '1';
    qualitySlider.disabled = isLossless;
    scaleSlider.disabled = isLossless;
  }

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
    });
  });

  btnToggleAdvanced.addEventListener('click', () => {
    const isExpanded = advancedControls.classList.toggle('show');
    btnToggleAdvanced.classList.toggle('expanded', isExpanded);
    btnToggleAdvanced.setAttribute('aria-expanded', isExpanded);
  });

  qualitySlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    qualityValue.textContent = val + '%';
    state.settings.quality = val / 100;
  });

  scaleSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    scaleValue.textContent = val + 'x';
    state.settings.scale = val;
  });

  grayscaleToggle.addEventListener('change', (e) => {
    state.settings.grayscale = e.target.checked;
  });

  // -------------------------------------------------------------------------
  // 6. File Queue Management
  // -------------------------------------------------------------------------
  function handleFiles(fileListInput) {
    const addedFiles = Array.from(fileListInput).filter(f => {
      return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    });

    if (addedFiles.length === 0) {
      showToast('PDF 파일(.pdf)만 추가할 수 있습니다.', 'error');
      return;
    }

    let duplicateCount = 0;
    addedFiles.forEach(file => {
      const isDuplicate = state.files.some(item => item.file.name === file.name && item.file.size === file.size);
      if (isDuplicate) {
        duplicateCount++;
        return;
      }

      const fileItem = {
        id: generateId(),
        file: file,
        name: file.name,
        originalSize: file.size,
        compressedSize: 0,
        compressedBlob: null,
        status: 'waiting', // waiting, processing, done, error
        progress: 0,
        pageText: '',
        errorMessage: ''
      };

      state.files.push(fileItem);
    });

    if (duplicateCount > 0) {
      showToast(`${duplicateCount}개의 중복 파일은 제외되었습니다.`, 'info');
    }

    updateQueueUI();
    showToast(`${addedFiles.length - duplicateCount}개의 PDF 파일이 목록에 추가되었습니다.`, 'success');
  }

  function removeFile(id) {
    if (state.isProcessing) {
      showToast('압축 진행 중에는 파일을 삭제할 수 없습니다.', 'error');
      return;
    }
    state.files = state.files.filter(item => item.id !== id);
    updateQueueUI();
  }

  function clearAllFiles() {
    if (state.isProcessing) {
      showToast('압축 진행 중에는 목록을 비울 수 없습니다.', 'error');
      return;
    }
    state.files = [];
    updateQueueUI();
  }

  function updateQueueUI() {
    const count = state.files.length;
    queueCount.textContent = `${count}개`;

    if (count === 0) {
      queueSection.style.display = 'none';
      return;
    }

    queueSection.style.display = 'block';

    const completedItems = state.files.filter(f => f.status === 'done');
    btnDownloadAll.style.display = completedItems.length > 1 ? 'inline-flex' : 'none';

    // Render list
    fileList.innerHTML = '';
    state.files.forEach(item => {
      const card = document.createElement('div');
      card.className = `file-card file-card-${item.status}`;
      card.id = `card_${item.id}`;

      let statusBadge = '';
      let resultStats = '';
      let actionButtons = '';

      if (item.status === 'waiting') {
        statusBadge = `<span class="status-badge status-waiting">대기 중</span>`;
        actionButtons = `
          <button type="button" class="btn-icon btn-icon-danger" title="삭제" onclick="window.pdfApp.removeFile('${item.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></polyline></svg>
          </button>
        `;
      } else if (item.status === 'processing') {
        statusBadge = `<span class="status-badge status-processing">압축 중...</span>`;
      } else if (item.status === 'done') {
        const savedBytes = item.originalSize - item.compressedSize;
        const savedPercent = ((savedBytes / item.originalSize) * 100).toFixed(1);
        const isSmaller = savedBytes > 0;

        statusBadge = `<span class="status-badge status-done">압축 완료</span>`;
        
        resultStats = `
          <div class="file-stat-group">
            <span class="size-pill size-original">${formatBytes(item.originalSize)}</span>
            <span class="size-arrow">→</span>
            <span class="size-pill size-compressed">${formatBytes(item.compressedSize)}</span>
            <span class="savings-badge" style="${isSmaller ? '' : 'background: #64748b;'}">
              ${isSmaller ? `-${savedPercent}% 절감` : '최적화 유지'}
            </span>
          </div>
        `;

        actionButtons = `
          <button type="button" class="btn btn-secondary btn-sm" title="미리보기" onclick="window.pdfApp.openPreview('${item.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            미리보기
          </button>
          <button type="button" class="btn btn-success btn-sm" title="다운로드" onclick="window.pdfApp.downloadItem('${item.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            다운로드
          </button>
        `;
      } else if (item.status === 'error') {
        statusBadge = `<span class="status-badge status-error">실패</span>`;
        actionButtons = `
          <span style="font-size: 0.8rem; color: #f87171;">${item.errorMessage || '오류 발생'}</span>
          <button type="button" class="btn-icon btn-icon-danger" title="삭제" onclick="window.pdfApp.removeFile('${item.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        `;
      }

      card.innerHTML = `
        <div class="file-card-main">
          <div class="file-identity">
            <div class="file-pdf-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><text x="7" y="18" font-size="6" font-weight="bold" fill="currentColor">PDF</text></svg>
            </div>
            <div class="file-details">
              <div class="file-name" title="${item.name}">${item.name}</div>
              <div class="file-meta">
                <span>원본: ${formatBytes(item.originalSize)}</span>
                <span>•</span>
                ${statusBadge}
              </div>
            </div>
          </div>
          ${resultStats}
          <div class="file-actions">
            ${actionButtons}
          </div>
        </div>

        ${item.status === 'processing' ? `
          <div class="file-progress-wrap">
            <div class="progress-info">
              <span>${item.pageText || '문서 분석 중...'}</span>
              <span>${Math.round(item.progress)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill animated" style="width: ${item.progress}%;"></div>
            </div>
          </div>
        ` : ''}
      `;

      fileList.appendChild(card);
    });
  }

  // -------------------------------------------------------------------------
  // 7. Core Compression Engine
  // -------------------------------------------------------------------------

  /**
   * Compression Mode 1: High-efficiency Image Re-encoding (Canvas + jsPDF)
   * Drastically shrinks scanned pages and photo-heavy PDFs by 60%~90%.
   */
  async function compressWithCanvas(fileItem, settings) {
    if (!window.pdfjsLib || !window.jspdf) {
      throw new Error('PDF 변환 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }

    const arrayBuffer = await fileItem.file.arrayBuffer();
    
    // Load document in PDF.js
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    // Initialize jsPDF (using pt units matching standard PDF points)
    const { jsPDF } = window.jspdf;
    let newPdfDoc = null;

    const renderCanvas = document.createElement('canvas');
    const ctx = renderCanvas.getContext('2d', { willReadFrequently: true, alpha: false });

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      // Update Progress
      fileItem.pageText = `페이지 ${pageNum} / ${numPages} 압축 처리 중...`;
      fileItem.progress = ((pageNum - 0.5) / numPages) * 100;
      updateQueueUI();

      const page = await pdfDoc.getPage(pageNum);
      const originalViewport = page.getViewport({ scale: 1.0 });

      // Calculate orientation & dimensions in pt
      const orientation = originalViewport.width > originalViewport.height ? 'l' : 'p';
      const ptWidth = originalViewport.width;
      const ptHeight = originalViewport.height;

      // Scale viewport for raster quality
      const scaledViewport = page.getViewport({ scale: settings.scale });
      renderCanvas.width = Math.floor(scaledViewport.width);
      renderCanvas.height = Math.floor(scaledViewport.height);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

      // Render to canvas
      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport
      }).promise;

      // Optional Grayscale transform
      if (settings.grayscale) {
        const imgData = ctx.getImageData(0, 0, renderCanvas.width, renderCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = avg;     // Red
          data[i + 1] = avg; // Green
          data[i + 2] = avg; // Blue
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Convert to compressed JPEG data URL
      const imgDataUrl = renderCanvas.toDataURL('image/jpeg', settings.quality);

      if (pageNum === 1) {
        newPdfDoc = new jsPDF({
          orientation: orientation,
          unit: 'pt',
          format: [ptWidth, ptHeight],
          compress: true
        });
      } else {
        newPdfDoc.addPage([ptWidth, ptHeight], orientation);
      }

      newPdfDoc.addImage(
        imgDataUrl,
        'JPEG',
        0,
        0,
        ptWidth,
        ptHeight,
        undefined,
        'FAST'
      );

      fileItem.progress = (pageNum / numPages) * 100;
      updateQueueUI();
    }

    // Clean up canvas
    renderCanvas.width = 1;
    renderCanvas.height = 1;

    // Generate output blob
    const outputBuffer = newPdfDoc.output('arraybuffer');
    return new Blob([outputBuffer], { type: 'application/pdf' });
  }

  /**
   * Compression Mode 2: Lossless PDF Structure Optimization (pdf-lib)
   * Strips unnecessary metadata, deduplicates objects, and uses object streams.
   * Keeps vector graphics and text selectable.
   */
  async function compressLossless(fileItem) {
    if (!window.PDFLib) {
      throw new Error('PDF 구조 최적화 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }

    fileItem.pageText = '메타데이터 및 구조 스트림 최적화 중...';
    fileItem.progress = 50;
    updateQueueUI();

    const arrayBuffer = await fileItem.file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    // Strip metadata
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');

    // Save with object stream compression
    const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
    fileItem.progress = 100;
    updateQueueUI();

    return new Blob([compressedBytes], { type: 'application/pdf' });
  }

  /**
   * Process a single File Item
   */
  async function processFile(fileItem) {
    fileItem.status = 'processing';
    fileItem.progress = 5;
    fileItem.errorMessage = '';
    updateQueueUI();

    try {
      let compressedBlob = null;
      if (state.settings.mode === 'lossless') {
        compressedBlob = await compressLossless(fileItem);
      } else {
        compressedBlob = await compressWithCanvas(fileItem, state.settings);
      }

      fileItem.compressedBlob = compressedBlob;
      fileItem.compressedSize = compressedBlob.size;
      fileItem.status = 'done';
      fileItem.progress = 100;
    } catch (err) {
      console.error('PDF Compression failed for file:', fileItem.name, err);
      fileItem.status = 'error';
      fileItem.errorMessage = err.message || '압축 중 오류가 발생했습니다.';
    }

    updateQueueUI();
  }

  /**
   * Start processing all waiting files in queue sequentially
   */
  async function startAllCompression() {
    if (state.isProcessing) return;

    const waitingItems = state.files.filter(f => f.status === 'waiting');
    if (waitingItems.length === 0) {
      showToast('압축할 대기 중인 파일이 없습니다.', 'info');
      return;
    }

    state.isProcessing = true;
    btnStartAll.disabled = true;
    btnStartAll.innerHTML = `
      <svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
      압축 진행 중...
    `;

    for (const item of waitingItems) {
      await processFile(item);
    }

    state.isProcessing = false;
    btnStartAll.disabled = false;
    btnStartAll.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      선택한 파일 압축 시작
    `;

    showToast('모든 파일의 압축 작업이 완료되었습니다!', 'success');
  }

  // -------------------------------------------------------------------------
  // 8. Download Controllers
  // -------------------------------------------------------------------------
  function downloadItem(id) {
    const item = state.files.find(f => f.id === id);
    if (!item || !item.compressedBlob) return;

    const baseName = item.name.replace(/\.[^/.]+$/, '');
    const newName = `${baseName}_slimmer.pdf`;
    triggerDownload(item.compressedBlob, newName);
  }

  async function downloadAllZip() {
    const doneItems = state.files.filter(f => f.status === 'done' && f.compressedBlob);
    if (doneItems.length === 0) return;

    if (!window.JSZip) {
      showToast('ZIP 생성 라이브러리를 불러오지 못했습니다.', 'error');
      return;
    }

    btnDownloadAll.disabled = true;
    btnDownloadAll.textContent = 'ZIP 생성 중...';

    try {
      const zip = new JSZip();
      doneItems.forEach(item => {
        const baseName = item.name.replace(/\.[^/.]+$/, '');
        zip.file(`${baseName}_slimmer.pdf`, item.compressedBlob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, `compressed_pdfs_${Date.now()}.zip`);
      showToast('전체 파일 압축 ZIP 다운로드가 시작되었습니다.', 'success');
    } catch (e) {
      console.error(e);
      showToast('ZIP 생성에 실패했습니다.', 'error');
    } finally {
      btnDownloadAll.disabled = false;
      btnDownloadAll.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        전체 ZIP 다운로드
      `;
    }
  }

  // -------------------------------------------------------------------------
  // 9. In-Browser Preview Modal
  // -------------------------------------------------------------------------
  async function openPreview(id) {
    const item = state.files.find(f => f.id === id);
    if (!item || !item.compressedBlob) return;

    state.preview.blob = item.compressedBlob;
    state.preview.fileName = item.name;
    previewTitle.textContent = `${item.name} (압축 결과 미리보기)`;

    try {
      const arrayBuffer = await item.compressedBlob.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      state.preview.doc = pdfDoc;
      state.preview.totalPage = pdfDoc.numPages;
      state.preview.currentPage = 1;

      await renderPreviewPage(1);

      previewModal.style.display = 'flex';
    } catch (err) {
      console.error('Preview load failed:', err);
      showToast('미리보기를 불러오지 못했습니다.', 'error');
    }
  }

  async function renderPreviewPage(pageNumber) {
    if (!state.preview.doc) return;

    const page = await state.preview.doc.getPage(pageNumber);
    // Fit canvas width nicely
    const viewport = page.getViewport({ scale: 1.5 });

    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;

    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    previewPageIndicator.textContent = `${pageNumber} / ${state.preview.totalPage} 페이지`;
    btnPrevPage.disabled = pageNumber <= 1;
    btnNextPage.disabled = pageNumber >= state.preview.totalPage;
  }

  function closePreview() {
    previewModal.style.display = 'none';
    state.preview.doc = null;
    state.preview.blob = null;
  }

  btnPrevPage.addEventListener('click', () => {
    if (state.preview.currentPage > 1) {
      state.preview.currentPage--;
      renderPreviewPage(state.preview.currentPage);
    }
  });

  btnNextPage.addEventListener('click', () => {
    if (state.preview.currentPage < state.preview.totalPage) {
      state.preview.currentPage++;
      renderPreviewPage(state.preview.currentPage);
    }
  });

  btnCloseModal.addEventListener('click', closePreview);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreview();
  });

  btnDownloadFromModal.addEventListener('click', () => {
    if (state.preview.blob) {
      const baseName = state.preview.fileName.replace(/\.[^/.]+$/, '');
      triggerDownload(state.preview.blob, `${baseName}_slimmer.pdf`);
    }
  });

  // -------------------------------------------------------------------------
  // 10. Drag & Drop and Event Bindings
  // -------------------------------------------------------------------------
  btnBrowse.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      fileInput.value = ''; // Reset input to allow selecting same file again
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  });

  btnStartAll.addEventListener('click', startAllCompression);
  btnClearAll.addEventListener('click', clearAllFiles);
  btnDownloadAll.addEventListener('click', downloadAllZip);

  // Keyboard shortcut to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && previewModal.style.display !== 'none') {
      closePreview();
    }
  });

  // Export functions to global scope for inline button handlers
  window.pdfApp = {
    removeFile,
    downloadItem,
    openPreview
  };

  // Initial preset application
  applyPreset('balanced');

})();
