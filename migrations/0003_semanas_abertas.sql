-- Quantas semanas (seg a sáb) ficam abertas para o cliente ao mesmo tempo. Padrão: 1.
-- Idempotente (INSERT OR IGNORE): vale tanto no applyD1Migrations quanto na auto-migração do Worker.

INSERT OR IGNORE INTO config (chave, valor) VALUES ('semanas_abertas', '1');
