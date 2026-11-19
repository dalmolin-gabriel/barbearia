# Agenda online da barbearia — projeto

Data: 19/11/2026 · Status: rascunho para aprovação

## 1. Para que serve

Um sistema de agendamento para **uma barbearia pequena: hoje o pai (dono) e o filho**, com a possibilidade
de cadastrar mais barbeiros no futuro. Hoje tudo é
pelo WhatsApp. O dono já testou outros aplicativos e não se adaptou, não por culpa deles, mas
porque tem dificuldade de mudar a rotina. Este sistema vai ser **apresentado e vendido** a ele.

O que conta como sucesso:

- O cliente marca sozinho, sem precisar chamar ninguém no WhatsApp.
- O dono controla a agenda e vê o resultado do mês sem esforço.
- **Pouca coisa, bem feita.** O dono pediu poucas funções.

Anti-objetivos (o que faria o projeto fracassar mesmo funcionando):

- Telas cheias de opções, ou que exijam aprendizado. Tem que ser óbvio no celular.
- Clientes marcando com muita antecedência e bagunçando a organização. Isso já aconteceu
  quando ele abriu dezembro inteiro (ver regra da semana, seção 4.2).
- Qualquer falha de segurança ou vazamento de dados de clientes: é um produto vendido.
- Custo mensal com mensagens pagas.

Referências:

- Proposta anterior: https://claude.ai/artifact/YCHWfD4QsxTmxdFbhjR1mX (conversa de 13 a 16/11).
  Este projeto é a versão **enxuta** dela.
- Repositório `dalmolin-gabriel/barbearia-bem-gerida`: o fluxo do cliente deve ser **bem parecido**
  com o de lá (`src/routes/agendar.tsx`, `src/features/publico/*`), exceto pelo calendário
  (seção 4.2). O código de lá pode ser reaproveitado onde ajudar, mas este é um sistema novo.

## 2. Quem usa e o que cada um pode

| Ação | Cliente | Barbeiro (filho e futuros) | Pai (dono) |
|---|---|---|---|
| Ver serviços e preços, marcar horário | Sim | — | — |
| Ver a própria agenda (dia, semana, qualquer data) | — | Sim | Sim |
| Ver a agenda do outro barbeiro | — | Não | Sim |
| Marcar cliente na mão (pediu pelo WhatsApp), em **qualquer data** | — | Na própria agenda | Nas duas |
| Bloquear horário (almoço, folga, compromisso) | — | Na própria agenda | Nas duas |
| Marcar atendimento como confirmou / cancelou / atendido / faltou | — | Os próprios | Todos |
| Mandar lembrete pelo WhatsApp (mensagem pronta) | — | Os próprios | Todos |
| Cadastrar e editar serviços (nome, duração, preço) | — | Não | Sim |
| Editar o horário de trabalho de cada barbeiro | — | Não | Sim |
| Ver faturamento e número de atendimentos do mês | — | Não | Sim |
| Cadastrar barbeiros (filho e novos funcionários), desativar e trocar senha | — | Não | Sim |
| Receber notificação de agendamento novo ou cancelado | — | Da própria agenda | De todos |
| Apagar os dados de um cliente (LGPD) | — | Não | Sim |

Toda permissão é conferida **no servidor**, em toda requisição. Esconder botão não conta como
proteção.

## 3. Fora do escopo (versão 1)

- Lembretes automáticos ou pagos pelo WhatsApp (API oficial da Meta). Decidido: **não**.
- Cliente cancelar ou remarcar sozinho pelo sistema *(minha decisão para manter enxuto: a tela
  de confirmação tem um botão "Falar no WhatsApp" para isso, e o barbeiro marca "cancelou")*.
- Várias barbearias no mesmo sistema, fotos dos barbeiros, logo enviado pelo painel, cores
  editáveis, feriados como função própria (o pai usa "bloquear horário"), permissão de gerente,
  edição dos textos das mensagens, relatórios além do resumo do mês.

## 4. Como funciona

### 4.1 Tela do cliente (pública)

Mesmo fluxo do `barbearia-bem-gerida`, em 3 etapas, no celular:

1. **Serviços:** lista com nome, duração e preço. O cliente escolhe um ou mais e toca em
   "Continuar". A duração total é a soma.
