import {
  List,
  Datagrid,
  TextField,
  NumberField,
  DateField,
  Show,
  SimpleShowLayout,
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  DateInput,
  Create,
  SelectInput,
  ReferenceField,
  ReferenceInput,
  EditButton,
  ShowButton,
} from "react-admin";

// 🔄 Transform function (if you want to upload files later)
const transformDocumentData = async (data) => {
  return { ...data };
};

// 🧾 LIST VIEW
export const DocumentList = () => (
  <List>
    <Datagrid>
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="description" />
      <TextField source="type" />
      <TextField source="documentType" />
      <NumberField source="documentValue" />
      <NumberField source="duration" />
      <TextField source="category" />
      <TextField source="subCategory" />
      <DateField source="date" />
      <DateField source="uploadedAt" />
      <ReferenceField label="User" source="userId" reference="User">
        <TextField source="name" />
      </ReferenceField>
      <>
        <EditButton />
        <ShowButton />
      </>
    </Datagrid>
  </List>
);

// 👁️ SHOW VIEW
export const DocumentShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="title" />
      <TextField source="description" />
      <TextField source="promisor" />
      <TextField source="promisee" />
      <NumberField source="documentValue" />
      <NumberField source="duration" />
      <TextField source="type" />
      <DateField source="date" />
      <TextField source="documentUrl" />
      <TextField source="documentText" />
      <TextField source="documentName" />
      <TextField source="city" />
      <TextField source="state" />
      <TextField source="country" />
      <TextField source="location" />
      <TextField source="documentNumber" />
      <TextField source="documentNumberLabel" />
      <TextField source="documentType" />
      <TextField source="category" />
      <TextField source="subCategory" />
      <NumberField source="categoryConfidence" />
      <TextField source="migrationTestField" />
      <ReferenceField label="User" source="userId" reference="User">
        <TextField source="name" />
      </ReferenceField>
      <DateField source="uploadedAt" />
    </SimpleShowLayout>
  </Show>
);

// ✏️ EDIT VIEW
export const DocumentEdit = () => (
  <Edit transform={transformDocumentData}>
    <SimpleForm>
      <TextInput source="title" />
      <TextInput source="description" />
      <TextInput source="promisor" />
      <TextInput source="promisee" />
      <NumberInput source="documentValue" />
      <NumberInput source="duration" />
      <TextInput source="type" />
      <DateInput source="date" />
      <TextInput source="documentUrl" />
      <TextInput source="documentText" />
      <TextInput source="documentName" />
      <TextInput source="city" />
      <TextInput source="state" />
      <TextInput source="country" />
      <TextInput source="location" />
      <TextInput source="documentNumber" />
      <TextInput source="documentNumberLabel" />
      <SelectInput
        source="documentType"
        choices={[
          { id: "GENERATED", name: "GENERATED" },
          { id: "UPLOADED", name: "UPLOADED" },
        ]}
      />
      <TextInput source="category" />
      <TextInput source="subCategory" />
      <NumberInput source="categoryConfidence" />
      <TextInput source="migrationTestField" />
      <ReferenceInput label="User" source="userId" reference="User">
        <SelectInput optionText="name" optionValue="id" />
      </ReferenceInput>
    </SimpleForm>
  </Edit>
);

// 🆕 CREATE VIEW
export const DocumentCreate = () => (
  <Create transform={transformDocumentData}>
    <SimpleForm>
      <TextInput source="title" />
      <TextInput source="description" />
      <TextInput source="promisor" />
      <TextInput source="promisee" />
      <NumberInput source="documentValue" />
      <NumberInput source="duration" />
      <TextInput source="type" />
      <DateInput source="date" />
      <TextInput source="documentUrl" />
      <TextInput source="documentText" />
      <TextInput source="documentName" />
      <TextInput source="city" />
      <TextInput source="state" />
      <TextInput source="country" />
      <TextInput source="location" />
      <TextInput source="documentNumber" />
      <TextInput source="documentNumberLabel" />
      <SelectInput
        source="documentType"
        choices={[
          { id: "GENERATED", name: "GENERATED" },
          { id: "UPLOADED", name: "UPLOADED" },
        ]}
      />
      <TextInput source="category" />
      <TextInput source="subCategory" />
      <NumberInput source="categoryConfidence" />
      <TextInput source="migrationTestField" />
      <ReferenceInput label="User" source="userId" reference="User">
        <SelectInput optionText="name" optionValue="id" />
      </ReferenceInput>
    </SimpleForm>
  </Create>
);
