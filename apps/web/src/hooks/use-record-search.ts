import { useRecordRecentSearch } from "@/lib/queries/recent-searches";

export function useRecordSearch() {
	const recordMutation = useRecordRecentSearch();
	return (q: string) => {
		if (q?.trim()) recordMutation.mutate(q.trim());
	};
}
