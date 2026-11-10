'use client';

import { Checkbox } from '@synergy/ui';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { hrApi } from '@/features/hr/api';
import { useCurrentUser } from '@/features/auth/hooks';
import { getFirstAccessibleRoute } from '@/features/auth/access-control';
import {
  User,
  FileText,
  Briefcase,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  KeyRound,
  Upload
} from 'lucide-react';
import { Button } from '@synergy/ui';

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || undefined;
  const { data: currentUser, isLoading: userLoading, refetch: refetchUser } = useCurrentUser();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  const [hasDemoData, setHasDemoData] = useState(false);
  const [hasEmployeeProfile, setHasEmployeeProfile] = useState(false);

  // Temporary password reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordResetting, setPasswordResetting] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);

  // Form States
  // Screen 1: Personal Details
  const [personalDetails, setPersonalDetails] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    gender: 'Male',
    dateOfBirth: '',
    maritalStatus: 'Single',
    bloodGroup: 'O+',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: 'Spouse',
    bankAccountNumber: '',
    bankName: '',
    bankIfscCode: '',
    panNumber: '',
    aadhaarNumber: ''
  });

  // Screen 2: Documents Upload
  const [documents, setDocuments] = useState<Array<{
    title: string;
    category: string;
    fileUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  }>>([]);


  const [newDoc, setNewDoc] = useState<{
    title: string;
    category: string;
    fileUrl: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
  }>({
    title: '',
    category: 'CERTIFICATE',
    fileUrl: '',
    fileName: '',
    fileSize: undefined,
    mimeType: undefined
  });
  const [docUploadError, setDocUploadError] = useState<string | null>(null);

  // Screen 3: Work Experience
  const [workExperiences, setWorkExperiences] = useState<Array<{
    companyName: string;
    jobTitle: string;
    startDate: string;
    endDate?: string;
    isCurrent?: boolean;
    responsibilities?: string;
    location?: string;
  }>>([]);

  const [newExp, setNewExp] = useState({
    companyName: '',
    jobTitle: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    responsibilities: '',
    location: ''
  });

  // Screen 4: Acknowledgements, Agreements & Signature Upload
  const [agreements, setAgreements] = useState({
    agreedToTerms: false,
    agreedToConductCode: false,
    agreedToNda: false,
    signatureText: '',
    signatureImage: ''
  });

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState<{
    bankAccountNumber?: string;
    bankIfscCode?: string;
    panNumber?: string;
  }>({});


  useEffect(() => {
    async function loadStatus() {
      try {
        setLoading(true);
        setStatusLoadError(null);
        const data = await hrApi.getOnboardingStatus(token);
        // Only mark completed if the user/employee corresponding to this specific link has completed onboarding
        setHasEmployeeProfile(Boolean(data?.employee));
        if (data && data.onboardingCompleted === true) {
          setIsCompleted(true);
        } else {
          setIsCompleted(false);
        }

        if (data && data.employee) {
          setPersonalDetails((prev) => ({
            ...prev,
            firstName: data.employee?.firstName || prev.firstName,
            lastName: data.employee?.lastName || prev.lastName,
            phone: data.employee?.phone || prev.phone,
            gender: data.employee?.gender || prev.gender,
            dateOfBirth: data.employee?.dateOfBirth ? data.employee.dateOfBirth.split('T')[0] : prev.dateOfBirth,
            maritalStatus: data.employee?.maritalStatus || prev.maritalStatus,
            bloodGroup: data.employee?.bloodGroup || prev.bloodGroup,
            addressLine1: data.employee?.addressLine1 || prev.addressLine1,
            addressLine2: data.employee?.addressLine2 || prev.addressLine2,
            city: data.employee?.city || prev.city,
            state: data.employee?.state || prev.state,
            postalCode: data.employee?.postalCode || prev.postalCode,
            country: data.employee?.country || prev.country,
            emergencyContactName: data.employee?.emergencyContactName || prev.emergencyContactName,
            emergencyContactPhone: data.employee?.emergencyContactPhone || prev.emergencyContactPhone,
            emergencyContactRelation: data.employee?.emergencyContactRelation || prev.emergencyContactRelation,
            bankAccountNumber: data.employee?.bankAccountNumber || prev.bankAccountNumber,
            bankName: data.employee?.bankName || prev.bankName,
            bankIfscCode: data.employee?.bankIfscCode || prev.bankIfscCode,
            panNumber: data.employee?.panNumber || prev.panNumber,
            aadhaarNumber: data.employee?.aadhaarNumber || prev.aadhaarNumber
          }));
          const savedDocuments = data.employee.documents || [];
          setDocuments(savedDocuments.map((document) => ({
            title: document.title,
            category: document.category,
            fileUrl: document.fileUrl,
            fileName: document.title.startsWith('SAMPLE ONLY') ? 'SAMPLE ONLY — no real file attached' : document.title,
            fileSize: document.fileSize || undefined,
            mimeType: document.mimeType || undefined
          })));
          setWorkExperiences((data.employee.workExperiences || []).map((experience) => ({
            companyName: experience.companyName,
            jobTitle: experience.jobTitle,
            startDate: experience.startDate?.split('T')[0] || '',
            endDate: experience.endDate?.split('T')[0] || undefined,
            isCurrent: experience.isCurrent,
            responsibilities: experience.responsibilities || undefined,
            location: experience.location || undefined
          })));
          setAgreements((current) => ({
            ...current,
            agreedToTerms: Boolean(data.onboardingDetails?.agreedToTerms),
            agreedToConductCode: Boolean(data.onboardingDetails?.agreedToConductCode),
            agreedToNda: Boolean(data.onboardingDetails?.agreedToNda),
            signatureText: data.onboardingDetails?.signatureText || ''
          }));
          setHasDemoData(data.employee.firstName === 'Demo' || savedDocuments.some((document) => document.title.startsWith('SAMPLE ONLY')));
        }
      } catch (err: unknown) {
        console.error('Failed to load onboarding status:', err);
        setStatusLoadError(err instanceof Error ? err.message : 'Could not load your employee profile. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, [token]);

  const handleDeviceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setDocUploadError(`"${file.name}" exceeds the maximum 15 MB file size limit.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      if (dataUrl) {
        setNewDoc((prev) => ({
          ...prev,
          fileUrl: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          // Auto-fill title from file name without extension if title is empty
          title: prev.title.trim() ? prev.title : file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
        }));
      }
    };
    reader.onerror = () => {
      setDocUploadError(`Failed to read file: ${file.name}`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddDocument = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDocUploadError(null);
    if (!newDoc.fileUrl) {
      setDocUploadError('Please select or upload a document file from your device.');
      return;
    }
    if (!newDoc.title.trim()) {
      setDocUploadError('Please provide a document title.');
      return;
    }
    setDocuments([
      ...documents,
      {
        title: newDoc.title.trim(),
        category: newDoc.category,
        fileUrl: newDoc.fileUrl,
        fileName: newDoc.fileName || 'uploaded-document',
        fileSize: newDoc.fileSize,
        mimeType: newDoc.mimeType
      }
    ]);
    setNewDoc({
      title: '',
      category: 'CERTIFICATE',
      fileUrl: '',
      fileName: '',
      fileSize: undefined,
      mimeType: undefined
    });
  };

  const handleRemoveDoc = (index: number) => {
    setDocuments(documents.filter((_, i) => i !== index));
  };

  const handleAddExp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExp.companyName || !newExp.jobTitle || !newExp.startDate) return;
    setWorkExperiences([...workExperiences, { ...newExp }]);
    setNewExp({
      companyName: '',
      jobTitle: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      responsibilities: '',
      location: ''
    });
  };

  const handleRemoveExp = (index: number) => {
    setWorkExperiences(workExperiences.filter((_, i) => i !== index));
  };
  // Validation helper for Phase 1 (Bank Account, IFSC, PAN)
  const validatePhase1 = () => {
    const errors: { bankAccountNumber?: string; bankIfscCode?: string; panNumber?: string } = {};

    // Bank Account: 9 to 18 numeric digits
    const acc = (personalDetails.bankAccountNumber || '').trim();
    if (acc && !/^\d{9,18}$/.test(acc)) {
      errors.bankAccountNumber = 'Must be a valid 9 to 18 digit numeric bank account number.';
    }

    // IFSC Code: 4 alphabetic letters, 0, and 6 alphanumeric characters (e.g. HDFC0001234, SBIN0000456)
    const ifsc = (personalDetails.bankIfscCode || '').trim().toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      errors.bankIfscCode = 'Must be a valid 11-character IFSC code (e.g. HDFC0001234).';
    }

    // PAN Card: 5 uppercase letters, 4 digits, 1 uppercase letter (e.g. ABCDE1234F)
    const pan = (personalDetails.panNumber || '').trim().toUpperCase();
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      errors.panNumber = 'Must be a valid 10-character PAN number format (e.g. ABCDE1234F).';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAgreements((prev) => ({
          ...prev,
          signatureImage: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };


  // Handle change temporary password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordResetError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordResetError('Passwords do not match.');
      return;
    }
    setPasswordResetting(true);
    setPasswordResetError(null);
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to update password');
      }
      await refetchUser();
    } catch (err: unknown) {
      setPasswordResetError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordResetting(false);
    }
  };

  // Submit complete 4-step wizard
  const handleSubmitOnboarding = async () => {
    if (!agreements.agreedToTerms || !agreements.agreedToConductCode || !agreements.agreedToNda) {
      alert('Please agree to all mandatory policies.');
      return;
    }
    if (!agreements.signatureImage) {
      alert('Please upload your signed signature image.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await hrApi.completeOnboarding({
        personalDetails: {
          ...personalDetails,
          email: currentUser?.email || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('email') || undefined : undefined),
        },
        documents,
        workExperiences,
        agreements
      }, token || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || undefined : undefined));
      setIsCompleted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  // Auth gate — render-path guard (no useEffect delay).
  // Middleware handles the cold-load case; this handles stale React Query cache
  // where currentUser resolves to null after the auth check completes.
  if (!userLoading && !currentUser) {
    if (typeof window !== 'undefined') {
      const next = window.location.pathname + window.location.search;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (loading || userLoading) {
    return (
      <div className="min-h-screen p-12 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-3" />
        <p className="text-xs font-medium">Loading onboarding workspace...</p>
      </div>
    );
  }

  if (statusLoadError) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-card rounded-2xl border border-border p-8 shadow-xs space-y-4 text-center">
          <h1 className="text-xl font-bold text-foreground">Could not load onboarding</h1>
          <p role="alert" className="text-sm text-muted-foreground">{statusLoadError}</p>
          <Button type="button" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!hasEmployeeProfile) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-card rounded-2xl border border-border p-8 shadow-xs space-y-3 text-center">
          <h1 className="text-xl font-bold text-foreground">Employee profile not linked</h1>
          <p className="text-sm text-muted-foreground">This account is not linked to an employee record, so there are no onboarding details to display. Ask an administrator to link or provision the employee profile for this account.</p>
        </div>
      </div>
    );
  }

  // If user is required to change password first
  if (currentUser?.mustChangePassword) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-xs space-y-6 p-8">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Create Your Permanent Password</h2>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              You signed in with a temporary password. Please configure a strong permanent password before starting your onboarding steps.
            </p>
          </div>

          {passwordResetError && (
            <div className="p-3 bg-muted border border-border text-destructive rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{passwordResetError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div>
              <label className="font-medium text-foreground block mb-1.5">
                New Password *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new strong password"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
            <div>
              <label className="font-medium text-foreground block mb-1.5">
                Confirm New Password *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>

            <Button
              type="submit"
              disabled={passwordResetting}
              className="w-full text-xs font-semibold mt-2"
            >
              {passwordResetting ? 'Saving Password...' : 'Save Password & Start Onboarding'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // POST ONBOARDING COMPLETION VIEW
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border p-8 shadow-xs text-center space-y-6">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto text-emerald-600 border border-border">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {hasDemoData ? 'Demo Onboarding Ready' : 'Congratulations!'}
            </h1>
            <h2 className="text-sm font-semibold text-emerald-600">
              {hasDemoData ? 'Sample workflow data is available' : 'Onboarding Completed &amp; Verified'}
            </h2>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed pt-1">
              {hasDemoData
                ? 'This local demo profile is marked complete to skip repetitive setup. Its agreement flags and signature text are synthetic test data, not real consent or verification.'
                : 'Your employee profile, compliance agreements, and signature verification have been successfully recorded and processed.'}
            </p>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              onClick={() => {
                const roleKey = currentUser?.roleDefinition?.key || currentUser?.role;
                const permissions = currentUser?.permissions || [];
                const target = getFirstAccessibleRoute(roleKey, permissions);
                window.location.href = target;
              }}
              className="w-full text-xs font-semibold gap-2"
            >
              Go to Permitted Application Workspace
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // WIZARD STEPS 1 TO 4 - EXPANDED FULL-WIDTH SECTIONAL UI
  return (
    <div className="min-h-screen bg-muted/20 p-6 md:p-8 space-y-6">
      <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Employee Onboarding Portal
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Welcome to Synergy ERP! Please complete the 4 verification phases. This onboarding portal will lock upon submission.
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 self-start sm:self-auto">
            Phase {step} of 4
          </span>
        </div>

        {/* Stepper Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {[
            { num: 1, label: '1. Personal Details', icon: User },
            { num: 2, label: '2. Upload Documents', icon: FileText },
            { num: 3, label: '3. Work Experience', icon: Briefcase },
            { num: 4, label: '4. Agreements & NDA', icon: ShieldCheck }
          ].map((s) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isPast = step > s.num;
            return (
              <div
                key={s.num}
                className={`p-3 rounded-xl border flex items-center gap-3 transition ${
                  isActive
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : isPast
                    ? 'border-border bg-card text-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground'
                }`}
              >
                <div className={`p-2 rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : isPast ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium truncate">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {hasDemoData && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          <strong>Local demo data is prefilled.</strong> Replace the sample contact, address, experience, and document entries before submitting. Sample document rows are placeholders, not uploaded files. Agreements remain unchecked and require the worker’s own confirmation.
        </div>
      )}

      {/* PHASE 1: PERSONAL DETAILS FORM (EXPANDED) */}
      {step === 1 && (
        <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 text-primary border-b border-border pb-3">
            <User className="w-5 h-5" />
            <h2 className="text-sm font-semibold text-foreground">1. Personal & Contact Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
            <div>
              <label className="font-semibold text-foreground block mb-1.5">First Name *</label>
              <input
                type="text"
                required
                value={personalDetails.firstName}
                onChange={(e) => setPersonalDetails({ ...personalDetails, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Last Name *</label>
              <input
                type="text"
                required
                value={personalDetails.lastName}
                onChange={(e) => setPersonalDetails({ ...personalDetails, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Phone Number *</label>
              <input
                type="tel"
                required
                value={personalDetails.phone}
                onChange={(e) => setPersonalDetails({ ...personalDetails, phone: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Gender *</label>
              <select
                value={personalDetails.gender}
                onChange={(e) => setPersonalDetails({ ...personalDetails, gender: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-Binary">Non-Binary</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Date of Birth</label>
              <input
                type="date"
                value={personalDetails.dateOfBirth}
                onChange={(e) => setPersonalDetails({ ...personalDetails, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Marital Status</label>
              <select
                value={personalDetails.maritalStatus}
                onChange={(e) => setPersonalDetails({ ...personalDetails, maritalStatus: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Blood Group</label>
              <select
                value={personalDetails.bloodGroup}
                onChange={(e) => setPersonalDetails({ ...personalDetails, bloodGroup: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Country</label>
              <input
                type="text"
                value={personalDetails.country}
                onChange={(e) => setPersonalDetails({ ...personalDetails, country: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Address Information */}
          <div className="pt-4 border-t border-border space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Residential Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div className="md:col-span-2">
                <label className="font-semibold text-foreground block mb-1.5">Address Line 1 *</label>
                <input
                  type="text"
                  value={personalDetails.addressLine1}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, addressLine1: e.target.value })}
                  placeholder="Street / House Number / Society"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1.5">City</label>
                <input
                  type="text"
                  value={personalDetails.city}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, city: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1.5">State</label>
                <input
                  type="text"
                  value={personalDetails.state}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, state: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1.5">Postal / PIN Code</label>
                <input
                  type="text"
                  value={personalDetails.postalCode}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, postalCode: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Banking & Identity Details */}
          <div className="pt-4 border-t border-border space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Banking & Tax Statutory Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1.5">Bank Name</label>
                <input
                  type="text"
                  value={personalDetails.bankName}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, bankName: e.target.value })}
                  placeholder="e.g. HDFC Bank"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1.5">Account Number</label>
                <input
                  type="text"
                  value={personalDetails.bankAccountNumber}
                  onChange={(e) => {
                    setPersonalDetails({ ...personalDetails, bankAccountNumber: e.target.value });
                    if (validationErrors.bankAccountNumber) setValidationErrors({ ...validationErrors, bankAccountNumber: undefined });
                  }}
                  placeholder="9 to 18 digits"
                  className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground text-xs outline-none font-mono ${
                    validationErrors.bankAccountNumber ? 'border-destructive focus:ring-1 focus:ring-destructive' : 'border-input focus:ring-1 focus:ring-primary'
                  }`}
                />
                {validationErrors.bankAccountNumber && (
                  <p className="text-[11px] text-destructive mt-1">{validationErrors.bankAccountNumber}</p>
                )}
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1.5">IFSC Code</label>
                <input
                  type="text"
                  value={personalDetails.bankIfscCode}
                  onChange={(e) => {
                    setPersonalDetails({ ...personalDetails, bankIfscCode: e.target.value.toUpperCase() });
                    if (validationErrors.bankIfscCode) setValidationErrors({ ...validationErrors, bankIfscCode: undefined });
                  }}
                  placeholder="e.g. HDFC0001234"
                  className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground text-xs outline-none font-mono uppercase ${
                    validationErrors.bankIfscCode ? 'border-destructive focus:ring-1 focus:ring-destructive' : 'border-input focus:ring-1 focus:ring-primary'
                  }`}
                />
                {validationErrors.bankIfscCode && (
                  <p className="text-[11px] text-destructive mt-1">{validationErrors.bankIfscCode}</p>
                )}
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1.5">PAN Card Number</label>
                <input
                  type="text"
                  value={personalDetails.panNumber}
                  onChange={(e) => {
                    setPersonalDetails({ ...personalDetails, panNumber: e.target.value.toUpperCase() });
                    if (validationErrors.panNumber) setValidationErrors({ ...validationErrors, panNumber: undefined });
                  }}
                  placeholder="e.g. ABCDE1234F"
                  className={`w-full px-3 py-2 border rounded-lg bg-background text-foreground text-xs outline-none font-mono uppercase ${
                    validationErrors.panNumber ? 'border-destructive focus:ring-1 focus:ring-destructive' : 'border-input focus:ring-1 focus:ring-primary'
                  }`}
                />
                {validationErrors.panNumber && (
                  <p className="text-[11px] text-destructive mt-1">{validationErrors.panNumber}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button
              type="button"
              onClick={() => {
                if (validatePhase1()) {
                  setStep(2);
                }
              }}
              size="sm"
              className="gap-2"
            >
              Proceed to Phase 2: Upload Documents
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* PHASE 2: DOCUMENTS UPLOAD SCREEN */}
      {step === 2 && (
        <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 text-primary border-b border-border pb-3">
            <FileText className="w-5 h-5" />
            <h2 className="text-sm font-semibold text-foreground">2. Upload Identity & Verification Documents</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload verification documents including Aadhaar, PAN card, Educational certificates, and resumes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc, idx) => (
              <div key={idx} className="p-4 bg-muted/30 rounded-xl border border-border flex items-center justify-between hover:border-primary/40 transition">
                <div className="min-w-0 pr-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs text-foreground truncate">{doc.title}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {doc.category.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate max-w-xs sm:max-w-md mt-1 flex items-center gap-2">
                    <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{doc.fileName || (doc.fileUrl.startsWith('data:') ? 'Local file attached' : doc.fileUrl)}</span>
                    {doc.fileSize && (
                      <span className="text-[10px] text-muted-foreground/75 font-mono">
                        ({(doc.fileSize / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDoc(idx)}
                  className="text-muted-foreground hover:text-destructive p-2 rounded-lg hover:bg-destructive/10 transition"
                  title="Remove document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Document Box */}
          <div className="p-5 bg-muted/20 rounded-xl border border-dashed border-border space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                Upload New Document from Device
              </h4>
              <span className="text-[11px] text-muted-foreground">PDF, PNG, JPG, or DOC up to 15MB</span>
            </div>

            {docUploadError && (
              <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{docUploadError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Document Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Degree Certificate, Passport"
                  value={newDoc.title}
                  onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Category *</label>
                <select
                  value={newDoc.category}
                  onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ID_PROOF">ID Proof</option>
                  <option value="CERTIFICATE">Certificate</option>
                  <option value="RESUME">Resume / CV</option>
                  <option value="OFFER_LETTER">Offer Letter</option>
                  <option value="TAX_DOC">Tax Document</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Select File from Device *</label>
                <label className="flex items-center justify-center gap-2 px-3 py-2 border border-input border-dashed rounded-lg bg-background hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition text-xs font-medium h-[38px]">
                  <Upload className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="truncate max-w-[190px]">
                    {newDoc.fileName ? newDoc.fileName : 'Choose file...'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={handleDeviceFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {newDoc.fileUrl && (
              <div className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg border border-primary/20 text-[11px]">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-foreground font-medium truncate">Selected: {newDoc.fileName}</span>
                  {newDoc.fileSize && (
                    <span className="text-muted-foreground font-mono">({(newDoc.fileSize / 1024).toFixed(1)} KB)</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setNewDoc((prev) => ({ ...prev, fileUrl: '', fileName: '', fileSize: undefined, mimeType: undefined }))}
                  className="text-xs text-muted-foreground hover:text-destructive ml-2 flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddDocument()}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Document to List
            </Button>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(1)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setStep(3)}
              className="gap-2"
            >
              Proceed to Phase 3: Work Experience
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* PHASE 3: WORK EXPERIENCE SCREEN */}
      {step === 3 && (
        <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 text-primary border-b border-border pb-3">
            <Briefcase className="w-5 h-5" />
            <h2 className="text-sm font-semibold text-foreground">3. Prior Industrial Work Experience</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Record previous positions held, manufacturing exposure, and key responsibilities (freshers can proceed without entries).
          </p>

          {workExperiences.length > 0 && (
            <div className="space-y-3">
              {workExperiences.map((exp, idx) => (
                <div key={idx} className="p-4 bg-muted/30 rounded-xl border border-border flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-foreground">{exp.jobTitle}</span>
                    <span className="text-muted-foreground text-xs"> at {exp.companyName}</span>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {exp.startDate} - {exp.isCurrent ? 'Present' : exp.endDate || 'N/A'} {exp.location ? `• ${exp.location}` : ''}
                    </div>
                  </div>
                  <button onClick={() => handleRemoveExp(idx)} className="text-muted-foreground hover:text-destructive p-2">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Experience */}
          <div className="p-5 bg-muted/20 rounded-xl border border-border space-y-4 text-xs">
            <h4 className="font-semibold text-foreground">Add Experience Record</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="font-medium text-foreground block mb-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Tata Motors"
                  value={newExp.companyName}
                  onChange={(e) => setNewExp({ ...newExp, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-medium text-foreground block mb-1">Designation / Role</label>
                <input
                  type="text"
                  placeholder="e.g. Production Executive"
                  value={newExp.jobTitle}
                  onChange={(e) => setNewExp({ ...newExp, jobTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-medium text-foreground block mb-1">Starting Date</label>
                <input
                  type="date"
                  value={newExp.startDate}
                  onChange={(e) => setNewExp({ ...newExp, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="font-medium text-foreground block mb-1">Ending Date</label>
                <input
                  type="date"
                  value={newExp.endDate}
                  onChange={(e) => setNewExp({ ...newExp, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <label className="font-medium text-foreground block mb-1">Key Responsibilities</label>
                <input
                  type="text"
                  placeholder="Summarize key duties and accomplishments..."
                  value={newExp.responsibilities}
                  onChange={(e) => setNewExp({ ...newExp, responsibilities: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddExp}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Experience Record
            </Button>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(2)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setStep(4)}
              className="gap-2"
            >
              Proceed to Phase 4: Agreements & Signature
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* PHASE 4: ACKNOWLEDGEMENTS & POLICY AGREEMENTS */}
      {step === 4 && (
        <div className="bg-card rounded-xl border border-border p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 text-primary border-b border-border pb-3">
            <ShieldCheck className="w-5 h-5" />
            <h2 className="text-sm font-semibold text-foreground">4. Acknowledgements & Compliance Agreements</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Review organizational policies, confirm non-disclosure terms, and submit your electronic legal signature.
          </p>

          <div className="space-y-4 text-xs bg-muted/20 p-6 rounded-xl border border-border">
            <label className="flex items-start gap-3.5 cursor-pointer">
              <Checkbox

                checked={agreements.agreedToTerms}
                onChange={(e) => setAgreements({ ...agreements, agreedToTerms: e.target.checked })}
                className="mt-1 rounded text-primary w-4 h-4"
              />
              <div>
                <span className="font-semibold text-foreground text-sm">Terms of Employment & Working Standards</span>
                <p className="text-muted-foreground text-xs mt-0.5">I agree to abide by the workplace standards, assigned duties, and plant rules of Synergy International.</p>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-2 border-t border-border">
              <Checkbox

                checked={agreements.agreedToConductCode}
                onChange={(e) => setAgreements({ ...agreements, agreedToConductCode: e.target.checked })}
                className="mt-1 rounded text-primary w-4 h-4"
              />
              <div>
                <span className="font-semibold text-foreground text-sm">Safety & Shop Floor Equipment Compliance</span>
                <p className="text-muted-foreground text-xs mt-0.5">I commit to following occupational health protocols, personal protective equipment (PPE) requirements, and equipment guidelines.</p>
              </div>
            </label>

            <label className="flex items-start gap-3.5 cursor-pointer pt-2 border-t border-border">
              <Checkbox

                checked={agreements.agreedToNda}
                onChange={(e) => setAgreements({ ...agreements, agreedToNda: e.target.checked })}
                className="mt-1 rounded text-primary w-4 h-4"
              />
              <div>
                <span className="font-semibold text-foreground text-sm">Non-Disclosure Agreement (NDA) & Intellectual Property</span>
                <p className="text-muted-foreground text-xs mt-0.5">I agree to hold proprietary formulations, operational designs, supplier lists, and company information in strict confidence.</p>
              </div>
            </label>
          </div>

          <div className="space-y-2 text-xs">
            <label className="font-semibold text-foreground block text-sm">
              Upload Signature *
            </label>
            <div className="p-6 border border-dashed border-border rounded-xl bg-muted/20 flex flex-col items-center justify-center text-center space-y-3 relative">
              {agreements.signatureImage ? (
                <div className="space-y-3 flex flex-col items-center">
                  <img
                    src={agreements.signatureImage}
                    alt="Uploaded Signature"
                    className="max-h-28 max-w-full object-contain rounded-xl border border-border bg-card p-3 shadow-xs"
                  />
                  <div className="flex items-center gap-2 text-primary font-medium text-xs">
                    <Check className="w-4 h-4" />
                    Signature Image Attached Successfully
                  </div>
                  <label className="cursor-pointer px-3.5 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-foreground font-medium text-xs transition border border-border">
                    Replace Signature Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSignatureUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2 w-full py-4">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-foreground text-sm">
                    Click to Upload Signature Image
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Sign on white paper, photograph/scan, and upload (PNG, JPG, JPEG)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    required
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
          <div className="flex justify-between pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep(3)}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={handleSubmitOnboarding}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Submitting & Locking Profile...' : 'Complete & Submit Onboarding'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
