import { CheckboxFilter } from "./checkbox-filter";
import { ColorSwatchFilter } from "./color-swatch-filter";
import { RadioFilter } from "./radio-filter";
import { RangeFilter } from "./range-filter";
import { ToggleFilter } from "./toggle-filter";
import type { AttributeFilter, FilterRendererSpec } from "./types";

interface Props {
	attributes: AttributeFilter[];
	getParam: (key: string) => string | null;
	onChangeParam: (key: string, next: string | null) => void;
}

export function AttributeFilterSidebar({
	attributes,
	getParam,
	onChangeParam,
}: Props) {
	return (
		<>
			{attributes.map((attr) => {
				if (!attr.filter_input_type) return null;
				const spec = attr as FilterRendererSpec;
				const props = {
					filter: spec,
					paramValue: getParam(attr.key),
					onChange: (next: string | null) => onChangeParam(attr.key, next),
				};
				switch (attr.filter_input_type) {
					case "checkbox":
						return <CheckboxFilter key={attr.key} {...props} />;
					case "color_swatch":
						return <ColorSwatchFilter key={attr.key} {...props} />;
					case "radio":
						return <RadioFilter key={attr.key} {...props} />;
					case "range":
						return <RangeFilter key={attr.key} {...props} />;
					case "toggle":
						return <ToggleFilter key={attr.key} {...props} />;
					default:
						return null;
				}
			})}
		</>
	);
}
