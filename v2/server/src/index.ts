import { config } from './config.js';
import { createApp } from './app.js';
import { realGroqClient } from './llm/groq.js';
import { createStore } from './store/index.js';

if (!config.groqApiKey) {
  console.warn('[startup] GROQ_API_KEY is not set — LLM and transcription calls will fail.');
}

const store = createStore();
const app = createApp(store, realGroqClient);

app.listen(config.port, () => {
  console.log(`[startup] interview server listening on http://localhost:${config.port}`);
  console.log(
    `[startup] storage=${config.storageBackend} stt=${config.sttModel} fast=${config.modelFast} smart=${config.modelSmart}`,
  );
});
