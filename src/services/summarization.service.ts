import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SummarizationService {
  private readonly logger = new Logger(SummarizationService.name);
  private readonly ollamaUrl: string;
  private readonly ollamaModel: string;

  constructor(private readonly configService: ConfigService) {
    this.ollamaUrl = this.configService.get<string>(
      'OLLAMA_URL',
      'http://localhost:11434',
    );
    this.ollamaModel = this.configService.get<string>(
      'OLLAMA_MODEL',
      'llama3',
    );
  }

  async summarize(transcriptionText: string): Promise<string> {
    const prompt = this.buildPrompt(transcriptionText);

    this.logger.debug(
      `Calling Ollama (${this.ollamaModel}) at ${this.ollamaUrl}/api/generate`,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 120s timeout

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '(unreadable)');
        throw new Error(
          `Ollama API returned HTTP ${response.status}: ${errorBody}`,
        );
      }

      const data = (await response.json()) as { response?: string };

      if (!data.response) {
        throw new Error(
          'Ollama API returned empty response. Verify the model is loaded.',
        );
      }

      return data.response.trim();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Ollama request timed out after 120s. The transcript may be too long for the model context.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(transcriptionText: string): string {
    return `Você é um assistente especializado em criar sumários executivos.

Analise a transcrição de áudio abaixo e gere um sumário executivo conciso e bem estruturado.

O sumário deve conter:
1. **Tema Principal**: O assunto central da conversa/reunião.
2. **Pontos-Chave**: Os principais tópicos discutidos, em bullets.
3. **Decisões Tomadas**: Quaisquer decisões ou acordos mencionados.
4. **Ações Pendentes (Action Items)**: Tarefas ou próximos passos definidos, com responsáveis quando identificáveis.
5. **Conclusão**: Um parágrafo breve resumindo o contexto geral.

Responda em português do Brasil. Seja objetivo e profissional.

---

**Transcrição:**

${transcriptionText}

---

**Sumário Executivo:**`;
  }
}
