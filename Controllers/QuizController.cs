using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace MeuServidor.Controllers
{
    public record GenerateQuizRequest(string Materia, string Assunto);
    public record GenerateQuestionRequest(string Materia, string Assunto, string Nivel, List<string>? EvitarEnunciados);

    public record QuestaoDTO(
        string Nivel,
        string Enunciado,
        List<string> Alternativas,
        int IndiceCorreta,
        string ExplicacaoCurta,
        string ExplicacaoCompleta,
        string Provedor = "");

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

        private static readonly HttpClient GoogleHttp = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60),
            BaseAddress = new Uri("https://generativelanguage.googleapis.com/")
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

        [HttpPost("question")]
        public async Task<IActionResult> GenerateOne([FromBody] GenerateQuestionRequest request, CancellationToken ct)
        {
            var materia = (request.Materia ?? "").Trim();
            var assunto = (request.Assunto ?? "").Trim();
            var nivel = NormalizarNivel(request.Nivel ?? "", 0);

            if (materia.Length == 0 || assunto.Length == 0)
                return BadRequest("Informe a matéria e o assunto.");
            if (materia.Length > 100 || assunto.Length > 200)
                return BadRequest("Matéria ou assunto muito longos.");
            if (!MateriasValidas.Contains(materia, StringComparer.OrdinalIgnoreCase))
                return BadRequest("Matéria inválida.");

            var nvidiaKey = Environment.GetEnvironmentVariable("NVIDIA_API_KEY");
            var googleKey = Environment.GetEnvironmentVariable("GOOGLE_API_KEY")
                ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY");
            if (string.IsNullOrWhiteSpace(nvidiaKey) && string.IsNullOrWhiteSpace(googleKey))
                return StatusCode(500, "Servidor sem chave de IA configurada. Defina GOOGLE_API_KEY ou NVIDIA_API_KEY.");

            var evitar = (request.EvitarEnunciados ?? new List<string>())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Take(8)
                .Select(s => s.Length > 120 ? s.Substring(0, 120) : s)
                .ToList();

            // Principal: Google. Reserva: NVIDIA (cai para cá em 429/cota ou JSON inválido).
            if (!string.IsNullOrWhiteSpace(googleKey))
            {
                for (int tentativa = 1; tentativa <= 2; tentativa++)
                {
                    try
                    {
                        var q = await GerarUmaQuestaoViaGoogleAsync(googleKey, materia, assunto, nivel, evitar, tentativa, ct);
                        if (q != null)
                            return Ok(q);
                        _logger.LogWarning("Google tentativa {Tentativa}: questão inválida.", tentativa);
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Google tentativa {Tentativa}: erro, tentando reserva.", tentativa);
                        break; // cota/erro: vai direto para a reserva sem gastar mais cota
                    }
                }
                _logger.LogWarning("Google falhou, usando NVIDIA como reserva.");
            }

            if (!string.IsNullOrWhiteSpace(nvidiaKey))
            {
                for (int tentativa = 1; tentativa <= 2; tentativa++)
                {
                    try
                    {
                        var q = await GerarUmaQuestaoViaNvidiaAsync(nvidiaKey, materia, assunto, nivel, evitar, tentativa, ct);
                        if (q != null)
                            return Ok(q);
                        _logger.LogWarning("Tentativa {Tentativa}: 1 questão veio inválida.", tentativa);
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Tentativa {Tentativa}: erro ao gerar 1 questão.", tentativa);
                    }
                }
            }

            return StatusCode(502, "A IA não conseguiu gerar a próxima pergunta. Tente novamente.");
        }

        private static (string Sistema, string Usuario) PromptUmaQuestao(string materia, string assunto, string nivel, List<string> evitar, int tentativa)
        {
            string descricaoNivel = nivel == "facil" ? "fácil (conceito básico, recordação direta)"
                : nivel == "medio" ? "médio (interpretação e aplicação simples)"
                : "difícil (análise, pegadinhas sutis, aplicação avançada)";

            string sistema =
                "Você é um elaborador de questões escolares brasileiras. Responda SEMPRE exclusivamente com um JSON válido, " +
                "sem texto antes ou depois, sem blocos de código markdown. Use a língua portuguesa do Brasil.";

            var sb = new StringBuilder();
            sb.Append($"Crie 1 questão de {materia} sobre o assunto: \"{assunto}\".\n");
            sb.Append($"Nível: \"{nivel}\" — {descricaoNivel}. Público: ensino fundamental II e médio.\n");
            sb.Append("A questão deve ter EXATAMENTE 5 alternativas, com apenas 1 correta. Alternativas erradas plausíveis, não absurdas.\n");
            if (evitar.Count > 0)
            {
                sb.Append("Evite repetir estes temas já usados:\n");
                foreach (var e in evitar) sb.Append($"- {e}\n");
            }
            sb.Append("Formato do JSON (responda somente isso):\n");
            sb.Append("{\n");
            sb.Append($"  \"nivel\": \"{nivel}\",\n");
            sb.Append("  \"enunciado\": \"texto da pergunta\",\n");
            sb.Append("  \"alternativas\": [\"texto puro 1\", \"texto puro 2\", \"texto puro 3\", \"texto puro 4\", \"texto puro 5\"],\n");
            sb.Append("  \"indiceCorreta\": 0,\n");
            sb.Append("  \"explicacaoCurta\": \"1-2 frases do porquê a correta está certa\",\n");
            sb.Append("  \"explicacaoCompleta\": \"explicação didática (3-6 frases), incluindo por que as principais erradas estão erradas\"\n");
            sb.Append("}\n");
            sb.Append("IMPORTANTE: cada alternativa com SOMENTE o texto puro, SEM prefixo de letra ou número (não use \"a)\", \"A.\", \"1)\" etc).\n");
            if (tentativa > 1)
                sb.Append("ATENÇÃO: a tentativa anterior veio fora do formato. Siga EXATAMENTE o esquema acima.\n");

            return (sistema, sb.ToString());
        }

        private async Task<QuestaoDTO?> GerarUmaQuestaoViaGoogleAsync(string apiKey, string materia, string assunto, string nivel, List<string> evitar, int tentativa, CancellationToken ct)
        {
            var (sistema, usuario) = PromptUmaQuestao(materia, assunto, nivel, evitar, tentativa);
            var model = Environment.GetEnvironmentVariable("GOOGLE_MODEL") ?? "gemma-4-26b-a4b-it";
            // Gemma via Gemini API não aceita system_instruction nem responseMimeType (400):
            // funde a instrução no texto do usuário e valida o JSON no servidor.
            var textoUsuario = sistema + "\n\n" + usuario;

            var body = new Dictionary<string, object?>
            {
                ["contents"] = new object[] { new Dictionary<string, object?> { ["role"] = "user", ["parts"] = new object[] { new Dictionary<string, string> { ["text"] = textoUsuario } } } },
                ["generationConfig"] = new Dictionary<string, object?> { ["temperature"] = 0.8, ["topP"] = 0.95, ["maxOutputTokens"] = 1200 }
            };

            using var req = new HttpRequestMessage(HttpMethod.Post, $"v1beta/models/{model}:generateContent")
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
            };
            req.Headers.Add("x-goog-api-key", apiKey);

            using var response = await GoogleHttp.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                var erro = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("Google API retornou {Status}: {Erro}", (int)response.StatusCode, Truncar(erro, 500));
                return null;
            }

            using var docResp = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            if (!docResp.RootElement.TryGetProperty("candidates", out var cands) || cands.GetArrayLength() == 0)
                return null;
            var parts = cands[0].GetProperty("content").GetProperty("parts");
            if (parts.GetArrayLength() == 0) return null;
            var texto = parts[0].GetProperty("text").GetString() ?? "";

            var lista = ExtrairQuestoes("{\"questoes\":[" + ExtrairObjeto(texto) + "]}");
            if (lista == null || lista.Count != 1) return null;
            return lista[0] with { Nivel = nivel, Provedor = "google" };
        }

        private async Task<QuestaoDTO?> GerarUmaQuestaoViaNvidiaAsync(string apiKey, string materia, string assunto, string nivel, List<string> evitar, int tentativa, CancellationToken ct)
        {
            var (sistema, usuario) = PromptUmaQuestao(materia, assunto, nivel, evitar, tentativa);

            var body = new Dictionary<string, object?>
            {
                ["model"] = "nvidia/nemotron-3.5-lightning-30b-a3b",
                ["messages"] = new object[]
                {
                    new Dictionary<string, string> { ["role"] = "system", ["content"] = sistema },
                    new Dictionary<string, string> { ["role"] = "user", ["content"] = usuario }
                },
                ["temperature"] = 0.8,
                ["top_p"] = 0.95,
                ["max_tokens"] = 1200,
                ["stream"] = false,
                ["chat_template_kwargs"] = new Dictionary<string, object?> { ["enable_thinking"] = false }
            };

            var json = JsonSerializer.Serialize(body);
            using var req = new HttpRequestMessage(HttpMethod.Post, "chat/completions")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var response = await Http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                var erro = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("NVIDIA API retornou {Status}: {Erro}", (int)response.StatusCode, Truncar(erro, 500));
                return null;
            }

            using var docResp = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            if (!docResp.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
                return null;
            var msg = choices[0].GetProperty("message");
            if (!msg.TryGetProperty("content", out var contentEl) || contentEl.ValueKind != JsonValueKind.String)
                return null;

            var lista = ExtrairQuestoes("{\"questoes\":[" + ExtrairObjeto(contentEl.GetString() ?? "") + "]}");
            if (lista == null || lista.Count != 1) return null;

            var q = lista[0];
            return q with { Nivel = nivel, Provedor = "nvidia" };
        }

        private static string ExtrairObjeto(string texto)
        {
            if (string.IsNullOrWhiteSpace(texto)) return "";
            var inicio = texto.IndexOf('{');
            var fim = texto.LastIndexOf('}');
            return inicio < 0 || fim <= inicio ? "" : texto.Substring(inicio, fim - inicio + 1);
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
                "      \"alternativas\": [\"texto puro 1\", \"texto puro 2\", \"texto puro 3\", \"texto puro 4\", \"texto puro 5\"],\n" +
                "      // IMPORTANTE: cada alternativa SOMENTE o texto puro, SEM prefixo de letra/número (não use \"a)\", \"A.\", \"1)\" etc).\n" +
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
                ["max_tokens"] = 8192,
                ["stream"] = true,
                // Thinking desligado para resposta rápida (evita timeout do Render gratuito).
                ["chat_template_kwargs"] = new Dictionary<string, object?> { ["enable_thinking"] = false }
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
                            alternativas.Add(LimparAlternativa(a.ValueKind == JsonValueKind.String ? a.GetString() ?? "" : a.ToString()));

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

        private static string LimparAlternativa(string s)
        {
            var t = (s ?? "").Trim();
            if (t.Length == 0) return t;
            // "Alternativa A: texto" -> remove o prefixo.
            t = System.Text.RegularExpressions.Regex.Replace(t, @"^\s*alternativa\s+[A-Ea-e1-5]?\s*[:\-\)\.\]]?\s*", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).TrimStart();
            // "a) texto", "(A) texto", "A. texto", "1) texto" -> remove a letra/número inicial.
            var semLetra = System.Text.RegularExpressions.Regex.Replace(t, @"^\(?\s*[A-Ea-e1-5]\s*[\)\.\:\-\]]\s*", "").TrimStart();
            return semLetra.Length > 0 ? semLetra : t;
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
