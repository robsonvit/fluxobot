# FluxoBot

Um "Typebot" grátis em português: você monta a conversa arrastando blocos e o chat roda em qualquer site.
Tudo roda de graça no GitHub Pages (o seu computador não precisa ficar ligado).

- **Editor:** `https://SEU-USUARIO.github.io/SEU-REPO/`
- **Chat de um bot:** `https://SEU-USUARIO.github.io/SEU-REPO/chat.html?f=nome-do-bot`

## Usando o editor

| O quê | Como |
|---|---|
| Adicionar bloco | Clique no bloco da lateral, **arraste** para a tela ou clique com o botão direito na tela |
| Ligar blocos | **Arraste a bolinha** da direita até outro bloco. Se soltar no vazio, abre o menu para criar o próximo bloco já ligado |
| Remover ligação | Passe o mouse na linha e clique no **×** |
| Duplicar / excluir | Ícones que aparecem acima do bloco, botão direito, ou **Ctrl+D** / **Delete** |
| Selecionar vários | **Shift + arrastar** na tela (ou Shift + clique nos blocos) |
| Desfazer / refazer | **Ctrl+Z** / **Ctrl+Y** |
| Zoom | **Ctrl + roda do mouse** ou os botões no canto da tela. O botão de grade organiza os blocos sozinho |
| Salvar | **Ctrl+S** ou o botão **Salvar** (grava direto no GitHub; na primeira vez pede o token) |

No menu **⋯**: novo bot, **duplicar bot**, **excluir bot**, importar `.json` (FluxoBot ou **Typebot**),
baixar `.json`, copiar o link do chat e configurar a planilha.

## Blocos

Mensagem, Imagem, Áudio, Vídeo, Pergunta (texto, e-mail, número, telefone), Botões (cada opção leva a um caminho),
Pausa, Abrir link e Fim. Texto aceita `*negrito*`, `_itálico_`, `~riscado~` e `{{variavel}}`.
Cada bloco tem "Esperar antes" (segundos) e mostra "digitando..." durante a espera.

### Imagens, áudios e vídeos
- **Link público** (`https://...`). Links do YouTube e do Vimeo viram player.
- **📎 Enviar do PC:** o arquivo vai para a pasta `midias/` do repositório (máximo 25 MB).

## 🎨 Aparência
Modelos **Padrão** e **WhatsApp**, barra de contato (foto, nome, "online"), cores e papel de parede,
com prévia ao vivo. Cada bot tem a sua.

## Registro automático na planilha (e contador de acessos)

Não existe mais bloco "Enviar dados": **todos os bots registram sozinhos**.

- Cada bot ganha uma **aba** (com o nome do bot) e **cada visitante vira uma linha**, mesmo que não responda nada.
- Colunas: `data`, `sessao`, `origem` (utm_source ou site de origem), `caminho` (botões clicados e links abertos),
  `concluiu` e uma coluna para cada variável (respostas).
- A aba **📊 Resumo** conta `acessos` (cada pessoa que abre o chat) e `concluidos` por bot. O editor mostra esses
  números ao lado do nome do bot.
- O teste dentro do editor **não** registra nada.

### Instalar / atualizar o script
1. Na planilha: **Extensões > Apps Script**, apague o código antigo e cole o de `apps-script.gs`.
2. **Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar**
   (primeira vez: Nova implantação > App da Web, executar como **Eu**, acesso **Qualquer pessoa**).
3. O endereço (`.../exec`) fica em `config.json` (`"rastreio": true` liga o registro). Também dá para trocar em **⋯ > Planilha e acessos**.

## Importar do Typebot
No Typebot: menu do bot > **Share > Export**. No FluxoBot: **⋯ > Importar .json**. Entram textos, esperas, botões,
perguntas, imagem, áudio, vídeo, links e a aparência (inclusive a barra de contato). O que não é suportado
(condições, variáveis, integrações) é ignorado e listado no aviso.

## Publicar (GitHub Pages)
Repositório **público** > Settings > Pages > Source: **GitHub Actions**. O arquivo `.github/workflows/pages.yml`
publica o site a cada alteração.

## 📊 Análise (onde as pessoas saem)

Botão **Análise** no editor (precisa do script da planilha na **versão 3**: cole o `apps-script.gs` e implante uma nova versão).

- **Resumo:** acessos, % que concluiu, tempo médio até concluir, % que sai sem ver nada.
- **Selos em cada bloco** do fluxo: `% chegaram · % saíram aqui` (verde, laranja ou vermelho).
- **Onde mais saem**, **funil bloco a bloco** (clique para ir ao bloco), **botões mais clicados**,
  **origem** (use `?utm_source=instagram` no link) e **acessos por dia**.
- **O que melhorar:** sugestões automáticas (esperas longas, perguntas digitadas, mídias pesadas, oferta tardia, botões sem ligação).
- Os números por bloco começam a contar a partir do momento em que o chat com a trilha entra no ar.
  Na planilha, as colunas `trilha` e `ultimo_passo` guardam o caminho de cada pessoa.

## Imagens leves
Ao enviar uma imagem pelo editor (📎), fotos grandes são reduzidas sozinhas (até 1280 px, JPEG): em geral de
1 a 4 MB para ~200 KB. PNG com transparência, GIF e arquivos leves não são alterados.
Se você hospedar a imagem em outro site e colar o link, o tamanho continua o mesmo do arquivo original.
