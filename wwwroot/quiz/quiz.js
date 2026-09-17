/* ===== Quiz - Isis 2.0 — lógica do quiz ===== */
"use strict";

(() => {
  // ---------- Estado ----------
  const TOTAL_QUESTOES = 9;
  let quiz = null;          // { materia, assunto, questoes: [...] }
  let indiceAtual = 0;
  let acertos = { facil: 0, medio: 0, dificil: 0 };
  let respostas = [];       // { indiceAlternativa, acertou }
  let carregandoProxima = false;

  function nivelPorIndice(i) {
    return i < 3 ? "facil" : i < 6 ? "medio" : "dificil";
  }
  function pontosPorNivel(nivel) {
    return nivel === "facil" ? 1 : nivel === "medio" ? 2 : 3;
  }

  // ---------- Utilidades de tela ----------
  const telas = {
    config: document.getElementById("tela-config"),
    loading: document.getElementById("tela-loading"),
    quiz: document.getElementById("tela-quiz"),
    resultado: document.getElementById("tela-resultado"),
    erro: document.getElementById("tela-erro"),
  };

  function mostrarTela(nome) {
    Object.entries(telas).forEach(([chave, el]) => {
      el.classList.toggle("escondido", chave !== nome);
    });
  }

  const $ = (id) => document.getElementById(id);

  // ---------- Tema claro/escuro ----------
  const TEMA_KEY = "isis-quiz-tema";
  function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
    $("btn-tema").textContent = tema === "dark" ? "☀️" : "🌙";
    try { localStorage.setItem(TEMA_KEY, tema); } catch { /* modo privado */ }
  }
  (function initTema() {
    let salvo = null;
    try { salvo = localStorage.getItem(TEMA_KEY); } catch { /* modo privado */ }
    aplicarTema(salvo === "dark" || salvo === "light" ? salvo
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  })();
  $("btn-tema").addEventListener("click", () => {
    aplicarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  // ---------- Config (1 questão por vez + prefetch) ----------
  async function fetchQuestao(materia, assunto, nivel, evitar) {
    const resp = await fetch("/quiz/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materia, assunto, nivel, evitarEnunciados: evitar }),
    });
    if (!resp.ok) {
      const texto = await resp.text();
      throw new Error(texto || `Erro ${resp.status}`);
    }
    return await resp.json();
  }

  function evitarEnunciados() {
    return (quiz?.questoes || []).map((q) => q.enunciado).slice(-8);
  }

  // Busca a próxima questão em background enquanto o usuário responde a atual.
  async function prefetchProxima() {
    if (!quiz || carregandoProxima || quiz.questoes.length >= TOTAL_QUESTOES) return;
    carregandoProxima = true;
    try {
      const nivel = nivelPorIndice(quiz.questoes.length);
      const q = await fetchQuestao(quiz.materia, quiz.assunto, nivel, evitarEnunciados());
      quiz.questoes.push(q);
    } catch (err) {
      console.warn("Prefetch falhou, tenta de novo ao avançar:", err);
    } finally {
      carregandoProxima = false;
    }
  }
  $("form-config").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const materia = $("materia").value;
    const assunto = $("assunto").value.trim();

    const erroEl = $("erro-config");
    erroEl.classList.add("escondido");

    if (!materia || !assunto) {
      erroEl.textContent = "Selecione a matéria e digite o assunto.";
      erroEl.classList.remove("escondido");
      return;
    }

    const btn = $("btn-gerar");
    btn.disabled = true;
    btn.textContent = "Gerando…";

    try {
      // Mostra loading imediatamente (antes estava sem feedback) e busca só a 1ª questão.
      mostrarLoading(materia, assunto, 1);
      const primeira = await fetchQuestao(materia, assunto, nivelPorIndice(0), []);

      quiz = { materia, assunto, questoes: [primeira] };
      iniciarQuiz();
      prefetchProxima(); // já adianta a 2ª em background
    } catch (err) {
      console.error(err);
      mostrarTela("erro");
      $("mensagem-erro").textContent =
        "Não foi possível gerar a primeira pergunta. " +
        (err.message && err.message.length < 200 ? err.message : "Tente novamente em instantes.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Gerar quiz";
    }
  });

  // ---------- Loading ----------
  function mostrarLoading(materia, assunto, etapa) {
    $("loading-assunto").textContent = `${materia} — ${assunto}`;
    if (etapa && $("loading-status")) $("loading-status").textContent = `Gerando pergunta ${etapa} de ${TOTAL_QUESTOES}…`;
    mostrarTela("loading");
  }

  // ---------- Quiz ----------
  function iniciarQuiz() {
    indiceAtual = 0;
    acertos = { facil: 0, medio: 0, dificil: 0 };
    respostas = [];
    carregandoProxima = false;
    $("quiz-materia-assunto").textContent = `${quiz.materia} • ${quiz.assunto}`;
    mostrarTela("quiz");
    renderPergunta();
  }

  function rotuloNivel(nivel) {
    return nivel === "facil" ? "Fácil" : nivel === "medio" ? "Médio" : "Difícil";
  }

  // Selo do provedor que gerou a pergunta atual (google, nvidia ou zen).
  function rotuloProvedor(provedor) {
    return provedor === "google" ? "G Google" : provedor === "zen" ? "Z Zen" : "N NVIDIA";
  }
  function atualizarProvedor(provedor) {
    const el = $("quiz-provedor");
    if (!provedor) {
      el.classList.add("escondido");
      return;
    }
    el.classList.remove("escondido");
    el.textContent = rotuloProvedor(provedor);
    el.className = `provedor ${provedor}`;
  }

  // A IA às vezes devolve "a) texto" — remove o prefixo pois o marcador A) já é exibido.
  function limparAlternativa(t) {
    let s = (t || "").trim();
    if (!s) return s;
    s = s.replace(/^\s*alternativa\s+[A-Ea-e1-5]?\s*[:\-).\]]?\s*/i, "").trimStart();
    const sem = s.replace(/^\s*\(?\s*[A-Ea-e1-5]\s*[).:\-\]]\s*/, "").trimStart();
    return sem.length > 0 ? sem : s.trim();
  }

  function renderPergunta() {
    const q = quiz.questoes[indiceAtual];

    // Se a próxima ainda não chegou (prefetch atrasou), mostra espera curta.
    if (!q) {
      $("quiz-progresso").textContent = `Pergunta ${indiceAtual + 1} de ${TOTAL_QUESTOES}`;
      $("enunciado").textContent = "Gerando próxima pergunta… 🐝";
      $("alternativas").innerHTML = "";
      $("feedback").classList.add("escondido");
      $("btn-proxima").classList.add("escondido");
      return;
    }

    // Topo (total fixo em 9, não no que já chegou)
    $("quiz-progresso").textContent = `Pergunta ${indiceAtual + 1} de ${TOTAL_QUESTOES}`;
    $("barra-preenchida").style.width = `${(indiceAtual / TOTAL_QUESTOES) * 100}%`;
    atualizarProvedor(q.provedor);

    // Cabeçalho
    const badge = $("badge-nivel");
    badge.textContent = rotuloNivel(q.nivel);
    badge.className = `badge ${q.nivel}`;
    $("pergunta-num").textContent = `Vale ${pontosPorNivel(q.nivel)} ponto(s)`;

    // Enunciado e alternativas
    $("enunciado").textContent = q.enunciado;
    const container = $("alternativas");
    container.innerHTML = "";

    const letras = ["A", "B", "C", "D", "E"];
    q.alternativas.forEach((texto, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "alternativa";
      btn.innerHTML = `<span class="marcador">${letras[i]})</span> `;
      btn.appendChild(document.createTextNode(limparAlternativa(texto)));
      btn.addEventListener("click", () => responder(i));
      container.appendChild(btn);
    });

    // Reset de feedback
    $("feedback").classList.add("escondido");
    $("feedback-img").classList.add("escondido");
    $("btn-proxima").classList.add("escondido");
  }

  function responder(indiceEscolhido) {
    const q = quiz.questoes[indiceAtual];
    const acertou = indiceEscolhido === q.indiceCorreta;

    if (acertou) acertos[q.nivel] += 1;
    respostas.push({ indiceEscolhido, acertou });

    // Desabilita todas e marca cores
    const botoes = [...$("alternativas").children];
    botoes.forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.indiceCorreta) btn.classList.add("correta");
      else if (i === indiceEscolhido) btn.classList.add("errada");
    });

    // Feedback imediato
    const fb = $("feedback");
    fb.className = `feedback ${acertou ? "acertou" : "errou"}`;
    fb.innerHTML = acertou
      ? `<strong>✅ Você acertou!</strong>`
      : `<strong>❌ Você errou.</strong>`;
    fb.appendChild(document.createTextNode(q.explicacaoCurta));

    // Imagem de acerto/erro (só aparece após responder)
    const imgFb = $("feedback-img");
    imgFb.src = acertou ? "acertou.jpg" : "errou.jpg";
    imgFb.alt = acertou ? "Você acertou! 🎉" : "Você errou. Tente a próxima! 💪";
    imgFb.classList.remove("escondido");

    // Botão próxima / ver resultado (baseado no total, não no que já baixou)
    const btnProx = $("btn-proxima");
    btnProx.textContent =
      indiceAtual === TOTAL_QUESTOES - 1 ? "Ver resultado 🏁" : "Próxima pergunta →";
    btnProx.classList.remove("escondido");

    // Já adianta a próxima enquanto o usuário lê o feedback.
    prefetchProxima();
  }

  $("btn-proxima").addEventListener("click", async () => {
    const btn = $("btn-proxima");
    if (indiceAtual < quiz.questoes.length - 1) {
      indiceAtual += 1;
      renderPergunta();
      prefetchProxima();
      return;
    }
    if (quiz.questoes.length < TOTAL_QUESTOES) {
      // Próxima ainda gerando: aguarda (prefetch já em curso ou busca direta).
      btn.disabled = true;
      btn.textContent = "Gerando próxima… 🐝";
      try {
        if (!carregandoProxima) await prefetchProxima();
        else while (carregandoProxima) await new Promise((r) => setTimeout(r, 300));
        if (quiz.questoes.length <= indiceAtual) throw new Error("falha ao gerar");
      } catch {
        btn.disabled = false;
        btn.textContent = "Tentar de novo 🔄";
        return;
      }
      btn.disabled = false;
      indiceAtual += 1;
      renderPergunta();
      prefetchProxima();
      return;
    }
    mostrarResultado();
  });

  // ---------- Resultado ----------
  function mostrarResultado() {
    $("barra-preenchida").style.width = "100%";

    const total = TOTAL_QUESTOES;
    const pontos = acertos.facil * 1 + acertos.medio * 2 + acertos.dificil * 3;
    const pontosMax = quiz.questoes.reduce((s, q) => s + pontosPorNivel(q.nivel), 0);
    const totalAcertos = acertos.facil + acertos.medio + acertos.dificil;
    const percentual = Math.round((totalAcertos / total) * 100);

    $("nota-final").textContent = `${totalAcertos}/${total}`;
    $("nota-percentual").textContent = `${percentual}% de acertos • ${pontos}/${pontosMax} pontos`;

    let msg;
    if (percentual >= 90) msg = "🌟 Excelente! Você domina esse assunto!";
    else if (percentual >= 70) msg = "👏 Muito bem! Faltou pouco para a perfeição.";
    else if (percentual >= 50) msg = "🙂 Bom trabalho! Revise as questões erradas e tente de novo.";
    else msg = "💪 Não desanime! Leia as explicações abaixo e faça outro quiz.";
    $("mensagem-desempenho").textContent = msg;

    const niveisEl = $("desempenho-niveis");
    niveisEl.innerHTML = "";
    Object.entries(acertos).forEach(([nivel, qtd]) => {
      const chip = document.createElement("span");
      chip.className = `nivel-chip ${nivel}`;
      const totalNivel = quiz.questoes.filter((q) => q.nivel === nivel).length;
      chip.textContent = `${rotuloNivel(nivel)}: ${qtd}/${totalNivel}`;
      niveisEl.appendChild(chip);
    });

    renderRevisao();
    mostrarTela("resultado");
  }

  function renderRevisao() {
    const container = $("revisao");
    container.innerHTML = "";
    const letras = ["A", "B", "C", "D", "E"];

    quiz.questoes.forEach((q, idx) => {
      const resposta = respostas[idx];
      const item = document.createElement("article");
      item.className = "revisao-item";

      const cab = document.createElement("div");
      cab.className = "cabecalho";
      const badge = document.createElement("span");
      badge.className = `badge ${q.nivel}`;
      badge.textContent = rotuloNivel(q.nivel);
      const situacao = document.createElement("span");
      situacao.textContent = resposta.acertou ? "✅ Acertou" : "❌ Errou";
      cab.appendChild(badge);
      cab.appendChild(situacao);
      if (q.provedor) {
        const prov = document.createElement("span");
        prov.className = `provedor ${q.provedor}`;
        prov.textContent = rotuloProvedor(q.provedor);
        cab.appendChild(prov);
      }
      item.appendChild(cab);

      const h3 = document.createElement("h3");
      h3.textContent = `${idx + 1}. ${q.enunciado}`;
      item.appendChild(h3);

      q.alternativas.forEach((texto, i) => {
        const div = document.createElement("div");
        let classe = "rev-alt";
        if (i === q.indiceCorreta) classe += " correta";
        else if (resposta.indiceEscolhido === i && !resposta.acertou) classe += " escolhida-errada";
        div.className = classe;

        let marcador = `${letras[i]})`;
        if (i === resposta.indiceEscolhido) marcador += " ✍️";
        if (i === q.indiceCorreta) marcador += " ✅";
        div.innerHTML = `<span class="marcador">${marcador}</span> `;
        div.appendChild(document.createTextNode(limparAlternativa(texto)));
        item.appendChild(div);
      });

      const explic = document.createElement("div");
      explic.className = "explicacao";
      explic.innerHTML = "<strong>📖 Explicação:</strong> ";
      explic.appendChild(document.createTextNode(q.explicacaoCompleta));
      item.appendChild(explic);

      container.appendChild(item);
    });
  }

  // ---------- Navegação geral ----------
  $("btn-novo-quiz").addEventListener("click", () => {
    $("assunto").value = "";
    mostrarTela("config");
  });

  $("btn-voltar").addEventListener("click", () => {
    mostrarTela("config");
  });
})();
