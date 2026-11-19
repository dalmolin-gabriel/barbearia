# Agenda da Barbearia dos Padilhas: plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de agendamento online da Barbearia dos Padilhas, com página pública para o cliente marcar horário e painel (PWA) para o dono e os barbeiros, publicado no Cloudflare.

**Architecture:** Um único Cloudflare Worker serve a API (Hono, em `/api/*`) e os arquivos do front-end (React + Vite, via *Workers Static Assets*). O banco é D1. As regras de agenda (janela da semana, cálculo de vagas, telefone, mensagens) ficam em módulos puros em `src/shared/`, usados pelo servidor e pelo navegador. O servidor é a única barreira de segurança: toda rota confere sessão, papel e dono do dado.

**Tech Stack:** TypeScript estrito · Hono · React 18 + react-router-dom · Vite · Tailwind CSS · zod · Cloudflare Workers + D1 + Static Assets · Vitest com `@cloudflare/vitest-pool-workers` · Playwright (teste de ponta a ponta) · `@block65/webcrypto-web-push` (Web Push no Worker).

**Spec:** `docs/superpowers/specs/2026-11-19-agenda-barbearia-design.md`. Imagens aprovadas das telas: `docs/telas/*.png`. O vídeo é `docs/prototipo-padilhas.mp4`.

## Global Constraints

- Tudo em português do Brasil: interface, mensagens de erro, comentários e mensagens de commit.
- Fuso fixo `America/Sao_Paulo`. Instantes guardados em UTC, ISO 8601 com milissegundos (`Date.toISOString()`).
- Janela do cliente: **segunda a sábado**. A semana seguinte abre **sábado às 23:00** (config `abertura_dia=6`, `abertura_minuto=1380`). A regra vale só para o cliente.
- Grade de vagas: passo de **15 min**. Antecedência mínima do cliente: **30 min**.
- Situações do atendimento: `marcado`, `confirmado`, `atendido`, `cancelado`, `faltou`. Só `marcado` e `confirmado` ocupam a agenda.
- Preço e duração são **copiados** para o atendimento na hora de marcar.
- Faturamento = soma de `preco_centavos` dos atendimentos `atendido`.
- O cliente **precisa** escolher um barbeiro (não existe "sem preferência").
- Senha: PBKDF2-SHA256, **100000** iterações, sal aleatório de 16 bytes por usuário.
- Sessão: token aleatório de 32 bytes no cookie `sessao`, com `HttpOnly; Secure; SameSite=Strict; Path=/`. No banco fica só o SHA-256 do token. Validade de **30 dias**, renovada com o uso.
- Bloqueio de login: **5** senhas erradas seguidas travam o usuário por **15 min**.
- Público: nome com até **60** caracteres, celular brasileiro (DDD + 9 dígitos), no máximo **2** agendamentos futuros ativos por celular, Turnstile obrigatório e limite por IP de **10 agendamentos/hora** e **120 consultas/min**.
- SQL sempre com `prepare().bind()`. Proibido `dangerouslySetInnerHTML`.
- Segredos (`TURNSTILE_SECRET`, `VAPID_PRIVATE_KEY`, `CODIGO_INSTALACAO`) só como *secrets* do Cloudflare. Nunca no repositório.
- Cores: fundo `#0B0B0B`, superfície `#161616`, superfície alta `#222222`, borda `#2E2E2E`, dourado `#D0B848`, dourado escuro `#B8A030`, texto `#E8E6E0`, texto suave `#9C9A94`, verde `#5CC48A`, vermelho `#E0574E` e botão WhatsApp `#25A35F`. Fontes: **Bebas Neue** (títulos) e **Inter** (texto), servidas localmente.
- O visual segue `docs/telas/*.png` (são 12 telas).

## Review Focus

1. **Virada de dia no fuso.** Sábado 23:30 em Brasília já é domingo em UTC. O cliente deve ver a semana seguinte, e as datas exibidas precisam ser as de Brasília, nunca as de UTC. O teste fica na Task 3.
2. **Mesmo celular escrito de jeitos diferentes.** "(48) 99999-1234", "48999991234" e "+55 48 99999-1234" são o mesmo cliente para o limite de 2 agendamentos e para a ficha. O teste fica na Task 8.
3. **Toque duplo no "Confirmar".** Duas requisições iguais seguidas criam um só atendimento, e a segunda recebe 409 com "Esse horário acabou de ser reservado". O teste fica na Task 8.
4. **Barbeiro desativado.** Ele some da página pública, não consegue mais entrar (as sessões dele são apagadas), o público não consegue agendar com ele, e os atendimentos antigos continuam no resumo do dono. Os testes ficam nas Tasks 8 e 10.
5. **Preço mudado depois.** Mudar o preço de um serviço não altera atendimentos já marcados nem o faturamento do mês. O teste fica na Task 10.

---

## Estrutura de arquivos

```
wrangler.jsonc               Worker, D1 (binding DB), assets, vars
package.json  tsconfig.json  vite.config.ts  vitest.config.ts  tailwind.config.ts  postcss.config.js
index.html                   entrada do Vite
migrations/0001_inicial.sql
src/shared/                  regras puras (servidor e navegador)
  tempo.ts  janela.ts  vagas.ts  telefone.ts  mensagens.ts  tipos.ts
src/worker/
  index.ts                   app Hono + export default fetch
  env.ts                     tipo Env
  db/consultas.ts            funções de acesso ao banco usadas por mais de uma rota
  seguranca/senha.ts  sessao.ts  middleware.ts  limite.ts  turnstile.ts
  rotas/saude.ts primeiro-acesso.ts publico.ts auth.ts agenda.ts bloqueios.ts servicos.ts expediente.ts equipe.ts resumo.ts clientes.ts push.ts
  push/notificar.ts
src/app/                     React
  main.tsx  rotas.tsx  api.ts  estilos.css
  componentes/  (Botao, Folha, Logo, MenuInferior, Calendario, Carregando, Aviso)
  cliente/  Agendar.tsx  Pronto.tsx  Privacidade.tsx
  painel/   Login.tsx  Hoje.tsx  Atendimento.tsx  MarcarCliente.tsx  Bloquear.tsx  Lembretes.tsx
            Servicos.tsx  Horarios.tsx  Resumo.tsx  Equipe.tsx  Clientes.tsx  Notificacoes.tsx
public/  logo.png  icone-192.png  icone-512.png  manifest.webmanifest  sw.js  fontes/*.woff2
scripts/ hash-senha.mjs
test/    (testes do Worker, um arquivo por rota/módulo) · e2e/agendar.spec.ts
docs/IMPLANTACAO.md  docs/WHATSAPP.md
```

