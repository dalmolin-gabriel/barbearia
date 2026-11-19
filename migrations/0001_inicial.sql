-- Migração inicial. Ids são UUID em texto, instantes são ISO UTC com milissegundos
-- e booleanos são 0/1. Escrita de forma idempotente (IF NOT EXISTS / OR IGNORE)
-- porque o Worker também aplica este arquivo sozinho (src/worker/db/migrar.ts).

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('dono', 'barbeiro')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY, -- sha256 do token
  usuario_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tentativas_login (
  usuario TEXT PRIMARY KEY COLLATE NOCASE,
  falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT
);

CREATE TABLE IF NOT EXISTS servicos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  duracao_min INTEGER NOT NULL CHECK (duracao_min > 0),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expediente (
  usuario_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo
  aberto INTEGER NOT NULL DEFAULT 0,
  inicio_min INTEGER NOT NULL,
  fim_min INTEGER NOT NULL,
  almoco_ini_min INTEGER,
  almoco_fim_min INTEGER,
  PRIMARY KEY (usuario_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS bloqueios (
  id TEXT PRIMARY KEY,
  usuario_id TEXT REFERENCES usuarios (id) ON DELETE CASCADE, -- NULL = barbearia toda
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  criado_por TEXT NOT NULL REFERENCES usuarios (id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT UNIQUE, -- normalizado; NULL quando o barbeiro marca sem telefone ou após anonimizar
  aceite_em TEXT,
  removido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes (id),
  usuario_id TEXT NOT NULL REFERENCES usuarios (id),
  servicos_txt TEXT NOT NULL,
  duracao_min INTEGER NOT NULL CHECK (duracao_min > 0),
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'marcado' CHECK (status IN ('marcado', 'confirmado', 'atendido', 'cancelado', 'faltou')),
  origem TEXT NOT NULL CHECK (origem IN ('online', 'painel')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_usuario_inicio ON atendimentos (usuario_id, inicio);

CREATE TABLE IF NOT EXISTS push_inscricoes (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS limites (
  chave TEXT PRIMARY KEY,
  janela_inicio TEXT NOT NULL,
  contador INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT OR IGNORE INTO config (chave, valor) VALUES
  ('abertura_dia', '6'),
  ('abertura_minuto', '1380'),
  ('nome_barbearia', 'Barbearia dos Padilhas'),
  ('whatsapp_barbearia', ''),
  ('endereco', '');
