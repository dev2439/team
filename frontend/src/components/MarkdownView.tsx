import { renderMarkdown } from "@/lib/markdown";

type MarkdownViewProps = {
  content: string;
  className?: string;
};

export function MarkdownView({ content, className = "" }: MarkdownViewProps) {
  return (
    <div
      className={`markdown-body max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
