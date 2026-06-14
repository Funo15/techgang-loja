const db = require('./db/database');

const cores = JSON.stringify([
  { nome: 'Preto', hex: '#15141A' },
  { nome: 'Branco', hex: '#FFFFFF' },
  { nome: 'Branco Linhas', hex: '#F2F2EE' }
]);

const specs = JSON.stringify([
  { icone: '⌨️', label: 'Teclas', valor: '68 (formato 65%)' },
  { icone: '🎨', label: 'RGB', valor: 'Retroiluminação completa' },
  { icone: '🔧', label: 'Hot-swap', valor: 'Troca de switches sem soldar' },
  { icone: '🔌', label: 'Ligação', valor: 'USB com fio' }
]);

const imagens = JSON.stringify([
  'https://ae-pic-a1.aliexpress-media.com/kf/S5fba8b368ce644a0a4c793b94d26fef9e.png_960x960.png',
  'https://ae-pic-a1.aliexpress-media.com/kf/S355a17367ed743a79a69271fc01da826G.png_960x960.png',
  'https://ae-pic-a1.aliexpress-media.com/kf/S44ce55b4bf9f47dbaa9f47c9975b2761y.png_960x960.png',
  'https://ae-pic-a1.aliexpress-media.com/kf/S7c53bdccb5f74d0bbbd5c735b6fa59dfU.png_960x960.png',
  'https://ae-pic-a1.aliexpress-media.com/kf/S5688e5a91e9b477babdfdc367906cfdfD.png_960x960.png',
  'https://ae-pic-a1.aliexpress-media.com/kf/Sf3bbee47650a401cb4d5ea3a4dfc0f2e2.png_960x960.png'
]);

const r = db.prepare(`
  INSERT INTO products
    (nome, slug, descricao, preco, preco_promo, categoria, imagens, ativo, destaque,
     fornecedor, fornecedor_url, fornecedor_product_id, custo_fornecedor,
     tempo_envio_dias, disponivel, rating, num_avaliacoes, cores, specs)
  VALUES (?,?,?,?,?,?,?,1,1,?,?,?,?,?,1,?,?,?,?)
`).run(
  'Ajazz NK68 — Teclado Mecânico RGB 68 Teclas',
  'ajazz-nk68-teclado-mecanico',
  'O Ajazz NK68 é um teclado mecânico compacto de 65% com 68 teclas. Switches hot-swap permitem trocar os switches sem soldar. Retroiluminação RGB totalmente personalizável. Mais de 2.000 unidades vendidas e 4.9 estrelas em 443 avaliações.',
  5990, 4990, 'Teclados', imagens,
  'AliExpress',
  'https://pt.aliexpress.com/item/1005010037253589.html',
  '1005010037253589',
  3200, '8-12', 4.9, 443,
  cores, specs
);

console.log('Produto inserido com sucesso! ID:', r.lastInsertRowid);
