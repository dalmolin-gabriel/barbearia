import { buildPushPayload } from "@block65/webcrypto-web-push";
import { hhmm, partesLocais } from "../../shared/tempo";
import type { Env } from "../env";

type Inscricao = { id: string; endpoint: string; p256dh: string; auth: string };

export type Atendimento = { cliente: string; servicos_txt: string; inicio: string; barbeiro: string; usuario_id: string };

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "ter 01/12 às 11:00", sempre no horário de Brasília. */
function quando(inicio: string): string {
  const { data, minutos, diaSemana } = partesLocais(new Date(inicio));
  const [, mes, dia] = data.split("-");
  return `${DIAS[diaSemana]} ${dia}/${mes} às ${hhmm(minutos)}`;
}

/** Texto da notificação (JSON), pronto para criptografar. */
export function montarMensagem(a: Atendimento, atendimentoId: string): string {
  return JSON.stringify({
    title: "Novo horário marcado",
    body: `${a.cliente} · ${a.servicos_txt} · ${quando(a.inicio)} · com ${a.barbeiro}`,
    data: { url: `/painel?atendimento=${atendimentoId}` },
  });
}

/**
 * Avisa por push o barbeiro do atendimento e todos os donos ativos de um novo agendamento online.
 * Sem chaves VAPID configuradas não faz nada. Nunca lança erro: roda em `waitUntil`, e uma falha
 * aqui não pode afetar a resposta do agendamento.
 */
export async function notificarNovoAgendamento(env: Env, atendimentoId: string): Promise<void> {
  try {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;

    const atendimento = await env.DB.prepare(
      `SELECT c.nome AS cliente, a.servicos_txt, a.inicio, a.usuario_id, u.nome AS barbeiro
         FROM atendimentos a
         JOIN clientes c ON c.id = a.cliente_id
         JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.id = ?`,
    )
      .bind(atendimentoId)
      .first<Atendimento>();
    if (!atendimento) return;

    // UNION já elimina o dono que também é o barbeiro do atendimento (mesma inscrição).
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_inscricoes p WHERE p.usuario_id = ?1
       UNION
       SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_inscricoes p
         JOIN usuarios u ON u.id = p.usuario_id WHERE u.papel = 'dono' AND u.ativo = 1`,
    )
      .bind(atendimento.usuario_id)
      .all<Inscricao>();

    const porEndpoint = new Map<string, Inscricao>();
    for (const i of results ?? []) porEndpoint.set(i.endpoint, i);
    if (porEndpoint.size === 0) return;

    const mensagem = montarMensagem(atendimento, atendimentoId);
    const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };

    await Promise.all(
      [...porEndpoint.values()].map(async (i) => {
        try {
          const envio = await buildPushPayload(
            { data: mensagem, options: { ttl: 86_400, urgency: "high" } },
            { endpoint: i.endpoint, expirationTime: null, keys: { p256dh: i.p256dh, auth: i.auth } },
            vapid,
          );
          const resposta = await fetch(i.endpoint, envio);
          // Inscrição expirada ou cancelada no aparelho: não adianta tentar de novo.
          if (resposta.status === 404 || resposta.status === 410)
            await env.DB.prepare("DELETE FROM push_inscricoes WHERE id = ?").bind(i.id).run();
          else if (!resposta.ok) console.error("Push recusado", resposta.status);
        } catch (erro) {
          console.error("Falha ao enviar push", erro);
        }
      }),
    );
  } catch (erro) {
    console.error("Falha ao notificar", erro);
  }
}
