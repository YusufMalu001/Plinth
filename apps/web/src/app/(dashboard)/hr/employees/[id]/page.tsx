'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEmployeeDetails } from '@/features/hr/hooks';
import { hrApi } from '@/features/hr/api';
import {
  User,
  CheckSquare,
  Calendar,
  CreditCard,
  FileText,
  ArrowLeft,
  Mail,
  Phone,
  AlertCircle,
  Plus,
  Download,
  Trash2,
  Award,
  Building2,
  Clock,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Lock,
  Shield,
  CheckCircle2,
  UserCheck,
  Upload
} from 'lucide-react';
import { Button, Dialog, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@plinth/ui';
import { EmployeeActivityHeatmap } from '@/features/hr/components/EmployeeActivityHeatmap';
import { getAppBaseUrl, getEmployeeOnboardingLink } from '@/lib/env';
export default function EmployeeProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const { employee, loading, error, refetch } = useEmployeeDetails(id);

  const [activeTab, setActiveTab] = useState<'details' | 'credentials' | 'accessibility' | 'tasks' | 'attendance' | 'payslips' | 'documents'>('details');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; name: string; description?: string; permissions?: Array<{ id: string; key?: string; name: string; action: string; resource: string }> }>>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState<string>('');
  const [isSavingAccessRole, setIsSavingAccessRole] = useState(false);
  const [accessSuccessMessage, setAccessSuccessMessage] = useState<string | null>(null);
  // Task Creation Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    dueDate: '',
    department: ''
  });

  // Attendance Mark Modal State
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState({
    date: new Date().toISOString().split('T')[0],
    status: 'PRESENT',
    checkIn: '09:00',
    checkOut: '18:00',
    workHours: 8.5,
    notes: ''
  });

  // Pay Slip Generation Modal State
  const [isPaySlipModalOpen, setIsPaySlipModalOpen] = useState(false);
  const [paySlipForm, setPaySlipForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    basicSalary: 0,
    hra: 0,
    allowances: 0,
    bonus: 0,
    pfDeduction: 0,
    taxDeduction: 0,
    otherDeduction: 0,
    notes: ''
  });

  // Document Upload Modal State
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docForm, setDocForm] = useState<{
    title: string;
    category: string;
    fileUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  }>({
    title: '',
    category: 'ID_PROOF',
    fileUrl: '',
    fileName: '',
    fileSize: undefined,
    mimeType: undefined
  });
  const [docUploadError, setDocUploadError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen p-12 flex flex-col items-center justify-center text-muted-foreground">
        <div className="animate-spin w-8 h-8 border-accent border-primary border-t-transparent rounded-full mb-3" />
        <p className="text-sm font-medium">Loading employee profile...</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="min-h-screen p-8 text-center">
        <div className="max-w-md mx-auto bg-card p-8 rounded-xl border border-border shadow-xs">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground">Failed to Load Profile</h2>
          <p className="text-sm text-muted-foreground mt-1">{error || 'Employee record not found'}</p>
          <Link
            href="/hr"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await hrApi.createTask({
        employeeId: id,
        title: taskForm.title,
        description: taskForm.description,
        priority: taskForm.priority as any,
        dueDate: taskForm.dueDate || undefined,
        department: taskForm.department || employee.department?.name || undefined
      });
      setIsTaskModalOpen(false);
      setTaskForm({ title: '', description: '', priority: 'MEDIUM', dueDate: '', department: '' });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      await hrApi.updateTask(taskId, { status: status as any });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const handleMarkAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await hrApi.markAttendance({
        employeeId: id,
        date: attendanceForm.date,
        status: attendanceForm.status,
        workHours: Number(attendanceForm.workHours),
        notes: attendanceForm.notes
      });
      setIsAttendanceModalOpen(false);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark attendance');
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsResettingPassword(true);
    setResetSuccessMessage(null);
    try {
      const res = await hrApi.resetEmployeePassword(id, customPassword || undefined);
      setShowResetModal(false);
      setCustomPassword('');
      setResetSuccessMessage(`New credentials generated! Temporary password: ${res.tempPassword}`);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset employee password');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const loadRoles = async () => {
    setLoadingRoles(true);
    try {
      const roles = await hrApi.getRoles();
      setAvailableRoles(roles);
    } catch {
      // Fallback
    } finally {
      setLoadingRoles(false);
    }
  };

  const handleAssignAccessRole = async (roleId: string | null) => {
    const userAccount = employee?.userAccounts?.[0];
    if (!userAccount?.id) {
      alert('No user account found for this employee to assign access.');
      return;
    }
    setIsSavingAccessRole(true);
    setAccessSuccessMessage(null);
    try {
      await hrApi.updateUserRole(userAccount.id, roleId);
      setAccessSuccessMessage('Access role and module capabilities updated successfully.');
      setTimeout(() => setAccessSuccessMessage(null), 3000);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update access role');
    } finally {
      setIsSavingAccessRole(false);
    }
  };
  const handleGeneratePaySlip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await hrApi.generatePaySlip({
        employeeId: id,
        month: Number(paySlipForm.month),
        year: Number(paySlipForm.year),
        basicSalary: Number(paySlipForm.basicSalary || employee.baseSalary || 0),
        hra: Number(paySlipForm.hra),
        allowances: Number(paySlipForm.allowances),
        bonus: Number(paySlipForm.bonus),
        pfDeduction: Number(paySlipForm.pfDeduction),
        taxDeduction: Number(paySlipForm.taxDeduction),
        otherDeduction: Number(paySlipForm.otherDeduction),
        notes: paySlipForm.notes
      });
      setIsPaySlipModalOpen(false);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate pay slip');
    }
  };

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
        setDocForm((prev) => ({
          ...prev,
          fileUrl: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
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

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocUploadError(null);
    if (!docForm.fileUrl) {
      setDocUploadError('Please select a document file from your device.');
      return;
    }
    if (!docForm.title.trim()) {
      setDocUploadError('Please provide a document title.');
      return;
    }
    try {
      await hrApi.uploadDocument({
        employeeId: id,
        title: docForm.title.trim(),
        category: docForm.category,
        fileUrl: docForm.fileUrl,
        fileSize: docForm.fileSize,
        mimeType: docForm.mimeType
      });
      setIsDocModalOpen(false);
      setDocForm({ title: '', category: 'ID_PROOF', fileUrl: '', fileName: '', fileSize: undefined, mimeType: undefined });
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload document');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await hrApi.deleteDocument(docId);
      refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  return (
    <div className="min-h-screen bg-muted/20 p-6 space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link href="/hr/directory">
          <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back to Employee Directory
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-muted-foreground font-mono border border-border">
            {employee.employeeCode}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${
            employee.onboardingCompleted
              ? 'bg-muted text-foreground border-border'
              : 'bg-muted text-tone-amber-text border-border'
          }`}>
            {employee.onboardingCompleted ? 'Onboarded' : 'Onboarding Pending'}
          </span>
        </div>
      </div>

      {/* Profile Header Hero */}
      <div className="bg-card rounded-xl border border-border shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary font-bold text-xl flex items-center justify-center border border-primary/20">
              {employee.firstName?.[0]}{employee.lastName?.[0]}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">
                  {employee.firstName} {employee.lastName}
                </h1>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border font-medium">
                  <Award className="w-3.5 h-3.5 text-primary" />
                  Rank {employee.ranking || 1}
                </span>
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                {employee.designation || employee.role} • {employee.department?.name || 'General Operations'}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 opacity-70" />
                  {employee.email}
                </span>
                {employee.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 opacity-70" />
                    {employee.phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 opacity-70" />
                  Hierarchy Level {employee.hierarchyLevel || 4}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-row md:flex-col items-end justify-between md:justify-center border-t md:border-t-0 pt-4 md:pt-0 border-border">
            <div className="text-right">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Base Salary</span>
              <div className="text-lg font-bold text-foreground">
                ₹{Number(employee.baseSalary || 0).toLocaleString('en-IN')}
                <span className="text-xs text-muted-foreground font-normal"> / mo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Conditional Onboarding Progress Banner for HR */}
        {!employee.onboardingCompleted && (
          <div className="mt-6 p-4 bg-muted/40 rounded-xl border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-foreground">
                <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                  <Clock className="w-5 h-5 text-tone-amber-text" />
                </div>
                <div>
                  <h3 className="text-xs font-bold">Onboarding Verification Incomplete</h3>
                  <p className="text-[11px] text-muted-foreground">
                    This employee has not completed their mandatory 4-phase onboarding wizard yet.
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const link = getEmployeeOnboardingLink(employee.email);
                  navigator.clipboard.writeText(link);
                  alert('Login link copied to clipboard!');
                }}
                className="text-xs"
              >
                Copy Invite Link
              </Button>
            </div>

            {/* 4-Phase Progress Indicators */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
              {[
                {
                  title: '1. Personal Details',
                  done: Boolean(employee.onboardingDetails?.personalDetailsComplete || (employee.phone && employee.addressLine1))
                },
                {
                  title: '2. Document Uploads',
                  done: Boolean(employee.onboardingDetails?.documentsUploadComplete || (employee.documents && employee.documents.length > 0))
                },
                {
                  title: '3. Work Experience',
                  done: Boolean(employee.onboardingDetails?.experienceComplete || (employee.workExperiences && employee.workExperiences.length > 0))
                },
                {
                  title: '4. Agreements & NDA',
                  done: Boolean(employee.onboardingDetails?.agreementsComplete || employee.onboardingCompleted)
                }
              ].map((phase, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-border bg-card flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-foreground">{phase.title}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    phase.done
                      ? 'bg-muted text-foreground border-border'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {phase.done ? 'Completed' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-border-strong border-border mt-6 pt-2 overflow-x-auto">
          {[
            { id: 'details', label: 'Employee Details', icon: User },
            { id: 'credentials', label: 'Credentials', icon: Key },
            { id: 'accessibility', label: 'Accessibility', icon: Shield },
            { id: 'tasks', label: `Assigned Tasks (${employee.tasks?.length || 0})`, icon: CheckSquare },
            { id: 'attendance', label: `Attendance (${employee.attendances?.length || 0})`, icon: Calendar },
            { id: 'payslips', label: `Pay Slips (${employee.paySlips?.length || 0})`, icon: CreditCard },
            { id: 'documents', label: `Documents (${employee.documents?.length || 0})`, icon: FileText }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(tab.id as any)}
                className="gap-1.5 text-xs h-8 whitespace-nowrap rounded-b-none border-border-strong-2"
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Activity Heatmap */}
      <EmployeeActivityHeatmap
        attendances={employee.attendances ?? []}
        tasks={employee.tasks ?? []}
      />

      {/* TAB 1: EMPLOYEE DETAILS */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Personal Information */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Personal & Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground font-medium">Full Name</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {employee.firstName} {employee.lastName}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Gender</span>
                <p className="font-semibold text-foreground mt-0.5">{employee.gender || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Date of Birth</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Marital Status</span>
                <p className="font-semibold text-foreground mt-0.5">{employee.maritalStatus || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Blood Group</span>
                <p className="font-semibold text-foreground mt-0.5">{employee.bloodGroup || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Hire Date</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-border text-xs">
              <span className="text-muted-foreground font-medium">Residential Address</span>
              <p className="font-medium text-foreground mt-0.5">
                {[employee.addressLine1, employee.addressLine2, employee.city, employee.state, employee.postalCode, employee.country]
                  .filter(Boolean)
                  .join(', ') || 'No address provided'}
              </p>
            </div>

            <div className="pt-3 border-t border-border text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-muted-foreground font-medium">Emergency Contact</span>
                <p className="font-semibold text-foreground mt-0.5">
                  {employee.emergencyContactName || '—'} {employee.emergencyContactRelation ? `(${employee.emergencyContactRelation})` : ''}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Emergency Phone</span>
                <p className="font-semibold text-foreground mt-0.5">{employee.emergencyContactPhone || '—'}</p>
              </div>
            </div>
          </div>

          {/* Financial & Tax Details */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Banking & Statutory Details
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground font-medium">Bank Name</span>
                <p className="font-semibold text-foreground mt-0.5">{employee.bankName || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Account Number</span>
                <p className="font-semibold font-mono text-foreground mt-0.5">{employee.bankAccountNumber || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">IFSC Code</span>
                <p className="font-semibold font-mono text-foreground mt-0.5">{employee.bankIfscCode || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">PAN Card Number</span>
                <p className="font-semibold font-mono text-foreground mt-0.5">{employee.panNumber || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">Aadhaar Number</span>
                <p className="font-semibold font-mono text-foreground mt-0.5">{employee.aadhaarNumber || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">PF Number</span>
                <p className="font-semibold font-mono text-foreground mt-0.5">{employee.pfNumber || '—'}</p>
              </div>
            </div>

            {/* Work Experiences */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Work Experiences</h4>
              {employee.workExperiences && employee.workExperiences.length > 0 ? (
                <div className="space-y-2">
                  {employee.workExperiences.map((exp: any) => (
                    <div key={exp.id} className="p-3 bg-muted/30 border border-border rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{exp.jobTitle}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {new Date(exp.startDate).getFullYear()} - {exp.isCurrent ? 'Present' : exp.endDate ? new Date(exp.endDate).getFullYear() : 'N/A'}
                        </span>
                      </div>
                      <p className="text-muted-foreground font-medium">{exp.companyName} {exp.location ? `• ${exp.location}` : ''}</p>
                      {exp.responsibilities && <p className="text-muted-foreground text-[11px]">{exp.responsibilities}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No previous experience recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASSIGNED TASKS QUEUE */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Assigned Employee Tasks</h3>
            <Button
              size="sm"
              onClick={() => setIsTaskModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" />
              Assign New Task
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            {employee.tasks && employee.tasks.length > 0 ? (
              <div className="divide-y divide-border">
                {employee.tasks.map((task: any) => (
                  <div key={task.id} className="p-4 hover:bg-muted/40 transition flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
                          {task.priority}
                        </span>
                        <h4 className="font-semibold text-xs text-foreground">{task.title}</h4>
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                        <span>Created: {new Date(task.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={task.status}
                        onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="ON_HOLD">On Hold</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-medium">No tasks assigned to this employee yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Attendance Logs &amp; Leaves</h3>
            <Button
              size="sm"
              onClick={() => setIsAttendanceModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" />
              Mark Attendance
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            {employee.attendances && employee.attendances.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Work Hours</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employee.attendances.map((att: any) => {
                    return (
                      <TableRow key={att.id}>
                        <TableCell className="font-medium text-xs">
                          {new Date(att.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border">
                            {att.status.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{att.workHours ? `${att.workHours} hrs` : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{att.notes || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-medium">No attendance logs available.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PAY SLIPS */}
      {activeTab === 'payslips' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Pay Slips &amp; Salary Slips</h3>
            <Button
              size="sm"
              onClick={() => {
                setPaySlipForm({
                  ...paySlipForm,
                  basicSalary: Number(employee.baseSalary || 0)
                });
                setIsPaySlipModalOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" />
              Generate Monthly Pay Slip
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            {employee.paySlips && employee.paySlips.length > 0 ? (
              <div className="divide-y divide-border">
                {employee.paySlips.map((slip: any) => (
                  <div key={slip.id} className="p-4 hover:bg-muted/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-xs text-foreground">
                          Pay Slip: {new Date(slip.year, slip.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h4>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-foreground border border-border">
                          {slip.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Basic: ₹{Number(slip.basicSalary).toLocaleString()} • HRA: ₹{Number(slip.hra).toLocaleString()} • Allowances: ₹{Number(slip.allowances).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Total Deductions (PF/Tax): ₹{(Number(slip.pfDeduction) + Number(slip.taxDeduction) + Number(slip.otherDeduction)).toLocaleString()}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Net Disbursed Pay</span>
                      <div className="text-base font-bold text-primary">
                        ₹{Number(slip.netPay).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-medium">No pay slips generated for this employee yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Employee Documents &amp; Verification</h3>
            <Button
              size="sm"
              onClick={() => setIsDocModalOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" />
              Upload Document
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employee.documents && employee.documents.length > 0 ? (
              employee.documents.map((doc: any) => (
                <div key={doc.id} className="bg-card p-4 rounded-xl border border-border shadow-xs flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      <FileText className="w-4 h-4" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs text-foreground truncate">{doc.title}</h4>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{doc.category}</span>
                    <p className="text-[11px] text-muted-foreground mt-1">Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full"
                  >
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 h-8">
                      <Download className="w-3.5 h-3.5" />
                      View / Download
                    </Button>
                  </a>
                </div>
              ))
            ) : (
              <div className="col-span-full bg-card p-12 text-center text-muted-foreground rounded-xl border border-border">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-medium">No documents uploaded yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: CREDENTIALS */}
      {activeTab === 'credentials' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-border-strong border-border pb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  Employee Authentication Credentials
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  View and manage login credentials for this employee. Send these details if the employee forgets their default password.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowResetModal(true)}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Generate New Password
              </Button>
            </div>

            {resetSuccessMessage && (
              <div className="p-3.5 rounded-lg bg-muted border border-border flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-tone-green-text shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Credentials Updated Successfully</p>
                  <p className="text-muted-foreground mt-0.5 font-mono">{resetSuccessMessage}</p>
                </div>
              </div>
            )}

            {/* Account Information Summary */}
            {(() => {
              const userAccount = employee.userAccounts && employee.userAccounts.length > 0 ? employee.userAccounts[0] : null;
              const displayEmail = userAccount?.email || employee.email;
              const displayUsername = employee.employeeCode || userAccount?.email?.split('@')[0] || '—';
              const displayPassword = userAccount?.initialPassword || 'Plinth@2026!';

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Username / Employee ID */}
                  <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-primary" />
                        Username / Employee ID
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(displayUsername, 'username')}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                        title="Copy Username"
                      >
                        {copiedField === 'username' ? (
                          <Check className="w-3.5 h-3.5 text-tone-green-text" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                    <p className="font-mono text-xs font-bold text-foreground">
                      {displayUsername}
                    </p>
                    <span className="text-[10px] text-muted-foreground block">
                      Primary organizational identity code
                    </span>
                  </div>

                  {/* Card 2: User Email */}
                  <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-primary" />
                        User Email (Login ID)
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(displayEmail, 'email')}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                        title="Copy Email"
                      >
                        {copiedField === 'email' ? (
                          <Check className="w-3.5 h-3.5 text-tone-green-text" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                    <p className="font-mono text-xs font-bold text-foreground truncate">
                      {displayEmail}
                    </p>
                    <span className="text-[10px] text-muted-foreground block">
                      Used on standard Plinth login portal
                    </span>
                  </div>

                  {/* Card 3: Default / Generated Password */}
                  <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-primary" />
                        {userAccount?.onboardingCompleted || !userAccount?.mustChangePassword
                          ? 'Password (Active / Configured)'
                          : 'Password (Default / Initial)'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                          title={showPassword ? 'Hide Password' : 'Show Password'}
                        >
                          {showPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(displayPassword, 'password')}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                          title="Copy Password"
                        >
                          {copiedField === 'password' ? (
                            <Check className="w-3.5 h-3.5 text-tone-green-text" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="font-mono text-xs font-bold text-foreground">
                      {showPassword ? displayPassword : '••••••••••••'}
                    </p>
                    <span className="text-[10px] text-muted-foreground block">
                      {userAccount?.onboardingCompleted || !userAccount?.mustChangePassword
                        ? 'Updated user credential'
                        : userAccount?.initialPassword
                        ? 'Generated onboarding credential'
                        : 'Default initial credential'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Quick Share Dispatch Box */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" />
                  Ready-to-Send Credential Message
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const userAccount = employee.userAccounts && employee.userAccounts.length > 0 ? employee.userAccounts[0] : null;
                    const displayEmail = userAccount?.email || employee.email;
                    const displayUsername = employee.employeeCode || userAccount?.email?.split('@')[0] || '—';
                    const displayPassword = userAccount?.initialPassword || 'Plinth@2026!';
                    const loginUrl = `${getAppBaseUrl()}/login`;
                    const text = `Hello ${employee.firstName},\n\nHere are your Plinth login credentials:\n- Login URL: ${loginUrl}\n- Username: ${displayUsername}\n- Work Email: ${displayEmail}\n- Temporary Password: ${displayPassword}\n\nPlease sign in and complete your onboarding verification.`;
                    copyToClipboard(text, 'message');
                  }}
                  className="h-7 text-xs font-medium gap-1 px-2.5"
                >
                  {copiedField === 'message' ? (
                    <>
                      <Check className="w-3 h-3 text-tone-green-text" />
                      <span>Copied Message</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Full Message</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-background rounded-lg border border-border p-3 text-xs text-foreground font-mono space-y-1 select-all">
                <p>Hello {employee.firstName},</p>
                <p className="pt-0.5">Here are your Plinth login credentials:</p>
                <p>• Login URL: <span className="text-primary underline">{getAppBaseUrl()}/login</span></p>
                <p>• Username: <span className="font-bold">{employee.employeeCode || employee.email}</span></p>
                <p>• Work Email: <span className="font-bold">{employee.email}</span></p>
                <p>• Password: <span className="font-bold">{employee.userAccounts?.[0]?.initialPassword || 'Plinth@2026!'}</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ACCESSIBILITY (Access & Permissions Management) */}
      {activeTab === 'accessibility' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-border-strong border-border pb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Role &amp; Module Accessibility Management
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure workspace access permissions, assign security roles, or grant module privileges for {employee.firstName} {employee.lastName}.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadRoles}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRoles ? 'animate-spin' : ''}`} />
                <span>Refresh Roles</span>
              </Button>
            </div>

            {accessSuccessMessage && (
              <div className="p-3.5 rounded-lg bg-muted border border-border flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-tone-green-text shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-foreground">Accessibility Updated</p>
                  <p className="text-muted-foreground mt-0.5">{accessSuccessMessage}</p>
                </div>
              </div>
            )}

            {(() => {
              const userAccount = employee.userAccounts?.[0];
              const assignedUserRoles = userAccount?.userRoles || [];
              const currentAssignedRole = assignedUserRoles[0]?.role;

              return (
                <div className="space-y-6">
                  {/* Current Assigned Role Banner */}
                  <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                          Current Assigned Security Role
                        </span>
                        <div className="flex items-center gap-2.5">
                          <h4 className="text-base font-bold text-foreground">
                            {currentAssignedRole?.name || userAccount?.role || 'Default Employee Access'}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground border border-border">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {currentAssignedRole?.description || 'Standard workspace access assigned for employee operations.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {currentAssignedRole && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAssignAccessRole(null)}
                            disabled={isSavingAccessRole}
                            className="text-xs text-destructive hover:bg-destructive/10"
                          >
                            Remove Role
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Change / Assign Role Selector */}
                    <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-foreground block mb-1">
                          Assign or Switch Access Role
                        </label>
                        <select
                          value={selectedRoleToAssign || currentAssignedRole?.id || ''}
                          onChange={(e) => setSelectedRoleToAssign(e.target.value)}
                          onFocus={() => {
                            if (availableRoles.length === 0) loadRoles();
                          }}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">Select a security role...</option>
                          {availableRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} {r.description ? `(${r.description})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAssignAccessRole(selectedRoleToAssign || null)}
                        disabled={isSavingAccessRole || !selectedRoleToAssign}
                        className="self-end sm:self-auto mt-auto text-xs"
                      >
                        {isSavingAccessRole ? 'Saving…' : 'Apply Role'}
                      </Button>
                    </div>
                  </div>

                  {/* Active Granted Permissions Matrix */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-primary" />
                      Effective Permitted Modules &amp; Capabilities
                    </h4>

                    {(() => {
                      const perms = currentAssignedRole?.permissions || [];
                      if (perms.length === 0) {
                        return (
                          <div className="p-6 text-center border border-dashed border-border rounded-lg text-xs text-muted-foreground">
                            No specific granular permissions assigned to this user profile. Standard employee permissions apply.
                          </div>
                        );
                      }

                      // Group permissions by resource
                      const byResource: Record<string, Array<{ action: string; description?: string | null }>> = {};
                      perms.forEach((p: { permission: { resource: string; action: string; description?: string | null } }) => {
                        const perm = p.permission;
                        if (!byResource[perm.resource]) {
                          byResource[perm.resource] = [];
                        }
                        byResource[perm.resource].push({
                          action: perm.action,
                          description: perm.description,
                        });
                      });

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {Object.entries(byResource).map(([resource, actions]) => (
                            <div key={resource} className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                              <div className="flex items-center justify-between border-border-strong border-border pb-1.5">
                                <span className="font-semibold text-xs text-foreground">
                                  {resource}
                                </span>
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                                  {actions.length} {actions.length === 1 ? 'action' : 'actions'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {actions.map((act, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-background border border-border text-foreground">
                                    <Check className="w-2.5 h-2.5 text-tone-green-text" />
                                    {act.action}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Password Reset Dialog */}
      <Dialog
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Generate New Password"
        description={`Specify a custom temporary password or auto-generate a secure password for ${employee.firstName} ${employee.lastName}.`}
        className="max-w-md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
          <div>
            <label className="font-medium block mb-1 text-foreground">Custom Temporary Password (Optional)</label>
            <input
              type="text"
              placeholder="Leave empty to auto-generate"
              value={customPassword}
              onChange={(e) => setCustomPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowResetModal(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isResettingPassword}
              size="sm"
              className="text-xs"
            >
              {isResettingPassword ? 'Generating…' : 'Generate & Save'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Task Creation Dialog */}
      <Dialog
        open={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={`Assign Task to ${employee.firstName}`}
        description="Assign a new workstation or operational task."
        className="max-w-md"
      >
        <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
          <div>
            <label className="font-medium block mb-1 text-foreground">Task Title *</label>
            <input
              type="text"
              required
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="e.g. Inspect Lot QC 401"
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="font-medium block mb-1 text-foreground">Description</label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium block mb-1 text-foreground">Priority</label>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className="font-medium block mb-1 text-foreground">Due Date</label>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center justify-end pt-2 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTaskModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
            >
              Assign Task
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Attendance Dialog */}
      <Dialog
        open={isAttendanceModalOpen}
        onClose={() => setIsAttendanceModalOpen(false)}
        title="Mark Attendance"
        description="Log daily presence or leave details."
        className="max-w-md"
      >
        <form onSubmit={handleMarkAttendance} className="space-y-3 text-xs">
          <div>
            <label className="font-medium block mb-1 text-foreground">Date</label>
            <input
              type="date"
              required
              value={attendanceForm.date}
              onChange={(e) => setAttendanceForm({ ...attendanceForm, date: e.target.value })}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="font-medium block mb-1 text-foreground">Status</label>
            <select
              value={attendanceForm.status}
              onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LEAVE_SICK">Leave (Sick)</option>
              <option value="LEAVE_CASUAL">Leave (Casual)</option>
              <option value="LEAVE_PAID">Leave (Paid)</option>
              <option value="LEAVE_UNPAID">Leave (Unpaid)</option>
              <option value="HALF_DAY">Half Day</option>
            </select>
          </div>
          <div>
            <label className="font-medium block mb-1 text-foreground">Work Hours</label>
            <input
              type="number"
              step="0.5"
              value={attendanceForm.workHours}
              onChange={(e) => setAttendanceForm({ ...attendanceForm, workHours: Number(e.target.value) })}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="font-medium block mb-1 text-foreground">Notes / Remarks</label>
            <input
              type="text"
              value={attendanceForm.notes}
              onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-end pt-2 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAttendanceModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
            >
              Save Attendance
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Pay Slip Dialog */}
      <Dialog
        open={isPaySlipModalOpen}
        onClose={() => setIsPaySlipModalOpen(false)}
        title="Generate Monthly Pay Slip"
        description="Calculate allowances and deductions for disbursement."
        className="max-w-lg"
      >
        <form onSubmit={handleGeneratePaySlip} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium block mb-1 text-foreground">Month (1-12)</label>
              <input
                type="number"
                min="1"
                max="12"
                value={paySlipForm.month}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, month: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-medium block mb-1 text-foreground">Year</label>
              <input
                type="number"
                value={paySlipForm.year}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, year: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium block mb-1 text-foreground">Basic Salary (₹)</label>
              <input
                type="number"
                value={paySlipForm.basicSalary}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, basicSalary: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-medium block mb-1 text-foreground">HRA (₹)</label>
              <input
                type="number"
                value={paySlipForm.hra}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, hra: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium block mb-1 text-foreground">Special Allowances (₹)</label>
              <input
                type="number"
                value={paySlipForm.allowances}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, allowances: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-medium block mb-1 text-foreground">Bonus (₹)</label>
              <input
                type="number"
                value={paySlipForm.bonus}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, bonus: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium block mb-1 text-foreground">PF Deduction (₹)</label>
              <input
                type="number"
                value={paySlipForm.pfDeduction}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, pfDeduction: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="font-medium block mb-1 text-foreground">Tax Deduction (₹)</label>
              <input
                type="number"
                value={paySlipForm.taxDeduction}
                onChange={(e) => setPaySlipForm({ ...paySlipForm, taxDeduction: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center justify-end pt-2 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPaySlipModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
            >
              Generate Pay Slip
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Document Upload Dialog */}
      <Dialog
        open={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        title="Upload Employee Document"
        description="Attach verification proofs and certificates from device."
        className="max-w-md"
      >
        <form onSubmit={handleUploadDocument} className="space-y-4 text-xs">
          {docUploadError && (
            <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{docUploadError}</span>
            </div>
          )}

          <div>
            <label className="font-medium block mb-1 text-foreground">Select File from Device *</label>
            <label className="flex items-center justify-center gap-2 px-3 py-2 border border-input border-dashed rounded-lg bg-background hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition text-xs font-medium h-[40px]">
              <Upload className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate max-w-[260px]">
                {docForm.fileName ? docForm.fileName : 'Choose document from device...'}
              </span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={handleDeviceFileUpload}
                className="hidden"
              />
            </label>
            <span className="text-[11px] text-muted-foreground mt-1 block">PDF, PNG, JPG, or DOC up to 15MB</span>
          </div>

          {docForm.fileUrl && (
            <div className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg border border-primary/20 text-[11px]">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle2 className="w-4 h-4 text-tone-green-text flex-shrink-0" />
                <span className="text-foreground font-medium truncate">{docForm.fileName}</span>
                {docForm.fileSize && (
                  <span className="text-muted-foreground font-mono">({(docForm.fileSize / 1024).toFixed(1)} KB)</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDocForm((prev) => ({ ...prev, fileUrl: '', fileName: '', fileSize: undefined, mimeType: undefined }))}
                className="text-xs text-muted-foreground hover:text-destructive ml-2 flex-shrink-0"
              >
                Clear
              </button>
            </div>
          )}

          <div>
            <label className="font-medium block mb-1 text-foreground">Document Title *</label>
            <input
              type="text"
              required
              value={docForm.title}
              onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
              placeholder="e.g. Aadhaar Card / Offer Letter"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="font-medium block mb-1 text-foreground">Category</label>
            <select
              value={docForm.category}
              onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ID_PROOF">ID Proof (Passport, Aadhaar, PAN)</option>
              <option value="OFFER_LETTER">Offer Letter</option>
              <option value="RESUME">Resume / CV</option>
              <option value="CERTIFICATE">Educational / Skill Certificate</option>
              <option value="AGREEMENT">NDA / Employment Agreement</option>
              <option value="TAX_DOC">Tax Exemption / 16A Document</option>
            </select>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDocModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
            >
              Save Document
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
