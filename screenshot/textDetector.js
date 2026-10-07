// PaddleOCR (PP-OCRv4) text *detection* running in the browser via onnxruntime-web.
// The model is a DB (Differentiable Binarization) net: it outputs a per-pixel
// "is text" probability map, which we binarize and turn into boxes.
// Adapted from auto-youtube-screenshot-pure-frontend; onnxruntime-web and the model are
// bundled with the extension because extensions can't load code from a CDN.

import * as ort from '../vendor/onnxruntime-web/ort.wasm.min.mjs';

const ORT_DIR = new URL('../vendor/onnxruntime-web/', import.meta.url).href;
const MODEL_URLS = [new URL('../models/ch_PP-OCRv4_det_infer.onnx', import.meta.url).href];

// PaddleOCR det preprocessing: BGR, scale 1/255, ImageNet mean/std.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export class TextDetector {
  constructor({
    limitSideLen = 960, // longest side fed to the model (PaddleOCR default)
    thresh = 0.3,       // pixel probability threshold
    boxThresh = 0.6,    // mean probability a region needs to count as text
    unclipRatio = 1.5,  // DB boxes are shrunk during training; expand them back
    minSize = 3,
    maxCandidates = 1000,
  } = {}) {
    Object.assign(this, { limitSideLen, thresh, boxThresh, unclipRatio, minSize, maxCandidates });
    this.session = null;
    this._loading = null;
  }

  async load() {
    if (this.session) return;
    if (!this._loading) {
      this._loading = this._load().catch((err) => {
        this._loading = null;
        throw err;
      });
    }
    await this._loading;
  }

  async _load() {
    ort.env.wasm.wasmPaths = ORT_DIR;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

    let lastErr;
    for (const url of MODEL_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const buf = await res.arrayBuffer();
        this.session = await ort.InferenceSession.create(buf, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        this.modelUrl = url;
        return;
      } catch (err) {
        console.warn('Model load failed:', url, err);
        lastErr = err;
      }
    }
    throw new Error(`Could not load the PaddleOCR detection model: ${lastErr?.message || lastErr}`);
  }

  /**
   * Detect text regions in a canvas.
   * @returns {Promise<Array<{x0:number,y0:number,x1:number,y1:number,score:number}>>}
   *          axis-aligned boxes in the canvas' pixel coordinates.
   */
  async detect(canvas) {
    await this.load();
    const W = canvas.width;
    const H = canvas.height;

    // Resize so the longest side is <= limitSideLen and both sides are multiples of 32.
    const ratio = Math.max(W, H) > this.limitSideLen ? this.limitSideLen / Math.max(W, H) : 1;
    const rw = Math.max(32, Math.round((W * ratio) / 32) * 32);
    const rh = Math.max(32, Math.round((H * ratio) / 32) * 32);

    const tmp = document.createElement('canvas');
    tmp.width = rw;
    tmp.height = rh;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(canvas, 0, 0, rw, rh);
    const px = tctx.getImageData(0, 0, rw, rh).data;

    const plane = rw * rh;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      const r = px[i * 4] / 255;
      const g = px[i * 4 + 1] / 255;
      const b = px[i * 4 + 2] / 255;
      input[i] = (b - MEAN[0]) / STD[0];
      input[plane + i] = (g - MEAN[1]) / STD[1];
      input[2 * plane + i] = (r - MEAN[2]) / STD[2];
    }

    const feeds = { [this.session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, rh, rw]) };
    const out = await this.session.run(feeds);
    const prob = out[this.session.outputNames[0]].data; // [1, 1, rh, rw]

    return this._boxesFromProbMap(prob, rw, rh, rw / W, rh / H, W, H);
  }

  // Connected components over the binarized map -> scored, unclipped, axis-aligned boxes.
  _boxesFromProbMap(prob, w, h, scaleX, scaleY, W, H) {
    const n = w * h;
    const visited = new Uint8Array(n);
    const stack = new Int32Array(n);
    const boxes = [];
    const t = this.thresh;

    for (let i = 0; i < n && boxes.length < this.maxCandidates; i++) {
      if (visited[i] || prob[i] <= t) continue;

      let sp = 0;
      stack[sp++] = i;
      visited[i] = 1;
      let minX = w, maxX = -1, minY = h, maxY = -1, sum = 0, cnt = 0;

      while (sp) {
        const p = stack[--sp];
        const x = p % w;
        const y = (p - x) / w;
        sum += prob[p];
        cnt++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (x > 0 && !visited[p - 1] && prob[p - 1] > t) { visited[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && !visited[p + 1] && prob[p + 1] > t) { visited[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && !visited[p - w] && prob[p - w] > t) { visited[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && !visited[p + w] && prob[p + w] > t) { visited[p + w] = 1; stack[sp++] = p + w; }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (Math.min(bw, bh) < this.minSize) continue;
      const score = sum / cnt;
      if (score < this.boxThresh) continue;

      // DB "unclip": offset distance = area * ratio / perimeter.
      const d = (bw * bh * this.unclipRatio) / (2 * (bw + bh));
      if (Math.min(bw, bh) + 2 * d < this.minSize + 2) continue;

      boxes.push({
        x0: clamp((minX - d) / scaleX, 0, W),
        y0: clamp((minY - d) / scaleY, 0, H),
        x1: clamp((maxX + 1 + d) / scaleX, 0, W),
        y1: clamp((maxY + 1 + d) / scaleY, 0, H),
        score,
      });
    }
    return boxes;
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
