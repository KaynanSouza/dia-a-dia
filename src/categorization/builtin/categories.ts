export type CategoryKind = 'expense' | 'income' | 'transfer' | 'card_payment';
export type BuiltinCategory = { id: string; name: string; kind: CategoryKind; parent?: string; color?: string };

/** Incrementar quando a árvore mudar: o seed roda de novo (sem sobrescrever edições do usuário). */
export const CATEGORIES_VERSION = 1;

export const CAT = {
  TRANSFER: 'cat_transferencia',
  CARD_PAYMENT: 'cat_pagamento_fatura',
  OTHER: 'cat_outros',
} as const;

const tree: [parent: BuiltinCategory, children: [id: string, name: string][]][] = [
  [{ id: 'cat_alimentacao', name: 'Alimentação', kind: 'expense', color: '#F97316' }, [
    ['cat_mercado', 'Mercado'], ['cat_restaurantes', 'Restaurantes'], ['cat_delivery', 'Delivery'], ['cat_padaria_cafe', 'Padaria e café'],
  ]],
  [{ id: 'cat_moradia', name: 'Moradia', kind: 'expense', color: '#8B5CF6' }, [
    ['cat_aluguel', 'Aluguel'], ['cat_condominio', 'Condomínio'], ['cat_energia', 'Energia'], ['cat_agua', 'Água'],
    ['cat_gas', 'Gás'], ['cat_internet_tv', 'Internet e TV'], ['cat_casa_manutencao', 'Manutenção e casa'],
  ]],
  [{ id: 'cat_transporte', name: 'Transporte', kind: 'expense', color: '#0EA5E9' }, [
    ['cat_combustivel', 'Combustível'], ['cat_app_transporte', 'Apps de transporte'], ['cat_transporte_publico', 'Transporte público'],
    ['cat_estacionamento_pedagio', 'Estacionamento e pedágio'], ['cat_veiculo', 'Veículo'],
  ]],
  [{ id: 'cat_saude', name: 'Saúde', kind: 'expense', color: '#10B981' }, [
    ['cat_farmacia', 'Farmácia'], ['cat_plano_saude', 'Plano de saúde'], ['cat_consultas_exames', 'Consultas e exames'], ['cat_academia', 'Academia'],
  ]],
  [{ id: 'cat_lazer', name: 'Lazer', kind: 'expense', color: '#EC4899' }, [
    ['cat_cinema_eventos', 'Cinema e eventos'], ['cat_viagens', 'Viagens'], ['cat_bares', 'Bares'], ['cat_jogos', 'Jogos'],
  ]],
  [{ id: 'cat_assinaturas', name: 'Assinaturas', kind: 'expense', color: '#6366F1' }, [
    ['cat_streaming', 'Streaming'], ['cat_software', 'Apps e software'],
  ]],
  [{ id: 'cat_compras', name: 'Compras', kind: 'expense', color: '#EAB308' }, [
    ['cat_marketplace', 'Marketplaces'], ['cat_vestuario', 'Vestuário'], ['cat_eletronicos', 'Eletrônicos'], ['cat_casa_decoracao', 'Casa e decoração'],
  ]],
  [{ id: 'cat_servicos', name: 'Serviços', kind: 'expense', color: '#64748B' }, [
    ['cat_telefonia', 'Telefonia'], ['cat_tarifas_bancarias', 'Tarifas bancárias'], ['cat_seguros', 'Seguros'],
  ]],
  [{ id: 'cat_educacao', name: 'Educação', kind: 'expense', color: '#14B8A6' }, []],
  [{ id: 'cat_pets', name: 'Pets', kind: 'expense', color: '#A16207' }, []],
  [{ id: 'cat_impostos', name: 'Impostos e taxas', kind: 'expense', color: '#991B1B' }, []],
  [{ id: 'cat_saques', name: 'Saques', kind: 'expense', color: '#78716C' }, []],
  [{ id: 'cat_outros', name: 'Outros', kind: 'expense', color: '#9CA3AF' }, []],
  [{ id: 'cat_receitas', name: 'Receitas', kind: 'income', color: '#16A34A' }, [
    ['cat_salario', 'Salário'], ['cat_rendimentos', 'Rendimentos'], ['cat_reembolsos', 'Reembolsos'], ['cat_outras_receitas', 'Outras receitas'],
  ]],
  [{ id: 'cat_transferencia', name: 'Transferência', kind: 'transfer', color: '#94A3B8' }, []],
  [{ id: 'cat_pagamento_fatura', name: 'Pagamento de fatura', kind: 'card_payment', color: '#94A3B8' }, []],
];

export const BUILTIN_CATEGORIES: BuiltinCategory[] = tree.flatMap(([p, children]) => [
  p,
  ...children.map(([id, name]) => ({ id, name, kind: p.kind, parent: p.id })),
]);
