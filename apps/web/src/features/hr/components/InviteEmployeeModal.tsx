'use client';

import React, { useState } from 'react';
import { hrApi } from '../api';
import { Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { Dialog, Button } from '@synergy/ui';
import { getEmployeeOnboardingLink } from '@/lib/env';

interface InviteEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteEmployeeModal({ isOpen, onClose, onSuccess }: InviteEmployeeModalProps) {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'Employee',
    designation: '',
    gender: 'Male',
    ranking: 1,
    hierarchyLevel: 4,
    baseSalary: 35000,
    tempPassword: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    tempPassword: string;
    onboardingToken: string;
    inviteLink: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await hrApi.inviteEmployee(formData);
      setResult({
        email: res.user.email,
        tempPassword: res.tempPassword,
        onboardingToken: res.onboardingToken,
        inviteLink: getEmployeeOnboardingLink(res.user.email, res.inviteLink)
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create employee credentials');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={result ? "Credentials & Invite Generated" : "Add New Employee & Create Credentials"}
      description={result ? "New employee account is created and ready for onboarding." : "Fill in basic hiring details. The system creates login credentials and generates the one-time employee onboarding link."}
      className="max-w-xl"
    >

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-foreground">Credentials & Invite Generated</h3>
                <p className="text-xs text-muted-foreground">
                  New employee account is created and ready for onboarding.
                </p>
              </div>
            </div>

            <div className="bg-muted/40 p-4 rounded-xl border border-border space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Employee Email / Login</span>
                <p className="text-sm font-semibold text-foreground mt-0.5">{result.email}</p>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Temporary Password</span>
                <div className="flex items-center justify-between mt-1 bg-background px-3 py-2 rounded-lg border border-border">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {result.tempPassword}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.tempPassword)}
                    className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Onboarding Link</span>
                <div className="flex items-center justify-between mt-1 bg-background px-3 py-2 rounded-lg border border-border">
                  <span className="font-mono text-xs truncate max-w-[340px] text-muted-foreground">
                    {result.inviteLink}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.inviteLink)}
                    className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {copied && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold text-center">Copied to clipboard!</p>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={onClose}
                variant="primary"
                size="md"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="e.g. Rahul"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="e.g. Sharma"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Work Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="rahul.sharma@synergy.local"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Designation</label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g. Senior QC Lead"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Base Salary (₹)</label>
                <input
                  type="number"
                  value={formData.baseSalary}
                  onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Hierarchy Level</label>
                <select
                  value={formData.hierarchyLevel}
                  onChange={(e) => setFormData({ ...formData, hierarchyLevel: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  <option value={1}>Level 1 - Executive / Director</option>
                  <option value={2}>Level 2 - Department Head / Manager</option>
                  <option value={3}>Level 3 - Lead / Supervisor</option>
                  <option value={4}>Level 4 - Staff / Senior Specialist</option>
                  <option value={5}>Level 5 - Associate / Line Operator</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Employee Ranking</label>
                <select
                  value={formData.ranking}
                  onChange={(e) => setFormData({ ...formData, ranking: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => (
                    <option key={r} value={r}>Rank {r} {r >= 8 ? '(High Priority)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Custom Temp Password (Optional)
              </label>
              <input
                type="text"
                value={formData.tempPassword}
                onChange={(e) => setFormData({ ...formData, tempPassword: e.target.value })}
                placeholder="Leave blank to auto-generate secure password"
                className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
              >
                Create & Generate Link
              </Button>
            </div>
          </form>
        )}
    </Dialog>
  );
}
