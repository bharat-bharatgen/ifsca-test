import { CustomerNameFilter } from "./customer-name-filter";
import { DateRangeFilter } from "./date-range-filter";

export function FilterControls({ 
  customerName = "", 
  onCustomerNameChange = () => {},
  fromDate = null,
  toDate = null,
  onDateRangeChange = () => {}
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="min-w-0">
        <DateRangeFilter 
          fromDate={fromDate}
          toDate={toDate}
          onDateRangeChange={onDateRangeChange}
        />
      </div>
      <div className="min-w-0">
      <CustomerNameFilter 
        value={customerName}
        onChange={onCustomerNameChange}
      />
      </div>
    </div>
  );
}
