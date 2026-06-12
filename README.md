# TechGang — Loja Online (Fase 3: Painel Admin)

Loja custom para dropshipping. Node.js + Express + SQLite (better-sqlite3),
frontend vanilla (HTML/CSS/JS) servido pelo Express. Sem frameworks, sem bundlers.
Pagamentos com Stripe Checkout (hosted) + emails transacionais com Nodemailer.

## Como correr

```bash
npm install
cp .env.example .env   # preencher as chaves (ver "Pagamentos" abaixo)
npm start
```

Abre **http://localhost:3002**

> Porta 3002 porque a 3000 (crypto-signals) e a 3001 (cds-dashboard)
> já estão ocupadas neste Mac. Muda em `config.js` se precisares.

Na primeira execução, a base de dados `db/loja.db` é criada automaticamente
com o schema e 8 produtos de teste (seed).

## Estrutura

| Caminho | O que é |
|---|---|
| `config.js` | **Tudo o que é branding/negócio**: nome, tagline, cores, portes, email. Nunca hardcoded nas páginas. |
| `.env` | Segredos (Stripe, SMTP) — nunca vai para o git. Modelo em `.env.example`. |
| `server.js` | Entry point Express (webhook do Stripe montado ANTES do `express.json()`) |
| `db/schema.sql` | Schema (products + orders com campos de dropshipping) |
| `db/database.js` | Inicialização + seed automático |
| `routes/products.js` | API JSON de produtos — nunca expõe custos/fornecedor |
| `routes/checkout.js` | POST `/api/checkout` (valida + cria order + Stripe Session) e GET `/api/encomendas/:numero` |
| `routes/stripe-webhook.js` | POST `/api/stripe/webhook` — confirma pagamentos e dispara emails |
| `routes/placeholders.js` | SVGs placeholder dos produtos (`/img/p/:slug/:n.svg`) |
| `routes/pages.js` | Páginas HTML com mini-renderer de tokens `{{...}}` e partials |
| `lib/email.js` | Emails transacionais (cliente + dono) via SMTP |
| `views/` | HTML das páginas + `partials/` (head, header+drawer, footer) |
| `public/` | CSS, JS e imagens |

## Pagamentos (Stripe, modo test)

1. Cria conta em https://dashboard.stripe.com e copia a **chave secreta de test**
   (`sk_test_...`) para `STRIPE_SECRET_KEY` no `.env`.
2. **Métodos de pagamento**: a sessão pede cartão + MB Way + Multibanco.
   MB Way e Multibanco têm de estar ativados no dashboard
   (Settings → Payment methods); se não estiverem, a loja faz fallback
   automático para só cartão (com aviso no terminal).
3. **Webhook em local** (necessário para confirmar pagamentos):

```bash
stripe listen --forward-to localhost:3002/api/stripe/webhook
```

   Copia o `whsec_...` que o comando mostra para `STRIPE_WEBHOOK_SECRET` no `.env`
   e reinicia o servidor.

### Fluxo completo de teste

1. `npm start` + `stripe listen --forward-to localhost:3002/api/stripe/webhook`
2. Adiciona produtos ao carrinho → "Finalizar compra" → preenche o formulário
3. No Stripe usa o cartão de teste **4242 4242 4242 4242**, qualquer validade
   futura, qualquer CVC
4. Voltas a `/obrigado?enc=TG-2026-XXXX`; quando o webhook chega, a encomenda
   passa a "paga" e os emails saem (se o SMTP estiver configurado)

> **Sem Stripe configurado** (sem `STRIPE_SECRET_KEY` no `.env`): a encomenda
> é criada na mesma com estado "pendente" e segues direto para `/obrigado` —
> útil para testar o fluxo sem conta Stripe. Fica um aviso no terminal.

## Emails transacionais

SMTP genérico no `.env` (`SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `EMAIL_ADMIN`).
Quando o webhook confirma um pagamento:

- **Cliente** recebe a confirmação com resumo e prazo de entrega
- **Dono** (`EMAIL_ADMIN`) recebe os dados completos + link do fornecedor de
  cada produto, para o fulfillment manual

Sem SMTP configurado, os emails são saltados com aviso no terminal — o resto
do fluxo não é afetado.

## Painel admin (/admin)

Define `ADMIN_PASSWORD` no `.env` (sem ela o login recusa sempre). Sessão de
7 dias num cookie httpOnly assinado; mudar a password corta todas as sessões.

- **Dashboard**: encomendas hoje/7d/30d, receita e lucro estimado 30d
  (total − custos do fornecedor − portes) e o nº de encomendas **por
  encomendar ao fornecedor** (fica roxo quando > 0 — é o trabalho pendente).
- **/admin/encomendas**: filtros por estado + pesquisa + export CSV
  (separador `;`, datas PT — abre direto no Excel).
- **/admin/produtos**: margem por produto, toggles rápidos
  disponível/destaque, criar/editar com upload de imagens (redimensionadas
  para máx. 1200px webp q80). "Desativar" = soft delete (`ativo=0`).

### Fluxo de fulfillment de uma encomenda (início → fim)

1. Cliente paga → webhook marca **paga** → aparece no dashboard como
   "por encomendar" + recebes email com os links do fornecedor
2. Abres a encomenda no admin → compras o produto no fornecedor (link
   direto em cada item) → **"Marcar como encomendada ao fornecedor"**
   (podes guardar o nº da encomenda CJ/AliExpress)
3. O fornecedor envia e dá-te o tracking → **"Inserir tracking"** →
   estado passa a **enviada** e o cliente recebe email com o link
4. Chegou → **"Marcar como entregue"**. Notas internas sempre disponíveis.

## Decisões importantes

- **Preços sempre em cêntimos** (INTEGER) na BD; formatados "€24,99" no frontend.
- **O servidor nunca confia no cliente**: no checkout, os preços vêm da BD,
  as quantidades são validadas (inteiros 1-99) e o produto tem de estar
  ativo e disponível.
- **Sem stock próprio** — campo `disponivel` liga/desliga produtos; o stock é do fornecedor.
- `estado_pagamento` e `estado_fulfillment` são **separados** (fluxos distintos no dropshipping).
- Carrinho em `localStorage` (chave `tg_carrinho`, items com cor), drawer lateral.
- Encomendas com número `TG-2026-0001` (sequência por ano).
- Webhook idempotente: repetições do Stripe não duplicam emails nem estados.
- Design (mockups do Bruno): header branco, Archivo (display) + Plus Jakarta Sans,
  roxo `#6C4BE0` único acento, imagens placeholder às riscas lilás geradas
  pelo servidor.
- Favoritos (coração nos cards) em localStorage `tg_favoritos` — só visual.

## Fase 3 (ainda NÃO implementado)

Painel admin, integração com APIs de fornecedores (CJ/AliExpress), tracking.

## Por fazer antes do lançamento

- Substituir os SVGs placeholder por fotos reais dos produtos
- Conteúdo legal real (termos, privacidade, RGPD) — está placeholder
- Links TikTok/Instagram nos contactos
- Passar o Stripe de test para live (chaves `sk_live_...` + webhook de produção)
