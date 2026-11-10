/* Peças de interface compartilhadas: ícones, avisos (toast), menus e janelas de diálogo. */
(function (global) {
  const CAMINHOS = {
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    mensagem: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4z"/>',
    pergunta: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    botoes: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/>',
    espera: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    fim: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    lixeira: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    desfazer: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    refazer: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
    paleta: '<circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 22a3 3 0 0 1 0-6h1a2 2 0 0 0 0-4"/>',
    salvar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    mais: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    mais1: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    menos: '<path d="M5 12h14"/>',
    ajustar: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    organizar: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    tabela: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    testar: '<path d="M5 3l14 9-14 9V3z"/>',
    reiniciar: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><circle cx="8.5" cy="14" r="1"/><circle cx="15.5" cy="14" r="1"/>',
    novo: '<path d="M12 5v14M5 12h14"/>',
  };

  function icone(nome, tamanho) {
    const t = tamanho || 18;
    return `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAMINHOS[nome] || ""}</svg>`;
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  /* ---------- Avisos ---------- */
  function toast(mensagem, tipo) {
    const area = document.getElementById("toasts");
    if (!area) return;
    const t = el("div", "toast " + (tipo || "info"));
    t.textContent = mensagem;
    area.append(t);
    setTimeout(() => t.classList.add("sai"), 4200);
    setTimeout(() => t.remove(), 4600);
  }

  /* ---------- Menu flutuante ---------- */
  let menuAtual = null;
  function fecharMenu() {
    if (menuAtual) { menuAtual.remove(); menuAtual = null; }
  }

  function menu(x, y, itens) {
    fecharMenu();
    const m = el("div", "menu-flutuante");
    itens.forEach((item) => {
      if (item === "-") { m.append(el("div", "menu-sep")); return; }
      if (item.titulo) { m.append(el("div", "menu-titulo", item.titulo)); return; }
      const b = el("button", item.perigo ? "perigo" : "");
      b.type = "button";
      if (item.cor) b.style.setProperty("--cor-no", item.cor);
      b.insertAdjacentHTML("beforeend", item.icone ? `<span class="menu-icone">${icone(item.icone, 16)}</span>` : "");
      b.append(el("span", "", item.rotulo));
      if (item.atalho) b.append(el("kbd", "", item.atalho));
      b.onclick = () => { fecharMenu(); item.acao(); };
      m.append(b);
    });
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, global.innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y, global.innerHeight - r.height - 8)) + "px";
    menuAtual = m;
  }

  document.addEventListener("mousedown", (e) => { if (menuAtual && !menuAtual.contains(e.target)) fecharMenu(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharMenu(); });

  /* ---------- Diálogos ---------- */
  function abrirDialogo(montar) {
    return new Promise((resolve) => {
      const d = el("dialog", "dlg");
      let resultado = null;
      const fechar = (valor) => { resultado = valor; d.close(); };
      montar(d, fechar);
      d.addEventListener("close", () => { d.remove(); resolve(resultado); });
      d.addEventListener("mousedown", (e) => { if (e.target === d) fechar(null); });
      document.body.append(d);
      d.showModal();
    });
  }

  function botoesDoDialogo(fechar, rotuloOk, perigo) {
    const linha = el("div", "dlg-acoes");
    const cancelar = el("button", "sec", "Cancelar");
    cancelar.type = "button";
    cancelar.onclick = () => fechar(null);
    const ok = el("button", perigo ? "perigo" : "prim", rotuloOk || "OK");
    ok.type = "submit";
    linha.append(cancelar, ok);
    return linha;
  }

  /* opcoes: titulo, descricao, rotulo, valor, tipo, placeholder, botao, ajuda (HTML fixo do programa) */
  function pedirTexto(o) {
    return abrirDialogo((d, fechar) => {
      const f = el("form", "dlg-form");
      f.append(el("h2", "", o.titulo));
      if (o.descricao) f.append(el("p", "dlg-desc", o.descricao));
      const rotulo = el("label", "dlg-campo");
      rotulo.append(el("span", "", o.rotulo || ""));
      const entrada = el("input");
      entrada.type = o.tipo || "text";
      entrada.value = o.valor || "";
      entrada.placeholder = o.placeholder || "";
      entrada.autocomplete = "off";
      entrada.spellcheck = false;
      rotulo.append(entrada);
      f.append(rotulo);
      if (o.ajuda) { const a = el("div", "dlg-ajuda"); a.innerHTML = o.ajuda; f.append(a); }
      f.append(botoesDoDialogo(fechar, o.botao));
      f.onsubmit = (ev) => { ev.preventDefault(); fechar(entrada.value.trim()); };
      d.append(f);
      setTimeout(() => entrada.focus(), 0);
    });
  }

  function confirmar(o) {
    return abrirDialogo((d, fechar) => {
      const f = el("form", "dlg-form");
      f.append(el("h2", "", o.titulo));
      if (o.texto) f.append(el("p", "dlg-desc", o.texto));
      f.append(botoesDoDialogo(fechar, o.botao || "Confirmar", o.perigo));
      f.onsubmit = (ev) => { ev.preventDefault(); fechar(true); };
      d.append(f);
    }).then((r) => r === true);
  }

  global.UI = { icone, el, toast, menu, fecharMenu, pedirTexto, confirmar };
})(window);
