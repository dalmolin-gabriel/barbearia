import type { Config } from "tailwindcss";

// Cores e fontes do tema da barbearia (iguais ao protótipo aprovado).
export default {
  content: ["./index.html", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fundo: "#0B0B0B",
        superficie: "#161616",
        "superficie-alta": "#222222",
        borda: "#2E2E2E",
        ouro: "#D0B848",
        "ouro-escuro": "#B8A030",
        texto: "#E8E6E0",
        "texto-suave": "#9C9A94",
        apagado: "#4A4945",
        ok: "#5CC48A",
        erro: "#E0574E",
        zap: "#25A35F",
        "zap-fundo": "#12543D",
      },
      fontFamily: {
        bebas: ['"Bebas Neue"', "Impact", "sans-serif"],
        inter: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
