import type { Config } from "tailwindcss";

/**
 * Data VênIA — configuração Tailwind derivada do manual da marca.
 *
 * As cores apontam para as custom properties de datavenia-tokens.css.
 * Isso mantém uma única fonte de verdade: se a marca mudar um hex,
 * muda no CSS e o Tailwind acompanha sem rebuild de config.
 *
 * Regras da marca que a config já impõe:
 *  - raio máximo de 2px em controles, 0 em cards  → borderRadius enxuto
 *  - régua de acento de 3px                       → borderWidth.3 e spacing.regua
 *  - Manrope como única família                   → fontFamily.sans
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          100: "var(--vn-navy-100)",
          200: "var(--vn-navy-200)",
          300: "var(--vn-navy-300)",
          400: "var(--vn-navy-400)",
          500: "var(--vn-navy-500)",
          600: "var(--vn-navy-600)",
          700: "var(--vn-navy-700)",
          800: "var(--vn-navy-800)",
          900: "var(--vn-navy-900)",
          DEFAULT: "var(--vn-navy)",
        },
        verde: {
          100: "var(--vn-verde-100)",
          200: "var(--vn-verde-200)",
          300: "var(--vn-verde-300)",
          400: "var(--vn-verde-400)",
          500: "var(--vn-verde-500)",
          600: "var(--vn-verde-600)",
          700: "var(--vn-verde-700)",
          800: "var(--vn-verde-800)",
          900: "var(--vn-verde-900)",
          DEFAULT: "var(--vn-verde)",
        },
        papel: {
          0: "var(--vn-papel-0)",
          50: "var(--vn-papel-50)",
          100: "var(--vn-papel-100)",
          200: "var(--vn-papel-200)",
          400: "var(--vn-papel-400)",
        },
        // aliases semânticos — preferir estes nas telas de produto
        fundo: "var(--vn-fundo)",
        superficie: "var(--vn-superficie)",
        borda: "var(--vn-borda)",
        acao: "var(--vn-acao)",
        "acao-hover": "var(--vn-acao-hover)",
        // estados
        sucesso: "var(--vn-sucesso)",
        info: "var(--vn-info)",
        atencao: "var(--vn-atencao)",
        critico: "var(--vn-critico)",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      fontSize: {
        legenda: ["12px", { lineHeight: "1.5" }],
        rotulo: ["13px", { lineHeight: "1.5", letterSpacing: "0.12em" }],
        apoio: ["14px", { lineHeight: "1.55" }],
        corpo: ["16px", { lineHeight: "1.6" }],
        sub: ["20px", { lineHeight: "1.35", fontWeight: "600" }],
        titulo: ["28px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        display: ["44px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        // a marca é de cantos retos: não existe raio grande neste sistema
        none: "0px",
        controle: "2px",
        card: "0px",
      },
      borderWidth: {
        3: "3px", // régua de acento
      },
      spacing: {
        regua: "3px",
      },
      boxShadow: {
        foco: "0 0 0 3px rgba(18, 144, 102, .28)",
      },
      transitionTimingFunction: {
        vn: "cubic-bezier(.4, 0, .2, 1)",
      },
      transitionDuration: {
        rapida: "150ms",
        padrao: "220ms",
      },
      maxWidth: {
        leitura: "68ch", // blocos longos entre 58 e 68 caracteres
        prosa: "62ch",
      },
    },
  },
  plugins: [],
};

export default config;
