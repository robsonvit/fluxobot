// Cole este código em script.google.com (dentro de uma planilha: Extensões > Apps Script).
// Depois: Implantar > Nova implantação > App da Web > Acesso: "Qualquer pessoa".
// Copie a URL gerada e cole no bloco "Enviar dados" do editor.

function doPost(e) {
  var dados = JSON.parse(e.postData.contents);
  var planilha = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var respostas = dados.respostas || {};

  if (planilha.getLastRow() === 0) planilha.appendRow(["data", "fluxo"]);

  var cabecalho = planilha.getRange(1, 1, 1, planilha.getLastColumn()).getValues()[0];
  Object.keys(respostas).forEach(function (chave) {
    if (cabecalho.indexOf(chave) === -1) {
      planilha.getRange(1, cabecalho.length + 1).setValue(chave);
      cabecalho.push(chave);
    }
  });

  var linha = cabecalho.map(function (coluna) {
    if (coluna === "data") return dados.data;
    if (coluna === "fluxo") return dados.fluxo;
    return respostas[coluna] === undefined ? "" : respostas[coluna];
  });
  planilha.appendRow(linha);

  return ContentService.createTextOutput("ok");
}
