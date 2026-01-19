import useSWR from 'swr';

const fetcher = async (url) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

export const useDocuments = () => {
  const { data, isLoading, error, mutate } = useSWR(
    "/api/v1/documents",
    fetcher,
    { 
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 0, // Disable deduplication to ensure fresh data
      refreshInterval: 0, // Disable automatic refresh
    }
  );

  const documents = data?.documents ?? [];

  return {
    documents,
    isLoading,
    error,
    refresh: mutate, // Use SWR's built-in mutate function
  };
};

