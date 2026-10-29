import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_ICON_KEYS, getIcon } from '@/lib/icons';
import type { Category, CategoryType, ColorKey } from '@/lib/types';
import { cn, COLOR_KEYS, colorVar, tint } from '@/lib/ui';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';
import { CategoryIcon } from '../ui/Bits';
import { Button, IconButton } from '../ui/Button';
import { Field, Input, Segmented } from '../ui/Form';
import { ConfirmDialog, Modal } from '../ui/Modal';

/** Edit or create one category: name, icon and a colour from the validated palette. */
export function CategoryForm({
  open,
  onClose,
  category,
  type,
}: {
  open: boolean;
  onClose: () => void;
  category?: Category;
  type: CategoryType;
}) {
  return (
    <Modal open={open} onClose={onClose} title={category ? 'Edit category' : 'New category'}>
      <CategoryFields onClose={onClose} category={category} type={type} />
    </Modal>
  );
}

function CategoryFields({ onClose, category, type: initialType }: { onClose: () => void; category?: Category; type: CategoryType }) {
  const transactions = useFinance((s) => s.transactions);
  const addCategory = useFinance((s) => s.addCategory);
  const updateCategory = useFinance((s) => s.updateCategory);
  const deleteCategory = useFinance((s) => s.deleteCategory);
  const [name, setName] = useState(category?.name ?? '');
  const [type, setType] = useState<CategoryType>(category?.type ?? initialType);
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState<ColorKey>(category?.color ?? 'blue');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const used = category ? transactions.filter((t) => t.category === category.id).length : 0;
  const isFallback = category?.id === `other-${category?.type}`;
  const Preview = getIcon(icon);

  const save = () => {
    if (!name.trim()) return setError('Give the category a name');
    const draft = { name: name.trim(), icon, color, type };
    if (category) updateCategory(category.id, draft);
    else addCategory(draft);
    toast(category ? 'Category updated' : 'Category added');
    onClose();
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl"
          style={{ backgroundColor: tint(colorVar(color)), color: colorVar(color) }}
          aria-hidden
        >
          <Preview className="size-6" />
        </span>
        <div className="flex-1">
          <Field label="Name" htmlFor="category-name" error={error}>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pets, Subscriptions"
              maxLength={32}
              autoFocus
            />
          </Field>
        </div>
      </div>

      {(!category || used === 0) && (
        <Segmented
          label="Category type"
          value={type}
          onChange={setType}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
          className="flex w-full"
        />
      )}

      <fieldset>
        <legend className="label">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={color === key}
              onClick={() => setColor(key)}
              className={cn('size-8 rounded-full ring-offset-2 ring-offset-surface transition', color === key && 'ring-2 ring-ink')}
              style={{ backgroundColor: colorVar(key) }}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">Icon</legend>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {CATEGORY_ICON_KEYS.map((key) => {
            const Icon = getIcon(key);
            return (
              <button
                key={key}
                type="button"
                aria-label={key.replace(/-/g, ' ')}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn(
                  'grid aspect-square place-items-center rounded-xl transition',
                  icon === key ? 'bg-primary-soft text-primary-ink ring-2 ring-primary' : 'text-ink-2 hover:bg-subtle',
                )}
              >
                <Icon className="size-[18px]" />
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-2 pt-1">
        {category && !isFallback && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {category ? 'Save' : 'Add category'}
        </Button>
      </div>

      {category && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete “${category.name}”?`}
          message={
            used > 0
              ? `${used} ${used === 1 ? 'transaction moves' : 'transactions move'} to “Other”, and this category’s budgets are removed.`
              : 'This category isn’t used by any transactions.'
          }
          confirmLabel="Delete category"
          danger
          onConfirm={() => {
            deleteCategory(category.id);
            toast('Category deleted');
            onClose();
          }}
        />
      )}
    </form>
  );
}

/** List of categories for one type with add/edit. */
export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useFinance((s) => s.categories);
  const [type, setType] = useState<CategoryType>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const list = categories.filter((c) => c.type === type);
  return (
    <>
      <Modal open={open && editing === null} onClose={onClose} title="Manage categories">
        <div className="space-y-4">
          <Segmented
            label="Category type"
            value={type}
            onChange={setType}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            className="flex w-full"
          />
          <ul className="divide-y divide-line/70">
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <CategoryIcon category={c} size="sm" />
                <span className="flex-1 truncate text-sm font-medium text-ink">{c.name}</span>
                <IconButton label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button variant="soft" icon={Plus} className="w-full" onClick={() => setEditing('new')}>
            New {type} category
          </Button>
        </div>
      </Modal>
      <CategoryForm
        open={open && editing !== null}
        onClose={() => setEditing(null)}
        category={editing && editing !== 'new' ? editing : undefined}
        type={type}
      />
    </>
  );
}
