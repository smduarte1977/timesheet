import { createClient } from '../lib/@supabase/supabase-js@2.49.4/index.esm.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { entrarAutomatico, entrarComSenha, esqueciSenha, sairDeTudo, CENTRAL } from '../modulos/nr-login-central.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);            // Supabase do Timesheet
const central = createClient(CENTRAL.url, CENTRAL.chave);        // Login central (hub/POB)
const cfg = { central, local: sb, modulo: 'timesheet', localUrl: SUPABASE_URL, localChave: SUPABASE_KEY };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const estado = { email: null, master: false, view: 'inicio', cad: 'empresas', empresas: [], msg: '' };

const SECOES = [
  ['inicio', 'Início'],
  ['marcacoes', 'Marcações'],
  ['conferencia', 'Conferência de jornadas'],
  ['escalas', 'Escalas e lançamentos'],
  ['fechamento', 'Prévia e exportação'],
  ['relatorios', 'Relatórios'],
  ['cadastros', 'Cadastros'],
];

/* ---------- Autenticação (só as contas master do NeoRadar) ---------- */

async function boot() {
  const { session, motivo } = await entrarAutomatico(cfg);
  if (!session) return telaLogin(motivo);
  estado.email = session.user.email;
  const { data } = await sb.from('perfis').select('papel').eq('email', estado.email).maybeSingle();
  estado.master = !!(data && data.papel === 'master');
  $('perfil-selo').textContent = estado.master ? 'Master · acesso total' : 'Acesso restrito';
  $('perfil-selo').className = 'b' + (estado.master ? ' ok' : ' al');
  montarNav();
  render();
}

function telaLogin(motivo) {
  $('nav').innerHTML = '';
  $('perfil-selo').textContent = 'Entrar';
  $('perfil-selo').className = 'b';
  const aviso = motivo === 'sem_acesso'
    ? 'Seu login não tem acesso ao Timesheet nesta unidade.'
    : 'Entre com o mesmo e-mail e senha do NeoRadar Systems.';
  $('conteudo').innerHTML = `
    <div class="card" style="max-width:420px;margin:40px auto">
      <div class="hd"><div class="lbl">NeoRadar | Timesheet</div><h2 style="font-size:32px">Entrar</h2><p>${esc(aviso)}</p></div>
      <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">E-mail
        <input id="in-email" type="email" placeholder="voce@neoradarsystems.com" autocomplete="email"></label>
      <label class="field lbl" style="display:flex;flex-direction:column;gap:6px;margin-top:10px">Senha
        <input id="in-senha" type="password" autocomplete="current-password"></label>
      <p id="login-erro" class="lbl" style="color:#ff8a83;display:none;margin:10px 0 0;text-transform:none;letter-spacing:0"></p>
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center">
        <button class="btn g" id="btn-entrar">Entrar</button>
        <button class="btn" id="btn-esqueci" style="min-height:44px">Esqueci a senha</button>
      </div>
      <p class="lbl" style="text-transform:none;letter-spacing:0;color:var(--text-muted);margin:14px 0 0">Dica: abra o Timesheet pelo menu do NeoRadar Systems já logado, que ele entra sozinho.</p>
    </div>`;
  $('btn-entrar').onclick = entrar;
  $('in-senha').onkeydown = (e) => { if (e.key === 'Enter') entrar(); };
  $('btn-esqueci').onclick = esqueci;
}

function loginErro(txt) { const e = $('login-erro'); if (e) { e.textContent = txt; e.style.display = 'block'; } }

async function entrar() {
  const email = ($('in-email').value || '').trim().toLowerCase();
  const senha = $('in-senha').value || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !senha) return loginErro('Informe e-mail e senha.');
  const btn = $('btn-entrar'); btn.disabled = true; btn.textContent = 'Entrando…';
  const r = await entrarComSenha(cfg, email, senha);
  if (!r.ok) {
    btn.disabled = false; btn.textContent = 'Entrar';
    return loginErro(r.erro === 'incorreto' ? 'E-mail ou senha incorretos.' : r.erro === 'sem_acesso' ? 'Seu login não tem acesso ao Timesheet.' : 'Não foi possível entrar agora.');
  }
  boot();
}

