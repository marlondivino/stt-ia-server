# STT-IA Server

Servidor backend assíncrono para **transcrição de áudio** (faster-whisper) e **sumarização inteligente** (Ollama LLM), construído com Nest.js e filas PostgreSQL via pg-boss.

## Arquitetura

```
Client → [POST /api/process] → Nest.js API → pg-boss Queue → Worker
                                                                 ├── faster-whisper (Python) → Transcrição
                                                                 └── Ollama (LLM) → Sumarização Executiva

Client → [GET /api/status/:jobId] → Nest.js API → pg-boss → Status + Resultado
```

**Características principais:**
- 🔒 Autenticação JWT em todos os endpoints de processamento
- 📦 Fila assíncrona com pg-boss (evita timeouts de requisição)
- 🎧 Processamento serial (`teamSize: 1`, `teamConcurrency: 1`) para não sobrecarregar hardware
- 🗑️ Cleanup automático de arquivos temporários (sucesso ou falha)
- 🔄 GPU com fallback automático para CPU

---

## Pré-requisitos

### Node.js
- **Node.js 20+** (testado com v22.22.2)
- npm 10+

### PostgreSQL
- **PostgreSQL 14+** rodando localmente ou remotamente
- Criar um database dedicado:
  ```sql
  CREATE DATABASE stt_ia;
  ```
- O pg-boss cria suas tabelas automaticamente no primeiro `start()`

### Python
- **Python 3.8+** com pip
- Instalar faster-whisper:
  ```bash
  pip install faster-whisper
  ```

### Ollama
- **Ollama** instalado e rodando ([ollama.com](https://ollama.com))
- Baixar o modelo LLM:
  ```bash
  ollama pull llama3
  ```
- Verificar que está acessível:
  ```bash
  curl http://localhost:11434/api/tags
  ```

---

## Configuração de GPU vs CPU (Whisper)

O faster-whisper suporta tanto CPU quanto GPU NVIDIA (via CUDA). A configuração é feita pelas variáveis de ambiente:

### 🖥️ GPU NVIDIA (Recomendado)

**Requisitos:**
- Placa NVIDIA com CUDA Compute Capability 7.0+ (RTX 20xx ou superior)
- [CUDA Toolkit 12.x](https://developer.nvidia.com/cuda-toolkit) instalado
- [cuDNN 8.x+](https://developer.nvidia.com/cudnn) instalado
- Driver NVIDIA atualizado

**Configuração no `.env`:**
```env
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
```

> **Performance:** GPU é ~10-20x mais rápido que CPU para transcrição. Um áudio de 30 minutos processa em ~30s com GPU vs ~10min com CPU.

### 💻 CPU Only

Se não tem GPU NVIDIA ou quer rodar sem CUDA:

```env
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

> **Nota:** O script Python inclui fallback automático — se CUDA falhar, ele tentará CPU com `int8` automaticamente.

### Modelos Disponíveis

| Modelo | Parâmetros | VRAM (GPU) | RAM (CPU) | Velocidade | Precisão |
|--------|-----------|------------|-----------|------------|----------|
| `tiny` | 39M | ~1 GB | ~1 GB | ⚡⚡⚡⚡⚡ | ⭐ |
| `base` | 74M | ~1 GB | ~1 GB | ⚡⚡⚡⚡ | ⭐⭐ |
| `small` | 244M | ~2 GB | ~2 GB | ⚡⚡⚡ | ⭐⭐⭐ |
| `medium` | 769M | ~5 GB | ~5 GB | ⚡⚡ | ⭐⭐⭐⭐ |
| `large-v3` | 1550M | ~10 GB | ~10 GB | ⚡ | ⭐⭐⭐⭐⭐ |

Configurar via:
```env
WHISPER_MODEL_SIZE=base
```

---

## Instalação

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd stt-ia-server

# 2. Instalar dependências Node.js
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações (DATABASE_URL, JWT_SECRET, etc.)

# 4. Instalar dependência Python
pip install faster-whisper
```

---

## Variáveis de Ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `PORT` | Porta do servidor HTTP | `3000` |
| `DATABASE_URL` | Connection string do PostgreSQL | — (obrigatório) |
| `JWT_SECRET` | Chave secreta para assinatura JWT | — (obrigatório) |
| `JWT_EXPIRES_IN` | Tempo de expiração do token | `24h` |
| `ADMIN_USERNAME` | Usuário para login | `admin` |
| `ADMIN_PASSWORD` | Senha para login | `admin` |
| `OLLAMA_URL` | URL base do Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo LLM para sumarização | `llama3` |
| `WHISPER_MODEL_SIZE` | Tamanho do modelo Whisper | `base` |
| `WHISPER_DEVICE` | Dispositivo de inferência (`cuda`/`cpu`) | `cuda` |
| `WHISPER_COMPUTE_TYPE` | Tipo de computação (`float16`/`int8`) | `float16` |
| `PYTHON_PATH` | Caminho para o executável Python | `python` |
| `UPLOAD_DIR` | Diretório para uploads temporários | `./uploads` |
| `MAX_FILE_SIZE_MB` | Tamanho máximo de arquivo (MB) | `50` |
| `JOB_RETENTION_DAYS` | Dias para reter jobs completados no DB | `365` |

---

## Execução

```bash
# Desenvolvimento (hot reload)
npm run dev

# Produção
npm run build
npm run start:prod
```

---

## API

### Autenticação

**POST** `/api/auth/login`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'
```

Resposta:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Enviar Áudio para Processamento

**POST** `/api/process`

```bash
curl -X POST http://localhost:3000/api/process \
  -H "Authorization: Bearer <token>" \
  -F "audio=@/path/to/audio.wav"
```

Resposta (`201 Created`):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "message": "Audio file queued for transcription and summarization."
}
```

### Consultar Status

**GET** `/api/status/:jobId`

```bash
curl http://localhost:3000/api/status/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <token>"
```

**Resposta (em processamento):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "data": { "originalName": "meeting.wav" }
}
```

**Resposta (concluído):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "createdOn": "2026-05-12T22:00:00.000Z",
  "completedOn": "2026-05-12T22:02:30.000Z",
  "data": { "originalName": "meeting.wav" },
  "result": {
    "transcription": "Texto completo da transcrição...",
    "segments": [
      { "start": 0.0, "end": 2.5, "text": "Bom dia a todos..." }
    ],
    "language": "pt",
    "summary": "## Sumário Executivo\n\n**Tema Principal:** ..."
  }
}
```

**Resposta (falhou):**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": "Transcription failed with exit code 1..."
}
```

---

## Estrutura do Projeto

```
stt-ia-server/
├── src/
│   ├── auth/                 # Módulo de autenticação JWT
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── jwt-auth.guard.ts
│   ├── queue/                # Módulo de fila (pg-boss)
│   │   ├── queue.module.ts
│   │   ├── boss.provider.ts
│   │   └── worker.service.ts
│   ├── processing/           # Módulo de processamento (API)
│   │   ├── processing.module.ts
│   │   ├── processing.controller.ts
│   │   └── processing.service.ts
│   ├── services/             # Serviços de integração
│   │   ├── transcription.service.ts
│   │   └── summarization.service.ts
│   ├── app.module.ts
│   └── main.ts
├── scripts/
│   └── transcribe.py         # Script Python faster-whisper
├── uploads/                  # Armazenamento temporário
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env.example
└── README.md
```

---

## Licença

Uso interno.
