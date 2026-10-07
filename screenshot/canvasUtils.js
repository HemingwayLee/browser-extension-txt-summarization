// Find the picture area inside letterbox / pillarbox black bars.
export function contentRect(canvas, { darkLevel = 24, maxBright = 0.08, minFraction = 0.3 } = {}) {
  const W = canvas.width;
  const H = canvas.height;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const luma = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  // A row/column counts as bar if nearly all of it is dark; small overlays
  // (YouTube's title, logo) that sit inside the bars must not stop the trim.
  const rowDark = (y) => {
    let bright = 0, n = 0;
    for (let x = 0; x < W; x += 4, n++) if (luma((y * W + x) * 4) > darkLevel) bright++;
    return bright <= n * maxBright;
  };
  const colDark = (x, y0, y1) => {
    let bright = 0, n = 0;
    for (let y = y0; y < y1; y += 4, n++) if (luma((y * W + x) * 4) > darkLevel) bright++;
    return bright <= n * maxBright;
  };

  let top = 0;
  while (top < H && rowDark(top)) top++;
  let bottom = H;
  while (bottom > top && rowDark(bottom - 1)) bottom--;
  let left = 0;
  while (left < W && colDark(left, top, bottom)) left++;
  let right = W;
  while (right > left && colDark(right - 1, top, bottom)) right--;

  // Real letterbox / pillarbox bars come in matching pairs; take the smaller
  // side so a dark edge in the scene itself isn't cut away.
  const barY = Math.min(top, H - bottom);
  const barX = Math.min(left, W - right);
  const minBar = 0.01;
  const y = barY >= H * minBar ? barY : 0;
  const x = barX >= W * minBar ? barX : 0;
  const w = W - 2 * x;
  const h = H - 2 * y;
  // A (mostly) black frame is a dark scene, not bars — keep it whole.
  if (w < W * minFraction || h < H * minFraction) return { x: 0, y: 0, w: W, h: H };
  return { x, y, w, h };
}

export function cropCanvas(canvas, { x, y, w, h }) {
  if (x === 0 && y === 0 && w === canvas.width && h === canvas.height) return canvas;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}

export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}
