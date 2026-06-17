import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { db } from '../../lib/db';
import { captureJobCreated, captureQuoteSent } from '../../lib/analytics';
import { showSuccess } from '../../components/Toast/store';
import { hapticSuccess } from '../../lib/haptics';
import { nextJobNumber } from '../../lib/jobNumbers';
import LogMissedCall from './LogMissedCall';
import CustomerDetails from './CustomerDetails';
import QuoteBuilder from './QuoteBuilder';
import QuotePreview from './QuotePreview';
import QuoteSent from './QuoteSent';

/* ─── helpers ─── */

function now() { return new Date().toISOString(); }

/* ─── types ─── */

type EntryPoint = 'missed_call' | 'new_quote' | 'task';

type QuoteStep = 'missed_call' | 'customer_details' | 'builder' | 'preview' | 'sent';

type SendMethod = 'whatsapp' | 'sms' | 'copy';

interface LocationState {
  entryPoint?: EntryPoint;
  customerId?: string;
  jobId?: string;
}

/* ─── component ─── */

export default function Quote() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAppStore((s) => s.userId);

  const state = (location.state as LocationState | null) || {};
  const entryPoint: EntryPoint = state.entryPoint || 'new_quote';
  const initialCustomerId = state.customerId;
  const initialJobId = state.jobId;

  const [step, setStep] = useState<QuoteStep>(
    entryPoint === 'missed_call' ? 'missed_call' : 'customer_details'
  );
  const [customerId, setCustomerId] = useState<string | undefined>(initialCustomerId);
  const [jobId, setJobId] = useState<string | undefined>(initialJobId);
  const [sendMethod, setSendMethod] = useState<SendMethod | undefined>(undefined);

  /* Allow direct navigation via query params (e.g. /quote?step=preview&jobId=xxx) */
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const stepParam = searchParams.get('step') as QuoteStep | null;
    const jobIdParam = searchParams.get('jobId');
    if (stepParam && ['missed_call', 'customer_details', 'builder', 'preview', 'sent'].includes(stepParam)) {
      setStep(stepParam);
    }
    if (jobIdParam) {
      setJobId(jobIdParam);
    }
    const customerIdParam = searchParams.get('customerId');
    if (customerIdParam) {
      setCustomerId(customerIdParam);
    }
  }, [location.search]);

  // Persist quote state to localStorage so refresh/switch doesn't lose progress
  // TTL: 24 hours (86400000 ms) to avoid stale drafts persisting forever
  useEffect(() => {
    if (step !== 'missed_call') {
      const state = { step, customerId, jobId, sendMethod, timestamp: Date.now() };
      localStorage.setItem('buildlogg_quote_state', JSON.stringify(state));
    }
  }, [step, customerId, jobId, sendMethod]);

  // Save state immediately when app goes to background (before iOS suspends tab)
  useEffect(() => {
    const saveNow = () => {
      if (step !== 'missed_call') {
        const state = { step, customerId, jobId, sendMethod, timestamp: Date.now() };
        localStorage.setItem('buildlogg_quote_state', JSON.stringify(state));
      }
    };
    // pagehide fires before tab is killed/suspended
    window.addEventListener('pagehide', saveNow);
    // visibilitychange catches backgrounding
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
    return () => {
      window.removeEventListener('pagehide', saveNow);
    };
  }, [step, customerId, jobId, sendMethod]);

  // Restore state from localStorage on mount (handles refresh / PWA reload / tab restore)
  useEffect(() => {
    const saved = localStorage.getItem('buildlogg_quote_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { step: QuoteStep; customerId?: string; jobId?: string; sendMethod?: SendMethod; timestamp: number };
        // Only restore if less than 24 hours old
        const TTL = 24 * 60 * 60 * 1000; // 24h
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > TTL) {
          localStorage.removeItem('buildlogg_quote_state');
          return;
        }
        if (parsed.step && parsed.step !== 'missed_call') {
          setStep(parsed.step);
          if (parsed.customerId) setCustomerId(parsed.customerId);
          if (parsed.jobId) setJobId(parsed.jobId);
          if (parsed.sendMethod) setSendMethod(parsed.sendMethod);
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  // Clear persisted state when leaving quote flow (completed or cancelled)
  const clearPersistedState = () => {
    localStorage.removeItem('buildlogg_quote_state');
  };

  /* Save customer data to Dexie (new or update) */
  const saveCustomer = async (data: { id: string; name: string; phone: string; address?: string }) => {
    if (!userId) return;
    const n = now();
    const existing = await db.customers.get(data.id);

    if (existing) {
      await db.customers.update(data.id, {
        name: data.name,
        phone: data.phone,
        address: data.address,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'customers',
        record_id: data.id,
        payload: { name: data.name, phone: data.phone, address: data.address, updated_at: n },
        created_at: n,
        retry_count: 0,
      });
    } else {
      await db.customers.add({
        id: data.id,
        user_id: userId,
        name: data.name,
        phone: data.phone,
        address: data.address,
        created_at: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'insert',
        table_name: 'customers',
        record_id: data.id,
        payload: { id: data.id, user_id: userId, name: data.name, phone: data.phone, address: data.address, created_at: n, updated_at: n },
        created_at: n,
        retry_count: 0,
      });
    }
  };

  /* ─── handlers ─── */

  const handleMissedCallDone = () => {
    clearPersistedState();
    navigate('/', { replace: true, state: { initialTab: 'tasks' } });
  };

  const handleCustomerDetailsComplete = async (data: { id: string; name: string; phone: string; address?: string }) => {
    await saveCustomer(data);
    setCustomerId(data.id);

    // Find existing job for this customer in enquiry status
    if (userId) {
      const existingJobs = await db.jobs
        .where('customer_id').equals(data.id)
        .and(j => j.status === 'enquiry')
        .toArray();

      const profile = await db.profiles.get(userId);
      const defaultPaymentTerms = profile?.payment_terms || 'on_completion';

      if (existingJobs.length > 0) {
        setJobId(existingJobs[0].id);
      } else {
        // Create new job with profile defaults
        const newJobId = crypto.randomUUID();
        const n = now();
        const jobPaymentTerms = defaultPaymentTerms;
        const jobNumber = await nextJobNumber(userId);
        await db.jobs.add({
          id: newJobId,
          user_id: userId,
          customer_id: data.id,
          title: '',
          job_number: jobNumber,
          status: 'enquiry',
          payment_terms: jobPaymentTerms,
          is_multi_day: false,
          created_at: n,
          updated_at: n,
          _sync_status: 'pending',
        });
        await db.sync_queue.add({
          operation: 'insert',
          table_name: 'jobs',
          record_id: newJobId,
          payload: {
            id: newJobId, user_id: userId, customer_id: data.id, job_number: jobNumber,
            title: '', status: 'enquiry', payment_terms: jobPaymentTerms,
            is_multi_day: false, created_at: n, updated_at: n,
          },
          created_at: n,
          retry_count: 0,
        });
        setJobId(newJobId);
        captureJobCreated('new_quote');
      }
    }

    setStep('builder');
  };

  const handleBuilderPreview = () => {
    setStep('preview');
  };

  const handlePreviewBack = () => {
    setStep('builder');
  };

  const handlePreviewSend = async (method: SendMethod) => {
    if (!jobId || !userId) return;
    const n = now();

    const profile = await db.profiles.get(userId);
    const validDays = profile?.quote_valid_days ?? 30;
    const expiresAt = new Date(Date.now() + validDays * 86400000).toISOString();

    await db.jobs.update(jobId, {
      status: 'quoted',
      quote_sent_at: n,
      quote_expires_at: expiresAt,
      quote_send_method: method,
      updated_at: n,
      _sync_status: 'pending',
    });

    const isCopy = method === 'copy';
    if (!isCopy) {
      const workLogId = crypto.randomUUID();
      await db.work_log.add({
        id: workLogId,
        job_id: jobId,
        type: 'quote_sent',
        description: `Quote sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
        created_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'insert',
        table_name: 'work_log',
        record_id: workLogId,
        payload: { id: workLogId, job_id: jobId, type: 'quote_sent', description: `Quote sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}`, created_at: n },
        created_at: n,
        retry_count: 0,
      });
    }
    await db.sync_queue.add({
      operation: 'update',
      table_name: 'jobs',
      record_id: jobId,
      payload: { status: 'quoted', quote_sent_at: n, quote_expires_at: expiresAt, quote_send_method: method, updated_at: n },
      created_at: n,
      retry_count: 0,
    });

    hapticSuccess();
    showSuccess(isCopy ? 'Copied to clipboard' : 'Quote sent!');
    captureQuoteSent(method);
    setSendMethod(method);
    setStep('sent');
  };

  const handlePreviewSaveDraft = () => {
    clearPersistedState();
    navigate('/', { replace: true });
  };

  const handleSentViewJob = () => {
    clearPersistedState();
    if (jobId) {
      navigate(`/jobs/${jobId}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleSentHome = () => {
    clearPersistedState();
    navigate('/', { replace: true });
  };

  const handleSaveDraft = () => {
    clearPersistedState();
    navigate('/', { replace: true });
  };

  const handleCancel = () => {
    clearPersistedState();
    navigate(-1);
  };

  /* ─── render ─── */

  switch (step) {
    case 'missed_call':
      return <LogMissedCall onDone={handleMissedCallDone} />;

    case 'customer_details':
      return (
        <CustomerDetails
          customerId={customerId}
          onComplete={handleCustomerDetailsComplete}
          onCancel={handleCancel}
        />
      );

    case 'builder':
      if (!customerId) {
        // Guard: if user refreshed and lost state, redirect back to customer details
        setStep('customer_details');
        return null;
      }
      return (
        <QuoteBuilder
          customerId={customerId}
          jobId={jobId}
          onPreview={handleBuilderPreview}
          onBack={() => setStep('customer_details')}
          onSaveDraft={handleSaveDraft}
        />
      );

    case 'preview':
      if (!jobId) {
        // Guard: if user refreshed and lost state, redirect back to builder
        if (customerId) setStep('builder');
        else setStep('customer_details');
        return null;
      }
      return (
        <QuotePreview
          jobId={jobId}
          onSend={handlePreviewSend}
          onSaveDraft={handlePreviewSaveDraft}
          onBack={handlePreviewBack}
        />
      );

    case 'sent':
      if (!jobId || !sendMethod) {
        if (jobId) {
          setStep('preview');
        } else if (customerId) {
          setStep('builder');
        } else {
          setStep('customer_details');
        }
        return null;
      }
      return (
        <QuoteSent
          jobId={jobId}
          sendMethod={sendMethod}
          onViewJob={handleSentViewJob}
          onHome={handleSentHome}
        />
      );

    default:
      return null;
  }
}
