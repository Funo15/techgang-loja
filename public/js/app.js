// ============================================================
// TECHGANG — frontend
// Carrinho (localStorage), pesquisa, parallax, fade-in ao
// scroll e rendering das páginas via API.
// window.LOJA é injetado pelo servidor a partir do config.js.
// ============================================================

(() => {
  const LOJA = window.LOJA;
  const CHAVE_CARRINHO = 'tg_carrinho';

  // ---------- Escape HTML ----------
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ---------- Formatação de preços ----------
  // A BD guarda cêntimos; aqui formatamos para "€24,99"
  function formatarPreco(centimos) {
    return '€' + (centimos / 100).toFixed(2).replace('.', ',');
  }
  function percentDesconto(p) {
    if (p.preco_promo == null) return null;
    return Math.round((1 - p.preco_promo / p.preco) * 100);
  }

  // ---------- Ícones (specs e UI) ----------
  const ICONES = {
    escudo: '<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4z"/><path d="m9 12 2 2 4-4"/>',
    energia: '<path d="M12 2v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    bateria: '<rect x="2" y="8" width="17" height="8" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2"/>',
    onda: '<path d="M2 12c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0"/>',
    gota: '<path d="M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  function iconeSpec(nome) {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ICONES.escudo}</svg>`;
  }
  const ICONE_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // ============================================================
  // CARRINHO (localStorage)
  // Cada item é identificado por produto + variante escolhida.
  // ============================================================
  function lerCarrinho() {
    try { return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || []; }
    catch { return []; }
  }
  function guardarCarrinho(itens) {
    localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(itens));
    atualizarContador();
  }
  function precoEfetivo(p) {
    return p.preco_promo ?? p.preco;
  }
  function chaveItem(i) {
    return `${i.id}|${i.variante || i.cor || ''}`;
  }

  function adicionarAoCarrinho(produto, qtd, variante) {
    const itens = lerCarrinho();
    const existente = itens.find(i => chaveItem(i) === `${produto.id}|${variante || ''}`);
    if (existente) {
      existente.qtd += qtd;
    } else {
      itens.push({
        id: produto.id,
        nome: produto.nome,
        slug: produto.slug,
        preco: precoEfetivo(produto),
        imagem: produto.imagens[0],
        variante: variante || null,
        qtd
      });
    }
    guardarCarrinho(itens);
    atualizarContador(true); // pop no contador
    renderizarTudo();
    abrirCarrinho();
    // Pixels: AddToCart
    const val = (precoEfetivo(produto) / 100).toFixed(2);
    if (window.fbq) fbq('track', 'AddToCart', { content_ids: [String(produto.id)], content_name: produto.nome, value: val, currency: 'EUR' });
    if (window.ttq) ttq.track('AddToCart', { content_id: String(produto.id), content_name: produto.nome, value: val, currency: 'EUR' });
  }

  function alterarQtd(chave, delta) {
    let itens = lerCarrinho();
    const item = itens.find(i => chaveItem(i) === chave);
    if (!item) return;
    item.qtd += delta;
    if (item.qtd <= 0) itens = itens.filter(i => chaveItem(i) !== chave);
    guardarCarrinho(itens);
    renderizarTudo();
  }

  function removerItem(chave) {
    guardarCarrinho(lerCarrinho().filter(i => chaveItem(i) !== chave));
    renderizarTudo();
  }

  function atualizarContador(animar = false) {
    const contador = document.getElementById('carrinho-contador');
    if (!contador) return;
    const total = lerCarrinho().reduce((s, i) => s + i.qtd, 0);
    contador.textContent = total;
    contador.hidden = total === 0;
    if (animar && total > 0) {
      contador.classList.remove('pop');
      void contador.offsetWidth; // reinicia a animação
      contador.classList.add('pop');
    }
  }

  // Markup de um item do carrinho (drawer e página usam o mesmo)
  function itemCarrinhoHTML(i) {
    return `
      <div class="carrinho-item" data-chave="${chaveItem(i)}">
        <a href="/produto/${esc(i.slug)}"><img src="${esc(i.imagem)}" alt="${esc(i.nome)}" width="84" height="84"></a>
        <div>
          <h4>${esc(i.nome)}</h4>
          ${(i.variante || i.cor) ? `<p class="carrinho-item-cor">${esc(i.variante || i.cor)}</p>` : ''}
        </div>
        <button class="carrinho-item-remover" data-acao="remover" aria-label="Remover ${esc(i.nome)}">${ICONE_X}</button>
        <div class="carrinho-item-base">
          <div class="carrinho-item-qtd">
            <button data-acao="menos" aria-label="Diminuir">&minus;</button>
            <span>${i.qtd}</span>
            <button data-acao="mais" aria-label="Aumentar">+</button>
          </div>
          <span class="preco-display carrinho-item-preco">${formatarPreco(i.preco * i.qtd)}</span>
        </div>
      </div>`;
  }

  function renderizarCarrinho() {
    const cont = document.getElementById('carrinho-itens');
    const rodape = document.getElementById('carrinho-rodape');
    const banner = document.getElementById('carrinho-banner');
    if (!cont) return;
    const itens = lerCarrinho();

    if (itens.length === 0) {
      cont.innerHTML = `<p class="carrinho-vazio">O carrinho está vazio.<br><a href="/produtos">Descobre os produtos</a></p>`;
      rodape.style.display = 'none';
      banner.hidden = true;
      return;
    }
    rodape.style.display = '';
    banner.hidden = false;

    cont.innerHTML = itens.map(itemCarrinhoHTML).join('');

    // Subtotal
    const subtotal = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    document.getElementById('carrinho-subtotal').textContent = formatarPreco(subtotal);

    // Banner: envio grátis conquistado ou progresso até lá
    if (subtotal >= LOJA.portesGratisAPartirDe) {
      banner.innerHTML = 'Tens envio grátis 🎉';
    } else {
      const falta = LOJA.portesGratisAPartirDe - subtotal;
      const progresso = Math.min(100, Math.round((subtotal / LOJA.portesGratisAPartirDe) * 100));
      banner.innerHTML = `Faltam ${formatarPreco(falta)} para envio grátis<div class="barra-portes"><div class="barra-portes-fill" style="width:0%"></div></div>`;
      // largura aplicada no frame seguinte para a transição animar
      requestAnimationFrame(() => {
        banner.querySelector('.barra-portes-fill').style.width = `${progresso}%`;
      });
    }
  }

  // Página /carrinho (lista grande + resumo)
  function renderizarPaginaCarrinho() {
    const cont = document.getElementById('pagina-carrinho-itens');
    if (!cont) return;
    const resumo = document.getElementById('carrinho-resumo');
    const itens = lerCarrinho();

    if (itens.length === 0) {
      cont.innerHTML = `<p class="carrinho-vazio">O carrinho está vazio.<br><a href="/produtos">Descobre os produtos</a></p>`;
      resumo.hidden = true;
      return;
    }
    resumo.hidden = false;
    cont.innerHTML = itens.map(itemCarrinhoHTML).join('');

    const subtotal = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const envioGratis = subtotal >= LOJA.portesGratisAPartirDe;
    const envio = envioGratis ? 0 : LOJA.portes;
    document.getElementById('resumo-subtotal').textContent = formatarPreco(subtotal);
    document.getElementById('resumo-envio').textContent = envioGratis ? 'Grátis 🎉' : formatarPreco(envio);
    document.getElementById('resumo-total').textContent = formatarPreco(subtotal + envio);
  }

  function renderizarTudo() {
    renderizarCarrinho();
    renderizarPaginaCarrinho();
  }

  // Delegação de eventos nos itens do carrinho (drawer + página)
  function ligarAcoesCarrinho(idContentor) {
    document.getElementById(idContentor)?.addEventListener('click', (e) => {
      const botao = e.target.closest('button[data-acao]');
      if (!botao) return;
      const chave = botao.closest('.carrinho-item').dataset.chave;
      if (botao.dataset.acao === 'mais') alterarQtd(chave, 1);
      if (botao.dataset.acao === 'menos') alterarQtd(chave, -1);
      if (botao.dataset.acao === 'remover') removerItem(chave);
    });
  }
  ligarAcoesCarrinho('carrinho-itens');
  ligarAcoesCarrinho('pagina-carrinho-itens');

  // ---------- Abrir / fechar drawer ----------
  const drawer = document.getElementById('carrinho-drawer');
  const overlay = document.getElementById('carrinho-overlay');

  function abrirCarrinho() {
    renderizarCarrinho();
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('visivel'));
    drawer.classList.add('aberto');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function fecharCarrinho() {
    overlay.classList.remove('visivel');
    drawer.classList.remove('aberto');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { overlay.hidden = true; }, 300);
  }

  document.getElementById('btn-carrinho')?.addEventListener('click', abrirCarrinho);
  document.getElementById('btn-fechar-carrinho')?.addEventListener('click', fecharCarrinho);
  overlay?.addEventListener('click', fecharCarrinho);

  // ---------- Toast (notificação breve, não rouba o foco) ----------
  let toastTimer;
  function mostrarToast(mensagem) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.classList.add('visivel');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visivel'), 3200);
  }

  // Finalizar compra → /checkout (com guard de carrinho vazio)
  for (const id of ['btn-checkout', 'btn-checkout-pagina']) {
    document.getElementById(id)?.addEventListener('click', () => {
      const itens = lerCarrinho();
      if (itens.length === 0) {
        mostrarToast('O carrinho está vazio.');
        return;
      }
      // Pixels: InitiateCheckout
      const total = (itens.reduce((s, i) => s + i.preco * i.qtd, 0) / 100).toFixed(2);
      if (window.fbq) fbq('track', 'InitiateCheckout', { value: total, currency: 'EUR', num_items: itens.length });
      if (window.ttq) ttq.track('InitiateCheckout', { value: total, currency: 'EUR' });
      location.href = '/checkout';
    });
  }


  // ============================================================
  // PESQUISA (overlay)
  // ============================================================
  const pesquisaOverlay = document.getElementById('pesquisa-overlay');
  const pesquisaInput = document.getElementById('pesquisa-input');
  const pesquisaResultados = document.getElementById('pesquisa-resultados');
  let todosProdutos = null; // cache da lista para filtrar localmente

  async function abrirPesquisa() {
    pesquisaOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
    pesquisaInput.value = '';
    pesquisaInput.focus();
    if (!todosProdutos) {
      try { todosProdutos = await (await fetch('/api/produtos')).json(); }
      catch { todosProdutos = []; }
    }
    filtrarPesquisa('');
  }
  function fecharPesquisa() {
    pesquisaOverlay.hidden = true;
    document.body.style.overflow = '';
  }
  function filtrarPesquisa(termo) {
    const t = termo.trim().toLowerCase();
    const lista = (todosProdutos || []).filter(p =>
      !t || p.nome.toLowerCase().includes(t) || p.categoria.toLowerCase().includes(t)
    );
    pesquisaResultados.innerHTML = lista.length
      ? lista.slice(0, 9).map(cardProduto).join('')
      : '<p class="estado-vazio">Nada encontrado. Tenta outro termo.</p>';
  }

  document.getElementById('btn-pesquisa')?.addEventListener('click', abrirPesquisa);
  document.getElementById('btn-fechar-pesquisa')?.addEventListener('click', fecharPesquisa);
  pesquisaOverlay?.addEventListener('click', (e) => { if (e.target === pesquisaOverlay) fecharPesquisa(); });
  pesquisaInput?.addEventListener('input', () => filtrarPesquisa(pesquisaInput.value));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!pesquisaOverlay?.hidden) fecharPesquisa();
    else fecharCarrinho();
  });

  // ============================================================
  // PARALLAX (compatível com mobile)
  // background-attachment: fixed não funciona em iOS, por isso
  // usamos translate3d + requestAnimationFrame com listener
  // passivo. Desliga-se com prefers-reduced-motion.
  // ============================================================
  function iniciarParallax() {
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduzido) return;

    const elementos = [...document.querySelectorAll('.parallax')];
    if (elementos.length === 0) return;

    let pedido = false;
    function atualizar() {
      pedido = false;
      const vh = window.innerHeight;
      for (const el of elementos) {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue; // fora do ecrã
        // progresso: -1 (a entrar em baixo) → 1 (a sair em cima)
        const progresso = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
        const forca = parseFloat(el.dataset.parallax || '0.1');
        el.style.transform = `translate3d(0, ${(-progresso * forca * r.height).toFixed(1)}px, 0)`;
      }
    }
    function aoScroll() {
      if (!pedido) { pedido = true; requestAnimationFrame(atualizar); }
    }
    window.addEventListener('scroll', aoScroll, { passive: true });
    window.addEventListener('resize', aoScroll, { passive: true });
    atualizar();
  }

  // ============================================================
  // FADE-IN AO SCROLL (IntersectionObserver)
  // ============================================================
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) {
        e.target.classList.add('visivel');
        observador.unobserve(e.target);
      }
    }
  }, { threshold: 0.15 });

  function observarReveals(raiz = document) {
    raiz.querySelectorAll('.card-produto, .pill-categoria, .spec-cartao, .banda-ink-grelha > div').forEach((el, i) => {
      el.classList.add('revelar');
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 60}ms`;
      observador.observe(el);
    });
  }

  // ============================================================
  // FAVORITOS (coração nos cards, localStorage)
  // ============================================================
  const CHAVE_FAVORITOS = 'tg_favoritos';
  function lerFavoritos() {
    try { return JSON.parse(localStorage.getItem(CHAVE_FAVORITOS)) || []; }
    catch { return []; }
  }
  function alternarFavorito(id) {
    let favs = lerFavoritos();
    favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
    localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(favs));
    return favs.includes(id);
  }
  // Delegação global: o clique no coração não navega para o produto
  document.addEventListener('click', (e) => {
    const coracao = e.target.closest('.btn-favorito');
    if (!coracao) return;
    e.preventDefault();
    const ativo = alternarFavorito(Number(coracao.dataset.id));
    coracao.classList.toggle('ativo', ativo);
    coracao.querySelector('svg').setAttribute('fill', ativo ? 'currentColor' : 'none');
  });

  // ============================================================
  // RENDERING DE PRODUTOS
  // ============================================================
  function cardProduto(p) {
    const desconto = percentDesconto(p);
    const fav = lerFavoritos().includes(p.id);
    return `
      <a href="/produto/${esc(p.slug)}" class="card-produto">
        <div class="card-media">
          ${desconto ? `<span class="badge-promo">-${desconto}%</span>` : ''}
          <button class="btn-favorito${fav ? ' ativo' : ''}" data-id="${p.id}" aria-label="Adicionar aos favoritos">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M12 20s-7-4.6-9.3-8.6C1 8.4 3 5 6.4 5c2 0 3.6 1.1 4.6 2.7H12c1-1.6 2.6-2.7 4.6-2.7C20 5 22 8.4 20.3 11.4 18 15.4 12 20 12 20z"/>
            </svg>
          </button>
          <img src="${esc(p.imagens[0])}" alt="${esc(p.nome)}" loading="lazy" width="900" height="900">
        </div>
        <h3>${esc(p.nome)}</h3>
        <div class="card-preco">
          <span class="preco-display preco-atual">${formatarPreco(precoEfetivo(p))}</span>
          ${desconto ? `<span class="preco-antigo">${formatarPreco(p.preco)}</span>` : ''}
        </div>
      </a>`;
  }

  // --- Home: destaques ---
  async function paginaHome() {
    const grelha = document.getElementById('grelha-destaques');
    try {
      const res = await fetch('/api/produtos/destaques');
      const produtos = await res.json();
      grelha.innerHTML = produtos.slice(0, 8).map(cardProduto).join('');
      observarReveals(grelha);
    } catch {
      grelha.innerHTML = '<p class="estado-vazio">Não foi possível carregar os produtos. Atualiza a página.</p>';
    }

    // Produto em destaque (spotlight) + secção "Em tendência"
    try {
      const todos = await (await fetch('/api/produtos')).json();

      // --- Spotlight: produto a destacar (por slug; fallback = mais avaliado em promo) ---
      const SLUG_DESTAQUE = 'candeeiro-de-por-do-sol-led-projetor-de-luz-ambiente-usb';
      let destaque = todos.find(p => p.slug === SLUG_DESTAQUE);
      if (!destaque) {
        const ordenados = [...todos].sort((a, b) => (b.num_avaliacoes || 0) - (a.num_avaliacoes || 0));
        destaque = ordenados.find(p => p.preco_promo) || ordenados[0];
      }
      const spot = document.getElementById('seccao-spotlight');
      if (destaque && spot) {
        const desc = percentDesconto(destaque);
        document.getElementById('spotlight-link').href = `/produto/${destaque.slug}`;
        document.getElementById('spotlight-img').src = destaque.imagens[0] || '';
        document.getElementById('spotlight-img').alt = destaque.nome;
        document.getElementById('spotlight-nome').textContent = destaque.nome;
        document.getElementById('spotlight-desc').textContent = (destaque.descricao || '').slice(0, 160) + ((destaque.descricao || '').length > 160 ? '…' : '');
        document.getElementById('spotlight-preco').textContent = formatarPreco(precoEfetivo(destaque));
        if (desc) {
          const badge = document.getElementById('spotlight-badge');
          badge.textContent = `-${desc}%`; badge.hidden = false;
          const antigo = document.getElementById('spotlight-preco-antigo');
          antigo.textContent = formatarPreco(destaque.preco); antigo.hidden = false;
        }
        if (destaque.em_tendencia) document.getElementById('spotlight-tag').hidden = false;
        if (destaque.rating) {
          const estrelas = '★'.repeat(Math.round(destaque.rating)) + '☆'.repeat(5 - Math.round(destaque.rating));
          document.getElementById('spotlight-rating').innerHTML =
            `<span class="spotlight-estrelas">${estrelas}</span> <span>${String(destaque.rating).replace('.', ',')}</span> <span class="spotlight-aval">(${(destaque.num_avaliacoes || 0).toLocaleString('pt-PT')} avaliações)</span>`;
        }
        spot.hidden = false;
      }

      // --- Em tendência: só aparece se houver produtos marcados ---
      const tendencia = todos.filter(p => p.em_tendencia).slice(0, 4);
      const seccao = document.getElementById('seccao-tendencia');
      const grelhaT = document.getElementById('grelha-tendencia');
      if (tendencia.length && seccao && grelhaT) {
        grelhaT.innerHTML = tendencia.map(cardProduto).join('');
        seccao.hidden = false;
        observarReveals(grelhaT);
      }
    } catch { /* secção opcional; ignora falha */ }

    iniciarHeroCarousel();
  }

  function iniciarHeroCarousel() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    if (slides.length < 2) return;
    let atual = 0;
    let timer;

    function irPara(idx) {
      slides[atual].classList.add('hero-sair');
      setTimeout(() => {
        slides[atual].classList.remove('hero-slide--ativo', 'hero-sair');
        atual = idx;
        slides[atual].classList.add('hero-slide--ativo', 'hero-entrar');
        setTimeout(() => slides[atual].classList.remove('hero-entrar'), 450);
        dots.forEach((d, i) => d.classList.toggle('hero-dot--ativo', i === atual));
      }, 450);
    }

    function avancar() { irPara((atual + 1) % slides.length); }

    timer = setInterval(avancar, 6000);
    dots.forEach((d, i) => d.addEventListener('click', () => { clearInterval(timer); irPara(i); timer = setInterval(avancar, 6000); }));
  }

  // --- Listagem com filtros (+ coleções da nav: tendências/novidades) ---
  async function paginaProdutos() {
    const grelha = document.getElementById('grelha-produtos');
    const filtros = document.getElementById('filtros');
    const vazio = document.getElementById('estado-vazio');
    const nomesCategorias = { iluminacao: 'Iluminação', audio: 'Áudio', wearables: 'Wearables', setup: 'Setup', wellness: 'Wellness' };

    const colecao = new URLSearchParams(location.search).get('colecao') || '';
    const titulo = document.querySelector('.seccao-listagem h1');
    if (titulo && colecao === 'tendencias') titulo.textContent = 'Em tendência';
    if (titulo && colecao === 'novidades') titulo.textContent = 'Novidades';

    // Carrega categorias para os botões de filtro
    try {
      const cats = await (await fetch('/api/categorias')).json();
      for (const c of cats) {
        const b = document.createElement('button');
        b.className = 'filtro';
        b.dataset.categoria = c;
        b.textContent = nomesCategorias[c] || c;
        filtros.appendChild(b);
      }
    } catch { /* sem filtros, a listagem continua a funcionar */ }

    async function carregar(categoria) {
      grelha.innerHTML = '<div class="skeleton-card"></div>'.repeat(4);
      vazio.hidden = true;
      try {
        const url = categoria ? `/api/produtos?categoria=${encodeURIComponent(categoria)}` : '/api/produtos';
        let produtos = await (await fetch(url)).json();
        if (colecao === 'tendencias') produtos = produtos.filter(p => p.em_tendencia);
        if (produtos.length === 0) {
          grelha.innerHTML = '';
          vazio.hidden = false;
          return;
        }
        grelha.innerHTML = produtos.map(cardProduto).join('');
        observarReveals(grelha);
      } catch {
        grelha.innerHTML = '<p class="estado-vazio">Não foi possível carregar os produtos. Atualiza a página.</p>';
      }
    }

    filtros.addEventListener('click', (e) => {
      const botao = e.target.closest('.filtro');
      if (!botao) return;
      filtros.querySelectorAll('.filtro').forEach(b => b.classList.remove('ativo'));
      botao.classList.add('ativo');
      carregar(botao.dataset.categoria);
    });

    // Suporta /produtos?categoria=x vindo da home
    const inicial = new URLSearchParams(location.search).get('categoria') || '';
    const botaoInicial = filtros.querySelector(`[data-categoria="${inicial}"]`);
    if (botaoInicial) {
      filtros.querySelectorAll('.filtro').forEach(b => b.classList.remove('ativo'));
      botaoInicial.classList.add('ativo');
    }
    carregar(inicial);
  }

  // --- Página de produto ---
  async function paginaProduto() {
    const slug = location.pathname.split('/').pop();
    let p;
    try {
      const res = await fetch(`/api/produtos/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error();
      p = await res.json();
    } catch {
      document.getElementById('produto-detalhe').hidden = true;
      document.getElementById('produto-nao-encontrado').hidden = false;
      return;
    }

    document.title = `${p.nome} | ${LOJA.nome}`;
    document.getElementById('produto-nome').textContent = p.nome;
    document.getElementById('produto-descricao').textContent = p.descricao;
    document.getElementById('produto-envio-nota').textContent =
      `Envio em ${p.tempo_envio_dias} dias com tracking · devoluções até 14 dias`;

    // Pill "Em tendência"
    if (p.em_tendencia) document.getElementById('pill-tendencia').hidden = false;

    // Social: estrelas + avaliações + TikTok
    const estrela = (cheia) => `<svg width="19" height="19" viewBox="0 0 24 24" fill="${cheia ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6 1-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-1z"/></svg>`;
    const cheias = Math.round(p.rating);
    document.getElementById('produto-estrelas').innerHTML =
      Array.from({ length: 5 }, (_, i) => estrela(i < cheias)).join('');
    document.getElementById('produto-rating').textContent = String(p.rating).replace('.', ',');
    document.getElementById('produto-avaliacoes').textContent = `${p.num_avaliacoes} avaliações`;
    if (p.tiktok_views) {
      document.getElementById('tiktok-sep').hidden = false;
      const tiktok = document.getElementById('produto-tiktok');
      tiktok.textContent = `${p.tiktok_views} views no TikTok`;
      tiktok.hidden = false;
    }

    // Preço (com promo, badge de desconto e poupança)
    const desconto = percentDesconto(p);
    document.getElementById('produto-preco').textContent = formatarPreco(precoEfetivo(p));
    if (desconto) {
      const antigo = document.getElementById('produto-preco-antigo');
      antigo.textContent = formatarPreco(p.preco);
      antigo.hidden = false;
      const badge = document.getElementById('badge-desconto');
      badge.textContent = `-${desconto}%`;
      badge.hidden = false;
      const poupanca = document.getElementById('pill-poupanca');
      poupanca.textContent = `Poupas ${formatarPreco(p.preco - p.preco_promo)}`;
      poupanca.hidden = false;
    }

    // Favorito no detalhe
    const fav = document.getElementById('produto-favorito');
    fav.dataset.id = p.id;
    if (lerFavoritos().includes(p.id)) {
      fav.classList.add('ativo');
      fav.querySelector('svg').setAttribute('fill', 'currentColor');
    }

    // Variantes (multi-dimensionais) ou cores legacy
    const variantesAtivas = {};
    const varDims = p.variantes && p.variantes.length > 0 ? p.variantes : (p.cores && p.cores.length > 0 ? [{ titulo: 'Cor', tipo: 'cor', opcoes: p.cores }] : []);

    if (varDims.length > 0) {
      const coresEl = document.getElementById('produto-cores');
      const swatchesEl = document.getElementById('cores-swatches');
      coresEl.hidden = false;

      swatchesEl.innerHTML = varDims.map((dim, di) => {
        variantesAtivas[dim.titulo] = dim.opcoes[0]?.nome || '';
        const opcaoHTML = dim.opcoes.map((op, oi) => {
          // 1. Variante com foto → miniatura clicável que troca a imagem principal
          if (op.imagem) {
            return `<button class="variante-foto${oi === 0 ? ' ativo' : ''}" role="radio" aria-checked="${oi === 0}" aria-label="${esc(op.nome)}" data-dim="${esc(dim.titulo)}" data-val="${esc(op.nome)}" data-img="${esc(op.imagem)}" title="${esc(op.nome)}"><img src="${esc(op.imagem)}" alt="${esc(op.nome)}" loading="lazy" width="56" height="56"></button>`;
          }
          // 2. Swatch de cor só quando há um hex REAL e distinto (não o placeholder cinzento).
          const hexLimpo = (op.hex || '').toLowerCase();
          const hexValido = /^#[0-9a-fA-F]{3,6}$/.test(hexLimpo) && hexLimpo !== '#888888' && hexLimpo !== '#888';
          if (dim.tipo === 'cor' && hexValido) {
            return `<button class="swatch${oi === 0 ? ' ativo' : ''}" style="background:${op.hex}" role="radio" aria-checked="${oi === 0}" aria-label="${esc(op.nome)}" data-dim="${esc(dim.titulo)}" data-val="${esc(op.nome)}" title="${esc(op.nome)}"></button>`;
          }
          // 3. Sem cor nem foto → botão de texto com o nome (descritivo e legível)
          return `<button class="variante-btn${oi === 0 ? ' ativo' : ''}" role="radio" aria-checked="${oi === 0}" data-dim="${esc(dim.titulo)}" data-val="${esc(op.nome)}">${esc(op.nome)}</button>`;
        }).join('');
        return `<div class="variante-grupo" style="margin-bottom:10px">
          <span class="rotulo-mini" style="display:block;margin-bottom:6px">${esc(dim.titulo)}: <strong id="sel-${di}">${esc(dim.opcoes[0]?.nome || '')}</strong></span>
          <div role="radiogroup" aria-label="${esc(dim.titulo)}" data-grupo="${di}">${opcaoHTML}</div>
        </div>`;
      }).join('');

      swatchesEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-dim]');
        if (!b) return;
        const dim = b.dataset.dim;
        const val = b.dataset.val;
        const grupo = b.closest('[role=radiogroup]');
        grupo.querySelectorAll('[data-dim]').forEach(s => {
          s.classList.toggle('ativo', s === b);
          s.setAttribute('aria-checked', s === b ? 'true' : 'false');
        });
        variantesAtivas[dim] = val;
        const idx = b.closest('.variante-grupo').querySelector('[role=radiogroup]').dataset.grupo;
        document.getElementById('sel-' + idx).textContent = val;
        // Variante com foto → trocar a imagem principal da galeria
        if (b.dataset.img) {
          const imgPrincipal = document.getElementById('galeria-imagem');
          if (imgPrincipal) imgPrincipal.src = b.dataset.img;
        }
      });
    }

    function varianteEscolhida() {
      const vals = Object.values(variantesAtivas);
      return vals.length ? vals.join(' / ') : null;
    }

    // Cartões de specs (Garantia, Aquecimento, ...)
    if (p.specs.length > 0) {
      const specs = document.getElementById('produto-specs');
      specs.innerHTML = p.specs.map(s => `
        <div class="spec-cartao">
          <span class="spec-icone">${iconeSpec(s.icone)}</span>
          <div><small>${s.label}</small><strong>${s.valor}</strong></div>
        </div>`).join('');
      specs.hidden = false;
    }

    // Galeria
    const imgPrincipal = document.getElementById('galeria-imagem');
    imgPrincipal.src = p.imagens[0];
    imgPrincipal.alt = p.nome;
    const thumbs = document.getElementById('galeria-thumbs');
    let galeriaIdx = 0;
    function mostrarImagem(i) {
      if (i < 0 || i >= p.imagens.length || i === galeriaIdx) return;
      galeriaIdx = i;
      imgPrincipal.src = p.imagens[i];
      thumbs.querySelectorAll('button').forEach((b, bi) => b.classList.toggle('ativo', bi === i));
    }
    if (p.imagens.length > 1) {
      thumbs.innerHTML = p.imagens.map((src, i) =>
        `<button class="${i === 0 ? 'ativo' : ''}" aria-label="Imagem ${i + 1}"><img src="${src}" alt="" loading="lazy"></button>`
      ).join('');
      thumbs.addEventListener('click', (e) => {
        const botao = e.target.closest('button');
        if (!botao) return;
        mostrarImagem([...thumbs.children].indexOf(botao));
      });
      // Swipe (deslizar) no mobile para mudar de foto
      const galeria = document.querySelector('.galeria-principal');
      let x0 = null, y0 = null;
      galeria.addEventListener('touchstart', (e) => {
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      }, { passive: true });
      galeria.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        // só conta como swipe horizontal se for claramente lateral
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          mostrarImagem(dx < 0 ? Math.min(galeriaIdx + 1, p.imagens.length - 1)
                                : Math.max(galeriaIdx - 1, 0));
        }
        x0 = null; y0 = null;
      }, { passive: true });
    }

    // Quantidade + adicionar
    let qtd = 1;
    const qtdValor = document.getElementById('qtd-valor');
    document.getElementById('qtd-menos').addEventListener('click', () => {
      qtd = Math.max(1, qtd - 1); qtdValor.textContent = qtd;
    });
    document.getElementById('qtd-mais').addEventListener('click', () => {
      qtd = Math.min(10, qtd + 1); qtdValor.textContent = qtd;
    });

    const btnAdicionar = document.getElementById('btn-adicionar');
    const compraBar = document.getElementById('compra-bar');
    const compraBarBtn = document.getElementById('compra-bar-btn');
    document.getElementById('compra-bar-preco').textContent = formatarPreco(precoEfetivo(p));

    // Feedback visual ao adicionar: o botão confirma durante 1,2s
    function adicionarComFeedback(botao) {
      adicionarAoCarrinho(p, qtd, varianteEscolhida());
      const original = botao.textContent;
      botao.textContent = 'Adicionado ✓';
      botao.disabled = true;
      setTimeout(() => { botao.textContent = original; botao.disabled = false; }, 1200);
    }

    if (!p.disponivel) {
      btnAdicionar.disabled = true;
      btnAdicionar.style.opacity = '0.5';
      document.getElementById('produto-indisponivel').hidden = false;
      // barra mobile fica escondida se o produto não está disponível
    } else {
      btnAdicionar.addEventListener('click', () => adicionarComFeedback(btnAdicionar));
      compraBar.hidden = false;
      compraBarBtn.addEventListener('click', () => adicionarComFeedback(compraBarBtn));
    }

    observarReveals();

    // Produtos relacionados: mesma categoria, sem o produto atual
    try {
      const todos = await (await fetch(`/api/produtos?categoria=${encodeURIComponent(p.categoria)}`)).json();
      let relacionados = todos.filter(r => r.slug !== p.slug);
      // Se a categoria tiver poucos, completa com outros produtos
      if (relacionados.length < 2) {
        const extra = await (await fetch('/api/produtos')).json();
        relacionados = relacionados.concat(
          extra.filter(r => r.slug !== p.slug && !relacionados.some(x => x.slug === r.slug))
        );
      }
      relacionados = relacionados.slice(0, 4);
      if (relacionados.length > 0) {
        const grelha = document.getElementById('grelha-relacionados');
        grelha.innerHTML = relacionados.map(cardProduto).join('');
        document.getElementById('seccao-relacionados').hidden = false;
        observarReveals(grelha);
      }
    } catch { /* secção fica escondida se falhar */ }
  }

  // --- Checkout ---
  function paginaCheckout() {
    const itens = lerCarrinho();
    // Guard: checkout com carrinho vazio volta para os produtos
    if (itens.length === 0) {
      location.replace('/produtos');
      return;
    }

    // Resumo da encomenda (mesmas regras de portes do drawer)
    const subtotal = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const envioGratis = subtotal >= LOJA.portesGratisAPartirDe;
    const envio = envioGratis ? 0 : LOJA.portes;
    document.getElementById('checkout-itens').innerHTML = itens.map(i => `
      <div class="checkout-item">
        <img src="${esc(i.imagem)}" alt="" width="48" height="48">
        <span>${esc(i.nome)}${(i.variante || i.cor) ? ` <small>· ${esc(i.variante || i.cor)}</small>` : ''} × ${i.qtd}</span>
        <strong>${formatarPreco(i.preco * i.qtd)}</strong>
      </div>`).join('');
    document.getElementById('checkout-subtotal').textContent = formatarPreco(subtotal);
    document.getElementById('checkout-envio').textContent = envioGratis ? 'Grátis 🎉' : formatarPreco(envio);
    document.getElementById('checkout-total').textContent = formatarPreco(subtotal + envio);

    // Validações client-side (as mesmas regras do servidor)
    const REGRAS = {
      nome: v => v.trim().length >= 3 || 'Indica o teu nome completo.',
      email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || 'Email inválido.',
      telefone: v => /^\d{9}$/.test(v) || 'O telefone são 9 dígitos (ex: 912345678).',
      morada: v => v.trim().length >= 5 || 'Indica a morada completa.',
      codigo_postal: v => /^\d{4}-\d{3}$/.test(v) || 'Formato: 0000-000.',
      cidade: v => v.trim().length >= 2 || 'Indica a cidade.',
      pais: v => v.trim().length >= 2 || 'Indica o país.'
    };
    const form = document.getElementById('form-checkout');

    function mostrarErros(erros) {
      form.querySelectorAll('.erro-campo').forEach(el => { el.hidden = true; });
      form.querySelectorAll('input').forEach(el => el.classList.remove('invalido'));
      document.getElementById('checkout-erro-geral').hidden = true;
      let primeiro = null;
      for (const [campo, msg] of Object.entries(erros)) {
        const aviso = form.querySelector(`[data-erro="${campo}"]`);
        const input = form.querySelector(`[name="${campo}"]`);
        if (aviso) { aviso.textContent = msg; aviso.hidden = false; }
        if (input) { input.classList.add('invalido'); primeiro ??= input; }
      }
      primeiro?.focus();
    }

    // Ajuda na escrita do código postal: 1234567 → 1234-567
    const cp = document.getElementById('f-cp');
    cp.addEventListener('input', () => {
      const d = cp.value.replace(/\D/g, '').slice(0, 7);
      cp.value = d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = Object.fromEntries(new FormData(form));
      const erros = {};
      for (const [campo, regra] of Object.entries(REGRAS)) {
        const resultado = regra(dados[campo] || '');
        if (resultado !== true) erros[campo] = resultado;
      }
      if (Object.keys(erros).length > 0) {
        mostrarErros(erros);
        return;
      }

      const botao = document.getElementById('btn-pagar');
      const erroGeral = document.getElementById('checkout-erro-geral');
      erroGeral.hidden = true;
      botao.disabled = true;
      botao.textContent = 'A processar…';
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: dados,
            items: lerCarrinho().map(i => ({ id: i.id, qtd: i.qtd, variante: i.variante || i.cor || null }))
          })
        });
        const resposta = await res.json();
        if (!res.ok) {
          if (resposta.erros) mostrarErros(resposta.erros);
          else { erroGeral.textContent = resposta.erro || 'Algo correu mal. Tenta novamente.'; erroGeral.hidden = false; }
          return;
        }
        location.href = resposta.url; // Stripe (ou /obrigado em modo dev)
      } catch {
        erroGeral.textContent = 'Sem ligação ao servidor. Tenta novamente.';
        erroGeral.hidden = false;
      } finally {
        botao.disabled = false;
        botao.textContent = 'Continuar para pagamento';
      }
    });
  }

  // --- Obrigado (confirmação da encomenda) ---
  async function paginaObrigado() {
    const numero = new URLSearchParams(location.search).get('enc');
    let enc;
    try {
      const res = await fetch(`/api/encomendas/${encodeURIComponent(numero || '')}`);
      if (!res.ok) throw new Error();
      enc = await res.json();
    } catch {
      document.getElementById('obrigado-nao-encontrado').hidden = false;
      return;
    }

    // A compra terminou: limpa o carrinho
    localStorage.removeItem(CHAVE_CARRINHO);
    atualizarContador();
    // Pixels: Purchase (só dispara uma vez — guarda flag para evitar re-fires)
    const flagPx = `tg_px_${enc.numero_encomenda}`;
    if (!sessionStorage.getItem(flagPx)) {
      sessionStorage.setItem(flagPx, '1');
      const val = (enc.total / 100).toFixed(2);
      const ids = enc.items.map(i => String(i.produto_id));
      if (window.fbq) fbq('track', 'Purchase', { value: val, currency: 'EUR', content_ids: ids, content_type: 'product' });
      if (window.ttq) ttq.track('CompletePayment', { value: val, currency: 'EUR', content_id: ids[0] });
    }

    document.getElementById('obrigado-numero').textContent = enc.numero_encomenda;
    const estado = document.getElementById('obrigado-estado');
    if (enc.estado_pagamento === 'paga') {
      estado.textContent = 'Pagamento confirmado ✓';
      estado.classList.add('estado-pago');
    } else {
      // O webhook do Stripe pode demorar uns segundos
      estado.textContent = 'A confirmar pagamento… recebes o email de confirmação em breve.';
    }

    document.getElementById('obrigado-itens').innerHTML = enc.items.map(i => `
      <div class="checkout-item">
        <span>${esc(i.nome)}${(i.variante || i.cor) ? ` <small>· ${esc(i.variante || i.cor)}</small>` : ''} × ${i.qtd}</span>
        <strong>${formatarPreco(i.preco_unit * i.qtd)}</strong>
      </div>`).join('');
    document.getElementById('obrigado-subtotal').textContent = formatarPreco(enc.subtotal);
    document.getElementById('obrigado-envio').textContent = enc.portes === 0 ? 'Grátis 🎉' : formatarPreco(enc.portes);
    document.getElementById('obrigado-total').textContent = formatarPreco(enc.total);
    document.getElementById('obrigado-prazo').textContent =
      `Prazo de entrega estimado: ${enc.prazo_envio_dias} dias, com tracking incluído.`;
    document.getElementById('obrigado-cartao').hidden = false;
  }

  // ============================================================
  // ARRANQUE
  // ============================================================
  // Substitui o valor de portes grátis vindos do config
  document.querySelectorAll('[data-portes-gratis]').forEach(el => {
    el.textContent = formatarPreco(LOJA.portesGratisAPartirDe);
  });

  // Link ativo na navegação
  const navAtual = { produtos: 'produtos', produto: 'produtos', carrinho: '', home: '' }[document.body.dataset.page];
  const colecaoAtual = new URLSearchParams(location.search).get('colecao');
  document.querySelectorAll('.nav a').forEach(a => {
    const alvo = a.dataset.nav;
    const ativo = colecaoAtual ? alvo === colecaoAtual : (alvo === navAtual && document.body.dataset.page === 'produtos');
    a.classList.toggle('ativo', ativo);
  });

  atualizarContador();
  renderizarTudo();
  iniciarParallax();
  observarReveals();

  const pagina = document.body.dataset.page;
  if (pagina === 'home') paginaHome();
  if (pagina === 'produtos') paginaProdutos();
  if (pagina === 'produto') paginaProduto();
  if (pagina === 'checkout') paginaCheckout();
  if (pagina === 'obrigado') paginaObrigado();

  // Ping ao servidor a cada 60s para contar visitantes ao vivo
  function ping() {
    const carrinho = JSON.parse(localStorage.getItem('tg_carrinho') || '[]');
    fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagina, temCarrinho: carrinho.length > 0 })
    }).catch(() => {});
  }
  ping();
  setInterval(ping, 60000);
})();
