// Janela de marcação dos clientes: quando a próxima semana abre e quantas semanas ficam abertas.
// Qualquer membro da equipe lê; só o dono muda.

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { lerConfigAgenda } from "../db/consultas";
import type { AppEnv } from "../env";
import { exigirDono, exigirLogin } from "../seguranca/middleware";

export const configAgenda = new Hono<AppEnv>();
configAgenda.use("*", exigirLogin());

const corpo = z.object({
  aberturaDia: z.number().int().min(1).max(6),
  aberturaMinuto: z
    .number()
    .int()
    .min(0)
    .max(1439)
    .refine((m) => m % 15 === 0),
  semanas: z.union([z.literal(1), z.literal(2)]),
});

configAgenda.get("/", async (c) => c.json(await lerConfigAgenda(c.env.DB)));

configAgenda.put(
  "/",
  exigirDono(),
  bodyLimit({
    maxSize: 1024,
    onError: (c) => c.json({ erro: "Requisição muito grande." }, 413),
  }),
  async (c) => {
    const analise = corpo.safeParse(await c.req.json().catch(() => null));
    if (!analise.success)
      return c.json({ erro: "Dados inválidos. Escolha um dia de segunda a sábado, um horário e 1 ou 2 semanas." }, 400);
    const { aberturaDia, aberturaMinuto, semanas } = analise.data;
    const db = c.env.DB;
    const grava = (chave: string, valor: number) =>
      db
        .prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .bind(chave, String(valor));
    await db.batch([
      grava("abertura_dia", aberturaDia),
      grava("abertura_minuto", aberturaMinuto),
      grava("semanas_abertas", semanas),
    ]);
    return c.json({ aberturaDia, aberturaMinuto, semanas });
  },
);
