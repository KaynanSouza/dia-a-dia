import { useState } from 'react';

import { CategoryPicker } from '@/components/CategoryPicker';
import { Button, Card, ErrorText, Field, Loading, Muted, Screen, SectionTitle } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { createCategory, listCategoryTree, renameCategory } from '@/db/repositories/finance.repo';

/** C-04: árvore padrão + categorias e subcategorias do usuário. */
export default function Categories() {
  const { db, bump } = useDb();
  const { data: tree } = useDbQuery(listCategoryTree);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();

  if (!tree) return <Loading />;
  const current = tree.find((c) => c.id === selected);

  const add = async () => {
    setError(undefined);
    try {
      await createCategory(db, name, selected);
      setName('');
      bump();
    } catch {
      setError('Já existe uma categoria com esse nome neste nível.');
    }
  };

  const rename = async () => {
    if (!current || !name.trim()) return;
    setError(undefined);
    try {
      await renameCategory(db, current.id, name);
      setName('');
      bump();
    } catch {
      setError('Já existe uma categoria com esse nome neste nível.');
    }
  };

  return (
    <Screen>
      <Card>
        <Field
          label={current ? `Nova subcategoria em "${current.name}"` : 'Nova categoria'}
          value={name}
          onChangeText={setName}
          maxLength={40}
          placeholder="Nome"
          hint="Toque numa categoria abaixo para criar uma subcategoria dentro dela."
        />
        <ErrorText>{error}</ErrorText>
        <Button title={current ? `Adicionar em "${current.name}"` : 'Adicionar categoria'} icon="plus" onPress={add} disabled={!name.trim()} />
        {current && <Button title={`Renomear "${current.name}"`} variant="secondary" onPress={rename} disabled={!name.trim()} />}
        {current && <Button title="Limpar seleção" variant="ghost" small onPress={() => setSelected(null)} />}
      </Card>
      <SectionTitle>Categorias</SectionTitle>
      <Muted>Transferências e pagamentos de fatura não entram no painel.</Muted>
      <CategoryPicker categories={tree} selected={selected} onSelect={(id) => setSelected(id === selected ? null : id)} />
    </Screen>
  );
}
