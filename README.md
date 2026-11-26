# NeoRadar | TIMESHEET

Ponto eletrônico onshore e offshore da família NeoRadar Systems. Módulo aberto em
`neoradarsystems.com/<unidade>/timesheet` pelo login central.

- Site estático, sem build (mesmo padrão do `neoradar-hub`). Para testar: `npx serve -s .`
- Supabase dedicado: projeto `neoradar-timesheet` (`dmbxtgawdwmajizfzqzi`), região sa-east-1 (São Paulo, LGPD).
  Separado dos outros módulos por causa da biometria facial e da folha.
- Chave **publicável** no front-end (`js/config.js`); quem protege os dados são as políticas RLS.
- Schema em `supabase/migrations/` (schema `ts`): empresas, estabelecimentos, colaboradores,
  dispositivos, biometria_facial, marcações, ajustes, regras_jornada, jornadas.

## Acesso
- **Master vê tudo, sempre** — acesso total e ilimitado à unidade e a todos os dados.
  Nunca é bloqueado por "nenhuma empresa cadastrada"; com o banco vazio, vê a tela para
  cadastrar a primeira empresa.
- Biometria facial e geolocalização ficam restritas ao master e fora das exportações de folha.
- RLS ativo em todas as tabelas; sem sessão de master autenticada, nenhum dado é lido.

## Pendente (próximos passos)
- Ligação do **login central** (ponte `entrar-central`) para o master autenticar e cadastrar.
- Telas de empregado (app), supervisor e RH/DP ligadas ao banco.
- Integrações de folha e arquivos legais (AFD/AEJ).
