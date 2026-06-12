// ============================================================
// CONFIG CENTRAL DA LOJA
// Tudo o que é branding/negócio vive aqui. NUNCA hardcoded
// nas páginas — as views usam tokens {{...}} e o frontend
// recebe window.LOJA via injeção no HTML.
// ============================================================

module.exports = {
  // --- Identidade da marca ---
  nome: 'TechGang',
  tagline: 'Tech que se usa, não que se guarda na gaveta.',
  emailContacto: 'techgang.pt@gmail.com',

  // --- Negócio ---
  moeda: 'EUR',
  portes: 490,                 // portes em cêntimos (4,90 €)
  portesGratisAPartirDe: 5000, // portes grátis a partir de 50,00 € (em cêntimos)
  prefixoEncomenda: 'TG',      // formato: TG-2026-0001

  // --- Servidor ---
  // Nota: 3000 e 3001 já estão ocupadas por outros projetos neste Mac
  porta: 3002,

  // --- Cores da marca (geram as variáveis CSS no <head>) ---
  // Estilo app: fundo cinza-claro + cartões brancos + roxo vibrante
  cores: {
    fundo: '#F3F3F6',        // cinza-claro de fundo (estilo app)
    fundoElevado: '#FFFFFF', // cartões brancos
    linha: '#E8E7EE',        // hairlines / bordas subtis
    texto: '#1B1A21',        // quase-preto
    textoSuave: '#8A8793',   // texto secundário
    acento: '#6C4BE0',       // roxo vibrante: o ÚNICO acento da marca
    acentoTexto: '#FFFFFF',  // texto sobre o acento (contraste AA)
    acentoClaro: '#C9BBF5',  // variante clara do roxo, para fundos roxos/escuros
    ink: '#6C4BE0',          // bloco de destaque da home (banner de confiança)
    inkTexto: '#FFFFFF',     // texto sobre o bloco de destaque
    perigo: '#C8453A'        // erros / avisos (uso raro)
  },

  // --- Tipografia (Google Fonts) ---
  fontes: {
    titulo: 'Archivo',           // display pesado e compacto (títulos + preços, como a referência)
    corpo: 'Plus Jakarta Sans',  // sans arredondada (corpo e UI)
    mono: 'IBM Plex Mono'        // refs técnicas e tracking (uso pontual)
  }
};
