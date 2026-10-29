import { HeaderNavEditor } from "@/components/header-nav/header-nav-editor";

export default function Page() {
	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold text-nl-cacao mb-1">
				Header Navigation
			</h1>
			<p className="text-sm text-nl-russet mb-6">
				Edit the mega-menu shown across the site. Auto-saves; click Publish to
				push live.
			</p>
			<HeaderNavEditor />
		</div>
	);
}
