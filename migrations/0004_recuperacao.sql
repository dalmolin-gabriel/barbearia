-- Código de recuperação do dono ("Esqueci minha senha"): guardamos só o hash PBKDF2 do código
-- e a data em que foi criado. O código vale uma vez; ao usar, `recuperacao_hash` volta a NULL.
-- ALTER TABLE não é idempotente: o Worker pula esta migração se a coluna já existe
-- (src/worker/db/migrar.ts), por exemplo quando o vitest já a aplicou.

ALTER TABLE usuarios ADD COLUMN recuperacao_hash TEXT;

ALTER TABLE usuarios ADD COLUMN recuperacao_criado_em TEXT;
