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

  it("fails when nothing is configured", () => {
    expect(() => getLlmProvider(env({}))).toThrow(/Nenhum provider/);
  });
});
