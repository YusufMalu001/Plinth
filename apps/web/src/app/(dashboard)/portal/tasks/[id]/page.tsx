'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCurrentUser } from '@/features/auth/hooks';
import { hrApi } from '@/features/hr/api';
import { EmployeeTaskDto } from '@plinth/types';
import {
  ArrowLeft,
  Calendar,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Upload,
  User,
  Flame,
  FileText,
  ExternalLink,
  Check,
  XCircle,
  Sparkles
} from 'lucide-react';
import { Button, Dialog } from '@plinth/ui';

export default function EmployeeTaskDetailPage() {
  const params = useParams();
  const taskId = params?.id as string;

  const { data: currentUser } = useCurrentUser();
  const [task, setTask] = useState<EmployeeTaskDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Proof submission modal state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [proofForm, setProofForm] = useState({
    proofUrl: '',
    proofFileName: '',
    proofNotes: ''
  });
  const [isDraggingInline, setIsDraggingInline] = useState(false);
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Validation modal state (for Admin/HR viewing this screen)
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationAction, setValidationAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [validationNotes, setValidationNotes] = useState('');
  const [validating, setValidating] = useState(false);

  const fetchTask = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const found = await hrApi.getTaskById(taskId);
      if (!found) {
        setError('Task not found');
      } else {
        setTask(found);
        setProofForm({
          proofUrl: found.proofUrl || '',
          proofFileName: found.proofFileName || '',
          proofNotes: found.proofNotes || ''
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [taskId]);

  const processUploadedFile = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds the 25MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setProofForm((prev) => ({
        ...prev,
        proofUrl: dataUrl,
        proofFileName: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };
  const handleStartTask = async () => {
    if (!task) return;
    try {
      const updated = await hrApi.updateTask(task.id, { status: 'IN_PROGRESS' });
      setTask(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start task');
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    if (!proofForm.proofUrl && !proofForm.proofNotes.trim()) {
      alert('Please upload a proof file or provide completion notes.');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await hrApi.updateTask(task.id, {
        status: 'UNDER_REVIEW',
        proofUrl: proofForm.proofUrl || undefined,
        proofFileName: proofForm.proofFileName || undefined,
        proofNotes: proofForm.proofNotes || undefined
      });
      setTask(updated);
      setIsSubmitModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit proof');
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setValidating(true);
    try {
      const isApprove = validationAction === 'APPROVE';
      const updated = await hrApi.updateTask(task.id, {
        status: isApprove ? 'COMPLETED' : 'REJECTED',
        validatedBy: currentUser?.name || currentUser?.email || 'Admin/HR',
        validationNotes: validationNotes || (isApprove ? 'Task validated & completed.' : 'Proof rejected.')
      });
      setTask(updated);
      setIsValidationModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to validate task');
    } finally {
      setValidating(false);
    }
  };

  // Check if current user is HR or Admin
  const roleName = (currentUser?.role || currentUser?.roleDefinition?.name || '').toLowerCase();
  const isHrOrAdmin = roleName.includes('admin') || roleName.includes('hr') || roleName.includes('head') || roleName.includes('manager');

  if (loading) {
    return (
      <div className="flex-1 w-full p-8 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-accent border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex-1 w-full p-8 flex items-center justify-center">
        <div className="text-center space-y-3 max-w-md bg-card p-6 rounded-2xl border border-border">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Task Not Found</h2>
          <p className="text-xs text-muted-foreground">{error || 'This task could not be retrieved.'}</p>
          <Link href="/portal/tasks">
            <Button variant="outline" size="sm" className="mt-2">
              Back to Assigned Tasks
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isUrgent = task.priority === 'URGENT';
  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Navigation Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/portal/tasks">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Tasks</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Task Reference:
            </span>
            <span className="font-mono text-xs font-semibold bg-muted px-2 py-0.5 rounded-md">
              {task.id.slice(0, 8)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {task.status === 'PENDING' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartTask}
              className="gap-2 text-xs"
            >
              <Clock className="w-4 h-4" />
              <span>Start Task</span>
            </Button>
          )}

          {(task.status === 'IN_PROGRESS' || task.status === 'REJECTED' || task.status === 'PENDING') && (
            <Button
              size="sm"
              onClick={() => setIsSubmitModalOpen(true)}
              className="gap-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>{task.status === 'REJECTED' ? 'Re-upload Proof' : 'Upload Proof of Completion'}</span>
            </Button>
          )}

          {isHrOrAdmin && task.status === 'UNDER_REVIEW' && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setValidationAction('REJECT');
                  setValidationNotes('');
                  setIsValidationModalOpen(true);
                }}
                variant="outline"
                className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject Proof</span>
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setValidationAction('APPROVE');
                  setValidationNotes('');
                  setIsValidationModalOpen(true);
                }}
                className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Validate & Complete Task</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                {isUrgent && <Flame className="w-3.5 h-3.5 text-destructive" />}
                {task.priority} Priority
              </span>

              {task.status === 'UNDER_REVIEW' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  Under HR Validation
                </span>
              )}
              {task.status === 'COMPLETED' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-muted text-foreground border border-border">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  Validated & Completed
                </span>
              )}
              {task.status === 'IN_PROGRESS' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                  <Clock className="w-3.5 h-3.5" />
                  In Progress
                </span>
              )}
              {task.status === 'REJECTED' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-destructive/10 text-destructive border border-destructive/30">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Revision Required
                </span>
              )}
              {task.status === 'PENDING' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                  Pending Start
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-foreground">{task.title}</h1>
            <p className="text-sm text-muted-foreground max-w-3xl">
              {task.description || 'No detailed instructions provided. Please perform work according to standard operational procedure.'}
            </p>
          </div>

          {/* Quick Details Box */}
          <div className="bg-muted/50 p-4 rounded-xl border border-border flex flex-col gap-2.5 min-w-[240px]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Target Due Date:
              </span>
              <strong className="text-foreground">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No Deadline'}
              </strong>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Department:
              </span>
              <strong className="text-foreground">{task.department || 'General'}</strong>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" />
                Assignee:
              </span>
              <strong className="text-foreground">
                {task.employee ? `${task.employee.firstName} ${task.employee.lastName}` : 'Assigned Employee'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Instructions & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Rejection / Validation Warning */}
          {task.status === 'REJECTED' && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-2xl text-xs text-destructive space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>HR Revision Requested</span>
              </div>
              <p>
                The validation review was rejected. Please re-upload verified documentation or logs according to the feedback below.
              </p>
              {task.validationNotes && (
                <div className="mt-2 p-3 bg-card/60 rounded-xl border border-destructive/20 font-medium">
                  <strong>Notes:</strong> {task.validationNotes}
                </div>
              )}
            </div>
          )}

          {/* Proof of Completion Section */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Proof of Task Completion</h3>
                <p className="text-xs text-muted-foreground">Uploaded evidence, documents, photographs, and employee notes.</p>
              </div>

              {(task.status === 'IN_PROGRESS' || task.status === 'REJECTED' || task.status === 'PENDING') && (
                <Button
                  size="sm"
                  onClick={() => setIsSubmitModalOpen(true)}
                  className="gap-1.5 text-xs bg-primary text-primary-foreground font-bold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{task.proofUrl ? 'Update Proof' : 'Upload Proof'}</span>
                </Button>
              )}
            </div>

            {task.proofUrl ? (
              <div className="space-y-4 pt-2">
                {/* Proof Notes */}
                {task.proofNotes && (
                  <div className="p-4 bg-muted/40 rounded-xl border border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Employee Submission Notes
                    </span>
                    <p className="text-xs text-foreground font-medium whitespace-pre-wrap">{task.proofNotes}</p>
                    {task.submittedAt && (
                      <span className="text-[10px] text-muted-foreground block mt-2">
                        Submitted: {new Date(task.submittedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Proof File Attachment Preview */}
                <div className="p-4 rounded-xl border border-border bg-card flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-5 h-5 text-primary" />
                      <div>
                        <h4 className="text-xs font-bold text-foreground">
                          {task.proofFileName || 'Attached Completion Proof Document'}
                        </h4>
                        <span className="text-[11px] text-muted-foreground">Evidence File Attached</span>
                      </div>
                    </div>

                    <a
                      href={task.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Full Size</span>
                    </a>
                  </div>

                  {/* Inline Preview */}
                  <div className="rounded-xl border border-border/80 bg-muted/20 p-2 min-h-[260px] flex items-center justify-center overflow-hidden">
                    {task.proofUrl.startsWith('data:image') || /\.(png|jpe?g|webp|gif|svg)$/i.test(task.proofFileName || '') ? (
                      <img
                        src={task.proofUrl}
                        alt="Completion Proof"
                        className="max-h-[380px] max-w-full object-contain rounded-lg shadow-xs"
                      />
                    ) : task.proofUrl.startsWith('data:application/pdf') || task.proofFileName?.endsWith('.pdf') ? (
                      <iframe
                        src={task.proofUrl}
                        title="Proof PDF"
                        className="w-full h-[380px] rounded-lg border-accent"
                      />
                    ) : (
                      <div className="text-center p-6 space-y-2">
                        <FileText className="w-10 h-10 text-primary mx-auto opacity-70" />
                        <p className="text-xs font-semibold text-foreground">{task.proofFileName || 'Attached Document'}</p>
                        <p className="text-[11px] text-muted-foreground">Click Open Full Size to view or download document.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingInline(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingInline(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingInline(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    processUploadedFile(file);
                    setIsSubmitModalOpen(true);
                  }
                }}
                className={`p-8 border-border border-dashed rounded-2xl text-center space-y-3 transition-colors ${
                  isDraggingInline
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/10 hover:border-primary/50 hover:bg-muted/20'
                }`}
              >
                <input
                  type="file"
                  id="portal-inline-proof-dropzone"
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.svg"
                  onChange={(e) => {
                    handleFileUpload(e);
                    if (e.target.files?.[0]) {
                      setIsSubmitModalOpen(true);
                    }
                  }}
                />
                <label htmlFor="portal-inline-proof-dropzone" className="cursor-pointer block space-y-3">
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground/60" />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">No completion proof uploaded yet</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When you finish executing this task, upload photos, documents, or calibration logs to request HR validation.
                    </p>
                    <p className="text-[11px] text-primary font-medium mt-1">
                      Drag & drop any proof file here (PDF, DOC, XLS, PNG, JPG, SVG, etc.) or click to browse
                    </p>
                  </div>
                </label>
                <Button
                  size="sm"
                  onClick={() => setIsSubmitModalOpen(true)}
                  className="gap-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Proof Now</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Workflow History & Validation Status */}
        <div className="space-y-6">
          {/* Validation Status Card */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Validation & Sign-Off
            </h3>

            {task.status === 'COMPLETED' ? (
              <div className="p-4 bg-muted border border-border rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Validated by HR / Admin</span>
                </div>
                {task.validatedBy && (
                  <p className="text-xs text-foreground">
                    <strong>Validator:</strong> {task.validatedBy}
                  </p>
                )}
                {task.completedAt && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Completed Date:</strong> {new Date(task.completedAt).toLocaleString()}
                  </p>
                )}
                {task.validationNotes && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Sign-off Remarks:</strong> {task.validationNotes}
                  </p>
                )}
              </div>
            ) : task.status === 'UNDER_REVIEW' ? (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>Awaiting Sign-Off</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Proof has been delivered. HR/Admin review is pending to verify compliance before marking as complete.
                </p>
                {isHrOrAdmin && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setValidationAction('APPROVE');
                      setValidationNotes('');
                      setIsValidationModalOpen(true);
                    }}
                    className="w-full mt-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs"
                  >
                    Perform Validation Review
                  </Button>
                )}
              </div>
            ) : (
              <div className="p-4 bg-muted/40 rounded-xl border border-border space-y-2">
                <span className="text-xs font-semibold text-muted-foreground block">
                  Status: {task.status.replace(/_/g, ' ')}
                </span>
                <p className="text-xs text-muted-foreground">
                  Task must be submitted with proof before HR validation can proceed.
                </p>
              </div>
            )}
          </div>

          {/* Workflow Timeline */}
          <div className="bg-card rounded-2xl border border-border p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Task Timeline
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                <div>
                  <strong className="block text-foreground">Task Created & Assigned</strong>
                  <span className="text-muted-foreground">{new Date(task.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {task.submittedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                  <div>
                    <strong className="block text-foreground">Proof Submitted by Employee</strong>
                    <span className="text-muted-foreground">{new Date(task.submittedAt).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {task.completedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground mt-1.5" />
                  <div>
                    <strong className="block text-foreground">Validated & Closed</strong>
                    <span className="text-muted-foreground">{new Date(task.completedAt).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Proof Submission Modal */}
      <Dialog
        open={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Upload Proof of Task Completion"
        description="Attach photos, reports, logs, or metrics confirming full task execution."
        className="max-w-lg"
      >
        <form onSubmit={handleSubmitProof} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1.5">
              Select Proof Document / Photo *
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingModal(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingModal(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingModal(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  processUploadedFile(file);
                }
              }}
              className={`border-border border-dashed rounded-xl p-5 text-center transition-colors ${
                isDraggingModal
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted/30'
              }`}
            >
              <input
                type="file"
                id="modal-proof-file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.svg"
                onChange={handleFileUpload}
              />
              <label
                htmlFor="modal-proof-file"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground">
                    Click to browse or drag & drop proof file here
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Supports DOC, DOCX, PDF, XLS, XLSX, CSV, JPG, PNG, SVG, TXT (up to 25MB)
                  </p>
                </div>
              </label>

              {proofForm.proofFileName && (
                <div className="mt-3 p-2.5 bg-primary/10 rounded-lg text-primary text-xs font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2 truncate max-w-[280px]">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{proofForm.proofFileName}</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-tone-green-text shrink-0">Attached ✓</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1.5">
              Completion Notes & Work Log
            </label>
            <textarea
              rows={3}
              value={proofForm.proofNotes}
              onChange={(e) => setProofForm({ ...proofForm, proofNotes: e.target.value })}
              placeholder="Describe work completed, metrics, calibration values, or batch details..."
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSubmitModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={submitting}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {submitting ? 'Submitting...' : 'Submit for HR Validation'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* HR / Admin Validation Modal */}
      <Dialog
        open={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        title={validationAction === 'APPROVE' ? 'Validate & Complete Task' : 'Reject Task Proof Submission'}
        description={
          validationAction === 'APPROVE'
            ? 'Sign off on the employee\'s proof submission to mark the task officially completed.'
            : 'Provide feedback explaining why the proof is insufficient so the employee can re-submit.'
        }
        className="max-w-md"
      >
        <form data-keyboard-submit="off" onSubmit={handleValidateTask} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1.5">
              {validationAction === 'APPROVE' ? 'Sign-Off Remarks (Optional)' : 'Rejection Reason / Feedback *'}
            </label>
            <textarea
              rows={3}
              required={validationAction === 'REJECT'}
              value={validationNotes}
              onChange={(e) => setValidationNotes(e.target.value)}
              placeholder={
                validationAction === 'APPROVE'
                  ? 'e.g. Work confirmed verified against QA standards.'
                  : 'e.g. Calibration report missing sensor temperature readings. Please re-run test.'
              }
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsValidationModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={validating}
              className={
                validationAction === 'APPROVE'
                  ? 'gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold'
                  : 'gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold'
              }
            >
              {validating
                ? 'Processing...'
                : validationAction === 'APPROVE'
                ? 'Approve & Mark Completed'
                : 'Reject & Request Revision'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
