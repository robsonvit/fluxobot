# FluxoBot

Um "Typebot" grátis em português: você monta a conversa arrastando blocos e o chat roda em qualquer site.

## Como usar

1. **Editor:** abra `index.html` (ou o site publicado). Arraste os blocos, edite os textos e ligue-os.
   - Para ligar: clique na bolinha da **direita** de um bloco e depois na bolinha da **esquerda** de outro.
   - Para apagar uma ligação: clique na linha.
2. **Testar:** botão **▶ Testar**.
3. **Salvar:** botão **⬇ Baixar fluxo.json** e ou, melhor, use o botão **💾 Salvar** (grava em `bots/NOME.json`).
4. **Chat público:** `https://SEU-USUARIO.github.io/SEU-REPO/chat.html`
   - Outro bot: use **+ Novo bot** no editor e abra `chat.html?f=nome-do-bot`.

## Colocar o chat no seu site

```html
<iframe src="https://SEU-USUARIO.github.io/SEU-REPO/chat.html"
        style="width:100%;max-width:420px;height:600px;border:0;border-radius:12px"></iframe>
```

## Guardar as respostas numa planilha (grátis)

1. Crie uma planilha no Google Sheets > **Extensões > Apps Script**.
2. Cole o conteúdo de `apps-script.gs`.
3. **Implantar > Nova implantação > App da Web**, acesso "Qualquer pessoa". Copie a URL.
4. No editor, cole a URL no bloco **Enviar dados** e baixe o `fluxo.json` de novo.

## Publicar de graça (GitHub Pages + Actions)

1. Crie um repositório **público** no GitHub e envie estes arquivos.
2. Em **Settings > Pages**, escolha **Source: GitHub Actions**.
3. O arquivo `.github/workflows/pages.yml` publica o site a cada alteração.

## Blocos

| Bloco | O que faz |
|---|---|
| Mensagem | O bot fala. Use `{{variavel}}` para usar respostas anteriores |
| Pergunta | Pede texto, e-mail, número ou telefone e guarda numa variável |
| Botões | Mostra opções; cada opção leva a um caminho |
| Enviar dados | Manda todas as respostas para uma URL (planilha, Zapier-like, etc.) |
| Fim | Termina a conversa |

## Ideias para depois

- Bloco de IA (Gemini/Groq, planos grátis, via Cloudflare Worker para esconder a chave)
- Bot no Telegram (grátis) usando o mesmo fluxo
- Aviso por e-mail/Telegram a cada novo lead
- Bloco de condição (se/senão)

## Importar do Typebot

1. No Typebot: menu do bot > **Share > Export** (baixa um `.json`).
2. No FluxoBot: **⬆ Importar .json**, escolha o arquivo e dê um nome ao bot novo.
3. Revise, teste e clique em **💾 Salvar**.

Entram: textos (negrito/itálico), esperas (viram "Esperar antes" de cada bloco), botões, perguntas
(texto, e-mail, número, telefone), imagem, áudio, vídeo e links. O que não é suportado
(ex.: condições, variáveis, integrações) é ignorado e aparece listado no aviso da importação.
O visual (cores, foto do perfil) não é importado.

## Imagens, áudios e vídeos

- **Link público:** cole o endereço (`https://...`). Vídeos do YouTube e Vimeo viram player.
- **Arquivo do seu PC (mais fácil):** no bloco, clique em **📎 Enviar do PC**. O arquivo vai para a pasta
  `midias/` do repositório e funciona sem depender de outro site. Limite: 25 MB por arquivo
  (para vídeos maiores, use YouTube/Vimeo).
- Texto: `*negrito*`, `_itálico_`, `~riscado~` e `{{variavel}}`.
