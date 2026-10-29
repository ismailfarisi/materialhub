"use client";

import {
  type ProductExportFormat,
  type ProductExportPreset,
  fetchProductExportDownloadUrl,
  useCreateProductExport,
  useProductExportJobs,
  useProductExportMetadata,
} from "@/lib/queries/bulk";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from "@materialhub/ui";
import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { getEffectiveFieldGroups, toggleFieldGroup } from "./product-export-dialog.helpers";

interface ProductExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Record<string, string | undefined>;
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not started";
  return new Date(value).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusClassName(status: string) {
  if (status === "completed") return "bg-green-50 text-green-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "running" || status === "queued") return "bg-amber-50 text-amber-700";
  return "bg-pearl/40 text-taupe";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }
  return fallback;
}

export function ProductExportDialog({ open, onOpenChange, filters }: ProductExportDialogProps) {
  const metadataQuery = useProductExportMetadata();
  const jobsQuery = useProductExportJobs();
  const createExport = useCreateProductExport();
  const [format, setFormat] = useState<ProductExportFormat>("xlsx");
  const [preset, setPreset] = useState<ProductExportPreset>("catalog_overview");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const selectedPreset = metadataQuery.data?.presets.find((item) => item.key === preset);
  const effectiveGroups = getEffectiveFieldGroups(selectedGroups, selectedPreset);
  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, value]) => Boolean(value)),
    [filters],
  );
  const jobs = jobsQuery.data?.items ?? [];

  function handlePresetChange(value: string) {
    setPreset(value as ProductExportPreset);
    setSelectedGroups([]);
  }

  function handleGroupToggle(group: string) {
    setSelectedGroups((current) => toggleFieldGroup(current, selectedPreset, group));
  }

  function handleCreateExport() {
    if (effectiveGroups.length === 0) {
      toast({
        title: "Select at least one field group",
        variant: "destructive",
      });
      return;
    }

    createExport.mutate(
      {
        format,
        preset,
        fieldGroups: effectiveGroups,
        filters,
      },
      {
        onSuccess: () => {
          toast({
            title: "Export queued",
            description: "The report will appear in recent exports when it is ready.",
          });
        },
        onError: (err: unknown) => {
          toast({
            title: "Export failed",
            description: getErrorMessage(err, "Could not queue export."),
            variant: "destructive",
          });
        },
      },
    );
  }

  async function handleDownload(jobId: string) {
    try {
      const url = await fetchProductExportDownloadUrl(jobId);
      if (!url) {
        toast({ title: "Download unavailable", variant: "destructive" });
        return;
      }
      window.location.href = url;
    } catch (err: unknown) {
      toast({
        title: "Download failed",
        description: getErrorMessage(err, "Could not prepare download."),
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export product report</DialogTitle>
          <DialogDescription>
            Choose a report preset, field groups, and file format for the current product view.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-cacao">Format</div>
              <div className="grid grid-cols-2 gap-2">
                {(["xlsx", "csv"] as ProductExportFormat[]).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={format === item ? "default" : "outline"}
                    className="justify-start gap-2"
                    onClick={() => setFormat(item)}
                  >
                    <FileSpreadsheet size={16} />
                    {item.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-cacao">Preset</div>
              <Select value={preset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preset" />
                </SelectTrigger>
                <SelectContent>
                  {metadataQuery.data?.presets.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-cacao">Field groups</div>
                <span className="text-xs text-taupe">{effectiveGroups.length} selected</span>
              </div>
              {metadataQuery.isLoading ? (
                <div className="grid gap-2">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {metadataQuery.data?.fieldGroups.map((group) => (
                    <div
                      key={group.key}
                      className="flex min-h-11 items-center gap-3 rounded-md border border-pearl/70 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        aria-label={group.label}
                        checked={effectiveGroups.includes(group.key)}
                        onCheckedChange={() => handleGroupToggle(group.key)}
                      />
                      <span className="font-medium text-cacao">{group.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-pearl/70 px-3 py-2">
              <div className="text-xs font-medium uppercase tracking-wide text-taupe">
                Current filters
              </div>
              {activeFilters.length === 0 ? (
                <div className="mt-1 text-sm text-cacao">All products</div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeFilters.map(([key, value]) => (
                    <span key={key} className="rounded bg-pearl/50 px-2 py-1 text-xs text-cacao">
                      {key}: {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cacao">Recent exports</h3>
              {jobsQuery.isFetching && <span className="text-xs text-taupe">Refreshing</span>}
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {jobs.length === 0 ? (
                <div className="rounded-md border border-dashed border-pearl/80 px-3 py-6 text-center text-sm text-taupe">
                  No exports yet.
                </div>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className="rounded-md border border-pearl/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-cacao">
                          {job.fileName}
                        </div>
                        <div className="mt-1 text-xs text-taupe">
                          {job.format.toUpperCase()} - {formatDate(job.createdAt)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded px-2 py-1 text-xs ${statusClassName(job.status)}`}
                      >
                        {formatStatus(job.status)}
                      </span>
                    </div>
                    {job.errorMessage && (
                      <div className="mt-2 text-xs text-red-600">{job.errorMessage}</div>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-taupe">
                        {job.rowCounts?.products ?? 0} products
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={job.status !== "completed"}
                        onClick={() => handleDownload(job.id)}
                      >
                        <Download size={14} />
                        Download
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="gap-1.5"
            onClick={handleCreateExport}
            disabled={metadataQuery.isLoading || createExport.isPending}
          >
            <Download size={16} />
            {createExport.isPending ? "Queueing..." : "Queue export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
