import { TopToolbar, ExportButton } from "react-admin";
import { ImportButton } from "react-admin-import-csv";
import { CreateButton } from "ra-ui-materialui";

export const ListActions = (props) => {
  const { className } = props;
  return (
    <TopToolbar className={className}>
      <CreateButton {...props} />
      <ImportButton {...props} />
      <ExportButton {...props} />
    </TopToolbar>
  );
};
