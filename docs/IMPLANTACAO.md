# Colocando a agenda no ar (passo a passo)

Este guia é para quem não é programador. Tudo é feito pelo navegador, no painel do Cloudflare.
Reserve cerca de 40 minutos. Anote as senhas e chaves num lugar seguro (um gerenciador de senhas
ou um caderno guardado).

O que você vai precisar: uma conta no Cloudflare (gratuita) e a conta do GitHub onde está o
repositório `barbearia`.

## 1. Deixar o repositório privado

O código da agenda não precisa ficar aberto ao público.

1. No GitHub, abra o repositório `dalmolin-gabriel/barbearia`.
2. Clique em **Settings** (Configurações), a última aba do menu superior.
3. Role até o final, até **Danger Zone**, e clique em **Change visibility** -> **Change to private**.
4. Confirme digitando o nome do repositório.

Se o Cloudflare já estava conectado ao repositório, a conexão continua funcionando.

## 2. Conectar o Cloudflare ao repositório

O projeto (Worker) `barbearia` já existe no seu painel. Confira estas configurações em
**Workers & Pages -> barbearia -> Settings -> Build**:

- Repositório: `dalmolin-gabriel/barbearia`
- Branch de produção: `claude/eager-hopper-wjzgrg`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Se estiver criando do zero: **Workers & Pages -> Create -> Import a repository**, escolha o
repositório `barbearia`, a branch de produção acima e preencha os dois comandos.

Faça o primeiro deploy (a aba **Deployments** mostra o andamento). O banco de dados (D1,
chamado `padilhas`) é criado sozinho nesse deploy e as tabelas são montadas sozinhas no primeiro
acesso ao site. Não precisa fazer nada no banco.

Quando terminar, o endereço do site aparece no topo da página do projeto, parecido com
`https://barbearia.seu-usuario.workers.dev`. Anote.

## 3. Criar o Turnstile (proteção contra robôs no agendamento)

1. No painel do Cloudflare, menu lateral, abra **Turnstile** e clique em **Add widget**.
2. Nome: `Barbearia`.
3. Em **Hostname**, coloque o endereço do site sem `https://` (por exemplo
   `barbearia.seu-usuario.workers.dev`). Se for usar domínio próprio depois, adicione-o também.
4. Modo: **Managed**. Clique em **Create**.
5. A tela mostra duas chaves: a **Site Key** (pública) e a **Secret Key** (secreta). Deixe a
   página aberta ou copie as duas.

## 4. Gerar as chaves das notificações (VAPID)

São duas chaves que permitem o aviso de "novo agendamento" no celular.

- Em qualquer computador com o Node instalado, abra um terminal e rode:
  `npx web-push generate-vapid-keys`
- Sem terminal: procure por "VAPID key generator" num site de geradores online e gere um par.

Resultado: uma **Public Key** e uma **Private Key**.

**A Private Key é secreta.** Não envie por WhatsApp, e-mail nem coloque no GitHub.

## 5. Cadastrar as variáveis e os secrets

Vá em **Workers & Pages -> barbearia -> Settings -> Variables and Secrets** e clique em **Add**
para cada linha abaixo. O "Tipo" importa: use **Secret** para o que é secreto (depois de salvo,
o valor nunca mais aparece).

| Nome | Tipo | Valor |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Texto (Variable) | Site Key do passo 3 |
| `TURNSTILE_SECRET` | **Secret** | Secret Key do passo 3 |
| `VAPID_PUBLIC_KEY` | Texto (Variable) | Public Key do passo 4 |
| `VAPID_PRIVATE_KEY` | **Secret** | Private Key do passo 4 |

Depois de salvar, clique em **Deploy** (ou **Save and deploy**) se o painel pedir.

Sobre `VAPID_SUBJECT`: já está no arquivo `wrangler.jsonc` do projeto como
`mailto:contato@exemplo.com`. Para trocar pelo seu e-mail, edite essa linha no GitHub e salve (commit);
o Cloudflare publica de novo sozinho. É opcional para o funcionamento.

Importante: o projeto está configurado com `keep_vars` ligado, o que faz o Cloudflare manter as
variáveis cadastradas no painel a cada novo deploy. Por isso as chaves ficam só no painel e não
no código.

## 6. Criar a conta do dono

1. Abra `https://SEU-SITE/painel` (troque `SEU-SITE` pelo endereço do passo 2) e toque em
   **Cadastre-se** (o link só aparece enquanto não existe nenhuma conta).
2. Preencha **Nome**, **E-mail** e uma **Senha** de pelo menos 8 caracteres.
3. Toque em **Criar conta**. Você já entra no painel como dono.

O cadastro funciona **uma única vez**: depois que existe uma conta, o link **Cadastre-se** some e
o endereço `/painel/cadastro` mostra "Cadastro fechado". Atenção: enquanto ninguém criou a conta,
qualquer pessoa que souber o endereço consegue cadastrar o dono, então crie a conta logo depois do deploy.

## 7. Configurar a barbearia

Já dentro do painel:

