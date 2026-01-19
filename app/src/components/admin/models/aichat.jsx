import {
  List,
  Datagrid,
  TextField,
  DateField,
  Show,
  SimpleShowLayout,
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  Create,
  ReferenceField,
  ReferenceInput,
  EditButton,
  ShowButton,
} from "react-admin";

// 🔄 (optional) transform function if you later need to upload or modify data before saving
const transformAiChatData = async (data) => {
  return { ...data };
};

// 🧾 LIST VIEW
export const AiChatList = () => (
  <List>
    <Datagrid>
      <TextField source="id" />
      <TextField source="message" />
      <TextField source="sender" />
      <ReferenceField label="User" source="userId" reference="users">
        <TextField source="name" />
      </ReferenceField>
      <ReferenceField label="Document" source="documentId" reference="documents">
        <TextField source="title" />
      </ReferenceField>
      <ReferenceField label="Conversation" source="conversationId" reference="conversations">
        <TextField source="id" />
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

// 👁️ SHOW VIEW
export const AiChatShow = () => (
  <Show>
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="message" />
      <TextField source="sender" />
      <ReferenceField label="User" source="userId" reference="users">
        <TextField source="name" />
      </ReferenceField>
      <ReferenceField label="Document" source="documentId" reference="documents">
        <TextField source="title" />
      </ReferenceField>
      <ReferenceField label="Conversation" source="conversationId" reference="conversations">
        <TextField source="id" />
      </ReferenceField>
      <DateField source="createdAt" />
      <DateField source="updatedAt" />
    </SimpleShowLayout>
  </Show>
);

// ✏️ EDIT VIEW
export const AiChatEdit = () => (
  <Edit transform={transformAiChatData}>
    <SimpleForm>
      <TextInput source="message" />
      <SelectInput
        source="sender"
        choices={[
          { id: "USER", name: "USER" },
          { id: "ASSISTANT", name: "ASSISTANT" },
        ]}
      />
      <ReferenceInput label="User" source="userId" reference="users">
        <SelectInput optionText="name" optionValue="id" />
      </ReferenceInput>
      <ReferenceInput label="Document" source="documentId" reference="documents">
        <SelectInput optionText="title" optionValue="id" />
      </ReferenceInput>
      <ReferenceInput label="Conversation" source="conversationId" reference="conversations">
        <SelectInput optionText="id" optionValue="id" />
      </ReferenceInput>
    </SimpleForm>
  </Edit>
);

// 🆕 CREATE VIEW
export const AiChatCreate = () => (
  <Create transform={transformAiChatData}>
    <SimpleForm>
      <TextInput source="message" />
      <SelectInput
        source="sender"
        choices={[
          { id: "USER", name: "USER" },
          { id: "ASSISTANT", name: "ASSISTANT" },
        ]}
      />
      <ReferenceInput label="User" source="userId" reference="users">
        <SelectInput optionText="name" optionValue="id" />
      </ReferenceInput>
      <ReferenceInput label="Document" source="documentId" reference="documents">
        <SelectInput optionText="title" optionValue="id" />
      </ReferenceInput>
      <ReferenceInput label="Conversation" source="conversationId" reference="conversations">
        <SelectInput optionText="id" optionValue="id" />
      </ReferenceInput>
    </SimpleForm>
  </Create>
);
