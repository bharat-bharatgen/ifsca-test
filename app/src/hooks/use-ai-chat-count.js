import useSWR from 'swr';

const fetcher = async (url) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

/**
 * Hook to fetch the count of AI chats (queries) raised by the current user
 * @returns {Object} { count, unresolvedCount, resolvedCount, isLoading, error, refresh }
 */
export const useAiChatCount = () => {
  const { data, isLoading, error, mutate } = useSWR(
    "/api/v1/chat/count",
    fetcher,
    { 
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 0,
      refreshInterval: 0,
    }
  );

  const count = data?.count ?? 0;
  const unresolvedCount = data?.unresolvedCount ?? 0;
  const resolvedCount = data?.resolvedCount ?? 0;

  return {
    count,
    unresolvedCount,
    resolvedCount,
    isLoading,
    error,
    refresh: mutate,
  };
};

