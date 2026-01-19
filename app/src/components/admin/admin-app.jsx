"use client";

import { Admin, Resource } from "react-admin";
import simpleRestProvider from "ra-data-simple-rest";
import { UserList, UserShow, UserEdit, UserCreate } from "./models/user";
import { DocumentList, DocumentShow, DocumentEdit, DocumentCreate, } from "./models/document";
import { AiChatList, AiChatShow, AiChatEdit, AiChatCreate } from "./models/aichat";


import authProvider from "./utils/authProvider";

// ✅ Data provider base URL
const dataProvider = simpleRestProvider("/api/v1/usage");

const AdminApp = () => (
  <Admin authProvider={authProvider} dataProvider={dataProvider}>
    <Resource
      name="documents"
      list={DocumentList}
      show={DocumentShow}
      edit={DocumentEdit}
      create={DocumentCreate}
    />
    <Resource
      name="users"
      list={UserList}
      show={UserShow}
      edit={UserEdit}
      create={UserCreate}
    />
    <Resource
      name="aichats"
      list={AiChatList}
      show={AiChatShow}
      edit={AiChatEdit}
      create={AiChatCreate}
    />
  </Admin>
);

export default AdminApp;
