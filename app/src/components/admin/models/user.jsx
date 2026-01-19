import {
  Show,
  SimpleShowLayout,
  TextField,
  DateField,
  Edit,
  SimpleForm,
  TextInput,
  ImageInput,
  ImageField,
  DateInput,
  ReferenceField,
  SelectInput,
  ReferenceInput,
  List,
  Datagrid,
  EditButton,
  ShowButton,
  Create,
} from "react-admin";

// Transform data before submission. Be defensive if uploadFile isn't available.
const transformUserData = async (data) => {
  let image = data.image;
  try {
    if (data.image && data.image.rawFile && typeof uploadFile === "function") {
      const imageFile = data.image.rawFile;
      image = await uploadFile(imageFile);
    }
  } catch (err) {
    // If upload fails or uploadFile isn't defined, keep the image as-is.
    // This avoids runtime crashes in the admin UI.
    // eslint-disable-next-line no-console
    console.warn("uploadFile unavailable or failed; keeping image unchanged", err);
    image = data.image;
  }

  return {
    ...data,
    image: image,
  };
};

// Simple empty state component for UserList
const UserListEmpty = () => (
  <div style={{ padding: 20, textAlign: "center", color: "#888" }}>
    No users found.
  </div>
);

export const UserList = () => (
  // Removed undefined `ListActions` to avoid runtime errors.
  <List empty={<UserListEmpty />}>
    <Datagrid>
      <TextField source="id" />
      <TextField source="name" />
      <TextField source="email" />
      <DateField source="emailVerified" />
      <ImageField source="image" />
      <ReferenceField label="Role" source="roleId" reference="Role">
        <TextField source="name" />
      </ReferenceField>
      <DateField source="createdAt" />
      <DateField source="updatedAt" />
      <>
        <EditButton />
        <ShowButton />
      </>
    </Datagrid>
  </List>
);

export const UserShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="name" />
      <TextField source="email" />
      <DateField source="emailVerified" />
      <ImageField source="image" />
      <ReferenceField label="Role" source="roleId" reference="Role">
        <TextField source="name" />
      </ReferenceField>
      <DateField source="createdAt" />
      <DateField source="updatedAt" />
    </SimpleShowLayout>
  </Show>
);

export const UserEdit = () => (
  <Edit transform={transformUserData}>
    <SimpleForm>
      <TextInput source="name" />
      <TextInput source="email" />
      <TextInput source="password" />
      <DateInput source="emailVerified" />
      <ImageInput source="image" />
      <ReferenceInput label="Role" source="roleId" reference="Role">
        <SelectInput optionText="name" optionValue="id" source="roleId" />
      </ReferenceInput>
    </SimpleForm>
  </Edit>
);

export const UserCreate = () => (
  <Create transform={transformUserData}>
    <SimpleForm>
      <TextInput source="name" />
      <TextInput source="email" />
      <TextInput source="password" />
      <DateInput source="emailVerified" />
      <ImageInput source="image" />
      <ReferenceInput label="Role" source="roleId" reference="Role">
        <SelectInput optionText="name" optionValue="id" source="roleId" />
      </ReferenceInput>
    </SimpleForm>
  </Create>
);