---

### Task 1: Esqueleto do projeto e build no Cloudflare

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `.gitignore`, `index.html`, `src/worker/index.ts`, `src/worker/env.ts`, `src/worker/rotas/saude.ts`, `src/app/main.tsx`, `test/saude.test.ts`

**Interfaces:**
- Produces: `app` (Hono) exportado de `src/worker/index.ts`, com `export default { fetch: app.fetch }`. O tipo `Env = { DB: D1Database; ASSETS: Fetcher; TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string; CODIGO_INSTALACAO?: string }`. Todas as variáveis podem estar vazias no primeiro deploy: o site precisa abrir mesmo assim.. Os testes usam `SELF.fetch` de `cloudflare:test`, e o `vitest.config.ts` aplica `migrations/` antes de cada arquivo (`readD1Migrations` + `applyD1Migrations` num `setupFiles`).

- [ ] **Step 1:** Crie `package.json` com os scripts `dev` (`vite` + `wrangler dev` via `@cloudflare/vite-plugin`), `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `e2e` (`playwright test --trace off`) e `deploy` (`npm run build && wrangler deploy`). Em `wrangler.jsonc`, coloque `main: "src/worker/index.ts"`, `compatibility_date: "2025-10-01"`, `compatibility_flags: ["nodejs_compat"]`, `assets: { directory: "./dist/client", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, `d1_databases: [{ binding: "DB", database_name: "padilhas", migrations_dir: "migrations" }]` (**sem `database_id`**: o `wrangler deploy` do Cloudflare cria o banco sozinho no primeiro deploy, que é feito pelo painel *Workers & Pages → Create → Import repository*; confira que o `wrangler` instalado é 4.x com provisionamento automático) e `vars` com `TURNSTILE_SITE_KEY` (a chave de teste `1x00000000000000000000AA`), `VAPID_PUBLIC_KEY` e `VAPID_SUBJECT`. O `.gitignore` cobre `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `.env*`, `test-results`, `.superpowers/` e `scripts/saida/`.
- [ ] **Step 2:** Escreva o teste que falha, `test/saude.test.ts`: `GET /api/saude` responde 200 com `{ ok: true }`.
- [ ] **Step 3:** Rode `npm test -- saude`. Deve falhar porque a rota não existe.
- [ ] **Step 4:** Crie a rota `GET /api/saude` em `src/worker/rotas/saude.ts` e monte-a em `index.ts`. O `main.tsx` renderiza `<p>Barbearia dos Padilhas</p>`.
- [ ] **Step 5:** `npm test` deve passar e `npm run build` deve gerar `dist/client/index.html`. Também `npx wrangler deploy --dry-run` deve terminar sem erro.
- [ ] **Step 6:** Commit com "Esqueleto: Worker Hono, Vite e testes".

### Task 2: Banco de dados (migração 0001)

**Files:**
- Create: `migrations/0001_inicial.sql`, `src/shared/tipos.ts`, `test/banco.test.ts`

**Interfaces:**
- Produces, as tabelas abaixo (ids são UUID em texto, instantes em ISO UTC, booleanos 0/1):
  - `usuarios(id, nome, usuario UNIQUE COLLATE NOCASE, senha_hash, papel CHECK IN ('dono','barbeiro'), ativo DEFAULT 1, criado_em)`
  - `sessoes(id PRIMARY KEY /* sha256 do token */, usuario_id REFERENCES usuarios ON DELETE CASCADE, expira_em)`
  - `tentativas_login(usuario PRIMARY KEY COLLATE NOCASE, falhas, bloqueado_ate)`
  - `servicos(id, nome, duracao_min CHECK > 0, preco_centavos CHECK >= 0, ativo DEFAULT 1, ordem)`
  - `expediente(usuario_id, dia_semana CHECK 0..6 /* 0=domingo */, aberto, inicio_min, fim_min, almoco_ini_min NULL, almoco_fim_min NULL, PRIMARY KEY(usuario_id, dia_semana))`
  - `bloqueios(id, usuario_id NULL /* NULL = barbearia toda */, inicio, fim, motivo, criado_por)`
  - `clientes(id, nome, telefone UNIQUE /* normalizado */, aceite_em, removido DEFAULT 0, criado_em)`
  - `atendimentos(id, cliente_id REFERENCES clientes, usuario_id REFERENCES usuarios, servicos_txt, duracao_min, preco_centavos, inicio, fim, status CHECK IN (...5 situações), origem CHECK IN ('online','painel'), criado_em, atualizado_em)` e o índice `(usuario_id, inicio)`
  - `push_inscricoes(id, usuario_id ON DELETE CASCADE, endpoint UNIQUE, p256dh, auth, criado_em)`
  - `limites(chave PRIMARY KEY, janela_inicio, contador)`
  - `config(chave PRIMARY KEY, valor)`, com as linhas iniciais `abertura_dia='6'`, `abertura_minuto='1380'`, `nome_barbearia='Barbearia dos Padilhas'`, `whatsapp_barbearia=''` e `endereco=''`
- `src/shared/tipos.ts`: os tipos `Papel`, `Situacao` e `Usuario`, `Servico`, `Atendimento` (com `cliente_nome`, `cliente_telefone`, `barbeiro_nome` nas consultas da agenda), `Expediente` e `Bloqueio`, espelhando as colunas.

- [ ] **Step 1:** Escreva o teste que falha, `test/banco.test.ts`. Ele confere que as 11 tabelas existem (`sqlite_master`) e que inserir um atendimento com `status='outro'` falha (CHECK).
- [ ] **Step 2:** Rode `npm test -- banco` e confira que falha.
- [ ] **Step 3:** Escreva a migração e os tipos. Acrescente `src/worker/db/migrar.ts` com `aplicarMigracoes(db): Promise<void>`: as migrações de `migrations/*.sql` entram no bundle (import `?raw` do Vite ou um módulo gerado) e ficam registradas na tabela `_migracoes(nome PRIMARY KEY, aplicada_em)`. O Worker chama essa função uma vez por instância, antes da primeira rota `/api/*`, para o banco criado pelo painel ficar pronto sem comando manual. Teste: chamar duas vezes não dá erro, e `_migracoes` tem 1 linha.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Banco: migração inicial".

### Task 3: Tempo e janela da semana

**Files:**
- Create: `src/shared/tempo.ts`, `src/shared/janela.ts`, `test/janela.test.ts`

**Interfaces:**
- Produces:
  - `partesLocais(instante: Date): { data: string /* AAAA-MM-DD */; minutos: number; diaSemana: number /* 0=dom */ }` (usa `Intl.DateTimeFormat` com `America/Sao_Paulo`)
  - `instanteUTC(data: string, minutos: number): Date` (horário de Brasília para UTC)
  - `somarDias(data: string, n: number): string` · `diaSemanaDe(data: string): number` · `hhmm(minutos: number): string`
  - `diasAbertosCliente(agora: Date, cfg: { aberturaDia: number; aberturaMinuto: number }): string[]`: as datas de segunda a sábado que o cliente pode marcar, em ordem, sem domingos e sem dias que já passaram.

- [ ] **Step 1:** Escreva os testes que falham. O instante entra em horário de Brasília, convertido com `instanteUTC`:
  - terça 2026-12-01 10:00 → `['2026-12-01','2026-12-02','2026-12-03','2026-12-04','2026-12-05']`
  - sábado 2026-12-05 22:59 → `['2026-12-05']`
  - sábado 2026-12-05 23:00 → `['2026-12-05','2026-12-07','2026-12-08','2026-12-09','2026-12-10','2026-12-11','2026-12-12']`
  - sábado 2026-12-05 23:30 (já é domingo em UTC) → a mesma lista do item anterior *(Review Focus 1)*
  - domingo 2026-12-06 09:00 → `['2026-12-07', … ,'2026-12-12']`
  - segunda 2026-12-07 08:00 → `['2026-12-07', … ,'2026-12-12']`
  - `partesLocais(new Date('2026-12-06T02:30:00.000Z'))` → `{ data: '2026-12-05', minutos: 1410, diaSemana: 6 }`
- [ ] **Step 2:** Rode `npm test -- janela` e confira que falha.
- [ ] **Step 3:** Implemente as funções. A janela vai de hoje até o sábado da semana atual. Se `agora` passou de sábado `aberturaMinuto` (ou se hoje é domingo), ela vai até o sábado seguinte. Tire os domingos.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Regra da semana: segunda a sábado, abre sábado 23h".

### Task 4: Cálculo de vagas, telefone e mensagens

**Files:**
- Create: `src/shared/vagas.ts`, `src/shared/telefone.ts`, `src/shared/mensagens.ts`, `test/vagas.test.ts`, `test/telefone.test.ts`

**Interfaces:**
- Produces:
  - `calcularVagas(p: { duracaoMin: number; expediente: { aberto: boolean; inicioMin: number; fimMin: number; almocoIniMin: number | null; almocoFimMin: number | null } | null; ocupados: { ini: number; fim: number }[] /* minutos do dia, atendimentos + bloqueios */; agoraMin: number | null /* null = dia futuro */; passo?: number /* 15 */; antecedenciaMin?: number /* 30 */ }): number[]`: os minutos de início em que o serviço cabe inteiro
  - `normalizarTelefone(entrada: string): string | null`: devolve `'55' + DDD + 9 dígitos` ou `null`
  - `formatarTelefone(norm: string): string`: `'(48) 99999-1234'`
  - `textoLembrete(a: { cliente: string; data: string; hora: string; servico: string; barbeiro: string; barbearia: string }): string`, com a frase do protótipo: `Fala, {cliente}! Lembrando do seu {servico} {quando} às {hora} com o {barbeiro} na {barbearia}. Posso confirmar? ✂️` (`quando` = "hoje", "amanhã" ou "dd/mm")
  - `linkWhatsapp(telNorm: string, texto: string): string` → `https://wa.me/{tel}?text={encodeURIComponent}`

