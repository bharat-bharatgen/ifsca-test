"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DateRangeFilter({ 
  fromDate = null, 
  toDate = null, 
  onDateRangeChange = () => {}, 
  className = "" 
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (range) => {
    if (range?.from) {
      if (range.to) {
        // Both dates selected
        onDateRangeChange(range.from, range.to);
        setIsOpen(false);
      } else {
        // Only from date selected, keep popover open
        onDateRangeChange(range.from, null);
      }
    } else {
      // Clear selection
      onDateRangeChange(null, null);
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    onDateRangeChange(null, null);
    setIsOpen(false);
  };

  const formatDateRange = () => {
    if (!fromDate) return "Select date range";
    
    if (fromDate && toDate) {
      return `${format(fromDate, "MMM dd")} - ${format(toDate, "MMM dd, yyyy")}`;
    }
    
    return `From ${format(fromDate, "MMM dd, yyyy")}`;
  };

  return (
    <div className={cn("relative", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal bg-secondary/30 border-dashed lg:w-auto w-full",
              !fromDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3">
            <Calendar
              mode="range"
              defaultMonth={fromDate}
              selected={{ from: fromDate, to: toDate }}
              onSelect={handleSelect}
              numberOfMonths={2}
              disabled={(date) => date > new Date()}
            />
            <div className="flex justify-between items-center pt-3 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <div className="text-xs text-muted-foreground">
                {fromDate && toDate ? "Range selected" : "Select end date"}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

