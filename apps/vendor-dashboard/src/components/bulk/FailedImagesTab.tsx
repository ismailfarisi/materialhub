"use client";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function FailedImagesTab({ jobId }: { jobId: string }) {
	const qc = useQueryClient();
	const { data } = useQuery({
		queryKey: ["bulk-jobs", jobId, "failed-images"],
		queryFn: async () => {
			const { data } = await api.get<{
				items: Array<{
					id: string;
					sourceUrl: string;
					lastError: string;
					rowNumber: number;
				}>;
			}>(`/bulk/jobs/${jobId}/image-tasks`, { params: { status: "failed" } });
			return data;
		},
	});
	const retry = useMutation({
		mutationFn: async () => {
			await api.post(`/bulk/jobs/${jobId}/retry-failed-images`);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["bulk-jobs"] }),
	});

	if (!data?.items?.length)
		return <div className="p-4 text-sm text-gray-500">No failed images.</div>;

	return (
		<div className="p-4 space-y-2">
			<button
				type="button"
				onClick={() => retry.mutate()}
				className="rounded border px-3 py-1 text-sm"
			>
				Retry failed images ({data.items.length})
			</button>
			<table className="w-full text-xs" data-stack="md">
				<thead>
					<tr className="text-left text-gray-500">
						<th>Row</th>
						<th>URL</th>
						<th>Error</th>
					</tr>
				</thead>
				<tbody>
					{data.items.map((t) => (
						<tr key={t.id} className="border-t">
							<td data-label="Row">{t.rowNumber}</td>
							<td data-label="URL" className="max-w-xs truncate">
								<a
									href={t.sourceUrl}
									target="_blank"
									rel="noreferrer"
									className="text-blue-600 underline"
								>
									{t.sourceUrl}
								</a>
							</td>
							<td data-label="Error" className="text-red-600">{t.lastError}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
