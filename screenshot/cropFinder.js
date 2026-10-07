// Largest fixed-aspect-ratio rectangle inside a W×H frame that avoids every text box.
//
// Sizes are k·(rw, rh) for integer k, so the crop is *exactly* rw:rh.
// Feasibility is monotonic in k (a smaller rect fits wherever a bigger one did),
// so we binary-search k. For a given size, any free placement can be slid left
// until it hits x=0 or a box's right edge, then up until it hits y=0 or a box's
// bottom edge — so only x ∈ {0, box.x1} × y ∈ {0, box.y1} need checking.

/**
 * @param {number} W frame width
 * @param {number} H frame height
 * @param {Array<{x0,y0,x1,y1}>} boxes text boxes (frame pixels)
 * @param {[number, number]} ratio e.g. [16, 9] or [9, 16]
 * @param {number} margin extra pixels kept clear around each text box
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function findLargestCrop(W, H, boxes, ratio, margin = 0) {
  const g = gcd(ratio[0], ratio[1]);
  const rw = ratio[0] / g;
  const rh = ratio[1] / g;

  const obstacles = boxes
    .map((b) => ({
      x0: Math.max(0, Math.floor(b.x0 - margin)),
      y0: Math.max(0, Math.floor(b.y0 - margin)),
      x1: Math.min(W, Math.ceil(b.x1 + margin)),
      y1: Math.min(H, Math.ceil(b.y1 + margin)),
    }))
    .filter((o) => o.x1 > o.x0 && o.y1 > o.y0);

  let lo = 0; // largest k known to fit (0 = nothing)
  let hi = Math.min(Math.floor(W / rw), Math.floor(H / rh));
  if (hi > 0 && place(W, H, hi * rw, hi * rh, obstacles)) {
    lo = hi;
  } else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (place(W, H, mid * rw, mid * rh, obstacles)) lo = mid;
      else hi = mid;
    }
  }
  if (lo === 0) return null;

  const w = lo * rw;
  const h = lo * rh;
  return center(place(W, H, w, h, obstacles, true), W, H, w, h, obstacles);
}

// Returns a free top-left position for a w×h rect, or null.
// With `all`, returns the candidate whose centre is closest to the frame centre.
function place(W, H, w, h, obstacles, all = false) {
  const xs = uniq([0, ...obstacles.map((o) => o.x1)]).filter((x) => x + w <= W);
  const ys = uniq([0, ...obstacles.map((o) => o.y1)]).filter((y) => y + h <= H);
  let best = null;
  let bestDist = Infinity;

  for (const x of xs) {
    const col = obstacles.filter((o) => o.x0 < x + w && o.x1 > x);
    for (const y of ys) {
      if (col.some((o) => o.y0 < y + h && o.y1 > y)) continue;
      if (!all) return { x, y };
      const dist = Math.hypot(x + w / 2 - W / 2, y + h / 2 - H / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }
  }
  return best;
}

// Shift the (left/top-anchored) placement into the middle of its free slack.
function center(pos, W, H, w, h, obstacles) {
  let { x, y } = pos;

  let slackX = W - (x + w);
  for (const o of obstacles) {
    if (o.y0 < y + h && o.y1 > y && o.x0 >= x + w) slackX = Math.min(slackX, o.x0 - (x + w));
  }
  x += Math.floor(slackX / 2);

  let slackY = H - (y + h);
  for (const o of obstacles) {
    if (o.x0 < x + w && o.x1 > x && o.y0 >= y + h) slackY = Math.min(slackY, o.y0 - (y + h));
  }
  y += Math.floor(slackY / 2);

  return { x, y, w, h };
}

function uniq(a) {
  return [...new Set(a)];
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}
