export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server-side (Node.js runtime)
    const { recoverStuckJobs } = await import('./lib/document-processor-worker');
    
    // Await recovery to complete before server starts accepting requests
    // This ensures jobs are properly marked as FAILED before any new requests come in
    try {
      const result = await recoverStuckJobs();
      console.log('[Instrumentation] Job recovery completed:', result);
    } catch (error) {
      console.error('[Instrumentation] Job recovery failed:', {
        error: error?.message || String(error),
      });
      // Don't throw - allow server to start even if recovery fails
      // Logging the error is sufficient for monitoring
    }
  }
}