- [ ] **Step 1:** Escreva os testes que falham:
  - Expediente 9:00–19:00 com almoço 12:00–13:00, duração 50, ocupado 14:00–14:50, dia futuro: inclui `540` (9:00) e `660` (11:00, termina 11:50), exclui `675` (11:15, entra no almoço), exclui `735` (12:15), inclui `780` (13:00, termina 13:50), exclui `795` (13:15, invadiria 14:00), inclui `890` (14:50), e o último é `1090` (18:10, termina 19:00).
  - `agoraMin = 600` (10:00): o primeiro é `630` (10:30, por causa da antecedência de 30).
  - `expediente = null` ou `aberto = false` → `[]`.
  - `normalizarTelefone('(48) 99999-1234') === normalizarTelefone('48999991234') === normalizarTelefone('+55 48 99999-1234') === '5548999991234'` *(Review Focus 2)*. `'4899991234'` (8 dígitos) e `'abc'` → `null`.
  - `textoLembrete` com a data de amanhã contém `"amanhã"`, e `linkWhatsapp` codifica os espaços como `%20`.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Cálculo de vagas, telefone e mensagens".

### Task 5: Senha, sessão e login

**Files:**
- Create: `src/worker/seguranca/senha.ts`, `src/worker/seguranca/sessao.ts`, `src/worker/rotas/auth.ts`, `test/auth.test.ts`, `test/ajuda.ts` (funções de teste)

