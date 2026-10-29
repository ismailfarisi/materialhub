"use client";

import { MagnifyingGlass, CalendarIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface SearchConfig {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

interface FilterOption {
  label: string;
  value: string;
}

interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface DateRangeConfig {
  from?: Date;
  to?: Date;
  onChange: (range: DateRange | undefined) => void;
}

interface FiltersBarProps {
  search?: SearchConfig;
  filters?: FilterConfig[];
  dateRange?: DateRangeConfig;
}

export function FiltersBar({ search, filters, dateRange }: FiltersBarProps) {
  const hasDateRange = !!dateRange;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* MagnifyingGlass input */}
      {search && (
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <Input
            placeholder={search.placeholder ?? "MagnifyingGlass..."}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            className="pl-8"
          />
        </div>
      )}

      {/* Funnel selects */}
      {filters?.map((filter) => (
        <Select
          key={filter.key}
          value={filter.value}
          onValueChange={filter.onChange}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All {filter.label}</SelectItem>
            {filter.options.filter((opt) => opt.value && opt.value !== "").map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {/* Date range picker */}
      {hasDateRange && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !dateRange.from && !dateRange.to && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y")} &mdash;{" "}
                    {format(dateRange.to, "LLL dd, y")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange.from}
              selected={{
                from: dateRange.from,
                to: dateRange.to,
              }}
              onSelect={dateRange.onChange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
