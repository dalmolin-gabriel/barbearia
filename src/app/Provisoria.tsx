import { Topo } from "./componentes/Topo";

/** Página vazia só com o título, até a tela real existir. */
export default function Provisoria({ titulo }: { titulo: string }) {
  return <Topo titulo={titulo} />;
}
