/* ===== QuizBee — lógica do quiz ===== */
"use strict";

(() => {
  // ---------- Estado ----------
  let quiz = null;          // { materia, assunto, questoes: [...] }
  let indiceAtual = 0;
  let acertos = { facil: 0, medio: 0, dificil: 0 };
  let respostas = [];       // { indiceAlternativa, acertou }

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

  // ---------- Config ----------
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
      const resp = await fetch("/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materia, assunto }),
      });

      if (!resp.ok) {
        const texto = await resp.text();
        throw new Error(texto || `Erro ${resp.status}`);
      }

      quiz = await resp.json();
      iniciarQuiz();
    } catch (err) {
      console.error(err);
      mostrarTela("erro");
      $("mensagem-erro").textContent =
        "Não foi possível gerar o quiz. " +
        (err.message && err.message.length < 200 ? err.message : "Tente novamente em instantes.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Gerar quiz";
    }
  });

  // ---------- Loading ----------
  function mostrarLoading(materia, assunto) {
    $("loading-assunto").textContent = `${materia} — ${assunto}`;
    mostrarTela("loading");
  }

  // ---------- Quiz ----------
  function iniciarQuiz() {
    indiceAtual = 0;
    acertos = { facil: 0, medio: 0, dificil: 0 };
    respostas = [];
    $("quiz-materia-assunto").textContent = `${quiz.materia} • ${quiz.assunto}`;
    mostrarTela("quiz");
    renderPergunta();
  }

  function rotuloNivel(nivel) {
    return nivel === "facil" ? "Fácil" : nivel === "medio" ? "Médio" : "Difícil";
  }

  function renderPergunta() {
    const q = quiz.questoes[indiceAtual];

    // Topo
    $("quiz-progresso").textContent = `Pergunta ${indiceAtual + 1} de ${quiz.questoes.length}`;
    $("barra-preenchida").style.width = `${(indiceAtual / quiz.questoes.length) * 100}%`;

    // Cabeçalho
    const badge = $("badge-nivel");
    badge.textContent = rotuloNivel(q.nivel);
    badge.className = `badge ${q.nivel}`;
    $("pergunta-num").textContent = `Vale ${q.nivel === "facil" ? "1" : q.nivel === "medio" ? "2" : "3"} ponto(s)`;

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
      btn.appendChild(document.createTextNode(texto));
      btn.addEventListener("click", () => responder(i));
      container.appendChild(btn);
    });

    // Reset de feedback
    $("feedback").classList.add("escondido");
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

    // Botão próxima / ver resultado
    const btnProx = $("btn-proxima");
    btnProx.textContent =
      indiceAtual === quiz.questoes.length - 1 ? "Ver resultado 🏁" : "Próxima pergunta →";
    btnProx.classList.remove("escondido");
  }

  $("btn-proxima").addEventListener("click", () => {
    if (indiceAtual < quiz.questoes.length - 1) {
      indiceAtual += 1;
      renderPergunta();
    } else {
      mostrarResultado();
    }
  });

  // ---------- Resultado ----------
  function mostrarResultado() {
    $("barra-preenchida").style.width = "100%";

    const total = quiz.questoes.length;
    const pontos = acertos.facil * 1 + acertos.medio * 2 + acertos.dificil * 3;
    const pontosMax = 3 * 1 + 3 * 2 + 3 * 3; // 18
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
      chip.textContent = `${rotuloNivel(nivel)}: ${qtd}/3`;
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
        div.appendChild(document.createTextNode(texto));
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