2. **Profissional, dia e hora:**
   - Fotos/iniciais dos barbeiros ativos. **O cliente é obrigado a escolher um barbeiro**: não existe
     opção "Sem preferência" (decisão do usuário).
   - **Calendário do mês sempre visível** na tela, no lugar da faixa horizontal de dias da referência.
     Só os dias da **janela aberta** (4.2) dá para tocar. O resto fica cinza. Dia sem vaga ou
     fechado aparece apagado ou riscado. Se a janela atravessar o mês, aparecem setas para trocar de mês.
   - Embaixo: horários livres do dia escolhido, divididos em **Manhã / Tarde / Noite**. Só aparecem
     horários em que o serviço cabe inteiro, e nada no passado.
3. **Confirmação** (folha que sobe de baixo): resumo (serviço, barbeiro, dia, hora, preço), **nome**,
   **celular (WhatsApp)**, caixinha de aceite da LGPD com link para o aviso de privacidade, botão
   "Confirmar".

Depois de confirmar: tela "Pronto, tá marcado!" com o resumo, o botão "Adicionar à minha agenda"
(arquivo .ics) e o botão "Falar no WhatsApp" (para cancelar ou remarcar).

Se o horário for ocupado por outra pessoa entre a escolha e a confirmação, aparece o aviso
"Esse horário acabou de ser reservado" e a lista é atualizada.

### 4.2 Regra da semana (janela de marcação)

Pedido do dono: em dezembro ele abriu o mês inteiro, clientes marcaram com 4 semanas de
antecedência e ele perdeu a organização.

- O cliente só marca **dentro da semana atual, de segunda a domingo**, a partir de agora.
- A **semana seguinte abre no sábado às 18h** (horário de Brasília). Do sábado 18h até o domingo
  23h59, o cliente vê o resto da semana atual mais a semana seguinte inteira.
- Exemplo: na terça, 1º/12, o cliente vê de 1º a 6/12. No sábado, 5/12, às 18h, abre de 7 a 13/12.
- O dia e a hora de abertura ficam guardados na configuração (padrão: sábado, 18h). Mudar exige
  um ajuste técnico, sem tela no painel *(minha decisão)*.
- **A regra vale só para o cliente.** Os barbeiros e o pai marcam em qualquer data.
- O servidor aplica a mesma regra ao receber um agendamento. Não dá para burlar mexendo no navegador.

### 4.3 Painel do barbeiro (pai e demais barbeiros, com login)

Pensado para quem não gosta de app: botões grandes, poucas telas, tudo no celular.

- **Agenda** (tela inicial): calendário do mês no topo, livre para navegar para qualquer mês. Abaixo,
  a lista do dia escolhido: horário, cliente, serviço e situação. O pai alterna entre "Minha", cada barbeiro
  e "Todos". Toques rápidos em cada atendimento: **Confirmou · Cancelou · Atendido · Faltou** e
  **WhatsApp**. Cancelado libera o horário.
- **+ Marcar cliente:** nome, celular (opcional), serviço, barbeiro (só o pai escolhe), dia e hora.
  Qualquer data, sem a regra da semana. *(Minha decisão:)* o barbeiro também pode marcar fora do
  expediente, por cima de um bloqueio e no passado (para registrar quem chegou sem marcar). O
  sistema só avisa ("fora do seu horário", "horário bloqueado") e pede confirmação. A única coisa
  proibida é sobrepor outro atendimento ativo. Por isso o cálculo de vagas do cliente e a validação
  da marcação manual são caminhos separados que compartilham só a checagem de sobreposição.
- **Bloquear horário:** dia, hora de início e fim (ou dia inteiro) e um motivo opcional.
- **Lembrete pelo WhatsApp (gratuito):** ao tocar em WhatsApp, abre o WhatsApp do aparelho
  (link `wa.me`) com a mensagem pronta (nome, dia, hora, serviço e barbeiro), e o barbeiro só
  aperta enviar. O cliente responde por texto (não há botões de confirmar/cancelar) e o barbeiro
  marca a situação. Botão **"Lembretes de hoje/amanhã"**: lista os clientes do dia com um botão de
  WhatsApp em cada, para ir tocando um por um (o navegador não deixa abrir várias conversas de uma vez).
- **Só o pai:**
  - **Serviços:** criar, editar e desativar (nome, duração em minutos, preço). Desativar em vez de
    apagar, para não estragar o histórico.
  - **Horários de trabalho:** para cada barbeiro e cada dia da semana: aberto ou fechado, início,
    fim e intervalo de almoço.
  - **Resumo do mês:** atendimentos e faturamento do mês, total e por barbeiro, com setas para
    meses anteriores. Faturamento = soma dos preços dos atendimentos marcados como **Atendido**.
  - **Equipe:** cadastrar barbeiros (nome, foto opcional, usuário e senha provisória), editar o horário
    de cada um, trocar a senha e **desativar** quem sair. Barbeiro desativado some da tela do cliente,
    não loga mais e mantém o histórico. Não há limite de barbeiros.
  - **Clientes:** buscar pelo nome ou celular e apagar os dados de um cliente.

