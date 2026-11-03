"use client";

import { Button, SectionHead } from "@/components/swatch";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";

interface Question {
	id: string;
	question: string;
	answer?: string | null;
	answered_at?: string | null;
	upvote_count?: number;
}

const INITIAL = 5;

/**
 * Buyer questions with the supplier's answers, plus an ask form. Asking needs
 * an account (the API requires it), so signed-out buyers get a sign-in link
 * in place of the form.
 */
export function QAAccordion({ questions, productId }: { questions: Question[]; productId: string }) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const { isAuthenticated } = useAuthStore();
	const [openIds, setOpenIds] = useState<string[]>(() => questions.slice(0, 1).map((q) => q.id));
	const [showAll, setShowAll] = useState(false);
	const [draft, setDraft] = useState("");
	const inputId = useId();
	const ask = useMutation({
		mutationFn: async (question: string) => {
			const { data } = await api.post(`/products/${productId}/questions`, { question });
			return data.data;
		},
		onSuccess: () => setDraft(""),
	});

	const visible = showAll ? questions : questions.slice(0, INITIAL);

	function submit(e: FormEvent) {
		e.preventDefault();
		const q = draft.trim();
		if (q) ask.mutate(q);
	}

	return (
		<section aria-labelledby="pdp-qa" className="border-t border-nl-cacao/10">
			<div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 md:px-8 md:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
				<div className="grid content-start gap-5">
					<SectionHead title={<span id="pdp-qa">{t("qaTitle")}</span>} />
					{isAuthenticated ? (
						<form onSubmit={submit} className="grid gap-2">
							<label htmlFor={inputId} className="text-[13px] font-medium text-nl-cacao">
								{t("askLabel")}
							</label>
							<textarea
								id={inputId}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								rows={3}
								maxLength={1000}
								placeholder={t("askPlaceholder")}
								className="w-full resize-y rounded-md border border-nl-cacao/15 bg-nl-pearl px-3 py-2.5 text-[14px] leading-relaxed text-nl-cacao placeholder:text-nl-russet/70 hover:border-nl-cacao/35 focus:border-nl-cacao focus:outline-none"
							/>
							<Button type="submit" variant="primary" size="md" disabled={ask.isPending || !draft.trim()} className="justify-self-start">
								{ask.isPending ? t("asking") : t("ask")}
							</Button>
							<p aria-live="polite" className="m-0 text-[13px]">
								{ask.isSuccess && <span className="text-nl-cacao">{t("questionSent")}</span>}
								{ask.isError && <span className="text-destructive">{t("questionFailed")}</span>}
							</p>
						</form>
					) : (
						<Button asChild variant="outline" size="md" className="justify-self-start">
							<Link href={`/${locale}/auth/login`}>{t("signInToAsk")}</Link>
						</Button>
					)}
				</div>

				<div className="min-w-0">
					{questions.length === 0 ? (
						<p className="m-0 rounded-md border border-dashed border-nl-cacao/25 p-5 text-[14px] text-nl-russet">{t("noQuestions")}</p>
					) : (
						<>
							<ul className="m-0 list-none border-t-2 border-nl-cacao p-0">
								{visible.map((q) => {
									const open = openIds.includes(q.id);
									const panel = `qa-${q.id}`;
									return (
										<li key={q.id} className="border-b border-nl-cacao/12">
											<button
												type="button"
												onClick={() => setOpenIds((ids) => (open ? ids.filter((x) => x !== q.id) : [...ids, q.id]))}
												aria-expanded={open}
												aria-controls={panel}
												className="flex w-full items-start gap-4 py-4 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
											>
												<span className="flex-1 break-words text-[15px] font-medium leading-snug text-nl-cacao">{q.question}</span>
												<ChevronDown
													className={cn("mt-0.5 h-4 w-4 shrink-0 text-nl-russet transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
													strokeWidth={1.75}
													aria-hidden="true"
												/>
											</button>
											<div id={panel} hidden={!open} className="grid gap-2 pb-5">
												{q.answer ? (
													<p className="m-0 max-w-[70ch] whitespace-pre-line break-words text-[14.5px] leading-relaxed text-nl-cacao">{q.answer}</p>
												) : (
													<p className="m-0 text-[13px] text-nl-russet">{t("awaitingAnswer")}</p>
												)}
												{(q.upvote_count ?? 0) > 0 && (
													<p className="m-0 text-[12.5px] text-nl-russet">{t("useful", { count: q.upvote_count ?? 0 })}</p>
												)}
											</div>
										</li>
									);
								})}
							</ul>
							{questions.length > INITIAL && (
								<Button variant="ghost" size="sm" className="mt-3" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
									{showAll ? t("showFewer") : t("showAllQuestions", { count: questions.length })}
								</Button>
							)}
						</>
					)}
				</div>
			</div>
		</section>
	);
}
