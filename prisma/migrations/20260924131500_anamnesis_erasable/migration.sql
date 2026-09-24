-- O guard de append-only da anamnese também barrava DELETE, e isso torna impossível
-- apagar uma paciente: o cascade de `patients` dispara triggers de linha, então o
-- pedido de apagamento (LGPD) morreria aqui.
--
-- O que a versionagem exige é que uma resposta nunca seja reescrita — responder de novo
-- grava uma linha nova. Apagar junto com a paciente é outra coisa, e tem de continuar
-- possível.
DROP TRIGGER IF EXISTS anamneses_no_update ON "anamneses";
DROP FUNCTION IF EXISTS app_anamneses_append_only();

CREATE OR REPLACE FUNCTION app_anamneses_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'anamneses nao aceita UPDATE: responder de novo grava uma linha nova';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER anamneses_no_update
  BEFORE UPDATE ON "anamneses"
  FOR EACH ROW EXECUTE FUNCTION app_anamneses_no_update();
