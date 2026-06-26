import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { db, type MessageTemplate, type TemplateCategory } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { haptic } from '../../lib/haptics';
import { addToSyncQueue } from '../../lib/syncQueue';
import { getAvailablePlaceholders } from '../../lib/templateEngine';
import { captureTemplateEdited } from '../../lib/analytics';
import { showSuccess, showToast } from '../../components/Toast/store';
import { Button } from '../../components/Button';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  booking: 'Booking',
  reminder: 'Reminder',
  invoice: 'Invoice',
  follow_up: 'Follow-up',
  review: 'Review',
  receipt: 'Receipt',
  update: 'Update',
  custom: 'Custom',
};

// Pre-filled template variations per category — 3 options each
const TEMPLATE_PRESETS: Record<TemplateCategory, Array<{ name: string; body: string }>> = {
  booking: [
    { name: 'Booking confirmed', body: 'Hi {firstName}, your {jobTitle} is confirmed for {date} at {time}. I\'ll be at {address}. See you then! — {businessName}' },
    { name: 'Booking confirmed (casual)', body: 'Hi {firstName}, all booked in for {date} at {time}! See you at {address}. Any questions just reply. — {businessName}' },
    { name: 'Booking + deposit', body: 'Hi {firstName}, your {jobTitle} is booked for {date} at {time}. Please pay your deposit here: [deposit link]. See you then! — {businessName}' },
  ],
  reminder: [
    { name: 'Day-before reminder', body: 'Hi {firstName}, just a reminder I\'m coming tomorrow at {time} for the {jobTitle}. — {businessName}' },
    { name: '2-hour reminder', body: 'Hi {firstName}, see you at {time} today for the {jobTitle}! I\'m at {address} shortly. — {businessName}' },
    { name: 'Morning-of reminder', body: 'Hi {firstName}, confirming I\'ll be there at {time} today for the {jobTitle}. See you soon! — {businessName}' },
  ],
  invoice: [
    { name: 'Invoice due', body: 'Hi {firstName}, the balance of {amount} is now due for the {jobTitle}. Please arrange payment at your earliest convenience. Thanks! — {businessName}' },
    { name: 'Invoice + bank details', body: 'Hi {firstName}, your invoice for {amount} is ready. Bank transfer: {businessName}, sort code [sort], account [account]. Thanks! — {businessName}' },
    { name: 'Gentle chase', body: 'Hi {firstName}, just a friendly reminder about the {amount} for the {jobTitle}. Let me know if you need to talk about payment timing. — {businessName}' },
  ],
  follow_up: [
    { name: 'Quote follow-up', body: 'Hi {firstName}, just following up on the quote I sent for the {jobTitle}. Happy to answer any questions. — {businessName}' },
    { name: 'Quote + availability', body: 'Hi {firstName}, following up on the {jobTitle} quote. I\'ve got a slot opening up next week if you\'d like to book. Let me know! — {businessName}' },
    { name: 'Re-engage (no reply)', body: 'Hi {firstName}, I sent a quote for the {jobTitle} a while back — no rush, but let me know if you\'re still interested. — {businessName}' },
  ],
  review: [
    { name: 'Review request', body: 'Hi {firstName}, glad the {jobTitle} is sorted! If you were happy with the work, a quick Google review helps me a lot: [review link]. Thanks! — {businessName}' },
    { name: 'Review (short)', body: 'Hi {firstName}, hope you\'re happy with the {jobTitle}! A Google review would mean a lot: [review link]. Only takes 30 seconds. — {businessName}' },
    { name: 'Review + thanks', body: 'Hi {firstName}, thanks for choosing {businessName} for the {jobTitle}! If you could spare 30 seconds for a Google review, I\'d really appreciate it: [review link] — {businessName}' },
  ],
  receipt: [
    { name: 'Payment receipt', body: 'Hi {firstName}, payment of {amount} for {jobTitle} has been confirmed. Thanks for your business! — {businessName}' },
    { name: 'Receipt (warm)', body: 'Hi {firstName}, thanks for the payment of {amount}! Really appreciate your business. If you need anything else, just let me know. — {businessName}' },
    { name: 'Receipt + review nudge', body: 'Hi {firstName}, payment of {amount} received for {jobTitle}. If you were happy with the work, a Google review would mean a lot: {reviewLink} — {businessName}' },
  ],
  update: [
    { name: 'Job update', body: 'Hi {firstName}, just an update on your {jobTitle}. — {businessName}' },
    { name: 'Schedule change', body: 'Hi {firstName}, your {jobTitle} is now scheduled for {date} at {time}. Let me know if that still works for you. — {businessName}' },
    { name: 'Running late', body: 'Hi {firstName}, sorry but I\'m running about 30 minutes late for the {jobTitle}. See you shortly. — {businessName}' },
  ],
  custom: [
    { name: 'Blank template', body: '' },
    { name: 'General message', body: 'Hi {firstName}, this is {businessName} re: the {jobTitle}. ' },
    { name: 'On my way', body: 'Hi {firstName}, I\'m on my way to you now for the {jobTitle}. Should be about 15 minutes. — {businessName}' },
  ],
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
    if (!tmpl.name.trim() || !tmpl.body.trim()) {
      showToast('Name and message body are required', 'info');
      return;
    }
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

  const handleDelete = useCallback(async (id: string) => {
    await db.message_templates.delete(id);
    await addToSyncQueue('message_templates', id, {}, 'delete');
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    haptic('light');
    showSuccess('Template deleted');
  }, []);

  const handleCreate = useCallback(async () => {
    if (!userId) return;
    setEditing({
      id: crypto.randomUUID(),
      user_id: userId,
      category: 'custom',
      name: '',
      body: '',
      is_default: false,
      sort_order: templates.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _sync_status: 'pending',
    });
    // Don't save to Dexie yet — only on explicit save from editor
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
        onDelete={handleDelete}
      />
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Sticky header — clean layout: chevron only, stacked title + subtitle */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-brand-dark cursor-pointer mb-2">
          <ChevronLeft size={20} />
        </button>
        <h1 className="screen-title text-brand-black">Templates</h1>
        <p className="text-xs text-brand-muted mt-0.5">Save time on WhatsApp messages — templates auto-fill with each customer's details</p>
      </div>

      {/* Template list */}
      <div className="px-4 pt-4 pb-24 flex-1">
        {templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-brand-muted mb-4">No templates yet</p>
            <p className="text-xs text-brand-muted">Tap "New template" below to get started</p>
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
                  <span className="text-sm font-semibold text-brand-black">{tmpl.name || 'Untitled'}</span>
                  <span className="text-xs font-medium text-brand-mid bg-brand-surface px-2 py-0.5 rounded">
                    {CATEGORY_LABELS[tmpl.category]}
                  </span>
                </div>
                <p className="text-xs text-brand-dark line-clamp-2 leading-relaxed">{tmpl.body || '(empty — tap to edit)'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky CTA footer — add new template */}
      <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={handleCreate} fullWidth>
          <Plus size={18} className="mr-2" />
          New template
        </Button>
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onCancel,
  onDelete,
}: {
  template: MessageTemplate;
  onSave: (tmpl: MessageTemplate) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [category, setCategory] = useState<TemplateCategory>(template.category);
  const [showPresets, setShowPresets] = useState(false);
  const placeholders = getAvailablePlaceholders();

  const canSave = name.trim().length > 0 && body.trim().length > 0;

  const insertPlaceholder = (ph: string) => {
    setBody((prev) => prev + ph);
    haptic('light');
  };

  const applyPreset = (preset: { name: string; body: string }) => {
    setName(preset.name);
    setBody(preset.body);
    setShowPresets(false);
    haptic('light');
  };

  const clearBody = () => {
    setBody('');
    haptic('light');
  };

  const handleCategoryChange = (cat: TemplateCategory) => {
    setCategory(cat);
    haptic('light');
    // Show presets when selecting a category (if body is empty or user is creating new)
    if (!body.trim() || !template.created_at) {
      setShowPresets(true);
    }
  };

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Header — chevron back only, no save button */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <button onClick={onCancel} className="flex items-center gap-1 text-brand-dark cursor-pointer mb-2">
          <ChevronLeft size={20} />
        </button>
        <h1 className="screen-title text-brand-black">{template.name ? 'Edit template' : 'New template'}</h1>
      </div>

      <div className="px-4 pt-4 pb-24 flex-1 flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-brand-dark">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Booking confirmation"
            className="w-full h-11 px-3 text-base font-medium text-brand-black bg-white border border-brand-border rounded-lg outline-none focus:border-brand-black"
          />
        </div>

        {/* Category */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-brand-dark">Category</label>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
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

        {/* Preset variations — shown when category is selected or toggled */}
        {showPresets && TEMPLATE_PRESETS[category] && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-brand-dark">Start from a template</label>
              <button onClick={() => setShowPresets(false)} className="text-xs text-brand-muted cursor-pointer">Hide</button>
            </div>
            <div className="flex flex-col gap-2">
              {TEMPLATE_PRESETS[category].map((preset, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(preset)}
                  className="text-left px-3 py-2.5 bg-brand-surface border border-brand-border rounded-lg cursor-pointer active:opacity-70 transition-opacity"
                >
                  <p className="text-xs font-semibold text-brand-black mb-0.5">{preset.name}</p>
                  <p className="text-xs text-brand-muted line-clamp-2 leading-relaxed">{preset.body || '(blank — start from scratch)'}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message body */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-brand-dark">Message body</label>
            {body && (
              <button onClick={clearBody} className="text-xs text-brand-muted cursor-pointer flex items-center gap-1">
                <Trash2 size={11} />
                Clear
              </button>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full p-3 text-sm font-medium text-brand-black bg-white border border-brand-border rounded-lg outline-none focus:border-brand-black resize-none"
            placeholder="Type your message... or pick a template above to start"
          />
          {!body.trim() && (
            <button onClick={() => setShowPresets(!showPresets)} className="text-xs text-brand-dark cursor-pointer self-start">
              {showPresets ? 'Hide templates' : 'Browse template suggestions ↑'}
            </button>
          )}
        </div>

        {/* Placeholders */}
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

        {/* Delete (only for existing templates, not new ones) */}
        {template.created_at && template.name && (
          <button
            onClick={() => {
              if (window.confirm('Delete this template?')) {
                onDelete(template.id);
                onCancel();
              }
            }}
            className="text-sm text-status-error cursor-pointer self-center mt-4"
          >
            Delete template
          </button>
        )}
      </div>

      {/* Sticky CTA footer — Save button */}
      <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <Button
          variant="primary"
          onClick={() => onSave({ ...template, name, body, category })}
          disabled={!canSave}
          fullWidth
        >
          Save template
        </Button>
        {!canSave && (
          <p className="text-xs text-brand-muted text-center mt-1.5">Name and message body are required</p>
        )}
      </div>
    </div>
  );
}
