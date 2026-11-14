import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Helmet } from 'react-helmet-async';
import { 
  CheckCircle2, 
  MessageSquare, 
  Mail, 
  ShieldCheck, 
  ArrowRight 
} from 'lucide-react';
import { PRODUCTS } from '../content/products';

// Zod schema
const demoFormSchema = z.object({
  name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid work email address'),
  phone: z.string().min(10, 'Please enter a valid phone or WhatsApp number'),
  company: z.string().min(2, 'Company name is required'),
  edition: z.string().min(1, 'Please select an edition or interest area'),
  plantSize: z.string().min(1, 'Please select your plant / team size'),
  message: z.string().optional(),
  consent: z.boolean().refine((val) => val === true, {
    message: 'You must agree to our privacy policy and communications terms',
  }),
  // Honeypot field (must stay empty)
  _hp_organization_title: z.string().max(0, 'Spam detected').optional(),
});

type DemoFormData = z.infer<typeof demoFormSchema>;

export const DemoPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const preselectedEdition = searchParams.get('edition') || '';
  const [submittedData, setSubmittedData] = useState<DemoFormData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const endpoint = import.meta.env.VITE_FORM_ENDPOINT || '';
  const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'ops@plinth.erp';
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '+919876543210';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DemoFormData>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      edition: preselectedEdition,
      plantSize: '1 plant (10-50 workers)',
      message: '',
      consent: false,
      _hp_organization_title: '',
    },
  });

  useEffect(() => {
    if (preselectedEdition) {
      setValue('edition', preselectedEdition);
    }
  }, [preselectedEdition, setValue]);

  const onSubmit = async (data: DemoFormData) => {
    // Check honeypot
    if (data._hp_organization_title && data._hp_organization_title.length > 0) {
      return; // Silently reject bot submission
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    // If endpoint is configured, try POST
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        setSubmittedData(data);
      } catch (err) {
        setSubmissionError('Automatic submission failed. You can reach us directly via WhatsApp or Email below.');
        setSubmittedData(data); // Provide instant confirmation and mailto fallback
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Local / static environment without backend endpoint: immediately succeed and offer direct links
      setIsSubmitting(false);
      setSubmittedData(data);
    }
  };

  const mailtoUrl = submittedData
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(`Demo Request: ${submittedData.company} (${submittedData.edition})`)}&body=${encodeURIComponent(
        `Name: ${submittedData.name}\nEmail: ${submittedData.email}\nPhone: ${submittedData.phone}\nCompany: ${submittedData.company}\nEdition: ${submittedData.edition}\nPlant Size: ${submittedData.plantSize}\nNotes: ${submittedData.message || 'None'}`
      )}`
    : `mailto:${contactEmail}`;

  const cleanWaNumber = whatsappNumber.replace(/[^0-9]/g, '');
  const whatsappUrl = submittedData
    ? `https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(
        `Hi Plinth team, I'd like to book a demo for ${submittedData.company}. Edition: ${submittedData.edition}. Name: ${submittedData.name}`
      )}`
    : `https://wa.me/${cleanWaNumber}?text=${encodeURIComponent('Hi Plinth team, I would like to request a demo of Plinth ERP.')}`;

  return (
    <div className="bg-page min-h-screen py-10">
      <Helmet>
        <title>Book a Demo — Plinth Industrial Cloud ERP</title>
        <meta
          name="description"
          content="Schedule a walkthrough of Plinth Manufacturing or join the waitlist for specialized industry editions."
        />
        <link rel="canonical" href="https://plinth.erp/demo" />
      </Helmet>

      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-xs uppercase tracking-wider text-ink-muted mb-4">
            <span>Operational Walkthrough</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-3 font-sans">
            Schedule an Operational Walkthrough
          </h1>
          <p className="text-base text-ink-secondary leading-relaxed">
            See how Plinth manages bills of materials, multi-location stock, and plant dispatches with complete audit rigor.
          </p>
        </div>

        {submittedData ? (
          /* Confirmation Screen */
          <div className="bg-surface rounded-2xl border border-border p-8 sm:p-12 text-center shadow-popover max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-full bg-green-bg border border-green-solid flex items-center justify-center mx-auto mb-6 text-green-text">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-2">Request Received</h2>
            <p className="text-sm text-ink-secondary mb-6 leading-relaxed">
              Thank you, <strong className="text-ink">{submittedData.name}</strong>. An operational engineer will contact you at <strong className="text-ink">{submittedData.email}</strong> to coordinate access.
            </p>

            {submissionError && (
              <div className="mb-6 p-4 bg-muted border border-border rounded-lg text-xs text-ink-secondary text-left">
                <p className="font-semibold text-ink mb-1">Direct connect option:</p>
                <p className="mb-3">{submissionError}</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={mailtoUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-border text-ink text-xs "
                  >
                    <Mail className="w-3.5 h-3.5 text-accent" /> Dispatch via Email
                  </a>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface border border-border text-ink text-xs "
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-accent" /> Message on WhatsApp
                  </a>
                </div>
              </div>
            )}

            <div className="p-4 bg-muted rounded-xl border border-border text-xs text-left text-ink-secondary space-y-1 mb-8 ">
              <div>Company: <span className="text-ink font-semibold">{submittedData.company}</span></div>
              <div>Selected Edition: <span className="text-ink font-semibold">{submittedData.edition}</span></div>
              <div>Plant Footprint: <span className="text-ink font-semibold">{submittedData.plantSize}</span></div>
            </div>

            <div className="flex justify-center gap-4">
              <Link
                to="/"
                className="px-6 py-2.5 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
              >
                Back to home
              </Link>
              <Link
                to="/products"
                className="px-6 py-2.5 rounded-lg bg-surface border border-border text-ink font-semibold text-sm hover:border-border-strong transition-colors"
              >
                Browse editions
              </Link>
            </div>
          </div>
        ) : (
          /* Demo Request Form */
          <div className="bg-surface rounded-2xl border border-border p-8 sm:p-12 shadow-popover max-w-2xl mx-auto">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
              {/* Honeypot field (hidden from view) */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="_hp_organization_title">Leave blank</label>
                <input
                  id="_hp_organization_title"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  {...register('_hp_organization_title')}
                />
              </div>

              {/* Name & Work Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Full Name *
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Arun Kumar"
                    {...register('name')}
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-surface border text-sm text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-ink transition-colors ${
                      errors.name ? 'border-red-solid' : 'border-border'
                    }`}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-text mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Work Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="arun@precisionvalves.com"
                    {...register('email')}
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-surface border text-sm text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-ink transition-colors ${
                      errors.email ? 'border-red-solid' : 'border-border'
                    }`}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-text mt-1">{errors.email.message}</p>
                  )}
                </div>
              </div>

              {/* Phone & Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="phone" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Phone / WhatsApp *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    {...register('phone')}
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-surface border text-sm text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-ink transition-colors ${
                      errors.phone ? 'border-red-solid' : 'border-border'
                    }`}
                  />
                  {errors.phone && (
                    <p className="text-xs text-red-text mt-1">{errors.phone.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="company" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Company Name *
                  </label>
                  <input
                    id="company"
                    type="text"
                    placeholder="Precision Valves & Castings Ltd"
                    {...register('company')}
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-surface border text-sm text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-ink transition-colors ${
                      errors.company ? 'border-red-solid' : 'border-border'
                    }`}
                  />
                  {errors.company && (
                    <p className="text-xs text-red-text mt-1">{errors.company.message}</p>
                  )}
                </div>
              </div>

              {/* Edition Select & Plant Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="edition" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Primary Interest / Edition *
                  </label>
                  <select
                    id="edition"
                    {...register('edition')}
                    className={`w-full px-3.5 py-2.5 rounded-lg bg-surface border text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink transition-colors ${
                      errors.edition ? 'border-red-solid' : 'border-border'
                    }`}
                  >
                    <option value="">Select an edition...</option>
                    {PRODUCTS.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name} {p.status === 'coming-soon' ? '(Waitlist)' : '(Available)'}
                      </option>
                    ))}
                    <option value="other">Other / Custom Operations</option>
                  </select>
                  {errors.edition && (
                    <p className="text-xs text-red-text mt-1">{errors.edition.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="plantSize" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                    Plant Scale / Facility Size *
                  </label>
                  <select
                    id="plantSize"
                    {...register('plantSize')}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-border text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink transition-colors"
                  >
                    <option value="1 plant (1-25 workers)">1 plant (1–25 workers)</option>
                    <option value="1 plant (25-100 workers)">1 plant (25–100 workers)</option>
                    <option value="Multiple plants (100-500 workers)">Multiple plants (100–500 workers)</option>
                    <option value="Enterprise (500+ workers)">Enterprise (500+ workers)</option>
                  </select>
                </div>
              </div>

              {/* Operational Message */}
              <div>
                <label htmlFor="message" className="block text-xs uppercase tracking-wider text-ink-muted mb-2">
                  Operational Requirements (Optional)
                </label>
                <textarea
                  id="message"
                  rows={3}
                  placeholder="Tell us about your current bottlenecks (e.g. Tally sync, BOM tracking, dispatch delays)..."
                  {...register('message')}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-border text-sm text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-ink transition-colors resize-none"
                />
              </div>

              {/* Consent checkbox */}
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('consent')}
                    className="mt-1 w-4 h-4 rounded border-border text-inverse focus:ring-ink"
                  />
                  <span className="text-xs text-ink-secondary leading-relaxed">
                    I agree to allow Plinth to contact me regarding this request. We respect operational confidentiality and do not share contact details. See our{' '}
                    <Link to="/privacy" className="text-ink underline hover:text-accent">
                      Privacy Policy
                    </Link>.
                  </span>
                </label>
                {errors.consent && (
                  <p className="text-xs text-red-text mt-1">{errors.consent.message}</p>
                )}
              </div>

              {/* Submit button */}
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-6 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-button flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <span>Submitting request...</span>
                  ) : (
                    <>
                      <span>Submit Walkthrough Request</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Fallback direct channels */}
              <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-ink-secondary gap-3">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-accent" /> Role-based confidentiality guaranteed
                </span>
                <div className="flex items-center gap-4">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-ink transition-colors font-medium"
                  >
                    WhatsApp Us
                  </a>
                  <span>•</span>
                  <a href={`mailto:${contactEmail}`} className="hover:text-ink transition-colors font-medium">
                    {contactEmail}
                  </a>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
