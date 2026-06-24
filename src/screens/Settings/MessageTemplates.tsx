import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { db, type MessageTemplate, type TemplateCategory } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { haptic } from '../../lib/haptics';
import { addToSyncQueue } from '../../lib/syncQueue';
import { getAvailablePlaceholders } from '../../lib/templateEngine';
import { captureTemplateCreated, captureTemplateEdited } from '../../lib/analytics';
import { showSuccess } from '../../components/Toast/store';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  booking: 'Booking',
  reminder: 'Reminder',
  invoice: 'Invoice',
  follow_up: 'Follow-up',
  review: 'Review',
  custom: 'Custom',
};

export default function MessageTemplates() {
  const userId = useAppStore((s) => s.userId);
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    db.message_templates
      .where('user_id')
      .equals(userId)
      .sortBy('sort_order')
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      });
  }, [userId]);

  const handleSave = useCallback(async (tmpl: MessageTemplate) => {
    const now = new Date().toISOString();
    const updated = { ...tmpl, updated_at: now, _sync_status: 'pending' as const };
    await db.message_templates.put(updated);
    await addToSyncQueue('message_templates', tmpl.id, { ...updated }, 'update');
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === tmpl.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
    captureTemplateEdited({ templateId: tmpl.id });
    haptic('light');
    showSuccess('Template saved');
    setEditing(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!userId) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const tmpl: MessageTemplate = {
      id,
      user_id: userId,
      category: 'custom',
      name: 'New template',
      body: '',
      is_default: false,
      sort_order: templates.length,
      created_at: now,
      updated_at: now,
      _sync_status: 'pending',
    };
    await db.message_templates.add(tmpl);
    await addToSyncQueue('message_templates', id, { ...tmpl }, 'insert');
    setTemplates((prev) => [...prev, tmpl]);
    captureTemplateCreated({ category: 'custom' });
    setEditing(tmpl);
  }, [userId, templates.length]);


  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--app-shell-bg)]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-brand-dark cursor-pointer">
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Settings</span>
          </button>
          <h1 className="text-xl font-extrabold text-brand-black">Templates</h1>
          <button onClick={handleCreate} className="w-8 h-8 flex items-center justify-center text-brand-black cursor-pointer">
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 flex-1">
        {templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-brand-muted">No templates yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                onClick={() => setEditing(tmpl)}
                className="bg-white border border-brand-border rounded-lg p-4 cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-brand-black">{tmpl.name}</span>
                  <span className="text-xs font-medium text-brand-mid bg-brand-surface px-2 py-0.5 rounded">
                    {CATEGORY_LABELS[tmpl.category]}
                  </span>
                </div>
                <p className="text-xs text-brand-dark line-clamp-2 leading-relaxed">{tmpl.body || '(empty)'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: MessageTemplate;
  onSave: (tmpl: MessageTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [category, setCategory] = useState<TemplateCategory>(template.category);
  const placeholders = getAvailablePlaceholders();

  const insertPlaceholder = (ph: string) => {
    setBody((prev) => prev + ph);
    haptic('light');
  };

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <button onClick={onCancel} className="flex items-center gap-1 text-brand-dark cursor-pointer">
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Back</span>
          </button>
          <span className="text-sm font-semibold text-brand-black">Edit template</span>
          <button
            onClick={() => onSave({ ...template, name, body, category })}
            className="text-sm font-semibold text-brand-black cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 flex-1 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-brand-dark">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-11 px-3 text-base font-medium text-brand-black bg-white border border-brand-border rounded-lg outline-none focus:border-brand-black"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-brand-dark">Category</label>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); haptic('light'); }}
                className={`px-3 h-9 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  category === cat
                    ? 'bg-brand-black text-brand-surface'
                    : 'bg-white text-brand-dark border border-brand-border'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-brand-dark">Message body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full p-3 text-sm font-medium text-brand-black bg-white border border-brand-border rounded-lg outline-none focus:border-brand-black resize-none"
            placeholder="Type your message... tap a placeholder below to insert"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-brand-dark">Insert placeholder</label>
          <div className="flex gap-2 flex-wrap">
            {placeholders.map((ph) => (
              <button
                key={ph}
                onClick={() => insertPlaceholder(ph)}
                className="px-2.5 h-8 rounded-lg text-xs font-mono font-medium bg-brand-surface text-brand-dark border border-brand-border cursor-pointer active:opacity-70"
              >
                {ph}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
