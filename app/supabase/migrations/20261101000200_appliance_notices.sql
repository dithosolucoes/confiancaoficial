-- Avisos de preço por tipo de aparelho, editáveis pelo gestor.
--
-- Antes: o formulário do cliente tinha os avisos escritos no código, comparando
-- o nome do aparelho (Vistoria, Esquentador reparação, etc.). Agora o aviso
-- vem da própria linha de appliance_types. Se a linha não tiver aviso, o
-- formulário mostra o aviso genérico (sem valor fixo no texto).
--
-- Semente: os 4 avisos que estavam no código passam para as linhas certas,
-- com o mesmo texto em português, para o cliente ver o mesmo que via antes.

ALTER TABLE public.appliance_types
  ADD COLUMN IF NOT EXISTS notice_title TEXT,
  ADD COLUMN IF NOT EXISTS notice_message TEXT;

UPDATE public.appliance_types
SET notice_title = 'Valor do serviço: 85,00€',
    notice_message = $$O valor cobrado é da deslocação do técnico, análise do equipamento e reparação sem a necessidade de substituição de Peça. Os nossos valores já incluem IVA.$$
WHERE name = 'Esquentador reparação';

UPDATE public.appliance_types
SET notice_title = 'Valor do serviço: 75,00€',
    notice_message = $$O valor cobrado é referente a deslocação do técnico, instalação do equipamento e caso seja necessário algum suporte específico, será incluído na aplicação para uma prévia aprovação.$$
WHERE name = 'Esquentador instalação';

UPDATE public.appliance_types
SET notice_title = 'Valor do serviço: 85,00€',
    notice_message = $$Na vistoria técnica será realizada uma análise completa do equipamento ou estrutura e será emitido um laudo técnico descriminando o motivo do dano ou avaria apresentada. Os nossos valores já incluem IVA.$$
WHERE name = 'Vistoria técnica / Seguradora';

UPDATE public.appliance_types
SET notice_title = 'Valor do serviço: 55,00€',
    notice_message = $$O valor cobrado é referente a deslocação do técnico, instalação do equipamento e caso seja necessário algum suporte específico, será incluído na aplicação para uma prévia aprovação.$$
WHERE name = 'Termocumulador instalação ( até 100 Lt )';
