# 🐝 QuizBee — Quiz com IA

Quiz para alunos dentro do servidor **webServerText** (ASP.NET Core). O aluno escolhe a matéria, digita o assunto e a IA (NVIDIA Nemotron) gera 9 questões: 3 fáceis, 3 médias e 3 difíceis — cada uma com 5 alternativas. Há feedback imediato a cada resposta e, no final, o resultado com explicação completa de todas as perguntas.

## Acesso

Depois de rodar o servidor, abra:

```
https://localhost:<porta>/quiz/index.html
```

## Configuração da chave da API (obrigatório)

1. Crie uma conta gratuita em **https://build.nvidia.com** e clique em **"Get API Key"**.
2. Defina a variável de ambiente `NVIDIA_API_KEY`:

**Windows (PowerShell, sessão atual):**
```powershell
$env:NVIDIA_API_KEY = "nvapi-..."
dotnet run
```

**Windows (permanente):**
```powershell
setx NVIDIA_API_KEY "nvapi-..."
```
(Feche e reabra o terminal após usar `setx`.)

**Linux/macOS:**
```bash
export NVIDIA_API_KEY="nvapi-..."
dotnet run
```

**No Render (deploy):** adicione `NVIDIA_API_KEY` em *Environment Variables* do serviço.

## Como funciona

- `POST /quiz/generate` com `{"materia": "Matemática", "assunto": "equação do segundo grau"}`
- O servidor chama `https://integrate.api.nvidia.com/v1/chat/completions` com o modelo `nvidia/nemotron-3.5-lightning-30b-a3b` (streaming SSE, `enable_thinking` ligado)
- O raciocínio interno do modelo (`reasoning_content`) é descartado; apenas a resposta final em JSON é usada
- O JSON é validado (9 questões, 5 alternativas, índice da correta válido); se vier inválido, o servidor tenta novamente (até 3 tentativas)
- A chave da API fica **somente no servidor** — o navegador nunca a vê

## Arquivos criados (nada existente foi alterado)

| Arquivo | Função |
|---|---|
| `Controllers/QuizController.cs` | Endpoint da IA + validação + retry |
| `wwwroot/quiz/index.html` | Tela inicial, quiz e resultado |
| `wwwroot/quiz/quiz.js` | Lógica do fluxo completo |
| `wwwroot/quiz/quiz.css` | Estilos |
