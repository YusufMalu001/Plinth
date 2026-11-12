'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { useForm, DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, Button, Input, PageHeader } from '@plinth/ui';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { VersionHistory, VersionInfo } from '../../components/VersionHistory';
import { ApprovalFlow } from '../../components/ApprovalFlow';
import { useRouter } from 'next/navigation';
import { LifecycleStatus } from '@plinth/types';
import { Save, X, Edit, Send } from 'lucide-react';

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'custom';

export interface FormFieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: { label: string; value: string | number }[]; // For select
  renderCustom?: (formContext: unknown) => React.ReactNode;
}

export interface DetailDescriptor<T> {
  name: string;
  apiPath: string; // e.g. 'products'
  basePath: string; // e.g. '/products'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any, any, any>;
  fields: FormFieldDef[];
  defaultValues?: DefaultValues<T>;
  renderRightPanel?: (entityId: string) => React.ReactNode;
}

export function GenericDetail<T extends { id: string; status: LifecycleStatus }>({ 
  id, 
  descriptor,
  hasApprovePermission = true

}: { 
  id: string; 
  descriptor: DetailDescriptor<T>;
  hasApprovePermission?: boolean;
}) {
  const isNew = id === 'new';
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = React.useState(isNew);

  const { data: entity, isLoading: isLoadingEntity, error: entityError, refetch } = useQuery<T>({
    queryKey: [descriptor.apiPath, id],
    queryFn: () => fetchApi(`/${descriptor.apiPath}/${id}`),
    enabled: !isNew
  });

  const { data: versions, isLoading: isLoadingVersions } = useQuery<VersionInfo[]>({
    queryKey: [descriptor.apiPath, id, 'versions'],
    queryFn: () => fetchApi(`/${descriptor.apiPath}/${id}/versions`),
    enabled: !isNew
  });

  const { register, handleSubmit, formState: { errors }, control } = useForm({
    resolver: zodResolver(descriptor.schema),
    values: isNew ? descriptor.defaultValues : (entity as DefaultValues<T> | undefined)
  });

  const saveMutation = useMutation({
    mutationFn: (data: unknown) => 
      fetchApi(`/${descriptor.apiPath}${isNew ? '' : `/${id}`}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [descriptor.apiPath] });
      if (isNew) {
        router.push(descriptor.basePath);
      } else {
        setIsEditing(false);
        refetch();
      }
    }
  });

  const submitValidationMutation = useMutation({
    mutationFn: () => 
      fetchApi(`/${descriptor.apiPath}/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [descriptor.apiPath, id] });
      refetch();
    }
  });

  if (!isNew && isLoadingEntity) return <LoadingState message="Loading details..." />;
  if (!isNew && entityError) return <ErrorState error={entityError as Error} />;

  const onSubmit = (data: unknown) => {
    saveMutation.mutate(data);
  };

  const title = isNew ? `Create ${descriptor.name}` : ((entity as Record<string, unknown>)?.name as string || `View ${descriptor.name}`);

  return (
    <main className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="w-full space-y-6">
        <PageHeader 
          title={title}
          description={`Fill out the required information to ${isNew ? 'create' : 'manage'} this ${descriptor.name.toLowerCase()}.`}
          actions={
            <div className="flex gap-2 items-center">
              {!isNew && entity && (
                <div className="flex items-center space-x-4 mr-4">
                  <StatusBadge status={entity.status} />
                  {entity.status === 'DRAFT' && (
                    <Button 
                      variant="outline" 
                      onClick={() => submitValidationMutation.mutate()}
                      loading={submitValidationMutation.isPending}
                      className="font-semibold shadow-xs rounded-xl border-tone-amber-solid text-tone-amber-text hover:bg-tone-amber-bg"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {submitValidationMutation.isPending ? 'Submitting...' : 'Submit for Validation'}
                    </Button>
                  )}
                </div>
              )}

              {!isNew && !isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(true)} className="font-semibold rounded-xl shadow-xs">
                  <Edit className="w-3.5 h-3.5 mr-1.5" />
                  Edit Record
                </Button>
              )}
              
              {!isNew && isEditing && (
                <>
                  <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-xl">
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Cancel
                  </Button>
                  <Button variant="default" type="submit" form="generic-detail-form" loading={saveMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl shadow-xs">
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </>
              )}

              {isNew && (
                <Button variant="default" type="submit" form="generic-detail-form" loading={saveMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl shadow-xs">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {saveMutation.isPending ? 'Creating...' : 'Create Record'}
                </Button>
              )}
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-2xl border border-border/80 shadow-xs overflow-hidden">
              <div className="bg-muted/40 px-6 py-4 border-b border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md bg-tone-amber-bg text-inverse flex items-center justify-center text-xs font-black shadow-xs">
                    01
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {descriptor.name} Master Record
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Master identity parameters and configuration attributes
                    </p>
                  </div>
                </div>
                {!isNew && entity && (
                  <StatusBadge status={entity.status} />
                )}
              </div>

              <div className="p-6">
                <form id="generic-detail-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {descriptor.fields.map(field => (
                      <div key={field.name} className={field.type === 'custom' ? "col-span-1 md:col-span-2" : ""}>
                        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          {field.label}
                        </label>
                        {field.type === 'text' && (
                          <Input 
                            type="text" 
                            {...register(field.name)} 
                            className="w-full rounded-xl bg-background border-border focus:border-tone-amber-solid focus:ring-4 focus:ring-tone-amber-solid" 
                            disabled={!isEditing}
                          />
                        )}
                        {field.type === 'number' && (
                          <Input 
                            type="number" 
                            {...register(field.name, { valueAsNumber: true })} 
                            className="w-full rounded-xl bg-background border-border focus:border-tone-amber-solid focus:ring-4 focus:ring-tone-amber-solid" 
                            disabled={!isEditing}
                          />
                        )}
                        {field.type === 'select' && field.options && (
                          <select 
                            {...register(field.name)} 
                            className="w-full rounded-xl bg-background border border-border text-foreground px-3 py-2.5 text-xs font-medium focus:outline-none focus:border-tone-amber-solid focus:ring-4 focus:ring-tone-amber-solid disabled:opacity-50 transition-all shadow-xs"
                            disabled={!isEditing}
                          >
                            {field.options.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                        {field.type === 'custom' && field.renderCustom && field.renderCustom({ register, errors, control, disabled: !isEditing })}
                        {(() => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const fieldError = field.name.split('.').reduce((acc: any, curr) => acc?.[curr], errors);
                          if (fieldError) {
                            return <p className="text-destructive text-xs font-medium mt-1.5">{(fieldError as { message: string }).message}</p>;
                          }
                          return null;
                        })()}
                      </div>
                    ))}
                  </div>
                </form>
                {saveMutation.isError && (
                  <div className="mt-4 p-3 bg-destructive/10 text-destructive text-xs font-medium rounded-xl border border-destructive/20">
                    {(saveMutation.error as Error).message}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {!isNew && (
            <div className="space-y-6">
              <ApprovalFlow 
                entityId={id} 
                entityTypePath={descriptor.apiPath} 
                currentStatus={entity!.status} 
                hasPermission={hasApprovePermission} 
                onSuccess={refetch}
              />
              {descriptor.renderRightPanel ? descriptor.renderRightPanel(id) : (
                isLoadingVersions ? (
                  <Card className="p-6 rounded-2xl border border-border/80">
                    <LoadingState message="Loading history..." />
                  </Card>
                ) : (
                  <VersionHistory versions={versions || []} />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