1. **Serviços**: vieram três de exemplo (Corte, Barba, Corte + Barba) com preço 0. Ajuste os
   preços e as durações, e crie outros se quiser.
2. **Horários** (tela *Horários e folgas*): o padrão é segunda a sábado, das 9h às 19h, com almoço das 12h às 13h. Ajuste
   conforme a sua rotina.
3. **Equipe**: crie a conta do seu filho (e de outros barbeiros). Cada um entra com o próprio e-mail
   e tem a própria agenda. Passe a senha pessoalmente; peça para guardar.

## 8. Instalar o app no celular

O site funciona como um aplicativo. Faça isso no celular de quem usa o painel.

**Android (Chrome):**
1. Abra o endereço do painel no Chrome e entre.
2. Toque nos três pontinhos no canto -> **Instalar app** (ou **Adicionar à tela inicial**).
3. Abra pelo ícone novo na tela inicial.

**iPhone (Safari, obrigatório):**
1. Abra o endereço do painel no **Safari** (não funciona por outro navegador).
2. Toque no botão de compartilhar (quadrado com seta para cima).
3. Role e toque em **Adicionar à Tela de Início** -> **Adicionar**.
4. Abra pelo ícone na tela inicial. O iPhone precisa estar com iOS 16.4 ou mais novo.

## 9. Ativar as notificações

1. Com o app aberto (pelo ícone da tela inicial, no iPhone), entre no painel.
2. Dono: abra a aba **Equipe** e, no cartão **Notificações neste celular**, toque em
   **Ativar notificações**. Barbeiro: o mesmo cartão aparece no topo da tela **Hoje** enquanto as
   notificações estiverem desligadas. Aceite o aviso do celular.
3. Faça um agendamento de teste pelo link público para ver o aviso chegar.

Cada pessoa ativa nas próprias contas e celulares. Se um celular for trocado, ative de novo.

## 10. Testar antes de entregar

Antes de entregar o sistema para o dono de verdade, use-o à vontade com a sua conta: crie
serviços, faça agendamentos de teste, cadastre barbeiros, ative as notificações. Quando estiver
tudo certo, deixe o sistema limpo:

1. Entre no painel com a sua conta de dono e abra a aba **Equipe**.
2. Role até o cartão **Zerar sistema e entregar para o dono** (borda vermelha).
3. Digite a sua senha atual e a palavra `ZERAR`, e toque em **Zerar sistema**.

O que acontece: todas as contas (inclusive a sua), clientes, agendamentos, bloqueios de horário e
inscrições de notificação são apagados. Os **serviços, os preços e as configurações ficam**. Você
sai do painel e a tela de entrada volta a mostrar **Não tem conta? Cadastre-se**: o dono verdadeiro
abre o endereço do painel e cria a conta dele (passo 6). Depois, ele cadastra a equipe em **Equipe**.

Não dá para desfazer (só pelo Time Travel, no passo 12). Quem for instalar o app no celular e ativar
as notificações (passos 8 e 9) deve fazer isso depois da entrega, já com a conta do dono.

## 11. Se esquecer a senha do dono

O sistema não tem "esqueci minha senha" para o dono. Para redefinir, pelo painel do Cloudflare:

1. No seu computador, com o Node instalado e o repositório baixado, rode:
   `node scripts/hash-senha.mjs 'NOVA-SENHA-AQUI'`
   Vai imprimir uma linha começando com `pbkdf2$100000$...`. Copie essa linha inteira.
2. No painel: **Storage & Databases -> D1 SQL Database -> padilhas -> Console**.
3. Rode (troque o hash e o e-mail pelos seus):
   `UPDATE usuarios SET senha_hash = 'COLE-O-HASH-AQUI' WHERE usuario = 'seu-email@exemplo.com';`
4. Em seguida, para derrubar logins antigos: `DELETE FROM sessoes;`
5. Entre com a nova senha.

Para a conta de um barbeiro, o dono troca a senha direto na tela de Equipe.

## 12. Backups

O banco D1 tem o **Time Travel**, já ligado: o Cloudflare guarda o histórico dos últimos 30 dias e
permite voltar o banco a qualquer minuto desse período. Se algo for apagado por engano, no painel
abra o banco `padilhas` e procure por **Time Travel** (ou peça ajuda a quem mantém o sistema com o
comando `npx wrangler d1 time-travel restore padilhas --timestamp=...`).

## 13. Domínio próprio (opcional)

Se você tem um domínio (por exemplo `agenda.suabarbearia.com.br`) no Cloudflare:
**Workers & Pages -> barbearia -> Settings -> Domains & Routes -> Add -> Custom domain**.
Depois, volte ao Turnstile (passo 3) e adicione o novo domínio ao widget. Quem instalou o app
no celular precisa instalar de novo pelo endereço novo.

## Atualizações

Toda alteração salva na branch de produção do GitHub é publicada automaticamente pelo Cloudflare
(aba **Deployments**). Se algo der errado, o botão **Rollback** na mesma aba volta para a versão
anterior.
