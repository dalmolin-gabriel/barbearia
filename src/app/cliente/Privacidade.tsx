import { Link } from "react-router-dom";
import { Aviso } from "../componentes/Aviso";
import { BotaoLink } from "../componentes/Botao";
import { Logo } from "../componentes/Logo";
import { useCarregar, buscarInfo } from "../hooks";
import { NOME_PADRAO } from "../util";

export default function Privacidade() {
  const { dados } = useCarregar(() => buscarInfo(), []);
  const nome = dados?.barbearia.nome || NOME_PADRAO;
  const whats = (dados?.barbearia.whatsapp ?? "").replace(/\D/g, "");

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-5 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Logo tamanho={48} />
        <h1 className="bebas text-[30px] leading-none">Aviso de privacidade</h1>
      </header>

      <Aviso tipo="info">Este texto é um modelo. Ele deve ser revisado pela barbearia antes do uso definitivo.</Aviso>

      <section className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-bold">Quem guarda seus dados</h2>
        <p className="text-[15px] text-texto-suave">
          A {nome} guarda o seu nome e o seu celular quando você marca um horário.
        </p>
      </section>
      <section className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-bold">Para que usamos</h2>
        <p className="text-[15px] text-texto-suave">
          Só para organizar a agenda e falar com você pelo WhatsApp sobre o seu horário, como o lembrete do dia anterior.
          Ao marcar, você também recebe um link secreto para ver e cancelar o seu horário (guardamos só uma versão
          codificada dele, e este aparelho lembra dos seus horários marcados). Não vendemos nem repassamos seus dados.
        </p>
      </section>
      <section className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-bold">Por quanto tempo</h2>
        <p className="text-[15px] text-texto-suave">
          Guardamos os dados por até 2 anos depois do seu último atendimento. Depois disso, eles são apagados.
        </p>
      </section>
      <section className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-bold">Como pedir a exclusão</h2>
        <p className="text-[15px] text-texto-suave">
          Chame a barbearia pelo WhatsApp e peça para apagar seus dados. O histórico de atendimentos continua, mas sem o seu
          nome e o seu telefone.
        </p>
      </section>

      {whats ? (
        <BotaoLink variante="whatsapp" href={`https://wa.me/${whats}`} target="_blank" rel="noopener noreferrer">
          Pedir exclusão no WhatsApp
        </BotaoLink>
      ) : null}
      <Link to="/" className="text-center text-[15px] font-semibold text-ouro">
        Voltar para o agendamento
      </Link>
    </div>
  );
}
