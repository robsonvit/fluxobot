// FluxoBot - registro automático na planilha (versão 2)
//
// COMO INSTALAR (ou atualizar):
//   1. Abra a sua planilha > Extensões > Apps Script.
//   2. Apague o código antigo, cole este e clique em Salvar.
//   3. Implantar > Gerenciar implantações > lápis (editar) > Versão: "Nova versão" > Implantar.
//      (Na primeira vez: Implantar > Nova implantação > App da Web,
//       Executar como: Eu | Quem pode acessar: Qualquer pessoa.)
//
// O QUE ELE FAZ:
//   - Cada bot ganha uma aba (com o nome do bot) e cada visitante vira UMA linha,
//     mesmo que não responda nada. A linha é atualizada a cada resposta/escolha.
//   - Colunas: data, sessao, origem, caminho (botões clicados), concluiu e uma por variável.
//   - A aba "📊 Resumo" conta os acessos e as conversas concluídas de cada bot.

var VERSAO = 2;
var ABA_RESUMO = "📊 Resumo";
var COLUNAS_FIXAS = ["data", "sessao", "origem", "caminho", "concluiu"];

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.evento === "teste") return resposta("ok");
  if (!d.sessao) d.sessao = Utilities.getUuid(); // formato antigo (versão 1)
  var evento = d.evento || "completo";

  var trava = LockService.getScriptLock();
  trava.waitLock(30000); // evita bagunça quando várias pessoas entram juntas
  try {
    var aba = obterAba(nomeDaAba(d.fluxo));
    var cabecalho = obterCabecalho(aba);
    garantirColunas(aba, cabecalho, COLUNAS_FIXAS.concat(Object.keys(d.respostas || {})));

    var linha = acharLinha(aba, cabecalho, d.sessao);
    var jaConcluiu = linha ? lerCelula(aba, cabecalho, linha, "concluiu") === "sim" : false;

    if (evento === "inicio") {
      if (!linha) { gravar(aba, cabecalho, 0, d, false); contar(d.fluxo, 2); }
    } else {
      var concluiu = evento === "fim" || evento === "completo";
      gravar(aba, cabecalho, linha, d, concluiu);
      if (!linha && evento !== "inicio") contar(d.fluxo, 2); // chegou sem "inicio": conta o acesso
      if (concluiu && !jaConcluiu) contar(d.fluxo, 3);
    }
  } finally {
    trava.releaseLock();
  }
  return resposta("ok");
}

// Leitura pública das estatísticas (usada pelo editor para mostrar o contador)
function doGet(e) {
  var acao = e && e.parameter ? e.parameter.acao : "";
  if (acao === "versao") return json({ versao: VERSAO });
  if (acao === "estatisticas") return json({ versao: VERSAO, bots: lerResumo() });
  return resposta("FluxoBot ativo (versão " + VERSAO + ")");
}

/* ---------- Abas e colunas ---------- */
function nomeDaAba(nome) {
  var limpo = String(nome || "sem-nome").replace(/[\[\]\*\?:\/\\]/g, " ").trim().slice(0, 90);
  return limpo || "sem-nome";
}

function obterAba(nome) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  return planilha.getSheetByName(nome) || planilha.insertSheet(nome);
}

function obterCabecalho(aba) {
  if (aba.getLastRow() === 0 || aba.getLastColumn() === 0) aba.appendRow(COLUNAS_FIXAS);
  return aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
}

function garantirColunas(aba, cabecalho, colunas) {
  colunas.forEach(function (c) {
    if (cabecalho.indexOf(c) === -1) {
      aba.getRange(1, cabecalho.length + 1).setValue(c);
      cabecalho.push(c);
    }
  });
}

/* ---------- Linhas por visitante ---------- */
function acharLinha(aba, cabecalho, sessao) {
  var coluna = cabecalho.indexOf("sessao") + 1;
  if (aba.getLastRow() < 2 || coluna < 1) return 0;
  var achado = aba.getRange(2, coluna, aba.getLastRow() - 1, 1).createTextFinder(String(sessao)).matchEntireCell(true).findNext();
  return achado ? achado.getRow() : 0;
}

function lerCelula(aba, cabecalho, linha, coluna) {
  var i = cabecalho.indexOf(coluna);
  return i === -1 ? "" : String(aba.getRange(linha, i + 1).getValue());
}

function gravar(aba, cabecalho, linha, d, concluiu) {
  var antigo = linha ? aba.getRange(linha, 1, 1, cabecalho.length).getValues()[0] : [];
  var respostas = d.respostas || {};
  var valores = cabecalho.map(function (coluna, i) {
    var anterior = linha ? antigo[i] : "";
    if (coluna === "data") return linha ? anterior : d.data;
    if (coluna === "sessao") return d.sessao;
    if (coluna === "origem") return linha ? anterior : (d.origem || "");
    // eventos podem chegar fora de ordem: fica sempre o caminho mais completo (o mais longo)
    if (coluna === "caminho") return d.caminho && String(d.caminho).length >= String(anterior || "").length ? d.caminho : anterior;
    if (coluna === "concluiu") return concluiu ? "sim" : (anterior || "não");
    return respostas[coluna] !== undefined ? protegerTexto(respostas[coluna]) : anterior;
  });
  if (linha) aba.getRange(linha, 1, 1, cabecalho.length).setValues([valores]);
  else aba.appendRow(valores);
}

// Impede que uma resposta começando com = + - @ vire fórmula na planilha
function protegerTexto(valor) {
  var texto = String(valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

/* ---------- Resumo / contador ---------- */
function abaResumo() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(ABA_RESUMO);
  if (!aba) {
    aba = planilha.insertSheet(ABA_RESUMO, 0);
    aba.appendRow(["bot", "acessos", "concluidos", "ultimo_acesso"]);
    aba.setFrozenRows(1);
  }
  return aba;
}

// coluna: 2 = acessos, 3 = concluídos
function contar(bot, coluna) {
  var aba = abaResumo();
  var nome = nomeDaAba(bot);
  var achado = aba.getLastRow() > 1
    ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).createTextFinder(nome).matchEntireCell(true).findNext()
    : null;
  var linha = achado ? achado.getRow() : 0;
  if (!linha) { aba.appendRow([nome, 0, 0, ""]); linha = aba.getLastRow(); }
  var celula = aba.getRange(linha, coluna);
  celula.setValue((Number(celula.getValue()) || 0) + 1);
  if (coluna === 2) aba.getRange(linha, 4).setValue(new Date());
}

function lerResumo() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_RESUMO);
  var bots = {};
  if (!aba || aba.getLastRow() < 2) return bots;
  aba.getRange(2, 1, aba.getLastRow() - 1, 4).getValues().forEach(function (l) {
    bots[l[0]] = { acessos: Number(l[1]) || 0, concluidos: Number(l[2]) || 0, ultimo: l[3] ? new Date(l[3]).toISOString() : "" };
  });
  return bots;
}

/* ---------- Respostas ---------- */
function resposta(texto) {
  return ContentService.createTextOutput(texto);
}

function json(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
