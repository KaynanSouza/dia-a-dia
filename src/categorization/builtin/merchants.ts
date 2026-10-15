/**
 * Dicionário embutido: chave = tokens já normalizados pela camada 2 (normalize.ts).
 * A busca casa a chave como sequência contígua de tokens em qualquer posição da descrição.
 * Incrementar DICTIONARY_VERSION a cada alteração (re-seed em merchant_dictionary, source = 'builtin').
 */
export const DICTIONARY_VERSION = 1;

type Entry = [key: string, display: string, categoryId: string];

const group = (categoryId: string, items: [string, string][]): Entry[] => items.map(([k, d]) => [k, d, categoryId]);

export const BUILTIN_MERCHANTS: Entry[] = [
  ...group('cat_delivery', [
    ['ifood', 'iFood'], ['ifd', 'iFood'], ['rappi', 'Rappi'], ['ze delivery', 'Zé Delivery'], ['aiqfome', 'aiqfome'], ['james delivery', 'James'],
  ]),
  ...group('cat_restaurantes', [
    ['mcdonalds', "McDonald's"], ['mc donalds', "McDonald's"], ['burger king', 'Burger King'], ['bk brasil', 'Burger King'], ['subway', 'Subway'],
    ['outback', 'Outback'], ['habibs', "Habib's"], ['giraffas', 'Giraffas'], ['coco bambu', 'Coco Bambu'], ['madero', 'Madero'],
    ['spoleto', 'Spoleto'], ['china in box', 'China in Box'], ['kfc', 'KFC'], ['pizza hut', 'Pizza Hut'], ['dominos', "Domino's"],
    ['restaurante', 'Restaurante'], ['churrascaria', 'Churrascaria'], ['lanchonete', 'Lanchonete'], ['pizzaria', 'Pizzaria'],
  ]),
  ...group('cat_padaria_cafe', [
    ['starbucks', 'Starbucks'], ['padaria', 'Padaria'], ['panificadora', 'Padaria'], ['cafeteria', 'Cafeteria'], ['kopenhagen', 'Kopenhagen'],
    ['cacau show', 'Cacau Show'],
  ]),
  ...group('cat_mercado', [
    ['carrefour', 'Carrefour'], ['pao de acucar', 'Pão de Açúcar'], ['assai', 'Assaí'], ['atacadao', 'Atacadão'], ['extra', 'Extra'],
    ['dia brasil', 'Dia'], ['supermercado', 'Supermercado'], ['supermercados', 'Supermercado'], ['mercado', 'Mercado'], ['hortifruti', 'Hortifruti'],
    ['oxxo', 'Oxxo'], ['sams club', "Sam's Club"], ['makro', 'Makro'], ['big bompreco', 'Big Bompreço'], ['zaffari', 'Zaffari'],
    ['guanabara', 'Guanabara'], ['mundial', 'Mundial'], ['savegnago', 'Savegnago'], ['st marche', 'St Marche'], ['minuto pao de acucar', 'Minuto Pão de Açúcar'],
    ['daki', 'Daki'], ['atacadista', 'Atacadista'], ['acougue', 'Açougue'], ['sacolao', 'Sacolão'],
  ]),
  ...group('cat_combustivel', [
    ['posto', 'Posto'], ['shell', 'Shell'], ['ipiranga', 'Ipiranga'], ['petrobras', 'Petrobras'], ['br mania', 'BR Mania'], ['ale combustiveis', 'ALE'],
    ['auto posto', 'Posto'], ['combustiveis', 'Posto'],
  ]),
  ...group('cat_app_transporte', [
    ['uber', 'Uber'], ['99 app', '99'], ['99app', '99'], ['99 tecnologia', '99'], ['99pop', '99'], ['cabify', 'Cabify'], ['indriver', 'inDrive'], ['indrive', 'inDrive'],
  ]),
  ...group('cat_transporte_publico', [
    ['metro', 'Metrô'], ['cptm', 'CPTM'], ['bilhete unico', 'Bilhete Único'], ['sptrans', 'SPTrans'], ['riocard', 'RioCard'], ['top mobilidade', 'TOP'],
  ]),
  ...group('cat_estacionamento_pedagio', [
    ['sem parar', 'Sem Parar'], ['conectcar', 'ConectCar'], ['veloe', 'Veloe'], ['move mais', 'Move Mais'], ['estapar', 'Estapar'],
    ['estacionamento', 'Estacionamento'], ['zona azul', 'Zona Azul'], ['pedagio', 'Pedágio'], ['autopass', 'Autopass'],
  ]),
  ...group('cat_veiculo', [['ipva', 'IPVA'], ['detran', 'Detran'], ['licenciamento', 'Licenciamento'], ['oficina', 'Oficina'], ['autopecas', 'Autopeças']]),
  ...group('cat_farmacia', [
    ['drogasil', 'Drogasil'], ['droga raia', 'Droga Raia'], ['raia', 'Droga Raia'], ['drogaria sao paulo', 'Drogaria São Paulo'], ['pague menos', 'Pague Menos'],
    ['drogaria', 'Drogaria'], ['farmacia', 'Farmácia'], ['panvel', 'Panvel'], ['drogarias pacheco', 'Pacheco'], ['ultrafarma', 'Ultrafarma'],
    ['onofre', 'Onofre'], ['venancio', 'Venâncio'], ['nissei', 'Nissei'],
  ]),
  ...group('cat_plano_saude', [
    ['unimed', 'Unimed'], ['amil', 'Amil'], ['bradesco saude', 'Bradesco Saúde'], ['sulamerica saude', 'SulAmérica'], ['hapvida', 'Hapvida'],
    ['notredame', 'NotreDame'], ['porto saude', 'Porto Saúde'], ['odontoprev', 'OdontoPrev'],
  ]),
  ...group('cat_consultas_exames', [
    ['laboratorio', 'Laboratório'], ['fleury', 'Fleury'], ['dasa', 'Dasa'], ['delboni', 'Delboni'], ['lavoisier', 'Lavoisier'], ['clinica', 'Clínica'],
    ['hospital', 'Hospital'], ['consultorio', 'Consultório'],
  ]),
  ...group('cat_academia', [['smart fit', 'Smart Fit'], ['smartfit', 'Smart Fit'], ['bluefit', 'Bluefit'], ['bodytech', 'Bodytech'], ['academia', 'Academia'], ['gympass', 'Wellhub'], ['wellhub', 'Wellhub'], ['totalpass', 'TotalPass']]),
  ...group('cat_streaming', [
    ['netflix', 'Netflix'], ['spotify', 'Spotify'], ['disney', 'Disney+'], ['hbo', 'Max'], ['max com', 'Max'], ['globoplay', 'Globoplay'],
    ['prime video', 'Prime Video'], ['amazon prime', 'Amazon Prime'], ['deezer', 'Deezer'], ['youtube premium', 'YouTube Premium'],
    ['google youtube', 'YouTube Premium'], ['paramount', 'Paramount+'], ['crunchyroll', 'Crunchyroll'], ['apple tv', 'Apple TV+'], ['twitch', 'Twitch'],
  ]),
  ...group('cat_software', [
    ['apple com bill', 'Apple'], ['apple com', 'Apple'], ['google play', 'Google Play'], ['google one', 'Google One'], ['microsoft', 'Microsoft'],
    ['adobe', 'Adobe'], ['dropbox', 'Dropbox'], ['openai', 'OpenAI'], ['chatgpt', 'ChatGPT'], ['canva', 'Canva'], ['notion', 'Notion'],
  ]),
  ...group('cat_marketplace', [
    ['mercado livre', 'Mercado Livre'], ['mercadolivre', 'Mercado Livre'], ['amazon', 'Amazon'], ['amazon marketplace', 'Amazon'], ['shopee', 'Shopee'],
    ['aliexpress', 'AliExpress'], ['shein', 'Shein'], ['magalu', 'Magalu'], ['magazine luiza', 'Magalu'], ['americanas', 'Americanas'],
    ['casas bahia', 'Casas Bahia'], ['temu', 'Temu'], ['submarino', 'Submarino'],
  ]),
  ...group('cat_vestuario', [
    ['renner', 'Renner'], ['riachuelo', 'Riachuelo'], ['c a', 'C&A'], ['cea', 'C&A'], ['zara', 'Zara'], ['centauro', 'Centauro'], ['netshoes', 'Netshoes'],
    ['hering', 'Hering'], ['marisa', 'Marisa'], ['decathlon', 'Decathlon'], ['nike', 'Nike'], ['adidas', 'Adidas'],
  ]),
  ...group('cat_eletronicos', [['kabum', 'KaBuM!'], ['fast shop', 'Fast Shop'], ['samsung', 'Samsung'], ['apple store', 'Apple Store'], ['pichau', 'Pichau']]),
  ...group('cat_casa_decoracao', [
    ['leroy merlin', 'Leroy Merlin'], ['tok stok', 'Tok&Stok'], ['camicado', 'Camicado'], ['telhanorte', 'Telhanorte'], ['c c', 'C&C'], ['ikea', 'IKEA'],
  ]),
  ...group('cat_energia', [
    ['enel', 'Enel'], ['cemig', 'Cemig'], ['copel', 'Copel'], ['light', 'Light'], ['cpfl', 'CPFL'], ['neoenergia', 'Neoenergia'], ['coelba', 'Coelba'],
    ['celesc', 'Celesc'], ['equatorial', 'Equatorial'], ['energisa', 'Energisa'], ['eletropaulo', 'Enel'],
  ]),
  ...group('cat_agua', [['sabesp', 'Sabesp'], ['cedae', 'Cedae'], ['copasa', 'Copasa'], ['sanepar', 'Sanepar'], ['embasa', 'Embasa'], ['compesa', 'Compesa'], ['corsan', 'Corsan'], ['aegea', 'Aegea'], ['aguas do rio', 'Águas do Rio']]),
  ...group('cat_gas', [['comgas', 'Comgás'], ['naturgy', 'Naturgy'], ['ultragaz', 'Ultragaz'], ['liquigas', 'Liquigás'], ['supergasbras', 'Supergasbras']]),
  ...group('cat_internet_tv', [['net servicos', 'Claro NET'], ['claro net', 'Claro NET'], ['sky', 'Sky'], ['vivo fibra', 'Vivo Fibra'], ['oi fibra', 'Oi Fibra'], ['desktop', 'Desktop'], ['brisanet', 'Brisanet']]),
  ...group('cat_telefonia', [['vivo', 'Vivo'], ['claro', 'Claro'], ['tim', 'TIM'], ['oi movel', 'Oi'], ['recarga', 'Recarga de celular']]),
  ...group('cat_condominio', [['condominio', 'Condomínio'], ['cond', 'Condomínio']]),
  ...group('cat_aluguel', [['aluguel', 'Aluguel'], ['quintoandar', 'QuintoAndar'], ['quinto andar', 'QuintoAndar'], ['imobiliaria', 'Imobiliária']]),
  ...group('cat_tarifas_bancarias', [
    ['tarifa', 'Tarifa bancária'], ['tar pacote', 'Tarifa bancária'], ['cesta servicos', 'Tarifa bancária'], ['anuidade', 'Anuidade'],
    ['iof', 'IOF'], ['juros', 'Juros'], ['encargos', 'Encargos'], ['multa atraso', 'Multa'],
  ]),
  ...group('cat_seguros', [['porto seguro', 'Porto Seguro'], ['seguro', 'Seguro'], ['mapfre', 'Mapfre'], ['azul seguros', 'Azul Seguros'], ['youse', 'Youse']]),
  ...group('cat_cinema_eventos', [['cinemark', 'Cinemark'], ['cinepolis', 'Cinépolis'], ['uci', 'UCI'], ['ingresso com', 'Ingresso.com'], ['sympla', 'Sympla'], ['eventim', 'Eventim'], ['ticketmaster', 'Ticketmaster']]),
  ...group('cat_viagens', [
    ['latam', 'LATAM'], ['gol linhas', 'GOL'], ['azul linhas', 'Azul'], ['decolar', 'Decolar'], ['booking', 'Booking'], ['airbnb', 'Airbnb'],
    ['hotel', 'Hotel'], ['pousada', 'Pousada'], ['hoteis com', 'Hoteis.com'], ['clickbus', 'ClickBus'], ['buser', 'Buser'], ['localiza', 'Localiza'], ['movida', 'Movida'], ['unidas', 'Unidas'],
  ]),
  ...group('cat_bares', [['bar', 'Bar'], ['choperia', 'Choperia'], ['cervejaria', 'Cervejaria'], ['boteco', 'Boteco']]),
  ...group('cat_jogos', [['steam', 'Steam'], ['playstation', 'PlayStation'], ['xbox', 'Xbox'], ['nintendo', 'Nintendo'], ['epic games', 'Epic Games']]),
  ...group('cat_educacao', [['escola', 'Escola'], ['colegio', 'Colégio'], ['faculdade', 'Faculdade'], ['universidade', 'Universidade'], ['udemy', 'Udemy'], ['alura', 'Alura'], ['coursera', 'Coursera'], ['duolingo', 'Duolingo'], ['livraria', 'Livraria']]),
  ...group('cat_pets', [['petz', 'Petz'], ['cobasi', 'Cobasi'], ['petlove', 'Petlove'], ['pet shop', 'Pet shop'], ['petshop', 'Pet shop'], ['veterinaria', 'Veterinária'], ['veterinario', 'Veterinário']]),
  ...group('cat_impostos', [['darf', 'DARF'], ['das simples', 'DAS'], ['iptu', 'IPTU'], ['receita federal', 'Receita Federal'], ['gru', 'GRU'], ['prefeitura', 'Prefeitura']]),
  ...group('cat_saques', [['saque', 'Saque'], ['saque 24h', 'Saque'], ['banco24horas', 'Saque']]),
  ...group('cat_salario', [['salario', 'Salário'], ['folha pagamento', 'Salário'], ['proventos', 'Salário'], ['pagto salario', 'Salário'], ['adiantamento salarial', 'Salário']]),
  ...group('cat_rendimentos', [['rendimento', 'Rendimentos'], ['rend pago', 'Rendimentos'], ['resgate', 'Resgate'], ['dividendos', 'Dividendos'], ['juros sobre capital', 'JCP'], ['cdb', 'CDB'], ['tesouro direto', 'Tesouro Direto']]),
  ...group('cat_reembolsos', [['estorno', 'Estorno'], ['reembolso', 'Reembolso'], ['cashback', 'Cashback'], ['devolucao', 'Devolução']]),
  ...group('cat_pagamento_fatura', [['pagamento fatura', 'Pagamento de fatura'], ['pagto fatura', 'Pagamento de fatura'], ['pag fatura', 'Pagamento de fatura'], ['pagamento recebido', 'Pagamento de fatura'], ['pagamento efetuado', 'Pagamento de fatura'], ['fatura cartao', 'Pagamento de fatura']]),
];