### 4.4 Situações de um atendimento

`marcado` (padrão) → `confirmado` → `atendido`, ou `cancelado` ou `faltou`. Só `marcado` e
`confirmado` ocupam a agenda. O preço e a duração são **copiados para o atendimento** na hora
de marcar: se o pai mudar o preço depois, o histórico não muda.

### 4.5 Notificações no celular (como app)

- O sistema é um **PWA**: pode ser instalado na tela inicial com o ícone do logo e abre como app.
- **Web Push** (gratuito): ao ser criado ou cancelado um agendamento, **pelo cliente**, chega uma
  notificação, por exemplo "📅 Novo horário: João · Corte · sex 20/11 às 14h". Ao tocar, abre o atendimento.
- Quem recebe: cada barbeiro, os da **própria agenda**. O pai recebe **todos**.
- Cada aparelho ativa as notificações no painel (botão "Ativar notificações"). Uma pessoa pode ter
  vários aparelhos. Inscrições que o navegador recusar (expiradas) são apagadas sozinhas.
- No **iPhone**, só funciona com o app instalado na tela inicial (iOS 16.4 ou mais novo). No Android,
  funciona direto. O painel mostra essa instrução quando detectar iPhone sem instalação.
- Técnica: service worker, tabela de inscrições push, chaves VAPID guardadas como *secret*, envio
  pelo Worker com `ctx.waitUntil`, para não atrasar a resposta ao cliente.

### 4.6 Divulgação: link na bio e resposta automática no WhatsApp

- O sistema tem **um endereço só** (ex.: `barbeariadospadilhas.com.br` ou o endereço gratuito
  `...workers.dev`), e a página inicial já é o agendamento. Ele vai na **bio do Instagram**.
- A **mensagem automática** no WhatsApp ("Olá! Agende seu horário aqui: [link]") é configurada
  **no próprio WhatsApp Business do dono**, sem programação e de graça. Não faz parte do código.
  A entrega inclui um passo a passo de configuração.
- Limitação do WhatsApp Business que precisa ser explicada ao dono: a **mensagem de saudação** só
  vai na primeira conversa ou quando o cliente ficou 14 dias sem falar. Quem conversa toda semana não
  recebe sempre. Alternativa: a **mensagem de ausência**, ligada nos horários em que ele está atendendo.
  Isso exige que o dono use o **WhatsApp Business**, e não o WhatsApp comum.

## 5. Como é construído (decidido)

**Tudo no Cloudflare:** um Worker que serve as telas e a API, banco **D1**, repositório
`dalmolin-gabriel/barbearia` já conectado ao build do Cloudflare (o erro de build atual é só porque
o repositório está vazio).

Alternativa descartada: site no Cloudflare + banco no Supabase. São duas contas, e o plano grátis
pausa o projeto após cerca de 7 dias sem uso.

*Minhas decisões técnicas* (o construtor pode ajustar detalhes):

- Front-end em React + Vite + Tailwind, no mesmo espírito da referência, mas com bem menos
  componentes. API com Hono no Worker. TypeScript em tudo.
- Fuso fixo `America/Sao_Paulo`. Horários guardados em UTC (ISO 8601).
- Grade de horários de 15 em 15 minutos para quem marca. Antecedência mínima de 30 minutos para o cliente.
- Um único `wrangler.jsonc`, com `npx wrangler deploy` (já é o comando configurado no Cloudflare).
  As migrações do D1 ficam no repositório.

## 6. Segurança (obrigatório)

O usuário exigiu os processos de segurança adequados por ser um produto vendido.

**Login**
- Senha guardada com PBKDF2-SHA256 (Web Crypto) e sal por usuário. Nunca em texto.
- Sessão: token aleatório de 32 bytes num cookie `HttpOnly; Secure; SameSite=Strict`, e no banco só
  o hash do token. Validade de 30 dias, renovada com o uso (para o pai não ter que logar toda hora).
  Sair apaga a sessão.
- Bloqueio após 5 senhas erradas seguidas: 15 minutos.
- Login por um nome de usuário simples (ex.: `ze`), sem exigir e-mail *(minha decisão: o pai não
  usa e-mail no dia a dia)*. Se o pai esquecer a senha, ela é redefinida por um comando técnico
  (`wrangler`), feito por quem mantém o sistema.

