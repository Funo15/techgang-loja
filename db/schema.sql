-- ============================================================
-- SCHEMA DA LOJA TECHGANG
-- Preços e custos SEMPRE em cêntimos (INTEGER).
-- ============================================================

-- Produtos
-- Nota dropshipping: NÃO existe campo de stock próprio — o stock
-- é do fornecedor. O campo `disponivel` liga/desliga manualmente.
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,            -- para URLs: /produto/:slug
  descricao TEXT NOT NULL DEFAULT '',
  preco INTEGER NOT NULL,               -- cêntimos
  preco_promo INTEGER,                  -- cêntimos (NULL = sem promoção)
  categoria TEXT NOT NULL,
  imagens TEXT NOT NULL DEFAULT '[]',   -- JSON array de paths/URLs
  ativo INTEGER NOT NULL DEFAULT 1,     -- boolean (0/1)
  destaque INTEGER NOT NULL DEFAULT 0,  -- boolean (0/1) — aparece na home
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Campos de dropshipping
  fornecedor TEXT,                      -- ex: "CJ", "AliExpress", "Gelato"
  fornecedor_url TEXT,                  -- link direto ao produto no fornecedor
  fornecedor_product_id TEXT,           -- para futura integração via API
  custo_fornecedor INTEGER,             -- cêntimos — para calcular margem
  tempo_envio_dias TEXT,                -- texto, ex: "8-12"
  disponivel INTEGER NOT NULL DEFAULT 1, -- boolean — substitui stock próprio

  -- Social proof e variantes (página de produto estilo app)
  rating REAL NOT NULL DEFAULT 4.8,         -- ex: 4.8
  num_avaliacoes INTEGER NOT NULL DEFAULT 0,
  tiktok_views TEXT,                        -- ex: "128K" (NULL = não mostra)
  em_tendencia INTEGER NOT NULL DEFAULT 0,  -- boolean — pill "Em tendência"
  cores TEXT NOT NULL DEFAULT '[]',         -- JSON: [{nome, hex}]
  specs TEXT NOT NULL DEFAULT '[]'          -- JSON: [{icone, label, valor}] (2 cartões)
);

-- Encomendas
-- Só estrutura nesta fase (o checkout vem numa fase seguinte).
-- estado_pagamento e estado_fulfillment são separados porque no
-- dropshipping são fluxos distintos: posso ter pagamento recebido
-- mas ainda não ter encomendado ao fornecedor (e vice-versa).
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_encomenda TEXT NOT NULL UNIQUE, -- formato TG-2026-0001
  nome_cliente TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  morada TEXT NOT NULL,
  codigo_postal TEXT NOT NULL,
  cidade TEXT NOT NULL,
  pais TEXT NOT NULL DEFAULT 'Portugal',
  items TEXT NOT NULL DEFAULT '[]',      -- JSON: [{produto_id, nome, qtd, preco_unit}]
  subtotal INTEGER NOT NULL,             -- cêntimos
  portes INTEGER NOT NULL,               -- cêntimos
  total INTEGER NOT NULL,                -- cêntimos
  metodo_pagamento TEXT,
  estado_pagamento TEXT NOT NULL DEFAULT 'pendente'
    CHECK (estado_pagamento IN ('pendente', 'paga', 'reembolsada', 'cancelada')),
  estado_fulfillment TEXT NOT NULL DEFAULT 'por_encomendar'
    CHECK (estado_fulfillment IN ('por_encomendar', 'encomendada_fornecedor', 'enviada', 'entregue')),
  fornecedor_order_id TEXT,              -- nº da encomenda no fornecedor
  tracking_number TEXT,
  tracking_url TEXT,
  notas_internas TEXT NOT NULL DEFAULT '',
  teste INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Clientes registados
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL DEFAULT '',
  google_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessões de clientes
CREATE TABLE IF NOT EXISTS customer_sessions (
  token TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Visitantes únicos por dia (para taxa de conversão)
CREATE TABLE IF NOT EXISTS daily_visitors (
  hash TEXT NOT NULL,
  dia  TEXT NOT NULL,
  PRIMARY KEY (hash, dia)
);

-- Índices para as queries mais comuns
CREATE INDEX IF NOT EXISTS idx_products_categoria ON products (categoria);
CREATE INDEX IF NOT EXISTS idx_products_ativo ON products (ativo, disponivel);
CREATE INDEX IF NOT EXISTS idx_orders_estado ON orders (estado_pagamento, estado_fulfillment);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions (customer_id);
