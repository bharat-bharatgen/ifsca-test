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
    <div className="lg:flex">
      <div className="w-full">
        <DateRangeFilter 
          fromDate={fromDate}
          toDate={toDate}
          onDateRangeChange={onDateRangeChange}
        />
      </div>
      <div className="w-full">
      <CustomerNameFilter 
        value={customerName}
        onChange={onCustomerNameChange}
      />
      </div>
    </div>
  );
}
