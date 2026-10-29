import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosInstance } from "axios";
import type { Layout, Section, SectionType } from "./types";

const layoutQueryKey = (prefix: string, id: string) => [
	"cms-layout",
	prefix,
	id,
];

export function useLayout(
	client: AxiosInstance,
	prefix: string,
	layoutId: string | undefined,
) {
	return useQuery({
		queryKey: layoutQueryKey(prefix, layoutId ?? ""),
		queryFn: async () => {
			const { data } = await client.get<{ data: Layout }>(
				`${prefix}/${layoutId}`,
			);
			return data.data;
		},
		enabled: !!layoutId,
	});
}

export function useSectionTypes(client: AxiosInstance) {
	return useQuery({
		queryKey: ["cms-section-types"],
		queryFn: async () => {
			const { data } = await client.get<{ data: SectionType[] }>(
				"/section-types",
			);
			return data.data;
		},
	});
}

export function useAddSection(
	client: AxiosInstance,
	prefix: string,
	layoutId: string,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Partial<Section> & Record<string, unknown>) => {
			const { data } = await client.post(
				`${prefix}/${layoutId}/sections`,
				body,
			);
			return data.data as Section;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: layoutQueryKey(prefix, layoutId) }),
	});
}

export function useUpdateSection(
	client: AxiosInstance,
	prefix: string,
	layoutId: string,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			sectionId,
			...body
		}: { sectionId: string } & Partial<Section> & Record<string, unknown>) => {
			const { data } = await client.put(
				`${prefix}/${layoutId}/sections/${sectionId}`,
				body,
			);
			return data.data as Section;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: layoutQueryKey(prefix, layoutId) }),
	});
}

export function useRemoveSection(
	client: AxiosInstance,
	prefix: string,
	layoutId: string,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (sectionId: string) => {
			await client.delete(`${prefix}/${layoutId}/sections/${sectionId}`);
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: layoutQueryKey(prefix, layoutId) }),
	});
}

export function useReorderSections(
	client: AxiosInstance,
	prefix: string,
	layoutId: string,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (sections: { id: string; position: number }[]) => {
			const { data } = await client.put(
				`${prefix}/${layoutId}/sections/reorder`,
				{ sections },
			);
			return data.data;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: layoutQueryKey(prefix, layoutId) }),
	});
}

export function usePublishLayout(
	client: AxiosInstance,
	prefix: string,
	layoutId: string,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const { data } = await client.post(`${prefix}/${layoutId}/publish`);
			return data.data;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: layoutQueryKey(prefix, layoutId) }),
	});
}

export function useScheduleLayout(
	client: AxiosInstance,
	prefix: string,
	layoutId: string,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (publish_at: string) => {
			const { data } = await client.post(`${prefix}/${layoutId}/schedule`, {
				publish_at,
			});
			return data.data;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: layoutQueryKey(prefix, layoutId) }),
	});
}
