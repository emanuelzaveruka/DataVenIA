#!/usr/bin/env node
/**
 * Gera os arquivos de identidade servidos pela aplicação a partir dos originais em `docs/images/`.
 *
 *   node scripts/gerar-identidade.mjs
 *
 * Existe como script, e não como um punhado de comandos de uma vez só, porque os originais são a
 * fonte de verdade: quando a marca mudar, regerar precisa ser um comando, não arqueologia. Também
 * documenta as três decisões que não estão no arquivo de imagem:
 *
 * 1. **Recorte da margem transparente.** Os originais vêm com folga em volta (o símbolo ocupa
 *    666×609 de uma tela de 1000×1000). Servidos assim, a logo aparece pequena dentro da própria
 *    caixa e qualquer ajuste de altura no CSS briga com um padding que mora dentro do PNG.
 *
 * 2. **Favicon sobre creme, não transparente.** O símbolo é navy com miolo verde; em aba escura de
 *    navegador, navy sobre transparente vira um borrão. O creme da marca (`--vn-papel-100`) dá
 *    contraste nos dois temas e é a cor institucional de fundo — não é uma cor inventada para o
 *    ícone.
 *
 * 3. **Duas versões do logotipo, não uma.** "Clara" (creme + verde) é para fundo navy; "escura"
 *    (navy + verde) é para fundo creme. Usar a errada some com metade do texto.
 *
 * `sharp` já vem com o Next (otimização de imagem); nenhuma dependência nova.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const em = (...partes) => resolve(RAIZ, ...partes);

/** `--vn-papel-100`: o fundo institucional da marca. */
const CREME = { r: 0xf4, g: 0xf2, b: 0xec, alpha: 1 };

const ORIGINAIS = {
  simbolo: em("docs/images/Apenas Simbolo.png"),
  clara: em("docs/images/logo sem fundo versao clara.png"),
  // O arquivo original veio sem extensão (`Logo sem fundo versão escura._`); é PNG.
  escura: em("docs/images/Logo sem fundo versão escura._"),
};

/** Altura de trabalho do logotipo. ~7x a altura de exibição no cabeçalho: sobra para retina. */
const ALTURA_LOGOTIPO = 200;

/**
 * Quanto do lado do ícone o símbolo ocupa.
 *
 * 0,76 e não 1: sem respiro o "V" encosta na borda e, a 16px numa aba, lê como um borrão escuro em
 * vez de uma forma. A folga é o que preserva a silhueta quando tudo encolhe.
 */
const OCUPACAO_ICONE = 0.76;

async function simboloEmQuadrado(lado, fundo) {
  const conteudo = Math.round(lado * OCUPACAO_ICONE);

  const simbolo = await sharp(ORIGINAIS.simbolo)
    .trim({ threshold: 1 })
    .resize({
      width: conteudo,
      height: conteudo,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  return sharp({
    create: { width: lado, height: lado, channels: 4, background: fundo },
  })
    .composite([{ input: simbolo, gravity: "center" }])
    .png()
    .toBuffer();
}

/**
 * ICO de imagem única embutindo um PNG.
 *
 * `sharp` não escreve .ico, e o formato aceita PNG embutido desde o Vista: são 6 bytes de cabeçalho
 * e 16 de entrada antes dos bytes do PNG. Escrever à mão evita uma dependência inteira para 22
 * bytes de estrutura.
 */
function envelopeIco(png, lado) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(1, 4); // uma imagem

  const entrada = Buffer.alloc(16);
  entrada.writeUInt8(lado >= 256 ? 0 : lado, 0); // 0 significa 256
  entrada.writeUInt8(lado >= 256 ? 0 : lado, 1);
  entrada.writeUInt8(0, 2); // paleta
  entrada.writeUInt8(0, 3); // reservado
  entrada.writeUInt16LE(1, 4); // planos
  entrada.writeUInt16LE(32, 6); // bits por pixel
  entrada.writeUInt32LE(png.length, 8);
  entrada.writeUInt32LE(cabecalho.length + entrada.length, 12);

  return Buffer.concat([cabecalho, entrada, png]);
}

async function logotipo(origem, destino) {
  await sharp(origem)
    .trim({ threshold: 1 })
    .resize({ height: ALTURA_LOGOTIPO, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(destino);
  const { width, height } = await sharp(destino).metadata();
  return `${width}x${height}`;
}

async function main() {
  await mkdir(em("public"), { recursive: true });

  const feitos = [];

  // Logotipos servidos pela aplicação.
  feitos.push(
    `public/logo-datavenia-clara.png   ${await logotipo(ORIGINAIS.clara, em("public/logo-datavenia-clara.png"))}  (sobre navy)`,
  );
  feitos.push(
    `public/logo-datavenia-escura.png  ${await logotipo(ORIGINAIS.escura, em("public/logo-datavenia-escura.png"))}  (sobre creme)`,
  );

  // Símbolo isolado, transparente — para onde o logotipo inteiro não cabe.
  await sharp(ORIGINAIS.simbolo)
    .trim({ threshold: 1 })
    .resize({ height: 256, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(em("public/simbolo-datavenia.png"));
  feitos.push("public/simbolo-datavenia.png      transparente");

  // Ícones da aba do navegador (convenção de arquivo do App Router).
  const icone512 = await simboloEmQuadrado(512, CREME);
  await writeFile(em("app/icon.png"), icone512);
  feitos.push("app/icon.png                      512x512  fundo creme");

  await writeFile(em("app/apple-icon.png"), await simboloEmQuadrado(180, CREME));
  feitos.push("app/apple-icon.png                180x180  fundo creme (iOS não aceita alfa)");

  const icone32 = await simboloEmQuadrado(32, CREME);
  await writeFile(em("app/favicon.ico"), envelopeIco(icone32, 32));
  feitos.push("app/favicon.ico                   32x32    PNG embutido");

  console.log("Identidade gerada a partir de docs/images/:\n");
  for (const linha of feitos) console.log("  " + linha);
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
