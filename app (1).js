/* ==========================================================
   Retype — leituras escaneadas em texto legível
   Tudo roda no navegador: nenhum arquivo é enviado a servidor.
   ========================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const els = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  browseBtn: document.getElementById('browseBtn'),
  fileList: document.getElementById('fileList'),
  startBtn: document.getElementById('startBtn'),

  stepOcr: document.getElementById('step-ocr'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),

  stepReview: document.getElementById('step-review'),
  textOutput: document.getElementById('textOutput'),
  exactLinesToggle: document.getElementById('exactLinesToggle'),

  stepFormat: document.getElementById('step-format'),
  fontFamily: document.getElementById('fontFamily'),
  fontSize: document.getElementById('fontSize'),
  lineSpacing: document.getElementById('lineSpacing'),
  previewText: document.getElementById('previewText'),
  generateBtn: document.getElementById('generateBtn'),
  generateStatus: document.getElementById('generateStatus'),
};

let selectedFiles = [];
// guarda os dois formatos reconstruídos (parágrafos e linhas exatas)
// para cada página, para poder alternar sem rodar o OCR de novo.
let recognizedPages = []; // [{ paragraphMode: '...', lineMode: '...' }]

/* ---------------- Upload UI ---------------- */

els.browseBtn.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', (e) => addFiles(Array.from(e.target.files)));

['dragenter', 'dragover'].forEach(evt =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.add('is-dragover');
  })
);

['dragleave', 'drop'].forEach(evt =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('is-dragover');
  })
);

els.dropzone.addEventListener('drop', (e) => addFiles(Array.from(e.dataTransfer.files || [])));

function addFiles(files) {
  const valid = files.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
  if (!valid.length) return;
  selectedFiles = selectedFiles.concat(valid);
  renderFileList();
  els.startBtn.hidden = false;
}

function renderFileList() {
  els.fileList.innerHTML = '';
  selectedFiles.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
    els.fileList.appendChild(li);
  });
}

els.startBtn.addEventListener('click', runOcrPipeline);

/* ---------------- Preparação das páginas ---------------- */

async function pdfToImages(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const images = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    images.push(canvas);
  }
  return images;
}

function fileToImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Redesenha a imagem em escala de cinza, aumenta o contraste e, se a
// resolução original for baixa, amplia — scans antigos e fotos de celular
// ganham bastante precisão de OCR com esse tratamento simples.
function preprocessToCanvas(source) {
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;

  const MIN_WIDTH = 1800;
  const scale = srcW < MIN_WIDTH ? MIN_WIDTH / srcW : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // 1) escala de cinza + 2) alongamento de contraste (histograma simples)
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const stretched = ((gray[j] - min) / range) * 255;
    data[i] = data[i + 1] = data[i + 2] = stretched;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/* ---------------- Reconstrução do texto a partir das linhas ---------------- */

// Usa os bounding boxes das linhas reconhecidas para decidir onde é quebra
// de parágrafo (linhas com espaço vertical maior entre elas) e onde é só
// a continuação de uma frase que a máquina de escrever quebrou no meio.
function reconstructText(lines) {
  const clean = lines
    .map(l => ({ text: l.text.replace(/\s+/g, ' ').trim(), bbox: l.bbox }))
    .filter(l => l.text.length > 0);

  if (!clean.length) return { paragraphMode: '', lineMode: '' };

  const lineMode = clean.map(l => l.text).join('\n');

  const gaps = [];
  for (let i = 1; i < clean.length; i++) {
    gaps.push(clean[i].bbox.y0 - clean[i - 1].bbox.y0);
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps.length
    ? sortedGaps[Math.floor(sortedGaps.length / 2)]
    : 20;

  let paragraphMode = clean[0].text;
  for (let i = 1; i < clean.length; i++) {
    const gap = clean[i].bbox.y0 - clean[i - 1].bbox.y0;
    const isNewParagraph = gap > medianGap * 1.6;
    const endsSentence = /[.!?:;]$/.test(clean[i - 1].text);
    const looksIndented = clean[i].bbox.x0 - clean[i - 1].bbox.x0 > 25;

    if (isNewParagraph || (endsSentence && looksIndented)) {
      paragraphMode += '\n\n' + clean[i].text;
    } else {
      paragraphMode += ' ' + clean[i].text;
    }
  }

  return { paragraphMode, lineMode };
}

/* ---------------- OCR pipeline ---------------- */

async function runOcrPipeline() {
  if (!selectedFiles.length) return;

  els.startBtn.disabled = true;
  els.stepOcr.hidden = false;
  els.stepOcr.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setProgress(0, 'Preparando páginas…');

  try {
    const pageSources = [];
    for (const file of selectedFiles) {
      if (file.type === 'application/pdf') {
        const canvases = await pdfToImages(file);
        pageSources.push(...canvases);
      } else {
        pageSources.push(await fileToImageElement(file));
      }
    }

    setProgress(2, 'Melhorando o contraste das páginas…');
    const processedCanvases = pageSources.map(preprocessToCanvas);

    const worker = await Tesseract.createWorker('por', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          window.__ocrCurrentProgress = m.progress;
        }
      },
    });

    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });

    recognizedPages = [];
    for (let i = 0; i < processedCanvases.length; i++) {
      setProgress(
        (i / processedCanvases.length) * 100,
        `Reconhecendo página ${i + 1} de ${processedCanvases.length}…`
      );
      const { data } = await worker.recognize(processedCanvases[i]);
      const lines = extractLines(data);
      recognizedPages.push(reconstructText(lines));
    }

    await worker.terminate();
    setProgress(100, 'Concluído.');

    applyRecognizedText();

    els.stepReview.hidden = false;
    els.stepFormat.hidden = false;
    els.generateBtn.disabled = false;
    updatePreview();
    els.stepReview.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error(err);
    setProgress(0, 'Algo deu errado ao reconhecer o texto. Tente novamente com outro arquivo.');
  } finally {
    els.startBtn.disabled = false;
  }
}

