# Checklist de escopo (HU-36)

Referência rápida do §10 de `contexto-geral.md`. Antes de aceitar qualquer item novo no backlog,
verifique contra esta lista — expansão de escopo exige decisão explícita, nunca assumida por omissão.

## Dentro do escopo

- Upload de documento (PDF/DOCX/TXT) como única entrada do pipeline.
- Um único tribunal: TJPR.
- Busca pública de jurisprudência respeitando os limites do funil (§6).
- Pipeline completo Map → Reduce → Verify (Scratchpads, cross-file, evidence verification).
- Arquitetura de resiliência completa desde o início (§11): outputs estruturados validados,
  hooks PreToolUse/PostToolUse, contrato único de erro, retry+backoff, circuit breaker,
  idempotência, persistência estruturada.
- Dashboard de resultados, cards de decisão, links oficiais.
- Modo de demonstração com fixture versionada.
- UI responsiva/acessível, mobile-first.

## Fora do escopo (não implementar sem decisão explícita)

- Qualquer tribunal além do TJPR (STJ, STF, outros TJs).
- Scraping, automação de browser em massa, ou qualquer tentativa de burlar login/CAPTCHA/rate
  limit/áreas restritas.
- Previsão de resultado em percentual, cálculo de condenação, parecer jurídico formal, ou geração
  autônoma de peça pronta para protocolo sem revisão humana.
- Cadastro, pagamento, integração com CPJ/ProJuris, notificações, banco de dados multiusuário
  permanente.
- Comunica PJe/DJEN e DataJud como participantes ativos do pipeline (permanecem documentados como
  fontes complementares futuras).
- Análise de milhares de decisões simultâneas, Kafka, arquitetura distribuída, processamento em
  massa, fine-tuning, vector DB complexo, monitoramento contínuo de todos os processos, análise
  autônoma sem evidência.

## Adições por decisão explícita do usuário

Itens fora das 38 HUs originais, aceitos por decisão registrada (o que esta seção existe para
tornar rastreável — §10 exige decisão explícita, nunca por omissão).

- **2026-09-12 — dados de referência do TJPR em tabela própria.** Competência material das Câmaras
  (`camara_competencias`, já carregada) e contatos de desembargadores (a definir quando a planilha
  chegar). São dados públicos do tribunal, fora da árvore de execução e fora da cascata de HU-06.
  Não alteram o pipeline Map→Reduce→Verify nem o que vai ao relatório; servem a roteamento de
  matéria e consulta. Continua valendo o "fora do escopo" acima — em especial, nada aqui autoriza
  outro tribunal, coleta automatizada do portal, ou uso dos contatos para qualquer forma de envio.

Ver também HU-38 (plano de validação da fonte TJPR) para os limites do que pode ser feito com o
portal público antes de qualquer decisão de integração real.
