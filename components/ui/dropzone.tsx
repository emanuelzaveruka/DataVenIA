"use client";

import { useRef, useState, type DragEvent } from "react";
import { cn } from "./cn";
import { Botao } from "./botao";

/**
 * Área de envio do protótipo. O `<input type="file">` continua existindo e continua sendo quem
 * carrega o arquivo — ele só fica visualmente escondido (`sr-only`, não `display:none`), porque é
 * ele que dá teclado, leitor de tela e o seletor nativo de graça. O cartão é um rótulo em volta.
 */
export function Dropzone({
  onArquivo,
  arquivo,
  desabilitado = false,
  accept = ".pdf,.docx,.txt",
  id = "arquivo-peca",
}: {
  onArquivo: (arquivo: File | null) => void;
  arquivo: File | null;
  desabilitado?: boolean;
  accept?: string;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setArrastando(false);
    if (desabilitado) return;
    const solto = event.dataTransfer.files?.[0] ?? null;
    if (solto) onArquivo(solto);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!desabilitado) setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-card border-2 border-dashed px-8 py-14 text-center transition-colors ease-vn",
        arrastando ? "border-vn-acao bg-vn-verde-100" : "border-vn-papel-400 bg-vn-papel-50",
        desabilitado && "opacity-60",
      )}
    >
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center border border-vn-verde-200 bg-vn-verde-100">
        <span aria-hidden="true" className="block h-regua w-5 bg-vn-acao" />
      </div>

      <label htmlFor={id} className="block text-sub font-semibold text-vn-texto">
        {arquivo ? arquivo.name : "Arraste o arquivo aqui"}
      </label>
      <p className="mt-2 text-apoio leading-relaxed text-vn-texto-suave">
        Petição, decisão, recurso ou manifestação · PDF, DOCX ou TXT · até 15 MB
      </p>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={desabilitado}
        onChange={(event) => onArquivo(event.target.files?.[0] ?? null)}
        className="sr-only"
      />

      <Botao
        type="button"
        variante="primaria"
        disabled={desabilitado}
        onClick={() => inputRef.current?.click()}
        className="mt-5"
      >
        {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
      </Botao>
    </div>
  );
}
