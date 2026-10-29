import { useState } from 'react';
import { addMonthsToDate, todayISO } from '@/lib/dates';
import { formatINR, round2 } from '@/lib/format';
import type { Goal } from '@/lib/types';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';
import { Button } from '../ui/Button';
import { Field, Input, MoneyInput, Segmented } from '../ui/Form';
import { Modal } from '../ui/Modal';

export function GoalForm({ open, onClose, goal }: { open: boolean; onClose: () => void; goal?: Goal }) {
  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'}>
      <GoalFields onClose={onClose} goal={goal} />
    </Modal>
  );
}

function GoalFields({ onClose, goal }: { onClose: () => void; goal?: Goal }) {
  const addGoal = useFinance((s) => s.addGoal);
  const updateGoal = useFinance((s) => s.updateGoal);
  const deleteGoal = useFinance((s) => s.deleteGoal);
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [current, setCurrent] = useState(goal ? String(goal.current) : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? addMonthsToDate(todayISO(), 6));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = 'Give your goal a name';
    if (!(Number(target) > 0)) found.target = 'Enter a target amount';
    if (!deadline) found.deadline = 'Pick a target date';
    setErrors(found);
    if (Object.keys(found).length) return;
    const draft = { name: name.trim(), target: round2(Number(target)), current: round2(Number(current) || 0), deadline };
    if (goal) updateGoal(goal.id, draft);
    else addGoal(draft);
    toast(goal ? 'Goal updated' : 'Goal created');
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
      <Field label="Goal name" htmlFor="goal-name" error={errors.name}>
        <Input
          id="goal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Emergency fund, New bike"
          maxLength={40}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount" htmlFor="goal-target" error={errors.target}>
          <MoneyInput id="goal-target" value={target} onChange={setTarget} placeholder="0" />
        </Field>
        <Field label="Already saved" htmlFor="goal-current">
          <MoneyInput id="goal-current" value={current} onChange={setCurrent} placeholder="0" />
        </Field>
      </div>
      <Field label="Target date" htmlFor="goal-deadline" error={errors.deadline}>
        <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </Field>
      <div className="flex gap-2 pt-2">
        {goal && (
          <Button
            variant="danger"
            onClick={() => {
              deleteGoal(goal.id);
              toast('Goal deleted');
              onClose();
            }}
          >
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {goal ? 'Save' : 'Create goal'}
        </Button>
      </div>
    </form>
  );
}

export function ContributeForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  return (
    <Modal open={goal !== null} onClose={onClose} title={goal ? goal.name : ''}>
      {goal && <ContributeFields goal={goal} onClose={onClose} />}
    </Modal>
  );
}

function ContributeFields({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const contribute = useFinance((s) => s.contributeToGoal);
  const [mode, setMode] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const left = Math.max(goal.target - goal.current, 0);

  const save = () => {
    const value = round2(Number(amount));
    if (!(value > 0)) return setError('Enter an amount');
    if (mode === 'withdraw' && value > goal.current) return setError(`You can withdraw up to ${formatINR(goal.current)}`);
    contribute(goal.id, mode === 'add' ? value : -value);
    toast(mode === 'add' ? `Added ${formatINR(value)} to ${goal.name}` : `Withdrew ${formatINR(value)} from ${goal.name}`);
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
      <p className="text-sm text-muted">
        {formatINR(goal.current)} saved · {left > 0 ? `${formatINR(left)} to go` : 'Goal reached'}
      </p>
      <Segmented
        label="Add or withdraw"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'add', label: 'Add money' },
          { value: 'withdraw', label: 'Withdraw' },
        ]}
        className="flex w-full"
      />
      <Field label="Amount" htmlFor="contribute-amount" error={error}>
        <MoneyInput id="contribute-amount" value={amount} onChange={setAmount} placeholder="0" autoFocus />
      </Field>
      {mode === 'add' && left > 0 && (
        <button type="button" className="text-[13px] font-semibold text-primary hover:underline" onClick={() => setAmount(String(left))}>
          Fill the remaining {formatINR(left)}
        </button>
      )}
      <Button type="submit" className="w-full">
        {mode === 'add' ? 'Add to goal' : 'Withdraw'}
      </Button>
    </form>
  );
}
