import { describe, expect, it } from "vitest";
import { getLlmProvider } from "../get-llm-provider";

/** `ProcessEnv` exige NODE_ENV; os testes só se importam com as variáveis do próprio seletor. */
function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

describe("getLlmProvider", () => {
  it("composes OpenAI as primary and DeepSeek as fallback when both keys are present", () => {
    const provider = getLlmProvider(env({ OPENAI_API_KEY: "a", DEEPSEEK_API_KEY: "b" }));
    expect(provider.name).toBe("resilient(openai+deepseek)");
  });

  it("lets LLM_PROVIDER lock the selected model even when other keys exist in the shell", () => {
    const provider = getLlmProvider(env({
      LLM_PROVIDER: "deepseek",
      OPENAI_API_KEY: "a",
      DEEPSEEK_API_KEY: "b",
    }));
    expect(provider.name).toBe("deepseek");
  });

  it("honours an explicit LLM_FALLBACK_PROVIDER over the default order", () => {
    const provider = getLlmProvider(env({
      LLM_PROVIDER: "openai",
      LLM_FALLBACK_PROVIDER: "anthropic",
      OPENAI_API_KEY: "a",
      DEEPSEEK_API_KEY: "b",
      ANTHROPIC_API_KEY: "c",
    }));
    expect(provider.name).toBe("resilient(openai+anthropic)");
  });

  it("returns a single provider when only one key is configured", () => {
    const provider = getLlmProvider(env({ DEEPSEEK_API_KEY: "b" }));
    expect(provider.name).toBe("deepseek");
    expect(provider.model).toBe("deepseek-chat");
  });

  it("respects DEEPSEEK_MODEL", () => {
    const provider = getLlmProvider(env({ DEEPSEEK_API_KEY: "b", DEEPSEEK_MODEL: "deepseek-reasoner" }));
    expect(provider.model).toBe("deepseek-reasoner");
  });

  it("fails loudly when a named provider has no key, instead of silently using another model", () => {
    expect(() =>
      getLlmProvider(env({ LLM_PROVIDER: "deepseek", OPENAI_API_KEY: "a" })),
    ).toThrow(/DEEPSEEK/i);
  });

  it("rejects an unknown provider name", () => {
    expect(() => getLlmProvider(env({ LLM_PROVIDER: "gemini", OPENAI_API_KEY: "a" }))).toThrow(
      /inválido/,
    );
  });

  it("keeps the cross-file stage on the default model when no override is set", () => {
    const vars = env({ OPENAI_API_KEY: "a", OPENAI_MODEL: "gpt-5-nano" });
    expect(getLlmProvider(vars, "crossFile").model).toBe(getLlmProvider(vars).model);
  });

  it("runs only the cross-file stage on OPENAI_MODEL_CROSS_FILE, leaving the rest untouched", () => {
    const vars = env({
      OPENAI_API_KEY: "a",
      OPENAI_MODEL: "gpt-5-nano",
      OPENAI_MODEL_CROSS_FILE: "gpt-5",
    });

    expect(getLlmProvider(vars, "crossFile").model).toBe("gpt-5");
    // O MAP faz uma chamada de modelo por decisão: encarecê-lo junto anularia o ganho da separação.
    expect(getLlmProvider(vars).model).toBe("gpt-5-nano");
  });

  it("rejects an invalid reasoning effort instead of silently ignoring it", () => {
    const vars = env({ OPENAI_API_KEY: "a", OPENAI_REASONING_EFFORT_CROSS_FILE: "altissimo" });
    expect(() => getLlmProvider(vars, "crossFile")).toThrow(/OPENAI_REASONING_EFFORT_CROSS_FILE/);
  });

  it("keeps the per-stage model distinct in the HU-33 idempotency key", () => {
    const vars = env({
      OPENAI_API_KEY: "a",
      OPENAI_MODEL: "gpt-5-nano",
      OPENAI_MODEL_CROSS_FILE: "gpt-5",
    });

    // `provider.model` é o que separa a chave de cache por modelo (§11.6): se os dois providers
    // reportassem o mesmo, um resultado gerado por um modelo seria reusado como se fosse do outro.
    expect(getLlmProvider(vars, "crossFile").model).not.toBe(getLlmProvider(vars).model);
  });

  it("fails when nothing is configured", () => {
    expect(() => getLlmProvider(env({}))).toThrow(/Nenhum provider/);
  });
});
