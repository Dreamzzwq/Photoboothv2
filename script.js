// script.js
// Photobooth: capture 4 photos with timer, apply filter, overlay frame/sticker, make strip & download + QR

const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const retakeBtn = document.getElementById('retakeBtn');
const filterSelect = document.getElementById('filterSelect');
const frameInput = document.getElementById('frameInput');
const stickerInput = document.getElementById('stickerInput');
const clearOverlays = document.getElementById('clearOverlays');
const timerEl = document.getElementById('timer');

const stripPreview = document.getElementById('stripPreview');
const thumbsWrap = document.getElementById('thumbs');
const downloadBtn = document.getElementById('downloadBtn');
const shareQRBtn = document.getElementById('shareQRBtn');
const qrContainer = document.getElementById('qrContainer');

const overlayCanvas = document.getElementById('captureOverlay');
const overlayCtx = overlayCanvas.getContext('2d');

let stream;
let captures = []; // array of Image or canvas data
let overlayFrameImg = null;
let overlayStickerImg = null;
let isCapturing = false;

// start camera
async function startCamera(){
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio:false });
    video.srcObject = stream;
    await video.play();

    // size overlayCanvas to video display size after metadata loaded
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
  }catch(err){
    alert('Tidak bisa mengakses kamera: ' + err.message);
  }
}

function resizeOverlay(){
  // set overlay canvas size same as video display area
  const rect = video.getBoundingClientRect();
  overlayCanvas.width = rect.width;
  overlayCanvas.height = rect.height;
  overlayCanvas.style.left = rect.left + 'px';
  overlayCanvas.style.top = rect.top + 'px';
  drawOverlay(); // redraw if frame loaded
}

function drawOverlay(){
  overlayCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
  if(overlayFrameImg){
    // draw frame to fit overlay canvas fully
    overlayCtx.drawImage(overlayFrameImg, 0, 0, overlayCanvas.width, overlayCanvas.height);
  }
  if(overlayStickerImg){
    // draw sticker at center-ish scaled
    const iw = overlayStickerImg.width;
    const ih = overlayStickerImg.height;
    const scale = Math.min(overlayCanvas.width * 0.4 / iw, overlayCanvas.height * 0.3 / ih, 1);
    const w = iw * scale, h = ih * scale;
    const x = (overlayCanvas.width - w) / 2;
    const y = overlayCanvas.height - h - 20; // bottom area
    overlayCtx.drawImage(overlayStickerImg, x, y, w, h);
  }
}

// capture single frame from video, applying current filter and overlays
function captureFrame(){
  // create an offscreen canvas sized to video natural resolution
  const videoSettings = stream.getVideoTracks()[0].getSettings();
  // attempt to get higher resolution; fallback to displayed size
  const srcW = video.videoWidth || overlayCanvas.width;
  const srcH = video.videoHeight || overlayCanvas.height;

  const canvas = document.createElement('canvas');
  // maintain portrait orientation similar to user expectation: we'll use srcW x srcH as is
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d');

  // apply filter
  ctx.filter = filterSelect.value || 'none';

  // draw video content (center-crop to preserve aspect nicely)
  // compute source crop to keep aspect ratio same as canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // draw overlays onto the captured canvas (scale overlays to canvas)
  if(overlayFrameImg){
    ctx.drawImage(overlayFrameImg, 0, 0, canvas.width, canvas.height);
  }
  if(overlayStickerImg){
    const scale = Math.min(canvas.width * 0.4 / overlayStickerImg.width, canvas.height * 0.3 / overlayStickerImg.height, 1);
    const w = overlayStickerImg.width * scale;
    const h = overlayStickerImg.height * scale;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - h - Math.round(canvas.height * 0.03);
    ctx.drawImage(overlayStickerImg, x, y, w, h);
  }

  return canvas;
}

// take 4 pics with 3s timer
async function take4Photos(){
  if(!stream) return;
  isCapturing = true;
  startBtn.disabled = true;
  retakeBtn.disabled = true;
  captures = [];
  thumbsWrap.innerHTML = '';
  timerEl.textContent = '';

  for(let i=0;i<4;i++){
    // countdown 3..1
    for(let t=3;t>0;t--){
      timerEl.textContent = `Foto ${i+1} - Bersiap... ${t}`;
      await new Promise(r => setTimeout(r, 1000));
    }
    timerEl.textContent = `Mengambil foto ${i+1}...`;
    // slight delay for camera stabilization
    await new Promise(r => setTimeout(r, 150));
    const canvas = captureFrame();
    captures.push(canvas);
    addThumb(canvas);
    timerEl.textContent = `Selesai foto ${i+1}`;
    await new Promise(r => setTimeout(r, 400));
  }

  // build strip preview
  buildStrip();
  timerEl.textContent = 'Selesai! Lihat pratinjau di kanan.';
  startBtn.disabled = false;
  retakeBtn.disabled = false;
  downloadBtn.disabled = false;
  shareQRBtn.disabled = false;
  isCapturing = false;
}

