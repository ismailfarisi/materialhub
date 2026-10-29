"use client";

import { CalendarBoard } from "@/components/bookings/calendar/CalendarBoard";

export default function CalendarPage() {
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-cacao">Calendar</h1>
				<p className="text-sm text-taupe">
					Every booking, walk-in, phone booking, imported event, and blocked time for a
					location — drag a confirmed marketplace booking to reschedule it.
				</p>
			</div>
			<CalendarBoard />
		</div>
	);
}