async function esqueci() {
  const email = ($('in-email').value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return loginErro('Informe seu e-mail primeiro.');
  await esqueciSenha(cfg, email, 'Timesheet');
  loginErro('Se este e-mail tiver acesso, enviamos um link para redefinir a senha.');
}

async function sair() { await sairDeTudo(cfg); estado.master = false; estado.email = null; telaLogin(); }

/* ---------- Navegação ---------- */

function montarNav() {
  const nav = $('nav');
  nav.innerHTML = '';
  for (const [v, label] of SECOES) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = estado.view === v ? 'on' : '';
    b.onclick = () => { estado.view = v; estado.msg = ''; montarNav(); render(); };
    nav.appendChild(b);
  }
  const sb2 = document.createElement('button');
  sb2.textContent = 'Sair';
  sb2.style.marginTop = '16px';
  sb2.onclick = sair;
  nav.appendChild(sb2);
}

function cab(label, titulo, sub) {
  return `<div class="hd"><div class="lbl">${esc(label)}</div><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
}
function metric(label, n) { return `<div class="card metric"><div class="lbl">${esc(label)}</div><div class="n">${n}</div></div>`; }
function bannerMsg() { return estado.msg ? `<div class="banner"><span class="b ok">OK</span><span>${esc(estado.msg)}</span></div>` : ''; }
function semMaster() {
  return cab('Timesheet', 'Acesso restrito') + `<div class="card"><div class="empty"><h2>Sem acesso</h2><p>Seu login (${esc(estado.email)}) não tem perfil de master neste módulo. Fale com o administrador.</p><button class="btn" id="b-sair">Sair</button></div></div>`;
}

async function contar(tabela) {
  const { count } = await sb.from(tabela).select('*', { count: 'exact', head: true });
  return count || 0;
}

async function render() {
  const c = $('conteudo');
  const v = estado.view;
  if (!estado.master) { c.innerHTML = semMaster(); const b = $('b-sair'); if (b) b.onclick = sair; return; }

  if (v === 'inicio') {
    const [emp, col, disp, marc] = await Promise.all([contar('empresas'), contar('colaboradores'), contar('dispositivos'), contar('marcacoes')]);
    c.innerHTML = cab('Quinta · 26/11/2026', 'Visão do dia', 'Ambiente novo. Comece cadastrando a primeira empresa e os colaboradores.')
      + `<div class="banner"><span class="b ok">Master</span><span>Acesso total e ilimitado a esta unidade e a todos os dados.</span></div>`
      + `<div class="grid">${metric('Empresas', emp)}${metric('Colaboradores', col)}${metric('Dispositivos', disp)}${metric('Marcações', marc)}</div>`;
    return;
  }

  if (v === 'cadastros') return renderCadastros();

  const textos = {
    marcacoes: ['Frequência', 'Marcações', 'As batidas originais aparecem aqui conforme chegam dos totens, apps e relógios, ou por importação. Nenhuma marcação ainda.'],
    conferencia: ['Frequência', 'Conferência de jornadas', 'Previsto e realizado lado a lado, ajuste manual, virada de dia e memória de cálculo. Em construção.'],
    escalas: ['Frequência', 'Escalas e lançamentos', 'Folgas, férias, atestados, trocas e embarques. Em construção.'],
    fechamento: ['Fechamento', 'Prévia e exportação', 'Totais por matrícula e rubrica antes da folha. Em construção.'],
    relatorios: ['Relatórios', 'Relatórios do sistema', 'Espelho de ponto, saldos, intervalos, absenteísmo e trilha de auditoria. Em construção.'],
  };
  const [lbl, tit, txt] = textos[v] || ['', 'Timesheet', ''];
  c.innerHTML = cab(lbl, tit) + `<div class="card"><div class="empty"><h2>${esc(tit)}</h2><p>${esc(txt)}</p></div></div>`;
}

/* ---------- Cadastros ---------- */

async function renderCadastros() {
  const c = $('conteudo');
  const abas = [['empresas', 'Empresas'], ['colaboradores', 'Colaboradores'], ['estabelecimentos', 'Unidades'], ['dispositivos', 'Dispositivos']];
  const barra = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">${abas.map(([k, l]) => `<button class="btn${estado.cad === k ? ' p' : ''}" data-cad="${k}">${l}</button>`).join('')}</div>`;
  c.innerHTML = cab('Cadastros', 'Base da empresa', 'Comece pela empresa; o resto se liga a ela.') + bannerMsg() + barra + '<div id="cad-corpo"></div>';
  c.querySelectorAll('[data-cad]').forEach((b) => { b.onclick = () => { estado.cad = b.dataset.cad; estado.msg = ''; renderCadastros(); }; });
  const corpo = $('cad-corpo');

  const { data: empresas } = await sb.from('empresas').select('id,nome,ambiente,ativa').order('nome');
  estado.empresas = empresas || [];

  if (estado.cad === 'empresas') return cadEmpresas(corpo);
  if (!estado.empresas.length) {
    corpo.innerHTML = `<div class="card"><div class="empty"><h2>Cadastre uma empresa primeiro</h2><p>Colaboradores, unidades e dispositivos pertencem a uma empresa.</p><button class="btn p" id="ir-empresa">Ir para Empresas</button></div></div>`;
    $('ir-empresa').onclick = () => { estado.cad = 'empresas'; renderCadastros(); };
    return;
  }
  if (estado.cad === 'colaboradores') return cadColaboradores(corpo);
  if (estado.cad === 'estabelecimentos') return cadEstabelecimentos(corpo);
  if (estado.cad === 'dispositivos') return cadDispositivos(corpo);
}