// add small thumbnail
function addThumb(canvas){
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const img = new Image();
  img.src = canvas.toDataURL('image/png');
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  thumb.appendChild(img);
  thumbsWrap.appendChild(thumb);
}

// build final strip (vertical) and draw into stripPreview canvas
function buildStrip(){
  if(captures.length === 0) return;
  // set each capture's width/height from their canvas
  const w = captures[0].width;
  const h = captures[0].height;
  // final strip canvas: keep width limited (we'll scale preview), but here create proper resolution
  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = w;
  stripCanvas.height = h * captures.length;
  const ctx = stripCanvas.getContext('2d');

  // white background (or dark) with spacing
  ctx.fillStyle = '#071021';
  ctx.fillRect(0,0,stripCanvas.width, stripCanvas.height);

  for(let i=0;i<captures.length;i++){
    ctx.drawImage(captures[i], 0, i*h, w, h);
  }

  // optional outer frame border on strip
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(6, Math.round(w * 0.01));
  ctx.strokeRect(ctx.lineWidth/2, ctx.lineWidth/2, stripCanvas.width-ctx.lineWidth, stripCanvas.height-ctx.lineWidth);

  // display into preview canvas but scaled to preview size
  // compute scale to fit preview element max width (stripPreview.width)
  const preview = stripPreview;
  // set preview canvas proportionally (we'll scale down the image)
  const maxPreviewWidth = 240; // as per CSS
  const scale = Math.min(maxPreviewWidth / stripCanvas.width, 1);
  preview.width = Math.round(stripCanvas.width * scale);
  preview.height = Math.round(stripCanvas.height * scale);
  const pctx = preview.getContext('2d');
  pctx.clearRect(0,0,preview.width, preview.height);
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(stripCanvas, 0, 0, preview.width, preview.height);

  // save final strip data url to download link
  const dataUrl = stripCanvas.toDataURL('image/png');
  // attach to downloadLink
  const dl = document.getElementById('downloadLink');
  dl.href = dataUrl;
  dl.download = `photobooth_strip_${Date.now()}.png`;

  // store data for download action
  stripPreview.finalDataUrl = dataUrl;
}

// download handler
function onDownload(){
  if(!stripPreview.finalDataUrl) return;
  const a = document.getElementById('downloadLink');
  a.href = stripPreview.finalDataUrl;
  a.download = `photobooth_strip_${Date.now()}.png`;
  a.click();
}

// generate QR to data URL (shows QR that points to the PNG data URL)
function onShareQR(){
  if(!stripPreview.finalDataUrl) return;
  qrContainer.innerHTML = '';
  const qrCanvas = document.createElement('canvas');
  qrContainer.appendChild(qrCanvas);
  // generate short downloadable link? We'll embed data URL directly (large), but better to create blob url to shorten
  fetch(stripPreview.finalDataUrl)
    .then(res => res.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      QRCode.toCanvas(qrCanvas, blobUrl, { width: 160 })
        .then(() => {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.textContent = 'Klik untuk buka/unduh';
          link.style.display = 'block';
          link.style.marginTop = '8px';
          link.style.color = '#e6eef8';
          qrContainer.appendChild(link);
        })
        .catch(err => console.error(err));
    });
}

// frame upload
frameInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if(!f) return;
  const img = new Image();
  img.onload = () => {
    overlayFrameImg = img;
    drawOverlay();
  };
  img.src = URL.createObjectURL(f);
});

// sticker upload
stickerInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if(!f) return;
  const img = new Image();
  img.onload = () => {
    overlayStickerImg = img;
    drawOverlay();
  };
  img.src = URL.createObjectURL(f);
});

clearOverlays.addEventListener('click', () => {
  overlayFrameImg = null;
  overlayStickerImg = null;
  drawOverlay();
});

// button actions
startBtn.addEventListener('click', () => {
  if(isCapturing) return;
  take4Photos();
});

retakeBtn.addEventListener('click', () => {
  captures = [];
  thumbsWrap.innerHTML = '';
  stripPreview.getContext('2d').clearRect(0,0,stripPreview.width, stripPreview.height);
  stripPreview.finalDataUrl = null;
  downloadBtn.disabled = true;
  shareQRBtn.disabled = true;
  timerEl.textContent = '—';
});

downloadBtn.addEventListener('click', onDownload);
shareQRBtn.addEventListener('click', onShareQR);

// keep overlay updated when filter changes (overlay unaffected by filter preview)
filterSelect.addEventListener('change', () => {
  // optional: show little flash; captures will use ctx.filter when drawn
});

// when video resizes, update overlay size
video.addEventListener('loadedmetadata', resizeOverlay);
video.addEventListener('play', resizeOverlay);

// init camera on load
startCamera();

// accessibility: stop camera on page unload
window.addEventListener('beforeunload', () => {
  if(stream){
    stream.getTracks().forEach(t => t.stop());
  }
});
