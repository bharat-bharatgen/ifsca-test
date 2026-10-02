import Link from "next/link";
import { ArrowUpRight, FileText, FolderOpen, Search, ArrowUp, Check } from "lucide-react";
import { ThemeToggle } from "@/components/chat/theme-toggle";

function DocumentIllustration() {
  return <div className="landing-preview" aria-label="Illustration of the document workspace">
    <div className="landing-preview-bar"><span className="flex items-center gap-2"><FolderOpen className="size-4" />Document workspace</span><span className="text-muted-foreground">Illustrative preview</span></div>
    <div className="landing-preview-grid">
      <div className="landing-files"><span className="text-xs text-muted-foreground">Documents</span>{["Annual report.pdf", "Operations guide.pdf", "Policy handbook.pdf"].map((name,i) => <div key={name} className={`landing-file ${i===0?"landing-file-selected":""}`}><FileText className="size-4" /><span>{name}</span></div>)}<div className="landing-paper" aria-hidden="true"><div className="landing-paper-title" />{[85,100,92,70,100,95,78].map((width,i)=><div key={i} style={{width:`${width}%`}} />)}<div className="landing-paper-highlight" /><div /></div></div>
      <div className="landing-answer"><span className="text-xs text-muted-foreground">Document assistant</span><div className="landing-question">What are the key priorities in this report?</div><h3>A clear answer, with context.</h3><p>Explore the details in your documents, then follow each source back to the original page.</p><div className="landing-citation"><FileText className="size-4" /><span>Annual report.pdf</span><span className="ml-auto text-xs text-muted-foreground">Page 12</span></div><div className="landing-preview-composer"><span>Ask a follow-up…</span><ArrowUp className="size-4" /></div></div>
    </div>
  </div>;
}
export function WorkspaceLanding() {
  return <div className="landing-page min-h-dvh">
    <header className="landing-container flex items-center justify-between py-6"><Link href="/" className="flex items-center gap-2 font-semibold"><img src="/assets/bharatGen-logo.png" width="150" height="38" alt="BharatGen" className="rounded bg-white p-1" /></Link><div className="flex items-center gap-3"><ThemeToggle /><Link href="/login" className="text-sm hover:underline">Sign in <ArrowUpRight className="inline size-4" /></Link></div></header>
    <main>
      <section className="landing-container landing-hero"><div className="max-w-3xl"><h1>Your documents.<br />A clearer picture.</h1><p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Bring your documents together. Ask questions, explore the details, and trace answers back to their sources.</p><div className="mt-8 flex flex-wrap items-center gap-4"><Link href="/global-chat" className="landing-primary">Open workspace <ArrowUpRight className="size-4" /></Link><Link href="#workspace" className="landing-secondary">Explore the workspace</Link></div></div><DocumentIllustration /></section>
      <section id="workspace" className="landing-container landing-features"><h2>From files to understanding.</h2><div className="landing-feature-rows">{[["01","Bring your documents together","Upload files and keep your document library in one place.",FolderOpen],["02","Find the detail you need","Ask across your library or focus on a single document.",Search],["03","Go straight to the source","Read the original page alongside the answer.",Check]].map(([number,title,description,Icon])=><div key={number} className="landing-feature-row"><span className="text-sm text-muted-foreground">{number}</span><div><h3>{title}</h3><p className="mt-2 text-muted-foreground">{description}</p></div><Icon className="size-5 text-muted-foreground" /></div>)}</div></section>
      <section className="landing-container landing-closing"><h2>Less searching.<br />More understanding.</h2><Link href="/global-chat" className="landing-primary mt-8">Open workspace <ArrowUpRight className="size-4" /></Link></section>
    </main>
    <footer className="landing-container flex flex-wrap items-center justify-between gap-4 border-t py-8 text-sm"><span>BharatGen · Document workspace</span><Link href="/login" className="text-muted-foreground hover:text-foreground">Sign in</Link></footer>
  </div>;
}