function tabela(cols, linhas) {
  return `<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead><tr>${cols.map((h) => `<th style="text-align:left;padding:10px 12px;font:400 11px/16px var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${linhas || `<tr><td style="padding:16px;color:var(--text-muted)" colspan="${cols.length}">Nenhum registro ainda.</td></tr>`}</tbody></table></div>`;
}
const td = (s) => `<td style="padding:10px 12px;border-top:1px solid var(--line)">${esc(s)}</td>`;

function selEmpresa(id) {
  return `<select id="f-empresa">${estado.empresas.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select>`;
}

/* Empresas */
function cadEmpresas(corpo) {
  const linhas = estado.empresas.map((e) => `<tr>${td(e.nome)}${td(e.ambiente)}${td(e.ativa ? 'Ativa' : 'Inativa')}</tr>`).join('');
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:16px"><h3 style="font-size:20px;margin-bottom:12px">Nova empresa</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px;flex:1 1 220px">Nome<input id="f-nome" placeholder="Nome da empresa"></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Ambiente<select id="f-amb"><option value="misto">Onshore e offshore</option><option value="offshore">Offshore</option><option value="onshore">Onshore</option></select></label>
        <button class="btn g" id="f-salvar">Salvar</button>
      </div><p id="f-erro" class="lbl" style="color:#ff8a83;display:none;margin:10px 0 0"></p>
    </div>
    ${tabela(['Empresa', 'Ambiente', 'Situação'], linhas)}`;
  $('f-salvar').onclick = async () => {
    const nome = $('f-nome').value.trim(), ambiente = $('f-amb').value;
    if (nome.length < 2) return erroCampo('Informe o nome da empresa.');
    const { error } = await sb.from('empresas').insert({ nome, ambiente });
    if (error) return erroCampo('Não foi possível salvar: ' + error.message);
    estado.msg = 'Empresa cadastrada.'; renderCadastros();
  };
}

/* Colaboradores + importação CSV */
async function cadColaboradores(corpo) {
  const { data } = await sb.from('colaboradores').select('matricula,nome,cargo,ambiente,embarca,empresa_id').order('nome').limit(500);
  const nomeEmp = Object.fromEntries(estado.empresas.map((e) => [e.id, e.nome]));
  const linhas = (data || []).map((x) => `<tr>${td(x.matricula)}${td(x.nome)}${td(x.cargo || '—')}${td(x.ambiente + (x.embarca ? ' · embarca' : ''))}${td(nomeEmp[x.empresa_id] || '')}</tr>`).join('');
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:16px"><h3 style="font-size:20px;margin-bottom:12px">Novo colaborador</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Empresa${selEmpresa()}</label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Matrícula<input id="f-mat" style="width:110px"></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px;flex:1 1 200px">Nome<input id="f-nome"></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Cargo<input id="f-cargo" style="width:140px"></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Ambiente<select id="f-amb"><option value="onshore">Onshore</option><option value="offshore">Offshore</option></select></label>
        <label style="display:flex;align-items:center;gap:6px;font-size:14px;min-height:40px"><input type="checkbox" id="f-emb" style="width:18px;height:18px">Embarca</label>
        <button class="btn g" id="f-salvar">Salvar</button>
      </div><p id="f-erro" class="lbl" style="color:#ff8a83;display:none;margin:10px 0 0"></p>
    </div>
    <div class="card" style="margin-bottom:16px"><h3 style="font-size:20px;margin-bottom:8px">Importar por CSV</h3>
      <p class="lbl" style="text-transform:none;letter-spacing:0;color:var(--text-muted);margin:0 0 10px">Colunas: <span class="mono">matricula,nome,cargo,ambiente,embarca</span> (ambiente = onshore/offshore; embarca = sim/nao).</p>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Empresa dos dados${selEmpresa()}</label>
        <input type="file" id="f-csv" accept=".csv,text/csv">
        <button class="btn" id="f-baixar">Baixar modelo CSV</button>
      </div><p id="csv-msg" class="lbl" style="text-transform:none;letter-spacing:0;display:none;margin:10px 0 0"></p>
    </div>
    ${tabela(['Matrícula', 'Nome', 'Cargo', 'Ambiente', 'Empresa'], linhas)}`;
  $('f-salvar').onclick = async () => {
    const empresa_id = $('f-empresa').value, matricula = $('f-mat').value.trim(), nome = $('f-nome').value.trim();
    if (!matricula || nome.length < 2) return erroCampo('Matrícula e nome são obrigatórios.');
    const { error } = await sb.from('colaboradores').insert({ empresa_id, matricula, nome, cargo: $('f-cargo').value.trim() || null, ambiente: $('f-amb').value, embarca: $('f-emb').checked });
    if (error) return erroCampo('Não foi possível salvar: ' + error.message);
    estado.msg = 'Colaborador cadastrado.'; renderCadastros();
  };
  $('f-baixar').onclick = baixarModelo;
  $('f-csv').onchange = (e) => importarCsv(e.target.files[0]);
}

