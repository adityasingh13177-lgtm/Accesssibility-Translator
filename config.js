const env = process.env;
// Which AI back-end to use. Set LLM_PROVIDER=ollama | anthropic | openai in server/.env.
// If you do not set it: a real-looking Anthropic key means "anthropic", otherwise the free local "ollama".
const realKey = /^sk-ant-[A-Za-z0-9_-]{30,}/.test(env.ANTHROPIC_API_KEY || "");
const provider = String(env.LLM_PROVIDER || (realKey ? "anthropic" : "ollama")).toLowerCase();

export const cfg = {
  provider,
  model: env.MODEL || "claude-sonnet-5-5",            // Anthropic model name
  ollama: {                                            // used when provider is "ollama"
    url: String(env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    model: env.OLLAMA_MODEL || "qwen3.5:4b",           // best all-round fit for a 6 GB GPU (see README)
    numCtx: Number(env.OLLAMA_NUM_CTX) || 16384,       // how much text the model sees at once; lower it if it runs slowly
    keepAlive: env.OLLAMA_KEEP_ALIVE || "30m",         // keep the model in memory between requests
    timeoutMs: Number(env.OLLAMA_TIMEOUT_MS) || 240000,
  },
  extractorUrl: env.EXTRACTOR_URL || "http://127.0.0.1:8001",
  internalKey: env.INTERNAL_KEY || "change-me",
  maxFileBytes: 10 * 1024 * 1024,
  chunkChars: Number(env.CHUNK_CHARS) || (provider === "ollama" ? 8000 : 12000), // smaller pieces suit a small local model
  maxDocChars: 60000,     // hard cap per document
  minChars: 40,
  levels: ["Very Simple", "Simple", "Standard"],
  languages: ["English"],   // English only for now. Add more names here to re-enable them.
};
