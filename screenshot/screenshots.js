// Text-free screenshots of a YouTube video, taken while it is being summarized.
//
// Frames are read inside a YouTube tab by drawing the page's own <video> element onto a canvas,
// which gives clean frames (no player controls or overlays) at the video's resolution. Each frame
// then goes through PP-OCR text detection, and the largest 16:9 or 9:16 area with no text is kept,
// as in auto-youtube-screenshot-pure-frontend. Like that project, nothing is stored: results live
// in memory until the side panel closes, and only the crops the user downloads are kept.
//
// Uses withYouTubeVideoTab() from youtube-tab.js, which the side panel loads as a plain script.

import { TextDetector } from './textDetector.js';
import { findLargestCrop } from './cropFinder.js';
import { contentRect, cropCanvas, canvasToBlob } from './canvasUtils.js';

export const DEFAULT_SCREENSHOT_SETTINGS = {
  enabled: true,
  count: 5,
  ratio: 'auto', // 'auto' (match the video), '16:9' or '9:16'
  margin: 8, // clearance around text, in pixels
  confidence: 0.6, // PP-OCR boxes scoring below this are ignored
  minArea: 10 // smallest useful crop, as % of the frame
};

export function normalizeScreenshotSettings(settings = {}) {
  const s = { ...DEFAULT_SCREENSHOT_SETTINGS, ...settings };
  return {
    enabled: s.enabled !== false,
    count: clampInt(s.count, 1, 20, DEFAULT_SCREENSHOT_SETTINGS.count),
    ratio: ['auto', '16:9', '9:16'].includes(s.ratio) ? s.ratio : 'auto',
    margin: clampInt(s.margin, 0, 200, DEFAULT_SCREENSHOT_SETTINGS.margin),
    confidence: clampNum(s.confidence, 0.3, 0.99, DEFAULT_SCREENSHOT_SETTINGS.confidence),
    minArea: clampInt(s.minArea, 0, 100, DEFAULT_SCREENSHOT_SETTINGS.minArea)
  };
}

// Keep every candidate box with its score; the confidence setting filters them below
const detector = new TextDetector({ boxThresh: 0 });

export function loadTextDetector() {
  return detector.load();
}

export function isTextDetectorLoaded() {
  return Boolean(detector.session);
}

// ---- In-page functions (run in the YouTube tab via executeScript; must be self-contained) ----
// They return { error } instead of throwing, because executeScript does not pass exceptions back.

async function prepareVideoInPage(videoId, boostQuality) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  if (new URLSearchParams(location.search).get('v') !== videoId) {
    return { error: 'The YouTube tab is showing a different video.' };
  }

  let player;
  let video;
  for (let waited = 0; ; waited += 500) {
    player = document.getElementById('movie_player');
    video = player?.querySelector('video');
    const adShowing = player?.classList.contains('ad-showing');
    if (adShowing) {
      document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')?.click();
    }
    if (video && !adShowing && video.duration > 0) break;
    if (waited >= 60000) {
      return { error: adShowing ? 'An ad kept playing, so no frames could be taken.' : 'The video did not load.' };
    }
    await sleep(500);
  }
  if (!Number.isFinite(video.duration)) {
    return { error: 'Live streams are not supported.' };
  }

  const duration = video.duration;
  const state = { time: video.currentTime, paused: video.paused };
  if (boostQuality) {
    // Frames come at the playing quality; ask for up to 1080p (higher only adds size)
    const levels = player.getAvailableQualityLevels?.() || [];
    const quality = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'].find(q => levels.includes(q));
    if (quality && quality !== player.getPlaybackQuality?.()) {
      player.setPlaybackQualityRange?.(quality, quality);
      // Switching quality reloads the video; wait until it is readable again
      await sleep(500);
      for (let waited = 0; waited < 15000 && !(video.readyState >= 1 && video.duration > 0); waited += 250) {
        await sleep(250);
      }
    }
  }
  video.pause();
  return { duration, state };
}