function baixarModelo() {
  const csv = 'matricula,nome,cargo,ambiente,embarca\n1001,Nome Exemplo,Marinheiro,offshore,nao\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'modelo-colaboradores.csv'; a.click();
}

async function importarCsv(file) {
  if (!file) return;
  const msg = $('csv-msg'); msg.style.display = 'block'; msg.style.color = 'var(--text-muted)'; msg.textContent = 'Lendo arquivo…';
  const empresa_id = $('f-empresa').value;
  const texto = await file.text();
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) { msg.textContent = 'Arquivo vazio.'; return; }
  const head = linhas[0].toLowerCase().split(',').map((s) => s.trim());
  const col = (n) => head.indexOf(n);
  if (col('matricula') < 0 || col('nome') < 0) { msg.style.color = '#ff8a83'; msg.textContent = 'O CSV precisa ter as colunas matricula e nome.'; return; }
  const regs = [];
  for (let i = 1; i < linhas.length; i++) {
    const p = linhas[i].split(',').map((s) => s.trim());
    if (!p[col('matricula')] || !p[col('nome')]) continue;
    const amb = (col('ambiente') >= 0 ? p[col('ambiente')] : 'onshore').toLowerCase();
    const emb = (col('embarca') >= 0 ? p[col('embarca')] : '').toLowerCase();
    regs.push({ empresa_id, matricula: p[col('matricula')], nome: p[col('nome')], cargo: col('cargo') >= 0 ? (p[col('cargo')] || null) : null, ambiente: amb === 'offshore' ? 'offshore' : 'onshore', embarca: ['sim', 's', 'true', '1'].includes(emb) });
  }
  if (!regs.length) { msg.style.color = '#ff8a83'; msg.textContent = 'Nenhuma linha válida encontrada.'; return; }
  msg.textContent = `Importando ${regs.length} colaboradores…`;
  const { error } = await sb.from('colaboradores').upsert(regs, { onConflict: 'empresa_id,matricula' });
  if (error) { msg.style.color = '#ff8a83'; msg.textContent = 'Erro ao importar: ' + error.message; return; }
  estado.msg = `${regs.length} colaboradores importados.`; renderCadastros();
}

