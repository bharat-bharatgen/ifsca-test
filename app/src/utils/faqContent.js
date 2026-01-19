import { env } from "@/env.mjs";

const faqContent = [
  {
    title: `Why do I need ${env.NEXT_PUBLIC_APP_NAME}?`,
    description: `${env.NEXT_PUBLIC_APP_NAME} helps businesses identify potential risks in their corporate contracts, enabling them to make informed decisions and mitigate legal liabilities`,
  },
  {
    title: `How can I get started with ${env.NEXT_PUBLIC_APP_NAME}?`,
    description: `To use ${env.NEXT_PUBLIC_APP_NAME}, simply sign up, upload your corporate contracts, and let the platform assess the risks and provide actionable insights.`,
  },
  {
    title: `How does ${env.NEXT_PUBLIC_APP_NAME} assess risks in corporate contracts?`,
    description: `${env.NEXT_PUBLIC_APP_NAME} uses advanced algorithms to analyze contract clauses, identifying potential risks such as ambiguous terms or inadequate legal protections.`,
  },
  {
    title: `What does ${env.NEXT_PUBLIC_APP_NAME} provide after assessing a corporate contract?`,
    description: `After assessment, ${env.NEXT_PUBLIC_APP_NAME} summarizes the contract, highlighting key terms, potential risks, and suggested improvements.`,
  },
  {
    title: `Can ${env.NEXT_PUBLIC_APP_NAME} replace legal advice from a real lawyer?`,
    description: `${env.NEXT_PUBLIC_APP_NAME} provides insights and summaries but cannot replace legal advice. Users can choose to seek assistance from real lawyers for specific legal interpretations and advice.`,
  },
  {
    title: `Is my contract data secure on ${env.NEXT_PUBLIC_APP_NAME}?`,
    description: `${env.NEXT_PUBLIC_APP_NAME} prioritizes data security. Your uploaded contracts are encrypted and stored securely, adhering to industry standards.`,
  },
];

export default faqContent;