**Interfaces:**
- Produces:
  - `gerarHashSenha(senha: string): Promise<string>` no formato `pbkdf2$100000$<sal b64>$<hash b64>` · `conferirSenha(senha: string, guardado: string): Promise<boolean>` (comparação em tempo constante)
  - `criarSessao(db, usuarioId): Promise<string /* token */>` · `lerSessao(db, token): Promise<Usuario | null>` (renova `expira_em` se faltar menos de 29 dias, e ignora usuário inativo) · `apagarSessao(db, token)` · `apagarSessoesDoUsuario(db, usuarioId)`
  - Rotas: `POST /api/auth/entrar {usuario, senha}` → 200 `{ usuario: {id,nome,papel} }` com `Set-Cookie`, 401 `{erro:'Usuário ou senha incorretos.'}`, 429 `{erro:'Muitas tentativas. Tente de novo em 15 minutos.'}` · `POST /api/auth/sair` → 204 · `GET /api/auth/eu` → 200 ou 401
  - `test/ajuda.ts`: `criarUsuario(papel, {usuario?, ativo?}) → {id, token}`, `req(caminho, {metodo, corpo, token})` (envia o `Origin` certo)

- [ ] **Step 1:** Escreva os testes que falham:
  - `conferirSenha('certa', await gerarHashSenha('certa'))` é verdadeiro, e com `'errada'` é falso. Dois hashes da mesma senha são diferentes.
  - Entrar com a senha certa: 200, cookie com `HttpOnly`, `Secure`, `SameSite=Strict`, e a tabela `sessoes` guarda um id **diferente** do token.
  - 5 senhas erradas seguidas → a 6ª tentativa (mesmo com a senha certa) dá 429. Depois de avançar `bloqueado_ate` no banco para o passado, entra.
  - Usuário com `ativo=0` → 401.
  - `sair` apaga a sessão, e `eu` passa a dar 401.
  - Sessão com `expira_em` no passado → 401.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente (Web Crypto: `crypto.subtle.deriveBits` PBKDF2 e `crypto.getRandomValues`). Responda 401 com a mesma mensagem para usuário inexistente e para senha errada, e confira a senha mesmo quando o usuário não existe, contra um hash fixo, para não vazar pelo tempo de resposta.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Login com senha protegida, sessão e bloqueio".

### Task 6: Middlewares de segurança

**Files:**
- Create: `src/worker/seguranca/middleware.ts`, `test/middleware.test.ts`
- Modify: `src/worker/index.ts`

**Interfaces:**
- Produces: `cabecalhos()` (em toda resposta: `Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Strict-Transport-Security: max-age=31536000`) · `conferirOrigem()` (POST, PUT, PATCH e DELETE em `/api/*` sem `Origin` igual à origem da própria requisição, `new URL(c.req.url).origin` → 403. Assim funciona no endereço `workers.dev` e num domínio próprio, sem configuração) · `exigirLogin()` (põe `c.var.usuario`, ou responde 401) · `exigirDono()` (403 se `papel !== 'dono'`) · `podeVerAgenda(usuario, usuarioIdAlvo): boolean`

- [ ] **Step 1:** Escreva os testes que falham: `/api/saude` traz os 4 cabeçalhos. `POST /api/auth/entrar` com `Origin: https://malicioso.com` → 403. Uma rota de teste montada com `exigirDono` responde 403 ao barbeiro, 200 ao dono e 401 sem cookie.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente e registre `cabecalhos` e `conferirOrigem` globalmente no `index.ts`.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Cabeçalhos de segurança, CSRF por Origin e permissões".

### Task 7: Limite de requisições e Turnstile

**Files:**
- Create: `src/worker/seguranca/limite.ts`, `src/worker/seguranca/turnstile.ts`, `test/limite.test.ts`

**Interfaces:**
- Produces: `consumirLimite(db, chave: string, maximo: number, janelaSeg: number): Promise<boolean>` (uma só instrução `INSERT … ON CONFLICT DO UPDATE` que zera o contador quando a janela vence; devolve `false` se passou do máximo) · `validarTurnstile(token: string, ip: string, segredo: string): Promise<boolean>` (POST para `https://challenges.cloudflare.com/turnstile/v0/siteverify`)

- [ ] **Step 1:** Escreva os testes que falham: 3 chamadas com `maximo=2` → `[true, true, false]`. Depois de mover `janela_inicio` para o passado → `true`. Com o `fetch` simulado (`fetchMock` de `cloudflare:test`): `success:true` → `true`, `success:false` → `false`, erro de rede → `false`.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Limite de requisições e verificação anti-robô".

### Task 8: API pública de agendamento

