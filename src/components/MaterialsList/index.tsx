import React, { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { db, type MaterialItem } from '../../lib/db';
import { captureMaterialAdded } from '../../lib/analytics';

interface MaterialsListProps {
  jobId: string;
  userId: string;
  materialItems: MaterialItem[];
  quotedTotal: number;
  onMaterialsChange: () => void;
  editable?: boolean;
}

export const MaterialsList: React.FC<MaterialsListProps> = ({
  jobId,
  userId,
  materialItems,
  quotedTotal,
  onMaterialsChange,
  editable = true,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [markup, setMarkup] = useState('20');
  const [editingId, setEditingId] = useState<string | null>(null);

  const materialsTotal = useMemo(
    () => materialItems.reduce((s, m) => s + (m.total_price || 0), 0),
    [materialItems],
  );

  const handleAdd = useCallback(async () => {
    const quantity = parseFloat(qty) || 1;
    const cost = parseFloat(unitCost);
    const markupPct = parseFloat(markup) || 0;
    if (!desc.trim() || isNaN(cost) || cost <= 0) return;

    const unitPrice = cost * (1 + markupPct / 100);
    const totalCost = cost * quantity;
    const totalPrice = unitPrice * quantity;
    const n = new Date().toISOString();

    const item: MaterialItem = {
      id: crypto.randomUUID(),
      job_id: jobId,
      user_id: userId,
      description: desc.trim(),
      quantity,
      unit_cost: cost,
      markup_pct: markupPct,
      unit_price: unitPrice,
      total_cost: totalCost,
      total_price: totalPrice,
      added_on_site: true,
      created_at: n,
      _sync_status: 'pending',
    };

    await db.material_items.add(item);
    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'material_items',
      record_id: item.id,
      payload: { ...item },
      created_at: n,
      retry_count: 0,
    });

    captureMaterialAdded();
    haptic('light');
    setDesc('');
    setQty('1');
    setUnitCost('');
    setMarkup('20');
    setIsAdding(false);
    onMaterialsChange();
  }, [desc, qty, unitCost, markup, jobId, userId, onMaterialsChange]);

  const handleDelete = useCallback(async (id: string) => {
    haptic('medium');
    await db.material_items.delete(id);
    await db.sync_queue.add({
      operation: 'delete',
      table_name: 'material_items',
      record_id: id,
      payload: {},
      created_at: new Date().toISOString(),
      retry_count: 0,
    });
    onMaterialsChange();
  }, [onMaterialsChange]);

  const handleUpdate = useCallback(async (item: MaterialItem) => {
    const quantity = parseFloat(qty) || item.quantity;
    const cost = parseFloat(unitCost) || item.unit_cost;
    const markupPct = parseFloat(markup) || item.markup_pct;
    const unitPrice = cost * (1 + markupPct / 100);
    const totalCost = cost * quantity;
    const totalPrice = unitPrice * quantity;
    const n = new Date().toISOString();

    await db.material_items.update(item.id, {
      description: desc.trim() || item.description,
      quantity,
      unit_cost: cost,
      markup_pct: markupPct,
      unit_price: unitPrice,
      total_cost: totalCost,
      total_price: totalPrice,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.sync_queue.add({
      operation: 'update',
      table_name: 'material_items',
      record_id: item.id,
      payload: {
        description: desc.trim() || item.description,
        quantity,
        unit_cost: cost,
        markup_pct: markupPct,
        unit_price: unitPrice,
        total_cost: totalCost,
        total_price: totalPrice,
        updated_at: n,
      },
      created_at: n,
      retry_count: 0,
    });

    haptic('light');
    setEditingId(null);
    setDesc('');
    setQty('1');
    setUnitCost('');
    setMarkup('20');
    onMaterialsChange();
  }, [desc, qty, unitCost, markup, onMaterialsChange]);

  const startEdit = (item: MaterialItem) => {
    setEditingId(item.id);
    setDesc(item.description);
    setQty(String(item.quantity));
    setUnitCost(String(item.unit_cost));
    setMarkup(String(item.markup_pct));
  };

  const pct = quotedTotal > 0 ? (materialsTotal / quotedTotal) * 100 : 0;
  const overBudget = quotedTotal > 0 && materialsTotal > quotedTotal * 1.1;

  return (
    <div className="mb-5">
      {/* Header + comparison */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Materials</span>
        <span className="text-sm font-bold text-brand-black">
          £{materialsTotal.toFixed(2)}
        </span>
      </div>

      {quotedTotal > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-brand-muted mb-1">
            <span>Quoted £{quotedTotal.toFixed(2)}</span>
            <span>Actual £{materialsTotal.toFixed(2)}</span>
          </div>
          <div className="h-2 bg-brand-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                overBudget ? 'bg-status-red' : 'bg-brand-black'
              }`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          {overBudget && (
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-status-red">
              <AlertTriangle size={14} />
              <span>Materials cost exceeds quote by {((pct - 100)).toFixed(0)}%</span>
            </div>
          )}
        </div>
      )}

      {/* List */}
      {materialItems.length > 0 && (
        <div className="border border-brand-border rounded-lg overflow-hidden mb-3">
          {materialItems.map((item, idx) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className={`px-3.5 py-3 ${
                  idx < materialItems.length - 1 ? 'border-b border-brand-borderLight' : ''
                }`}
              >
                {isEditing && editable ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      className="w-full h-10 px-3 border border-brand-border rounded-lg text-sm text-brand-black outline-none focus:border-brand-black"
                      placeholder="Description"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={qty}
                        onChange={(e) => setQty(e.target.value)}
                        className="h-10 px-3 border border-brand-border rounded-lg text-sm text-brand-black outline-none focus:border-brand-black"
                        placeholder="Qty"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={unitCost}
                        onChange={(e) => setUnitCost(e.target.value)}
                        className="h-10 px-3 border border-brand-border rounded-lg text-sm text-brand-black outline-none focus:border-brand-black"
                        placeholder="Cost"
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={markup}
                        onChange={(e) => setMarkup(e.target.value)}
                        className="h-10 px-3 border border-brand-border rounded-lg text-sm text-brand-black outline-none focus:border-brand-black"
                        placeholder="%"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(item)}
                        className="flex-1 h-9 bg-brand-black text-brand-surface rounded-lg text-sm font-medium cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setDesc(''); setQty('1'); setUnitCost(''); setMarkup('20'); }}
                        className="flex-1 h-9 bg-brand-surface text-brand-dark rounded-lg text-sm font-medium border border-brand-border cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-brand-dark truncate">{item.description}</div>
                      <div className="text-xs text-brand-muted mt-0.5">
                        {item.quantity} × £{item.unit_cost.toFixed(2)} @ {item.markup_pct}% markup = £{item.unit_price.toFixed(2)} ea
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <div className="text-sm font-bold text-brand-black text-right">
                        £{item.total_price.toFixed(2)}
                      </div>
                      {editable && (
                        <>
                          <button
                            onClick={() => startEdit(item)}
                            className="text-xs text-brand-mid underline underline-offset-2 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-status-red cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline add */}
      {isAdding && editable ? (
        <div className="border border-brand-border rounded-lg p-3.5 mb-3 space-y-2">
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base text-brand-black outline-none focus:border-brand-black"
            placeholder="e.g. Copper pipe 15mm"
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-micro text-brand-mid mb-1">Qty</label>
              <input
                type="text"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full h-12 px-3 border-2 border-brand-border rounded-lg text-base text-brand-black outline-none focus:border-brand-black"
              />
            </div>
            <div>
              <label className="block text-micro text-brand-mid mb-1">Unit cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-brand-muted">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="w-full h-12 pl-7 pr-3 border-2 border-brand-border rounded-lg text-base text-brand-black outline-none focus:border-brand-black"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="block text-micro text-brand-mid mb-1">Markup %</label>
              <input
                type="text"
                inputMode="decimal"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className="w-full h-12 px-3 border-2 border-brand-border rounded-lg text-base text-brand-black outline-none focus:border-brand-black"
                placeholder="20"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-brand-muted">
            <span>Unit price: £{(parseFloat(unitCost || '0') * (1 + parseFloat(markup || '0') / 100)).toFixed(2)}</span>
            <span>Total: £{((parseFloat(qty || '0') || 1) * parseFloat(unitCost || '0') * (1 + parseFloat(markup || '0') / 100)).toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!desc.trim() || !unitCost || parseFloat(unitCost) <= 0}
              className="flex-1 h-11 bg-brand-black text-brand-surface rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              Add material
            </button>
            <button
              onClick={() => { setIsAdding(false); setDesc(''); setQty('1'); setUnitCost(''); setMarkup('20'); }}
              className="flex-1 h-11 bg-brand-surface text-brand-dark rounded-lg text-sm font-medium border border-brand-border cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : editable ? (
        <button
          onClick={() => { haptic('light'); setIsAdding(true); }}
          className="flex items-center gap-2 h-10 px-4 rounded-full bg-brand-borderLight text-sm font-medium text-brand-dark border border-brand-border cursor-pointer hover:bg-brand-border active:bg-brand-borderLight transition-colors"
        >
          <Plus size={16} />
          Add material
        </button>
      ) : null}
    </div>
  );
};
