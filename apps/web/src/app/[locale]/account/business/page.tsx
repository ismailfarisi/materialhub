"use client";

import { BusinessGate } from "@/components/business/business-gate";
import { BusinessSetup } from "@/components/business/business-setup";
import { CompanyProfile } from "@/components/business/company-profile";

export default function BusinessPage() {
	return (
		<BusinessGate allowNoAccount>
			{(data) =>
				data.account ? (
					<CompanyProfile data={data} />
				) : (
					<BusinessSetup invites={data.invites} />
				)
			}
		</BusinessGate>
	);
}