async function captureFrameInPage(time) {
  const player = document.getElementById('movie_player');
  const video = player?.querySelector('video');
  if (!video) return { error: 'The video player disappeared.' };
  if (player.classList.contains('ad-showing')) return { error: 'An ad started playing.' };

  for (let waited = 0; waited < 10000 && !(video.readyState >= 1 && video.duration > 0); waited += 250) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  video.pause();
  const seeked = new Promise(resolve => video.addEventListener('seeked', () => resolve(true), { once: true }));
  video.currentTime = time;
  const didSeek = await Promise.race([seeked, new Promise(resolve => setTimeout(() => resolve(false), 20000))]);
  if (!didSeek) return { error: `Timed out seeking to ${Math.round(time)}s.` };
  // Let the seeked frame be presented before reading it
  await Promise.race([
    new Promise(resolve => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => resolve()) : resolve())),
    new Promise(resolve => setTimeout(resolve, 500))
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  try {
    return { time: video.currentTime, dataUrl: canvas.toDataURL('image/png') };
  } catch (error) {
    return { error: 'This video cannot be captured (it may be copy-protected).' };
  }
}

function restoreVideoInPage(state) {
  const video = document.querySelector('#movie_player video');
  if (!video) return;
  video.currentTime = state.time;
  if (!state.paused) video.play().catch(() => {});
}

async function runInTab(tabId, func, args = []) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
  const result = injection?.result;
  if (!result && func !== restoreVideoInPage) throw new Error('Could not read the video in its tab.');
  if (result?.error) throw new Error(result.error);
  return result;
}

// ---- Capture and processing ----

// Stratified random times: one per equal slice of the video, skipping the first/last 5%
// (intros, end screens)
function randomTimes(duration, n) {
  const start = duration * 0.05;
  const span = duration * 0.9;
  return Array.from({ length: n }, (_, i) => start + (span * (i + Math.random())) / n);
}

async function captureFrames(videoId, count, openTabIfNeeded, onProgress) {
  onProgress('Opening the video…');
  const { result, needsTab } = await withYouTubeVideoTab(videoId, openTabIfNeeded, async (tabId, isTemporary) => {
    const { duration, state } = await runInTab(tabId, prepareVideoInPage, [videoId, isTemporary]);
    const frames = [];
    try {
      for (const [index, time] of randomTimes(duration, count).entries()) {
        onProgress(`Capturing frame ${index + 1}/${count}…`);
        frames.push(await runInTab(tabId, captureFrameInPage, [time]));
      }
    } finally {
      if (!isTemporary) {
        // Put the user's own tab back where it was
        await runInTab(tabId, restoreVideoInPage, [state]).catch(() => {});
      }
    }
    return frames;
  });
  if (needsTab) throw new Error('The video is not open in a tab.');
  return result;
}

async function dataUrlToCanvas(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}

function resolveRatio(ratio, frame) {
  if (ratio === '9:16') return [9, 16];
  if (ratio === '16:9') return [16, 9];
  return frame.width >= frame.height ? [16, 9] : [9, 16];
}

// Takes screenshots of the video and keeps the largest text-free crop of each frame.
// Returns { url, createdAt, shots: [{ time, width, height, ratio, blob }], frameCount }.
export async function takeScreenshots(url, videoId, settings, { openTabIfNeeded, onProgress = () => {} }) {
  const s = normalizeScreenshotSettings(settings);
  // Load the model while frames are being captured
  const detectorReady = detector.load();
  const frames = await captureFrames(videoId, s.count, openTabIfNeeded, onProgress);

  onProgress('Loading the text detection model…');
  await detectorReady;

  const shots = [];
  for (const [index, captured] of frames.entries()) {
    onProgress(`Finding text in frame ${index + 1}/${frames.length}…`);
    const full = await dataUrlToCanvas(captured.dataUrl);
    const frame = cropCanvas(full, contentRect(full)); // drop black bars
    const candidates = await detector.detect(frame);
    const boxes = candidates.filter(box => box.score >= s.confidence);
    const ratio = resolveRatio(s.ratio, frame);
    const crop = findLargestCrop(frame.width, frame.height, boxes, ratio, s.margin);
    if (!crop || crop.w * crop.h < (s.minArea / 100) * frame.width * frame.height) continue;
    shots.push({
      time: captured.time,
      width: crop.w,
      height: crop.h,
      ratio: ratio.join(':'),
      blob: await canvasToBlob(cropCanvas(frame, crop))
    });
  }
  return { url, createdAt: new Date().toISOString(), shots, frameCount: frames.length };
}

// Earlier versions of this extension saved screenshots in IndexedDB; remove anything left behind
export function deleteLegacyScreenshotStorage() {
  try {
    indexedDB.deleteDatabase('youtube-summarization');
  } catch (error) {
    console.warn('Could not remove old screenshot storage:', error);
  }
}

export function formatTime(t) {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function clampNum(v, lo, hi, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
