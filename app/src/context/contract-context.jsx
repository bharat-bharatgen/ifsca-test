"use client";
import { createContext, useContext } from "react";

const ContractContext = createContext({});

export function ContractProvider({ children }) {
  return <ContractContext.Provider value={{}}>{children}</ContractContext.Provider>;
}

export function useContract() {
  return useContext(ContractContext);
}
