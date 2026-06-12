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
      location.href = '/admin/login';
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
    await fetch('/admin/logout', { method: 'POST' });
    location.href = '/admin/login';
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
        const res = await fetch('/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: document.getElementById('l-pass').value })
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro || 'Erro');
        location.href = '/admin';
      } catch (err) {
        erro.textContent = err.message;
        erro.hidden = false;
      }
    });
  }

  // Linha de tabela de encomenda (dashboard e listagem usam a mesma)
  function linhaEncomenda(o) {
    return `<tr>
      <td><a href="/admin/encomendas/${o.numero_encomenda}">${o.numero_encomenda}</a></td>
      <td>${esc(o.nome_cliente)}</td>
      <td class="num">${euro(o.total)}</td>
      <td>${badge(o.estado_pagamento)}</td>
      <td>${badge(o.estado_fulfillment)}</td>
      <td>${dataPT(o.created_at)}</td>
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

    (async () => {
      const r = await api('/api/admin/resumo');
      document.getElementById('c-hoje').textContent = r.hoje;
      document.getElementById('c-7').textContent = r.dias7;
      document.getElementById('c-30').textContent = r.dias30;
      document.getElementById('c-receita').textContent = euro(r.receita30);
      document.getElementById('c-lucro').textContent = euro(r.lucro30);
      document.getElementById('c-encomendar').textContent = r.porEncomendar;
      // O nº mais importante: destaca a roxo se houver trabalho pendente
      if (r.porEncomendar > 0) document.getElementById('c-card-encomendar').classList.add('urgente');

      document.getElementById('t-ultimas').innerHTML = r.ultimas.length
        ? r.ultimas.map(linhaEncomenda).join('')
        : '<tr><td colspan="6" class="adm-vazio">Ainda sem encomendas.</td></tr>';
    })();
  }

  // ============================================================
  // ENCOMENDAS (listagem com filtros + CSV)
  // ============================================================
  if (pagina === 'encomendas') {
    const pesquisa = document.getElementById('f-pesquisa');
    const fPag = document.getElementById('f-pagamento');
    const fFul = document.getElementById('f-fulfillment');

    // Filtros pré-preenchidos via URL (ex: vindos do card do dashboard)
    const params = new URLSearchParams(location.search);
    fPag.value = params.get('estado_pagamento') || '';
    fFul.value = params.get('estado_fulfillment') || '';

    function querystring() {
      const q = new URLSearchParams();
      if (pesquisa.value.trim()) q.set('q', pesquisa.value.trim());
      if (fPag.value) q.set('estado_pagamento', fPag.value);
      if (fFul.value) q.set('estado_fulfillment', fFul.value);
      return q.toString();
    }

    async function carregar() {
      const lista = await api(`/api/admin/encomendas?${querystring()}`);
      document.getElementById('t-encomendas').innerHTML = lista.length
        ? lista.map(linhaEncomenda).join('')
        : '<tr><td colspan="6" class="adm-vazio">Nada encontrado com estes filtros.</td></tr>';
      // O CSV exporta exatamente o que está filtrado
      document.getElementById('btn-csv').href = `/api/admin/encomendas.csv?${querystring()}`;
    }

    let timer;
    pesquisa.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(carregar, 300); });
    fPag.addEventListener('change', carregar);
    fFul.addEventListener('change', carregar);
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
          <td class="num">${euro(preco)}${p.preco_promo ? ` <small style="text-decoration:line-through;color:var(--cor-texto-suave)">${euro(p.preco)}</small>` : ''}</td>
          <td class="num">${p.custo_fornecedor != null ? euro(p.custo_fornecedor) : '—'}</td>
          <td class="num">${margem}</td>
          <td>${esc(p.fornecedor || '—')}</td>
          <td><button class="adm-toggle ${p.disponivel ? 'on' : ''}" data-campo="disponivel" aria-label="Disponível"></button></td>
          <td><button class="adm-toggle ${p.destaque ? 'on' : ''}" data-campo="destaque" aria-label="Destaque"></button></td>
          <td style="white-space:nowrap">
            <a href="/admin/produtos/${p.id}">Editar</a> ·
            <a href="#" data-campo="ativo" class="apagar">${p.ativo ? 'Desativar' : 'Reativar'}</a>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" class="adm-vazio">Sem produtos.</td></tr>';
    }

    document.getElementById('t-produtos').addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-campo]');
      if (!alvo) return;
      e.preventDefault();
      const id = alvo.closest('tr').dataset.id;
      const campo = alvo.dataset.campo;
      // "Apagar" = soft delete (ativo=0); confirmação só nesse caso
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
        for (const [campo, valor] of Object.entries(p)) {
          const input = form.elements[campo];
          if (!input) continue;
          if (input.type === 'checkbox') input.checked = !!valor;
          else if (campo === 'cores' || campo === 'specs') input.value = JSON.stringify(valor);
          else input.value = valor ?? '';
        }
        imagens = p.imagens;
        renderImagens();
      }).catch(() => { location.href = '/admin/produtos'; });
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
      for (const campo of ['preco', 'preco_promo', 'custo_fornecedor', 'num_avaliacoes']) {
        if (dados[campo] === '') delete dados[campo];
        else if (dados[campo] != null) dados[campo] = Number(dados[campo]);
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
        location.href = '/admin/produtos';
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
