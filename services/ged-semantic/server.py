"""Private GED embeddings service. No document content is sent to a model API."""
import hmac
import json
import os
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from sentence_transformers import SentenceTransformer

MODEL = os.environ.get("GED_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
REVISION = os.environ.get("GED_EMBEDDING_REVISION", "e8f8c211226b894fcb81acc59f3b34ba3efd5f42")
MODEL_ID = f"{MODEL}@{REVISION}:tokens-v1"
HOST = os.environ.get("GED_SEMANTIC_HOST", "127.0.0.1")
KEY = os.environ.get("GED_SEMANTIC_API_KEY", "")
if HOST not in ("127.0.0.1", "localhost", "::1") and len(KEY) < 32:
    raise RuntimeError("Configure GED_SEMANTIC_API_KEY com pelo menos 32 caracteres.")
if len(MODEL_ID) > 200:
    raise RuntimeError("Identificador de modelo superior ao contrato do GED.")

torch.set_num_threads(max(1, int(os.environ.get("GED_SEMANTIC_THREADS", "2"))))
model = SentenceTransformer(MODEL, revision=REVISION, device="cpu", trust_remote_code=False)
model.eval()
busy = threading.Lock()


def embed(text):
    # Split by the actual model token budget, including special tokens. Character
    # slicing can silently discard most of each chunk on this 128-token model.
    tokenizer = model.tokenizer
    tokens = tokenizer.encode(text, add_special_tokens=False, truncation=False)
    budget = model.max_seq_length - tokenizer.num_special_tokens_to_add(pair=False)
    if budget < 8 or not tokens:
        raise ValueError("Texto sem tokens ou orçamento de modelo inválido.")
    overlap = min(24, budget // 4)
    chunks = []
    for start in range(0, len(tokens), budget - overlap):
        chunk = tokens[start:start + budget]
        # Some fast multilingual tokenizers create token_type_ids with a
        # different length in prepare_for_model. BERT defaults to segment zero.
        input_ids = tokenizer.build_inputs_with_special_tokens(chunk)
        chunks.append({"input_ids": input_ids, "attention_mask": [1] * len(input_ids)})
        if start + budget >= len(tokens):
            break
    vectors = []
    with torch.inference_mode():
        for index in range(0, len(chunks), 16):
            features = tokenizer.pad(chunks[index:index + 16], padding=True, return_tensors="pt")
            vectors.append(torch.nn.functional.normalize(model(dict(features))["sentence_embedding"], p=2, dim=1))
        vector = torch.cat(vectors).mean(dim=0)
        vector = torch.nn.functional.normalize(vector, p=2, dim=0)
    if not torch.isfinite(vector).all().item() or vector.norm().item() == 0:
        raise ValueError("Vetor inválido.")
    return {"model": MODEL_ID, "vector": vector.tolist()}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def send_json(self, status, value):
        body = json.dumps(value, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            self.send_json(404, {"error": "Rota não encontrada."})
            return
        self.send_json(200, {"ready": True, "model": MODEL_ID, "dimensions": model.get_sentence_embedding_dimension(), "busy": busy.locked()})

    def do_POST(self):
        if self.path != "/embed":
            self.send_json(404, {"error": "Rota não encontrada."})
            return
        if KEY and not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + KEY).encode()):
            self.send_json(401, {"error": "Credencial inválida."})
            return
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self.send_json(415, {"error": "Envie JSON."})
            return
        if not busy.acquire(blocking=False):
            self.send_json(429, {"error": "Modelo ocupado; repita a operação."})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 200000:
                self.send_json(413, {"error": "Requisição superior ao limite."})
                return
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise ValueError("Requisição incompleta.")
            data = json.loads(raw)
            text = data.get("text") if isinstance(data, dict) else None
            if not isinstance(text, str) or not text.strip() or len(text) > 30000:
                raise ValueError("Texto inválido.")
            self.send_json(200, embed(text))
        except (ValueError, KeyError, TypeError, UnicodeError, TimeoutError):
            self.send_json(422, {"error": "Texto inválido ou incompleto."})
        except Exception:
            self.send_json(503, {"error": "Modelo indisponível."})
        finally:
            busy.release()

    def log_message(self, *_):
        # Do not log document bodies, queries or credentials.
        pass


if __name__ == "__main__" and "--input" in sys.argv:
    input_path = sys.argv[sys.argv.index("--input") + 1]
    output_path = sys.argv[sys.argv.index("--output") + 1]
    with open(input_path, encoding="utf-8") as source:
        text = json.load(source)["input"]["text"]
    if not isinstance(text, str) or not text.strip() or len(text) > 30000:
        raise ValueError("Texto inválido.")
    with open(output_path, "w", encoding="utf-8") as target:
        json.dump(embed(text), target, allow_nan=False)
elif __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, int(os.environ.get("GED_SEMANTIC_PORT", "3311"))), Handler)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: threading.Thread(target=server.shutdown, daemon=True).start())
    print(json.dumps({"status": "READY", "model": MODEL_ID}), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
