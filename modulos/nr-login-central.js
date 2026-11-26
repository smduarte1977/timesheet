// NeoRadar · Login único no DECK e no EMISSIONS (cópia idêntica nos dois sistemas; fonte em neoradar-hub/modulos).
//
// A conta e a senha valem para todos os sistemas que a pessoa tem no controle de acessos:
// - Já entrou no hub/POB (mesmo navegador, em neoradarsystems.com)? Abre o módulo direto, sem outro login.
// - Entrou pelo formulário do módulo? Usa o mesmo e-mail e a mesma senha do login central.
// - Saiu? Sai de todos.
// A função entrar-central (no projeto do módulo) confere o token no login central e abre a sessão local.

export const CENTRAL = {
  url: 'https://labdcefxptaclytorzoy.supabase.co',
  chave: 'sb_publishable_6cNRRCvQ0UZZremOXdXg9A_AXEFvJHT', // chave pública
  hub: 'https://neoradarsystems.com',
};
const FUNCAO_ENTRAR = `${CENTRAL.url}/functions/v1/neoradar-entrar`;
const FUNCAO_SENHA = `${CENTRAL.url}/functions/v1/senha-provisoria`;

const marcaChave = (modulo) => `nr-ponte-${modulo}`;
const lerMarca = (modulo) => { try { return localStorage.getItem(marcaChave(modulo)) || ''; } catch { return ''; } };
const gravarMarca = (modulo, email) => {
  try { if (email) localStorage.setItem(marcaChave(modulo), email); else localStorage.removeItem(marcaChave(modulo)); } catch { /* sem armazenamento */ }
};
const mesmoEmail = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// cfg = { central, local, modulo: 'deck'|'emissions', localUrl, localChave }
async function ponte(cfg, token, acao) {
  try {
    const r = await fetch(`${cfg.localUrl}/functions/v1/entrar-central`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.localChave, Authorization: `Bearer ${cfg.localChave}` },
      body: JSON.stringify({ acao, token }),
    });
    const dados = await r.json().catch(() => ({}));
    return r.ok && dados.ok ? dados : { ok: false, erro: dados.erro || 'indisponivel' };
  } catch { return { ok: false, erro: 'indisponivel' }; }
}

// Configuração para o módulo senha-provisoria.js falar com o login central.
export const cfgSenhaCentral = (central) => ({ sb: central, url: FUNCAO_SENHA, chave: CENTRAL.chave });

// Ao abrir a página. Devolve { session } (sessão local pronta) ou { session: null, motivo }.
// motivo: 'sem_central' (não está no login central), 'sem_acesso' (sem este módulo), 'senha_provisoria', 'indisponivel'.
export async function entrarAutomatico(cfg) {
  const { central, local, modulo } = cfg;
  const [{ data: dc }, { data: dl }] = await Promise.all([central.auth.getSession(), local.auth.getSession()]);
  const cs = dc?.session || null;
  let ls = dl?.session || null;
  const marca = lerMarca(modulo);

  if (!cs) {
    // Entrou pelo login único e depois saiu do hub: sai daqui também.
    if (ls && marca && mesmoEmail(marca, ls.user.email)) {
      await local.auth.signOut({ scope: 'local' }).catch(() => {});
      gravarMarca(modulo, '');
      ls = null;
    }
    return { session: ls, motivo: ls ? null : 'sem_central' };
  }

  // Mesma pessoa já com sessão aqui: só confirma o nível no controle de acessos.
  if (ls && mesmoEmail(ls.user.email, cs.user.email)) {
    const r = await ponte(cfg, cs.access_token, 'sincronizar');
    if (!r.ok && r.erro === 'sem_acesso') {
      await local.auth.signOut({ scope: 'local' }).catch(() => {});
      gravarMarca(modulo, '');
      return { session: null, motivo: 'sem_acesso' };
    }
    gravarMarca(modulo, ls.user.email);
    return { session: ls, motivo: null };
  }

  // Outra pessoa (ou ninguém) aqui: abre a sessão de quem está no login central.
  const r = await ponte(cfg, cs.access_token, 'entrar');
  if (!r.ok) return { session: ls, motivo: r.erro };
  if (ls) await local.auth.signOut({ scope: 'local' }).catch(() => {});
  const { data, error } = await local.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' });
  if (error || !data?.session) return { session: null, motivo: 'indisponivel' };
  gravarMarca(modulo, data.session.user.email);
  return { session: data.session, motivo: null };
}

