# Retype — leituras escaneadas em texto legível

App simples e gratuito que:

1. Recebe uma foto ou PDF escaneado de um texto datilografado (ou qualquer texto escaneado);
2. Reconhece o texto (OCR) **direto no navegador**, sem enviar nada para nenhum servidor;
3. Reconstrói parágrafos e quebras de linha a partir da posição real de cada linha na página — em vez de jogar tudo num bloco só;
4. Deixa revisar/corrigir o texto reconhecido;
5. Gera um PDF novo, na fonte e no tamanho que você escolher.

Sem backend, sem banco de dados, sem chave de API, sem custo. Só HTML + CSS +
JavaScript, com três bibliotecas gratuitas via CDN:

- [Tesseract.js](https://github.com/naptha/tesseract.js) — OCR, com suporte a português.
- [pdf.js](https://mozilla.github.io/pdf.js/) — lê o PDF de entrada e transforma cada página em imagem.
- [jsPDF](https://github.com/parallax/jsPDF) — gera o PDF final.

## O que foi melhorado na leitura da imagem

- **Pré-processamento**: antes do OCR, cada página é convertida para escala
  de cinza e tem o contraste esticado (e é ampliada se estiver em resolução
  baixa) — isso ajuda bastante em scans antigos e fotos de celular.
- **Modo de segmentação fixo em "bloco único"**, mais estável que o modo
  automático para páginas de texto corrido de coluna única, que é o caso
  típico de leitura de faculdade.
- **Reconstrução por linha**: em vez de usar o texto bruto do Tesseract, o
  app olha a posição de cada linha reconhecida na página e decide, pela
  distância vertical entre elas, onde é quebra de parágrafo e onde é só a
  continuação de uma frase. Por isso agora os parágrafos saem no lugar
  certo, em vez de tudo virar um bloco só.
- **Opção de preservar quebras de linha exatas**: para poemas, citações ou
  listas, dá para marcar a caixa "preservar quebras de linha exatas do
  original" na etapa de revisão, que desliga a reconstrução por parágrafo.

Mesmo assim, o reconhecimento de máquina de escrever nunca é 100% perfeito —
por isso a etapa de revisão antes de gerar o PDF continua existindo.

## Como publicar de graça no GitHub Pages

1. Crie um repositório novo no GitHub e suba estes arquivos
   (`index.html`, `styles.css`, `app.js`, `README.md`) para a raiz dele.
   - Pela interface do GitHub: **Add file → Upload files**, arraste os arquivos, e
     clique em **Commit changes**.
2. No repositório, vá em **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha `main` (ou `master`) e a pasta `/ (root)`. Clique em **Save**.
5. Espere um ou dois minutos. O link do site aparece no topo dessa mesma
   página (algo como `https://seu-usuario.github.io/nome-do-repositorio/`).

## Rodando localmente (opcional)

Não precisa instalar nada. Basta abrir o `index.html` num navegador, ou
servir por http (recomendado por alguns navegadores serem restritivos com
`file://`):

```bash
python3 -m http.server 8000
```

e abrir `http://localhost:8000`.

## Privacidade

Todo o processamento acontece no navegador de quem está usando o site.
Nenhum arquivo é enviado para nenhum servidor.

## Ajustes possíveis

- **Outro idioma de OCR**: troque `'por'` por `'eng'`, `'por+eng'` etc. em
  `Tesseract.createWorker('por', ...)` dentro de `app.js`.
- **Tamanho de página do PDF final**: hoje é A4 (`format: 'a4'`); dá para
  trocar por `'letter'`, por exemplo.
- **Documentos com colunas**: se um dia precisar ler algo em múltiplas
  colunas, troque `Tesseract.PSM.SINGLE_BLOCK` por `Tesseract.PSM.AUTO` em
  `app.js` — o modo automático lida melhor com colunas, mas é menos estável
  em texto corrido simples.
