/* ==========================================================
   Datilografia — leituras legíveis
   Tudo roda no navegador: nenhum arquivo é enviado a servidor.
   ========================================================== */

// pdf.js precisa saber onde está o worker
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

  stepFormat: document.getElementById('step-format'),
  fontFamily: document.getElementById('fontFamily'),
  fontSize: document.getElementById('fontSize'),
  lineSpacing: document.getElementById('lineSpacing'),
  previewText: document.getElementById('previewText'),
  generateBtn: document.getElementById('generateBtn'),
  generateStatus: document.getElementById('generateStatus'),
};

let selectedFiles = [];

/* ---------------- Upload UI ---------------- */

els.browseBtn.addEventListener('click', () => els.fileInput.click());

els.fileInput.addEventListener('change', (e) => {
  addFiles(Array.from(e.target.files));
});

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

els.dropzone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  addFiles(files);
});

function addFiles(files) {
  const valid = files.filter(f =>
    f.type === 'application/pdf' || f.type.startsWith('image/')
  );
  if (!valid.length) return;
  selectedFiles = selectedFiles.concat(valid);
  renderFileList();
  els.startBtn.hidden = false;
}

function renderFileList() {
  els.fileList.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = `${f.name} (${(f.size / 1024).toFixed(0)} KB)`;
    els.fileList.appendChild(li);
  });
}

els.startBtn.addEventListener('click', runOcrPipeline);

/* ---------------- OCR pipeline ---------------- */

async function runOcrPipeline() {
  if (!selectedFiles.length) return;

  els.startBtn.disabled = true;
  els.stepOcr.hidden = false;
  els.stepOcr.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setProgress(0, 'Preparando páginas…');

  try {
    // 1. Transforma todos os arquivos em uma lista de imagens (uma por página)
    const pageImages = [];
    for (const file of selectedFiles) {
      if (file.type === 'application/pdf') {
        const imgs = await pdfToImages(file);
        pageImages.push(...imgs);
      } else {
        const dataUrl = await fileToDataUrl(file);
        pageImages.push(dataUrl);
      }
    }

    // 2. Roda OCR página por página com Tesseract.js
    const worker = await Tesseract.createWorker('por', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pageFraction = 1 / pageImages.length;
          // progresso global aproximado (ajustado por página em recognizePage)
        }
      },
    });

    let fullText = '';
    for (let i = 0; i < pageImages.length; i++) {
      setProgress(
        (i / pageImages.length) * 100,
        `Reconhecendo página ${i + 1} de ${pageImages.length}…`
      );
      const { data } = await worker.recognize(pageImages[i]);
      fullText += (i > 0 ? '\n\n' : '') + data.text.trim();
    }

    await worker.terminate();

    setProgress(100, 'Concluído.');
    els.textOutput.value = fullText.trim();

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

function setProgress(pct, text) {
  els.progressFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  els.progressText.textContent = text;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfToImages(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const images = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.2 }); // resolução maior ajuda o OCR
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL('image/png'));
  }

  return images;
}

/* ---------------- Preview do formato ---------------- */

const FONT_PREVIEW = {
  times: `'Lora', Georgia, serif`,
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
    ? sample.slice(0, 260) + (sample.length > 260 ? '…' : '')
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

  const marginLeft = 56;
  const marginRight = 56;
  const marginTop = 64;
  const marginBottom = 64;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginLeft - marginRight;

  doc.setFont(family, 'normal');
  doc.setFontSize(size);

  const lineHeight = size * spacing * 1.15; // pt
  let cursorY = marginTop;

  const paragraphs = text.split(/\n{2,}/);

  paragraphs.forEach((paragraph, pIndex) => {
    const lines = doc.splitTextToSize(paragraph.replace(/\n/g, ' '), usableWidth);

    lines.forEach((line) => {
      if (cursorY + lineHeight > pageHeight - marginBottom) {
        doc.addPage();
        cursorY = marginTop;
      }
      doc.text(line, marginLeft, cursorY);
      cursorY += lineHeight;
    });

    // espaço entre parágrafos
    if (pIndex < paragraphs.length - 1) {
      cursorY += lineHeight * 0.6;
      if (cursorY > pageHeight - marginBottom) {
        doc.addPage();
        cursorY = marginTop;
      }
    }
  });

  const fileName = 'leitura-convertida.pdf';
  doc.save(fileName);
  els.generateStatus.textContent = `Pronto — "${fileName}" baixado.`;
}
