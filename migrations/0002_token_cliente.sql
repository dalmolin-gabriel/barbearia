-- Link secreto do cliente: guardamos só o SHA-256 (hex) do token entregue no agendamento.
-- ALTER TABLE não é idempotente: o Worker pula esta migração se a coluna já existe
-- (src/worker/db/migrar.ts), por exemplo quando o vitest já a aplicou.

ALTER TABLE atendimentos ADD COLUMN token_cliente_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_atendimentos_token_cliente ON atendimentos (token_cliente_hash);
