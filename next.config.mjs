/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * O `pdfkit` (dependência do @react-pdf/renderer) carrega as fontes padrão por `require`
   * dinâmico, e o rastreador de arquivos do Next é estático: ele não enxerga esse require.
   *
   * O sintoma foi só em produção — local funciona porque o `node_modules` inteiro está no disco.
   * No lambda da Vercel, a geração de PDF morria com
   * `Cannot find module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'`.
   *
   * O detalhe que explica: o rastreamento resolveu as variantes **`.mjs`** das 14 fontes, mas o
   * runtime serverless carrega o pacote pelo caminho **CJS** e pede `.cjs`. Nenhum arquivo `.cjs`
   * de fonte ia junto — `Helvetica` só era o primeiro a ser pedido.
   *
   * Externalizar o pacote não resolveria: `@react-pdf/renderer` JÁ está na lista automática de
   * `serverExternalPackages` do Next. O problema nunca foi bundling, e sim quais arquivos são
   * copiados para o lambda.
   *
   * A rota é a única que gera PDF, então o peso extra fica só nela.
   */
  outputFileTracingIncludes: {
    "/api/reports/**": ["./node_modules/pdfkit/js/**/*"],
    // A doc pede escapar os colchetes da rota dinâmica; mantido junto do glob por segurança.
    "/api/reports/\\[runId\\]/pdf": ["./node_modules/pdfkit/js/**/*"],
  },
};

export default nextConfig;