**Files:**
- Create: `src/worker/rotas/publico.ts`, `src/worker/db/consultas.ts`, `test/publico.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4 e 7.
- Produces:
  - `ocupadosDoDia(db, usuarioId, data): Promise<{ini,fim}[]>`: atendimentos `marcado`/`confirmado` e bloqueios do barbeiro **e** da barbearia toda (`usuario_id IS NULL`), cortados ao dia
  - `inserirSemConflito(db, a: NovoAtendimento): Promise<boolean>`: um único `INSERT INTO atendimentos (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM atendimentos WHERE usuario_id=? AND status IN ('marcado','confirmado') AND inicio < ?fim AND fim > ?inicio)`, que devolve `meta.changes === 1`
  - `GET /api/publico/info` → `{ barbearia: {nome, whatsapp, endereco}, servicos: [{id,nome,duracao_min,preco_centavos}], barbeiros: [{id,nome}], dias: string[], turnstileSiteKey }` (só os ativos)
  - `GET /api/publico/vagas?barbeiro=&data=&servicos=id1,id2` → `{ horarios: string[] /* 'HH:MM' */ }`. Data fora de `dias` → `{horarios: []}`
  - `POST /api/publico/agendar { barbeiro, servicos: string[], data, hora, nome, telefone, aceite: true, turnstile }` → 201 `{ id, inicio, fim, servicos_txt, preco_centavos, barbeiro }`. Erros: 400 dados inválidos · 403 anti-robô · 409 `"Esse horário acabou de ser reservado. Escolha outro."` · 422 `"Você já tem 2 horários marcados. Para marcar outro, fale com a barbearia."` · 429 limite
  - Os clientes são gravados por telefone normalizado (`INSERT … ON CONFLICT(telefone) DO UPDATE SET nome, aceite_em, removido=0`).

- [ ] **Step 1:** Escreva os testes que falham. Use o horário fixado em terça, 2026-12-01 10:00 BRT (`vi.setSystemTime`), um barbeiro ativo com expediente de ter a sáb, 9–19, almoço 12–13, os serviços Corte (30, R$ 40) e Barba (20, R$ 30) e o Turnstile simulado como aprovado:
  - `info` não lista barbeiro inativo nem serviço inativo, e `dias` é igual ao da Task 3.
  - `vagas` para 2026-12-01 começa em `"10:30"`. Para 2026-12-08 → `[]` (fora da janela). Para 2026-12-06 (domingo) → `[]`.
  - `agendar` válido → 201, preço 7000 e duração 50 para os dois serviços.
  - A mesma requisição duas vezes seguidas → a 1ª dá 201 e a 2ª dá 409, e só existe 1 linha em `atendimentos` *(Review Focus 3)*.
  - Duas requisições em paralelo (`Promise.all`) para o mesmo horário → exatamente um 201.
  - Um 3º agendamento do mesmo celular, escrito em outro formato → 422 *(Review Focus 2)*.
  - Agendar com barbeiro inativo → 400. Fora do expediente (20:00) → 409 ou 400. Sem `aceite` → 400. Nome com 61 caracteres → 400. Turnstile reprovado → 403.
  - A resposta de `vagas` nunca contém nome nem telefone (a JSON não tem `"nome"` fora de `info`).
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente. Validação com zod. Na ordem: limite por IP (`agendar:{ip}` 10/3600 e `consulta:{ip}` 120/60), Turnstile, dados, janela, expediente e vagas (a hora pedida precisa estar em `calcularVagas`), limite por celular, gravação do cliente e `inserirSemConflito`. Ao criar, chame `c.executionCtx.waitUntil(notificarNovoAgendamento(...))` (a função é stub até a Task 11).
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "API pública de agendamento com proteção contra conflito e abuso".

### Task 9: Agenda do painel (Hoje, atendimento, marcar, bloquear)

**Files:**
- Create: `src/worker/rotas/agenda.ts`, `src/worker/rotas/bloqueios.ts`, `test/agenda.test.ts`

**Interfaces:**
- Consumes: `exigirLogin`, `podeVerAgenda`, `inserirSemConflito`, `ocupadosDoDia`.
- Produces:
  - `GET /api/agenda?data=AAAA-MM-DD&quem=meus|todos` → `{ data, atendimentos: Atendimento[] /* ordenados por inicio */, bloqueios: Bloqueio[] }`. `quem=todos` só vale para o dono. O barbeiro sempre recebe só os dele.
  - `GET /api/atendimentos/:id` · `PATCH /api/atendimentos/:id/situacao {situacao}` · `PATCH /api/atendimentos/:id/remarcar {data, hora, usuarioId?}` · `POST /api/atendimentos {nome, telefone?, servicos, usuarioId?, data, hora, confirmarAvisos?: boolean}` → 201, ou 200 `{ avisos: ['fora_do_expediente'|'horario_bloqueado'|'no_passado'] }` quando há aviso e `confirmarAvisos` não é `true`, ou 409 se houver sobreposição
  - `POST /api/bloqueios {usuarioId?: string|null, data, horaIni?, horaFim?, diaInteiro?: boolean, motivo?}` · `DELETE /api/bloqueios/:id` · `GET /api/bloqueios?de=&ate=`. Só o dono pode usar `usuarioId=null` (barbearia toda) ou o id de outro barbeiro.

- [ ] **Step 1:** Escreva os testes que falham:
  - O barbeiro B pede `GET /api/agenda?quem=todos` → recebe só os atendimentos dele. O dono recebe todos.
  - O barbeiro B lê, muda a situação ou remarca um atendimento do barbeiro C → 404 (não revela que existe).
  - `situacao: 'cancelado'` libera o horário: `vagas` volta a mostrar a hora.
  - Marcar na mão às 20:00 (fora do expediente) sem `confirmarAvisos` → 200 com o aviso `fora_do_expediente` e nada gravado. Com `confirmarAvisos: true` → 201.
  - Marcar na mão por cima de um atendimento ativo → 409, mesmo com `confirmarAvisos`.
  - Marcar na mão 3 semanas à frente → 201 (sem regra da semana).
  - O dono fecha 2026-12-24 inteiro para a barbearia toda → `vagas` de todos os barbeiros nesse dia é `[]`. O barbeiro tentando `usuarioId: null` → 403.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente. As consultas do barbeiro sempre levam `AND usuario_id = ?usuario.id`.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Agenda do painel: hoje, atendimento, marcar e bloquear".

### Task 10: Rotas do dono (serviços, horários, equipe, resumo, clientes)

**Files:**
- Create: `src/worker/rotas/servicos.ts`, `expediente.ts`, `equipe.ts`, `resumo.ts`, `clientes.ts`, `test/dono.test.ts`

**Interfaces:**
- Produces (todas com `exigirDono`, exceto onde indicado):
  - `GET/POST /api/servicos`, `PUT /api/servicos/:id {nome, duracao_min, preco_centavos, ativo}` (não existe DELETE: serviço se desativa)
  - `GET /api/expediente?usuarioId=` (o barbeiro pode ler o próprio) · `PUT /api/expediente/:usuarioId` com os 7 dias
  - `GET /api/equipe` · `POST /api/equipe {nome, usuario, senha}` (cria `barbeiro` com expediente padrão de seg a sáb, 9–19, almoço 12–13) · `PUT /api/equipe/:id {nome?, ativo?, senha?}`. Desativar ou trocar a senha chama `apagarSessoesDoUsuario`. O dono não pode desativar a si mesmo.
  - `GET /api/resumo?mes=AAAA-MM` → `{ faturamento_centavos, atendidos, faltas, cancelados, porBarbeiro: [{id, nome, faturamento_centavos, atendidos}] }`. O mês é contado no fuso de Brasília.
  - `GET /api/clientes?busca=` (nome ou telefone, no máximo 20) · `DELETE /api/clientes/:id` → anonimiza: `nome='Cliente removido'`, `telefone=NULL`, `removido=1`. Os atendimentos continuam.
  - Senha nova com no mínimo **8** caracteres.

- [ ] **Step 1:** Escreva os testes que falham:
  - O barbeiro chama qualquer rota de escrita acima → 403.
  - Desativar o barbeiro B: a sessão dele passa a dar 401, `info` pública não o lista, e o resumo do mês continua contando os atendimentos dele *(Review Focus 4)*.
  - Mudar o preço do Corte de 4000 para 5000 depois de um atendimento `atendido` → o resumo continua com 4000 *(Review Focus 5)*.
  - O resumo de 2026-12 conta um atendimento das 23:30 de 30/11 em Brasília (que é 01/12 em UTC) em **novembro**.
  - Apagar um cliente → a busca não o encontra pelo telefone antigo, e o atendimento continua com `cliente_nome = 'Cliente removido'`.
  - Criar uma equipe com `usuario` repetido → 409.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Rotas do dono: serviços, horários, equipe, resumo e clientes".

### Task 11: Notificações (Web Push)

**Files:**
- Create: `src/worker/rotas/push.ts`, `src/worker/push/notificar.ts`, `test/push.test.ts`

**Interfaces:**
- Produces: `GET /api/push/chave` → `{ chave: env.VAPID_PUBLIC_KEY }` · `POST /api/push/inscrever {endpoint, keys:{p256dh,auth}}` (logado, upsert por endpoint) · `DELETE /api/push/inscrever {endpoint}` · `notificarNovoAgendamento(env, atendimentoId): Promise<void>`. Ela manda para as inscrições do barbeiro do atendimento e de todos os usuários `dono` ativos, com título `"Novo horário marcado"`, corpo `"{cliente} · {servico} · {ddd dd/mm} às {HH:MM} · com {barbeiro}"` e `data.url = "/painel?atendimento={id}"`. Resposta 404 ou 410 do serviço de push apaga a inscrição.

- [ ] **Step 1:** Escreva os testes que falham (com `fetchMock`): o agendamento público dispara 2 envios (o barbeiro e o dono) e nenhum para outro barbeiro. A resposta 410 apaga a inscrição. Um erro no envio não muda a resposta 201 do agendamento.
- [ ] **Step 2:** Rode e confira que falha.
- [ ] **Step 3:** Implemente com `@block65/webcrypto-web-push` (confira a versão estável mais recente e a API `buildPushPayload`). Substitua o stub da Task 8.
- [ ] **Step 4:** `npm test` deve passar.
- [ ] **Step 5:** Commit com "Notificações no celular para agendamentos novos".

### Task 12: Base do front-end e PWA

**Files:**
- Create: `src/app/rotas.tsx`, `src/app/api.ts`, `src/app/estilos.css`, `tailwind.config.ts`, `postcss.config.js`, `src/app/componentes/*`, `public/manifest.webmanifest`, `public/sw.js`, `public/logo.png` (de `docs/marca/logo-instagram.png`), `public/icone-192.png`, `public/icone-512.png`, `public/fontes/*` (Bebas Neue 400 e Inter 400/500/600/700, de `@fontsource`)
- Modify: `src/app/main.tsx`, `index.html`

**Interfaces:**
- Produces: as rotas `/` (Agendar), `/pronto/:id`, `/privacidade`, `/painel/entrar`, `/painel` (Hoje), `/painel/lembretes`, `/painel/servicos`, `/painel/horarios`, `/painel/resumo`, `/painel/equipe`, `/painel/clientes` · `api<T>(caminho, {metodo?, corpo?}): Promise<T>`, que lança `ErroApi {status, mensagem}` e redireciona para `/painel/entrar` em 401 dentro do painel · os componentes `Botao` (variantes `principal`, `secundario`, `whatsapp`), `Folha` (sobe de baixo), `Logo {tamanho}`, `MenuInferior {ativo}` (esconde Serviços/Resumo/Equipe para quem não é dono), `Calendario {mes, diasHabilitados, selecionado, riscados, aoEscolher}`, `Carregando` e `Aviso` · `sw.js` trata `push` (mostra a notificação com o ícone) e `notificationclick` (abre `data.url`)

- [ ] **Step 1:** Configure o Tailwind com as cores do Global Constraints como tokens (`fundo`, `superficie`, `superficie-alta`, `borda`, `ouro`, `ouro-escuro`, `texto`, `texto-suave`, `ok`, `erro`, `zap`) e as fontes `bebas` e `inter`.
- [ ] **Step 2:** Implemente os componentes e as rotas (páginas vazias com o título). No manifesto: `name` "Barbearia dos Padilhas", `short_name` "Padilhas", `start_url` "/painel", `display` "standalone" e `background_color`/`theme_color` `#0B0B0B`.
- [ ] **Step 3:** `npm run build` deve terminar sem erro. Abra `npm run dev` e confira que `/` e `/painel/entrar` mostram o logo e a fonte Bebas.
- [ ] **Step 4:** Commit com "Base do front-end, tema da barbearia e PWA".

### Task 13: Telas do cliente

**Files:**
- Create: `src/app/cliente/Agendar.tsx`, `Pronto.tsx`, `Privacidade.tsx`

**Interfaces:**
- Consumes: `/api/publico/*` (Task 8) e os componentes da Task 12.

- [ ] **Step 1:** **Agendar**, igual a `docs/telas/01`, `02` e `03`: (1) serviços com marcação múltipla, total de duração e preço e "Continuar"; (2) "Escolha o horário": resumo com "Alterar", barbeiros (escolha obrigatória), `Calendario` com só os `dias` habilitados e domingos riscados, o aviso "Agenda aberta até {sábado dd/mm}. A próxima semana (seg a sáb) abre no sábado às 23h." e os horários agrupados em Manhã (<12h), Tarde (12–18h) e Noite (≥18h); (3) `Folha` "Confirme seu horário" com nome, celular com máscara, caixinha de aceite com link para `/privacidade`, o widget Turnstile (script `https://challenges.cloudflare.com/turnstile/v0/api.js`) e "Confirmar horário". No 409, mostre a mensagem, feche a folha e recarregue as vagas.
- [ ] **Step 2:** **Pronto**, igual a `docs/telas/04`: o resumo vem do estado da navegação. "Adicionar à minha agenda" baixa um `.ics` gerado no navegador (`DTSTART`/`DTEND` em UTC, `SUMMARY` "{serviço} · Barbearia dos Padilhas"). "Falar no WhatsApp" abre `wa.me/{whatsapp da barbearia}`.
- [ ] **Step 3:** **Privacidade**: o texto curto da spec (quem guarda, para quê, prazo de 2 anos após o último atendimento e como pedir exclusão pelo WhatsApp), com o aviso de que é um modelo.
- [ ] **Step 4:** Crie `e2e/agendar.spec.ts` (Playwright em `wrangler dev`, com a chave de teste do Turnstile que sempre aprova, `1x0000000000000000000000000000000AA`): escolhe Corte, o barbeiro, o primeiro dia habilitado e o primeiro horário, preenche "João Teste" e "48999991234", aceita e confirma → aparece "Pronto, tá marcado!". Rode `npm run e2e` e confirme que passa.
- [ ] **Step 5:** Commit com "Telas do cliente: agendar, pronto e privacidade".

### Task 14: Telas do barbeiro

**Files:**
- Create: `src/app/painel/Login.tsx`, `Hoje.tsx`, `Atendimento.tsx`, `MarcarCliente.tsx`, `Bloquear.tsx`, `Lembretes.tsx`, `Notificacoes.tsx`

**Interfaces:**
- Consumes: as Tasks 5, 9 e 11 e `textoLembrete`/`linkWhatsapp` (Task 4).

- [ ] **Step 1:** **Login**: o logo, usuário, senha e "Entrar", mostrando a mensagem de erro da API.
- [ ] **Step 2:** **Hoje**, igual a `docs/telas/06`: título "Hoje · dd/mm" (ou o dia escolhido), "{n} clientes · {k} atendidos", chave Meus/Todos (só para o dono), o cartão do **próximo cliente** (o primeiro `marcado`/`confirmado` com `fim` > agora: hora grande, nome, serviço · duração, "em X min" e os botões **Chegou**, que muda para `atendido`, e **WhatsApp**, que abre `linkWhatsapp` com `textoLembrete`), a lista **Depois** (hora · nome · serviço, e o barbeiro no "Todos"), **Já atendidos** apagados no fim (cancelados e faltas não aparecem), os botões Ontem/Hoje/Amanhã, a data que abre o `Calendario`, "+ Marcar cliente" e "Bloquear". Atualize sozinho a cada 60 s e quando a aba volta ao foco.
- [ ] **Step 3:** **Atendimento**, uma `Folha` igual a `docs/telas/07`: Chegou/Atendido, Cliente confirmou, Remarcar (abre `MarcarCliente` em modo remarcar), Faltou e Cancelar (com confirmação), e "Mandar lembrete"/"Abrir conversa".
- [ ] **Step 4:** **MarcarCliente** e **Bloquear**: formulários simples. Quando a API devolve `avisos`, mostre "Fora do seu horário / Horário bloqueado / Data no passado. Marcar mesmo assim?" e reenvie com `confirmarAvisos: true`.
- [ ] **Step 5:** **Lembretes**, igual a `docs/telas/08`: os clientes de amanhã (o seletor alterna Hoje/Amanhã), cada um com o botão WhatsApp que marca "✓ Enviado" localmente (`localStorage` com a chave `lembrete:{id}`).
- [ ] **Step 6:** **Notificacoes**: um botão "Ativar notificações" (`Notification.requestPermission`, `pushManager.subscribe` com a chave de `/api/push/chave`). No iPhone sem `standalone`, mostre "No iPhone: toque em Compartilhar → Adicionar à Tela de Início e abra pelo ícone". Fica dentro de Equipe para o dono e no topo de Hoje para o barbeiro, enquanto não estiver ativado.
- [ ] **Step 7:** Acrescente ao `e2e`: o dono entra, vê o agendamento do teste da Task 13 em "Hoje", toca "Chegou" e ele vai para "Já atendidos". Rode `npm run e2e`.
- [ ] **Step 8:** Commit com "Painel do barbeiro: hoje, atendimento, marcar, bloquear e lembretes".

### Task 15: Telas do dono

**Files:**
- Create: `src/app/painel/Servicos.tsx`, `Horarios.tsx`, `Resumo.tsx`, `Equipe.tsx`, `Clientes.tsx`

**Interfaces:**
- Consumes: Task 10 e `/api/bloqueios` (Task 9).

- [ ] **Step 1:** **Serviços**, igual a `docs/telas/09`: lista com Editar, edição com −/+ (duração de 5 em 5 min, preço de R$ 5 em R$ 5, e também com digitação), Salvar, Desativar e "+ Novo serviço".
- [ ] **Step 2:** **Horários e folgas**, igual a `docs/telas/10`: seletor do barbeiro, os 7 dias com a chave aberto/fechado, início, fim e almoço, e a lista "Dias fechados e folgas" (`/api/bloqueios` com `diaInteiro` ou a partir de um horário, mostrando "Barbearia toda"/"Só {nome}") com "+ Fechar um dia" e a remoção. O barbeiro vê só os próprios dados, sem editar o expediente.
- [ ] **Step 3:** **Resumo**, igual a `docs/telas/11`, com setas de mês.
- [ ] **Step 4:** **Equipe**, igual a `docs/telas/12`: lista, cadastrar barbeiro (nome, usuário e senha provisória com no mínimo 8), trocar senha, desativar/reativar, `Notificacoes` e o link "Clientes e privacidade".
- [ ] **Step 5:** **Clientes**: busca e "Apagar dados" com a confirmação "Os dados de {nome} serão apagados. O histórico de atendimentos continua, sem nome e telefone."
- [ ] **Step 6:** `npm run build` e `npm test` devem passar. Confira cada tela no celular (`npm run dev`, Playwright num iPhone 13 emulado) contra `docs/telas/*.png`.
- [ ] **Step 7:** Commit com "Telas do dono: serviços, horários e folgas, resumo, equipe e clientes".

### Task 16: Primeiro acesso, implantação e revisão de segurança

**Files:**
- Create: `src/worker/rotas/primeiro-acesso.ts`, `src/app/painel/PrimeiroAcesso.tsx`, `docs/IMPLANTACAO.md`, `docs/WHATSAPP.md`, `test/primeiro-acesso.test.ts`

**Interfaces:**
- Produces: `GET /api/primeiro-acesso` → `{ disponivel: boolean }` (verdadeiro só se **não existe nenhum usuário**) · `POST /api/primeiro-acesso {codigo, nome, usuario, senha}`: só funciona se não houver usuário **e** `codigo` for igual ao secret `CODIGO_INSTALACAO` (comparação em tempo constante, limite de 5 tentativas/hora por IP). Cria o `dono` com expediente seg–sáb, 9–19, almoço 12–13, e os serviços de exemplo (Corte 30 min, Barba 20 min, Corte + Barba 50 min, preço 0 até o dono ajustar). Depois de existir um usuário, sempre 404. A tela `/painel/primeiro-acesso` tem os 4 campos. `Env` ganha `CODIGO_INSTALACAO: string`. Senha esquecida do dono: a mesma rota não serve, e `docs/IMPLANTACAO.md` explica como redefinir pelo console D1 do painel do Cloudflare com o hash gerado por `node scripts/hash-senha.mjs` (crie esse script de uma linha que usa `gerarHashSenha`).

- [ ] **Step 1:** Escreva os testes que falham: sem usuários e com o código certo → 201 e o login funciona. Com o código errado → 403. Segunda chamada, já com o dono criado → 404. Sem `CODIGO_INSTALACAO` configurado → 404.
- [ ] **Step 2:** Implemente. `npm test` deve passar.
- [ ] **Step 3:** Escreva `docs/IMPLANTACAO.md`, passo a passo para leigo **pelo painel do Cloudflare**: deixar o repositório privado; *Workers & Pages → Create → Import a repository* com o repositório `barbearia`, a branch de produção, Build command `npm run build` e Deploy command `npx wrangler deploy`; depois do primeiro deploy, em *Settings → Variables and Secrets*, criar os secrets `CODIGO_INSTALACAO`, `TURNSTILE_SECRET` e `VAPID_PRIVATE_KEY` e as variáveis `TURNSTILE_SITE_KEY`, `VAPID_PUBLIC_KEY` e `VAPID_SUBJECT`; criar o Turnstile em *Turnstile → Add widget*; gerar as chaves VAPID (em qualquer site/terminal: `npx web-push generate-vapid-keys`); abrir `/painel/primeiro-acesso` e criar o dono; Time Travel do D1 (já vem ligado); domínio próprio (opcional).
- [ ] **Step 4:** Escreva `docs/WHATSAPP.md`: configurar a mensagem de saudação e a de ausência no WhatsApp Business, com o texto "Olá! 👋 Agende seu horário na Barbearia dos Padilhas: {link}", a limitação dos 14 dias e como pôr o link na bio do Instagram.
- [ ] **Step 5:** Rode a revisão de segurança (skill `security-review`) sobre a branch inteira e corrija o que ela apontar, com teste.
- [ ] **Step 6:** `npm test`, `npm run e2e` e `npm run build` devem passar.
- [ ] **Step 7:** Commit com "Primeiro acesso, implantação e revisão de segurança".
