/* Botão "Salvar": grava o fluxo.json direto no repositório do GitHub.
   O token fica só no navegador de quem usa (localStorage), nunca no repositório. */
(function () {
  const ARQUIVO = "fluxo.json";
  const CHAVE_TOKEN = "fluxobot:token";
  const CHAVE_FLUXO = "fluxobot:fluxo";
  const PADRAO = { dono: "robsonvit", repo: "fluxobot" };

  const status = document.getElementById("status");
  const btnSalvar = document.getElementById("btn-salvar");
  const btnCarregar = document.getElementById("btn-carregar");

  function repositorio() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const repo = location.pathname.split("/")[1];
      if (repo) return { dono: h.split(".")[0], repo };
    }
    return PADRAO;
  }

  const lerToken = () => { try { return localStorage.getItem(CHAVE_TOKEN); } catch (e) { return null; } };
  const guardarToken = (t) => { try { localStorage.setItem(CHAVE_TOKEN, t); } catch (e) { /* ignora */ } };
  const apagarToken = () => { try { localStorage.removeItem(CHAVE_TOKEN); } catch (e) { /* ignora */ } };
  const mostrar = (msg) => { status.textContent = msg; };

  function pedirToken() {
    const t = prompt(
      "Cole aqui o seu token do GitHub (só precisa fazer isso uma vez neste navegador).\n\n" +
      "Como criar: github.com/settings/personal-access-tokens/new\n" +
      "- Repository access: Only select repositories > fluxobot\n" +
      "- Permissions > Contents: Read and write"
    );
    const limpo = (t || "").trim();
    if (!limpo) return null;
    guardarToken(limpo);
    return limpo;
  }

  function paraBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let bin = "";
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  async function salvarNoGithub() {
    const token = lerToken() || pedirToken();
    if (!token) { mostrar("Salvar cancelado."); return; }

    const { dono, repo } = repositorio();
    const url = `https://api.github.com/repos/${dono}/${repo}/contents/${ARQUIVO}`;
    const cab = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };

    btnSalvar.disabled = true;
    mostrar("Salvando...");
    try {
      const atual = await fetch(url, { headers: cab });
      if (atual.status === 401 || atual.status === 403 || atual.status === 404) {
        apagarToken();
        throw new Error("O token não funcionou (inválido, vencido ou sem permissão). Clique em Salvar para colar outro.");
      }
      const sha = atual.ok ? (await atual.json()).sha : undefined;

      const conteudo = JSON.stringify(window.FluxoEditor.obter(), null, 2) + "\n";
      const resp = await fetch(url, {
        method: "PUT",
        headers: { ...cab, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "chat: atualiza fluxo pelo editor",
          content: paraBase64(conteudo),
          sha,
        }),
      });
      if (!resp.ok) throw new Error("O GitHub recusou o salvamento (código " + resp.status + ").");
      mostrar("✔ Salvo! O chat público atualiza em ~1 minuto.");
    } catch (e) {
      mostrar("✖ " + e.message);
    } finally {
      btnSalvar.disabled = false;
    }
  }

  async function buscarDoSite() {
    const resp = await fetch(ARQUIVO + "?v=" + Date.now());
    if (!resp.ok) throw new Error("não encontrei o " + ARQUIVO);
    const lido = await resp.json();
    if (!Array.isArray(lido.nodes) || !Array.isArray(lido.edges)) throw new Error("formato inválido");
    return lido;
  }

  async function carregarDoSite() {
    if (!confirm("Isso troca o que está na tela pelo fluxo publicado no site. Continuar?")) return;
    try {
      window.FluxoEditor.definir(await buscarDoSite());
      mostrar("✔ Fluxo do site carregado.");
    } catch (e) {
      mostrar("✖ Não consegui carregar: " + e.message);
    }
  }

  btnSalvar.onclick = salvarNoGithub;
  btnCarregar.onclick = carregarDoSite;

  // Navegador novo (sem rascunho local): já abre o fluxo publicado,
  // para não correr o risco de sobrescrever o fluxo real com o exemplo.
  let temRascunho = true;
  try { temRascunho = localStorage.getItem(CHAVE_FLUXO) !== null; } catch (e) { /* ignora */ }
  if (!temRascunho) {
    buscarDoSite()
      .then((f) => window.FluxoEditor.definir(f))
      .catch(() => { /* sem fluxo publicado: segue com o exemplo */ });
  }
})();
