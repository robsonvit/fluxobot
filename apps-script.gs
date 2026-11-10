// Cole este código em script.google.com (dentro de uma planilha: Extensões > Apps Script).
// Depois: Implantar > Nova implantação > App da Web
//   Executar como: Eu | Quem pode acessar: Qualquer pessoa.
// Copie a URL gerada e cole no bloco "Enviar dados" do editor.
//
// Cada bot grava na sua própria aba, com o nome do fluxo (campo "Nome do fluxo" no editor).
// A aba é criada sozinha na primeira resposta.

var COLUNAS_FIXAS = ["data", "fluxo"];

function doPost(e) {
  var dados = JSON.parse(e.postData.contents);
  var respostas = dados.respostas || {};
  var trava = LockService.getScriptLock();
  trava.waitLock(20000); // evita bagunça quando duas pessoas respondem ao mesmo tempo
  try {
    var aba = obterAba(nomeDaAba(dados.fluxo));
    var cabecalho = obterCabecalho(aba);

    Object.keys(respostas).forEach(function (chave) {
      if (cabecalho.indexOf(chave) === -1) {
        aba.getRange(1, cabecalho.length + 1).setValue(chave);
        cabecalho.push(chave);
      }
    });

    var linha = cabecalho.map(function (coluna) {
      if (coluna === "data") return dados.data;
      if (coluna === "fluxo") return dados.fluxo;
      return protegerTexto(respostas[coluna] === undefined ? "" : respostas[coluna]);
    });
    aba.appendRow(linha);
  } finally {
    trava.releaseLock();
  }
  return ContentService.createTextOutput("ok");
}

// Nome da aba: sem caracteres proibidos e com no máximo 90 letras
function nomeDaAba(nome) {
  var limpo = String(nome || "sem-nome").replace(/[\[\]\*\?:\/\\]/g, " ").trim().slice(0, 90);
  return limpo || "sem-nome";
}

function obterAba(nome) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  return planilha.getSheetByName(nome) || planilha.insertSheet(nome);
}

function obterCabecalho(aba) {
  if (aba.getLastRow() === 0) aba.appendRow(COLUNAS_FIXAS);
  return aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
}

// Impede que uma resposta começando com = + - @ vire fórmula na planilha
function protegerTexto(valor) {
  var texto = String(valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}
