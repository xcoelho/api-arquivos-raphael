using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace MeuServidor.Controllers
{
    public record GenerateQuizRequest(string Materia, string Assunto);

    public record QuestaoDTO(
        string Nivel,
        string Enunciado,
        List<string> Alternativas,
        int IndiceCorreta,
        string ExplicacaoCurta,
        string ExplicacaoCompleta);

    public record QuizDTO(string Materia, string Assunto, List<QuestaoDTO> Questoes);

    [ApiController]
    [Route("[controller]")]
    public class QuizController : ControllerBase
    {
        private static readonly string[] MateriasValidas =
            { "Português", "Inglês", "Biologia", "Química", "Matemática", "História", "Geografia", "Física" };

        private static readonly HttpClient Http = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(5),
            BaseAddress = new Uri("https://integrate.api.nvidia.com/v1/")
        };

        private readonly ILogger<QuizController> _logger;

        public QuizController(ILogger<QuizController> logger)
        {
            _logger = logger;
        }

        [HttpPost("generate")]
        public async Task<IActionResult> Generate([FromBody] GenerateQuizRequest request)
        {
            var materia = (request.Materia ?? "").Trim();
            var assunto = (request.Assunto ?? "").Trim();

            if (materia.Length == 0 || assunto.Length == 0)
                return BadRequest("Informe a matéria e o assunto.");

            if (materia.Length > 100 || assunto.Length > 200)
                return BadRequest("Matéria ou assunto muito longos.");

            if (!MateriasValidas.Contains(materia, StringComparer.OrdinalIgnoreCase))
                return BadRequest("Matéria inválida.");

            var apiKey = Environment.GetEnvironmentVariable("NVIDIA_API_KEY");
            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, "Servidor sem NVIDIA_API_KEY configurada. Defina a variável de ambiente.");

            // Tenta gerar o quiz; se o JSON vier inválido, tenta novamente (até 3 tentativas).
            for (int tentativa = 1; tentativa <= 3; tentativa++)
            {
                try
                {
                    var quiz = await GerarQuizViaNvidiaAsync(apiKey, materia, assunto, tentativa);
                    if (quiz != null)
                        return Ok(quiz);
                    _logger.LogWarning("Tentativa {Tentativa}: resposta da IA não contém JSON válido.", tentativa);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Tentativa {Tentativa}: erro ao chamar a API da NVIDIA.", tentativa);
                }
            }

            return StatusCode(502, "A IA não conseguiu gerar um quiz válido agora. Tente novamente em instantes.");
        }

        private async Task<QuizDTO?> GerarQuizViaNvidiaAsync(string apiKey, string materia, string assunto, int tentativa)
        {
            string sistema =
                "Você é um elaborador de questões escolares brasileiras. Responda SEMPRE exclusivamente com um JSON válido, " +
                "sem texto antes ou depois, sem blocos de código markdown. Use a língua portuguesa do Brasil.";

            string usuario =
                $"Crie um quiz de {materia} sobre o assunto: \"{assunto}\".\n" +
                "O quiz deve ter EXATAMENTE 9 questões de múltipla escolha para alunos do ensino fundamental II e médio:\n" +
                "- As 3 primeiras: nível \"facil\"\n" +
                "- As 3 seguintes: nivel \"medio\"\n" +
                "- As 3 últimas: nível \"dificil\"\n" +
                "Cada questão deve ter EXATAMENTE 5 alternativas, com apenas 1 correta. " +
                "As alternativas erradas devem ser plausíveis e bem elaboradas (não absurdas).\n\n" +
                "Formato do JSON (responda somente isso):\n" +
                "{\n" +
                "  \"questoes\": [\n" +
                "    {\n" +
                "      \"nivel\": \"facil\" | \"medio\" | \"dificil\",\n" +
                "      \"enunciado\": \"texto da pergunta\",\n" +
                "      \"alternativas\": [\"a\", \"b\", \"c\", \"d\", \"e\"],\n" +
                "      \"indiceCorreta\": 0,\n" +
                "      \"explicacaoCurta\": \"frase curta (1-2 frases) do porquê a correta está certa — feedback imediato\",\n" +
                "      \"explicacaoCompleta\": \"explicação didática detalhada (3-6 frases), incluindo por que as principais alternativas erradas estão erradas\"\n" +
                "    }\n" +
                "  ]\n" +
                "}\n" +
                (tentativa > 1
                    ? "ATENÇÃO: na tentativa anterior o JSON veio fora do formato. Siga EXATAMENTE o esquema acima, sem textos extras.\n"
                    : "");

            var body = new Dictionary<string, object?>
            {
                ["model"] = "nvidia/nemotron-3.5-lightning-30b-a3b",
                ["messages"] = new object[]
                {
                    new Dictionary<string, string> { ["role"] = "system", ["content"] = sistema },
                    new Dictionary<string, string> { ["role"] = "user", ["content"] = usuario }
                },
                ["temperature"] = 1,
                ["top_p"] = 0.95,
                ["max_tokens"] = 16384,
                ["stream"] = true,
                ["chat_template_kwargs"] = new Dictionary<string, object?> { ["enable_thinking"] = true },
                ["reasoning_budget"] = 16384
            };

            var json = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            using var requestBody = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
            {
                Content = content
            };
            requestBody.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var response = await Http.SendAsync(requestBody, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode)
            {
                var erro = await response.Content.ReadAsStringAsync();
                _logger.LogError("NVIDIA API retornou {Status}: {Erro}", (int)response.StatusCode, Truncar(erro, 500));
                return null;
            }

            // Lê o stream SSE e concatena somente delta.content (ignora reasoning_content).
            var respostaFinal = new StringBuilder();
            await using var stream = await response.Content.ReadAsStreamAsync();
            using var reader = new StreamReader(stream);

            while (await reader.ReadLineAsync() is { } linha)
            {
                if (!linha.StartsWith("data:")) continue;
                var payload = linha.Substring(5).Trim();
                if (payload == "[DONE]") break;
                if (payload.Length == 0) continue;

                try
                {
                    using var doc = JsonDocument.Parse(payload);
                    var choices = doc.RootElement.GetProperty("choices");
                    if (choices.GetArrayLength() == 0) continue;
                    var delta = choices[0].GetProperty("delta");
                    if (delta.TryGetProperty("content", out var contentEl) && contentEl.ValueKind == JsonValueKind.String)
                        respostaFinal.Append(contentEl.GetString());
                    // delta.reasoning_content é ignorado de propósito.
                }
                catch (JsonException)
                {
                    // Chunk malformado: ignora e continua.
                }
            }

            var texto = respostaFinal.ToString();
            var questoes = ExtrairQuestoes(texto);
            if (questoes == null || questoes.Count != 9) return null;

            return new QuizDTO(materia, assunto, questoes);
        }

        private static List<QuestaoDTO>? ExtrairQuestoes(string texto)
        {
            if (string.IsNullOrWhiteSpace(texto)) return null;

            // Localiza o primeiro '{' e o último '}' para tolerar textos extras do modelo.
            var inicio = texto.IndexOf('{');
            var fim = texto.LastIndexOf('}');
            if (inicio < 0 || fim <= inicio) return null;

            try
            {
                using var doc = JsonDocument.Parse(texto.Substring(inicio, fim - inicio + 1));
                if (!doc.RootElement.TryGetProperty("questoes", out var questoesEl) ||
                    questoesEl.ValueKind != JsonValueKind.Array)
                    return null;

                var resultado = new List<QuestaoDTO>();
                foreach (var q in questoesEl.EnumerateArray())
                {
                    var nivel = q.TryGetProperty("nivel", out var n) ? n.GetString() ?? "" : "";
                    var enunciado = q.TryGetProperty("enunciado", out var e) ? e.GetString() ?? "" : "";
                    var indiceCorreta = q.TryGetProperty("indiceCorreta", out var i) && i.ValueKind == JsonValueKind.Number ? i.GetInt32() : -1;
                    var explicacaoCurta = q.TryGetProperty("explicacaoCurta", out var ec) ? ec.GetString() ?? "" : "";
                    var explicacaoCompleta = q.TryGetProperty("explicacaoCompleta", out var ecc) ? ecc.GetString() ?? "" : "";

                    var alternativas = new List<string>();
                    if (q.TryGetProperty("alternativas", out var altEl) && altEl.ValueKind == JsonValueKind.Array)
                        foreach (var a in altEl.EnumerateArray())
                            alternativas.Add(a.ValueKind == JsonValueKind.String ? a.GetString() ?? "" : a.ToString());

                    // Sanidade mínima: enunciado, 5 alternativas e índice válido.
                    if (enunciado.Length == 0 || alternativas.Count != 5 || indiceCorreta < 0 || indiceCorreta > 4)
                        return null;

                    resultado.Add(new QuestaoDTO(NormalizarNivel(nivel, resultado.Count), enunciado, alternativas,
                        indiceCorreta, explicacaoCurta, explicacaoCompleta));
                }

                return resultado;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static string NormalizarNivel(string nivel, int posicao)
        {
            var n = (nivel ?? "").Trim().ToLowerInvariant();
            if (n.StartsWith("facil")) return "facil";
            if (n.StartsWith("medio")) return "medio";
            if (n.StartsWith("dificil")) return "dificil";
            // Fallback pela posição esperada (0-2 fácil, 3-5 médio, 6-8 difícil).
            return posicao < 3 ? "facil" : posicao < 6 ? "medio" : "dificil";
        }

        private static string Truncar(string s, int max) =>
            string.IsNullOrEmpty(s) || s.Length <= max ? s : s.Substring(0, max) + "...";
    }
}
