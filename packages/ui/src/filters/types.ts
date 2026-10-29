export type FilterInputType =
  | "checkbox"
  | "color_swatch"
  | "radio"
  | "range"
  | "toggle";

export interface FilterValueOption {
  value: string;   // attribute value slug (used as URL token)
  label: string;
  count?: number;
  color_hex?: string | null;
  swatch_image_url?: string | null;
}

export interface AttributeFilter {
  key: string;                          // attribute slug used as URL param name
  name: string;
  filter_input_type: FilterInputType | null;
  values: FilterValueOption[];
  min?: number;                         // for range
  max?: number;                         // for range
}

export interface FilterRendererSpec {
  key: string;
  name: string;
  filter_input_type: FilterInputType;   // non-null by the time a renderer sees it
  values: FilterValueOption[];
  min?: number;
  max?: number;
}

export interface FilterRendererProps {
  filter: FilterRendererSpec;
  paramValue: string | null;
  onChange: (next: string | null) => void;
}
