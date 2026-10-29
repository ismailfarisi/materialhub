import type { ServiceListItem } from "../../lib/booking/types";
import { ServiceCard } from "./service-card";

export function ServiceGrid({ services }: { services: ServiceListItem[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </div>
  );
}
