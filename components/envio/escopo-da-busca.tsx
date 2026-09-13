"use client";

import { useState } from "react";
import { Cartao } from "../ui/cartao";
import { Rotulo } from "../ui/rotulo";
import { Selecao, RotuloCampo } from "../ui/campo";
import { Chip } from "../ui/chip";

/**
 * Painel "Escopo da busca" do protótipo.
 *
 * ESTADO REAL (13/09/2026): os controles funcionam, mas NÃO chegam à busca. A rota
 * `app/api/documents/route.ts` lê um único campo do FormData (`file`) e `RunPipelineInput` não
 * recebe filtros — as queries são geradas pelo modelo em `generateSearchQueries`. O vocabulário
 * já existe tipado no domínio (`JurisprudenceQueryFilters` em `lib/schemas/search.schema.ts`:
 * `periodStart`/`periodEnd`/`judgingBody`/`judge`), mas não há caminho do front até ele.
 *
 * Ligar isso de ponta a ponta é mudança de contrato de rota + pipeline — backlog, não manutenção
 * de front. Enquanto não estiver ligado, o painel DIZ que não está: um filtro que aparenta filtrar
 * e não filtra é pior do que filtro nenhum, ainda mais num produto cuja regra central é não
 * afirmar o que não pode comprovar.
 *
 * Quando o backend aceitar filtros, o aviso sai e o estado daqui vira corpo da requisição.
 */
const CAMARAS = [
  "Todas as câmaras cíveis",
  "Turmas Recursais",
  "Câmaras criminais",
] as const;

const PERIODOS = [
  "Últimos 5 anos",
  "Últimos 3 anos",
  "Últimos 12 meses",
  "Todo o acervo",
] as const;

export function EscopoDaBusca() {
  const [camara, setCamara] = useState<string>(CAMARAS[0]);
  const [periodo, setPeriodo] = useState<string>(PERIODOS[0]);
  const [chips, setChips] = useState<string[]>(["TJPR", "Consumidor"]);

  return (
    <Cartao className="p-6">
      <Rotulo className="mb-4">Escopo da busca</Rotulo>

      <RotuloCampo htmlFor="en-camara">Câmara</RotuloCampo>
      <Selecao
        id="en-camara"
        value={camara}
        onChange={(event) => setCamara(event.target.value)}
        className="mb-4"
      >
        {CAMARAS.map((opcao) => (
          <option key={opcao}>{opcao}</option>
        ))}
      </Selecao>

      <RotuloCampo htmlFor="en-periodo">Período</RotuloCampo>
      <Selecao
        id="en-periodo"
        value={periodo}
        onChange={(event) => setPeriodo(event.target.value)}
        className="mb-4"
      >
        {PERIODOS.map((opcao) => (
          <option key={opcao}>{opcao}</option>
        ))}
      </Selecao>

      <div className="mb-2.5 text-rotulo font-semibold">Filtros ativos</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Chip
            key={chip}
            onRemover={() => setChips((atuais) => atuais.filter((item) => item !== chip))}
          >
            {chip}
          </Chip>
        ))}
        {chips.length === 0 && (
          <span className="text-legenda text-vn-texto-suave">Nenhum filtro ativo.</span>
        )}
      </div>

      <p className="mt-5 border-t border-vn-borda pt-4 text-legenda leading-relaxed text-vn-texto-suave">
        <strong className="font-semibold text-vn-texto">Ainda não aplicado à busca.</strong> O
        pipeline monta as queries a partir da própria peça. Enviar o escopo junto do documento
        depende de mudança na rota de análise — está no backlog.
      </p>
    </Cartao>
  );
}
