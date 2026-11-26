import { createClient } from '/lib/@supabase/supabase-js@2.49.4/index.esm.js';
import { SUPABASE_URL, SUPABASE_KEY, UNIDADE_PADRAO } from '/js/config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const estado = { master: false, email: null, view: 'inicio', empresas: [] };

const SECOES = [
  ['inicio', 'Início'],
  ['marcacoes', 'Marcações'],
  ['conferencia', 'Conferência de jornadas'],
  ['escalas', 'Escalas e lançamentos'],
  ['fechamento', 'Prévia e exportação'],
  ['relatorios', 'Relatórios'],
  ['cadastros', 'Cadastros'],
  ['empresas', 'Empresas e contratos'],
];

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  estado.email = session?.user?.email || null;
  // Master: a politica RLS so deixa o master ler ts.perfis. Se vier a linha, e master.
  if (estado.email) {
    const { data } = await sb.from('perfis').select('email,papel').eq('email', estado.email).maybeSingle();
    estado.master = !!(data && data.papel === 'master');
  }
  $('perfil-selo').textContent = estado.master ? 'Master · acesso total' : (estado.email ? 'Acesso restrito' : 'Login pendente');
  $('perfil-selo').className = 'b' + (estado.master ? ' ok' : '');
  montarNav();
  render();
}

function montarNav() {
  const nav = $('nav');
  nav.innerHTML = '';
  for (const [v, label] of SECOES) {
    if (v === 'empresas' && !estado.master) continue;
    const b = document.createElement('button');
    b.textContent = label;
    b.className = estado.view === v ? 'on' : '';
    b.onclick = () => { estado.view = v; montarNav(); render(); };
    nav.appendChild(b);
  }
}

function bannerAcesso() {
  if (estado.master) return '<div class="banner"><span class="b ok">Master</span><span>Acesso total e ilimitado a esta unidade e a todos os dados.</span></div>';
  if (estado.email) return '<div class="banner warn"><span class="b">Acesso restrito</span><span>Seu login não tem perfil de master neste módulo.</span></div>';
  return '<div class="banner warn"><span class="b">Login pendente</span><span>Este módulo é aberto pelo login central do NeoRadar Systems. A ligação do login central está sendo conectada; por enquanto a tela abre em modo leitura.</span></div>';
}

function cabecalho(label, titulo, sub) {
  return `<div class="hd"><div class="lbl">${esc(label)}</div><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
}

function vazio(icone, titulo, texto, botao) {
  return `<div class="card"><div class="empty"><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${botao || ''}</div></div>`;
}

async function contar(tabela) {
  const { count } = await sb.from(tabela).select('*', { count: 'exact', head: true });
  return count || 0;
}

async function render() {
  const c = $('conteudo');
  const v = estado.view;

  if (v === 'inicio') {
    const [emp, col, marc, jor] = await Promise.all([
      contar('empresas'), contar('colaboradores'), contar('marcacoes'), contar('jornadas'),
    ]);
    c.innerHTML = cabecalho('Quinta · 26/11/2026', 'Visão do dia', 'Ambiente novo. Cadastre a primeira empresa para começar a operar.')
      + bannerAcesso()
      + `<div class="grid">
        ${metric('Empresas', emp)}
        ${metric('Colaboradores', col)}
        ${metric('Marcações', marc)}
        ${metric('Jornadas a conferir', jor)}
      </div>`;
    return;
  }

  if (v === 'empresas') {
    const { data } = await sb.from('empresas').select('id,nome,ambiente,ativa').order('nome');
    estado.empresas = data || [];
    const botao = estado.master
      ? '<button class="btn p" id="btn-nova-empresa">Cadastrar empresa</button>'
      : '';
    let corpo;
    if (!estado.empresas.length) {
      corpo = vazio('', 'Nenhuma empresa cadastrada', 'Cadastre a primeira empresa desta unidade. Depois vêm colaboradores, escalas e regras de jornada.', botao);
    } else {
      corpo = `<div class="card" style="padding:0"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left;padding:12px">Empresa</th><th style="text-align:left;padding:12px">Ambiente</th><th style="text-align:left;padding:12px">Situação</th></tr></thead>
        <tbody>${estado.empresas.map((e) => `<tr><td style="padding:12px;border-top:1px solid var(--line)">${esc(e.nome)}</td><td style="padding:12px;border-top:1px solid var(--line)">${esc(e.ambiente)}</td><td style="padding:12px;border-top:1px solid var(--line)"><span class="b ${e.ativa ? 'ok' : ''}">${e.ativa ? 'Ativa' : 'Inativa'}</span></td></tr>`).join('')}</tbody>
      </table></div><div style="margin-top:16px">${botao}</div>`;
    }
    c.innerHTML = cabecalho('NeoRadar · nível master', 'Empresas e contratos', 'Só o master cadastra, encerra e acompanha empresas.') + bannerAcesso() + corpo;
    const b = $('btn-nova-empresa');
    if (b) b.onclick = abrirDialogEmpresa;
    return;
  }

  const textos = {
    marcacoes: ['Frequência', 'Marcações', 'As batidas originais aparecem aqui conforme chegam dos totens, apps e relógios. Nenhuma marcação ainda.'],
    conferencia: ['Frequência', 'Conferência de jornadas', 'Previsto e realizado lado a lado, com ajuste manual, virada de dia e memória de cálculo. Sem jornadas para conferir ainda.'],
    escalas: ['Frequência', 'Escalas e lançamentos', 'Folgas, férias, atestados, trocas de escala e embarques. Nenhum lançamento ainda.'],
    fechamento: ['Fechamento', 'Prévia e exportação', 'Totais por matrícula e rubrica antes de enviar para a folha. Sem competência para fechar ainda.'],
    relatorios: ['Relatórios', 'Relatórios do sistema', 'Espelho de ponto, saldos, intervalos, absenteísmo e trilha de auditoria. Disponíveis quando houver dados.'],
    cadastros: ['Cadastros', 'Base da empresa', 'Colaboradores, cargos, escalas, dispositivos, regras de ACT/CCT e perímetros. Cadastre a primeira empresa para habilitar.'],
  };
  const [lbl, tit, txt] = textos[v] || ['', 'Timesheet', ''];
  c.innerHTML = cabecalho(lbl, tit) + bannerAcesso() + vazio('', tit, txt);
}

function metric(label, n) {
  return `<div class="card metric"><div class="lbl">${esc(label)}</div><div class="n">${n}</div></div>`;
}

function abrirDialogEmpresa() {
  const dlg = $('dlg-empresa');
  const form = dlg.querySelector('form');
  const erro = $('dlg-erro');
  erro.style.display = 'none';
  form.onsubmit = async (ev) => {
    const btn = ev.submitter;
    if (!btn || btn.value !== 'ok') return; // cancelar
    ev.preventDefault();
    const nome = form.nome.value.trim();
    const ambiente = form.ambiente.value;
    if (nome.length < 2) { erro.textContent = 'Informe o nome da empresa.'; erro.style.display = 'block'; return; }
    const { error } = await sb.from('empresas').insert({ nome, ambiente });
    if (error) {
      erro.textContent = 'Não foi possível salvar: ' + (error.message || 'verifique o login central.');
      erro.style.display = 'block';
      return;
    }
    dlg.close();
    render();
  };
  dlg.showModal();
}

iniciar().catch((e) => {
  $('conteudo').innerHTML = cabecalho('Timesheet', 'Não foi possível carregar') + `<div class="card"><p>${esc(e.message || e)}</p></div>`;
});
