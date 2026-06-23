import { useState, useEffect, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { db, type CustomItem } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/Button';
import { haptic } from '../../lib/haptics';
import { captureCustomItemAdded } from '../../lib/analytics';

export default function CustomItems() {
  const userId = useAppStore((s) => s.userId);
  const [items, setItems] = useState<CustomItem[]>([]);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    db.custom_items
      .where('user_id')
      .equals(userId)
      .sortBy('sort_order')
      .then((data) => {
        setItems(data);
        setLoading(false);
      });
  }, [userId]);

  const addItem = useCallback(async () => {
    const trimmed = desc.trim();
    const val = parseFloat(amount);
    if (!trimmed || isNaN(val) || val <= 0) return;

    const n = new Date().toISOString();
    const item: CustomItem = {
      id: crypto.randomUUID(),
      user_id: userId!,
      description: trimmed,
      amount: val,
      sort_order: items.length,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    };

    await db.custom_items.add(item);
    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'custom_items',
      record_id: item.id,
      payload: { ...item },
      created_at: n,
      retry_count: 0,
    });

    setItems((prev) => [...prev, item]);
    setDesc('');
    setAmount('');
    captureCustomItemAdded();
    haptic('light');
  }, [desc, amount, items.length, userId]);

  const deleteItem = useCallback(async (id: string) => {
    haptic('medium');
    await db.custom_items.delete(id);
    await db.sync_queue.add({
      operation: 'delete',
      table_name: 'custom_items',
      record_id: id,
      payload: {},
      created_at: new Date().toISOString(),
      retry_count: 0,
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-[var(--app-shell-bg)]">
        <div className="sticky top-0 z-40 px-4 pt-2 pb-2 bg-[var(--app-shell-bg)] flex items-center gap-3">
          <button onClick={() => window.history.back()} className="p-1 -ml-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-brand-black">My Items</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[var(--app-shell-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-2 pb-2 bg-[var(--app-shell-bg)] flex items-center gap-3 flex-shrink-0">
        <button onClick={() => window.history.back()} className="p-1 -ml-1 text-brand-dark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-brand-black">My Items</h1>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pb-[calc(140px + env(safe-area-inset-bottom))]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-brand-muted text-center">
            <p className="text-sm">No saved items yet</p>
            <p className="text-sm mt-1">Add your most common parts and services below</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border border-brand-border rounded-lg px-3.5 py-3 bg-[var(--app-shell-bg)]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-brand-dark truncate">
                    {item.description}
                  </div>
                  <div className="text-xs text-brand-muted mt-0.5">
                    £{item.amount.toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="ml-3 p-1.5 text-status-red cursor-pointer active:opacity-60 transition-opacity"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom input */}
      <div className="sticky bottom-0 z-30 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-4 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Combi boiler install"
            className="flex-1 h-12 px-3.5 border border-brand-border rounded-lg text-base text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black min-w-0"
          />
          <div className="relative w-28 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-brand-muted">£</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-12 pl-7 pr-3 border border-brand-border rounded-lg text-base text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            variant="primary"
            onClick={addItem}
            disabled={!desc.trim() || !amount || parseFloat(amount) <= 0}
          >
            + Add item
          </Button>
        </div>
      </div>
    </div>
  );
}
