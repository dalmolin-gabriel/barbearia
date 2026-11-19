// Textos de WhatsApp. Sem API de Worker ou Node.
import { partesLocais, somarDias } from "./tempo";

/** Mensagem de lembrete; `hoje` (AAAA-MM-DD) existe para tornar o texto testável. */
export function textoLembrete(
  a: {
    cliente: string;
    data: string;
    hora: string;
    servico: string;
    barbeiro: string;
    barbearia: string;
  },
  hoje: string = partesLocais(new Date()).data,
): string {
  let quando: string;
  if (a.data === hoje) quando = "hoje";
  else if (a.data === somarDias(hoje, 1)) quando = "amanhã";
  else {
    const [, mes = "", dia = ""] = a.data.split("-");
    quando = `${dia}/${mes}`;
  }
  return `Fala, ${a.cliente}! Lembrando do seu ${a.servico} ${quando} às ${a.hora} com o ${a.barbeiro} na ${a.barbearia}. Posso confirmar? ✂️`;
}

export function linkWhatsapp(telNorm: string, texto: string): string {
  return `https://wa.me/${telNorm}?text=${encodeURIComponent(texto)}`;
}