// Formulário de entrada do módulo: mesmo e-mail e mesma senha do login central.
// senhaMod = módulo senha-provisoria.js (para a troca obrigatória da senha provisória).
// Devolve { ok: true, session } ou { ok: false, erro: 'incorreto'|'sem_acesso'|'cancelado'|'indisponivel' }.
export async function entrarComSenha(cfg, email, senha, senhaMod) {
  const { central, local, modulo } = cfg;
  email = String(email || '').trim().toLowerCase();
  let { data, error } = await central.auth.signInWithPassword({ email, password: senha });
  // Ainda sem conta central? A função do hub confere a senha do Deck e cria a conta central com ela.
  if (error && /invalid login/i.test(error.message) && await chamarEntrar({ acao: 'senha', email, senha })) {
    ({ data, error } = await central.auth.signInWithPassword({ email, password: senha }));
  }
  if (error) {
    // Último recurso: senha antiga só deste sistema (contas que ainda não estão no controle de acessos).
    const antigo = await local.auth.signInWithPassword({ email, password: senha });
    if (!antigo.error && antigo.data?.session) { gravarMarca(modulo, ''); return { ok: true, session: antigo.data.session }; }
    return { ok: false, erro: /invalid login/i.test(error.message) ? 'incorreto' : 'indisponivel' };
  }
  // Senha provisória do login central: cria a senha pessoal agora, sem sair da tela.
  if (senhaMod && senhaMod.situacaoSenha(data.user) !== 'normal') {
    const ok = await senhaMod.verificarSenhaProvisoria(cfgSenhaCentral(central), data.user);
    if (!ok) { await central.auth.signOut({ scope: 'local' }).catch(() => {}); return { ok: false, erro: 'cancelado' }; }
  }
  const r = await entrarAutomatico(cfg);
  if (!r.session) return { ok: false, erro: r.motivo || 'indisponivel' };
  return { ok: true, session: r.session };
}

// "Esqueci minha senha": vale para todos os sistemas (login central). Avisa o administrador e manda o link.
export async function esqueciSenha(cfg, email, sistema, senhaMod) {
  email = String(email || '').trim().toLowerCase();
  await chamarEntrar({ acao: 'link', email }); // cria a conta central de quem está liberado e ainda não tem
  // O e-mail "Redefinir senha" sai do login central, no modelo NeoRadar, de contato@neoradarsystems.com
  // (o alerta ao administrador vai junto). Sem o Resend ligado, usa o envio antigo.
  try {
    const r = await fetch(FUNCAO_SENHA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CENTRAL.chave, Authorization: `Bearer ${CENTRAL.chave}` },
      body: JSON.stringify({ acao: 'recuperar', email, sistema }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok && d.envio !== 'sem_chave') return true;
  } catch { /* sem conexão: tenta o envio antigo */ }
  if (senhaMod) senhaMod.pedirAjudaSenha(cfgSenhaCentral(cfg.central), email, sistema);
  const { error } = await cfg.central.auth.resetPasswordForEmail(email, { redirectTo: `${CENTRAL.hub}/` });
  return !error;
}

// Sair: sai do módulo e do login central (de todos os sistemas neste navegador).
export async function sairDeTudo(cfg) {
  gravarMarca(cfg.modulo, '');
  // Primeiro o login central (a página pode recarregar quando a sessão local sai).
  await cfg.central.auth.signOut({ scope: 'local' }).catch(() => {});
  await cfg.local.auth.signOut({ scope: 'local' }).catch(() => {});
}

async function chamarEntrar(corpo) {
  try {
    const r = await fetch(FUNCAO_ENTRAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CENTRAL.chave, Authorization: `Bearer ${CENTRAL.chave}` },
      body: JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    return r.ok && dados.ok === true;
  } catch { return false; }
}