// Tesseract.js retorna a hierarquia em data.blocks -> paragraphs -> lines.
// Isso pode variar um pouco entre versões, então caímos de volta para
// dividir data.text por linha se a estrutura não vier populada.
function extractLines(data) {
  const lines = [];
  if (Array.isArray(data.blocks)) {
    for (const block of data.blocks) {
      const paragraphs = block.paragraphs || [];
      for (const para of paragraphs) {
        for (const line of (para.lines || [])) {
          if (line.text && line.text.trim()) lines.push(line);
        }
      }
    }
  }
  if (lines.length) return lines;

  // fallback: sem bbox real, mas ainda preserva quebras de linha do texto bruto
  return (data.text || '')
    .split('\n')
    .filter(t => t.trim())
    .map((text, i) => ({ text, bbox: { x0: 0, y0: i * 20, x1: 0, y1: 0 } }));
}

function applyRecognizedText() {
  const mode = els.exactLinesToggle.checked ? 'lineMode' : 'paragraphMode';
  els.textOutput.value = recognizedPages.map(p => p[mode]).join('\n\n').trim();
}

els.exactLinesToggle.addEventListener('change', () => {
  applyRecognizedText();
  updatePreview();
});

function setProgress(pct, text) {
  els.progressFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.progressText.textContent = text;
}

/* ---------------- Preview do formato ---------------- */

const FONT_PREVIEW = {
  times: `Georgia, 'Times New Roman', serif`,
  helvetica: `Arial, Helvetica, sans-serif`,
  courier: `'Courier Prime', 'Courier New', monospace`,
};

function updatePreview() {
  const family = els.fontFamily.value;
  const size = els.fontSize.value;
  const spacing = els.lineSpacing.value;

  els.previewText.style.fontFamily = FONT_PREVIEW[family];
  els.previewText.style.fontSize = `${Math.round(size * 1.15)}px`;
  els.previewText.style.lineHeight = spacing;

  const sample = (els.textOutput.value || '').trim();
  els.previewText.textContent = sample
    ? sample.slice(0, 280) + (sample.length > 280 ? '…' : '')
    : 'Assim vai ficar o texto no PDF final.';
}

[els.fontFamily, els.fontSize, els.lineSpacing].forEach(el =>
  el.addEventListener('change', updatePreview)
);
els.textOutput.addEventListener('input', updatePreview);

/* ---------------- Geração do PDF final ---------------- */

els.generateBtn.addEventListener('click', generateFinalPdf);

function generateFinalPdf() {
  const text = els.textOutput.value.trim();
  if (!text) {
    els.generateStatus.textContent = 'Não há texto para gerar o PDF.';
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const family = els.fontFamily.value; // times | helvetica | courier
  const size = parseFloat(els.fontSize.value);
  const spacing = parseFloat(els.lineSpacing.value);
  const preserveLines = els.exactLinesToggle.checked;

  const marginLeft = 56, marginRight = 56, marginTop = 64, marginBottom = 64;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginLeft - marginRight;

  doc.setFont(family, 'normal');
  doc.setFontSize(size);

  const lineHeight = size * spacing * 1.15;
  let cursorY = marginTop;

  const paragraphs = text.split(/\n{2,}/);

  const writeLine = (line) => {
    if (cursorY + lineHeight > pageHeight - marginBottom) {
      doc.addPage();
      cursorY = marginTop;
    }
    doc.text(line, marginLeft, cursorY);
    cursorY += lineHeight;
  };

  paragraphs.forEach((paragraph, pIndex) => {
    if (preserveLines) {
      // mantém cada quebra de linha original, só ajustando o que não couber na largura
      paragraph.split('\n').forEach((rawLine) => {
        const wrapped = doc.splitTextToSize(rawLine, usableWidth);
        wrapped.forEach(writeLine);
      });
    } else {
      const wrapped = doc.splitTextToSize(paragraph.replace(/\n/g, ' '), usableWidth);
      wrapped.forEach(writeLine);
    }

    if (pIndex < paragraphs.length - 1) {
      cursorY += lineHeight * 0.6;
      if (cursorY > pageHeight - marginBottom) {
        doc.addPage();
        cursorY = marginTop;
      }
    }
  });

  doc.save('leitura-convertida.pdf');
  els.generateStatus.textContent = 'Pronto — "leitura-convertida.pdf" baixado.';
}
