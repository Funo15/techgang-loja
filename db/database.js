// ============================================================
// INICIALIZAÇÃO DA BASE DE DADOS
// Cria o ficheiro SQLite, aplica o schema e faz seed com
// 8 produtos fictícios na primeira execução.
// ============================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'loja.db'));
db.pragma('journal_mode = WAL');

// Aplica o schema (idempotente: usa IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ------------------------------------------------------------
// SEED — só corre se a tabela de produtos estiver vazia.
// Custos do fornecedor reais-fictícios com margem de 3-4x.
// Imagens: placeholders locais às riscas (rota /img/p/...),
// substituir pelos assets reais dos fornecedores mais tarde.
// ------------------------------------------------------------
function img(slug, n) {
  // Gera n URLs de imagem estáveis para o mesmo produto
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => `/img/p/${slug}/${i + 1}.svg`)
  );
}

// Paleta padrão de variantes (a maioria dos gadgets TikTok vem nestas cores)
const CORES = {
  preto: { nome: 'Preto', hex: '#15141A' },
  roxo: { nome: 'Roxo', hex: '#6C4BE0' },
  cinza: { nome: 'Cinza', hex: '#E5E4EB' },
  branco: { nome: 'Branco', hex: '#FFFFFF' },
  rosa: { nome: 'Rosa', hex: '#F2B8D0' }
};

const totalProdutos = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;