**Permissões**
- Toda rota do painel confere a sessão e o papel (`dono` ou `barbeiro`). Um barbeiro que não é dono só lê e altera
  atendimentos e bloqueios da agenda dele. Isso tem teste automático.

**Agendamento público**
- Validação de tudo no servidor (zod): serviço existe e está ativo, barbeiro existe, horário dentro
  do expediente e da janela, nome até 60 caracteres, celular brasileiro válido.
- **Sem horário duplicado:** a gravação confere a sobreposição e insere no mesmo comando SQL
  (o D1 processa as escritas uma de cada vez), recusando se já houver conflito. Tem teste de corrida.
- Proteção contra abuso: **Cloudflare Turnstile** (verificação anti-robô gratuita e sem quebra-cabeça)
  no botão Confirmar, limite de requisições por IP e no máximo 2 agendamentos futuros por celular.
- SQL sempre com parâmetros (`prepare().bind()`), nunca juntando texto. O React escapa o que é
  exibido, e não se usa `dangerouslySetInnerHTML`.
- CSRF: cookie `SameSite=Strict`, mais a conferência do cabeçalho `Origin` em toda requisição que altera dados.
- Cabeçalhos: Content-Security-Policy restrita, `X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors 'none'`.
- A API pública devolve só o necessário: horários livres, e nunca nomes ou celulares de outros clientes.

**Dados e LGPD**
- Do cliente, só nome e celular, mais a data do aceite.
- Página curta de aviso de privacidade: quem guarda (nome da barbearia e do dono), para quê
  (agendar e avisar sobre o horário), por quanto tempo e como pedir a exclusão (WhatsApp da
  barbearia). *(Minha decisão:)* o prazo é de **2 anos após o último atendimento**, e a exclusão é
  **manual** pelo pai, sem rotina automática na versão 1. O texto final é um modelo simples e não
  substitui a revisão de um advogado.
- O pai apaga os dados de um cliente (o atendimento fica no histórico como "cliente removido",
  para o faturamento não mudar).

**Infraestrutura**
- Segredos (chave do Turnstile etc.) como *secrets* do Cloudflare, nunca no código.
  `.gitignore` cobre `.dev.vars` e `.env`.
- **Recomendado deixar o repositório privado.** Hoje ele é público.
- Backup: o *Time Travel* do D1 restaura o banco para qualquer momento dos últimos 30 dias.

**Antes de entregar**
- Testes automáticos (Vitest no ambiente dos Workers): regra da semana, cálculo de horários, horário
  duplicado, permissões do barbeiro e login/bloqueio.
- Revisão de segurança do código inteiro.

## 7. Primeira configuração

- Ao publicar, o banco nasce vazio. Um comando técnico cria a conta do pai (usuário e senha
  provisória) e os serviços de exemplo (Corte 30 min, Barba 20 min, Corte + Barba 50 min, preços
  a definir), que o pai ajusta no painel.
- O pai cria a conta do filho (e de futuros barbeiros) pelo painel.
- Divulgação: ver seção 4.6.

## 8. Identidade visual: Barbearia dos Padilhas

Logo: `docs/marca/logo-instagram.png` (foto do perfil do Instagram). Fundo preto, moldura e
detalhes dourados, tesouras cruzadas num "telhado" dourado, faixa com "BARBEARIA" em branco
espaçado, postes de barbeiro listrados de preto e dourado nas pontas e "DOS PADILHAS" com
"PADILHAS" em dourado, letra grossa condensada e sombra.

Cores (tiradas do logo):

| Papel | Cor |
|---|---|
| Fundo principal | preto `#0B0B0B` |
| Dourado (destaques, botões, dia escolhido) | `#D0B848` · tom escuro `#B8A030` |
| Texto claro | `#E8E6E0` · secundário `#D0D0D0` |

*(Minhas decisões:)* tema escuro como padrão, igual ao logo. O dourado aparece nos botões
principais e no dia ou horário escolhido, e o texto fica em branco quebrado. Fontes do Google:
**Bebas Neue** nos títulos (parecida com o "BARBEARIA"/"PADILHAS" do logo) e **Inter** no texto.
A versão final do logo, recortada sem a moldura e em boa resolução, ainda falta. A imagem atual
serve para o topo da página até chegar a definitiva. O contraste do dourado sobre o preto e do
texto preto sobre o botão dourado precisa passar no WCAG AA.

## 9. Em aberto, para perguntar ao dono (não bloqueia a construção)

- Serviços, preços e durações reais.
- Horário de cada um (inclusive sábado) e dias de folga.
- Logo em alta resolução, se ele tiver.
