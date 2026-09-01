# Datilografia — leituras legíveis

Um app simples e gratuito que:

1. Recebe uma foto ou PDF escaneado de um texto datilografado (ou qualquer texto escaneado);
2. Reconhece o texto (OCR) **direto no navegador**, sem enviar nada para nenhum servidor;
3. Deixa revisar/corrigir o texto reconhecido;
4. Gera um PDF novo, na fonte e no tamanho que você escolher.

Não tem backend, não tem banco de dados, não tem chave de API, não tem custo nenhum.
É só HTML + CSS + JavaScript, usando três bibliotecas gratuitas via CDN:

- [Tesseract.js](https://github.com/naptha/tesseract.js) — faz o OCR (reconhecimento de texto), com suporte a português.
- [pdf.js](https://mozilla.github.io/pdf.js/) — lê o PDF de entrada e transforma cada página em imagem.
- [jsPDF](https://github.com/parallax/jsPDF) — gera o PDF final.

## Como usar (para quem só quer usar, sem mexer em código)

Depois de publicado (veja abaixo), é só abrir o link, arrastar a foto ou o PDF,
esperar o reconhecimento terminar, revisar o texto, escolher a fonte/tamanho e
clicar em "Gerar PDF final". O download começa automaticamente.

O reconhecimento de texto de máquina de escrever escaneada nunca fica 100%
perfeito — por isso existe a etapa de revisão antes de gerar o PDF.

## Como publicar de graça no GitHub Pages

1. Crie um repositório novo no GitHub (pode ser público) e suba estes 4 arquivos
   (`index.html`, `styles.css`, `app.js`, `README.md`) para a raiz dele.
   - Pela interface do GitHub: **Add file → Upload files**, arraste os 4 arquivos, e
     clique em **Commit changes**.
2. No repositório, vá em **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha `main` (ou `master`) e a pasta `/ (root)`. Clique em **Save**.
5. Espere um ou dois minutos. O GitHub mostra o link do site no topo dessa mesma
   página (algo como `https://seu-usuario.github.io/nome-do-repositorio/`).

Pronto — esse link funciona para sempre, de graça, e pode ser aberto do celular
também.

## Rodando localmente (opcional)

Não precisa de instalação nem de `npm`. Basta abrir o `index.html` num navegador,
ou, se preferir servir por http (recomendado por causa de alguns navegadores
serem mais restritivos com `file://`), rodar por exemplo:

```bash
python3 -m http.server 8000
```

e abrir `http://localhost:8000`.

## Privacidade

Todo o processamento — leitura do PDF/foto, OCR e geração do PDF final —
acontece no navegador da própria pessoa que está usando o site. Nenhum arquivo
é enviado para nenhum servidor (nem para o GitHub, nem para nenhuma API).

## Possíveis ajustes

- **Outro idioma de OCR**: troque `'por'` por `'eng'`, `'por+eng'` etc. na linha
  `Tesseract.createWorker('por', ...)` dentro de `app.js`.
- **Tamanho de página do PDF final**: hoje é A4 (`format: 'a4'` em `app.js`);
  dá para trocar por `'letter'`, por exemplo.
- **Outras fontes**: o jsPDF, sem carregar fontes extras, só tem embutidas
  Times, Helvetica e Courier — por isso essas são as três opções oferecidas.
  Dá para embutir uma fonte customizada (ex: uma fonte que imite máquina de
  escrever) seguindo o guia oficial do jsPDF sobre fontes customizadas, se um
  dia quiser ir além dessas três.