if (totalProdutos === 0) {
  const inserir = db.prepare(`
    INSERT INTO products
      (nome, slug, descricao, preco, preco_promo, categoria, imagens, ativo, destaque,
       fornecedor, fornecedor_url, fornecedor_product_id, custo_fornecedor, tempo_envio_dias, disponivel,
       rating, num_avaliacoes, tiktok_views, em_tendencia, cores, specs)
    VALUES
      (@nome, @slug, @descricao, @preco, @preco_promo, @categoria, @imagens, 1, @destaque,
       @fornecedor, @fornecedor_url, @fornecedor_product_id, @custo_fornecedor, @tempo_envio_dias, 1,
       @rating, @num_avaliacoes, @tiktok_views, @em_tendencia, @cores, @specs)
  `);

  const produtos = [
    {
      nome: 'Galaxy Projector LED',
      slug: 'galaxy-projector',
      descricao: 'A tua galáxia no quarto. Selecionado e testado pela equipa TechGang — qualidade que se sente, ao preço justo.',
      preco: 3999, preco_promo: 2499, categoria: 'iluminacao', imagens: img('galaxy-projector', 3), destaque: 1,
      fornecedor: 'CJ', fornecedor_url: 'https://cjdropshipping.com/product/exemplo-galaxy', fornecedor_product_id: 'CJ-GP-2201',
      custo_fornecedor: 720, tempo_envio_dias: '8-12',
      rating: 4.8, num_avaliacoes: 540, tiktok_views: '128K', em_tendencia: 1,
      cores: JSON.stringify([CORES.preto, CORES.roxo, CORES.cinza]),
      specs: JSON.stringify([
        { icone: 'escudo', label: 'Garantia', valor: '24 meses' },
        { icone: 'energia', label: 'Aquecimento', valor: '42 °C' }
      ])
    },
    {
      nome: 'Neck Massager Pro',
      slug: 'neck-massager-pro',
      descricao: 'Massajador de pescoço com calor e 4 modos de intensidade. O fim dos dias de tensão acumulada — em 15 minutos por dia.',
      preco: 4999, preco_promo: 3499, categoria: 'wellness', imagens: img('neck-massager-pro', 3), destaque: 1,
      fornecedor: 'CJ', fornecedor_url: 'https://cjdropshipping.com/product/exemplo-neck', fornecedor_product_id: 'CJ-NM-1107',
      custo_fornecedor: 980, tempo_envio_dias: '8-12',
      rating: 4.7, num_avaliacoes: 412, tiktok_views: '96K', em_tendencia: 1,
      cores: JSON.stringify([CORES.preto, CORES.cinza]),
      specs: JSON.stringify([
        { icone: 'bateria', label: 'Autonomia', valor: '6 horas' },
        { icone: 'energia', label: 'Calor', valor: '3 níveis' }
      ])
    },
    {
      nome: 'Magnetic Charger 3-em-1',
      slug: 'magnetic-charger-3em1',
      descricao: 'Carregador magnético dobrável: telemóvel, earbuds e smartwatch ao mesmo tempo. Dobra ao tamanho de um cartão de bolso.',
      preco: 2999, preco_promo: 2299, categoria: 'setup', imagens: img('magnetic-charger-3em1', 3), destaque: 1,
      fornecedor: 'CJ', fornecedor_url: 'https://cjdropshipping.com/product/exemplo-tridock', fornecedor_product_id: 'CJ-TD-7708',
      custo_fornecedor: 840, tempo_envio_dias: '8-12',
      rating: 4.9, num_avaliacoes: 287, tiktok_views: '210K', em_tendencia: 1,
      cores: JSON.stringify([CORES.preto, CORES.roxo, CORES.branco]),
      specs: JSON.stringify([
        { icone: 'energia', label: 'Potência', valor: '15W' },
        { icone: 'escudo', label: 'Garantia', valor: '24 meses' }
      ])
    },
    {
      nome: 'Sunset Lamp',
      slug: 'sunset-lamp',
      descricao: 'O pôr-do-sol dentro de casa. Projeção quente regulável a 180° — o fundo perfeito para fotos e vídeos.',
      preco: 1999, preco_promo: null, categoria: 'iluminacao', imagens: img('sunset-lamp', 3), destaque: 1,
      fornecedor: 'AliExpress', fornecedor_url: 'https://aliexpress.com/item/exemplo-sunset', fornecedor_product_id: 'AE-SL-8842',
      custo_fornecedor: 460, tempo_envio_dias: '10-15',
      rating: 4.6, num_avaliacoes: 198, tiktok_views: '74K', em_tendencia: 0,
      cores: JSON.stringify([CORES.preto, CORES.rosa]),
      specs: JSON.stringify([
        { icone: 'sol', label: 'Rotação', valor: '180°' },
        { icone: 'energia', label: 'Alimentação', valor: 'USB-C' }
      ])
    },
    {
      nome: 'Pulse Buds',
      slug: 'pulse-buds',
      descricao: 'Auriculares true wireless com cancelamento de ruído ativo, caixa de carga USB-C e 28 horas de autonomia total.',
      preco: 3490, preco_promo: null, categoria: 'audio', imagens: img('pulse-buds', 4), destaque: 0,
      fornecedor: 'CJ', fornecedor_url: 'https://cjdropshipping.com/product/exemplo-buds', fornecedor_product_id: 'CJ-PB-1107',
      custo_fornecedor: 920, tempo_envio_dias: '8-12',
      rating: 4.7, num_avaliacoes: 351, tiktok_views: null, em_tendencia: 0,
      cores: JSON.stringify([CORES.preto, CORES.branco]),
      specs: JSON.stringify([
        { icone: 'bateria', label: 'Autonomia', valor: '28 horas' },
        { icone: 'onda', label: 'ANC', valor: 'Ativo' }
      ])
    },
    {
      nome: 'Vector S Watch',
      slug: 'vector-s-watch',
      descricao: 'Smartwatch com ecrã AMOLED de 1,8", monitorização de sono e ritmo cardíaco, notificações e 7 dias de bateria.',
      preco: 5490, preco_promo: 4790, categoria: 'wearables', imagens: img('vector-s-watch', 4), destaque: 1,
      fornecedor: 'AliExpress', fornecedor_url: 'https://aliexpress.com/item/exemplo-vector', fornecedor_product_id: 'AE-VS-5520',
      custo_fornecedor: 1480, tempo_envio_dias: '10-15',
      rating: 4.5, num_avaliacoes: 623, tiktok_views: '52K', em_tendencia: 0,
      cores: JSON.stringify([CORES.preto, CORES.roxo, CORES.cinza]),
      specs: JSON.stringify([
        { icone: 'bateria', label: 'Bateria', valor: '7 dias' },
        { icone: 'gota', label: 'Resistência', valor: 'IP68' }
      ])
    },
    {
      nome: 'Glow Strip 5m',
      slug: 'glow-strip-5m',
      descricao: 'Fita LED de 5 metros com controlo por app, 16 milhões de cores e modos de sincronização com música. Adesivo 3M incluído.',
      preco: 1890, preco_promo: 1490, categoria: 'iluminacao', imagens: img('glow-strip-5m', 3), destaque: 0,
      fornecedor: 'AliExpress', fornecedor_url: 'https://aliexpress.com/item/exemplo-glow', fornecedor_product_id: 'AE-GS-8842',
      custo_fornecedor: 460, tempo_envio_dias: '10-15',
      rating: 4.6, num_avaliacoes: 884, tiktok_views: '310K', em_tendencia: 1,
      cores: JSON.stringify([CORES.branco]),
      specs: JSON.stringify([
        { icone: 'sol', label: 'Cores', valor: '16M' },
        { icone: 'onda', label: 'Modo música', valor: 'Sim' }
      ])
    },
    {
      nome: 'Type 77 Keyboard',
      slug: 'type-77-keyboard',
      descricao: 'Teclado mecânico 75% com switches red, keycaps two-tone e retroiluminação branca. Bluetooth + 2.4GHz + cabo.',
      preco: 6990, preco_promo: null, categoria: 'setup', imagens: img('type-77-keyboard', 4), destaque: 0,
      fornecedor: 'AliExpress', fornecedor_url: 'https://aliexpress.com/item/exemplo-type77', fornecedor_product_id: 'AE-TK-9914',
      custo_fornecedor: 1980, tempo_envio_dias: '10-15',
      rating: 4.8, num_avaliacoes: 167, tiktok_views: null, em_tendencia: 0,
      cores: JSON.stringify([CORES.preto, CORES.branco, CORES.roxo]),
      specs: JSON.stringify([
        { icone: 'bateria', label: 'Autonomia', valor: '30 dias' },
        { icone: 'onda', label: 'Ligação', valor: 'BT + 2.4G' }
      ])
    }
  ];

  const seedTudo = db.transaction((lista) => {
    for (const p of lista) inserir.run(p);
  });
  seedTudo(produtos);

  console.log(`[db] Seed concluído: ${produtos.length} produtos inseridos.`);
}

module.exports = db;
