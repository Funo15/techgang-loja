// ============================================================
// TECHGANG — ADMIN (frontend)
// Cada página tem data-adm-page no <body>; os dados vêm de
// /api/admin/* (cookie de sessão httpOnly trata da auth).
// ============================================================

(() => {
  const pagina = document.body.dataset.admPage;

  // ---------- Helpers ----------
  function euro(centimos) {
    return '€' + (centimos / 100).toFixed(2).replace('.', ',');
  }
  function dataPT(iso) {
    return new Date(iso.replace(' ', 'T') + 'Z')
      .toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  const NOMES_ESTADO = {
    pendente: 'Pendente', paga: 'Paga', reembolsada: 'Reembolsada', cancelada: 'Cancelada',
    por_encomendar: 'Por encomendar', encomendada_fornecedor: 'No fornecedor',
    enviada: 'Enviada', entregue: 'Entregue'
  };
  function badge(estado) {
    return `<span class="badge badge-${estado}">${NOMES_ESTADO[estado] || estado}</span>`;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // fetch com tratamento de sessão expirada (401 → login)
  async function api(url, opcoes = {}) {
    if (opcoes.body && !(opcoes.body instanceof FormData)) {
      opcoes.headers = { 'Content-Type': 'application/json', ...opcoes.headers };
      opcoes.body = JSON.stringify(opcoes.body);
    }
    const res = await fetch(url, opcoes);
    if (res.status === 401) {
      location.href = '/funitocorp/login';
      throw new Error('sessão expirada');
    }
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(dados.erro || 'Erro'), { dados });
    return dados;
  }

  // Nav ativa + logout (presentes em todas as páginas autenticadas)
  document.querySelectorAll('.adm-nav a').forEach(a => {
    const alvo = a.dataset.adm;
    const ativo = (pagina === 'dashboard' && alvo === 'dashboard')
      || (pagina?.startsWith('encomenda') && alvo === 'encomendas')
      || (pagina?.startsWith('produto') && alvo === 'produtos');
    a.classList.toggle('ativo', ativo);
  });
  document.getElementById('adm-logout')?.addEventListener('click', async () => {
    await fetch('/funitocorp/logout', { method: 'POST' });
    location.href = '/funitocorp/login';
  });

  // ============================================================
  // LOGIN
  // ============================================================
  if (pagina === 'login') {
    const form = document.getElementById('form-login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erro = document.getElementById('login-erro');
      erro.hidden = true;
      try {
        const res = await fetch('/funitocorp/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: document.getElementById('l-pass').value })
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro || 'Erro');
        location.href = '/funitocorp';
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
      }
    });
  }

  // Linha de tabela de encomenda (dashboard: sem checkbox/apagar; listagem: com ambos)
  function linhaEncomenda(o, comControlos = false) {
    return `<tr${o.teste ? ' class="adm-linha-teste"' : ''}>
      <td>${comControlos ? `<input type="checkbox" class="bulk-cb" data-num="${esc(o.numero_encomenda)}">` : ''}</td>
      <td><a href="/funitocorp/encomendas/${o.numero_encomenda}">${o.numero_encomenda}</a>${o.teste ? ' <span class="badge badge-teste">Teste</span>' : ''}</td>
      <td>${esc(o.nome_cliente)}</td>
      <td class="num">${euro(o.total)}</td>
      <td>${badge(o.estado_pagamento)}</td>
      <td>${badge(o.estado_fulfillment)}</td>
      <td>${dataPT(o.created_at)}</td>
      <td>${comControlos ? `<button class="adm-btn-apagar" data-num="${esc(o.numero_encomenda)}" title="Apagar">✕</button>` : ''}</td>
    </tr>`;
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  if (pagina === 'dashboard') {
    // Visitantes ao vivo via SSE
    const sse = new EventSource('/api/admin/live');
    sse.onmessage = (e) => {
      const d = JSON.parse(e.data);
      document.getElementById('live-total').textContent = d.total;
      document.getElementById('live-checkout').textContent = d.checkout;
      document.getElementById('live-carrinho').textContent = d.comCarrinho;
    };

    function tocarNotificacao() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [880, 1100, 1320].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = freq; osc.type = 'sine';
          const t = ctx.currentTime + i * 0.13;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.start(t); osc.stop(t + 0.28);
        });
      } catch {}
    }

    function mostrarToast(msg) {
      const t = document.getElementById('adm-toast');
      t.textContent = msg; t.hidden = false;
      setTimeout(() => { t.hidden = true; }, 4000);
    }

    function renderGrafico(dias) {
      const max = Math.max(...dias.map(d => d.n), 1);
      const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
      document.getElementById('adm-grafico').innerHTML = dias.map(d => {
        const pct = Math.round((d.n / max) * 100);
        const label = DIAS_PT[new Date(d.dia + 'T12:00:00').getDay()];
        return `<div class="adm-barra-wrap">
          <span class="adm-barra-val">${d.n > 0 ? d.n : ''}</span>
          <div class="adm-barra" style="height:${pct}%"></div>
          <span class="adm-barra-label">${label}</span>
        </div>`;
      }).join('');
    }

    let ultimaEncomenda = null;

    async function atualizarResumo(primeiro = false) {
      const r = await api('/api/admin/resumo');
      document.getElementById('c-hoje').textContent = r.hoje;
      document.getElementById('c-receita-hoje').textContent = euro(r.receitaHoje);
      document.getElementById('c-7').textContent = r.dias7;
      document.getElementById('c-30').textContent = r.dias30;
      document.getElementById('c-receita').textContent = euro(r.receita30);
      document.getElementById('c-lucro').textContent = euro(r.lucro30);
      document.getElementById('c-encomendar').textContent = r.porEncomendar;
      document.getElementById('c-visitantes').textContent = r.visitantesHoje;
      document.getElementById('c-conversao').textContent = r.conversaoHoje + '%';
      if (r.porEncomendar > 0) document.getElementById('c-card-encomendar').classList.add('urgente');

      document.getElementById('t-ultimas').innerHTML = r.ultimas.length
        ? r.ultimas.map(linhaEncomenda).join('')
        : '<tr><td colspan="6" class="adm-vazio">Ainda sem encomendas.</td></tr>';

      renderGrafico(r.grafico7dias);

      const nova = r.ultimas[0]?.numero_encomenda || null;
      if (!primeiro && nova && nova !== ultimaEncomenda) {
        tocarNotificacao();
        mostrarToast(`🛒 Nova encomenda: ${nova}`);
      }
      ultimaEncomenda = nova;
    }

    atualizarResumo(true);
    setInterval(() => atualizarResumo(false), 30000);

    // Backups
    async function carregarBackups() {
      const lista = document.getElementById('lista-backups');
      try {
        const bs = await api('/api/admin/backups');
        lista.innerHTML = bs.length
          ? bs.map(b => {
              const mb = (b.tamanho / 1024 / 1024).toFixed(2);
              const data = new Date(b.data).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
              return `<li><code>${b.nome}</code> <small>${mb} MB — ${data}</small></li>`;
            }).join('')
          : '<li class="adm-vazio">Nenhum backup ainda.</li>';
      } catch { lista.innerHTML = '<li class="adm-vazio">Não foi possível carregar.</li>'; }
    }
    carregarBackups();

    document.getElementById('btn-backup').addEventListener('click', async () => {
      const btn = document.getElementById('btn-backup');
      const estado = document.getElementById('backup-estado');
      btn.disabled = true;
      estado.textContent = 'A fazer backup…';
      try {
        const r = await api('/api/admin/backup', { method: 'POST' });
        estado.textContent = `✓ ${r.nome}`;
        carregarBackups();
      } catch (err) {
        estado.textContent = `Erro: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ============================================================
  // ENCOMENDAS (listagem com filtros + CSV)
  // ============================================================
  if (pagina === 'encomendas') {
    const pesquisa = document.getElementById('f-pesquisa');
    const fPag = document.getElementById('f-pagamento');
    const fFul = document.getElementById('f-fulfillment');
    const fTeste = document.getElementById('f-esconder-testes');
    const fIni = document.getElementById('f-data-ini');
    const fFim = document.getElementById('f-data-fim');
    const bulkBar = document.getElementById('adm-bulk');
    const bulkTodos = document.getElementById('bulk-todos');

    const urlParams = new URLSearchParams(location.search);
    fPag.value = urlParams.get('estado_pagamento') || '';
    fFul.value = urlParams.get('estado_fulfillment') || '';

    function querystring() {
      const q = new URLSearchParams();
      if (pesquisa.value.trim()) q.set('q', pesquisa.value.trim());
      if (fPag.value) q.set('estado_pagamento', fPag.value);
      if (fFul.value) q.set('estado_fulfillment', fFul.value);
      if (fTeste.checked) q.set('esconder_testes', '1');
      if (fIni.value) q.set('data_ini', fIni.value);
      if (fFim.value) q.set('data_fim', fFim.value);
      return q.toString();
    }

    function selecionadas() {
      return [...document.querySelectorAll('.bulk-cb:checked')].map(cb => cb.dataset.num);
    }

    function atualizarBulkBar() {
      const n = selecionadas().length;
      bulkBar.hidden = n === 0;
      document.getElementById('bulk-contagem').textContent = `${n} selecionada${n !== 1 ? 's' : ''}`;
    }

    async function carregar() {
      const lista = await api(`/api/admin/encomendas?${querystring()}`);
      const tbody = document.getElementById('t-encomendas');
      tbody.innerHTML = lista.length
        ? lista.map(o => linhaEncomenda(o, true)).join('')
        : '<tr><td colspan="8" class="adm-vazio">Nada encontrado com estes filtros.</td></tr>';

      tbody.querySelectorAll('.adm-btn-apagar').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Apagar ${btn.dataset.num}? Esta ação é irreversível.`)) return;
          await api(`/api/admin/encomendas/${encodeURIComponent(btn.dataset.num)}`, { method: 'DELETE' });
          carregar();
        });
      });
      tbody.querySelectorAll('.bulk-cb').forEach(cb => cb.addEventListener('change', atualizarBulkBar));
      bulkTodos.checked = false;
      bulkBar.hidden = true;
      document.getElementById('btn-csv').href = `/api/admin/encomendas.csv?${querystring()}`;
    }

    bulkTodos.addEventListener('change', () => {
      document.querySelectorAll('.bulk-cb').forEach(cb => { cb.checked = bulkTodos.checked; });
      atualizarBulkBar();
    });

    document.getElementById('btn-bulk-aplicar').addEventListener('click', async () => {
      const nums = selecionadas();
      const acao = document.getElementById('bulk-acao').value;
      if (!acao) return alert('Escolhe uma ação.');
      if (acao === 'apagar' && !confirm(`Apagar ${nums.length} encomenda(s)? Irreversível.`)) return;
      await api('/api/admin/encomendas/bulk', { method: 'POST', body: { numeros: nums, acao } });
      carregar();
    });

    document.getElementById('btn-bulk-cancelar').addEventListener('click', () => {
      document.querySelectorAll('.bulk-cb').forEach(cb => { cb.checked = false; });
      bulkTodos.checked = false;
      bulkBar.hidden = true;
    });

    let timer;
    pesquisa.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(carregar, 300); });
    [fPag, fFul, fTeste, fIni, fFim].forEach(el => el.addEventListener('change', carregar));
    carregar();
  }

  // ============================================================
  // DETALHE DE ENCOMENDA + FULFILLMENT
  // ============================================================
  if (pagina === 'encomenda') {
    const numero = decodeURIComponent(location.pathname.split('/').pop());

    async function carregar() {
      const o = await api(`/api/admin/encomendas/${encodeURIComponent(numero)}`);
      document.getElementById('e-numero').textContent = o.numero_encomenda;
      document.getElementById('e-badges').innerHTML = badge(o.estado_pagamento) + badge(o.estado_fulfillment);

      // Items com link direto ao fornecedor + custo
      document.getElementById('e-items').innerHTML = o.items.map(i => `
        <div class="adm-item">
          <div>
            <strong>${esc(i.nome)}</strong>${i.cor ? ` · ${esc(i.cor)}` : ''} × ${i.qtd}
            <small>
              ${i.fornecedor || '?'} · ref ${i.fornecedor_product_id || '?'} ·
              custo ${i.custo_fornecedor != null ? euro(i.custo_fornecedor) : '?'}/un
              ${i.fornecedor_url ? ` · <a href="${esc(i.fornecedor_url)}" target="_blank" rel="noopener">abrir no fornecedor ↗</a>` : ''}
            </small>
          </div>
          <span class="num">${euro(i.preco_unit * i.qtd)}</span>
        </div>`).join('');

      document.getElementById('e-totais').innerHTML = `
        <div><span>Subtotal</span><span class="num">${euro(o.subtotal)}</span></div>
        <div><span>Portes cobrados</span><span class="num">${o.portes === 0 ? 'Grátis' : euro(o.portes)}</span></div>
        <div class="total"><span>Total pago</span><span class="num">${euro(o.total)}</span></div>`;

      // Cliente
      document.getElementById('e-cliente').innerHTML = `
        <strong>${esc(o.nome_cliente)}</strong><br>
        ${esc(o.morada)}<br>
        ${esc(o.codigo_postal)} ${esc(o.cidade)}, ${esc(o.pais)}<br>
        <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.telefone ? ` · ${esc(o.telefone)}` : ''}<br>
        <small>Criada: ${dataPT(o.created_at)}${o.metodo_pagamento ? ` · ${esc(o.metodo_pagamento)}` : ''}</small>`;

      // Margem
      const classe = o.margem >= 0 ? 'positiva' : 'negativa';
      document.getElementById('e-margem').innerHTML = `
        <strong class="adm-margem-grande ${classe}">${euro(o.margem)}</strong>
        <strong class="${classe}"> (${o.margem_pct}%)</strong>
        <p class="adm-ajuda">total ${euro(o.total)} − custos ${euro(o.custos_fornecedor)} − portes ${euro(o.portes)}</p>`;

      // Notas
      document.getElementById('e-notas').value = o.notas_internas || '';

      // Fluxo de fulfillment: mostra a próxima ação consoante o estado
      const fluxo = document.getElementById('e-fluxo');
      if (o.estado_pagamento !== 'paga') {
        fluxo.innerHTML = `<p class="adm-fluxo-feito">A encomenda ainda não está paga — o fulfillment começa depois do pagamento.</p>`;
      } else if (o.estado_fulfillment === 'por_encomendar') {
        fluxo.innerHTML = `
          <div class="campo"><label>Nº da encomenda no fornecedor (opcional)</label>
          <input type="text" id="ff-fornecedor-id" placeholder="ex: CJ-123456"></div>
          <button class="adm-btn adm-btn-primario" data-acao="encomendada">Marcar como encomendada ao fornecedor</button>`;
      } else if (o.estado_fulfillment === 'encomendada_fornecedor') {
        fluxo.innerHTML = `
          <p class="adm-fluxo-feito">Encomendada ao fornecedor${o.fornecedor_order_id ? ` — <strong>${esc(o.fornecedor_order_id)}</strong>` : ''}.</p>
          <div class="campo-linha">
            <div class="campo"><label>Nº de tracking</label><input type="text" id="ff-tracking-num" placeholder="ex: LP123456789CN"></div>
            <div class="campo"><label>Link de tracking</label><input type="url" id="ff-tracking-url" placeholder="https://t.17track.net/…"></div>
          </div>
          <button class="adm-btn adm-btn-primario" data-acao="enviada">Inserir tracking e marcar como enviada</button>
          <p class="adm-ajuda">Ao gravar, o cliente recebe um email com o link de tracking.</p>`;
      } else if (o.estado_fulfillment === 'enviada') {
        fluxo.innerHTML = `
          <p class="adm-fluxo-feito">Enviada — tracking <strong>${esc(o.tracking_number || '?')}</strong>
          ${o.tracking_url ? ` · <a href="${esc(o.tracking_url)}" target="_blank" rel="noopener">seguir ↗</a>` : ''}</p>
          <button class="adm-btn adm-btn-primario" data-acao="entregue">Marcar como entregue</button>`;
      } else {
        fluxo.innerHTML = `<p class="adm-fluxo-feito">✅ Entregue. Encomenda fechada.</p>`;
      }

      fluxo.querySelector('button[data-acao]')?.addEventListener('click', async (e) => {
        const botao = e.target;
        botao.disabled = true;
        try {
          await api(`/api/admin/encomendas/${encodeURIComponent(numero)}/fulfillment`, {
            method: 'POST',
            body: {
              acao: botao.dataset.acao,
              fornecedor_order_id: document.getElementById('ff-fornecedor-id')?.value,
              tracking_number: document.getElementById('ff-tracking-num')?.value,
              tracking_url: document.getElementById('ff-tracking-url')?.value
            }
          });
          carregar(); // re-renderiza com o novo estado
        } catch (err) {
          alert(err.message);
          botao.disabled = false;
        }
      });
    }
    carregar();

    document.getElementById('btn-notas').addEventListener('click', async () => {
      await api(`/api/admin/encomendas/${encodeURIComponent(numero)}/notas`, {
        method: 'POST',
        body: { notas_internas: document.getElementById('e-notas').value }
      });
      const ok = document.getElementById('notas-ok');
      ok.hidden = false;
      setTimeout(() => { ok.hidden = true; }, 2000);
    });

    document.getElementById('btn-teste').addEventListener('click', async () => {
      const btn = document.getElementById('btn-teste');
      const { teste } = await api(`/api/admin/encomendas/${encodeURIComponent(numero)}/teste`, { method: 'POST' });
      btn.textContent = teste ? 'Remover marcação de teste' : 'Marcar como teste';
      document.getElementById('e-badges').querySelectorAll('.badge-teste').forEach(el => el.remove());
      if (teste) document.getElementById('e-badges').insertAdjacentHTML('beforeend', '<span class="badge badge-teste">Teste</span>');
    });
  }

  // ============================================================
  // PRODUTOS (tabela com toggles rápidos)
  // ============================================================
  if (pagina === 'produtos') {
    async function carregar() {
      const lista = await api('/api/admin/produtos');
      document.getElementById('t-produtos').innerHTML = lista.length ? lista.map(p => {
        const preco = p.preco_promo ?? p.preco;
        const margem = p.custo_fornecedor != null && preco > 0
          ? Math.round(((preco - p.custo_fornecedor) / preco) * 100) + '%'
          : '—';
        return `<tr data-id="${p.id}">
          <td><span class="adm-prod-nome"><img class="adm-thumb" src="${esc(p.imagens[0] || '')}" alt="">
            <span class="${p.ativo ? '' : 'inativo'}">${esc(p.nome)}</span></span></td>
          <td class="num adm-preco-cell" data-preco="${(preco/100).toFixed(2)}" data-promo="${p.preco_promo ? (p.preco_promo/100).toFixed(2) : ''}" title="Clica para editar">${euro(preco)}${p.preco_promo ? ` <small class="riscado">${euro(p.preco)}</small>` : ''}</td>
          <td class="num">${p.custo_fornecedor != null ? euro(p.custo_fornecedor) : '—'}</td>
          <td class="num">${margem}</td>
          <td>${esc(p.fornecedor || '—')}</td>
          <td><button class="adm-toggle ${p.disponivel ? 'on' : ''}" data-campo="disponivel" aria-label="Disponível"></button></td>
          <td><button class="adm-toggle ${p.destaque ? 'on' : ''}" data-campo="destaque" aria-label="Destaque"></button></td>
          <td style="white-space:nowrap">
            <a href="/funitocorp/produtos/${p.id}">Editar</a> ·
            <a href="#" data-campo="ativo" class="apagar">${p.ativo ? 'Desativar' : 'Reativar'}</a> ·
            <a href="#" data-campo="apagar" style="color:var(--cor-perigo)">Apagar</a>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" class="adm-vazio">Sem produtos.</td></tr>';
    }

    document.getElementById('t-produtos').addEventListener('click', async (e) => {
      // Edição inline de preço
      const celulaPreco = e.target.closest('.adm-preco-cell');
      if (celulaPreco && !celulaPreco.querySelector('input')) {
        const id = celulaPreco.closest('tr').dataset.id;
        const precoAtual = celulaPreco.dataset.preco;
        const promoAtual = celulaPreco.dataset.promo;
        celulaPreco.innerHTML = `
          <input class="adm-preco-input" type="number" step="0.01" min="0" value="${precoAtual}" placeholder="Preço" style="width:5rem">
          <input class="adm-preco-input" type="number" step="0.01" min="0" value="${promoAtual}" placeholder="Promo (opcional)" style="width:6rem">
          <button class="adm-btn adm-btn-fantasma" style="padding:.2rem .5rem;font-size:.8rem">✓</button>`;
        const [inp1, inp2, btn] = celulaPreco.querySelectorAll('input, button');
        inp1.focus();
        const guardar = async () => {
          const r = await api(`/api/admin/produtos/${id}/preco`, { method: 'PATCH', body: { preco: inp1.value, preco_promo: inp2.value || null } });
          if (r.ok) carregar();
        };
        btn.addEventListener('click', guardar);
        [inp1, inp2].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') carregar(); }));
        return;
      }

      const alvo = e.target.closest('[data-campo]');
      if (!alvo) return;
      e.preventDefault();
      const id = alvo.closest('tr').dataset.id;
      const campo = alvo.dataset.campo;
      if (campo === 'apagar') {
        if (!confirm('Apagar este produto permanentemente? Esta ação não pode ser revertida.')) return;
        await api(`/api/admin/produtos/${id}`, { method: 'DELETE' });
        carregar();
        return;
      }
      if (campo === 'ativo' && alvo.textContent === 'Desativar' &&
          !confirm('Desativar este produto? Deixa de aparecer na loja (não é apagado da BD).')) return;
      const r = await api(`/api/admin/produtos/${id}/toggle`, { method: 'PATCH', body: { campo } });
      if (alvo.classList.contains('adm-toggle')) alvo.classList.toggle('on', r.valor);
      else carregar();
    });
    carregar();
  }

  // ============================================================
  // FORM DE PRODUTO (criar/editar + upload de imagens)
  // ============================================================
  if (pagina === 'produto-form') {
    const form = document.getElementById('form-produto');
    const segmento = location.pathname.split('/').pop();
    const idProduto = segmento === 'novo' ? null : Number(segmento);
    let imagens = []; // URLs atuais do produto

    document.getElementById('pf-titulo').textContent = idProduto ? 'Editar produto' : 'Novo produto';

    function renderImagens() {
      document.getElementById('pf-imagens').innerHTML = imagens.map((u, i) => `
        <span class="adm-imagem"><img src="${esc(u)}" alt="">
        <button type="button" data-remove="${i}" aria-label="Remover">✕</button></span>`).join('');
    }
    document.getElementById('pf-imagens').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      imagens.splice(Number(b.dataset.remove), 1);
      renderImagens();
    });

    // Upload → /api/admin/upload (multer+sharp) → junta os URLs
    document.getElementById('pf-upload').addEventListener('change', async (e) => {
      const estado = document.getElementById('upload-estado');
      estado.textContent = 'A enviar…';
      estado.hidden = false;
      const fd = new FormData();
      for (const f of e.target.files) fd.append('imagens', f);
      try {
        const r = await api('/api/admin/upload', { method: 'POST', body: fd });
        imagens.push(...r.urls);
        renderImagens();
        estado.textContent = `${r.urls.length} imagem(ns) carregada(s) ✓`;
      } catch (err) {
        estado.textContent = err.message;
      }
      e.target.value = '';
      setTimeout(() => { estado.hidden = true; }, 2500);
    });

    // Editar: pré-preenche com os dados atuais
    if (idProduto) {
      api(`/api/admin/produtos/${idProduto}`).then(p => {
        const camposEuro = ['preco', 'preco_promo', 'custo_fornecedor'];
        for (const [campo, valor] of Object.entries(p)) {
          const input = form.elements[campo];
          if (!input) continue;
          if (input.type === 'checkbox') input.checked = !!valor;
          else if (campo === 'cores' || campo === 'specs') input.value = JSON.stringify(valor);
          else if (camposEuro.includes(campo)) input.value = valor != null ? (valor / 100).toFixed(2) : '';
          else input.value = valor ?? '';
        }
        imagens = p.imagens;
        renderImagens();
      }).catch(() => { location.href = '/funitocorp/produtos'; });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erroGeral = document.getElementById('pf-erro-geral');
      erroGeral.hidden = true;
      form.querySelectorAll('[data-erro]').forEach(el => { el.hidden = true; });

      // JSON dos campos cores/specs validado aqui antes de enviar
      const dados = Object.fromEntries(new FormData(form));
      for (const campo of ['cores', 'specs']) {
        try { dados[campo] = dados[campo]?.trim() ? JSON.parse(dados[campo]) : []; }
        catch {
          const aviso = form.querySelector(`[data-erro="${campo}"]`);
          aviso.textContent = 'JSON inválido.';
          aviso.hidden = false;
          return;
        }
      }
      const camposEuro = ['preco', 'preco_promo', 'custo_fornecedor'];
      for (const campo of ['preco', 'preco_promo', 'custo_fornecedor', 'num_avaliacoes']) {
        if (dados[campo] === '' || dados[campo] == null) { delete dados[campo]; continue; }
        dados[campo] = camposEuro.includes(campo)
          ? Math.round(Number(dados[campo]) * 100)
          : Number(dados[campo]);
      }
      dados.disponivel = form.elements.disponivel.checked;
      dados.destaque = form.elements.destaque.checked;
      dados.em_tendencia = form.elements.em_tendencia.checked;
      dados.imagens = imagens;

      const botao = document.getElementById('pf-guardar');
      botao.disabled = true;
      try {
        await api(idProduto ? `/api/admin/produtos/${idProduto}` : '/api/admin/produtos', {
          method: idProduto ? 'PUT' : 'POST',
          body: dados
        });
        location.href = '/funitocorp/produtos';
      } catch (err) {
        if (err.dados?.erros) {
          for (const [campo, msg] of Object.entries(err.dados.erros)) {
            const aviso = form.querySelector(`[data-erro="${campo}"]`);
            if (aviso) { aviso.textContent = msg; aviso.hidden = false; }
          }
        } else {
          erroGeral.textContent = err.message;
          erroGeral.hidden = false;
        }
        botao.disabled = false;
      }
    });
  }
})();
