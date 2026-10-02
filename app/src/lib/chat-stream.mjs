// The API streams raw text with newline-delimited control records (not SSE data frames).
// Buffer only incomplete records; ordinary prose remains visible immediately.
const markers = ['__STATUS__:', '__CONV_ID__:', '__TOKEN_USAGE__:', '__PAGINATION__:'];
export function createChatStreamParser(onText, onRecord) {
  let pending = '';
  function drain(final = false) {
    while (pending) {
      let index = -1;
      let marker;
      for (const candidate of markers) {
        const found = pending.indexOf(candidate);
        if (found !== -1 && (index === -1 || found < index)) { index = found; marker = candidate; }
      }
      if (index !== -1) {
        if (index) { onText(pending.slice(0, index)); pending = pending.slice(index); }
        const end = pending.indexOf('\n', marker.length);
        if (end === -1 && !final) return;
        const value = pending.slice(marker.length, end === -1 ? undefined : end).trim();
        onRecord(marker.slice(2, -3), value);
        pending = end === -1 ? '' : pending.slice(end + 1);
        continue;
      }
      let hold = 0;
      if (!final) for (const candidate of markers) {
        for (let size = 1; size < candidate.length; size++) {
          if (pending.endsWith(candidate.slice(0, size))) hold = Math.max(hold, size);
        }
      }
      const ready = pending.slice(0, pending.length - hold);
      if (ready) onText(ready);
      pending = hold ? pending.slice(-hold) : '';
      return;
    }
  }
  return { push(chunk) { pending += chunk; drain(); }, finish() { drain(true); } };
}