/* Estabelecimentos */
async function cadEstabelecimentos(corpo) {
  const { data } = await sb.from('estabelecimentos').select('nome,tipo,identificacao,empresa_id').order('nome');
  const nomeEmp = Object.fromEntries(estado.empresas.map((e) => [e.id, e.nome]));
  const linhas = (data || []).map((x) => `<tr>${td(x.nome)}${td(x.tipo)}${td(x.identificacao || '—')}${td(nomeEmp[x.empresa_id] || '')}</tr>`).join('');
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:16px"><h3 style="font-size:20px;margin-bottom:12px">Nova unidade / embarcação</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Empresa${selEmpresa()}</label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px;flex:1 1 200px">Nome<input id="f-nome"></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Tipo<select id="f-tipo"><option value="embarcacao">Embarcação</option><option value="plataforma">Plataforma</option><option value="base">Base</option><option value="unidade">Unidade</option></select></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Identificação<input id="f-id" style="width:120px" placeholder="P-62"></label>
        <button class="btn g" id="f-salvar">Salvar</button>
      </div><p id="f-erro" class="lbl" style="color:#ff8a83;display:none;margin:10px 0 0"></p>
    </div>
    ${tabela(['Nome', 'Tipo', 'Identificação', 'Empresa'], linhas)}`;
  $('f-salvar').onclick = async () => {
    const nome = $('f-nome').value.trim();
    if (nome.length < 2) return erroCampo('Informe o nome.');
    const { error } = await sb.from('estabelecimentos').insert({ empresa_id: $('f-empresa').value, nome, tipo: $('f-tipo').value, identificacao: $('f-id').value.trim() || null });
    if (error) return erroCampo('Não foi possível salvar: ' + error.message);
    estado.msg = 'Unidade cadastrada.'; renderCadastros();
  };
}

/* Dispositivos */
async function cadDispositivos(corpo) {
  const { data } = await sb.from('dispositivos').select('tipo,identificacao,ativo,empresa_id').order('identificacao');
  const nomeEmp = Object.fromEntries(estado.empresas.map((e) => [e.id, e.nome]));
  const linhas = (data || []).map((x) => `<tr>${td(x.tipo)}${td(x.identificacao)}${td(x.ativo ? 'Ativo' : 'Inativo')}${td(nomeEmp[x.empresa_id] || '')}</tr>`).join('');
  corpo.innerHTML = `
    <div class="card" style="margin-bottom:16px"><h3 style="font-size:20px;margin-bottom:12px">Novo dispositivo</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Empresa${selEmpresa()}</label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px">Tipo<select id="f-tipo"><option value="totem">Totem</option><option value="relogio">Relógio (AFD)</option><option value="app">App</option></select></label>
        <label class="field lbl" style="display:flex;flex-direction:column;gap:6px;flex:1 1 180px">Identificação<input id="f-id" placeholder="TOT-01"></label>
        <button class="btn g" id="f-salvar">Salvar</button>
      </div><p id="f-erro" class="lbl" style="color:#ff8a83;display:none;margin:10px 0 0"></p>
    </div>
    ${tabela(['Tipo', 'Identificação', 'Situação', 'Empresa'], linhas)}`;
  $('f-salvar').onclick = async () => {
    const identificacao = $('f-id').value.trim();
    if (!identificacao) return erroCampo('Informe a identificação.');
    const { error } = await sb.from('dispositivos').insert({ empresa_id: $('f-empresa').value, tipo: $('f-tipo').value, identificacao });
    if (error) return erroCampo('Não foi possível salvar: ' + error.message);
    estado.msg = 'Dispositivo cadastrado.'; renderCadastros();
  };
}

function erroCampo(txt) { const e = $('f-erro'); if (e) { e.textContent = txt; e.style.display = 'block'; } }

boot().catch((e) => { $('conteudo').innerHTML = cab('Timesheet', 'Não foi possível carregar') + `<div class="card"><p>${esc(e.message || e)}</p></div>`; });
