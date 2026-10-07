import { WebWorkerMLCEngineHandler } from './vendor/web-llm/web-llm.js';

// Runs the WebLLM engine off the side panel's main thread so the UI stays responsive
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message) => handler.onmessage(message);
