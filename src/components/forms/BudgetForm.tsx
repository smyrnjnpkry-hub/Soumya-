import { useMemo, useState } from 'react';
import { addMonthsToKey, lastNMonths, monthBounds } from '@/lib/dates';
import { categoryBreakdown } from '@/lib/finance';
import { formatINR, formatMonth, round2 } from '@/lib/format';
import type { Budget } from '@/lib/types';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';
import { Button } from '../ui/Button';
import { Chip, Field, MoneyInput, Select } from '../ui/Form';
import { Modal } from '../ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  month: string;
  /** Edit this budget; otherwise create one (optionally for a preset category) */
  budget?: Budget;
  presetCategory?: string;
}

export function BudgetForm(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.budget ? 'Edit budget' : 'New budget'}>
      <BudgetFields {...props} />
    </Modal>
  );
}

function BudgetFields({ onClose, month, budget, presetCategory }: Props) {
  const categories = useFinance((s) => s.categories);
  const budgets = useFinance((s) => s.budgets);
  const transactions = useFinance((s) => s.transactions);
  const setBudget = useFinance((s) => s.setBudget);
  const deleteBudget = useFinance((s) => s.deleteBudget);

  const taken = new Set(budgets.filter((b) => b.month === month && b.id !== budget?.id).map((b) => b.category));
  const options = categories.filter((c) => c.type === 'expense' && !taken.has(c.id));
  const [category, setCategory] = useState(budget?.category ?? presetCategory ?? options[0]?.id ?? '');
  const [limit, setLimit] = useState(budget ? String(budget.limit) : '');
  const [error, setError] = useState('');

  // Suggestions from what was actually spent, so limits start realistic
  const suggestions = useMemo(() => {
    const prev = addMonthsToKey(month, -1);
    const spentIn = (key: string) => {
      const { start, end } = monthBounds(key);
      return categoryBreakdown(transactions, { type: 'expense', start, end }).find((i) => i.categoryId === category)?.amount ?? 0;
    };
    const last = spentIn(prev);
    const recent = lastNMonths(prev, 3).map(spentIn);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const roundUp = (v: number) => Math.ceil(v / 500) * 500;
    return [
      last > 0 && { label: `Last month · ${formatINR(roundUp(last))}`, value: roundUp(last) },
      avg > 0 && Math.abs(avg - last) > 250 && { label: `3-month avg · ${formatINR(roundUp(avg))}`, value: roundUp(avg) },
    ].filter(Boolean) as { label: string; value: number }[];
  }, [transactions, category, month]);

  const save = () => {
    const value = Number(limit);
    if (!category) return setError('Pick a category');
    if (!limit || !Number.isFinite(value) || value <= 0) return setError('Enter a monthly limit');
    setBudget(category, month, round2(value));
    if (budget && budget.category !== category) deleteBudget(budget.id);
    toast(budget ? 'Budget updated' : 'Budget added');
    onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-muted">For {formatMonth(month)}</p>
      <Field label="Category" htmlFor="budget-category">
        <Select id="budget-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={Boolean(budget)}>
          {(budget ? categories.filter((c) => c.id === budget.category) : options).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly limit" htmlFor="budget-limit" error={error}>
        <MoneyInput id="budget-limit" value={limit} onChange={setLimit} placeholder="0" autoFocus />
      </Field>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Chip key={s.label} selected={Number(limit) === s.value} onClick={() => setLimit(String(s.value))}>
              {s.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        {budget && (
          <Button
            variant="danger"
            onClick={() => {
              deleteBudget(budget.id);
              toast('Budget removed');
              onClose();
            }}
          >
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {budget ? 'Save' : 'Add budget'}
        </Button>
      </div>
    </form>
  );
}
