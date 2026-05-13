<p align="center">
  <img src="stt_ia_banner.png" width="100%" alt="STT-IA Banner" />
</p>

<h1 align="center">🎙️ STT-IA Server</h1>

<p align="center">
  <strong>Audio transcription (faster-whisper) and summarization (Ollama) server built with NestJS and pg-boss.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white" alt="Ollama" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

<hr />

## 📖 Overview

**STT-IA Server** processes audio files asynchronously to generate transcriptions and summaries. It uses `faster-whisper` for speech-to-text and `Ollama` for generating executive summaries from the transcribed text.

The system uses `pg-boss` to manage a job queue in PostgreSQL, allowing for serial processing of audio files to manage hardware resources.

---

## 🧠 Key Features

- ⚡ **Asynchronous Queue**: Background processing using `pg-boss` and PostgreSQL.
- 🎙️ **Transcription**: Audio processing via `faster-whisper` (GPU and CPU support).
- 📝 **Summarization**: Generation of meeting notes and action items via `Ollama`.
- 🔄 **Hardware Fallback**: Automatic CUDA to CPU failover if GPU libraries are missing.
- 🔒 **Security**: JWT authentication for all processing endpoints.
- 🛠️ **Dev Tools**: Automatic port cleanup and Swagger documentation.

---

## 🏗️ Architecture

The system follows a decoupled worker pattern to maximize throughput and stability.

```mermaid
graph TD
    A[Client] -->|POST /api/process| B[NestJS Gateway]
    B -->|JWT Validation| C{Authorized?}
    C -->|Yes| D[Multer Storage]
    D -->|Enqueue Job| E[(PostgreSQL / pg-boss)]
    E -->|Dequeue| F[Worker Service]
    F -->|Spawn Child Process| G[Python faster-whisper]
    G -->|JSON Result| F
    F -->|HTTP Request| H[Ollama LLM]
    H -->|Summary| F
    F -->|Update Status| E
    B -->|GET /api/status| E
```

---

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com/) (TypeScript)
- **Queue System**: [pg-boss](https://github.com/timgit/pg-boss) (PostgreSQL Job Queue)
- **Inference Core**: [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- **LLM Engine**: [Ollama](https://ollama.com/)
- **Documentation**: [Swagger / OpenAPI](https://swagger.io/)

---

## 🚀 Getting Started

### 📋 Prerequisites

- **Node.js**: `v20.0.0` or higher
- **PostgreSQL**: `v14.0.0` or higher
- **Python**: `v3.8.0` or higher
- **Ollama**: Running locally with `llama3` model

### ⚙️ Installation

1. **Clone and Install**:

   ```bash
   git clone <repo-url>
   cd stt-ia-server
   npm install
   ```

2. **Configure Environment**:

   ```bash
   cp .env.example .env
   # Set your DATABASE_URL and JWT_SECRET
   ```

3. **Install Inference Engines**:
   ```bash
   pip install faster-whisper
   ollama pull llama3
   ```

### 🏃 Running the Project

```bash
# Development Mode
npm run dev

# Debug Mode (VS Code)
# Just press F5 - Port conflicts will be handled automatically!
```

---

## 💡 Important Notes

> [!IMPORTANT]
> **GPU Support**: To use NVIDIA acceleration, ensure you have the correct CUDA Toolkit and cuDNN libraries installed. If not found, the system will automatically fallback to CPU mode.

> [!TIP]
> **Language Forcing**: If your audio is predominantly in one language (e.g., Portuguese), set `WHISPER_LANGUAGE=pt` in your `.env` to significantly improve transcription accuracy and speed.

---

## 📄 Documentation

Access the interactive API explorer at:
👉 **`http://localhost:3000/docs`**

---

<p align="center">
  Made with ❤️ by the STT-IA Team
</p>
