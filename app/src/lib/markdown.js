import Link from "next/link";

// Factory that returns a shared Markdown components object
// Accepts a DOCUMENT_FORMATTING config to control spacing and detection
export function getDocumentMarkdownComponents(DOCUMENT_FORMATTING) {
  return {
    p: ({ children, ...props }) => {
      const text = children?.toString() || '';

      if (text.match(DOCUMENT_FORMATTING.QUOTED_TEXT_PATTERN)) {
        return (
          <p className={DOCUMENT_FORMATTING.DOCUMENT_TITLE_SPACING_CLASS} {...props}>
            {children}
          </p>
        );
      }

      if (text.includes(DOCUMENT_FORMATTING.TOTAL_RESULTS_SUBSTRING)) {
        return (
          <p className={DOCUMENT_FORMATTING.TOTAL_RESULTS_SPACING_CLASS} {...props}>
            {children}
          </p>
        );
      }

      return <p {...props}>{children}</p>;
    },
    a: ({ href, children, ...props }) => {
      // Check if it's an internal document link
      const isDocumentLink = href && href.startsWith('/documents/');
      
      if (isDocumentLink) {
        // Use Next.js Link for internal document links, but open in new tab
        return (
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-bold hover:text-blue-800 cursor-pointer"
            {...props}
          >
            {children}
          </Link>
        );
      }
      
      // External links open in new tab
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline font-bold hover:text-blue-800"
          {...props}
        >
          {children}
        </a>
      );
    },
  };
}


